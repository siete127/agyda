const multer = require('multer');
const path = require('path');
const fs = require('fs');

const CONTENIDO_ADJUNTOS_DIR = process.env.CONTENIDO_ADJUNTOS_DIR || 'C:/inetpub/wwwroot/intranet/intranet/ContenidoAdjuntos';
try {
  if (!fs.existsSync(CONTENIDO_ADJUNTOS_DIR)) fs.mkdirSync(CONTENIDO_ADJUNTOS_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONTENIDO_ADJUNTOS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf';
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp) o PDF'));
};

const uploadContenidoAdjuntos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadContenidoAdjuntos, CONTENIDO_ADJUNTOS_DIR };
