const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const XLSX = require('xlsx');
const databaseService = require('../services/databaseService');
const { upsertKpi } = require('./areasController');
const { logAudit } = require('../services/auditService');
const { TIPIFICACIONES_LLAMADA_LABEL } = require('../utils/tipificacionesLlamada');
const { RDL_DIR } = require('../middleware/rdlUpload');
const reportBuilderCatalog = require('../services/reportBuilderCatalog');
const reportBuilderRunner = require('../services/reportBuilderRunner');
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

// Estados de pausa según USUARIO_TIEMPOS.status_id — mismo mapeo que el botón
// real que usa el agente (PerfilMenu.tsx: statusId 3 = Baño, 2 = Comida) y
// que socketService.js al cerrar la pausa de baño (status_id = 3).
const PAUSA_LABELS = { 3: 'baño', 2: 'comida', 5: 'capacitación', 6: 'permiso' };

async function listSupervisores(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT cs.CS_ID as id, cs.CS_CAMPANIA_ID as campaniaId, c.CM2_NOMBRE as campaniaNombre,
             cs.CS_SUPERVISOR_ID as supervisorId, u.NEUS_NOMBRES as supervisorNombre
      FROM CC_CAMPANIAS_SUPERVISORES cs
      INNER JOIN CCO_CAMPANIAS c ON c.CM2_ID = cs.CS_CAMPANIA_ID
      INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = cs.CS_SUPERVISOR_ID
      ORDER BY c.CM2_NOMBRE ASC
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
    const info = await pool.request().input('c', sql.Int, campaniaId).input('u', sql.Int, supervisorId).query(`
      SELECT (SELECT CM2_NOMBRE FROM CCO_CAMPANIAS WHERE CM2_ID = @c) campaniaNombre,
             (SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @u) supervisorNombre`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre || null, modulo: 'supervisores', accion: 'asignar-supervisor-campania',
      entidadId: campaniaId,
      detalle: { campaniaId, campaniaNombre: info.recordset[0]?.campaniaNombre, supervisorId, supervisorNombre: info.recordset[0]?.supervisorNombre },
      ip: req.ip,
    });
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
    const info = await pool.request().input('id', sql.Int, id).query(`
      SELECT cs.CS_CAMPANIA_ID campaniaId, c.CM2_NOMBRE campaniaNombre, cs.CS_SUPERVISOR_ID supervisorId, u.NEUS_NOMBRES supervisorNombre
      FROM CC_CAMPANIAS_SUPERVISORES cs
      LEFT JOIN CCO_CAMPANIAS c ON c.CM2_ID = cs.CS_CAMPANIA_ID
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = cs.CS_SUPERVISOR_ID
      WHERE cs.CS_ID = @id`);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_ID = @id');
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre || null, modulo: 'supervisores', accion: 'quitar-supervisor-campania',
      entidadId: id, detalle: info.recordset[0] ?? {}, ip: req.ip,
    });
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
    // CCO_CAMPANIAS/CCO_GRUPOS/CCO_GRUPO_AGENTES son el catálogo real (el mismo
    // que Configuración > Contact Center > Campañas y skills / Asignación de
    // agentes) — CC_CAMPANIAS/CC_ASIGNACION_BASE es un sistema viejo sin datos.
    const campaniasReq = pool.request();
    let campaniasWhere = '';
    if (!esAdmin) {
      campaniasWhere = `WHERE c.CM2_ID IN (SELECT CS_CAMPANIA_ID FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)`;
      campaniasReq.input('uid', sql.Int, uid);
    }
    const campaniasRs = await campaniasReq.query(`SELECT c.CM2_ID as id, c.CM2_NOMBRE as nombre FROM CCO_CAMPANIAS c ${campaniasWhere}`);
    const campaniaIds = campaniasRs.recordset.map((c) => c.id);

    if (campaniaIds.length === 0) {
      return res.json({ success: true, data: { campanias: [], grupos: [], agentes: [] } });
    }

    // Skills/grupos de esas campañas — para armar la jerarquía Campaña > Skill > Agente en el panel.
    const gruposRs = await pool.request().query(`
      SELECT CG_ID as id, CG_CAMPANIA_ID as campaniaId, CG_NOMBRE as nombre, CG_ICONO as icono
      FROM CCO_GRUPOS WHERE CG_ACTIVO = 1 AND CG_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);

    // Agentes asignados a esas campañas — vía sus grupos/skills (CCO_GRUPOS),
    // que es donde realmente vive el vínculo agente-campaña hoy.
    const agentesRs = await pool.request().query(`
      SELECT DISTINCT ga.CGA_USUARIO_ID as agenteId, g.CG_CAMPANIA_ID as campaniaId, g.CG_ID as grupoId,
             g.CG_NOMBRE as grupoNombre, u.NEUS_NOMBRES as nombre
      FROM CCO_GRUPO_AGENTES ga
      INNER JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = ga.CGA_USUARIO_ID
      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);

    if (agentesRs.recordset.length === 0) {
      return res.json({ success: true, data: { campanias: campaniasRs.recordset, grupos: gruposRs.recordset, agentes: [] } });
    }

    const agenteIds = [...new Set(agentesRs.recordset.map((a) => a.agenteId))];
    const pausasRs = await pool.request().query(`
      SELECT neus_id as agenteId, status_id as statusId, fecha_inicio as fechaInicio
      FROM USUARIO_TIEMPOS
      WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN (2,3,5,6)
    `);
    const pausaPorAgente = new Map(pausasRs.recordset.map((p) => [p.agenteId, p]));

    // LIVECHAT_AGENTE_ESTADO es la fuente real de si un agente puede recibir
    // conversaciones nuevas — la actualiza el switch "Chat en vivo" del menú
    // de perfil (livechatController.setDisponible), que es lo que el agente
    // usa de verdad. CCO_AGENTE_ESTADO es un sistema paralelo del Contact
    // Center omnicanal que no se toca desde ese switch, así que no sirve
    // como fuente aquí. Antes esto se inferí­a solo de USUARIO_TIEMPOS
    // (ausencia de pausa abierta), lo que marcaba "Disponible" a cualquiera
    // que ni siquiera hubiera iniciado sesión hoy.
    const estadoRs = await pool.request().query(`
      SELECT LAE_USUARIO_ID as agenteId, LAE_ONLINE as online, LAE_DISPONIBLE as disponible, LAE_ULTIMA_CONEXION as ultimaConexion
      FROM LIVECHAT_AGENTE_ESTADO WHERE LAE_USUARIO_ID IN (${agenteIds.join(',')})
    `);
    const estadoPorAgente = new Map(estadoRs.recordset.map((e) => [e.agenteId, e]));

    const agentes = agentesRs.recordset.map((a) => {
      const pausa = pausaPorAgente.get(a.agenteId);
      const est = estadoPorAgente.get(a.agenteId);
      // Sin fila en LIVECHAT_AGENTE_ESTADO, o LAE_ONLINE=0: nunca se conectó
      // hoy o cerró sesión — "desconectado", no "disponible".
      let estado;
      if (!est || !est.online) estado = 'desconectado';
      else if (pausa) estado = 'pausa';
      else if (!est.disponible) estado = 'no_disponible';
      else estado = 'disponible';
      return {
        agenteId: a.agenteId,
        nombre: a.nombre,
        campaniaId: a.campaniaId,
        grupoId: a.grupoId,
        grupoNombre: a.grupoNombre,
        estado,
        tipoPausa: pausa ? (PAUSA_LABELS[pausa.statusId] ?? 'pausa') : null,
        pausaDesde: pausa ? pausa.fechaInicio : null,
        ultimaConexion: est?.ultimaConexion ?? null,
      };
    });

    res.json({ success: true, data: { campanias: campaniasRs.recordset, grupos: gruposRs.recordset, agentes } });
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
        ? 'SELECT CM2_ID as id FROM CCO_CAMPANIAS'
        : `SELECT DISTINCT CS_CAMPANIA_ID as id FROM CC_CAMPANIAS_SUPERVISORES ${campaniasWhere}`
    );
    const campaniaIds = campaniaIdsRs.recordset.map((c) => c.id);
    if (campaniaIds.length === 0) return res.json({ success: true, data: [] });

    const agentesRs = await pool.request().query(`
      SELECT DISTINCT ga.CGA_USUARIO_ID as agenteId
      FROM CCO_GRUPO_AGENTES ga
      INNER JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (${campaniaIds.join(',')})
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

    // Promedio diario de pausas de los 7 días previos a la fecha consultada
    // (sin incluirla) — sirve de referencia para detectar si un agente se
    // está pasando de lo que acostumbra, no de un límite fijo del sistema.
    const historicoRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT neus_id as agenteId, CAST(fecha_inicio AS date) as dia,
               SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutosDia
        FROM USUARIO_TIEMPOS
        WHERE neus_id IN (${agenteIds.join(',')})
          AND status_id IN (2,3,5,6)
          AND CAST(fecha_inicio AS date) >= DATEADD(DAY, -7, CAST(@fecha AS date))
          AND CAST(fecha_inicio AS date) < CAST(@fecha AS date)
        GROUP BY neus_id, CAST(fecha_inicio AS date)
      `);
    const diasPorAgente = new Map();
    for (const h of historicoRs.recordset) {
      if (!diasPorAgente.has(h.agenteId)) diasPorAgente.set(h.agenteId, []);
      diasPorAgente.get(h.agenteId).push(h.minutosDia);
    }
    const avgSemanalPorAgente = new Map();
    for (const [id, dias] of diasPorAgente) {
      avgSemanalPorAgente.set(id, Math.round(dias.reduce((a, b) => a + b, 0) / dias.length));
    }

    // Estado ACTUAL (independiente del acumulado de arriba) — misma lógica que
    // getMiPanel: una fila sin fecha_fin es la pausa en curso ahora mismo.
    const pausaActivaRs = await pool.request().query(`
      SELECT neus_id as agenteId, status_id as statusId, fecha_inicio as fechaInicio
      FROM USUARIO_TIEMPOS
      WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN (2,3,5,6)
    `);
    const pausaActivaPorAgente = new Map(pausaActivaRs.recordset.map((p) => [p.agenteId, p]));

    const usuariosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${agenteIds.join(',')})`);
    const nombrePorId = new Map(usuariosRs.recordset.map((u) => [u.id, u.nombre]));

    const estadoRs = await pool.request().query(`
      SELECT LAE_USUARIO_ID as agenteId, LAE_ONLINE as online, LAE_DISPONIBLE as disponible, LAE_ULTIMA_CONEXION as ultimaConexion
      FROM LIVECHAT_AGENTE_ESTADO WHERE LAE_USUARIO_ID IN (${agenteIds.join(',')})
    `);
    const estadoPorAgente = new Map(estadoRs.recordset.map((e) => [e.agenteId, e]));

    const porAgente = new Map();
    for (const id of agenteIds) {
      const pausaActiva = pausaActivaPorAgente.get(id);
      const est = estadoPorAgente.get(id);
      let estado;
      if (!est || !est.online) estado = 'desconectado';
      else if (pausaActiva) estado = 'pausa';
      else if (!est.disponible) estado = 'no_disponible';
      else estado = 'disponible';
      porAgente.set(id, {
        agenteId: id,
        nombre: nombrePorId.get(id) ?? '',
        banio: 0, comida: 0, capacitacion: 0, permiso: 0, totalPausaMin: 0,
        estado,
        tipoPausa: pausaActiva ? (PAUSA_LABELS[pausaActiva.statusId] ?? 'pausa') : null,
        ultimaConexion: est?.ultimaConexion ?? null,
        avgSemanalMin: avgSemanalPorAgente.get(id) ?? null,
      });
    }
    for (const p of pausasRs.recordset) {
      const row = porAgente.get(p.agenteId);
      if (!row) continue;
      const key = { 3: 'banio', 2: 'comida', 5: 'capacitacion', 6: 'permiso' }[p.statusId];
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
        INNER JOIN CCO_GRUPOS g ON g.CG_CAMPANIA_ID = cs.CS_CAMPANIA_ID
        INNER JOIN CCO_GRUPO_AGENTES a ON a.CGA_GRUPO_ID = g.CG_ID AND a.CGA_ACTIVO = 1
        INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.CGA_USUARIO_ID
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
    const TIPO_KEYS = { 3: 'banio', 2: 'comida', 5: 'capacitacion', 6: 'permiso' };
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
    const PAUSA_KEYS = { 3: 'banio', 2: 'comida', 5: 'capacitacion', 6: 'permiso' };
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

/* ── Reportería de postulantes: volumen, tipificación y fugas en un rango ──
   Rango de fechas propio (no el día único del reporte de arriba) porque
   volumen de postulantes se entiende mejor en un rango de varios días.
   Productividad por agente se mide por notas (CCO_POSTULANTE_NOTAS), no por
   tipificación — WEBPHONE_LLAMADAS_TIPIFICADAS no guarda qué agente tipificó,
   solo el teléfono/postulante y la fecha, así que no hay forma de atribuir
   la tipificación a un agente con el esquema actual. */

function _rangoFechas(req) {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const desde = (req.query.desde || hace30).toString();
  const hasta = (req.query.hasta || hoy).toString();
  return { desde, hasta };
}

async function _queryReportePostulantes(pool, desde, hasta) {
  const porCampaniaRs = await pool.request()
    .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
    .query(`
      SELECT CAST(cp.CP_FECHA_REGISTRO AS date) fecha, c.CM2_NOMBRE campania, COUNT(*) total
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = cp.CP_CAMPANIA_ID
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
      GROUP BY CAST(cp.CP_FECHA_REGISTRO AS date), c.CM2_NOMBRE
      ORDER BY fecha`);

  const tipificadosRs = await pool.request()
    .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
    .query(`
      SELECT ult.WLT_TIPIFICACION tipificacion, COUNT(*) total
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      OUTER APPLY (
        SELECT TOP 1 wlt.WLT_TIPIFICACION
        FROM dbo.WEBPHONE_LLAMADAS_TIPIFICADAS wlt
        WHERE wlt.WLT_POSTULANTE_ID = cp.CP_ID
           OR RIGHT(REPLACE(REPLACE(REPLACE(cp.CP_TELEFONO, ' ', ''), '-', ''), '+', ''), 10) = RIGHT(wlt.WLT_TELEFONO, 10)
        ORDER BY wlt.WLT_FECHA DESC
      ) ult
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
      GROUP BY ult.WLT_TIPIFICACION`);
  const porTipificacion = tipificadosRs.recordset.map((r) => ({
    tipificacion: r.tipificacion || null,
    etiqueta: r.tipificacion ? (TIPIFICACIONES_LLAMADA_LABEL[r.tipificacion] || r.tipificacion) : 'Sin tipificar',
    total: r.total,
  }));

  const productividadRs = await pool.request()
    .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
    .query(`
      SELECT PN_USUARIO_ID usuarioId, PN_USUARIO_NOMBRE usuarioNombre, COUNT(*) notas
      FROM dbo.CCO_POSTULANTE_NOTAS
      WHERE PN_FECHA >= @desde AND PN_FECHA < DATEADD(DAY, 1, @hasta)
      GROUP BY PN_USUARIO_ID, PN_USUARIO_NOMBRE
      ORDER BY notas DESC`);

  const sinTipTotalRs = await pool.request()
    .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
    .query(`
      SELECT COUNT(*) total
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      OUTER APPLY (
        SELECT TOP 1 wlt.WLT_TIPIFICACION
        FROM dbo.WEBPHONE_LLAMADAS_TIPIFICADAS wlt
        WHERE wlt.WLT_POSTULANTE_ID = cp.CP_ID
           OR RIGHT(REPLACE(REPLACE(REPLACE(cp.CP_TELEFONO, ' ', ''), '-', ''), '+', ''), 10) = RIGHT(wlt.WLT_TELEFONO, 10)
        ORDER BY wlt.WLT_FECHA DESC
      ) ult
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
        AND ult.WLT_TIPIFICACION IS NULL`);

  const sinTipListaRs = await pool.request()
    .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
    .query(`
      SELECT TOP 10 cp.CP_NOMBRE nombre, cp.CP_TELEFONO telefono, c.CM2_NOMBRE campania,
             DATEDIFF(DAY, cp.CP_FECHA_REGISTRO, GETDATE()) diasEsperando
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = cp.CP_CAMPANIA_ID
      OUTER APPLY (
        SELECT TOP 1 wlt.WLT_TIPIFICACION
        FROM dbo.WEBPHONE_LLAMADAS_TIPIFICADAS wlt
        WHERE wlt.WLT_POSTULANTE_ID = cp.CP_ID
           OR RIGHT(REPLACE(REPLACE(REPLACE(cp.CP_TELEFONO, ' ', ''), '-', ''), '+', ''), 10) = RIGHT(wlt.WLT_TELEFONO, 10)
        ORDER BY wlt.WLT_FECHA DESC
      ) ult
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
        AND ult.WLT_TIPIFICACION IS NULL
      ORDER BY cp.CP_FECHA_REGISTRO ASC`);

  return {
    porCampania: porCampaniaRs.recordset,
    porTipificacion,
    productividadAgentes: productividadRs.recordset,
    sinTipificar: { total: sinTipTotalRs.recordset[0].total, masAntiguos: sinTipListaRs.recordset },
  };
}

// GET /api/operaciones/reportes-postulantes?desde=&hasta= — volumen por
// campaña/fecha, desglose por tipificación, notas por agente y postulantes
// sin tipificar (fugas), en un rango de fechas (default: últimos 30 días).
async function getReportePostulantes(req, res) {
  try {
    const { desde, hasta } = _rangoFechas(req);
    const pool = await databaseService.getPool(req.user?.empresa);
    const data = await _queryReportePostulantes(pool, desde, hasta);
    res.json({ success: true, data: { desde, hasta, ...data } });
  } catch (err) {
    logger.error('operacionesController.getReportePostulantes', err);
    res.status(500).json({ success: false, message: 'Error al obtener el reporte de postulantes' });
  }
}

// GET /api/operaciones/reportes-postulantes/excel?desde=&hasta= — un
// renglón por postulante registrado en el rango, con su tipificación más
// reciente (mismo criterio que _queryReportePostulantes usa para "Por
// tipificación" en pantalla — OUTER APPLY TOP 1 por fecha de tipificación,
// filtrado por fecha de REGISTRO del postulante, no de tipificación — así
// los totales del Excel cuadran con los de la pantalla).
async function exportarReportePostulantes(req, res) {
  try {
    const { desde, hasta } = _rangoFechas(req);
    const pool = await databaseService.getPool(req.user?.empresa);

    const r = await pool.request()
      .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
      .query(`
        SELECT
          cp.CP_NOMBRE postulante,
          cp.CP_TELEFONO telefono,
          ult.WLT_TIPIFICACION tipificacion,
          ult.WLT_OBSERVACIONES observaciones,
          ult.WLT_EXTENSION extension,
          ult.WLT_FECHA fecha
        FROM dbo.CCO_CAMPANIA_POSTULANTES cp
        OUTER APPLY (
          SELECT TOP 1 wlt.WLT_TIPIFICACION, wlt.WLT_OBSERVACIONES, wlt.WLT_EXTENSION, wlt.WLT_FECHA
          FROM dbo.WEBPHONE_LLAMADAS_TIPIFICADAS wlt
          WHERE wlt.WLT_POSTULANTE_ID = cp.CP_ID
             OR RIGHT(REPLACE(REPLACE(REPLACE(cp.CP_TELEFONO, ' ', ''), '-', ''), '+', ''), 10) = RIGHT(wlt.WLT_TELEFONO, 10)
          ORDER BY wlt.WLT_FECHA DESC
        ) ult
        WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
        ORDER BY cp.CP_FECHA_REGISTRO DESC`);

    const filas = r.recordset.map((row) => ({
      Postulante: row.postulante,
      Teléfono: row.telefono,
      Tipificación: row.tipificacion ? (TIPIFICACIONES_LLAMADA_LABEL[row.tipificacion] || row.tipificacion) : 'Sin tipificar',
      Observaciones: row.observaciones || '',
      Extensión: row.extension || '',
      Fecha: row.fecha ? new Date(row.fecha).toLocaleString('es-MX') : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Postulante: '', Teléfono: '', Tipificación: '', Observaciones: '', Extensión: '', Fecha: '' }]);
    ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 26 }, { wch: 50 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Tipificaciones');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_postulantes_${desde}_a_${hasta}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('operacionesController.exportarReportePostulantes', err);
    res.status(500).json({ success: false, message: 'Error al generar el Excel' });
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

// GET /api/operaciones/supervisores/historial-asignaciones — quién asignó o
// quitó a qué supervisor de qué campaña/skill y cuándo (INTRANET_AUDITORIA,
// módulo 'supervisores'). Accesible a cualquier supervisor autenticado —
// a diferencia de /api/auditoria (solo rol AD), esto es historial del propio
// módulo, no auditoría general del sistema.
async function getHistorialAsignaciones(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT TOP 100 AUDIT_ID as id, USUARIO_NOMBRE as usuarioNombre, ACCION as accion,
             DETALLE as detalle, FECHA as fecha
      FROM INTRANET_AUDITORIA
      WHERE MODULO = 'supervisores'
      ORDER BY FECHA DESC
    `);
    const data = rs.recordset.map((r) => {
      let detalle = null;
      try { detalle = r.detalle ? JSON.parse(r.detalle) : null; } catch { /* detalle no parseable, se omite */ }
      return { id: r.id, usuarioNombre: r.usuarioNombre, accion: r.accion, detalle, fecha: r.fecha };
    });
    res.json({ success: true, data });
  } catch (err) {
    logger.error('operacionesController.getHistorialAsignaciones', err);
    res.status(500).json({ success: false, message: 'Error al obtener el historial de asignaciones' });
  }
}

