const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const emailService = require('../services/emailService');
const crmWhatsappService = require('../services/crmWhatsappService');

// Ofertas a segmento de clientes (CRM Cliente — Fase 8). Campaña simple:
// mensaje + segmento (tags / estatus / tipo de cliente) → envío por correo +
// WhatsApp con registro de cada envío. Respeta CONT_EMAIL_BAJA. Throttle entre
// envíos para no gatillar bloqueos.

const CANALES_VALIDOS = ['correo', 'whatsapp'];
const THROTTLE_MS = 400; // pausa entre contactos

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// Construye el WHERE del segmento contra CRM_CONTACTOS. Devuelve { where, inputs }.
// segmento: { tags?: string[], estatus?: string[], tipoCliente?: string[], soloClientes?: boolean }
function construirSegmento(segmento) {
  const cond = ['C.CONT_ACTIVO = 1'];
  const inputs = [];
  const s = segmento || {};

  if (s.soloClientes !== false) cond.push('C.CONT_ES_CLIENTE = 1');

  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
  const tags = arr(s.tags);
  const estatus = arr(s.estatus);
  const tipos = arr(s.tipoCliente);

  if (tags.length) {
    // CONT_TAGS es CSV; match por LIKE con separadores.
    const ors = tags.map((t, i) => {
      const key = `tag${i}`;
      inputs.push({ key, type: sql.NVarChar, value: `%${t}%` });
      return `(',' + REPLACE(ISNULL(C.CONT_TAGS,''), ' ', '') + ',') LIKE ('%,' + REPLACE(@${key}, '%', '') + ',%') OR C.CONT_TAGS LIKE @${key}`;
    });
    cond.push(`(${ors.join(' OR ')})`);
  }
  if (estatus.length) {
    const keys = estatus.map((e, i) => { const k = `est${i}`; inputs.push({ key: k, type: sql.NVarChar, value: e }); return `@${k}`; });
    cond.push(`C.CONT_ESTATUS_CLIENTE IN (${keys.join(',')})`);
  }
  if (tipos.length) {
    const keys = tipos.map((t, i) => { const k = `tip${i}`; inputs.push({ key: k, type: sql.NVarChar, value: t }); return `@${k}`; });
    cond.push(`C.CONT_TIPO_CLIENTE IN (${keys.join(',')})`);
  }

  return { where: cond.join(' AND '), inputs };
}

