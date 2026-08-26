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
const { OKR_EVIDENCIAS_DIR } = require('../middleware/okrEvidenciaUpload');

const AREA_KEY = 'direccion-general';
const MODULO_AUDIT = 'planeacion-estrategica';
const DIAS_ESTANCADO_ALERTA = 3;

const ESTATUS_MANUAL_LABEL = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' };
const NIVEL_LABEL = { empresa: 'Empresa', departamento: 'Departamento', equipo: 'Equipo', individual: 'Individual' };

function calcularProgresoKr(kr) {
  if (kr.tipo === 'booleano') return Number(kr.valorActual) > 0 ? 100 : 0;
  if (kr.tipo === 'milestone') {
    if (!kr.milestones || kr.milestones.length === 0) return 0;
    const completados = kr.milestones.filter((m) => m.completado).length;
    return Math.round((completados / kr.milestones.length) * 100);
  }
  if (!kr.meta || kr.meta <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((kr.valorActual / kr.meta) * 100)));
}

function calcularProgresoObjetivo(resultadosClave) {
  if (!resultadosClave.length) return 0;
  const pesoTotal = resultadosClave.reduce((sum, kr) => sum + (kr.peso || 1), 0);
  if (pesoTotal <= 0) return 0;
  const ponderado = resultadosClave.reduce((sum, kr) => sum + kr.progreso * (kr.peso || 1), 0);
  return Math.round(ponderado / pesoTotal);
}

function mapObjetivosConDetalle(objetivosRows, krsRows, milestonesRows, colaboradoresRows, etiquetasRows) {
  const milestonesPorKr = new Map();
  for (const m of milestonesRows) {
    const lista = milestonesPorKr.get(m.krId) || [];
    lista.push(m);
    milestonesPorKr.set(m.krId, lista);
  }

  const krsPorObjetivo = new Map();
  for (const kr of krsRows) {
    const milestones = milestonesPorKr.get(kr.id) || [];
    const progreso = calcularProgresoKr({ ...kr, milestones });
    const lista = krsPorObjetivo.get(kr.objetivoId) || [];
    lista.push({ ...kr, progreso, milestones: kr.tipo === 'milestone' ? milestones : undefined });
    krsPorObjetivo.set(kr.objetivoId, lista);
  }

  const colaboradoresPorObjetivo = new Map();
  for (const c of colaboradoresRows) {
    const lista = colaboradoresPorObjetivo.get(c.objetivoId) || [];
    lista.push({ id: c.usuarioId, nombre: c.nombre });
    colaboradoresPorObjetivo.set(c.objetivoId, lista);
  }

  const etiquetasPorObjetivo = new Map();
  for (const e of etiquetasRows) {
    const lista = etiquetasPorObjetivo.get(e.objetivoId) || [];
    lista.push(e.etiqueta);
    etiquetasPorObjetivo.set(e.objetivoId, lista);
  }

  const titulosPorId = new Map(objetivosRows.map((o) => [o.id, o.titulo]));

  return objetivosRows.map((o) => {
    const resultadosClave = krsPorObjetivo.get(o.id) || [];
    return {
      ...o,
      progreso: calcularProgresoObjetivo(resultadosClave),
      resultadosClave,
      colaboradores: colaboradoresPorObjetivo.get(o.id) || [],
      etiquetas: etiquetasPorObjetivo.get(o.id) || [],
      objetivoPadreTitulo: o.objetivoPadreId ? titulosPorId.get(o.objetivoPadreId) || null : null,
    };
  });
}

async function syncColaboradores(pool, objetivoId, colaboradores) {
  await pool.request().input('objetivoId', sql.Int, objetivoId)
    .query(`DELETE FROM AREA_OBJETIVO_COLABORADORES WHERE OC_OBJETIVO_ID=@objetivoId`);
  if (!Array.isArray(colaboradores) || colaboradores.length === 0) return;
  for (const usuarioId of colaboradores) {
    await pool.request()
      .input('objetivoId', sql.Int, objetivoId)
      .input('usuarioId', sql.Int, usuarioId)
      .query(`INSERT INTO AREA_OBJETIVO_COLABORADORES (OC_OBJETIVO_ID, OC_USUARIO_ID) VALUES (@objetivoId, @usuarioId)`);
  }
}