/* ── Suite de Reportes: catálogo de definiciones .rdl / .rdlc (SQL Server
   Reporting Services) subidas por el equipo, organizadas en carpetas propias
   (CC_RDL_CARPETAS) y con seguridad de acceso por reporte: roles permitidos
   (CSV de AD/TI/CC/ST/VE) + usuarios sueltos (CSV de NEUS_ID). Un reporte sin
   roles ni usuarios es público para todo el que entra al módulo. AD/TI siempre
   ven y administran todo.
   El archivo físico vive en RDL_DIR y se sirve como estático en /suite-reportes. ── */

const RDL_ROLES_VALIDOS = ['AD', 'TI', 'CC', 'ST', 'VE'];

async function ensureRdlSchema(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CC_RDL_CARPETAS')
      CREATE TABLE CC_RDL_CARPETAS (
        RDC_ID          INT IDENTITY PRIMARY KEY,
        RDC_NOMBRE      NVARCHAR(200) NOT NULL,
        RDC_CREADO_POR  SMALLINT      NULL,
        RDC_FECHA       DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_RDC_NOMBRE UNIQUE (RDC_NOMBRE)
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CC_RDL_REPORTES')
      CREATE TABLE CC_RDL_REPORTES (
        RDL_ID            INT IDENTITY PRIMARY KEY,
        RDL_NOMBRE        NVARCHAR(200)  NOT NULL,
        RDL_DESCRIPCION   NVARCHAR(1000) NULL,
        RDL_CARPETA       NVARCHAR(200)  NOT NULL DEFAULT 'General',
        RDL_CARPETA_ID    INT            NULL,
        RDL_ARCHIVO       NVARCHAR(400)  NOT NULL,
        RDL_ARCHIVO_ORIG  NVARCHAR(400)  NOT NULL,
        RDL_TAMANO        INT            NOT NULL DEFAULT 0,
        RDL_VERSION_RDL   NVARCHAR(50)   NULL,
        RDL_COMPATIBLE    BIT            NOT NULL DEFAULT 1,
        RDL_METADATA      NVARCHAR(MAX)  NULL,
        RDL_ROLES         NVARCHAR(200)  NULL,
        RDL_USUARIOS      NVARCHAR(MAX)  NULL,
        RDL_SUBIDO_POR    SMALLINT       NULL,
        RDL_SUBIDO_NOMBRE NVARCHAR(200)  NULL,
        RDL_FECHA         DATETIME       NOT NULL DEFAULT GETDATE()
      )
    `);
    // Migraciones suaves para instalaciones que ya tenían la tabla vieja
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CC_RDL_REPORTES' AND COLUMN_NAME='RDL_CARPETA_ID')
      ALTER TABLE CC_RDL_REPORTES ADD RDL_CARPETA_ID INT NULL
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CC_RDL_REPORTES' AND COLUMN_NAME='RDL_ROLES')
      ALTER TABLE CC_RDL_REPORTES ADD RDL_ROLES NVARCHAR(200) NULL
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CC_RDL_REPORTES' AND COLUMN_NAME='RDL_USUARIOS')
      ALTER TABLE CC_RDL_REPORTES ADD RDL_USUARIOS NVARCHAR(MAX) NULL
    `);
    // Sembrar carpetas desde los valores de texto que ya existían y enlazar
    await pool.request().query(`
      INSERT INTO CC_RDL_CARPETAS (RDC_NOMBRE)
      SELECT DISTINCT RDL_CARPETA FROM CC_RDL_REPORTES r
      WHERE RDL_CARPETA IS NOT NULL AND LTRIM(RTRIM(RDL_CARPETA)) <> ''
        AND NOT EXISTS (SELECT 1 FROM CC_RDL_CARPETAS c WHERE c.RDC_NOMBRE = r.RDL_CARPETA)
    `);
    await pool.request().query(`
      UPDATE r SET r.RDL_CARPETA_ID = c.RDC_ID
      FROM CC_RDL_REPORTES r JOIN CC_RDL_CARPETAS c ON c.RDC_NOMBRE = r.RDL_CARPETA
      WHERE r.RDL_CARPETA_ID IS NULL
    `);
  } catch (e) {
    logger.warn('operacionesController.ensureRdlSchema', e && e.message);
  }
}

