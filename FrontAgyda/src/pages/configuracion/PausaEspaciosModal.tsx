import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, AlertTriangle, Info } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PAUSA_TIPOS_QUERY_KEY } from '@/hooks/usePausaTipos'
import { pausaTiposService } from '@/services/pausaTipos.service'
import { aplicaEspacio, type AreaPausa, type EspacioPausa, type PausaTipo } from '@/types/pausaTipos.types'

const MAX_CAPACIDAD = 50
const MAX_ESPACIOS = 30

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.85rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

type Fila = Omit<EspacioPausa, 'capacidad'> & { _k: string; capacidad: string }

let secuencia = 0
const nuevaKey = () => `n${++secuencia}`
const fila = (e: Partial<EspacioPausa> = {}): Fila => ({
  _k: e.id ? `e${e.id}` : nuevaKey(),
  id: e.id,
  nombre: e.nombre ?? '',
  genero: e.genero ?? null,
  capacidad: String(e.capacidad ?? 1),
  areas: e.areas ?? null,
})

const GENEROS: { value: '' | 'M' | 'F'; label: string }[] = [
  { value: '', label: 'Mixto (todos)' },
  { value: 'M', label: 'Hombres' },
  { value: 'F', label: 'Mujeres' },
]

// Plantillas para las configuraciones más comunes (reemplazan la lista; se
// pueden ajustar antes de guardar).
function plantillas(areas: AreaPausa[]): { key: string; label: string; filas: () => Fila[] }[] {
  const conUsuarios = areas.filter((a) => a.hombres + a.mujeres > 0)
  return [
    { key: 'uno', label: 'Uno para todos', filas: () => [fila({ nombre: 'Baño', genero: null, capacidad: 1, areas: null })] },
    {
      key: 'genero', label: 'Hombres y mujeres',
      filas: () => [
        fila({ nombre: 'Baño de hombres', genero: 'M', capacidad: 1, areas: null }),
        fila({ nombre: 'Baño de mujeres', genero: 'F', capacidad: 1, areas: null }),
      ],
    },
    {
      key: 'area', label: 'Uno por área',
      filas: () => conUsuarios.map((a) => fila({ nombre: `Baño ${a.label}`, genero: null, capacidad: 1, areas: [a.area] })),
    },
  ]
}

