import type { AreaKey } from './areas'

// Sub-ítems de cada área del organigrama (ver documento "Flujo General de la Página Empresarial").
// `kind: 'link'` reutiliza un módulo ya existente en la intranet (sin duplicar).
// `kind: 'placeholder'` es un sub-módulo propio del área, aún sin datos reales — navegable, pendiente de profundizar.
export interface AreaSubItem {
  slug: string
  label: string
  kind: 'link' | 'placeholder'
  linkTo?: string // solo si kind === 'link'
  description: string
}

export const AREA_SUB_ITEMS: Record<AreaKey, AreaSubItem[]> = {
  'direccion-general': [
    { slug: 'planeacion', label: 'Planeación estratégica y objetivos', kind: 'link', linkTo: '/direccion-general/planeacion-estrategica', description: 'Objetivos y planeación estratégica de la empresa.' },
    { slug: 'decisiones', label: 'Toma de decisiones', kind: 'link', linkTo: '/direccion-general/toma-decisiones', description: 'Registro y seguimiento de decisiones ejecutivas.' },
    { slug: 'supervision', label: 'Supervisión general', kind: 'link', linkTo: '/direccion-general/supervision-general', description: 'Panorama de supervisión de todas las áreas.' },
    { slug: 'indicadores', label: 'Indicadores empresariales', kind: 'link', linkTo: '/direccion-general/indicadores-empresariales', description: 'Indicadores clave consolidados de la empresa.' },
    { slug: 'reportes-ejecutivos', label: 'Reportes ejecutivos', kind: 'link', linkTo: '/direccion-general/reportes-ejecutivos', description: 'Reportes de alto nivel para dirección.' },
    { slug: 'mejora-continua', label: 'Seguimiento y mejora continua', kind: 'link', linkTo: '/direccion-general/mejora-continua', description: 'Seguimiento de iniciativas de mejora continua.' },
  ],
  rh: [
    { slug: 'reclutamiento', label: 'Reclutamiento y selección', kind: 'link', linkTo: '/rh/reclutamiento', description: 'Vacantes, candidatos, entrevistas, evaluaciones y contratación.' },
    { slug: 'expedientes', label: 'Expedientes', kind: 'link', linkTo: '/expediente', description: 'Datos personales, documentos, contratos, altas y bajas.' },
    { slug: 'nomina', label: 'Nómina y prestaciones', kind: 'link', linkTo: '/nomina', description: 'Nómina, bonos, comisiones, descuentos, prestaciones e incidencias.' },
    { slug: 'vacaciones', label: 'Vacaciones', kind: 'link', linkTo: '/vacaciones', description: 'Días correspondientes, solicitudes, autorización y calendario.' },
    { slug: 'permisos', label: 'Permisos', kind: 'link', linkTo: '/permisos', description: 'Solicitud, motivo, fecha/horario, autorización e historial.' },
    { slug: 'incapacidades', label: 'Incapacidades', kind: 'link', linkTo: '/rh/incapacidades', description: 'Registro, periodo, comprobante, seguimiento y regreso a labores.' },
    { slug: 'asistencia', label: 'Asistencia', kind: 'link', linkTo: '/asistencia', description: 'Entradas, salidas, retardos, faltas, justificaciones e incidencias.' },
    { slug: 'capacitacion', label: 'Capacitación', kind: 'link', linkTo: '/rh/capacitacion', description: 'Inducción, cursos, materiales, evaluaciones y constancias.' },
    { slug: 'evaluacion-desempeno', label: 'Evaluación de desempeño', kind: 'link', linkTo: '/rh/evaluacion-desempeno', description: 'KPIs, metas, retroalimentación y planes de mejora.' },
    { slug: 'clima-laboral', label: 'Clima laboral', kind: 'link', linkTo: '/rh/clima-laboral', description: 'Comunicados, encuestas, eventos y actividades internas.' },
  ],
  finanzas: [
    { slug: 'ingresos', label: 'Ingresos', kind: 'link', linkTo: '/finanzas/ingresos', description: 'Registro de ingresos de la empresa.' },
    { slug: 'egresos', label: 'Egresos', kind: 'link', linkTo: '/finanzas/egresos', description: 'Registro de egresos, distinto del control de gastos por empleado.' },
    { slug: 'presupuestos', label: 'Presupuestos', kind: 'link', linkTo: '/finanzas/presupuestos', description: 'Presupuesto asignado y ejercido por área y periodo.' },
    { slug: 'facturacion', label: 'Facturación', kind: 'placeholder', description: 'Emisión y control de facturas.' },
    { slug: 'cuentas-cobrar', label: 'Cuentas por cobrar', kind: 'link', linkTo: '/finanzas/cuentas-cobrar', description: 'Saldos pendientes de clientes.' },
    { slug: 'cuentas-pagar', label: 'Cuentas por pagar', kind: 'link', linkTo: '/finanzas/cuentas-pagar', description: 'Saldos pendientes con proveedores.' },
    { slug: 'bancos', label: 'Bancos', kind: 'link', linkTo: '/finanzas/bancos', description: 'Cuentas bancarias y movimientos.' },
    { slug: 'reportes-financieros', label: 'Reportes financieros', kind: 'link', linkTo: '/finanzas/reportes-financieros', description: 'Reportes financieros consolidados.' },
  ],
  ventas: [
    { slug: 'metas', label: 'Metas', kind: 'link', linkTo: '/ventas-area/metas', description: 'Metas diaria, semanal y mensual.' },
    { slug: 'asesores', label: 'Asesores', kind: 'link', linkTo: '/ventas-area/asesores', description: 'Productividad, ventas y conversión por asesor.' },
    { slug: 'prospeccion', label: 'Prospección', kind: 'link', linkTo: '/ventas-area/prospeccion', description: 'Seguimiento de prospectos.' },
    { slug: 'clientes', label: 'Clientes', kind: 'link', linkTo: '/clientes', description: 'Gestión de clientes.' },
    { slug: 'comisiones', label: 'Comisiones', kind: 'link', linkTo: '/ventas-area/comisiones', description: 'Cálculo y seguimiento de comisiones.' },
    { slug: 'incentivos', label: 'Incentivos', kind: 'link', linkTo: '/ventas-area/incentivos', description: 'Incentivos por desempeño de ventas.' },
    { slug: 'reportes-resultados', label: 'Reportes de resultados', kind: 'link', linkTo: '/ventas-area/reportes-resultados', description: 'Reportes de resultados de ventas.' },
  ],
  operaciones: [
    { slug: 'supervisores', label: 'Supervisores', kind: 'link', linkTo: '/operaciones/supervisores', description: 'Panel de supervisores de Call Center.' },
    { slug: 'asesores', label: 'Asesores', kind: 'link', linkTo: '/operaciones/asesores', description: 'Panel de asesores de Call Center.' },
    { slug: 'campanias', label: 'Campañas', kind: 'link', linkTo: '/operaciones', description: 'Campañas activas del Call Center.' },
    { slug: 'asignacion-bases', label: 'Asignación de bases', kind: 'link', linkTo: '/operaciones', description: 'Asignación de bases de registros por campaña.' },
    { slug: 'productividad', label: 'Productividad', kind: 'link', linkTo: '/operaciones/supervisores?tab=productividad', description: 'Indicadores de productividad de agentes.' },
    { slug: 'metas', label: 'Metas', kind: 'link', linkTo: '/operaciones/metas', description: 'Metas operativas del Call Center.' },
    { slug: 'tiempos', label: 'Tiempos', kind: 'link', linkTo: '/operaciones/tiempos', description: 'Tiempos de llamada y disponibilidad.' },
    { slug: 'kpis', label: 'KPIs', kind: 'link', linkTo: '/operaciones/kpis', description: 'Indicadores clave de operaciones.' },
    { slug: 'reportes-diarios', label: 'Reportes diarios', kind: 'link', linkTo: '/operaciones/reportes-diarios', description: 'Reportes diarios de operación.' },
  ],
  calidad: [
    { slug: 'monitoreo-llamadas', label: 'Monitoreo de llamadas', kind: 'placeholder', description: 'Monitoreo en vivo y grabado de llamadas.' },
    { slug: 'evaluaciones', label: 'Evaluaciones', kind: 'link', linkTo: '/calidad', description: 'Evaluaciones de calidad (QA) por agente.' },
    { slug: 'auditorias', label: 'Auditorías', kind: 'link', linkTo: '/calidad/auditorias', description: 'Auditorías de cumplimiento de procesos de calidad.' },
    { slug: 'retroalimentacion', label: 'Retroalimentación', kind: 'link', linkTo: '/calidad/retroalimentacion', description: 'Retroalimentación a agentes evaluados.' },
    { slug: 'cumplimiento-procesos', label: 'Cumplimiento de procesos', kind: 'link', linkTo: '/calidad/cumplimiento-procesos', description: 'Seguimiento de cumplimiento de procesos.' },
    { slug: 'deteccion-errores', label: 'Detección de errores', kind: 'link', linkTo: '/calidad/deteccion-errores', description: 'Registro de errores detectados.' },
    { slug: 'planes-mejora', label: 'Planes de mejora', kind: 'link', linkTo: '/calidad/planes-mejora', description: 'Planes de mejora derivados de evaluaciones.' },
  ],
  marketing: [
    { slug: 'redes-sociales', label: 'Redes sociales', kind: 'link', linkTo: '/marketing/redes-sociales', description: 'Gestión de redes sociales.' },
    { slug: 'diseno', label: 'Diseño', kind: 'link', linkTo: '/marketing/diseno', description: 'Solicitudes y entregables de diseño.' },
    { slug: 'publicidad', label: 'Publicidad', kind: 'link', linkTo: '/marketing/publicidad', description: 'Campañas publicitarias pagadas.' },
    { slug: 'campanias', label: 'Campañas', kind: 'link', linkTo: '/marketing', description: 'Campañas de marketing.' },
    { slug: 'contenido', label: 'Contenido', kind: 'link', linkTo: '/marketing/contenido', description: 'Calendario y piezas de contenido.' },
    { slug: 'resultados', label: 'Resultados', kind: 'link', linkTo: '/marketing/resultados', description: 'Resultados de campañas de marketing.' },
    { slug: 'imagen-corporativa', label: 'Imagen corporativa', kind: 'link', linkTo: '/marketing/imagen-corporativa', description: 'Lineamientos de marca e imagen corporativa.' },
  ],
  ti: [
    { slug: 'equipos', label: 'Equipos', kind: 'link', linkTo: '/activos', description: 'Inventario de equipos de cómputo.' },
    { slug: 'internet-redes', label: 'Internet y redes', kind: 'link', linkTo: '/tecnologia/internet-redes', description: 'Estado de conectividad e infraestructura de red.' },
    { slug: 'sistemas', label: 'Sistemas', kind: 'link', linkTo: '/tecnologia/sistemas', description: 'Sistemas internos y su estado.' },
    { slug: 'soporte-tecnico', label: 'Soporte técnico', kind: 'link', linkTo: '/tickets', description: 'Tickets de soporte técnico.' },
    { slug: 'seguridad-informatica', label: 'Seguridad informática', kind: 'link', linkTo: '/tecnologia', description: 'Incidentes de seguridad informática.' },
    { slug: 'respaldos', label: 'Respaldos', kind: 'link', linkTo: '/tecnologia/respaldos', description: 'Estado y calendario de respaldos.' },
    { slug: 'mantenimiento', label: 'Mantenimiento', kind: 'link', linkTo: '/tecnologia', description: 'Mantenimientos preventivos y correctivos.' },
  ],
  'atencion-cliente': [
    { slug: 'atencion', label: 'Atención', kind: 'link', linkTo: '/atencion-cliente/consultas', description: 'Registro general de atención a clientes.' },
    { slug: 'consultas', label: 'Consultas', kind: 'link', linkTo: '/atencion-cliente/consultas', description: 'Consultas recibidas de clientes.' },
    { slug: 'quejas', label: 'Quejas', kind: 'link', linkTo: '/quejas', description: 'Registro y seguimiento de quejas.' },
    { slug: 'aclaraciones', label: 'Aclaraciones', kind: 'link', linkTo: '/atencion-cliente/aclaraciones', description: 'Aclaraciones solicitadas por clientes.' },
    { slug: 'seguimiento', label: 'Seguimiento', kind: 'link', linkTo: '/atencion-cliente/seguimiento', description: 'Seguimiento de casos abiertos.' },
    { slug: 'satisfaccion', label: 'Satisfacción', kind: 'link', linkTo: '/atencion-cliente/satisfaccion', description: 'Encuestas y medición de satisfacción.' },
    { slug: 'retencion', label: 'Retención', kind: 'link', linkTo: '/atencion-cliente/retencion', description: 'Clientes en riesgo y acciones de retención.' },
    { slug: 'clientes', label: 'Seguimiento de clientes', kind: 'link', linkTo: '/atencion-cliente/clientes', description: 'Expediente y seguimiento de clientes.' },
    { slug: 'mis-tareas', label: 'Mis Tareas', kind: 'link', linkTo: '/atencion-cliente/mis-tareas', description: 'Tareas de clientes asignadas a ti.' },
    { slug: 'incidencias', label: 'Incidencias', kind: 'link', linkTo: '/atencion-cliente/incidencias', description: 'Gestión de incidencias de clientes.' },
    { slug: 'dashboard-clientes', label: 'Dashboard de Clientes', kind: 'link', linkTo: '/atencion-cliente/clientes/dashboard', description: 'Métricas y reportes de clientes.' },
  ],
  legal: [
    { slug: 'contratos', label: 'Contratos', kind: 'link', linkTo: '/legal/contratos', description: 'Gestión de contratos.' },
    { slug: 'documentacion-legal', label: 'Documentación legal', kind: 'link', linkTo: '/legal/control-documental', description: 'Documentos legales y normativos.' },
    { slug: 'proteccion-datos', label: 'Protección de datos', kind: 'link', linkTo: '/legal/proteccion-datos', description: 'Cumplimiento en protección de datos personales.' },
    { slug: 'politicas', label: 'Políticas', kind: 'link', linkTo: '/legal/control-documental', description: 'Políticas internas de la empresa.' },
    { slug: 'cumplimiento-normativo', label: 'Cumplimiento normativo', kind: 'link', linkTo: '/legal/cumplimiento-normativo', description: 'Seguimiento de obligaciones y cumplimiento normativo.' },
    { slug: 'control-documental', label: 'Control documental', kind: 'link', linkTo: '/legal/control-documental', description: 'Control de versiones de documentos legales.' },
  ],
}
