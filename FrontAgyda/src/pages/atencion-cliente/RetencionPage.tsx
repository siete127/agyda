import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, Plus, Clock, AlertCircle, ChevronLeft, UserCheck } from 'lucide-react'
import { api } from '@/lib/axios'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { crmService } from '@/services/crm.service'

interface Retencion {
  id: number
  clienteId: number | null
  clienteNombre: string
  estatus: string
  fechaEvaluacion: string
  motivoRiesgo: string | null
}

const ESTATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  riesgo:     { label: 'En riesgo',  bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  estable:    { label: 'Estable',    bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  recuperado: { label: 'Recuperado', bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

function NuevaEvaluacionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [estatus, setEstatus] = useState<'riesgo' | 'estable' | 'recuperado'>('riesgo')
  const [motivoRiesgo, setMotivoRiesgo] = useState('')

  const { data: clientes } = useQuery({
    queryKey: ['clientes-lista'],
    queryFn: () => crmService.getClientes(),
    staleTime: 60_000,
  })

  const seleccionarCliente = (id: string) => {
    setClienteId(id)
    const c = clientes?.find((x) => String(x.id) === id)
    if (c) setClienteNombre(c.nombre)
  }

  const crear = useMutation({
    mutationFn: () => api.post('/atencion-cliente/retencion', {
      clienteId: clienteId || undefined,
      clienteNombre: clienteNombre.trim(),
      estatus,
      motivoRiesgo: motivoRiesgo.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retencion'] })
      qc.invalidateQueries({ queryKey: ['atencion-cliente-dashboard'] })
      toast.success('Evaluación registrada')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo registrar la evaluación')
    },
  })

  const puedeGuardar = clienteNombre.trim() && (estatus !== 'riesgo' || motivoRiesgo.trim())

  return (
    <Modal isOpen onClose={onClose} title="Nueva evaluación de retención" size="md">
      <div className="space-y-4">
        {clientes && clientes.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente registrado (opcional)</label>
            <select value={clienteId} onChange={(e) => seleccionarCliente(e.target.value)} className="field">
              <option value="">Escribir manualmente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre del cliente</label>
          <input value={clienteNombre} onChange={(e) => { setClienteNombre(e.target.value); setClienteId('') }}
            className="field" placeholder="Nombre completo" autoFocus maxLength={255} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estatus</label>
          <div className="grid grid-cols-3 gap-2">
            {(['riesgo', 'estable', 'recuperado'] as const).map((v) => {
              const cfg = ESTATUS_CFG[v]
              return (
                <button key={v} type="button" onClick={() => setEstatus(v)}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 rounded-xl border-2 py-2 text-[0.78rem] font-semibold transition-all',
                    estatus === v ? `${cfg.border} ${cfg.bg} ${cfg.text}` : 'border-gray-200 text-gray-400 hover:border-gray-300',
                  )}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Motivo de riesgo {estatus === 'riesgo' && <span className="text-red-500">*</span>}
          </label>
          <textarea value={motivoRiesgo} onChange={(e) => setMotivoRiesgo(e.target.value)}
            rows={4} className="field resize-none" placeholder="Describe por qué este cliente está en riesgo, o las acciones de retención tomadas..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>
            Registrar evaluación
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function RetencionPage() {
  const navigate = useNavigate()
  const { can, isLoading: loadingAccess } = useActionAccess()
  const puedeCrear = can('atencion-cliente', 'crear-retencion')
  const [showNueva, setShowNueva] = useState(false)

  const { data: evaluaciones = [], isLoading, error } = useQuery<Retencion[]>({
    queryKey: ['retencion'],
    queryFn: async () => {
      const { data } = await api.get('/atencion-cliente/retencion')
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    enabled: !loadingAccess,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #450A0A 0%, #B91C1C 25%, #F87171 50%, #B91C1C 75%, #450A0A 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <ShieldAlert className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Retención de Clientes</h1>
                <p className="mt-0.5 text-xs text-red-100/80">
                  {evaluaciones.length} evaluación{evaluaciones.length !== 1 ? 'es' : ''} registrada{evaluaciones.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {puedeCrear && (
              <Button onClick={() => setShowNueva(true)}
                className="bg-card !text-red-700 hover:bg-red-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Nueva evaluación
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        {(['riesgo', 'estable', 'recuperado'] as const).map((v) => {
          const cfg = ESTATUS_CFG[v]
          const count = evaluaciones.filter((e) => e.estatus === v).length
          return (
            <div key={v} className={clsx('rounded-2xl border px-4 py-3', cfg.border, cfg.bg)}>
              <p className={clsx('text-[0.7rem] font-semibold uppercase tracking-wide', cfg.text)}>{cfg.label}</p>
              <p className={clsx('text-2xl font-bold mt-0.5', cfg.text)}>{count}</p>
            </div>
          )
        })}
      </div>

      {/* Contenido */}
      {isLoading || loadingAccess ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="card p-4 animate-pulse h-16" />)}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar evaluaciones de retención</p>
        </div>
      ) : evaluaciones.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <UserCheck className="h-7 w-7 text-red-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin evaluaciones registradas</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {puedeCrear ? 'Usa el botón para registrar la primera evaluación de retención.' : 'No hay evaluaciones de retención por revisar.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {evaluaciones.map((e) => {
            const cfg = ESTATUS_CFG[e.estatus] ?? ESTATUS_CFG['estable']
            return (
              <div key={e.id} className="flex items-start gap-3 rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4">
                <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
                  <ShieldAlert className={clsx('h-4 w-4', cfg.text)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{e.clienteNombre}</p>
                    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold', cfg.bg, cfg.text, cfg.border)}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
                      {cfg.label}
                    </span>
                  </div>
                  {e.motivoRiesgo && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{e.motivoRiesgo}</p>}
                  <p className="flex items-center gap-1 text-[0.68rem] text-gray-400 mt-1.5">
                    <Clock className="h-3 w-3" /> {fmtFecha(e.fechaEvaluacion)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNueva && <NuevaEvaluacionModal onClose={() => setShowNueva(false)} />}
    </div>
  )
}
