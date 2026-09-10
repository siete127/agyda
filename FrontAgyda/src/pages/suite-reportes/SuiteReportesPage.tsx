import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  FolderTree, FileBarChart, Folder, FolderOpen, ChevronRight, Upload, RefreshCw,
  Download, Trash2, Database, Table2, SlidersHorizontal, FileCode2, AlertTriangle,
  CheckCircle2, ClipboardList, Users, BarChart2, X, FolderPlus, Pencil, Shield,
  Lock, Globe, Check, Wrench, Search, Loader2,
} from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { ccService } from '@/services/cc.service'
import { useCurrentUser } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'
import { TIPIFICACIONES_LLAMADA_LABEL } from '@/constants/tipificacionesLlamada'
import { parseRdl, type RdlDefinition } from '@/lib/rdl'
import { ReportBuilder } from './ReportBuilder'
import type { RdlReporte, RdlCarpeta, RdlRol, RbDefinicion, RbReporteGuardado } from '@/types/reporteDiario.types'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}
function hace30Dias() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const ROLES: { rol: RdlRol; label: string }[] = [
  { rol: 'AD', label: 'Administración' },
  { rol: 'TI', label: 'TI' },
  { rol: 'CC', label: 'Contact Center' },
  { rol: 'ST', label: 'Staff' },
  { rol: 'VE', label: 'Ventas' },
]
const ROL_LABEL: Record<RdlRol, string> = Object.fromEntries(ROLES.map((r) => [r.rol, r.label])) as Record<RdlRol, string>

interface UsuarioMin { id: number; nombre: string; tipoUsuario: string }

function useUsuarios() {
  return useQuery({
    queryKey: ['suite-reportes-usuarios'],
    queryFn: async (): Promise<UsuarioMin[]> => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['id'] ?? 0),
        nombre: String(r['nombre'] ?? ''),
        tipoUsuario: String(r['tipoUsuario'] ?? '').toUpperCase(),
      })).filter((u) => u.id > 0)
    },
    staleTime: 5 * 60_000,
  })
}

// Reportes operativos "de fábrica" — siempre presentes, no vienen de un .rdl.
const REPORTES_BASE = [
  { id: 'postulantes', carpeta: 'Operación', nombre: 'Reportería de postulantes', descripcion: 'Volumen, tipificación y fugas por rango de fechas.', icon: ClipboardList },
  { id: 'interacciones', carpeta: 'Operación', nombre: 'Interacciones', descripcion: 'Buscador de interacciones cerradas — todas las campañas y canales.', icon: Search },
  { id: 'ejecutivo-reclutamiento', carpeta: 'Operación', nombre: 'Reporte Ejecutivo de Reclutamiento', descripcion: 'Embudo, KPIs de conversión y gráficos de un formulario de captación.', icon: BarChart2 },
] as const

type SeleccionBase = { tipo: 'base'; id: string }
type SeleccionRdl = { tipo: 'rdl'; id: number }
type SeleccionBuilder = { tipo: 'builder' }
type SeleccionRbGuardado = { tipo: 'rb'; id: number }
type Seleccion = SeleccionBase | SeleccionRdl | SeleccionBuilder | SeleccionRbGuardado | null

