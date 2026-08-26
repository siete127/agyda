import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  UserCheck, Search, Building2, DollarSign, FileText, ClipboardList,
  Plus, Trash2, Ban, Download, Eye, EyeOff, Send, CheckCircle2, Circle,
  Pencil, Copy,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { useActionAccess } from '@/hooks/useActionAccess'
import { crmService } from '@/services/crm.service'
import { encuestasService } from '@/services/encuestas.service'
import { EditarEncuestaModal } from '@/pages/encuestas/EncuestasPage'
import type { Encuesta } from '@/types/encuesta.types'
import type { CRMContacto, CRMRecordatorioPago, CRMDocumentoCliente } from '@/types/crm.types'

type SubTab = 'recordatorios' | 'documentos' | 'encuestas'

export function CRMSeguimientoTab() {
  const { can } = useActionAccess()
  const [busqueda, setBusqueda] = useState('')
  const [contacto, setContacto] = useState<CRMContacto | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('recordatorios')

  const { data: contactos = [], isLoading } = useQuery({
    queryKey: ['crm-contactos'],
    queryFn: () => crmService.getContactos(),
    staleTime: 60_000,
  })

  const filtrados = busqueda
    ? contactos.filter((c) =>
        `${c.nombre} ${c.empresa ?? ''} ${c.correo ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()))
    : contactos

  const puedeVer = can('crm', 'seguimiento-ver')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      {/* Selector de contacto */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden flex flex-col max-h-[75vh]">
        <div className="border-b border-gray-100 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar contacto..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-8 pr-3 py-2 text-[0.78rem] outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : filtrados.length === 0 ? (
            <p className="p-4 text-center text-[0.75rem] text-gray-400">Sin contactos</p>
          ) : (
            filtrados.map((c) => (
              <button
                key={c.id}
                onClick={() => setContacto(c)}
                className={clsx(
                  'w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors',
                  contacto?.id === c.id ? 'bg-brand/5' : 'hover:bg-gray-50',
                )}
              >
                <p className={clsx('text-[0.8rem] font-semibold truncate', contacto?.id === c.id ? 'text-brand' : 'text-gray-800')}>{c.nombre}</p>
                {c.empresa && <p className="text-[0.68rem] text-gray-400 truncate flex items-center gap-1"><Building2 className="h-3 w-3" />{c.empresa}</p>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="min-w-0">
        {!contacto ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-300">
            <UserCheck className="h-10 w-10 opacity-30" />
            <p className="text-[0.85rem] font-medium text-gray-400">Selecciona un contacto para ver su seguimiento</p>
          </div>
        ) : !puedeVer ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-300">
            <p className="text-[0.85rem] font-medium text-gray-400">No tienes acceso a Seguimiento</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[0.95rem] font-bold text-gray-900">{contacto.nombre}</h3>
                {contacto.empresa && <p className="text-[0.75rem] text-gray-500">{contacto.empresa}</p>}
              </div>
            </div>

            <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit flex-wrap">
              {([
                { key: 'recordatorios', label: 'Recordatorios de pago', icon: <DollarSign className="h-3.5 w-3.5" /> },
                { key: 'documentos',     label: 'Documentos',            icon: <FileText className="h-3.5 w-3.5" /> },
                { key: 'encuestas',      label: 'Encuestas',             icon: <ClipboardList className="h-3.5 w-3.5" /> },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSubTab(t.key)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-all',
                    subTab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>

            {subTab === 'recordatorios' && <RecordatoriosSeccion contacto={contacto} />}
            {subTab === 'documentos' && <DocumentosSeccion contacto={contacto} />}
            {subTab === 'encuestas' && <EncuestasSeccion contacto={contacto} />}
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   RECORDATORIOS DE PAGO
════════════════════════════════════════════════════════ */
const ESTATUS_STYLE: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-700',
  enviado: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

function RecordatoriosSeccion({ contacto }: { contacto: CRMContacto }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const puedeGestionar = can('crm', 'seguimiento-recordatorios')

  const { data: recordatorios = [], isLoading } = useQuery({
    queryKey: ['crm-recordatorios', contacto.id],
    queryFn: () => crmService.getRecordatorios(contacto.id),
    staleTime: 15_000,
  })

  const cancelar = useMutation({
    mutationFn: (id: number) => crmService.cancelarRecordatorio(id),
    onSuccess: () => { toast.success('Recordatorio cancelado'); qc.invalidateQueries({ queryKey: ['crm-recordatorios', contacto.id] }) },
    onError: () => toast.error('Error al cancelar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => crmService.deleteRecordatorio(id),
    onSuccess: () => { toast.success('Recordatorio eliminado'); qc.invalidateQueries({ queryKey: ['crm-recordatorios', contacto.id] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Recordatorios de pago</p>
        {puedeGestionar && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : recordatorios.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin recordatorios registrados</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {recordatorios.map((r: CRMRecordatorioPago) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{r.concepto}</p>
                <p className="text-[0.7rem] text-gray-400">
                  ${r.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · vence {r.fechaLimite}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold capitalize', ESTATUS_STYLE[r.estatus])}>{r.estatus}</span>
                {puedeGestionar && r.estatus === 'pendiente' && (
                  <>
                    <button onClick={() => cancelar.mutate(r.id)} title="Cancelar" className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (window.confirm('¿Eliminar este recordatorio?')) eliminar.mutate(r.id) }}
                      title="Eliminar"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NuevoRecordatorioModal
          contactoId={contacto.id}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ['crm-recordatorios', contacto.id] }) }}
        />
      )}
    </div>
  )
}

function NuevoRecordatorioModal({ contactoId, onClose, onSaved }: { contactoId: number; onClose: () => void; onSaved: () => void }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [notas, setNotas] = useState('')

  const save = useMutation({
    mutationFn: () => crmService.createRecordatorio({
      contactoId, concepto: concepto.trim(), monto: parseFloat(monto), fechaLimite, notas: notas || undefined,
    }),
    onSuccess: () => { toast.success('Recordatorio creado'); onSaved() },
    onError: () => toast.error('Error al crear'),
  })

  const valido = concepto.trim() && parseFloat(monto) > 0 && fechaLimite

  return (
    <Modal isOpen title="Nuevo recordatorio de pago" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="field-label">Concepto *</label>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className="field-input" placeholder="Ej: Mensualidad de servicio" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Monto *</label>
            <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="field-input" placeholder="0.00" />
          </div>
          <div>
            <label className="field-label">Fecha límite *</label>
            <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="field-input" />
          </div>
        </div>
        <div>
          <label className="field-label">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="field-input resize-none" placeholder="Opcional" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button
            onClick={() => save.mutate()}
            disabled={!valido || save.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
          >
            {save.isPending && <Spinner size="sm" />} Crear recordatorio
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════
   DOCUMENTOS
════════════════════════════════════════════════════════ */
function DocumentosSeccion({ contacto }: { contacto: CRMContacto }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const puedeGestionar = can('crm', 'seguimiento-documentos')

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['crm-documentos-cliente', contacto.id],
    queryFn: () => crmService.getDocumentosCliente(contacto.id),
    staleTime: 15_000,
  })

  const upload = useMutation({
    mutationFn: (file: File) => crmService.uploadDocumentoCliente(contacto.id, file),
    onSuccess: () => { toast.success('Documento subido'); qc.invalidateQueries({ queryKey: ['crm-documentos-cliente', contacto.id] }) },
    onError: () => toast.error('Error al subir documento'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, visible }: { id: number; visible: boolean }) => crmService.toggleDocumentoPortal(id, visible),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-documentos-cliente', contacto.id] }),
    onError: () => toast.error('Error al actualizar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => crmService.deleteDocumentoCliente(id),
    onSuccess: () => { toast.success('Documento eliminado'); qc.invalidateQueries({ queryKey: ['crm-documentos-cliente', contacto.id] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = ''
  }

  const fmtSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Documentos del cliente</p>
        {puedeGestionar && (
          <label className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors cursor-pointer">
            {upload.isPending ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />} Subir documento
            <input type="file" className="hidden" onChange={handleFile} disabled={upload.isPending} />
          </label>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : documentos.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin documentos subidos</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {documentos.map((d: CRMDocumentoCliente) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{d.nombreOriginal}</p>
                  <p className="text-[0.68rem] text-gray-400">{fmtSize(d.tamanoBytes)} · {new Date(d.fechaSubida).toLocaleDateString('es-MX')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', d.visiblePortal ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                  {d.visiblePortal ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {d.visiblePortal ? 'En portal' : 'Interno'}
                </span>
                <button
                  onClick={() => crmService.downloadDocumentoCliente(d.id, d.nombreOriginal)}
                  title="Descargar"
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {puedeGestionar && (
                  <>
                    <button
                      onClick={() => toggle.mutate({ id: d.id, visible: !d.visiblePortal })}
                      title={d.visiblePortal ? 'Ocultar del portal' : 'Mostrar en portal'}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
                    >
                      {d.visiblePortal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => { if (window.confirm('¿Eliminar este documento?')) eliminar.mutate(d.id) }}
                      title="Eliminar"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   ENCUESTAS DE SATISFACCIÓN
════════════════════════════════════════════════════════ */
function EncuestasSeccion({ contacto }: { contacto: CRMContacto }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const [encuestaId, setEncuestaId] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editando, setEditando] = useState<Encuesta | null>(null)
  const puedeEnviar = can('crm', 'seguimiento-encuestas')

  const { data: disponibles = [] } = useQuery({
    queryKey: ['crm-encuestas-disponibles'],
    queryFn: () => crmService.getEncuestasDisponibles(),
    staleTime: 60_000,
    enabled: puedeEnviar,
  })

  const abrirEditor = useMutation({
    mutationFn: (id: number) => encuestasService.getById(id),
    onSuccess: (enc) => setEditando(enc),
    onError: () => toast.error('No se pudo cargar la encuesta'),
  })

  const duplicar = useMutation({
    mutationFn: () => {
      const original = disponibles.find((e) => e.id === Number(encuestaId))
      const nombre = window.prompt('Nombre de la nueva encuesta (copia):', `${original?.titulo ?? 'Encuesta'} (copia)`)
      if (nombre === null) return Promise.reject(new Error('cancelado'))
      return encuestasService.duplicar(Number(encuestaId), nombre)
    },
    onSuccess: () => {
      toast.success('Encuesta duplicada — revísala en el módulo Encuestas para publicarla')
      qc.invalidateQueries({ queryKey: ['crm-encuestas-disponibles'] })
    },
    onError: (e: Error) => { if (e.message !== 'cancelado') toast.error('Error al duplicar encuesta') },
  })

  const { data: enviadas = [], isLoading } = useQuery({
    queryKey: ['crm-encuestas-enviadas', contacto.id],
    queryFn: () => crmService.getEncuestasEnviadas(contacto.id),
    staleTime: 15_000,
  })

  const enviar = useMutation({
    mutationFn: () => crmService.enviarEncuestaContacto(contacto.id, Number(encuestaId)),
    onSuccess: () => {
      toast.success('Encuesta enviada')
      setEncuestaId('')
      qc.invalidateQueries({ queryKey: ['crm-encuestas-enviadas', contacto.id] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Error al enviar encuesta')
    },
  })

  if (!contacto.correo) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
        <p className="text-[0.78rem] font-semibold text-amber-700">Este contacto no tiene correo registrado</p>
        <p className="text-[0.7rem] text-amber-600 mt-1">Agrega un correo para poder enviarle encuestas o recordatorios</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {puedeEnviar && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4 flex items-center gap-2 flex-wrap">
          <select
            value={encuestaId}
            onChange={(e) => setEncuestaId(e.target.value)}
            className="field-input flex-1 min-w-[200px]"
          >
            <option value="">Selecciona una encuesta pública activa...</option>
            {disponibles.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
          </select>
          <button
            onClick={() => abrirEditor.mutate(Number(encuestaId))}
            disabled={!encuestaId || abrirEditor.isPending}
            title="Ver / editar esta encuesta"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[0.75rem] font-semibold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            {abrirEditor.isPending ? <Spinner size="sm" /> : <Pencil className="h-3.5 w-3.5" />} Ver / Editar
          </button>
          <button
            onClick={() => duplicar.mutate()}
            disabled={!encuestaId || duplicar.isPending}
            title="Guardar como una encuesta nueva (con otro nombre)"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[0.75rem] font-semibold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            {duplicar.isPending ? <Spinner size="sm" /> : <Copy className="h-3.5 w-3.5" />} Guardar como nueva
          </button>
          <button
            onClick={() => enviar.mutate()}
            disabled={!encuestaId || enviar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
          >
            {enviar.isPending ? <Spinner size="sm" /> : <Send className="h-3.5 w-3.5" />} Enviar
          </button>
        </div>
      )}

      {editando && (
        <EditarEncuestaModal
          encuesta={editando}
          onClose={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['crm-encuestas-disponibles'] }) }}
        />
      )}

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Encuestas enviadas</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="sm" /></div>
        ) : enviadas.length === 0 ? (
          <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin encuestas enviadas a este contacto</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {enviadas.map((e) => (
              <div key={e.id}>
                <button
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{e.encuestaTitulo ?? `Encuesta #${e.encuestaId}`}</p>
                    <p className="text-[0.68rem] text-gray-400">Enviada {new Date(e.fechaEnvio).toLocaleDateString('es-MX')}</p>
                  </div>
                  <span className={clsx('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold flex-shrink-0', e.respondio ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    {e.respondio ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                    {e.respondio ? 'Respondió' : 'Pendiente'}
                  </span>
                </button>
                {expandedId === e.id && e.respondio && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {e.respuestas.map((r, i) => (
                      <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[0.68rem] font-semibold text-gray-500">{r.pregunta}</p>
                        <p className="text-[0.75rem] text-gray-800">{r.respuesta}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
