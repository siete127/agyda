const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Lectura pública — la usa el widget de chat de la página pública para construir el diccionario.
router.get('/respuestas/publicas', chatbotController.getRespuestasPublicas);

// Gestión — requiere sesión + permiso de acción sobre el módulo 'chatbot'.
router.get('/respuestas', authenticateToken, requireActionAccess('chatbot', 'ver'), chatbotController.getRespuestas);
router.get('/leads', authenticateToken, requireActionAccess('chatbot', 'ver'), chatbotController.getLeads);
router.post('/respuestas', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'crear'), chatbotController.createRespuesta);
router.put('/respuestas/:pk', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotController.updateRespuesta);
router.patch('/respuestas/:pk/activa', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotController.toggleActiva);
router.delete('/respuestas/:pk', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'eliminar'), chatbotController.deleteRespuesta);

module.exports = router;
