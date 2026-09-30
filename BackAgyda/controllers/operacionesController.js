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
const reportBuilderPlantillas = require('../services/reportBuilderPlantillas');
const pausaTiposService = require('../services/pausaTiposService');
const { equiposDeCampania } = require('../services/ccEquiposService');
const ventasCampania = require('../services/ventasCampaniaService');
const rdlEjecutor = require('../services/rdlEjecutorService');
const { esSuperAdminFijo } = require('../utils/superAdmin');
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

// Estados de pausa según USUARIO_TIEMPOS.status_id: los tipos de pausa
// configurables (Configuración → Tipos de pausa) que cuentan en Contact Center.
// Las etiquetas salen de pausaTiposService.etiquetaPausa.
const SQL_PAUSAS_CC = pausaTiposService.sqlPausas('contact_center');

async function listSupervisores(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT cs.CS_ID as id, cs.CS_CAMPANIA_ID as campaniaId, c.CM2_NOMBRE as campaniaNombre,
             cs.CS_SUPERVISOR_ID as supervisorId, u.NEUS_NOMBRES as supervisorNombre,
             (SELECT STRING_AGG(e.EQ_NOMBRE, ', ') FROM CC_EQUIPO_CAMPANIAS ec
               JOIN CC_EQUIPOS e ON e.EQ_ID = ec.EQC_EQUIPO_ID AND e.EQ_ACTIVO = 1 WHERE ec.EQC_CAMPANIA_ID = cs.CS_CAMPANIA_ID) as gruposCC
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

// Una campaña que tiene un grupo de Contact Center: sus supervisores los pone el grupo.
async function bloqueoPorGrupo(pool, campaniaId) {
  const eqs = await equiposDeCampania(pool, campaniaId);
  return eqs.length ? `Esta campaña la controla el grupo "${eqs.map((e) => e.nombre).join('", "')}": cambia sus supervisores desde el grupo (Configuración → Grupos)` : null;
}

async function asignarSupervisor(req, res) {
  try {
    const { campaniaId, supervisorId } = req.body;
    if (!campaniaId || !supervisorId) return res.status(400).json({ success: false, message: 'Campaña y supervisor requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const bloqueo = await bloqueoPorGrupo(pool, campaniaId);
    if (bloqueo) return res.status(409).json({ success: false, message: bloqueo });
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
    const bloqueo = info.recordset[0] && await bloqueoPorGrupo(pool, info.recordset[0].campaniaId);
    if (bloqueo) return res.status(409).json({ success: false, message: bloqueo });
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
    const tipos = await pausaTiposService.listar(pool);

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
      WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN ${SQL_PAUSAS_CC}
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
        tipoPausa: pausa ? pausaTiposService.etiquetaPausa(tipos, pausa.statusId) : null,
        tipoPausaStatusId: pausa ? pausa.statusId : null,
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

// GET /api/operaciones/supervisores/productividad?fecha=YYYY-MM-DD[&campaniaId=] —
// minutos en pausa por tipo, por agente, del día indicado (o hoy). Mismo cálculo
// que ya usa getResumenGeneral en reportController.js, acotado a los agentes de
// mis campañas (o solo a los de campaniaId, si es una de ellas), más las
// atenciones que cerró cada agente ese día en esas campañas.
async function getProductividadDia(req, res) {
  try {
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString();
    const pool = await databaseService.getPool(req.user?.empresa);
    const tipos = await pausaTiposService.listar(pool);

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
    let campaniaIds = campaniaIdsRs.recordset.map((c) => c.id);
    const campaniaFiltro = Number(req.query.campaniaId) || null;
    if (campaniaFiltro) campaniaIds = campaniaIds.includes(campaniaFiltro) ? [campaniaFiltro] : [];
    if (campaniaIds.length === 0) return res.json({ success: true, data: [] });

    const agentesRs = await pool.request().query(`
      SELECT DISTINCT ga.CGA_USUARIO_ID as agenteId
      FROM CCO_GRUPO_AGENTES ga
      INNER JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);
    // Los agentes de un grupo solo de marcador no entran a los skills
    // (ccEquiposService): se toman de los miembros de los grupos de la campaña.
    const miembrosRs = await pool.request().query(`
      SELECT DISTINCT m.EQM_USUARIO_ID as agenteId
      FROM CC_EQUIPO_MIEMBROS m
      INNER JOIN CC_EQUIPOS e ON e.EQ_ID = m.EQM_EQUIPO_ID AND e.EQ_ACTIVO = 1
      INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID AND u.NEUS_ACTIVO = 1
      WHERE m.EQM_ROL = 'agente'
        AND (e.EQ_CAMPANIA_ID IN (${campaniaIds.join(',')})
          OR EXISTS (SELECT 1 FROM CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID AND ec.EQC_CAMPANIA_ID IN (${campaniaIds.join(',')})))
    `).catch(() => ({ recordset: [] }));
    const agenteIds = [...new Set([...agentesRs.recordset, ...miembrosRs.recordset].map((a) => a.agenteId))];
    if (agenteIds.length === 0) return res.json({ success: true, data: [] });

    const pausasRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT neus_id as agenteId, status_id as statusId,
               SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutos
        FROM USUARIO_TIEMPOS
        WHERE neus_id IN (${agenteIds.join(',')})
          AND status_id IN ${SQL_PAUSAS_CC}
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
          AND status_id IN ${SQL_PAUSAS_CC}
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
      WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN ${SQL_PAUSAS_CC}
    `);
    const pausaActivaPorAgente = new Map(pausaActivaRs.recordset.map((p) => [p.agenteId, p]));

    const usuariosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${agenteIds.join(',')})`);
    const nombrePorId = new Map(usuariosRs.recordset.map((u) => [u.id, u.nombre]));

    const estadoRs = await pool.request().query(`
      SELECT LAE_USUARIO_ID as agenteId, LAE_ONLINE as online, LAE_DISPONIBLE as disponible, LAE_ULTIMA_CONEXION as ultimaConexion
      FROM LIVECHAT_AGENTE_ESTADO WHERE LAE_USUARIO_ID IN (${agenteIds.join(',')})
    `);
    const estadoPorAgente = new Map(estadoRs.recordset.map((e) => [e.agenteId, e]));

    const atencionesRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT CI_AGENTE_ID as agenteId, COUNT(*) as atenciones
        FROM CCO_INTERACCIONES
        WHERE CI_ESTADO = 'cerrada' AND CI_AGENTE_ID IN (${agenteIds.join(',')})
          AND CI_CAMPANIA_ID IN (${campaniaIds.join(',')})
          AND CAST(CI_FECHA_CIERRE AS date) = @fecha
        GROUP BY CI_AGENTE_ID
      `);
    const atencionesPorAgente = new Map(atencionesRs.recordset.map((a) => [a.agenteId, a.atenciones]));

    // Campaña de ventas: ventas del día contra su meta y la quincena contra la pre nómina.
    let ventasPorAgente = null;
    const ctxVentas = campaniaFiltro ? await ventasCampania.contextoVentas(pool, campaniaFiltro) : null;
    if (ctxVentas) {
      try {
        ventasPorAgente = await _productividadVentas(pool, ctxVentas, fecha, agenteIds, nombrePorId);
      } catch (e) {
        logger.error('operacionesController.getProductividadDia → Ventas', e);
      }
    }

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
        // Minutos por status_id, incluye los tipos de pausa que agregue la empresa.
        pausasPorTipo: {},
        estado,
        tipoPausa: pausaActiva ? pausaTiposService.etiquetaPausa(tipos, pausaActiva.statusId) : null,
        tipoPausaStatusId: pausaActiva ? pausaActiva.statusId : null,
        ultimaConexion: est?.ultimaConexion ?? null,
        avgSemanalMin: avgSemanalPorAgente.get(id) ?? null,
        atenciones: atencionesPorAgente.get(id) ?? 0,
        ...(ventasPorAgente ? { ventas: ventasPorAgente.get(id) ?? null } : {}),
      });
    }
    for (const p of pausasRs.recordset) {
      const row = porAgente.get(p.agenteId);
      if (!row) continue;
      const key = pausaTiposService.llaveLegacy(tipos, p.statusId);
      if (key) row[key] = p.minutos;
      row.pausasPorTipo[p.statusId] = p.minutos;
      row.totalPausaMin += p.minutos;
    }

    res.json({ success: true, data: Array.from(porAgente.values()) });
  } catch (err) {
    logger.error('operacionesController.getProductividadDia', err);
    res.status(500).json({ success: false, message: 'Error al obtener la productividad del día' });
  }
}

