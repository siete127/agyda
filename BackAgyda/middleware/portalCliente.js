const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Resuelve el CRM_CONTACTOS del usuario CL logueado (req.user.id = NEUS_ID,
// puesto por authenticateToken) y lo deja en req.contacto — equivalente a
// resolverToken() de crmPortalController.js, pero por login real en vez de
// un token de liga. Se monta después de authenticateToken en toda ruta del
// portal-cliente basado en sesión.
async function requirePortalCliente(req, res, next) {
  try {
    if (req.user?.tipoUsuario !== 'CL') {
      return res.status(403).json({ success: false, message: 'Acceso exclusivo del portal de cliente' });
    }
    const pool = await databaseService.getPool(req.user.empresa);
    const rs = await pool.request()
      .input('neusId', sql.Int, req.user.id)
      .query(`
        SELECT CONT_ID as id, CONT_NOMBRE as nombre, CONT_EMPRESA as empresa,
               CONT_CORREO as correo, CONT_ES_CLIENTE as esCliente
        FROM CRM_CONTACTOS WHERE CONT_NEUS_ID=@neusId AND CONT_ACTIVO=1
      `);
    if (!rs.recordset[0]) {
      return res.status(404).json({ success: false, message: 'No hay un contacto vinculado a este usuario' });
    }
    req.contacto = { ...rs.recordset[0], esCliente: !!rs.recordset[0].esCliente };
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { requirePortalCliente };
