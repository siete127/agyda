const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Carpeta física donde viven los .rdl / .rdlc subidos a la Suite de Reportes.
// Mismo patrón que controlDocumentalUpload: disco local + servido como estático.
const RDL_DIR = process.env.RDL_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/SuiteReportes';
try {
  if (!fs.existsSync(RDL_DIR)) fs.mkdirSync(RDL_DIR, { recursive: true });
} catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RDL_DIR),
  filename: (req, file, cb) => {
    const base = path.basename(file.originalname).replace(/[^\w.\- ]+/g, '_');
    cb(null, Date.now() + '-' + base);
  },
});

// SSRS entrega los .rdl como application/octet-stream o text/xml según el navegador.
// Validamos por extensión, no solo por mimetype.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.rdl' || ext === '.rdlc') return cb(null, true);
  cb(new Error('Solo se permiten archivos .rdl o .rdlc (SQL Server Reporting Services)'));
};

const uploadRdl = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — un RDL grande con muchos datasets embebidos
  fileFilter,
});

module.exports = { uploadRdl, RDL_DIR };
