import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Check, Loader2, Share2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService, ESTATUS_VENTA_VALIDOS, USOS_ESTATUS_CONTADOS,
  type UsoEstatusContados, type VentasConfig,
} from '@/services/personalizacion.service'
import { AlcanceCambioModal } from './AlcanceCambioModal'

const DEFAULT_ESTATUS = ['Aprobada', 'Formalizada', 'Formalizado', 'Garantizada']

function listaDe(ventas: VentasConfig | undefined, uso: UsoEstatusContados): string[] {
  return ventas?.estatusContadosPorUso?.[uso] ?? ventas?.estatusContados ?? DEFAULT_ESTATUS
}

const mismaLista = (a: string[], b: string[]) => a.length === b.length && a.every((e) => b.includes(e))

// "Estatus de venta contados" de un módulo (Metas, Comisiones o Incentivos).
// Cada módulo tiene su lista; al guardar se elige si el cambio aplica solo a
// este módulo o también a los otros.
export function EstatusContadosCard({ uso }: { uso: UsoEstatusContados }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const actual = listaDe(data?.ventas, uso)
  const [seleccion, setSeleccion] = useState<string[] | null>(null)
  const [seededFrom, setSeededFrom] = useState<string[] | null>(null)
  if (data && actual !== seededFrom) {
    setSeededFrom(actual)
    setSeleccion([...actual])
  }
  const [eligiendoAlcance, setEligiendoAlcance] = useState(false)

  const guardar = useMutation({
    mutationFn: (usos: UsoEstatusContados[]) => personalizacionService.updateEstatusContados(seleccion ?? [], usos),
    onSuccess: (_, usos) => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      setEligiendoAlcance(false)
      const nombres = USOS_ESTATUS_CONTADOS.filter((u) => usos.includes(u.key)).map((u) => u.label)
      toast.success(`Estatus contados actualizados en ${nombres.join(', ')}`)
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !seleccion) {
    return <p className="text-sm text-ink-tertiary">Cargando…</p>
  }

  const toggle = (estatus: string) =>
    setSeleccion((s) => (s ? (s.includes(estatus) ? s.filter((e) => e !== estatus) : [...s, estatus]) : s))

  const otros = USOS_ESTATUS_CONTADOS.filter((u) => u.key !== uso)
  const iguales = otros.filter((u) => mismaLista(listaDe(data?.ventas, u.key), actual))
  const hayCambios = !mismaLista(seleccion, actual)

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <ListChecks className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem] font-bold text-gray-900">Estatus de venta contados</p>
          <p className="text-[0.78rem] text-gray-400">
            {USOS_ESTATUS_CONTADOS.find((u) => u.key === uso)?.impacto}
          </p>
        </div>
        <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-700">
          <Share2 className="h-2.5 w-2.5" /> Compartida
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ESTATUS_VENTA_VALIDOS.map((estatus) => (
          <label key={estatus} className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
            <input type="checkbox" className="h-4 w-4 accent-violet-600"
              checked={seleccion.includes(estatus)}
              onChange={() => toggle(estatus)} />
            <span className="text-[0.8rem] text-gray-700">{estatus}</span>
          </label>
        ))}
      </div>

      <p className="mt-2 text-[0.68rem] text-gray-400">
        {iguales.length === otros.length
          ? `Hoy ${otros.map((u) => u.label).join(' e ')} usan esta misma lista.`
          : iguales.length > 0
            ? `Hoy ${iguales.map((u) => u.label).join(', ')} usa esta misma lista; ${otros.filter((u) => !iguales.includes(u)).map((u) => u.label).join(', ')} tiene una distinta.`
            : `Este módulo tiene su propia lista; ${otros.map((u) => u.label).join(' e ')} usan otra.`}
        {' '}Al guardar eliges a qué módulos aplica el cambio.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" disabled={!hayCambios} onClick={() => setSeleccion([...actual])}
          className="rounded-xl px-4 py-2 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-40">
          Descartar
        </button>
        <button type="button"
          disabled={seleccion.length === 0 || guardar.isPending}
          onClick={() => setEligiendoAlcance(true)}
          className={clsx(
            'flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-[0.8rem] font-semibold text-white',
            'shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60',
          )}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </button>
      </div>

      {eligiendoAlcance && (
        <AlcanceCambioModal
          titulo="¿A qué módulos aplica este cambio?"
          actual={uso}
          pending={guardar.isPending}
          opciones={USOS_ESTATUS_CONTADOS.map((u) => ({
            key: u.key,
            label: u.label,
            impacto: u.impacto,
            valorActual: listaDe(data?.ventas, u.key).join(', '),
          }))}
          onConfirm={(keys) => guardar.mutate(keys as UsoEstatusContados[])}
          onClose={() => setEligiendoAlcance(false)}
        />
      )}
    </section>
  )
}
