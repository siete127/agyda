const express = require('express');
const router = express.Router();
const controller = require('../controllers/ventasAreaController');
const auth = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Mutación de fórmulas de comisión/incentivo: mismo guard que personalizacion
// (routes/personalizacion.js) — antes estas rutas de incentivos solo exigían
// sesión iniciada, sin checar rol ni permiso, aunque el frontend ocultara la UI
// a no-admins.
const soloAdminConfig = [auth.authenticateToken, auth.verificarRol(['AD']), requireActionAccess('configuracion', 'configurar')];

// Metas de todos los asesores/campañas — requiere ver-metas (supervisor / a quien
// se le dé la función). Las metas PROPIAS de un agente van por /mis-metas, sin ese permiso.
router.get('/metas', auth.authenticateToken, requireActionAccess('ventas-area', 'ver-metas'), controller.listMetas);
router.post('/metas', auth.authenticateToken, requireActionAccess('ventas-area', 'gestionar-metas'), controller.crearMeta);
router.delete('/metas/:id', auth.authenticateToken, requireActionAccess('ventas-area', 'gestionar-metas'), controller.eliminarMeta);
router.get('/mis-metas', auth.authenticateToken, controller.getMisMetas);
// Desglose de tiempos de pausa de HOY de la(s) persona(s) de una meta — visible
// para cualquier usuario autenticado (mismo dato que el reporte de pausas).
router.get('/metas/:id/pausas', auth.authenticateToken, controller.getMetaPausas);
router.get('/campanas', auth.authenticateToken, requireActionAccess('ventas-area', 'gestionar-metas'), controller.listCampanas);
router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/asesores', auth.authenticateToken, controller.listAsesores);
router.get('/asesores/:id/perfil', auth.authenticateToken, controller.getPerfilAsesor);
router.get('/reportes-resultados', auth.authenticateToken, controller.getReporteResultados);
router.get('/prospeccion', auth.authenticateToken, controller.getResumenProspeccion);
router.get('/comisiones', auth.authenticateToken, controller.getKpisComisiones);
router.get('/comisiones/reglas', auth.authenticateToken, controller.listReglasComision);
router.post('/comisiones/reglas', ...soloAdminConfig, controller.crearReglaComision);
router.post('/comisiones/reglas/probar', ...soloAdminConfig, controller.probarFormulaComision);
router.patch('/comisiones/reglas/:id', ...soloAdminConfig, controller.actualizarReglaComision);
router.delete('/comisiones/reglas/:id', ...soloAdminConfig, controller.eliminarReglaComision);
router.get('/incentivos/reglas', auth.authenticateToken, controller.listReglasIncentivo);
router.post('/incentivos/reglas', ...soloAdminConfig, controller.crearReglaIncentivo);
router.post('/incentivos/reglas/probar', ...soloAdminConfig, controller.probarFormulaIncentivo);
router.patch('/incentivos/reglas/:id', ...soloAdminConfig, controller.actualizarReglaIncentivo);
router.delete('/incentivos/reglas/:id', ...soloAdminConfig, controller.eliminarReglaIncentivo);
router.get('/incentivos', auth.authenticateToken, controller.getKpisIncentivos);

module.exports = router;
