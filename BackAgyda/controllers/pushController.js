const databaseService = require('../services/databaseService');
const pushService = require('../services/pushService');

exports.getPublicKey = (req, res) => {
  res.json({ success: true, data: { publicKey: pushService.publicKey, habilitado: pushService.habilitado } });
};

exports.suscribirse = async (req, res) => {
  try {
    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, message: 'Suscripción inválida' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pushService.guardarSuscripcion(pool, {
      usuarioId: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('Error guardando suscripción push:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.desuscribirse = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, message: 'endpoint requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pushService.eliminarSuscripcion(pool, endpoint);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando suscripción push:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
