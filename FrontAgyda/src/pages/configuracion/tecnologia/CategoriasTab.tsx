import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Ban, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { catalogosTiService } from '@/services/catalogosTi.service'
import type { CategoriaConSubcategorias } from '@/types/catalogosTi.types'

function SubcategoriaRow({ categoriaId, sub }: { categoriaId: number; sub: CategoriaConSubcategorias['subcategorias'][number] }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(sub.nombre)

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateSubcategoria(sub.id, { nombre: nombre.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar la subcategoría'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleSubcategoriaActiva(sub.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] }),
  })

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 pl-8 text-sm hover:bg-surface">
      {editando ? (
        <>
          <input
            className="field flex-1 py-1 text-sm"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
          <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            Guardar
          </button>
          <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => { setEditando(false); setNombre(sub.nombre) }}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <span className={clsx('flex-1', !sub.activa && 'text-ink-tertiary line-through')}>{sub.nombre}</span>
          <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className={clsx('hover:opacity-70', sub.activa ? 'text-red-400' : 'text-green-500')}
            onClick={() => toggle.mutate()}
            title={sub.activa ? 'Desactivar' : 'Activar'}
          >
            {sub.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  )
}

function CategoriaRow({ categoria }: { categoria: CategoriaConSubcategorias }) {
  const qc = useQueryClient()
  const [abierta, setAbierta] = useState(true)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(categoria.nombre)
  const [nuevaSub, setNuevaSub] = useState('')

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateCategoria(categoria.id, { nombre: nombre.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar la categoría'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleCategoriaActiva(categoria.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] }),
  })

  const crearSub = useMutation({
    mutationFn: () => catalogosTiService.createSubcategoria({ categoriaId: categoria.id, nombre: nuevaSub.trim() }),
    onSuccess: () => {
      setNuevaSub('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] })
    },
    onError: () => toast.error('No se pudo crear la subcategoría'),
  })

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2 px-2 py-2">
        <button className="text-ink-tertiary" onClick={() => setAbierta((v) => !v)}>
          {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {editando ? (
          <>
            <input
              className="field flex-1 py-1 text-sm font-medium"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
            />
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              Guardar
            </button>
            <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => { setEditando(false); setNombre(categoria.nombre) }}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span className={clsx('flex-1 text-sm font-semibold', !categoria.activa && 'text-ink-tertiary line-through')}>
              {categoria.nombre}
            </span>
            <span className="text-xs text-ink-tertiary">{categoria.subcategorias.length} subcategorías</span>
            <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              className={clsx('hover:opacity-70', categoria.activa ? 'text-red-400' : 'text-green-500')}
              onClick={() => toggle.mutate()}
              title={categoria.activa ? 'Desactivar' : 'Activar'}
            >
              {categoria.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>
      {abierta && (
        <div className="pb-2">
          {categoria.subcategorias.map((s) => (
            <SubcategoriaRow key={s.id} categoriaId={categoria.id} sub={s} />
          ))}
          <div className="flex items-center gap-2 px-2 py-1.5 pl-8">
            <input
              className="field flex-1 py-1 text-sm"
              placeholder="Nueva subcategoría..."
              value={nuevaSub}
              onChange={(e) => setNuevaSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nuevaSub.trim()) crearSub.mutate() }}
            />
            <button
              className="btn-secondary px-2 py-1 text-xs"
              disabled={!nuevaSub.trim() || crearSub.isPending}
              onClick={() => crearSub.mutate()}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CategoriasTab() {
  const qc = useQueryClient()
  const [nuevaCategoria, setNuevaCategoria] = useState('')

  const { data: categorias = [], isLoading } = useQuery({
    queryKey: ['catalogos-ti-categorias'],
    queryFn: () => catalogosTiService.getCategorias(true),
  })

  const crearCategoria = useMutation({
    mutationFn: () => catalogosTiService.createCategoria({ nombre: nuevaCategoria.trim() }),
    onSuccess: () => {
      setNuevaCategoria('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] })
    },
    onError: () => toast.error('No se pudo crear la categoría'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Categorías y subcategorías</p>
        <p className="mb-3 text-xs text-ink-tertiary">
          Árbol usado al crear/clasificar tickets. Desactivar una categoría la oculta de los formularios
          sin borrar el histórico de tickets que ya la usan.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {categorias.map((c) => (
              <CategoriaRow key={c.id} categoria={c} />
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input
            className="field flex-1 text-sm"
            placeholder="Nueva categoría..."
            value={nuevaCategoria}
            onChange={(e) => setNuevaCategoria(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nuevaCategoria.trim()) crearCategoria.mutate() }}
          />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!nuevaCategoria.trim() || crearCategoria.isPending}
            onClick={() => crearCategoria.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
