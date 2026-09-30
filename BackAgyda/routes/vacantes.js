const express = require('express');
const router = express.Router();
const vacanteController = require('../controllers/vacanteController');
const postulanteController = require('../controllers/postulanteController');
const { authenticateToken, authenticateTokenOptional, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Dashboard — rutas fijas, deben ir antes de '/:id' para evitar colisión
router.get('/postulantes', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.getAllPostulantes);
router.get('/dashboard/stats', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.getDashboardStats);

// Lectura pública (portal de vacantes en la página pública)
router.get('/', authenticateTokenOptional, vacanteController.getVacantes);
router.get('/:id', authenticateTokenOptional, vacanteController.getVacanteById);

// Postulación pública (formulario de la página pública, sin autenticación)
router.post('/:id/postulantes', postulanteController.createPostulante);

// Gestión — requiere sesión + permiso de acción sobre el módulo 'vacantes'
router.post('/', authenticateToken, verificarRol(['AD']), requireActionAccess('vacantes', 'crear'), vacanteController.createVacante);
router.put('/:id', authenticateToken, verificarRol(['AD']), requireActionAccess('vacantes', 'editar'), vacanteController.updateVacante);
router.delete('/:id', authenticateToken, verificarRol(['AD']), requireActionAccess('vacantes', 'eliminar'), vacanteController.deleteVacante);
router.patch('/:id/activo', authenticateToken, verificarRol(['AD']), requireActionAccess('vacantes', 'editar'), vacanteController.toggleActivo);

// Postulantes — solo consulta/gestión autenticada
router.get('/:id/postulantes', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.getPostulantesByVacante);
router.patch('/:id/postulantes/:postId/estado', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.updateEstadoPostulante);
router.patch('/:id/postulantes/:postId/etapa', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.updateEtapaPostulante);

// Reclutamiento: prospecto capturado por RH, credenciales del contratado (ticket a TI) y su usuario (expediente)
router.post('/:id/postulantes/manual', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.createPostulanteManual);
router.post('/:id/postulantes/:postId/credenciales', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.solicitarCredenciales);
router.get('/:id/postulantes/:postId/usuario', authenticateToken, requireActionAccess('vacantes', 'ver-postulantes'), postulanteController.usuarioDePostulante);

module.exports = router;
