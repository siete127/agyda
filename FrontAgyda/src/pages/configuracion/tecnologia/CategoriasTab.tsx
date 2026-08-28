import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Ban, CheckCircle2, ChevronRight, ChevronDown, Trash2, ListChecks, X, Save } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { catalogosTiService } from '@/services/catalogosTi.service'
import { camposPersonalizadosService } from '@/services/camposPersonalizados.service'
import type { CategoriaConSubcategorias } from '@/types/catalogosTi.types'
import { TIPO_LABELS, type CampoPersonalizado, type CampoPersonalizadoTipo, type CampoPersonalizadoPayload } from '@/types/camposPersonalizados.types'

function ElementoRow({ elem }: { elem: CategoriaConSubcategorias['subcategorias'][number]['elementos'][number] }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(elem.nombre)

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateElemento(elem.id, { nombre: nombre.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar el elemento'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleElementoActiva(elem.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] }),
  })

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1 pl-14 text-xs hover:bg-surface">
      {editando ? (
        <>
          <input
            className="field flex-1 py-1 text-xs"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
          <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            Guardar
          </button>
          <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => { setEditando(false); setNombre(elem.nombre) }}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <span className={clsx('flex-1', !elem.activa && 'text-ink-tertiary line-through')}>{elem.nombre}</span>
          <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar">
            <Pencil className="h-3 w-3" />
          </button>
          <button
            className={clsx('hover:opacity-70', elem.activa ? 'text-red-400' : 'text-green-500')}
            onClick={() => toggle.mutate()}
            title={elem.activa ? 'Desactivar' : 'Activar'}
          >
            {elem.activa ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          </button>
        </>
      )}
    </div>
  )
}

