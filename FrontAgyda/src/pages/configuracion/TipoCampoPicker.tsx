import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import {
  Type, AlignLeft, Hash, Phone, Mail, Calendar, Clock, CalendarClock, ChevronDownSquare, CircleDot, CheckSquare, ToggleLeft,
  ListChecks, DollarSign, Percent, Link2, Paperclip, Image, PenTool, Database, UserRound, Building2, Calculator, EyeOff,
  Heading, Minus, Search, PhoneCall, ChevronDown, Check, X,
} from 'lucide-react'
import type { CCFormTipoCampo } from '@/types/ccFormularios.types'

type Info = { nombre: string; desc: string; ejemplo: string; icon: typeof Type; grupo: string }

// Qué datos acepta cada tipo de campo (lo que ve quien diseña el formulario).
const INFO: Record<string, Info> = {
  texto_corto: { nombre: 'Texto corto', desc: 'Una línea de texto libre: nombres, folios, claves.', ejemplo: 'Juan Pérez', icon: Type, grupo: 'Texto' },
  texto_largo: { nombre: 'Texto largo', desc: 'Varias líneas: comentarios, notas u observaciones.', ejemplo: 'El cliente pide…', icon: AlignLeft, grupo: 'Texto' },
  numero: { nombre: 'Número', desc: 'Solo cifras, enteras o con decimales.', ejemplo: '42', icon: Hash, grupo: 'Números y fechas' },
  moneda: { nombre: 'Moneda', desc: 'Importes en pesos con 2 decimales.', ejemplo: '$1,250.00', icon: DollarSign, grupo: 'Números y fechas' },
  porcentaje: { nombre: 'Porcentaje', desc: 'Valor de 0 a 100 con símbolo %.', ejemplo: '15 %', icon: Percent, grupo: 'Números y fechas' },
  fecha: { nombre: 'Fecha', desc: 'Día, mes y año con calendario.', ejemplo: '26/09/2026', icon: Calendar, grupo: 'Números y fechas' },
  hora: { nombre: 'Hora', desc: 'Hora y minutos.', ejemplo: '10:30', icon: Clock, grupo: 'Números y fechas' },
  fecha_hora: { nombre: 'Fecha y hora', desc: 'Día y hora juntos: citas, llamadas de seguimiento.', ejemplo: '26/09/2026 10:30', icon: CalendarClock, grupo: 'Números y fechas' },
  lista: { nombre: 'Lista desplegable', desc: 'Elegir una opción de una lista que tú defines.', ejemplo: 'Estado: Jalisco', icon: ChevronDownSquare, grupo: 'Opciones' },
  radio: { nombre: 'Opción única', desc: 'Elegir una sola opción, todas a la vista.', ejemplo: '○ Mañana  ● Tarde', icon: CircleDot, grupo: 'Opciones' },
  checkbox: { nombre: 'Casillas', desc: 'Marcar una o varias casillas de una lista.', ejemplo: '☑ Correo  ☐ SMS', icon: CheckSquare, grupo: 'Opciones' },
  multiseleccion: { nombre: 'Multiselección', desc: 'Elegir varias opciones de una lista larga.', ejemplo: 'Productos: A, C', icon: ListChecks, grupo: 'Opciones' },
  si_no: { nombre: 'Sí / No', desc: 'Una respuesta de sí o no.', ejemplo: '¿Acepta? Sí', icon: ToggleLeft, grupo: 'Opciones' },
  telefono: { nombre: 'Teléfono', desc: 'Número telefónico a 10 dígitos (valida el formato).', ejemplo: '55 1234 5678', icon: Phone, grupo: 'Contacto' },
  email: { nombre: 'Email', desc: 'Correo electrónico (valida que tenga @ y dominio).', ejemplo: 'cliente@correo.com', icon: Mail, grupo: 'Contacto' },
  url: { nombre: 'URL', desc: 'Dirección de una página web.', ejemplo: 'https://empresa.com', icon: Link2, grupo: 'Contacto' },
  archivo: { nombre: 'Archivo', desc: 'Subir un documento: PDF, Word, Excel…', ejemplo: 'INE.pdf', icon: Paperclip, grupo: 'Archivos y firmas' },
  imagen: { nombre: 'Imagen', desc: 'Subir o tomar una foto.', ejemplo: 'comprobante.jpg', icon: Image, grupo: 'Archivos y firmas' },
  firma: { nombre: 'Firma', desc: 'Firma dibujada con el dedo o el mouse.', ejemplo: '✍ firma del cliente', icon: PenTool, grupo: 'Archivos y firmas' },
  catalogo: { nombre: 'Catálogo', desc: 'Elegir de un catálogo del sistema (productos, estatus…).', ejemplo: 'Producto: Plan Plus', icon: Database, grupo: 'Datos del sistema' },
  usuario_agente: { nombre: 'Usuario / Agente', desc: 'Elegir a un usuario o agente de AGYDA.', ejemplo: 'Ana López', icon: UserRound, grupo: 'Datos del sistema' },
  sucursal: { nombre: 'Sucursal', desc: 'Elegir una sucursal de la empresa.', ejemplo: 'Sucursal Centro', icon: Building2, grupo: 'Datos del sistema' },
  buscador: { nombre: 'Buscador de interacciones', desc: 'Busca al contacto en el historial de la campaña (o lo registra si es nuevo).', ejemplo: 'Buscar por teléfono…', icon: Search, grupo: 'Especiales' },
  pendientes: { nombre: 'Pendientes por contactar', desc: 'Panel con las citas por confirmar, recordar o reagendar. No guarda valor.', ejemplo: '3 citas por confirmar', icon: PhoneCall, grupo: 'Especiales' },
  calculado: { nombre: 'Campo calculado', desc: 'Se calcula solo a partir de otros campos (sumas, totales…).', ejemplo: 'Total = precio × cantidad', icon: Calculator, grupo: 'Especiales' },
  oculto: { nombre: 'Campo oculto', desc: 'Guarda un dato sin mostrarlo (p. ej. lo que manda el marcador).', ejemplo: 'id_llamada', icon: EyeOff, grupo: 'Especiales' },
  titulo: { nombre: 'Título', desc: 'Texto de encabezado para ordenar el formulario. No guarda valor.', ejemplo: 'Datos del cliente', icon: Heading, grupo: 'Diseño' },
  separador: { nombre: 'Separador', desc: 'Línea para dividir secciones. No guarda valor.', ejemplo: '──────', icon: Minus, grupo: 'Diseño' },
}
const GRUPOS = ['Texto', 'Números y fechas', 'Opciones', 'Contacto', 'Archivos y firmas', 'Datos del sistema', 'Especiales', 'Diseño']
const infoDe = (t: string): Info => INFO[t] ?? { nombre: t, desc: '', ejemplo: '', icon: Type, grupo: 'Especiales' }

