const sql = require('mssql');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const databaseService = require('./databaseService');
const emailService = require('./emailService');
const { listTenants, DEFAULT_TENANT } = require('../config/tenants');
const { EMAIL_BASE_URL } = require('../config/email');

const LOTE_POR_TICK = 20; // tope de correos que un solo tick del cron procesa por campaña

// El tenant viaja dentro del JWT del link de baja — sin esto, un contacto de
// una empresa que no sea la default se marcaría de baja en la BD equivocada.
function generarLinkBaja(contactoId, tenantKey = DEFAULT_TENANT) {
  const secret = process.env.JWT_SECRET || 'AKOLATRONIC';
  const token = jwt.sign({ tipo: 'baja_email', contactoId, tenantKey }, secret, { expiresIn: '400d' });
  return `${EMAIL_BASE_URL.replace(/\/$/, '')}/api/email-marketing/baja?token=${encodeURIComponent(token)}`;
}

// Reemplaza {{nombre}}/{{empresa}}/{{correo}} y agrega el link real de baja
// al final del cuerpo — sin este paso el correo no tendría forma de opt-out,
// que es justo el problema que esta migración corrige respecto al origen.
function renderizarParaContacto({ asuntoTpl, htmlTpl, textoTpl }, contacto, tenantKey) {
  const vars = {
    nombre: contacto.nombre || '',
    empresa: contacto.empresa || '',
    correo: contacto.correo || '',
  };
  const reemplazar = (str) => String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');

  const linkBaja = generarLinkBaja(contacto.id, tenantKey);
  const footerHtml = `
    <p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9CA3AF;font-size:11px;">
      Recibiste este correo porque tienes una relación con Ardabytec.
      Si ya no quieres recibir más campañas de correo,
      <a href="${linkBaja}" style="color:#6B7280;">haz clic aquí para darte de baja</a>.
    </p>`;
  const footerTexto = `\n\n---\nSi ya no quieres recibir más campañas de correo, visita: ${linkBaja}`;

  return {
    asunto: reemplazar(asuntoTpl),
    html: reemplazar(htmlTpl) + footerHtml,
    texto: textoTpl ? reemplazar(textoTpl) + footerTexto : undefined,
  };
}

// Arma la lista de contactos destinatarios según el filtro de la campaña.
// CONT_EMAIL_BAJA = 0 se aplica SIEMPRE, sin excepción — es lo que hace que
// el unsubscribe sea real (a diferencia del origen, donde esa exclusión
// existía en la query pero nunca se activaba porque nada marcaba la baja).
// Estatus de caso que cuentan como "abierto" (réplica de seguimientoController).
const CASO_ESTATUS_ABIERTOS = ['pendiente', 'en_proceso', 'en_espera_cliente', 'escalado'];

