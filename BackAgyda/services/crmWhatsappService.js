const databaseService = require('./databaseService');
const { enviarTextoCanal } = require('./canalesDispatch');

// Puente CRM → WhatsApp (CRM Cliente — Fase 6). Manda mensajes de texto plano
// (recordatorios de cita, pago, renovación) por el canal de WhatsApp que el
// Contact Center tenga conectado. NUNCA reemplaza al correo — es un canal
// adicional; si no hay canal disponible, devuelve {ok:false} y el llamador
// sigue solo con correo, sin romper.

// Rate-limit en memoria por número — 1 mensaje / 30 s, para no gatillar
// bloqueos de WhatsApp por envío masivo.
const _rateMap = new Map();
function _rateLimit(numero) {
  const ahora = Date.now();
  const ultimo = _rateMap.get(numero) ?? 0;
  if (ahora - ultimo < 30_000) return false;
  _rateMap.set(numero, ahora);
  return true;
}

// Normaliza un teléfono a solo dígitos con lada de país. Asume México (52) si
// el número trae 10 dígitos sin lada.
function normalizarTelefono(tel) {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = '52' + d;
  // 521XXXXXXXXXX (formato viejo de WhatsApp MX) → 52XXXXXXXXXX
  if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3);
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

// Devuelve la fila de CCO_CANALES a usar para el CRM, o null si no hay ninguno.
// Prioridad: canal marcado CN_ES_CANAL_CRM=1 y conectado → primer WhatsApp
// Baileys conectado → primer WhatsApp oficial (Meta) habilitado con credenciales.
async function getCanalSaliente(pool) {
  try {
    const rs = await pool.request().query(`
      SELECT TOP 1 * FROM dbo.CCO_CANALES
      WHERE CN_ES_CANAL_CRM = 1 AND CN_HABILITADO = 1
        AND (
          (CN_TIPO = 'whatsapp_baileys' AND CN_BAILEYS_ESTADO = 'conectado')
          OR (CN_TIPO = 'whatsapp' AND CN_ACCESS_TOKEN IS NOT NULL AND CN_META_PAGE_ID IS NOT NULL)
        )
      ORDER BY CN_ID
    `);
    if (rs.recordset[0]) return rs.recordset[0];

    const fallback = await pool.request().query(`
      SELECT TOP 1 * FROM dbo.CCO_CANALES
      WHERE CN_HABILITADO = 1
        AND (
          (CN_TIPO = 'whatsapp_baileys' AND CN_BAILEYS_ESTADO = 'conectado')
          OR (CN_TIPO = 'whatsapp' AND CN_ACCESS_TOKEN IS NOT NULL AND CN_META_PAGE_ID IS NOT NULL)
        )
      ORDER BY CASE WHEN CN_TIPO = 'whatsapp_baileys' THEN 0 ELSE 1 END, CN_ID
    `);
    return fallback.recordset[0] || null;
  } catch (e) {
    console.warn('[crmWhatsapp] getCanalSaliente:', e.message);
    return null;
  }
}

// Envía un texto por WhatsApp. Devuelve { ok, canal, error }.
// tenantKey se usa solo para el log; el pool ya viene resuelto.
async function enviarTexto(pool, tenantKey, telefono, texto) {
  const numero = normalizarTelefono(telefono);
  if (!numero) return { ok: false, error: 'telefono inválido' };
  if (!_rateLimit(numero)) return { ok: false, error: 'rate-limit' };

  const canal = await getCanalSaliente(pool);
  if (!canal) return { ok: false, error: 'sin canal de WhatsApp conectado' };

  try {
    await enviarTextoCanal(canal, numero, texto, undefined);
    return { ok: true, canal: canal.CN_NOMBRE };
  } catch (e) {
    console.warn(`[crmWhatsapp][${tenantKey}] envío a ${numero} falló:`, e.message);
    return { ok: false, canal: canal.CN_NOMBRE, error: e.message };
  }
}

// Templates de texto plano (sin HTML) para los recordatorios del CRM.
const templates = {
  cita({ contactoNombre, titulo, modalidad, fechaHora, enlace, telefono }) {
    const cuando = fechaHora ? new Date(fechaHora).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' }) : 'por confirmar';
    let t = `Hola ${contactoNombre || ''}, te recordamos tu cita:\n\n📅 ${titulo}\n🕒 ${cuando}`;
    if (modalidad === 'videollamada' && enlace) t += `\n🔗 ${enlace}`;
    if (modalidad === 'telefonica' && telefono) t += `\n📞 Te llamaremos al ${telefono}`;
    return t;
  },
  pago({ contactoNombre, concepto, monto, fechaLimite, diasRestantes }) {
    const m = Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    const venc = diasRestantes != null
      ? (diasRestantes < 0 ? 'venció' : diasRestantes === 0 ? 'vence hoy' : `vence en ${diasRestantes} día(s)`)
      : `con fecha límite ${fechaLimite}`;
    return `Hola ${contactoNombre || ''}, te recordamos tu pago pendiente:\n\n💳 ${concepto}\n💲 $${m}\n📅 ${venc} (${fechaLimite})`;
  },
  renovacion({ contactoNombre, descripcion, tipo, fecha, diasRestantes }) {
    const venc = diasRestantes != null
      ? (diasRestantes < 0 ? 'ya venció' : diasRestantes === 0 ? 'es hoy' : `en ${diasRestantes} día(s)`)
      : fecha;
    return `Hola ${contactoNombre || ''}, tu ${tipo || 'renovación'} "${descripcion}" ${venc} (${fecha}). Contáctanos para gestionarla.`;
  },
};

module.exports = { enviarTexto, getCanalSaliente, normalizarTelefono, templates };
