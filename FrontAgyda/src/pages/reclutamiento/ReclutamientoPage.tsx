import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  UserPlus, Kanban, List, FileText, Mail, Phone, Calendar, XCircle, MoreHorizontal,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { vacantesService } from '@/services/vacantes.service'
import { useSocketEvent } from '@/hooks/useSocket'
import { POSTULANTE_ETAPAS, type Postulante, type PostulanteEtapa } from '@/types/vacante.types'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ReclutamientoPage() {
  const qc = useQueryClient()
  const [vista, setVista] = useState<'kanban' | 'lista'>('kanban')
  const [filtroVacante, setFiltroVacante] = useState<number | 'todas'>('todas')

  const dragPostId = useRef<number | null>(null)
  const dragOverPostId = useRef<number | null>(null)

  const { data: postulantes = [], isLoading } = useQuery({
    queryKey: ['vacantes', 'postulantes-todas'],
    queryFn: () => vacantesService.getAllPostulantes(),
  })

  const { data: vacantes = [] } = useQuery({
    queryKey: ['vacantes'],
    queryFn: () => vacantesService.getAll(true),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vacantes', 'postulantes-todas'] })

  // El board se actualiza solo cuando otro usuario/pestaña mueve una tarjeta
  // o llega una postulación nueva desde la página pública.
  useSocketEvent('vacante:postulanteEtapa', invalidate)
  useSocketEvent('vacante:postulante', invalidate)

  const moverEtapa = useMutation({
    mutationFn: ({ id, vacanteId, etapa, orden }: { id: number; vacanteId: number; etapa: PostulanteEtapa; orden: number }) =>
      vacantesService.updateEtapaPostulante(vacanteId, id, etapa, orden),
    onSuccess: invalidate,
    onError: () => toast.error('Error al mover el postulante'),
  })

  const filtrados = postulantes.filter((p) => filtroVacante === 'todas' || p.vacanteId === filtroVacante)

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand" /> Reclutamiento y selección
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {filtrados.length} postulante{filtrados.length !== 1 ? 's' : ''} en el pipeline
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filtroVacante}
            onChange={(e) => setFiltroVacante(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            className="field text-xs py-1.5"
          >
            <option value="todas">Todas las vacantes</option>
            {vacantes.map((v) => (
              <option key={v.id} value={v.id}>{v.titulo}</option>
            ))}
          </select>

          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setVista('kanban')}
              title="Vista Kanban"
              className={clsx('flex items-center gap-1 px-3 py-2 text-[0.78rem] transition-colors', vista === 'kanban' ? 'bg-brand text-white' : 'bg-card text-gray-500 hover:bg-gray-50')}
            >
              <Kanban className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              title="Vista Lista"
              className={clsx('flex items-center gap-1 px-3 py-2 text-[0.78rem] transition-colors', vista === 'lista' ? 'bg-brand text-white' : 'bg-card text-gray-500 hover:bg-gray-50')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {vista === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 520 }}>
          {POSTULANTE_ETAPAS.map((etapa) => {
            const cards = filtrados
              .filter((p) => p.etapa === etapa.key)
              .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            return (
              <KanbanColumn
                key={etapa.key}
                etapa={etapa}
                cards={cards}
                onDragStart={(id) => { dragPostId.current = id }}
                onDragOver={(id) => { dragOverPostId.current = id }}
                onDrop={(targetEtapa) => {
                  const srcId = dragPostId.current
                  if (srcId === null) return
                  const srcPost = postulantes.find((p) => p.id === srcId)
                  if (!srcPost) { dragPostId.current = null; return }

                  if (srcPost.etapa === targetEtapa) {
                    const overId = dragOverPostId.current
                    if (overId !== null && overId !== srcId) {
                      const colCards = postulantes
                        .filter((p) => p.etapa === targetEtapa)
                        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                      const overIdx = colCards.findIndex((p) => p.id === overId)
                      const nuevoOrden = overIdx >= 0 ? overIdx : colCards.length
                      moverEtapa.mutate({ id: srcId, vacanteId: srcPost.vacanteId, etapa: targetEtapa, orden: nuevoOrden })
                    }
                  } else {
                    moverEtapa.mutate({ id: srcId, vacanteId: srcPost.vacanteId, etapa: targetEtapa, orden: 0 })
                  }
                  dragPostId.current = null
                  dragOverPostId.current = null
                }}
                onDescartar={(p) => moverEtapa.mutate({ id: p.id, vacanteId: p.vacanteId, etapa: 'descartado', orden: 0 })}
              />
            )
          })}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <UserPlus className="h-8 w-8" />
          <p className="text-sm">No hay postulantes que coincidan con el filtro</p>
        </div>
      ) : (
        <ReclutamientoListaTable postulantes={filtrados} />
      )}
    </div>
  )
}

