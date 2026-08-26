const sql = require('mssql');
const databaseService = require('../services/databaseService');
const dbVentas = require('../config/database_ventas');
const { logAudit } = require('../services/auditService');

// Pool separado hacia la BD del sistema Ventas (plata_prospectPRO) — mismo
// patrón que ventasController.getVentasPool(), duplicado aquí a propósito
// para no acoplar este controller a las rutas/middlewares de Ventas.
let _ventasPool = null;
async function getVentasPool() {
  if (_ventasPool && _ventasPool.connected) return _ventasPool;
  _ventasPool = await new sql.ConnectionPool(dbVentas).connect();
  return _ventasPool;
}

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// Catálogo de campañas activas — se jala en vivo del sistema Ventas, nunca
// se cachea en AGYDA (evita que quede desactualizado si Ventas crea/renombra).
exports.listCampanasDisponibles = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const result = await pool.request().query(
      `SELECT id, nombre, color FROM [Campanas] WHERE activo = 1 ORDER BY nombre`
    );
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listCampanasDisponibles:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Campaña asignada por agente — todos los agentes CC con su campaña actual
// (si tienen una asignada). LEFT JOIN para incluir agentes sin asignación.
exports.listAgentesCampanas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT u.NEUS_ID as neusId, u.NEUS_NOMBRES as nombre,
             a.ACA_VENTAS_CAMPANA_ID as campanaId, a.ACA_VENTAS_CAMPANA_NOMBRE as campanaNombre,
             a.ACA_FECHA_ASIGNACION as fechaAsignacion
      FROM NEUS_USUARIOS u
      LEFT JOIN AC_CAMPANIAS_AGENTES a ON a.ACA_NEUS_ID = u.NEUS_ID
      WHERE u.NEUS_TIPOUSUARIO = 'CC' AND u.NEUS_ACTIVO = 1
      ORDER BY u.NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listAgentesCampanas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getAgenteCampana = async (req, res) => {
  try {
    const neusId = parseInt(req.params.neusId, 10);
    if (!Number.isFinite(neusId)) return res.status(400).json({ success: false, message: 'neusId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, neusId)
      .query(`
        SELECT ACA_VENTAS_CAMPANA_ID as campanaId, ACA_VENTAS_CAMPANA_NOMBRE as campanaNombre, ACA_FECHA_ASIGNACION as fechaAsignacion
        FROM AC_CAMPANIAS_AGENTES WHERE ACA_NEUS_ID = @id
      `);
    res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    console.error('Error getAgenteCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Asigna/reemplaza la campaña de un agente. Body: { campanaId, campanaNombre }
// — el nombre se manda desde el frontend (viene del mismo catálogo que se
// listó en listCampanasDisponibles) para no depender de una segunda consulta
// a Ventas en cada guardado.
exports.setAgenteCampana = async (req, res) => {
  try {
    const neusId = parseInt(req.params.neusId, 10);
    if (!Number.isFinite(neusId)) return res.status(400).json({ success: false, message: 'neusId inválido' });

    const { campanaId, campanaNombre } = req.body || {};
    if (!campanaId || !campanaNombre) return res.status(400).json({ success: false, message: 'campanaId y campanaNombre requeridos' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const usuario = await pool.request()
      .input('id', sql.Int, neusId)
      .query(`SELECT TOP 1 NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_ID=@id AND NEUS_ACTIVO=1`);
    if (!usuario.recordset.length) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('campanaId', sql.Int, Number(campanaId))
      .input('campanaNombre', sql.NVarChar(200), String(campanaNombre))
      .input('asignadoPor', sql.Int, getUserId(req))
      .query(`
        MERGE AC_CAMPANIAS_AGENTES AS target
        USING (SELECT @neusId AS neusId) AS src ON target.ACA_NEUS_ID = src.neusId
        WHEN MATCHED THEN
          UPDATE SET ACA_VENTAS_CAMPANA_ID=@campanaId, ACA_VENTAS_CAMPANA_NOMBRE=@campanaNombre,
                     ACA_ASIGNADO_POR=@asignadoPor, ACA_FECHA_ASIGNACION=GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (ACA_NEUS_ID, ACA_VENTAS_CAMPANA_ID, ACA_VENTAS_CAMPANA_NOMBRE, ACA_ASIGNADO_POR)
          VALUES (@neusId, @campanaId, @campanaNombre, @asignadoPor);
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'asignar-campana-agente',
      entidadId: neusId, detalle: { campanaId, campanaNombre }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error setAgenteCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteAgenteCampana = async (req, res) => {
  try {
    const neusId = parseInt(req.params.neusId, 10);
    if (!Number.isFinite(neusId)) return res.status(400).json({ success: false, message: 'neusId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, neusId)
      .query(`DELETE FROM AC_CAMPANIAS_AGENTES WHERE ACA_NEUS_ID=@id`);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'quitar-campana-agente', entidadId: neusId, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleteAgenteCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
