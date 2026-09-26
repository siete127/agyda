const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/horarioAsesorController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Horario de disponibilidad por asesor. El asesor PROPONE el suyo propio
// (sin permiso especial, como cualquiera edita su propia ficha); un
// supervisor con el permiso 'gestionar' del módulo 'horario-asesores'
// aprueba/rechaza esas propuestas (editando o no) — solo lo aprobado queda
// vigente. Mismo patrón que "sobre la cuenta de OTRO se exige la acción;
// sobre la propia, siempre se permite" ya usado en routes/usuarios.js.
const siEsDeOtro = (accion) => (req, res, next) => {
  const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
  if (uid && String(uid) === String(req.params.usuarioId)) return next();
  return requireActionAccess('horario-asesores', accion)(req, res, next);
};

router.get('/propuestas/pendientes', authenticateToken, requireActionAccess('horario-asesores', 'gestionar'), ctrl.listarPropuestasPendientes);
router.post('/propuestas/:propuestaId/resolver', authenticateToken, requireActionAccess('horario-asesores', 'gestionar'), ctrl.resolverPropuesta);

router.get('/:usuarioId', authenticateToken, siEsDeOtro('ver-todos'), ctrl.getHorario);
router.get('/:usuarioId/propuesta', authenticateToken, siEsDeOtro('ver-todos'), ctrl.getMiPropuestaPendiente);
router.post('/:usuarioId/proponer', authenticateToken, siEsDeOtro('gestionar'), ctrl.proponerHorario);

module.exports = router;
