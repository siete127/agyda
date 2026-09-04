const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Carpeta propia para TODA la multimedia por empresa (mascota, y cualquier otro
// asset que se agregue después). Cada archivo va prefijado por la clave de
// empresa, así un tenant nunca puede tocar los archivos de otro.
const MEDIA_EMPRESA_DIR = process.env.MEDIA_EMPRESA_DIR
  || (process.env.IMAGEN_CORPORATIVA_DIR
      ? process.env.IMAGEN_CORPORATIVA_DIR.replace(/ImagenCorporativa\/?$/, 'MediaEmpresa')
      : path.join(__dirname, '..', 'public', 'uploads', 'media-empresa'));

try {
  if (!fs.existsSync(MEDIA_EMPRESA_DIR)) fs.mkdirSync(MEDIA_EMPRESA_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const empresaKey = (req) => String(req.user?.empresa || 'agyda').toLowerCase().replace(/[^a-z0-9]/g, '');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_EMPRESA_DIR),
  filename: (req, file, cb) => {
    const safe = String(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    cb(null, `${empresaKey(req)}-${Date.now()}-${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ok = /^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)
    || /^video\/(mp4|webm|quicktime)$/.test(file.mimetype);
  if (ok) return cb(null, true);
  cb(new Error('Formato no permitido. Usa PNG, JPG, WEBP, GIF, MP4 o WEBM.'));
};

const uploadMediaEmpresa = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter,
});

module.exports = { uploadMediaEmpresa, MEDIA_EMPRESA_DIR, empresaKey };
