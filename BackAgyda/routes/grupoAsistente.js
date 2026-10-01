const express = require('express');
const router = express.Router();
const c = require('../controllers/grupoAsistenteController');
const { authenticateToken } = require('../middleware/auth');

// Asistente "Crear grupo": en cualquier empresa que tenga activos sus módulos
// (Contact Center y Usuarios) y para AD/TI con "editar" usuarios.
router.use(authenticateToken);
router.get('/disponible', c.disponible);

router.use(c.requireAsistente);
router.get('/catalogo', c.catalogo);
router.get('/borradores', c.listar);
router.post('/borradores', c.crearBorrador);
// Editar campaña (Operaciones → Campañas): borrador de actualización del grupo que la usa.
router.post('/desde-campania', c.desdeCampania);
// Paso 3: la gente que las campañas elegidas ya tienen (se carga sola).
router.get('/personas-de-campanias', c.personasDeCampanias);
router.get('/borradores/:id', c.leer);
router.put('/borradores/:id', c.guardar);
router.delete('/borradores/:id', c.descartar);
router.post('/borradores/:id/crear', c.crearGrupo);
router.post('/borradores/:id/terminar', c.terminar);

module.exports = router;
