import { Link } from 'react-router-dom'
import { LayoutGrid, ArrowRight, MousePointer2, Move, Maximize2 } from 'lucide-react'

// El editor del inicio es in-situ (en la propia página de Inicio, botón
// "Editar diseño"). Esta pantalla solo explica dónde está y qué hace.
export function DashboardDisenoTab() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <LayoutGrid className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Diseño del inicio</h2>
          <p className="text-[0.82rem] text-gray-400">
            Ordena, redimensiona, oculta o agrega las tarjetas de la página de Inicio de tu empresa.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
        <p className="text-[0.88rem] font-semibold text-gray-800">El editor está en la propia página de Inicio</p>
        <p className="mt-1 text-[0.8rem] text-gray-500">
          Ve a <b>Inicio</b> y pulsa <b>"Editar diseño"</b> (arriba a la derecha, solo visible para administradores).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Move, t: 'Mover', d: 'Arrastra la barra superior de cada tarjeta.' },
            { icon: Maximize2, t: 'Redimensionar', d: 'Tira de la esquina inferior derecha.' },
            { icon: MousePointer2, t: 'Ocultar / agregar', d: 'Con el ícono de ojo, o desde "Tarjetas ocultas".' },
          ].map((x) => (
            <div key={x.t} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              <x.icon className="h-4 w-4 text-brand" />
              <p className="mt-1.5 text-[0.8rem] font-semibold text-gray-800">{x.t}</p>
              <p className="text-[0.72rem] text-gray-500">{x.d}</p>
            </div>
          ))}
        </div>

        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98]"
        >
          Ir al Inicio <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-3 text-[0.7rem] text-gray-400">
          Los cambios se guardan por empresa y se aplican a todos sus usuarios.
        </p>
      </div>
    </div>
  )
}
