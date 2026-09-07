// Rutas PÚBLICAS (sin auth) para el widget de chat de la página web
// (ardabytec.com, index.html) — antes vivían en livechatController.js sobre
// el motor LIVECHAT_*; ahora usan el mismo esquema CCO_* que WhatsApp/
// Messenger/Instagram, para que el agente atienda los 4 canales desde una
// sola bandeja (ContactCenterPage) y toda la configuración (campañas, skills,
// agentes, tipificaciones, SLA) viva únicamente en Omnicanal.
//
// El HTML del widget NO se tocó: sigue llamando exactamente a estas mismas
// rutas (/api/livechat/conversaciones, .../cola, .../mensajes, .../calificar)
// y escuchando los mismos eventos de socket (receive_livechat_message,
// livechat:conversacion_tomada, livechat:conversacion_cerrada,
// livechat:pendiente_calificacion) en la sala `livechat:{id}` — aquí solo
// cambia qué backend/tablas responden. El ruteo a agente, el mensaje de
// bienvenida y el emit a la sala 'cc:interaccion:{id}' (bandeja del agente)
// ya los hace ccRoutingService.rutearInteraccion; aquí solo se agrega el
// espejo hacia 'livechat:{id}' (sala que escucha el visitante).
//
// Puede haber varios canales CN_TIPO='web_publica' (uno por campaña/sección
// del sitio, cada uno con su propio CN_VERIFY_TOKEN) — el widget manda ese
// token como 'campaignToken' en el body de /conversaciones, igual que hacía
// con LIVECHAT_CAMPANIAS.LCA_TOKEN en el motor viejo. Sin token (el HTML
// público actual no lo manda), se usa el primer canal web_publica habilitado
// como default — así el widget de hoy sigue funcionando sin cambios.
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const ccRouting = require('../services/ccRoutingService');
const socketService = require('../services/socketService');
const { DEFAULT_TENANT } = require('../config/tenants');

const SELECT_INT = `
  SELECT i.CI_ID as id, i.CI_ESTADO as estado, i.CI_CLIENTE_NOMBRE as visitanteNombre,
         i.CI_AGENTE_NOMBRE as agenteNombre, i.CI_FECHA_INICIO as fechaInicio,
         i.CI_CANAL_ID as canalId, i.CI_CAMPANIA_ID as campaniaId, i.CI_GRUPO_ID as grupoId,
         i.CI_TICKET as ticket, i.CI_RATING as rating
  FROM dbo.CCO_INTERACCIONES i
`;
const SELECT_MSG = `
  SELECT m.MG_ID as id, m.MG_CONTENIDO as contenido, m.MG_EMISOR as emisor, m.MG_FECHA as fecha
  FROM dbo.CCO_MENSAJES m
`;
const MSG_SIN_AGENTES_DEFAULT = 'En este momento no hay agentes disponibles. En breve te atenderemos.';
const MSG_EN_COLA_DEFAULT = 'Estás en la fila de espera, en breve te atenderemos.';

function tenantKeyDe(req) {
  return (req.user?.empresa || DEFAULT_TENANT).toLowerCase();
}

async function getCanalWebPublica(pool, campaignToken) {
  const token = (campaignToken || '').trim();
  if (token) {
    const porToken = await pool.request().input('t', sql.NVarChar(100), token)
      .query(`SELECT TOP 1 * FROM dbo.CCO_CANALES WHERE CN_TIPO = 'web_publica' AND CN_HABILITADO = 1 AND CN_VERIFY_TOKEN = @t`);
    if (porToken.recordset[0]) return porToken.recordset[0];
    // Token desconocido o de un canal deshabilitado: no hay fallback silencioso
    // a "cualquier canal" — el llamador decide qué hacer (hoy: 404).
    return null;
  }
  const r = await pool.request().query(`SELECT TOP 1 * FROM dbo.CCO_CANALES WHERE CN_TIPO = 'web_publica' AND CN_HABILITADO = 1 ORDER BY CN_ID`);
  return r.recordset[0] || null;
}

