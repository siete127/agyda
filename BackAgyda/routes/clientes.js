const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const portalUsuarios = require('../controllers/portalUsuariosController');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Usuarios del portal de un cliente gestionados desde AGYDA (Clientes → Editar):
// los mismos de "Usuarios" del portal (PORTAL_USUARIOS), tanto los que crea
// AGYDA como los que el cliente da de alta. Se reutiliza el controlador del
// portal fijando la empresa cliente (req.contacto) desde la URL.
function comoEmpresaCliente(handler) {
  return async (req, res) => {
    try {
      const contId = parseInt(req.params.id, 10);
      if (!Number.isInteger(contId) || contId <= 0) return res.status(400).json({ success: false, message: 'ID de cliente inválido' });
      const pool = await databaseService.getPool(req.user?.empresa);
      const ok = (await pool.request().input('id', sql.Int, contId)
        .query('SELECT 1 AS ok FROM CRM_CONTACTOS WHERE CONT_ID = @id AND CONT_ES_CLIENTE = 1')).recordset[0];
      if (!ok) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      req.contacto = { id: contId };
      // El controlador del portal lee el usuario en req.params.id.
      req.params = { ...req.params, id: req.params.puId };
      return handler(req, res);
    } catch (e) {
      console.error('Usuarios del cliente:', e);
      return res.status(500).json({ success: false, message: e.message });
    }
  };
}

router.use(authenticateToken);

router.get('/productos', requireActionAccess('clientes', 'ver'), clienteController.getProductos);
router.get('/servicios', requireActionAccess('clientes', 'ver'), clienteController.getServicios);
router.get('/', requireActionAccess('clientes', 'ver'), clienteController.getClientes);
router.post('/', requireActionAccess('clientes', 'crear'), clienteController.createCliente);
router.put('/:id', requireActionAccess('clientes', 'editar'), clienteController.updateCliente);
router.delete('/:id', requireActionAccess('clientes', 'eliminar'), clienteController.deleteCliente);

router.get('/:id/finanzas', requireActionAccess('clientes', 'ver'), clienteController.getFinanzasCliente);
router.get('/:id/productos-servicios', requireActionAccess('clientes', 'ver'), clienteController.getProductosServiciosCliente);
router.post('/:id/productos-servicios', requireActionAccess('clientes', 'editar'), clienteController.asignarProductoServicio);
router.delete('/:id/productos-servicios/:psId', requireActionAccess('clientes', 'editar'), clienteController.quitarProductoServicio);

router.get('/portal-subroles', requireActionAccess('clientes', 'ver'), portalUsuarios.listarSubrolesDisponibles);
router.get('/:id/usuarios', requireActionAccess('clientes', 'ver'), comoEmpresaCliente(portalUsuarios.listar));
router.post('/:id/usuarios', requireActionAccess('clientes', 'editar'), comoEmpresaCliente(portalUsuarios.crear));
router.put('/:id/usuarios/:puId', requireActionAccess('clientes', 'editar'), comoEmpresaCliente(portalUsuarios.actualizar));
router.post('/:id/usuarios/:puId/reenviar-acceso', requireActionAccess('clientes', 'editar'), comoEmpresaCliente(portalUsuarios.reenviarAcceso));
router.delete('/:id/usuarios/:puId', requireActionAccess('clientes', 'editar'), comoEmpresaCliente(portalUsuarios.eliminar));

module.exports = router;
