const express = require('express');
const router = express.Router();
const controller = require('../controllers/marketingController');
const disenoController = require('../controllers/disenoController');
const publicidadController = require('../controllers/publicidadController');
const contenidoController = require('../controllers/contenidoController');
const imagenCorporativaController = require('../controllers/imagenCorporativaController');
const auth = require('../middleware/auth');
const { uploadMarketingPostImagen } = require('../middleware/marketingPostImagenUpload');
const { uploadDisenoAdjuntos } = require('../middleware/disenoAdjuntoUpload');
const { uploadPublicidadImagen } = require('../middleware/publicidadImagenUpload');
const { uploadContenidoAdjuntos } = require('../middleware/contenidoAdjuntoUpload');
const { uploadImagenCorporativa } = require('../middleware/imagenCorporativaUpload');

router.get('/campanias', auth.authenticateToken, controller.listCampanias);
router.post('/campanias', auth.authenticateToken, controller.crearCampania);
router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/resultados', auth.authenticateToken, controller.getResultados);

router.get('/redes/dashboard', auth.authenticateToken, controller.getDashboardRedes);

router.get('/redes/cuentas', auth.authenticateToken, controller.listCuentas);
router.post('/redes/cuentas', auth.authenticateToken, controller.crearCuenta);
router.put('/redes/cuentas/:id', auth.authenticateToken, controller.actualizarCuenta);
router.delete('/redes/cuentas/:id', auth.authenticateToken, controller.eliminarCuenta);

router.get('/redes/posts', auth.authenticateToken, controller.listPosts);
router.post('/redes/posts', auth.authenticateToken, controller.crearPost);
router.put('/redes/posts/:id', auth.authenticateToken, controller.actualizarPost);
router.delete('/redes/posts/:id', auth.authenticateToken, controller.eliminarPost);

router.post('/redes/posts/:id/imagen', auth.authenticateToken, uploadMarketingPostImagen.single('imagen'), controller.subirImagenPost);
router.get('/redes/posts/:id/imagen/ver', auth.authenticateToken, controller.verImagenPost);

router.get('/redes/posts/:id/metricas', auth.authenticateToken, controller.getMetricas);
router.put('/redes/posts/:id/metricas', auth.authenticateToken, controller.guardarMetricas);

// ── Diseño (solicitudes y entregables) ──────────────────────────────────
router.get('/diseno/tipos', auth.authenticateToken, disenoController.listTipos);
router.post('/diseno/tipos', auth.authenticateToken, disenoController.crearTipo);
router.put('/diseno/tipos/:id', auth.authenticateToken, disenoController.actualizarTipo);
router.delete('/diseno/tipos/:id', auth.authenticateToken, disenoController.eliminarTipo);

router.get('/diseno/resumen', auth.authenticateToken, disenoController.getResumen);
router.get('/diseno/solicitudes', auth.authenticateToken, disenoController.listSolicitudes);
router.post('/diseno/solicitudes', auth.authenticateToken, disenoController.crearSolicitud);
router.get('/diseno/solicitudes/:id', auth.authenticateToken, disenoController.getSolicitud);
router.put('/diseno/solicitudes/:id/tomar', auth.authenticateToken, disenoController.tomarSolicitud);
router.put('/diseno/solicitudes/:id/enviar-revision', auth.authenticateToken, disenoController.enviarARevision);
router.put('/diseno/solicitudes/:id/aprobar', auth.authenticateToken, disenoController.aprobarEntrega);
router.put('/diseno/solicitudes/:id/solicitar-cambios', auth.authenticateToken, disenoController.solicitarCambios);
router.put('/diseno/solicitudes/:id/cancelar', auth.authenticateToken, disenoController.cancelarSolicitud);

router.get('/diseno/solicitudes/:id/comentarios', auth.authenticateToken, disenoController.listComentarios);
router.post('/diseno/solicitudes/:id/comentarios', auth.authenticateToken, disenoController.crearComentario);
router.delete('/diseno/comentarios/:id', auth.authenticateToken, disenoController.eliminarComentario);

router.get('/diseno/solicitudes/:id/adjuntos', auth.authenticateToken, disenoController.listAdjuntos);
router.post('/diseno/solicitudes/:id/adjuntos', auth.authenticateToken, uploadDisenoAdjuntos.array('adjuntos', 5), disenoController.subirAdjuntos);
router.delete('/diseno/adjuntos/:id', auth.authenticateToken, disenoController.eliminarAdjunto);
router.get('/diseno/adjuntos/:id/ver', auth.authenticateToken, disenoController.verAdjunto);

