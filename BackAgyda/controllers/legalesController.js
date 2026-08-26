const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

const LEGALES_DIR = 'C:/inetpub/wwwroot/intranet/intranet/Legales';

exports.listarDocumentos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    let query = `
      SELECT LD_ID as id, LD_TITULO as titulo, LD_CATEGORIA as categoria,
             LD_NOMBRE_ARCHIVO as nombreArchivo, LD_NOMBRE_ORIGINAL as nombreOriginal,
             LD_FECHA_SUBIDA as fechaSubida
      FROM LEGALES_DOCUMENTOS
      WHERE LD_ACTIVO=1
    `;

    const { q, categoria } = req.query;
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      query += ' AND LD_TITULO LIKE @q';
    }
    if (categoria) {
      request.input('categoria', sql.NVarChar, categoria);
      query += ' AND LD_CATEGORIA = @categoria';
    }
    query += ' ORDER BY LD_FECHA_SUBIDA DESC';

    const rs = await request.query(query);
    return res.json({ success: true, data: rs.recordset });

  } catch (error) {
    console.error('❌ Error listando documentos legales:', error);
    return res.status(500).json({
      error: 'No se pudo listar los documentos.'
    });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        SUM(CASE WHEN LD_ACTIVO = 1 THEN 1 ELSE 0 END) as documentosActivos,
        SUM(CASE WHEN LD_ACTIVO = 1 AND LD_FECHA_SUBIDA >= DATEADD(day, -DAY(GETDATE()) + 1, CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END) as documentosMes
      FROM LEGALES_DOCUMENTOS
    `);
    const row = rs.recordset?.[0] || {};
    return res.json({
      success: true,
      data: {
        documentosActivos: row.documentosActivos || 0,
        documentosMes: row.documentosMes || 0,
      },
    });
  } catch (error) {
    console.error('❌ Error obteniendo dashboard legal:', error);
    return res.status(500).json({ error: 'No se pudo obtener el dashboard.' });
  }
};

exports.subirDocumento = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo.' });
  }

  try {
    const titulo = req.body.titulo || req.file.originalname;
    const categoria = req.body.categoria || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('titulo', sql.NVarChar, titulo)
      .input('categoria', sql.NVarChar, categoria)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .input('subidoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO LEGALES_DOCUMENTOS (LD_TITULO, LD_CATEGORIA, LD_NOMBRE_ARCHIVO, LD_NOMBRE_ORIGINAL, LD_SUBIDO_POR)
        VALUES (@titulo, @categoria, @nombreArchivo, @nombreOriginal, @subidoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);

    const documentoId = rs.recordset?.[0]?.id || null;

    try {
      const notificationService = require('../services/notificationService');
      const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
      const usuarioIds = await getUsuariosParaNotificarCorreo('legal', req.user?.empresa);
      for (const usuarioId of usuarioIds) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: 'Nuevo documento legal: ' + titulo,
          tipo: 'legal_nuevo_documento',
          dataExtra: { documentoId },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (notifyErr) {
      console.warn('⚠️ Error notificando nuevo documento legal:', notifyErr?.message || notifyErr);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Error subiendo documento legal:', error);
    return res.status(500).json({ error: 'No se pudo subir el documento.' });
  }
};

exports.eliminarDocumento = async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('filename', sql.NVarChar, filename)
      .query(`UPDATE LEGALES_DOCUMENTOS SET LD_ACTIVO=0 WHERE LD_NOMBRE_ARCHIVO=@filename`);

    if (rs.rowsAffected?.[0] > 0) {
      return res.json({ message: 'Documento eliminado correctamente.' });
    }

    const filePath = path.join(LEGALES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    fs.unlinkSync(filePath);
    return res.json({ message: 'Documento eliminado correctamente.' });

  } catch (error) {
    console.error('❌ Error eliminando documento legal:', error);
    return res.status(500).json({
      error: 'No se pudo eliminar el documento.'
    });
  }
};

exports.actualizarDocumento = (req, res) => {
  try {
    const targetFilename = path.basename(req.params.filename);
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo para actualizar.' });
    }

    const uploadedFilename = req.file.filename;
    const uploadedPath = path.join(LEGALES_DIR, uploadedFilename);
    const targetPath = path.join(LEGALES_DIR, targetFilename);

    // Si el archivo objetivo existe, eliminarlo antes de renombrar
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (e) {
        console.error('❌ Error eliminando archivo objetivo antes de actualizar:', e);
        // intentar continuar renombrando de todos modos
      }
    }

    // Renombrar el archivo subido al nombre del target
    fs.renameSync(uploadedPath, targetPath);

    return res.json({ message: 'Documento actualizado correctamente.', filename: targetFilename });
  } catch (error) {
    console.error('❌ Error actualizando documento legal:', error);
    return res.status(500).json({ error: 'No se pudo actualizar el documento.' });
  }
};

exports.viewDocumento = (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(LEGALES_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    // Sólo servir PDFs e imágenes por seguridad
    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.gif'];
    if (!allowed.includes(ext)) {
      return res.status(403).json({ error: 'Tipo de archivo no permitido.' });
    }

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      console.error('❌ Error streaming file:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Error al leer el archivo.' });
    });
    return stream.pipe(res);
  } catch (err) {
    console.error('❌ viewDocumento error:', err);
    return res.status(500).json({ error: 'Error interno al servir documento.' });
  }
};
