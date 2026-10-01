import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ChevronDown, Headset, Loader2, ShoppingCart } from 'lucide-react'
import { miCampaniaService, type MiCampaniaActiva } from '@/services/miCampania.service'

const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f

/**
 * "Campaña activa" del menú del perfil. Solo aparece si la persona (agente o
 * supervisor) está en 2 o más campañas; ahí elige en cuál trabaja. Para un
 * agente también cambia la campaña de Ventas donde se registra lo que captura.
 */
export function CampaniaActivaSelector() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['mi-campania-activa'], queryFn: miCampaniaService.get, staleTime: 60_000 })
  const cambiar = useMutation({
    mutationFn: (clave: string) => miCampaniaService.set(clave),
    onSuccess: (r, clave) => {
      qc.setQueryData<MiCampaniaActiva>(['mi-campania-activa'], (x) => (x ? { ...x, activa: clave, sugerida: null } : x))
      qc.invalidateQueries({ queryKey: ['campanas-agentes'] })
      const nombre = data?.opciones.find((o) => o.clave === clave)?.nombre ?? 'la campaña'
      toast.success(r.ventas ? `Ahora trabajas en ${nombre} · tus ventas van a ${r.ventas.nombre}` : `Ahora trabajas en ${nombre}`)
    },
    onError: (e) => toast.error(msgError(e, 'No se pudo cambiar la campaña')),
  })

  if (!data || data.opciones.length < 2) return null
  const valor = data.activa ?? ''
  const actual = data.opciones.find((o) => o.clave === valor)
  const sugerida = data.opciones.find((o) => o.clave === data.sugerida)
  const detalle = !actual
    ? `Estás en ${data.opciones.length} campañas: elige en cuál trabajas`
    : actual.rol === 'agente' && actual.ventasNombre
      ? `Tus ventas se registran en ${actual.ventasNombre}`
      : actual.rol === 'supervisor'
        ? 'La supervisas'
        : actual.grupos.length ? `Grupo: ${actual.grupos.join(', ')}` : 'Por tus skills'

  return (
    <div className="border-b border-gray-50 px-3 py-2.5">
      <p className="mb-1.5 px-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Campaña activa</p>
      <div className="relative">
        <span className={clsx('pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2', valor ? 'text-brand' : 'text-amber-600')}>
          {actual?.tipo === 'ventas' ? <ShoppingCart className="h-4 w-4" /> : <Headset className="h-4 w-4" />}
        </span>
        <select value={valor} onChange={(e) => { if (e.target.value) cambiar.mutate(e.target.value) }} disabled={cambiar.isPending}
          aria-label="Campaña activa"
          className={clsx('w-full cursor-pointer appearance-none rounded-xl border py-2 pl-9 pr-8 text-[0.8rem] font-semibold outline-none transition focus:ring-2 focus:ring-brand/30 disabled:opacity-60',
            valor ? 'border-gray-200 bg-card text-gray-800' : 'border-amber-300 bg-amber-50 text-amber-800')}>
          {!valor && <option value="">{sugerida ? `Elige… (hoy: ${sugerida.nombre})` : 'Elige en cuál trabajas…'}</option>}
          {data.opciones.map((o) => (
            <option key={o.clave} value={o.clave}>{o.nombre}{o.rol === 'supervisor' ? ' · supervisas' : ''}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
          {cambiar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </div>
      <p className="mt-1 px-1 text-[0.62rem] text-gray-400">{detalle}</p>
    </div>
  )
}
