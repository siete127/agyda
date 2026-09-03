const express = require('express');
const router = express.Router();
const catalogosTiController = require('../controllers/catalogosTiController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

// Sedes — lectura abierta a cualquiera con acceso a Tickets (se usa al crear un
// ticket), no solo a quien administra Configuración; escritura sigue restringida.
router.get('/sedes', requireActionAccess('tickets', 'ver'), catalogosTiController.getSedes);
router.post('/sedes', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createSede);
router.put('/sedes/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateSede);
router.patch('/sedes/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleSedeActiva);

// Categorías / Subcategorías — lectura abierta a Tickets, misma razón que Sedes.
router.get('/categorias', requireActionAccess('tickets', 'ver'), catalogosTiController.getCategorias);
router.post('/categorias', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createCategoria);
router.put('/categorias/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateCategoria);
router.patch('/categorias/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleCategoriaActiva);

router.post('/subcategorias', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createSubcategoria);
router.put('/subcategorias/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateSubcategoria);
router.patch('/subcategorias/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleSubcategoriaActiva);

// Elementos (tercer nivel, colgado de subcategoría)
router.post('/elementos', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createElemento);
router.put('/elementos/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateElemento);
router.patch('/elementos/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleElementoActivo);

// Especialidades
router.get('/especialidades', requireActionAccess('configuracion', 'ver'), catalogosTiController.getEspecialidades);
router.post('/especialidades', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createEspecialidad);
router.put('/especialidades/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateEspecialidad);
router.patch('/especialidades/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleEspecialidadActiva);

// Códigos de cierre — lectura abierta a Tickets (se usa al resolver un ticket).
router.get('/codigos-cierre', requireActionAccess('tickets', 'ver'), catalogosTiController.getCodigosCierre);
router.post('/codigos-cierre', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createCodigoCierre);
router.put('/codigos-cierre/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateCodigoCierre);
router.patch('/codigos-cierre/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleCodigoCierreActiva);

// Clasificaciones — lectura abierta a Tickets (se usa al crear un ticket).
router.get('/clasificaciones', requireActionAccess('tickets', 'ver'), catalogosTiController.getClasificaciones);
router.post('/clasificaciones', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createClasificacion);
router.put('/clasificaciones/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateClasificacion);
router.patch('/clasificaciones/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleClasificacionActiva);

// Motivos de espera — lectura abierta a Tickets (se usa al poner un ticket en espera).
router.get('/motivos-espera', requireActionAccess('tickets', 'ver'), catalogosTiController.getMotivosEspera);
router.post('/motivos-espera', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createMotivoEspera);
router.put('/motivos-espera/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateMotivoEspera);
router.patch('/motivos-espera/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleMotivoEsperaActiva);

// Impactos/Urgencias/Matriz de prioridad — lectura abierta a Tickets (se usan al crear un ticket).
router.get('/impactos', requireActionAccess('tickets', 'ver'), catalogosTiController.getImpactos);
router.post('/impactos', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createImpacto);
router.put('/impactos/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateImpacto);
router.patch('/impactos/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleImpactoActiva);

router.get('/urgencias', requireActionAccess('tickets', 'ver'), catalogosTiController.getUrgencias);
router.post('/urgencias', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createUrgencia);
router.put('/urgencias/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateUrgencia);
router.patch('/urgencias/:id/activa', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleUrgenciaActiva);

router.get('/matriz-prioridad', requireActionAccess('tickets', 'ver'), catalogosTiController.getMatrizPrioridad);
router.put('/matriz-prioridad', requireActionAccess('configuracion', 'configurar'), catalogosTiController.setCeldaMatrizPrioridad);

// Proveedores — lectura abierta a Tickets (se usa al escalar un ticket a Nivel 3).
router.get('/proveedores', requireActionAccess('tickets', 'ver'), catalogosTiController.getProveedores);
router.post('/proveedores', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createProveedor);
router.put('/proveedores/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateProveedor);
router.patch('/proveedores/:id/activo', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleProveedorActivo);

// Servicios — lectura abierta a Tickets (servicio afectado al crear un ticket).
router.get('/servicios', requireActionAccess('tickets', 'ver'), catalogosTiController.getServicios);
router.post('/servicios', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createServicio);
router.put('/servicios/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateServicio);
router.patch('/servicios/:id/activo', requireActionAccess('configuracion', 'configurar'), catalogosTiController.toggleServicioActivo);

// Config general (zona horaria informativa)
router.get('/config-general', requireActionAccess('configuracion', 'ver'), catalogosTiController.getConfigGeneral);
router.put('/config-general', requireActionAccess('configuracion', 'configurar'), catalogosTiController.updateConfigGeneral);

// Días festivos (excluidos del cálculo de SLA)
router.get('/dias-festivos', requireActionAccess('configuracion', 'ver'), catalogosTiController.getDiasFestivos);
router.post('/dias-festivos', requireActionAccess('configuracion', 'configurar'), catalogosTiController.createDiaFestivo);
router.delete('/dias-festivos/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.deleteDiaFestivo);

// Integraciones (placeholder clave/valor, sin cifrado)
router.get('/integraciones', requireActionAccess('configuracion', 'ver'), catalogosTiController.getIntegraciones);
router.put('/integraciones', requireActionAccess('configuracion', 'configurar'), catalogosTiController.setIntegracion);
router.delete('/integraciones/:id', requireActionAccess('configuracion', 'configurar'), catalogosTiController.deleteIntegracion);

module.exports = router;
