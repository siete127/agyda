import { useState, type ComponentType } from 'react'
import { Settings, Search, HardHat, ChevronRight, ArrowLeft, LayoutGrid, CheckCircle2, UserPlus, Share2, ListTodo } from 'lucide-react'
import { clsx } from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import {
  CONFIG_TREE, UBICACIONES_POR_PANTALLA, PENDIENTES,
  type ConfigNode, type UbicacionConfig,
} from './configTree'
import { IMPACTO_POR_PANTALLA } from './configCompartidas'
import { NuevoClienteModal } from '@/pages/atencion-cliente/clientes/NuevoClienteModal'
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
import { MetasConfigTab } from './MetasConfigTab'
import { ComisionesConfigTab } from './ComisionesConfigTab'
import { IncentivosConfigTab } from './IncentivosConfigTab'
import { ProspeccionConfigTab } from './ProspeccionConfigTab'
import { EmailMarketingConfigTab } from './EmailMarketingConfigTab'
import { CanalesPortalConfigTab } from './CanalesPortalConfigTab'
import { TiposClienteConfigTab } from './TiposClienteConfigTab'
import { SegmentosClienteConfigTab } from './SegmentosClienteConfigTab'
import { CategoriasClienteConfigTab } from './CategoriasClienteConfigTab'
import { IndustriasClienteConfigTab } from './IndustriasClienteConfigTab'
import { ClasificacionesClienteConfigTab } from './ClasificacionesClienteConfigTab'
import { EtiquetasClienteConfigTab } from './EtiquetasClienteConfigTab'
import { TiposAccesoPortalConfigTab } from './TiposAccesoPortalConfigTab'
import { ClientesConfigResumen } from './ClientesConfigResumen'
import { CCSkillsTab, CCConfigTab, CCSimuladorTab, CCPostulantesGestionTab } from './ContactCenterTabs'
import { CCFormulariosTab } from './CCFormulariosTab'
import { QrGeneratorTab } from './QrGeneratorTab'
import { MascotaTab } from './MascotaTab'
import { BotonesHeaderTab } from './BotonesHeaderTab'
import { EnlacesTopbarTab } from './EnlacesTopbarTab'
import { DashboardDisenoTab } from './DashboardDisenoTab'
import { TemaTab } from './TemaTab'
import { PausaTiposTab } from './PausaTiposTab'
import { ConfigModuloContext } from './configUbicacion'
// ── Secciones de Configuración > Tecnología/TI (módulo de Soporte TI) ──
import { GeneralTab } from './tecnologia/GeneralTab'
import { MesaServicioTab } from './tecnologia/MesaServicioTab'
import { CategoriasTab } from './tecnologia/CategoriasTab'
import { TecnicosTab } from './tecnologia/TecnicosTab'
import { CatalogosTab } from './tecnologia/CatalogosTab'
import { NotificacionesTecTab } from './tecnologia/NotificacionesTecTab'
import { GruposSoporteTab } from './tecnologia/GruposSoporteTab'
import { SlaTab } from './tecnologia/SlaTab'
import { KpisConfigTab } from './tecnologia/KpisConfigTab'
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
  'metas-config': MetasConfigTab,
  'comisiones-config': ComisionesConfigTab,
  'incentivos-config': IncentivosConfigTab,
  'prospeccion-config': ProspeccionConfigTab,
  'email-marketing-config': EmailMarketingConfigTab,
  'canales-portal-config': CanalesPortalConfigTab,
  'tipos-cliente-crm': TiposClienteConfigTab,
  'segmentos-crm': SegmentosClienteConfigTab,
  'categorias-cliente-crm': CategoriasClienteConfigTab,
  'industrias-crm': IndustriasClienteConfigTab,
  'clasificaciones-crm': ClasificacionesClienteConfigTab,
  'etiquetas-cliente-crm': EtiquetasClienteConfigTab,
  'tipos-acceso-portal-crm': TiposAccesoPortalConfigTab,
  'clientes-crm-resumen': ClientesConfigResumen,
  'cc-skills': CCSkillsTab,
  'cc-formularios': CCFormulariosTab,
  'cc-postulantes': CCPostulantesGestionTab,
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
  'pausa-tipos': PausaTiposTab,
  // ── Tecnología/TI ──
  'ti-general': GeneralTab,
  'ti-mesa-servicio': MesaServicioTab,
  'ti-categorias': CategoriasTab,
  'ti-tecnicos': TecnicosTab,
  'ti-catalogos': CatalogosTab,
  'ti-notificaciones': NotificacionesTecTab,
  'ti-grupos-soporte': GruposSoporteTab,
  'ti-sla': SlaTab,
  'ti-kpis': KpisConfigTab,
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

