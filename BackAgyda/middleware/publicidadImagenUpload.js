const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PUBLICIDAD_IMAGENES_DIR = process.env.PUBLICIDAD_IMAGENES_DIR || 'C:/inetpub/wwwroot/intranet/intranet/PublicidadImagenes';
try {
  if (!fs.existsSync(PUBLICIDAD_IMAGENES_DIR)) fs.mkdirSync(PUBLICIDAD_IMAGENES_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PUBLICIDAD_IMAGENES_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype);
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
};

const uploadPublicidadImagen = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadPublicidadImagen, PUBLICIDAD_IMAGENES_DIR };
