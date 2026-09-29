import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { LayoutTemplate, Copy, Search, Check, AlertTriangle, Info, Eye, Users } from 'lucide-react'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { getApiError } from '@/lib/axios'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { RbMiniatura } from './RbMiniatura'
import { RbGrafica } from './RbGrafica'
import { columnasDeDefinicion, describirDefinicion, formaEfectiva } from './rbVisual'
import type { RbCatalogo, RbDefinicion, RbSugerencia, RbModalidadGrupo } from '@/types/reporteDiario.types'

type Pestania = 'plantillas' | 'copiar'
interface Item {
  clave: string
  nombre: string
  descripcion: string
  etiqueta: string          // categoría (plantilla) o carpeta (reporte guardado)
  origen: string
  definicion: RbDefinicion
  requiere: RbModalidadGrupo[] | null
  detalle?: string          // quién lo creó / de qué grupo es
}

interface Props {
  catalogo: RbCatalogo
  grupoId: number | null
  onClose: () => void
  // La definición ya viene COPIADA y ajustada al grupo: el original no se toca.
  onUsar: (def: RbDefinicion, sugerencia: RbSugerencia, quitados: string[]) => void
}

export function RbGaleria({ catalogo, grupoId, onClose, onUsar }: Props) {
  const [pestania, setPestania] = useState<Pestania>('plantillas')
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  const grupo = catalogo.grupos?.find((g) => g.id === grupoId) ?? null

  const { data: plantillas = [], isLoading: cargandoP } = useQuery({
    queryKey: ['rb-plantillas'],
    queryFn: () => reporteDiarioService.builderPlantillas(),
    staleTime: 30 * 60_000,
  })
  const { data: guardados = [], isLoading: cargandoG } = useQuery({
    queryKey: ['suite-reportes-builder-guardados'],
    queryFn: () => reporteDiarioService.builderListReportes(),
  })

  const items: Item[] = useMemo(() => {
    if (pestania === 'plantillas') {
      return plantillas.map((p) => ({
        clave: `p:${p.id}`, nombre: p.nombre, descripcion: p.descripcion, etiqueta: p.categoria,
        origen: p.origen, definicion: p.definicion, requiere: p.requiere,
      }))
    }
    return guardados
      .filter((r) => r.definicion && catalogo.origenes[r.origen])
      .map((r) => {
        const g = catalogo.grupos?.find((x) => x.id === r.definicion?.grupoId)
        return {
          clave: `r:${r.id}`, nombre: r.nombre, descripcion: r.descripcion, etiqueta: r.carpeta,
          origen: r.origen, definicion: r.definicion!, requiere: catalogo.origenes[r.origen]?.requiere ?? null,
          detalle: [g ? `Grupo ${g.nombre}` : null, r.creadoNombre ? `creó ${r.creadoNombre}` : null].filter(Boolean).join(' · '),
        }
      })
  }, [pestania, plantillas, guardados, catalogo])

  const categorias = [...new Set(items.map((i) => i.etiqueta))]
  const texto = q.trim().toLowerCase()
  const visibles = items.filter((i) =>
    (!categoria || i.etiqueta === categoria) &&
    (!texto || `${i.nombre} ${i.descripcion}`.toLowerCase().includes(texto)))
  const actual = items.find((i) => i.clave === sel) ?? null
  const aplica = (i: Item) => !grupo || !i.requiere || i.requiere.includes(grupo.modalidad)

  const cambiarPestania = (p: Pestania) => { setPestania(p); setCategoria(null); setSel(null); setQ('') }
  const cargando = pestania === 'plantillas' ? cargandoP : cargandoG

  return (
    <Modal isOpen onClose={onClose} title="Empezar desde una plantilla o copia" size="full">
      <div className="flex min-h-[70vh] flex-col gap-3 lg:flex-row">
        {/* Lista */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:max-w-[58%]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-gray-200 text-[0.75rem] font-semibold">
              {([['plantillas', 'Plantillas', LayoutTemplate], ['copiar', 'Copiar de otro reporte', Copy]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => cambiarPestania(id)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 transition', pestania === id ? 'bg-brand/10 text-brand' : 'bg-white text-ink-secondary hover:bg-gray-50')}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2">
              <Search className="h-3.5 w-3.5 text-ink-tertiary" />
              <input className="w-full bg-transparent py-1.5 text-[0.78rem] outline-none" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {grupo && (
            <p className="flex items-center gap-1.5 text-[0.7rem] text-ink-tertiary">
              <Users className="h-3.5 w-3.5" /> Se copiará para el grupo <span className="font-semibold text-ink-secondary">{grupo.nombre}</span>.
            </p>
          )}

          {categorias.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {[null, ...categorias].map((c) => (
                <button
                  key={c ?? '__todas'}
                  onClick={() => setCategoria(c)}
                  className={clsx(
                    'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition',
                    categoria === c ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
                  )}
                >
                  {c ?? 'Todas'}
                </button>
              ))}
            </div>
          )}

          {cargando ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : visibles.length === 0 ? (
            <p className="py-12 text-center text-[0.8rem] text-ink-tertiary">
              {pestania === 'copiar' ? 'No hay reportes guardados que puedas copiar.' : 'Sin plantillas que coincidan.'}
            </p>
          ) : (
            <div className="grid gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3" style={{ maxHeight: '64vh' }}>
              {visibles.map((i) => {
                const origen = catalogo.origenes[i.origen]
                const { dims, mets } = columnasDeDefinicion(i.definicion, origen)
                const tipo = formaEfectiva(i.definicion.visual?.tipo, dims, mets, 10)
                const ok = aplica(i)
                return (
                  <button
                    key={i.clave}
                    onClick={() => setSel(i.clave)}
                    className={clsx(
                      'rounded-xl border p-2 text-left transition',
                      sel === i.clave ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-gray-200 bg-white hover:border-gray-300',
                      !ok && 'opacity-60',
                    )}
                  >
                    <RbMiniatura tipo={tipo} series={dims.length === 2 ? 3 : mets.length} className="h-16 w-full" />
                    <p className="mt-1.5 text-[0.78rem] font-semibold leading-tight text-ink">{i.nombre}</p>
                    <p className="mt-0.5 text-[0.65rem] text-ink-tertiary">{i.etiqueta} · {origen?.label}</p>
                    {!ok && <p className="mt-1 text-[0.62rem] font-semibold text-amber-600">No aplica a este grupo</p>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detalle + vista previa */}
        <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
          {actual ? (
            <Detalle key={`${actual.clave}-${grupoId}`} item={actual} catalogo={catalogo} grupoId={grupoId} onUsar={onUsar} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <Eye className="h-6 w-6 text-ink-tertiary" />
              <p className="text-[0.8rem] font-semibold text-ink-secondary">Elige una configuración</p>
              <p className="max-w-xs text-[0.72rem] text-ink-tertiary">Verás cómo quedaría con tus datos antes de usarla. Siempre se crea una copia independiente.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Detalle({ item, catalogo, grupoId, onUsar }: {
  item: Item
  catalogo: RbCatalogo
  grupoId: number | null
  onUsar: Props['onUsar']
}) {
  const origen = catalogo.origenes[item.origen]
  const esCopia = item.clave.startsWith('r:')

  // 1) Copia ajustada al grupo (el servidor dice qué se quitó o por qué no aplica)
  const { data: adaptado, isLoading: adaptando, error: errorAdaptar } = useQuery({
    queryKey: ['rb-adaptar', item.clave, grupoId],
    queryFn: () => reporteDiarioService.builderAdaptar(item.definicion, grupoId),
    staleTime: 5 * 60_000,
  })
  // 2) Vista previa con datos reales de esa copia
  const defPrevia = adaptado?.aplica ? { ...adaptado.definicion, limite: Math.min(adaptado.definicion.limite ?? 200, 200) } : null
  const { data: previa, isFetching: calculando, error: errorPrevia } = useQuery({
    queryKey: ['rb-previa', item.clave, grupoId],
    queryFn: () => reporteDiarioService.builderEjecutar(defPrevia!),
    enabled: !!defPrevia,
    staleTime: 2 * 60_000,
  })

  const desc = describirDefinicion(adaptado?.definicion ?? item.definicion, origen)

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">{esCopia ? 'Copiar reporte' : 'Plantilla'} · {item.etiqueta}</p>
        <h3 className="text-sm font-bold text-ink">{item.nombre}</h3>
        {item.descripcion && <p className="mt-0.5 text-[0.75rem] text-ink-secondary">{item.descripcion}</p>}
        {item.detalle && <p className="mt-0.5 text-[0.68rem] text-ink-tertiary">{item.detalle}</p>}
      </div>

      {/* Cómo quedaría */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="mb-2 flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
          <span>Vista previa con tus datos</span>
          {calculando && <Spinner size="sm" />}
        </p>
        {adaptando ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : errorAdaptar ? (
          <p className="text-[0.75rem] text-red-600">{getApiError(errorAdaptar)}</p>
        ) : adaptado && !adaptado.aplica ? (
          <p className="flex items-center gap-1.5 text-[0.75rem] text-amber-700"><AlertTriangle className="h-4 w-4" /> {adaptado.motivo}</p>
        ) : errorPrevia ? (
          <p className="text-[0.75rem] text-red-600">{getApiError(errorPrevia)}</p>
        ) : previa ? (
          previa.filas.length === 0 ? (
            <p className="py-6 text-center text-[0.75rem] text-ink-tertiary">Sin datos en el periodo ({desc.periodo.toLowerCase()}). La configuración funciona; se llenará cuando haya actividad.</p>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto">
              <RbGrafica resultado={previa} visual={adaptado?.definicion.visual ?? { tipo: 'auto' }} />
              {previa.meta.truncado && <p className="mt-1 text-[0.65rem] text-ink-tertiary">Vista previa con las primeras {previa.meta.limite} filas.</p>}
            </div>
          )
        ) : (
          <div className="flex justify-center py-10"><Spinner /></div>
        )}
      </div>

      {/* Qué incluye */}
      <dl className="grid gap-1.5 text-[0.72rem]">
        <Fila t="Origen" v={origen?.label ?? item.origen} />
        <Fila t="Periodo" v={desc.periodo} />
        <Fila t="Desglose" v={desc.desgloses.join(' → ') || 'Sin desglose (indicadores)'} />
        <Fila t="Métricas" v={desc.metricas.join(', ')} />
        {desc.filtros.length > 0 && <Fila t="Filtros" v={desc.filtros.join(' · ')} />}
        {desc.extras.length > 0 && <Fila t="Además" v={desc.extras.join(' · ')} />}
      </dl>

      {adaptado && adaptado.quitados.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[0.7rem] text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Para este grupo se quitan: {adaptado.quitados.join(', ')} (eran del grupo original). Puedes volver a elegirlos después.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
        <p className="text-[0.66rem] text-ink-tertiary">Se crea una copia independiente: {esCopia ? 'el reporte original no cambia.' : 'podrás ajustarla antes de guardar.'}</p>
        <Button
          disabled={!adaptado?.aplica}
          onClick={() => adaptado && onUsar(
            adaptado.definicion,
            { nombre: esCopia ? `Copia de ${item.nombre}` : item.nombre, descripcion: item.descripcion },
            adaptado.quitados,
          )}
        >
          <Check className="h-4 w-4" /> Usar esta configuración
        </Button>
      </div>
    </div>
  )
}

function Fila({ t, v }: { t: string; v: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <dt className="font-semibold text-ink-tertiary">{t}</dt>
      <dd className="text-ink-secondary">{v}</dd>
    </div>
  )
}
