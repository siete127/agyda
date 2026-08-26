const multer = require('multer');

// En memoria: el buffer se cifra antes de guardarse en BD, nunca toca disco.
const maxMb = parseInt(process.env.INCAPACIDAD_MAX_FILE_MB || '20', 10);
const maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? maxMb * 1024 * 1024 : 20 * 1024 * 1024;

const uploadIncapacidad = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes },
});

module.exports = { uploadIncapacidad };
