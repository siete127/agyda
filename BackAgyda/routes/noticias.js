const express = require('express');
const router = express.Router();
const noticiaController = require('../controllers/noticiaController');
const comentarioController = require('../controllers/comentarioController');
const reaccionesController = require('../controllers/reaccionesController');
const { authenticateToken, authenticateTokenOptional, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.get('/', authenticateTokenOptional, noticiaController.getNoticias);
router.get('/destacadas', authenticateTokenOptional, noticiaController.getNoticiasDestacadas);

// Layout: definir ANTES de rutas con parámetro :id para evitar colisiones
router.get('/layout/collage', noticiaController.getLayout);
// Solo usuarios AD pueden guardar el layout del collage
router.post('/layout/collage', authenticateToken, verificarRol(['AD']), requireActionAccess('noticias', 'editar-layout'), noticiaController.saveLayout);
// Compatibilidad: Flutter llama a /layout sin /collage
router.get('/layout', noticiaController.getLayout);
router.post('/layout', authenticateToken, verificarRol(['AD']), requireActionAccess('noticias', 'editar-layout'), noticiaController.saveLayout);

// Rutas con :id (después de las rutas específicas)
router.get('/:id', authenticateTokenOptional, noticiaController.getNoticiaById);
// Reacciones (tipo Facebook)
router.get('/:id/reactions', authenticateTokenOptional, reaccionesController.getNoticiaReacciones);
router.get('/:id/reactions/users', authenticateToken, reaccionesController.getNoticiaReactores);
router.put('/:id/reactions', authenticateToken, requireActionAccess('noticias', 'reaccionar-comentar'), reaccionesController.setNoticiaReaccion);
router.delete('/:id/reactions', authenticateToken, requireActionAccess('noticias', 'reaccionar-comentar'), reaccionesController.removeNoticiaReaccion);
router.post('/', authenticateToken, requireActionAccess('noticias', 'crear'), noticiaController.createNoticia);
router.put('/:id', authenticateToken, requireActionAccess('noticias', 'editar'), noticiaController.updateNoticia);
router.delete('/:id', authenticateToken, requireActionAccess('noticias', 'eliminar'), noticiaController.deleteNoticia);
router.patch('/:id/activo', authenticateToken, requireActionAccess('noticias', 'editar'), noticiaController.toggleActivo);
router.patch('/:id/destacada', authenticateToken, requireActionAccess('noticias', 'editar'), noticiaController.toggleDestacada);
router.patch('/:id/comments-enabled', authenticateToken, requireActionAccess('noticias', 'editar'), noticiaController.toggleCommentsEnabled);

// Compatibilidad: Comentarios (Flutter llama a /api/noticias/:id/comments)
router.get('/:id/comments', comentarioController.getComentariosNoticia);
router.post('/:id/comments', authenticateToken, requireActionAccess('noticias', 'reaccionar-comentar'), comentarioController.createComentarioNoticia);

module.exports = router;