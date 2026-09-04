const express = require('express');
const router = express.Router();
const sim = require('../controllers/ccSimuladorController');

// Endpoints públicos del "cliente" simulado (patrón portal CRM: token opaco, sin login).
router.get('/:token', sim.getHilo);
router.post('/:token/mensajes', sim.responder);

module.exports = router;
