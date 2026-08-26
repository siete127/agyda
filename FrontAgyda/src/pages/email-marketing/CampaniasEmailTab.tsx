import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Play, Pause, Ban, BarChart2 } from 'lucide-react'
import { emailMarketingService } from '@/services/emailMarketing.service'
import { crmService } from '@/services/crm.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { EmailCampania, EmailCampaniaFiltro, EmailCampaniaEstado } from '@/types/emailMarketing.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ReporteCampaniaModal } from './ReporteCampaniaModal'

const ESTADO_LABEL: Record<EmailCampaniaEstado, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  enviando: 'Enviando',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}
const ESTADO_COLOR: Record<EmailCampaniaEstado, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  programada: 'bg-blue-100 text-blue-700',
  enviando: 'bg-amber-100 text-amber-700',
  pausada: 'bg-orange-100 text-orange-700',
  completada: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-red-100 text-red-700',
}

function CrearCampaniaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: plantillas = [] } = useQuery({ queryKey: ['email-plantillas'], queryFn: () => emailMarketingService.getPlantillas() })
  const { data: contactos = [] } = useQuery({ queryKey: ['crm-contactos-selector'], queryFn: () => crmService.getContactos() })

  const [nombre, setNombre] = useState('')
  const [plantillaId, setPlantillaId] = useState<number | ''>('')
  const [filtro, setFiltro] = useState<EmailCampaniaFiltro>('todos')
  const [filtroTag, setFiltroTag] = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [emailsPorHora, setEmailsPorHora] = useState(200)
  const [conteo, setConteo] = useState<number | null>(null)

  const contar = useMutation({
    mutationFn: () => emailMarketingService.contarDestinatarios({
      filtro,
      filtroTag: filtro === 'tag' ? filtroTag : undefined,
      contactosIds: filtro === 'manual' ? [...seleccionados] : undefined,
    }),
    onSuccess: (total) => setConteo(total),
  })

  useEffect(() => {
    setConteo(null)
    const t = setTimeout(() => {
      if (filtro === 'tag' && !filtroTag.trim()) return
      if (filtro === 'manual' && seleccionados.size === 0) return
      contar.mutate()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, filtroTag, seleccionados.size])

  const crear = useMutation({
    mutationFn: () => emailMarketingService.createCampania({
      nombre: nombre.trim(),
      plantillaId: Number(plantillaId),
      filtro,
      filtroTag: filtro === 'tag' ? filtroTag.trim() : undefined,
      contactosIds: filtro === 'manual' ? [...seleccionados] : undefined,
      emailsPorHora,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-campanias'] })
      toast.success('Campaña creada como borrador')
      onClose()
    },
    onError: () => toast.error('No se pudo crear la campaña'),
  })

  const toggleContacto = (id: number) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const puedeCrear = nombre.trim() && plantillaId &&
    (filtro === 'todos' || (filtro === 'tag' && filtroTag.trim()) || (filtro === 'manual' && seleccionados.size > 0))

  return (
    <Modal isOpen onClose={onClose} title="Nueva campaña de email" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre de la campaña</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Plantilla</label>
            <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
              <option value="">Selecciona una plantilla…</option>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Destinatarios</label>
          <div className="flex gap-1.5 mb-2">
            {([
              { key: 'todos' as const, label: 'Todos los contactos' },
              { key: 'tag' as const, label: 'Por etiqueta' },
              { key: 'manual' as const, label: 'Selección manual' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltro(key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border',
                  filtro === key ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filtro === 'tag' && (
            <input
              type="text"
              value={filtroTag}
              onChange={(e) => setFiltroTag(e.target.value)}
              placeholder="Etiqueta del contacto (ej. cliente-vip)"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          )}

          {filtro === 'manual' && (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {contactos.filter((c) => c.correo).map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggleContacto(c.id)} />
                  <span className="font-medium text-gray-700">{c.nombre}</span>
                  <span className="text-gray-400">{c.correo}</span>
                </label>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-gray-500">
            {contar.isPending ? 'Calculando…' : conteo !== null ? `Esto le llegará a ${conteo} contacto(s).` : ''}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Límite de correos por hora</label>
          <input
            type="number"
            min={1}
            max={2000}
            value={emailsPorHora}
            onChange={(e) => setEmailsPorHora(Number(e.target.value))}
            className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-gray-400">Un valor conservador (200) reduce el riesgo de que el proveedor de correo marque la cuenta como spam.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => crear.mutate()} disabled={!puedeCrear || crear.isPending}>
            {crear.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Crear campaña
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CampaniaRow({ campania }: { campania: EmailCampania }) {
  const qc = useQueryClient()
  const [reporteOpen, setReporteOpen] = useState(false)

  const invalidar = () => qc.invalidateQueries({ queryKey: ['email-campanias'] })

  const iniciar = useMutation({
    mutationFn: () => emailMarketingService.iniciarCampania(campania.id),
    onSuccess: (data) => { toast.success(`Envío iniciado a ${data.destinatarios} contacto(s)`); invalidar() },
    onError: () => toast.error('No se pudo iniciar la campaña'),
  })
  const pausar = useMutation({
    mutationFn: () => emailMarketingService.pausarCampania(campania.id),
    onSuccess: () => { toast.success('Campaña pausada'); invalidar() },
  })
  const reanudar = useMutation({
    mutationFn: () => emailMarketingService.reanudarCampania(campania.id),
    onSuccess: () => { toast.success('Campaña reanudada'); invalidar() },
  })
  const cancelar = useMutation({
    mutationFn: () => emailMarketingService.cancelarCampania(campania.id),
    onSuccess: () => { toast.success('Campaña cancelada'); invalidar() },
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 bg-white">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800 truncate">{campania.nombre}</p>
          <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0', ESTADO_COLOR[campania.estado])}>
            {ESTADO_LABEL[campania.estado]}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate">{campania.plantillaNombre} · {campania.emailsPorHora}/hora</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="ghost" onClick={() => setReporteOpen(true)}>
          <BarChart2 size={13} />
        </Button>
        {['borrador', 'programada'].includes(campania.estado) && (
          <Button size="sm" onClick={() => iniciar.mutate()} disabled={iniciar.isPending}>
            <Play size={13} /> Iniciar
          </Button>
        )}
        {campania.estado === 'enviando' && (
          <Button size="sm" variant="secondary" onClick={() => pausar.mutate()} disabled={pausar.isPending}>
            <Pause size={13} /> Pausar
          </Button>
        )}
        {campania.estado === 'pausada' && (
          <Button size="sm" onClick={() => reanudar.mutate()} disabled={reanudar.isPending}>
            <Play size={13} /> Reanudar
          </Button>
        )}
        {['enviando', 'pausada'].includes(campania.estado) && (
          <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('¿Cancelar esta campaña? No se puede deshacer.')) cancelar.mutate() }} disabled={cancelar.isPending}>
            <Ban size={13} />
          </Button>
        )}
      </div>
      {reporteOpen && <ReporteCampaniaModal campaniaId={campania.id} onClose={() => setReporteOpen(false)} />}
    </div>
  )
}

export function CampaniasEmailTab() {
  const { data: campanias = [], isLoading } = useQuery({
    queryKey: ['email-campanias'],
    queryFn: () => emailMarketingService.getCampanias(),
    refetchInterval: 15_000,
  })
  const [crearOpen, setCrearOpen] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Los contactos que se dieron de baja nunca reciben campañas, sin importar el filtro elegido.</p>
        <Button size="sm" onClick={() => setCrearOpen(true)}>
          <Plus size={14} />
          Nueva campaña
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : campanias.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">Todavía no hay campañas creadas</p>
      ) : (
        <div className="space-y-2">
          {campanias.map((c) => <CampaniaRow key={c.id} campania={c} />)}
        </div>
      )}

      {crearOpen && <CrearCampaniaModal onClose={() => setCrearOpen(false)} />}
    </div>
  )
}
