const express = require('express');
const router = express.Router();
const encuestaController = require('../controllers/encuestaController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess, requireAnyActionAccess } = require('../middleware/moduleAccess');

// ── Públicas (sin sesión) — declaradas antes de '/:encuestaId' para que Express
// no las capture como parámetro dinámico. ──────────────────────────────────
router.get('/publica/:slug', encuestaController.getEncuestaPublicaBySlug);
router.post('/publica/:slug/responder', encuestaController.responderEncuestaPublica);

// ── Autenticadas: propio usuario ────────────────────────────────────────────
router.get('/usuario/:usuarioId', authenticateToken, encuestaController.getEncuestasUsuario);
router.get('/completadas/:usuarioId', authenticateToken, encuestaController.getEncuestasCompletadas);
router.get('/asignaciones/:asignacionId/check-answered', authenticateToken, encuestaController.checkIfSurveyAnswered);
router.post('/responder', authenticateToken, requireActionAccess('encuestas', 'responder'), encuestaController.responderEncuesta);
router.get('/noticias', authenticateToken, encuestaController.getEncuestasNoticias);
router.get('/categoria/:categoria', authenticateToken, encuestaController.getEncuestasPorCategoria);

// ── Admin (ver/crear/editar/eliminar) ───────────────────────────────────────
router.get('/', authenticateToken, requireActionAccess('encuestas', 'ver'), encuestaController.getEncuestas);
router.get('/todas', authenticateToken, requireActionAccess('encuestas', 'ver'), encuestaController.getEncuestas);
router.get('/dashboard/resumen', authenticateToken, requireActionAccess('encuestas', 'ver'), encuestaController.getResumenDashboard);
router.get('/respondidas', authenticateToken, requireActionAccess('encuestas', 'ver'), encuestaController.getEncuestasRespondidas);
router.get('/completas/respondidas', authenticateToken, requireActionAccess('encuestas', 'ver'), encuestaController.getEncuestasCompletasRespondidas);
router.get('/:encuestaId', authenticateToken, requireAnyActionAccess([['encuestas', 'ver'], ['atencion-cliente', 'clientes-encuestas']]), encuestaController.getEncuestaById);
router.get('/:encuestaId/resultados', authenticateToken, requireAnyActionAccess([['encuestas', 'ver'], ['atencion-cliente', 'clientes-encuestas']]), encuestaController.getResultadosEncuesta);
router.get('/:encuestaId/resultados-separados', authenticateToken, requireAnyActionAccess([['encuestas', 'ver'], ['atencion-cliente', 'clientes-encuestas']]), encuestaController.getResultadosSeparados);
router.post('/', authenticateToken, requireAnyActionAccess([['encuestas', 'crear'], ['atencion-cliente', 'clientes-encuestas']]), encuestaController.createEncuesta);
router.post('/:encuestaId/duplicar', authenticateToken, requireActionAccess('encuestas', 'crear'), encuestaController.duplicarEncuesta);
router.post('/asignar-encuesta', authenticateToken, requireActionAccess('encuestas', 'editar'), encuestaController.asignarEncuesta);
router.post('/:encuestaId/asignar-area', authenticateToken, requireActionAccess('encuestas', 'editar'), encuestaController.asignarPorArea);
router.put('/:encuestaId/estado', authenticateToken, requireActionAccess('encuestas', 'editar'), encuestaController.cambiarEstadoEncuesta);
router.put('/:encuestaId', authenticateToken, requireAnyActionAccess([['encuestas', 'editar'], ['atencion-cliente', 'clientes-encuestas']]), encuestaController.editarEncuesta);
router.patch('/:encuestaId/cerrar', authenticateToken, requireActionAccess('encuestas', 'editar'), encuestaController.cambiarEstadoEncuesta);
router.delete('/:encuestaId', authenticateToken, requireActionAccess('encuestas', 'eliminar'), encuestaController.deleteEncuesta);

module.exports = router;
