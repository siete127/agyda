const express = require('express');
const router = express.Router();
const controller = require('../controllers/controlDocumentalController');
const auth = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadControlDocumental } = require('../middleware/controlDocumentalUpload');

const documentoCrear = requireActionAccess('legal', 'documento-crear');
const documentoEditar = requireActionAccess('legal', 'documento-editar');
const documentoEliminar = requireActionAccess('legal', 'documento-eliminar');
const documentoSubirVersion = requireActionAccess('legal', 'documento-subir-version');
const documentoExportar = requireActionAccess('legal', 'documento-exportar');

router.get('/resumen', auth.authenticateToken, controller.getResumen);
router.get('/export/pdf', auth.authenticateToken, documentoExportar, controller.exportarPdf);

router.get('/', auth.authenticateToken, controller.listDocumentos);
router.get('/:id', auth.authenticateToken, controller.getDocumento);
router.post('/', auth.authenticateToken, documentoCrear, uploadControlDocumental.single('archivo'), controller.crearDocumento);
router.put('/:id/metadata', auth.authenticateToken, documentoEditar, controller.actualizarMetadata);
router.put('/:id/estado', auth.authenticateToken, documentoEditar, controller.cambiarEstadoVigencia);
router.delete('/:id', auth.authenticateToken, documentoEliminar, controller.eliminarDocumento);

router.get('/:id/versiones', auth.authenticateToken, controller.listVersiones);
router.post('/:id/versiones', auth.authenticateToken, documentoSubirVersion, uploadControlDocumental.single('archivo'), controller.subirNuevaVersion);
router.get('/versiones/:id/ver', auth.authenticateToken, controller.verVersion);

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
