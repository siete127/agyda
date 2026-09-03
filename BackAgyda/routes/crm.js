const express = require('express');
const router  = express.Router();
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess, requireAnyActionAccess } = require('../middleware/moduleAccess');

const crmContactos   = require('../controllers/crmContactosController');
const crmOpo         = require('../controllers/crmOportunidadesController');
const crmAct         = require('../controllers/crmActividadesController');
const crmInt         = require('../controllers/crmInteraccionesController');
const crmReportes    = require('../controllers/crmReportesController');
const crmCuotas      = require('../controllers/crmCuotasController');
const crmEmails      = require('../controllers/crmEmailsController');
const crmAuto        = require('../controllers/crmAutomatizacionesController');
const crmPortal      = require('../controllers/crmPortalController');
const crmAutomatizacionesReglas = require('../controllers/crmAutomatizacionesReglasController');
const crmCotizaciones    = require('../controllers/crmCotizacionesController');
const crmLeadMarketing   = require('../controllers/crmLeadMarketingController');
const crmRecordatorios     = require('../controllers/crmRecordatoriosController');
const crmRecordatoriosCron = require('../controllers/crmRecordatoriosCronController');
const crmDocumentosCliente = require('../controllers/crmDocumentosClienteController');
const crmEncuestasSeguimiento = require('../controllers/crmEncuestasSeguimientoController');
const crmEncuestasSeguimientoCron = require('../controllers/crmEncuestasSeguimientoCronController');
const crmProyecto = require('../controllers/crmProyectoController');
const { uploadCrmDocumento } = require('../middleware/crmDocumentoUpload');

// ── Lead desde página de marketing (público, sin auth) ─────────────────────
router.post('/lead-marketing', crmLeadMarketing.recibirLeadMarketing);
router.post('/lead-chatbot', crmLeadMarketing.recibirLeadChatbot);
// Alias del formulario de contacto de "Pagina de Intranet_1" — mismo payload
// que lead-marketing (nombreCompleto, empresa, giroEmpresa, email, telefono, mensaje).
router.post('/contacto', crmLeadMarketing.recibirLeadMarketing);

// ��─ Contactos ──────────────────────────────────────────
router.get('/contactos',        authenticateToken, crmContactos.getAll);
router.post('/contactos',       authenticateToken, crmContactos.create);
router.get('/contactos/:id',    authenticateToken, crmContactos.getById);
router.put('/contactos/:id',    authenticateToken, crmContactos.update);
router.delete('/contactos/:id', authenticateToken, verificarRol(['AD']), crmContactos.delete);

// ── Expediente de cliente (módulo Atención al Cliente, sobre CRM_CONTACTOS) ──
router.put('/contactos/:id/alta-cliente', authenticateToken, requireActionAccess('atencion-cliente', 'clientes-gestionar'), crmContactos.altaCliente);
router.get('/contactos/:id/expediente',   authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), crmContactos.getExpediente);

// ── Actividades globales ───────────────────────────────
router.get('/actividades',      authenticateToken, crmOpo.getAllActividades);

// ── Oportunidades ──────────────────────────────────────
router.get('/oportunidades',                   authenticateToken, crmOpo.getAll);
router.post('/oportunidades',                  authenticateToken, crmOpo.create);
router.get('/oportunidades/:id',               authenticateToken, crmOpo.getById);
router.put('/oportunidades/:id',               authenticateToken, crmOpo.update);
router.delete('/oportunidades/:id',            authenticateToken, crmOpo.delete);
router.get('/oportunidades/:id/actividades',   authenticateToken, crmOpo.getActividades);
router.get('/oportunidades/:id/interacciones', authenticateToken, crmOpo.getInteracciones);
router.get('/oportunidades/:opoId/emails',     authenticateToken, crmEmails.getByOpo);
router.post('/oportunidades/:id/generar-proyecto', authenticateToken, requireActionAccess('crm', 'seguimiento-ver'), crmProyecto.generarProyectoDesdeOportunidad);

// ── Actividades (crear / editar / eliminar) ────────────
router.post('/actividades',       authenticateToken, crmAct.create);
router.put('/actividades/:id',    authenticateToken, crmAct.update);
router.delete('/actividades/:id', authenticateToken, crmAct.delete);

// ── Interacciones ──────────────────────────────────────
router.post('/interacciones',       authenticateToken, crmInt.create);
router.put('/interacciones/:id',    authenticateToken, crmInt.update);
router.delete('/interacciones/:id', authenticateToken, crmInt.delete);

// ── Emails ─────────────────────────────────────────────
router.post('/emails/send', authenticateToken, crmEmails.send);

// ── Reportes ───────────────────────────────────────────
router.get('/reportes/kpis',           authenticateToken, crmReportes.getKpis);
router.get('/reportes/embudo',         authenticateToken, crmReportes.getEmbudo);
router.get('/reportes/forecast',       authenticateToken, crmReportes.getForecast);
router.get('/reportes/por-responsable',authenticateToken, crmReportes.getPorResponsable);

// ── Cuotas ─────────────────────────────────────────────
router.get('/cuotas',        authenticateToken, crmCuotas.getAll);
router.get('/cuotas/mia',    authenticateToken, crmCuotas.getMia);
router.post('/cuotas',       authenticateToken, verificarRol(['AD']), crmCuotas.upsert);
router.delete('/cuotas/:id', authenticateToken, verificarRol(['AD']), crmCuotas.delete);

