import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, UsersRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { ticketsService } from '@/services/tickets.service'

interface GrupoSoporte { id: number; area: string; nivel: number; nombre: string }

function GrupoRow({ grupo }: { grupo: GrupoSoporte }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(grupo.nombre)
  const [area, setArea] = useState(grupo.area)
  const [nivel, setNivel] = useState(grupo.nivel)

  const guardar = useMutation({
    mutationFn: () => ticketsService.actualizarGrupoSoporte(grupo.id, { area, nivel, nombre: nombre.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupos-soporte'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar el grupo'),
  })

  const eliminar = useMutation({
    mutationFn: () => ticketsService.eliminarGrupoSoporte(grupo.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupos-soporte'] })
      toast.success('Grupo eliminado')
    },
    onError: () => toast.error('No se pudo eliminar (puede tener técnicos asignados)'),
  })

  if (editando) {
    return (
      <tr className="border-b border-surface-border/60">
        <td className="py-2 pr-2">
          <select className="field py-1 text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="TI">TI</option>
            <option value="ST">ST</option>
          </select>
        </td>
        <td className="py-2 pr-2">
          <select className="field py-1 text-sm" value={nivel} onChange={(e) => setNivel(Number(e.target.value))}>
            <option value={1}>N1</option>
            <option value={2}>N2</option>
            <option value={3}>N3</option>
          </select>
        </td>
        <td className="py-2 pr-2">
          <input className="field py-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </td>
        <td className="py-2 text-right">
          <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            Guardar
          </button>
          <button className="ml-1 px-2 py-1 text-xs text-ink-tertiary" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-surface-border/60">
      <td className="py-2 pr-2 text-ink-secondary">{grupo.area}</td>
      <td className="py-2 pr-2 text-ink-secondary">N{grupo.nivel}</td>
      <td className="py-2 pr-2 font-medium text-ink">{grupo.nombre}</td>
      <td className="py-2 text-right">
        <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          className="ml-2 text-ink-tertiary hover:text-red-500"
          onClick={() => { if (confirm(`¿Eliminar el grupo "${grupo.nombre}"?`)) eliminar.mutate() }}
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

export function GruposSoporteTab() {
  const qc = useQueryClient()
  const [area, setArea] = useState('TI')
  const [nivel, setNivel] = useState(1)
  const [nombre, setNombre] = useState('')

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['grupos-soporte'],
    queryFn: () => ticketsService.getGruposSoporte(),
  })

  const crear = useMutation({
    mutationFn: () => ticketsService.createGrupoSoporte({ area, nivel, nombre: nombre.trim() }),
    onSuccess: () => {
      setNombre('')
      qc.invalidateQueries({ queryKey: ['grupos-soporte'] })
    },
    onError: () => toast.error('No se pudo crear el grupo (¿ya existe uno con esa área y nivel?)'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Grupos de soporte</p>
        </div>
        <p className="mb-3 text-xs text-ink-tertiary">
          Nombre descriptivo por combinación de área y nivel (N1/N2/N3). Un técnico pertenece a un grupo
          según su área y nivel configurados en la pestaña Técnicos.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8rem]">
              <thead>
                <tr className="border-b border-surface-border text-left text-[0.65rem] uppercase tracking-wide text-ink-tertiary">
                  <th className="pb-2 pr-2">Área</th>
                  <th className="pb-2 pr-2">Nivel</th>
                  <th className="pb-2 pr-2">Nombre</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => <GrupoRow key={g.id} grupo={g} />)}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <select className="field text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="TI">TI</option>
            <option value="ST">ST</option>
          </select>
          <select className="field text-sm" value={nivel} onChange={(e) => setNivel(Number(e.target.value))}>
            <option value={1}>N1</option>
            <option value={2}>N2</option>
            <option value={3}>N3</option>
          </select>
          <input
            className="field flex-1 text-sm"
            placeholder="Nombre del grupo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) crear.mutate() }}
          />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!nombre.trim() || crear.isPending}
            onClick={() => crear.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