async function syncEtiquetas(pool, objetivoId, etiquetas) {
  await pool.request().input('objetivoId', sql.Int, objetivoId)
    .query(`DELETE FROM AREA_OBJETIVO_ETIQUETAS WHERE OT_OBJETIVO_ID=@objetivoId`);
  if (!Array.isArray(etiquetas) || etiquetas.length === 0) return;
  for (const etiqueta of etiquetas) {
    const valor = String(etiqueta || '').trim().slice(0, 50);
    if (!valor) continue;
    await pool.request()
      .input('objetivoId', sql.Int, objetivoId)
      .input('etiqueta', sql.NVarChar, valor)
      .query(`INSERT INTO AREA_OBJETIVO_ETIQUETAS (OT_OBJETIVO_ID, OT_ETIQUETA) VALUES (@objetivoId, @etiqueta)`);
  }
}

// Trae objetivos + KRs + milestones + colaboradores + etiquetas de un periodo, ya combinados.
// Compartido por listObjetivos y exportarPdf para no duplicar las queries.
async function obtenerObjetivosDetallados(pool, periodo) {
  const objetivosRs = await pool.request()
    .input('areaKey', sql.NVarChar, AREA_KEY)
    .input('periodo', sql.NVarChar, periodo)
    .query(`
      SELECT OE_ID as id, OE_TITULO as titulo, OE_DESCRIPCION as descripcion, OE_PERIODO as periodo,
             OE_RESPONSABLE_ID as responsableId, OE_ESTATUS as estatus, OE_OBJETIVO_PADRE_ID as objetivoPadreId,
             OE_NIVEL as nivel, OE_ESTATUS_MANUAL as estatusManual, OE_CREATED_AT as createdAt, OE_UPDATED_AT as updatedAt
      FROM AREA_OBJETIVOS_ESTRATEGICOS
      WHERE OE_AREA_KEY = @areaKey AND OE_PERIODO = @periodo AND OE_ACTIVO = 1
      ORDER BY OE_CREATED_AT DESC
    `);

  const objetivoIds = objetivosRs.recordset.map((o) => o.id);
  let krsRows = [];
  let milestonesRows = [];
  let colaboradoresRows = [];
  let etiquetasRows = [];

  if (objetivoIds.length) {
    const krsRs = await pool.request()
      .input('areaKey', sql.NVarChar, AREA_KEY)
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT RC.RC_ID as id, RC.RC_OBJETIVO_ID as objetivoId, RC.RC_TITULO as titulo,
               RC.RC_VALOR_ACTUAL as valorActual, RC.RC_META as meta, RC.RC_UNIDAD as unidad, RC.RC_ORDEN as orden,
               RC.RC_TIPO as tipo, RC.RC_PESO as peso, RC.RC_RESPONSABLE_ID as responsableId
        FROM AREA_RESULTADOS_CLAVE RC
        INNER JOIN AREA_OBJETIVOS_ESTRATEGICOS OE ON OE.OE_ID = RC.RC_OBJETIVO_ID
        WHERE OE.OE_AREA_KEY = @areaKey AND OE.OE_PERIODO = @periodo AND OE.OE_ACTIVO = 1
        ORDER BY RC.RC_ORDEN, RC.RC_ID
      `);
    krsRows = krsRs.recordset;

    const krIds = krsRows.map((k) => k.id);
    if (krIds.length) {
      const milestonesRs = await pool.request()
        .input('areaKey', sql.NVarChar, AREA_KEY)
        .input('periodo', sql.NVarChar, periodo)
        .query(`
          SELECT MS.MS_ID as id, MS.MS_KR_ID as krId, MS.MS_TITULO as titulo, MS.MS_COMPLETADO as completado, MS.MS_ORDEN as orden
          FROM AREA_KR_MILESTONES MS
          INNER JOIN AREA_RESULTADOS_CLAVE RC ON RC.RC_ID = MS.MS_KR_ID
          INNER JOIN AREA_OBJETIVOS_ESTRATEGICOS OE ON OE.OE_ID = RC.RC_OBJETIVO_ID
          WHERE OE.OE_AREA_KEY = @areaKey AND OE.OE_PERIODO = @periodo AND OE.OE_ACTIVO = 1
          ORDER BY MS.MS_ORDEN, MS.MS_ID
        `);
      milestonesRows = milestonesRs.recordset.map((m) => ({ ...m, completado: !!m.completado }));
    }

    const colabRs = await pool.request()
      .input('areaKey', sql.NVarChar, AREA_KEY)
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT OC.OC_OBJETIVO_ID as objetivoId, OC.OC_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as nombre
        FROM AREA_OBJETIVO_COLABORADORES OC
        INNER JOIN AREA_OBJETIVOS_ESTRATEGICOS OE ON OE.OE_ID = OC.OC_OBJETIVO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = OC.OC_USUARIO_ID
        WHERE OE.OE_AREA_KEY = @areaKey AND OE.OE_PERIODO = @periodo AND OE.OE_ACTIVO = 1
      `);
    colaboradoresRows = colabRs.recordset;

    const etiquetasRs = await pool.request()
      .input('areaKey', sql.NVarChar, AREA_KEY)
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT OT.OT_OBJETIVO_ID as objetivoId, OT.OT_ETIQUETA as etiqueta
        FROM AREA_OBJETIVO_ETIQUETAS OT
        INNER JOIN AREA_OBJETIVOS_ESTRATEGICOS OE ON OE.OE_ID = OT.OT_OBJETIVO_ID
        WHERE OE.OE_AREA_KEY = @areaKey AND OE.OE_PERIODO = @periodo AND OE.OE_ACTIVO = 1
      `);
    etiquetasRows = etiquetasRs.recordset;
  }

  return mapObjetivosConDetalle(objetivosRs.recordset, krsRows, milestonesRows, colaboradoresRows, etiquetasRows);
}

// ── Objetivos ────────────────────────────────────────────────────────────
async function listObjetivos(req, res) {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 4);
    const pool = await databaseService.getPool(req.user?.empresa);
    const objetivos = await obtenerObjetivosDetallados(pool, periodo);
    res.json({ success: true, data: objetivos });
  } catch (err) {
    logger.error('planeacionEstrategicaController.listObjetivos', err);
    res.status(500).json({ success: false, message: 'Error al obtener objetivos estratégicos' });
  }
}

async function crearObjetivo(req, res) {
  try {
    const { titulo, descripcion, periodo, responsableId, objetivoPadreId, nivel, colaboradores, etiquetas } = req.body;
    if (!titulo) return res.status(400).json({ success: false, message: 'Título requerido' });
    const p = periodo || new Date().toISOString().slice(0, 4);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, AREA_KEY)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('periodo', sql.NVarChar, p)
      .input('responsableId', sql.Int, responsableId || null)
      .input('objetivoPadreId', sql.Int, objetivoPadreId || null)
      .input('nivel', sql.NVarChar, nivel || 'departamento')
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO AREA_OBJETIVOS_ESTRATEGICOS (OE_AREA_KEY, OE_TITULO, OE_DESCRIPCION, OE_PERIODO, OE_RESPONSABLE_ID, OE_OBJETIVO_PADRE_ID, OE_NIVEL, OE_CREATED_BY)
        OUTPUT INSERTED.OE_ID as id
        VALUES (@areaKey, @titulo, @descripcion, @periodo, @responsableId, @objetivoPadreId, @nivel, @createdBy);
      `);
    const id = rs.recordset[0].id;
    await syncColaboradores(pool, id, colaboradores);
    await syncEtiquetas(pool, id, etiquetas);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-objetivo',
      entidadId: id, detalle: { titulo, periodo: p, nivel }, ip: req.ip,
    });
    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('planeacionEstrategicaController.crearObjetivo', err);
    res.status(500).json({ success: false, message: 'Error al crear objetivo' });
  }
}

