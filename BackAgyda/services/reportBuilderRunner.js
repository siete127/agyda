/**
 * Compilador + ejecutor del Constructor de Reportes.
 *
 * Recibe una definición del cliente (SOLO ids + valores, nunca SQL) y arma una
 * consulta agregada segura usando exclusivamente las expresiones declaradas en
 * reportBuilderCatalog.js. Todos los valores van parametrizados con mssql.
 *
 * Definición esperada:
 * {
 *   origen: 'interacciones',
 *   dimensiones: ['fecha', 'agente'],        // GROUP BY + SELECT (opcional; sin dimensiones = una fila de totales)
 *   metricas: ['total', 'tmo_seg'],          // agregaciones (al menos 1)
 *   filtros: [
 *     { id: 'fecha', desde: '2026-01-01', hasta: '2026-01-31' },
 *     { id: 'campania', valores: [3, 7] },
 *     { id: 'estado', valores: ['cerrada'] },
 *   ],
 *   orden: { campo: 'total', dir: 'desc' },   // campo ∈ dimensiones ∪ metricas
 *   limite: 500,                              // 1..5000
 * }
 */

const { ORIGENES, CATALOGOS_FILTRO } = require('./reportBuilderCatalog');
const sql = require('mssql');

const LIMITE_MAX = 5000;
const LIMITE_DEFAULT = 1000;

function _err(msg) {
  const e = new Error(msg);
  e.code = 'REPORT_BUILDER_INVALID';
  return e;
}