// Segmentos dinámicos por estado del cliente en el CRM/Atención — cada uno es
// un fragmento SQL que se agrega al `base`. Sirven para dirigir campañas de
// reactivación/retención en vez de un blast a toda la base, y para NO mandar
// promoción a quien tiene un caso abierto.
const SEGMENTOS = {
  // Clientes con al menos un caso de Atención sin resolver.
  'seg-caso-abierto': `AND EXISTS (
      SELECT 1 FROM dbo.CASOS k
      WHERE k.CASO_CONTACTO_ID = CRM_CONTACTOS.CONT_ID AND k.CASO_ACTIVO = 1
        AND k.CASO_ESTATUS IN (${CASO_ESTATUS_ABIERTOS.map((e) => `'${e}'`).join(',')})
    )`,
  // Lo contrario: sin ningún caso abierto — para promociones sin molestar a
  // quien está esperando respuesta a una queja/incidencia.
  'seg-sin-caso-abierto': `AND NOT EXISTS (
      SELECT 1 FROM dbo.CASOS k
      WHERE k.CASO_CONTACTO_ID = CRM_CONTACTOS.CONT_ID AND k.CASO_ACTIVO = 1
        AND k.CASO_ESTATUS IN (${CASO_ESTATUS_ABIERTOS.map((e) => `'${e}'`).join(',')})
    )`,
  // Clientes cuya última evaluación de retención los deja "en riesgo".
  'seg-en-riesgo': `AND (
      SELECT TOP 1 r.AR_ESTATUS FROM dbo.AC_RETENCION r
      WHERE r.AR_CLIENTE_ID = CRM_CONTACTOS.CONT_ID
      ORDER BY r.AR_FECHA_EVALUACION DESC
    ) = 'riesgo'`,
  // Clientes formales sin ninguna interacción, caso ni seguimiento en 90 días.
  'seg-inactivo': `AND CONT_ES_CLIENTE = 1
    AND NOT EXISTS (
      SELECT 1 FROM dbo.CRM_INTERACCIONES i
      JOIN dbo.CRM_OPORTUNIDADES o ON o.OPO_ID = i.INT_OPO_ID
      WHERE o.OPO_CONTACTO_ID = CRM_CONTACTOS.CONT_ID AND i.INT_FECHA >= DATEADD(DAY, -90, GETDATE())
    )
    AND NOT EXISTS (
      SELECT 1 FROM dbo.CASOS k
      WHERE k.CASO_CONTACTO_ID = CRM_CONTACTOS.CONT_ID AND k.CASO_FECHA_CREACION >= DATEADD(DAY, -90, GETDATE())
    )
    AND NOT EXISTS (
      SELECT 1 FROM dbo.CLI_SEGUIMIENTOS s
      WHERE s.SEG_CONTACTO_ID = CRM_CONTACTOS.CONT_ID AND s.SEG_FECHA >= DATEADD(DAY, -90, GETDATE())
    )`,
};

const FILTROS_VALIDOS = ['todos', 'tag', 'manual', ...Object.keys(SEGMENTOS)];

async function resolverDestinatarios(pool, campania) {
  const base = `
    SELECT CONT_ID as id, CONT_NOMBRE as nombre, CONT_EMPRESA as empresa, CONT_CORREO as correo
    FROM dbo.CRM_CONTACTOS
    WHERE CONT_ACTIVO = 1 AND CONT_EMAIL_BAJA = 0
      AND CONT_CORREO IS NOT NULL AND CONT_CORREO <> ''
  `;

  if (campania.filtro === 'tag' && campania.filtroTag) {
    const r = await pool.request()
      .input('tag', sql.NVarChar(100), `%${campania.filtroTag}%`)
      .query(`${base} AND CONT_TAGS LIKE @tag`);
    return r.recordset;
  }

  if (campania.filtro === 'manual') {
    let ids = [];
    try { ids = JSON.parse(campania.contactosIds || '[]'); } catch { ids = []; }
    ids = ids.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return [];
    const r = await pool.request().query(`${base} AND CONT_ID IN (${ids.join(',')})`);
    return r.recordset;
  }

  if (SEGMENTOS[campania.filtro]) {
    const r = await pool.request().query(`${base} ${SEGMENTOS[campania.filtro]}`);
    return r.recordset;
  }

  const r = await pool.request().query(base);
  return r.recordset;
}

