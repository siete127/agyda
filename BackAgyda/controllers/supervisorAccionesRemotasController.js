// Acciones remotas sobre la sesión del agente — Fase 3, punto 3.7 del plan
// de evolución basado en PSUP de Mitrol. El manual permite "Resetear el PAD"
// (el softphone físico) y "Desloguear agentes"; aquí no hay PAD, así que la
// versión reducida es: forzar el cierre de sesión del agente en la app web,
// o forzar que su pestaña se recargue. Ambas viajan por el mismo canal que
// ya usan las notificaciones obligatorias (sala personal `user:{id}`).
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { DEFAULT_TENANT } = require('../config/tenants');
const { puedeNotificar } = require('./supervisorNotificacionesController');

function tenantKeyDe(req) {
  return (req?.user?.empresa || DEFAULT_TENANT).toLowerCase();
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }

function emitir(tenantKey, room, evento, payload) {
  try { socketService.getIO(tenantKey || DEFAULT_TENANT).to(room).emit(evento, payload); }
  catch (e) { console.warn('[supervisorAccionesRemotas] emit falló:', e?.message || e); }
}

// POST /operaciones/supervisores/agentes/:id/desconectar — cierra la sesión
// del agente en su navegador de inmediato (mismo efecto que el timeout de
// inactividad: disconnectSocket + clearSession + redirigir a /login).
exports.desconectar = async (req, res) => {
  try {
    const p = await pool(req);
    const agenteId = Number(req.params.id);
    if (!(await puedeNotificar(p, req, 'agente', agenteId))) {
      return res.status(403).json({ success: false, message: 'No tienes asignado a este agente' });
    }
    const nombre = req.user?.nombres || req.user?.nombre || String(req.user?.id);
    emitir(tenantKeyDe(req), `user:${agenteId}`, 'cs:sesion_cerrada_remota', { motivo: `Sesión cerrada por el supervisor ${nombre}` });
    res.json({ success: true });
  } catch (e) {
    console.error('supervisorAccionesRemotas.desconectar:', e.message);
    res.status(500).json({ success: false, message: 'Error al desconectar al agente' });
  }
};

// POST /operaciones/supervisores/agentes/:id/refrescar — fuerza un reload
// de la pestaña del agente (para cuando quedó "colgado" tras una actualización
// del sistema, sin necesidad de cerrarle la sesión).
exports.refrescar = async (req, res) => {
  try {
    const p = await pool(req);
    const agenteId = Number(req.params.id);
    if (!(await puedeNotificar(p, req, 'agente', agenteId))) {
      return res.status(403).json({ success: false, message: 'No tienes asignado a este agente' });
    }
    emitir(tenantKeyDe(req), `user:${agenteId}`, 'cs:forzar_refresh', {});
    res.json({ success: true });
  } catch (e) {
    console.error('supervisorAccionesRemotas.refrescar:', e.message);
    res.status(500).json({ success: false, message: 'Error al refrescar al agente' });
  }
};
