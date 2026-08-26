const multer = require('multer');

// El PDF se recibe en memoria y el controller lo escribe a la ruta fija que
// sirve getPdf (REGLAMENTO_DIR/REGLAMENTO INTERNO.pdf) — no necesita nombre generado.
const uploadReglamento = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
	fileFilter: (req, file, cb) => {
		if (file.mimetype !== 'application/pdf') {
			return cb(new Error('Solo se permiten archivos PDF'));
		}
		cb(null, true);
	}
});

module.exports = { uploadReglamento };
