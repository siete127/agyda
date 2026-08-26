const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');

const ESTATUS_COLOR_VALIDOS = ['verde', 'azul', 'amarillo', 'naranja', 'rojo', 'negro', 'morado'];
const TIPOS_CONTACTO_VALIDOS = ['llamada', 'whatsapp', 'correo', 'reunion', 'visita', 'otro'];
const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta', 'urgente'];
const ESTATUS_TAREA_VALIDOS = ['pendiente', 'en_proceso', 'completada', 'cancelada'];

// Catálogo de tipos de actividad del punto 4 del flujo del documento.
const TIPOS_TAREA_VALIDOS = [
  'llamar_cliente', 'solicitar_documentacion', 'confirmar_recepcion_documentos',
  'dar_seguimiento_solicitud', 'recordar_fecha_pago', 'confirmar_pago',
  'renovacion_servicio', 'encuesta_satisfaccion', 'seguimiento_incidencia', 'otro',
];

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// ── Seguimientos (bitácora de contacto) ──────────────────────────────────

exports.listSeguimientos = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT SEG_ID as id, SEG_CONTACTO_ID as contactoId, SEG_TIPO_CONTACTO as tipoContacto,
               SEG_ESTATUS_COLOR as estatusColor, SEG_MOTIVO as motivo, SEG_NOTA as nota,
               SEG_ACUERDOS as acuerdos, CONVERT(NVARCHAR(10), SEG_PROXIMA_FECHA, 23) as proximaFecha,
               SEG_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as usuarioNombre, SEG_FECHA as fecha
        FROM CLI_SEGUIMIENTOS S
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = S.SEG_USUARIO_ID
        WHERE SEG_CONTACTO_ID = @id AND SEG_ACTIVO = 1
        ORDER BY SEG_FECHA DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listSeguimientos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createSeguimiento = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const { tipoContacto, estatusColor, motivo, nota, acuerdos, proximaFecha } = req.body || {};
    const tipo = TIPOS_CONTACTO_VALIDOS.includes(tipoContacto) ? tipoContacto : 'otro';
    const color = ESTATUS_COLOR_VALIDOS.includes(estatusColor) ? estatusColor : 'verde';

    const pool = await databaseService.getPool(req.user?.empresa);
    const contacto = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT TOP 1 CONT_ID FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
    if (!contacto.recordset.length) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    const ins = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .input('tipoContacto', sql.NVarChar(30), tipo)
      .input('estatusColor', sql.NVarChar(20), color)
      .input('motivo', sql.NVarChar(200), motivo || null)
      .input('nota', sql.NVarChar(sql.MAX), nota || null)
      .input('acuerdos', sql.NVarChar(sql.MAX), acuerdos || null)
      .input('proximaFecha', sql.Date, proximaFecha || null)
      .input('usuarioId', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_SEGUIMIENTOS (SEG_CONTACTO_ID, SEG_TIPO_CONTACTO, SEG_ESTATUS_COLOR, SEG_MOTIVO, SEG_NOTA, SEG_ACUERDOS, SEG_PROXIMA_FECHA, SEG_USUARIO_ID)
        OUTPUT INSERTED.SEG_ID
        VALUES (@contactoId, @tipoContacto, @estatusColor, @motivo, @nota, @acuerdos, @proximaFecha, @usuarioId)
      `);

    // El estatus del cliente en su ficha refleja siempre el último seguimiento registrado.
    await pool.request()
      .input('id', sql.Int, contactoId)
      .input('estatusColor', sql.NVarChar(20), color)
      .query(`UPDATE CRM_CONTACTOS SET CONT_ESTATUS_CLIENTE=@estatusColor WHERE CONT_ID=@id`);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-seguimiento-cliente',
      entidadId: contactoId, detalle: { tipoContacto: tipo, estatusColor: color }, ip: req.ip,
    });

    res.status(201).json({ success: true, data: { id: ins.recordset[0].SEG_ID } });
  } catch (e) {
    console.error('Error createSeguimiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Tareas ────────────────────────────────────────────────────────────────

exports.listTareasByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT TAR_ID as id, TAR_CONTACTO_ID as contactoId, TAR_TIPO as tipo, TAR_TITULO as titulo, TAR_DESCRIPCION as descripcion,
               TAR_PRIORIDAD as prioridad, TAR_ASIGNADO_A as asignadoA, U.NEUS_NOMBRES as asignadoNombre,
               TAR_FECHA_VENCIMIENTO as fechaVencimiento, TAR_ESTATUS as estatus,
               TAR_CREADO_POR as creadoPor, TAR_FECHA_CREACION as fechaCreacion, TAR_FECHA_COMPLETADA as fechaCompletada
        FROM CLI_TAREAS T
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = T.TAR_ASIGNADO_A
        WHERE TAR_CONTACTO_ID = @id AND TAR_ACTIVO = 1
        ORDER BY CASE WHEN TAR_ESTATUS = 'completada' THEN 1 ELSE 0 END, TAR_FECHA_VENCIMIENTO ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listTareasByContacto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listTareasMias = async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TAR_ID as id, TAR_CONTACTO_ID as contactoId, CONT_NOMBRE as contactoNombre, TAR_TIPO as tipo,
               TAR_TITULO as titulo, TAR_DESCRIPCION as descripcion, TAR_PRIORIDAD as prioridad,
               TAR_FECHA_VENCIMIENTO as fechaVencimiento, TAR_ESTATUS as estatus, TAR_FECHA_CREACION as fechaCreacion
        FROM CLI_TAREAS T
        INNER JOIN CRM_CONTACTOS C ON C.CONT_ID = T.TAR_CONTACTO_ID
        WHERE TAR_ASIGNADO_A = @userId AND TAR_ACTIVO = 1
        ORDER BY CASE WHEN TAR_ESTATUS = 'completada' THEN 1 ELSE 0 END, TAR_FECHA_VENCIMIENTO ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listTareasMias:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createTarea = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const { tipo, titulo, descripcion, prioridad, asignadoA, fechaVencimiento } = req.body || {};
    if (!titulo || !String(titulo).trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    const tipoTarea = TIPOS_TAREA_VALIDOS.includes(tipo) ? tipo : 'otro';
    const prio = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : 'media';
    const asignado = asignadoA ? parseInt(asignadoA, 10) : null;

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .input('tipo', sql.NVarChar(40), tipoTarea)
      .input('titulo', sql.NVarChar(200), String(titulo).trim())
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('prioridad', sql.NVarChar(20), prio)
      .input('asignadoA', sql.Int, asignado)
      .input('fechaVencimiento', sql.Date, fechaVencimiento || null)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_TAREAS (TAR_CONTACTO_ID, TAR_TIPO, TAR_TITULO, TAR_DESCRIPCION, TAR_PRIORIDAD, TAR_ASIGNADO_A, TAR_FECHA_VENCIMIENTO, TAR_CREADO_POR)
        OUTPUT INSERTED.TAR_ID
        VALUES (@contactoId, @tipo, @titulo, @descripcion, @prioridad, @asignadoA, @fechaVencimiento, @creadoPor)
      `);

    const tareaId = ins.recordset[0].TAR_ID;

    if (asignado) {
      await notificationService.createNotification({
        usuarioId: asignado,
        mensaje: `Nueva tarea asignada: ${String(titulo).trim()}`,
        tipo: 'cliente-tarea-asignada',
        dataExtra: { tareaId, contactoId },
        tenantKey: req.user?.empresa,
      });
    }

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-tarea-cliente',
      entidadId: tareaId, detalle: { contactoId, titulo, asignadoA: asignado }, ip: req.ip,
    });

    res.status(201).json({ success: true, data: { id: tareaId } });
  } catch (e) {
    console.error('Error createTarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTareaEstatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { estatus } = req.body || {};
    if (!ESTATUS_TAREA_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar(20), estatus)
      .input('fechaCompletada', sql.DateTime, estatus === 'completada' ? new Date() : null)
      .query(`
        UPDATE CLI_TAREAS SET TAR_ESTATUS=@estatus, TAR_FECHA_COMPLETADA=@fechaCompletada
        WHERE TAR_ID=@id AND TAR_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

    res.json({ success: true });
  } catch (e) {
    console.error('Error updateTareaEstatus:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteTarea = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE CLI_TAREAS SET TAR_ACTIVO=0 WHERE TAR_ID=@id AND TAR_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'eliminar-tarea-cliente', entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleteTarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Historial de comunicaciones (punto 8 del flujo) ─────────────────────────
// Línea de tiempo unificada: junta seguimientos, tareas, pagos, encuestas,
// incidencias, renovaciones y documentos en un solo listado cronológico —
// cada fuente ya tiene su propia pestaña con el detalle completo; esto es
// solo la vista combinada de "qué pasó y cuándo" con el cliente.
exports.getHistorial = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request().input('id', sql.Int, contactoId);

    const rs = await request.query(`
      SELECT 'seguimiento' as tipo, SEG_ID as id, SEG_FECHA as fecha,
             CONCAT('Contacto (', SEG_TIPO_CONTACTO, ')') as titulo, SEG_NOTA as detalle,
             SEG_ESTATUS_COLOR as color, SEG_USUARIO_ID as usuarioId
      FROM CLI_SEGUIMIENTOS WHERE SEG_CONTACTO_ID=@id AND SEG_ACTIVO=1

      UNION ALL
      SELECT 'tarea', TAR_ID, TAR_FECHA_CREACION, CONCAT('Tarea: ', TAR_TITULO),
             CONCAT('Prioridad ', TAR_PRIORIDAD, ' — ', TAR_ESTATUS, ' (', TAR_TIPO, ')'), NULL, TAR_CREADO_POR
      FROM CLI_TAREAS WHERE TAR_CONTACTO_ID=@id AND TAR_ACTIVO=1

      UNION ALL
      SELECT 'pago', REC_ID, REC_FECHA_CREACION, CONCAT('Recordatorio de pago: ', REC_CONCEPTO),
             CONCAT('$', CAST(REC_MONTO AS NVARCHAR(20)), ' — ', REC_ESTATUS), NULL, REC_CREADO_POR
      FROM CRM_RECORDATORIOS_PAGO WHERE REC_CONTACTO_ID=@id AND REC_ACTIVO=1

      UNION ALL
      SELECT 'encuesta', CES_ID, CES_FECHA_ENVIO, 'Encuesta de satisfacción enviada',
             ISNULL(CES_CLASIFICACION, 'sin responder'), NULL, CES_ENVIADO_POR
      FROM CRM_ENCUESTAS_ENVIADAS WHERE CES_CONTACTO_ID=@id

      UNION ALL
      SELECT 'incidencia', INC_ID, INC_FECHA_CREACION, CONCAT('Incidencia ', INC_FOLIO, ': ', INC_TITULO),
             CONCAT('Prioridad ', INC_PRIORIDAD, ' — ', INC_ESTATUS), NULL, INC_CREADO_POR
      FROM CLI_INCIDENCIAS WHERE INC_CONTACTO_ID=@id AND INC_ACTIVO=1

      UNION ALL
      SELECT 'renovacion', FEC_ID, FEC_FECHA_CREACION, CONCAT('Fecha importante: ', FEC_DESCRIPCION),
             CONCAT(FEC_TIPO, ' — ', CONVERT(NVARCHAR(10), FEC_FECHA, 23)), NULL, FEC_CREADO_POR
      FROM CLI_FECHAS_IMPORTANTES WHERE FEC_CONTACTO_ID=@id AND FEC_ACTIVO=1

      UNION ALL
      SELECT 'documento', DOC_ID, DOC_FECHA_SUBIDA, CONCAT('Documento subido: ', DOC_NOMBRE_ORIGINAL),
             ISNULL(DOC_CATEGORIA, 'sin categoría'), NULL, DOC_SUBIDO_POR
      FROM CRM_DOCUMENTOS_CLIENTE WHERE DOC_CONTACTO_ID=@id AND DOC_ACTIVO=1

      ORDER BY fecha DESC
    `);

    const usuarioIds = [...new Set(rs.recordset.map((r) => r.usuarioId).filter(Boolean))];
    let nombresPorId = new Map();
    if (usuarioIds.length) {
      const usuariosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${usuarioIds.join(',')})`);
      nombresPorId = new Map(usuariosRs.recordset.map((u) => [u.id, u.nombre]));
    }

    const data = rs.recordset.map((r) => ({ ...r, usuarioNombre: r.usuarioId ? (nombresPorId.get(r.usuarioId) ?? null) : null }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error getHistorial:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Automatización 1 (alta de cliente): tarea de bienvenida + primer registro de
// seguimiento — se llama desde crmContactosController.altaCliente cuando el
// alta trae un responsable asignado. No expone ruta propia.
exports.registrarAltaAutomatica = async (pool, { contactoId, responsableId, userId, tenantKey }) => {
  try {
    await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .input('tipoContacto', sql.NVarChar(30), 'otro')
      .input('estatusColor', sql.NVarChar(20), 'verde')
      .input('nota', sql.NVarChar(sql.MAX), 'Cliente dado de alta')
      .input('usuarioId', sql.Int, userId)
      .query(`
        INSERT INTO CLI_SEGUIMIENTOS (SEG_CONTACTO_ID, SEG_TIPO_CONTACTO, SEG_ESTATUS_COLOR, SEG_NOTA, SEG_USUARIO_ID)
        VALUES (@contactoId, @tipoContacto, @estatusColor, @nota, @usuarioId)
      `);

    if (responsableId) {
      await pool.request()
        .input('contactoId', sql.Int, contactoId)
        .input('titulo', sql.NVarChar(200), 'Contacto de bienvenida')
        .input('tipo', sql.NVarChar(40), 'llamar_cliente')
        .input('asignadoA', sql.Int, responsableId)
        .input('creadoPor', sql.Int, userId)
        .query(`
          INSERT INTO CLI_TAREAS (TAR_CONTACTO_ID, TAR_TITULO, TAR_TIPO, TAR_PRIORIDAD, TAR_ASIGNADO_A, TAR_CREADO_POR)
          VALUES (@contactoId, @titulo, @tipo, 'alta', @asignadoA, @creadoPor)
        `);

      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: 'Se te asignó un nuevo cliente',
        tipo: 'cliente-nuevo-asignado',
        dataExtra: { contactoId },
        tenantKey,
      });
    }
  } catch (e) {
    console.error('Error registrarAltaAutomatica:', e);
    // best-effort: no debe tumbar la respuesta del alta de cliente
  }
};