// ── Automatizaciones ───────────────────────────────────
router.post('/automatizaciones/run', authenticateToken, verificarRol(['AD']), crmAuto.runNow);
router.get('/automatizaciones/reglas', authenticateToken, verificarRol(['AD']), crmAutomatizacionesReglas.getAll)
router.post('/automatizaciones/reglas', authenticateToken, verificarRol(['AD']), crmAutomatizacionesReglas.create)
router.put('/automatizaciones/reglas/:id', authenticateToken, verificarRol(['AD']), crmAutomatizacionesReglas.update)
router.delete('/automatizaciones/reglas/:id', authenticateToken, verificarRol(['AD']), crmAutomatizacionesReglas.delete)

// ── Portal del cliente ─────────────────────────────────
router.post('/portal/invitar',  authenticateToken, verificarRol(['AD']), crmPortal.invitar);
router.get('/portal/datos',     crmPortal.getPortal);   // público con token
router.get('/portal/documentos/:docId/download', crmPortal.downloadDocumentoPortal); // público con token en query

// ── Seguimiento a Clientes: Recordatorios de pago ──────
router.get('/recordatorios', authenticateToken, requireAnyActionAccess([['crm','seguimiento-ver'],['atencion-cliente','clientes-ver']]), crmRecordatorios.listByContacto);
router.post('/recordatorios', authenticateToken, requireAnyActionAccess([['crm','seguimiento-recordatorios'],['atencion-cliente','clientes-pagos']]), crmRecordatorios.create);
router.post('/recordatorios/:id/cancelar', authenticateToken, requireAnyActionAccess([['crm','seguimiento-recordatorios'],['atencion-cliente','clientes-pagos']]), crmRecordatorios.cancel);
router.post('/recordatorios/:id/confirmar-pago', authenticateToken, requireActionAccess('atencion-cliente','clientes-pagos'), crmRecordatorios.confirmarPago);
router.delete('/recordatorios/:id', authenticateToken, requireAnyActionAccess([['crm','seguimiento-recordatorios'],['atencion-cliente','clientes-pagos']]), crmRecordatorios.delete);
router.post('/recordatorios/run-cron', authenticateToken, verificarRol(['AD']), crmRecordatoriosCron.runNow);

// ── Seguimiento a Clientes: Documentos de cliente ──────
// Aceptan permiso legado de CRM Interno ('crm'/'seguimiento-*') O el nuevo de
// Atención al Cliente ('atencion-cliente'/'clientes-*') mientras coexisten las
// dos UIs (ver Fase 7 del plan de migración: se retira 'crm' al cerrar).
router.post('/contactos/:id/documentos', authenticateToken, requireAnyActionAccess([['crm','seguimiento-documentos'],['atencion-cliente','clientes-documentos']]), uploadCrmDocumento.single('file'), crmDocumentosCliente.upload);
router.get('/contactos/:id/documentos', authenticateToken, requireAnyActionAccess([['crm','seguimiento-ver'],['atencion-cliente','clientes-ver']]), crmDocumentosCliente.listByContacto);
router.get('/documentos/:docId/download', authenticateToken, requireAnyActionAccess([['crm','seguimiento-ver'],['atencion-cliente','clientes-ver']]), crmDocumentosCliente.download);
router.patch('/documentos/:docId/portal', authenticateToken, requireAnyActionAccess([['crm','seguimiento-documentos'],['atencion-cliente','clientes-documentos']]), crmDocumentosCliente.toggleVisiblePortal);
router.delete('/documentos/:docId', authenticateToken, requireAnyActionAccess([['crm','seguimiento-documentos'],['atencion-cliente','clientes-documentos']]), crmDocumentosCliente.delete);

// ── Seguimiento a Clientes: Encuestas enviadas a contacto ──
router.get('/encuestas-disponibles', authenticateToken, requireAnyActionAccess([['crm','seguimiento-encuestas'],['atencion-cliente','clientes-encuestas']]), crmEncuestasSeguimiento.listEncuestasPublicasDisponibles);
router.post('/contactos/:id/encuestas/enviar', authenticateToken, requireAnyActionAccess([['crm','seguimiento-encuestas'],['atencion-cliente','clientes-encuestas']]), crmEncuestasSeguimiento.enviar);
router.get('/contactos/:id/encuestas-enviadas', authenticateToken, requireAnyActionAccess([['crm','seguimiento-ver'],['atencion-cliente','clientes-ver']]), crmEncuestasSeguimiento.listByContacto);
router.post('/encuestas-seguimiento/run-cron', authenticateToken, verificarRol(['AD']), crmEncuestasSeguimientoCron.runNow);

// ── Cotizaciones ────────────────────────────────────────
router.get('/oportunidades/:opoId/cotizaciones', authenticateToken, crmCotizaciones.listByOpo);
router.get('/cotizaciones/:id', authenticateToken, crmCotizaciones.getById);
router.post('/cotizaciones', authenticateToken, crmCotizaciones.create);
router.put('/cotizaciones/:id', authenticateToken, crmCotizaciones.update);
router.delete('/cotizaciones/:id', authenticateToken, crmCotizaciones.softDelete);
router.post('/cotizaciones/:id/enviar', authenticateToken, crmCotizaciones.enviar);
// aprobar/rechazar: sin authenticateToken a propósito — las usa el portal
// público del cliente (CRMPortalPage), que valida portalToken en el body
// (ahora obligatorio en el controller, ver crmCotizacionesController.js).
router.post('/cotizaciones/:id/aprobar', crmCotizaciones.aprobar);
router.post('/cotizaciones/:id/rechazar', crmCotizaciones.rechazar);
// aprobación interna (por un gerente en el CRM) — con sesión + permiso.
router.post('/cotizaciones/:id/aprobar-interna', authenticateToken, requireActionAccess('crm', 'cotizacion-aprobar'), crmCotizaciones.aprobarInterna);
// pdf: solo se usa desde el CRM interno (no desde el portal público) —
// requiere sesión.
router.get('/cotizaciones/:id/pdf', authenticateToken, crmCotizaciones.getPdf);

module.exports = router;
