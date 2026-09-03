const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const { PERSONALIZACION_DIR } = require('../middleware/personalizacionUpload');
const { MEDIA_EMPRESA_DIR } = require('../middleware/mediaEmpresaUpload');

let socketService;
try { socketService = require('../services/socketService'); } catch (_) { socketService = null; }

const TIPOS_ASSET = ['logo-principal', 'logo-compacto', 'favicon', 'login'];
const HEADER_BUTTON_KEYS = ['marcador', 'contingencia'];
// Catálogo de cards del dashboard — el frontend sabe renderizarlas; aquí solo
// validamos que las keys sean conocidas. Debe reflejar CARD_IDS de
// FrontAgyda/src/pages/dashboard/cardCatalog.ts.
const DASHBOARD_CARD_IDS = [
  // Portada
  'bienvenida', 'legales', 'marca', 'lo-importante', 'cita',
  'ultimas-noticias', 'proximos-eventos', 'cumpleanos', 'soporte', 'accesos-rapidos',
  // Resúmenes de módulos
  'r-tickets', 'r-proyectos', 'r-encuestas', 'r-quejas', 'r-legal',
  'r-reglamento', 'r-livechat', 'r-pausas', 'r-vacaciones', 'r-capacitacion',
  'r-incapacidades', 'r-noticias', 'r-vacantes', 'r-ventas',
  'r-tiempos-equipo', 'r-metas-ventas',
];

const SIDEBAR_STYLES = ['degradado-azul', 'solido-oscuro', 'color-marca', 'gradiente-marca'];

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
    sidebarEstilo: 'degradado-azul',
    sidebarBurbujas: true,
    fondoClaro: '#F7F9FC',
    fondoOscuro: '#0F131B',
  },
  headerButtons: [
    // Marcador / contingencia arrancan OCULTOS: son propios del Contact Center y
    // no todas las empresas los usan. Un admin los activa desde
    // Configuración → Apariencia → Botones del encabezado cuando aplique.
    // "Ventas" y "Gestión MIS" se movieron a enlacesTopbar (son propios de
    // Ardaby Tec, no botones genéricos para cualquier empresa).
    { key: 'contingencia', label: 'Marcador contingencia', url: '', visible: false },
    { key: 'marcador', label: 'Marcador', url: '', visible: false },
  ],
  dashboard: { cards: [] },
  // Identidad institucional — misión, visión y valores por empresa. Los textos
  // por defecto reflejan lo que hoy está hardcodeado en el frontend (ArdaByTec).
  institucional: {
    mision: 'Soporte TI, marcación y software que hacen crecer tu negocio.',
    vision: 'Liderar la automatización con IA en soluciones empresariales.',
    valores: ['Innovación', 'Enfoque al cliente', 'Aprendizaje', 'Calidad', 'Integridad', 'Trabajo en equipo', 'Confianza'],
  },
  // Enlaces personalizados del encabezado — botones que un admin agrega junto a
  // Marcador/Contingencia. Cada uno abre su URL en pestaña nueva o en un panel
  // flotante tipo Spotify que sigue visible al navegar.
  enlacesTopbar: [],
  // Mascota del tablero — imagen o video por empresa. mediaId apunta a la
  // tabla MEDIA_EMPRESA (multimedia propia de cada empresa).
  mascota: {
    mediaId: null,          // id en MEDIA_EMPRESA, o null = usa la del sistema
    tipo: null,             // 'imagen' | 'video' (derivado del archivo)
    movimiento: 'flotar',   // ninguno | flotar | saludar | latir | balanceo
    velocidad: 'normal',    // lenta | normal | rapida
  },
};

const MASCOTA_MOVIMIENTOS = ['ninguno', 'flotar', 'saludar', 'latir', 'balanceo'];
const MASCOTA_VELOCIDADES = ['lenta', 'normal', 'rapida'];

const ENLACE_ICONOS = ['link', 'phone', 'headset', 'monitor', 'chart', 'ticket', 'mail', 'globe', 'rocket', 'grid', 'bell', 'calendar', 'folder', 'shield', 'zap'];
const ENLACE_MODOS = ['pestana', 'flotante'];

