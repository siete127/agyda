const express = require('express');
const router = express.Router();
const tareaController = require('../controllers/tareaController');
const { authenticateToken } = require('../middleware/auth');

// Montado en un prefijo separado de /api/proyectos (que sí protege sus rutas
// globalmente), así que este router necesita su propio guard.
router.use(authenticateToken);

router.get('/proyectos/:id/tareas', tareaController.getTareas);
router.get('/proyectos/:id/tareas-eliminadas', tareaController.getTareasEliminadas);
router.get('/proyectos/:id/tareas/:tareaId', tareaController.getTareaById);
router.post('/proyectos/:id/tareas', tareaController.createTarea);
router.put('/proyectos/:id/tareas/:tareaId', tareaController.updateTarea);
router.delete('/proyectos/:id/tareas/:tareaId', tareaController.deleteTarea);

// Aprobación/Rechazo y fechas de tareas (con guardas por si faltan métodos)
const notImplemented = (name) => (req, res) => {
	res.status(501).json({ success: false, message: `Handler ${name} no implementado` });
};

router.post(
	'/proyectos/:id/tareas/:tareaId/approve',
	tareaController.approveTarea || notImplemented('approveTarea')
);
router.post(
	'/proyectos/:id/tareas/:tareaId/reject',
	tareaController.rejectTarea || notImplemented('rejectTarea')
);
router.patch(
	'/proyectos/:id/tareas/:tareaId/dates',
	tareaController.updateTareaFechas || notImplemented('updateTareaFechas')
);

module.exports = router;