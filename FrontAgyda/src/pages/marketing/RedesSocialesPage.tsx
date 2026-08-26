import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Share2, Plus, Trash2, X, Calendar, Users2, TrendingUp, Image as ImageIcon, Upload, Pencil,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  marketingService,
  type PostRedSocial,
  type CuentaRedSocial,
  type RedSocial,
  type EstatusPost,
} from '@/services/marketing.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { EnConstruccion } from '@/components/ui/EnConstruccion'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const RED_LABEL: Record<RedSocial, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', youtube: 'YouTube', otro: 'Otro',
}

const RED_COLOR: Record<RedSocial, string> = {
  facebook: 'bg-blue-50 text-blue-700', instagram: 'bg-pink-50 text-pink-700', linkedin: 'bg-sky-50 text-sky-700',
  x: 'bg-gray-100 text-gray-700', tiktok: 'bg-purple-50 text-purple-700', youtube: 'bg-red-50 text-red-700', otro: 'bg-gray-100 text-gray-600',
}

const ESTATUS_CONFIG: Record<EstatusPost, { label: string; cls: string; dot: string }> = {
  borrador: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  programado: { label: 'Programado', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  publicado: { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

// ── Modal nueva/editar cuenta ─────────────────────────────────────────────
function CuentaFormModal({ isOpen, onClose, cuenta }: { isOpen: boolean; onClose: () => void; cuenta: CuentaRedSocial | null }) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState(cuenta?.nombre || '')
  const [red, setRed] = useState<RedSocial>(cuenta?.red || 'facebook')
  const [handle, setHandle] = useState(cuenta?.handle || '')

  const mutation = useMutation({
    mutationFn: () => (cuenta
      ? marketingService.actualizarCuenta(cuenta.id, { nombre, red, handle: handle || undefined, activa: cuenta.activa })
      : marketingService.crearCuenta({ nombre, red, handle: handle || undefined })
    ).then(() => undefined),
    onSuccess: () => {
      toast.success(cuenta ? 'Cuenta actualizada' : 'Cuenta registrada')
      queryClient.invalidateQueries({ queryKey: ['marketing-redes-cuentas'] })
      if (!cuenta) { setNombre(''); setRed('facebook'); setHandle('') }
      onClose()
    },
    onError: () => toast.error(cuenta ? 'No se pudo actualizar la cuenta' : 'No se pudo registrar la cuenta'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cuenta ? 'Editar cuenta de red social' : 'Nueva cuenta de red social'} variant="corporate" size="md">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!nombre.trim()) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre de la cuenta</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. ArdabyTec Oficial" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Red social</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={red} onChange={(e) => setRed(e.target.value as RedSocial)}>
              {(Object.keys(RED_LABEL) as RedSocial[]).map((r) => <option key={r} value={r}>{RED_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Usuario / handle</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@usuario" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>{cuenta ? 'Guardar cambios' : 'Registrar cuenta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Sección de cuentas ────────────────────────────────────────────────────
function CuentasSection({ cuentas }: { cuentas: CuentaRedSocial[] }) {
  const queryClient = useQueryClient()
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [cuentaEditando, setCuentaEditando] = useState<CuentaRedSocial | null>(null)

  const toggleMutation = useMutation({
    mutationFn: (c: CuentaRedSocial) => marketingService.actualizarCuenta(c.id, { nombre: c.nombre, red: c.red, handle: c.handle || undefined, activa: !c.activa }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-redes-cuentas'] }),
    onError: () => toast.error('No se pudo actualizar la cuenta'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => marketingService.eliminarCuenta(id),
    onSuccess: () => {
      toast.success('Cuenta eliminada')
      queryClient.invalidateQueries({ queryKey: ['marketing-redes-cuentas'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo eliminar la cuenta')
    },
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink"><Users2 className="h-4 w-4" /> Cuentas de redes sociales</h2>
        <Button size="sm" variant="secondary" onClick={() => setNuevaOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nueva cuenta
        </Button>
      </div>
      {cuentas.length === 0 ? (
        <p className="text-xs text-ink-tertiary">Sin cuentas registradas aún.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cuentas.map((c) => (
            <div
              key={c.id}
              className={clsx('group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs', c.activa ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60')}
            >
              <button
                onClick={() => toggleMutation.mutate(c)}
                className="flex items-center gap-2"
                title={c.activa ? 'Clic para desactivar' : 'Clic para activar'}
              >
                <span className={clsx('chip', RED_COLOR[c.red])}>{RED_LABEL[c.red]}</span>
                <span className="font-semibold text-ink">{c.nombre}</span>
                {c.handle && <span className="text-ink-tertiary">{c.handle}</span>}
              </button>
              <span className="ml-1 flex items-center gap-0.5 border-l border-gray-200 pl-2">
                <button onClick={() => setCuentaEditando(c)} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Editar cuenta">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => eliminarMutation.mutate(c.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar cuenta">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <CuentaFormModal isOpen={nuevaOpen} onClose={() => setNuevaOpen(false)} cuenta={null} />
      <CuentaFormModal isOpen={!!cuentaEditando} onClose={() => setCuentaEditando(null)} cuenta={cuentaEditando} />
    </div>
  )
}

// ── Métricas ──────────────────────────────────────────────────────────────
function MetricasSection({ postId }: { postId: number }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['marketing-post-metricas', postId], queryFn: () => marketingService.getMetricas(postId) })
  const [alcance, setAlcance] = useState('')
  const [interacciones, setInteracciones] = useState('')
  const [clics, setClics] = useState('')

  const mutation = useMutation({
    mutationFn: () => marketingService.guardarMetricas(postId, {
      alcance: alcance ? Number(alcance) : undefined,
      interacciones: interacciones ? Number(interacciones) : undefined,
      clics: clics ? Number(clics) : undefined,
    }),
    onSuccess: () => {
      toast.success('Métricas guardadas')
      queryClient.invalidateQueries({ queryKey: ['marketing-post-metricas', postId] })
      queryClient.invalidateQueries({ queryKey: ['marketing-redes-dashboard'] })
    },
    onError: () => toast.error('No se pudieron guardar las métricas'),
  })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <TrendingUp className="h-3.5 w-3.5" /> Métricas de desempeño
      </h3>
      <form className="grid grid-cols-3 gap-2" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Alcance" defaultValue={data?.alcance ?? ''} onChange={(e) => setAlcance(e.target.value)} />
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Interacciones" defaultValue={data?.interacciones ?? ''} onChange={(e) => setInteracciones(e.target.value)} />
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Clics" defaultValue={data?.clics ?? ''} onChange={(e) => setClics(e.target.value)} />
        <div className="col-span-3 flex justify-end">
          <Button type="submit" size="sm" isLoading={mutation.isPending}>Guardar métricas</Button>
        </div>
      </form>
    </div>
  )
}

// ── Modal detalle / edición de post ────────────────────────────────────────
function PostDetalleModal({ post, cuentas, onClose }: { post: PostRedSocial | null; cuentas: CuentaRedSocial[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const { data: campanias } = useQuery({ queryKey: ['marketing-campanias'], queryFn: () => marketingService.getCampanias() })

  const [titulo, setTitulo] = useState(post?.titulo || '')
  const [contenido, setContenido] = useState(post?.contenido || '')
  const [cuentaId, setCuentaId] = useState(String(post?.cuentaId || ''))
  const [campaniaId, setCampaniaId] = useState(post?.campaniaId ? String(post.campaniaId) : '')
  const [estatus, setEstatus] = useState<EstatusPost>(post?.estatus || 'borrador')
  const [fechaProgramada, setFechaProgramada] = useState(post?.fechaProgramada ? post.fechaProgramada.slice(0, 16) : '')
  const [responsableId, setResponsableId] = useState(post?.responsableId ? String(post.responsableId) : '')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['marketing-redes-posts'] })
    queryClient.invalidateQueries({ queryKey: ['marketing-redes-dashboard'] })
  }

  const guardarMutation = useMutation({
    mutationFn: () => marketingService.actualizarPost(post!.id, {
      cuentaId: Number(cuentaId), campaniaId: campaniaId ? Number(campaniaId) : null, titulo, contenido: contenido || undefined,
      estatus, fechaProgramada: fechaProgramada || null, responsableId: responsableId ? Number(responsableId) : null,
    }),
    onSuccess: () => { toast.success('Publicación actualizada'); invalidate() },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const eliminarMutation = useMutation({
    mutationFn: () => marketingService.eliminarPost(post!.id),
    onSuccess: () => { toast.success('Publicación eliminada'); invalidate(); onClose() },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const subirImagenMutation = useMutation({
    mutationFn: (file: File) => marketingService.subirImagenPost(post!.id, file),
    onSuccess: () => { toast.success('Imagen subida'); invalidate() },
    onError: () => toast.error('No se pudo subir la imagen'),
  })

  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) subirImagenMutation.mutate(file)
    }
    input.click()
  }

  if (!post) return null

  return (
    <Modal isOpen={!!post} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-ink">Editar publicación</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!titulo.trim() || !cuentaId) return; guardarMutation.mutate() }}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título / idea</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Contenido</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} value={contenido} onChange={(e) => setContenido(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Cuenta</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required>
                <option value="">Selecciona una cuenta</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{RED_LABEL[c.red]} · {c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Campaña (opcional)</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={campaniaId} onChange={(e) => setCampaniaId(e.target.value)}>
                <option value="">Sin campaña</option>
                {campanias?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Estatus</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={estatus} onChange={(e) => setEstatus(e.target.value as EstatusPost)}>
                {(Object.keys(ESTATUS_CONFIG) as EstatusPost[]).map((s) => <option key={s} value={s}>{ESTATUS_CONFIG[s].label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha programada</label>
              <input type="datetime-local" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaProgramada} onChange={(e) => setFechaProgramada(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Imagen</label>
            {post.imagenArchivo ? (
              <img src={marketingService.getUrlVerImagen(post.id)} alt={post.imagenOriginal || ''} className="mb-2 h-32 w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-300">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={pickFile} isLoading={subirImagenMutation.isPending}>
              <Upload className="h-3.5 w-3.5" /> {post.imagenArchivo ? 'Reemplazar imagen' : 'Subir imagen'}
            </Button>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => eliminarMutation.mutate()} isLoading={eliminarMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="submit" isLoading={guardarMutation.isPending}>Guardar</Button>
            </div>
          </div>
        </form>

        {estatus === 'publicado' && <MetricasSection postId={post.id} />}
      </div>
    </Modal>
  )
}

// ── Modal nuevo post ──────────────────────────────────────────────────────
function NuevoPostModal({ isOpen, onClose, cuentas }: { isOpen: boolean; onClose: () => void; cuentas: CuentaRedSocial[] }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const { data: campanias } = useQuery({ queryKey: ['marketing-campanias'], queryFn: () => marketingService.getCampanias() })

  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [campaniaId, setCampaniaId] = useState('')
  const [fechaProgramada, setFechaProgramada] = useState('')
  const [responsableId, setResponsableId] = useState('')

  const reset = () => { setTitulo(''); setContenido(''); setCuentaId(''); setCampaniaId(''); setFechaProgramada(''); setResponsableId('') }

  const mutation = useMutation({
    mutationFn: () => marketingService.crearPost({
      cuentaId: Number(cuentaId), campaniaId: campaniaId ? Number(campaniaId) : undefined, titulo, contenido: contenido || undefined,
      estatus: fechaProgramada ? 'programado' : 'borrador', fechaProgramada: fechaProgramada || undefined,
      responsableId: responsableId ? Number(responsableId) : undefined,
    }),
    onSuccess: () => {
      toast.success('Publicación creada')
      queryClient.invalidateQueries({ queryKey: ['marketing-redes-posts'] })
      queryClient.invalidateQueries({ queryKey: ['marketing-redes-dashboard'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo crear la publicación'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva publicación" variant="corporate" size="lg">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!titulo.trim() || !cuentaId) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título / idea</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Post de lanzamiento de producto" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Contenido</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder="Texto de la publicación (opcional)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Cuenta</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required>
              <option value="">Selecciona una cuenta</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{RED_LABEL[c.red]} · {c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Campaña (opcional)</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={campaniaId} onChange={(e) => setCampaniaId(e.target.value)}>
              <option value="">Sin campaña</option>
              {campanias?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha programada</label>
            <input type="datetime-local" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaProgramada} onChange={(e) => setFechaProgramada(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Crear publicación</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Tarjeta de post ───────────────────────────────────────────────────────
function PostCard({ post, onClick }: { post: PostRedSocial; onClick: () => void }) {
  const estCfg = ESTATUS_CONFIG[post.estatus]
  const fecha = post.fechaProgramada || post.createdAt
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      {post.imagenArchivo ? (
        <img src={marketingService.getUrlVerImagen(post.id)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-300">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={clsx('chip', RED_COLOR[post.red])}>{RED_LABEL[post.red]}</span>
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', estCfg.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
          </span>
        </div>
        <h3 className="truncate text-sm font-semibold text-ink">{post.titulo}</h3>
        <p className="text-[11px] text-ink-tertiary">
          {post.cuentaNombre} · {new Date(fecha).toLocaleString()}
          {post.responsableNombre ? ` · ${post.responsableNombre}` : ''}
        </p>
      </div>
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export function RedesSocialesPage() {
  return <EnConstruccion titulo="Redes Sociales" subtitulo="Cuentas y publicaciones programadas" />
}

function RedesSocialesPageContent() {
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [postActivo, setPostActivo] = useState<PostRedSocial | null>(null)
  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusPost | ''>('')

  const { data: dashboard } = useQuery({ queryKey: ['marketing-redes-dashboard'], queryFn: () => marketingService.getDashboardRedes(), staleTime: 30_000 })
  const { data: cuentas } = useQuery({ queryKey: ['marketing-redes-cuentas'], queryFn: () => marketingService.listCuentas(), staleTime: 30_000 })
  const { data: posts, isLoading } = useQuery({ queryKey: ['marketing-redes-posts'], queryFn: () => marketingService.listPosts(), staleTime: 30_000 })

  const cuentasActivas = useMemo(() => (cuentas || []).filter((c) => c.activa), [cuentas])

  const postsFiltrados = useMemo(() => {
    return (posts || []).filter((p) => {
      if (filtroCuenta && String(p.cuentaId) !== filtroCuenta) return false
      if (filtroEstatus && p.estatus !== filtroEstatus) return false
      return true
    })
  }, [posts, filtroCuenta, filtroEstatus])

  const stats: DashboardStat[] = dashboard ? [
    { key: 'programados', icon: Calendar, label: 'Programados este mes', value: dashboard.postsProgramadosMes, tone: 'warn' },
    { key: 'publicados', icon: Share2, label: 'Publicados este mes', value: dashboard.postsPublicadosMes, tone: 'success' },
    { key: 'cuentas', icon: Users2, label: 'Cuentas activas', value: dashboard.cuentasActivas, tone: 'brand' },
    { key: 'alcance', icon: TrendingUp, label: 'Alcance del mes', value: dashboard.alcanceTotalMes, tone: 'brand' },
  ] : []

  const hayFiltrosActivos = !!filtroCuenta || !!filtroEstatus

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Share2 className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Redes sociales</h1>
            <p className="text-xs text-blue-200/70">Calendario de publicaciones y desempeño por red social</p>
          </div>
        </div>
      </div>

      {dashboard && <DashboardStatRow stats={stats} />}

      <CuentasSection cuentas={cuentas || []} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Publicaciones</h2>
        <Button size="sm" onClick={() => setNuevoOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nueva publicación
        </Button>
      </div>

      {posts && posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3">
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)}>
            <option value="">Todas las cuentas</option>
            {cuentas?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as EstatusPost | '')}>
            <option value="">Todos los estatus</option>
            {(Object.keys(ESTATUS_CONFIG) as EstatusPost[]).map((s) => <option key={s} value={s}>{ESTATUS_CONFIG[s].label}</option>)}
          </select>
          {hayFiltrosActivos && (
            <button onClick={() => { setFiltroCuenta(''); setFiltroEstatus('') }} className="ml-auto text-[11px] font-semibold text-brand hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !posts || posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay publicaciones registradas.</p>
        </div>
      ) : postsFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Ninguna publicación coincide con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {postsFiltrados.map((p) => (
            <PostCard key={p.id} post={p} onClick={() => setPostActivo(p)} />
          ))}
        </div>
      )}

      <NuevoPostModal isOpen={nuevoOpen} onClose={() => setNuevoOpen(false)} cuentas={cuentasActivas} />
      <PostDetalleModal post={postActivo} cuentas={cuentasActivas} onClose={() => setPostActivo(null)} />
    </div>
  )
}
