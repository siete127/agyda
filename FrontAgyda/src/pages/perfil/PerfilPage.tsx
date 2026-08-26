import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, Eye, EyeOff, Mail, Phone, User, Briefcase, Building2, Calendar, Shield, KeyRound, Camera,
  MapPin, Globe2, Hash, IdCard, FolderOpen, Wallet, GraduationCap, Users, ClipboardList,
  Umbrella, Activity, LogIn, PenSquare, Download, UserCircle2, Shirt, Wrench,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatWidget } from '@/components/ui/StatWidget'
import { PersonaTab } from '@/pages/expediente/PersonaTab'
import { ContactoTab } from '@/pages/expediente/ContactoTab'
import { AdicionalesTab } from '@/pages/expediente/AdicionalesTab'
import { FamiliaresTab } from '@/pages/expediente/FamiliaresTab'
import { FormacionTab } from '@/pages/expediente/FormacionTab'
import { TalentoTab } from '@/pages/expediente/TalentoTab'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface PerfilDetalle {
  id: number
  nombres: string
  apellidos: string
  correo: string
  telefono: string
  puesto: string
  departamento: string
  alias: string
  fotoPerfil: string | null
  portada: string | null
  fechaCumpleanos: string | null
  tipoUsuario: string
  fechaIngreso: string | null
}

interface SaldoVacaciones {
  diasDisponibles: number
  poolTotal: number
  sinPool: boolean
}

const TIPO_USUARIO_LABEL: Record<string, string> = {
  AD: 'Administrador', TI: 'Tecnología', CC: 'Call Center', ST: 'Staff', VE: 'Ventas', CL: 'Cliente',
}

function str(v: unknown) { return String(v ?? '') }

/** Parsea una fecha ISO sin desfase de zona horaria */
function toDateParts(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return { y, m, d }
}

function formatFechaSolo(iso: string, opts?: Intl.DateTimeFormatOptions) {
  const { y, m, d } = toDateParts(iso)
  // Usar mediodía UTC para que en cualquier zona horaria quede en el día correcto
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', opts ?? { day: 'numeric', month: 'short', year: 'numeric' })
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.split('T')[0]
}

/** Antigüedad legible ("2 años, 4 meses") a partir de una fecha de ingreso ISO */
function formatAntiguedad(iso: string | null): string {
  if (!iso) return 'No disponible'
  const { y, m, d } = toDateParts(iso)
  const ingreso = new Date(Date.UTC(y, m - 1, d))
  const hoy = new Date()
  let anios = hoy.getUTCFullYear() - ingreso.getUTCFullYear()
  let meses = hoy.getUTCMonth() - ingreso.getUTCMonth()
  if (hoy.getUTCDate() < ingreso.getUTCDate()) meses -= 1
  if (meses < 0) { anios -= 1; meses += 12 }
  if (anios < 0) return 'No disponible'
  const partes: string[] = []
  if (anios > 0) partes.push(`${anios} año${anios !== 1 ? 's' : ''}`)
  partes.push(`${meses} mes${meses !== 1 ? 'es' : ''}`)
  return partes.join(', ')
}

