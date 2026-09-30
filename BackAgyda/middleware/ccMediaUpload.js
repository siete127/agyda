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

// Evidencia adjunta a un campo tipo 'imagen'/'archivo' de un formulario de
// Atención (CCF_FORM_CAMPOS) — mismo disco que la media de chat, carpeta
// aparte para no mezclar ambos orígenes. .any() porque los campos de
// evidencia son dinámicos por formulario (uno por FC_ID, nombrados
// campo_<id> en el FormData), no un único campo fijo.
const CC_EVIDENCIA_DIR = process.env.CC_MEDIA_DIR
  ? path.join(process.env.CC_MEDIA_DIR, '../cc-evidencia')
  : path.join(__dirname, '../public/uploads/cc-evidencia');
if (!fs.existsSync(CC_EVIDENCIA_DIR)) fs.mkdirSync(CC_EVIDENCIA_DIR, { recursive: true });

const storageEvidencia = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CC_EVIDENCIA_DIR),
  filename: (_req, file, cb) => {
    const original = path.basename(file.originalname || 'archivo');
    const namePart = original.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(namePart) || '';
    const base = path.basename(namePart, ext);
    cb(null, `fir_${Date.now()}_${base}${ext}`);
  },
});

const uploadCcEvidencia = multer({
  storage: storageEvidencia,
  fileFilter: (_req, _file, cb) => cb(null, true),
  limits: { fileSize: 15 * 1024 * 1024 },
}).any();

module.exports = { uploadCcMedia, CC_MEDIA_DIR, uploadCcEvidencia, CC_EVIDENCIA_DIR };
