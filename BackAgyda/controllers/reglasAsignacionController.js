const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { enrutarTicket, asignarTecnico } = require('../services/reglasAsignacionService');

exports.getReglas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT r.REG_ID as id, r.REG_NOMBRE as nombre, r.REG_ACTIVA as activa, r.REG_PRIORIDAD_ORDEN as orden,
             r.REG_AREA as area, r.REG_CAT_ID as categoriaId, c.CAT_NOMBRE as categoriaNombre,
             r.REG_SUBCAT_ID as subcategoriaId, sc.SUBCAT_NOMBRE as subcategoriaNombre,
             r.REG_SEDE_ID as sedeId, s.SEDE_NOMBRE as sedeNombre,
             r.REG_PRIORIDAD as prioridad, r.REG_NIVEL_REQUERIDO as nivelRequerido,
             r.REG_ESP_ID as especialidadId, e.ESP_NOMBRE as especialidadNombre,
             r.REG_TECNICO_ID as tecnicoId, t.NEUS_NOMBRES as tecnicoNombre,
             CONVERT(varchar(5), r.REG_HORARIO_INICIO, 108) as horarioInicio,
             CONVERT(varchar(5), r.REG_HORARIO_FIN, 108) as horarioFin,
             r.REG_DIAS_SEMANA as diasSemana
      FROM TI_REGLAS_ASIGNACION r
      LEFT JOIN TICKET_CATEGORIAS c ON c.CAT_ID = r.REG_CAT_ID
      LEFT JOIN TICKET_SUBCATEGORIAS sc ON sc.SUBCAT_ID = r.REG_SUBCAT_ID
      LEFT JOIN SEDES s ON s.SEDE_ID = r.REG_SEDE_ID
      LEFT JOIN TI_ESPECIALIDADES e ON e.ESP_ID = r.REG_ESP_ID
      LEFT JOIN NEUS_USUARIOS t ON t.NEUS_ID = r.REG_TECNICO_ID
      ORDER BY r.REG_PRIORIDAD_ORDEN, r.REG_ID`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando reglas de asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createRegla = async (req, res) => {
  try {
    const { nombre, area, categoriaId, subcategoriaId, sedeId, prioridad, nivelRequerido, especialidadId, tecnicoId, orden, horarioInicio, horarioFin, diasSemana } = req.body;
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
      .input('tecnicoId', sql.Int, tecnicoId || null)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .input('horarioInicio', sql.VarChar, horarioInicio || null)
      .input('horarioFin', sql.VarChar, horarioFin || null)
      .input('diasSemana', sql.NVarChar, Array.isArray(diasSemana) && diasSemana.length ? diasSemana.join(',') : null)
      .query(`INSERT INTO TI_REGLAS_ASIGNACION
                (REG_NOMBRE, REG_PRIORIDAD_ORDEN, REG_AREA, REG_CAT_ID, REG_SUBCAT_ID, REG_SEDE_ID, REG_PRIORIDAD, REG_NIVEL_REQUERIDO, REG_ESP_ID, REG_TECNICO_ID, REG_CREADO_POR, REG_HORARIO_INICIO, REG_HORARIO_FIN, REG_DIAS_SEMANA)
              VALUES (@nombre, @orden, @area, @catId, @subcatId, @sedeId, @prioridad, @nivel, @espId, @tecnicoId, @creadoPor, @horarioInicio, @horarioFin, @diasSemana);
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
    const { nombre, activa, area, categoriaId, subcategoriaId, sedeId, prioridad, nivelRequerido, especialidadId, tecnicoId, horarioInicio, horarioFin, diasSemana } = req.body;
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
      .input('tecnicoId', sql.Int, tecnicoId || null)
      .input('horarioInicio', sql.VarChar, horarioInicio || null)
      .input('horarioFin', sql.VarChar, horarioFin || null)
      .input('diasSemana', sql.NVarChar, Array.isArray(diasSemana) && diasSemana.length ? diasSemana.join(',') : null)
      .query(`UPDATE TI_REGLAS_ASIGNACION SET
                REG_NOMBRE=@nombre, REG_ACTIVA=@activa, REG_AREA=@area, REG_CAT_ID=@catId,
                REG_SUBCAT_ID=@subcatId, REG_SEDE_ID=@sedeId, REG_PRIORIDAD=@prioridad,
                REG_NIVEL_REQUERIDO=@nivel, REG_ESP_ID=@espId, REG_TECNICO_ID=@tecnicoId,
                REG_HORARIO_INICIO=@horarioInicio, REG_HORARIO_FIN=@horarioFin, REG_DIAS_SEMANA=@diasSemana
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
// Ejecuta las dos fases del motor por separado para que el admin pueda ver
// exactamente a qué grupo se enrutaría (fase 1) y qué técnico se asignaría
// dentro de ese grupo (fase 2), incluso si una de las dos fases no tiene
// resultado (p.ej. hay grupo pero cero técnicos con capacidad disponible).
exports.simularAsignacion = async (req, res) => {
  try {
    const { area, nivel, categoriaId, subcategoriaId, sedeId, prioridad, tipoCarga } = req.body;
    if (!area) return res.status(400).json({ success: false, message: 'area requerida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const criterios = {
      area, nivel: nivel || 1, categoriaId: categoriaId || null, subcategoriaId: subcategoriaId || null,
      sedeId: sedeId || null, prioridad: prioridad || null,
    };

    const ruteo = await enrutarTicket(pool, criterios);
    const asignacion = await asignarTecnico(pool, {
      area, nivel: ruteo.nivel, espId: ruteo.espId, categoriaId: criterios.categoriaId,
      sedeId: criterios.sedeId, prioridad: criterios.prioridad, tipoCarga: tipoCarga || 'ticket',
      tecnicoForzadoId: ruteo.tecnicoForzadoId,
    });

    let tecnicoNombre = null;
    if (asignacion?.userId) {
      const rsN = await pool.request().input('uid', sql.Int, asignacion.userId).query(`SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);
      tecnicoNombre = rsN.recordset[0]?.NEUS_NOMBRES || null;
    }

    res.json({
      success: true,
      data: {
        enrutamiento: {
          reglaAplicada: ruteo.reglaAplicada, nivel: ruteo.nivel, especialidadId: ruteo.espId,
          tecnicoForzadoId: ruteo.tecnicoForzadoId, grupoId: ruteo.grupoId, grupoNombre: ruteo.grupoNombre,
        },
        asignacion: { tecnicoId: asignacion?.userId || null, tecnicoNombre },
      },
    });
  } catch (e) {
    console.error('Error simulando asignación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
