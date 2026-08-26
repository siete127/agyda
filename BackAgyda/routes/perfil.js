const express = require('express');
const router = express.Router();
const perfilController = require('../controllers/perfilController');
const { uploadProfile, uploadPortada } = require('../middleware/upload');
const { authenticateToken, verificarRol, requireSelfOrAdmin } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.get('/:id', authenticateToken, perfilController.getPerfil);
router.get('/:id/detalle', authenticateToken, perfilController.getPerfilDetalle);
router.put('/:id/alias', authenticateToken, requireSelfOrAdmin(), perfilController.updateAlias);
router.put('/:id/password', authenticateToken, requireSelfOrAdmin(), perfilController.updatePassword);
router.put('/:id/detalle', authenticateToken, requireSelfOrAdmin(), perfilController.updatePerfilDetalle);
router.put('/:id/cumpleanos', authenticateToken, requireSelfOrAdmin(), perfilController.updateFechaCumpleanos);
router.put('/:id/contacto',  authenticateToken, requireSelfOrAdmin(), perfilController.updateContacto);
router.put('/:id/puesto',    authenticateToken, verificarRol(['AD']), requireActionAccess('mi-area', 'editar-puesto'), perfilController.updatePuesto);
// Solo Administrador (AD) puede editar la foto de perfil de cualquier usuario
router.post(
	'/:id/foto',
	authenticateToken,
	verificarRol(['AD', 'admin', 'Administrador']),
	requireActionAccess('mi-area', 'subir-foto'),
	uploadProfile.single('foto'),
	perfilController.uploadFoto
);

// (Opcional) Si también quieres restringir portada a AD, descomenta verificarRol
router.post(
	'/:id/portada',
	authenticateToken,
	// verificarRol(['AD', 'admin', 'Administrador']),
	uploadPortada.single('portada'),
	perfilController.uploadPortada
);

module.exports = router;
