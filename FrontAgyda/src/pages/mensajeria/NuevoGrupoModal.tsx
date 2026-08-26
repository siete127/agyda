import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useCurrentUser } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import { api } from '@/lib/axios'
import type { MensajeriaCanal } from '@/types/mensajeria.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface UsuarioSimple {
  id: number
  nombre: string
  fotoUrl: string | null
}

async function listarUsuarios(): Promise<UsuarioSimple[]> {
  const { data } = await api.get('/usuarios')
  const list = Array.isArray(data) ? data : (data?.data ?? [])
  return (list as Record<string, unknown>[]).map((u) => ({
    id: Number(u.id),
    nombre: String(u.nombre ?? ''),
    fotoUrl: (u.fotoUrl as string) || null,
  }))
}

interface NuevoGrupoModalProps {
  onClose: () => void
  onCreado: (canal: MensajeriaCanal) => void
}

export function NuevoGrupoModal({ onClose, onCreado }: NuevoGrupoModalProps) {
  const user = useCurrentUser()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<number[]>([])

  const { data: usuarios = [], isLoading } = useQuery({ queryKey: ['mensajeria-usuarios'], queryFn: listarUsuarios })

  const crear = useMutation({
    mutationFn: () => mensajeriaService.crearGrupo(nombre.trim(), seleccionados, descripcion.trim() || undefined),
    onSuccess: (canal) => onCreado(canal),
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        toast.error('No tienes permiso para crear grupos')
      } else {
        toast.error('No se pudo crear el grupo')
      }
    },
  })

  const toggleUsuario = (id: number) => {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const filtrados = usuarios
    .filter((u) => u.id !== user?.id)
    .filter((u) => u.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  const canCrear = nombre.trim().length > 0 && seleccionados.length > 0

  return (
    <Modal isOpen onClose={onClose} title="Nuevo grupo" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre del grupo</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="field"
            placeholder="Ej. Equipo de Soporte"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción (opcional)</label>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="field"
            placeholder="¿De qué trata este grupo?"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Miembros {seleccionados.length > 0 && <span className="text-brand">({seleccionados.length})</span>}
          </label>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="field mb-2"
            placeholder="Buscar usuario..."
          />
          <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-100">
            {isLoading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : filtrados.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400">Sin resultados</p>
            ) : (
              filtrados.map((u) => {
                const activo = seleccionados.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUsuario(u.id)}
                    className={clsx(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                      activo ? 'bg-brand/10' : 'hover:bg-gray-50',
                    )}
                  >
                    <Avatar src={u.fotoUrl} name={u.nombre} size="sm" />
                    <span className="flex-1 truncate">{u.nombre}</span>
                    {activo && <Users className="h-3.5 w-3.5 text-brand" />}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!canCrear} onClick={() => crear.mutate()}>
            Crear grupo
          </Button>
        </div>
      </div>
    </Modal>
  )
}
