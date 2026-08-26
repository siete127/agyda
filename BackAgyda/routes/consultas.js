const express = require('express');
const router = express.Router();
const consultaController = require('../controllers/consultaController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.get('/', authenticateToken, requireActionAccess('atencion-cliente', 'ver-consultas'), consultaController.getConsultas);
router.post('/', authenticateToken, requireActionAccess('atencion-cliente', 'crear-consulta'), consultaController.createConsulta);
router.patch('/:consultaId/estatus', authenticateToken, requireActionAccess('atencion-cliente', 'ver-consultas'), consultaController.updateEstatus);
router.delete('/:consultaId', authenticateToken, requireActionAccess('atencion-cliente', 'gestionar-consultas'), consultaController.deleteConsulta);
router.get('/:consultaId/comentarios', authenticateToken, requireActionAccess('atencion-cliente', 'ver-consultas'), consultaController.getComentarios);
router.post('/:consultaId/comentarios', authenticateToken, requireActionAccess('atencion-cliente', 'ver-consultas'), consultaController.addComentario);

module.exports = router;
