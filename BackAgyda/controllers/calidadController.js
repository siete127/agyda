const sql = require('mssql');
const databaseService = require('../services/databaseService');
const areasController = require('./areasController');
const logger = global.logger || require('../utils/logger');

async function listEvaluaciones(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT TOP 50 CE_ID as id, CE_AGENTE_ID as agenteId, CE_EVALUADOR_ID as evaluadorId,
               CE_LLAMADA_REF as llamadaRef, CE_PUNTAJE as puntaje, CE_FECHA as fecha
        FROM CALIDAD_EVALUACIONES
        ORDER BY CE_FECHA DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.listEvaluaciones', err);
    res.status(500).json({ success: false, message: 'Error al listar evaluaciones' });
  }
}

async function crearEvaluacion(req, res) {
  try {
    const { agenteId, evaluadorId, llamadaRef, puntaje, criterios } = req.body;
    if (!agenteId || puntaje === undefined) {
      return res.status(400).json({ success: false, message: 'Agente y puntaje son requeridos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('agenteId', sql.Int, agenteId)
      .input('evaluadorId', sql.Int, evaluadorId || null)
      .input('llamadaRef', sql.NVarChar, llamadaRef || null)
      .input('puntaje', sql.Decimal(5, 2), puntaje)
      .input('criterios', sql.NVarChar, JSON.stringify(criterios || {}))
      .query(`
        INSERT INTO CALIDAD_EVALUACIONES (CE_AGENTE_ID, CE_EVALUADOR_ID, CE_LLAMADA_REF, CE_PUNTAJE, CE_CRITERIOS_JSON)
        VALUES (@agenteId, @evaluadorId, @llamadaRef, @puntaje, @criterios)
      `);

    const agg = await pool.request()
      .query(`
        SELECT AVG(CE_PUNTAJE) as promedio, COUNT(*) as total
        FROM CALIDAD_EVALUACIONES
        WHERE MONTH(CE_FECHA) = MONTH(GETDATE()) AND YEAR(CE_FECHA) = YEAR(GETDATE())
      `);
    const promedio = agg.recordset[0]?.promedio || 0;
    const total = agg.recordset[0]?.total || 0;

    await areasController.upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'calidad',
      kpiKey: 'promedio_qa',
      label: 'Promedio QA',
      valor: promedio,
      unidad: 'pts',
      tono: 'brand',
      updatedBy: req.user?.id,
    });
    await areasController.upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'calidad',
      kpiKey: 'evaluaciones_mes',
      label: 'Evaluaciones este mes',
      valor: total,
      unidad: '',
      tono: 'brand',
      updatedBy: req.user?.id,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.crearEvaluacion', err);
    res.status(500).json({ success: false, message: 'Error al crear evaluación' });
  }
}

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const resumen = await pool.request()
      .query(`
        SELECT AVG(CE_PUNTAJE) as promedioQa, COUNT(*) as evaluacionesMes
        FROM CALIDAD_EVALUACIONES
        WHERE MONTH(CE_FECHA) = MONTH(GETDATE()) AND YEAR(CE_FECHA) = YEAR(GETDATE())
      `);
    const porAgenteRs = await pool.request()
      .query(`
        SELECT TOP 10 CE_AGENTE_ID as agenteId, AVG(CE_PUNTAJE) as promedio, COUNT(*) as count
        FROM CALIDAD_EVALUACIONES
        WHERE MONTH(CE_FECHA) = MONTH(GETDATE()) AND YEAR(CE_FECHA) = YEAR(GETDATE())
        GROUP BY CE_AGENTE_ID
        ORDER BY AVG(CE_PUNTAJE) DESC
      `);

    res.json({
      success: true,
      data: {
        evaluacionesMes: resumen.recordset[0]?.evaluacionesMes || 0,
        promedioQa: resumen.recordset[0]?.promedioQa || 0,
        porAgente: porAgenteRs.recordset,
      },
    });
  } catch (err) {
    logger.error('calidadController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
}

/* ── Retroalimentación: comentarios/plan de mejora vinculados a una evaluación QA ──
   El evaluador la redacta; el propio agente evaluado puede consultar la suya (self-
   service, como Asesores en Operaciones) y marcarla como vista. */

// GET /api/calidad/retroalimentacion — listado completo (admin/evaluador), con datos
// básicos de la evaluación asociada y del agente.
async function listRetroalimentaciones(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT r.CR_ID as id, r.CR_EVALUACION_ID as evaluacionId, r.CR_AGENTE_ID as agenteId,
             u.NEUS_NOMBRES as agenteNombre, r.CR_AUTOR_ID as autorId,
             r.CR_COMENTARIO as comentario, r.CR_PLAN_MEJORA as planMejora,
             r.CR_VISTA as vista, r.CR_FECHA as fecha, e.CE_PUNTAJE as puntajeEvaluacion, e.CE_FECHA as fechaEvaluacion
      FROM CALIDAD_RETROALIMENTACION r
      INNER JOIN CALIDAD_EVALUACIONES e ON e.CE_ID = r.CR_EVALUACION_ID
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = r.CR_AGENTE_ID
      ORDER BY r.CR_FECHA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.listRetroalimentaciones', err);
    res.status(500).json({ success: false, message: 'Error al listar la retroalimentación' });
  }
}

