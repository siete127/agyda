// Service Worker de notificaciones push (Web Push / VAPID). Se registra desde
// pushNotifications.service.ts. No cachea nada — su único trabajo es recibir
// el evento 'push' del navegador y mostrar la notificación del sistema
// operativo, y reaccionar al click sobre ella.

self.addEventListener('push', (event) => {
  let data = { titulo: 'AGYDA', cuerpo: 'Tienes una notificación nueva', url: '/', tag: 'agyda' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (e) {
    // payload no era JSON válido, se usa el default
  }

  event.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.cuerpo,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag,
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
