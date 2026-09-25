import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Layers, Loader2, Megaphone, Plug, FileText, Tags, UserCog, Rocket, BarChart3, X,
} from 'lucide-react'
import { ccService } from '@/services/cc.service'
import { REPORTES_CAMPANIA } from '@/pages/suite-reportes/reportesCampania'
import {
  AsignacionSupervisores, CanalesDeCampaniaPanel, FormularioYMarcadorPanel, SkillsDeCampaniaPanel, TipificacionesDeCampaniaPanel,
} from './ContactCenterTabs'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'

// Identificador público a partir del nombre (el backend lo vuelve a normalizar).
const slugDe = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

const PASOS = [
  { key: 'campania', titulo: 'Campaña', desc: 'Nombre y cómo se asignan las conversaciones', icon: Megaphone },
  { key: 'skills', titulo: 'Skills y agentes', desc: 'Grupos de atención y quién está en cada uno', icon: Layers },
  { key: 'canales', titulo: 'Canales', desc: 'WhatsApp, Messenger, Instagram o web', icon: Plug },
  { key: 'formulario', titulo: 'Formulario y marcador', desc: 'Qué se captura y la URL para VICIdial', icon: FileText },
  { key: 'tipificaciones', titulo: 'Tipificaciones', desc: 'Cómo se clasifica cada atención', icon: Tags },
  { key: 'supervisores', titulo: 'Supervisores', desc: 'Quién supervisa toda la campaña', icon: UserCog },
  { key: 'listo', titulo: 'Listo', desc: 'Resumen y reportes', icon: Rocket },
] as const
type PasoKey = typeof PASOS[number]['key']

