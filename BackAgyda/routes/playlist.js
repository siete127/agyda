const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/playlistController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadAudio } = require('../middleware/audioUpload');

router.use(authenticateToken);

// Lista general
router.get('/general',               requireActionAccess('musica', 'ver'), ctrl.getGeneral);
router.post('/general/compartir',    requireActionAccess('musica', 'compartir'), ctrl.compartirAGeneral);
router.delete('/general/:id',        requireActionAccess('musica', 'eliminar'), ctrl.deleteGeneral);

// Lista privada
router.get('/privada',               requireActionAccess('musica', 'ver'), ctrl.getPrivada);
router.post('/privada',              requireActionAccess('musica', 'subir-pista'), ctrl.addPrivada);
router.delete('/privada/:id',        requireActionAccess('musica', 'eliminar'), ctrl.deletePrivada);
router.post('/privada/audio',        requireActionAccess('musica', 'subir-pista'), uploadAudio.single('audio'), ctrl.uploadAudio);

// Alias sin 'a' final (frontend usa /privado en vez de /privada)
router.get('/privado',               requireActionAccess('musica', 'ver'), ctrl.getPrivada);
router.post('/privado',              requireActionAccess('musica', 'subir-pista'), ctrl.addPrivada);
router.delete('/privado/:id',        requireActionAccess('musica', 'eliminar'), ctrl.deletePrivada);
router.post('/privado/upload',       requireActionAccess('musica', 'subir-pista'), uploadAudio.single('audio'), ctrl.uploadAudio);
router.post('/privado/:id/compartir', requireActionAccess('musica', 'compartir'), (req, res, next) => {
  req.body.trackId = req.params.id;
  next();
}, ctrl.compartirAGeneral);

module.exports = router;
