const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { sanitizeFilename, encryptBuffer, decryptBuffer } = require('../utils/cryptoDocs');

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

exports.upload = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) {
      return res.status(400).json({ success: false, message: 'contactoId inválido' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Archivo requerido (field: file)' });
    }

    const originalName = sanitizeFilename(req.file.originalname);
    const mime = (req.file.mimetype || '').toString().slice(0, 100);
    const sizeBytes = req.file.size || req.file.buffer.length;
    const descripcion = req.body && req.body.descripcion ? String(req.body.descripcion) : null;
    const categoria = req.body && req.body.categoria ? String(req.body.categoria) : null;
    const visiblePortal = req.body && (req.body.visiblePortal === 'false' || req.body.visiblePortal === false) ? false : true;
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    let encrypted;
    try {
      encrypted = encryptBuffer(req.file.buffer);
    } catch (err) {
      console.error('❌ Error cifrando documento CRM:', err);
      return res.status(500).json({
        success: false,
        message: err && err.message ? err.message : 'Error cifrando documento',
        errorCode: 'ENCRYPTION_CONFIG_ERROR',
        hint: 'Configura EXPEDIENTE_ENCRYPTION_KEY (32 bytes base64/hex) en BackAgyda/.env y reinicia el backend.'
      });
    }
    const { data, iv, tag, cipherName } = encrypted;
    const keyId = (process.env.EXPEDIENTE_KEY_ID || '').trim() || null;

    const pool = await databaseService.getPool(req.user?.empresa);

    const contacto = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT TOP 1 CONT_ID FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
    if (!contacto.recordset.length) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });

    const result = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .input('nombreOriginal', sql.NVarChar(255), originalName)
      .input('mime', sql.NVarChar(100), mime || null)
      .input('sizeBytes', sql.BigInt, sizeBytes)
      .input('descripcion', sql.NVarChar(500), descripcion)
      .input('categoria', sql.NVarChar(100), categoria)
      .input('data', sql.VarBinary(sql.MAX), data)
      .input('hash', sql.Char(64), sha256)
      .input('encAlgo', sql.NVarChar(30), cipherName)
      .input('iv', sql.VarBinary(12), iv)
      .input('tag', sql.VarBinary(16), tag)
      .input('keyId', sql.NVarChar(50), keyId)
      .input('visiblePortal', sql.Bit, visiblePortal)
      .input('subidoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CRM_DOCUMENTOS_CLIENTE
          (DOC_CONTACTO_ID, DOC_NOMBRE_ORIGINAL, DOC_MIME_TYPE, DOC_TAMANO_BYTES, DOC_DESCRIPCION, DOC_CATEGORIA,
           DOC_ENCRYPTED_DATA, DOC_CONTENT_HASH, DOC_ENC_ALGO, DOC_ENC_IV, DOC_ENC_TAG, DOC_KEY_ID, DOC_VISIBLE_PORTAL, DOC_SUBIDO_POR)
        OUTPUT INSERTED.DOC_ID, INSERTED.DOC_FECHA_SUBIDA
        VALUES
          (@contactoId, @nombreOriginal, @mime, @sizeBytes, @descripcion, @categoria,
           @data, @hash, @encAlgo, @iv, @tag, @keyId, @visiblePortal, @subidoPor)
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'crm', accion: 'subir-documento-cliente', entidadId: contactoId,
      detalle: { filename: originalName, sizeBytes }, ip: req.ip
    });

    res.json({
      success: true,
      data: {
        id: result.recordset[0].DOC_ID,
        contactoId,
        nombreOriginal: originalName,
        sha256,
        sizeBytes,
        fechaSubida: result.recordset[0].DOC_FECHA_SUBIDA
      }
    });
  } catch (e) {
    console.error('Error upload documento cliente CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'contactoId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .query(`
        SELECT DOC_ID as id, DOC_CONTACTO_ID as contactoId, DOC_NOMBRE_ORIGINAL as nombreOriginal,
               DOC_MIME_TYPE as mimeType, DOC_TAMANO_BYTES as tamanoBytes, DOC_DESCRIPCION as descripcion,
               DOC_CATEGORIA as categoria, DOC_VISIBLE_PORTAL as visiblePortal,
               DOC_SUBIDO_POR as subidoPor, DOC_FECHA_SUBIDA as fechaSubida
        FROM CRM_DOCUMENTOS_CLIENTE
        WHERE DOC_CONTACTO_ID = @contactoId AND DOC_ACTIVO = 1
        ORDER BY DOC_FECHA_SUBIDA DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listByContacto documentos CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.download = async (req, res) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('docId', sql.Int, docId)
      .query(`
        SELECT TOP 1 DOC_ID, DOC_NOMBRE_ORIGINAL, DOC_MIME_TYPE, DOC_ENC_IV, DOC_ENC_TAG, DOC_ENCRYPTED_DATA
        FROM CRM_DOCUMENTOS_CLIENTE WHERE DOC_ID = @docId AND DOC_ACTIVO = 1
      `);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

    const row = result.recordset[0];
    let decrypted;
    try {
      decrypted = decryptBuffer(row.DOC_ENCRYPTED_DATA, row.DOC_ENC_IV, row.DOC_ENC_TAG);
    } catch (err) {
      console.error('❌ Error descifrando documento CRM:', err);
      return res.status(500).json({ success: false, message: 'Error descifrando documento', errorCode: 'DECRYPTION_ERROR' });
    }

    const filename = sanitizeFilename(row.DOC_NOMBRE_ORIGINAL);
    res.setHeader('Content-Type', row.DOC_MIME_TYPE || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(decrypted);
  } catch (e) {
    console.error('Error download documento cliente CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleVisiblePortal = async (req, res) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });
    const visible = !!req.body.visible;

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('docId', sql.Int, docId)
      .input('visible', sql.Bit, visible)
      .query(`
        UPDATE CRM_DOCUMENTOS_CLIENTE SET DOC_VISIBLE_PORTAL = @visible
        WHERE DOC_ID = @docId AND DOC_ACTIVO = 1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

    res.json({ success: true });
  } catch (e) {
    console.error('Error toggleVisiblePortal documento CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('docId', sql.Int, docId)
      .query(`
        UPDATE CRM_DOCUMENTOS_CLIENTE SET DOC_ACTIVO = 0
        WHERE DOC_ID = @docId AND DOC_ACTIVO = 1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'crm', accion: 'eliminar-documento-cliente', entidadId: docId, detalle: null, ip: req.ip
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error delete documento cliente CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
