const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { getIO } = require('../services/socketService');
const { invalidateActionsCache } = require('../middleware/moduleAccess');
const { DEFAULT_TENANT } = require('../config/tenants');
const { SUPER_ADMIN_IDS, esSuperAdminFijo } = require('../utils/superAdmin');

function notifyAccesosUpdated(usuarioId, tenantKey) {
  try {
    const io = getIO(tenantKey);
    io.to(`user:${usuarioId}`).emit('accesos-updated');
  } catch (_) {}
}

// Módulos por defecto según rol (para inicialización automática)
const ALL_MODULES = ['noticias','tickets','proyectos','vacaciones','asistencia-personal','calendario','quejas','reglamento','drive','organigrama','musica','webphone','clientes','crm','encuestas','reports','usuarios','vacaciones-admin','staff-ti','activos','vacantes','chatbot','livechat','mensajeria','asistencia','nomina','accesos','auditoria','expedientes','gastos','mi-area','evaluacion','configuracion','direccion-general','calidad','marketing','legal','finanzas','ventas-area','operaciones','tecnologia','atencion-cliente','rh-area','capacitacion','incapacidades','evaluacion-desempeno'];
const DEFAULT_MODULES_BY_ROLE = {
  ad:  ALL_MODULES,  // AD normal: todos los módulos (pero respeta restricciones del admin)
  cc:  ['noticias','tickets','vacaciones','calendario','quejas','reglamento','musica','evaluacion','asistencia-personal','webphone','mensajeria'],
  st:  ['noticias','tickets','vacaciones','calendario','proyectos','quejas','reglamento','drive','organigrama','musica','clientes','gastos','mi-area','mensajeria'],
  ve:  ['noticias','tickets','vacaciones','calendario','proyectos','quejas','reglamento','drive','organigrama','musica','clientes','gastos','mi-area','mensajeria'],
  cl:  ['tickets'],
  ti:  ALL_MODULES,  // TI: todos los módulos por defecto
};
function getDefaultModulesByRole(tipo) {
  const t = (tipo || '').toLowerCase();
  return DEFAULT_MODULES_BY_ROLE[t] ?? ['noticias','tickets','vacaciones','calendario','quejas','reglamento'];
}

// Módulos reales del sidebar — solo los que se pueden asignar por acceso
const MODULOS_DISPONIBLES = [
  { key: 'noticias',    nombre: 'Noticias',           descripcion: 'Publicaciones y comunicados internos' },
  { key: 'tickets',     nombre: 'Tickets',             descripcion: 'Sistema de soporte y seguimiento' },
  { key: 'proyectos',   nombre: 'Proyectos',           descripcion: 'Gestión de proyectos del equipo' },
  { key: 'vacaciones',  nombre: 'Vacaciones',          descripcion: 'Solicitudes y aprobación de vacaciones' },
  { key: 'calendario',  nombre: 'Calendario',          descripcion: 'Eventos y fechas importantes' },
  { key: 'drive',       nombre: 'Drive',               descripcion: 'Almacenamiento y documentos' },
  { key: 'organigrama', nombre: 'Organigrama',         descripcion: 'Estructura organizacional' },
  { key: 'musica',      nombre: 'Música',              descripcion: 'Reproductor de música' },
  { key: 'quejas',      nombre: 'Quejas',              descripcion: 'Registro y seguimiento de quejas' },
  { key: 'reglamento',  nombre: 'Reglamento',          descripcion: 'Políticas y reglamento interno' },
  { key: 'clientes',    nombre: 'Clientes',            descripcion: 'Gestión de clientes' },
  { key: 'productos-servicios', nombre: 'Productos y Servicios', descripcion: 'Catálogo de productos y servicios' },
  { key: 'crm',         nombre: 'CRM',                 descripcion: 'Pipeline de ventas, contactos y seguimiento a clientes' },
  { key: 'usuarios',    nombre: 'Usuarios',            descripcion: 'Administración de usuarios del sistema' },
  { key: 'encuestas',   nombre: 'Encuestas',           descripcion: 'Creación y gestión de encuestas' },
  { key: 'reports',     nombre: 'Reportes',            descripcion: 'Reportes de asistencia y baño' },
  { key: 'activos',     nombre: 'Activos',             descripcion: 'Inventario de activos de la empresa' },
  { key: 'staff-ti',    nombre: 'Staff TI',            descripcion: 'Panel de control del equipo TI' },
  { key: 'vacantes',    nombre: 'Vacantes',            descripcion: 'Publicación y gestión de vacantes' },
  { key: 'chatbot',     nombre: 'Chatbot',             descripcion: 'Diccionario de respuestas del chatbot de la página web' },
  { key: 'livechat',    nombre: 'Chat en Vivo',        descripcion: 'Atención en vivo a visitantes de la página web' },
  { key: 'email-marketing', nombre: 'Email Marketing', descripcion: 'Campañas de correo masivo sobre los contactos del CRM' },
  { key: 'mensajeria',  nombre: 'Mensajería',          descripcion: 'Chat interno entre usuarios, grupos y canales' },
  { key: 'asistencia',  nombre: 'Mi Asistencia',       descripcion: 'Registro y consulta de asistencia' },
  { key: 'evaluacion',  nombre: 'Evaluación CC',       descripcion: 'Evaluación semanal de capacitación CC' },
  { key: 'webphone',    nombre: 'Webphone',            descripcion: 'Teléfono web para agentes CC' },
  { key: 'expedientes', nombre: 'Expedientes',         descripcion: 'Gestión de expedientes de empleados' },
  { key: 'gastos',              nombre: 'Gastos',              descripcion: 'Registro y aprobación de gastos y reportes' },
  { key: 'mi-area',             nombre: 'Mi Área',             descripcion: 'Gestión del equipo a cargo (perfil, puesto, activos)' },
  { key: 'asistencia-personal', nombre: 'Mi Asistencia',       descripcion: 'Marcado y consulta de la propia asistencia' },
  { key: 'vacaciones-admin',    nombre: 'Sol. Vacaciones (admin)', descripcion: 'Aprobación de solicitudes de vacaciones y permisos de todo el equipo' },
  { key: 'nomina',              nombre: 'Nómina',              descripcion: 'Cálculo, aprobación y ajustes de nómina' },
  { key: 'auditoria',           nombre: 'Auditoría',           descripcion: 'Bitácora de acciones administrativas del sistema' },
  { key: 'accesos',             nombre: 'Accesos',             descripcion: 'Gestión de permisos de módulos y acciones de otros usuarios' },
  { key: 'configuracion',       nombre: 'Configuración',       descripcion: 'Configuración general del sistema (vistas de Webphone y más)' },
  { key: 'direccion-general',   nombre: 'Dirección General',   descripcion: 'Panorama ejecutivo y KPIs de todas las áreas' },
  { key: 'calidad',             nombre: 'Calidad',             descripcion: 'Monitoreo y evaluación de llamadas (QA)' },
  { key: 'marketing',           nombre: 'Marketing',           descripcion: 'Campañas, canales y resultados de marketing' },
  { key: 'legal',               nombre: 'Legal y Cumplimiento', descripcion: 'Documentos legales, normativos y de cumplimiento' },
  { key: 'finanzas',            nombre: 'Finanzas',            descripcion: 'Ingresos, presupuestos, cuentas por cobrar y pagar' },
  { key: 'ventas-area',         nombre: 'Ventas (Área)',       descripcion: 'Metas y resultados de ventas por asesor' },
  { key: 'operaciones',         nombre: 'Operaciones',         descripcion: 'Campañas y asignación de bases de Call Center' },
  { key: 'tecnologia',          nombre: 'Tecnología',          descripcion: 'Mantenimientos e incidentes de seguridad de TI' },
  { key: 'atencion-cliente',    nombre: 'Atención al Cliente', descripcion: 'Retención y riesgo de clientes' },
  { key: 'rh-area',             nombre: 'Recursos Humanos',    descripcion: 'Reclutamiento: vacantes y candidatos' },
  { key: 'capacitacion',        nombre: 'Capacitación',        descripcion: 'Catálogo de cursos, materiales y constancias' },
  { key: 'incapacidades',       nombre: 'Incapacidades',       descripcion: 'Solicitud, comprobante, seguimiento y aprobación de incapacidades médicas' },
  { key: 'evaluacion-desempeno', nombre: 'Evaluación de desempeño', descripcion: 'Ciclos de evaluación, KPIs, metas y planes de mejora por empleado' },
];

