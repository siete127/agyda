const express = require('express');
const router = express.Router();
const legalesController = require('../controllers/legalesController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configuración de Multer para guardar en la carpeta de IIS
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'C:/inetpub/wwwroot/intranet/intranet/Legales');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Listar documentos legales (acceso de lectura público)
router.get('/', legalesController.listarDocumentos);
// Dashboard de documentos legales — antes de '/:filename' para que no la capture
router.get('/dashboard', auth.authenticateToken, legalesController.getDashboard);
// Servir documento directamente (inline) desde filesystem: /api/legales/view/:filename
router.get('/view/:filename', legalesController.viewDocumento);
// Subir documento legal (solo admin)
router.post('/upload', auth.authenticateToken, auth.verificarRol(['Administrador','admin','AD','ADM']), upload.single('documento'), legalesController.subirDocumento);
// Actualizar/reemplazar documento legal (solo admin)
router.put('/:filename', auth.authenticateToken, auth.verificarRol(['Administrador','admin','AD','ADM']), upload.single('documento'), legalesController.actualizarDocumento);
// Eliminar documento legal (solo admin)
router.delete('/:filename', auth.authenticateToken, auth.verificarRol(['Administrador','admin','AD','ADM']), legalesController.eliminarDocumento);

module.exports = router;
