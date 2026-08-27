const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { seleccionarTecnico, evaluarReglasParaCriterios } = require('../services/reglasAsignacionService');

exports.getReglas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT r.REG_ID as id, r.REG_NOMBRE as nombre, r.REG_ACTIVA as activa, r.REG_PRIORIDAD_ORDEN as orden,
             r.REG_AREA as area, r.REG_CAT_ID as categoriaId, c.CAT_NOMBRE as categoriaNombre,
             r.REG_SUBCAT_ID as subcategoriaId, sc.SUBCAT_NOMBRE as subcategoriaNombre,
             r.REG_SEDE_ID as sedeId, s.SEDE_NOMBRE as sedeNombre,
             r.REG_PRIORIDAD as prioridad, r.REG_NIVEL_REQUERIDO as nivelRequerido,
             r.REG_ESP_ID as especialidadId, e.ESP_NOMBRE as especialidadNombre
      FROM TI_REGLAS_ASIGNACION r
      LEFT JOIN TICKET_CATEGORIAS c ON c.CAT_ID = r.REG_CAT_ID
      LEFT JOIN TICKET_SUBCATEGORIAS sc ON sc.SUBCAT_ID = r.REG_SUBCAT_ID
      LEFT JOIN SEDES s ON s.SEDE_ID = r.REG_SEDE_ID
      LEFT JOIN TI_ESPECIALIDADES e ON e.ESP_ID = r.REG_ESP_ID
      ORDER BY r.REG_PRIORIDAD_ORDEN, r.REG_ID`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando reglas de asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createRegla = async (req, res) => {
  try {
    const { nombre, area, categoriaId, subcategoriaId, sedeId, prioridad, nivelRequerido, especialidadId, orden } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'nombre requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .input('area', sql.NVarChar, area || null)
      .input('catId', sql.Int, categoriaId || null)
      .input('subcatId', sql.Int, subcategoriaId || null)
      .input('sedeId', sql.Int, sedeId || null)
      .input('prioridad', sql.NVarChar, prioridad || null)
      .input('nivel', sql.TinyInt, nivelRequerido || null)
      .input('espId', sql.Int, especialidadId || null)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .query(`INSERT INTO TI_REGLAS_ASIGNACION
                (REG_NOMBRE, REG_PRIORIDAD_ORDEN, REG_AREA, REG_CAT_ID, REG_SUBCAT_ID, REG_SEDE_ID, REG_PRIORIDAD, REG_NIVEL_REQUERIDO, REG_ESP_ID, REG_CREADO_POR)
              VALUES (@nombre, @orden, @area, @catId, @subcatId, @sedeId, @prioridad, @nivel, @espId, @creadoPor);
              SELECT SCOPE_IDENTITY() as id;`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'reglas-asignacion', accion:'crear', entidadId: String(ins.recordset[0].id), detalle:{ nombre }, ip:req.ip });
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id) } });
  } catch (e) {
    console.error('Error creando regla de asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateRegla = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, activa, area, categoriaId, subcategoriaId, sedeId, prioridad, nivelRequerido, especialidadId } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('activa', sql.Bit, activa === undefined ? 1 : (activa ? 1 : 0))
      .input('area', sql.NVarChar, area || null)
      .input('catId', sql.Int, categoriaId || null)
      .input('subcatId', sql.Int, subcategoriaId || null)
      .input('sedeId', sql.Int, sedeId || null)
      .input('prioridad', sql.NVarChar, prioridad || null)
      .input('nivel', sql.TinyInt, nivelRequerido || null)
      .input('espId', sql.Int, especialidadId || null)
      .query(`UPDATE TI_REGLAS_ASIGNACION SET
                REG_NOMBRE=@nombre, REG_ACTIVA=@activa, REG_AREA=@area, REG_CAT_ID=@catId,
                REG_SUBCAT_ID=@subcatId, REG_SEDE_ID=@sedeId, REG_PRIORIDAD=@prioridad,
                REG_NIVEL_REQUERIDO=@nivel, REG_ESP_ID=@espId
              WHERE REG_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando regla de asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteRegla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM TI_REGLAS_ASIGNACION WHERE REG_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando regla de asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.reordenarReglas = async (req, res) => {
  try {
    const { ids } = req.body; // array de REG_ID en el nuevo orden
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, message: 'ids debe ser un array' });
    const pool = await databaseService.getPool(req.user?.empresa);
    for (let i = 0; i < ids.length; i++) {
      await pool.request().input('id', sql.Int, ids[i]).input('orden', sql.Int, i)
        .query(`UPDATE TI_REGLAS_ASIGNACION SET REG_PRIORIDAD_ORDEN=@orden WHERE REG_ID=@id`);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Error reordenando reglas de asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/reglas-asignacion/simular — dry-run, no asigna nada real.
exports.simularAsignacion = async (req, res) => {
  try {
    const { area, nivel, categoriaId, subcategoriaId, sedeId, prioridad, tipoCarga } = req.body;
    if (!area) return res.status(400).json({ success: false, message: 'area requerida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const { regla, resultado } = await evaluarReglasParaCriterios(pool, {
      area, nivel: nivel || 1, categoriaId: categoriaId || null, subcategoriaId: subcategoriaId || null,
      sedeId: sedeId || null, prioridad: prioridad || null, tipoCarga: tipoCarga || 'ticket',
    });

    let tecnicoNombre = null;
    if (resultado?.userId) {
      const rsN = await pool.request().input('uid', sql.Int, resultado.userId).query(`SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);
      tecnicoNombre = rsN.recordset[0]?.NEUS_NOMBRES || null;
    }

    res.json({ success: true, data: { reglaAplicada: regla, tecnicoId: resultado?.userId || null, tecnicoNombre } });
  } catch (e) {
    console.error('Error simulando asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