function SubcategoriaRow({ categoriaId, sub }: { categoriaId: number; sub: CategoriaConSubcategorias['subcategorias'][number] }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(sub.nombre)
  const [abierta, setAbierta] = useState(false)
  const [nuevoElem, setNuevoElem] = useState('')

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

  const crearElem = useMutation({
    mutationFn: () => catalogosTiService.createElemento({ subcategoriaId: sub.id, nombre: nuevoElem.trim() }),
    onSuccess: () => {
      setNuevoElem('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-categorias'] })
    },
    onError: () => toast.error('No se pudo crear el elemento'),
  })

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 pl-8 text-sm hover:bg-surface">
        <button className="text-ink-tertiary" onClick={() => setAbierta((v) => !v)} title={abierta ? 'Ocultar elementos' : 'Ver elementos'}>
          {abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
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
            {sub.elementos.length > 0 && <span className="text-[0.65rem] text-ink-tertiary">{sub.elementos.length} elementos</span>}
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
      {abierta && (
        <div className="pb-1">
          {sub.elementos.map((el) => <ElementoRow key={el.id} elem={el} />)}
          <div className="flex items-center gap-2 px-2 py-1 pl-14">
            <input
              className="field flex-1 py-1 text-xs"
              placeholder="Nuevo elemento..."
              value={nuevoElem}
              onChange={(e) => setNuevoElem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nuevoElem.trim()) crearElem.mutate() }}
            />
            <button
              className="btn-secondary px-2 py-1 text-xs"
              disabled={!nuevoElem.trim() || crearElem.isPending}
              onClick={() => crearElem.mutate()}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
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

const TIPOS: CampoPersonalizadoTipo[] = ['texto', 'numero', 'lista', 'fecha']

function CampoFormModal({ campo, categorias, onClose }: { campo: CampoPersonalizado | null; categorias: CategoriaConSubcategorias[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CampoPersonalizadoPayload>({
    nombre: campo?.nombre ?? '',
    tipo: campo?.tipo ?? 'texto',
    opciones: campo?.opciones ?? [],
    requerido: campo?.requerido ?? false,
    categoriasIds: campo?.categorias.map((c) => c.id) ?? [],
  })
  const [opcionesTexto, setOpcionesTexto] = useState((campo?.opciones ?? []).join(', '))

  const guardar = useMutation({
    mutationFn: () => {
      const payload: CampoPersonalizadoPayload = {
        ...form,
        opciones: form.tipo === 'lista' ? opcionesTexto.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      }
      return campo ? camposPersonalizadosService.updateCampo(campo.id, payload) : camposPersonalizadosService.createCampo(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campos-personalizados'] })
      toast.success(campo ? 'Campo actualizado' : 'Campo creado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo guardar el campo'),
  })

  const toggleCategoria = (id: number) => {
    setForm((f) => ({
      ...f,
      categoriasIds: f.categoriasIds.includes(id) ? f.categoriasIds.filter((x) => x !== id) : [...f.categoriasIds, id],
    }))
  }

  const puedeGuardar = form.nombre.trim() && (form.tipo !== 'lista' || opcionesTexto.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-bold text-ink">{campo ? 'Editar campo' : 'Nuevo campo personalizado'}</p>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nombre</label>
            <input className="field mt-1 text-sm" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Número de serie" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Tipo</label>
              <select className="field mt-1 text-sm" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as CampoPersonalizadoTipo }))}>
                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requerido} onChange={(e) => setForm((f) => ({ ...f, requerido: e.target.checked }))} className="h-4 w-4" />
                Obligatorio
              </label>
            </div>
          </div>

          {form.tipo === 'lista' && (
            <div>
              <label className="text-xs font-medium text-gray-600">Opciones (separadas por coma)</label>
              <input className="field mt-1 text-sm" value={opcionesTexto} onChange={(e) => setOpcionesTexto(e.target.value)} placeholder="Windows 10, Windows 11, macOS" />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600">Categorías donde aparece</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategoria(cat.id)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.categoriasIds.includes(cat.id) ? 'bg-brand text-white' : 'bg-surface text-ink-secondary',
                  )}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>
            {form.categoriasIds.length === 0 && (
              <p className="mt-1 text-[0.7rem] text-amber-600">Sin categorías seleccionadas, este campo no aparecerá en ningún ticket.</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button className="px-3 py-1.5 text-xs text-ink-tertiary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!puedeGuardar || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export function CamposPersonalizadosPanel() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'crear' | CampoPersonalizado | null>(null)

  const { data: campos = [], isLoading } = useQuery({
    queryKey: ['campos-personalizados'],
    queryFn: () => camposPersonalizadosService.getCampos(true),
  })
  const { data: categorias = [] } = useQuery({
    queryKey: ['catalogos-ti-categorias'],
    queryFn: () => catalogosTiService.getCategorias(),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => camposPersonalizadosService.toggleCampoActivo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campos-personalizados'] }),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => camposPersonalizadosService.deleteCampo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campos-personalizados'] })
      toast.success('Campo eliminado')
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo eliminar'),
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Campos personalizados</p>
        </div>
        <button className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs" onClick={() => setModal('crear')}>
          <Plus className="h-3.5 w-3.5" /> Nuevo campo
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-tertiary">
        Campos extra (texto, número, lista o fecha) que aparecen en el formulario de creación de ticket
        solo para las categorías seleccionadas.
      </p>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : campos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-tertiary">Sin campos personalizados configurados.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {campos.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-2.5">
              <div className="flex-1">
                <p className={clsx('text-sm font-medium', !c.activo && 'text-ink-tertiary line-through')}>
                  {c.nombre} {c.requerido && <span className="text-red-500">*</span>}
                </p>
                <p className="text-xs text-ink-tertiary">
                  {TIPO_LABELS[c.tipo]} · {c.categorias.length ? c.categorias.map((cat) => cat.nombre).join(', ') : 'Sin categorías (no aparece en ningún ticket)'}
                </p>
              </div>
              <button className="text-ink-tertiary hover:text-brand" onClick={() => setModal(c)} title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                className={clsx('hover:opacity-70', c.activo ? 'text-red-400' : 'text-green-500')}
                onClick={() => toggle.mutate(c.id)}
                title={c.activo ? 'Desactivar' : 'Activar'}
              >
                {c.activo ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
              <button
                className="text-ink-tertiary hover:text-red-500"
                onClick={() => { if (confirm(`¿Eliminar el campo "${c.nombre}"?`)) eliminar.mutate(c.id) }}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && <CampoFormModal campo={modal === 'crear' ? null : modal} categorias={categorias} onClose={() => setModal(null)} />}
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
