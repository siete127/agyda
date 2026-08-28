import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, ShieldAlert, Home, ChevronRight, SlidersHorizontal, Users, LayoutGrid, ShieldCheck, Hash, User, AtSign, Lock, Eye, EyeOff, X } from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'
import { EmpresaModulosPanel } from './EmpresaModulosPanel'

const empInputCls =
  'w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-11 pr-3 text-[0.85rem] text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'

// Campo con ícono en pill a la izquierda (mismo lenguaje visual que PerfilModal).
function EmpField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.8rem] font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-gray-100 text-gray-400">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

function SeccionNum({ n, titulo, subtitulo }: { n: number; titulo: string; subtitulo: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.8rem] font-bold text-white">{n}</span>
      <div>
        <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
        <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
      </div>
    </div>
  )
}

// Mismos IDs que el backend restringe en utils/superAdmin.esSuperAdminFijo
// — aquí solo controla si se MUESTRA la sección; la autorización real vive en
// el servidor (403 si alguien fuerza la UI).
const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96, 64])

interface Empresa { key: string; nombre: string; usuarios: number | null; modulosActivos: number; modulosTotal: number }

// Meta-fila del card "Tu Hogar" (usuarios · módulos · estado).
function MetaItem({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-gray-500">
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      {children}
    </span>
  )
}

