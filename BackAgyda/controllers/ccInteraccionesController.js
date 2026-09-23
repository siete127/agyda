const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const databaseService = require('../services/databaseService');
const ccRouting = require('../services/ccRoutingService');
const socketService = require('../services/socketService');
const metaClient = require('../services/canalesMeta/metaClient');
const baileysManager = require('../services/canalesBaileys/baileysManager');
const fcaManager = require('../services/canalesFca/fcaManager');
const igPrivateManager = require('../services/canalesIgPrivate/igPrivateManager');
const webPublicaManager = require('../services/webPublicaManager');
const ccWebPublica = require('./ccWebPublicaController');
const { CC_MEDIA_DIR } = require('../middleware/ccMediaUpload');

// Dispatcher por tipo de canal: 'whatsapp_baileys', 'messenger_fca' e
// 'instagram_privado' van por sus respectivas sesiones no oficiales;
// 'web_publica' no llama a ninguna API externa — solo empuja el mensaje al
// visitante por socket (ver webPublicaManager); el resto (whatsapp/messenger/
// instagram, todos Cloud API de Meta) sigue yendo por metaClient, sin
// cambios. `it` trae el canal ya unido (cn.* en el SELECT de cada endpoint)
// — mismo objeto en todos los casos.
function tipoCanalDe(it) {
  return (it.CN_TIPO || it.tipo || '').toLowerCase();
}
// Canal en modo 'individual': el envío usa la sesión del agente DUEÑO de la
// interacción (CI_AGENTE_ID) — no una sesión genérica del canal, porque en
// este modo cada agente tiene la suya propia. En modo 'compartido' (default)
// se pasa undefined, igual que siempre.
function usuarioSesionDe(it) {
  return (it.CN_MODO_SESION || 'compartido') === 'individual' ? (it.agenteId || it.CI_AGENTE_ID) : undefined;
}
async function enviarTextoCanal(it, destinatarioExtId, texto) {
  const tipo = tipoCanalDe(it);
  const canalId = it.CN_ID || it.canalId;
  const usuarioId = usuarioSesionDe(it);
  if (tipo === 'whatsapp_baileys') return baileysManager.enviarTexto(canalId, destinatarioExtId, texto, usuarioId);
  if (tipo === 'messenger_fca') return fcaManager.enviarTexto(canalId, destinatarioExtId, texto, usuarioId);
  if (tipo === 'instagram_privado') return igPrivateManager.enviarTexto(canalId, destinatarioExtId, texto, usuarioId);
  if (tipo === 'web_publica') return webPublicaManager.enviarTexto(it.id || it.interaccionId || destinatarioExtId, texto);
  return metaClient.enviarTexto(it, destinatarioExtId, texto);
}
async function enviarMediaCanal(it, destinatarioExtId, mediaUrl, tipoMedia) {
  const tipo = tipoCanalDe(it);
  const canalId = it.CN_ID || it.canalId;
  const usuarioId = usuarioSesionDe(it);
  if (tipo === 'whatsapp_baileys') return baileysManager.enviarMedia(canalId, destinatarioExtId, mediaUrl, tipoMedia, usuarioId);
  if (tipo === 'messenger_fca') return fcaManager.enviarMedia(canalId, destinatarioExtId, mediaUrl, usuarioId);
  if (tipo === 'instagram_privado') return igPrivateManager.enviarMedia(canalId, destinatarioExtId, mediaUrl, tipoMedia, usuarioId);
  if (tipo === 'web_publica') return webPublicaManager.enviarMedia(it.id || it.interaccionId || destinatarioExtId, mediaUrl, tipoMedia);
  return metaClient.enviarMedia(it, destinatarioExtId, mediaUrl, tipoMedia);
}

function tenantKeyDe(req) {
  return (req?.user?.empresa || 'agyda').toLowerCase();
}
function usuarioIdDe(req) {
  return req.user && (req.user.id || req.user.sub || req.user.userId);
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }

const SELECT_INT = `
  SELECT
    i.CI_ID as id, i.CI_CANAL_ID as canalId, i.CI_TIPO as tipo,
    i.CI_CLIENTE_EXT_ID as clienteExtId, i.CI_CLIENTE_NOMBRE as clienteNombre,
    i.CI_CLIENTE_TELEFONO as clienteTelefono, i.CI_CONTACTO_ID as contactoId,
    i.CI_CAMPANIA_ID as campaniaId, i.CI_GRUPO_ID as grupoId,
    i.CI_AGENTE_ID as agenteId, i.CI_AGENTE_NOMBRE as agenteNombre,
    i.CI_ESTADO as estado, i.CI_MOTIVO_CIERRE_ID as motivoCierreId,
    i.CI_COMENTARIO_CIERRE as comentarioCierre, i.CI_TIPIFICACION_ID as tipificacionId,
    i.CI_FECHA_INICIO as fechaInicio, i.CI_FECHA_PRIMER_RESPUESTA as fechaPrimerRespuesta,
    i.CI_FECHA_ULTIMO_MSJ_CLIENTE as fechaUltimoMsjCliente, i.CI_FECHA_CIERRE as fechaCierre,
    i.CI_TICKET as ticket,
    cn.CN_NOMBRE as canalNombre,
    g.CG_NOMBRE as grupoNombre,
    cm.CM2_NOMBRE as campaniaNombre,
    ti.CT_NOMBRE as tipificacionNombre
  FROM dbo.CCO_INTERACCIONES i
  LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
  LEFT JOIN dbo.CCO_GRUPOS g ON g.CG_ID = i.CI_GRUPO_ID
  LEFT JOIN dbo.CCO_CAMPANIAS cm ON cm.CM2_ID = i.CI_CAMPANIA_ID
  LEFT JOIN dbo.CCO_TIPIFICACIONES ti ON ti.CT_ID = i.CI_TIPIFICACION_ID
`;