function _hoy() {
  return new Date().toISOString().slice(0, 10);
}
function _hace30() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function compilar(def) {
  if (!def || typeof def !== 'object') throw _err('Definición de reporte inválida');

  const origen = ORIGENES[def.origen];
  if (!origen) throw _err(`Origen de datos desconocido: ${def.origen}`);

  const dims = Array.isArray(def.dimensiones) ? def.dimensiones : [];
  const mets = Array.isArray(def.metricas) ? def.metricas : [];
  const filtros = Array.isArray(def.filtros) ? def.filtros : [];

  for (const d of dims) if (!origen.dimensiones[d]) throw _err(`Dimensión no válida para "${def.origen}": ${d}`);
  if (mets.length === 0) throw _err('Selecciona al menos una métrica');
  for (const m of mets) if (!origen.metricas[m]) throw _err(`Métrica no válida para "${def.origen}": ${m}`);

  const params = [];
  const bind = (tipo, valor) => {
    const nombre = `p${params.length}`;
    params.push({ nombre, tipo, valor });
    return `@${nombre}`;
  };

  // ── SELECT ──
  const selectParts = [];
  const groupParts = [];
  for (const d of dims) {
    const def2 = origen.dimensiones[d];
    selectParts.push(`${def2.expr} AS [${d}]`);
    groupParts.push(def2.expr);
  }
  for (const m of mets) {
    selectParts.push(`${origen.metricas[m].expr} AS [${m}]`);
  }

  // ── WHERE ──
  const whereParts = [];
  const filtrosVistos = new Set();
  for (const f of filtros) {
    const fdef = origen.filtros[f.id];
    if (!fdef) throw _err(`Filtro no válido para "${def.origen}": ${f.id}`);
    if (filtrosVistos.has(f.id)) continue;
    filtrosVistos.add(f.id);

    if (fdef.tipo === 'fecha_rango') {
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(f.desde || '') ? f.desde : _hace30();
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(f.hasta || '') ? f.hasta : _hoy();
      whereParts.push(`${fdef.col} >= ${bind(sql.Date, desde)} AND ${fdef.col} < DATEADD(DAY, 1, ${bind(sql.Date, hasta)})`);
    } else if (fdef.tipo === 'texto') {
      const v = (f.valor ?? '').toString().trim();
      if (v) whereParts.push(`${fdef.col} LIKE ${bind(sql.NVarChar, `%${v}%`)}`);
    } else if (fdef.tipo === 'id') {
      const v = parseInt(f.valor, 10);
      if (Number.isInteger(v)) whereParts.push(`${fdef.col} = ${bind(sql.Int, v)}`);
    } else if (fdef.tipo === 'id_lista') {
      const vals = (Array.isArray(f.valores) ? f.valores : [])
        .map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x));
      if (vals.length) whereParts.push(`${fdef.col} IN (${vals.map((v) => bind(sql.Int, v)).join(', ')})`);
    } else if (fdef.tipo === 'enum') {
      const permitidos = new Set(fdef.valores || []);
      const vals = (Array.isArray(f.valores) ? f.valores : [])
        .map((x) => String(x)).filter((x) => permitidos.has(x));
      if (vals.length) whereParts.push(`${fdef.col} IN (${vals.map((v) => bind(sql.NVarChar, v)).join(', ')})`);
    }
  }

  // Si no se mandó filtro de fecha pero el origen tiene uno por defecto, aplicarlo (últimos 30 días)
  const filtroFechaDefecto = Object.entries(origen.filtros).find(([, f]) => f.tipo === 'fecha_rango' && f.porDefecto);
  if (filtroFechaDefecto && !filtrosVistos.has(filtroFechaDefecto[0])) {
    const col = filtroFechaDefecto[1].col;
    whereParts.push(`${col} >= ${bind(sql.Date, _hace30())} AND ${col} < DATEADD(DAY, 1, ${bind(sql.Date, _hoy())})`);
  }

  // ── ORDER BY ──
  let orden = def.orden && typeof def.orden === 'object' ? def.orden : null;
  let ordenCampo = orden?.campo;
  const dir = orden?.dir === 'asc' ? 'ASC' : 'DESC';
  const campoValido = ordenCampo && (dims.includes(ordenCampo) || mets.includes(ordenCampo));
  if (!campoValido) {
    ordenCampo = mets[0]; // por defecto, la primera métrica desc
  }

  // ── LÍMITE ──
  let limite = parseInt(def.limite, 10);
  if (!Number.isInteger(limite) || limite < 1) limite = LIMITE_DEFAULT;
  if (limite > LIMITE_MAX) limite = LIMITE_MAX;

  const sqlText = `
    SELECT TOP (${limite})
      ${selectParts.join(',\n      ')}
    FROM ${origen.from}
    ${whereParts.length ? 'WHERE ' + whereParts.join('\n      AND ') : ''}
    ${groupParts.length ? 'GROUP BY ' + groupParts.join(', ') : ''}
    ORDER BY [${ordenCampo}] ${dir}
  `.trim();

  // Metadata de columnas para el front (label + formato)
  const columnas = [
    ...dims.map((d) => ({ id: d, label: origen.dimensiones[d].label, tipo: origen.dimensiones[d].tipo || 'texto', esDimension: true })),
    ...mets.map((m) => ({ id: m, label: origen.metricas[m].label, formato: origen.metricas[m].formato, esDimension: false })),
  ];

  return { sqlText, params, columnas, limite, orden: { campo: ordenCampo, dir: dir.toLowerCase() } };
}

async function ejecutar(pool, def) {
  const { sqlText, params, columnas, limite, orden } = compilar(def);
  const req = pool.request();
  for (const p of params) req.input(p.nombre, p.tipo, p.valor);
  const rs = await req.query(sqlText);

  // Fila de totales (solo métricas numéricas sumables)
  const totales = {};
  for (const c of columnas) {
    if (c.esDimension) continue;
    if (c.formato === 'entero' || c.formato === 'minutos') {
      totales[c.id] = rs.recordset.reduce((a, r) => a + (Number(r[c.id]) || 0), 0);
    }
  }

  return {
    columnas,
    filas: rs.recordset,
    totales,
    meta: { limite, orden, filasDevueltas: rs.recordset.length, truncado: rs.recordset.length >= limite },
    sql: process.env.NODE_ENV !== 'production' ? sqlText : undefined,
  };
}

async function catalogoFiltro(pool, catalogoId) {
  const query = CATALOGOS_FILTRO[catalogoId];
  if (!query) throw _err(`Catálogo de filtro desconocido: ${catalogoId}`);
  const rs = await pool.request().query(query);
  return rs.recordset;
}

module.exports = { compilar, ejecutar, catalogoFiltro, LIMITE_MAX };
