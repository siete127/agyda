const express = require('express');
const router = express.Router();
const controller = require('../controllers/proteccionDatosController');
const auth = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadRatAdjuntos } = require('../middleware/ratAdjuntoUpload');

const ratCrear = requireActionAccess('legal', 'rat-crear');
const ratEditar = requireActionAccess('legal', 'rat-editar');
const ratEliminar = requireActionAccess('legal', 'rat-eliminar');
const ratExportar = requireActionAccess('legal', 'rat-exportar');

router.get('/resumen', auth.authenticateToken, controller.getResumen);
router.get('/export/pdf', auth.authenticateToken, ratExportar, controller.exportarPdf);

router.get('/', auth.authenticateToken, controller.listActividades);
router.get('/:id', auth.authenticateToken, controller.getActividad);
router.post('/', auth.authenticateToken, ratCrear, controller.crearActividad);
router.put('/:id', auth.authenticateToken, ratEditar, controller.actualizarActividad);
router.put('/:id/marcar-revisada', auth.authenticateToken, ratEditar, controller.marcarRevisada);
router.put('/:id/estatus', auth.authenticateToken, ratEditar, controller.cambiarEstatus);
router.delete('/:id', auth.authenticateToken, ratEliminar, controller.eliminarActividad);

router.get('/:id/adjuntos', auth.authenticateToken, controller.listAdjuntos);
router.post('/:id/adjuntos', auth.authenticateToken, ratEditar, uploadRatAdjuntos.array('adjuntos', 5), controller.subirAdjuntos);
router.delete('/adjuntos/:id', auth.authenticateToken, ratEditar, controller.eliminarAdjunto);
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