// Normaliza el CSV de roles: solo valores válidos, en mayúsculas, sin duplicados.
function _parseRoles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return [...new Set(arr.map((r) => String(r).trim().toUpperCase()).filter((r) => RDL_ROLES_VALIDOS.includes(r)))];
}
// Normaliza el CSV de ids de usuario.
function _parseUsuarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return [...new Set(arr.map((n) => parseInt(String(n).trim(), 10)).filter((n) => Number.isInteger(n) && n > 0))];
}

// ¿El usuario `user` puede VER el reporte `row`?
function _puedeVerRdl(user, row) {
  const tipo = (user?.tipoUsuario || '').toString().toUpperCase();
  if (tipo === 'AD' || tipo === 'TI') return true; // administradores: todo
  const roles = _parseRoles(row.RDL_ROLES);
  const usuarios = _parseUsuarios(row.RDL_USUARIOS);
  if (roles.length === 0 && usuarios.length === 0) return true; // público
  if (roles.includes(tipo)) return true;
  if (user?.id && usuarios.includes(Number(user.id))) return true;
  return false;
}

function _mapRdl(r) {
  let metadata = null;
  try { metadata = r.RDL_METADATA ? JSON.parse(r.RDL_METADATA) : null; } catch (_) { metadata = null; }
  return {
    id: r.RDL_ID,
    nombre: r.RDL_NOMBRE,
    descripcion: r.RDL_DESCRIPCION || '',
    carpeta: r.RDL_CARPETA || 'General',
    carpetaId: r.RDL_CARPETA_ID ?? null,
    archivo: r.RDL_ARCHIVO,
    archivoOriginal: r.RDL_ARCHIVO_ORIG,
    tamano: r.RDL_TAMANO,
    versionRdl: r.RDL_VERSION_RDL || null,
    compatible: !!r.RDL_COMPATIBLE,
    metadata,
    roles: _parseRoles(r.RDL_ROLES),
    usuarios: _parseUsuarios(r.RDL_USUARIOS),
    subidoPor: r.RDL_SUBIDO_POR,
    subidoNombre: r.RDL_SUBIDO_NOMBRE || '',
    fecha: r.RDL_FECHA,
    url: `/suite-reportes/${encodeURIComponent(r.RDL_ARCHIVO)}`,
  };
}

