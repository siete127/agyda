const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { DISENO_ADJUNTOS_DIR } = require('../middleware/disenoAdjuntoUpload');

const MODULO_AUDIT = 'diseno';
const ESTATUS_VALIDOS = ['pendiente', 'en_proceso', 'revision', 'entregado', 'cancelada'];
const PRIORIDADES_VALIDAS = ['baja', 'normal', 'alta', 'urgente'];
const TIPOS_ADJUNTO_VALIDOS = ['referencia', 'entregable'];

// ── Tipos de solicitud ───────────────────────────────────────────────────
async function listTipos(req, res) {
  try {
    const soloActivos = req.query.soloActivos !== 'false';
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT DZT_ID as id, DZT_NOMBRE as nombre, DZT_DESCRIPCION as descripcion, DZT_ICONO as icono, DZT_COLOR as color,
             DZT_ACTIVO as activo, DZT_ORDEN as orden
      FROM MARKETING_DISENO_TIPOS
      ${soloActivos ? 'WHERE DZT_ACTIVO = 1' : ''}
      ORDER BY DZT_ORDEN, DZT_NOMBRE
    `);
    res.json({ success: true, data: rs.recordset.map((t) => ({ ...t, activo: !!t.activo })) });
  } catch (err) {
    logger.error('disenoController.listTipos', err);
    res.status(500).json({ success: false, message: 'Error al obtener tipos de solicitud' });
  }
}

async function crearTipo(req, res) {
  try {
    const { nombre, descripcion, icono, color, orden } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('icono', sql.NVarChar, icono || null)
      .input('color', sql.NVarChar, color || null)
      .input('orden', sql.Int, orden || 0)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO MARKETING_DISENO_TIPOS (DZT_NOMBRE, DZT_DESCRIPCION, DZT_ICONO, DZT_COLOR, DZT_ORDEN, DZT_CREATED_BY)
        OUTPUT INSERTED.DZT_ID as id
        VALUES (@nombre, @descripcion, @icono, @color, @orden, @createdBy);
      `);
    const id = rs.recordset[0].id;
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-tipo',
      entidadId: id, detalle: { nombre }, ip: req.ip,
    });
    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('disenoController.crearTipo', err);
    res.status(500).json({ success: false, message: 'Error al crear tipo de solicitud' });
  }
}

async function actualizarTipo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, icono, color, activo, orden } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('icono', sql.NVarChar, icono || null)
      .input('color', sql.NVarChar, color || null)
      .input('activo', sql.Bit, activo === false ? 0 : 1)
      .input('orden', sql.Int, orden || 0)
      .query(`
        UPDATE MARKETING_DISENO_TIPOS
        SET DZT_NOMBRE=@nombre, DZT_DESCRIPCION=@descripcion, DZT_ICONO=@icono, DZT_COLOR=@color,
            DZT_ACTIVO=@activo, DZT_ORDEN=@orden, DZT_UPDATED_AT=GETDATE()
        WHERE DZT_ID=@id
      `);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-tipo',
      entidadId: id, detalle: { nombre, activo }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.actualizarTipo', err);
    res.status(500).json({ success: false, message: 'Error al actualizar tipo de solicitud' });
  }
}

async function eliminarTipo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const activasRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as total FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_TIPO_ID=@id AND DZS_ESTATUS IN ('pendiente','en_proceso','revision')`);
    if (activasRs.recordset[0].total > 0) {
      return res.status(400).json({ success: false, message: 'Hay solicitudes activas con este tipo, resuélvelas primero' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE MARKETING_DISENO_TIPOS SET DZT_ACTIVO=0, DZT_UPDATED_AT=GETDATE() WHERE DZT_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-tipo',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.eliminarTipo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar tipo de solicitud' });
  }
}

// ── Solicitudes ──────────────────────────────────────────────────────────
const SELECT_SOLICITUD_BASE = `
  SELECT DZS.DZS_ID as id, DZS.DZS_TIPO_ID as tipoId, DZT.DZT_NOMBRE as tipoNombre, DZT.DZT_ICONO as tipoIcono, DZT.DZT_COLOR as tipoColor,
         DZS.DZS_TITULO as titulo, DZS.DZS_DESCRIPCION as descripcion,
         DZS.DZS_SOLICITANTE_ID as solicitanteId, SU.NEUS_NOMBRES as solicitanteNombre,
         DZS.DZS_ASIGNADO_ID as asignadoId, AU.NEUS_NOMBRES as asignadoNombre,
         DZS.DZS_ESTATUS as estatus, DZS.DZS_PRIORIDAD as prioridad, DZS.DZS_MOTIVO_RESOLUCION as motivoResolucion,
         DZS.DZS_FECHA_LIMITE as fechaLimite, DZS.DZS_RESUELTA_POR as resueltaPor, DZS.DZS_RESUELTA_AT as resueltaAt,
         DZS.DZS_CREATED_AT as createdAt, DZS.DZS_UPDATED_AT as updatedAt
  FROM MARKETING_DISENO_SOLICITUDES DZS
  INNER JOIN MARKETING_DISENO_TIPOS DZT ON DZT.DZT_ID = DZS.DZS_TIPO_ID
  LEFT JOIN NEUS_USUARIOS SU ON SU.NEUS_ID = DZS.DZS_SOLICITANTE_ID
  LEFT JOIN NEUS_USUARIOS AU ON AU.NEUS_ID = DZS.DZS_ASIGNADO_ID
