import { useMemo, useState, type ComponentType } from 'react'
import { Settings, Search, HardHat, ChevronRight, ArrowLeft, LayoutGrid, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth.store'
import { CONFIG_TREE, CONFIG_NODE_INDEX, type ConfigNode } from './configTree'
import { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE, countLeaves } from './categoryStyles'
import { EmpresasTab } from './EmpresasTab'
import { ModulosEmpresaTab } from './ModulosEmpresaTab'
import { PermisosTab } from './PermisosTab'
import { WebphoneVistasTab } from './WebphoneVistasTab'
import { WebphoneCredencialesTab } from './WebphoneCredencialesTab'
import { WebphoneAsignacionesTab } from './WebphoneAsignacionesTab'
import { NotificacionesCorreoTab } from './NotificacionesCorreoTab'
import { MensajeriaConfigTab } from './MensajeriaConfigTab'
import { UsuariosTab } from './UsuariosTab'
import { RolesTab } from './RolesTab'
import { PerfilesTab } from './PerfilesTab'
import { BrandingTab } from './BrandingTab'
import { InstitucionalTab } from './InstitucionalTab'
import { VentasTab } from './VentasTab'
import { FacturacionTab } from './FacturacionTab'
import { CCCanalesTab, CCSkillsTab, CCAgentesTab, CCTipificacionesTab, CCConfigTab, CCSimuladorTab } from './ContactCenterTabs'
import { QrGeneratorTab } from './QrGeneratorTab'
import { MascotaTab } from './MascotaTab'
import { BotonesHeaderTab } from './BotonesHeaderTab'
import { EnlacesTopbarTab } from './EnlacesTopbarTab'
import { DashboardDisenoTab } from './DashboardDisenoTab'
import { TemaTab } from './TemaTab'
// ── Secciones de Configuración > Tecnología/TI (módulo de Soporte TI) ──
import { GeneralTab } from './tecnologia/GeneralTab'
import { MesaServicioTab } from './tecnologia/MesaServicioTab'
import { CategoriasTab } from './tecnologia/CategoriasTab'
import { TecnicosTab } from './tecnologia/TecnicosTab'
import { CatalogosTab } from './tecnologia/CatalogosTab'
import { NotificacionesTecTab } from './tecnologia/NotificacionesTecTab'
import { GruposSoporteTab } from './tecnologia/GruposSoporteTab'
import { SlaTab } from './tecnologia/SlaTab'
import { CampaniaSoporteTITab } from './tecnologia/CampaniaSoporteTITab'
import { ChatEnVivoTab } from './tecnologia/ChatEnVivoTab'
import { ChatbotConfigTab } from './tecnologia/ChatbotConfigTab'
import { ReglasNegocioTab } from './tecnologia/ReglasNegocioTab'
import { EscalamientosTab } from './tecnologia/EscalamientosTab'
import { AutomatizacionesTab } from './tecnologia/AutomatizacionesTab'
import { KbConfigTab } from './tecnologia/KbConfigTab'
import { EncuestasTab } from './tecnologia/EncuestasTab'
import { PlantillasTab } from './tecnologia/PlantillasTab'
import { CamposPersonalizadosTab } from './tecnologia/CamposPersonalizadosTab'
import { SeguridadTab } from './tecnologia/SeguridadTab'
import { IntegracionesTab } from './tecnologia/IntegracionesTab'

const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96, 64])

