import LivechatPage from '@/pages/livechat/LivechatPage'

// Ruta /operaciones/asesores y /ventas-area/asesores: Chat en Vivo es la vista
// principal aquí también (mismo componente que la ruta /livechat, sin
// duplicar sus ~950 líneas) — "Mi día" (AsesoresPanel, todo lo que antes se
// veía de entrada en esta página) queda detrás del botón "Asesores" que
// LivechatPage ya trae en su propio header.
export function AsesoresPage() {
  return <LivechatPage />
}
