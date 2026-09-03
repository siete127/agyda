const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const { AREA_KEYS, AREA_LABELS } = require('../constants/areas');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const emailService = require('../services/emailService');

const MODULO_AUDIT = 'indicadores-empresariales';
const TONO_LABEL = { warn: 'riesgo', critical: 'crítico' };

// Resumen ejecutivo: grid de cobertura de las 10 áreas + top KPIs de las que ya reportan.
async function getResumen(req, res) {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT AK_AREA_KEY as areaKey, COUNT(*) as kpiCount, MAX(AK_FECHA_CORTE) as ultimaActualizacion
        FROM AREA_KPIS
        WHERE AK_PERIODO = @periodo
        GROUP BY AK_AREA_KEY
      `);

    const reportando = new Map(rs.recordset.map((r) => [r.areaKey, r]));

    const kpisRs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT AK_AREA_KEY as areaKey, AK_KPI_KEY as kpiKey, AK_LABEL as label, AK_VALOR as valor,
               AK_META as meta, AK_UNIDAD as unidad, AK_TONO as tono
        FROM AREA_KPIS WHERE AK_PERIODO = @periodo ORDER BY AK_ID
      `);
    const kpisPorArea = new Map();
    for (const k of kpisRs.recordset) {
      if (!kpisPorArea.has(k.areaKey)) kpisPorArea.set(k.areaKey, []);
      kpisPorArea.get(k.areaKey).push(k);
    }

    const areas = AREA_KEYS.filter((k) => k !== 'direccion-general').map((areaKey) => {
      const info = reportando.get(areaKey);
      return {
        areaKey,
        label: AREA_LABELS[areaKey],
        reportando: !!info,
        kpiCount: info?.kpiCount || 0,
        ultimaActualizacion: info?.ultimaActualizacion || null,
        kpis: (kpisPorArea.get(areaKey) || []).slice(0, 3),
      };
    });

    res.json({ success: true, data: { periodo, areas, areasReportando: areas.filter((a) => a.reportando).length, totalAreas: areas.length } });
  } catch (err) {
    logger.error('direccionGeneralController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen ejecutivo' });
  }
}

// Semáforo agregado de un área a partir del tono de sus KPIs del periodo: critical > warn > success; null si no reporta.
function calcularSemaforoPorArea(kpis) {
  if (!kpis || kpis.length === 0) return null;
  if (kpis.some((k) => k.tono === 'critical')) return 'critical';
  if (kpis.some((k) => k.tono === 'warn')) return 'warn';
  return 'success';
}

