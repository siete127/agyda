const express = require('express');
const router = express.Router();
const comentarioController = require('../controllers/comentarioController');
const reaccionesController = require('../controllers/reaccionesController');
const { authenticateToken, authenticateTokenOptional } = require('../middleware/auth');

router.get('/noticias/:id/comments', comentarioController.getComentariosNoticia);
router.post('/noticias/:id/comments', comentarioController.createComentarioNoticia);

// Reacciones en comentarios
router.get('/:commentId/reactions', authenticateTokenOptional, reaccionesController.getComentarioReacciones);
router.get('/:commentId/reactions/users', authenticateToken, reaccionesController.getComentarioReactores);
router.put('/:commentId/reactions', authenticateToken, reaccionesController.setComentarioReaccion);
router.delete('/:commentId/reactions', authenticateToken, reaccionesController.removeComentarioReaccion);

router.put('/:commentId', comentarioController.updateComentario);
router.delete('/:commentId', comentarioController.deleteComentario);

module.exports = router;