// Quita del árbol los nodos que no pasan el filtro (recursivo). Una sección que
// se queda sin módulos desaparece; "General" siempre se muestra.
function filtrarArbol(nodes: ConfigNode[], incluir: (n: ConfigNode) => boolean): ConfigNode[] {
  const out: ConfigNode[] = []
  for (const n of nodes) {
    if (!incluir(n)) continue
    if (!n.children) { out.push(n); continue }
    const children = filtrarArbol(n.children, incluir)
    if (children.length || n.screen || n.key === 'sec-general') out.push({ ...n, children })
  }
  return out
}

function indiceDe(nodes: ConfigNode[], out: Record<string, ConfigNode> = {}): Record<string, ConfigNode> {
  for (const n of nodes) {
    out[n.key] = n
    if (n.children) indiceDe(n.children, out)
  }
  return out
}

export function ConfiguracionPage() {
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)
  const { isAllowed, isLoading: cargandoModulos } = useModuleAccess()

  // Cada módulo se muestra solo si la empresa/usuario lo tiene activo; así una
  // configuración compartida aparece únicamente en los módulos que se usan.
  // (Recorrido barato — ~800 nodos — así que se recalcula en cada render y
  // siempre refleja los módulos vigentes.)
  const tree = filtrarArbol(CONFIG_TREE, (n) => {
    if (n.key === 'empresas' && !esSuperAdmin) return false
    if (n.moduleKey && !cargandoModulos && !isAllowed(n.moduleKey)) return false
    if (n.requiere && !cargandoModulos && n.requiere.some((m) => !isAllowed(m))) return false
    return true
  })
  // Índice solo de lo visible: una sección muestra únicamente sus módulos activos.
  const indice = indiceDe(tree)

  const [search, setSearch] = useState('')
  // null = home (grid de categorías). Si no es null, es la key de la categoría raíz activa.
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [verPendientes, setVerPendientes] = useState(false)

  const q = search.trim().toLowerCase()
  const results = q ? searchResults(tree, q) : []

  const category = activeCategory ? indice[activeCategory] ?? null : null
  const selectedNode = selectedKey ? indice[selectedKey] ?? null : null
  const Screen = selectedNode?.screen ? SCREENS[selectedNode.screen] : undefined
  // Ruta completa desde la raíz hasta el nodo activo (hoja seleccionada, o la
  // categoría en curso) — todos los segmentos intermedios son navegables.
  const breadcrumb = selectedKey
    ? findPath(tree, selectedKey) ?? []
    : activeCategory
      ? findPath(tree, activeCategory) ?? (category ? [category] : [])
      : []

  const openCategory = (key: string) => {
    const node = indice[key]
    setActiveCategory(key)
    // Categoría raíz sin hijos pero con pantalla propia (ej. Módulos por
    // Empresa) — se abre directo, sin pasar por una vista de subsecciones.
    setSelectedKey(node && !node.children?.length && node.screen ? key : null)
    setSearch('')
    setVerPendientes(false)
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
    const node = indice[key]
    if (!node) return
    setVerPendientes(false)
    const trail = findPath(tree, key) ?? []
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
    setVerPendientes(false)
  }

  // Pendientes visibles (solo de los módulos activos), con su ubicación.
  const pendientes = PENDIENTES.filter((p) => indice[p.key])

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
        <SearchResultsView results={results} onSelect={(n) => navigateToKey(n.key)} />
      ) : verPendientes ? (
        <PendientesView pendientes={pendientes} onBack={goHome} onSelect={navigateToKey} />
      ) : category ? (
        <CategoryView
          category={category}
          breadcrumb={breadcrumb}
          onBack={goHome}
          onSelect={openNode}
          onCrumb={navigateToKey}
          selectedNode={selectedNode}
          indice={indice}
          screen={Screen}
        />
      ) : (
        <HomeView tree={tree} onOpen={openCategory} pendientes={pendientes.length} onVerPendientes={() => setVerPendientes(true)} />
      )}
    </div>
  )
}

/* ─────────────────────────── Home: grid de categorías ─────────────────────────── */

