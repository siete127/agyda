const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.update = async (req, res) => {
  try {
    const { contenido } = req.body;
    if (!contenido?.trim()) return res.status(400).json({ success: false, message: 'contenido requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',       sql.Int,              req.params.id)
      .input('contenido', sql.NVarChar(sql.MAX), contenido.trim())
      .query(`UPDATE CRM_INTERACCIONES SET INT_CONTENIDO=@contenido WHERE INT_ID=@id`);
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
      .query(`DELETE FROM CRM_INTERACCIONES WHERE INT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { opoId, tipo, contenido, usuarioId, usuarioNombre } = req.body;
    if (!opoId || !tipo) return res.status(400).json({ success: false, message: 'opoId y tipo requeridos' });
    const tiposValidos = ['nota','llamada','email','reunion','cambio_etapa','creacion'];
    const tipoVal = tiposValidos.includes(tipo) ? tipo : 'nota';
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('opoId',     sql.Int,      opoId)
      .input('tipo',      sql.NVarChar, tipoVal)
      .input('contenido', sql.NVarChar(sql.MAX), contenido || null)
      .input('uId',       sql.Int,      usuarioId || null)
      .input('uNombre',   sql.NVarChar, usuarioNombre || null)
      .query(`
        INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_ID,INT_USUARIO_NOMBRE)
        VALUES (@opoId,@tipo,@contenido,@uId,@uNombre);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
