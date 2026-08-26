import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/axios'

// ── Clasificación de género por primer nombre ──────────────────────────────
const NOMBRES_FEMENINOS = new Set([
  'ana','maria','lucia','laura','sofia','valentina','andrea','alejandra','monica',
  'gabriela','patricia','rosa','carmen','isabel','veronica','adriana','claudia',
  'diana','fernanda','jessica','karla','leticia','luz','martha','nancy','norma',
  'paola','rebeca','silvia','susana','teresa','vanessa','yolanda','brenda','celia',
  'daniela','elena','esperanza','fabiola','gloria','graciela','irene','janeth',
  'josefina','karina','liliana','lorena','magdalena','marisol','miriam','nadia',
  'olivia','perla','rocio','sandra','tania','wendy','xochitl','yarely','zulema',
  'alicia','amalia','aurora','beatriz','blanca','cecilia','consuelo','cristina',
  'dolores','edith','elsa','emma','esther','eugenia','eva','fatima','flor','griselda',
  'guadalupe','hilda','hortensia','ingrid','ivonne','jacqueline','lourdes','luisa',
  'margarita','mariana','maricela','mariela','marina','marlene','marta','mercedes',
  'natalia','noemi','nora','ofelia','pilar','raquel','reyna','ruth','sarai','selena',
  'sheila','stefania','stephania','stephanie','thalia','yatziri','ximena',
  'ines','jazmin','jazminn','america','amerikha','danna','erika','itzel','ivana','lizbeth','mayte',
  'dafne','sarahi','angelica','cherry','cindy','marilyn','maricruz','midory','michel','camila',
  'alondra','araceli','ariana','ashley','astrid','bianca','celeste','citlali','cynthia','dulce',
  'esmeralda','fanny','genesis','giselle','ilse','imelda','iris','isela','jimena','joanna','judith',
  'karen','katerine','katherine','keila','kenia','lesly','lilia','lina','lisette','lizeth','liz',
  'lucero','lupita','mabel','magnolia','marcela','mayra','monserrat','montserrat','myrna',
  'naomi','nathaly','nidia','nikole','nohemi','odette','paulina','remedios','renata',
  'rosario','ruby','samantha','sanjuana','sara','socorro','soledad','sonia','soraya','sulema',
  'tamara','tatiana','trinidad','violeta','virginia','viviana','xitlali',
  'yael','yahaira','yazmin','yesica','yoana','yuridia','zaira',
  'melanie','michelle','mirna','nallely','nayeli','pamela','priscila',
  'valeria','yesenia','bertha','abigail','dayana',
])

const NOMBRES_MASCULINOS = new Set([
  'jose','juan','luis','carlos','miguel','jorge','antonio','francisco','manuel',
  'alejandro','roberto','daniel','david','eduardo','fernando','hector','ivan',
  'javier','jesus','jonathan','mario','oscar','pablo','pedro','rafael','raul',
  'ricardo','sergio','victor','alberto','alfredo','andres','angel','armando',
  'arturo','benjamin','cesar','christian','cristian','edgar','enrique','ernesto',
  'fabian','felipe','gabriel','gerardo','gilberto','gonzalo','guillermo',
  'gustavo','hugo','ignacio','isaias','ismael','israel','jaime','joel','julian',
  'leonel','marco','marcos','martin','mauricio','maximiliano','moises','noe',
  'omar','oswaldo','rodrigo','rogelio','rolando','roman','ruben','salvador','samuel',
  'santiago','saul','sebastian','teodoro','timoteo','tomas','uriel','uziel','xavier',
  'yair','alan','alexis','alonso','axel','brandon','bryan','christopher',
  'diego','dylan','eder','emilio','erik','ethan','ezequiel','giovanni','hans',
  'ibrahim','kevin','leonardo','levi','luca','lucas','mateo','matthew',
  'nicolas','oliver','patrick','rene','ulises','yazael','aldo','beto',
  'chuy','memo','nacho','pepe','poncho','lalo',
])

