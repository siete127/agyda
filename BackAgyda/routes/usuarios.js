const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const perfilController = require('../controllers/perfilController');
const { uploadProfile, uploadPortada } = require('../middleware/upload');
const { authenticateToken, verificarRol, requireSelfOrAdmin } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.get('/', authenticateToken, usuarioController.getUsuarios);
router.get('/desactivados', authenticateToken, usuarioController.getUsuariosDesactivados)
router.get('/ti', authenticateToken, usuarioController.getUsuariosTI)
router.get('/area/:tipo', authenticateToken, usuarioController.getUsuariosByArea)
router.get('/todas-areas', authenticateToken, usuarioController.getTodosConArea);
router.get('/nuevos-colaboradores', authenticateToken, usuarioController.getNuevosColaboradores);
router.get('/aniversarios', authenticateToken, usuarioController.getAniversarios);
router.get('/:id', authenticateToken, usuarioController.getUsuarioById);
router.get('/:id/ficha', authenticateToken, usuarioController.getUsuarioFicha);
router.put('/:id/ficha', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.updateUsuarioFicha);
router.get('/:id/status', authenticateToken, usuarioController.getCurrentStatus);
router.get('/:id/online', authenticateToken, usuarioController.checkUserOnline);
router.get('/:id/times', authenticateToken, usuarioController.getTimes);
router.post('/:id/status', authenticateToken, usuarioController.changeStatus);
router.post('/', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.createUsuario);
router.put('/:id/activo', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.toggleActivo);
router.put('/:id/status-ventas', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.toggleStatus);
router.put('/:id/rol', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.cambiarRol);
router.put('/:id/puesto', authenticateToken, verificarRol(['AD']), requireActionAccess('mi-area', 'editar-puesto'), usuarioController.updatePuesto);
router.put('/:id', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.updateUsuario);
router.delete('/:id', authenticateToken, verificarRol(['AD', 'TI']), usuarioController.deleteUsuario);

// Rutas de compatibilidad para perfil (Flutter espera /api/usuarios/:id/perfil)
router.get('/:id/perfil', authenticateToken, perfilController.getPerfil);
router.get('/:id/perfil-detalle', authenticateToken, perfilController.getPerfilDetalle);
router.put('/:id/alias', authenticateToken, requireSelfOrAdmin(), perfilController.updateAlias);
router.put('/:id/password', authenticateToken, requireSelfOrAdmin(), perfilController.updatePassword);
router.put('/:id/perfil-detalle', authenticateToken, requireSelfOrAdmin(), perfilController.updatePerfilDetalle);
// Compatibilidad: actualizar fecha de cumpleaños vía /usuarios
router.put('/:id/cumpleanos', authenticateToken, requireSelfOrAdmin(), perfilController.updateFechaCumpleanos);
// Solo AD puede cambiar foto de perfil de cualquier usuario
router.post(
	'/:id/foto',
	authenticateToken,
	verificarRol(['AD', 'admin', 'Administrador']),
	uploadProfile.single('foto'),
	perfilController.uploadFoto
);
router.post('/:id/portada', authenticateToken, requireSelfOrAdmin(), uploadPortada.single('portada'), perfilController.uploadPortada);

module.exports = router;