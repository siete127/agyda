import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Search, Plus, Pencil, Archive, HelpCircle, FileText } from 'lucide-react'
import { kbService, KB_TIPO_LABELS, type KbArticulo, type KbTipo } from '@/services/kb.service'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TICKET_CATEGORIAS } from '@/constants/ticketCategorias'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const TIPOS: KbTipo[] = ['articulo', 'faq']

function ArticuloModal({ articulo, onClose }: { articulo: KbArticulo | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState(articulo?.titulo ?? '')
  const [contenido, setContenido] = useState(articulo?.contenido ?? '')
  const [categoria, setCategoria] = useState(articulo?.categoria ?? '')
  const [tipo, setTipo] = useState<KbTipo>(articulo?.tipo ?? 'articulo')

  const guardar = useMutation({
    mutationFn: async () => {
      if (articulo) await kbService.update(articulo.id, { titulo, contenido, categoria: categoria || undefined, tipo })
      else await kbService.create({ titulo, contenido, categoria: categoria || undefined, tipo })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-articulos'] })
      toast.success(articulo ? 'Artículo actualizado' : 'Artículo creado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el artículo'),
  })

  return (
    <Modal isOpen onClose={onClose} title={articulo ? 'Editar contenido' : 'Nuevo contenido'} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Tipo</label>
          <div className="flex gap-2">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={clsx(
                  'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                  tipo === t ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {KB_TIPO_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">
            {tipo === 'faq' ? 'Pregunta' : 'Título'}
          </label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder={tipo === 'faq' ? '¿Cómo restablezco mi contraseña?' : 'Título del artículo'} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Categoría</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field">
            <option value="">Sin categoría</option>
            {TICKET_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">
            {tipo === 'faq' ? 'Respuesta' : 'Contenido'}
          </label>
          <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={8} className="field resize-none" placeholder="Solución, pasos, referencias..." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!titulo.trim() || !contenido.trim()} onClick={() => guardar.mutate()}>
            {articulo ? 'Guardar cambios' : 'Crear'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function KbPage() {
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<KbTipo | ''>('')
  const [editing, setEditing] = useState<KbArticulo | null | 'nuevo'>(null)
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isTI = ['AD', 'TI', 'ST'].includes(user?.tipoUsuario?.toUpperCase() ?? '')

  const { data: articulos = [], isLoading } = useQuery({
    queryKey: ['kb-articulos', q, categoria, tipoFiltro],
    queryFn: () => kbService.getArticulos({ q: q || undefined, categoria: categoria || undefined, tipo: tipoFiltro || undefined }),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => kbService.toggleActivo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-articulos'] })
      toast.success('Estado actualizado')
    },
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
        <div className="relative overflow-hidden px-6 py-5" style={{ background: 'linear-gradient(135deg, #0B1730 0%, #14274E 100%)' }}>
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <BookOpen className="h-5 w-5 text-brand-muted" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Base de Conocimiento</h1>
                <p className="mt-0.5 text-xs text-white/50">{articulos.length} artículos</p>
              </div>
            </div>
            {isTI && (
              <Button onClick={() => setEditing('nuevo')} className="bg-white !text-brand hover:bg-surface !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Nuevo contenido
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-surface-border px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar artículos..." className="field py-2 pl-9 text-sm" />
          </div>
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as KbTipo | '')} className="field py-2 text-sm sm:w-40">
            <option value="">Artículos y FAQs</option>
            {TIPOS.map((t) => <option key={t} value={t}>{KB_TIPO_LABELS[t]}</option>)}
          </select>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field py-2 text-sm sm:w-56">
            <option value="">Todas las categorías</option>
            {TICKET_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="p-5">
          {isLoading ? (
            <p className="text-sm text-ink-tertiary">Cargando...</p>
          ) : articulos.length === 0 ? (
            <p className="text-sm text-ink-tertiary text-center py-8">Sin artículos aún</p>
          ) : (
            <div className="space-y-2">
              {articulos.map((a) => (
                <div key={a.id} className="rounded-xl border border-surface-border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold',
                          a.tipo === 'faq' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
                        )}>
                          {a.tipo === 'faq' ? <HelpCircle className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
                          {KB_TIPO_LABELS[a.tipo]}
                        </span>
                        <h3 className="font-semibold text-ink">{a.titulo}</h3>
                        {a.categoria && <span className="chip bg-surface text-ink-secondary text-[0.62rem]">{a.categoria}</span>}
                      </div>
                      <p className={clsx('mt-1 text-[0.8rem] text-ink-secondary', 'line-clamp-2')}>{a.contenido}</p>
                      <p className="mt-1 text-[0.65rem] text-ink-tertiary">{a.autorNombre ?? 'Sistema'}</p>
                    </div>
                    {isTI && (
                      <div className="flex flex-shrink-0 gap-1">
                        <button onClick={() => setEditing(a)} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface hover:text-ink" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => toggle.mutate(a.id)} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface hover:text-ink" title="Archivar">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ArticuloModal articulo={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
