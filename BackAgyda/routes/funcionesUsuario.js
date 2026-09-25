const express = require('express');
const router = express.Router();
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const ctrl = require('../controllers/funcionesUsuarioController');

// Funciones de usuario (Configuración → Usuarios → Funciones). Lectura para
// quien ve la gestión de usuarios; cambios solo AD/TI con "editar" usuarios.
const ver = requireActionAccess('usuarios', 'ver');
const gestionar = [verificarRol(['AD', 'TI']), requireActionAccess('usuarios', 'editar')];

router.use(authenticateToken);
router.get('/', ver, ctrl.listar);
router.post('/', ...gestionar, ctrl.crear);
router.put('/:id', ...gestionar, ctrl.actualizar);
router.delete('/:id', ...gestionar, ctrl.eliminar);
router.get('/:id/usuarios', ver, ctrl.listarUsuarios);
router.post('/:id/usuarios', ...gestionar, ctrl.agregarUsuarios);
router.delete('/:id/usuarios/:usuarioId', ...gestionar, ctrl.quitarUsuario);

module.exports = router;
