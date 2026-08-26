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
const { RAT_ADJUNTOS_DIR } = require('../middleware/ratAdjuntoUpload');

const MODULO_AUDIT = 'legal';
const DIAS_ALERTA_ANTICIPACION = 30;

const BASES_LEGALES_VALIDAS = [
  'consentimiento', 'contrato', 'obligacion_legal', 'interes_legitimo',
  'interes_vital', 'funcion_publica', 'obligacion_laboral',
];
const ESTATUS_VALIDOS = ['activa', 'inactiva'];
const TIPOS_ADJUNTO_RAT_VALIDOS = ['aviso_privacidad', 'contrato_encargado', 'dpia', 'otro'];

const SELECT_RAT_BASE = `
  SELECT RAT.RAT_ID as id, RAT.RAT_NOMBRE_ACTIVIDAD as nombreActividad, RAT.RAT_AREA_DUENA as areaDuena,
         RAT.RAT_RESPONSABLE_TRATAMIENTO as responsableTratamiento, RAT.RAT_RESPONSABLE_CONTACTO as responsableContacto,
         RAT.RAT_FINALIDAD as finalidad, RAT.RAT_BASE_LEGAL as baseLegal, RAT.RAT_BASE_LEGAL_DETALLE as baseLegalDetalle,
         RAT.RAT_CATEGORIAS_DATOS as categoriasDatos, RAT.RAT_CATEGORIAS_DATOS_SENSIBLES as categoriasDatosSensibles,
         RAT.RAT_CATEGORIAS_INTERESADOS as categoriasInteresados, RAT.RAT_DESTINATARIOS as destinatarios,
         RAT.RAT_PLAZO_CONSERVACION as plazoConservacion,
         RAT.RAT_MEDIDAS_SEGURIDAD_TECNICAS as medidasSeguridadTecnicas,
         RAT.RAT_MEDIDAS_SEGURIDAD_ORGANIZATIVAS as medidasSeguridadOrganizativas,
         RAT.RAT_TRANSFERENCIA_INTERNACIONAL as transferenciaInternacional,
         RAT.RAT_TRANSFERENCIA_PAIS_DESTINO as transferenciaPaisDestino,
         RAT.RAT_TRANSFERENCIA_GARANTIAS as transferenciaGarantias,
         RAT.RAT_ESTATUS as estatus,
         RAT.RAT_FECHA_ULTIMA_REVISION as fechaUltimaRevision, RAT.RAT_FRECUENCIA_REVISION_MESES as frecuenciaRevisionMeses,
         RAT.RAT_RESPONSABLE_REVISION_ID as responsableRevisionId, U.NEUS_NOMBRES as responsableRevisionNombre,
         RAT.RAT_NOTAS as notas, RAT.RAT_CREATED_AT as createdAt, RAT.RAT_UPDATED_AT as updatedAt,
         CASE
           WHEN RAT.RAT_FECHA_ULTIMA_REVISION IS NULL THEN 'sin_revisar'
           WHEN DATEADD(MONTH, RAT.RAT_FRECUENCIA_REVISION_MESES, RAT.RAT_FECHA_ULTIMA_REVISION) < CAST(GETDATE() AS DATE) THEN 'revision_vencida'
           WHEN DATEADD(MONTH, RAT.RAT_FRECUENCIA_REVISION_MESES, RAT.RAT_FECHA_ULTIMA_REVISION) <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE)) THEN 'revision_proxima'
           ELSE 'al_dia'
         END as estatusRevision
  FROM LEGALES_RAT_ACTIVIDADES RAT
  LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = RAT.RAT_RESPONSABLE_REVISION_ID
`;

function mapRow(r) {
  return {
    ...r,
    categoriasDatosSensibles: !!r.categoriasDatosSensibles,
    transferenciaInternacional: !!r.transferenciaInternacional,
  };
}