// Configuración → Tipos de pausa → Baño → Espacios. Los baños físicos: para
// quién es cada uno (género y áreas) y cuántas personas caben a la vez.
export function PausaEspaciosModal({ tipo, onClose }: { tipo: PausaTipo; onClose: () => void }) {
  const qc = useQueryClient()
  const [filas, setFilas] = useState<Fila[]>(() => (tipo.espacios?.length ? tipo.espacios : []).map(fila))
  const { data: areas = [] } = useQuery({ queryKey: ['pausa-tipos-areas'], queryFn: () => pausaTiposService.areas(), staleTime: 60_000 })

  const set = (k: string, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f._k === k ? { ...f, ...cambios } : f)))

  const guardar = useMutation({
    mutationFn: () => pausaTiposService.updateEspacios(tipo.statusId, filas.map((f) => ({
      id: f.id,
      nombre: f.nombre.trim(),
      genero: f.genero,
      capacidad: Number(f.capacidad),
      areas: f.areas,
    }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAUSA_TIPOS_QUERY_KEY })
      toast.success('Baños actualizados')
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudieron guardar los baños')
    },
  })

  const filaValida = (f: Fila) => {
    const cap = Number(f.capacidad)
    return f.nombre.trim().length > 0 && Number.isInteger(cap) && cap >= 1 && cap <= MAX_CAPACIDAD && (f.areas === null || f.areas.length > 0)
  }
  const puedeGuardar = filas.length > 0 && filas.every(filaValida)

  // Quién se queda sin baño: áreas con usuarios de un género al que ningún
  // espacio le aplica. No se bloquea: su pausa se registra sin semáforo.
  const sinBanio = areas.flatMap((a) => ([['M', a.hombres, 'hombres'], ['F', a.mujeres, 'mujeres']] as const)
    .filter(([g, n]) => n > 0 && !filas.some((f) => aplicaEspacio(f, g, a.area)))
    .map(([, n, quien]) => `${a.label} · ${quien} (${n})`))

  // Áreas a mostrar: las que tienen usuarios + las ya elegidas en algún espacio.
  const elegidas = new Set(filas.flatMap((f) => f.areas ?? []))
  const areasVisibles = areas.filter((a) => a.hombres + a.mujeres > 0 || elegidas.has(a.area))

  return (
    <Modal isOpen onClose={onClose} title={`${tipo.emoji} Baños — ${tipo.etiqueta}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl bg-violet-50/70 px-3.5 py-3 text-[0.78rem] text-gray-600">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" />
          <p>
            Cada colaborador entra al <b>primer baño que le corresponde</b> (por género y área) y que tenga lugar.
            Si todos los suyos están llenos, su botón de baño se bloquea y le avisa quién está adentro.
            Aplica a toda la empresa (menú de estado y aviso de «baño ocupado»).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.72rem] font-semibold text-gray-500">Plantillas:</span>
          {plantillas(areas).map((p) => (
            <button key={p.key} type="button" onClick={() => setFilas(p.filas())}
              className="rounded-full border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-700">
              {p.label}
            </button>
          ))}
        </div>

        <ul className="space-y-2.5">
          {filas.map((f, i) => (
            <li key={f._k} className={clsx('rounded-xl border p-3', filaValida(f) ? 'border-gray-200' : 'border-red-300')}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px_150px_auto]">
                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-semibold text-gray-500">Nombre</span>
                  <input className={inputCls} maxLength={60} value={f.nombre} placeholder={`Baño ${i + 1}`}
                    onChange={(e) => set(f._k, { nombre: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-semibold text-gray-500">Para</span>
                  <select className={inputCls} value={f.genero ?? ''}
                    onChange={(e) => set(f._k, { genero: (e.target.value || null) as Fila['genero'] })}>
                    {GENEROS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-semibold text-gray-500">Personas a la vez</span>
                  <input type="number" min={1} max={MAX_CAPACIDAD} className={inputCls} value={f.capacidad}
                    onChange={(e) => set(f._k, { capacidad: e.target.value })} />
                </label>
                <div className="flex items-end">
                  <button type="button" disabled={filas.length <= 1} title={filas.length <= 1 ? 'Debe haber al menos un baño' : 'Quitar'}
                    onClick={() => setFilas((fs) => fs.filter((x) => x._k !== f._k))}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-2.5">
                <span className="mb-1 block text-[0.68rem] font-semibold text-gray-500">Áreas que lo usan</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="mr-1 flex items-center gap-1.5 text-[0.78rem] text-gray-700">
                    <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={f.areas === null}
                      onChange={(e) => set(f._k, { areas: e.target.checked ? null : [] })} />
                    Todas las áreas
                  </label>
                  {f.areas !== null && areasVisibles.map((a) => {
                    const on = f.areas?.includes(a.area) ?? false
                    return (
                      <button key={a.area} type="button"
                        onClick={() => set(f._k, { areas: on ? (f.areas ?? []).filter((x) => x !== a.area) : [...(f.areas ?? []), a.area] })}
                        className={clsx(
                          'rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold transition-colors',
                          on ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300',
                        )}>
                        {a.label}
                      </button>
                    )
                  })}
                  {f.areas !== null && f.areas.length === 0 && (
                    <span className="text-[0.68rem] text-red-500">Elige al menos un área</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {filas.length < MAX_ESPACIOS && (
          <button type="button" onClick={() => setFilas((fs) => [...fs, fila({ nombre: '', genero: null, capacidad: 1, areas: null })])}
            className="flex items-center gap-1 text-[0.78rem] font-semibold text-violet-600 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Agregar baño
          </button>
        )}

        {sinBanio.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-[0.76rem] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Sin baño asignado</p>
              <p>{sinBanio.join(' · ')}</p>
              <p className="mt-0.5 text-amber-700/80">Pueden marcar su pausa de baño, pero sin semáforo de ocupación.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={!puedeGuardar || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
