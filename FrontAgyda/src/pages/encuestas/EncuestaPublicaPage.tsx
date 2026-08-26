import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, Mail, User, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { encuestasPublicService } from '@/services/encuestas-public.service'
import { ResponderEncuesta } from './ResponderEncuesta'
import type { Encuesta, RespuestaPayloadItem } from '@/types/encuesta.types'

type Phase = 'cargando' | 'nombre-correo' | 'responder' | 'ya-respondida' | 'gracias' | 'error'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function respondidaKey(slug: string) { return `encuesta_respondida_${slug}` }
function respondienteKey(slug: string) { return `encuesta_${slug}_respondiente` }

function BrandHeader() {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-xl mx-auto flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
          <ClipboardList className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-[0.95rem] font-bold text-gray-900">AGYDA</p>
          <p className="text-[0.7rem] text-gray-500">Ardabytec · Encuesta pública</p>
        </div>
      </div>
    </div>
  )
}

export function EncuestaPublicaPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [phase, setPhase] = useState<Phase>(slug ? 'cargando' : 'error')
  const [encuesta, setEncuesta] = useState<Encuesta | null>(null)
  const [errorMsg, setErrorMsg] = useState(slug ? '' : 'Enlace inválido')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [duplicado, setDuplicado] = useState(false)

  useEffect(() => {
    if (!slug) return
    encuestasPublicService.getBySlug(slug)
      .then((enc) => {
        setEncuesta(enc)
        const yaRespondida = localStorage.getItem(respondidaKey(slug))
        if (yaRespondida) { setPhase('ya-respondida'); return }
        const guardado = sessionStorage.getItem(respondienteKey(slug))
        if (guardado) {
          try {
            const { nombre: n, email: e } = JSON.parse(guardado)
            setNombre(n ?? ''); setEmail(e ?? '')
          } catch { /* ignorar */ }
        }
        setPhase('nombre-correo')
      })
      .catch((err) => {
        setPhase('error')
        setErrorMsg(err?.response?.data?.message ?? 'Esta encuesta no está disponible')
      })
  }, [slug])

  const iniciarRespuesta = () => {
    if (!nombre.trim() || !EMAIL_RE.test(email.trim())) return
    sessionStorage.setItem(respondienteKey(slug), JSON.stringify({ nombre: nombre.trim(), email: email.trim() }))
    setDuplicado(false)
    setPhase('responder')
  }

  const enviarRespuestas = async (respuestas: RespuestaPayloadItem[]) => {
    setSubmitting(true)
    try {
      await encuestasPublicService.responder(slug, { nombre: nombre.trim(), email: email.trim(), respuestas })
      localStorage.setItem(respondidaKey(slug), '1')
      setPhase('gracias')
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } }
      if (e?.response?.status === 409) {
        setDuplicado(true)
        setPhase('ya-respondida')
      } else {
        setErrorMsg(e?.response?.data?.message ?? 'No se pudo enviar tu respuesta')
        setPhase('error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3 px-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <ShieldAlert className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-lg font-bold text-gray-700">{errorMsg || 'Enlace inválido'}</p>
          <p className="text-[0.85rem] text-gray-400">Solicita un nuevo enlace a quien te la compartió.</p>
        </div>
      </div>
    )
  }

  if (phase === 'ya-respondida') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <BrandHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <CheckCircle2 className="h-7 w-7 text-brand" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Ya has respondido esta encuesta</h1>
          <p className="text-sm text-gray-500">
            {duplicado ? 'El servidor confirmó que este correo ya envió una respuesta anteriormente.' : 'Solo se permite una respuesta por correo electrónico.'}
          </p>
          {!duplicado && (
            <button
              onClick={() => setPhase('nombre-correo')}
              className="text-[0.75rem] font-semibold text-brand hover:underline"
            >
              Responder de todas formas
            </button>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'gracias') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <BrandHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">¡Gracias por tu respuesta!</h1>
          <p className="text-sm text-gray-500">Tu opinión fue registrada correctamente.</p>
          <p className="text-[0.68rem] text-gray-400 pt-6">Ardabytec · AGYDA</p>
        </div>
      </div>
    )
  }

  if (phase === 'responder' && encuesta) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <BrandHeader />
        <div className="max-w-xl mx-auto px-4 py-8">
          <ResponderEncuesta
            encuesta={encuesta}
            onDone={() => { /* el cambio de fase ocurre en onSubmit tras éxito */ }}
            onCancel={() => setPhase('nombre-correo')}
            isSubmitting={submitting}
            onSubmit={enviarRespuestas}
          />
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
          <div className="flex items-center gap-2 mb-1">
            <span className="chip bg-brand/10 text-brand text-[0.65rem]">Bienvenido a AGYDA</span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mt-2">{encuesta?.titulo}</h1>
          {encuesta?.descripcion && <p className="text-sm text-gray-500 mt-1">{encuesta.descripcion}</p>}
          <p className="text-[0.7rem] text-gray-400 mt-3">Solo se permite una respuesta por correo.</p>

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

          <Button
            className="w-full mt-5"
            disabled={!nombre.trim() || !EMAIL_RE.test(email.trim())}
            onClick={iniciarRespuesta}
          >
            Comenzar <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-center text-[0.68rem] text-gray-400 pt-6">Ardabytec · AGYDA</p>
      </div>
    </div>
  )
}
