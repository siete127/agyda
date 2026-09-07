// Envío saliente para el canal 'web_publica' (widget de chat de la página web
// pública, ardabytec.com) — a diferencia de whatsapp/messenger/instagram, este
// canal no llama a ninguna API externa: el "envío" es simplemente empujar el
// mensaje al navegador del visitante por socket, en la sala `livechat:{id}`
// (mismo nombre de sala y mismo evento `receive_livechat_message` que ya
// escucha el widget en index.html — no se tocó ese HTML, solo cambió qué
// backend responde).
//
// El propio insert en CCO_MENSAJES y el evento 'cc:mensaje' (para la bandeja
// del agente) ya los hace ccInteraccionesController.enviarMensaje/subirMedia
// después de llamar a este dispatcher — aquí solo se encarga del lado
// "visitante" del mensaje saliente.
const socketService = require('./socketService');

// Nota: quien llama aquí (ccInteraccionesController) todavía no tiene el
// MG_ID del mensaje recién insertado en ese punto del flujo (el INSERT ocurre
// después de este dispatcher) — el evento en vivo real, con el contenido
// completo del mensaje, lo emite la propia función que llama, vía el mismo
// 'cc:mensaje' de siempre. Aquí basta con confirmar el "envío" sin lanzar
// error — no hay nada que de verdad pueda fallar del lado del visitante.
async function enviarTexto(interaccionId, _texto) {
  return { messages: [{ id: `web_${interaccionId}_${Date.now()}` }] };
}

async function enviarMedia(interaccionId, _mediaUrl, _tipoMedia) {
  return { messages: [{ id: `web_${interaccionId}_${Date.now()}` }] };
}

module.exports = { enviarTexto, enviarMedia };