// GET /api/operaciones/supervisores/comparador?fecha=YYYY-MM-DD — Fase 2,
// punto 3.4 del plan basado en PSUP: comparar agentes/campañas ENTRE SÍ (no
// solo un agente contra su propio histórico, que es lo que ya hace
// getProductividadDia). Reutiliza las mismas fuentes que Panel en
// vivo/Productividad (USUARIO_TIEMPOS para pausas, CCO_INTERACCIONES para
// chats) para no duplicar lógica, agregando por agente y por campaña.
async function getComparador(req, res) {
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
        ? 'SELECT CM2_ID as id, CM2_NOMBRE as nombre FROM CCO_CAMPANIAS'
        : `SELECT DISTINCT c.CM2_ID as id, c.CM2_NOMBRE as nombre
           FROM CCO_CAMPANIAS c
           JOIN CC_CAMPANIAS_SUPERVISORES cs ON cs.CS_CAMPANIA_ID = c.CM2_ID ${campaniasWhere.replace('CS_SUPERVISOR_ID', 'cs.CS_SUPERVISOR_ID')}`
    );
    const campanias = campaniaIdsRs.recordset;
    const campaniaIds = campanias.map((c) => c.id);
    if (campaniaIds.length === 0) return res.json({ success: true, data: { agentes: [], campanias: [] } });

    const agentesRs = await pool.request().query(`
      SELECT DISTINCT ga.CGA_USUARIO_ID as agenteId, g.CG_CAMPANIA_ID as campaniaId
      FROM CCO_GRUPO_AGENTES ga
      INNER JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);
    const agenteIds = [...new Set(agentesRs.recordset.map((a) => a.agenteId))];
    if (agenteIds.length === 0) return res.json({ success: true, data: { agentes: [], campanias: [] } });
    // Un agente puede estar en skills de varias campañas asignadas al mismo
    // supervisor — para el comparador por campaña se cuenta bajo cada una.
    const campaniasPorAgente = new Map();
    for (const a of agentesRs.recordset) {
      if (!campaniasPorAgente.has(a.agenteId)) campaniasPorAgente.set(a.agenteId, []);
      campaniasPorAgente.get(a.agenteId).push(a.campaniaId);
    }

    const nombresRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${agenteIds.join(',')})`);
    const nombrePorId = new Map(nombresRs.recordset.map((u) => [u.id, u.nombre]));

    const pausasRs = await pool.request().input('fecha', sql.NVarChar, fecha).query(`
      SELECT neus_id as agenteId, SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutos
      FROM USUARIO_TIEMPOS
      WHERE neus_id IN (${agenteIds.join(',')}) AND status_id IN ${SQL_PAUSAS_CC} AND CAST(fecha_inicio AS date) = @fecha
      GROUP BY neus_id
    `);
    const pausaPorAgente = new Map(pausasRs.recordset.map((p) => [p.agenteId, p.minutos]));

    // Chats cerrados el día + tiempo promedio a primera respuesta (minutos),
    // por agente — mismas columnas que ya usa ccInteraccionesController.
    const chatsRs = await pool.request().input('fecha', sql.NVarChar, fecha).query(`
      SELECT CI_AGENTE_ID as agenteId,
             COUNT(*) as cerrados,
             AVG(CASE WHEN CI_FECHA_PRIMER_RESPUESTA IS NOT NULL
                      THEN DATEDIFF(SECOND, CI_FECHA_INICIO, CI_FECHA_PRIMER_RESPUESTA) END) as segRespuestaProm
      FROM CCO_INTERACCIONES
      WHERE CI_AGENTE_ID IN (${agenteIds.join(',')}) AND CI_ESTADO = 'cerrada' AND CAST(CI_FECHA_CIERRE AS date) = @fecha
      GROUP BY CI_AGENTE_ID
    `);
    const chatsPorAgente = new Map(chatsRs.recordset.map((c) => [c.agenteId, c]));

    const agentes = agenteIds.map((id) => {
      const chat = chatsPorAgente.get(id);
      return {
        agenteId: id,
        nombre: nombrePorId.get(id) ?? '',
        pausaMin: pausaPorAgente.get(id) ?? 0,
        chatsCerrados: chat?.cerrados ?? 0,
        tiempoRespuestaProm: chat?.segRespuestaProm != null ? Math.round(chat.segRespuestaProm) : null,
      };
    });

    // Agregado por campaña: suma de sus agentes (un agente en 2 campañas
    // asignadas cuenta en ambas, a propósito — son vistas distintas).
    const porCampania = new Map(campaniaIds.map((id) => [id, { campaniaId: id, agentes: 0, pausaMin: 0, chatsCerrados: 0 }]));
    for (const a of agentes) {
      for (const campId of campaniasPorAgente.get(a.agenteId) ?? []) {
        const row = porCampania.get(campId);
        if (!row) continue;
        row.agentes += 1;
        row.pausaMin += a.pausaMin;
        row.chatsCerrados += a.chatsCerrados;
      }
    }
    const nombrePorCampania = new Map(campanias.map((c) => [c.id, c.nombre]));
    const resultCampanias = Array.from(porCampania.values()).map((c) => ({ ...c, nombre: nombrePorCampania.get(c.campaniaId) ?? '' }));

    res.json({ success: true, data: { agentes, campanias: resultCampanias } });
  } catch (err) {
    logger.error('operacionesController.getComparador', err);
    res.status(500).json({ success: false, message: 'Error al obtener el comparador' });
  }
}

// Umbral de "Nivel de Servicio" (SLA) para primera respuesta de chat, en
// segundos — mismo concepto que el manual PSUP de Mitrol. Fijo por ahora;
// si más adelante se necesita por campaña, se movería a CCO_CAMPANIAS.
const SLA_UMBRAL_SEGUNDOS = 120;

