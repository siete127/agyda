import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Check, ChevronDown, Search, UserX, Users, X } from 'lucide-react'
import { Avatar } from './Avatar'

export interface OpcionAgente { id: number; nombre: string }
/** Una pestaña del selector (p. ej. "Campaña", "Todos", "Deshabilitados"). */
export interface VistaAgentes {
  id: string
  label: string
  agentes: OpcionAgente[]
  /** Agentes dados de baja: se muestran atenuados y con etiqueta. */
  deshabilitados?: boolean
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// "ANGELICA VILLEGAS LUNA" → "Angelica Villegas Luna" (solo si viene todo en mayúsculas).
const nombreBonito = (s: string) => {
  const limpio = s.trim().replace(/\s+/g, ' ')
  if (limpio !== limpio.toUpperCase()) return limpio
  return limpio.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, esp: string, l: string) => esp + l.toUpperCase())
}
function IconoTodos() {
  return <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-ink-tertiary"><Users className="h-3.5 w-3.5" /></span>
}
const ordenar = (lista: OpcionAgente[]) =>
  lista.map((a) => ({ ...a, bonito: nombreBonito(a.nombre) })).sort((a, b) => a.bonito.localeCompare(b.bonito, 'es'))

/**
 * Selector de agente con pestañas, buscador y avatar. `value` = '' para "todos".
 * Teclado: ↑/↓ para moverse, Enter para elegir, Esc para cerrar.
 */
export function SelectorAgente({ vistas, value, onChange, placeholder = 'Todos los agentes' }: {
  vistas: VistaAgentes[]
  value: number | ''
  onChange: (id: number | '') => void
  placeholder?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [vistaId, setVistaId] = useState(vistas[0]?.id ?? '')
  const [busqueda, setBusqueda] = useState('')
  const [activo, setActivo] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const idLista = useId()

  const vista = vistas.find((v) => v.id === vistaId) ?? vistas[0]
  const vistaDe = (id: number | '') => (id === '' ? undefined : vistas.find((v) => v.agentes.some((a) => a.id === id)))
  const seleccionado = value === '' ? null : vistas.flatMap((v) => v.agentes).find((a) => a.id === value) ?? null
  const selDeshabilitado = !!vistaDe(value)?.deshabilitados

  const opciones = useMemo(() => {
    const q = sinAcentos(busqueda.trim())
    const filtrados = ordenar(vista?.agentes ?? []).filter((a) => !q || sinAcentos(a.nombre).includes(q))
    // "Todos" solo aparece si no se está buscando.
    return q ? filtrados : [{ id: 0, nombre: '', bonito: placeholder }, ...filtrados]
  }, [vista, busqueda, placeholder])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  const irAVista = (id: string, conSeleccion = false) => {
    setVistaId(id)
    setBusqueda('')
    const v = vistas.find((x) => x.id === id)
    const i = conSeleccion && value !== '' && v ? ordenar(v.agentes).findIndex((a) => a.id === value) + 1 : 0
    setActivo(Math.max(0, i))
    buscador.current?.focus()
  }
  const abrir = () => {
    // Se abre en la pestaña del agente elegido (o en la primera).
    irAVista(vistaDe(value)?.id ?? vistas[0]?.id ?? '', true)
    setAbierto(true)
  }
  const elegir = (id: number) => { onChange(id === 0 ? '' : id); setAbierto(false) }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i) => Math.min(opciones.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = opciones[activo]; if (o) elegir(o.id) }
    else if (e.key === 'Escape') setAbierto(false)
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={clsx('field flex items-center gap-2.5 py-2 text-left', abierto && 'border-brand ring-2 ring-brand/15')}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
      >
        {seleccionado ? (
          <span className={clsx(selDeshabilitado && 'opacity-50 grayscale')}><Avatar name={nombreBonito(seleccionado.nombre)} size="sm" /></span>
        ) : <IconoTodos />}
        <span className={clsx('min-w-0 flex-1 truncate', seleccionado ? 'font-medium text-ink' : 'text-ink-secondary')}>
          {seleccionado ? nombreBonito(seleccionado.nombre) : placeholder}
        </span>
        {selDeshabilitado && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.62rem] font-semibold text-ink-tertiary">Deshabilitado</span>}
        {seleccionado && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="rounded-full p-1 text-ink-tertiary hover:bg-gray-100 hover:text-ink"
            aria-label="Quitar agente"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={clsx('h-4 w-4 flex-shrink-0 text-ink-tertiary transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-card shadow-xl ring-1 ring-black/5">
          {vistas.length > 1 && (
            <div className="flex gap-1 border-b border-gray-100 bg-gray-50/70 p-1.5" role="tablist">
              {vistas.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={v.id === vista?.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => irAVista(v.id)}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.74rem] font-semibold transition',
                    v.id === vista?.id ? 'bg-card text-ink shadow-sm ring-1 ring-black/5' : 'text-ink-tertiary hover:text-ink',
                  )}
                >
                  {v.deshabilitados && <UserX className="h-3.5 w-3.5" />}
                  {v.label}
                  <span className={clsx('rounded-full px-1.5 text-[0.62rem]', v.id === vista?.id ? 'bg-brand/10 text-brand' : 'bg-gray-200/70 text-ink-tertiary')}>
                    {v.agentes.length}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="relative border-b border-gray-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input
              ref={buscador}
              autoFocus
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setActivo(0) }}
              onKeyDown={onKey}
              placeholder={vista?.deshabilitados ? 'Buscar agente deshabilitado…' : 'Buscar agente…'}
              className="w-full rounded-lg bg-gray-50 py-2 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:bg-gray-100"
              role="combobox"
              aria-expanded
              aria-controls={idLista}
              aria-activedescendant={`${idLista}-${activo}`}
            />
          </div>
          <ul ref={lista} id={idLista} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {opciones.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink-tertiary">
                {busqueda ? `Ningún agente coincide con «${busqueda}»` : 'No hay agentes en esta vista'}
              </li>
            ) : opciones.map((o, i) => {
              const esSel = o.id === 0 ? value === '' : o.id === value
              return (
                <li
                  key={o.id}
                  id={`${idLista}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={esSel}
                  onMouseEnter={() => setActivo(i)}
                  onMouseDown={(e) => { e.preventDefault(); elegir(o.id) }}
                  className={clsx(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    i === activo && 'bg-brand/[0.07]',
                    o.id === 0 && 'mb-1 border-b border-gray-100 pb-2',
                  )}
                >
                  {o.id === 0 ? <IconoTodos /> : (
                    <span className={clsx(vista?.deshabilitados && 'opacity-50 grayscale')}><Avatar name={o.bonito} size="sm" /></span>
                  )}
                  <span className={clsx('min-w-0 flex-1 truncate',
                    esSel ? 'font-semibold text-brand' : vista?.deshabilitados && o.id !== 0 ? 'text-ink-secondary' : 'text-ink')}>
                    {o.bonito}
                  </span>
                  {vista?.deshabilitados && o.id !== 0 && !esSel && (
                    <span className="rounded-full bg-gray-100 px-1.5 text-[0.6rem] font-semibold text-ink-tertiary">Deshabilitado</span>
                  )}
                  {esSel && <Check className="h-4 w-4 flex-shrink-0 text-brand" />}
                </li>
              )
            })}
          </ul>
          <div className="border-t border-gray-100 px-3 py-1.5 text-[0.68rem] text-ink-tertiary">
            ↑↓ para moverte · Enter para elegir · Esc para cerrar
          </div>
        </div>
      )}
    </div>
  )
}
