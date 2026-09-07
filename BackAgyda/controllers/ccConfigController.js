const sql = require('mssql');
const crypto = require('crypto');
const databaseService = require('../services/databaseService');
const metaClient = require('../services/canalesMeta/metaClient');
const baileysManager = require('../services/canalesBaileys/baileysManager');
const fcaManager = require('../services/canalesFca/fcaManager');
const igPrivateManager = require('../services/canalesIgPrivate/igPrivateManager');

function esAdmin(req) {
  return ['AD', 'TI'].includes(String(req.user?.tipoUsuario || '').toUpperCase());
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }
function tenantKeyDe(req) { return (req?.user?.empresa || 'agyda').toLowerCase(); }

async function ensureConfigRow(p) {
  await p.request().query(`IF NOT EXISTS (SELECT 1 FROM dbo.CCO_CONFIG) INSERT INTO dbo.CCO_CONFIG (CF_MSG_BIENVENIDA) VALUES (N'Hola, en un momento te atendemos.')`);
}

// ── Config global ───────────────────────────────────────────────────────
exports.getConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await ensureConfigRow(p);
    const r = await p.request().query('SELECT TOP 1 * FROM dbo.CCO_CONFIG ORDER BY CF_ID');
    const row = r.recordset[0];
    res.json({ success: true, data: {
      slaPrimeraRespuestaSeg: row.CF_SLA_PRIMERA_RESPUESTA_SEG,
      slaRespuestaSeg: row.CF_SLA_RESPUESTA_SEG,
      acwSeg: row.CF_ACW_SEG,
      maxInteraccionesPorAgente: row.CF_MAX_INTERACCIONES_POR_AGENTE,
      autocierreInactividadMin: row.CF_AUTOCIERRE_INACTIVIDAD_MIN,
      msgBienvenida: row.CF_MSG_BIENVENIDA || '',
      msgFueraHorario: row.CF_MSG_FUERA_HORARIO || '',
      horarioInicio: row.CF_HORARIO_INICIO || '', horarioFin: row.CF_HORARIO_FIN || '',
      diasSemana: row.CF_DIAS_SEMANA || '1,2,3,4,5',
    } });
  } catch (e) {
    console.error('ccConfig.getConfig:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await ensureConfigRow(p);
    const cl = (n, min, max, def) => { const v = Number(n); return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : def; };
    await p.request()
      .input('sla1', sql.Int, cl(b.slaPrimeraRespuestaSeg, 10, 86400, 120))
      .input('sla2', sql.Int, cl(b.slaRespuestaSeg, 10, 86400, 300))
      .input('acw', sql.Int, cl(b.acwSeg, 0, 3600, 60))
      .input('max', sql.Int, cl(b.maxInteraccionesPorAgente, 1, 50, 4))
      .input('auto', sql.Int, cl(b.autocierreInactividadMin, 5, 10080, 60))
      .input('mb', sql.NVarChar(sql.MAX), b.msgBienvenida || null)
      .input('mf', sql.NVarChar(sql.MAX), b.msgFueraHorario || null)
      .input('hi', sql.NVarChar(5), b.horarioInicio || null)
      .input('hf', sql.NVarChar(5), b.horarioFin || null)
      .input('ds', sql.NVarChar(20), b.diasSemana || null)
      .query(`UPDATE dbo.CCO_CONFIG SET
        CF_SLA_PRIMERA_RESPUESTA_SEG=@sla1, CF_SLA_RESPUESTA_SEG=@sla2, CF_ACW_SEG=@acw,
        CF_MAX_INTERACCIONES_POR_AGENTE=@max, CF_AUTOCIERRE_INACTIVIDAD_MIN=@auto,
        CF_MSG_BIENVENIDA=@mb, CF_MSG_FUERA_HORARIO=@mf,
        CF_HORARIO_INICIO=@hi, CF_HORARIO_FIN=@hf, CF_DIAS_SEMANA=@ds,
        CF_FECHA_ACTUALIZACION=GETDATE()
        WHERE CF_ID=(SELECT TOP 1 CF_ID FROM dbo.CCO_CONFIG ORDER BY CF_ID)`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccConfig.updateConfig:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// ── Canales ─────────────────────────────────────────────────────────────
// 'web_publica': widget de chat de la página web pública (ardabytec.com) —
// antes vivía en un motor aparte (LIVECHAT_*); ver services/webPublicaManager.js
// y controllers/ccWebPublicaController.js para el flujo completo.
const TIPOS_CANAL = ['whatsapp', 'messenger', 'instagram', 'whatsapp_baileys', 'messenger_fca', 'instagram_privado', 'web_publica', 'test'];

exports.listCanales = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT CN_ID id, CN_TIPO tipo, CN_NOMBRE nombre, CN_HABILITADO habilitado,
             CN_GRUPO_ID grupoId, CN_CAMPANIA_ID campaniaId, CN_MODO_SESION modoSesion,
             CN_META_PAGE_ID metaPageId, CN_META_BUSINESS_ID metaBusinessId,
             CN_VERIFY_TOKEN verifyToken, CN_WEBHOOK_SUSCRITO webhookSuscrito,
             CASE WHEN CN_ACCESS_TOKEN IS NOT NULL AND LEN(CN_ACCESS_TOKEN) > 0 THEN 1 ELSE 0 END accessTokenConfigurado,
             CASE WHEN CN_APP_SECRET IS NOT NULL AND LEN(CN_APP_SECRET) > 0 THEN 1 ELSE 0 END appSecretConfigurado,
             CN_BAILEYS_ESTADO baileysEstado, CN_BAILEYS_NUMERO baileysNumero,
             CN_FCA_ESTADO fcaEstado, CN_FCA_USUARIO fcaUsuario,
             CASE WHEN CN_FCA_APPSTATE IS NOT NULL AND LEN(CN_FCA_APPSTATE) > 0 THEN 1 ELSE 0 END fcaAppStateConfigurado,
             CN_IGP_ESTADO igpEstado, CN_IGP_USUARIO igpUsuario
      FROM dbo.CCO_CANALES ORDER BY CN_ID`);
    const base = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '';
    const tk = tenantKeyDe(req);
    res.json({ success: true, data: r.recordset.map((c) => ({
      ...c,
      habilitado: !!c.habilitado, webhookSuscrito: !!c.webhookSuscrito,
      accessTokenConfigurado: !!c.accessTokenConfigurado, appSecretConfigurado: !!c.appSecretConfigurado,
      webhookUrl: `${base}/api/cc/webhook/${tk}/${c.id}`,
    })) });
  } catch (e) {
    console.error('ccConfig.listCanales:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.createCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!TIPOS_CANAL.includes(b.tipo)) return res.status(400).json({ success: false, message: 'Tipo de canal inválido' });
    if (!b.nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const p = await pool(req);
    // 'web_publica' se identifica por token en vez de por credenciales de un
    // proveedor externo (no hay OAuth ni QR que hacer) — se genera de una vez
    // para que el canal quede utilizable apenas se crea, sin un paso aparte.
    const verifyToken = b.tipo === 'web_publica' ? crypto.randomUUID() : null;
    const r = await p.request()
      .input('tipo', sql.NVarChar(20), b.tipo).input('nombre', sql.NVarChar(120), b.nombre)
      .input('vt', sql.NVarChar(100), verifyToken)
      .query(`INSERT INTO dbo.CCO_CANALES (CN_TIPO, CN_NOMBRE, CN_VERIFY_TOKEN) OUTPUT INSERTED.CN_ID id VALUES (@tipo, @nombre, @vt)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al crear canal' });
  }
};

exports.updateCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    const cur = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const ex = cur.recordset[0];
    if (!ex) return res.status(404).json({ success: false, message: 'No encontrado' });
    // "no lo mando de vuelta, no lo borres" para los secretos
    const accessToken = b.accessToken ? String(b.accessToken) : ex.CN_ACCESS_TOKEN;
    const appSecret = b.appSecret ? String(b.appSecret) : ex.CN_APP_SECRET;
    // El modo de sesión solo aplica a los 3 canales no oficiales — cambiarlo
    // en caliente no migra sesiones ya conectadas (compartido<->individual
    // son almacenes distintos: CCO_CANALES vs CCO_CANAL_AGENTE_SESION), así
    // que el admin debe volver a vincular tras cambiar de modo.
    const modoSesion = b.modoSesion === 'individual' ? 'individual' : (b.modoSesion === 'compartido' ? 'compartido' : ex.CN_MODO_SESION);
    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar(120), b.nombre ?? ex.CN_NOMBRE)
      .input('hab', sql.Bit, b.habilitado != null ? !!b.habilitado : !!ex.CN_HABILITADO)
      .input('grupo', sql.Int, b.grupoId != null ? b.grupoId : ex.CN_GRUPO_ID)
      .input('camp', sql.Int, b.campaniaId != null ? b.campaniaId : ex.CN_CAMPANIA_ID)
      .input('modo', sql.NVarChar(20), modoSesion)
      .input('page', sql.NVarChar(60), b.metaPageId != null ? b.metaPageId : ex.CN_META_PAGE_ID)
      .input('biz', sql.NVarChar(60), b.metaBusinessId != null ? b.metaBusinessId : ex.CN_META_BUSINESS_ID)
      .input('tok', sql.NVarChar(600), accessToken || null)
      .input('sec', sql.NVarChar(200), appSecret || null)
      .input('vt', sql.NVarChar(100), b.verifyToken != null ? b.verifyToken : ex.CN_VERIFY_TOKEN)
      .query(`UPDATE dbo.CCO_CANALES SET
        CN_NOMBRE=@nombre, CN_HABILITADO=@hab, CN_GRUPO_ID=@grupo, CN_CAMPANIA_ID=@camp, CN_MODO_SESION=@modo,
        CN_META_PAGE_ID=@page, CN_META_BUSINESS_ID=@biz, CN_ACCESS_TOKEN=@tok,
        CN_APP_SECRET=@sec, CN_VERIFY_TOKEN=@vt, CN_FECHA_ACTUALIZACION=GETDATE()
        WHERE CN_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccConfig.updateCanal:', e.message);
    res.status(500).json({ success: false, message: 'Error al actualizar canal' });
  }
};

exports.deleteCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const uso = await p.request().input('id', sql.Int, req.params.id)
      .query(`SELECT COUNT(*) n FROM dbo.CCO_INTERACCIONES WHERE CI_CANAL_ID = @id`);
    if (uso.recordset[0].n > 0) {
      await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_CANALES SET CN_HABILITADO = 0 WHERE CN_ID = @id`);
      return res.json({ success: true, message: 'Canal con historial: se deshabilitó en vez de borrar' });
    }
    await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al eliminar canal' });
  }
};

