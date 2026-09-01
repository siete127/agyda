const multer = require('multer');
const fs = require('fs');

// Assets de personalización de marca por empresa (logos, favicon, imagen de login).
// Mismo patrón que middleware/imagenCorporativaUpload.js.
const PERSONALIZACION_DIR = process.env.PERSONALIZACION_DIR
  || (process.env.IMAGEN_CORPORATIVA_DIR
      ? process.env.IMAGEN_CORPORATIVA_DIR.replace(/ImagenCorporativa\/?$/, 'Personalizacion')
      : 'C:/inetpub/wwwroot/intranet/intranet/Personalizacion');

try {
  if (!fs.existsSync(PERSONALIZACION_DIR)) fs.mkdirSync(PERSONALIZACION_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PERSONALIZACION_DIR),
  filename: (req, file, cb) => {
    const emp = String(req.user?.empresa || 'agyda').toLowerCase().replace(/[^a-z0-9]/g, '');
    cb(null, `${emp}-${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const permitido = /^image\/(jpeg|jpg|png|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(file.mimetype);
  if (permitido) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, webp, svg, ico)'));
};

const uploadPersonalizacion = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
  fileFilter,
});

module.exports = { uploadPersonalizacion, PERSONALIZACION_DIR };
