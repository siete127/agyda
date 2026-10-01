import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Ban, CalendarClock, Loader2, Lock, Pencil, Plus, Power, Save, ShoppingCart, Tag, X } from 'lucide-react'
import { campanasVentasService, tiposCampanaQuery, type TipoCampana, type TipoCampanaVentas } from '@/services/campanasVentas.service'

const PALETA = ['#8b5cf6', '#ec4899', '#14b8a6', '#22c55e', '#ef4444', '#f97316', '#6366f1', '#6b7280']
const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f

/** Ícono de cada tipo: carrito (Ventas), calendario (Seguimiento) o etiqueta (los agregados). */
export function IconoTipo({ tipo, className }: { tipo?: TipoCampanaVentas; className?: string }) {
  if (tipo === 'seguimiento') return <CalendarClock className={className} />
  if (!tipo || tipo === 'ventas') return <ShoppingCart className={className} />
  return <Tag className={className} />
}

/** Alta o edición de un tipo agregado: nombre, para qué es, color y si lleva seguimiento. */
export function FormTipoCampana({ tipo, onSaved, onCancel }: {
  tipo?: TipoCampana
  onSaved: (t: TipoCampana) => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    nombre: tipo?.nombre ?? '', descripcion: tipo?.descripcion ?? '',
    color: tipo?.color ?? PALETA[0], seguimiento: tipo?.seguimiento ?? false,
  })
  const guardar = useMutation({
    mutationFn: () => {
      const body = { nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, color: f.color, seguimiento: f.seguimiento }
      return tipo?.id ? campanasVentasService.editarTipo(tipo.id, body) : campanasVentasService.crearTipo(body)
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['campanas-ventas-tipos'] })
      qc.invalidateQueries({ queryKey: ['campanas-ventas-todas'] })
      qc.invalidateQueries({ queryKey: ['campanas-disponibles'] })
      toast.success(tipo ? 'Tipo actualizado' : `Tipo "${t.nombre}" creado`)
      onSaved(t)
    },
    onError: (e) => toast.error(msgError(e, 'No se pudo guardar el tipo')),
  })
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[0.7rem] font-semibold text-gray-600">Nombre del tipo</span>
          <input autoFocus className="field" maxLength={60} placeholder="Ej. Mixto" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.7rem] font-semibold text-gray-600">Para qué es <span className="font-normal text-gray-400">(opcional)</span></span>
          <input className="field" maxLength={200} placeholder="Ej. Venta y seguimiento en la misma llamada" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] font-semibold text-gray-600">Color</span>
        {PALETA.map((c) => (
          <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Color ${c}`}
            className={clsx('h-6 w-6 rounded-full ring-offset-2 transition', f.color === c ? 'ring-2 ring-gray-800' : 'hover:scale-110')}
            style={{ background: c }} />
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-card px-2.5 py-2">
        <input type="checkbox" checked={f.seguimiento} onChange={(e) => setF({ ...f, seguimiento: e.target.checked })} className="mt-0.5 accent-violet-600" />
        <span className="text-[0.75rem] text-gray-700">
          <b>Lleva seguimiento</b>
          <span className="block text-[0.66rem] text-gray-400">Marcado: cada venta se puede seguir después, como en Seguimiento. Sin marcar: trabaja como Ventas.</span>
        </span>
      </label>
      {!!tipo?.campanas && f.seguimiento !== tipo.seguimiento && (
        <p className="text-[0.66rem] text-amber-700">Sus {tipo.campanas} campaña(s) también cambian en Ventas.</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
        <button type="button" onClick={() => guardar.mutate()} disabled={!f.nombre.trim() || guardar.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {tipo ? 'Guardar tipo' : 'Crear tipo'}
        </button>
      </div>
    </div>
  )
}

/** Ventana con los tipos de campaña: crear, editar y deshabilitar los agregados. */
export function GestorTiposCampana({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: tipos = [], isLoading } = useQuery(tiposCampanaQuery)
  const [editando, setEditando] = useState<string | null>(null)
  const cambiarActivo = useMutation({
    mutationFn: (t: TipoCampana) => (t.activo
      ? campanasVentasService.desactivarTipo(t.id!)
      : campanasVentasService.editarTipo(t.id!, { nombre: t.nombre, descripcion: t.descripcion, color: t.color, seguimiento: t.seguimiento, activo: true })),
    onSuccess: (_r, t) => { qc.invalidateQueries({ queryKey: ['campanas-ventas-tipos'] }); toast.success(t.activo ? 'Tipo deshabilitado' : 'Tipo habilitado') },
    onError: (e) => toast.error(msgError(e, 'No se pudo cambiar el tipo')),
  })

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card shadow-xl" role="dialog" aria-modal="true" aria-label="Tipos de campaña">
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Tag className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900">Tipos de campaña</h2>
            <p className="text-[0.72rem] text-gray-400">Ventas y Seguimiento vienen del sistema de Ventas. Agrega los tuyos, como "Mixto".</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-2 p-5">
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div> : tipos.map((t) => (
            <div key={t.clave}>
              <div className={clsx('flex items-start gap-3 rounded-xl border px-3 py-2.5', t.activo ? 'border-gray-200' : 'border-dashed border-gray-200 bg-gray-50 opacity-70')}>
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${t.color ?? '#6b7280'}22`, color: t.color ?? '#6b7280' }}>
                  <IconoTipo tipo={t.clave} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[0.84rem] font-semibold text-gray-800">
                    {t.nombre}
                    {t.base && <span className="flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-gray-500"><Lock className="h-2.5 w-2.5" /> De Ventas</span>}
                    {t.seguimiento && <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-sky-700">Lleva seguimiento</span>}
                    {!t.activo && <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-gray-500">Deshabilitado</span>}
                  </p>
                  {t.descripcion && <p className="text-[0.68rem] text-gray-400">{t.descripcion}</p>}
                  {!t.base && <p className="text-[0.66rem] text-gray-400">{t.campanas ?? 0} campaña(s) con este tipo</p>}
                </div>
                {!t.base && (
                  <div className="flex flex-shrink-0 gap-1">
                    <button onClick={() => setEditando(editando === t.clave ? null : t.clave)} title="Editar" aria-label={`Editar ${t.nombre}`}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => cambiarActivo.mutate(t)} disabled={cambiarActivo.isPending}
                      title={t.activo ? 'Deshabilitar (sus campañas lo conservan)' : 'Habilitar'} aria-label={t.activo ? `Deshabilitar ${t.nombre}` : `Habilitar ${t.nombre}`}
                      className={clsx('rounded-lg p-1.5 disabled:opacity-50', t.activo ? 'text-gray-400 hover:bg-red-50 hover:text-red-600' : 'text-emerald-600 hover:bg-emerald-50')}>
                      {t.activo ? <Ban className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>
              {editando === t.clave && (
                <div className="mt-2"><FormTipoCampana tipo={t} onSaved={() => setEditando(null)} onCancel={() => setEditando(null)} /></div>
              )}
            </div>
          ))}
          {editando === 'nuevo' && <FormTipoCampana onSaved={() => setEditando(null)} onCancel={() => setEditando(null)} />}
        </div>

        <div className="flex justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={() => setEditando('nuevo')} disabled={editando === 'nuevo'}
            className="flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Nuevo tipo
          </button>
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50">Listo</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
