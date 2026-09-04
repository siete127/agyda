// Cliente Graph API de Meta (WhatsApp Cloud API + Messenger + Instagram).
// fetch nativo (Node >= 18). Un `canal` es una fila de CC_CANALES.

const GRAPH = 'https://graph.facebook.com/v21.0';

function tokenDe(canal) {
  return canal.CN_ACCESS_TOKEN || canal.accessToken || '';
}

async function graph(method, path, canal, body) {
  const token = tokenDe(canal);
  const url = `${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data?.error?.message || `${res.status} ${res.statusText}`;
    const err = new Error(`[Meta] ${msg}`);
    err.meta = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Enviar texto ────────────────────────────────────────────────────────
// destinatarioExtId = wa_id (WhatsApp) o PSID (Messenger/Instagram)
async function enviarTexto(canal, destinatarioExtId, texto) {
  const tipo = (canal.CN_TIPO || canal.tipo || '').toLowerCase();
  if (tipo === 'whatsapp') {
    return graph('POST', `/${canal.CN_META_PAGE_ID || canal.metaPageId}/messages`, canal, {
      messaging_product: 'whatsapp',
      to: destinatarioExtId,
      type: 'text',
      text: { body: texto },
    });
  }
  // Messenger / Instagram (Send API)
  return graph('POST', `/${canal.CN_META_PAGE_ID || canal.metaPageId}/messages`, canal, {
    recipient: { id: destinatarioExtId },
    message: { text: texto },
    messaging_type: 'RESPONSE',
  });
}

// ── Enviar media por URL pública ────────────────────────────────────────
async function enviarMedia(canal, destinatarioExtId, mediaUrl, tipoMedia) {
  const tipo = (canal.CN_TIPO || canal.tipo || '').toLowerCase();
  const kind = tipoMedia === 'audio' ? 'audio' : tipoMedia === 'video' ? 'video' : tipoMedia === 'document' ? 'document' : 'image';
  if (tipo === 'whatsapp') {
    return graph('POST', `/${canal.CN_META_PAGE_ID || canal.metaPageId}/messages`, canal, {
      messaging_product: 'whatsapp',
      to: destinatarioExtId,
      type: kind,
      [kind]: { link: mediaUrl },
    });
  }
  return graph('POST', `/${canal.CN_META_PAGE_ID || canal.metaPageId}/messages`, canal, {
    recipient: { id: destinatarioExtId },
    message: { attachment: { type: kind, payload: { url: mediaUrl, is_reusable: false } } },
    messaging_type: 'RESPONSE',
  });
}

// ── Descargar media entrante ────────────────────────────────────────────
// WhatsApp: dos pasos (GET /{mediaId} → url, luego GET url con Bearer).
// Messenger/Instagram: el webhook ya trae la url directa del attachment.
async function descargarMedia(canal, metaMediaId, urlDirecta) {
  const token = tokenDe(canal);
  let url = urlDirecta;
  if (!url) {
    const meta = await graph('GET', `/${metaMediaId}`, canal);
    url = meta?.url;
  }
  if (!url) throw new Error('[Meta] media sin URL');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`[Meta] descarga media ${res.status}`);
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, mime };
}

// ── Suscribir el webhook de la app a la página ──────────────────────────
async function suscribirWebhook(canal) {
  const tipo = (canal.CN_TIPO || canal.tipo || '').toLowerCase();
  if (tipo === 'whatsapp') {
    // WhatsApp: la suscripción se hace a nivel WABA
    return graph('POST', `/${canal.CN_META_BUSINESS_ID || canal.metaBusinessId}/subscribed_apps`, canal, {});
  }
  return graph('POST', `/${canal.CN_META_PAGE_ID || canal.metaPageId}/subscribed_apps`, canal, {
    subscribed_fields: tipo === 'instagram' ? 'messages,messaging_postbacks' : 'messages,messaging_postbacks,message_deliveries,message_reads',
  });
}

// ── Verificar credenciales ─────────────────────────────────────────────
async function verificarConexion(canal) {
  const tipo = (canal.CN_TIPO || canal.tipo || '').toLowerCase();
  try {
    if (tipo === 'whatsapp') {
      const r = await graph('GET', `/${canal.CN_META_PAGE_ID || canal.metaPageId}`, canal);
      return { ok: true, message: `Conectado: ${r?.display_phone_number || r?.id || 'ok'}` };
    }
    const r = await graph('GET', `/${canal.CN_META_PAGE_ID || canal.metaPageId}?fields=name`, canal);
    return { ok: true, message: `Conectado: ${r?.name || r?.id || 'ok'}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = { enviarTexto, enviarMedia, descargarMedia, suscribirWebhook, verificarConexion };
