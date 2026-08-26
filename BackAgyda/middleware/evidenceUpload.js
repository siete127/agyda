const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ruta por defecto para evidencias (puedes sobrescribir con EVIDENCIA_UPLOAD_DIR)
const EVIDENCIA_DIR = process.env.EVIDENCIA_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Evidencia';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const evidenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(EVIDENCIA_DIR);
      cb(null, EVIDENCIA_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    try {
      const original = path.basename(file.originalname || 'evidencia');
      const safe = original.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(safe) || '';
      const base = path.basename(safe, ext);
      const finalName = `${base}_${Date.now()}${ext}`;
      cb(null, finalName);
    } catch (e) {
      cb(e);
    }
  }
});

function acceptAll(req, file, cb) {
  cb(null, true);
}

const uploadEvidence = multer({
  storage: evidenceStorage,
  fileFilter: acceptAll,
  limits: { fileSize: 200 * 1024 * 1024 }
});

module.exports = {
  uploadEvidence,
  EVIDENCIA_DIR
};
