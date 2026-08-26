const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Criterios fijos del formulario: key → { label, subitems }
const CRITERIOS = [
  { key: 'puntualidad',           label: 'Puntualidad',            subitems: 3 },
  { key: 'imagen_profesional',    label: 'Imagen profesional',      subitems: 3 },
  { key: 'presentacion_correcta', label: 'Presentación correcta',   subitems: 2 },
  { key: 'speech_autorizado',     label: 'Speech autorizado',       subitems: 2 },
  { key: 'sondeo_necesidades',    label: 'Sondeo de necesidades',   subitems: 2 },
  { key: 'comunicacion_efectiva', label: 'Comunicación efectiva',   subitems: 3 },
  { key: 'beneficios_plata',      label: 'Beneficios Plata Card',   subitems: 3 },
  { key: 'manejo_objeciones',     label: 'Manejo de objeciones',    subitems: 3 },
  { key: 'validacion_requisitos', label: 'Validación de requisitos',subitems: 3 },
  { key: 'aviso_privacidad',      label: 'Aviso de privacidad',     subitems: 3 },
  { key: 'cierre_venta',          label: 'Cierre de venta',         subitems: 3 },
  { key: 'apego_procesos',        label: 'Apego a procesos',        subitems: 3 },
  { key: 'resultado_diario',      label: 'Resultado diario',        subitems: 2 },
  { key: 'nivel',                 label: 'Nivel',                   subitems: 3 },
  { key: 'capturo',               label: 'Capturó',                 subitems: 2 },
];

// Puntos máximos: 1 subitem por criterio × 6 días × 2 pts máx
// (el frontend solo guarda subitem=1 por criterio)
const MAX_PUNTOS = CRITERIOS.length * 6 * 2;

// Calcula calificación /100 a partir de los registros de detalle (subitem=1 únicamente)
function calcCalificacion(detalle) {
  const soloSubitem1 = detalle.filter(r => r.SUBITEM === 1 || r.SUBITEM === undefined);
  const suma = soloSubitem1.reduce((s, r) => s + (r.VALOR ?? 0), 0);
  return MAX_PUNTOS > 0 ? Math.round((suma / MAX_PUNTOS) * 10000) / 100 : 0;
}

