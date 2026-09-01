import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSocket } from '@/lib/socket'
import { accessService } from '@/services/access.service'
import { useSocketStore } from '@/stores/socket.store'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationStore, type NotificationItem } from '@/stores/notification.store'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { mensajeriaService } from '@/services/mensajeria.service'
import { api } from '@/lib/axios'

export function useSocketInit() {
  const { setStatus, setSocketId } = useSocketStore()
  const user = useAuthStore((s) => s.user)

  // Comparte la misma queryKey que useModuleAccess: no dispara request extra,
  // solo lee el resultado ya cacheado de los módulos permitidos.
  const { data: modulos = [] } = useQuery({
    queryKey: ['accesos-self', user?.id],
    queryFn: () => accessService.getSelfModules(),
    enabled: !!user?.id,
    staleTime: 0,
  })
  const puedeMensajeria = modulos.includes('*') || modulos.includes('mensajeria')

  // Refs estables — nunca cambian de referencia, así el useEffect no se re-ejecuta
  const addNotificationRef  = useRef(useNotificationStore.getState().addNotification)
  const pushTicketAlertRef  = useRef(useNotificationStore.getState().pushTicketAlert)
  const setNotificationsRef = useRef(useNotificationStore.getState().setNotifications)
  const setCanalesRef       = useRef(useMensajeriaStore.getState().setCanales)

  // Mantener las refs actualizadas sin causar re-renders
  useEffect(() => {
    return useNotificationStore.subscribe((s) => {
      addNotificationRef.current  = s.addNotification
      pushTicketAlertRef.current  = s.pushTicketAlert
      setNotificationsRef.current = s.setNotifications
    })
  }, [])

  useEffect(() => {
    return useMensajeriaStore.subscribe((s) => {
      setCanalesRef.current = s.setCanales
    })
  }, [])

  // Registrar listeners de socket — solo una vez al montar
  useEffect(() => {
    const sock = getSocket()
    setStatus('connecting')

    const onConnect = () => {
      setStatus('connected')
      setSocketId(sock.id ?? null)
      // Unirse a sala personal cuando (re)conecta
      const uid = useAuthStore.getState().user?.id
      if (uid) sock.emit('joinUser', uid)
    }

    const onDisconnect = () => {
      setStatus('disconnected')
      setSocketId(null)
    }

    const onError = () => setStatus('error')

    const onNotificacion = (payload: Record<string, unknown>) => {
      console.log('[Socket] notificacion recibida:', payload)
      const dataExtra =
        (payload['dataExtra'] as Record<string, unknown> | null) ??
        (payload['ticketId'] ? { ticketId: Number(payload['ticketId']) } : null)
      const item: NotificationItem = {
        id:        Number(payload['id'] ?? Date.now()),
        usuarioId: Number(payload['usuarioId'] ?? 0),
        mensaje:   String(payload['mensaje'] ?? ''),
        tipo:      String(payload['tipo'] ?? ''),
        leida:     false,
        fecha:     String(payload['fecha'] ?? new Date().toISOString()),
        dataExtra,
      }
      addNotificationRef.current(item)
      const ALERT_TIPOS = ['ticket_nuevo', 'ticket_transferido', 'ticket_comentario', 'ticket_estado', 'ticket']
      if (item.tipo && ALERT_TIPOS.includes(item.tipo)) pushTicketAlertRef.current(item)
    }

    // Mensajería: cualquier canal nuevo/mensaje nuevo recarga la lista de canales
    // (con sus noLeidos) desde el backend, para mantener el badge del Topbar al día
    // aunque MensajeriaPage no esté montada.
    const onMensajeriaCambio = () => {
      mensajeriaService.getMisCanales()
        .then((canales) => setCanalesRef.current(canales))
        .catch(() => { /* silencioso */ })
    }

    sock.on('connect',       onConnect)
    sock.on('disconnect',    onDisconnect)
    sock.on('connect_error', onError)
    sock.on('notificacion',  onNotificacion as (p: unknown) => void)
    sock.on('chat:notify',   onNotificacion as (p: unknown) => void)
    sock.on('mensajeria:nuevo_mensaje', onMensajeriaCambio)
    sock.on('mensajeria:canal_creado',  onMensajeriaCambio)

    // Si ya estaba conectado al montar, unirse inmediatamente
    if (sock.connected) {
      setStatus('connected')
      setSocketId(sock.id ?? null)
      const uid = useAuthStore.getState().user?.id
      if (uid) sock.emit('joinUser', uid)
    }

    return () => {
      sock.off('connect',       onConnect)
      sock.off('disconnect',    onDisconnect)
      sock.off('connect_error', onError)
      sock.off('notificacion',  onNotificacion as (p: unknown) => void)
      sock.off('chat:notify',   onNotificacion as (p: unknown) => void)
      sock.off('mensajeria:nuevo_mensaje', onMensajeriaCambio)
      sock.off('mensajeria:canal_creado',  onMensajeriaCambio)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo al montar — refs y getState() son estables

  // Re-emitir joinUser si cambia el userId (login/switch de cuenta)
  useEffect(() => {
    if (!user?.id) return
    const sock = getSocket()
    if (sock.connected) sock.emit('joinUser', user.id)
  }, [user?.id])

  // Cargar notificaciones iniciales desde API
  useEffect(() => {
    if (!user?.id) return
    api.get(`/notificaciones/user/${user.id}`, { params: { limit: 20 } })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data?.data ?? [])
        setNotificationsRef.current(list.map((r: Record<string, unknown>) => ({
          id:        Number(r['id'] ?? r['ID'] ?? 0),
          usuarioId: Number(r['usuarioId'] ?? r['usuario_id'] ?? user.id),
          mensaje:   String(r['mensaje'] ?? r['MENSAJE'] ?? r['message'] ?? ''),
          tipo:      String(r['tipo'] ?? r['TIPO'] ?? 'info') || null,
          leida:     Boolean(r['leida'] ?? r['LEIDA'] ?? r['read']),
          fecha:     String(r['fecha'] ?? r['FECHA'] ?? r['createdAt'] ?? '') || null,
          dataExtra: (r['dataExtra'] ?? r['data_extra'] ?? null) as Record<string, unknown> | null,
        })))
      })
      .catch(() => { /* silencioso si falla */ })
  }, [user?.id])

  // Cargar canales de mensajería iniciales (para el badge del Topbar).
  // Solo si el módulo 'mensajeria' está activo para la empresa — evita el 403.
  useEffect(() => {
    if (!user?.id || !puedeMensajeria) return
    mensajeriaService.getMisCanales()
      .then((canales) => setCanalesRef.current(canales))
      .catch(() => { /* silencioso si el usuario no tiene acceso al módulo */ })
  }, [user?.id, puedeMensajeria])
}

export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const sock = getSocket()
    const cb = (data: T) => handlerRef.current(data)
    sock.on(event, cb)
    return () => { sock.off(event, cb) }
  }, [event])
}
