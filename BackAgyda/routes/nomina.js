const express = require('express');
const router = express.Router();
const c = require('../controllers/nominaController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Nómina es exclusivo de AD; requireActionAccess afina por acción encima de ese rol base.
router.use(authenticateToken, verificarRol(['AD']));

// Configuración global (sueldos, campañas, bonos)
router.get('/config',    requireActionAccess('nomina', 'ver'), c.getConfigGlobal);
router.put('/config',    requireActionAccess('nomina', 'editar-percepciones'), c.updateConfigGlobal);

// Periodos de quincena
router.get('/',                  requireActionAccess('nomina', 'ver'), c.getPeriodos);
router.get('/periodos',          requireActionAccess('nomina', 'ver'), c.getPeriodos);
router.post('/periodos',         requireActionAccess('nomina', 'calcular-periodo'), c.createPeriodo);

// Editar fechas base/corte de un periodo en borrador
router.patch('/periodos/:id/fechas',  requireActionAccess('nomina', 'calcular-periodo'), c.updateFechasPeriodo);
router.delete('/periodos/:id',        requireActionAccess('nomina', 'calcular-periodo'), c.deletePeriodo);

// Cálculo, aprobación, reversión
router.post('/periodos/:id/calcular', requireActionAccess('nomina', 'calcular-periodo'), c.calcularNomina);
router.post('/periodos/:id/aprobar',  requireActionAccess('nomina', 'aprobar-periodo'), c.aprobarPeriodo);
router.post('/periodos/:id/revertir', requireActionAccess('nomina', 'aprobar-periodo'), c.revertirPeriodo);

// Detalle y excepciones de un periodo
router.get('/periodos/:id/detalle',         requireActionAccess('nomina', 'ver'), c.getDetalle);
router.delete('/periodos/:id/detalle/:neusId', requireActionAccess('nomina', 'ajustar-faltas'), c.deleteDetalleEmpleado);
router.get('/periodos/:id/excepciones',  requireActionAccess('nomina', 'ver'), c.getExcepciones);
router.post('/periodos/:id/excepciones', requireActionAccess('nomina', 'ajustar-faltas'), c.createExcepcion);
router.delete('/excepciones/:excId',     requireActionAccess('nomina', 'ajustar-faltas'), c.deleteExcepcion);

// Desglose de faltas/retardos por empleado
router.get('/periodos/:id/desglose-faltas/:neusId', requireActionAccess('nomina', 'ver'), c.getDesgloseFaltas);
// Ventas individuales de un empleado en el periodo
router.get('/periodos/:id/ventas/:neusId', requireActionAccess('nomina', 'ver'), c.getVentasEmpleado);
router.patch('/periodos/:id/dia-asistencia/:neusId', requireActionAccess('nomina', 'ajustar-faltas'), c.patchDiaAsistencia);

// Comisiones y faltas por empleado
router.get('/periodos/:id/comisiones/:neusId', requireActionAccess('nomina', 'ver'), c.getComisiones);
router.put('/periodos/:id/comisiones/:neusId', requireActionAccess('nomina', 'ajustar-faltas'), c.updateComisiones);
router.put('/periodos/:id/faltas/:neusId',     requireActionAccess('nomina', 'ajustar-faltas'), c.updateFaltas);

// Percepciones (sueldo individual por empleado)
router.get('/percepciones/:empleadoId', requireActionAccess('nomina', 'ver'), c.getPercepciones);
router.put('/percepciones/:empleadoId', requireActionAccess('nomina', 'editar-percepciones'), c.updatePercepciones);

// Dashboard
router.get('/dashboard/resumen', requireActionAccess('nomina', 'ver'), c.getDashboardResumen);

// Lista negra de agentes — excluidos de todo cálculo futuro hasta que se quiten
router.get('/agentes-excluidos',              requireActionAccess('nomina', 'ver'), c.getAgentesExcluidos);
router.post('/agentes-excluidos',             requireActionAccess('nomina', 'calcular-periodo'), c.addAgenteExcluido);
router.delete('/agentes-excluidos/:neusId',   requireActionAccess('nomina', 'calcular-periodo'), c.removeAgenteExcluido);
router.delete('/agentes-excluidos',           requireActionAccess('nomina', 'calcular-periodo'), c.clearAgentesExcluidos);
router.post('/periodos/:id/limpiar-excluidos', requireActionAccess('nomina', 'calcular-periodo'), c.limpiarExcluidosDePeriodo);

module.exports = router;
