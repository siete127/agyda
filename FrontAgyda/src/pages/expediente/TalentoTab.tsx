import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, HandHeart, Languages, Hammer, Workflow, BookOpen, Sparkle, Plus, X,
} from 'lucide-react'
import { api } from '@/lib/axios'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Campo, CampoSelect, NIVEL_OPCIONES } from './expedienteCompleto.shared'

type Categoria = 'dura' | 'blanda' | 'idioma' | 'herramienta' | 'metodologia' | 'conocimiento' | 'interes'

interface TalentoItem { id: number; nombre: string; nivel: string }
type TalentoData = Record<Categoria, TalentoItem[]>

const CATEGORIAS: { key: Categoria; label: string; icon: React.ElementType; descripcion: string }[] = [
  { key: 'dura', label: 'Habilidades duras', icon: Wrench, descripcion: 'Habilidades técnicas que refieren a capacidades especializadas en un campo específico, como programación, contabilidad o diseño gráfico.' },
  { key: 'blanda', label: 'Habilidades blandas', icon: HandHeart, descripcion: 'Capacidades personales y de comunicación que ayudan a interactuar y colaborar eficazmente con otros.' },
  { key: 'idioma', label: 'Idiomas', icon: Languages, descripcion: 'Capacidad de comunicarse en diferentes idiomas: hablar, leer, escribir y comprender.' },
  { key: 'herramienta', label: 'Herramientas', icon: Hammer, descripcion: 'Herramientas de software, hardware, plataformas y sistemas usados en el trabajo.' },
  { key: 'metodologia', label: 'Metodologías', icon: Workflow, descripcion: 'Conjuntos de prácticas y procedimientos que guían la realización de tareas y proyectos.' },
  { key: 'conocimiento', label: 'Conocimientos', icon: BookOpen, descripcion: 'Dominio de información, teorías y principios fundamentales en diferentes campos profesionales.' },
  { key: 'interes', label: 'Intereses', icon: Sparkle, descripcion: 'Pasiones, motivaciones y áreas de curiosidad relacionadas con tu trabajo o campo profesional.' },
]

function AgregarModal({ categoria, label, onClose }: { categoria: Categoria; label: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [nivel, setNivel] = useState('')

  const crear = useMutation({
    mutationFn: () => api.post('/expedientes/mi/talento', { categoria, nombre, nivel }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-talento'] }); toast.success('Agregado'); onClose() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title={label} size="sm">
      <div className="space-y-3">
        <Campo label="Nombre" value={nombre} onChange={setNombre} />
        <CampoSelect label="Nivel" value={nivel} onChange={setNivel} opciones={NIVEL_OPCIONES} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!nombre.trim()} onClick={() => crear.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function CategoriaCard({ categoria, label, icon: Icon, descripcion, items }: {
  categoria: Categoria; label: string; icon: React.ElementType; descripcion: string; items: TalentoItem[]
}) {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/expedientes/mi/talento/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-talento'] }); toast.success('Eliminado'); setConfirmId(null) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand flex-shrink-0"><Icon className="h-4 w-4" /></div>
          <div>
            <h3 className="text-[0.82rem] font-bold text-gray-800">{label}</h3>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">{descripcion}</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1.5 transition-colors flex-shrink-0">
          <Plus className="h-3.5 w-3.5" /> {label}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[0.76rem] text-gray-300 py-2">No hay datos</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 pl-3 pr-1.5 py-1 text-[0.72rem] font-medium text-gray-700">
              {item.nombre}{item.nivel ? ` · ${item.nivel}` : ''}
              <button onClick={() => setConfirmId(item.id)} className="rounded-full p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {showModal && <AgregarModal categoria={categoria} label={label} onClose={() => setShowModal(false)} />}
      <ConfirmDialog isOpen={confirmId !== null} onClose={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId !== null) eliminar.mutate(confirmId) }}
        title="Eliminar registro" message="¿Seguro que deseas eliminar este registro?" confirmLabel="Eliminar" isPending={eliminar.isPending} />
    </div>
  )
}

export function TalentoTab() {
  const { data, isLoading } = useQuery<TalentoData>({
    queryKey: ['expediente-talento'],
    queryFn: async () => (await api.get('/expedientes/mi/talento')).data?.data ?? {},
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-4 w-40 rounded-lg bg-gray-100 mb-3" />
            <div className="h-6 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {CATEGORIAS.map((c) => (
        <CategoriaCard key={c.key} categoria={c.key} label={c.label} icon={c.icon} descripcion={c.descripcion} items={data?.[c.key] ?? []} />
      ))}
    </div>
  )
}
