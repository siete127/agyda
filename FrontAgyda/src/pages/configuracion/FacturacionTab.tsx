import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Building2, KeyRound, Plug, Check, Loader2, Info, ShieldCheck, AlertTriangle, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { facturacionService } from '@/services/facturacion.service'
import { satService, type SatCatalogoItem } from '@/services/sat.service'

const field =
  'w-full rounded-xl border border-gray-200 bg-card px-3.5 py-2.5 text-[0.88rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

function Card({ icon: Icon, titulo, subtitulo, children }: {
  icon: React.ElementType; titulo: string; subtitulo: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
          <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function FacturacionTab() {
  const qc = useQueryClient()
  const { data: emisor } = useQuery({ queryKey: ['facturacion-emisor'], queryFn: () => facturacionService.getEmisor() })
  const { data: config } = useQuery({ queryKey: ['facturacion-config'], queryFn: () => facturacionService.getConfig() })
  const { data: regimenes = [] } = useQuery({ queryKey: ['sat', 'regimen'], queryFn: () => satService.regimenFiscal(), staleTime: Infinity })

  const [ef, setEf] = useState({ rfc: '', razonSocial: '', regimenFiscal: '', cp: '' })
  const [efSeed, setEfSeed] = useState<string | null>(null)
  useEffect(() => {
    if (emisor && JSON.stringify(emisor) !== efSeed) {
      setEfSeed(JSON.stringify(emisor))
      setEf({ rfc: emisor.rfc, razonSocial: emisor.razonSocial, regimenFiscal: emisor.regimenFiscal, cp: emisor.cp })
    }
  }, [emisor, efSeed])

  const [pac, setPac] = useState({ habilitado: false, proveedor: 'facturama', modo: 'sandbox', baseUrl: '', usuario: '', password: '', apiKey: '', serie: 'A' })
  const [pacSeed, setPacSeed] = useState<string | null>(null)
  useEffect(() => {
    if (config && JSON.stringify(config) !== pacSeed) {
      setPacSeed(JSON.stringify(config))
      setPac({
        habilitado: config.habilitado, proveedor: config.proveedor, modo: config.modo,
        baseUrl: config.baseUrl, usuario: config.usuario, password: '', apiKey: '', serie: config.serie,
      })
    }
  }, [config, pacSeed])

  const [cer, setCer] = useState<File | null>(null)
  const [key, setKey] = useState<File | null>(null)
  const [csdPass, setCsdPass] = useState('')

  const guardarEmisor = useMutation({
    mutationFn: () => facturacionService.updateEmisor(ef),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturacion-emisor'] }); qc.invalidateQueries({ queryKey: ['facturacion-config'] }); toast.success('Datos fiscales guardados') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo guardar'),
  })

  const cargarCSD = useMutation({
    mutationFn: async () => {
      if (!cer || !key || !csdPass) throw new Error('Faltan archivos o contraseña')
      const [cerBase64, keyBase64] = await Promise.all([fileToBase64(cer), fileToBase64(key)])
      return facturacionService.subirCSD({ cerBase64, keyBase64, passwordCsd: csdPass })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturacion-emisor'] })
      setCer(null); setKey(null); setCsdPass('')
      toast.success('CSD cargado')
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? 'No se pudo cargar el CSD'),
  })

  const quitarCSD = useMutation({
    mutationFn: () => facturacionService.quitarCSD(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturacion-emisor'] }); toast.success('CSD quitado') },
  })

  const guardarPac = useMutation({
    mutationFn: () => facturacionService.updateConfig({
      habilitado: pac.habilitado, proveedor: pac.proveedor, modo: pac.modo, baseUrl: pac.baseUrl,
      usuario: pac.usuario, serie: pac.serie,
      ...(pac.password ? { password: pac.password } : {}),
      ...(pac.apiKey ? { apiKey: pac.apiKey } : {}),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturacion-config'] }); toast.success('Configuración del PAC guardada') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo guardar'),
  })

  const probar = useMutation({
    mutationFn: () => facturacionService.probarConexion(),
    onSuccess: (r: { message?: string }) => toast.success(r?.message ?? 'Conexión OK'),
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Falló la conexión'),
  })

  const listo = config?.listoParaTimbrar

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Facturación</h2>
            <p className="text-[0.82rem] text-gray-400">
              Datos fiscales del emisor, certificado de sello (CSD) y credenciales del PAC para timbrar CFDI 4.0.
            </p>
          </div>
        </div>
        <div className={clsx('mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs',
          listo ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
          {listo ? <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          <span>
            {listo
              ? 'Todo configurado: las facturas se timbran ante el SAT automáticamente.'
              : 'Sin datos fiscales, CSD y PAC completos, las facturas se generan como pre-factura (sin folio fiscal). Al completarlo, el timbrado se activa solo.'}
          </span>
        </div>
      </div>

      <Card icon={Building2} titulo="Datos fiscales del emisor" subtitulo="Deben coincidir con la Constancia de Situación Fiscal.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">RFC</span>
            <input className={field} value={ef.rfc} maxLength={13}
              onChange={(e) => setEf({ ...ef, rfc: e.target.value.toUpperCase() })} placeholder="AAA010101AAA" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Razón social</span>
            <input className={field} value={ef.razonSocial}
              onChange={(e) => setEf({ ...ef, razonSocial: e.target.value })} placeholder="Sin régimen societario" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Régimen fiscal</span>
            <select className={field} value={ef.regimenFiscal} onChange={(e) => setEf({ ...ef, regimenFiscal: e.target.value })}>
              <option value="">Selecciona…</option>
              {regimenes.map((r: SatCatalogoItem) => <option key={r.c} value={r.c}>{r.c} — {r.d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Código postal (lugar de expedición)</span>
            <input className={field} value={ef.cp} maxLength={5}
              onChange={(e) => setEf({ ...ef, cp: e.target.value.replace(/\D/g, '') })} placeholder="64000" />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={() => guardarEmisor.mutate()} disabled={guardarEmisor.isPending}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-[0.8rem] font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {guardarEmisor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      </Card>

      <Card icon={KeyRound} titulo="Certificado de Sello Digital (CSD)" subtitulo="Archivos .cer y .key con su contraseña. Se validan y se registran en el PAC.">
        {emisor?.csdCargado ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-sm text-emerald-800">
              <p className="font-semibold">CSD cargado</p>
              <p className="text-xs">
                {emisor.csdNumCert ? `Serie ${emisor.csdNumCert} · ` : ''}
                {emisor.csdVigenciaHasta ? `vigente hasta ${new Date(emisor.csdVigenciaHasta).toLocaleDateString('es-MX')}` : ''}
              </p>
            </div>
            <button onClick={() => quitarCSD.mutate()} className="text-xs font-semibold text-red-600 hover:text-red-700">Quitar</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 px-3 py-4 text-center hover:border-violet-300">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-[0.72rem] text-gray-500">{cer ? cer.name : 'Certificado .cer'}</span>
              <input type="file" accept=".cer" className="hidden" onChange={(e) => setCer(e.target.files?.[0] ?? null)} />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 px-3 py-4 text-center hover:border-violet-300">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-[0.72rem] text-gray-500">{key ? key.name : 'Llave .key'}</span>
              <input type="file" accept=".key" className="hidden" onChange={(e) => setKey(e.target.files?.[0] ?? null)} />
            </label>
            <div className="flex flex-col gap-2">
              <input type="password" className={field} placeholder="Contraseña del CSD" value={csdPass}
                onChange={(e) => setCsdPass(e.target.value)} />
              <button onClick={() => cargarCSD.mutate()} disabled={!cer || !key || !csdPass || cargarCSD.isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-[0.8rem] font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                {cargarCSD.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cargar CSD'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card icon={Plug} titulo="Proveedor de timbrado (PAC)" subtitulo="El CFDI se sella a través de un PAC autorizado por el SAT.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Proveedor</span>
            <select className={field} value={pac.proveedor} onChange={(e) => setPac({ ...pac, proveedor: e.target.value })}>
              {(config?.proveedores ?? ['facturama']).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Modo</span>
            <select className={field} value={pac.modo} onChange={(e) => setPac({ ...pac, modo: e.target.value })}>
              <option value="sandbox">Pruebas (sandbox)</option>
              <option value="produccion">Producción</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">URL base del PAC</span>
            <input className={field} value={pac.baseUrl} onChange={(e) => setPac({ ...pac, baseUrl: e.target.value })}
              placeholder="https://apisandbox.facturama.mx" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Usuario</span>
            <input className={field} value={pac.usuario} onChange={(e) => setPac({ ...pac, usuario: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">
              Contraseña {config?.passwordConfigurado && <span className="text-emerald-600">· configurada</span>}
            </span>
            <input type="password" className={field} value={pac.password}
              onChange={(e) => setPac({ ...pac, password: e.target.value })}
              placeholder={config?.passwordConfigurado ? '•••••• (déjalo vacío para no cambiar)' : ''} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">
              API key (opcional) {config?.apiKeyConfigurado && <span className="text-emerald-600">· configurada</span>}
            </span>
            <input type="password" className={field} value={pac.apiKey}
              onChange={(e) => setPac({ ...pac, apiKey: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-500">Serie</span>
            <input className={field} value={pac.serie} maxLength={10}
              onChange={(e) => setPac({ ...pac, serie: e.target.value })} />
          </label>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={pac.habilitado}
            onChange={(e) => setPac({ ...pac, habilitado: e.target.checked })} />
          <span className="text-[0.85rem] text-gray-700">Timbrado activo (si se desactiva, todo queda en modo pre-factura)</span>
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => probar.mutate()} disabled={probar.isPending}
            className="rounded-xl border border-gray-200 px-4 py-2 text-[0.8rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {probar.isPending ? 'Probando…' : 'Probar conexión'}
          </button>
          <button onClick={() => guardarPac.mutate()} disabled={guardarPac.isPending}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-[0.8rem] font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {guardarPac.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          El SAT no expone un servicio público de timbrado: siempre se hace a través de un PAC. Los catálogos SAT
          (claves de producto, unidades, régimen) sí se consumen directo y ya están cargados.
        </p>
      </div>
    </div>
  )
}
