import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Check, Loader2, Info, Phone, Mail, Globe, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { personalizacionService, type CanalesPortalConfig } from '@/services/personalizacion.service'

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card px-3.5 py-2.5 text-[0.88rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'
const inputErrorCls =
  'w-full rounded-xl border border-red-300 bg-card px-3.5 py-2.5 text-[0.88rem] text-gray-900 ' +
  'outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/15'

// Validación de formato por canal. Vacío no es error aquí (eso ya lo cubre
// `sinDato`, que solo bloquea encender el switch) — esto valida que, SI hay
// algo escrito, tenga la forma correcta antes de poder activarse.
function validarWhatsapp(v: string): string | null {
  if (!v.trim()) return null
  return /^\+52\d{10}$/.test(v.trim()) ? null : 'Debe ser +52 seguido de 10 dígitos, ej. +525512345678'
}
function validarTelefono(v: string): string | null {
  if (!v.trim()) return null
  return /^\d{10}$/.test(v.trim()) ? null : 'Debe tener exactamente 10 dígitos, sin espacios ni guiones'
}
function validarMessenger(v: string): string | null {
  if (!v.trim()) return null
  return /^https:\/\/.+/.test(v.trim()) ? null : 'Debe ser un vínculo que empiece con https://'
}
function validarEmail(v: string): string | null {
  if (!v.trim()) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Debe ser un correo válido, con @ y dominio (ej. nombre@empresa.com)'
}
function validarSitioWeb(v: string): string | null {
  if (!v.trim()) return null
  return /^https?:\/\/.+/.test(v.trim()) ? null : 'Debe ser un vínculo que empiece con http:// o https://'
}

function CardSeccion({ icon: Icon, titulo, subtitulo, habilitado, onToggle, sinDato, error, children }: {
  icon: React.ComponentType<{ className?: string }>; titulo: string; subtitulo: string
  habilitado: boolean; onToggle: (v: boolean) => void
  // true cuando el campo de este canal está vacío — bloquea encenderlo hasta
  // que se capture un dato, para no activar un canal sin nada que mostrar.
  sinDato?: boolean
  // mensaje de formato inválido — también bloquea encender el switch.
  error?: string | null
  children: React.ReactNode
}) {
  const bloqueado = (!!sinDato || !!error) && !habilitado
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
            <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
          </div>
        </div>
        <button
          type="button"
          disabled={bloqueado}
          title={bloqueado ? (error ?? 'Captura un dato abajo para poder activar este canal') : undefined}
          onClick={() => onToggle(!habilitado)}
          className={clsx(
            'relative h-6 w-11 flex-shrink-0 rounded-full border-0 p-0 transition-colors',
            bloqueado ? 'cursor-not-allowed opacity-40' : '',
            habilitado ? 'bg-violet-600' : 'bg-gray-200'
          )}
        >
          <span className={clsx('absolute left-[4px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform', habilitado ? 'translate-x-5' : 'translate-x-0')} />
        </button>
      </div>
      {children}
      {error && <p className="mt-2 text-[0.72rem] font-semibold text-red-500">{error}</p>}
    </section>
  )
}

const DEFAULTS: CanalesPortalConfig = {
  whatsappNumero: '', whatsappHabilitado: false,
  messengerUrl: '', messengerHabilitado: false,
  telefono: '', telefonoHabilitado: false,
  email: '', emailHabilitado: false,
  sitioWebUrl: '', sitioWebHabilitado: false,
  horarioInicio: '', horarioFin: '', diasSemana: '1,2,3,4,5',
  sabadoHabilitado: false, sabadoHorarioInicio: '', sabadoHorarioFin: '',
}

const DIAS = [
  { key: '1', label: 'Lun' }, { key: '2', label: 'Mar' }, { key: '3', label: 'Mié' },
  { key: '4', label: 'Jue' }, { key: '5', label: 'Vie' }, { key: '6', label: 'Sáb' }, { key: '7', label: 'Dom' },
]

