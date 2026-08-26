const multer = require('multer');

const maxMb = parseInt(process.env.CRM_DOC_MAX_FILE_MB || '20', 10);
const maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? maxMb * 1024 * 1024 : 20 * 1024 * 1024;

const uploadCrmDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes }
});

module.exports = {
  uploadCrmDocumento
};
