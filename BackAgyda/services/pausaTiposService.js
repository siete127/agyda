const logger = global.logger || require('../utils/logger');

// Tipos de pausa configurables. Viven en dbo.STATUS (la misma tabla que ya
// referencia USUARIO_TIEMPOS por FK), con columnas extra de configuración:
//   ES_PAUSA            → el estado es una pausa (online/offline no lo son).
//   ES_SISTEMA          → vino por default; no se puede eliminar.
//   CONTROL_OCUPACION   → semáforo de ocupación por género (el baño, vía socket).
//   LIMITE_MIN/MODO     → minutos permitidos, 'visita' (por pausa) o 'diario' (acumulado).
//   USO_<MODULO>        → en qué módulos cuenta la pausa (ver USOS).
// Límites distintos por área (p. ej. comida 60 min para TI/AD) en STATUS_LIMITE_AREA,
// y por módulo en STATUS_LIMITE_MODULO (ver LIMITE_MODULOS).
//
// OJO: los status_id NO son fijos entre empresas. En unas BD status_id es
// TINYINT sin IDENTITY (creada por schemaService), en otras TINYINT o INT con
// IDENTITY, y no todas tienen los mismos estados (en una, el 2 es "offline").
// Por eso los tipos por default se identifican por `clave`, nunca por id.

// Módulos donde una pausa puede contar, y qué significa en cada uno.
const USOS = {
  asistencia: { columna: 'USO_ASISTENCIA', label: 'Asistencia', impacto: 'Se descuenta del tiempo disponible de la jornada.' },
  nomina: { columna: 'USO_NOMINA', label: 'Nómina', impacto: 'Cuenta para el exceso de minutos de pausa que se descuenta en nómina.' },
  contact_center: { columna: 'USO_CONTACT_CENTER', label: 'Contact Center', impacto: 'El agente deja de recibir interacciones, aparece "en pausa" al supervisor y cuenta para la alarma de pausa larga.' },
};

// Módulos que usan el límite de una pausa, y dónde se ve. Un límite propio del
// módulo reemplaza, en ese módulo, al general y a los de área. Nómina no usa
// el límite por tipo: descuenta con sus "minutos de pausa libres" diarios.
const LIMITE_MODULOS = ['asistencia', 'contact_center'];

// Los 4 tipos por default, por clave, con los valores que antes estaban
// escritos en el código. `legacy` es la llave fija que ya consume el frontend
// (banioSeg, comida, etc.) y `etiquetaLegacy` la del panel de supervisor.
const DEFAULTS = [
  { clave: 'sanitario', descripcion: 'Usuario ausente momentáneamente', etiqueta: 'Baño', emoji: '🚻', color: '#3B82F6', orden: 1,
    limite: 20, modo: 'diario', ocupacion: true, legacy: 'banio', etiquetaLegacy: 'baño' },
  { clave: 'comida', descripcion: 'Usuario en horario de comida', etiqueta: 'Comida', emoji: '🍽️', color: '#F97316', orden: 2,
    limite: 40, modo: 'visita', limitesArea: { TI: 60, AD: 60 }, legacy: 'comida', etiquetaLegacy: 'comida' },
  { clave: 'capacitacion', descripcion: 'Usuario en capacitación', etiqueta: 'Capacitación', emoji: '📚', color: '#8B5CF6', orden: 3,
    legacy: 'capacitacion', etiquetaLegacy: 'capacitación' },
  { clave: 'permiso', descripcion: 'Usuario con permiso', etiqueta: 'Permiso', emoji: '✋', color: '#10B981', orden: 4,
    legacy: 'permiso', etiquetaLegacy: 'permiso' },
];
const POR_CLAVE = Object.fromEntries(DEFAULTS.map((d) => [d.clave, d]));

// Subconsulta con los status_id que son pausa (opcionalmente solo los que
// cuentan en un módulo). Para WHERE / EXISTS — SQL Server no admite
// subconsultas dentro de SUM/CASE: ahí se une STATUS y se usa s.ES_PAUSA.
function sqlPausas(uso) {
  const col = uso && USOS[uso] ? ` AND ${USOS[uso].columna} = 1` : '';
  return `(SELECT status_id FROM dbo.STATUS WHERE ES_PAUSA = 1${col})`;
}

