const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/evalCapacitacionController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/',              ctrl.getAll);
router.post('/',             ctrl.create);
router.get('/:id',           ctrl.getById);
router.put('/:id',           ctrl.update);
router.patch('/:id/finalizar', ctrl.finalizar);
router.delete('/:id',        ctrl.delete_);

module.exports = router;
