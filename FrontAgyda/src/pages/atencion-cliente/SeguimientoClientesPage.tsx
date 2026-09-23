import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Headphones, Users, Inbox, CalendarClock, Gift, Smile, ShieldAlert, CalendarDays, BarChart3,
} from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { ClientesListaPage } from './clientes/ClientesListaPage'
import { ClienteDrawer } from './clientes/ClienteDrawer'
import { CasosPage } from './CasosPage'
import { AgendaCitasPage } from './AgendaCitasPage'
import { OfertasPage } from './OfertasPage'
import { SatisfaccionPage } from './SatisfaccionPage'
import { RetencionPage } from './RetencionPage'
import { MiAgendaPage } from './MiAgendaPage'

// Módulo "Seguimiento de clientes" — única entrada del sidebar. Colapsa las 7
// pantallas del área en pestañas. La lista de clientes es la pestaña "Clientes";
// al abrir un cliente, su expediente aparece en un panel lateral (ClienteDrawer)
// sin perder la lista detrás.
//
// Estado en la URL:
//   ?tab=<clientes|casos|agenda|ofertas|satisfaccion|retencion|mi-agenda>
//   ?id=<contactoId>   → abre el drawer del expediente
//   ?exp=<datos|seguimiento|casos-pagos|documentos> & ?sub=<...>  → pestaña del expediente
// Los query params de deep-link de cada sub-página (casoId, citaId, tipo,
// estatus) conviven en el mismo useSearchParams — usan nombres distintos.

type Tab = 'clientes' | 'casos' | 'agenda' | 'ofertas' | 'satisfaccion' | 'retencion' | 'mi-agenda'
const TAB_KEYS: Tab[] = ['clientes', 'casos', 'agenda', 'ofertas', 'satisfaccion', 'retencion', 'mi-agenda']

const SUBTITULO: Record<Tab, string> = {
  clientes: 'Cartera de clientes y sus expedientes',
  casos: 'Consultas, aclaraciones, quejas e incidencias',
  agenda: 'Citas y sesiones de tratamiento',
  ofertas: 'Campañas a segmentos por correo y WhatsApp',
  satisfaccion: 'Encuestas y medición de satisfacción',
  retencion: 'Clientes en riesgo y acciones de retención',
  'mi-agenda': 'Tu agenda del día: tareas y seguimientos',
}

export function SeguimientoClientesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const tab: Tab = TAB_KEYS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'clientes'
  const setTab = (t: Tab) => setParams((p) => {
    p.set('tab', t)
    // limpia los params específicos de otras pestañas al cambiar
    for (const k of ['casoId', 'citaId', 'estatus', 'id', 'exp']) p.delete(k)
    return p
  }, { replace: true })

  const clienteId = params.get('id') ? Number(params.get('id')) : null
  const abrirCliente = (id: number) => setParams((p) => { p.set('id', String(id)); return p }, { replace: true })
  const cerrarCliente = () => setParams((p) => { p.delete('id'); p.delete('exp'); p.delete('sub'); return p }, { replace: true })
  const setExp = (t: string) => setParams((p) => { p.set('exp', t); p.delete('sub'); return p }, { replace: true })
  const setExpSub = (s: string) => setParams((p) => { p.set('sub', s); return p }, { replace: true })

  const TABS: TabItem<Tab>[] = [
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'casos', label: 'Casos', icon: Inbox },
    { key: 'agenda', label: 'Agenda', icon: CalendarClock },
    { key: 'ofertas', label: 'Ofertas', icon: Gift },
    { key: 'satisfaccion', label: 'Satisfacción', icon: Smile },
    { key: 'retencion', label: 'Retención', icon: ShieldAlert },
    { key: 'mi-agenda', label: 'Mi agenda', icon: CalendarDays },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Headphones className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Seguimiento de clientes</h1>
                <p className="mt-0.5 text-xs text-blue-100/80">{SUBTITULO[tab]}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/atencion-cliente/clientes/dashboard')}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:bg-white/25 transition-colors"
            >
              <BarChart3 className="h-4 w-4" /> Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'clientes' && <ClientesListaPage embedded onAbrirCliente={abrirCliente} />}
      {tab === 'casos' && <CasosPage embedded />}
      {tab === 'agenda' && <AgendaCitasPage embedded />}
      {tab === 'ofertas' && <OfertasPage embedded />}
      {tab === 'satisfaccion' && <SatisfaccionPage embedded />}
      {tab === 'retencion' && <RetencionPage embedded />}
      {tab === 'mi-agenda' && <MiAgendaPage embedded />}

      {clienteId != null && Number.isFinite(clienteId) && (
        <ClienteDrawer
          contactoId={clienteId}
          expParam={params.get('exp')}
          subParam={params.get('sub')}
          onExp={setExp}
          onSub={setExpSub}
          onClose={cerrarCliente}
        />
      )}
    </div>
  )
}
