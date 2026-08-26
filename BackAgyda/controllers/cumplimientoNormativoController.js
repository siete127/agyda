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
const { CUMPLIMIENTO_ADJUNTOS_DIR } = require('../middleware/cumplimientoAdjuntoUpload');

const MODULO_AUDIT = 'legal';
const DIAS_ALERTA_ANTICIPACION = 15;

const CATEGORIAS_VALIDAS = ['fiscal', 'laboral', 'ambiental', 'proteccion_datos', 'salud_seguridad', 'financiero', 'comercial', 'otra'];
const FRECUENCIAS_VALIDAS = ['unica_vez', 'mensual', 'trimestral', 'semestral', 'anual'];
const NIVELES_RIESGO_VALIDOS = ['bajo', 'medio', 'alto', 'critico'];
const ESTATUS_VALIDOS = ['pendiente', 'cumplida'];
const TIPOS_ADJUNTO_CN_VALIDOS = ['evidencia', 'norma', 'otro'];

const SELECT_CN_BASE = `
  SELECT CN.CN_ID as id, CN.CN_NOMBRE as nombre, CN.CN_CATEGORIA as categoria, CN.CN_AUTORIDAD as autoridad,
         CN.CN_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre,
         CN.CN_BASE_LEGAL as baseLegal, CN.CN_DESCRIPCION as descripcion, CN.CN_FRECUENCIA as frecuencia,
         CN.CN_FECHA_LIMITE as fechaLimite, CN.CN_ESTATUS as estatus, CN.CN_NIVEL_RIESGO as nivelRiesgo,
         CN.CN_CONSECUENCIA_INCUMPLIMIENTO as consecuenciaIncumplimiento, CN.CN_NOTAS as notas,
         CN.CN_CREATED_AT as createdAt, CN.CN_UPDATED_AT as updatedAt,
         CASE
           WHEN CN.CN_ESTATUS = 'cumplida' THEN 'cumplida'
           WHEN CN.CN_FECHA_LIMITE < CAST(GETDATE() AS DATE) THEN 'vencida'
           ELSE 'pendiente'
         END as estatusCalculado
  FROM LEGALES_CUMPLIMIENTO_OBLIGACIONES CN
  LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CN.CN_RESPONSABLE_ID
`;

// ── Obligaciones ─────────────────────────────────────────────────────────
async function listObligaciones(req, res) {
  try {
    const { categoria, frecuencia, estatus, nivelRiesgo } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CN_BASE} ORDER BY CN.CN_FECHA_LIMITE ASC`);
    let data = rs.recordset;
    if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) data = data.filter((o) => o.categoria === categoria);
    if (frecuencia && FRECUENCIAS_VALIDAS.includes(frecuencia)) data = data.filter((o) => o.frecuencia === frecuencia);
    if (estatus) data = data.filter((o) => o.estatusCalculado === estatus);
    if (nivelRiesgo && NIVELES_RIESGO_VALIDOS.includes(nivelRiesgo)) data = data.filter((o) => o.nivelRiesgo === nivelRiesgo);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('cumplimientoNormativoController.listObligaciones', err);
    res.status(500).json({ success: false, message: 'Error al obtener obligaciones' });
  }
}

async function getResumen(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CN_BASE}`);
    const data = rs.recordset;
    const en30dias = new Date();
    en30dias.setDate(en30dias.getDate() + 30);
    res.json({
      success: true,
      data: {
        total: data.length,
        pendientes: data.filter((o) => o.estatusCalculado === 'pendiente').length,
        vencidas: data.filter((o) => o.estatusCalculado === 'vencida').length,
        cumplidas: data.filter((o) => o.estatusCalculado === 'cumplida').length,
        altoRiesgo: data.filter((o) => ['alto', 'critico'].includes(o.nivelRiesgo) && o.estatusCalculado !== 'cumplida').length,
        proximas30Dias: data.filter((o) => o.estatusCalculado !== 'cumplida' && new Date(o.fechaLimite) <= en30dias).length,
      },
    });
  } catch (err) {
    logger.error('cumplimientoNormativoController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function getObligacion(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`${SELECT_CN_BASE} WHERE CN.CN_ID=@id`);
    const obligacion = rs.recordset[0];
    if (!obligacion) return res.status(404).json({ success: false, message: 'Obligación no encontrada' });
    res.json({ success: true, data: obligacion });
  } catch (err) {
    logger.error('cumplimientoNormativoController.getObligacion', err);
    res.status(500).json({ success: false, message: 'Error al obtener obligación' });
  }
}