const SCREENS: Record<string, ComponentType> = {
  empresas: EmpresasTab,
  'modulos-empresa': ModulosEmpresaTab,
  permisos: PermisosTab,
  usuarios: UsuariosTab,
  roles: RolesTab,
  perfiles: PerfilesTab,
  'pers-branding': BrandingTab,
  'pers-institucional': InstitucionalTab,
  ventas: VentasTab,
  facturacion: FacturacionTab,
  'cc-canales': CCCanalesTab,
  'cc-skills': CCSkillsTab,
  'cc-agentes': CCAgentesTab,
  'cc-tipificaciones': CCTipificacionesTab,
  'cc-config': CCConfigTab,
  'cc-simulador': CCSimuladorTab,
  'qr-generator': QrGeneratorTab,
  'pers-mascota': MascotaTab,
  'pers-botones': BotonesHeaderTab,
  'pers-enlaces': EnlacesTopbarTab,
  'pers-dashboard': DashboardDisenoTab,
  tema: TemaTab,
  'webphone-vistas': WebphoneVistasTab,
  'webphone-credenciales': WebphoneCredencialesTab,
  'webphone-asignaciones': WebphoneAsignacionesTab,
  notificaciones: NotificacionesCorreoTab,
  mensajeria: MensajeriaConfigTab,
  // ── Tecnología/TI ──
  'ti-general': GeneralTab,
  'ti-mesa-servicio': MesaServicioTab,
  'ti-categorias': CategoriasTab,
  'ti-tecnicos': TecnicosTab,
  'ti-catalogos': CatalogosTab,
  'ti-notificaciones': NotificacionesTecTab,
  'ti-grupos-soporte': GruposSoporteTab,
  'ti-sla': SlaTab,
  'ti-campania-soporte': CampaniaSoporteTITab,
  'ti-chat-vivo': ChatEnVivoTab,
  'ti-chatbot': ChatbotConfigTab,
  'ti-reglas': ReglasNegocioTab,
  'ti-escalamientos': EscalamientosTab,
  'ti-automatizaciones': AutomatizacionesTab,
  'ti-campos-personalizados': CamposPersonalizadosTab,
  'ti-kb': KbConfigTab,
  'ti-encuestas': EncuestasTab,
  'ti-plantillas': PlantillasTab,
  'ti-seguridad': SeguridadTab,
  'ti-integraciones': IntegracionesTab,
}

function findPath(nodes: ConfigNode[], key: string, trail: ConfigNode[] = []): ConfigNode[] | null {
  for (const n of nodes) {
    const path = [...trail, n]
    if (n.key === key) return path
    if (n.children) {
      const found = findPath(n.children, key, path)
      if (found) return found
    }
  }
  return null
}

// Todos los resultados hoja que matchean la búsqueda, con su ruta completa —
// usado para la vista de resultados de búsqueda global.
function searchResults(nodes: ConfigNode[], q: string, trail: ConfigNode[] = []): { node: ConfigNode; trail: ConfigNode[] }[] {
  const out: { node: ConfigNode; trail: ConfigNode[] }[] = []
  for (const n of nodes) {
    const path = [...trail, n]
    if (n.label.toLowerCase().includes(q)) out.push({ node: n, trail })
    if (n.children) out.push(...searchResults(n.children, q, path))
  }
  return out
}

