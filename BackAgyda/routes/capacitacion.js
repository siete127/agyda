const express = require('express');
const router = express.Router();
const capacitacionController = require('../controllers/capacitacionController');
const capacitacionExamenController = require('../controllers/capacitacionExamenController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadMaterial } = require('../middleware/capacitacionUpload');

// ── Exámenes: público (sin sesión) — declaradas antes de las privadas para
// que Express no capture 'publico' como :id ────────────────────────────────
router.get('/examenes/publico/:slug', capacitacionExamenController.getPublicoBySlug);
router.post('/examenes/publico/:slug/responder', capacitacionExamenController.responderPublico);

// Catálogo — cualquier empleado autenticado
router.get('/cursos', authenticateToken, capacitacionController.getCursos);
router.get('/cursos/:id', authenticateToken, capacitacionController.getCursoById);
router.get('/mis-cursos', authenticateToken, capacitacionController.getMisCursos);

// Inscripción y progreso — cualquier empleado autenticado, sin restricción de rol
router.post('/cursos/:id/inscribirse', authenticateToken, capacitacionController.inscribirse);
router.post('/cursos/:id/completar', authenticateToken, capacitacionController.completar);
router.get('/cursos/:id/constancia', authenticateToken, capacitacionController.descargarConstancia);

// Gestión — solo admin (AD/TI)
router.post('/cursos', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'crear'), capacitacionController.createCurso);
router.put('/cursos/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionController.updateCurso);
router.post('/cursos/:id/timer/play', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionController.timerPlay);
router.post('/cursos/:id/timer/pause', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionController.timerPause);
router.post('/cursos/:id/timer/agregar', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionController.timerAgregar);
router.delete('/cursos/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'eliminar'), capacitacionController.deleteCurso);
router.post('/cursos/:id/materiales', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), uploadMaterial.single('archivo'), capacitacionController.subirMaterial);
router.delete('/materiales/:materialId', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionController.eliminarMaterial);

// ── Exámenes: privado (usuario autenticado) ─────────────────────────────────
router.get('/cursos/:cursoId/examenes', authenticateToken, capacitacionExamenController.listByCurso);
router.get('/examenes/:id', authenticateToken, capacitacionExamenController.getById);
router.get('/examenes/:id/pdf', authenticateToken, capacitacionExamenController.descargarPdf);
router.post('/examenes/:id/responder', authenticateToken, capacitacionExamenController.responder);

// ── Exámenes: gestión — solo admin (AD/TI) ─────────────────────────────────
router.post('/cursos/:cursoId/examenes', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionExamenController.create);
router.delete('/examenes/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionExamenController.delete);
router.get('/examenes/:id/intentos', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('capacitacion', 'editar'), capacitacionExamenController.listIntentos);

// Manejo de errores de Multer (archivo demasiado grande o tipo no permitido) —
// sin esto, el error del fileFilter de uploadMaterial (routes arriba) se va
// al handler por defecto de Express y sale como 500 sin mensaje.
router.use((err, req, res, next) => {
  const multer = require('multer');
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Archivo demasiado grande (máximo 100MB)' });
    }
    return res.status(400).json({ success: false, message: err.message || 'Error de carga de archivo' });
  }
  if (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message || 'Error de carga de archivo' });
  }
  next();
});

module.exports = router;
