import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Briefcase, FileText, X, Users } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { api } from '@/lib/axios'
import { crmService } from '@/services/crm.service'
import type { CRMOportunidad } from '@/types/crm.types'

type Rol = 'lider' | 'miembro' | 'revisor'
interface Integrante { nombre: string; rol: Rol }

const ROL_LABEL: Record<Rol, string> = { lider: 'Líder', miembro: 'Miembro', revisor: 'Revisor' }

export function CRMGenerarProyectoModal({
  opo, onClose, onCreated,
}: {
  opo: CRMOportunidad
  onClose: () => void
  onCreated: (proyectoId: number) => void
}) {
  const [nombre, setNombre] = useState(opo.nombre)
  const [busqueda, setBusqueda] = useState('')
  const [rolNuevo, setRolNuevo] = useState<Rol>('miembro')
  const [integrantes, setIntegrantes] = useState<Integrante[]>(
    opo.asignadoNombre ? [{ nombre: opo.asignadoNombre, rol: 'lider' }] : []
  )

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-asignables'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[])
        .map((r) => ({
          id: Number(r['id'] ?? r['ID'] ?? 0),
          nombre: String(r['nombre'] ?? r['nombres'] ?? r['NOMBRES'] ?? ''),
          tipoUsuario: String(r['tipoUsuario'] ?? r['TIPO_USUARIO'] ?? '').toUpperCase(),
          activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? true),
        }))
        .filter((u) => u.activo && u.nombre)
    },
    staleTime: 300_000,
  })

  const nombresElegidos = new Set(integrantes.map((i) => i.nombre))
  const disponibles = usuarios.filter(
    (u) => !nombresElegidos.has(u.nombre) && u.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const agregar = (nombreUsuario: string) => {
    setIntegrantes((prev) => [...prev, { nombre: nombreUsuario, rol: rolNuevo }])
    setBusqueda('')
  }
  const quitar = (nombreUsuario: string) => setIntegrantes((prev) => prev.filter((i) => i.nombre !== nombreUsuario))
  const cambiarRol = (nombreUsuario: string, rol: Rol) =>
    setIntegrantes((prev) => prev.map((i) => (i.nombre === nombreUsuario ? { ...i, rol } : i)))

  const crear = useMutation({
    mutationFn: () => crmService.generarProyecto(opo.id, nombre.trim(), integrantes),
    onSuccess: (data) => {
      toast.success('Proyecto creado')
      onCreated(data.proyectoId)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Error al crear el proyecto')
    },
  })

  return (
    <Modal isOpen title="" onClose={onClose} size="md">
      <div className="rounded-xl bg-gradient-to-r from-brand to-indigo-500 px-4 py-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-white leading-tight">¿Crear proyecto de seguimiento?</p>
            <p className="text-[0.7rem] text-white/70 mt-0.5">
              Se generará en Proyectos con 2 tareas iniciales: "Seguimiento al cliente" y "Preparar propuesta"
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="field-label flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-gray-400" /> Nombre del proyecto
          </label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="field-input font-medium"
            autoFocus
          />
        </div>

        <div>
          <label className="field-label flex items-center gap-1.5">
            <Users className="h-3 w-3 text-gray-400" /> Integrantes
          </label>

          {integrantes.length > 0 && (
            <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
              {integrantes.map((i) => (
                <div key={i.nombre} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5">
                  <span className="text-[0.8rem] font-medium text-gray-800 truncate">{i.nombre}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <select
                      value={i.rol}
                      onChange={(e) => cambiarRol(i.nombre, e.target.value as Rol)}
                      className="rounded-lg border border-gray-200 bg-card px-2 py-1 text-[0.7rem] font-semibold text-gray-600"
                    >
                      {(Object.keys(ROL_LABEL) as Rol[]).map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                    </select>
                    <button onClick={() => quitar(i.nombre)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar usuario para agregar..."
              className="field-input flex-1 text-sm"
            />
            <select
              value={rolNuevo}
              onChange={(e) => setRolNuevo(e.target.value as Rol)}
              className="field-input w-28 text-sm"
            >
              {(Object.keys(ROL_LABEL) as Rol[]).map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
            </select>
          </div>
          {busqueda && (
            <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-gray-200 p-1">
              {disponibles.length === 0 ? (
                <p className="px-2 py-2 text-[0.72rem] text-gray-400">Sin resultados</p>
              ) : (
                disponibles.slice(0, 8).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => agregar(u.nombre)}
                    className={clsx(
                      'w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-[0.78rem] text-gray-700 hover:bg-brand/5 transition-colors',
                    )}
                  >
                    <span>{u.nombre}</span>
                    <span className="text-[0.65rem] text-gray-400">{u.tipoUsuario}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            Ahora no
          </button>
          <button
            onClick={() => crear.mutate()}
            disabled={!nombre.trim() || crear.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
          >
            {crear.isPending && <Spinner size="sm" />} Crear proyecto
          </button>
        </div>
      </div>
    </Modal>
  )
}
