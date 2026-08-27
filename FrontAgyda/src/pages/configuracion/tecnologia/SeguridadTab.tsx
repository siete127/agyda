import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Check, ScrollText } from 'lucide-react'
import { accessService } from '@/services/access.service'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

const MODULOS_TI = [
  { key: 'tickets', label: 'Tickets' },
  { key: 'configuracion', label: 'Configuración' },
  { key: 'livechat', label: 'Chat en Vivo' },
  { key: 'chatbot', label: 'Chatbot' },
]

const MODULOS_AUDITORIA_TI = ['tickets', 'configuracion', 'livechat', 'chatbot', 'catalogos-ti', 'reglas-asignacion']

const ACCION_LABELS: Record<string, string> = {
  crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', activar: 'Activar', desactivar: 'Desactivar',
  resolver: 'Resolver', escalar: 'Escalar', 'set-integracion': 'Configurar integración',
}

interface AuditRow {
  id: number
  usuarioNombre: string | null
  modulo: string
  accion: string
  entidadId: string | null
  fecha: string
}

function fmtFechaCorta(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function AuditoriaTiPanel() {
  const { data, isLoading } = useQuery<{ data: AuditRow[] }>({
    queryKey: ['auditoria-ti-reciente'],
    queryFn: () => api.get('/auditoria', { params: { limit: 15 } }).then((r) => r.data),
    staleTime: 30_000,
  })

  const rows = (data?.data ?? []).filter((r) => MODULOS_AUDITORIA_TI.includes(r.modulo))

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-brand" />
        <p className="text-sm font-semibold text-ink">Auditoría — actividad reciente en Tecnología/TI</p>
      </div>
      <p className="mb-4 text-xs text-ink-tertiary">
        Últimos cambios registrados en Tickets, Configuración, Chat en Vivo y Chatbot.
      </p>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-ink-tertiary">Sin actividad reciente registrada.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="text-ink-secondary">
                <span className="font-medium">{r.usuarioNombre ?? 'Sistema'}</span>
                {' — '}
                {ACCION_LABELS[r.accion] ?? r.accion} en {r.modulo}
                {r.entidadId ? ` (#${r.entidadId})` : ''}
              </span>
              <span className="shrink-0 text-ink-tertiary">{fmtFechaCorta(r.fecha)}</span>
            </div>
          ))}
        </div>
      )}

      <a href="/auditoria" className="mt-4 inline-block text-xs font-semibold text-brand hover:underline">
        Ver auditoría completa →
      </a>
    </div>
  )
}

export function SeguridadTab() {
  const user = useAuthStore((s) => s.user)
  const esAD = user?.tipoUsuario?.toUpperCase() === 'AD'

  const { data: acciones = {}, isLoading } = useQuery({
    queryKey: ['self-actions'],
    queryFn: () => accessService.getSelfActions(),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Permisos — tu sesión</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          Panel de solo lectura con las acciones que tu usuario tiene habilitadas sobre los módulos de
          Tecnología/TI. La asignación de permisos por usuario se administra en Usuarios.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="space-y-3">
            {MODULOS_TI.map((m) => {
              const permisos = acciones[m.key] ?? []
              return (
                <div key={m.key} className="rounded-xl bg-surface p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">{m.label}</p>
                  {permisos.length === 0 ? (
                    <p className="text-xs text-ink-tertiary">Sin acciones explícitas registradas (acceso por defecto del rol).</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {permisos.map((p) => (
                        <span key={p} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-medium text-ink-secondary">
                          <Check className="h-3 w-3 text-green-500" /> {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <a href="/usuarios" className="mt-4 inline-block text-xs font-semibold text-brand hover:underline">
          Administrar permisos por usuario →
        </a>
      </div>

      {esAD && <AuditoriaTiPanel />}
    </div>
  )
}
