import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { satService, type SatClave } from '@/services/sat.service'

interface Props {
  tipo: 'prod-serv' | 'unidad'
  value: string | null
  label?: string | null
  onChange: (clave: string | null, descripcion: string | null) => void
  placeholder?: string
  className?: string
}

/**
 * Autocomplete contra el catálogo SAT (clave de producto/servicio o de unidad).
 * Guarda el snapshot (clave + descripción) — no una FK.
 */
export function SatClaveInput({ tipo, value, label, onChange, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['sat', tipo, debounced],
    queryFn: () => (tipo === 'prod-serv' ? satService.buscarProdServ(debounced) : satService.buscarUnidades(debounced)),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  })

  const pick = (r: SatClave) => {
    onChange(r.clave, r.descripcion)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={boxRef} className={clsx('relative', className)}>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="font-mono font-semibold text-gray-700">{value}</span>
          <span className="flex-1 truncate text-gray-500">{label || ''}</span>
          <button type="button" onClick={() => onChange(null, null)} className="text-gray-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-card px-3 py-2">
          <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? (tipo === 'prod-serv' ? 'Buscar clave de producto/servicio SAT…' : 'Buscar unidad SAT…')}
            className="w-full bg-transparent text-sm outline-none placeholder-gray-400"
          />
        </div>
      )}

      {open && !value && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-card shadow-lg">
          {debounced.trim().length < 2 && (
            <p className="px-3 py-2 text-xs text-gray-400">Escribe al menos 2 letras…</p>
          )}
          {debounced.trim().length >= 2 && isFetching && (
            <p className="px-3 py-2 text-xs text-gray-400">Buscando…</p>
          )}
          {debounced.trim().length >= 2 && !isFetching && resultados.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Sin coincidencias</p>
          )}
          {resultados.map((r) => (
            <button
              key={r.clave}
              type="button"
              onClick={() => pick(r)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50"
            >
              <span className="font-mono font-semibold text-violet-700">{r.clave}</span>
              <span className="flex-1 text-gray-600">{r.descripcion}</span>
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-transparent" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
