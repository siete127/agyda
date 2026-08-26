const crypto = require('crypto');
const path = require('path');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

const TIPOS_VALIDOS = ['enfermedad_general', 'maternidad', 'riesgo_trabajo', 'otro'];

// Mismo cifrado y misma clave que el módulo de Expediente (EXPEDIENTE_ENCRYPTION_KEY):
// un comprobante médico es un documento sensible del empleado, igual que los de expediente.
function getEncryptionKey() {
  const raw = (process.env.EXPEDIENTE_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('Falta EXPEDIENTE_ENCRYPTION_KEY (32 bytes en base64 o hex)');
  let key;
  try { key = Buffer.from(raw, 'base64'); } catch (e) { key = null; }
  if (!key || key.length !== 32) {
    try { key = Buffer.from(raw, 'hex'); } catch (e) { key = null; }
  }
  if (!key || key.length !== 32) throw new Error('EXPEDIENTE_ENCRYPTION_KEY debe ser 32 bytes (base64 o hex)');
  return key;
}

function encryptBuffer(plainBuffer) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { data, iv, tag, cipherName: 'aes-256-gcm' };
}

function decryptBuffer(cipherBuffer, iv, tag) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);
}

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || 'comprobante').replace(/\\/g, '/'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function diffDias(fechaInicio, fechaFin) {
  const fi = new Date(fechaInicio);
  const ff = new Date(fechaFin);
  return Math.round((ff - fi) / (1000 * 60 * 60 * 24)) + 1;
}

const SELECT_INCAPACIDAD = `
  SELECT
    i.INC_ID as id,
    i.INC_USUARIO_ID as usuarioId,
    u.NEUS_NOMBRES as usuarioNombre,
    i.INC_TIPO as tipo,
    i.INC_MOTIVO as motivo,
    i.INC_FECHA_INICIO as fechaInicio,
    i.INC_FECHA_FIN as fechaFin,
    i.INC_DIAS as dias,
    i.INC_ESTADO as estado,
    i.INC_COMENTARIO_ADMIN as comentarioAdmin,
    i.INC_FECHA_SOLICITUD as fechaSolicitud,
    i.INC_FECHA_RESPUESTA as fechaRespuesta
  FROM dbo.INCAPACIDADES i
  INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = i.INC_USUARIO_ID
`;

async function attachDocumentos(pool, incapacidades) {
  if (incapacidades.length === 0) return incapacidades;
  const ids = incapacidades.map((i) => i.id);
  const result = await pool.request().query(`
    SELECT IDOC_ID as id, IDOC_INCAPACIDAD_ID as incapacidadId, IDOC_NOMBRE_ORIGINAL as nombre, IDOC_MIME as mime, IDOC_TAMANO_BYTES as tamanoBytes
    FROM dbo.INCAPACIDADES_DOCUMENTOS WHERE IDOC_INCAPACIDAD_ID IN (${ids.join(',')})
  `);
  const porIncapacidad = new Map();
  for (const d of result.recordset) {
    if (!porIncapacidad.has(d.incapacidadId)) porIncapacidad.set(d.incapacidadId, []);
    porIncapacidad.get(d.incapacidadId).push(d);
  }
  return incapacidades.map((i) => ({ ...i, documentos: porIncapacidad.get(i.id) ?? [] }));
}

// GET /api/incapacidades/mis — historial del empleado actual
exports.getMisIncapacidades = async (req, res) => {
  try {
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('uid', sql.Int, uid)
      .query(`${SELECT_INCAPACIDAD} WHERE i.INC_USUARIO_ID = @uid ORDER BY i.INC_FECHA_SOLICITUD DESC`);
    const data = await attachDocumentos(pool, result.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo mis incapacidades:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/incapacidades — listado completo, solo RH/admin
exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const estado = req.query.estado;
    const where = estado ? 'WHERE i.INC_ESTADO = @estado' : '';
    const request = pool.request();
    if (estado) request.input('estado', sql.NVarChar, estado);
    const result = await request.query(`${SELECT_INCAPACIDAD} ${where} ORDER BY i.INC_FECHA_SOLICITUD DESC`);
    const data = await attachDocumentos(pool, result.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo incapacidades:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/incapacidades — el empleado solicita, con comprobante adjunto (multipart, 1 archivo requerido)
exports.crearSolicitud = async (req, res) => {
  try {
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const { tipo, motivo, fechaInicio, fechaFin } = req.body;
    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo inválido. Use uno de: ${TIPOS_VALIDOS.join(', ')}` });
    }
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ success: false, message: 'Faltan fechaInicio y fechaFin' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'El comprobante médico es requerido' });
    }

    const dias = diffDias(fechaInicio, fechaFin);
    if (dias < 1) {
      return res.status(400).json({ success: false, message: 'El rango de fechas no es válido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('uid', sql.Int, uid)
      .input('tipo', sql.NVarChar, tipo)
      .input('motivo', sql.NVarChar, motivo || null)
      .input('fechaInicio', sql.Date, fechaInicio)
      .input('fechaFin', sql.Date, fechaFin)
      .input('dias', sql.Int, dias)
      .query(`
        INSERT INTO dbo.INCAPACIDADES (INC_USUARIO_ID, INC_TIPO, INC_MOTIVO, INC_FECHA_INICIO, INC_FECHA_FIN, INC_DIAS, INC_ESTADO)
        VALUES (@uid, @tipo, @motivo, @fechaInicio, @fechaFin, @dias, 'pendiente');
        SELECT SCOPE_IDENTITY() as id;
      `);
    const incapacidadId = result.recordset[0].id;

    let encrypted;
    try {
      encrypted = encryptBuffer(req.file.buffer);
    } catch (err) {
      console.error('❌ Error cifrando comprobante:', err);
      return res.status(500).json({ success: false, message: 'Error cifrando el comprobante médico', errorCode: 'ENCRYPTION_CONFIG_ERROR' });
    }
    const { data, iv, tag } = encrypted;
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const keyId = (process.env.EXPEDIENTE_KEY_ID || '').trim() || null;

    await pool.request()
      .input('incapacidadId', sql.Int, incapacidadId)
      .input('nombre', sql.NVarChar, sanitizeFilename(req.file.originalname))
      .input('mime', sql.NVarChar, (req.file.mimetype || '').slice(0, 100))
      .input('tamano', sql.BigInt, req.file.size || data.length)
      .input('sha256', sql.Char(64), sha256)
      .input('iv', sql.VarBinary(12), iv)
      .input('tag', sql.VarBinary(16), tag)
      .input('keyId', sql.NVarChar, keyId)
      .input('data', sql.VarBinary(sql.MAX), data)
      .query(`
        INSERT INTO dbo.INCAPACIDADES_DOCUMENTOS
          (IDOC_INCAPACIDAD_ID, IDOC_NOMBRE_ORIGINAL, IDOC_MIME, IDOC_TAMANO_BYTES, IDOC_SHA256, IDOC_IV, IDOC_TAG, IDOC_KEY_ID, IDOC_DATA)
        VALUES (@incapacidadId, @nombre, @mime, @tamano, @sha256, @iv, @tag, @keyId, @data)
      `);

    const creada = await pool.request().input('id', sql.Int, incapacidadId).query(`${SELECT_INCAPACIDAD} WHERE i.INC_ID = @id`);
    const [data0] = await attachDocumentos(pool, creada.recordset);

    try { socketService.getIO(req.user?.empresa).emit('incapacidad:creada', data0); } catch (_) {}
    await logAudit(pool, { userId: uid, userName: req.user?.nombre || null, modulo: 'incapacidades', accion: 'solicitar', entidadId: String(incapacidadId), detalle: { tipo, dias }, ip: req.ip });
    res.status(201).json({ success: true, data: data0 });
  } catch (error) {
    console.error('Error creando solicitud de incapacidad:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/incapacidades/documentos/:docId/download — dueño de la incapacidad o RH/admin
exports.downloadDocumento = async (req, res) => {
  try {
    const { docId } = req.params;
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    const tipoUsuario = (req.user?.tipoUsuario || req.user?.role || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, docId).query(`
      SELECT d.IDOC_DATA as data, d.IDOC_IV as iv, d.IDOC_TAG as tag, d.IDOC_NOMBRE_ORIGINAL as nombre, d.IDOC_MIME as mime, i.INC_USUARIO_ID as usuarioId
      FROM dbo.INCAPACIDADES_DOCUMENTOS d
      INNER JOIN dbo.INCAPACIDADES i ON i.INC_ID = d.IDOC_INCAPACIDAD_ID
      WHERE d.IDOC_ID = @id
    `);
    if (result.recordset.length === 0) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

    const row = result.recordset[0];
    if (!esAdmin && Number(row.usuarioId) !== Number(uid)) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este documento' });
    }

    let decrypted;
    try {
      decrypted = decryptBuffer(row.data, row.iv, row.tag);
    } catch (err) {
      console.error('❌ Error descifrando comprobante:', err);
      return res.status(500).json({ success: false, message: 'Error al descifrar el comprobante' });
    }

    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(row.nombre)}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(decrypted);
  } catch (error) {
    console.error('Error descargando comprobante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Refleja cada día del rango como excepción en Asistencia (ASISTENCIA_EXCEPCIONES) al
// aprobar — mismo mecanismo que usa Vacaciones, así Nómina excluye esos días de faltas
// automáticamente (ver ASISTENCIA_EXCEPCIONES en nominaController.js) sin tocar ese módulo.
async function crearExcepcionesAsistencia(pool, incapacidad, creadoPor) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_EXCEPCIONES' AND xtype='U')
      CREATE TABLE ASISTENCIA_EXCEPCIONES (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        NEUS_ID         INT NOT NULL,
        FECHA           DATE NOT NULL,
        TIPO            NVARCHAR(20) NOT NULL DEFAULT 'VACACIONES',
        CREADO_POR      INT NOT NULL,
        FECHA_CREACION  DATETIME DEFAULT GETDATE(),
        SOLICITUD_ID    INT NULL,
        CONSTRAINT UQ_ASISTENCIA_EXCEPCIONES UNIQUE (NEUS_ID, FECHA)
      )
    `);

    const fi = new Date(incapacidad.fechaInicio);
    const ff = new Date(incapacidad.fechaFin);
    if (isNaN(fi.getTime()) || isNaN(ff.getTime())) return;

    for (let d = new Date(fi); d <= ff; d.setDate(d.getDate() + 1)) {
      const fechaStr = d.toISOString().slice(0, 10);
      await pool.request()
        .input('uid', sql.Int, incapacidad.usuarioId)
        .input('fecha', sql.NVarChar, fechaStr)
        .input('creadoPor', sql.Int, creadoPor || 0)
        .input('solicitudId', sql.Int, incapacidad.id)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXCEPCIONES WHERE NEUS_ID=@uid AND FECHA=@fecha)
            INSERT INTO ASISTENCIA_EXCEPCIONES (NEUS_ID, FECHA, TIPO, CREADO_POR, SOLICITUD_ID)
            VALUES (@uid, @fecha, 'INCAPACIDAD', @creadoPor, @solicitudId)
        `);
    }
  } catch (e) {
    console.error('❌ Error creando excepciones de asistencia por incapacidad:', e.message);
    // No se relanza: un fallo aquí no debe bloquear la aprobación.
  }
}

// PATCH /api/incapacidades/:id/responder — solo RH/admin
exports.responder = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentarioAdmin } = req.body;
    if (!['aprobada', 'rechazada'].includes(estado)) {
      return res.status(400).json({ success: false, message: "Estado inválido. Use 'aprobada' o 'rechazada'" });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id)
      .query('SELECT INC_ID, INC_USUARIO_ID as usuarioId, INC_FECHA_INICIO as fechaInicio, INC_FECHA_FIN as fechaFin, INC_ESTADO as estadoActual FROM dbo.INCAPACIDADES WHERE INC_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Incapacidad no encontrada' });
    if (existing.recordset[0].estadoActual !== 'pendiente') {
      return res.status(400).json({ success: false, message: 'Esta solicitud ya fue respondida' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('estado', sql.NVarChar, estado)
      .input('comentarioAdmin', sql.NVarChar, comentarioAdmin || null)
      .query(`
        UPDATE dbo.INCAPACIDADES
        SET INC_ESTADO=@estado, INC_COMENTARIO_ADMIN=@comentarioAdmin, INC_FECHA_RESPUESTA=GETDATE()
        WHERE INC_ID=@id
      `);

    if (estado === 'aprobada') {
      const aprobadoPorId = req.user?.id || req.user?.userId || 0;
      await crearExcepcionesAsistencia(pool, { id: parseInt(id), ...existing.recordset[0] }, aprobadoPorId);
    }

    const actualizada = await pool.request().input('id', sql.Int, id).query(`${SELECT_INCAPACIDAD} WHERE i.INC_ID = @id`);
    const [data] = await attachDocumentos(pool, actualizada.recordset);

    try { socketService.getIO(req.user?.empresa).emit('incapacidad:respondida', data); } catch (_) {}
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'incapacidades', accion: 'responder', entidadId: id, detalle: { estado }, ip: req.ip });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error respondiendo incapacidad:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
