import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, MapPin, Plus, Trash2, Share2, Save } from 'lucide-react'
import { api } from '@/lib/axios'
import { SeccionCard, Campo } from './expedienteCompleto.shared'
import toast from 'react-hot-toast'

interface RedSocial { red: string; url: string }

interface ContactoForm {
  telefonoPrincipal: string
  correo: string
  direccion: { calleNumero: string; colonia: string; codigoPostal: string; ciudad: string; estado: string; pais: string }
  telefonosAdicionales: string[]
  redesSociales: RedSocial[]
}

const EMPTY_CONTACTO: ContactoForm = {
  telefonoPrincipal: '',
  correo: '',
  direccion: { calleNumero: '', colonia: '', codigoPostal: '', ciudad: '', estado: '', pais: '' },
  telefonosAdicionales: [],
  redesSociales: [],
}

function parseContacto(r: Record<string, unknown>): ContactoForm {
  const dir = (r['direccion'] ?? {}) as Record<string, unknown>
  return {
    telefonoPrincipal: String(r['telefonoPrincipal'] ?? ''),
    correo: String(r['correo'] ?? ''),
    direccion: {
      calleNumero: String(dir['calleNumero'] ?? ''),
      colonia: String(dir['colonia'] ?? ''),
      codigoPostal: String(dir['codigoPostal'] ?? ''),
      ciudad: String(dir['ciudad'] ?? ''),
      estado: String(dir['estado'] ?? ''),
      pais: String(dir['pais'] ?? ''),
    },
    telefonosAdicionales: Array.isArray(r['telefonosAdicionales']) ? (r['telefonosAdicionales'] as string[]) : [],
    redesSociales: Array.isArray(r['redesSociales']) ? (r['redesSociales'] as RedSocial[]) : [],
  }
}

export function ContactoTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<ContactoForm>(EMPTY_CONTACTO)

  const { data, isLoading } = useQuery({
    queryKey: ['mi-contacto'],
    queryFn: async () => {
      const { data } = await api.get('/expedientes/mi/contacto')
      return parseContacto(data?.data ?? {})
    },
  })

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const guardar = useMutation({
    mutationFn: () => api.put('/expedientes/mi/contacto', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mi-contacto'] })
      toast.success('Datos de contacto guardados')
    },
    onError: () => toast.error('Error al guardar los datos de contacto'),
  })

  const addTelefono = () => setForm({ ...form, telefonosAdicionales: [...form.telefonosAdicionales, ''] })
  const removeTelefono = (i: number) => setForm({ ...form, telefonosAdicionales: form.telefonosAdicionales.filter((_, idx) => idx !== i) })
  const updateTelefono = (i: number, v: string) => setForm({ ...form, telefonosAdicionales: form.telefonosAdicionales.map((t, idx) => idx === i ? v : t) })

  const addRed = () => setForm({ ...form, redesSociales: [...form.redesSociales, { red: '', url: '' }] })
  const removeRed = (i: number) => setForm({ ...form, redesSociales: form.redesSociales.filter((_, idx) => idx !== i) })
  const updateRed = (i: number, patch: Partial<RedSocial>) => setForm({ ...form, redesSociales: form.redesSociales.map((r, idx) => idx === i ? { ...r, ...patch } : r) })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-4 w-40 rounded-lg bg-gray-100 mb-3" />
            <div className="h-9 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <SeccionCard icon={Phone} titulo="Contacto principal">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Teléfono móvil principal" value={form.telefonoPrincipal} placeholder="Ej. 555 123 4567"
            onChange={(v) => setForm({ ...form, telefonoPrincipal: v })} />
          <Campo label="Correo de usuario" value={form.correo} placeholder="nombre@ardabytec.com"
            onChange={(v) => setForm({ ...form, correo: v })} />
        </div>
      </SeccionCard>

      <SeccionCard icon={MapPin} titulo="Dirección">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo label="Calle y número" value={form.direccion.calleNumero} placeholder="Av. Reforma 123"
              onChange={(v) => setForm({ ...form, direccion: { ...form.direccion, calleNumero: v } })} />
          </div>
          <Campo label="Colonia" value={form.direccion.colonia}
            onChange={(v) => setForm({ ...form, direccion: { ...form.direccion, colonia: v } })} />
          <Campo label="Código postal" value={form.direccion.codigoPostal}
            onChange={(v) => setForm({ ...form, direccion: { ...form.direccion, codigoPostal: v } })} />
          <Campo label="Ciudad" value={form.direccion.ciudad}
            onChange={(v) => setForm({ ...form, direccion: { ...form.direccion, ciudad: v } })} />
          <Campo label="Estado" value={form.direccion.estado}
            onChange={(v) => setForm({ ...form, direccion: { ...form.direccion, estado: v } })} />
          <div className="sm:col-span-2">
            <Campo label="País" value={form.direccion.pais}
              onChange={(v) => setForm({ ...form, direccion: { ...form.direccion, pais: v } })} />
          </div>
        </div>
      </SeccionCard>

      <SeccionCard icon={Phone} titulo="Teléfonos adicionales">
        <div className="space-y-2.5">
          {form.telefonosAdicionales.length === 0 && (
            <p className="text-[0.78rem] text-gray-400">Sin teléfonos adicionales registrados</p>
          )}
          {form.telefonosAdicionales.map((tel, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={tel} onChange={(e) => updateTelefono(i, e.target.value)} placeholder="Ej. 555 987 6543" className="field flex-1" />
              <button onClick={() => removeTelefono(i)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addTelefono} disabled={form.telefonosAdicionales.length >= 2}
          className="mt-3 flex items-center gap-1 text-[0.75rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="h-3.5 w-3.5" /> Agregar teléfono
        </button>
      </SeccionCard>

      <SeccionCard icon={Share2} titulo="Redes sociales">
        <div className="space-y-2.5">
          {form.redesSociales.length === 0 && (
            <p className="text-[0.78rem] text-gray-400">Sin redes sociales registradas</p>
          )}
          {form.redesSociales.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={r.red} onChange={(e) => updateRed(i, { red: e.target.value })} placeholder="Red (ej. LinkedIn)" className="field w-40 flex-shrink-0" />
              <input value={r.url} onChange={(e) => updateRed(i, { url: e.target.value })} placeholder="Usuario o enlace" className="field flex-1" />
              <button onClick={() => removeRed(i)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addRed}
          className="mt-3 flex items-center gap-1 text-[0.75rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1.5 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Agregar red social
        </button>
      </SeccionCard>

      <div className="flex justify-end">
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[0.8rem] font-semibold text-white hover:bg-brand-dark transition-colors disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {guardar.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
