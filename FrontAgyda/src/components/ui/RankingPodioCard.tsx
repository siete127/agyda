import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

export interface RankingPodioItem {
  id: number | string
  nombre: string
  valor: number
  fotoUrl?: string | null
}

export interface FiltroPeriodo {
  tipo: 'semana' | 'mes' | 'rango'
  /** Solo si tipo === 'mes'. 'YYYY-MM'. Vacío = mes actual. */
  mes?: string
  /** Solo si tipo === 'rango'. 'YYYY-MM-DD'. */
  desde?: string
  hasta?: string
}

interface Props {
  titulo: string
  descripcion: string
  icono: React.ReactNode
  items: RankingPodioItem[]
  /** Cómo mostrar el valor (ej. "212" o "120%"). */
  formatoValor?: (v: number) => string
  etiquetaColumna: string
  filtro: FiltroPeriodo
  onFiltroChange: (f: FiltroPeriodo) => void
  isLoading?: boolean
}

const hoyISO = () => new Date().toISOString().slice(0, 10)
const mesActualISO = () => new Date().toISOString().slice(0, 7)

// Podio en CSS puro (sin imagen externa que calibrar): cada columna es un
// cilindro con franja superior + cuerpo, alineados por abajo (items-end) para
// que las bases queden a la misma altura aunque tengan alturas distintas.
// Colores de marca ArdaBytec: azul oscuro #0F2042, azul eléctrico #017EFD,
// verde agua #17C1A3.
const PODIO_ESTILOS = [
  { orden: 2, alto: 48, tapa: '#0F2042', cuerpo: 'linear-gradient(180deg,#1E3A6E,#0F2042)' },
  { orden: 1, alto: 68, tapa: '#017EFD', cuerpo: 'linear-gradient(180deg,#3B9CFF,#017EFD)' },
  { orden: 3, alto: 38, tapa: '#17C1A3', cuerpo: 'linear-gradient(180deg,#3FD9BB,#17C1A3)' },
]

