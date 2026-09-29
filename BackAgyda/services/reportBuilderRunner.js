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
 *   dimensiones: ['semana', 'agente'],       // GROUP BY + SELECT (opcional; sin dimensiones = una fila de totales)
 *   metricas: ['total', 'tmo_seg'],          // agregaciones (al menos 1)
 *   filtros: [
 *     { id: 'fecha', preset: 'mes_actual' },               // o { desde, hasta }
 *     { id: 'campania', valores: [3, 7] },
 *     { id: 'estado', valores: ['cerrada'], excluir: true }, // NOT IN
 *     { id: 'hora', desde: 9, hasta: 18 },
 *     { id: 'equipo', valores: [4] },                        // grupos de Configuración
 *   ],
 *   condiciones: [{ metrica: 'total', op: '>=', valor: 10 }], // HAVING
 *   comparar: 'periodo_anterior' | 'anio_anterior',           // opcional
 *   orden: { campo: 'total', dir: 'desc' },   // campo ∈ dimensiones ∪ metricas
 *   limite: 500,                              // 1..5000
 *   visual: { ... }                           // solo lo usa el front (tipo de gráfica)
 * }
 *
 * Alcance (lo calcula el servidor, nunca el cliente): { grupoIds: [..] } limita
 * el reporte a lo que pertenece a esos grupos (supervisor); null = sin límite.
 */

const { ORIGENES, CATALOGOS_FILTRO } = require('./reportBuilderCatalog');
const sql = require('mssql');

const LIMITE_MAX = 5000;
const LIMITE_DEFAULT = 1000;

const PRESETS_FECHA = ['hoy', 'ayer', 'ult7', 'ult30', 'ult90', 'semana_actual', 'semana_pasada', 'mes_actual', 'mes_pasado', 'anio_actual'];
const OPERADORES = { '>': '>', '>=': '>=', '<': '<', '<=': '<=', '=': '=', '<>': '<>' };

function _err(msg) {
  const e = new Error(msg);
  e.code = 'REPORT_BUILDER_INVALID';
  return e;
}

// Fechas en hora local del servidor (no UTC: de noche en México el UTC ya es "mañana").
const _ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const _parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const _esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/** Convierte un preset ('mes_actual', 'ult7'…) en { desde, hasta } (ambos inclusive). */
function resolverPreset(preset, ahora = new Date()) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const lunes = _addDias(hoy, -((hoy.getDay() + 6) % 7));
  switch (preset) {
    case 'hoy': return { desde: _ymd(hoy), hasta: _ymd(hoy) };
    case 'ayer': { const a = _addDias(hoy, -1); return { desde: _ymd(a), hasta: _ymd(a) }; }
    case 'ult7': return { desde: _ymd(_addDias(hoy, -6)), hasta: _ymd(hoy) };
    case 'ult30': return { desde: _ymd(_addDias(hoy, -29)), hasta: _ymd(hoy) };
    case 'ult90': return { desde: _ymd(_addDias(hoy, -89)), hasta: _ymd(hoy) };
    case 'semana_actual': return { desde: _ymd(lunes), hasta: _ymd(hoy) };
    case 'semana_pasada': return { desde: _ymd(_addDias(lunes, -7)), hasta: _ymd(_addDias(lunes, -1)) };
    case 'mes_actual': return { desde: _ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: _ymd(hoy) };
    case 'mes_pasado': return { desde: _ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: _ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
    case 'anio_actual': return { desde: _ymd(new Date(hoy.getFullYear(), 0, 1)), hasta: _ymd(hoy) };
    default: return null;
  }
}

function _rangoDeFiltro(f) {
  const p = f && f.preset && resolverPreset(f.preset);
  if (p) return p;
  const hoy = new Date();
  return {
    desde: _esFecha(f?.desde) ? f.desde : _ymd(_addDias(hoy, -29)),
    hasta: _esFecha(f?.hasta) ? f.hasta : _ymd(hoy),
  };
}

