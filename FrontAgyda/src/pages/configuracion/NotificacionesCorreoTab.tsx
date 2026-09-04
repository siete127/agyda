import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Mail, MessageCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { configuracionService, type ServidorCorreoTipo, type GuardarServidorCorreoPayload } from '@/services/configuracion.service'

function ServidorCorreoPanel() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['servidor-correo-config'],
    queryFn: () => configuracionService.getServidorCorreoConfig(),
  })

  const [habilitado, setHabilitado] = useState(false)
  const [tipo, setTipo] = useState<ServidorCorreoTipo>('graph')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [buzonRemitente, setBuzonRemitente] = useState('')
  const [correoFrom, setCorreoFrom] = useState('')
  const [nombreRemitente, setNombreRemitente] = useState('')
  const [correoPrueba, setCorreoPrueba] = useState('')

  useEffect(() => {
    if (!data) return
    setHabilitado(data.habilitado)
    setTipo(data.tipo)
    setSmtpHost(data.smtpHost ?? '')
    setSmtpPort(data.smtpPort ? String(data.smtpPort) : '')
    setSmtpSecure(data.smtpSecure)
    setSmtpUser(data.smtpUser ?? '')
    setTenantId(data.tenantId ?? '')
    setClientId(data.clientId ?? '')
    setBuzonRemitente(data.buzonRemitente ?? '')
    setCorreoFrom(data.correoFrom ?? '')
    setNombreRemitente(data.nombreRemitente ?? '')
  }, [data])

  const guardar = useMutation({
    mutationFn: () => {
      const payload: GuardarServidorCorreoPayload = {
        habilitado,
        tipo,
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: smtpPort ? Number(smtpPort) : undefined,
        smtpSecure,
        smtpUser: smtpUser.trim() || undefined,
        smtpPass: smtpPass || undefined,
        tenantId: tenantId.trim() || undefined,
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret || undefined,
        buzonRemitente: buzonRemitente.trim() || undefined,
        correoFrom: correoFrom.trim() || undefined,
        nombreRemitente: nombreRemitente.trim() || undefined,
      }
      return configuracionService.guardarServidorCorreoConfig(payload)
    },
    onSuccess: (res) => {
      setSmtpPass('')
      setClientSecret('')
      qc.invalidateQueries({ queryKey: ['servidor-correo-config'] })
      toast.success(`Guardado. Transporte activo: ${res.transporteActivo}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'No se pudo guardar la configuración'),
  })

  const prueba = useMutation({
    mutationFn: () => configuracionService.enviarCorreoPrueba(correoPrueba.trim()),
    onSuccess: (res) => {
      if (res.success) toast.success('Correo de prueba enviado')
      else toast.error(res.message || 'No se pudo enviar el correo de prueba')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'No se pudo enviar el correo de prueba'),
  })

  if (isLoading) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start gap-3">
        <div className="rounded-lg bg-brand/10 p-2 text-brand">
          <Send className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Servidor de correo</p>
          <p className="text-xs text-ink-tertiary">SMTP o Microsoft Graph para el correo saliente de AGYDA (permisos, vacaciones, alertas...)</p>
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={habilitado} onChange={(e) => setHabilitado(e.target.checked)} />
        Habilitar envío de correo desde este panel
      </label>

      <div className="mb-4 inline-flex gap-1 rounded-lg border border-gray-100 p-1">
        <button
          type="button"
          className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold', tipo === 'smtp' ? 'bg-brand text-white' : 'text-ink-tertiary hover:text-ink')}
          onClick={() => setTipo('smtp')}
        >
          SMTP
        </button>
        <button
          type="button"
          className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold', tipo === 'graph' ? 'bg-brand text-white' : 'text-ink-tertiary hover:text-ink')}
          onClick={() => setTipo('graph')}
        >
          Microsoft Graph (Microsoft 365)
        </button>
      </div>

      {tipo === 'graph' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Tenant ID</label>
            <input className="field w-full text-sm" placeholder="00000000-0000-0000-0000-000000000000" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Client ID</label>
            <input className="field w-full text-sm" placeholder="00000000-0000-0000-0000-000000000000" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Client secret</label>
            <input
              className="field w-full text-sm"
              type="password"
              placeholder={data?.clientSecretConfigurado ? '•••••••• (ya configurado, escribe para reemplazar)' : ''}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Buzón remitente (correo de Microsoft 365)</label>
            <input className="field w-full text-sm" placeholder="notificaciones@empresa.com" value={buzonRemitente} onChange={(e) => setBuzonRemitente(e.target.value)} />
          </div>
          <p className="sm:col-span-2 -mt-1 text-xs text-ink-tertiary">
            Requiere un App Registration en Entra ID con permiso de aplicación <code className="rounded bg-surface px-1 py-0.5">Mail.Send</code> (consentido por un administrador).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Host SMTP</label>
            <input className="field w-full text-sm" placeholder="smtp.gmail.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Puerto</label>
            <input className="field w-full text-sm" placeholder="465" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Usuario SMTP</label>
            <input className="field w-full text-sm" placeholder="notificaciones@empresa.com" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Contraseña SMTP</label>
            <input
              className="field w-full text-sm"
              type="password"
              placeholder={data?.smtpPassConfigurado ? '•••••••• (ya configurada, escribe para reemplazar)' : ''}
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
            Conexión segura (TLS/SSL)
          </label>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Correo remitente (From)</label>
          <input className="field w-full text-sm" placeholder="notificaciones@empresa.com" value={correoFrom} onChange={(e) => setCorreoFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Nombre remitente</label>
          <input className="field w-full text-sm" placeholder="AGYDA" value={nombreRemitente} onChange={(e) => setNombreRemitente(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        <input
          className="field flex-1 text-sm"
          placeholder="correo@empresa.com"
          value={correoPrueba}
          onChange={(e) => setCorreoPrueba(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          disabled={!correoPrueba.trim() || prueba.isPending}
          onClick={() => prueba.mutate()}
        >
          <Send className="h-3.5 w-3.5" /> Enviar prueba
        </button>
        <div className="flex-1" />
        <button
          type="button"
          className="btn-primary px-4 py-1.5 text-xs"
          disabled={guardar.isPending}
          onClick={() => guardar.mutate()}
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

function AgregarCorreoInline({ usuarioId, onSaved }: { usuarioId: number; onSaved: () => void }) {
  const [editando, setEditando] = useState(false)
  const [correo, setCorreo] = useState('')

  const guardar = useMutation({
    mutationFn: () => configuracionService.setCorreoUsuario(usuarioId, correo.trim()),
    onSuccess: () => {
      setEditando(false)
      setCorreo('')
      onSaved()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Correo inválido'),
  })

  if (editando) {
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
        <input
          autoFocus
          className="field w-40 py-0.5 text-[0.65rem]"
          placeholder="correo@empresa.com"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && correo.trim() && guardar.mutate()}
        />
        <button type="button" className="text-[0.65rem] font-semibold text-brand" onClick={() => guardar.mutate()} disabled={!correo.trim() || guardar.isPending}>
          Guardar
        </button>
        <button type="button" className="text-[0.65rem] text-ink-tertiary" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      className="text-[0.65rem] text-red-500 underline decoration-dotted"
      onClick={(e) => {
        e.preventDefault()
        setEditando(true)
      }}
    >
      sin correo — agregar
    </button>
  )
}

function DestinatariosPanel() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notificaciones-correo-config'],
    queryFn: () => configuracionService.getConfiguracionCorreo(),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ modulo, usuarioId, activo, canal }: { modulo: string; usuarioId: number; activo: boolean; canal: 'mail' | 'telegram' }) =>
      configuracionService.setDestinatario(modulo, usuarioId, activo, canal),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones-correo-config'] }),
  })

  const [moduloActivo, setModuloActivo] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  if (isLoading || !data) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  const modulo = data.modulos.find((m) => m.key === moduloActivo) ?? data.modulos[0]
  const canales = data.destinatarios[modulo?.key ?? ''] ?? {}
  const usuariosFiltrados = data.usuarios.filter((u) => u.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start gap-3">
        <div className="rounded-lg bg-brand/10 p-2 text-brand">
          <Mail className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Correo y Telegram</p>
          <p className="text-xs text-ink-tertiary">A quién le llegan las notificaciones automáticas, y por qué canal</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {data.modulos.map((m) => (
          <button
            key={m.key}
            type="button"
            className={clsx(
              'rounded-lg border px-3 py-2 text-left text-xs',
              modulo?.key === m.key ? 'border-brand bg-brand/5' : 'border-gray-100 hover:border-gray-200'
            )}
            onClick={() => setModuloActivo(m.key)}
          >
            <p className={clsx('font-semibold', modulo?.key === m.key ? 'text-brand' : 'text-ink')}>{m.nombre}</p>
            <p className="text-[0.65rem] text-ink-tertiary">{m.descripcion}</p>
          </button>
        ))}
      </div>

      <input
        className="field mb-2 w-full text-sm"
        placeholder="Buscar usuario..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div className="mb-1 flex items-center gap-2 px-2 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-tertiary">
        <span className="flex-1">Usuario</span>
        <span className="flex w-8 justify-center" title="Correo"><Mail className="h-3 w-3" /></span>
        <span className="flex w-8 justify-center" title="Telegram"><MessageCircle className="h-3 w-3" /></span>
      </div>

      <div className="max-h-72 space-y-1 overflow-y-auto">
        {usuariosFiltrados.map((u) => {
          const c = canales[u.id] ?? { mail: false, telegram: false }
          return (
            <div key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface">
              <span className={clsx('flex-1', u.correo ? 'text-ink-secondary' : 'text-ink-tertiary')}>
                {u.nombre} <span className="text-ink-tertiary">({u.tipoUsuario})</span>
                {!u.correo && (
                  <span className="ml-2">
                    <AgregarCorreoInline usuarioId={u.id} onSaved={() => qc.invalidateQueries({ queryKey: ['notificaciones-correo-config'] })} />
                  </span>
                )}
              </span>
              <span className="flex w-8 justify-center">
                <input
                  type="checkbox"
                  checked={c.mail}
                  title="Notificar por correo"
                  onChange={(e) => toggleMutation.mutate({ modulo: modulo!.key, usuarioId: u.id, activo: e.target.checked, canal: 'mail' })}
                  disabled={!u.correo}
                />
              </span>
              <span className="flex w-8 justify-center">
                <input
                  type="checkbox"
                  checked={c.telegram}
                  title={u.telegramVinculado ? 'Notificar por Telegram' : 'El usuario no ha vinculado Telegram'}
                  onChange={(e) => toggleMutation.mutate({ modulo: modulo!.key, usuarioId: u.id, activo: e.target.checked, canal: 'telegram' })}
                  disabled={!u.telegramVinculado}
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function NotificacionesCorreoTab() {
  return (
    <div className="space-y-4">
      <ServidorCorreoPanel />
      <DestinatariosPanel />
    </div>
  )
}
