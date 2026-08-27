import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Building2, ShieldAlert } from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'

const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96, 64])

interface Empresa { key: string; nombre: string }
interface ModuloEmpresa { key: string; nombre: string; descripcion: string; allow: boolean }

function EmpresaModulosPanel({ empresa }: { empresa: Empresa }) {
  const qc = useQueryClient()

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-modulos', empresa.key] })
      toast.success('Módulo actualizado para la empresa')
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const activos = modulos.filter((m) => m.allow).length

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
          <Building2 className="h-4.5 w-4.5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.85rem] font-bold text-gray-900">{empresa.nombre}</p>
          <p className="text-[0.68rem] text-gray-400">{empresa.key}</p>
        </div>
        {!isLoading && (
          <span className="flex-shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-[0.68rem] font-semibold text-gray-500">
            {activos}/{modulos.length} activos
          </span>
        )}
      </div>

      <div className="border-t border-gray-100 bg-gray-50/40 p-3">
        {isLoading ? (
          <div className="flex justify-center py-8"><Shield className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {modulos.map((m) => (
              <div key={m.key} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-[0.76rem] font-medium text-gray-800">{m.nombre}</p>
                  {m.descripcion && <p className="truncate text-[0.63rem] text-gray-400">{m.descripcion}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => toggleModulo.mutate({ moduloKey: m.key, allow: !m.allow })}
                  className={clsx(
                    'relative ml-2 inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
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

// Control de qué módulos ve la empresa (tenant) en la que se está trabajando
// ahora mismo — no lista todas las empresas, solo la actual. Para dar de
// alta empresas nuevas o ver el catálogo completo, ver Organización › Empresas.
export function ModulosEmpresaTab() {
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ['accesos-empresas'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/empresas')
      return (data?.data ?? []) as Empresa[]
    },
    enabled: esSuperAdmin,
  })

  if (!esSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200/60 bg-white py-16 shadow-card">
        <ShieldAlert className="h-8 w-8 text-gray-300" />
        <p className="text-sm font-semibold text-gray-500">No tienes acceso a esta sección</p>
      </div>
    )
  }

  const empresaActualKey = (usuarioActual?.empresa ?? '').toLowerCase()
  const empresaActual = empresas.find((e) => e.key.toLowerCase() === empresaActualKey)

  return (
    <div className="space-y-3">
      {loadingEmpresas ? (
        <div className="flex justify-center py-10"><Building2 className="h-5 w-5 animate-pulse text-gray-300" /></div>
      ) : !empresaActual ? (
        <p className="py-10 text-center text-sm text-gray-400">No se encontró la empresa actual</p>
      ) : (
        <EmpresaModulosPanel empresa={empresaActual} />
      )}
    </div>
  )
}