function validarPayload(body) {
  const { nombre, categoria, frecuencia, fechaLimite, nivelRiesgo } = body;
  if (!nombre || !nombre.trim()) return 'Nombre requerido';
  if (!CATEGORIAS_VALIDAS.includes(categoria)) return 'Categoría inválida';
  if (!FRECUENCIAS_VALIDAS.includes(frecuencia)) return 'Frecuencia inválida';
  if (!fechaLimite) return 'Fecha límite requerida';
  if (nivelRiesgo && !NIVELES_RIESGO_VALIDOS.includes(nivelRiesgo)) return 'Nivel de riesgo inválido';
  return null;
}

async function crearObligacion(req, res) {
  try {
    const errorValidacion = validarPayload(req.body);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const {
      nombre, categoria, autoridad, responsableId, baseLegal, descripcion, frecuencia,
      fechaLimite, nivelRiesgo, consecuenciaIncumplimiento, notas,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('categoria', sql.NVarChar, categoria)
      .input('autoridad', sql.NVarChar, autoridad || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('baseLegal', sql.NVarChar, baseLegal || null)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('frecuencia', sql.NVarChar, frecuencia)
      .input('fechaLimite', sql.Date, fechaLimite)
      .input('nivelRiesgo', sql.NVarChar, nivelRiesgo || 'medio')
      .input('consecuenciaIncumplimiento', sql.NVarChar, consecuenciaIncumplimiento || null)
      .input('notas', sql.NVarChar, notas || null)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO LEGALES_CUMPLIMIENTO_OBLIGACIONES (
          CN_NOMBRE, CN_CATEGORIA, CN_AUTORIDAD, CN_RESPONSABLE_ID, CN_BASE_LEGAL, CN_DESCRIPCION,
          CN_FRECUENCIA, CN_FECHA_LIMITE, CN_NIVEL_RIESGO, CN_CONSECUENCIA_INCUMPLIMIENTO, CN_NOTAS, CN_CREATED_BY
        )
        OUTPUT INSERTED.CN_ID as id
        VALUES (
          @nombre, @categoria, @autoridad, @responsableId, @baseLegal, @descripcion,
          @frecuencia, @fechaLimite, @nivelRiesgo, @consecuenciaIncumplimiento, @notas, @createdBy
        );
      `);
    const id = rs.recordset[0].id;

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'obligacion-crear',
      entidadId: id, detalle: { nombre, categoria }, ip: req.ip,
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('cumplimientoNormativoController.crearObligacion', err);
    res.status(500).json({ success: false, message: 'Error al crear obligación' });
  }
}

async function actualizarObligacion(req, res) {
  try {
    const { id } = req.params;
    const errorValidacion = validarPayload(req.body);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const {
      nombre, categoria, autoridad, responsableId, baseLegal, descripcion, frecuencia,
      fechaLimite, nivelRiesgo, consecuenciaIncumplimiento, notas,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('categoria', sql.NVarChar, categoria)
      .input('autoridad', sql.NVarChar, autoridad || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('baseLegal', sql.NVarChar, baseLegal || null)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('frecuencia', sql.NVarChar, frecuencia)
      .input('fechaLimite', sql.Date, fechaLimite)
      .input('nivelRiesgo', sql.NVarChar, nivelRiesgo || 'medio')
      .input('consecuenciaIncumplimiento', sql.NVarChar, consecuenciaIncumplimiento || null)
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        UPDATE LEGALES_CUMPLIMIENTO_OBLIGACIONES
        SET CN_NOMBRE=@nombre, CN_CATEGORIA=@categoria, CN_AUTORIDAD=@autoridad, CN_RESPONSABLE_ID=@responsableId,
            CN_BASE_LEGAL=@baseLegal, CN_DESCRIPCION=@descripcion, CN_FRECUENCIA=@frecuencia, CN_FECHA_LIMITE=@fechaLimite,
            CN_NIVEL_RIESGO=@nivelRiesgo, CN_CONSECUENCIA_INCUMPLIMIENTO=@consecuenciaIncumplimiento, CN_NOTAS=@notas,
            CN_UPDATED_AT=GETDATE()
        WHERE CN_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'obligacion-editar',
      entidadId: id, detalle: { nombre }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('cumplimientoNormativoController.actualizarObligacion', err);
    res.status(500).json({ success: false, message: 'Error al actualizar obligación' });
  }
}

function calcularSiguienteFecha(frecuencia, fechaBase) {
  const fecha = new Date(fechaBase);
  switch (frecuencia) {
    case 'mensual': fecha.setMonth(fecha.getMonth() + 1); break;
    case 'trimestral': fecha.setMonth(fecha.getMonth() + 3); break;
    case 'semestral': fecha.setMonth(fecha.getMonth() + 6); break;
    case 'anual': fecha.setFullYear(fecha.getFullYear() + 1); break;
    default: return null; // unica_vez: no se reprograma
  }
  return fecha.toISOString().slice(0, 10);
}

async function marcarCumplida(req, res) {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const { id } = req.params;
    const { fechaCumplimiento, comentario } = req.body;

    const actualRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CN_FRECUENCIA as frecuencia, CN_FECHA_LIMITE as fechaLimite FROM LEGALES_CUMPLIMIENTO_OBLIGACIONES WHERE CN_ID=@id`);
    const obligacion = actualRs.recordset[0];
    if (!obligacion) return res.status(404).json({ success: false, message: 'Obligación no encontrada' });

    const fechaLimiteAnterior = obligacion.fechaLimite;
    const nuevaFechaLimite = calcularSiguienteFecha(obligacion.frecuencia, fechaLimiteAnterior);
    const nuevoEstatus = nuevaFechaLimite ? 'pendiente' : 'cumplida';

    await transaction.begin();

    await new sql.Request(transaction)
      .input('obligacionId', sql.Int, id)
      .input('fechaCumplimiento', sql.Date, fechaCumplimiento || new Date())
      .input('fechaLimiteOriginal', sql.Date, fechaLimiteAnterior)
      .input('usuarioId', sql.Int, req.user?.id || null)
      .input('comentario', sql.NVarChar, comentario || null)
      .query(`
        INSERT INTO LEGALES_CUMPLIMIENTO_HISTORIAL (CNH_OBLIGACION_ID, CNH_FECHA_CUMPLIMIENTO, CNH_FECHA_LIMITE_ORIGINAL, CNH_USUARIO_ID, CNH_COMENTARIO)
        VALUES (@obligacionId, @fechaCumplimiento, @fechaLimiteOriginal, @usuarioId, @comentario);
      `);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('fechaLimite', sql.Date, nuevaFechaLimite || fechaLimiteAnterior)
      .input('estatus', sql.NVarChar, nuevoEstatus)
      .query(`UPDATE LEGALES_CUMPLIMIENTO_OBLIGACIONES SET CN_FECHA_LIMITE=@fechaLimite, CN_ESTATUS=@estatus, CN_UPDATED_AT=GETDATE() WHERE CN_ID=@id`);

    await transaction.commit();

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'obligacion-marcar-cumplida',
      entidadId: id, detalle: { fechaCumplimiento, nuevaFechaLimite }, ip: req.ip,
    });

    res.json({ success: true, data: { nuevaFechaLimite: nuevaFechaLimite || null, estatus: nuevoEstatus } });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    logger.error('cumplimientoNormativoController.marcarCumplida', err);
    res.status(500).json({ success: false, message: 'Error al marcar como cumplida' });
  }
}