function parsePerfil(r: Record<string, unknown>): PerfilDetalle {
  const nombreCompleto = str(r['nombres'] ?? r['NOMBRES'] ?? r['nombre'])
  const partes = nombreCompleto.trim().split(/\s+/)
  // Si viene apellidos separado úsalo, si no parte el nombre completo
  const apellidosRaw = str(r['apellidos'] ?? r['APELLIDOS'])
  return {
    id: Number(r['id'] ?? r['ID'] ?? r['usuarioId'] ?? 0),
    nombres: apellidosRaw ? partes.slice(0, 2).join(' ') : nombreCompleto,
    apellidos: apellidosRaw || '',
    correo: str(r['correo'] ?? r['CORREO'] ?? r['email']),
    telefono: str(r['telefono'] ?? r['TELEFONO'] ?? r['celular']),
    puesto: str(r['puesto'] ?? r['PUESTO'] ?? r['cargo']),
    departamento: str(r['departamento'] ?? r['DEPARTAMENTO'] ?? r['area']),
    alias: str(r['alias'] ?? r['ALIAS'] ?? r['usuario']),
    fotoPerfil: str(r['fotoUrl'] ?? r['fotoPerfil'] ?? r['foto_perfil'] ?? r['FOTO_PERFIL']) || null,
    portada: str(r['portadaUrl'] ?? r['portada'] ?? r['PORTADA']) || null,
    fechaCumpleanos: str(r['fechaCumpleanos'] ?? r['FECHA_CUMPLEANOS'] ?? r['cumpleanos']) || null,
    tipoUsuario: str(r['tipoUsuario'] ?? r['TIPOUSUARIO'] ?? r['tipo_usuario'] ?? r['TIPO_USUARIO']),
    fechaIngreso: str(r['fechaIngreso'] ?? r['FECHA_INGRESO'] ?? r['createdAt']) || null,
  }
}

type Tab = 'info' | 'editar' | 'seguridad'

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'info',      label: 'Información',     icon: User      },
  { key: 'editar',    label: 'Editar perfil',   icon: Briefcase },
  { key: 'seguridad', label: 'Seguridad',       icon: Shield    },
]

/* ── Pestañas del expediente personal (movidas desde el módulo Expediente) ── */
type ExpTab = 'persona' | 'contacto' | 'adicionales' | 'familiares' | 'formacion' | 'talento'

const EXPEDIENTE_TABS: { key: ExpTab; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'persona',     label: 'Persona',     icon: UserCircle2,    color: 'indigo'  },
  { key: 'contacto',    label: 'Contacto',    icon: Phone,          color: 'emerald' },
  { key: 'adicionales', label: 'Adicionales', icon: Shirt,          color: 'amber'   },
  { key: 'familiares',  label: 'Familiares',  icon: Users,          color: 'pink'    },
  { key: 'formacion',   label: 'Formación',   icon: GraduationCap,  color: 'teal'    },
  { key: 'talento',     label: 'Talento',     icon: Wrench,         color: 'purple'  },
]

const EXP_TAB_COLORS: Record<string, { active: string; icon: string }> = {
  indigo:  { active: 'bg-indigo-50 text-indigo-600',   icon: 'text-indigo-500'  },
  emerald: { active: 'bg-emerald-50 text-emerald-600', icon: 'text-emerald-500' },
  amber:   { active: 'bg-amber-50 text-amber-600',     icon: 'text-amber-500'   },
  pink:    { active: 'bg-pink-50 text-pink-600',       icon: 'text-pink-500'    },
  teal:    { active: 'bg-teal-50 text-teal-600',       icon: 'text-teal-500'    },
  purple:  { active: 'bg-purple-50 text-purple-600',   icon: 'text-purple-500'  },
}

/* ── Dato label/valor: separados por línea fina, label izquierda / valor derecha ── */
function DatoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  const disponible = !!value
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-border/70 py-2.5 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-[0.72rem] font-medium text-ink-tertiary">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        {label}
      </span>
      <span className={clsx('text-[0.8rem] truncate text-right', disponible ? 'text-ink font-medium' : 'text-ink-tertiary italic')}>
        {disponible ? value : 'No disponible'}
      </span>
    </div>
  )
}

/* ── Documento del bloque "Documentos y expediente" ── */
function DocumentoItem({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-surface-border px-3 py-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface">
        <Icon className="h-4 w-4 text-ink-tertiary" />
      </div>
      <div className="min-w-0">
        <p className="text-[0.78rem] font-medium text-ink-secondary truncate">{label}</p>
        <p className="text-[0.65rem] text-ink-tertiary italic">Próximamente</p>
      </div>
    </div>
  )
}

