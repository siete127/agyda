const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const { CONTROL_DOCUMENTAL_DIR } = require('../middleware/controlDocumentalUpload');

const MODULO_AUDIT = 'legal';
const CATEGORIAS_VALIDAS = ['politica', 'contrato_tipo', 'formato', 'plantilla', 'manual', 'otro'];
const ESTADOS_VIGENCIA_VALIDOS = ['vigente', 'en_revision', 'obsoleto'];

const CATEGORIA_LABEL = {
  politica: 'Política', contrato_tipo: 'Contrato tipo', formato: 'Formato',
  plantilla: 'Plantilla', manual: 'Manual', otro: 'Otro',
};
const ESTADO_VIGENCIA_LABEL = { vigente: 'Vigente', en_revision: 'En revisión', obsoleto: 'Obsoleto' };

const SELECT_CD_BASE = `
  SELECT CD.CD_ID as id, CD.CD_TITULO as titulo, CD.CD_CATEGORIA as categoria, CD.CD_DESCRIPCION as descripcion,
         CD.CD_ESTADO_VIGENCIA as estadoVigencia, CD.CD_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre,
         CD.CD_CREATED_AT as createdAt, CD.CD_UPDATED_AT as updatedAt,
         (SELECT MAX(V.CDV_NUMERO_VERSION) FROM LEGALES_CTRLDOC_VERSIONES V WHERE V.CDV_DOCUMENTO_ID = CD.CD_ID) as versionVigente,
         (SELECT COUNT(*) FROM LEGALES_CTRLDOC_VERSIONES V WHERE V.CDV_DOCUMENTO_ID = CD.CD_ID) as totalVersiones
  FROM LEGALES_CTRLDOC_DOCUMENTOS CD
  LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CD.CD_RESPONSABLE_ID
`;

function eliminarArchivoBestEffort(nombreArchivo) {
  try {
    const filePath = path.join(CONTROL_DOCUMENTAL_DIR, path.basename(nombreArchivo));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (fsErr) {
    logger.warn('controlDocumentalController eliminarArchivoBestEffort', fsErr?.message || fsErr);
  }
}

// ── Documentos ───────────────────────────────────────────────────────────
async function listDocumentos(req, res) {
  try {
    const { categoria, estadoVigencia, busqueda } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CD_BASE} ORDER BY CD.CD_TITULO ASC`);
    let data = rs.recordset;
    if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) data = data.filter((d) => d.categoria === categoria);
    if (estadoVigencia && ESTADOS_VIGENCIA_VALIDOS.includes(estadoVigencia)) data = data.filter((d) => d.estadoVigencia === estadoVigencia);
    if (busqueda) data = data.filter((d) => d.titulo.toLowerCase().includes(String(busqueda).toLowerCase()));
    res.json({ success: true, data });
  } catch (err) {
    logger.error('controlDocumentalController.listDocumentos', err);
    res.status(500).json({ success: false, message: 'Error al obtener documentos' });
  }
}

async function getResumen(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CD_BASE}`);
    const data = rs.recordset;
    const porCategoria = {};
    for (const cat of CATEGORIAS_VALIDAS) porCategoria[cat] = data.filter((d) => d.categoria === cat).length;
    res.json({
      success: true,
      data: {
        total: data.length,
        vigentes: data.filter((d) => d.estadoVigencia === 'vigente').length,
        enRevision: data.filter((d) => d.estadoVigencia === 'en_revision').length,
        obsoletos: data.filter((d) => d.estadoVigencia === 'obsoleto').length,
        porCategoria,
      },
    });
  } catch (err) {
    logger.error('controlDocumentalController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function getDocumento(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`${SELECT_CD_BASE} WHERE CD.CD_ID=@id`);
    const documento = rs.recordset[0];
    if (!documento) return res.status(404).json({ success: false, message: 'Documento no encontrado' });
    res.json({ success: true, data: documento });
  } catch (err) {
    logger.error('controlDocumentalController.getDocumento', err);
    res.status(500).json({ success: false, message: 'Error al obtener documento' });
  }
}

