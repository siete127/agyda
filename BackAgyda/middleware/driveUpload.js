const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Base directory for Drive storage (default to IIS web root under /Drive)
const BASE_DIR = process.env.DRIVE_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Drive';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const driveStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const carpetaId = req.body.carpetaId || req.body.carpeta_id || 'root';
      const safeFolder = String(carpetaId).match(/^\d+$/) ? String(carpetaId) : 'root';
      const dest = path.join(BASE_DIR, safeFolder);
      ensureDir(dest);
      cb(null, dest);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    try {
      const original = path.basename(file.originalname || 'archivo');
      const namePart = original.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(namePart) || '';
      const base = path.basename(namePart, ext);
      const finalName = `${base}_${Date.now()}${ext}`;
      cb(null, finalName);
    } catch (e) {
      cb(e);
    }
  }
});

// fileFilter que acepta cualquier tipo de archivo (toda extensión / MIME)
function acceptAllFileFilter(req, file, cb) {
  // Si se quisiera bloquear algo específico, aquí se haría.
  cb(null, true);
}

const uploadDriveFile = multer({
  storage: driveStorage,
  fileFilter: acceptAllFileFilter,
  // Límite de tamaño (200MB). Ajustar si necesitas más.
  limits: { fileSize: 200 * 1024 * 1024 }
});

module.exports = {
  uploadDriveFile,
  BASE_DIR
};

// Middleware: si no viene carpetaId, crear/obtener una carpeta privada del usuario y setearla en req.body
async function ensureUserDefaultFolder(req, res, next) {
  try {
    const raw = req.body.carpetaId || req.body.carpeta_id;
    if (raw && String(raw).match(/^\d+$/)) return next();
    let uidRaw = req.user && (req.user.id || req.user.userId || req.user.sub);
    let uid = uidRaw != null ? parseInt(uidRaw) : NaN;
    if (!uidRaw || isNaN(uid)) {
      // Intentar resolver por username si el token no trae ID numérico
      const username = req.user && (req.user.username || req.user.user || req.user.NEUS_USUARIO || req.user.usuario);
      if (!username) {
        return res.status(400).json({ success: false, message: 'Usuario no identificado para crear carpeta' });
      }
      const pool0 = await databaseService.getPool();
      const rsUser = await pool0.request()
        .input('uname', sql.NVarChar, String(username))
        .query("SELECT TOP 1 NEUS_ID AS id FROM dbo.NEUS_USUARIOS WHERE NEUS_USUARIO=@uname");
      if (rsUser.recordset.length === 0) {
        return res.status(400).json({ success: false, message: 'Usuario no encontrado para crear carpeta' });
      }
      uid = parseInt(rsUser.recordset[0].id);
    }
    const pool = await databaseService.getPool();
    // Buscar carpeta privada raíz del usuario
    const found = await pool.request()
      .input('uid', sql.Int, uid)
      .query("SELECT TOP 1 id FROM carpeta WHERE creado_por=@uid AND padre_id IS NULL ORDER BY id ASC");
    let carpetaId;
    if (found.recordset.length > 0) {
      carpetaId = found.recordset[0].id;
    } else {
      const created = await pool.request()
        .input('nombre', sql.NVarChar, 'Privado')
        .input('uid', sql.Int, uid)
        .query("INSERT INTO carpeta (nombre, padre_id, fecha_creacion, creado_por) VALUES (@nombre, NULL, GETDATE(), @uid); SELECT SCOPE_IDENTITY() AS id;");
      carpetaId = created.recordset[0].id;
    }
    // asegurar carpeta física
    try {
      const dir = path.join(BASE_DIR, String(carpetaId));
      ensureDir(dir);
    } catch (_) {}
    req.body.carpetaId = String(carpetaId);
    return next();
  } catch (e) {
    console.error('ensureUserDefaultFolder error:', e);
    return res.status(500).json({ success: false, message: 'Error preparando carpeta por defecto' });
  }
}

module.exports.ensureUserDefaultFolder = ensureUserDefaultFolder;
