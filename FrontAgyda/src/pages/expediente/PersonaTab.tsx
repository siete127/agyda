import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCircle2, Heart, Sparkles, Save } from 'lucide-react'
import { api } from '@/lib/axios'
import toast from 'react-hot-toast'
import { Campo, CampoSelect, CampoTextarea, SeccionCard, GENERO_OPCIONES, ESTADO_CIVIL_OPCIONES } from './expedienteCompleto.shared'

interface PersonaForm {
  alias: string; genero: string; estadoCivil: string; nacionalidad: string; fechaNacimiento: string
  paisNacimiento: string; estadoNacimiento: string; ciudadNacimiento: string
  paisResidencia: string; estadoResidencia: string; ciudadResidencia: string
  numSeguroSocial: string; rfc: string; idCif: string; curp: string
  polizaGastosMedicos: string; polizaSeguroVida: string
  acercaDeMi: string; librosFavoritos: string; peliculasFavoritas: string; musicaFavorita: string
  seriesFavoritas: string; actividadesFavoritas: string; temasInteres: string
  pastelFavorito: string; bebidaFavorita: string; superheroeFavorito: string; colorFavorito: string
  autoFavorito: string; animalFavorito: string; deporteFavorito: string
}

const EMPTY: PersonaForm = {
  alias: '', genero: '', estadoCivil: '', nacionalidad: '', fechaNacimiento: '',
  paisNacimiento: '', estadoNacimiento: '', ciudadNacimiento: '',
  paisResidencia: '', estadoResidencia: '', ciudadResidencia: '',
  numSeguroSocial: '', rfc: '', idCif: '', curp: '',
  polizaGastosMedicos: '', polizaSeguroVida: '',
  acercaDeMi: '', librosFavoritos: '', peliculasFavoritas: '', musicaFavorita: '',
  seriesFavoritas: '', actividadesFavoritas: '', temasInteres: '',
  pastelFavorito: '', bebidaFavorita: '', superheroeFavorito: '', colorFavorito: '',
  autoFavorito: '', animalFavorito: '', deporteFavorito: '',
}

export function PersonaTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<PersonaForm>(EMPTY)
  const set = <K extends keyof PersonaForm>(k: K, v: PersonaForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['expediente-persona'],
    queryFn: async () => {
      const { data } = await api.get('/expedientes/mi/persona')
      return { ...EMPTY, ...(data?.data ?? {}) } as PersonaForm
    },
  })

  useEffect(() => { if (data) setForm(data) }, [data])

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
      <SeccionCard icon={UserCircle2} titulo="Demográficos">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Alias" value={form.alias} onChange={(v) => set('alias', v)} />
          <CampoSelect label="Género" value={form.genero} onChange={(v) => set('genero', v)} opciones={GENERO_OPCIONES} />
          <CampoSelect label="Estado civil" value={form.estadoCivil} onChange={(v) => set('estadoCivil', v)} opciones={ESTADO_CIVIL_OPCIONES} />
          <Campo label="Nacionalidad" value={form.nacionalidad} onChange={(v) => set('nacionalidad', v)} />
          <Campo label="Fecha de nacimiento" type="date" value={form.fechaNacimiento} onChange={(v) => set('fechaNacimiento', v)} />
          <div />
          <Campo label="País de nacimiento" value={form.paisNacimiento} onChange={(v) => set('paisNacimiento', v)} />
          <Campo label="Estado de nacimiento" value={form.estadoNacimiento} onChange={(v) => set('estadoNacimiento', v)} />
          <Campo label="Ciudad de nacimiento" value={form.ciudadNacimiento} onChange={(v) => set('ciudadNacimiento', v)} />
          <Campo label="País de residencia" value={form.paisResidencia} onChange={(v) => set('paisResidencia', v)} />
          <Campo label="Estado de residencia" value={form.estadoResidencia} onChange={(v) => set('estadoResidencia', v)} />
          <Campo label="Ciudad de residencia" value={form.ciudadResidencia} onChange={(v) => set('ciudadResidencia', v)} />
          <Campo label="No. Seguro Social" value={form.numSeguroSocial} onChange={(v) => set('numSeguroSocial', v)} />
          <Campo label="RFC" value={form.rfc} onChange={(v) => set('rfc', v)} />
          <Campo label="ID CIF" value={form.idCif} onChange={(v) => set('idCif', v)} />
          <Campo label="CURP" value={form.curp} onChange={(v) => set('curp', v)} />
          <Campo label="Póliza seguro de gastos médicos mayores" value={form.polizaGastosMedicos} onChange={(v) => set('polizaGastosMedicos', v)} />
          <Campo label="Póliza seguro de vida" value={form.polizaSeguroVida} onChange={(v) => set('polizaSeguroVida', v)} />
        </div>
      </SeccionCard>

      <SeccionCard icon={Heart} titulo="Rapport">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoTextarea label="Acerca de mí" value={form.acercaDeMi} onChange={(v) => set('acercaDeMi', v)} help="Autobiografía de un solo párrafo en primera persona" />
          <CampoTextarea label="Libros favoritos" value={form.librosFavoritos} onChange={(v) => set('librosFavoritos', v)} help="Uno por renglón" />
          <CampoTextarea label="Películas favoritas" value={form.peliculasFavoritas} onChange={(v) => set('peliculasFavoritas', v)} help="Una por renglón" />
          <CampoTextarea label="Música favorita" value={form.musicaFavorita} onChange={(v) => set('musicaFavorita', v)} help="Una por renglón" />
          <CampoTextarea label="Series de TV" value={form.seriesFavoritas} onChange={(v) => set('seriesFavoritas', v)} help="Una por renglón" />
          <CampoTextarea label="Actividades favoritas" value={form.actividadesFavoritas} onChange={(v) => set('actividadesFavoritas', v)} help="Hobbies, deportes o pasatiempos. Una por renglón" />
          <CampoTextarea label="Temas de interés" value={form.temasInteres} onChange={(v) => set('temasInteres', v)} help="Uno por renglón" />
        </div>
      </SeccionCard>

      <SeccionCard icon={Sparkles} titulo="Preferencias">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Pastel favorito" value={form.pastelFavorito} onChange={(v) => set('pastelFavorito', v)} />
          <Campo label="Bebida favorita" value={form.bebidaFavorita} onChange={(v) => set('bebidaFavorita', v)} />
          <Campo label="Superhéroe favorito" value={form.superheroeFavorito} onChange={(v) => set('superheroeFavorito', v)} />
          <Campo label="Color favorito" value={form.colorFavorito} onChange={(v) => set('colorFavorito', v)} />
          <Campo label="Automóvil favorito" value={form.autoFavorito} onChange={(v) => set('autoFavorito', v)} />
          <Campo label="Animal favorito" value={form.animalFavorito} onChange={(v) => set('animalFavorito', v)} />
          <Campo label="Deporte favorito" value={form.deporteFavorito} onChange={(v) => set('deporteFavorito', v)} />
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
