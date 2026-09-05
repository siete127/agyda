/**
 * Servidor de desarrollo local para "Postulacion-Ayudantes".
 * Solo sirve los archivos estáticos (login.html, registro.html,
 * blacklist.html, css/, js/, assets/) — no hay backend todavía.
 *
 * Uso: npm run dev  (o: node scripts/dev-server.js)
 */
const express = require('express');
const path = require('path');

const PORT = process.env.DEV_PORT || 8090;
const ROOT = path.join(__dirname, '..');

const app = express();

// URLs limpias: /login -> login.html, / -> login.html (pantalla de entrada)
app.get(/^\/([a-zA-Z0-9_-]*)\/?$/, (req, res, next) => {
  const slug = req.params[0] || 'login';
  const filePath = path.join(ROOT, `${slug}.html`);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`Sitio disponible en http://localhost:${PORT}`);
  console.log(`Pantalla de entrada (QR): http://localhost:${PORT}/login`);
});
