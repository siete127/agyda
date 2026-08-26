import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Copy, ChevronRight, Users2 } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { LivechatCampania } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { GruposPanel } from './GruposPanel'

// URL base del widget público — el link completo para pegar en la página que
// va a usar esta campaña se arma con ?campaignToken=<token>.
// NOTA: ajustar si el widget de Chat en Vivo no vive en window.location.origin:8080 —
// verificar el dominio/puerto real donde está desplegado el widget público.
const WIDGET_BASE_URL = `${window.location.origin.replace(/:\d+$/, ':8080')}`

function CrearCampaniaForm({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [open, setOpen] = useState(false)

  const crear = useMutation({
    mutationFn: () => livechatService.createCampania({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-campanias'] })
      toast.success('Campaña creada')
      setNombre('')
      setDescripcion('')
      setOpen(false)
      onCreated()
    },
    onError: () => toast.error('No se pudo crear la campaña'),
  })

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        Nueva campaña
      </Button>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de la campaña"
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        autoFocus
      />
      <input
        type="text"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button size="sm" onClick={() => crear.mutate()} disabled={!nombre.trim() || crear.isPending}>
          {crear.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Crear
        </Button>
      </div>
    </div>
  )
}

function CampaniaRow({ campania, expandida, onToggle }: { campania: LivechatCampania; expandida: boolean; onToggle: () => void }) {
  const qc = useQueryClient()

  const toggleActivo = useMutation({
    mutationFn: () => livechatService.updateCampania(campania.id, { activo: !campania.activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-campanias'] })
      toast.success(campania.activo ? 'Campaña desactivada' : 'Campaña activada')
    },
    onError: () => toast.error('No se pudo actualizar la campaña'),
  })

  const copiarLink = () => {
    const link = `${WIDGET_BASE_URL}/?campaignToken=${campania.token}`
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Link del widget copiado'))
      .catch(() => toast.error('No se pudo copiar el link'))
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight size={16} className={clsx('text-gray-400 transition-transform shrink-0', expandida && 'rotate-90')} />
          <div className="min-w-0">
            <p className="font-medium text-gray-800 truncate">{campania.nombre}</p>
            {campania.descripcion && <p className="text-xs text-gray-400 truncate">{campania.descripcion}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx(
            'text-[11px] font-semibold px-2 py-0.5 rounded-full',
            campania.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
          )}>
            {campania.activo ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </button>

      {expandida && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={copiarLink}>
              <Copy size={13} />
              Copiar link del widget
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleActivo.mutate()} disabled={toggleActivo.isPending}>
              {campania.activo ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
          <GruposPanel campaniaId={campania.id} />
        </div>
      )}
    </div>
  )
}

export function CampaniasModal({ onClose }: { onClose: () => void }) {
  const { data: campanias = [], isLoading, refetch } = useQuery({
    queryKey: ['livechat-campanias'],
    queryFn: () => livechatService.getCampanias(),
  })
  const [expandidaId, setExpandidaId] = useState<number | null>(null)

  return (
    <Modal isOpen onClose={onClose} title="Campañas" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Users2 size={13} />
            Cada campaña puede tener varios grupos de atención, con sus propios agentes, plantillas y motivos de cierre.
          </p>
          <CrearCampaniaForm onCreated={refetch} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : campanias.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">Todavía no hay campañas creadas</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {campanias.map((c) => (
              <CampaniaRow
                key={c.id}
                campania={c}
                expandida={expandidaId === c.id}
                onToggle={() => setExpandidaId((prev) => (prev === c.id ? null : c.id))}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
