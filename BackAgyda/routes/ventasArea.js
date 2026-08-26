const express = require('express');
const router = express.Router();
const controller = require('../controllers/ventasAreaController');
const auth = require('../middleware/auth');

router.get('/metas', auth.authenticateToken, controller.listMetas);
router.post('/metas', auth.authenticateToken, controller.crearMeta);
router.delete('/metas/:id', auth.authenticateToken, controller.eliminarMeta);
router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/asesores', auth.authenticateToken, controller.listAsesores);
router.get('/asesores/:id/perfil', auth.authenticateToken, controller.getPerfilAsesor);
router.get('/reportes-resultados', auth.authenticateToken, controller.getReporteResultados);
router.get('/prospeccion', auth.authenticateToken, controller.getResumenProspeccion);
router.get('/comisiones', auth.authenticateToken, controller.getKpisComisiones);
router.get('/incentivos/reglas', auth.authenticateToken, controller.listReglasIncentivo);
router.post('/incentivos/reglas', auth.authenticateToken, controller.crearReglaIncentivo);
router.post('/incentivos/reglas/probar', auth.authenticateToken, controller.probarFormulaIncentivo);
router.patch('/incentivos/reglas/:id', auth.authenticateToken, controller.actualizarReglaIncentivo);
router.delete('/incentivos/reglas/:id', auth.authenticateToken, controller.eliminarReglaIncentivo);
router.get('/incentivos', auth.authenticateToken, controller.getKpisIncentivos);

module.exports = router;
