const multer = require('multer');
const path = require('path');
const fs = require('fs');

const IMAGEN_CORPORATIVA_DIR = process.env.IMAGEN_CORPORATIVA_DIR || 'C:/inetpub/wwwroot/intranet/intranet/ImagenCorporativa';
try {
  if (!fs.existsSync(IMAGEN_CORPORATIVA_DIR)) fs.mkdirSync(IMAGEN_CORPORATIVA_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGEN_CORPORATIVA_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp|svg\+xml)$/.test(file.mimetype) || file.mimetype === 'application/pdf';
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp, svg) o PDF'));
};

const uploadImagenCorporativa = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadImagenCorporativa, IMAGEN_CORPORATIVA_DIR };