// GET /interacciones?estado=en_cola|activa  (bandeja del agente)
exports.list = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const estado = req.query.estado;
    let where = '';
    const rq = p.request().input('uid', sql.Int, uid);
    if (estado === 'en_cola') {
      // Bandeja de espera: solo la cola de los skills a los que el agente
      // sigue asignado HOY — bug real encontrado 2026-09-11, antes mostraba
      // TODA la cola global (de cualquier campaña/skill), así que un agente
      // veía conversaciones de campañas de las que ya lo habían quitado.
      // Interacciones sin skill (CI_GRUPO_ID NULL) siguen siendo visibles
      // para todos, como ya era el comportamiento para esas.
      where = `WHERE i.CI_ESTADO = 'en_cola'
        AND (i.CI_GRUPO_ID IS NULL OR EXISTS (
          SELECT 1 FROM dbo.CCO_GRUPO_AGENTES ga
          WHERE ga.CGA_GRUPO_ID = i.CI_GRUPO_ID AND ga.CGA_USUARIO_ID = @uid AND ga.CGA_ACTIVO = 1
        ))`;
    } else if (estado) {
      rq.input('e', sql.NVarChar(24), estado);
      where = `WHERE i.CI_AGENTE_ID = @uid AND i.CI_ESTADO = @e`;
    } else {
      where = `WHERE i.CI_AGENTE_ID = @uid AND i.CI_ESTADO IN ('activa','pendiente_tipificacion')`;
    }
    const r = await rq.query(`${SELECT_INT} ${where} ORDER BY i.CI_TICKET ASC, i.CI_FECHA_INICIO ASC`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('cc.list:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar interacciones' });
  }
};

exports.getById = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id)
      .query(`${SELECT_INT} WHERE i.CI_ID = @id`);
    if (!r.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    const msgs = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT m.MG_ID as id, m.MG_EMISOR as emisor, m.MG_AGENTE_ID as agenteId,
             m.MG_CONTENIDO as contenido, m.MG_MEDIA_ID as mediaId,
             m.MG_ESTADO_ENTREGA as estadoEntrega, m.MG_FECHA as fecha,
             md.MM3_MIME as mediaMime, md.MM3_NOMBRE_ORIGINAL as mediaNombre
      FROM dbo.CCO_MENSAJES m
      LEFT JOIN dbo.CCO_MEDIA md ON md.MM3_ID = m.MG_MEDIA_ID
      WHERE m.MG_INTERACCION_ID = @id ORDER BY m.MG_FECHA ASC`);
    res.json({ success: true, data: { ...r.recordset[0], mensajes: msgs.recordset } });
  } catch (e) {
    console.error('cc.getById:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener la interacción' });
  }
};

exports.tomar = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const cur = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT CI_ESTADO estado, CI_AGENTE_ID agenteId FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id');
    const c = cur.recordset[0];
    if (!c) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (c.estado === 'activa' && c.agenteId && c.agenteId !== uid) {
      return res.status(409).json({ success: false, message: 'Ya la tomó otro agente' });
    }
    const nombre = req.user?.nombres || req.user?.nombre || String(uid);
    await p.request()
      .input('id', sql.Int, req.params.id).input('uid', sql.Int, uid).input('n', sql.NVarChar(160), nombre)
      .query(`UPDATE dbo.CCO_INTERACCIONES
              SET CI_AGENTE_ID = @uid, CI_AGENTE_NOMBRE = @n, CI_ESTADO = 'activa',
                  CI_FECHA_PRIMER_RESPUESTA = ISNULL(CI_FECHA_PRIMER_RESPUESTA, GETDATE())
              WHERE CI_ID = @id`);
    await p.request().input('u', sql.Int, uid).query(`MERGE dbo.CCO_AGENTE_ESTADO AS t
      USING (SELECT @u u) s ON t.CAE_USUARIO_ID = s.u
      WHEN MATCHED THEN UPDATE SET CAE_INTERACCIONES_ACTIVAS = CAE_INTERACCIONES_ACTIVAS + 1
      WHEN NOT MATCHED THEN INSERT (CAE_USUARIO_ID, CAE_ONLINE, CAE_DISPONIBLE, CAE_INTERACCIONES_ACTIVAS) VALUES (@u, 1, 1, 1);`);
    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${req.params.id}`, 'cc:interaccion_tomada', { interaccionId: Number(req.params.id) });

    // Si es una conversación del widget web público que estaba en cola, el
    // visitante sigue en 'chat_vivo_cola' esperando — hay que avisarle que un
    // agente ya lo tomó para que pase a 'chat_vivo' (mismo contrato que usa
    // ccWebPublicaController.iniciarConversacion cuando el ruteo asigna al toque).
    try {
      const canal = await p.request().input('id', sql.Int, req.params.id)
        .query(`SELECT cn.CN_TIPO tipo FROM dbo.CCO_INTERACCIONES i
                JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID WHERE i.CI_ID = @id`);
      if (canal.recordset[0]?.tipo === 'web_publica') {
        socketService.getIO().to(`livechat:${req.params.id}`).emit('livechat:conversacion_tomada', {
          conversacionId: Number(req.params.id), agenteNombre: nombre,
        });
      }
    } catch (e) { console.warn('[cc.tomar] emit al widget falló:', e?.message || e); }

    res.json({ success: true });
  } catch (e) {
    console.error('cc.tomar:', e.message);
    res.status(500).json({ success: false, message: 'Error al tomar la interacción' });
  }
};

