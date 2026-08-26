const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const emailService = require('../services/emailService');
const { DECISION_ADJUNTOS_DIR } = require('../middleware/decisionAdjuntoUpload');

const AREA_KEY = 'direccion-general';
const MODULO_AUDIT = 'toma-decisiones';
const DIAS_PENDIENTE_ALERTA = 2;
const ESTATUS_VALIDOS = ['pendiente', 'aprobada', 'rechazada', 'cancelada'];
const PRIORIDADES_VALIDAS = ['baja', 'normal', 'alta', 'urgente'];

// ── Tipos de decisión ───────────────────────────────────────────────────
async function listTipos(req, res) {
  try {
    const soloActivos = req.query.soloActivos !== 'false';
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT DT_ID as id, DT_NOMBRE as nombre, DT_DESCRIPCION as descripcion, DT_ICONO as icono, DT_COLOR as color,
             DT_APROBADOR_DEFAULT_ID as aprobadorDefaultId, DT_REQUIERE_ADJUNTO as requiereAdjunto,
             DT_ACTIVO as activo, DT_ORDEN as orden
      FROM AREA_DECISION_TIPOS
      ${soloActivos ? 'WHERE DT_ACTIVO = 1' : ''}
      ORDER BY DT_ORDEN, DT_NOMBRE
    `);
    res.json({ success: true, data: rs.recordset.map((t) => ({ ...t, requiereAdjunto: !!t.requiereAdjunto, activo: !!t.activo })) });
  } catch (err) {
    logger.error('decisionesController.listTipos', err);
    res.status(500).json({ success: false, message: 'Error al obtener tipos de decisión' });
  }
}

async function crearTipo(req, res) {
  try {
    const { nombre, descripcion, icono, color, aprobadorDefaultId, requiereAdjunto, orden } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('icono', sql.NVarChar, icono || null)
      .input('color', sql.NVarChar, color || null)
      .input('aprobadorDefaultId', sql.Int, aprobadorDefaultId || null)
      .input('requiereAdjunto', sql.Bit, requiereAdjunto ? 1 : 0)
      .input('orden', sql.Int, orden || 0)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO AREA_DECISION_TIPOS (DT_NOMBRE, DT_DESCRIPCION, DT_ICONO, DT_COLOR, DT_APROBADOR_DEFAULT_ID, DT_REQUIERE_ADJUNTO, DT_ORDEN, DT_CREATED_BY)
        OUTPUT INSERTED.DT_ID as id
        VALUES (@nombre, @descripcion, @icono, @color, @aprobadorDefaultId, @requiereAdjunto, @orden, @createdBy);
      `);
    const id = rs.recordset[0].id;
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-tipo',
      entidadId: id, detalle: { nombre }, ip: req.ip,
    });
    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('decisionesController.crearTipo', err);
    res.status(500).json({ success: false, message: 'Error al crear tipo de decisión' });
  }
}

async function actualizarTipo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, icono, color, aprobadorDefaultId, requiereAdjunto, activo, orden } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('icono', sql.NVarChar, icono || null)
      .input('color', sql.NVarChar, color || null)
      .input('aprobadorDefaultId', sql.Int, aprobadorDefaultId || null)
      .input('requiereAdjunto', sql.Bit, requiereAdjunto ? 1 : 0)
      .input('activo', sql.Bit, activo === false ? 0 : 1)
      .input('orden', sql.Int, orden || 0)
      .query(`
        UPDATE AREA_DECISION_TIPOS
        SET DT_NOMBRE=@nombre, DT_DESCRIPCION=@descripcion, DT_ICONO=@icono, DT_COLOR=@color,
            DT_APROBADOR_DEFAULT_ID=@aprobadorDefaultId, DT_REQUIERE_ADJUNTO=@requiereAdjunto,
            DT_ACTIVO=@activo, DT_ORDEN=@orden, DT_UPDATED_AT=GETDATE()
        WHERE DT_ID=@id
      `);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-tipo',
      entidadId: id, detalle: { nombre, activo }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.actualizarTipo', err);
    res.status(500).json({ success: false, message: 'Error al actualizar tipo de decisión' });
  }
}

