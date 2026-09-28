const fs = require('fs');
const path = require('path');
const sql = require('mssql');

// Suite de reportes: ejecuta un RDL dentro de AGYDA (sin servidor SSRS).
//
// Corre la consulta del dataset (procedimiento almacenado o SELECT) contra la
// base de la empresa, con los parámetros del reporte, SIEMPRE dentro de una
// transacción que se revierte al final: un reporte solo lee, nunca guarda.
//
// Del .rdl original se leen dos cosas que la vista previa no guardaba: cómo
// pasa cada dataset sus parámetros (QueryParameters, p. ej.
// =Join(Parameters!Tipificacion.Value,"|")) y de dónde salen las opciones de
// cada parámetro (ValidValues). Si el archivo no está: parámetro del mismo
// nombre, y un multivalor se une con el separador del STRING_SPLIT del
// procedimiento (o con comas, como SSRS).

const MAX_FILAS = 20000;
const TIMEOUT_MS = 120000;

const decodificar = (s) => String(s ?? '')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Lee del XML los QueryParameters de cada dataset y los ValidValues de cada parámetro.
function extrasDeXml(xml) {
  const dataSets = {};
  for (const m of xml.matchAll(/<DataSet\s+Name="([^"]+)"\s*>([\s\S]*?)<\/DataSet>/g)) {
    const qp = [];
    for (const p of m[2].matchAll(/<QueryParameter\s+Name="([^"]+)"\s*>\s*<Value>([\s\S]*?)<\/Value>/g)) {
      qp.push({ name: decodificar(p[1]), value: decodificar(p[2]).trim() });
    }
    dataSets[decodificar(m[1])] = { queryParameters: qp };
  }
  const parametros = {};
  for (const m of xml.matchAll(/<ReportParameter\s+Name="([^"]+)"\s*>([\s\S]*?)<\/ReportParameter>/g)) {
    const cuerpo = m[2];
    const vv = cuerpo.match(/<ValidValues>([\s\S]*?)<\/ValidValues>/);
    let validValues = null;
    if (vv) {
      const ref = vv[1].match(/<DataSetName>([^<]+)<\/DataSetName>\s*<ValueField>([^<]+)<\/ValueField>(?:\s*<LabelField>([^<]+)<\/LabelField>)?/);
      if (ref) validValues = { dataSetName: decodificar(ref[1]), valueField: decodificar(ref[2]), labelField: ref[3] ? decodificar(ref[3]) : null };
      else {
        const lista = [...vv[1].matchAll(/<ParameterValue>\s*<Value>([\s\S]*?)<\/Value>(?:\s*<Label>([\s\S]*?)<\/Label>)?/g)]
          .map((x) => ({ value: decodificar(x[1]), label: decodificar(x[2] ?? x[1]) }));
        if (lista.length) validValues = { lista };
      }
    }
    parametros[decodificar(m[1])] = { validValues };
  }
  return { dataSets, parametros };
}

// Extras del reporte: primero lo que ya trae la metadata (subidas nuevas), si
// no, el .rdl en disco. null si no hay de dónde.
function extrasDeReporte(metadata, rutaArchivo) {
  const tieneMeta = (metadata?.dataSets || []).some((d) => Array.isArray(d.queryParameters))
    || (metadata?.parameters || []).some((p) => p.validValues !== undefined);
  if (tieneMeta) {
    return {
      dataSets: Object.fromEntries((metadata.dataSets || []).map((d) => [d.name, { queryParameters: d.queryParameters || [] }])),
      parametros: Object.fromEntries((metadata.parameters || []).map((p) => [p.name, { validValues: p.validValues || null }])),
    };
  }
  try {
    if (rutaArchivo && fs.existsSync(rutaArchivo)) return extrasDeXml(fs.readFileSync(rutaArchivo, 'utf8'));
  } catch (_) { /* sin archivo: reglas por defecto */ }
  return null;
}

// Opciones de un parámetro sin ValidValues declarados: si hay un dataset
// "suelto" (no alimenta ninguna tabla) de un solo campo, es su lista.
function datasetDeOpcionesPorDefecto(metadata, param) {
  if (!param.multiValue && param.dataType !== 'String') return null;
  const usados = new Set((metadata.dataRegions || []).map((r) => r.dataSetName));
  const sueltos = (metadata.dataSets || []).filter((d) => !usados.has(d.name) && (d.fields || []).length === 1);
  return sueltos.length === 1 ? { dataSetName: sueltos[0].name, valueField: sueltos[0].fields[0].name, labelField: null } : null;
}

