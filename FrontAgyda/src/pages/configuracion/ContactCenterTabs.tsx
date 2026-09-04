import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plug, Users, Tags, Gauge, FlaskConical, Layers, Check, Loader2, Plus, Trash2, Copy } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccService } from '@/services/cc.service'
import { CANAL_LABEL, type CCCanalTipo } from '@/types/cc.types'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2 text-sm outline-none focus:border-violet-500'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'

function Header({ icon: Icon, titulo, subtitulo }: { icon: React.ElementType; titulo: string; subtitulo: string }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
          <p className="text-[0.8rem] text-gray-400">{subtitulo}</p>
        </div>
      </div>
    </div>
  )
}

/* ═══ Canales ═══ */
export function CCCanalesTab() {
  const qc = useQueryClient()
  const { data: canales = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales() })
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos-all'], queryFn: () => ccService.getGrupos() })
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const [nuevoTipo, setNuevoTipo] = useState<CCCanalTipo>('test')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const inval = () => qc.invalidateQueries({ queryKey: ['cc-canales'] })

  const crear = useMutation({
    mutationFn: () => ccService.createCanal({ tipo: nuevoTipo, nombre: nuevoNombre }),
    onSuccess: () => { setNuevoNombre(''); inval(); toast.success('Canal creado') },
  })

  return (
    <div className="space-y-4">
      <Header icon={Plug} titulo="Canales" subtitulo="Conecta WhatsApp, Messenger o Instagram por tenant. El canal 'prueba' funciona sin Meta." />
      <div className={clsx(card, 'flex flex-wrap items-end gap-2')}>
        <label className="block">
          <span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Tipo</span>
          <select className={field} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as CCCanalTipo)}>
            <option value="test">Prueba</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Nombre</span>
          <input className={field} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="WhatsApp Ventas" />
        </label>
        <button onClick={() => crear.mutate()} disabled={!nuevoNombre.trim() || crear.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
      {canales.map((c) => (
        <CanalCard key={c.id} canal={c} grupos={grupos} campanias={campanias} onChanged={inval} />
      ))}
    </div>
  )
}

