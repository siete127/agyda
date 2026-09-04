const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadCcMedia } = require('../middleware/ccMediaUpload');
const inter = require('../controllers/ccInteraccionesController');
const cfg = require('../controllers/ccConfigController');
const sim = require('../controllers/ccSimuladorController');
const ccCron = require('../controllers/ccCronController'); // registra el cron al require

const M = 'contact-center';

// ── Media (acepta ?token=) ──────────────────────────────────────────────
router.get('/media/:id', authenticateToken, requireActionAccess(M, 'ver'), inter.verMedia);

// ── Bandeja / interacciones ─────────────────────────────────────────────
router.get('/interacciones', authenticateToken, requireActionAccess(M, 'ver'), inter.list);
router.get('/interacciones/:id', authenticateToken, requireActionAccess(M, 'ver'), inter.getById);
router.post('/interacciones/:id/tomar', authenticateToken, requireActionAccess(M, 'atender'), inter.tomar);
router.post('/interacciones/:id/mensajes', authenticateToken, requireActionAccess(M, 'atender'), inter.enviarMensaje);
router.post('/interacciones/:id/media', authenticateToken, requireActionAccess(M, 'atender'), uploadCcMedia.single('archivo'), inter.subirMedia);
router.post('/interacciones/:id/cerrar', authenticateToken, requireActionAccess(M, 'atender'), inter.cerrar);
router.post('/interacciones/:id/transferir', authenticateToken, requireActionAccess(M, 'atender'), inter.transferir);
router.get('/interacciones/:id/agentes-transferibles', authenticateToken, requireActionAccess(M, 'atender'), inter.getAgentesTransferibles);

// ── Estado del agente ──────────────────────────────────────────────────
router.post('/mi-estado', authenticateToken, requireActionAccess(M, 'atender'), inter.setDisponible);
router.get('/mi-estado', authenticateToken, requireActionAccess(M, 'ver'), inter.getMiEstado);
router.get('/agentes-estado', authenticateToken, requireActionAccess(M, 'ver'), inter.getAgentesEstado);

// ── Catálogos para el chat ─────────────────────────────────────────────
router.get('/plantillas', authenticateToken, requireActionAccess(M, 'ver'), inter.getPlantillas);
router.get('/tipificaciones', authenticateToken, requireActionAccess(M, 'ver'), inter.getTipificaciones);
router.get('/motivos-cierre', authenticateToken, requireActionAccess(M, 'ver'), inter.getMotivosCierre);

// ── Supervisión / historial / métricas ────────────────────────────────
router.get('/supervision/activas', authenticateToken, requireActionAccess(M, 'supervision'), inter.supervisionActivas);
router.get('/historial', authenticateToken, requireActionAccess(M, 'supervision'), inter.historial);
router.get('/metricas', authenticateToken, requireActionAccess(M, 'supervision'), inter.metricas);
router.post('/cron/run', authenticateToken, requireActionAccess(M, 'supervision'), ccCron.runNow);

// ── Config: canales ───────────────────────────────────────────────────
router.get('/canales', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.listCanales);
router.post('/canales', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.createCanal);
router.put('/canales/:id', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.updateCanal);
router.delete('/canales/:id', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.deleteCanal);
router.post('/canales/:id/probar', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.probarCanal);
router.post('/canales/:id/suscribir', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.suscribirCanal);

// ── Config global ─────────────────────────────────────────────────────
router.get('/config', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.getConfig);
router.put('/config', authenticateToken, requireActionAccess(M, 'configurar-canales'), cfg.updateConfig);

// ── Campañas / skills (grupos) ────────────────────────────────────────
router.get('/campanias', authenticateToken, requireActionAccess(M, 'ver'), cfg.listCampanias);
router.post('/campanias', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.createCampania);
router.put('/campanias/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.updateCampania);
router.delete('/campanias/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.deleteCampania);

router.get('/grupos', authenticateToken, requireActionAccess(M, 'ver'), cfg.listGrupos);
router.post('/grupos', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.createGrupo);
router.put('/grupos/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.updateGrupo);
router.delete('/grupos/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.deleteGrupo);
router.get('/grupos/:grupoId/agentes', authenticateToken, requireActionAccess(M, 'ver'), cfg.getAgentesDeGrupo);
router.post('/grupos/:grupoId/agentes', authenticateToken, requireActionAccess(M, 'asignar-agentes'), cfg.asignarAgenteAGrupo);
router.delete('/grupos/:grupoId/agentes/:usuarioId', authenticateToken, requireActionAccess(M, 'asignar-agentes'), cfg.quitarAgenteDeGrupo);
router.get('/agentes-matriz', authenticateToken, requireActionAccess(M, 'asignar-agentes'), cfg.getMatrizAgentes);

router.get('/grupos/:grupoId/plantillas', authenticateToken, requireActionAccess(M, 'ver'), cfg.listPlantillas);
router.post('/grupos/:grupoId/plantillas', authenticateToken, requireActionAccess(M, 'atender'), cfg.createPlantilla);
router.put('/plantillas/:id', authenticateToken, requireActionAccess(M, 'atender'), cfg.updatePlantilla);
router.delete('/plantillas/:id', authenticateToken, requireActionAccess(M, 'atender'), cfg.deletePlantilla);

router.get('/grupos/:grupoId/motivos-cierre', authenticateToken, requireActionAccess(M, 'ver'), cfg.listMotivos);
router.post('/grupos/:grupoId/motivos-cierre', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.createMotivo);
router.put('/motivos-cierre/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.updateMotivo);
router.delete('/motivos-cierre/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.deleteMotivo);

// ── Tipificaciones ────────────────────────────────────────────────────
router.get('/tipificaciones-catalogo', authenticateToken, requireActionAccess(M, 'ver'), cfg.listTipificaciones);
router.post('/tipificaciones-catalogo', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.createTipificacion);
router.put('/tipificaciones-catalogo/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.updateTipificacion);
router.delete('/tipificaciones-catalogo/:id', authenticateToken, requireActionAccess(M, 'gestionar-skills'), cfg.deleteTipificacion);

// ── Simulador (admin/QA) ──────────────────────────────────────────────
router.post('/sim/interacciones', authenticateToken, requireActionAccess(M, 'atender'), sim.crearInteraccion);

module.exports = router;
