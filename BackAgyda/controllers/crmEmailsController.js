const sql       = require('mssql');
const nodemailer = require('nodemailer');
const databaseService = require('../services/databaseService');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.send = async (req, res) => {
  try {
    const { opoId, contactoId, para, asunto, cuerpo } = req.body;
    const usuarioId     = req.user?.id;
    const usuarioNombre = req.user?.nombres || null;

    if (!para || !asunto || !cuerpo)
      return res.status(400).json({ success: false, message: 'para, asunto y cuerpo son requeridos' });

    let emailOk = true;
    let emailError = null;

    try {
      await transporter.sendMail({
        from:    `"Ardabytec CRM" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to:      para,
        subject: asunto,
        html:    cuerpo.replace(/\n/g, '<br>'),
      });
    } catch (sendErr) {
      emailOk    = false;
      emailError = sendErr.message;
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('opoId',    sql.Int,              opoId || null)
      .input('contId',   sql.Int,              contactoId || null)
      .input('para',     sql.NVarChar,         para)
      .input('asunto',   sql.NVarChar,         asunto)
      .input('cuerpo',   sql.NVarChar(sql.MAX), cuerpo)
      .input('uid',      sql.Int,              usuarioId || null)
      .input('uNombre',  sql.NVarChar,         usuarioNombre)
      .input('ok',       sql.Bit,              emailOk ? 1 : 0)
      .input('err',      sql.NVarChar,         emailError)
      .query(`
        INSERT INTO CRM_EMAILS
          (EMAIL_OPO_ID,EMAIL_CONTACTO_ID,EMAIL_PARA,EMAIL_ASUNTO,EMAIL_CUERPO,EMAIL_ENVIADO_POR,EMAIL_USUARIO_NOMBRE,EMAIL_OK,EMAIL_ERROR)
        VALUES (@opoId,@contId,@para,@asunto,@cuerpo,@uid,@uNombre,@ok,@err)
      `);

    if (opoId && emailOk) {
      await pool.request()
        .input('opoId',   sql.Int,      opoId)
        .input('uId',     sql.Int,      usuarioId || null)
        .input('uNombre', sql.NVarChar, usuarioNombre)
        .input('content', sql.NVarChar, `Email enviado a ${para}: ${asunto}`)
        .query(`
          INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_ID,INT_USUARIO_NOMBRE)
          VALUES (@opoId,'email',@content,@uId,@uNombre)
        `);
    }

    if (!emailOk) return res.status(500).json({ success: false, message: emailError });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getByOpo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, req.params.opoId)
      .query(`
        SELECT EMAIL_ID as id, EMAIL_PARA as para, EMAIL_ASUNTO as asunto,
               EMAIL_USUARIO_NOMBRE as usuarioNombre, EMAIL_FECHA as fecha, EMAIL_OK as ok
        FROM CRM_EMAILS WHERE EMAIL_OPO_ID=@id ORDER BY EMAIL_FECHA DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
