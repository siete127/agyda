import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, ShieldAlert, Home, ChevronRight } from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'

// Mismos IDs que el backend restringe en utils/superAdmin.esSuperAdminFijo
// — aquí solo controla si se MUESTRA la sección; la autorización real vive en
// el servidor (403 si alguien fuerza la UI).
const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96, 64])

interface Empresa { key: string; nombre: string }

// Alta y listado de empresas (multi-tenant). La empresa donde el usuario está
// logueado se muestra destacada como "Tu Hogar"; el resto se lista debajo.
export function EmpresasTab() {
  const qc = useQueryClient()
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const [mostrarFormEmpresa, setMostrarFormEmpresa] = useState(false)
  const [formEmpresa, setFormEmpresa] = useState({ codigo: '', nombre: '', adminUsuario: '', adminPassword: '', adminNombre: '' })

  const { data: todasEmpresas = [], isLoading } = useQuery({
    queryKey: ['accesos-empresas'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/empresas')
      return (data?.data ?? []) as Empresa[]
    },
    enabled: esSuperAdmin,
  })

  const empresaActualKey = (usuarioActual?.empresa ?? '').toLowerCase()
  const { propia, otras } = useMemo(() => {
    const propia = todasEmpresas.find((e) => e.key.toLowerCase() === empresaActualKey) ?? null
    const otras = todasEmpresas
      .filter((e) => e.key.toLowerCase() !== empresaActualKey)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    return { propia, otras }
  }, [todasEmpresas, empresaActualKey])

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
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8rem] text-gray-400">Empresas (tenants) del sistema. Cada una es una base de datos separada.</p>
        <button
          onClick={() => setMostrarFormEmpresa((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[0.78rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Building2 className="h-5 w-5 animate-pulse text-gray-300" /></div>
      ) : (
        <>
          {/* ── Tu Hogar ── */}
          {propia && (
            <div className="rounded-2xl border border-brand/25 bg-brand/[0.03] p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                  <Home className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[0.95rem] font-bold text-gray-900">{propia.nombre}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[0.6rem] font-bold text-white">
                      <Home className="h-2.5 w-2.5" /> Tu Hogar
                    </span>
                  </div>
                  <p className="text-[0.72rem] text-gray-400">
                    {propia.key} · empresa en la que iniciaste sesión
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Otras empresas ── */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-card">
            <div className="flex items-center gap-2 border-b border-gray-50 px-5 py-3.5">
              <h3 className="text-[0.9rem] font-bold text-gray-900">Otras empresas</h3>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-gray-500">{otras.length}</span>
            </div>
            {otras.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No hay otras empresas registradas</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {otras.map((e) => (
                  <div key={e.key} className="group flex items-center gap-4 px-5 py-3.5">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.88rem] font-semibold text-gray-900">{e.nombre}</p>
                      <p className="truncate text-[0.72rem] text-gray-400">{e.key}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-200" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Form nueva empresa ── */}
      {mostrarFormEmpresa && (
        <div className="rounded-2xl border border-brand/30 bg-brand/[0.02] p-4 space-y-3 shadow-card animate-fade-in">
          <p className="section-label">Nueva empresa</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <label className={clsx('text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500')}>Código</label>
              <input
                value={formEmpresa.codigo}
                onChange={(e) => setFormEmpresa((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))}
                placeholder="ej. clientex"
                className="field py-1.5 text-[0.78rem]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Nombre</label>
              <input
                value={formEmpresa.nombre}
                onChange={(e) => setFormEmpresa((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="ej. Cliente X"
                className="field py-1.5 text-[0.78rem]"
              />
            </div>
          </div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-gray-500 pt-1">Administrador inicial</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Nombre</label>
              <input
                value={formEmpresa.adminNombre}
                onChange={(e) => setFormEmpresa((f) => ({ ...f, adminNombre: e.target.value }))}
                placeholder="Nombre completo"
                className="field py-1.5 text-[0.78rem]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Usuario</label>
              <input
                value={formEmpresa.adminUsuario}
                onChange={(e) => setFormEmpresa((f) => ({ ...f, adminUsuario: e.target.value }))}
                placeholder="usuario"
                className="field py-1.5 text-[0.78rem]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Contraseña</label>
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
  )
}
