const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { authenticateToken } = require('../middleware/auth');

router.post('/noticias', authenticateToken, uploadController.uploadNoticiaImage);
// vacante-cv es público a propósito: lo usa el formulario de postulación del
// sitio público (ardabytec.com), sin sesión de intranet.
router.post('/vacante-cv', uploadController.uploadVacanteCV);
router.get('/proxy/pdf', authenticateToken, uploadController.proxyPDF);

module.exports = router;
