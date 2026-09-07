import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QrCode, Trash2, Download, Copy, Loader2, Globe, Lock, Phone, PhoneCall, BarChart3, X } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { qrGeneratorService } from '@/services/qrGenerator.service'
import type { QrEntorno, QrModo } from '@/types/qrGenerator.types'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2 text-sm outline-none focus:border-violet-500'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'

const MODO_INFO: Record<QrModo, { label: string; icon: React.ElementType; desc: string }> = {
  url: { label: 'URL', icon: Globe, desc: 'El QR abre la página web que indiques.' },
  llamada_directa: { label: 'Llamada directa', icon: Phone, desc: 'El QR ofrece marcar el número directo, sin pasar por ningún servidor — no hay métricas.' },
  llamada_medible: { label: 'Llamada medible', icon: PhoneCall, desc: 'El QR abre una página intermedia que registra cuántos vieron, intentaron llamar y confirmaron la llamada.' },
}

function Header() {
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><QrCode className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Generador de códigos QR</h2>
          <p className="text-[0.8rem] text-gray-400">
            Generá un QR para una URL, marcación directa a un número, o marcación medible con métricas de conversión.
          </p>
        </div>
      </div>
    </div>
  )
}

function formatFecha(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function QrGeneratorTab() {
  const qc = useQueryClient()
  const { data: qrs = [], isLoading } = useQuery({ queryKey: ['qr-generator'], queryFn: () => qrGeneratorService.listar() })
  const [form, setForm] = useState<{ nombre: string; url: string; did: string; entorno: QrEntorno; modo: QrModo }>({
    nombre: '', url: '', did: '', entorno: 'publico', modo: 'url',
  })
  const [analyticsAbierto, setAnalyticsAbierto] = useState<number | null>(null)

  const generar = useMutation({
    mutationFn: () => qrGeneratorService.generar({
      nombre: form.nombre, entorno: form.entorno, modo: form.modo,
      ...(form.modo === 'url' ? { url: form.url } : { did: form.did }),
    }),
    onSuccess: () => {
      setForm({ nombre: '', url: '', did: '', entorno: 'publico', modo: 'url' })
      qc.invalidateQueries({ queryKey: ['qr-generator'] })
      toast.success('QR generado')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo generar el QR'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => qrGeneratorService.eliminar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qr-generator'] }); toast.success('Eliminado') },
  })

  const descargar = (dataUrl: string, nombre: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${nombre.replace(/\s+/g, '-').toLowerCase()}.png`
    a.click()
  }

  const copiarUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    toast.success('Copiado')
  }

  const canGenerar = form.nombre.trim().length > 0 && (form.modo === 'url' ? form.url.trim().length > 0 : form.did.trim().length > 0)

  return (
    <div className="space-y-4">
      <Header />

      <div className={clsx(card, 'space-y-3')}>
        <p className="text-sm font-semibold text-gray-800">Nuevo código QR</p>

        <div>
          <span className="mb-1.5 block text-[0.7rem] font-semibold text-gray-500">Tipo de destino</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(MODO_INFO) as QrModo[]).map((m) => {
              const info = MODO_INFO[m]
              const Icon = info.icon
              return (
                <button
                  key={m} type="button" onClick={() => setForm({ ...form, modo: m })}
                  className={clsx('flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                    form.modo === m ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:bg-gray-50')}
                >
                  <Icon className={clsx('h-4 w-4', form.modo === m ? 'text-violet-600' : 'text-gray-400')} />
                  <span className={clsx('text-xs font-semibold', form.modo === m ? 'text-violet-700' : 'text-gray-700')}>{info.label}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[0.68rem] text-gray-400">{MODO_INFO[form.modo].desc}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Nombre</span>
            <input
              className={field}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej. Postulación Ayudantes Totis"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Entorno</span>
            <select className={field} value={form.entorno} onChange={(e) => setForm({ ...form, entorno: e.target.value as QrEntorno })}>
              <option value="publico">Público (producción)</option>
              <option value="privado">Privado (local / pruebas)</option>
            </select>
          </label>
        </div>

        {form.modo === 'url' ? (
          <label className="block">
            <span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">URL de destino</span>
            <input
              className={field}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://... o http://192.168.x.x:puerto/..."
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Número a marcar</span>
            <input
              className={field}
              value={form.did}
              onChange={(e) => setForm({ ...form, did: e.target.value })}
              placeholder="Ej. 5512345678"
            />
          </label>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => generar.mutate()}
            disabled={!canGenerar || generar.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {generar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Generar QR
          </button>
        </div>
      </div>

      <div className={card}>
        <p className="mb-3 text-sm font-semibold text-gray-800">Historial de códigos generados</p>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>
        ) : qrs.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Todavía no generaste ningún código QR.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {qrs.map((q) => {
              const ModoIcono = MODO_INFO[q.modo].icon
              return (
                <div key={q.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-gray-800" title={q.nombre}>{q.nombre}</p>
                    <span
                      className={clsx(
                        'flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold',
                        q.entorno === 'publico' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {q.entorno === 'publico' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      {q.entorno === 'publico' ? 'Público' : 'Privado'}
                    </span>
                  </div>
                  <div className="mb-2 flex items-center gap-1 text-[0.65rem] font-semibold text-gray-500">
                    <ModoIcono className="h-3 w-3" /> {MODO_INFO[q.modo].label}
                  </div>
                  <img src={q.imagenDataUrl} alt={q.nombre} className="mx-auto mb-3 h-40 w-40 rounded-lg border border-gray-100" />
                  <p className="mb-1 truncate text-[0.7rem] text-gray-400" title={q.landingUrl || q.url}>{q.landingUrl || q.url}</p>
                  <p className="mb-3 text-[0.65rem] text-gray-300">
                    {formatFecha(q.fechaCreacion)}{q.autorNombre ? ` · ${q.autorNombre}` : ''}
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    {q.modo === 'llamada_medible' && (
                      <button onClick={() => setAnalyticsAbierto(q.id)} title="Ver métricas" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-violet-600">
                        <BarChart3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => copiarUrl(q.landingUrl || q.url)} title="Copiar enlace" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-violet-600">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => descargar(q.imagenDataUrl, q.nombre)} title="Descargar PNG" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-violet-600">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => eliminar.mutate(q.id)} title="Eliminar" className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {analyticsAbierto != null && (
        <QrAnalyticsModal qrId={analyticsAbierto} nombre={qrs.find((q) => q.id === analyticsAbierto)?.nombre ?? ''} onClose={() => setAnalyticsAbierto(null)} />
      )}
    </div>
  )
}

function QrAnalyticsModal({ qrId, nombre, onClose }: { qrId: number; nombre: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['qr-analytics', qrId], queryFn: () => qrGeneratorService.analytics(qrId) })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={clsx(card, 'w-full max-w-md')} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800">Métricas — {nombre}</p>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-50"><X className="h-4 w-4" /></button>
        </div>
        {isLoading || !data ? (
          <p className="py-6 text-center text-sm text-gray-400">Cargando…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{data.visitantesUnicos}</p>
              <p className="text-[0.68rem] text-gray-500">Visitantes únicos</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{data.intentosLlamada}</p>
              <p className="text-[0.68rem] text-gray-500">Abrieron el marcador</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{data.llamadasConfirmadas}</p>
              <p className="text-[0.68rem] text-emerald-600">Llamadas confirmadas</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{data.soloVieron}</p>
              <p className="text-[0.68rem] text-gray-500">Solo vieron</p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-xl bg-violet-50 p-3 text-sm">
              <span className="text-violet-700">Tasa de intento</span>
              <span className="font-bold text-violet-700">{data.tasaIntento}%</span>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-xl bg-violet-50 p-3 text-sm">
              <span className="text-violet-700">Tasa de confirmación</span>
              <span className="font-bold text-violet-700">{data.tasaConfirmacion}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