function limpiarEnlace(raw, i) {
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const url = s(raw?.url, 500);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    id: s(raw?.id, 40) || `enlace-${Date.now()}-${i}`,
    label: s(raw?.label, 40) || 'Enlace',
    url,
    icono: ENLACE_ICONOS.includes(raw?.icono) ? raw.icono : 'link',
    color: /^#[0-9a-fA-F]{6}$/.test(raw?.color) ? raw.color : '#2F6FED',
    modo: ENLACE_MODOS.includes(raw?.modo) ? raw.modo : 'pestana',
    visible: raw?.visible !== false,
  };
}

function mergeConfig(stored) {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!stored || typeof stored !== 'object') return base;
  const inst = stored.institucional && typeof stored.institucional === 'object' ? stored.institucional : {};
  return {
    branding: { ...base.branding, ...(stored.branding || {}) },
    headerButtons: Array.isArray(stored.headerButtons)
      ? stored.headerButtons.filter((b) => HEADER_BUTTON_KEYS.includes(b?.key))
      : base.headerButtons,
    dashboard: { ...base.dashboard, ...(stored.dashboard || {}) },
    institucional: {
      mision: typeof inst.mision === 'string' ? inst.mision : base.institucional.mision,
      vision: typeof inst.vision === 'string' ? inst.vision : base.institucional.vision,
      valores: Array.isArray(inst.valores) ? inst.valores : base.institucional.valores,
    },
    enlacesTopbar: Array.isArray(stored.enlacesTopbar)
      ? stored.enlacesTopbar.map(limpiarEnlace).filter(Boolean)
      : base.enlacesTopbar,
    mascota: (() => {
      const m = stored.mascota && typeof stored.mascota === 'object' ? stored.mascota : {};
      return {
        mediaId: m.mediaId != null && Number(m.mediaId) ? Number(m.mediaId) : null,
        tipo: m.tipo === 'imagen' || m.tipo === 'video' ? m.tipo : null,
        movimiento: MASCOTA_MOVIMIENTOS.includes(m.movimiento) ? m.movimiento : base.mascota.movimiento,
        velocidad: MASCOTA_VELOCIDADES.includes(m.velocidad) ? m.velocidad : base.mascota.velocidad,
      };
    })(),
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
    const hex = (v, def) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
    const D = DEFAULT_CONFIG.branding;

    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    config.branding = {
      nombreCorto: s(b.nombreCorto, 40) || D.nombreCorto,
      nombreLargo: s(b.nombreLargo, 80) || D.nombreLargo,
      eslogan: s(b.eslogan, 120),
      logoPrincipalId: numOrNull(b.logoPrincipalId),
      logoCompactoId: numOrNull(b.logoCompactoId),
      faviconId: numOrNull(b.faviconId),
      loginImagenId: numOrNull(b.loginImagenId),
      colorBrand: hex(b.colorBrand, D.colorBrand),
      sidebarEstilo: SIDEBAR_STYLES.includes(b.sidebarEstilo) ? b.sidebarEstilo : D.sidebarEstilo,
      // (fin extras sidebar/fondo)
      sidebarBurbujas: b.sidebarBurbujas !== false,
      fondoClaro: hex(b.fondoClaro, D.fondoClaro),
      fondoOscuro: hex(b.fondoOscuro, D.fondoOscuro),
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

// PUT /api/personalizacion/header-buttons
// Body: array de { key, label, url, visible }. Solo se aceptan las keys conocidas;
// url vacía = conserva la acción interna del botón.
exports.updateHeaderButtons = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : req.body?.headerButtons;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, message: 'Se espera un array de botones' });
    }

    const byKey = new Map();
    for (const raw of incoming) {
      const key = String(raw?.key || '').trim();
      if (!HEADER_BUTTON_KEYS.includes(key)) continue;
      const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
      if (url && !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ success: false, message: `URL inválida para "${key}" (debe empezar con http:// o https://)` });
      }
      byKey.set(key, {
        key,
        label: (typeof raw?.label === 'string' ? raw.label.trim() : '').slice(0, 40),
        url,
        visible: raw?.visible !== false,
      });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    // Mantener el orden de DEFAULT_CONFIG.headerButtons; usar lo entrante o el default.
    config.headerButtons = DEFAULT_CONFIG.headerButtons.map((def) => {
      const got = byKey.get(def.key);
      if (!got) return { ...def };
      return { ...def, ...got, label: got.label || def.label };
    });

    await writeConfig(pool, config, req.user?.id);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
      accion: 'personalizacion-header-buttons', detalle: JSON.stringify(config.headerButtons),
      ip: req.ip,
    }).catch(() => {});
    notify(req, 'headerButtons');
    return res.json({ success: true, data: config.headerButtons });
  } catch (e) {
    logger.error('personalizacionController.updateHeaderButtons', e);
    return res.status(500).json({ success: false, message: 'Error al guardar los botones del encabezado' });
  }
};

