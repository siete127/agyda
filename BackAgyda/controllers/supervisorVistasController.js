// Vistas guardadas / personalización de columnas — Fase 3, punto 3.6 del
// plan basado en PSUP. Guarda qué columnas ve cada usuario en cada tabla del
// módulo Supervisor (Productividad, Comparador). Sin validación contra un
// catálogo fijo de columnas por tabla: el frontend manda las claves que
// conoce y las vuelve a filtrar contra sus propias columnas disponibles, así
// que una clave vieja/desconocida simplemente se ignora sin romper nada.
const sql = require('mssql');
const databaseService = require('../services/databaseService');

const TABLAS_VALIDAS = ['productividad', 'comparador_agentes', 'comparador_campanias'];

async function pool(req) { return databaseService.getPool(req?.user?.empresa); }
function usuarioIdDe(req) {
  return req.user && (req.user.id || req.user.sub || req.user.userId);
}

// GET /operaciones/supervisores/vistas/:tabla
exports.get = async (req, res) => {
  try {
    const tabla = req.params.tabla;
    if (!TABLAS_VALIDAS.includes(tabla)) return res.status(400).json({ success: false, message: 'Tabla inválida' });
    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const r = await p.request().input('uid', sql.Int, uid).input('tabla', sql.NVarChar(40), tabla)
      .query(`SELECT CSV_COLUMNAS columnas FROM dbo.CSA_VISTAS_COLUMNAS WHERE CSV_USUARIO_ID = @uid AND CSV_TABLA = @tabla`);
    const fila = r.recordset[0];
    let columnas = null;
    if (fila) {
      try { columnas = JSON.parse(fila.columnas); } catch { columnas = null; }
    }
    res.json({ success: true, data: { columnas } });
  } catch (e) {
    console.error('supervisorVistas.get:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener la vista' });
  }
};

// PUT /operaciones/supervisores/vistas/:tabla — body: { columnas: string[] }
exports.guardar = async (req, res) => {
  try {
    const tabla = req.params.tabla;
    if (!TABLAS_VALIDAS.includes(tabla)) return res.status(400).json({ success: false, message: 'Tabla inválida' });
    const columnas = Array.isArray(req.body?.columnas) ? req.body.columnas.map(String) : null;
    if (!columnas) return res.status(400).json({ success: false, message: 'Falta el arreglo de columnas' });

    const p = await pool(req);
    const uid = usuarioIdDe(req);
    const json = JSON.stringify(columnas).slice(0, 1000);
    await p.request()
      .input('uid', sql.Int, uid).input('tabla', sql.NVarChar(40), tabla).input('cols', sql.NVarChar(1000), json)
      .query(`MERGE dbo.CSA_VISTAS_COLUMNAS AS t
              USING (SELECT @uid u, @tabla tb) s ON t.CSV_USUARIO_ID = s.u AND t.CSV_TABLA = s.tb
              WHEN MATCHED THEN UPDATE SET CSV_COLUMNAS = @cols, CSV_FECHA_ACTUALIZACION = GETDATE()
              WHEN NOT MATCHED THEN INSERT (CSV_USUARIO_ID, CSV_TABLA, CSV_COLUMNAS) VALUES (@uid, @tabla, @cols);`);
    res.json({ success: true });
  } catch (e) {
    console.error('supervisorVistas.guardar:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar la vista' });
  }
};