async function listHistorial(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('obligacionId', sql.Int, id)
      .query(`
        SELECT CNH.CNH_ID as id, CNH.CNH_FECHA_CUMPLIMIENTO as fechaCumplimiento, CNH.CNH_FECHA_LIMITE_ORIGINAL as fechaLimiteOriginal,
               CNH.CNH_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as usuarioNombre, CNH.CNH_COMENTARIO as comentario, CNH.CNH_CREATED_AT as createdAt
        FROM LEGALES_CUMPLIMIENTO_HISTORIAL CNH
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CNH.CNH_USUARIO_ID
        WHERE CNH.CNH_OBLIGACION_ID=@obligacionId
        ORDER BY CNH.CNH_FECHA_CUMPLIMIENTO DESC, CNH.CNH_ID DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('cumplimientoNormativoController.listHistorial', err);
    res.status(500).json({ success: false, message: 'Error al obtener historial' });
  }
}

async function eliminarObligacion(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const adjuntosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNA_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_CUMPLIMIENTO_ADJUNTOS WHERE CNA_OBLIGACION_ID=@id`);
    for (const adj of adjuntosRs.recordset) {
      try {
        const filePath = path.join(CUMPLIMIENTO_ADJUNTOS_DIR, path.basename(adj.nombreArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('cumplimientoNormativoController.eliminarObligacion fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CUMPLIMIENTO_ADJUNTOS WHERE CNA_OBLIGACION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CUMPLIMIENTO_HISTORIAL WHERE CNH_OBLIGACION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CUMPLIMIENTO_ALERTAS_LOG WHERE CNL_OBLIGACION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CUMPLIMIENTO_OBLIGACIONES WHERE CN_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'obligacion-eliminar',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('cumplimientoNormativoController.eliminarObligacion', err);
    res.status(500).json({ success: false, message: 'Error al eliminar obligación' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('obligacionId', sql.Int, id)
      .query(`
        SELECT CNA.CNA_ID as id, CNA.CNA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               CNA.CNA_TIPO as tipo, CNA.CNA_NOMBRE_ORIGINAL as nombreOriginal, CNA.CNA_MIME as mime,
               CNA.CNA_TAMANIO as tamanio, CNA.CNA_CREATED_AT as createdAt
        FROM LEGALES_CUMPLIMIENTO_ADJUNTOS CNA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CNA.CNA_USUARIO_ID
        WHERE CNA.CNA_OBLIGACION_ID=@obligacionId
        ORDER BY CNA.CNA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('cumplimientoNormativoController.listAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntos(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const tipo = TIPOS_ADJUNTO_CN_VALIDOS.includes(req.body.tipo) ? req.body.tipo : 'evidencia';
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const obligacionRs = await pool.request().input('id', sql.Int, id).query(`SELECT CN_ID as id FROM LEGALES_CUMPLIMIENTO_OBLIGACIONES WHERE CN_ID=@id`);
    if (!obligacionRs.recordset[0]) return res.status(404).json({ success: false, message: 'Obligación no encontrada' });

    for (const file of req.files) {
      await pool.request()
        .input('obligacionId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('tipo', sql.NVarChar, tipo)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO LEGALES_CUMPLIMIENTO_ADJUNTOS (CNA_OBLIGACION_ID, CNA_USUARIO_ID, CNA_TIPO, CNA_NOMBRE_ARCHIVO, CNA_NOMBRE_ORIGINAL, CNA_MIME, CNA_TAMANIO)
          VALUES (@obligacionId, @usuarioId, @tipo, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'obligacion-subir-adjunto',
      entidadId: id, detalle: { cantidad: req.files.length, tipo }, ip: req.ip,
    });

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('cumplimientoNormativoController.subirAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNA_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_CUMPLIMIENTO_ADJUNTOS WHERE CNA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CUMPLIMIENTO_ADJUNTOS WHERE CNA_ID=@id`);

    try {
      const filePath = path.join(CUMPLIMIENTO_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('cumplimientoNormativoController.eliminarAdjunto fs', fsErr?.message || fsErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('cumplimientoNormativoController.eliminarAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNA_NOMBRE_ARCHIVO as nombreArchivo, CNA_NOMBRE_ORIGINAL as nombreOriginal FROM LEGALES_CUMPLIMIENTO_ADJUNTOS WHERE CNA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(CUMPLIMIENTO_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('cumplimientoNormativoController.verAdjunto stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('cumplimientoNormativoController.verAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
const CATEGORIA_LABEL = {
  fiscal: 'Fiscal', laboral: 'Laboral', ambiental: 'Ambiental', proteccion_datos: 'Protección de datos',
  salud_seguridad: 'Salud y seguridad', financiero: 'Financiero', comercial: 'Comercial', otra: 'Otra',
};
const ESTATUS_CALC_LABEL = { pendiente: 'Pendiente', vencida: 'Vencida', cumplida: 'Cumplida' };

async function exportarPdf(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CN_BASE} ORDER BY CN.CN_FECHA_LIMITE ASC`);
    const obligaciones = rs.recordset;

    const logoPath = path.join(__dirname, '../assets/LOGO.png');
    const hasLogo = fs.existsSync(logoPath);

    const PAGE_W = 612, PAGE_H = 792;
    const M = 50;
    const doc = new PDFDocument({ size: 'letter', margin: 0, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    const buffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const drawHeader = (subtitulo) => {
        doc.rect(0, 0, PAGE_W, 90).fill('#0D1B3E');
        if (hasLogo) {
          try { doc.image(logoPath, PAGE_W - M - 110, 18, { width: 110 }); } catch (_) { /* best-effort */ }
        }
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text('ARDABYTEC', M, 22, { width: 300 });
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Cumplimiento normativo', M, 38);
        doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
        return 132;
      };

      let y = drawHeader('Cumplimiento normativo — Obligaciones');
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H - M) {
          doc.addPage();
          y = drawHeader('Cumplimiento normativo — Obligaciones (cont.)');
        }
      };

      if (obligaciones.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay obligaciones registradas.', M, y);
      }

      obligaciones.forEach((o) => {
        ensureSpace(60);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0D1B3E')
          .text(o.nombre, M, y, { width: PAGE_W - M * 2 });
        y += 15;

        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(
            `${CATEGORIA_LABEL[o.categoria] || o.categoria}  ·  ${o.responsableNombre || '—'}  ·  ${ESTATUS_CALC_LABEL[o.estatusCalculado] || o.estatusCalculado}  ·  Riesgo: ${o.nivelRiesgo}`,
            M, y, { width: PAGE_W - M * 2 },
          );
        y += 14;

        doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
          .text(`Fecha límite: ${new Date(o.fechaLimite).toLocaleDateString()}  ·  Frecuencia: ${o.frecuencia}`, M, y, { width: PAGE_W - M * 2 });
        y += 16;

        doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
        y += 14;
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="cumplimiento_normativo.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('cumplimientoNormativoController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Alertas de vencimiento (cron) ───────────────────────────────────────
async function ejecutarAlertaCumplimientoVencimiento(pool, tenantKey) {
  try {
    const candidatosRs = await pool.request()
      .input('dias', sql.Int, DIAS_ALERTA_ANTICIPACION)
      .query(`
        SELECT CN_ID as id, CN_NOMBRE as nombre, CN_CATEGORIA as categoria, CN_RESPONSABLE_ID as responsableId, CN_FECHA_LIMITE as fechaLimite
        FROM LEGALES_CUMPLIMIENTO_OBLIGACIONES
        WHERE CN_ESTATUS != 'cumplida'
          AND CN_FECHA_LIMITE <= DATEADD(DAY, @dias, CAST(GETDATE() AS DATE))
          AND NOT EXISTS (
            SELECT 1 FROM LEGALES_CUMPLIMIENTO_ALERTAS_LOG
            WHERE CNL_OBLIGACION_ID = LEGALES_CUMPLIMIENTO_OBLIGACIONES.CN_ID
              AND CAST(CNL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    const usuariosCorreo = await getUsuariosParaNotificarCorreo(MODULO_AUDIT, tenantKey);

    for (const obligacion of candidatosRs.recordset) {
      const destinatariosInApp = new Set([obligacion.responsableId, ...usuariosCorreo].filter(Boolean));
      for (const usuarioId of destinatariosInApp) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: `La obligación "${obligacion.nombre}" (${CATEGORIA_LABEL[obligacion.categoria] || obligacion.categoria}) vence pronto`,
          tipo: 'cumplimiento_vencimiento',
          dataExtra: { obligacionId: obligacion.id },
          tenantKey,
        });
      }

      const idsCorreo = [obligacion.responsableId, ...usuariosCorreo].filter(Boolean);
      if (idsCorreo.length) {
        const correosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${idsCorreo.join(',') || '0'})`);
        const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);
        if (correos.length) {
          await emailService.sendCumplimientoVencimientoEmail({
            to: correos,
            nombreObligacion: obligacion.nombre,
            fechaLimite: obligacion.fechaLimite,
            categoria: CATEGORIA_LABEL[obligacion.categoria] || obligacion.categoria,
          });
        }
      }

      await pool.request().input('obligacionId', sql.Int, obligacion.id)
        .query(`INSERT INTO LEGALES_CUMPLIMIENTO_ALERTAS_LOG (CNL_OBLIGACION_ID) VALUES (@obligacionId)`);
    }
  } catch (err) {
    logger.error('cumplimientoNormativoController.ejecutarAlertaCumplimientoVencimiento', err);
  }
}

cron.schedule('45 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaCumplimientoVencimiento(pool, key);
    } catch (err) {
      logger.error(`[CRON cumplimiento-vencimiento][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

module.exports = {
  listObligaciones,
  getResumen,
  getObligacion,
  crearObligacion,
  actualizarObligacion,
  marcarCumplida,
  listHistorial,
  eliminarObligacion,
  listAdjuntos,
  subirAdjuntos,
  eliminarAdjunto,
  verAdjunto,
  exportarPdf,
  ejecutarAlertaCumplimientoVencimiento,
};