`;

async function listSolicitudes(req, res) {
  try {
    const { bandeja = 'todas', estatus, tipoId, q } = req.query;
    const uid = req.user?.id || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const where = [];

    if (bandeja === 'disponibles') {
      where.push(`DZS.DZS_ESTATUS = 'pendiente'`);
    } else if (bandeja === 'mias') {
      request.input('uid', sql.Int, uid);
      where.push('DZS.DZS_SOLICITANTE_ID = @uid');
    } else if (bandeja === 'asignadas') {
      request.input('uid', sql.Int, uid);
      where.push('DZS.DZS_ASIGNADO_ID = @uid');
    }

    if (estatus && ESTATUS_VALIDOS.includes(estatus)) {
      request.input('estatus', sql.NVarChar, estatus);
      where.push('DZS.DZS_ESTATUS = @estatus');
    }
    if (tipoId) {
      request.input('tipoId', sql.Int, tipoId);
      where.push('DZS.DZS_TIPO_ID = @tipoId');
    }
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where.push('DZS.DZS_TITULO LIKE @q');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rs = await request.query(`${SELECT_SOLICITUD_BASE} ${whereSql} ORDER BY DZS.DZS_CREATED_AT DESC`);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('disenoController.listSolicitudes', err);
    res.status(500).json({ success: false, message: 'Error al obtener solicitudes' });
  }
}

async function getResumen(req, res) {
  try {
    const uid = req.user?.id || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('uid', sql.Int, uid)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ESTATUS='pendiente') as disponibles,
          (SELECT COUNT(*) FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ASIGNADO_ID=@uid AND DZS_ESTATUS='en_proceso') as misEnProceso,
          (SELECT COUNT(*) FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ESTATUS='revision') as enRevision,
          (SELECT COUNT(*) FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ESTATUS='entregado' AND MONTH(DZS_RESUELTA_AT)=MONTH(GETDATE()) AND YEAR(DZS_RESUELTA_AT)=YEAR(GETDATE())) as entregadasMes
      `);
    res.json({ success: true, data: rs.recordset[0] });
  } catch (err) {
    logger.error('disenoController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function getSolicitud(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`${SELECT_SOLICITUD_BASE} WHERE DZS.DZS_ID=@id`);
    const solicitud = rs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    res.json({ success: true, data: solicitud });
  } catch (err) {
    logger.error('disenoController.getSolicitud', err);
    res.status(500).json({ success: false, message: 'Error al obtener solicitud' });
  }
}