function KanbanColumn({
  etapa, cards, onDragStart, onDragOver, onDrop, onDescartar,
}: {
  etapa: typeof POSTULANTE_ETAPAS[number]
  cards: Postulante[]
  onDragStart: (id: number) => void
  onDragOver: (id: number) => void
  onDrop: (etapa: PostulanteEtapa) => void
  onDescartar: (p: Postulante) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={clsx('flex-shrink-0 w-72 flex flex-col rounded-2xl transition-colors', over && 'ring-2 ring-brand/30 bg-brand/5')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(etapa.key) }}
    >
      <div className={clsx('flex items-center justify-between rounded-xl border px-3 py-2 mb-3', etapa.bgColor, 'border-transparent')}>
        <div className="flex items-center gap-2">
          <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', etapa.borderColor.replace('border-', 'bg-'))} />
          <span className={clsx('text-[0.78rem] font-bold', etapa.color)}>{etapa.label}</span>
        </div>
        <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold', etapa.color, 'bg-white/60')}>{cards.length}</span>
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto max-h-[70vh] p-0.5">
        {cards.map((p) => (
          <PostulanteCard
            key={p.id}
            postulante={p}
            onDragStart={() => onDragStart(p.id)}
            onDragOver={() => onDragOver(p.id)}
            onDescartar={etapa.key === 'descartado' ? undefined : () => onDescartar(p)}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300 text-[0.72rem] gap-1">
            <MoreHorizontal className="h-5 w-5" />
            Sin postulantes
          </div>
        )}
      </div>
    </div>
  )
}

function PostulanteCard({
  postulante, onDragStart, onDragOver, onDescartar,
}: {
  postulante: Postulante
  onDragStart: () => void
  onDragOver: () => void
  onDescartar?: () => void
}) {
  const etapa = POSTULANTE_ETAPAS.find((e) => e.key === postulante.etapa)
  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver() }}
      className={clsx(
        'group relative rounded-xl border-l-4 border border-gray-100 bg-card p-3 shadow-sm hover:shadow-md transition-all active:opacity-60 cursor-grab',
        etapa?.borderColor ?? 'border-gray-400',
      )}
    >
      {onDescartar && (
        <button
          onClick={(e) => { e.stopPropagation(); if (window.confirm('¿Descartar a este postulante?')) onDescartar() }}
          className="absolute right-2 top-2 hidden rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 group-hover:flex"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}

      <p className="text-[0.82rem] font-bold text-gray-900 leading-tight pr-6 mb-1">{postulante.nombre}</p>

      <p className="text-[0.7rem] text-gray-500 mb-1.5 truncate">{postulante.vacanteTitulo ?? `Vacante #${postulante.vacanteId}`}</p>

      <div className="flex items-center gap-1 text-[0.68rem] text-gray-400 mb-0.5">
        <Mail className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{postulante.email}</span>
      </div>
      {postulante.telefono && (
        <div className="flex items-center gap-1 text-[0.68rem] text-gray-400 mb-0.5">
          <Phone className="h-3 w-3 flex-shrink-0" />
          {postulante.telefono}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="flex items-center gap-0.5 text-[0.65rem] text-gray-400">
          <Calendar className="h-3 w-3" />
          {formatFecha(postulante.fecha)}
        </span>
        <a
          href={postulante.cvUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[0.68rem] font-semibold text-brand hover:underline"
        >
          <FileText className="h-3 w-3" /> CV
        </a>
      </div>
    </div>
  )
}

function ReclutamientoListaTable({ postulantes }: { postulantes: Postulante[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Postulante</th>
            <th className="px-4 py-2.5 font-semibold">Vacante</th>
            <th className="px-4 py-2.5 font-semibold">Contacto</th>
            <th className="px-4 py-2.5 font-semibold">Fecha</th>
            <th className="px-4 py-2.5 font-semibold">CV</th>
            <th className="px-4 py-2.5 font-semibold">Etapa</th>
          </tr>
        </thead>
        <tbody>
          {postulantes.map((p) => {
            const etapa = POSTULANTE_ETAPAS.find((e) => e.key === p.etapa)
            return (
              <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.nombre}</td>
                <td className="px-4 py-2.5 text-gray-600">{p.vacanteTitulo ?? `#${p.vacanteId}`}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  <div>{p.email}</div>
                  {p.telefono && <div className="text-gray-400">{p.telefono}</div>}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{formatFecha(p.fecha)}</td>
                <td className="px-4 py-2.5">
                  <a
                    href={p.cvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-semibold text-brand hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" /> Ver
                  </a>
                </td>
                <td className="px-4 py-2.5">
                  <span className={clsx('rounded-lg px-2 py-1 text-[0.7rem] font-semibold', etapa?.bgColor, etapa?.color)}>
                    {etapa?.label ?? p.etapa}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
