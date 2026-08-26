const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { IMAGEN_CORPORATIVA_DIR } = require('../middleware/imagenCorporativaUpload');

const CATEGORIAS_VALIDAS = ['logo', 'paleta', 'tipografia', 'plantilla', 'manual', 'otro'];

async function listAssets(req, res) {
  try {
    const { categoria, q } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const where = ['MIA_ACTIVO = 1'];

    if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) {
      request.input('categoria', sql.NVarChar, categoria);
      where.push('MIA.MIA_CATEGORIA = @categoria');
    }
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where.push('MIA.MIA_TITULO LIKE @q');
    }

    const rs = await request.query(`
      SELECT MIA.MIA_ID as id, MIA.MIA_TITULO as titulo, MIA.MIA_CATEGORIA as categoria, MIA.MIA_DESCRIPCION as descripcion,
             MIA.MIA_NOMBRE_ARCHIVO as nombreArchivo, MIA.MIA_NOMBRE_ORIGINAL as nombreOriginal, MIA.MIA_MIME as mime,
             MIA.MIA_TAMANIO as tamanio, MIA.MIA_SUBIDO_POR as subidoPor, U.NEUS_NOMBRES as subidoPorNombre, MIA.MIA_CREATED_AT as createdAt
      FROM MARKETING_IMAGEN_ASSETS MIA
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MIA.MIA_SUBIDO_POR
      WHERE ${where.join(' AND ')}
      ORDER BY MIA.MIA_CREATED_AT DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('imagenCorporativaController.listAssets', err);
    res.status(500).json({ success: false, message: 'Error al obtener assets de imagen corporativa' });
  }
}

async function subirAsset(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const { titulo, categoria, descripcion } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ success: false, message: 'Categoría inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('categoria', sql.NVarChar, categoria)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .input('mime', sql.NVarChar, req.file.mimetype)
      .input('tamanio', sql.Int, req.file.size)
      .input('subidoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO MARKETING_IMAGEN_ASSETS (MIA_TITULO, MIA_CATEGORIA, MIA_DESCRIPCION, MIA_NOMBRE_ARCHIVO, MIA_NOMBRE_ORIGINAL, MIA_MIME, MIA_TAMANIO, MIA_SUBIDO_POR)
        OUTPUT INSERTED.MIA_ID as id
        VALUES (@titulo, @categoria, @descripcion, @nombreArchivo, @nombreOriginal, @mime, @tamanio, @subidoPor);
      `);

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('imagenCorporativaController.subirAsset', err);
    res.status(500).json({ success: false, message: 'Error al subir el asset' });
  }
}

async function actualizarAsset(req, res) {
  try {
    const { id } = req.params;
    const { titulo, categoria, descripcion } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ success: false, message: 'Categoría inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('categoria', sql.NVarChar, categoria)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .query(`
        UPDATE MARKETING_IMAGEN_ASSETS
        SET MIA_TITULO=@titulo, MIA_CATEGORIA=@categoria, MIA_DESCRIPCION=@descripcion
        WHERE MIA_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('imagenCorporativaController.actualizarAsset', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el asset' });
  }
}

async function eliminarAsset(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MIA_NOMBRE_ARCHIVO as nombreArchivo FROM MARKETING_IMAGEN_ASSETS WHERE MIA_ID=@id`);
    const asset = rs.recordset[0];
    if (!asset) return res.status(404).json({ success: false, message: 'Asset no encontrado' });

    await pool.request().input('id', sql.Int, id).query(`UPDATE MARKETING_IMAGEN_ASSETS SET MIA_ACTIVO=0 WHERE MIA_ID=@id`);

    try {
      const filePath = path.join(IMAGEN_CORPORATIVA_DIR, path.basename(asset.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('imagenCorporativaController.eliminarAsset fs', fsErr?.message || fsErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('imagenCorporativaController.eliminarAsset', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el asset' });
  }
}

async function verAsset(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MIA_NOMBRE_ARCHIVO as nombreArchivo, MIA_NOMBRE_ORIGINAL as nombreOriginal FROM MARKETING_IMAGEN_ASSETS WHERE MIA_ID=@id`);
    const asset = rs.recordset[0];
    if (!asset) return res.status(404).json({ success: false, message: 'Asset no encontrado' });

    const filename = path.basename(asset.nombreArchivo);
    const filePath = path.join(IMAGEN_CORPORATIVA_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const mimeByExt = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    if (!mimeByExt[ext]) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', mimeByExt[ext]);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('imagenCorporativaController.verAsset stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('imagenCorporativaController.verAsset', err);
    res.status(500).json({ success: false, message: 'Error al servir el asset' });
  }
}

module.exports = { listAssets, subirAsset, actualizarAsset, eliminarAsset, verAsset };
