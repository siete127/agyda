import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
const CRMPublicPage = lazy(() => import('@/pages/ventas/CRMPublicPage'))
import { AppLayout } from '@/layouts/AppLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { VentasLayout } from '@/layouts/VentasLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRoute } from './RoleRoute'
import { ModuleRoute } from './ModuleRoute'
import { LoginPage } from '@/pages/login/LoginPage'
import { AuthBridgePage } from '@/pages/login/AuthBridgePage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/auth.store'

// Redirige a /tickets si el usuario es CL (cliente externo)
function CLRedirect({ children }: { children: React.ReactNode }) {
  const tipoUsuario = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase())
  if (tipoUsuario === 'CL') return <Navigate to="/tickets" replace />
  return <>{children}</>
}

const lz = <T extends { [K in N]: React.ComponentType<any> }, N extends string>(
  fn: () => Promise<T>,
  name: N
) => lazy(() => fn().then((m) => ({ default: m[name] })))

// Páginas lazy — cada una genera su propio chunk
const DashboardPage   = lz(() => import('@/pages/dashboard/DashboardPage'),   'DashboardPage')
const TicketsPage     = lz(() => import('@/pages/tickets/TicketsPage'),        'TicketsPage')
const KbPage          = lz(() => import('@/pages/kb/KbPage'),                  'KbPage')
const NoticiasPage    = lz(() => import('@/pages/noticias/NoticiasPage'),      'NoticiasPage')
const ProyectosPage   = lz(() => import('@/pages/proyectos/ProyectosPage'),    'ProyectosPage')
const PerfilPage      = lz(() => import('@/pages/perfil/PerfilPage'),          'PerfilPage')
const VacacionesPage  = lz(() => import('@/pages/vacaciones/VacacionesPage'),  'VacacionesPage')
const CalendarioPage  = lz(() => import('@/pages/calendario/CalendarioPage'),  'CalendarioPage')
const OrganigramaPage = lz(() => import('@/pages/organigrama/OrganigramaPage'),'OrganigramaPage')
const DrivePage       = lz(() => import('@/pages/drive/DrivePage'),            'DrivePage')
const ChecklistPage   = lz(() => import('@/pages/checklist/ChecklistPage'),    'ChecklistPage')
const EncuestasPage   = lz(() => import('@/pages/encuestas/EncuestasPage'),    'EncuestasPage')
const MisEncuestasPage = lz(() => import('@/pages/encuestas/MisEncuestasPage'), 'MisEncuestasPage')
const EncuestaPublicaPage = lazy(() => import('@/pages/encuestas/EncuestaPublicaPage').then((m) => ({ default: m.EncuestaPublicaPage })))
const ExamenPublicoPage = lazy(() => import('@/pages/capacitacion/ExamenPublicoPage').then((m) => ({ default: m.ExamenPublicoPage })))
const ReportesPage    = lz(() => import('@/pages/reportes/ReportesPage'),      'ReportesPage')
const UsuariosPage    = lz(() => import('@/pages/usuarios/UsuariosPage'),      'UsuariosPage')
const PermisosPage         = lz(() => import('@/pages/permisos/PermisosPage'),              'PermisosPage')
const ExpedientePage       = lz(() => import('@/pages/expediente/ExpedientePage'),          'ExpedientePage')
const ClientesPage         = lz(() => import('@/pages/clientes/ClientesPage'),              'ClientesPage')
const ProductosServiciosPage = lz(() => import('@/pages/productos-servicios/ProductosServiciosPage'), 'ProductosServiciosPage')
const WebphonePage             = lz(() => import('@/pages/webphone/WebphonePage'),                   'WebphonePage')
const NotificacionesPage       = lz(() => import('@/pages/notificaciones/NotificacionesPage'),       'NotificacionesPage')
const MusicaPage               = lz(() => import('@/pages/musica/MusicaPage'),                         'MusicaPage')
const VentasPage               = lz(() => import('@/pages/ventas/VentasPage'),                          'VentasPage')
const QuejasPage               = lz(() => import('@/pages/quejas/QuejasPage'),                             'QuejasPage')
const QuejasDashboardPage      = lz(() => import('@/pages/quejas/QuejasDashboardPage'),                    'QuejasDashboardPage')
const AsistenciaReportePage    = lz(() => import('@/pages/asistencia/AsistenciaReportePage'),              'AsistenciaReportePage')
const MiAsistenciaPage         = lz(() => import('@/pages/asistencia/MiAsistenciaPage'),                   'MiAsistenciaPage')
const ReglamentoPage           = lz(() => import('@/pages/reglamento/ReglamentoPage'),                     'ReglamentoPage')
const StaffTiPage              = lz(() => import('@/pages/staff-ti/StaffTiPage'),                          'StaffTiPage')
const ActivosPage              = lz(() => import('@/pages/activos/ActivosPage'),                           'ActivosPage')
const NominaPage                = lz(() => import('@/pages/nomina/NominaPage'),                             'NominaPage')
const MiAreaPage               = lz(() => import('@/pages/mi-area/MiAreaPage'),                              'MiAreaPage')
const BanioReportePage              = lz(() => import('@/pages/banio/BanioReportePage'),                             'BanioReportePage')
const EvaluacionCapacitacionPage   = lz(() => import('@/pages/evaluacion/EvaluacionCapacitacionPage'),              'EvaluacionCapacitacionPage')
const AuditoriaPage                = lz(() => import('@/pages/auditoria/AuditoriaPage'),                             'AuditoriaPage')
const CRMInternoPage               = lz(() => import('@/pages/crm-interno/CRMInternoPage'),                          'CRMInternoPage')
const CRMPortalPage                = lz(() => import('@/pages/crm-interno/CRMPortalPage'),  'CRMPortalPage')
const EmailMarketingPage           = lz(() => import('@/pages/email-marketing/EmailMarketingPage'),                   'EmailMarketingPage')
const GastosPage                   = lz(() => import('@/pages/gastos/GastosPage'),           'default')