exports.enviarMensaje = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const { contenido } = req.body || {};
    if (!contenido || !String(contenido).trim()) {
      return res.status(400).json({ success: false, message: 'Mensaje vacío' });
    }
    const r = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT i.CI_ID id, i.CI_ESTADO estado, i.CI_TIPO tipo, i.CI_CLIENTE_EXT_ID clienteExtId,
             i.CI_FECHA_ULTIMO_MSJ_CLIENTE ultimoCliente, i.CI_CANAL_ID canalId, i.CI_AGENTE_ID agenteId,
             cn.* FROM dbo.CCO_INTERACCIONES i
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID WHERE i.CI_ID = @id`);
    const it = r.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (it.estado === 'cerrada') return res.status(400).json({ success: false, message: 'La interacción está cerrada' });

    // Ventana de 24h de WhatsApp
    if ((it.tipo || '').toLowerCase() === 'whatsapp' && it.ultimoCliente) {
      const horas = (Date.now() - new Date(it.ultimoCliente).getTime()) / 3_600_000;
      if (horas > 24) {
        return res.status(422).json({ success: false, code: 'FUERA_VENTANA_24H',
          message: 'Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp exige una plantilla aprobada (HSM) para reabrir la conversación.' });
      }
    }

    let metaMsgId = null;
    let errorEnvio = null;
    const tipoCanal = (it.tipo || '').toLowerCase();
    if (tipoCanal !== 'test') {
      try {
        const resp = await enviarTextoCanal(it, it.clienteExtId, String(contenido));
        const idCrudo = resp?.messages?.[0]?.id || resp?.message_id || null;
        // Mismo prefijo que baileysManager usa al ingestar el eco fromMe de
        // este mismo mensaje (ver messages.upsert) — sin este prefijo la
        // deduplicación por MG_META_MSG_ID nunca hacía match y el mensaje
        // que el agente mandó desde el panel se insertaba una SEGUNDA vez
        // al llegar su eco por el socket de WhatsApp.
        metaMsgId = idCrudo && tipoCanal.includes('baileys') ? `baileys_${idCrudo}` : idCrudo;
      } catch (e) {
        errorEnvio = e.message;
      }
    }

    const ins = await p.request()
      .input('int', sql.Int, req.params.id).input('uid', sql.Int, uid)
      .input('c', sql.NVarChar(sql.MAX), String(contenido))
      .input('meta', sql.NVarChar(120), metaMsgId)
      .input('est', sql.NVarChar(15), errorEnvio ? 'fallido' : 'enviado')
      .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_AGENTE_ID, MG_CONTENIDO, MG_META_MSG_ID, MG_ESTADO_ENTREGA)
              OUTPUT INSERTED.MG_ID id VALUES (@int, 'agente', @uid, @c, @meta, @est)`);

    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${req.params.id}`, 'cc:mensaje', { interaccionId: Number(req.params.id) });
    if (tipoCanal === 'test') {
      ccRouting.emitir(tenantKeyDe(req), `cc:sim:${req.params.id}`, 'cc:sim_mensaje', { interaccionId: Number(req.params.id) });
    }
    // El widget público (index.html) no está unido a `cc:interaccion:{id}` —
    // escucha `receive_livechat_message` en la sala `livechat:{id}`, mismo
    // contrato que usaba el motor viejo de LIVECHAT_*. Sin este emit
    // adicional, el visitante nunca vería los mensajes del agente.
    if (tipoCanal === 'web_publica') {
      try {
        socketService.getIO().to(`livechat:${req.params.id}`).emit('receive_livechat_message', {
          conversacionId: Number(req.params.id), emisor: 'agente', contenido: String(contenido),
        });
      } catch (e) {
        console.warn('[cc.enviarMensaje] emit a widget público falló:', e?.message || e);
      }
    }

    if (errorEnvio) return res.status(502).json({ success: false, message: `El canal rechazó el mensaje: ${errorEnvio}`, data: { id: ins.recordset[0].id } });
    res.json({ success: true, data: { id: ins.recordset[0].id, metaMsgId } });
  } catch (e) {
    console.error('cc.enviarMensaje:', e.message);
    res.status(500).json({ success: false, message: 'Error al enviar el mensaje' });
  }
};

exports.cerrar = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const { motivoCierreId, tipificacionId, comentario } = req.body || {};
    const r = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT CI_ESTADO estado, CI_AGENTE_ID agenteId, CI_GRUPO_ID grupoId, CI_CAMPANIA_ID campaniaId, CI_TIPO tipo, CI_OPO_ID opoId FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id');
    const it = r.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (it.estado === 'cerrada') return res.status(400).json({ success: false, message: 'Ya está cerrada' });

    // Motivo de cierre obligatorio si el grupo tiene motivos configurados
    if (it.grupoId) {
      const mot = await p.request().input('g', sql.Int, it.grupoId)
        .query(`SELECT CMC_ID id, CMC_REQUIERE_COMENTARIO req FROM dbo.CCO_MOTIVOS_CIERRE WHERE CMC_GRUPO_ID = @g AND CMC_ACTIVO = 1`);
      if (mot.recordset.length) {
        const m = mot.recordset.find((x) => x.id === Number(motivoCierreId));
        if (!m) return res.status(400).json({ success: false, message: 'Selecciona un motivo de cierre' });
        if (m.req && !String(comentario || '').trim()) {
          return res.status(400).json({ success: false, message: 'Este motivo requiere un comentario' });
        }
      }
    }
    // Tipificación obligatoria si hay tipificaciones para la campaña (o globales)
    const tip = await p.request().input('c', sql.Int, it.campaniaId || null)
      .query(`SELECT CT_ID id, CT_REQUIERE_COMENTARIO req FROM dbo.CCO_TIPIFICACIONES
              WHERE CT_ACTIVO = 1 AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)`);
    if (tip.recordset.length) {
      const t = tip.recordset.find((x) => x.id === Number(tipificacionId));
      if (!t) return res.status(400).json({ success: false, message: 'Selecciona una tipificación' });
      if (t.req && !String(comentario || '').trim()) {
        return res.status(400).json({ success: false, message: 'Esta tipificación requiere un comentario' });
      }
    }

    const cfg = await ccRouting.getConfig(p);
    const acwSeg = cfg.CF_ACW_SEG || 60;

    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('mot', sql.Int, motivoCierreId ? Number(motivoCierreId) : null)
      .input('tip', sql.Int, tipificacionId ? Number(tipificacionId) : null)
      .input('com', sql.NVarChar(sql.MAX), comentario || null)
      .query(`UPDATE dbo.CCO_INTERACCIONES
              SET CI_ESTADO = 'cerrada', CI_FECHA_CIERRE = GETDATE(),
                  CI_MOTIVO_CIERRE_ID = @mot, CI_TIPIFICACION_ID = @tip, CI_COMENTARIO_CIERRE = @com
              WHERE CI_ID = @id`);
    if (it.agenteId) {
      await p.request().input('u', sql.Int, it.agenteId).input('acw', sql.Int, acwSeg)
        .query(`UPDATE dbo.CCO_AGENTE_ESTADO
                SET CAE_INTERACCIONES_ACTIVAS = CASE WHEN CAE_INTERACCIONES_ACTIVAS > 0 THEN CAE_INTERACCIONES_ACTIVAS - 1 ELSE 0 END,
                    CAE_ACW_HASTA = DATEADD(SECOND, @acw, GETDATE())
                WHERE CAE_USUARIO_ID = @u`);
    }
    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${req.params.id}`, 'cc:interaccion_cerrada', { interaccionId: Number(req.params.id) });
    if (it.tipo === 'web_publica') {
      // El widget público no escucha 'cc:interaccion_cerrada' (esa sala es
      // interna de la bandeja del agente) — necesita su propio evento en la
      // sala 'livechat:{id}' para saber que ya puede mostrar el modal de
      // calificación (mismo contrato que el motor viejo emitía al pasar por
      // 'pendiente_rating'; aquí el cierre ya es definitivo, pero la señal
      // al visitante es la misma).
      try {
        socketService.getIO().to(`livechat:${req.params.id}`).emit('livechat:pendiente_calificacion', {
          conversacionId: Number(req.params.id),
        });
      } catch (e) {
        console.warn('[cc.cerrar] emit pendiente_calificacion al widget falló:', e?.message || e);
      }
      // Portado de livechatController: si el visitante quedó ligado a una
      // Oportunidad de CRM (dejó email/teléfono al iniciar), se le adjunta
      // la transcripción completa del chat al cerrar.
      await ccWebPublica.guardarTranscripcionEnCrm(p, req.params.id, it.opoId).catch(() => {});
    }
    await ccRouting.intentarAsignarSiguienteEnCola(p, tenantKeyDe(req)).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('cc.cerrar:', e.message);
    res.status(500).json({ success: false, message: 'Error al cerrar la interacción' });
  }
};

