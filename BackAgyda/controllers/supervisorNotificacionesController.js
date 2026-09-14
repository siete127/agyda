// Notificaciones del supervisor a agentes — Fase 2, punto 3.3 del plan de
// evolución basado en PSUP de Mitrol. Dos tipos: 'informativa' (el agente la
// cierra cuando quiera) y 'obligatoria' (bloquea su pantalla hasta cerrarla).
// El alcance decide a quién llega: 'agente', 'skill', 'campania' o 'todos'.
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { DEFAULT_TENANT } = require('../config/tenants');

function tenantKeyDe(req) {
  return (req?.user?.empresa || DEFAULT_TENANT).toLowerCase();
}
function usuarioIdDe(req) {
  return req.user && (req.user.id || req.user.sub || req.user.userId);
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }

// Resuelve la lista de NEUS_ID de agentes destino según el alcance elegido.
async function resolverDestinatarios(p, alcance, alcanceId) {
  if (alcance === 'agente') {
    return [Number(alcanceId)];
  }
  if (alcance === 'skill') {
    const r = await p.request().input('g', sql.Int, alcanceId).query(
      `SELECT DISTINCT CGA_USUARIO_ID id FROM dbo.CCO_GRUPO_AGENTES WHERE CGA_GRUPO_ID = @g AND CGA_ACTIVO = 1`);
    return r.recordset.map((x) => x.id);
  }
  if (alcance === 'campania') {
    const r = await p.request().input('c', sql.Int, alcanceId).query(`
      SELECT DISTINCT ga.CGA_USUARIO_ID id
      FROM dbo.CCO_GRUPO_AGENTES ga
      JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE g.CG_CAMPANIA_ID = @c AND ga.CGA_ACTIVO = 1`);
    return r.recordset.map((x) => x.id);
  }
  // 'todos'
  const r = await p.request().query(`SELECT NEUS_ID id FROM dbo.NEUS_USUARIOS WHERE NEUS_ACTIVO = 1`);
  return r.recordset.map((x) => x.id);
}

// Verifica que el supervisor pueda enviar hacia ese alcance (AD/TI sin
// restricción; un supervisor solo hacia sus propias campañas asignadas, y
// solo hacia agentes/skills que pertenezcan a ellas — mismo criterio que
// supervisorAlarmasController.listInstancias).
async function puedeNotificar(p, req, alcance, alcanceId) {
  const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
  if (['AD', 'TI'].includes(tipoUsuario)) return true;
  if (alcance === 'todos') return false;
  const uid = usuarioIdDe(req);
  if (alcance === 'campania') {
    const r = await p.request().input('c', sql.Int, alcanceId).input('uid', sql.Int, uid).query(
      `SELECT 1 FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c AND CS_SUPERVISOR_ID = @uid`);
    return !!r.recordset[0];
  }
  if (alcance === 'skill') {
    const r = await p.request().input('g', sql.Int, alcanceId).input('uid', sql.Int, uid).query(`
      SELECT 1 FROM dbo.CCO_GRUPOS g
      WHERE g.CG_ID = @g AND g.CG_CAMPANIA_ID IN (SELECT CS_CAMPANIA_ID FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)`);
    return !!r.recordset[0];
  }
  if (alcance === 'agente') {
    const r = await p.request().input('a', sql.Int, alcanceId).input('uid', sql.Int, uid).query(`
      SELECT 1 FROM dbo.CCO_GRUPO_AGENTES ga
      JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE ga.CGA_USUARIO_ID = @a AND ga.CGA_ACTIVO = 1
        AND g.CG_CAMPANIA_ID IN (SELECT CS_CAMPANIA_ID FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)`);
    return !!r.recordset[0];
  }
  return false;
}

function emitir(tenantKey, room, evento, payload) {
  try { socketService.getIO(tenantKey || DEFAULT_TENANT).to(room).emit(evento, payload); }
  catch (e) { console.warn('[supervisorNotificaciones] emit falló:', e?.message || e); }
}

// POST /operaciones/supervisores/notificaciones
// Se reutiliza en supervisorAccionesRemotasController (3.7) para el mismo
// chequeo "¿puedo actuar sobre este agente puntual?" — evita duplicar la
// consulta de CC_CAMPANIAS_SUPERVISORES/CCO_GRUPO_AGENTES.
exports.puedeNotificar = puedeNotificar;