/* ── Carpetas ── */

// GET /api/operaciones/suite-reportes/carpetas
async function listRdlCarpetas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    const rs = await pool.request().query(`
      SELECT c.RDC_ID as id, c.RDC_NOMBRE as nombre, c.RDC_FECHA as fecha,
             (SELECT COUNT(*) FROM CC_RDL_REPORTES r WHERE r.RDL_CARPETA_ID = c.RDC_ID) as reportes
      FROM CC_RDL_CARPETAS c ORDER BY c.RDC_NOMBRE ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('operacionesController.listRdlCarpetas', err);
    res.status(500).json({ success: false, message: 'Error al listar las carpetas' });
  }
}

// POST /api/operaciones/suite-reportes/carpetas  { nombre }
async function crearRdlCarpeta(req, res) {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre de carpeta requerido' });
    if (nombre.length > 200) return res.status(400).json({ success: false, message: 'Nombre demasiado largo' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    try {
      const rs = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .input('creadoPor', sql.SmallInt, req.user?.id ?? null)
        .query(`
          INSERT INTO CC_RDL_CARPETAS (RDC_NOMBRE, RDC_CREADO_POR)
          OUTPUT INSERTED.RDC_ID as id, INSERTED.RDC_NOMBRE as nombre, INSERTED.RDC_FECHA as fecha
          VALUES (@nombre, @creadoPor)
        `);
      res.status(201).json({ success: true, data: { ...rs.recordset[0], reportes: 0 } });
    } catch (dbErr) {
      if (dbErr.number === 2601 || dbErr.number === 2627) {
        return res.status(409).json({ success: false, message: 'Ya existe una carpeta con ese nombre' });
      }
      throw dbErr;
    }
  } catch (err) {
    logger.error('operacionesController.crearRdlCarpeta', err);
    res.status(500).json({ success: false, message: 'Error al crear la carpeta' });
  }
}

// PATCH /api/operaciones/suite-reportes/carpetas/:id  { nombre }
async function renombrarRdlCarpeta(req, res) {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    try {
      await pool.request()
        .input('id', sql.Int, req.params.id)
        .input('nombre', sql.NVarChar, nombre)
        .query(`
          UPDATE CC_RDL_CARPETAS SET RDC_NOMBRE = @nombre WHERE RDC_ID = @id;
          UPDATE CC_RDL_REPORTES SET RDL_CARPETA = @nombre WHERE RDL_CARPETA_ID = @id;
        `);
      res.json({ success: true });
    } catch (dbErr) {
      if (dbErr.number === 2601 || dbErr.number === 2627) {
        return res.status(409).json({ success: false, message: 'Ya existe una carpeta con ese nombre' });
      }
      throw dbErr;
    }
  } catch (err) {
    logger.error('operacionesController.renombrarRdlCarpeta', err);
    res.status(500).json({ success: false, message: 'Error al renombrar la carpeta' });
  }
}

// DELETE /api/operaciones/suite-reportes/carpetas/:id — solo si está vacía.
async function eliminarRdlCarpeta(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    const usoRs = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) as total FROM CC_RDL_REPORTES WHERE RDL_CARPETA_ID = @id');
    if (usoRs.recordset[0].total > 0) {
      return res.status(409).json({ success: false, message: 'La carpeta tiene reportes — muévelos o elimínalos primero' });
    }
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM CC_RDL_CARPETAS WHERE RDC_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.eliminarRdlCarpeta', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la carpeta' });
  }
}

async function _resolverCarpeta(pool, req) {
  // Acepta carpetaId numérico o carpeta (nombre) — crea la carpeta si el nombre es nuevo.
  const carpetaId = parseInt(req.body.carpetaId, 10);
  if (Number.isInteger(carpetaId) && carpetaId > 0) {
    const rs = await pool.request().input('id', sql.Int, carpetaId)
      .query('SELECT RDC_ID as id, RDC_NOMBRE as nombre FROM CC_RDL_CARPETAS WHERE RDC_ID = @id');
    if (rs.recordset.length > 0) return rs.recordset[0];
  }
  const nombre = (req.body.carpeta || '').trim() || 'General';
  const existe = await pool.request().input('nombre', sql.NVarChar, nombre)
    .query('SELECT RDC_ID as id, RDC_NOMBRE as nombre FROM CC_RDL_CARPETAS WHERE RDC_NOMBRE = @nombre');
  if (existe.recordset.length > 0) return existe.recordset[0];
  const creada = await pool.request()
    .input('nombre', sql.NVarChar, nombre)
    .input('creadoPor', sql.SmallInt, req.user?.id ?? null)
    .query(`
      INSERT INTO CC_RDL_CARPETAS (RDC_NOMBRE, RDC_CREADO_POR)
      OUTPUT INSERTED.RDC_ID as id, INSERTED.RDC_NOMBRE as nombre
      VALUES (@nombre, @creadoPor)
    `);
  return creada.recordset[0];
}

/* ── Reportes RDL ── */

// GET /api/operaciones/suite-reportes/rdl — catálogo, filtrado por la seguridad
// de cada reporte contra el usuario autenticado.
async function listRdl(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    const rs = await pool.request().query(`
      SELECT * FROM CC_RDL_REPORTES ORDER BY RDL_CARPETA ASC, RDL_NOMBRE ASC
    `);
    const visibles = rs.recordset.filter((r) => _puedeVerRdl(req.user, r)).map(_mapRdl);
    res.json({ success: true, data: visibles });
  } catch (err) {
    logger.error('operacionesController.listRdl', err);
    res.status(500).json({ success: false, message: 'Error al listar los reportes RDL' });
  }
}

// POST /api/operaciones/suite-reportes/rdl  (multipart: archivo + campos)
// El frontend ya parseó el XML con DOMParser y manda `metadata` (JSON) +
// `versionRdl` + `compatible`. Aquí solo persistimos y catalogamos.
async function subirRdl(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo .rdl requerido' });

    const nombre = (req.body.nombre || '').trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));
    const descripcion = (req.body.descripcion || '').trim() || null;
    const versionRdl = (req.body.versionRdl || '').trim() || null;
    const compatible = req.body.compatible === 'false' ? 0 : 1;
    const roles = _parseRoles(req.body.roles).join(',') || null;
    const usuarios = _parseUsuarios(req.body.usuarios).join(',') || null;
    let metadata = null;
    try { metadata = req.body.metadata ? JSON.stringify(JSON.parse(req.body.metadata)) : null; } catch (_) { metadata = null; }

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    const carpeta = await _resolverCarpeta(pool, req);

    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion)
      .input('carpeta', sql.NVarChar, carpeta.nombre)
      .input('carpetaId', sql.Int, carpeta.id)
      .input('archivo', sql.NVarChar, req.file.filename)
      .input('archivoOrig', sql.NVarChar, req.file.originalname)
      .input('tamano', sql.Int, req.file.size || 0)
      .input('versionRdl', sql.NVarChar, versionRdl)
      .input('compatible', sql.Bit, compatible)
      .input('metadata', sql.NVarChar, metadata)
      .input('roles', sql.NVarChar, roles)
      .input('usuarios', sql.NVarChar, usuarios)
      .input('subidoPor', sql.SmallInt, req.user?.id ?? null)
      .input('subidoNombre', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .query(`
        INSERT INTO CC_RDL_REPORTES
          (RDL_NOMBRE, RDL_DESCRIPCION, RDL_CARPETA, RDL_CARPETA_ID, RDL_ARCHIVO, RDL_ARCHIVO_ORIG, RDL_TAMANO,
           RDL_VERSION_RDL, RDL_COMPATIBLE, RDL_METADATA, RDL_ROLES, RDL_USUARIOS, RDL_SUBIDO_POR, RDL_SUBIDO_NOMBRE)
        OUTPUT INSERTED.*
        VALUES
          (@nombre, @descripcion, @carpeta, @carpetaId, @archivo, @archivoOrig, @tamano,
           @versionRdl, @compatible, @metadata, @roles, @usuarios, @subidoPor, @subidoNombre)
      `);
    res.status(201).json({ success: true, data: _mapRdl(rs.recordset[0]) });
  } catch (err) {
    logger.error('operacionesController.subirRdl', err);
    res.status(500).json({ success: false, message: 'Error al subir el reporte RDL' });
  }
}

// GET /api/operaciones/suite-reportes/rdl/:id/raw — descarga del .rdl original.
async function descargarRdl(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    const rs = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM CC_RDL_REPORTES WHERE RDL_ID = @id');
    if (rs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    const row = rs.recordset[0];
    if (!_puedeVerRdl(req.user, row)) return res.status(403).json({ success: false, message: 'No tienes acceso a este reporte' });
    const full = path.join(RDL_DIR, row.RDL_ARCHIVO);
    if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: 'El archivo físico no existe' });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${row.RDL_ARCHIVO_ORIG}"`);
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    logger.error('operacionesController.descargarRdl', err);
    res.status(500).json({ success: false, message: 'Error al descargar el reporte RDL' });
  }
}