// Corrige/agrega la tipificación de una interacción YA cerrada, sin
// reabrirla ni exigir motivo de cierre — para casos como "Sin gestionar"
// del Reporte Ejecutivo de Reclutamiento: interacciones creadas ya cerradas
// (p.ej. por una migración de datos) a las que nunca se les asignó estatus.
// exports.cerrar exige CI_ESTADO != 'cerrada', así que no sirve aquí.
exports.retipificar = async (req, res) => {
  try {
    const p = await pool(req);
    const { tipificacionId, comentario } = req.body || {};
    const r = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT CI_ESTADO estado, CI_CAMPANIA_ID campaniaId FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id');
    const it = r.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (it.estado !== 'cerrada') return res.status(400).json({ success: false, message: 'Solo se puede retipificar una interacción ya cerrada' });

    const tip = await p.request().input('c', sql.Int, it.campaniaId || null)
      .query(`SELECT CT_ID id, CT_REQUIERE_COMENTARIO req FROM dbo.CCO_TIPIFICACIONES
              WHERE CT_ACTIVO = 1 AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)`);
    const t = tip.recordset.find((x) => x.id === Number(tipificacionId));
    if (!t) return res.status(400).json({ success: false, message: 'Selecciona una tipificación válida' });
    if (t.req && !String(comentario || '').trim()) {
      return res.status(400).json({ success: false, message: 'Esta tipificación requiere un comentario' });
    }

    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('tip', sql.Int, Number(tipificacionId))
      .input('com', sql.NVarChar(sql.MAX), comentario || null)
      .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_TIPIFICACION_ID = @tip, CI_COMENTARIO_CIERRE = @com WHERE CI_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    console.error('cc.retipificar:', e.message);
    res.status(500).json({ success: false, message: 'Error al tipificar la interacción' });
  }
};

