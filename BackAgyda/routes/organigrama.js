const express = require('express');
const router = express.Router();
const organigramaController = require('../controllers/organigramaController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Obtener árbol completo (público: visible para todos)
// Nota: Se deja sin autenticación para evitar errores 401/403 en vistas públicas.
router.get('/tree', organigramaController.getTree);
// Crear nodo (solo AD / admin)
router.post('/nodo', authenticateToken, requireAdmin, requireActionAccess('organigrama', 'gestionar-nodos'), organigramaController.createNode);
// Actualizar nodo
router.put('/nodo/:id', authenticateToken, requireAdmin, requireActionAccess('organigrama', 'gestionar-nodos'), organigramaController.updateNode);
// Eliminar nodo (soft delete)
router.delete('/nodo/:id', authenticateToken, requireAdmin, requireActionAccess('organigrama', 'gestionar-nodos'), organigramaController.deleteNode);
// Mover nodo
router.patch('/nodo/:id/mover', authenticateToken, requireAdmin, requireActionAccess('organigrama', 'gestionar-nodos'), organigramaController.moveNode);

module.exports = router;
