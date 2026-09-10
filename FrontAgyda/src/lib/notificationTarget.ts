import type { NotificationItem } from '@/stores/notification.store'

// Devuelve la ruta a la que debe llevar una notificación al hacer click,
// o null si no es navegable. Usado por el panel del topbar y la página
// completa de notificaciones para no duplicar la lógica.
export function notificationTarget(n: NotificationItem): string | null {
  const d = (n.dataExtra ?? {}) as Record<string, unknown>
  const tipo = (n.tipo ?? '').toLowerCase()
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v) || null)

  const ticketId = num(d.ticketId)
  const quejaId = num(d.quejaId)
  const proyectoId = num(d.proyectoId)
  const encuestaId = num(d.encuestaId)
  const noticiaId = num(d.noticiaId)
  const canalId = num(d.canalId)
  const documentoId = num(d.documentoId ?? d.docId)
  const casoId = num(d.casoId)
  const citaId = num(d.citaId)

  // Tickets — cualquier tipo que empiece con "ticket" o traiga ticketId
  if (ticketId || tipo.includes('ticket')) {
    return ticketId ? `/tickets?id=${ticketId}` : '/tickets'
  }

  // Quejas — Fase 9: son un tipo de Caso. El id viejo (tabla QUEJAS) ya no
  // resuelve un caso, así que se abre la lista de casos tipo queja.
  if (quejaId || tipo === 'queja' || tipo === 'queja_nueva') {
    return '/atencion-cliente/casos?tipo=queja'
  }

  // Encuestas
  if (encuestaId || d.action === 'responder_encuesta' || tipo === 'encuesta') {
    return encuestaId ? `/mis-encuestas?encuesta=${encuestaId}` : '/mis-encuestas'
  }

  // Noticias
  if (noticiaId || tipo === 'noticia') {
    return noticiaId ? `/noticias?noticia=${noticiaId}` : '/noticias'
  }

  // Mensajería
  if (canalId || tipo === 'mensajeria') {
    return canalId ? `/mensajeria?canal=${canalId}` : '/mensajeria'
  }

  // Proyectos (tareas, comentarios de proyecto)
  if (proyectoId || tipo === 'proyecto' || tipo === 'tarea' || tipo === 'tarea_completada') {
    return proyectoId ? `/proyectos?id=${proyectoId}` : '/proyectos'
  }

  // Legal — nuevo documento
  if (documentoId || tipo === 'legal_nuevo_documento' || tipo.startsWith('legal')) {
    return '/legal'
  }

  // Comentarios de módulos de Dirección General (OKR, decisiones, diseño)
  if (tipo === 'okr_comentario') return '/direccion-general'
  if (tipo === 'decision_comentario') return '/direccion-general'
  if (tipo === 'diseno_comentario') return '/direccion-general'

  // Consultas / aclaraciones (CRM / atención a clientes)
  if (tipo === 'consulta_nueva' || tipo === 'aclaracion_nueva') return '/atencion-cliente'

  // Módulo unificado "Seguimiento de clientes" — todo entra como pestaña.
  // Casos (incluye las incidencias automáticas de SLA/encuesta/portal).
  if (casoId || tipo === 'caso-asignado' || tipo === 'caso-automatico' ||
      tipo === 'cliente-incidencia-sla-riesgo' || tipo === 'cliente-incidencia-sla-vencido' ||
      tipo === 'cliente-incidencia-portal' || tipo === 'cliente-incidencia-automatica') {
    return casoId ? `/atencion-cliente/clientes?tab=casos&casoId=${casoId}` : '/atencion-cliente/clientes?tab=casos'
  }

  // Citas del cliente
  if (citaId || tipo === 'cliente-cita-asignada' || tipo === 'cliente-cita-confirmada' || tipo === 'cliente-cita-solicitud') {
    return citaId ? `/atencion-cliente/clientes?tab=agenda&citaId=${citaId}` : '/atencion-cliente/clientes?tab=agenda'
  }

  // Seguimiento activo a clientes
  if (tipo === 'cliente-tarea-vence' || tipo === 'cliente-seguimiento-hoy') return '/atencion-cliente/clientes?tab=mi-agenda'
  if (tipo === 'cliente-inactivo' || tipo === 'cliente-nuevo-asignado' || tipo === 'cliente-tarea-asignada' || tipo === 'cliente-contacto-web') return '/atencion-cliente/clientes?tab=clientes'
  if (tipo === 'cliente-pago-por-vencer' || tipo === 'crm-recordatorio-pago' ||
      tipo === 'cliente-pago-confirmado' || tipo === 'cliente-fecha-importante') return '/crm-interno'

  return null
}
