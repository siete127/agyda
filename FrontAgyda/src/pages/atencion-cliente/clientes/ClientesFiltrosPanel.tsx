import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import type { ClientesFiltros } from '@/services/crm.service'

// Reemplaza el panel decorativo de "Filtros avanzados" (que solo tenía 3
// botones sin onClick) — ahora filtra de verdad contra el backend
// (estatusCliente, segmentoId, enRiesgo). El botón que lo abre en
// ClientesListaPage.tsx muestra un badge con la cuenta de filtros activos.
export function contarFiltrosActivos(f: ClientesFiltros): number {
  let n = 0
  if (f.estatusCliente?.length) n += f.estatusCliente.length
  if (f.segmentoId) n += 1
  if (f.enRiesgo) n += 1
  return n
}

export function ClientesFiltrosPanel({ filtros, onChange }: {
  filtros: ClientesFiltros
  onChange: (f: ClientesFiltros) => void
}) {
  const { data: segmentos = [] } = useQuery({
    queryKey: ['crm-catalogo-segmentos'],
    queryFn: () => crmCatalogosClienteService.segmentos.list(true),
  })

  const toggleEstatus = (key: string) => {
    const actuales = filtros.estatusCliente ?? []
    const next = actuales.includes(key) ? actuales.filter((k) => k !== key) : [...actuales, key]
    onChange({ ...filtros, estatusCliente: next.length ? next : undefined })
  }

  const limpiar = () => onChange({ q: filtros.q })

  return (
    <div className="card flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">Filtros</span>
        {contarFiltrosActivos(filtros) > 0 && (
          <button onClick={limpiar} className="text-[0.7rem] font-semibold text-brand hover:underline">Limpiar</button>
        )}
      </div>

      <div>
        <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Estatus</p>
        <div className="flex flex-wrap gap-1.5">
          {CLIENTE_ESTATUS_COLORES.map((c) => {
            const activo = (filtros.estatusCliente ?? []).includes(c.key)
            return (
              <button
                key={c.key}
                onClick={() => toggleEstatus(c.key)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors',
                  activo ? `${c.bg} ${c.text} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Segmento</p>
        <select
          value={filtros.segmentoId ?? ''}
          onChange={(e) => onChange({ ...filtros, segmentoId: e.target.value ? Number(e.target.value) : undefined })}
          className="field w-full"
        >
          <option value="">Todos</option>
          {segmentos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 p-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-red-500"
          checked={!!filtros.enRiesgo}
          onChange={(e) => onChange({ ...filtros, enRiesgo: e.target.checked || undefined })}
        />
        <span className="text-[0.78rem] font-semibold text-gray-700">Solo clientes en riesgo</span>
      </label>
    </div>
  )
}