function HomeView({ tree, onOpen, pendientes, onVerPendientes }: {
  tree: ConfigNode[]
  onOpen: (key: string) => void
  pendientes: number
  onVerPendientes: () => void
}) {
  return (
    <div className="space-y-4">
      {pendientes > 0 && (
        <button
          onClick={onVerPendientes}
          className="group flex w-full items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 px-4 py-3 text-left transition-colors hover:border-amber-300"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <ListTodo className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.82rem] font-semibold text-amber-800">{pendientes} configuraciones pendientes</p>
            <p className="text-[0.7rem] text-amber-700/70">Ver la lista completa por sección y módulo</p>
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-amber-400 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
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
  category, breadcrumb, onBack, onSelect, onCrumb, selectedNode, indice, screen: Screen,
}: {
  category: ConfigNode
  breadcrumb: ConfigNode[]
  onBack: () => void
  onSelect: (node: ConfigNode) => void
  onCrumb: (key: string) => void
  selectedNode: ConfigNode | null
  indice: Record<string, ConfigNode>
  screen?: ComponentType
}) {
  const style = CATEGORY_STYLES[breadcrumb[0]?.key ?? ''] ?? DEFAULT_CATEGORY_STYLE
  const Icon = style.icon
  const lastKey = breadcrumb[breadcrumb.length - 1]?.key
  // El nivel "actual" (para el botón de retroceso = subir un nivel) es el
  // penúltimo crumb si hay uno seleccionado, o el penúltimo de la categoría.
  const upKey = breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2].key : null

  // En la grilla de catálogos de Clientes (Configuración → CRM → Clientes),
  // se ofrece crear un cliente directamente aquí — mismo modal/flujo que ya
  // existe en Atención al Cliente → Seguimiento de clientes.
  const qc = useQueryClient()
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const enGrillaClientes = lastKey === 'clientes-crm'

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
          {enGrillaClientes && (
            <button
              onClick={() => setShowNuevoCliente(true)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98]"
            >
              <UserPlus className="h-3.5 w-3.5" /> Nuevo cliente
            </button>
          )}
        </div>
      </div>

      {showNuevoCliente && (
        <NuevoClienteModal
          onClose={() => setShowNuevoCliente(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['clientes-lista'] })
            setShowNuevoCliente(false)
          }}
        />
      )}

      {Screen && selectedNode ? (
        // El módulo desde el que se abrió (ancestro más cercano con moduleKey)
        // llega a la pantalla, para que una config compartida sepa dónde está.
        <ConfigModuloContext.Provider value={[...breadcrumb].reverse().find((n) => n.moduleKey)?.moduleKey ?? null}>
          <AvisoCompartida node={selectedNode} indice={indice} onIr={onCrumb} />
          <Screen />
        </ConfigModuloContext.Provider>
      ) : selectedNode ? (
        <PlaceholderPanel node={selectedNode} />
      ) : (
        <SubsectionGrid node={category} style={style} indice={indice} onSelect={onSelect} />
      )}
    </div>
  )
}

// Otras apariciones visibles de la misma pantalla (misma configuración en otros
// módulos). Vacío = la configuración no se comparte en esta empresa.
function otrasUbicaciones(node: ConfigNode, indice: Record<string, ConfigNode>): UbicacionConfig[] {
  if (!node.screen) return []
  return (UBICACIONES_POR_PANTALLA[node.screen] ?? []).filter((u) => u.key !== node.key && indice[u.key])
}

