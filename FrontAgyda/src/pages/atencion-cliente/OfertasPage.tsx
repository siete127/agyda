import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ChevronLeft, Gift, Plus, Send, Mail, MessageCircle, Users } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ofertaService, type OfertaSegmento } from '@/services/oferta.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import { useActionAccess } from '@/hooks/useActionAccess'

function fmt(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function OfertasPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puede = can('atencion-cliente', 'ofertas-gestionar')
  const qc = useQueryClient()
  const [nueva, setNueva] = useState(false)

  const { data: ofertas = [], isLoading } = useQuery({
    queryKey: ['ofertas'],
    queryFn: () => ofertaService.getAll(),
    staleTime: 15_000,
  })

  const enviar = useMutation({
    mutationFn: (id: number) => ofertaService.enviar(id),
    onSuccess: (r) => {
      toast.success(`Enviada: ${r.enviados} OK, ${r.fallidos} fallidos (${r.contactos} contactos)`)
      qc.invalidateQueries({ queryKey: ['ofertas'] })
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo enviar'),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      {!embedded && (
        <>
          <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
          </button>

          <div className="card overflow-hidden">
            <div className="animate-gradient-x relative overflow-hidden px-6 py-5"
              style={{ backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)', backgroundSize: '200% 100%' }}>
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Gift className="h-5 w-5 text-white" /></div>
                  <div>
                    <h1 className="text-lg font-bold text-white tracking-tight">Ofertas</h1>
                    <p className="mt-0.5 text-xs text-blue-100/80">Campañas a segmentos de clientes por correo y WhatsApp</p>
                  </div>
                </div>
                {puede && (
                  <button onClick={() => setNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-white/25 transition-colors">
                    <Plus className="h-4 w-4" /> Nueva oferta
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {embedded && puede && (
        <div className="flex justify-end">
          <button onClick={() => setNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-4 w-4" /> Nueva oferta
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : ofertas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Gift className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Sin ofertas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ofertas.map((o) => (
            <div key={o.id} className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold',
                      o.estatus === 'enviada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {o.estatus === 'enviada' ? 'Enviada' : 'Borrador'}
                    </span>
                    {o.canales.split(',').map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.6rem] font-semibold text-gray-500">
                        {c === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />} {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[0.9rem] font-bold text-gray-800">{o.titulo}</p>
                  <p className="text-[0.8rem] text-gray-500 line-clamp-2">{o.mensaje}</p>
                  <p className="mt-1 text-[0.68rem] text-gray-400">
                    {fmt(o.fechaCreacion)}{o.creadaPorNombre ? ` · ${o.creadaPorNombre}` : ''}
                    {o.estatus === 'enviada' && ` · ${o.enviosOk} enviados${o.enviosFallidos ? `, ${o.enviosFallidos} fallidos` : ''}`}
                  </p>
                </div>
                {puede && o.estatus === 'borrador' && (
                  <button
                    onClick={() => { if (window.confirm(`¿Enviar la oferta "${o.titulo}" ahora?`)) enviar.mutate(o.id) }}
                    disabled={enviar.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors disabled:opacity-50 flex-shrink-0">
                    <Send className="h-3.5 w-3.5" /> Enviar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {nueva && <NuevaOfertaModal onClose={() => setNueva(false)} />}
    </div>
  )
}

function NuevaOfertaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [tags, setTags] = useState('')
  const [estatus, setEstatus] = useState<string[]>([])
  const [canales, setCanales] = useState<string[]>(['correo'])

  const segmento = (): OfertaSegmento => ({
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    estatus,
    soloClientes: true,
  })

  const preview = useQuery({
    queryKey: ['oferta-preview', tags, estatus],
    queryFn: () => ofertaService.previewSegmento(segmento()),
    staleTime: 5_000,
  })

  const crear = useMutation({
    mutationFn: () => ofertaService.create({ titulo: titulo.trim(), mensaje: mensaje.trim(), segmento: segmento(), canales }),
    onSuccess: () => { toast.success('Oferta guardada como borrador'); qc.invalidateQueries({ queryKey: ['ofertas'] }); onClose() },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo guardar'),
  })

  const toggleEstatus = (k: string) => setEstatus((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])
  const toggleCanal = (c: string) => setCanales((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])

  return (
    <Modal isOpen onClose={onClose} title="Nueva oferta" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Ej. 20% de descuento en renovación" maxLength={200} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Mensaje</label>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} className="field resize-none" placeholder="El contenido que recibirá el cliente por correo y WhatsApp..." />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Segmento — tags (opcional, separados por coma)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="field" placeholder="vip, mayoreo" maxLength={200} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Segmento — estatus de cliente</label>
          <div className="flex flex-wrap gap-1.5">
            {CLIENTE_ESTATUS_COLORES.map((c) => (
              <button key={c.key} type="button" onClick={() => toggleEstatus(c.key)}
                className={clsx('rounded-lg border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors',
                  estatus.includes(c.key) ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Canales</label>
          <div className="flex gap-2">
            {(['correo', 'whatsapp'] as const).map((c) => (
              <button key={c} type="button" onClick={() => toggleCanal(c)}
                className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-[0.75rem] font-semibold capitalize transition-all',
                  canales.includes(c) ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-400')}>
                {c === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {c}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-blue-50 px-3 py-2 text-[0.78rem] text-blue-800 flex items-center gap-2">
          <Users className="h-4 w-4 flex-shrink-0" />
          {preview.isLoading ? 'Calculando alcance...' : preview.data ? (
            <span>
              <strong>{preview.data.total}</strong> clientes en el segmento ·
              {' '}{preview.data.conCorreo} con correo · {preview.data.conTelefono} con teléfono
            </span>
          ) : 'Segmento vacío'}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!titulo.trim() || !mensaje.trim() || !canales.length} onClick={() => crear.mutate()}>
            Guardar borrador
          </Button>
        </div>
      </div>
    </Modal>
  )
}
