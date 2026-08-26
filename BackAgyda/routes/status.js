const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');

router.get('/', statusController.getStatuses);
router.get('/:id', statusController.getStatusById);

module.exports = router;
