const express = require('express');
const router = express.Router();
const reglamentoController = require('../controllers/reglamentoController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadReglamento } = require('../middleware/reglamentoUpload');

// Status puede ser público pero autenticado da contexto correcto del usuario
router.get('/status', authenticateToken, reglamentoController.getStatus);
// Aceptar reglamento: requiere autenticación básica
router.post('/accept', authenticateToken, requireActionAccess('reglamento', 'aceptar'), reglamentoController.acceptReglamento);
// Acciones administrativas: solo roles de administración (AD y TI)
router.post('/bump', authenticateToken, verificarRol(['AD','TI','ADM','admin','Administrador']), requireActionAccess('reglamento', 'gestionar'), reglamentoController.bumpVersion);
// Reemplazar el archivo PDF del reglamento y publicar nueva versión automáticamente
router.post('/upload', authenticateToken, verificarRol(['AD','TI','ADM','admin','Administrador']), requireActionAccess('reglamento', 'gestionar'), uploadReglamento.single('file'), reglamentoController.uploadPdf);
router.get('/users-status', authenticateToken, verificarRol(['AD','TI','ADM','admin','Administrador']), requireActionAccess('reglamento', 'gestionar'), reglamentoController.getUsersStatus);
router.post('/reset-user', authenticateToken, verificarRol(['AD','TI','ADM','admin','Administrador']), requireActionAccess('reglamento', 'gestionar'), reglamentoController.resetUser);
router.post('/reset-all', authenticateToken, verificarRol(['AD','TI','ADM','admin','Administrador']), requireActionAccess('reglamento', 'gestionar'), reglamentoController.resetAll);
// Servir PDFs (reglamento / aviso). Autenticado para control de acceso al perfil
router.get('/pdf', authenticateToken, reglamentoController.getPdf);

module.exports = router;
