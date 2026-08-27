import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Ban, CheckCircle2, MapPin } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { catalogosTiService } from '@/services/catalogosTi.service'
import type { Sede } from '@/types/catalogosTi.types'

function SedeRow({ sede }: { sede: Sede }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(sede.nombre)
  const [direccion, setDireccion] = useState(sede.direccion ?? '')

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateSede(sede.id, { nombre: nombre.trim(), direccion: direccion.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-sedes'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar la sede'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleSedeActiva(sede.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-sedes'] }),
  })

  if (editando) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <input className="field flex-1 py-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        <input className="field flex-1 py-1 text-sm" placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          Guardar
        </button>
        <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface">
      <MapPin className="h-4 w-4 shrink-0 text-ink-tertiary" />
      <span className={clsx('flex-1 font-medium', !sede.activa && 'text-ink-tertiary line-through')}>{sede.nombre}</span>
      <span className="flex-1 text-xs text-ink-tertiary">{sede.direccion ?? '—'}</span>
      <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        className={clsx('hover:opacity-70', sede.activa ? 'text-red-400' : 'text-green-500')}
        onClick={() => toggle.mutate()}
        title={sede.activa ? 'Desactivar' : 'Activar'}
      >
        {sede.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function CatalogosTab() {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')

  const { data: sedes = [], isLoading } = useQuery({
    queryKey: ['catalogos-ti-sedes'],
    queryFn: () => catalogosTiService.getSedes(true),
  })

  const crear = useMutation({
    mutationFn: () => catalogosTiService.createSede({ nombre: nombre.trim(), direccion: direccion.trim() || undefined }),
    onSuccess: () => {
      setNombre('')
      setDireccion('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-sedes'] })
    },
    onError: () => toast.error('No se pudo crear la sede'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Sedes</p>
        <p className="mb-3 text-xs text-ink-tertiary">
          Ubicaciones físicas usadas para asignar tickets a técnicos con cobertura en esa sede.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {sedes.map((s) => <SedeRow key={s.id} sede={s} />)}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input className="field flex-1 text-sm" placeholder="Nombre de la sede" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input className="field flex-1 text-sm" placeholder="Dirección (opcional)" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!nombre.trim() || crear.isPending}
            onClick={() => crear.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="text-sm font-semibold text-ink">Activos</p>
        <p className="mt-1 text-xs text-ink-tertiary">
          El catálogo de activos generales (equipos, licencias) se administra en su propio módulo.
        </p>
        <a href="/activos" className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">
          Ir a Activos →
        </a>
      </div>
    </div>
  )
}