// ── Actividades ──────────────────────────────────────────────────────────
async function listActividades(req, res) {
  try {
    const { estatus, baseLegal, estatusRevision } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_RAT_BASE} ORDER BY RAT.RAT_NOMBRE_ACTIVIDAD ASC`);
    let data = rs.recordset.map(mapRow);
    if (estatus && ESTATUS_VALIDOS.includes(estatus)) data = data.filter((a) => a.estatus === estatus);
    if (baseLegal && BASES_LEGALES_VALIDAS.includes(baseLegal)) data = data.filter((a) => a.baseLegal === baseLegal);
    if (estatusRevision) data = data.filter((a) => a.estatusRevision === estatusRevision);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('proteccionDatosController.listActividades', err);
    res.status(500).json({ success: false, message: 'Error al obtener actividades de tratamiento' });
  }
}

async function getResumen(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_RAT_BASE}`);
    const data = rs.recordset.map(mapRow);
    res.json({
      success: true,
      data: {
        activas: data.filter((a) => a.estatus === 'activa').length,
        revisionVencida: data.filter((a) => a.estatusRevision === 'revision_vencida' || a.estatusRevision === 'sin_revisar').length,
        revisionProxima: data.filter((a) => a.estatusRevision === 'revision_proxima').length,
        conTransferenciaInternacional: data.filter((a) => a.transferenciaInternacional).length,
        conDatosSensibles: data.filter((a) => a.categoriasDatosSensibles).length,
      },
    });
  } catch (err) {
    logger.error('proteccionDatosController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function getActividad(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`${SELECT_RAT_BASE} WHERE RAT.RAT_ID=@id`);
    const actividad = rs.recordset[0];
    if (!actividad) return res.status(404).json({ success: false, message: 'Actividad no encontrada' });
    res.json({ success: true, data: mapRow(actividad) });
  } catch (err) {
    logger.error('proteccionDatosController.getActividad', err);
    res.status(500).json({ success: false, message: 'Error al obtener actividad' });
  }
}

function validarPayload(body) {
  const { nombreActividad, responsableTratamiento, finalidad, baseLegal, categoriasDatos, categoriasInteresados, plazoConservacion, transferenciaInternacional, transferenciaPaisDestino } = body;
  if (!nombreActividad || !nombreActividad.trim()) return 'Nombre de la actividad requerido';
  if (!responsableTratamiento || !responsableTratamiento.trim()) return 'Responsable del tratamiento requerido';
  if (!finalidad || !finalidad.trim()) return 'Finalidad requerida';
  if (!BASES_LEGALES_VALIDAS.includes(baseLegal)) return 'Base legal inválida';
  if (!Array.isArray(categoriasDatos) || categoriasDatos.length === 0) return 'Selecciona al menos una categoría de datos';
  if (!Array.isArray(categoriasInteresados) || categoriasInteresados.length === 0) return 'Selecciona al menos una categoría de interesados';
  if (!plazoConservacion || !plazoConservacion.trim()) return 'Plazo de conservación requerido';
  if (transferenciaInternacional && (!transferenciaPaisDestino || !transferenciaPaisDestino.trim())) {
    return 'Indica el país destino de la transferencia internacional';
  }
  return null;
}

