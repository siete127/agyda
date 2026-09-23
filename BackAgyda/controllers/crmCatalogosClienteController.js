const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Catálogos administrables de Clientes (Configuración → CRM → Clientes).
// Mismo patrón que catalogosTiController (Tecnología/TI → Clasificaciones):
// clave inmutable tras creación (protege referencias históricas), nombre
// editable, soft-delete vía ACTIVA. Un solo helper genera los 4 handlers por
// catálogo en vez de repetir el mismo CRUD 6 veces a mano.
const CATALOGOS = {
  tipos: { tabla: 'CRM_TIPOS_CLIENTE', prefijo: 'TIP' },
  segmentos: { tabla: 'CRM_SEGMENTOS', prefijo: 'SEG' },
  categorias: { tabla: 'CRM_CATEGORIAS_CLIENTE', prefijo: 'CAT' },
  industrias: { tabla: 'CRM_INDUSTRIAS', prefijo: 'IND' },
  clasificaciones: { tabla: 'CRM_CLASIFICACIONES_CLIENTE', prefijo: 'CLC' },
  etiquetas: { tabla: 'CRM_ETIQUETAS', prefijo: 'ETQ' },
  tiposAcceso: { tabla: 'CRM_TIPOS_ACCESO_PORTAL', prefijo: 'TAP' },
};

function crearHandlers({ tabla, prefijo }) {
  const getAll = async (req, res) => {
    try {
      const pool = await databaseService.getPool(req.user?.empresa);
      const incluirInactivas = req.query.incluirInactivas === '1';
      const rs = await pool.request().query(`
        SELECT ${prefijo}_ID as id, ${prefijo}_CLAVE as clave, ${prefijo}_NOMBRE as nombre, ${prefijo}_ORDEN as orden, ${prefijo}_ACTIVA as activa
        FROM ${tabla} ${incluirInactivas ? '' : `WHERE ${prefijo}_ACTIVA = 1`}
        ORDER BY ${prefijo}_ORDEN, ${prefijo}_NOMBRE`);
      res.json({ success: true, data: rs.recordset });
    } catch (e) {
      console.error(`Error listando ${tabla}:`, e);
      res.status(500).json({ success: false, message: e.message });
    }
  };

  const create = async (req, res) => {
    try {
      const { clave, nombre, orden } = req.body;
      if (!clave || !nombre) return res.status(400).json({ success: false, message: 'clave y nombre son requeridos' });
      const claveNorm = String(clave).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (!claveNorm) return res.status(400).json({ success: false, message: 'clave inválida' });
      const pool = await databaseService.getPool(req.user?.empresa);
      const ins = await pool.request().input('clave', sql.NVarChar, claveNorm).input('nombre', sql.NVarChar, nombre).input('orden', sql.Int, orden || 0)
        .query(`INSERT INTO ${tabla} (${prefijo}_CLAVE, ${prefijo}_NOMBRE, ${prefijo}_ORDEN) VALUES (@clave, @nombre, @orden); SELECT SCOPE_IDENTITY() as id;`);
      res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), clave: claveNorm, nombre, orden: orden || 0, activa: true } });
    } catch (e) {
      console.error(`Error creando registro en ${tabla}:`, e);
      res.status(500).json({ success: false, message: e.message });
    }
  };

  const update = async (req, res) => {
    try {
      const { id } = req.params;
      const { nombre, orden } = req.body;
      const pool = await databaseService.getPool(req.user?.empresa);
      await pool.request().input('id', sql.Int, id).input('nombre', sql.NVarChar, nombre).input('orden', sql.Int, orden || 0)
        .query(`UPDATE ${tabla} SET ${prefijo}_NOMBRE=@nombre, ${prefijo}_ORDEN=@orden WHERE ${prefijo}_ID=@id`);
      res.json({ success: true });
    } catch (e) {
      console.error(`Error actualizando registro en ${tabla}:`, e);
      res.status(500).json({ success: false, message: e.message });
    }
  };

  const toggleActiva = async (req, res) => {
    try {
      const { id } = req.params;
      const pool = await databaseService.getPool(req.user?.empresa);
      await pool.request().input('id', sql.Int, id).query(`UPDATE ${tabla} SET ${prefijo}_ACTIVA = 1 - ${prefijo}_ACTIVA WHERE ${prefijo}_ID=@id`);
      res.json({ success: true });
    } catch (e) {
      console.error(`Error cambiando estado en ${tabla}:`, e);
      res.status(500).json({ success: false, message: e.message });
    }
  };

  return { getAll, create, update, toggleActiva };
}

for (const [nombre, config] of Object.entries(CATALOGOS)) {
  const handlers = crearHandlers(config);
  const Cap = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  exports[`get${Cap}`] = handlers.getAll;
  exports[`create${Cap}`] = handlers.create;
  exports[`update${Cap}`] = handlers.update;
  exports[`toggle${Cap}Activa`] = handlers.toggleActiva;
}
