import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Coffee, Plus, Pencil, Trash2, Lock, X, DoorOpen } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { usePausaTipos, usePausaModulos, PAUSA_TIPOS_QUERY_KEY } from '@/hooks/usePausaTipos'
import { pausaTiposService } from '@/services/pausaTipos.service'
import {
  USOS_PAUSA, MODULOS_LIMITE,
  type PausaTipo, type PausaTipoPayload, type UsoPausa, type ModuloLimite,
} from '@/types/pausaTipos.types'
import { AlcanceCambioModal } from './AlcanceCambioModal'
import { PausaEspaciosModal } from './PausaEspaciosModal'
import { useConfigModulo } from './configUbicacion'

// Módulo del sidebar desde el que se abre esta pantalla → módulo de uso de la pausa.
const USO_POR_MODULO: Record<string, UsoPausa> = {
  asistencia: 'asistencia',
  nomina: 'nomina',
  operaciones: 'contact_center',
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.85rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

function mensajeError(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
  return msg || fallback
}

// Resumen de los baños: "Baño de hombres (1) · Baño de mujeres (1)" — (n) = personas a la vez.
function describirEspacios(t: PausaTipo): string {
  if (!t.espacios?.length) return 'Sin baños configurados'
  return t.espacios.map((e) => `${e.nombre} (${e.capacidad})`).join(' · ')
}

function describirLimite(t: PausaTipo): string {
  if (!t.limiteMin) return 'Sin límite'
  const base = t.limiteModo === 'diario' ? `${t.limiteMin} min acumulados al día` : `${t.limiteMin} min por pausa`
  const porArea = Object.entries(t.limitesArea).map(([a, m]) => `${a}: ${m} min`)
  const porModulo = MODULOS_LIMITE.filter((m) => t.limitesModulo?.[m.key]).map((m) => `${m.label}: ${t.limitesModulo?.[m.key]} min`)
  const extras = [...porArea, ...porModulo]
  return extras.length ? `${base} · ${extras.join(', ')}` : base
}

interface FormState {
  etiqueta: string
  emoji: string
  color: string
  activo: boolean
  modo: 'ninguno' | 'visita' | 'diario'
  limiteMin: string
  limitesArea: { area: string; min: string }[]
  limitesModulo: Record<ModuloLimite, string>
}

function formDesde(t: PausaTipo | null): FormState {
  return {
    etiqueta: t?.etiqueta ?? '',
    emoji: t?.emoji ?? '⏸️',
    color: t?.color ?? '#6B7280',
    activo: t?.activo ?? true,
    modo: t?.limiteMin ? (t.limiteModo ?? 'visita') : 'ninguno',
    limiteMin: t?.limiteMin ? String(t.limiteMin) : '',
    limitesArea: Object.entries(t?.limitesArea ?? {}).map(([area, min]) => ({ area, min: String(min) })),
    limitesModulo: {
      asistencia: t?.limitesModulo?.asistencia ? String(t.limitesModulo.asistencia) : '',
      contact_center: t?.limitesModulo?.contact_center ? String(t.limitesModulo.contact_center) : '',
    },
  }
}

// Alta/edición de un tipo. Al guardar se pregunta en qué módulos cuenta
// (AlcanceCambioModal), con el impacto en cada uno.
function PausaTipoModal({ tipo, usoActual, modulosEmpresa, onClose }: {
  tipo: PausaTipo | null // null = nuevo
  usoActual: UsoPausa | null
  modulosEmpresa: Record<UsoPausa, boolean> // módulos que la empresa tiene
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(() => formDesde(tipo))
  const [eligiendoUsos, setEligiendoUsos] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = useMutation({
    mutationFn: (usos: Record<UsoPausa, boolean>) => {
      const limitesArea: Record<string, number> = {}
      for (const l of form.limitesArea) {
        if (l.area.trim() && Number(l.min) > 0) limitesArea[l.area.trim().toUpperCase()] = Number(l.min)
      }
      const limitesModulo: Partial<Record<ModuloLimite, number | null>> = {}
      for (const m of MODULOS_LIMITE) {
        const v = Number(form.limitesModulo[m.key])
        limitesModulo[m.key] = v > 0 ? v : null
      }
      const payload: PausaTipoPayload = {
        etiqueta: form.etiqueta.trim(),
        emoji: form.emoji.trim() || null,
        color: form.color,
        activo: form.activo,
        limiteMin: form.modo === 'ninguno' ? null : Number(form.limiteMin),
        limiteModo: form.modo === 'ninguno' ? null : form.modo,
        limitesArea: form.modo === 'ninguno' ? {} : limitesArea,
        limitesModulo: form.modo === 'ninguno' ? {} : limitesModulo,
        usos,
      }
      return tipo ? pausaTiposService.update(tipo.statusId, payload) : pausaTiposService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAUSA_TIPOS_QUERY_KEY })
      toast.success(tipo ? 'Tipo de pausa actualizado' : 'Tipo de pausa creado')
      onClose()
    },
    onError: (e) => toast.error(mensajeError(e, 'No se pudo guardar')),
  })

  const limiteValido = form.modo === 'ninguno' || (Number(form.limiteMin) >= 1 && Number(form.limiteMin) <= 1440)
  const puedeGuardar = form.etiqueta.trim().length > 0 && limiteValido

  // Solo se ofrecen los módulos que la empresa tiene. Los demás conservan su
  // valor al editar, y en un tipo nuevo quedan en "no cuenta" (si la empresa
  // activa el módulo después, se decide ahí si la pausa cuenta).
  const usosVisibles = USOS_PAUSA.filter((u) => modulosEmpresa[u.key])
  const limitesVisibles = MODULOS_LIMITE.filter((m) => modulosEmpresa[m.key])
  const preseleccion = tipo
    ? usosVisibles.filter((u) => tipo.usos[u.key]).map((u) => u.key)
    : usoActual && modulosEmpresa[usoActual] ? [usoActual] : usosVisibles.map((u) => u.key)
  const usosDesde = (keys: string[]) => Object.fromEntries(USOS_PAUSA.map((u) => [
    u.key,
    modulosEmpresa[u.key] ? keys.includes(u.key) : (tipo?.usos[u.key] ?? false),
  ])) as Record<UsoPausa, boolean>

  return (
    <>
      <Modal isOpen onClose={onClose} title={tipo ? `Editar: ${tipo.etiqueta}` : 'Nuevo tipo de pausa'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_80px_64px] gap-2">
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Nombre</span>
              <input className={inputCls} maxLength={60} value={form.etiqueta}
                onChange={(e) => set('etiqueta', e.target.value)} placeholder="Ej. Junta, Pausa activa…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Emoji</span>
              <input className={clsx(inputCls, 'text-center')} maxLength={8} value={form.emoji}
                onChange={(e) => set('emoji', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Color</span>
              <input type="color" className="h-[38px] w-full cursor-pointer rounded-xl border border-gray-200 bg-card p-1"
                value={form.color} onChange={(e) => set('color', e.target.value)} />
            </label>
          </div>

          <div>
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Límite</span>
            <div className="flex flex-wrap items-center gap-2">
              <select className={clsx(inputCls, 'w-auto')} value={form.modo}
                onChange={(e) => set('modo', e.target.value as FormState['modo'])}>
                <option value="ninguno">Sin límite</option>
                <option value="visita">Por pausa</option>
                <option value="diario">Acumulado al día</option>
              </select>
              {form.modo !== 'ninguno' && (
                <>
                  <input type="number" min={1} max={1440} className={clsx(inputCls, 'w-24')}
                    value={form.limiteMin} onChange={(e) => set('limiteMin', e.target.value)} />
                  <span className="text-sm text-gray-400">min</span>
                </>
              )}
            </div>
            <p className="mt-1 text-[0.68rem] text-gray-400">Quien lo exceda aparece en rojo en el Reporte de pausas y en su menú de estado.</p>
          </div>

          {form.modo !== 'ninguno' && (
            <div>
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Límite distinto por área (opcional)</span>
              <div className="space-y-1.5">
                {form.limitesArea.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className={clsx(inputCls, 'w-24 uppercase')} maxLength={20} placeholder="Área (TI)" value={l.area}
                      onChange={(e) => set('limitesArea', form.limitesArea.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)))} />
                    <input type="number" min={1} max={1440} className={clsx(inputCls, 'w-24')} placeholder="min" value={l.min}
                      onChange={(e) => set('limitesArea', form.limitesArea.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                    <span className="text-sm text-gray-400">min</span>
                    <button type="button" onClick={() => set('limitesArea', form.limitesArea.filter((_, j) => j !== i))}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500" title="Quitar">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => set('limitesArea', [...form.limitesArea, { area: '', min: '' }])}
                  className="text-[0.75rem] font-semibold text-violet-600 hover:underline">
                  + Agregar área
                </button>
              </div>
            </div>
          )}

          {form.modo !== 'ninguno' && limitesVisibles.length > 0 && (
            <div>
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Límite distinto por módulo (opcional)</span>
              <div className="space-y-1.5">
                {limitesVisibles.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <span className="w-28 flex-shrink-0 text-[0.8rem] text-gray-700">{m.label}</span>
                    <input type="number" min={1} max={1440} className={clsx(inputCls, 'w-24')} placeholder="General"
                      value={form.limitesModulo[m.key]}
                      onChange={(e) => set('limitesModulo', { ...form.limitesModulo, [m.key]: e.target.value })} />
                    <span className="text-sm text-gray-400">min</span>
                    <span className="min-w-0 truncate text-[0.68rem] text-gray-400" title={m.donde}>{m.donde}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[0.68rem] text-gray-400">
                En ese módulo reemplaza al límite general y a los de área. Vacío = usa el general. Nómina no usa este límite (tiene sus minutos de pausa libres).
              </p>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={form.activo}
              disabled={tipo?.controlOcupacion}
              onChange={(e) => set('activo', e.target.checked)} />
            <span className="text-[0.82rem] text-gray-700">
              Activo — aparece en el menú de estado para iniciarla
              {tipo?.controlOcupacion && <span className="text-gray-400"> (el baño siempre está activo)</span>}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => setEligiendoUsos(true)} disabled={!puedeGuardar}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {eligiendoUsos && (
        <AlcanceCambioModal
          titulo="¿En qué módulos cuenta esta pausa?"
          descripcion="El nombre, el color y el límite son los mismos en todos los módulos. Marca en cuáles cuenta esta pausa; en los que no marques se ignora."
          actual={usoActual && modulosEmpresa[usoActual] ? usoActual : null}
          preseleccion={preseleccion}
          pending={guardar.isPending}
          opciones={usosVisibles.map((u) => ({
            key: u.key,
            label: u.label,
            impacto: u.impacto,
            valorActual: tipo ? (tipo.usos[u.key] ? 'cuenta' : 'no cuenta') : undefined,
          }))}
          onConfirm={(keys) => guardar.mutate(usosDesde(keys))}
          onClose={() => setEligiendoUsos(false)}
        />
      )}
    </>
  )
}

// Configuración → Tipos de pausa. Compartida entre Asistencia, Nómina y
// Contact Center: cada tipo indica en qué módulos cuenta.
export function PausaTiposTab() {
  const qc = useQueryClient()
  const moduloActual = useConfigModulo()
  const usoActual = moduloActual ? USO_POR_MODULO[moduloActual] ?? null : null
  const { tipos, isLoading } = usePausaTipos()
  const { modulos: modulosEmpresa } = usePausaModulos()
  const [editando, setEditando] = useState<PausaTipo | 'nuevo' | null>(null)
  const [eliminando, setEliminando] = useState<PausaTipo | null>(null)
  const [espacios, setEspacios] = useState<PausaTipo | null>(null)

  const eliminar = useMutation({
    mutationFn: (t: PausaTipo) => pausaTiposService.remove(t.statusId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAUSA_TIPOS_QUERY_KEY })
      toast.success('Tipo de pausa eliminado')
      setEliminando(null)
    },
    onError: (e) => {
      toast.error(mensajeError(e, 'No se pudo eliminar'))
      setEliminando(null)
    },
  })

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Coffee className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.35rem] font-bold text-gray-900">Tipos de pausa</h2>
            <p className="text-[0.82rem] text-gray-400">
              Las pausas que cada colaborador marca desde su menú de estado. Los 4 tipos por default no se pueden eliminar, pero sí editar.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditando('nuevo')}><Plus className="h-3.5 w-3.5" /> Nuevo tipo</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card shadow-card">
        {isLoading ? (
          <p className="p-5 text-sm text-ink-tertiary">Cargando…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tipos.map((t) => (
              <li key={t.statusId} className={clsx('flex flex-wrap items-center gap-3 px-5 py-3.5', !t.activo && 'opacity-60')}>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                  style={{ background: `${t.color}1A` }}>
                  {t.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[0.88rem] font-semibold text-gray-800">
                    <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                    {t.etiqueta}
                    {t.esSistema && (
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.6rem] font-medium text-gray-500">
                        <Lock className="h-2.5 w-2.5" /> Por default
                      </span>
                    )}
                    {!t.activo && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.6rem] font-medium text-gray-500">Inactivo</span>}
                    {t.controlOcupacion && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.6rem] font-medium text-blue-600">Semáforo de ocupación</span>}
                  </p>
                  <p className="text-[0.72rem] text-gray-400">{describirLimite(t)}</p>
                  {t.controlOcupacion && (
                    <p className="text-[0.72rem] text-gray-500">🚪 {describirEspacios(t)}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {USOS_PAUSA.filter((u) => modulosEmpresa[u.key]).map((u) => (
                    <span key={u.key}
                      title={t.usos[u.key] ? u.impacto : `No cuenta en ${u.label}`}
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-[0.62rem] font-semibold',
                        t.usos[u.key] ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-300 line-through',
                      )}>
                      {u.label}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  {t.controlOcupacion && (
                    <button type="button" onClick={() => setEspacios(t)} title="Baños: cuántos hay, para quién y cuántas personas caben"
                      className="flex items-center gap-1 rounded-lg px-2 py-2 text-[0.72rem] font-semibold text-blue-600 hover:bg-blue-50">
                      <DoorOpen className="h-4 w-4" /> Baños
                    </button>
                  )}
                  <button type="button" onClick={() => setEditando(t)} title="Editar"
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-violet-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!t.esSistema && (
                    <button type="button" onClick={() => setEliminando(t)} title="Eliminar"
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando && (
        <PausaTipoModal
          tipo={editando === 'nuevo' ? null : editando}
          usoActual={usoActual}
          modulosEmpresa={modulosEmpresa}
          onClose={() => setEditando(null)}
        />
      )}

      {espacios && <PausaEspaciosModal tipo={espacios} onClose={() => setEspacios(null)} />}

      <ConfirmDialog
        isOpen={!!eliminando}
        onClose={() => setEliminando(null)}
        onConfirm={() => eliminando && eliminar.mutate(eliminando)}
        title="Eliminar tipo de pausa"
        message={`¿Eliminar "${eliminando?.etiqueta ?? ''}"? Si ya tiene registros no se podrá eliminar; en ese caso desactívalo para conservar el historial.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
