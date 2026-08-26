const multer = require('multer');
const path = require('path');
const fs = require('fs');

const CONTROL_DOCUMENTAL_DIR = process.env.CONTROL_DOCUMENTAL_DIR || 'C:/inetpub/wwwroot/intranet/intranet/ControlDocumentalAdjuntos';
try {
  if (!fs.existsSync(CONTROL_DOCUMENTAL_DIR)) fs.mkdirSync(CONTROL_DOCUMENTAL_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONTROL_DOCUMENTAL_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const MIME_PERMITIDOS = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const fileFilter = (req, file, cb) => {
  if (MIME_PERMITIDOS.has(file.mimetype)) return cb(null, true);
  cb(new Error('Solo se permiten PDF, imágenes (jpg, png, webp), Word (.doc/.docx) o Excel (.xls/.xlsx)'));
};

const uploadControlDocumental = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

module.exports = { uploadControlDocumental, CONTROL_DOCUMENTAL_DIR };
