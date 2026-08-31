import { createPortal } from 'react-dom'
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

// Refleja utils/passwordPolicy.js (backend) — se valida también aquí para dar
// feedback inmediato, pero la fuente de verdad es el backend.
const MIN_LENGTH = 10

function tieneDigitosConsecutivos(password: string): boolean {
  for (let i = 0; i + 2 < password.length; i++) {
    const a = password[i], b = password[i + 1], c = password[i + 2]
    if (!/\d/.test(a) || !/\d/.test(b) || !/\d/.test(c)) continue
    const na = Number(a), nb = Number(b), nc = Number(c)
    const ascendente = nb === na + 1 && nc === nb + 1
    const descendente = nb === na - 1 && nc === nb - 1
    const repetido = na === nb && nb === nc
    if (ascendente || descendente || repetido) return true
  }
  return false
}

function validarLocal(password: string): string | null {
  if (password.length < MIN_LENGTH) return `Debe tener al menos ${MIN_LENGTH} caracteres`
  if (!/[A-Z]/.test(password)) return 'Debe incluir al menos una letra mayúscula'
  if (!/[a-z]/.test(password)) return 'Debe incluir al menos una letra minúscula'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Debe incluir al menos un carácter especial'
  if (tieneDigitosConsecutivos(password)) return 'No puede tener 3 o más números consecutivos o repetidos (ej. 123, 321, 111)'
  return null
}

const REQUISITOS = [
  { test: (p: string) => p.length >= MIN_LENGTH, label: `Al menos ${MIN_LENGTH} caracteres` },
  { test: (p: string) => /[A-Z]/.test(p), label: 'Una letra mayúscula' },
  { test: (p: string) => /[a-z]/.test(p), label: 'Una letra minúscula' },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'Un carácter especial' },
  { test: (p: string) => p.length > 0 && !tieneDigitosConsecutivos(p), label: 'Sin números consecutivos (123, 321, 111)' },
]

export function CambiarPasswordObligatorioModal() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const token = useAuthStore((s) => s.token)

  const [actual,       setActual]       = useState('')
  const [nueva,        setNueva]        = useState('')
  const [confirmar,    setConfirmar]    = useState('')
  const [showActual,   setShowActual]   = useState(false)
  const [showNueva,    setShowNueva]    = useState(false)
  const [error,        setError]        = useState('')

  const cambiar = useMutation({
    mutationFn: () => api.put(`/perfil/${user!.id}/password`, { currentPassword: actual, newPassword: nueva }),
    onSuccess: () => {
      if (user && token) setUser({ ...user, debeCambiarPassword: false }, token)
    },
    onError: (err: unknown) => setError(getApiError(err)),
  })

  if (!user?.debeCambiarPassword) return null

  const errorLocal = nueva ? validarLocal(nueva) : null
  const noCoinciden = confirmar.length > 0 && nueva !== confirmar
  const puedeEnviar = actual.length > 0 && !errorLocal && !noCoinciden && confirmar.length > 0

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!puedeEnviar) return
    cambiar.mutate()
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop — no se puede cerrar. z-index por encima de ReglamentoAlertModal
          (9998): si un usuario tiene ambos pendientes, primero debe resolver
          la contraseña. */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-2xl bg-card shadow-2xl overflow-hidden animate-slide-up border-2 border-amber-100"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 to-amber-400" />

        <div className="px-7 py-8 flex flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 shadow-sm">
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </div>

          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-amber-600 mb-1">
              Acción requerida
            </p>
            <h2 className="text-base font-bold text-gray-900">Actualiza tu contraseña</h2>
            <p className="mt-2 text-[0.82rem] text-gray-500 max-w-xs leading-relaxed">
              Por seguridad, debes establecer una nueva contraseña antes de continuar.
            </p>
          </div>

          <div className="w-full space-y-3 text-left">
            {/* Contraseña actual */}
            <div className="space-y-1">
              <label className="block text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Contraseña actual</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type={showActual ? 'text' : 'password'}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  className="field pl-9 pr-10 text-sm"
                  autoFocus
                />
                <button type="button" onClick={() => setShowActual(!showActual)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                  {showActual ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Contraseña nueva */}
            <div className="space-y-1">
              <label className="block text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Contraseña nueva</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type={showNueva ? 'text' : 'password'}
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  className="field pl-9 pr-10 text-sm"
                />
                <button type="button" onClick={() => setShowNueva(!showNueva)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                  {showNueva ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirmar */}
            <div className="space-y-1">
              <label className="block text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Confirmar contraseña</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type={showNueva ? 'text' : 'password'}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className="field pl-9 text-sm"
                />
              </div>
              {noCoinciden && <p className="text-[0.68rem] text-red-500">Las contraseñas no coinciden</p>}
            </div>

            {/* Checklist de requisitos */}
            <ul className="space-y-1 rounded-xl bg-gray-50 px-3 py-2.5">
              {REQUISITOS.map((r) => {
                const ok = r.test(nueva)
                return (
                  <li key={r.label} className="flex items-center gap-1.5 text-[0.68rem]">
                    <CheckCircle2 className={`h-3 w-3 flex-shrink-0 ${ok ? 'text-emerald-500' : 'text-gray-300'}`} />
                    <span className={ok ? 'text-gray-600' : 'text-gray-400'}>{r.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          {error && (
            <div className="flex w-full items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <p className="text-[0.72rem] font-medium text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!puedeEnviar || cambiar.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cambiar.isPending
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <CheckCircle2 className="h-4 w-4" />}
            Actualizar contraseña
          </button>

          <p className="text-[0.68rem] text-gray-400">
            No puedes acceder al portal hasta actualizar tu contraseña.
          </p>
        </div>
      </form>
    </div>,
    document.body,
  )
}