// ── Publicidad (campañas pagadas) ────────────────────────────────────────
router.get('/publicidad/dashboard', auth.authenticateToken, publicidadController.getDashboard);

router.get('/publicidad/campanias', auth.authenticateToken, publicidadController.listCampanias);
router.post('/publicidad/campanias', auth.authenticateToken, publicidadController.crearCampania);
router.put('/publicidad/campanias/:id', auth.authenticateToken, publicidadController.actualizarCampania);
router.delete('/publicidad/campanias/:id', auth.authenticateToken, publicidadController.eliminarCampania);

router.get('/publicidad/campanias/:id/anuncios', auth.authenticateToken, publicidadController.listAnuncios);
router.post('/publicidad/campanias/:id/anuncios', auth.authenticateToken, publicidadController.crearAnuncio);
router.put('/publicidad/anuncios/:id', auth.authenticateToken, publicidadController.actualizarAnuncio);
router.delete('/publicidad/anuncios/:id', auth.authenticateToken, publicidadController.eliminarAnuncio);

router.post('/publicidad/anuncios/:id/imagen', auth.authenticateToken, uploadPublicidadImagen.single('imagen'), publicidadController.subirImagenAnuncio);
router.get('/publicidad/anuncios/:id/imagen/ver', auth.authenticateToken, publicidadController.verImagenAnuncio);

router.get('/publicidad/anuncios/:id/metricas', auth.authenticateToken, publicidadController.getMetricas);
router.put('/publicidad/anuncios/:id/metricas', auth.authenticateToken, publicidadController.guardarMetricas);

// ── Contenido (calendario editorial multicanal) ──────────────────────────
router.get('/contenido/tipos', auth.authenticateToken, contenidoController.listTipos);
router.post('/contenido/tipos', auth.authenticateToken, contenidoController.crearTipo);
router.put('/contenido/tipos/:id', auth.authenticateToken, contenidoController.actualizarTipo);
router.delete('/contenido/tipos/:id', auth.authenticateToken, contenidoController.eliminarTipo);

router.get('/contenido/resumen', auth.authenticateToken, contenidoController.getResumen);
router.get('/contenido/piezas', auth.authenticateToken, contenidoController.listPiezas);
router.post('/contenido/piezas', auth.authenticateToken, contenidoController.crearPieza);
router.put('/contenido/piezas/:id', auth.authenticateToken, contenidoController.actualizarPieza);
router.delete('/contenido/piezas/:id', auth.authenticateToken, contenidoController.eliminarPieza);
router.put('/contenido/piezas/:id/enviar-revision', auth.authenticateToken, contenidoController.enviarARevision);
router.put('/contenido/piezas/:id/aprobar', auth.authenticateToken, contenidoController.aprobarPieza);
router.put('/contenido/piezas/:id/solicitar-cambios', auth.authenticateToken, contenidoController.solicitarCambios);

router.get('/contenido/piezas/:id/comentarios', auth.authenticateToken, contenidoController.listComentarios);
router.post('/contenido/piezas/:id/comentarios', auth.authenticateToken, contenidoController.crearComentario);
router.delete('/contenido/comentarios/:id', auth.authenticateToken, contenidoController.eliminarComentario);

router.get('/contenido/piezas/:id/adjuntos', auth.authenticateToken, contenidoController.listAdjuntos);
router.post('/contenido/piezas/:id/adjuntos', auth.authenticateToken, uploadContenidoAdjuntos.array('adjuntos', 5), contenidoController.subirAdjuntos);
router.delete('/contenido/adjuntos/:id', auth.authenticateToken, contenidoController.eliminarAdjunto);
router.get('/contenido/adjuntos/:id/ver', auth.authenticateToken, contenidoController.verAdjunto);

// ── Imagen corporativa (repositorio de assets de marca) ──────────────────
const ADMIN_ROLES = ['Administrador', 'admin', 'AD', 'ADM'];
router.get('/imagen-corporativa/assets', auth.authenticateToken, imagenCorporativaController.listAssets);
router.post('/imagen-corporativa/assets', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), uploadImagenCorporativa.single('archivo'), imagenCorporativaController.subirAsset);
router.put('/imagen-corporativa/assets/:id', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), imagenCorporativaController.actualizarAsset);
router.delete('/imagen-corporativa/assets/:id', auth.authenticateToken, auth.verificarRol(ADMIN_ROLES), imagenCorporativaController.eliminarAsset);
router.get('/imagen-corporativa/assets/:id/ver', auth.authenticateToken, imagenCorporativaController.verAsset);

// Manejo de errores de Multer (imagen demasiado grande o tipo no permitido)
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
