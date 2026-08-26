import { useState, useEffect } from 'react'
import { RotateCcw, Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useVentasBgStore,
  bgCss,
} from '@/stores/ventas-bg.store'
import { DIRECTION_LABELS, type BgMode, type BgDirection } from '@/stores/background.store'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const QUICK_COLORS = [
  '#0f172a', '#111827', '#1e3a5f', '#0d1b3e', '#1a1a2e',
  '#0c1445', '#162032', '#0f2027', '#1a1a1a', '#212121',
  '#1B4FD8', '#7C3AED', '#0891B2', '#059669', '#DC2626',
  '#D97706', '#DB2777', '#065f46', '#1e40af', '#4f46e5',
]

export function VentasBgModal({ isOpen, onClose }: Props) {
  const store = useVentasBgStore()

  const [mode,      setMode]      = useState<BgMode>(store.mode)
  const [color1,    setColor1]    = useState(store.color1)
  const [color2,    setColor2]    = useState(store.color2)
  const [direction, setDirection] = useState<BgDirection>(store.direction)

  useEffect(() => {
    if (isOpen) {
      setMode(store.mode)
      setColor1(store.color1)
      setColor2(store.color2)
      setDirection(store.direction)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const previewCss = bgCss({ mode, color1, color2, direction })

  const handleApply = () => {
    store.setMode(mode)
    store.setColor1(color1)
    store.setColor2(color2)
    store.setDirection(direction)
    toast.success('Fondo actualizado')
    onClose()
  }

  const handleReset = () => {
    setMode('solid')
    setColor1('#0f172a')
    setColor2('#1e3a5f')
    setDirection(0)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Fondo de Ventas</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-5">

          {/* Preview */}
          <div
            className="h-20 w-full rounded-xl border border-white/10 transition-all duration-500"
            style={{ background: previewCss }}
          />

          {/* Modo */}
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold text-slate-400 uppercase tracking-wide">Tipo de fondo</p>
            <div className="grid grid-cols-2 gap-2">
              {(['solid', 'gradient'] as BgMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                    mode === m
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {m === 'solid' ? '🎨 Sólido' : '🌈 Gradiente'}
                </button>
              ))}
            </div>
          </div>

          {/* Color 1 */}
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold text-slate-400 uppercase tracking-wide">
              {mode === 'gradient' ? 'Color inicial' : 'Color de fondo'}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color1}
                onChange={(e) => setColor1(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 p-0.5 bg-transparent"
              />
              <span className="text-xs font-mono text-slate-400 uppercase">{color1}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor1(c)}
                  title={c}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    color1 === c ? 'border-blue-400 scale-110' : 'border-white/20'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Color 2 — solo gradiente */}
          {mode === 'gradient' && (
            <div>
              <p className="mb-2 text-[0.68rem] font-semibold text-slate-400 uppercase tracking-wide">Color final</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color2}
                  onChange={(e) => setColor2(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 p-0.5 bg-transparent"
                />
                <span className="text-xs font-mono text-slate-400 uppercase">{color2}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor2(c)}
                    title={c}
                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      color2 === c ? 'border-blue-400 scale-110' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Dirección — solo gradiente */}
          {mode === 'gradient' && (
            <div>
              <p className="mb-2 text-[0.68rem] font-semibold text-slate-400 uppercase tracking-wide">Dirección</p>
              <div className="grid grid-cols-2 gap-2">
                {([0, 1, 2, 3] as BgDirection[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                      direction === d
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    {DIRECTION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-between pt-1 border-t border-white/10">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors"
              >
                <Check className="h-3.5 w-3.5" /> Aplicar
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body,
  )
}
