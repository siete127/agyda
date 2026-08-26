const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');
const {
  CATALOGO_FUENTES,
  getCatalogoPublico,
  LIMITE_METRICAS,
  LIMITE_DIMENSIONES,
  LIMITE_FILAS,
} = require('../constants/reportesEjecutivosCatalogo');

const MODULO_AUDIT = 'reportes-ejecutivos';
const FUENTES_VALIDAS = Object.keys(CATALOGO_FUENTES);
const SQL_TYPE_MAP = { NVarChar: sql.NVarChar, Int: sql.Int, DateTime: sql.DateTime };

async function getCatalogo(req, res) {
  try {
    res.json({ success: true, data: getCatalogoPublico() });
  } catch (err) {
    logger.error('reportesEjecutivosController.getCatalogo', err);
    res.status(500).json({ success: false, message: 'Error al obtener catálogo' });
  }
}

// Valores distintos realmente existentes en la BD para un filtro de texto (NVarChar),
// para poblar un <select> en vez de un input libre y evitar comparaciones exactas
// contra valores que el usuario adivina y que nunca coinciden con ningún registro.
async function getOpcionesFiltro(req, res) {
  try {
    const { fuente, filtro } = req.query;
    if (!FUENTES_VALIDAS.includes(fuente)) return res.status(400).json({ success: false, message: 'Fuente inválida' });
    const catalogo = CATALOGO_FUENTES[fuente];
    const def = catalogo.filtrosPermitidos[filtro];
    if (!def || def.sqlType !== 'NVarChar') return res.status(400).json({ success: false, message: 'Filtro inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT DISTINCT ${def.columna} AS valor
      ${catalogo.from}
      AND ${def.columna} IS NOT NULL AND LTRIM(RTRIM(${def.columna})) <> ''
      ORDER BY valor
    `);
    res.json({ success: true, data: rs.recordset.map((r) => r.valor) });
  } catch (err) {
    logger.error('reportesEjecutivosController.getOpcionesFiltro', err);
    res.status(500).json({ success: false, message: 'Error al obtener opciones de filtro' });
  }
}

function validarSeleccion(fuente, metricas, dimensiones, agruparPor) {
  if (!FUENTES_VALIDAS.includes(fuente)) return 'Fuente de datos inválida';
  const catalogo = CATALOGO_FUENTES[fuente];

  if (!Array.isArray(metricas) || metricas.length === 0) return 'Selecciona al menos una métrica';
  if (metricas.length > LIMITE_METRICAS) return `Máximo ${LIMITE_METRICAS} métricas por reporte`;
  for (const m of metricas) {
    if (!catalogo.metricas.some((c) => c.key === m)) return `Métrica inválida: ${m}`;
  }

  const dims = Array.isArray(dimensiones) ? dimensiones : [];
  if (dims.length > LIMITE_DIMENSIONES) return `Máximo ${LIMITE_DIMENSIONES} dimensiones por reporte`;
  for (const d of dims) {
    if (!catalogo.dimensiones.some((c) => c.key === d && c.agrupable)) return `Dimensión inválida: ${d}`;
  }

  if (agruparPor && !dims.includes(agruparPor)) return 'La agrupación debe ser una de las dimensiones seleccionadas';

  return null;
}

// Traduce la selección validada del usuario a SQL parametrizado. Nunca interpola texto
// libre del body: metricas/dimensiones/agruparPor solo resuelven expresionSQL fija del
// catálogo (whitelist); los valores de filtros siempre entran vía request.input().
function construirQuery(pool, fuente, metricas, dimensiones, filtros) {
  const catalogo = CATALOGO_FUENTES[fuente];
  const dims = Array.isArray(dimensiones) ? dimensiones : [];

  const metricasResueltas = metricas.map((key) => catalogo.metricas.find((c) => c.key === key));
  const dimensionesResueltas = dims.map((key) => catalogo.dimensiones.find((c) => c.key === key));

  const selectDims = dimensionesResueltas.map((d) => `${d.expresionSQL} AS [${d.key}]`);
  const selectMetricas = metricasResueltas.map((m) => {
    if (m.agregacion === 'AVG_PONDERADO') {
      return `CASE WHEN SUM(CAST(${m.pesoSQL} AS DECIMAL(18,4))) > 0 THEN ROUND(SUM(CAST(${m.expresionSQL} AS DECIMAL(18,4)) * CAST(${m.pesoSQL} AS DECIMAL(18,4))) / SUM(CAST(${m.pesoSQL} AS DECIMAL(18,4))), 0) ELSE 0 END AS [${m.key}]`;
    }
    if (m.agregacion === 'COUNT' && m.expresionSQL.startsWith('DISTINCT ')) {
      return `COUNT(${m.expresionSQL}) AS [${m.key}]`;
    }
    return `${m.agregacion}(${m.expresionSQL}) AS [${m.key}]`;
  });

  let sqlText = `SELECT TOP ${LIMITE_FILAS} ${[...selectDims, ...selectMetricas].join(', ')}\n${catalogo.from}\n`;

  const request = pool.request();
  let paramIdx = 0;
  if (filtros && typeof filtros === 'object') {
    for (const [key, value] of Object.entries(filtros)) {
      if (value === undefined || value === null || value === '') continue;
      const def = catalogo.filtrosPermitidos[key];
      if (!def) continue; // filtro no whitelisteado para esta fuente: se ignora silenciosamente
      let valorTipado = value;
      if (def.sqlType === 'Int') {
        valorTipado = Number(value);
        if (!Number.isInteger(valorTipado)) {
          throw Object.assign(new Error(`Filtro inválido: ${key} debe ser numérico`), { status: 400 });
        }
      }

      const paramName = `f${paramIdx++}`;
      const operador = def.operador || '=';
      sqlText += ` AND ${def.columna} ${operador} @${paramName}`;
      request.input(paramName, SQL_TYPE_MAP[def.sqlType], valorTipado);
    }
  }

  if (dims.length > 0) {
    sqlText += `\nGROUP BY ${dimensionesResueltas.map((d) => d.expresionSQL).join(', ')}`;
  }

  const columnas = [
    ...dimensionesResueltas.map((d) => ({ key: d.key, label: d.label, tipo: 'dimension', formato: d.formato })),
    ...metricasResueltas.map((m) => ({ key: m.key, label: m.label, tipo: 'metrica', formato: m.formato })),
  ];

  return { sqlText, request, columnas };
}

async function ejecutarReporte(req, res) {
  try {
    const { fuente, metricas, dimensiones, filtros, agruparPor } = req.body || {};
    const errorValidacion = validarSeleccion(fuente, metricas, dimensiones, agruparPor);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const pool = await databaseService.getPool(req.user?.empresa);
    const { sqlText, request, columnas } = construirQuery(pool, fuente, metricas, dimensiones, filtros);
    const rs = await request.query(sqlText);

    res.json({
      success: true,
      data: { columnas, filas: rs.recordset, totalFilas: rs.recordset.length, generadoAt: new Date().toISOString() },
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    logger.error('reportesEjecutivosController.ejecutarReporte', err);
    res.status(500).json({ success: false, message: 'Error al generar el reporte' });
  }
}

function formatearValor(valor, formato) {
  if (valor === null || valor === undefined) return '—';
  if (formato === 'porcentaje') return `${valor}%`;
  if (formato === 'moneda') return `$${Number(valor).toLocaleString()}`;
  return String(valor);
}

async function exportarPdf(req, res) {
  try {
    const { fuente, metricas, dimensiones, filtros, agruparPor } = req.body || {};
    const errorValidacion = validarSeleccion(fuente, metricas, dimensiones, agruparPor);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const pool = await databaseService.getPool(req.user?.empresa);
    const { sqlText, request, columnas } = construirQuery(pool, fuente, metricas, dimensiones, filtros);
    const rs = await request.query(sqlText);
    const filas = rs.recordset;
    const labelFuente = CATALOGO_FUENTES[fuente].label;

    const logoPath = path.join(__dirname, '../assets/LOGO.png');
    const hasLogo = fs.existsSync(logoPath);

    const PAGE_W = 612, PAGE_H = 792;
    const M = 50;
    const doc = new PDFDocument({ size: 'letter', margin: 0, autoFirstPage: true, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    const buffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PAGE_W_L = PAGE_H, PAGE_H_L = PAGE_W; // landscape: ancho/alto intercambiados
      const drawHeader = (subtitulo) => {
        doc.rect(0, 0, PAGE_W_L, 90).fill('#0D1B3E');
        if (hasLogo) {
          try { doc.image(logoPath, PAGE_W_L - M - 110, 18, { width: 110 }); } catch (_) { /* best-effort */ }
        }
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text('ARDABYTEC', M, 22, { width: 300 });
        doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF').text('Reportes ejecutivos', M, 38);
        doc.rect(0, 90, PAGE_W_L, 26).fill('#1B4FD8');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
          .text(subtitulo, 0, 97, { align: 'center', width: PAGE_W_L });
        return 132;
      };

      let y = drawHeader(`Reporte: ${labelFuente}`);
      const ensureSpace = (needed) => {
        if (y + needed > PAGE_H_L - M) {
          doc.addPage();
          y = drawHeader(`Reporte: ${labelFuente} (cont.)`);
        }
      };

      const colWidth = (PAGE_W_L - M * 2) / columnas.length;

      const drawRow = (values, opts = {}) => {
        columnas.forEach((c, i) => {
          doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(opts.color || '#374151')
            .text(String(values[i]), M + i * colWidth, y, { width: colWidth - 6 });
        });
        y += 16;
      };

      ensureSpace(20);
      drawRow(columnas.map((c) => c.label), { bold: true, color: '#0D1B3E' });
      doc.moveTo(M, y).lineTo(PAGE_W_L - M, y).stroke('#E5E7EB');
      y += 6;

      if (filas.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
          .text('No hay datos para esta selección de filtros.', M, y);
      }

      filas.forEach((fila) => {
        ensureSpace(18);
        drawRow(columnas.map((c) => formatearValor(fila[c.key], c.formato)));
      });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="reporte_${fuente}.pdf"`);
    res.send(buffer);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    logger.error('reportesEjecutivosController.exportarPdf', err);
    res.status(500).json({ success: false, message: 'Error al exportar PDF' });
  }
}

// ── Plantillas guardadas ─────────────────────────────────────────────────
async function listPlantillas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT RP.RP_ID as id, RP.RP_NOMBRE as nombre, RP.RP_DESCRIPCION as descripcion, RP.RP_FUENTE as fuente,
             RP.RP_CREADO_POR as creadoPor, U.NEUS_NOMBRES as creadoPorNombre,
             RP.RP_CREATED_AT as createdAt, RP.RP_UPDATED_AT as updatedAt
      FROM AREA_REPORTE_PLANTILLAS RP
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = RP.RP_CREADO_POR
      WHERE RP.RP_ACTIVO = 1
      ORDER BY RP.RP_CREATED_AT DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('reportesEjecutivosController.listPlantillas', err);
    res.status(500).json({ success: false, message: 'Error al obtener plantillas' });
  }
}

