import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Palette, Plus, Trash2, X, FileText, Search, Download } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  imagenCorporativaService,
  type AssetMarca,
  type CategoriaAsset,
} from '@/services/imagenCorporativa.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EnConstruccion } from '@/components/ui/EnConstruccion'
import { useAuthStore } from '@/stores/auth.store'

const CATEGORIA_LABEL: Record<CategoriaAsset, string> = {
  logo: 'Logo', paleta: 'Paleta de colores', tipografia: 'Tipografía', plantilla: 'Plantilla', manual: 'Manual de marca', otro: 'Otro',
}

const CATEGORIA_COLOR: Record<CategoriaAsset, string> = {
  logo: 'bg-blue-50 text-blue-700', paleta: 'bg-pink-50 text-pink-700', tipografia: 'bg-purple-50 text-purple-700',
  plantilla: 'bg-amber-100 text-amber-700', manual: 'bg-emerald-100 text-emerald-700', otro: 'bg-gray-100 text-gray-600',
}

const ADMIN_ROLES = ['ADMINISTRADOR', 'ADMIN', 'AD', 'ADM']

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Modal de subida ────────────────────────────────────────────────────────
function SubirAssetModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAsset>('logo')
  const [descripcion, setDescripcion] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const reset = () => { setTitulo(''); setCategoria('logo'); setDescripcion(''); setFile(null) }

  const mutation = useMutation({
    mutationFn: () => imagenCorporativaService.subirAsset(titulo, categoria, descripcion || undefined, file!),
    onSuccess: () => {
      toast.success('Asset subido')
      queryClient.invalidateQueries({ queryKey: ['imagen-corporativa-assets'] })
      reset()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir el asset')
    },
  })

  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,image/svg+xml,application/pdf'
    input.onchange = () => setFile(input.files?.[0] || null)
    input.click()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Subir asset de marca" variant="corporate" size="md">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!titulo.trim() || !file) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Logo principal - versión clara" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Categoría</label>
          <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaAsset)}>
            {(Object.keys(CATEGORIA_LABEL) as CategoriaAsset[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción (opcional)</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Archivo</label>
          {file ? (
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
              <span className="flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={pickFile}>Seleccionar archivo</Button>
          )}
          <p className="mt-1 text-[11px] text-ink-tertiary">JPG, PNG, WEBP, SVG o PDF · máx. 10MB</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Subir</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Tarjeta de asset ──────────────────────────────────────────────────────
function AssetCard({ asset, esAdmin, onEliminar }: { asset: AssetMarca; esAdmin: boolean; onEliminar: () => void }) {
  const esImagen = asset.mime?.startsWith('image/')
  const url = imagenCorporativaService.getUrlVerAsset(asset.id)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      {esAdmin && (
        <button
          onClick={onEliminar}
          title="Eliminar"
          className="absolute right-2 top-2 z-10 rounded-lg bg-white/90 p-1.5 text-gray-400 opacity-0 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button onClick={() => window.open(url, '_blank')} className="flex h-32 w-full items-center justify-center bg-gray-50">
        {esImagen ? (
          <img src={url} alt={asset.titulo} className="h-full w-full object-contain p-3" />
        ) : (
          <FileText className="h-10 w-10 text-gray-300" />
        )}
      </button>
      <div className="p-3">
        <span className={clsx('chip mb-1 inline-flex w-fit', CATEGORIA_COLOR[asset.categoria])}>{CATEGORIA_LABEL[asset.categoria]}</span>
        <h3 className="truncate text-sm font-semibold text-ink" title={asset.titulo}>{asset.titulo}</h3>
        {asset.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-ink-tertiary">{asset.descripcion}</p>}
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-tertiary">
          <span>{formatBytes(asset.tamanio)}</span>
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-brand hover:underline">
            <Download className="h-3 w-3" /> Descargar
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export function ImagenCorporativaPage() {
  return <EnConstruccion titulo="Imagen Corporativa" subtitulo="Logos, paletas y manual de marca" />
}

function ImagenCorporativaPageContent() {
  const [subirOpen, setSubirOpen] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaAsset | ''>('')
  const [busqueda, setBusqueda] = useState('')
  const queryClient = useQueryClient()

  const rol = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase() ?? '')
  const esAdmin = ADMIN_ROLES.includes(rol)

  const { data, isLoading } = useQuery({
    queryKey: ['imagen-corporativa-assets'],
    queryFn: () => imagenCorporativaService.listAssets(),
    staleTime: 30_000,
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => imagenCorporativaService.eliminarAsset(id),
    onSuccess: () => {
      toast.success('Asset eliminado')
      queryClient.invalidateQueries({ queryKey: ['imagen-corporativa-assets'] })
    },
    onError: () => toast.error('No se pudo eliminar el asset'),
  })

  const assetsFiltrados = useMemo(() => {
    return (data || []).filter((a) => {
      if (filtroCategoria && a.categoria !== filtroCategoria) return false
      if (busqueda && !a.titulo.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
  }, [data, filtroCategoria, busqueda])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Palette className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Imagen corporativa</h1>
            <p className="text-xs text-blue-200/70">Logos, paleta de colores, tipografías, plantillas y manual de marca</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              className="rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título..."
            />
          </div>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value as CategoriaAsset | '')}>
            <option value="">Todas las categorías</option>
            {(Object.keys(CATEGORIA_LABEL) as CategoriaAsset[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </div>
        {esAdmin && (
          <Button size="sm" onClick={() => setSubirOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Subir asset
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay assets de marca registrados.</p>
        </div>
      ) : assetsFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Ningún asset coincide con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {assetsFiltrados.map((a) => (
            <AssetCard key={a.id} asset={a} esAdmin={esAdmin} onEliminar={() => eliminarMutation.mutate(a.id)} />
          ))}
        </div>
      )}

      {esAdmin && <SubirAssetModal isOpen={subirOpen} onClose={() => setSubirOpen(false)} />}
    </div>
  )
}
