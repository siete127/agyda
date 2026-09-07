const sql = require('mssql');
const QRCode = require('qrcode');
const databaseService = require('../services/databaseService');
const { ensureQrCodesSchema } = require('../services/schemaService');

function esAdmin(req) {
  return ['AD', 'TI'].includes(String(req.user?.tipoUsuario || '').toUpperCase());
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }

const ENTORNOS_VALIDOS = ['publico', 'privado'];

// Admin — genera un QR (PNG en base64) apuntando a la URL dada y lo guarda en
// el historial. "entorno" es solo una etiqueta para el propio usuario
// (público = URL de producción, privado = URL local/de red para pruebas) —
// no cambia nada del QR en sí, que siempre apunta exactamente a la URL dada.
exports.generar = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { nombre, url, entorno } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, message: 'Falta el nombre' });
    }
    if (!url || !/^https?:\/\//i.test(String(url).trim())) {
      return res.status(400).json({ success: false, message: 'URL inválida (debe empezar con http:// o https://)' });
    }
    const entornoNorm = ENTORNOS_VALIDOS.includes(entorno) ? entorno : 'publico';
    const urlLimpia = String(url).trim();

    const dataUrl = await QRCode.toDataURL(urlLimpia, { width: 512, margin: 2, errorCorrectionLevel: 'M' });

    const p = await pool(req);
    await ensureQrCodesSchema(p);
    const ins = await p.request()
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .input('url', sql.NVarChar, urlLimpia)
      .input('entorno', sql.NVarChar, entornoNorm)
      .input('imagen', sql.NVarChar(sql.MAX), dataUrl)
      .input('autorId', sql.Int, req.user?.id ?? null)
      .input('autorNombre', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .query(`
        INSERT INTO dbo.INTRANET_QR_CODES (QR_NOMBRE, QR_URL, QR_ENTORNO, QR_IMAGEN_DATAURL, QR_AUTOR_ID, QR_AUTOR_NOMBRE)
        OUTPUT INSERTED.QR_ID as id, INSERTED.QR_FECHA_CREACION as fechaCreacion
        VALUES (@nombre, @url, @entorno, @imagen, @autorId, @autorNombre)
      `);

    const row = ins.recordset[0];
    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        nombre: String(nombre).trim(),
        url: urlLimpia,
        entorno: entornoNorm,
        imagenDataUrl: dataUrl,
        autorNombre: req.user?.nombre || req.user?.username || null,
        fechaCreacion: row.fechaCreacion,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Admin — lista el historial de QRs generados, más recientes primero.
exports.listar = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await ensureQrCodesSchema(p);
    const r = await p.request().query(`
      SELECT QR_ID as id, QR_NOMBRE as nombre, QR_URL as url, QR_ENTORNO as entorno,
             QR_IMAGEN_DATAURL as imagenDataUrl, QR_AUTOR_NOMBRE as autorNombre,
             QR_FECHA_CREACION as fechaCreacion
      FROM dbo.INTRANET_QR_CODES
      ORDER BY QR_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Admin — elimina un QR del historial.
exports.eliminar = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.INTRANET_QR_CODES WHERE QR_ID = @id');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
