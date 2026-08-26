import { Trash2 } from 'lucide-react'

export function SeccionCard({ icon: Icon, titulo, subtitulo, children }: { icon: React.ElementType; titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand flex-shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-[0.82rem] font-bold text-gray-800">{titulo}</h3>
      </div>
      {subtitulo && <p className="text-[0.72rem] text-gray-400 mb-4 ml-10">{subtitulo}</p>}
      {!subtitulo && <div className="mb-4" />}
      {children}
    </div>
  )
}

export function Campo({ label, value, onChange, placeholder, help, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; help?: string; type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field" />
      {help && <p className="mt-1 text-[0.68rem] text-gray-400">{help}</p>}
    </div>
  )
}

export function CampoTextarea({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="field resize-none" />
      {help && <p className="mt-1 text-[0.68rem] text-gray-400">{help}</p>}
    </div>
  )
}

export function CampoSelect({ label, value, onChange, opciones, placeholder = 'Elige' }: {
  label: string; value: string; onChange: (v: string) => void; opciones: string[]; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">{placeholder}</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

export function CampoCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
      <span className="text-[0.78rem] font-medium text-gray-600">{label}</span>
    </label>
  )
}

export function RowEliminar({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

export const GENERO_OPCIONES = ['Masculino', 'Femenino', 'Otro']
export const ESTADO_CIVIL_OPCIONES = ['Solter@', 'Casad@', 'Unión libre', 'Divorciad@', 'Viud@']
export const TIPO_SANGRE_OPCIONES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
export const NIVEL_OPCIONES = ['Básico', 'Intermedio', 'Avanzado', 'Experto']
export const RELACION_OPCIONES = ['Cónyuge', 'Hijo/a', 'Padre', 'Madre', 'Hermano/a', 'Otro']
export const NIVEL_ACADEMICO_OPCIONES = ['Primaria', 'Secundaria', 'Bachillerato', 'Licenciatura', 'Maestría', 'Doctorado', 'Diplomado', 'Curso']
