import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Phone, Cake, MapPin, Save, Loader2, Pencil, X } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { api } from '@/lib/axios'

export interface UsuarioFicha {
  id: number
  nombre: string
  correo: string
  telefono: string
  fechaNacimiento: string | null
  direccion: {
    calleNumero: string
    colonia: string
    codigoPostal: string
    ciudad: string
    estado: string
    pais: string
  }
}

const field =
  'w-full rounded-lg border border-gray-200 bg-card px-3 py-2 text-[0.82rem] text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 ' +
  'disabled:bg-gray-50 disabled:text-gray-500'

function edad(iso: string | null): string {
  if (!iso) return ''
  const b = new Date(iso)
  if (Number.isNaN(b.getTime())) return ''
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a > 0 ? `${a} años` : ''
}

function Dato({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">
        {icon} {label}
      </label>
      {children}
    </div>
  )
}

export function UsuarioFichaExpandida({ usuarioId, puedeEditar }: { usuarioId: number; puedeEditar: boolean }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<UsuarioFicha | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['usuario-ficha', usuarioId],
    queryFn: async () => {
      const { data } = await api.get(`/usuarios/${usuarioId}/ficha`)
      return data.data as UsuarioFicha
    },
  })

  // sembrar el form cuando llega data / al entrar en edición
  if (data && !form) setForm(data)

  const set = (patch: Partial<UsuarioFicha>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const setDir = (patch: Partial<UsuarioFicha['direccion']>) =>
    setForm((f) => (f ? { ...f, direccion: { ...f.direccion, ...patch } } : f))

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await api.put(`/usuarios/${usuarioId}/ficha`, {
        correo: form.correo,
        telefono: form.telefono,
        fechaNacimiento: form.fechaNacimiento || null,
        direccion: form.direccion,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuario-ficha', usuarioId] })
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success('Información actualizada')
      setEditando(false)
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-2 px-6 py-5 text-[0.8rem] text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando información…
      </div>
    )
  }

  const disabled = !editando
  const dirResumen = [form.direccion.calleNumero, form.direccion.colonia, form.direccion.ciudad, form.direccion.estado]
    .filter(Boolean).join(', ')

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[0.78rem] font-bold text-gray-700">Información personal</p>
        {puedeEditar && (
          editando ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setForm(data ?? null); setEditando(false) }}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <button
                onClick={() => guardar.mutate()}
                disabled={guardar.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
              >
                {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
          )
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato icon={<Mail className="h-3 w-3" />} label="Correo">
          <input className={field} type="email" value={form.correo} disabled={disabled}
            onChange={(e) => set({ correo: e.target.value })} placeholder="correo@empresa.com" />
        </Dato>
        <Dato icon={<Phone className="h-3 w-3" />} label="Teléfono">
          <input className={field} value={form.telefono} disabled={disabled}
            onChange={(e) => set({ telefono: e.target.value })} placeholder="10 dígitos" />
        </Dato>
        <Dato icon={<Cake className="h-3 w-3" />} label="Fecha de nacimiento">
          <input className={field} type="date" value={form.fechaNacimiento ?? ''} disabled={disabled}
            onChange={(e) => set({ fechaNacimiento: e.target.value || null })} />
          {!editando && form.fechaNacimiento && edad(form.fechaNacimiento) && (
            <p className="mt-1 text-[0.66rem] text-gray-400">{edad(form.fechaNacimiento)}</p>
          )}
        </Dato>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">
          <MapPin className="h-3 w-3" /> Dirección
        </label>
        {disabled ? (
          <p className={clsx('text-[0.82rem]', dirResumen ? 'text-gray-700' : 'text-gray-400')}>
            {dirResumen || 'Sin dirección registrada'}
            {form.direccion.codigoPostal && dirResumen ? ` · C.P. ${form.direccion.codigoPostal}` : ''}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input className={field} value={form.direccion.calleNumero} onChange={(e) => setDir({ calleNumero: e.target.value })} placeholder="Calle y número" />
            <input className={field} value={form.direccion.colonia} onChange={(e) => setDir({ colonia: e.target.value })} placeholder="Colonia" />
            <input className={field} value={form.direccion.codigoPostal} onChange={(e) => setDir({ codigoPostal: e.target.value })} placeholder="Código postal" />
            <input className={field} value={form.direccion.ciudad} onChange={(e) => setDir({ ciudad: e.target.value })} placeholder="Ciudad" />
            <input className={field} value={form.direccion.estado} onChange={(e) => setDir({ estado: e.target.value })} placeholder="Estado" />
            <input className={field} value={form.direccion.pais} onChange={(e) => setDir({ pais: e.target.value })} placeholder="País" />
          </div>
        )}
      </div>
    </div>
  )
}
