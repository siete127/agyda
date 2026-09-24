const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const { invalidatePortalRolCache } = require('../middleware/portalCliente');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://intranet.ardabytec.vip:8444';

// Gestión de usuarios del Portal de Cliente de LA PROPIA empresa
// (req.contacto.id, el contacto ancla resuelto por requirePortalCliente).
// Todas las queries filtran por PU_CONT_ID = req.contacto.id para que un
// Admin nunca pueda ver/tocar usuarios de otra empresa cliente.

// Sub-roles activos disponibles para asignar a un usuario nuevo/existente de
// la empresa — cualquier sub-rol con gestionar-usuarios puede consultarlos.
exports.listarSubrolesDisponibles = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`SELECT ROL_ID as id, NOMBRE as nombre FROM PORTAL_ROLES WHERE ACTIVO=1 ORDER BY ES_SISTEMA DESC, NOMBRE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando sub-roles disponibles:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listar = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('contId', sql.Int, req.contacto.id)
      .query(`
        SELECT pu.PU_ID as id, pu.PU_NEUS_ID as neusId, pu.PU_ES_ANCLA as esAncla, pu.PU_ACTIVO as activo,
               pu.PU_CREADO_EN as creadoEn, nu.NEUS_NOMBRES as nombre, nu.NEUS_USUARIO as usuario, nu.NEUS_ACTIVO as loginActivo,
               r.ROL_ID as subrolId, r.NOMBRE as subrolNombre
        FROM PORTAL_USUARIOS pu
        JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = pu.PU_NEUS_ID
        JOIN PORTAL_ROLES r ON r.ROL_ID = pu.PU_SUBROL_ID
        WHERE pu.PU_CONT_ID = @contId
        ORDER BY pu.PU_ES_ANCLA DESC, nu.NEUS_NOMBRES ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando usuarios del portal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const { nombre, correo, password, subrolId } = req.body || {};
    if (!nombre || !correo || !subrolId) {
      return res.status(400).json({ success: false, message: 'Faltan nombre, correo o sub-rol' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const rolRs = await pool.request().input('id', sql.Int, subrolId).query(`SELECT ROL_ID, NOMBRE FROM PORTAL_ROLES WHERE ROL_ID=@id AND ACTIVO=1`);
    if (!rolRs.recordset[0]) return res.status(400).json({ success: false, message: 'Sub-rol inválido' });

    const yaExiste = await pool.request().input('correo', sql.NVarChar, correo).query(`SELECT NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_USUARIO=@correo`);
    if (yaExiste.recordset[0]) return res.status(409).json({ success: false, message: 'Ya existe un usuario con ese correo' });

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      const neusContra = password ? String(password) : Math.random().toString(36).slice(-10);
      const insUser = await transaction.request()
        .input('nombre', sql.NVarChar, nombre)
        .input('usuario', sql.NVarChar, correo)
        .input('contra', sql.NVarChar, neusContra)
        .query(`
          INSERT INTO NEUS_USUARIOS (NEUS_NOMBRES, NEUS_USUARIO, NEUS_CONTRA, NEUS_TIPOUSUARIO, NEUS_ACTIVO, NEUS_STATUS, NEUS_BASE, NEUS_FECHA_REGISTRO)
          VALUES (@nombre, @usuario, @contra, 'CL', 1, 1, '1', GETDATE());
          SELECT SCOPE_IDENTITY() as id;
        `);
      const neusId = insUser.recordset[0].id;

      await transaction.request()
        .input('neusId', sql.Int, neusId)
        .input('contId', sql.Int, req.contacto.id)
        .input('subrolId', sql.Int, subrolId)
        .input('creadoPor', sql.Int, req.user.id)
        .query(`
          INSERT INTO PORTAL_USUARIOS (PU_NEUS_ID, PU_CONT_ID, PU_SUBROL_ID, PU_ES_ANCLA, PU_ACTIVO, PU_CREADO_POR)
          VALUES (@neusId, @contId, @subrolId, 0, 1, @creadoPor)
        `);

      await transaction.commit();

      emailService.sendInvitacionAccesoSistemaEmail({
        nombre,
        correo,
        usuario: correo,
        password: password || neusContra,
        link: `${BASE_URL}/login`,
      }).catch(() => {});

      res.status(201).json({ success: true, data: { neusId } });
    } catch (txErr) {
      try { await transaction.rollback(); } catch (e) {}
      throw txErr;
    }
  } catch (e) {
    console.error('Error creando usuario del portal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID inválido' });

    const { subrolId, activo } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    const puRs = await pool.request()
      .input('id', sql.Int, id)
      .input('contId', sql.Int, req.contacto.id)
      .query(`SELECT PU_ID, PU_NEUS_ID, PU_ES_ANCLA, PU_SUBROL_ID FROM PORTAL_USUARIOS WHERE PU_ID=@id AND PU_CONT_ID=@contId`);
    const pu = puRs.recordset[0];
    if (!pu) return res.status(404).json({ success: false, message: 'Usuario no encontrado en tu empresa' });

    // No permitir desactivar al único Admin activo de la empresa.
    if (activo === false) {
      const rolActualRs = await pool.request().input('id', sql.Int, pu.PU_SUBROL_ID).query(`SELECT NOMBRE FROM PORTAL_ROLES WHERE ROL_ID=@id`);
      const esAdmin = rolActualRs.recordset[0]?.NOMBRE === 'Admin';
      if (esAdmin) {
        const adminsActivos = await pool.request()
          .input('contId', sql.Int, req.contacto.id)
          .query(`
            SELECT COUNT(*) as n FROM PORTAL_USUARIOS pu
            JOIN PORTAL_ROLES r ON r.ROL_ID = pu.PU_SUBROL_ID
            WHERE pu.PU_CONT_ID=@contId AND pu.PU_ACTIVO=1 AND r.NOMBRE='Admin'
          `);
        if ((adminsActivos.recordset[0]?.n || 0) <= 1) {
          return res.status(409).json({ success: false, message: 'No puedes desactivar al único Admin activo de tu empresa' });
        }
      }
    }

    if (subrolId !== undefined) {
      const rolRs = await pool.request().input('id', sql.Int, subrolId).query(`SELECT ROL_ID FROM PORTAL_ROLES WHERE ROL_ID=@id AND ACTIVO=1`);
      if (!rolRs.recordset[0]) return res.status(400).json({ success: false, message: 'Sub-rol inválido' });
      await pool.request().input('id', sql.Int, id).input('subrolId', sql.Int, subrolId).query(`UPDATE PORTAL_USUARIOS SET PU_SUBROL_ID=@subrolId WHERE PU_ID=@id`);
    }
    if (activo !== undefined) {
      await pool.request().input('id', sql.Int, id).input('activo', sql.Bit, activo ? 1 : 0).query(`UPDATE PORTAL_USUARIOS SET PU_ACTIVO=@activo WHERE PU_ID=@id`);
      await pool.request().input('neusId', sql.Int, pu.PU_NEUS_ID).input('activo', sql.Bit, activo ? 1 : 0).query(`UPDATE NEUS_USUARIOS SET NEUS_ACTIVO=@activo WHERE NEUS_ID=@neusId`);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando usuario del portal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.eliminar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const puRs = await pool.request()
      .input('id', sql.Int, id)
      .input('contId', sql.Int, req.contacto.id)
      .query(`SELECT PU_ID, PU_NEUS_ID, PU_ES_ANCLA FROM PORTAL_USUARIOS WHERE PU_ID=@id AND PU_CONT_ID=@contId`);
    const pu = puRs.recordset[0];
    if (!pu) return res.status(404).json({ success: false, message: 'Usuario no encontrado en tu empresa' });
    if (pu.PU_ES_ANCLA) return res.status(409).json({ success: false, message: 'No se puede eliminar al usuario ancla de la empresa' });

    await pool.request().input('id', sql.Int, id).query(`UPDATE PORTAL_USUARIOS SET PU_ACTIVO=0 WHERE PU_ID=@id`);
    await pool.request().input('neusId', sql.Int, pu.PU_NEUS_ID).query(`UPDATE NEUS_USUARIOS SET NEUS_ACTIVO=0 WHERE NEUS_ID=@neusId`);

    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando usuario del portal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
