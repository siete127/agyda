import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Megaphone, Share2, Palette, Wallet, Newspaper, ArrowRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { marketingService } from '@/services/marketing.service'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { EnConstruccion } from '@/components/ui/EnConstruccion'

function formatMoney(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

interface DetalleTarjeta {
  key: string
  icon: React.ElementType
  titulo: string
  linkTo: string
  metricas: { label: string; value: string | number }[]
}

export function ResultadosPage() {
  return <EnConstruccion titulo="Resultados" subtitulo="Panorama consolidado de Marketing" />
}

function ResultadosPageContent() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketing-resultados'],
    queryFn: () => marketingService.getResultados(),
    staleTime: 30_000,
  })

  const stats: DashboardStat[] = data ? [
    { key: 'campanias', icon: Megaphone, label: 'Campañas activas', value: data.snapshot.campaniasActivas, tone: 'brand' },
    { key: 'redes', icon: Share2, label: 'Posts publicados este mes', value: data.snapshot.postsPublicadosMes, tone: 'success' },
    { key: 'diseno', icon: Palette, label: 'Diseños entregados este mes', value: data.snapshot.disenoEntregadasMes, tone: 'brand' },
    { key: 'publicidad', icon: Wallet, label: 'Gasto en publicidad del mes', value: formatMoney(data.snapshot.gastoPublicidadMes), tone: 'warn' },
    { key: 'contenido', icon: Newspaper, label: 'Piezas publicadas este mes', value: data.snapshot.piezasPublicadasMes, tone: 'success' },
  ] : []

  const tarjetas: DetalleTarjeta[] = data ? [
    {
      key: 'campanias', icon: Megaphone, titulo: 'Campañas', linkTo: '/marketing',
      metricas: [
        { label: 'Activas', value: data.snapshot.campaniasActivas },
        { label: 'Presupuesto total', value: formatMoney(data.snapshot.presupuestoTotal) },
      ],
    },
    {
      key: 'redes', icon: Share2, titulo: 'Redes sociales', linkTo: '/marketing/redes-sociales',
      metricas: [{ label: 'Publicados este mes', value: data.snapshot.postsPublicadosMes }],
    },
    {
      key: 'diseno', icon: Palette, titulo: 'Diseño', linkTo: '/marketing/diseno',
      metricas: [
        { label: 'En proceso', value: data.snapshot.disenoEnProceso },
        { label: 'Entregadas este mes', value: data.snapshot.disenoEntregadasMes },
      ],
    },
    {
      key: 'publicidad', icon: Wallet, titulo: 'Publicidad', linkTo: '/marketing/publicidad',
      metricas: [{ label: 'Gasto del mes', value: formatMoney(data.snapshot.gastoPublicidadMes) }],
    },
    {
      key: 'contenido', icon: Newspaper, titulo: 'Contenido', linkTo: '/marketing/contenido',
      metricas: [{ label: 'Publicadas este mes', value: data.snapshot.piezasPublicadasMes }],
    },
  ] : []

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Resultados</h1>
            <p className="text-xs text-blue-200/70">Panorama consolidado de todos los sub-módulos de Marketing</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow stats={stats} />

          <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-ink">Tendencia de los últimos 6 meses</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.tendencia}>
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="postsPublicados" name="Posts publicados" stroke="#1B4FD8" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="solicitudesEntregadas" name="Diseños entregados" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="piezasPublicadas" name="Piezas de contenido" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="gastoPublicidad" name="Gasto publicidad" stroke="#D97706" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold text-ink">Detalle por sub-módulo</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tarjetas.map((t) => (
                <Link
                  key={t.key}
                  to={t.linkTo}
                  className="group flex flex-col rounded-2xl border border-gray-100 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <t.icon className="h-4 w-4 text-brand" /> {t.titulo}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  <div className="space-y-1">
                    {t.metricas.map((m) => (
                      <div key={m.label} className="flex items-center justify-between text-xs">
                        <span className="text-ink-tertiary">{m.label}</span>
                        <span className="font-semibold text-ink">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
