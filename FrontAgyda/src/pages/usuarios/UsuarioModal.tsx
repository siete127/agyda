import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, UserCog, User, AtSign, Lock, Eye, EyeOff, Briefcase, Users2, Mail, Building2, Info, ShieldCheck, IdCard, Clock } from 'lucide-react'
import { api } from '@/lib/axios'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'
import type { Usuario } from './usuario.model'
import { roleService } from '@/services/role.service'
import { perfilConfigService } from '@/services/perfilConfig.service'

/* ── Campo con ícono ── */
function Field({
  label, icon, children, className,
}: { label: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[0.8rem] font-semibold text-gray-500">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-12 pr-3 text-sm text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'
const selectCls = inputCls + ' appearance-none cursor-pointer pr-9'

export function UsuarioModal({ usuario, onClose }: { usuario: Usuario | null; onClose: () => void }) {
  const qc = useQueryClient()
  const esEdicion = !!usuario
  const [showPass, setShowPass] = useState(false)
  // El sistema guarda el nombre en un solo campo (NEUS_NOMBRES); no hay
  // columna de apellidos. Si el usuario ya tenía apellidos parseados aparte,
  // los reunimos aquí para no perderlos.
  const nombreInicial = [usuario?.nombres, usuario?.apellidos].filter(Boolean).join(' ').trim()
  const [form, setForm] = useState({
    nombreCompleto: nombreInicial,
    usuario:      usuario?.login ?? '',
    correo:       usuario?.correo ?? '',
    tipoUsuario:  usuario?.tipoUsuario ?? 'CC',
    genero:       usuario?.genero ?? '',
    puesto:       usuario?.puesto ?? '',
    departamento: usuario?.departamento ?? '',
    contra:       '',
    idHorario:    '' as string,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Rol elegido. Al crear: obligatorio, define permisos iniciales.
  // Al editar: opcional, cambiar-lo actualiza el rol del usuario.
  const [rolId, setRolId] = useState<number | ''>('')
  const [reaplicar, setReaplicar] = useState(false)
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => roleService.list(),
    staleTime: 60_000,
  })
  const rolCambio = esEdicion && !!rolId

  // Perfil (plantilla de datos) — solo al crear. Al elegirlo precarga los campos.
  const [perfilId, setPerfilId] = useState<number | ''>('')
  const { data: perfiles = [] } = useQuery({
    queryKey: ['perfiles'],
    queryFn: () => perfilConfigService.list(),
    enabled: !esEdicion,
    staleTime: 60_000,
  })
  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios'],
    queryFn: () => perfilConfigService.horarios(),
    enabled: !esEdicion,
    staleTime: 60_000,
  })

  const aplicarPerfil = (pid: number | '') => {
    setPerfilId(pid)
    if (!pid) return
    const p = perfiles.find((x) => x.PERFIL_ID === pid)
    if (!p) return
    setForm((f) => ({
      ...f,
      puesto:       p.PUESTO ?? f.puesto,
      departamento: p.DEPARTAMENTO ?? f.departamento,
      idHorario:    p.ID_HORARIO != null ? String(p.ID_HORARIO) : f.idHorario,
    }))
    if (p.ROL_ID != null) setRolId(p.ROL_ID)
  }

  // Validación mínima antes de enviar (el backend igual valida y responde 400).
  const errores: string[] = []
  if (!form.nombreCompleto.trim()) errores.push('El nombre es obligatorio')
  if (!form.usuario.trim()) errores.push('El usuario (login) es obligatorio')
  if (!esEdicion && form.contra.trim().length < 4) errores.push('La contraseña debe tener al menos 4 caracteres')
  if (!esEdicion && !rolId) errores.push('Elige un rol para el usuario')

  const guardar = useMutation({
    mutationFn: async () => {
      const nombre = form.nombreCompleto.trim().replace(/\s+/g, ' ')
      if (esEdicion) {
        const payload = {
          nombres:      nombre,
          usuario:      form.usuario.trim() || usuario!.login,
          correo:       form.correo.trim(),
          tipoUsuario:  form.tipoUsuario,
          genero:       form.genero || null,
          puesto:       form.puesto.trim(),
          departamento: form.departamento.trim(),
          activo:       usuario!.activo,
          status:       usuario!.status,
          ...(form.contra.trim() ? { contra: form.contra.trim() } : {}),
        }
        await api.put(`/usuarios/${usuario!.id}`, payload)
        // Si se eligió un rol distinto, aplicarlo aparte.
        if (rolCambio) {
          await roleService.cambiarRolUsuario(usuario!.id, Number(rolId), reaplicar)
        }
        return
      }
      const rol = roles.find((r) => r.ROL_ID === rolId)
      const payload = {
        nombres:      nombre,
        usuario:      form.usuario.trim(),
        contra:       form.contra,
        // El backend usa ROL_BASE del rol; mandamos tipoUsuario como fallback.
        tipoUsuario:  rol?.ROL_BASE ?? form.tipoUsuario,
        rolId:        rolId || undefined,
        genero:       form.genero || null,
        correo:       form.correo.trim(),
        puesto:       form.puesto.trim(),
        departamento: form.departamento.trim(),
        idHorario:    form.idHorario || null,
        activo:       true,
        status:       false,
      }
      await api.post('/usuarios', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['usuarios-desactivados'] })
      toast.success(esEdicion ? 'Usuario actualizado' : 'Usuario creado')
      onClose()
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const submit = () => {
    if (errores.length) { toast.error(errores[0]); return }
    guardar.mutate()
  }

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="space-y-6">
        {/* ── Encabezado ── */}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/[0.08] text-brand">
            {esEdicion ? <UserCog className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
          </div>
          <div>
            <h2 className="text-[1.05rem] font-bold text-gray-900">{esEdicion ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <p className="mt-0.5 text-[0.82rem] text-gray-400">
              {esEdicion
                ? `Actualiza la información de ${usuario!.nombres || 'este usuario'}`
                : 'Completa la información para crear un nuevo usuario'}
            </p>
          </div>
        </div>

        {/* Selector de perfil — solo al crear, precarga los campos */}
        {!esEdicion && perfiles.length > 0 && (
          <Field label="Aplicar perfil (opcional)" icon={<IdCard className="h-4 w-4" />} className="!mb-0">
            <select
              className={selectCls}
              value={perfilId}
              onChange={(e) => aplicarPerfil(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Sin perfil — llenar campos a mano</option>
              {perfiles.map((p) => (
                <option key={p.PERFIL_ID} value={p.PERFIL_ID}>
                  {p.NOMBRE}{p.ROL_NOMBRE ? ` · ${p.ROL_NOMBRE}` : ''}
                </option>
              ))}
            </select>
            <Chevron />
          </Field>
        )}

        {/* ── Formulario ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" icon={<User className="h-4 w-4" />} className="sm:col-span-2">
            <input
              className={inputCls}
              value={form.nombreCompleto}
              onChange={(e) => set('nombreCompleto', e.target.value)}
              placeholder="Nombre y apellidos"
            />
          </Field>

          <Field label="Usuario (login)" icon={<AtSign className="h-4 w-4" />} className="sm:col-span-2">
            <input className={inputCls} value={form.usuario} onChange={(e) => set('usuario', e.target.value)} placeholder="Ej: CC_0299" />
          </Field>

          <Field label="Correo" icon={<Mail className="h-4 w-4" />} className="sm:col-span-2">
            <input className={inputCls} type="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} placeholder="correo@empresa.com" />
          </Field>

          <Field
            label={esEdicion ? `Rol (actual: ${form.tipoUsuario})` : 'Rol'}
            icon={<ShieldCheck className="h-4 w-4" />}
            className="sm:col-span-2"
          >
            <select
              className={selectCls}
              value={rolId}
              onChange={(e) => setRolId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">{esEdicion ? 'Sin cambios' : 'Selecciona un rol…'}</option>
              {roles.map((r) => (
                <option key={r.ROL_ID} value={r.ROL_ID}>
                  {r.NOMBRE}{r.ES_SISTEMA ? '' : ' (personalizado)'} — {r.MODULOS_COUNT ?? 0} módulos
                </option>
              ))}
            </select>
            <Chevron />
          </Field>

          {rolCambio && (
            <label className="sm:col-span-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <input
                type="checkbox"
                checked={reaplicar}
                onChange={(e) => setReaplicar(e.target.checked)}
                className="mt-0.5 rounded accent-brand"
              />
              <span className="text-[0.8rem] text-amber-800">
                <b>Reemplazar permisos por los del rol nuevo.</b> Si lo dejas sin marcar, solo cambia el
                tipo de acceso a rutas y los módulos/funciones del usuario quedan como están.
              </span>
            </label>
          )}

          <Field label="Género" icon={<Users2 className="h-4 w-4" />}>
            <select className={selectCls} value={form.genero} onChange={(e) => set('genero', e.target.value as 'M' | 'F' | '')}>
              <option value="">Sin especificar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
            <Chevron />
          </Field>

          <Field label="Puesto" icon={<Briefcase className="h-4 w-4" />}>
            <input className={inputCls} value={form.puesto} onChange={(e) => set('puesto', e.target.value)} placeholder="Puesto" />
          </Field>
          <Field label="Departamento" icon={<Building2 className="h-4 w-4" />}>
            <input className={inputCls} value={form.departamento} onChange={(e) => set('departamento', e.target.value)} placeholder="Departamento" />
          </Field>

          {!esEdicion && (
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
          )}

          <Field
            label={esEdicion ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
            icon={<Lock className="h-4 w-4" />}
            className="sm:col-span-2"
          >
            <input
              className={inputCls + ' pr-11'}
              type={showPass ? 'text' : 'password'}
              value={form.contra}
              onChange={(e) => set('contra', e.target.value)}
              placeholder={esEdicion ? 'Dejar en blanco para no cambiarla' : '••••••••'}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </Field>
        </div>

        {/* ── Nota informativa ── */}
        <div className="flex items-start gap-2.5 rounded-xl bg-brand/[0.05] px-3.5 py-3 text-[0.8rem] text-brand">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            {esEdicion
              ? 'Los cambios se aplican de inmediato. La contraseña solo se modifica si escribes una nueva.'
              : 'El usuario hereda los permisos del rol elegido (se copian a su cuenta). Después puedes ajustarlos individualmente desde Permisos.'}
          </p>
        </div>

        {/* ── Acciones ── */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-card px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={guardar.isPending || errores.length > 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardar.isPending
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : esEdicion ? <UserCog className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {esEdicion ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Chevron() {
  return (
    <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  )
}
