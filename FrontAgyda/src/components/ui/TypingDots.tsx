// Tres puntos rebotando en secuencia, como el indicador de "escribiendo..."
// de WhatsApp — usado junto al nombre de quien está escribiendo en el chat.
export function TypingDots({ className = 'bg-brand' }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1 w-1 rounded-full animate-bounce ${className}`}
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  )
}
