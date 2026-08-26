const express = require('express');
const router = express.Router();
const proyectoController = require('../controllers/proyectoController');
const tareaController = require('../controllers/tareaController');
const estatusController = require('../controllers/estatusController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/',    requireActionAccess('proyectos', 'ver'), proyectoController.getProyectos);
router.get('/config/ad-ve-todos',  requireActionAccess('proyectos', 'ver'), proyectoController.getConfigProyectosAD);
router.put('/config/ad-ve-todos',  requireActionAccess('proyectos', 'editar'), proyectoController.setConfigProyectosAD);
router.get('/:id', requireActionAccess('proyectos', 'ver'), proyectoController.getProyectoById);
router.post('/', requireActionAccess('proyectos', 'crear'), proyectoController.createProyecto);
router.put('/:id', requireActionAccess('proyectos', 'editar'), proyectoController.updateProyecto);
router.delete('/:id', requireActionAccess('proyectos', 'eliminar'), proyectoController.deleteProyecto);

// Estatus por proyecto
router.get('/:id/estatus',                    requireActionAccess('proyectos', 'ver'), estatusController.getEstatus);
router.post('/:id/estatus',                   requireActionAccess('proyectos', 'gestionar-tareas'), estatusController.createEstatus);
router.put('/:id/estatus/:estatusId',         requireActionAccess('proyectos', 'gestionar-tareas'), estatusController.updateEstatus);
router.delete('/:id/estatus/:estatusId',      requireActionAccess('proyectos', 'gestionar-tareas'), estatusController.deleteEstatus);

// Miembros
router.get('/:id/miembros', requireActionAccess('proyectos', 'ver'), proyectoController.getMiembros);
router.post('/:id/miembros', requireActionAccess('proyectos', 'gestionar-miembros'), proyectoController.addMiembro);
router.get('/:id/miembros/:miembroId', requireActionAccess('proyectos', 'ver'), proyectoController.getMiembroById);
router.put('/:id/miembros/:miembroId', requireActionAccess('proyectos', 'gestionar-miembros'), proyectoController.updateMiembro);
router.delete('/:id/miembros/:miembroId', requireActionAccess('proyectos', 'gestionar-miembros'), proyectoController.deleteMiembro);

// Compatibilidad: tareas bajo proyectos (Flutter usa /api/proyectos/:id/tareas)
router.get('/:id/tareas', requireActionAccess('proyectos', 'ver'), tareaController.getTareas);
router.get('/:id/tareas-eliminadas', requireActionAccess('proyectos', 'ver'), tareaController.getTareasEliminadas);
router.get('/:id/tareas/:tareaId', requireActionAccess('proyectos', 'ver'), tareaController.getTareaById);
router.post('/:id/tareas', requireActionAccess('proyectos', 'gestionar-tareas'), tareaController.createTarea);
router.put('/:id/tareas/:tareaId', requireActionAccess('proyectos', 'gestionar-tareas'), tareaController.updateTarea);
router.delete('/:id/tareas/:tareaId', requireActionAccess('proyectos', 'gestionar-tareas'), tareaController.deleteTarea);
router.post('/:id/tareas/:tareaId/completar', requireActionAccess('proyectos', 'gestionar-tareas'), tareaController.completarTarea);

// Endpoints extra: aprobar/rechazar/actualizar fechas bajo /api/proyectos
const notImplemented = (name) => (req, res) => {
	res.status(501).json({ success: false, message: `Handler ${name} no implementado` });
};

router.post(
	'/:id/tareas/:tareaId/approve',
	requireActionAccess('proyectos', 'gestionar-tareas'),
	tareaController.approveTarea || notImplemented('approveTarea')
);
router.post(
	'/:id/tareas/:tareaId/reject',
	requireActionAccess('proyectos', 'gestionar-tareas'),
	tareaController.rejectTarea || notImplemented('rejectTarea')
);
router.patch(
	'/:id/tareas/:tareaId/dates',
	requireActionAccess('proyectos', 'gestionar-tareas'),
	tareaController.updateTareaFechas || notImplemented('updateTareaFechas')
);

module.exports = router;
