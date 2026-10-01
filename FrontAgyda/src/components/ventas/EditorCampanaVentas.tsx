import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Megaphone, Plus, Save, X } from 'lucide-react'
import { campanasVentasService, type EstatusCampanaVentas } from '@/services/campanasVentas.service'

// Colores sugeridos para la campaña y sus estatus (los mismos tonos que usa Ventas).
const PALETA = ['#ffa200', '#f7e35e', '#22c55e', '#14b8a6', '#0091ff', '#3b82f6', '#7c3aed', '#ec4899', '#ef4444', '#6b7280']
const INICIALES: EstatusCampanaVentas[] = [
  { nombre: 'Aprobada', color: '#22c55e', activo: true },
  { nombre: 'Rechazada', color: '#ef4444', activo: true },
  { nombre: 'Agendada', color: '#3b82f6', activo: true },
  { nombre: 'Pendiente', color: '#f59e0b', activo: true },
]
const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f

/**
 * Alta o edición de una campaña del sistema de Ventas: nombre, color y sus
 * estatus (las tipificaciones que ven los agentes en Ventas y AGYDA).
 * Se guarda directo en la BD de Ventas.
 */
export function EditorCampanaVentas({ campanaId, onClose, onSaved }: {
  campanaId: number | null
  onClose: () => void
  onSaved: (id: number | null) => void
}) {
  const editando = campanaId != null
  const { data, isLoading } = useQuery({
    queryKey: ['campana-ventas', campanaId],
    queryFn: () => campanasVentasService.get(campanaId!),
    enabled: editando,
  })
  const [f, setF] = useState<{ nombre: string; color: string; estatus: EstatusCampanaVentas[] } | null>(
    editando ? null : { nombre: '', color: PALETA[0], estatus: INICIALES },
  )
  if (data && !f) setF({ nombre: data.nombre, color: data.color ?? PALETA[0], estatus: data.estatus.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color, activo: e.activo })) })
  const [nuevo, setNuevo] = useState('')

  const setEst = (i: number, cambio: Partial<EstatusCampanaVentas>) => setF((x) => (x ? { ...x, estatus: x.estatus.map((e, j) => (j === i ? { ...e, ...cambio } : e)) } : x))
  const mover = (i: number, d: -1 | 1) => setF((x) => {
    if (!x) return x
    const l = [...x.estatus]; const j = i + d
    if (j < 0 || j >= l.length) return x
    ;[l[i], l[j]] = [l[j], l[i]]
    return { ...x, estatus: l }
  })
  const agregar = () => {
    const n = nuevo.trim()
    if (!n || !f) return
    if (f.estatus.some((e) => e.nombre.toLowerCase() === n.toLowerCase())) { toast.error('Ese estatus ya existe'); return }
    setF({ ...f, estatus: [...f.estatus, { nombre: n, color: PALETA[f.estatus.length % PALETA.length], activo: true }] })
    setNuevo('')
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body = { nombre: f!.nombre.trim(), color: f!.color, estatus: f!.estatus.filter((e) => e.nombre.trim()) }
      return editando ? campanasVentasService.editar(campanaId!, body) : campanasVentasService.crear(body)
    },
    onSuccess: (c) => { toast.success(editando ? 'Campaña actualizada en Ventas' : 'Campaña creada en Ventas'); onSaved(c?.id ?? campanaId) },
    onError: (e) => toast.error(msgError(e, 'No se pudo guardar la campaña')),
  })

  const activos = f?.estatus.filter((e) => e.activo).length ?? 0

  return createPortal(
    // z-[200]: se abre también encima de los Modal "elevated" (z 70+ y suben con cada uno apilado).
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-card shadow-xl" role="dialog" aria-modal="true" aria-label={editando ? 'Editar campaña de Ventas' : 'Nueva campaña de Ventas'}>
        <div className="h-1.5 rounded-t-2xl" style={{ background: f?.color ?? PALETA[0] }} />
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${f?.color ?? PALETA[0]}22`, color: f?.color ?? PALETA[0] }}>
            <Megaphone className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900">{editando ? `Editar campaña de Ventas` : 'Nueva campaña de Ventas'}</h2>
            <p className="text-[0.7rem] text-gray-400">
              Se guarda en el sistema de Ventas{data ? ` · ${data.ventas.toLocaleString('es-MX')} ventas registradas` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !f ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
        ) : (
          <div className="space-y-5 p-5">
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Nombre</span>
              <input autoFocus className="field" value={f.nombre} maxLength={100} placeholder="Ej. Amex" onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            </label>

            <div>
              <span className="mb-1.5 block text-[0.72rem] font-semibold text-gray-600">Color</span>
              <div className="flex flex-wrap items-center gap-2">
                {PALETA.map((c) => (
                  <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Color ${c}`}
                    className={clsx('h-7 w-7 rounded-full ring-offset-2 transition', f.color === c ? 'ring-2 ring-gray-800' : 'hover:scale-110')}
                    style={{ background: c }} />
                ))}
                <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-gray-200" aria-label="Otro color" />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[0.72rem] font-semibold text-gray-600">Estatus (tipificaciones)</span>
                <span className="text-[0.66rem] text-gray-400">{activos} activos · en este orden los ven los agentes</span>
              </div>
              <ul className="space-y-1.5">
                {f.estatus.map((e, i) => (
                  <li key={e.id ?? `n${i}`} className={clsx('flex items-center gap-2 rounded-xl border px-2 py-1.5', e.activo ? 'border-gray-200' : 'border-dashed border-gray-200 bg-gray-50 opacity-60')}>
                    <input type="color" value={e.color ?? '#9ca3af'} onChange={(ev) => setEst(i, { color: ev.target.value })}
                      className="h-6 w-6 flex-shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label={`Color de ${e.nombre}`} />
                    <input value={e.nombre} maxLength={100} onChange={(ev) => setEst(i, { nombre: ev.target.value })}
                      className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm text-gray-800 outline-none focus:bg-gray-50" aria-label="Nombre del estatus" />
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === f.estatus.length - 1} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => setEst(i, { activo: !e.activo })} title={e.activo ? 'Desactivar (las ventas con este estatus se conservan)' : 'Activar'}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100">{e.activo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                    {!e.id && (
                      <button type="button" onClick={() => setF({ ...f, estatus: f.estatus.filter((_, j) => j !== i) })} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Quitar"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input className="field py-1.5 text-sm" value={nuevo} placeholder="Nuevo estatus (ej. Formalizada)" onChange={(e) => setNuevo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }} />
                <button type="button" onClick={agregar} disabled={!nuevo.trim()} className="flex flex-shrink-0 items-center gap-1 rounded-xl border border-gray-200 px-3 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </button>
              </div>
              <p className="mt-1.5 text-[0.66rem] text-gray-400">Los estatus que ya existen no se borran: se desactivan, para no perder las ventas que los tienen.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!f?.nombre.trim() || !activos || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editando ? 'Guardar cambios' : 'Crear campaña'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