exports.transferir = async (req, res) => {
  try {
    const p = await pool(req);
    const { nuevoAgenteId, nuevoGrupoId } = req.body || {};
    const r = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT CI_ESTADO estado, CI_AGENTE_ID agenteId FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id');
    const it = r.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'No encontrada' });

    if (nuevoAgenteId) {
      const ag = await p.request().input('u', sql.Int, nuevoAgenteId)
        .query('SELECT NEUS_NOMBRES n FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @u');
      const nombre = ag.recordset[0]?.n || String(nuevoAgenteId);
      await p.request().input('id', sql.Int, req.params.id).input('u', sql.Int, nuevoAgenteId).input('n', sql.NVarChar(160), nombre)
        .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_AGENTE_ID = @u, CI_AGENTE_NOMBRE = @n, CI_ESTADO = 'activa' WHERE CI_ID = @id`);
      if (it.agenteId) await p.request().input('u', sql.Int, it.agenteId).query(`UPDATE dbo.CCO_AGENTE_ESTADO SET CAE_INTERACCIONES_ACTIVAS = CASE WHEN CAE_INTERACCIONES_ACTIVAS>0 THEN CAE_INTERACCIONES_ACTIVAS-1 ELSE 0 END WHERE CAE_USUARIO_ID = @u`);
      await p.request().input('u', sql.Int, nuevoAgenteId).query(`MERGE dbo.CCO_AGENTE_ESTADO AS t USING (SELECT @u u) s ON t.CAE_USUARIO_ID=s.u WHEN MATCHED THEN UPDATE SET CAE_INTERACCIONES_ACTIVAS = CAE_INTERACCIONES_ACTIVAS+1 WHEN NOT MATCHED THEN INSERT (CAE_USUARIO_ID, CAE_INTERACCIONES_ACTIVAS) VALUES (@u,1);`);
      ccRouting.emitir(tenantKeyDe(req), `user:${nuevoAgenteId}`, 'cc:nueva_interaccion', { interaccionId: Number(req.params.id) });
    } else if (nuevoGrupoId) {
      // devolver a cola con nuevo grupo/skill
      await p.request().input('id', sql.Int, req.params.id).input('g', sql.Int, nuevoGrupoId)
        .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_GRUPO_ID = @g, CI_AGENTE_ID = NULL, CI_AGENTE_NOMBRE = NULL, CI_ESTADO = 'en_cola' WHERE CI_ID = @id`);
      if (it.agenteId) await p.request().input('u', sql.Int, it.agenteId).query(`UPDATE dbo.CCO_AGENTE_ESTADO SET CAE_INTERACCIONES_ACTIVAS = CASE WHEN CAE_INTERACCIONES_ACTIVAS>0 THEN CAE_INTERACCIONES_ACTIVAS-1 ELSE 0 END WHERE CAE_USUARIO_ID = @u`);
      await ccRouting.intentarAsignarSiguienteEnCola(p, tenantKeyDe(req)).catch(() => {});
    } else {
      return res.status(400).json({ success: false, message: 'Indica nuevoAgenteId o nuevoGrupoId' });
    }
    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${req.params.id}`, 'cc:interaccion_transferida', { interaccionId: Number(req.params.id) });
    res.json({ success: true });
  } catch (e) {
    console.error('cc.transferir:', e.message);
    res.status(500).json({ success: false, message: 'Error al transferir' });
  }
};

// ── Estado del agente ────────────────────────────────────────────────────
exports.setDisponible = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const disponible = !!req.body?.disponible;
    await p.request().input('u', sql.Int, uid).input('d', sql.Bit, disponible)
      .query(`MERGE dbo.CCO_AGENTE_ESTADO AS t USING (SELECT @u u) s ON t.CAE_USUARIO_ID = s.u
              WHEN MATCHED THEN UPDATE SET CAE_ONLINE = 1, CAE_DISPONIBLE = @d, CAE_ULTIMA_CONEXION = GETDATE()
              WHEN NOT MATCHED THEN INSERT (CAE_USUARIO_ID, CAE_ONLINE, CAE_DISPONIBLE, CAE_ULTIMA_CONEXION) VALUES (@u, 1, @d, GETDATE());`);
    if (disponible) await ccRouting.intentarAsignarSiguienteEnCola(p, tenantKeyDe(req)).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al cambiar disponibilidad' });
  }
};

exports.getMiEstado = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const r = await p.request().input('u', sql.Int, uid)
      .query(`SELECT CAE_ONLINE online, CAE_DISPONIBLE disponible, CAE_INTERACCIONES_ACTIVAS activas, CAE_ACW_HASTA acwHasta
              FROM dbo.CCO_AGENTE_ESTADO WHERE CAE_USUARIO_ID = @u`);
    const row = r.recordset[0] || { online: false, disponible: false, activas: 0, acwHasta: null };
    const enPausa = await p.request().input('u', sql.Int, uid)
      .query(`SELECT TOP 1 status_id FROM dbo.USUARIO_TIEMPOS WHERE neus_id = @u AND fecha_fin IS NULL AND status_id IN (2,3,5,6)`);
    res.json({ success: true, data: { online: !!row.online, disponible: !!row.disponible, activas: row.activas || 0,
      acwHasta: row.acwHasta, enPausa: enPausa.recordset.length > 0,
      enAcw: row.acwHasta && new Date(row.acwHasta) > new Date() } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al obtener estado' });
  }
};

exports.getAgentesEstado = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT ae.CAE_USUARIO_ID usuarioId, ISNULL(u.NEUS_NOMBRES, CONVERT(NVARCHAR(20), ae.CAE_USUARIO_ID)) nombre,
             ae.CAE_ONLINE online, ae.CAE_DISPONIBLE disponible, ae.CAE_INTERACCIONES_ACTIVAS activas,
             ae.CAE_ACW_HASTA acwHasta, ae.CAE_ULTIMA_CONEXION ultimaConexion,
             CASE WHEN EXISTS (SELECT 1 FROM dbo.USUARIO_TIEMPOS ut WHERE ut.neus_id = ae.CAE_USUARIO_ID AND ut.fecha_fin IS NULL AND ut.status_id IN (2,3,5,6)) THEN 1 ELSE 0 END enPausa
      FROM dbo.CCO_AGENTE_ESTADO ae
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ae.CAE_USUARIO_ID
      ORDER BY ae.CAE_DISPONIBLE DESC, ae.CAE_ONLINE DESC, nombre`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al obtener agentes' });
  }
};

