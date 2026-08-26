const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');

const CODIGOS_SUPERVISORES = ['ADM_0002', 'ADM_0004'];
// Solo estos dos pueden VER las acciones correctivas
const CODIGOS_LECTORES_AC = ['ADM_0001', 'ADM_0002'];

async function ensureTables(tenantKey) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'QUEJAS_COMENTARIOS')
      CREATE TABLE QUEJAS_COMENTARIOS (
        COM_ID     INT IDENTITY(1,1) PRIMARY KEY,
        QUEJA_ID   INT NOT NULL,
        USUARIO_ID INT NOT NULL,
        CONTENIDO  NVARCHAR(2000) NOT NULL,
        FECHA      DATETIME DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'QUEJAS_ACCION_CORRECTIVA')
      CREATE TABLE QUEJAS_ACCION_CORRECTIVA (
        ID                 INT IDENTITY(1,1) PRIMARY KEY,
        QUEJA_ID           INT NOT NULL UNIQUE,
        REDACTOR_ID        INT NOT NULL,
        REDACTOR_NOMBRE    NVARCHAR(200) NULL,
        DESCRIPCION        NVARCHAR(MAX) NOT NULL,
        RESPONSABLE        NVARCHAR(200) NOT NULL,
        FECHA_COMPROMISO   DATE NOT NULL,
        ESTADO_AC          NVARCHAR(30) NOT NULL DEFAULT 'pendiente',
        FECHA_REGISTRO     DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
  } catch (e) {
    console.warn(`No se pudo asegurar tablas de quejas (empresa: ${tenantKey}):`, e.message);
  }
}
require('../config/tenants').listTenants().forEach(({ key }) => ensureTables(key));