// Panorama consolidado de supervisión: semáforo por área a partir de AREA_KPIS del periodo (sin detalle operativo).
async function getSupervisionGeneral(req, res) {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);

    const kpisRs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT AK_AREA_KEY as areaKey, AK_TONO as tono, MAX(AK_FECHA_CORTE) as ultimaActualizacion, COUNT(*) as kpiCount
        FROM AREA_KPIS
        WHERE AK_PERIODO = @periodo
        GROUP BY AK_AREA_KEY, AK_TONO
      `);

    const porArea = new Map();
    for (const row of kpisRs.recordset) {
      if (!porArea.has(row.areaKey)) porArea.set(row.areaKey, []);
      porArea.get(row.areaKey).push(row);
    }

    const areas = AREA_KEYS.map((areaKey) => {
      const rows = porArea.get(areaKey) || [];
      const kpiCount = rows.reduce((acc, r) => acc + r.kpiCount, 0);
      const ultimaActualizacion = rows.reduce((max, r) => (!max || (r.ultimaActualizacion && r.ultimaActualizacion > max) ? r.ultimaActualizacion : max), null);
      return {
        areaKey,
        label: AREA_LABELS[areaKey],
        semaforo: calcularSemaforoPorArea(rows),
        kpiCount,
        ultimaActualizacion,
      };
    });

    res.json({ success: true, data: { periodo, areas } });
  } catch (err) {
    logger.error('direccionGeneralController.getSupervisionGeneral', err);
    res.status(500).json({ success: false, message: 'Error al obtener supervisión general' });
  }
}

// Arma el consolidado de indicadores de un periodo (áreas + KPIs + progreso + totales por semáforo
// + conteo de comentarios). Compartido por getIndicadores y exportarIndicadoresPdf.
async function obtenerIndicadoresDetallados(pool, periodo) {
  const rs = await pool.request()
    .input('periodo', sql.NVarChar, periodo)
    .query(`
      SELECT AK_AREA_KEY as areaKey, COUNT(*) as kpiCount, MAX(AK_FECHA_CORTE) as ultimaActualizacion
      FROM AREA_KPIS
      WHERE AK_PERIODO = @periodo
      GROUP BY AK_AREA_KEY
    `);
  const reportando = new Map(rs.recordset.map((r) => [r.areaKey, r]));

  const kpisRs = await pool.request()
    .input('periodo', sql.NVarChar, periodo)
    .query(`
      SELECT AK.AK_AREA_KEY as areaKey, AK.AK_KPI_KEY as kpiKey, AK.AK_LABEL as label, AK.AK_VALOR as valor,
             AK.AK_META as meta, AK.AK_UNIDAD as unidad, AK.AK_TONO as tono, AK.AK_FECHA_CORTE as fechaCorte,
             AK.AK_FORMULA as formula, AK.AK_ORIGEN as origen, U.NEUS_NOMBRES as responsable
      FROM AREA_KPIS AK
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = AK.AK_RESPONSABLE_ID
      WHERE AK.AK_PERIODO = @periodo ORDER BY AK.AK_ID
    `);

  const comentariosRs = await pool.request()
    .input('periodo', sql.NVarChar, periodo)
    .query(`
      SELECT KC_AREA_KEY as areaKey, KC_KPI_KEY as kpiKey, COUNT(*) as total
      FROM AREA_KPI_COMENTARIOS
      WHERE KC_PERIODO = @periodo
      GROUP BY KC_AREA_KEY, KC_KPI_KEY
    `);
  const comentariosPorKpi = new Map(comentariosRs.recordset.map((c) => [`${c.areaKey}:${c.kpiKey}`, c.total]));

  const kpisPorArea = new Map();
  const totales = { onMeta: 0, enRiesgo: 0, critico: 0, totalKpis: 0 };
  for (const k of kpisRs.recordset) {
    const progreso = k.meta ? Math.round((k.valor / k.meta) * 100) : null;
    const comentariosCount = comentariosPorKpi.get(`${k.areaKey}:${k.kpiKey}`) || 0;
    const kpi = { ...k, progreso, comentariosCount };
    if (!kpisPorArea.has(k.areaKey)) kpisPorArea.set(k.areaKey, []);
    kpisPorArea.get(k.areaKey).push(kpi);

    totales.totalKpis++;
    if (k.tono === 'critical') totales.critico++;
    else if (k.tono === 'warn') totales.enRiesgo++;
    else if (progreso === null || progreso >= 100 || k.tono === 'success') totales.onMeta++;
  }

  const areas = AREA_KEYS.filter((k) => k !== 'direccion-general').map((areaKey) => {
    const info = reportando.get(areaKey);
    return {
      areaKey,
      label: AREA_LABELS[areaKey],
      reportando: !!info,
      ultimaActualizacion: info?.ultimaActualizacion || null,
      kpis: kpisPorArea.get(areaKey) || [],
    };
  });

  return {
    periodo,
    areas,
    totales,
    areasReportando: areas.filter((a) => a.reportando).length,
    totalAreas: areas.length,
  };
}

// Indicadores empresariales: TODOS los KPIs de todas las áreas del periodo,
// con progreso contra meta y conteo por semáforo — vista analítica completa
// (a diferencia de getResumen, que corta a los primeros 3 KPIs por área).
async function getIndicadores(req, res) {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const data = await obtenerIndicadoresDetallados(pool, periodo);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('direccionGeneralController.getIndicadores', err);
    res.status(500).json({ success: false, message: 'Error al obtener indicadores empresariales' });
  }
}

// Histórico de un KPI específico: últimos N periodos ya existentes en AREA_KPIS
// (cada mes es una fila distinta por la clave única AK_AREA_KEY+AK_KPI_KEY+AK_PERIODO,
// así que no hace falta tabla nueva) + variación % contra el periodo anterior.
async function getKpiHistorico(req, res) {
  try {
    const { areaKey, kpiKey } = req.params;
    const meses = Math.min(24, Math.max(1, Number(req.query.meses) || 12));
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('kpiKey', sql.NVarChar, kpiKey)
      .input('meses', sql.Int, meses)
      .query(`
        SELECT TOP (@meses) AK_PERIODO as periodo, AK_VALOR as valor, AK_META as meta, AK_FECHA_CORTE as fechaCorte
        FROM AREA_KPIS
        WHERE AK_AREA_KEY = @areaKey AND AK_KPI_KEY = @kpiKey
        ORDER BY AK_PERIODO DESC
      `);

    const historico = rs.recordset.reverse(); // ascendente para graficar
    const puntos = historico.map((p, i) => {
      const anterior = i > 0 ? historico[i - 1].valor : null;
      const variacionPct = anterior ? Math.round(((p.valor - anterior) / Math.abs(anterior)) * 1000) / 10 : null;
      return { ...p, variacionPct };
    });

    res.json({ success: true, data: puntos });
  } catch (err) {
    logger.error('direccionGeneralController.getKpiHistorico', err);
    res.status(500).json({ success: false, message: 'Error al obtener histórico del KPI' });
  }
}

// ── Comentarios por KPI ──────────────────────────────────────────────────
async function listComentariosKpi(req, res) {
  try {
    const { areaKey, kpiKey } = req.params;
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('kpiKey', sql.NVarChar, kpiKey)
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT KC.KC_ID as id, KC.KC_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre, KC.KC_TEXTO as texto, KC.KC_CREATED_AT as createdAt
        FROM AREA_KPI_COMENTARIOS KC
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = KC.KC_USUARIO_ID
        WHERE KC.KC_AREA_KEY=@areaKey AND KC.KC_KPI_KEY=@kpiKey AND KC.KC_PERIODO=@periodo
        ORDER BY KC.KC_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('direccionGeneralController.listComentariosKpi', err);
    res.status(500).json({ success: false, message: 'Error al obtener comentarios' });
  }
}

async function crearComentarioKpi(req, res) {
  try {
    const { areaKey, kpiKey } = req.params;
    const { texto, periodo } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'Texto requerido' });
    const p = periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('kpiKey', sql.NVarChar, kpiKey)
      .input('periodo', sql.NVarChar, p)
      .input('usuarioId', sql.Int, usuarioId)
      .input('texto', sql.NVarChar, texto.trim())
      .query(`
        INSERT INTO AREA_KPI_COMENTARIOS (KC_AREA_KEY, KC_KPI_KEY, KC_PERIODO, KC_USUARIO_ID, KC_TEXTO)
        OUTPUT INSERTED.KC_ID as id
        VALUES (@areaKey, @kpiKey, @periodo, @usuarioId, @texto);
      `);

    await logAudit(pool, {
      userId: usuarioId, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'comentar-kpi',
      entidadId: `${areaKey}:${kpiKey}:${p}`, detalle: { comentarioId: rs.recordset[0].id }, ip: req.ip,
    });

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('direccionGeneralController.crearComentarioKpi', err);
    res.status(500).json({ success: false, message: 'Error al crear comentario' });
  }
}

async function eliminarComentarioKpi(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT KC_USUARIO_ID as usuarioId FROM AREA_KPI_COMENTARIOS WHERE KC_ID=@id`);
    const comentario = rs.recordset[0];
    if (!comentario) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    if (comentario.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propios comentarios' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM AREA_KPI_COMENTARIOS WHERE KC_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('direccionGeneralController.eliminarComentarioKpi', err);
    res.status(500).json({ success: false, message: 'Error al eliminar comentario' });
  }
}

