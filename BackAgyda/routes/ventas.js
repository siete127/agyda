const router = require('express').Router();
const vc     = require('../controllers/ventasController');
const { verifyVentasToken, requireAdmin, upload } = vc;

/* ── Auth ────────────────────────────── */
router.post('/auth/login',           vc.loginVentas);
router.post('/auth/intranet-sso',    vc.intranetSSOVentas);

/* ── Agente: campañas ─────────────────── */
router.get('/agent/campaigns/all',   verifyVentasToken, vc.getAllCampaignsForAgent);
router.get('/agent/campaigns',       verifyVentasToken, vc.getAssignedCampaigns);

/* ── Agente: ventas ───────────────────── */
router.get('/agent/sales',           verifyVentasToken, vc.getAgentSalesToday);
router.post('/agent/sales',          verifyVentasToken, vc.createSale);
router.post('/agent/upload-evidence',verifyVentasToken, upload.single('evidencia'), vc.uploadEvidence);
router.get('/agent/check-phone',     verifyVentasToken, vc.checkPhone);

/* ── Agente: agendadas ────────────────── */
router.get('/agent/sales/scheduled',               verifyVentasToken, vc.getScheduledSales);
router.put('/agent/sales/scheduled/complete/:id',  verifyVentasToken, vc.completeScheduledSale);
router.delete('/agent/sales/scheduled/:id',        verifyVentasToken, vc.deleteScheduledSale);

/* ── Admin: estadísticas ──────────────── */
router.get('/admin/stats/day',       verifyVentasToken, requireAdmin, vc.getDailyStats);
router.get('/admin/stats/week',      verifyVentasToken, requireAdmin, vc.getWeeklyStats);
router.get('/admin/stats/month',     verifyVentasToken, requireAdmin, vc.getMonthlyStats);
router.get('/admin/stats/dynamic/day',   verifyVentasToken, requireAdmin, vc.getDailyStatsDynamic);
router.get('/admin/stats/dynamic/week',  verifyVentasToken, requireAdmin, vc.getWeeklyStatsDynamic);
router.get('/admin/stats/dynamic/month', verifyVentasToken, requireAdmin, vc.getMonthlyStatsDynamic);

/* ── Admin: todas las ventas ──────────── */
router.get('/admin/sales/all',       verifyVentasToken, requireAdmin, vc.getAllSales);
router.put('/admin/sales/:id',       verifyVentasToken, requireAdmin, vc.updateSale);
router.delete('/admin/sales/:id',    verifyVentasToken, requireAdmin, vc.deleteSale);

/* ── Admin: agendadas ─────────────────── */
router.get('/admin/scheduled-sales', verifyVentasToken, requireAdmin, vc.getAllScheduledSales);

/* ── Admin: agentes ───────────────────── */
router.get('/admin/agents',          verifyVentasToken, requireAdmin, vc.getAgentes);
router.post('/admin/agents',         verifyVentasToken, requireAdmin, vc.createAgente);
router.put('/admin/agents/:id',      verifyVentasToken, requireAdmin, vc.updateAgente);
router.delete('/admin/agents/:id',   verifyVentasToken, requireAdmin, vc.deleteAgente);
router.put('/admin/toggle/:id',      verifyVentasToken, requireAdmin, vc.toggleAgente);

/* ── Admin: campañas ──────────────────── */
router.get('/admin/campaigns',                          verifyVentasToken, vc.getCampanas);
router.post('/admin/campaigns',                         verifyVentasToken, requireAdmin, vc.createCampana);
router.put('/admin/campaigns/toggle/:id',               verifyVentasToken, requireAdmin, vc.toggleCampana);
router.put('/admin/campaigns/:id',                      verifyVentasToken, requireAdmin, vc.updateCampana);
router.get('/admin/campaigns/:id/statuses',             verifyVentasToken, requireAdmin, vc.getCampanaStatuses);
router.post('/admin/campaigns/:id/statuses',            verifyVentasToken, requireAdmin, vc.addCampanaStatus);
router.put('/admin/campaigns/:id/statuses/:statusId/toggle', verifyVentasToken, requireAdmin, vc.toggleCampanaStatus);
router.put('/admin/campaigns/:id/statuses/:statusId',            verifyVentasToken, requireAdmin, vc.updateCampanaStatus);
router.delete('/admin/campaigns/:id/statuses/:statusId',     verifyVentasToken, requireAdmin, vc.deleteCampanaStatus);

