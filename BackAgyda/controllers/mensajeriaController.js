const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { BASE_DIR: DRIVE_BASE_DIR } = require('../middleware/driveUpload');

const MENSAJERIA_UPLOAD_DIR = path.join(__dirname, '../public/uploads/mensajeria');
if (!fs.existsSync(MENSAJERIA_UPLOAD_DIR)) fs.mkdirSync(MENSAJERIA_UPLOAD_DIR, { recursive: true });

const SELECT_CANAL = `
  SELECT
    MC_ID as id,
    MC_TIPO as tipo,
    MC_NOMBRE as nombre,
    MC_DESCRIPCION as descripcion,
    MC_CREADO_POR as creadoPor,
    MC_FECHA_CREACION as fechaCreacion,
    MC_ULTIMO_MENSAJE_FECHA as ultimoMensajeFecha
  FROM dbo.MSJ_CANALES
`;

const SELECT_MENSAJE = `
  SELECT
    m.MM_ID as id,
    m.MM_CANAL_ID as canalId,
    m.MM_EMISOR_ID as emisorId,
    u.NEUS_NOMBRES as emisorNombre,
    m.MM_CONTENIDO as contenido,
    m.MM_ARCHIVO_URL as archivoUrl,
    m.MM_FECHA as fecha,
    m.MM_EDITADO as editado
  FROM dbo.MSJ_MENSAJES m
  JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = m.MM_EMISOR_ID
`;

// true si el usuario pertenece al canal; lanza null (no arroja) para que el caller decida el 403.
async function esMiembro(pool, canalId, userId) {
  const r = await pool.request()
    .input('canalId', sql.Int, canalId)
    .input('userId', sql.Int, userId)
    .query('SELECT MCM_ROL as rol FROM dbo.MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @canalId AND MCM_USUARIO_ID = @userId');
  return r.recordset[0] || null;
}

async function assertMiembro(req, res, pool, canalId, userId) {
  const miembro = await esMiembro(pool, canalId, userId);
  if (!miembro) {
    res.status(403).json({ success: false, message: 'No perteneces a esta conversación' });
    return null;
  }
  return miembro;
}

async function getMiembrosIds(pool, canalId) {
  const r = await pool.request()
    .input('canalId', sql.Int, canalId)
    .query('SELECT MCM_USUARIO_ID as usuarioId FROM dbo.MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @canalId');
  return r.recordset.map((row) => row.usuarioId);
}

async function contarNoLeidos(pool, canalId, userId, ultimoLeidoId) {
  const r = await pool.request()
    .input('canalId', sql.Int, canalId)
    .input('userId', sql.Int, userId)
    .input('ultimoLeidoId', sql.Int, ultimoLeidoId || 0)
    .query(`
      SELECT COUNT(*) as total FROM dbo.MSJ_MENSAJES
      WHERE MM_CANAL_ID = @canalId AND MM_ID > @ultimoLeidoId AND MM_EMISOR_ID <> @userId
    `);
  return r.recordset[0].total || 0;
}

