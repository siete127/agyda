const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/pausaTiposController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess, getEmpresaModulosBloqueados, esSuperAdminInmuneEmpresa } = require('../middleware/moduleAccess');

// Las pausas son parte del módulo 'reports' (acción gestionar-pausas): si la
// empresa lo tiene desactivado, sus tipos tampoco se pueden configurar.
async function empresaConPausas(req, res, next) {
  try {
    if (esSuperAdminInmuneEmpresa(req)) return next();
    const bloqueados = await getEmpresaModulosBloqueados(req.user?.empresa);
    if (bloqueados.has('reports')) {
      return res.status(403).json({ success: false, message: 'Módulo desactivado para tu empresa', modulo: 'reports' });
    }
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error verificando módulos de la empresa' });
  }
}

// Lectura: cualquier usuario autenticado (menú de estado, reportes, paneles).
router.get('/', authenticateToken, ctrl.list);

// Edición: mismo guard que el resto de Configuración (routes/personalizacion.js)
// + que la empresa tenga el módulo de pausas.
const soloAdminConfig = [authenticateToken, verificarRol(['AD']), requireActionAccess('configuracion', 'configurar'), empresaConPausas];

router.get('/areas', ...soloAdminConfig, ctrl.areas);
router.post('/', ...soloAdminConfig, ctrl.create);
router.put('/:id', ...soloAdminConfig, ctrl.update);
router.put('/:id/espacios', ...soloAdminConfig, ctrl.updateEspacios);
router.delete('/:id', ...soloAdminConfig, ctrl.remove);

module.exports = router;
