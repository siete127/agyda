import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, Plus, Trash2, X, FileText, Upload, Globe2, CheckCircle2, Clock, FileDown, FileSpreadsheet,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  proteccionDatosService,
  type ActividadRat,
  type BaseLegalRat,
  type EstatusRat,
  type EstatusRevisionRat,
  type TipoAdjuntoRat,
} from '@/services/proteccionDatos.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const BASE_LEGAL_LABEL: Record<BaseLegalRat, string> = {
  consentimiento: 'Consentimiento',
  contrato: 'Ejecución de contrato',
  obligacion_legal: 'Obligación legal',
  interes_legitimo: 'Interés legítimo',
  interes_vital: 'Interés vital',
  funcion_publica: 'Función pública',
  obligacion_laboral: 'Obligación laboral',
}

const ESTATUS_REVISION_CONFIG: Record<EstatusRevisionRat, { label: string; cls: string; dot: string }> = {
  al_dia: { label: 'Al día', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  revision_proxima: { label: 'Revisión próxima', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  revision_vencida: { label: 'Revisión vencida', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  sin_revisar: { label: 'Sin revisar', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

const ADJUNTO_LABEL: Record<TipoAdjuntoRat, string> = {
  aviso_privacidad: 'Aviso de privacidad',
  contrato_encargado: 'Contrato de encargado',
  dpia: 'DPIA',
  otro: 'Otro',
}

const CATEGORIAS_DATOS_CATALOGO = [
  'Identificación', 'Contacto', 'Laborales', 'Académicos', 'Patrimoniales/Financieros',
  'Datos sensibles — salud', 'Datos sensibles — biométricos', 'Datos sensibles — origen racial/étnico',
  'Datos sensibles — creencias religiosas/filosóficas', 'Datos sensibles — afiliación sindical',
  'Datos sensibles — preferencia sexual', 'Datos sensibles — opiniones políticas',
]

const CATEGORIAS_INTERESADOS_CATALOGO = [
  'Empleados', 'Candidatos/Aspirantes', 'Clientes', 'Proveedores', 'Usuarios web/App', 'Terceros/Visitantes',
]

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function splitCsv(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

// ── Sección colapsable ────────────────────────────────────────────────────
function Seccion({ titulo, defaultOpen = false, children }: { titulo: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-gray-200 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-secondary hover:bg-gray-50">
        {titulo}
      </summary>
      <div className="space-y-3 border-t border-gray-100 p-3">{children}</div>
    </details>
  )
}

function CheckboxGrid({ opciones, seleccionadas, onToggle }: { opciones: string[]; seleccionadas: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {opciones.map((o) => (
        <label key={o} className="flex items-center gap-2 text-xs text-ink-secondary">
          <input type="checkbox" checked={seleccionadas.includes(o)} onChange={() => onToggle(o)} />
          {o}
        </label>
      ))}
    </div>
  )
}

// ── Formulario (crear/editar) ─────────────────────────────────────────────
function ActividadRatFormModal({ isOpen, onClose, actividad }: { isOpen: boolean; onClose: () => void; actividad: ActividadRat | null }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const esEdicion = !!actividad

  const [nombreActividad, setNombreActividad] = useState(actividad?.nombreActividad || '')
  const [areaDuena, setAreaDuena] = useState(actividad?.areaDuena || '')
  const [responsableTratamiento, setResponsableTratamiento] = useState(actividad?.responsableTratamiento || '')
  const [responsableContacto, setResponsableContacto] = useState(actividad?.responsableContacto || '')
  const [finalidad, setFinalidad] = useState(actividad?.finalidad || '')
  const [baseLegal, setBaseLegal] = useState<BaseLegalRat>(actividad?.baseLegal || 'consentimiento')
  const [baseLegalDetalle, setBaseLegalDetalle] = useState(actividad?.baseLegalDetalle || '')
  const [categoriasDatos, setCategoriasDatos] = useState<string[]>(actividad ? splitCsv(actividad.categoriasDatos) : [])
  const [categoriasDatosSensibles, setCategoriasDatosSensibles] = useState(actividad?.categoriasDatosSensibles || false)
  const [categoriasInteresados, setCategoriasInteresados] = useState<string[]>(actividad ? splitCsv(actividad.categoriasInteresados) : [])
  const [destinatarios, setDestinatarios] = useState(actividad?.destinatarios || '')
  const [plazoConservacion, setPlazoConservacion] = useState(actividad?.plazoConservacion || '')
  const [medidasTecnicas, setMedidasTecnicas] = useState(actividad?.medidasSeguridadTecnicas || '')
  const [medidasOrganizativas, setMedidasOrganizativas] = useState(actividad?.medidasSeguridadOrganizativas || '')
  const [transferenciaInternacional, setTransferenciaInternacional] = useState(actividad?.transferenciaInternacional || false)
  const [transferenciaPaisDestino, setTransferenciaPaisDestino] = useState(actividad?.transferenciaPaisDestino || '')
  const [transferenciaGarantias, setTransferenciaGarantias] = useState(actividad?.transferenciaGarantias || '')
  const [frecuenciaRevisionMeses, setFrecuenciaRevisionMeses] = useState(String(actividad?.frecuenciaRevisionMeses ?? 12))
  const [responsableRevisionId, setResponsableRevisionId] = useState(actividad?.responsableRevisionId ? String(actividad.responsableRevisionId) : '')
  const [notas, setNotas] = useState(actividad?.notas || '')

  const toggleCategoriaDato = (v: string) => setCategoriasDatos((prev) => (prev.includes(v) ? prev.filter((c) => c !== v) : [...prev, v]))
  const toggleCategoriaInteresado = (v: string) => setCategoriasInteresados((prev) => (prev.includes(v) ? prev.filter((c) => c !== v) : [...prev, v]))

  const payload = {
    nombreActividad, areaDuena: areaDuena || undefined, responsableTratamiento, responsableContacto: responsableContacto || undefined,
    finalidad, baseLegal, baseLegalDetalle: baseLegalDetalle || undefined, categoriasDatos, categoriasDatosSensibles,
    categoriasInteresados, destinatarios: destinatarios || undefined, plazoConservacion,
    medidasSeguridadTecnicas: medidasTecnicas || undefined, medidasSeguridadOrganizativas: medidasOrganizativas || undefined,
    transferenciaInternacional, transferenciaPaisDestino: transferenciaInternacional ? transferenciaPaisDestino : undefined,
    transferenciaGarantias: transferenciaInternacional ? (transferenciaGarantias || undefined) : undefined,
    frecuenciaRevisionMeses: Number(frecuenciaRevisionMeses) || 12,
    responsableRevisionId: responsableRevisionId ? Number(responsableRevisionId) : undefined,
    notas: notas || undefined,
  }

  const mutation = useMutation({
    mutationFn: () => (esEdicion ? proteccionDatosService.actualizarActividad(actividad!.id, payload) : proteccionDatosService.crearActividad(payload)).then(() => undefined),
    onSuccess: () => {
      toast.success(esEdicion ? 'Actividad actualizada' : 'Actividad creada')
      queryClient.invalidateQueries({ queryKey: ['rat-actividades'] })
      queryClient.invalidateQueries({ queryKey: ['rat-resumen'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo guardar la actividad')
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={esEdicion ? 'Editar actividad de tratamiento' : 'Nueva actividad de tratamiento'} variant="corporate" size="xl">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombreActividad.trim() || !responsableTratamiento.trim() || !finalidad.trim() || !plazoConservacion.trim()) return
          if (categoriasDatos.length === 0 || categoriasInteresados.length === 0) {
            toast.error('Selecciona al menos una categoría de datos e interesados')
            return
          }
          if (transferenciaInternacional && !transferenciaPaisDestino.trim()) {
            toast.error('Indica el país destino de la transferencia internacional')
            return
          }
          mutation.mutate()
        }}
      >
        <Seccion titulo="Identificación" defaultOpen>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre de la actividad</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nombreActividad} onChange={(e) => setNombreActividad(e.target.value)} placeholder="Ej. Reclutamiento y selección de personal" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Área dueña del proceso</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={areaDuena} onChange={(e) => setAreaDuena(e.target.value)} placeholder="Ej. Recursos Humanos" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable del tratamiento</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableTratamiento} onChange={(e) => setResponsableTratamiento(e.target.value)} placeholder="Razón social o persona responsable" required />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Contacto del responsable</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableContacto} onChange={(e) => setResponsableContacto(e.target.value)} placeholder="Correo o teléfono (opcional)" />
          </div>
        </Seccion>

        <Seccion titulo="Finalidad y base legal">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Finalidad del tratamiento</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={finalidad} onChange={(e) => setFinalidad(e.target.value)} placeholder="Para qué se usan estos datos" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Base legal</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={baseLegal} onChange={(e) => setBaseLegal(e.target.value as BaseLegalRat)}>
              {(Object.keys(BASE_LEGAL_LABEL) as BaseLegalRat[]).map((b) => <option key={b} value={b}>{BASE_LEGAL_LABEL[b]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Detalle de la base legal (opcional)</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={baseLegalDetalle} onChange={(e) => setBaseLegalDetalle(e.target.value)} placeholder="Justificación adicional" />
          </div>
        </Seccion>

        <Seccion titulo="Datos e interesados">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Categorías de datos tratados</label>
            <CheckboxGrid opciones={CATEGORIAS_DATOS_CATALOGO} seleccionadas={categoriasDatos} onToggle={toggleCategoriaDato} />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={categoriasDatosSensibles} onChange={(e) => setCategoriasDatosSensibles(e.target.checked)} />
            Esta actividad incluye datos personales sensibles
          </label>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Categorías de interesados/titulares</label>
            <CheckboxGrid opciones={CATEGORIAS_INTERESADOS_CATALOGO} seleccionadas={categoriasInteresados} onToggle={toggleCategoriaInteresado} />
          </div>
        </Seccion>

        <Seccion titulo="Destinatarios y conservación">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Destinatarios / terceros</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={destinatarios} onChange={(e) => setDestinatarios(e.target.value)} placeholder="A quién se comunican estos datos (opcional)" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Plazo de conservación</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={plazoConservacion} onChange={(e) => setPlazoConservacion(e.target.value)} placeholder="Ej. 5 años tras terminación de la relación laboral" required />
          </div>
        </Seccion>

        <Seccion titulo="Medidas de seguridad">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Medidas técnicas</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={medidasTecnicas} onChange={(e) => setMedidasTecnicas(e.target.value)} placeholder="Cifrado, control de acceso, respaldos, etc." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Medidas organizativas</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={medidasOrganizativas} onChange={(e) => setMedidasOrganizativas(e.target.value)} placeholder="Políticas internas, capacitación, acuerdos de confidencialidad, etc." />
          </div>
        </Seccion>

        <Seccion titulo="Transferencias internacionales">
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={transferenciaInternacional} onChange={(e) => setTransferenciaInternacional(e.target.checked)} />
            Esta actividad implica transferencia internacional de datos
          </label>
          {transferenciaInternacional && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary">País destino</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={transferenciaPaisDestino} onChange={(e) => setTransferenciaPaisDestino(e.target.value)} required={transferenciaInternacional} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary">Garantías (cláusulas contractuales, adecuación, etc.)</label>
                <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={transferenciaGarantias} onChange={(e) => setTransferenciaGarantias(e.target.value)} />
              </div>
            </>
          )}
        </Seccion>

        <Seccion titulo="Revisión periódica">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Frecuencia de revisión (meses)</label>
              <input type="number" min="1" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={frecuenciaRevisionMeses} onChange={(e) => setFrecuenciaRevisionMeses(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable de revisión</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableRevisionId} onChange={(e) => setResponsableRevisionId(e.target.value)}>
                <option value="">Sin asignar</option>
                {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          </div>
          {esEdicion && actividad?.fechaUltimaRevision && (
            <p className="text-[11px] text-ink-tertiary">Última revisión: {new Date(actividad.fechaUltimaRevision).toLocaleDateString()}</p>
          )}
        </Seccion>

        <Seccion titulo="Notas">
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Seccion>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>{esEdicion ? 'Guardar cambios' : 'Crear actividad'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
function AdjuntosRatSection({ actividadId, puedeGestionar }: { actividadId: number; puedeGestionar: boolean }) {
  const queryClient = useQueryClient()
  const [tipoSubida, setTipoSubida] = useState<TipoAdjuntoRat>('aviso_privacidad')

  const { data, isLoading } = useQuery({ queryKey: ['rat-adjuntos', actividadId], queryFn: () => proteccionDatosService.listAdjuntos(actividadId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rat-adjuntos', actividadId] })

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => proteccionDatosService.subirAdjuntos(actividadId, files, tipoSubida),
    onSuccess: () => { toast.success('Adjunto subido'); invalidate() },
    onError: () => toast.error('No se pudo subir el adjunto'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => proteccionDatosService.eliminarAdjunto(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el adjunto'),
  })

  const pickFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      if (files.length) subirMutation.mutate(files)
    }
    input.click()
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Evidencias y documentos</h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map((ad) => {
              const esImagen = ad.mime?.startsWith('image/')
              const url = proteccionDatosService.getUrlVerAdjunto(ad.id)
              return (
                <div key={ad.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <button onClick={() => window.open(url, '_blank')} className="flex h-full w-full items-center justify-center" title={ad.nombreOriginal}>
                    {esImagen ? (
                      <img src={url} alt={ad.nombreOriginal} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-2 text-center">
                        <FileText className="h-6 w-6 text-gray-400" />
                        <span className="line-clamp-2 text-[10px] text-ink-tertiary">{ad.nombreOriginal}</span>
                      </div>
                    )}
                  </button>
                  <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-ink-secondary">{ADJUNTO_LABEL[ad.tipo]}</span>
                  {puedeGestionar && (
                    <button onClick={() => eliminarMutation.mutate(ad.id)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100" title="Eliminar">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">{formatBytes(ad.tamanio)}</span>
                </div>
              )
            })}
            {(!data || data.length === 0) && <p className="col-span-full text-xs text-ink-tertiary">Sin documentos aún.</p>}
          </div>
          {puedeGestionar && (
            <div className="flex items-center gap-2">
              <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={tipoSubida} onChange={(e) => setTipoSubida(e.target.value as TipoAdjuntoRat)}>
                {(Object.keys(ADJUNTO_LABEL) as TipoAdjuntoRat[]).map((t) => <option key={t} value={t}>{ADJUNTO_LABEL[t]}</option>)}
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={pickFiles} isLoading={subirMutation.isPending}>
                <Upload className="h-3.5 w-3.5" /> Subir documento
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal de detalle ─────────────────────────────────────────────────────
function ActividadRatDetalleModal({ actividad, onClose, onEditar, puedeEditar }: {
  actividad: ActividadRat | null
  onClose: () => void
  onEditar: () => void
  puedeEditar: boolean
}) {
  const queryClient = useQueryClient()

  const marcarRevisadaMutation = useMutation({
    mutationFn: () => proteccionDatosService.marcarRevisada(actividad!.id),
    onSuccess: () => {
      toast.success('Actividad marcada como revisada')
      queryClient.invalidateQueries({ queryKey: ['rat-actividades'] })
      queryClient.invalidateQueries({ queryKey: ['rat-resumen'] })
    },
    onError: () => toast.error('No se pudo marcar como revisada'),
  })

  if (!actividad) return null
  const cfgRevision = ESTATUS_REVISION_CONFIG[actividad.estatusRevision]

  return (
    <Modal isOpen={!!actividad} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="chip bg-blue-50 text-blue-700">{BASE_LEGAL_LABEL[actividad.baseLegal]}</span>
            <h2 className="mt-1 text-base font-bold text-ink">{actividad.nombreActividad}</h2>
            {actividad.areaDuena && <p className="mt-0.5 text-xs text-ink-tertiary">{actividad.areaDuena}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfgRevision.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', cfgRevision.dot)} /> {cfgRevision.label}
          </span>
          {actividad.transferenciaInternacional && (
            <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              <Globe2 className="h-3 w-3" /> Transferencia internacional
            </span>
          )}
          {actividad.categoriasDatosSensibles && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Datos sensibles</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable del tratamiento</p>
            <p className="mt-0.5 text-ink">{actividad.responsableTratamiento}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable de revisión</p>
            <p className="mt-0.5 text-ink">{actividad.responsableRevisionNombre || '—'}</p>
          </div>
          <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Finalidad</p>
            <p className="mt-0.5 text-ink">{actividad.finalidad}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Categorías de datos</p>
            <p className="mt-0.5 text-ink">{actividad.categoriasDatos}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Categorías de interesados</p>
            <p className="mt-0.5 text-ink">{actividad.categoriasInteresados}</p>
          </div>
          <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Plazo de conservación</p>
            <p className="mt-0.5 text-ink">{actividad.plazoConservacion}</p>
          </div>
          {actividad.transferenciaInternacional && (
            <div className="col-span-2 rounded-lg bg-blue-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Transferencia internacional</p>
              <p className="mt-0.5 text-ink">{actividad.transferenciaPaisDestino}</p>
              {actividad.transferenciaGarantias && <p className="mt-1 text-[11px] text-ink-secondary">{actividad.transferenciaGarantias}</p>}
            </div>
          )}
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
            <Button size="sm" onClick={onEditar}>Editar actividad</Button>
            <Button size="sm" variant="secondary" onClick={() => marcarRevisadaMutation.mutate()} isLoading={marcarRevisadaMutation.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como revisada hoy
            </Button>
          </div>
        )}

        <AdjuntosRatSection actividadId={actividad.id} puedeGestionar={puedeEditar} />
      </div>
    </Modal>
  )
}

// ── Tabla ─────────────────────────────────────────────────────────────────
function TablaActividades({ actividades, onSelect, onEliminar, puedeEliminar }: {
  actividades: ActividadRat[]
  onSelect: (a: ActividadRat) => void
  onEliminar: (id: number) => void
  puedeEliminar: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-ink-tertiary">
          <tr>
            <th className="px-4 py-2 font-semibold">Actividad</th>
            <th className="px-4 py-2 font-semibold">Área</th>
            <th className="px-4 py-2 font-semibold">Responsable</th>
            <th className="px-4 py-2 font-semibold">Base legal</th>
            <th className="px-4 py-2 font-semibold">Revisión</th>
            <th className="px-4 py-2 font-semibold" />
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {actividades.map((a) => {
            const cfg = ESTATUS_REVISION_CONFIG[a.estatusRevision]
            return (
              <tr key={a.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onSelect(a)}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{a.nombreActividad}</p>
                  {a.categoriasDatosSensibles && <span className="text-[10px] font-semibold text-red-600">Datos sensibles</span>}
                </td>
                <td className="px-4 py-2.5 text-ink-tertiary">{a.areaDuena || '—'}</td>
                <td className="px-4 py-2.5 text-ink-tertiary">{a.responsableTratamiento}</td>
                <td className="px-4 py-2.5"><span className="chip bg-blue-50 text-blue-700">{BASE_LEGAL_LABEL[a.baseLegal]}</span></td>
                <td className="px-4 py-2.5">
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                  </span>
                </td>
                <td className="px-4 py-2.5">{a.transferenciaInternacional && <span title="Transferencia internacional"><Globe2 className="h-3.5 w-3.5 text-blue-600" /></span>}</td>
                <td className="px-4 py-2.5">
                  {puedeEliminar && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEliminar(a.id) }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {actividades.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">No hay actividades registradas.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
export function ProteccionDatosPage() {
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [actividadActivaId, setActividadActivaId] = useState<number | null>(null)
  const [actividadEditandoId, setActividadEditandoId] = useState<number | null>(null)
  const [filtroBaseLegal, setFiltroBaseLegal] = useState<BaseLegalRat | ''>('')
  const [filtroEstatusRevision, setFiltroEstatusRevision] = useState<EstatusRevisionRat | ''>('')
  const [busqueda, setBusqueda] = useState('')
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const queryClient = useQueryClient()
  const { can } = useActionAccess()

  const puedeCrear = can('legal', 'rat-crear')
  const puedeEditar = can('legal', 'rat-editar')
  const puedeEliminar = can('legal', 'rat-eliminar')
  const puedeExportar = can('legal', 'rat-exportar')

  const { data: resumen } = useQuery({ queryKey: ['rat-resumen'], queryFn: () => proteccionDatosService.getResumen(), staleTime: 30_000 })
  const { data, isLoading } = useQuery({ queryKey: ['rat-actividades'], queryFn: () => proteccionDatosService.listActividades(), staleTime: 30_000 })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => proteccionDatosService.eliminarActividad(id),
    onSuccess: () => {
      toast.success('Actividad eliminada')
      queryClient.invalidateQueries({ queryKey: ['rat-actividades'] })
      queryClient.invalidateQueries({ queryKey: ['rat-resumen'] })
    },
    onError: () => toast.error('No se pudo eliminar la actividad'),
  })

  const actividadesFiltradas = useMemo(() => {
    return (data || []).filter((a) => {
      if (filtroBaseLegal && a.baseLegal !== filtroBaseLegal) return false
      if (filtroEstatusRevision && a.estatusRevision !== filtroEstatusRevision) return false
      if (busqueda && !a.nombreActividad.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
  }, [data, filtroBaseLegal, filtroEstatusRevision, busqueda])

  const actividadActiva = (data || []).find((a) => a.id === actividadActivaId) || null
  const actividadEditando = (data || []).find((a) => a.id === actividadEditandoId) || null

  const stats: DashboardStat[] = resumen ? [
    { key: 'activas', icon: ShieldCheck, label: 'Actividades activas', value: resumen.activas, tone: 'brand' },
    { key: 'vencida', icon: Clock, label: 'Revisión vencida', value: resumen.revisionVencida, tone: 'critical' },
    { key: 'proxima', icon: Clock, label: 'Revisión próxima', value: resumen.revisionProxima, tone: 'warn' },
    { key: 'transferencia', icon: Globe2, label: 'Con transferencia internacional', value: resumen.conTransferenciaInternacional, tone: 'brand' },
  ] : []

  const hayFiltrosActivos = !!filtroBaseLegal || !!filtroEstatusRevision || !!busqueda

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await proteccionDatosService.exportarPdf()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'rat_proteccion_datos.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar el PDF')
    } finally {
      setExportandoPdf(false)
    }
  }

  const handleExportarExcel = () => {
    if (actividadesFiltradas.length === 0) {
      toast.error('No hay actividades para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Actividad', 'Área', 'Responsable', 'Finalidad', 'Base legal', 'Categorías de datos', 'Datos sensibles', 'Categorías de interesados', 'Destinatarios', 'Plazo de conservación', 'Transferencia internacional', 'País destino', 'Estatus revisión'],
      ...actividadesFiltradas.map((a) => [
        a.nombreActividad, a.areaDuena || '', a.responsableTratamiento, a.finalidad, BASE_LEGAL_LABEL[a.baseLegal],
        a.categoriasDatos, a.categoriasDatosSensibles ? 'Sí' : 'No', a.categoriasInteresados, a.destinatarios || '',
        a.plazoConservacion, a.transferenciaInternacional ? 'Sí' : 'No', a.transferenciaPaisDestino || '',
        ESTATUS_REVISION_CONFIG[a.estatusRevision].label,
      ]),
    ])
    sheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 35 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'RAT')
    XLSX.writeFile(wb, 'rat_proteccion_datos.xlsx')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Protección de datos</h1>
            <p className="text-xs text-blue-200/70">Registro de Actividades de Tratamiento (RAT)</p>
          </div>
        </div>
      </div>

      {resumen && <DashboardStatRow stats={stats} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Actividades de tratamiento</h2>
        <div className="flex items-center gap-2">
          {puedeExportar && (
            <>
              <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
                <FileDown className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>
            </>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={() => setNuevoOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva actividad
            </Button>
          )}
        </div>
      </div>

      {data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3">
          <input
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroBaseLegal} onChange={(e) => setFiltroBaseLegal(e.target.value as BaseLegalRat | '')}>
            <option value="">Todas las bases legales</option>
            {(Object.keys(BASE_LEGAL_LABEL) as BaseLegalRat[]).map((b) => <option key={b} value={b}>{BASE_LEGAL_LABEL[b]}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroEstatusRevision} onChange={(e) => setFiltroEstatusRevision(e.target.value as EstatusRevisionRat | '')}>
            <option value="">Todos los estatus de revisión</option>
            {(Object.keys(ESTATUS_REVISION_CONFIG) as EstatusRevisionRat[]).map((s) => <option key={s} value={s}>{ESTATUS_REVISION_CONFIG[s].label}</option>)}
          </select>
          {hayFiltrosActivos && (
            <button onClick={() => { setFiltroBaseLegal(''); setFiltroEstatusRevision(''); setBusqueda('') }} className="ml-auto text-[11px] font-semibold text-brand hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay actividades de tratamiento registradas.</p>
        </div>
      ) : (
        <TablaActividades
          actividades={actividadesFiltradas}
          onSelect={(a) => setActividadActivaId(a.id)}
          onEliminar={(id) => eliminarMutation.mutate(id)}
          puedeEliminar={puedeEliminar}
        />
      )}

      {puedeCrear && <ActividadRatFormModal isOpen={nuevoOpen} onClose={() => setNuevoOpen(false)} actividad={null} />}
      {puedeEditar && <ActividadRatFormModal isOpen={!!actividadEditando} onClose={() => setActividadEditandoId(null)} actividad={actividadEditando} />}
      <ActividadRatDetalleModal
        actividad={actividadActiva}
        onClose={() => setActividadActivaId(null)}
        onEditar={() => { setActividadEditandoId(actividadActiva!.id); setActividadActivaId(null) }}
        puedeEditar={puedeEditar}
      />
    </div>
  )
}
