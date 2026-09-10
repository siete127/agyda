const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');

const GIROS = {
  tecnologia: 'Tecnología / IT',
  comercio: 'Comercio / Retail',
  manufactura: 'Manufactura',
  servicios: 'Servicios Profesionales',
  otro: 'Otro',
};

const REQUERIMIENTOS = {
  soporte: 'Soporte Técnico',
  infraestructura: 'Infraestructura IT',
  ciberseguridad: 'Ciberseguridad',
  desarrollo: 'Desarrollo de Software',
  consultoria: 'Consultoría IT',
};

const COMO_SE_ENTERO = {
  redes: 'Redes Sociales',
  recomendacion: 'Recomendación',
  busqueda: 'Búsqueda en Google',
  aliado: 'A través de un Aliado',
};

// Etapas de oportunidad que cuentan como "abierta" — si el contacto ya tiene una
// abierta con origen chatbot/web, no se crea otra; se agrega una interacción.
const OPO_ETAPAS_ABIERTAS = ['prospecto', 'contactado', 'propuesta', 'negociacion'];

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

// Busca un contacto ya existente por correo (case-insensitive) o por teléfono
// (comparando solo dígitos). Devuelve null si no hay match.
async function buscarContactoExistente(pool, { correo, telefono }) {
  const correoNorm = String(correo || '').trim().toLowerCase();
  const telNorm = soloDigitos(telefono);
  if (!correoNorm && telNorm.length < 7) return null;

  const r = await pool.request()
    .input('correo', sql.NVarChar(200), correoNorm)
    .input('tel', sql.NVarChar(30), telNorm)
    .query(`
      SELECT TOP 1 CONT_ID as id, CONT_ES_CLIENTE as esCliente, CONT_RESPONSABLE_ID as responsableId,
             CONT_EMPRESA as empresa, CONT_CARGO as cargo, CONT_TELEFONO as telefono, CONT_CORREO as correo
      FROM CRM_CONTACTOS
      WHERE CONT_ACTIVO = 1 AND (
        (@correo <> '' AND LOWER(LTRIM(RTRIM(CONT_CORREO))) = @correo) OR
        (LEN(@tel) >= 7 AND REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(CONT_TELEFONO,''),' ',''),'-',''),'(',''),')','') LIKE '%' + @tel + '%')
      )
      ORDER BY CONT_ID
    `);
  return r.recordset[0] || null;
}

// Oportunidad abierta del contacto con origen chatbot/web (por el tag).
async function buscarOportunidadAbierta(pool, contactoId) {
  const r = await pool.request()
    .input('id', sql.Int, contactoId)
    .query(`
      SELECT TOP 1 OPO_ID as id, OPO_NOMBRE as nombre
      FROM CRM_OPORTUNIDADES
      WHERE OPO_CONTACTO_ID = @id AND OPO_ACTIVO = 1
        AND OPO_ETAPA IN (${OPO_ETAPAS_ABIERTAS.map((e) => `'${e}'`).join(',')})
        AND (OPO_TAGS LIKE '%chatbot-web%' OR OPO_TAGS LIKE '%web%')
      ORDER BY OPO_FECHA DESC
    `);
  return r.recordset[0] || null;
}

async function agregarInteraccion(pool, opoId, tipo, contenido) {
  await pool.request()
    .input('opoId', sql.Int, opoId)
    .input('tipo', sql.NVarChar(50), tipo)
    .input('contenido', sql.NVarChar(sql.MAX), contenido)
    .query(`INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO) VALUES (@opoId, @tipo, @contenido)`);
}

/**
 * Procesa un lead entrante (formulario web o chatbot) deduplicando contra
 * CRM_CONTACTOS. El contacto SIEMPRE se registra o actualiza; la oportunidad
 * solo se crea si `generaOportunidad` y el contacto no tiene ya una abierta.
 *
 * @returns { contId, opoId|null, duplicado, creoOportunidad }
 */
