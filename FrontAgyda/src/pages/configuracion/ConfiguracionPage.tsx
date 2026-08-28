import { useSearchParams } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { ConfiguracionNav, CONFIGURACION_SECCIONES } from './ConfiguracionNav'
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
import { ProximamenteTab } from './tecnologia/ProximamenteTab'
import { WebphoneVistasTab } from './WebphoneVistasTab'
import { WebphoneCredencialesTab } from './WebphoneCredencialesTab'
import { NotificacionesCorreoTab } from './NotificacionesCorreoTab'
import { MensajeriaConfigTab } from './MensajeriaConfigTab'

const DEFAULT_TAB = 'general'

export function ConfiguracionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? DEFAULT_TAB

  const setTab = (key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', key)
      return next
    })
  }

  const seccionActual = CONFIGURACION_SECCIONES.find((s) => s.key === tab)

  const renderContenido = () => {
    switch (tab) {
      case 'general':                return <GeneralTab />
      case 'mesa-servicio':          return <MesaServicioTab />
      case 'categorias':             return <CategoriasTab />
      case 'tecnicos':               return <TecnicosTab />
      case 'catalogos':              return <CatalogosTab />
      case 'grupos-soporte':         return <GruposSoporteTab />
      case 'sla':                    return <SlaTab />
      case 'campanias':              return <CampaniaSoporteTITab />
      case 'chat-vivo':              return <ChatEnVivoTab />
      case 'chatbot':                return <ChatbotConfigTab />
      case 'reglas':                 return <ReglasNegocioTab />
      case 'escalamientos':          return <EscalamientosTab />
      case 'automatizaciones':       return <AutomatizacionesTab />
      case 'kb':                     return <KbConfigTab />
      case 'encuestas':              return <EncuestasTab />
      case 'plantillas':             return <PlantillasTab />
      case 'campos-personalizados':  return <CamposPersonalizadosTab />
      case 'seguridad':              return <SeguridadTab />
      case 'integraciones':          return <IntegracionesTab />
      case 'notificaciones':         return <NotificacionesTecTab />
      case 'webphone-vistas':        return <WebphoneVistasTab />
      case 'webphone-credenciales':  return <WebphoneCredencialesTab />
      case 'mensajeria':             return <MensajeriaConfigTab />
      case 'notificaciones-correo':  return <NotificacionesCorreoTab />
      default:
        return <ProximamenteTab seccion={seccionActual?.label ?? 'Sección'} />
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Configuración — Tecnología/TI</h1>
            <p className="text-xs text-blue-200/70">
              Catálogos, técnicos, reglas de asignación, canales de soporte y ciclo de vida de tickets
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        <ConfiguracionNav activa={tab} onChange={setTab} />
        <div>{renderContenido()}</div>
      </div>
    </div>
  )
}