function mapTipo(r, limites, limitesMod) {
  const limitesArea = {};
  for (const l of limites) if (l.STATUS_ID === r.status_id) limitesArea[l.AREA] = l.LIMITE_MIN;
  const limitesModulo = {};
  for (const l of limitesMod) if (l.STATUS_ID === r.status_id) limitesModulo[l.MODULO] = l.LIMITE_MIN;
  return {
    statusId: r.status_id,
    clave: r.clave,
    etiqueta: r.ETIQUETA || r.descripcion || r.clave,
    emoji: r.EMOJI || '⏸️',
    color: r.COLOR || '#6B7280',
    orden: r.ORDEN ?? 0,
    activo: !!r.ACTIVO,
    esSistema: !!r.ES_SISTEMA,
    controlOcupacion: !!r.CONTROL_OCUPACION,
    limiteMin: r.LIMITE_MIN ?? null,
    limiteModo: r.LIMITE_MIN ? (r.LIMITE_MODO === 'diario' ? 'diario' : 'visita') : null,
    limitesArea,
    limitesModulo,
    usos: {
      asistencia: !!r.USO_ASISTENCIA,
      nomina: !!r.USO_NOMINA,
      contact_center: !!r.USO_CONTACT_CENTER,
    },
  };
}

// Todos los tipos de pausa (activos e inactivos — los inactivos ya no se
// pueden iniciar, pero sus registros históricos se siguen reportando).
async function listar(pool) {
  const r = await pool.request().query(`
    SELECT status_id, clave, descripcion, ETIQUETA, EMOJI, COLOR, ORDEN, ACTIVO, ES_SISTEMA,
           CONTROL_OCUPACION, LIMITE_MIN, LIMITE_MODO, USO_ASISTENCIA, USO_NOMINA, USO_CONTACT_CENTER
    FROM dbo.STATUS WHERE ES_PAUSA = 1 ORDER BY ORDEN, status_id;
    SELECT STATUS_ID, AREA, LIMITE_MIN FROM dbo.STATUS_LIMITE_AREA;
    SELECT STATUS_ID, MODULO, LIMITE_MIN FROM dbo.STATUS_LIMITE_MODULO;
  `);
  const [tipos, limites, limitesMod] = r.recordsets;
  return tipos.map((t) => mapTipo(t, limites, limitesMod));
}

// Etiqueta de un tipo para el panel de supervisor/asesores (los 4 por default
// conservan la etiqueta que ya conoce el frontend).
function etiquetaPausa(tipos, statusId) {
  const t = tipos.find((x) => x.statusId === statusId);
  if (!t) return 'pausa';
  return POR_CLAVE[t.clave]?.etiquetaLegacy ?? t.etiqueta;
}

// Llave fija ('banio' | 'comida' | 'capacitacion' | 'permiso') de un tipo por
// default, o null si es un tipo agregado por la empresa.
function llaveLegacy(tipos, statusId) {
  const t = tipos.find((x) => x.statusId === statusId);
  return (t && POR_CLAVE[t.clave]?.legacy) || null;
}

// Valores de los 4 tipos por default con su llave fija, a partir de un mapa
// { statusId: valor } — para los campos de compatibilidad (banioSeg, comida…).
function legado(tipos, mapa) {
  const out = { banio: 0, comida: 0, capacitacion: 0, permiso: 0 };
  for (const t of tipos) {
    const k = POR_CLAVE[t.clave]?.legacy;
    if (k) out[k] = mapa[t.statusId] ?? 0;
  }
  return out;
}

// Campos de compatibilidad que ya consume el frontend (tarjetas de tiempos,
// pausas por meta) — en segundos.
function camposSeg(tipos, mapa) {
  const l = legado(tipos, mapa);
  return { comidaSeg: l.comida, banioSeg: l.banio, capacitacionSeg: l.capacitacion, permisoSeg: l.permiso };
}

// Ídem para el Resumen General — en minutos.
function camposMin(tipos, mapa) {
  const l = legado(tipos, mapa);
  return { pausaBanioMin: l.banio, pausaComidaMin: l.comida, pausaCapacitacionMin: l.capacitacion, pausaPermisoMin: l.permiso };
}

// Mapa { statusId: 0 } con todos los tipos — base para acumular segundos/minutos.
function mapaEnCero(tipos) {
  const out = {};
  for (const t of tipos) out[t.statusId] = 0;
  return out;
}

