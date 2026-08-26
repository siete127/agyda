const express = require('express');
const router = express.Router();
const controller = require('../controllers/finanzasController');
const auth = require('../middleware/auth');

router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/ingresos', auth.authenticateToken, controller.listIngresos);
router.post('/ingresos', auth.authenticateToken, controller.crearIngreso);
router.delete('/ingresos/:id', auth.authenticateToken, controller.eliminarIngreso);
router.get('/egresos', auth.authenticateToken, controller.listEgresos);
router.post('/egresos', auth.authenticateToken, controller.crearEgreso);
router.delete('/egresos/:id', auth.authenticateToken, controller.eliminarEgreso);
router.get('/cxc', auth.authenticateToken, controller.listCxc);
router.post('/cxc', auth.authenticateToken, controller.crearCxc);
router.patch('/cxc/:id/estatus', auth.authenticateToken, controller.actualizarEstatusCxc);
router.delete('/cxc/:id', auth.authenticateToken, controller.eliminarCxc);
router.get('/cxp', auth.authenticateToken, controller.listCxp);
router.post('/cxp', auth.authenticateToken, controller.crearCxp);
router.patch('/cxp/:id/estatus', auth.authenticateToken, controller.actualizarEstatusCxp);
router.delete('/cxp/:id', auth.authenticateToken, controller.eliminarCxp);

// Bancos
router.get('/bancos/cuentas', auth.authenticateToken, controller.listCuentas);
router.post('/bancos/cuentas', auth.authenticateToken, controller.crearCuenta);
router.delete('/bancos/cuentas/:id', auth.authenticateToken, controller.eliminarCuenta);
router.get('/bancos/cuentas/:id/movimientos', auth.authenticateToken, controller.listMovimientos);
router.post('/bancos/cuentas/:id/movimientos', auth.authenticateToken, controller.crearMovimiento);
router.delete('/bancos/movimientos/:movId', auth.authenticateToken, controller.eliminarMovimiento);

// Reportes financieros
router.get('/reportes', auth.authenticateToken, controller.getReporteConsolidado);

// Presupuestos
router.get('/presupuestos', auth.authenticateToken, controller.listPresupuestos);
router.post('/presupuestos', auth.authenticateToken, controller.guardarPresupuesto);
router.delete('/presupuestos/:id', auth.authenticateToken, controller.eliminarPresupuesto);

module.exports = router;
