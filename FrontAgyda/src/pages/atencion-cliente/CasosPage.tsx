import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Inbox, ChevronLeft } from 'lucide-react'
import { casoService } from '@/services/caso.service'
import type { Caso, CasoEstatus } from '@/types/caso.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useCurrentUser } from '@/hooks/useAuth'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { CasoListaColumna, type CasoFiltros } from './components/caso/CasoListaColumna'
import { CasoDetalleColumnas } from './components/caso/CasoDetalleColumnas'

const ESTATUS_ABIERTOS: CasoEstatus[] = ['pendiente', 'en_proceso', 'en_espera_cliente', 'escalado']

export function CasosPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'casos-gestionar')
  const usuarioActual = useCurrentUser()
  const { data: usuarios } = useUsuariosSimple()
  const [searchParams, setSearchParams] = useSearchParams()

  const [filtros, setFiltros] = useState<CasoFiltros>({ tipo: '', prioridad: '', asignadoA: '' })
  const [detalle, setDetalle] = useState<Caso | null>(null)

  // Sin permiso de gestionar, siempre ve solo sus propios casos asignados —
  // con permiso, puede ver todos o filtrar por un asesor en particular.
  const asignadoAFiltro = puedeGestionar ? (filtros.asignadoA ? Number(filtros.asignadoA) : undefined) : usuarioActual?.id

  const { data: casos = [], isLoading } = useQuery({
    queryKey: ['casos', asignadoAFiltro],
    queryFn: () => casoService.getAll({ asignadoA: asignadoAFiltro }),
    staleTime: 15_000,
    enabled: puedeGestionar || !!usuarioActual?.id,
  })

  // Deep-link: /atencion-cliente/casos?casoId=123 abre el detalle directo.
  const casoIdParam = searchParams.get('casoId')
  useEffect(() => {
    if (!casoIdParam) return
    const id = Number(casoIdParam)
    if (detalle?.id === id) return
    const enLista = casos.find((c) => c.id === id)
    if (enLista) { setDetalle(enLista); return }
    casoService.getById(id).then(setDetalle).catch(() => {
      setSearchParams((p) => { p.delete('casoId'); return p }, { replace: true })
    })
  }, [casoIdParam, casos]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCaso = (c: Caso) => {
    setDetalle(c)
    setSearchParams((p) => { p.set('casoId', String(c.id)); return p }, { replace: true })
  }

  const abiertos = casos.filter((c) => ESTATUS_ABIERTOS.includes(c.estatus))

  const queryKeysToInvalidate = detalle
    ? [['casos'], ...(detalle.contactoId ? [['cliente-casos', detalle.contactoId]] : [])]
    : []

  return (
    <div className="space-y-5 animate-fade-in">
      {!embedded && (
        <>
          <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
          </button>

          <div className="card overflow-hidden">
            <div
              className="animate-gradient-x relative overflow-hidden px-6 py-5"
              style={{
                backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
                backgroundSize: '200% 100%',
              }}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                    <Inbox className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white tracking-tight">Casos</h1>
                    <p className="mt-0.5 text-xs text-blue-100/80">{abiertos.length} abierto{abiertos.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <CasoListaColumna
          casos={casos}
          isLoading={isLoading}
          seleccionadoId={detalle?.id ?? null}
          onSeleccionar={abrirCaso}
          filtros={filtros}
          onFiltrosChange={setFiltros}
          puedeGestionar={puedeGestionar}
          usuarios={usuarios}
        />
        {detalle ? (
          <CasoDetalleColumnas
            caso={detalle}
            puedeGestionar={puedeGestionar}
            queryKeysToInvalidate={queryKeysToInvalidate}
            onAbrirCaso={abrirCaso}
          />
        ) : (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-card/50 text-center">
            <Inbox className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-semibold text-gray-500">Selecciona un caso para ver la conversación</p>
          </div>
        )}
      </div>
    </div>
  )
}
