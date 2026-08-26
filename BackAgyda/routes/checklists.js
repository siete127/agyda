const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/checklistController');

router.use(auth.authenticateToken);

router.get('/day', controller.getDay);
router.post('/items', controller.addItem);
router.put('/items/:id', controller.updateItem);
router.delete('/items/:id', controller.deleteItem);
router.post('/items/:id/complete', controller.toggleComplete);
router.post('/copy', controller.copy);
router.get('/history', controller.history);
// Cerrar día
router.post('/day/close', controller.closeDay);
// Abrir día
router.post('/day/open', controller.openDay);

module.exports = router;
