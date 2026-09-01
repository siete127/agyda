import { HardHat } from 'lucide-react'

export function ProximamenteTab({ seccion }: { seccion: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200/60 bg-card py-20 shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
        <HardHat className="h-8 w-8 text-amber-500" />
      </div>
      <div className="text-center">
        <p className="text-base font-bold text-gray-800">{seccion} — próximamente</p>
        <p className="mt-1 max-w-sm text-sm text-gray-400">Esta sección todavía no está disponible.</p>
      </div>
    </div>
  )
}
