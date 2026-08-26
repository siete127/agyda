const express = require("express");
const router = express.Router();
const vacacionesController = require("../controllers/vacacionesController");
const { authenticateToken } = require("../middleware/auth");
const { requireActionAccess } = require("../middleware/moduleAccess");
// Obtener todos los horarios-totis
router.get(
  "/horarios-totis",
  authenticateToken,
  vacacionesController.getHorariosTotis
);
// Obtener un horario por id (consulta intranet.dbo.horarios, fallback a horarios_totis)
router.get(
  "/horarios/:id",
  authenticateToken,
  vacacionesController.getHorarioById
);
// Obtener tabla dias_goce (dinámica)
router.get(
  "/dias-goce",
  authenticateToken,
  vacacionesController.getDiasGoce
);
// Cancelar aprobación de solicitud (solo si está aprobada)
router.put(
  "/solicitudes/:id/cancelar-aprobacion",
  authenticateToken,
  vacacionesController.cancelarAprobacion
);

// Obtener datos del empleado por número de personal
router.get(
  "/empleado/:numeroPersonal",
  authenticateToken,
  vacacionesController.getEmpleadoByNumero
);

// Saldo del pool de días (12 días compartidos entre vacaciones y permisos)
router.get(
  "/mi-saldo",
  authenticateToken,
  vacacionesController.getMiSaldo
);

// Resumen de días restantes por agente (dashboard admin)
router.get(
  "/resumen-agentes",
  authenticateToken,
  vacacionesController.getResumenAgentes
);

// Asignar/quitar manualmente el pool de 12 días a un empleado con < 1 año de antigüedad
router.post(
  "/pool-override/:usuarioId",
  authenticateToken,
  requireActionAccess("vacaciones", "aprobar-rechazar"),
  vacacionesController.asignarPoolManual
);
router.delete(
  "/pool-override/:usuarioId",
  authenticateToken,
  requireActionAccess("vacaciones", "aprobar-rechazar"),
  vacacionesController.quitarPoolManual
);
router.delete(
  "/pool-override/:usuarioId/restaurar",
  authenticateToken,
  requireActionAccess("vacaciones", "aprobar-rechazar"),
  vacacionesController.restaurarPoolAutomatico
);

// Crear solicitud de vacaciones/permisos
router.post(
  "/solicitud",
  authenticateToken,
  vacacionesController.crearSolicitud
);

// Obtener todas las solicitudes (admin)
router.get(
  "/solicitudes",
  authenticateToken,
  vacacionesController.getSolicitudes
);

// Contar solicitudes pendientes
router.get(
  "/solicitudes/pendientes/count",
  authenticateToken,
  vacacionesController.contarSolicitudesPendientes
);

// Editar solicitud de vacaciones/permisos (solo si está pendiente y es el solicitante)
router.put(
  "/solicitudes/:id",
  authenticateToken,
  vacacionesController.editarSolicitud
);

// Editar solo la fecha de una solicitud (admin) — pendiente o aprobada,
// con validaciones de fecha válida (ver comentario en el controller).
router.patch(
  "/solicitudes/:id/fecha",
  authenticateToken,
  requireActionAccess("vacaciones-admin", "aprobar-rechazar"),
  vacacionesController.editarFechaSolicitud
);

// Aprobar o rechazar solicitud (vista admin — AdminVacacionesPage)
router.put(
  "/solicitudes/:id/responder",
  authenticateToken,
  requireActionAccess("vacaciones-admin", "aprobar-rechazar"),
  vacacionesController.responderSolicitud
);

// Acciones desde email (GET para aprobar, POST para rechazar con comentario)
// No requiere authenticateToken porque usa JWT en query string
// Acción desde email (GET)
router.get("/solicitudes/:id/action", vacacionesController.accionDesdeEmail);

// Rechazo desde email (POST)
router.post(
  "/solicitudes/:id/rechazo-email",
  vacacionesController.procesarRechazoDesdeEmail
);

module.exports = router;
