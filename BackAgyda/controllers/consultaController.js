const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { getUserAllowedActions } = require('../middleware/moduleAccess');

async function ensureTables(tenantKey) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CONSULTAS')
      CREATE TABLE CONSULTAS (
        CONSULTA_ID    INT IDENTITY(1,1) PRIMARY KEY,
        USUARIO_ID     INT NOT NULL,
        CLIENTE_NOMBRE NVARCHAR(200) NOT NULL,
        CLIENTE_TEL    NVARCHAR(30) NULL,
        CLIENTE_EMAIL  NVARCHAR(200) NULL,
        ASUNTO         NVARCHAR(200) NOT NULL,
        MENSAJE        NVARCHAR(MAX) NOT NULL,
        ESTATUS        NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
        FECHA          DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CONSULTAS_COMENTARIOS')
      CREATE TABLE CONSULTAS_COMENTARIOS (
        COM_ID       INT IDENTITY(1,1) PRIMARY KEY,
        CONSULTA_ID  INT NOT NULL,
        USUARIO_ID   INT NOT NULL,
        CONTENIDO    NVARCHAR(2000) NOT NULL,
        FECHA        DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    // Fase 8: FK opcional al cliente real (CRM_CONTACTOS) — CLIENTE_NOMBRE se
    // mantiene como texto libre para cuando el cliente aún no está dado de alta.
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CONSULTAS') AND name = 'CONSULTA_CONTACTO_ID')
      ALTER TABLE CONSULTAS ADD CONSULTA_CONTACTO_ID INT NULL
        CONSTRAINT FK_CONSULTA_CONTACTO REFERENCES CRM_CONTACTOS(CONT_ID);
    `);
  } catch (e) {
    console.warn(`No se pudo asegurar tablas de consultas (empresa: ${tenantKey}):`, e.message);
  }
}
require('../config/tenants').listTenants().forEach(({ key }) => ensureTables(key));

// Un usuario puede ver/gestionar todas las consultas si tiene la acción
// 'gestionar-consultas' del módulo atencion-cliente (asignable independientemente
// del rol desde Accesos), no por un rol fijo como AD.
async function puedeGestionarTodas(userId) {
  const allowed = await getUserAllowedActions(userId, 'atencion-cliente');
  return allowed.has('*') || allowed.has('gestionar-consultas');
}

exports.getConsultas = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const gestionaTodas = await puedeGestionarTodas(userId);
    const { desde, hasta, nombre, cliente } = req.query;

    if (gestionaTodas) {
      const request = pool.request();
      const condiciones = [];
      if (desde) { request.input('desde', sql.DateTime, new Date(desde)); condiciones.push('c.FECHA >= @desde'); }
      if (hasta) { request.input('hasta', sql.DateTime, new Date(hasta + 'T23:59:59')); condiciones.push('c.FECHA <= @hasta'); }
      if (nombre) { request.input('nombre', sql.NVarChar, `%${nombre}%`); condiciones.push('u.NEUS_NOMBRES LIKE @nombre'); }
      if (cliente) { request.input('cliente', sql.NVarChar, `%${cliente}%`); condiciones.push('c.CLIENTE_NOMBRE LIKE @cliente'); }
      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT c.CONSULTA_ID as id, c.USUARIO_ID as usuarioId, c.CLIENTE_NOMBRE as clienteNombre,
               c.CLIENTE_TEL as clienteTel, c.CLIENTE_EMAIL as clienteEmail, c.CONSULTA_CONTACTO_ID as contactoId,
               c.ASUNTO as asunto, c.MENSAJE as mensaje, c.FECHA as fecha, c.ESTATUS as estatus,
               u.NEUS_NOMBRES as usuarioNombre, u.NEUS_TIPOUSUARIO as usuarioRol
        FROM CONSULTAS c
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USUARIO_ID
        ${where}
        ORDER BY c.FECHA DESC
      `);
      return res.json({ success: true, data: result.recordset });
    }

    const result = await pool.request()
      .input('usuarioId', sql.Int, userId)
      .query(`
        SELECT CONSULTA_ID as id, USUARIO_ID as usuarioId, CLIENTE_NOMBRE as clienteNombre,
               CLIENTE_TEL as clienteTel, CLIENTE_EMAIL as clienteEmail, CONSULTA_CONTACTO_ID as contactoId,
               ASUNTO as asunto, MENSAJE as mensaje, FECHA as fecha, ESTATUS as estatus
        FROM CONSULTAS
        WHERE USUARIO_ID = @usuarioId
        ORDER BY FECHA DESC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo consultas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createConsulta = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const { clienteNombre, clienteTel, clienteEmail, asunto, mensaje, contactoId } = req.body;
    if (!clienteNombre?.trim() || !asunto?.trim() || !mensaje?.trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const insertResult = await pool.request()
      .input('usuarioId', sql.Int, userId)
      .input('clienteNombre', sql.NVarChar, clienteNombre.trim())
      .input('clienteTel', sql.NVarChar, clienteTel?.trim() || null)
      .input('clienteEmail', sql.NVarChar, clienteEmail?.trim() || null)
      .input('contactoId', sql.Int, contactoId ? parseInt(contactoId, 10) : null)
      .input('asunto', sql.NVarChar, asunto.trim())
      .input('mensaje', sql.NVarChar, mensaje.trim())
      .query(`
        DECLARE @newId TABLE (ID INT);
        INSERT INTO CONSULTAS (USUARIO_ID, CLIENTE_NOMBRE, CLIENTE_TEL, CLIENTE_EMAIL, CONSULTA_CONTACTO_ID, ASUNTO, MENSAJE, FECHA, ESTATUS)
        OUTPUT INSERTED.CONSULTA_ID INTO @newId(ID)
        VALUES (@usuarioId, @clienteNombre, @clienteTel, @clienteEmail, @contactoId, @asunto, @mensaje, GETDATE(), 'pendiente');
        SELECT n.ID as consultaId, u.NEUS_NOMBRES as nombreUsuario
        FROM @newId n
        CROSS JOIN (SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @usuarioId) u
      `);

    const fila = insertResult.recordset[0];
    const consultaId = fila?.consultaId;
    const nombreUsuario = fila?.nombreUsuario || 'Un usuario';

    // Notificar a quienes tienen 'notificar-correo' habilitado para este módulo,
    // vía el mecanismo genérico de notificaciones (no correo directo aquí).
    try {
      const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
      const destinatarios = await getUsuariosParaNotificarCorreo('atencion-cliente', req.user?.empresa);
      for (const uid of destinatarios) {
        notificationService.createNotification({
          usuarioId: Number(uid),
          mensaje: `📞 ${nombreUsuario} registró una consulta de ${clienteNombre.trim()}: "${asunto.trim()}"`,
          tipo: 'consulta_nueva',
          dataExtra: { consultaId, nombreUsuario, asunto: asunto.trim() },
          tenantKey: req.user?.empresa,
        }).catch(() => {});
      }
    } catch (notifErr) {
      console.warn('No se pudo notificar nueva consulta:', notifErr?.message);
    }

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'atencion-cliente', accion: 'crear-consulta', entidadId: String(consultaId || ''), detalle: { asunto }, ip: req.ip });
    res.status(201).json({ success: true, message: 'Consulta registrada', consultaId });
  } catch (e) {
    console.error('Error registrando consulta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEstatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    const consultaId = Number(req.params.consultaId);
    const { estatus } = req.body;
    const ESTATUSES_VALIDOS = ['pendiente', 'proceso', 'resuelta'];
    if (!consultaId || !ESTATUSES_VALIDOS.includes(estatus)) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const gestionaTodas = await puedeGestionarTodas(userId);
    const request = pool.request().input('consultaId', sql.Int, consultaId).input('estatus', sql.NVarChar, estatus);
    if (!gestionaTodas) request.input('usuarioId', sql.Int, userId);

    const result = await request.query(`
      UPDATE CONSULTAS SET ESTATUS = @estatus
      WHERE CONSULTA_ID = @consultaId ${gestionaTodas ? '' : 'AND USUARIO_ID = @usuarioId'};
      SELECT @@ROWCOUNT as affected
    `);

    if (!result.recordset[0]?.affected) {
      return res.status(404).json({ success: false, message: 'Consulta no encontrada o sin permiso' });
    }

    try {
      const socketService = require('../services/socketService');
      socketService.getIO(req.user?.empresa).emit('consulta:estatus', { consultaId, estatus });
    } catch (_) {}

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'atencion-cliente', accion: 'cambiar-estatus-consulta', entidadId: req.params.consultaId, detalle: { estatus }, ip: req.ip });
    res.json({ success: true, estatus });
  } catch (e) {
    console.error('Error actualizando estatus de consulta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteConsulta = async (req, res) => {
  try {
    const userId = req.user?.id;
    const gestionaTodas = await puedeGestionarTodas(userId);
    if (!gestionaTodas) {
      return res.status(403).json({ success: false, message: 'No autorizado para eliminar consultas' });
    }
    const consultaId = req.params.consultaId;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('consultaId', sql.Int, consultaId).query('DELETE FROM CONSULTAS WHERE CONSULTA_ID = @consultaId');
    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'atencion-cliente', accion: 'eliminar-consulta', entidadId: req.params.consultaId, detalle: null, ip: req.ip });
    res.status(204).send();
  } catch (e) {
    console.error('Error eliminando consulta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Comentarios ── */

exports.getComentarios = async (req, res) => {
  try {
    const consultaId = Number(req.params.consultaId);
    if (!consultaId) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('consultaId', sql.Int, consultaId)
      .query(`
        SELECT c.COM_ID as id, c.CONSULTA_ID as consultaId, c.USUARIO_ID as usuarioId,
               u.NEUS_NOMBRES as autorNombre, c.CONTENIDO as contenido, c.FECHA as fecha
        FROM CONSULTAS_COMENTARIOS c
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USUARIO_ID
        WHERE c.CONSULTA_ID = @consultaId
        ORDER BY c.FECHA ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo comentarios de consulta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const userId = req.user?.id;
    const consultaId = Number(req.params.consultaId);
    const { contenido } = req.body;
    if (!consultaId || !contenido?.trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('consultaId', sql.Int, consultaId)
      .input('usuarioId', sql.Int, userId)
      .input('contenido', sql.NVarChar, contenido.trim())
      .query(`
        INSERT INTO CONSULTAS_COMENTARIOS (CONSULTA_ID, USUARIO_ID, CONTENIDO)
        OUTPUT INSERTED.COM_ID as id, INSERTED.FECHA as fecha
        VALUES (@consultaId, @usuarioId, @contenido)
      `);
    const row = result.recordset[0];

    try {
      const socketService = require('../services/socketService');
      const io = socketService.getIO(req.user?.empresa);
      const rsUser = await pool.request().input('uid', sql.Int, userId).query('SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
      const autorNombre = rsUser.recordset[0]?.NEUS_NOMBRES || 'Usuario';
      io.emit('consulta:comentario', { consultaId, comentario: { id: row.id, consultaId, usuarioId: userId, autorNombre, contenido: contenido.trim(), fecha: row.fecha } });
    } catch (_) {}

    res.status(201).json({ success: true, data: { id: row.id, consultaId, usuarioId: userId, contenido: contenido.trim(), fecha: row.fecha } });
  } catch (e) {
    console.error('Error añadiendo comentario a consulta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
