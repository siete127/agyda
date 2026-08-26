import { Link } from 'react-router-dom'
import { Home, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
        <AlertCircle className="h-10 w-10 text-red-400" />
      </div>
      <div>
        <h2 className="text-4xl font-bold text-gray-800">404</h2>
        <p className="mt-1 text-gray-500">Página no encontrada</p>
      </div>
      <Link to="/dashboard">
        <Button variant="primary">
          <Home className="h-4 w-4" />
          Volver al inicio
        </Button>
      </Link>
    </div>
  )
}
