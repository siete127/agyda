import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Plus, Trash2, Lock, Layers, AlertTriangle,
  ChevronRight, Headset, Users, Monitor, TrendingUp,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { roleService, type Rol } from '@/services/role.service'
import { RolModal } from './RolModal'

// Ícono + colores por código base — cada rol tiene su identidad visual.
const ROL_STYLE: Record<string, { icon: typeof ShieldCheck; soft: string; text: string; chip: string }> = {
  AD: { icon: ShieldAlert,  soft: 'bg-red-50',     text: 'text-red-500',     chip: 'bg-red-100 text-red-700' },
  TI: { icon: Monitor,      soft: 'bg-blue-50',    text: 'text-blue-500',    chip: 'bg-blue-100 text-blue-700' },
  CC: { icon: Headset,      soft: 'bg-purple-50',  text: 'text-purple-500',  chip: 'bg-purple-100 text-purple-700' },
  ST: { icon: Users,        soft: 'bg-emerald-50', text: 'text-emerald-500', chip: 'bg-emerald-100 text-emerald-700' },
  VE: { icon: TrendingUp,   soft: 'bg-amber-50',   text: 'text-amber-500',   chip: 'bg-amber-100 text-amber-700' },
  CL: { icon: Users,        soft: 'bg-gray-100',   text: 'text-gray-500',    chip: 'bg-gray-100 text-gray-600' },
}
const styleFor = (base: string) => ROL_STYLE[base] ?? ROL_STYLE.CL

export function RolesTab() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Rol | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Rol | null>(null)
  // Segunda confirmación para roles de sistema: el usuario debe escribir el nombre.
  const [confirmTexto, setConfirmTexto] = useState('')

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => roleService.list(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => roleService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Rol eliminado') },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al eliminar'),
  })

  return (
    <div className="space-y-4">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/[0.08] text-brand">
            <ShieldCheck className="h-5.5 w-5.5" />
          </div>
          <div>
            <h2 className="text-[1.05rem] font-bold text-gray-900">Roles del sistema</h2>
            <p className="text-[0.8rem] text-gray-400">Gestiona los roles y permisos de acceso</p>
          </div>
        </div>
        <button
          onClick={() => { setSelected(null); setShowModal(true) }}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[0.82rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> Nuevo rol
        </button>
      </div>

      {/* ── Lista de roles ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card divide-y divide-gray-50">
        {isLoading ? (
          <div className="flex justify-center py-12"><ShieldCheck className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/[0.08]">
              <ShieldCheck className="h-6 w-6 text-brand/40" />
            </div>
            <p className="text-sm font-semibold text-gray-500">Sin roles</p>
          </div>
        ) : (
          roles.map((r) => {
            const st = styleFor(r.ROL_BASE)
            const Icon = st.icon
            return (
              <div
                key={r.ROL_ID}
                onClick={() => { setSelected(r); setShowModal(true) }}
                className="group flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50/70"
              >
                <div className={clsx('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl', st.soft)}>
                  <Icon className={clsx('h-5.5 w-5.5', st.text)} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[0.95rem] font-bold text-gray-900">{r.NOMBRE}</p>
                    {r.ES_SISTEMA && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand/[0.08] px-1.5 py-0.5 text-[0.62rem] font-semibold text-brand">
                        <Lock className="h-2.5 w-2.5" /> Sistema
                      </span>
                    )}
                  </div>
                  {r.DESCRIPCION && <p className="mt-0.5 truncate text-[0.78rem] text-gray-400">{r.DESCRIPCION}</p>}
                </div>

                <span className="hidden items-center gap-1.5 text-[0.8rem] text-gray-400 sm:flex">
                  <Layers className="h-3.5 w-3.5 text-gray-300" /> {r.MODULOS_COUNT ?? 0} módulos
                </span>

                <div className="hidden h-8 w-px bg-gray-100 sm:block" />

                <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[0.72rem] font-bold', st.chip)}>
                  {r.ROL_BASE}
                </span>

                <div className="flex items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(r); setConfirmTexto('') }}
                    title="Eliminar rol"
                    className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {showModal && <RolModal rol={selected} onClose={() => setShowModal(false)} />}

      {confirmDelete && (
        <Modal isOpen onClose={() => setConfirmDelete(null)} title="Eliminar rol" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ¿Eliminar el rol <span className="font-semibold text-gray-900">{confirmDelete.NOMBRE}</span>?
              Los usuarios que ya se crearon con este rol conservan sus permisos.
            </p>

            {confirmDelete.ES_SISTEMA && (
              <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                <p className="flex items-start gap-2 text-[0.8rem] font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Es un rol base del sistema. Al borrarlo dejará de ofrecerse al crear usuarios y no se
                  regenera. Escribe <span className="font-bold">{confirmDelete.NOMBRE}</span> para confirmar.
                </p>
                <input
                  value={confirmTexto}
                  onChange={(e) => setConfirmTexto(e.target.value)}
                  placeholder={confirmDelete.NOMBRE}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button
                isLoading={eliminar.isPending}
                disabled={confirmDelete.ES_SISTEMA && confirmTexto.trim() !== confirmDelete.NOMBRE}
                onClick={() => { eliminar.mutate(confirmDelete.ROL_ID); setConfirmDelete(null) }}
                className="bg-red-600 hover:bg-red-700 border-red-600"
              >
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
