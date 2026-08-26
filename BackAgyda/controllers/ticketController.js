const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService');
const { normalizeArea } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');
const { EVIDENCIA_DIR } = require('../middleware/evidenceUpload');
const { logAudit } = require('../services/auditService');

/* ── SLA: reglas configurables (por prioridad + área opcional) evaluadas contra los
   tiempos que este controller ya calcula (tiempoAtencionMinutos / tiempoPrimeraRespuestaMinutos).
   No se guarda nada nuevo por ticket — el cumplimiento se calcula al vuelo. ── */

async function cargarReglasSlaActivas(pool) {
  const rs = await pool.request().query(`
    SELECT TSR_ID as id, TSR_PRIORIDAD as prioridad, TSR_AREA as area,
           TSR_MIN_PRIMERA_RESPUESTA as minPrimeraRespuesta, TSR_MIN_RESOLUCION as minResolucion
    FROM TICKETS_SLA_REGLAS WHERE TSR_ACTIVA = 1
  `);
  return rs.recordset;
}

// Busca la regla más específica: prioridad+área exacta, si no existe cae a prioridad
// sin área (regla general).
function buscarReglaSla(reglas, prioridad, area) {
  const prio = (prioridad || '').toString().toUpperCase();
  const ar = (area || '').toString().toUpperCase();
  return reglas.find((r) => r.prioridad === prio && (r.area || '').toUpperCase() === ar)
    || reglas.find((r) => r.prioridad === prio && !r.area)
    || null;
}

// Añade a cada ticket: sla (regla aplicada o null), slaRespuesta y slaResolucion
// ('cumplido' | 'incumplido' | 'en_riesgo' | 'en_tiempo' | null si no hay regla).
function enriquecerConSla(tickets, reglas) {
  const ahora = Date.now();
  return tickets.map((t) => {
    const regla = buscarReglaSla(reglas, t.PRIORIDAD ?? t.prioridad, t.AREA ?? t.area);
    if (!regla) return { ...t, slaRespuesta: null, slaResolucion: null, slaReglaId: null };

    const creacion = new Date(t.FECHA_CREACION ?? t.fechaCreacion).getTime();

    let slaRespuesta = null;
    const primeraRespuesta = t.FECHA_PRIMERA_RESPUESTA ?? t.fechaPrimeraRespuesta;
    if (primeraRespuesta) {
      const minutos = Math.round((new Date(primeraRespuesta).getTime() - creacion) / 60000);
      slaRespuesta = minutos <= regla.minPrimeraRespuesta ? 'cumplido' : 'incumplido';
    } else {
      const minutosTranscurridos = Math.round((ahora - creacion) / 60000);
      if (minutosTranscurridos > regla.minPrimeraRespuesta) slaRespuesta = 'incumplido';
      else if (minutosTranscurridos >= regla.minPrimeraRespuesta * 0.85) slaRespuesta = 'en_riesgo';
      else slaRespuesta = 'en_tiempo';
    }

    let slaResolucion = null;
    const cierre = t.FECHA_CIERRE ?? t.fechaCierre;
    if (cierre) {
      const minutos = Math.round((new Date(cierre).getTime() - creacion) / 60000);
      slaResolucion = minutos <= regla.minResolucion ? 'cumplido' : 'incumplido';
    } else {
      const minutosTranscurridos = Math.round((ahora - creacion) / 60000);
      if (minutosTranscurridos > regla.minResolucion) slaResolucion = 'incumplido';
      else if (minutosTranscurridos >= regla.minResolucion * 0.85) slaResolucion = 'en_riesgo';
      else slaResolucion = 'en_tiempo';
    }

    return { ...t, slaRespuesta, slaResolucion, slaReglaId: regla.id };
  });
}

