const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

// Competencias generales fijas, calificadas 1-5. Mismo espíritu que los criterios
// de EvaluacionCapacitacion, pero para desempeño general (no específico de CC).
const CRITERIOS = [
  { key: 'calidad_trabajo', label: 'Calidad de trabajo' },
  { key: 'productividad', label: 'Productividad' },
  { key: 'trabajo_equipo', label: 'Trabajo en equipo' },
  { key: 'comunicacion', label: 'Comunicación' },
  { key: 'puntualidad', label: 'Puntualidad y asistencia' },
  { key: 'iniciativa', label: 'Iniciativa y proactividad' },
  { key: 'adaptabilidad', label: 'Adaptabilidad' },
];
const CRITERIO_KEYS = CRITERIOS.map((c) => c.key);

exports.getCriterios = (req, res) => {
  res.json({ success: true, data: CRITERIOS });
};

/* ── Ciclos ── */

const SELECT_CICLO = `
  SELECT
    CICLO_ID as id,
    CICLO_NOMBRE as nombre,
    CICLO_FECHA_INICIO as fechaInicio,
    CICLO_FECHA_FIN as fechaFin,
    CICLO_ACTIVO as activo
  FROM dbo.EVAL_DESEMPENO_CICLOS
`;

exports.getCiclos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`${SELECT_CICLO} ORDER BY CICLO_FECHA_INICIO DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo ciclos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCiclo = async (req, res) => {
  try {
    const { nombre, fechaInicio, fechaFin } = req.body;
    if (!nombre || !fechaInicio || !fechaFin) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: nombre, fechaInicio, fechaFin' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('fechaInicio', sql.Date, fechaInicio)
      .input('fechaFin', sql.Date, fechaFin)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO dbo.EVAL_DESEMPENO_CICLOS (CICLO_NOMBRE, CICLO_FECHA_INICIO, CICLO_FECHA_FIN, CICLO_CREADO_POR)
        VALUES (@nombre, @fechaInicio, @fechaFin, @creadoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);

    const cicloId = result.recordset[0].id;
    const creado = await pool.request().input('id', sql.Int, cicloId).query(`${SELECT_CICLO} WHERE CICLO_ID = @id`);

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'evaluacion-desempeno', accion: 'crear-ciclo', entidadId: String(cicloId), detalle: { nombre }, ip: req.ip });
    res.status(201).json({ success: true, data: creado.recordset[0] });
  } catch (error) {
    console.error('Error creando ciclo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleCicloActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activo === true)
      .query('UPDATE dbo.EVAL_DESEMPENO_CICLOS SET CICLO_ACTIVO = @activo WHERE CICLO_ID = @id');
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error cambiando estado del ciclo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── Evaluaciones ── */

const SELECT_EVAL = `
  SELECT
    e.EVAL_ID as id,
    e.EVAL_CICLO_ID as cicloId,
    c.CICLO_NOMBRE as cicloNombre,
    e.EVAL_EMPLEADO_ID as empleadoId,
    u.NEUS_NOMBRES as empleadoNombre,
    e.EVAL_EVALUADOR_ID as evaluadorId,
    e.EVAL_EVALUADOR_NOMBRE as evaluadorNombre,
    e.EVAL_ESTADO as estado,
    e.EVAL_CALIFICACION as calificacion,
    e.EVAL_FORTALEZAS as fortalezas,
    e.EVAL_AREAS_MEJORA as areasMejora,
    e.EVAL_PLAN_ACCION as planAccion,
    e.EVAL_FECHA_CREACION as fechaCreacion,
    e.EVAL_FECHA_FINALIZADA as fechaFinalizada
  FROM dbo.EVAL_DESEMPENO e
  INNER JOIN dbo.EVAL_DESEMPENO_CICLOS c ON c.CICLO_ID = e.EVAL_CICLO_ID
  INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = e.EVAL_EMPLEADO_ID
