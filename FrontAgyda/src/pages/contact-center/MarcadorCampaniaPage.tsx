import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, PhoneOff } from 'lucide-react'
import { ccFormularioPublicoService } from '@/services/ccFormularios.service'

// URL fija del marcador por campaña: /formulario-publico/c/<slug>?cliente=&agente=…
// Se traduce al formulario vigente de la campaña y se abre con los mismos
// parámetros, así cambiar el formulario en AGYDA no obliga a tocar el marcador.
export default function MarcadorCampaniaPage() {
  const { slug = '' } = useParams()
  const { search } = useLocation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['marcador-campania', slug],
    queryFn: () => ccFormularioPublicoService.resolverMarcador(slug),
    retry: false,
  })

  if (data?.token) return <Navigate replace to={`/formulario-publico/${data.token}${search}`} />

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Abriendo formulario…</p>
      ) : (
        <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <PhoneOff className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-800">No se pudo abrir el formulario</p>
          <p className="mt-1 text-xs text-gray-500">
            {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'La campaña no existe o no tiene un formulario para el marcador.'}
          </p>
        </div>
      )}
    </div>
  )
}
