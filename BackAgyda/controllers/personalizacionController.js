const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const { PERSONALIZACION_DIR } = require('../middleware/personalizacionUpload');

let socketService;
try { socketService = require('../services/socketService'); } catch (_) { socketService = null; }

const TIPOS_ASSET = ['logo-principal', 'logo-compacto', 'favicon', 'login'];

// Config por defecto — refleja lo que hoy está hardcodeado en el frontend.
const DEFAULT_CONFIG = {
  branding: {
    nombreCorto: 'AGYDA',
    nombreLargo: 'Ardaby Tec',
    eslogan: 'Soluciones en tecnología',
    logoPrincipalId: null,
    logoCompactoId: null,
    faviconId: null,
    loginImagenId: null,
    colorBrand: '#2F6FED',
  },
  headerButtons: [
    { key: 'contingencia', label: 'Marcador contingencia', url: '', visible: true },
    { key: 'marcador', label: 'Marcador', url: '', visible: true },
    { key: 'sistemas', label: 'Sistemas', url: '', visible: true },
    { key: 'gestion-mis', label: 'Gestión MIS', url: '', visible: true },
  ],
  dashboard: { cards: [] },
};

function mergeConfig(stored) {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!stored || typeof stored !== 'object') return base;
  return {
    branding: { ...base.branding, ...(stored.branding || {}) },
    headerButtons: Array.isArray(stored.headerButtons) ? stored.headerButtons : base.headerButtons,
    dashboard: { ...base.dashboard, ...(stored.dashboard || {}) },
  };
}

async function readConfig(pool) {
  const rs = await pool.request().query(
    'SELECT TOP 1 CONFIG_DATA FROM dbo.INTRANET_PERSONALIZACION ORDER BY ID DESC',
  );
  if (!rs.recordset.length) return mergeConfig(null);
  try {
    return mergeConfig(JSON.parse(rs.recordset[0].CONFIG_DATA));
  } catch (_) {
    return mergeConfig(null);
  }
}

async function writeConfig(pool, config, userId) {
  await pool.request()
    .input('data', sql.NVarChar, JSON.stringify(config))
    .input('by', sql.Int, userId || null)
    .query(`INSERT INTO dbo.INTRANET_PERSONALIZACION (CONFIG_DATA, UPDATED_BY)
            VALUES (@data, @by)`);
}

function notify(req, rama) {
  try {
    socketService?.getIO(req.user?.empresa)?.emit('personalizacion:updated', { rama });
  } catch (_) { /* sin sockets, no bloquea */ }
}

// GET /api/personalizacion — cualquier usuario autenticado (la UI la necesita).
exports.getPersonalizacion = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const pool = await databaseService.getPool(req.user?.empresa);
    let config;
    try {
      config = await readConfig(pool);
    } catch (e) {
      try {
        await require('../services/schemaService').ensurePersonalizacionSchema(pool);
        config = await readConfig(pool);
      } catch (_) {
        return res.json({ success: true, data: mergeConfig(null) });
      }
    }
    return res.json({ success: true, data: config });
  } catch (e) {
    logger.error('personalizacionController.getPersonalizacion', e);
    return res.json({ success: true, data: mergeConfig(null) });
  }
};

// PUT /api/personalizacion/branding
exports.updateBranding = async (req, res) => {
  try {
    const b = req.body || {};
    const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v) || null);
    const color = /^#[0-9a-fA-F]{6}$/.test(b.colorBrand) ? b.colorBrand : DEFAULT_CONFIG.branding.colorBrand;

    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    config.branding = {
      nombreCorto: s(b.nombreCorto, 40) || DEFAULT_CONFIG.branding.nombreCorto,
      nombreLargo: s(b.nombreLargo, 80) || DEFAULT_CONFIG.branding.nombreLargo,
      eslogan: s(b.eslogan, 120),
      logoPrincipalId: numOrNull(b.logoPrincipalId),
      logoCompactoId: numOrNull(b.logoCompactoId),
      faviconId: numOrNull(b.faviconId),
      loginImagenId: numOrNull(b.loginImagenId),
      colorBrand: color,
    };
    await writeConfig(pool, config, req.user?.id);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
      accion: 'personalizacion-branding', detalle: JSON.stringify(config.branding),
      ip: req.ip,
    }).catch(() => {});
    notify(req, 'branding');
    return res.json({ success: true, data: config.branding });
  } catch (e) {
    logger.error('personalizacionController.updateBranding', e);
    return res.status(500).json({ success: false, message: 'Error al guardar el branding' });
  }
};

// POST /api/personalizacion/assets  (multipart: archivo + tipo)
exports.subirAsset = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const tipo = String(req.body?.tipo || '').trim();
    if (!TIPOS_ASSET.includes(tipo)) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* noop */ }
      return res.status(400).json({ success: false, message: 'Tipo de asset inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('tipo', sql.NVarChar, tipo)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .input('mime', sql.NVarChar, req.file.mimetype)
      .input('tamanio', sql.Int, req.file.size)
      .input('subidoPor', sql.Int, req.user?.id || null)
      .query(`INSERT INTO dbo.INTRANET_PERSONALIZACION_ASSETS
                (ASSET_TIPO, NOMBRE_ARCHIVO, NOMBRE_ORIGINAL, MIME, TAMANIO, SUBIDO_POR)
              OUTPUT INSERTED.ASSET_ID as id
              VALUES (@tipo, @nombreArchivo, @nombreOriginal, @mime, @tamanio, @subidoPor)`);
    return res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (e) {
    logger.error('personalizacionController.subirAsset', e);
    return res.status(500).json({ success: false, message: 'Error al subir el asset' });
  }
};

// GET /api/personalizacion/assets/:id/ver
exports.verAsset = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT NOMBRE_ARCHIVO as nombreArchivo, NOMBRE_ORIGINAL as nombreOriginal FROM dbo.INTRANET_PERSONALIZACION_ASSETS WHERE ASSET_ID=@id');
    const asset = rs.recordset[0];
    if (!asset) return res.status(404).json({ success: false, message: 'Asset no encontrado' });

    const filename = path.basename(asset.nombreArchivo);
    const filePath = path.join(PERSONALIZACION_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const mimeByExt = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    };
    if (!mimeByExt[ext]) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', mimeByExt[ext]);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.nombreOriginal || filename)}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      logger.error('personalizacionController.verAsset stream', err);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (e) {
    logger.error('personalizacionController.verAsset', e);
    res.status(500).json({ success: false, message: 'Error al servir el asset' });
  }
};

exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
