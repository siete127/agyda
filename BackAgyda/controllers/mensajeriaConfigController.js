const sql = require('mssql');
const databaseService = require('../services/databaseService');

const DEFAULTS = {
  burbujaActiva: true,
  burbujaAutoocultar: true,
  burbujaDuracionSeg: 15,
  permitirAdjuntos: true,
  tema: 'claro',
  colorMensajePropio: '#2563EB',
  colorMensajeAjeno: '#FFFFFF',
};

const TEMAS_VALIDOS = ['claro', 'oscuro'];
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

function mapRow(row) {
  return {
    burbujaActiva: Boolean(row.MPU_BURBUJA_ACTIVA),
    burbujaAutoocultar: Boolean(row.MPU_BURBUJA_AUTOOCULTAR),
    burbujaDuracionSeg: row.MPU_BURBUJA_DURACION_SEG,
    permitirAdjuntos: Boolean(row.MPU_PERMITIR_ADJUNTOS),
    tema: row.MPU_TEMA,
    colorMensajePropio: row.MPU_COLOR_MENSAJE_PROPIO,
    colorMensajeAjeno: row.MPU_COLOR_MENSAJE_AJENO,
  };
}

// Autenticado — devuelve la config del usuario, o los defaults si nunca la configuró.
exports.getMiConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM dbo.MSJ_PREFERENCIAS_USUARIO WHERE MPU_USUARIO_ID = @userId');

    if (rs.recordset.length === 0) {
      return res.json({ success: true, data: DEFAULTS });
    }

    res.json({ success: true, data: mapRow(rs.recordset[0]) });
  } catch (error) {
    console.error('Error obteniendo config de mensajería:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado — actualiza (o crea) la config del usuario. Upsert parcial: solo los campos enviados se sobreescriben.
exports.actualizarMiConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    if (body.burbujaDuracionSeg !== undefined) {
      const seg = Number(body.burbujaDuracionSeg);
      if (!Number.isFinite(seg) || seg < 3 || seg > 120) {
        return res.status(400).json({ success: false, message: 'burbujaDuracionSeg debe estar entre 3 y 120 segundos' });
      }
    }
    if (body.tema !== undefined && !TEMAS_VALIDOS.includes(body.tema)) {
      return res.status(400).json({ success: false, message: `tema inválido. Use uno de: ${TEMAS_VALIDOS.join(', ')}` });
    }
    if (body.colorMensajePropio !== undefined && !HEX_COLOR_RE.test(body.colorMensajePropio)) {
      return res.status(400).json({ success: false, message: 'colorMensajePropio debe ser un color hex válido (#RRGGBB)' });
    }
    if (body.colorMensajeAjeno !== undefined && !HEX_COLOR_RE.test(body.colorMensajeAjeno)) {
      return res.status(400).json({ success: false, message: 'colorMensajeAjeno debe ser un color hex válido (#RRGGBB)' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM dbo.MSJ_PREFERENCIAS_USUARIO WHERE MPU_USUARIO_ID = @userId');

    const actual = existente.recordset.length > 0 ? mapRow(existente.recordset[0]) : DEFAULTS;
    const nuevo = {
      burbujaActiva: body.burbujaActiva !== undefined ? Boolean(body.burbujaActiva) : actual.burbujaActiva,
      burbujaAutoocultar: body.burbujaAutoocultar !== undefined ? Boolean(body.burbujaAutoocultar) : actual.burbujaAutoocultar,
      burbujaDuracionSeg: body.burbujaDuracionSeg !== undefined ? Number(body.burbujaDuracionSeg) : actual.burbujaDuracionSeg,
      permitirAdjuntos: body.permitirAdjuntos !== undefined ? Boolean(body.permitirAdjuntos) : actual.permitirAdjuntos,
      tema: body.tema !== undefined ? body.tema : actual.tema,
      colorMensajePropio: body.colorMensajePropio !== undefined ? body.colorMensajePropio : actual.colorMensajePropio,
      colorMensajeAjeno: body.colorMensajeAjeno !== undefined ? body.colorMensajeAjeno : actual.colorMensajeAjeno,
    };

    const request = pool.request()
      .input('userId', sql.Int, userId)
      .input('burbujaActiva', sql.Bit, nuevo.burbujaActiva)
      .input('burbujaAutoocultar', sql.Bit, nuevo.burbujaAutoocultar)
      .input('burbujaDuracionSeg', sql.Int, nuevo.burbujaDuracionSeg)
      .input('permitirAdjuntos', sql.Bit, nuevo.permitirAdjuntos)
      .input('tema', sql.NVarChar, nuevo.tema)
      .input('colorMensajePropio', sql.NVarChar, nuevo.colorMensajePropio)
      .input('colorMensajeAjeno', sql.NVarChar, nuevo.colorMensajeAjeno);

    if (existente.recordset.length > 0) {
      await request.query(`
        UPDATE dbo.MSJ_PREFERENCIAS_USUARIO
        SET MPU_BURBUJA_ACTIVA = @burbujaActiva,
            MPU_BURBUJA_AUTOOCULTAR = @burbujaAutoocultar,
            MPU_BURBUJA_DURACION_SEG = @burbujaDuracionSeg,
            MPU_PERMITIR_ADJUNTOS = @permitirAdjuntos,
            MPU_TEMA = @tema,
            MPU_COLOR_MENSAJE_PROPIO = @colorMensajePropio,
            MPU_COLOR_MENSAJE_AJENO = @colorMensajeAjeno,
            MPU_FECHA_ACTUALIZACION = GETDATE()
        WHERE MPU_USUARIO_ID = @userId
      `);
    } else {
      await request.query(`
        INSERT INTO dbo.MSJ_PREFERENCIAS_USUARIO (
          MPU_USUARIO_ID, MPU_BURBUJA_ACTIVA, MPU_BURBUJA_AUTOOCULTAR, MPU_BURBUJA_DURACION_SEG,
          MPU_PERMITIR_ADJUNTOS, MPU_TEMA, MPU_COLOR_MENSAJE_PROPIO, MPU_COLOR_MENSAJE_AJENO
        )
        VALUES (@userId, @burbujaActiva, @burbujaAutoocultar, @burbujaDuracionSeg, @permitirAdjuntos, @tema, @colorMensajePropio, @colorMensajeAjeno)
      `);
    }

    res.json({ success: true, data: nuevo });
  } catch (error) {
    console.error('Error actualizando config de mensajería:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
