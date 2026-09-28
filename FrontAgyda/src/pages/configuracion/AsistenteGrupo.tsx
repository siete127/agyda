import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, Check, Headset, Building2, UsersRound, Layers, UserPlus, Rocket, X, Loader2,
} from 'lucide-react'
import { gruposService } from '@/services/grupos.service'
import { ConfigGrupo, MiembrosGrupo, ClientesDelGrupo, type GuardarPendiente } from './GruposTab'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
type ErrApi = { response?: { data?: { message?: string } } }

type TipoKey = 'cc-equipos' | 'atencion-clientes'
const TIPOS: { key: TipoKey; nombre: string; desc: string; icon: typeof Headset }[] = [
  { key: 'cc-equipos', nombre: 'Contact Center', desc: 'Agentes que atienden campañas por omnicanal y/o marcador', icon: Headset },
  { key: 'atencion-clientes', nombre: 'Atención a clientes', desc: 'Lo mismo, y además atiende a sus clientes (chat del portal y avisos)', icon: Building2 },
]

// Asistente para crear un grupo de principio a fin (tarjeta de la portada de
// Configuración). Reutiliza las mismas piezas del detalle del grupo
// (Configuración → Usuarios y Seguridad → Grupos), así que todo se ve igual allá.
// Las campañas nuevas se crean desde el paso 2 con "Nuevo +".
export function AsistenteGrupo({ onSalir }: { onSalir: () => void }) {
  const qc = useQueryClient()
  const [paso, setPaso] = useState(0)
  const [tipoKey, setTipoKey] = useState<TipoKey>('cc-equipos')
  const [grupoId, setGrupoId] = useState<number | null>(null)
  const [datos, setDatos] = useState({ nombre: '', descripcion: '' })

  const { data: resumen, refetch } = useQuery({ queryKey: ['grupos-resumen'], queryFn: () => gruposService.resumen(), enabled: grupoId != null })
  const tipo = resumen?.tipos.find((t) => t.key === tipoKey) ?? null
  const grupo = tipo?.grupos.find((g) => g.id === grupoId) ?? null
  const atiende = tipoKey === 'atencion-clientes'
  // En un grupo de atención, sus agentes son los asesores de sus clientes.
  const gente = atiende ? 'Agentes (asesores)' : 'Agentes'
  // Lo pendiente del paso de campañas se guarda al avanzar.
  const guardarRef = useRef<(() => Promise<boolean>) | null>(null) as GuardarPendiente
  const [cambiando, setCambiando] = useState(false)

  const PASOS = [
    { key: 'grupo', titulo: 'Grupo', desc: 'Nombre y si atiende clientes', icon: UsersRound },
    { key: 'asignaciones', titulo: 'Campañas y skills', desc: 'Campañas (o una nueva), skills, comunicación, marcador y su link', icon: Layers },
    { key: 'personas', titulo: `Supervisores y ${gente.toLowerCase()}`, desc: 'Quién supervisa y quién trabaja en el grupo', icon: UserPlus },
    ...(atiende ? [{ key: 'clientes', titulo: 'Clientes', desc: 'A qué clientes atiende', icon: Building2 }] : []),
    { key: 'listo', titulo: 'Listo', desc: 'Resumen', icon: Rocket },
  ]
  const actual = PASOS[paso]
  const bloqueado = (i: number) => i > 0 && grupoId == null
  // Cambiar de paso guardando antes lo pendiente (si no se puede, se queda).
  const irA = async (i: number) => {
    if (i === paso) return
    if (guardarRef.current) {
      setCambiando(true)
      const ok = await guardarRef.current().finally(() => setCambiando(false))
      if (!ok) return
    }
    setPaso(i)
  }

  const crear = useMutation({
    mutationFn: async () => {
      if (grupoId) return grupoId
      const r = await gruposService.crear(tipoKey, { nombre: datos.nombre.trim(), descripcion: datos.descripcion.trim() || undefined })
      return r.data.id
    },
    onSuccess: (id) => {
      setGrupoId(id)
      qc.invalidateQueries({ queryKey: ['grupos-resumen'] })
      toast.success('Grupo creado')
      setPaso(1)
    },
    onError: (e: ErrApi) => toast.error(e?.response?.data?.message ?? 'No se pudo crear el grupo'),
  })

  const recargar = () => { refetch() }
  const n = (re: RegExp) => Number(grupo?.contexto?.match(re)?.[1] ?? 0)
  const nSupervisores = n(/(\d+) supervisor/)
  const completo: Record<string, boolean> = {
    grupo: grupoId != null,
    asignaciones: !!grupo?.contexto && !grupo.contexto.startsWith('Sin campaña'),
    personas: nSupervisores > 0 && (grupo?.miembros ?? 0) > 0,
    clientes: n(/(\d+) cliente/) > 0,
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
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear grupo</p>
          <h2 className="truncate text-base font-bold text-ink">{grupo?.nombre || datos.nombre || 'Grupo nuevo'}</h2>
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
              <button key={p.key} disabled={bloqueado(i) || cambiando} onClick={() => irA(i)}
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

          {actual.key === 'grupo' && (
            <div className={clsx(card, 'space-y-4')}>
              <div>
                <span className={label}>Tipo de grupo</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TIPOS.map(({ key, nombre, desc, icon: Icon }) => (
                    <button key={key} type="button" disabled={grupoId != null} onClick={() => setTipoKey(key)}
                      className={clsx('flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-default',
                        tipoKey === key ? 'border-violet-300 bg-violet-50' : 'border-gray-100 hover:border-gray-200')}>
                      <Icon className={clsx('mt-0.5 h-5 w-5 flex-shrink-0', tipoKey === key ? 'text-violet-600' : 'text-ink-tertiary')} />
                      <span>
                        <span className="block text-[0.85rem] font-semibold text-ink">{nombre}</span>
                        <span className="block text-[0.7rem] text-ink-tertiary">{desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className={label}>Nombre del grupo</span>
                <input className={field} value={datos.nombre} disabled={grupoId != null} autoFocus
                  onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} placeholder="Ej. Ventas Amex turno matutino" />
              </label>
              <label className="block">
                <span className={label}>Descripción (opcional)</span>
                <input className={field} value={datos.descripcion} disabled={grupoId != null}
                  onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} placeholder="¿Qué hace este grupo?" />
              </label>
              <div className="flex justify-end">
                {grupoId ? (
                  <button onClick={() => setPaso(1)} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
                    Continuar <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={() => crear.mutate()} disabled={!datos.nombre.trim() || crear.isPending}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                    {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Crear grupo y continuar
                  </button>
                )}
              </div>
            </div>
          )}

          {grupoId != null && (!tipo || !grupo) && actual.key !== 'grupo' && (
            <div className={clsx(card, 'flex justify-center py-8')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
          )}

          {tipo && grupo && actual.key === 'asignaciones' && (
            <ConfigGrupo tipo={tipo} grupo={grupo} editable onCambio={recargar} seccion="asignaciones" guardarRef={guardarRef} />
          )}
          {tipo && grupo && actual.key === 'personas' && (
            <>
              <ConfigGrupo tipo={tipo} grupo={grupo} editable onCambio={recargar} seccion="personas" />
              <MiembrosGrupo tipo={tipo} grupo={grupo} puedeEditar onCambio={recargar} titulo={gente}
                sub={`Trabajan en el grupo: al entrar reciben sus campañas, skills y marcador${atiende ? ', y atienden a sus clientes' : ''}. Cada persona es supervisor o ${atiende ? 'asesor' : 'agente'}, no ambos.`} />
            </>
          )}
          {tipo && grupo && actual.key === 'clientes' && (
            <ClientesDelGrupo tipo={tipo} grupo={grupo} editable onCambio={recargar} />
          )}

          {tipo && grupo && actual.key === 'listo' && (
            <div className={clsx(card, 'space-y-3')}>
              <p className="text-base font-bold text-ink">{grupo.nombre}</p>
              <p className="text-[0.8rem] text-ink-secondary">{grupo.contexto}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PASOS.filter((p) => p.key !== 'listo').map((p) => (
                  <div key={p.key} className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.78rem]',
                    completo[p.key] ? 'border-emerald-100 bg-emerald-50/60 text-emerald-700' : 'border-amber-100 bg-amber-50/60 text-amber-700')}>
                    {completo[p.key] ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 text-center font-bold">!</span>}
                    {p.key === 'personas' ? `${nSupervisores} supervisor(es) · ${grupo.miembros} ${atiende ? 'asesor(es)' : 'agente(s)'}` : p.titulo}
                  </div>
                ))}
              </div>
              <p className="text-[0.72rem] text-ink-tertiary">
                Puedes cambiar todo después en Configuración → Usuarios y Seguridad → Grupos. Quien entre o salga del grupo recibe o pierde su configuración automáticamente.
              </p>
              <div className="flex justify-end">
                <button onClick={onSalir} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
                  <Check className="h-4 w-4" /> Terminar
                </button>
              </div>
            </div>
          )}

          {/* Navegación */}
          {paso > 0 && (
            <div className="flex justify-between">
              <button onClick={() => irA(paso - 1)} disabled={cambiando} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-gray-50">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </button>
              {paso < PASOS.length - 1 && (
                <button onClick={() => irA(paso + 1)} disabled={cambiando} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {cambiando ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <>Siguiente <ArrowRight className="h-4 w-4" /></>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
