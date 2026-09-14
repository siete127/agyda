interface ProximamentePageProps {
  titulo: string
}

export function ProximamentePage({ titulo }: ProximamentePageProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-bold text-ink">{titulo}</h1>
      <p className="text-sm text-ink-tertiary">Esta sección está en construcción.</p>
    </div>
  )
}
