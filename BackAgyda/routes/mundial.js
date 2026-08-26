const express = require('express');
const router  = express.Router();
const mundialController = require('../controllers/mundialController');

router.get('/partidos', mundialController.getPartidos);

module.exports = router;
