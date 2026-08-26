const sql = require('mssql');
const jwt = require('jsonwebtoken');
const databaseService = require('../services/databaseService');
const { htmlResponse } = require('../utils/helpers');

// Público, sin auth — el visitante llega aquí desde el link de baja incluido
// en el footer de cada correo de campaña (ver emailMarketingService.renderizarParaContacto).
// Token de vida larga (400 días) porque un correo puede quedarse sin abrir en
// una bandeja de entrada meses — el link debe seguir funcionando entonces.
// payload.tenantKey identifica en qué base de datos vive el contacto — sin
// esto, la baja se aplicaría siempre contra el tenant default sin importar
// de qué empresa era realmente el contacto.
exports.darDeBaja = async (req, res) => {
  const { token } = req.query;
  try {
    const secret = process.env.JWT_SECRET || 'AKOLATRONIC';
    const payload = jwt.verify(String(token || ''), secret);
    if (!payload || payload.tipo !== 'baja_email' || !payload.contactoId) {
      return res.status(400).send(htmlResponse('Enlace inválido', 'Este enlace de baja no es válido.', false));
    }

    const pool = await databaseService.getPool(payload.tenantKey);
    const upd = await pool.request()
      .input('id', sql.Int, payload.contactoId)
      .query(`
        UPDATE dbo.CRM_CONTACTOS
        SET CONT_EMAIL_BAJA = 1, CONT_EMAIL_BAJA_FECHA = GETDATE()
        OUTPUT INSERTED.CONT_ID
        WHERE CONT_ID = @id
      `);

    if (upd.recordset.length === 0) {
      return res.status(404).send(htmlResponse('No encontrado', 'No se encontró el contacto asociado a este enlace.', false));
    }

    return res.status(200).send(htmlResponse(
      'Baja confirmada',
      'Ya no recibirás más correos de nuestras campañas de email. Si fue un error, contáctanos directamente.',
      true,
    ));
  } catch (err) {
    console.error('Error procesando baja de email:', err.message);
    return res.status(400).send(htmlResponse('Enlace inválido', 'Este enlace de baja no es válido o ya expiró.', false));
  }
};
