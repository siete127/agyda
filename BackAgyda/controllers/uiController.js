const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const sql = require('mssql');
const logger = global.logger || require('../utils/logger');

// Default matches Flutter BackgroundProvider _defaultColor (0xFFF8FAFC) stored as signed int32.
const DEFAULT_BG = {
  mode: 'solid',
  color1: -460036,
  color2: -460036,
  direction: 0,
};

function normalizeMode(raw) {
  const m = (raw ?? '').toString().trim().toLowerCase();
  if (m === 'solid' || m === 'gradient') return m;
  return null;
}

function normalizeDirection(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const dir = Math.trunc(n);
  if (dir < 0 || dir > 3) return null;
  return dir;
}

// Accepts either signed int32 (-2147483648..2147483647) or unsigned 32-bit (0..4294967295)
// and returns a signed int32 suitable for SQL INT.
function normalizeColorInt32(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const v = Math.trunc(n);

  // signed int32
  if (v >= -2147483648 && v <= 2147483647) return v;

  // unsigned 32-bit
  if (v >= 0 && v <= 4294967295) {
    return v > 2147483647 ? v - 4294967296 : v;
  }

  return null;
}

function formatRow(row) {
  if (!row) return DEFAULT_BG;
  return {
    mode: (row.MODE ?? DEFAULT_BG.mode).toString().toLowerCase(),
    color1: typeof row.COLOR1 === 'number' ? row.COLOR1 : DEFAULT_BG.color1,
    color2: typeof row.COLOR2 === 'number' ? row.COLOR2 : DEFAULT_BG.color2,
    direction:
      typeof row.DIRECTION === 'number' ? row.DIRECTION : DEFAULT_BG.direction,
    updatedAt: row.UPDATED_AT ?? null,
    updatedBy: row.UPDATED_BY ?? null,
  };
}

async function getBackground(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool
      .request()
      .query(
        `SELECT TOP 1 MODE, COLOR1, COLOR2, DIRECTION, UPDATED_AT, UPDATED_BY
         FROM dbo.INTRANET_UI_BACKGROUND_SETTINGS
         WHERE ID = 1;`
      );

    const row = rs.recordset && rs.recordset.length ? rs.recordset[0] : null;
    return res.json({ success: true, data: formatRow(row) });
  } catch (err) {
    logger.warn('[uiController.getBackground] error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo configuración de fondo',
    });
  }
}

async function updateBackground(req, res) {
  try {
    const body = req.body || {};

    const mode = normalizeMode(body.mode ?? body.MODE);
    const color1 = normalizeColorInt32(body.color1 ?? body.COLOR1);
    const color2 = normalizeColorInt32(body.color2 ?? body.COLOR2);
    const direction = normalizeDirection(body.direction ?? body.DIRECTION);

    if (!mode) {
      return res
        .status(400)
        .json({ success: false, message: 'mode inválido (solid|gradient)' });
    }

    if (color1 === null) {
      return res.status(400).json({
        success: false,
        message: 'color1 inválido (int32 o 0..4294967295)',
      });
    }

    let effectiveColor2 = color2;
    let effectiveDir = direction ?? 0;

    if (mode === 'solid') {
      effectiveColor2 = color1;
      effectiveDir = 0;
    } else {
      if (effectiveColor2 === null) {
        return res.status(400).json({
          success: false,
          message: 'color2 inválido (requerido para gradient)',
        });
      }
      if (effectiveDir < 0 || effectiveDir > 3) {
        return res
          .status(400)
          .json({ success: false, message: 'direction inválido (0..3)' });
      }
    }

    const tokenUser = req.user || {};
    const updatedBy =
      tokenUser.id ?? tokenUser.userId ?? tokenUser.sub ?? tokenUser.uid ?? null;

    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool
      .request()
      .input('id', sql.Int, 1)
      .input('mode', sql.NVarChar(20), mode)
      .input('c1', sql.Int, color1)
      .input('c2', sql.Int, effectiveColor2)
      .input('dir', sql.Int, effectiveDir)
      .input('updatedBy', sql.Int, updatedBy ? Number(updatedBy) : null)
      .query(`
IF EXISTS (SELECT 1 FROM dbo.INTRANET_UI_BACKGROUND_SETTINGS WHERE ID = @id)
BEGIN
  UPDATE dbo.INTRANET_UI_BACKGROUND_SETTINGS
    SET MODE = @mode,
        COLOR1 = @c1,
        COLOR2 = @c2,
        DIRECTION = @dir,
        UPDATED_AT = SYSDATETIME(),
        UPDATED_BY = @updatedBy
  WHERE ID = @id;
END
ELSE
BEGIN
  INSERT INTO dbo.INTRANET_UI_BACKGROUND_SETTINGS (ID, MODE, COLOR1, COLOR2, DIRECTION, UPDATED_AT, UPDATED_BY)
  VALUES (@id, @mode, @c1, @c2, @dir, SYSDATETIME(), @updatedBy);
END

SELECT TOP 1 MODE, COLOR1, COLOR2, DIRECTION, UPDATED_AT, UPDATED_BY
FROM dbo.INTRANET_UI_BACKGROUND_SETTINGS
WHERE ID = @id;
      `);

    const row = rs.recordset && rs.recordset.length ? rs.recordset[0] : null;
    const data = formatRow(row);

    // Broadcast real-time update to all connected clients.
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.emit('ui:backgroundChanged', data);
    } catch (_) {
      // Socket service may not be initialized in some contexts (tests/scripts).
    }

    return res.json({ success: true, data });
  } catch (err) {
    logger.warn('[uiController.updateBackground] error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: 'Error actualizando configuración de fondo',
    });
  }
}

module.exports = {
  getBackground,
  updateBackground,
};