export function RankingPodioCard({
  titulo, descripcion, icono, items,
  formatoValor = (v) => String(v), etiquetaColumna,
  filtro, onFiltroChange, isLoading,
}: Props) {
  const [expandido, setExpandido] = useState(false)

  const top3 = items.slice(0, 3)
  const resto = items.slice(3, 10)
  const podioOrdenado = PODIO_ESTILOS
    .map((est) => ({ est, item: top3[est.orden - 1] }))
    .filter((x) => x.item)

  const inputCls = 'rounded-lg border border-gray-200 bg-card px-1.5 py-1 text-[0.66rem] font-semibold text-gray-600 outline-none'

  return (
    <div className="relative flex flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
            {icono}
          </span>
          <div className="min-w-0">
            <p className="text-[0.85rem] font-bold leading-tight text-gray-900">{titulo}</p>
            <p className="text-[0.68rem] leading-tight text-gray-400">{descripcion}</p>
          </div>
        </div>
      </div>

      {/* Filtro de periodo */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <select
          value={filtro.tipo}
          onChange={(e) => onFiltroChange({ tipo: e.target.value as FiltroPeriodo['tipo'] })}
          className={inputCls}
        >
          <option value="semana">Esta semana</option>
          <option value="mes">Por mes</option>
          <option value="rango">Rango de fechas</option>
        </select>

        {filtro.tipo === 'mes' && (
          <input
            type="month"
            value={filtro.mes || mesActualISO()}
            max={mesActualISO()}
            onChange={(e) => onFiltroChange({ tipo: 'mes', mes: e.target.value })}
            className={inputCls}
          />
        )}

        {filtro.tipo === 'rango' && (
          <>
            <input
              type="date"
              value={filtro.desde || ''}
              max={filtro.hasta || hoyISO()}
              onChange={(e) => onFiltroChange({ tipo: 'rango', desde: e.target.value, hasta: filtro.hasta })}
              className={inputCls}
            />
            <span className="text-[0.66rem] text-gray-400">a</span>
            <input
              type="date"
              value={filtro.hasta || ''}
              min={filtro.desde}
              max={hoyISO()}
              onChange={(e) => onFiltroChange({ tipo: 'rango', desde: filtro.desde, hasta: e.target.value })}
              className={inputCls}
            />
          </>
        )}
      </div>

      {filtro.tipo === 'rango' && (!filtro.desde || !filtro.hasta) ? (
        <div className="flex h-40 items-center justify-center text-center text-[0.75rem] text-gray-400">
          Elige fecha de inicio y de fin para ver el ranking.
        </div>
      ) : isLoading ? (
        <div className="flex h-40 items-center justify-center text-[0.75rem] text-gray-400">Cargando…</div>
      ) : top3.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-center text-[0.75rem] text-gray-400">
          Sin datos para este periodo todavía.
        </div>
      ) : (
        <>
          {/* Podio — 100% CSS, sin imagen externa que calibrar */}
          <div className="mb-3 flex items-end justify-center gap-3 px-1 podio-rp-wrap">
            {podioOrdenado.map(({ est, item }, i) => (
              <div
                key={item.id}
                className="flex flex-1 flex-col items-center gap-1 podio-rp-col"
                style={{ maxWidth: 88, animationDelay: `${i * 90}ms` }}
              >
                <div className={`flex flex-col items-center ${est.orden === 1 ? 'podio-rp-float' : ''}`}>
                  {est.orden === 1 ? (
                    <img src="/images/corona.gif" alt="" className="-mb-1.5 h-12 w-12 flex-shrink-0 object-contain" draggable={false} />
                  ) : (
                    <div className="h-8" />
                  )}
                  <Avatar src={item.fotoUrl} name={item.nombre} size="lg" ring="white" />
                </div>
                <p className="w-full truncate text-center text-[0.68rem] font-bold text-gray-800">{item.nombre.split(' ').slice(0, 2).join(' ')}</p>
                <p className="text-[1.05rem] font-extrabold leading-none" style={{ color: est.tapa }}>
                  {formatoValor(item.valor)} <span className="text-[0.62rem] font-semibold text-gray-400">{etiquetaColumna.toLowerCase()}</span>
                </p>
                {/* Cilindro: franja superior sólida + cuerpo con degradado + número */}
                <div className="podio-rp-cilindro relative flex w-full flex-col overflow-hidden rounded-xl shadow-sm" style={{ height: est.alto }}>
                  <div className="h-2 w-full flex-shrink-0" style={{ background: est.tapa }} />
                  <div className="flex flex-1 items-center justify-center" style={{ background: est.cuerpo }}>
                    <span className="text-xl font-extrabold text-white drop-shadow">{est.orden}</span>
                  </div>
                  <div className="podio-rp-brillo" />
                </div>
              </div>
            ))}
          </div>

          {/* "Ver más agentes" — popover flotante encima del contenido de abajo, no empuja el layout */}
          {resto.length > 0 && (
            <div className="relative border-t border-gray-100 pt-2">
              <button
                onClick={() => setExpandido((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-[0.7rem] font-semibold text-brand"
              >
                Ver más agentes ({resto.length})
                <ChevronDown className={`h-3.5 w-3.5 podio-rp-chevron ${expandido ? 'podio-rp-chevron-open' : ''}`} />
              </button>

              {expandido && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExpandido(false)} />
                  <div className="podio-rp-popover absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-gray-100 bg-card p-2 shadow-xl">
                    <ul className="space-y-1">
                      {resto.map((it, i) => (
                        <li key={it.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[0.76rem]">
                          <span className="w-4 flex-shrink-0 text-right font-semibold text-gray-400">{i + 4}</span>
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-700">{it.nombre}</span>
                          <span className="flex-shrink-0 font-bold text-gray-800">{formatoValor(it.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          <style>{`
            .podio-rp-col {
              opacity: 0;
              animation: podioRpEntrada 0.45s ease-out forwards;
            }
            @keyframes podioRpEntrada {
              from { opacity: 0; transform: translateY(14px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .podio-rp-float {
              animation: podioRpFlotar 3.2s ease-in-out infinite;
            }
            @keyframes podioRpFlotar {
              0%, 100% { transform: translateY(0); }
              50%      { transform: translateY(-3px); }
            }
            .podio-rp-cilindro { position: relative; }
            .podio-rp-brillo {
              position: absolute;
              inset: 0;
              background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%);
              background-size: 250% 100%;
              background-position: 150% 0;
              animation: podioRpBrillo 6s ease-in-out infinite;
              animation-delay: 2s;
              pointer-events: none;
            }
            @keyframes podioRpBrillo {
              0%, 85%, 100% { background-position: 150% 0; }
              92%           { background-position: -50% 0; }
            }
            .podio-rp-chevron { transition: transform 0.2s ease; }
            .podio-rp-chevron-open { transform: rotate(180deg); }
            .podio-rp-popover {
              opacity: 0;
              transform: translateY(-4px);
              animation: podioRpPopover 0.18s ease-out forwards;
            }
            @keyframes podioRpPopover {
              to { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              .podio-rp-col { opacity: 1; animation: none; transform: none; }
              .podio-rp-float { animation: none; }
              .podio-rp-brillo { animation: none; display: none; }
              .podio-rp-chevron { transition: none; }
              .podio-rp-popover { opacity: 1; animation: none; transform: none; }
            }
          `}</style>
        </>
      )}
    </div>
  )
}
