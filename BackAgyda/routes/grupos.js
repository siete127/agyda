const express = require('express');
const router = express.Router();
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const ctrl = require('../controllers/gruposController');

// Grupos de usuarios (Configuración → Usuarios y Seguridad → Grupos). Mismo
// criterio que Funciones de usuario: consulta quien ve la gestión de
// usuarios; cambios solo AD/TI con "editar" usuarios.
const ver = requireActionAccess('usuarios', 'ver');
const gestionar = [verificarRol(['AD', 'TI']), requireActionAccess('usuarios', 'editar')];

router.use(authenticateToken);
router.get('/', ver, ctrl.resumen);
router.get('/opciones', ver, ctrl.opciones);
router.get('/:tipo/:id/miembros', ver, ctrl.miembros);
router.post('/:tipo/:id/miembros', ...gestionar, ctrl.agregarMiembros);
router.delete('/:tipo/:id/miembros/:usuarioId', ...gestionar, ctrl.quitarMiembro);
router.get('/:tipo/:id/config', ver, ctrl.leerConfig);
router.get('/:tipo/:id/enlaces', ver, ctrl.enlaces);
router.put('/:tipo/:id/config', ...gestionar, ctrl.guardarConfig);
router.get('/:tipo/:id/clientes', ver, ctrl.clientes);
router.post('/:tipo/:id/clientes', ...gestionar, ctrl.agregarClientes);
router.delete('/:tipo/:id/clientes/:clienteId', ...gestionar, ctrl.quitarCliente);
router.post('/:tipo', ...gestionar, ctrl.crear);
router.delete('/:tipo/:id', ...gestionar, ctrl.eliminar);

module.exports = router;
