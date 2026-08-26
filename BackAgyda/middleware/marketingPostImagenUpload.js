const multer = require('multer');
const path = require('path');
const fs = require('fs');

const MARKETING_POSTS_DIR = process.env.MARKETING_POSTS_DIR || 'C:/inetpub/wwwroot/intranet/intranet/MarketingPosts';
try {
  if (!fs.existsSync(MARKETING_POSTS_DIR)) fs.mkdirSync(MARKETING_POSTS_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MARKETING_POSTS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype);
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
};

const uploadMarketingPostImagen = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadMarketingPostImagen, MARKETING_POSTS_DIR };
