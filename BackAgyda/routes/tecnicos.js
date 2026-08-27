const express = require('express');
const router = express.Router();
const tecnicosController = require('../controllers/tecnicosController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/', requireActionAccess('configuracion', 'ver'), tecnicosController.getTecnicos);
router.get('/:userId', requireActionAccess('configuracion', 'ver'), tecnicosController.getTecnicoById);
// Reasignar perfil (área/nivel/capacidad/especialidades) es administrativo: solo AD.
router.put('/:userId', verificarRol(['AD']), tecnicosController.actualizarPerfilTecnico);

module.exports = router;