async function getPlantilla(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT RP_ID as id, RP_NOMBRE as nombre, RP_DESCRIPCION as descripcion, RP_FUENTE as fuente, RP_CONFIG as config FROM AREA_REPORTE_PLANTILLAS WHERE RP_ID=@id AND RP_ACTIVO=1`);
    const plantilla = rs.recordset[0];
    if (!plantilla) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    let config;
    try { config = JSON.parse(plantilla.config); } catch (_) { config = null; }
    res.json({ success: true, data: { id: plantilla.id, nombre: plantilla.nombre, descripcion: plantilla.descripcion, fuente: plantilla.fuente, config } });
  } catch (err) {
    logger.error('reportesEjecutivosController.getPlantilla', err);
    res.status(500).json({ success: false, message: 'Error al obtener plantilla' });
  }
}

function validarYSerializarConfig(body) {
  const { nombre, fuente, metricas, dimensiones, filtros, agruparPor } = body || {};
  if (!nombre || !nombre.trim()) return { error: 'Nombre requerido' };
  const errorValidacion = validarSeleccion(fuente, metricas, dimensiones, agruparPor);
  if (errorValidacion) return { error: errorValidacion };
  const config = JSON.stringify({ metricas, dimensiones: dimensiones || [], filtros: filtros || {}, agruparPor: agruparPor || null });
  return { nombre: nombre.trim(), fuente, config };
}

async function crearPlantilla(req, res) {
  try {
    const parsed = validarYSerializarConfig(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const { descripcion } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar, parsed.nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('fuente', sql.NVarChar, parsed.fuente)
      .input('config', sql.NVarChar, parsed.config)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO AREA_REPORTE_PLANTILLAS (RP_NOMBRE, RP_DESCRIPCION, RP_FUENTE, RP_CONFIG, RP_CREADO_POR)
        OUTPUT INSERTED.RP_ID as id
        VALUES (@nombre, @descripcion, @fuente, @config, @creadoPor);
      `);
    const id = rs.recordset[0].id;
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'crear-plantilla',
      entidadId: id, detalle: { nombre: parsed.nombre, fuente: parsed.fuente }, ip: req.ip,
    });
    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('reportesEjecutivosController.crearPlantilla', err);
    res.status(500).json({ success: false, message: 'Error al guardar plantilla' });
  }
}

