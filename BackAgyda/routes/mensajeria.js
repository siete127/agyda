const express = require('express');
const router = express.Router();
const mensajeriaController = require('../controllers/mensajeriaController');
const mensajeriaConfigController = require('../controllers/mensajeriaConfigController');
const { uploadMensajeriaArchivo } = require('../middleware/mensajeriaUpload');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Todas las rutas requieren sesión. DM/lectura solo requieren 'ver'; crear grupo requiere 'crear-canal'.
router.get('/canales', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.getMisCanales);
router.post('/dm', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.crearOReusarDM);
router.post('/grupos', authenticateToken, requireActionAccess('mensajeria', 'crear-canal'), mensajeriaController.crearGrupo);

// Preferencias personales del usuario (burbuja flotante, tema, colores, adjuntos).
router.get('/mi-config', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaConfigController.getMiConfig);
router.put('/mi-config', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaConfigController.actualizarMiConfig);

router.get('/canales/:canalId', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.getCanal);
router.put('/canales/:canalId', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.actualizarGrupo);

router.get('/canales/:canalId/mensajes', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.getMensajes);
router.post('/canales/:canalId/mensajes', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.enviarMensaje);
router.post('/canales/:canalId/leido', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.marcarLeido);
router.post('/canales/:canalId/archivo', authenticateToken, requireActionAccess('mensajeria', 'ver'), uploadMensajeriaArchivo.single('archivo'), mensajeriaController.subirArchivo);
router.post('/canales/:canalId/archivo-drive', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.adjuntarDesdeDrive);

router.post('/canales/:canalId/miembros', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.agregarMiembros);
router.delete('/canales/:canalId/miembros/:usuarioId', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.quitarMiembro);
router.post('/canales/:canalId/salir', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.salirDeGrupo);

module.exports = router;