function SelectorDias({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const seleccionados = new Set(value.split(',').map((d) => d.trim()).filter(Boolean))
  const toggle = (dia: string) => {
    const next = new Set(seleccionados)
    if (next.has(dia)) next.delete(dia)
    else next.add(dia)
    onChange(DIAS.filter((d) => next.has(d.key)).map((d) => d.key).join(','))
  }
  return (
    <div className="flex flex-wrap gap-2">
      {DIAS.map((d) => {
        const activo = seleccionados.has(d.key)
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            className={clsx(
              'flex h-10 w-14 items-center justify-center rounded-xl text-[0.8rem] font-semibold transition-colors',
              activo ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {d.label}
          </button>
        )
      })}
    </div>
  )
}

// Horas en punto y media, de 00:00 a 23:30, para el selector desplegable.
const OPCIONES_HORA: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

export function CanalesPortalConfigTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<CanalesPortalConfig | null>(null)
  const [seededFrom, setSeededFrom] = useState<CanalesPortalConfig | null>(null)
  const actual = data?.canalesPortal ?? DEFAULTS
  if (data && actual !== seededFrom) {
    setSeededFrom(actual)
    setForm({ ...actual })
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateCanalesPortal(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Canales del Portal de Cliente actualizados')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando…</p>
  }

  const set = <K extends keyof CanalesPortalConfig>(key: K, value: CanalesPortalConfig[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  // Si el campo de un canal se vacía mientras está activado, se apaga solo
  // — no tiene sentido dejarlo "encendido" sin dato que mostrar en el portal.
  const setCampoConDato = <K extends keyof CanalesPortalConfig>(campo: K, habilitadoKey: keyof CanalesPortalConfig, value: string) =>
    setForm((f) => (f ? { ...f, [campo]: value, ...(value.trim() === '' ? { [habilitadoKey]: false } : {}) } : f))

  const hayErrores = [
    validarWhatsapp(form.whatsappNumero),
    validarMessenger(form.messengerUrl),
    validarTelefono(form.telefono),
    validarEmail(form.email),
    validarSitioWeb(form.sitioWebUrl),
  ].some(Boolean)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Canales del Portal de Cliente</h2>
            <p className="text-[0.82rem] text-gray-400">
              Datos de contacto que ven tus clientes en la sección "Canales" de su portal.
            </p>
          </div>
        </div>
      </div>

      <CardSeccion icon={MessageCircle} titulo="WhatsApp" subtitulo="Número al que se abre el chat desde el portal." habilitado={form.whatsappHabilitado} onToggle={(v) => set('whatsappHabilitado', v)} sinDato={!form.whatsappNumero.trim()} error={validarWhatsapp(form.whatsappNumero)}>
        <input
          type="text"
          placeholder="Ej. +525512345678 (+52 y 10 dígitos)"
          className={validarWhatsapp(form.whatsappNumero) ? inputErrorCls : inputCls}
          value={form.whatsappNumero}
          onChange={(e) => setCampoConDato('whatsappNumero', 'whatsappHabilitado', e.target.value)}
        />
      </CardSeccion>

      <CardSeccion icon={MessageCircle} titulo="Messenger" subtitulo="Enlace a tu página de Facebook Messenger." habilitado={form.messengerHabilitado} onToggle={(v) => set('messengerHabilitado', v)} sinDato={!form.messengerUrl.trim()} error={validarMessenger(form.messengerUrl)}>
        <input
          type="text"
          placeholder="https://m.me/tu-pagina"
          className={validarMessenger(form.messengerUrl) ? inputErrorCls : inputCls}
          value={form.messengerUrl}
          onChange={(e) => setCampoConDato('messengerUrl', 'messengerHabilitado', e.target.value)}
        />
      </CardSeccion>

      <CardSeccion icon={Phone} titulo="Teléfono" subtitulo="Número que se muestra para llamadas." habilitado={form.telefonoHabilitado} onToggle={(v) => set('telefonoHabilitado', v)} sinDato={!form.telefono.trim()} error={validarTelefono(form.telefono)}>
        <input
          type="text"
          placeholder="Ej. 5512345678 (10 dígitos)"
          className={validarTelefono(form.telefono) ? inputErrorCls : inputCls}
          value={form.telefono}
          onChange={(e) => setCampoConDato('telefono', 'telefonoHabilitado', e.target.value)}
        />
      </CardSeccion>

      <CardSeccion icon={Mail} titulo="Correo" subtitulo="Correo al que se redactará el mensaje." habilitado={form.emailHabilitado} onToggle={(v) => set('emailHabilitado', v)} sinDato={!form.email.trim()} error={validarEmail(form.email)}>
        <input
          type="email"
          placeholder="contacto@tuempresa.com"
          className={validarEmail(form.email) ? inputErrorCls : inputCls}
          value={form.email}
          onChange={(e) => setCampoConDato('email', 'emailHabilitado', e.target.value)}
        />
      </CardSeccion>

      <CardSeccion icon={Globe} titulo="Sitio web" subtitulo="Enlace a tu sitio web." habilitado={form.sitioWebHabilitado} onToggle={(v) => set('sitioWebHabilitado', v)} sinDato={!form.sitioWebUrl.trim()} error={validarSitioWeb(form.sitioWebUrl)}>
        <input
          type="text"
          placeholder="https://tuempresa.com"
          className={validarSitioWeb(form.sitioWebUrl) ? inputErrorCls : inputCls}
          value={form.sitioWebUrl}
          onChange={(e) => setCampoConDato('sitioWebUrl', 'sitioWebHabilitado', e.target.value)}
        />
      </CardSeccion>

      <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Clock className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-900">Horario de atención</p>
            <p className="text-[0.78rem] text-gray-400">Se muestra debajo de cada canal habilitado en el portal.</p>
          </div>
        </div>

        <label className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">Días</label>
        <SelectorDias value={form.diasSemana} onChange={(v) => set('diasSemana', v)} />

        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xs">
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">De</label>
            <select className={inputCls} value={form.horarioInicio} onChange={(e) => set('horarioInicio', e.target.value)}>
              <option value="">Selecciona…</option>
              {OPCIONES_HORA.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">A</label>
            <select className={inputCls} value={form.horarioFin} onChange={(e) => set('horarioFin', e.target.value)}>
              <option value="">Selecciona…</option>
              {OPCIONES_HORA.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
      </section>

      <CardSeccion icon={Clock} titulo="Horario de sábado" subtitulo="Actívalo solo si el sábado se atiende con un horario distinto." habilitado={form.sabadoHabilitado} onToggle={(v) => set('sabadoHabilitado', v)}>
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">De</label>
            <select className={inputCls} value={form.sabadoHorarioInicio} onChange={(e) => set('sabadoHorarioInicio', e.target.value)}>
              <option value="">Selecciona…</option>
              {OPCIONES_HORA.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">A</label>
            <select className={inputCls} value={form.sabadoHorarioFin} onChange={(e) => set('sabadoHorarioFin', e.target.value)}>
              <option value="">Selecciona…</option>
              {OPCIONES_HORA.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
      </CardSeccion>

      <div className="flex items-start gap-2 rounded-xl bg-violet-500/10 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-ink-secondary">
          Solo los canales que actives (interruptor en <span className="font-semibold text-violet-500">morado</span>) se muestran a tus clientes en el Portal de Cliente.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button type="button"
          onClick={() => setForm({ ...actual })}
          className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100">
          Descartar cambios
        </button>
        <button type="button"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || hayErrores}
          title={hayErrores ? 'Corrige el formato marcado en rojo antes de guardar' : undefined}
          className={clsx(
            'flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white',
            'shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60',
          )}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}
