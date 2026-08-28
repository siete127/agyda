const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const ticketSlaCron = require('../controllers/ticketSlaCronController');
const { uploadEvidence } = require('../middleware/evidenceUpload');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const apiKeyAuth = require('../middleware/apiKeyAuth');

// Sin sesión: se llama desde un link de calificación que no depende de estar logueado
router.post('/:id/satisfaccion', ticketController.registrarSatisfaccion);

// Sin sesión JWT: autenticado por API-key para creación de tickets desde sistemas externos
router.post('/api/crear', apiKeyAuth, ticketController.createTicketFromApi);

router.use(authenticateToken);

// Rutas estáticas ANTES de /:id para evitar que Express las intercepte como parámetro
// Staff TI (catálogo de acciones bajo el módulo 'staff-ti', aunque comparte este archivo)
router.get('/ti/staff', requireActionAccess('staff-ti', 'ver'), ticketController.getStaffTI);
// Reasignar área/nivel es una decisión administrativa: solo AD, no cualquiera con acceso a staff-ti
router.post('/ti/staff', verificarRol(['AD']), ticketController.actualizarStaffTI);

// API keys para la creación pública de tickets (solo AD)
router.get('/api-keys', verificarRol(['AD']), ticketController.listApiKeys);
router.post('/api-keys', verificarRol(['AD']), ticketController.createApiKey);
router.delete('/api-keys/:id', verificarRol(['AD']), ticketController.revokeApiKey);

// Grupos de soporte (nombre descriptivo para AREA+NIVEL)
router.get('/grupos-soporte', requireActionAccess('tickets', 'ver'), ticketController.getGruposSoporte);
router.post('/grupos-soporte', verificarRol(['AD']), ticketController.createGrupoSoporte);
router.put('/grupos-soporte/:id', verificarRol(['AD']), ticketController.actualizarGrupoSoporte);
router.delete('/grupos-soporte/:id', verificarRol(['AD']), ticketController.eliminarGrupoSoporte);

// Notificaciones
router.get('/notificaciones', ticketController.getNotificaciones);
router.post('/notificaciones/:id/leer', ticketController.marcarNotificacionLeida);

// Reportes
router.get('/reportes/tickets-satisfaccion', requireActionAccess('tickets', 'ver'), ticketController.getReporteSatisfaccion);
router.get('/reportes/tickets-satisfaccion.csv', requireActionAccess('tickets', 'ver'), ticketController.getReporteSatisfaccionCSV);

// SLA (reglas configurables + reporte de cumplimiento)
router.get('/sla/reglas', requireActionAccess('tickets', 'ver'), ticketController.listReglasSla);
router.post('/sla/reglas', requireActionAccess('tickets', 'editar'), ticketController.crearReglaSla);
router.patch('/sla/reglas/:id', requireActionAccess('tickets', 'editar'), ticketController.actualizarReglaSla);
router.delete('/sla/reglas/:id', requireActionAccess('tickets', 'editar'), ticketController.eliminarReglaSla);
router.get('/sla/reporte', requireActionAccess('tickets', 'ver'), ticketController.getReporteSla);
router.post('/sla/run-cron', verificarRol(['AD']), ticketSlaCron.runNow);

// Configuración de escalamiento automático (fila única global)
router.get('/escalamiento-config', requireActionAccess('configuracion', 'ver'), ticketController.getEscalamientoConfig);
router.put('/escalamiento-config', requireActionAccess('configuracion', 'configurar'), ticketController.actualizarEscalamientoConfig);

// Configuración de envío de encuesta de satisfacción (prioridad mínima por área)
router.get('/encuesta-config', requireActionAccess('configuracion', 'ver'), ticketController.getEncuestaConfig);
router.put('/encuesta-config', requireActionAccess('configuracion', 'configurar'), ticketController.actualizarEncuestaConfig);

// Ficha 360° del usuario (identificación al atender ticket/chat)
router.get('/ficha-usuario/:userId', requireActionAccess('tickets', 'ver'), ticketController.getFichaUsuario);

// Catálogos (clasificación, categorías, códigos de cierre)
router.get('/categorias', requireActionAccess('tickets', 'ver'), ticketController.getCategorias);
router.get('/codigos-cierre', requireActionAccess('tickets', 'ver'), ticketController.getCodigosCierre);

// CRUD principal
router.get('/', requireActionAccess('tickets', 'ver'), ticketController.getTickets);
router.post('/', requireActionAccess('tickets', 'crear'), ticketController.createTicket);
router.get('/:id', requireActionAccess('tickets', 'ver'), ticketController.getTicketById);
router.put('/:id', requireActionAccess('tickets', 'editar'), ticketController.updateTicket);
router.delete('/:id', requireActionAccess('tickets', 'eliminar'), ticketController.deleteTicket);

// Comentarios
router.get('/:id/comentarios', requireActionAccess('tickets', 'ver'), ticketController.getComentarios);
router.post('/:id/comentarios', requireActionAccess('tickets', 'gestionar-estado'), ticketController.addComentario);

// Acciones
router.post('/:id/transferir', requireActionAccess('tickets', 'gestionar-estado'), ticketController.transferirTicket);
router.post('/:id/estado', requireActionAccess('tickets', 'gestionar-estado'), ticketController.cambiarEstado);
router.post('/:id/espera', requireActionAccess('tickets', 'gestionar-estado'), ticketController.ponerEnEspera);
router.post('/:id/salir-espera', requireActionAccess('tickets', 'gestionar-estado'), ticketController.salirDeEspera);
router.post('/:id/escalar', requireActionAccess('tickets', 'gestionar-estado'), ticketController.escalarTicket);
router.post('/:id/resolver', requireActionAccess('tickets', 'gestionar-estado'), ticketController.resolverTicket);
router.post('/:id/validar', requireActionAccess('tickets', 'gestionar-estado'), ticketController.validarResolucion);

// Evidencias
router.post('/:id/evidencias', requireActionAccess('tickets', 'gestionar-estado'), uploadEvidence.single('evidencia'), ticketController.uploadEvidencia);
router.delete('/:id/evidencias/:histId', requireActionAccess('tickets', 'gestionar-estado'), ticketController.deleteEvidencia);

module.exports = router;