exports.list = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT O.OF_ID as id, O.OF_TITULO as titulo, O.OF_MENSAJE as mensaje,
             O.OF_SEGMENTO_JSON as segmentoJson, O.OF_CANALES as canales, O.OF_ESTATUS as estatus,
             O.OF_FECHA_CREACION as fechaCreacion, O.OF_FECHA_ENVIO as fechaEnvio,
             U.NEUS_NOMBRES as creadaPorNombre,
             (SELECT COUNT(*) FROM CRM_OFERTAS_ENVIOS WHERE OE_OFERTA_ID=O.OF_ID AND OE_RESULTADO='enviado') as enviosOk,
             (SELECT COUNT(*) FROM CRM_OFERTAS_ENVIOS WHERE OE_OFERTA_ID=O.OF_ID AND OE_RESULTADO='fallido') as enviosFallidos
      FROM CRM_OFERTAS O
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = O.OF_CREADA_POR
      ORDER BY O.OF_FECHA_CREACION DESC
    `);
    const data = rs.recordset.map((o) => ({ ...o, segmento: o.segmentoJson ? JSON.parse(o.segmentoJson) : null }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error list ofertas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.previewSegmento = async (req, res) => {
  try {
    const { segmento } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const { where, inputs } = construirSegmento(segmento);
    const request = pool.request();
    for (const i of inputs) request.input(i.key, i.type, i.value);
    const rs = await request.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN C.CONT_CORREO IS NOT NULL AND C.CONT_CORREO <> '' AND (C.CONT_EMAIL_BAJA IS NULL OR C.CONT_EMAIL_BAJA = 0) THEN 1 ELSE 0 END) as conCorreo,
        SUM(CASE WHEN C.CONT_TELEFONO IS NOT NULL AND C.CONT_TELEFONO <> '' THEN 1 ELSE 0 END) as conTelefono
      FROM CRM_CONTACTOS C WHERE ${where}
    `);
    res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error previewSegmento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { titulo, mensaje, segmento, canales } = req.body || {};
    if (!titulo || !String(titulo).trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ success: false, message: 'Mensaje requerido' });
    const cxs = Array.isArray(canales) ? canales.filter((c) => CANALES_VALIDOS.includes(c)) : ['correo'];
    if (!cxs.length) return res.status(400).json({ success: false, message: 'Elige al menos un canal' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('titulo', sql.NVarChar(200), String(titulo).trim())
      .input('mensaje', sql.NVarChar(sql.MAX), String(mensaje).trim())
      .input('seg', sql.NVarChar(sql.MAX), segmento ? JSON.stringify(segmento) : null)
      .input('canales', sql.NVarChar(60), cxs.join(','))
      .input('creadaPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CRM_OFERTAS (OF_TITULO, OF_MENSAJE, OF_SEGMENTO_JSON, OF_CANALES, OF_CREADA_POR)
        OUTPUT INSERTED.OF_ID
        VALUES (@titulo, @mensaje, @seg, @canales, @creadaPor)
      `);
    res.status(201).json({ success: true, data: { id: rs.recordset[0].OF_ID } });
  } catch (e) {
    console.error('Error create oferta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.enviar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const oferta = (await pool.request().input('id', sql.Int, id)
      .query(`SELECT OF_TITULO as titulo, OF_MENSAJE as mensaje, OF_SEGMENTO_JSON as segmentoJson,
              OF_CANALES as canales, OF_ESTATUS as estatus FROM CRM_OFERTAS WHERE OF_ID=@id`)).recordset[0];
    if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada' });
    if (oferta.estatus === 'enviada') return res.status(409).json({ success: false, message: 'Esta oferta ya se envió' });

    const canales = String(oferta.canales || 'correo').split(',');
    const segmento = oferta.segmentoJson ? JSON.parse(oferta.segmentoJson) : null;
    const { where, inputs } = construirSegmento(segmento);
    const request = pool.request();
    for (const i of inputs) request.input(i.key, i.type, i.value);
    const contactos = (await request.query(`
      SELECT C.CONT_ID as id, C.CONT_NOMBRE as nombre, C.CONT_CORREO as correo,
             C.CONT_TELEFONO as telefono, C.CONT_EMAIL_BAJA as emailBaja
      FROM CRM_CONTACTOS C WHERE ${where}
    `)).recordset;

    let enviados = 0, fallidos = 0;
    const registrar = async (contactoId, canal, resultado, detalle) => {
      try {
        await pool.request()
          .input('o', sql.Int, id).input('c', sql.Int, contactoId)
          .input('canal', sql.NVarChar(20), canal).input('r', sql.NVarChar(20), resultado)
          .input('d', sql.NVarChar(300), detalle || null)
          .query(`INSERT INTO CRM_OFERTAS_ENVIOS (OE_OFERTA_ID, OE_CONTACTO_ID, OE_CANAL, OE_RESULTADO, OE_DETALLE)
                  VALUES (@o, @c, @canal, @r, @d)`);
      } catch (e) { console.warn('[oferta] registrar envío:', e.message); }
    };

    const htmlOferta = emailService._ofertaHtml
      ? emailService._ofertaHtml(oferta.titulo, oferta.mensaje)
      : `<p>${String(oferta.mensaje).replace(/\n/g, '<br>')}</p>`;

    for (const c of contactos) {
      if (canales.includes('correo') && c.correo && !c.emailBaja) {
        const r = await emailService.sendCorreoGenerico({
          to: c.correo, subject: oferta.titulo, html: htmlOferta, text: oferta.mensaje,
        });
        if (r?.success) { enviados++; await registrar(c.id, 'correo', 'enviado'); }
        else { fallidos++; await registrar(c.id, 'correo', 'fallido', r?.message); }
      }
      if (canales.includes('whatsapp') && c.telefono) {
        const r = await crmWhatsappService.enviarTexto(pool, req.user?.empresa, c.telefono,
          `${oferta.titulo}\n\n${oferta.mensaje}`);
        if (r.ok) { enviados++; await registrar(c.id, 'whatsapp', 'enviado', r.canal); }
        else { fallidos++; await registrar(c.id, 'whatsapp', 'fallido', r.error); }
      }
      await new Promise((res) => setTimeout(res, THROTTLE_MS));
    }

    await pool.request().input('id', sql.Int, id)
      .query(`UPDATE CRM_OFERTAS SET OF_ESTATUS='enviada', OF_FECHA_ENVIO=GETDATE() WHERE OF_ID=@id`);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'enviar-oferta', entidadId: id,
      detalle: { contactos: contactos.length, enviados, fallidos }, ip: req.ip,
    });

    res.json({ success: true, data: { contactos: contactos.length, enviados, fallidos } });
  } catch (e) {
    console.error('Error enviar oferta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getEnvios = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT E.OE_ID as id, E.OE_CANAL as canal, E.OE_RESULTADO as resultado, E.OE_DETALLE as detalle, E.OE_FECHA as fecha,
             C.CONT_NOMBRE as contactoNombre
      FROM CRM_OFERTAS_ENVIOS E
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = E.OE_CONTACTO_ID
      WHERE E.OE_OFERTA_ID=@id ORDER BY E.OE_FECHA ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error getEnvios oferta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
