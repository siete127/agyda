const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { uploadEvidence } = require('../middleware/evidenceUpload');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Sin sesión: se llama desde un link de calificación que no depende de estar logueado
router.post('/:id/satisfaccion', ticketController.registrarSatisfaccion);

router.use(authenticateToken);

// Rutas estáticas ANTES de /:id para evitar que Express las intercepte como parámetro
// Staff TI (catálogo de acciones bajo el módulo 'staff-ti', aunque comparte este archivo)
router.get('/ti/staff', requireActionAccess('staff-ti', 'ver'), ticketController.getStaffTI);
router.post('/ti/staff', requireActionAccess('staff-ti', 'actualizar'), ticketController.actualizarStaffTI);

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

// Evidencias
router.post('/:id/evidencias', requireActionAccess('tickets', 'gestionar-estado'), uploadEvidence.single('evidencia'), ticketController.uploadEvidencia);
router.delete('/:id/evidencias/:histId', requireActionAccess('tickets', 'gestionar-estado'), ticketController.deleteEvidencia);

module.exports = router;
