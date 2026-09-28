import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Mic, MicOff, Pause, Play, Delete,
  Loader2, RefreshCw, Power, AudioLines, AlertTriangle,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSoftphoneStore, type EstadoRegistro } from '@/stores/softphone.store'
import {
  conectarVista, desconectar, llamar, probarEco, contestar, colgar,
  silenciar, espera, enviarDtmf, limpiarNumero,
} from '@/services/softphone.service'
import type { VistaWebphone } from '@/components/ui/WebphoneFrame'
import { useCronometro, formatoDuracion } from '@/hooks/useSoftphone'

const TECLAS: { tecla: string; letras: string }[] = [
  { tecla: '1', letras: '' }, { tecla: '2', letras: 'ABC' }, { tecla: '3', letras: 'DEF' },
  { tecla: '4', letras: 'GHI' }, { tecla: '5', letras: 'JKL' }, { tecla: '6', letras: 'MNO' },
  { tecla: '7', letras: 'PQRS' }, { tecla: '8', letras: 'TUV' }, { tecla: '9', letras: 'WXYZ' },
  { tecla: '*', letras: '' }, { tecla: '0', letras: '+' }, { tecla: '#', letras: '' },
]

const REGISTRO_UI: Record<EstadoRegistro, { texto: string; clase: string; punto: string }> = {
  registrado:   { texto: 'Disponible',     clase: 'bg-emerald-50 text-emerald-700', punto: 'bg-emerald-500' },
  conectando:   { texto: 'Conectando…',    clase: 'bg-blue-50 text-blue-700',       punto: 'bg-blue-500 animate-pulse' },
  reconectando: { texto: 'Reconectando…',  clase: 'bg-amber-50 text-amber-700',     punto: 'bg-amber-500 animate-pulse' },
  desconectado: { texto: 'Desconectado',   clase: 'bg-gray-100 text-gray-600',      punto: 'bg-gray-400' },
  error:        { texto: 'Sin conexión',   clase: 'bg-red-50 text-red-700',         punto: 'bg-red-500' },
}

const ejecutar = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error(e instanceof Error ? e.message : 'Error'))

/**
 * Softphone de una vista PBX. El registro y la llamada viven en
 * softphone.service (nivel módulo): salir de /webphone no corta nada, y
 * SoftphoneLlamadaFlotante sigue mostrando la llamada en cualquier módulo.
 */
