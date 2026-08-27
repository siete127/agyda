import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ShieldCheck, Star, CheckCircle2 } from 'lucide-react'
import { configuracionService, type WebphoneProvider } from '@/services/configuracion.service'

const PROVIDERS: { value: WebphoneProvider; label: string }[] = [
  { value: 'Azul1', label: 'Azul1' },
  { value: 'Vici', label: 'Vici' },
  { value: 'Integra', label: 'Integra' },
]

export function WebphoneVistasTab() {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [requiereVpn, setRequiereVpn] = useState(false)
  const [provider, setProvider] = useState<WebphoneProvider>('Azul1')

  const { data: vistas = [], isLoading } = useQuery({
    queryKey: ['webphone-vistas'],
    queryFn: () => configuracionService.getVistas(),
  })

  const crearMutation = useMutation({
    mutationFn: () => configuracionService.crearVista({ label: label.trim(), url: url.trim(), requiereVpn, provider }),
    onSuccess: () => {
      setLabel('')
      setUrl('')
      setRequiereVpn(false)
      setProvider('Azul1')
      qc.invalidateQueries({ queryKey: ['webphone-vistas'] })
    },
  })

  const actualizarProveedorMutation = useMutation({
    mutationFn: ({ id, provider }: { id: number; provider: WebphoneProvider }) =>
      configuracionService.actualizarVista(id, { provider }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webphone-vistas'] }),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => configuracionService.eliminarVista(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webphone-vistas'] }),
  })

  const predeterminadaMutation = useMutation({
    mutationFn: (id: number) => configuracionService.hacerVistaPredeterminada(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webphone-vistas'] }),
  })

  const vistasOrdenadas = [...vistas].sort((a, b) => a.orden - b.orden)
  const predeterminadaId = vistasOrdenadas[0]?.id ?? null

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-semibold text-ink">Nueva vista</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto_auto_auto]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as WebphoneProvider)}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 px-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={requiereVpn} onChange={(e) => setRequiereVpn(e.target.checked)} />
            Requiere VPN
          </label>
          <button
            onClick={() => crearMutation.mutate()}
            disabled={crearMutation.isPending || !label.trim() || !url.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-semibold text-ink">Vistas configuradas</p>
        {isLoading && <p className="text-xs text-ink-tertiary">Cargando...</p>}
        <div className="space-y-2">
          {vistasOrdenadas.map((v) => {
            const esPredeterminada = v.id === predeterminadaId
            return (
            <div
              key={v.id}
              className={
                'flex items-center gap-2 rounded-xl border px-3 py-2 ' +
                (esPredeterminada ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100 bg-surface')
              }
            >
              <button
                onClick={() => predeterminadaMutation.mutate(v.id)}
                disabled={esPredeterminada || predeterminadaMutation.isPending}
                title={esPredeterminada ? 'Vista predeterminada' : 'Hacer predeterminada'}
                className="flex-shrink-0 rounded-lg p-1 text-ink-tertiary transition-colors hover:bg-amber-50 hover:text-amber-500 disabled:cursor-default disabled:opacity-100"
              >
                <Star className={esPredeterminada ? 'h-3.5 w-3.5 fill-amber-400 text-amber-400' : 'h-3.5 w-3.5'} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-ink-secondary">{v.label}</p>
                  {esPredeterminada && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Predeterminada
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-ink-tertiary">{v.url}</p>
              </div>
              <select
                value={v.provider}
                onChange={(e) =>
                  actualizarProveedorMutation.mutate({ id: v.id, provider: e.target.value as WebphoneProvider })
                }
                disabled={actualizarProveedorMutation.isPending}
                className="flex-shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:opacity-50"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {v.requiereVpn && (
                <span className="flex items-center gap-1 chip bg-amber-100 text-amber-700">
                  <ShieldCheck className="h-3 w-3" /> VPN
                </span>
              )}
              <button
                onClick={() => eliminarMutation.mutate(v.id)}
                disabled={eliminarMutation.isPending}
                className="flex-shrink-0 rounded-lg p-1 text-ink-tertiary transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