exports.crear = async (req, res) => {
  try {
    const p = await pool(req);
    const tipo = req.body?.tipo === 'obligatoria' ? 'obligatoria' : 'informativa';
    const alcance = ['agente', 'skill', 'campania', 'todos'].includes(req.body?.alcance) ? req.body.alcance : null;
    const alcanceId = alcance === 'todos' ? null : Number(req.body?.alcanceId);
    const mensaje = (req.body?.mensaje || '').toString().trim();

    if (!alcance) return res.status(400).json({ success: false, message: 'Alcance inválido' });
    if (alcance !== 'todos' && !Number.isInteger(alcanceId)) return res.status(400).json({ success: false, message: 'Falta el destino' });
    if (!mensaje) return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });

    if (!(await puedeNotificar(p, req, alcance, alcanceId))) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para notificar a ese destino' });
    }

    const uid = usuarioIdDe(req);
    const nombre = req.user?.nombres || req.user?.nombre || String(uid);
    const ins = await p.request()
      .input('tipo', sql.NVarChar(20), tipo).input('alc', sql.NVarChar(20), alcance)
      .input('alcId', sql.Int, alcance === 'todos' ? null : alcanceId)
      .input('msg', sql.NVarChar(1000), mensaje).input('autor', sql.Int, uid).input('autorN', sql.NVarChar(160), nombre)
      .query(`INSERT INTO dbo.CSA_NOTIFICACIONES (CSN_TIPO, CSN_ALCANCE, CSN_ALCANCE_ID, CSN_MENSAJE, CSN_AUTOR_ID, CSN_AUTOR_NOMBRE)
              OUTPUT INSERTED.CSN_ID id, INSERTED.CSN_FECHA_CREACION fecha
              VALUES (@tipo, @alc, @alcId, @msg, @autor, @autorN)`);
    const { id, fecha } = ins.recordset[0];

    const destinatarios = await resolverDestinatarios(p, alcance, alcanceId);
    const tenantKey = tenantKeyDe(req);
    const payload = { id, tipo, mensaje, autorNombre: nombre, fecha };
    for (const destId of destinatarios) {
      emitir(tenantKey, `user:${destId}`, 'cs:notificacion', payload);
    }

    res.json({ success: true, data: { id, destinatarios: destinatarios.length } });
  } catch (e) {
    console.error('supervisorNotificaciones.crear:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la notificación' });
  }
};

// GET /operaciones/supervisores/notificaciones/pendientes — las que el
// agente autenticado todavía no cerró (para cuando se conecta después de
// enviada, o recarga la página con una obligatoria sin cerrar).
exports.pendientes = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const r = await p.request().input('uid', sql.Int, uid).query(`
      SELECT n.CSN_ID id, n.CSN_TIPO tipo, n.CSN_MENSAJE mensaje, n.CSN_AUTOR_NOMBRE autorNombre, n.CSN_FECHA_CREACION fecha
      FROM dbo.CSA_NOTIFICACIONES n
      WHERE (n.CSN_FECHA_VENCIMIENTO IS NULL OR n.CSN_FECHA_VENCIMIENTO > GETDATE())
        AND NOT EXISTS (SELECT 1 FROM dbo.CSA_NOTIFICACION_LECTURAS l WHERE l.CSNL_NOTIFICACION_ID = n.CSN_ID AND l.CSNL_USUARIO_ID = @uid)
        AND (
          (n.CSN_ALCANCE = 'todos')
          OR (n.CSN_ALCANCE = 'agente' AND n.CSN_ALCANCE_ID = @uid)
          OR (n.CSN_ALCANCE = 'skill' AND n.CSN_ALCANCE_ID IN (
            SELECT CGA_GRUPO_ID FROM dbo.CCO_GRUPO_AGENTES WHERE CGA_USUARIO_ID = @uid AND CGA_ACTIVO = 1
          ))
          OR (n.CSN_ALCANCE = 'campania' AND n.CSN_ALCANCE_ID IN (
            SELECT g.CG_CAMPANIA_ID FROM dbo.CCO_GRUPO_AGENTES ga JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
            WHERE ga.CGA_USUARIO_ID = @uid AND ga.CGA_ACTIVO = 1
          ))
        )
      ORDER BY n.CSN_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('supervisorNotificaciones.pendientes:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar notificaciones' });
  }
};

// POST /operaciones/supervisores/notificaciones/:id/cerrar — el agente la
// marca como vista/cerrada (única forma de que una 'obligatoria' deje de
// bloquear su pantalla).
exports.cerrar = async (req, res) => {
  try {
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    await p.request().input('n', sql.Int, req.params.id).input('uid', sql.Int, uid).query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.CSA_NOTIFICACION_LECTURAS WHERE CSNL_NOTIFICACION_ID = @n AND CSNL_USUARIO_ID = @uid)
        INSERT INTO dbo.CSA_NOTIFICACION_LECTURAS (CSNL_NOTIFICACION_ID, CSNL_USUARIO_ID) VALUES (@n, @uid)`);
    res.json({ success: true });
  } catch (e) {
    console.error('supervisorNotificaciones.cerrar:', e.message);
    res.status(500).json({ success: false, message: 'Error al cerrar la notificación' });
  }
};

// GET /operaciones/supervisores/notificaciones — historial de notificaciones
// enviadas (para que el supervisor vea lo que él mismo mandó). AD/TI ven todas.
exports.listEnviadas = async (req, res) => {
  try {
    const p = await pool(req);
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const rq = p.request();
    let where = '';
    if (!esAdmin) {
      rq.input('uid', sql.Int, usuarioIdDe(req));
      where = 'WHERE n.CSN_AUTOR_ID = @uid';
    }
    const r = await rq.query(`
      SELECT n.CSN_ID id, n.CSN_TIPO tipo, n.CSN_ALCANCE alcance, n.CSN_ALCANCE_ID alcanceId,
             n.CSN_MENSAJE mensaje, n.CSN_AUTOR_NOMBRE autorNombre, n.CSN_FECHA_CREACION fecha
      FROM dbo.CSA_NOTIFICACIONES n
      ${where}
      ORDER BY n.CSN_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('supervisorNotificaciones.listEnviadas:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar notificaciones enviadas' });
  }
};