// Portado tal cual de livechatController.obtenerOCrearOportunidadLivechat:
// si el visitante deja email o teléfono, busca un CRM_CONTACTOS existente
// (mismo prospecto que ya escribió por Chatbot, formulario web, u otro chat
// previo); si no hay coincidencia, crea contacto + oportunidad nuevos,
// etiquetados 'livechat-web'. Devuelve el OPO_ID en ambos casos, o null si
// no hay ni email ni teléfono con qué identificar al visitante.
async function obtenerOCrearOportunidadCc(pool, { nombre, email, telefono, motivo }) {
  const emailNorm = (email || '').trim();
  const telNorm = (telefono || '').trim();
  if (!emailNorm && !telNorm) return null;

  const existente = await pool.request()
    .input('email', sql.NVarChar(200), emailNorm).input('telefono', sql.NVarChar(30), telNorm)
    .query(`
      SELECT TOP 1 o.OPO_ID as opoId
      FROM dbo.CRM_OPORTUNIDADES o
      JOIN dbo.CRM_CONTACTOS c ON c.CONT_ID = o.OPO_CONTACTO_ID
      WHERE o.OPO_ACTIVO = 1
        AND ((@email <> '' AND c.CONT_CORREO = @email) OR (@telefono <> '' AND c.CONT_TELEFONO = @telefono))
      ORDER BY o.OPO_FECHA DESC
    `);
  if (existente.recordset[0]) return existente.recordset[0].opoId;

  const rCont = await pool.request()
    .input('nombre', sql.NVarChar(200), (nombre || 'Visitante web').trim().slice(0, 200))
    .input('correo', sql.NVarChar(200), emailNorm.slice(0, 200)).input('telefono', sql.NVarChar(30), telNorm.slice(0, 30))
    .input('notas', sql.NVarChar(sql.MAX), '[livechat-web]')
    .query(`INSERT INTO CRM_CONTACTOS (CONT_NOMBRE, CONT_CORREO, CONT_TELEFONO, CONT_NOTAS)
            OUTPUT INSERTED.CONT_ID VALUES (@nombre, @correo, @telefono, @notas)`);
  const contId = rCont.recordset[0].CONT_ID;

  const nombreOpo = `[Chat en Vivo] ${motivo || 'Consulta'} — ${nombre || 'Visitante web'}`;
  const rOpo = await pool.request()
    .input('nombre', sql.NVarChar(200), nombreOpo.slice(0, 200)).input('contId', sql.Int, contId)
    .input('tags', sql.NVarChar(200), 'livechat-web')
    .query(`INSERT INTO CRM_OPORTUNIDADES (OPO_NOMBRE, OPO_CONTACTO_ID, OPO_ETAPA, OPO_TAGS)
            OUTPUT INSERTED.OPO_ID VALUES (@nombre, @contId, 'prospecto', @tags)`);
  const opoId = rOpo.recordset[0].OPO_ID;

  await pool.request().input('opoId', sql.Int, opoId).input('contenido', sql.NVarChar(500), 'Lead desde Chat en Vivo')
    .query(`INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO) VALUES (@opoId, 'creacion', @contenido)`);

  return opoId;
}

// Portado de livechatController.guardarTranscripcionEnCrm — se llama al
// cerrar (ccInteraccionesController.cerrar), no al calificar: aquí el cierre
// ya es definitivo desde que el agente lo hace, no espera al rating.
async function guardarTranscripcionEnCrm(pool, interaccionId, opoId) {
  if (!opoId) return;
  try {
    const mensajes = await pool.request().input('id', sql.Int, interaccionId)
      .query(`${SELECT_MSG} WHERE MG_INTERACCION_ID = @id ORDER BY MG_FECHA ASC`);
    if (mensajes.recordset.length === 0) return;

    const ROTULOS = { cliente: 'Visitante', agente: 'Agente', sistema: 'Sistema' };
    const transcripcion = mensajes.recordset.map((m) => `${ROTULOS[m.emisor] || m.emisor}: ${m.contenido}`).join('\n');

    await pool.request().input('opoId', sql.Int, opoId)
      .input('contenido', sql.NVarChar(sql.MAX), `Transcripción del Chat en Vivo:\n${transcripcion}`)
      .query(`INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO) VALUES (@opoId, 'livechat', @contenido)`);
  } catch (e) {
    console.warn('⚠️ No se pudo guardar transcripción de Chat en Vivo en CRM:', e?.message || e);
  }
}
// Se re-exporta para que ccInteraccionesController.cerrar pueda invocarla
// justo antes de responder, solo para interacciones CI_TIPO='web_publica'.
exports.guardarTranscripcionEnCrm = guardarTranscripcionEnCrm;

