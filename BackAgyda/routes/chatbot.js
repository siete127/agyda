const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const chatbotArbolController = require('../controllers/chatbotArbolController');
const chatbotFlujoController = require('../controllers/chatbotFlujoController');
const { authenticateToken, authenticateTokenOptional, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Lectura pública — la usa el widget de chat de la página pública para construir el diccionario.
router.get('/respuestas/publicas', chatbotController.getRespuestasPublicas);
router.get('/etiquetas-menu/publicas', chatbotController.getEtiquetasMenuPublicas);

// Árbol de decisión — público (authenticateTokenOptional asocia el usuario si
// está logueado, sin exigirlo: lo usan tanto el widget público como el interno).
router.post('/arbol/sesiones', authenticateTokenOptional, chatbotArbolController.iniciarSesion);
router.get('/arbol/sesiones/:token', authenticateTokenOptional, chatbotArbolController.getEstadoSesion);
router.post('/arbol/sesiones/:token/avanzar', authenticateTokenOptional, chatbotArbolController.avanzar);

// Administración del árbol — requiere sesión + permiso de configuración.
router.get('/arbol/nodos', authenticateToken, requireActionAccess('configuracion', 'ver'), chatbotArbolController.getNodos);
router.post('/arbol/nodos', authenticateToken, requireActionAccess('configuracion', 'configurar'), chatbotArbolController.createNodo);
router.put('/arbol/nodos/:id', authenticateToken, requireActionAccess('configuracion', 'configurar'), chatbotArbolController.updateNodo);
router.delete('/arbol/nodos/:id', authenticateToken, requireActionAccess('configuracion', 'configurar'), chatbotArbolController.deleteNodo);
router.post('/arbol/opciones', authenticateToken, requireActionAccess('configuracion', 'configurar'), chatbotArbolController.createOpcion);
router.put('/arbol/opciones/:id', authenticateToken, requireActionAccess('configuracion', 'configurar'), chatbotArbolController.updateOpcion);
router.delete('/arbol/opciones/:id', authenticateToken, requireActionAccess('configuracion', 'configurar'), chatbotArbolController.deleteOpcion);

// Gestión — requiere sesión + permiso de acción sobre el módulo 'chatbot'.
router.get('/respuestas', authenticateToken, requireActionAccess('chatbot', 'ver'), chatbotController.getRespuestas);
router.get('/leads', authenticateToken, requireActionAccess('chatbot', 'ver'), chatbotController.getLeads);
router.post('/respuestas', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'crear'), chatbotController.createRespuesta);
router.put('/respuestas/:pk', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotController.updateRespuesta);
router.patch('/respuestas/:pk/activa', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotController.toggleActiva);
router.delete('/respuestas/:pk', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'eliminar'), chatbotController.deleteRespuesta);

// Etiquetas del menú inicial del widget — mismo esquema de permisos que respuestas.
router.get('/etiquetas-menu', authenticateToken, requireActionAccess('chatbot', 'ver'), chatbotController.getEtiquetasMenu);
router.post('/etiquetas-menu', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'crear'), chatbotController.createEtiquetaMenu);
router.put('/etiquetas-menu/:id', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotController.updateEtiquetaMenu);
router.delete('/etiquetas-menu/:id', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'eliminar'), chatbotController.deleteEtiquetaMenu);

// Flujo visual (canvas de arrastrar y conectar) — respuestas, etiquetas,
// nodos del árbol y campañas como cajas conectadas entre sí.
router.get('/flujo', authenticateToken, requireActionAccess('chatbot', 'ver'), chatbotFlujoController.getFlujo);
router.put('/flujo/posicion/:tipo/:id', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotFlujoController.updatePosicion);
router.post('/flujo/conexiones', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotFlujoController.createConexion);
router.delete('/flujo/conexiones/:id', authenticateToken, verificarRol(['AD']), requireActionAccess('chatbot', 'editar'), chatbotFlujoController.deleteConexion);

module.exports = router;
