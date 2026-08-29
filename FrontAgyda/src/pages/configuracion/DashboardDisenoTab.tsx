import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutGrid, Search, Check, Loader2, RotateCcw, Lock, Move, GripHorizontal, ImageIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { DASHBOARD_DEFAULT } from '@/providers/personalizacion.context'
import { personalizacionService, type DashboardCard } from '@/services/personalizacion.service'
import { CARD_CATALOG, CATEGORIAS, CARD_CATALOG_INDEX, type CatalogEntry } from '@/pages/dashboard/cardCatalog'
import { DashboardLayoutModal } from './DashboardLayoutModal'

const norm = (cards: DashboardCard[]) =>
  [...cards].sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}:${c.visible ? 1 : 0}:${c.x},${c.y},${c.w},${c.h}`).join('|')

/* Configuración → Apariencia → Diseño del inicio.
   Catálogo de todas las cards del sistema: agrega/quita cada una del Inicio de
   la empresa, y con "Ajustar diseño" ordena/redimensiona en un modal sin salir
   de Configuración. */
export function DashboardDisenoTab() {
  const qc = useQueryClient()
  const { isAllowed } = useModuleAccess()
  const { dashboard } = usePersonalizacion()

  const guardadas: DashboardCard[] = dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT

  // Borrador local completo (id + visible + geometría).
  const [draft, setDraft] = useState<DashboardCard[]>(() => guardadas.map((c) => ({ ...c })))
  // Re-sembrar si llega personalización nueva de fuera (socket).
  const [seed, setSeed] = useState(dashboard.cards)
  if (dashboard.cards !== seed) {
    setSeed(dashboard.cards)
    setDraft((dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT).map((c) => ({ ...c })))
  }

  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const draftIndex = useMemo(
    () => Object.fromEntries(draft.map((c) => [c.id, c])) as Record<string, DashboardCard>,
    [draft],
  )

  const disponibles = useMemo(
    () => CARD_CATALOG.filter((c) => {
      if (c.moduleKey && !isAllowed(c.moduleKey)) return false
      if (!q.trim()) return true
      const t = q.trim().toLowerCase()
      return c.titulo.toLowerCase().includes(t) || c.descripcion.toLowerCase().includes(t)
    }),
    [isAllowed, q],
  )

  const activasCount = draft.filter((c) => c.visible).length
  const dirty = norm(draft) !== norm(guardadas)

  const isActiva = (id: string) => !!draftIndex[id]?.visible

  const toggle = (entry: CatalogEntry) => setDraft((prev) => {
    const existing = prev.find((c) => c.id === entry.id)
    if (existing) return prev.map((c) => (c.id === entry.id ? { ...c, visible: !c.visible } : c))
    const maxY = prev.reduce((m, c) => Math.max(m, c.y + c.h), 0)
    return [...prev, { id: entry.id, x: 0, y: maxY, w: entry.size.w, h: entry.size.h, visible: true }]
  })

  const guardar = useMutation({
    mutationFn: async () => {
      // Solo cards con id conocido; conserva geometría; descarta las nunca usadas.
      const cards = draft.filter((c) => CARD_CATALOG_INDEX[c.id] && (c.visible || guardadas.some((g) => g.id === c.id)))
      await personalizacionService.updateDashboard(cards)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Diseño del inicio guardado')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const restablecer = () => setDraft(DASHBOARD_DEFAULT.map((c) => ({ ...c })))

  return (
    <div className="space-y-5">
      {/* Encabezado con ilustración */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[1.35rem] font-bold text-gray-900">Diseño del inicio</h2>
              <p className="max-w-md text-[0.82rem] text-gray-400">
                Elige qué tarjetas aparecen en la página de Inicio de tu empresa y ajústalas con
                {' '}<b className="text-gray-500">Ajustar diseño</b>.
              </p>
            </div>
          </div>
          <HeaderMockup />
        </div>
      </div>

      {/* Barra: resumen + buscador */}
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
      </div>

      {/* Galería por categoría */}
      {CATEGORIAS.map((cat) => {
        const items = disponibles.filter((c) => c.categoria === cat)
        if (items.length === 0) return null
        return (
          <section key={cat} className="space-y-2">
            <h3 className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">{cat}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((entry) => (
                <CardTile
                  key={entry.id}
                  entry={entry}
                  activa={isActiva(entry.id)}
                  onToggle={() => toggle(entry)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <ModulosBloqueados isAllowed={isAllowed} />

      {/* Footer de acciones */}
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-card/95 px-4 py-3 shadow-card-lg backdrop-blur">
        {dirty && <span className="text-[0.75rem] font-medium text-amber-600">Cambios sin guardar</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={restablecer}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[0.8rem] font-semibold text-gray-500 transition-colors hover:bg-gray-100"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restablecer
          </button>
          <button
            onClick={() => setModalOpen(true)}
            disabled={activasCount === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 px-3.5 py-2 text-[0.8rem] font-semibold text-violet-600 transition-colors hover:bg-violet-50 disabled:opacity-50"
          >
            <Move className="h-3.5 w-3.5" /> Ajustar diseño
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

      {modalOpen && (
        <DashboardLayoutModal
          cards={draft}
          onAplicar={setDraft}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

/* Ilustración del header — panel arrastrable, guiño al editor de diseño. */
function HeaderMockup() {
  return (
    <div className="relative hidden w-72 flex-shrink-0 overflow-hidden rounded-xl border border-violet-100 bg-violet-50/60 p-3 shadow-sm lg:block">
      <div className="mb-2 flex gap-1 px-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-violet-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-violet-200" />
      </div>
      <div className="flex items-start gap-2">
        <div className="h-12 w-24 flex-shrink-0 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600" />
        <div className="relative flex-1 rounded-lg border border-violet-300 bg-card p-2 shadow-md">
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-3.5 w-3.5 text-violet-400" />
            <ImageIcon className="h-3.5 w-3.5 text-gray-300" />
          </div>
          <span className="pointer-events-none absolute -bottom-1 -right-1 text-violet-500">▨</span>
        </div>
        <div className="flex-1 space-y-1.5 pt-1">
          <div className="h-2 w-full rounded bg-violet-200" />
          <div className="h-2 w-2/3 rounded bg-gray-200" />
        </div>
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
        'group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all',
        activa ? 'border-gray-100 shadow-card' : 'border-gray-100 hover:border-gray-200 hover:shadow-card',
      )}
    >
      <div className={clsx(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
        activa ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-400',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8rem] font-semibold text-gray-900">{entry.titulo}</p>
        <p className="truncate text-[0.68rem] leading-snug text-gray-400">{entry.descripcion}</p>
      </div>
      {/* Checkbox cuadrado */}
      <span className={clsx(
        'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors',
        activa
          ? 'border-violet-600 bg-violet-600 text-white'
          : 'border-gray-300 bg-card group-hover:border-violet-400',
      )}>
        {activa && <Check className="h-3 w-3" strokeWidth={3.5} />}
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
