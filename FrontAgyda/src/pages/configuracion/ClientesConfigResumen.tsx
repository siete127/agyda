import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Tag, Layers, FolderTree, Factory, ListTree, Tags, KeyRound, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import { CatalogoListaGestion, type CatalogoService } from '@/components/crm/CatalogoListaGestion'

interface Seccion {
  key: string
  label: string
  subtitulo: string
  icon: LucideIcon
  service: CatalogoService
  queryKey: string
}

const SECCIONES: Seccion[] = [
  { key: 'tipos', label: 'Tipos', subtitulo: 'Ej. Persona física, Persona moral, Gobierno.', icon: Tag, service: crmCatalogosClienteService.tipos, queryKey: 'crm-catalogo-tipos-cliente' },
  { key: 'segmentos', label: 'Segmentos', subtitulo: 'Segmentación comercial del cliente.', icon: Layers, service: crmCatalogosClienteService.segmentos, queryKey: 'crm-catalogo-segmentos' },
  { key: 'categorias', label: 'Categorías', subtitulo: 'Categoría comercial del cliente.', icon: FolderTree, service: crmCatalogosClienteService.categorias, queryKey: 'crm-catalogo-categorias-cliente' },
  { key: 'industrias', label: 'Industrias', subtitulo: 'Giro o industria del cliente.', icon: Factory, service: crmCatalogosClienteService.industrias, queryKey: 'crm-catalogo-industrias' },
  { key: 'clasificaciones', label: 'Clasificaciones', subtitulo: 'Clasificación interna del cliente.', icon: ListTree, service: crmCatalogosClienteService.clasificaciones, queryKey: 'crm-catalogo-clasificaciones-cliente' },
  { key: 'etiquetas', label: 'Etiquetas', subtitulo: 'Un cliente puede tener varias a la vez.', icon: Tags, service: crmCatalogosClienteService.etiquetas, queryKey: 'crm-catalogo-etiquetas' },
  { key: 'tipos-acceso', label: 'Tipos de acceso al portal', subtitulo: 'Solo aplica a clientes con acceso al sistema.', icon: KeyRound, service: crmCatalogosClienteService.tiposAcceso, queryKey: 'crm-catalogo-tipos-acceso-portal' },
]

function SeccionBloque({ seccion }: { seccion: Seccion }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: [seccion.queryKey],
    queryFn: () => seccion.service.list(true),
  })
  const Icon = seccion.icon

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[1.05rem] font-bold text-gray-900">{seccion.label}</h2>
          <p className="text-[0.78rem] text-gray-400">{seccion.subtitulo}</p>
        </div>
      </div>
      <CatalogoListaGestion items={items} isLoading={isLoading} service={seccion.service} queryKey={seccion.queryKey} />
    </section>
  )
}

// Configuración → CRM → Clientes: panel de navegación a la izquierda con los
// 7 catálogos; a la derecha solo se muestra la sección seleccionada — las
// demás se ocultan, en vez de navegar a 7 pantallas separadas.
export function ClientesConfigResumen() {
  const [activo, setActivo] = useState(SECCIONES[0].key)
  const seccionActiva = SECCIONES.find((s) => s.key === activo) ?? SECCIONES[0]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-1.5 overflow-x-auto lg:sticky lg:top-4 lg:h-fit lg:flex-col lg:overflow-visible">
        {SECCIONES.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.key}
              onClick={() => setActivo(s.key)}
              className={clsx(
                'flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[0.8rem] font-semibold transition-colors',
                activo === s.key ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap lg:whitespace-normal">{s.label}</span>
            </button>
          )
        })}
      </nav>

      <SeccionBloque key={seccionActiva.key} seccion={seccionActiva} />
    </div>
  )
}
