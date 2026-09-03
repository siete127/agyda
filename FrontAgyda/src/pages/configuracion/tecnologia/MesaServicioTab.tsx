import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, Pencil, Plus } from 'lucide-react'
import { catalogosTiService } from '@/services/catalogosTi.service'
import type { Clasificacion, MotivoEspera, Impacto, Urgencia } from '@/types/catalogosTi.types'

const PRIORIDADES = ['P1', 'P2', 'P3', 'P4'] as const
const PRIORIDAD_COLORS: Record<string, string> = {
  P1: 'bg-red-100 text-red-700 border-red-200',
  P2: 'bg-orange-100 text-orange-700 border-orange-200',
  P3: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  P4: 'bg-green-100 text-green-700 border-green-200',
}

function slugifyClave(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function ClasificacionRow({ item }: { item: Clasificacion }) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(item.nombre)

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateClasificacion(item.id, { nombre, orden: item.orden }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-clasificaciones'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-clasificaciones'] })
      setEditando(false)
    },
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleClasificacionActiva(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-clasificaciones'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-clasificaciones'] })
    },
  })

  if (editando) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-40 border-none bg-transparent text-xs font-medium text-ink outline-none"
        />
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || !nombre.trim()}
          className="text-xs font-semibold text-primary disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => {
            setNombre(item.nombre)
            setEditando(false)
          }}
          className="text-xs text-ink-tertiary"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-secondary ${
        !item.activa ? 'line-through opacity-50' : ''
      }`}
      title={`clave: ${item.clave}`}
    >
      {item.nombre}
      <button onClick={() => setEditando(true)} className="text-ink-tertiary hover:text-ink">
        <Pencil className="h-3 w-3" />
      </button>
      <button onClick={() => toggle.mutate()} className="text-ink-tertiary hover:text-ink">
        {item.activa ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      </button>
    </span>
  )
}

function ClasificacionesPanel() {
  const queryClient = useQueryClient()
  const [nuevoNombre, setNuevoNombre] = useState('')

  const { data: items = [] } = useQuery({
    queryKey: ['catalogos-ti-clasificaciones'],
    queryFn: () => catalogosTiService.getClasificaciones(true),
  })

  const crear = useMutation({
    mutationFn: () =>
      catalogosTiService.createClasificacion({
        clave: slugifyClave(nuevoNombre),
        nombre: nuevoNombre.trim(),
        orden: items.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-clasificaciones'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-clasificaciones'] })
      setNuevoNombre('')
    },
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <p className="mb-1 text-sm font-semibold text-ink">Clasificaciones de ticket</p>
      <p className="mb-3 text-xs text-ink-tertiary">Usadas al crear un ticket. El texto es editable; desactivar oculta la opción sin borrar el historial.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <ClasificacionRow key={item.id} item={item} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nueva clasificación..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => crear.mutate()}
          disabled={crear.isPending || !nuevoNombre.trim()}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>
    </div>
  )
}

function MotivoEsperaRow({ item }: { item: MotivoEspera }) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(item.nombre)

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateMotivoEspera(item.id, { nombre, orden: item.orden }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-motivos-espera'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-motivos-espera'] })
      setEditando(false)
    },
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleMotivoEsperaActiva(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-motivos-espera'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-motivos-espera'] })
    },
  })

  if (editando) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-48 border-none bg-transparent text-xs font-medium text-ink outline-none"
        />
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || !nombre.trim()}
          className="text-xs font-semibold text-primary disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => {
            setNombre(item.nombre)
            setEditando(false)
          }}
          className="text-xs text-ink-tertiary"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-secondary ${
        !item.activa ? 'line-through opacity-50' : ''
      }`}
      title={`clave: ${item.clave}`}
    >
      {item.nombre}
      <button onClick={() => setEditando(true)} className="text-ink-tertiary hover:text-ink">
        <Pencil className="h-3 w-3" />
      </button>
      <button onClick={() => toggle.mutate()} className="text-ink-tertiary hover:text-ink">
        {item.activa ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      </button>
    </span>
  )
}