async function eliminarTipo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const pendientesRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as total FROM AREA_DECISIONES WHERE DE_TIPO_ID=@id AND DE_ESTATUS='pendiente'`);
    if (pendientesRs.recordset[0].total > 0) {
      return res.status(400).json({ success: false, message: 'Hay solicitudes pendientes con este tipo, resuélvelas primero' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE AREA_DECISION_TIPOS SET DT_ACTIVO=0, DT_UPDATED_AT=GETDATE() WHERE DT_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-tipo',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.eliminarTipo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar tipo de decisión' });
  }
}

// ── Solicitudes ──────────────────────────────────────────────────────────
const SELECT_DECISION_BASE = `
  SELECT DE.DE_ID as id, DE.DE_TIPO_ID as tipoId, DT.DT_NOMBRE as tipoNombre, DT.DT_ICONO as tipoIcono, DT.DT_COLOR as tipoColor,
         DE.DE_TITULO as titulo, DE.DE_DESCRIPCION as descripcion,
         DE.DE_SOLICITANTE_ID as solicitanteId, SU.NEUS_NOMBRES as solicitanteNombre,
         DE.DE_APROBADOR_ID as aprobadorId, AU.NEUS_NOMBRES as aprobadorNombre,
         DE.DE_ESTATUS as estatus, DE.DE_PRIORIDAD as prioridad, DE.DE_MOTIVO_RESOLUCION as motivoResolucion,
         DE.DE_FECHA_LIMITE as fechaLimite, DE.DE_RESUELTA_POR as resueltaPor, DE.DE_RESUELTA_AT as resueltaAt,
         DE.DE_CREATED_AT as createdAt, DE.DE_UPDATED_AT as updatedAt
  FROM AREA_DECISIONES DE
  INNER JOIN AREA_DECISION_TIPOS DT ON DT.DT_ID = DE.DE_TIPO_ID
  LEFT JOIN NEUS_USUARIOS SU ON SU.NEUS_ID = DE.DE_SOLICITANTE_ID
  LEFT JOIN NEUS_USUARIOS AU ON AU.NEUS_ID = DE.DE_APROBADOR_ID
`;

async function listDecisiones(req, res) {
  try {
    const { bandeja = 'todas', estatus, tipoId, desde, hasta, q } = req.query;
    const uid = req.user?.id || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const where = [];

    if (bandeja === 'mias') {
      request.input('uid', sql.Int, uid);
      where.push('DE.DE_SOLICITANTE_ID = @uid');
    } else if (bandeja === 'por-aprobar') {
      request.input('uid', sql.Int, uid);
      where.push('DE.DE_APROBADOR_ID = @uid');
    }

    if (estatus && ESTATUS_VALIDOS.includes(estatus)) {
      request.input('estatus', sql.NVarChar, estatus);
      where.push('DE.DE_ESTATUS = @estatus');
    }
    if (tipoId) {
      request.input('tipoId', sql.Int, tipoId);
      where.push('DE.DE_TIPO_ID = @tipoId');
    }
    if (desde) {
      request.input('desde', sql.DateTime, new Date(desde));
      where.push('DE.DE_CREATED_AT >= @desde');
    }
    if (hasta) {
      request.input('hasta', sql.DateTime, new Date(hasta));
      where.push('DE.DE_CREATED_AT <= @hasta');
    }
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where.push('DE.DE_TITULO LIKE @q');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rs = await request.query(`${SELECT_DECISION_BASE} ${whereSql} ORDER BY DE.DE_CREATED_AT DESC`);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('decisionesController.listDecisiones', err);
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
          (SELECT COUNT(*) FROM AREA_DECISIONES WHERE DE_APROBADOR_ID=@uid AND DE_ESTATUS='pendiente') as pendientesPorAprobar,
          (SELECT COUNT(*) FROM AREA_DECISIONES WHERE DE_SOLICITANTE_ID=@uid AND DE_ESTATUS='pendiente') as misPendientes,
          (SELECT COUNT(*) FROM AREA_DECISIONES WHERE DE_ESTATUS IN ('aprobada','rechazada') AND MONTH(DE_RESUELTA_AT)=MONTH(GETDATE()) AND YEAR(DE_RESUELTA_AT)=YEAR(GETDATE())) as resueltasMes,
          (SELECT COUNT(*) FROM AREA_DECISIONES WHERE DE_ESTATUS='pendiente') as totalActivas
      `);
    res.json({ success: true, data: rs.recordset[0] });
  } catch (err) {
    logger.error('decisionesController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function getDecision(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`${SELECT_DECISION_BASE} WHERE DE.DE_ID=@id`);
    const decision = rs.recordset[0];
    if (!decision) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    res.json({ success: true, data: decision });
  } catch (err) {
    logger.error('decisionesController.getDecision', err);
    res.status(500).json({ success: false, message: 'Error al obtener solicitud' });
  }
}

