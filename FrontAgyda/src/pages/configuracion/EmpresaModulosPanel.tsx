import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, getApiError } from '@/lib/axios'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

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
    <div className={clsx(!embedded && 'rounded-2xl border border-gray-100 bg-white shadow-card overflow-hidden')}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {!isLoading && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.68rem] font-semibold text-blue-600">
            {activos}/{modulos.length} activos
          </span>
        )}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar módulo…"
            className="w-48 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-[0.75rem] outline-none focus:border-brand"
          />
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50/40 p-3">
        {isLoading ? (
          <div className="flex justify-center py-8"><Shield className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : filtrados.length === 0 ? (
          <p className="py-6 text-center text-[0.75rem] text-gray-400">Sin módulos que coincidan</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {filtrados.map((m) => (
              <div key={m.key} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-[0.76rem] font-medium text-gray-800">{m.nombre}</p>
                  {m.descripcion && <p className="truncate text-[0.63rem] text-gray-400">{m.descripcion}</p>}
                </div>
                <button
                  type="button"
                  disabled={toggleModulo.isPending}
                  onClick={() => toggleModulo.mutate({ moduloKey: m.key, allow: !m.allow })}
                  className={clsx(
                    'relative ml-2 inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                    m.allow ? 'bg-blue-600' : 'bg-gray-200',
                  )}
                >
                  <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', m.allow ? 'translate-x-4' : 'translate-x-0')} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