`;

async function attachDetalle(pool, evaluaciones) {
  if (evaluaciones.length === 0) return evaluaciones;
  const ids = evaluaciones.map((e) => e.id);
  const criterios = await pool.request().query(`SELECT EC_EVAL_ID as evalId, EC_CRITERIO as criterio, EC_CALIFICACION as calificacion FROM dbo.EVAL_DESEMPENO_CRITERIOS WHERE EC_EVAL_ID IN (${ids.join(',')})`);
  const metas = await pool.request().query(`SELECT EM_ID as id, EM_EVAL_ID as evalId, EM_DESCRIPCION as descripcion, EM_CUMPLIMIENTO as cumplimiento FROM dbo.EVAL_DESEMPENO_METAS WHERE EM_EVAL_ID IN (${ids.join(',')})`);

  const criteriosPorEval = new Map();
  for (const c of criterios.recordset) {
    if (!criteriosPorEval.has(c.evalId)) criteriosPorEval.set(c.evalId, []);
    criteriosPorEval.get(c.evalId).push({ criterio: c.criterio, calificacion: c.calificacion });
  }
  const metasPorEval = new Map();
  for (const m of metas.recordset) {
    if (!metasPorEval.has(m.evalId)) metasPorEval.set(m.evalId, []);
    metasPorEval.get(m.evalId).push({ id: m.id, descripcion: m.descripcion, cumplimiento: m.cumplimiento });
  }

  return evaluaciones.map((e) => ({
    ...e,
    criterios: criteriosPorEval.get(e.id) ?? [],
    metas: metasPorEval.get(e.id) ?? [],
  }));
}

// GET /api/evaluacion-desempeno/mis — historial del empleado actual (lo que le evaluaron)
exports.getMisEvaluaciones = async (req, res) => {
  try {
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('uid', sql.Int, uid)
      .query(`${SELECT_EVAL} WHERE e.EVAL_EMPLEADO_ID = @uid ORDER BY e.EVAL_FECHA_CREACION DESC`);
    const data = await attachDetalle(pool, result.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo mis evaluaciones:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/evaluacion-desempeno — listado completo, solo RH/admin
exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const { cicloId, estado } = req.query;
    const conditions = [];
    const request = pool.request();
    if (cicloId) { conditions.push('e.EVAL_CICLO_ID = @cicloId'); request.input('cicloId', sql.Int, cicloId); }
    if (estado) { conditions.push('e.EVAL_ESTADO = @estado'); request.input('estado', sql.NVarChar, estado); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await request.query(`${SELECT_EVAL} ${where} ORDER BY e.EVAL_FECHA_CREACION DESC`);
    const data = await attachDetalle(pool, result.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo evaluaciones:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/evaluacion-desempeno — RH/admin crea una evaluación en borrador para un empleado dentro de un ciclo
exports.crear = async (req, res) => {
  try {
    const { cicloId, empleadoId } = req.body;
    if (!cicloId || !empleadoId) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: cicloId, empleadoId' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request()
      .input('cicloId', sql.Int, cicloId)
      .input('empleadoId', sql.Int, empleadoId)
      .query('SELECT EVAL_ID FROM dbo.EVAL_DESEMPENO WHERE EVAL_CICLO_ID=@cicloId AND EVAL_EMPLEADO_ID=@empleadoId');
    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya existe una evaluación para este empleado en este ciclo' });
    }

    const result = await pool.request()
      .input('cicloId', sql.Int, cicloId)
      .input('empleadoId', sql.Int, empleadoId)
      .input('evaluadorId', sql.Int, req.user?.id || null)
      .input('evaluadorNombre', sql.NVarChar, req.user?.nombre || null)
      .query(`
        INSERT INTO dbo.EVAL_DESEMPENO (EVAL_CICLO_ID, EVAL_EMPLEADO_ID, EVAL_EVALUADOR_ID, EVAL_EVALUADOR_NOMBRE, EVAL_ESTADO)
        VALUES (@cicloId, @empleadoId, @evaluadorId, @evaluadorNombre, 'borrador');
        SELECT SCOPE_IDENTITY() as id;
      `);

    const evalId = result.recordset[0].id;
    const creada = await pool.request().input('id', sql.Int, evalId).query(`${SELECT_EVAL} WHERE e.EVAL_ID = @id`);
    const [data] = await attachDetalle(pool, creada.recordset);

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'evaluacion-desempeno', accion: 'crear', entidadId: String(evalId), detalle: { cicloId, empleadoId }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando evaluación:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/evaluacion-desempeno/:id — guarda criterios, metas y texto (mientras esté en borrador)
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { criterios, metas, fortalezas, areasMejora, planAccion } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT EVAL_ESTADO FROM dbo.EVAL_DESEMPENO WHERE EVAL_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    if (existing.recordset[0].EVAL_ESTADO === 'finalizada') {
      return res.status(400).json({ success: false, message: 'Esta evaluación ya fue finalizada y no se puede editar' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('fortalezas', sql.NVarChar, fortalezas || null)
      .input('areasMejora', sql.NVarChar, areasMejora || null)
      .input('planAccion', sql.NVarChar, planAccion || null)
      .query(`
        UPDATE dbo.EVAL_DESEMPENO
        SET EVAL_FORTALEZAS=@fortalezas, EVAL_AREAS_MEJORA=@areasMejora, EVAL_PLAN_ACCION=@planAccion
        WHERE EVAL_ID=@id
      `);

    if (Array.isArray(criterios)) {
      await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.EVAL_DESEMPENO_CRITERIOS WHERE EC_EVAL_ID = @id');
      for (const c of criterios) {
        if (!CRITERIO_KEYS.includes(c.criterio)) continue;
        const calif = Number(c.calificacion);
        if (!Number.isInteger(calif) || calif < 1 || calif > 5) continue;
        await pool.request()
          .input('evalId', sql.Int, id)
          .input('criterio', sql.NVarChar, c.criterio)
          .input('calificacion', sql.Int, calif)
          .query('INSERT INTO dbo.EVAL_DESEMPENO_CRITERIOS (EC_EVAL_ID, EC_CRITERIO, EC_CALIFICACION) VALUES (@evalId, @criterio, @calificacion)');
      }
    }

    if (Array.isArray(metas)) {
      await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.EVAL_DESEMPENO_METAS WHERE EM_EVAL_ID = @id');
      for (const m of metas) {
        if (!m.descripcion) continue;
        const cumplimiento = m.cumplimiento != null ? Math.max(0, Math.min(100, Number(m.cumplimiento))) : null;
        await pool.request()
          .input('evalId', sql.Int, id)
          .input('descripcion', sql.NVarChar, String(m.descripcion).slice(0, 300))
          .input('cumplimiento', sql.Int, cumplimiento)
          .query('INSERT INTO dbo.EVAL_DESEMPENO_METAS (EM_EVAL_ID, EM_DESCRIPCION, EM_CUMPLIMIENTO) VALUES (@evalId, @descripcion, @cumplimiento)');
      }
    }

    const actualizada = await pool.request().input('id', sql.Int, id).query(`${SELECT_EVAL} WHERE e.EVAL_ID = @id`);
    const [data] = await attachDetalle(pool, actualizada.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error actualizando evaluación:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/evaluacion-desempeno/:id/finalizar — calcula la calificación final (promedio de criterios 1-5 → escala 100) y bloquea edición
exports.finalizar = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request().input('id', sql.Int, id).query('SELECT EVAL_ESTADO FROM dbo.EVAL_DESEMPENO WHERE EVAL_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    if (existing.recordset[0].EVAL_ESTADO === 'finalizada') {
      return res.status(400).json({ success: false, message: 'Esta evaluación ya fue finalizada' });
    }

    const criterios = await pool.request().input('id', sql.Int, id).query('SELECT EC_CALIFICACION as calificacion FROM dbo.EVAL_DESEMPENO_CRITERIOS WHERE EC_EVAL_ID = @id');
    if (criterios.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Califica al menos un criterio antes de finalizar' });
    }
    const promedio = criterios.recordset.reduce((s, c) => s + c.calificacion, 0) / criterios.recordset.length;
    const calificacion = Math.round((promedio / 5) * 100 * 100) / 100; // escala 0-100, 2 decimales

    await pool.request()
      .input('id', sql.Int, id)
      .input('calificacion', sql.Decimal(5, 2), calificacion)
      .query("UPDATE dbo.EVAL_DESEMPENO SET EVAL_ESTADO='finalizada', EVAL_CALIFICACION=@calificacion, EVAL_FECHA_FINALIZADA=GETDATE() WHERE EVAL_ID=@id");

    const actualizada = await pool.request().input('id', sql.Int, id).query(`${SELECT_EVAL} WHERE e.EVAL_ID = @id`);
    const [data] = await attachDetalle(pool, actualizada.recordset);

    try { socketService.getIO(req.user?.empresa).emit('evaluacion-desempeno:finalizada', data); } catch (_) {}
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'evaluacion-desempeno', accion: 'finalizar', entidadId: id, detalle: { calificacion }, ip: req.ip });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error finalizando evaluación:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