function listAvailableModules() {
  return MODULOS_DISPONIBLES;
}

exports.getModules = async (req, res) => {
  const modules = listAvailableModules();
  res.json({ success: true, data: modules });
};

// Catálogo canónico de módulos, reusado por empresaModulosController para
// validar moduloKey contra la lista real (evita togglear un módulo inexistente).
exports.MODULOS_DISPONIBLES = MODULOS_DISPONIBLES;
// Reusados por rolController (validar acciones) y schemaService (seed de roles).
exports.DEFAULT_MODULES_BY_ROLE = DEFAULT_MODULES_BY_ROLE;

/* ══════════════════════════════════════════════════════
   PERMISOS GRANULARES POR ACCIÓN
══════════════════════════════════════════════════════ */
const ACCIONES_POR_MODULO = {
  crm: [
    { key: 'seguimiento-ver',            nombre: 'Ver Seguimiento',        descripcion: 'Consultar recordatorios de pago, documentos y encuestas enviadas a contactos' },
    { key: 'seguimiento-recordatorios',  nombre: 'Gestionar recordatorios', descripcion: 'Crear, cancelar y eliminar recordatorios de pago' },
    { key: 'seguimiento-documentos',     nombre: 'Gestionar documentos',    descripcion: 'Subir, descargar y eliminar documentos de clientes' },
    { key: 'seguimiento-encuestas',      nombre: 'Enviar encuestas',        descripcion: 'Enviar encuestas públicas existentes a un contacto y ver sus respuestas' },
    { key: 'cotizacion-aprobar',         nombre: 'Aprobar cotizaciones',   descripcion: 'Aprobar o rechazar internamente las cotizaciones de una oportunidad' },
    { key: 'cotizacion-override-margen', nombre: 'Autorizar margen bajo',  descripcion: 'Guardar o aprobar cotizaciones cuyo margen queda por debajo del mínimo (semáforo rojo)' },
    { key: 'facturar',                   nombre: 'Emitir facturas',        descripcion: 'Generar la factura (CFDI) de una cotización aprobada' },
    { key: 'facturacion-cancelar',       nombre: 'Cancelar facturas',      descripcion: 'Cancelar ante el SAT una factura ya timbrada' },
    { key: 'facturacion-configurar',     nombre: 'Configurar facturación', descripcion: 'Editar datos fiscales del emisor, el CSD y las credenciales del PAC' },
    { key: 'notificar-correo',           nombre: 'Notificar por correo',    descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  mensajeria: [
    { key: 'ver',              nombre: 'Ver chats',            descripcion: 'Acceder a canales, grupos y mensajes directos' },
    { key: 'crear-canal',      nombre: 'Crear canal/grupo',    descripcion: 'Crear nuevos canales o grupos de conversación' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  livechat: [
    { key: 'ver',                 nombre: 'Ver conversaciones',      descripcion: 'Ver la lista de conversaciones propias y en espera, e historial' },
    { key: 'atender',             nombre: 'Atender chats',           descripcion: 'Tomar, cerrar y transferir conversaciones de visitantes' },
    { key: 'configurar',          nombre: 'Configurar módulo',       descripcion: 'Editar horario de atención y mensajes automáticos' },
    { key: 'gestionar-campanas',  nombre: 'Gestionar campañas',      descripcion: 'Crear y administrar campañas, grupos, agentes y motivos de cierre' },
  ],
  'email-marketing': [
    { key: 'ver',            nombre: 'Ver plantillas y campañas', descripcion: 'Consultar plantillas, campañas y sus reportes de envío' },
    { key: 'gestionar',      nombre: 'Gestionar plantillas',      descripcion: 'Crear, editar y desactivar plantillas de correo' },
    { key: 'crear-campana',  nombre: 'Crear y enviar campañas',   descripcion: 'Crear campañas, iniciar, pausar, reanudar y cancelar envíos' },
  ],
  asistencia: [
    { key: 'ver',                 nombre: 'Ver reporte',              descripcion: 'Consultar el detalle de entradas y el calendario de incidencias' },
    { key: 'exportar-excel',      nombre: 'Exportar a Excel',         descripcion: 'Descargar el reporte de asistencia en Excel' },
    { key: 'subir-biometrico',    nombre: 'Cargar biométrico',        descripcion: 'Subir archivo Excel del checador biométrico' },
    { key: 'sincronizar-biotime', nombre: 'Sincronizar BioTime',      descripcion: 'Importar registros desde BioTime' },
    { key: 'marcar-vacaciones',   nombre: 'Marcar vacaciones',        descripcion: 'Marcar o quitar un día como vacaciones en un registro' },
    { key: 'editar-horarios',     nombre: 'Editar horarios',          descripcion: 'Configurar horarios de entrada/tolerancia por rol' },
    { key: 'ver-actas',           nombre: 'Ver acciones correctivas', descripcion: 'Ver y descargar actas de retardos generadas' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  vacaciones: [
    { key: 'ver',                nombre: 'Ver solicitudes',         descripcion: 'Consultar el historial de solicitudes' },
    { key: 'crear-solicitud',    nombre: 'Crear solicitud',         descripcion: 'Solicitar vacaciones o permisos propios' },
    { key: 'aprobar-rechazar',   nombre: 'Aprobar / rechazar',      descripcion: 'Resolver solicitudes pendientes de otros usuarios' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  gastos: [
    { key: 'ver',                  nombre: 'Ver mis gastos',        descripcion: 'Consultar gastos y reportes propios' },
    { key: 'crear-gasto',          nombre: 'Crear gasto',           descripcion: 'Registrar un nuevo gasto y subir recibo' },
    { key: 'crear-reporte',        nombre: 'Crear reporte',         descripcion: 'Agrupar gastos en un reporte y enviarlo' },
    { key: 'aprobar-reporte',      nombre: 'Aprobar / rechazar',    descripcion: 'Resolver reportes enviados por otros usuarios' },
    { key: 'registrar-pago',       nombre: 'Registrar pago',        descripcion: 'Marcar un reporte aprobado como pagado' },
    { key: 'gestionar-categorias', nombre: 'Gestionar categorías',  descripcion: 'Crear, editar y desactivar categorías de gasto' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'mi-area': [
    { key: 'ver',              nombre: 'Ver equipo',            descripcion: 'Consultar la lista de colaboradores a cargo' },
    { key: 'editar-puesto',    nombre: 'Editar puesto',         descripcion: 'Cambiar el puesto asignado a un colaborador' },
    { key: 'subir-foto',       nombre: 'Subir foto de perfil',  descripcion: 'Actualizar la foto de perfil de un colaborador' },
    { key: 'ver-activos',      nombre: 'Ver activos asignados', descripcion: 'Consultar los activos generales asignados a un colaborador' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'asistencia-personal': [
    { key: 'marcar-entrada', nombre: 'Marcar entrada', descripcion: 'Registrar la propia hora de entrada' },
    { key: 'ver-historial',  nombre: 'Ver mi historial', descripcion: 'Consultar el historial mensual propio de entradas y retardos' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'vacaciones-admin': [
    { key: 'ver-todas',        nombre: 'Ver todas las solicitudes', descripcion: 'Consultar las solicitudes de vacaciones y permisos de todo el equipo' },
    { key: 'aprobar-rechazar', nombre: 'Aprobar / rechazar',        descripcion: 'Resolver solicitudes pendientes de cualquier usuario' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  nomina: [
    { key: 'ver',                nombre: 'Ver periodos',            descripcion: 'Consultar periodos, dashboard y detalle de nómina' },
    { key: 'calcular-periodo',   nombre: 'Calcular periodo',        descripcion: 'Ejecutar o revertir el cálculo de un periodo de nómina' },
    { key: 'aprobar-periodo',    nombre: 'Aprobar periodo',         descripcion: 'Aprobar un periodo de nómina calculado' },
    { key: 'editar-percepciones', nombre: 'Editar percepciones',    descripcion: 'Ajustar sueldo quincenal individual de un empleado' },
    { key: 'ajustar-faltas',     nombre: 'Ajustar faltas/comisiones', descripcion: 'Editar manualmente faltas, excepciones o comisiones de un periodo' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  auditoria: [
    { key: 'ver', nombre: 'Ver bitácora', descripcion: 'Consultar el historial de acciones administrativas del sistema' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  accesos: [
    { key: 'gestionar', nombre: 'Gestionar accesos', descripcion: 'Otorgar o revocar módulos y acciones a otros usuarios' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  noticias: [
    { key: 'ver',                nombre: 'Ver noticias',           descripcion: 'Consultar publicaciones, destacadas y detalle' },
    { key: 'crear',               nombre: 'Crear noticia',          descripcion: 'Publicar un nuevo comunicado' },
    { key: 'editar',               nombre: 'Editar noticia',         descripcion: 'Modificar título, contenido o estado de una noticia' },
    { key: 'eliminar',             nombre: 'Eliminar noticia',       descripcion: 'Borrar una publicación existente' },
    { key: 'reaccionar-comentar',  nombre: 'Reaccionar / comentar',  descripcion: 'Reaccionar y comentar en publicaciones' },
    { key: 'editar-layout',        nombre: 'Editar layout',          descripcion: 'Configurar el collage/orden de portada (solo AD)' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  tickets: [
    { key: 'ver',                nombre: 'Ver tickets',           descripcion: 'Consultar el listado y detalle de tickets' },
    { key: 'crear',               nombre: 'Crear ticket',          descripcion: 'Levantar un nuevo ticket de soporte' },
    { key: 'editar',               nombre: 'Editar ticket',         descripcion: 'Actualizar datos de un ticket existente' },
    { key: 'eliminar',             nombre: 'Eliminar ticket',       descripcion: 'Borrar un ticket' },
    { key: 'gestionar-estado',     nombre: 'Gestionar estado',      descripcion: 'Cambiar estado, transferir o comentar un ticket' },
    { key: 'gestionar-staff-ti',   nombre: 'Gestionar staff TI',    descripcion: 'Ver y actualizar disponibilidad/área del staff de TI' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  proyectos: [
    { key: 'ver',                nombre: 'Ver proyectos',         descripcion: 'Consultar proyectos, tareas, estatus y miembros' },
    { key: 'crear',               nombre: 'Crear proyecto',        descripcion: 'Dar de alta un nuevo proyecto' },
    { key: 'editar',               nombre: 'Editar proyecto',       descripcion: 'Modificar datos de un proyecto existente' },
    { key: 'eliminar',             nombre: 'Eliminar proyecto',     descripcion: 'Borrar un proyecto' },
    { key: 'gestionar-tareas',     nombre: 'Gestionar tareas',      descripcion: 'Crear, editar, completar, aprobar/rechazar tareas del proyecto' },
    { key: 'gestionar-miembros',   nombre: 'Gestionar miembros',    descripcion: 'Agregar, editar o quitar miembros del proyecto' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  calendario: [
    { key: 'ver',                nombre: 'Ver calendario',        descripcion: 'Consultar eventos, próximos y cumpleaños del mes' },
    { key: 'crear-evento',        nombre: 'Crear evento',          descripcion: 'Registrar un nuevo evento en el calendario' },
    { key: 'editar-evento',       nombre: 'Editar evento',         descripcion: 'Modificar o eliminar un evento existente (AD/ADM)' },
    { key: 'gestionar-participantes', nombre: 'Gestionar participantes', descripcion: 'Agregar/quitar participantes y actualizar asistencia' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  drive: [
    { key: 'ver',                nombre: 'Ver archivos',          descripcion: 'Consultar carpetas y archivos propios y compartidos' },
    { key: 'subir-archivo',       nombre: 'Subir archivo',         descripcion: 'Cargar archivos y crear carpetas' },
    { key: 'eliminar',             nombre: 'Eliminar',              descripcion: 'Borrar carpetas o archivos' },
    { key: 'compartir',            nombre: 'Compartir',             descripcion: 'Compartir/revocar acceso a carpetas o archivos con otros usuarios' },
    { key: 'gestionar-permisos',   nombre: 'Gestionar permisos',    descripcion: 'Configurar permisos de carpetas y renombrarlas' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  organigrama: [
    { key: 'ver',                nombre: 'Ver organigrama',       descripcion: 'Consultar el árbol organizacional' },
    { key: 'gestionar-nodos',     nombre: 'Gestionar nodos',       descripcion: 'Crear, editar, mover o eliminar nodos del organigrama' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  musica: [
    { key: 'ver',                nombre: 'Ver / reproducir',      descripcion: 'Consultar la lista general y la privada' },
    { key: 'subir-pista',         nombre: 'Subir pista',           descripcion: 'Agregar audio a la lista privada' },
    { key: 'compartir',            nombre: 'Compartir a general',   descripcion: 'Compartir una pista privada a la lista general' },
    { key: 'eliminar',             nombre: 'Eliminar pista',        descripcion: 'Borrar una pista de la lista general o privada' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  quejas: [
    { key: 'ver',                nombre: 'Ver quejas',            descripcion: 'Consultar quejas, estadísticas y comentarios' },
    { key: 'crear',               nombre: 'Crear queja',           descripcion: 'Registrar una nueva queja' },
    { key: 'comentar',             nombre: 'Comentar',              descripcion: 'Agregar comentarios a una queja' },
    { key: 'gestionar-estatus',    nombre: 'Gestionar estatus',     descripcion: 'Actualizar el estatus o eliminar una queja' },
    { key: 'accion-correctiva',    nombre: 'Acción correctiva',     descripcion: 'Registrar o consultar la acción correctiva de una queja' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  reglamento: [
    { key: 'ver',                nombre: 'Ver reglamento',        descripcion: 'Consultar el PDF y el estatus de aceptación' },
    { key: 'aceptar',             nombre: 'Aceptar reglamento',    descripcion: 'Aceptar el reglamento vigente' },
    { key: 'gestionar',            nombre: 'Gestionar versión',     descripcion: 'Publicar nueva versión, ver estatus de usuarios y resetear aceptaciones (AD/TI)' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  clientes: [
    { key: 'ver',                nombre: 'Ver clientes',          descripcion: 'Consultar clientes, productos y servicios' },
    { key: 'crear',               nombre: 'Crear cliente',         descripcion: 'Registrar un nuevo cliente' },
    { key: 'editar',               nombre: 'Editar cliente',        descripcion: 'Modificar los datos de un cliente' },
    { key: 'eliminar',             nombre: 'Eliminar cliente',      descripcion: 'Borrar un cliente' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'productos-servicios': [
    { key: 'ver',      nombre: 'Ver catálogo',              descripcion: 'Consultar productos y servicios' },
    { key: 'crear',    nombre: 'Crear producto/servicio',   descripcion: 'Alta de un nuevo producto o servicio en el catálogo' },
    { key: 'editar',   nombre: 'Editar producto/servicio',  descripcion: 'Modificar nombre, precio o recurrencia' },
    { key: 'eliminar', nombre: 'Eliminar producto/servicio', descripcion: 'Borrar del catálogo (o desactivar si tiene clientes asignados)' },
  ],
  usuarios: [
    { key: 'ver',                nombre: 'Ver usuarios',          descripcion: 'Consultar listado, perfil, estatus y horarios de usuarios' },
    { key: 'crear',               nombre: 'Crear usuario',         descripcion: 'Dar de alta un nuevo usuario' },
    { key: 'editar',               nombre: 'Editar usuario',        descripcion: 'Actualizar datos, alias, puesto o perfil de un usuario' },
    { key: 'eliminar',             nombre: 'Eliminar / desactivar', descripcion: 'Desactivar o eliminar un usuario' },
    { key: 'cambiar-foto',         nombre: 'Cambiar foto/portada',  descripcion: 'Actualizar foto de perfil o portada de cualquier usuario (AD)' },
    { key: 'cambiar-password',     nombre: 'Cambiar contraseña',    descripcion: 'Restablecer la contraseña de un usuario' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  encuestas: [
    { key: 'ver',                nombre: 'Ver encuestas',         descripcion: 'Consultar encuestas, resultados y respuestas' },
    { key: 'crear',               nombre: 'Crear encuesta',        descripcion: 'Crear una nueva encuesta y asignarla' },
    { key: 'editar',               nombre: 'Editar encuesta',       descripcion: 'Modificar o cambiar el estado/cierre de una encuesta' },
    { key: 'eliminar',             nombre: 'Eliminar encuesta',     descripcion: 'Borrar una encuesta' },
    { key: 'responder',            nombre: 'Responder encuesta',    descripcion: 'Contestar una encuesta asignada' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  reports: [
    { key: 'ver-reportes',       nombre: 'Ver reportes',          descripcion: 'Consultar reporte de tiempos por usuario, resumen general y reporte de baño (AD/TI)' },
    { key: 'gestionar-pausas',    nombre: 'Gestionar pausas',      descripcion: 'Iniciar, terminar y consultar la pausa activa propia' },
    { key: 'ver-equipo',          nombre: 'Ver tiempos del equipo', descripcion: 'Ver el tiempo disponible y en pausa de todos los usuarios del área, en la tarjeta del Inicio' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  activos: [
    { key: 'ver',                nombre: 'Ver activos',           descripcion: 'Consultar activos asignados, pendientes, generales y mobiliario' },
    { key: 'crear',               nombre: 'Crear activo',          descripcion: 'Registrar un activo, activo general o mobiliario nuevo' },
    { key: 'editar',               nombre: 'Editar activo',         descripcion: 'Modificar datos de un activo, general o mobiliario' },
    { key: 'eliminar',             nombre: 'Eliminar activo',       descripcion: 'Borrar un activo o mobiliario' },
    { key: 'aceptar-terminos',     nombre: 'Aceptar términos',      descripcion: 'Aceptar los términos de responsiva de un activo asignado' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'staff-ti': [
    { key: 'ver',                nombre: 'Ver staff TI',          descripcion: 'Consultar el listado y disponibilidad del equipo de TI' },
    { key: 'actualizar',          nombre: 'Actualizar staff TI',   descripcion: 'Cambiar área o disponibilidad de un miembro del staff de TI' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  evaluacion: [
    { key: 'ver',                nombre: 'Ver evaluaciones',      descripcion: 'Consultar evaluaciones de capacitación CC' },
    { key: 'crear',               nombre: 'Crear evaluación',      descripcion: 'Crear una nueva evaluación semanal para un agente (solo AD)' },
    { key: 'editar',               nombre: 'Editar evaluación',     descripcion: 'Modificar detalle, fortalezas y plan de acción de una evaluación' },
    { key: 'finalizar',            nombre: 'Finalizar evaluación',  descripcion: 'Cerrar/finalizar una evaluación (solo AD)' },
    { key: 'eliminar',             nombre: 'Eliminar evaluación',   descripcion: 'Borrar una evaluación (solo AD)' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  webphone: [
    { key: 'recibir-llamadas',   nombre: 'Recibir llamadas',      descripcion: 'Recibir eventos de llamada entrante en el webphone (integración Vicidial)' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  expedientes: [
    { key: 'ver-propio',         nombre: 'Ver mi expediente',     descripcion: 'Consultar documentos, contacto, persona, familiares, formación y talento propios' },
    { key: 'editar-propio',       nombre: 'Editar mi expediente',  descripcion: 'Subir/eliminar documentos propios y actualizar contacto, persona, familiares, formación y talento' },
    { key: 'ver-otros',           nombre: 'Ver expediente de otros', descripcion: 'Consultar el expediente y documentos de cualquier usuario (solo AD)' },
    { key: 'gestionar-otros',     nombre: 'Gestionar expediente de otros', descripcion: 'Subir/eliminar documentos y editar datos del expediente de cualquier usuario (solo AD)' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  configuracion: [
    { key: 'ver', nombre: 'Ver configuración', descripcion: 'Consultar Configuración > Tecnología/TI: catálogos (sedes, categorías, proveedores, servicios), técnicos, SLA y demás secciones de solo lectura' },
    { key: 'configurar', nombre: 'Editar configuración', descripcion: 'Crear, editar o desactivar catálogos, técnicos, reglas de SLA y demás ajustes de Configuración > Tecnología/TI' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'direccion-general': [
    { key: 'okr-crear', nombre: 'Crear objetivos OKR', descripcion: 'Crear nuevos objetivos estratégicos en Planeación estratégica y objetivos' },
    { key: 'okr-editar', nombre: 'Editar objetivos OKR', descripcion: 'Editar objetivos y su estatus manual en Planeación estratégica y objetivos' },
    { key: 'okr-eliminar', nombre: 'Eliminar objetivos OKR', descripcion: 'Eliminar objetivos y resultados clave en Planeación estratégica y objetivos' },
    { key: 'okr-checkin', nombre: 'Actualizar avance OKR', descripcion: 'Actualizar el valor de los resultados clave (check-in) y marcar hitos' },
    { key: 'okr-comentar', nombre: 'Comentar objetivos OKR', descripcion: 'Agregar comentarios al hilo de discusión de un objetivo' },
    { key: 'decision-crear', nombre: 'Crear solicitud de decisión', descripcion: 'Iniciar una nueva solicitud de decisión/aprobación en Toma de decisiones' },
    { key: 'decision-aprobar', nombre: 'Aprobar/rechazar decisiones', descripcion: 'Aprobar, rechazar o cancelar solicitudes de decisión asignadas' },
    { key: 'decision-eliminar', nombre: 'Eliminar solicitudes de decisión', descripcion: 'Eliminar solicitudes de decisión' },
    { key: 'decision-comentar', nombre: 'Comentar decisiones', descripcion: 'Agregar comentarios al hilo de una solicitud de decisión' },
    { key: 'decision-admin-tipos', nombre: 'Administrar tipos de decisión', descripcion: 'Crear, editar y desactivar los tipos de solicitud de decisión' },
    { key: 'reporte-crear', nombre: 'Crear/editar plantillas de reporte', descripcion: 'Guardar y modificar plantillas de Reportes ejecutivos' },
    { key: 'reporte-eliminar', nombre: 'Eliminar plantillas de reporte', descripcion: 'Eliminar plantillas de Reportes ejecutivos guardadas' },
    { key: 'indicadores-ver', nombre: 'Ver indicadores empresariales', descripcion: 'Consultar el módulo de Indicadores empresariales' },
    { key: 'indicadores-exportar', nombre: 'Exportar/compartir indicadores', descripcion: 'Exportar a PDF o generar un link público de Indicadores empresariales' },
    { key: 'indicadores-comentar', nombre: 'Comentar indicadores', descripcion: 'Agregar comentarios a un KPI en Indicadores empresariales' },
    { key: 'mejora-continua-crear', nombre: 'Registrar hallazgos', descripcion: 'Crear nuevos hallazgos/no conformidades en Seguimiento y mejora continua' },
    { key: 'mejora-continua-gestionar', nombre: 'Gestionar hallazgos', descripcion: 'Editar hallazgos, gestionar acciones correctivas, verificar cierre y reabrir en Mejora continua' },
    { key: 'mejora-continua-eliminar', nombre: 'Eliminar hallazgos', descripcion: 'Eliminar hallazgos de Seguimiento y mejora continua' },
    { key: 'supervision-ver', nombre: 'Ver supervisión general', descripcion: 'Consultar el panorama de Supervisión general de todas las áreas' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  calidad: [
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  marketing: [
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  legal: [
    { key: 'rat-crear', nombre: 'Crear actividad de tratamiento (RAT)', descripcion: 'Registrar nuevas actividades de tratamiento de datos personales en Protección de datos' },
    { key: 'rat-editar', nombre: 'Editar actividad de tratamiento (RAT)', descripcion: 'Modificar actividades de tratamiento existentes, incluyendo marcar revisión' },
    { key: 'rat-eliminar', nombre: 'Eliminar actividad de tratamiento (RAT)', descripcion: 'Eliminar actividades de tratamiento del RAT' },
    { key: 'rat-exportar', nombre: 'Exportar RAT (PDF/Excel)', descripcion: 'Exportar el Registro de Actividades de Tratamiento a PDF o Excel' },
    { key: 'obligacion-crear', nombre: 'Crear obligación normativa', descripcion: 'Registrar nuevas obligaciones de cumplimiento normativo' },
    { key: 'obligacion-editar', nombre: 'Editar obligación normativa', descripcion: 'Modificar obligaciones normativas existentes' },
    { key: 'obligacion-eliminar', nombre: 'Eliminar obligación normativa', descripcion: 'Eliminar obligaciones de cumplimiento normativo' },
    { key: 'obligacion-marcar-cumplida', nombre: 'Marcar obligación como cumplida', descripcion: 'Registrar el cumplimiento de una obligación y su historial' },
    { key: 'obligacion-exportar', nombre: 'Exportar cumplimiento normativo (PDF/Excel)', descripcion: 'Exportar el listado de obligaciones normativas a PDF o Excel' },
    { key: 'documento-crear', nombre: 'Crear documento en Control documental', descripcion: 'Registrar un nuevo documento y su primera versión en Control documental' },
    { key: 'documento-editar', nombre: 'Editar documento (Control documental)', descripcion: 'Modificar título, categoría, descripción y estado de vigencia de un documento' },
    { key: 'documento-eliminar', nombre: 'Eliminar documento (Control documental)', descripcion: 'Eliminar un documento y todas sus versiones históricas' },
    { key: 'documento-subir-version', nombre: 'Subir nueva versión de documento', descripcion: 'Cargar una nueva versión de archivo conservando el historial de versiones anteriores' },
    { key: 'documento-exportar', nombre: 'Exportar Control documental (PDF/Excel)', descripcion: 'Exportar el listado de documentos a PDF o Excel' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  finanzas: [
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'ventas-area': [
    { key: 'ver',              nombre: 'Ver módulo',            descripcion: 'Ver el panel de Ventas (Área): metas, asesores, resultados y prospección' },
    { key: 'ver-metas',        nombre: 'Ver metas del equipo',  descripcion: 'Ver las metas de todos los asesores y campañas, y el avance de la campaña completa' },
    { key: 'gestionar-metas',  nombre: 'Gestionar metas',       descripcion: 'Crear, editar y eliminar metas diarias o mensuales por asesor o por campaña' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  operaciones: [
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  tecnologia: [
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'atencion-cliente': [
    { key: 'ver-consultas',          nombre: 'Ver consultas',           descripcion: 'Consultar el listado y detalle de consultas de clientes' },
    { key: 'crear-consulta',         nombre: 'Registrar consulta',      descripcion: 'Registrar una nueva consulta de cliente' },
    { key: 'gestionar-consultas',    nombre: 'Gestionar consultas',     descripcion: 'Ver todas las consultas de todos los usuarios, cambiar su estado y comentar' },
    { key: 'ver-aclaraciones',       nombre: 'Ver aclaraciones',        descripcion: 'Consultar el listado y detalle de aclaraciones de clientes' },
    { key: 'crear-aclaracion',       nombre: 'Registrar aclaración',    descripcion: 'Registrar una nueva aclaración de cliente' },
    { key: 'gestionar-aclaraciones', nombre: 'Gestionar aclaraciones',  descripcion: 'Ver todas las aclaraciones de todos los usuarios, cambiar su estado y comentar' },
    { key: 'ver-retencion',          nombre: 'Ver retención',           descripcion: 'Consultar el listado de evaluaciones de retención de clientes' },
    { key: 'crear-retencion',        nombre: 'Registrar evaluación',    descripcion: 'Registrar una nueva evaluación de riesgo/retención de cliente' },
    { key: 'clientes-ver',           nombre: 'Ver clientes',            descripcion: 'Ver el listado y expediente/perfil completo de clientes' },
    { key: 'clientes-gestionar',     nombre: 'Gestionar clientes',      descripcion: 'Dar de alta clientes y editar sus datos generales' },
    { key: 'clientes-documentos',    nombre: 'Gestionar documentos',    descripcion: 'Subir y eliminar documentos del expediente de un cliente' },
    { key: 'clientes-seguimiento',   nombre: 'Registrar seguimiento',   descripcion: 'Registrar contactos en la bitácora de seguimiento de un cliente' },
    { key: 'clientes-tareas',        nombre: 'Gestionar tareas',        descripcion: 'Crear, asignar y actualizar tareas de clientes' },
    { key: 'clientes-pagos',         nombre: 'Gestionar pagos',         descripcion: 'Crear recordatorios de pago y confirmar pagos con comprobante' },
    { key: 'clientes-encuestas',     nombre: 'Enviar encuestas',        descripcion: 'Enviar encuestas de satisfacción a clientes' },
    { key: 'incidencias-ver',        nombre: 'Ver incidencias',         descripcion: 'Consultar el listado y detalle de incidencias de clientes' },
    { key: 'incidencias-gestionar',  nombre: 'Gestionar incidencias',   descripcion: 'Crear, asignar, comentar y cambiar el estatus de incidencias' },
    { key: 'clientes-renovaciones',  nombre: 'Gestionar renovaciones',  descripcion: 'Gestionar fechas importantes y renovaciones de clientes' },
    { key: 'clientes-dashboard',     nombre: 'Ver dashboard',           descripcion: 'Ver el dashboard y reportes del módulo de clientes' },
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
  'rh-area': [
    { key: 'notificar-correo', nombre: 'Notificar por correo', descripcion: 'Enviar aviso por correo a este usuario cuando ocurra un evento relevante del módulo' },
  ],
};

// Reusado por rolController para validar que cada acción de un rol exista.
exports.ACCIONES_POR_MODULO = ACCIONES_POR_MODULO;

exports.getModuleActions = async (req, res) => {
  const { moduloKey } = req.params;
  const acciones = ACCIONES_POR_MODULO[String(moduloKey || '').toLowerCase()] ?? [];
  res.json({ success: true, data: acciones });
};

exports.getAllModuleActions = async (req, res) => {
  res.json({ success: true, data: ACCIONES_POR_MODULO });
};

// Acciones granulares del usuario autenticado (para filtrar botones en la UI)
exports.getSelfActions = async (req, res) => {
  try {
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const { getEmpresaModulosBloqueados, esSuperAdminInmuneEmpresa } = require('../middleware/moduleAccess');
    const bloqueados = await getEmpresaModulosBloqueados(req.user?.empresa);

    if (esSuperAdminInmuneEmpresa(req)) {
      const todas = {};
      for (const mod of Object.keys(ACCIONES_POR_MODULO)) todas[mod] = ['*'];
      return res.json({ success: true, data: { usuarioId: parseInt(uid), acciones: todas } });
    }
    if (esSuperAdminFijo(req)) {
      const todas = {};
      for (const mod of Object.keys(ACCIONES_POR_MODULO)) todas[mod] = bloqueados.has(mod) ? [] : ['*'];
      return res.json({ success: true, data: { usuarioId: parseInt(uid), acciones: todas } });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('uid', sql.Int, parseInt(uid))
      .query(`SELECT MODULO_KEY, ACCION_KEY, ALLOW FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID=@uid`);

    const configuredModules = new Set(rs.recordset.map(r => String(r.MODULO_KEY)));
    const porModulo = {};
    for (const mod of Object.keys(ACCIONES_POR_MODULO)) {
      if (bloqueados.has(mod)) {
        // Módulo desactivado para la empresa: sin acciones, sin importar lo configurado por usuario.
        porModulo[mod] = [];
      } else if (!configuredModules.has(mod)) {
        // Módulo nunca configurado para este usuario → todas sus acciones permitidas (compatibilidad)
        porModulo[mod] = ['*'];
      } else {
        porModulo[mod] = rs.recordset
          .filter(r => String(r.MODULO_KEY) === mod && (r.ALLOW === true || r.ALLOW === 1))
          .map(r => String(r.ACCION_KEY));
      }
    }
    return res.json({ success: true, data: { usuarioId: parseInt(uid), acciones: porModulo } });
  } catch (e) {
    console.error('Error getSelfActions:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo acciones propias' });
  }
};

exports.getUserActions = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('usuarioId', sql.Int, parseInt(usuarioId))
      .query(`SELECT MODULO_KEY, ACCION_KEY FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID=@usuarioId AND ALLOW=1`);
    const porModulo = {};
    for (const r of rs.recordset) {
      const mod = String(r.MODULO_KEY);
      if (!porModulo[mod]) porModulo[mod] = [];
      porModulo[mod].push(String(r.ACCION_KEY));
    }
    return res.json({ success: true, data: { usuarioId: parseInt(usuarioId), acciones: porModulo } });
  } catch (e) {
    console.error('Error getUserActions:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo acciones del usuario' });
  }
};

exports.setModuleActions = async (req, res) => {
  try {
    const { usuarioId, moduloKey } = req.params;
    let { acciones } = req.body; // array de action keys permitidas para ese módulo
    if (!usuarioId || !moduloKey) return res.status(400).json({ success: false, message: 'usuarioId y moduloKey requeridos' });
    if (!Array.isArray(acciones)) acciones = [];

    const adminId = req.user && (req.user.id || req.user.sub || req.user.userId) ? parseInt(req.user.id || req.user.sub || req.user.userId) : null;
    const disponibles = (ACCIONES_POR_MODULO[String(moduloKey).toLowerCase()] ?? []).map(a => a.key);

    const pool = await databaseService.getPool(req.user?.empresa);
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      const reqDel = new sql.Request(t);
      await reqDel
        .input('usuarioId', sql.Int, parseInt(usuarioId))
        .input('moduloKey', sql.NVarChar, String(moduloKey))
        .query(`DELETE FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID=@usuarioId AND MODULO_KEY=@moduloKey`);

      // Centinela: guarda una fila con ALLOW=0 para una acción inexistente para marcar
      // "este módulo ya fue configurado" incluso si se revocaron todas sus acciones.
      const reqCentinela = new sql.Request(t);
      await reqCentinela
        .input('usuarioId', sql.Int, parseInt(usuarioId))
        .input('moduloKey', sql.NVarChar, String(moduloKey))
        .query(`INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW) VALUES (@usuarioId, @moduloKey, '__initialized__', 0)`);

      for (const accionKey of acciones) {
        if (!disponibles.includes(String(accionKey))) continue; // ignora keys que no existan para el módulo
        const reqIns = new sql.Request(t);
        await reqIns
          .input('usuarioId', sql.Int, parseInt(usuarioId))
          .input('moduloKey', sql.NVarChar, String(moduloKey))
          .input('accionKey', sql.NVarChar, String(accionKey))
          .input('allow', sql.Bit, true)
          .input('grantedBy', sql.Int, adminId)
          .query(`
            INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW, GRANTED_BY)
            VALUES (@usuarioId, @moduloKey, @accionKey, @allow, @grantedBy)
          `);
      }
      await t.commit();
      invalidateActionsCache(parseInt(usuarioId), String(moduloKey).toLowerCase(), req.user?.empresa);
      await logAudit(pool, {
        userId:    req.user?.id || null,
        userName:  req.user?.nombre || null,
        modulo:    'accesos',
        accion:    'set-acciones',
        entidadId: usuarioId,
        detalle:   { moduloKey, acciones },
        ip:        req.ip,
      });
      notifyAccesosUpdated(parseInt(usuarioId), req.user?.empresa);
      return res.json({ success: true, message: 'Acciones actualizadas', data: { usuarioId: parseInt(usuarioId), moduloKey, acciones } });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      console.error('Error setModuleActions:', err);
      return res.status(500).json({ success: false, message: 'Error actualizando acciones' });
    }
  } catch (e) {
    console.error('Error setModuleActions outer:', e);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};

exports.getUserAccess = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('usuarioId', sql.Int, parseInt(usuarioId))
      .query(`SELECT MODULO_KEY FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId AND ALLOW=1`);
    const allowed = rs.recordset.map(r => r.MODULO_KEY);
    return res.json({ success: true, data: { usuarioId: parseInt(usuarioId), modules: allowed } });
  } catch (e) {
    console.error('Error getUserAccess:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo accesos' });
  }
};

// Accesos del usuario autenticado (para filtrar UI)
exports.getSelfAccess = async (req, res) => {
  try {
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    const tipo = (req.user && (req.user.tipoUsuario || req.user.role || req.user.tipousuario) || '').toString().toLowerCase();
    if (!uid) return res.status(401).json({ success:false, message:'Token inválido' });

    // Módulos desactivados a nivel empresa completa (tabla exclusiva de la BD
    // maestra 'agyda') — se intersectan con lo que el usuario tiene permitido
    // más abajo. Un módulo bloqueado para la empresa nunca se devuelve, sin
    // importar lo que diga INTRANET_USUARIOS_MODULOS.
    const { getEmpresaModulosBloqueados, esSuperAdminInmuneEmpresa } = require('../middleware/moduleAccess');
    const bloqueados = await getEmpresaModulosBloqueados(req.user?.empresa);

    // Super-admin fijo con inmunidad al bloqueo de empresa: comodín total.
    // ADM_0001 (id 1) y TI_0110 (id 64) ya no son inmunes aquí — reciben el
    // catálogo completo menos lo bloqueado para su empresa, igual que el
    // resto del flujo de abajo.
    if (esSuperAdminInmuneEmpresa(req)) {
      return res.json({ success:true, data: { usuarioId: parseInt(uid), modules: ['*'] } });
    }
    if (esSuperAdminFijo(req)) {
      const finalModules = bloqueados.size > 0
        ? MODULOS_DISPONIBLES.map((m) => m.key).filter((k) => !bloqueados.has(k))
        : ['*'];
      return res.json({ success:true, data: { usuarioId: parseInt(uid), modules: finalModules } });
    }

    const pool2 = await databaseService.getPool(req.user?.empresa);
    const rs = await pool2.request()
      .input('usuarioId', sql.Int, parseInt(uid))
      .query(`SELECT MODULO_KEY, ALLOW FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId`);
    const list = [];
    let anyRow = false;
    for (const r of rs.recordset) {
      anyRow = true;
      if (r.ALLOW === true || r.ALLOW === 1) list.push(String(r.MODULO_KEY));
    }
    // !anyRow = nunca fue configurado → inicializar con defaults según rol
    // anyRow con list vacío = fue configurado pero sin módulos habilitados (todo revocado)
    if (!anyRow) {
      const defaults = getDefaultModulesByRole(tipo);
      if (defaults[0] === '*') {
        // '*' no puede devolverse tal cual si la empresa tiene módulos
        // bloqueados (el frontend lo interpretaría como "todo permitido") —
        // se expande al catálogo completo menos los bloqueados.
        const finalModules = bloqueados.size > 0
          ? MODULOS_DISPONIBLES.map((m) => m.key).filter((k) => !bloqueados.has(k))
          : ['*'];
        return res.json({ success:true, data: { usuarioId: parseInt(uid), modules: finalModules } });
      }
      const pool3 = await databaseService.getPool(req.user?.empresa);
      // Insertar centinela primero para marcar que este usuario ya fue configurado
      try {
        await pool3.request()
          .input('usuarioId', sql.Int, parseInt(uid))
          .query(`
            IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId AND MODULO_KEY='__initialized__')
              INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW) VALUES (@usuarioId, '__initialized__', 0)
          `);
      } catch (_) {}
      for (const key of defaults) {
        try {
          await pool3.request()
            .input('usuarioId', sql.Int, parseInt(uid))
            .input('moduloKey', sql.NVarChar, key)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId AND MODULO_KEY=@moduloKey)
                INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW) VALUES (@usuarioId, @moduloKey, 1)
            `);
        } catch (_) {}
      }
      return res.json({ success:true, data: { usuarioId: parseInt(uid), modules: defaults.filter((k) => !bloqueados.has(k)) } });
    }
    const modules = list.filter((k) => !bloqueados.has(String(k).toLowerCase()));
    return res.json({ success:true, data: { usuarioId: parseInt(uid), modules } });
  } catch (e) {
    console.error('Error getSelfAccess:', e);
    return res.status(500).json({ success:false, message:'Error obteniendo accesos propios' });
  }
};

exports.setUserAccess = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    let { modules } = req.body;
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    if (!Array.isArray(modules)) modules = [];

    const adminId = req.user && (req.user.id || req.user.sub || req.user.userId) ? parseInt(req.user.id || req.user.sub || req.user.userId) : null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      const reqDel = new sql.Request(t);
      await reqDel.input('usuarioId', sql.Int, parseInt(usuarioId)).query(`DELETE FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId`);

      // Insertar centinela para marcar que este usuario fue configurado (evita re-inicialización)
      const reqCentinela = new sql.Request(t);
      await reqCentinela
        .input('usuarioId', sql.Int, parseInt(usuarioId))
        .query(`INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW) VALUES (@usuarioId, '__initialized__', 0)`);

      if (modules.length > 0) {
        for (const m of modules) {
          const reqIns = new sql.Request(t);
          await reqIns
            .input('usuarioId', sql.Int, parseInt(usuarioId))
            .input('moduloKey', sql.NVarChar, String(m))
            .input('allow', sql.Bit, true)
            .input('grantedBy', sql.Int, adminId)
            .query(`
              INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW, GRANTED_BY)
              VALUES (@usuarioId, @moduloKey, @allow, @grantedBy)
            `);
        }
      }
      await t.commit();
      await logAudit(pool, {
        userId:    req.user?.id || null,
        userName:  req.user?.nombre || null,
        modulo:    'accesos',
        accion:    'set-accesos',
        entidadId: usuarioId,
        detalle:   { modules },
        ip:        req.ip
      });
      return res.json({ success: true, message: 'Accesos actualizados', data: { usuarioId: parseInt(usuarioId), modules } });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      console.error('Error setUserAccess:', err);
      return res.status(500).json({ success: false, message: 'Error actualizando accesos' });
    }
  } catch (e) {
    console.error('Error setUserAccess outer:', e);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};

exports.grantModule = async (req, res) => {
  try {
    const { usuarioId, moduloKey } = req.params;
    if (!usuarioId || !moduloKey) return res.status(400).json({ success: false, message: 'usuarioId y moduloKey requeridos' });
    const adminId = req.user && (req.user.id || req.user.sub || req.user.userId) ? parseInt(req.user.id || req.user.sub || req.user.userId) : null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const reqIns = pool.request();
    await reqIns
      .input('usuarioId', sql.Int, parseInt(usuarioId))
      .input('moduloKey', sql.NVarChar, String(moduloKey))
      .input('allow', sql.Bit, true)
      .input('grantedBy', sql.Int, adminId)
      .query(`
        MERGE INTRANET_USUARIOS_MODULOS AS target
        USING (SELECT @usuarioId AS USUARIO_ID, @moduloKey AS MODULO_KEY) AS src
        ON target.USUARIO_ID = src.USUARIO_ID AND target.MODULO_KEY = src.MODULO_KEY
        WHEN MATCHED THEN UPDATE SET ALLOW = @allow, GRANTED_BY=@grantedBy, GRANTED_AT=GETDATE()
        WHEN NOT MATCHED THEN INSERT (USUARIO_ID, MODULO_KEY, ALLOW, GRANTED_BY) VALUES (src.USUARIO_ID, src.MODULO_KEY, @allow, @grantedBy);
      `);
    const pool2 = await databaseService.getPool(req.user?.empresa);
    await logAudit(pool2, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'accesos',
      accion:    'grant',
      entidadId: usuarioId,
      detalle:   { moduloKey },
      ip:        req.ip
    });
    notifyAccesosUpdated(parseInt(usuarioId), req.user?.empresa);
    return res.json({ success: true, message: 'Módulo concedido' });
  } catch (e) {
    console.error('Error grantModule:', e);
    return res.status(500).json({ success: false, message: 'Error concediendo módulo' });
  }
};

exports.revokeModule = async (req, res) => {
  try {
    const { usuarioId, moduloKey } = req.params;
    if (!usuarioId || !moduloKey) return res.status(400).json({ success: false, message: 'usuarioId y moduloKey requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('usuarioId', sql.Int, parseInt(usuarioId))
      .input('moduloKey', sql.NVarChar, String(moduloKey))
      .query(`
        MERGE INTRANET_USUARIOS_MODULOS AS target
        USING (SELECT @usuarioId AS USUARIO_ID, @moduloKey AS MODULO_KEY) AS src
        ON target.USUARIO_ID = src.USUARIO_ID AND target.MODULO_KEY = src.MODULO_KEY
        WHEN MATCHED THEN UPDATE SET ALLOW = 0, GRANTED_AT = GETDATE()
        WHEN NOT MATCHED THEN INSERT (USUARIO_ID, MODULO_KEY, ALLOW) VALUES (src.USUARIO_ID, src.MODULO_KEY, 0);
      `);
    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'accesos',
      accion:    'revoke',
      entidadId: usuarioId,
      detalle:   { moduloKey },
      ip:        req.ip
    });
    notifyAccesosUpdated(parseInt(usuarioId), req.user?.empresa);
    return res.json({ success: true, message: 'Módulo revocado' });
  } catch (e) {
    console.error('Error revokeModule:', e);
    return res.status(500).json({ success: false, message: 'Error revocando módulo' });
  }
};

/* ══════════════════════════════════════════════════════
   EMPRESAS (multi-tenant) — solo super-admins fijos
══════════════════════════════════════════════════════ */

exports.listEmpresas = async (req, res) => {
  try {
    if (!esSuperAdminFijo(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { listTenants } = require('../config/tenants');
    const tenants = listTenants();

    // Overrides ALLOW=0 por empresa (todas viven en el tenant maestro) para
    // resolver "N módulos activos" sin una query por empresa.
    const modulosTotal = MODULOS_DISPONIBLES.length;
    let bloqueadosPorEmpresa = new Map();
    try {
      const master = await databaseService.getPool(DEFAULT_TENANT);
      const rs = await master.request().query(
        `SELECT EMP_KEY, COUNT(*) AS n FROM INTRANET_EMPRESAS_MODULOS
         WHERE ALLOW = 0 GROUP BY EMP_KEY`,
      );
      bloqueadosPorEmpresa = new Map(rs.recordset.map((r) => [String(r.EMP_KEY).toLowerCase(), r.n]));
    } catch (_) { /* si falla, todos cuentan como activos */ }

    const data = await Promise.all(tenants.map(async (t) => {
      let usuarios = null;
      try {
        const pool = await databaseService.getPool(t.key);
        const r = await pool.request().query('SELECT COUNT(*) AS n FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1');
        usuarios = r.recordset[0]?.n ?? null;
      } catch (_) { /* empresa sin BD accesible: usuarios = null */ }
      const bloqueados = bloqueadosPorEmpresa.get(t.key.toLowerCase()) ?? 0;
      return {
        key: t.key,
        nombre: t.nombre,
        usuarios,
        modulosActivos: Math.max(0, modulosTotal - bloqueados),
        modulosTotal,
      };
    }));

    return res.json({ success: true, data });
  } catch (e) {
    console.error('Error listEmpresas:', e);
    return res.status(500).json({ success: false, message: 'Error al listar empresas' });
  }
};

exports.createEmpresa = async (req, res) => {
  try {
    if (!esSuperAdminFijo(req)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const { codigo, nombre, adminUsuario, adminPassword, adminNombre } = req.body || {};
    if (!codigo || !nombre || !adminUsuario || !adminPassword || !adminNombre) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }
    const key = String(codigo).trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(key)) {
      return res.status(400).json({ success: false, message: 'Código inválido: solo minúsculas, números y guion bajo, debe empezar con letra (2-30 caracteres)' });
    }

    const { getTenantConfig, registerTenant } = require('../config/tenants');
    try {
      getTenantConfig(key);
      return res.status(400).json({ success: false, message: 'Ya existe una empresa con ese código' });
    } catch (_) {
      // getTenantConfig lanza si no existe — es el caso esperado, seguir.
    }

    const databaseName = `intranet_${key}`;

    // 1. Crear la base de datos (contra el pool de la empresa maestra, pero
    //    en el contexto de master — CREATE DATABASE no puede ir en batch con
    //    USE de otra BD ni dentro de una transacción explícita).
    const poolMaestro = await databaseService.getPool(req.user?.empresa);
    try {
      await poolMaestro.request().batch(`
        IF DB_ID('${databaseName}') IS NOT NULL
          THROW 50001, 'La base de datos ya existe', 1;
        CREATE DATABASE [${databaseName}];
      `);
    } catch (dbErr) {
      console.error('Error creando base de datos de empresa:', dbErr);
      return res.status(500).json({ success: false, message: `No se pudo crear la base de datos: ${dbErr.message}` });
    }

    // 2. Registrar el tenant en el caché en memoria ANTES de inicializar el
    //    pool — getTenantConfig (usado por initialize/getPool) necesita
    //    resolver la BD del tenant nuevo, y solo la conoce tras este registro.
    registerTenant(key, nombre.trim(), databaseName);

    // 3. Abrir pool sobre la BD recién creada — initialize() aplica
    //    ensureAllSchemas automáticamente (incluye NEUS_USUARIOS desde cero).
    let poolNuevo;
    try {
      await databaseService.initialize(key);
      poolNuevo = await databaseService.getPool(key);
    } catch (schemaErr) {
      console.error('Error inicializando esquema de empresa nueva:', schemaErr);
      return res.status(500).json({ success: false, message: `Base de datos creada, pero falló el esquema: ${schemaErr.message}` });
    }

    // 4. Crear el primer usuario administrador en la BD nueva.
    let nuevoAdminId = null;
    try {
      const insert = await poolNuevo.request()
        .input('nombres', sql.NVarChar, adminNombre.trim())
        .input('usuario', sql.NVarChar, String(adminUsuario).trim())
        .input('contra', sql.NVarChar, adminPassword)
        .query(`
          INSERT INTO NEUS_USUARIOS
          (NEUS_NOMBRES, NEUS_USUARIO, NEUS_CONTRA, NEUS_TIPOUSUARIO, NEUS_ACTIVO, NEUS_STATUS, NEUS_BASE, NEUS_FECHA_REGISTRO, username, [password], NEUS_DEBE_CAMBIAR_PASSWORD)
          VALUES (@nombres, @usuario, @contra, 'AD', 1, 1, 1, GETDATE(), @usuario, @contra, 1);
          SELECT SCOPE_IDENTITY() AS NEUS_ID;
        `);
      nuevoAdminId = insert.recordset[0]?.NEUS_ID || null;
    } catch (userErr) {
      console.error('Error creando admin inicial de empresa nueva:', userErr);
      return res.status(500).json({ success: false, message: `Empresa creada, pero falló el usuario administrador: ${userErr.message}` });
    }

    // 5. Registrar la empresa en el catálogo persistente (BD maestra), para
    //    que sobreviva a un restart del proceso.
    try {
      await poolMaestro.request()
        .input('key', sql.NVarChar, key)
        .input('nombre', sql.NVarChar, nombre.trim())
        .input('database', sql.NVarChar, databaseName)
        .input('creadoPor', sql.Int, req.user?.id || null)
        .query(`
          INSERT INTO dbo.INTRANET_EMPRESAS (EMP_KEY, EMP_NOMBRE, EMP_DATABASE, EMP_CREADO_POR)
          VALUES (@key, @nombre, @database, @creadoPor)
        `);
    } catch (catalogErr) {
      console.error('Error registrando empresa en catálogo:', catalogErr);
      // No revertir lo ya creado — la empresa funciona igual (quedó en el
      // caché en memoria vía registerTenant); solo no sobrevivirá un restart
      // sin que alguien vuelva a ejecutar esto o inserte la fila a mano.
    }

    await logAudit(poolMaestro, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'accesos',
      accion:    'crear-empresa',
      entidadId: key,
      detalle:   { nombre, database: databaseName, adminUsuario },
      ip:        req.ip,
    });

    return res.status(201).json({
      success: true,
      message: 'Empresa creada correctamente',
      data: { key, nombre: nombre.trim(), database: databaseName, adminId: nuevoAdminId },
    });
  } catch (e) {
    console.error('Error createEmpresa:', e);
    return res.status(500).json({ success: false, message: 'Error al crear la empresa' });
  }
};
