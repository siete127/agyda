const express = require('express');
const router = express.Router();
const incapacidadesController = require('../controllers/incapacidadesController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadIncapacidad } = require('../middleware/incapacidadUpload');

// Empleado: solicitar y ver su propio historial
router.post('/', authenticateToken, uploadIncapacidad.single('comprobante'), incapacidadesController.crearSolicitud);
router.get('/mis', authenticateToken, incapacidadesController.getMisIncapacidades);
router.get('/documentos/:docId/download', authenticateToken, incapacidadesController.downloadDocumento);

// RH/admin: ver todas y aprobar/rechazar
router.get('/', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('incapacidades', 'ver'), incapacidadesController.getAll);
router.patch('/:id/responder', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('incapacidades', 'aprobar'), incapacidadesController.responder);

module.exports = router;
