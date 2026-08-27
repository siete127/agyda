export interface RouteConfig {
  path: string
  label: string
  icon: string
  moduleKey: string
  roles: string[]
  showInSidebar: boolean
  description?: string
}

// Roles internos — excluye CL (clientes externos)
const INT = ['AD', 'TI', 'CC', 'ST', 'VE']
// Roles sin CC (Call Center)
const NO_CC = ['AD', 'TI', 'ST', 'VE']

export const ROUTES: RouteConfig[] = [
  // ── Principal ──────────────────────────────────────────────────────────
  { path: '/dashboard',        label: 'Inicio',          icon: 'Home',                 moduleKey: '*',                roles: INT,                  showInSidebar: true  },
  { path: '/noticias',         label: 'Noticias',        icon: 'Newspaper',            moduleKey: 'noticias',         roles: INT,                  showInSidebar: true  },
  { path: '/tickets',          label: 'Tickets',         icon: 'LifeBuoy',             moduleKey: 'tickets',          roles: [],                   showInSidebar: true  },
  { path: '/mensajeria',       label: 'Mensajería',      icon: 'MessagesSquare',       moduleKey: 'mensajeria',       roles: INT,                  showInSidebar: true  },

  // ── Mi Espacio ─────────────────────────────────────────────────────────
  { path: '/gastos',           label: 'Gastos',          icon: 'Receipt',              moduleKey: 'gastos',           roles: INT,                  showInSidebar: true  },
  { path: '/mi-area',          label: 'Mi Área',         icon: 'UsersRound',           moduleKey: 'mi-area',          roles: INT,                  showInSidebar: true  },
  { path: '/vacaciones',       label: 'Vacaciones',      icon: 'Umbrella',             moduleKey: 'vacaciones',       roles: INT,                  showInSidebar: true  },
  { path: '/mi-asistencia',    label: 'Mi Asistencia',   icon: 'Clock',                moduleKey: 'asistencia-personal', roles: ['AD','TI','CC'],  showInSidebar: true  },
  { path: '/calendario',       label: 'Calendario',      icon: 'Calendar',             moduleKey: 'calendario',       roles: INT,                  showInSidebar: true  },
  { path: '/quejas',           label: 'Quejas',          icon: 'MessageSquareWarning', moduleKey: 'quejas',           roles: INT,                  showInSidebar: true  },
  { path: '/proyectos',        label: 'Proyectos',       icon: 'Briefcase',            moduleKey: 'proyectos',        roles: NO_CC,                showInSidebar: true  },
  { path: '/evaluacion-capacitacion', label: 'Evaluación CC', icon: 'ClipboardCheck', moduleKey: 'evaluacion',       roles: ['AD','TI','CC'],     showInSidebar: true  },
  { path: '/reglamento',       label: 'Reglamento',      icon: 'BookOpen',             moduleKey: 'reglamento',       roles: INT,                  showInSidebar: true  },

  // ── Herramientas ───────────────────────────────────────────────────────
  { path: '/drive',            label: 'Drive',           icon: 'HardDrive',            moduleKey: 'drive',            roles: NO_CC,                showInSidebar: true  },
  { path: '/organigrama',      label: 'Organigrama',     icon: 'GitBranch',            moduleKey: 'organigrama',      roles: NO_CC,                showInSidebar: true  },
  { path: '/musica',           label: 'Música',          icon: 'Music2',               moduleKey: 'musica',           roles: NO_CC,                showInSidebar: true  },
  { path: '/webphone',         label: 'Marcador',        icon: 'Phone',                moduleKey: 'webphone',         roles: ['AD','CC'],          showInSidebar: true  },
  { path: '/clientes',         label: 'Clientes',        icon: 'TrendingUp',           moduleKey: 'clientes',         roles: NO_CC,                showInSidebar: true  },
  { path: '/productos-servicios', label: 'Productos y Servicios', icon: 'Package',     moduleKey: 'productos-servicios', roles: NO_CC,             showInSidebar: true  },
  { path: '/crm-interno',      label: 'CRM',             icon: 'LineChart',            moduleKey: 'crm',              roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/email-marketing',  label: 'Email Marketing', icon: 'Mail',                 moduleKey: 'email-marketing',  roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/encuestas',        label: 'Encuestas',       icon: 'ClipboardList',        moduleKey: 'encuestas',        roles: ['AD','TI'],          showInSidebar: true  },

  // ── Gestión ────────────────────────────────────────────────────────────
  { path: '/reportes',         label: 'Reportes',        icon: 'BarChart2',            moduleKey: 'reports',          roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/banio',            label: 'Reporte Baño',    icon: 'Footprints',           moduleKey: 'reports',          roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/usuarios',         label: 'Usuarios',        icon: 'Users',                moduleKey: 'usuarios',         roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/staff-ti',         label: 'Staff TI',        icon: 'MonitorCheck',         moduleKey: 'staff-ti',         roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/activos',          label: 'Activos',         icon: 'Boxes',                moduleKey: 'activos',          roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/vacantes',         label: 'Vacantes',        icon: 'UserPlus',             moduleKey: 'vacantes',         roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/chatbot',          label: 'Chatbot',         icon: 'MessageSquare',        moduleKey: 'chatbot',          roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/livechat',         label: 'Chat en Vivo',    icon: 'MessageCircle',        moduleKey: 'livechat',         roles: ['AD','TI','CC'],     showInSidebar: true  },

  // ── Administración ─────────────────────────────────────────────────────
  { path: '/asistencia',       label: 'Asistencia',      icon: 'Clock',                moduleKey: 'asistencia',       roles: ['AD'],               showInSidebar: true  },
  { path: '/nomina',           label: 'Nómina',          icon: 'Wallet',               moduleKey: 'nomina',           roles: ['AD'],               showInSidebar: true  },
  { path: '/auditoria',        label: 'Auditoría',       icon: 'ScrollText',           moduleKey: 'auditoria',        roles: ['AD'],               showInSidebar: true  },
  { path: '/expediente',       label: 'Expediente',      icon: 'FolderOpen',           moduleKey: 'expedientes',      roles: ['AD'],               showInSidebar: true  },
  { path: '/configuracion',    label: 'Configuración',   icon: 'Settings',             moduleKey: 'configuracion',    roles: ['AD','TI'],          showInSidebar: true  },

  // ── Áreas de la empresa ────────────────────────────────────────────────
  { path: '/areas',            label: 'Portal de Áreas', icon: 'Building2',            moduleKey: 'areas-portal',      roles: ['AD','TI'],         showInSidebar: true  },
  { path: '/direccion-general', label: 'Dirección General', icon: 'LayoutDashboard',   moduleKey: 'direccion-general', roles: ['AD'],              showInSidebar: true  },
  { path: '/direccion-general/planeacion-estrategica',    label: 'Planeación Estratégica',       icon: 'Target',        moduleKey: 'direccion-general', roles: ['AD'], showInSidebar: true },
  { path: '/direccion-general/indicadores-empresariales', label: 'Indicadores Empresariales',    icon: 'Gauge',         moduleKey: 'direccion-general', roles: ['AD'], showInSidebar: true },
  { path: '/direccion-general/toma-decisiones',           label: 'Toma de Decisiones',           icon: 'Gavel',         moduleKey: 'direccion-general', roles: ['AD'], showInSidebar: true },
  { path: '/direccion-general/supervision-general',       label: 'Supervisión General',          icon: 'Radar',         moduleKey: 'direccion-general', roles: ['AD'], showInSidebar: true },
  { path: '/direccion-general/reportes-ejecutivos',       label: 'Reportes Ejecutivos',          icon: 'FileBarChart',  moduleKey: 'direccion-general', roles: ['AD'], showInSidebar: true },
  { path: '/direccion-general/mejora-continua',           label: 'Mejora Continua',              icon: 'ClipboardCheck', moduleKey: 'direccion-general', roles: ['AD'], showInSidebar: true },
  { path: '/calidad',          label: 'Calidad',         icon: 'ShieldCheck',          moduleKey: 'calidad',          roles: ['AD','TI'],          showInSidebar: true,  description: 'Evaluaciones QA y desempeño por agente' },
  { path: '/calidad/retroalimentacion', label: 'Retroalimentación', icon: 'MessageSquareHeart', moduleKey: 'calidad', roles: ['AD','TI'],          showInSidebar: true,  description: 'Retroalimentación a agentes evaluados' },
  { path: '/calidad/planes-mejora', label: 'Planes de mejora', icon: 'Target',         moduleKey: 'calidad',          roles: ['AD','TI'],          showInSidebar: true,  description: 'Planes de mejora derivados de evaluaciones' },
  { path: '/calidad/cumplimiento-procesos', label: 'Cumplimiento de procesos', icon: 'ListChecks', moduleKey: 'calidad', roles: ['AD','TI'],        showInSidebar: true,  description: 'Seguimiento de cumplimiento de procesos' },
  { path: '/calidad/auditorias', label: 'Auditorías',    icon: 'ClipboardCheck',       moduleKey: 'calidad',          roles: ['AD','TI'],          showInSidebar: true,  description: 'Auditorías de cumplimiento de procesos de calidad' },
  { path: '/calidad/deteccion-errores', label: 'Detección de errores', icon: 'AlertTriangle', moduleKey: 'calidad',  roles: ['AD','TI'],          showInSidebar: true,  description: 'Registro de errores detectados' },
  { path: '/marketing',        label: 'Marketing',       icon: 'Megaphone',            moduleKey: 'marketing',        roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/marketing/redes-sociales',      label: 'Redes Sociales',      icon: 'Share2',        moduleKey: 'marketing', roles: ['AD','TI'], showInSidebar: true },
  { path: '/marketing/diseno',              label: 'Diseño',              icon: 'Palette',       moduleKey: 'marketing', roles: ['AD','TI'], showInSidebar: true },
  { path: '/marketing/publicidad',          label: 'Publicidad',          icon: 'Megaphone',     moduleKey: 'marketing', roles: ['AD','TI'], showInSidebar: true },
  { path: '/marketing/contenido',           label: 'Contenido',           icon: 'Newspaper',     moduleKey: 'marketing', roles: ['AD','TI'], showInSidebar: true },
  { path: '/marketing/imagen-corporativa',  label: 'Imagen Corporativa',  icon: 'Palette',       moduleKey: 'marketing', roles: ['AD','TI'], showInSidebar: true },
  { path: '/marketing/resultados',          label: 'Resultados',         icon: 'BarChart3',     moduleKey: 'marketing', roles: ['AD','TI'], showInSidebar: true },
  { path: '/legal',            label: 'Legal',           icon: 'Scale',                moduleKey: 'legal',            roles: ['AD','TI'],          showInSidebar: true  },
  { path: '/finanzas',         label: 'Finanzas',        icon: 'Wallet',               moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Ingresos, cuentas por cobrar y por pagar' },
  { path: '/finanzas/ingresos', label: 'Ingresos',       icon: 'TrendingUp',           moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Registro de ingresos de la empresa' },
  { path: '/finanzas/egresos', label: 'Egresos',         icon: 'TrendingDown',         moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Registro de egresos de la empresa' },
  { path: '/finanzas/presupuestos', label: 'Presupuestos', icon: 'PiggyBank',          moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Presupuesto asignado y ejercido por área' },
  { path: '/finanzas/cuentas-cobrar', label: 'Cuentas por cobrar', icon: 'Receipt',    moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Saldos pendientes de clientes' },
  { path: '/finanzas/cuentas-pagar', label: 'Cuentas por pagar', icon: 'CreditCard',   moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Saldos pendientes con proveedores' },
  { path: '/finanzas/bancos',  label: 'Bancos',          icon: 'Landmark',             moduleKey: 'finanzas',         roles: ['AD','TI'],          showInSidebar: true,  description: 'Cuentas bancarias y movimientos' },
  { path: '/finanzas/reportes-financieros', label: 'Reportes financieros', icon: 'BarChart2', moduleKey: 'finanzas', roles: ['AD','TI'],          showInSidebar: true,  description: 'Reportes financieros consolidados' },
  { path: '/ventas-area',      label: 'Ventas (Área)',   icon: 'Target',               moduleKey: 'ventas-area',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Seguimiento de metas comerciales' },
  { path: '/ventas-area/metas', label: 'Metas',          icon: 'ListChecks',           moduleKey: 'ventas-area',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Metas diaria, semanal y mensual' },
  { path: '/ventas-area/asesores', label: 'Asesores',    icon: 'Headphones',           moduleKey: 'ventas-area',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Productividad, ventas y conversión por asesor' },
  { path: '/ventas-area/prospeccion', label: 'Prospección', icon: 'Contact',           moduleKey: 'ventas-area',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Seguimiento de prospectos' },
  { path: '/ventas-area/comisiones', label: 'Comisiones', icon: 'Percent',             moduleKey: 'ventas-area',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Cálculo y seguimiento de comisiones' },
  { path: '/ventas-area/incentivos', label: 'Incentivos', icon: 'Gift',                moduleKey: 'ventas-area',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Incentivos por desempeño de ventas' },
  { path: '/ventas-area/reportes-resultados', label: 'Reportes de resultados', icon: 'BarChart2', moduleKey: 'ventas-area', roles: ['AD','TI'],    showInSidebar: true,  description: 'Reportes de resultados de ventas' },
  { path: '/operaciones',      label: 'Operaciones',     icon: 'Headset',              moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Campañas activas y asignación de bases' },
  { path: '/operaciones/campanas', label: 'Campañas',    icon: 'Megaphone',            moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Campaña asignada a cada agente CC' },
  { path: '/operaciones/supervisores', label: 'Supervisores', icon: 'UserCheck',       moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Panel de supervisores de Call Center' },
  { path: '/operaciones/asesores', label: 'Asesores',    icon: 'Headphones',           moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Mi día — estado y tiempos personales' },
  { path: '/operaciones/tiempos', label: 'Tiempos',      icon: 'CalendarClock',        moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Bitácora detallada de sesiones y pausas' },
  { path: '/operaciones/kpis', label: 'KPIs',            icon: 'Gauge',                moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Indicadores clave de operaciones' },
  { path: '/operaciones/metas', label: 'Metas',          icon: 'ListChecks',           moduleKey: 'operaciones',      roles: ['AD','TI'],          showInSidebar: true,  description: 'Metas operativas del Call Center' },
  { path: '/operaciones/reportes-diarios', label: 'Reportes diarios', icon: 'BarChart2', moduleKey: 'operaciones',    roles: ['AD','TI'],          showInSidebar: true,  description: 'Reportes diarios de operación' },
  { path: '/tecnologia',       label: 'Tecnología',      icon: 'Cpu',                  moduleKey: 'tecnologia',       roles: ['AD','TI'],          showInSidebar: true,  description: 'Incidentes y mantenimientos' },
  { path: '/tecnologia/internet-redes', label: 'Internet y redes', icon: 'Wifi',       moduleKey: 'tecnologia',       roles: ['AD','TI'],          showInSidebar: true,  description: 'Estado de conectividad e infraestructura de red' },
  { path: '/tecnologia/sistemas', label: 'Sistemas',     icon: 'Server',               moduleKey: 'tecnologia',       roles: ['AD','TI'],          showInSidebar: true,  description: 'Sistemas internos y su estado' },
  { path: '/tecnologia/respaldos', label: 'Respaldos',   icon: 'HardDriveDownload',     moduleKey: 'tecnologia',       roles: ['AD','TI'],          showInSidebar: true,  description: 'Estado y calendario de respaldos' },
  { path: '/atencion-cliente', label: 'Atención al Cliente', icon: 'Headphones',       moduleKey: 'atencion-cliente', roles: ['AD','TI'],          showInSidebar: false },
  { path: '/atencion-cliente/consultas',    label: 'Consultas',    icon: 'Headset',      moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Consultas recibidas de clientes' },
  { path: '/atencion-cliente/aclaraciones', label: 'Aclaraciones', icon: 'FileQuestion', moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Aclaraciones solicitadas por clientes' },
  { path: '/atencion-cliente/seguimiento',  label: 'Seguimiento',  icon: 'ListChecks',   moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Seguimiento de casos abiertos' },
  { path: '/atencion-cliente/satisfaccion', label: 'Satisfacción', icon: 'Smile',        moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Encuestas y medición de satisfacción' },
  { path: '/atencion-cliente/retencion',    label: 'Retención',    icon: 'ShieldAlert',  moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Clientes en riesgo y acciones de retención' },
  { path: '/atencion-cliente/clientes',     label: 'Seguimiento de clientes', icon: 'Users', moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Expediente y seguimiento de clientes' },
  { path: '/atencion-cliente/mis-tareas',   label: 'Mis Tareas',   icon: 'ClipboardCheck', moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Tareas de clientes asignadas a ti' },
  { path: '/atencion-cliente/incidencias',  label: 'Incidencias',  icon: 'AlertOctagon',  moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Gestión de incidencias de clientes' },
  { path: '/atencion-cliente/clientes/dashboard', label: 'Dashboard de Clientes', icon: 'BarChart3', moduleKey: 'atencion-cliente', roles: INT, showInSidebar: true, description: 'Métricas y reportes de clientes' },
  { path: '/rh',               label: 'Recursos Humanos', icon: 'UserPlus',            moduleKey: 'rh-area',          roles: ['AD','TI'],          showInSidebar: true,  description: 'Vacantes abiertas y candidatos en proceso' },
  { path: '/rh/reclutamiento', label: 'Reclutamiento',   icon: 'UserSearch',           moduleKey: 'rh-area',          roles: ['AD','TI'],          showInSidebar: true,  description: 'Vacantes, candidatos, entrevistas y contratación' },
  { path: '/rh/capacitacion',  label: 'Capacitación',    icon: 'GraduationCap',        moduleKey: 'capacitacion',     roles: ['AD','TI'],          showInSidebar: true,  description: 'Inducción, cursos, materiales y constancias' },
  { path: '/rh/incapacidades', label: 'Incapacidades',   icon: 'HeartPulse',           moduleKey: 'incapacidades',    roles: ['AD','TI'],          showInSidebar: true,  description: 'Registro, seguimiento y regreso a labores' },
  { path: '/rh/evaluacion-desempeno', label: 'Evaluación de desempeño', icon: 'TrendingUp', moduleKey: 'evaluacion-desempeno', roles: ['AD','TI'], showInSidebar: true,  description: 'KPIs, metas, retroalimentación y planes de mejora' },
  { path: '/rh/clima-laboral', label: 'Clima laboral',   icon: 'Smile',                moduleKey: 'rh-area',          roles: ['AD','TI'],          showInSidebar: true,  description: 'Comunicados, encuestas y actividades internas' },

  // ── Ocultos en sidebar ─────────────────────────────────────────────────
  { path: '/permisos',         label: 'Permisos',        icon: 'CalendarCheck',        moduleKey: 'permisos',         roles: INT,                  showInSidebar: false },
  { path: '/checklist',        label: 'Asistencias',     icon: 'CheckSquare',          moduleKey: 'checklists',       roles: INT,                  showInSidebar: false },
  { path: '/ventas',           label: 'Ventas',          icon: 'ShoppingCart',         moduleKey: 'ventas',           roles: ['AD','CC','ST','VE'], showInSidebar: false },
  { path: '/notificaciones',   label: 'Notificaciones',  icon: 'Bell',                 moduleKey: '*',                roles: [],                   showInSidebar: false },
  { path: '/perfil',           label: 'Mi Perfil',       icon: 'User',                 moduleKey: '*',                roles: [],                   showInSidebar: false },
  { path: '/quejas/dashboard', label: 'Dashboard Quejas',icon: 'BarChart2',            moduleKey: 'quejas',           roles: ['AD'],               showInSidebar: false },
]

export function getRouteLabel(path: string): string {
  const route = ROUTES.find((r) => r.path === path)
  return route?.label ?? 'AGYDA'
}
