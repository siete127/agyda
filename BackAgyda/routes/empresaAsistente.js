const express = require('express');
const router = express.Router();
const c = require('../controllers/empresaAsistenteController');
const { authenticateToken } = require('../middleware/auth');
const { requireGestionEmpresas } = require('../utils/gestionEmpresas');

// Asistente "Crear empresa". Todo exige la acción accesos/crear-empresas
// marcada explícitamente y una sesión de Ardaby Tec (utils/gestionEmpresas.js),
// salvo /puedo, que solo responde si el usuario la tiene.
router.use(authenticateToken);
router.get('/puedo', c.puedo);

router.use(requireGestionEmpresas);
router.get('/catalogo', c.catalogo);
router.get('/codigo', c.codigo);

// Borradores: se capturan y guardan; la empresa se crea al final (POST /:id/crear).
router.get('/borradores', c.listarBorradores);
router.post('/borradores', c.crearBorrador);
router.get('/borradores/:id', c.leer);
router.put('/borradores/:id', c.guardarBorrador);
router.delete('/borradores/:id', c.descartar);
router.post('/borradores/:id/crear', c.crearEmpresa);
router.post('/borradores/:id/terminar', c.terminar);

module.exports = router;
