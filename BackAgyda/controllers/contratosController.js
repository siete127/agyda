const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const notificationService = require('../services/notificationService');
const { CONTRATOS_ADJUNTOS_DIR } = require('../middleware/contratoAdjuntoUpload');

const TIPOS_VALIDOS = ['arrendamiento', 'servicios', 'confidencialidad', 'laboral', 'proveedor', 'otro'];
const ESTATUS_VALIDOS = ['vigente', 'por_vencer', 'vencido', 'renovado', 'cancelado'];
const TIPOS_ADJUNTO_VALIDOS = ['firmado', 'anexo', 'addendum'];
const DIAS_VENCIMIENTO_ALERTA = 15;

const SELECT_CONTRATO_BASE = `
  SELECT CT.CT_ID as id, CT.CT_TITULO as titulo, CT.CT_TIPO as tipo, CT.CT_CONTRAPARTE as contraparte,
         CT.CT_FECHA_INICIO as fechaInicio, CT.CT_FECHA_VENCIMIENTO as fechaVencimiento,
         CT.CT_RENOVACION_AUTOMATICA as renovacionAutomatica, CT.CT_MONTO as monto, CT.CT_MONEDA as moneda,
         CASE
           WHEN CT.CT_ESTATUS IN ('renovado','cancelado') THEN CT.CT_ESTATUS
           WHEN CT.CT_FECHA_VENCIMIENTO IS NULL THEN 'vigente'
           WHEN CT.CT_FECHA_VENCIMIENTO < CAST(GETDATE() AS DATE) THEN 'vencido'
           WHEN CT.CT_FECHA_VENCIMIENTO <= DATEADD(DAY, 15, CAST(GETDATE() AS DATE)) THEN 'por_vencer'
           ELSE 'vigente'
         END as estatus,
         CT.CT_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre,
         CT.CT_NOTAS as notas, CT.CT_CREATED_AT as createdAt, CT.CT_UPDATED_AT as updatedAt
  FROM LEGALES_CONTRATOS CT
  LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CT.CT_RESPONSABLE_ID
`;

