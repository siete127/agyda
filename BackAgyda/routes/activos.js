const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const activoController = require('../controllers/activoController');
const activoGeneralController = require('../controllers/activoGeneralController');
const activoMobiliarioController = require('../controllers/activoMobiliarioController');
const activoMobiliarioCatalogoController = require('../controllers/activoMobiliarioCatalogoController');

const uploadExcelMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Acciones de Accesos (módulo 'activos'). La escritura además exige AD/TI.
// Lo de cada empleado con SU activo asignado (el pendiente de aceptar y su
// carta responsiva) no requiere "ver": solo aceptar-terminos para aceptarlo.
const ver = requireActionAccess('activos', 'ver');
const crear = requireActionAccess('activos', 'crear');
const editar = requireActionAccess('activos', 'editar');
const eliminar = requireActionAccess('activos', 'eliminar');
const aceptarTerminos = requireActionAccess('activos', 'aceptar-terminos');
const adTi = verificarRol(['AD', 'TI']);

router.use(authenticateToken);

// Consulta
router.get('/pendiente', activoController.getActivoPendiente);
router.get('/', ver, activoController.getActivos);

// Escritura
router.post('/', adTi, crear, activoController.createActivo);
router.post('/:id/aceptar-terminos', aceptarTerminos, activoController.aceptarTerminos);
router.get('/:id/carta-responsiva', activoController.getCartaResponsiva);
router.put('/:id', adTi, editar, activoController.updateActivo);
router.delete('/:id', adTi, eliminar, activoController.deleteActivo);

// Activos Generales (inventario de máquinas)
router.get('/generales', ver, activoGeneralController.getActivosGenerales);
router.get('/generales/usuario/:userId', requireActionAccess('mi-area', 'ver-activos'), activoGeneralController.getActivosGeneralesPorUsuario);
router.get('/generales/:id/carta-responsiva', activoGeneralController.getCartaResponsivaGeneral);
router.patch('/generales/:id/carta-doc', adTi, editar, activoGeneralController.enlazarCartaDoc);
router.post('/generales', adTi, crear, activoGeneralController.createActivoGeneral);
router.post('/generales/importar', adTi, crear, uploadExcelMemoria.single('archivo'), activoGeneralController.importarActivosGenerales);
router.put('/generales/:id', adTi, editar, activoGeneralController.updateActivoGeneral);

// Mobiliario y equipos (inventario físico de la empresa)
router.get('/mobiliario', ver, activoMobiliarioController.getMobiliario);
router.post('/mobiliario', adTi, crear, activoMobiliarioController.createMobiliario);
router.put('/mobiliario/:id', adTi, editar, activoMobiliarioController.updateMobiliario);
router.delete('/mobiliario/:id', adTi, eliminar, activoMobiliarioController.deleteMobiliario);

// Catálogo de categorías y departamentos custom para mobiliario
router.get('/mobiliario/categorias', ver, activoMobiliarioCatalogoController.getCategorias);
router.post('/mobiliario/categorias', adTi, crear, activoMobiliarioCatalogoController.createCategoria);
router.get('/mobiliario/departamentos', ver, activoMobiliarioCatalogoController.getDepartamentos);
router.post('/mobiliario/departamentos', adTi, crear, activoMobiliarioCatalogoController.createDepartamento);

module.exports = router;
