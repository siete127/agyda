const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.create = async (req, res) => {
  try {
    const { opoId, tipo, descripcion, fechaDue, asignadoA, creadoPor } = req.body;
    if (!opoId || !tipo) return res.status(400).json({ success: false, message: 'opoId y tipo requeridos' });
    const tiposValidos = ['llamada','email','reunion','nota','tarea'];
    const tipoVal = tiposValidos.includes(tipo) ? tipo : 'tarea';
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('opoId',      sql.Int,      opoId)
      .input('tipo',       sql.NVarChar, tipoVal)
      .input('descripcion',sql.NVarChar, descripcion || null)
      .input('fechaDue',   sql.DateTime, fechaDue || null)
      .input('asignadoA',  sql.Int,      asignadoA || null)
      .input('creadoPor',  sql.Int,      creadoPor || null)
      .query(`
        INSERT INTO CRM_ACTIVIDADES (ACT_OPO_ID,ACT_TIPO,ACT_DESCRIPCION,ACT_FECHA_DUE,ACT_ASIGNADO_A,ACT_CREADO_POR)
        VALUES (@opoId,@tipo,@descripcion,@fechaDue,@asignadoA,@creadoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { descripcion, fechaDue, asignadoA, completada } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',          sql.Int,      req.params.id)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('fechaDue',    sql.DateTime, fechaDue || null)
      .input('asignadoA',   sql.Int,      asignadoA || null)
      .input('completada',  sql.Bit,      completada ? 1 : 0)
      .input('fechaComp',   sql.DateTime, completada ? new Date() : null)
      .query(`
        UPDATE CRM_ACTIVIDADES SET
          ACT_DESCRIPCION=@descripcion, ACT_FECHA_DUE=@fechaDue,
          ACT_ASIGNADO_A=@asignadoA, ACT_COMPLETADA=@completada, ACT_FECHA_COMP=@fechaComp
        WHERE ACT_ID=@id
      `);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM CRM_ACTIVIDADES WHERE ACT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
