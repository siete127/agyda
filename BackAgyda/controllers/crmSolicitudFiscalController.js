const sql = require('mssql');
const crypto = require('crypto');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const { REGIMENES_FISCALES, USOS_CFDI } = require('../constants/catalogosSat');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://intranet.ardabytec.vip:8444';

// Valida un token de solicitud fiscal y devuelve la fila o null (mismo
// patrón que resolverToken en crmPortalController).
async function resolverToken(pool, token) {
  if (!token) return null;
  const rs = await pool.request()
    .input('token', sql.NVarChar, token)
    .query(`
      SELECT SFT_ID as id, SFT_OPORTUNIDAD_ID as oportunidadId, SFT_EMAIL as email,
             SFT_EXPIRA as expira, SFT_COMPLETADO as completado
      FROM CRM_SOLICITUD_FISCAL_TOKENS WHERE SFT_TOKEN=@token AND SFT_ACTIVO=1
    `);
  const row = rs.recordset[0];
  if (!row) return null;
  if (row.expira && new Date(row.expira) < new Date()) return null;
  return row;
}

// Empleado: dispara desde el detalle de una Oportunidad el envío del link
// de captura de datos fiscales al cliente.
exports.solicitar = async (req, res) => {
  try {
    const opoId = parseInt(req.params.id, 10);
    if (!Number.isInteger(opoId) || opoId <= 0) {
      return res.status(400).json({ success: false, message: 'Oportunidad inválida' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const opoRs = await pool.request()
      .input('id', sql.Int, opoId)
      .query(`
        SELECT o.OPO_ID as id, o.OPO_NOMBRE as nombre, o.OPO_CLIENTE_ID as clienteId,
               c.CONT_NOMBRE as contactoNombre, c.CONT_EMPRESA as contactoEmpresa, c.CONT_CORREO as contactoCorreo
        FROM CRM_OPORTUNIDADES o
        LEFT JOIN CRM_CONTACTOS c ON c.CONT_ID = o.OPO_CONTACTO_ID
        WHERE o.OPO_ID=@id AND o.OPO_ACTIVO=1
      `);
    const opo = opoRs.recordset[0];
    if (!opo) return res.status(404).json({ success: false, message: 'Oportunidad no encontrada' });

    const correo = (req.body?.correo || opo.contactoCorreo || '').trim();
    if (!correo) return res.status(400).json({ success: false, message: 'No hay correo de contacto para enviar la solicitud' });

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 días

    // Desactivar tokens previos de esta oportunidad
    await pool.request()
      .input('opoId', sql.Int, opoId)
      .query(`UPDATE CRM_SOLICITUD_FISCAL_TOKENS SET SFT_ACTIVO=0 WHERE SFT_OPORTUNIDAD_ID=@opoId`);

    await pool.request()
      .input('opoId', sql.Int, opoId)
      .input('token', sql.NVarChar, token)
      .input('email', sql.NVarChar, correo)
      .input('expira', sql.DateTime, expira)
      .query(`INSERT INTO CRM_SOLICITUD_FISCAL_TOKENS (SFT_OPORTUNIDAD_ID, SFT_TOKEN, SFT_EMAIL, SFT_EXPIRA) VALUES (@opoId, @token, @email, @expira)`);

    const link = `${BASE_URL}/formulario-fiscal?token=${token}`;
    const nombre = opo.contactoNombre || opo.contactoEmpresa || '';
    await emailService.sendSolicitudDatosFiscalesEmail({ nombre, correo, link });

    res.json({ success: true, message: `Solicitud enviada a ${correo}` });
  } catch (e) {
    console.error('Error solicitando datos fiscales:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Público: valida el token y regresa los catálogos + datos precargados si
// el cliente ya existe (OPO_CLIENTE_ID ya vinculado).
exports.getDatos = async (req, res) => {
  try {
    const { token } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const tk = await resolverToken(pool, token);
    if (!tk) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });
    if (tk.completado) return res.status(409).json({ success: false, message: 'Esta solicitud ya fue completada' });

    const opoRs = await pool.request()
      .input('id', sql.Int, tk.oportunidadId)
      .query(`SELECT OPO_NOMBRE as nombre, OPO_CLIENTE_ID as clienteId FROM CRM_OPORTUNIDADES WHERE OPO_ID=@id`);
    const opo = opoRs.recordset[0];

    let cliente = null;
    if (opo?.clienteId) {
      const clRs = await pool.request()
        .input('id', sql.Int, opo.clienteId)
        .query(`
          SELECT CL_ID as id, CL_EMPRESA as empresa, CL_RFC as rfc, CL_RAZON_SOCIAL as razonSocial,
                 CL_REGIMEN_FISCAL as regimenFiscal, CL_USO_CFDI as usoCfdi, CL_CP as cp,
                 CL_CALLE as calle, CL_NUM_EXT as numExt, CL_NUM_INT as numInt, CL_COLONIA as colonia,
                 CL_CIUDAD as ciudad, CL_PAIS as pais, CL_CORREO_FACTURACION as correoFacturacion
          FROM CLIENTES WHERE CL_ID=@id
        `);
      cliente = clRs.recordset[0] || null;
    }

    res.json({
      success: true,
      data: {
        oportunidad: opo?.nombre || null,
        email: tk.email,
        cliente,
        catalogos: { regimenesFiscales: REGIMENES_FISCALES, usosCfdi: USOS_CFDI },
      },
    });
  } catch (e) {
    console.error('Error obteniendo datos de solicitud fiscal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Público: recibe el formulario y hace INSERT o UPDATE en CLIENTES según si
// la oportunidad ya tenía un cliente vinculado.
exports.enviar = async (req, res) => {
  try {
    const { token, empresa, rfc, razonSocial, regimenFiscal, usoCfdi, cp, calle, numExt, numInt, colonia, ciudad, pais, correoFacturacion } = req.body || {};

    if (!rfc || !razonSocial || !regimenFiscal || !usoCfdi || !cp) {
      return res.status(400).json({ success: false, message: 'Faltan datos fiscales obligatorios' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const tk = await resolverToken(pool, token);
    if (!tk) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });
    if (tk.completado) return res.status(409).json({ success: false, message: 'Esta solicitud ya fue completada' });

    const opoRs = await pool.request()
      .input('id', sql.Int, tk.oportunidadId)
      .query(`SELECT OPO_CLIENTE_ID as clienteId FROM CRM_OPORTUNIDADES WHERE OPO_ID=@id`);
    const opo = opoRs.recordset[0];

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      const campos = { empresa, rfc, razonSocial, regimenFiscal, usoCfdi, cp, calle, numExt, numInt, colonia, ciudad, pais, correoFacturacion: correoFacturacion || tk.email };
      let clienteId = opo?.clienteId || null;

      if (clienteId) {
        await transaction.request()
          .input('id', sql.Int, clienteId)
          .input('empresa', sql.NVarChar, campos.empresa || null)
          .input('rfc', sql.NVarChar, campos.rfc)
          .input('razonSocial', sql.NVarChar, campos.razonSocial)
          .input('regimenFiscal', sql.NVarChar, campos.regimenFiscal)
          .input('usoCfdi', sql.NVarChar, campos.usoCfdi)
          .input('cp', sql.NVarChar, campos.cp)
          .input('calle', sql.NVarChar, campos.calle || null)
          .input('numExt', sql.NVarChar, campos.numExt || null)
          .input('numInt', sql.NVarChar, campos.numInt || null)
          .input('colonia', sql.NVarChar, campos.colonia || null)
          .input('ciudad', sql.NVarChar, campos.ciudad || null)
          .input('pais', sql.NVarChar, campos.pais || null)
          .input('correoFacturacion', sql.NVarChar, campos.correoFacturacion)
          .query(`
            UPDATE CLIENTES SET
              CL_EMPRESA=ISNULL(@empresa, CL_EMPRESA), CL_RFC=@rfc, CL_RAZON_SOCIAL=@razonSocial,
              CL_REGIMEN_FISCAL=@regimenFiscal, CL_USO_CFDI=@usoCfdi, CL_CP=@cp,
              CL_CALLE=ISNULL(@calle, CL_CALLE), CL_NUM_EXT=ISNULL(@numExt, CL_NUM_EXT),
              CL_NUM_INT=ISNULL(@numInt, CL_NUM_INT), CL_COLONIA=ISNULL(@colonia, CL_COLONIA),
              CL_CIUDAD=ISNULL(@ciudad, CL_CIUDAD), CL_PAIS=ISNULL(@pais, CL_PAIS),
              CL_CORREO_FACTURACION=@correoFacturacion
            WHERE CL_ID=@id
          `);
      } else {
        const insRs = await transaction.request()
          .input('empresa', sql.NVarChar, campos.empresa || campos.razonSocial)
          .input('rfc', sql.NVarChar, campos.rfc)
          .input('razonSocial', sql.NVarChar, campos.razonSocial)
          .input('regimenFiscal', sql.NVarChar, campos.regimenFiscal)
          .input('usoCfdi', sql.NVarChar, campos.usoCfdi)
          .input('cp', sql.NVarChar, campos.cp)
          .input('calle', sql.NVarChar, campos.calle || null)
          .input('numExt', sql.NVarChar, campos.numExt || null)
          .input('numInt', sql.NVarChar, campos.numInt || null)
          .input('colonia', sql.NVarChar, campos.colonia || null)
          .input('ciudad', sql.NVarChar, campos.ciudad || null)
          .input('pais', sql.NVarChar, campos.pais || null)
          .input('correoFacturacion', sql.NVarChar, campos.correoFacturacion)
          .query(`
            INSERT INTO CLIENTES (CL_EMPRESA, CL_RFC, CL_RAZON_SOCIAL, CL_REGIMEN_FISCAL, CL_USO_CFDI, CL_CP,
              CL_CALLE, CL_NUM_EXT, CL_NUM_INT, CL_COLONIA, CL_CIUDAD, CL_PAIS, CL_CORREO_FACTURACION, CL_ACTIVO, CL_FECHA_REGISTRO)
            VALUES (@empresa, @rfc, @razonSocial, @regimenFiscal, @usoCfdi, @cp,
              @calle, @numExt, @numInt, @colonia, @ciudad, @pais, @correoFacturacion, 1, GETDATE());
            SELECT SCOPE_IDENTITY() as id;
          `);
        clienteId = insRs.recordset[0]?.id || null;

        await transaction.request()
          .input('opoId', sql.Int, tk.oportunidadId)
          .input('clienteId', sql.Int, clienteId)
          .query(`UPDATE CRM_OPORTUNIDADES SET OPO_CLIENTE_ID=@clienteId WHERE OPO_ID=@opoId`);
      }

      await transaction.request()
        .input('id', sql.Int, tk.id)
        .query(`UPDATE CRM_SOLICITUD_FISCAL_TOKENS SET SFT_COMPLETADO=1, SFT_FECHA_COMPLETADO=GETDATE(), SFT_ACTIVO=0 WHERE SFT_ID=@id`);

      await transaction.commit();
      res.json({ success: true, message: 'Datos fiscales recibidos correctamente', data: { clienteId } });
    } catch (txErr) {
      try { await transaction.rollback(); } catch (rErr) { /* ignore */ }
      throw txErr;
    }
  } catch (e) {
    console.error('Error guardando datos fiscales:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