// PUT /api/personalizacion/institucional
// Body: { mision, vision, valores: [] }
exports.updateInstitucional = async (req, res) => {
  try {
    const b = req.body || {};
    const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const D = DEFAULT_CONFIG.institucional;

    const valores = Array.isArray(b.valores)
      ? b.valores.map((v) => s(v, 60)).filter(Boolean).slice(0, 20)
      : D.valores;

    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    config.institucional = {
      mision: s(b.mision, 600),
      vision: s(b.vision, 600),
      valores,
    };
    await writeConfig(pool, config, req.user?.id);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
      accion: 'personalizacion-institucional', detalle: JSON.stringify(config.institucional),
      ip: req.ip,
    }).catch(() => {});
    notify(req, 'institucional');
    return res.json({ success: true, data: config.institucional });
  } catch (e) {
    logger.error('personalizacionController.updateInstitucional', e);
    return res.status(500).json({ success: false, message: 'Error al guardar la identidad institucional' });
  }
};

// PUT /api/personalizacion/enlaces-topbar
// Body: array de { id?, label, url, icono, color, modo, visible }
exports.updateEnlacesTopbar = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : req.body?.enlacesTopbar;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, message: 'Se espera un array de enlaces' });
    }
    const enlaces = incoming.map(limpiarEnlace).filter(Boolean).slice(0, 12);

    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    config.enlacesTopbar = enlaces;
    await writeConfig(pool, config, req.user?.id);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
      accion: 'personalizacion-enlaces-topbar', detalle: `${enlaces.length} enlaces`, ip: req.ip,
    }).catch(() => {});
    notify(req, 'enlacesTopbar');
    return res.json({ success: true, data: config.enlacesTopbar });
  } catch (e) {
    logger.error('personalizacionController.updateEnlacesTopbar', e);
    return res.status(500).json({ success: false, message: 'Error al guardar los enlaces del encabezado' });
  }
};

// ── Mascota del tablero ──────────────────────────────────────────────────────

// Asegura la tabla MEDIA_EMPRESA (multimedia propia de cada empresa) — se crea
// on-demand en la BD del tenant, como el resto de esquemas de personalización.
async function ensureMediaEmpresa(pool) {
  await pool.request().batch(`
    IF OBJECT_ID('dbo.MEDIA_EMPRESA', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MEDIA_EMPRESA (
        ME_ID            INT IDENTITY(1,1) PRIMARY KEY,
        ME_USO           NVARCHAR(30)   NOT NULL,       -- 'mascota', y lo que venga
        ME_NOMBRE_ARCHIVO NVARCHAR(260) NOT NULL,
        ME_NOMBRE_ORIGINAL NVARCHAR(260) NULL,
        ME_MIME          NVARCHAR(100)  NULL,
        ME_TAMANIO       INT            NULL,
        ME_SUBIDO_POR    INT            NULL,
        ME_FECHA         DATETIME       NOT NULL DEFAULT GETDATE()
      );
      CREATE INDEX IX_MEDIA_EMPRESA_USO ON dbo.MEDIA_EMPRESA(ME_USO, ME_FECHA DESC);
    END
  `);
}

