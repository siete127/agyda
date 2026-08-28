import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/axios'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useDraggablePosition } from '@/hooks/useDraggablePosition'

// ── Detección de género ────────────────────────────────────────────────────
const NOMBRES_F = new Set([
  'ana','maria','lucia','laura','sofia','valentina','andrea','alejandra','monica',
  'gabriela','patricia','rosa','carmen','isabel','veronica','adriana','claudia',
  'diana','fernanda','jessica','karla','leticia','luz','martha','nancy','norma',
  'paola','rebeca','silvia','susana','teresa','vanessa','yolanda','brenda','celia',
  'daniela','elena','esperanza','fabiola','gloria','graciela','irene','janeth',
  'josefina','karina','liliana','lorena','magdalena','marisol','miriam','nadia',
  'olivia','perla','rocio','sandra','tania','wendy','xochitl','yarely','zulema',
  'alicia','amalia','aurora','beatriz','blanca','cecilia','consuelo','cristina',
  'dolores','edith','elsa','emma','esther','eugenia','eva','fatima','flor','griselda',
  'guadalupe','hilda','ingrid','ivonne','jacqueline','lourdes','luisa','margarita',
  'mariana','maricela','mariela','marina','marlene','marta','mercedes','natalia',
  'noemi','nora','ofelia','pilar','raquel','reyna','ruth','sarai','selena','sheila',
  'stefania','stephanie','thalia','ximena','ines','jazmin','america','danna','erika',
  'itzel','ivana','lizbeth','mayte','melanie','michelle','mirna','nallely','nayeli',
  'pamela','priscila','valeria','viviana','yesenia','bertha','abigail','dayana',
  // Nombres del equipo actual
  'yatziri','cherry','isabela','naomi','haydee','noemi','angeles',
  'dafne','sarahi','angelica','camila','alondra','araceli','ariana','ashley',
  'astrid','bianca','celeste','citlali','cynthia','dulce','esmeralda','fanny',
  'genesis','giselle','ilse','imelda','iris','isela','jimena','joanna','judith',
  'karen','katerine','keila','kenia','lesly','lilia','lina','lisette','lizeth',
  'liz','lucero','lupita','mabel','marcela','mayra','monserrat','montserrat',
  'myrna','nathaly','nidia','nohemi','odette','paulina','renata','rosario',
  'ruby','samantha','sara','socorro','soledad','sonia','soraya','tamara',
  'tatiana','trinidad','violeta','virginia','xitlali','yahaira','yazmin',
  'yesica','yuridia','zaira','america','amerikha','danna','erika','itzel',
  'ivana','lizbeth','mayte','melanie','michelle','mirna','nallely','nayeli',
  'pamela','priscila','valeria','yesenia','bertha','abigail','dayana',
  'midory','michel','marilyn','maricruz','katherine','katerine','cindy',
])

