import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Check } from 'lucide-react'
import { accessService } from '@/services/access.service'

const MODULOS_TI = [
  { key: 'tickets', label: 'Tickets' },
  { key: 'configuracion', label: 'Configuración' },
  { key: 'livechat', label: 'Chat en Vivo' },
  { key: 'chatbot', label: 'Chatbot' },
]

export function SeguridadTab() {
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
    </div>
  )
}
