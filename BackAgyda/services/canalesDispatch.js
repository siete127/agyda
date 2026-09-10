const metaClient = require('./canalesMeta/metaClient');
const baileysManager = require('./canalesBaileys/baileysManager');
const fcaManager = require('./canalesFca/fcaManager');
const igPrivateManager = require('./canalesIgPrivate/igPrivateManager');
const webPublicaManager = require('./webPublicaManager');

// Dispatcher de envío saliente por tipo de canal — extraído de
// ccInteraccionesController.enviarTextoCanal para que lo compartan Contact
// Center y crmWhatsappService (CRM Cliente — Fase 6).
//
// `canal` es una fila de CCO_CANALES (CN_ID, CN_TIPO, CN_META_PAGE_ID,
// CN_ACCESS_TOKEN, CN_MODO_SESION, ...). `usuarioId` solo aplica a los canales
// no oficiales en modo 'individual'; para envíos del CRM siempre es undefined
// (usa la sesión compartida del canal).

function tipoCanalDe(canal) {
  return (canal.CN_TIPO || canal.tipo || '').toLowerCase();
}

async function enviarTextoCanal(canal, destinatarioExtId, texto, usuarioId) {
  const tipo = tipoCanalDe(canal);
  const canalId = canal.CN_ID || canal.canalId || canal.id;
  if (tipo === 'whatsapp_baileys') return baileysManager.enviarTexto(canalId, destinatarioExtId, texto, usuarioId);
  if (tipo === 'messenger_fca') return fcaManager.enviarTexto(canalId, destinatarioExtId, texto, usuarioId);
  if (tipo === 'instagram_privado') return igPrivateManager.enviarTexto(canalId, destinatarioExtId, texto, usuarioId);
  if (tipo === 'web_publica') return webPublicaManager.enviarTexto(destinatarioExtId, texto);
  // whatsapp / messenger / instagram → Cloud API de Meta
  return metaClient.enviarTexto(canal, destinatarioExtId, texto);
}

module.exports = { enviarTextoCanal, tipoCanalDe };