exports.probarCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const canal = r.recordset[0];
    if (!canal) return res.status(404).json({ success: false, message: 'No encontrado' });
    if ((canal.CN_TIPO || '').toLowerCase() === 'test') return res.json({ success: true, message: 'Canal de prueba: no requiere conexión.' });
    const out = await metaClient.verificarConexion(canal);
    res.status(out.ok ? 200 : 400).json({ success: out.ok, message: out.message });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.suscribirCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const canal = r.recordset[0];
    if (!canal) return res.status(404).json({ success: false, message: 'No encontrado' });
    await metaClient.suscribirWebhook(canal);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_CANALES SET CN_WEBHOOK_SUSCRITO = 1 WHERE CN_ID = @id`);
    res.json({ success: true, message: 'Webhook suscrito.' });
  } catch (e) {
    res.status(400).json({ success: false, message: `No se pudo suscribir: ${e.message}` });
  }
};

// ── Modo individual: helpers compartidos por Baileys/FCA/IGP ───────────
// Un admin puede operar cualquier sesión (la del canal o la de cualquier
// agente); un agente normal solo puede tocar la SUYA — nunca la de otro
// compañero, ni la compartida del canal si este está en modo 'individual'.
function usuarioIdDe(req) { return req.user && (req.user.id || req.user.sub || req.user.userId); }

async function resolverCanalYUsuario(p, req, tipoEsperado) {
  const r = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
  const canal = r.recordset[0];
  if (!canal) return { error: { status: 404, message: 'No encontrado' } };
  if (tipoEsperado && (canal.CN_TIPO || '').toLowerCase() !== tipoEsperado) {
    return { error: { status: 400, message: `Este canal no es de tipo ${tipoEsperado}` } };
  }
  const individual = (canal.CN_MODO_SESION || 'compartido') === 'individual';
  const paramUsuarioId = req.params.usuarioId ? Number(req.params.usuarioId) : null;

  if (!individual) {
    // Canal compartido: solo un admin lo puede vincular/cerrar (afecta a toda
    // la campaña), y no debe llevar :usuarioId en la URL.
    if (!esAdmin(req)) return { error: { status: 403, message: 'No autorizado' } };
    return { canal, usuarioId: null };
  }

  // Canal individual: el usuarioId es obligatorio y solo puede ser el propio
  // agente, salvo que quien pide sea admin (soporte/depuración).
  if (!paramUsuarioId) return { error: { status: 400, message: 'Este canal es de sesión individual: indica el agente' } };
  if (!esAdmin(req) && paramUsuarioId !== usuarioIdDe(req)) {
    return { error: { status: 403, message: 'No puedes gestionar la sesión de otro agente' } };
  }
  return { canal, usuarioId: paramUsuarioId };
}

// ── WhatsApp vía Baileys (no oficial) ──────────────────────────────────
// Inicia (o reutiliza) la sesión y devuelve su estado actual. El QR real
// llega por socket ('cc:baileys_estado' en 'cc:baileys:{canalId}' — o
// 'cc:baileys:{canalId}:{usuarioId}' en modo individual) en cuanto Baileys
// lo genera; este endpoint solo dispara la conexión.
exports.iniciarBaileys = async (req, res) => {
  try {
    const p = await pool(req);
    const { canal, usuarioId, error } = await resolverCanalYUsuario(p, req, 'whatsapp_baileys');
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    await baileysManager.iniciarSesion(req.params.id, tenantKeyDe(req), usuarioId);
    res.json({ success: true, data: baileysManager.getEstado(req.params.id, usuarioId) });
  } catch (e) {
    console.error('ccConfig.iniciarBaileys:', e.message);
    res.status(500).json({ success: false, message: `No se pudo iniciar la sesión: ${e.message}` });
  }
};

exports.estadoBaileys = async (req, res) => {
  try {
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    res.json({ success: true, data: baileysManager.getEstado(req.params.id, usuarioId) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Cierra sesión y borra las credenciales guardadas en disco — para volver a
// vincular (otro número, o el mismo tras un logout desde el celular) hay que
// escanear el QR de nuevo desde cero.
exports.cerrarBaileys = async (req, res) => {
  try {
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req, 'whatsapp_baileys');
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    await baileysManager.cerrarSesion(req.params.id, usuarioId);
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Messenger vía FCA (no oficial) ─────────────────────────────────────
// A diferencia de Baileys, aquí la vinculación es pegar un appstate.json
// (cookies de sesión de una cuenta personal de Facebook, extraídas fuera de
// este sistema) en vez de escanear un QR — ver fcaManager.js.
exports.vincularFca = async (req, res) => {
  try {
    const { appState } = req.body || {};
    if (!appState) return res.status(400).json({ success: false, message: 'Falta el appstate.json' });
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req, 'messenger_fca');
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    // Guardamos el appstate para poder reconectar tras un reinicio del backend
    // sin que haya que volver a pegarlo (a menos que ya haya expirado).
    const asStr = typeof appState === 'string' ? appState : JSON.stringify(appState);
    if (usuarioId) {
      await p.request().input('c', sql.Int, req.params.id).input('u', sql.Int, usuarioId).input('as', sql.NVarChar(sql.MAX), asStr)
        .query(`IF NOT EXISTS (SELECT 1 FROM dbo.CCO_CANAL_AGENTE_SESION WHERE CAS_CANAL_ID=@c AND CAS_USUARIO_ID=@u)
                INSERT INTO dbo.CCO_CANAL_AGENTE_SESION (CAS_CANAL_ID, CAS_USUARIO_ID, CAS_FCA_APPSTATE) VALUES (@c, @u, @as)
                ELSE UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_FCA_APPSTATE = @as WHERE CAS_CANAL_ID=@c AND CAS_USUARIO_ID=@u`);
    } else {
      await p.request().input('id', sql.Int, req.params.id).input('as', sql.NVarChar(sql.MAX), asStr)
        .query(`UPDATE dbo.CCO_CANALES SET CN_FCA_APPSTATE = @as WHERE CN_ID = @id`);
    }
    await fcaManager.iniciarSesion(req.params.id, tenantKeyDe(req), appState, usuarioId);
    res.json({ success: true, data: fcaManager.getEstado(req.params.id, usuarioId) });
  } catch (e) {
    console.error('ccConfig.vincularFca:', e.message);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.estadoFca = async (req, res) => {
  try {
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    res.json({ success: true, data: fcaManager.getEstado(req.params.id, usuarioId) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cerrarFca = async (req, res) => {
  try {
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req, 'messenger_fca');
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    await fcaManager.cerrarSesion(req.params.id, tenantKeyDe(req), usuarioId);
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Instagram DM vía API privada (no oficial) ──────────────────────────
// Vinculación con usuario+password de una cuenta PERSONAL de Instagram (no
// hay QR ni cookies pre-extraídas como en Baileys/FCA) — ver igPrivateManager.js.
exports.vincularIgPrivate = async (req, res) => {
  try {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) return res.status(400).json({ success: false, message: 'Falta usuario o password' });
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req, 'instagram_privado');
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    await igPrivateManager.iniciarSesion(req.params.id, tenantKeyDe(req), { usuario, password }, usuarioId);
    res.json({ success: true, data: igPrivateManager.getEstado(req.params.id, usuarioId) });
  } catch (e) {
    console.error('ccConfig.vincularIgPrivate:', e.message);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.estadoIgPrivate = async (req, res) => {
  try {
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    res.json({ success: true, data: igPrivateManager.getEstado(req.params.id, usuarioId) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cerrarIgPrivate = async (req, res) => {
  try {
    const p = await pool(req);
    const { usuarioId, error } = await resolverCanalYUsuario(p, req, 'instagram_privado');
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    await igPrivateManager.cerrarSesion(req.params.id, tenantKeyDe(req), usuarioId);
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Lista, para un canal en modo 'individual', el estado de sesión de CADA
// agente del skill al que pertenece el canal (no solo los que ya iniciaron
// sesión) — así la UI puede mostrar "sin vincular" para quien todavía no lo
// ha hecho, en vez de omitirlo. Cualquier agente del skill puede consultarla
// (necesita ver quién ya está conectado para saber si falta alguien), pero
// solo ve el estado, nunca credenciales (appstate/sesión serializada no se
// exponen aquí, igual que listCanales no expone tokens).
exports.listSesionesAgentesCanal = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const canal = r.recordset[0];
    if (!canal) return res.status(404).json({ success: false, message: 'No encontrado' });
    if ((canal.CN_MODO_SESION || 'compartido') !== 'individual') {
      return res.status(400).json({ success: false, message: 'Este canal no está en modo de sesión individual' });
    }
    const rows = await p.request().input('canal', sql.Int, canal.CN_ID).input('grupo', sql.Int, canal.CN_GRUPO_ID)
      .query(`
        SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre,
               s.CAS_BAILEYS_ESTADO baileysEstado, s.CAS_BAILEYS_NUMERO baileysNumero,
               s.CAS_FCA_ESTADO fcaEstado, s.CAS_FCA_USUARIO fcaUsuario,
               s.CAS_IGP_ESTADO igpEstado, s.CAS_IGP_USUARIO igpUsuario
        FROM dbo.CCO_GRUPO_AGENTES ga
        JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ga.CGA_USUARIO_ID
        LEFT JOIN dbo.CCO_CANAL_AGENTE_SESION s ON s.CAS_CANAL_ID = @canal AND s.CAS_USUARIO_ID = ga.CGA_USUARIO_ID
        WHERE ga.CGA_GRUPO_ID = @grupo AND ga.CGA_ACTIVO = 1
        ORDER BY u.NEUS_NOMBRES
      `);
    res.json({ success: true, data: rows.recordset.map((r) => ({
      usuarioId: r.usuarioId, nombre: r.nombre,
      baileysEstado: r.baileysEstado || 'desconectado', baileysNumero: r.baileysNumero || null,
      fcaEstado: r.fcaEstado || 'desconectado', fcaUsuario: r.fcaUsuario || null,
      igpEstado: r.igpEstado || 'desconectado', igpUsuario: r.igpUsuario || null,
    })) });
  } catch (e) {
    console.error('ccConfig.listSesionesAgentesCanal:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Campañas / skills(grupos) / plantillas / motivos / tipificaciones ────
function esGestor(req) {
  return esAdmin(req);
}

exports.listCampanias = async (req, res) => {
  try {
    const p = await pool(req);
    // Conteos reales (no placeholders): canales = CN_CAMPANIA_ID de la
    // campaña; skills = grupos activos de la campaña; agentes = distinct de
    // CCO_GRUPO_AGENTES sobre esos mismos grupos (un agente en 2 skills de la
    // misma campaña cuenta una sola vez).
    const r = await p.request().query(`
      SELECT c.CM2_ID id, c.CM2_NOMBRE nombre, c.CM2_DESCRIPCION descripcion,
        c.CM2_MAX_CHATS_POR_AGENTE maxChatsPorAgente, c.CM2_ACTIVO activo,
        c.CM2_SLUG slug, c.CM2_CONTACTO_FACEBOOK_URL contactoFacebookUrl, c.CM2_CONTACTO_INSTAGRAM_URL contactoInstagramUrl,
        (SELECT COUNT(*) FROM dbo.CCO_CANALES cn WHERE cn.CN_CAMPANIA_ID = c.CM2_ID) canalesCount,
        (SELECT COUNT(*) FROM dbo.CCO_GRUPOS g WHERE g.CG_CAMPANIA_ID = c.CM2_ID AND g.CG_ACTIVO = 1) skillsCount,
        (SELECT COUNT(DISTINCT ga.CGA_USUARIO_ID) FROM dbo.CCO_GRUPO_AGENTES ga
          JOIN dbo.CCO_GRUPOS g2 ON g2.CG_ID = ga.CGA_GRUPO_ID
          WHERE g2.CG_CAMPANIA_ID = c.CM2_ID AND g2.CG_ACTIVO = 1 AND ga.CGA_ACTIVO = 1) agentesCount
      FROM dbo.CCO_CAMPANIAS c
      WHERE c.CM2_ACTIVO = 1
      ORDER BY c.CM2_NOMBRE`);
    res.json({ success: true, data: r.recordset.map((c) => ({ ...c, activo: !!c.activo })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const p = await pool(req);
    const r = await p.request().input('n', sql.NVarChar(200), b.nombre).input('d', sql.NVarChar(sql.MAX), b.descripcion || null)
      .input('m', sql.Int, b.maxChatsPorAgente || null)
      .query(`INSERT INTO dbo.CCO_CAMPANIAS (CM2_NOMBRE, CM2_DESCRIPCION, CM2_MAX_CHATS_POR_AGENTE) OUTPUT INSERTED.CM2_ID id VALUES (@n, @d, @m)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    if (b.slug !== undefined) {
      const slugNorm = String(b.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!slugNorm) return res.status(400).json({ success: false, message: 'El slug no puede quedar vacío' });
      const dup = await p.request().input('slug', sql.NVarChar(80), slugNorm).input('id', sql.Int, req.params.id)
        .query(`SELECT 1 FROM dbo.CCO_CAMPANIAS WHERE CM2_SLUG = @slug AND CM2_ID <> @id`);
      if (dup.recordset.length) return res.status(409).json({ success: false, message: 'Ese slug ya lo usa otra campaña' });
      await p.request().input('id', sql.Int, req.params.id).input('slug', sql.NVarChar(80), slugNorm)
        .query(`UPDATE dbo.CCO_CAMPANIAS SET CM2_SLUG = @slug WHERE CM2_ID = @id`);
    }
    await p.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(200), b.nombre || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('m', sql.Int, b.maxChatsPorAgente ?? null)
      .input('fb', sql.NVarChar(300), b.contactoFacebookUrl ?? null).input('ig', sql.NVarChar(300), b.contactoInstagramUrl ?? null)
      .query(`UPDATE dbo.CCO_CAMPANIAS SET CM2_NOMBRE = ISNULL(@n, CM2_NOMBRE), CM2_DESCRIPCION = @d, CM2_MAX_CHATS_POR_AGENTE = @m,
              CM2_CONTACTO_FACEBOOK_URL = @fb, CM2_CONTACTO_INSTAGRAM_URL = @ig WHERE CM2_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_CAMPANIAS SET CM2_ACTIVO = 0 WHERE CM2_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Supervisores por CAMPAÑA completa — CC_CAMPANIAS_SUPERVISORES (mismo par
// usado por el módulo Supervisor > Administrar; se expone también acá para
// asignarlo sin salir de Configuración > Campañas y skills).
exports.getSupervisoresDeCampania = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, req.params.id).query(`
      SELECT cs.CS_SUPERVISOR_ID usuarioId, u.NEUS_NOMBRES nombre
      FROM dbo.CC_CAMPANIAS_SUPERVISORES cs LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = cs.CS_SUPERVISOR_ID
      WHERE cs.CS_CAMPANIA_ID = @c ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.asignarSupervisorACampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('c', sql.Int, req.params.id).input('u', sql.Int, req.body?.usuarioId)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c AND CS_SUPERVISOR_ID = @u)
              INSERT INTO dbo.CC_CAMPANIAS_SUPERVISORES (CS_CAMPANIA_ID, CS_SUPERVISOR_ID) VALUES (@c, @u);`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.quitarSupervisorDeCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('c', sql.Int, req.params.id).input('u', sql.Int, req.params.usuarioId)
      .query(`DELETE FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c AND CS_SUPERVISOR_ID = @u`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.listGrupos = async (req, res) => {
  try {
    const p = await pool(req);
    const rq = p.request();
    let where = 'g.CG_ACTIVO = 1';
    if (req.query.campaniaId) { rq.input('c', sql.Int, req.query.campaniaId); where += ' AND g.CG_CAMPANIA_ID = @c'; }
    // "Skill principal" = el primero creado de la campaña (menor CG_ID entre
    // los activos) — no hay un flag propio en el esquema, así que se deriva
    // por orden de creación en vez de inventar una columna nueva para esto.
    const r = await rq.query(`
      SELECT g.CG_ID id, g.CG_CAMPANIA_ID campaniaId, g.CG_NOMBRE nombre, g.CG_DESCRIPCION descripcion,
        g.CG_ICONO icono, g.CG_ACTIVO activo,
        (SELECT COUNT(*) FROM dbo.CCO_GRUPO_AGENTES ga WHERE ga.CGA_GRUPO_ID = g.CG_ID AND ga.CGA_ACTIVO = 1) agentesCount,
        CASE WHEN g.CG_ID = (
          SELECT MIN(g2.CG_ID) FROM dbo.CCO_GRUPOS g2 WHERE g2.CG_CAMPANIA_ID = g.CG_CAMPANIA_ID AND g2.CG_ACTIVO = 1
        ) THEN 1 ELSE 0 END esPrincipal
      FROM dbo.CCO_GRUPOS g
      WHERE ${where}
      ORDER BY g.CG_NOMBRE`);
    res.json({ success: true, data: r.recordset.map((g) => ({ ...g, activo: !!g.activo, esPrincipal: !!g.esPrincipal })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.campaniaId || !b.nombre) return res.status(400).json({ success: false, message: 'Falta campaña o nombre' });
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, b.campaniaId).input('n', sql.NVarChar(120), b.nombre)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion || null).input('i', sql.NVarChar(10), b.icono || '💬')
      .query(`INSERT INTO dbo.CCO_GRUPOS (CG_CAMPANIA_ID, CG_NOMBRE, CG_DESCRIPCION, CG_ICONO) OUTPUT INSERTED.CG_ID id VALUES (@c, @n, @d, @i)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(120), b.nombre || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null).input('i', sql.NVarChar(10), b.icono || null)
      .query(`UPDATE dbo.CCO_GRUPOS SET CG_NOMBRE = ISNULL(@n, CG_NOMBRE), CG_DESCRIPCION = @d, CG_ICONO = ISNULL(@i, CG_ICONO) WHERE CG_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const uso = await p.request().input('id', sql.Int, req.params.id).query(`SELECT COUNT(*) n FROM dbo.CCO_GRUPO_AGENTES WHERE CGA_GRUPO_ID = @id AND CGA_ACTIVO = 1`);
    if (uso.recordset[0].n > 0) return res.status(400).json({ success: false, message: 'El skill tiene agentes asignados' });
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_GRUPOS SET CG_ACTIVO = 0 WHERE CG_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getAgentesDeGrupo = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId).query(`
      SELECT ga.CGA_USUARIO_ID usuarioId, u.NEUS_NOMBRES nombre
      FROM dbo.CCO_GRUPO_AGENTES ga LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ga.CGA_USUARIO_ID
      WHERE ga.CGA_GRUPO_ID = @g AND ga.CGA_ACTIVO = 1 ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.asignarAgenteAGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('g', sql.Int, req.params.grupoId).input('u', sql.Int, req.body?.usuarioId)
      .query(`MERGE dbo.CCO_GRUPO_AGENTES AS t USING (SELECT @g g, @u u) s ON t.CGA_GRUPO_ID = s.g AND t.CGA_USUARIO_ID = s.u
              WHEN MATCHED THEN UPDATE SET CGA_ACTIVO = 1 WHEN NOT MATCHED THEN INSERT (CGA_GRUPO_ID, CGA_USUARIO_ID) VALUES (@g, @u);`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.quitarAgenteDeGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('g', sql.Int, req.params.grupoId).input('u', sql.Int, req.params.usuarioId)
      .query(`UPDATE dbo.CCO_GRUPO_AGENTES SET CGA_ACTIVO = 0 WHERE CGA_GRUPO_ID = @g AND CGA_USUARIO_ID = @u`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Supervisores por skill (asignación granular, dentro de un solo grupo/skill
// de la campaña) — mismo patrón que agentes por grupo, tabla CCO_GRUPO_SUPERVISORES.
exports.getSupervisoresDeGrupo = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId).query(`
      SELECT gs.GS_SUPERVISOR_ID usuarioId, u.NEUS_NOMBRES nombre
      FROM dbo.CCO_GRUPO_SUPERVISORES gs LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = gs.GS_SUPERVISOR_ID
      WHERE gs.GS_GRUPO_ID = @g ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.asignarSupervisorAGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('g', sql.Int, req.params.grupoId).input('u', sql.Int, req.body?.usuarioId)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID = @g AND GS_SUPERVISOR_ID = @u)
              INSERT INTO dbo.CCO_GRUPO_SUPERVISORES (GS_GRUPO_ID, GS_SUPERVISOR_ID) VALUES (@g, @u);`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.quitarSupervisorDeGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('g', sql.Int, req.params.grupoId).input('u', sql.Int, req.params.usuarioId)
      .query(`DELETE FROM dbo.CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID = @g AND GS_SUPERVISOR_ID = @u`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Matriz agente × skill (para la pantalla de asignación)
exports.getMatrizAgentes = async (req, res) => {
  try {
    const p = await pool(req);
    const grupos = await p.request().query(`SELECT CG_ID id, CG_NOMBRE nombre, CG_ICONO icono FROM dbo.CCO_GRUPOS WHERE CG_ACTIVO = 1 ORDER BY CG_NOMBRE`);
    const asign = await p.request().query(`SELECT CGA_USUARIO_ID usuarioId, CGA_GRUPO_ID grupoId FROM dbo.CCO_GRUPO_AGENTES WHERE CGA_ACTIVO = 1`);
    res.json({ success: true, data: { grupos: grupos.recordset, asignaciones: asign.recordset } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Skills (CCO_GRUPOS) y campañas del agente que hace la petición — reverso de
// getAgentesDeGrupo. Se usa en "Mi día" para que cada agente vea en qué
// campañas/skills está enrolado, sin exponer la asignación de nadie más.
exports.getMisSkills = async (req, res) => {
  try {
    const uid = usuarioIdDe(req);
    if (!uid) return res.status(401).json({ success: false, message: 'No autenticado' });
    const p = await pool(req);
    const r = await p.request().input('u', sql.Int, uid).query(`
      SELECT g.CG_ID id, g.CG_NOMBRE nombre, g.CG_ICONO icono,
        c.CM2_ID campaniaId, c.CM2_NOMBRE campaniaNombre
      FROM dbo.CCO_GRUPO_AGENTES ga
      JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID AND g.CG_ACTIVO = 1
      JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = g.CG_CAMPANIA_ID
      WHERE ga.CGA_USUARIO_ID = @u AND ga.CGA_ACTIVO = 1
      ORDER BY c.CM2_NOMBRE, g.CG_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Tipificaciones ──────────────────────────────────────────────────────
exports.listTipificaciones = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`SELECT CT_ID id, CT_CAMPANIA_ID campaniaId, CT_NOMBRE nombre, CT_DESCRIPCION descripcion,
      CT_REQUIERE_COMENTARIO requiereComentario, CT_ORDEN orden FROM dbo.CCO_TIPIFICACIONES WHERE CT_ACTIVO = 1 ORDER BY CT_ORDEN, CT_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createTipificacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, b.campaniaId || null).input('n', sql.NVarChar(200), b.nombre)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion || null).input('rc', sql.Bit, !!b.requiereComentario).input('o', sql.Int, b.orden || 0)
      .query(`INSERT INTO dbo.CCO_TIPIFICACIONES (CT_CAMPANIA_ID, CT_NOMBRE, CT_DESCRIPCION, CT_REQUIERE_COMENTARIO, CT_ORDEN) OUTPUT INSERTED.CT_ID id VALUES (@c, @n, @d, @rc, @o)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateTipificacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(200), b.nombre || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('rc', sql.Bit, b.requiereComentario != null ? !!b.requiereComentario : null).input('o', sql.Int, b.orden ?? null)
      .input('c', sql.Int, b.campaniaId ?? null)
      .query(`UPDATE dbo.CCO_TIPIFICACIONES SET CT_NOMBRE = ISNULL(@n, CT_NOMBRE), CT_DESCRIPCION = @d,
        CT_REQUIERE_COMENTARIO = ISNULL(@rc, CT_REQUIERE_COMENTARIO), CT_ORDEN = ISNULL(@o, CT_ORDEN), CT_CAMPANIA_ID = @c WHERE CT_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteTipificacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_TIPIFICACIONES SET CT_ACTIVO = 0 WHERE CT_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Motivos de cierre por grupo ────────────────────────────────────────
exports.listMotivos = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId)
      .query(`SELECT CMC_ID id, CMC_MOTIVO motivo, CMC_DESCRIPCION descripcion, CMC_REQUIERE_COMENTARIO requiereComentario, CMC_ORDEN orden
              FROM dbo.CCO_MOTIVOS_CIERRE WHERE CMC_GRUPO_ID = @g AND CMC_ACTIVO = 1 ORDER BY CMC_ORDEN`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createMotivo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.motivo) return res.status(400).json({ success: false, message: 'Falta el motivo' });
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId).input('m', sql.NVarChar(200), b.motivo)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion || null).input('rc', sql.Bit, !!b.requiereComentario).input('o', sql.Int, b.orden || 0)
      .query(`INSERT INTO dbo.CCO_MOTIVOS_CIERRE (CMC_GRUPO_ID, CMC_MOTIVO, CMC_DESCRIPCION, CMC_REQUIERE_COMENTARIO, CMC_ORDEN) OUTPUT INSERTED.CMC_ID id VALUES (@g, @m, @d, @rc, @o)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateMotivo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('m', sql.NVarChar(200), b.motivo || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('rc', sql.Bit, b.requiereComentario != null ? !!b.requiereComentario : null).input('o', sql.Int, b.orden ?? null)
      .query(`UPDATE dbo.CCO_MOTIVOS_CIERRE SET CMC_MOTIVO = ISNULL(@m, CMC_MOTIVO), CMC_DESCRIPCION = @d,
        CMC_REQUIERE_COMENTARIO = ISNULL(@rc, CMC_REQUIERE_COMENTARIO), CMC_ORDEN = ISNULL(@o, CMC_ORDEN) WHERE CMC_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteMotivo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_MOTIVOS_CIERRE SET CMC_ACTIVO = 0 WHERE CMC_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Plantillas por grupo ───────────────────────────────────────────────
exports.listPlantillas = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId)
      .query(`SELECT CP_ID id, CP_NOMBRE nombre, CP_CONTENIDO contenido, CP_VISIBILIDAD visibilidad, CP_USUARIO_ID usuarioId
              FROM dbo.CCO_PLANTILLAS WHERE CP_GRUPO_ID = @g AND CP_ACTIVO = 1 ORDER BY CP_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createPlantilla = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.nombre || !b.contenido) return res.status(400).json({ success: false, message: 'Falta nombre o contenido' });
    const p = await pool(req);
    const uid = req.user && (req.user.id || req.user.sub);
    const visibilidad = b.visibilidad === 'privada' ? 'privada' : 'publica';
    if (visibilidad === 'publica' && !esGestor(req)) return res.status(403).json({ success: false, message: 'Solo un gestor crea plantillas públicas' });
    const r = await p.request().input('g', sql.Int, req.params.grupoId).input('n', sql.NVarChar(200), b.nombre)
      .input('c', sql.NVarChar(sql.MAX), b.contenido).input('v', sql.NVarChar(20), visibilidad).input('u', sql.Int, visibilidad === 'privada' ? uid : null)
      .query(`INSERT INTO dbo.CCO_PLANTILLAS (CP_GRUPO_ID, CP_NOMBRE, CP_CONTENIDO, CP_VISIBILIDAD, CP_USUARIO_ID) OUTPUT INSERTED.CP_ID id VALUES (@g, @n, @c, @v, @u)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updatePlantilla = async (req, res) => {
  try {
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).input('n', sql.NVarChar(200), b.nombre || null).input('c', sql.NVarChar(sql.MAX), b.contenido ?? null)
      .query(`UPDATE dbo.CCO_PLANTILLAS SET CP_NOMBRE = ISNULL(@n, CP_NOMBRE), CP_CONTENIDO = ISNULL(@c, CP_CONTENIDO) WHERE CP_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deletePlantilla = async (req, res) => {
  try {
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_PLANTILLAS SET CP_ACTIVO = 0 WHERE CP_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Contacto público de una campaña (sin auth) ──────────────────────────
// Lo consume extra/Postulacion-Ayudantes/contacto.html (o cualquier página
// externa) para mostrar botones reales de WhatsApp/Facebook/Instagram sin
// exponer nada sensible: solo el número de WhatsApp SI el canal Baileys de
// la campaña está 'conectado' (nunca mientras espera QR), y las URLs de
// Facebook/Instagram que el admin haya capturado a mano (ver comentario en
// schemaService sobre por qué esas dos no salen del canal FCA/IGP). No
// requiere sesión — cualquiera puede consultar el contacto de una campaña
// por su slug público, igual que ya podía verlo en la página del sitio.
exports.getContactoPublicoCampania = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('slug', sql.NVarChar(80), String(req.params.slug || '').toLowerCase())
      .query(`
        SELECT c.CM2_ID id, c.CM2_NOMBRE nombre,
               c.CM2_CONTACTO_FACEBOOK_URL facebookUrl, c.CM2_CONTACTO_INSTAGRAM_URL instagramUrl,
               (SELECT TOP 1 CN_BAILEYS_NUMERO FROM dbo.CCO_CANALES
                 WHERE CN_CAMPANIA_ID = c.CM2_ID AND CN_TIPO = 'whatsapp_baileys'
                   AND CN_HABILITADO = 1 AND CN_BAILEYS_ESTADO = 'conectado'
                 ORDER BY CN_ID) whatsapp
        FROM dbo.CCO_CAMPANIAS c
        WHERE c.CM2_SLUG = @slug AND c.CM2_ACTIVO = 1
      `);
    const camp = r.recordset[0];
    if (!camp) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });

    // Horario global de Omnicanal (CCO_CONFIG, el mismo que ya se edita en
    // Configuración > Contact Center > SLA/ACW y horario) — así páginas
    // externas como contacto.html respetan el mismo horario que el resto
    // del sistema, sin duplicar esa configuración a mano en otro lado.
    await ensureConfigRow(p);
    const cfgRow = (await p.request().query('SELECT TOP 1 CF_HORARIO_INICIO, CF_HORARIO_FIN, CF_DIAS_SEMANA FROM dbo.CCO_CONFIG ORDER BY CF_ID')).recordset[0];

    res.json({
      success: true,
      data: {
        nombre: camp.nombre,
        whatsapp: camp.whatsapp || null,
        facebookUrl: camp.facebookUrl || null,
        instagramUrl: camp.instagramUrl || null,
        horarioInicio: cfgRow?.CF_HORARIO_INICIO || null,
        horarioFin: cfgRow?.CF_HORARIO_FIN || null,
        diasSemana: cfgRow?.CF_DIAS_SEMANA || '1,2,3,4,5',
      },
    });
  } catch (e) {
    console.error('ccConfig.getContactoPublicoCampania:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// ── Postulantes de una campaña (registro público + listado interno) ────
// Lo consume extra/Postulacion-Ayudantes/registro.html (sin login: cualquiera
// con el link/QR puede postularse) y, del lado de gestión, la pantalla
// interna donde reclutamiento revisa quién se ha registrado.
exports.registrarPostulantePublico = async (req, res) => {
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const telefono = String(b.telefono || '').replace(/\D/g, '');
    const correo = b.correo ? String(b.correo).trim().slice(0, 200) : null;
    const redesSociales = Array.isArray(b.redesSociales) ? b.redesSociales : [];

    if (!nombre || !telefono) {
      return res.status(400).json({ success: false, message: 'Nombre y teléfono son obligatorios' });
    }
    if (telefono.length < 10) {
      return res.status(400).json({ success: false, message: 'Teléfono inválido' });
    }

    const p = await pool(req);
    const camp = await p.request().input('slug', sql.NVarChar(80), String(req.params.slug || '').toLowerCase())
      .query(`SELECT CM2_ID id FROM dbo.CCO_CAMPANIAS WHERE CM2_SLUG = @slug AND CM2_ACTIVO = 1`);
    if (!camp.recordset.length) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });

    const redesTexto = redesSociales
      .filter((r) => r && typeof r.usuario === 'string' && r.usuario.trim())
      .map((r) => `${String(r.red || '').trim()}: ${r.usuario.trim()}`)
      .join('\n')
      .slice(0, 4000) || null;

    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 50);

    await p.request()
      .input('c', sql.Int, camp.recordset[0].id)
      .input('n', sql.NVarChar(200), nombre.slice(0, 200))
      .input('t', sql.NVarChar(20), telefono.slice(0, 20))
      .input('co', sql.NVarChar(200), correo)
      .input('rs', sql.NVarChar(sql.MAX), redesTexto)
      .input('ip', sql.NVarChar(50), ip || null)
      .query(`INSERT INTO dbo.CCO_CAMPANIA_POSTULANTES (CP_CAMPANIA_ID, CP_NOMBRE, CP_TELEFONO, CP_CORREO, CP_REDES_SOCIALES, CP_IP)
              VALUES (@c, @n, @t, @co, @rs, @ip)`);

    res.status(201).json({ success: true, message: 'Postulación registrada' });
  } catch (e) {
    console.error('ccConfig.registrarPostulantePublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al registrar la postulación' });
  }
};

exports.listPostulantesCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, req.params.id).query(`
      SELECT CP_ID id, CP_NOMBRE nombre, CP_TELEFONO telefono, CP_CORREO correo,
             CP_REDES_SOCIALES redesSociales, CP_FECHA_REGISTRO fechaRegistro
      FROM dbo.CCO_CAMPANIA_POSTULANTES
      WHERE CP_CAMPANIA_ID = @c
      ORDER BY CP_FECHA_REGISTRO DESC`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('ccConfig.listPostulantesCampania:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};
