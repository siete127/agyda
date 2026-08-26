const express = require('express');
const router = express.Router();
const controller = require('../controllers/contratosController');
const auth = require('../middleware/auth');
const { uploadContratoAdjuntos } = require('../middleware/contratoAdjuntoUpload');

const ADMIN_ROLES = ['Administrador', 'admin', 'AD', 'ADM'];

router.get('/', auth.authenticateToken, controller.listContratos);
router.post('/', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), controller.crearContrato);
router.put('/:id', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), controller.actualizarContrato);
router.delete('/:id', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), controller.eliminarContrato);
router.put('/:id/renovar', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), controller.marcarRenovado);
router.put('/:id/cancelar', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), controller.cancelarContrato);
router.get('/resumen', auth.authenticateToken, controller.getResumen);

router.get('/:id/adjuntos', auth.authenticateToken, controller.listAdjuntos);
router.post('/:id/adjuntos', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), uploadContratoAdjuntos.array('adjuntos', 5), controller.subirAdjuntos);
router.delete('/adjuntos/:id', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), controller.eliminarAdjunto);
router.get('/adjuntos/:id/ver', auth.authenticateToken, controller.verAdjunto);

// Manejo de errores de Multer (archivo demasiado grande o tipo no permitido)
router.use((err, req, res, next) => {
  const multer = require('multer');
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Archivo demasiado grande (máximo 10MB)' });
    }
    return res.status(400).json({ success: false, message: err.message || 'Error de carga de archivo' });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message || 'Error de carga de archivo' });
  }
  next();
});

module.exports = router;
