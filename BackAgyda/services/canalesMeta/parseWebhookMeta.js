// Normaliza el payload de webhook de Meta a eventos canónicos:
//   { kind: 'mensaje'|'entrega', clienteExtId, clienteNombre?, metaMsgId, texto?,
//     media?: { metaMediaId, url?, tipo }, deliveryStatus?, canalExtId }
//
// WhatsApp Cloud API: body.entry[].changes[].value.{messages,statuses,contacts}
// Messenger / Instagram: body.entry[].messaging[].{message,delivery,read}

function parseWhatsApp(body) {
  const out = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const canalExtId = v.metadata?.phone_number_id || null;
      const contactos = {};
      for (const c of v.contacts || []) contactos[c.wa_id] = c.profile?.name;

      for (const m of v.messages || []) {
        const ev = {
          kind: 'mensaje',
          canalExtId,
          clienteExtId: m.from,
          clienteNombre: contactos[m.from] || null,
          metaMsgId: m.id,
          fecha: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        };
        if (m.type === 'text') ev.texto = m.text?.body || '';
        else if (['image', 'audio', 'video', 'document', 'sticker', 'voice'].includes(m.type)) {
          const media = m[m.type] || {};
          ev.media = { metaMediaId: media.id, tipo: m.type === 'voice' ? 'audio' : m.type, mime: media.mime_type };
          ev.texto = media.caption || '';
        } else {
          ev.texto = `[${m.type}]`;
        }
        out.push(ev);
      }
      for (const s of v.statuses || []) {
        out.push({
          kind: 'entrega',
          canalExtId,
          metaMsgId: s.id,
          deliveryStatus: s.status === 'read' ? 'leido' : s.status === 'delivered' ? 'entregado' : s.status === 'failed' ? 'fallido' : 'enviado',
        });
      }
    }
  }
  return out;
}

function parseMessenger(body) {
  const out = [];
  for (const entry of body.entry || []) {
    const canalExtId = entry.id || null;
    for (const ev of entry.messaging || []) {
      const clienteExtId = ev.sender?.id;
      if (ev.message && !ev.message.is_echo) {
        const base = {
          kind: 'mensaje', canalExtId, clienteExtId,
          metaMsgId: ev.message.mid,
          fecha: ev.timestamp ? new Date(ev.timestamp) : new Date(),
        };
        if (ev.message.text) base.texto = ev.message.text;
        const att = (ev.message.attachments || [])[0];
        if (att) {
          base.media = { url: att.payload?.url, tipo: att.type };
          base.texto = base.texto || '';
        }
        out.push(base);
      } else if (ev.delivery) {
        for (const mid of ev.delivery.mids || []) out.push({ kind: 'entrega', canalExtId, metaMsgId: mid, deliveryStatus: 'entregado' });
      } else if (ev.read) {
        out.push({ kind: 'entrega', canalExtId, clienteExtId, deliveryStatus: 'leido' });
      }
    }
  }
  return out;
}

function parseWebhookMeta(body, tipo) {
  const t = (tipo || '').toLowerCase();
  if (t === 'whatsapp') return parseWhatsApp(body);
  // messenger e instagram comparten la forma entry[].messaging[]
  return parseMessenger(body);
}

module.exports = { parseWebhookMeta };