async function ensureTables(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='EVAL_CAPACITACION')
      CREATE TABLE EVAL_CAPACITACION (
        ID                  INT IDENTITY PRIMARY KEY,
        AGENTE_ID           INT NOT NULL,
        SUPERVISOR_ID       INT NOT NULL,
        AGENTE_NOMBRE       NVARCHAR(200) NULL,
        SUPERVISOR_NOMBRE   NVARCHAR(200) NULL,
        SEMANA_INICIO       DATE NOT NULL,
        FORTALEZAS          NVARCHAR(MAX) NULL,
        AREAS_OPORTUNIDAD   NVARCHAR(MAX) NULL,
        PLAN_ACCION         NVARCHAR(MAX) NULL,
        CALIFICACION        DECIMAL(5,2) NULL,
        ESTADO              NVARCHAR(20) NOT NULL DEFAULT 'borrador',
        FECHA_CREACION      DATETIME NOT NULL DEFAULT GETDATE(),
        FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE()
      );
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='EVAL_CAPACITACION_DETALLE')
      CREATE TABLE EVAL_CAPACITACION_DETALLE (
        ID           INT IDENTITY PRIMARY KEY,
        EVAL_ID      INT NOT NULL,
        CRITERIO_KEY NVARCHAR(50) NOT NULL,
        SUBITEM      TINYINT NOT NULL,
        DIA          TINYINT NOT NULL,
        VALOR        TINYINT NULL
      );
  `);
}

// GET /api/eval-capacitacion — lista (AD: todas, CC: las suyas)
exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTables(pool);
    const rol    = (req.user?.tipoUsuario || '').toUpperCase();
    const userId = req.user?.id;

    let query = `
      SELECT e.ID as id, e.AGENTE_ID as agenteId, e.AGENTE_NOMBRE as agenteNombre,
             e.SUPERVISOR_ID as supervisorId, e.SUPERVISOR_NOMBRE as supervisorNombre,
             CONVERT(VARCHAR(10), e.SEMANA_INICIO, 23) as semanaInicio,
             e.CALIFICACION as calificacion, e.ESTADO as estado,
             CONVERT(VARCHAR(10), e.FECHA_CREACION, 23) as fechaCreacion
      FROM EVAL_CAPACITACION e
    `;
    const request = pool.request();
    if (rol === 'CC') {
      query += ' WHERE e.AGENTE_ID = @uid';
      request.input('uid', sql.Int, userId);
    }
    query += ' ORDER BY e.FECHA_CREACION DESC';

    const r = await request.query(query);
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('[eval-cap] getAll error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/eval-capacitacion — crear (solo AD)
exports.create = async (req, res) => {
  try {
    const rol = (req.user?.tipoUsuario || '').toUpperCase();
    if (rol !== 'AD') return res.status(403).json({ success: false, message: 'Solo supervisores AD pueden crear evaluaciones' });

    const { agenteId, semanaInicio } = req.body;
    if (!agenteId || !semanaInicio) return res.status(400).json({ success: false, message: 'agenteId y semanaInicio son requeridos' });

    const supervisorId = req.user.id;
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTables(pool);

    // Obtener nombres
    const nombresR = await pool.request()
      .input('aid', sql.Int, Number(agenteId))
      .input('sid', sql.Int, supervisorId)
      .query(`
        SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (@aid, @sid)
      `);
    const agenteNombre    = nombresR.recordset.find((r) => r.id === Number(agenteId))?.nombre ?? null;
    const supervisorNombre = nombresR.recordset.find((r) => r.id === supervisorId)?.nombre ?? null;

    const r = await pool.request()
      .input('aid',  sql.Int,      Number(agenteId))
      .input('sid',  sql.Int,      supervisorId)
      .input('an',   sql.NVarChar, agenteNombre)
      .input('sn',   sql.NVarChar, supervisorNombre)
      .input('sem',  sql.Date,     new Date(semanaInicio + 'T12:00:00'))
      .query(`
        INSERT INTO EVAL_CAPACITACION (AGENTE_ID, SUPERVISOR_ID, AGENTE_NOMBRE, SUPERVISOR_NOMBRE, SEMANA_INICIO)
        OUTPUT INSERTED.ID
        VALUES (@aid, @sid, @an, @sn, @sem)
      `);

    return res.status(201).json({ success: true, id: r.recordset[0].ID });
  } catch (e) {
    console.error('[eval-cap] create error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/eval-capacitacion/:id — detalle con grid
exports.getById = async (req, res) => {
  try {
    const evalId = Number(req.params.id);
    const rol    = (req.user?.tipoUsuario || '').toUpperCase();
    const userId = req.user?.id;

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTables(pool);

    const evalR = await pool.request()
      .input('id', sql.Int, evalId)
      .query(`
        SELECT ID as id, AGENTE_ID as agenteId, AGENTE_NOMBRE as agenteNombre,
               SUPERVISOR_ID as supervisorId, SUPERVISOR_NOMBRE as supervisorNombre,
               CONVERT(VARCHAR(10), SEMANA_INICIO, 23) as semanaInicio,
               ISNULL(FORTALEZAS,'') as fortalezas,
               ISNULL(AREAS_OPORTUNIDAD,'') as areasOportunidad,
               ISNULL(PLAN_ACCION,'') as planAccion,
               CALIFICACION as calificacion, ESTADO as estado
        FROM EVAL_CAPACITACION WHERE ID = @id
      `);
    const eval_ = evalR.recordset[0];
    if (!eval_) return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });

    // CC solo puede ver la suya
    if (rol === 'CC' && eval_.agenteId !== userId) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const detalleR = await pool.request()
      .input('eid', sql.Int, evalId)
      .query('SELECT CRITERIO_KEY as criterioKey, SUBITEM as subitem, DIA as dia, VALOR as valor FROM EVAL_CAPACITACION_DETALLE WHERE EVAL_ID=@eid');

    return res.json({ success: true, data: { ...eval_, detalle: detalleR.recordset, criterios: CRITERIOS } });
  } catch (e) {
    console.error('[eval-cap] getById error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// PUT /api/eval-capacitacion/:id — guardar grid + resumen (solo AD)
exports.update = async (req, res) => {
  try {
    const rol = (req.user?.tipoUsuario || '').toUpperCase();
    console.log('[update] rol:', rol, 'params:', req.params, 'detalle.length:', req.body?.detalle?.length);
    if (rol !== 'AD') return res.status(403).json({ success: false, message: 'No autorizado' });

    const evalId = Number(req.params.id);
    const { detalle, fortalezas, areasOportunidad, planAccion } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTables(pool);

    const evalR = await pool.request()
      .input('id', sql.Int, evalId)
      .query("SELECT ESTADO FROM EVAL_CAPACITACION WHERE ID=@id");
    if (!evalR.recordset[0]) return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    if (evalR.recordset[0].ESTADO === 'finalizado') return res.status(400).json({ success: false, message: 'La evaluación ya está finalizada' });

    // Bulk replace: delete all for this eval then insert all at once
    if (Array.isArray(detalle) && detalle.length > 0) {
      await pool.request()
        .input('eid', sql.Int, evalId)
        .query('DELETE FROM EVAL_CAPACITACION_DETALLE WHERE EVAL_ID=@eid');

      // Build a single INSERT with multiple VALUES rows
      const rows = detalle
        .filter(d => d.valor !== null && d.valor !== undefined)
        .map(d => `(${evalId}, N'${String(d.criterioKey ?? d.key).replace(/'/g, "''")}', ${Number(d.subitem)}, ${Number(d.dia)}, ${Number(d.valor)})`)
        .join(',\n');

      if (rows) {
        await pool.request().query(
          `INSERT INTO EVAL_CAPACITACION_DETALLE (EVAL_ID, CRITERIO_KEY, SUBITEM, DIA, VALOR) VALUES ${rows}`
        );
      }
    }

    await pool.request()
      .input('id', sql.Int,      evalId)
      .input('f',  sql.NVarChar, fortalezas ?? '')
      .input('ao', sql.NVarChar, areasOportunidad ?? '')
      .input('pa', sql.NVarChar, planAccion ?? '')
      .query(`
        UPDATE EVAL_CAPACITACION SET FORTALEZAS=@f, AREAS_OPORTUNIDAD=@ao, PLAN_ACCION=@pa, FECHA_ACTUALIZACION=GETDATE()
        WHERE ID=@id
      `);

    return res.json({ success: true });
  } catch (e) {
    console.error('[eval-cap] update error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// PATCH /api/eval-capacitacion/:id/finalizar — calcula calificación y cierra (solo AD)
exports.finalizar = async (req, res) => {
  try {
    const rol = (req.user?.tipoUsuario || '').toUpperCase();
    console.log('[finalizar] rol:', rol, 'user:', req.user?.id, 'params:', req.params);
    if (rol !== 'AD') return res.status(403).json({ success: false, message: 'No autorizado' });

    const evalId = Number(req.params.id);
    console.log('[finalizar] evalId:', evalId);
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTables(pool);

    const detalleR = await pool.request()
      .input('eid', sql.Int, evalId)
      .query('SELECT SUBITEM, VALOR FROM EVAL_CAPACITACION_DETALLE WHERE EVAL_ID=@eid');

    const calificacion = calcCalificacion(detalleR.recordset);
    console.log('[finalizar] rows:', detalleR.recordset.length, 'calificacion:', calificacion);

    await pool.request()
      .input('id',  sql.Int,   evalId)
      .input('cal', sql.Float, calificacion)
      .query(`UPDATE EVAL_CAPACITACION SET ESTADO='finalizado', CALIFICACION=ROUND(@cal,2), FECHA_ACTUALIZACION=GETDATE() WHERE ID=@id`);

    return res.json({ success: true, calificacion });
  } catch (e) {
    console.error('[eval-cap] finalizar error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/eval-capacitacion/:id — solo borradores (solo AD)
exports.delete_ = async (req, res) => {
  try {
    const rol = (req.user?.tipoUsuario || '').toUpperCase();
    if (rol !== 'AD') return res.status(403).json({ success: false, message: 'No autorizado' });

    const evalId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);

    const evalR = await pool.request()
      .input('id', sql.Int, evalId)
      .query("SELECT ESTADO FROM EVAL_CAPACITACION WHERE ID=@id");
    if (!evalR.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (evalR.recordset[0].ESTADO === 'finalizado') return res.status(400).json({ success: false, message: 'No se puede eliminar una evaluación finalizada' });

    await pool.request().input('id', sql.Int, evalId)
      .query('DELETE FROM EVAL_CAPACITACION_DETALLE WHERE EVAL_ID=@id');
    await pool.request().input('id', sql.Int, evalId)
      .query('DELETE FROM EVAL_CAPACITACION WHERE ID=@id');

    return res.json({ success: true });
  } catch (e) {
    console.error('[eval-cap] delete error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};
