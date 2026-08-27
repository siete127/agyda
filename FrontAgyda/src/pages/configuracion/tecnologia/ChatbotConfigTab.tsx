import { useQuery } from '@tanstack/react-query'
import { Bot, GitBranch, MessageSquareText } from 'lucide-react'
import { chatbotArbolService } from '@/services/chatbotArbol.service'

export function ChatbotConfigTab() {
  const { data: nodos = [], isLoading } = useQuery({
    queryKey: ['chatbot-arbol-nodos'],
    queryFn: () => chatbotArbolService.getNodos(),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Chatbot</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          El árbol de diagnóstico (resolución guiada, escalamiento a chat en vivo, creación automática
          de tickets) y las respuestas por palabra clave se administran en el módulo de Chatbot completo.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface p-3">
            <div className="flex items-center gap-1.5 text-ink-tertiary">
              <GitBranch className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Nodos del árbol</span>
            </div>
            <p className="mt-1 text-xl font-bold text-ink">{isLoading ? '—' : nodos.length}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <div className="flex items-center gap-1.5 text-ink-tertiary">
              <MessageSquareText className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Nodos activos</span>
            </div>
            <p className="mt-1 text-xl font-bold text-ink">{isLoading ? '—' : nodos.filter((n) => n.activo).length}</p>
          </div>
        </div>

        <a href="/chatbot" className="mt-4 inline-block text-xs font-semibold text-brand hover:underline">
          Ir a administración completa del Chatbot →
        </a>
      </div>
    </div>
  )
}
