import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Tras un deploy del frontend, las pestañas que ya estaban abiertas piden
// chunks del build anterior que ya no existen: se recarga una vez (toma el
// index.html nuevo) en vez de mostrar "Algo salió mal". La sesión sigue en
// localStorage. Si ya se recargó hace poco, se deja pasar el error para no
// entrar en un bucle (p. ej. si el index.html viejo sigue en caché).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const ultima = Number(sessionStorage.getItem('recarga-por-deploy') || 0)
    if (Date.now() - ultima < 10_000) return
    sessionStorage.setItem('recarga-por-deploy', String(Date.now()))
  } catch { /* sin sessionStorage: recargar igual */ }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