async function getOtroMiembroDM(pool, canalId, userId) {
  const r = await pool.request()
    .input('canalId', sql.Int, canalId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT u.NEUS_ID as usuarioId, u.NEUS_NOMBRES as nombre, u.NEUS_FOTO_URL as fotoUrl
      FROM dbo.MSJ_CANAL_MIEMBROS cm
      JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = cm.MCM_USUARIO_ID
      WHERE cm.MCM_CANAL_ID = @canalId AND cm.MCM_USUARIO_ID <> @userId
    `);
  return r.recordset[0] || null;
}

function emitirATodos(miembrosIds, canalId, evento, payload, tenantKey) {
  try {
    const io = socketService.getIO(tenantKey);
    io.to(`mensajeria:canal:${canalId}`).emit(evento, payload);
    for (const uid of miembrosIds) {
      io.to(`user:${uid}`).emit(evento, payload);
    }
  } catch (e) {
    console.warn(`⚠️ No se pudo emitir ${evento}:`, e?.message || e);
  }
}

// Autenticado — lista mis canales (DMs + grupos), con preview y no leídos.
exports.getMisCanales = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await databaseService.getPool(req.user?.empresa);

    const misCanales = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT c.MC_ID as id, c.MC_TIPO as tipo, c.MC_NOMBRE as nombre, c.MC_DESCRIPCION as descripcion,
               c.MC_CREADO_POR as creadoPor, c.MC_FECHA_CREACION as fechaCreacion,
               c.MC_ULTIMO_MENSAJE_FECHA as ultimoMensajeFecha,
               cm.MCM_ULTIMO_LEIDO_MENSAJE_ID as ultimoLeidoMensajeId
        FROM dbo.MSJ_CANALES c
        JOIN dbo.MSJ_CANAL_MIEMBROS cm ON cm.MCM_CANAL_ID = c.MC_ID
        WHERE cm.MCM_USUARIO_ID = @userId
        ORDER BY c.MC_ULTIMO_MENSAJE_FECHA DESC
      `);

    const data = [];
    for (const canal of misCanales.recordset) {
      const noLeidos = await contarNoLeidos(pool, canal.id, userId, canal.ultimoLeidoMensajeId);

      const ultimoMsgRs = await pool.request()
        .input('canalId', sql.Int, canal.id)
        .query('SELECT TOP 1 MM_CONTENIDO as contenido FROM dbo.MSJ_MENSAJES WHERE MM_CANAL_ID = @canalId ORDER BY MM_ID DESC');
      const ultimoMensajePreview = ultimoMsgRs.recordset[0]?.contenido || null;

      let nombreMostrar = canal.nombre;
      let otroUsuarioId = null;
      if (canal.tipo === 'directo') {
        const otro = await getOtroMiembroDM(pool, canal.id, userId);
        nombreMostrar = otro?.nombre || 'Usuario';
        otroUsuarioId = otro?.usuarioId ?? null;
      }

      data.push({
        id: canal.id,
        tipo: canal.tipo,
        nombre: nombreMostrar,
        descripcion: canal.descripcion,
        creadoPor: canal.creadoPor,
        fechaCreacion: canal.fechaCreacion,
        ultimoMensajeFecha: canal.ultimoMensajeFecha,
        ultimoMensajePreview,
        noLeidos,
        otroUsuarioId,
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo canales de mensajería:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado — crea o reusa un DM existente con otro usuario.
exports.crearOReusarDM = async (req, res) => {
  try {
    const userId = req.user.id;
    const { usuarioId } = req.body;
    const otroId = Number(usuarioId);

    if (!otroId || otroId === userId) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const destino = await pool.request()
      .input('id', sql.Int, otroId)
      .query('SELECT NEUS_ID FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @id AND NEUS_ACTIVO = 1');
    if (destino.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const dmKey = userId < otroId ? `${userId}:${otroId}` : `${otroId}:${userId}`;

    const existente = await pool.request()
      .input('dmKey', sql.NVarChar, dmKey)
      .query(`${SELECT_CANAL} WHERE MC_DM_KEY = @dmKey`);

    let canalId;
    let creado = false;

    if (existente.recordset.length > 0) {
      canalId = existente.recordset[0].id;
    } else {
      try {
        const insert = await pool.request()
          .input('tipo', sql.NVarChar, 'directo')
          .input('dmKey', sql.NVarChar, dmKey)
          .input('creadoPor', sql.Int, userId)
          .query(`
            INSERT INTO dbo.MSJ_CANALES (MC_TIPO, MC_DM_KEY, MC_CREADO_POR)
            OUTPUT INSERTED.MC_ID as id
            VALUES (@tipo, @dmKey, @creadoPor)
          `);
        canalId = insert.recordset[0].id;
        creado = true;

        await pool.request()
          .input('canalId', sql.Int, canalId)
          .input('u1', sql.Int, userId)
          .input('u2', sql.Int, otroId)
          .query(`
            INSERT INTO dbo.MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL)
            VALUES (@canalId, @u1, 'admin'), (@canalId, @u2, 'admin')
          `);
      } catch (insertErr) {
        // Condición de carrera: otro request creó el mismo DM en paralelo — recuperar el existente.
        const recuperar = await pool.request()
          .input('dmKey', sql.NVarChar, dmKey)
          .query(`${SELECT_CANAL} WHERE MC_DM_KEY = @dmKey`);
        if (recuperar.recordset.length === 0) throw insertErr;
        canalId = recuperar.recordset[0].id;
      }
    }

    const canalRs = await pool.request()
      .input('id', sql.Int, canalId)
      .query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    const canal = canalRs.recordset[0];
    const otro = await getOtroMiembroDM(pool, canalId, userId);

    const data = {
      ...canal,
      nombre: otro?.nombre || 'Usuario',
      otroUsuarioId: otro?.usuarioId ?? null,
      ultimoMensajePreview: null,
      noLeidos: 0,
    };

    if (creado) {
      emitirATodos([userId, otroId], canalId, 'mensajeria:canal_creado', data, req.user?.empresa);
      await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'mensajeria', accion: 'crear-dm', entidadId: String(canalId), detalle: { otroId }, ip: req.ip });
    }

    res.status(creado ? 201 : 200).json({ success: true, data });
  } catch (error) {
    console.error('Error creando/reusando DM:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + requireActionAccess('mensajeria','crear-canal') — crea un grupo.
exports.crearGrupo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { nombre, descripcion, miembros } = req.body;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, message: 'El nombre del grupo es requerido' });
    }
    const miembrosIds = Array.isArray(miembros) ? [...new Set(miembros.map(Number).filter((id) => id && id !== userId))] : [];

    const pool = await databaseService.getPool(req.user?.empresa);

    const insert = await pool.request()
      .input('tipo', sql.NVarChar, 'grupo')
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('creadoPor', sql.Int, userId)
      .query(`
        INSERT INTO dbo.MSJ_CANALES (MC_TIPO, MC_NOMBRE, MC_DESCRIPCION, MC_CREADO_POR)
        OUTPUT INSERTED.MC_ID as id
        VALUES (@tipo, @nombre, @descripcion, @creadoPor)
      `);
    const canalId = insert.recordset[0].id;

    await pool.request()
      .input('canalId', sql.Int, canalId)
      .input('userId', sql.Int, userId)
      .query(`INSERT INTO dbo.MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL) VALUES (@canalId, @userId, 'admin')`);

    for (const miembroId of miembrosIds) {
      await pool.request()
        .input('canalId', sql.Int, canalId)
        .input('miembroId', sql.Int, miembroId)
        .query(`INSERT INTO dbo.MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL) VALUES (@canalId, @miembroId, 'miembro')`);
    }

    const canalRs = await pool.request()
      .input('id', sql.Int, canalId)
      .query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    const data = { ...canalRs.recordset[0], ultimoMensajePreview: null, noLeidos: 0, otroUsuarioId: null };

    const todosLosMiembros = [userId, ...miembrosIds];
    emitirATodos(todosLosMiembros, canalId, 'mensajeria:canal_creado', data, req.user?.empresa);

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'mensajeria', accion: 'crear-grupo', entidadId: String(canalId), detalle: { nombre, miembros: miembrosIds }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando grupo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro del canal — metadata + lista de miembros.
exports.getCanal = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    const canalRs = await pool.request()
      .input('id', sql.Int, canalId)
      .query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    if (canalRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const miembrosRs = await pool.request()
      .input('canalId', sql.Int, canalId)
      .query(`
        SELECT u.NEUS_ID as usuarioId, u.NEUS_NOMBRES as nombre, cm.MCM_ROL as rol, cm.MCM_FECHA_INGRESO as fechaIngreso
        FROM dbo.MSJ_CANAL_MIEMBROS cm
        JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = cm.MCM_USUARIO_ID
        WHERE cm.MCM_CANAL_ID = @canalId
        ORDER BY cm.MCM_FECHA_INGRESO ASC
      `);

    res.json({ success: true, data: { ...canalRs.recordset[0], miembros: miembrosRs.recordset } });
  } catch (error) {
    console.error('Error obteniendo canal:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + admin del grupo — actualiza nombre/descripción.
exports.actualizarGrupo = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const { nombre, descripcion } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const miembro = await assertMiembro(req, res, pool, canalId, userId);
    if (!miembro) return;

    const canalRs = await pool.request().input('id', sql.Int, canalId).query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    if (canalRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }
    if (canalRs.recordset[0].tipo !== 'grupo') {
      return res.status(400).json({ success: false, message: 'Solo los grupos se pueden renombrar' });
    }
    if (miembro.rol !== 'admin') {
      return res.status(403).json({ success: false, message: 'Solo un administrador del grupo puede editarlo' });
    }

    await pool.request()
      .input('id', sql.Int, canalId)
      .input('nombre', sql.NVarChar, nombre || canalRs.recordset[0].nombre)
      .input('descripcion', sql.NVarChar, descripcion !== undefined ? descripcion : canalRs.recordset[0].descripcion)
      .query('UPDATE dbo.MSJ_CANALES SET MC_NOMBRE = @nombre, MC_DESCRIPCION = @descripcion WHERE MC_ID = @id');

    try {
      socketService.getIO(req.user?.empresa).to(`mensajeria:canal:${canalId}`).emit('mensajeria:canal_actualizado', { canalId, nombre, descripcion });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir mensajeria:canal_actualizado:', e?.message || e);
    }

    res.json({ success: true, message: 'Grupo actualizado' });
  } catch (error) {
    console.error('Error actualizando grupo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro — mensajes paginados por cursor (antesDe = MM_ID).
exports.getMensajes = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const antesDe = req.query.antesDe ? Number(req.query.antesDe) : null;
    const limite = Math.min(Number(req.query.limite) || 30, 100);
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    const request = pool.request()
      .input('canalId', sql.Int, canalId)
      .input('limite', sql.Int, limite);

    let where = 'WHERE m.MM_CANAL_ID = @canalId';
    if (antesDe) {
      request.input('antesDe', sql.Int, antesDe);
      where += ' AND m.MM_ID < @antesDe';
    }

    const result = await request.query(`
      SELECT TOP (@limite) *
      FROM (${SELECT_MENSAJE} ${where}) t
      ORDER BY t.id DESC
    `);

    // Se pide DESC para paginar por cursor, pero se devuelve cronológico (ascendente) al cliente.
    res.json({ success: true, data: result.recordset.reverse() });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro — envía un mensaje.
exports.enviarMensaje = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const { contenido, archivoUrl } = req.body;

    if ((!contenido || !String(contenido).trim()) && !archivoUrl) {
      return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    const insert = await pool.request()
      .input('canalId', sql.Int, canalId)
      .input('emisorId', sql.Int, userId)
      .input('contenido', sql.NVarChar, contenido ? String(contenido) : '')
      .input('archivoUrl', sql.NVarChar, archivoUrl || null)
      .query(`
        INSERT INTO dbo.MSJ_MENSAJES (MM_CANAL_ID, MM_EMISOR_ID, MM_CONTENIDO, MM_ARCHIVO_URL)
        OUTPUT INSERTED.MM_ID as id
        VALUES (@canalId, @emisorId, @contenido, @archivoUrl)
      `);
    const mensajeId = insert.recordset[0].id;

    await pool.request()
      .input('canalId', sql.Int, canalId)
      .query('UPDATE dbo.MSJ_CANALES SET MC_ULTIMO_MENSAJE_FECHA = GETDATE() WHERE MC_ID = @canalId');

    const mensajeRs = await pool.request()
      .input('id', sql.Int, mensajeId)
      .query(`${SELECT_MENSAJE} WHERE m.MM_ID = @id`);
    const data = mensajeRs.recordset[0];

    const miembrosIds = await getMiembrosIds(pool, canalId);
    emitirATodos(miembrosIds, canalId, 'mensajeria:nuevo_mensaje', data, req.user?.empresa);

    const preview = String(contenido).slice(0, 140);
    for (const uid of miembrosIds) {
      if (uid === userId) continue;
      try {
        await notificationService.createNotification({
          usuarioId: uid,
          mensaje: `💬 ${req.user?.nombre || 'Alguien'}: ${preview}`,
          tipo: 'mensajeria',
          dataExtra: { canalId, mensajeId, remitenteId: userId, remitenteNombre: req.user?.nombre || null },
          tenantKey: req.user?.empresa,
        });
      } catch (e) {
        console.warn('⚠️ No se pudo crear notificación de mensajería:', e?.message || e);
      }
    }

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro — marca como leído hasta un mensaje (o el último del canal si no se especifica).
exports.marcarLeido = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    let { mensajeId } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    if (!mensajeId) {
      const ultimoRs = await pool.request()
        .input('canalId', sql.Int, canalId)
        .query('SELECT TOP 1 MM_ID as id FROM dbo.MSJ_MENSAJES WHERE MM_CANAL_ID = @canalId ORDER BY MM_ID DESC');
      mensajeId = ultimoRs.recordset[0]?.id || null;
    }

    await pool.request()
      .input('canalId', sql.Int, canalId)
      .input('userId', sql.Int, userId)
      .input('mensajeId', sql.Int, mensajeId)
      .query(`
        UPDATE dbo.MSJ_CANAL_MIEMBROS
        SET MCM_ULTIMO_LEIDO_MENSAJE_ID = @mensajeId, MCM_ULTIMA_LECTURA_FECHA = GETDATE()
        WHERE MCM_CANAL_ID = @canalId AND MCM_USUARIO_ID = @userId
      `);

    try {
      socketService.getIO(req.user?.empresa).to(`mensajeria:canal:${canalId}`).emit('mensajeria:leido', { canalId, usuarioId: userId, ultimoLeidoMensajeId: mensajeId });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir mensajeria:leido:', e?.message || e);
    }

    res.json({ success: true, message: 'Marcado como leído' });
  } catch (error) {
    console.error('Error marcando como leído:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + admin del grupo — agrega miembros.
exports.agregarMiembros = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const { usuarios } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const miembro = await assertMiembro(req, res, pool, canalId, userId);
    if (!miembro) return;

    const canalRs = await pool.request().input('id', sql.Int, canalId).query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    if (canalRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    if (canalRs.recordset[0].tipo !== 'grupo') return res.status(400).json({ success: false, message: 'Solo se pueden agregar miembros a grupos' });
    if (miembro.rol !== 'admin') return res.status(403).json({ success: false, message: 'Solo un administrador puede agregar miembros' });

    const idsNuevos = Array.isArray(usuarios) ? [...new Set(usuarios.map(Number).filter(Boolean))] : [];
    const agregados = [];

    for (const uid of idsNuevos) {
      const yaEsMiembro = await esMiembro(pool, canalId, uid);
      if (yaEsMiembro) continue;
      await pool.request()
        .input('canalId', sql.Int, canalId)
        .input('uid', sql.Int, uid)
        .query(`INSERT INTO dbo.MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL) VALUES (@canalId, @uid, 'miembro')`);
      const infoRs = await pool.request().input('id', sql.Int, uid).query('SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @id');
      if (infoRs.recordset[0]) agregados.push(infoRs.recordset[0]);
    }

    if (agregados.length > 0) {
      try {
        const io = socketService.getIO(req.user?.empresa);
        io.to(`mensajeria:canal:${canalId}`).emit('mensajeria:miembro_agregado', { canalId, usuarios: agregados });
        for (const a of agregados) io.to(`user:${a.id}`).emit('mensajeria:miembro_agregado', { canalId, usuarios: agregados });
      } catch (e) {
        console.warn('⚠️ No se pudo emitir mensajeria:miembro_agregado:', e?.message || e);
      }
    }

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'mensajeria', accion: 'agregar-miembros', entidadId: String(canalId), detalle: { agregados: agregados.map((a) => a.id) }, ip: req.ip });
    res.json({ success: true, message: 'Miembros agregados', data: agregados });
  } catch (error) {
    console.error('Error agregando miembros:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + admin del grupo — quita a otro miembro.
exports.quitarMiembro = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const usuarioIdQuitar = Number(req.params.usuarioId);
    const pool = await databaseService.getPool(req.user?.empresa);

    const miembro = await assertMiembro(req, res, pool, canalId, userId);
    if (!miembro) return;

    const canalRs = await pool.request().input('id', sql.Int, canalId).query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    if (canalRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    if (canalRs.recordset[0].tipo !== 'grupo') return res.status(400).json({ success: false, message: 'Solo se pueden quitar miembros de grupos' });
    if (miembro.rol !== 'admin') return res.status(403).json({ success: false, message: 'Solo un administrador puede quitar miembros' });

    await pool.request()
      .input('canalId', sql.Int, canalId)
      .input('uid', sql.Int, usuarioIdQuitar)
      .query('DELETE FROM dbo.MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @canalId AND MCM_USUARIO_ID = @uid');

    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`mensajeria:canal:${canalId}`).emit('mensajeria:miembro_removido', { canalId, usuarioId: usuarioIdQuitar });
      io.to(`user:${usuarioIdQuitar}`).emit('mensajeria:miembro_removido', { canalId, usuarioId: usuarioIdQuitar });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir mensajeria:miembro_removido:', e?.message || e);
    }

    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'mensajeria', accion: 'quitar-miembro', entidadId: String(canalId), detalle: { usuarioIdQuitar }, ip: req.ip });
    res.json({ success: true, message: 'Miembro removido' });
  } catch (error) {
    console.error('Error quitando miembro:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro — el propio usuario abandona un grupo.
exports.salirDeGrupo = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    const canalRs = await pool.request().input('id', sql.Int, canalId).query(`${SELECT_CANAL} WHERE MC_ID = @id`);
    if (canalRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    if (canalRs.recordset[0].tipo !== 'grupo') return res.status(400).json({ success: false, message: 'No puedes salir de una conversación directa' });

    await pool.request()
      .input('canalId', sql.Int, canalId)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM dbo.MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @canalId AND MCM_USUARIO_ID = @userId');

    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`mensajeria:canal:${canalId}`).emit('mensajeria:miembro_removido', { canalId, usuarioId: userId });
      io.to(`user:${userId}`).emit('mensajeria:miembro_removido', { canalId, usuarioId: userId });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir salida de grupo:', e?.message || e);
    }

    res.json({ success: true, message: 'Saliste del grupo' });
  } catch (error) {
    console.error('Error saliendo del grupo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro — sube un archivo adjunto (cualquier tipo, máx 15MB) y devuelve su URL pública.
exports.subirArchivo = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se subió ningún archivo' });
    }

    const url = '/uploads/mensajeria/' + req.file.filename;
    res.json({ success: true, data: { url, nombreOriginal: req.file.originalname, tamano: req.file.size } });
  } catch (error) {
    console.error('Error subiendo archivo de mensajería:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado + miembro — adjunta un archivo YA EXISTENTE en el Drive del usuario, copiándolo a la
// carpeta pública de mensajería (misma validación de permisos que Drive: dueño, compartido, o dueño de carpeta).
exports.adjuntarDesdeDrive = async (req, res) => {
  try {
    const userId = req.user.id;
    const canalId = Number(req.params.canalId);
    const archivoId = Number(req.body.archivoId);
    const tipoUsuario = String(req.user?.tipoUsuario || req.user?.role || '').toUpperCase();

    if (!archivoId) {
      return res.status(400).json({ success: false, message: 'archivoId requerido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    if (!(await assertMiembro(req, res, pool, canalId, userId))) return;

    const fileRs = await pool.request()
      .input('id', sql.Int, archivoId)
      .query('SELECT id, nombre, extension, carpeta_id AS carpetaId, ruta FROM archivo WHERE id = @id');
    if (fileRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Archivo no encontrado en Drive' });
    }
    const archivo = fileRs.recordset[0];

    if (tipoUsuario !== 'AD') {
      const permiso = await pool.request()
        .input('aid', sql.Int, archivoId)
        .input('uid', sql.Int, userId)
        .input('cid', sql.Int, archivo.carpetaId)
        .query(`SELECT TOP 1 1 as ok FROM archivo WHERE id=@aid AND subido_por=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM archivo_compartido WHERE archivo_id=@aid AND usuario_id=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM carpeta WHERE id=@cid AND creado_por=@uid`);
      if (permiso.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Sin permiso sobre ese archivo de Drive' });
      }
    }

    const origenPath = path.join(DRIVE_BASE_DIR, String(archivo.carpetaId), path.basename(archivo.ruta || ''));
    if (!fs.existsSync(origenPath)) {
      return res.status(404).json({ success: false, message: 'Archivo físico no encontrado en Drive' });
    }

    let nombreFinal = archivo.nombre || 'archivo';
    const ext = (archivo.extension || '').toString().trim();
    if (ext && !nombreFinal.toLowerCase().endsWith('.' + ext.toLowerCase())) {
      nombreFinal += '.' + ext.toLowerCase();
    }
    const nombreSanitizado = nombreFinal.replace(/[^a-zA-Z0-9._-]/g, '_');
    const nombreDestino = `msj_${Date.now()}_${nombreSanitizado}`;
    const destinoPath = path.join(MENSAJERIA_UPLOAD_DIR, nombreDestino);

    fs.copyFileSync(origenPath, destinoPath);

    const url = '/uploads/mensajeria/' + nombreDestino;
    res.json({ success: true, data: { url, nombreOriginal: nombreFinal, tamano: fs.statSync(destinoPath).size } });
  } catch (error) {
    console.error('Error adjuntando archivo desde Drive:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