async function procesarLead(pool, {
  tenantKey, origen, // 'web' | 'chatbot'
  nombre, correo, telefono, empresa, cargo,
  notasContacto, nombreOpo, notasOpo, tagOpo,
  interesLabel, generaOportunidad,
  interaccionCreacion, transcripcion,
}) {
  const correoT = String(correo || '').trim().slice(0, 200);
  const telT = String(telefono || '').trim().slice(0, 30);

  const existente = await buscarContactoExistente(pool, { correo: correoT, telefono: telT });
  const hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });

  let contId;
  let duplicado = false;

  if (existente) {
    duplicado = true;
    contId = existente.id;
    // Rellena campos vacíos + deja rastro de que volvió.
    await pool.request()
      .input('id', sql.Int, contId)
      .input('empresa', sql.NVarChar(200), String(empresa || '').trim().slice(0, 200) || null)
      .input('cargo', sql.NVarChar(100), String(cargo || '').trim().slice(0, 100) || null)
      .input('tel', sql.NVarChar(30), telT || null)
      .input('nota', sql.NVarChar(500), `[${origen} ${hoy}] volvió: ${interesLabel || 'consulta'}`)
      .query(`
        UPDATE CRM_CONTACTOS SET
          CONT_EMPRESA  = CASE WHEN ISNULL(CONT_EMPRESA,'')  = '' THEN @empresa ELSE CONT_EMPRESA  END,
          CONT_CARGO    = CASE WHEN ISNULL(CONT_CARGO,'')    = '' THEN @cargo   ELSE CONT_CARGO    END,
          CONT_TELEFONO = CASE WHEN ISNULL(CONT_TELEFONO,'') = '' THEN @tel     ELSE CONT_TELEFONO END,
          CONT_NOTAS    = LEFT(ISNULL(CONT_NOTAS,'') + CHAR(13) + @nota, 4000)
        WHERE CONT_ID = @id
      `);
  } else {
    const ins = await pool.request()
      .input('nombre', sql.NVarChar(200), String(nombre || '').trim().slice(0, 200))
      .input('empresa', sql.NVarChar(200), String(empresa || '').trim().slice(0, 200))
      .input('correo', sql.NVarChar(200), correoT)
      .input('telefono', sql.NVarChar(30), telT)
      .input('cargo', sql.NVarChar(100), String(cargo || '').trim().slice(0, 100))
      .input('notas', sql.NVarChar(sql.MAX), notasContacto || '')
      .query(`
        INSERT INTO CRM_CONTACTOS (CONT_NOMBRE, CONT_EMPRESA, CONT_CORREO, CONT_TELEFONO, CONT_CARGO, CONT_NOTAS)
        OUTPUT INSERTED.CONT_ID
        VALUES (@nombre, @empresa, @correo, @telefono, @cargo, @notas)
      `);
    contId = ins.recordset[0].CONT_ID;
  }

  let opoId = null;
  let creoOportunidad = false;

  if (generaOportunidad) {
    const oppAbierta = duplicado ? await buscarOportunidadAbierta(pool, contId) : null;
    if (oppAbierta) {
      opoId = oppAbierta.id;
      await agregarInteraccion(pool, opoId, 'nota',
        `Volvió por el ${origen}: ${interesLabel || 'sin especificar'}` + (transcripcion ? `\n\n${transcripcion}` : ''));
    } else {
      const insOpo = await pool.request()
        .input('nombre', sql.NVarChar(200), String(nombreOpo || 'Requerimiento').slice(0, 200))
        .input('contId', sql.Int, contId)
        .input('notasOpo', sql.NVarChar(sql.MAX), notasOpo || '')
        .input('tags', sql.NVarChar(500), tagOpo || null)
        .query(`
          INSERT INTO CRM_OPORTUNIDADES (OPO_NOMBRE, OPO_CONTACTO_ID, OPO_ETAPA, OPO_NOTAS, OPO_TAGS)
          OUTPUT INSERTED.OPO_ID
          VALUES (@nombre, @contId, 'prospecto', @notasOpo, @tags)
        `);
      opoId = insOpo.recordset[0].OPO_ID;
      creoOportunidad = true;
      await agregarInteraccion(pool, opoId, 'creacion', interaccionCreacion || `Lead desde ${origen}`);
      if (transcripcion) await agregarInteraccion(pool, opoId, 'chatbot', transcripcion);
    }
  }

  // Aviso al ejecutivo si el contacto ya era cliente formal.
  if (existente && existente.esCliente && existente.responsableId) {
    try {
      await notificationService.createNotification({
        usuarioId: existente.responsableId,
        mensaje: `Un cliente tuyo escribió por el ${origen}: ${interesLabel || 'consulta'}`,
        tipo: 'cliente-contacto-web',
        dataExtra: { contactoId: contId, opoId },
        tenantKey,
        dedupeKey: `cliente-contacto-web:${contId}:${hoy}`,
      });
    } catch (e) {
      console.warn('Notificación de cliente-contacto-web falló:', e.message);
    }
  }

  return { contId, opoId, duplicado, creoOportunidad };
}