async function crearActividad(req, res) {
  try {
    const errorValidacion = validarPayload(req.body);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const {
      nombreActividad, areaDuena, responsableTratamiento, responsableContacto, finalidad,
      baseLegal, baseLegalDetalle, categoriasDatos, categoriasDatosSensibles, categoriasInteresados,
      destinatarios, plazoConservacion, medidasSeguridadTecnicas, medidasSeguridadOrganizativas,
      transferenciaInternacional, transferenciaPaisDestino, transferenciaGarantias,
      frecuenciaRevisionMeses, responsableRevisionId, notas,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombreActividad', sql.NVarChar, nombreActividad.trim())
      .input('areaDuena', sql.NVarChar, areaDuena || null)
      .input('responsableTratamiento', sql.NVarChar, responsableTratamiento.trim())
      .input('responsableContacto', sql.NVarChar, responsableContacto || null)
      .input('finalidad', sql.NVarChar, finalidad.trim())
      .input('baseLegal', sql.NVarChar, baseLegal)
      .input('baseLegalDetalle', sql.NVarChar, baseLegalDetalle || null)
      .input('categoriasDatos', sql.NVarChar, categoriasDatos.join(', '))
      .input('categoriasDatosSensibles', sql.Bit, categoriasDatosSensibles ? 1 : 0)
      .input('categoriasInteresados', sql.NVarChar, categoriasInteresados.join(', '))
      .input('destinatarios', sql.NVarChar, destinatarios || null)
      .input('plazoConservacion', sql.NVarChar, plazoConservacion.trim())
      .input('medidasSeguridadTecnicas', sql.NVarChar, medidasSeguridadTecnicas || null)
      .input('medidasSeguridadOrganizativas', sql.NVarChar, medidasSeguridadOrganizativas || null)
      .input('transferenciaInternacional', sql.Bit, transferenciaInternacional ? 1 : 0)
      .input('transferenciaPaisDestino', sql.NVarChar, transferenciaInternacional ? transferenciaPaisDestino : null)
      .input('transferenciaGarantias', sql.NVarChar, transferenciaInternacional ? (transferenciaGarantias || null) : null)
      .input('frecuenciaRevisionMeses', sql.Int, frecuenciaRevisionMeses || 12)
      .input('responsableRevisionId', sql.Int, responsableRevisionId || null)
      .input('notas', sql.NVarChar, notas || null)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO LEGALES_RAT_ACTIVIDADES (
          RAT_NOMBRE_ACTIVIDAD, RAT_AREA_DUENA, RAT_RESPONSABLE_TRATAMIENTO, RAT_RESPONSABLE_CONTACTO, RAT_FINALIDAD,
          RAT_BASE_LEGAL, RAT_BASE_LEGAL_DETALLE, RAT_CATEGORIAS_DATOS, RAT_CATEGORIAS_DATOS_SENSIBLES, RAT_CATEGORIAS_INTERESADOS,
          RAT_DESTINATARIOS, RAT_PLAZO_CONSERVACION, RAT_MEDIDAS_SEGURIDAD_TECNICAS, RAT_MEDIDAS_SEGURIDAD_ORGANIZATIVAS,
          RAT_TRANSFERENCIA_INTERNACIONAL, RAT_TRANSFERENCIA_PAIS_DESTINO, RAT_TRANSFERENCIA_GARANTIAS,
          RAT_FRECUENCIA_REVISION_MESES, RAT_RESPONSABLE_REVISION_ID, RAT_NOTAS, RAT_CREATED_BY
        )
        OUTPUT INSERTED.RAT_ID as id
        VALUES (
          @nombreActividad, @areaDuena, @responsableTratamiento, @responsableContacto, @finalidad,
          @baseLegal, @baseLegalDetalle, @categoriasDatos, @categoriasDatosSensibles, @categoriasInteresados,
          @destinatarios, @plazoConservacion, @medidasSeguridadTecnicas, @medidasSeguridadOrganizativas,
          @transferenciaInternacional, @transferenciaPaisDestino, @transferenciaGarantias,
          @frecuenciaRevisionMeses, @responsableRevisionId, @notas, @createdBy
        );
      `);
    const id = rs.recordset[0].id;

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'rat-crear',
      entidadId: id, detalle: { nombreActividad, baseLegal }, ip: req.ip,
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('proteccionDatosController.crearActividad', err);
    res.status(500).json({ success: false, message: 'Error al crear actividad de tratamiento' });
  }
}

async function actualizarActividad(req, res) {
  try {
    const { id } = req.params;
    const errorValidacion = validarPayload(req.body);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const {
      nombreActividad, areaDuena, responsableTratamiento, responsableContacto, finalidad,
      baseLegal, baseLegalDetalle, categoriasDatos, categoriasDatosSensibles, categoriasInteresados,
      destinatarios, plazoConservacion, medidasSeguridadTecnicas, medidasSeguridadOrganizativas,
      transferenciaInternacional, transferenciaPaisDestino, transferenciaGarantias,
      frecuenciaRevisionMeses, responsableRevisionId, notas,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombreActividad', sql.NVarChar, nombreActividad.trim())
      .input('areaDuena', sql.NVarChar, areaDuena || null)
      .input('responsableTratamiento', sql.NVarChar, responsableTratamiento.trim())
      .input('responsableContacto', sql.NVarChar, responsableContacto || null)
      .input('finalidad', sql.NVarChar, finalidad.trim())
      .input('baseLegal', sql.NVarChar, baseLegal)
      .input('baseLegalDetalle', sql.NVarChar, baseLegalDetalle || null)
      .input('categoriasDatos', sql.NVarChar, categoriasDatos.join(', '))
      .input('categoriasDatosSensibles', sql.Bit, categoriasDatosSensibles ? 1 : 0)
      .input('categoriasInteresados', sql.NVarChar, categoriasInteresados.join(', '))
      .input('destinatarios', sql.NVarChar, destinatarios || null)
      .input('plazoConservacion', sql.NVarChar, plazoConservacion.trim())
      .input('medidasSeguridadTecnicas', sql.NVarChar, medidasSeguridadTecnicas || null)
      .input('medidasSeguridadOrganizativas', sql.NVarChar, medidasSeguridadOrganizativas || null)
      .input('transferenciaInternacional', sql.Bit, transferenciaInternacional ? 1 : 0)
      .input('transferenciaPaisDestino', sql.NVarChar, transferenciaInternacional ? transferenciaPaisDestino : null)
      .input('transferenciaGarantias', sql.NVarChar, transferenciaInternacional ? (transferenciaGarantias || null) : null)
      .input('frecuenciaRevisionMeses', sql.Int, frecuenciaRevisionMeses || 12)
      .input('responsableRevisionId', sql.Int, responsableRevisionId || null)
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        UPDATE LEGALES_RAT_ACTIVIDADES
        SET RAT_NOMBRE_ACTIVIDAD=@nombreActividad, RAT_AREA_DUENA=@areaDuena, RAT_RESPONSABLE_TRATAMIENTO=@responsableTratamiento,
            RAT_RESPONSABLE_CONTACTO=@responsableContacto, RAT_FINALIDAD=@finalidad, RAT_BASE_LEGAL=@baseLegal,
            RAT_BASE_LEGAL_DETALLE=@baseLegalDetalle, RAT_CATEGORIAS_DATOS=@categoriasDatos,
            RAT_CATEGORIAS_DATOS_SENSIBLES=@categoriasDatosSensibles, RAT_CATEGORIAS_INTERESADOS=@categoriasInteresados,
            RAT_DESTINATARIOS=@destinatarios, RAT_PLAZO_CONSERVACION=@plazoConservacion,
            RAT_MEDIDAS_SEGURIDAD_TECNICAS=@medidasSeguridadTecnicas, RAT_MEDIDAS_SEGURIDAD_ORGANIZATIVAS=@medidasSeguridadOrganizativas,
            RAT_TRANSFERENCIA_INTERNACIONAL=@transferenciaInternacional, RAT_TRANSFERENCIA_PAIS_DESTINO=@transferenciaPaisDestino,
            RAT_TRANSFERENCIA_GARANTIAS=@transferenciaGarantias, RAT_FRECUENCIA_REVISION_MESES=@frecuenciaRevisionMeses,
            RAT_RESPONSABLE_REVISION_ID=@responsableRevisionId, RAT_NOTAS=@notas, RAT_UPDATED_AT=GETDATE()
        WHERE RAT_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'rat-editar',
      entidadId: id, detalle: { nombreActividad }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('proteccionDatosController.actualizarActividad', err);
    res.status(500).json({ success: false, message: 'Error al actualizar actividad de tratamiento' });
  }
}

async function marcarRevisada(req, res) {
  try {
    const { id } = req.params;
    const { fechaRevision } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('fecha', sql.Date, fechaRevision || new Date())
      .query(`UPDATE LEGALES_RAT_ACTIVIDADES SET RAT_FECHA_ULTIMA_REVISION=@fecha, RAT_UPDATED_AT=GETDATE() WHERE RAT_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'rat-revisar',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('proteccionDatosController.marcarRevisada', err);
    res.status(500).json({ success: false, message: 'Error al marcar como revisada' });
  }
}

async function cambiarEstatus(req, res) {
  try {
    const { id } = req.params;
    const { estatus } = req.body;
    if (!ESTATUS_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar, estatus)
      .query(`UPDATE LEGALES_RAT_ACTIVIDADES SET RAT_ESTATUS=@estatus, RAT_UPDATED_AT=GETDATE() WHERE RAT_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'rat-cambiar-estatus',
      entidadId: id, detalle: { estatus }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('proteccionDatosController.cambiarEstatus', err);
    res.status(500).json({ success: false, message: 'Error al cambiar estatus' });
  }
}

async function eliminarActividad(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const adjuntosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT RATA_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_RAT_ADJUNTOS WHERE RATA_ACTIVIDAD_ID=@id`);
    for (const adj of adjuntosRs.recordset) {
      try {
        const filePath = path.join(RAT_ADJUNTOS_DIR, path.basename(adj.nombreArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('proteccionDatosController.eliminarActividad fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_RAT_ADJUNTOS WHERE RATA_ACTIVIDAD_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_RAT_ALERTAS_LOG WHERE RATL_ACTIVIDAD_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_RAT_ACTIVIDADES WHERE RAT_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'rat-eliminar',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('proteccionDatosController.eliminarActividad', err);
    res.status(500).json({ success: false, message: 'Error al eliminar actividad de tratamiento' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('actividadId', sql.Int, id)
      .query(`
        SELECT RATA.RATA_ID as id, RATA.RATA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               RATA.RATA_TIPO as tipo, RATA.RATA_NOMBRE_ORIGINAL as nombreOriginal, RATA.RATA_MIME as mime,
               RATA.RATA_TAMANIO as tamanio, RATA.RATA_CREATED_AT as createdAt
        FROM LEGALES_RAT_ADJUNTOS RATA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = RATA.RATA_USUARIO_ID
        WHERE RATA.RATA_ACTIVIDAD_ID=@actividadId
        ORDER BY RATA.RATA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('proteccionDatosController.listAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntos(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const tipo = TIPOS_ADJUNTO_RAT_VALIDOS.includes(req.body.tipo) ? req.body.tipo : 'otro';
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const actividadRs = await pool.request().input('id', sql.Int, id).query(`SELECT RAT_ID as id FROM LEGALES_RAT_ACTIVIDADES WHERE RAT_ID=@id`);
    if (!actividadRs.recordset[0]) return res.status(404).json({ success: false, message: 'Actividad no encontrada' });

    for (const file of req.files) {
      await pool.request()
        .input('actividadId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('tipo', sql.NVarChar, tipo)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO LEGALES_RAT_ADJUNTOS (RATA_ACTIVIDAD_ID, RATA_USUARIO_ID, RATA_TIPO, RATA_NOMBRE_ARCHIVO, RATA_NOMBRE_ORIGINAL, RATA_MIME, RATA_TAMANIO)
          VALUES (@actividadId, @usuarioId, @tipo, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'rat-subir-adjunto',
      entidadId: id, detalle: { cantidad: req.files.length, tipo }, ip: req.ip,
    });

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('proteccionDatosController.subirAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT RATA_NOMBRE_ARCHIVO as nombreArchivo FROM LEGALES_RAT_ADJUNTOS WHERE RATA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM LEGALES_RAT_ADJUNTOS WHERE RATA_ID=@id`);

    try {
      const filePath = path.join(RAT_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('proteccionDatosController.eliminarAdjunto fs', fsErr?.message || fsErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('proteccionDatosController.eliminarAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT RATA_NOMBRE_ARCHIVO as nombreArchivo, RATA_NOMBRE_ORIGINAL as nombreOriginal FROM LEGALES_RAT_ADJUNTOS WHERE RATA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(RAT_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('proteccionDatosController.verAdjunto stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('proteccionDatosController.verAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
const BASE_LEGAL_LABEL = {
  consentimiento: 'Consentimiento', contrato: 'Ejecución de contrato', obligacion_legal: 'Obligación legal',
  interes_legitimo: 'Interés legítimo', interes_vital: 'Interés vital', funcion_publica: 'Función pública',
  obligacion_laboral: 'Obligación laboral',
};

async function exportarPdf(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`${SELECT_RAT_BASE} ORDER BY RAT.RAT_NOMBRE_ACTIVIDAD ASC`);
    const actividades = rs.recordset.map(mapRow);

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
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Protección de datos', M, 38);
        doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
        return 132;
      };

      let y = drawHeader('Registro de Actividades de Tratamiento (RAT)');
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H - M) {
          doc.addPage();
          y = drawHeader('Registro de Actividades de Tratamiento (RAT) (cont.)');
        }
      };

      if (actividades.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay actividades de tratamiento registradas.', M, y);
      }

      actividades.forEach((a) => {
        ensureSpace(90);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0D1B3E')
          .text(a.nombreActividad, M, y, { width: PAGE_W - M * 2 });
        y += 15;

        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(
            `${a.responsableTratamiento}  ·  ${BASE_LEGAL_LABEL[a.baseLegal] || a.baseLegal}` +
            (a.transferenciaInternacional ? '  ·  Transferencia internacional' : '') +
            (a.categoriasDatosSensibles ? '  ·  Datos sensibles' : ''),
            M, y, { width: PAGE_W - M * 2 },
          );
        y += 14;

        doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
          .text(`Finalidad: ${a.finalidad}`, M, y, { width: PAGE_W - M * 2 });
        y += 14;
        doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
          .text(`Datos: ${a.categoriasDatos}  ·  Interesados: ${a.categoriasInteresados}`, M, y, { width: PAGE_W - M * 2 });
        y += 14;
        doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
          .text(`Conservación: ${a.plazoConservacion}`, M, y, { width: PAGE_W - M * 2 });
        y += 16;

        doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
        y += 14;
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="rat_proteccion_datos.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('proteccionDatosController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Alertas de revisión pendiente (cron) ────────────────────────────────
async function ejecutarAlertaRatRevision(pool, tenantKey) {
  try {
    const candidatosRs = await pool.request()
      .input('dias', sql.Int, DIAS_ALERTA_ANTICIPACION)
      .query(`
        SELECT RAT_ID as id, RAT_NOMBRE_ACTIVIDAD as nombreActividad, RAT_RESPONSABLE_REVISION_ID as responsableRevisionId,
               COALESCE(
                 DATEADD(MONTH, RAT_FRECUENCIA_REVISION_MESES, RAT_FECHA_ULTIMA_REVISION),
                 DATEADD(MONTH, RAT_FRECUENCIA_REVISION_MESES, CAST(RAT_CREATED_AT AS DATE))
               ) as fechaLimite
        FROM LEGALES_RAT_ACTIVIDADES
        WHERE RAT_ESTATUS = 'activa'
          AND COALESCE(
                DATEADD(MONTH, RAT_FRECUENCIA_REVISION_MESES, RAT_FECHA_ULTIMA_REVISION),
                DATEADD(MONTH, RAT_FRECUENCIA_REVISION_MESES, CAST(RAT_CREATED_AT AS DATE))
              ) <= DATEADD(DAY, @dias, CAST(GETDATE() AS DATE))
          AND NOT EXISTS (
            SELECT 1 FROM LEGALES_RAT_ALERTAS_LOG
            WHERE RATL_ACTIVIDAD_ID = LEGALES_RAT_ACTIVIDADES.RAT_ID
              AND CAST(RATL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    const usuariosCorreo = await getUsuariosParaNotificarCorreo(MODULO_AUDIT, tenantKey);

    for (const actividad of candidatosRs.recordset) {
      const destinatariosInApp = new Set([actividad.responsableRevisionId, ...usuariosCorreo].filter(Boolean));
      for (const usuarioId of destinatariosInApp) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: `La actividad de tratamiento "${actividad.nombreActividad}" requiere revisión`,
          tipo: 'rat_revision_pendiente',
          dataExtra: { actividadId: actividad.id },
          tenantKey,
        });
      }

      const idsCorreo = [actividad.responsableRevisionId, ...usuariosCorreo].filter(Boolean);
      if (idsCorreo.length) {
        const correosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${idsCorreo.join(',') || '0'})`);
        const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);
        if (correos.length) {
          await emailService.sendRatRevisionPendienteEmail({
            to: correos,
            nombreActividad: actividad.nombreActividad,
            fechaLimite: actividad.fechaLimite,
          });
        }
      }

      await pool.request().input('actividadId', sql.Int, actividad.id)
        .query(`INSERT INTO LEGALES_RAT_ALERTAS_LOG (RATL_ACTIVIDAD_ID) VALUES (@actividadId)`);
    }
  } catch (err) {
    logger.error('proteccionDatosController.ejecutarAlertaRatRevision', err);
  }
}

cron.schedule('30 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaRatRevision(pool, key);
    } catch (err) {
      logger.error(`[CRON rat-revision][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

module.exports = {
  listActividades,
  getResumen,
  getActividad,
  crearActividad,
  actualizarActividad,
  marcarRevisada,
  cambiarEstatus,
  eliminarActividad,
  listAdjuntos,
  subirAdjuntos,
  eliminarAdjunto,
  verAdjunto,
  exportarPdf,
  ejecutarAlertaRatRevision,
};
