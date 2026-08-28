import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IdCard, Plus, Trash2, ChevronRight, Briefcase, Clock, ShieldCheck, Search, SlidersHorizontal, X } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { perfilConfigService, type Perfil } from '@/services/perfilConfig.service'
import { PerfilModal } from './PerfilModal'

const ROL_CHIP: Record<string, string> = {
  AD: 'bg-red-100 text-red-700',
  TI: 'bg-blue-100 text-blue-700',
  CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600',
  ST: 'bg-emerald-100 text-emerald-700',
  VE: 'bg-amber-100 text-amber-700',
}

export function PerfilesTab() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Perfil | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Perfil | null>(null)
  const [busca, setBusca] = useState('')
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtroRol, setFiltroRol] = useState('todos')

  const { data: perfiles = [], isLoading } = useQuery({
    queryKey: ['perfiles'],
    queryFn: () => perfilConfigService.list(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => perfilConfigService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perfiles'] }); toast.success('Perfil eliminado') },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al eliminar'),
  })

  const rolesDisponibles = useMemo(
    () => Array.from(new Set(perfiles.map((p) => p.ROL_BASE).filter(Boolean))) as string[],
    [perfiles],
  )

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return perfiles.filter((p) => {
      const matchTexto = !q || `${p.NOMBRE} ${p.PUESTO ?? ''} ${p.DEPARTAMENTO ?? ''} ${p.ROL_NOMBRE ?? ''}`.toLowerCase().includes(q)
      const matchRol = filtroRol === 'todos' || p.ROL_BASE === filtroRol
      return matchTexto && matchRol
    })
  }, [perfiles, busca, filtroRol])

  const filtrosActivos = filtroRol !== 'todos' ? 1 : 0

  return (
    <div className="space-y-4">
      {/* ── Encabezado con ilustración ── */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-card">
        {/* ilustración decorativa */}
        <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-1/2 overflow-hidden sm:block">
          <div className="absolute right-16 top-1/2 h-24 w-24 -translate-y-1/2 rounded-3xl bg-emerald-500/90 rotate-6" />
          <div className="absolute right-14 top-1/2 flex h-24 w-24 -translate-y-1/2 items-center justify-center rounded-3xl bg-emerald-500 rotate-6 shadow-lg shadow-emerald-500/30">
            <ShieldCheck className="h-11 w-11 -rotate-6 text-white" />
          </div>
          <span className="absolute right-40 top-[30%] h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="absolute right-8 top-[22%] h-2 w-2 rounded-full bg-rose-300" />
          <span className="absolute right-44 top-[70%] h-8 w-3 rounded-full bg-blue-200/70 rotate-45" />
          <span className="absolute right-6 top-[64%] h-3 w-9 rounded-full bg-blue-200/70 -rotate-12" />
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
              <IdCard className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[1.15rem] font-bold text-gray-900">Perfiles</h2>
              <p className="text-[0.82rem] text-gray-400">Plantillas de datos de puesto para crear usuarios más rápido.</p>
            </div>
          </div>
          <button
            onClick={() => { setSelected(null); setShowModal(true) }}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[0.82rem] font-semibold text-white shadow-sm shadow-brand/25 transition-all hover:bg-brand-dark active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> Nuevo perfil
          </button>
        </div>
      </div>

      {/* ── Card lista ── */}
      <div className="rounded-2xl border border-gray-100 bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-50 p-5">
          <div>
            <h3 className="text-[0.95rem] font-bold text-gray-900">Lista de perfiles</h3>
            <p className="text-[0.78rem] text-gray-400">Consulta y administra los perfiles disponibles en el sistema.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar perfiles…"
                className="w-52 rounded-xl border border-gray-200 bg-card py-2 pl-9 pr-3 text-[0.82rem] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            <button
              onClick={() => setShowFiltros((v) => !v)}
              className={clsx(
                'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.8rem] font-semibold transition-colors',
                showFiltros || filtrosActivos ? 'border-brand/40 bg-brand/[0.04] text-brand' : 'border-gray-200 bg-card text-gray-600 hover:bg-gray-50',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtrar
              {filtrosActivos > 0 && <span className="rounded-full bg-brand px-1.5 text-[0.6rem] font-bold text-white">{filtrosActivos}</span>}
            </button>
          </div>
        </div>

        {/* panel de filtros */}
        {showFiltros && rolesDisponibles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-50 px-5 py-3 animate-fade-in">
            <span className="mr-1 text-[0.7rem] font-semibold uppercase tracking-wider text-gray-400">Rol</span>
            <button
              onClick={() => setFiltroRol('todos')}
              className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                filtroRol === 'todos' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
            >
              Todos
            </button>
            {rolesDisponibles.map((rb) => (
              <button
                key={rb}
                onClick={() => setFiltroRol(rb)}
                className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                  filtroRol === rb ? (ROL_CHIP[rb] ?? 'bg-gray-200 text-gray-700') : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
              >
                {rb}
              </button>
            ))}
            {filtrosActivos > 0 && (
              <button onClick={() => setFiltroRol('todos')} className="ml-1 flex items-center gap-1 text-[0.7rem] font-semibold text-gray-400 hover:text-gray-600">
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* filas */}
        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-12"><IdCard className="h-5 w-5 animate-pulse text-gray-300" /></div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                <IdCard className="h-6 w-6 text-emerald-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">
                {perfiles.length === 0 ? 'Sin perfiles' : 'Sin resultados'}
              </p>
              {perfiles.length === 0 && (
                <p className="max-w-xs text-center text-xs text-gray-400">
                  Crea perfiles como “Asesor CC turno matutino” para no llenar puesto, horario y rol
                  cada vez que das de alta a alguien.
                </p>
              )}
            </div>
          ) : (
            filtrados.map((p) => (
              <div
                key={p.PERFIL_ID}
                onClick={() => { setSelected(p); setShowModal(true) }}
                className="group flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50/70"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                  <IdCard className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.92rem] font-bold text-gray-900">{p.NOMBRE}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.74rem] text-gray-400">
                    {p.PUESTO && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" /> {p.PUESTO}</span>}
                    {p.ID_HORARIO != null && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-gray-300">|</span>
                        <Clock className="h-3 w-3" /> Horario asignado
                      </span>
                    )}
                    {p.DESCRIPCION && !p.PUESTO && <span className="truncate">{p.DESCRIPCION}</span>}
                  </div>
                </div>

                {p.ROL_NOMBRE && (
                  <span className="hidden items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-[0.75rem] font-medium text-gray-500 sm:inline-flex">
                    <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
                    {p.ROL_NOMBRE}
                  </span>
                )}
                {p.ROL_BASE ? (
                  <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[0.72rem] font-bold', ROL_CHIP[p.ROL_BASE] ?? ROL_CHIP.CL)}>
                    {p.ROL_BASE}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[0.7rem] font-semibold text-gray-400">sin rol</span>
                )}

                <div className="flex items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(p) }}
                    title="Eliminar perfil"
                    className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && <PerfilModal perfil={selected} onClose={() => setShowModal(false)} />}

      {confirmDelete && (
        <Modal isOpen onClose={() => setConfirmDelete(null)} title="Eliminar perfil" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ¿Eliminar el perfil <span className="font-semibold text-gray-900">{confirmDelete.NOMBRE}</span>?
              Los usuarios que ya se crearon con este perfil no se ven afectados.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button
                isLoading={eliminar.isPending}
                onClick={() => { eliminar.mutate(confirmDelete.PERFIL_ID); setConfirmDelete(null) }}
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
