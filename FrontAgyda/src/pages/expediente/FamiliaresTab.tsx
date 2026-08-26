import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Save } from 'lucide-react'
import { api } from '@/lib/axios'
import toast from 'react-hot-toast'
import { Campo, CampoSelect, CampoCheckbox, RowEliminar, RELACION_OPCIONES } from './expedienteCompleto.shared'

interface Familiar {
  nombreCompleto: string
  relacion: string
  dependienteEconomico: boolean
  beneficiario: boolean
  curp: string
  fechaNacimiento: string
  contactoEmergencia: boolean
  correo: string
  telefonoMovil: string
  telefonoCasa: string
}

const EMPTY_FAMILIAR: Familiar = {
  nombreCompleto: '', relacion: '', dependienteEconomico: false, beneficiario: false,
  curp: '', fechaNacimiento: '', contactoEmergencia: false, correo: '', telefonoMovil: '', telefonoCasa: '',
}

export function FamiliaresTab() {
  const qc = useQueryClient()
  const [familiares, setFamiliares] = useState<Familiar[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['expediente-familiares'],
    queryFn: async () => {
      const { data } = await api.get('/expedientes/mi/familiares')
      const list = Array.isArray(data?.data) ? data.data : []
      return list.map((f: Record<string, unknown>): Familiar => ({
        nombreCompleto: String(f.nombreCompleto ?? ''),
        relacion: String(f.relacion ?? ''),
        dependienteEconomico: Boolean(f.dependienteEconomico),
        beneficiario: Boolean(f.beneficiario),
        curp: String(f.curp ?? ''),
        fechaNacimiento: String(f.fechaNacimiento ?? ''),
        contactoEmergencia: Boolean(f.contactoEmergencia),
        correo: String(f.correo ?? ''),
        telefonoMovil: String(f.telefonoMovil ?? ''),
        telefonoCasa: String(f.telefonoCasa ?? ''),
      }))
    },
  })

  useEffect(() => { if (data) setFamiliares(data) }, [data])

  const guardar = useMutation({
    mutationFn: () => api.put('/expedientes/mi/familiares', { familiares }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-familiares'] }); toast.success('Familiares guardados') },
    onError: () => toast.error('Error al guardar'),
  })

  const addFamiliar = () => setFamiliares([...familiares, { ...EMPTY_FAMILIAR }])
  const removeFamiliar = (i: number) => setFamiliares(familiares.filter((_, idx) => idx !== i))
  const updateFamiliar = (i: number, patch: Partial<Familiar>) =>
    setFamiliares(familiares.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  if (isLoading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 w-40 rounded-lg bg-gray-100 mb-3" />
        <div className="h-24 w-full rounded-lg bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-[0.72rem] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Toda esta sección es de uso exclusivo de Recursos Humanos. No es visible para tus compañeros.
      </p>

      {familiares.length === 0 && (
        <div className="card flex flex-col items-center justify-center gap-3 py-12">
          <Users className="h-8 w-8 text-gray-300" />
          <p className="text-[0.8rem] text-gray-400">Aún no has registrado familiares</p>
        </div>
      )}

      <div className="space-y-4">
        {familiares.map((f, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[0.78rem] font-bold text-gray-700">Familiar {i + 1}</h4>
              <RowEliminar onClick={() => removeFamiliar(i)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nombre completo" value={f.nombreCompleto} onChange={(v) => updateFamiliar(i, { nombreCompleto: v })} />
              <CampoSelect label="Relación" value={f.relacion} onChange={(v) => updateFamiliar(i, { relacion: v })} opciones={RELACION_OPCIONES} />
              <Campo label="CURP" value={f.curp} onChange={(v) => updateFamiliar(i, { curp: v })} />
              <Campo label="Fecha de nacimiento" type="date" value={f.fechaNacimiento} onChange={(v) => updateFamiliar(i, { fechaNacimiento: v })} />
              <Campo label="Correo electrónico" value={f.correo} onChange={(v) => updateFamiliar(i, { correo: v })} />
              <Campo label="Teléfono móvil" value={f.telefonoMovil} onChange={(v) => updateFamiliar(i, { telefonoMovil: v })} />
              <Campo label="Teléfono de casa" value={f.telefonoCasa} onChange={(v) => updateFamiliar(i, { telefonoCasa: v })} />
            </div>
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100">
              <CampoCheckbox label="Dependiente económico" checked={f.dependienteEconomico} onChange={(v) => updateFamiliar(i, { dependienteEconomico: v })} />
              <CampoCheckbox label="Beneficiario" checked={f.beneficiario} onChange={(v) => updateFamiliar(i, { beneficiario: v })} />
              <CampoCheckbox label="Contacto de emergencia" checked={f.contactoEmergencia} onChange={(v) => updateFamiliar(i, { contactoEmergencia: v })} />
            </div>
          </div>
        ))}
      </div>

      <button onClick={addFamiliar} className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-3 py-2 transition-colors">
        <Plus className="h-3.5 w-3.5" /> Agregar otro familiar
      </button>

      <div className="flex justify-end">
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[0.8rem] font-semibold text-white hover:bg-brand-muted transition-colors shadow-glow disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {guardar.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
