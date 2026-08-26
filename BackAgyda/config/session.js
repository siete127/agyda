const session = require('express-session');

const sessionConfig = {
  name: 'intranet.sid',
  secret: process.env.SESSION_SECRET || 'intranet-ventas-session-secret-key-2024-change-this',
  resave: true,
  saveUninitialized: true,
  store: new session.MemoryStore(),
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    // Expirar sesión a las 6 horas
    maxAge: 6 * 60 * 60 * 1000,
    domain: '.ardabytec.vip'
  }
};

module.exports = sessionConfig;