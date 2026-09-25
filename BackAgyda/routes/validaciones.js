const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validarRfc, validarCorreo, buscarCp } = require('../utils/validacionesMx');

// Validaciones de captura (clientes y contactos): RFC, correo y código postal.
// Solo informan; cada pantalla decide si avisa o bloquea.
router.use(authenticateToken);

// GET /api/validaciones/rfc?rfc=
router.get('/rfc', (req, res) => {
  res.json({ success: true, data: validarRfc(req.query.rfc) });
});

// GET /api/validaciones/correo?correo=
router.get('/correo', async (req, res) => {
  try {
    res.json({ success: true, data: await validarCorreo(req.query.correo) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'No se pudo validar el correo' });
  }
});

// GET /api/validaciones/cp/:cp — catálogo SEPOMEX: estado, municipio, ciudad y colonias.
router.get('/cp/:cp', async (req, res) => {
  try {
    res.json({ success: true, data: await buscarCp(req.params.cp) });
  } catch (e) {
    console.error('validaciones.cp:', e.message);
    res.status(500).json({ success: false, message: 'No se pudo consultar el código postal' });
  }
});

module.exports = router;
