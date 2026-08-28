import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSocket } from '@/lib/socket'
import { personalizacionService } from '@/services/personalizacion.service'
import { PersonalizacionContext, DEFAULT_CONFIG, DEFAULT_BRANDING } from './personalizacion.context'

/* ── Utilidades de color ────────────────────────────────────── */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return [47, 111, 237]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
// amount < 0 oscurece, > 0 aclara (mezcla con negro/blanco).
function shade([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  const mix = (c: number) => {
    const target = amount < 0 ? 0 : 255
    const t = Math.abs(amount)
    return Math.round(c * (1 - t) + target * t)
  }
  return [mix(r), mix(g), mix(b)]
}
const rgbStr = ([r, g, b]: [number, number, number]) => `${r} ${g} ${b}`

function aplicarColor(hex: string) {
  const base = hexToRgb(hex)
  const root = document.documentElement.style
  root.setProperty('--color-brand', rgbStr(base))
  root.setProperty('--color-brand-dark', rgbStr(shade(base, -0.32)))
  root.setProperty('--color-brand-light', rgbStr(shade(base, 0.90)))
  root.setProperty('--color-brand-muted', rgbStr(shade(base, 0.42)))
}

function aplicarFavicon(url: string | null) {
  if (!url) return
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = url
}

export function PersonalizacionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()

  const { data: config = DEFAULT_CONFIG } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const b = config.branding

  useEffect(() => { aplicarColor(b.colorBrand || DEFAULT_BRANDING.colorBrand) }, [b.colorBrand])

  useEffect(() => {
    document.title = b.nombreLargo ? `${b.nombreLargo} · Intranet` : 'Intranet'
  }, [b.nombreLargo])

  useEffect(() => {
    aplicarFavicon(personalizacionService.assetUrl(b.faviconId))
  }, [b.faviconId])

  useEffect(() => {
    const sock = getSocket()
    const onUpdate = () => qc.invalidateQueries({ queryKey: ['personalizacion'] })
    sock.on('personalizacion:updated', onUpdate)
    return () => { sock.off('personalizacion:updated', onUpdate) }
  }, [qc])

  return <PersonalizacionContext.Provider value={config}>{children}</PersonalizacionContext.Provider>
}
