const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalRolesController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// CRUD de sub-roles del Portal de Cliente — para empleados internos de AGYDA,
// no para las empresas cliente (esas gestionan sus propios usuarios desde
// /api/portal-cliente/usuarios, con requirePortalAction('gestionar-usuarios')).
const soloGestionRoles = [authenticateToken, requireActionAccess('clientes', 'gestionar-portal-roles')];

router.get('/acciones', ...soloGestionRoles, ctrl.listAcciones);
router.get('/', ...soloGestionRoles, ctrl.listRoles);
router.get('/:id', ...soloGestionRoles, ctrl.getRole);
router.post('/', ...soloGestionRoles, ctrl.createRole);
router.put('/:id', ...soloGestionRoles, ctrl.updateRole);
router.delete('/:id', ...soloGestionRoles, ctrl.deleteRole);

module.exports = router;
