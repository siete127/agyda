import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVentasAutoLogin } from '@/hooks/useVentasAutoLogin'
import { ShoppingCart } from 'lucide-react'

export function VentasRedirectPage() {
  const navigate = useNavigate()
  const { openVentas } = useVentasAutoLogin()

  useEffect(() => {
    openVentas().then(() => {
      // Volver al dashboard tras abrir la ventana de ventas
      navigate('/dashboard', { replace: true })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
        <ShoppingCart className="h-8 w-8 text-emerald-500" />
      </div>
      <p className="text-sm font-semibold text-gray-700">Iniciando sesión en Ventas...</p>
      <div className="h-1 w-32 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full w-full origin-left animate-[shimmer_1.2s_ease-in-out_infinite] bg-gradient-to-r from-emerald-400 to-emerald-600" />
      </div>
    </div>
  )
}
