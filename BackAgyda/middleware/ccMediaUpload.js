const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Media del Contact Center (imágenes/audio/docs de/para clientes). En producción
// conviene un volumen persistente vía CC_MEDIA_DIR; si no, cae a public/uploads.
const CC_MEDIA_DIR = process.env.CC_MEDIA_DIR
  || path.join(__dirname, '../public/uploads/cc-media');
if (!fs.existsSync(CC_MEDIA_DIR)) fs.mkdirSync(CC_MEDIA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CC_MEDIA_DIR),
  filename: (_req, file, cb) => {
    const original = path.basename(file.originalname || 'archivo');
    const namePart = original.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(namePart) || '';
    const base = path.basename(namePart, ext);
    cb(null, `cc_${Date.now()}_${base}${ext}`);
  },
});

const uploadCcMedia = multer({
  storage,
  fileFilter: (_req, _file, cb) => cb(null, true),
  limits: { fileSize: 25 * 1024 * 1024 },
});

module.exports = { uploadCcMedia, CC_MEDIA_DIR };
