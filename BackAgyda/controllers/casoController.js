const sql = require('mssql');
const databaseService = require('../services/databaseService');

// "Caso" unificado (Fase 1 del rediseño de Atención al Cliente) — reemplaza
// gradualmente a Consulta/Aclaración/Queja/Incidencia. Este archivo arranca
// como placeholder de solo lectura mientras se migra el dato real (Fase 2) y
// se construye el CRUD completo (Fase 3), molde clienteIncidenciasController.js.

// GET /api/atencion-cliente/casos — lista simple, sin filtros todavía.
exports.list = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT TOP 50
        CASO_ID as id, CASO_FOLIO as folio, CASO_TIPO as tipo,
        CASO_CONTACTO_ID as contactoId, CASO_CLIENTE_NOMBRE_LIBRE as clienteNombreLibre,
        CASO_TITULO as titulo, CASO_ESTATUS as estatus, CASO_PRIORIDAD as prioridad,
        CASO_ORIGEN as origen, CASO_FECHA_CREACION as fechaCreacion,
        CASO_ORIGEN_TABLA as origenTabla, CASO_ORIGEN_ID as origenId
      FROM CASOS
      WHERE CASO_ACTIVO = 1
      ORDER BY CASO_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error list casos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
