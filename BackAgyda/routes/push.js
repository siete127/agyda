const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');
const { authenticateToken } = require('../middleware/auth');

router.get('/public-key', pushController.getPublicKey);

router.use(authenticateToken);
router.post('/suscripciones', pushController.suscribirse);
router.delete('/suscripciones', pushController.desuscribirse);

module.exports = router;
