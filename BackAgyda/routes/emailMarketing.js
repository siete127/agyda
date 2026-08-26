const express = require('express');
const router = express.Router();
const emailMarketingController = require('../controllers/emailMarketingController');
const emailBajaController = require('../controllers/emailBajaController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Público, sin auth — el link va dentro de cada correo de campaña.
router.get('/baja', emailBajaController.darDeBaja);

// Plantillas — 'gestionar' es la acción de administración del módulo.
router.get('/plantillas', authenticateToken, requireActionAccess('email-marketing', 'ver'), emailMarketingController.getPlantillas);
router.post('/plantillas', authenticateToken, requireActionAccess('email-marketing', 'gestionar'), emailMarketingController.createPlantilla);
router.put('/plantillas/:id', authenticateToken, requireActionAccess('email-marketing', 'gestionar'), emailMarketingController.updatePlantilla);
router.delete('/plantillas/:id', authenticateToken, requireActionAccess('email-marketing', 'gestionar'), emailMarketingController.deletePlantilla);
router.post('/plantillas/preview', authenticateToken, requireActionAccess('email-marketing', 'ver'), emailMarketingController.previewPlantilla);

// Campañas
router.get('/campanias', authenticateToken, requireActionAccess('email-marketing', 'ver'), emailMarketingController.getCampanias);
router.get('/campanias/:id', authenticateToken, requireActionAccess('email-marketing', 'ver'), emailMarketingController.getCampania);
router.post('/campanias', authenticateToken, requireActionAccess('email-marketing', 'crear-campana'), emailMarketingController.createCampania);
router.post('/campanias/contar-destinatarios', authenticateToken, requireActionAccess('email-marketing', 'crear-campana'), emailMarketingController.contarDestinatarios);
router.post('/campanias/:id/iniciar', authenticateToken, requireActionAccess('email-marketing', 'crear-campana'), emailMarketingController.iniciarCampania);
router.post('/campanias/:id/pausar', authenticateToken, requireActionAccess('email-marketing', 'crear-campana'), emailMarketingController.pausarCampania);
router.post('/campanias/:id/reanudar', authenticateToken, requireActionAccess('email-marketing', 'crear-campana'), emailMarketingController.reanudarCampania);
router.post('/campanias/:id/cancelar', authenticateToken, requireActionAccess('email-marketing', 'crear-campana'), emailMarketingController.cancelarCampania);
router.get('/campanias/:id/envios', authenticateToken, requireActionAccess('email-marketing', 'ver'), emailMarketingController.getEnvios);
router.get('/campanias/:id/reporte', authenticateToken, requireActionAccess('email-marketing', 'ver'), emailMarketingController.getReporte);

module.exports = router;
