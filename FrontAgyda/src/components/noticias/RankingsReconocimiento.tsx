import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RankingPodioCard, type FiltroPeriodo } from '@/components/ui/RankingPodioCard'
import { ticketsService } from '@/services/tickets.service'
import { ventasAreaService } from '@/services/ventasArea.service'
import { asistenciaReporteService } from '@/services/asistenciaReporte.service'

const FILTRO_DEFAULT: FiltroPeriodo = { tipo: 'mes' }
const hoyISO = () => new Date().toISOString().slice(0, 10)

// El endpoint de asistencia usa desde/hasta concretos (no periodo=semana|mes|
// rango) — se deriva aquí del mismo FiltroPeriodo que usan los otros rankings,
// para que el selector se vea y comporte igual en las 3 tarjetas.
function filtroADesdeHasta(f: FiltroPeriodo): { desde: string; hasta: string } | null {
  const hoy = new Date()
  if (f.tipo === 'semana') {
    const dia = hoy.getDay() || 7
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - dia + 1)
    return { desde: desde.toISOString().slice(0, 10), hasta: hoyISO() }
  }
  if (f.tipo === 'rango') {
    return f.desde && f.hasta ? { desde: f.desde, hasta: f.hasta } : null
  }
  const [anio, mes] = (f.mes || hoyISO().slice(0, 7)).split('-').map(Number)
  const desde = new Date(anio, mes - 1, 1)
  const finMes = new Date(anio, mes, 0)
  const esMesActual = anio === hoy.getFullYear() && mes - 1 === hoy.getMonth()
  return { desde: desde.toISOString().slice(0, 10), hasta: esMesActual ? hoyISO() : finMes.toISOString().slice(0, 10) }
}

// Tarjetas de reconocimiento arriba de "Noticias destacadas": ranking de
// tickets resueltos (soporte), de % de asistencia por área (CC/AD/TI) y de
// ventas totales del periodo (Call Center). Visible para todos los usuarios —
// solo nombre+número, sin datos operativos sensibles (eso sigue viviendo
// detrás de tickets:ver / ventas-area:ver-metas / verificarRol(['AD']) en sus
// módulos originales).
export function RankingsReconocimiento() {
  const [filtroTickets, setFiltroTickets] = useState<FiltroPeriodo>(FILTRO_DEFAULT)
  const [filtroAreas, setFiltroAreas] = useState<FiltroPeriodo>(FILTRO_DEFAULT)
  const [filtroMetas, setFiltroMetas] = useState<FiltroPeriodo>(FILTRO_DEFAULT)

  const { data: rankingTickets = [], isLoading: cargandoTickets } = useQuery({
    queryKey: ['noticias-ranking-tickets', filtroTickets],
    queryFn: () => ticketsService.getRanking(filtroTickets.tipo, { mes: filtroTickets.mes, desde: filtroTickets.desde, hasta: filtroTickets.hasta }),
    staleTime: 5 * 60_000,
    enabled: filtroTickets.tipo !== 'rango' || !!(filtroTickets.desde && filtroTickets.hasta),
  })

  const rangoAreas = filtroADesdeHasta(filtroAreas)
  const { data: rankingAreas = [], isLoading: cargandoAreas } = useQuery({
    queryKey: ['noticias-ranking-asistencia', filtroAreas],
    queryFn: () => asistenciaReporteService.getRanking(rangoAreas!.desde, rangoAreas!.hasta),
    staleTime: 5 * 60_000,
    enabled: !!rangoAreas,
  })

  const { data: rankingMetas = [], isLoading: cargandoMetas } = useQuery({
    queryKey: ['noticias-ranking-metas', filtroMetas],
    queryFn: () => ventasAreaService.getRankingCumplimiento(filtroMetas.tipo, { mes: filtroMetas.mes, desde: filtroMetas.desde, hasta: filtroMetas.hasta }),
    staleTime: 5 * 60_000,
    enabled: filtroMetas.tipo !== 'rango' || !!(filtroMetas.desde && filtroMetas.hasta),
  })

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <RankingPodioCard
        titulo="Ranking de tickets resueltos"
        descripcion="Agentes con más tickets resueltos"
        icono={<img src="/icons/ranking-soporte.gif" alt="" className="h-8 w-8 object-contain" />}
        items={rankingTickets.map((r) => ({ id: r.agenteId, nombre: r.nombre, valor: r.total, fotoUrl: r.fotoUrl }))}
        etiquetaColumna="Tickets"
        filtro={filtroTickets}
        onFiltroChange={setFiltroTickets}
        isLoading={cargandoTickets}
      />
      <RankingPodioCard
        titulo="Ranking por área de asistencia"
        descripcion="Áreas con mejor % de asistencia"
        icono={<img src="/icons/ranking-areas.gif" alt="" className="h-8 w-8 object-contain" />}
        items={rankingAreas.map((r) => ({ id: r.area, nombre: r.nombre, valor: r.pctAsistencia }))}
        formatoValor={(v) => `${v}%`}
        etiquetaColumna="Asistencia"
        filtro={filtroAreas}
        onFiltroChange={setFiltroAreas}
        isLoading={cargandoAreas}
      />
      <RankingPodioCard
        titulo="Ranking de ventas"
        descripcion="Agentes con más ventas del periodo"
        icono={<img src="/icons/ranking-ventas.gif" alt="" className="h-8 w-8 object-contain" />}
        items={rankingMetas.map((r) => ({ id: r.neusId ?? r.nombre, nombre: r.nombre, valor: r.ventasTotal }))}
        etiquetaColumna="Ventas"
        filtro={filtroMetas}
        onFiltroChange={setFiltroMetas}
        isLoading={cargandoMetas}
      />
    </div>
  )
}
