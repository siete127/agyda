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
router.get('/codigo', c.sugerirCodigo);
router.post('/', c.crear);

router.get('/:empKey', c.estado);
router.put('/:empKey/asistente', c.guardarAvance);
router.put('/:empKey/modulos', c.guardarModulos);

router.post('/:empKey/roles', c.crearRol);
router.put('/:empKey/roles/:rolId', c.actualizarRol);
router.delete('/:empKey/roles/:rolId', c.eliminarRol);

router.post('/:empKey/perfiles', c.guardarPerfil);
router.put('/:empKey/perfiles/:perfilId', c.guardarPerfil);
router.delete('/:empKey/perfiles/:perfilId', c.eliminarPerfil);

router.post('/:empKey/usuarios', c.crearUsuario);
router.post('/:empKey/usuarios/importar', c.importarUsuarios);

module.exports = router;
