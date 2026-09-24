/** Abre una URL en una ventana emergente de tamaño fijo, centrada en la
 *  pantalla — a diferencia de una pestaña nueva, el usuario puede dejarla
 *  al costado y seguir viendo AGYDA al mismo tiempo. Al ser una ventana
 *  top-level (no un <iframe>), no choca con X-Frame-Options. */
export function abrirEnVentana(url: string, nombre = 'enlace-agyda', w = 480, h = 720) {
  const left = Math.max(0, Math.round((window.screen.width - w) / 2))
  const top = Math.max(0, Math.round((window.screen.height - h) / 2))
  window.open(
    url,
    nombre,
    `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`,
  )
}
