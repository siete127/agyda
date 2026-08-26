const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { upsertKpi } = require('./areasController');
const logger = global.logger || require('../utils/logger');

async function listCampanias(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT CC_ID as id, CC_NOMBRE as nombre, CC_ESTATUS as estatus, CC_FECHA_INICIO as fechaInicio
      FROM CC_CAMPANIAS ORDER BY CC_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('operacionesController.listCampanias', err);
    res.status(500).json({ success: false, message: 'Error al listar campañas' });
  }
}

async function crearCampania(req, res) {
  try {
    const { nombre, estatus, fechaInicio } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('estatus', sql.NVarChar, estatus || 'activa')
      .input('fechaInicio', sql.Date, fechaInicio || null)
      .query(`INSERT INTO CC_CAMPANIAS (CC_NOMBRE, CC_ESTATUS, CC_FECHA_INICIO) VALUES (@nombre, @estatus, @fechaInicio)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.crearCampania', err);
    res.status(500).json({ success: false, message: 'Error al crear campaña' });
  }
}

async function listAsignaciones(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT CAB_ID as id, CAB_CAMPANIA_ID as campaniaId, CAB_AGENTE_ID as agenteId,
             CAB_CANTIDAD_REGISTROS as cantidadRegistros, CAB_FECHA as fecha
      FROM CC_ASIGNACION_BASE ORDER BY CAB_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('operacionesController.listAsignaciones', err);
    res.status(500).json({ success: false, message: 'Error al listar asignaciones' });
  }
}

async function crearAsignacion(req, res) {
  try {
    const { campaniaId, agenteId, cantidadRegistros } = req.body;
    if (!campaniaId || !agenteId) return res.status(400).json({ success: false, message: 'Campaña y agente requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .input('agenteId', sql.Int, agenteId)
      .input('cantidadRegistros', sql.Int, cantidadRegistros || 0)
      .query(`INSERT INTO CC_ASIGNACION_BASE (CAB_CAMPANIA_ID, CAB_AGENTE_ID, CAB_CANTIDAD_REGISTROS) VALUES (@campaniaId, @agenteId, @cantidadRegistros)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.crearAsignacion', err);
    res.status(500).json({ success: false, message: 'Error al crear asignación' });
  }
}

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const campaniasRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM CC_CAMPANIAS WHERE CC_ESTATUS = 'activa'
    `);
    const campaniasActivas = campaniasRs.recordset[0].total;

    const totalRs = await pool.request().query(`
      SELECT ISNULL(SUM(CAB_CANTIDAD_REGISTROS), 0) as total
      FROM CC_ASIGNACION_BASE
      WHERE MONTH(CAB_FECHA) = MONTH(GETDATE()) AND YEAR(CAB_FECHA) = YEAR(GETDATE())
    `);
    const totalAsignado = totalRs.recordset[0].total;

    const porCampaniaRs = await pool.request().query(`
      SELECT TOP 10 c.CC_NOMBRE as campania, SUM(a.CAB_CANTIDAD_REGISTROS) as count
      FROM CC_ASIGNACION_BASE a
      JOIN CC_CAMPANIAS c ON c.CC_ID = a.CAB_CAMPANIA_ID
      GROUP BY c.CC_NOMBRE
      ORDER BY count DESC
    `);

    await upsertKpi({ tenantKey: req.user?.empresa, areaKey: 'operaciones', kpiKey: 'campanias_activas', label: 'Campañas activas', valor: campaniasActivas, unidad: '', tono: 'brand' });

    res.json({
      success: true,
      data: {
        campaniasActivas,
        totalAsignado,
        porCampania: porCampaniaRs.recordset,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
}

/* ── Supervisores: asignación a campañas + panel de agentes con estado en vivo ── */

// Estados de pausa según USUARIO_TIEMPOS.status_id (mismo mapeo que reportController.js)
const PAUSA_LABELS = { 2: 'baño', 3: 'comida', 5: 'capacitación', 6: 'permiso' };

async function listSupervisores(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT cs.CS_ID as id, cs.CS_CAMPANIA_ID as campaniaId, c.CC_NOMBRE as campaniaNombre,
             cs.CS_SUPERVISOR_ID as supervisorId, u.NEUS_NOMBRES as supervisorNombre
      FROM CC_CAMPANIAS_SUPERVISORES cs
      INNER JOIN CC_CAMPANIAS c ON c.CC_ID = cs.CS_CAMPANIA_ID
      INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = cs.CS_SUPERVISOR_ID
      ORDER BY c.CC_NOMBRE ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('operacionesController.listSupervisores', err);
    res.status(500).json({ success: false, message: 'Error al listar supervisores' });
  }
}

async function asignarSupervisor(req, res) {
  try {
    const { campaniaId, supervisorId } = req.body;
    if (!campaniaId || !supervisorId) return res.status(400).json({ success: false, message: 'Campaña y supervisor requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .input('supervisorId', sql.Int, supervisorId)
      .query('SELECT CS_ID FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID=@campaniaId AND CS_SUPERVISOR_ID=@supervisorId');
    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Ese supervisor ya está asignado a esta campaña' });
    }
    await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .input('supervisorId', sql.Int, supervisorId)
      .query('INSERT INTO CC_CAMPANIAS_SUPERVISORES (CS_CAMPANIA_ID, CS_SUPERVISOR_ID) VALUES (@campaniaId, @supervisorId)');
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('operacionesController.asignarSupervisor', err);
    res.status(500).json({ success: false, message: 'Error al asignar el supervisor' });
  }
}

async function quitarSupervisor(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.quitarSupervisor', err);
    res.status(500).json({ success: false, message: 'Error al quitar el supervisor' });
  }
}

// GET /api/operaciones/supervisores/mi-panel — agentes de las campañas asignadas al
// supervisor autenticado (o de TODAS las campañas si es AD/TI), con su estado actual
// (disponible / tipo de pausa) leído de USUARIO_TIEMPOS, sin necesidad de que el
// Webphone reporte nada — se apoya en el mismo mecanismo que ya usa PausaWidget.
async function getMiPanel(req, res) {
  try {
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const pool = await databaseService.getPool(req.user?.empresa);

    // Campañas visibles: todas si es AD/TI, o solo las asignadas si es supervisor específico.
    const campaniasReq = pool.request();
    let campaniasWhere = '';
    if (!esAdmin) {
      campaniasWhere = `WHERE c.CC_ID IN (SELECT CS_CAMPANIA_ID FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)`;
      campaniasReq.input('uid', sql.Int, uid);
    }
    const campaniasRs = await campaniasReq.query(`SELECT c.CC_ID as id, c.CC_NOMBRE as nombre FROM CC_CAMPANIAS c ${campaniasWhere}`);
    const campaniaIds = campaniasRs.recordset.map((c) => c.id);

    if (campaniaIds.length === 0) {
      return res.json({ success: true, data: { campanias: [], agentes: [] } });
    }

    // Agentes asignados a esas campañas (últimos 30 días de asignación, sin duplicar por agente+campaña).
    const agentesRs = await pool.request().query(`
      SELECT DISTINCT a.CAB_AGENTE_ID as agenteId, a.CAB_CAMPANIA_ID as campaniaId, u.NEUS_NOMBRES as nombre
      FROM CC_ASIGNACION_BASE a
      INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.CAB_AGENTE_ID
      WHERE a.CAB_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);

    if (agentesRs.recordset.length === 0) {
      return res.json({ success: true, data: { campanias: campaniasRs.recordset, agentes: [] } });
    }

    const agenteIds = [...new Set(agentesRs.recordset.map((a) => a.agenteId))];
    const pausasRs = await pool.request().query(`
      SELECT neus_id as agenteId, status_id as statusId, fecha_inicio as fechaInicio
      FROM USUARIO_TIEMPOS
      WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN (2,3,5,6)
    `);
    const pausaPorAgente = new Map(pausasRs.recordset.map((p) => [p.agenteId, p]));

    const agentes = agentesRs.recordset.map((a) => {
      const pausa = pausaPorAgente.get(a.agenteId);
      return {
        agenteId: a.agenteId,
        nombre: a.nombre,
        campaniaId: a.campaniaId,
        estado: pausa ? 'pausa' : 'disponible',
        tipoPausa: pausa ? (PAUSA_LABELS[pausa.statusId] ?? 'pausa') : null,
        pausaDesde: pausa ? pausa.fechaInicio : null,
      };
    });

    res.json({ success: true, data: { campanias: campaniasRs.recordset, agentes } });
  } catch (err) {
    logger.error('operacionesController.getMiPanel', err);
    res.status(500).json({ success: false, message: 'Error al obtener el panel de supervisor' });
  }
}

