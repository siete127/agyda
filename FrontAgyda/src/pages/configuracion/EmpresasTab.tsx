import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, ShieldAlert } from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'

// Mismos IDs que el backend restringe en utils/superAdmin.esSuperAdminFijo
// — aquí solo controla si se MUESTRA la sección; la autorización real vive en
// el servidor (403 si alguien fuerza la UI).
const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96, 64])

// Alta y listado de empresas (multi-tenant) — el control de qué módulos ve
// cada una vive aparte, en ModulosEmpresaTab.
export function EmpresasTab() {
  const qc = useQueryClient()
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const [mostrarFormEmpresa, setMostrarFormEmpresa] = useState(false)
  const [formEmpresa, setFormEmpresa] = useState({ codigo: '', nombre: '', adminUsuario: '', adminPassword: '', adminNombre: '' })

  const { data: todasEmpresas = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ['accesos-empresas'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/empresas')
      return (data?.data ?? []) as { key: string; nombre: string }[]
    },
    enabled: esSuperAdmin,
  })

  // Esta lista es para ver/dar de alta OTRAS empresas — la propia (donde el
  // usuario está logueado ahora) se administra en Módulos por Empresa.
  const empresaActualKey = (usuarioActual?.empresa ?? '').toLowerCase()
  const empresas = todasEmpresas.filter((e) => e.key.toLowerCase() !== empresaActualKey)

  const crearEmpresa = useMutation({
    mutationFn: () => api.post('/accesos/empresas', formEmpresa),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accesos-empresas'] })
      toast.success('Empresa creada correctamente')
      setFormEmpresa({ codigo: '', nombre: '', adminUsuario: '', adminPassword: '', adminNombre: '' })
      setMostrarFormEmpresa(false)
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const handleCrearEmpresa = () => {
    const { codigo, nombre: nombreEmp, adminUsuario, adminPassword, adminNombre } = formEmpresa
    if (!codigo.trim() || !nombreEmp.trim() || !adminUsuario.trim() || !adminPassword.trim() || !adminNombre.trim()) {
      toast.error('Completa todos los campos')
      return
    }
    crearEmpresa.mutate()
  }

  if (!esSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200/60 bg-white py-16 shadow-card">
        <ShieldAlert className="h-8 w-8 text-gray-300" />
        <p className="text-sm font-semibold text-gray-500">No tienes acceso a esta sección</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <span className="section-label">Empresas</span>
          <button
            onClick={() => setMostrarFormEmpresa((v) => !v)}
            className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva empresa
          </button>
        </div>

        {loadingEmpresas ? (
          <div className="flex justify-center py-4"><Building2 className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : (
          <div className="space-y-1.5">
            {empresas.map((e) => (
              <div key={e.key} className="flex items-center gap-2.5 rounded-xl border border-gray-100 px-3 py-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                  <Building2 className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.78rem] font-semibold text-gray-800">{e.nombre}</p>
                  <p className="text-[0.65rem] text-gray-400">{e.key}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {mostrarFormEmpresa && (
          <div className="rounded-xl border border-brand/30 bg-brand/[0.02] p-3 space-y-2.5 animate-fade-in">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Código</label>
                <input
                  value={formEmpresa.codigo}
                  onChange={(e) => setFormEmpresa((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))}
                  placeholder="ej. clientex"
                  className="field py-1.5 text-[0.78rem]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Nombre</label>
                <input
                  value={formEmpresa.nombre}
                  onChange={(e) => setFormEmpresa((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="ej. Cliente X"
                  className="field py-1.5 text-[0.78rem]"
                />
              </div>
            </div>
            <p className="text-[0.68rem] font-semibold text-gray-500 uppercase tracking-wider pt-1">Administrador inicial</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Nombre</label>
                <input
                  value={formEmpresa.adminNombre}
                  onChange={(e) => setFormEmpresa((f) => ({ ...f, adminNombre: e.target.value }))}
                  placeholder="Nombre completo"
                  className="field py-1.5 text-[0.78rem]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Usuario</label>
                <input
                  value={formEmpresa.adminUsuario}
                  onChange={(e) => setFormEmpresa((f) => ({ ...f, adminUsuario: e.target.value }))}
                  placeholder="usuario"
                  className="field py-1.5 text-[0.78rem]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Contraseña</label>
                <input
                  type="password"
                  value={formEmpresa.adminPassword}
                  onChange={(e) => setFormEmpresa((f) => ({ ...f, adminPassword: e.target.value }))}
                  placeholder="••••••••"
                  className="field py-1.5 text-[0.78rem]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setMostrarFormEmpresa(false)}>Cancelar</Button>
              <Button onClick={handleCrearEmpresa} disabled={crearEmpresa.isPending}>
                {crearEmpresa.isPending ? 'Creando…' : 'Crear empresa'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