function isFueraDeHorario(config) {
  if (!config?.CF_HORARIO_INICIO || !config?.CF_HORARIO_FIN) return false;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const DIA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dias = (config.CF_DIAS_SEMANA || '1,2,3,4,5').split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !Number.isNaN(d));
  const hhmm = `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  const fueraDia = dias.length > 0 && !dias.includes(DIA[p.weekday]);
  const fueraHora = hhmm < config.CF_HORARIO_INICIO || hhmm > config.CF_HORARIO_FIN;
  return fueraDia || fueraHora;
}

// Emite al visitante (sala 'livechat:{id}', el mismo nombre/evento que ya
// escucha el widget) en paralelo al insert+emit de agente que hace
// ccRouting.insertarMensajeSistema.
async function insertarMensajeSistemaConWidget(pool, tenantKey, interaccionId, contenido) {
  await ccRouting.insertarMensajeSistema(pool, interaccionId, contenido, tenantKey);
  try {
    socketService.getIO().to(`livechat:${interaccionId}`).emit('receive_livechat_message', {
      conversacionId: Number(interaccionId), emisor: 'sistema', contenido,
    });
  } catch (e) {
    console.warn('[ccWebPublica] emit sistema al widget falló:', e?.message || e);
  }
}

// POST /api/livechat/conversaciones — el widget inicia su chat.
exports.iniciarConversacion = async (req, res) => {
  try {
    const { nombre, email, telefono, motivo, campaignToken } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const tenantKey = tenantKeyDe(req);

    const canal = await getCanalWebPublica(pool, campaignToken);
    if (!canal) {
      return res.status(campaignToken ? 404 : 503).json({
        success: false,
        message: campaignToken ? 'Campaña no encontrada o inactiva' : 'El chat en vivo no está disponible en este momento.',
      });
    }

    const config = await ccRouting.getConfig(pool);
    if (isFueraDeHorario(config)) {
      return res.status(503).json({ success: false, code: 'FUERA_DE_HORARIO', message: config?.CF_MSG_FUERA_HORARIO || 'Fuera de horario de atención.' });
    }

    // clienteExtId: el widget no tiene identificador estable del visitante
    // (sin login) — se genera uno nuevo por sesión, igual de anónimo que el
    // LC_ID autoincremental que usaba el motor viejo.
    const clienteExtId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const tk = await pool.request().query(`SELECT ISNULL(MAX(CI_TICKET), 0) + 1 AS n FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'en_cola'`);
    const ticket = tk.recordset[0].n;

    // Igual que el motor viejo: si deja email o teléfono, se liga a un
    // CRM_CONTACTOS/CRM_OPORTUNIDADES (nuevo o ya existente) para poder
    // adjuntarle la transcripción al cerrar (ver ccInteraccionesController.cerrar).
    const opoId = await obtenerOCrearOportunidadCc(pool, { nombre, email, telefono, motivo }).catch((e) => {
      console.warn('[ccWebPublica] no se pudo resolver oportunidad de CRM:', e?.message || e);
      return null;
    });

    const insInt = await pool.request()
      .input('canal', sql.Int, canal.CN_ID).input('tipo', sql.NVarChar(20), 'web_publica')
      .input('ext', sql.NVarChar(80), clienteExtId)
      .input('nombre', sql.NVarChar(160), (nombre || 'Visitante web').slice(0, 160))
      .input('tel', sql.NVarChar(40), (telefono || '').slice(0, 40) || null)
      .input('camp', sql.Int, canal.CN_CAMPANIA_ID || null).input('grupo', sql.Int, canal.CN_GRUPO_ID || null)
      .input('ticket', sql.Int, ticket).input('opo', sql.Int, opoId || null)
      .query(`
        INSERT INTO dbo.CCO_INTERACCIONES (CI_CANAL_ID, CI_TIPO, CI_CLIENTE_EXT_ID, CI_CLIENTE_NOMBRE, CI_CLIENTE_TELEFONO, CI_CAMPANIA_ID, CI_GRUPO_ID, CI_ESTADO, CI_TICKET, CI_OPO_ID)
        OUTPUT INSERTED.CI_ID as id
        VALUES (@canal, @tipo, @ext, @nombre, @tel, @camp, @grupo, 'en_cola', @ticket, @opo)
      `);
    const interaccionId = insInt.recordset[0].id;

    if (motivo) await insertarMensajeSistemaConWidget(pool, tenantKey, interaccionId, `Motivo: ${motivo}`);

    // rutearInteraccion ya asigna agente (si hay), pone CI_ESTADO='activa',
    // manda el mensaje de bienvenida (insert + emit 'cc:mensaje' a la
    // bandeja del agente) y emite 'cc:interaccion_tomada'/'cc:nueva_interaccion'.
    // Lo único que falta aquí es el espejo hacia el visitante.
    const agente = await ccRouting.rutearInteraccion(pool, tenantKey, interaccionId);
    if (agente) {
      try {
        socketService.getIO().to(`livechat:${interaccionId}`).emit('livechat:conversacion_tomada', {
          conversacionId: Number(interaccionId), agenteNombre: agente.nombre,
        });
        if (config?.CF_MSG_BIENVENIDA) {
          socketService.getIO().to(`livechat:${interaccionId}`).emit('receive_livechat_message', {
            conversacionId: Number(interaccionId), emisor: 'sistema', contenido: config.CF_MSG_BIENVENIDA,
          });
        }
      } catch (e) { console.warn('[ccWebPublica] emit tomada al widget falló:', e?.message || e); }
    } else {
      ccRouting.emitir(tenantKey, 'supervisores', 'cc:cola_cambio', {});
    }

    const mensajes = await pool.request().input('id', sql.Int, interaccionId).query(`${SELECT_MSG} WHERE MG_INTERACCION_ID = @id ORDER BY MG_FECHA ASC`);

    res.status(201).json({
      success: true,
      data: {
        conversacionId: interaccionId,
        estado: agente ? 'activa' : 'esperando',
        agenteAsignado: !!agente,
        mensajes: mensajes.recordset,
        mensajeSinAgentes: agente ? null : MSG_SIN_AGENTES_DEFAULT,
        cola: agente ? null : { posicion: 1, total: 1, tiempoEstimadoMinutos: 5, mensaje: MSG_EN_COLA_DEFAULT },
      },
    });
  } catch (error) {
    console.error('Error iniciando conversación web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/livechat/conversaciones/:conversacionId — recarga/reconexión del visitante.
exports.getConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const conv = await pool.request().input('id', sql.Int, conversacionId).query(`${SELECT_INT} WHERE i.CI_ID = @id`);
    if (!conv.recordset[0]) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    const mensajes = await pool.request().input('id', sql.Int, conversacionId).query(`${SELECT_MSG} WHERE MG_INTERACCION_ID = @id ORDER BY MG_FECHA ASC`);
    res.json({ success: true, data: { ...conv.recordset[0], mensajes: mensajes.recordset } });
  } catch (error) {
    console.error('Error obteniendo conversación web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/livechat/conversaciones/:conversacionId/cola — posición mientras espera.
exports.getPosicionCola = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const conv = await pool.request().input('id', sql.Int, conversacionId).query(`SELECT CI_ESTADO estado, CI_TICKET ticket FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
    const it = conv.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    if (it.estado !== 'en_cola') return res.json({ success: true, data: { enCola: false, estado: it.estado } });

    const r = await pool.request().input('t', sql.Int, it.ticket).query(`
      SELECT (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'en_cola' AND CI_TICKET <= @t) as posicion,
             (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'en_cola') as total
    `);
    const { posicion, total } = r.recordset[0];
    res.json({
      success: true,
      data: {
        enCola: true, posicion, total,
        tiempoEstimadoMinutos: Math.min(Math.max(posicion * 5, 1), 30),
        mensaje: MSG_EN_COLA_DEFAULT,
      },
    });
  } catch (error) {
    console.error('Error obteniendo posición en cola web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/livechat/conversaciones/:conversacionId/cola — el visitante abandona la espera.
exports.abandonarCola = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, conversacionId)
      .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_ESTADO = 'cerrada', CI_FECHA_CIERRE = GETDATE() WHERE CI_ID = @id AND CI_ESTADO = 'en_cola'`);
    res.json({ success: true, message: 'Saliste de la cola' });
  } catch (error) {
    console.error('Error abandonando cola web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/livechat/conversaciones/:conversacionId/salir — visitante sale de un chat en curso.
exports.salirConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const tenantKey = tenantKeyDe(req);
    const conv = await pool.request().input('id', sql.Int, conversacionId).query(`SELECT CI_ESTADO estado, CI_AGENTE_ID agenteId FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
    const it = conv.recordset[0];
    if (!it || it.estado === 'cerrada') return res.json({ success: true, message: 'La conversación ya estaba cerrada' });

    await pool.request().input('id', sql.Int, conversacionId)
      .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_ESTADO = 'cerrada', CI_FECHA_CIERRE = GETDATE() WHERE CI_ID = @id`);
    if (it.agenteId) {
      await pool.request().input('u', sql.Int, it.agenteId)
        .query(`UPDATE dbo.CCO_AGENTE_ESTADO SET CAE_INTERACCIONES_ACTIVAS = CASE WHEN CAE_INTERACCIONES_ACTIVAS > 0 THEN CAE_INTERACCIONES_ACTIVAS - 1 ELSE 0 END WHERE CAE_USUARIO_ID = @u`);
    }
    await insertarMensajeSistemaConWidget(pool, tenantKey, conversacionId, 'El visitante salió de la conversación.');
    try {
      socketService.getIO().to(`livechat:${conversacionId}`).emit('livechat:conversacion_cerrada', { conversacionId: Number(conversacionId) });
    } catch (e) { console.warn('[ccWebPublica] emit cierre falló:', e?.message || e); }
    ccRouting.emitir(tenantKey, `cc:interaccion:${conversacionId}`, 'cc:interaccion_cerrada', { interaccionId: Number(conversacionId) });
    await ccRouting.intentarAsignarSiguienteEnCola(pool, tenantKey).catch(() => {});

    res.json({ success: true, message: 'Saliste de la conversación' });
  } catch (error) {
    console.error('Error al salir de la conversación web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/livechat/conversaciones/:conversacionId/mensajes — mensaje del visitante
// (sin auth — el agente usa ccInteraccionesController.enviarMensaje en su lugar).
exports.enviarMensaje = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const { contenido } = req.body || {};
    if (!contenido || !String(contenido).trim()) return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tenantKey = tenantKeyDe(req);
    const conv = await pool.request().input('id', sql.Int, conversacionId).query(`SELECT CI_ESTADO estado FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
    const it = conv.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    if (it.estado === 'cerrada') return res.status(409).json({ success: false, message: 'La conversación ya está cerrada' });

    const ins = await pool.request().input('id', sql.Int, conversacionId).input('c', sql.NVarChar(sql.MAX), contenido)
      .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_CONTENIDO) OUTPUT INSERTED.MG_ID as id VALUES (@id, 'cliente', @c)`);
    await pool.request().input('id', sql.Int, conversacionId).query(`UPDATE dbo.CCO_INTERACCIONES SET CI_FECHA_ULTIMO_MSJ_CLIENTE = GETDATE() WHERE CI_ID = @id`);

    ccRouting.emitir(tenantKey, `cc:interaccion:${conversacionId}`, 'cc:mensaje', { interaccionId: Number(conversacionId) });
    try {
      socketService.getIO().to(`livechat:${conversacionId}`).emit('receive_livechat_message', {
        conversacionId: Number(conversacionId), emisor: 'visitante', contenido: String(contenido),
      });
    } catch (e) { console.warn('[ccWebPublica] emit visitante falló:', e?.message || e); }

    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (error) {
    console.error('Error enviando mensaje web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/livechat/conversaciones/:conversacionId/calificar — el visitante califica
// tras el cierre. A diferencia del motor viejo, NO bloquea el cierre (ya quedó cerrada
// desde que el agente cerró vía ccInteraccionesController.cerrar) — solo guarda el rating.
exports.calificarConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const { rating, comentario } = req.body || {};
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'La calificación debe ser un número entero entre 1 y 5' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const conv = await pool.request().input('id', sql.Int, conversacionId).query(`SELECT CI_ID id FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
    if (!conv.recordset[0]) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });

    await pool.request().input('id', sql.Int, conversacionId).input('r', sql.TinyInt, ratingNum).input('c', sql.NVarChar(sql.MAX), comentario || null)
      .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_RATING = @r, CI_COMENTARIO_RATING = COALESCE(@c, CI_COMENTARIO_RATING) WHERE CI_ID = @id`);

    res.json({ success: true, message: 'Gracias por tu calificación' });
  } catch (error) {
    console.error('Error calificando conversación web pública:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