// GET /api/tickets/sla/reglas
exports.listReglasSla = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT TSR_ID as id, TSR_PRIORIDAD as prioridad, TSR_AREA as area,
             TSR_MIN_PRIMERA_RESPUESTA as minPrimeraRespuesta, TSR_MIN_RESOLUCION as minResolucion,
             TSR_ACTIVA as activa
      FROM TICKETS_SLA_REGLAS ORDER BY TSR_PRIORIDAD, TSR_AREA
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando reglas SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tickets/sla/reglas
exports.crearReglaSla = async (req, res) => {
  try {
    const { prioridad, area, minPrimeraRespuesta, minResolucion } = req.body;
    if (!prioridad || !minPrimeraRespuesta || !minResolucion) {
      return res.status(400).json({ success: false, message: 'Prioridad, minutos de primera respuesta y de resolución son requeridos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('prioridad', sql.NVarChar, prioridad.toString().toUpperCase())
      .input('area', sql.NVarChar, area ? area.toString().toUpperCase() : null)
      .input('minRespuesta', sql.Int, minPrimeraRespuesta)
      .input('minResolucion', sql.Int, minResolucion)
      .input('creadoPor', sql.SmallInt, req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null)
      .query(`
        INSERT INTO TICKETS_SLA_REGLAS (TSR_PRIORIDAD, TSR_AREA, TSR_MIN_PRIMERA_RESPUESTA, TSR_MIN_RESOLUCION, TSR_CREADO_POR)
        VALUES (@prioridad, @area, @minRespuesta, @minResolucion, @creadoPor)
      `);
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('Error creando regla SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// PATCH /api/tickets/sla/reglas/:id
exports.actualizarReglaSla = async (req, res) => {
  try {
    const { id } = req.params;
    const { prioridad, area, minPrimeraRespuesta, minResolucion, activa } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('prioridad', sql.NVarChar, prioridad ? prioridad.toString().toUpperCase() : null)
      .input('area', sql.NVarChar, area ? area.toString().toUpperCase() : null)
      .input('minRespuesta', sql.Int, minPrimeraRespuesta)
      .input('minResolucion', sql.Int, minResolucion)
      .input('activa', sql.Bit, activa ? 1 : 0)
      .query(`
        UPDATE TICKETS_SLA_REGLAS
        SET TSR_PRIORIDAD = @prioridad, TSR_AREA = @area, TSR_MIN_PRIMERA_RESPUESTA = @minRespuesta,
            TSR_MIN_RESOLUCION = @minResolucion, TSR_ACTIVA = @activa
        WHERE TSR_ID = @id
      `);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando regla SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/tickets/sla/reglas/:id
exports.eliminarReglaSla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM TICKETS_SLA_REGLAS WHERE TSR_ID = @id');
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando regla SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/tickets/sla/reporte — % de cumplimiento general y por área/prioridad,
// sobre tickets ya cerrados (SLA de resolución final, no en tiempo real).
exports.getReporteSla = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const reglas = await cargarReglasSlaActivas(pool);
    if (reglas.length === 0) return res.json({ success: true, data: { totalEvaluados: 0, cumplidos: 0, pctCumplimiento: null, porArea: [], porPrioridad: [] } });

    const rs = await pool.request().query(`
      SELECT TICKET_ID as id, AREA as area, PRIORIDAD as prioridad, FECHA_CREACION as fechaCreacion, FECHA_CIERRE as fechaCierre
      FROM TICKETS WHERE FECHA_CIERRE IS NOT NULL
    `);
    const enriquecidos = enriquecerConSla(rs.recordset, reglas).filter((t) => t.slaResolucion !== null);

    const cumplidos = enriquecidos.filter((t) => t.slaResolucion === 'cumplido').length;
    const totalEvaluados = enriquecidos.length;

    const agrupar = (campo) => {
      const mapa = new Map();
      for (const t of enriquecidos) {
        const key = t[campo];
        if (!mapa.has(key)) mapa.set(key, { key, total: 0, cumplidos: 0 });
        const entry = mapa.get(key);
        entry.total += 1;
        if (t.slaResolucion === 'cumplido') entry.cumplidos += 1;
      }
      return [...mapa.values()].map((e) => ({ ...e, pctCumplimiento: Math.round((e.cumplidos / e.total) * 1000) / 10 }));
    };

    res.json({
      success: true,
      data: {
        totalEvaluados,
        cumplidos,
        pctCumplimiento: totalEvaluados > 0 ? Math.round((cumplidos / totalEvaluados) * 1000) / 10 : null,
        porArea: agrupar('area'),
        porPrioridad: agrupar('prioridad'),
      },
    });
  } catch (e) {
    console.error('Error generando reporte SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Función auxiliar para autoasignar ticket — asignación aleatoria entre agentes disponibles del área
async function autoAssignTicket(pool, area) {
  const a = normalizeArea(area);

  // Obtener todos los agentes activos y disponibles del área
  const rs = await pool.request()
    .input('area', sql.NVarChar, a)
    .query(`
      SELECT u.NEUS_ID AS userId
      FROM NEUS_USUARIOS u
      INNER JOIN TI_STAFF_STATUS s ON s.USER_ID = u.NEUS_ID
      WHERE u.NEUS_ACTIVO = 1
        AND s.DISPONIBLE = 1
        AND s.AREA = @area
      ORDER BY NEWID()
    `);

  if (rs.recordset.length === 0) return null;

  // NEWID() ya aleatoriza en SQL, tomamos el primero
  return rs.recordset[0].userId;
}

exports.getTickets = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const usuarioId = Number(req.headers['usuarioid'] || req.query.usuarioId || 0) || null;
    const clienteId = Number(req.headers['clienteid'] || req.query.clienteId || 0) || null;
    const areaParam = req.query.area ? normalizeArea(req.query.area) : null;
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const reglasSla = await cargarReglasSlaActivas(pool);

    // If a clienteId is provided, return only tickets for that solicitante
    if (clienteId) {
      const rs = await pool.request()
        .input('clienteId', sql.Int, clienteId)
        .query(`
          SELECT TOP 200
            t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.ESTADO,
            t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
            su.NEUS_NOMBRES AS SOLICITANTE_NOMBRE,
            au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
            s.RATING as rating,
            CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
          FROM TICKETS t
          LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
          LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
          LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
          WHERE t.SOLICITANTE_ID = @clienteId
          ORDER BY t.TICKET_ID DESC`);
      return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla) });
    }

    // Admins ven todo
    if (['AD','ADMIN','ADM'].includes(tipoUsuario)) {
      const rs = await pool.request().query(`
        SELECT TOP 200
          t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.ESTADO,
          t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
          su.NEUS_NOMBRES AS SOLICITANTE_NOMBRE,
          au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
          s.RATING as rating,
          CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
        FROM TICKETS t
        LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
        LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
        LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
        ORDER BY t.TICKET_ID DESC`);
      return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla) });
    }

    // TI/ST: ver sólo asignados al usuario
    if (['TI','ST'].includes(tipoUsuario)) {
      if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });

      const rs = await pool.request()
        .input('uid', sql.Int, usuarioId)
        .query(`
          SELECT TOP 200
            t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.ESTADO,
            t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
            su.NEUS_NOMBRES AS SOLICITANTE_NOMBRE,
            au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
            s.RATING as rating,
            CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
          FROM TICKETS t
          LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
          LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
          LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
          WHERE t.ASIGNADO_A = @uid
             OR EXISTS (
               SELECT 1 FROM TICKET_HISTORIAL h
               WHERE h.TICKET_ID = t.TICKET_ID
                 AND h.TIPO IN ('asignado','transferido','transferido_por','participante')
                 AND h.USER_ID = @uid
             )
          ORDER BY t.TICKET_ID DESC`);
      return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla) });
    }

    // Resto: sólo sus propios tickets
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });

    const rs = await pool.request().input('uid', sql.Int, usuarioId)
      .query(`SELECT TOP 200 t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.ESTADO,
                     t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
                     su.NEUS_NOMBRES AS SOLICITANTE_NOMBRE,
                     au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
                     s.RATING as rating,
                     CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
              FROM TICKETS t
              LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
              LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
              LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
              WHERE t.SOLICITANTE_ID=@uid ORDER BY t.TICKET_ID DESC`);

    return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla) });
  } catch (e) {
    console.error('Error listando tickets:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    
    const header = await pool.request().input('tid', sql.Int, id).query(`
      SELECT 
        t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.DESCRIPCION, t.ESTADO,
        t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
        au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
        CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos,
        CASE WHEN t.FECHA_PRIMERA_RESPUESTA IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_PRIMERA_RESPUESTA) ELSE NULL END AS tiempoPrimeraRespuestaMinutos
      FROM TICKETS t
      LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
      WHERE t.TICKET_ID=@tid`);
      
    if (header.recordset.length === 0) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

    const reglasSla = await cargarReglasSlaActivas(pool);
    const [ticketConSla] = enriquecerConSla(header.recordset, reglasSla);

    const comentarios = await pool.request().input('tid', sql.Int, id).query(`
      SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
             c.CONTENIDO as contenido, c.CREATED_AT as createdAt
      FROM TICKET_COMENTARIOS c
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
      WHERE c.TICKET_ID=@tid
      ORDER BY c.COM_ID ASC`);

    const hist = await pool.request().input('tid', sql.Int, id).query(`
      SELECT HIST_ID as id, TIPO as tipo, DETALLE as detalle, USER_ID as userId, CREATED_AT as createdAt
      FROM TICKET_HISTORIAL WHERE TICKET_ID=@tid ORDER BY HIST_ID ASC`);

    const sat = await pool.request().input('tid', sql.Int, id).query(`
      SELECT TICKET_ID as ticketId, RATING, COMENTARIO, SUBMIT_AT FROM TICKET_SATISFACCION WHERE TICKET_ID=@tid`);

    return res.json({
      success: true,
      data: {
        ...ticketConSla,
        comentarios: comentarios.recordset,
        historial: hist.recordset,
        satisfaccion: sat.recordset[0] || null
      }
    });
  } catch (e) {
    console.error('Error detalle ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const solicitanteId = req.body.solicitanteId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    let { area, titulo, descripcion, prioridad, categoria, asignadoA } = req.body;
    console.warn(`[createTicket] solicitante=${solicitanteId} area=${area} tipo=${tipoUsuario}`);

    area = normalizeArea(area || 'TI');
    const tituloTrim = (titulo ?? '').toString().trim();
    
    if (!solicitanteId || !tituloTrim) {
      const missing = [
        !solicitanteId ? 'solicitanteId' : null,
        !tituloTrim ? 'titulo' : null,
      ].filter(Boolean);
      return res.status(400).json({ success: false, message: `Campos faltantes: ${missing.join(', ')}` });
    }
    
    if (!['CC','ADM','AD','ADMIN'].includes(tipoUsuario)) {
      console.warn('Creación de ticket sin rol CC/ADM/AD explícito. Cabecera x-user-tipo:', tipoUsuario);
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');
    
    const a = area;
    const prio = (prioridad || 'NORMAL').toString().toUpperCase();

    const ins = await pool.request()
      .input('sol', sql.Int, solicitanteId)
      .input('area', sql.NVarChar, a)
      .input('prio', sql.NVarChar, prio)
      .input('tit', sql.NVarChar, tituloTrim)
      .input('desc', sql.NVarChar, descripcion || null)
      .query(`INSERT INTO TICKETS (SOLICITANTE_ID, AREA, PRIORIDAD, TITULO, DESCRIPCION, ESTADO)
              VALUES (@sol, @area, @prio, @tit, @desc, 'abierto'); SELECT SCOPE_IDENTITY() as id;`);
              
    const ticketId = Number(ins.recordset[0].id);

    // Historial: creado
    await pool.request()
      .input('tid', sql.Int, ticketId)
      .input('uid', sql.Int, solicitanteId)
      .input('det', sql.NVarChar, categoria ? `categoria:${categoria}` : null)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'creado', @det, @uid)`);

    // Si se provee un asignado específico, validar que sea uno del pool TI permitido
    // IDs reales: Eliud=10 (TI_0103), Inés=64 (TI_0110), Alan=117 (TI_1005)
    let finalAsignado = null;
    if (asignadoA) {
      const aid = Number(asignadoA);
      const validIds = [10, 64, 117];
      if (validIds.includes(aid)) {
        finalAsignado = aid;
      }
    }
    
    // Si no hay asignación manual, autoasignar
    if (!finalAsignado) {
      finalAsignado = await autoAssignTicket(pool, a);
    }
    
    if (finalAsignado) {
      await pool.request()
        .input('tid', sql.Int, ticketId)
        .input('asid', sql.Int, finalAsignado)
        .query(`UPDATE TICKETS SET ASIGNADO_A=@asid, ESTADO='asignado', FECHA_ASIGNACION=GETDATE() WHERE TICKET_ID=@tid`);
        
      await pool.request()
        .input('tid', sql.Int, ticketId)
        .input('uid', sql.Int, finalAsignado)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'asignado', @uid)`);
        
      await pool.request().input('uid', sql.Int, finalAsignado).query(`UPDATE TI_STAFF_STATUS SET LAST_ASSIGNED_AT=GETDATE() WHERE USER_ID=@uid`);
      
      // Notificación a asignado (tabla antigua de tickets)
      await pool.request()
        .input('uid', sql.Int, finalAsignado)
        .input('tid', sql.Int, ticketId)
        .input('msg', sql.NVarChar, `Nuevo ticket #${ticketId} asignado`)
        .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_nuevo', @tid, @msg)`);
      // Emitir notificación en tiempo real y persistir en tabla moderna
      try {
        await notificationService.createNotification({
          usuarioId: finalAsignado,
          mensaje: `Nuevo ticket #${ticketId} asignado`,
          tipo: 'ticket_nuevo',
          dataExtra: { ticketId },
          tenantKey: req.user?.empresa,
        });
      } catch (e) {
        console.warn('⚠️ Error creando notificacion via notificationService:', e?.message || e);
      }
    }

    // 🔔 Notificar al solicitante que se ha creado su ticket
    try {
      await notificationService.createNotification({
        usuarioId: solicitanteId,
        mensaje: `Tu ticket #${ticketId} "${tituloTrim}" ha sido creado`,
        tipo: 'ticket',
        dataExtra: {
          ticketId: ticketId,
          action: 'ver_ticket'
        },
        tenantKey: req.user?.empresa,
      });
    } catch (e) {
      console.warn('⚠️ Error enviando notificación de ticket creado:', e?.message || e);
    }

    // 🔔 Notificar al líder del área correspondiente
    try {
      // Obtener el nombre del solicitante
      const rsSolicitante = await pool.request()
        .input('uid', sql.Int, solicitanteId)
        .query(`SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);
      
      const nombreSolicitante = rsSolicitante.recordset.length > 0 
        ? rsSolicitante.recordset[0].NEUS_NOMBRES 
        : 'Usuario';

      // Determinar el líder según el área
      let liderAreaId = null;
      if (a === 'ST') {
        liderAreaId = 11; // ID del líder del área ST (Soporte Técnico)
      } else if (a === 'TI' || a === 'DESARROLLO') {
        liderAreaId = 7; // ID del líder del área TI/Desarrollo
      }

      // Si hay un líder definido y no es el mismo solicitante, enviar notificación
      if (liderAreaId && liderAreaId !== solicitanteId) {
        await notificationService.createNotification({
          usuarioId: liderAreaId,
          mensaje: `Nuevo ticket #${ticketId} de ${nombreSolicitante} en área ${a}: "${tituloTrim}"`,
          tipo: 'ticket',
          dataExtra: {
            ticketId: ticketId,
            action: 'ver_ticket'
          },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (e) {
      console.warn('⚠️ Error enviando notificación al líder de área:', e?.message || e);
    }

    const header = await pool.request().input('tid', sql.Int, ticketId).query(`
      SELECT TICKET_ID as id, SOLICITANTE_ID as solicitanteId, AREA as area, PRIORIDAD as prioridad, TITULO as titulo,
             DESCRIPCION as descripcion, ESTADO as estado, FECHA_CREACION as fechaCreacion, FECHA_ASIGNACION as fechaAsignacion,
             FECHA_PRIMERA_RESPUESTA as fechaPrimeraRespuesta, FECHA_CIERRE as fechaCierre, ASIGNADO_A as asignadoA
      FROM TICKETS WHERE TICKET_ID=@tid`);

    // Emitir evento en tiempo real sobre creación de ticket
    try {
      const io = socketService.getIO(req.user?.empresa);
      const ticketData = header.recordset[0];
      if (ticketData) {
        // Emitir al room del ticket y a los usuarios implicados
        io.to(`ticket:${ticketId}`).emit('ticket:created', ticketData);
        // Usar los aliases devueltos por la consulta (asignadoA, solicitanteId)
        if (ticketData.asignadoA) io.to(`user:${ticketData.asignadoA}`).emit('ticket:created', ticketData);
        if (ticketData.solicitanteId) io.to(`user:${ticketData.solicitanteId}`).emit('ticket:created', ticketData);
      }
    } catch (e) {
      // No bloquear la respuesta si socket no está disponible
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'crear', entidadId: String(ticketId||''), detalle:{ titulo: tituloTrim, area: a }, ip:req.ip });
    return res.status(201).json({ success: true, data: header.recordset[0] });
  } catch (e) {
    console.error('Error creando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ... continuaré con los métodos restantes del controlador de tickets en la siguiente respuesta

exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;
    const { titulo, descripcion, prioridad } = req.body;
    
    if (!actorId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID FROM TICKETS WHERE TICKET_ID=@tid`);
    
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    
    const ownerId = Number(rs.recordset[0].SOLICITANTE_ID);
    if (ownerId !== actorId) return res.status(403).json({ success: false, message: 'Solo el solicitante puede editar el ticket' });
    
    await pool.request()
      .input('tid', sql.Int, id)
      .input('tit', sql.NVarChar, (titulo ?? '').toString().trim())
      .input('desc', sql.NVarChar, (descripcion ?? '').toString().trim())
      .input('pri', sql.NVarChar, (prioridad ?? '').toString().toUpperCase())
      .query(`UPDATE TICKETS SET TITULO=CASE WHEN @tit<>'' THEN @tit ELSE TITULO END,
                               DESCRIPCION=CASE WHEN @desc<>'' THEN @desc ELSE DESCRIPCION END,
                               PRIORIDAD=CASE WHEN @pri<>'' THEN @pri ELSE PRIORIDAD END
                     WHERE TICKET_ID=@tid`);
                     
    await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, 'editado').input('uid', sql.Int, actorId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'editado', @det, @uid)`);

    // Emitir actualización en tiempo real
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: id, tipo: 'editado' });
      // También notificar al propietario y al asignado si existen
      const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
      if (rsTicket.recordset.length) {
        const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
        const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
        if (solicitanteId) io.to(`user:${solicitanteId}`).emit('ticket:updated', { ticketId: id, tipo: 'editado' });
        if (asignadoA) io.to(`user:${asignadoA}`).emit('ticket:updated', { ticketId: id, tipo: 'editado' });
      }
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'editar', entidadId: req.params.id, detalle:{ titulo }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error editando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    
    // Permitir que TI y AD eliminen tickets
    if (!['TI','AD'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'Solo TI o AD pueden eliminar tickets' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKET_COMENTARIOS WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKET_HISTORIAL WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKET_SATISFACCION WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKETS WHERE TICKET_ID=@tid`);

    // Emitir evento en tiempo real: ticket eliminado
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:deleted', { ticketId: id });
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'eliminar', entidadId: req.params.id, detalle:null, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getComentarios = async (req, res) => {
  try {
    const { id } = req.params;
    const sinceId = req.query.sinceId ? Number(req.query.sinceId) : null;
    
    const pool = await databaseService.getPool(req.user?.empresa);
    let query = `
      SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
             c.CONTENIDO as contenido, c.CREATED_AT as createdAt
      FROM TICKET_COMENTARIOS c
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
      WHERE c.TICKET_ID=@tid`;
      
    if (sinceId && sinceId > 0) {
      query += ' AND COM_ID > @sid';
    }
    
    query += ' ORDER BY COM_ID ASC';
    const request = pool.request().input('tid', sql.Int, id);
    
    if (sinceId && sinceId > 0) request.input('sid', sql.Int, sinceId);
    const rs = await request.query(query);
    
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando comentarios:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    const contenido = req.body.contenido ?? req.body.comentario ?? req.body.texto;
    
    if (!userId || !contenido) return res.status(400).json({ success: false, message: 'userId y contenido requeridos' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');
    
    const insertRs = await pool.request()
      .input('tid', sql.Int, id)
      .input('uid', sql.Int, userId)
      .input('txt', sql.NVarChar, contenido)
      .query(`
        DECLARE @newId TABLE (ID INT);
        INSERT INTO TICKET_COMENTARIOS (TICKET_ID, USER_ID, CONTENIDO)
        OUTPUT inserted.COM_ID INTO @newId(ID)
        VALUES (@tid, @uid, @txt);
        SELECT ID FROM @newId;
      `);
      
    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, userId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'comentario', @uid)`);

    // Primera respuesta
    const rsHeader = await pool.request().input('tid', sql.Int, id).query(`SELECT FECHA_PRIMERA_RESPUESTA, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    const hdr = rsHeader.recordset[0];
    
    if (!hdr.FECHA_PRIMERA_RESPUESTA && hdr.ASIGNADO_A && Number(hdr.ASIGNADO_A) === Number(userId)) {
      await pool.request().input('tid', sql.Int, id).query(`UPDATE TICKETS SET FECHA_PRIMERA_RESPUESTA=GETDATE(), ESTADO = CASE WHEN ESTADO='abierto' OR ESTADO='asignado' THEN 'en_proceso' ELSE ESTADO END WHERE TICKET_ID=@tid`);
    }

    // Notificaciones
    const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    
    if (rsTicket.recordset.length) {
      const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
      const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
      
      if (Number(userId) !== Number(solicitanteId)) {
        await pool.request()
          .input('uid', sql.Int, solicitanteId)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Nuevo comentario en ticket #${id}`)
          .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_comentario', @tid, @msg)`);
        try {
          await notificationService.createNotification({
            usuarioId: solicitanteId,
            mensaje: `Nuevo comentario en ticket #${id}`,
            tipo: 'ticket_comentario',
            dataExtra: { ticketId: id },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error notificando solicitante via notificationService:', e?.message || e);
        }
      } else if (asignadoA && Number(asignadoA) !== Number(userId)) {
        await pool.request()
          .input('uid', sql.Int, asignadoA)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Nuevo comentario del solicitante en ticket #${id}`)
          .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_comentario', @tid, @msg)`);
        try {
          await notificationService.createNotification({
            usuarioId: asignadoA,
            mensaje: `Nuevo comentario del solicitante en ticket #${id}`,
            tipo: 'ticket_comentario',
            dataExtra: { ticketId: id },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error notificando asignado via notificationService:', e?.message || e);
        }
      }
    }

    const comentarios = await pool.request().input('tid', sql.Int, id).query(`
      SELECT COM_ID as id, USER_ID as userId, CONTENIDO as contenido, CREATED_AT as createdAt
      FROM TICKET_COMENTARIOS WHERE TICKET_ID=@tid ORDER BY COM_ID ASC`);
      
    // Emitir nuevo comentario por socket
    try {
      const lastId = insertRs?.recordset?.[0]?.ID;
      if (lastId) {
        const rsOne = await pool.request()
          .input('tid', sql.Int, id)
          .input('cid', sql.Int, lastId)
          .query(`
            SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
                   c.CONTENIDO as contenido, c.CREATED_AT as createdAt
            FROM TICKET_COMENTARIOS c
            LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
            WHERE c.TICKET_ID=@tid AND c.COM_ID=@cid
          `);
        const msg = rsOne.recordset[0];
        if (msg && socketService.getIO(req.user?.empresa)) {
          const io = socketService.getIO(req.user?.empresa);
          io.to(`ticket:${id}`).emit('ticket:comment', msg);

          // Emitir también a salas de usuario (solicitante/asignado) por fiabilidad
          try {
            const rsTicket = await pool.request().input('tid', sql.Int, id)
              .query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
            if (rsTicket.recordset.length) {
              const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
              const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
              if (solicitanteId) io.to(`user:${solicitanteId}`).emit('ticket:comment', msg);
              if (asignadoA) io.to(`user:${asignadoA}`).emit('ticket:comment', msg);
            }
          } catch (ee) {
            console.warn('⚠️ Error emitiendo ticket:comment a user rooms:', ee?.message || ee);
          }
        }
      }
    } catch (ee) {
      console.warn('⚠️ No se pudo emitir evento de chat:', ee.message);
    }
    
    res.json({ success: true, data: comentarios.recordset });
  } catch (e) {
    console.error('Error comentando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.uploadEvidencia = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const usuarioId = (req.body.usuarioId ?? Number(req.headers['usuarioid'])) || null;

    if (!file) return res.status(400).json({ success: false, message: 'Archivo evidencia requerido (campo: evidencia)' });

    const pool = await databaseService.getPool(req.user?.empresa);

    const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!rsTicket.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

    const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
    const asignadoA = rsTicket.recordset[0].ASIGNADO_A;

    // Construir URL pública (se sirve desde IIS)
    const publicUrl = `https://intranet.ardabytec.vip/intranet/Evidencia/${encodeURIComponent(file.filename)}`;

    // Guardar en historial como evidencia
    await pool.request()
      .input('tid', sql.Int, id)
      .input('det', sql.NVarChar, publicUrl)
      .input('uid', sql.Int, usuarioId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'evidencia', @det, @uid)`);

    // Opcional: notificar al solicitante si quien sube no es el solicitante
    try {
      if (solicitanteId && Number(solicitanteId) !== Number(usuarioId)) {
        await pool.request()
          .input('uid', sql.Int, solicitanteId)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Nueva evidencia en ticket #${id}`)
          .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_evidencia', @tid, @msg)`);
      }
    } catch (e) {
      console.warn('⚠️ Error creando notificacion de evidencia:', e?.message || e);
    }

    // Emitir evento socket con info de la evidencia
    try {
      const io = socketService.getIO(req.user?.empresa);
      const payload = { ticketId: Number(id), filename: file.filename, url: publicUrl, uploadedBy: usuarioId, createdAt: new Date().toISOString() };
      io.to(`ticket:${id}`).emit('ticket:evidence', payload);
      if (solicitanteId) {
        io.to(`user:${solicitanteId}`).emit('notificacion', { usuarioId: solicitanteId, mensaje: `Nueva evidencia en ticket #${id}`, tipo: 'ticket_evidencia', dataExtra: { ticketId: id, url: publicUrl }, fecha: new Date().toISOString(), leida: 0 });
        try { io.to(`user:${solicitanteId}`).emit('chat:notify', { usuarioId: solicitanteId, mensaje: `Nueva evidencia en ticket #${id}`, tipo: 'ticket_evidencia', dataExtra: { ticketId: id, url: publicUrl }, fecha: new Date().toISOString(), leida: 0 }); } catch(e) {}
      }
      if (asignadoA) {
        io.to(`user:${asignadoA}`).emit('ticket:evidence', payload);
      }
    } catch (e) { /* non-fatal */ }

    return res.json({ success: true, data: { filename: file.filename, url: publicUrl, originalname: file.originalname } });
  } catch (e) {
    console.error('Error subiendo evidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Eliminar una evidencia (historial) por su id
exports.deleteEvidencia = async (req, res) => {
  try {
    const { id, histId } = req.params;
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const usuarioId = Number(req.headers['usuarioid'] || req.body.usuarioId || 0) || null;

    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener la entrada de historial
    const rs = await pool.request().input('hid', sql.Int, histId).input('tid', sql.Int, id)
      .query(`SELECT HIST_ID as id, TIPO as tipo, DETALLE as detalle, USER_ID as userId FROM TICKET_HISTORIAL WHERE HIST_ID=@hid AND TICKET_ID=@tid`);

    if (rs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    const row = rs.recordset[0];
    if ((row.tipo || '').toString().toLowerCase() !== 'evidencia') {
      return res.status(400).json({ success: false, message: 'El historial no es una evidencia' });
    }

    // Permisos: AD/TI/ADM/ADMIN o el autor de la evidencia
    const canManage = ['AD','TI','ADM','ADMIN'].includes(tipoUsuario) || (usuarioId && usuarioId === row.userId);
    if (!canManage) return res.status(403).json({ success: false, message: 'No autorizado para eliminar esta evidencia' });

    // Intentar eliminar el archivo físico siDETALLE parece una URL al directorio de evidencias
    try {
      const detalle = (row.detalle || '').toString();
      if (detalle) {
        // extraer filename
        const filename = detalle.split('/').pop();
        if (filename) {
          const filePath = path.join(EVIDENCIA_DIR, decodeURIComponent(filename));
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {
            console.warn('No se pudo eliminar archivo de evidencia:', filePath, e?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn('Error al procesar borrado de archivo de evidencia:', e?.message || e);
    }

    // Borrar registro de historial
    await pool.request().input('hid', sql.Int, histId).query(`DELETE FROM TICKET_HISTORIAL WHERE HIST_ID=@hid`);

    // Emitir evento de actualización del ticket para refrescar vistas
    try {
      const io = socketService.getIo();
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: Number(id), action: 'evidence_deleted', histId: Number(histId) });
      io.to(`user:${row.userId}`).emit('notificacion', { usuarioId: row.userId, mensaje: `Evidencia eliminada en ticket #${id}`, tipo: 'ticket_evidencia_deleted', dataExtra: { ticketId: Number(id), histId: Number(histId) }, fecha: new Date().toISOString(), leida: 1 });
    } catch (_) {}

    return res.json({ success: true, message: 'Evidencia eliminada' });
  } catch (e) {
    console.error('Error eliminando evidencia:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.transferirTicket = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const { id } = req.params;
    const rawUsuarioId = req.body.aUsuarioId ?? req.body.nuevoAsignadoId ?? req.body.asignadoA ?? req.body.userId ?? req.body.usuarioId;
    const aUsuarioId = rawUsuarioId != null ? Number(rawUsuarioId) : null;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;

    console.warn(`[transferirTicket] ticket=${id} destino=${aUsuarioId} actor=${actorId} tipo=${tipoUsuario} body=${JSON.stringify(req.body)}`);

    // Permitir transferir a usuarios TI, ST, AD, ADMIN, ADM
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    
    if (!aUsuarioId || !Number.isFinite(aUsuarioId)) return res.status(400).json({ success: false, message: 'aUsuarioId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);

    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT AREA, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!hdr.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    
    const area = hdr.recordset[0].AREA;
    const prevAsignado = hdr.recordset[0].ASIGNADO_A;

    // Validar que el usuario destino existe y está activo
    const rsOk = await pool.request().input('uid', sql.Int, aUsuarioId)
      .query(`SELECT 1 as ok FROM NEUS_USUARIOS WHERE NEUS_ID = @uid AND NEUS_ACTIVO = 1`);

    if (!rsOk.recordset.length) {
      console.warn(`[transferirTicket] destino uid=${aUsuarioId} no está activo`);
      return res.status(400).json({ success: false, message: 'El usuario destino no está disponible' });
    }

    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, aUsuarioId)
      .query(`UPDATE TICKETS SET ASIGNADO_A=@uid, ESTADO='asignado', FECHA_ASIGNACION=GETDATE() WHERE TICKET_ID=@tid`);
      
    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, aUsuarioId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'transferido', @uid)`);
      
    if (prevAsignado) {
      await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, prevAsignado)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'participante', @uid)`);
    }
    
    if (actorId) {
      await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, actorId)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'transferido_por', @uid)`);
    }
    
    await pool.request().input('uid', sql.Int, aUsuarioId).query(`UPDATE TI_STAFF_STATUS SET LAST_ASSIGNED_AT=GETDATE() WHERE USER_ID=@uid`);
    
    // Notificación al nuevo asignado
    await pool.request().input('uid', sql.Int, aUsuarioId).input('tid', sql.Int, id)
      .input('msg', sql.NVarChar, `Ticket #${id} transferido a ti`).query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_transferido', @tid, @msg)`);
    
    // Emitir notificación en tiempo real and persistir en notificacion_campana
    try {
      await notificationService.createNotification({
        usuarioId: aUsuarioId,
        mensaje: `Ticket #${id} transferido a ti`,
        tipo: 'ticket_transferido',
        dataExtra: { ticketId: id, transferidoPor: actorId },
        tenantKey: req.user?.empresa,
      });
    } catch (e) {
      console.warn('⚠️ Error creando notificacion para nuevo asignado via notificationService:', e?.message || e);
    }

    // Emitir notificación en tiempo real y notificar al anterior asignado si aplica
    try {
      // Intentar crear una copia de la notificación para el anterior asignado
      if (prevAsignado && Number(prevAsignado) !== Number(aUsuarioId)) {
        try {
          await pool.request()
            .input('uid', sql.Int, prevAsignado)
            .input('tid', sql.Int, id)
            .input('msg', sql.NVarChar, `Ticket #${id} fue transferido a otro usuario`)
            .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_transferido', @tid, @msg)`);
        } catch (nerr) {
          console.warn('⚠️ Error creando notificación para prevAsignado:', nerr?.message || nerr);
        }
        try {
          await notificationService.createNotification({
            usuarioId: prevAsignado,
            mensaje: `Ticket #${id} fue transferido a otro usuario`,
            tipo: 'ticket_transferido_ajeno',
            dataExtra: { ticketId: id, nuevoAsignado: aUsuarioId },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error creando notificacion para prevAsignado via notificationService:', e?.message || e);
        }
      }

      // Enviar evento socket si está disponible (para notificaciones en tiempo real)
      try {
        const io = socketService.getIO(req.user?.empresa);
        // Notificar al nuevo asignado en su room de usuario
        const _notifNuevo = {
          tipo: 'ticket_transferido',
          ticketId: id,
          mensaje: `Ticket #${id} transferido a ti`
        };
        io.to(`user:${aUsuarioId}`).emit('notificacion', _notifNuevo);
        try { io.to(`user:${aUsuarioId}`).emit('chat:notify', _notifNuevo); } catch(e) {}

        // Notificar al ticket room sobre el cambio de asignación
        io.to(`ticket:${id}`).emit('ticket:updated', {
          ticketId: id,
          nuevoAsignado: aUsuarioId,
          tipo: 'transferido'
        });

        // Notificar al anterior asignado (si existe y es distinto)
        if (prevAsignado && Number(prevAsignado) !== Number(aUsuarioId)) {
          const _notifPrev = {
            tipo: 'ticket_transferido_ajeno',
            ticketId: id,
            mensaje: `Ticket #${id} fue transferido a otro usuario`
          };
          io.to(`user:${prevAsignado}`).emit('notificacion', _notifPrev);
          try { io.to(`user:${prevAsignado}`).emit('chat:notify', _notifPrev); } catch(e) {}
        }
      } catch (se) {
        // socket might not be initialized; no problem
      }
    } catch (e) {
      console.warn('⚠️ Error enviando notificaciones en transferirTicket:', e?.message || e);
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'transferir', entidadId: req.params.id, detalle:{ aUsuarioId }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error transfiriendo ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    const { id } = req.params;
    const { estado } = req.body;
    const nota = req.body.nota ?? req.body.detalle ?? req.body.descripcion ?? null;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;
    const nuevo = String(estado || '').toLowerCase();
    const validos = ['abierto','asignado','en_proceso','resuelto','cerrado'];
    
    if (!validos.includes(nuevo)) return res.status(400).json({ success: false, message: 'Estado inválido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);

    // Solo el solicitante puede cerrar el ticket
    if (nuevo === 'cerrado') {
      if (!actorId) return res.status(400).json({ success: false, message: 'usuarioId requerido para cerrar' });
      
      const rsOwn = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID FROM TICKETS WHERE TICKET_ID=@tid`);
      if (!rsOwn.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
      
      const ownerId = Number(rsOwn.recordset[0].SOLICITANTE_ID);
      if (ownerId !== actorId) {
        return res.status(403).json({ success: false, message: 'Solo el solicitante puede cerrar el ticket' });
      }
    }

    let setExtra = '';
    if (nuevo === 'resuelto') setExtra = ', FECHA_CIERRE = COALESCE(FECHA_CIERRE, GETDATE())';
    if (nuevo === 'cerrado') setExtra = ', FECHA_CIERRE = COALESCE(FECHA_CIERRE, GETDATE())';
    
    await pool.request().input('tid', sql.Int, id).input('est', sql.NVarChar, nuevo)
      .query(`UPDATE TICKETS SET ESTADO=@est ${setExtra} WHERE TICKET_ID=@tid`);
      
    // Insert historial for estado change (with actor if available)
    if (actorId) {
      await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, nuevo).input('uid', sql.Int, actorId)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'estado', @det, @uid)`);
    } else {
      await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, nuevo)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE) VALUES (@tid, 'estado', @det)`);
    }

    // If a resolution note was provided, save it as a resolucion entry in historial
    if (nota) {
      try {
        if (actorId) {
          await pool.request().input('tid', sql.Int, id).input('det2', sql.NVarChar, nota).input('uid2', sql.Int, actorId)
            .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'resolucion', @det2, @uid2)`);
        } else {
          await pool.request().input('tid', sql.Int, id).input('det2', sql.NVarChar, nota)
            .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE) VALUES (@tid, 'resolucion', @det2)`);
        }
      } catch (e) {
        console.warn('⚠️ Error guardando nota de resolución en historial:', e?.message || e);
      }
    }

    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT ESTADO FROM TICKETS WHERE TICKET_ID=@tid`);
    const estadoActual = hdr.recordset[0]?.ESTADO;
    const encuesta = estadoActual === 'resuelto';
    
    // Notificar al solicitante si se resolvió
    if (estadoActual === 'resuelto') {
      const rsOwner = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID FROM TICKETS WHERE TICKET_ID=@tid`);
      if (rsOwner.recordset.length) {
        const ownerId = rsOwner.recordset[0].SOLICITANTE_ID;
        const insertRs = await pool.request().input('uid', sql.Int, ownerId)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Tu ticket #${id} fue marcado como resuelto`)
          .query(`
            DECLARE @newId TABLE (ID INT);
            INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE)
            OUTPUT inserted.NOTI_ID INTO @newId(ID)
            VALUES (@uid, 'ticket_estado', @tid, @msg);
            SELECT ID FROM @newId;
          `);
        try {
          const newId = insertRs.recordset?.[0]?.ID || null;
          const payload = { id: newId ? Number(newId) : null, usuarioId: ownerId, mensaje: `Tu ticket #${id} fue marcado como resuelto`, tipo: 'ticket_estado', leida: 0, fecha: new Date().toISOString(), dataExtra: { ticketId: id, nota: nota || null } };
          const io = socketService.getIO(req.user?.empresa);
          io.to(`user:${ownerId}`).emit('notificacion', payload);
          try { io.to(`user:${ownerId}`).emit('chat:notify', payload); } catch(e) {}
        } catch (emitErr) { /* non-fatal */ }
      }
    }
    // Emitir cambio de estado en tiempo real
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: id, nuevoEstado: estadoActual });
      // Notificar a solicitante y asignado
      const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
      if (rsTicket.recordset.length) {
        const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
        const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
        if (solicitanteId) io.to(`user:${solicitanteId}`).emit('ticket:updated', { ticketId: id, nuevoEstado: estadoActual });
        if (asignadoA) io.to(`user:${asignadoA}`).emit('ticket:updated', { ticketId: id, nuevoEstado: estadoActual });
      }
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'cambiar-estado', entidadId: req.params.id, detalle:{ estado: nuevo }, ip:req.ip });
    res.json({ success: true, estado: estadoActual, encuesta });
  } catch (e) {
    console.error('Error cambiando estado de ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.registrarSatisfaccion = async (req, res) => {
  try {
    const { id } = req.params;
    const solicitanteId = req.body.solicitanteId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    const rating = req.body.rating ?? req.body.calificacion ?? req.body.puntaje;
    const { comentario } = req.body;
    
    if (!solicitanteId || !rating) return res.status(400).json({ success: false, message: 'solicitanteId y rating requeridos' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rt = Number(rating);
    
    if (!(rt >= 1 && rt <= 5)) return res.status(400).json({ success: false, message: 'rating debe ser 1..5' });

    // Validar que el solicitante sea dueño del ticket
    const rs = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    
    if (Number(rs.recordset[0].SOLICITANTE_ID) !== Number(solicitanteId)) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede contestar la encuesta' });
    }

    await pool.request().input('tid', sql.Int, id).input('r', sql.Int, rt).input('c', sql.NVarChar, comentario || null)
      .query(`
MERGE TICKET_SATISFACCION AS tgt
USING (SELECT @tid AS TICKET_ID) AS src
ON (tgt.TICKET_ID = src.TICKET_ID)
WHEN MATCHED THEN UPDATE SET RATING=@r, COMENTARIO=@c, SUBMIT_AT=GETDATE()
WHEN NOT MATCHED THEN INSERT (TICKET_ID, RATING, COMENTARIO) VALUES (@tid, @r, @c);
      `);
      
    await pool.request().input('tid', sql.Int, id).query(`UPDATE TICKETS SET ESTADO='cerrado', FECHA_CIERRE = COALESCE(FECHA_CIERRE, GETDATE()) WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO) VALUES (@tid, 'encuesta')`);
    
    // Notificar al asignado
    const rsAsig = await pool.request().input('tid', sql.Int, id).query(`SELECT ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    if (rsAsig.recordset.length && rsAsig.recordset[0].ASIGNADO_A) {
      const asignadoId = rsAsig.recordset[0].ASIGNADO_A;
      const insertRs = await pool.request().input('uid', sql.Int, asignadoId)
        .input('tid', sql.Int, id)
        .input('msg', sql.NVarChar, `Ticket #${id} fue cerrado por el solicitante`)
        .query(`
          DECLARE @newId TABLE (ID INT);
          INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE)
          OUTPUT inserted.NOTI_ID INTO @newId(ID)
          VALUES (@uid, 'ticket_estado', @tid, @msg);
          SELECT ID FROM @newId;
        `);
      try {
        const newId = insertRs.recordset?.[0]?.ID || null;
        const payload = { id: newId ? Number(newId) : null, usuarioId: asignadoId, mensaje: `Ticket #${id} fue cerrado por el solicitante`, tipo: 'ticket_estado', leida: 0, fecha: new Date().toISOString(), dataExtra: { ticketId: id } };
        const io = socketService.getIO(req.user?.empresa);
        io.to(`user:${asignadoId}`).emit('notificacion', payload);
        try { io.to(`user:${asignadoId}`).emit('chat:notify', payload); } catch(e) {}
      } catch (emitErr) { /* non-fatal */ }
    }

    // Emitir evento en tiempo real: ticket cerrado / encuesta respondida
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: id, nuevoEstado: 'cerrado', tipo: 'satisfaccion' });
      if (rsAsig.recordset.length && rsAsig.recordset[0].ASIGNADO_A) {
        io.to(`user:${rsAsig.recordset[0].ASIGNADO_A}`).emit('ticket:updated', { ticketId: id, nuevoEstado: 'cerrado' });
      }
    } catch (e) {}

    res.json({ success: true, message: 'Gracias por tu respuesta' });
  } catch (e) {
    console.error('Error guardando satisfacción:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getStaffTI = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT 
        u.NEUS_ID as userId,
        u.NEUS_NOMBRES as nombre,
        COALESCE(s.AREA, CASE WHEN u.NEUS_TIPOUSUARIO IN ('TI','ST') THEN u.NEUS_TIPOUSUARIO ELSE 'TI' END) as area,
        COALESCE(s.DISPONIBLE,1) as disponible,
        s.LAST_ASSIGNED_AT as lastAssignedAt
      FROM NEUS_USUARIOS u
      LEFT JOIN TI_STAFF_STATUS s ON s.USER_ID=u.NEUS_ID
      WHERE u.NEUS_ACTIVO=1
        AND (
          u.NEUS_TIPOUSUARIO IN ('TI','ST')
          OR EXISTS (
            SELECT 1 FROM TI_STAFF_STATUS x 
            WHERE x.USER_ID = u.NEUS_ID AND x.AREA IN ('TI','ST')
          )
        )
      ORDER BY u.NEUS_NOMBRES`);
      
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando staff TI:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.actualizarStaffTI = async (req, res) => {
  try {
    const userId = req.body.userId ?? req.body.usuarioId ?? req.body.uid ?? Number(req.headers['usuarioid']);
    const { area, disponible } = req.body;
    
    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const a = normalizeArea(area || 'TI');
    const disp = disponible === undefined ? 1 : (disponible ? 1 : 0);
    
    await pool.request()
      .input('uid', sql.Int, userId)
      .input('area', sql.NVarChar, a)
      .input('disp', sql.Bit, disp)
      .query(`
MERGE TI_STAFF_STATUS AS tgt
USING (SELECT @uid AS USER_ID) AS src
ON (tgt.USER_ID = src.USER_ID)
WHEN MATCHED THEN UPDATE SET AREA=@area, DISPONIBLE=@disp
WHEN NOT MATCHED THEN INSERT(USER_ID, AREA, DISPONIBLE) VALUES(@uid, @area, @disp);
      `);
      
    res.json({ success: true });
  } catch (e) {
    console.error('Error guardando staff TI:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getNotificaciones = async (req, res) => {
  try {
    const usuarioId = Number(req.headers['usuarioid'] || req.query.usuarioId || 0) || null;
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('uid', sql.Int, usuarioId)
      .query(`SELECT NOTI_ID as id, USER_ID as userId, TIPO as tipo, TICKET_ID as ticketId, MENSAJE as mensaje, CREATED_AT as createdAt
              FROM NOTIFICACIONES WHERE USER_ID=@uid AND LEIDA=0 ORDER BY CREATED_AT DESC`);
              
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando notificaciones:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.marcarNotificacionLeida = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('nid', sql.Int, id).query(`UPDATE NOTIFICACIONES SET LEIDA=1 WHERE NOTI_ID=@nid`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error marcando notificación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getReporteSatisfaccion = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const { from, to, area } = req.query;
    let where = '1=1';
    
    if (from) where += ` AND t.FECHA_CREACION >= CONVERT(datetime, '${from}')`;
    if (to) where += ` AND t.FECHA_CREACION <= CONVERT(datetime, '${to}')`;
    if (area) where += ` AND t.AREA = '${normalizeArea(area)}'`;
    
    const rs = await pool.request().query(`
      SELECT 
        t.TICKET_ID as id,
        t.TITULO as titulo,
        t.AREA as area,
        t.ESTADO as estado,
        t.FECHA_CREACION as fechaCreacion,
        t.FECHA_CIERRE as fechaCierre,
        owner.NEUS_NOMBRES as solicitanteNombre,
        asg.NEUS_NOMBRES as asignadoNombre,
        s.RATING as rating,
        s.COMENTARIO as comentario,
        CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
      FROM TICKETS t
      LEFT JOIN NEUS_USUARIOS owner ON owner.NEUS_ID = t.SOLICITANTE_ID
      LEFT JOIN NEUS_USUARIOS asg ON asg.NEUS_ID = t.ASIGNADO_A
      LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
      WHERE ${where}
      ORDER BY t.TICKET_ID DESC
    `);
    
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error reporte satisfaccion:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getReporteSatisfaccionCSV = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    req.headers.accept = 'text/csv';
    req.headers['content-type'] = 'text/csv; charset=utf-8';
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const { from, to, area } = req.query;
    let where = '1=1';
    
    if (from) where += ` AND t.FECHA_CREACION >= CONVERT(datetime, '${from}')`;
    if (to) where += ` AND t.FECHA_CREACION <= CONVERT(datetime, '${to}')`;
    if (area) where += ` AND t.AREA = '${normalizeArea(area)}'`;
    
    const rs = await pool.request().query(`
      SELECT 
        t.TICKET_ID as id,
        t.TITULO as titulo,
        t.AREA as area,
        t.ESTADO as estado,
        t.FECHA_CREACION as fechaCreacion,
        t.FECHA_CIERRE as fechaCierre,
        owner.NEUS_NOMBRES as solicitanteNombre,
        asg.NEUS_NOMBRES as asignadoNombre,
        s.RATING as rating,
        s.COMENTARIO as comentario,
        CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
      FROM TICKETS t
      LEFT JOIN NEUS_USUARIOS owner ON owner.NEUS_ID = t.SOLICITANTE_ID
      LEFT JOIN NEUS_USUARIOS asg ON asg.NEUS_ID = t.ASIGNADO_A
      LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
      WHERE ${where}
      ORDER BY t.TICKET_ID DESC
    `);
    
    const rows = rs.recordset;
    let csv = 'id,titulo,area,estado,fechaCreacion,fechaCierre,tiempoAtencionMinutos,solicitante,asignado,rating,comentario\n';
    
    for (const r of rows) {
      let tiempoStr = '';
      if (r.tiempoAtencionMinutos !== null && r.tiempoAtencionMinutos !== undefined) {
        const m = Number(r.tiempoAtencionMinutos);
        if (!Number.isNaN(m)) {
          if (m <= 0) {
            tiempoStr = '0 min';
          } else if (m < 60) {
            tiempoStr = `${m} min`;
          } else {
            const h = Math.floor(m / 60);
            const mm = m % 60;
            tiempoStr = mm > 0 ? `${h} h ${mm} min` : `${h} h`;
          }
        }
      }

      const line = [
        r.id,
        `"${(r.titulo||'').replace(/"/g,'\"')}"`,
        r.area,
        r.estado,
        r.fechaCreacion?.toISOString?.() || r.fechaCreacion,
        r.fechaCierre?.toISOString?.() || r.fechaCierre,
        tiempoStr,
        `"${(r.solicitanteNombre||'').replace(/"/g,'\"')}"`,
        `"${(r.asignadoNombre||'').replace(/"/g,'\"')}"`,
        r.rating ?? '',
        `"${(r.comentario||'').replace(/"/g,'\"')}"`
      ].join(',');
      csv += line + '\n';
    }
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tickets_satisfaccion.csv"');
    res.send(csv);
  } catch (e) {
    console.error('Error reporte satisfaccion CSV:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
