import {
  Settings, Headset, Tags, Users, UsersRound, Megaphone, MessageCircle, Bot,
  GitBranch, Timer, ArrowUpCircle, Zap, Bell, BookOpen, ClipboardList,
  FileText, ShieldCheck, Database, Plug, ListChecks,
} from 'lucide-react'
import { clsx } from 'clsx'

export interface ConfiguracionSeccion {
  key: string
  label: string
  icon: typeof Settings
  disponible: boolean
}

export const CONFIGURACION_SECCIONES: ConfiguracionSeccion[] = [
  { key: 'general',        label: 'General',                 icon: Settings,      disponible: true },
  { key: 'mesa-servicio',  label: 'Mesa de Servicio',         icon: Headset,       disponible: true },
  { key: 'categorias',     label: 'Categorías',               icon: Tags,          disponible: true },
  { key: 'tecnicos',       label: 'Técnicos',                 icon: Users,         disponible: true },
  { key: 'grupos-soporte', label: 'Grupos de Soporte',        icon: UsersRound,    disponible: true },
  { key: 'campanias',      label: 'Campañas (Soporte TI)',    icon: Megaphone,     disponible: true },
  { key: 'chat-vivo',      label: 'Chat en Vivo',             icon: MessageCircle, disponible: true },
  { key: 'chatbot',        label: 'Chatbot',                  icon: Bot,           disponible: true },
  { key: 'reglas',         label: 'Reglas de Negocio',        icon: GitBranch,     disponible: true },
  { key: 'sla',            label: 'SLA',                      icon: Timer,         disponible: true },
  { key: 'escalamientos',  label: 'Escalamientos',            icon: ArrowUpCircle, disponible: true },
  { key: 'automatizaciones', label: 'Automatizaciones',       icon: Zap,           disponible: true },
  { key: 'notificaciones', label: 'Notificaciones',           icon: Bell,          disponible: true },
  { key: 'kb',             label: 'ArdaWiki',                 icon: BookOpen,      disponible: true },
  { key: 'encuestas',      label: 'Encuestas',                icon: ClipboardList, disponible: true },
  { key: 'plantillas',     label: 'Plantillas',                icon: FileText,      disponible: true },
  { key: 'campos-personalizados', label: 'Campos Personalizados', icon: ListChecks, disponible: true },
  { key: 'seguridad',      label: 'Seguridad',                icon: ShieldCheck,   disponible: true },
  { key: 'catalogos',      label: 'Catálogos',                icon: Database,      disponible: true },
  { key: 'integraciones',  label: 'Integraciones',            icon: Plug,          disponible: true },
  { key: 'webphone-vistas', label: 'Vistas de Webphone',      icon: Headset,       disponible: true },
  { key: 'webphone-credenciales', label: 'Credenciales VICIdial', icon: Headset,   disponible: true },
  { key: 'mensajeria',     label: 'Mensajería',                icon: MessageCircle, disponible: true },
  { key: 'notificaciones-correo', label: 'Notificaciones por Correo', icon: Bell,  disponible: true },
]

export function ConfiguracionNav({ activa, onChange }: { activa: string; onChange: (key: string) => void }) {
  return (
    <nav className="flex flex-col gap-0.5 rounded-2xl border border-gray-100 bg-card p-2 shadow-card">
      {CONFIGURACION_SECCIONES.map((s) => {
        const Icon = s.icon
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={clsx(
              'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
              activa === s.key
                ? 'bg-brand/10 font-semibold text-brand'
                : 'text-ink-secondary hover:bg-surface',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{s.label}</span>
            {!s.disponible && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-gray-400">
                pronto
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
