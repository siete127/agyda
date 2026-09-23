const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalClienteController');
const { authenticateToken } = require('../middleware/auth');
const { requirePortalCliente } = require('../middleware/portalCliente');

// Portal del cliente (login real, NEUS_TIPOUSUARIO='CL') — cada ruta exige
// sesión + que el usuario tenga un contacto vinculado (CONT_NEUS_ID).
router.use(authenticateToken, requirePortalCliente);

router.get('/resumen', ctrl.getResumen);
router.get('/proyectos', ctrl.getProyectos);
router.get('/cotizaciones', ctrl.getCotizaciones);
router.get('/facturas', ctrl.getFacturas);
router.get('/documentos', ctrl.getDocumentos);
router.get('/documentos/:id/download', ctrl.descargarDocumento);
router.get('/citas', ctrl.getCitas);
router.get('/citas/historial', ctrl.getCitasHistorial);
router.post('/citas/:id/confirmar', ctrl.confirmarCita);
router.post('/citas/:id/solicitar-cambio', ctrl.solicitarCambioCita);
router.get('/incidencias', ctrl.getIncidencias);
router.post('/incidencias', ctrl.crearIncidencia);

module.exports = router;