exports.recibirLeadMarketing = async (req, res) => {
  try {
    const {
      nombreCompleto, puesto, empresa, giroEmpresa,
      email, telefono, tipoRequerimiento, mensaje,
      comoSeEntero, ubicacion,
    } = req.body || {};

    if (!nombreCompleto || (!email && !telefono)) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y al menos un contacto (email o teléfono) son requeridos.' });
    }

    const giroLabel = GIROS[giroEmpresa] || giroEmpresa || '';
    const requeLabel = REQUERIMIENTOS[tipoRequerimiento] || tipoRequerimiento || '';
    const comoLabel = COMO_SE_ENTERO[comoSeEntero] || comoSeEntero || '';

    const notasContacto = [
      giroLabel ? `Giro: ${giroLabel}` : '',
      ubicacion ? `Ubicación: ${ubicacion}` : '',
      comoLabel ? `¿Cómo nos conoció? ${comoLabel}` : '',
      mensaje ? `Mensaje: ${mensaje}` : '',
    ].filter(Boolean).join('\n');

    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await procesarLead(pool, {
      tenantKey: req.user?.empresa,
      origen: 'formulario web',
      nombre: nombreCompleto, correo: email, telefono, empresa, cargo: puesto,
      notasContacto,
      nombreOpo: `[Web] ${requeLabel || 'Requerimiento'} — ${empresa || nombreCompleto}`,
      notasOpo: mensaje || '',
      tagOpo: 'web',
      interesLabel: requeLabel,
      generaOportunidad: true, // el formulario de contacto es siempre una solicitud de servicio
      interaccionCreacion: 'Lead desde el formulario web',
    });

    res.json({ ok: true, contId: r.contId, opoId: r.opoId, duplicado: r.duplicado, creoOportunidad: r.creoOportunidad });
  } catch (e) {
    console.error('Error recibirLeadMarketing:', e);
    res.status(500).json({ ok: false, mensaje: 'Error interno al guardar el lead.' });
  }
};

// POST /api/crm/lead-chatbot — captura del "Asistente ARDABYTEC" en la página
// de marketing. Deduplica contra CRM_CONTACTOS; la oportunidad solo se crea si
// `generaOportunidad` viene true (Fase 2: lo decide el camino del flujo; hoy
// llega true por defecto para conservar el comportamiento).
exports.recibirLeadChatbot = async (req, res) => {
  try {
    const { nombre, email, telefono, interes, empresa, cargo, presupuesto, resumen } = req.body || {};

    if (!nombre || (!email && !telefono)) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y al menos un contacto (email o teléfono) son requeridos.' });
    }

    // Señal comercial: el widget lo manda explícito (Fase 2). Fallback: si dio
    // un presupuesto numérico, es oportunidad; si no, por ahora también (para no
    // regresar en captura hasta que el flujo esté ramificado).
    const generaOportunidad = req.body.generaOportunidad === true
      || req.body.generaOportunidad === 'true'
      || (req.body.generaOportunidad == null && true);

    const notasContacto = [
      '[chatbot-web]',
      interes ? `Interés: ${interes}` : '',
      presupuesto != null && presupuesto !== '' ? `Presupuesto: ${presupuesto}` : '',
      resumen ? `Resumen de la conversación:\n${resumen}` : '',
    ].filter(Boolean).join('\n');

    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await procesarLead(pool, {
      tenantKey: req.user?.empresa,
      origen: 'chatbot',
      nombre, correo: email, telefono, empresa, cargo,
      notasContacto,
      nombreOpo: `[Chatbot] ${interes || 'Requerimiento'} — ${empresa || nombre}`,
      notasOpo: resumen || '',
      tagOpo: 'chatbot-web',
      interesLabel: interes,
      generaOportunidad,
      interaccionCreacion: 'Lead desde chatbot web',
      transcripcion: resumen ? `Transcripción del Chatbot:\n${resumen}` : null,
    });

    res.json({ ok: true, contId: r.contId, opoId: r.opoId, duplicado: r.duplicado, creoOportunidad: r.creoOportunidad });
  } catch (e) {
    console.error('Error recibirLeadChatbot:', e);
    res.status(500).json({ ok: false, mensaje: 'Error interno al guardar el lead.' });
  }
};
