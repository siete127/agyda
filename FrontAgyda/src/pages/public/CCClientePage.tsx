import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Loader2 } from 'lucide-react'
import { publicApi } from '@/lib/axios-public'

// Página pública de "cliente" para demos del Contact Center (sin login).
// URL: /cc-cliente?t=<simToken>
export default function CCClientePage() {
  const token = new URLSearchParams(window.location.search).get('t') || ''
  const [texto, setTexto] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cc-cliente', token],
    queryFn: async () => (await publicApi.get(`/contact-center/sim/${token}`)).data.data,
    enabled: !!token,
    refetchInterval: 3000,
  })
  const enviar = useMutation({
    mutationFn: () => publicApi.post(`/contact-center/sim/${token}/mensajes`, { mensaje: texto }),
    onSuccess: () => { setTexto(''); refetch() },
  })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [data?.mensajes?.length])

  if (!token) return <Centro>Falta el token en la URL.</Centro>
  if (isLoading) return <Centro><Loader2 className="h-5 w-5 animate-spin" /></Centro>
  if (isError) return <Centro>Enlace inválido o expirado.</Centro>

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-gray-50">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">A</div>
        <div>
          <p className="text-sm font-bold text-gray-900">Atención al cliente</p>
          <p className="text-[0.68rem] text-gray-400">{data?.agenteNombre ? `Te atiende ${data.agenteNombre}` : 'Estamos con tu solicitud'}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {(data?.mensajes ?? []).map((m: any) => (
          <div key={m.id} className={m.emisor === 'cliente' ? 'flex justify-end' : 'flex justify-start'}>
            <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.emisor === 'cliente' ? 'rounded-br-sm bg-violet-600 text-white' : 'rounded-bl-sm bg-white text-gray-800 ring-1 ring-gray-200'}`}>
              {m.contenido}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-3">
        <input
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm outline-none focus:border-violet-500"
          value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) enviar.mutate() }}
          placeholder="Escribe un mensaje…"
        />
        <button onClick={() => texto.trim() && enviar.mutate()} disabled={enviar.isPending || !texto.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen items-center justify-center text-sm text-gray-500">{children}</div>
}
