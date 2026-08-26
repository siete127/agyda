const multer = require('multer');

const maxMb = parseInt(process.env.EXPEDIENTE_MAX_FILE_MB || '50', 10);
const maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? maxMb * 1024 * 1024 : 50 * 1024 * 1024;

const uploadExpediente = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxBytes }
});

module.exports = {
	uploadExpediente
};