// ── Exportar PDF ─────────────────────────────────────────────────────────
// Arma el buffer del PDF de indicadores de un periodo. Compartida por el endpoint
// de descarga bajo demanda (exportarIndicadoresPdf) y el envío automático mensual
// (enviarReporteIndicadoresMensual), sin depender de req/res.
async function generarIndicadoresPdfBuffer(pool, periodo) {
  const { areas } = await obtenerIndicadoresDetallados(pool, periodo);
  const areasConDatos = areas.filter((a) => a.kpis.length > 0);

  const logoPath = path.join(__dirname, '../assets/LOGO.png');
  const hasLogo = fs.existsSync(logoPath);

  const PAGE_W = 612, PAGE_H = 792;
  const M = 50;
  const doc = new PDFDocument({ size: 'letter', margin: 0, autoFirstPage: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const drawHeader = (subtitulo) => {
      doc.rect(0, 0, PAGE_W, 90).fill('#0D1B3E');
      if (hasLogo) {
        try { doc.image(logoPath, PAGE_W - M - 110, 18, { width: 110 }); } catch (_) { /* best-effort */ }
      }
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text('ARDABYTEC', M, 22, { width: 300 });
      doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Indicadores empresariales', M, 38);
      doc.rect(0, 90, PAGE_W, 26).fill('#1B4FD8');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
        .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W });
      return 132;
    };

    let y = drawHeader(`Indicadores del periodo ${periodo}`);
    const ensureSpace = (needed) => {
      if (y + needed > PAGE_H - M) {
        doc.addPage();
        y = drawHeader(`Indicadores del periodo ${periodo} (cont.)`);
      }
    };

    if (areasConDatos.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#374151')
        .text('Ninguna área ha publicado indicadores para este periodo.', M, y);
    }

    areasConDatos.forEach((area) => {
      ensureSpace(30);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0D1B3E').text(area.label, M, y, { width: PAGE_W - M * 2 });
      y += 18;

      area.kpis.forEach((kpi) => {
        ensureSpace(28);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827')
          .text(kpi.label, M + 10, y, { width: PAGE_W - M * 2 - 10 });
        y += 13;

        const metaTxt = kpi.meta !== null ? `Meta: ${kpi.meta} ${kpi.unidad || ''} (${kpi.progreso}%)` : 'Sin meta definida';
        const respTxt = kpi.responsable ? `  ·  Responsable: ${kpi.responsable}` : '';
        doc.font('Helvetica').fontSize(8.5).fillColor('#6B7280')
          .text(`Valor: ${kpi.valor} ${kpi.unidad || ''}  ·  ${metaTxt}${respTxt}`, M + 10, y, { width: PAGE_W - M * 2 - 10 });
        y += 16;
      });

      y += 8;
      doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke('#E5E7EB');
      y += 14;
    });

    doc.end();
  });
}