export function SuiteReportesPage() {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const esAdmin = ['AD', 'TI'].includes((user?.tipoUsuario ?? '').toUpperCase())

  const [sel, setSel] = useState<Seleccion>({ tipo: 'base', id: 'postulantes' })
  const [subirOpen, setSubirOpen] = useState(false)
  const [nuevaCarpetaOpen, setNuevaCarpetaOpen] = useState(false)
  const [carpetasAbiertas, setCarpetasAbiertas] = useState<Record<string, boolean>>({ 'Operación': true, General: true })

  const { data: rdls = [], isLoading: cargandoRdls, refetch: refetchRdls, isFetching } = useQuery({
    queryKey: ['suite-reportes-rdl'],
    queryFn: () => reporteDiarioService.listRdl(),
  })
  const { data: carpetas = [], refetch: refetchCarpetas } = useQuery({
    queryKey: ['suite-reportes-carpetas'],
    queryFn: () => reporteDiarioService.listRdlCarpetas(),
  })
  const { data: rbGuardados = [] } = useQuery({
    queryKey: ['suite-reportes-builder-guardados'],
    queryFn: () => reporteDiarioService.builderListReportes(),
  })

  const [guardarBuilderOpen, setGuardarBuilderOpen] = useState<{ def: RbDefinicion; origen: string } | null>(null)

  const eliminar = useMutation({
    mutationFn: (id: number) => reporteDiarioService.eliminarRdl(id),
    onSuccess: () => {
      toast.success('Reporte eliminado')
      setSel({ tipo: 'base', id: 'postulantes' })
      qc.invalidateQueries({ queryKey: ['suite-reportes-rdl'] })
      qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const eliminarCarpeta = useMutation({
    mutationFn: (id: number) => reporteDiarioService.eliminarRdlCarpeta(id),
    onSuccess: () => {
      toast.success('Carpeta eliminada')
      qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const eliminarRb = useMutation({
    mutationFn: (id: number) => reporteDiarioService.builderEliminarReporte(id),
    onSuccess: () => {
      toast.success('Reporte eliminado')
      setSel({ tipo: 'builder' })
      qc.invalidateQueries({ queryKey: ['suite-reportes-builder-guardados'] })
      qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const [renombrando, setRenombrando] = useState<RdlCarpeta | null>(null)

  // Árbol: carpeta "Operación" (reportes base) + carpetas propias del catálogo.
  // Se listan TODAS las carpetas aunque estén vacías.
  const arbol = useMemo(() => {
    type Nodo = { carpetaId: number | null; base: typeof REPORTES_BASE[number][]; rdl: RdlReporte[]; rb: RbReporteGuardado[] }
    const map = new Map<string, Nodo>()
    const nodo = (k: string): Nodo => {
      if (!map.has(k)) map.set(k, { carpetaId: null, base: [], rdl: [], rb: [] })
      return map.get(k)!
    }
    for (const r of REPORTES_BASE) nodo(r.carpeta).base.push(r)
    for (const c of carpetas) nodo(c.nombre).carpetaId = c.id
    for (const r of rdls) {
      const n = nodo(r.carpeta || 'General')
      n.rdl.push(r)
      if (n.carpetaId == null) n.carpetaId = r.carpetaId
    }
    for (const r of rbGuardados) {
      const n = nodo(r.carpeta || 'General')
      n.rb.push(r)
      if (n.carpetaId == null) n.carpetaId = r.carpetaId
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rdls, carpetas, rbGuardados])

  const rdlSel = sel?.tipo === 'rdl' ? rdls.find((r) => r.id === sel.id) ?? null : null
  const rbSel = sel?.tipo === 'rb' ? rbGuardados.find((r) => r.id === sel.id) ?? null : null

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col animate-fade-in">
      {/* ── Barra de herramientas superior ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <FileBarChart className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Suite de reportes</h1>
            <p className="text-[0.68rem] text-gray-400">Catálogo de reportes de operación y definiciones RDL</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => { refetchRdls(); refetchCarpetas() }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Actualizar
          </button>
          <button
            onClick={() => setNuevaCarpetaOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Nueva carpeta
          </button>
          <Button size="sm" onClick={() => setSubirOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Subir RDL
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Panel izquierdo: árbol de carpetas y reportes ── */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/60">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">
              <FolderTree className="h-3.5 w-3.5" /> Contenido
            </span>
            <button
              onClick={() => setNuevaCarpetaOpen(true)}
              title="Nueva carpeta"
              className="rounded p-1 text-ink-tertiary transition hover:bg-white hover:text-brand"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Entrada fija: Constructor de reportes */}
          <button
            onClick={() => setSel({ tipo: 'builder' })}
            className={clsx(
              'flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-[0.8rem] font-semibold transition',
              sel?.tipo === 'builder' ? 'bg-brand/10 text-brand' : 'text-ink-secondary hover:bg-white',
            )}
          >
            <Wrench className="h-4 w-4 flex-shrink-0" /> Constructor de reportes
          </button>

          {cargandoRdls ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <div className="py-1.5">
              {arbol.map(([carpeta, contenido]) => {
                const abierta = carpetasAbiertas[carpeta] ?? false
                const total = contenido.base.length + contenido.rdl.length + contenido.rb.length
                const esCarpetaPropia = contenido.carpetaId != null
                return (
                  <div key={carpeta} className="group/carpeta">
                    <div
                      className={clsx(
                        'flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[0.8rem] font-semibold text-ink-secondary hover:bg-white',
                      )}
                    >
                      <button
                        onClick={() => setCarpetasAbiertas((p) => ({ ...p, [carpeta]: !abierta }))}
                        className="flex min-w-0 flex-1 items-center gap-1.5"
                      >
                        <ChevronRight className={clsx('h-3.5 w-3.5 flex-shrink-0 text-ink-tertiary transition-transform', abierta && 'rotate-90')} />
                        {abierta ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" /> : <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" />}
                        <span className="truncate">{carpeta}</span>
                      </button>
                      <span className="rounded-full bg-gray-200 px-1.5 text-[0.6rem] font-bold text-ink-tertiary">{total}</span>
                      {esCarpetaPropia && (
                        <span className="hidden flex-shrink-0 items-center gap-0.5 group-hover/carpeta:flex">
                          <button
                            onClick={() => {
                              const c = carpetas.find((x) => x.id === contenido.carpetaId)
                              if (c) setRenombrando(c)
                            }}
                            title="Renombrar"
                            className="rounded p-0.5 text-ink-tertiary hover:bg-gray-100 hover:text-brand"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => {
                              if (total > 0) { toast.error('La carpeta tiene reportes'); return }
                              if (confirm(`¿Eliminar la carpeta "${carpeta}"?`)) eliminarCarpeta.mutate(contenido.carpetaId!)
                            }}
                            title="Eliminar carpeta"
                            className="rounded p-0.5 text-ink-tertiary hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>

                    {abierta && (
                      <div className="pb-1">
                        {contenido.base.map((r) => {
                          const activo = sel?.tipo === 'base' && sel.id === r.id
                          return (
                            <button
                              key={r.id}
                              onClick={() => setSel({ tipo: 'base', id: r.id })}
                              className={clsx(
                                'flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-[0.78rem] transition',
                                activo ? 'bg-brand/10 font-semibold text-brand' : 'text-ink-secondary hover:bg-white',
                              )}
                            >
                              <r.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{r.nombre}</span>
                            </button>
                          )
                        })}
                        {contenido.rb.map((r) => {
                          const activo = sel?.tipo === 'rb' && sel.id === r.id
                          const restringido = r.roles.length > 0 || r.usuarios.length > 0
                          return (
                            <button
                              key={`rb-${r.id}`}
                              onClick={() => setSel({ tipo: 'rb', id: r.id })}
                              className={clsx(
                                'flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-[0.78rem] transition',
                                activo ? 'bg-brand/10 font-semibold text-brand' : 'text-ink-secondary hover:bg-white',
                              )}
                            >
                              <Database className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                              <span className="truncate">{r.nombre}</span>
                              {restringido && <Lock className="ml-auto h-3 w-3 flex-shrink-0 text-ink-tertiary" />}
                            </button>
                          )
                        })}
                        {contenido.rdl.map((r) => {
                          const activo = sel?.tipo === 'rdl' && sel.id === r.id
                          const restringido = r.roles.length > 0 || r.usuarios.length > 0
                          return (
                            <button
                              key={r.id}
                              onClick={() => setSel({ tipo: 'rdl', id: r.id })}
                              className={clsx(
                                'flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-[0.78rem] transition',
                                activo ? 'bg-brand/10 font-semibold text-brand' : 'text-ink-secondary hover:bg-white',
                              )}
                            >
                              <FileCode2 className={clsx('h-3.5 w-3.5 flex-shrink-0', r.compatible ? 'text-violet-500' : 'text-amber-500')} />
                              <span className="truncate">{r.nombre}</span>
                              {restringido && <Lock className="ml-auto h-3 w-3 flex-shrink-0 text-ink-tertiary" />}
                            </button>
                          )
                        })}
                        {total === 0 && (
                          <p className="py-2 pl-9 text-[0.7rem] text-ink-tertiary">Carpeta vacía</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        {/* ── Panel derecho: visor ── */}
        <main className="flex-1 overflow-y-auto bg-white p-5">
          {sel?.tipo === 'base' && sel.id === 'postulantes' && <ReportePostulantesView />}
          {sel?.tipo === 'base' && sel.id === 'interacciones' && <InteraccionesView />}
          {sel?.tipo === 'base' && sel.id === 'ejecutivo-reclutamiento' && <ReporteEjecutivoReclutamientoView />}

          {sel?.tipo === 'builder' && (
            <ReportBuilder onGuardar={(def, origen) => setGuardarBuilderOpen({ def, origen })} />
          )}

          {sel?.tipo === 'rb' && rbSel && (
            <RbGuardadoView
              key={rbSel.id}
              reporte={rbSel}
              puedeAdministrar={esAdmin || rbSel.creadoPor === user?.id}
              carpetas={carpetas}
              onEliminar={() => { if (confirm(`¿Eliminar el reporte "${rbSel.nombre}"?`)) eliminarRb.mutate(rbSel.id) }}
              onGuardarComoNuevo={(def, origen) => setGuardarBuilderOpen({ def, origen })}
              onActualizado={() => {
                qc.invalidateQueries({ queryKey: ['suite-reportes-builder-guardados'] })
                qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
              }}
            />
          )}
          {sel?.tipo === 'rb' && !rbSel && (
            <p className="text-sm text-ink-tertiary">El reporte seleccionado ya no existe o no tienes acceso.</p>
          )}

          {sel?.tipo === 'rdl' && rdlSel && (
            <RdlView
              reporte={rdlSel}
              puedeAdministrar={esAdmin || rdlSel.subidoPor === user?.id}
              carpetas={carpetas}
              onEliminar={() => {
                if (confirm(`¿Eliminar la definición "${rdlSel.nombre}"?`)) eliminar.mutate(rdlSel.id)
              }}
              onGuardado={() => {
                qc.invalidateQueries({ queryKey: ['suite-reportes-rdl'] })
                qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
              }}
            />
          )}
          {sel?.tipo === 'rdl' && !rdlSel && (
            <p className="text-sm text-ink-tertiary">El reporte seleccionado ya no existe o no tienes acceso.</p>
          )}
        </main>
      </div>

      {subirOpen && (
        <SubirRdlModal
          onClose={() => setSubirOpen(false)}
          carpetas={carpetas}
          onSubido={(nuevo) => {
            setSubirOpen(false)
            qc.invalidateQueries({ queryKey: ['suite-reportes-rdl'] })
            qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
            setCarpetasAbiertas((p) => ({ ...p, [nuevo.carpeta]: true }))
            setSel({ tipo: 'rdl', id: nuevo.id })
          }}
        />
      )}

      {nuevaCarpetaOpen && (
        <CarpetaModal
          onClose={() => setNuevaCarpetaOpen(false)}
          onGuardado={(nombre) => {
            setNuevaCarpetaOpen(false)
            qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
            setCarpetasAbiertas((p) => ({ ...p, [nombre]: true }))
          }}
        />
      )}

      {renombrando && (
        <CarpetaModal
          carpeta={renombrando}
          onClose={() => setRenombrando(null)}
          onGuardado={() => {
            setRenombrando(null)
            qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
            qc.invalidateQueries({ queryKey: ['suite-reportes-rdl'] })
          }}
        />
      )}

      {guardarBuilderOpen && (
        <GuardarReporteModal
          def={guardarBuilderOpen.def}
          origen={guardarBuilderOpen.origen}
          carpetas={carpetas}
          onClose={() => setGuardarBuilderOpen(null)}
          onGuardado={(nuevo) => {
            setGuardarBuilderOpen(null)
            qc.invalidateQueries({ queryKey: ['suite-reportes-builder-guardados'] })
            qc.invalidateQueries({ queryKey: ['suite-reportes-carpetas'] })
            setCarpetasAbiertas((p) => ({ ...p, [nuevo.carpeta]: true }))
            setSel({ tipo: 'rb', id: nuevo.id })
          }}
        />
      )}
    </div>
  )
}

/* ══════════ Visor de un reporte construido guardado ══════════ */

function RbGuardadoView({
  reporte,
  puedeAdministrar,
  carpetas,
  onEliminar,
  onGuardarComoNuevo,
  onActualizado,
}: {
  reporte: RbReporteGuardado
  puedeAdministrar: boolean
  carpetas: RdlCarpeta[]
  onEliminar: () => void
  onGuardarComoNuevo: (def: RbDefinicion, origen: string) => void
  onActualizado: () => void
}) {
  const [accesoOpen, setAccesoOpen] = useState(false)
  const restringido = reporte.roles.length > 0 || reporte.usuarios.length > 0

  const actualizarDef = useMutation({
    mutationFn: (def: RbDefinicion) => reporteDiarioService.builderActualizarReporte(reporte.id, { definicion: def }),
    onSuccess: () => { toast.success('Reporte actualizado'); onActualizado() },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold text-ink">{reporte.nombre}</h2>
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700">
              <Database className="h-3 w-3" /> Construido
            </span>
            {restringido ? (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-bold text-ink-secondary">
                <Lock className="h-3 w-3" /> Restringido
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-600">
                <Globe className="h-3 w-3" /> Público
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {reporte.carpeta}{reporte.creadoNombre && ` · creó ${reporte.creadoNombre}`}
          </p>
          {reporte.descripcion && <p className="mt-1 text-sm text-ink-secondary">{reporte.descripcion}</p>}
        </div>
        {puedeAdministrar && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={() => setAccesoOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
            >
              <Shield className="h-3.5 w-3.5" /> Acceso y carpeta
            </button>
            <button
              onClick={onEliminar}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-red-600 transition hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          </div>
        )}
      </div>

      {reporte.definicion && (
        <ReportBuilder
          key={reporte.id}
          definicionInicial={reporte.definicion}
          nombreInicial={reporte.nombre}
          guardarLabel={puedeAdministrar ? 'Guardar cambios' : 'Guardar como nuevo'}
          onGuardar={(def, origen) => {
            if (puedeAdministrar) actualizarDef.mutate(def)
            else onGuardarComoNuevo(def, origen)
          }}
        />
      )}

      {accesoOpen && (
        <EditarAccesoRbModal
          reporte={reporte}
          carpetas={carpetas}
          onClose={() => setAccesoOpen(false)}
          onGuardado={() => { setAccesoOpen(false); onActualizado() }}
        />
      )}
    </div>
  )
}

function EditarAccesoRbModal({
  reporte,
  carpetas,
  onClose,
  onGuardado,
}: {
  reporte: RbReporteGuardado
  carpetas: RdlCarpeta[]
  onClose: () => void
  onGuardado: () => void
}) {
  const [carpeta, setCarpeta] = useState(reporte.carpeta)
  const [roles, setRoles] = useState<RdlRol[]>(reporte.roles)
  const [usuarios, setUsuarios] = useState<number[]>(reporte.usuarios)
  const m = useMutation({
    mutationFn: () =>
      reporteDiarioService.builderActualizarReporte(reporte.id, { carpeta: carpeta.trim() || 'General', roles, usuarios }),
    onSuccess: () => { toast.success('Acceso actualizado'); onGuardado() },
    onError: (e) => toast.error(getApiError(e)),
  })
  return (
    <Modal isOpen onClose={onClose} title="Acceso y carpeta" size="lg" elevated>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Carpeta</label>
          <input value={carpeta} onChange={(e) => setCarpeta(e.target.value)} list="carpetas-rb-editar" className="field w-full" />
          <datalist id="carpetas-rb-editar">
            {carpetas.map((c) => <option key={c.id} value={c.nombre} />)}
          </datalist>
        </div>
        <SeguridadEditor roles={roles} usuarios={usuarios} onChange={(n) => { setRoles(n.roles); setUsuarios(n.usuarios) }} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════ Modal: guardar reporte construido ══════════ */

function GuardarReporteModal({
  def,
  origen,
  carpetas,
  onClose,
  onGuardado,
}: {
  def: RbDefinicion
  origen: string
  carpetas: RdlCarpeta[]
  onClose: () => void
  onGuardado: (r: RbReporteGuardado) => void
}) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [carpeta, setCarpeta] = useState('General')
  const [roles, setRoles] = useState<RdlRol[]>([])
  const [usuarios, setUsuarios] = useState<number[]>([])

  const m = useMutation({
    mutationFn: () =>
      reporteDiarioService.builderGuardarReporte({
        nombre, descripcion, origen, definicion: def, carpeta: carpeta.trim() || 'General', roles, usuarios,
      }),
    onSuccess: (r) => { toast.success('Reporte guardado'); onGuardado(r) },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <Modal isOpen onClose={onClose} title="Guardar reporte construido" size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Nombre</label>
            <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className="field w-full" placeholder="Ej. Tiempos de agentes — mensual" />
          </div>
          <div>
            <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Carpeta</label>
            <input value={carpeta} onChange={(e) => setCarpeta(e.target.value)} list="carpetas-rb-guardar" className="field w-full" placeholder="General" />
            <datalist id="carpetas-rb-guardar">
              {carpetas.map((c) => <option key={c.id} value={c.nombre} />)}
            </datalist>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Descripción (opcional)</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="field w-full resize-none" />
        </div>
        <SeguridadEditor roles={roles} usuarios={usuarios} onChange={(n) => { setRoles(n.roles); setUsuarios(n.usuarios) }} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!nombre.trim() || m.isPending}>
            {m.isPending ? 'Guardando…' : 'Guardar reporte'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════ Modal crear/renombrar carpeta ══════════ */

function CarpetaModal({
  carpeta,
  onClose,
  onGuardado,
}: {
  carpeta?: RdlCarpeta
  onClose: () => void
  onGuardado: (nombre: string) => void
}) {
  const [nombre, setNombre] = useState(carpeta?.nombre ?? '')
  const m = useMutation({
    mutationFn: () =>
      carpeta
        ? reporteDiarioService.renombrarRdlCarpeta(carpeta.id, nombre.trim())
        : reporteDiarioService.crearRdlCarpeta(nombre.trim()).then(() => {}),
    onSuccess: () => {
      toast.success(carpeta ? 'Carpeta renombrada' : 'Carpeta creada')
      onGuardado(nombre.trim())
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  return (
    <Modal isOpen onClose={onClose} title={carpeta ? 'Renombrar carpeta' : 'Nueva carpeta'} size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Nombre de la carpeta</label>
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) m.mutate() }}
            className="field w-full"
            placeholder="Ej. Ventas, Calidad, Gerencia…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!nombre.trim() || m.isPending}>
            {m.isPending ? 'Guardando…' : carpeta ? 'Renombrar' : 'Crear'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════ Editor de seguridad de acceso ══════════ */

function SeguridadEditor({
  roles,
  usuarios,
  onChange,
}: {
  roles: RdlRol[]
  usuarios: number[]
  onChange: (next: { roles: RdlRol[]; usuarios: number[] }) => void
}) {
  const { data: todosUsuarios = [] } = useUsuarios()
  const [busca, setBusca] = useState('')

  const publico = roles.length === 0 && usuarios.length === 0
  const toggleRol = (rol: RdlRol) =>
    onChange({ roles: roles.includes(rol) ? roles.filter((r) => r !== rol) : [...roles, rol], usuarios })
  const toggleUsuario = (id: number) =>
    onChange({ roles, usuarios: usuarios.includes(id) ? usuarios.filter((u) => u !== id) : [...usuarios, id] })

  const filtrados = todosUsuarios
    .filter((u) => u.nombre.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 40)
  const seleccionados = todosUsuarios.filter((u) => usuarios.includes(u.id))

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-ink">
        <Shield className="h-4 w-4 text-brand" /> Seguridad de acceso
      </div>

      <div
        className={clsx(
          'flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.75rem]',
          publico ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
        )}
      >
        {publico ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {publico
          ? 'Visible para todo el que entra a la Suite de reportes'
          : `Restringido — ${roles.length} rol(es) y ${usuarios.length} usuario(s). Administración y TI siempre tienen acceso.`}
      </div>

      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Roles permitidos</p>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map(({ rol, label }) => {
            const on = roles.includes(rol)
            return (
              <button
                key={rol}
                type="button"
                onClick={() => toggleRol(rol)}
                className={clsx(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition',
                  on ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
                )}
              >
                {on && <Check className="h-3 w-3" />} {label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Usuarios con acceso</p>
        {seleccionados.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {seleccionados.map((u) => (
              <span key={u.id} className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[0.7rem] font-semibold text-brand">
                {u.nombre}
                <button type="button" onClick={() => toggleUsuario(u.id)} className="rounded hover:bg-brand/20">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="field w-full"
          placeholder="Buscar usuario por nombre…"
        />
        {busca && (
          <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">
            {filtrados.length === 0 && <p className="px-3 py-2 text-[0.72rem] text-ink-tertiary">Sin coincidencias</p>}
            {filtrados.map((u) => {
              const on = usuarios.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUsuario(u.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.75rem] hover:bg-gray-50"
                >
                  <span className="truncate text-ink-secondary">
                    {u.nombre} <span className="text-ink-tertiary">· {u.tipoUsuario}</span>
                  </span>
                  {on && <Check className="h-3.5 w-3.5 flex-shrink-0 text-brand" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════ Visor del reporte operativo de postulantes ══════════ */

// Colores fijos por etapa del embudo — mismo criterio de "semáforo" que ya
// usa el resto del sistema (verde = avance, ámbar = pendiente, rojo = pérdida).
const COLOR_ESTATUS: Record<string, string> = {
  interesado: '#2563eb',
  'cita agendada': '#7c3aed',
  'cita confirmada': '#0891b2',
  asistió: '#059669',
  asistio: '#059669',
  contratado: '#059669',
  'no asistió': '#d97706',
  'no asistio': '#d97706',
  'no interesado': '#dc2626',
  descartado: '#dc2626',
}
function colorDeEstatus(estatus: string) {
  return COLOR_ESTATUS[estatus.toLowerCase()] ?? '#6b7280'
}

function ReporteEjecutivoReclutamientoView() {
  const [desde, setDesde] = useState(hace30Dias())
  const [hasta, setHasta] = useState(hoy())
  const [campaniaId, setCampaniaId] = useState<number | ''>('')

  const { data: campanias = [] } = useQuery({
    queryKey: ['suite-reporte-ejecutivo-campanias'],
    queryFn: () => ccService.getCampanias(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['suite-reporte-ejecutivo-reclutamiento', desde, hasta, campaniaId],
    queryFn: () => reporteDiarioService.getReporteEjecutivoReclutamiento({ desde, hasta, campaniaId: Number(campaniaId) }),
    enabled: campaniaId !== '',
  })

  const maxEstatus = data ? Math.max(1, ...data.graficos.distribucionPorEstatus.map((e) => e.cantidad)) : 1
  const maxCanal = data ? Math.max(1, ...data.graficos.origenPorCanal.map((c) => c.cantidad)) : 1
  const maxAgente = data ? Math.max(1, ...data.graficos.gestionPorAsesor.map((a) => a.cantidad)) : 1
  const maxAgenda = data ? Math.max(1, ...data.graficos.agendaPorFechaAsistencia.map((a) => a.cantidad)) : 1

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Parámetros
        </span>
        <div>
          <label className="mb-1 block text-[0.68rem] text-ink-secondary">Campaña</label>
          <select value={campaniaId} onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')} className="field">
            <option value="">Selecciona una campaña</option>
            {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[0.68rem] text-ink-secondary">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" max={hasta} />
        </div>
        <div>
          <label className="mb-1 block text-[0.68rem] text-ink-secondary">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" min={desde} max={hoy()} />
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-ink">Reporte Ejecutivo de Reclutamiento</h2>
        <p className="text-xs text-gray-500">Control y seguimiento de postulantes de una campaña, por rango de fechas</p>
      </div>

      {campaniaId === '' ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <BarChart2 className="h-8 w-8" />
          <p className="text-sm">Selecciona una campaña para ver su reporte</p>
        </div>
      ) : isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'total', icon: ClipboardList, label: 'Total postulantes', value: data.indicadores.totalPostulantes, tone: 'brand' },
              { key: 'con-asistencia', icon: CheckCircle2, label: 'Con fecha de asistencia', value: data.indicadores.conFechaAsistencia, tone: 'success' },
              { key: 'con-horario', icon: SlidersHorizontal, label: 'Con horario', value: data.indicadores.conHorario, tone: 'brand' },
              { key: 'con-canal', icon: Users, label: 'Con canal identificado', value: data.indicadores.conCanalIdentificado, tone: 'success' },
            ]}
          />

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Embudo por estatus</h3>
            {data.embudo.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-tertiary">Sin postulantes en este rango</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {data.embudo.map((e) => (
                  <div key={e.estatus} className="rounded-xl border border-gray-100 p-3" style={{ borderTopColor: colorDeEstatus(e.estatus), borderTopWidth: 3 }}>
                    <p className="truncate text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">{e.estatus}</p>
                    <p className="text-lg font-bold text-ink">{e.cantidad} <span className="text-xs font-medium text-ink-tertiary">| {e.porcentaje}%</span></p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">KPIs de conversión y calidad del proceso</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: 'Citas / Total', value: data.kpisConversion.citasSobreTotal },
                { label: 'Confirmadas / Citas', value: data.kpisConversion.confirmadasSobreCitas },
                { label: 'Asistencia registrada', value: data.kpisConversion.asistenciaRegistrada },
                { label: 'Contratación / Total', value: data.kpisConversion.contratacionSobreTotal },
                { label: 'Descarte + No interés', value: data.kpisConversion.descarteMasNoInteres },
              ].map((k) => (
                <div key={k.label} className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">{k.label}</p>
                  <p className="text-base font-bold text-ink">{k.value}%</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Distribución por estatus</h3>
              {data.graficos.distribucionPorEstatus.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-tertiary">Sin datos</p>
              ) : (
                <ProgressBarList items={data.graficos.distribucionPorEstatus.map((e) => ({
                  key: e.estatus, label: e.estatus, value: e.cantidad, max: maxEstatus, color: colorDeEstatus(e.estatus),
                }))} />
              )}
            </div>

            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Origen de postulantes</h3>
              {data.graficos.origenPorCanal.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-tertiary">Sin datos</p>
              ) : (
                <ProgressBarList items={data.graficos.origenPorCanal.map((c) => ({
                  key: c.canal, label: c.canal, value: c.cantidad, max: maxCanal,
                }))} />
              )}
            </div>

            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Gestión por asesor</h3>
              {data.graficos.gestionPorAsesor.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-tertiary">Sin datos</p>
              ) : (
                <ProgressBarList items={data.graficos.gestionPorAsesor.map((a) => ({
                  key: a.agente, label: a.agente, value: a.cantidad, max: maxAgente,
                }))} />
              )}
            </div>

            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Agenda por fecha de asistencia</h3>
              {data.graficos.agendaPorFechaAsistencia.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-tertiary">Sin citas agendadas en este rango</p>
              ) : (
                <ProgressBarList items={data.graficos.agendaPorFechaAsistencia.map((a) => ({
                  key: a.fecha, label: new Date(a.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }), value: a.cantidad, max: maxAgenda,
                }))} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ReportePostulantesView() {
  const [desde, setDesde] = useState(hace30Dias())
  const [hasta, setHasta] = useState(hoy())

  const { data, isLoading } = useQuery({
    queryKey: ['suite-reporte-postulantes', desde, hasta],
    queryFn: () => reporteDiarioService.getPostulantes({ desde, hasta }),
  })

  const porCampaniaTotales = new Map<string, number>()
  data?.porCampania.forEach((c) => porCampaniaTotales.set(c.campania, (porCampaniaTotales.get(c.campania) ?? 0) + c.total))
  const campaniaItems = Array.from(porCampaniaTotales.entries()).map(([campania, total]) => ({ campania, total }))
  const totalPostulantes = campaniaItems.reduce((a, c) => a + c.total, 0)
  const campaniaTop = campaniaItems.slice().sort((a, b) => b.total - a.total)[0]
  const maxCampania = Math.max(1, ...campaniaItems.map((c) => c.total))
  const maxTip = data ? Math.max(1, ...data.porTipificacion.map((t) => t.total)) : 1
  const maxAgente = data ? Math.max(1, ...data.productividadAgentes.map((a) => a.notas)) : 1

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Parámetros
          </span>
          <label className="text-[0.72rem] text-ink-secondary">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" max={hasta} />
          <label className="text-[0.72rem] text-ink-secondary">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" min={desde} max={hoy()} />
        </div>
        <a
          href={reporteDiarioService.excelPostulantesUrl({ desde, hasta })}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" /> Exportar a Excel
        </a>
      </div>

      <div>
        <h2 className="text-base font-bold text-ink">Reportería de postulantes</h2>
        <p className="text-xs text-gray-500">Volumen, tipificación y seguimiento en un rango de fechas</p>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'total', icon: ClipboardList, label: 'Postulantes en el rango', value: totalPostulantes, tone: 'brand' },
              { key: 'sin-tip', icon: AlertTriangle, label: 'Sin tipificar', value: data.sinTipificar.total, tone: 'warn' },
              { key: 'top-campania', icon: Users, label: 'Campaña con más volumen', value: campaniaTop?.campania ?? '—', tone: 'success' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Por campaña</h3>
              {campaniaItems.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-tertiary">Sin postulantes en este rango</p>
              ) : (
                <ProgressBarList items={campaniaItems.map((c) => ({ key: c.campania, label: c.campania, value: c.total, max: maxCampania }))} />
              )}
            </div>

            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Por tipificación</h3>
              {data.porTipificacion.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-tertiary">Sin postulantes en este rango</p>
              ) : (
                <ProgressBarList
                  items={data.porTipificacion.map((t) => ({
                    key: t.tipificacion ?? 'sin-tipificar',
                    label: t.tipificacion ? (TIPIFICACIONES_LLAMADA_LABEL[t.tipificacion] || t.etiqueta) : 'Sin tipificar',
                    value: t.total, max: maxTip,
                  }))}
                />
              )}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Productividad por agente (notas registradas)</h3>
            {data.productividadAgentes.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-tertiary">Sin notas registradas en este rango</p>
            ) : (
              <ProgressBarList
                items={data.productividadAgentes.map((a) => ({
                  key: String(a.usuarioId), label: a.usuarioNombre || `Usuario ${a.usuarioId}`, value: a.notas, max: maxAgente,
                }))}
              />
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Sin tipificar — más antiguos</h3>
            {data.sinTipificar.masAntiguos.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-tertiary">No hay postulantes sin tipificar en este rango</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Teléfono</th>
                      <th className="px-3 py-2">Campaña</th>
                      <th className="px-3 py-2">Días esperando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sinTipificar.masAntiguos.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 font-semibold text-ink">{p.nombre}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.telefono}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.campania}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.diasEsperando}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ══════════ Interacciones — buscador general (todas las campañas/canales) ══════════ */

function InteraccionesView() {
  const [texto, setTexto] = useState('')
  const [textoBuscado, setTextoBuscado] = useState('')
  const [agenteId, setAgenteId] = useState<number | ''>('')
  const [tipificacionId, setTipificacionId] = useState<number | ''>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const { data: agentes = [] } = useQuery({
    queryKey: ['rb-catalogo-filtro', 'agente'],
    queryFn: () => reporteDiarioService.builderCatalogoFiltro('agente'),
    staleTime: 5 * 60_000,
  })
  const { data: tipificaciones = [] } = useQuery({
    queryKey: ['rb-catalogo-filtro', 'tipificacion'],
    queryFn: () => reporteDiarioService.builderCatalogoFiltro('tipificacion'),
    staleTime: 5 * 60_000,
  })

  const filtro = {
    texto: textoBuscado || undefined,
    agenteId: agenteId || undefined,
    tipificacionId: tipificacionId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  }

  const { data: resultados = [], isLoading, isFetching } = useQuery({
    queryKey: ['suite-reportes-interacciones', filtro],
    queryFn: () => reporteDiarioService.listInteracciones(filtro),
  })

  const buscar = () => setTextoBuscado(texto.trim())
  const hayFiltrosExtra = !!(agenteId || tipificacionId || desde || hasta)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Search className="h-4.5 w-4.5 text-brand" /> Interacciones
        </h2>
        <p className="text-xs text-gray-500">Interacciones cerradas de todas las campañas y canales — busca por nombre o teléfono del cliente.</p>
      </div>

      <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            className="field flex-1"
            placeholder="Buscar por nombre o teléfono del cliente…"
          />
          <button
            onClick={buscar}
            disabled={isFetching}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
          </button>
          <a
            href={reporteDiarioService.interaccionesExcelUrl(filtro)}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-secondary transition hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Excel
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select className="field" value={agenteId} onChange={(e) => setAgenteId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos los agentes</option>
            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <select className="field" value={tipificacionId} onChange={(e) => setTipificacionId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas las tipificaciones</option>
            {tipificaciones.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <span className="text-[0.72rem] text-ink-secondary">Cierre desde</span>
          <input type="date" className="field" value={desde} onChange={(e) => setDesde(e.target.value)} max={hasta || undefined} />
          <span className="text-[0.72rem] text-ink-secondary">hasta</span>
          <input type="date" className="field" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde || undefined} />
          {hayFiltrosExtra && (
            <button
              onClick={() => { setAgenteId(''); setTipificacionId(''); setDesde(''); setHasta('') }}
              className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[0.7rem] font-semibold text-ink-tertiary hover:bg-gray-50"
            >
              <X className="h-3 w-3" /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-left text-[0.78rem]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Teléfono</th>
              <th className="px-3 py-2.5">Campaña</th>
              <th className="px-3 py-2.5">Canal</th>
              <th className="px-3 py-2.5">Agente</th>
              <th className="px-3 py-2.5">Tipificación</th>
              <th className="px-3 py-2.5">Cierre</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-10"><div className="flex justify-center"><Spinner /></div></td></tr>
            ) : resultados.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-tertiary">Sin resultados.</td></tr>
            ) : (
              resultados.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-semibold text-ink">{r.clienteNombre ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">{r.clienteTelefono ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">{r.campaniaNombre ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">{r.canalNombre ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">{r.agenteNombre ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">{r.tipificacionNombre ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-tertiary">{r.fechaCierre ? new Date(r.fechaCierre).toLocaleString('es-MX') : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {resultados.length >= 300 && (
        <p className="text-[0.72rem] text-amber-600">Mostrando los 300 resultados más recientes — afina el buscador o el rango de fechas para ver menos.</p>
      )}
    </div>
  )
}

/* ══════════ Visor de una definición RDL ══════════ */

function RdlView({
  reporte,
  puedeAdministrar,
  carpetas,
  onEliminar,
  onGuardado,
}: {
  reporte: RdlReporte
  puedeAdministrar: boolean
  carpetas: RdlCarpeta[]
  onEliminar: () => void
  onGuardado: () => void
}) {
  const [seguridadOpen, setSeguridadOpen] = useState(false)

  const { data: defReparsed } = useQuery({
    queryKey: ['rdl-reparse', reporte.id, reporte.url],
    queryFn: async () => {
      const res = await fetch(reporte.url)
      if (!res.ok) throw new Error('No se pudo leer el archivo')
      return parseRdl(await res.text())
    },
    enabled: !reporte.metadata,
  })
  const def: RdlDefinition | null = reporte.metadata ?? defReparsed ?? null
  const restringido = reporte.roles.length > 0 || reporte.usuarios.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold text-ink">{reporte.nombre}</h2>
            {reporte.compatible ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Compatible
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Parcial
              </span>
            )}
            {restringido ? (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-bold text-ink-secondary">
                <Lock className="h-3 w-3" /> Restringido
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-600">
                <Globe className="h-3 w-3" /> Público
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {reporte.carpeta} · {reporte.archivoOriginal} · {fmtBytes(reporte.tamano)}
            {reporte.versionRdl && ` · RDL ${reporte.versionRdl}`}
            {reporte.subidoNombre && ` · subió ${reporte.subidoNombre}`}
          </p>
          {reporte.descripcion && <p className="mt-1 text-sm text-ink-secondary">{reporte.descripcion}</p>}
          {restringido && (
            <p className="mt-1 text-[0.72rem] text-ink-tertiary">
              Acceso: {reporte.roles.map((r) => ROL_LABEL[r]).join(', ')}
              {reporte.roles.length > 0 && reporte.usuarios.length > 0 && ' · '}
              {reporte.usuarios.length > 0 && `${reporte.usuarios.length} usuario(s)`}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <a
            href={reporteDiarioService.rdlDescargaUrl(reporte.id)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" /> Descargar .rdl
          </a>
          {puedeAdministrar && (
            <>
              <button
                onClick={() => setSeguridadOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
              >
                <Shield className="h-3.5 w-3.5" /> Acceso y carpeta
              </button>
              <button
                onClick={onEliminar}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-red-600 transition hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {!def ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          {def.reason && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[0.8rem] text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{def.reason}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Datasets" value={def.dataSets.length} icon={Database} />
            <MiniStat label="Parámetros" value={def.parameters.length} icon={SlidersHorizontal} />
            <MiniStat label="Data regions" value={def.dataRegions.length} icon={Table2} />
            <MiniStat label="Orígenes de datos" value={def.dataSources.length} icon={Database} />
          </div>

          {def.parameters.length > 0 && (
            <section className="card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
                <SlidersHorizontal className="h-4 w-4 text-brand" /> Parámetros del reporte
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Prompt</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Multivalor</th>
                      <th className="px-3 py-2">Valor por defecto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {def.parameters.map((p) => (
                      <tr key={p.name} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 font-semibold text-ink">{p.name}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.prompt || '—'}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.dataType || '—'}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.multiValue ? 'Sí' : 'No'}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.defaultValues.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {def.dataSets.map((ds) => (
            <section key={ds.name} className="card p-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
                <Database className="h-4 w-4 text-brand" /> Dataset: {ds.name}
              </h3>
              <p className="mb-3 text-[0.72rem] text-ink-tertiary">
                {ds.dataSourceName ? `Origen: ${ds.dataSourceName}` : 'Sin origen declarado'}
                {ds.commandType && ` · ${ds.commandType}`}
              </p>

              {ds.commandText && (
                <pre className="mb-3 max-h-56 overflow-auto rounded-lg bg-gray-900 p-3 text-[0.72rem] leading-relaxed text-gray-100">
                  {ds.commandText}
                </pre>
              )}

              {ds.fields.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                        <th className="px-3 py-2">Campo</th>
                        <th className="px-3 py-2">DataField</th>
                        <th className="px-3 py-2">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ds.fields.map((f) => (
                        <tr key={f.name} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 font-semibold text-ink">{f.name}</td>
                          <td className="px-3 py-2 text-ink-secondary">{f.dataField || '—'}</td>
                          <td className="px-3 py-2 text-ink-secondary">{f.typeName || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-tertiary">Sin campos declarados en el dataset.</p>
              )}
            </section>
          ))}

          {def.dataRegions.map((dr, i) => (
            <section key={`${dr.name}-${i}`} className="card p-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
                <Table2 className="h-4 w-4 text-brand" /> {dr.type}: {dr.name}
              </h3>
              <p className="mb-3 text-[0.72rem] text-ink-tertiary">
                {dr.dataSetName ? `Dataset: ${dr.dataSetName}` : 'Sin dataset vinculado'}
              </p>
              {dr.columns.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-secondary">
                        {dr.columns.map((c, j) => <th key={j} className="border-r border-gray-200 px-3 py-2 last:border-0">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {dr.columns.map((_, j) => (
                          <td key={j} className="border-r border-t border-gray-100 px-3 py-2 text-ink-tertiary last:border-r-0">
                            <span className="italic">datos en tiempo de ejecución</span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-tertiary">
                  {dr.type === 'Chart' || dr.type === 'Matrix'
                    ? `Estructura de ${dr.type} — se renderiza en el servidor de reportes.`
                    : 'No se pudieron extraer las columnas de esta región.'}
                </p>
              )}
            </section>
          ))}

          <p className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-[0.72rem] text-ink-tertiary">
            <BarChart2 className="h-3.5 w-3.5" />
            Vista previa de la definición. Para ejecutar la consulta y renderizar los datos hace falta publicar el RDL en un servidor SQL Server Reporting Services.
          </p>
        </>
      )}

      {seguridadOpen && (
        <EditarAccesoModal
          reporte={reporte}
          carpetas={carpetas}
          onClose={() => setSeguridadOpen(false)}
          onGuardado={() => { setSeguridadOpen(false); onGuardado() }}
        />
      )}
    </div>
  )
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-card p-3 shadow-card">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</p>
        <p className="text-base font-bold text-ink">{value}</p>
      </div>
    </div>
  )
}

/* ══════════ Modal: editar acceso + carpeta de un reporte existente ══════════ */

function EditarAccesoModal({
  reporte,
  carpetas,
  onClose,
  onGuardado,
}: {
  reporte: RdlReporte
  carpetas: RdlCarpeta[]
  onClose: () => void
  onGuardado: () => void
}) {
  const [carpeta, setCarpeta] = useState(reporte.carpeta)
  const [roles, setRoles] = useState<RdlRol[]>(reporte.roles)
  const [usuarios, setUsuarios] = useState<number[]>(reporte.usuarios)

  const m = useMutation({
    mutationFn: () =>
      reporteDiarioService.actualizarRdl(reporte.id, {
        carpeta: carpeta.trim() || 'General',
        roles,
        usuarios,
      }),
    onSuccess: () => {
      toast.success('Acceso actualizado')
      onGuardado()
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <Modal isOpen onClose={onClose} title="Acceso y carpeta" size="lg" elevated>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Carpeta</label>
          <input
            value={carpeta}
            onChange={(e) => setCarpeta(e.target.value)}
            list="carpetas-rdl-editar"
            className="field w-full"
          />
          <datalist id="carpetas-rdl-editar">
            {carpetas.map((c) => <option key={c.id} value={c.nombre} />)}
          </datalist>
          <p className="mt-1 text-[0.68rem] text-ink-tertiary">Si escribes un nombre nuevo, la carpeta se crea sola.</p>
        </div>

        <SeguridadEditor roles={roles} usuarios={usuarios} onChange={(n) => { setRoles(n.roles); setUsuarios(n.usuarios) }} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════ Modal: subir RDL ══════════ */

function SubirRdlModal({
  onClose,
  onSubido,
  carpetas,
}: {
  onClose: () => void
  onSubido: (r: RdlReporte) => void
  carpetas: RdlCarpeta[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [carpeta, setCarpeta] = useState('General')
  const [roles, setRoles] = useState<RdlRol[]>([])
  const [usuarios, setUsuarios] = useState<number[]>([])
  const [preview, setPreview] = useState<RdlDefinition | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const subir = useMutation({
    mutationFn: () =>
      reporteDiarioService.subirRdl({
        file: file!,
        nombre,
        descripcion,
        carpeta: carpeta.trim() || 'General',
        roles,
        usuarios,
      }),
    onSuccess: (r) => {
      toast.success('RDL subido y catalogado')
      onSubido(r)
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  async function onFile(f: File | null) {
    setFile(f)
    setPreview(null)
    setPreviewError(null)
    if (!f) return
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
    if (ext !== '.rdl' && ext !== '.rdlc') {
      setPreviewError('El archivo debe tener extensión .rdl o .rdlc')
      return
    }
    if (!nombre) setNombre(f.name.replace(/\.(rdl|rdlc)$/i, ''))
    try {
      const def = parseRdl(await f.text())
      setPreview(def)
      if (!def.compatible && !previewError) setPreviewError(def.reason ?? null)
    } catch {
      setPreviewError('No se pudo leer el contenido del archivo.')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Subir definición RDL" size="lg">
      <div className="space-y-4">
        <label
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition',
            file ? 'border-brand/40 bg-brand/5' : 'border-gray-300 bg-gray-50 hover:border-brand/40 hover:bg-brand/5',
          )}
        >
          <input
            type="file"
            accept=".rdl,.rdlc,application/xml,text/xml"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <FileCode2 className="h-7 w-7 text-brand" />
          {file ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              {file.name}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onFile(null) }}
                className="rounded p-0.5 text-ink-tertiary hover:bg-gray-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-sm font-semibold text-ink">Haz clic para elegir un archivo .rdl / .rdlc</span>
              <span className="text-[0.72rem] text-ink-tertiary">Definiciones de SQL Server Reporting Services · máx. 20 MB</span>
            </>
          )}
        </label>

        {previewError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[0.78rem] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{previewError}</span>
          </div>
        )}

        {preview && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-[0.78rem]">
            <div className="mb-2 flex items-center gap-2 font-semibold text-ink">
              {preview.compatible
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              {preview.compatible ? 'Definición compatible' : 'Compatibilidad parcial'}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-ink-secondary">
              <li>Report: <b className="text-ink">{preview.reportName || '—'}</b></li>
              <li>Versión RDL: <b className="text-ink">{preview.rdlVersion || 'desconocida'}</b></li>
              <li>Datasets: <b className="text-ink">{preview.dataSets.length}</b></li>
              <li>Parámetros: <b className="text-ink">{preview.parameters.length}</b></li>
              <li>Data regions: <b className="text-ink">{preview.dataRegions.length}</b></li>
              <li>Orígenes: <b className="text-ink">{preview.dataSources.length}</b></li>
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field w-full" placeholder="Nombre del reporte" />
          </div>
          <div>
            <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Carpeta</label>
            <input
              value={carpeta}
              onChange={(e) => setCarpeta(e.target.value)}
              list="carpetas-rdl"
              className="field w-full"
              placeholder="General"
            />
            <datalist id="carpetas-rdl">
              {carpetas.map((c) => <option key={c.id} value={c.nombre} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">Descripción (opcional)</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="field w-full resize-none"
            placeholder="Para qué sirve este reporte…"
          />
        </div>

        <SeguridadEditor roles={roles} usuarios={usuarios} onChange={(n) => { setRoles(n.roles); setUsuarios(n.usuarios) }} />

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => subir.mutate()}
            disabled={!file || !nombre.trim() || subir.isPending}
          >
            {subir.isPending ? 'Subiendo…' : 'Subir y catalogar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
