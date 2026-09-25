import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronRight, Folder, FolderOpen, Megaphone, Users } from 'lucide-react'
import { ccService } from '@/services/cc.service'
import { supervisoresService } from '@/services/supervisores.service'
import { Spinner } from '@/components/ui/Spinner'
import { RegistrosFormularioVista } from '@/pages/contact-center/RegistrosFormularioPage'
import type { CCCampania } from '@/types/cc.types'
import { REPORTES_CAMPANIA, type ReporteCampaniaId } from './reportesCampania'

// Carpeta "Campañas" del árbol de la Suite: un apartado por cada campaña
// activa, con sus reportes ya filtrados. Se arma solo con las campañas: al
// crear una aparece aquí sin configurar nada.
export function CarpetaCampanias({ campanias, seleccion, onSeleccionar }: {
  campanias: CCCampania[]
  seleccion: { campaniaId: number; reporte: ReporteCampaniaId } | null
  onSeleccionar: (campaniaId: number, reporte: ReporteCampaniaId) => void
}) {
  const [abierta, setAbierta] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<number, boolean>>(() => (seleccion ? { [seleccion.campaniaId]: true } : {}))
  if (!campanias.length) return null

  return (
    <div>
      <button onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[0.8rem] font-semibold text-ink-secondary hover:bg-white">
        <ChevronRight className={clsx('h-3.5 w-3.5 flex-shrink-0 text-ink-tertiary transition-transform', abierta && 'rotate-90')} />
        {abierta ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-violet-500" /> : <Folder className="h-4 w-4 flex-shrink-0 text-violet-500" />}
        <span className="truncate">Campañas</span>
        <span className="ml-auto rounded-full bg-gray-200 px-1.5 text-[0.6rem] font-bold text-ink-tertiary">{campanias.length}</span>
      </button>
      {abierta && campanias.map((c) => {
        const abiertaC = abiertas[c.id] ?? false
        return (
          <div key={c.id}>
            <button onClick={() => setAbiertas((p) => ({ ...p, [c.id]: !abiertaC }))}
              className="flex w-full items-center gap-1.5 py-1.5 pl-7 pr-3 text-left text-[0.78rem] font-medium text-ink-secondary hover:bg-white">
              <ChevronRight className={clsx('h-3 w-3 flex-shrink-0 text-ink-tertiary transition-transform', abiertaC && 'rotate-90')} />
              <Megaphone className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <span className="truncate">{c.nombre}</span>
            </button>
            {abiertaC && REPORTES_CAMPANIA.map((r) => {
              const activo = seleccion?.campaniaId === c.id && seleccion.reporte === r.id
              return (
                <button key={r.id} onClick={() => onSeleccionar(c.id, r.id)}
                  className={clsx(
                    'flex w-full items-center gap-2 py-1.5 pl-12 pr-3 text-left text-[0.76rem] transition',
                    activo ? 'bg-brand/10 font-semibold text-brand' : 'text-ink-secondary hover:bg-white',
                  )}>
                  <r.icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{r.nombre}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Encabezado común de los reportes de una campaña.
export function EncabezadoCampania({ campania, reporte }: { campania: CCCampania | undefined; reporte: ReporteCampaniaId }) {
  const r = REPORTES_CAMPANIA.find((x) => x.id === reporte)
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
      <Megaphone className="h-4 w-4 text-violet-500" />
      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-tertiary">Campaña</span>
      <span className="text-sm font-bold text-ink">{campania?.nombre ?? '—'}</span>
      {r && <span className="text-[0.75rem] text-ink-tertiary">· {r.nombre}</span>}
    </div>
  )
}

// Registros del formulario, acotado a los formularios asignados a la campaña.
export function RegistrosDeCampania({ campaniaId }: { campaniaId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cc-campania-formularios', campaniaId],
    queryFn: () => ccService.getFormulariosDeCampania(campaniaId),
  })
  if (isLoading) return <div className="flex justify-center py-10"><Spinner /></div>
  const ids = (data?.formularios ?? []).map((f) => f.id)
  if (!ids.length) return <p className="text-sm text-ink-tertiary">Esta campaña no tiene formularios asignados.</p>
  return <RegistrosFormularioVista formularioIds={ids} />
}

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ESTADO_LABEL: Record<string, { txt: string; cls: string }> = {
  disponible: { txt: 'Disponible', cls: 'bg-emerald-100 text-emerald-700' },
  pausa: { txt: 'En pausa', cls: 'bg-amber-100 text-amber-700' },
  no_disponible: { txt: 'No disponible', cls: 'bg-gray-100 text-gray-600' },
  desconectado: { txt: 'Desconectado', cls: 'bg-gray-100 text-gray-400' },
}
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)

// Productividad del día de los agentes de los skills de la campaña: atenciones
// cerradas en la campaña, minutos de pausa (tipos que cuentan en Contact Center)
// y su estado actual.
export function ProductividadCampaniaView({ campaniaId }: { campaniaId: number }) {
  const [fecha, setFecha] = useState(hoyLocal())
  const { data = [], isLoading } = useQuery({
    queryKey: ['suite-productividad-campania', campaniaId, fecha],
    queryFn: () => supervisoresService.getProductividad(fecha, campaniaId),
    refetchInterval: fecha === hoyLocal() ? 60_000 : false,
  })
  const filas = [...data].sort((a, b) => (b.atenciones ?? 0) - (a.atenciones ?? 0) || a.nombre.localeCompare(b.nombre))
  const totAtenciones = filas.reduce((s, a) => s + (a.atenciones ?? 0), 0)
  const totPausa = filas.reduce((s, a) => s + a.totalPausaMin, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><Users className="h-4 w-4 text-brand" /> Productividad de agentes</h2>
          <p className="text-xs text-gray-500">Agentes de los skills de la campaña: atenciones cerradas en ella y minutos en pausa del día.</p>
        </div>
        <div className="ml-auto">
          <label className="mb-1 block text-[0.68rem] text-ink-secondary">Fecha</label>
          <input type="date" className="field" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value || hoyLocal())} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Agentes', valor: String(filas.length) },
          { label: 'Atenciones cerradas', valor: String(totAtenciones) },
          { label: 'Tiempo total en pausa', valor: fmtMin(totPausa) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 p-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">{k.label}</p>
            <p className="mt-0.5 text-lg font-bold text-ink">{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-left text-[0.78rem]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
              <th className="px-3 py-2.5">Agente</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Atenciones</th>
              <th className="px-3 py-2.5 text-right">Baño</th>
              <th className="px-3 py-2.5 text-right">Comida</th>
              <th className="px-3 py-2.5 text-right">Capacitación</th>
              <th className="px-3 py-2.5 text-right">Permiso</th>
              <th className="px-3 py-2.5 text-right">Pausa total</th>
              <th className="px-3 py-2.5 text-right">Prom. 7 días</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="py-10"><div className="flex justify-center"><Spinner /></div></td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-ink-tertiary">La campaña no tiene agentes en sus skills.</td></tr>
            ) : filas.map((a) => {
              const est = ESTADO_LABEL[a.estado] ?? { txt: a.estado, cls: 'bg-gray-100 text-gray-600' }
              const excede = a.avgSemanalMin != null && a.totalPausaMin > a.avgSemanalMin * 1.25 && a.totalPausaMin - a.avgSemanalMin >= 10
              return (
                <tr key={a.agenteId} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{a.nombre}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.66rem] font-semibold', est.cls)}>
                      {est.txt}{a.estado === 'pausa' && a.tipoPausa ? ` · ${a.tipoPausa}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ink">{a.atenciones ?? 0}</td>
                  <td className="px-3 py-2 text-right">{fmtMin(a.banio)}</td>
                  <td className="px-3 py-2 text-right">{fmtMin(a.comida)}</td>
                  <td className="px-3 py-2 text-right">{fmtMin(a.capacitacion)}</td>
                  <td className="px-3 py-2 text-right">{fmtMin(a.permiso)}</td>
                  <td className={clsx('px-3 py-2 text-right font-semibold', excede ? 'text-red-600' : 'text-ink')} title={excede ? 'Más de lo que acostumbra (promedio de 7 días)' : undefined}>
                    {fmtMin(a.totalPausaMin)}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-tertiary">{a.avgSemanalMin != null ? fmtMin(a.avgSemanalMin) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
