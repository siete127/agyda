import type { ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** Orden de aparición dentro de la secuencia — cada índice suma 70ms de
     delay, así las cards se van "dibujando" una por una al entrar al
     dashboard en vez de aparecer todas de golpe. */
  index?: number
  className?: string
}

export function Reveal({ children, index = 0, className }: RevealProps) {
  return (
    <div
      className={`animate-slide-up ${className ?? ''}`}
      style={{ animationDelay: `${index * 70}ms`, animationFillMode: 'backwards' }}
    >
      {children}
    </div>
  )
}
