const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ruta por defecto para imágenes de artículos ArdaWiki (puedes sobrescribir con KB_IMAGEN_UPLOAD_DIR)
const KB_IMAGEN_DIR = process.env.KB_IMAGEN_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/ArdaWiki';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const kbImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(KB_IMAGEN_DIR);
      cb(null, KB_IMAGEN_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    try {
      const original = path.basename(file.originalname || 'imagen');
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

const TIPOS_IMAGEN_VALIDOS = /^image\/(png|jpe?g|gif|webp|svg\+xml)$/;

function soloImagenes(req, file, cb) {
  if (TIPOS_IMAGEN_VALIDOS.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes (PNG, JPG, GIF, WEBP, SVG)'));
}

const uploadKbImage = multer({
  storage: kbImageStorage,
  fileFilter: soloImagenes,
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = {
  uploadKbImage,
  KB_IMAGEN_DIR
};
