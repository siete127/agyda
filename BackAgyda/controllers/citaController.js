const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const emailService = require('../services/emailService');

// ─────────────────────────────────────────────────────────────────────────────
// Citas y tratamientos del cliente (CRM Cliente — Fase 2). CRUD completo, molde
// directo de casoController.js. La entidad "Cita" reemplaza el uso aproximado de
// CLI_TAREAS para agendar; "Tratamiento" agrupa citas en una serie de sesiones.
// El control de acceso vive en la ruta (requireActionAccess 'citas-ver' /
// 'citas-gestionar'); aquí no se re-chequea.
// ─────────────────────────────────────────────────────────────────────────────

const MODALIDADES_VALIDAS = ['videollamada', 'telefonica', 'generica'];
const ESTATUS_VALIDOS = ['agendada', 'confirmada', 'reprogramada', 'cancelada', 'asistio', 'no_asistio'];
const ESTATUS_QUE_CIERRAN = ['asistio', 'no_asistio', 'cancelada'];
const RECORDAR_MIN_VALIDOS = [0, 15, 30, 60, 120, 1440, 2880];
const TRAT_ESTATUS_VALIDOS = ['activo', 'pausado', 'completado', 'cancelado'];

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// Normaliza una fecha-hora del cliente a "YYYY-MM-DD HH:mm:ss" SIN zona, para
// guardarla como wall-clock literal (misma referencia que GETDATE() del server,
// que corre en horario de México). Evita el corrimiento de 6 h que produce
// bindear un Date de JS como sql.DateTime. Acepta 'YYYY-MM-DDTHH:mm[:ss]' o
// un ISO con Z (se toma la parte local resultante).
function fechaHoraSql(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]} ${m[2]}:${m[3]}:${m[4] || '00'}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// CSV de minutos de anticipación → array de enteros válidos, ordenado desc.
function parseRecordar(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((n) => parseInt(String(n).trim(), 10))
    .filter((n) => Number.isFinite(n) && RECORDAR_MIN_VALIDOS.includes(n))
    .sort((a, b) => b - a);
}

const CITA_SELECT_FIELDS = `
  K.CITA_ID as id, K.CITA_CONTACTO_ID as contactoId, C.CONT_NOMBRE as contactoNombre,
  C.CONT_CORREO as contactoCorreo, C.CONT_TELEFONO as contactoTelefono,
  K.CITA_TRATAMIENTO_ID as tratamientoId, T.TRAT_NOMBRE as tratamientoNombre,
  T.TRAT_TOTAL_SESIONES as tratamientoTotalSesiones,
  K.CITA_NUMERO_SESION as numeroSesion, K.CITA_MODALIDAD as modalidad,
  K.CITA_TITULO as titulo, K.CITA_MOTIVO as motivo,
  CONVERT(NVARCHAR(19), K.CITA_FECHA_HORA, 126) as fechaHora,
  K.CITA_DURACION_MIN as duracionMin, K.CITA_ENLACE as enlace, K.CITA_TELEFONO as telefono,
  K.CITA_ESTATUS as estatus, K.CITA_CONFIRMADA_POR_CLIENTE as confirmadaPorCliente,
  K.CITA_FECHA_CONFIRMACION as fechaConfirmacion, K.CITA_RECORDAR_MIN_ANTES as recordarMinAntes,
  K.CITA_ASIGNADO_A as asignadoA, U.NEUS_NOMBRES as asignadoNombre,
  K.CITA_CREADO_POR as creadoPor, K.CITA_FECHA_CREACION as fechaCreacion,
  K.CITA_NOTA_RESULTADO as notaResultado
`;

async function contarSesionesCompletadas(pool, tratamientoId) {
  const rs = await pool.request()
    .input('t', sql.Int, tratamientoId)
    .query(`SELECT COUNT(*) n FROM CLI_CITAS WHERE CITA_TRATAMIENTO_ID=@t AND CITA_ACTIVO=1 AND CITA_ESTATUS='asistio'`);
  return rs.recordset[0].n;
}

// ── Lecturas ────────────────────────────────────────────────────────────────

