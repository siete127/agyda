const express = require('express');
const router = express.Router();
const controller = require('../controllers/cumplimientoNormativoController');
const auth = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadCumplimientoAdjuntos } = require('../middleware/cumplimientoAdjuntoUpload');

const obligacionCrear = requireActionAccess('legal', 'obligacion-crear');
const obligacionEditar = requireActionAccess('legal', 'obligacion-editar');
const obligacionEliminar = requireActionAccess('legal', 'obligacion-eliminar');
const obligacionMarcarCumplida = requireActionAccess('legal', 'obligacion-marcar-cumplida');
const obligacionExportar = requireActionAccess('legal', 'obligacion-exportar');

router.get('/resumen', auth.authenticateToken, controller.getResumen);
router.get('/export/pdf', auth.authenticateToken, obligacionExportar, controller.exportarPdf);

router.get('/', auth.authenticateToken, controller.listObligaciones);
router.get('/:id', auth.authenticateToken, controller.getObligacion);
router.post('/', auth.authenticateToken, obligacionCrear, controller.crearObligacion);
router.put('/:id', auth.authenticateToken, obligacionEditar, controller.actualizarObligacion);
router.put('/:id/marcar-cumplida', auth.authenticateToken, obligacionMarcarCumplida, controller.marcarCumplida);
router.delete('/:id', auth.authenticateToken, obligacionEliminar, controller.eliminarObligacion);

router.get('/:id/historial', auth.authenticateToken, controller.listHistorial);

router.get('/:id/adjuntos', auth.authenticateToken, controller.listAdjuntos);
router.post('/:id/adjuntos', auth.authenticateToken, obligacionEditar, uploadCumplimientoAdjuntos.array('adjuntos', 5), controller.subirAdjuntos);
router.delete('/adjuntos/:id', auth.authenticateToken, obligacionEditar, controller.eliminarAdjunto);
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
