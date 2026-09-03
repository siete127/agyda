const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/personalizacionController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadPersonalizacion } = require('../middleware/personalizacionUpload');
const { uploadMediaEmpresa } = require('../middleware/mediaEmpresaUpload');

// Lectura: cualquier usuario autenticado (el frontend la necesita para pintar
// logo/colores). Servir un asset también solo requiere sesión.
router.get('/', authenticateToken, ctrl.getPersonalizacion);
router.get('/assets/:id/ver', authenticateToken, ctrl.verAsset);
router.get('/media/:id', authenticateToken, ctrl.verMediaEmpresa);

// Edición: admin (AD) con la acción configuracion/configurar.
const soloAdminConfig = [authenticateToken, verificarRol(['AD']), requireActionAccess('configuracion', 'configurar')];

router.put('/branding', ...soloAdminConfig, ctrl.updateBranding);
router.put('/header-buttons', ...soloAdminConfig, ctrl.updateHeaderButtons);
router.put('/institucional', ...soloAdminConfig, ctrl.updateInstitucional);
router.put('/enlaces-topbar', ...soloAdminConfig, ctrl.updateEnlacesTopbar);
router.put('/dashboard', ...soloAdminConfig, ctrl.updateDashboard);
router.put('/mascota', ...soloAdminConfig, ctrl.updateMascota);
router.post('/assets', ...soloAdminConfig, uploadPersonalizacion.single('archivo'), ctrl.subirAsset);
router.post('/mascota/media', ...soloAdminConfig, uploadMediaEmpresa.single('archivo'), ctrl.subirMascotaMedia);

module.exports = router;
