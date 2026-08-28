import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, getApiError } from '@/lib/axios'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { moduleVisual } from './moduleVisual'

export interface EmpresaRef { key: string; nombre: string }
interface ModuloEmpresa { key: string; nombre: string; descripcion: string; allow: boolean }

// Panel de gestión de módulos (on/off) de una empresa (tenant). El backend
// resuelve ALLOW contra INTRANET_EMPRESAS_MODULOS en el tenant master, así que
// un super-admin puede gestionar cualquier empresa, no solo la suya.
export function EmpresaModulosPanel({ empresa, embedded = false }: { empresa: EmpresaRef; embedded?: boolean }) {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: modulos = [], isLoading } = useQuery({
    queryKey: ['empresa-modulos', empresa.key],
    queryFn: async () => {
      const { data } = await api.get(`/accesos/empresas/${empresa.key}/modulos`)
      return (data?.data?.modulos ?? []) as ModuloEmpresa[]
    },
  })

  const toggleModulo = useMutation({
    mutationFn: ({ moduloKey, allow }: { moduloKey: string; allow: boolean }) =>
      api.put(`/accesos/empresas/${empresa.key}/modulos/${moduloKey}`, { allow }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['empresa-modulos', empresa.key] })
      qc.invalidateQueries({ queryKey: ['accesos-empresas'] })
      toast.success(v.allow ? 'Módulo activado para la empresa' : 'Módulo desactivado para la empresa')
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const activos = modulos.filter((m) => m.allow).length
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return modulos
    return modulos.filter((m) => m.nombre.toLowerCase().includes(q) || m.key.toLowerCase().includes(q))
  }, [modulos, busqueda])

  return (
    <div className={clsx(!embedded && 'rounded-2xl border border-gray-100 bg-card shadow-card overflow-hidden')}>
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[1.05rem] font-bold text-gray-900">Módulos</h3>
            {!isLoading && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-gray-500">
                {activos}/{modulos.length}
              </span>
            )}
          </div>
          <p className="text-[0.78rem] text-gray-400">Activa o desactiva los módulos disponibles para esta empresa.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar módulo…"
            className="w-56 rounded-xl border border-gray-200 bg-card py-2 pl-9 pr-3 text-[0.78rem] outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* ── Grid de módulos ── */}
      <div className="px-3 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-10"><Shield className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : filtrados.length === 0 ? (
          <p className="py-8 text-center text-[0.8rem] text-gray-400">Sin módulos que coincidan con "{busqueda}"</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {filtrados.map((m) => {
              const { Icon, soft, text } = moduleVisual(m.key)
              return (
                <div
                  key={m.key}
                  className="flex items-center gap-3 border-b border-gray-50 px-2 py-3 last:border-0"
                >
                  <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', soft)}>
                    <Icon className={clsx('h-4.5 w-4.5', text)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.82rem] font-semibold text-gray-800">{m.nombre}</p>
                    {m.descripcion && <p className="truncate text-[0.68rem] text-gray-400">{m.descripcion}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={toggleModulo.isPending}
                    onClick={() => toggleModulo.mutate({ moduloKey: m.key, allow: !m.allow })}
                    className={clsx(
                      'relative ml-2 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                      m.allow ? 'bg-blue-600' : 'bg-gray-200',
                    )}
                    aria-pressed={m.allow}
                  >
                    <span className={clsx('inline-block h-5 w-5 rounded-full bg-card shadow transform transition-transform', m.allow ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
