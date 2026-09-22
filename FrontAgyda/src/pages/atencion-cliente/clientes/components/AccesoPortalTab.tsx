import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { KeyRound, Check } from 'lucide-react'
import { crmService } from '@/services/crm.service'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import { CatalogoListaGestion } from '@/components/crm/CatalogoListaGestion'
import type { CRMContacto } from '@/types/crm.types'

export function AccesoPortalTab({ cliente }: { cliente: CRMContacto }) {
  const qc = useQueryClient()
  const [generarAccesoPortal, setGenerarAccesoPortal] = useState(false)
  const [passwordPortal, setPasswordPortal] = useState('')
  const [tipoAccesoId, setTipoAccesoId] = useState(cliente.tipoAccesoId ? String(cliente.tipoAccesoId) : '')
  const [enviarInvitacion, setEnviarInvitacion] = useState(true)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['crm-catalogo-tipos-acceso-portal'],
    queryFn: () => crmCatalogosClienteService.tiposAcceso.list(true),
  })

  const guardar = useMutation({
    mutationFn: () => crmService.altaCliente(cliente.id, {
      generarAccesoPortal: (!cliente.neusId && generarAccesoPortal) || (!!cliente.neusId && !!passwordPortal) || undefined,
      passwordPortal: passwordPortal || undefined,
      tipoAccesoId: tipoAccesoId ? Number(tipoAccesoId) : undefined,
      enviarInvitacion,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-expediente', cliente.id] })
      setPasswordPortal('')
      toast.success(enviarInvitacion && !cliente.correo ? 'Acceso actualizado — sin correo, no se envió invitación' : 'Acceso al portal actualizado')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Acceso al portal</h2>
            <p className="text-[0.82rem] text-gray-400">Login del cliente a su propio portal (portal-cliente) y a qué tiene acceso.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card space-y-3">
        {cliente.neusId ? (
          <>
            <p className="text-xs font-semibold text-gray-700">Acceso al portal de cliente: <span className="text-emerald-600">activo</span></p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de acceso</label>
              <select value={tipoAccesoId} onChange={(e) => setTipoAccesoId(e.target.value)} className="field">
                <option value="">Sin especificar</option>
                {items.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nueva contraseña (opcional)</label>
              <input type="password" value={passwordPortal} onChange={(e) => setPasswordPortal(e.target.value)} className="field" placeholder="Dejar en blanco para no cambiarla" />
            </div>
          </>
        ) : (
          <>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={generarAccesoPortal} onChange={(e) => setGenerarAccesoPortal(e.target.checked)} />
              <span>
                <span className="block text-xs font-semibold text-gray-700">Generar acceso al portal de cliente</span>
                <span className="block text-[0.68rem] text-gray-400">Crea un usuario de login para que el cliente entre a su propio portal.</span>
              </span>
            </label>
            {generarAccesoPortal && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de acceso</label>
                  <select value={tipoAccesoId} onChange={(e) => setTipoAccesoId(e.target.value)} className="field">
                    <option value="">Sin especificar</option>
                    {items.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Contraseña</label>
                  <input type="password" value={passwordPortal} onChange={(e) => setPasswordPortal(e.target.value)} className="field" placeholder="Dejar en blanco para asignarla después" />
                </div>
              </>
            )}
          </>
        )}

        {(!cliente.neusId ? generarAccesoPortal : true) && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-100 p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={enviarInvitacion} onChange={(e) => setEnviarInvitacion(e.target.checked)} />
            <span>
              <span className="block text-xs font-semibold text-gray-700">Enviar invitación por correo</span>
              <span className="block text-[0.68rem] text-gray-400">
                {cliente.correo
                  ? `Se enviará a ${cliente.correo} con su usuario, contraseña y la liga de acceso.`
                  : 'Este contacto no tiene correo registrado — no se podrá enviar.'}
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending || (!cliente.neusId && !generarAccesoPortal)}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <p className="mb-3 text-[0.8rem] font-bold text-ink">Tipos de acceso al portal</p>
        <CatalogoListaGestion items={items} isLoading={isLoading} service={crmCatalogosClienteService.tiposAcceso} queryKey="crm-catalogo-tipos-acceso-portal" />
      </div>
    </div>
  )
}