async function actualizarObjetivo(req, res) {
  try {
    const { id } = req.params;
    const { titulo, descripcion, estatus, estatusManual, nivel, responsableId, objetivoPadreId, colaboradores, etiquetas } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('estatus', sql.NVarChar, estatus || 'activo')
      .input('estatusManual', sql.NVarChar, estatusManual || 'on_track')
      .input('nivel', sql.NVarChar, nivel || 'departamento')
      .input('responsableId', sql.Int, responsableId || null)
      .input('objetivoPadreId', sql.Int, objetivoPadreId || null)
      .query(`
        UPDATE AREA_OBJETIVOS_ESTRATEGICOS
        SET OE_TITULO=@titulo, OE_DESCRIPCION=@descripcion, OE_ESTATUS=@estatus, OE_ESTATUS_MANUAL=@estatusManual,
            OE_NIVEL=@nivel, OE_RESPONSABLE_ID=@responsableId, OE_OBJETIVO_PADRE_ID=@objetivoPadreId, OE_UPDATED_AT=GETDATE()
        WHERE OE_ID=@id
      `);
    if (colaboradores !== undefined) {
      await syncColaboradores(pool, Number(id), colaboradores);
    }
    if (etiquetas !== undefined) {
      await syncEtiquetas(pool, Number(id), etiquetas);
    }
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-objetivo',
      entidadId: id, detalle: { titulo, estatus, estatusManual }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.actualizarObjetivo', err);
    res.status(500).json({ success: false, message: 'Error al actualizar objetivo' });
  }
}