// GET /api/operaciones/supervisores/historico-sla?dias=7|30&campaniaId= —
// Fase 3, punto 3.5 del plan basado en PSUP: línea de tiempo de cómo
// evolucionan las métricas de chat día a día (no solo "hoy", como
// getProductividadDia/getComparador). Reutiliza CCO_INTERACCIONES agregando
// por día en vez de por agente/campaña, con el mismo alcance de campañas del
// supervisor que ya usan las demás pestañas.
async function getHistoricoSla(req, res) {
  try {
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const dias = [7, 30].includes(Number(req.query.dias)) ? Number(req.query.dias) : 7;
    const campaniaIdFiltro = req.query.campaniaId ? Number(req.query.campaniaId) : null;
    const pool = await databaseService.getPool(req.user?.empresa);

    const campaniasReq = pool.request();
    let campaniasWhere = '';
    if (!esAdmin) {
      campaniasWhere = `WHERE CS_SUPERVISOR_ID = @uid`;
      campaniasReq.input('uid', sql.Int, uid);
    }
    const campaniaIdsRs = await campaniasReq.query(
      esAdmin
        ? 'SELECT CM2_ID as id, CM2_NOMBRE as nombre FROM CCO_CAMPANIAS'
        : `SELECT DISTINCT c.CM2_ID as id, c.CM2_NOMBRE as nombre
           FROM CCO_CAMPANIAS c
           JOIN CC_CAMPANIAS_SUPERVISORES cs ON cs.CS_CAMPANIA_ID = c.CM2_ID ${campaniasWhere.replace('CS_SUPERVISOR_ID', 'cs.CS_SUPERVISOR_ID')}`
    );
    const campanias = campaniaIdsRs.recordset;
    let campaniaIds = campanias.map((c) => c.id);
    if (campaniaIdFiltro) campaniaIds = campaniaIds.filter((id) => id === campaniaIdFiltro);
    if (campaniaIds.length === 0) return res.json({ success: true, data: { campanias, serie: [] } });

    const agentesRs = await pool.request().query(`
      SELECT DISTINCT ga.CGA_USUARIO_ID as agenteId
      FROM CCO_GRUPO_AGENTES ga
      INNER JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (${campaniaIds.join(',')})
    `);
    const agenteIds = [...new Set(agentesRs.recordset.map((a) => a.agenteId))];
    if (agenteIds.length === 0) return res.json({ success: true, data: { campanias, serie: [] } });

    // Un día por fila: volumen de chats cerrados, promedio de segundos a
    // primera respuesta, y % de esos chats dentro del umbral de SLA.
    const serieRs = await pool.request()
      .input('dias', sql.Int, dias)
      .input('umbral', sql.Int, SLA_UMBRAL_SEGUNDOS)
      .query(`
        SELECT CAST(CI_FECHA_CIERRE AS date) as dia,
               COUNT(*) as chatsCerrados,
               AVG(CASE WHEN CI_FECHA_PRIMER_RESPUESTA IS NOT NULL
                        THEN DATEDIFF(SECOND, CI_FECHA_INICIO, CI_FECHA_PRIMER_RESPUESTA) END) as segRespuestaProm,
               100.0 * SUM(CASE WHEN CI_FECHA_PRIMER_RESPUESTA IS NOT NULL
                                 AND DATEDIFF(SECOND, CI_FECHA_INICIO, CI_FECHA_PRIMER_RESPUESTA) <= @umbral
                            THEN 1 ELSE 0 END)
               / NULLIF(SUM(CASE WHEN CI_FECHA_PRIMER_RESPUESTA IS NOT NULL THEN 1 ELSE 0 END), 0) as pctDentroSla
        FROM CCO_INTERACCIONES
        WHERE CI_AGENTE_ID IN (${agenteIds.join(',')})
          AND CI_ESTADO = 'cerrada'
          AND CAST(CI_FECHA_CIERRE AS date) >= DATEADD(DAY, -(@dias - 1), CAST(GETDATE() AS date))
          AND CAST(CI_FECHA_CIERRE AS date) <= CAST(GETDATE() AS date)
        GROUP BY CAST(CI_FECHA_CIERRE AS date)
      `);
    const porDia = new Map(serieRs.recordset.map((r) => [
      r.dia.toISOString().slice(0, 10),
      {
        chatsCerrados: r.chatsCerrados,
        segRespuestaProm: r.segRespuestaProm != null ? Math.round(r.segRespuestaProm) : null,
        pctDentroSla: r.pctDentroSla != null ? Math.round(r.pctDentroSla * 10) / 10 : null,
      },
    ]));

    // Rellena los días sin chats con ceros/null en vez de omitirlos, para que
    // la línea de tiempo no salte fechas.
    const serie = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dia = d.toISOString().slice(0, 10);
      const datos = porDia.get(dia);
      serie.push({
        dia,
        chatsCerrados: datos?.chatsCerrados ?? 0,
        segRespuestaProm: datos?.segRespuestaProm ?? null,
        pctDentroSla: datos?.pctDentroSla ?? null,
      });
    }

    res.json({ success: true, data: { campanias, serie } });
  } catch (err) {
    logger.error('operacionesController.getHistoricoSla', err);
    res.status(500).json({ success: false, message: 'Error al obtener el histórico de SLA' });
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
    const tipos = await pausaTiposService.listar(pool);
    const idsPausaCC = new Set(tipos.filter((t) => t.usos.contact_center).map((t) => t.statusId));
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
    const minutosEnPausa = sesiones.filter((s) => idsPausaCC.has(s.statusId)).reduce((sum, s) => sum + s.minutos, 0);

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
    const tipos = await pausaTiposService.listar(pool);
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
    const tiposCC = tipos.filter((t) => t.usos.contact_center);
    const idsPausaCC = new Set(tiposCC.map((t) => t.statusId));
    const pausaActiva = sesiones.find((s) => idsPausaCC.has(s.statusId) && !s.fechaFin);
    // Los 4 tipos por default con llave fija (compatibilidad) + minutos de cada
    // tipo por status_id, para los tipos que agregue la empresa.
    const minutosPorTipo = { banio: 0, comida: 0, capacitacion: 0, permiso: 0 };
    const minutosPorStatus = pausaTiposService.mapaEnCero(tiposCC);
    for (const s of sesiones) {
      if (!idsPausaCC.has(s.statusId)) continue;
      const key = pausaTiposService.llaveLegacy(tipos, s.statusId);
      if (key) minutosPorTipo[key] += s.minutos;
      minutosPorStatus[s.statusId] = (minutosPorStatus[s.statusId] ?? 0) + s.minutos;
    }
    const minutosEnPausa = Object.values(minutosPorStatus).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      data: {
        agenteId,
        fecha,
        primeraEntrada,
        estado: pausaActiva ? 'pausa' : 'disponible',
        tipoPausaActual: pausaActiva ? (pausaTiposService.llaveLegacy(tipos, pausaActiva.statusId) ?? pausaTiposService.etiquetaPausa(tipos, pausaActiva.statusId)) : null,
        minutosEnPausa,
        minutosPorTipo,
        minutosPorStatus,
        tiposPausa: tiposCC.map(({ statusId, etiqueta, emoji, color }) => ({ statusId, etiqueta, emoji, color })),
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
    const tipos = await pausaTiposService.listar(pool);

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
        WHERE CAST(fecha_inicio AS date) = @fecha AND status_id IN ${SQL_PAUSAS_CC}
        GROUP BY status_id
      `);
    const minutosPorTipo = { banio: 0, comida: 0, capacitacion: 0, permiso: 0 };
    // Minutos por status_id (incluye los tipos de pausa que agregue la empresa).
    const minutosPorStatus = pausaTiposService.mapaEnCero(tipos.filter((t) => t.usos.contact_center));
    for (const p of pausasPorTipoRs.recordset) {
      const key = pausaTiposService.llaveLegacy(tipos, p.statusId);
      if (key) minutosPorTipo[key] = p.minutos;
      minutosPorStatus[p.statusId] = p.minutos;
    }

    const rankingRs = await pool.request()
      .input('fecha', sql.NVarChar, fecha)
      .query(`
        SELECT TOP 10 ut.neus_id as agenteId, u.NEUS_NOMBRES as nombre,
               SUM(DATEDIFF(MINUTE, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE()))) as minutosPausa
        FROM USUARIO_TIEMPOS ut
        INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
        WHERE CAST(ut.fecha_inicio AS date) = @fecha AND ut.status_id IN ${SQL_PAUSAS_CC}
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
        minutosPorStatus,
        tiposPausa: tipos.filter((t) => t.usos.contact_center).map(({ statusId, etiqueta, emoji, color }) => ({ statusId, etiqueta, emoji, color })),
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

/* ── Reporte Ejecutivo de Reclutamiento: réplica del Excel de control de
   postulantes (embudo, KPIs de conversión, gráficos por canal/asesor/fecha
   de asistencia) para la campaña de un Formulario de Atención específico.
   Fuente de datos: CCO_INTERACCIONES (una fila = un postulante gestionado)
   + sus respuestas de formulario (CCF_INTERACCION_FORM_RESPUESTAS) para
   Canal de contacto, Fecha de asistencia y Horario — campos que solo viven
   ahí, no en CCO_INTERACCIONES. La etapa del embudo SÍ vive en
   CI_TIPIFICACION_ID (el campo "Estatus actual" del formulario se refleja
   ahí automáticamente — ver ccFormulariosController._guardarRespuestasCore,
   fix 2026-09-09), así que no hace falta leerla de las respuestas. */

// IDs de campo del formulario "Reclutamiento Totis Prueba" (FR_ID=3, versión
// publicada FV_ID=2) confirmados directo en BD — no hay forma genérica de
// resolverlos por etiqueta sin arriesgar falsos positivos entre formularios
// distintos, así que se referencian explícitos aquí.
const RECLUTAMIENTO_CAMPO_ID = {
  fechaAsistencia: 5,
  horario: 6,
  canalContacto: 10,
};

async function getReporteEjecutivoReclutamiento(req, res) {
  try {
    const { desde, hasta } = _rangoFechas(req);
    const campaniaId = req.query.campaniaId ? Number(req.query.campaniaId) : null;
    if (!campaniaId) return res.status(400).json({ success: false, message: 'Falta campaniaId' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rq = pool.request()
      .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
      .input('campania', sql.Int, campaniaId)
      .input('fCanal', sql.Int, RECLUTAMIENTO_CAMPO_ID.canalContacto)
      .input('fAsistencia', sql.Int, RECLUTAMIENTO_CAMPO_ID.fechaAsistencia)
      .input('fHorario', sql.Int, RECLUTAMIENTO_CAMPO_ID.horario);

    const r = await rq.query(`
      SELECT
        i.CI_ID id,
        i.CI_CLIENTE_NOMBRE clienteNombre,
        i.CI_CLIENTE_TELEFONO clienteTelefono,
        i.CI_FECHA_INICIO fechaInicio,
        i.CI_AGENTE_NOMBRE agenteNombre,
        ISNULL(t.CT_NOMBRE, '(sin estatus)') estatus,
        canal.FIR_VALOR_TEXTO canal,
        asistencia.FIR_VALOR_FECHA fechaAsistencia,
        horario.FIR_VALOR_TEXTO horario
      FROM dbo.CCO_INTERACCIONES i
      LEFT JOIN dbo.CCO_TIPIFICACIONES t ON t.CT_ID = i.CI_TIPIFICACION_ID
      LEFT JOIN dbo.CCF_INTERACCION_FORM_RESPUESTAS canal
        ON canal.FIR_INTERACCION_ID = i.CI_ID AND canal.FIR_CAMPO_ID = @fCanal
      LEFT JOIN dbo.CCF_INTERACCION_FORM_RESPUESTAS asistencia
        ON asistencia.FIR_INTERACCION_ID = i.CI_ID AND asistencia.FIR_CAMPO_ID = @fAsistencia
      LEFT JOIN dbo.CCF_INTERACCION_FORM_RESPUESTAS horario
        ON horario.FIR_INTERACCION_ID = i.CI_ID AND horario.FIR_CAMPO_ID = @fHorario
      WHERE i.CI_CAMPANIA_ID = @campania
        AND i.CI_FECHA_INICIO >= @desde AND i.CI_FECHA_INICIO < DATEADD(DAY, 1, @hasta)
        AND ISNULL(t.CT_ACTIVO, 1) = 1
      ORDER BY i.CI_FECHA_INICIO DESC
    `);

    const filas = r.recordset;
    const total = filas.length;
    const conFechaAsistencia = filas.filter((f) => f.fechaAsistencia).length;
    const conHorario = filas.filter((f) => f.horario).length;
    const conCanal = filas.filter((f) => f.canal).length;

    const SIN_CANAL = 'Sin gestionar';
    const porEstatus = new Map();
    const porCanal = new Map();
    const porAgente = new Map();
    const porFechaAsistencia = new Map();
    // IDs de interacción sin canal identificado — para poder abrir cada una
    // desde el reporte (ver conversación + tipificar) sin salir a buscarla.
    const sinGestionarIds = [];
    for (const f of filas) {
      porEstatus.set(f.estatus, (porEstatus.get(f.estatus) ?? 0) + 1);
      const canalKey = f.canal || SIN_CANAL;
      porCanal.set(canalKey, (porCanal.get(canalKey) ?? 0) + 1);
      if (!f.canal) sinGestionarIds.push({ id: f.id, clienteNombre: f.clienteNombre, fechaInicio: f.fechaInicio });
      const agenteKey = f.agenteNombre || '(sin asesor)';
      porAgente.set(agenteKey, (porAgente.get(agenteKey) ?? 0) + 1);
      if (f.fechaAsistencia) {
        const dia = new Date(f.fechaAsistencia).toISOString().slice(0, 10);
        porFechaAsistencia.set(dia, (porFechaAsistencia.get(dia) ?? 0) + 1);
      }
    }

    // KPIs de conversión — mismas etapas que el Excel: Cita Agendada, Cita
    // Confirmada, Asistió, Contratado, No asistió, No interesado, Descartado.
    // Los nombres de CCO_TIPIFICACIONES son texto libre por campaña, así que
    // se buscan por coincidencia parcial insensible a mayúsculas, no por ID fijo.
    const contarEstatus = (patron) => filas.filter((f) => f.estatus.toLowerCase().includes(patron)).length;
    const citas = contarEstatus('cita agendada');
    const confirmadas = contarEstatus('cita confirmada');
    const asistieron = contarEstatus('asisti'); // cubre "Asistió"
    const contratados = contarEstatus('contratado');
    const noAsistieron = contarEstatus('no asisti');
    const noInteresados = contarEstatus('no interesado');
    const descartados = contarEstatus('descartado');

    const pct = (num, den) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0);

    res.json({
      success: true,
      data: {
        desde, hasta, campaniaId,
        indicadores: {
          totalPostulantes: total,
          conFechaAsistencia,
          conHorario,
          conCanalIdentificado: conCanal,
        },
        embudo: Array.from(porEstatus.entries()).map(([estatus, cantidad]) => ({
          estatus, cantidad, porcentaje: pct(cantidad, total),
        })).sort((a, b) => b.cantidad - a.cantidad),
        kpisConversion: {
          citasSobreTotal: pct(citas, total),
          confirmadasSobreCitas: pct(confirmadas, citas),
          asistenciaRegistrada: pct(asistieron, total),
          contratacionSobreTotal: pct(contratados, total),
          descarteMasNoInteres: pct(descartados + noInteresados, total),
        },
        graficos: {
          distribucionPorEstatus: Array.from(porEstatus.entries()).map(([estatus, cantidad]) => ({ estatus, cantidad })),
          origenPorCanal: Array.from(porCanal.entries()).map(([canal, cantidad]) => ({ canal, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
          gestionPorAsesor: Array.from(porAgente.entries()).map(([agente, cantidad]) => ({ agente, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
          agendaPorFechaAsistencia: Array.from(porFechaAsistencia.entries()).map(([fecha, cantidad]) => ({ fecha, cantidad })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
        },
        sinGestionar: sinGestionarIds,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getReporteEjecutivoReclutamiento', err);
    res.status(500).json({ success: false, message: 'Error al obtener el reporte ejecutivo de reclutamiento' });
  }
}

/* ── Campañas de ventas: reporte ejecutivo y pre nómina ──
   Para una campaña de AGYDA cuyo grupo tiene campaña de ventas (ver
   ventasCampaniaService), los números salen de la BD de Ventas — ahí caen
   tanto el histórico como lo que se captura en AGYDA (ventasSyncService). */

const esFechaISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Quincena de Nómina que contiene `fecha` (NOMINA_PERIODOS) o, si aún no se
// crea, la del calendario: 1–15 o 16–fin de mes.
async function _quincenaDe(pool, fecha) {
  const r = await pool.request().input('f', sql.NVarChar(10), fecha).query(`
    SELECT TOP 1 CONVERT(VARCHAR(10), FECHA_INICIO, 23) desde, CONVERT(VARCHAR(10), FECHA_FIN, 23) hasta
    FROM NOMINA_PERIODOS WHERE CAST(@f AS date) BETWEEN CAST(FECHA_INICIO AS date) AND CAST(FECHA_FIN AS date)
    ORDER BY FECHA_INICIO DESC`).catch(() => ({ recordset: [] }));
  if (r.recordset[0]) return r.recordset[0];
  const [a, m, d] = fecha.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return d <= 15 ? { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-15` } : { desde: `${a}-${mm}-16`, hasta: `${a}-${mm}-${ultimo}` };
}

// Días hábiles (lunes a sábado) de un rango, como las faltas de Nómina.
function _diasHabiles(desde, hasta) {
  let n = 0;
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  for (let guard = 0; d <= fin && guard < 62; guard++) {
    if (d.getUTCDay() !== 0) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

// Pre nómina (última quincena calculada) — null si la empresa no usa Nómina.
async function _preNomina(pool) {
  try {
    const pre = await require('./nominaController').calcularPreNomina(pool, null);
    return pre?.periodo ? pre : null;
  } catch (e) {
    logger.error('operacionesController → pre nómina', e);
    return null;
  }
}

// Comisión por venta de un agente en una campaña de la pre nómina (misma
// regla que calcularPreNomina: tarifa fija o % del sueldo).
const _comisionPorVenta = (camp, sueldo) => (!camp ? null : camp.tipoTarifa === 'porcentaje' ? (sueldo ?? 0) * (camp.tarifa / 100) : camp.tarifa);

// GET /api/operaciones/campanias/:id/reporte-ejecutivo-ventas?desde=&hasta=
// Embudo por estatus, conversión, asesores, días contra meta (VENTAS_METAS)
// y la quincena contra lo que pide la pre nómina. data = null si la campaña
// no es de ventas (la Suite muestra entonces el reporte de reclutamiento).
async function getReporteEjecutivoVentas(req, res) {
  try {
    const { desde, hasta } = _rangoFechas(req);
    if (!esFechaISO(desde) || !esFechaISO(hasta)) return res.status(400).json({ success: false, message: 'Fechas inválidas' });
    const campaniaId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    const ctx = await ventasCampania.contextoVentas(pool, campaniaId);
    if (!ctx) return res.json({ success: true, data: null });

    const pv = await ventasCampania.poolVentas();
    const contados = await ventasCampania.estatusContados(pool, 'metas');
    const inContados = ventasCampania.sqlIn(contados);
    const c = ctx.campanaVentasId;
    const enRango = () => pv.request().input('c', sql.Int, c).input('desde', sql.NVarChar(10), desde).input('hasta', sql.NVarChar(10), hasta);
    const RANGO = 'campaignId = @c AND fecha >= @desde AND fecha < DATEADD(DAY, 1, CAST(@hasta AS date))';
    const CONTADA = `CASE WHEN LTRIM(RTRIM(estatus)) IN (${inContados}) THEN 1 ELSE 0 END`;

    const [estRs, asesorRs, diaRs, estatusConf] = await Promise.all([
      enRango().query(`SELECT ISNULL(NULLIF(LTRIM(RTRIM(estatus)), ''), '(sin estatus)') estatus, COUNT(*) n
        FROM Ventas WHERE ${RANGO} GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(estatus)), ''), '(sin estatus)')`),
      enRango().query(`SELECT idUser, LTRIM(RTRIM(nombreAgente)) nombre, COUNT(*) total, SUM(${CONTADA}) contadas
        FROM Ventas WHERE ${RANGO} GROUP BY idUser, LTRIM(RTRIM(nombreAgente))`),
      enRango().query(`SELECT CONVERT(varchar(10), fecha, 23) dia, COUNT(*) total, SUM(${CONTADA}) contadas
        FROM Ventas WHERE ${RANGO} GROUP BY CONVERT(varchar(10), fecha, 23)`),
      ventasCampania.estatusDeCampana(pv, c).catch(() => []),
    ]);

    // Metas diarias de la campaña en el rango: las de campaña (meta del
    // equipo) si las hay; si no, la suma de las de cada asesor.
    const metasRs = await pool.request().input('c', sql.Int, c).input('desde', sql.NVarChar(10), desde).input('hasta', sql.NVarChar(10), hasta)
      .query(`SELECT VM_ALCANCE alcance, VM_ASESOR_ID asesorId, VM_PERIODO dia, SUM(ISNULL(VM_META_UNIDADES, 0)) meta
              FROM VENTAS_METAS WHERE VM_TIPO = 'diaria' AND VM_CAMPANA_ID = @c AND VM_PERIODO BETWEEN @desde AND @hasta
              GROUP BY VM_ALCANCE, VM_ASESOR_ID, VM_PERIODO`).catch(() => ({ recordset: [] }));
    const metaCampanaDia = new Map(); const metaAsesorDia = new Map(); const metaPorAsesor = new Map();
    for (const m of metasRs.recordset) {
      const v = Number(m.meta) || 0;
      if (m.alcance === 'campana') metaCampanaDia.set(m.dia, (metaCampanaDia.get(m.dia) ?? 0) + v);
      else {
        metaAsesorDia.set(m.dia, (metaAsesorDia.get(m.dia) ?? 0) + v);
        metaPorAsesor.set(m.asesorId, (metaPorAsesor.get(m.asesorId) ?? 0) + v);
      }
    }
    const metaDeEquipo = metaCampanaDia.size > 0;
    const metaDia = metaDeEquipo ? metaCampanaDia : metaAsesorDia;
    const metaTotal = [...metaDia.values()].reduce((s, n) => s + n, 0);

    const total = estRs.recordset.reduce((s, r) => s + r.n, 0);
    const contadas = asesorRs.recordset.reduce((s, r) => s + (r.contadas || 0), 0);
    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
    const n = ventasCampania.normalizar;

    const colorDe = new Map(estatusConf.map((e) => [n(e.nombre), e.color]));
    const ordenDe = new Map(estatusConf.map((e, i) => [n(e.nombre), i]));
    const embudo = estRs.recordset
      .map((r) => ({
        estatus: r.estatus, cantidad: r.n, porcentaje: pct(r.n, total) ?? 0,
        color: colorDe.get(n(r.estatus)) ?? null,
        cuentaComoVenta: contados.some((e) => n(e) === n(r.estatus)),
      }))
      .sort((a, b) => (ordenDe.get(n(a.estatus)) ?? 99) - (ordenDe.get(n(b.estatus)) ?? 99) || b.cantidad - a.cantidad);

    // Asesores: uno por usuario de Ventas (o por nombre si la venta no trae
    // usuario, como las que llegan de AGYDA sin asesor ligado).
    const porAsesor = new Map();
    for (const r of asesorRs.recordset) {
      const clave = r.idUser ? `u${r.idUser}` : `n${n(r.nombre)}`;
      const f = porAsesor.get(clave) ?? { asesorId: r.idUser || null, nombre: r.nombre || '(sin asesor)', total: 0, contadas: 0 };
      f.total += r.total; f.contadas += r.contadas || 0;
      porAsesor.set(clave, f);
    }
    const sinVentas = [...metaPorAsesor.keys()].filter((id) => id && !porAsesor.has(`u${id}`));
    if (sinVentas.length) {
      const us = (await pv.request().query(`SELECT idUser id, nombreAgente nombre FROM Users WHERE idUser IN (${sinVentas.map(Number).join(',')})`)).recordset;
      for (const u of us) porAsesor.set(`u${u.id}`, { asesorId: u.id, nombre: String(u.nombre || '').trim(), total: 0, contadas: 0 });
    }
    const asesores = [...porAsesor.values()].map((f) => {
      const meta = f.asesorId ? metaPorAsesor.get(f.asesorId) ?? null : null;
      return { ...f, conversion: pct(f.contadas, f.total), meta, cumplimiento: meta ? pct(f.contadas, meta) : null };
    }).sort((a, b) => b.contadas - a.contadas || b.total - a.total);

    const diasConDatos = new Set([...diaRs.recordset.map((d) => d.dia), ...metaDia.keys()]);
    const porDia = [...diasConDatos].sort().map((dia) => {
      const d = diaRs.recordset.find((x) => x.dia === dia);
      return { dia, total: d?.total ?? 0, contadas: d?.contadas ?? 0, meta: metaDia.get(dia) ?? null };
    });

    await ventasCampania.asegurarTabla(pool);
    const agyda = (await pool.request().input('c', sql.Int, c).input('desde', sql.NVarChar(10), desde).input('hasta', sql.NVarChar(10), hasta)
      .query(`SELECT COUNT(*) n FROM dbo.CC_VENTAS_SYNC WHERE VS_CAMPANA_VENTAS_ID = @c
              AND VS_FECHA >= @desde AND VS_FECHA < DATEADD(DAY, 1, CAST(@hasta AS date))`)).recordset[0].n;

    // Pre nómina: ventas (de las que paga Nómina) que la campaña necesita por
    // quincena para cubrir la nómina, contra lo que lleva la quincena actual.
    let preNomina = null;
    const pre = await _preNomina(pool);
    if (pre) {
      const camp = pre.campanas.find((x) => x.campanaId === c) ?? null;
      const quincena = await _quincenaDe(pool, new Date().toISOString().slice(0, 10));
      const llevaRs = await pv.request().input('c', sql.Int, c).input('qd', sql.NVarChar(10), quincena.desde).input('qh', sql.NVarChar(10), quincena.hasta)
        .query(`SELECT COUNT(*) n FROM Ventas WHERE campaignId = @c AND fecha >= @qd AND fecha < DATEADD(DAY, 1, CAST(@qh AS date))
                AND LTRIM(RTRIM(estatus)) IN (${ventasCampania.sqlIn(ventasCampania.ESTATUS_NOMINA)})`);
      preNomina = {
        base: pre.periodo,
        configurada: !!camp,
        quincena,
        ventasNecesarias: camp?.ventasNecesarias ?? null,
        ventasSoloEstaCampana: camp?.ventasSoloEstaCampana ?? null,
        ventasQuincena: llevaRs.recordset[0].n,
        comisionPorVenta: camp?.comisionPorVenta ?? null,
        gananciaPorVenta: camp?.gananciaNeta ?? null,
      };
    }

    res.json({
      success: true,
      data: {
        desde, hasta, campaniaId,
        campana: { id: c, nombre: ctx.campanaVentasNombre, soloMarcador: ctx.soloMarcador },
        estatusContados: contados,
        indicadores: {
          total, contadas, conversion: pct(contadas, total),
          capturadasAgyda: agyda,
          asesores: asesores.filter((a) => a.total > 0).length,
          meta: metaTotal || null, metaDeEquipo,
          cumplimiento: metaTotal ? pct(contadas, metaTotal) : null,
        },
        embudo,
        asesores,
        porDia,
        preNomina,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getReporteEjecutivoVentas', err);
    res.status(500).json({ success: false, message: 'Error al obtener el reporte ejecutivo de ventas' });
  }
}

// GET /api/operaciones/panorama?desde=&hasta= — primera vista de la Suite:
// cada campaña activa con lo que movió en el rango, en una sola unidad
// ("registros") para poder compararlas: interacciones de sus canales +
// postulantes registrados + registros de su campaña de Ventas que no salieron
// de AGYDA (esos ya cuentan como interacción). Más el desglose de cada fuente,
// las ventas (estatus que paga Nómina) y la serie por día.
async function getPanoramaCampanias(req, res) {
  try {
    const { desde, hasta } = _rangoFechas(req);
    if (!esFechaISO(desde) || !esFechaISO(hasta)) return res.status(400).json({ success: false, message: 'Fechas inválidas' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const campanias = (await pool.request().query(`
      SELECT CM2_ID id, LTRIM(RTRIM(CM2_NOMBRE)) nombre FROM dbo.CCO_CAMPANIAS WHERE CM2_ACTIVO = 1 ORDER BY CM2_NOMBRE`)).recordset;
    const vacio = { desde, hasta, dias: [], totales: {}, campanias: [] };
    if (!campanias.length) return res.json({ success: true, data: vacio });
    const ids = campanias.map((c) => c.id).join(',');
    const rango = () => pool.request().input('desde', sql.NVarChar(10), desde).input('hasta', sql.NVarChar(10), hasta);

    const [interRs, postRs, gruposRs] = await Promise.all([
      rango().query(`
        SELECT CI_CAMPANIA_ID c, CONVERT(varchar(10), CI_FECHA_INICIO, 23) dia, COUNT(*) total,
               SUM(CASE WHEN CI_ESTADO = 'cerrada' THEN 1 ELSE 0 END) cerradas
        FROM dbo.CCO_INTERACCIONES
        WHERE CI_CAMPANIA_ID IN (${ids}) AND CI_FECHA_INICIO >= @desde AND CI_FECHA_INICIO < DATEADD(DAY, 1, CAST(@hasta AS date))
        GROUP BY CI_CAMPANIA_ID, CONVERT(varchar(10), CI_FECHA_INICIO, 23)`),
      rango().query(`
        SELECT CP_CAMPANIA_ID c, CONVERT(varchar(10), CP_FECHA_REGISTRO, 23) dia, COUNT(*) total
        FROM dbo.CCO_CAMPANIA_POSTULANTES
        WHERE CP_CAMPANIA_ID IN (${ids}) AND CP_FECHA_REGISTRO >= @desde AND CP_FECHA_REGISTRO < DATEADD(DAY, 1, CAST(@hasta AS date))
        GROUP BY CP_CAMPANIA_ID, CONVERT(varchar(10), CP_FECHA_REGISTRO, 23)`).catch(() => ({ recordset: [] })),
      pool.request().query(`
        SELECT c.CM2_ID campaniaId, e.EQ_MODALIDAD modalidad, e.EQ_VENTAS_CAMPANA_ID ventasId, e.EQ_VENTAS_CAMPANA_NOMBRE ventasNombre
        FROM dbo.CCO_CAMPANIAS c
        JOIN dbo.CC_EQUIPOS e ON e.EQ_ACTIVO = 1 AND (e.EQ_CAMPANIA_ID = c.CM2_ID
          OR EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID AND ec.EQC_CAMPANIA_ID = c.CM2_ID))
        WHERE c.CM2_ID IN (${ids})`).catch(() => ({ recordset: [] })),
    ]);

    // Campaña de Ventas y modalidades de cada campaña (según sus grupos).
    const porCampania = new Map(campanias.map((c) => [c.id, {
      id: c.id, nombre: c.nombre, ventasId: null, ventasNombre: null, modalidades: new Set(),
      interacciones: 0, cerradas: 0, postulantes: 0, ventasRegistros: 0, ventas: 0, serie: new Map(),
    }]));
    for (const g of gruposRs.recordset) {
      const c = porCampania.get(g.campaniaId);
      if (!c) continue;
      if (g.modalidad) c.modalidades.add(g.modalidad);
      if (g.ventasId && !c.ventasId) { c.ventasId = g.ventasId; c.ventasNombre = g.ventasNombre; }
    }
    const sumarDia = (c, dia, n) => c.serie.set(dia, (c.serie.get(dia) ?? 0) + n);
    for (const r of interRs.recordset) {
      const c = porCampania.get(r.c); if (!c) continue;
      c.interacciones += r.total; c.cerradas += r.cerradas; sumarDia(c, r.dia, r.total);
    }
    for (const r of postRs.recordset) {
      const c = porCampania.get(r.c); if (!c) continue;
      c.postulantes += r.total; sumarDia(c, r.dia, r.total);
    }

    // Ventas: por campaña de Ventas; lo capturado en AGYDA no se suma a
    // "registros" (ya es interacción) pero sí a los números de Ventas.
    const conVentas = [...porCampania.values()].filter((c) => c.ventasId);
    let errorVentas = null;
    if (conVentas.length) {
      try {
        const pv = await ventasCampania.poolVentas();
        const ventasIds = [...new Set(conVentas.map((c) => Number(c.ventasId)))];
        await ventasCampania.asegurarTabla(pool);
        const sinc = new Set((await pool.request().query(`SELECT VS_VENTA_ID id FROM dbo.CC_VENTAS_SYNC WHERE VS_CAMPANA_VENTAS_ID IN (${ventasIds.join(',')})`)).recordset.map((r) => r.id));
        const vRs = await pv.request().input('desde', sql.NVarChar(10), desde).input('hasta', sql.NVarChar(10), hasta).query(`
          SELECT idVenta, campaignId, CONVERT(varchar(10), fecha, 23) dia,
                 CASE WHEN LTRIM(RTRIM(estatus)) IN (${ventasCampania.sqlIn(ventasCampania.ESTATUS_NOMINA)}) THEN 1 ELSE 0 END esVenta
          FROM Ventas
          WHERE campaignId IN (${ventasIds.join(',')}) AND fecha >= @desde AND fecha < DATEADD(DAY, 1, CAST(@hasta AS date))`);
        for (const v of vRs.recordset) {
          // Una campaña de Ventas puede estar en varias campañas de AGYDA: cuenta en cada una.
          for (const c of conVentas.filter((x) => Number(x.ventasId) === v.campaignId)) {
            c.ventasRegistros += 1; c.ventas += v.esVenta;
            if (!sinc.has(v.idVenta)) sumarDia(c, v.dia, 1);
          }
        }
      } catch (e) {
        errorVentas = `No se pudo leer la BD de Ventas: ${e.message}`;
        logger.error('operacionesController.getPanoramaCampanias → Ventas', e);
      }
    }

    // Días del rango (máx. 93 para que la gráfica no se vuelva ilegible).
    const dias = [];
    const d = new Date(`${desde}T12:00:00Z`);
    const fin = new Date(`${hasta}T12:00:00Z`);
    for (let i = 0; d <= fin && i < 93; i++) { dias.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }

    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
    const lista = [...porCampania.values()].map((c) => {
      const registros = [...c.serie.values()].reduce((s, n) => s + n, 0);
      return {
        id: c.id, nombre: c.nombre,
        ventasNombre: c.ventasNombre,
        modalidad: c.modalidades.has('ambos') || (c.modalidades.has('marcador') && c.modalidades.has('omnicanal')) ? 'ambos'
          : c.modalidades.has('marcador') ? 'marcador' : c.modalidades.has('omnicanal') ? 'omnicanal' : null,
        registros, interacciones: c.interacciones, cerradas: c.cerradas, postulantes: c.postulantes,
        ventasRegistros: c.ventasRegistros, ventas: c.ventas, conversion: c.ventasId ? pct(c.ventas, c.ventasRegistros) : null,
        serie: dias.map((dia) => c.serie.get(dia) ?? 0),
      };
    }).sort((a, b) => b.registros - a.registros || a.nombre.localeCompare(b.nombre));

    const suma = (k) => lista.reduce((s, c) => s + (c[k] || 0), 0);
    res.json({
      success: true,
      data: {
        desde, hasta, dias, errorVentas,
        totales: {
          campanias: lista.length,
          conActividad: lista.filter((c) => c.registros > 0 || c.ventasRegistros > 0).length,
          registros: suma('registros'), interacciones: suma('interacciones'), cerradas: suma('cerradas'),
          postulantes: suma('postulantes'), ventasRegistros: suma('ventasRegistros'), ventas: suma('ventas'),
          conversion: pct(suma('ventas'), suma('ventasRegistros')),
        },
        campanias: lista,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getPanoramaCampanias', err);
    res.status(500).json({ success: false, message: 'Error al armar el panorama de campañas' });
  }
}

// Rango de un periodo que contiene `fecha`: día, semana (lunes a domingo) o mes.
function _rangoPeriodo(periodo, fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  const iso = (x) => x.toISOString().slice(0, 10);
  if (periodo === 'week') {
    const ini = new Date(d); ini.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const fin = new Date(ini); fin.setUTCDate(ini.getUTCDate() + 6);
    return { desde: iso(ini), hasta: iso(fin) };
  }
  if (periodo === 'month') {
    return { desde: `${fecha.slice(0, 8)}01`, hasta: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))) };
  }
  return { desde: fecha, hasta: fecha };
}

// GET /api/operaciones/campanias/:id/ventas-por-agente?periodo=day|week|month&fecha=
//   (o ?desde=&hasta=) — registros de Ventas por asesor y estatus, con la
// misma forma que /admin/stats/dynamic del sistema de Ventas, para pintar
// sus barras apiladas (StatColumnDynamic) en la Suite. data = null si la
// campaña no es de ventas.
async function getVentasPorAgente(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const ctx = await ventasCampania.contextoVentas(pool, Number(req.params.id));
    if (!ctx) return res.json({ success: true, data: null });
    let { desde, hasta } = req.query;
    if (!esFechaISO(desde) || !esFechaISO(hasta)) {
      const fecha = esFechaISO(req.query.fecha) ? req.query.fecha : new Date().toISOString().slice(0, 10);
      ({ desde, hasta } = _rangoPeriodo(String(req.query.periodo || 'day'), fecha));
    }
    const pv = await ventasCampania.poolVentas();
    const c = ctx.campanaVentasId;
    const [rs, conf] = await Promise.all([
      pv.request().input('c', sql.Int, c).input('desde', sql.NVarChar(10), desde).input('hasta', sql.NVarChar(10), hasta).query(`
        SELECT idUser, LTRIM(RTRIM(nombreAgente)) nombre,
               ISNULL(NULLIF(LTRIM(RTRIM(estatus)), ''), '(sin estatus)') estatus, COUNT(*) n
        FROM Ventas
        WHERE campaignId = @c AND fecha >= @desde AND fecha < DATEADD(DAY, 1, CAST(@hasta AS date))
        GROUP BY idUser, LTRIM(RTRIM(nombreAgente)), ISNULL(NULLIF(LTRIM(RTRIM(estatus)), ''), '(sin estatus)')`),
      pv.request().input('c', sql.Int, c).query(`
        SELECT id, LTRIM(RTRIM(nombreEstado)) nombreEstado, color FROM CampaignStatuses
        WHERE campaignId = @c AND activo = 1 ORDER BY orden, id`),
    ]);
    // Un asesor por usuario de Ventas (o por nombre si la venta no trae usuario).
    const porAgente = new Map();
    const totales = {};
    let sinUsuario = 0;
    for (const r of rs.recordset) {
      const clave = r.idUser ? `u${r.idUser}` : `n${ventasCampania.normalizar(r.nombre)}`;
      if (!porAgente.has(clave)) {
        porAgente.set(clave, {
          agentId: r.idUser || -(++sinUsuario), nombreAgente: r.nombre || '(sin asesor)',
          campaignId: c, campaignNombre: ctx.campanaVentasNombre, estatusCounts: {}, total: 0,
        });
      }
      const a = porAgente.get(clave);
      a.estatusCounts[r.estatus] = (a.estatusCounts[r.estatus] ?? 0) + r.n;
      a.total += r.n;
      totales[r.estatus] = (totales[r.estatus] ?? 0) + r.n;
    }
    res.json({
      success: true,
      data: { desde, hasta, stats: [...porAgente.values()], statuses: conf.recordset, totalesPorEstatus: totales, ventas: [] },
    });
  } catch (err) {
    logger.error('operacionesController.getVentasPorAgente', err);
    res.status(500).json({ success: false, message: 'Error al leer las ventas por agente' });
  }
}

// Ventas del día y de la quincena de cada agente de una campaña de ventas,
// contra su meta (VENTAS_METAS) y lo que pide la pre nómina. Los agentes de
// AGYDA se cruzan con los asesores de Ventas por nombre (como Nómina).
async function _productividadVentas(pool, ctx, fecha, agenteIds, nombrePorId) {
  const pv = await ventasCampania.poolVentas();
  const quincena = await _quincenaDe(pool, fecha);
  const contados = await ventasCampania.estatusContados(pool, 'metas');
  const c = ctx.campanaVentasId;
  const rs = await pv.request().input('c', sql.Int, c).input('f', sql.NVarChar(10), fecha)
    .input('qd', sql.NVarChar(10), quincena.desde).input('qh', sql.NVarChar(10), quincena.hasta)
    .query(`
      SELECT idUser, LTRIM(RTRIM(nombreAgente)) nombre,
        SUM(CASE WHEN CONVERT(varchar(10), fecha, 23) = @f THEN 1 ELSE 0 END) totalDia,
        SUM(CASE WHEN CONVERT(varchar(10), fecha, 23) = @f AND LTRIM(RTRIM(estatus)) IN (${ventasCampania.sqlIn(contados)}) THEN 1 ELSE 0 END) contadasDia,
        SUM(CASE WHEN CONVERT(varchar(10), fecha, 23) <= @f AND LTRIM(RTRIM(estatus)) IN (${ventasCampania.sqlIn(ventasCampania.ESTATUS_NOMINA)}) THEN 1 ELSE 0 END) pagablesQuincena
      FROM Ventas
      WHERE campaignId = @c AND fecha >= @qd AND fecha < DATEADD(DAY, 1, CAST(@qh AS date))
      GROUP BY idUser, LTRIM(RTRIM(nombreAgente))`);
  const metasRs = await pool.request().input('c', sql.Int, c).input('f', sql.NVarChar(10), fecha)
    .query(`SELECT VM_ASESOR_ID asesorId, SUM(ISNULL(VM_META_UNIDADES, 0)) meta FROM VENTAS_METAS
            WHERE VM_TIPO = 'diaria' AND VM_ALCANCE = 'asesor' AND VM_CAMPANA_ID = @c AND VM_PERIODO = @f
            GROUP BY VM_ASESOR_ID`).catch(() => ({ recordset: [] }));
  const metaPorAsesor = new Map(metasRs.recordset.map((m) => [m.asesorId, Number(m.meta) || 0]));
  const asesores = await ventasCampania.asesoresVentas(pv);

  const pre = await _preNomina(pool);
  const campPre = pre?.campanas?.find((x) => x.campanaId === c) ?? null;
  const diasQuincena = _diasHabiles(quincena.desde, quincena.hasta);
  const campana = {
    nombre: ctx.campanaVentasNombre,
    quincena,
    pagablesQuincena: rs.recordset.reduce((s, r) => s + (r.pagablesQuincena || 0), 0),
    necesariasQuincena: campPre?.ventasNecesarias ?? null,
    preNominaBase: pre?.periodo ?? null,
  };

  const porAgente = new Map();
  for (const id of agenteIds) {
    const nombre = nombrePorId.get(id) ?? '';
    const norm = ventasCampania.normalizar(nombre);
    const idsV = nombre ? ventasCampania.idsVentasDe(asesores, nombre) : [];
    const suyas = rs.recordset.filter((r) => (r.idUser && idsV.includes(r.idUser)) || ventasCampania.mismoNombre(ventasCampania.normalizar(r.nombre), norm));
    const sum = (k) => suyas.reduce((s, r) => s + (r[k] || 0), 0);
    const metaCapturada = idsV.reduce((s, x) => s + (metaPorAsesor.get(x) ?? 0), 0);

    const agPre = pre?.agentes?.find((a) => a.neusId === id) ?? null;
    const sueldo = agPre?.sueldo ?? pre?.config?.sueldoBase ?? null;
    const aporte = pre?.equilibrio?.aportePromedio ?? 0;
    const minimas = agPre?.ventasMinimas ?? (aporte > 0 && sueldo ? Math.ceil(sueldo / aporte) : null);
    // Sin meta capturada en Metas, la sugerida por la pre nómina: sus ventas
    // mínimas de la quincena repartidas en los días hábiles.
    const metaSugerida = minimas && diasQuincena ? Math.ceil(minimas / diasQuincena) : null;
    const metaDia = metaCapturada > 0 ? metaCapturada : metaSugerida;
    const contadasDia = sum('contadasDia');
    const pagables = sum('pagablesQuincena');
    const comision = _comisionPorVenta(campPre, sueldo);

    porAgente.set(id, {
      ligadoAVentas: idsV.length > 0 || suyas.length > 0,
      totalDia: sum('totalDia'),
      contadasDia,
      metaDia,
      metaOrigen: metaCapturada > 0 ? 'metas' : metaSugerida ? 'pre_nomina' : null,
      cumplimientoDia: metaDia ? Math.round((contadasDia / metaDia) * 1000) / 10 : null,
      pagablesQuincena: pagables,
      minimasQuincena: minimas,
      sueldo,
      comisionEstimada: comision != null ? Math.round(pagables * comision * 100) / 100 : null,
      campana,
    });
  }
  return porAgente;
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
      SELECT ult.tipificacion, COUNT(*) total
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      LEFT JOIN dbo.VW_CCO_POSTULANTE_ULTIMA_TIPIFICACION ult ON ult.postulanteId = cp.CP_ID
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
      GROUP BY ult.tipificacion`);
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
      LEFT JOIN dbo.VW_CCO_POSTULANTE_ULTIMA_TIPIFICACION ult ON ult.postulanteId = cp.CP_ID
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
        AND ult.tipificacion IS NULL`);

  const sinTipListaRs = await pool.request()
    .input('desde', sql.NVarChar, desde).input('hasta', sql.NVarChar, hasta)
    .query(`
      SELECT TOP 10 cp.CP_NOMBRE nombre, cp.CP_TELEFONO telefono, c.CM2_NOMBRE campania,
             DATEDIFF(DAY, cp.CP_FECHA_REGISTRO, GETDATE()) diasEsperando
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = cp.CP_CAMPANIA_ID
      LEFT JOIN dbo.VW_CCO_POSTULANTE_ULTIMA_TIPIFICACION ult ON ult.postulanteId = cp.CP_ID
      WHERE cp.CP_FECHA_REGISTRO >= @desde AND cp.CP_FECHA_REGISTRO < DATEADD(DAY, 1, @hasta)
        AND ult.tipificacion IS NULL
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
          ult.tipificacion,
          ult.observaciones,
          ult.extension,
          ult.fecha
        FROM dbo.CCO_CAMPANIA_POSTULANTES cp
        LEFT JOIN dbo.VW_CCO_POSTULANTE_ULTIMA_TIPIFICACION ult ON ult.postulanteId = cp.CP_ID
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

/* ── Interacciones cerradas: listado general con buscador real (todas las
   campañas/canales del Contact Center, no acotado a un formulario) ──
   Mismo criterio de "cerrada" que buscarInteraccionesDelFormulario
   (ccFormulariosController.js), pero sin el filtro de campañas de un
   formulario — este es el listado completo para la Suite de reportes. */

function _buildWhereInteracciones(req, rq) {
  const where = [`i.CI_ESTADO = 'cerrada'`];
  if (req.query.texto) {
    rq.input('texto', sql.NVarChar(200), `%${req.query.texto}%`);
    where.push('(i.CI_CLIENTE_NOMBRE LIKE @texto OR i.CI_CLIENTE_TELEFONO LIKE @texto)');
  }
  if (req.query.agenteId) {
    rq.input('agenteId', sql.Int, req.query.agenteId);
    where.push('i.CI_AGENTE_ID = @agenteId');
  }
  if (req.query.tipificacionId) {
    rq.input('tipificacionId', sql.Int, req.query.tipificacionId);
    where.push('i.CI_TIPIFICACION_ID = @tipificacionId');
  }
  // Por nombre: en el apartado de una campaña la lista de tipificaciones
  // mezcla las de AGYDA con los estatus de Ventas (ver getContextoReportesCampania).
  if (req.query.tipificacion) {
    rq.input('tipificacionNombre', sql.NVarChar(100), String(req.query.tipificacion));
    where.push('LTRIM(RTRIM(ti.CT_NOMBRE)) = @tipificacionNombre');
  }
  if (req.query.campaniaId) {
    rq.input('campaniaId', sql.Int, req.query.campaniaId);
    where.push('i.CI_CAMPANIA_ID = @campaniaId');
  }
  if (req.query.desde) {
    rq.input('desde', sql.DateTime, new Date(`${req.query.desde}T00:00:00`));
    where.push('i.CI_FECHA_CIERRE >= @desde');
  }
  if (req.query.hasta) {
    rq.input('hasta', sql.DateTime, new Date(`${req.query.hasta}T23:59:59`));
    where.push('i.CI_FECHA_CIERRE <= @hasta');
  }
  return where;
}

// Canal con el que se muestran los registros del histórico de Ventas (vienen
// del marcador: el sistema de Ventas no tiene canales).
const CANAL_VENTAS = 'Marcador (Ventas)';

// Registros del histórico de Ventas de la campaña con los mismos filtros del
// listado. Los que ya salieron de una interacción de AGYDA (CC_VENTAS_SYNC)
// no se repiten: esos vienen de CCO_INTERACCIONES. id negativo (-idVenta).
async function _interaccionesDeVentas(pool, req, ctx, top) {
  // Un id de tipificación de AGYDA no existe en Ventas: con ese filtro no aplica.
  if (req.query.tipificacionId) return [];
  const pv = await ventasCampania.poolVentas();
  const excluir = await ventasCampania.ventasSincronizadas(pool, ctx.campanaVentasId);
  const rq = pv.request().input('c', sql.Int, ctx.campanaVentasId);
  const where = ['campaignId = @c'];
  if (excluir.length) where.push(`idVenta NOT IN (${excluir.join(',')})`);
  if (req.query.texto) {
    rq.input('texto', sql.NVarChar(200), `%${req.query.texto}%`);
    where.push('(nombreCliente LIKE @texto OR telefonoCliente LIKE @texto)');
  }
  if (req.query.tipificacion) {
    rq.input('tip', sql.NVarChar(100), String(req.query.tipificacion));
    where.push('LTRIM(RTRIM(estatus)) = @tip');
  }
  if (req.query.agenteId) {
    // El agente de AGYDA es su asesor en Ventas por nombre (como Nómina y Metas).
    const u = await pool.request().input('id', sql.Int, Number(req.query.agenteId))
      .query('SELECT NEUS_NOMBRES nombre FROM NEUS_USUARIOS WHERE NEUS_ID = @id');
    const nombre = String(u.recordset[0]?.nombre || '').trim();
    if (!nombre) return [];
    const ids = ventasCampania.idsVentasDe(await ventasCampania.asesoresVentas(pv), nombre);
    rq.input('agNombre', sql.NVarChar(200), nombre);
    where.push(`(${ids.length ? `idUser IN (${ids.join(',')}) OR ` : ''}LTRIM(RTRIM(nombreAgente)) = @agNombre)`);
  }
  // Ventas guarda la hora local del servidor: el rango va por fecha de calendario.
  if (req.query.desde) { rq.input('desde', sql.NVarChar(10), String(req.query.desde)); where.push('fecha >= @desde'); }
  if (req.query.hasta) { rq.input('hasta', sql.NVarChar(10), String(req.query.hasta)); where.push('fecha < DATEADD(DAY, 1, CAST(@hasta AS date))'); }

  const campaniaNombre = (await pool.request().input('c', sql.Int, Number(req.query.campaniaId))
    .query('SELECT CM2_NOMBRE n FROM CCO_CAMPANIAS WHERE CM2_ID = @c')).recordset[0]?.n ?? ctx.campanaVentasNombre;
  const rs = await rq.query(`
    SELECT TOP (${top}) idVenta, nombreCliente, telefonoCliente, nombreAgente, estatus, fecha
    FROM Ventas WHERE ${where.join(' AND ')}
    ORDER BY fecha DESC, idVenta DESC`);
  const t = (v) => (v == null ? null : String(v).trim() || null);
  return rs.recordset.map((v) => ({
    id: -v.idVenta,
    clienteNombre: t(v.nombreCliente),
    clienteTelefono: t(v.telefonoCliente),
    agenteId: null,
    agenteNombre: t(v.nombreAgente),
    fechaInicio: v.fecha,
    fechaCierre: v.fecha,
    estado: 'cerrada',
    canalNombre: CANAL_VENTAS,
    campaniaNombre,
    tipificacionNombre: t(v.estatus),
    origen: 'ventas',
  }));
}

// Interacciones cerradas de AGYDA + (en una campaña de ventas) su histórico
// de Ventas, las más recientes primero.
async function _buscarInteracciones(req, top) {
  const pool = await databaseService.getPool(req.user?.empresa);
  const rq = pool.request();
  const where = _buildWhereInteracciones(req, rq);
  const rs = await rq.query(`
    SELECT TOP ${top}
      i.CI_ID id, i.CI_CLIENTE_NOMBRE clienteNombre, i.CI_CLIENTE_TELEFONO clienteTelefono,
      i.CI_AGENTE_ID agenteId, i.CI_AGENTE_NOMBRE agenteNombre,
      i.CI_FECHA_INICIO fechaInicio, i.CI_FECHA_CIERRE fechaCierre, i.CI_ESTADO estado,
      cn.CN_NOMBRE canalNombre, cm.CM2_NOMBRE campaniaNombre, ti.CT_NOMBRE tipificacionNombre
    FROM dbo.CCO_INTERACCIONES i
    LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
    LEFT JOIN dbo.CCO_CAMPANIAS cm ON cm.CM2_ID = i.CI_CAMPANIA_ID
    LEFT JOIN dbo.CCO_TIPIFICACIONES ti ON ti.CT_ID = i.CI_TIPIFICACION_ID
    WHERE ${where.join(' AND ')}
    ORDER BY i.CI_FECHA_CIERRE DESC
  `);
  let filas = rs.recordset.map((r) => ({ ...r, origen: 'agyda' }));

  const ctx = req.query.campaniaId ? await ventasCampania.contextoVentas(pool, Number(req.query.campaniaId)) : null;
  if (ctx) {
    try {
      const deVentas = await _interaccionesDeVentas(pool, req, ctx, top);
      filas = [...filas, ...deVentas]
        .sort((a, b) => new Date(b.fechaCierre || 0).getTime() - new Date(a.fechaCierre || 0).getTime())
        .slice(0, top);
    } catch (e) {
      logger.error('operacionesController.interacciones → histórico Ventas', e);
    }
  }
  return filas;
}

// GET /api/operaciones/interacciones?texto=&agenteId=&tipificacionId=&tipificacion=&campaniaId=&desde=&hasta=
async function listInteracciones(req, res) {
  try {
    res.json({ success: true, data: await _buscarInteracciones(req, 300) });
  } catch (err) {
    logger.error('operacionesController.listInteracciones', err);
    res.status(500).json({ success: false, message: 'Error al buscar interacciones' });
  }
}

// GET /api/operaciones/campanias/:id/contexto-reportes — lo que los reportes
// de una campaña en la Suite necesitan saber de ella: si es de ventas (su
// campaña en Ventas y si sus grupos son solo de marcador) y sus
// tipificaciones. En un grupo solo de marcador las tipificaciones son los
// estatus de Ventas; si también atiende canales, las de AGYDA más esos.
async function getContextoReportesCampania(req, res) {
  try {
    const campaniaId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    const propias = (await pool.request().input('c', sql.Int, campaniaId).query(`
      SELECT DISTINCT LTRIM(RTRIM(CT_NOMBRE)) nombre FROM dbo.CCO_TIPIFICACIONES
      WHERE CT_CAMPANIA_ID = @c AND ISNULL(CT_ACTIVO, 1) = 1 ORDER BY nombre`)).recordset;
    let tipificaciones = propias.map((t) => ({ nombre: t.nombre, color: null, origen: 'agyda' }));
    // Agentes de la campaña: los de sus skills y los miembros (agentes) de
    // sus grupos — los de un grupo solo de marcador no entran a los skills.
    const agentes = (await pool.request().input('c', sql.Int, campaniaId).query(`
      SELECT u.NEUS_ID id, LTRIM(RTRIM(u.NEUS_NOMBRES)) nombre
      FROM NEUS_USUARIOS u
      WHERE u.NEUS_ACTIVO = 1 AND (
        u.NEUS_ID IN (SELECT ga.CGA_USUARIO_ID FROM CCO_GRUPO_AGENTES ga
                      JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
                      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID = @c)
        OR u.NEUS_ID IN (SELECT m.EQM_USUARIO_ID FROM CC_EQUIPO_MIEMBROS m
                         JOIN CC_EQUIPOS e ON e.EQ_ID = m.EQM_EQUIPO_ID AND e.EQ_ACTIVO = 1
                         WHERE m.EQM_ROL = 'agente'
                           AND (e.EQ_CAMPANIA_ID = @c OR EXISTS (SELECT 1 FROM CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID AND ec.EQC_CAMPANIA_ID = @c))))
      ORDER BY nombre`).catch(() => ({ recordset: [] }))).recordset;
    const ventas = await ventasCampania.contextoVentas(pool, campaniaId);
    if (ventas) {
      try {
        const estatus = await ventasCampania.estatusDeCampana(await ventasCampania.poolVentas(), ventas.campanaVentasId);
        const base = ventas.soloMarcador ? [] : tipificaciones;
        const n = ventasCampania.normalizar;
        tipificaciones = [
          ...base,
          ...estatus.filter((e) => !base.some((b) => n(b.nombre) === n(e.nombre))).map((e) => ({ ...e, origen: 'ventas' })),
        ];
      } catch (e) {
        ventas.error = `No se pudo leer la BD de Ventas: ${e.message}`;
      }
    }
    res.json({ success: true, data: { campaniaId, ventas, tipificaciones, agentes } });
  } catch (err) {
    logger.error('operacionesController.getContextoReportesCampania', err);
    res.status(500).json({ success: false, message: 'Error al leer la campaña' });
  }
}

// GET /api/operaciones/agentes-catalogo — todos los agentes para los
// selectores de la Suite: los activos y, aparte, los deshabilitados
// (NEUS_ACTIVO = 0), que siguen teniendo interacciones en el histórico.
async function listAgentesCatalogo(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT NEUS_ID id, LTRIM(RTRIM(NEUS_NOMBRES)) nombre, CAST(ISNULL(NEUS_ACTIVO, 0) AS bit) activo
      FROM NEUS_USUARIOS
      WHERE NULLIF(LTRIM(RTRIM(NEUS_NOMBRES)), '') IS NOT NULL
      ORDER BY NEUS_NOMBRES`);
    const filas = rs.recordset.map((u) => ({ id: u.id, nombre: u.nombre }));
    res.json({
      success: true,
      data: {
        activos: filas.filter((_, i) => rs.recordset[i].activo),
        deshabilitados: filas.filter((_, i) => !rs.recordset[i].activo),
      },
    });
  } catch (err) {
    logger.error('operacionesController.listAgentesCatalogo', err);
    res.status(500).json({ success: false, message: 'Error al listar los agentes' });
  }
}

// GET /api/operaciones/interacciones/excel — mismo filtro de arriba, en .xlsx
async function exportarInteracciones(req, res) {
  try {
    const filas = await _buscarInteracciones(req, 2000);

    const hoja = filas.map((r) => ({
      Cliente: r.clienteNombre || '', Teléfono: r.clienteTelefono || '', Campaña: r.campaniaNombre || '',
      Canal: r.canalNombre || '', Agente: r.agenteNombre || '', Tipificación: r.tipificacionNombre || '',
      Cierre: r.fechaCierre ? new Date(r.fechaCierre).toLocaleString('es-MX') : '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja.length ? hoja : [{ Cliente: '' }]), 'Interacciones');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="interacciones_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('operacionesController.exportarInteracciones', err);
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
        WHERE neus_id IN (${agenteIds.join(',')}) AND fecha_fin IS NULL AND status_id IN ${SQL_PAUSAS_CC}
      `);
      agentesEnPausa = pausasActivasRs.recordset[0].total;

      const promedioRs = await pool.request().query(`
        SELECT AVG(minutos * 1.0) as promedio FROM (
          SELECT neus_id, SUM(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE()))) as minutos
          FROM USUARIO_TIEMPOS
          WHERE neus_id IN (${agenteIds.join(',')}) AND status_id IN ${SQL_PAUSAS_CC} AND CAST(fecha_inicio AS date) = CAST(GETDATE() AS date)
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

/* ── Ejecutar un RDL dentro de AGYDA (services/rdlEjecutorService.js) ──
   Candados: acceso al reporte, que lo haya subido un administrador (AD/TI:
   su consulta se considera confiable) y todo dentro de una transacción que
   se revierte. */
async function _rdlEjecutable(req, res) {
  const pool = await databaseService.getPool(req.user?.empresa);
  await ensureRdlSchema(pool);
  const rs = await pool.request().input('id', sql.Int, req.params.id).query(`
    SELECT r.*, u.NEUS_TIPOUSUARIO SUBIO_TIPO FROM CC_RDL_REPORTES r
    LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = r.RDL_SUBIDO_POR WHERE r.RDL_ID = @id`);
  const row = rs.recordset[0];
  if (!row) { res.status(404).json({ success: false, message: 'Reporte no encontrado' }); return null; }
  if (!_puedeVerRdl(req.user, row)) { res.status(403).json({ success: false, message: 'No tienes acceso a este reporte' }); return null; }
  if (!['AD', 'TI'].includes(String(row.SUBIO_TIPO || '').toUpperCase())) {
    res.status(403).json({ success: false, message: 'Este RDL no lo subió un administrador: pide a TI que lo suba para poder ejecutarlo' });
    return null;
  }
  let metadata = null;
  try { metadata = row.RDL_METADATA ? JSON.parse(row.RDL_METADATA) : null; } catch (_) { metadata = null; }
  if (!metadata?.dataSets?.length) { res.status(400).json({ success: false, message: 'El reporte no tiene datasets para ejecutar' }); return null; }
  const extras = rdlEjecutor.extrasDeReporte(metadata, rdlEjecutor.rutaDe(RDL_DIR, row.RDL_ARCHIVO));
  // Dataset de la tabla principal (el primero que alimenta una región).
  const principal = (metadata.dataRegions || []).find((r) => r.dataSetName)?.dataSetName || metadata.dataSets[0].name;
  return { pool, row, metadata, extras, principal };
}

// GET /api/operaciones/suite-reportes/rdl/:id/opciones — opciones de cada parámetro.
async function opcionesRdl(req, res) {
  try {
    const r = await _rdlEjecutable(req, res); if (!r) return;
    const opciones = await rdlEjecutor.opcionesDeParametros(r.pool, r.metadata, r.extras);
    res.json({ success: true, data: { opciones, dataSet: r.principal, conArchivo: !!r.extras } });
  } catch (err) {
    logger.error('operacionesController.opcionesRdl', err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Error al leer las opciones del reporte' });
  }
}

// POST /api/operaciones/suite-reportes/rdl/:id/ejecutar { parametros, dataSet? }
async function ejecutarRdl(req, res) {
  try {
    const r = await _rdlEjecutable(req, res); if (!r) return;
    const dataSet = req.body?.dataSet || r.principal;
    const parametros = req.body?.parametros && typeof req.body.parametros === 'object' ? req.body.parametros : {};
    const inicio = Date.now();
    const out = await rdlEjecutor.ejecutarDataSet(r.pool, r.metadata, r.extras, dataSet, parametros);
    await logAudit(r.pool, {
      userId: req.user?.id, userName: req.user?.nombre || null, modulo: 'suite-reportes', accion: 'ejecutar-rdl',
      entidadId: r.row.RDL_ID, detalle: { reporte: r.row.RDL_NOMBRE, dataSet, parametros, filas: out.total }, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, data: { ...out, dataSet, ms: Date.now() - inicio } });
  } catch (err) {
    logger.error('operacionesController.ejecutarRdl', err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Error al ejecutar el reporte' });
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

/* Alcance del constructor según quién consulta (Configuración → Grupos):
   - administradores (AD/TI y super admin): todos los datos y todos los grupos;
   - supervisores de uno o más grupos activos: solo lo de sus grupos;
   - cualquier otro (agentes incluidos): sin acceso.
   Devuelve { todos, grupos: [{ id, nombre, modalidad }] } o null (sin acceso). */
async function _alcanceBuilder(req, pool) {
  const tipo = (req.user?.tipoUsuario || '').toString().toUpperCase();
  const esAdmin = tipo === 'AD' || tipo === 'TI' || esSuperAdminFijo(req);
  let grupos = [];
  try {
    const rs = await pool.request()
      .input('uid', sql.Int, parseInt(req.user?.id, 10) || 0)
      .input('todos', sql.Bit, esAdmin ? 1 : 0)
      .query(`
        SELECT e.EQ_ID AS id, e.EQ_NOMBRE AS nombre, ISNULL(e.EQ_MODALIDAD, 'omnicanal') AS modalidad
        FROM dbo.CC_EQUIPOS e
        WHERE e.EQ_ACTIVO = 1
          AND (@todos = 1 OR EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_MIEMBROS m
                 WHERE m.EQM_EQUIPO_ID = e.EQ_ID AND m.EQM_USUARIO_ID = @uid AND m.EQM_ROL = 'supervisor'))
        ORDER BY e.EQ_NOMBRE`);
    grupos = rs.recordset;
  } catch (e) {
    // Empresa sin el módulo de grupos (tablas CC_EQUIPOS aún no creadas).
    logger.warn('operacionesController._alcanceBuilder', e && e.message);
  }
  if (esAdmin) return { todos: true, grupos };
  if (!grupos.length) return null;
  return { todos: false, grupos };
}

const SIN_ACCESO_BUILDER = 'El constructor de reportes es solo para administradores y supervisores de un grupo.';
const CATALOGOS_SIN_CONSTRUCTOR = new Set(['agente', 'tipificacion']);

/* Alcance efectivo de una definición: si el reporte es de un grupo (def.grupoId)
   se limita a ese grupo — y un supervisor solo puede pedir los suyos. */
function _alcanceDeDefinicion(alcance, def) {
  const gid = parseInt(def?.grupoId, 10);
  if (Number.isInteger(gid)) {
    if (!alcance.todos && !alcance.grupos.some((g) => g.id === gid)) return false;
    return { grupoIds: [gid] };
  }
  return alcance.todos ? null : { grupoIds: alcance.grupos.map((g) => g.id) };
}

// GET /api/operaciones/suite-reportes/builder/catalogo — orígenes, campos y filtros disponibles.
async function getBuilderCatalogo(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    res.json({
      success: true,
      data: {
        ...reportBuilderCatalog.catalogoPublico(),
        acceso: alcance.todos ? 'todos' : 'supervisor',
        grupos: alcance.grupos,
        presetsFecha: reportBuilderRunner.PRESETS_FECHA,
      },
    });
  } catch (err) {
    logger.error('operacionesController.getBuilderCatalogo', err);
    res.status(500).json({ success: false, message: 'Error al obtener el catálogo del constructor' });
  }
}

// GET /api/operaciones/suite-reportes/builder/catalogo-filtro/:catalogo — opciones de un selector.
// ?grupoId= acota las opciones a un grupo (el supervisor siempre queda acotado a los suyos).
async function getBuilderCatalogoFiltro(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) {
      // El buscador de Interacciones de la Suite usa estos dos selectores y no
      // depende del constructor: se siguen sirviendo como antes.
      if (!CATALOGOS_SIN_CONSTRUCTOR.has(req.params.catalogo)) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
      return res.json({ success: true, data: await reportBuilderRunner.catalogoFiltro(pool, req.params.catalogo) });
    }
    const efectivo = _alcanceDeDefinicion(alcance, { grupoId: req.query.grupoId });
    if (efectivo === false) return res.status(403).json({ success: false, message: 'No supervisas ese grupo' });
    const data = await reportBuilderRunner.catalogoFiltro(pool, req.params.catalogo, { grupoIds: efectivo ? efectivo.grupoIds : null });
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
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    const definicion = req.body?.definicion ?? req.body;
    const efectivo = _alcanceDeDefinicion(alcance, definicion);
    if (efectivo === false) return res.status(403).json({ success: false, message: 'No supervisas el grupo de este reporte' });
    const resultado = await reportBuilderRunner.ejecutar(pool, definicion, { alcance: efectivo });
    res.json({ success: true, data: resultado });
  } catch (err) {
    if (err.code === 'REPORT_BUILDER_INVALID') return res.status(400).json({ success: false, message: err.message });
    logger.error('operacionesController.ejecutarBuilder', err);
    res.status(500).json({ success: false, message: 'Error al ejecutar el reporte' });
  }
}

// GET /api/operaciones/suite-reportes/builder/plantillas — plantillas del sistema.
async function listPlantillasBuilder(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    res.json({ success: true, data: reportBuilderPlantillas.listarPlantillas() });
  } catch (err) {
    logger.error('operacionesController.listPlantillasBuilder', err);
    res.status(500).json({ success: false, message: 'Error al obtener las plantillas' });
  }
}

// POST /api/operaciones/suite-reportes/builder/adaptar — copia una definición
// (plantilla u otro reporte) y la ajusta al grupo elegido. No guarda nada.
async function adaptarDefinicionBuilder(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    const { definicion } = req.body || {};
    const gid = parseInt(req.body?.grupoId, 10);
    let grupo = null;
    if (Number.isInteger(gid)) {
      grupo = alcance.grupos.find((g) => g.id === gid) || null;
      if (!grupo) return res.status(403).json({ success: false, message: 'No supervisas ese grupo' });
    }
    const r = reportBuilderPlantillas.adaptarAGrupo(definicion, grupo);
    if (r.aplica) reportBuilderRunner.compilar(r.definicion); // valida que siga siendo ejecutable
    res.json({ success: true, data: r });
  } catch (err) {
    if (err.code === 'REPORT_BUILDER_INVALID') return res.status(400).json({ success: false, message: err.message });
    logger.error('operacionesController.adaptarDefinicionBuilder', err);
    res.status(500).json({ success: false, message: 'Error al adaptar el reporte' });
  }
}

// GET /api/operaciones/suite-reportes/builder/reportes — reportes guardados visibles.
async function listReportesConstruidos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureReportBuilderSchema(pool);
    // Sin alcance en el constructor (agentes, etc.) no se listan: al abrirlos no podrían correrlos.
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.json({ success: true, data: [] });
    const rs = await pool.request().query(`SELECT * FROM CC_REPORTES_CONSTRUIDOS ORDER BY RC_CARPETA, RC_NOMBRE`);
    const visibles = rs.recordset
      .filter((r) => _puedeVerRdl(req.user, { RDL_ROLES: r.RC_ROLES, RDL_USUARIOS: r.RC_USUARIOS }))
      .map(_mapReporteConstruido)
      .filter((r) => _alcanceDeDefinicion(alcance, r.definicion) !== false);
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
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    if (_alcanceDeDefinicion(alcance, definicion) === false) return res.status(403).json({ success: false, message: 'No supervisas ese grupo' });
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

    // Admin edita cualquiera; un supervisor solo los que él creó.
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    if (!alcance.todos && Number(row.RC_CREADO_POR) !== Number(req.user?.id)) {
      return res.status(403).json({ success: false, message: 'Solo puedes editar los reportes que tú creaste' });
    }

    const { nombre, descripcion, definicion } = req.body || {};
    if (definicion !== undefined) {
      reportBuilderRunner.compilar(definicion);
      if (_alcanceDeDefinicion(alcance, definicion) === false) return res.status(403).json({ success: false, message: 'No supervisas ese grupo' });
    }

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
    const alcance = await _alcanceBuilder(req, pool);
    if (!alcance) return res.status(403).json({ success: false, message: SIN_ACCESO_BUILDER });
    if (!alcance.todos) {
      const rs = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT RC_CREADO_POR FROM CC_REPORTES_CONSTRUIDOS WHERE RC_ID = @id');
      if (rs.recordset.length && Number(rs.recordset[0].RC_CREADO_POR) !== Number(req.user?.id)) {
        return res.status(403).json({ success: false, message: 'Solo puedes eliminar los reportes que tú creaste' });
      }
    }
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM CC_REPORTES_CONSTRUIDOS WHERE RC_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('operacionesController.eliminarReporteConstruido', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el reporte' });
  }
}

// Crea las tablas de la Suite (carpetas + reportes construidos) si faltan.
// La usa el asistente "Crear grupo" antes de crear los reportes del grupo.
async function asegurarTablasSuite(pool) {
  await ensureRdlSchema(pool);
  await ensureReportBuilderSchema(pool);
}

module.exports = {
  asegurarTablasSuite,
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
  getComparador,
  getHistoricoSla,
  getTiemposAgente,
  getMisAgentes,
  getKpis,
  listMetas,
  crearMeta,
  eliminarMeta,
  getReporteDiario,
  getReportePostulantes,
  exportarReportePostulantes,
  getReporteEjecutivoReclutamiento,
  getReporteEjecutivoVentas,
  getVentasPorAgente,
  getPanoramaCampanias,
  getContextoReportesCampania,
  listAgentesCatalogo,
  listInteracciones,
  exportarInteracciones,
  getMiResumenAsesor,
  getHistorialAsignaciones,
  listRdl,
  opcionesRdl,
  ejecutarRdl,
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
  listPlantillasBuilder,
  adaptarDefinicionBuilder,
  listReportesConstruidos,
  guardarReporteConstruido,
  actualizarReporteConstruido,
  eliminarReporteConstruido,
};