// PATCH /api/operaciones/suite-reportes/rdl/:id — nombre/descripcion/carpeta + seguridad.
async function actualizarRdl(req, res) {
  try {
    const { nombre, descripcion } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);

    const actual = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM CC_RDL_REPORTES WHERE RDL_ID = @id');
    if (actual.recordset.length === 0) return res.status(404).json({ success: false, message: 'Reporte no encontrado' });

    const carpeta = (req.body.carpeta !== undefined || req.body.carpetaId !== undefined)
      ? await _resolverCarpeta(pool, req)
      : { id: actual.recordset[0].RDL_CARPETA_ID, nombre: actual.recordset[0].RDL_CARPETA };

    const roles = req.body.roles !== undefined ? (_parseRoles(req.body.roles).join(',') || null) : actual.recordset[0].RDL_ROLES;
    const usuarios = req.body.usuarios !== undefined ? (_parseUsuarios(req.body.usuarios).join(',') || null) : actual.recordset[0].RDL_USUARIOS;

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar, (nombre || '').trim() || null)
      .input('descripcion', sql.NVarChar, descripcion != null ? String(descripcion).trim() : null)
      .input('carpeta', sql.NVarChar, carpeta.nombre)
      .input('carpetaId', sql.Int, carpeta.id)
      .input('roles', sql.NVarChar, roles)
      .input('usuarios', sql.NVarChar, usuarios)
      .query(`
        UPDATE CC_RDL_REPORTES SET
          RDL_NOMBRE = ISNULL(@nombre, RDL_NOMBRE),
          RDL_DESCRIPCION = @descripcion,
          RDL_CARPETA = @carpeta,
          RDL_CARPETA_ID = @carpetaId,
          RDL_ROLES = @roles,
          RDL_USUARIOS = @usuarios
        WHERE RDL_ID = @id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.actualizarRdl', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el reporte RDL' });
  }
}

// DELETE /api/operaciones/suite-reportes/rdl/:id
async function eliminarRdl(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    const rs = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT RDL_ARCHIVO FROM CC_RDL_REPORTES WHERE RDL_ID = @id');
    if (rs.recordset.length > 0) {
      const full = path.join(RDL_DIR, rs.recordset[0].RDL_ARCHIVO);
      try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (_) { /* best-effort */ }
    }
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM CC_RDL_REPORTES WHERE RDL_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.eliminarRdl', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el reporte RDL' });
  }
}

/* ── Constructor de Reportes: catálogo de orígenes/campos, ejecución de
   definiciones armadas en el front, y persistencia de reportes guardados
   (reusa la seguridad rol+usuarios de los RDL). ── */

async function ensureReportBuilderSchema(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CC_REPORTES_CONSTRUIDOS')
      CREATE TABLE CC_REPORTES_CONSTRUIDOS (
        RC_ID            INT IDENTITY PRIMARY KEY,
        RC_NOMBRE        NVARCHAR(200)  NOT NULL,
        RC_DESCRIPCION   NVARCHAR(1000) NULL,
        RC_CARPETA       NVARCHAR(200)  NOT NULL DEFAULT 'General',
        RC_CARPETA_ID    INT            NULL,
        RC_ORIGEN        NVARCHAR(60)   NOT NULL,
        RC_DEFINICION    NVARCHAR(MAX)  NOT NULL,
        RC_ROLES         NVARCHAR(200)  NULL,
        RC_USUARIOS      NVARCHAR(MAX)  NULL,
        RC_CREADO_POR    SMALLINT       NULL,
        RC_CREADO_NOMBRE NVARCHAR(200)  NULL,
        RC_FECHA         DATETIME       NOT NULL DEFAULT GETDATE(),
        RC_ACTUALIZADO   DATETIME       NULL
      )
    `);
  } catch (e) {
    logger.warn('operacionesController.ensureReportBuilderSchema', e && e.message);
  }
}