export function ConfiguracionPage() {
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const tree = useMemo(
    () => (esSuperAdmin ? CONFIG_TREE : CONFIG_TREE.map((n) => (
      n.key === 'organizacion'
        ? { ...n, children: n.children?.filter((c) => c.key !== 'empresas') }
        : n
    ))),
    [esSuperAdmin],
  )

  const [search, setSearch] = useState('')
  // null = home (grid de categorías). Si no es null, es la key de la categoría raíz activa.
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const results = useMemo(() => (q ? searchResults(tree, q) : []), [tree, q])

  const category = activeCategory ? CONFIG_NODE_INDEX[activeCategory] : null
  const selectedNode = selectedKey ? CONFIG_NODE_INDEX[selectedKey] : null
  const Screen = selectedNode?.screen ? SCREENS[selectedNode.screen] : undefined
  // Ruta completa desde la raíz hasta el nodo activo (hoja seleccionada, o la
  // categoría en curso) — todos los segmentos intermedios son navegables.
  const breadcrumb = selectedKey
    ? findPath(CONFIG_TREE, selectedKey) ?? []
    : activeCategory
      ? findPath(CONFIG_TREE, activeCategory) ?? (category ? [category] : [])
      : []

  const openCategory = (key: string) => {
    const node = CONFIG_NODE_INDEX[key]
    setActiveCategory(key)
    // Categoría raíz sin hijos pero con pantalla propia (ej. Módulos por
    // Empresa) — se abre directo, sin pasar por una vista de subsecciones.
    setSelectedKey(node && !node.children?.length && node.screen ? key : null)
    setSearch('')
  }

  const openNode = (node: ConfigNode) => {
    if (node.children?.length) {
      setSelectedKey(null)
      setActiveCategory(node.key)
    } else {
      setSelectedKey(node.key)
    }
    setSearch('')
  }

  // Navega a cualquier nodo por su key — usado por los segmentos del breadcrumb.
  // Un nodo con hijos abre su vista de subsecciones; una hoja abre su pantalla.
  // Si la hoja no tiene pantalla propia, se muestra dentro de su categoría padre.
  const navigateToKey = (key: string) => {
    const node = CONFIG_NODE_INDEX[key]
    if (!node) return
    const trail = findPath(CONFIG_TREE, key) ?? []
    if (node.children?.length) {
      setActiveCategory(key)
      setSelectedKey(null)
    } else {
      // Ancla la categoría en el ancestro más cercano que tenga hijos, para que
      // la vista de categoría tenga un contexto que renderizar.
      const parentWithChildren = [...trail].reverse().find((n) => n.key !== key && n.children?.length)
      setActiveCategory(parentWithChildren?.key ?? trail[0]?.key ?? key)
      setSelectedKey(key)
    }
    setSearch('')
  }

  const goHome = () => {
    setActiveCategory(null)
    setSelectedKey(null)
    setSearch('')
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl text-white">
        <div
          className="animate-gradient-x px-6 py-6"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Configuración</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">Mapa completo de configuración del sistema</p>
            </div>
          </div>
        </div>
      </div>

      {/* Buscador global */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en toda la configuración…"
          className="field w-full pl-10 py-2.5 text-[0.85rem] shadow-card"
        />
      </div>

      {q ? (
        <SearchResultsView results={results} onSelect={openNode} />
      ) : category ? (
        <CategoryView
          category={category}
          breadcrumb={breadcrumb}
          onBack={goHome}
          onSelect={openNode}
          onCrumb={navigateToKey}
          selectedKey={selectedKey}
          screen={Screen}
        />
      ) : (
        <HomeView tree={tree} onOpen={openCategory} />
      )}
    </div>
  )
}

/* ─────────────────────────── Home: grid de categorías ─────────────────────────── */

function HomeView({ tree, onOpen }: { tree: ConfigNode[]; onOpen: (key: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tree.map((cat) => {
        const style = CATEGORY_STYLES[cat.key] ?? DEFAULT_CATEGORY_STYLE
        const Icon = style.icon
        const total = countLeaves(cat)
        const implemented = countImplemented(cat)
        return (
          <button
            key={cat.key}
            onClick={() => onOpen(cat.key)}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-gray-100 bg-card p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className={clsx('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', style.gradient)}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.95rem] font-bold text-gray-900">{cat.label}</p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-gray-400">{cat.description}</p>
            </div>
            <div className="mt-auto flex w-full items-center justify-between pt-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-gray-300">
                {total} secciones{implemented > 0 ? ` · ${implemented} activas` : ''}
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function countImplemented(node: ConfigNode): number {
  let n = node.screen ? 1 : 0
  for (const c of node.children ?? []) n += countImplemented(c)
  return n
}

/* ─────────────────────────── Vista de categoría ─────────────────────────── */

function CategoryView({
  category, breadcrumb, onBack, onSelect, onCrumb, selectedKey, screen: Screen,
}: {
  category: ConfigNode
  breadcrumb: ConfigNode[]
  onBack: () => void
  onSelect: (node: ConfigNode) => void
  onCrumb: (key: string) => void
  selectedKey: string | null
  screen?: ComponentType
}) {
  const style = CATEGORY_STYLES[breadcrumb[0]?.key ?? ''] ?? DEFAULT_CATEGORY_STYLE
  const Icon = style.icon
  const selectedNode = selectedKey ? CONFIG_NODE_INDEX[selectedKey] : null
  const lastKey = breadcrumb[breadcrumb.length - 1]?.key
  // El nivel "actual" (para el botón de retroceso = subir un nivel) es el
  // penúltimo crumb si hay uno seleccionado, o el penúltimo de la categoría.
  const upKey = breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2].key : null

  return (
    <div className="space-y-4">
      {/* Header ilustrado */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (upKey ? onCrumb(upKey) : onBack())}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title={upKey ? 'Subir un nivel' : 'Volver a Configuración'}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className={clsx('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', style.gradient)}>
            <Icon className="h-5.5 w-5.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1 text-[0.7rem] text-gray-400">
              <button onClick={onBack} className="flex items-center gap-1 hover:text-brand hover:underline">
                <LayoutGrid className="h-3 w-3" /> Configuración
              </button>
              {breadcrumb.map((n) => {
                const esUltimo = n.key === lastKey
                return (
                  <span key={n.key} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                    {esUltimo ? (
                      <span className="font-semibold text-gray-600">{n.label}</span>
                    ) : (
                      <button
                        onClick={() => onCrumb(n.key)}
                        className="hover:text-brand hover:underline"
                      >
                        {n.label}
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
            <p className="mt-0.5 truncate text-[0.98rem] font-bold text-gray-900">{selectedNode?.label ?? category.label}</p>
          </div>
        </div>
      </div>

      {Screen ? (
        <Screen />
      ) : selectedNode ? (
        <PlaceholderPanel node={selectedNode} />
      ) : (
        <SubsectionGrid node={category} style={style} onSelect={onSelect} />
      )}
    </div>
  )
}

function SubsectionGrid({ node, style, onSelect }: { node: ConfigNode; style: typeof DEFAULT_CATEGORY_STYLE; onSelect: (node: ConfigNode) => void }) {
  if (!node.children?.length) {
    return <PlaceholderPanel node={node} />
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {node.children.map((child) => {
        const hasChildren = !!child.children?.length
        const isImplemented = !!child.screen
        return (
          <button
            key={child.key}
            onClick={() => onSelect(child)}
            className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-card px-4 py-3 text-left shadow-sm transition-all hover:border-gray-200 hover:shadow-card"
          >
            <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', style.soft)}>
              {isImplemented ? (
                <CheckCircle2 className={clsx('h-4 w-4', style.text)} />
              ) : (
                <span className={clsx('h-1.5 w-1.5 rounded-full bg-current', style.text)} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8rem] font-semibold text-gray-800">{child.label}</p>
              {hasChildren && <p className="text-[0.65rem] text-gray-400">{child.children!.length} subsecciones</p>}
            </div>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
          </button>
        )
      })}
    </div>
  )
}

function PlaceholderPanel({ node }: { node: ConfigNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200/60 bg-card py-20 shadow-card">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
        <HardHat className="h-8 w-8 text-amber-500" />
      </div>
      <div className="text-center">
        <p className="text-base font-bold text-gray-800">{node.label}</p>
        <p className="mt-1 max-w-sm text-sm text-gray-400">Esta sección todavía no está implementada. Forma parte del mapa de configuración planeado.</p>
      </div>
    </div>
  )
}

/* ─────────────────────────── Resultados de búsqueda ─────────────────────────── */

function SearchResultsView({ results, onSelect }: { results: { node: ConfigNode; trail: ConfigNode[] }[]; onSelect: (node: ConfigNode) => void }) {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200/60 bg-card py-16 text-sm text-gray-400 shadow-card">
        Sin resultados
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {results.slice(0, 60).map(({ node, trail }) => {
        const rootKey = trail[0]?.key ?? node.key
        const style = CATEGORY_STYLES[rootKey] ?? DEFAULT_CATEGORY_STYLE
        return (
          <button
            key={node.key}
            onClick={() => onSelect(node)}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-card px-4 py-2.5 text-left shadow-sm transition-colors hover:border-gray-200"
          >
            <div className={clsx('h-1.5 w-1.5 flex-shrink-0 rounded-full', style.text.replace('text-', 'bg-'))} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8rem] font-semibold text-gray-800">{node.label}</p>
              <p className="truncate text-[0.68rem] text-gray-400">{[...trail.map((t) => t.label)].join(' › ') || 'Raíz'}</p>
            </div>
            {node.screen && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />}
          </button>
        )
      })}
    </div>
  )
}