// Áreas del organigrama (ver plan "Expansión de la Intranet a las 10 Áreas")
const DireccionGeneralPage         = lz(() => import('@/pages/direccion-general/DireccionGeneralPage'), 'DireccionGeneralPage')
const PlaneacionEstrategicaPage    = lz(() => import('@/pages/direccion-general/PlaneacionEstrategicaPage'), 'PlaneacionEstrategicaPage')
const IndicadoresEmpresarialesPage = lz(() => import('@/pages/direccion-general/IndicadoresEmpresarialesPage'), 'IndicadoresEmpresarialesPage')
const IndicadoresPublicoPage       = lz(() => import('@/pages/direccion-general/IndicadoresPublicoPage'), 'IndicadoresPublicoPage')
const TomaDecisionesPage           = lz(() => import('@/pages/direccion-general/TomaDecisionesPage'), 'TomaDecisionesPage')
const ReportesEjecutivosPage       = lz(() => import('@/pages/direccion-general/ReportesEjecutivosPage'), 'ReportesEjecutivosPage')
const MejoraContinuaPage           = lz(() => import('@/pages/direccion-general/MejoraContinuaPage'), 'MejoraContinuaPage')
const SupervisionGeneralPage       = lz(() => import('@/pages/direccion-general/SupervisionGeneralPage'), 'SupervisionGeneralPage')
const CalidadPage                  = lz(() => import('@/pages/calidad/CalidadPage'),           'CalidadPage')
const RetroalimentacionPage        = lz(() => import('@/pages/retroalimentacion/RetroalimentacionPage'), 'RetroalimentacionPage')
const PlanesMejoraPage             = lz(() => import('@/pages/planes-mejora/PlanesMejoraPage'), 'PlanesMejoraPage')
const CumplimientoProcesosPage     = lz(() => import('@/pages/cumplimiento-procesos/CumplimientoProcesosPage'), 'CumplimientoProcesosPage')
const AuditoriasPage               = lz(() => import('@/pages/auditorias/AuditoriasPage'),      'AuditoriasPage')
const DeteccionErroresPage         = lz(() => import('@/pages/deteccion-errores/DeteccionErroresPage'), 'DeteccionErroresPage')
const MarketingPage                = lz(() => import('@/pages/marketing/MarketingPage'),       'MarketingPage')
const RedesSocialesPage             = lz(() => import('@/pages/marketing/RedesSocialesPage'),   'RedesSocialesPage')
const DisenoPage                    = lz(() => import('@/pages/marketing/DisenoPage'),          'DisenoPage')
const PublicidadPage                = lz(() => import('@/pages/marketing/PublicidadPage'),      'PublicidadPage')
const ContenidoPage                 = lz(() => import('@/pages/marketing/ContenidoPage'),        'ContenidoPage')
const ImagenCorporativaPage         = lz(() => import('@/pages/marketing/ImagenCorporativaPage'), 'ImagenCorporativaPage')
const ResultadosPage                = lz(() => import('@/pages/marketing/ResultadosPage'),        'ResultadosPage')
const LegalPage                    = lz(() => import('@/pages/legal/LegalPage'),               'LegalPage')
const ContratosPage                = lz(() => import('@/pages/legal/ContratosPage'),           'ContratosPage')
const ProteccionDatosPage          = lz(() => import('@/pages/legal/ProteccionDatosPage'),      'ProteccionDatosPage')
const CumplimientoNormativoPage    = lz(() => import('@/pages/legal/CumplimientoNormativoPage'), 'CumplimientoNormativoPage')
const ControlDocumentalPage        = lz(() => import('@/pages/legal/ControlDocumentalPage'), 'ControlDocumentalPage')
const FinanzasPage                 = lz(() => import('@/pages/finanzas/FinanzasPage'),         'FinanzasPage')
const IngresosPage                  = lz(() => import('@/pages/ingresos/IngresosPage'), 'IngresosPage')
const BancosPage                    = lz(() => import('@/pages/bancos/BancosPage'), 'BancosPage')
const EgresosPage                   = lz(() => import('@/pages/egresos/EgresosPage'), 'EgresosPage')
const CuentasCobrarPage             = lz(() => import('@/pages/cuentas-cobrar/CuentasCobrarPage'), 'CuentasCobrarPage')
const ReportesFinancierosPage       = lz(() => import('@/pages/reportes-financieros/ReportesFinancierosPage'), 'ReportesFinancierosPage')
const PresupuestosPage              = lz(() => import('@/pages/presupuestos/PresupuestosPage'), 'PresupuestosPage')
const CuentasPagarPage               = lz(() => import('@/pages/cuentas-pagar/CuentasPagarPage'), 'CuentasPagarPage')
const VentasAreaPage                = lz(() => import('@/pages/ventas-area/VentasAreaPage'),   'VentasAreaPage')
const MetasVentasPage                = lz(() => import('@/pages/metas-ventas/MetasVentasPage'), 'MetasVentasPage')
const ReportesResultadosPage         = lz(() => import('@/pages/reportes-resultados/ReportesResultadosPage'), 'ReportesResultadosPage')
const AsesoresVentasPage             = lz(() => import('@/pages/asesores-ventas/AsesoresVentasPage'), 'AsesoresVentasPage')
const ProspeccionPage                = lz(() => import('@/pages/prospeccion/ProspeccionPage'), 'ProspeccionPage')
const ComisionesPage                 = lz(() => import('@/pages/comisiones/ComisionesPage'), 'ComisionesPage')
const IncentivosPage                 = lz(() => import('@/pages/incentivos/IncentivosPage'), 'IncentivosPage')
const OperacionesPage               = lz(() => import('@/pages/operaciones/OperacionesPage'),  'OperacionesPage')
const CampanasPage                  = lz(() => import('@/pages/campanas/CampanasPage'),        'CampanasPage')
const SupervisoresPage              = lz(() => import('@/pages/supervisores/SupervisoresPage'), 'SupervisoresPage')
const TiemposPage                   = lz(() => import('@/pages/tiempos/TiemposPage'),           'TiemposPage')
const KpisOperacionesPage           = lz(() => import('@/pages/kpis-operaciones/KpisOperacionesPage'), 'KpisOperacionesPage')
const MetasPage                     = lz(() => import('@/pages/metas/MetasPage'),               'MetasPage')
const ReportesDiariosPage           = lz(() => import('@/pages/reportes-diarios/ReportesDiariosPage'), 'ReportesDiariosPage')
const AsesoresPage                  = lz(() => import('@/pages/asesores/AsesoresPage'),         'AsesoresPage')
const TecnologiaPage                = lz(() => import('@/pages/tecnologia/TecnologiaPage'),    'TecnologiaPage')
const InternetRedesPage             = lz(() => import('@/pages/internet-redes/InternetRedesPage'), 'InternetRedesPage')
const RespaldosPage                 = lz(() => import('@/pages/respaldos/RespaldosPage'),       'RespaldosPage')
const SistemasPage                  = lz(() => import('@/pages/sistemas/SistemasPage'),         'SistemasPage')
const AtencionClientePage           = lz(() => import('@/pages/atencion-cliente/AtencionClientePage'), 'AtencionClientePage')
const ConsultasPage                 = lz(() => import('@/pages/atencion-cliente/ConsultasPage'),  'ConsultasPage')
const AclaracionesPage              = lz(() => import('@/pages/atencion-cliente/AclaracionesPage'), 'AclaracionesPage')
const SeguimientoPage                = lz(() => import('@/pages/atencion-cliente/SeguimientoPage'), 'SeguimientoPage')
const SatisfaccionPage               = lz(() => import('@/pages/atencion-cliente/SatisfaccionPage'), 'SatisfaccionPage')
const RetencionPage                  = lz(() => import('@/pages/atencion-cliente/RetencionPage'), 'RetencionPage')
const ClientesListaPage              = lz(() => import('@/pages/atencion-cliente/clientes/ClientesListaPage'), 'ClientesListaPage')
const ClientePerfilPage              = lz(() => import('@/pages/atencion-cliente/clientes/ClientePerfilPage'), 'ClientePerfilPage')
const MisTareasPage                  = lz(() => import('@/pages/atencion-cliente/MisTareasPage'), 'MisTareasPage')
const IncidenciasPage                = lz(() => import('@/pages/atencion-cliente/IncidenciasPage'), 'IncidenciasPage')
const ClientesDashboardPage          = lz(() => import('@/pages/atencion-cliente/ClientesDashboardPage'), 'ClientesDashboardPage')
const RHPage                        = lz(() => import('@/pages/rh/RHPage'),                    'RHPage')
const PortalAreasPage               = lz(() => import('@/pages/portal-areas/PortalAreasPage'),  'PortalAreasPage')
const AreaSubModuloPage             = lz(() => import('@/pages/area-submodulo/AreaSubModuloPage'), 'AreaSubModuloPage')
const ConfiguracionPage             = lz(() => import('@/pages/configuracion/ConfiguracionPage'), 'ConfiguracionPage')
const MensajeriaPage                = lz(() => import('@/pages/mensajeria/MensajeriaPage'), 'MensajeriaPage')

