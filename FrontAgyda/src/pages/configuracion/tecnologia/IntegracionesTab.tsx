import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plug, Plus, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { catalogosTiService } from '@/services/catalogosTi.service'

export function IntegracionesTab() {
  const qc = useQueryClient()
  const [clave, setClave] = useState('')
  const [valor, setValor] = useState('')

  const { data: integraciones = [], isLoading } = useQuery({
    queryKey: ['ti-integraciones'],
    queryFn: () => catalogosTiService.getIntegraciones(),
  })

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.setIntegracion(clave.trim(), valor.trim()),
    onSuccess: () => {
      setClave('')
      setValor('')
      qc.invalidateQueries({ queryKey: ['ti-integraciones'] })
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => catalogosTiService.deleteIntegracion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ti-integraciones'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          Placeholder de configuración clave/valor en texto plano, sin conexión real a Active Directory,
          monitoreo o webhooks. <strong>No guardar contraseñas, API keys ni secretos reales aquí</strong> —
          este almacenamiento no está cifrado.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Plug className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Integraciones</p>
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : integraciones.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-tertiary">Sin claves configuradas.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {integraciones.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-1/3 truncate font-mono text-xs text-ink-secondary">{i.clave}</span>
                <span className="flex-1 truncate text-ink-tertiary">{i.valor ?? '—'}</span>
                <button className="text-ink-tertiary hover:text-red-500" onClick={() => eliminar.mutate(i.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input className="field flex-1 text-sm" placeholder="Clave (ej. AD_LDAP_URL)" value={clave} onChange={(e) => setClave(e.target.value)} />
          <input className="field flex-1 text-sm" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!clave.trim() || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
