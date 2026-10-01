const express = require('express');
const router = express.Router();
const campanaAgente = require('../controllers/campanaAgenteController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Catálogo en vivo desde el sistema Ventas (plata_prospectPRO.dbo.Campanas)
router.get('/disponibles', authenticateToken, campanaAgente.listCampanasDisponibles);

// Campañas de Ventas: alta, edición (con sus estatus) y baja (desactivar)
// Grupos de Contact Center con todo lo que tienen enlazado (pestaña Grupos)
router.get('/grupos', authenticateToken, campanaAgente.listGruposDetalle);
// Tipos de campaña (Ventas, Seguimiento y los que agregue la empresa) — antes de /ventas/:id
router.get('/ventas/tipos', authenticateToken, campanaAgente.listTiposCampana);
router.post('/ventas/tipos', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.guardarTipoCampana);
router.put('/ventas/tipos/:id', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.guardarTipoCampana);
router.delete('/ventas/tipos/:id', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.desactivarTipoCampana);
router.get('/ventas', authenticateToken, campanaAgente.listCampanasVentas);
router.get('/ventas/:id', authenticateToken, campanaAgente.getCampanaVentas);
router.post('/ventas/:id/activar', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.activarCampanaVentas);
router.post('/ventas/:id/tipificaciones-a/:campaniaId', authenticateToken, requireActionAccess('contact-center', 'gestionar-skills'), campanaAgente.copiarEstatusACampania);
router.post('/ventas', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.guardarCampanaVentas);
router.put('/ventas/:id', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.guardarCampanaVentas);
router.delete('/ventas/:id', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.desactivarCampanaVentas);

// Asignación agente → campaña (tabla propia de AGYDA, editable desde Usuarios)
router.get('/agentes', authenticateToken, campanaAgente.listAgentesCampanas);
router.get('/agentes/:neusId', authenticateToken, campanaAgente.getAgenteCampana);
router.put('/agentes/:neusId', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.setAgenteCampana);
router.delete('/agentes/:neusId', authenticateToken, requireActionAccess('accesos', 'gestionar'), campanaAgente.deleteAgenteCampana);

module.exports = router;
