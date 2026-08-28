import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, MessageCircle, Ticket, Mail, Plus, Pencil, Ban, CheckCircle2, Trash2, Copy, X, Save } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { CampaniaSoporteTITab } from './CampaniaSoporteTITab'
import { plantillasCorreoService, type PlantillaCorreo } from '@/services/plantillasCorreo.service'
import { plantillasRespuestaService, type PlantillaRespuesta } from '@/services/plantillasRespuesta.service'

type SubTab = 'chat' | 'tickets' | 'correo'

function PlantillaRespuestaFormModal({ plantilla, onClose }: { plantilla: PlantillaRespuesta | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [contenido, setContenido] = useState(plantilla?.contenido ?? '')

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { nombre: nombre.trim(), contenido }
      return plantilla ? plantillasRespuestaService.update(plantilla.id, payload) : plantillasRespuestaService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-respuesta'] })
      toast.success(plantilla ? 'Plantilla actualizada' : 'Plantilla creada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo guardar la plantilla'),
  })

  const puedeGuardar = nombre.trim() && contenido.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-bold text-ink">{plantilla ? 'Editar plantilla' : 'Nueva plantilla de respuesta'}</p>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nombre</label>
            <input className="field mt-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Solicitar más información" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Contenido</label>
            <textarea
              className="field mt-1 min-h-[160px] text-sm"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Texto que se inserta directo en un comentario o en la resolución del ticket..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button className="px-3 py-1.5 text-xs text-ink-tertiary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!puedeGuardar || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function PlantillasRespuestaPanel() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'crear' | PlantillaRespuesta | null>(null)

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['plantillas-respuesta'],
    queryFn: () => plantillasRespuestaService.getPlantillas(true),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => plantillasRespuestaService.toggleActiva(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plantillas-respuesta'] }),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => plantillasRespuestaService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-respuesta'] })
      toast.success('Plantilla eliminada')
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo eliminar'),
  })

  return (
    <div>
      <p className="mb-3 text-xs text-ink-tertiary">
        Texto reutilizable que un técnico puede insertar directo en un comentario o al resolver un
        ticket (aparece como opción de "Usar plantilla" dentro del ticket).
      </p>

      <div className="mb-3 flex justify-end">
        <button className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs" onClick={() => setModal('crear')}>
          <Plus className="h-3.5 w-3.5" /> Nueva plantilla
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : plantillas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-tertiary">Sin plantillas de respuesta configuradas.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-2.5">
              <div className="flex-1">
                <p className={clsx('text-sm font-medium', !p.activa && 'text-ink-tertiary line-through')}>{p.nombre}</p>
                <p className="truncate text-xs text-ink-tertiary">{p.contenido}</p>
              </div>
              <button className="text-ink-tertiary hover:text-brand" onClick={() => setModal(p)} title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                className={clsx('hover:opacity-70', p.activa ? 'text-red-400' : 'text-green-500')}
                onClick={() => toggle.mutate(p.id)}
                title={p.activa ? 'Desactivar' : 'Activar'}
              >
                {p.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
              <button
                className="text-ink-tertiary hover:text-red-500"
                onClick={() => { if (confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) eliminar.mutate(p.id) }}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <PlantillaRespuestaFormModal plantilla={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function PlantillaCorreoFormModal({ plantilla, onClose }: { plantilla: PlantillaCorreo | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [asunto, setAsunto] = useState(plantilla?.asunto ?? '')
  const [contenido, setContenido] = useState(plantilla?.contenido ?? '')

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { nombre: nombre.trim(), asunto: asunto.trim() || undefined, contenido }
      return plantilla ? plantillasCorreoService.update(plantilla.id, payload) : plantillasCorreoService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-correo'] })
      toast.success(plantilla ? 'Plantilla actualizada' : 'Plantilla creada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo guardar la plantilla'),
  })

  const puedeGuardar = nombre.trim() && contenido.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-bold text-ink">{plantilla ? 'Editar plantilla' : 'Nueva plantilla de correo'}</p>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nombre</label>
            <input className="field mt-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Ticket resuelto" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Asunto sugerido (opcional)</label>
            <input className="field mt-1 text-sm" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Ej. Tu ticket #{numero} fue resuelto" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Contenido</label>
            <textarea
              className="field mt-1 min-h-[160px] text-sm"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Texto que el técnico copiará y pegará en su cliente de correo..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button className="px-3 py-1.5 text-xs text-ink-tertiary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!puedeGuardar || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function PlantillasCorreoPanel() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'crear' | PlantillaCorreo | null>(null)

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['plantillas-correo'],
    queryFn: () => plantillasCorreoService.getPlantillas(true),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => plantillasCorreoService.toggleActiva(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plantillas-correo'] }),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => plantillasCorreoService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-correo'] })
      toast.success('Plantilla eliminada')
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo eliminar'),
  })

  const copiar = async (p: PlantillaCorreo) => {
    const texto = p.asunto ? `Asunto: ${p.asunto}\n\n${p.contenido}` : p.contenido
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Plantilla copiada al portapapeles')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div>
      <p className="mb-3 text-xs text-ink-tertiary">
        Correo no es un canal de creación/respuesta soportado en este flujo — el sistema no envía nada
        automáticamente. Estas plantillas son texto reutilizable que el técnico copia y pega manualmente
        en su cliente de correo.
      </p>

      <div className="mb-3 flex justify-end">
        <button className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs" onClick={() => setModal('crear')}>
          <Plus className="h-3.5 w-3.5" /> Nueva plantilla
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : plantillas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-tertiary">Sin plantillas de correo configuradas.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-2.5">
              <div className="flex-1">
                <p className={clsx('text-sm font-medium', !p.activa && 'text-ink-tertiary line-through')}>{p.nombre}</p>
                {p.asunto && <p className="text-xs text-ink-tertiary">Asunto: {p.asunto}</p>}
              </div>
              <button className="text-ink-tertiary hover:text-brand" onClick={() => copiar(p)} title="Copiar">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button className="text-ink-tertiary hover:text-brand" onClick={() => setModal(p)} title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                className={clsx('hover:opacity-70', p.activa ? 'text-red-400' : 'text-green-500')}
                onClick={() => toggle.mutate(p.id)}
                title={p.activa ? 'Desactivar' : 'Activar'}
              >
                {p.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
              <button
                className="text-ink-tertiary hover:text-red-500"
                onClick={() => { if (confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) eliminar.mutate(p.id) }}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <PlantillaCorreoFormModal plantilla={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

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

        {sub === 'tickets' && <PlantillasRespuestaPanel />}

        {sub === 'correo' && <PlantillasCorreoPanel />}
      </div>
    </div>
  )
}
