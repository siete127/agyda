const sql = require('mssql');
const databaseService = require('../services/databaseService');

// "Caso" unificado (Fase 1-2 del rediseño de Atención al Cliente) — reemplaza
// gradualmente a Consulta/Aclaración/Queja/Incidencia. Este archivo arranca
// como listado de solo lectura mientras se migra el dato real (Fase 2) y
// se construye el CRUD completo (Fase 3), molde clienteIncidenciasController.js.

// GET /api/atencion-cliente/casos?tipo=&estatus=
// Los filtros son para verificar la migración (Fase 2) — el CRUD completo con
// filtros de UI llega en Fase 3.
exports.list = async (req, res) => {
  try {
    const { tipo, estatus } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const cond = ['CASO_ACTIVO = 1'];
    if (tipo) { request.input('tipo', sql.NVarChar, tipo); cond.push('CASO_TIPO = @tipo'); }
    if (estatus) { request.input('estatus', sql.NVarChar, estatus); cond.push('CASO_ESTATUS = @estatus'); }

    const result = await request.query(`
      SELECT TOP 200
        CASO_ID as id, CASO_FOLIO as folio, CASO_TIPO as tipo,
        CASO_CONTACTO_ID as contactoId, CASO_CLIENTE_NOMBRE_LIBRE as clienteNombreLibre,
        CASO_TITULO as titulo, CASO_ESTATUS as estatus, CASO_PRIORIDAD as prioridad,
        CASO_ORIGEN as origen, CASO_REFERENCIA as referencia,
        CASO_FECHA_CREACION as fechaCreacion,
        CASO_ORIGEN_TABLA as origenTabla, CASO_ORIGEN_ID as origenId
      FROM CASOS
      WHERE ${cond.join(' AND ')}
      ORDER BY CASO_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error list casos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
