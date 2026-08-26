const express = require('express');
const router = express.Router();
const campanaAgente = require('../controllers/campanaAgenteController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Catálogo en vivo desde el sistema Ventas (plata_prospectPRO.dbo.Campanas)
router.get('/disponibles', authenticateToken, campanaAgente.listCampanasDisponibles);

// Asignación agente → campaña (tabla propia de AGYDA, editable desde Usuarios)
router.get('/agentes', authenticateToken, campanaAgente.listAgentesCampanas);
router.get('/agentes/:neusId', authenticateToken, campanaAgente.getAgenteCampana);
router.put('/agentes/:neusId', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.setAgenteCampana);
router.delete('/agentes/:neusId', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.deleteAgenteCampana);

module.exports = router;