async function actualizarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const parsed = validarYSerializarConfig(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const { descripcion } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, parsed.nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('fuente', sql.NVarChar, parsed.fuente)
      .input('config', sql.NVarChar, parsed.config)
      .query(`
        UPDATE AREA_REPORTE_PLANTILLAS
        SET RP_NOMBRE=@nombre, RP_DESCRIPCION=@descripcion, RP_FUENTE=@fuente, RP_CONFIG=@config, RP_UPDATED_AT=GETDATE()
        WHERE RP_ID=@id
      `);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'actualizar-plantilla',
      entidadId: id, detalle: { nombre: parsed.nombre }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('reportesEjecutivosController.actualizarPlantilla', err);
    res.status(500).json({ success: false, message: 'Error al actualizar plantilla' });
  }
}

async function eliminarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE AREA_REPORTE_PLANTILLAS SET RP_ACTIVO=0, RP_UPDATED_AT=GETDATE() WHERE RP_ID=@id`);
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: MODULO_AUDIT, accion: 'eliminar-plantilla',
      entidadId: id, detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('reportesEjecutivosController.eliminarPlantilla', err);
    res.status(500).json({ success: false, message: 'Error al eliminar plantilla' });
  }
}

async function ejecutarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT RP_FUENTE as fuente, RP_CONFIG as config FROM AREA_REPORTE_PLANTILLAS WHERE RP_ID=@id AND RP_ACTIVO=1`);
    const plantilla = rs.recordset[0];
    if (!plantilla) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });

    let config;
    try { config = JSON.parse(plantilla.config); } catch (_) {
      return res.status(500).json({ success: false, message: 'Configuración de plantilla inválida' });
    }
    const { metricas, dimensiones, filtros, agruparPor } = config;
    const filtrosFinal = { ...(filtros || {}), ...(req.body?.filtrosOverride || {}) };

    const errorValidacion = validarSeleccion(plantilla.fuente, metricas, dimensiones, agruparPor);
    if (errorValidacion) return res.status(400).json({ success: false, message: errorValidacion });

    const { sqlText, request, columnas } = construirQuery(pool, plantilla.fuente, metricas, dimensiones, filtrosFinal);
    const execRs = await request.query(sqlText);

    res.json({
      success: true,
      data: { columnas, filas: execRs.recordset, totalFilas: execRs.recordset.length, generadoAt: new Date().toISOString() },
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    logger.error('reportesEjecutivosController.ejecutarPlantilla', err);
    res.status(500).json({ success: false, message: 'Error al ejecutar plantilla' });
  }
}

module.exports = {
  getCatalogo,
  getOpcionesFiltro,
  ejecutarReporte,
  exportarPdf,
  listPlantillas,
  getPlantilla,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  ejecutarPlantilla,
};
