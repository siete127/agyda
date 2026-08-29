import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  LayoutGrid, ArrowRight, Search, Check, Plus, Loader2, RotateCcw, Lock,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useUIStore } from '@/stores/ui.store'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { DASHBOARD_DEFAULT } from '@/providers/personalizacion.context'
import { personalizacionService, type DashboardCard } from '@/services/personalizacion.service'
import { CARD_CATALOG, CATEGORIAS, type CatalogEntry } from '@/pages/dashboard/cardCatalog'

const visMap = (cards: DashboardCard[]): Record<string, boolean> =>
  Object.fromEntries(cards.map((c) => [c.id, c.visible]))

/* Configuración → Apariencia → Diseño del inicio.
   Galería/catálogo de todas las cards del sistema: agrega o quita cada una
   del Inicio de la empresa. El orden y tamaño se ajustan luego arrastrando
   en la propia página de Inicio ("Editar diseño"). */
export function DashboardDisenoTab() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const setDashboardEditArmed = useUIStore((s) => s.setDashboardEditArmed)
  const { isAllowed } = useModuleAccess()
  const { dashboard } = usePersonalizacion()

  const guardadas = dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT

  // Borrador local: id -> visible. Arranca de lo guardado.
  const [draft, setDraft] = useState<Record<string, boolean>>(() => visMap(guardadas))
  // Si llega personalización nueva de fuera (socket), re-sembrar el borrador.
  const [seed, setSeed] = useState(dashboard.cards)
  if (dashboard.cards !== seed) {
    setSeed(dashboard.cards)
    setDraft(visMap(dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT))
  }

  const [q, setQ] = useState('')

  // Catálogo filtrado por módulos activos + búsqueda.
  const disponibles = useMemo(
    () => CARD_CATALOG.filter((c) => {
      if (c.moduleKey && !isAllowed(c.moduleKey)) return false
      if (!q.trim()) return true
      const t = q.trim().toLowerCase()
      return c.titulo.toLowerCase().includes(t) || c.descripcion.toLowerCase().includes(t)
    }),
    [isAllowed, q],
  )

  const activasCount = Object.values(draft).filter(Boolean).length
  const dirty = useMemo(() => {
    const g = visMap(guardadas)
    const ids = new Set([...Object.keys(g), ...Object.keys(draft)])
    for (const id of ids) if ((g[id] ?? false) !== (draft[id] ?? false)) return true
    return false
  }, [draft, guardadas])

  const toggle = (id: string) => setDraft((p) => ({ ...p, [id]: !p[id] }))

  const guardar = useMutation({
    mutationFn: async () => {
      // Construir el array de DashboardCard: parte de lo guardado, aplica el
      // draft de visibilidad, y agrega las nuevas con su tamaño de catálogo.
      const porId = new Map<string, DashboardCard>(guardadas.map((c) => [c.id, { ...c }]))
      const cards: DashboardCard[] = []
      let y = 0
      for (const entry of CARD_CATALOG) {
        const visible = !!draft[entry.id]
        const prev = porId.get(entry.id)
        if (!visible && !prev) continue
        if (prev) {
          cards.push({ ...prev, visible })
        } else {
          cards.push({ id: entry.id, x: 0, y: 100 + y, w: entry.size.w, h: entry.size.h, visible })
          y += entry.size.h
        }
      }
      await personalizacionService.updateDashboard(cards)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Catálogo del inicio guardado')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const restablecer = () => {
    setDraft(Object.fromEntries(DASHBOARD_DEFAULT.map((c) => [c.id, c.visible])))
  }

  const irAOrdenar = () => {
    setDashboardEditArmed(true)
    navigate('/dashboard')
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
          <LayoutGrid className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Diseño del inicio</h2>
          <p className="text-[0.82rem] text-gray-400">
            Elige qué tarjetas aparecen en la página de Inicio de tu empresa. Luego ordénalas
            arrastrándolas desde el propio Inicio.
          </p>
        </div>
      </div>

      {/* Barra: resumen + acciones */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 text-[0.82rem]">
          <span className="rounded-lg bg-violet-50 px-2.5 py-1 font-bold text-violet-600">{activasCount}</span>
          <span className="text-gray-500">tarjetas en el inicio</span>
        </div>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tarjeta…"
            className="w-full rounded-xl border border-gray-200 bg-card py-2 pl-9 pr-3 text-[0.82rem] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
          />
        </div>
        <button
          onClick={irAOrdenar}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-[0.8rem] font-semibold text-gray-700 transition-colors hover:border-violet-300 hover:text-violet-600"
        >
          Ordenar en el Inicio <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Galería por categoría */}
      {CATEGORIAS.map((cat) => {
        const items = disponibles.filter((c) => c.categoria === cat)
        if (items.length === 0) return null
        return (
          <section key={cat} className="space-y-2.5">
            <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-gray-400">{cat}</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((entry) => (
                <CardTile
                  key={entry.id}
                  entry={entry}
                  activa={!!draft[entry.id]}
                  onToggle={() => toggle(entry.id)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* Cards de módulos no disponibles (informativo) */}
      <ModulosBloqueados isAllowed={isAllowed} />

      {/* Footer de acciones — pegado al fondo del viewport mientras hay cambios */}
      <div className="sticky bottom-4 z-20 flex items-center justify-end gap-2 rounded-2xl border border-gray-200 bg-card/95 px-4 py-3 shadow-card-lg backdrop-blur">
        {dirty && <span className="mr-auto text-[0.75rem] font-medium text-amber-600">Cambios sin guardar</span>}
        <button
          onClick={restablecer}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[0.8rem] font-semibold text-gray-500 transition-colors hover:bg-gray-100"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restablecer
        </button>
        <button
          onClick={() => guardar.mutate()}
          disabled={!dirty || guardar.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-[0.8rem] font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
        >
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}

function CardTile({ entry, activa, onToggle }: {
  entry: CatalogEntry; activa: boolean; onToggle: () => void
}) {
  const { Icon } = entry
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'group flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all',
        activa
          ? 'border-violet-300 bg-violet-50/50 shadow-sm'
          : 'border-gray-100 bg-card hover:border-gray-200 hover:shadow-card',
      )}
    >
      <div className={clsx(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
        activa ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.82rem] font-bold text-gray-900">{entry.titulo}</p>
        <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-gray-400">{entry.descripcion}</p>
      </div>
      <span className={clsx(
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[0.7rem] font-bold transition-colors',
        activa ? 'bg-violet-600 text-white' : 'border border-gray-200 text-gray-300 group-hover:border-violet-300 group-hover:text-violet-500',
      )}>
        {activa ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </span>
    </button>
  )
}

function ModulosBloqueados({ isAllowed }: { isAllowed: (k: string) => boolean }) {
  const bloqueadas = CARD_CATALOG.filter((c) => c.moduleKey && !isAllowed(c.moduleKey))
  if (bloqueadas.length === 0) return null
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-gray-300">
        <Lock className="h-3 w-3" /> Requieren activar su módulo
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {bloqueadas.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-3 opacity-70">
            <entry.Icon className="h-4 w-4 flex-shrink-0 text-gray-300" />
            <p className="truncate text-[0.76rem] font-semibold text-gray-400">{entry.titulo}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
