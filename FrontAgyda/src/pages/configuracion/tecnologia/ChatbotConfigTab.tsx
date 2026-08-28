import { Bot } from 'lucide-react'
import { ArbolDiagnosticoTab } from '@/pages/chatbot/ArbolDiagnosticoTab'

export function ChatbotConfigTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Árbol de diagnóstico</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          Preguntas guiadas del chatbot: cada nodo puede resolver, escalar a chat en vivo, o crear un
          ticket automáticamente. Las respuestas por palabra clave del widget público se administran
          por separado en <a href="/chatbot" className="font-semibold text-brand hover:underline">el módulo de Chatbot</a>.
        </p>
        <ArbolDiagnosticoTab />
      </div>
    </div>
  )
}