async function crearDocumento(req, res) {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const { titulo, categoria, descripcion, responsableId, notaCambio } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo requerido' });
    if (!titulo || !titulo.trim()) {
      eliminarArchivoBestEffort(req.file.filename);
      return res.status(400).json({ success: false, message: 'Título requerido' });
    }
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      eliminarArchivoBestEffort(req.file.filename);
      return res.status(400).json({ success: false, message: 'Categoría inválida' });
    }

    await transaction.begin();

    const docRs = await new sql.Request(transaction)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('categoria', sql.NVarChar, categoria)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO LEGALES_CTRLDOC_DOCUMENTOS (CD_TITULO, CD_CATEGORIA, CD_DESCRIPCION, CD_RESPONSABLE_ID, CD_CREATED_BY)
        OUTPUT INSERTED.CD_ID as id
        VALUES (@titulo, @categoria, @descripcion, @responsableId, @createdBy);
      `);
    const documentoId = docRs.recordset[0].id;

    await new sql.Request(transaction)
      .input('documentoId', sql.Int, documentoId)
      .input('numeroVersion', sql.Int, 1)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .input('mime', sql.NVarChar, req.file.mimetype)
      .input('tamanio', sql.Int, req.file.size)
      .input('usuarioId', sql.Int, req.user?.id || null)
      .input('notaCambio', sql.NVarChar, notaCambio || 'Versión inicial')
      .query(`
        INSERT INTO LEGALES_CTRLDOC_VERSIONES (CDV_DOCUMENTO_ID, CDV_NUMERO_VERSION, CDV_NOMBRE_ARCHIVO, CDV_NOMBRE_ORIGINAL, CDV_MIME, CDV_TAMANIO, CDV_USUARIO_ID, CDV_NOTA_CAMBIO)
        VALUES (@documentoId, @numeroVersion, @nombreArchivo, @nombreOriginal, @mime, @tamanio, @usuarioId, @notaCambio);
      `);

    await transaction.commit();

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'documento-crear',
      entidadId: documentoId, detalle: { titulo, categoria }, ip: req.ip,
    });

    res.json({ success: true, data: { id: documentoId } });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    if (req.file) eliminarArchivoBestEffort(req.file.filename);
    logger.error('controlDocumentalController.crearDocumento', err);
    res.status(500).json({ success: false, message: 'Error al crear documento' });
  }
}

async function actualizarMetadata(req, res) {
  try {
    const { id } = req.params;
    const { titulo, categoria, descripcion, responsableId } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ success: false, message: 'Categoría inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('categoria', sql.NVarChar, categoria)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('responsableId', sql.Int, responsableId || null)
      .query(`
        UPDATE LEGALES_CTRLDOC_DOCUMENTOS
        SET CD_TITULO=@titulo, CD_CATEGORIA=@categoria, CD_DESCRIPCION=@descripcion, CD_RESPONSABLE_ID=@responsableId, CD_UPDATED_AT=GETDATE()
        WHERE CD_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'documento-editar',
      entidadId: id, detalle: { titulo, categoria }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('controlDocumentalController.actualizarMetadata', err);
    res.status(500).json({ success: false, message: 'Error al actualizar documento' });
  }
}

