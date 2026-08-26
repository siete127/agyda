import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVentasSession } from '@/hooks/useVentasSession'
import { ventasService } from '@/services/ventas.service'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'
import { Megaphone, Plus, AlertCircle, RefreshCw } from 'lucide-react'

export function VentasCampanasPage() {
  const { isReady, error, retry } = useVentasSession()
  if (!isReady) return <div className="flex min-h-[50vh] items-center justify-center"><Spinner size="lg" /></div>
  if (error) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-gray-500">{error}</p>
      <button onClick={retry} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
    </div>
  )
  return <CampanasContent />
}

function CampanasContent() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [nombre,    setNombre]    = useState('')

  const { data: campanas = [], isLoading } = useQuery({
    queryKey: ['ventas-campanas'],
    queryFn:  () => ventasService.getCampanas(),
    staleTime: 60_000,
  })

  const crear = useMutation({
    mutationFn: () => ventasService.createCampana(nombre.trim()),
    onSuccess: () => {
      toast.success('Campaña creada')
      setNombre(''); setShowModal(false)
      qc.invalidateQueries({ queryKey: ['ventas-campanas'] })
    },
    onError: () => toast.error('Error al crear campaña'),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-brand" /> Campañas
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">{campanas.length} campaña{campanas.length !== 1 ? 's' : ''} registrada{campanas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark transition-colors">
          <Plus className="h-4 w-4" /> Nueva campaña
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : campanas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <Megaphone className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin campañas registradas</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {campanas.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10">
                  <Megaphone className="h-4 w-4 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.85rem] font-semibold text-gray-900">{c.nombre}</p>
                  <p className="text-[0.72rem] text-gray-400">ID: {c.id}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal isOpen title="Nueva campaña" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre de la campaña</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && crear.mutate()}
                placeholder="Ej: BANAMEX, HSBC..."
                className="field w-full"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={() => crear.mutate()} disabled={!nombre.trim() || crear.isPending}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
                {crear.isPending && <Spinner size="sm" />} Crear
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
