import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Plus, Pencil, Trash2, ArrowUp, ArrowDown, FlaskConical, X, Save } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { reglasAsignacionService } from '@/services/reglasAsignacion.service'
import { catalogosTiService } from '@/services/catalogosTi.service'
import type { ReglaAsignacion, ReglaAsignacionPayload } from '@/types/reglasAsignacion.types'

const PRIORIDADES = ['P1', 'P2', 'P3', 'P4']
const DIAS = [
  { val: '1', label: 'Lun' }, { val: '2', label: 'Mar' }, { val: '3', label: 'Mié' },
  { val: '4', label: 'Jue' }, { val: '5', label: 'Vie' }, { val: '6', label: 'Sáb' }, { val: '7', label: 'Dom' },
]

function ReglaFormModal({ regla, onClose }: { regla: ReglaAsignacion | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: categorias = [] } = useQuery({ queryKey: ['catalogos-ti-categorias'], queryFn: () => catalogosTiService.getCategorias() })
  const { data: sedes = [] } = useQuery({ queryKey: ['catalogos-ti-sedes'], queryFn: () => catalogosTiService.getSedes() })
  const { data: especialidades = [] } = useQuery({ queryKey: ['catalogos-ti-especialidades'], queryFn: () => catalogosTiService.getEspecialidades() })

  const [form, setForm] = useState<ReglaAsignacionPayload>({
    nombre: regla?.nombre ?? '',
    area: regla?.area ?? null,
    categoriaId: regla?.categoriaId ?? null,
    subcategoriaId: regla?.subcategoriaId ?? null,
    sedeId: regla?.sedeId ?? null,
    prioridad: regla?.prioridad ?? null,
    nivelRequerido: regla?.nivelRequerido ?? null,
    especialidadId: regla?.especialidadId ?? null,
    horarioInicio: regla?.horarioInicio ?? null,
    horarioFin: regla?.horarioFin ?? null,
    diasSemana: regla?.diasSemana ? regla.diasSemana.split(',') : [],
  })

  const categoriaSeleccionada = categorias.find((c) => c.id === form.categoriaId)

  const toggleDia = (d: string) => {
    setForm((f) => ({
      ...f,
      diasSemana: (f.diasSemana ?? []).includes(d) ? (f.diasSemana ?? []).filter((x) => x !== d) : [...(f.diasSemana ?? []), d],
    }))
  }

  const guardar = useMutation({
    mutationFn: () => regla
      ? reglasAsignacionService.updateRegla(regla.id, { ...form, activa: regla.activa })
      : reglasAsignacionService.createRegla(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reglas-asignacion'] })
      toast.success(regla ? 'Regla actualizada' : 'Regla creada')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la regla'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-bold text-ink">{regla ? 'Editar regla' : 'Nueva regla de asignación'}</p>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nombre</label>
            <input className="field mt-1 text-sm" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Redes N2 a especialista" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Área (vacío = ambas)</label>
              <select className="field mt-1 text-sm" value={form.area ?? ''} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value || null }))}>
                <option value="">Cualquiera</option>
                <option value="TI">TI</option>
                <option value="ST">ST</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Prioridad (vacío = cualquiera)</label>
              <select className="field mt-1 text-sm" value={form.prioridad ?? ''} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value || null }))}>
                <option value="">Cualquiera</option>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Categoría (vacío = cualquiera)</label>
              <select
                className="field mt-1 text-sm"
                value={form.categoriaId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value ? Number(e.target.value) : null, subcategoriaId: null }))}
              >
                <option value="">Cualquiera</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Subcategoría</label>
              <select
                className="field mt-1 text-sm"
                value={form.subcategoriaId ?? ''}
                disabled={!categoriaSeleccionada}
                onChange={(e) => setForm((f) => ({ ...f, subcategoriaId: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Cualquiera</option>
                {categoriaSeleccionada?.subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Sede (vacío = cualquiera)</label>
              <select className="field mt-1 text-sm" value={form.sedeId ?? ''} onChange={(e) => setForm((f) => ({ ...f, sedeId: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">Cualquiera</option>
                {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Nivel requerido (vacío = el del ticket)</label>
              <select className="field mt-1 text-sm" value={form.nivelRequerido ?? ''} onChange={(e) => setForm((f) => ({ ...f, nivelRequerido: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">Automático</option>
                <option value={1}>N1</option>
                <option value={2}>N2</option>
                <option value={3}>N3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Especialidad requerida (vacío = ninguna)</label>
            <select className="field mt-1 text-sm" value={form.especialidadId ?? ''} onChange={(e) => setForm((f) => ({ ...f, especialidadId: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Ninguna</option>
              {especialidades.map((esp) => <option key={esp.id} value={esp.id}>{esp.nombre}</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-gray-100 bg-surface/50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-600">
              Ventana de horario (opcional — ej. reglas de guardia nocturna)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Desde</label>
                <input type="time" className="field mt-1 text-sm" value={form.horarioInicio ?? ''} onChange={(e) => setForm((f) => ({ ...f, horarioInicio: e.target.value || null }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Hasta</label>
                <input type="time" className="field mt-1 text-sm" value={form.horarioFin ?? ''} onChange={(e) => setForm((f) => ({ ...f, horarioFin: e.target.value || null }))} />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs font-medium text-gray-600">Días (vacío = todos)</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {DIAS.map((d) => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => toggleDia(d.val)}
                    className={clsx(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      (form.diasSemana ?? []).includes(d.val) ? 'bg-brand text-white' : 'bg-white text-ink-secondary',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[0.68rem] text-ink-tertiary">
              Si dejas horario y días vacíos, la regla no tiene restricción de horario. Si defines un
              rango, la regla solo se evalúa dentro de esa ventana (ej. 18:00–08:00 para guardia nocturna).
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button className="px-3 py-1.5 text-xs text-ink-tertiary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!form.nombre.trim() || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function SimuladorPanel() {
  const { data: categorias = [] } = useQuery({ queryKey: ['catalogos-ti-categorias'], queryFn: () => catalogosTiService.getCategorias() })
  const { data: sedes = [] } = useQuery({ queryKey: ['catalogos-ti-sedes'], queryFn: () => catalogosTiService.getSedes() })

  const [area, setArea] = useState('TI')
  const [nivel, setNivel] = useState(1)
  const [categoriaId, setCategoriaId] = useState<number | ''>('')
  const [sedeId, setSedeId] = useState<number | ''>('')
  const [prioridad, setPrioridad] = useState<string>('')

  const simular = useMutation({
    mutationFn: () => reglasAsignacionService.simularAsignacion({
      area, nivel, categoriaId: categoriaId || null, sedeId: sedeId || null, prioridad: prioridad || null, tipoCarga: 'ticket',
    }),
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-brand" />
        <p className="text-sm font-semibold text-ink">Simulador (dry-run, no asigna nada real)</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select className="field text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="TI">TI</option>
          <option value="ST">ST</option>
        </select>
        <select className="field text-sm" value={nivel} onChange={(e) => setNivel(Number(e.target.value))}>
          <option value={1}>N1</option>
          <option value={2}>N2</option>
          <option value={3}>N3</option>
        </select>
        <select className="field text-sm" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Cualquier categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="field text-sm" value={sedeId} onChange={(e) => setSedeId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Cualquier sede</option>
          {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="field text-sm" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
          <option value="">Cualquier prioridad</option>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <button
        className="btn-secondary mt-3 px-3 py-1.5 text-xs"
        onClick={() => simular.mutate()}
        disabled={simular.isPending}
      >
        Simular asignación
      </button>

      {simular.data && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface p-3 text-sm">
          <p>
            <span className="font-semibold text-ink-secondary">1. Enrutamiento:</span>{' '}
            {simular.data.enrutamiento.grupoNombre ? (
              <>
                iría a <span className="font-semibold text-ink">{simular.data.enrutamiento.grupoNombre}</span> (N{simular.data.enrutamiento.nivel})
                {simular.data.enrutamiento.reglaAplicada && <span className="text-ink-tertiary"> — regla #{simular.data.enrutamiento.reglaAplicada}</span>}
              </>
            ) : (
              <span className="text-ink-tertiary">no hay grupo configurado para esa área/nivel.</span>
            )}
          </p>
          <p>
            <span className="font-semibold text-ink-secondary">2. Asignación:</span>{' '}
            {simular.data.asignacion.tecnicoId ? (
              <>se asignaría a <span className="font-semibold text-ink">{simular.data.asignacion.tecnicoNombre}</span></>
            ) : (
              <span className="text-ink-tertiary">ningún técnico disponible cumple los criterios.</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

export function ReglasNegocioTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'crear' | ReglaAsignacion | null>(null)

  const { data: reglas = [], isLoading } = useQuery({
    queryKey: ['reglas-asignacion'],
    queryFn: () => reglasAsignacionService.getReglas(),
  })

  const toggleActiva = useMutation({
    mutationFn: (r: ReglaAsignacion) => reglasAsignacionService.updateRegla(r.id, { nombre: r.nombre, activa: !r.activa, area: r.area, categoriaId: r.categoriaId, subcategoriaId: r.subcategoriaId, sedeId: r.sedeId, prioridad: r.prioridad, nivelRequerido: r.nivelRequerido, especialidadId: r.especialidadId, horarioInicio: r.horarioInicio, horarioFin: r.horarioFin, diasSemana: r.diasSemana ? r.diasSemana.split(',') : [] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reglas-asignacion'] }),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => reglasAsignacionService.deleteRegla(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reglas-asignacion'] })
      toast.success('Regla eliminada')
    },
  })

  const mover = useMutation({
    mutationFn: (ids: number[]) => reglasAsignacionService.reordenarReglas(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reglas-asignacion'] }),
  })

  const moverRegla = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= reglas.length) return
    const ids = reglas.map((r) => r.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    mover.mutate(ids)
  }

  return (
    <div className="space-y-4">
      <SimuladorPanel />

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-ink">Reglas de asignación</p>
          </div>
          <button className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs" onClick={() => setModal('crear')}>
            <Plus className="h-3.5 w-3.5" /> Nueva regla
          </button>
        </div>
        <p className="mb-3 text-xs text-ink-tertiary">
          Se evalúan en orden; la primera regla activa que coincida con el ticket/chat decide especialidad
          y nivel requeridos. Si ninguna coincide, se usa el técnico con menor carga del área/nivel.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : reglas.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Sin reglas configuradas — se usa el fallback automático.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {reglas.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 py-2.5">
                <div className="flex flex-col">
                  <button className="text-ink-tertiary hover:text-brand disabled:opacity-30" disabled={i === 0} onClick={() => moverRegla(i, -1)}>
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button className="text-ink-tertiary hover:text-brand disabled:opacity-30" disabled={i === reglas.length - 1} onClick={() => moverRegla(i, 1)}>
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1">
                  <p className={clsx('text-sm font-medium', !r.activa && 'text-ink-tertiary line-through')}>{r.nombre}</p>
                  <p className="text-xs text-ink-tertiary">
                    {[r.area, r.categoriaNombre, r.subcategoriaNombre, r.sedeNombre, r.prioridad, r.nivelRequerido ? `N${r.nivelRequerido}` : null, r.especialidadNombre]
                      .filter(Boolean).join(' · ') || 'Sin condiciones (comodín)'}
                    {r.horarioInicio && r.horarioFin && (
                      <span className="ml-1.5 text-amber-600">⏰ {r.horarioInicio}–{r.horarioFin}</span>
                    )}
                  </p>
                </div>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={r.activa} onChange={() => toggleActiva.mutate(r)} className="h-3.5 w-3.5" />
                  Activa
                </label>
                <button className="text-ink-tertiary hover:text-brand" onClick={() => setModal(r)}><Pencil className="h-3.5 w-3.5" /></button>
                <button
                  className="text-ink-tertiary hover:text-red-500"
                  onClick={() => { if (confirm(`¿Eliminar la regla "${r.nombre}"?`)) eliminar.mutate(r.id) }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && <ReglaFormModal regla={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
}
