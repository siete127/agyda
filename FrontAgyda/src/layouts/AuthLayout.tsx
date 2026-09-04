import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import Particles from '@/components/effects/Particles'
import GlowCursor from '@/components/effects/GlowCursor'

const FONDO_VIDEO_SRC = '/fondo-login.mp4'

export function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isInitialized   = useAuthStore((s) => s.isInitialized)

  if (isInitialized && isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0D1B3E]">
      <video
        src={FONDO_VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full object-contain [@media(min-width:1024px)_and_(min-height:855px)]:block"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-[#0D1B3E]/80 via-[#0D1B3E]/55 to-[#0D1B3E]/85" />

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

      <div className="absolute left-6 top-6 z-30 flex items-center gap-3 lg:left-10 lg:top-10">
        <img
          src="/Logo_AGYDA.png"
          alt="AGYDA"
          className="h-14 w-auto lg:h-16"
        />
        <div className="leading-tight">
          <p className="text-base font-bold text-white tracking-wide lg:text-lg">AGYDA</p>
          <p className="text-[0.7rem] text-blue-200/60 lg:text-xs">Soluciones en tecnología</p>
        </div>
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