// ── Catálogos para el chat ──────────────────────────────────────────────
exports.getPlantillas = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const r = await p.request().input('g', sql.Int, req.query.grupoId || null).input('u', sql.Int, uid)
      .query(`SELECT CP_ID id, CP_NOMBRE nombre, CP_CONTENIDO contenido, CP_VISIBILIDAD visibilidad
              FROM dbo.CCO_PLANTILLAS
              WHERE CP_GRUPO_ID = @g AND CP_ACTIVO = 1
                AND (CP_VISIBILIDAD = 'publica' OR CP_USUARIO_ID = @u)
              ORDER BY CP_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.getTipificaciones = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, req.query.campaniaId || null)
      .query(`SELECT CT_ID id, CT_NOMBRE nombre, CT_REQUIERE_COMENTARIO requiereComentario
              FROM dbo.CCO_TIPIFICACIONES
              WHERE CT_ACTIVO = 1 AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)
              ORDER BY CT_ORDEN, CT_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.getMotivosCierre = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.query.grupoId || null)
      .query(`SELECT CMC_ID id, CMC_MOTIVO motivo, CMC_REQUIERE_COMENTARIO requiereComentario
              FROM dbo.CCO_MOTIVOS_CIERRE WHERE CMC_GRUPO_ID = @g AND CMC_ACTIVO = 1 ORDER BY CMC_ORDEN`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.getAgentesTransferibles = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const r = await p.request().input('id', sql.Int, req.params.id).input('uid', sql.Int, uid).query(`
      SELECT DISTINCT ae.CAE_USUARIO_ID usuarioId, ISNULL(u.NEUS_NOMBRES, CONVERT(NVARCHAR(20), ae.CAE_USUARIO_ID)) nombre,
             ae.CAE_ONLINE online, ae.CAE_DISPONIBLE disponible, ae.CAE_INTERACCIONES_ACTIVAS activas
      FROM dbo.CCO_INTERACCIONES i
      INNER JOIN dbo.CCO_GRUPO_AGENTES ga ON ga.CGA_GRUPO_ID = i.CI_GRUPO_ID AND ga.CGA_ACTIVO = 1
      INNER JOIN dbo.CCO_AGENTE_ESTADO ae ON ae.CAE_USUARIO_ID = ga.CGA_USUARIO_ID
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ae.CAE_USUARIO_ID
      WHERE i.CI_ID = @id AND ae.CAE_USUARIO_ID <> @uid
      ORDER BY ae.CAE_DISPONIBLE DESC, activas ASC`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// ── Supervisión / historial / métricas ─────────────────────────────────
// Verifica que la interacción pertenezca a una campaña asignada al
// supervisor autenticado (AD/TI no tienen restricción). Fase 1, punto 3.1
// del plan — usado por susurrar/tomarSupervisor, las dos acciones nuevas
// donde el supervisor SÍ cambia algo del chat de otro agente (a diferencia
// de sólo observar, que ya está cubierto por el filtro de supervisionActivas).
async function puedeSupervisarInteraccion(p, req, interaccionId) {
  const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
  if (['AD', 'TI'].includes(tipoUsuario)) return true;
  const uid = usuarioIdDe(req);
  const r = await p.request().input('id', sql.Int, interaccionId).input('uid', sql.Int, uid).query(`
    SELECT 1 FROM dbo.CCO_INTERACCIONES i
    WHERE i.CI_ID = @id AND i.CI_CAMPANIA_ID IN (
      SELECT CS_CAMPANIA_ID FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid
    )`);
  return !!r.recordset[0];
}

// POST /interacciones/:id/susurrar — mensaje del supervisor al agente,
// entregado en vivo por socket a la sala cc:interaccion:{id} (evento
// 'cc:susurro'). Nunca toca CCO_MENSAJES: el cliente jamás debe verlo.
exports.susurrar = async (req, res) => {
  try {
    const p = await pool(req);
    const interaccionId = Number(req.params.id);
    const contenido = (req.body?.contenido || '').toString().trim();
    if (!contenido) return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
    if (!(await puedeSupervisarInteraccion(p, req, interaccionId))) {
      return res.status(403).json({ success: false, message: 'No tienes esta interacción asignada' });
    }
    const uid = usuarioIdDe(req);
    const nombre = req.user?.nombres || req.user?.nombre || String(uid);
    await p.request()
      .input('int', sql.Int, interaccionId).input('sup', sql.Int, uid)
      .input('n', sql.NVarChar(160), nombre).input('c', sql.NVarChar(1000), contenido)
      .query(`INSERT INTO dbo.CSA_SUSURROS (CSU_INTERACCION_ID, CSU_SUPERVISOR_ID, CSU_SUPERVISOR_NOMBRE, CSU_CONTENIDO)
              VALUES (@int, @sup, @n, @c)`);
    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${interaccionId}`, 'cc:susurro', {
      interaccionId, contenido, supervisorNombre: nombre,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('cc.susurrar:', e.message);
    res.status(500).json({ success: false, message: 'Error al enviar el susurro' });
  }
};

// POST /interacciones/:id/tomar-supervisor — el supervisor se hace cargo
// directo del chat, desplazando al agente actual (a diferencia de
// exports.tomar, que es para que un agente tome algo de SU propia cola y
// rechaza si ya la tiene otro agente). Se avisa al agente saliente por el
// mismo evento 'cc:interaccion_tomada' que ya escucha CCChatPanel.
exports.tomarSupervisor = async (req, res) => {
  try {
    const p = await pool(req);
    const interaccionId = Number(req.params.id);
    if (!(await puedeSupervisarInteraccion(p, req, interaccionId))) {
      return res.status(403).json({ success: false, message: 'No tienes esta interacción asignada' });
    }
    const cur = await p.request().input('id', sql.Int, interaccionId)
      .query('SELECT CI_ESTADO estado FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id');
    if (!cur.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });

    const uid = usuarioIdDe(req);
    const nombre = req.user?.nombres || req.user?.nombre || String(uid);
    await p.request()
      .input('id', sql.Int, interaccionId).input('uid', sql.Int, uid).input('n', sql.NVarChar(160), nombre)
      .query(`UPDATE dbo.CCO_INTERACCIONES
              SET CI_AGENTE_ID = @uid, CI_AGENTE_NOMBRE = @n, CI_ESTADO = 'activa',
                  CI_FECHA_PRIMER_RESPUESTA = ISNULL(CI_FECHA_PRIMER_RESPUESTA, GETDATE())
              WHERE CI_ID = @id`);
    await p.request().input('u', sql.Int, uid).query(`MERGE dbo.CCO_AGENTE_ESTADO AS t
      USING (SELECT @u u) s ON t.CAE_USUARIO_ID = s.u
      WHEN MATCHED THEN UPDATE SET CAE_INTERACCIONES_ACTIVAS = CAE_INTERACCIONES_ACTIVAS + 1
      WHEN NOT MATCHED THEN INSERT (CAE_USUARIO_ID, CAE_ONLINE, CAE_DISPONIBLE, CAE_INTERACCIONES_ACTIVAS) VALUES (@u, 1, 1, 1);`);
    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${interaccionId}`, 'cc:interaccion_tomada', { interaccionId });
    res.json({ success: true });
  } catch (e) {
    console.error('cc.tomarSupervisor:', e.message);
    res.status(500).json({ success: false, message: 'Error al tomar la interacción' });
  }
};

exports.supervisionActivas = async (req, res) => {
  try {
    const p = await pool(req);
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const rq = p.request();
    // Un supervisor (no AD/TI) solo debe ver interacciones de campañas que
    // tiene asignadas en CC_CAMPANIAS_SUPERVISORES — antes este endpoint
    // devolvía TODA la cola/activas sin filtrar (bug real encontrado
    // 2026-09-12, mismo patrón que ccInteraccionesController.list).
    let filtroCampania = '';
    if (!esAdmin) {
      rq.input('uid', sql.Int, usuarioIdDe(req));
      filtroCampania = `AND i.CI_CAMPANIA_ID IN (SELECT CS_CAMPANIA_ID FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)`;
    }
    const r = await rq.query(`${SELECT_INT} WHERE i.CI_ESTADO IN ('en_cola','activa','pendiente_tipificacion') ${filtroCampania} ORDER BY i.CI_FECHA_INICIO ASC`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.historial = async (req, res) => {
  try {
    const p = await pool(req);
    const rq = p.request();
    const where = [`i.CI_ESTADO = 'cerrada'`];
    if (req.query.agenteId) { rq.input('a', sql.Int, req.query.agenteId); where.push('i.CI_AGENTE_ID = @a'); }
    if (req.query.canalId) { rq.input('c', sql.Int, req.query.canalId); where.push('i.CI_CANAL_ID = @c'); }
    // campaniaId acepta CSV ("3,7,12") para el buscador de Formularios de
    // Atención, que filtra por TODAS las campañas asignadas a un formulario
    // a la vez — evita tener que hacer N llamadas, una por campaña.
    if (req.query.campaniaId) {
      const ids = String(req.query.campaniaId).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) {
        const params = ids.map((id, i) => { rq.input(`camp${i}`, sql.Int, id); return `@camp${i}`; });
        where.push(`i.CI_CAMPANIA_ID IN (${params.join(',')})`);
      }
    }
    if (req.query.tipificacionId) { rq.input('tip', sql.Int, req.query.tipificacionId); where.push('i.CI_TIPIFICACION_ID = @tip'); }
    if (req.query.fechaDesde) { rq.input('fd', sql.DateTime, new Date(req.query.fechaDesde)); where.push('i.CI_FECHA_CIERRE >= @fd'); }
    if (req.query.fechaHasta) { rq.input('fh', sql.DateTime, new Date(req.query.fechaHasta)); where.push('i.CI_FECHA_CIERRE <= @fh'); }
    if (req.query.texto) { rq.input('t', sql.NVarChar(200), `%${req.query.texto}%`); where.push('(i.CI_CLIENTE_NOMBRE LIKE @t OR i.CI_CLIENTE_TELEFONO LIKE @t)'); }
    const r = await rq.query(`${SELECT_INT} WHERE ${where.join(' AND ')} ORDER BY i.CI_FECHA_CIERRE DESC OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('cc.historial:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// GET /api/contact-center/media/:id  (authenticateToken acepta ?token=)
exports.verMedia = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT MM3_NOMBRE_ARCHIVO archivo, MM3_MIME mime FROM dbo.CCO_MEDIA WHERE MM3_ID = @id');
    const row = r.recordset[0];
    if (!row) return res.status(404).json({ success: false, message: 'No encontrado' });
    const filePath = path.join(CC_MEDIA_DIR, path.basename(row.archivo));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Accept-Ranges', 'bytes');
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s, 10) || 0;
      const end = e ? parseInt(e, 10) : stat.size - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al servir el archivo' });
  }
};

// POST /api/contact-center/interacciones/:id/media  (agente adjunta un archivo)
exports.subirMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Sin archivo' });
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const ir = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT i.CI_ID id, i.CI_TIPO tipo, i.CI_CLIENTE_EXT_ID clienteExtId, i.CI_ESTADO estado, i.CI_AGENTE_ID agenteId, cn.*
      FROM dbo.CCO_INTERACCIONES i LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID WHERE i.CI_ID = @id`);
    const it = ir.recordset[0];
    if (!it) return res.status(404).json({ success: false, message: 'No encontrada' });

    const mediaRow = await p.request()
      .input('int', sql.Int, req.params.id).input('n', sql.NVarChar(260), req.file.filename)
      .input('o', sql.NVarChar(260), req.file.originalname).input('m', sql.NVarChar(120), req.file.mimetype).input('t', sql.Int, req.file.size)
      .query(`INSERT INTO dbo.CCO_MEDIA (MM3_INTERACCION_ID, MM3_NOMBRE_ARCHIVO, MM3_NOMBRE_ORIGINAL, MM3_MIME, MM3_TAMANIO)
              OUTPUT INSERTED.MM3_ID id VALUES (@int, @n, @o, @m, @t)`);
    const mediaId = mediaRow.recordset[0].id;

    let metaMsgId = null, errorEnvio = null;
    const tipoCanal = (it.tipo || '').toLowerCase();
    if (tipoCanal !== 'test') {
      try {
        const base = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '';
        const url = `${base}/uploads/cc-media/${req.file.filename}`;
        const kind = req.file.mimetype.startsWith('image/') ? 'image' : req.file.mimetype.startsWith('audio/') ? 'audio' : req.file.mimetype.startsWith('video/') ? 'video' : 'document';
        const resp = await enviarMediaCanal(it, it.clienteExtId, url, kind);
        metaMsgId = resp?.messages?.[0]?.id || null;
      } catch (e) { errorEnvio = e.message; }
    }
    await p.request().input('int', sql.Int, req.params.id).input('uid', sql.Int, uid)
      .input('media', sql.Int, mediaId).input('meta', sql.NVarChar(120), metaMsgId).input('est', sql.NVarChar(15), errorEnvio ? 'fallido' : 'enviado')
      .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_AGENTE_ID, MG_MEDIA_ID, MG_META_MSG_ID, MG_ESTADO_ENTREGA)
              VALUES (@int, 'agente', @uid, @media, @meta, @est)`);
    ccRouting.emitir(tenantKeyDe(req), `cc:interaccion:${req.params.id}`, 'cc:mensaje', { interaccionId: Number(req.params.id) });
    if (tipoCanal === 'web_publica' && !errorEnvio) {
      // Mismo espejo hacia el widget que enviarMensaje: el visitante no está
      // en la sala 'cc:interaccion:{id}' (esa es la bandeja del agente), solo
      // en 'livechat:{id}'.
      try {
        socketService.getIO().to(`livechat:${req.params.id}`).emit('receive_livechat_message', {
          conversacionId: Number(req.params.id), emisor: 'agente', contenido: '[archivo adjunto]',
        });
      } catch (e) {
        console.warn('[cc.subirMedia] emit a widget público falló:', e?.message || e);
      }
    }
    if (errorEnvio) return res.status(502).json({ success: false, message: `El canal rechazó el archivo: ${errorEnvio}` });
    res.json({ success: true, data: { mediaId } });
  } catch (e) {
    console.error('cc.subirMedia:', e.message);
    res.status(500).json({ success: false, message: 'Error al subir el archivo' });
  }
};

exports.metricas = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'en_cola') as enCola,
        (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'activa') as activas,
        (SELECT COUNT(*) FROM dbo.CCO_AGENTE_ESTADO WHERE CAE_ONLINE = 1 AND CAE_DISPONIBLE = 1) as agentesDisponibles,
        (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'cerrada' AND CI_FECHA_CIERRE >= CAST(GETDATE() AS DATE)) as cerradasHoy`);
    const porCanal = await p.request().query(`
      SELECT cn.CN_NOMBRE nombre, cn.CN_TIPO tipo, COUNT(i.CI_ID) total
      FROM dbo.CCO_CANALES cn LEFT JOIN dbo.CCO_INTERACCIONES i ON i.CI_CANAL_ID = cn.CN_ID AND i.CI_FECHA_INICIO >= CAST(GETDATE() AS DATE)
      GROUP BY cn.CN_NOMBRE, cn.CN_TIPO ORDER BY total DESC`);
    res.json({ success: true, data: { ...r.recordset[0], porCanal: porCanal.recordset } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};
