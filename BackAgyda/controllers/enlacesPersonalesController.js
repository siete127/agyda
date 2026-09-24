const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { limpiarEnlace } = require('./personalizacionController');
const logger = global.logger || require('../utils/logger');

// Mismo tope que los enlaces del encabezado de la empresa.
const MAX_ENLACES = 12;

// GET /api/enlaces-personales — los enlaces del usuario autenticado.
exports.getMios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('id', sql.Int, req.user?.id)
      .query('SELECT ENLACES FROM dbo.USUARIO_ENLACES_PERSONALES WHERE NEUS_ID = @id');
    let enlaces = [];
    try {
      const raw = r.recordset[0] ? JSON.parse(r.recordset[0].ENLACES) : [];
      enlaces = Array.isArray(raw) ? raw.map(limpiarEnlace).filter(Boolean) : [];
    } catch (_) { enlaces = []; }
    res.json({ success: true, data: enlaces });
  } catch (e) {
    logger.error('enlacesPersonalesController.getMios', e);
    res.status(500).json({ success: false, message: 'Error al obtener tus enlaces' });
  }
};

// PUT /api/enlaces-personales — reemplaza la lista del usuario autenticado.
// Body: array de { id?, label, url, icono, color, modo, visible }
exports.updateMios = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : req.body?.enlaces;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, message: 'Se espera un array de enlaces' });
    }
    const enlaces = incoming.map(limpiarEnlace).filter(Boolean).slice(0, MAX_ENLACES);

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, req.user?.id)
      .input('enlaces', sql.NVarChar(sql.MAX), JSON.stringify(enlaces))
      .query(`
        UPDATE dbo.USUARIO_ENLACES_PERSONALES SET ENLACES = @enlaces, UPDATED_AT = GETDATE() WHERE NEUS_ID = @id;
        IF @@ROWCOUNT = 0
          INSERT INTO dbo.USUARIO_ENLACES_PERSONALES (NEUS_ID, ENLACES) VALUES (@id, @enlaces);
      `);
    res.json({ success: true, data: enlaces });
  } catch (e) {
    logger.error('enlacesPersonalesController.updateMios', e);
    res.status(500).json({ success: false, message: 'Error al guardar tus enlaces' });
  }
};