/** Periodo con el que se compara: el inmediato anterior de igual duración, o el mismo del año pasado. */
function rangoComparacion(rango, modo) {
  const d = _parse(rango.desde);
  const h = _parse(rango.hasta);
  if (modo === 'anio_anterior') {
    const a = (x) => new Date(x.getFullYear() - 1, x.getMonth(), x.getDate());
    return { desde: _ymd(a(d)), hasta: _ymd(a(h)) };
  }
  const dias = Math.round((h - d) / 86400000) + 1;
  return { desde: _ymd(_addDias(d, -dias)), hasta: _ymd(_addDias(d, -1)) };
}

const _ints = (arr) => (Array.isArray(arr) ? arr : []).map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x));

/**
 * @param def        definición del reporte (del cliente)
 * @param opts.alcance  { grupoIds: number[] } | null — lo impone el servidor
 * @param opts.sinDimensiones  compila la fila de totales (sin GROUP BY / HAVING / TOP)
 * @param opts.rangoFecha  reemplaza el rango del filtro de fecha (comparación)
 */
function compilar(def, opts = {}) {
  if (!def || typeof def !== 'object') throw _err('Definición de reporte inválida');

  const origen = ORIGENES[def.origen];
  if (!origen) throw _err(`Origen de datos desconocido: ${def.origen}`);

  const dimsDef = Array.isArray(def.dimensiones) ? def.dimensiones : [];
  const mets = Array.isArray(def.metricas) ? def.metricas : [];
  const filtros = Array.isArray(def.filtros) ? def.filtros : [];
  const condiciones = Array.isArray(def.condiciones) ? def.condiciones : [];

  for (const d of dimsDef) if (!origen.dimensiones[d]) throw _err(`Dimensión no válida para "${def.origen}": ${d}`);
  if (mets.length === 0) throw _err('Selecciona al menos una métrica');
  for (const m of mets) if (!origen.metricas[m]) throw _err(`Métrica no válida para "${def.origen}": ${m}`);
  const dims = opts.sinDimensiones ? [] : dimsDef;

  const params = [];
  const bind = (tipo, valor) => {
    const nombre = `p${params.length}`;
    params.push({ nombre, tipo, valor });
    return `@${nombre}`;
  };

  // ── SELECT ──
  const selectParts = [];
  const groupParts = [];
  const applies = [];
  for (const d of dims) {
    const dd = origen.dimensiones[d];
    selectParts.push(`${dd.expr} AS [${d}]`);
    groupParts.push(dd.expr);
    if (dd.apply && !applies.includes(dd.apply)) applies.push(dd.apply);
  }
  for (const m of mets) {
    selectParts.push(`${origen.metricas[m].expr} AS [${m}]`);
  }

  // ── WHERE ──
  const whereParts = [];
  const filtrosVistos = new Set();
  let rango = null;
  for (const f of filtros) {
    const fdef = origen.filtros[f?.id];
    if (!fdef) throw _err(`Filtro no válido para "${def.origen}": ${f?.id}`);
    if (filtrosVistos.has(f.id)) continue;
    filtrosVistos.add(f.id);
    const excluir = f.excluir === true;

    if (fdef.tipo === 'fecha_rango') {
      const r = fdef.porDefecto && opts.rangoFecha ? opts.rangoFecha : _rangoDeFiltro(f);
      if (fdef.porDefecto) rango = r;
      whereParts.push(`${fdef.col} >= ${bind(sql.Date, r.desde)} AND ${fdef.col} < DATEADD(DAY, 1, ${bind(sql.Date, r.hasta)})`);
    } else if (fdef.tipo === 'hora_rango') {
      const desde = parseInt(f.desde, 10);
      const hasta = parseInt(f.hasta, 10);
      if (Number.isInteger(desde) && Number.isInteger(hasta) && desde >= 0 && hasta <= 23 && desde <= hasta) {
        whereParts.push(`DATEPART(HOUR, ${fdef.col}) BETWEEN ${bind(sql.Int, desde)} AND ${bind(sql.Int, hasta)}`);
      }
    } else if (fdef.tipo === 'texto') {
      const v = (f.valor ?? '').toString().trim();
      if (v) {
        const p = bind(sql.NVarChar, `%${v}%`);
        whereParts.push(excluir ? `(${fdef.col} NOT LIKE ${p} OR ${fdef.col} IS NULL)` : `${fdef.col} LIKE ${p}`);
      }
    } else if (fdef.tipo === 'id') {
      const v = parseInt(f.valor, 10);
      if (Number.isInteger(v)) whereParts.push(`${fdef.col} = ${bind(sql.Int, v)}`);
    } else if (fdef.tipo === 'id_lista') {
      const vals = _ints(f.valores);
      if (vals.length) {
        const lista = vals.map((v) => bind(sql.Int, v)).join(', ');
        whereParts.push(excluir ? `(${fdef.col} NOT IN (${lista}) OR ${fdef.col} IS NULL)` : `${fdef.col} IN (${lista})`);
      }
    } else if (fdef.tipo === 'enum') {
      // Valores fijos del catálogo, o dinámicos (p.ej. claves de STATUS que
      // cambian por empresa): esos se validan por forma y van bindeados.
      const ok = fdef.valoresDe
        ? (x) => /^[\w\-áéíóúñÁÉÍÓÚÑ ]{1,40}$/.test(x)
        : ((set) => (x) => set.has(x))(new Set(fdef.valores || []));
      const vals = (Array.isArray(f.valores) ? f.valores : []).map((x) => String(x)).filter(ok);
      if (vals.length) {
        const lista = vals.map((v) => bind(sql.NVarChar, v)).join(', ');
        whereParts.push(excluir ? `(${fdef.col} NOT IN (${lista}) OR ${fdef.col} IS NULL)` : `${fdef.col} IN (${lista})`);
      }
    } else if (fdef.tipo === 'grupo') {
      const vals = _ints(f.valores);
      if (vals.length) {
        const cond = fdef.condicion(vals.map((v) => bind(sql.Int, v)).join(', '));
        whereParts.push(excluir ? `NOT ${cond}` : cond);
      }
    }
  }

  // Si no se mandó filtro de fecha pero el origen tiene uno por defecto, aplicarlo (últimos 30 días)
  const filtroFechaDefecto = Object.entries(origen.filtros).find(([, f]) => f.tipo === 'fecha_rango' && f.porDefecto);
  if (filtroFechaDefecto && !filtrosVistos.has(filtroFechaDefecto[0])) {
    const col = filtroFechaDefecto[1].col;
    rango = opts.rangoFecha || _rangoDeFiltro(null);
    whereParts.push(`${col} >= ${bind(sql.Date, rango.desde)} AND ${col} < DATEADD(DAY, 1, ${bind(sql.Date, rango.hasta)})`);
  }

  // ── ALCANCE (supervisor: solo lo de sus grupos) ──
  if (opts.alcance && Array.isArray(opts.alcance.grupoIds)) {
    const ids = _ints(opts.alcance.grupoIds);
    if (!ids.length || !origen.liga) whereParts.push('1 = 0');
    else whereParts.push(origen.liga.condicion(ids.map((v) => bind(sql.Int, v)).join(', ')));
  }

  // ── HAVING (condiciones sobre métricas, p.ej. "agentes con más de 10") ──
  const havingParts = [];
  if (!opts.sinDimensiones) {
    for (const c of condiciones.slice(0, 5)) {
      const met = origen.metricas[c?.metrica];
      const op = OPERADORES[c?.op];
      const valor = Number(c?.valor);
      if (!met || !op || !Number.isFinite(valor)) continue;
      havingParts.push(`${met.expr} ${op} ${bind(sql.Float, valor)}`);
    }
  }

  // ── ORDER BY ──
  const orden = def.orden && typeof def.orden === 'object' ? def.orden : null;
  let ordenCampo = orden?.campo;
  let dir = orden?.dir === 'asc' ? 'ASC' : 'DESC';
  const campoValido = ordenCampo && (dims.includes(ordenCampo) || mets.includes(ordenCampo));
  if (!campoValido) {
    // Serie de tiempo → cronológico; si no, la primera métrica de mayor a menor.
    if (dims[0] && origen.dimensiones[dims[0]].tiempo) { ordenCampo = dims[0]; dir = 'ASC'; }
    else ordenCampo = mets[0];
  }

  // ── LÍMITE ──
  let limite = parseInt(def.limite, 10);
  if (!Number.isInteger(limite) || limite < 1) limite = LIMITE_DEFAULT;
  if (limite > LIMITE_MAX) limite = LIMITE_MAX;

  const sqlText = `
    SELECT ${opts.sinDimensiones ? '' : `TOP (${limite})`}
      ${selectParts.join(',\n      ')}
    FROM ${origen.from}
    ${applies.join('\n    ')}
    ${whereParts.length ? 'WHERE ' + whereParts.join('\n      AND ') : ''}
    ${groupParts.length ? 'GROUP BY ' + groupParts.join(', ') : ''}
    ${havingParts.length && groupParts.length ? 'HAVING ' + havingParts.join(' AND ') : ''}
    ${opts.sinDimensiones ? '' : `ORDER BY [${ordenCampo}] ${dir}`}
  `.trim();

  // Metadata de columnas para el front (label + formato)
  const columnas = [
    ...dims.map((d) => ({ id: d, label: origen.dimensiones[d].label, tipo: origen.dimensiones[d].tipo || 'texto', tiempo: !!origen.dimensiones[d].tiempo, esDimension: true })),
    ...mets.map((m) => ({ id: m, label: origen.metricas[m].label, formato: origen.metricas[m].formato, esDimension: false })),
  ];

  return { sqlText, params, columnas, limite, rango, orden: { campo: ordenCampo, dir: dir.toLowerCase() } };
}