// Valor de un parámetro del reporte tal como llega del navegador → valor para SQL.
function valorDeParametro(param, crudo) {
  const vacio = (v) => v === undefined || v === null || String(v).trim() === '';
  if (param?.multiValue) {
    const lista = (Array.isArray(crudo) ? crudo : vacio(crudo) ? [] : [crudo]).filter((v) => !vacio(v)).map(String);
    return lista;
  }
  const v = Array.isArray(crudo) ? crudo[0] : crudo;
  return vacio(v) ? null : String(v);
}

// Evalúa la expresión de un QueryParameter (solo las formas comunes de SSRS).
function evaluarExpresion(expr, valores) {
  const e = String(expr || '').trim();
  if (!e.startsWith('=')) return { valor: e };
  const join = e.match(/^=\s*Join\(\s*Parameters!(\w+)\.Value\s*,\s*"([^"]*)"\s*\)$/i);
  if (join) {
    const v = valores[join[1]];
    return { valor: Array.isArray(v) ? (v.length ? v.join(join[2]) : null) : v };
  }
  const simple = e.match(/^=\s*Parameters!(\w+)\.Value(?:\(\s*(\d+)\s*\))?$/i);
  if (simple) {
    const v = valores[simple[1]];
    if (simple[2] != null) return { valor: Array.isArray(v) ? (v[Number(simple[2])] ?? null) : v };
    // Multivalor directo a SQL: SSRS lo manda separado por comas.
    return { valor: Array.isArray(v) ? (v.length ? v.join(',') : null) : v };
  }
  return { error: `Expresión no soportada: ${e}` };
}

const TIPOS_SQL = {
  date: () => sql.Date, datetime: () => sql.DateTime, datetime2: () => sql.DateTime2, smalldatetime: () => sql.SmallDateTime,
  int: () => sql.Int, bigint: () => sql.BigInt, smallint: () => sql.SmallInt, tinyint: () => sql.TinyInt, bit: () => sql.Bit,
  decimal: () => sql.Decimal(18, 4), numeric: () => sql.Numeric(18, 4), float: () => sql.Float, money: () => sql.Money,
  nvarchar: () => sql.NVarChar(sql.MAX), varchar: () => sql.VarChar(sql.MAX), nchar: () => sql.NVarChar(sql.MAX), char: () => sql.VarChar(sql.MAX),
};
function convertir(tipo, v) {
  if (v === null || v === undefined) return null;
  if (['date', 'datetime', 'datetime2', 'smalldatetime'].includes(tipo)) {
    const s = String(v);
    // "2026-09-28" como fecha local, sin corrimiento por zona horaria.
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'money'].includes(tipo)) {
    const n = Number(v); return Number.isFinite(n) ? n : null;
  }
  if (tipo === 'bit') return v === true || v === 'true' || v === '1' || v === 1;
  return String(v);
}