// Desglose por tipo a partir de un mapa { statusId: valor }, y el total de los
// tipos que cuentan en `uso` (o de todos si no se indica).
function desglose(tipos, mapa, uso) {
  const porTipo = tipos.map((t) => ({
    statusId: t.statusId, etiqueta: t.etiqueta, emoji: t.emoji, color: t.color, valor: mapa[t.statusId] ?? 0,
  }));
  const total = tipos
    .filter((t) => !uso || t.usos[uso])
    .reduce((s, t) => s + (mapa[t.statusId] ?? 0), 0);
  return { porTipo, total };
}

// status_id del tipo con semáforo de ocupación (el baño), o null si no hay.
async function idBanio(pool) {
  const r = await pool.request().query(`
    SELECT TOP 1 status_id FROM dbo.STATUS
    WHERE (ES_PAUSA = 1 AND CONTROL_OCUPACION = 1) OR clave = 'sanitario'
    ORDER BY CONTROL_OCUPACION DESC, status_id`);
  return r.recordset[0]?.status_id ?? null;
}

// Cómo es status_id en esta BD: si es IDENTITY y su tipo (tinyint, int…).
const TIPOS_ID = new Set(['tinyint', 'smallint', 'int', 'bigint']);
async function metaStatusId(pool) {
  const r = await pool.request().query(`
    SELECT COLUMNPROPERTY(OBJECT_ID('dbo.STATUS'), 'status_id', 'IsIdentity') AS ident, DATA_TYPE AS tipo
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'STATUS' AND COLUMN_NAME = 'status_id'`);
  const row = r.recordset[0] || {};
  const tipo = String(row.tipo || 'tinyint').toLowerCase();
  return { identity: row.ident === 1, tipo: TIPOS_ID.has(tipo) ? tipo : 'int', max: tipo === 'tinyint' ? 255 : tipo === 'smallint' ? 32767 : 2147483647 };
}

