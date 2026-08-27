const express = require('express');
const router = express.Router();
const catalogosTiController = require('../controllers/catalogosTiController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

// Sedes
router.get('/sedes', requireActionAccess('configuracion', 'ver'), catalogosTiController.getSedes);
router.post('/sedes', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createSede);
router.put('/sedes/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateSede);
router.patch('/sedes/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleSedeActiva);

// Categorías / Subcategorías
router.get('/categorias', requireActionAccess('configuracion', 'ver'), catalogosTiController.getCategorias);
router.post('/categorias', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createCategoria);
router.put('/categorias/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateCategoria);
router.patch('/categorias/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleCategoriaActiva);

router.post('/subcategorias', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createSubcategoria);
router.put('/subcategorias/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateSubcategoria);
router.patch('/subcategorias/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleSubcategoriaActiva);

// Especialidades
router.get('/especialidades', requireActionAccess('configuracion', 'ver'), catalogosTiController.getEspecialidades);
router.post('/especialidades', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createEspecialidad);
router.put('/especialidades/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateEspecialidad);
router.patch('/especialidades/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleEspecialidadActiva);

// Proveedores
router.get('/proveedores', requireActionAccess('configuracion', 'ver'), catalogosTiController.getProveedores);
router.post('/proveedores', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createProveedor);
router.put('/proveedores/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateProveedor);
router.patch('/proveedores/:id/activo', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleProveedorActivo);

// Servicios
router.get('/servicios', requireActionAccess('configuracion', 'ver'), catalogosTiController.getServicios);
router.post('/servicios', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createServicio);
router.put('/servicios/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateServicio);
router.patch('/servicios/:id/activo', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleServicioActivo);

// Integraciones (placeholder clave/valor, sin cifrado)
router.get('/integraciones', requireActionAccess('configuracion', 'ver'), catalogosTiController.getIntegraciones);
router.put('/integraciones', requireActionAccess('configuracion', 'configurar'), catalogosTiController.setIntegracion);
router.delete('/integraciones/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.deleteIntegracion);

module.exports = router;
