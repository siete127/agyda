import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'

// Validaciones de captura de clientes (backend /api/validaciones): RFC con
// dígito verificador del SAT, correo con dominio que recibe correo y código
// postal del catálogo SEPOMEX (con sus colonias). Solo informan: la pantalla
// decide si avisa o bloquea.

export type NivelAviso = 'ok' | 'aviso' | 'error' | 'info'
export interface Aviso { nivel: NivelAviso; texto: string }

interface RfcResultado { valido: boolean; rfc: string; tipo?: 'moral' | 'fisica' | 'generico'; errores: string[] }
interface CorreoResultado { formato: boolean; dominioRecibe: boolean | null; correo: string; dominio?: string; sugerencia?: string | null }
export interface CpResultado {
  formato: boolean; existe: boolean; cp: string
  estado?: string; municipio?: string; ciudad?: string | null; zona?: string
  colonias?: { nombre: string; tipo: string }[]
}

function useDebounced<T>(valor: T, ms = 400): T {
  const [v, setV] = useState(valor)
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t) }, [valor, ms])
  return v
}

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()

export function useValidacionCliente({ rfc, correo, cp, colonia }: { rfc: string; correo: string; cp: string; colonia: string }) {
  const rfcD = useDebounced(rfc.trim().toUpperCase())
  const correoD = useDebounced(correo.trim())
  const cpD = useDebounced(cp.replace(/\D/g, ''))

  const qRfc = useQuery({
    queryKey: ['validar-rfc', rfcD],
    queryFn: async () => (await api.get('/validaciones/rfc', { params: { rfc: rfcD } })).data.data as RfcResultado,
    enabled: rfcD.length >= 10,
    staleTime: Infinity,
  })
  const qCorreo = useQuery({
    queryKey: ['validar-correo', correoD.toLowerCase()],
    queryFn: async () => (await api.get('/validaciones/correo', { params: { correo: correoD } })).data.data as CorreoResultado,
    enabled: correoD.length >= 3,
    staleTime: 10 * 60_000,
  })
  const qCp = useQuery({
    queryKey: ['validar-cp', cpD],
    queryFn: async () => (await api.get(`/validaciones/cp/${cpD}`)).data.data as CpResultado,
    enabled: cpD.length === 5,
    staleTime: Infinity,
  })

  // ── Avisos por campo ──
  let avisoRfc: Aviso | null = null
  if (rfc.trim()) {
    if (rfc.trim().length < 10) avisoRfc = { nivel: 'error', texto: 'Muy corto: 12 caracteres (empresa) o 13 (persona física)' }
    else if (qRfc.data && qRfc.data.rfc === rfcD) {
      avisoRfc = qRfc.data.valido
        ? { nivel: 'ok', texto: qRfc.data.tipo === 'moral' ? 'RFC válido · persona moral' : qRfc.data.tipo === 'fisica' ? 'RFC válido · persona física' : 'RFC genérico del SAT' }
        : { nivel: 'error', texto: qRfc.data.errores.join('. ') }
    }
  }

  // El correo del cliente es obligatorio (mismo criterio que el backend,
  // errorCorreoObligatorio): vacío, mal formado o dominio que no recibe = error.
  let avisoCorreo: Aviso | null = null
  const sugerenciaCorreo = qCorreo.data?.sugerencia ?? null
  const correoActual = correo.trim().toLowerCase()
  const correoComprobado = !!qCorreo.data && qCorreo.data.correo === correoActual && !qCorreo.isFetching
  if (!correoActual) avisoCorreo = { nivel: 'error', texto: 'El correo es obligatorio' }
  else if (qCorreo.data) {
    const d = qCorreo.data
    if (!d.formato) avisoCorreo = { nivel: 'error', texto: 'No parece un correo (ej. nombre@empresa.com)' }
    else if (d.dominioRecibe === false) avisoCorreo = { nivel: 'error', texto: `El dominio ${d.dominio} no existe o no recibe correo` }
    else if (d.dominioRecibe === null) avisoCorreo = { nivel: 'info', texto: `No se pudo comprobar el dominio ${d.dominio}; se permite guardar` }
    else avisoCorreo = { nivel: 'ok', texto: `El dominio ${d.dominio} recibe correo` }
  }
  // Se puede guardar solo cuando lo escrito ya se comprobó y no es error.
  const correoValido = correoComprobado && avisoCorreo?.nivel !== 'error'

  let avisoCp: Aviso | null = null
  const datosCp = qCp.data && qCp.data.cp === cpD && qCp.data.existe ? qCp.data : null
  if (cp.trim()) {
    if (cpD.length !== 5) avisoCp = { nivel: 'error', texto: 'El código postal son 5 dígitos' }
    else if (qCp.data && qCp.data.cp === cpD) {
      avisoCp = qCp.data.existe
        ? { nivel: 'ok', texto: `${qCp.data.municipio}, ${qCp.data.estado}` }
        : { nivel: 'error', texto: 'Este código postal no existe en el catálogo de SEPOMEX' }
    }
  }

  let avisoColonia: Aviso | null = null
  if (datosCp && colonia.trim()) {
    const ok = (datosCp.colonias ?? []).some((c) => sinAcentos(c.nombre) === sinAcentos(colonia))
    avisoColonia = ok
      ? { nivel: 'ok', texto: 'Colonia del código postal' }
      : { nivel: 'aviso', texto: `No es una colonia del CP ${datosCp.cp}; elige una de la lista` }
  }

  return {
    avisoRfc, avisoCorreo, avisoCp, avisoColonia, sugerenciaCorreo, datosCp, correoValido,
    comprobandoCorreo: !!correoActual && !correoComprobado,
    validando: qRfc.isFetching || qCorreo.isFetching || qCp.isFetching,
  }
}
