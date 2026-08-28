import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, ChevronRight, UserPlus, X, FileText, ListChecks } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { LivechatGrupo } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { PlantillasPanel } from './PlantillasPanel'
import { MotivosCierrePanel } from './MotivosCierrePanel'

function CrearGrupoForm({ campaniaId, onCreated }: { campaniaId: number; onCreated: () => void }) {
  const [nombre, setNombre] = useState('')
  const [open, setOpen] = useState(false)

  const crear = useMutation({
    mutationFn: () => livechatService.createGrupo(campaniaId, { nombre: nombre.trim() }),
    onSuccess: () => {
      toast.success('Grupo creado')
      setNombre('')
      setOpen(false)
      onCreated()
    },
    onError: () => toast.error('No se pudo crear el grupo'),
  })

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-brand hover:underline flex items-center gap-1">
        <Plus size={12} />
        Nuevo grupo
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del grupo"
        className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && crear.mutate()}
      />
      <Button size="sm" onClick={() => crear.mutate()} disabled={!nombre.trim() || crear.isPending}>
        {crear.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Crear'}
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
        <X size={14} />
      </button>
    </div>
  )
}

function AgentesDeGrupo({ grupoId }: { grupoId: number }) {
  const qc = useQueryClient()
  const { data: agentes = [], isLoading } = useQuery({
    queryKey: ['livechat-grupo-agentes', grupoId],
    queryFn: () => livechatService.getAgentesDeGrupo(grupoId),
  })
  const { data: usuarios = [] } = useUsuariosSimple()
  const [usuarioSel, setUsuarioSel] = useState('')

  const asignar = useMutation({
    mutationFn: (usuarioId: number) => livechatService.asignarAgenteAGrupo(grupoId, usuarioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-grupo-agentes', grupoId] })
      setUsuarioSel('')
      toast.success('Agente asignado')
    },
    onError: () => toast.error('No se pudo asignar el agente'),
  })

  const quitar = useMutation({
    mutationFn: (usuarioId: number) => livechatService.quitarAgenteDeGrupo(grupoId, usuarioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-grupo-agentes', grupoId] })
      toast.success('Agente quitado del grupo')
    },
  })

  const idsAsignados = new Set(agentes.map((a) => a.usuarioId))
  const disponibles = usuarios.filter((u) => !idsAsignados.has(u.id))

  return (
    <div className="space-y-2">
      {isLoading ? (
        <Spinner size="sm" />
      ) : agentes.length === 0 ? (
        <p className="text-xs text-gray-400">Sin agentes asignados a este grupo</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {agentes.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-card border border-gray-200 pl-2.5 pr-1 py-1 text-xs">
              {a.nombre}
              <button type="button" onClick={() => quitar.mutate(a.usuarioId)} className="text-gray-400 hover:text-red-500 rounded-full p-0.5">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select
          value={usuarioSel}
          onChange={(e) => setUsuarioSel(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
        >
          <option value="">Elegir agente para asignar…</option>
          {disponibles.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          disabled={!usuarioSel || asignar.isPending}
          onClick={() => usuarioSel && asignar.mutate(Number(usuarioSel))}
        >
          <UserPlus size={13} />
        </Button>
      </div>
    </div>
  )
}

type SubTab = 'agentes' | 'plantillas' | 'motivos'

function GrupoRow({ grupo }: { grupo: LivechatGrupo }) {
  const [expandido, setExpandido] = useState(false)
  const [tab, setTab] = useState<SubTab>('agentes')

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
      >
        <ChevronRight size={14} className={clsx('text-gray-400 transition-transform shrink-0', expandido && 'rotate-90')} />
        <span>{grupo.icono}</span>
        <span className="text-sm font-medium text-gray-700">{grupo.nombre}</span>
      </button>

      {expandido && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          <div className="flex gap-1 border-b border-gray-100 -mt-1">
            {([
              { key: 'agentes' as const, label: 'Agentes', icon: UserPlus },
              { key: 'plantillas' as const, label: 'Plantillas', icon: FileText },
              { key: 'motivos' as const, label: 'Motivos de cierre', icon: ListChecks },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px',
                  tab === key ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          {tab === 'agentes' && <AgentesDeGrupo grupoId={grupo.id} />}
          {tab === 'plantillas' && <PlantillasPanel grupoId={grupo.id} />}
          {tab === 'motivos' && <MotivosCierrePanel grupoId={grupo.id} />}
        </div>
      )}
    </div>
  )
}

export function GruposPanel({ campaniaId }: { campaniaId: number }) {
  const { data: grupos = [], isLoading, refetch } = useQuery({
    queryKey: ['livechat-grupos', campaniaId],
    queryFn: () => livechatService.getGrupos(campaniaId),
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Grupos de atención</p>
        <CrearGrupoForm campaniaId={campaniaId} onCreated={refetch} />
      </div>
      {isLoading ? (
        <Spinner size="sm" />
      ) : grupos.length === 0 ? (
        <p className="text-xs text-gray-400">Esta campaña todavía no tiene grupos</p>
      ) : (
        <div className="space-y-1.5">
          {grupos.map((g) => <GrupoRow key={g.id} grupo={g} />)}
        </div>
      )}
    </div>
  )
}