function detectarGenero(nombreCompleto: string): 'M' | 'F' {
  const primer = (nombreCompleto ?? '').trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (NOMBRES_FEMENINOS.has(primer)) return 'F'
  if (NOMBRES_MASCULINOS.has(primer)) return 'M'
  if (primer.endsWith('o') || primer.endsWith('or') || primer.endsWith('on')) return 'M'
  return 'F'
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface BanioSlot {
  ocupado: boolean
  porUsuario: string | null
  porNombre: string | null
  genero: 'M' | 'F'
  tiempoId: number | null
}

interface BanioStatusPayload {
  hombres: BanioSlot
  mujeres: BanioSlot
}

// ── Modal de alerta ────────────────────────────────────────────────────────
function BanioAlertModal({ slot, onClose }: { slot: BanioSlot; onClose: () => void }) {
  const es    = slot.genero === 'F' ? 'Baño de mujeres' : 'Baño de hombres'
  const emoji = slot.genero === 'F' ? '🚺' : '🚹'
  const color = slot.genero === 'F' ? '#db2777' : '#2563eb'

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-xs rounded-2xl bg-white shadow-2xl overflow-hidden animate-slide-up"
        style={{ border: `2px solid ${color}33` }}
      >
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="px-6 py-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl"
            style={{ background: `${color}15` }}>
            {emoji}
          </div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color }}>{es}</p>
            <p className="text-[0.95rem] font-bold text-gray-800 mt-1">
              {slot.porNombre} está en el baño
            </p>
            <p className="text-[0.75rem] text-gray-400 mt-0.5">El baño está ocupado en este momento</p>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-[0.85rem] font-bold text-white transition-colors"
            style={{ background: color }}
          >
            Enterado
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Componente principal ───────────────────────────────────────────────────
export function BanioButton() {
  const user = useAuthStore((s) => s.user)
  const [status, setStatus] = useState<BanioStatusPayload>({
    hombres: { ocupado: false, porUsuario: null, porNombre: null, genero: 'M', tiempoId: null },
    mujeres: { ocupado: false, porUsuario: null, porNombre: null, genero: 'F', tiempoId: null },
  })
  const [connected, setConnected] = useState(false)
  const [alerta, setAlerta]       = useState<BanioSlot | null>(null)
  const prevStatusRef   = useRef(status)
  const initializedRef  = useRef(false)
  const sockRef         = useRef(getSocket())

  // Usar género de BD si está disponible, sino fallback por nombre
  const miGenero: 'M' | 'F' = user?.genero ?? detectarGenero(user?.nombres ?? '')
  const miKey    = miGenero === 'F' ? 'mujeres' : 'hombres'
  const miSlot   = status[miKey]
  const myId     = String(user?.id ?? '')
  const esElMio  = miSlot.ocupado && String(miSlot.porUsuario) === myId
  const bloqueado = miSlot.ocupado && !esElMio

  useEffect(() => {
    const sock = sockRef.current

    const onStatus = (data: BanioStatusPayload) => {
      const prev  = prevStatusRef.current
      const antes = prev[miKey]
      const ahora = data[miKey]
      // Solo alertar si el baño pasó de libre→ocupado y ya se recibió el estado inicial
      if (initializedRef.current && !antes.ocupado && ahora.ocupado && String(ahora.porUsuario) !== myId) {
        setAlerta(ahora)
      }
      initializedRef.current = true
      prevStatusRef.current = data
      setStatus(data)
    }
    const onConnect    = () => { setConnected(true); sock.emit('banio:get') }
    const onDisconnect = () => setConnected(false)

    sock.on('banio:status', onStatus)
    sock.on('connect',      onConnect)
    sock.on('disconnect',   onDisconnect)

    if (sock.connected) { setConnected(true); sock.emit('banio:get') }

    return () => {
      sock.off('banio:status', onStatus)
      sock.off('connect',      onConnect)
      sock.off('disconnect',   onDisconnect)
    }
  }, [myId, miGenero, miKey])

  const handleToggle = async () => {
    if (bloqueado) return
    const sock = sockRef.current
    // Solo mandamos userId y userName — el backend determina el género desde BD
    const payload = {
      userId:   user?.id ?? null,
      userName: user?.nombres?.split(' ').slice(0, 2).join(' ') ?? 'Usuario',
    }

    try {
      if (!esElMio) {
        await api.post('/reports/pausa/iniciar', { statusId: 3 })
      } else {
        await api.post('/reports/pausa/terminar', { statusId: 3 })
      }
    } catch { /* ignorar */ }

    if (sock.connected) {
      sock.emit('banio:toggle', payload)
    } else {
      sockRef.current = getSocket()
      sockRef.current.once('connect', () => {
        setConnected(true)
        sockRef.current.emit('banio:toggle', payload)
      })
    }
  }

  const esF          = miGenero === 'F'
  const colorLibre   = esF ? 'bg-pink-500 hover:bg-pink-400'  : 'bg-blue-600 hover:bg-blue-500'
  const colorMio     = 'bg-amber-500 hover:bg-amber-400'
  const colorOcupado = esF ? 'bg-pink-800 opacity-80'         : 'bg-blue-900 opacity-80'
  const iconoMi      = esF ? '🚺' : '🚹'
  const bgBtn        = !miSlot.ocupado ? colorLibre : esElMio ? colorMio : colorOcupado

  return (
    <>
      {alerta && <BanioAlertModal slot={alerta} onClose={() => setAlerta(null)} />}

      <div className="fixed bottom-24 right-6 z-[9990] flex flex-col items-end gap-2 select-none">

        {/* Tooltip — quién está en el baño */}
        {miSlot.ocupado && miSlot.porNombre && (
          <div className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-[0.72rem] font-medium shadow-md whitespace-nowrap ${esF ? 'border-pink-200 text-pink-700' : 'border-blue-200 text-blue-700'}`}>
            <span>{iconoMi}</span>
            <span>
              {esElMio ? 'Tú estás en el baño' : `${miSlot.porNombre} está en el baño`}
            </span>
          </div>
        )}

        {/* Botón */}
        <button
          onClick={handleToggle}
          title={
            !miSlot.ocupado
              ? `${esF ? 'Baño de mujeres' : 'Baño de hombres'} libre — clic para entrar`
              : esElMio
                ? 'Clic para salir del baño'
                : `Ocupado por ${miSlot.porNombre}`
          }
          className={[
            'flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-xl transition-all duration-200',
            bgBtn,
            bloqueado ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-110 active:scale-95',
            !connected ? 'opacity-40' : '',
          ].join(' ')}
        >
          {iconoMi}
        </button>

        {/* Label */}
        <span className={[
          'rounded-xl px-2.5 py-1 text-[0.65rem] font-bold text-white shadow-md text-center min-w-[52px]',
          !miSlot.ocupado
            ? (esF ? 'bg-pink-500' : 'bg-blue-600')
            : esElMio ? 'bg-amber-500' : 'bg-red-500',
        ].join(' ')}>
          {!connected ? '...' : !miSlot.ocupado ? 'Libre' : esElMio ? 'Adentro' : 'Ocupado'}
        </span>
      </div>
    </>
  )
}
