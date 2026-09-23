import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ChevronLeft, Send } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'

export function AtencionNuevaPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const enviar = useMutation({
    mutationFn: () => portalClienteService.crearIncidencia({ titulo: titulo.trim(), descripcion: descripcion.trim(), categoria: categoria || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['portal-incidencias'] })
      toast.success(`Solicitud registrada — folio ${res.folio}`)
      navigate('/portal-cliente/atencion')
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo enviar la solicitud'),
  })

  const puedeEnviar = titulo.trim().length > 0 && descripcion.trim().length > 0

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <div>
        <button onClick={() => navigate('/portal-cliente/atencion')} className="mb-2 flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención
        </button>
        <h1 className="text-xl font-extrabold text-ink">Nueva solicitud</h1>
        <p className="mt-1 text-sm text-ink-tertiary">Cuéntanos qué necesitas, un asesor te responderá a la brevedad.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Título *</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Resumen breve de tu solicitud"
            className="w-full rounded-xl border border-surface-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Categoría (opcional)</label>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={50} placeholder="Ej. Facturación, Soporte técnico..."
            className="w-full rounded-xl border border-surface-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Descripción *</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={4000} rows={6} placeholder="Describe con el mayor detalle posible tu solicitud"
            className="w-full resize-none rounded-xl border border-surface-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => navigate('/portal-cliente/atencion')} className="rounded-full border border-surface-border px-5 py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface">
            Cancelar
          </button>
          <button onClick={() => enviar.mutate()} disabled={!puedeEnviar || enviar.isPending} className="flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-60">
            <Send className="h-3.5 w-3.5" /> Enviar solicitud
          </button>
        </div>
      </div>
    </div>
  )
}
