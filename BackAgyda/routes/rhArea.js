const express = require('express');
const router = express.Router();
const controller = require('../controllers/rhAreaController');
const auth = require('../middleware/auth');

router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/vacantes', auth.authenticateToken, controller.listVacantes);
router.post('/vacantes', auth.authenticateToken, controller.crearVacante);
router.get('/candidatos', auth.authenticateToken, controller.listCandidatos);
router.post('/candidatos', auth.authenticateToken, controller.crearCandidato);

module.exports = router;