function detectarGenero(nombre: string): 'M' | 'F' {
  const primer = (nombre ?? '').trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (NOMBRES_F.has(primer)) return 'F'
  // Tolerar letras duplicadas al final: "jazminn"→busca "jazmin", "carolinn"→"carolin"
  const sinDup = primer.replace(/(\w)\1+$/, '$1')
  if (NOMBRES_F.has(sinDup)) return 'F'
  if (primer.endsWith('a') && primer.length > 3) return 'F'
  return 'M'
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface BanioSlot { ocupado: boolean; porUsuario: string | null; porNombre: string | null; genero: 'M' | 'F'; tiempoId: number | null }
interface BanioStatus { hombres: BanioSlot; mujeres: BanioSlot }
interface PausaActiva { tiempo_id: number; status_id: number; fecha_inicio: string; duracionSegundos: number }

function fmt(seg: number): string {
  if (seg < 60) return `${seg}s`
  const m = Math.floor(seg / 60), s = seg % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

// ── Modal alerta baño ocupado ──────────────────────────────────────────────
function BanioAlertModal({ slot, onClose }: { slot: BanioSlot; onClose: () => void }) {
  const color = slot.genero === 'F' ? '#db2777' : '#2563eb'
  const emoji = slot.genero === 'F' ? '🚺' : '🚹'
  const label = slot.genero === 'F' ? 'Baño de mujeres' : 'Baño de hombres'
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-xs rounded-2xl bg-card shadow-2xl overflow-hidden"
        style={{ border: `2px solid ${color}33` }}>
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="px-6 py-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl"
            style={{ background: `${color}15` }}>{emoji}</div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color }}>{label}</p>
            <p className="text-[0.95rem] font-bold text-gray-800 mt-1">{slot.porNombre} está en el baño</p>
          </div>
          <button onClick={onClose} className="w-full rounded-xl py-2.5 text-[0.85rem] font-bold text-white"
            style={{ background: color }}>Enterado</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Opciones de pausa ──────────────────────────────────────────────────────
// statusId 3 = baño (manejado por socket), resto por REST
// El límite de "Comida" depende del rol: CC tiene 40 min, AD/TI tienen 1h.
function getOpciones(tipoUsuario: string) {
  const esCCOnly = !['AD', 'TI'].includes(tipoUsuario)
  return [
    { id: 'banio',   statusId: 3,   label: 'Baño',         sub: 'Máx. 20 min/día',                          emoji: '🚻', solid: '#2563eb', light: '#eff6ff', text: '#1d4ed8' },
    { id: 'comida',  statusId: 2,   label: 'Comida',        sub: esCCOnly ? 'Máx. 40 min' : 'Máx. 1 h',      emoji: '🍽️', solid: '#f97316', light: '#fff7ed', text: '#c2410c' },
    { id: 'capac',   statusId: 5,   label: 'Capacitación',  sub: 'Sin límite de tiempo',                     emoji: '📚', solid: '#9333ea', light: '#faf5ff', text: '#7e22ce' },
    { id: 'permiso', statusId: 6,   label: 'Permiso',       sub: 'Sin límite de tiempo',                     emoji: '✋', solid: '#16a34a', light: '#f0fdf4', text: '#15803d' },
  ] as const
}

export function PausaWidget() {
  const user  = useAuthStore((s) => s.user)
  const myId  = String(user?.id ?? '')
  // Usar género de BD si está disponible, sino fallback por nombre
  const esF   = user?.genero ? user.genero === 'F' : detectarGenero(user?.nombres ?? '') === 'F'
  const miKey = esF ? 'mujeres' : 'hombres'
  const OPCIONES = getOpciones(user?.tipoUsuario?.toUpperCase() ?? '')

  // ── Socket (baño) ────────────────────────────────────────────────────────
  const [banio, setBanio] = useState<BanioStatus>({
    hombres: { ocupado: false, porUsuario: null, porNombre: null, genero: 'M', tiempoId: null },
    mujeres: { ocupado: false, porUsuario: null, porNombre: null, genero: 'F', tiempoId: null },
  })
  const [alertaBanio, setAlertaBanio]   = useState<BanioSlot | null>(null)
  const [sockOk, setSockOk]             = useState(false)
  const prevBanioRef    = useRef(banio)
  const alertadoRef     = useRef<string | null>(null)
  const initializedRef  = useRef(false) // true después del primer banio:status recibido
  const sockRef         = useRef(getSocket())

  useEffect(() => {
    const sock = sockRef.current
    const onStatus = (data: BanioStatus) => {
      const antes = prevBanioRef.current[miKey], ahora = data[miKey]
      const alertKey = ahora.ocupado ? String(ahora.porUsuario) : null
      // Solo alertar si: el baño pasó de libre→ocupado Y ya estaba inicializado (no es la carga inicial)
      if (initializedRef.current && !antes.ocupado && ahora.ocupado && String(ahora.porUsuario) !== myId && alertadoRef.current !== alertKey) {
        alertadoRef.current = alertKey
        setAlertaBanio(ahora)
      }
      if (!ahora.ocupado) alertadoRef.current = null
      initializedRef.current = true
      prevBanioRef.current = data; setBanio(data)
    }
    const onConn  = () => { setSockOk(true); sock.emit('banio:get') }
    const onDisc  = () => setSockOk(false)
    sock.on('banio:status', onStatus); sock.on('connect', onConn); sock.on('disconnect', onDisc)
    if (sock.connected) { setSockOk(true); sock.emit('banio:get') }
    return () => { sock.off('banio:status', onStatus); sock.off('connect', onConn); sock.off('disconnect', onDisc) }
  }, [myId, miKey])

  const miSlot      = banio[miKey]
  const esElMio     = miSlot.ocupado && String(miSlot.porUsuario) === myId
  const banioBloq   = miSlot.ocupado && !esElMio

  const toggleBanio = async () => {
    if (banioBloq) return
    try {
      if (esElMio) {
        await api.post('/reports/pausa/terminar', { statusId: 3 })
      } else {
        await api.post('/reports/pausa/iniciar', { statusId: 3 })
      }
    } catch { /* ignorar */ }
    const sock = sockRef.current
    // Solo mandamos userId y userName — el backend determina el género desde BD
    const payload = { userId: user?.id ?? null, userName: user?.nombres?.split(' ').slice(0,2).join(' ') ?? 'Usuario' }
    if (sock.connected) sock.emit('banio:toggle', payload)
    else { sockRef.current = getSocket(); sockRef.current.once('connect', () => { setSockOk(true); sockRef.current.emit('banio:toggle', payload) }) }
  }

  // ── REST (otras pausas) ──────────────────────────────────────────────────
  const [activa,  setActiva]  = useState<PausaActiva | null>(null)
  const [loading, setLoading] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false) // guard contra doble disparo

  useEffect(() => {
    api.get<{ success: boolean; data: PausaActiva | null }>('/reports/pausa/activa')
      .then(r => { if (r.data.data) { setActiva(r.data.data); setElapsed(r.data.data.duracionSegundos) } })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (activa || esElMio) timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [activa, esElMio])

  // resetear timer cuando el baño se libera
  useEffect(() => { if (!esElMio && !activa) setElapsed(0) }, [esElMio, activa])

  const doTogglePausa = async (statusId: number) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(statusId)
    try {
      if (activa?.status_id === statusId) {
        await api.post('/reports/pausa/terminar', { statusId })
        setActiva(null); setElapsed(0)
      } else {
        const r = await api.post<{ success: boolean; tiempoId: number }>('/reports/pausa/iniciar', { statusId })
        setActiva({ tiempo_id: r.data.tiempoId, status_id: statusId, fecha_inicio: new Date().toISOString(), duracionSegundos: 0 })
        setElapsed(0)
      }
    } catch(e) { console.error(e) }
    finally { setLoading(null); inFlightRef.current = false }
  }

  // ── Panel ────────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { pos, dragProps } = useDraggablePosition('widget-pausas', {
    x: typeof window !== 'undefined' ? window.innerWidth - 80 : 900,
    y: typeof window !== 'undefined' ? window.innerHeight - 180 : 600,
  })

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Estado activo general
  const pausaActivaInfo = OPCIONES.find(o => o.statusId === activa?.status_id)
  const banioActivaInfo = OPCIONES[0] // siempre índice 0

  const hayPausa  = esElMio || !!activa
  const infoActiva = esElMio ? banioActivaInfo : pausaActivaInfo

  // Burbuja — color idle según género: rosa para mujeres, azul para hombres
  const idleColor   = esF ? '#db2777' : '#2563eb'
  const bubbleColor = hayPausa ? infoActiva!.solid : idleColor
  const bubbleEmoji = hayPausa ? infoActiva!.emoji : '⏸️'

  return (
    <>
      {alertaBanio && <BanioAlertModal slot={alertaBanio} onClose={() => setAlertaBanio(null)} />}

      <div ref={wrapRef} className="fixed z-[9989] flex flex-col items-end gap-3 select-none"
        style={{ left: pos.x, top: pos.y, transform: 'translateX(-100%)' }}>

        {/* ── Panel ── */}
        {open && (
          <div className="w-64 rounded-2xl bg-card shadow-2xl border border-gray-100 overflow-hidden">

            {/* Cabecera — arrastrar desde aquí */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between"
              {...dragProps} style={{ ...dragProps.style, cursor: 'grab' }}>
              <p className="text-[0.78rem] font-bold text-gray-700 uppercase tracking-wide">Estado de pausa</p>
              <button onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Banner pausa activa */}
            {hayPausa && infoActiva && (
              <div className="mx-3 mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                style={{ background: infoActiva.light, border: `1px solid ${infoActiva.solid}33` }}>
                <span className="text-2xl">{infoActiva.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.75rem] font-bold leading-tight" style={{ color: infoActiva.text }}>
                    {infoActiva.label} activa
                  </p>
                  <p className="text-[0.7rem] font-mono font-semibold mt-0.5" style={{ color: infoActiva.solid }}>
                    {fmt(elapsed)} transcurridos
                  </p>
                </div>
                {/* Botón terminar inline */}
                {esElMio ? (
                  <button onClick={toggleBanio}
                    className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-bold text-white transition-all hover:opacity-80 active:scale-95"
                    style={{ background: infoActiva.solid }}>
                    Salir
                  </button>
                ) : activa && (
                  <button onClick={() => doTogglePausa(activa.status_id)}
                    className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-bold text-white transition-all hover:opacity-80 active:scale-95"
                    style={{ background: infoActiva.solid }}>
                    Terminar
                  </button>
                )}
              </div>
            )}

            {/* Opciones */}
            <div className="p-3 flex flex-col gap-1.5">
              {!hayPausa && (
                <p className="text-[0.7rem] text-gray-400 text-center pb-1">Selecciona el tipo de pausa</p>
              )}

              {OPCIONES.map((op) => {
                const isBanio   = op.statusId === 3
                const isActive  = isBanio ? esElMio : activa?.status_id === op.statusId
                const isLoading = loading === op.statusId
                const disabled  = isLoading
                  || (isBanio && (banioBloq || !sockOk))
                  || (!isBanio && esElMio)
                  || (!isBanio && !!activa && !isActive)
                  || (isBanio && !!activa)

                const blockedByOther = isBanio ? banioBloq : false
                const subtitleText = isBanio && banioBloq
                  ? `Ocupado por ${miSlot.porNombre?.split(' ')[0]}`
                  : op.sub

                return (
                  <button
                    key={op.id}
                    onClick={() => {
                      if (disabled) return
                      if (isBanio) toggleBanio()
                      else doTogglePausa(op.statusId)
                    }}
                    disabled={disabled}
                    className={[
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                      isActive
                        ? 'shadow-sm scale-[1.01]'
                        : disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer',
                    ].join(' ')}
                    style={isActive
                      ? { background: op.light, border: `1.5px solid ${op.solid}` }
                      : { background: '#f9fafb', border: '1.5px solid #e5e7eb' }
                    }
                  >
                    {/* Ícono */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{ background: isActive ? op.solid + '22' : '#f3f4f6' }}>
                      {isLoading ? '⏳' : op.emoji}
                    </div>

                    {/* Texto */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8rem] font-semibold leading-tight"
                        style={{ color: isActive ? op.text : '#374151' }}>
                        {op.label}
                        {isBanio && !esElMio && miSlot.ocupado && (
                          <span className="ml-1.5 text-[0.65rem] font-bold rounded-full px-1.5 py-0.5 text-white"
                            style={{ background: op.solid }}>Ocupado</span>
                        )}
                      </p>
                      <p className="text-[0.68rem] mt-0.5"
                        style={{ color: isActive ? op.solid : blockedByOther ? '#ef4444' : '#9ca3af' }}>
                        {isActive ? (isBanio ? 'Toca para salir' : 'Toca para terminar') : subtitleText}
                      </p>
                    </div>

                    {/* Check activo */}
                    {isActive && (
                      <div className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center"
                        style={{ background: op.solid }}>
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Burbuja ── */}
        <div className="flex flex-col items-center gap-1" {...dragProps}>
          <button
            onClick={() => setOpen(o => !o)}
            className={[
              'relative flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-xl transition-all duration-200 hover:scale-110 active:scale-95',
              open ? 'ring-2 ring-white ring-offset-2 scale-105' : '',
            ].join(' ')}
            style={{ background: bubbleColor }}
          >
            {bubbleEmoji}
            {/* Dot estático cuando hay pausa activa */}
            {hayPausa && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-white"
                style={{ background: '#ef4444' }} />
            )}
          </button>

          <span className="rounded-xl px-2.5 py-1 text-[0.65rem] font-bold text-white shadow-md text-center min-w-[52px]"
            style={{ background: bubbleColor }}>
            {hayPausa ? fmt(elapsed) : 'Pausas'}
          </span>
        </div>

      </div>
    </>
  )
}
