const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const { AREA_LABELS } = require('../constants/areas');
const notificationService = require('../services/notificationService');
const { MC_ADJUNTOS_DIR } = require('../middleware/mejoraContinuaAdjuntoUpload');
const PDFDocument = require('pdfkit');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const emailService = require('../services/emailService');

const MODULO_AUDIT = 'mejora-continua';
const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];
const ESTATUS_HALLAZGO = ['registrado', 'en_analisis_causa', 'plan_definido', 'en_ejecucion', 'pendiente_verificacion', 'verificado_eficaz', 'cerrado', 'reabierto'];
const TIPOS_HALLAZGO = ['no_conformidad', 'oportunidad_mejora', 'observacion', 'incidente', 'queja_cliente'];
const ORIGENES_HALLAZGO = ['auditoria_interna', 'auditoria_externa', 'cliente', 'proceso', 'inspeccion', 'denuncia'];
const NIVELES_IMPACTO = ['bajo', 'medio', 'alto'];
const TIPOS_ACCION = ['contencion', 'correctiva', 'preventiva'];
const ESTATUS_ACCION = ['pendiente', 'en_proceso', 'completada'];

const DIAS_VENCIMIENTO_ALERTA = 2;

const HALLAZGO_SELECT_FIELDS = `
  MH.MH_ID as id, MH.MH_FOLIO as folio, MH.MH_TITULO as titulo, MH.MH_DESCRIPCION as descripcion,
  MH.MH_AREA_ORIGEN as areaOrigen, MH.MH_TIPO as tipo, MH.MH_ORIGEN as origen,
  MH.MH_REQUISITO_INCUMPLIDO as requisitoIncumplido,
  MH.MH_IMPACTO_COSTO as impactoCosto, MH.MH_IMPACTO_CLIENTE as impactoCliente, MH.MH_IMPACTO_LEGAL as impactoLegal,
  MH.MH_SEVERIDAD as severidad, MH.MH_ESTATUS as estatus,
  MH.MH_PORQUE_1 as porque1, MH.MH_PORQUE_2 as porque2, MH.MH_PORQUE_3 as porque3, MH.MH_PORQUE_4 as porque4, MH.MH_PORQUE_5 as porque5,
  MH.MH_CAUSA_RAIZ as causaRaiz,
  MH.MH_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre,
  MH.MH_FECHA_DETECCION as fechaDeteccion, MH.MH_FECHA_COMPROMISO as fechaCompromiso,
  MH.MH_VERIFICADO_POR as verificadoPor, MH.MH_FECHA_VERIFICACION as fechaVerificacion,
  MH.MH_EVIDENCIA_CIERRE as evidenciaCierre, MH.MH_EFICAZ as eficaz,
  MH.MH_CREATED_AT as createdAt, MH.MH_UPDATED_AT as updatedAt
`;

function generarFolioEnTransaccion(transaction) {
  const anio = new Date().getFullYear();
  return new sql.Request(transaction)
    .input('prefijo', sql.NVarChar, `NC-${anio}-`)
    .query(`
      SELECT MAX(CAST(SUBSTRING(MH_FOLIO, LEN(@prefijo) + 1, 10) AS INT)) as maxConsecutivo
      FROM MC_HALLAZGOS WITH (UPDLOCK, HOLDLOCK)
      WHERE MH_FOLIO LIKE @prefijo + '%'
    `)
    .then((rs) => {
      const siguiente = (rs.recordset[0].maxConsecutivo || 0) + 1;
      return `NC-${anio}-${String(siguiente).padStart(4, '0')}`;
    });
}