/* ── Agente: tipificaciones ───────────────── */
router.post('/agent/tipificaciones',       verifyVentasToken, vc.createTipificacion);
router.get('/agent/tipificaciones',        verifyVentasToken, vc.getTipificaciones);
router.delete('/agent/tipificaciones/:id', verifyVentasToken, vc.deleteTipificacion);

/* ── Admin: procesos de campaña ───────────── */
router.get('/admin/campaigns/:id/procesos',               verifyVentasToken, vc.getProcesosCampana);
router.post('/admin/campaigns/:id/procesos',              verifyVentasToken, requireAdmin, vc.addProcesoCampana);
router.put('/admin/campaigns/:id/procesos/:pid',          verifyVentasToken, requireAdmin, vc.updateProcesoCampana);
router.put('/admin/campaigns/:id/procesos/:pid/toggle',   verifyVentasToken, requireAdmin, vc.toggleProcesoCampana);
router.delete('/admin/campaigns/:id/procesos/:pid',       verifyVentasToken, requireAdmin, vc.deleteProcesoCampana);

/* ── Agente: seguimiento de ventas ─────────── */
router.get('/agent/seguimiento',                 verifyVentasToken, vc.getSeguimientoAgente);
router.get('/agent/ventas/:ventaId/seguimiento', verifyVentasToken, vc.getSeguimientoVenta);
router.post('/agent/ventas/:ventaId/seguimiento',verifyVentasToken, vc.createSeguimiento);
router.delete('/agent/seguimiento/:id',          verifyVentasToken, vc.deleteSeguimiento);
router.post('/agent/seguimiento/evidencia',      verifyVentasToken, vc.upload.single('evidencia'), vc.uploadEvidenciaSeguimiento);

/* ── CRM Base de datos ─────────────────────── */
/* Admin: importaciones */
router.get('/admin/crm/importaciones',               verifyVentasToken, requireAdmin, vc.getCRMImportaciones);
router.post('/admin/crm/importaciones',              verifyVentasToken, requireAdmin, vc.createCRMImportacion);
router.delete('/admin/crm/importaciones/:id',        verifyVentasToken, requireAdmin, vc.deleteCRMImportacion);
router.post('/admin/crm/importaciones/:id/registros',verifyVentasToken, requireAdmin, vc.addCRMRegistros);
router.get('/admin/crm/importaciones/:id/registros', verifyVentasToken, requireAdmin, vc.getCRMRegistros);
router.post('/admin/crm/importaciones/:id/confirmar',verifyVentasToken, requireAdmin, vc.confirmarCRMImportacion);
router.get('/admin/crm/importaciones/:id/campos',    verifyVentasToken, requireAdmin, vc.getCRMCamposConfig);
router.post('/admin/crm/importaciones/:id/campos',   verifyVentasToken, requireAdmin, vc.saveCRMCamposConfig);

/* Admin: gestiones (autenticado) */
router.post('/admin/crm/gestiones',                  verifyVentasToken, vc.registrarGestionCRM);
router.put('/admin/crm/interacciones',               verifyVentasToken, requireAdmin, vc.updateCRMInteraccion);

/* Admin: importar lista VICIdial (.txt TSV) */
router.post('/admin/crm/vicidial/importar',          verifyVentasToken, requireAdmin, vc.importarListaVICIdial);
router.get('/admin/crm/vicidial/listas',             verifyVentasToken, requireAdmin, vc.getListasVICIdial);

/* Admin: reportes descargables */
router.get('/admin/crm/reportes/resubir',            verifyVentasToken, requireAdmin, vc.reporteListaResubir);
router.get('/admin/crm/reportes/gestiones',          verifyVentasToken, requireAdmin, vc.reporteGestionesCRM);
router.get('/admin/crm/reportes/ventas',             verifyVentasToken, requireAdmin, vc.reporteVentas);
router.get('/admin/crm/reportes/base-completa',      verifyVentasToken, requireAdmin, vc.reporteBaseCompleta);

/* Público: CRM desde VICIdial (sin token, abrir desde marcador) */
router.get('/public/crm/cliente',    vc.getCRMCliente);
router.post('/public/crm/gestion',   vc.registrarGestionCRMPublica);
router.post('/public/crm/tipificacion', vc.registrarTipificacionCRMPublica);

module.exports = router;
