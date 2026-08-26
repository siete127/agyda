import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Search, Download, RefreshCw, RotateCcw, CheckCircle2, Clock, AlertCircle, FileText, X, Upload } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { createPortal } from 'react-dom'

type Filtro = 'todos' | 'pendientes' | 'aceptados'

interface UserStatus {
  id: number
  nombre: string
  usuario?: string
  tipoUsuario?: string
  status?: boolean
  activo?: boolean
  correo?: string
  pending?: boolean | number
  acceptedAt?: string | null
  acceptedVersion?: number
  currentVersion?: number
  // legacy compat
  aceptado?: boolean
  fechaAceptacion?: string | null
}

function fmtFecha(f: string | null | undefined) {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return f }
}

function isAceptado(u: UserStatus) {
  // pending viene como 0/1 desde SQL Server, o como boolean en otros casos
  if (u.pending !== undefined) return u.pending === 0 || u.pending === false
  return u.aceptado === true
}

function exportCSV(rows: UserStatus[]) {
  const fechaGen = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ── Datos ──
  const headers = ['#', 'Nombre', 'Usuario', 'Estado', 'Fecha Aceptación']
  const data = rows.map((r, i) => {
    const ok = isAceptado(r)
    return [i + 1, r.nombre ?? '', r.usuario ?? '', ok ? 'Aceptado' : 'Pendiente', fmtFecha(r.acceptedAt ?? r.fechaAceptacion)]
  })

  // Fila de título (encima de los encabezados)
  const titleRow = [`Reporte Reglamento Interno — ${fechaGen} · ${rows.length} usuarios`, '', '', '', '']

  const wsData = [titleRow, headers, ...data]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // ── Anchos de columna ──
  ws['!cols'] = [{ wch: 5 }, { wch: 38 }, { wch: 18 }, { wch: 14 }, { wch: 20 }]

  // ── Merge del título en A1:E1 ──
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]

  // ── Estilos (sin tipos XLSX — la lib no los exporta en esta versión) ──
  const titleStyle = {
    font: { bold: true, sz: 13, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF4338CA' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
  const headerStyle = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF6366F1' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: 'FF4338CA' } } },
  }
  const cellEven = {
    font: { sz: 10 },
    fill: { fgColor: { rgb: 'FFF0F0FF' }, patternType: 'solid' },
    alignment: { vertical: 'center' },
  }
  const cellOdd = {
    font: { sz: 10 },
    fill: { fgColor: { rgb: 'FFFFFFFF' }, patternType: 'solid' },
    alignment: { vertical: 'center' },
  }
  const aceptadoStyle = {
    font: { sz: 10, bold: true, color: { rgb: 'FF166534' } },
    fill: { fgColor: { rgb: 'FFDCFCE7' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const pendienteStyle = {
    font: { sz: 10, bold: true, color: { rgb: 'FF92400E' } },
    fill: { fgColor: { rgb: 'FFFEF3C7' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  }

  const cols = ['A', 'B', 'C', 'D', 'E']

  // Fila 0 = título
  cols.forEach(c => { if (ws[`${c}1`]) ws[`${c}1`].s = titleStyle })
  // Fila 1 = encabezados
  cols.forEach(c => { if (ws[`${c}2`]) ws[`${c}2`].s = headerStyle })
  // Filas de datos (desde fila 3)
  data.forEach((row, i) => {
    const excelRow = i + 3
    const isEven = i % 2 === 0
    cols.forEach((c, ci) => {
      const cell = ws[`${c}${excelRow}`]
      if (!cell) return
      if (ci === 3) {
        cell.s = row[3] === 'Aceptado' ? aceptadoStyle : pendienteStyle
      } else {
        cell.s = isEven ? cellEven : cellOdd
      }
    })
  })

  // Altura de filas
  ws['!rows'] = [{ hpt: 22 }, { hpt: 18 }, ...data.map(() => ({ hpt: 16 }))]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reglamento')
  XLSX.writeFile(wb, `reglamento_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function StatusBadge({ aceptado }: { aceptado: boolean }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold',
      aceptado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
    )}>
      {aceptado
        ? <><CheckCircle2 className="h-3 w-3" /> Aceptado</>
        : <><Clock className="h-3 w-3" /> Pendiente</>}
    </span>
  )
}

function TipoBadge({ tipo }: { tipo?: string }) {
  const t = (tipo ?? '').toUpperCase()
  const map: Record<string, { label: string; cls: string }> = {
    AD: { label: 'Admin', cls: 'bg-violet-100 text-violet-700' },
    TI: { label: 'TI', cls: 'bg-blue-100 text-blue-700' },
    CC: { label: 'Call Center', cls: 'bg-sky-100 text-sky-700' },
    ST: { label: 'Soporte', cls: 'bg-orange-100 text-orange-700' },
  }
  const meta = map[t] ?? { label: tipo ?? '—', cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold', meta.cls)}>
      {meta.label}
    </span>
  )
}

function PdfViewer({
  onClose,
  showAccept = false,
  onAccept,
  accepting = false,
}: {
  onClose: () => void
  showAccept?: boolean
  onAccept?: () => void
  accepting?: boolean
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get('/reglamento/pdf?doc=reglamento')
      .then((res) => {
        const base64 = res.data?.data ?? res.data
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        setBlobUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col w-full max-w-2xl h-[94vh] rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Barra superior */}
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-white" />
            <span className="text-sm font-bold text-white">Reglamento Interno</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Regresar
          </button>
        </div>

        {/* Visor PDF */}
        <div className="flex-1 bg-gray-100 overflow-hidden">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-red-500">
              No se pudo cargar el PDF.
            </div>
          )}
          {blobUrl && (
            <iframe src={blobUrl} className="h-full w-full border-0" title="Reglamento" />
          )}
        </div>

        {/* Pie con botón de aceptación */}
        {showAccept && (
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-gray-100 bg-white flex-shrink-0">
            <p className="text-xs text-gray-400">Debes leer el reglamento antes de aceptar.</p>
            <button
              onClick={onAccept}
              disabled={accepting || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {accepting
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                : <CheckCircle2 className="h-4 w-4" />}
              Acepto el reglamento
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function SubirReglamentoModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const user = useAuthStore((s) => s.user)

  const subir = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('file', file as File)
      form.append('tipoUsuario', user?.tipoUsuario ?? '')
      return api.post('/reglamento/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      toast.success('Reglamento reemplazado — todos los usuarios activos deben aceptarlo de nuevo')
      onUploaded()
      onClose()
    },
    onError: () => toast.error('Error al subir el nuevo reglamento'),
  })

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8]">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-white" />
            <span className="text-sm font-bold text-white">Reemplazar reglamento</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Sube el nuevo PDF del reglamento interno. Al confirmar, se reemplaza el documento vigente y
            <span className="font-semibold text-gray-700"> todos los usuarios activos</span> quedarán con estatus
            <span className="font-semibold text-amber-600"> pendiente</span> hasta que lo vuelvan a aceptar.
          </p>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center cursor-pointer hover:border-brand/40 hover:bg-brand/5 transition-colors">
            <FileText className="h-7 w-7 text-gray-300" />
            <span className="text-xs font-medium text-gray-500">
              {file ? file.name : 'Selecciona el archivo PDF'}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={subir.isPending}>Cancelar</Button>
            <Button isLoading={subir.isPending} disabled={!file} onClick={() => subir.mutate()}>
              <Upload className="h-3.5 w-3.5" /> Reemplazar y publicar
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ReglamentoPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD'
  const qc = useQueryClient()
  const [showPdf, setShowPdf] = useState(false)
  const [showSubir, setShowSubir] = useState(false)

  // ---- Estado de aceptación (aplica a todos los roles, incluido admin) ----
  const { data: userStatus } = useQuery({
    queryKey: ['reglamento-status'],
    queryFn: async () => {
      const res = await api.get('/reglamento/status')
      const payload = res.data?.data ?? res.data
      return payload as { pending: boolean | number; currentVersion?: number; acceptedVersion?: number }
    },
  })

  const aceptar = useMutation({
    mutationFn: () => api.post('/reglamento/accept'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reglamento-status'] })
      toast.success('Reglamento aceptado')
    },
    onError: () => toast.error('Error al aceptar el reglamento'),
  })

  // ---- Vista admin ----
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')

  const { data: usuariosRaw = [], isLoading, error } = useQuery<UserStatus[]>({
    queryKey: ['reglamento-users'],
    queryFn: async () => {
      const { data } = await api.get('/reglamento/users-status')
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    enabled: isAdmin,
    staleTime: 30_000,
  })

  // Solo usuarios activos (activo===true en JSON desde SQL Server)
  const usuarios = useMemo(() => usuariosRaw.filter((u) => u.activo === true), [usuariosRaw])

  const filtrados = useMemo(() => {
    let list = usuarios
    if (filtro === 'pendientes') list = list.filter((u) => !isAceptado(u))
    if (filtro === 'aceptados') list = list.filter((u) => isAceptado(u))
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(
        (u) => u.nombre?.toLowerCase().includes(q) || u.usuario?.toLowerCase().includes(q),
      )
    }
    return list
  }, [usuarios, filtro, busqueda])

  const pendientes = usuarios.filter((u) => !isAceptado(u)).length
  const aceptados  = usuarios.filter((u) => isAceptado(u)).length

  const resetUser = useMutation({
    mutationFn: (userId: number) => api.post('/reglamento/reset-user', { userId, tipoUsuario: user?.tipoUsuario }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reglamento-users'] })
      toast.success('Usuario reiniciado')
    },
    onError: () => toast.error('Error al reiniciar usuario'),
  })

  const resetAll = useMutation({
    mutationFn: () => api.post('/reglamento/reset-all', { tipoUsuario: user?.tipoUsuario }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reglamento-users'] })
      toast.success('Todos los estados reiniciados')
    },
    onError: () => toast.error('Error al reiniciar todos'),
  })

  const confirmResetAll = () => {
    if (window.confirm('¿Reiniciar el estado de TODOS los usuarios activos? Esta acción no se puede deshacer.')) {
      resetAll.mutate()
    }
  }

  // ---- Tarjeta de aceptación (aplica a todos los roles, incluido admin) ----
  const aceptacionCard = (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Reglamento Interno</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">Revisa y acepta el reglamento de la empresa</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4 text-center">
        {userStatus && (userStatus.pending === false || userStatus.pending === 0) ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Ya aceptaste el reglamento</p>
            <p className="text-xs text-gray-400">Puedes revisar el documento en cualquier momento.</p>
            <button
              onClick={() => setShowPdf(true)}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline mt-1"
            >
              <FileText className="h-3.5 w-3.5" /> Ver reglamento
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
              <Clock className="h-8 w-8 text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Pendiente de aceptación</p>
            <p className="text-xs text-gray-400 max-w-xs">Lee el reglamento completo y acepta los términos para continuar.</p>
            <Button onClick={() => setShowPdf(true)} className="mt-2">
              <FileText className="h-4 w-4" /> Leer y aceptar reglamento
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  const isPending = userStatus?.pending === true || userStatus?.pending === 1

  // ---- Render usuario normal ----
  if (!isAdmin) {
    return (
      <>
        {aceptacionCard}
        {showPdf && (
          <PdfViewer
            onClose={() => setShowPdf(false)}
            showAccept={isPending}
            onAccept={() => { aceptar.mutate(); setShowPdf(false) }}
            accepting={aceptar.isPending}
          />
        )}
      </>
    )
  }

  // ---- Render admin (+ tarjeta de aceptación propia si está pendiente) ----
  return (
    <div className="space-y-5 animate-fade-in">
      {(userStatus?.pending === true || userStatus?.pending === 1) && aceptacionCard}
      {showPdf && <PdfViewer onClose={() => setShowPdf(false)} />}
      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Reglamento — Administración</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {aceptados}/{usuarios.length} aceptados · {pendientes} pendientes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="bg-white/10 !text-white hover:bg-white/20 text-xs py-1.5 px-3"
                onClick={() => exportCSV(filtrados)}
              >
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
              <Button
                onClick={() => setShowSubir(true)}
                className="bg-white !text-brand hover:bg-blue-50 !shadow-none border-0 text-xs py-1.5 px-3"
              >
                <Upload className="h-3.5 w-3.5" /> Reemplazar reglamento
              </Button>
              <Button
                variant="ghost"
                className="bg-red-500/20 !text-white hover:bg-red-500/30 text-xs py-1.5 px-3"
                onClick={confirmResetAll}
                isLoading={resetAll.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset todos
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="field pl-9 text-sm"
            placeholder="Buscar usuario..."
          />
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(['todos', 'pendientes', 'aceptados'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={clsx(
                'px-4 py-2 text-[0.72rem] font-semibold capitalize transition-colors',
                filtro === f ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="card divide-y">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-40 rounded bg-gray-100" />
                <div className="h-2.5 w-28 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-20 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar datos</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Cabecera tabla */}
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-x-4 px-5 py-2.5 bg-gray-50 border-b border-gray-200">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">Nombre</span>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">Usuario</span>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">Reglamento</span>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">Acción</span>
          </div>

          {filtrados.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">Sin resultados</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtrados.map((u, i) => {
                const ok = isAceptado(u)
                return (
                  <div
                    key={u.id}
                    className={clsx(
                      'grid grid-cols-[2fr_1fr_1fr_auto] gap-x-4 items-center px-5 py-3 transition-colors hover:bg-indigo-50/30',
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40',
                    )}
                  >
                    {/* Nombre */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[0.6rem] font-bold text-indigo-700">
                        {u.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{u.nombre}</p>
                    </div>

                    {/* Usuario */}
                    <p className="text-xs text-gray-500 truncate">{u.usuario ?? '—'}</p>

                    {/* Estado reglamento + fecha */}
                    <div className="flex flex-col gap-0.5">
                      <StatusBadge aceptado={ok} />
                      {ok && (u.acceptedAt ?? u.fechaAceptacion) && (
                        <span className="text-[0.62rem] text-gray-400">{fmtFecha(u.acceptedAt ?? u.fechaAceptacion)}</span>
                      )}
                    </div>

                    {/* Acción reset */}
                    <div>
                      {ok && (
                        <button
                          onClick={() => resetUser.mutate(u.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors"
                          title="Reiniciar aceptación"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showSubir && (
        <SubirReglamentoModal
          onClose={() => setShowSubir(false)}
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: ['reglamento-users'] })
            qc.invalidateQueries({ queryKey: ['reglamento-status'] })
          }}
        />
      )}
    </div>
  )
}
