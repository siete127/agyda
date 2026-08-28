import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, CheckCircle, RefreshCw, ChevronLeft,
  Plus, Trash2, Settings, Users, Send, XCircle, Calendar, Pencil, BarChart3, List,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EncuestasDashboard } from './EncuestasDashboard'
import { PreguntaCerradaChart, PreguntaAbiertaTabla } from './EncuestaResultadosCharts'
import { ResponderEncuesta } from './ResponderEncuesta'
import { encuestasService } from '@/services/encuestas.service'
import { parseEncuesta, type Pregunta, type Encuesta } from '@/types/encuesta.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Globe2, Lock, Copy } from 'lucide-react'

/* ══════════════════════════════════════
   MODAL CREAR ENCUESTA (admin)
══════════════════════════════════════ */
type PreguntaDraft = { id: number; texto: string; tipo: Pregunta['tipo']; opciones: string }

const AREAS_OPTS = [
  { value: 'CC', label: 'Call Center' },
  { value: 'TI', label: 'Tecnología' },
  { value: 'ST', label: 'Soporte' },
  { value: 'AD', label: 'Administración' },
  { value: 'RH', label: 'Recursos Humanos' },
  { value: 'VT', label: 'Ventas' },
]

export function CrearEncuestaModal({ onClose, categoriaFija }: { onClose: () => void; categoriaFija?: 'satisfaccion' }) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const defaultFechaFin = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return {
      titulo: '', descripcion: '', fechaInicio: today, fechaFin: defaultFechaFin,
      estado: 'activa' as 'activa' | 'borrador',
      publicarEn: 'encuestas' as 'encuestas' | 'noticias' | 'ambas',
      visibilidad: 'general' as 'general' | 'areas',
      areas: [] as string[],
      tipoAcceso: 'privada' as 'privada' | 'publica',
      categoria: (categoriaFija ?? '') as '' | 'satisfaccion',
    }
  })
  const [preguntas, setPreguntas] = useState<PreguntaDraft[]>([
    { id: 0, texto: '', tipo: 'texto', opciones: '' },
  ])
  const [linkCreado, setLinkCreado] = useState<string | null>(null)

  const addPregunta = () => setPreguntas([...preguntas, { id: 0, texto: '', tipo: 'texto', opciones: '' }])
  const removePregunta = (i: number) => setPreguntas(preguntas.filter((_, idx) => idx !== i))
  const updatePregunta = (i: number, patch: Partial<PreguntaDraft>) =>
    setPreguntas(preguntas.map((p, idx) => idx === i ? { ...p, ...patch } : p))

  const toggleArea = (v: string) =>
    setForm((f) => ({ ...f, areas: f.areas.includes(v) ? f.areas.filter((a) => a !== v) : [...f.areas, v] }))

  const crear = useMutation({
    mutationFn: () => encuestasService.create({
      titulo: form.titulo,
      descripcion: form.descripcion,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      estado: form.estado,
      publicarEn: form.publicarEn,
      visibilidad: form.visibilidad === 'general' ? 'general' : form.areas,
      tipoAcceso: form.tipoAcceso,
      categoria: form.categoria || undefined,
      creadoPor: user?.id,
      preguntas: preguntas.map((p) => ({
        texto: p.texto,
        tipo: p.tipo,
        opciones: p.tipo === 'opcion_multiple'
          ? p.opciones.split('\n').map((o, idx) => ({ texto: o.trim(), orden: idx + 1 })).filter((o) => o.texto)
          : [],
      })),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['encuestas-admin'] })
      toast.success('Encuesta creada')
      if (data.tipoAcceso === 'publica' && data.slugPublico) {
        setLinkCreado(`${window.location.origin}/encuesta/${data.slugPublico}`)
      } else {
        onClose()
      }
    },
    onError: () => toast.error('Error al crear encuesta'),
  })

  const canSave = form.titulo.trim() && form.fechaInicio && form.fechaFin
    && preguntas.every((p) => p.texto.trim())
    && (form.tipoAcceso === 'publica' || form.visibilidad === 'general' || form.areas.length > 0)

  if (linkCreado) {
    return (
      <Modal isOpen onClose={onClose} title="Encuesta pública creada" size="sm">
        <div className="space-y-4 text-center py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
            <Globe2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm text-gray-600">Comparte este enlace para que cualquier persona pueda responder, sin necesidad de iniciar sesión.</p>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <input readOnly value={linkCreado} className="flex-1 bg-transparent text-xs text-gray-700 outline-none" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => { navigator.clipboard.writeText(linkCreado); toast.success('Enlace copiado') }}
              className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-brand/90 transition-colors flex-shrink-0"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
          <Button onClick={onClose} className="w-full">Listo</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Nueva encuesta" size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {/* ── Tipo de encuesta ── */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de encuesta</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm({ ...form, tipoAcceso: 'privada' })}
              className={clsx(
                'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
                form.tipoAcceso === 'privada' ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand/30',
              )}>
              <span className="flex items-center gap-1.5 text-[0.78rem] font-bold text-gray-800"><Lock className="h-3.5 w-3.5 text-brand" /> Privada</span>
              <span className="text-[0.68rem] text-gray-400">Solo usuarios de la intranet, con sesión iniciada</span>
            </button>
            <button type="button" onClick={() => setForm({ ...form, tipoAcceso: 'publica' })}
              className={clsx(
                'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
                form.tipoAcceso === 'publica' ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand/30',
              )}>
              <span className="flex items-center gap-1.5 text-[0.78rem] font-bold text-gray-800"><Globe2 className="h-3.5 w-3.5 text-brand" /> Pública</span>
              <span className="text-[0.68rem] text-gray-400">Cualquiera con el enlace, sin necesidad de sesión</span>
            </button>
          </div>
        </div>

        {/* Datos generales */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="field" placeholder="Ej. Evaluación de clima laboral" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={2} className="field resize-none" placeholder="Opcional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
              <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
              <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                className="field" />
            </div>
          </div>

          {/* ── Categoría (opcional) ── */}
          {!categoriaFija && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría (opcional)</label>
              <div className="flex gap-2">
                {([
                  { v: '' as const, label: 'Ninguna' },
                  { v: 'satisfaccion' as const, label: '😊 Satisfacción' },
                ]).map((opt) => (
                  <button key={opt.v} type="button" onClick={() => setForm({ ...form, categoria: opt.v })}
                    className={clsx(
                      'rounded-xl border-2 px-3 py-1.5 text-[0.75rem] font-semibold transition-all',
                      form.categoria === opt.v ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-brand/30',
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {form.categoria === 'satisfaccion' && (
                <p className="mt-1.5 text-[0.68rem] text-gray-400">Aparecerá también en Atención al Cliente → Satisfacción.</p>
              )}
            </div>
          )}

          {form.tipoAcceso === 'privada' && (
            <>
              {/* ── Publicar en ── (no aplica dentro de Satisfacción: siempre "Encuestas") */}
              {!categoriaFija && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">¿Dónde aparece?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: 'encuestas', label: 'Solo Encuestas', icon: '📋' },
                      { v: 'noticias',  label: 'Solo Noticias',  icon: '📰' },
                      { v: 'ambas',     label: 'Encuestas y Noticias', icon: '✨' },
                    ] as const).map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setForm({ ...form, publicarEn: opt.v })}
                        className={clsx(
                          'flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[0.7rem] font-semibold transition-all',
                          form.publicarEn === opt.v
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-gray-200 text-gray-400 hover:border-brand/30',
                        )}>
                        <span className="text-base">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Visibilidad ── (dentro de Satisfacción no se ofrece "Áreas específicas") */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">¿Quién puede ver y contestar?</label>
                {categoriaFija ? (
                  <div className="rounded-xl border-2 border-brand bg-brand/5 py-2 text-center text-[0.75rem] font-semibold text-brand">
                    Toda la empresa
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      {([
                        { v: 'general', label: 'Toda la empresa' },
                        { v: 'areas',   label: 'Áreas específicas' },
                      ] as const).map((opt) => (
                        <button key={opt.v} type="button" onClick={() => setForm({ ...form, visibilidad: opt.v })}
                          className={clsx(
                            'flex-1 rounded-xl border-2 py-2 text-[0.75rem] font-semibold transition-all',
                            form.visibilidad === opt.v
                              ? 'border-brand bg-brand/5 text-brand'
                              : 'border-gray-200 text-gray-400 hover:border-brand/30',
                          )}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {form.visibilidad === 'areas' && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {AREAS_OPTS.map((a) => (
                          <button key={a.value} type="button" onClick={() => toggleArea(a.value)}
                            className={clsx(
                              'rounded-lg border-2 py-1.5 text-[0.7rem] font-semibold transition-all',
                              form.areas.includes(a.value)
                                ? 'border-brand bg-brand/5 text-brand'
                                : 'border-gray-200 text-gray-400 hover:border-brand/30',
                            )}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ── Estado ── */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado al crear</label>
            <div className="flex gap-2">
              {(['activa', 'borrador'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm({ ...form, estado: s })}
                  className={clsx(
                    'flex-1 rounded-xl border-2 py-2 text-[0.75rem] font-semibold transition-all',
                    form.estado === s
                      ? s === 'activa' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-gray-100 text-gray-600'
                      : 'border-gray-200 text-gray-400 hover:border-gray-300',
                  )}>
                  {s === 'activa' ? '✓ Activa (visible ya)' : '○ Borrador (revisar antes)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preguntas */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Preguntas</span>
            <button onClick={addPregunta}
              className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1 transition-colors">
              <Plus className="h-3 w-3" /> Agregar
            </button>
          </div>

          <div className="space-y-3">
            {preguntas.map((p, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-[0.68rem] font-bold text-gray-400">{i + 1}.</span>
                  <input value={p.texto} onChange={(e) => updatePregunta(i, { texto: e.target.value })}
                    className="field flex-1 text-sm" placeholder="Texto de la pregunta" />
                  {preguntas.length > 1 && (
                    <button onClick={() => removePregunta(i)}
                      className="mt-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2 pl-4">
                  {([
                    { v: 'texto', label: 'Abierta' },
                    { v: 'opcion_multiple', label: 'Cerrada (opciones)' },
                  ] as const).map((t) => (
                    <button key={t.v} onClick={() => updatePregunta(i, { tipo: t.v })}
                      className={clsx(
                        'rounded-lg px-2 py-1 text-[0.68rem] font-semibold border transition-colors',
                        p.tipo === t.v ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-500 hover:border-brand/30',
                      )}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {p.tipo === 'opcion_multiple' && (
                  <div className="pl-4">
                    <textarea value={p.opciones} onChange={(e) => updatePregunta(i, { opciones: e.target.value })}
                      rows={3} className="field resize-none text-xs"
                      placeholder={'Una opción por línea:\nMuy bueno\nBueno\nRegular'} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-card pb-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!canSave} onClick={() => crear.mutate()}>
            Crear encuesta
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════
   MODAL ASIGNAR POR ÁREA (admin)
══════════════════════════════════════ */
const AREAS = [
  { value: 'CC', label: 'Call Center', color: 'bg-blue-100 text-blue-700' },
  { value: 'TI', label: 'Tecnología', color: 'bg-purple-100 text-purple-700' },
  { value: 'ST', label: 'Soporte', color: 'bg-amber-100 text-amber-700' },
  { value: 'AD', label: 'Administración', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'RH', label: 'Recursos Humanos', color: 'bg-pink-100 text-pink-700' },
  { value: 'VT', label: 'Ventas', color: 'bg-orange-100 text-orange-700' },
]

function AsignarModal({ encuesta, onClose }: { encuesta: Encuesta; onClose: () => void }) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)

  const { data: conteos = {} as Record<string, number>, isLoading } = useQuery({
    queryKey: ['usuarios-por-area'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.data ?? [])
      const counts: Record<string, number> = {}
      for (const u of list) {
        const tipo = String(u['tipoUsuario'] ?? u['TIPO_USUARIO'] ?? '').toUpperCase()
        if (tipo) counts[tipo] = (counts[tipo] ?? 0) + 1
      }
      return counts
    },
  })

  const asignar = useMutation({
    mutationFn: () => api.post(`/encuestas/${encuesta.id}/asignar-area`, {
      area: selectedArea,
      asignadoPor: user?.id,
    }),
    onSuccess: (res) => {
      const d = res.data as { asignados?: number; total?: number }
      qc.invalidateQueries({ queryKey: ['encuestas-admin'] })
      toast.success(`Asignado a ${d.asignados ?? d.total ?? '?'} usuario${(d.asignados ?? 1) !== 1 ? 's' : ''}`)
      onClose()
    },
    onError: () => toast.error('Error al asignar'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Asignar: ${encuesta.titulo}`} size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Selecciona el área que recibirá esta encuesta. Todos los usuarios activos del área serán notificados.</p>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {AREAS.map((a) => {
              const count = conteos[a.value] ?? 0
              const isSelected = selectedArea === a.value
              return (
                <button
                  key={a.value}
                  onClick={() => setSelectedArea(isSelected ? null : a.value)}
                  className={clsx(
                    'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
                    isSelected
                      ? 'border-brand bg-brand/5 shadow-sm'
                      : 'border-gray-100 hover:border-brand/30 bg-card',
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className={clsx('rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold', a.color)}>{a.value}</span>
                    {isSelected && (
                      <div className="h-3.5 w-3.5 rounded-full bg-brand flex items-center justify-center">
                        <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-[0.78rem] font-semibold text-gray-800">{a.label}</p>
                  <p className="text-[0.65rem] text-gray-400">{count} usuario{count !== 1 ? 's' : ''}</p>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <span className="text-xs text-gray-400">
            {selectedArea
              ? `${conteos[selectedArea] ?? 0} usuario${(conteos[selectedArea] ?? 0) !== 1 ? 's' : ''} recibirán la encuesta`
              : 'Selecciona un área'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button isLoading={asignar.isPending} disabled={!selectedArea} onClick={() => asignar.mutate()}>
              <Send className="h-3.5 w-3.5" /> Asignar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════
   MODAL EDITAR BORRADOR
══════════════════════════════════════ */
export function EditarEncuestaModal({ encuesta, onClose }: { encuesta: Encuesta; onClose: () => void }) {
  const qc = useQueryClient()

  // Cargar preguntas completas del borrador
  const { data: enc, isLoading } = useQuery({
    queryKey: ['encuesta-detalle', encuesta.id],
    queryFn: async () => {
      const { data } = await api.get(`/encuestas/${encuesta.id}`)
      return data?.data ?? data
    },
  })

  const rawPregs: PreguntaDraft[] = (enc?.preguntas ?? []).map((p: Record<string, unknown>) => ({
    id: Number(p['EPR_ID'] ?? p['id'] ?? p['preguntaId'] ?? 0),
    texto: String(p['EPR_TEXTO'] ?? p['texto'] ?? ''),
    tipo: String(p['EPR_TIPO'] ?? p['tipo'] ?? 'texto').toLowerCase()
      .replace('abierta', 'texto').replace('cerrada', 'opcion_multiple') as Pregunta['tipo'],
    opciones: Array.isArray(p['opciones'])
      ? (p['opciones'] as Record<string, unknown>[]).map((o) => String(o['EOP_TEXTO'] ?? o['texto'] ?? o)).join('\n')
      : '',
  }))

  const parseVisibilidad = (v?: string): { tipo: 'general' | 'areas'; areas: string[] } => {
    if (!v || v === 'general') return { tipo: 'general', areas: [] }
    try { const a = JSON.parse(v); return Array.isArray(a) ? { tipo: 'areas', areas: a } : { tipo: 'general', areas: [] } } catch { return { tipo: 'general', areas: [] } }
  }
  const visInit = parseVisibilidad(encuesta.visibilidad)

  const [form, setForm] = useState({
    titulo: encuesta.titulo,
    descripcion: encuesta.descripcion,
    fechaInicio: encuesta.fechaInicio ?? new Date().toISOString().slice(0, 10),
    fechaFin: encuesta.fechaFin ?? new Date().toISOString().slice(0, 10),
    publicarEn: (encuesta.publicarEn ?? 'encuestas') as 'encuestas' | 'noticias' | 'ambas',
    visibilidad: visInit.tipo,
    areas: visInit.areas,
  })
  const [preguntas, setPreguntas] = useState<PreguntaDraft[]>(rawPregs.length ? rawPregs : [{ id: 0, texto: '', tipo: 'texto', opciones: '' }])

  // Sync preguntas cuando carguen del servidor
  const [synced, setSynced] = useState(false)
  if (!synced && rawPregs.length > 0) { setPreguntas(rawPregs); setSynced(true) }

  const addPregunta = () => setPreguntas([...preguntas, { id: 0, texto: '', tipo: 'texto', opciones: '' }])
  const removePregunta = (i: number) => setPreguntas(preguntas.filter((_, idx) => idx !== i))
  const updatePregunta = (i: number, patch: Partial<PreguntaDraft>) =>
    setPreguntas(preguntas.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const toggleArea = (v: string) =>
    setForm((f) => ({ ...f, areas: f.areas.includes(v) ? f.areas.filter((a) => a !== v) : [...f.areas, v] }))

  const guardar = useMutation({
    mutationFn: () => api.put(`/encuestas/${encuesta.id}`, {
      titulo: form.titulo,
      descripcion: form.descripcion,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      publicarEn: form.publicarEn,
      visibilidad: form.visibilidad === 'general' ? 'general' : form.areas,
      preguntas: preguntas.map((p) => ({
        id: p.id ?? 0,
        texto: p.texto,
        tipo: p.tipo,
        opciones: p.tipo === 'opcion_multiple'
          ? p.opciones.split('\n').map((o, idx) => ({ id: 0, texto: o.trim(), orden: idx + 1 })).filter((o) => o.texto)
          : [],
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['encuestas-admin'] })
      toast.success('Encuesta actualizada')
      onClose()
    },
    onError: () => toast.error('Error al guardar'),
  })

  const esSatisfaccion = encuesta.categoria === 'satisfaccion'

  const canSave = form.titulo.trim() && form.fechaInicio && form.fechaFin
    && preguntas.every((p) => p.texto.trim())
    && (form.visibilidad === 'general' || form.areas.length > 0)

  return (
    <Modal isOpen onClose={onClose} title="Editar encuesta" size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />)}</div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="field" autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} className="field resize-none" placeholder="Opcional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
                  <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} className="field" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
                  <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} className="field" />
                </div>
              </div>
              {!esSatisfaccion && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">¿Dónde aparece?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ v: 'encuestas', label: 'Solo Encuestas', icon: '📋' }, { v: 'noticias', label: 'Solo Noticias', icon: '📰' }, { v: 'ambas', label: 'Ambos', icon: '✨' }] as const).map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setForm({ ...form, publicarEn: opt.v })}
                        className={clsx('flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[0.7rem] font-semibold transition-all',
                          form.publicarEn === opt.v ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-brand/30')}>
                        <span>{opt.icon}</span>{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">¿Quién puede ver?</label>
                {esSatisfaccion ? (
                  <div className="rounded-xl border-2 border-brand bg-brand/5 py-2 text-center text-[0.75rem] font-semibold text-brand">
                    Toda la empresa
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      {([{ v: 'general', label: 'Toda la empresa' }, { v: 'areas', label: 'Áreas específicas' }] as const).map((opt) => (
                        <button key={opt.v} type="button" onClick={() => setForm({ ...form, visibilidad: opt.v })}
                          className={clsx('flex-1 rounded-xl border-2 py-2 text-[0.75rem] font-semibold transition-all',
                            form.visibilidad === opt.v ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-brand/30')}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {form.visibilidad === 'areas' && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {AREAS_OPTS.map((a) => (
                          <button key={a.value} type="button" onClick={() => toggleArea(a.value)}
                            className={clsx('rounded-lg border-2 py-1.5 text-[0.7rem] font-semibold transition-all',
                              form.areas.includes(a.value) ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-brand/30')}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Preguntas</span>
                <button onClick={addPregunta} className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1 transition-colors">
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>
              <div className="space-y-3">
                {preguntas.map((p, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-[0.68rem] font-bold text-gray-400">{i + 1}.</span>
                      <input value={p.texto} onChange={(e) => updatePregunta(i, { texto: e.target.value })} className="field flex-1 text-sm" placeholder="Texto de la pregunta" />
                      {preguntas.length > 1 && (
                        <button onClick={() => removePregunta(i)} className="mt-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 pl-4">
                      {([
                        { v: 'texto', label: 'Abierta' },
                        { v: 'opcion_multiple', label: 'Cerrada (opciones)' },
                      ] as const).map((t) => (
                        <button key={t.v} onClick={() => updatePregunta(i, { tipo: t.v })}
                          className={clsx('rounded-lg px-2 py-1 text-[0.68rem] font-semibold border transition-colors',
                            p.tipo === t.v ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-500 hover:border-brand/30')}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {p.tipo === 'opcion_multiple' && (
                      <div className="pl-4">
                        <textarea value={p.opciones} onChange={(e) => updatePregunta(i, { opciones: e.target.value })}
                          rows={3} className="field resize-none text-xs" placeholder={'Una opción por línea:\nMuy bueno\nBueno\nRegular'} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-card pb-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave || isLoading} onClick={() => guardar.mutate()}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════
   RESULTADOS DE ENCUESTA
══════════════════════════════════════ */
export function ResultadosModal({ encuesta, onClose }: { encuesta: { id: number; titulo: string }; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['encuesta-resultados-separados', encuesta.id],
    queryFn: () => encuestasService.getResultadosSeparados(encuesta.id),
  })

  const sinDatos = !data || (data.cerradas.length === 0 && data.abiertas.length === 0)

  return (
    <Modal isOpen onClose={onClose} title={`Resultados — ${encuesta.titulo}`} size="lg">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 p-4 animate-pulse">
              <div className="h-3 w-48 rounded-lg bg-gray-100 mb-3" />
              <div className="h-2 w-full rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : sinDatos ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <ClipboardList className="h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">Sin respuestas aún</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {data!.cerradas.map((p) => <PreguntaCerradaChart key={p.preguntaId} pregunta={p} />)}
          {data!.abiertas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-brand" />
                <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Preguntas abiertas</span>
              </div>
              {data!.abiertas.map((p) => <PreguntaAbiertaTabla key={p.preguntaId} pregunta={p} />)}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ══════════════════════════════════════
   VISTA ADMIN — gestión de encuestas
══════════════════════════════════════ */
function AdminEncuestasView() {
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [asignando, setAsignando] = useState<Encuesta | null>(null)
  const [editando, setEditando] = useState<Encuesta | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<number | null>(null)
  const [confirmCerrar, setConfirmCerrar] = useState<number | null>(null)
  const [vista, setVista] = useState<'lista' | 'dashboard'>('lista')
  const [verResultados, setVerResultados] = useState<Encuesta | null>(null)

  const { data: encuestas = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['encuestas-admin'],
    queryFn: async () => {
      const { data } = await api.get('/encuestas')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.encuestas ?? [])
      return (list as Record<string, unknown>[]).map(parseEncuesta)
    },
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/encuestas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['encuestas-admin'] }); toast.success('Encuesta eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  const cerrar = useMutation({
    mutationFn: (id: number) => api.patch(`/encuestas/${id}/cerrar`, { estado: 'cerrada' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['encuestas-admin'] }); toast.success('Encuesta cerrada') },
    onError: () => toast.error('Error al cerrar'),
  })

  const activar = useMutation({
    mutationFn: (id: number) => api.put(`/encuestas/${id}/estado`, { nuevoEstado: 'activa' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['encuestas-admin'] }); toast.success('Encuesta activada') },
    onError: () => toast.error('Error al activar'),
  })

  const ESTADO_STYLE: Record<string, string> = {
    activa:   'bg-emerald-100 text-emerald-700',
    borrador: 'bg-gray-100 text-gray-500',
    cerrada:  'bg-red-100 text-red-600',
  }

  const fmtDate = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full bg-brand" />
          <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">
            {encuestas.length} encuesta{encuestas.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
            <button
              onClick={() => setVista('lista')}
              className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-[0.7rem] font-semibold transition-colors', vista === 'lista' ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-100')}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              onClick={() => setVista('dashboard')}
              className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-[0.7rem] font-semibold transition-colors', vista === 'dashboard' ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-100')}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </button>
          </div>
          <button onClick={() => refetch()}
            className={clsx('flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors', isRefetching && 'animate-spin')}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <Button onClick={() => setShowCrear(true)} className="text-[0.78rem] py-1.5 px-3">
            <Plus className="h-3.5 w-3.5" /> Nueva encuesta
          </Button>
        </div>
      </div>

      {vista === 'dashboard' ? (
        <EncuestasDashboard />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-48 rounded-lg bg-gray-100 mb-2" />
              <div className="h-3 w-32 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : encuestas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <ClipboardList className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin encuestas</p>
            <p className="text-xs text-gray-400 mt-0.5">Crea tu primera encuesta con el botón de arriba</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {encuestas.map((e) => (
            <div key={e.id} className="card p-4 group">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[0.85rem] font-semibold text-gray-900 truncate">{e.titulo}</p>
                    <span className={clsx('chip text-[0.65rem]', ESTADO_STYLE[e.estado] ?? ESTADO_STYLE['borrador'])}>
                      {e.estado}
                    </span>
                    {e.publicarEn && e.publicarEn !== 'encuestas' && (
                      <span className="chip bg-indigo-100 text-indigo-700 text-[0.65rem]">
                        {e.publicarEn === 'noticias' ? '📰 Noticias' : '✨ Encuestas+Noticias'}
                      </span>
                    )}
                    {e.visibilidad && e.visibilidad !== 'general' && (
                      <span className="chip bg-amber-100 text-amber-700 text-[0.65rem]">
                        {(() => { try { const a = JSON.parse(e.visibilidad!); return Array.isArray(a) ? a.join(', ') : e.visibilidad } catch { return e.visibilidad } })()}
                      </span>
                    )}
                  </div>
                  {e.descripcion && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.descripcion}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {(e.fechaInicio || e.fechaFin) && (
                      <span className="flex items-center gap-1 text-[0.65rem] text-gray-400">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(e.fechaInicio)} → {fmtDate(e.fechaFin)}
                      </span>
                    )}
                    <span className="text-[0.65rem] text-gray-400">
                      {e.totalPreguntas ?? e.preguntas.length} pregunta{(e.totalPreguntas ?? e.preguntas.length) !== 1 ? 's' : ''}
                    </span>
                    {e.totalAsignados !== undefined && (
                      <span className="flex items-center gap-1 text-[0.65rem] text-gray-400">
                        <Users className="h-3 w-3" /> {e.totalAsignados} asignado{e.totalAsignados !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {e.estado === 'borrador' && (
                    <>
                      <button
                        onClick={() => setEditando(e)}
                        className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[0.7rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      <button
                        onClick={() => activar.mutate(e.id)}
                        disabled={activar.isPending}
                        className="flex items-center gap-1 rounded-lg border border-emerald-400 px-2.5 py-1.5 text-[0.7rem] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" /> Activar
                      </button>
                    </>
                  )}
                  {e.estado === 'activa' && (
                    <>
                      <button
                        onClick={() => setEditando(e)}
                        className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[0.7rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      <button
                        onClick={() => setAsignando(e)}
                        className="flex items-center gap-1 rounded-lg border border-brand/30 px-2.5 py-1.5 text-[0.7rem] font-semibold text-brand hover:bg-brand/8 transition-colors"
                      >
                        <Users className="h-3 w-3" /> Asignar
                      </button>
                      <button
                        onClick={() => setConfirmCerrar(e.id)}
                        className="flex items-center gap-1 rounded-lg border border-amber-300 px-2.5 py-1.5 text-[0.7rem] font-semibold text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <XCircle className="h-3 w-3" /> Cerrar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setVerResultados(e)}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[0.7rem] font-semibold text-gray-600 hover:border-brand hover:text-brand transition-colors"
                  >
                    <BarChart3 className="h-3 w-3" /> Resultados
                  </button>
                  <div className="mx-1 h-5 w-px bg-gray-200 flex-shrink-0" />
                  <button
                    onClick={() => setConfirmEliminar(e.id)}
                    title="Eliminar encuesta"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCrear && <CrearEncuestaModal onClose={() => setShowCrear(false)} />}
      {asignando && <AsignarModal encuesta={asignando} onClose={() => setAsignando(null)} />}
      {editando && <EditarEncuestaModal encuesta={editando} onClose={() => setEditando(null)} />}
      {verResultados && <ResultadosModal encuesta={verResultados} onClose={() => setVerResultados(null)} />}

      <ConfirmDialog
        isOpen={confirmCerrar !== null}
        onClose={() => setConfirmCerrar(null)}
        onConfirm={() => { if (confirmCerrar !== null) cerrar.mutate(confirmCerrar) }}
        title="Cerrar encuesta"
        message="¿Cerrar esta encuesta? Los usuarios ya no podrán responderla."
        confirmLabel="Cerrar"
        isPending={cerrar.isPending}
      />

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar !== null) eliminar.mutate(confirmEliminar) }}
        title="Eliminar encuesta"
        message="¿Seguro que deseas eliminar esta encuesta? Se perderán todas las respuestas asociadas."
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}

/* ══════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════ */
export function EncuestasPage() {
  const [respondiendo, setRespondiendo] = useState<Encuesta | null>(null)
  const [vistaAdmin, setVistaAdmin] = useState(false)
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  const isTI = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')

  const { data: encuestas = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['encuestas'],
    queryFn: async () => {
      const { data } = await api.get(`/encuestas/usuario/${user?.id}`)
      const list = Array.isArray(data) ? data : (data?.data ?? data?.encuestas ?? [])
      return (list as Record<string, unknown>[]).map(parseEncuesta)
    },
    enabled: !!user?.id && !vistaAdmin,
  })

  if (respondiendo) {
    const encuestaActual = respondiendo
    return (
      <div className="max-w-2xl mx-auto">
        <ResponderEncuesta
          encuesta={encuestaActual}
          onSubmit={(respuestas) => encuestasService.responder(encuestaActual.id, encuestaActual.asignacionId, { respuestas })}
          onDone={() => {
            setRespondiendo(null)
            qc.invalidateQueries({ queryKey: ['encuestas'] })
            toast.success('Encuesta respondida')
          }}
        />
      </div>
    )
  }

  const pendientes  = encuestas.filter((e) => !e.respondida && e.estado !== 'cerrada')
  const completadas = encuestas.filter((e) => e.respondida)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Encuestas</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {vistaAdmin ? 'Administración de encuestas' : `${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''} · ${completadas.length} completada${completadas.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!vistaAdmin && (
                <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              {isTI && (
                <button
                  onClick={() => setVistaAdmin(!vistaAdmin)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.72rem] font-semibold transition-colors',
                    vistaAdmin ? 'bg-card text-brand' : 'bg-white/10 text-white/80 hover:bg-white/20',
                  )}
                >
                  {vistaAdmin ? <ChevronLeft className="h-3.5 w-3.5" /> : <Settings className="h-3.5 w-3.5" />}
                  {vistaAdmin ? 'Mis encuestas' : 'Administrar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido según vista ── */}
      {vistaAdmin ? (
        <AdminEncuestasView />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-48 rounded-lg bg-gray-100 mb-2" />
              <div className="h-3 w-64 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : encuestas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <ClipboardList className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin encuestas</p>
            <p className="text-xs text-gray-400 mt-0.5">No tienes encuestas asignadas</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {pendientes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-amber-500" />
                <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Pendientes</span>
                <span className="chip bg-amber-100 text-amber-700 text-[0.65rem]">{pendientes.length}</span>
              </div>
              {pendientes.map((e) => (
                <div key={e.id} className="card p-4 flex items-center justify-between gap-4 hover:shadow-card-md transition-shadow">
                  <div className="min-w-0">
                    <p className="text-[0.85rem] font-semibold text-gray-900 truncate">{e.titulo}</p>
                    {e.descripcion && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.descripcion}</p>}
                    <p className="text-[0.65rem] text-gray-400 mt-1">{e.preguntas.length} pregunta{e.preguntas.length !== 1 ? 's' : ''}</p>
                  </div>
                  <Button size="sm" onClick={() => setRespondiendo(e)} className="flex-shrink-0">Responder</Button>
                </div>
              ))}
            </section>
          )}

          {completadas.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-emerald-500" />
                <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Completadas</span>
              </div>
              {completadas.map((e) => (
                <div key={e.id} className="card p-4 flex items-center gap-3 opacity-70">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-[0.82rem] font-medium text-gray-700">{e.titulo}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
