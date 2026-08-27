import { useState } from 'react'
import { FileText, MessageCircle, Ticket, Mail } from 'lucide-react'
import { clsx } from 'clsx'
import { CampaniaSoporteTITab } from './CampaniaSoporteTITab'

type SubTab = 'chat' | 'tickets' | 'correo'

export function PlantillasTab() {
  const [sub, setSub] = useState<SubTab>('chat')

  const subtabs: { key: SubTab; label: string; icon: typeof MessageCircle }[] = [
    { key: 'chat', label: 'Chat en Vivo', icon: MessageCircle },
    { key: 'tickets', label: 'Tickets', icon: Ticket },
    { key: 'correo', label: 'Correo', icon: Mail },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Plantillas de mensajes</p>
        </div>

        <div className="mb-4 flex gap-1 border-b border-gray-100">
          {subtabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setSub(t.key)}
                className={clsx(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
                  sub === t.key ? 'border-brand text-brand' : 'border-transparent text-ink-tertiary hover:text-ink-secondary',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            )
          })}
        </div>

        {sub === 'chat' && (
          <div>
            <p className="mb-3 text-xs text-ink-tertiary">
              Las plantillas de Chat en Vivo se administran por grupo dentro de cada campaña. La campaña
              de Soporte TI se muestra abajo — expande un grupo para ver sus plantillas.
            </p>
            <CampaniaSoporteTITab />
          </div>
        )}

        {sub === 'tickets' && (
          <p className="py-8 text-center text-sm text-ink-tertiary">
            Las plantillas de respuesta para tickets todavía no están disponibles — próximamente.
          </p>
        )}

        {sub === 'correo' && (
          <p className="py-8 text-center text-sm text-ink-tertiary">
            Correo no es un canal de creación/respuesta soportado en este flujo.
          </p>
        )}
      </div>
    </div>
  )
}