export function PerfilPage() {
  const user = useAuthStore((s) => s.user)
  const qc   = useQueryClient()
  const [tab,      setTab]      = useState<Tab>('info')
  const [expTab,   setExpTab]   = useState<ExpTab>('persona')
  const [showPass, setShowPass] = useState(false)
  const [passForm, setPassForm] = useState({ actual: '', nueva: '', confirmar: '' })
  const [form,     setForm]     = useState<Partial<PerfilDetalle>>({})

  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD'

  const { data: perfil, isLoading } = useQuery<PerfilDetalle>({
    queryKey: ['perfil', user?.id],
    queryFn: async () => {
      const { data } = await api.get(`/perfil/${user?.id}`)
      const raw = data?.perfil ?? data?.data ?? data
      return parsePerfil(raw as Record<string, unknown>)
    },
    enabled: !!user?.id,
  })

  const { data: saldo } = useQuery<SaldoVacaciones>({
    queryKey: ['mi-saldo'],
    queryFn: async () => {
      const { data } = await api.get('/vacaciones/mi-saldo')
      return data?.data ?? data
    },
  })

  useEffect(() => {
    if (perfil) setForm({
      telefono: perfil.telefono,
      correo: perfil.correo,
      puesto: perfil.puesto,
      departamento: perfil.departamento,
      alias: perfil.alias,
      fechaCumpleanos: toInputDate(perfil.fechaCumpleanos),
    })
  }, [perfil])

  const updateContacto = useMutation({
    mutationFn: () => api.put(`/perfil/${user?.id}/contacto`, { telefono: form.telefono, correo: form.correo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perfil'] }); toast.success('Perfil actualizado') },
    onError:   () => toast.error('Error al actualizar'),
  })

  const updateCumple = useMutation({
    mutationFn: () => api.put(`/perfil/${user?.id}/cumpleanos`, { fechaCumpleanos: form.fechaCumpleanos }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perfil'] }); toast.success('Cumpleaños actualizado') },
    onError:   () => toast.error('Error al actualizar cumpleaños'),
  })

  const updatePuesto = useMutation({
    mutationFn: () => api.put(`/perfil/${user?.id}/puesto`, { puesto: form.puesto, departamento: form.departamento }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perfil'] }) },
    onError:   () => toast.error('Error al actualizar puesto'),
  })

  const updateAlias = useMutation({
    mutationFn: () => api.put(`/perfil/${user?.id}/alias`, { alias: form.alias }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perfil'] }) },
    onError:   () => toast.error('Error al actualizar alias'),
  })

  const updatePass = useMutation({
    mutationFn: () => api.put(`/perfil/${user?.id}/password`, { actual: passForm.actual, nueva: passForm.nueva }),
    onSuccess: () => { setPassForm({ actual: '', nueva: '', confirmar: '' }); toast.success('Contraseña actualizada') },
    onError:   (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al cambiar contraseña'),
  })

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    const fd = new FormData()
    fd.append('foto', file)
    try {
      const { data } = await api.post(`/perfil/${user.id}/foto`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      qc.invalidateQueries({ queryKey: ['perfil'] })
      const fotoUrl = String(data?.fotoPerfil ?? data?.url ?? '')
      if (fotoUrl) useAuthStore.getState().updatePerfil(
        useAuthStore.getState().user?.perfilAlias ?? null,
        fotoUrl.startsWith('/') ? fotoUrl : fotoUrl.startsWith('http') ? (fotoUrl.match(/\/intranet\/.+$/)?.[0] ?? fotoUrl) : `/intranet/Perfil/${fotoUrl}`,
        useAuthStore.getState().user?.perfilPortadaUrl ?? null,
      )
      toast.success('Foto actualizada')
    } catch {
      toast.error('Error al subir la foto')
    }
    e.target.value = ''
  }

  const subirPortada = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    const fd = new FormData()
    fd.append('portada', file)
    try {
      const { data } = await api.post(`/perfil/${user.id}/portada`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      qc.invalidateQueries({ queryKey: ['perfil'] })
      const portadaUrl = String(data?.portada ?? data?.url ?? '')
      if (portadaUrl) useAuthStore.getState().updatePerfil(
        useAuthStore.getState().user?.perfilAlias ?? null,
        useAuthStore.getState().user?.perfilFotoUrl ?? null,
        portadaUrl.startsWith('/') ? portadaUrl : portadaUrl.startsWith('http') ? (portadaUrl.match(/\/intranet\/.+$/)?.[0] ?? portadaUrl) : `/intranet/Portadas/${portadaUrl}`,
      )
      toast.success('Portada actualizada')
    } catch {
      toast.error('Error al subir la portada')
    }
    e.target.value = ''
  }

  if (isLoading || !perfil) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
        <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
          <div className="h-40" style={{ background: 'linear-gradient(135deg, #0B1730 0%, #14274E 100%)' }} />
          <div className="px-6 pb-5">
            <div className="-mt-12 mb-4 flex items-end gap-4">
              <div className="h-[88px] w-[88px] rounded-2xl border-4 border-white bg-surface animate-pulse flex-shrink-0" />
              <div className="pb-1 space-y-2">
                <div className="h-5 w-40 rounded-lg bg-surface animate-pulse" />
                <div className="h-3.5 w-28 rounded-full bg-surface animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const resolveMediaUrl = (raw: string | null, folder: 'Perfil' | 'Portadas') => {
    if (!raw) return null
    if (raw.startsWith('/')) return raw
    if (raw.startsWith('http')) {
      // URLs legacy con dominio externo — extraer solo el path desde /intranet/
      const m = raw.match(/\/intranet\/.+$/)
      return m ? m[0] : raw
    }
    return `/intranet/${folder}/${raw}`
  }

  const avatar = resolveMediaUrl(perfil.fotoPerfil, 'Perfil')

  const initials = `${perfil.nombres.charAt(0)}${perfil.apellidos.charAt(0)}`.toUpperCase()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">

      {/* ── Banner de bienvenida ── */}
      <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
        <div
          className="relative overflow-hidden px-6 py-6 sm:px-8 sm:py-7"
          style={{ background: 'linear-gradient(135deg, #0B1730 0%, #14274E 100%)' }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />

          <div className="relative flex items-center justify-between gap-6 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-4 min-w-0">
              {/* Avatar con halo online */}
              <div className="relative flex-shrink-0 group/avatar">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={perfil.nombres}
                    className="h-[72px] w-[72px] rounded-full border-4 border-white/90 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 bg-white/10 shadow-lg">
                    <span className="text-xl font-bold text-white">{initials}</span>
                  </div>
                )}
                <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                  <input type="file" accept="image/*" className="hidden" onChange={subirFoto} />
                  <Camera className="h-5 w-5 text-white drop-shadow" />
                </label>
                <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 shadow animate-pulse-dot" />
              </div>

              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">
                  {`¡${greeting}, ${perfil.alias || perfil.nombres}!`} <span>👋</span>
                </h1>
                <p className="mt-1 text-sm text-white/70">
                  {perfil.puesto || '—'}{perfil.departamento ? ` · ${perfil.departamento}` : ''}
                </p>
              </div>
            </div>

            {/* Panel decorativo / mascota (con fallback si no hay asset) */}
            <div className="relative hidden h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl bg-white/5 sm:flex">
              <img
                src="/mascota-perfil.png"
                alt=""
                className="h-full w-full rounded-2xl object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>

            {/* Botón cambiar portada — se conserva la posibilidad de personalizar fondo */}
            <label className="absolute right-3 top-3 cursor-pointer rounded-lg bg-white/10 p-1.5 opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100 sm:opacity-60">
              <input type="file" accept="image/*" className="hidden" onChange={subirPortada} />
              <Camera className="h-3.5 w-3.5 text-white" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Card Resumen (chips en línea) ── */}
      <div className="rounded-2xl border border-surface-border bg-white p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatWidget icon={Briefcase} label="Puesto" value={perfil.puesto || 'No disponible'} />
          <StatWidget icon={Building2} label="Área" value={perfil.departamento || 'No disponible'} />
          <StatWidget icon={Calendar} label="Antigüedad" value={formatAntiguedad(perfil.fechaIngreso)} />
          <StatWidget icon={ClipboardList} label="Tipo de contrato" value="No disponible" />
        </div>
      </div>

      {/* ── Cuerpo: contenido + sidebar ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] lg:items-start">

        <div className="space-y-4 min-w-0">

          {/* Información personal + contacto */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SectionCard title="Información personal" icon={User} barColor="bg-brand" action={{ label: 'Ver información completa', onClick: () => setTab('info') }}>
              <div className="space-y-3">
                <DatoRow icon={User} label="Nombre completo" value={`${perfil.nombres} ${perfil.apellidos}`.trim() || null} />
                <DatoRow icon={Calendar} label="Fecha de nacimiento" value={null} />
                <DatoRow icon={Globe2} label="Nacionalidad" value={null} />
                <DatoRow icon={IdCard} label="ID de empleado" value={perfil.id ? String(perfil.id) : null} />
              </div>
            </SectionCard>

            <SectionCard title="Información de contacto" icon={Mail} barColor="bg-brand" action={{ label: 'Editar información', onClick: () => setTab('editar') }}>
              <div className="space-y-3">
                <DatoRow icon={Mail} label="Correo institucional" value={perfil.correo || null} />
                <DatoRow icon={Phone} label="Teléfono" value={perfil.telefono || null} />
                <DatoRow icon={Hash} label="Extensión" value={null} />
                <DatoRow icon={MapPin} label="Ubicación" value={null} />
              </div>
            </SectionCard>
          </div>

          {/* ── Tabs de acción (Información / Editar / Seguridad) ── */}
          <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
            {/* Tab nav */}
            <div className="flex border-b border-surface-border">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-2 py-3 text-[0.78rem] font-semibold transition-all border-b-2',
                    tab === key
                      ? 'border-brand text-brand'
                      : 'border-transparent text-ink-tertiary hover:text-ink-secondary hover:border-surface-border',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Tab: Información (solo lectura resumida) */}
            {tab === 'info' && (
              <div className="p-5 space-y-3">
                <p className="text-xs text-ink-tertiary leading-relaxed">
                  Esta es tu información corporativa registrada. Para actualizar tu teléfono o cumpleaños ve a <strong className="text-ink-secondary">Editar perfil</strong>.
                </p>
                <div className="divide-y divide-surface-border/70 rounded-xl border border-surface-border overflow-hidden">
                  {[
                    { label: 'Nombre completo', val: `${perfil.nombres} ${perfil.apellidos}` },
                    { label: 'Usuario (alias)',  val: perfil.alias || '—' },
                    { label: 'Correo',           val: perfil.correo || '—' },
                    { label: 'Teléfono',         val: perfil.telefono || '—' },
                    { label: 'Puesto',           val: perfil.puesto || '—' },
                    { label: 'Departamento',     val: perfil.departamento || '—' },
                    { label: 'Tipo de usuario',  val: perfil.tipoUsuario },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-ink-tertiary font-medium">{label}</span>
                      <span className="rounded-lg bg-surface border border-surface-border px-2.5 py-0.5 text-[0.78rem] font-medium text-ink-secondary">
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Editar perfil */}
            {tab === 'editar' && (
              <div className="p-5 space-y-6">

                {/* Sección: Contacto */}
                <div className="space-y-3">
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-tertiary">Contacto</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary">Correo</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary pointer-events-none" />
                        <input type="email" value={form.correo ?? ''} onChange={(e) => setForm({ ...form, correo: e.target.value })} className="field pl-10" placeholder="correo@empresa.com" />
                      </div>
                      <p className="text-[0.68rem] text-ink-tertiary">A este correo se enviarán tus notificaciones (ej. solicitudes de vacaciones/permisos). Sin correo, solo se notifica dentro de AGYDA.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary">Teléfono</label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary pointer-events-none" />
                        <input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="field pl-10" placeholder="+52 000 000 0000" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sección: Identidad */}
                <div className="space-y-3">
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-tertiary">Identidad</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary">Fecha de cumpleaños</label>
                      <div className="relative">
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary pointer-events-none" />
                        <input type="date" value={form.fechaCumpleanos ?? ''} onChange={(e) => setForm({ ...form, fechaCumpleanos: e.target.value })} className="field pl-10" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-wrap gap-2 border-t border-surface-border pt-4">
                  <Button
                    size="sm"
                    isLoading={updateContacto.isPending || updateCumple.isPending}
                    onClick={() => {
                      updateContacto.mutate()
                      if (form.fechaCumpleanos) updateCumple.mutate()
                      toast.success('Perfil actualizado')
                    }}
                  >
                    <Save className="h-3.5 w-3.5" /> Guardar cambios
                  </Button>
                </div>
              </div>
            )}

            {/* Tab: Seguridad / contraseña */}
            {tab === 'seguridad' && (
              <div className="p-5 space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Usa una contraseña segura de al menos 8 caracteres con mayúsculas, números y símbolos.
                  </p>
                </div>

                <div className="space-y-3">
                  {(['actual', 'nueva', 'confirmar'] as const).map((campo) => {
                    const labels = { actual: 'Contraseña actual', nueva: 'Nueva contraseña', confirmar: 'Confirmar nueva contraseña' }
                    return (
                      <div key={campo} className="space-y-1.5">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          {labels[campo]}
                        </label>
                        <div className="relative">
                          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary pointer-events-none" />
                          <input
                            type={showPass ? 'text' : 'password'}
                            value={passForm[campo]}
                            onChange={(e) => setPassForm({ ...passForm, [campo]: e.target.value })}
                            className="field pl-10 pr-11"
                            placeholder="••••••••"
                          />
                          {campo === 'confirmar' && (
                            <button
                              type="button"
                              onClick={() => setShowPass(!showPass)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-tertiary hover:text-ink-secondary transition-colors"
                            >
                              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {passForm.nueva && passForm.confirmar && passForm.nueva !== passForm.confirmar && (
                  <p className="text-xs font-medium text-red-500">Las contraseñas no coinciden</p>
                )}

                <div className="border-t border-surface-border pt-4">
                  <Button
                    size="sm"
                    isLoading={updatePass.isPending}
                    disabled={!passForm.actual || !passForm.nueva || passForm.nueva !== passForm.confirmar}
                    onClick={() => updatePass.mutate()}
                  >
                    <Shield className="h-3.5 w-3.5" /> Cambiar contraseña
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Documentos + Accesos frecuentes (secundario, al cierre de la columna principal) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SectionCard title="Documentos y expediente" icon={FolderOpen} barColor="bg-brand" action={{ label: 'Ir a expediente', to: '/expediente' }}>
              <div className="grid grid-cols-2 gap-2.5">
                <DocumentoItem icon={IdCard} label="Identificación oficial" />
                <DocumentoItem icon={MapPin} label="Comprobante de domicilio" />
                <DocumentoItem icon={Briefcase} label="Contrato laboral" />
                <DocumentoItem icon={Hash} label="RFC" />
              </div>
            </SectionCard>

            <SectionCard title="Accesos frecuentes" icon={FolderOpen} barColor="bg-brand">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                {[
                  { icon: Users,         label: 'Portal de RH',  to: '/organigrama' },
                  { icon: Wallet,        label: 'Nómina',        to: '/nomina' },
                  { icon: GraduationCap, label: 'Capacitación',  to: '/evaluacion-capacitacion' },
                  { icon: Users,         label: 'Directorio',    to: '/organigrama' },
                  { icon: ClipboardList, label: 'Solicitudes',   to: '/vacaciones' },
                ].map((a) => (
                  <a key={a.label} href={a.to}
                    className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors hover:bg-brand-light">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface group-hover:bg-brand-light transition-colors">
                      <a.icon className="h-4 w-4 text-ink-tertiary group-hover:text-brand transition-colors" />
                    </div>
                    <span className="text-[0.62rem] font-semibold text-ink-secondary group-hover:text-brand transition-colors leading-tight">{a.label}</span>
                  </a>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>

        {/* ── Sidebar derecho: ordenado por urgencia/frecuencia de uso ── */}
        <div className="space-y-4">
          <SectionCard title="Vacaciones disponibles" icon={Umbrella} barColor="bg-brand" action={{ label: 'Ver calendario', to: '/calendario' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light">
                <Umbrella className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0">
                {saldo ? (
                  <>
                    <p className="text-[1.1rem] font-bold text-ink leading-none">{saldo.diasDisponibles} días</p>
                    <p className="text-[0.68rem] text-ink-tertiary mt-1">de {saldo.poolTotal} días totales</p>
                  </>
                ) : (
                  <p className="text-[0.78rem] text-ink-tertiary italic">Cargando…</p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Permisos y roles"
            icon={Shield}
            barColor="bg-brand"
            action={isAdmin ? { label: 'Gestionar accesos', to: '/usuarios' } : undefined}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light">
                <Shield className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.85rem] font-bold text-ink">{TIPO_USUARIO_LABEL[perfil.tipoUsuario?.toUpperCase()] ?? perfil.tipoUsuario ?? 'Colaborador'}</p>
                <p className="text-[0.68rem] text-ink-tertiary">{isAdmin ? 'Acceso total a módulos' : 'Acceso según tu rol'}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Actividad reciente" icon={Activity} barColor="bg-brand">
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface">
                <Activity className="h-4 w-4 text-ink-tertiary" />
              </div>
              <p className="text-[0.75rem] text-ink-tertiary">Aún no hay actividad registrada</p>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Mi expediente: datos personales que antes vivían en el módulo Expediente ── */}
      <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
        <div className="flex items-center gap-3 border-b border-surface-border px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light">
            <FolderOpen className="h-4.5 w-4.5 text-brand" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[0.9rem] font-bold text-ink">Mi expediente</h2>
            <p className="text-[0.7rem] text-ink-tertiary mt-0.5">
              Completa tus datos personales, contacto, familiares, formación y talento
            </p>
          </div>
        </div>

        {/* Nav de pestañas del expediente personal */}
        <div className="flex gap-1 overflow-x-auto border-b border-surface-border px-3 py-2.5">
          {EXPEDIENTE_TABS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setExpTab(key)}
              className={clsx(
                'flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.78rem] font-semibold transition-all',
                expTab === key
                  ? clsx('shadow-sm', EXP_TAB_COLORS[color].active)
                  : 'text-ink-tertiary hover:bg-surface hover:text-ink-secondary',
              )}
            >
              <Icon className={clsx('h-3.5 w-3.5', expTab === key && EXP_TAB_COLORS[color].icon)} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {expTab === 'persona' && <PersonaTab />}
          {expTab === 'contacto' && <ContactoTab />}
          {expTab === 'adicionales' && <AdicionalesTab />}
          {expTab === 'familiares' && <FamiliaresTab />}
          {expTab === 'formacion' && <FormacionTab />}
          {expTab === 'talento' && <TalentoTab />}
        </div>
      </div>
    </div>
  )
}
