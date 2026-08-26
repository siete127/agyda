const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { sanitizeFilename, encryptBuffer, decryptBuffer } = require('../utils/cryptoDocs');

const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta', 'critica'];
// Enum literal del flujo pedido: 🟡Pendiente · 🔵En proceso · 🟠En espera del
// cliente · 🟢Resuelto · 🔴Escalado · ⚫Cerrado — renombrado desde el enum
// genérico anterior (abierta/en_proceso/resuelta/cerrada).
const ESTATUS_VALIDOS = ['pendiente', 'en_proceso', 'en_espera_cliente', 'resuelto', 'escalado', 'cerrado'];
const ESTATUS_QUE_CIERRAN = ['resuelto', 'cerrado'];
const ORIGENES_VALIDOS = ['manual', 'encuesta', 'pago_vencido'];
const SLA_HORAS_POR_PRIORIDAD = { baja: 72, media: 48, alta: 24, critica: 8 };

const INCIDENCIA_SELECT_FIELDS = `
  I.INC_ID as id, I.INC_FOLIO as folio, I.INC_CONTACTO_ID as contactoId, C.CONT_NOMBRE as contactoNombre,
  I.INC_TITULO as titulo, I.INC_DESCRIPCION as descripcion, I.INC_CATEGORIA as categoria,
  I.INC_PRIORIDAD as prioridad, I.INC_SLA_HORAS as slaHoras, I.INC_FECHA_LIMITE_SLA as fechaLimiteSla,
  I.INC_ESTATUS as estatus, I.INC_ORIGEN as origen, I.INC_ASIGNADO_A as asignadoA, U.NEUS_NOMBRES as asignadoNombre,
  I.INC_SOLUCION_PROPUESTA as solucionPropuesta, I.INC_FECHA_COMPROMISO as fechaCompromiso,
  I.INC_CREADO_POR as creadoPor, I.INC_FECHA_CREACION as fechaCreacion, I.INC_FECHA_RESOLUCION as fechaResolucion
`;

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

function generarFolioEnTransaccion(transaction) {
  const anio = new Date().getFullYear();
  return new sql.Request(transaction)
    .input('prefijo', sql.NVarChar, `INC-${anio}-`)
    .query(`
      SELECT MAX(CAST(SUBSTRING(INC_FOLIO, LEN(@prefijo) + 1, 10) AS INT)) as maxConsecutivo
      FROM CLI_INCIDENCIAS WITH (UPDLOCK, HOLDLOCK)
      WHERE INC_FOLIO LIKE @prefijo + '%'
    `)
    .then((rs) => {
      const siguiente = (rs.recordset[0].maxConsecutivo || 0) + 1;
      return `INC-${anio}-${String(siguiente).padStart(4, '0')}`;
    });
}

