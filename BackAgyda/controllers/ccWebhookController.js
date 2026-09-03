const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { parseWebhookMeta } = require('../services/canalesMeta/parseWebhookMeta');
const metaClient = require('../services/canalesMeta/metaClient');
const ccIngest = require('../services/ccIngestService');
const ccRouting = require('../services/ccRoutingService');

async function cargarCanal(tenantKey, canalId) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().input('id', sql.Int, canalId)
    .query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
  return { pool, canal: r.recordset[0] };
}

function firmaValida(rawBody, appSecret, header) {
  if (!appSecret || !header) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(esperado));
  } catch {
    return false;
  }
}

// GET — handshake de verificación del webhook de Meta.
exports.verify = async (req, res) => {
  try {
    const { tenantKey, canalId } = req.params;
    const modo = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const { canal } = await cargarCanal(tenantKey, canalId);
    if (!canal) return res.sendStatus(404);
    if (modo === 'subscribe' && token && token === canal.CN_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } catch (e) {
    console.error('[ccWebhook.verify]', e.message);
    return res.sendStatus(500);
  }
};

// POST — recepción de eventos de Meta.
exports.receive = async (req, res) => {
  // Responder 200 rápido siempre; procesar en background para no perder eventos.
  res.sendStatus(200);
  try {
    const { tenantKey, canalId } = req.params;
    const { pool, canal } = await cargarCanal(tenantKey, canalId);
    if (!canal || !canal.CN_HABILITADO) return;

    const esTest = (canal.CN_TIPO || '').toLowerCase() === 'test';
    if (!esTest && !firmaValida(req.rawBody, canal.CN_APP_SECRET, req.headers['x-hub-signature-256'])) {
      console.warn(`[ccWebhook] firma inválida canal ${canalId} tenant ${tenantKey}`);
      return;
    }

    const eventos = parseWebhookMeta(req.body, canal.CN_TIPO);
    for (const ev of eventos) {
      if (ev.kind === 'entrega') {
        if (ev.metaMsgId) {
          await pool.request()
            .input('m', sql.NVarChar(120), ev.metaMsgId)
            .input('s', sql.NVarChar(15), ev.deliveryStatus)
            .query(`UPDATE dbo.CCO_MENSAJES SET MG_ESTADO_ENTREGA = @s WHERE MG_META_MSG_ID = @m`)
            .catch(() => {});
        }
        continue;
      }
      // mensaje entrante
      await ccIngest.ingestarMensajeCliente(pool, tenantKey, canal, {
        clienteExtId: ev.clienteExtId,
        clienteNombre: ev.clienteNombre,
        clienteTelefono: ev.clienteExtId && /^\d{8,15}$/.test(ev.clienteExtId) ? ev.clienteExtId : null,
        metaMsgId: ev.metaMsgId,
        texto: ev.texto,
        media: ev.media,
      }, { descargarMediaFn: (c, id, url) => metaClient.descargarMedia(c, id, url) })
        .catch((e) => console.error('[ccWebhook] ingest:', e.message));
    }
  } catch (e) {
    console.error('[ccWebhook.receive]', e.message);
  }
};