// GET /api/operaciones/supervisores/productividad?fecha=YYYY-MM-DD — minutos en
// pausa por tipo, por agente, del día indicado (o hoy). Mismo cálculo que ya usa
// getResumenGeneral en reportController.js, acotado a los agentes de mis campañas.
async function getProductividadDia(req, res) {
  try {
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString();
    const pool = await databaseService.getPool(req.user?.empresa);

    const campaniasReq = pool.request();
    let campaniasWhere = '';
    if (!esAdmin) {
      campaniasWhere = `WHERE CS_SUPERVISOR_ID = @uid`;
      campaniasReq.input('uid', sql.Int, uid);
    }
    const campaniaIdsRs = await campaniasReq.query(
      esAdmin
        ? 'SELECT CC_ID as id FROM CC_CAMPANIAS'
        : `SELECT DISTINCT CS_CAMPANIA_ID as id FROM CC_CAMPANIAS_SUPERVISORES ${campaniasWhere}`
    );
    const campaniaIds = campaniaIdsRs.recordset.map((c) => c.id);
    if (campaniaIds.length === 0) return res.json({ success: true, data: [] });

    const agentesRs = await pool.request().query(`
      SELECT DISTINCT CAB_AGENTE_ID as agenteId FROM CC_ASIGNACION_BASE WHERE CAB_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);
    const agenteIds = agentesRs.recordset.map((a) => a.agenteId);
    if (agenteIds.length === 0) return res.json({ success: true, data: [] });

    const pausasRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT neus_id as agenteId, status_id as statusId,
               SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutos
        FROM USUARIO_TIEMPOS
        WHERE neus_id IN (${agenteIds.join(',')})
          AND status_id IN (2,3,5,6)
          AND CAST(fecha_inicio AS date) = @fecha
        GROUP BY neus_id, status_id
      `);

    const usuariosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${agenteIds.join(',')})`);
    const nombrePorId = new Map(usuariosRs.recordset.map((u) => [u.id, u.nombre]));

    const porAgente = new Map();
    for (const id of agenteIds) porAgente.set(id, { agenteId: id, nombre: nombrePorId.get(id) ?? '', banio: 0, comida: 0, capacitacion: 0, permiso: 0, totalPausaMin: 0 });
    for (const p of pausasRs.recordset) {
      const row = porAgente.get(p.agenteId);
      if (!row) continue;
      const key = { 2: 'banio', 3: 'comida', 5: 'capacitacion', 6: 'permiso' }[p.statusId];
      if (key) row[key] = p.minutos;
      row.totalPausaMin += p.minutos;
    }

    res.json({ success: true, data: Array.from(porAgente.values()) });
  } catch (err) {
    logger.error('operacionesController.getProductividadDia', err);
    res.status(500).json({ success: false, message: 'Error al obtener la productividad del día' });
  }
}

/* ── Tiempos: bitácora detallada de sesiones/pausas por agente (auditoría, no resumen) ── */

// GET /api/operaciones/tiempos?agenteId=&fecha=YYYY-MM-DD — historial fila por fila de
// USUARIO_TIEMPOS del agente en el día indicado (o hoy): hora exacta de cada pausa,
// duración, y si sigue abierta. Complementa a getProductividadDia, que solo agrega minutos.
async function getTiemposAgente(req, res) {
  try {
    const { agenteId } = req.query;
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString();
    if (!agenteId) return res.status(400).json({ success: false, message: 'agenteId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('agenteId', sql.Int, agenteId)
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT ut.tiempo_id as id, ut.status_id as statusId, ISNULL(s.clave, 'desconocido') as statusClave,
               ut.fecha_inicio as fechaInicio, ut.fecha_fin as fechaFin,
               DATEDIFF(MINUTE, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE())) as minutos
        FROM USUARIO_TIEMPOS ut
        LEFT JOIN STATUS s ON s.status_id = ut.status_id
        WHERE ut.neus_id = @agenteId AND CAST(ut.fecha_inicio AS date) = @fecha
        ORDER BY ut.fecha_inicio ASC
      `);

    const sesiones = rs.recordset;
    const primeraEntrada = sesiones.length > 0 ? sesiones[0].fechaInicio : null;
    const minutosEnPausa = sesiones.filter((s) => [2, 3, 5, 6].includes(s.statusId)).reduce((sum, s) => sum + s.minutos, 0);

    res.json({
      success: true,
      data: {
        agenteId: Number(agenteId),
        fecha,
        primeraEntrada,
        minutosEnPausa,
        sesiones,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getTiemposAgente', err);
    res.status(500).json({ success: false, message: 'Error al obtener los tiempos del agente' });
  }
}

// GET /api/operaciones/tiempos/mis-agentes — lista de agentes visibles para el
// supervisor autenticado (o todos si es AD/TI), para poblar el selector del panel de Tiempos.
async function getMisAgentes(req, res) {
  try {
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const pool = await databaseService.getPool(req.user?.empresa);

    if (esAdmin) {
      const rs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_TIPOUSUARIO = 'CC' AND NEUS_ACTIVO = 1 ORDER BY NEUS_NOMBRES`);
      return res.json({ success: true, data: rs.recordset });
    }

    const rs = await pool.request()
      .input('uid', sql.Int, uid)
      .query(`
        SELECT DISTINCT u.NEUS_ID as id, u.NEUS_NOMBRES as nombre
        FROM CC_CAMPANIAS_SUPERVISORES cs
        INNER JOIN CC_ASIGNACION_BASE a ON a.CAB_CAMPANIA_ID = cs.CS_CAMPANIA_ID
        INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.CAB_AGENTE_ID
        WHERE cs.CS_SUPERVISOR_ID = @uid
        ORDER BY u.NEUS_NOMBRES
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('operacionesController.getMisAgentes', err);
    res.status(500).json({ success: false, message: 'Error al obtener los agentes' });
  }
}

/* ── Asesores: panel self-service — el propio agente viendo su estado y tiempos de hoy ── */

// GET /api/operaciones/asesores/mi-resumen?fecha=YYYY-MM-DD — igual que getTiemposAgente,
// pero acotado automáticamente al usuario autenticado (sin requerir agenteId ni permisos
// de supervisor/admin). Cualquier usuario logueado puede consultar SU propio historial.
async function getMiResumenAsesor(req, res) {
  try {
    const agenteId = req.user?.id;
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString();
    if (!agenteId) return res.status(401).json({ success: false, message: 'No autenticado' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('agenteId', sql.Int, agenteId)
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT ut.tiempo_id as id, ut.status_id as statusId, ISNULL(s.clave, 'desconocido') as statusClave,
               ut.fecha_inicio as fechaInicio, ut.fecha_fin as fechaFin,
               DATEDIFF(MINUTE, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE())) as minutos
        FROM USUARIO_TIEMPOS ut
        LEFT JOIN STATUS s ON s.status_id = ut.status_id
        WHERE ut.neus_id = @agenteId AND CAST(ut.fecha_inicio AS date) = @fecha
        ORDER BY ut.fecha_inicio ASC
      `);

    const sesiones = rs.recordset;
    const primeraEntrada = sesiones.length > 0 ? sesiones[0].fechaInicio : null;
    const pausaActiva = sesiones.find((s) => [2, 3, 5, 6].includes(s.statusId) && !s.fechaFin);
    const minutosPorTipo = { banio: 0, comida: 0, capacitacion: 0, permiso: 0 };
    const TIPO_KEYS = { 2: 'banio', 3: 'comida', 5: 'capacitacion', 6: 'permiso' };
    for (const s of sesiones) {
      const key = TIPO_KEYS[s.statusId];
      if (key) minutosPorTipo[key] += s.minutos;
    }
    const minutosEnPausa = Object.values(minutosPorTipo).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      data: {
        agenteId,
        fecha,
        primeraEntrada,
        estado: pausaActiva ? 'pausa' : 'disponible',
        tipoPausaActual: pausaActiva ? (TIPO_KEYS[pausaActiva.statusId] ?? null) : null,
        minutosEnPausa,
        minutosPorTipo,
        sesiones,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getMiResumenAsesor', err);
    res.status(500).json({ success: false, message: 'Error al obtener tu resumen del día' });
  }
}

/* ── Metas: metas mensuales de registros gestionados, por campaña o por agente ── */

// GET /api/operaciones/metas?periodo=YYYY-MM — metas del periodo (o mes actual) con
// su avance real, comparando CM_META_REGISTROS contra CAB_CANTIDAD_REGISTROS de
// CC_ASIGNACION_BASE del mismo periodo.
async function listMetas(req, res) {
  try {
    const periodo = (req.query.periodo || new Date().toISOString().slice(0, 7)).toString();
    const pool = await databaseService.getPool(req.user?.empresa);

    const metasRs = await pool.request()
      .input('periodo', sql.Char(7), periodo)
      .query(`
        SELECT m.CM_ID as id, m.CM_TIPO as tipo, m.CM_CAMPANIA_ID as campaniaId, m.CM_AGENTE_ID as agenteId,
               m.CM_PERIODO as periodo, m.CM_META_REGISTROS as metaRegistros,
               c.CC_NOMBRE as campaniaNombre, u.NEUS_NOMBRES as agenteNombre
        FROM CC_METAS m
        LEFT JOIN CC_CAMPANIAS c ON c.CC_ID = m.CM_CAMPANIA_ID
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.CM_AGENTE_ID
        WHERE m.CM_PERIODO = @periodo
        ORDER BY m.CM_TIPO, campaniaNombre, agenteNombre
      `);

    const avanceCampaniaRs = await pool.request()
      .input('periodo', sql.Char(7), periodo)
      .query(`
        SELECT CAB_CAMPANIA_ID as campaniaId, SUM(CAB_CANTIDAD_REGISTROS) as avance
        FROM CC_ASIGNACION_BASE
        WHERE FORMAT(CAB_FECHA, 'yyyy-MM') = @periodo
        GROUP BY CAB_CAMPANIA_ID
      `);
    const avancePorCampania = new Map(avanceCampaniaRs.recordset.map((a) => [a.campaniaId, a.avance]));

    const avanceAgenteRs = await pool.request()
      .input('periodo', sql.Char(7), periodo)
      .query(`
        SELECT CAB_AGENTE_ID as agenteId, SUM(CAB_CANTIDAD_REGISTROS) as avance
        FROM CC_ASIGNACION_BASE
        WHERE FORMAT(CAB_FECHA, 'yyyy-MM') = @periodo
        GROUP BY CAB_AGENTE_ID
      `);
    const avancePorAgente = new Map(avanceAgenteRs.recordset.map((a) => [a.agenteId, a.avance]));

    const data = metasRs.recordset.map((m) => ({
      ...m,
      avance: m.tipo === 'campania' ? (avancePorCampania.get(m.campaniaId) ?? 0) : (avancePorAgente.get(m.agenteId) ?? 0),
    }));

    res.json({ success: true, data });
  } catch (err) {
    logger.error('operacionesController.listMetas', err);
    res.status(500).json({ success: false, message: 'Error al obtener las metas' });
  }
}

// POST /api/operaciones/metas — crea una meta de campaña o de agente para un periodo.
async function crearMeta(req, res) {
  try {
    const { tipo, campaniaId, agenteId, periodo, metaRegistros } = req.body;
    if (!['campania', 'agente'].includes(tipo)) return res.status(400).json({ success: false, message: 'Tipo de meta inválido' });
    if (tipo === 'campania' && !campaniaId) return res.status(400).json({ success: false, message: 'Campaña requerida' });
    if (tipo === 'agente' && !agenteId) return res.status(400).json({ success: false, message: 'Agente requerido' });
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ success: false, message: 'Periodo inválido (YYYY-MM)' });
    if (!metaRegistros || metaRegistros <= 0) return res.status(400).json({ success: false, message: 'La meta debe ser mayor a 0' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const req1 = pool.request()
      .input('tipo', sql.NVarChar, tipo)
      .input('campaniaId', sql.Int, tipo === 'campania' ? campaniaId : null)
      .input('agenteId', sql.SmallInt, tipo === 'agente' ? agenteId : null)
      .input('periodo', sql.Char(7), periodo)
      .input('metaRegistros', sql.Int, metaRegistros)
      .input('creadoPor', sql.SmallInt, req.user?.id ?? null);

    try {
      const rs = await req1.query(`
        INSERT INTO CC_METAS (CM_TIPO, CM_CAMPANIA_ID, CM_AGENTE_ID, CM_PERIODO, CM_META_REGISTROS, CM_CREADO_POR)
        OUTPUT INSERTED.CM_ID as id
        VALUES (@tipo, @campaniaId, @agenteId, @periodo, @metaRegistros, @creadoPor)
      `);
      res.status(201).json({ success: true, data: { id: rs.recordset[0].id } });
    } catch (dbErr) {
      if (dbErr.number === 2601 || dbErr.number === 2627) {
        return res.status(409).json({ success: false, message: 'Ya existe una meta para ese periodo' });
      }
      throw dbErr;
    }
  } catch (err) {
    logger.error('operacionesController.crearMeta', err);
    res.status(500).json({ success: false, message: 'Error al crear la meta' });
  }
}

// DELETE /api/operaciones/metas/:id
async function eliminarMeta(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CC_METAS WHERE CM_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.eliminarMeta', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la meta' });
  }
}

/* ── Reportes diarios: resumen consolidado de un día específico (histórico navegable) ── */

// GET /api/operaciones/reportes-diarios?fecha=YYYY-MM-DD — corte del día: registros
// asignados, agentes que trabajaron, minutos totales por tipo de pausa, y ranking de
// agentes por tiempo en pausa. Reutiliza CC_ASIGNACION_BASE y USUARIO_TIEMPOS.
async function getReporteDiario(req, res) {
  try {
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString();
    const pool = await databaseService.getPool(req.user?.empresa);

    const asignadoRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT ISNULL(SUM(CAB_CANTIDAD_REGISTROS), 0) as totalAsignado, COUNT(DISTINCT CAB_AGENTE_ID) as agentesConAsignacion
        FROM CC_ASIGNACION_BASE
        WHERE CAST(CAB_FECHA AS date) = @fecha
      `);
    const { totalAsignado, agentesConAsignacion } = asignadoRs.recordset[0];

    const porCampaniaRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT c.CC_NOMBRE as campania, SUM(a.CAB_CANTIDAD_REGISTROS) as count
        FROM CC_ASIGNACION_BASE a
        JOIN CC_CAMPANIAS c ON c.CC_ID = a.CAB_CAMPANIA_ID
        WHERE CAST(a.CAB_FECHA AS date) = @fecha
        GROUP BY c.CC_NOMBRE
        ORDER BY count DESC
      `);

    const agentesTrabajaronRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`SELECT COUNT(DISTINCT neus_id) as total FROM USUARIO_TIEMPOS WHERE CAST(fecha_inicio AS date) = @fecha`);
    const agentesTrabajaron = agentesTrabajaronRs.recordset[0].total;

    const pausasPorTipoRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT status_id as statusId, SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutos
        FROM USUARIO_TIEMPOS
        WHERE CAST(fecha_inicio AS date) = @fecha AND status_id IN (2,3,5,6)
        GROUP BY status_id
      `);
    const PAUSA_KEYS = { 2: 'banio', 3: 'comida', 5: 'capacitacion', 6: 'permiso' };
    const minutosPorTipo = { banio: 0, comida: 0, capacitacion: 0, permiso: 0 };
    for (const p of pausasPorTipoRs.recordset) {
      const key = PAUSA_KEYS[p.statusId];
      if (key) minutosPorTipo[key] = p.minutos;
    }

    const rankingRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT TOP 10 ut.neus_id as agenteId, u.NEUS_NOMBRES as nombre,
               SUM(DATEDIFF(MINUTE, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE()))) as minutosPausa
        FROM USUARIO_TIEMPOS ut
        INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
        WHERE CAST(ut.fecha_inicio AS date) = @fecha AND ut.status_id IN (2,3,5,6)
        GROUP BY ut.neus_id, u.NEUS_NOMBRES
        ORDER BY minutosPausa DESC
      `);

    res.json({
      success: true,
      data: {
        fecha,
        totalAsignado,
        agentesConAsignacion,
        agentesTrabajaron,
        porCampania: porCampaniaRs.recordset,
        minutosPorTipo,
        rankingPausas: rankingRs.recordset,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getReporteDiario', err);
    res.status(500).json({ success: false, message: 'Error al obtener el reporte diario' });
  }
}

/* ── KPIs: indicadores clave consolidados de Operaciones/Call Center ── */

// GET /api/operaciones/kpis — campañas activas, asignación del mes, agentes CC
// activos/en pausa ahora mismo, y minutos promedio en pausa hoy. Reutiliza las
// mismas fuentes que getDashboard y getProductividadDia, sin tablas nuevas.
async function getKpis(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const campaniasRs = await pool.request().query(`SELECT COUNT(*) as total FROM CC_CAMPANIAS WHERE CC_ESTATUS = 'activa'`);
    const campaniasActivas = campaniasRs.recordset[0].total;

    const totalRs = await pool.request().query(`
      SELECT ISNULL(SUM(CAB_CANTIDAD_REGISTROS), 0) as total
      FROM CC_ASIGNACION_BASE
      WHERE MONTH(CAB_FECHA) = MONTH(GETDATE()) AND YEAR(CAB_FECHA) = YEAR(GETDATE())
    `);
    const totalAsignado = totalRs.recordset[0].total;

    const agentesRs = await pool.request().query(`SELECT NEUS_ID as id FROM NEUS_USUARIOS WHERE NEUS_TIPOUSUARIO = 'CC' AND NEUS_ACTIVO = 1`);
    const agenteIds = agentesRs.recordset.map((a) => a.id);
    const totalAgentes = agenteIds.length;

    let agentesEnPausa = 0;
    let minutosPromedioPausa = 0;
    if (agenteIds.length > 0) {
      const pausasActivasRs = await pool.request().query(`
        SELECT COUNT(DISTINCT neus_id) as total
        FROM USUARIO_TIEMPOS
        WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN (2,3,5,6)
      `);
      agentesEnPausa = pausasActivasRs.recordset[0].total;

      const promedioRs = await pool.request().query(`
        SELECT AVG(minutos * 1.0) as promedio FROM (
          SELECT neus_id, SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutos
          FROM USUARIO_TIEMPOS
          WHERE neus_id IN (${agenteIds.join(',')}) AND status_id IN (2,3,5,6) AND CAST(fecha_inicio AS date) = CAST(GETDATE() AS date)
          GROUP BY neus_id
        ) t
      `);
      minutosPromedioPausa = Math.round(promedioRs.recordset[0].promedio ?? 0);
    }

    const agentesActivos = Math.max(0, totalAgentes - agentesEnPausa);

    await upsertKpi({ tenantKey: req.user?.empresa, areaKey: 'operaciones', kpiKey: 'campanias_activas', label: 'Campañas activas', valor: campaniasActivas, unidad: '', tono: 'brand' });
    await upsertKpi({ tenantKey: req.user?.empresa, areaKey: 'operaciones', kpiKey: 'agentes_activos', label: 'Agentes disponibles', valor: agentesActivos, unidad: '', tono: 'success' });

    res.json({
      success: true,
      data: {
        campaniasActivas,
        totalAsignado,
        totalAgentes,
        agentesActivos,
        agentesEnPausa,
        minutosPromedioPausa,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getKpis', err);
    res.status(500).json({ success: false, message: 'Error al obtener los KPIs' });
  }
}

module.exports = {
  listCampanias,
  crearCampania,
  listAsignaciones,
  crearAsignacion,
  getDashboard,
  listSupervisores,
  asignarSupervisor,
  quitarSupervisor,
  getMiPanel,
  getProductividadDia,
  getTiemposAgente,
  getMisAgentes,
  getKpis,
  listMetas,
  crearMeta,
  eliminarMeta,
  getReporteDiario,
  getMiResumenAsesor,
};