function MotivosEsperaPanel() {
  const queryClient = useQueryClient()
  const [nuevoNombre, setNuevoNombre] = useState('')

  const { data: items = [] } = useQuery({
    queryKey: ['catalogos-ti-motivos-espera'],
    queryFn: () => catalogosTiService.getMotivosEspera(true),
  })

  const crear = useMutation({
    mutationFn: () =>
      catalogosTiService.createMotivoEspera({
        clave: slugifyClave(nuevoNombre),
        nombre: nuevoNombre.trim(),
        orden: items.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-motivos-espera'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-motivos-espera'] })
      setNuevoNombre('')
    },
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <p className="mb-1 text-sm font-semibold text-ink">Motivos de espera</p>
      <p className="mb-3 text-xs text-ink-tertiary">Disponibles al poner un ticket en estado "en espera".</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <MotivoEsperaRow key={item.id} item={item} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nuevo motivo..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => crear.mutate()}
          disabled={crear.isPending || !nuevoNombre.trim()}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>
    </div>
  )
}

function ImpactoUrgenciaRow({
  item,
  tipo,
  onUpdated,
}: {
  item: Impacto | Urgencia
  tipo: 'impacto' | 'urgencia'
  onUpdated: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(item.nombre)

  const guardar = useMutation({
    mutationFn: () =>
      tipo === 'impacto'
        ? catalogosTiService.updateImpacto(item.id, { nombre, orden: item.orden })
        : catalogosTiService.updateUrgencia(item.id, { nombre, orden: item.orden }),
    onSuccess: () => {
      onUpdated()
      setEditando(false)
    },
  })

  const toggle = useMutation({
    mutationFn: () =>
      tipo === 'impacto'
        ? catalogosTiService.toggleImpactoActiva(item.id)
        : catalogosTiService.toggleUrgenciaActiva(item.id),
    onSuccess: onUpdated,
  })

  if (editando) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-32 border-none bg-transparent text-xs font-medium text-ink outline-none"
        />
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || !nombre.trim()}
          className="text-xs font-semibold text-primary disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => {
            setNombre(item.nombre)
            setEditando(false)
          }}
          className="text-xs text-ink-tertiary"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-secondary ${
        !item.activa ? 'line-through opacity-50' : ''
      }`}
      title={`clave: ${item.clave}`}
    >
      {item.nombre}
      <button onClick={() => setEditando(true)} className="text-ink-tertiary hover:text-ink">
        <Pencil className="h-3 w-3" />
      </button>
      <button onClick={() => toggle.mutate()} className="text-ink-tertiary hover:text-ink">
        {item.activa ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      </button>
    </span>
  )
}

function ImpactoUrgenciaPanel() {
  const queryClient = useQueryClient()
  const [nuevoImpacto, setNuevoImpacto] = useState('')
  const [nuevaUrgencia, setNuevaUrgencia] = useState('')

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['catalogos-ti-impactos'] })
    queryClient.invalidateQueries({ queryKey: ['catalogos-ti-urgencias'] })
    queryClient.invalidateQueries({ queryKey: ['ticket-impactos'] })
    queryClient.invalidateQueries({ queryKey: ['ticket-urgencias'] })
  }

  const { data: impactos = [] } = useQuery({
    queryKey: ['catalogos-ti-impactos'],
    queryFn: () => catalogosTiService.getImpactos(true),
  })
  const { data: urgencias = [] } = useQuery({
    queryKey: ['catalogos-ti-urgencias'],
    queryFn: () => catalogosTiService.getUrgencias(true),
  })

  const crearImpacto = useMutation({
    mutationFn: () =>
      catalogosTiService.createImpacto({ clave: slugifyClave(nuevoImpacto).toUpperCase(), nombre: nuevoImpacto.trim(), orden: impactos.length }),
    onSuccess: () => {
      invalidar()
      setNuevoImpacto('')
    },
  })

  const crearUrgencia = useMutation({
    mutationFn: () =>
      catalogosTiService.createUrgencia({ clave: slugifyClave(nuevaUrgencia).toUpperCase(), nombre: nuevaUrgencia.trim(), orden: urgencias.length }),
    onSuccess: () => {
      invalidar()
      setNuevaUrgencia('')
    },
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <p className="mb-1 text-sm font-semibold text-ink">Impacto y Urgencia</p>
      <p className="mb-3 text-xs text-ink-tertiary">
        Usados al crear un ticket para calcular la prioridad automáticamente (ver Matriz de prioridad abajo).
      </p>
      <div className="mb-3">
        <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Impacto</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {impactos.map((item) => (
            <ImpactoUrgenciaRow key={item.id} item={item} tipo="impacto" onUpdated={invalidar} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={nuevoImpacto}
            onChange={(e) => setNuevoImpacto(e.target.value)}
            placeholder="Nuevo nivel de impacto..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <button
            onClick={() => crearImpacto.mutate()}
            disabled={crearImpacto.isPending || !nuevoImpacto.trim()}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Urgencia</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {urgencias.map((item) => (
            <ImpactoUrgenciaRow key={item.id} item={item} tipo="urgencia" onUpdated={invalidar} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={nuevaUrgencia}
            onChange={(e) => setNuevaUrgencia(e.target.value)}
            placeholder="Nuevo nivel de urgencia..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <button
            onClick={() => crearUrgencia.mutate()}
            disabled={crearUrgencia.isPending || !nuevaUrgencia.trim()}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

function MatrizPrioridadPanel() {
  const queryClient = useQueryClient()

  const { data: impactos = [] } = useQuery({
    queryKey: ['catalogos-ti-impactos'],
    queryFn: () => catalogosTiService.getImpactos(),
  })
  const { data: urgencias = [] } = useQuery({
    queryKey: ['catalogos-ti-urgencias'],
    queryFn: () => catalogosTiService.getUrgencias(),
  })
  const { data: celdas = [] } = useQuery({
    queryKey: ['catalogos-ti-matriz-prioridad'],
    queryFn: () => catalogosTiService.getMatrizPrioridad(),
  })

  const setCelda = useMutation({
    mutationFn: (payload: { impacto: string; urgencia: string; prioridad: string }) => catalogosTiService.setCeldaMatrizPrioridad(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogos-ti-matriz-prioridad'] })
    },
  })

  const prioridadDe = (impactoClave: string, urgenciaClave: string) =>
    celdas.find((c) => c.impacto === impactoClave && c.urgencia === urgenciaClave)?.prioridad

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <p className="mb-1 text-sm font-semibold text-ink">Matriz de prioridad</p>
      <p className="mb-3 text-xs text-ink-tertiary">
        Cruce Impacto × Urgencia → Prioridad. Cambiá el valor de una celda para ajustar cómo se calcula la prioridad de los tickets nuevos.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">Impacto \ Urgencia</th>
              {urgencias.map((u) => (
                <th key={u.id} className="p-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                  {u.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {impactos.map((imp) => (
              <tr key={imp.id}>
                <td className="p-1.5 text-[0.7rem] font-medium text-ink-secondary">{imp.nombre}</td>
                {urgencias.map((urg) => {
                  const prio = prioridadDe(imp.clave, urg.clave)
                  return (
                    <td key={urg.id} className="p-1.5 text-center">
                      <select
                        value={prio ?? ''}
                        onChange={(e) => setCelda.mutate({ impacto: imp.clave, urgencia: urg.clave, prioridad: e.target.value })}
                        className={`rounded-lg border px-2 py-1 text-[0.7rem] font-semibold outline-none ${
                          prio ? PRIORIDAD_COLORS[prio] : 'border-gray-200 bg-surface text-ink-tertiary'
                        }`}
                      >
                        <option value="" disabled>
                          --
                        </option>
                        {PRIORIDADES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function MesaServicioTab() {
  return (
    <div className="space-y-4">
      <ClasificacionesPanel />
      <MotivosEsperaPanel />
      <ImpactoUrgenciaPanel />
      <MatrizPrioridadPanel />
    </div>
  )
}
