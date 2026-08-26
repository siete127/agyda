const notificationService = require('../services/notificationService');

exports.listByUser = async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId || req.headers.usuarioid || req.query.usuarioId);
    if (!usuarioId) return res.status(400).json({ success: false, message: 'Usuario inválido' });
    
    const onlyUnread = String(req.query.onlyUnread || 'false').toLowerCase() === 'true';
    const limit = Number(req.query.limit || 100);
    
    const data = await notificationService.listNotifications(usuarioId, onlyUnread, limit, req.user?.empresa);
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error listando notificaciones:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Endpoint para crear notificaciones
exports.create = async (req, res) => {
  try {
    const { usuarioId, mensaje, tipo, dataExtra } = req.body;
    
    if (!usuarioId || !mensaje) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuario ID y mensaje son requeridos' 
      });
    }

    console.log(`📨 Solicitando creación de notificación para usuario ${usuarioId}`);

    const notificationId = await notificationService.createNotification({
      usuarioId: Number(usuarioId),
      mensaje: mensaje.trim(),
      tipo: tipo || 'info',
      dataExtra: dataExtra || {},
      tenantKey: req.user?.empresa,
    });

    // Este archivo es la versión fusionada de notificationController.js y notificacionController.js
    // Se mantiene toda la funcionalidad avanzada y compatibilidad con rutas existentes
    if (notificationId) {
      res.json({ 
        success: true, 
        message: 'Notificación creada y enviada',
        notificationId 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Error creando notificación' 
      });
    }
  } catch (e) {
    console.error('Error creando notificación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
    // Endpoint para crear notificaciones
};

exports.markRead = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Id inválido' });
    
    await notificationService.markAsRead(id, req.user?.empresa);
      return res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (e) {
    console.error('Error marcando notificación leída:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId || req.headers.usuarioid || req.body.usuarioId);
    if (!usuarioId) return res.status(400).json({ success: false, message: 'Usuario inválido' });
    
    await notificationService.markAllAsRead(usuarioId, req.user?.empresa);
      return res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' });
  } catch (e) {
    console.error('Error marcando todas las notificaciones leídas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Endpoint para probar notificaciones en tiempo real
exports.testNotification = async (req, res) => {
  try {
    const { usuarioId, mensaje } = req.body;
    
    if (!usuarioId || !mensaje) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuario ID y mensaje son requeridos' 
      });
    }

    console.log(`🧪 Ejecutando prueba de notificación para usuario ${usuarioId}`);

    const notificationId = await notificationService.createNotification({
      usuarioId: Number(usuarioId),
      mensaje: `🔔 TEST: ${mensaje} - ${new Date().toLocaleTimeString()}`,
      tipo: 'test',
      dataExtra: {
        test: true,
        timestamp: new Date().toISOString(),
        randomId: Math.random().toString(36).substring(7)
      },
      tenantKey: req.user?.empresa,
    });

    if (notificationId) {
      return res.json({ 
        success: true, 
        message: 'Notificación de prueba creada y enviada',
        notificationId,
        usuarioId,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: 'Error creando notificación de prueba' 
      });
    }
  } catch (e) {
    console.error('Error en test notification:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Endpoint para verificar estado de WebSockets
exports.socketStatus = async (req, res) => {
  try {
    let socketService;
    try {
      socketService = require('../services/socketService');
    } catch (e) {
      return res.json({ 
        success: false, 
        socketAvailable: false,
        message: 'Socket service no disponible' 
      });
    }

    const io = socketService.getIO(req.user?.empresa);
    if (!io) {
      return res.json({ 
        success: false, 
        socketAvailable: false,
        message: 'IO no inicializado' 
      });
    }

    // Obtener estadísticas de conexiones
    const stats = socketService.getConnectionStats();
    
    res.json({
      success: true,
      socketAvailable: true,
      stats: stats,
      message: 'WebSockets funcionando correctamente'
    });
  } catch (e) {
    console.error('Error en socket status:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};