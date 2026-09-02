const express = require('express');
const router = express.Router();
const calendarioController = require('../controllers/calendarioController');
const { verificarAutenticacion, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// =============================================
// RUTAS DE CALENDARIO
// =============================================

// Todas las rutas requieren autenticación: cada empresa (tenant) tiene su
// propia BD, y el pool a usar se resuelve por req.user.empresa (ver
// calendarioController.js) — sin esto, las consultas caían siempre en la
// BD por defecto y mezclaban cumpleaños/eventos entre empresas.
router.use(verificarAutenticacion);

/**
 * GET /api/calendario/proximos
 * Obtener eventos próximos para la portada
 * Query params: dias (default 30), limite (default 10)
 */
router.get('/proximos', calendarioController.getEventosProximos);

/**
 * GET /api/calendario/cumpleanos-mes
 * Obtener cumpleaños del mes
 * Query params: mes, anio (opcionales, default: mes/año actual)
 */
router.get('/cumpleanos-mes', calendarioController.getCumpleanosMes);

/**
 * GET /api/calendario
 * Obtener todos los eventos con filtros
 * Query params: fecha_inicio, fecha_fin, tipo_evento, mes, anio
 */
router.get('/', calendarioController.getEventos);

/**
 * GET /api/calendario/:id
 * Obtener un evento específico por ID
 */
router.get('/:id', calendarioController.getEventoPorId);

/**
 * POST /api/calendario
 * Crear un nuevo evento
 * Nota: La validación de rol se maneja en el controlador para permitir
 * que usuarios autenticados creen 'fecha_importante' y restringir
 * otros tipos a perfiles ADM.
 */
router.post('/', requireActionAccess('calendario', 'crear-evento'), calendarioController.crearEvento);

/**
 * PUT /api/calendario/:id/asistencia/:id_usuario
 * Actualizar estado de asistencia de un participante
 * Body: { estado: 'confirmado' | 'rechazado' | 'pendiente' }
 */
router.put('/:id/asistencia/:id_usuario', requireActionAccess('calendario', 'gestionar-participantes'), calendarioController.actualizarEstadoAsistencia);

// Rutas CRUD de eventos - SOLO para ADM/AD
router.use(verificarRol(['ADM', 'AD', 'Administrador']));

/**
 * PUT /api/calendario/:id
 * Actualizar un evento existente
 * Body: { titulo, descripcion, tipo_evento, fecha_inicio, ... }
 */
router.put('/:id', requireActionAccess('calendario', 'editar-evento'), calendarioController.actualizarEvento);

/**
 * DELETE /api/calendario/:id
 * Eliminar un evento (soft delete)
 */
router.delete('/:id', requireActionAccess('calendario', 'editar-evento'), calendarioController.eliminarEvento);

/**
 * POST /api/calendario/sincronizar-cumpleanos
 * Sincronizar cumpleaños desde la tabla de usuarios
 */
router.post('/sincronizar-cumpleanos', requireActionAccess('calendario', 'editar-evento'), calendarioController.sincronizarCumpleanos);

/**
 * POST /api/calendario/:id/participantes
 * Agregar participantes a un evento
 * Body: { participantes: [id_usuario1, id_usuario2, ...] }
 */
router.post('/:id/participantes', requireActionAccess('calendario', 'gestionar-participantes'), calendarioController.agregarParticipantes);

/**
 * DELETE /api/calendario/:id/participantes/:id_usuario
 * Eliminar un participante de un evento
 */
router.delete('/:id/participantes/:id_usuario', requireActionAccess('calendario', 'gestionar-participantes'), calendarioController.eliminarParticipante);

module.exports = router;