// Actualiza solo el estatus manual (acción rápida desde la tarjeta)
async function actualizarEstatusManual(req, res) {
  try {
    const { id } = req.params;
    const { estatusManual } = req.body;
    if (!['on_track', 'at_risk', 'off_track'].includes(estatusManual)) {
      return res.status(400).json({ success: false, message: 'Estatus inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('estatusManual', sql.NVarChar, estatusManual)
      .query(`UPDATE AREA_OBJETIVOS_ESTRATEGICOS SET OE_ESTATUS_MANUAL=@estatusManual, OE_UPDATED_AT=GETDATE() WHERE OE_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'cambiar-estatus-manual',
      entidadId: id, detalle: { estatusManual }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.actualizarEstatusManual', err);
    res.status(500).json({ success: false, message: 'Error al actualizar estatus' });
  }
}

async function eliminarObjetivo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const hijosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as total FROM AREA_OBJETIVOS_ESTRATEGICOS WHERE OE_OBJETIVO_PADRE_ID=@id AND OE_ACTIVO=1`);
    if (hijosRs.recordset[0].total > 0) {
      return res.status(400).json({ success: false, message: 'Tiene objetivos hijos, reasígnalos primero' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE AREA_OBJETIVOS_ESTRATEGICOS SET OE_ACTIVO=0 WHERE OE_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-objetivo',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.eliminarObjetivo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar objetivo' });
  }
}

// ── Resultados clave ─────────────────────────────────────────────────────
async function crearResultadoClave(req, res) {
  try {
    const { objetivoId } = req.params;
    const { titulo, meta, unidad, orden, tipo, peso, responsableId } = req.body;
    if (!titulo) return res.status(400).json({ success: false, message: 'Título requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('objetivoId', sql.Int, objetivoId)
      .input('titulo', sql.NVarChar, titulo)
      .input('meta', sql.Decimal(18, 2), meta || 0)
      .input('unidad', sql.NVarChar, unidad || null)
      .input('orden', sql.Int, orden || 0)
      .input('tipo', sql.NVarChar, tipo || 'numerico')
      .input('peso', sql.Decimal(6, 2), peso || 1)
      .input('responsableId', sql.Int, responsableId || null)
      .query(`
        INSERT INTO AREA_RESULTADOS_CLAVE (RC_OBJETIVO_ID, RC_TITULO, RC_META, RC_UNIDAD, RC_ORDEN, RC_TIPO, RC_PESO, RC_RESPONSABLE_ID)
        OUTPUT INSERTED.RC_ID as id
        VALUES (@objetivoId, @titulo, @meta, @unidad, @orden, @tipo, @peso, @responsableId);
      `);
    const krId = rs.recordset[0].id;
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-kr',
      entidadId: krId, detalle: { objetivoId, titulo, tipo: tipo || 'numerico' }, ip: req.ip,
    });
    res.json({ success: true, data: { id: krId } });
  } catch (err) {
    logger.error('planeacionEstrategicaController.crearResultadoClave', err);
    res.status(500).json({ success: false, message: 'Error al crear resultado clave' });
  }
}

async function actualizarResultadoClave(req, res) {
  try {
    const { id } = req.params;
    const { titulo, valorActual, meta, unidad, tipo, peso, responsableId, comentario } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const actualRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT RC_VALOR_ACTUAL as valorActual FROM AREA_RESULTADOS_CLAVE WHERE RC_ID=@id`);
    const valorAnterior = actualRs.recordset[0]?.valorActual ?? 0;
    const valorNuevo = valorActual ?? 0;

    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('valorActual', sql.Decimal(18, 2), valorNuevo)
      .input('meta', sql.Decimal(18, 2), meta ?? 0)
      .input('unidad', sql.NVarChar, unidad || null)
      .input('tipo', sql.NVarChar, tipo || 'numerico')
      .input('peso', sql.Decimal(6, 2), peso || 1)
      .input('responsableId', sql.Int, responsableId || null)
      .query(`
        UPDATE AREA_RESULTADOS_CLAVE
        SET RC_TITULO=@titulo, RC_VALOR_ACTUAL=@valorActual, RC_META=@meta, RC_UNIDAD=@unidad,
            RC_TIPO=@tipo, RC_PESO=@peso, RC_RESPONSABLE_ID=@responsableId, RC_UPDATED_AT=GETDATE()
        WHERE RC_ID=@id
      `);

    if (Number(valorAnterior) !== Number(valorNuevo) || comentario) {
      await pool.request()
        .input('krId', sql.Int, id)
        .input('valorAnterior', sql.Decimal(18, 2), valorAnterior)
        .input('valorNuevo', sql.Decimal(18, 2), valorNuevo)
        .input('comentario', sql.NVarChar, comentario || null)
        .input('autorId', sql.Int, req.user?.id || null)
        .query(`
          INSERT INTO AREA_KR_CHECKINS (KC_KR_ID, KC_VALOR_ANTERIOR, KC_VALOR_NUEVO, KC_COMENTARIO, KC_AUTOR_ID)
          VALUES (@krId, @valorAnterior, @valorNuevo, @comentario, @autorId);
        `);
    }

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'checkin-kr',
      entidadId: id, detalle: { valorAnterior, valorNuevo, comentario: comentario || null }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.actualizarResultadoClave', err);
    res.status(500).json({ success: false, message: 'Error al actualizar resultado clave' });
  }
}

async function eliminarResultadoClave(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_KR_CHECKINS WHERE KC_KR_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_KR_MILESTONES WHERE MS_KR_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_RESULTADOS_CLAVE WHERE RC_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-kr',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.eliminarResultadoClave', err);
    res.status(500).json({ success: false, message: 'Error al eliminar resultado clave' });
  }
}

// ── Check-ins (historial) ────────────────────────────────────────────────
async function getKrCheckins(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('krId', sql.Int, id)
      .query(`
        SELECT KC.KC_ID as id, KC.KC_VALOR_ANTERIOR as valorAnterior, KC.KC_VALOR_NUEVO as valorNuevo,
               KC.KC_COMENTARIO as comentario, KC.KC_AUTOR_ID as autorId, U.NEUS_NOMBRES as autorNombre, KC.KC_FECHA as fecha
        FROM AREA_KR_CHECKINS KC
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = KC.KC_AUTOR_ID
        WHERE KC.KC_KR_ID=@krId
        ORDER BY KC.KC_FECHA DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('planeacionEstrategicaController.getKrCheckins', err);
    res.status(500).json({ success: false, message: 'Error al obtener historial' });
  }
}

// ── Milestones ────────────────────────────────────────────────────────────
async function listMilestones(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('krId', sql.Int, id)
      .query(`SELECT MS_ID as id, MS_TITULO as titulo, MS_COMPLETADO as completado, MS_ORDEN as orden FROM AREA_KR_MILESTONES WHERE MS_KR_ID=@krId ORDER BY MS_ORDEN, MS_ID`);
    res.json({ success: true, data: rs.recordset.map((m) => ({ ...m, completado: !!m.completado })) });
  } catch (err) {
    logger.error('planeacionEstrategicaController.listMilestones', err);
    res.status(500).json({ success: false, message: 'Error al obtener hitos' });
  }
}

async function crearMilestone(req, res) {
  try {
    const { id } = req.params;
    const { titulo, orden } = req.body;
    if (!titulo) return res.status(400).json({ success: false, message: 'Título requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('krId', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO AREA_KR_MILESTONES (MS_KR_ID, MS_TITULO, MS_ORDEN) OUTPUT INSERTED.MS_ID as id VALUES (@krId, @titulo, @orden)`);
    const milestoneId = rs.recordset[0].id;
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-milestone',
      entidadId: milestoneId, detalle: { krId: id, titulo }, ip: req.ip,
    });
    res.json({ success: true, data: { id: milestoneId } });
  } catch (err) {
    logger.error('planeacionEstrategicaController.crearMilestone', err);
    res.status(500).json({ success: false, message: 'Error al crear hito' });
  }
}

async function actualizarMilestone(req, res) {
  try {
    const { milestoneId } = req.params;
    const { titulo, completado } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, milestoneId)
      .input('titulo', sql.NVarChar, titulo)
      .input('completado', sql.Bit, completado ? 1 : 0)
      .query(`UPDATE AREA_KR_MILESTONES SET MS_TITULO=@titulo, MS_COMPLETADO=@completado WHERE MS_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-milestone',
      entidadId: milestoneId, detalle: { titulo, completado: !!completado }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.actualizarMilestone', err);
    res.status(500).json({ success: false, message: 'Error al actualizar hito' });
  }
}

async function eliminarMilestone(req, res) {
  try {
    const { milestoneId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, milestoneId).query(`DELETE FROM AREA_KR_MILESTONES WHERE MS_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-milestone',
      entidadId: milestoneId, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.eliminarMilestone', err);
    res.status(500).json({ success: false, message: 'Error al eliminar hito' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
async function exportarPdf(req, res) {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 4);
    const pool = await databaseService.getPool(req.user?.empresa);
    const objetivos = await obtenerObjetivosDetallados(pool, periodo);

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
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Planeación estratégica y objetivos', M, 38);
        doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
        return 132;
      };

      let y = drawHeader(`Objetivos del periodo ${periodo}`);
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H - M) {
          doc.addPage();
          y = drawHeader(`Objetivos del periodo ${periodo} (cont.)`);
        }
      };

      if (objetivos.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay objetivos registrados para este periodo.', M, y);
      }

      objetivos.forEach((o) => {
        ensureSpace(70);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0D1B3E')
          .text(o.titulo, M, y, { width: PAGE_W - M * 2 });
        y += 15;

        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(
            `${NIVEL_LABEL[o.nivel] || o.nivel}  ·  ${ESTATUS_MANUAL_LABEL[o.estatusManual] || o.estatusManual}  ·  Progreso: ${o.progreso}%` +
            (o.etiquetas.length ? `  ·  Etiquetas: ${o.etiquetas.join(', ')}` : ''),
            M, y, { width: PAGE_W - M * 2 },
          );
        y += 16;

        if (o.resultadosClave.length === 0) {
          doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#9CA3AF')
            .text('Sin resultados clave.', M + 10, y);
          y += 14;
        } else {
          o.resultadosClave.forEach((kr) => {
            ensureSpace(16);
            doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
              .text(`• ${kr.titulo} — ${kr.valorActual}/${kr.meta} ${kr.unidad || ''} (${kr.progreso}%)`, M + 10, y, { width: PAGE_W - M * 2 - 10 });
            y += 14;
          });
        }
        y += 10;
        doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
        y += 14;
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="planeacion_estrategica_${periodo}.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('planeacionEstrategicaController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Comentarios ───────────────────────────────────────────────────────────
async function listComentarios(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('objetivoId', sql.Int, id)
      .query(`
        SELECT CM.CM_ID as id, CM.CM_OBJETIVO_ID as objetivoId, CM.CM_USUARIO_ID as usuarioId,
               U.NEUS_NOMBRES as autorNombre, CM.CM_TEXTO as texto, CM.CM_CREATED_AT as createdAt
        FROM AREA_OBJETIVO_COMENTARIOS CM
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CM.CM_USUARIO_ID
        WHERE CM.CM_OBJETIVO_ID=@objetivoId
        ORDER BY CM.CM_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('planeacionEstrategicaController.listComentarios', err);
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
      .input('objetivoId', sql.Int, id)
      .input('usuarioId', sql.Int, usuarioId)
      .input('texto', sql.NVarChar, texto.trim())
      .query(`
        INSERT INTO AREA_OBJETIVO_COMENTARIOS (CM_OBJETIVO_ID, CM_USUARIO_ID, CM_TEXTO)
        OUTPUT INSERTED.CM_ID as id
        VALUES (@objetivoId, @usuarioId, @texto);
      `);

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'comentar-objetivo',
      entidadId: id, detalle: { comentarioId: rs.recordset[0].id }, ip: req.ip,
    });

    try {
      const objetivoRs = await pool.request().input('id', sql.Int, id)
        .query(`SELECT OE_TITULO as titulo, OE_RESPONSABLE_ID as responsableId FROM AREA_OBJETIVOS_ESTRATEGICOS WHERE OE_ID=@id`);
      const objetivo = objetivoRs.recordset[0];
      if (objetivo) {
        const colabRs = await pool.request().input('objetivoId', sql.Int, id)
          .query(`SELECT OC_USUARIO_ID as usuarioId FROM AREA_OBJETIVO_COLABORADORES WHERE OC_OBJETIVO_ID=@objetivoId`);
        const destinatarios = new Set([objetivo.responsableId, ...colabRs.recordset.map((c) => c.usuarioId)].filter(Boolean));
        destinatarios.delete(usuarioId);
        for (const destinatarioId of destinatarios) {
          await notificationService.createNotification({
            usuarioId: destinatarioId,
            mensaje: `Nuevo comentario en "${objetivo.titulo}"`,
            tipo: 'okr_comentario',
            dataExtra: { objetivoId: id },
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (notifyErr) {
      logger.warn('planeacionEstrategicaController.crearComentario notify', notifyErr?.message || notifyErr);
    }

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('planeacionEstrategicaController.crearComentario', err);
    res.status(500).json({ success: false, message: 'Error al crear comentario' });
  }
}

async function eliminarComentario(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CM_USUARIO_ID as usuarioId FROM AREA_OBJETIVO_COMENTARIOS WHERE CM_ID=@id`);
    const comentario = rs.recordset[0];
    if (!comentario) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    if (comentario.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propios comentarios' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_OBJETIVO_COMENTARIOS WHERE CM_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.eliminarComentario', err);
    res.status(500).json({ success: false, message: 'Error al eliminar comentario' });
  }
}

// ── Alertas de objetivos estancados (cron) ──────────────────────────────
async function ejecutarAlertaObjetivosEstancados(pool, tenantKey) {
  try {
    const candidatosRs = await pool.request()
      .input('dias', sql.Int, DIAS_ESTANCADO_ALERTA)
      .query(`
        SELECT OE_ID as id, OE_TITULO as titulo, OE_RESPONSABLE_ID as responsableId, OE_ESTATUS_MANUAL as estatusManual,
               DATEDIFF(DAY, OE_UPDATED_AT, GETDATE()) as diasEstancado
        FROM AREA_OBJETIVOS_ESTRATEGICOS
        WHERE OE_ACTIVO = 1
          AND OE_ESTATUS_MANUAL IN ('at_risk', 'off_track')
          AND DATEDIFF(DAY, OE_UPDATED_AT, GETDATE()) >= @dias
          AND NOT EXISTS (
            SELECT 1 FROM AREA_OKR_ALERTAS_LOG
            WHERE AL_OBJETIVO_ID = AREA_OBJETIVOS_ESTRATEGICOS.OE_ID
              AND CAST(AL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    const usuariosCorreo = await getUsuariosParaNotificarCorreo(AREA_KEY, tenantKey);
    const estatusLabel = { at_risk: 'At risk', off_track: 'Off track' };

    for (const objetivo of candidatosRs.recordset) {
      const colabRs = await pool.request().input('objetivoId', sql.Int, objetivo.id)
        .query(`SELECT OC_USUARIO_ID as usuarioId FROM AREA_OBJETIVO_COLABORADORES WHERE OC_OBJETIVO_ID=@objetivoId`);
      const destinatariosInApp = new Set([objetivo.responsableId, ...colabRs.recordset.map((c) => c.usuarioId), ...usuariosCorreo].filter(Boolean));

      for (const usuarioId of destinatariosInApp) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: `Objetivo "${objetivo.titulo}" lleva ${objetivo.diasEstancado} días en ${estatusLabel[objetivo.estatusManual]} sin actualizaciones`,
          tipo: 'okr_estancado',
          dataExtra: { objetivoId: objetivo.id },
          tenantKey,
        });
      }

      if (usuariosCorreo.length) {
        const correosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${usuariosCorreo.join(',') || '0'})`);
        const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);
        if (correos.length) {
          await emailService.sendOkrRiesgoEmail({
            to: correos,
            objetivoTitulo: objetivo.titulo,
            diasEstancado: objetivo.diasEstancado,
            estatusLabel: estatusLabel[objetivo.estatusManual],
          });
        }
      }

      await pool.request().input('objetivoId', sql.Int, objetivo.id)
        .query(`INSERT INTO AREA_OKR_ALERTAS_LOG (AL_OBJETIVO_ID) VALUES (@objetivoId)`);
    }
  } catch (err) {
    logger.error('planeacionEstrategicaController.ejecutarAlertaObjetivosEstancados', err);
  }
}

cron.schedule('0 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaObjetivosEstancados(pool, key);
    } catch (err) {
      logger.error(`[CRON okr-estancados][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

// ── Evidencias ────────────────────────────────────────────────────────────
async function listEvidencias(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('krId', sql.Int, id)
      .query(`
        SELECT EV.EV_ID as id, EV.EV_KR_ID as krId, EV.EV_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               EV.EV_NOMBRE_ORIGINAL as nombreOriginal, EV.EV_MIME as mime, EV.EV_TAMANIO as tamanio, EV.EV_CREATED_AT as createdAt
        FROM AREA_KR_EVIDENCIAS EV
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = EV.EV_USUARIO_ID
        WHERE EV.EV_KR_ID=@krId
        ORDER BY EV.EV_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('planeacionEstrategicaController.listEvidencias', err);
    res.status(500).json({ success: false, message: 'Error al obtener evidencias' });
  }
}

async function subirEvidencias(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    for (const file of req.files) {
      await pool.request()
        .input('krId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO AREA_KR_EVIDENCIAS (EV_KR_ID, EV_USUARIO_ID, EV_NOMBRE_ARCHIVO, EV_NOMBRE_ORIGINAL, EV_MIME, EV_TAMANIO)
          VALUES (@krId, @usuarioId, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'subir-evidencia',
      entidadId: id, detalle: { krId: id, cantidad: req.files.length }, ip: req.ip,
    });

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('planeacionEstrategicaController.subirEvidencias', err);
    res.status(500).json({ success: false, message: 'Error al subir evidencias' });
  }
}

async function eliminarEvidencia(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT EV_USUARIO_ID as usuarioId, EV_NOMBRE_ARCHIVO as nombreArchivo FROM AREA_KR_EVIDENCIAS WHERE EV_ID=@id`);
    const evidencia = rs.recordset[0];
    if (!evidencia) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });
    if (evidencia.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propias evidencias' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_KR_EVIDENCIAS WHERE EV_ID=@id`);

    try {
      const filePath = path.join(OKR_EVIDENCIAS_DIR, path.basename(evidencia.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('planeacionEstrategicaController.eliminarEvidencia fs', fsErr?.message || fsErr);
    }

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-evidencia',
      entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('planeacionEstrategicaController.eliminarEvidencia', err);
    res.status(500).json({ success: false, message: 'Error al eliminar evidencia' });
  }
}

async function verEvidencia(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT EV_NOMBRE_ARCHIVO as nombreArchivo, EV_NOMBRE_ORIGINAL as nombreOriginal FROM AREA_KR_EVIDENCIAS WHERE EV_ID=@id`);
    const evidencia = rs.recordset[0];
    if (!evidencia) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    const filename = path.basename(evidencia.nombreArchivo);
    const filePath = path.join(OKR_EVIDENCIAS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidencia.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('planeacionEstrategicaController.verEvidencia stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('planeacionEstrategicaController.verEvidencia', err);
    res.status(500).json({ success: false, message: 'Error al servir evidencia' });
  }
}

module.exports = {
  listObjetivos,
  crearObjetivo,
  actualizarObjetivo,
  actualizarEstatusManual,
  eliminarObjetivo,
  crearResultadoClave,
  actualizarResultadoClave,
  eliminarResultadoClave,
  getKrCheckins,
  listMilestones,
  crearMilestone,
  actualizarMilestone,
  eliminarMilestone,
  exportarPdf,
  listComentarios,
  crearComentario,
  eliminarComentario,
  listEvidencias,
  subirEvidencias,
  eliminarEvidencia,
  verEvidencia,
};