// Crea las filas EMAIL_ENVIOS pendientes para una campaña (idempotente — no
// duplica si ya se llamó antes) y la marca 'enviando'. El envío real ocurre
// en el cron de abajo, no aquí, para poder respetar el límite por hora.
async function iniciarEnvio(campaniaId, tenantKey = DEFAULT_TENANT) {
  const pool = await databaseService.getPool(tenantKey);

  const rCampania = await pool.request()
    .input('id', sql.Int, campaniaId)
    .query(`
      SELECT ECA_ID as id, ECA_FILTRO as filtro, ECA_FILTRO_TAG as filtroTag, ECA_CONTACTOS_IDS as contactosIds
      FROM dbo.EMAIL_CAMPANIAS WHERE ECA_ID = @id
    `);
  const campania = rCampania.recordset[0];
  if (!campania) throw new Error('Campaña no encontrada');

  const destinatarios = await resolverDestinatarios(pool, campania);

  for (const c of destinatarios) {
    await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .input('contactoId', sql.Int, c.id)
      .input('correo', sql.NVarChar(200), c.correo)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.EMAIL_ENVIOS WHERE EEN_CAMPANIA_ID = @campaniaId AND EEN_CONTACTO_ID = @contactoId)
          INSERT INTO dbo.EMAIL_ENVIOS (EEN_CAMPANIA_ID, EEN_CONTACTO_ID, EEN_CORREO)
          VALUES (@campaniaId, @contactoId, @correo)
      `);
  }

  await pool.request()
    .input('id', sql.Int, campaniaId)
    .query(`UPDATE dbo.EMAIL_CAMPANIAS SET ECA_ESTADO = 'enviando', ECA_FECHA_INICIO = ISNULL(ECA_FECHA_INICIO, GETDATE()) WHERE ECA_ID = @id`);

  return { destinatarios: destinatarios.length };
}

async function pausarEnvio(campaniaId, tenantKey = DEFAULT_TENANT) {
  const pool = await databaseService.getPool(tenantKey);
  await pool.request().input('id', sql.Int, campaniaId)
    .query(`UPDATE dbo.EMAIL_CAMPANIAS SET ECA_ESTADO = 'pausada' WHERE ECA_ID = @id AND ECA_ESTADO = 'enviando'`);
}

async function cancelarEnvio(campaniaId, tenantKey = DEFAULT_TENANT) {
  const pool = await databaseService.getPool(tenantKey);
  await pool.request().input('id', sql.Int, campaniaId)
    .query(`UPDATE dbo.EMAIL_CAMPANIAS SET ECA_ESTADO = 'cancelada', ECA_FECHA_FIN = GETDATE() WHERE ECA_ID = @id AND ECA_ESTADO IN ('enviando','pausada')`);
}

async function reanudarEnvio(campaniaId, tenantKey = DEFAULT_TENANT) {
  const pool = await databaseService.getPool(tenantKey);
  await pool.request().input('id', sql.Int, campaniaId)
    .query(`UPDATE dbo.EMAIL_CAMPANIAS SET ECA_ESTADO = 'enviando' WHERE ECA_ID = @id AND ECA_ESTADO = 'pausada'`);
}

// Envía hasta LOTE_POR_TICK correos pendientes de una campaña, respetando el
// límite configurado de correos por hora — calculado contra envíos YA
// confirmados en EMAIL_ENVIOS, no un contador teórico de lote/tiempo como
// hacía el origen. Si la campaña ya no está 'enviando' (se pausó/canceló
// entre ticks), no procesa nada — esto es lo que hace la pausa real.
async function procesarCampaniaUnTick(pool, campania, tenantKey) {
  const enUltimaHora = await pool.request()
    .input('id', sql.Int, campania.id)
    .query(`
      SELECT COUNT(*) as total FROM dbo.EMAIL_ENVIOS
      WHERE EEN_CAMPANIA_ID = @id AND EEN_ESTADO = 'enviado' AND EEN_FECHA_ENVIO > DATEADD(HOUR, -1, GETDATE())
    `);
  const yaEnviados = enUltimaHora.recordset[0].total;
  const cupo = Math.max(0, campania.emailsPorHora - yaEnviados);
  if (cupo === 0) return;

  const tomar = Math.min(cupo, LOTE_POR_TICK);
  const pendientes = await pool.request()
    .input('id', sql.Int, campania.id)
    .input('top', sql.Int, tomar)
    .query(`
      SELECT TOP (@top) een.EEN_ID as id, een.EEN_CORREO as correo, cont.CONT_ID as contactoId,
        cont.CONT_NOMBRE as nombre, cont.CONT_EMPRESA as empresa, cont.CONT_CORREO as correoActual,
        cont.CONT_EMAIL_BAJA as baja
      FROM dbo.EMAIL_ENVIOS een
      JOIN dbo.CRM_CONTACTOS cont ON cont.CONT_ID = een.EEN_CONTACTO_ID
      WHERE een.EEN_CAMPANIA_ID = @id AND een.EEN_ESTADO = 'pendiente' AND een.EEN_INTENTOS < 3
      ORDER BY een.EEN_ID ASC
    `);
  if (pendientes.recordset.length === 0) {
    // Nada pendiente: si tampoco hay fallidos reintentables, la campaña terminó.
    const restantes = await pool.request().input('id', sql.Int, campania.id)
      .query(`SELECT COUNT(*) as total FROM dbo.EMAIL_ENVIOS WHERE EEN_CAMPANIA_ID = @id AND EEN_ESTADO = 'pendiente'`);
    if (restantes.recordset[0].total === 0) {
      await pool.request().input('id', sql.Int, campania.id)
        .query(`UPDATE dbo.EMAIL_CAMPANIAS SET ECA_ESTADO = 'completada', ECA_FECHA_FIN = GETDATE() WHERE ECA_ID = @id AND ECA_ESTADO = 'enviando'`);
    }
    return;
  }

  const plantilla = await pool.request().input('id', sql.Int, campania.plantillaId)
    .query(`SELECT EPL_ASUNTO as asunto, EPL_CUERPO_HTML as html, EPL_CUERPO_TEXTO as texto FROM dbo.EMAIL_PLANTILLAS WHERE EPL_ID = @id`);
  const tpl = plantilla.recordset[0];
  if (!tpl) return;

  for (const envio of pendientes.recordset) {
    // Si se dio de baja justo entre que se encoló y este tick, se respeta y se omite.
    if (envio.baja) {
      await pool.request().input('id', sql.Int, envio.id)
        .query(`UPDATE dbo.EMAIL_ENVIOS SET EEN_ESTADO = 'omitido_baja' WHERE EEN_ID = @id`);
      continue;
    }

    const contenido = renderizarParaContacto(
      { asuntoTpl: tpl.asunto, htmlTpl: tpl.html, textoTpl: tpl.texto },
      { id: envio.contactoId, nombre: envio.nombre, empresa: envio.empresa, correo: envio.correoActual },
      tenantKey,
    );

    const resultado = await emailService.sendCorreoGenerico({
      to: envio.correoActual,
      subject: contenido.asunto,
      html: contenido.html,
      text: contenido.texto,
    });

    if (resultado.success) {
      await pool.request().input('id', sql.Int, envio.id)
        .query(`UPDATE dbo.EMAIL_ENVIOS SET EEN_ESTADO = 'enviado', EEN_FECHA_ENVIO = GETDATE() WHERE EEN_ID = @id`);
    } else {
      await pool.request()
        .input('id', sql.Int, envio.id)
        .input('err', sql.NVarChar(500), String(resultado.message || '').slice(0, 500))
        .query(`
          UPDATE dbo.EMAIL_ENVIOS
          SET EEN_INTENTOS = EEN_INTENTOS + 1, EEN_ERROR = @err,
              EEN_ESTADO = CASE WHEN EEN_INTENTOS + 1 >= 3 THEN 'fallido' ELSE 'pendiente' END
          WHERE EEN_ID = @id
        `);
    }
  }
}

// Recorre todos los tenants registrados — igual que el resto de crons de
// AGYDA — para que cada empresa procese únicamente sus propias campañas.
async function tickCron() {
  for (const { key } of listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      const campanias = await pool.request().query(`
        SELECT ECA_ID as id, ECA_PLANTILLA_ID as plantillaId, ECA_EMAILS_POR_HORA as emailsPorHora
        FROM dbo.EMAIL_CAMPANIAS WHERE ECA_ESTADO = 'enviando'
      `);
      for (const campania of campanias.recordset) {
        // Relee el estado real antes de procesar por si cambió justo antes de este tick.
        const actual = await pool.request().input('id', sql.Int, campania.id)
          .query(`SELECT ECA_ESTADO as estado FROM dbo.EMAIL_CAMPANIAS WHERE ECA_ID = @id`);
        if (actual.recordset[0]?.estado !== 'enviando') continue;
        await procesarCampaniaUnTick(pool, campania, key);
      }
    } catch (err) {
      console.error(`Error en tick de envío de email marketing (tenant=${key}):`, err.message);
    }
  }
}

cron.schedule('* * * * *', tickCron, { timezone: 'America/Mexico_City' });

module.exports = {
  resolverDestinatarios,
  iniciarEnvio,
  pausarEnvio,
  cancelarEnvio,
  reanudarEnvio,
  generarLinkBaja,
  FILTROS_VALIDOS,
  SEGMENTOS_KEYS: Object.keys(SEGMENTOS),
};
