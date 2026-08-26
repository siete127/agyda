const multer = require('multer');
const path = require('path');
const fs = require('fs');

const mensajeriaDir = path.join(__dirname, '../public/uploads/mensajeria');
if (!fs.existsSync(mensajeriaDir)) fs.mkdirSync(mensajeriaDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, mensajeriaDir),
  filename: (_req, file, cb) => {
    const original = path.basename(file.originalname || 'archivo');
    const namePart = original.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(namePart) || '';
    const base = path.basename(namePart, ext);
    cb(null, `msj_${Date.now()}_${base}${ext}`);
  },
});

// Cualquier tipo de archivo permitido (decisión del producto), límite 15MB.
const uploadMensajeriaArchivo = multer({
  storage,
  fileFilter: (_req, _file, cb) => cb(null, true),
  limits: { fileSize: 15 * 1024 * 1024 },
});

module.exports = { uploadMensajeriaArchivo };