async function exportarIndicadoresPdf(req, res) {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const buffer = await generarIndicadoresPdfBuffer(pool, periodo);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="indicadores_empresariales_${periodo}.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error('direccionGeneralController.exportarIndicadoresPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Alertas de KPIs en riesgo/crítico (cron) ─────────────────────────────
async function ejecutarAlertaKpisEnRiesgo(pool, tenantKey) {
  try {
    const periodo = new Date().toISOString().slice(0, 7);
    const candidatosRs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT AK_AREA_KEY as areaKey, AK_KPI_KEY as kpiKey, AK_LABEL as label, AK_VALOR as valor,
               AK_META as meta, AK_UNIDAD as unidad, AK_TONO as tono, AK_RESPONSABLE_ID as responsableId
        FROM AREA_KPIS
        WHERE AK_PERIODO = @periodo AND AK_TONO IN ('warn', 'critical')
          AND NOT EXISTS (
            SELECT 1 FROM AREA_KPI_ALERTAS_LOG
            WHERE KL_AREA_KEY = AREA_KPIS.AK_AREA_KEY AND KL_KPI_KEY = AREA_KPIS.AK_KPI_KEY AND KL_PERIODO = AREA_KPIS.AK_PERIODO
              AND CAST(KL_FECHA AS DATE) = CAST(GETDATE() AS DATE)
          )
      `);

    const usuariosCorreo = await getUsuariosParaNotificarCorreo('direccion-general', tenantKey);

    for (const kpi of candidatosRs.recordset) {
      const areaLabel = AREA_LABELS[kpi.areaKey] || kpi.areaKey;
      const tonoLabel = TONO_LABEL[kpi.tono] || kpi.tono;
      const destinatariosInApp = new Set([kpi.responsableId, ...usuariosCorreo].filter(Boolean));

      for (const usuarioId of destinatariosInApp) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: `Indicador "${kpi.label}" (${areaLabel}) está en ${tonoLabel}`,
          tipo: 'kpi_riesgo',
          dataExtra: { areaKey: kpi.areaKey, kpiKey: kpi.kpiKey, periodo },
          tenantKey,
        });
      }

      if (usuariosCorreo.length) {
        const correosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${usuariosCorreo.join(',') || '0'})`);
        const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);
        if (correos.length) {
          await emailService.sendKpiRiesgoEmail({
            to: correos,
            kpiLabel: kpi.label,
            areaLabel,
            valor: kpi.valor,
            meta: kpi.meta,
            unidad: kpi.unidad,
            tonoLabel,
          });
        }
      }

      await pool.request()
        .input('areaKey', sql.NVarChar, kpi.areaKey)
        .input('kpiKey', sql.NVarChar, kpi.kpiKey)
        .input('periodo', sql.NVarChar, periodo)
        .query(`INSERT INTO AREA_KPI_ALERTAS_LOG (KL_AREA_KEY, KL_KPI_KEY, KL_PERIODO) VALUES (@areaKey, @kpiKey, @periodo)`);
    }
  } catch (err) {
    logger.error('direccionGeneralController.ejecutarAlertaKpisEnRiesgo', err);
  }
}

