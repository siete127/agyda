const express = require('express');
const router = express.Router();
const livechatController = require('../controllers/livechatController');
const livechatCampanasController = require('../controllers/livechatCampanasController');
const livechatInternoController = require('../controllers/livechatInternoController');
const { authenticateToken, authenticateTokenOptional } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Autenticado — cualquier empleado logueado inicia un chat de Soporte TI con
// su identidad real (a diferencia del widget público, anónimo).
router.post('/interno/conversaciones', authenticateToken, livechatInternoController.iniciarConversacionInterna);

// Público — lo usa el chatbot de la página web al escalar a un agente humano.
router.post('/conversaciones', livechatController.iniciarConversacion);
router.get('/conversaciones/:conversacionId', livechatController.getConversacion);
router.get('/conversaciones/:conversacionId/cola', livechatController.getPosicionCola);
router.delete('/conversaciones/:conversacionId/cola', livechatController.abandonarCola);
// Público — el visitante sale de su conversación en curso (esperando o ya con agente).
router.post('/conversaciones/:conversacionId/salir', livechatController.salirConversacion);
// authenticateTokenOptional: el visitante manda sin token; el agente manda su token para que
// el mensaje quede registrado como 'agente' con su identidad.
router.post('/conversaciones/:conversacionId/mensajes', authenticateTokenOptional, livechatController.enviarMensaje);

// Agente — requiere sesión + permiso de acción sobre el módulo 'livechat'.
router.get('/mis-conversaciones', authenticateToken, requireActionAccess('livechat', 'ver'), livechatController.getMisConversaciones);
router.post('/conversaciones/:conversacionId/tomar', authenticateToken, requireActionAccess('livechat', 'atender'), livechatController.tomarConversacion);
router.post('/conversaciones/:conversacionId/cerrar', authenticateToken, requireActionAccess('livechat', 'atender'), livechatController.cerrarConversacion);
// Público — el visitante califica la atención tras el cierre del agente (ver flujo de dos pasos en el controller).
router.post('/conversaciones/:conversacionId/calificar', livechatController.calificarConversacion);
router.get('/conversaciones/:conversacionId/agentes-transferibles', authenticateToken, requireActionAccess('livechat', 'atender'), livechatController.getAgentesTransferibles);
router.post('/conversaciones/:conversacionId/transferir', authenticateToken, requireActionAccess('livechat', 'atender'), livechatController.transferirConversacion);
// setDisponible exige 'atender' (no solo 'ver'): quien no puede tomar/atender
// chats tampoco debe poder marcarse Disponible y entrar a la cola de asignación.
router.post('/mi-estado', authenticateToken, requireActionAccess('livechat', 'atender'), livechatController.setDisponible);
router.get('/mi-estado', authenticateToken, requireActionAccess('livechat', 'ver'), livechatController.getMiEstado);
router.get('/agentes-estado', authenticateToken, requireActionAccess('livechat', 'ver'), livechatController.getAgentesEstado);
// Supervisión: todas las conversaciones activas de todos los agentes (no solo propias).
router.get('/supervision/conversaciones-activas', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatController.getConversacionesActivasSupervision);

// Configuración de horario/mensajes automáticos — requiere permiso de administración del módulo.
router.get('/config', authenticateToken, requireActionAccess('livechat', 'ver'), livechatController.getConfig);
router.put('/config', authenticateToken, requireActionAccess('livechat', 'configurar'), livechatController.updateConfig);

// Historial de conversaciones cerradas + export CSV.
router.get('/historial', authenticateToken, requireActionAccess('livechat', 'ver'), livechatController.getHistorial);
router.get('/historial/export', authenticateToken, requireActionAccess('livechat', 'ver'), livechatController.exportHistorialCsv);

// Campañas — administración completa requiere 'gestionar-campanas'; el catálogo
// de campañas/grupos también es legible con 'ver' (lo necesita cualquier agente
// para saber en qué campaña está cada conversación que atiende).
router.get('/campanias', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.getCampanias);
router.post('/campanias', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.createCampania);
router.put('/campanias/:id', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.updateCampania);
router.delete('/campanias/:id', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.deleteCampania);

router.get('/campanias/:campaniaId/grupos', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.getGrupos);
router.post('/campanias/:campaniaId/grupos', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.createGrupo);
router.put('/grupos/:grupoId', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.updateGrupo);
router.delete('/grupos/:grupoId', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.deleteGrupo);

router.get('/grupos/:grupoId/agentes', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.getAgentesDeGrupo);
router.post('/grupos/:grupoId/agentes', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.asignarAgenteAGrupo);
router.delete('/grupos/:grupoId/agentes/:usuarioId', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.quitarAgenteDeGrupo);

// Plantillas — 'ver' basta para listar (filtra públicas + propias privadas dentro del controller);
// crear/editar/borrar las propias no requiere 'gestionar-campanas' (se valida dueño dentro del controller).
router.get('/grupos/:grupoId/plantillas', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.getPlantillas);
router.post('/grupos/:grupoId/plantillas', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.createPlantilla);
router.put('/plantillas/:id', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.updatePlantilla);
router.delete('/plantillas/:id', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.deletePlantilla);

router.get('/grupos/:grupoId/motivos-cierre', authenticateToken, requireActionAccess('livechat', 'ver'), livechatCampanasController.getMotivosCierre);
router.post('/grupos/:grupoId/motivos-cierre', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.createMotivoCierre);
router.put('/motivos-cierre/:id', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.updateMotivoCierre);
router.delete('/motivos-cierre/:id', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.deleteMotivoCierre);
router.put('/grupos/:grupoId/motivos-cierre/reorder', authenticateToken, requireActionAccess('livechat', 'gestionar-campanas'), livechatCampanasController.reorderMotivosCierre);

module.exports = router;
