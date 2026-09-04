// Los componentes de efectos del login (Particles, GlowCursor) vienen en .jsx
// sin tipos. Se declaran como módulos con props abiertas para no bloquear tsc.
declare module '@/components/effects/Particles' {
  import type { ComponentType } from 'react'
  const Particles: ComponentType<Record<string, unknown>>
  export default Particles
}

declare module '@/components/effects/GlowCursor' {
  import type { ComponentType } from 'react'
  const GlowCursor: ComponentType<Record<string, unknown>>
  export default GlowCursor
}