function CanalCard({ canal, grupos, campanias, onChanged }: any) {
  const [form, setForm] = useState({
    nombre: canal.nombre, habilitado: canal.habilitado, grupoId: canal.grupoId ?? '', campaniaId: canal.campaniaId ?? '',
    metaPageId: canal.metaPageId ?? '', metaBusinessId: canal.metaBusinessId ?? '', verifyToken: canal.verifyToken ?? '',
    accessToken: '', appSecret: '',
  })
  const guardar = useMutation({
    mutationFn: () => ccService.updateCanal(canal.id, {
      nombre: form.nombre, habilitado: form.habilitado,
      grupoId: form.grupoId || null, campaniaId: form.campaniaId || null,
      metaPageId: form.metaPageId, metaBusinessId: form.metaBusinessId, verifyToken: form.verifyToken,
      ...(form.accessToken ? { accessToken: form.accessToken } : {}),
      ...(form.appSecret ? { appSecret: form.appSecret } : {}),
    }),
    onSuccess: () => { toast.success('Canal guardado'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const probar = useMutation({ mutationFn: () => ccService.probarCanal(canal.id), onSuccess: (r: any) => toast.success(r?.message ?? 'OK'), onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Falló') })
  const suscribir = useMutation({ mutationFn: () => ccService.suscribirCanal(canal.id), onSuccess: (r: any) => { toast.success(r?.message ?? 'OK'); onChanged() }, onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Falló') })
  const eliminar = useMutation({ mutationFn: () => ccService.deleteCanal(canal.id), onSuccess: () => { toast.success('Eliminado'); onChanged() } })
  const esTest = canal.tipo === 'test'

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold text-gray-800">{CANAL_LABEL[canal.tipo as CCCanalTipo]} — {canal.nombre}</p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" className="h-3.5 w-3.5 accent-violet-600" checked={form.habilitado} onChange={(e) => setForm({ ...form, habilitado: e.target.checked })} /> Habilitado
          </label>
          <button onClick={() => eliminar.mutate()} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Nombre</span>
          <input className={field} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Skill destino</span>
          <select className={field} value={form.grupoId} onChange={(e) => setForm({ ...form, grupoId: e.target.value })}>
            <option value="">—</option>{grupos.map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select></label>
        <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Campaña</span>
          <select className={field} value={form.campaniaId} onChange={(e) => setForm({ ...form, campaniaId: e.target.value })}>
            <option value="">—</option>{campanias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
        {!esTest && <>
          <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Page ID / Phone Number ID</span>
            <input className={field} value={form.metaPageId} onChange={(e) => setForm({ ...form, metaPageId: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Business ID / WABA ID</span>
            <input className={field} value={form.metaBusinessId} onChange={(e) => setForm({ ...form, metaBusinessId: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Verify token</span>
            <input className={field} value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Access token {canal.accessTokenConfigurado && <span className="text-emerald-600">· configurado</span>}</span>
            <input type="password" className={field} value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} placeholder={canal.accessTokenConfigurado ? '•••••• (vacío = no cambiar)' : ''} /></label>
          <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">App secret {canal.appSecretConfigurado && <span className="text-emerald-600">· configurado</span>}</span>
            <input type="password" className={field} value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} /></label>
        </>}
      </div>
      {!esTest && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 text-[0.72rem] text-gray-600">
          <p className="font-semibold">URL del webhook (pégala en el panel de Meta):</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 ring-1 ring-gray-200">{canal.webhookUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(canal.webhookUrl); toast.success('Copiado') }} className="text-gray-400 hover:text-violet-600"><Copy className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        {!esTest && <button onClick={() => probar.mutate()} disabled={probar.isPending} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Probar conexión</button>}
        {!esTest && <button onClick={() => suscribir.mutate()} disabled={suscribir.isPending} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Suscribir webhook</button>}
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
        </button>
      </div>
    </div>
  )
}

/* ═══ Campañas y skills ═══ */
export function CCSkillsTab() {
  const qc = useQueryClient()
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const [nueva, setNueva] = useState('')
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-campanias'] }); qc.invalidateQueries({ queryKey: ['cc-grupos-all'] }) }
  const crear = useMutation({ mutationFn: () => ccService.createCampania({ nombre: nueva }), onSuccess: () => { setNueva(''); inval() } })

  return (
    <div className="space-y-4">
      <Header icon={Layers} titulo="Campañas y skills" subtitulo="Un skill = un grupo de agentes. Los canales y el enrutador apuntan a un skill." />
      <div className={clsx(card, 'flex gap-2')}>
        <input className={field} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva campaña" />
        <button onClick={() => crear.mutate()} disabled={!nueva.trim()} className="rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Crear</button>
      </div>
      {campanias.map((c) => <CampaniaCard key={c.id} campania={c} onChanged={inval} />)}
    </div>
  )
}

function CampaniaCard({ campania, onChanged }: any) {
  const qc = useQueryClient()
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos', campania.id], queryFn: () => ccService.getGrupos(campania.id) })
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-grupos', campania.id] }); onChanged() }
  const crearG = useMutation({ mutationFn: () => ccService.createGrupo({ campaniaId: campania.id, nombre: nuevoGrupo }), onSuccess: () => { setNuevoGrupo(''); inval() } })
  const delG = useMutation({ mutationFn: (id: number) => ccService.deleteGrupo(id), onSuccess: inval, onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error') })
  const delC = useMutation({ mutationFn: () => ccService.deleteCampania(campania.id), onSuccess: onChanged })

  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-bold text-gray-800">{campania.nombre}</p>
        <button onClick={() => delC.mutate()} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-1.5">
        {grupos.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
            <span>{g.icono} {g.nombre}</span>
            <button onClick={() => delG.mutate(g.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className={field} value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} placeholder="Nuevo skill" />
        <button onClick={() => crearG.mutate()} disabled={!nuevoGrupo.trim()} className="rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">+ Skill</button>
      </div>
    </div>
  )
}

/* ═══ Asignación de agentes ═══ */
export function CCAgentesTab() {
  const qc = useQueryClient()
  const { data: matriz } = useQuery({ queryKey: ['cc-matriz'], queryFn: () => ccService.getMatrizAgentes() })
  const { data: usuarios = [] } = useUsuariosSimple()
  const toggle = useMutation({
    mutationFn: ({ grupoId, usuarioId, on }: { grupoId: number; usuarioId: number; on: boolean }) =>
      on ? ccService.asignarAgente(grupoId, usuarioId) : ccService.quitarAgente(grupoId, usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cc-matriz'] }),
  })
  const grupos = matriz?.grupos ?? []
  const asignado = (u: number, g: number) => (matriz?.asignaciones ?? []).some((a) => a.usuarioId === u && a.grupoId === g)

  return (
    <div className="space-y-4">
      <Header icon={Users} titulo="Asignación de agentes" subtitulo="Marca qué skills atiende cada agente. El enrutador solo asigna interacciones de sus skills." />
      <div className={clsx(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-[0.7rem] text-gray-500">
            <th className="py-2 text-left">Agente</th>
            {grupos.map((g) => <th key={g.id} className="px-2 py-2 text-center">{g.icono} {g.nombre}</th>)}
          </tr></thead>
          <tbody>
            {usuarios.map((u: any) => (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-2">{u.nombre}</td>
                {grupos.map((g) => (
                  <td key={g.id} className="px-2 py-2 text-center">
                    <input type="checkbox" className="h-4 w-4 accent-violet-600"
                      checked={asignado(u.id, g.id)}
                      onChange={(e) => toggle.mutate({ grupoId: g.id, usuarioId: u.id, on: e.target.checked })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══ Tipificaciones ═══ */
export function CCTipificacionesTab() {
  const qc = useQueryClient()
  const { data: tips = [] } = useQuery({ queryKey: ['cc-tip-cat'], queryFn: () => ccService.getTipificacionesCatalogo() })
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const [nueva, setNueva] = useState({ nombre: '', campaniaId: '', requiereComentario: false })
  const inval = () => qc.invalidateQueries({ queryKey: ['cc-tip-cat'] })
  const crear = useMutation({
    mutationFn: () => ccService.createTipificacion({ nombre: nueva.nombre, campaniaId: nueva.campaniaId || null, requiereComentario: nueva.requiereComentario }),
    onSuccess: () => { setNueva({ nombre: '', campaniaId: '', requiereComentario: false }); inval() },
  })
  const del = useMutation({ mutationFn: (id: number) => ccService.deleteTipificacion(id), onSuccess: inval })

  return (
    <div className="space-y-4">
      <Header icon={Tags} titulo="Tipificaciones" subtitulo="Categorías obligatorias al cerrar una interacción. Globales o por campaña." />
      <div className={clsx(card, 'flex flex-wrap items-end gap-2')}>
        <input className={clsx(field, 'flex-1')} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre" />
        <select className={field} value={nueva.campaniaId} onChange={(e) => setNueva({ ...nueva, campaniaId: e.target.value })}>
          <option value="">Global</option>{campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" className="h-3.5 w-3.5 accent-violet-600" checked={nueva.requiereComentario} onChange={(e) => setNueva({ ...nueva, requiereComentario: e.target.checked })} /> Requiere comentario</label>
        <button onClick={() => crear.mutate()} disabled={!nueva.nombre.trim()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Agregar</button>
      </div>
      <div className={card}>
        {tips.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0">
            <span>{t.nombre} {t.campaniaId ? <span className="text-[0.68rem] text-gray-400">(campaña {t.campaniaId})</span> : <span className="text-[0.68rem] text-gray-400">(global)</span>} {t.requiereComentario && <span className="text-[0.68rem] text-amber-600">· comentario</span>}</span>
            <button onClick={() => del.mutate(t.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Config SLA/ACW ═══ */
export function CCConfigTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['cc-config'], queryFn: () => ccService.getConfig() })
  const [form, setForm] = useState<any>(null)
  const [seed, setSeed] = useState<string>('')
  if (data && JSON.stringify(data) !== seed) { setSeed(JSON.stringify(data)); setForm({ ...data }) }
  const guardar = useMutation({
    mutationFn: () => ccService.updateConfig(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-config'] }); toast.success('Guardado') },
  })
  if (!form) return <p className="text-sm text-gray-400">Cargando…</p>
  const num = (k: string, label: string, hint: string) => (
    <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">{label}</span>
      <input type="number" className={field} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
      <span className="mt-0.5 block text-[0.65rem] text-gray-400">{hint}</span></label>
  )
  return (
    <div className="space-y-4">
      <Header icon={Gauge} titulo="SLA, ACW y horario" subtitulo="Umbrales de servicio, tiempo de wrap-up y autocierre por inactividad." />
      <div className={clsx(card, 'grid grid-cols-1 gap-3 sm:grid-cols-2')}>
        {num('slaPrimeraRespuestaSeg', 'SLA primera respuesta (seg)', 'Tiempo objetivo antes de que un agente tome la interacción')}
        {num('slaRespuestaSeg', 'SLA respuesta (seg)', 'Tiempo objetivo para responder a un mensaje del cliente')}
        {num('acwSeg', 'ACW / wrap-up (seg)', 'Tiempo tras cerrar antes de recibir otra interacción')}
        {num('maxInteraccionesPorAgente', 'Máx. interacciones por agente', 'Capacidad simultánea (una campaña puede sobreescribir)')}
        {num('autocierreInactividadMin', 'Autocierre por inactividad (min)', 'Cierra la interacción si el cliente no responde')}
        <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Mensaje de bienvenida</span>
          <input className={field} value={form.msgBienvenida} onChange={(e) => setForm({ ...form, msgBienvenida: e.target.value })} /></label>
      </div>
      <div className="flex justify-end">
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>
    </div>
  )
}

/* ═══ Simulador ═══ */
export function CCSimuladorTab() {
  const { data: canales = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales() })
  const testCanales = canales.filter((c) => c.tipo === 'test')
  const [form, setForm] = useState({ canalId: '', clienteNombre: 'Cliente de prueba', mensaje: '' })
  const [sim, setSim] = useState<{ interaccionId: number; simToken: string } | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const { data: hilo, refetch } = useQuery({
    queryKey: ['cc-sim-hilo', sim?.simToken],
    queryFn: async () => { const { publicApi } = await import('@/lib/axios-public'); return (await publicApi.get(`/contact-center/sim/${sim!.simToken}`)).data.data },
    enabled: !!sim, refetchInterval: 4000,
  })
  const crear = useMutation({
    mutationFn: () => ccService.simCrear({ canalId: Number(form.canalId), clienteNombre: form.clienteNombre, mensaje: form.mensaje }),
    onSuccess: (r) => { setSim(r.data); setForm({ ...form, mensaje: '' }); toast.success('Interacción de prueba creada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const responder = useMutation({
    mutationFn: async () => { const { publicApi } = await import('@/lib/axios-public'); return publicApi.post(`/contact-center/sim/${sim!.simToken}/mensajes`, { mensaje: respuesta }) },
    onSuccess: () => { setRespuesta(''); refetch() },
  })

  return (
    <div className="space-y-4">
      <Header icon={FlaskConical} titulo="Simulador de prueba" subtitulo="Crea una interacción ficticia y responde como si fueras el cliente. Sin Meta." />
      {testCanales.length === 0 && <div className={clsx(card, 'text-sm text-amber-700')}>Primero crea un canal de tipo "prueba" en la pestaña Canales.</div>}
      <div className={clsx(card, 'space-y-3')}>
        <select className={field} value={form.canalId} onChange={(e) => setForm({ ...form, canalId: e.target.value })}>
          <option value="">Selecciona canal de prueba…</option>
          {testCanales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className={field} value={form.clienteNombre} onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })} placeholder="Nombre del cliente" />
        <input className={field} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} placeholder="Primer mensaje del cliente" />
        <button onClick={() => crear.mutate()} disabled={!form.canalId || !form.mensaje.trim() || crear.isPending}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Crear interacción</button>
      </div>
      {sim && (
        <div className={clsx(card, 'space-y-2')}>
          <p className="text-xs text-gray-500">Consola del cliente · interacción #{sim.interaccionId} · estado: {hilo?.estado} {hilo?.agenteNombre ? `· agente: ${hilo.agenteNombre}` : ''}</p>
          <p className="text-[0.68rem] text-gray-400">Página pública: <code className="rounded bg-gray-100 px-1">/cc-cliente?t={sim.simToken}</code></p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl bg-gray-50 p-3">
            {(hilo?.mensajes ?? []).map((m: any) => (
              <div key={m.id} className={clsx('flex', m.emisor === 'cliente' ? 'justify-end' : 'justify-start')}>
                <span className={clsx('rounded-xl px-3 py-1.5 text-sm', m.emisor === 'cliente' ? 'bg-violet-600 text-white' : 'bg-white ring-1 ring-gray-200')}>{m.contenido}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={field} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && respuesta.trim()) responder.mutate() }} placeholder="Responder como cliente…" />
            <button onClick={() => responder.mutate()} disabled={!respuesta.trim()} className="rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Enviar</button>
          </div>
        </div>
      )}
    </div>
  )
}