// POST /api/personalizacion/mascota/media  (multipart: archivo)
exports.subirMascotaMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureMediaEmpresa(pool);
    const esVideo = /^video\//.test(req.file.mimetype);
    const rs = await pool.request()
      .input('uso', sql.NVarChar, 'mascota')
      .input('archivo', sql.NVarChar, req.file.filename)
      .input('original', sql.NVarChar, req.file.originalname)
      .input('mime', sql.NVarChar, req.file.mimetype)
      .input('tam', sql.Int, req.file.size)
      .input('por', sql.Int, req.user?.id || null)
      .query(`INSERT INTO dbo.MEDIA_EMPRESA (ME_USO, ME_NOMBRE_ARCHIVO, ME_NOMBRE_ORIGINAL, ME_MIME, ME_TAMANIO, ME_SUBIDO_POR)
              OUTPUT INSERTED.ME_ID as id
              VALUES (@uso, @archivo, @original, @mime, @tam, @por)`);
    return res.json({ success: true, data: { id: rs.recordset[0].id, tipo: esVideo ? 'video' : 'imagen' } });
  } catch (e) {
    logger.error('personalizacionController.subirMascotaMedia', e);
    return res.status(500).json({ success: false, message: 'Error al subir la mascota' });
  }
};

// GET /api/personalizacion/media/:id — sirve un archivo de MEDIA_EMPRESA.
const MEDIA_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
exports.verMediaEmpresa = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureMediaEmpresa(pool).catch(() => {});
    const rs = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT ME_NOMBRE_ARCHIVO as archivo, ME_NOMBRE_ORIGINAL as original FROM dbo.MEDIA_EMPRESA WHERE ME_ID=@id');
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const filename = path.basename(row.archivo);
    const filePath = path.join(MEDIA_EMPRESA_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    const ext = path.extname(filename).toLowerCase();
    const mime = MEDIA_MIME[ext];
    if (!mime) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    // Soporte de Range para video (seek en el <video>).
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Accept-Ranges', 'bytes');
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s, 10) || 0;
      const end = e ? parseInt(e, 10) : stat.size - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e) {
    logger.error('personalizacionController.verMediaEmpresa', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al servir el archivo' });
  }
};

// PUT /api/personalizacion/mascota  Body: { mediaId, tipo, movimiento, velocidad }
exports.updateMascota = async (req, res) => {
  try {
    const b = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    config.mascota = {
      mediaId: b.mediaId != null && Number(b.mediaId) ? Number(b.mediaId) : null,
      tipo: b.tipo === 'imagen' || b.tipo === 'video' ? b.tipo : null,
      movimiento: MASCOTA_MOVIMIENTOS.includes(b.movimiento) ? b.movimiento : 'flotar',
      velocidad: MASCOTA_VELOCIDADES.includes(b.velocidad) ? b.velocidad : 'normal',
    };
    await writeConfig(pool, config, req.user?.id);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
      accion: 'personalizacion-mascota', detalle: JSON.stringify(config.mascota), ip: req.ip,
    }).catch(() => {});
    notify(req, 'mascota');
    return res.json({ success: true, data: config.mascota });
  } catch (e) {
    logger.error('personalizacionController.updateMascota', e);
    return res.status(500).json({ success: false, message: 'Error al guardar la mascota' });
  }
};

// PUT /api/personalizacion/dashboard
// Body: { cards: [{ id, x, y, w, h, visible }] }
exports.updateDashboard = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.cards) ? req.body.cards : null;
    if (!incoming) return res.status(400).json({ success: false, message: 'Se espera { cards: [...] }' });

    const n = (v, def) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : def;
    };
    const cards = [];
    const vistas = new Set();
    for (const raw of incoming) {
      const id = String(raw?.id || '').trim();
      if (!DASHBOARD_CARD_IDS.includes(id) || vistas.has(id)) continue;
      vistas.add(id);
      cards.push({
        id,
        x: Math.max(0, n(raw.x, 0)),
        y: Math.max(0, n(raw.y, 0)),
        w: Math.min(12, Math.max(1, n(raw.w, 4))),
        h: Math.max(1, n(raw.h, 2)),
        visible: raw?.visible !== false,
      });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await readConfig(pool);
    config.dashboard = { cards };
    await writeConfig(pool, config, req.user?.id);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
      accion: 'personalizacion-dashboard', detalle: `${cards.length} cards`, ip: req.ip,
    }).catch(() => {});
    notify(req, 'dashboard');
    return res.json({ success: true, data: config.dashboard });
  } catch (e) {
    logger.error('personalizacionController.updateDashboard', e);
    return res.status(500).json({ success: false, message: 'Error al guardar el diseño del inicio' });
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
