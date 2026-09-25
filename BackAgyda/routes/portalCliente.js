const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalClienteController');
const usuariosCtrl = require('../controllers/portalUsuariosController');
const { authenticateToken } = require('../middleware/auth');
const { requirePortalCliente, requirePortalAction } = require('../middleware/portalCliente');

// Portal del cliente (login real, NEUS_TIPOUSUARIO='CL') — cada ruta exige
// sesión + que el usuario tenga un registro en PORTAL_USUARIOS (empresa +
// sub-rol). Cada endpoint exige además la acción de su sub-rol correspondiente.
router.use(authenticateToken, requirePortalCliente);

router.get('/mis-acciones', ctrl.getMisAcciones);
router.get('/notificaciones', ctrl.getNotificaciones);
router.post('/notificaciones/marcar-todas-leidas', ctrl.marcarTodasNotificacionesLeidas);
router.post('/notificaciones/:id/marcar-leida', ctrl.marcarNotificacionLeida);

router.get('/resumen', requirePortalAction('ver-resumen'), ctrl.getResumen);
router.get('/productos-servicios', requirePortalAction('ver-resumen'), ctrl.getProductosServicios);
router.get('/catalogo-productos-servicios', requirePortalAction('ver-cotizaciones'), ctrl.getCatalogoProductosServicios);
router.post('/solicitar-cotizacion', requirePortalAction('ver-cotizaciones'), ctrl.solicitarCotizacion);
router.get('/proyectos', requirePortalAction('ver-proyectos'), ctrl.getProyectos);
router.get('/cotizaciones', requirePortalAction('ver-cotizaciones'), ctrl.getCotizaciones);
router.get('/facturas', requirePortalAction('ver-facturas'), ctrl.getFacturas);
router.get('/facturas/:id/documento/:formato', requirePortalAction('descargar-documentos'), ctrl.descargarFacturaDocumento);
router.get('/documentos', requirePortalAction('descargar-documentos'), ctrl.getDocumentos);
router.get('/documentos/:id/download', requirePortalAction('descargar-documentos'), ctrl.descargarDocumento);
router.get('/citas', requirePortalAction('ver-citas'), ctrl.getCitas);
router.get('/citas/historial', requirePortalAction('ver-citas'), ctrl.getCitasHistorial);
router.post('/citas/:id/confirmar', requirePortalAction('gestionar-citas'), ctrl.confirmarCita);
router.post('/citas/:id/solicitar-cambio', requirePortalAction('gestionar-citas'), ctrl.solicitarCambioCita);
router.get('/incidencias', requirePortalAction('ver-incidencias'), ctrl.getIncidencias);
router.post('/incidencias', requirePortalAction('crear-incidencias'), ctrl.crearIncidencia);

// Gestión de usuarios de la propia empresa (solo sub-roles con gestionar-usuarios).
router.get('/subroles-disponibles', requirePortalAction('gestionar-usuarios'), usuariosCtrl.listarSubrolesDisponibles);
router.get('/usuarios', requirePortalAction('gestionar-usuarios'), usuariosCtrl.listar);
router.post('/usuarios', requirePortalAction('gestionar-usuarios'), usuariosCtrl.crear);
router.put('/usuarios/:id', requirePortalAction('gestionar-usuarios'), usuariosCtrl.actualizar);
router.delete('/usuarios/:id', requirePortalAction('gestionar-usuarios'), usuariosCtrl.eliminar);

module.exports = router;
