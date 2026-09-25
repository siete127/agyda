const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const perfilController = require('../controllers/perfilController');
const { uploadProfile, uploadPortada } = require('../middleware/upload');
const { authenticateToken, verificarRol, requireSelfOrAdmin } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Acciones de Accesos del módulo Usuarios. Se suman al rol (AD/TI): el rol
// dice quién puede administrar usuarios, la acción qué puede hacer. La lista
// y la consulta de usuarios (GET) no se restringen: muchos módulos las usan en
// sus selectores; "ver" solo controla la pantalla de gestión en el frontend.
const U = 'usuarios';
// Sobre la cuenta de OTRO se exige la acción; sobre la propia, siempre se permite.
const siEsDeOtro = (accion) => (req, res, next) => {
  const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
  if (uid && String(uid) === String(req.params.id)) return next();
  return requireActionAccess(U, accion)(req, res, next);
};

router.get('/', authenticateToken, usuarioController.getUsuarios);
router.get('/desactivados', authenticateToken, usuarioController.getUsuariosDesactivados)
router.get('/ti', authenticateToken, usuarioController.getUsuariosTI)
router.get('/area/:tipo', authenticateToken, usuarioController.getUsuariosByArea)
router.get('/todas-areas', authenticateToken, usuarioController.getTodosConArea);
router.get('/nuevos-colaboradores', authenticateToken, usuarioController.getNuevosColaboradores);
router.get('/aniversarios', authenticateToken, usuarioController.getAniversarios);
router.get('/:id', authenticateToken, usuarioController.getUsuarioById);
router.get('/:id/ficha', authenticateToken, usuarioController.getUsuarioFicha);
router.put('/:id/ficha', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'editar'), usuarioController.updateUsuarioFicha);
router.get('/:id/status', authenticateToken, usuarioController.getCurrentStatus);
router.get('/:id/online', authenticateToken, usuarioController.checkUserOnline);
router.get('/:id/times', authenticateToken, usuarioController.getTimes);
router.post('/:id/status', authenticateToken, usuarioController.changeStatus);
router.post('/', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'crear'), usuarioController.createUsuario);
router.put('/:id/activo', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'habilitar'), usuarioController.toggleActivo);
router.put('/:id/status-ventas', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'habilitar'), usuarioController.toggleStatus);
router.put('/:id/rol', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'editar'), usuarioController.cambiarRol);
router.put('/:id/puesto', authenticateToken, verificarRol(['AD']), requireActionAccess('mi-area', 'editar-puesto'), usuarioController.updatePuesto);
router.put('/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'editar'), usuarioController.updateUsuario);
router.delete('/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess(U, 'eliminar'), usuarioController.deleteUsuario);

// Rutas de compatibilidad para perfil (Flutter espera /api/usuarios/:id/perfil)
router.get('/:id/perfil', authenticateToken, perfilController.getPerfil);
router.get('/:id/perfil-detalle', authenticateToken, perfilController.getPerfilDetalle);
router.put('/:id/alias', authenticateToken, requireSelfOrAdmin(), siEsDeOtro('editar'), perfilController.updateAlias);
router.put('/:id/password', authenticateToken, requireSelfOrAdmin(), siEsDeOtro('cambiar-password'), perfilController.updatePassword);
router.put('/:id/perfil-detalle', authenticateToken, requireSelfOrAdmin(), siEsDeOtro('editar'), perfilController.updatePerfilDetalle);
// Compatibilidad: actualizar fecha de cumpleaños vía /usuarios
router.put('/:id/cumpleanos', authenticateToken, requireSelfOrAdmin(), siEsDeOtro('editar'), perfilController.updateFechaCumpleanos);
// Solo AD puede cambiar foto de perfil de cualquier usuario
router.post(
	'/:id/foto',
	authenticateToken,
	verificarRol(['AD', 'admin', 'Administrador']),
	siEsDeOtro('cambiar-foto'),
	uploadProfile.single('foto'),
	perfilController.uploadFoto
);
router.post('/:id/portada', authenticateToken, requireSelfOrAdmin(), siEsDeOtro('cambiar-foto'), uploadPortada.single('portada'), perfilController.uploadPortada);

module.exports = router;