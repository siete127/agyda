import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GraduationCap, Mail, User, ArrowRight, ShieldAlert } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { capacitacionExamenPublicService } from '@/services/capacitacionExamen.service'
import { ResponderExamen } from './ResponderExamen'
import type { ExamenDetalle, RespuestaExamenItem } from '@/types/capacitacionExamen.types'

type Phase = 'cargando' | 'nombre-correo' | 'responder' | 'error'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function BrandHeader() {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-xl mx-auto flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
          <GraduationCap className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-[0.95rem] font-bold text-gray-900">AGYDA</p>
          <p className="text-[0.7rem] text-gray-500">Ardabytec · Examen de capacitación</p>
        </div>
      </div>
    </div>
  )
}

export function ExamenPublicoPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [phase, setPhase] = useState<Phase>(slug ? 'cargando' : 'error')
  const [examen, setExamen] = useState<ExamenDetalle | null>(null)
  const [errorMsg, setErrorMsg] = useState(slug ? '' : 'Enlace inválido')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slug) return
    capacitacionExamenPublicService.getBySlug(slug)
      .then((exa) => { setExamen(exa); setPhase('nombre-correo') })
      .catch((err) => {
        setPhase('error')
        setErrorMsg(err?.response?.data?.message ?? 'Este examen no está disponible')
      })
  }, [slug])

  const iniciar = () => {
    if (!nombre.trim() || !EMAIL_RE.test(email.trim())) return
    setPhase('responder')
  }

  const enviarRespuestas = async (respuestas: RespuestaExamenItem[]) => {
    setSubmitting(true)
    try {
      return await capacitacionExamenPublicService.responder(slug, { nombre: nombre.trim(), email: email.trim(), respuestas })
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'cargando') {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Spinner size="lg" /></div>
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3 px-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <ShieldAlert className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-lg font-bold text-gray-700">{errorMsg || 'Enlace inválido'}</p>
          <p className="text-[0.85rem] text-gray-400">Solicita un nuevo enlace a quien te lo compartió.</p>
        </div>
      </div>
    )
  }

  if (phase === 'responder' && examen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <BrandHeader />
        <div className="max-w-xl mx-auto px-4 py-8">
          <ResponderExamen examen={examen} onCancel={() => setPhase('nombre-correo')} isSubmitting={submitting} onSubmit={enviarRespuestas} />
        </div>
      </div>
    )
  }

  // phase === 'nombre-correo'
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <BrandHeader />
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
          <span className="chip bg-brand/10 text-brand text-[0.65rem]">Bienvenido a AGYDA</span>
          <h1 className="text-lg font-bold text-gray-900 mt-2">{examen?.titulo}</h1>
          {examen?.descripcion && <p className="text-sm text-gray-500 mt-1">{examen.descripcion}</p>}

          <div className="space-y-3 mt-5">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <User className="h-3 w-3" /> Nombre
              </label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Tu nombre completo" autoFocus />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <Mail className="h-3 w-3" /> Correo
              </label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="tu@correo.com" type="email" />
            </div>
          </div>

          <Button className="w-full mt-5" disabled={!nombre.trim() || !EMAIL_RE.test(email.trim())} onClick={iniciar}>
            Comenzar <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-center text-[0.68rem] text-gray-400 pt-6">Ardabytec · AGYDA</p>
      </div>
    </div>
  )
}