cron.schedule('0 9 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaKpisEnRiesgo(pool, key);
    } catch (err) {
      logger.error(`[CRON kpis-riesgo][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

// ── Reporte mensual por correo ───────────────────────────────────────────
// Envía el PDF de indicadores del mes que acaba de cerrar a los usuarios con
// 'notificar-correo' habilitado para direccion-general (mismo mecanismo de
// destinatarios que ejecutarAlertaKpisEnRiesgo).
async function enviarReporteIndicadoresMensual(pool, tenantKey) {
  try {
    const hoy = new Date();
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const periodo = mesAnterior.toISOString().slice(0, 7);

    const usuariosCorreo = await getUsuariosParaNotificarCorreo('direccion-general', tenantKey);
    if (usuariosCorreo.length === 0) return;

    // Notificación in-app + push: no depende de que el correo se pueda
    // resolver/enviar, así que va antes y en su propio flujo — un usuario
    // sin correo válido igual debe recibir el aviso por push.
    for (const usuarioId of usuariosCorreo) {
      await notificationService.createNotification({
        usuarioId,
        mensaje: `Reporte de indicadores de ${periodo} disponible`,
        tipo: 'reporte_indicadores_mensual',
        dataExtra: { periodo },
        tenantKey,
      });
    }

    const correosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${usuariosCorreo.join(',') || '0'})`);
    const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);
    if (correos.length === 0) return;

    const buffer = await generarIndicadoresPdfBuffer(pool, periodo);
    await emailService.sendReporteIndicadoresEmail({ to: correos, periodo, pdfBuffer: buffer });
  } catch (err) {
    logger.error('direccionGeneralController.enviarReporteIndicadoresMensual', err);
  }
}

