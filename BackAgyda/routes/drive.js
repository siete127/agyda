const express = require('express');
const router = express.Router();
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const driveController = require('../controllers/driveController');
const { uploadDriveFile, ensureUserDefaultFolder } = require('../middleware/driveUpload');

// 🔹 Ruta pública para previsualización con token temporal (ANTES de authenticateToken)
router.get('/archivos/public/:token', driveController.previsualizarArchivoPublico);

// Todas las demás rutas requieren token
router.use(authenticateToken);

// Usuarios disponibles para compartir
router.get('/usuarios', driveController.listUsuarios);

// Carpetas
router.get('/carpetas', requireActionAccess('drive', 'ver'), driveController.listCarpetas);
router.post('/carpetas', requireActionAccess('drive', 'subir-archivo'), driveController.createCarpeta);
router.delete('/carpetas/:id', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'eliminar'), driveController.deleteCarpeta);
router.get('/carpetas/:id/permisos', requireActionAccess('drive', 'ver'), driveController.getPermisosCarpeta);
router.post('/carpetas/:id/permisos', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'gestionar-permisos'), driveController.setPermisosCarpeta);
router.post('/carpetas/:id/renombrar', verificarRol(['AD']), requireActionAccess('drive', 'gestionar-permisos'), driveController.renombrarCarpeta);
router.post('/carpetas/:id/compartir', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'compartir'), driveController.compartirCarpeta);
router.get('/carpetas/:id/compartidos', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'ver'), driveController.getCompartidosCarpeta);
router.delete('/carpetas/:id/compartidos/:usuarioId', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'compartir'), driveController.revocarAccesoCarpeta);

// Archivos
router.get('/archivos', requireActionAccess('drive', 'ver'), driveController.listArchivos);
router.post('/archivos', requireActionAccess('drive', 'subir-archivo'), ensureUserDefaultFolder, uploadDriveFile.any(), driveController.uploadArchivo);
router.get('/archivos/:id/descargar', requireActionAccess('drive', 'ver'), driveController.descargarArchivo);
router.get('/archivos/:id/preview', requireActionAccess('drive', 'ver'), driveController.previsualizarArchivo);
router.post('/archivos/:id/token-preview', requireActionAccess('drive', 'ver'), driveController.generarTokenPreview);
router.delete('/archivos/:id', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'eliminar'), driveController.borrarArchivo);
router.post('/archivos/:id/compartir', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'compartir'), driveController.compartirArchivo);
router.get('/archivos/:id/compartidos', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'ver'), driveController.getCompartidosArchivo);
router.delete('/archivos/:id/compartidos/:usuarioId', verificarRol(['AD', 'TI', 'ADMIN', 'ADM']), requireActionAccess('drive', 'compartir'), driveController.revocarAccesoArchivo);

// Compartidos (listado para el usuario)
router.get('/compartidos', driveController.listCompartidos);
router.get('/carpetas/compartidas', driveController.listCarpetasCompartidas);

module.exports = router;
