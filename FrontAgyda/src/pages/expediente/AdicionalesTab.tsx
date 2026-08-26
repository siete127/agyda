import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shirt, HeartPulse, Landmark, Save } from 'lucide-react'
import { api } from '@/lib/axios'
import toast from 'react-hot-toast'
import { Campo, CampoSelect, CampoTextarea, SeccionCard, TIPO_SANGRE_OPCIONES } from './expedienteCompleto.shared'

interface AdicionalesForm {
  tallaPlayera: string; tallaPantalon: string; tallaCalzado: string
  tipoSangre: string; alergias: string; enfermedadesCronicas: string; medicamentos: string
  bancoNombre: string; bancoSwift: string; bancoCuenta: string; bancoClabe: string
  bancoNombre2: string; bancoCuenta2: string; bancoClabe2: string
  numFonacot: string; numInfonavit: string; aforeInstitucion: string; aforeCuenta: string
  riesgoTrabajoInstitucion: string; riesgoTrabajoCuenta: string
}

const EMPTY: AdicionalesForm = {
  tallaPlayera: '', tallaPantalon: '', tallaCalzado: '',
  tipoSangre: '', alergias: '', enfermedadesCronicas: '', medicamentos: '',
  bancoNombre: '', bancoSwift: '', bancoCuenta: '', bancoClabe: '',
  bancoNombre2: '', bancoCuenta2: '', bancoClabe2: '',
  numFonacot: '', numInfonavit: '', aforeInstitucion: '', aforeCuenta: '',
  riesgoTrabajoInstitucion: '', riesgoTrabajoCuenta: '',
}

export function AdicionalesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<AdicionalesForm>(EMPTY)
  const set = <K extends keyof AdicionalesForm>(k: K, v: AdicionalesForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['expediente-persona'],
    queryFn: async () => {
      const { data } = await api.get('/expedientes/mi/persona')
      return { ...EMPTY, ...(data?.data ?? {}) } as AdicionalesForm
    },
  })

  useEffect(() => { if (data) setForm((f) => ({ ...f, ...data })) }, [data])

  const guardar = useMutation({
    mutationFn: () => api.put('/expedientes/mi/persona', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-persona'] }); toast.success('Datos guardados') },
    onError: () => toast.error('Error al guardar'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
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
      <p className="text-[0.72rem] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Estos datos no serán visibles para tus compañeros. Son de uso exclusivo de Recursos Humanos.
      </p>

      <SeccionCard icon={Shirt} titulo="Uniforme">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo label="Talla de playera" value={form.tallaPlayera} onChange={(v) => set('tallaPlayera', v)} />
          <Campo label="Talla de pantalón" value={form.tallaPantalon} onChange={(v) => set('tallaPantalon', v)} />
          <Campo label="Talla de calzado" value={form.tallaCalzado} onChange={(v) => set('tallaCalzado', v)} />
        </div>
      </SeccionCard>

      <SeccionCard icon={HeartPulse} titulo="Salud">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoSelect label="Tipo de sangre" value={form.tipoSangre} onChange={(v) => set('tipoSangre', v)} opciones={TIPO_SANGRE_OPCIONES} />
          <div />
          <CampoTextarea label="Alergias" value={form.alergias} onChange={(v) => set('alergias', v)} />
          <CampoTextarea label="Patologías o enfermedades crónicas" value={form.enfermedadesCronicas} onChange={(v) => set('enfermedadesCronicas', v)} />
          <CampoTextarea label="Medicamentos" value={form.medicamentos} onChange={(v) => set('medicamentos', v)} />
        </div>
      </SeccionCard>

      <SeccionCard icon={Landmark} titulo="Financieros">
        <div className="space-y-4">
          <div>
            <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide mb-2">Cuenta bancaria principal</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo label="Banco / Institución" value={form.bancoNombre} onChange={(v) => set('bancoNombre', v)} />
              <Campo label="Código SWIFT/BIC" value={form.bancoSwift} onChange={(v) => set('bancoSwift', v)} />
              <Campo label="No. de cuenta" value={form.bancoCuenta} onChange={(v) => set('bancoCuenta', v)} />
              <Campo label="Cuenta CLABE" value={form.bancoClabe} onChange={(v) => set('bancoClabe', v)} />
            </div>
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide mb-2">Cuenta bancaria adicional</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo label="Banco / Institución" value={form.bancoNombre2} onChange={(v) => set('bancoNombre2', v)} />
              <Campo label="No. de cuenta" value={form.bancoCuenta2} onChange={(v) => set('bancoCuenta2', v)} />
              <Campo label="Cuenta CLABE" value={form.bancoClabe2} onChange={(v) => set('bancoClabe2', v)} />
            </div>
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide mb-2">Créditos y previsión social</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="No. FONACOT" value={form.numFonacot} onChange={(v) => set('numFonacot', v)} />
              <Campo label="No. INFONAVIT" value={form.numInfonavit} onChange={(v) => set('numInfonavit', v)} />
              <Campo label="Institución AFORE" value={form.aforeInstitucion} onChange={(v) => set('aforeInstitucion', v)} />
              <Campo label="No. de cuenta AFORE" value={form.aforeCuenta} onChange={(v) => set('aforeCuenta', v)} />
              <Campo label="Institución seguro de riesgos de trabajo" value={form.riesgoTrabajoInstitucion} onChange={(v) => set('riesgoTrabajoInstitucion', v)} />
              <Campo label="No. póliza / cuenta de riesgos de trabajo" value={form.riesgoTrabajoCuenta} onChange={(v) => set('riesgoTrabajoCuenta', v)} />
            </div>
          </div>
        </div>
      </SeccionCard>

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