export function SoftphonePanel({ vista }: { vista: VistaWebphone }) {
  const { registro, extension, error, avisoMic, llamada, vistaId } = useSoftphoneStore()
  const [params] = useSearchParams()
  const [numero, setNumero] = useState(() => params.get('numero') ?? '')
  const [dtmf, setDtmf] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const duracion = useCronometro(llamada?.estado === 'en-llamada' ? llamada.inicio : null)

  const registrado = registro === 'registrado'
  const enLlamada = llamada?.estado === 'en-llamada'
  const ocupado = !!llamada && llamada.estado !== 'finalizada'

  // Conectar al entrar (o si cambió la vista PBX asignada); si falla se queda
  // en error con botón de reintentar — nada de reintentos en bucle. Si el PBX
  // ya rechazó estas credenciales, el servicio ni siquiera lo intenta.
  useEffect(() => {
    if (registro === 'desconectado' || registro === 'error' || (vistaId !== null && vistaId !== vista.id)) {
      void conectarVista(vista.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.id])

  useEffect(() => { if (!ocupado) setDtmf('') }, [ocupado])

  // En llamada, el teclado físico manda tonos (IVR del otro lado) si el foco
  // no está en un campo de texto.
  useEffect(() => {
    if (!enLlamada) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-9*#]$/.test(e.key)) pulsar(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLlamada])

  const pulsar = (tecla: string) => {
    if (enLlamada) {
      enviarDtmf(tecla)
      setDtmf((d) => (d + tecla).slice(-24))
    } else if (!ocupado) {
      setNumero((n) => n + tecla)
      inputRef.current?.focus()
    }
  }

  const marcar = () => {
    if (!limpiarNumero(numero)) { inputRef.current?.focus(); return }
    ejecutar(() => llamar(numero))
  }

  const ui = REGISTRO_UI[registro]

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      {/* ── Estado de la extensión ── */}
      <div className="card flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', ui.clase)}>
            <span className={clsx('h-2 w-2 rounded-full', ui.punto)} />
            {ui.texto}
          </span>
          {extension && <span className="truncate text-xs text-ink-tertiary">Ext. {extension}</span>}
        </div>
        {registro === 'registrado' || registro === 'reconectando' ? (
          <button
            onClick={() => ejecutar(desconectar)}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-gray-100 disabled:opacity-40"
            title={ocupado ? 'Termina la llamada antes de desconectar' : 'Dejar de recibir llamadas'}
          >
            <Power className="h-3.5 w-3.5" /> Desconectar
          </button>
        ) : registro !== 'conectando' && (
          <button
            onClick={() => ejecutar(() => conectarVista(vista.id, { manual: true }))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            {registro === 'error' ? <RefreshCw className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            {registro === 'error' ? 'Reintentar' : 'Conectar'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {avisoMic && registro !== 'error' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <MicOff className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {avisoMic} Puedes recibir el timbre, pero no hablar hasta resolverlo.{' '}
            <button onClick={() => ejecutar(() => conectarVista(vista.id, { manual: true }))} className="font-semibold underline">
              Volver a probar
            </button>
          </span>
        </div>
      )}

      {/* ── Llamada actual ── */}
      {llamada && (
        <div
          className={clsx(
            'card px-5 py-4 text-center',
            llamada.estado === 'timbrando' && 'ring-2 ring-emerald-400 animate-pulse',
            llamada.estado === 'finalizada' && 'opacity-70',
          )}
        >
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
            {llamada.direccion === 'entrante' ? <PhoneIncoming className="h-3.5 w-3.5" /> : <PhoneOutgoing className="h-3.5 w-3.5" />}
            {llamada.estado === 'marcando' && 'Llamando…'}
            {llamada.estado === 'timbrando' && 'Llamada entrante'}
            {llamada.estado === 'en-llamada' && (llamada.enEspera ? 'En espera' : 'En llamada')}
            {llamada.estado === 'finalizada' && llamada.motivoFin}
          </p>
          {llamada.nombre && <p className="mt-1.5 truncate text-lg font-bold text-ink">{llamada.nombre}</p>}
          <p className={clsx('truncate font-mono text-ink', llamada.nombre ? 'text-sm text-ink-secondary' : 'mt-1.5 text-xl font-bold')}>
            {llamada.numero || 'Número privado'}
          </p>
          {llamada.estado === 'en-llamada' && (
            <p className="mt-1 font-mono text-sm tabular-nums text-emerald-600">{formatoDuracion(duracion)}</p>
          )}
          {dtmf && <p className="mt-1 truncate font-mono text-xs tracking-widest text-ink-tertiary">{dtmf}</p>}

          {llamada.estado !== 'finalizada' && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {enLlamada && (
                <>
                  <BotonRedondo
                    activo={llamada.silenciada}
                    onClick={() => silenciar(!llamada.silenciada)}
                    titulo={llamada.silenciada ? 'Activar micrófono' : 'Silenciar'}
                  >
                    {llamada.silenciada ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </BotonRedondo>
                  <BotonRedondo
                    activo={llamada.enEspera}
                    onClick={() => ejecutar(() => espera(!llamada.enEspera))}
                    titulo={llamada.enEspera ? 'Retomar llamada' : 'Poner en espera'}
                  >
                    {llamada.enEspera ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                  </BotonRedondo>
                </>
              )}
              {llamada.estado === 'timbrando' && (
                <button
                  onClick={() => ejecutar(contestar)}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600 active:scale-95"
                  title="Contestar"
                >
                  <Phone className="h-6 w-6" />
                </button>
              )}
              <button
                onClick={() => ejecutar(colgar)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 active:scale-95"
                title={llamada.estado === 'timbrando' ? 'Rechazar' : 'Colgar'}
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Marcador ── */}
      <div className="card px-5 py-4">
        {!ocupado && (
          <div className="relative mb-3">
            <input
              ref={inputRef}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && registrado) marcar() }}
              placeholder="Número a marcar"
              inputMode="tel"
              autoComplete="off"
              className="w-full rounded-xl border border-gray-200 bg-surface px-4 py-3 pr-10 text-center font-mono text-xl tracking-wide text-ink focus:border-brand focus:outline-none"
            />
            {numero && (
              <button
                onClick={() => setNumero((n) => n.slice(0, -1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-tertiary hover:bg-gray-100"
                title="Borrar"
              >
                <Delete className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {ocupado && !enLlamada && <p className="mb-3 text-center text-xs text-ink-tertiary">El teclado se activa al contestar.</p>}
        {enLlamada && <p className="mb-3 text-center text-xs text-ink-tertiary">Teclado de tonos — para menús del otro lado.</p>}

        <div className="grid grid-cols-3 gap-2">
          {TECLAS.map(({ tecla, letras }) => (
            <button
              key={tecla}
              onClick={() => pulsar(tecla)}
              disabled={ocupado && !enLlamada}
              className="flex h-14 flex-col items-center justify-center rounded-xl bg-surface text-ink transition hover:bg-gray-100 active:scale-95 disabled:opacity-40"
            >
              <span className="text-xl font-semibold leading-none">{tecla}</span>
              {letras && <span className="mt-0.5 text-[0.55rem] font-semibold tracking-widest text-ink-tertiary">{letras}</span>}
            </button>
          ))}
        </div>

        {!ocupado && (
          <button
            onClick={marcar}
            disabled={!registrado || !limpiarNumero(numero)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {registro === 'conectando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
            Llamar
          </button>
        )}
      </div>

      {registrado && !ocupado && (
        <button
          onClick={() => ejecutar(probarEco)}
          className="mx-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-ink-tertiary hover:bg-gray-100 hover:text-brand"
          title="Llama a la prueba de eco del PBX: escucharás tu propia voz"
        >
          <AudioLines className="h-3.5 w-3.5" /> Probar micrófono y audio
        </button>
      )}
    </div>
  )
}

function BotonRedondo({ activo, onClick, titulo, children }: {
  activo: boolean; onClick: () => void; titulo: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      className={clsx(
        'flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95',
        activo ? 'bg-brand text-white' : 'bg-gray-100 text-ink-secondary hover:bg-gray-200',
      )}
    >
      {children}
    </button>
  )
}