// Vacantes / Chatbot / Chat en vivo (página pública)
const VacantesPage                  = lz(() => import('@/pages/vacantes/VacantesPage'),          'VacantesPage')
const ReclutamientoPage             = lz(() => import('@/pages/reclutamiento/ReclutamientoPage'), 'ReclutamientoPage')
const ClimaLaboralPage              = lz(() => import('@/pages/clima-laboral/ClimaLaboralPage'),  'ClimaLaboralPage')
const CapacitacionPage              = lz(() => import('@/pages/capacitacion/CapacitacionPage'),   'CapacitacionPage')
const IncapacidadesPage             = lz(() => import('@/pages/incapacidades/IncapacidadesPage'), 'IncapacidadesPage')
const EvaluacionDesempenoPage       = lz(() => import('@/pages/evaluacion-desempeno/EvaluacionDesempenoPage'), 'EvaluacionDesempenoPage')
const ChatbotPage                   = lz(() => import('@/pages/chatbot/ChatbotPage'),            'ChatbotPage')
const LivechatPage                  = lz(() => import('@/pages/livechat/LivechatPage'),          'default')

const Loader = () => (
  <div className="flex h-full items-center justify-center min-h-[40vh]">
    <Spinner size="lg" />
  </div>
)
const wrap = (el: React.ReactNode) => <Suspense fallback={<Loader />}>{el}</Suspense>

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },

  // Ruta pública — se abre desde Vicidial sin sesión de intranet
  { path: '/crm', element: <Suspense fallback={<div />}><CRMPublicPage /></Suspense> },

  // Portal del cliente (acceso público con token)
  { path: '/portal', element: <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}><CRMPortalPage /></Suspense> },

  // Puente de sesión desde la página pública (ardabytec.com) — evita doble login
  { path: '/auth-bridge', element: <AuthBridgePage /> },

  // Encuesta pública (sin sesión de intranet)
  { path: '/encuesta/:slug', element: <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}><EncuestaPublicaPage /></Suspense> },

  // Examen de capacitación público (sin sesión de intranet)
  { path: '/examen/:slug', element: <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}><ExamenPublicoPage /></Suspense> },

  // Indicadores empresariales — link público de solo lectura (sin sesión de intranet)
  { path: '/indicadores-publico', element: <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}><IndicadoresPublicoPage /></Suspense> },

  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
    ],
  },

  {
    element: <ProtectedRoute />,
    children: [

      // ── Intranet (con sidebar + topbar normales) ─────────────────────
      {
        element: <AppLayout />,
        children: [
          // Rutas siempre accesibles (moduleKey: '*')
          { path: '/dashboard',      element: <CLRedirect><>{wrap(<DashboardPage />)}</></CLRedirect> },
          { path: '/notificaciones', element: wrap(<NotificacionesPage />) },
          { path: '/perfil',         element: wrap(<PerfilPage />) },
          { path: '/permisos',       element: <Navigate to="/vacaciones" replace /> },
          { path: '/checklist',      element: wrap(<ChecklistPage />) },
          { path: '/mis-encuestas',  element: wrap(<MisEncuestasPage />) },

          // Rutas protegidas por módulo
          { element: <ModuleRoute moduleKey="tickets" />,             children: [{ path: '/tickets',          element: wrap(<TicketsPage />) }] },
          { element: <ModuleRoute moduleKey="tickets" />,             children: [{ path: '/kb',               element: wrap(<KbPage />) }] },
          { element: <ModuleRoute moduleKey="noticias" />,            children: [{ path: '/noticias',         element: wrap(<NoticiasPage />) }] },
          { element: <ModuleRoute moduleKey="mensajeria" />,          children: [{ path: '/mensajeria',       element: wrap(<MensajeriaPage />) }] },
          { element: <ModuleRoute moduleKey="vacaciones" />,          children: [{ path: '/vacaciones',       element: wrap(<VacacionesPage />) }] },
          { element: <ModuleRoute moduleKey="calendario" />,          children: [{ path: '/calendario',       element: wrap(<CalendarioPage />) }] },
          { element: <ModuleRoute moduleKey="quejas" />,              children: [{ path: '/quejas',           element: wrap(<QuejasPage />) }] },
          { element: <ModuleRoute moduleKey="reglamento" />,          children: [{ path: '/reglamento',       element: wrap(<ReglamentoPage />) }] },
          { element: <ModuleRoute moduleKey="drive" />,               children: [{ path: '/drive',            element: wrap(<DrivePage />) }] },
          { element: <ModuleRoute moduleKey="organigrama" />,         children: [{ path: '/organigrama',      element: wrap(<OrganigramaPage />) }] },
          { element: <ModuleRoute moduleKey="musica" />,              children: [{ path: '/musica',           element: wrap(<MusicaPage />) }] },
          { element: <ModuleRoute moduleKey="clientes" />,            children: [{ path: '/clientes',         element: wrap(<ClientesPage />) }] },
          { element: <ModuleRoute moduleKey="productos-servicios" />, children: [{ path: '/productos-servicios', element: wrap(<ProductosServiciosPage />) }] },
          { element: <ModuleRoute moduleKey="gastos" />,              children: [{ path: '/gastos',           element: wrap(<GastosPage />) }] },
          { element: <ModuleRoute moduleKey="mi-area" />,             children: [{ path: '/mi-area',          element: wrap(<MiAreaPage />) }] },
          { element: <ModuleRoute moduleKey="proyectos" />,           children: [{ path: '/proyectos',        element: wrap(<ProyectosPage />) }] },
          { element: <ModuleRoute moduleKey="asistencia-personal" />, children: [{ path: '/mi-asistencia',    element: wrap(<MiAsistenciaPage />) }] },
          { element: <ModuleRoute moduleKey="evaluacion" />,          children: [{ path: '/evaluacion-capacitacion', element: wrap(<EvaluacionCapacitacionPage />) }] },
          { element: <ModuleRoute moduleKey="expedientes" />,         children: [{ path: '/expediente',       element: wrap(<ExpedientePage />) }] },

          // Rutas protegidas por rol + módulo
          {
            element: <RoleRoute allowedRoles={['AD']} />,
            children: [
              { element: <ModuleRoute moduleKey="quejas" />,    children: [{ path: '/quejas/dashboard', element: wrap(<QuejasDashboardPage />) }] },
              { element: <ModuleRoute moduleKey="asistencia" />, children: [{ path: '/asistencia',      element: wrap(<AsistenciaReportePage />) }] },
              { element: <ModuleRoute moduleKey="nomina" />,    children: [{ path: '/nomina',           element: wrap(<NominaPage />) }] },
            ],
          },
          {
            element: <RoleRoute allowedRoles={['AD', 'TI']} />,
            children: [
              { element: <ModuleRoute moduleKey="usuarios" />,        children: [{ path: '/usuarios',         element: wrap(<UsuariosPage />) }] },
              { path: '/admin/vacaciones', element: <Navigate to="/vacaciones" replace /> },
              { element: <ModuleRoute moduleKey="encuestas" />,       children: [{ path: '/encuestas',        element: wrap(<EncuestasPage />) }] },
              { element: <ModuleRoute moduleKey="staff-ti" />,        children: [{ path: '/staff-ti',         element: wrap(<StaffTiPage />) }] },
              { element: <ModuleRoute moduleKey="activos" />,         children: [{ path: '/activos',          element: wrap(<ActivosPage />) }] },
              { element: <ModuleRoute moduleKey="vacantes" />,        children: [{ path: '/vacantes',         element: wrap(<VacantesPage />) }] },
              { element: <ModuleRoute moduleKey="chatbot" />,         children: [{ path: '/chatbot',          element: wrap(<ChatbotPage />) }] },
              { element: <ModuleRoute moduleKey="crm" />,             children: [{ path: '/crm-interno',      element: wrap(<CRMInternoPage />) }] },
              { element: <ModuleRoute moduleKey="email-marketing" />, children: [{ path: '/email-marketing',  element: wrap(<EmailMarketingPage />) }] },
              { element: <ModuleRoute moduleKey="reports" />,         children: [{ path: '/reportes',         element: wrap(<ReportesPage />) }] },
              { element: <ModuleRoute moduleKey="reports" />,         children: [{ path: '/banio',            element: wrap(<BanioReportePage />) }] },
              { path: '/areas', element: wrap(<PortalAreasPage />) },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general', element: wrap(<DireccionGeneralPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/planeacion-estrategica', element: wrap(<PlaneacionEstrategicaPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/indicadores-empresariales', element: wrap(<IndicadoresEmpresarialesPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/toma-decisiones', element: wrap(<TomaDecisionesPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/reportes-ejecutivos', element: wrap(<ReportesEjecutivosPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/mejora-continua', element: wrap(<MejoraContinuaPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/supervision-general', element: wrap(<SupervisionGeneralPage />) }] },
              { element: <ModuleRoute moduleKey="direccion-general" />, children: [{ path: '/direccion-general/:subSlug', element: wrap(<AreaSubModuloPage areaKey="direccion-general" />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad',          element: wrap(<CalidadPage />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad/retroalimentacion', element: wrap(<RetroalimentacionPage />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad/planes-mejora', element: wrap(<PlanesMejoraPage />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad/cumplimiento-procesos', element: wrap(<CumplimientoProcesosPage />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad/auditorias', element: wrap(<AuditoriasPage />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad/deteccion-errores', element: wrap(<DeteccionErroresPage />) }] },
              { element: <ModuleRoute moduleKey="calidad" />,         children: [{ path: '/calidad/:subSlug', element: wrap(<AreaSubModuloPage areaKey="calidad" />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing',        element: wrap(<MarketingPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/redes-sociales', element: wrap(<RedesSocialesPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/diseno', element: wrap(<DisenoPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/publicidad', element: wrap(<PublicidadPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/contenido', element: wrap(<ContenidoPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/imagen-corporativa', element: wrap(<ImagenCorporativaPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/resultados', element: wrap(<ResultadosPage />) }] },
              { element: <ModuleRoute moduleKey="marketing" />,       children: [{ path: '/marketing/:subSlug', element: wrap(<AreaSubModuloPage areaKey="marketing" />) }] },
              { element: <ModuleRoute moduleKey="legal" />,           children: [{ path: '/legal',            element: wrap(<LegalPage />) }] },
              { element: <ModuleRoute moduleKey="legal" />,           children: [{ path: '/legal/contratos',  element: wrap(<ContratosPage />) }] },
              { element: <ModuleRoute moduleKey="legal" />,           children: [{ path: '/legal/proteccion-datos', element: wrap(<ProteccionDatosPage />) }] },
              { element: <ModuleRoute moduleKey="legal" />,           children: [{ path: '/legal/cumplimiento-normativo', element: wrap(<CumplimientoNormativoPage />) }] },
              { element: <ModuleRoute moduleKey="legal" />,           children: [{ path: '/legal/control-documental', element: wrap(<ControlDocumentalPage />) }] },
              { element: <ModuleRoute moduleKey="legal" />,           children: [{ path: '/legal/:subSlug',   element: wrap(<AreaSubModuloPage areaKey="legal" />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas',         element: wrap(<FinanzasPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/ingresos', element: wrap(<IngresosPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/bancos', element: wrap(<BancosPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/egresos', element: wrap(<EgresosPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/cuentas-cobrar', element: wrap(<CuentasCobrarPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/reportes-financieros', element: wrap(<ReportesFinancierosPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/presupuestos', element: wrap(<PresupuestosPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/cuentas-pagar', element: wrap(<CuentasPagarPage />) }] },
              { element: <ModuleRoute moduleKey="finanzas" />,        children: [{ path: '/finanzas/:subSlug', element: wrap(<AreaSubModuloPage areaKey="finanzas" />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area',      element: wrap(<VentasAreaPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/metas', element: wrap(<MetasVentasPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/reportes-resultados', element: wrap(<ReportesResultadosPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/asesores', element: wrap(<AsesoresVentasPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/prospeccion', element: wrap(<ProspeccionPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/comisiones', element: wrap(<ComisionesPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/incentivos', element: wrap(<IncentivosPage />) }] },
              { element: <ModuleRoute moduleKey="ventas-area" />,     children: [{ path: '/ventas-area/:subSlug', element: wrap(<AreaSubModuloPage areaKey="ventas" />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones',      element: wrap(<OperacionesPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/campanas', element: wrap(<CampanasPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/supervisores', element: wrap(<SupervisoresPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/tiempos', element: wrap(<TiemposPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/kpis', element: wrap(<KpisOperacionesPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/metas', element: wrap(<MetasPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/reportes-diarios', element: wrap(<ReportesDiariosPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/asesores', element: wrap(<AsesoresPage />) }] },
              { element: <ModuleRoute moduleKey="operaciones" />,     children: [{ path: '/operaciones/:subSlug', element: wrap(<AreaSubModuloPage areaKey="operaciones" />) }] },
              { element: <ModuleRoute moduleKey="tecnologia" />,      children: [{ path: '/tecnologia',       element: wrap(<TecnologiaPage />) }] },
              { element: <ModuleRoute moduleKey="tecnologia" />,      children: [{ path: '/tecnologia/internet-redes', element: wrap(<InternetRedesPage />) }] },
              { element: <ModuleRoute moduleKey="tecnologia" />,      children: [{ path: '/tecnologia/respaldos', element: wrap(<RespaldosPage />) }] },
              { element: <ModuleRoute moduleKey="tecnologia" />,      children: [{ path: '/tecnologia/sistemas', element: wrap(<SistemasPage />) }] },
              { element: <ModuleRoute moduleKey="tecnologia" />,      children: [{ path: '/tecnologia/:subSlug', element: wrap(<AreaSubModuloPage areaKey="ti" />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente', element: wrap(<AtencionClientePage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/consultas', element: wrap(<ConsultasPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/aclaraciones', element: wrap(<AclaracionesPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/seguimiento', element: wrap(<SeguimientoPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/satisfaccion', element: wrap(<SatisfaccionPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/retencion', element: wrap(<RetencionPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/clientes', element: wrap(<ClientesListaPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/clientes/dashboard', element: wrap(<ClientesDashboardPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/clientes/:id', element: wrap(<ClientePerfilPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/mis-tareas', element: wrap(<MisTareasPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/incidencias', element: wrap(<IncidenciasPage />) }] },
              { element: <ModuleRoute moduleKey="atencion-cliente" />, children: [{ path: '/atencion-cliente/:subSlug', element: wrap(<AreaSubModuloPage areaKey="atencion-cliente" />) }] },
              { element: <ModuleRoute moduleKey="rh-area" />,         children: [{ path: '/rh',               element: wrap(<RHPage />) }] },
              { element: <ModuleRoute moduleKey="rh-area" />,         children: [{ path: '/rh/reclutamiento', element: wrap(<ReclutamientoPage />) }] },
              { element: <ModuleRoute moduleKey="rh-area" />,         children: [{ path: '/rh/clima-laboral', element: wrap(<ClimaLaboralPage />) }] },
              { element: <ModuleRoute moduleKey="capacitacion" />,    children: [{ path: '/rh/capacitacion',  element: wrap(<CapacitacionPage />) }] },
              { element: <ModuleRoute moduleKey="incapacidades" />,   children: [{ path: '/rh/incapacidades', element: wrap(<IncapacidadesPage />) }] },
              { element: <ModuleRoute moduleKey="evaluacion-desempeno" />, children: [{ path: '/rh/evaluacion-desempeno', element: wrap(<EvaluacionDesempenoPage />) }] },
              { element: <ModuleRoute moduleKey="rh-area" />,         children: [{ path: '/rh/:subSlug',      element: wrap(<AreaSubModuloPage areaKey="rh" />) }] },
              { element: <ModuleRoute moduleKey="configuracion" />,   children: [{ path: '/configuracion',    element: wrap(<ConfiguracionPage />) }] },
            ],
          },
          {
            element: <RoleRoute allowedRoles={['AD', 'CC']} />,
            children: [
              { element: <ModuleRoute moduleKey="webphone" />, children: [{ path: '/webphone', element: wrap(<WebphonePage />) }] },
              { element: <ModuleRoute moduleKey="livechat" />, children: [{ path: '/livechat', element: wrap(<LivechatPage />) }] },
            ],
          },
          {
            element: <RoleRoute allowedRoles={['AD']} />,
            children: [
              { element: <ModuleRoute moduleKey="auditoria" />, children: [{ path: '/auditoria',     element: wrap(<AuditoriaPage />) }] },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },

      // ── Ventas (layout propio, sin sidebar de intranet) ──────────────
      {
        element: <VentasLayout />,
        children: [
          { path: '/ventas', element: wrap(<VentasPage />) },
        ],
      },

    ],
  },
])