function _mapReporteConstruido(r) {
  let definicion = null;
  try { definicion = r.RC_DEFINICION ? JSON.parse(r.RC_DEFINICION) : null; } catch (_) { definicion = null; }
  return {
    id: r.RC_ID,
    nombre: r.RC_NOMBRE,
    descripcion: r.RC_DESCRIPCION || '',
    carpeta: r.RC_CARPETA || 'General',
    carpetaId: r.RC_CARPETA_ID ?? null,
    origen: r.RC_ORIGEN,
    definicion,
    roles: _parseRoles(r.RC_ROLES),
    usuarios: _parseUsuarios(r.RC_USUARIOS),
    creadoPor: r.RC_CREADO_POR,
    creadoNombre: r.RC_CREADO_NOMBRE || '',
    fecha: r.RC_FECHA,
    actualizado: r.RC_ACTUALIZADO,
    tipo: 'construido',
  };
}

// GET /api/operaciones/suite-reportes/builder/catalogo — orígenes, campos y filtros disponibles.
async function getBuilderCatalogo(req, res) {
  try {
    res.json({ success: true, data: reportBuilderCatalog.catalogoPublico() });
  } catch (err) {
    logger.error('operacionesController.getBuilderCatalogo', err);
    res.status(500).json({ success: false, message: 'Error al obtener el catálogo del constructor' });
  }
}

