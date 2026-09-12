import { useCountUp } from '@/pages/portal-cliente/hooks/useCountUp'

interface CountUpProps {
  end: number
  prefix?: string
  suffix?: string
  /** Formatea con separador de miles (es-MX) — activado por defecto. */
  thousands?: boolean
  durationMs?: number
  className?: string
}

export function CountUp({ end, prefix = '', suffix = '', thousands = true, durationMs, className }: CountUpProps) {
  const value = useCountUp(end, durationMs)
  const formatted = thousands ? value.toLocaleString('es-MX') : String(value)
  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}