exports.list = async (req, res) => {
  try {
    const { estatus, prioridad, contactoId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const condiciones = ['I.INC_ACTIVO = 1'];
    const request = pool.request();
    if (estatus) { condiciones.push('I.INC_ESTATUS = @estatus'); request.input('estatus', sql.NVarChar, estatus); }
    if (prioridad) { condiciones.push('I.INC_PRIORIDAD = @prioridad'); request.input('prioridad', sql.NVarChar, prioridad); }
    if (contactoId) { condiciones.push('I.INC_CONTACTO_ID = @contactoId'); request.input('contactoId', sql.Int, contactoId); }

    const rs = await request.query(`
      SELECT ${INCIDENCIA_SELECT_FIELDS}
      FROM CLI_INCIDENCIAS I
      INNER JOIN CRM_CONTACTOS C ON C.CONT_ID = I.INC_CONTACTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = I.INC_ASIGNADO_A
      WHERE ${condiciones.join(' AND ')}
      ORDER BY I.INC_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error list incidencias:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT ${INCIDENCIA_SELECT_FIELDS}
        FROM CLI_INCIDENCIAS I
        INNER JOIN CRM_CONTACTOS C ON C.CONT_ID = I.INC_CONTACTO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = I.INC_ASIGNADO_A
        WHERE I.INC_CONTACTO_ID = @id AND I.INC_ACTIVO = 1
        ORDER BY I.INC_FECHA_CREACION DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listByContacto incidencias:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${INCIDENCIA_SELECT_FIELDS}
        FROM CLI_INCIDENCIAS I
        INNER JOIN CRM_CONTACTOS C ON C.CONT_ID = I.INC_CONTACTO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = I.INC_ASIGNADO_A
        WHERE I.INC_ID = @id AND I.INC_ACTIVO = 1
      `);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Incidencia no encontrada' });
    res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error getById incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const { contactoId, titulo, descripcion, categoria, prioridad, asignadoA, origen, solucionPropuesta, fechaCompromiso } = req.body || {};
    const contId = parseInt(contactoId, 10);
    if (!Number.isFinite(contId)) return res.status(400).json({ success: false, message: 'contactoId requerido' });
    if (!titulo || !String(titulo).trim()) return res.status(400).json({ success: false, message: 'Título requerido' });

    const prio = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : 'media';
    const org = ORIGENES_VALIDOS.includes(origen) ? origen : 'manual';
    const slaHoras = SLA_HORAS_POR_PRIORIDAD[prio];
    const asignado = asignadoA ? parseInt(asignadoA, 10) : null;

    await transaction.begin();
    const folio = await generarFolioEnTransaccion(transaction);

    const rs = await new sql.Request(transaction)
      .input('folio', sql.NVarChar(20), folio)
      .input('contactoId', sql.Int, contId)
      .input('titulo', sql.NVarChar(200), String(titulo).trim())
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('categoria', sql.NVarChar(50), categoria || null)
      .input('prioridad', sql.NVarChar(20), prio)
      .input('slaHoras', sql.Int, slaHoras)
      .input('origen', sql.NVarChar(20), org)
      .input('asignadoA', sql.Int, asignado)
      .input('solucionPropuesta', sql.NVarChar(sql.MAX), solucionPropuesta || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_INCIDENCIAS
          (INC_FOLIO, INC_CONTACTO_ID, INC_TITULO, INC_DESCRIPCION, INC_CATEGORIA, INC_PRIORIDAD,
           INC_SLA_HORAS, INC_FECHA_LIMITE_SLA, INC_ORIGEN, INC_ASIGNADO_A, INC_SOLUCION_PROPUESTA, INC_FECHA_COMPROMISO, INC_CREADO_POR)
        OUTPUT INSERTED.INC_ID
        VALUES (@folio, @contactoId, @titulo, @descripcion, @categoria, @prioridad,
                @slaHoras, DATEADD(HOUR, @slaHoras, GETDATE()), @origen, @asignadoA, @solucionPropuesta, @fechaCompromiso, @creadoPor)
      `);
    await transaction.commit();

    const id = rs.recordset[0].INC_ID;

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-incidencia', entidadId: id,
      detalle: { folio, contactoId: contId, prioridad: prio, origen: org }, ip: req.ip,
    });

    if (asignado) {
      await notificationService.createNotification({
        usuarioId: asignado,
        mensaje: `Nueva incidencia asignada: ${folio} — ${String(titulo).trim()}`,
        tipo: 'cliente-incidencia-asignada',
        dataExtra: { incidenciaId: id, contactoId: contId },
        tenantKey: req.user?.empresa,
      });
    }

    res.status(201).json({ success: true, data: { id, folio } });
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    console.error('Error create incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEstatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { estatus } = req.body || {};
    if (!ESTATUS_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const esCierre = ESTATUS_QUE_CIERRAN.includes(estatus);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar(20), estatus)
      .input('fechaResolucion', sql.DateTime, esCierre ? new Date() : null)
      .query(`
        UPDATE CLI_INCIDENCIAS SET INC_ESTATUS=@estatus, INC_FECHA_RESOLUCION=@fechaResolucion
        WHERE INC_ID=@id AND INC_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Incidencia no encontrada' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'actualizar-estatus-incidencia', entidadId: id,
      detalle: { estatus }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error updateEstatus incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Solución propuesta + fecha compromiso (campos del flujo: Atención → Solución
// propuesta → Fecha compromiso → Confirmación con cliente).
exports.updateSolucion = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { solucionPropuesta, fechaCompromiso } = req.body || {};

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('solucionPropuesta', sql.NVarChar(sql.MAX), solucionPropuesta || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .query(`
        UPDATE CLI_INCIDENCIAS SET INC_SOLUCION_PROPUESTA=@solucionPropuesta, INC_FECHA_COMPROMISO=@fechaCompromiso
        WHERE INC_ID=@id AND INC_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Incidencia no encontrada' });

    res.json({ success: true });
  } catch (e) {
    console.error('Error updateSolucion incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listComentarios = async (req, res) => {
  try {
    const incidenciaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(incidenciaId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, incidenciaId)
      .query(`
        SELECT ICO_ID as id, ICO_INCIDENCIA_ID as incidenciaId, ICO_COMENTARIO as comentario,
               ICO_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as usuarioNombre, ICO_FECHA as fecha
        FROM CLI_INCIDENCIAS_COMENTARIOS ICO
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = ICO.ICO_USUARIO_ID
        WHERE ICO_INCIDENCIA_ID = @id
        ORDER BY ICO_FECHA ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listComentarios incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const incidenciaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(incidenciaId)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { comentario } = req.body || {};
    if (!comentario || !String(comentario).trim()) return res.status(400).json({ success: false, message: 'Comentario requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('incidenciaId', sql.Int, incidenciaId)
      .input('comentario', sql.NVarChar(sql.MAX), String(comentario).trim())
      .input('usuarioId', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_INCIDENCIAS_COMENTARIOS (ICO_INCIDENCIA_ID, ICO_COMENTARIO, ICO_USUARIO_ID)
        OUTPUT INSERTED.ICO_ID
        VALUES (@incidenciaId, @comentario, @usuarioId)
      `);
    res.status(201).json({ success: true, data: { id: ins.recordset[0].ICO_ID } });
  } catch (e) {
    console.error('Error addComentario incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Evidencias (adjuntos) de incidencia — punto 7 del flujo del documento.
// Mismo patrón de cifrado que crmDocumentosClienteController.js (AES-256-GCM,
// utils/cryptoDocs.js), pero ligado a INC_ID en vez de CONT_ID.
exports.subirEvidencia = async (req, res) => {
  try {
    const incidenciaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(incidenciaId)) return res.status(400).json({ success: false, message: 'id inválido' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ success: false, message: 'Archivo requerido (field: file)' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const incidencia = await pool.request()
      .input('id', sql.Int, incidenciaId)
      .query(`SELECT TOP 1 INC_ID FROM CLI_INCIDENCIAS WHERE INC_ID=@id AND INC_ACTIVO=1`);
    if (!incidencia.recordset.length) return res.status(404).json({ success: false, message: 'Incidencia no encontrada' });

    const originalName = sanitizeFilename(req.file.originalname);
    const mime = (req.file.mimetype || '').toString().slice(0, 100);
    const sizeBytes = req.file.size || req.file.buffer.length;
    const descripcion = req.body && req.body.descripcion ? String(req.body.descripcion) : null;
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    let encrypted;
    try {
      encrypted = encryptBuffer(req.file.buffer);
    } catch (err) {
      console.error('❌ Error cifrando evidencia de incidencia:', err);
      return res.status(500).json({
        success: false,
        message: err && err.message ? err.message : 'Error cifrando evidencia',
        errorCode: 'ENCRYPTION_CONFIG_ERROR',
        hint: 'Configura EXPEDIENTE_ENCRYPTION_KEY (32 bytes base64/hex) en BackAgyda/.env y reinicia el backend.',
      });
    }
    const { data, iv, tag, cipherName } = encrypted;
    const keyId = (process.env.EXPEDIENTE_KEY_ID || '').trim() || null;

    const result = await pool.request()
      .input('incidenciaId', sql.Int, incidenciaId)
      .input('nombreOriginal', sql.NVarChar(255), originalName)
      .input('mime', sql.NVarChar(100), mime || null)
      .input('sizeBytes', sql.BigInt, sizeBytes)
      .input('descripcion', sql.NVarChar(500), descripcion)
      .input('data', sql.VarBinary(sql.MAX), data)
      .input('hash', sql.Char(64), sha256)
      .input('encAlgo', sql.NVarChar(30), cipherName)
      .input('iv', sql.VarBinary(12), iv)
      .input('tag', sql.VarBinary(16), tag)
      .input('keyId', sql.NVarChar(50), keyId)
      .input('subidoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_INCIDENCIAS_EVIDENCIAS
          (EVI_INCIDENCIA_ID, EVI_NOMBRE_ORIGINAL, EVI_MIME_TYPE, EVI_TAMANO_BYTES, EVI_DESCRIPCION,
           EVI_ENCRYPTED_DATA, EVI_CONTENT_HASH, EVI_ENC_ALGO, EVI_ENC_IV, EVI_ENC_TAG, EVI_KEY_ID, EVI_SUBIDO_POR)
        OUTPUT INSERTED.EVI_ID, INSERTED.EVI_FECHA_SUBIDA
        VALUES
          (@incidenciaId, @nombreOriginal, @mime, @sizeBytes, @descripcion,
           @data, @hash, @encAlgo, @iv, @tag, @keyId, @subidoPor)
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'subir-evidencia-incidencia', entidadId: incidenciaId,
      detalle: { filename: originalName, sizeBytes }, ip: req.ip,
    });

    res.json({
      success: true,
      data: {
        id: result.recordset[0].EVI_ID,
        incidenciaId,
        nombreOriginal: originalName,
        sizeBytes,
        fechaSubida: result.recordset[0].EVI_FECHA_SUBIDA,
      },
    });
  } catch (e) {
    console.error('Error subirEvidencia incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listEvidencias = async (req, res) => {
  try {
    const incidenciaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(incidenciaId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('incidenciaId', sql.Int, incidenciaId)
      .query(`
        SELECT EVI_ID as id, EVI_INCIDENCIA_ID as incidenciaId, EVI_NOMBRE_ORIGINAL as nombreOriginal,
               EVI_MIME_TYPE as mimeType, EVI_TAMANO_BYTES as tamanoBytes, EVI_DESCRIPCION as descripcion,
               EVI_SUBIDO_POR as subidoPor, EVI_FECHA_SUBIDA as fechaSubida
        FROM CLI_INCIDENCIAS_EVIDENCIAS
        WHERE EVI_INCIDENCIA_ID = @incidenciaId AND EVI_ACTIVO = 1
        ORDER BY EVI_FECHA_SUBIDA DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listEvidencias incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.downloadEvidencia = async (req, res) => {
  try {
    const evidenciaId = parseInt(req.params.evidenciaId, 10);
    if (!Number.isFinite(evidenciaId)) return res.status(400).json({ success: false, message: 'evidenciaId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('evidenciaId', sql.Int, evidenciaId)
      .query(`
        SELECT TOP 1 EVI_ID, EVI_NOMBRE_ORIGINAL, EVI_MIME_TYPE, EVI_ENC_IV, EVI_ENC_TAG, EVI_ENCRYPTED_DATA
        FROM CLI_INCIDENCIAS_EVIDENCIAS WHERE EVI_ID = @evidenciaId AND EVI_ACTIVO = 1
      `);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    const row = result.recordset[0];
    let decrypted;
    try {
      decrypted = decryptBuffer(row.EVI_ENCRYPTED_DATA, row.EVI_ENC_IV, row.EVI_ENC_TAG);
    } catch (err) {
      console.error('❌ Error descifrando evidencia de incidencia:', err);
      return res.status(500).json({ success: false, message: 'Error descifrando evidencia', errorCode: 'DECRYPTION_ERROR' });
    }

    const filename = sanitizeFilename(row.EVI_NOMBRE_ORIGINAL);
    res.setHeader('Content-Type', row.EVI_MIME_TYPE || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(decrypted);
  } catch (e) {
    console.error('Error downloadEvidencia incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteEvidencia = async (req, res) => {
  try {
    const evidenciaId = parseInt(req.params.evidenciaId, 10);
    if (!Number.isFinite(evidenciaId)) return res.status(400).json({ success: false, message: 'evidenciaId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('evidenciaId', sql.Int, evidenciaId)
      .query(`
        UPDATE CLI_INCIDENCIAS_EVIDENCIAS SET EVI_ACTIVO = 0
        WHERE EVI_ID = @evidenciaId AND EVI_ACTIVO = 1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'eliminar-evidencia-incidencia', entidadId: evidenciaId, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleteEvidencia incidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Fase 4 (encuestas negativas) y Fase 3 (pago muy vencido) crean incidencias
// automáticamente vía esta función interna, sin pasar por HTTP.
exports.crearIncidenciaAutomatica = async ({ contactoId, titulo, descripcion, categoria, prioridad, origen, tenantKey }) => {
  const pool = await databaseService.getPool(tenantKey);
  const transaction = new sql.Transaction(pool);
  try {
    const prio = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : 'alta';
    const slaHoras = SLA_HORAS_POR_PRIORIDAD[prio];

    await transaction.begin();
    const folio = await generarFolioEnTransaccion(transaction);

    const rs = await new sql.Request(transaction)
      .input('folio', sql.NVarChar(20), folio)
      .input('contactoId', sql.Int, contactoId)
      .input('titulo', sql.NVarChar(200), titulo)
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('categoria', sql.NVarChar(50), categoria || null)
      .input('prioridad', sql.NVarChar(20), prio)
      .input('slaHoras', sql.Int, slaHoras)
      .input('origen', sql.NVarChar(20), origen)
      .query(`
        INSERT INTO CLI_INCIDENCIAS
          (INC_FOLIO, INC_CONTACTO_ID, INC_TITULO, INC_DESCRIPCION, INC_CATEGORIA, INC_PRIORIDAD,
           INC_SLA_HORAS, INC_FECHA_LIMITE_SLA, INC_ORIGEN)
        OUTPUT INSERTED.INC_ID
        VALUES (@folio, @contactoId, @titulo, @descripcion, @categoria, @prioridad,
                @slaHoras, DATEADD(HOUR, @slaHoras, GETDATE()), @origen)
      `);
    await transaction.commit();

    const id = rs.recordset[0].INC_ID;

    const contacto = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_RESPONSABLE_ID as responsableId FROM CRM_CONTACTOS WHERE CONT_ID=@id`);
    const responsableId = contacto.recordset[0]?.responsableId;
    if (responsableId) {
      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: `Incidencia automática creada: ${folio} — ${titulo}`,
        tipo: 'cliente-incidencia-automatica',
        dataExtra: { incidenciaId: id, contactoId },
        tenantKey,
      });
    }

    return { id, folio };
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    console.error('Error crearIncidenciaAutomatica:', e);
    return null;
  }
};
