const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { getUserAllowedActions } = require('../middleware/moduleAccess');

async function ensureTables(tenantKey) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ACLARACIONES')
      CREATE TABLE ACLARACIONES (
        ACLARACION_ID  INT IDENTITY(1,1) PRIMARY KEY,
        USUARIO_ID     INT NOT NULL,
        CLIENTE_NOMBRE NVARCHAR(200) NOT NULL,
        CLIENTE_TEL    NVARCHAR(30) NULL,
        CLIENTE_EMAIL  NVARCHAR(200) NULL,
        REFERENCIA     NVARCHAR(100) NULL,
        MOTIVO         NVARCHAR(200) NOT NULL,
        DETALLE        NVARCHAR(MAX) NOT NULL,
        ESTATUS        NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
        FECHA          DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ACLARACIONES_COMENTARIOS')
      CREATE TABLE ACLARACIONES_COMENTARIOS (
        COM_ID         INT IDENTITY(1,1) PRIMARY KEY,
        ACLARACION_ID  INT NOT NULL,
        USUARIO_ID     INT NOT NULL,
        CONTENIDO      NVARCHAR(2000) NOT NULL,
        FECHA          DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    // Fase 8: FK opcional al cliente real (CRM_CONTACTOS) — CLIENTE_NOMBRE se
    // mantiene como texto libre para cuando el cliente aún no está dado de alta.
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ACLARACIONES') AND name = 'ACLARACION_CONTACTO_ID')
      ALTER TABLE ACLARACIONES ADD ACLARACION_CONTACTO_ID INT NULL
        CONSTRAINT FK_ACLARACION_CONTACTO REFERENCES CRM_CONTACTOS(CONT_ID);
    `);
  } catch (e) {
    console.warn(`No se pudo asegurar tablas de aclaraciones (empresa: ${tenantKey}):`, e.message);
  }
}
require('../config/tenants').listTenants().forEach(({ key }) => ensureTables(key));

async function puedeGestionarTodas(userId) {
  const allowed = await getUserAllowedActions(userId, 'atencion-cliente');
  return allowed.has('*') || allowed.has('gestionar-aclaraciones');
}

exports.getAclaraciones = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const gestionaTodas = await puedeGestionarTodas(userId);
    const { desde, hasta, nombre, cliente } = req.query;

    if (gestionaTodas) {
      const request = pool.request();
      const condiciones = [];
      if (desde) { request.input('desde', sql.DateTime, new Date(desde)); condiciones.push('a.FECHA >= @desde'); }
      if (hasta) { request.input('hasta', sql.DateTime, new Date(hasta + 'T23:59:59')); condiciones.push('a.FECHA <= @hasta'); }
      if (nombre) { request.input('nombre', sql.NVarChar, `%${nombre}%`); condiciones.push('u.NEUS_NOMBRES LIKE @nombre'); }
      if (cliente) { request.input('cliente', sql.NVarChar, `%${cliente}%`); condiciones.push('a.CLIENTE_NOMBRE LIKE @cliente'); }
      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT a.ACLARACION_ID as id, a.USUARIO_ID as usuarioId, a.CLIENTE_NOMBRE as clienteNombre,
               a.CLIENTE_TEL as clienteTel, a.CLIENTE_EMAIL as clienteEmail, a.ACLARACION_CONTACTO_ID as contactoId,
               a.REFERENCIA as referencia, a.MOTIVO as motivo, a.DETALLE as detalle, a.FECHA as fecha, a.ESTATUS as estatus,
               u.NEUS_NOMBRES as usuarioNombre, u.NEUS_TIPOUSUARIO as usuarioRol
        FROM ACLARACIONES a
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.USUARIO_ID
        ${where}
        ORDER BY a.FECHA DESC
      `);
      return res.json({ success: true, data: result.recordset });
    }

    const result = await pool.request()
      .input('usuarioId', sql.Int, userId)
      .query(`
        SELECT ACLARACION_ID as id, USUARIO_ID as usuarioId, CLIENTE_NOMBRE as clienteNombre,
               CLIENTE_TEL as clienteTel, CLIENTE_EMAIL as clienteEmail, ACLARACION_CONTACTO_ID as contactoId,
               REFERENCIA as referencia, MOTIVO as motivo, DETALLE as detalle, FECHA as fecha, ESTATUS as estatus
        FROM ACLARACIONES
        WHERE USUARIO_ID = @usuarioId
        ORDER BY FECHA DESC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo aclaraciones:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createAclaracion = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const { clienteNombre, clienteTel, clienteEmail, referencia, motivo, detalle, contactoId } = req.body;
    if (!clienteNombre?.trim() || !motivo?.trim() || !detalle?.trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const insertResult = await pool.request()
      .input('usuarioId', sql.Int, userId)
      .input('clienteNombre', sql.NVarChar, clienteNombre.trim())
      .input('clienteTel', sql.NVarChar, clienteTel?.trim() || null)
      .input('clienteEmail', sql.NVarChar, clienteEmail?.trim() || null)
      .input('contactoId', sql.Int, contactoId ? parseInt(contactoId, 10) : null)
      .input('referencia', sql.NVarChar, referencia?.trim() || null)
      .input('motivo', sql.NVarChar, motivo.trim())
      .input('detalle', sql.NVarChar, detalle.trim())
      .query(`
        DECLARE @newId TABLE (ID INT);
        INSERT INTO ACLARACIONES (USUARIO_ID, CLIENTE_NOMBRE, CLIENTE_TEL, CLIENTE_EMAIL, ACLARACION_CONTACTO_ID, REFERENCIA, MOTIVO, DETALLE, FECHA, ESTATUS)
        OUTPUT INSERTED.ACLARACION_ID INTO @newId(ID)
        VALUES (@usuarioId, @clienteNombre, @clienteTel, @clienteEmail, @contactoId, @referencia, @motivo, @detalle, GETDATE(), 'pendiente');
        SELECT n.ID as aclaracionId, u.NEUS_NOMBRES as nombreUsuario
        FROM @newId n
        CROSS JOIN (SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @usuarioId) u
      `);

    const fila = insertResult.recordset[0];
    const aclaracionId = fila?.aclaracionId;
    const nombreUsuario = fila?.nombreUsuario || 'Un usuario';

    try {
      const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
      const destinatarios = await getUsuariosParaNotificarCorreo('atencion-cliente', req.user?.empresa);
      for (const uid of destinatarios) {
        notificationService.createNotification({
          usuarioId: Number(uid),
          mensaje: `📄 ${nombreUsuario} registró una aclaración de ${clienteNombre.trim()}: "${motivo.trim()}"`,
          tipo: 'aclaracion_nueva',
          dataExtra: { aclaracionId, nombreUsuario, motivo: motivo.trim() },
          tenantKey: req.user?.empresa,
        }).catch(() => {});
      }
    } catch (notifErr) {
      console.warn('No se pudo notificar nueva aclaración:', notifErr?.message);
    }

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'atencion-cliente', accion: 'crear-aclaracion', entidadId: String(aclaracionId || ''), detalle: { motivo }, ip: req.ip });
    res.status(201).json({ success: true, message: 'Aclaración registrada', aclaracionId });
  } catch (e) {
    console.error('Error registrando aclaración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEstatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    const aclaracionId = Number(req.params.aclaracionId);
    const { estatus } = req.body;
    const ESTATUSES_VALIDOS = ['pendiente', 'proceso', 'resuelta'];
    if (!aclaracionId || !ESTATUSES_VALIDOS.includes(estatus)) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const gestionaTodas = await puedeGestionarTodas(userId);
    const request = pool.request().input('aclaracionId', sql.Int, aclaracionId).input('estatus', sql.NVarChar, estatus);
    if (!gestionaTodas) request.input('usuarioId', sql.Int, userId);

    const result = await request.query(`
      UPDATE ACLARACIONES SET ESTATUS = @estatus
      WHERE ACLARACION_ID = @aclaracionId ${gestionaTodas ? '' : 'AND USUARIO_ID = @usuarioId'};
      SELECT @@ROWCOUNT as affected
    `);

    if (!result.recordset[0]?.affected) {
      return res.status(404).json({ success: false, message: 'Aclaración no encontrada o sin permiso' });
    }

    try {
      const socketService = require('../services/socketService');
      socketService.getIO(req.user?.empresa).emit('aclaracion:estatus', { aclaracionId, estatus });
    } catch (_) {}

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'atencion-cliente', accion: 'cambiar-estatus-aclaracion', entidadId: req.params.aclaracionId, detalle: { estatus }, ip: req.ip });
    res.json({ success: true, estatus });
  } catch (e) {
    console.error('Error actualizando estatus de aclaración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteAclaracion = async (req, res) => {
  try {
    const userId = req.user?.id;
    const gestionaTodas = await puedeGestionarTodas(userId);
    if (!gestionaTodas) {
      return res.status(403).json({ success: false, message: 'No autorizado para eliminar aclaraciones' });
    }
    const aclaracionId = req.params.aclaracionId;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('aclaracionId', sql.Int, aclaracionId).query('DELETE FROM ACLARACIONES WHERE ACLARACION_ID = @aclaracionId');
    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'atencion-cliente', accion: 'eliminar-aclaracion', entidadId: req.params.aclaracionId, detalle: null, ip: req.ip });
    res.status(204).send();
  } catch (e) {
    console.error('Error eliminando aclaración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Comentarios ── */

exports.getComentarios = async (req, res) => {
  try {
    const aclaracionId = Number(req.params.aclaracionId);
    if (!aclaracionId) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('aclaracionId', sql.Int, aclaracionId)
      .query(`
        SELECT c.COM_ID as id, c.ACLARACION_ID as aclaracionId, c.USUARIO_ID as usuarioId,
               u.NEUS_NOMBRES as autorNombre, c.CONTENIDO as contenido, c.FECHA as fecha
        FROM ACLARACIONES_COMENTARIOS c
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USUARIO_ID
        WHERE c.ACLARACION_ID = @aclaracionId
        ORDER BY c.FECHA ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo comentarios de aclaración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const userId = req.user?.id;
    const aclaracionId = Number(req.params.aclaracionId);
    const { contenido } = req.body;
    if (!aclaracionId || !contenido?.trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('aclaracionId', sql.Int, aclaracionId)
      .input('usuarioId', sql.Int, userId)
      .input('contenido', sql.NVarChar, contenido.trim())
      .query(`
        INSERT INTO ACLARACIONES_COMENTARIOS (ACLARACION_ID, USUARIO_ID, CONTENIDO)
        OUTPUT INSERTED.COM_ID as id, INSERTED.FECHA as fecha
        VALUES (@aclaracionId, @usuarioId, @contenido)
      `);
    const row = result.recordset[0];

    try {
      const socketService = require('../services/socketService');
      const io = socketService.getIO(req.user?.empresa);
      const rsUser = await pool.request().input('uid', sql.Int, userId).query('SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
      const autorNombre = rsUser.recordset[0]?.NEUS_NOMBRES || 'Usuario';
      io.emit('aclaracion:comentario', { aclaracionId, comentario: { id: row.id, aclaracionId, usuarioId: userId, autorNombre, contenido: contenido.trim(), fecha: row.fecha } });
    } catch (_) {}

    res.status(201).json({ success: true, data: { id: row.id, aclaracionId, usuarioId: userId, contenido: contenido.trim(), fecha: row.fecha } });
  } catch (e) {
    console.error('Error añadiendo comentario a aclaración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
