import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Tags, Plus, Trash2, Loader2, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { casoService } from '@/services/caso.service'
import { PRIORIDAD_CASO_CONFIG, type CasoPrioridad, type CasoCategoria, type CasoSubcategoria } from '@/types/caso.types'

const PRIORIDADES: CasoPrioridad[] = ['baja', 'media', 'alta', 'critica']

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card px-3.5 py-2.5 text-[0.88rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

// Catálogo de categorías → subcategorías de casos/incidencias que ven tanto
// el formulario interno (Nuevo caso) como el Portal de Cliente (Nueva
// solicitud). La categoría solo agrupa; la prioridad que se asigna
// automáticamente al crear un caso vive en la subcategoría.
export function CategoriasCasoConfigTab() {
  const qc = useQueryClient()
  const { data: categorias = [], isLoading } = useQuery({
    queryKey: ['categorias-caso'],
    queryFn: () => casoService.getCategorias(),
  })

  const [expandido, setExpandido] = useState<Set<number>>(new Set())
  const [nombreCatNueva, setNombreCatNueva] = useState('')
  const [subNueva, setSubNueva] = useState<Record<number, { nombre: string; prioridad: CasoPrioridad }>>({})

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['categorias-caso'] })
    qc.invalidateQueries({ queryKey: ['categorias-caso-activas'] })
    qc.invalidateQueries({ queryKey: ['portal-categorias-caso'] })
  }

  const toggleExpandido = (id: number) => {
    setExpandido((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const crearCategoria = useMutation({
    mutationFn: () => casoService.createCategoria({ nombre: nombreCatNueva.trim(), orden: categorias.length }),
    onSuccess: (_r, _v) => {
      invalidar()
      setNombreCatNueva('')
      toast.success('Categoría agregada')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo agregar la categoría'),
  })

  const actualizarCategoria = useMutation({
    mutationFn: (body: { id: number; activo?: boolean; nombre?: string }) => casoService.updateCategoria(body.id, body),
    onSuccess: invalidar,
    onError: () => toast.error('No se pudo actualizar la categoría'),
  })

  const eliminarCategoria = useMutation({
    mutationFn: (id: number) => casoService.deleteCategoria(id),
    onSuccess: () => { invalidar(); toast.success('Categoría eliminada') },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo eliminar: primero elimina sus subcategorías'),
  })

  const crearSubcategoria = useMutation({
    mutationFn: ({ categoriaId, nombre, prioridad }: { categoriaId: number; nombre: string; prioridad: CasoPrioridad }) =>
      casoService.createSubcategoria(categoriaId, { nombre, prioridad }),
    onSuccess: (_r, vars) => {
      invalidar()
      setSubNueva((prev) => ({ ...prev, [vars.categoriaId]: { nombre: '', prioridad: 'media' } }))
      toast.success('Subcategoría agregada')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo agregar la subcategoría'),
  })

  const actualizarSubcategoria = useMutation({
    mutationFn: (body: { id: number; prioridad?: CasoPrioridad; activo?: boolean }) => casoService.updateSubcategoria(body.id, body),
    onSuccess: invalidar,
    onError: () => toast.error('No se pudo actualizar la subcategoría'),
  })

  const eliminarSubcategoria = useMutation({
    mutationFn: (id: number) => casoService.deleteSubcategoria(id),
    onSuccess: () => { invalidar(); toast.success('Subcategoría eliminada') },
    onError: () => toast.error('No se pudo eliminar la subcategoría'),
  })

  const setSubCampo = (categoriaId: number, campo: 'nombre' | 'prioridad', valor: string) =>
    setSubNueva((prev) => ({
      ...prev,
      [categoriaId]: { nombre: prev[categoriaId]?.nombre ?? '', prioridad: prev[categoriaId]?.prioridad ?? 'media', [campo]: valor },
    }))

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Tags className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Categorías de casos</h2>
            <p className="text-[0.82rem] text-gray-400">
              El cliente elige categoría y subcategoría al crear una solicitud desde el Portal; la prioridad se asigna automáticamente según la subcategoría.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : (
        <div className="space-y-3">
          {categorias.map((cat: CasoCategoria) => {
            const abierto = expandido.has(cat.id)
            const nueva = subNueva[cat.id] ?? { nombre: '', prioridad: 'media' as CasoPrioridad }
            return (
              <section key={cat.id} className={clsx('rounded-2xl border border-gray-100 bg-card shadow-card', !cat.activo && 'opacity-50')}>
                <div className="flex items-center gap-3 p-4">
                  <button type="button" onClick={() => toggleExpandido(cat.id)} className="text-gray-400 hover:text-gray-600">
                    {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <span className="flex-1 text-[0.95rem] font-bold text-gray-900">{cat.nombre}</span>
                  <span className="text-[0.72rem] text-gray-400">{cat.subcategorias.length} subcategoría{cat.subcategorias.length !== 1 ? 's' : ''}</span>
                  <button
                    type="button"
                    onClick={() => actualizarCategoria.mutate({ id: cat.id, activo: !cat.activo })}
                    className={clsx('relative h-5 w-9 flex-shrink-0 rounded-full border-0 p-0 transition-colors', cat.activo ? 'bg-violet-600' : 'bg-gray-300')}
                    title={cat.activo ? 'Desactivar' : 'Activar'}
                  >
                    <span className={clsx('absolute left-[3px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-transform', cat.activo ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (cat.subcategorias.length > 0) { toast.error('Elimina primero sus subcategorías'); return }
                      if (confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) eliminarCategoria.mutate(cat.id)
                    }}
                    className="text-gray-300 hover:text-red-500"
                    title="Eliminar categoría"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {abierto && (
                  <div className="space-y-2 border-t border-gray-100 p-4">
                    {cat.subcategorias.map((sub: CasoSubcategoria) => (
                      <div key={sub.id} className={clsx('flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5', !sub.activo && 'opacity-50')}>
                        <span className="flex-1 truncate text-sm font-semibold text-gray-800">{sub.nombre}</span>
                        <select
                          value={sub.prioridad}
                          onChange={(e) => actualizarSubcategoria.mutate({ id: sub.id, prioridad: e.target.value as CasoPrioridad })}
                          className={clsx('rounded-lg border-0 px-2 py-1 text-xs font-semibold', PRIORIDAD_CASO_CONFIG[sub.prioridad].bg, PRIORIDAD_CASO_CONFIG[sub.prioridad].text)}
                        >
                          {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD_CASO_CONFIG[p].label}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => actualizarSubcategoria.mutate({ id: sub.id, activo: !sub.activo })}
                          className={clsx('relative h-5 w-9 flex-shrink-0 rounded-full border-0 p-0 transition-colors', sub.activo ? 'bg-violet-600' : 'bg-gray-300')}
                          title={sub.activo ? 'Desactivar' : 'Activar'}
                        >
                          <span className={clsx('absolute left-[3px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-transform', sub.activo ? 'translate-x-4' : 'translate-x-0')} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (confirm(`¿Eliminar la subcategoría "${sub.nombre}"?`)) eliminarSubcategoria.mutate(sub.id) }}
                          className="text-gray-300 hover:text-red-500"
                          title="Eliminar subcategoría"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={nueva.nombre}
                        onChange={(e) => setSubCampo(cat.id, 'nombre', e.target.value)}
                        placeholder="Nueva subcategoría"
                        maxLength={80}
                        className={inputCls}
                      />
                      <select
                        value={nueva.prioridad}
                        onChange={(e) => setSubCampo(cat.id, 'prioridad', e.target.value)}
                        className="w-36 flex-shrink-0 rounded-xl border border-gray-200 bg-card px-2 py-2.5 text-[0.82rem]"
                      >
                        {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD_CASO_CONFIG[p].label}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={!nueva.nombre.trim() || crearSubcategoria.isPending}
                        onClick={() => crearSubcategoria.mutate({ categoriaId: cat.id, nombre: nueva.nombre.trim(), prioridad: nueva.prioridad })}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                      >
                        {crearSubcategoria.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )
          })}

          {categorias.length === 0 && <p className="text-sm text-gray-400">Aún no hay categorías.</p>}
        </div>
      )}

      <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <p className="mb-3 text-[0.95rem] font-bold text-gray-900">Nueva categoría</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nombreCatNueva}
            onChange={(e) => setNombreCatNueva(e.target.value)}
            placeholder="Ej. Ventas"
            maxLength={80}
            className={inputCls}
          />
          <button
            type="button"
            disabled={!nombreCatNueva.trim() || crearCategoria.isPending}
            onClick={() => crearCategoria.mutate()}
            className="flex h-10 flex-shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 text-[0.8rem] font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {crearCategoria.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Agregar
          </button>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl bg-violet-500/10 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-600">
          Solo las categorías activas con al menos una subcategoría activa aparecen en el formulario de nueva solicitud (interno y Portal de Cliente).
        </p>
      </div>
    </div>
  )
}
