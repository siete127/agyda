/**
 * Servidor de desarrollo local para "Pagina de Intranet_1".
 * Sirve los archivos estáticos del sitio y reenvía /api/* y /uploads/* replicando
 * el split de rutas que hace web.config en producción (ver ese archivo):
 *   - api/contacto           -> BackAgyda /api/crm/contacto (alias de lead-marketing)
 *   - api/vacantes*          -> BackAgyda /api/vacantes...
 *   - api/uploads/vacante-cv -> BackAgyda /api/uploads/vacante-cv
 *   - resto de api/*         -> BackAgyda (mismo backend en dev; en prod es un
 *                                servicio aparte en :4001 que aquí no existe)
 * Target por defecto: BackAgyda en desarrollo (ver BackAgyda/.env.development), puerto 8447.
 *
 * Uso: npm run dev  (o: node scripts/dev-server.js)
 */
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const PORT = process.env.DEV_PORT || 8080;
const BACKEND_TARGET = process.env.BACKEND_TARGET || 'http://127.0.0.1:8447';
const ROOT = path.join(__dirname, '..');

const app = express();

// api/contacto -> /api/crm/contacto (mismo backend, distinta ruta — igual que
// la regla "LeadMarketingToCRM" de web.config).
app.use('/api/contacto', createProxyMiddleware({
  target: BACKEND_TARGET,
  changeOrigin: true,
  pathRewrite: { '^/api/contacto': '/api/crm/contacto' },
}));

app.use('/api', createProxyMiddleware({ target: BACKEND_TARGET, changeOrigin: true }));
app.use('/uploads', createProxyMiddleware({ target: BACKEND_TARGET, changeOrigin: true }));
// Chat en vivo (Socket.IO real-time del backend) — necesita upgrade a WebSocket (ver server.on('upgrade') abajo).
const socketIoProxy = createProxyMiddleware({ target: BACKEND_TARGET, changeOrigin: true, ws: true });
app.use('/socket.io', socketIoProxy);

// Si alguien entra con .html explícito (link viejo, autocompletado del navegador, etc.),
// redirige a la URL limpia para que las anclas (#inicio, #nosotros...) no arrastren el .html.
app.get(/^\/([a-zA-Z0-9_-]+)\.html$/, (req, res) => {
  const slug = req.params[0];
  res.redirect(301, slug === 'index' ? '/' : `/${slug}`);
});

// URLs limpias: /login -> login.html, /contacto -> contacto.html, / -> index.html
app.get(/^\/([a-zA-Z0-9_-]*)\/?$/, (req, res, next) => {
  const slug = req.params[0] || 'index';
  const filePath = path.join(ROOT, `${slug}.html`);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

app.use(express.static(ROOT));

const server = app.listen(PORT, () => {
  console.log(`Sitio disponible en http://localhost:${PORT}`);
  console.log(`Proxy de /api, /uploads y /socket.io hacia ${BACKEND_TARGET}`);
});

// http-proxy-middleware no intercepta el handshake de WebSocket automáticamente
// cuando el servidor se crea con app.listen(); hay que conectarlo a mano.
server.on('upgrade', socketIoProxy.upgrade);