exports.list = async (req, res) => {
  try {
    const { desde, hasta, estatus, asignadoA, contactoId, tratamientoId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const cond = ['K.CITA_ACTIVO = 1'];
    const request = pool.request();
    if (desde) { cond.push('K.CITA_FECHA_HORA >= @desde'); request.input('desde', sql.DateTime, desde); }
    if (hasta) { cond.push('K.CITA_FECHA_HORA <= @hasta'); request.input('hasta', sql.DateTime, hasta); }
    if (estatus) { cond.push('K.CITA_ESTATUS = @estatus'); request.input('estatus', sql.NVarChar, estatus); }
    if (asignadoA) { cond.push('K.CITA_ASIGNADO_A = @asignadoA'); request.input('asignadoA', sql.Int, asignadoA); }
    if (contactoId) { cond.push('K.CITA_CONTACTO_ID = @contactoId'); request.input('contactoId', sql.Int, contactoId); }
    if (tratamientoId) { cond.push('K.CITA_TRATAMIENTO_ID = @tratamientoId'); request.input('tratamientoId', sql.Int, tratamientoId); }

    const rs = await request.query(`
      SELECT ${CITA_SELECT_FIELDS}
      FROM CLI_CITAS K
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
      LEFT JOIN CLI_TRATAMIENTOS T ON T.TRAT_ID = K.CITA_TRATAMIENTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CITA_ASIGNADO_A
      WHERE ${cond.join(' AND ')}
      ORDER BY K.CITA_FECHA_HORA ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error list citas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT ${CITA_SELECT_FIELDS}
        FROM CLI_CITAS K
        LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
        LEFT JOIN CLI_TRATAMIENTOS T ON T.TRAT_ID = K.CITA_TRATAMIENTO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CITA_ASIGNADO_A
        WHERE K.CITA_CONTACTO_ID = @id AND K.CITA_ACTIVO = 1
        ORDER BY K.CITA_FECHA_HORA DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listByContacto citas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${CITA_SELECT_FIELDS}
        FROM CLI_CITAS K
        LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
        LEFT JOIN CLI_TRATAMIENTOS T ON T.TRAT_ID = K.CITA_TRATAMIENTO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CITA_ASIGNADO_A
        WHERE K.CITA_ID = @id AND K.CITA_ACTIVO = 1
      `);
    if (!rs.recordset[0]) return res.status(404).json({ success: false, message: 'Cita no encontrada' });

    const cita = rs.recordset[0];
    // Solicitud de cambio pendiente, si la hay.
    const sol = await pool.request().input('id', sql.Int, id)
      .query(`SELECT TOP 1 SOL_ID as id, SOL_TIPO as tipo,
              CONVERT(NVARCHAR(19), SOL_FECHA_PROPUESTA, 126) as fechaPropuesta,
              SOL_MOTIVO as motivo, CONVERT(NVARCHAR(19), SOL_FECHA, 126) as fecha
              FROM CLI_CITAS_SOLICITUDES WHERE SOL_CITA_ID=@id AND SOL_ESTATUS='pendiente'
              ORDER BY SOL_FECHA DESC`);
    cita.solicitudPendiente = sol.recordset[0] || null;
    res.json({ success: true, data: cita });
  } catch (e) {
    console.error('Error getById cita:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Crear / actualizar ──────────────────────────────────────────────────────

exports.create = async (req, res) => {
  try {
    const {
      contactoId, tratamientoId, numeroSesion, modalidad, titulo, motivo,
      fechaHora, duracionMin, enlace, telefono, asignadoA, recordarMinAntes,
    } = req.body || {};

    const contId = contactoId ? parseInt(contactoId, 10) : null;
    if (!Number.isFinite(contId)) return res.status(400).json({ success: false, message: 'contactoId requerido' });
    if (!titulo || !String(titulo).trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!fechaHora) return res.status(400).json({ success: false, message: 'Fecha y hora requeridas' });

    const modal = MODALIDADES_VALIDAS.includes(modalidad) ? modalidad : 'videollamada';
    const asignado = asignadoA ? parseInt(asignadoA, 10) : null;
    const tratId = tratamientoId ? parseInt(tratamientoId, 10) : null;
    // Normaliza CITA_RECORDAR_MIN_ANTES: acepta CSV o array; default '1440,60'.
    const recordarArr = Array.isArray(recordarMinAntes)
      ? parseRecordar(recordarMinAntes.join(','))
      : parseRecordar(recordarMinAntes);
    const recordarCsv = recordarArr.length ? recordarArr.join(',') : '1440,60';

    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('contactoId', sql.Int, contId)
      .input('tratamientoId', sql.Int, tratId)
      .input('numeroSesion', sql.Int, numeroSesion ? parseInt(numeroSesion, 10) : null)
      .input('modalidad', sql.NVarChar(20), modal)
      .input('titulo', sql.NVarChar(200), String(titulo).trim())
      .input('motivo', sql.NVarChar(sql.MAX), motivo || null)
      .input('fechaHora', sql.VarChar(19), fechaHoraSql(fechaHora))
      .input('duracionMin', sql.Int, duracionMin ? parseInt(duracionMin, 10) : 30)
      .input('enlace', sql.NVarChar(500), modal === 'videollamada' ? (enlace || null) : null)
      .input('telefono', sql.NVarChar(30), modal === 'telefonica' ? (telefono || null) : null)
      .input('asignadoA', sql.Int, asignado)
      .input('recordar', sql.NVarChar(60), recordarCsv)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_CITAS
          (CITA_CONTACTO_ID, CITA_TRATAMIENTO_ID, CITA_NUMERO_SESION, CITA_MODALIDAD, CITA_TITULO,
           CITA_MOTIVO, CITA_FECHA_HORA, CITA_DURACION_MIN, CITA_ENLACE, CITA_TELEFONO,
           CITA_ASIGNADO_A, CITA_RECORDAR_MIN_ANTES, CITA_CREADO_POR)
        OUTPUT INSERTED.CITA_ID
        VALUES (@contactoId, @tratamientoId, @numeroSesion, @modalidad, @titulo,
                @motivo, CONVERT(DATETIME, @fechaHora, 120), @duracionMin, @enlace, @telefono,
                @asignadoA, @recordar, @creadoPor)
      `);
    const id = rs.recordset[0].CITA_ID;

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-cita', entidadId: id,
      detalle: { contactoId: contId, modalidad: modal, fechaHora }, ip: req.ip,
    });

    if (asignado) {
      await notificationService.createNotification({
        usuarioId: asignado,
        mensaje: `Nueva cita asignada: ${String(titulo).trim()}`,
        tipo: 'cliente-cita-asignada',
        dataExtra: { citaId: id, contactoId: contId, fechaHora },
        tenantKey: req.user?.empresa,
      });
    }

    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    console.error('Error create cita:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const b = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    const sets = [];
    const r = pool.request().input('id', sql.Int, id);
    if (b.modalidad != null) { r.input('modalidad', sql.NVarChar(20), MODALIDADES_VALIDAS.includes(b.modalidad) ? b.modalidad : 'videollamada'); sets.push('CITA_MODALIDAD=@modalidad'); }
    if (b.titulo != null) { r.input('titulo', sql.NVarChar(200), String(b.titulo).trim()); sets.push('CITA_TITULO=@titulo'); }
    if (b.motivo != null) { r.input('motivo', sql.NVarChar(sql.MAX), b.motivo || null); sets.push('CITA_MOTIVO=@motivo'); }
    if (b.fechaHora != null) { r.input('fechaHora', sql.VarChar(19), fechaHoraSql(b.fechaHora)); sets.push('CITA_FECHA_HORA=CONVERT(DATETIME, @fechaHora, 120)'); sets.push('CITA_ALERTA_24H_NOTIF=0'); sets.push('CITA_ALERTA_1H_NOTIF=0'); }
    if (b.duracionMin != null) { r.input('duracionMin', sql.Int, parseInt(b.duracionMin, 10) || 30); sets.push('CITA_DURACION_MIN=@duracionMin'); }
    if (b.enlace != null) { r.input('enlace', sql.NVarChar(500), b.enlace || null); sets.push('CITA_ENLACE=@enlace'); }
    if (b.telefono != null) { r.input('telefono', sql.NVarChar(30), b.telefono || null); sets.push('CITA_TELEFONO=@telefono'); }
    if (b.asignadoA != null) { r.input('asignadoA', sql.Int, b.asignadoA ? parseInt(b.asignadoA, 10) : null); sets.push('CITA_ASIGNADO_A=@asignadoA'); }
    if (b.recordarMinAntes != null) {
      const arr = Array.isArray(b.recordarMinAntes) ? parseRecordar(b.recordarMinAntes.join(',')) : parseRecordar(b.recordarMinAntes);
      r.input('recordar', sql.NVarChar(60), arr.length ? arr.join(',') : '1440,60');
      sets.push('CITA_RECORDAR_MIN_ANTES=@recordar');
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nada que actualizar' });

    const result = await r.query(`UPDATE CLI_CITAS SET ${sets.join(', ')} WHERE CITA_ID=@id AND CITA_ACTIVO=1; SELECT @@ROWCOUNT as n`);
    if (!(result.recordset?.[0]?.n || 0)) return res.status(404).json({ success: false, message: 'Cita no encontrada' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'actualizar-cita', entidadId: id, detalle: { campos: sets }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error update cita:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEstatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { estatus, notaResultado } = req.body || {};
    if (!ESTATUS_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const cur = (await pool.request().input('id', sql.Int, id)
      .query(`SELECT CITA_TRATAMIENTO_ID as tratamientoId FROM CLI_CITAS WHERE CITA_ID=@id AND CITA_ACTIVO=1`)).recordset[0];
    if (!cur) return res.status(404).json({ success: false, message: 'Cita no encontrada' });

    const guardaNota = ['asistio', 'no_asistio'].includes(estatus);
    await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar(20), estatus)
      .input('nota', sql.NVarChar(sql.MAX), guardaNota ? (notaResultado || null) : null)
      .query(`
        UPDATE CLI_CITAS
        SET CITA_ESTATUS=@estatus
          ${guardaNota ? ', CITA_NOTA_RESULTADO=@nota' : ''}
        WHERE CITA_ID=@id AND CITA_ACTIVO=1
      `);

    // Si la cita es sesión de un tratamiento, recalcular progreso / cerrarlo.
    if (cur.tratamientoId) {
      const completadas = await contarSesionesCompletadas(pool, cur.tratamientoId);
      const trat = (await pool.request().input('t', sql.Int, cur.tratamientoId)
        .query(`SELECT TRAT_TOTAL_SESIONES as total, TRAT_ESTATUS as estatus FROM CLI_TRATAMIENTOS WHERE TRAT_ID=@t`)).recordset[0];
      if (trat && trat.total && completadas >= trat.total && trat.estatus === 'activo') {
        await pool.request().input('t', sql.Int, cur.tratamientoId)
          .query(`UPDATE CLI_TRATAMIENTOS SET TRAT_ESTATUS='completado' WHERE TRAT_ID=@t`);
      }
    }

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'actualizar-estatus-cita', entidadId: id, detalle: { estatus }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error updateEstatus cita:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cancelar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { motivo } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('motivo', sql.NVarChar(sql.MAX), motivo || null)
      .query(`
        UPDATE CLI_CITAS SET CITA_ESTATUS='cancelada',
          CITA_NOTA_RESULTADO = COALESCE(@motivo, CITA_NOTA_RESULTADO)
        WHERE CITA_ID=@id AND CITA_ACTIVO=1;
        SELECT @@ROWCOUNT n
      `);
    if (!(result.recordset?.[0]?.n || 0)) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
    res.json({ success: true });
  } catch (e) {
    console.error('Error cancelar cita:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id)
      .query(`UPDATE CLI_CITAS SET CITA_ACTIVO=0 WHERE CITA_ID=@id; SELECT @@ROWCOUNT n`);
    if (!(result.recordset?.[0]?.n || 0)) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
    res.json({ success: true });
  } catch (e) {
    console.error('Error remove cita:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Tratamientos ────────────────────────────────────────────────────────────

const TRAT_SELECT = `
  T.TRAT_ID as id, T.TRAT_CONTACTO_ID as contactoId, C.CONT_NOMBRE as contactoNombre,
  T.TRAT_NOMBRE as nombre, T.TRAT_DESCRIPCION as descripcion, T.TRAT_TOTAL_SESIONES as totalSesiones,
  T.TRAT_ESTATUS as estatus, T.TRAT_ASIGNADO_A as asignadoA, U.NEUS_NOMBRES as asignadoNombre,
  T.TRAT_CREADO_POR as creadoPor, T.TRAT_FECHA_INICIO as fechaInicio, T.TRAT_FECHA_CREACION as fechaCreacion
`;

exports.listTratamientos = async (req, res) => {
  try {
    const { contactoId, estatus } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const cond = ['T.TRAT_ACTIVO = 1'];
    const r = pool.request();
    if (contactoId) { cond.push('T.TRAT_CONTACTO_ID = @c'); r.input('c', sql.Int, contactoId); }
    if (estatus) { cond.push('T.TRAT_ESTATUS = @e'); r.input('e', sql.NVarChar, estatus); }
    const rs = await r.query(`
      SELECT ${TRAT_SELECT},
             (SELECT COUNT(*) FROM CLI_CITAS WHERE CITA_TRATAMIENTO_ID=T.TRAT_ID AND CITA_ACTIVO=1 AND CITA_ESTATUS='asistio') as sesionesCompletadas
      FROM CLI_TRATAMIENTOS T
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = T.TRAT_CONTACTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = T.TRAT_ASIGNADO_A
      WHERE ${cond.join(' AND ')}
      ORDER BY T.TRAT_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listTratamientos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTratamiento = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT ${TRAT_SELECT} FROM CLI_TRATAMIENTOS T
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = T.TRAT_CONTACTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = T.TRAT_ASIGNADO_A
      WHERE T.TRAT_ID=@id AND T.TRAT_ACTIVO=1
    `);
    if (!rs.recordset[0]) return res.status(404).json({ success: false, message: 'Tratamiento no encontrado' });
    const trat = rs.recordset[0];
    const citas = await pool.request().input('id', sql.Int, id).query(`
      SELECT ${CITA_SELECT_FIELDS}
      FROM CLI_CITAS K
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
      LEFT JOIN CLI_TRATAMIENTOS T ON T.TRAT_ID = K.CITA_TRATAMIENTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CITA_ASIGNADO_A
      WHERE K.CITA_TRATAMIENTO_ID=@id AND K.CITA_ACTIVO=1
      ORDER BY K.CITA_NUMERO_SESION ASC, K.CITA_FECHA_HORA ASC
    `);
    trat.citas = citas.recordset;
    trat.sesionesCompletadas = citas.recordset.filter((c) => c.estatus === 'asistio').length;
    res.json({ success: true, data: trat });
  } catch (e) {
    console.error('Error getTratamiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createTratamiento = async (req, res) => {
  try {
    const { contactoId, nombre, descripcion, totalSesiones, asignadoA, fechaInicio } = req.body || {};
    const contId = contactoId ? parseInt(contactoId, 10) : null;
    if (!Number.isFinite(contId)) return res.status(400).json({ success: false, message: 'contactoId requerido' });
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('contactoId', sql.Int, contId)
      .input('nombre', sql.NVarChar(200), String(nombre).trim())
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('total', sql.Int, totalSesiones ? parseInt(totalSesiones, 10) : null)
      .input('asignadoA', sql.Int, asignadoA ? parseInt(asignadoA, 10) : null)
      .input('fechaInicio', sql.Date, fechaInicio || null)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_TRATAMIENTOS
          (TRAT_CONTACTO_ID, TRAT_NOMBRE, TRAT_DESCRIPCION, TRAT_TOTAL_SESIONES, TRAT_ASIGNADO_A, TRAT_FECHA_INICIO, TRAT_CREADO_POR)
        OUTPUT INSERTED.TRAT_ID
        VALUES (@contactoId, @nombre, @descripcion, @total, @asignadoA, @fechaInicio, @creadoPor)
      `);
    res.status(201).json({ success: true, data: { id: rs.recordset[0].TRAT_ID } });
  } catch (e) {
    console.error('Error createTratamiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTratamiento = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const b = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const sets = [];
    const r = pool.request().input('id', sql.Int, id);
    if (b.nombre != null) { r.input('nombre', sql.NVarChar(200), String(b.nombre).trim()); sets.push('TRAT_NOMBRE=@nombre'); }
    if (b.descripcion != null) { r.input('descripcion', sql.NVarChar(sql.MAX), b.descripcion || null); sets.push('TRAT_DESCRIPCION=@descripcion'); }
    if (b.totalSesiones != null) { r.input('total', sql.Int, b.totalSesiones ? parseInt(b.totalSesiones, 10) : null); sets.push('TRAT_TOTAL_SESIONES=@total'); }
    if (b.asignadoA != null) { r.input('asignadoA', sql.Int, b.asignadoA ? parseInt(b.asignadoA, 10) : null); sets.push('TRAT_ASIGNADO_A=@asignadoA'); }
    if (b.fechaInicio != null) { r.input('fechaInicio', sql.Date, b.fechaInicio || null); sets.push('TRAT_FECHA_INICIO=@fechaInicio'); }
    if (b.estatus != null && TRAT_ESTATUS_VALIDOS.includes(b.estatus)) { r.input('estatus', sql.NVarChar(20), b.estatus); sets.push('TRAT_ESTATUS=@estatus'); }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nada que actualizar' });
    const result = await r.query(`UPDATE CLI_TRATAMIENTOS SET ${sets.join(', ')} WHERE TRAT_ID=@id AND TRAT_ACTIVO=1; SELECT @@ROWCOUNT n`);
    if (!(result.recordset?.[0]?.n || 0)) return res.status(404).json({ success: false, message: 'Tratamiento no encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('Error updateTratamiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Crea una CLI_CITA ligada al tratamiento, autonumerando la sesión.
exports.addSesion = async (req, res) => {
  try {
    const tratId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tratId)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { titulo, motivo, fechaHora, duracionMin, modalidad, enlace, telefono, asignadoA, recordarMinAntes } = req.body || {};
    if (!fechaHora) return res.status(400).json({ success: false, message: 'Fecha y hora requeridas' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const trat = (await pool.request().input('id', sql.Int, tratId)
      .query(`SELECT TRAT_CONTACTO_ID as contactoId, TRAT_NOMBRE as nombre, TRAT_ASIGNADO_A as asignadoA FROM CLI_TRATAMIENTOS WHERE TRAT_ID=@id AND TRAT_ACTIVO=1`)).recordset[0];
    if (!trat) return res.status(404).json({ success: false, message: 'Tratamiento no encontrado' });

    const maxSes = (await pool.request().input('id', sql.Int, tratId)
      .query(`SELECT ISNULL(MAX(CITA_NUMERO_SESION), 0) as n FROM CLI_CITAS WHERE CITA_TRATAMIENTO_ID=@id AND CITA_ACTIVO=1`)).recordset[0].n;
    const numeroSesion = maxSes + 1;

    const modal = MODALIDADES_VALIDAS.includes(modalidad) ? modalidad : 'videollamada';
    const asignado = (asignadoA ? parseInt(asignadoA, 10) : null) || trat.asignadoA || null;
    const recordarArr = Array.isArray(recordarMinAntes) ? parseRecordar(recordarMinAntes.join(',')) : parseRecordar(recordarMinAntes);
    const recordarCsv = recordarArr.length ? recordarArr.join(',') : '1440,60';

    const rs = await pool.request()
      .input('contactoId', sql.Int, trat.contactoId)
      .input('tratamientoId', sql.Int, tratId)
      .input('numeroSesion', sql.Int, numeroSesion)
      .input('modalidad', sql.NVarChar(20), modal)
      .input('titulo', sql.NVarChar(200), (titulo && String(titulo).trim()) || `${trat.nombre} — sesión ${numeroSesion}`)
      .input('motivo', sql.NVarChar(sql.MAX), motivo || null)
      .input('fechaHora', sql.VarChar(19), fechaHoraSql(fechaHora))
      .input('duracionMin', sql.Int, duracionMin ? parseInt(duracionMin, 10) : 30)
      .input('enlace', sql.NVarChar(500), modal === 'videollamada' ? (enlace || null) : null)
      .input('telefono', sql.NVarChar(30), modal === 'telefonica' ? (telefono || null) : null)
      .input('asignadoA', sql.Int, asignado)
      .input('recordar', sql.NVarChar(60), recordarCsv)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_CITAS
          (CITA_CONTACTO_ID, CITA_TRATAMIENTO_ID, CITA_NUMERO_SESION, CITA_MODALIDAD, CITA_TITULO,
           CITA_MOTIVO, CITA_FECHA_HORA, CITA_DURACION_MIN, CITA_ENLACE, CITA_TELEFONO,
           CITA_ASIGNADO_A, CITA_RECORDAR_MIN_ANTES, CITA_CREADO_POR)
        OUTPUT INSERTED.CITA_ID
        VALUES (@contactoId, @tratamientoId, @numeroSesion, @modalidad, @titulo,
                @motivo, CONVERT(DATETIME, @fechaHora, 120), @duracionMin, @enlace, @telefono,
                @asignadoA, @recordar, @creadoPor)
      `);
    res.status(201).json({ success: true, data: { id: rs.recordset[0].CITA_ID, numeroSesion } });
  } catch (e) {
    console.error('Error addSesion:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Solicitudes de cambio del portal ────────────────────────────────────────

exports.listSolicitudes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT S.SOL_ID as id, S.SOL_CITA_ID as citaId, S.SOL_TIPO as tipo,
             CONVERT(NVARCHAR(19), S.SOL_FECHA_PROPUESTA, 126) as fechaPropuesta, S.SOL_MOTIVO as motivo,
             S.SOL_ESTATUS as estatus, CONVERT(NVARCHAR(19), S.SOL_FECHA, 126) as fecha,
             K.CITA_TITULO as citaTitulo, CONVERT(NVARCHAR(19), K.CITA_FECHA_HORA, 126) as citaFechaHora,
             C.CONT_NOMBRE as contactoNombre, K.CITA_ASIGNADO_A as asignadoA
      FROM CLI_CITAS_SOLICITUDES S
      INNER JOIN CLI_CITAS K ON K.CITA_ID = S.SOL_CITA_ID
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
      WHERE S.SOL_ESTATUS = 'pendiente'
      ORDER BY S.SOL_FECHA ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listSolicitudes:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.resolverSolicitud = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { accion } = req.body || {}; // 'aprobar' | 'rechazar'
    if (!['aprobar', 'rechazar'].includes(accion)) return res.status(400).json({ success: false, message: 'accion inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const sol = (await pool.request().input('id', sql.Int, id).query(`
      SELECT SOL_CITA_ID as citaId, SOL_TIPO as tipo,
             CASE WHEN SOL_FECHA_PROPUESTA IS NULL THEN 0 ELSE 1 END as tieneFecha,
             SOL_ESTATUS as estatus
      FROM CLI_CITAS_SOLICITUDES WHERE SOL_ID=@id
    `)).recordset[0];
    if (!sol) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (sol.estatus !== 'pendiente') return res.status(409).json({ success: false, message: 'La solicitud ya fue resuelta' });

    if (accion === 'aprobar') {
      if (sol.tipo === 'reprogramar' && sol.tieneFecha) {
        // Copia la fecha propuesta a la cita enteramente en SQL (sin round-trip
        // por JS, que corre el reloj).
        await pool.request()
          .input('sid', sql.Int, id)
          .query(`
            UPDATE K
            SET K.CITA_FECHA_HORA = S.SOL_FECHA_PROPUESTA, K.CITA_ESTATUS='agendada',
                K.CITA_CONFIRMADA_POR_CLIENTE=0, K.CITA_FECHA_CONFIRMACION=NULL,
                K.CITA_ALERTA_24H_NOTIF=0, K.CITA_ALERTA_1H_NOTIF=0
            FROM CLI_CITAS K
            INNER JOIN CLI_CITAS_SOLICITUDES S ON S.SOL_CITA_ID = K.CITA_ID
            WHERE S.SOL_ID=@sid
          `);
      } else if (sol.tipo === 'cancelar') {
        await pool.request().input('cid', sql.Int, sol.citaId)
          .query(`UPDATE CLI_CITAS SET CITA_ESTATUS='cancelada' WHERE CITA_ID=@cid`);
      }
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('est', sql.NVarChar(20), accion === 'aprobar' ? 'aprobada' : 'rechazada')
      .input('uid', sql.Int, getUserId(req))
      .query(`
        UPDATE CLI_CITAS_SOLICITUDES
        SET SOL_ESTATUS=@est, SOL_RESUELTA_POR=@uid, SOL_FECHA_RESOLUCION=GETDATE()
        WHERE SOL_ID=@id
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'resolver-solicitud-cita', entidadId: id,
      detalle: { citaId: sol.citaId, tipo: sol.tipo, accion }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error resolverSolicitud:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper reusable: envía UN recordatorio de una cita a un umbral de anticipación.
// Lo consumen el cron (Fase 4) y cualquier envío manual. Registra siempre en
// CLI_CITAS_RECORD_LOG. En Fase 4 solo manda correo + notif; en Fase 6 se le
// agrega el envío por WhatsApp.
// `cita` = fila de CLI_CITAS con join a CRM_CONTACTOS (contactoNombre/Correo/Telefono).
// ─────────────────────────────────────────────────────────────────────────────
exports.enviarRecordatorioCita = async (pool, tenantKey, cita, umbralMin) => {
  const registrar = async (canal, resultado, detalle) => {
    try {
      await pool.request()
        .input('cid', sql.Int, cita.id)
        .input('canal', sql.NVarChar(20), canal)
        .input('u', sql.Int, umbralMin)
        .input('r', sql.NVarChar(20), resultado)
        .input('d', sql.NVarChar(300), detalle || null)
        .query(`INSERT INTO CLI_CITAS_RECORD_LOG (LOG_CITA_ID, LOG_CANAL, LOG_UMBRAL_MIN, LOG_RESULTADO, LOG_DETALLE)
                VALUES (@cid, @canal, @u, @r, @d)`);
    } catch (e) {
      console.warn(`[CITA RECORD][${tenantKey}] no se pudo registrar log cita ${cita.id}:`, e.message);
    }
  };

  // Correo al cliente. Si el contacto no tiene correo, se registra igual como
  // 'enviado' con detalle — así el cron no reintenta este umbral para siempre.
  if (cita.contactoCorreo) {
    try {
      await emailService.sendRecordatorioCitaEmail({
        contactoNombre: cita.contactoNombre,
        contactoCorreo: cita.contactoCorreo,
        titulo: cita.titulo,
        modalidad: cita.modalidad,
        fechaHora: cita.fechaHora,
        duracionMin: cita.duracionMin,
        enlace: cita.enlace,
        telefono: cita.telefono,
        umbralMin,
      });
      await registrar('correo', 'enviado');
    } catch (e) {
      await registrar('correo', 'fallido', e.message);
    }
  } else {
    await registrar('correo', 'enviado', 'contacto sin correo — omitido');
  }

  // Notificación interna al asesor.
  if (cita.asignadoA) {
    try {
      await notificationService.createNotification({
        usuarioId: cita.asignadoA,
        mensaje: `Cita próxima con ${cita.contactoNombre || 'cliente'}: ${cita.titulo}`,
        tipo: 'cliente-cita-asignada',
        dataExtra: { citaId: cita.id, fechaHora: cita.fechaHora, recordatorio: umbralMin },
        tenantKey,
      });
      await registrar('notificacion', 'enviado');
    } catch (e) {
      await registrar('notificacion', 'fallido', e.message);
    }
  }
};

// Notifica al asesor + supervisores que llegó una solicitud desde el portal.
exports.notificarSolicitudPortal = async (pool, tenantKey, { citaId, asignadoA, contactoNombre, tipo }) => {
  const destinatarios = new Set();
  if (asignadoA) destinatarios.add(asignadoA);
  try {
    for (const s of await getUsuariosParaNotificarCorreo('atencion-cliente', tenantKey)) destinatarios.add(s);
  } catch { /* best-effort */ }
  for (const uid of destinatarios) {
    try {
      await notificationService.createNotification({
        usuarioId: uid,
        mensaje: `${contactoNombre || 'Un cliente'} solicitó ${tipo === 'cancelar' ? 'cancelar' : 'reprogramar'} una cita`,
        tipo: 'cliente-cita-solicitud',
        dataExtra: { citaId },
        tenantKey,
      });
    } catch (e) {
      console.warn(`[CITA SOLICITUD][${tenantKey}] notif u${uid}:`, e.message);
    }
  }
};
