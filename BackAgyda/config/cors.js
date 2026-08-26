const allowedOrigins = [
  'https://intranet.ardabytec.vip:8444',
  'https://intranet.ardabytec.vip',
  'https://ventas.ardabytec.vip:8443',
  'https://ventas.ardabytec.vip',
  'https://agyda.ardabytec.vip',
  'https://ardabytec.vip',
  'https://www.ardabytec.vip',
  'https://ardabytec.com',
  'https://www.ardabytec.com',
  'http://ardabytec.com',
  'http://www.ardabytec.com',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:57122',
  'http://127.0.0.1:8080',
  'https://localhost:3000',
  'http://localhost:3000'
];

module.exports = {
  origin: function (origin, callback) {
    // Allow non-browser requests (curl, server-to-server) which have no Origin
    if (!origin) return callback(null, true);

    // Exact match allowlist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Permitir localhost/127.0.0.1 en cualquier puerto.
    // Nota: CORS sólo afecta a navegadores; esto habilita desarrollo aunque NODE_ENV sea 'production'.
    try {
      const parsed = new URL(origin);
      const hostname = parsed.hostname;
      const protocol = parsed.protocol || '';
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && protocol.startsWith('http')) {
        return callback(null, true);
      }
      // Permitir además cualquier IP privada de LAN (para probar desde otros
      // dispositivos de la red, ej: celular, otra PC, o accediendo por IP en
      // vez de localhost). CORS sólo afecta a navegadores, así que esto no
      // representa un riesgo aunque NODE_ENV sea 'production' en un entorno local.
      if (protocol.startsWith('http')) {
        const isPrivateLan =
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
        if (isPrivateLan) {
          return callback(null, true);
        }
      }
    } catch (_) {
      // ignore
    }

    const logger = global.logger || require('../utils/logger');
    logger.warn('⚠️ Origen CORS no permitido:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'x-access-token',
    'x-intranet-token',
    'ventastoken',
    'ventas-token',
    'ventasToken',
    'tipousuario',
    'usuarioid',
    'x-user-tipo'
  ],
  credentials: true,
  optionsSuccessStatus: 204
};