// GET /api/calidad/retroalimentacion/mias — self-service del agente autenticado.
async function getMiRetroalimentacion(req, res) {
  try {
    const agenteId = req.user?.id;
    if (!agenteId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('agenteId', sql.Int, agenteId).query(`
      SELECT r.CR_ID as id, r.CR_EVALUACION_ID as evaluacionId, r.CR_COMENTARIO as comentario,
             r.CR_PLAN_MEJORA as planMejora, r.CR_VISTA as vista, r.CR_FECHA as fecha,
             e.CE_PUNTAJE as puntajeEvaluacion, e.CE_FECHA as fechaEvaluacion
      FROM CALIDAD_RETROALIMENTACION r
      INNER JOIN CALIDAD_EVALUACIONES e ON e.CE_ID = r.CR_EVALUACION_ID
      WHERE r.CR_AGENTE_ID = @agenteId
      ORDER BY r.CR_FECHA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.getMiRetroalimentacion', err);
    res.status(500).json({ success: false, message: 'Error al obtener tu retroalimentación' });
  }
}

// POST /api/calidad/retroalimentacion — vincula un comentario/plan de mejora a una
// evaluación ya existente (toma CR_AGENTE_ID de la evaluación, no del body).
async function crearRetroalimentacion(req, res) {
  try {
    const { evaluacionId, comentario, planMejora } = req.body;
    if (!evaluacionId || !comentario) return res.status(400).json({ success: false, message: 'Evaluación y comentario son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const evalRs = await pool.request().input('id', sql.Int, evaluacionId).query('SELECT CE_AGENTE_ID as agenteId FROM CALIDAD_EVALUACIONES WHERE CE_ID = @id');
    if (evalRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    const agenteId = evalRs.recordset[0].agenteId;

    await pool.request()
      .input('evaluacionId', sql.Int, evaluacionId)
      .input('agenteId', sql.Int, agenteId)
      .input('autorId', sql.SmallInt, req.user?.id ?? null)
      .input('comentario', sql.NVarChar, comentario)
      .input('planMejora', sql.NVarChar, planMejora || null)
      .query(`
        INSERT INTO CALIDAD_RETROALIMENTACION (CR_EVALUACION_ID, CR_AGENTE_ID, CR_AUTOR_ID, CR_COMENTARIO, CR_PLAN_MEJORA)
        VALUES (@evaluacionId, @agenteId, @autorId, @comentario, @planMejora)
      `);
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('calidadController.crearRetroalimentacion', err);
    res.status(500).json({ success: false, message: 'Error al crear la retroalimentación' });
  }
}

// PATCH /api/calidad/retroalimentacion/:id/vista — el agente marca su retroalimentación
// como vista (solo puede marcar la suya).
async function marcarRetroalimentacionVista(req, res) {
  try {
    const { id } = req.params;
    const agenteId = req.user?.id;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .input('agenteId', sql.Int, agenteId)
      .query(`UPDATE CALIDAD_RETROALIMENTACION SET CR_VISTA = 1, CR_FECHA_VISTA = GETDATE() WHERE CR_ID = @id AND CR_AGENTE_ID = @agenteId`);
    if (rs.rowsAffected[0] === 0) return res.status(404).json({ success: false, message: 'Retroalimentación no encontrada' });
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.marcarRetroalimentacionVista', err);
    res.status(500).json({ success: false, message: 'Error al marcar como vista' });
  }
}

async function eliminarRetroalimentacion(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CALIDAD_RETROALIMENTACION WHERE CR_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.eliminarRetroalimentacion', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la retroalimentación' });
  }
}

/* ── Planes de mejora: seguimiento con fecha límite y estatus, derivado de una
   evaluación QA (más estructurado que el texto libre CR_PLAN_MEJORA de
   Retroalimentación). El admin/evaluador los crea y da seguimiento; el agente ve
   los suyos (self-service). */

// GET /api/calidad/planes-mejora?estatus= — listado completo (admin), filtrable.
async function listPlanesMejora(req, res) {
  try {
    const { estatus } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const req1 = pool.request();
    if (estatus) req1.input('estatus', sql.NVarChar, estatus);
    const rs = await req1.query(`
      SELECT p.CPM_ID as id, p.CPM_EVALUACION_ID as evaluacionId, p.CPM_AGENTE_ID as agenteId,
             u.NEUS_NOMBRES as agenteNombre, p.CPM_TITULO as titulo, p.CPM_DESCRIPCION as descripcion,
             p.CPM_FECHA_LIMITE as fechaLimite, p.CPM_ESTATUS as estatus, p.CPM_FECHA_CREACION as fechaCreacion,
             p.CPM_FECHA_COMPLETADO as fechaCompletado, e.CE_PUNTAJE as puntajeEvaluacion
      FROM CALIDAD_PLANES_MEJORA p
      INNER JOIN CALIDAD_EVALUACIONES e ON e.CE_ID = p.CPM_EVALUACION_ID
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = p.CPM_AGENTE_ID
      ${estatus ? 'WHERE p.CPM_ESTATUS = @estatus' : ''}
      ORDER BY CASE WHEN p.CPM_FECHA_LIMITE IS NULL THEN 1 ELSE 0 END, p.CPM_FECHA_LIMITE ASC, p.CPM_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.listPlanesMejora', err);
    res.status(500).json({ success: false, message: 'Error al listar los planes de mejora' });
  }
}

// GET /api/calidad/planes-mejora/mios — self-service del agente autenticado.
async function getMisPlanesMejora(req, res) {
  try {
    const agenteId = req.user?.id;
    if (!agenteId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('agenteId', sql.Int, agenteId).query(`
      SELECT p.CPM_ID as id, p.CPM_EVALUACION_ID as evaluacionId, p.CPM_TITULO as titulo,
             p.CPM_DESCRIPCION as descripcion, p.CPM_FECHA_LIMITE as fechaLimite, p.CPM_ESTATUS as estatus,
             p.CPM_FECHA_CREACION as fechaCreacion, p.CPM_FECHA_COMPLETADO as fechaCompletado,
             e.CE_PUNTAJE as puntajeEvaluacion
      FROM CALIDAD_PLANES_MEJORA p
      INNER JOIN CALIDAD_EVALUACIONES e ON e.CE_ID = p.CPM_EVALUACION_ID
      WHERE p.CPM_AGENTE_ID = @agenteId
      ORDER BY CASE WHEN p.CPM_FECHA_LIMITE IS NULL THEN 1 ELSE 0 END, p.CPM_FECHA_LIMITE ASC, p.CPM_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.getMisPlanesMejora', err);
    res.status(500).json({ success: false, message: 'Error al obtener tus planes de mejora' });
  }
}

// POST /api/calidad/planes-mejora — crea un plan vinculado a una evaluación (toma
// CPM_AGENTE_ID de la evaluación, no del body).
async function crearPlanMejora(req, res) {
  try {
    const { evaluacionId, titulo, descripcion, fechaLimite } = req.body;
    if (!evaluacionId || !titulo) return res.status(400).json({ success: false, message: 'Evaluación y título son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const evalRs = await pool.request().input('id', sql.Int, evaluacionId).query('SELECT CE_AGENTE_ID as agenteId FROM CALIDAD_EVALUACIONES WHERE CE_ID = @id');
    if (evalRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    const agenteId = evalRs.recordset[0].agenteId;

    await pool.request()
      .input('evaluacionId', sql.Int, evaluacionId)
      .input('agenteId', sql.Int, agenteId)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('fechaLimite', sql.Date, fechaLimite || null)
      .input('creadoPor', sql.SmallInt, req.user?.id ?? null)
      .query(`
        INSERT INTO CALIDAD_PLANES_MEJORA (CPM_EVALUACION_ID, CPM_AGENTE_ID, CPM_TITULO, CPM_DESCRIPCION, CPM_FECHA_LIMITE, CPM_CREADO_POR)
        VALUES (@evaluacionId, @agenteId, @titulo, @descripcion, @fechaLimite, @creadoPor)
      `);
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('calidadController.crearPlanMejora', err);
    res.status(500).json({ success: false, message: 'Error al crear el plan de mejora' });
  }
}

// PATCH /api/calidad/planes-mejora/:id/estatus — el admin/evaluador cambia el estatus;
// el propio agente asignado también puede marcar su plan como completado.
async function actualizarEstatusPlanMejora(req, res) {
  try {
    const { id } = req.params;
    const { estatus } = req.body;
    if (!['pendiente', 'en_progreso', 'completado'].includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);

    const req1 = pool.request().input('id', sql.Int, id).input('estatus', sql.NVarChar, estatus);
    let where = 'WHERE CPM_ID = @id';
    if (!esAdmin) {
      req1.input('agenteId', sql.Int, uid);
      where += ' AND CPM_AGENTE_ID = @agenteId';
    }
    if (estatus === 'completado') {
      req1.input('completadoPor', sql.SmallInt, uid ?? null);
      const rs = await req1.query(`UPDATE CALIDAD_PLANES_MEJORA SET CPM_ESTATUS = @estatus, CPM_COMPLETADO_POR = @completadoPor, CPM_FECHA_COMPLETADO = GETDATE() ${where}`);
      if (rs.rowsAffected[0] === 0) return res.status(404).json({ success: false, message: 'Plan de mejora no encontrado' });
    } else {
      const rs = await req1.query(`UPDATE CALIDAD_PLANES_MEJORA SET CPM_ESTATUS = @estatus, CPM_COMPLETADO_POR = NULL, CPM_FECHA_COMPLETADO = NULL ${where}`);
      if (rs.rowsAffected[0] === 0) return res.status(404).json({ success: false, message: 'Plan de mejora no encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.actualizarEstatusPlanMejora', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el estatus del plan' });
  }
}

async function eliminarPlanMejora(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CALIDAD_PLANES_MEJORA WHERE CPM_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.eliminarPlanMejora', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el plan de mejora' });
  }
}

/* ── Cumplimiento de procesos: catálogo de procesos con checklist de pasos, y registros
   de evaluación de cumplimiento por agente/fecha (con % calculado automáticamente). ── */

// GET /api/calidad/procesos — catálogo de procesos activos, con sus pasos.
async function listProcesos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT CP_ID as id, CP_NOMBRE as nombre, CP_DESCRIPCION as descripcion, CP_PASOS_JSON as pasosJson, CP_ACTIVO as activo
      FROM CALIDAD_PROCESOS WHERE CP_ACTIVO = 1 ORDER BY CP_NOMBRE
    `);
    const data = rs.recordset.map((p) => ({ ...p, pasos: JSON.parse(p.pasosJson || '[]'), pasosJson: undefined }));
    res.json({ success: true, data });
  } catch (err) {
    logger.error('calidadController.listProcesos', err);
    res.status(500).json({ success: false, message: 'Error al listar los procesos' });
  }
}

// POST /api/calidad/procesos — crea un proceso con su checklist (pasos: string[]).
async function crearProceso(req, res) {
  try {
    const { nombre, descripcion, pasos } = req.body;
    if (!nombre || !Array.isArray(pasos) || pasos.length === 0) {
      return res.status(400).json({ success: false, message: 'Nombre y al menos un paso son requeridos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('pasosJson', sql.NVarChar, JSON.stringify(pasos))
      .input('creadoPor', sql.SmallInt, req.user?.id ?? null)
      .query(`INSERT INTO CALIDAD_PROCESOS (CP_NOMBRE, CP_DESCRIPCION, CP_PASOS_JSON, CP_CREADO_POR) VALUES (@nombre, @descripcion, @pasosJson, @creadoPor)`);
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('calidadController.crearProceso', err);
    res.status(500).json({ success: false, message: 'Error al crear el proceso' });
  }
}

async function eliminarProceso(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('UPDATE CALIDAD_PROCESOS SET CP_ACTIVO = 0 WHERE CP_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.eliminarProceso', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el proceso' });
  }
}

// GET /api/calidad/procesos/registros?procesoId=&agenteId= — listado de registros de
// cumplimiento, filtrable.
async function listRegistrosProceso(req, res) {
  try {
    const { procesoId, agenteId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const req1 = pool.request();
    const filtros = [];
    if (procesoId) { req1.input('procesoId', sql.Int, procesoId); filtros.push('r.CPR_PROCESO_ID = @procesoId'); }
    if (agenteId) { req1.input('agenteId', sql.Int, agenteId); filtros.push('r.CPR_AGENTE_ID = @agenteId'); }
    const rs = await req1.query(`
      SELECT r.CPR_ID as id, r.CPR_PROCESO_ID as procesoId, p.CP_NOMBRE as procesoNombre,
             r.CPR_AGENTE_ID as agenteId, u.NEUS_NOMBRES as agenteNombre, r.CPR_EVALUADOR_ID as evaluadorId,
             r.CPR_PASOS_JSON as pasosJson, r.CPR_PCT_CUMPLIMIENTO as pctCumplimiento, r.CPR_NOTAS as notas, r.CPR_FECHA as fecha
      FROM CALIDAD_PROCESOS_REGISTROS r
      INNER JOIN CALIDAD_PROCESOS p ON p.CP_ID = r.CPR_PROCESO_ID
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = r.CPR_AGENTE_ID
      ${filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : ''}
      ORDER BY r.CPR_FECHA DESC
    `);
    const data = rs.recordset.map((r) => ({ ...r, pasos: JSON.parse(r.pasosJson || '[]'), pasosJson: undefined }));
    res.json({ success: true, data });
  } catch (err) {
    logger.error('calidadController.listRegistrosProceso', err);
    res.status(500).json({ success: false, message: 'Error al listar los registros de cumplimiento' });
  }
}

// POST /api/calidad/procesos/registros — registra el cumplimiento de un proceso para
// un agente; pasos: [{ nombre, cumplido: bool }]. El % se calcula en el servidor.
async function crearRegistroProceso(req, res) {
  try {
    const { procesoId, agenteId, pasos, notas } = req.body;
    if (!procesoId || !agenteId || !Array.isArray(pasos) || pasos.length === 0) {
      return res.status(400).json({ success: false, message: 'Proceso, agente y checklist de pasos son requeridos' });
    }
    const cumplidos = pasos.filter((p) => p.cumplido).length;
    const pct = Math.round((cumplidos / pasos.length) * 1000) / 10;

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('procesoId', sql.Int, procesoId)
      .input('agenteId', sql.Int, agenteId)
      .input('evaluadorId', sql.SmallInt, req.user?.id ?? null)
      .input('pasosJson', sql.NVarChar, JSON.stringify(pasos))
      .input('pct', sql.Decimal(5, 2), pct)
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        INSERT INTO CALIDAD_PROCESOS_REGISTROS (CPR_PROCESO_ID, CPR_AGENTE_ID, CPR_EVALUADOR_ID, CPR_PASOS_JSON, CPR_PCT_CUMPLIMIENTO, CPR_NOTAS)
        VALUES (@procesoId, @agenteId, @evaluadorId, @pasosJson, @pct, @notas)
      `);
    res.status(201).json({ success: true, data: { pctCumplimiento: pct } });
  } catch (err) {
    logger.error('calidadController.crearRegistroProceso', err);
    res.status(500).json({ success: false, message: 'Error al registrar el cumplimiento' });
  }
}

async function eliminarRegistroProceso(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CALIDAD_PROCESOS_REGISTROS WHERE CPR_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.eliminarRegistroProceso', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el registro' });
  }
}

/* ── Auditorías: evento formal que agrupa varios registros de Cumplimiento de procesos
   en un veredicto consolidado (aprobada/observaciones/no aprobada), con hallazgos
   generales. Capa de resumen ejecutivo sobre los registros ya capturados. ── */

async function listAuditorias(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT a.CA_ID as id, a.CA_TITULO as titulo, a.CA_ALCANCE as alcance,
             a.CA_PERIODO_INICIO as periodoInicio, a.CA_PERIODO_FIN as periodoFin,
             a.CA_AUDITOR_ID as auditorId, a.CA_VEREDICTO as veredicto, a.CA_HALLAZGOS as hallazgos,
             a.CA_FECHA_CIERRE as fechaCierre, a.CA_FECHA_CREACION as fechaCreacion,
             (SELECT COUNT(*) FROM CALIDAD_AUDITORIAS_REGISTROS r WHERE r.CAR_AUDITORIA_ID = a.CA_ID) as totalRegistros,
             (SELECT AVG(pr.CPR_PCT_CUMPLIMIENTO) FROM CALIDAD_AUDITORIAS_REGISTROS r
                INNER JOIN CALIDAD_PROCESOS_REGISTROS pr ON pr.CPR_ID = r.CAR_REGISTRO_ID
                WHERE r.CAR_AUDITORIA_ID = a.CA_ID) as promedioCumplimiento
      FROM CALIDAD_AUDITORIAS a
      ORDER BY a.CA_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.listAuditorias', err);
    res.status(500).json({ success: false, message: 'Error al listar las auditorías' });
  }
}

// GET /api/calidad/auditorias/:id — detalle con los registros de cumplimiento incluidos.
async function getAuditoria(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const audRs = await pool.request().input('id', sql.Int, id).query(`
      SELECT CA_ID as id, CA_TITULO as titulo, CA_ALCANCE as alcance,
             CA_PERIODO_INICIO as periodoInicio, CA_PERIODO_FIN as periodoFin,
             CA_AUDITOR_ID as auditorId, CA_VEREDICTO as veredicto, CA_HALLAZGOS as hallazgos,
             CA_FECHA_CIERRE as fechaCierre, CA_FECHA_CREACION as fechaCreacion
      FROM CALIDAD_AUDITORIAS WHERE CA_ID = @id
    `);
    if (audRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Auditoría no encontrada' });

    const regRs = await pool.request().input('id', sql.Int, id).query(`
      SELECT r.CAR_ID as vinculoId, pr.CPR_ID as registroId, pr.CPR_AGENTE_ID as agenteId,
             u.NEUS_NOMBRES as agenteNombre, p.CP_NOMBRE as procesoNombre,
             pr.CPR_PCT_CUMPLIMIENTO as pctCumplimiento, pr.CPR_FECHA as fecha
      FROM CALIDAD_AUDITORIAS_REGISTROS r
      INNER JOIN CALIDAD_PROCESOS_REGISTROS pr ON pr.CPR_ID = r.CAR_REGISTRO_ID
      INNER JOIN CALIDAD_PROCESOS p ON p.CP_ID = pr.CPR_PROCESO_ID
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = pr.CPR_AGENTE_ID
      WHERE r.CAR_AUDITORIA_ID = @id
      ORDER BY pr.CPR_FECHA DESC
    `);

    res.json({ success: true, data: { ...audRs.recordset[0], registros: regRs.recordset } });
  } catch (err) {
    logger.error('calidadController.getAuditoria', err);
    res.status(500).json({ success: false, message: 'Error al obtener la auditoría' });
  }
}

async function crearAuditoria(req, res) {
  try {
    const { titulo, alcance, periodoInicio, periodoFin, registroIds } = req.body;
    if (!titulo) return res.status(400).json({ success: false, message: 'Título requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('titulo', sql.NVarChar, titulo)
      .input('alcance', sql.NVarChar, alcance || null)
      .input('periodoInicio', sql.Date, periodoInicio || null)
      .input('periodoFin', sql.Date, periodoFin || null)
      .input('auditorId', sql.SmallInt, req.user?.id ?? null)
      .query(`
        INSERT INTO CALIDAD_AUDITORIAS (CA_TITULO, CA_ALCANCE, CA_PERIODO_INICIO, CA_PERIODO_FIN, CA_AUDITOR_ID)
        OUTPUT INSERTED.CA_ID as id
        VALUES (@titulo, @alcance, @periodoInicio, @periodoFin, @auditorId)
      `);
    const auditoriaId = rs.recordset[0].id;

    if (Array.isArray(registroIds) && registroIds.length > 0) {
      for (const registroId of registroIds) {
        await pool.request()
          .input('auditoriaId', sql.Int, auditoriaId)
          .input('registroId', sql.Int, registroId)
          .query('INSERT INTO CALIDAD_AUDITORIAS_REGISTROS (CAR_AUDITORIA_ID, CAR_REGISTRO_ID) VALUES (@auditoriaId, @registroId)');
      }
    }
    res.status(201).json({ success: true, data: { id: auditoriaId } });
  } catch (err) {
    logger.error('calidadController.crearAuditoria', err);
    res.status(500).json({ success: false, message: 'Error al crear la auditoría' });
  }
}

async function agregarRegistroAuditoria(req, res) {
  try {
    const { id } = req.params;
    const { registroId } = req.body;
    if (!registroId) return res.status(400).json({ success: false, message: 'registroId requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    try {
      await pool.request()
        .input('auditoriaId', sql.Int, id)
        .input('registroId', sql.Int, registroId)
        .query('INSERT INTO CALIDAD_AUDITORIAS_REGISTROS (CAR_AUDITORIA_ID, CAR_REGISTRO_ID) VALUES (@auditoriaId, @registroId)');
      res.status(201).json({ success: true });
    } catch (dbErr) {
      if (dbErr.number === 2601 || dbErr.number === 2627) return res.status(409).json({ success: false, message: 'Ese registro ya está incluido en la auditoría' });
      throw dbErr;
    }
  } catch (err) {
    logger.error('calidadController.agregarRegistroAuditoria', err);
    res.status(500).json({ success: false, message: 'Error al agregar el registro a la auditoría' });
  }
}

async function quitarRegistroAuditoria(req, res) {
  try {
    const { id, registroId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).input('registroId', sql.Int, registroId)
      .query('DELETE FROM CALIDAD_AUDITORIAS_REGISTROS WHERE CAR_AUDITORIA_ID = @id AND CAR_REGISTRO_ID = @registroId');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.quitarRegistroAuditoria', err);
    res.status(500).json({ success: false, message: 'Error al quitar el registro de la auditoría' });
  }
}

// PATCH /api/calidad/auditorias/:id/cerrar — fija el veredicto final y los hallazgos.
async function cerrarAuditoria(req, res) {
  try {
    const { id } = req.params;
    const { veredicto, hallazgos } = req.body;
    if (!['aprobada', 'observaciones', 'no_aprobada'].includes(veredicto)) {
      return res.status(400).json({ success: false, message: 'Veredicto inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('veredicto', sql.NVarChar, veredicto)
      .input('hallazgos', sql.NVarChar, hallazgos || null)
      .query(`UPDATE CALIDAD_AUDITORIAS SET CA_VEREDICTO = @veredicto, CA_HALLAZGOS = @hallazgos, CA_FECHA_CIERRE = GETDATE() WHERE CA_ID = @id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.cerrarAuditoria', err);
    res.status(500).json({ success: false, message: 'Error al cerrar la auditoría' });
  }
}

async function eliminarAuditoria(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CALIDAD_AUDITORIAS WHERE CA_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.eliminarAuditoria', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la auditoría' });
  }
}

/* ── Detección de errores: bitácora de errores detectados con severidad y estatus de
   resolución, vinculable opcionalmente a una evaluación existente. ── */

// GET /api/calidad/errores?estatus=&severidad=&agenteId= — listado filtrable.
async function listErrores(req, res) {
  try {
    const { estatus, severidad, agenteId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const req1 = pool.request();
    const filtros = [];
    if (estatus) { req1.input('estatus', sql.NVarChar, estatus); filtros.push('e.CER_ESTATUS = @estatus'); }
    if (severidad) { req1.input('severidad', sql.NVarChar, severidad); filtros.push('e.CER_SEVERIDAD = @severidad'); }
    if (agenteId) { req1.input('agenteId', sql.Int, agenteId); filtros.push('e.CER_AGENTE_ID = @agenteId'); }
    const rs = await req1.query(`
      SELECT e.CER_ID as id, e.CER_AGENTE_ID as agenteId, u.NEUS_NOMBRES as agenteNombre,
             e.CER_EVALUACION_ID as evaluacionId, e.CER_CATEGORIA as categoria, e.CER_SEVERIDAD as severidad,
             e.CER_DESCRIPCION as descripcion, e.CER_ESTATUS as estatus, e.CER_DETECTADO_POR as detectadoPor,
             e.CER_RESUELTO_POR as resueltoPor, e.CER_FECHA_RESOLUCION as fechaResolucion,
             e.CER_NOTAS_RESOLUCION as notasResolucion, e.CER_FECHA as fecha
      FROM CALIDAD_ERRORES e
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = e.CER_AGENTE_ID
      ${filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : ''}
      ORDER BY e.CER_FECHA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('calidadController.listErrores', err);
    res.status(500).json({ success: false, message: 'Error al listar los errores' });
  }
}

// GET /api/calidad/errores/resumen — conteo por severidad y por categoría (top 10).
async function getResumenErrores(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const porSeveridadRs = await pool.request().query(`
      SELECT CER_SEVERIDAD as severidad, COUNT(*) as total
      FROM CALIDAD_ERRORES WHERE CER_ESTATUS = 'abierto'
      GROUP BY CER_SEVERIDAD
    `);
    const porCategoriaRs = await pool.request().query(`
      SELECT TOP 10 CER_CATEGORIA as categoria, COUNT(*) as total
      FROM CALIDAD_ERRORES
      GROUP BY CER_CATEGORIA
      ORDER BY total DESC
    `);
    const totalRs = await pool.request().query(`
      SELECT SUM(CASE WHEN CER_ESTATUS = 'abierto' THEN 1 ELSE 0 END) as abiertos,
             SUM(CASE WHEN CER_ESTATUS = 'resuelto' THEN 1 ELSE 0 END) as resueltos
      FROM CALIDAD_ERRORES
    `);
    res.json({
      success: true,
      data: {
        abiertos: totalRs.recordset[0].abiertos || 0,
        resueltos: totalRs.recordset[0].resueltos || 0,
        porSeveridad: porSeveridadRs.recordset,
        porCategoria: porCategoriaRs.recordset,
      },
    });
  } catch (err) {
    logger.error('calidadController.getResumenErrores', err);
    res.status(500).json({ success: false, message: 'Error al obtener el resumen de errores' });
  }
}

async function crearError(req, res) {
  try {
    const { agenteId, evaluacionId, categoria, severidad, descripcion } = req.body;
    if (!agenteId || !categoria || !descripcion) return res.status(400).json({ success: false, message: 'Agente, categoría y descripción son requeridos' });
    if (severidad && !['leve', 'moderado', 'grave'].includes(severidad)) return res.status(400).json({ success: false, message: 'Severidad inválida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('agenteId', sql.Int, agenteId)
      .input('evaluacionId', sql.Int, evaluacionId || null)
      .input('categoria', sql.NVarChar, categoria)
      .input('severidad', sql.NVarChar, severidad || 'leve')
      .input('descripcion', sql.NVarChar, descripcion)
      .input('detectadoPor', sql.SmallInt, req.user?.id ?? null)
      .query(`
        INSERT INTO CALIDAD_ERRORES (CER_AGENTE_ID, CER_EVALUACION_ID, CER_CATEGORIA, CER_SEVERIDAD, CER_DESCRIPCION, CER_DETECTADO_POR)
        VALUES (@agenteId, @evaluacionId, @categoria, @severidad, @descripcion, @detectadoPor)
      `);
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('calidadController.crearError', err);
    res.status(500).json({ success: false, message: 'Error al registrar el error' });
  }
}

// PATCH /api/calidad/errores/:id/resolver
async function resolverError(req, res) {
  try {
    const { id } = req.params;
    const { notasResolucion } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .input('resueltoPor', sql.SmallInt, req.user?.id ?? null)
      .input('notas', sql.NVarChar, notasResolucion || null)
      .query(`
        UPDATE CALIDAD_ERRORES
        SET CER_ESTATUS = 'resuelto', CER_RESUELTO_POR = @resueltoPor, CER_FECHA_RESOLUCION = GETDATE(), CER_NOTAS_RESOLUCION = @notas
        WHERE CER_ID = @id
      `);
    if (rs.rowsAffected[0] === 0) return res.status(404).json({ success: false, message: 'Error no encontrado' });
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.resolverError', err);
    res.status(500).json({ success: false, message: 'Error al resolver el registro' });
  }
}

async function eliminarError(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CALIDAD_ERRORES WHERE CER_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('calidadController.eliminarError', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el registro' });
  }
}

module.exports = {
  listEvaluaciones,
  crearEvaluacion,
  getDashboard,
  listRetroalimentaciones,
  getMiRetroalimentacion,
  crearRetroalimentacion,
  marcarRetroalimentacionVista,
  eliminarRetroalimentacion,
  listPlanesMejora,
  getMisPlanesMejora,
  crearPlanMejora,
  actualizarEstatusPlanMejora,
  eliminarPlanMejora,
  listProcesos,
  crearProceso,
  eliminarProceso,
  listRegistrosProceso,
  crearRegistroProceso,
  eliminarRegistroProceso,
  listAuditorias,
  getAuditoria,
  crearAuditoria,
  agregarRegistroAuditoria,
  quitarRegistroAuditoria,
  cerrarAuditoria,
  eliminarAuditoria,
  listErrores,
  getResumenErrores,
  crearError,
  resolverError,
  eliminarError,
};