// Selector del tipo de campo del constructor de formularios: botón con el
// tipo elegido y un menú flotante con buscador, tipos agrupados y, en cada
// uno, qué datos acepta y un ejemplo.
export function TipoCampoPicker({ value, onChange, tipos }: {
  value: CCFormTipoCampo
  onChange: (t: CCFormTipoCampo) => void
  /** Tipos que existen (del backend); si viene vacío, todos los conocidos. */
  tipos: CCFormTipoCampo[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const actual = infoDe(value)
  const ActualIcon = actual.icon

  const disponibles = (tipos.length ? tipos : Object.keys(INFO) as CCFormTipoCampo[])
  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const filtrados = disponibles.filter((k) => {
      const i = infoDe(k)
      return !t || `${i.nombre} ${i.desc} ${i.grupo}`.toLowerCase().includes(t)
    })
    return GRUPOS.map((g) => ({ g, items: filtrados.filter((k) => infoDe(k).grupo === g) })).filter((x) => x.items.length)
  }, [disponibles, busca])

  // Posición del menú (flotante, sobre todo): debajo del botón o arriba si no cabe.
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return
    const calcular = () => {
      const r = boton.current!.getBoundingClientRect()
      const width = Math.min(620, window.innerWidth - 24)
      const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
      const abajo = window.innerHeight - r.bottom - 12
      const arriba = r.top - 12
      const maxH = Math.min(460, Math.max(abajo, arriba))
      const top = abajo >= Math.min(460, arriba) ? r.bottom + 6 : Math.max(12, r.top - 6 - maxH)
      setPos({ top, left, width, maxH })
    }
    calcular()
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    return () => { window.removeEventListener('resize', calcular); window.removeEventListener('scroll', calcular, true) }
  }, [abierto])

  // Cerrar con Esc o clic afuera.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (panel.current?.contains(e.target as Node) || boton.current?.contains(e.target as Node)) return
      setAbierto(false)
    }
    // Esc cierra solo el menú (en captura, antes que el Esc de la ventana que lo contiene).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) } }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc, true) }
  }, [abierto])

  const elegir = (t: CCFormTipoCampo) => { onChange(t); setAbierto(false); setBusca('') }

  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto((v) => !v)}
        className={clsx('flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition',
          abierto ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200 hover:border-violet-300')}>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <ActualIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{actual.nombre}</span>
          {actual.desc && <span className="block truncate text-[0.66rem] text-ink-tertiary">{actual.desc}</span>}
        </span>
        <ChevronDown className={clsx('h-4 w-4 flex-shrink-0 text-ink-tertiary transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && pos && createPortal(
        <div ref={panel} style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
          className="fixed z-[400] flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-2xl animate-fade-in">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <Search className="h-4 w-4 text-gray-300" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tipo de campo (ej. fecha, teléfono, archivo)…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
            {busca && <button onClick={() => setBusca('')} className="rounded p-0.5 text-ink-tertiary hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="overflow-y-auto p-2.5">
            {grupos.length === 0 && <p className="px-2 py-6 text-center text-xs text-ink-tertiary">Ningún tipo coincide con “{busca}”.</p>}
            {grupos.map(({ g, items }) => (
              <div key={g} className="mb-2.5 last:mb-0">
                <p className="mb-1 px-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-ink-tertiary">{g}</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {items.map((k) => {
                    const i = infoDe(k)
                    const Icon = i.icon
                    const sel = k === value
                    return (
                      <button key={k} type="button" onClick={() => elegir(k)}
                        className={clsx('group flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition',
                          sel ? 'border-violet-300 bg-violet-50' : 'border-gray-100 hover:border-violet-200 hover:bg-violet-50/40')}>
                        <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition',
                          sel ? 'bg-violet-600 text-white' : 'bg-gray-100 text-ink-secondary group-hover:bg-violet-100 group-hover:text-violet-600')}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-[0.8rem] font-semibold text-ink">
                            {i.nombre} {sel && <Check className="h-3.5 w-3.5 text-violet-600" />}
                          </span>
                          <span className="block text-[0.68rem] leading-snug text-ink-tertiary">{i.desc}</span>
                          {i.ejemplo && <span className="mt-1 inline-block rounded-md bg-gray-50 px-1.5 py-0.5 font-mono text-[0.62rem] text-ink-secondary">{i.ejemplo}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
