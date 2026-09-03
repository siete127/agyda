const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const ccRouting = require('./ccRoutingService');
const { CC_MEDIA_DIR } = require('../middleware/ccMediaUpload');

const EXT_POR_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
  'video/mp4': '.mp4', 'application/pdf': '.pdf',
};

// Guarda un buffer de media entrante y devuelve el id de CC_MEDIA.
async function guardarMedia(pool, { interaccionId, buffer, mime, metaMediaId, nombreOriginal }) {
  const ext = EXT_POR_MIME[mime] || path.extname(nombreOriginal || '') || '.bin';
  const nombre = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  await fs.promises.writeFile(path.join(CC_MEDIA_DIR, nombre), buffer);
  const r = await pool.request()
    .input('int', sql.Int, interaccionId)
    .input('n', sql.NVarChar(260), nombre)
    .input('o', sql.NVarChar(260), nombreOriginal || null)
    .input('m', sql.NVarChar(120), mime || null)
    .input('t', sql.Int, buffer.length)
    .input('meta', sql.NVarChar(120), metaMediaId || null)
    .query(`INSERT INTO dbo.CCO_MEDIA (MM3_INTERACCION_ID, MM3_NOMBRE_ARCHIVO, MM3_NOMBRE_ORIGINAL, MM3_MIME, MM3_TAMANIO, MM3_META_MEDIA_ID)
            OUTPUT INSERTED.MM3_ID id VALUES (@int, @n, @o, @m, @t, @meta)`);
  return r.recordset[0].id;
}

// Resuelve la interacción abierta para (canal, clienteExtId) o crea una nueva en cola.
async function obtenerOCrearInteraccion(pool, canal, { clienteExtId, clienteNombre, clienteTelefono }) {
  const abierta = await pool.request()
    .input('canal', sql.Int, canal.CN_ID)
    .input('ext', sql.NVarChar(80), clienteExtId || null)
    .query(`SELECT TOP 1 CI_ID as id, CI_ESTADO as estado, CI_AGENTE_ID as agenteId, CI_TIPO as tipo
            FROM dbo.CCO_INTERACCIONES
            WHERE CI_CANAL_ID = @canal AND CI_CLIENTE_EXT_ID = @ext
              AND CI_ESTADO IN ('en_cola','activa','pendiente_tipificacion')
            ORDER BY CI_ID DESC`);
  if (abierta.recordset[0]) return { ...abierta.recordset[0], nueva: false };

  const ticket = await pool.request().query(
    `SELECT ISNULL(MAX(CI_TICKET), 0) + 1 AS n FROM dbo.CCO_INTERACCIONES WHERE CI_ESTADO = 'en_cola'`);
  const ins = await pool.request()
    .input('canal', sql.Int, canal.CN_ID)
    .input('tipo', sql.NVarChar(20), canal.CN_TIPO)
    .input('ext', sql.NVarChar(80), clienteExtId || null)
    .input('nombre', sql.NVarChar(160), clienteNombre || null)
    .input('tel', sql.NVarChar(40), clienteTelefono || null)
    .input('camp', sql.Int, canal.CN_CAMPANIA_ID || null)
    .input('grupo', sql.Int, canal.CN_GRUPO_ID || null)
    .input('ticket', sql.Int, ticket.recordset[0].n)
    .query(`INSERT INTO dbo.CCO_INTERACCIONES
      (CI_CANAL_ID, CI_TIPO, CI_CLIENTE_EXT_ID, CI_CLIENTE_NOMBRE, CI_CLIENTE_TELEFONO,
       CI_CAMPANIA_ID, CI_GRUPO_ID, CI_ESTADO, CI_TICKET)
      OUTPUT INSERTED.CI_ID id
      VALUES (@canal, @tipo, @ext, @nombre, @tel, @camp, @grupo, 'en_cola', @ticket)`);
  return { id: ins.recordset[0].id, estado: 'en_cola', agenteId: null, tipo: canal.CN_TIPO, nueva: true };
}

// Procesa un mensaje entrante del cliente (webhook Meta o simulador).
// evento canónico: { clienteExtId, clienteNombre, clienteTelefono, metaMsgId?, texto?, media? }
async function ingestarMensajeCliente(pool, tenantKey, canal, evento, { descargarMediaFn } = {}) {
  // Idempotencia por MG_META_MSG_ID
  if (evento.metaMsgId) {
    const dup = await pool.request().input('m', sql.NVarChar(120), evento.metaMsgId)
      .query(`SELECT TOP 1 MG_ID FROM dbo.CCO_MENSAJES WHERE MG_META_MSG_ID = @m`);
    if (dup.recordset[0]) return null;
  }

  const it = await obtenerOCrearInteraccion(pool, canal, evento);

  let mediaId = null;
  if (evento.media && descargarMediaFn) {
    try {
      const { buffer, mime } = await descargarMediaFn(canal, evento.media.metaMediaId, evento.media.url);
      mediaId = await guardarMedia(pool, {
        interaccionId: it.id, buffer, mime: evento.media.mime || mime,
        metaMediaId: evento.media.metaMediaId, nombreOriginal: evento.media.tipo,
      });
    } catch (e) {
      console.warn('[ccIngest] media falló:', e?.message || e);
    }
  }

  await pool.request()
    .input('int', sql.Int, it.id)
    .input('c', sql.NVarChar(sql.MAX), evento.texto || null)
    .input('media', sql.Int, mediaId)
    .input('meta', sql.NVarChar(120), evento.metaMsgId || null)
    .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_CONTENIDO, MG_MEDIA_ID, MG_META_MSG_ID)
            VALUES (@int, 'cliente', @c, @media, @meta)`);

  await pool.request().input('id', sql.Int, it.id)
    .query(`UPDATE dbo.CCO_INTERACCIONES SET CI_FECHA_ULTIMO_MSJ_CLIENTE = GETDATE() WHERE CI_ID = @id`);

  ccRouting.emitir(tenantKey, `cc:interaccion:${it.id}`, 'cc:mensaje', { interaccionId: it.id });
  if (it.agenteId) {
    ccRouting.emitir(tenantKey, `user:${it.agenteId}`, 'cc:actividad', { interaccionId: it.id });
  }

  if (it.nueva || it.estado === 'en_cola') {
    await ccRouting.rutearInteraccion(pool, tenantKey, it.id).catch((e) => console.warn('[ccIngest] ruteo:', e?.message));
    ccRouting.emitir(tenantKey, 'supervisores', 'cc:cola_cambio', {});
  }
  return it.id;
}

module.exports = { ingestarMensajeCliente, obtenerOCrearInteraccion, guardarMedia };
