const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.getStatuses = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    // Map DB columns (clave, descripcion) to API fields (status_key, description)
    const result = await pool.request().query(`SELECT status_id as id, clave as status_key, descripcion as description FROM STATUS ORDER BY status_id`);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getStatuses:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo statuses' });
  }
};

exports.getStatusById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT status_id as id, clave as status_key, descripcion as description FROM STATUS WHERE status_id = @id');
    if (result.recordset.length === 0) return res.status(404).json({ success: false, message: 'Status no encontrado' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (e) {
    console.error('Error getStatusById:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo status' });
  }
};