// Texto SQL seguro (comillas simples escapadas) para las constantes de DEFAULTS.
const q = (s) => String(s).replace(/'/g, "''");

async function ensureSchema(pool) {
  try {
    const col = (nombre, def) =>
      `IF COL_LENGTH('dbo.STATUS', '${nombre}') IS NULL ALTER TABLE dbo.STATUS ADD ${nombre} ${def};`;
    // 1) Columnas (lote propio: un UPDATE en el mismo lote no las vería).
    await pool.request().batch([
      col('ETIQUETA', 'NVARCHAR(60) NULL'),
      col('EMOJI', 'NVARCHAR(16) NULL'),
      col('COLOR', 'VARCHAR(9) NULL'),
      col('ORDEN', 'INT NOT NULL CONSTRAINT DF_STATUS_ORDEN DEFAULT 0'),
      col('ES_PAUSA', 'BIT NOT NULL CONSTRAINT DF_STATUS_ES_PAUSA DEFAULT 0'),
      col('ACTIVO', 'BIT NOT NULL CONSTRAINT DF_STATUS_ACTIVO DEFAULT 1'),
      col('ES_SISTEMA', 'BIT NOT NULL CONSTRAINT DF_STATUS_ES_SISTEMA DEFAULT 0'),
      col('CONTROL_OCUPACION', 'BIT NOT NULL CONSTRAINT DF_STATUS_CONTROL_OCUPACION DEFAULT 0'),
      col('LIMITE_MIN', 'INT NULL'),
      col('LIMITE_MODO', 'VARCHAR(10) NULL'),
      col('USO_ASISTENCIA', 'BIT NOT NULL CONSTRAINT DF_STATUS_USO_ASISTENCIA DEFAULT 1'),
      col('USO_NOMINA', 'BIT NOT NULL CONSTRAINT DF_STATUS_USO_NOMINA DEFAULT 1'),
      col('USO_CONTACT_CENTER', 'BIT NOT NULL CONSTRAINT DF_STATUS_USO_CONTACT_CENTER DEFAULT 1'),
    ].join('\n'));

    // 2) Tablas de límites. STATUS_ID con el mismo tipo que STATUS.status_id
    //    de ESTA BD (una FK exige tipos idénticos).
    const meta = await metaStatusId(pool);
    await pool.request().batch(`
IF OBJECT_ID('dbo.STATUS_LIMITE_AREA', 'U') IS NULL
  CREATE TABLE dbo.STATUS_LIMITE_AREA (
    STATUS_ID  ${meta.tipo.toUpperCase()} NOT NULL,
    AREA       VARCHAR(20) NOT NULL,
    LIMITE_MIN INT         NOT NULL,
    CONSTRAINT PK_STATUS_LIMITE_AREA PRIMARY KEY (STATUS_ID, AREA),
    CONSTRAINT FK_STATUS_LIMITE_AREA FOREIGN KEY (STATUS_ID) REFERENCES dbo.STATUS(status_id) ON DELETE CASCADE
  );
IF OBJECT_ID('dbo.STATUS_LIMITE_MODULO', 'U') IS NULL
  CREATE TABLE dbo.STATUS_LIMITE_MODULO (
    STATUS_ID  ${meta.tipo.toUpperCase()} NOT NULL,
    MODULO     VARCHAR(20) NOT NULL, -- 'asistencia' | 'contact_center'
    LIMITE_MIN INT         NOT NULL,
    CONSTRAINT PK_STATUS_LIMITE_MODULO PRIMARY KEY (STATUS_ID, MODULO),
    CONSTRAINT FK_STATUS_LIMITE_MODULO FOREIGN KEY (STATUS_ID) REFERENCES dbo.STATUS(status_id) ON DELETE CASCADE
  );
`);

    // 3) Los 4 tipos por default, por clave: si falta la fila se crea
    //    (respetando si status_id es IDENTITY o no), y se configura solo una
    //    vez (ETIQUETA IS NULL) para no pisar lo que la empresa cambie después.
    const insertar = (d) => (meta.identity
      ? `INSERT INTO dbo.STATUS (clave, descripcion, ACTIVO) VALUES ('${q(d.clave)}', '${q(d.descripcion)}', 1);`
      : `INSERT INTO dbo.STATUS (status_id, clave, descripcion, ACTIVO)
           SELECT ISNULL(MAX(status_id), 0) + 1, '${q(d.clave)}', '${q(d.descripcion)}', 1 FROM dbo.STATUS WITH (UPDLOCK, HOLDLOCK);`);
    const configurar = (d) => {
      const sets = [
        `ETIQUETA = N'${q(d.etiqueta)}'`, `EMOJI = N'${q(d.emoji)}'`, `COLOR = '${d.color}'`, `ORDEN = ${d.orden}`,
        'ES_PAUSA = 1', 'ES_SISTEMA = 1', `CONTROL_OCUPACION = ${d.ocupacion ? 1 : 0}`,
        `LIMITE_MIN = ${d.limite ?? 'NULL'}`, `LIMITE_MODO = ${d.modo ? `'${d.modo}'` : 'NULL'}`,
      ];
      const limites = Object.entries(d.limitesArea || {}).map(([area, min]) => `
    INSERT INTO dbo.STATUS_LIMITE_AREA (STATUS_ID, AREA, LIMITE_MIN)
    SELECT s.status_id, '${q(area)}', ${Number(min)} FROM dbo.STATUS s
    WHERE s.clave = '${q(d.clave)}' AND NOT EXISTS (SELECT 1 FROM dbo.STATUS_LIMITE_AREA l WHERE l.STATUS_ID = s.status_id AND l.AREA = '${q(area)}');`).join('');
      return `
IF NOT EXISTS (SELECT 1 FROM dbo.STATUS WHERE clave = '${q(d.clave)}')
  ${insertar(d)}
IF EXISTS (SELECT 1 FROM dbo.STATUS WHERE clave = '${q(d.clave)}' AND ETIQUETA IS NULL)
BEGIN
  UPDATE dbo.STATUS SET ${sets.join(', ')} WHERE clave = '${q(d.clave)}';${limites}
END`;
    };
    await pool.request().batch(`
UPDATE dbo.STATUS SET ES_SISTEMA = 1 WHERE clave IN ('online', 'offline') AND ES_SISTEMA = 0;
${DEFAULTS.map(configurar).join('\n')}
`);
    logger.info('✅ Esquema de tipos de pausa asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de tipos de pausa:', err.message);
  }
}

module.exports = {
  USOS,
  LIMITE_MODULOS,
  DEFAULTS,
  sqlPausas,
  listar,
  etiquetaPausa,
  llaveLegacy,
  legado,
  camposSeg,
  camposMin,
  mapaEnCero,
  desglose,
  idBanio,
  metaStatusId,
  ensureSchema,
};
