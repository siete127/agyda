import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { KeyRound, UserPlus, FolderOpen, Search, Upload, Loader2, Info, FileText, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api, getApiError } from '@/lib/axios'
import { vacantesService } from '@/services/vacantes.service'
import { ExpedienteUsuarioModal, type UsuarioSimple } from '@/pages/expediente/ExpedientePage'
import { POSTULANTE_ETAPAS, type Postulante, type PostulanteEtapa, type Vacante } from '@/types/vacante.types'

const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600'

/* ── Nuevo prospecto (capturado por RH) ── */
export function NuevoProspectoModal({ vacantes, vacanteInicial, onClose }: {
  vacantes: Vacante[]
  vacanteInicial: number | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [vacanteId, setVacanteId] = useState<number | ''>(vacanteInicial ?? (vacantes.find((v) => v.activo)?.id ?? ''))
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', mensaje: '', etapa: 'nuevo' as PostulanteEtapa })
  const [cv, setCv] = useState<File | null>(null)

  const crear = useMutation({
    mutationFn: async () => {
      const cvUrl = cv ? await vacantesService.subirCv(cv) : undefined
      return vacantesService.crearProspecto(Number(vacanteId), { ...form, cvUrl })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacantes', 'postulantes-todas'] })
      toast.success('Prospecto registrado')
      onClose()
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const listo = !!vacanteId && form.nombre.trim() && (form.email.trim() || form.telefono.trim())

  return (
    <Modal isOpen onClose={onClose} title="Nuevo prospecto" size="md">
      <div className="space-y-4">
        <div>
          <label className={label}>Vacante</label>
          <select className="field" value={vacanteId} onChange={(e) => setVacanteId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Elige la vacante…</option>
            {vacantes.map((v) => <option key={v.id} value={v.id}>{v.titulo}{v.activo ? '' : ' (cerrada)'}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Nombre completo</label>
          <input className="field" value={form.nombre} autoFocus onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Correo</label>
            <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className={label}>Teléfono</label>
            <input className="field" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Etapa</label>
            <select className="field" value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value as PostulanteEtapa })}>
              {POSTULANTE_ETAPAS.filter((e) => e.key !== 'descartado').map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>CV (PDF, opcional)</label>
            {cv ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-2.5 py-2 text-[0.75rem] text-gray-700">
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{cv.name}</span>
                <button type="button" onClick={() => setCv(null)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-2.5 py-2 text-[0.75rem] text-gray-500 hover:border-brand hover:text-brand">
                <Upload className="h-3.5 w-3.5" /> Adjuntar CV
                <input type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size > 5 * 1024 * 1024) toast.error('El CV no debe pasar de 5 MB'); else setCv(f ?? null) }} />
              </label>
            )}
          </div>
        </div>
        <div>
          <label className={label}>Notas (opcional)</label>
          <textarea className="field resize-none" rows={2} placeholder="¿De dónde viene? Referido, llamada, feria de empleo…"
            value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
        </div>
        <p className="text-[0.7rem] text-gray-400">Captura al menos un correo o un teléfono. No se le envía ningún aviso al prospecto.</p>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!listo} onClick={() => crear.mutate()}>
            <UserPlus className="h-4 w-4" /> Registrar prospecto
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Solicitar credenciales: ticket a TI con los datos del contratado ── */
export function SolicitarCredencialesModal({ postulante: p, onClose }: { postulante: Postulante; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ puesto: p.vacanteTitulo ?? '', area: '', fechaIngreso: '', accesos: '', notas: '' })
  const enviar = useMutation({
    mutationFn: () => vacantesService.solicitarCredenciales(p.vacanteId, p.id, form),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['vacantes', 'postulantes-todas'] })
      toast.success(`Ticket #${r.ticketId} enviado a TI para sus credenciales`)
      onClose()
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <Modal isOpen onClose={onClose} title="Solicitar credenciales" size="md">
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-[0.78rem] text-gray-700">
          <p className="font-bold text-gray-900">{p.nombre}</p>
          <p>{p.email || 'Sin correo'} · {p.telefono || 'Sin teléfono'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Puesto</label>
            <input className="field" value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} />
          </div>
          <div>
            <label className={label}>Fecha de ingreso</label>
            <input className="field" type="date" value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label}>Área</label>
          <input className="field" placeholder="Ej. Call Center, Administración…" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
        </div>
        <div>
          <label className={label}>Accesos que necesita (opcional)</label>
          <input className="field" placeholder="Ej. intranet, correo, marcador, CRM…" value={form.accesos} onChange={(e) => setForm({ ...form, accesos: e.target.value })} />
        </div>
        <div>
          <label className={label}>Notas (opcional)</label>
          <textarea className="field resize-none" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
        <p className="flex items-start gap-1.5 text-[0.7rem] text-gray-500">
          <Info className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          Se abre un ticket en Tickets (TI · Usuarios y Accesos) con estos datos para que creen su usuario y le entreguen sus credenciales.
        </p>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={enviar.isPending} onClick={() => enviar.mutate()}>
            <KeyRound className="h-4 w-4" /> Enviar ticket
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Registrar expediente: abre el expediente digital de su usuario ── */
export function ExpedienteContratadoModal({ postulante: p, onClose }: { postulante: Postulante; onClose: () => void }) {
  const [elegido, setElegido] = useState<UsuarioSimple | null>(null)
  const [busca, setBusca] = useState('')

  const { data: encontrado, isLoading } = useQuery({
    queryKey: ['postulante-usuario', p.id],
    queryFn: () => vacantesService.usuarioDePostulante(p.vacanteId, p.id),
    gcTime: 0,
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-expediente'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['id'] ?? r['ID'] ?? 0),
        nombres: String(r['nombres'] ?? r['nombre'] ?? ''),
        apellidos: String(r['apellidos'] ?? ''),
        puesto: String(r['puesto'] ?? r['PUESTO'] ?? r['cargo'] ?? ''),
        tipoUsuario: String(r['tipoUsuario'] ?? r['tipo_usuario'] ?? r['TIPO_USUARIO'] ?? '').toUpperCase(),
      })) as UsuarioSimple[]
    },
    enabled: !isLoading && !encontrado,
  })

  // Usuario encontrado (por correo o nombre) o elegido a mano → su expediente.
  const usuario: UsuarioSimple | null = elegido ?? (encontrado
    ? { id: encontrado.id, nombres: encontrado.nombres, apellidos: '', puesto: encontrado.puesto ?? '', tipoUsuario: encontrado.tipoUsuario ?? '' }
    : null)
  if (usuario) return <ExpedienteUsuarioModal usuario={usuario} onClose={onClose} />

  const t = busca.trim().toLowerCase()
  const candidatos = usuarios.filter((u) => !t || `${u.nombres} ${u.apellidos}`.toLowerCase().includes(t)).slice(0, 8)

  return (
    <Modal isOpen onClose={onClose} title="Registrar expediente" size="md">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.78rem] text-amber-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              <b>{p.nombre}</b> todavía no tiene usuario en el sistema (se buscó por su correo y su nombre). El expediente se guarda en su usuario:
              {p.ticketCredencialesId ? ` TI lo crea al atender el ticket #${p.ticketCredencialesId}.` : ' primero solicita sus credenciales.'} Si ya existe con otro nombre o correo, elígelo aquí:
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input className="field pl-9 text-sm" placeholder="Buscar usuario…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {candidatos.map((u) => (
              <button key={u.id} type="button" onClick={() => setElegido(u)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8rem] text-gray-700 hover:bg-gray-50">
                <FolderOpen className="h-4 w-4 flex-shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{`${u.nombres} ${u.apellidos}`.trim()}</span>
                <span className="text-[0.65rem] text-gray-400">{u.puesto || u.tipoUsuario}</span>
              </button>
            ))}
            {candidatos.length === 0 && <p className="py-4 text-center text-xs text-gray-400">Sin resultados</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
