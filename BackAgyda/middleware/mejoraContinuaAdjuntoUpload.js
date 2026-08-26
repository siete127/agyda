const multer = require('multer');
const path = require('path');
const fs = require('fs');

const MC_ADJUNTOS_DIR = process.env.MC_ADJUNTOS_DIR || 'C:/inetpub/wwwroot/intranet/intranet/MejoraContinuaAdjuntos';
try {
  if (!fs.existsSync(MC_ADJUNTOS_DIR)) fs.mkdirSync(MC_ADJUNTOS_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MC_ADJUNTOS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf';
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp) o PDF'));
};

const uploadMejoraContinuaAdjuntos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadMejoraContinuaAdjuntos, MC_ADJUNTOS_DIR };