// Aviso arriba de una configuración compartida: en qué otros módulos aparece y
// a qué afecta un cambio. Se muestra antes de modificar, no después.
function AvisoCompartida({ node, indice, onIr }: {
  node: ConfigNode
  indice: Record<string, ConfigNode>
  onIr: (key: string) => void
}) {
  const otras = otrasUbicaciones(node, indice)
  const impacto = node.screen ? IMPACTO_POR_PANTALLA[node.screen] : undefined
  if (!otras.length && !impacto && !node.pendiente) return null
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Share2 className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-[0.78rem] text-amber-800">
          {node.pendiente && (
            <p className="rounded-lg bg-card/70 px-2.5 py-1.5 text-amber-700">
              <span className="font-bold">Pendiente en este módulo:</span> {node.pendiente}
            </p>
          )}
          <div>
            <p className="font-bold">Configuración compartida</p>
            <p className="text-amber-700">
              {impacto?.resumen}{' '}
              {impacto?.alcance === 'por-modulo'
                ? 'Al guardar podrás elegir si el cambio aplica solo a este módulo o a todos los que la comparten.'
                : 'Es un solo valor: cualquier cambio aquí aplica en todos los módulos donde se usa.'}
            </p>
          </div>
          {otras.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-amber-700">También está en:</span>
              {otras.map((u) => (
                <button
                  key={u.key}
                  onClick={() => onIr(u.key)}
                  className="rounded-full border border-amber-200 bg-card px-2.5 py-0.5 text-[0.7rem] font-semibold text-amber-700 hover:border-amber-300 hover:text-amber-900"
                >
                  {u.ruta.slice(0, -1).join(' › ')}
                </button>
              ))}
            </div>
          )}
          {impacto && impacto.afecta.length > 0 && (
            <div>
              <p className="font-semibold">Un cambio aquí impacta en:</p>
              <ul className="mt-1 space-y-0.5">
                {impacto.afecta.map((a) => (
                  <li key={a.modulo} className="text-amber-700">
                    <span className="font-semibold text-amber-800">{a.modulo}:</span> {a.que}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SubsectionGrid({ node, style, indice, onSelect }: {
  node: ConfigNode
  style: typeof DEFAULT_CATEGORY_STYLE
  indice: Record<string, ConfigNode>
  onSelect: (node: ConfigNode) => void
}) {
  if (!node.children?.length) {
    return <PlaceholderPanel node={node} />
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {node.children.map((child) => {
        const hasChildren = !!child.children?.length
        const isImplemented = !!child.screen
        const esCompartida = otrasUbicaciones(child, indice).length > 0
        const activas = hasChildren ? countImplemented(child) : 0
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
              {hasChildren && (
                <p className="text-[0.65rem] text-gray-400">
                  {child.children!.length} subsecciones{activas > 0 ? ` · ${activas} activas` : ''}
                </p>
              )}
            </div>
            {esCompartida && (
              <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-700" title="Configuración compartida con otros módulos">
                <Share2 className="h-2.5 w-2.5" /> Compartida
              </span>
            )}
            {child.pendiente && (
              <span className="flex-shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[0.6rem] font-semibold text-orange-600" title={child.pendiente}>
                Pendiente
              </span>
            )}
            {!hasChildren && !isImplemented && (
              <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[0.6rem] font-medium text-gray-400">
                Próximamente
              </span>
            )}
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

/* ─────────────────────────── Lista de pendientes ─────────────────────────── */

// Todas las configuraciones "próximamente", agrupadas por sección y módulo.
function PendientesView({ pendientes, onBack, onSelect }: {
  pendientes: UbicacionConfig[]
  onBack: () => void
  onSelect: (key: string) => void
}) {
  const secciones = new Map<string, Map<string, UbicacionConfig[]>>()
  for (const p of pendientes) {
    const seccion = p.ruta[0] ?? ''
    const modulo = p.ruta.length > 2 ? p.ruta[1] : ''
    if (!secciones.has(seccion)) secciones.set(seccion, new Map())
    const modulos = secciones.get(seccion)!
    if (!modulos.has(modulo)) modulos.set(modulo, [])
    modulos.get(modulo)!.push(p)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <button
          onClick={onBack}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Volver a Configuración"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <ListTodo className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[0.98rem] font-bold text-gray-900">Configuraciones pendientes</p>
          <p className="text-[0.72rem] text-gray-400">{pendientes.length} por construir o por conectar a su módulo, por sección y módulo</p>
        </div>
      </div>

      {[...secciones.entries()].map(([seccion, modulos]) => {
        const total = [...modulos.values()].reduce((s, l) => s + l.length, 0)
        return (
          <section key={seccion} className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
            <p className="mb-3 text-[0.9rem] font-bold text-gray-900">
              {seccion} <span className="font-medium text-gray-400">· {total}</span>
            </p>
            <div className="space-y-3">
              {[...modulos.entries()].map(([modulo, items]) => (
                <div key={modulo}>
                  {modulo && (
                    <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
                      {modulo} · {items.length}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => onSelect(p.key)}
                        className="rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-1 text-[0.72rem] text-gray-600 hover:border-gray-200 hover:text-brand"
                      >
                        {p.ruta.slice(modulo ? 2 : 1).join(' › ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
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
