import { useQuery } from '@tanstack/react-query'
import { Building2, ShieldAlert } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { EmpresaModulosPanel, type EmpresaRef } from './EmpresaModulosPanel'

const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96, 64])

// Control de qué módulos ve la empresa (tenant) en la que se está trabajando
// ahora mismo. Para gestionar los módulos de CUALQUIER empresa, ver
// Organización › Empresas (cada empresa despliega su propio panel).
export function ModulosEmpresaTab() {
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ['accesos-empresas'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/empresas')
      return (data?.data ?? []) as EmpresaRef[]
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
        <div className="rounded-2xl border border-gray-100 bg-white shadow-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <Building2 className="h-4.5 w-4.5 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.85rem] font-bold text-gray-900">{empresaActual.nombre}</p>
              <p className="text-[0.68rem] text-gray-400">{empresaActual.key}</p>
            </div>
          </div>
          <EmpresaModulosPanel empresa={empresaActual} embedded />
        </div>
      )}
    </div>
  )
}
