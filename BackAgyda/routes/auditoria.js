const express = require('express');
const router = express.Router();
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { getAuditoria } = require('../controllers/auditoriaController');

router.get('/', authenticateToken, verificarRol(['AD']), requireActionAccess('auditoria', 'ver'), getAuditoria);

module.exports = router;
