import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield, ShieldCheck, ChevronDown, ChevronUp, CheckSquare, Square,
  Info, Search, User, FileText, Plus, Check, X,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { Modal } from '@/components/ui/Modal'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { roleService, type Rol } from '@/services/role.service'
import { moduleVisual } from './moduleVisual'

interface Modulo { key: string; nombre: string; descripcion: string }
interface AccionModulo { key: string; nombre: string; descripcion: string }
type ActionsCatalog = Record<string, AccionModulo[]>

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-11 pr-3 text-sm text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'

export function RolModal({ rol, onClose }: { rol: Rol | null; onClose: () => void }) {
  const qc = useQueryClient()
  const esEdicion = !!rol
  const esSistema = !!rol?.ES_SISTEMA

  const [nombre, setNombre] = useState(rol?.NOMBRE ?? '')
  const [descripcion, setDescripcion] = useState(rol?.DESCRIPCION ?? '')
  const [busca, setBusca] = useState('')
  const [expandedMod, setExpandedMod] = useState<string | null>(null)

  const [modulos, setModulos] = useState<Set<string>>(new Set())
  const [acciones, setAcciones] = useState<Record<string, Set<string>>>({})

  const { data: catalogoModulos = [] } = useQuery({
    queryKey: ['accesos-modulos'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/modules')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((m) => ({
        key: String(m['key'] ?? ''),
        nombre: String(m['nombre'] ?? m['name'] ?? m['key'] ?? ''),
        descripcion: String(m['descripcion'] ?? m['description'] ?? ''),
      })) as Modulo[]
    },
  })

  const { data: catalogoAcciones = {} } = useQuery({
    queryKey: ['accesos-catalogo-acciones'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/actions/catalog')
      return (data?.data ?? {}) as ActionsCatalog
    },
  })

  const { isLoading: loadingRol } = useQuery({
    queryKey: ['rol-detalle', rol?.ROL_ID],
    queryFn: async () => {
      const d = await roleService.get(rol!.ROL_ID)
      setModulos(new Set(d.modulos))
      const accMap: Record<string, Set<string>> = {}
      for (const [mod, lista] of Object.entries(d.acciones)) accMap[mod] = new Set(lista)
      setAcciones(accMap)
      return d
    },
    enabled: esEdicion,
    staleTime: 0,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      const accionesObj: Record<string, string[]> = {}
      for (const [mod, set] of Object.entries(acciones)) {
        if (set.size) accionesObj[mod] = Array.from(set)
      }
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        modulos: Array.from(modulos),
        acciones: accionesObj,
      }
      if (esEdicion) await roleService.update(rol!.ROL_ID, payload)
      else await roleService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['rol-detalle'] })
      toast.success(esEdicion ? 'Rol actualizado' : 'Rol creado')
      onClose()
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const toggleModulo = (key: string) => {
    setModulos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        setAcciones((a) => { const c = { ...a }; delete c[key]; return c })
        if (expandedMod === key) setExpandedMod(null)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleAccion = (modKey: string, accKey: string) => {
    setAcciones((prev) => {
      const set = new Set(prev[modKey] ?? [])
      if (set.has(accKey)) set.delete(accKey); else set.add(accKey)
      return { ...prev, [modKey]: set }
    })
  }

  const toggleTodasAcciones = (modKey: string) => {
    const disponibles = (catalogoAcciones[modKey] ?? []).map((a) => a.key)
    setAcciones((prev) => {
      const actuales = prev[modKey] ?? new Set()
      const todas = disponibles.length > 0 && disponibles.every((k) => actuales.has(k))
      return { ...prev, [modKey]: new Set(todas ? [] : disponibles) }
    })
  }

  const modulosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return catalogoModulos
    return catalogoModulos.filter((m) => m.nombre.toLowerCase().includes(q) || m.key.includes(q))
  }, [catalogoModulos, busca])

  const errores: string[] = []
  if (!nombre.trim()) errores.push('El nombre es obligatorio')

  return (
    <Modal isOpen onClose={onClose} size="xl">
      <div className="space-y-5">
        {/* ── Encabezado ── */}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/[0.08] text-brand">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-[1.15rem] font-bold text-gray-900">{esEdicion ? 'Editar rol' : 'Nuevo rol'}</h2>
            <p className="mt-0.5 text-[0.82rem] text-gray-400">
              Define qué módulos y funciones incluye este rol. Al crear un usuario con este rol,
              esos permisos se copian a su cuenta.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* ── Datos ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[0.82rem] font-semibold text-gray-500">Nombre</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                <User className="h-3.5 w-3.5" />
              </span>
              <input
                className={inputCls}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={esSistema}
                placeholder="Ej: Supervisor de Ventas"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.82rem] font-semibold text-gray-500">Descripción</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <input
                className={inputCls}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Para qué sirve este rol"
              />
            </div>
          </div>
        </div>

        {esSistema && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-[0.8rem] text-amber-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Es un rol de sistema: solo puedes ajustar sus módulos y funciones, no su nombre.</p>
          </div>
        )}

        {/* ── Buscador ── */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar módulos…"
            className="w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>

        {/* ── Módulos y funciones ── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-gray-400">Módulos y funciones</span>
            <span className="text-[0.75rem] text-gray-400">
              {modulos.size} de {catalogoModulos.length} módulos
            </span>
          </div>

          {loadingRol ? (
            <div className="flex justify-center py-8"><Shield className="h-5 w-5 animate-pulse text-gray-300" /></div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 items-start max-h-[44vh] overflow-y-auto pr-1">
              {modulosFiltrados.map((m) => {
                const tiene = modulos.has(m.key)
                const accs = catalogoAcciones[m.key] ?? []
                const tieneAcciones = accs.length > 0
                const isExpanded = expandedMod === m.key
                const accActuales = acciones[m.key] ?? new Set<string>()
                const todasMarcadas = tieneAcciones && accs.every((a) => accActuales.has(a.key))
                const { Icon, soft, text } = moduleVisual(m.key)

                return (
                  <div
                    key={m.key}
                    className={clsx(
                      'rounded-2xl border transition-colors',
                      isExpanded ? 'border-brand/30 bg-brand/[0.02] lg:col-span-2' : tiene ? 'border-brand/20 bg-brand/[0.015]' : 'border-gray-100',
                    )}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleModulo(m.key)}
                        className={clsx(
                          'flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                          tiene ? 'border-brand bg-brand text-white' : 'border-gray-300 bg-card hover:border-brand/50',
                        )}
                      >
                        {tiene && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>

                      {/* Ícono de módulo */}
                      <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', soft)}>
                        <Icon className={clsx('h-4 w-4', text)} />
                      </div>

                      {/* Nombre + descripción */}
                      <button
                        onClick={() => tieneAcciones && tiene && setExpandedMod(isExpanded ? null : m.key)}
                        disabled={!tieneAcciones || !tiene}
                        className="min-w-0 flex-1 text-left disabled:cursor-default"
                      >
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[0.85rem] font-bold text-gray-900">{m.nombre}</p>
                          {tieneAcciones && tiene && (
                            <span className={clsx(
                              'flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold',
                              todasMarcadas ? 'bg-emerald-50 text-emerald-600' : accActuales.size ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400',
                            )}>
                              {accActuales.size}/{accs.length}
                            </span>
                          )}
                          {tieneAcciones && tiene && (
                            isExpanded ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-brand" /> : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                          )}
                        </div>
                        {m.descripcion && <p className="truncate text-[0.72rem] text-gray-400">{m.descripcion}</p>}
                      </button>

                      {/* Botón añadir / quitar */}
                      <button
                        onClick={() => toggleModulo(m.key)}
                        className={clsx(
                          'flex flex-shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.72rem] font-semibold transition-colors',
                          tiene
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
                        )}
                      >
                        {tiene ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {tiene ? 'Quitar' : 'Añadir'}
                      </button>
                    </div>

                    {tieneAcciones && tiene && isExpanded && (
                      <div className="border-t border-gray-100 bg-white/60 px-4 py-3 animate-fade-in">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-gray-400">
                            Funciones · {accActuales.size}/{accs.length}
                          </span>
                          <button onClick={() => toggleTodasAcciones(m.key)} className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-brand hover:underline">
                            {todasMarcadas ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                            {todasMarcadas ? 'Quitar todas' : 'Habilitar todas'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {accs.map((a) => {
                            const activa = accActuales.has(a.key)
                            return (
                              <label
                                key={a.key}
                                className={clsx('flex items-start gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer', activa ? 'bg-card shadow-sm' : 'hover:bg-card')}
                              >
                                <input
                                  type="checkbox"
                                  checked={activa}
                                  onChange={() => toggleAccion(m.key, a.key)}
                                  className="mt-0.5 rounded accent-brand"
                                />
                                <div className="min-w-0">
                                  <p className={clsx('text-[0.75rem] font-medium', activa ? 'text-gray-800' : 'text-gray-600')}>{a.nombre}</p>
                                  {a.descripcion && <p className="text-[0.65rem] text-gray-400">{a.descripcion}</p>}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Acciones ── */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-card px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => { if (errores.length) { toast.error(errores[0]); return } guardar.mutate() }}
            disabled={guardar.isPending || errores.length > 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardar.isPending
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <ShieldCheck className="h-4 w-4" />}
            {esEdicion ? 'Guardar cambios' : 'Crear rol'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