cron.schedule('0 8 1 * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await enviarReporteIndicadoresMensual(pool, key);
    } catch (err) {
      logger.error(`[CRON reporte-mensual-indicadores][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

// ── Alerta de áreas sin reportar KPIs en el mes (Supervisión general) ───
// Revisa, al día 10 de cada mes, qué áreas no han publicado ningún KPI del
// periodo actual y notifica a los destinatarios configurados con 'notificar-correo'
// para direccion-general (mismo mecanismo que ejecutarAlertaKpisEnRiesgo).
async function ejecutarAlertaAreasSinReportar(pool, tenantKey) {
  try {
    const periodo = new Date().toISOString().slice(0, 7);

    const reportandoRs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`SELECT DISTINCT AK_AREA_KEY as areaKey FROM AREA_KPIS WHERE AK_PERIODO = @periodo`);
    const areasReportando = new Set(reportandoRs.recordset.map((r) => r.areaKey));

    const areasSinReportar = AREA_KEYS.filter((areaKey) => !areasReportando.has(areaKey));
    if (areasSinReportar.length === 0) return;

    const usuariosCorreo = await getUsuariosParaNotificarCorreo('direccion-general', tenantKey);
    if (usuariosCorreo.length === 0) return;

    const correosRs = await pool.request().query(`SELECT NEUS_ID as id, NEUS_USUARIO as correo FROM NEUS_USUARIOS WHERE NEUS_ID IN (${usuariosCorreo.join(',') || '0'})`);
    const correos = correosRs.recordset.map((u) => u.correo).filter(Boolean);

    for (const areaKey of areasSinReportar) {
      const yaAlertadaRs = await pool.request()
        .input('areaKey', sql.NVarChar, areaKey)
        .input('periodo', sql.NVarChar, periodo)
        .query(`SELECT 1 as x FROM AREA_SUPERVISION_ALERTAS_LOG WHERE SAL_AREA_KEY=@areaKey AND SAL_PERIODO=@periodo`);
      if (yaAlertadaRs.recordset.length > 0) continue;

      const areaLabel = AREA_LABELS[areaKey] || areaKey;

      for (const usuarioId of usuariosCorreo) {
        await notificationService.createNotification({
          usuarioId,
          mensaje: `El área "${areaLabel}" no ha reportado indicadores este periodo`,
          tipo: 'area_sin_reportar',
          dataExtra: { areaKey, periodo },
          tenantKey,
        });
      }

      if (correos.length) {
        await emailService.sendAreaSinReportarEmail({ to: correos, areaLabel, periodo });
      }

      await pool.request()
        .input('areaKey', sql.NVarChar, areaKey)
        .input('periodo', sql.NVarChar, periodo)
        .query(`INSERT INTO AREA_SUPERVISION_ALERTAS_LOG (SAL_AREA_KEY, SAL_PERIODO) VALUES (@areaKey, @periodo)`);
    }
  } catch (err) {
    logger.error('direccionGeneralController.ejecutarAlertaAreasSinReportar', err);
  }
}

cron.schedule('0 9 10 * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await ejecutarAlertaAreasSinReportar(pool, key);
    } catch (err) {
      logger.error(`[CRON supervision-areas-sin-reportar][${key}]`, err);
    }
  }
}, { timezone: 'America/Mexico_City' });

// ── Compartir snapshot con link ──────────────────────────────────────────
async function generarLinkIndicadores(req, res) {
  try {
    const { periodo } = req.body;
    const p = periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.request()
      .input('token', sql.NVarChar, token)
      .input('periodo', sql.NVarChar, p)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .input('expira', sql.DateTime, expira)
      .query(`INSERT INTO AREA_KPI_SNAPSHOT_TOKENS (ST_TOKEN, ST_PERIODO, ST_CREADO_POR, ST_EXPIRA) VALUES (@token, @periodo, @creadoPor, @expira)`);

    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'generar-link-compartido',
      entidadId: p, detalle: { token: token.slice(0, 8) + '…' }, ip: req.ip,
    });

    res.json({ success: true, data: { token } });
  } catch (err) {
    logger.error('direccionGeneralController.generarLinkIndicadores', err);
    res.status(500).json({ success: false, message: 'Error al generar el enlace' });
  }
}

async function getIndicadoresPublico(req, res) {
  try {
    const { token } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const tkRs = await pool.request().input('token', sql.NVarChar, token)
      .query(`SELECT ST_PERIODO as periodo, ST_EXPIRA as expira FROM AREA_KPI_SNAPSHOT_TOKENS WHERE ST_TOKEN=@token AND ST_ACTIVO=1`);
    const tk = tkRs.recordset[0];
    if (!tk || new Date(tk.expira) < new Date()) {
      return res.status(404).json({ success: false, message: 'Enlace inválido o expirado' });
    }

    const { periodo, areas, totales } = await obtenerIndicadoresDetallados(pool, tk.periodo);
    const areasPublicas = areas
      .filter((a) => a.kpis.length > 0)
      .map((a) => ({
        areaKey: a.areaKey,
        label: a.label,
        kpis: a.kpis.map((k) => ({
          kpiKey: k.kpiKey,
          label: k.label,
          valor: k.valor,
          meta: k.meta,
          unidad: k.unidad,
          tono: k.tono,
          progreso: k.progreso,
        })),
      }));

    res.json({ success: true, data: { periodo, areas: areasPublicas, totales } });
  } catch (err) {
    logger.error('direccionGeneralController.getIndicadoresPublico', err);
    res.status(500).json({ success: false, message: 'Error al obtener el snapshot' });
  }
}

module.exports = {
  getResumen,
  getSupervisionGeneral,
  getIndicadores,
  getKpiHistorico,
  listComentariosKpi,
  crearComentarioKpi,
  eliminarComentarioKpi,
  exportarIndicadoresPdf,
  generarLinkIndicadores,
  getIndicadoresPublico,
};