async function _correr(pool, compilado) {
  const req = pool.request();
  for (const p of compilado.params) req.input(p.nombre, p.tipo, p.valor);
  const rs = await req.query(compilado.sqlText);
  return rs.recordset;
}

async function ejecutar(pool, def, opts = {}) {
  const alcance = opts.alcance || null;
  const principal = compilar(def, { alcance });
  const filas = await _correr(pool, principal);

  // Total general: la misma consulta sin agrupar. Así los promedios, % y
  // conteos distintos salen bien (no se suman filas) y no los recorta el TOP.
  let totales = {};
  const hayDims = principal.columnas.some((c) => c.esDimension);
  if (hayDims) {
    const [fila] = await _correr(pool, compilar(def, { alcance, sinDimensiones: true }));
    totales = fila || {};
  } else {
    totales = filas[0] || {};
  }

  // Comparación con el periodo anterior (solo totales).
  let comparacion = null;
  if ((def.comparar === 'periodo_anterior' || def.comparar === 'anio_anterior') && principal.rango) {
    const rango = rangoComparacion(principal.rango, def.comparar);
    const [fila] = await _correr(pool, compilar(def, { alcance, sinDimensiones: true, rangoFecha: rango }));
    comparacion = { modo: def.comparar, desde: rango.desde, hasta: rango.hasta, totales: fila || {} };
  }

  return {
    columnas: principal.columnas,
    filas,
    totales,
    comparacion,
    meta: {
      limite: principal.limite,
      orden: principal.orden,
      rango: principal.rango,
      filasDevueltas: filas.length,
      truncado: filas.length >= principal.limite,
    },
    sql: process.env.NODE_ENV !== 'production' ? principal.sqlText : undefined,
  };
}

/** Opciones de un selector de filtro. `grupoIds` (supervisor) acota a sus grupos. */
async function catalogoFiltro(pool, catalogoId, { grupoIds = null } = {}) {
  const query = CATALOGOS_FILTRO[catalogoId];
  if (!query) throw _err(`Catálogo de filtro desconocido: ${catalogoId}`);
  const ids = grupoIds ? _ints(grupoIds) : null;
  if (ids && !ids.length) return [];
  const rs = await pool.request().query(query(ids ? ids.join(', ') : null));
  return rs.recordset;
}

module.exports = { compilar, ejecutar, catalogoFiltro, resolverPreset, rangoComparacion, PRESETS_FECHA, LIMITE_MAX };
