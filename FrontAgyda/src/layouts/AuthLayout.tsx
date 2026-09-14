import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import Particles from '@/components/effects/Particles'
import GlowCursor from '@/components/effects/GlowCursor'
import { GlobeBackground } from '@/components/effects/GlobeBackground'
import { Ardabito } from '@/components/effects/Ardabito'

export function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isInitialized   = useAuthStore((s) => s.isInitialized)

  if (isInitialized && isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0D1B3E]">
      {/* Globo 3D — solo en pantallas grandes, mismo breakpoint que tenía el
         video de fondo anterior. Ancla por altura (no por %) para que nunca
         se recorte verticalmente sin importar la relación de aspecto de la
         pantalla: el contenedor es siempre cuadrado según el alto real
         disponible, centrado en la mitad izquierda. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-0 hidden w-[55%] [@media(min-width:1024px)_and_(min-height:855px)]:block">
        <div className="absolute left-1/2 top-1/2 aspect-square h-[92vh] max-h-full -translate-x-1/2 -translate-y-1/2">
          <GlobeBackground className="h-full w-full" rotationSpeed={0.08} cameraDistance={6.3} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-[#0D1B3E]/80 via-[#0D1B3E]/55 to-[#0D1B3E]/85" />

      {/* Ardabito — delante del globo (y de su overlay), superpuesto sobre
         el propio globo. Ancho en vw (con piso/techo en px) para que escale
         con el tamaño real de pantalla en vez de quedar fijo. Su propio
         breakpoint (solo min-width, sin min-height) es más permisivo que el
         del globo — antes compartían la misma condición y Ardabito
         desaparecía de golpe junto con el globo en pantallas de menor alto. */}
      <div className="pointer-events-none absolute inset-0 z-[5] hidden lg:block">
        <div className="absolute bottom-0 left-[48%] w-[min(34vw,620px)] min-w-[360px] -translate-x-1/2">
          <Ardabito />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <Particles
          particleColors={['#22D3EE', '#5B8DEF', '#ffffff']}
          particleCount={220}
          particleSpread={12}
          speed={0.08}
          particleBaseSize={90}
          moveParticlesOnHover={false}
          alphaParticles
          disableRotation={false}
        />
      </div>

      {/* Estela luminosa que sigue al cursor*/}
      <div className="pointer-events-none absolute inset-0 z-20">
        <GlowCursor
          color="#67E8F9"
          secondaryColor="#A78BFA"
          trailLength={40}
          trailWidth={8}
          trailTaper={0.8}
          followSpeed={0.16}
          glowIntensity={1.9}
          glowSpread={1.2}
          hotspot={0.65}
          brightness={1.25}
          opacity={1}
          pulseSpeed={1.1}
          noiseStrength={0.035}
          idleFade
          idleTimeout={700}
          fadeDuration={900}
          blendMode="screen"
        />
      </div>

      <div className="absolute left-6 top-6 z-30 leading-tight lg:left-10 lg:top-10">
        <p className="text-base font-bold text-white tracking-wide lg:text-lg">AGYDA</p>
        <p className="text-[0.7rem] text-blue-200/60 lg:text-xs">Soluciones de tecnología</p>
      </div>

      <div className="relative z-30 flex flex-1 flex-col items-center justify-center px-6 py-10 lg:items-end lg:pr-[8%]">
        <div className="w-full max-w-[400px] animate-slide-up">
          <Outlet />
        </div>
      </div>

      <footer className="relative z-30 px-6 pb-6 text-center">
        <div className="mx-auto mb-4 h-px max-w-[400px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <p className="text-[0.68rem] text-blue-200/30">
          © {new Date().getFullYear()} ArdaBytec · Todos los derechos reservados · v20.11.0
        </p>
      </footer>
    </div>
  )
}
