import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portalClienteService } from '@/services/portalCliente.service'

export interface ResultadoBusqueda {
  tipo: 'Factura' | 'Cotización' | 'Reunión' | 'Documento' | 'Producto' | 'Servicio' | 'Solicitud'
  titulo: string
  subtitulo: string
  ruta: string
}

// Mismas queryKeys que ya usa cada página del portal, así la búsqueda global
// reutiliza el cache en vez de disparar llamadas nuevas cuando esas páginas
// ya se visitaron en la sesión.
export function usePortalBusqueda(termino: string) {
  const activo = termino.trim().length >= 2

  const facturas = useQuery({ queryKey: ['portal-facturas'], queryFn: () => portalClienteService.getFacturas(), enabled: activo })
  const cotizaciones = useQuery({ queryKey: ['portal-cotizaciones'], queryFn: () => portalClienteService.getCotizaciones(), enabled: activo })
  const citas = useQuery({ queryKey: ['portal-citas'], queryFn: () => portalClienteService.getCitas(), enabled: activo })
  const documentos = useQuery({ queryKey: ['portal-documentos'], queryFn: () => portalClienteService.getDocumentos(), enabled: activo })
  const productos = useQuery({ queryKey: ['portal-productos-servicios'], queryFn: () => portalClienteService.getProductosServicios(), enabled: activo })
  const incidencias = useQuery({ queryKey: ['portal-incidencias'], queryFn: () => portalClienteService.getIncidencias(), enabled: activo })

  const isLoading = activo && (facturas.isLoading || cotizaciones.isLoading || citas.isLoading || documentos.isLoading || productos.isLoading || incidencias.isLoading)

  const resultados = useMemo<ResultadoBusqueda[]>(() => {
    if (!activo) return []
    const q = termino.trim().toLowerCase()
    const out: ResultadoBusqueda[] = []

    for (const f of facturas.data ?? []) {
      const folio = `${f.serie ?? ''}${f.folio ?? ''}`
      if (folio.toLowerCase().includes(q)) {
        out.push({ tipo: 'Factura', titulo: folio || `Factura ${f.id}`, subtitulo: f.estatus, ruta: '/portal-cliente/facturas' })
      }
    }
    for (const c of cotizaciones.data ?? []) {
      if (c.folio?.toLowerCase().includes(q) || c.titulo?.toLowerCase().includes(q)) {
        out.push({ tipo: 'Cotización', titulo: c.titulo || c.folio, subtitulo: c.folio, ruta: '/portal-cliente/cotizaciones' })
      }
    }
    for (const c of citas.data ?? []) {
      if (c.titulo?.toLowerCase().includes(q)) {
        out.push({ tipo: 'Reunión', titulo: c.titulo, subtitulo: new Date(c.fechaHora).toLocaleDateString('es-MX'), ruta: '/portal-cliente/reuniones' })
      }
    }
    for (const d of documentos.data ?? []) {
      if (d.nombreOriginal?.toLowerCase().includes(q)) {
        out.push({ tipo: 'Documento', titulo: d.nombreOriginal, subtitulo: 'Documento', ruta: '/portal-cliente/documentos' })
      }
    }
    for (const p of productos.data ?? []) {
      if (p.nombre?.toLowerCase().includes(q)) {
        out.push({ tipo: p.tipo === 'SERVICIO' ? 'Servicio' : 'Producto', titulo: p.nombre, subtitulo: p.tipo === 'SERVICIO' ? 'Servicio contratado' : 'Producto contratado', ruta: '/portal-cliente/productos' })
      }
    }
    for (const i of incidencias.data ?? []) {
      if (i.titulo?.toLowerCase().includes(q) || i.folio?.toLowerCase().includes(q)) {
        out.push({ tipo: 'Solicitud', titulo: i.titulo, subtitulo: i.folio, ruta: '/portal-cliente/atencion' })
      }
    }
    return out.slice(0, 20)
  }, [activo, termino, facturas.data, cotizaciones.data, citas.data, documentos.data, productos.data, incidencias.data])

  return { resultados, isLoading, activo }
}
