import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { configuracionService, type WebphoneCredencial, type WebphoneCredencialVista } from '@/services/configuracion.service'
import toast from 'react-hot-toast'

function EditarCredencialForm({
  neusId, vistaId, credencial, onClose,
}: { neusId: number; vistaId: number; credencial: WebphoneCredencialVista; onClose: () => void }) {
  const qc = useQueryClient()
  const [vdLogin, setVdLogin] = useState(credencial.vdLogin ?? '')
  const [vdPass, setVdPass] = useState('')
  const [campana, setCampana] = useState(credencial.campana ?? '')

  const guardar = useMutation({
    mutationFn: () => configuracionService.guardarCredencialVicidial(neusId, vistaId, {
      vdLogin: vdLogin.trim(),
      vdPass: vdPass.trim() || undefined,
      campana: campana.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webphone-credenciales'] })
      toast.success('Credenciales guardadas')
      onClose()
    },
    onError: () => toast.error('Error al guardar credenciales'),
  })

  const puedeGuardar = vdLogin.trim() && (credencial.tieneCredenciales || vdPass.trim())

  return (
    <div className="space-y-3 rounded-xl border-2 border-brand/30 bg-brand/5 p-3">
      <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide">Login de VICIdial — {credencial.vistaLabel}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600">Usuario VICIdial</label>
          <input className="field mt-1 text-sm" value={vdLogin} onChange={(e) => setVdLogin(e.target.value)} placeholder="Ej. 1708" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">
            Contraseña VICIdial {credencial.tieneCredenciales && <span className="text-gray-400">(dejar en blanco para no cambiar)</span>}
          </label>
          <input className="field mt-1 text-sm" type="password" value={vdPass} onChange={(e) => setVdPass(e.target.value)} placeholder="••••••••" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Campaña</label>
        <input className="field mt-1 text-sm" value={campana} onChange={(e) => setCampana(e.target.value)} placeholder="Opcional — se selecciona automáticamente al auto-loguear" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
        <button
          onClick={() => guardar.mutate()}
          disabled={!puedeGuardar || guardar.isPending}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function FilaAgente({ agente, vistaId }: { agente: WebphoneCredencial; vistaId: number }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const cred = agente.credencialesPorVista.find((c) => c.vistaId === vistaId)

  const eliminar = useMutation({
    mutationFn: () => configuracionService.eliminarCredencialVicidial(agente.neusId, vistaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webphone-credenciales'] })
      toast.success('Credenciales eliminadas')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  if (!cred) return null

  return (
    <div className="rounded-xl border border-gray-100 bg-surface px-3 py-2.5">
      {editando ? (
        <EditarCredencialForm neusId={agente.neusId} vistaId={vistaId} credencial={cred} onClose={() => setEditando(false)} />
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
              {agente.nombre}
              <span className="chip bg-gray-100 text-gray-500 text-[0.6rem]">{agente.tipoUsuario}</span>
            </p>
            <p className="truncate text-xs text-ink-tertiary">
              {cred.tieneCredenciales
                ? `VICIdial: ${cred.vdLogin}${cred.campana ? ` · Campaña: ${cred.campana}` : ''}`
                : 'Sin credenciales configuradas para esta vista'}
            </p>
          </div>
          {cred.tieneCredenciales && (
            <span className="flex items-center gap-1 chip bg-emerald-100 text-emerald-700 text-[0.6rem]">
              <ShieldCheck className="h-3 w-3" /> Configurado
            </span>
          )}
          <button
            onClick={() => setEditando(true)}
            className="flex-shrink-0 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-brand/10 hover:text-brand"
            title={cred.tieneCredenciales ? 'Editar credenciales' : 'Configurar credenciales'}
          >
            {cred.tieneCredenciales ? <Pencil className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
          </button>
          {cred.tieneCredenciales && (
            <button
              onClick={() => eliminar.mutate()}
              disabled={eliminar.isPending}
              className="flex-shrink-0 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="Eliminar credenciales"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function WebphoneCredencialesTab() {
  const [vistaActiva, setVistaActiva] = useState<number | null>(null)

  const { data: credenciales = [], isLoading } = useQuery({
    queryKey: ['webphone-credenciales'],
    queryFn: () => configuracionService.getCredencialesVicidial(),
  })

  const vistas = credenciales[0]?.credencialesPorVista.map((c) => ({ id: c.vistaId, label: c.vistaLabel })) ?? []
  const vistaSeleccionada = vistaActiva ?? vistas[0]?.id ?? null

  if (isLoading) return <p className="text-sm text-ink-tertiary">Cargando...</p>

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold">Credenciales de VICIdial por agente y por vista</p>
        <p className="mt-0.5 text-amber-700">
          Cada vista de Webphone (Azul 1, Web21 RC9, etc.) puede tener su propio servidor VICIdial — configura las
          credenciales por separado para cada una. Se guardan cifradas y se usan para auto-loguear al agente.
        </p>
      </div>

      {vistas.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No hay vistas de Webphone configuradas todavía.</p>
      ) : (
        <>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {vistas.map((v) => (
              <button
                key={v.id}
                onClick={() => setVistaActiva(v.id)}
                className={clsx(
                  'flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                  vistaSeleccionada === v.id ? 'bg-card text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-card shadow-card">
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {vistaSeleccionada && credenciales.map((agente) => (
                <FilaAgente key={agente.neusId} agente={agente} vistaId={vistaSeleccionada} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