// Asistente para dar de alta una campaña de principio a fin. Reutiliza los
// mismos paneles de la ficha de campaña (Configuración → Contact Center →
// Campañas y skills), así que todo lo que se hace aquí se ve igual allá.
export function AsistenteCampania({ onSalir }: { onSalir: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [paso, setPaso] = useState(0)
  const [campaniaId, setCampaniaId] = useState<number | null>(null)
  const [datos, setDatos] = useState({ nombre: '', slug: '', slugTocado: false, modoAsignacion: 'global' })

  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias(), enabled: campaniaId != null })
  const campania = campanias.find((c) => c.id === campaniaId) ?? (campaniaId ? { id: campaniaId, nombre: datos.nombre } : null)
  const { data: canalesTodos = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales(), enabled: campaniaId != null })
  const canales = canalesTodos.filter((c) => c.campaniaId === campaniaId)
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos', campaniaId], queryFn: () => ccService.getGrupos(campaniaId!), enabled: campaniaId != null })
  const { data: forms } = useQuery({
    queryKey: ['cc-campania-formularios', campaniaId],
    queryFn: () => ccService.getFormulariosDeCampania(campaniaId!),
    enabled: campaniaId != null,
  })
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-campanias'] }); qc.invalidateQueries({ queryKey: ['cc-grupos-all'] }) }

  const slugFinal = datos.slugTocado ? datos.slug : slugDe(datos.nombre)
  const guardarCampania = useMutation({
    mutationFn: async () => {
      let id = campaniaId
      if (!id) {
        const r = await ccService.createCampania({ nombre: datos.nombre.trim() })
        id = r?.data?.id as number
        if (!id) throw new Error('No se pudo crear la campaña')
        setCampaniaId(id)
      }
      await ccService.updateCampania(id, { nombre: datos.nombre.trim(), slug: slugFinal || undefined, modoAsignacion: datos.modoAsignacion })
      return id
    },
    onSuccess: () => {
      inval()
      toast.success(campaniaId ? 'Campaña actualizada' : 'Campaña creada')
      setPaso(1)
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Error al guardar la campaña'),
  })

  const actual = PASOS[paso]
  const bloqueado = (i: number) => i > 0 && campaniaId == null

  // Estado de cada paso para el resumen y el indicador.
  const agentesCount = campanias.find((c) => c.id === campaniaId)?.agentesCount ?? 0
  const completo: Record<PasoKey, boolean> = {
    campania: campaniaId != null,
    skills: grupos.length > 0 && agentesCount > 0,
    canales: canales.length > 0,
    formulario: (forms?.formularios.length ?? 0) > 0,
    tipificaciones: false, // opcional, sin conteo barato
    supervisores: false,
    listo: false,
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Encabezado */}
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={onSalir} title="Salir del asistente"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Configurar nueva campaña</p>
          <h2 className="truncate text-base font-bold text-ink">{campania?.nombre || 'Campaña nueva'}</h2>
        </div>
        <span className="flex-shrink-0 text-[0.72rem] text-ink-tertiary">Paso {paso + 1} de {PASOS.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        {/* Pasos */}
        <nav className={clsx(card, 'h-fit space-y-1 !p-3')}>
          {PASOS.map((p, i) => {
            const activo = i === paso
            const hecho = completo[p.key]
            return (
              <button key={p.key} disabled={bloqueado(i)} onClick={() => setPaso(i)}
                className={clsx('flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                  activo ? 'bg-violet-50' : 'hover:bg-gray-50')}>
                <span className={clsx('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold',
                  hecho ? 'bg-emerald-500 text-white' : activo ? 'bg-violet-600 text-white' : 'bg-gray-100 text-ink-tertiary')}>
                  {hecho ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={clsx('block text-[0.8rem] font-semibold', activo ? 'text-violet-700' : 'text-ink')}>{p.titulo}</span>
                  <span className="block text-[0.66rem] leading-snug text-ink-tertiary">{p.desc}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* Contenido del paso */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2.5 px-1">
            <actual.icon className="h-5 w-5 text-violet-600" />
            <div>
              <p className="text-sm font-bold text-ink">{actual.titulo}</p>
              <p className="text-[0.72rem] text-ink-tertiary">{actual.desc}</p>
            </div>
          </div>

          {actual.key === 'campania' && (
            <div className={clsx(card, 'space-y-4')}>
              <label className="block">
                <span className={label}>Nombre de la campaña</span>
                <input autoFocus className={field} value={datos.nombre} placeholder="Ej. Reclutamiento Totis"
                  onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>Identificador público (para la URL del marcador)</span>
                  <input className={field} value={slugFinal} placeholder="ej. totis"
                    onChange={(e) => setDatos({ ...datos, slug: e.target.value, slugTocado: true })} />
                  <span className="mt-0.5 block text-[0.65rem] text-gray-400">/formulario-publico/c/{slugFinal || '…'}</span>
                </label>
                <label className="block">
                  <span className={label}>Asignación de conversaciones</span>
                  <select className={field} value={datos.modoAsignacion} onChange={(e) => setDatos({ ...datos, modoAsignacion: e.target.value })}>
                    <option value="global">Seguir la configuración global</option>
                    <option value="auto">Automática — el sistema asigna a un agente</option>
                    <option value="manual">Manual — los agentes jalan de la cola</option>
                  </select>
                </label>
              </div>
              <div className="flex justify-end">
                <button onClick={() => guardarCampania.mutate()} disabled={!datos.nombre.trim() || guardarCampania.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
                  {guardarCampania.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {campaniaId ? 'Guardar y continuar' : 'Crear campaña y continuar'}
                </button>
              </div>
            </div>
          )}

          {campania && actual.key === 'skills' && <SkillsDeCampaniaPanel campania={campania} onChanged={inval} />}
          {campania && actual.key === 'canales' && <CanalesDeCampaniaPanel campania={campania} canales={canales} onChanged={inval} />}
          {campania && actual.key === 'formulario' && <FormularioYMarcadorPanel campania={campania} onIrAContacto={() => setPaso(0)} />}
          {campania && actual.key === 'tipificaciones' && <TipificacionesDeCampaniaPanel campania={campania} />}
          {campania && actual.key === 'supervisores' && (
            <div className={card}>
              <p className="mb-3 text-xs text-ink-tertiary">
                Supervisores de toda la campaña: ven todos sus skills. Para uno acotado a un solo skill, asígnalo en "Skills y agentes".
              </p>
              <AsignacionSupervisores nivel="campania" id={campania.id} onChanged={inval} />
            </div>
          )}

          {campania && actual.key === 'listo' && (
            <div className="space-y-4">
              <div className={card}>
                <p className="mb-3 text-sm font-bold text-ink">Resumen de "{campania.nombre}"</p>
                <div className="space-y-2">
                  {[
                    { ok: completo.skills, txt: `${grupos.length} skill(s) con ${agentesCount} agente(s)`, falta: 'Faltan skills o agentes', paso: 1 },
                    { ok: completo.canales, txt: `${canales.length} canal(es): ${canales.map((c) => c.nombre).join(', ')}`, falta: 'Sin canales', paso: 2 },
                    { ok: completo.formulario, txt: `${forms?.formularios.length ?? 0} formulario(s): ${(forms?.formularios ?? []).map((f) => f.nombre).join(', ')}`, falta: 'Sin formulario asignado', paso: 3 },
                    {
                      ok: !!forms?.marcador.formularioId,
                      txt: `Marcador abre "${forms?.formularios.find((f) => f.id === forms?.marcador.formularioId)?.nombre ?? ''}"`,
                      falta: 'El marcador aún no abre ningún formulario (opcional)', paso: 3,
                    },
                  ].map((x, i) => (
                    <button key={i} onClick={() => setPaso(x.paso)} className="flex w-full items-center gap-2.5 rounded-xl border border-gray-100 px-3.5 py-2.5 text-left transition hover:bg-gray-50">
                      {x.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 flex-shrink-0 text-amber-400" />}
                      <span className={clsx('text-sm', x.ok ? 'text-ink' : 'text-amber-700')}>{x.ok ? x.txt : x.falta}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="mb-3 flex items-center gap-2.5">
                  <BarChart3 className="h-4 w-4 text-violet-600" />
                  <p className="text-sm font-bold text-ink">Reportes (ya creados automáticamente)</p>
                </div>
                <p className="mb-3 text-[0.72rem] text-ink-tertiary">En la Suite de reportes → carpeta "Campañas" → {campania.nombre}.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {REPORTES_CAMPANIA.map((r) => (
                    <button key={r.id} onClick={() => navigate(`/operaciones/suite-reportes?campania=${campania.id}&reporte=${r.id}`)}
                      className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:border-violet-200 hover:bg-violet-50/40">
                      <r.icon className="h-4 w-4 flex-shrink-0 text-violet-500" /> {r.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <p className="px-1 text-[0.72rem] text-ink-tertiary">
                Después puedes cambiar cualquier cosa en Configuración → Contact Center → Campañas y skills → {campania.nombre}.
              </p>
            </div>
          )}

          {/* Navegación */}
          {paso > 0 && (
            <div className="flex items-center justify-between">
              <button onClick={() => setPaso(paso - 1)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:bg-gray-50">
                <ArrowLeft className="h-4 w-4" /> Anterior
              </button>
              {paso < PASOS.length - 1 ? (
                <button onClick={() => setPaso(paso + 1)}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700">
                  Siguiente <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={onSalir}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                  <Check className="h-4 w-4" /> Terminar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
