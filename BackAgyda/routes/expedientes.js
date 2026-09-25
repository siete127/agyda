const express = require('express');
const router = express.Router();

const multer = require('multer');

const expedienteController = require('../controllers/expedienteController');
const expedienteCompletoController = require('../controllers/expedienteCompletoController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { uploadExpediente } = require('../middleware/expedienteUpload');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Acciones de Accesos (módulo 'expedientes'): el propio → ver-propio / editar-propio;
// el de otros → además de ser AD, ver-otros / gestionar-otros.
const verPropio = requireActionAccess('expedientes', 'ver-propio');
const editarPropio = requireActionAccess('expedientes', 'editar-propio');
const verOtros = requireActionAccess('expedientes', 'ver-otros');
const gestionarOtros = requireActionAccess('expedientes', 'gestionar-otros');

// Rutas "Mi expediente" — cualquier usuario autenticado accede a su propio expediente
router.post(
	'/mi/documentos',
	authenticateToken,
	editarPropio,
	uploadExpediente.single('file'),
	expedienteController.uploadMiDocumento
);

router.get(
	'/mi/documentos',
	authenticateToken,
	verPropio,
	expedienteController.listMisDocumentos
);

router.get(
	'/mi/documentos/:docId/download',
	authenticateToken,
	verPropio,
	expedienteController.downloadMiDocumento
);

router.delete(
	'/mi/documentos/:docId',
	authenticateToken,
	editarPropio,
	expedienteController.deleteMiDocumento
);

// ── Contacto ──
router.get('/mi/contacto', authenticateToken, verPropio, expedienteController.getMiContacto);
router.put('/mi/contacto', authenticateToken, editarPropio, expedienteController.updateMiContacto);

// ── Persona ──
router.get('/mi/persona', authenticateToken, verPropio, expedienteCompletoController.getPersona);
router.put('/mi/persona', authenticateToken, editarPropio, expedienteCompletoController.updatePersona);
router.get('/:usuarioId/persona', authenticateToken, verificarRol(['AD']), verOtros, expedienteCompletoController.getPersona);
router.put('/:usuarioId/persona', authenticateToken, verificarRol(['AD']), gestionarOtros, expedienteCompletoController.updatePersona);

// ── Familiares ──
router.get('/mi/familiares', authenticateToken, verPropio, expedienteCompletoController.listFamiliares);
router.put('/mi/familiares', authenticateToken, editarPropio, expedienteCompletoController.saveFamiliares);
router.get('/:usuarioId/familiares', authenticateToken, verificarRol(['AD']), verOtros, expedienteCompletoController.listFamiliares);
router.put('/:usuarioId/familiares', authenticateToken, verificarRol(['AD']), gestionarOtros, expedienteCompletoController.saveFamiliares);

// ── Formación: certificaciones ──
router.get('/mi/certificaciones', authenticateToken, verPropio, expedienteCompletoController.listCertificaciones);
router.post('/mi/certificaciones', authenticateToken, editarPropio, expedienteCompletoController.createCertificacion);
router.delete('/mi/certificaciones/:id', authenticateToken, editarPropio, expedienteCompletoController.deleteCertificacion);

// ── Formación: trayectoria académica ──
router.get('/mi/academico', authenticateToken, verPropio, expedienteCompletoController.listAcademico);
router.post('/mi/academico', authenticateToken, editarPropio, expedienteCompletoController.createAcademico);
router.delete('/mi/academico/:id', authenticateToken, editarPropio, expedienteCompletoController.deleteAcademico);

// ── Formación: experiencia laboral ──
router.get('/mi/experiencia-laboral', authenticateToken, verPropio, expedienteCompletoController.listExperienciaLaboral);
router.post('/mi/experiencia-laboral', authenticateToken, editarPropio, expedienteCompletoController.createExperienciaLaboral);
router.delete('/mi/experiencia-laboral/:id', authenticateToken, editarPropio, expedienteCompletoController.deleteExperienciaLaboral);

// ── Talento (7 categorías) ──
router.get('/mi/talento', authenticateToken, verPropio, expedienteCompletoController.listTalento);
router.post('/mi/talento', authenticateToken, editarPropio, expedienteCompletoController.createTalento);
router.delete('/mi/talento/:id', authenticateToken, editarPropio, expedienteCompletoController.deleteTalento);

// Rutas admin — solo AD puede gestionar expedientes de otros usuarios
router.post(
	'/:userId/documentos',
	authenticateToken,
	verificarRol(['AD']),
	gestionarOtros,
	uploadExpediente.single('file'),
	expedienteController.uploadDocumento
);

router.get(
	'/:userId/documentos',
	authenticateToken,
	verificarRol(['AD']),
	verOtros,
	expedienteController.listDocumentosByUsuario
);

router.get(
	'/documentos/:docId/download',
	authenticateToken,
	verificarRol(['AD']),
	verOtros,
	expedienteController.downloadDocumento
);

router.delete(
	'/documentos/:docId',
	authenticateToken,
	verificarRol(['AD']),
	gestionarOtros,
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
