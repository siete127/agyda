const express = require('express');
const router = express.Router();
const controller = require('../controllers/evaluacionDesempenoController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Cualquier empleado ve su propio historial de evaluaciones
router.get('/mis', authenticateToken, controller.getMisEvaluaciones);
router.get('/criterios', authenticateToken, controller.getCriterios);

// RH/admin: ciclos, listado y CRUD de evaluaciones
router.get('/ciclos', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'ver'), controller.getCiclos);
router.post('/ciclos', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'crear'), controller.createCiclo);
router.patch('/ciclos/:id/activo', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'crear'), controller.toggleCicloActivo);

router.get('/', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'ver'), controller.getAll);
router.post('/', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'crear'), controller.crear);
router.put('/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'crear'), controller.actualizar);
router.patch('/:id/finalizar', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('evaluacion-desempeno', 'crear'), controller.finalizar);

module.exports = router;
