const express = require('express');
const router = express.Router();

const multer = require('multer');

const expedienteController = require('../controllers/expedienteController');
const expedienteCompletoController = require('../controllers/expedienteCompletoController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { uploadExpediente } = require('../middleware/expedienteUpload');

// Rutas "Mi expediente" — cualquier usuario autenticado accede a su propio expediente
router.post(
	'/mi/documentos',
	authenticateToken,
	uploadExpediente.single('file'),
	expedienteController.uploadMiDocumento
);

router.get(
	'/mi/documentos',
	authenticateToken,
	expedienteController.listMisDocumentos
);

router.get(
	'/mi/documentos/:docId/download',
	authenticateToken,
	expedienteController.downloadMiDocumento
);

router.delete(
	'/mi/documentos/:docId',
	authenticateToken,
	expedienteController.deleteMiDocumento
);

// ── Contacto ──
router.get('/mi/contacto', authenticateToken, expedienteController.getMiContacto);
router.put('/mi/contacto', authenticateToken, expedienteController.updateMiContacto);

// ── Persona ──
router.get('/mi/persona', authenticateToken, expedienteCompletoController.getPersona);
router.put('/mi/persona', authenticateToken, expedienteCompletoController.updatePersona);
router.get('/:usuarioId/persona', authenticateToken, verificarRol(['AD']), expedienteCompletoController.getPersona);
router.put('/:usuarioId/persona', authenticateToken, verificarRol(['AD']), expedienteCompletoController.updatePersona);

// ── Familiares ──
router.get('/mi/familiares', authenticateToken, expedienteCompletoController.listFamiliares);
router.put('/mi/familiares', authenticateToken, expedienteCompletoController.saveFamiliares);
router.get('/:usuarioId/familiares', authenticateToken, verificarRol(['AD']), expedienteCompletoController.listFamiliares);
router.put('/:usuarioId/familiares', authenticateToken, verificarRol(['AD']), expedienteCompletoController.saveFamiliares);

// ── Formación: certificaciones ──
router.get('/mi/certificaciones', authenticateToken, expedienteCompletoController.listCertificaciones);
router.post('/mi/certificaciones', authenticateToken, expedienteCompletoController.createCertificacion);
router.delete('/mi/certificaciones/:id', authenticateToken, expedienteCompletoController.deleteCertificacion);

// ── Formación: trayectoria académica ──
router.get('/mi/academico', authenticateToken, expedienteCompletoController.listAcademico);
router.post('/mi/academico', authenticateToken, expedienteCompletoController.createAcademico);
router.delete('/mi/academico/:id', authenticateToken, expedienteCompletoController.deleteAcademico);

// ── Formación: experiencia laboral ──
router.get('/mi/experiencia-laboral', authenticateToken, expedienteCompletoController.listExperienciaLaboral);
router.post('/mi/experiencia-laboral', authenticateToken, expedienteCompletoController.createExperienciaLaboral);
router.delete('/mi/experiencia-laboral/:id', authenticateToken, expedienteCompletoController.deleteExperienciaLaboral);

// ── Talento (7 categorías) ──
router.get('/mi/talento', authenticateToken, expedienteCompletoController.listTalento);
router.post('/mi/talento', authenticateToken, expedienteCompletoController.createTalento);
router.delete('/mi/talento/:id', authenticateToken, expedienteCompletoController.deleteTalento);

// Rutas admin — solo AD puede gestionar expedientes de otros usuarios
router.post(
	'/:userId/documentos',
	authenticateToken,
	verificarRol(['AD']),
	uploadExpediente.single('file'),
	expedienteController.uploadDocumento
);

router.get(
	'/:userId/documentos',
	authenticateToken,
	verificarRol(['AD']),
	expedienteController.listDocumentosByUsuario
);

router.get(
	'/documentos/:docId/download',
	authenticateToken,
	verificarRol(['AD']),
	expedienteController.downloadDocumento
);

router.delete(
	'/documentos/:docId',
	authenticateToken,
	verificarRol(['AD']),
	expedienteController.deleteDocumento
);

// Manejo de errores de Multer dentro de este router (ej. archivo demasiado grande)
router.use((err, req, res, next) => {
	if (err instanceof multer.MulterError) {
		if (err.code === 'LIMIT_FILE_SIZE') {
			return res.status(413).json({
				success: false,
				message: 'Archivo demasiado grande',
				errorCode: 'EXPEDIENTE_FILE_TOO_LARGE'
			});
		}
		return res.status(400).json({
			success: false,
			message: err.message || 'Error de carga de archivo',
			errorCode: 'EXPEDIENTE_UPLOAD_MULTER_ERROR'
		});
	}
	return next(err);
});

module.exports = router;
