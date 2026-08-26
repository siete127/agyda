const express = require('express');
const router = express.Router();
const accesoController = require('../controllers/accesoController');
const empresaModulosController = require('../controllers/empresaModulosController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Rutas públicas para usuarios autenticados: obtener sus propios accesos
router.get('/self', authenticateToken, accesoController.getSelfAccess);
router.get('/self-actions', authenticateToken, accesoController.getSelfActions);

// A partir de aquí, rutas sólo para AD/Admin
router.use(authenticateToken, requireAdmin);

// Obtener módulos disponibles
router.get('/modules', accesoController.getModules);

// Catálogo de acciones granulares por módulo
router.get('/actions/catalog', accesoController.getAllModuleActions);
router.get('/actions/catalog/:moduloKey', accesoController.getModuleActions);

// Empresas (multi-tenant) — el propio controller restringe a los 2
// super-admins fijos; debe ir antes de /:usuarioId para no ser capturada
// por ese parámetro genérico.
router.get('/empresas', accesoController.listEmpresas);
router.post('/empresas', accesoController.createEmpresa);

// Módulos activos por empresa completa (no por usuario) — igual restricción
// a los 2 super-admins fijos, validada dentro del controller. También antes
// de /:usuarioId por el mismo motivo que /empresas arriba.
router.get('/empresas/:empKey/modulos', empresaModulosController.getEmpresaModulos);
router.put('/empresas/:empKey/modulos/:moduloKey', empresaModulosController.setEmpresaModulo);

// Accesos por usuario (gestión admin) — lectura libre para cualquier AD, escritura
// requiere el permiso explícito accesos/gestionar (solo super-admins por defecto)
router.get('/:usuarioId', accesoController.getUserAccess);
router.put('/:usuarioId', requireActionAccess('accesos', 'gestionar'), accesoController.setUserAccess);
router.post('/:usuarioId/:moduloKey/grant', requireActionAccess('accesos', 'gestionar'), accesoController.grantModule);
router.post('/:usuarioId/:moduloKey/revoke', requireActionAccess('accesos', 'gestionar'), accesoController.revokeModule);

// Acciones granulares por usuario y módulo
router.get('/:usuarioId/actions', accesoController.getUserActions);
router.put('/:usuarioId/actions/:moduloKey', requireActionAccess('accesos', 'gestionar'), accesoController.setModuleActions);

module.exports = router;
