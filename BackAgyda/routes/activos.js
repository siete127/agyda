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

router.use(authenticateToken);

// Consulta: cualquier usuario autenticado
router.get('/pendiente', activoController.getActivoPendiente);
router.get('/', activoController.getActivos);

// Escritura: solo AD/TI
router.post('/', verificarRol(['AD', 'TI']), activoController.createActivo);
router.post('/:id/aceptar-terminos', activoController.aceptarTerminos);
router.get('/:id/carta-responsiva', activoController.getCartaResponsiva);
router.put('/:id', verificarRol(['AD', 'TI']), activoController.updateActivo);
router.delete('/:id', verificarRol(['AD', 'TI']), activoController.deleteActivo);

// Activos Generales (inventario de máquinas)
router.get('/generales', activoGeneralController.getActivosGenerales);
router.get('/generales/usuario/:userId', requireActionAccess('mi-area', 'ver-activos'), activoGeneralController.getActivosGeneralesPorUsuario);
router.get('/generales/:id/carta-responsiva', activoGeneralController.getCartaResponsivaGeneral);
router.patch('/generales/:id/carta-doc', verificarRol(['AD', 'TI']), activoGeneralController.enlazarCartaDoc);
router.post('/generales', verificarRol(['AD', 'TI']), activoGeneralController.createActivoGeneral);
router.post('/generales/importar', verificarRol(['AD', 'TI']), uploadExcelMemoria.single('archivo'), activoGeneralController.importarActivosGenerales);
router.put('/generales/:id', verificarRol(['AD', 'TI']), activoGeneralController.updateActivoGeneral);

// Mobiliario y equipos (inventario físico de la empresa)
router.get('/mobiliario', activoMobiliarioController.getMobiliario);
router.post('/mobiliario', verificarRol(['AD', 'TI']), activoMobiliarioController.createMobiliario);
router.put('/mobiliario/:id', verificarRol(['AD', 'TI']), activoMobiliarioController.updateMobiliario);
router.delete('/mobiliario/:id', verificarRol(['AD', 'TI']), activoMobiliarioController.deleteMobiliario);

// Catálogo de categorías y departamentos custom para mobiliario
router.get('/mobiliario/categorias', activoMobiliarioCatalogoController.getCategorias);
router.post('/mobiliario/categorias', verificarRol(['AD', 'TI']), activoMobiliarioCatalogoController.createCategoria);
router.get('/mobiliario/departamentos', activoMobiliarioCatalogoController.getDepartamentos);
router.post('/mobiliario/departamentos', verificarRol(['AD', 'TI']), activoMobiliarioCatalogoController.createDepartamento);

module.exports = router;
