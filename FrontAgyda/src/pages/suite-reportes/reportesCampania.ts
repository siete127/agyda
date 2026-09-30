import { CalendarCheck, Search, BarChart2, Users } from 'lucide-react'

// Reportes que cada campaña activa trae en la Suite (carpeta "Campañas"),
// ya filtrados a esa campaña. Se arman solos al crear la campaña: no se
// guardan en ningún lado.
export const REPORTES_CAMPANIA = [
  { id: 'registros', nombre: 'Registros del formulario', descripcion: 'Lo capturado en los formularios de la campaña, por persona y con seguimientos.', icon: CalendarCheck },
  { id: 'interacciones', nombre: 'Interacciones por canal', descripcion: 'Conversaciones cerradas en los canales de la campaña (y su histórico de Ventas).', icon: Search },
  { id: 'ejecutivo', nombre: 'Reporte ejecutivo', descripcion: 'Embudo, KPIs de conversión y gráficas; en campañas de ventas, contra metas y pre nómina.', icon: BarChart2 },
  { id: 'productividad', nombre: 'Productividad de agentes', descripcion: 'Atenciones, pausas y estado de sus agentes; en campañas de ventas, ventas contra meta y pre nómina.', icon: Users },
] as const

export type ReporteCampaniaId = typeof REPORTES_CAMPANIA[number]['id']
