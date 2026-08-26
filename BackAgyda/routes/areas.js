const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const areasController = require('../controllers/areasController');
const auth = require('../middleware/auth');

const AREA_DOCS_DIR = 'C:/inetpub/wwwroot/intranet/intranet/AreaDocumentos';
try { if (!fs.existsSync(AREA_DOCS_DIR)) fs.mkdirSync(AREA_DOCS_DIR, { recursive: true }); } catch (_) { /* best-effort */ }

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, AREA_DOCS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

router.get('/:areaKey/kpis', auth.authenticateToken, areasController.getKpis);
router.put('/:areaKey/kpis/:kpiKey/gobernanza', auth.authenticateToken, areasController.actualizarGobernanzaKpi);

router.get('/:areaKey/objetivo', auth.authenticateToken, areasController.getObjetivo);
router.put('/:areaKey/objetivo', auth.authenticateToken, areasController.setObjetivo);

router.get('/:areaKey/documentos', auth.authenticateToken, areasController.listDocumentos);
router.post('/:areaKey/documentos', auth.authenticateToken, upload.single('documento'), areasController.subirDocumento);
router.delete('/documentos/:id', auth.authenticateToken, areasController.eliminarDocumento);

router.get('/:areaKey/procesos', auth.authenticateToken, areasController.listProcesos);
router.post('/:areaKey/procesos', auth.authenticateToken, areasController.crearProceso);

module.exports = router;