// ── Hallazgos ────────────────────────────────────────────────────────────
async function listHallazgos(req, res) {
  try {
    const { estatus, area, severidad, responsableId, fechaDesde, fechaHasta } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const condiciones = [];
    const request = pool.request();
    if (estatus) { condiciones.push('MH.MH_ESTATUS = @estatus'); request.input('estatus', sql.NVarChar, estatus); }
    if (area) { condiciones.push('MH.MH_AREA_ORIGEN = @area'); request.input('area', sql.NVarChar, area); }
    if (severidad) { condiciones.push('MH.MH_SEVERIDAD = @severidad'); request.input('severidad', sql.NVarChar, severidad); }
    if (responsableId) { condiciones.push('MH.MH_RESPONSABLE_ID = @responsableId'); request.input('responsableId', sql.Int, responsableId); }
    if (fechaDesde) { condiciones.push('MH.MH_FECHA_DETECCION >= @fechaDesde'); request.input('fechaDesde', sql.Date, fechaDesde); }
    if (fechaHasta) { condiciones.push('MH.MH_FECHA_DETECCION <= @fechaHasta'); request.input('fechaHasta', sql.Date, fechaHasta); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const rs = await request.query(`
      SELECT ${HALLAZGO_SELECT_FIELDS}
      FROM MC_HALLAZGOS MH
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MH.MH_RESPONSABLE_ID
      ${where}
      ORDER BY MH.MH_CREATED_AT DESC
    `);

    const hallazgos = rs.recordset;
    const ids = hallazgos.map((h) => h.id);
    let accionesPorHallazgo = new Map();
    let comentariosPorHallazgo = new Map();
    let adjuntosPorHallazgo = new Map();

    if (ids.length) {
      const accionesRs = await pool.request()
        .query(`SELECT MA_HALLAZGO_ID as hallazgoId, MA_ESTATUS as estatus FROM MC_ACCIONES WHERE MA_HALLAZGO_ID IN (${ids.join(',')})`);
      for (const a of accionesRs.recordset) {
        const cur = accionesPorHallazgo.get(a.hallazgoId) || { total: 0, pendientes: 0 };
        cur.total++;
        if (a.estatus !== 'completada') cur.pendientes++;
        accionesPorHallazgo.set(a.hallazgoId, cur);
      }

      const comentariosRs = await pool.request()
        .query(`SELECT MCM_HALLAZGO_ID as hallazgoId, COUNT(*) as total FROM MC_COMENTARIOS WHERE MCM_HALLAZGO_ID IN (${ids.join(',')}) GROUP BY MCM_HALLAZGO_ID`);
      comentariosPorHallazgo = new Map(comentariosRs.recordset.map((c) => [c.hallazgoId, c.total]));

      const adjuntosRs = await pool.request()
        .query(`SELECT MCA_HALLAZGO_ID as hallazgoId, COUNT(*) as total FROM MC_ADJUNTOS WHERE MCA_HALLAZGO_ID IN (${ids.join(',')}) GROUP BY MCA_HALLAZGO_ID`);
      adjuntosPorHallazgo = new Map(adjuntosRs.recordset.map((a) => [a.hallazgoId, a.total]));
    }

    const data = hallazgos.map((h) => ({
      ...h,
      areaOrigenLabel: h.areaOrigen ? (AREA_LABELS[h.areaOrigen] || h.areaOrigen) : null,
      vencido: !!(h.fechaCompromiso && h.estatus !== 'cerrado' && new Date(h.fechaCompromiso) < new Date()),
      accionesTotal: accionesPorHallazgo.get(h.id)?.total || 0,
      accionesPendientes: accionesPorHallazgo.get(h.id)?.pendientes || 0,
      comentariosCount: comentariosPorHallazgo.get(h.id) || 0,
      adjuntosCount: adjuntosPorHallazgo.get(h.id) || 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    logger.error('mejoraContinuaController.listHallazgos', err);
    res.status(500).json({ success: false, message: 'Error al obtener hallazgos' });
  }
}

async function crearHallazgo(req, res) {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const {
      titulo, descripcion, areaOrigen, tipo, origen, requisitoIncumplido,
      impactoCosto, impactoCliente, impactoLegal,
      severidad, responsableId, fechaDeteccion, fechaCompromiso,
    } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    const sev = SEVERIDADES.includes(severidad) ? severidad : 'media';
    const tipoHallazgo = TIPOS_HALLAZGO.includes(tipo) ? tipo : 'no_conformidad';
    const origenHallazgo = ORIGENES_HALLAZGO.includes(origen) ? origen : null;
    const impCosto = NIVELES_IMPACTO.includes(impactoCosto) ? impactoCosto : null;
    const impCliente = NIVELES_IMPACTO.includes(impactoCliente) ? impactoCliente : null;
    const impLegal = NIVELES_IMPACTO.includes(impactoLegal) ? impactoLegal : null;

    await transaction.begin();
    const folio = await generarFolioEnTransaccion(transaction);

    const rs = await new sql.Request(transaction)
      .input('folio', sql.NVarChar, folio)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('areaOrigen', sql.NVarChar, areaOrigen || null)
      .input('tipo', sql.NVarChar, tipoHallazgo)
      .input('origen', sql.NVarChar, origenHallazgo)
      .input('requisitoIncumplido', sql.NVarChar, requisitoIncumplido || null)
      .input('impactoCosto', sql.NVarChar, impCosto)
      .input('impactoCliente', sql.NVarChar, impCliente)
      .input('impactoLegal', sql.NVarChar, impLegal)
      .input('severidad', sql.NVarChar, sev)
      .input('responsableId', sql.Int, responsableId || null)
      .input('fechaDeteccion', sql.DateTime, fechaDeteccion || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO MC_HALLAZGOS (
          MH_FOLIO, MH_TITULO, MH_DESCRIPCION, MH_AREA_ORIGEN, MH_TIPO, MH_ORIGEN, MH_REQUISITO_INCUMPLIDO,
          MH_IMPACTO_COSTO, MH_IMPACTO_CLIENTE, MH_IMPACTO_LEGAL, MH_SEVERIDAD, MH_RESPONSABLE_ID,
          MH_FECHA_DETECCION, MH_FECHA_COMPROMISO, MH_CREATED_BY
        )
        OUTPUT INSERTED.MH_ID as id
        VALUES (
          @folio, @titulo, @descripcion, @areaOrigen, @tipo, @origen, @requisitoIncumplido,
          @impactoCosto, @impactoCliente, @impactoLegal, @severidad, @responsableId,
          COALESCE(@fechaDeteccion, GETDATE()), @fechaCompromiso, @createdBy
        );
      `);

    await transaction.commit();

    const id = rs.recordset[0].id;
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-hallazgo',
      entidadId: id, detalle: { folio, titulo, severidad: sev }, ip: req.ip,
    });

    if (responsableId) {
      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: `Se te asignó el hallazgo ${folio}: ${titulo.trim()}`,
        tipo: 'mc_asignacion',
        dataExtra: { hallazgoId: id },
        tenantKey: req.user?.empresa,
      });
    }

    res.json({ success: true, data: { id, folio } });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    logger.error('mejoraContinuaController.crearHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al crear hallazgo' });
  }
}

async function actualizarHallazgo(req, res) {
  try {
    const { id } = req.params;
    const {
      titulo, descripcion, areaOrigen, tipo, origen, requisitoIncumplido,
      impactoCosto, impactoCliente, impactoLegal,
      severidad, estatus, porque1, porque2, porque3, porque4, porque5, causaRaiz,
      responsableId, fechaDeteccion, fechaCompromiso,
    } = req.body;
    if (estatus && !ESTATUS_HALLAZGO.includes(estatus)) {
      return res.status(400).json({ success: false, message: 'Estatus inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    const actualRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MH_RESPONSABLE_ID as responsableId, MH_FOLIO as folio FROM MC_HALLAZGOS WHERE MH_ID=@id`);
    const actual = actualRs.recordset[0];
    if (!actual) return res.status(404).json({ success: false, message: 'Hallazgo no encontrado' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('areaOrigen', sql.NVarChar, areaOrigen || null)
      .input('tipo', sql.NVarChar, TIPOS_HALLAZGO.includes(tipo) ? tipo : 'no_conformidad')
      .input('origen', sql.NVarChar, ORIGENES_HALLAZGO.includes(origen) ? origen : null)
      .input('requisitoIncumplido', sql.NVarChar, requisitoIncumplido || null)
      .input('impactoCosto', sql.NVarChar, NIVELES_IMPACTO.includes(impactoCosto) ? impactoCosto : null)
      .input('impactoCliente', sql.NVarChar, NIVELES_IMPACTO.includes(impactoCliente) ? impactoCliente : null)
      .input('impactoLegal', sql.NVarChar, NIVELES_IMPACTO.includes(impactoLegal) ? impactoLegal : null)
      .input('severidad', sql.NVarChar, SEVERIDADES.includes(severidad) ? severidad : 'media')
      .input('estatus', sql.NVarChar, estatus || 'registrado')
      .input('porque1', sql.NVarChar, porque1 || null)
      .input('porque2', sql.NVarChar, porque2 || null)
      .input('porque3', sql.NVarChar, porque3 || null)
      .input('porque4', sql.NVarChar, porque4 || null)
      .input('porque5', sql.NVarChar, porque5 || null)
      .input('causaRaiz', sql.NVarChar, causaRaiz || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('fechaDeteccion', sql.DateTime, fechaDeteccion || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .query(`
        UPDATE MC_HALLAZGOS
        SET MH_TITULO=@titulo, MH_DESCRIPCION=@descripcion, MH_AREA_ORIGEN=@areaOrigen, MH_TIPO=@tipo, MH_ORIGEN=@origen,
            MH_REQUISITO_INCUMPLIDO=@requisitoIncumplido, MH_IMPACTO_COSTO=@impactoCosto, MH_IMPACTO_CLIENTE=@impactoCliente,
            MH_IMPACTO_LEGAL=@impactoLegal, MH_SEVERIDAD=@severidad, MH_ESTATUS=@estatus,
            MH_PORQUE_1=@porque1, MH_PORQUE_2=@porque2, MH_PORQUE_3=@porque3, MH_PORQUE_4=@porque4, MH_PORQUE_5=@porque5,
            MH_CAUSA_RAIZ=@causaRaiz, MH_RESPONSABLE_ID=@responsableId,
            MH_FECHA_DETECCION=COALESCE(@fechaDeteccion, MH_FECHA_DETECCION), MH_FECHA_COMPROMISO=@fechaCompromiso,
            MH_UPDATED_AT=GETDATE()
        WHERE MH_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-hallazgo',
      entidadId: id, detalle: { estatus, causaRaiz: causaRaiz ? 'actualizada' : undefined }, ip: req.ip,
    });

    if (responsableId && Number(responsableId) !== actual.responsableId) {
      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: `Se te asignó el hallazgo ${actual.folio || ''}: ${titulo}`,
        tipo: 'mc_asignacion',
        dataExtra: { hallazgoId: id },
        tenantKey: req.user?.empresa,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.actualizarHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al actualizar hallazgo' });
  }
}

async function verificarCierre(req, res) {
  try {
    const { id } = req.params;
    const { evidenciaCierre, cerrar, eficaz } = req.body;
    if (!evidenciaCierre || !evidenciaCierre.trim()) {
      return res.status(400).json({ success: false, message: 'Evidencia de verificación requerida' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const nuevoEstatus = cerrar ? 'cerrado' : 'verificado_eficaz';

    await pool.request()
      .input('id', sql.Int, id)
      .input('verificadoPor', sql.Int, req.user?.id || null)
      .input('evidencia', sql.NVarChar, evidenciaCierre.trim())
      .input('estatus', sql.NVarChar, nuevoEstatus)
      .input('eficaz', sql.Bit, typeof eficaz === 'boolean' ? eficaz : null)
      .query(`
        UPDATE MC_HALLAZGOS
        SET MH_ESTATUS=@estatus, MH_VERIFICADO_POR=@verificadoPor, MH_FECHA_VERIFICACION=GETDATE(),
            MH_EVIDENCIA_CIERRE=@evidencia, MH_EFICAZ=@eficaz, MH_UPDATED_AT=GETDATE()
        WHERE MH_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'verificar-cierre',
      entidadId: id, detalle: { estatus: nuevoEstatus, eficaz }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.verificarCierre', err);
    res.status(500).json({ success: false, message: 'Error al verificar cierre' });
  }
}

async function reabrirHallazgo(req, res) {
  try {
    const { id } = req.params;
    const { motivoReapertura } = req.body;
    if (!motivoReapertura || !motivoReapertura.trim()) {
      return res.status(400).json({ success: false, message: 'Motivo de reapertura requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE MC_HALLAZGOS
        SET MH_ESTATUS='reabierto', MH_VERIFICADO_POR=NULL, MH_FECHA_VERIFICACION=NULL,
            MH_EVIDENCIA_CIERRE=NULL, MH_EFICAZ=NULL, MH_UPDATED_AT=GETDATE()
        WHERE MH_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'reabrir-hallazgo',
      entidadId: id, detalle: { motivoReapertura: motivoReapertura.trim() }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.reabrirHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al reabrir hallazgo' });
  }
}

async function eliminarHallazgo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const adjuntosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MCA_NOMBRE_ARCHIVO as nombreArchivo FROM MC_ADJUNTOS WHERE MCA_HALLAZGO_ID=@id`);
    for (const adj of adjuntosRs.recordset) {
      try {
        const filePath = path.join(MC_ADJUNTOS_DIR, path.basename(adj.nombreArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('mejoraContinuaController.eliminarHallazgo fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_ADJUNTOS WHERE MCA_HALLAZGO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_COMENTARIOS WHERE MCM_HALLAZGO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`
      DELETE FROM MC_ACCIONES_ALERTAS_LOG WHERE MAL_ACCION_ID IN (SELECT MA_ID FROM MC_ACCIONES WHERE MA_HALLAZGO_ID=@id)
    `);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_ACCIONES WHERE MA_HALLAZGO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_HALLAZGOS WHERE MH_ID=@id`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-hallazgo',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.eliminarHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar hallazgo' });
  }
}

// ── Acciones ─────────────────────────────────────────────────────────────
async function listAcciones(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`
        SELECT MA.MA_ID as id, MA.MA_HALLAZGO_ID as hallazgoId, MA.MA_TIPO as tipo, MA.MA_DESCRIPCION as descripcion,
               MA.MA_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre,
               MA.MA_FECHA_COMPROMISO as fechaCompromiso, MA.MA_FECHA_REAL_CIERRE as fechaRealCierre,
               MA.MA_ESTATUS as estatus, MA.MA_CREATED_AT as createdAt
        FROM MC_ACCIONES MA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MA.MA_RESPONSABLE_ID
        WHERE MA.MA_HALLAZGO_ID=@id
        ORDER BY MA.MA_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('mejoraContinuaController.listAcciones', err);
    res.status(500).json({ success: false, message: 'Error al obtener acciones' });
  }
}

async function crearAccion(req, res) {
  try {
    const { id } = req.params;
    const { tipo, descripcion, responsableId, fechaCompromiso } = req.body;
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ success: false, message: 'Descripción requerida' });
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('hallazgoId', sql.Int, id)
      .input('tipo', sql.NVarChar, TIPOS_ACCION.includes(tipo) ? tipo : 'correctiva')
      .input('descripcion', sql.NVarChar, descripcion.trim())
      .input('responsableId', sql.Int, responsableId || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .query(`
        INSERT INTO MC_ACCIONES (MA_HALLAZGO_ID, MA_TIPO, MA_DESCRIPCION, MA_RESPONSABLE_ID, MA_FECHA_COMPROMISO)
        OUTPUT INSERTED.MA_ID as id
        VALUES (@hallazgoId, @tipo, @descripcion, @responsableId, @fechaCompromiso);
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-accion',
      entidadId: rs.recordset[0].id, detalle: { hallazgoId: id, tipo }, ip: req.ip,
    });

    if (responsableId) {
      const hallazgoRs = await pool.request().input('id', sql.Int, id)
        .query(`SELECT MH_FOLIO as folio FROM MC_HALLAZGOS WHERE MH_ID=@id`);
      const folio = hallazgoRs.recordset[0]?.folio || '';
      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: `Se te asignó una acción del hallazgo ${folio}: ${descripcion.trim()}`,
        tipo: 'mc_asignacion',
        dataExtra: { hallazgoId: id, accionId: rs.recordset[0].id },
        tenantKey: req.user?.empresa,
      });
    }

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('mejoraContinuaController.crearAccion', err);
    res.status(500).json({ success: false, message: 'Error al crear acción' });
  }
}

async function actualizarAccion(req, res) {
  try {
    const { id } = req.params;
    const { tipo, descripcion, responsableId, fechaCompromiso, estatus } = req.body;
    if (estatus && !ESTATUS_ACCION.includes(estatus)) {
      return res.status(400).json({ success: false, message: 'Estatus inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    const actualRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MA_RESPONSABLE_ID as responsableId, MA_HALLAZGO_ID as hallazgoId, MA_ESTATUS as estatusActual FROM MC_ACCIONES WHERE MA_ID=@id`);
    const actual = actualRs.recordset[0];
    if (!actual) return res.status(404).json({ success: false, message: 'Acción no encontrada' });

    const nuevoEstatus = estatus || 'pendiente';
    const marcarCierre = nuevoEstatus === 'completada' && actual.estatusActual !== 'completada';

    await pool.request()
      .input('id', sql.Int, id)
      .input('tipo', sql.NVarChar, TIPOS_ACCION.includes(tipo) ? tipo : 'correctiva')
      .input('descripcion', sql.NVarChar, descripcion)
      .input('responsableId', sql.Int, responsableId || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .input('estatus', sql.NVarChar, nuevoEstatus)
      .query(`
        UPDATE MC_ACCIONES
        SET MA_TIPO=@tipo, MA_DESCRIPCION=@descripcion, MA_RESPONSABLE_ID=@responsableId,
            MA_FECHA_COMPROMISO=@fechaCompromiso, MA_ESTATUS=@estatus,
            MA_FECHA_REAL_CIERRE = CASE WHEN @estatus='completada' AND MA_FECHA_REAL_CIERRE IS NULL THEN CAST(GETDATE() AS DATE)
                                        WHEN @estatus<>'completada' THEN NULL
                                        ELSE MA_FECHA_REAL_CIERRE END
        WHERE MA_ID=@id
      `);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-accion',
      entidadId: id, detalle: { estatus: nuevoEstatus }, ip: req.ip,
    });

    if (responsableId && Number(responsableId) !== actual.responsableId) {
      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: `Se te asignó una acción: ${descripcion}`,
        tipo: 'mc_asignacion',
        dataExtra: { hallazgoId: actual.hallazgoId, accionId: id },
        tenantKey: req.user?.empresa,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.actualizarAccion', err);
    res.status(500).json({ success: false, message: 'Error al actualizar acción' });
  }
}

async function eliminarAccion(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_ACCIONES_ALERTAS_LOG WHERE MAL_ACCION_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_ACCIONES WHERE MA_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-accion',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.eliminarAccion', err);
    res.status(500).json({ success: false, message: 'Error al eliminar acción' });
  }
}

// ── Comentarios ────────────────────────────────────────────────────────────
async function listComentarios(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`
        SELECT MCM.MCM_ID as id, MCM.MCM_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre, MCM.MCM_TEXTO as texto, MCM.MCM_CREATED_AT as createdAt
        FROM MC_COMENTARIOS MCM
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MCM.MCM_USUARIO_ID
        WHERE MCM.MCM_HALLAZGO_ID=@id
        ORDER BY MCM.MCM_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('mejoraContinuaController.listComentarios', err);
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
      .input('hallazgoId', sql.Int, id)
      .input('usuarioId', sql.Int, usuarioId)
      .input('texto', sql.NVarChar, texto.trim())
      .query(`
        INSERT INTO MC_COMENTARIOS (MCM_HALLAZGO_ID, MCM_USUARIO_ID, MCM_TEXTO)
        OUTPUT INSERTED.MCM_ID as id
        VALUES (@hallazgoId, @usuarioId, @texto);
      `);

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'comentar-hallazgo',
      entidadId: id, detalle: { comentarioId: rs.recordset[0].id }, ip: req.ip,
    });

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('mejoraContinuaController.crearComentario', err);
    res.status(500).json({ success: false, message: 'Error al crear comentario' });
  }
}

async function eliminarComentario(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MCM_USUARIO_ID as usuarioId FROM MC_COMENTARIOS WHERE MCM_ID=@id`);
    const comentario = rs.recordset[0];
    if (!comentario) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    if (comentario.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propios comentarios' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_COMENTARIOS WHERE MCM_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.eliminarComentario', err);
    res.status(500).json({ success: false, message: 'Error al eliminar comentario' });
  }
}

// ── Historial (bitácora de auditoría) ─────────────────────────────────────
async function listHistorial(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('modulo', sql.NVarChar, MODULO_AUDIT)
      .input('entidadId', sql.NVarChar, String(id))
      .query(`
        SELECT AUDIT_ID as id, USUARIO_ID as usuarioId, USUARIO_NOMBRE as usuarioNombre,
               ACCION as accion, DETALLE as detalle, FECHA as fecha
        FROM INTRANET_AUDITORIA
        WHERE MODULO = @modulo AND ENTIDAD_ID = @entidadId
        ORDER BY FECHA DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('mejoraContinuaController.listHistorial', err);
    res.status(500).json({ success: false, message: 'Error al obtener historial' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntosHallazgo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('hallazgoId', sql.Int, id)
      .query(`
        SELECT MCA.MCA_ID as id, MCA.MCA_HALLAZGO_ID as hallazgoId, MCA.MCA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               MCA.MCA_NOMBRE_ORIGINAL as nombreOriginal, MCA.MCA_MIME as mime, MCA.MCA_TAMANIO as tamanio, MCA.MCA_CREATED_AT as createdAt
        FROM MC_ADJUNTOS MCA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MCA.MCA_USUARIO_ID
        WHERE MCA.MCA_HALLAZGO_ID=@hallazgoId
        ORDER BY MCA.MCA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('mejoraContinuaController.listAdjuntosHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntosHallazgo(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const hallazgoRs = await pool.request().input('id', sql.Int, id).query(`SELECT MH_ID as id FROM MC_HALLAZGOS WHERE MH_ID=@id`);
    if (!hallazgoRs.recordset[0]) return res.status(404).json({ success: false, message: 'Hallazgo no encontrado' });

    for (const file of req.files) {
      await pool.request()
        .input('hallazgoId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO MC_ADJUNTOS (MCA_HALLAZGO_ID, MCA_USUARIO_ID, MCA_NOMBRE_ARCHIVO, MCA_NOMBRE_ORIGINAL, MCA_MIME, MCA_TAMANIO)
          VALUES (@hallazgoId, @usuarioId, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'subir-adjunto',
      entidadId: id, detalle: { cantidad: req.files.length }, ip: req.ip,
    });

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('mejoraContinuaController.subirAdjuntosHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjuntoHallazgo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`
        SELECT MCA.MCA_USUARIO_ID as usuarioId, MCA.MCA_NOMBRE_ARCHIVO as nombreArchivo, MH.MH_RESPONSABLE_ID as responsableId
        FROM MC_ADJUNTOS MCA
        INNER JOIN MC_HALLAZGOS MH ON MH.MH_ID = MCA.MCA_HALLAZGO_ID
        WHERE MCA.MCA_ID=@id
      `);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    if (adjunto.usuarioId !== req.user?.id && adjunto.responsableId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo quien subió el archivo o el responsable pueden eliminarlo' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MC_ADJUNTOS WHERE MCA_ID=@id`);

    try {
      const filePath = path.join(MC_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('mejoraContinuaController.eliminarAdjuntoHallazgo fs', fsErr?.message || fsErr);
    }

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-adjunto',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('mejoraContinuaController.eliminarAdjuntoHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjuntoHallazgo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MCA_NOMBRE_ARCHIVO as nombreArchivo, MCA_NOMBRE_ORIGINAL as nombreOriginal FROM MC_ADJUNTOS WHERE MCA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(MC_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('mejoraContinuaController.verAdjuntoHallazgo stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('mejoraContinuaController.verAdjuntoHallazgo', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
const ESTATUS_LABEL_PDF = {
  registrado: 'Registrado', en_analisis_causa: 'En análisis de causa', plan_definido: 'Plan definido',
  en_ejecucion: 'En ejecución', pendiente_verificacion: 'Pendiente de verificación',
  verificado_eficaz: 'Verificado eficaz', cerrado: 'Cerrado', reabierto: 'Reabierto',
};

async function exportarPdf(req, res) {
  try {
    const { estatus, area, severidad } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const where = [];
    if (estatus) { request.input('estatus', sql.NVarChar, estatus); where.push('MH.MH_ESTATUS = @estatus'); }
    if (area) { request.input('area', sql.NVarChar, area); where.push('MH.MH_AREA_ORIGEN = @area'); }
    if (severidad) { request.input('severidad', sql.NVarChar, severidad); where.push('MH.MH_SEVERIDAD = @severidad'); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rs = await request.query(`
      SELECT ${HALLAZGO_SELECT_FIELDS}
      FROM MC_HALLAZGOS MH
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MH.MH_RESPONSABLE_ID
      ${whereSql}
      ORDER BY MH.MH_CREATED_AT DESC
    `);
    const hallazgos = rs.recordset;

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
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Seguimiento y mejora continua', M, 38);
        doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
        return 132;
      };

      let y = drawHeader('Hallazgos / no conformidades');
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H - M) {
          doc.addPage();
          y = drawHeader('Hallazgos / no conformidades (cont.)');
        }
      };

      if (hallazgos.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay hallazgos registrados con estos filtros.', M, y);
      }

      hallazgos.forEach((h) => {
        ensureSpace(56);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0D1B3E')
          .text(`${h.folio || ''}  ${h.titulo}`, M, y, { width: PAGE_W - M * 2 });
        y += 15;

        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(
            `${h.areaOrigenLabel || h.areaOrigen || '—'}  ·  ${h.responsableNombre || 'Sin responsable'}  ·  ${ESTATUS_LABEL_PDF[h.estatus] || h.estatus}  ·  Severidad: ${h.severidad}`,
            M, y, { width: PAGE_W - M * 2 },
          );
        y += 16;
        doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
        y += 14;
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="mejora_continua.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('mejoraContinuaController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Alertas de vencimiento de acciones (cron) ─────────────────────────────
async function ejecutarAlertaMcVencimientos(pool, tenantKey) {
  try {
    const candidatosRs = await pool.request()
      .input('dias', sql.Int, DIAS_VENCIMIENTO_ALERTA)
      .query(`
        SELECT MA.MA_ID as accionId, MA.MA_DESCRIPCION as descripcion, MA.MA_FECHA_COMPROMISO as fechaCompromiso,
               MA.MA_RESPONSABLE_ID as accionResponsableId, MH.MH_ID as hallazgoId, MH.MH_FOLIO as folio,
               MH.MH_RESPONSABLE_ID as hallazgoResponsableId
        FROM MC_ACCIONES MA
        INNER JOIN MC_HALLAZGOS MH ON MH.MH_ID = MA.MA_HALLAZGO_ID
        WHERE MA.MA_ESTATUS <> 'completada'
          AND MA.MA_FECHA_COMPROMISO IS NOT NULL
          AND MA.MA_FECHA_COMPROMISO BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, @dias, CAST(GETDATE() AS DATE))
          AND NOT EXISTS (
            SELECT 1 FROM MC_ACCIONES_ALERTAS_LOG
            WHERE MAL_ACCION_ID = MA.MA_ID
              AND CAST(MAL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    const usuariosCorreo = await getUsuariosParaNotificarCorreo('direccion-general', tenantKey);

    for (const accion of candidatosRs.recordset) {
      const destinatario = accion.accionResponsableId || accion.hallazgoResponsableId;
      const destinatariosInApp = new Set([destinatario, ...usuariosCorreo].filter(Boolean));

      for (const usuarioId of destinatariosInApp) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: `La acción "${accion.descripcion}" del hallazgo ${accion.folio || ''} vence pronto`,
          tipo: 'mc_accion_vencimiento',
          dataExtra: { hallazgoId: accion.hallazgoId, accionId: accion.accionId },
          tenantKey,
        });
      }

      const correosIds = Array.from(new Set([destinatario, ...usuariosCorreo].filter(Boolean)));
      if (correosIds.length) {
        try {
          const correosRs = await pool.request()
            .query(`SELECT NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${correosIds.join(',')})`);
          const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);
          if (correos.length) {
            await emailService.sendMcVencimientoEmail({
              to: correos,
              folio: accion.folio,
              descripcion: accion.descripcion,
              fechaCompromiso: accion.fechaCompromiso,
            });
          }
        } catch (mailErr) {
          logger.warn('mejoraContinuaController.ejecutarAlertaMcVencimientos mail', mailErr?.message || mailErr);
        }
      }

      await pool.request().input('accionId', sql.Int, accion.accionId)
        .query(`INSERT INTO MC_ACCIONES_ALERTAS_LOG (MAL_ACCION_ID) VALUES (@accionId)`);
    }
  } catch (err) {
    logger.error('mejoraContinuaController.ejecutarAlertaMcVencimientos', err);
  }
}

cron.schedule('30 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaMcVencimientos(pool, key);
    } catch (err) {
      logger.error(`[CRON mejora-continua-vencimientos][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

module.exports = {
  listHallazgos,
  crearHallazgo,
  actualizarHallazgo,
  verificarCierre,
  reabrirHallazgo,
  eliminarHallazgo,
  listAcciones,
  crearAccion,
  actualizarAccion,
  eliminarAccion,
  listComentarios,
  crearComentario,
  eliminarComentario,
  listAdjuntosHallazgo,
  subirAdjuntosHallazgo,
  eliminarAdjuntoHallazgo,
  verAdjuntoHallazgo,
  exportarPdf,
  listHistorial,
};