// Alta y listado de empresas (multi-tenant). La empresa donde el usuario está
// logueado se muestra destacada como "Tu Hogar"; el resto se lista debajo.
// Cada empresa despliega un panel para gestionar qué módulos tiene activos.
export function EmpresasTab() {
  const qc = useQueryClient()
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const [mostrarFormEmpresa, setMostrarFormEmpresa] = useState(false)
  const [formEmpresa, setFormEmpresa] = useState({ codigo: '', nombre: '', adminUsuario: '', adminPassword: '', adminNombre: '' })
  const [showPass, setShowPass] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

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

  const toggleExpandida = (key: string) => setExpandida((k) => (k === key ? null : key))

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
    <div className="space-y-5">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Empresas</h2>
            <p className="text-[0.82rem] text-gray-400">Empresas (tenants) del sistema. Toca una para gestionar sus módulos.</p>
          </div>
        </div>
        <button
          onClick={() => setMostrarFormEmpresa((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98]"
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
            <div className="overflow-hidden rounded-2xl border border-brand/20 bg-brand/[0.04] shadow-card">
              <button
                type="button"
                onClick={() => toggleExpandida(propia.key)}
                className="relative flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-brand/[0.07]"
              >
                {/* ilustración decorativa de edificio */}
                <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-2/5 overflow-hidden md:block">
                  <div className="absolute right-24 bottom-4 h-20 w-14 rounded-t-lg bg-brand/15" />
                  <div className="absolute right-14 bottom-4 h-28 w-16 rounded-t-lg bg-brand/25" />
                  <div className="absolute right-3 bottom-4 h-16 w-12 rounded-t-lg bg-brand/15" />
                  <span className="absolute right-16 bottom-4 h-1 w-40 rounded-full bg-brand/20" />
                  <span className="absolute right-[4.5rem] top-8 h-2.5 w-2.5 rounded-full bg-brand/30" />
                  <span className="absolute right-8 top-14 h-2 w-2 rounded-full bg-brand/25" />
                </div>

                <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                  <Home className="h-6 w-6" />
                </div>
                <div className="relative min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[1.05rem] font-bold text-gray-900">{propia.nombre}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[0.62rem] font-bold text-white">
                      <Home className="h-2.5 w-2.5" /> Tu Hogar
                    </span>
                  </div>
                  <p className="text-[0.75rem] text-gray-400">{propia.key} · empresa en la que iniciaste sesión</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <MetaItem icon={Users}>
                      <b className="font-bold text-gray-700">{propia.usuarios ?? '—'}</b> Usuarios
                    </MetaItem>
                    <span className="text-gray-300">·</span>
                    <MetaItem icon={LayoutGrid}>
                      <b className="font-bold text-gray-700">{propia.modulosActivos}</b> Módulos
                    </MetaItem>
                    <span className="text-gray-300">·</span>
                    <MetaItem icon={ShieldCheck}><span className="font-semibold text-emerald-600">Activo</span></MetaItem>
                  </div>
                </div>
                <SlidersHorizontal className="relative h-4 w-4 flex-shrink-0 text-gray-300" />
                <ChevronRight className={clsx('relative h-5 w-5 flex-shrink-0 text-gray-300 transition-transform', expandida === propia.key && 'rotate-90')} />
              </button>
              {expandida === propia.key && (
                <div className="border-t border-brand/15">
                  <EmpresaModulosPanel empresa={propia} embedded />
                </div>
              )}
            </div>
          )}

          {/* ── Otras empresas ── */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
            <div className="flex items-center gap-2 border-b border-gray-50 px-5 py-4">
              <h3 className="text-[0.95rem] font-bold text-gray-900">Otras empresas</h3>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-gray-500">{otras.length}</span>
            </div>
            {otras.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No hay otras empresas registradas</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {otras.map((e) => (
                  <div key={e.key}>
                    <button
                      type="button"
                      onClick={() => toggleExpandida(e.key)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50/60"
                    >
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                        <Building2 className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9rem] font-semibold text-gray-900">{e.nombre}</p>
                        <p className="truncate text-[0.72rem] text-gray-400">
                          {e.key}
                          {e.usuarios != null && <> · {e.usuarios} usuarios</>}
                          {' · '}{e.modulosActivos} módulos
                        </p>
                      </div>
                      <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-gray-300" />
                      <ChevronRight className={clsx('h-5 w-5 flex-shrink-0 text-gray-300 transition-transform', expandida === e.key && 'rotate-90')} />
                    </button>
                    {expandida === e.key && (
                      <div className="border-t border-gray-50 bg-gray-50/30">
                        <EmpresaModulosPanel empresa={e} embedded />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Form nueva empresa ── */}
      {mostrarFormEmpresa && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card animate-fade-in">
          <div className="flex items-center gap-3 border-b border-gray-50 px-5 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Plus className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[1rem] font-bold text-gray-900">Nueva empresa</p>
              <p className="text-[0.78rem] text-gray-400">Registra una nueva empresa (tenant) en el sistema.</p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarFormEmpresa(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-6 p-5">
            {/* ① Información de la empresa */}
            <div className="space-y-4">
              <SeccionNum n={1} titulo="Información de la empresa" subtitulo="Datos generales de la empresa que se registrará." />
              <div className="grid grid-cols-1 gap-4 pl-10 sm:grid-cols-2">
                <EmpField label="Código" icon={<Hash className="h-3.5 w-3.5" />}>
                  <input
                    value={formEmpresa.codigo}
                    onChange={(e) => setFormEmpresa((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))}
                    placeholder="ej. clientex"
                    className={empInputCls}
                  />
                </EmpField>
                <EmpField label="Nombre" icon={<Building2 className="h-3.5 w-3.5" />}>
                  <input
                    value={formEmpresa.nombre}
                    onChange={(e) => setFormEmpresa((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="ej. Cliente X"
                    className={empInputCls}
                  />
                </EmpField>
              </div>
            </div>

            <div className="border-t border-gray-50" />

            {/* ② Administrador inicial */}
            <div className="space-y-4">
              <SeccionNum n={2} titulo="Administrador inicial" subtitulo="Usuario que se creará como administrador inicial de la empresa." />
              <div className="grid grid-cols-1 gap-4 pl-10 sm:grid-cols-3">
                <EmpField label="Nombre" icon={<User className="h-3.5 w-3.5" />}>
                  <input
                    value={formEmpresa.adminNombre}
                    onChange={(e) => setFormEmpresa((f) => ({ ...f, adminNombre: e.target.value }))}
                    placeholder="Nombre completo"
                    className={empInputCls}
                  />
                </EmpField>
                <EmpField label="Usuario" icon={<AtSign className="h-3.5 w-3.5" />}>
                  <input
                    value={formEmpresa.adminUsuario}
                    onChange={(e) => setFormEmpresa((f) => ({ ...f, adminUsuario: e.target.value }))}
                    placeholder="usuario"
                    className={empInputCls}
                  />
                </EmpField>
                <EmpField label="Contraseña" icon={<Lock className="h-3.5 w-3.5" />}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={formEmpresa.adminPassword}
                    onChange={(e) => setFormEmpresa((f) => ({ ...f, adminPassword: e.target.value }))}
                    placeholder="••••••••"
                    className={clsx(empInputCls, 'pr-10')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </EmpField>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-50 bg-gray-50/40 px-5 py-4">
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
