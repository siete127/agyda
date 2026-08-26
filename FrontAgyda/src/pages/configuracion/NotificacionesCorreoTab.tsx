import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configuracionService } from '@/services/configuracion.service'

export function NotificacionesCorreoTab() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notificaciones-correo-config'],
    queryFn: () => configuracionService.getConfiguracionCorreo(),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ modulo, usuarioId, activo }: { modulo: string; usuarioId: number; activo: boolean }) =>
      configuracionService.setDestinatario(modulo, usuarioId, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones-correo-config'] }),
  })

  if (isLoading || !data) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  return (
    <div className="space-y-4">
      {data.modulos.map((modulo) => {
        const activos = new Set(data.destinatarios[modulo.key] ?? [])
        return (
          <div key={modulo.key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-sm font-semibold text-ink">{modulo.nombre}</p>
            <p className="mb-3 text-xs text-ink-tertiary">{modulo.descripcion}</p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {data.usuarios.map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={activos.has(u.id)}
                    onChange={(e) => toggleMutation.mutate({ modulo: modulo.key, usuarioId: u.id, activo: e.target.checked })}
                    disabled={!u.correo}
                  />
                  <span className={u.correo ? 'text-ink-secondary' : 'text-ink-tertiary line-through'}>
                    {u.nombre} ({u.tipoUsuario})
                  </span>
                  {!u.correo && <span className="text-[0.65rem] text-red-500">sin correo</span>}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
