import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus, Video, Phone, Calendar, Layers } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { citaService } from '@/services/cita.service'
import {
  CITA_MODALIDAD_CONFIG, ESTATUS_CITA_CONFIG, TRATAMIENTO_ESTATUS_CONFIG,
  type Cita,
} from '@/types/cita.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevaCitaModal } from '../../components/NuevaCitaModal'
import { CitaDetalleModal } from '../../components/CitaDetalleModal'
import { NuevoTratamientoModal } from '../../components/NuevoTratamientoModal'

const MODALIDAD_ICON = { videollamada: Video, telefonica: Phone, generica: Calendar }

function fmt(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

export function ClienteCitasTab({ contactoId, clienteNombre }: { contactoId: number; clienteNombre: string }) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')
  const [nuevaCita, setNuevaCita] = useState(false)
  const [nuevoTrat, setNuevoTrat] = useState(false)
  const [sesionDe, setSesionDe] = useState<{ id: number; nombre: string } | null>(null)
  const [detalle, setDetalle] = useState<Cita | null>(null)

  const { data: citas = [], isLoading } = useQuery({
    queryKey: ['cliente-citas', contactoId],
    queryFn: () => citaService.getByContacto(contactoId),
    staleTime: 15_000,
  })
  const { data: tratamientos = [] } = useQuery({
    queryKey: ['cliente-tratamientos', contactoId],
    queryFn: () => citaService.getTratamientos({ contactoId }),
    staleTime: 15_000,
  })

  const invalidateKeys = [['cliente-citas', contactoId], ['cliente-tratamientos', contactoId], ['citas']]

  return (
    <div className="space-y-4">
      {/* Tratamientos */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700 flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Tratamientos</p>
          {puedeGestionar && (
            <button onClick={() => setNuevoTrat(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
              <Plus className="h-3.5 w-3.5" /> Nuevo tratamiento
            </button>
          )}
        </div>
        {tratamientos.length === 0 ? (
          <p className="py-6 text-center text-[0.78rem] text-gray-400">Sin tratamientos</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {tratamientos.map((t) => {
              const estCfg = TRATAMIENTO_ESTATUS_CONFIG[t.estatus]
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{t.nombre}</p>
                    <p className="text-[0.7rem] text-gray-400">
                      {t.totalSesiones ? `${t.sesionesCompletadas} de ${t.totalSesiones} sesiones` : `${t.sesionesCompletadas} sesiones`}
                      {t.asignadoNombre ? ` · ${t.asignadoNombre}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', estCfg.bg, estCfg.text)}>{estCfg.label}</span>
                    {puedeGestionar && t.estatus === 'activo' && (
                      <button onClick={() => setSesionDe({ id: t.id, nombre: t.nombre })} className="text-[0.7rem] font-semibold text-brand hover:underline">
                        + Sesión
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Citas */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Citas</p>
          {puedeGestionar && (
            <button onClick={() => setNuevaCita(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
              <Plus className="h-3.5 w-3.5" /> Nueva cita
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="sm" /></div>
        ) : citas.length === 0 ? (
          <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin citas registradas</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {citas.map((c) => {
              const modalCfg = CITA_MODALIDAD_CONFIG[c.modalidad]
              const estCfg = ESTATUS_CITA_CONFIG[c.estatus]
              const Icon = MODALIDAD_ICON[c.modalidad]
              return (
                <button key={c.id} onClick={() => setDetalle(c)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0', modalCfg.bg)}>
                      <Icon className={clsx('h-3.5 w-3.5', modalCfg.text)} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{c.titulo}</p>
                      <p className="text-[0.7rem] text-gray-400">
                        {fmt(c.fechaHora)}
                        {c.tratamientoNombre ? ` · ${c.tratamientoNombre}${c.numeroSesion ? ` (${c.numeroSesion})` : ''}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.confirmadaPorCliente && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">✓</span>}
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', estCfg.bg, estCfg.text)}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {nuevaCita && <NuevaCitaModal contactoPreset={{ id: contactoId, nombre: clienteNombre }} onClose={() => setNuevaCita(false)} />}
      {sesionDe && <NuevaCitaModal contactoPreset={{ id: contactoId, nombre: clienteNombre }} tratamientoPreset={sesionDe} onClose={() => setSesionDe(null)} />}
      {nuevoTrat && <NuevoTratamientoModal contactoId={contactoId} clienteNombre={clienteNombre} onClose={() => setNuevoTrat(false)} />}
      {detalle && (
        <CitaDetalleModal cita={detalle} onClose={() => setDetalle(null)} queryKeysToInvalidate={invalidateKeys} />
      )}
    </div>
  )
}
