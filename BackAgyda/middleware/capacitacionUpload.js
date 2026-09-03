const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Carpeta base configurable — igual patrón que VACANTE_CV_UPLOAD_DIR / DRIVE_UPLOAD_DIR.
const BASE_DIR = process.env.CAPACITACION_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Capacitacion';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const capacitacionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(BASE_DIR);
      cb(null, BASE_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    try {
      const original = path.basename(file.originalname || 'material');
      const namePart = original.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(namePart) || '';
      const base = path.basename(namePart, ext);
      cb(null, `${base}_${Date.now()}${ext}`);
    } catch (e) {
      cb(e);
    }
  },
});

// Solo materiales "para presentar": documentos, presentaciones, imágenes,
// audio y video — nunca ejecutables ni scripts, aunque el usuario controle
// el nombre del archivo.
const EXTENSIONES_PERMITIDAS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus',
  '.mp4', '.webm', '.mov', '.mpeg', '.mpg',
]);

class TipoArchivoNoPermitidoError extends Error {
  constructor() {
    super('Tipo de archivo no permitido. Solo PDF, Word, PowerPoint, imágenes, audio o video.');
    this.status = 400;
  }
}

const uploadMaterial = multer({
  storage: capacitacionStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.has(ext)) {
      return cb(new TipoArchivoNoPermitidoError());
    }
    cb(null, true);
  },
});

module.exports = { uploadMaterial, BASE_DIR };