// Helper: obtiene NEUS_USUARIO (código) de un usuario por su ID
async function getCodigoUsuario(pool, userId) {
  try {
    const rs = await pool.request()
      .input('uid', sql.Int, userId)
      .query('SELECT TOP 1 NEUS_USUARIO FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
    return rs.recordset[0]?.NEUS_USUARIO ?? null;
  } catch { return null; }
}

exports.getQuejas = async (req, res) => {
  const tipoUsuario = (req.headers.tipousuario || '').toString().toUpperCase();
  const usuarioId = req.headers.usuarioid;
  const { desde, hasta, nombre, rol } = req.query;

  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipoUsuario === 'AD') {
      const request = pool.request();
      const condiciones = [];

      if (desde) {
        request.input('desde', sql.DateTime, new Date(desde));
        condiciones.push('q.FECHA >= @desde');
      }
      if (hasta) {
        request.input('hasta', sql.DateTime, new Date(hasta + 'T23:59:59'));
        condiciones.push('q.FECHA <= @hasta');
      }
      if (nombre) {
        request.input('nombre', sql.NVarChar, `%${nombre}%`);
        condiciones.push('u.NEUS_NOMBRES LIKE @nombre');
      }
      if (rol) {
        request.input('rol', sql.NVarChar, rol);
        condiciones.push('u.NEUS_TIPOUSUARIO = @rol');
      }

      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT q.QUEJA_ID as id, q.USUARIO_ID as usuarioId, q.TITULO as titulo, q.DESCRIPCION as descripcion,
               q.FECHA as fecha, q.ESTATUS as estatus,
               u.NEUS_NOMBRES as usuarioNombre, u.NEUS_TIPOUSUARIO as usuarioRol
        FROM QUEJAS q
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = q.USUARIO_ID
        ${where}
        ORDER BY q.FECHA DESC
      `);
      res.json({ success: true, data: result.recordset });
    } else if (usuarioId) {
      // Todos los roles no-AD (TI, CC, etc.) solo ven sus propias quejas
      const result = await pool.request()
        .input('usuarioId', sql.SmallInt, usuarioId)
        .query(`SELECT QUEJA_ID as id, USUARIO_ID as usuarioId, TITULO as titulo, DESCRIPCION as descripcion, FECHA as fecha, ESTATUS as estatus
                FROM QUEJAS
                WHERE USUARIO_ID = @usuarioId
                ORDER BY FECHA DESC`);
      res.json({ success: true, data: result.recordset });
    } else {
      res.status(403).json({ success: false, message: 'No autorizado' });
    }
  } catch (e) {
    console.error('Error obteniendo quejas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getQuejasStats = async (req, res) => {
  const tipoUsuario = (req.headers.tipousuario || '').toString().toUpperCase();
  if (tipoUsuario !== 'AD') {
    return res.status(403).json({ success: false, message: 'No autorizado' });
  }

  const { desde, hasta } = req.query;

  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const condiciones = [];

    if (desde) {
      request.input('desde', sql.DateTime, new Date(desde));
      condiciones.push('q.FECHA >= @desde');
    }
    if (hasta) {
      request.input('hasta', sql.DateTime, new Date(hasta + 'T23:59:59'));
      condiciones.push('q.FECHA <= @hasta');
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const result = await request.query(`
      SELECT q.USUARIO_ID as usuarioId, u.NEUS_NOMBRES as usuarioNombre, u.NEUS_TIPOUSUARIO as usuarioRol,
             COUNT(*) as total
      FROM QUEJAS q
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = q.USUARIO_ID
      ${where}
      GROUP BY q.USUARIO_ID, u.NEUS_NOMBRES, u.NEUS_TIPOUSUARIO
      ORDER BY total DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo estadísticas de quejas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createQueja = async (req, res) => {
  try {
    const { usuarioId, titulo, descripcion } = req.body;
    if (!usuarioId || !titulo || !descripcion) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // Insertar y recuperar el ID generado + nombre del usuario
    const insertResult = await pool.request()
      .input('usuarioId', sql.SmallInt, usuarioId)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion)
      .query(`
        DECLARE @newId TABLE (ID INT);
        INSERT INTO QUEJAS (USUARIO_ID, TITULO, DESCRIPCION, FECHA, ESTATUS)
        OUTPUT INSERTED.QUEJA_ID INTO @newId(ID)
        VALUES (@usuarioId, @titulo, @descripcion, GETDATE(), 'pendiente');
        SELECT n.ID as quejaId, u.NEUS_NOMBRES as nombreUsuario
        FROM @newId n
        CROSS JOIN (SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @usuarioId) u
      `);

    const nuevaFila = insertResult.recordset[0];
    const quejaId = nuevaFila?.quejaId;
    const nombreUsuario = nuevaFila?.nombreUsuario || 'Un usuario';

    // Emitir alerta de burbuja + notificación persistente a los supervisores
    try {
      const socketService = require('../services/socketService');
      const io = socketService.getIO(req.user?.empresa);

      // Buscar los IDs numéricos de los supervisores por NEUS_USUARIO
      const rsSuper = await pool.request()
        .input('c1', sql.NVarChar, CODIGOS_SUPERVISORES[0])
        .input('c2', sql.NVarChar, CODIGOS_SUPERVISORES[1])
        .query(`SELECT NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_USUARIO IN (@c1, @c2) AND NEUS_ACTIVO = 1`);

      const bubblePayload = {
        tipo: 'queja_nueva',
        quejaId,
        nombreUsuario,
        titulo,
        mensaje: `${nombreUsuario} levantó una queja: "${titulo}"`,
        fecha: new Date().toISOString(),
      };

      for (const row of rsSuper.recordset) {
        // 1) Evento especial para la burbuja flotante
        io.to(`user:${row.NEUS_ID}`).emit('queja:nueva', bubblePayload);

        // 2) Notificación persistente (aparece en el panel de notificaciones)
        notificationService.createNotification({
          usuarioId: Number(row.NEUS_ID),
          mensaje: `⚠️ ${nombreUsuario} levantó una queja: "${titulo}"`,
          tipo: 'queja_nueva',
          dataExtra: { quejaId, nombreUsuario, titulo },
          tenantKey: req.user?.empresa,
        }).catch(() => {});
      }
    } catch (socketErr) {
      console.warn('No se pudo emitir alerta de queja:', socketErr?.message);
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'quejas', accion:'crear', entidadId: String(quejaId||''), detalle:{ titulo }, ip:req.ip });
    res.status(201).json({ success: true, message: 'Queja registrada', quejaId });
  } catch (e) {
    console.error('Error registrando queja:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEstatus = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    let codigo = req.user?.codigo || null;
    if (!codigo && req.user?.id) codigo = await getCodigoUsuario(pool, req.user.id);
    if (!CODIGOS_SUPERVISORES.includes(codigo)) {
      return res.status(403).json({ success: false, message: 'Solo los supervisores pueden cambiar el estado de una queja' });
    }

    const quejaId = Number(req.params.quejaId);
    const { estatus } = req.body;
    const ESTATUSES_VALIDOS = ['pendiente', 'proceso', 'terminada'];
    if (!quejaId || !ESTATUSES_VALIDOS.includes(estatus)) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }
    const result = await pool.request()
      .input('quejaId', sql.Int, quejaId)
      .input('estatus', sql.NVarChar, estatus)
      .query(`UPDATE QUEJAS SET ESTATUS = @estatus WHERE QUEJA_ID = @quejaId; SELECT @@ROWCOUNT as affected`);

    if (!result.recordset[0]?.affected) {
      return res.status(404).json({ success: false, message: 'Queja no encontrada' });
    }

    // Notificar cambio de estado via socket a todos
    try {
      const socketService = require('../services/socketService');
      const io = socketService.getIO(req.user?.empresa);
      io.emit('queja:estatus', { quejaId, estatus });
    } catch (_) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'quejas', accion:'cambiar-estatus', entidadId: req.params.quejaId, detalle:{ estatus }, ip:req.ip });
    res.json({ success: true, estatus });
  } catch (e) {
    console.error('Error actualizando estatus de queja:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteQueja = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    let codigo = req.user?.codigo || null;
    if (!codigo && req.user?.id) codigo = await getCodigoUsuario(pool, req.user.id);
    if (codigo !== 'ADM_0002') {
      return res.status(403).json({ success: false, message: 'Solo ADM_0002 puede eliminar quejas' });
    }

    const quejaId = req.params.quejaId;
    if (!quejaId) {
      return res.status(400).json({ success: false, message: 'Falta el ID de la queja' });
    }

    await pool.request()
      .input('quejaId', sql.Int, quejaId)
      .query('DELETE FROM QUEJAS WHERE QUEJA_ID = @quejaId');

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'quejas', accion:'eliminar', entidadId: req.params.quejaId, detalle:null, ip:req.ip });
    res.status(204).send();
  } catch (e) {
    console.error('Error eliminando queja:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Comentarios ── */

exports.getComentarios = async (req, res) => {
  try {
    const quejaId = Number(req.params.quejaId);
    if (!quejaId) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('quejaId', sql.Int, quejaId)
      .query(`
        SELECT c.COM_ID as id, c.QUEJA_ID as quejaId, c.USUARIO_ID as usuarioId,
               u.NEUS_NOMBRES as autorNombre, c.CONTENIDO as contenido, c.FECHA as fecha
        FROM QUEJAS_COMENTARIOS c
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USUARIO_ID
        WHERE c.QUEJA_ID = @quejaId
        ORDER BY c.FECHA ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo comentarios de queja:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const quejaId = Number(req.params.quejaId);
    const { usuarioId, contenido } = req.body;
    if (!quejaId || !usuarioId || !contenido?.trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('quejaId', sql.Int, quejaId)
      .input('usuarioId', sql.Int, usuarioId)
      .input('contenido', sql.NVarChar, contenido.trim())
      .query(`
        INSERT INTO QUEJAS_COMENTARIOS (QUEJA_ID, USUARIO_ID, CONTENIDO)
        OUTPUT INSERTED.COM_ID as id, INSERTED.FECHA as fecha
        VALUES (@quejaId, @usuarioId, @contenido)
      `);
    const row = result.recordset[0];

    // Emitir por socket para tiempo real
    try {
      const socketService = require('../services/socketService');
      const io = socketService.getIO(req.user?.empresa);
      const rsUser = await pool.request()
        .input('uid', sql.Int, usuarioId)
        .query('SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
      const autorNombre = rsUser.recordset[0]?.NEUS_NOMBRES || 'Usuario';
      io.emit('queja:comentario', { quejaId, comentario: { id: row.id, quejaId, usuarioId, autorNombre, contenido: contenido.trim(), fecha: row.fecha } });
    } catch (_) {}

    res.status(201).json({ success: true, data: { id: row.id, quejaId, usuarioId, contenido: contenido.trim(), fecha: row.fecha } });
  } catch (e) {
    console.error('Error añadiendo comentario a queja:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Acción Correctiva ── */

// GET /quejas/:quejaId/accion-correctiva — solo ADM_0001 y ADM_0002
exports.getAccionCorrectiva = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    let codigo = req.user?.codigo || null;
    if (!codigo && req.user?.id) codigo = await getCodigoUsuario(pool, req.user.id);
    if (!CODIGOS_LECTORES_AC.includes(codigo)) {
      return res.status(403).json({ success: false, message: 'No autorizado para ver acciones correctivas' });
    }
    const quejaId = Number(req.params.quejaId);
    const rs = await pool.request()
      .input('qid', sql.Int, quejaId)
      .query(`
        SELECT ID as id, QUEJA_ID as quejaId, REDACTOR_ID as redactorId,
               REDACTOR_NOMBRE as redactorNombre, DESCRIPCION as descripcion,
               RESPONSABLE as responsable,
               CONVERT(VARCHAR(10), FECHA_COMPROMISO, 23) as fechaCompromiso,
               ESTADO_AC as estadoAc,
               CONVERT(VARCHAR(19), FECHA_REGISTRO, 120) as fechaRegistro
        FROM QUEJAS_ACCION_CORRECTIVA WHERE QUEJA_ID = @qid
      `);
    if (!rs.recordset[0]) return res.json({ success: true, data: null });
    return res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error obteniendo acción correctiva:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// POST /quejas/:quejaId/accion-correctiva — cualquier supervisor AD que atiende, una sola vez
exports.createAccionCorrectiva = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const userId = req.user?.id;
    let codigo = req.user?.codigo || null;
    if (!codigo && userId) codigo = await getCodigoUsuario(pool, userId);
    // Solo AD supervisores pueden redactar (CODIGOS_SUPERVISORES)
    if (!CODIGOS_SUPERVISORES.includes(codigo)) {
      return res.status(403).json({ success: false, message: 'Solo supervisores pueden registrar acciones correctivas' });
    }

    const quejaId = Number(req.params.quejaId);
    const { descripcion, responsable, fechaCompromiso, estadoAc } = req.body;
    if (!descripcion?.trim() || !responsable?.trim() || !fechaCompromiso) {
      return res.status(400).json({ success: false, message: 'descripcion, responsable y fechaCompromiso son obligatorios' });
    }
    const ESTADOS_VALIDOS = ['pendiente', 'aplicada', 'verificada'];
    const estado = ESTADOS_VALIDOS.includes(estadoAc) ? estadoAc : 'pendiente';

    // Verificar que no exista ya una acción para esta queja (una sola vez)
    const existe = await pool.request()
      .input('qid', sql.Int, quejaId)
      .query('SELECT 1 as ok FROM QUEJAS_ACCION_CORRECTIVA WHERE QUEJA_ID = @qid');
    if (existe.recordset.length) {
      return res.status(409).json({ success: false, message: 'Ya existe una acción correctiva para esta queja. No se puede modificar.' });
    }

    // Obtener nombre del redactor
    const rsNombre = await pool.request()
      .input('uid', sql.Int, userId)
      .query('SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
    const redactorNombre = rsNombre.recordset[0]?.NEUS_NOMBRES ?? null;

    const rs = await pool.request()
      .input('qid',  sql.Int,      quejaId)
      .input('rid',  sql.Int,      userId)
      .input('rn',   sql.NVarChar, redactorNombre)
      .input('desc', sql.NVarChar, descripcion.trim())
      .input('resp', sql.NVarChar, responsable.trim())
      .input('fc',   sql.Date,     new Date(fechaCompromiso + 'T12:00:00'))
      .input('est',  sql.NVarChar, estado)
      .query(`
        INSERT INTO QUEJAS_ACCION_CORRECTIVA
          (QUEJA_ID, REDACTOR_ID, REDACTOR_NOMBRE, DESCRIPCION, RESPONSABLE, FECHA_COMPROMISO, ESTADO_AC)
        OUTPUT INSERTED.ID as id, CONVERT(VARCHAR(19), INSERTED.FECHA_REGISTRO, 120) as fechaRegistro
        VALUES (@qid, @rid, @rn, @desc, @resp, @fc, @est)
      `);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'quejas', accion:'accion-correctiva', entidadId: req.params.quejaId, detalle:{ responsable, descripcion }, ip:req.ip });
    return res.status(201).json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error creando acción correctiva:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};