async function crearSolicitud(req, res) {
  try {
    const { tipoId, titulo, descripcion, prioridad, fechaLimite } = req.body;
    if (!tipoId) return res.status(400).json({ success: false, message: 'Tipo de solicitud requerido' });
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tipoRs = await pool.request().input('tipoId', sql.Int, tipoId)
      .query(`SELECT DZT_NOMBRE as nombre, DZT_ACTIVO as activo FROM MARKETING_DISENO_TIPOS WHERE DZT_ID=@tipoId`);
    const tipo = tipoRs.recordset[0];
    if (!tipo || !tipo.activo) return res.status(400).json({ success: false, message: 'Tipo de solicitud inválido' });

    const solicitanteId = req.user?.id || null;
    const prioridadFinal = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : 'normal';

    const rs = await pool.request()
      .input('tipoId', sql.Int, tipoId)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('solicitanteId', sql.Int, solicitanteId)
      .input('prioridad', sql.NVarChar, prioridadFinal)
      .input('fechaLimite', sql.Date, fechaLimite || null)
      .query(`
        INSERT INTO MARKETING_DISENO_SOLICITUDES (DZS_TIPO_ID, DZS_TITULO, DZS_DESCRIPCION, DZS_SOLICITANTE_ID, DZS_PRIORIDAD, DZS_FECHA_LIMITE)
        OUTPUT INSERTED.DZS_ID as id
        VALUES (@tipoId, @titulo, @descripcion, @solicitanteId, @prioridad, @fechaLimite);
      `);
    const id = rs.recordset[0].id;

    await logAudit(pool, {
      userId: solicitanteId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-solicitud',
      entidadId: id, detalle: { titulo, tipoId }, ip: req.ip,
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('disenoController.crearSolicitud', err);
    res.status(500).json({ success: false, message: 'Error al crear solicitud' });
  }
}

async function tomarSolicitud(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZS_ESTATUS as estatus, DZS_TITULO as titulo, DZS_SOLICITANTE_ID as solicitanteId FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
    const solicitud = rs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (solicitud.estatus !== 'pendiente') {
      return res.status(400).json({ success: false, message: 'Solo se pueden tomar solicitudes pendientes' });
    }

    const asignadoId = req.user?.id || null;
    await pool.request()
      .input('id', sql.Int, id)
      .input('asignadoId', sql.Int, asignadoId)
      .query(`UPDATE MARKETING_DISENO_SOLICITUDES SET DZS_ASIGNADO_ID=@asignadoId, DZS_ESTATUS='en_proceso', DZS_UPDATED_AT=GETDATE() WHERE DZS_ID=@id`);

    await logAudit(pool, {
      userId: asignadoId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'tomar-solicitud',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.tomarSolicitud', err);
    res.status(500).json({ success: false, message: 'Error al tomar solicitud' });
  }
}

async function enviarARevision(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZS_ESTATUS as estatus, DZS_ASIGNADO_ID as asignadoId, DZS_TITULO as titulo, DZS_SOLICITANTE_ID as solicitanteId FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
    const solicitud = rs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (solicitud.asignadoId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo quien tiene asignada la solicitud puede enviarla a revisión' });
    }
    if (solicitud.estatus !== 'en_proceso') {
      return res.status(400).json({ success: false, message: 'Solo se pueden enviar a revisión solicitudes en proceso' });
    }

    const entregableRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as total FROM MARKETING_DISENO_ADJUNTOS WHERE DZA_SOLICITUD_ID=@id AND DZA_TIPO='entregable'`);
    if (entregableRs.recordset[0].total === 0) {
      return res.status(400).json({ success: false, message: 'Sube al menos un entregable antes de enviar a revisión' });
    }

    await pool.request().input('id', sql.Int, id)
      .query(`UPDATE MARKETING_DISENO_SOLICITUDES SET DZS_ESTATUS='revision', DZS_UPDATED_AT=GETDATE() WHERE DZS_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'enviar-revision',
      entidadId: id, detalle: null, ip: req.ip,
    });

    try {
      await notificationService.createNotification({
        usuarioId: solicitud.solicitanteId,
        mensaje: `Tu solicitud "${solicitud.titulo}" tiene un entregable listo para revisión`,
        tipo: 'diseno_revision',
        dataExtra: { solicitudId: id },
        tenantKey: req.user?.empresa,
      });
    } catch (notifyErr) {
      logger.warn('disenoController.enviarARevision notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.enviarARevision', err);
    res.status(500).json({ success: false, message: 'Error al enviar a revisión' });
  }
}

async function aprobarEntrega(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZS_ESTATUS as estatus, DZS_SOLICITANTE_ID as solicitanteId, DZS_TITULO as titulo, DZS_ASIGNADO_ID as asignadoId FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
    const solicitud = rs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (solicitud.solicitanteId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede aprobar la entrega' });
    }
    if (solicitud.estatus !== 'revision') {
      return res.status(400).json({ success: false, message: 'Solo se pueden aprobar solicitudes en revisión' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('resueltaPor', sql.Int, req.user?.id || null)
      .query(`UPDATE MARKETING_DISENO_SOLICITUDES SET DZS_ESTATUS='entregado', DZS_RESUELTA_POR=@resueltaPor, DZS_RESUELTA_AT=GETDATE(), DZS_UPDATED_AT=GETDATE() WHERE DZS_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'aprobar-entrega',
      entidadId: id, detalle: null, ip: req.ip,
    });

    try {
      if (solicitud.asignadoId) {
        await notificationService.createNotification({
          usuarioId: solicitud.asignadoId,
          mensaje: `Tu entrega de "${solicitud.titulo}" fue aprobada`,
          tipo: 'diseno_entregado',
          dataExtra: { solicitudId: id },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (notifyErr) {
      logger.warn('disenoController.aprobarEntrega notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.aprobarEntrega', err);
    res.status(500).json({ success: false, message: 'Error al aprobar entrega' });
  }
}

async function solicitarCambios(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo || !motivo.trim()) return res.status(400).json({ success: false, message: 'El motivo es requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZS_ESTATUS as estatus, DZS_SOLICITANTE_ID as solicitanteId, DZS_TITULO as titulo, DZS_ASIGNADO_ID as asignadoId FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
    const solicitud = rs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (solicitud.solicitanteId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede pedir cambios' });
    }
    if (solicitud.estatus !== 'revision') {
      return res.status(400).json({ success: false, message: 'Solo se pueden pedir cambios en solicitudes en revisión' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('motivo', sql.NVarChar, motivo.trim())
      .query(`UPDATE MARKETING_DISENO_SOLICITUDES SET DZS_ESTATUS='en_proceso', DZS_MOTIVO_RESOLUCION=@motivo, DZS_UPDATED_AT=GETDATE() WHERE DZS_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'solicitar-cambios',
      entidadId: id, detalle: { motivo: motivo.trim() }, ip: req.ip,
    });

    try {
      if (solicitud.asignadoId) {
        await notificationService.createNotification({
          usuarioId: solicitud.asignadoId,
          mensaje: `Se solicitaron cambios en "${solicitud.titulo}"`,
          tipo: 'diseno_cambios',
          dataExtra: { solicitudId: id },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (notifyErr) {
      logger.warn('disenoController.solicitarCambios notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.solicitarCambios', err);
    res.status(500).json({ success: false, message: 'Error al solicitar cambios' });
  }
}

async function cancelarSolicitud(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZS_SOLICITANTE_ID as solicitanteId, DZS_ESTATUS as estatus FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
    const solicitud = rs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (solicitud.solicitanteId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede cancelar esta solicitud' });
    }
    if (solicitud.estatus !== 'pendiente') {
      return res.status(400).json({ success: false, message: 'Solo se pueden cancelar solicitudes pendientes' });
    }
    await pool.request()
      .input('id', sql.Int, id)
      .input('resueltaPor', sql.Int, req.user?.id || null)
      .query(`UPDATE MARKETING_DISENO_SOLICITUDES SET DZS_ESTATUS='cancelada', DZS_RESUELTA_POR=@resueltaPor, DZS_RESUELTA_AT=GETDATE(), DZS_UPDATED_AT=GETDATE() WHERE DZS_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'cancelar-solicitud',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.cancelarSolicitud', err);
    res.status(500).json({ success: false, message: 'Error al cancelar solicitud' });
  }
}

// ── Comentarios ──────────────────────────────────────────────────────────
async function listComentarios(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('solicitudId', sql.Int, id)
      .query(`
        SELECT DZC.DZC_ID as id, DZC.DZC_SOLICITUD_ID as solicitudId, DZC.DZC_USUARIO_ID as usuarioId,
               U.NEUS_NOMBRES as autorNombre, DZC.DZC_TEXTO as texto, DZC.DZC_CREATED_AT as createdAt
        FROM MARKETING_DISENO_COMENTARIOS DZC
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = DZC.DZC_USUARIO_ID
        WHERE DZC.DZC_SOLICITUD_ID=@solicitudId
        ORDER BY DZC.DZC_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('disenoController.listComentarios', err);
    res.status(500).json({ success: false, message: 'Error al obtener comentarios' });
  }
}

async function crearComentario(req, res) {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'Texto requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const rs = await pool.request()
      .input('solicitudId', sql.Int, id)
      .input('usuarioId', sql.Int, usuarioId)
      .input('texto', sql.NVarChar, texto.trim())
      .query(`
        INSERT INTO MARKETING_DISENO_COMENTARIOS (DZC_SOLICITUD_ID, DZC_USUARIO_ID, DZC_TEXTO)
        OUTPUT INSERTED.DZC_ID as id
        VALUES (@solicitudId, @usuarioId, @texto);
      `);

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'comentar-solicitud',
      entidadId: id, detalle: { comentarioId: rs.recordset[0].id }, ip: req.ip,
    });

    try {
      const solicitudRs = await pool.request().input('id', sql.Int, id)
        .query(`SELECT DZS_TITULO as titulo, DZS_SOLICITANTE_ID as solicitanteId, DZS_ASIGNADO_ID as asignadoId FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
      const solicitud = solicitudRs.recordset[0];
      if (solicitud) {
        const destinatarios = new Set([solicitud.solicitanteId, solicitud.asignadoId].filter(Boolean));
        destinatarios.delete(usuarioId);
        for (const destinatarioId of destinatarios) {
          await notificationService.createNotification({
            usuarioId: destinatarioId,
            mensaje: `Nuevo comentario en "${solicitud.titulo}"`,
            tipo: 'diseno_comentario',
            dataExtra: { solicitudId: id },
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (notifyErr) {
      logger.warn('disenoController.crearComentario notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('disenoController.crearComentario', err);
    res.status(500).json({ success: false, message: 'Error al crear comentario' });
  }
}

async function eliminarComentario(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZC_USUARIO_ID as usuarioId FROM MARKETING_DISENO_COMENTARIOS WHERE DZC_ID=@id`);
    const comentario = rs.recordset[0];
    if (!comentario) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    if (comentario.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propios comentarios' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_DISENO_COMENTARIOS WHERE DZC_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.eliminarComentario', err);
    res.status(500).json({ success: false, message: 'Error al eliminar comentario' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('solicitudId', sql.Int, id)
      .query(`
        SELECT DZA.DZA_ID as id, DZA.DZA_SOLICITUD_ID as solicitudId, DZA.DZA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               DZA.DZA_TIPO as tipo, DZA.DZA_NOMBRE_ORIGINAL as nombreOriginal, DZA.DZA_MIME as mime, DZA.DZA_TAMANIO as tamanio, DZA.DZA_CREATED_AT as createdAt
        FROM MARKETING_DISENO_ADJUNTOS DZA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = DZA.DZA_USUARIO_ID
        WHERE DZA.DZA_SOLICITUD_ID=@solicitudId
        ORDER BY DZA.DZA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('disenoController.listAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntos(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    }
    const tipo = TIPOS_ADJUNTO_VALIDOS.includes(req.body.tipo) ? req.body.tipo : 'referencia';
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const solicitudRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZS_SOLICITANTE_ID as solicitanteId, DZS_ASIGNADO_ID as asignadoId FROM MARKETING_DISENO_SOLICITUDES WHERE DZS_ID=@id`);
    const solicitud = solicitudRs.recordset[0];
    if (!solicitud) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (solicitud.solicitanteId !== usuarioId && solicitud.asignadoId !== usuarioId) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante o el asignado pueden adjuntar archivos' });
    }

    for (const file of req.files) {
      await pool.request()
        .input('solicitudId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('tipo', sql.NVarChar, tipo)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO MARKETING_DISENO_ADJUNTOS (DZA_SOLICITUD_ID, DZA_USUARIO_ID, DZA_TIPO, DZA_NOMBRE_ARCHIVO, DZA_NOMBRE_ORIGINAL, DZA_MIME, DZA_TAMANIO)
          VALUES (@solicitudId, @usuarioId, @tipo, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'subir-adjunto',
      entidadId: id, detalle: { cantidad: req.files.length, tipo }, ip: req.ip,
    });

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('disenoController.subirAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`
        SELECT DZA.DZA_USUARIO_ID as usuarioId, DZA.DZA_NOMBRE_ARCHIVO as nombreArchivo, DZS.DZS_SOLICITANTE_ID as solicitanteId
        FROM MARKETING_DISENO_ADJUNTOS DZA
        INNER JOIN MARKETING_DISENO_SOLICITUDES DZS ON DZS.DZS_ID = DZA.DZA_SOLICITUD_ID
        WHERE DZA.DZA_ID=@id
      `);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    if (adjunto.usuarioId !== req.user?.id && adjunto.solicitanteId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo quien subió el archivo o el solicitante pueden eliminarlo' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_DISENO_ADJUNTOS WHERE DZA_ID=@id`);

    try {
      const filePath = path.join(DISENO_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('disenoController.eliminarAdjunto fs', fsErr?.message || fsErr);
    }

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-adjunto',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('disenoController.eliminarAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DZA_NOMBRE_ARCHIVO as nombreArchivo, DZA_NOMBRE_ORIGINAL as nombreOriginal FROM MARKETING_DISENO_ADJUNTOS WHERE DZA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(DISENO_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('disenoController.verAdjunto stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('disenoController.verAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

module.exports = {
  listTipos,
  crearTipo,
  actualizarTipo,
  eliminarTipo,
  listSolicitudes,
  getResumen,
  getSolicitud,
  crearSolicitud,
  tomarSolicitud,
  enviarARevision,
  aprobarEntrega,
  solicitarCambios,
  cancelarSolicitud,
  listComentarios,
  crearComentario,
  eliminarComentario,
  listAdjuntos,
  subirAdjuntos,
  eliminarAdjunto,
  verAdjunto,
};
