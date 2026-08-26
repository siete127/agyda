const multer = require('multer');
const path = require('path');
const fs = require('fs');

const RAT_ADJUNTOS_DIR = process.env.RAT_ADJUNTOS_DIR || 'C:/inetpub/wwwroot/intranet/intranet/RatAdjuntos';
try {
  if (!fs.existsSync(RAT_ADJUNTOS_DIR)) fs.mkdirSync(RAT_ADJUNTOS_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RAT_ADJUNTOS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf';
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp) o PDF'));
};

const uploadRatAdjuntos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadRatAdjuntos, RAT_ADJUNTOS_DIR };
