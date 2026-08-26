const sql       = require('mssql');
const crypto    = require('crypto');
const nodemailer = require('nodemailer');
const databaseService = require('../services/databaseService');
const { sanitizeFilename, decryptBuffer } = require('../utils/cryptoDocs');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://intranet.ardabytec.vip:8444';

// Admin: enviar invitación de acceso al portal a un contacto
exports.invitar = async (req, res) => {
  try {
    const { contactoId } = req.body;
    if (!contactoId) return res.status(400).json({ success: false, message: 'contactoId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const cont = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_NOMBRE as nombre, CONT_CORREO as correo FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);

    if (!cont.recordset[0]) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    const { nombre, correo } = cont.recordset[0];
    if (!correo) return res.status(400).json({ success: false, message: 'El contacto no tiene correo registrado' });

    const token  = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    // Desactivar tokens anteriores
    await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`UPDATE CRM_PORTAL_TOKENS SET PT_ACTIVO=0 WHERE PT_CONTACTO_ID=@id`);

    await pool.request()
      .input('cid',    sql.Int,      contactoId)
      .input('token',  sql.NVarChar, token)
      .input('email',  sql.NVarChar, correo)
      .input('expira', sql.DateTime, expira)
      .query(`INSERT INTO CRM_PORTAL_TOKENS (PT_CONTACTO_ID,PT_TOKEN,PT_EMAIL,PT_EXPIRA) VALUES (@cid,@token,@email,@expira)`);

    const link = `${BASE_URL}/portal?token=${token}`;
    await transporter.sendMail({
      from:    `"Ardabytec" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:      correo,
      subject: 'Tu acceso al portal de seguimiento',
      html: `
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Te invitamos a revisar el estado de tus proyectos en nuestro portal:</p>
        <p><a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ver mi portal</a></p>
        <p style="color:#888;font-size:12px">Este enlace es válido por 30 días.</p>
      `,
    });

    res.json({ success: true, message: `Invitación enviada a ${correo}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Portal: validar token y obtener datos del contacto + sus oportunidades
exports.getPortal = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tkRow = await pool.request()
      .input('token', sql.NVarChar, token)
      .query(`
        SELECT pt.PT_CONTACTO_ID as contactoId, pt.PT_EMAIL as email, pt.PT_EXPIRA as expira
        FROM CRM_PORTAL_TOKENS pt
        WHERE pt.PT_TOKEN=@token AND pt.PT_ACTIVO=1
      `);

    if (!tkRow.recordset[0]) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });
    const { contactoId, email, expira } = tkRow.recordset[0];
    if (expira && new Date(expira) < new Date())
      return res.status(401).json({ success: false, message: 'Enlace expirado' });

    const cont = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_NOMBRE as nombre, CONT_EMPRESA as empresa FROM CRM_CONTACTOS WHERE CONT_ID=@id`);

    const opos = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT
          o.OPO_ID as id, o.OPO_NOMBRE as nombre, o.OPO_ETAPA as etapa,
          o.OPO_VALOR as valor,
          CONVERT(NVARCHAR(10), o.OPO_FECHA_CIERRE, 23) as fechaCierre,
          o.OPO_NOTAS as notas,
          u.NEUS_NOMBRES as responsable,
          (SELECT COUNT(*) FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID=o.OPO_ID AND ACT_COMPLETADA=0) as pendientes,
          (SELECT COUNT(*) FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID=o.OPO_ID AND ACT_COMPLETADA=1) as completadas
        FROM CRM_OPORTUNIDADES o
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
        WHERE o.OPO_CONTACTO_ID=@id AND o.OPO_ACTIVO=1
        ORDER BY o.OPO_FECHA DESC
      `);

    const interacciones = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT i.INT_ID as id, i.INT_OPO_ID as opoId, o.OPO_NOMBRE as opoNombre,
               i.INT_TIPO as tipo, i.INT_CONTENIDO as contenido,
               i.INT_USUARIO_NOMBRE as usuarioNombre, i.INT_FECHA as fecha
        FROM CRM_INTERACCIONES i
        JOIN CRM_OPORTUNIDADES o ON o.OPO_ID=i.INT_OPO_ID AND o.OPO_CONTACTO_ID=@id
        WHERE o.OPO_ACTIVO=1 AND i.INT_TIPO NOT IN ('creacion')
        ORDER BY i.INT_FECHA DESC
      `);

    // Para cada oportunidad, traer cotizaciones enviadas/aprobadas/rechazadas
    const oposConCots = opos.recordset;
    for (const opo of oposConCots) {
      const cots = await pool.request()
        .input('opoId', sql.Int, opo.id)
        .query(`SELECT COT_ID as id, COT_FOLIO as folio, COT_TITULO as titulo, COT_ESTATUS as estatus, COT_TOTAL as total FROM CRM_COTIZACIONES WHERE COT_OPO_ID=@opoId AND COT_ACTIVO=1 AND COT_ESTATUS IN ('enviada','aprobada','rechazada') ORDER BY COT_FECHA_REGISTRO DESC`);
      opo.cotizaciones = cots.recordset;
    }

    const documentos = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT DOC_ID as id, DOC_NOMBRE_ORIGINAL as nombreOriginal, DOC_MIME_TYPE as mimeType,
               DOC_TAMANO_BYTES as tamanoBytes, DOC_FECHA_SUBIDA as fechaSubida
        FROM CRM_DOCUMENTOS_CLIENTE
        WHERE DOC_CONTACTO_ID=@id AND DOC_VISIBLE_PORTAL=1 AND DOC_ACTIVO=1
        ORDER BY DOC_FECHA_SUBIDA DESC
      `);

    res.json({
      success: true,
      data: {
        contacto:      { ...cont.recordset[0], email },
        oportunidades: oposConCots,
        interacciones: interacciones.recordset,
        documentos:    documentos.recordset,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Portal: descarga de documento del cliente, validando token igual que getPortal
exports.downloadDocumentoPortal = async (req, res) => {
  try {
    const { token } = req.query;
    const docId = parseInt(req.params.docId, 10);
    if (!token) return res.status(400).json({ success: false, message: 'Token requerido' });
    if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tkRow = await pool.request()
      .input('token', sql.NVarChar, token)
      .query(`
        SELECT pt.PT_CONTACTO_ID as contactoId, pt.PT_EXPIRA as expira
        FROM CRM_PORTAL_TOKENS pt
        WHERE pt.PT_TOKEN=@token AND pt.PT_ACTIVO=1
      `);
    if (!tkRow.recordset[0]) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });
    const { contactoId, expira } = tkRow.recordset[0];
    if (expira && new Date(expira) < new Date())
      return res.status(401).json({ success: false, message: 'Enlace expirado' });

    const doc = await pool.request()
      .input('docId', sql.Int, docId)
      .input('contactoId', sql.Int, contactoId)
      .query(`
        SELECT TOP 1 DOC_NOMBRE_ORIGINAL, DOC_MIME_TYPE, DOC_ENC_IV, DOC_ENC_TAG, DOC_ENCRYPTED_DATA
        FROM CRM_DOCUMENTOS_CLIENTE
        WHERE DOC_ID=@docId AND DOC_CONTACTO_ID=@contactoId AND DOC_VISIBLE_PORTAL=1 AND DOC_ACTIVO=1
      `);
    if (!doc.recordset.length) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

    const row = doc.recordset[0];
    let decrypted;
    try {
      decrypted = decryptBuffer(row.DOC_ENCRYPTED_DATA, row.DOC_ENC_IV, row.DOC_ENC_TAG);
    } catch (err) {
      console.error('❌ Error descifrando documento portal CRM:', err);
      return res.status(500).json({ success: false, message: 'Error descifrando documento' });
    }

    const filename = sanitizeFilename(row.DOC_NOMBRE_ORIGINAL);
    res.setHeader('Content-Type', row.DOC_MIME_TYPE || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(decrypted);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
