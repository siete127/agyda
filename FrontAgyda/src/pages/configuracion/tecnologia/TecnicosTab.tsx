import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, X, Save } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { tecnicosService } from '@/services/tecnicos.service'
import { catalogosTiService } from '@/services/catalogosTi.service'
import type { Tecnico, ActualizarPerfilTecnicoPayload, TecnicoEstadoTrabajo } from '@/types/tecnico.types'

const ESTADO_TRABAJO_LABELS: Record<TecnicoEstadoTrabajo, string> = {
  disponible: 'Disponible',
  pausa: 'En pausa',
  fuera_horario: 'Fuera de horario',
  ocupado: 'Ocupado',
  no_disponible: 'No disponible',
}

const PRIORIDADES = ['P1', 'P2', 'P3', 'P4']
const DIAS = [
  { val: '1', label: 'Lun' }, { val: '2', label: 'Mar' }, { val: '3', label: 'Mié' },
  { val: '4', label: 'Jue' }, { val: '5', label: 'Vie' }, { val: '6', label: 'Sáb' }, { val: '7', label: 'Dom' },
]

function EditorTecnico({ tecnico, onClose }: { tecnico: Tecnico; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: especialidades = [] } = useQuery({ queryKey: ['catalogos-ti-especialidades'], queryFn: () => catalogosTiService.getEspecialidades() })
  const { data: categorias = [] } = useQuery({ queryKey: ['catalogos-ti-categorias'], queryFn: () => catalogosTiService.getCategorias() })
  const { data: sedes = [] } = useQuery({ queryKey: ['catalogos-ti-sedes'], queryFn: () => catalogosTiService.getSedes() })

  const [form, setForm] = useState<ActualizarPerfilTecnicoPayload>({
    area: tecnico.area,
    nivel: tecnico.nivel,
    disponible: tecnico.disponible,
    estadoTrabajo: tecnico.estadoTrabajo,
    maxTickets: tecnico.maxTickets,
    maxChats: tecnico.maxChats,
    prioridadesPermitidas: tecnico.prioridadesPermitidas ?? [],
    horarioInicio: tecnico.horarioInicio,
    horarioFin: tecnico.horarioFin,
    diasSemana: tecnico.diasSemana ?? [],
    especialidadesIds: tecnico.especialidades.map((e) => e.id),
    categoriasIds: tecnico.categoriasPermitidas.map((c) => c.id),
    sedesIds: tecnico.sedesPermitidas.map((s) => s.id),
  })

  const guardar = useMutation({
    mutationFn: () => tecnicosService.actualizarPerfilTecnico(tecnico.userId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tecnicos'] })
      toast.success('Perfil de técnico actualizado')
      onClose()
    },
    onError: () => toast.error('No se pudo actualizar el perfil'),
  })

  const togglePrioridad = (p: string) => {
    setForm((f) => ({
      ...f,
      prioridadesPermitidas: f.prioridadesPermitidas.includes(p)
        ? f.prioridadesPermitidas.filter((x) => x !== p)
        : [...f.prioridadesPermitidas, p],
    }))
  }

  const toggleDia = (d: string) => {
    setForm((f) => ({
      ...f,
      diasSemana: f.diasSemana.includes(d) ? f.diasSemana.filter((x) => x !== d) : [...f.diasSemana, d],
    }))
  }

  const toggleId = (list: number[], id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-bold text-ink">Perfil de {tecnico.nombre}</p>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Área</label>
              <select className="field mt-1 text-sm" value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}>
                <option value="TI">TI</option>
                <option value="ST">ST</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Nivel</label>
              <select className="field mt-1 text-sm" value={form.nivel} onChange={(e) => setForm((f) => ({ ...f, nivel: Number(e.target.value) }))}>
                <option value={1}>N1</option>
                <option value={2}>N2</option>
                <option value={3}>N3</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Estado de trabajo</label>
              <select
                className="field mt-1 text-sm"
                value={form.estadoTrabajo}
                onChange={(e) => setForm((f) => ({ ...f, estadoTrabajo: e.target.value as TecnicoEstadoTrabajo }))}
              >
                {Object.entries(ESTADO_TRABAJO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.disponible} onChange={(e) => setForm((f) => ({ ...f, disponible: e.target.checked }))} className="h-4 w-4" />
                Disponible para asignación
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Máx. tickets simultáneos</label>
              <input type="number" min={0} className="field mt-1 text-sm" value={form.maxTickets} onChange={(e) => setForm((f) => ({ ...f, maxTickets: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Máx. chats simultáneos</label>
              <input type="number" min={0} className="field mt-1 text-sm" value={form.maxChats} onChange={(e) => setForm((f) => ({ ...f, maxChats: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Prioridades que atiende (vacío = todas)</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRIORIDADES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePrioridad(p)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.prioridadesPermitidas.includes(p) ? 'bg-brand text-white' : 'bg-surface text-ink-secondary',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Horario inicio</label>
              <input type="time" className="field mt-1 text-sm" value={form.horarioInicio ?? ''} onChange={(e) => setForm((f) => ({ ...f, horarioInicio: e.target.value || null }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Horario fin</label>
              <input type="time" className="field mt-1 text-sm" value={form.horarioFin ?? ''} onChange={(e) => setForm((f) => ({ ...f, horarioFin: e.target.value || null }))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Días laborales (vacío = sin restricción)</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {DIAS.map((d) => (
                <button
                  key={d.val}
                  type="button"
                  onClick={() => toggleDia(d.val)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.diasSemana.includes(d.val) ? 'bg-brand text-white' : 'bg-surface text-ink-secondary',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Especialidades</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {especialidades.map((esp) => (
                <button
                  key={esp.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, especialidadesIds: toggleId(f.especialidadesIds, esp.id) }))}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.especialidadesIds.includes(esp.id) ? 'bg-brand text-white' : 'bg-surface text-ink-secondary',
                  )}
                >
                  {esp.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Categorías permitidas (vacío = todas)</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, categoriasIds: toggleId(f.categoriasIds, cat.id) }))}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.categoriasIds.includes(cat.id) ? 'bg-brand text-white' : 'bg-surface text-ink-secondary',
                  )}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Sedes permitidas (vacío = todas)</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {sedes.map((sede) => (
                <button
                  key={sede.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, sedesIds: toggleId(f.sedesIds, sede.id) }))}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.sedesIds.includes(sede.id) ? 'bg-brand text-white' : 'bg-surface text-ink-secondary',
                  )}
                >
                  {sede.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button className="px-3 py-1.5 text-xs text-ink-tertiary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export function TecnicosTab() {
  const [editando, setEditando] = useState<Tecnico | null>(null)

  const { data: tecnicos = [], isLoading } = useQuery({
    queryKey: ['tecnicos'],
    queryFn: () => tecnicosService.getTecnicos(),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Técnicos de soporte</p>
        <p className="mb-3 text-xs text-ink-tertiary">
          Perfil completo usado por el motor de reglas de asignación: especialidad, categorías/sedes con
          cobertura, capacidad máxima y horario.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8rem]">
              <thead>
                <tr className="border-b border-surface-border text-left text-[0.65rem] uppercase tracking-wide text-ink-tertiary">
                  <th className="pb-2 pr-2">Técnico</th>
                  <th className="pb-2 pr-2">Área / Nivel</th>
                  <th className="pb-2 pr-2">Estado</th>
                  <th className="pb-2 pr-2">Carga actual</th>
                  <th className="pb-2 pr-2">Especialidades</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {tecnicos.map((t) => (
                  <tr key={t.userId} className="border-b border-surface-border/60">
                    <td className="py-2 pr-2 font-medium text-ink">{t.nombre}</td>
                    <td className="py-2 pr-2 text-ink-secondary">{t.area} · N{t.nivel}</td>
                    <td className="py-2 pr-2">
                      <span className={clsx(
                        'rounded-full px-2 py-0.5 text-[0.68rem] font-medium',
                        t.estadoTrabajo === 'disponible' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600',
                      )}>
                        {ESTADO_TRABAJO_LABELS[t.estadoTrabajo]}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-ink-tertiary">
                      {t.cargaActual.tickets} tickets · {t.cargaActual.chats} chats
                    </td>
                    <td className="py-2 pr-2 text-ink-tertiary">
                      {t.especialidades.length ? t.especialidades.map((e) => e.nombre).join(', ') : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => setEditando(t)} className="text-ink-tertiary hover:text-brand" title="Editar perfil">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && <EditorTecnico tecnico={editando} onClose={() => setEditando(null)} />}
    </div>
  )
}