// GET /api/operaciones/suite-reportes/builder/catalogo-filtro/:catalogo — opciones de un selector.
async function getBuilderCatalogoFiltro(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const data = await reportBuilderRunner.catalogoFiltro(pool, req.params.catalogo);
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === 'REPORT_BUILDER_INVALID') return res.status(400).json({ success: false, message: err.message });
    logger.error('operacionesController.getBuilderCatalogoFiltro', err);
    res.status(500).json({ success: false, message: 'Error al obtener el catálogo del filtro' });
  }
}

// POST /api/operaciones/suite-reportes/builder/ejecutar — corre una definición y devuelve filas.
async function ejecutarBuilder(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const resultado = await reportBuilderRunner.ejecutar(pool, req.body?.definicion ?? req.body);
    res.json({ success: true, data: resultado });
  } catch (err) {
    if (err.code === 'REPORT_BUILDER_INVALID') return res.status(400).json({ success: false, message: err.message });
    logger.error('operacionesController.ejecutarBuilder', err);
    res.status(500).json({ success: false, message: 'Error al ejecutar el reporte' });
  }
}

// GET /api/operaciones/suite-reportes/builder/reportes — reportes guardados visibles.
async function listReportesConstruidos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureReportBuilderSchema(pool);
    const rs = await pool.request().query(`SELECT * FROM CC_REPORTES_CONSTRUIDOS ORDER BY RC_CARPETA, RC_NOMBRE`);
    const visibles = rs.recordset
      .filter((r) => _puedeVerRdl(req.user, { RDL_ROLES: r.RC_ROLES, RDL_USUARIOS: r.RC_USUARIOS }))
      .map(_mapReporteConstruido);
    res.json({ success: true, data: visibles });
  } catch (err) {
    logger.error('operacionesController.listReportesConstruidos', err);
    res.status(500).json({ success: false, message: 'Error al listar los reportes guardados' });
  }
}

