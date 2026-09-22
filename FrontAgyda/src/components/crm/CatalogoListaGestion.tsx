import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, Pencil, Ban, CheckCircle2, Check, X } from 'lucide-react'
import type { CatalogoClienteItem } from '@/types/crmCatalogosCliente.types'

export interface CatalogoService {
  list(incluirInactivas?: boolean): Promise<CatalogoClienteItem[]>
  crear(payload: { clave: string; nombre: string; orden?: number }): Promise<void>
  actualizar(id: number, payload: { nombre: string; orden?: number }): Promise<void>
  toggleActiva(id: number): Promise<void>
}

function ItemRow({ item, service, queryKey }: { item: CatalogoClienteItem; service: CatalogoService; queryKey: string }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(item.nombre)

  const guardar = useMutation({
    mutationFn: () => service.actualizar(item.id, { nombre: nombre.trim(), orden: item.orden }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      setEditando(false)
      toast.success('Actualizado')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const toggle = useMutation({
    mutationFn: () => service.toggleActiva(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      toast.success(item.activa ? 'Desactivado' : 'Activado')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  if (editando) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 bg-card px-2.5 py-1.5 text-sm outline-none focus:border-violet-500"
          maxLength={100}
          autoFocus
        />
        <button onClick={() => guardar.mutate()} disabled={!nombre.trim() || guardar.isPending} className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => { setEditando(false); setNombre(item.nombre) }} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className={clsx('flex items-center justify-between gap-2 rounded-xl border px-3 py-2', item.activa ? 'border-gray-100' : 'border-gray-100 opacity-50')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
        <code className="text-[0.65rem] text-gray-400">{item.clave}</code>
      </div>
      <div className="flex flex-shrink-0 gap-1">
        <button onClick={() => setEditando(true)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => toggle.mutate()} title={item.activa ? 'Desactivar' : 'Activar'} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          {item.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

function NuevoItemForm({ service, queryKey }: { service: CatalogoService; queryKey: string }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')

  const crear = useMutation({
    mutationFn: () => service.crear({ clave: nombre.trim(), nombre: nombre.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      setNombre('')
      toast.success('Creado')
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo crear'),
  })

  return (
    <div className="flex items-center gap-2">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre nuevo…"
        className="field flex-1"
        maxLength={100}
        onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) crear.mutate() }}
      />
      <button
        type="button"
        onClick={() => crear.mutate()}
        disabled={!nombre.trim() || crear.isPending}
        className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar
      </button>
    </div>
  )
}

// Bloque compartido: alta rápida + lista con edición inline + activar/
// desactivar de un catálogo simple (clave/nombre/orden/activa). Usado por
// las pantallas de catálogo en Configuración y por las pestañas de
// selección de catálogo dentro del expediente de un cliente.
export function CatalogoListaGestion({ items, isLoading, service, queryKey }: {
  items: CatalogoClienteItem[]
  isLoading: boolean
  service: CatalogoService
  queryKey: string
}) {
  return (
    <div className="space-y-3">
      <NuevoItemForm service={service} queryKey={queryKey} />

      {isLoading ? (
        <p className="text-sm text-ink-tertiary py-4 text-center">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-tertiary py-6 text-center">Sin registros — agrega el primero arriba.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => <ItemRow key={item.id} item={item} service={service} queryKey={queryKey} />)}
        </div>
      )}
    </div>
  )
}
