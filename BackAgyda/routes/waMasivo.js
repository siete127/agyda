const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const c = require('../controllers/waMasivoController');
const { ARCHIVOS_DIR } = require('../services/waMasivo/waMasivoService');

// WhatsApp masivo (solo envío) — /api/contact-center/wa-masivo/*
// Todo con la acción 'whatsapp-masivo' del Contact Center.
router.use(authenticateToken, requireActionAccess('contact-center', 'whatsapp-masivo'));

// Imagen / video / documento de un paso de la cadena (WhatsApp acepta hasta ~64 MB en video).
const subir = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ARCHIVOS_DIR),
    filename: (_req, file, cb) => {
      const limpio = path.basename(file.originalname || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(limpio);
      cb(null, `wam_${Date.now()}_${path.basename(limpio, ext).slice(0, 60)}${ext}`);
    },
  }),
  limits: { fileSize: 64 * 1024 * 1024 },
});

router.get('/resumen', c.resumen);

router.post('/cuentas', c.crearCuenta);
router.put('/cuentas/:id', c.editarCuenta);
router.post('/cuentas/:id/conectar', c.conectarCuenta);
router.get('/cuentas/:id/estado', c.estadoCuenta);
router.post('/cuentas/:id/desconectar', c.desconectarCuenta);
router.delete('/cuentas/:id', c.eliminarCuenta);

router.post('/archivos', subir.single('archivo'), c.subirArchivo);

router.post('/campanias', c.crearCampania);
router.get('/campanias/:id', c.getCampania);
router.put('/campanias/:id', c.guardarCampania);
router.delete('/campanias/:id', c.eliminarCampania);
router.post('/campanias/:id/estado', c.cambiarEstado);
router.get('/campanias/:id/destinatarios', c.listDestinatarios);
router.post('/campanias/:id/destinatarios', c.agregarDestinatarios);
router.delete('/campanias/:id/destinatarios', c.quitarPendientes);

module.exports = router;
