import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IdCard, User, FileText, Briefcase, Building2, Clock, ShieldCheck, X, Info } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { perfilConfigService, type Perfil } from '@/services/perfilConfig.service'
import { roleService } from '@/services/role.service'

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-3.5 text-[0.9rem] text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'
const selectCls = inputCls + ' appearance-none cursor-pointer pr-10'

function Chevron() {
  return (
    <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.85rem] font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

export function PerfilModal({ perfil, onClose }: { perfil: Perfil | null; onClose: () => void }) {
  const qc = useQueryClient()
  const esEdicion = !!perfil

  const [form, setForm] = useState({
    nombre: perfil?.NOMBRE ?? '',
    descripcion: perfil?.DESCRIPCION ?? '',
    rolId: perfil?.ROL_ID != null ? String(perfil.ROL_ID) : '',
    puesto: perfil?.PUESTO ?? '',
    departamento: perfil?.DEPARTAMENTO ?? '',
    idHorario: perfil?.ID_HORARIO != null ? String(perfil.ID_HORARIO) : '',
  })
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => roleService.list(), staleTime: 60_000 })
  const { data: horarios = [] } = useQuery({ queryKey: ['horarios'], queryFn: () => perfilConfigService.horarios(), staleTime: 60_000 })

  const guardar = useMutation({
    mutationFn: async () => {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        rolId: form.rolId ? Number(form.rolId) : null,
        puesto: form.puesto.trim(),
        departamento: form.departamento.trim(),
        idHorario: form.idHorario ? Number(form.idHorario) : null,
      }
      if (esEdicion) await perfilConfigService.update(perfil!.PERFIL_ID, payload)
      else await perfilConfigService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfiles'] })
      toast.success(esEdicion ? 'Perfil actualizado' : 'Perfil creado')
      onClose()
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const errores: string[] = []
  if (!form.nombre.trim()) errores.push('El nombre es obligatorio')

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
            <IdCard className="h-6 w-6" />
          </div>
          <div className="flex-1 pt-0.5">
            <h2 className="text-[1.2rem] font-bold text-gray-900">{esEdicion ? 'Editar perfil' : 'Nuevo perfil'}</h2>
            <p className="mt-1 text-[0.85rem] leading-snug text-gray-400">
              Un perfil predefine los datos de un puesto. Al crear un usuario eliges un perfil y estos
              campos se autocompletan.
            </p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Nombre del perfil" icon={<User className="h-4 w-4" />}>
            <input className={inputCls} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Asesor CC turno matutino" />
          </Field>
          <Field label="Descripción" icon={<FileText className="h-4 w-4" />}>
            <input className={inputCls} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Opcional" />
          </Field>

          <Field label="Rol (permisos)" icon={<ShieldCheck className="h-4 w-4" />}>
            <select className={selectCls} value={form.rolId} onChange={(e) => set('rolId', e.target.value)}>
              <option value="">Sin rol asignado</option>
              {roles.map((r) => (
                <option key={r.ROL_ID} value={r.ROL_ID}>{r.NOMBRE} ({r.ROL_BASE})</option>
              ))}
            </select>
            <Chevron />
          </Field>
          <Field label="Horario laboral" icon={<Clock className="h-4 w-4" />}>
            <select className={selectCls} value={form.idHorario} onChange={(e) => set('idHorario', e.target.value)}>
              <option value="">Sin horario</option>
              {horarios.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombreArea} · {h.horaEntrada?.slice(0, 5)}–{h.horaSalida?.slice(0, 5)}
                </option>
              ))}
            </select>
            <Chevron />
          </Field>

          <Field label="Puesto" icon={<Briefcase className="h-4 w-4" />}>
            <input className={inputCls} value={form.puesto} onChange={(e) => set('puesto', e.target.value)} placeholder="Ej: Asesor" />
          </Field>
          <Field label="Departamento" icon={<Building2 className="h-4 w-4" />}>
            <input className={inputCls} value={form.departamento} onChange={(e) => set('departamento', e.target.value)} placeholder="Ej: Ventas" />
          </Field>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl bg-brand/[0.05] px-4 py-3.5 text-[0.82rem] leading-snug text-brand">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p><b>Solo el nombre es obligatorio.</b> Al aplicar el perfil a un usuario, cada campo se
            autocompleta pero queda editable. Los días de vacaciones los calcula el sistema por antigüedad.</p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 pt-5">
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => { if (errores.length) { toast.error(errores[0]); return } guardar.mutate() }}
            disabled={guardar.isPending}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark active:scale-[0.98]',
              guardar.isPending && 'cursor-not-allowed opacity-60',
            )}
          >
            {guardar.isPending
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <IdCard className="h-4 w-4" />}
            {esEdicion ? 'Guardar cambios' : 'Crear perfil'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
