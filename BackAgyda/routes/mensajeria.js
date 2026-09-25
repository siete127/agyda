const express = require('express');
const router = express.Router();
const mensajeriaController = require('../controllers/mensajeriaController');
const mensajeriaConfigController = require('../controllers/mensajeriaConfigController');
const { uploadMensajeriaArchivo } = require('../middleware/mensajeriaUpload');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Usuarios del Portal de Cliente (CL): solo usan el chat con su asesor, que se
// abre desde /api/portal-cliente/asesor/chat. No pueden abrir chats con otros
// empleados, crear grupos, cambiar miembros ni adjuntar desde el Drive.
const soloInternos = (req, res, next) => (String(req.user?.tipoUsuario || '').toUpperCase() === 'CL'
  ? res.status(403).json({ success: false, message: 'No disponible desde el portal de cliente' })
  : next());

// Todas las rutas requieren sesión. DM/lectura solo requieren 'ver'; crear grupo requiere 'crear-canal'.
router.get('/canales', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.getMisCanales);
router.post('/dm', authenticateToken, soloInternos, requireActionAccess('mensajeria', 'ver'), mensajeriaController.crearOReusarDM);
router.post('/grupos', authenticateToken, soloInternos, requireActionAccess('mensajeria', 'crear-canal'), mensajeriaController.crearGrupo);

// Preferencias personales del usuario (burbuja flotante, tema, colores, adjuntos).
router.get('/mi-config', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaConfigController.getMiConfig);
router.put('/mi-config', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaConfigController.actualizarMiConfig);

router.get('/canales/:canalId', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.getCanal);
router.put('/canales/:canalId', authenticateToken, soloInternos, requireActionAccess('mensajeria', 'ver'), mensajeriaController.actualizarGrupo);

router.get('/canales/:canalId/mensajes', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.getMensajes);
router.post('/canales/:canalId/mensajes', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.enviarMensaje);
router.post('/canales/:canalId/leido', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.marcarLeido);
router.post('/canales/:canalId/archivo', authenticateToken, requireActionAccess('mensajeria', 'ver'), uploadMensajeriaArchivo.single('archivo'), mensajeriaController.subirArchivo);
router.post('/canales/:canalId/archivo-drive', authenticateToken, soloInternos, requireActionAccess('mensajeria', 'ver'), mensajeriaController.adjuntarDesdeDrive);

router.put('/mensajes/:mensajeId', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.editarMensaje);
router.delete('/mensajes/:mensajeId', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.eliminarMensaje);

router.post('/mensajes/:mensajeId/reacciones', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.reaccionarMensaje);
router.delete('/mensajes/:mensajeId/reacciones', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.quitarReaccion);

router.post('/canales/:canalId/miembros', authenticateToken, soloInternos, requireActionAccess('mensajeria', 'ver'), mensajeriaController.agregarMiembros);
router.delete('/canales/:canalId/miembros/:usuarioId', authenticateToken, soloInternos, requireActionAccess('mensajeria', 'ver'), mensajeriaController.quitarMiembro);
router.post('/canales/:canalId/salir', authenticateToken, requireActionAccess('mensajeria', 'ver'), mensajeriaController.salirDeGrupo);

module.exports = router;
