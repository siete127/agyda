const express = require('express');
const router = express.Router();
const controller = require('../controllers/calidadController');
const auth = require('../middleware/auth');

router.get('/evaluaciones', auth.authenticateToken, controller.listEvaluaciones);
router.post('/evaluaciones', auth.authenticateToken, controller.crearEvaluacion);
router.get('/dashboard', auth.authenticateToken, controller.getDashboard);

// Retroalimentación
router.get('/retroalimentacion', auth.authenticateToken, controller.listRetroalimentaciones);
router.get('/retroalimentacion/mias', auth.authenticateToken, controller.getMiRetroalimentacion);
router.post('/retroalimentacion', auth.authenticateToken, controller.crearRetroalimentacion);
router.patch('/retroalimentacion/:id/vista', auth.authenticateToken, controller.marcarRetroalimentacionVista);
router.delete('/retroalimentacion/:id', auth.authenticateToken, controller.eliminarRetroalimentacion);

// Planes de mejora
router.get('/planes-mejora', auth.authenticateToken, controller.listPlanesMejora);
router.get('/planes-mejora/mios', auth.authenticateToken, controller.getMisPlanesMejora);
router.post('/planes-mejora', auth.authenticateToken, controller.crearPlanMejora);
router.patch('/planes-mejora/:id/estatus', auth.authenticateToken, controller.actualizarEstatusPlanMejora);
router.delete('/planes-mejora/:id', auth.authenticateToken, controller.eliminarPlanMejora);

// Cumplimiento de procesos
router.get('/procesos', auth.authenticateToken, controller.listProcesos);
router.post('/procesos', auth.authenticateToken, controller.crearProceso);
router.delete('/procesos/:id', auth.authenticateToken, controller.eliminarProceso);
router.get('/procesos/registros', auth.authenticateToken, controller.listRegistrosProceso);
router.post('/procesos/registros', auth.authenticateToken, controller.crearRegistroProceso);
router.delete('/procesos/registros/:id', auth.authenticateToken, controller.eliminarRegistroProceso);

// Auditorías
router.get('/auditorias', auth.authenticateToken, controller.listAuditorias);
router.get('/auditorias/:id', auth.authenticateToken, controller.getAuditoria);
router.post('/auditorias', auth.authenticateToken, controller.crearAuditoria);
router.post('/auditorias/:id/registros', auth.authenticateToken, controller.agregarRegistroAuditoria);
router.delete('/auditorias/:id/registros/:registroId', auth.authenticateToken, controller.quitarRegistroAuditoria);
router.patch('/auditorias/:id/cerrar', auth.authenticateToken, controller.cerrarAuditoria);
router.delete('/auditorias/:id', auth.authenticateToken, controller.eliminarAuditoria);

// Detección de errores
router.get('/errores', auth.authenticateToken, controller.listErrores);
router.get('/errores/resumen', auth.authenticateToken, controller.getResumenErrores);
router.post('/errores', auth.authenticateToken, controller.crearError);
router.patch('/errores/:id/resolver', auth.authenticateToken, controller.resolverError);
router.delete('/errores/:id', auth.authenticateToken, controller.eliminarError);

module.exports = router;