// POST /api/operaciones/suite-reportes/builder/reportes — guarda una definición.
async function guardarReporteConstruido(req, res) {
  try {
    const { nombre, descripcion, origen, definicion } = req.body || {};
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    if (!origen || !reportBuilderCatalog.ORIGENES[origen]) return res.status(400).json({ success: false, message: 'Origen inválido' });
    // Validar la definición compilándola (lanza si algo no cuadra)
    reportBuilderRunner.compilar(definicion);

    const roles = _parseRoles(req.body.roles).join(',') || null;
    const usuarios = _parseUsuarios(req.body.usuarios).join(',') || null;

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    await ensureReportBuilderSchema(pool);
    const carpeta = await _resolverCarpeta(pool, req);

    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, (descripcion || '').trim() || null)
      .input('carpeta', sql.NVarChar, carpeta.nombre)
      .input('carpetaId', sql.Int, carpeta.id)
      .input('origen', sql.NVarChar, origen)
      .input('definicion', sql.NVarChar, JSON.stringify(definicion))
      .input('roles', sql.NVarChar, roles)
      .input('usuarios', sql.NVarChar, usuarios)
      .input('creadoPor', sql.SmallInt, req.user?.id ?? null)
      .input('creadoNombre', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .query(`
        INSERT INTO CC_REPORTES_CONSTRUIDOS
          (RC_NOMBRE, RC_DESCRIPCION, RC_CARPETA, RC_CARPETA_ID, RC_ORIGEN, RC_DEFINICION, RC_ROLES, RC_USUARIOS, RC_CREADO_POR, RC_CREADO_NOMBRE)
        OUTPUT INSERTED.*
        VALUES
          (@nombre, @descripcion, @carpeta, @carpetaId, @origen, @definicion, @roles, @usuarios, @creadoPor, @creadoNombre)
      `);
    res.status(201).json({ success: true, data: _mapReporteConstruido(rs.recordset[0]) });
  } catch (err) {
    if (err.code === 'REPORT_BUILDER_INVALID') return res.status(400).json({ success: false, message: err.message });
    logger.error('operacionesController.guardarReporteConstruido', err);
    res.status(500).json({ success: false, message: 'Error al guardar el reporte' });
  }
}

// PATCH /api/operaciones/suite-reportes/builder/reportes/:id
async function actualizarReporteConstruido(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRdlSchema(pool);
    await ensureReportBuilderSchema(pool);
    const actual = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM CC_REPORTES_CONSTRUIDOS WHERE RC_ID = @id');
    if (actual.recordset.length === 0) return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    const row = actual.recordset[0];

    const { nombre, descripcion, definicion } = req.body || {};
    if (definicion !== undefined) reportBuilderRunner.compilar(definicion);

    const carpeta = (req.body.carpeta !== undefined || req.body.carpetaId !== undefined)
      ? await _resolverCarpeta(pool, req)
      : { id: row.RC_CARPETA_ID, nombre: row.RC_CARPETA };
    const roles = req.body.roles !== undefined ? (_parseRoles(req.body.roles).join(',') || null) : row.RC_ROLES;
    const usuarios = req.body.usuarios !== undefined ? (_parseUsuarios(req.body.usuarios).join(',') || null) : row.RC_USUARIOS;

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar, (nombre || '').trim() || null)
      .input('descripcion', sql.NVarChar, descripcion != null ? String(descripcion).trim() : row.RC_DESCRIPCION)
      .input('carpeta', sql.NVarChar, carpeta.nombre)
      .input('carpetaId', sql.Int, carpeta.id)
      .input('definicion', sql.NVarChar, definicion !== undefined ? JSON.stringify(definicion) : row.RC_DEFINICION)
      .input('roles', sql.NVarChar, roles)
      .input('usuarios', sql.NVarChar, usuarios)
      .query(`
        UPDATE CC_REPORTES_CONSTRUIDOS SET
          RC_NOMBRE = ISNULL(@nombre, RC_NOMBRE),
          RC_DESCRIPCION = @descripcion,
          RC_CARPETA = @carpeta,
          RC_CARPETA_ID = @carpetaId,
          RC_DEFINICION = @definicion,
          RC_ROLES = @roles,
          RC_USUARIOS = @usuarios,
          RC_ACTUALIZADO = GETDATE()
        WHERE RC_ID = @id
      `);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'REPORT_BUILDER_INVALID') return res.status(400).json({ success: false, message: err.message });
    logger.error('operacionesController.actualizarReporteConstruido', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el reporte' });
  }
}

// DELETE /api/operaciones/suite-reportes/builder/reportes/:id
async function eliminarReporteConstruido(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureReportBuilderSchema(pool);
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM CC_REPORTES_CONSTRUIDOS WHERE RC_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.eliminarReporteConstruido', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el reporte' });
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
  getReportePostulantes,
  exportarReportePostulantes,
  getMiResumenAsesor,
  getHistorialAsignaciones,
  listRdl,
  subirRdl,
  descargarRdl,
  actualizarRdl,
  eliminarRdl,
  listRdlCarpetas,
  crearRdlCarpeta,
  renombrarRdlCarpeta,
  eliminarRdlCarpeta,
  getBuilderCatalogo,
  getBuilderCatalogoFiltro,
  ejecutarBuilder,
  listReportesConstruidos,
  guardarReporteConstruido,
  actualizarReporteConstruido,
  eliminarReporteConstruido,
};