async function cambiarEstadoVigencia(req, res) {
  try {
    const { id } = req.params;
    const { estadoVigencia } = req.body;
    if (!ESTADOS_VIGENCIA_VALIDOS.includes(estadoVigencia)) return res.status(400).json({ success: false, message: 'Estado de vigencia inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('estadoVigencia', sql.NVarChar, estadoVigencia)
      .query(`UPDATE LEGALES_CTRLDOC_DOCUMENTOS SET CD_ESTADO_VIGENCIA=@estadoVigencia, CD_UPDATED_AT=GETDATE() WHERE CD_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'documento-cambiar-estado',
      entidadId: id, detalle: { estadoVigencia }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('controlDocumentalController.cambiarEstadoVigencia', err);
    res.status(500).json({ success: false, message: 'Error al cambiar estado de vigencia' });
  }
}

async function subirNuevaVersion(req, res) {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const { id } = req.params;
    const { notaCambio } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo requerido' });
    if (!notaCambio || !notaCambio.trim()) {
      eliminarArchivoBestEffort(req.file.filename);
      return res.status(400).json({ success: false, message: 'Nota de cambio requerida' });
    }

    const docRs = await pool.request().input('id', sql.Int, id).query(`SELECT CD_ID as id FROM LEGALES_CTRLDOC_DOCUMENTOS WHERE CD_ID=@id`);
    if (!docRs.recordset[0]) {
      eliminarArchivoBestEffort(req.file.filename);
      return res.status(404).json({ success: false, message: 'Documento no encontrado' });
    }

    await transaction.begin();

    const siguienteRs = await new sql.Request(transaction)
      .input('documentoId', sql.Int, id)
      .query(`SELECT ISNULL(MAX(CDV_NUMERO_VERSION),0)+1 as siguiente FROM LEGALES_CTRLDOC_VERSIONES WITH (UPDLOCK, HOLDLOCK) WHERE CDV_DOCUMENTO_ID=@documentoId`);
    const numeroVersion = siguienteRs.recordset[0].siguiente;

    await new sql.Request(transaction)
      .input('documentoId', sql.Int, id)
      .input('numeroVersion', sql.Int, numeroVersion)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .input('mime', sql.NVarChar, req.file.mimetype)
      .input('tamanio', sql.Int, req.file.size)
      .input('usuarioId', sql.Int, req.user?.id || null)
      .input('notaCambio', sql.NVarChar, notaCambio.trim())
      .query(`
        INSERT INTO LEGALES_CTRLDOC_VERSIONES (CDV_DOCUMENTO_ID, CDV_NUMERO_VERSION, CDV_NOMBRE_ARCHIVO, CDV_NOMBRE_ORIGINAL, CDV_MIME, CDV_TAMANIO, CDV_USUARIO_ID, CDV_NOTA_CAMBIO)
        VALUES (@documentoId, @numeroVersion, @nombreArchivo, @nombreOriginal, @mime, @tamanio, @usuarioId, @notaCambio);
      `);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`UPDATE LEGALES_CTRLDOC_DOCUMENTOS SET CD_UPDATED_AT=GETDATE() WHERE CD_ID=@id`);

    await transaction.commit();

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'documento-subir-version',
      entidadId: id, detalle: { numeroVersion, notaCambio }, ip: req.ip,
    });

    res.json({ success: true, data: { numeroVersion } });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    if (req.file) eliminarArchivoBestEffort(req.file.filename);
    logger.error('controlDocumentalController.subirNuevaVersion', err);
    res.status(500).json({ success: false, message: 'Error al subir nueva versión' });
  }
}

async function listVersiones(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('documentoId', sql.Int, id)
      .query(`
        SELECT CDV.CDV_ID as id, CDV.CDV_NUMERO_VERSION as numeroVersion, CDV.CDV_NOMBRE_ORIGINAL as nombreOriginal,
               CDV.CDV_MIME as mime, CDV.CDV_TAMANIO as tamanio, CDV.CDV_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as usuarioNombre,
               CDV.CDV_NOTA_CAMBIO as notaCambio, CDV.CDV_CREATED_AT as createdAt
        FROM LEGALES_CTRLDOC_VERSIONES CDV
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CDV.CDV_USUARIO_ID
        WHERE CDV.CDV_DOCUMENTO_ID=@documentoId
        ORDER BY CDV.CDV_NUMERO_VERSION DESC
      `);
    const versiones = rs.recordset;
    const maxVersion = versiones.length ? Math.max(...versiones.map((v) => v.numeroVersion)) : 0;
    res.json({ success: true, data: versiones.map((v) => ({ ...v, esVigente: v.numeroVersion === maxVersion })) });
  } catch (err) {
    logger.error('controlDocumentalController.listVersiones', err);
    res.status(500).json({ success: false, message: 'Error al obtener versiones' });
  }
}

const EXT_CONTENT_TYPE = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const EXT_INLINE = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

async function verVersion(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CDV_NOMBRE_ARCHIVO as nombreArchivo, CDV_NOMBRE_ORIGINAL as nombreOriginal FROM LEGALES_CTRLDOC_VERSIONES WHERE CDV_ID=@id`);
    const version = rs.recordset[0];
    if (!version) return res.status(404).json({ success: false, message: 'Versión no encontrada' });

    const filename = path.basename(version.nombreArchivo);
    const filePath = path.join(CONTROL_DOCUMENTAL_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const contentType = EXT_CONTENT_TYPE[ext];
    if (!contentType) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', contentType);
    const disposition = EXT_INLINE.has(ext) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(version.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('controlDocumentalController.verVersion stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('controlDocumentalController.verVersion', err);
    res.status(500).json({ success: false, message: 'Error al servir versión' });
  }
}

async function eliminarDocumento(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const versionesRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CDV_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_CTRLDOC_VERSIONES WHERE CDV_DOCUMENTO_ID=@id`);
    for (const v of versionesRs.recordset) {
      eliminarArchivoBestEffort(v.nombreArchivo);
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CTRLDOC_VERSIONES WHERE CDV_DOCUMENTO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_CTRLDOC_DOCUMENTOS WHERE CD_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'documento-eliminar',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('controlDocumentalController.eliminarDocumento', err);
    res.status(500).json({ success: false, message: 'Error al eliminar documento' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
async function exportarPdf(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_CD_BASE} ORDER BY CD.CD_TITULO ASC`);
    const documentos = rs.recordset;

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
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Control documental', M, 38);
        doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
        return 132;
      };

      let y = drawHeader('Control documental — Documentos');
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H - M) {
          doc.addPage();
          y = drawHeader('Control documental — Documentos (cont.)');
        }
      };

      if (documentos.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay documentos registrados.', M, y);
      }

      documentos.forEach((d) => {
        ensureSpace(60);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0D1B3E')
          .text(d.titulo, M, y, { width: PAGE_W - M * 2 });
        y += 15;

        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(
            `${CATEGORIA_LABEL[d.categoria] || d.categoria}  ·  ${d.responsableNombre || '—'}  ·  ${ESTADO_VIGENCIA_LABEL[d.estadoVigencia] || d.estadoVigencia}`,
            M, y, { width: PAGE_W - M * 2 },
          );
        y += 14;

        doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
          .text(`Versión vigente: v${d.versionVigente || 0}  ·  Última actualización: ${new Date(d.updatedAt).toLocaleDateString()}`, M, y, { width: PAGE_W - M * 2 });
        y += 16;

        doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
        y += 14;
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="control_documental.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('controlDocumentalController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

module.exports = {
  listDocumentos,
  getResumen,
  getDocumento,
  crearDocumento,
  actualizarMetadata,
  cambiarEstadoVigencia,
  subirNuevaVersion,
  listVersiones,
  verVersion,
  eliminarDocumento,
  exportarPdf,
};