async function crearDecision(req, res) {
  try {
    const { tipoId, titulo, descripcion, aprobadorId, prioridad, fechaLimite } = req.body;
    if (!tipoId) return res.status(400).json({ success: false, message: 'Tipo de decisión requerido' });
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tipoRs = await pool.request().input('tipoId', sql.Int, tipoId)
      .query(`SELECT DT_NOMBRE as nombre, DT_APROBADOR_DEFAULT_ID as aprobadorDefaultId, DT_ACTIVO as activo FROM AREA_DECISION_TIPOS WHERE DT_ID=@tipoId`);
    const tipo = tipoRs.recordset[0];
    if (!tipo || !tipo.activo) return res.status(400).json({ success: false, message: 'Tipo de decisión inválido' });

    const aprobadorFinal = aprobadorId || tipo.aprobadorDefaultId;
    if (!aprobadorFinal) return res.status(400).json({ success: false, message: 'Selecciona un aprobador' });

    const solicitanteId = req.user?.id || null;
    const prioridadFinal = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : 'normal';

    const rs = await pool.request()
      .input('tipoId', sql.Int, tipoId)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('solicitanteId', sql.Int, solicitanteId)
      .input('aprobadorId', sql.Int, aprobadorFinal)
      .input('prioridad', sql.NVarChar, prioridadFinal)
      .input('fechaLimite', sql.Date, fechaLimite || null)
      .query(`
        INSERT INTO AREA_DECISIONES (DE_TIPO_ID, DE_TITULO, DE_DESCRIPCION, DE_SOLICITANTE_ID, DE_APROBADOR_ID, DE_PRIORIDAD, DE_FECHA_LIMITE)
        OUTPUT INSERTED.DE_ID as id
        VALUES (@tipoId, @titulo, @descripcion, @solicitanteId, @aprobadorId, @prioridad, @fechaLimite);
      `);
    const id = rs.recordset[0].id;

    await logAudit(pool, {
      userId: solicitanteId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-decision',
      entidadId: id, detalle: { titulo, tipoId, aprobadorId: aprobadorFinal }, ip: req.ip,
    });

    try {
      await notificationService.createNotification({
        usuarioId: aprobadorFinal,
        mensaje: `Nueva solicitud de decisión: "${titulo}"`,
        tipo: 'decision_pendiente',
        dataExtra: { decisionId: id },
        tenantKey: req.user?.empresa,
      });
      const aprobadorRs = await pool.request().input('id', sql.Int, aprobadorFinal)
        .query(`SELECT NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID=@id`);
      const correo = aprobadorRs.recordset[0]?.correo;
      if (correo) {
        await emailService.sendDecisionNotificacionEmail({
          to: correo, titulo, tipoNombre: tipo.nombre, solicitanteNombre: req.user?.nombre,
        });
      }
    } catch (notifyErr) {
      logger.warn('decisionesController.crearDecision notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('decisionesController.crearDecision', err);
    res.status(500).json({ success: false, message: 'Error al crear solicitud' });
  }
}

async function cancelarDecision(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DE_SOLICITANTE_ID as solicitanteId, DE_ESTATUS as estatus FROM AREA_DECISIONES WHERE DE_ID=@id`);
    const decision = rs.recordset[0];
    if (!decision) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (decision.solicitanteId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede cancelar esta solicitud' });
    }
    if (decision.estatus !== 'pendiente') {
      return res.status(400).json({ success: false, message: 'Solo se pueden cancelar solicitudes pendientes' });
    }
    await pool.request()
      .input('id', sql.Int, id)
      .input('resueltaPor', sql.Int, req.user?.id || null)
      .query(`UPDATE AREA_DECISIONES SET DE_ESTATUS='cancelada', DE_RESUELTA_POR=@resueltaPor, DE_RESUELTA_AT=GETDATE(), DE_UPDATED_AT=GETDATE() WHERE DE_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'cancelar-decision',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.cancelarDecision', err);
    res.status(500).json({ success: false, message: 'Error al cancelar solicitud' });
  }
}

async function resolverDecision(req, res, nuevoEstatus) {
  try {
    const { id } = req.params;
    const { motivoResolucion } = req.body;
    if (nuevoEstatus === 'rechazada' && (!motivoResolucion || !motivoResolucion.trim())) {
      return res.status(400).json({ success: false, message: 'El motivo de rechazo es requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DE_APROBADOR_ID as aprobadorId, DE_ESTATUS as estatus, DE_TITULO as titulo, DE_SOLICITANTE_ID as solicitanteId FROM AREA_DECISIONES WHERE DE_ID=@id`);
    const decision = rs.recordset[0];
    if (!decision) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (decision.aprobadorId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el aprobador asignado puede resolver esta solicitud' });
    }
    if (decision.estatus !== 'pendiente') {
      return res.status(400).json({ success: false, message: 'Esta solicitud ya fue resuelta' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar, nuevoEstatus)
      .input('motivoResolucion', sql.NVarChar, motivoResolucion || null)
      .input('resueltaPor', sql.Int, req.user?.id || null)
      .query(`
        UPDATE AREA_DECISIONES
        SET DE_ESTATUS=@estatus, DE_MOTIVO_RESOLUCION=@motivoResolucion, DE_RESUELTA_POR=@resueltaPor,
            DE_RESUELTA_AT=GETDATE(), DE_UPDATED_AT=GETDATE()
        WHERE DE_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT,
      accion: nuevoEstatus === 'aprobada' ? 'aprobar-decision' : 'rechazar-decision',
      entidadId: id, detalle: { motivoResolucion: motivoResolucion || null }, ip: req.ip,
    });

    try {
      await notificationService.createNotification({
        usuarioId: decision.solicitanteId,
        mensaje: `Tu solicitud "${decision.titulo}" fue ${nuevoEstatus === 'aprobada' ? 'aprobada' : 'rechazada'}`,
        tipo: 'decision_resuelta',
        dataExtra: { decisionId: id },
        tenantKey: req.user?.empresa,
      });
      const solicitanteRs = await pool.request().input('id', sql.Int, decision.solicitanteId)
        .query(`SELECT NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID=@id`);
      const correo = solicitanteRs.recordset[0]?.correo;
      if (correo) {
        await emailService.sendDecisionResueltaEmail({
          to: correo, titulo: decision.titulo, estatus: nuevoEstatus,
          aprobadorNombre: req.user?.nombre, motivoResolucion: motivoResolucion || null,
        });
      }
    } catch (notifyErr) {
      logger.warn('decisionesController.resolverDecision notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.resolverDecision', err);
    res.status(500).json({ success: false, message: 'Error al resolver solicitud' });
  }
}

async function aprobarDecision(req, res) {
  return resolverDecision(req, res, 'aprobada');
}

async function rechazarDecision(req, res) {
  return resolverDecision(req, res, 'rechazada');
}

async function eliminarDecision(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`SELECT DE_ID as id FROM AREA_DECISIONES WHERE DE_ID=@id`);
    if (!rs.recordset[0]) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });

    const adjuntosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DA_NOMBRE_ARCHIVO as nombreArchivo FROM AREA_DECISION_ADJUNTOS WHERE DA_DECISION_ID=@id`);
    for (const adjunto of adjuntosRs.recordset) {
      try {
        const filePath = path.join(DECISION_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('decisionesController.eliminarDecision fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_DECISION_ADJUNTOS WHERE DA_DECISION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_DECISION_COMENTARIOS WHERE DC_DECISION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_DECISION_ALERTAS_LOG WHERE DL_DECISION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_DECISIONES WHERE DE_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-decision',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.eliminarDecision', err);
    res.status(500).json({ success: false, message: 'Error al eliminar solicitud' });
  }
}

// ── Comentarios ──────────────────────────────────────────────────────────
async function listComentarios(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('decisionId', sql.Int, id)
      .query(`
        SELECT DC.DC_ID as id, DC.DC_DECISION_ID as decisionId, DC.DC_USUARIO_ID as usuarioId,
               U.NEUS_NOMBRES as autorNombre, DC.DC_TEXTO as texto, DC.DC_CREATED_AT as createdAt
        FROM AREA_DECISION_COMENTARIOS DC
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = DC.DC_USUARIO_ID
        WHERE DC.DC_DECISION_ID=@decisionId
        ORDER BY DC.DC_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('decisionesController.listComentarios', err);
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
      .input('decisionId', sql.Int, id)
      .input('usuarioId', sql.Int, usuarioId)
      .input('texto', sql.NVarChar, texto.trim())
      .query(`
        INSERT INTO AREA_DECISION_COMENTARIOS (DC_DECISION_ID, DC_USUARIO_ID, DC_TEXTO)
        OUTPUT INSERTED.DC_ID as id
        VALUES (@decisionId, @usuarioId, @texto);
      `);

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'comentar-decision',
      entidadId: id, detalle: { comentarioId: rs.recordset[0].id }, ip: req.ip,
    });

    try {
      const decisionRs = await pool.request().input('id', sql.Int, id)
        .query(`SELECT DE_TITULO as titulo, DE_SOLICITANTE_ID as solicitanteId, DE_APROBADOR_ID as aprobadorId FROM AREA_DECISIONES WHERE DE_ID=@id`);
      const decision = decisionRs.recordset[0];
      if (decision) {
        const destinatarios = new Set([decision.solicitanteId, decision.aprobadorId].filter(Boolean));
        destinatarios.delete(usuarioId);
        for (const destinatarioId of destinatarios) {
          await notificationService.createNotification({
            usuarioId: destinatarioId,
            mensaje: `Nuevo comentario en "${decision.titulo}"`,
            tipo: 'decision_comentario',
            dataExtra: { decisionId: id },
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (notifyErr) {
      logger.warn('decisionesController.crearComentario notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('decisionesController.crearComentario', err);
    res.status(500).json({ success: false, message: 'Error al crear comentario' });
  }
}

async function eliminarComentario(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DC_USUARIO_ID as usuarioId FROM AREA_DECISION_COMENTARIOS WHERE DC_ID=@id`);
    const comentario = rs.recordset[0];
    if (!comentario) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    if (comentario.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propios comentarios' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_DECISION_COMENTARIOS WHERE DC_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.eliminarComentario', err);
    res.status(500).json({ success: false, message: 'Error al eliminar comentario' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('decisionId', sql.Int, id)
      .query(`
        SELECT DA.DA_ID as id, DA.DA_DECISION_ID as decisionId, DA.DA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               DA.DA_NOMBRE_ORIGINAL as nombreOriginal, DA.DA_MIME as mime, DA.DA_TAMANIO as tamanio, DA.DA_CREATED_AT as createdAt
        FROM AREA_DECISION_ADJUNTOS DA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = DA.DA_USUARIO_ID
        WHERE DA.DA_DECISION_ID=@decisionId
        ORDER BY DA.DA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('decisionesController.listAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntos(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const decisionRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DE_SOLICITANTE_ID as solicitanteId, DE_APROBADOR_ID as aprobadorId FROM AREA_DECISIONES WHERE DE_ID=@id`);
    const decision = decisionRs.recordset[0];
    if (!decision) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (decision.solicitanteId !== usuarioId && decision.aprobadorId !== usuarioId) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante o el aprobador pueden adjuntar archivos' });
    }

    for (const file of req.files) {
      await pool.request()
        .input('decisionId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO AREA_DECISION_ADJUNTOS (DA_DECISION_ID, DA_USUARIO_ID, DA_NOMBRE_ARCHIVO, DA_NOMBRE_ORIGINAL, DA_MIME, DA_TAMANIO)
          VALUES (@decisionId, @usuarioId, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'subir-adjunto',
      entidadId: id, detalle: { cantidad: req.files.length }, ip: req.ip,
    });

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('decisionesController.subirAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`
        SELECT DA.DA_USUARIO_ID as usuarioId, DA.DA_NOMBRE_ARCHIVO as nombreArchivo, DE.DE_SOLICITANTE_ID as solicitanteId
        FROM AREA_DECISION_ADJUNTOS DA
        INNER JOIN AREA_DECISIONES DE ON DE.DE_ID = DA.DA_DECISION_ID
        WHERE DA.DA_ID=@id
      `);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    if (adjunto.usuarioId !== req.user?.id && adjunto.solicitanteId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo quien subió el archivo o el solicitante pueden eliminarlo' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_DECISION_ADJUNTOS WHERE DA_ID=@id`);

    try {
      const filePath = path.join(DECISION_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('decisionesController.eliminarAdjunto fs', fsErr?.message || fsErr);
    }

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-adjunto',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('decisionesController.eliminarAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT DA_NOMBRE_ARCHIVO as nombreArchivo, DA_NOMBRE_ORIGINAL as nombreOriginal FROM AREA_DECISION_ADJUNTOS WHERE DA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(DECISION_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('decisionesController.verAdjunto stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('decisionesController.verAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
async function exportarPdf(req, res) {
  try {
    const { bandeja = 'todas', estatus, tipoId } = req.query;
    const uid = req.user?.id || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const where = [];

    if (bandeja === 'mias') { request.input('uid', sql.Int, uid); where.push('DE.DE_SOLICITANTE_ID = @uid'); }
    else if (bandeja === 'por-aprobar') { request.input('uid', sql.Int, uid); where.push('DE.DE_APROBADOR_ID = @uid'); }
    if (estatus && ESTATUS_VALIDOS.includes(estatus)) { request.input('estatus', sql.NVarChar, estatus); where.push('DE.DE_ESTATUS = @estatus'); }
    if (tipoId) { request.input('tipoId', sql.Int, tipoId); where.push('DE.DE_TIPO_ID = @tipoId'); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rs = await request.query(`${SELECT_DECISION_BASE} ${whereSql} ORDER BY DE.DE_CREATED_AT DESC`);
    const decisiones = rs.recordset;

    const logoPath = path.join(__dirname, '../assets/LOGO.png');
    const hasLogo = fs.existsSync(logoPath);

    const PAGE_W = 612, PAGE_H = 792;
    const M = 50;
    const doc = new PDFDocument({ size: 'letter', margin: 0, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    const ESTATUS_LABEL = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada' };

    const buffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const drawHeader = (subtitulo) => {
        doc.rect(0, 0, PAGE_W, 90).fill('#0D1B3E');
        if (hasLogo) {
          try { doc.image(logoPath, PAGE_W - M - 110, 18, { width: 110 }); } catch (_) { /* best-effort */ }
        }
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text('ARDABYTEC', M, 22, { width: 300 });
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Toma de decisiones', M, 38);
        doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
        return 132;
      };

      let y = drawHeader('Solicitudes de decisión');
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H - M) {
          doc.addPage();
          y = drawHeader('Solicitudes de decisión (cont.)');
        }
      };

      if (decisiones.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay solicitudes registradas con estos filtros.', M, y);
      }

      decisiones.forEach((d) => {
        ensureSpace(56);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0D1B3E')
          .text(d.titulo, M, y, { width: PAGE_W - M * 2 });
        y += 15;

        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(
            `${d.tipoNombre}  ·  ${d.solicitanteNombre || '—'} → ${d.aprobadorNombre || '—'}  ·  ${ESTATUS_LABEL[d.estatus] || d.estatus}`,
            M, y, { width: PAGE_W - M * 2 },
          );
        y += 16;
        doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
        y += 14;
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="toma_decisiones.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('decisionesController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Alertas de solicitudes pendientes (cron) ────────────────────────────
async function ejecutarAlertaDecisionesPendientes(pool, tenantKey) {
  try {
    const candidatosRs = await pool.request()
      .input('dias', sql.Int, DIAS_PENDIENTE_ALERTA)
      .query(`
        SELECT DE.DE_ID as id, DE.DE_TITULO as titulo, DE.DE_APROBADOR_ID as aprobadorId,
               DATEDIFF(DAY, DE.DE_CREATED_AT, GETDATE()) as diasPendiente
        FROM AREA_DECISIONES DE
        WHERE DE.DE_ESTATUS = 'pendiente'
          AND DATEDIFF(DAY, DE.DE_CREATED_AT, GETDATE()) >= @dias
          AND NOT EXISTS (
            SELECT 1 FROM AREA_DECISION_ALERTAS_LOG
            WHERE DL_DECISION_ID = DE.DE_ID
              AND CAST(DL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    for (const decision of candidatosRs.recordset) {
      await notificationService.createNotification({
        usuarioId: decision.aprobadorId,
        mensaje: `Solicitud "${decision.titulo}" lleva ${decision.diasPendiente} días esperando tu aprobación`,
        tipo: 'decision_recordatorio',
        dataExtra: { decisionId: decision.id },
        tenantKey,
      });

      try {
        const aprobadorRs = await pool.request().input('id', sql.Int, decision.aprobadorId)
          .query(`SELECT NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID=@id`);
        const correo = aprobadorRs.recordset[0]?.correo;
        if (correo) {
          await emailService.sendDecisionRecordatorioEmail({
            to: correo, titulo: decision.titulo, diasPendiente: decision.diasPendiente,
          });
        }
      } catch (mailErr) {
        logger.warn('decisionesController.ejecutarAlertaDecisionesPendientes mail', mailErr?.message || mailErr);
      }

      await pool.request().input('decisionId', sql.Int, decision.id)
        .query(`INSERT INTO AREA_DECISION_ALERTAS_LOG (DL_DECISION_ID) VALUES (@decisionId)`);
    }
  } catch (err) {
    logger.error('decisionesController.ejecutarAlertaDecisionesPendientes', err);
  }
}

cron.schedule('30 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaDecisionesPendientes(pool, key);
    } catch (err) {
      logger.error(`[CRON decisiones-pendientes][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

module.exports = {
  listTipos,
  crearTipo,
  actualizarTipo,
  eliminarTipo,
  listDecisiones,
  getResumen,
  getDecision,
  crearDecision,
  cancelarDecision,
  aprobarDecision,
  rechazarDecision,
  eliminarDecision,
  listComentarios,
  crearComentario,
  eliminarComentario,
  listAdjuntos,
  subirAdjuntos,
  eliminarAdjunto,
  verAdjunto,
  exportarPdf,
};
