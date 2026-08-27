const fsEnv = require('fs');
const pathEnv = require('path');
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
const envPath = fsEnv.existsSync(pathEnv.join(__dirname, envFile))
  ? envFile
  : '.env';
require('dotenv').config({ path: envPath });
// Inicializar logger centralizado (usa LOG_LEVEL: error,warn,info,debug)
const logger = require('./utils/logger');
global.logger = logger;
// permitir `console.debug(...)` como alias para mensajes debug controlados
console.debug = (...args) => logger.debug(...args);
// Redirigir `console.log` a `logger.debug` para reducir salida no importante
console.log = (...args) => logger.debug(...args);
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ticketController = require('./controllers/ticketController');

const app = express();

/* =====================================================
   CONFIGURACIONES
===================================================== */
const sslConfig = require('./config/ssl');

/* =====================================================
   MIDDLEWARES
===================================================== */
const corsMiddleware = require('./middleware/cors');
const sessionMiddleware = require('./middleware/session');
const loggingMiddleware = require('./middleware/logging');

/* =====================================================
   CONFIGURACIÓN GENERAL
===================================================== */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(corsMiddleware);
app.use(sessionMiddleware);
app.use(loggingMiddleware);

/* =====================================================
   ARCHIVOS ESTÁTICOS
===================================================== */
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/audio', express.static(process.env.AUDIO_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Musica'));
app.use('/capacitacion-materiales', express.static(process.env.CAPACITACION_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Capacitacion'));

/* =====================================================
   🔴 PROXY (ANTES DEL SPA)
===================================================== */
const proxyRoutes = require('./routes/proxy');
app.use('/proxy', proxyRoutes);

/* =====================================================
   RUTAS API
===================================================== */
app.use('/api/auth', require('./routes/auth'));
app.post('/api/login', require('./controllers/authController').login);
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/campanas', require('./routes/campanas'));
app.use('/api/status', require('./routes/status'));
app.use('/api/noticias', require('./routes/noticias'));
app.use('/api/comentarios', require('./routes/comentarios'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/tareas', require('./routes/tareas'));
app.use('/api/permisos', require('./routes/permisos'));
app.use('/api/quejas', require('./routes/quejas'));
app.use('/api/consultas', require('./routes/consultas'));
app.use('/api/aclaraciones', require('./routes/aclaraciones'));
app.use('/api/seguimiento', require('./routes/seguimiento'));
app.use('/api/encuestas', require('./routes/encuestas'));
app.use('/api/nomina',   require('./routes/nomina'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/kb', require('./routes/kb'));
app.use('/api/catalogos-ti', require('./routes/catalogosTi'));
app.use('/api/tecnicos', require('./routes/tecnicos'));
app.use('/api/reglas-asignacion', require('./routes/reglasAsignacion'));
app.use('/api/reglamento', require('./routes/reglamento'));
app.use('/api/perfil', require('./routes/perfil'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/calendario', require('./routes/calendario'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api/organigrama', require('./routes/organigrama'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/checklists', require('./routes/checklists'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/expedientes', require('./routes/expedientes'));
app.use('/api/vacaciones', require('./routes/vacaciones'));
app.use('/api/legales', require('./routes/legales'));
app.use('/api/areas', require('./routes/areas'));
app.use('/api/direccion-general', require('./routes/direccionGeneral'));
app.use('/api/calidad', require('./routes/calidad'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/contratos', require('./routes/contratos'));
app.use('/api/proteccion-datos', require('./routes/proteccionDatos'));
app.use('/api/cumplimiento-normativo', require('./routes/cumplimientoNormativo'));
app.use('/api/control-documental', require('./routes/controlDocumental'));
app.use('/api/finanzas', require('./routes/finanzas'));
app.use('/api/ventas-area', require('./routes/ventasArea'));
app.use('/api/operaciones', require('./routes/operaciones'));
app.use('/api/tecnologia', require('./routes/tecnologia'));
app.use('/api/atencion-cliente', require('./routes/atencionCliente'));
app.use('/api/rh-area', require('./routes/rhArea'));
app.use('/api/notificaciones-correo', require('./routes/notificacionesCorreo'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/accesos', require('./routes/accesos'));
app.use('/api/ui', require('./routes/ui'));
app.use('/api/webphone', require('./routes/webphone'));
app.use('/api/playlist', require('./routes/playlist'));
app.use('/api/musica', require('./routes/playlist'));
app.use('/api/asistencia', require('./routes/asistencia'));
app.use('/api/activos', require('./routes/activos'));
app.use('/api/gastos', require('./routes/gastos'));
app.use('/api/eval-capacitacion', require('./routes/evalCapacitacion'));
app.use('/api/capacitacion', require('./routes/capacitacion'));
app.use('/api/incapacidades', require('./routes/incapacidades'));
app.use('/api/evaluacion-desempeno', require('./routes/evaluacionDesempeno'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/crm',      require('./routes/crm'));
app.use('/api/crm-setup', require('./routes/crmSetup'));
app.use('/api/crm-accesos', require('./routes/crmAccesos'));
app.use('/api/vacantes', require('./routes/vacantes'));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/livechat', require('./routes/livechat'));
app.use('/api/email-marketing', require('./routes/emailMarketing'));
app.use('/api/mensajeria', require('./routes/mensajeria'));

// CRM: arrancar cron de automatizaciones
require('./controllers/crmAutomatizacionesController');
app.use('/api/eventos', require('./routes/calendario'));
// app.use('/api/mundial', require('./routes/mundial'));

// Alias en español para reportes de satisfacción de tickets
app.get('/api/reportes/tickets-satisfaccion', ticketController.getReporteSatisfaccion);
app.get('/api/reportes/tickets-satisfaccion.csv', ticketController.getReporteSatisfaccionCSV);

/* =====================================================
   PÁGINA DE LOGIN (VENTAS AUTO-LOGIN)
===================================================== */
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Servidor funcionando correctamente',
    app: 'AGYDA',
    version: '20.11.0',
    copyright: 'Copyright (c) 2026 ArdaBytec. Todos los derechos reservados.',
    timestamp: new Date().toISOString()
  });
});

/* =====================================================
   FLUTTER WEB (SPA)
===================================================== */
function resolveWebBuildPath() {
  const paths = [
    process.env.WEB_BUILD_DIR,
    path.join(__dirname, '../Intranet/build/web'),
    path.join(__dirname, '../intranet/build/web')
  ].filter(Boolean);

  return paths.find(p => fs.existsSync(path.join(p, 'index.html'))) || null;
}

const webBuildPath = resolveWebBuildPath();

if (webBuildPath) {
  app.use(express.static(webBuildPath));

  // ⚠️ IMPORTANTE: no interceptar /api ni /proxy
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/proxy')) {
      return next();
    }
    res.sendFile(path.join(webBuildPath, 'index.html'));
  });
}

/* =====================================================
   404 FINAL CONTROLADO
===================================================== */
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/proxy')) {
    return res.status(404).json({
      success: false,
      message: 'Ruta no encontrada'
    });
  }
  res.status(404).send('Aplicación no disponible');
});

/* =====================================================
   SERVIDOR HTTP / HTTPS
===================================================== */
const isHttps = process.env.USE_HTTPS === 'true';
const server = (isHttps && sslConfig.isAvailable)
  ? https.createServer(sslConfig.options, app)
  : http.createServer(app);

/* =====================================================
   SERVICIOS
===================================================== */
const databaseService = require('./services/databaseService');
const socketService = require('./services/socketService');
const emailService = require('./services/emailService');

socketService.initialize(server);
emailService.initialize();

(async () => {
  if (process.env.SKIP_DB !== 'true') {
    try {
      await databaseService.initialize();
      logger.info('✅ Base de datos inicializada');
    } catch (err) {
      logger.error('❌ Error inicializando BD:', err.message);
    }
  }
})();

/* =====================================================
   START
===================================================== */
const PORT = process.env.PORT || 8444;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`✅ Servidor activo en ${HOST}:${PORT}`);
});

// Mini servidor interno para relay de socket desde intra-new (solo acepta conexiones locales)
const RELAY_PORT = Number(process.env.RELAY_PORT || 8446);
const relayApp = require('express')();
relayApp.use(require('express').json());
relayApp.post('/internal/emit', (req, res) => {
  try {
    const { room, event, payload } = req.body;
    if (!room || !event) return res.status(400).json({ ok: false });
    const io = socketService.getIO();
    io.to(room).emit(event, payload);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
http.createServer(relayApp).listen(RELAY_PORT, '127.0.0.1', () => {
  logger.info(`✅ Relay interno en 127.0.0.1:${RELAY_PORT}`);
});

/* =====================================================
   SHUTDOWN
===================================================== */
process.on('SIGINT', async () => {
  logger.info('🛑 Cerrando servidor...');
  await databaseService.close();
  server.close(() => process.exit(0));
});

module.exports = app;