// Solo lectura para consultas de texto: debe empezar con SELECT o WITH.
function esSoloLectura(texto) {
  const limpio = String(texto || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim().replace(/^;+/, '').trim();
  return /^(SELECT|WITH)\b/i.test(limpio);
}

// Corre un dataset y devuelve { columnas, filas, truncado, avisos }.
async function ejecutarDataSet(pool, metadata, extras, dsNombre, valoresCrudos) {
  const ds = (metadata.dataSets || []).find((d) => d.name === dsNombre);
  if (!ds) throw Object.assign(new Error(`El dataset "${dsNombre}" no existe en el reporte`), { status: 400 });
  const texto = String(ds.commandText || '').trim();
  if (!texto) throw Object.assign(new Error(`El dataset "${dsNombre}" no tiene consulta`), { status: 400 });

  const params = metadata.parameters || [];
  const valores = Object.fromEntries(params.map((p) => [p.name, valorDeParametro(p, valoresCrudos?.[p.name])]));
  const qps = extras?.dataSets?.[dsNombre]?.queryParameters || null;
  const avisos = [];
  // Separador de un multivalor sin QueryParameter: el que usa el procedimiento
  // en STRING_SPLIT(@param, 'x'); si no, coma (como SSRS).
  let definicionSp = '';
  const separador = (limpio) => {
    const m = definicionSp.match(new RegExp(`STRING_SPLIT\\s*\\(\\s*@${limpio}\\s*,\\s*N?'([^']+)'`, 'i'));
    return m ? m[1] : ',';
  };
  // Valor para el parámetro SQL @nombre.
  const valorPara = (nombreSql) => {
    const limpio = nombreSql.replace(/^@/, '');
    const qp = qps?.find((x) => x.name.replace(/^@/, '').toLowerCase() === limpio.toLowerCase());
    if (qp) {
      const r = evaluarExpresion(qp.value, valores);
      if (r.error) { avisos.push(r.error); return null; }
      return r.valor;
    }
    const p = params.find((x) => x.name.toLowerCase() === limpio.toLowerCase());
    if (!p) return undefined;
    const v = valores[p.name];
    return Array.isArray(v) ? (v.length ? v.join(separador(limpio)) : null) : v;
  };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const rq = new sql.Request(tx);
    rq.timeout = TIMEOUT_MS;
    let rs;
    if (String(ds.commandType || '').toLowerCase() === 'storedprocedure') {
      if (!/^[\w.[\]]+$/.test(texto)) throw Object.assign(new Error('Nombre de procedimiento no válido'), { status: 400 });
      const spParams = (await new sql.Request(tx).input('sp', sql.NVarChar(400), texto).query(`
        SELECT p.name, TYPE_NAME(p.user_type_id) tipo FROM sys.parameters p
        WHERE p.object_id = OBJECT_ID(@sp) AND p.is_output = 0 ORDER BY p.parameter_id`)).recordset;
      if (!qps) {
        definicionSp = (await new sql.Request(tx).input('sp', sql.NVarChar(400), texto)
          .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@sp)) d')).recordset[0]?.d || '';
      }
      for (const sp of spParams) {
        const v = valorPara(sp.name);
        if (v === undefined) continue; // que tome su valor por defecto
        const tipo = String(sp.tipo || '').toLowerCase();
        rq.input(sp.name.replace(/^@/, ''), (TIPOS_SQL[tipo] || TIPOS_SQL.nvarchar)(), convertir(tipo, v));
      }
      rs = await rq.execute(texto);
    } else {
      if (!esSoloLectura(texto)) throw Object.assign(new Error('Solo se ejecutan consultas de lectura (SELECT)'), { status: 400 });
      const usados = [...new Set([...texto.matchAll(/(?<!@)@(\w+)/g)].map((m) => m[1]))];
      for (const n of usados) {
        const v = valorPara(n);
        if (v === undefined) continue;
        rq.input(n, sql.NVarChar(sql.MAX), v === null ? null : String(v));
      }
      rs = await rq.query(texto);
    }
    const filas = rs.recordset || [];
    const columnas = filas.columns ? Object.keys(filas.columns) : (filas[0] ? Object.keys(filas[0]) : (ds.fields || []).map((f) => f.dataField || f.name));
    return { columnas, filas: filas.slice(0, MAX_FILAS), total: filas.length, truncado: filas.length > MAX_FILAS, avisos };
  } finally {
    // Un reporte nunca guarda nada.
    await tx.rollback().catch(() => {});
  }
}

// Opciones de cada parámetro (listas fijas o salidas de un dataset).
async function opcionesDeParametros(pool, metadata, extras) {
  const out = {};
  for (const p of metadata.parameters || []) {
    const vv = extras?.parametros?.[p.name]?.validValues ?? (extras ? null : datasetDeOpcionesPorDefecto(metadata, p));
    if (!vv) continue;
    if (vv.lista) { out[p.name] = vv.lista; continue; }
    try {
      const r = await ejecutarDataSet(pool, metadata, extras, vv.dataSetName, {});
      const valor = r.columnas.find((c) => c.toLowerCase() === String(vv.valueField).toLowerCase()) || r.columnas[0];
      const etiqueta = r.columnas.find((c) => c.toLowerCase() === String(vv.labelField || vv.valueField).toLowerCase()) || valor;
      out[p.name] = r.filas.map((f) => ({ value: f[valor] == null ? '' : String(f[valor]), label: f[etiqueta] == null ? '' : String(f[etiqueta]) }));
    } catch (e) {
      out[p.name] = { error: e.message };
    }
  }
  return out;
}

const rutaDe = (dir, archivo) => (archivo ? path.join(dir, path.basename(archivo)) : null);

module.exports = { extrasDeXml, extrasDeReporte, ejecutarDataSet, opcionesDeParametros, esSoloLectura, rutaDe, MAX_FILAS };
