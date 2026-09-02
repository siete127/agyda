import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GraduationCap, Hash, User, ArrowRight, ShieldAlert, Paperclip, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { capacitacionPublicoService } from '@/services/capacitacion.service'
import type { Curso, Material } from '@/types/capacitacion.types'

type Phase = 'cargando' | 'identificacion' | 'contenido' | 'completado' | 'error'

function BrandHeader() {
  return (
    <div className="border-b border-gray-200 bg-card px-6 py-4">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
          <GraduationCap className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-[0.95rem] font-bold text-gray-900">AGYDA</p>
          <p className="text-[0.7rem] text-gray-500">Ardabytec · Capacitación</p>
        </div>
      </div>
    </div>
  )
}

function MaterialItem({ m }: { m: Material }) {
  const t = m.tipo ?? ''
  const esAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'opus'].includes(t)
  const esVideo = ['mp4', 'webm', 'mov'].includes(t)
  const esImagen = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(t)
  const esPresentacion = t === 'ppt' || t === 'pptx'

  if (esAudio || esVideo) {
    return (
      <div className="space-y-1.5 rounded-lg border border-gray-100 p-2.5">
        <div className="flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">{m.nombre}</p>
        </div>
        {esVideo
          ? <video src={m.url} controls className="max-h-72 w-full rounded-lg bg-black" />
          : <audio src={m.url} controls className="w-full" />}
      </div>
    )
  }
  if (esImagen) {
    return (
      <a href={m.url} target="_blank" rel="noreferrer" className="block space-y-1.5 rounded-lg border border-gray-100 p-2.5">
        <span className="flex items-center gap-2 text-xs font-medium text-brand">
          <Paperclip className="h-3.5 w-3.5 flex-shrink-0" /> {m.nombre}
        </span>
        <img src={m.url} alt={m.nombre} className="max-h-72 w-full rounded-lg object-cover" />
      </a>
    )
  }
  return (
    <a
      href={m.url}
      target={esPresentacion ? undefined : '_blank'}
      download={esPresentacion ? m.nombre : undefined}
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-xs font-medium text-brand hover:bg-gray-50"
    >
      <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 truncate">
        {m.nombre}{esPresentacion && <span className="ml-1.5 font-normal text-gray-400">(descargar para ver)</span>}
      </span>
    </a>
  )
}

export function CursoPublicoPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [phase, setPhase] = useState<Phase>(slug ? 'cargando' : 'error')
  const [curso, setCurso] = useState<Curso | null>(null)
  const [errorMsg, setErrorMsg] = useState(slug ? '' : 'Enlace inválido')
  const [numero, setNumero] = useState('')
  const [nombre, setNombre] = useState('')
  const [inscId, setInscId] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!slug) return
    capacitacionPublicoService.getBySlug(slug)
      .then((c) => { setCurso(c); setPhase('identificacion') })
      .catch((err) => {
        setPhase('error')
        setErrorMsg(err?.response?.data?.message ?? 'Este curso no está disponible')
      })
  }, [slug])

  const iniciar = async () => {
    if (!numero.trim() || nombre.trim().length < 3) return
    setEnviando(true)
    try {
      const { inscripcionId } = await capacitacionPublicoService.registrar(slug, numero.trim(), nombre.trim())
      setInscId(inscripcionId)
      setPhase('contenido')
    } catch (err) {
      setErrorMsg((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo registrar')
      setPhase('error')
    } finally {
      setEnviando(false)
    }
  }

  const marcarCompletado = async () => {
    if (!inscId) return
    setEnviando(true)
    try {
      await capacitacionPublicoService.completar(slug, inscId)
      setPhase('completado')
    } finally {
      setEnviando(false)
    }
  }

  if (phase === 'cargando') {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50"><Spinner size="lg" /></div>
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="space-y-3 px-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <ShieldAlert className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-lg font-bold text-gray-700">{errorMsg || 'Enlace inválido'}</p>
          <p className="text-[0.85rem] text-gray-400">Solicita un nuevo enlace a quien te lo compartió.</p>
        </div>
      </div>
    )
  }

  if (phase === 'completado') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <BrandHeader />
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">¡Curso completado!</h1>
          <p className="mt-1 text-sm text-gray-500">
            {nombre}, quedó registrado que completaste <b>{curso?.titulo}</b>.
          </p>
          <p className="pt-6 text-[0.68rem] text-gray-400">Ardabytec · AGYDA</p>
        </div>
      </div>
    )
  }

  if (phase === 'contenido' && curso) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <BrandHeader />
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="rounded-2xl border border-gray-200 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {curso.categoria && <span className="chip bg-brand/10 text-brand text-[0.65rem]">{curso.categoria}</span>}
              {curso.duracionMin != null && (
                <span className="flex items-center gap-1 text-[0.7rem] text-gray-400"><Clock className="h-3 w-3" /> {curso.duracionMin} min</span>
              )}
            </div>
            <h1 className="mt-2 text-lg font-bold text-gray-900">{curso.titulo}</h1>
            {curso.descripcion && <p className="mt-1 whitespace-pre-line text-sm text-gray-500">{curso.descripcion}</p>}

            <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Material del curso</p>
            {curso.materiales.length === 0 ? (
              <p className="text-xs text-gray-400">Este curso no tiene material adjunto.</p>
            ) : (
              <div className="space-y-2.5">
                {curso.materiales.map((m) => <MaterialItem key={m.id} m={m} />)}
              </div>
            )}

            <Button className="mt-6 w-full" isLoading={enviando} onClick={marcarCompletado}>
              <CheckCircle2 className="h-4 w-4" /> Marcar como completado
            </Button>
          </div>
          <p className="pt-6 text-center text-[0.68rem] text-gray-400">Ardabytec · AGYDA · {nombre}</p>
        </div>
      </div>
    )
  }

  // phase === 'identificacion'
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <BrandHeader />
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-card p-6 shadow-sm">
          <span className="chip bg-brand/10 text-brand text-[0.65rem]">Bienvenido a AGYDA</span>
          <h1 className="mt-2 text-lg font-bold text-gray-900">{curso?.titulo}</h1>
          {curso?.descripcion && <p className="mt-1 text-sm text-gray-500">{curso.descripcion}</p>}
          <p className="mt-3 text-[0.8rem] text-gray-400">Antes de comenzar, identifícate:</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <Hash className="h-3 w-3" /> Número de empleado
              </label>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} className="field" placeholder="Ej. CC_0123" autoFocus />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <User className="h-3 w-3" /> Nombre completo
              </label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Tu nombre completo" />
            </div>
          </div>

          <Button
            className="mt-5 w-full"
            disabled={!numero.trim() || nombre.trim().length < 3 || enviando}
            onClick={iniciar}
          >
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Comenzar curso <ArrowRight className="h-3.5 w-3.5" /></>}
          </Button>
        </div>
        <p className="pt-6 text-center text-[0.68rem] text-gray-400">Ardabytec · AGYDA</p>
      </div>
    </div>
  )
}
