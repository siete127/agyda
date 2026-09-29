import { clsx } from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Zap, Clock, MessageCircle, Sun, Cloud, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { PortalBreadcrumb } from '@/pages/portal-cliente/components/PortalBreadcrumb'
import { Ardabito } from '@/components/effects/Ardabito'
import { personalizacionService, type CanalesPortalConfig } from '@/services/personalizacion.service'
import { construirCanales, CanalCard } from '@/pages/portal-cliente/components/CanalesComunicacion'
import canalesHero from '@/assets/canales-hero.png'

// Efecto máquina de escribir: revela el texto letra por letra al montar —
// da la sensación de que Ardabito "está escribiendo" su saludo en vez de
// aparecer todo de golpe.
function useTypewriter(texto: string, velocidadMs = 28) {
  const [visible, setVisible] = useState('')

  useEffect(() => {
    setVisible('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setVisible(texto.slice(0, i))
      if (i >= texto.length) clearInterval(id)
    }, velocidadMs)
    return () => clearInterval(id)
  }, [texto, velocidadMs])

  return visible
}

// --- Conectado a datos reales: personalizacionService.get() ->
// config.canalesPortal (editable en Configuración → General → Portal de
// Cliente → Canales de contacto). construirCanales()/CanalCard() viven en
// components/CanalesComunicacion.tsx, compartidos con el resumen del
// dashboard (PortalClientePrincipalPage) para que ambos muestren lo mismo. ---

interface FilaHorario {
  dia: string
  horario: string
  icon: typeof Sun
  color: string
}

// Desglosa la config real en 3 filas fijas para el header (Lun-Vie, Sábado,
// Domingo), con su propio ícono — Domingo siempre "Cerrado" porque hoy no
// hay un tercer bloque de horario para ese día en la configuración.
function construirFilasHorario(cfg: CanalesPortalConfig | undefined): FilaHorario[] {
  if (!cfg || !cfg.horarioInicio || !cfg.horarioFin) return []
  const sabado = cfg.sabadoHabilitado && cfg.sabadoHorarioInicio && cfg.sabadoHorarioFin
    ? `${cfg.sabadoHorarioInicio} - ${cfg.sabadoHorarioFin}`
    : 'Cerrado'
  return [
    { dia: 'Lunes - Viernes', horario: `${cfg.horarioInicio} - ${cfg.horarioFin}`, icon: Sun, color: 'text-amber-400' },
    { dia: 'Sábado', horario: sabado, icon: Cloud, color: 'text-sky-400' },
    { dia: 'Domingo', horario: 'Cerrado', icon: Moon, color: 'text-violet-400' },
  ]
}

function HeaderCanales({ filasHorario }: { filasHorario: FilaHorario[] }) {
  return (
    <div
      className="relative flex h-[170px] flex-shrink-0 items-center justify-between gap-6 overflow-hidden rounded-3xl bg-cover bg-center px-6 shadow-md sm:px-8"
      style={{ backgroundImage: `url(${canalesHero})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/70 to-[#0a2f71]/30" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Megaphone className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Canales</h1>
          <p className="mt-0.5 text-sm text-white/80">
            Conéctate con nosotros por el medio que más te convenga. Estamos para ayudarte.
          </p>
        </div>
      </div>

      {filasHorario.length > 0 && (
        <div className="relative hidden flex-shrink-0 flex-col gap-1.5 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm md:flex">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/90">
            <Clock className="h-3.5 w-3.5" />
            Horario de atención
          </p>
          {filasHorario.map((f) => (
            <div key={f.dia} className="flex items-center gap-2">
              <f.icon className={clsx('h-3.5 w-3.5 flex-shrink-0', f.color)} />
              <span className="text-[11px] text-white/80">{f.dia}: <span className="font-semibold text-white">{f.horario}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SALUDO_ARDABITO = '¡Hola! Soy Ardabito. ¿En qué puedo ayudarte?'

function ArdabitoCard() {
  const textoVisible = useTypewriter(SALUDO_ARDABITO)

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex justify-center pt-14">
        <div className="h-64 w-64 flex-shrink-0">
          <Ardabito />
        </div>
        <div className="absolute right-4 top-0 z-10 flex aspect-square w-24 flex-shrink-0 items-center justify-center rounded-full border border-surface-border bg-card px-2.5 text-center shadow-card">
          <p className="text-[10px] font-semibold leading-tight text-ink">
            {textoVisible}
            <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-ink align-middle" style={{ height: '0.85em' }} />
          </p>
          {/* Pico del globo apuntando hacia Ardabito — triángulo CSS puro
             (border-trick), no un cuadrado rotado, para que la punta salga
             limpia sin esquinas rectas visibles. Doble capa: una ligeramente
             más grande con el color del borde, y encima la del color de
             fondo, para simular el contorno del globo en la punta. */}
          <span className="absolute -bottom-[9px] left-5 h-0 w-0 border-x-[9px] border-t-[9px] border-x-transparent border-t-surface-border" />
          <span className="absolute -bottom-2 left-[22px] h-0 w-0 border-x-[7px] border-t-[7px] border-x-transparent border-t-card" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-600 dark:text-amber-400">
        <Zap className="h-4 w-4 flex-shrink-0" />
        <span>Para temas urgentes, te recomendamos escribirnos por WhatsApp.</span>
      </div>
    </div>
  )
}

export function PortalClienteCanalesPage() {
  const { data } = useQuery({ queryKey: ['personalizacion'], queryFn: () => personalizacionService.get() })
  const canales = construirCanales(data?.canalesPortal)

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PortalBreadcrumb seccion="Canales" />
      <HeaderCanales filasHorario={construirFilasHorario(data?.canalesPortal)} />

      <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {canales.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-border py-12 text-center">
              <MessageCircle className="h-8 w-8 text-ink-tertiary" />
              <p className="text-sm font-semibold text-ink">Aún no hay canales de contacto configurados.</p>
            </div>
          ) : (
            canales.map((c) => <CanalCard key={c.nombre} c={c} />)
          )}
        </div>
        <ArdabitoCard />
      </Reveal>
    </div>
  )
}