async function listContratos(req, res) {
  try {
    const { tipo, estatus } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CONTRATO_BASE} ORDER BY CT.CT_FECHA_VENCIMIENTO ASC`);
    let data = rs.recordset;
    if (tipo && TIPOS_VALIDOS.includes(tipo)) data = data.filter((c) => c.tipo === tipo);
    if (estatus && ESTATUS_VALIDOS.includes(estatus)) data = data.filter((c) => c.estatus === estatus);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('contratosController.listContratos', err);
    res.status(500).json({ success: false, message: 'Error al obtener contratos' });
  }
}

async function getResumen(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CONTRATO_BASE}`);
    const data = rs.recordset;
    res.json({
      success: true,
      data: {
        vigentes: data.filter((c) => c.estatus === 'vigente').length,
        porVencer: data.filter((c) => c.estatus === 'por_vencer').length,
        vencidos: data.filter((c) => c.estatus === 'vencido').length,
        activos: data.filter((c) => !['cancelado'].includes(c.estatus)).length,
      },
    });
  } catch (err) {
    logger.error('contratosController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function crearContrato(req, res) {
  try {
    const { titulo, tipo, contraparte, fechaInicio, fechaVencimiento, renovacionAutomatica, monto, moneda, responsableId, notas } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ success: false, message: 'Tipo de contrato inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('tipo', sql.NVarChar, tipo)
      .input('contraparte', sql.NVarChar, contraparte || null)
      .input('fechaInicio', sql.Date, fechaInicio || null)
      .input('fechaVencimiento', sql.Date, fechaVencimiento || null)
      .input('renovacionAutomatica', sql.Bit, renovacionAutomatica ? 1 : 0)
      .input('monto', sql.Decimal(18, 2), monto || null)
      .input('moneda', sql.NVarChar, moneda || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('notas', sql.NVarChar, notas || null)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO LEGALES_CONTRATOS (CT_TITULO, CT_TIPO, CT_CONTRAPARTE, CT_FECHA_INICIO, CT_FECHA_VENCIMIENTO, CT_RENOVACION_AUTOMATICA, CT_MONTO, CT_MONEDA, CT_RESPONSABLE_ID, CT_NOTAS, CT_CREATED_BY)
        OUTPUT INSERTED.CT_ID as id
        VALUES (@titulo, @tipo, @contraparte, @fechaInicio, @fechaVencimiento, @renovacionAutomatica, @monto, @moneda, @responsableId, @notas, @createdBy);
      `);

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('contratosController.crearContrato', err);
    res.status(500).json({ success: false, message: 'Error al crear contrato' });
  }
}

async function actualizarContrato(req, res) {
  try {
    const { id } = req.params;
    const { titulo, tipo, contraparte, fechaInicio, fechaVencimiento, renovacionAutomatica, monto, moneda, responsableId, notas } = req.body;
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ success: false, message: 'Tipo de contrato inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('tipo', sql.NVarChar, tipo)
      .input('contraparte', sql.NVarChar, contraparte || null)
      .input('fechaInicio', sql.Date, fechaInicio || null)
      .input('fechaVencimiento', sql.Date, fechaVencimiento || null)
      .input('renovacionAutomatica', sql.Bit, renovacionAutomatica ? 1 : 0)
      .input('monto', sql.Decimal(18, 2), monto || null)
      .input('moneda', sql.NVarChar, moneda || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        UPDATE LEGALES_CONTRATOS
        SET CT_TITULO=@titulo, CT_TIPO=@tipo, CT_CONTRAPARTE=@contraparte, CT_FECHA_INICIO=@fechaInicio,
            CT_FECHA_VENCIMIENTO=@fechaVencimiento, CT_RENOVACION_AUTOMATICA=@renovacionAutomatica,
            CT_MONTO=@monto, CT_MONEDA=@moneda, CT_RESPONSABLE_ID=@responsableId, CT_NOTAS=@notas, CT_UPDATED_AT=GETDATE()
        WHERE CT_ID=@id
      `);

    res.json({ success: true });
  } catch (err) {
    logger.error('contratosController.actualizarContrato', err);
    res.status(500).json({ success: false, message: 'Error al actualizar contrato' });
  }
}

async function marcarRenovado(req, res) {
  try {
    const { id } = req.params;
    const { nuevaFechaVencimiento } = req.body;
    if (!nuevaFechaVencimiento) return res.status(400).json({ success: false, message: 'Nueva fecha de vencimiento requerida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('fechaVencimiento', sql.Date, nuevaFechaVencimiento)
      .query(`UPDATE LEGALES_CONTRATOS SET CT_ESTATUS='vigente', CT_FECHA_VENCIMIENTO=@fechaVencimiento, CT_UPDATED_AT=GETDATE() WHERE CT_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('contratosController.marcarRenovado', err);
    res.status(500).json({ success: false, message: 'Error al renovar contrato' });
  }
}

async function cancelarContrato(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id)
      .query(`UPDATE LEGALES_CONTRATOS SET CT_ESTATUS='cancelado', CT_UPDATED_AT=GETDATE() WHERE CT_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('contratosController.cancelarContrato', err);
    res.status(500).json({ success: false, message: 'Error al cancelar contrato' });
  }
}

async function eliminarContrato(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const adjuntosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CTA_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_CONTRATOS_ADJUNTOS WHERE CTA_CONTRATO_ID=@id`);
    for (const adj of adjuntosRs.recordset) {
      try {
        const filePath = path.join(CONTRATOS_ADJUNTOS_DIR, path.basename(adj.nombreArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('contratosController.eliminarContrato fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CONTRATOS_ADJUNTOS WHERE CTA_CONTRATO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CONTRATOS_ALERTAS_LOG WHERE CAL_CONTRATO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CONTRATOS WHERE CT_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('contratosController.eliminarContrato', err);
    res.status(500).json({ success: false, message: 'Error al eliminar contrato' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('contratoId', sql.Int, id)
      .query(`
        SELECT CTA.CTA_ID as id, CTA.CTA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               CTA.CTA_TIPO as tipo, CTA.CTA_NOMBRE_ORIGINAL as nombreOriginal, CTA.CTA_MIME as mime,
               CTA.CTA_TAMANIO as tamanio, CTA.CTA_CREATED_AT as createdAt
        FROM LEGALES_CONTRATOS_ADJUNTOS CTA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CTA.CTA_USUARIO_ID
        WHERE CTA.CTA_CONTRATO_ID=@contratoId
        ORDER BY CTA.CTA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('contratosController.listAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntos(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const tipo = TIPOS_ADJUNTO_VALIDOS.includes(req.body.tipo) ? req.body.tipo : 'firmado';
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const contratoRs = await pool.request().input('id', sql.Int, id).query(`SELECT CT_ID as id FROM LEGALES_CONTRATOS WHERE CT_ID=@id`);
    if (!contratoRs.recordset[0]) return res.status(404).json({ success: false, message: 'Contrato no encontrado' });

    for (const file of req.files) {
      await pool.request()
        .input('contratoId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('tipo', sql.NVarChar, tipo)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO LEGALES_CONTRATOS_ADJUNTOS (CTA_CONTRATO_ID, CTA_USUARIO_ID, CTA_TIPO, CTA_NOMBRE_ARCHIVO, CTA_NOMBRE_ORIGINAL, CTA_MIME, CTA_TAMANIO)
          VALUES (@contratoId, @usuarioId, @tipo, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('contratosController.subirAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CTA_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_CONTRATOS_ADJUNTOS WHERE CTA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CONTRATOS_ADJUNTOS WHERE CTA_ID=@id`);

    try {
      const filePath = path.join(CONTRATOS_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('contratosController.eliminarAdjunto fs', fsErr?.message || fsErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('contratosController.eliminarAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CTA_NOMBRE_ARCHIVO as nombreArchivo, CTA_NOMBRE_ORIGINAL as nombreOriginal FROM LEGALES_CONTRATOS_ADJUNTOS WHERE CTA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(CONTRATOS_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('contratosController.verAdjunto stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('contratosController.verAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

// ── Alertas de vencimiento (cron) ─────────────────────────────────────────
async function ejecutarAlertaContratosVencimiento(pool, tenantKey) {
  try {
    const candidatosRs = await pool.request()
      .input('dias', sql.Int, DIAS_VENCIMIENTO_ALERTA)
      .query(`
        SELECT CT.CT_ID as contratoId, CT.CT_TITULO as titulo, CT.CT_FECHA_VENCIMIENTO as fechaVencimiento, CT.CT_RESPONSABLE_ID as responsableId
        FROM LEGALES_CONTRATOS CT
        WHERE CT.CT_ESTATUS NOT IN ('cancelado', 'renovado')
          AND CT.CT_FECHA_VENCIMIENTO IS NOT NULL
          AND CT.CT_FECHA_VENCIMIENTO BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, @dias, CAST(GETDATE() AS DATE))
          AND NOT EXISTS (
            SELECT 1 FROM LEGALES_CONTRATOS_ALERTAS_LOG
            WHERE CAL_CONTRATO_ID = CT.CT_ID
              AND CAST(CAL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    for (const contrato of candidatosRs.recordset) {
      if (contrato.responsableId) {
        await notificationService.createNotification({
          usuarioId: contrato.responsableId,
          mensaje: `El contrato "${contrato.titulo}" vence el ${new Date(contrato.fechaVencimiento).toLocaleDateString()}`,
          tipo: 'contrato_vencimiento',
          dataExtra: { contratoId: contrato.contratoId },
          tenantKey,
        });
      }

      await pool.request().input('contratoId', sql.Int, contrato.contratoId)
        .query(`INSERT INTO LEGALES_CONTRATOS_ALERTAS_LOG (CAL_CONTRATO_ID) VALUES (@contratoId)`);
    }
  } catch (err) {
    logger.error('contratosController.ejecutarAlertaContratosVencimiento', err);
  }
}

cron.schedule('30 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaContratosVencimiento(pool, key);
    } catch (err) {
      logger.error(`[CRON contratos-vencimiento][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

module.exports = {
  listContratos,
  getResumen,
  crearContrato,
  actualizarContrato,
  marcarRenovado,
  cancelarContrato,
  eliminarContrato,
  listAdjuntos,
  subirAdjuntos,
  eliminarAdjunto,
  verAdjunto,
};
