import { useEffect, useState } from 'react'
import { Receipt, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { apiPublico } from '@/lib/axios'

interface ClavesCatalogo { clave: string; descripcion: string }

interface ClienteFiscal {
  id: number; empresa: string | null; rfc: string | null; razonSocial: string | null
  regimenFiscal: string | null; usoCfdi: string | null; cp: string | null
  calle: string | null; numExt: string | null; numInt: string | null; colonia: string | null
  ciudad: string | null; pais: string | null; correoFacturacion: string | null
}

interface DatosFiscalesResponse {
  oportunidad: string | null
  email: string
  cliente: ClienteFiscal | null
  catalogos: { regimenesFiscales: ClavesCatalogo[]; usosCfdi: ClavesCatalogo[] }
}

const FORM_INICIAL = {
  empresa: '', rfc: '', razonSocial: '', regimenFiscal: '', usoCfdi: '', cp: '',
  calle: '', numExt: '', numInt: '', colonia: '', ciudad: '', pais: 'México', correoFacturacion: '',
}

export function FormularioFiscalPage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [data, setData] = useState<DatosFiscalesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)

  useEffect(() => {
    if (!token) { setError('Enlace inválido'); setLoading(false); return }
    apiPublico.get(`/crm/solicitud-fiscal/datos?token=${token}`)
      .then((r) => {
        const d: DatosFiscalesResponse = r.data.data
        setData(d)
        if (d.cliente) {
          setForm({
            empresa: d.cliente.empresa ?? '',
            rfc: d.cliente.rfc ?? '',
            razonSocial: d.cliente.razonSocial ?? '',
            regimenFiscal: d.cliente.regimenFiscal ?? '',
            usoCfdi: d.cliente.usoCfdi ?? '',
            cp: d.cliente.cp ?? '',
            calle: d.cliente.calle ?? '',
            numExt: d.cliente.numExt ?? '',
            numInt: d.cliente.numInt ?? '',
            colonia: d.cliente.colonia ?? '',
            ciudad: d.cliente.ciudad ?? '',
            pais: d.cliente.pais ?? 'México',
            correoFacturacion: d.cliente.correoFacturacion ?? d.email ?? '',
          })
        } else {
          setForm((f) => ({ ...f, correoFacturacion: d.email ?? '' }))
        }
        setLoading(false)
      })
      .catch((e) => { setError(e.response?.data?.message ?? 'Enlace inválido o expirado'); setLoading(false) })
  }, [token])

  const setCampo = (campo: keyof typeof FORM_INICIAL) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const enviar = () => {
    if (!form.rfc || !form.razonSocial || !form.regimenFiscal || !form.usoCfdi || !form.cp) return
    setEnviando(true)
    apiPublico.post('/crm/solicitud-fiscal/enviar', { token, ...form })
      .then(() => { setEnviado(true); setEnviando(false) })
      .catch((e) => { setError(e.response?.data?.message ?? 'No se pudo enviar la información'); setEnviando(false) })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900">No pudimos abrir este formulario</h1>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900">¡Datos recibidos!</h1>
          <p className="text-sm text-gray-500 mt-1">Gracias, ya registramos tu información fiscal. Puedes cerrar esta ventana.</p>
        </div>
      </div>
    )
  }

  const catalogos = data?.catalogos
  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none'
  const labelCls = 'block text-[0.7rem] font-semibold text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl bg-white shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Datos fiscales para tu factura</h1>
            {data?.oportunidad && <p className="text-xs text-gray-500">{data.oportunidad}</p>}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 mb-6">
          Completa la información con la que quieres que se emita tu comprobante fiscal (CFDI).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Nombre o razón social *</label>
            <input className={inputCls} value={form.razonSocial} onChange={setCampo('razonSocial')} placeholder="Como aparece en tu constancia de situación fiscal" />
          </div>
          <div>
            <label className={labelCls}>Nombre comercial</label>
            <input className={inputCls} value={form.empresa} onChange={setCampo('empresa')} placeholder="Opcional" />
          </div>
          <div>
            <label className={labelCls}>RFC *</label>
            <input className={inputCls} value={form.rfc} onChange={setCampo('rfc')} maxLength={13} style={{ textTransform: 'uppercase' }} />
          </div>
          <div>
            <label className={labelCls}>Régimen fiscal *</label>
            <select className={inputCls} value={form.regimenFiscal} onChange={setCampo('regimenFiscal')}>
              <option value="">Selecciona…</option>
              {catalogos?.regimenesFiscales.map((r) => (
                <option key={r.clave} value={r.clave}>{r.clave} — {r.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Uso de CFDI *</label>
            <select className={inputCls} value={form.usoCfdi} onChange={setCampo('usoCfdi')}>
              <option value="">Selecciona…</option>
              {catalogos?.usosCfdi.map((u) => (
                <option key={u.clave} value={u.clave}>{u.clave} — {u.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Código postal *</label>
            <input className={inputCls} value={form.cp} onChange={setCampo('cp')} maxLength={5} />
          </div>
          <div>
            <label className={labelCls}>Correo de facturación</label>
            <input className={inputCls} type="email" value={form.correoFacturacion} onChange={setCampo('correoFacturacion')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Calle</label>
            <input className={inputCls} value={form.calle} onChange={setCampo('calle')} />
          </div>
          <div>
            <label className={labelCls}>Número exterior</label>
            <input className={inputCls} value={form.numExt} onChange={setCampo('numExt')} />
          </div>
          <div>
            <label className={labelCls}>Número interior</label>
            <input className={inputCls} value={form.numInt} onChange={setCampo('numInt')} />
          </div>
          <div>
            <label className={labelCls}>Colonia</label>
            <input className={inputCls} value={form.colonia} onChange={setCampo('colonia')} />
          </div>
          <div>
            <label className={labelCls}>Ciudad</label>
            <input className={inputCls} value={form.ciudad} onChange={setCampo('ciudad')} />
          </div>
        </div>

        <button
          onClick={enviar}
          disabled={enviando || !form.rfc || !form.razonSocial || !form.regimenFiscal || !form.usoCfdi || !form.cp}
          className="mt-6 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar datos fiscales'}
        </button>
      </div>
    </div>
  )
}
