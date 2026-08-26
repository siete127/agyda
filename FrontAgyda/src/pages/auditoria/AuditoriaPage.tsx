import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Spinner } from '@/components/ui/Spinner'

interface AuditRow {
  id: number
  usuarioId: number | null
  usuarioNombre: string | null
  modulo: string
  accion: string
  entidadId: string | null
  detalle: string | null
  ip: string | null
  fecha: string
}

interface AuditResp {
  success: boolean
  data: AuditRow[]
  total: number
  page: number
  pages: number
}

const MODULO_COLORS: Record<string, string> = {
  usuarios:   'bg-blue-100 text-blue-700',
  accesos:    'bg-purple-100 text-purple-700',
  vacaciones: 'bg-green-100 text-green-700',
  nomina:     'bg-orange-100 text-orange-700',
  tickets:    'bg-red-100 text-red-700',
  proyectos:  'bg-indigo-100 text-indigo-700',
  tareas:     'bg-cyan-100 text-cyan-700',
  quejas:     'bg-yellow-100 text-yellow-700',
  noticias:   'bg-pink-100 text-pink-700',
  activos:    'bg-teal-100 text-teal-700',
  encuestas:  'bg-lime-100 text-lime-700',
  expedientes:'bg-amber-100 text-amber-700',
}

const ACCION_LABELS: Record<string, string> = {
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  activar: 'Activar',
  desactivar: 'Desactivar',
  'set-accesos': 'Set Accesos',
  grant: 'Conceder',
  revoke: 'Revocar',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  'cancelar-aprobacion': 'Cancelar Aprobación',
  calcular: 'Calcular',
  revertir: 'Revertir',
  'editar-config': 'Editar Config',
}

function fmtFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AuditoriaPage() {
  const user = useAuthStore((s) => s.user)
  const [modulo, setModulo]       = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage]           = useState(1)
  const [detailRow, setDetailRow] = useState<AuditRow | null>(null)

  const params = new URLSearchParams()
  if (modulo)     params.set('modulo', modulo)
  if (fechaDesde) params.set('fechaDesde', fechaDesde)
  if (fechaHasta) params.set('fechaHasta', fechaHasta)
  params.set('page', String(page))
  params.set('limit', '50')

  const { data, isLoading } = useQuery<AuditResp>({
    queryKey: ['auditoria', modulo, fechaDesde, fechaHasta, page],
    queryFn:  () => api.get(`/auditoria?${params}`).then(r => r.data),
    staleTime: 30_000,
  })

  const rows  = data?.data ?? []
  const pages = data?.pages ?? 1
  const total = data?.total ?? 0

  if (user?.tipoUsuario !== 'AD') return null

  return (
    <div className="animate-fade-in space-y-6">
      {/* Banner */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <ScrollText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Auditoría del Sistema</h1>
              <p className="mt-0.5 text-xs text-white/50">Registro de cambios realizados por los administradores</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap gap-3 p-4">
        <select
          value={modulo}
          onChange={e => { setModulo(e.target.value); setPage(1) }}
          className="field h-9 rounded-lg px-3 text-sm"
        >
          <option value="">Todos los módulos</option>
          <option value="usuarios">Usuarios</option>
          <option value="accesos">Accesos</option>
          <option value="vacaciones">Vacaciones</option>
          <option value="nomina">Nómina</option>
          <option value="tickets">Tickets</option>
          <option value="proyectos">Proyectos</option>
          <option value="tareas">Tareas</option>
          <option value="quejas">Quejas</option>
          <option value="noticias">Noticias</option>
          <option value="activos">Activos</option>
          <option value="encuestas">Encuestas</option>
          <option value="expedientes">Expedientes</option>
        </select>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
            className="field h-9 rounded-lg px-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
            className="field h-9 rounded-lg px-3 text-sm"
          />
        </div>

        {(modulo || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setModulo(''); setFechaDesde(''); setFechaHasta(''); setPage(1) }}
            className="text-sm text-gray-500 underline"
          >
            Limpiar
          </button>
        )}

        <span className="ml-auto self-center text-sm text-gray-500">{total} registros</span>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Sin registros</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Módulo</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                    <td className="px-4 py-2.5 font-medium">{r.usuarioNombre ?? <span className="text-gray-400 italic">Sistema</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold capitalize ${MODULO_COLORS[r.modulo] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.modulo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{ACCION_LABELS[r.accion] ?? r.accion}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.entidadId ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{r.ip ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.detalle ? (
                        <button
                          onClick={() => setDetailRow(r)}
                          className="rounded p-1 hover:bg-gray-100"
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4 text-gray-400" />
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-500">Página {page} de {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      {detailRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-3 font-semibold text-gray-800">Detalle de auditoría #{detailRow.id}</h3>
            <pre className="max-h-72 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {JSON.stringify(JSON.parse(detailRow.detalle ?? '{}'), null, 2)}
            </pre>
            <button
              onClick={() => setDetailRow(null)}
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
