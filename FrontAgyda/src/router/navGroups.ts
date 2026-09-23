// Secciones del sidebar, organizadas por área de negocio (ver plan "Expansión de
// la Intranet a las 10 Áreas"). Fuente única: el Sidebar y el árbol de
// Configuración (pages/configuracion/configTree.ts) usan estas mismas secciones,
// en el mismo orden y con los mismos nombres.
// El ícono de cada grupo en el sidebar es el del primer moduleKey listado — por
// eso cada área empieza con su propio moduleKey de área (direccion-general,
// rh-area, etc.) antes de sus módulos.
export interface NavGroup {
  key: string
  label: string
  keys: string[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'principal',
    label: 'Principal',
    keys: ['*', 'noticias', 'mensajeria'],
  },
  {
    key: 'direccion-general',
    label: 'Dirección General',
    keys: ['direccion-general', 'areas-portal', 'reports'],
  },
  {
    key: 'recursos-humanos',
    label: 'Recursos Humanos',
    keys: ['rh-area', 'expedientes', 'nomina', 'vacaciones', 'asistencia-personal', 'asistencia', 'mi-area', 'vacantes', 'encuestas', 'capacitacion', 'incapacidades', 'evaluacion-desempeno'],
  },
  {
    key: 'finanzas-administracion',
    label: 'Finanzas y Administración',
    keys: ['finanzas', 'gastos'],
  },
  {
    key: 'crm',
    label: 'CRM',
    keys: ['ventas-area', 'clientes', 'productos-servicios', 'crm', 'email-marketing'],
  },
  {
    key: 'contact-center',
    label: 'Contact Center',
    keys: ['contact-center', 'operaciones', 'webphone', 'livechat', 'checklists'],
  },
  {
    key: 'calidad',
    label: 'Calidad',
    keys: ['calidad', 'evaluacion', 'auditoria'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    keys: ['marketing', 'organigrama', 'chatbot'],
  },
  {
    key: 'tecnologia-ti',
    label: 'Tecnología / TI',
    keys: ['tecnologia', 'tickets', 'activos', 'staff-ti'],
  },
  {
    key: 'atencion-cliente',
    label: 'Atención al Cliente',
    keys: ['atencion-cliente'], // Fase 8: 'quejas' (módulo legacy) retirado — Quejas ahora vive en Casos
  },
  {
    key: 'legal-cumplimiento',
    label: 'Legal y Cumplimiento',
    keys: ['legal', 'reglamento'],
  },
  {
    key: 'otros',
    label: 'Otros',
    keys: ['drive', 'musica', 'calendario', 'proyectos'],
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    keys: ['configuracion'],
  },
]
