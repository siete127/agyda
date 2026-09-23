require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });

const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del rediseño de Atención al Cliente — migra a la tabla unificada CASOS
// todos los registros reales de las 4 entidades viejas:
//   CONSULTAS, ACLARACIONES, QUEJAS, CLI_INCIDENCIAS  (+ sus tablas hijas).
//
// NO DESTRUCTIVO: las tablas viejas no se tocan; solo se leen.
// IDEMPOTENTE: cada CASOS lleva (CASO_ORIGEN_TABLA, CASO_ORIGEN_ID); el índice
//   único filtrado IX_CASOS_ORIGEN impide duplicar. El script salta lo ya
//   migrado con NOT EXISTS, así que se puede correr N veces (p.ej. una última
//   pasada justo antes de apagar la UI vieja, para capturar lo creado mientras).
//
// Uso:  node scripts/migrarCasosUnificados.js
// ─────────────────────────────────────────────────────────────────────────────

// Enum de estatus destino (el de CLI_INCIDENCIAS, que ya es el canónico):
//   pendiente | en_proceso | en_espera_cliente | resuelto | escalado | cerrado
const MAP_ESTATUS_CONSULTA_ACLARACION = {
  pendiente: 'pendiente',
  proceso: 'en_proceso',
  resuelta: 'resuelto',
};
const MAP_ESTATUS_QUEJA = {
  pendiente: 'pendiente',
  proceso: 'en_proceso',
  terminada: 'cerrado',
};
const ESTATUS_CIERRAN = ['resuelto', 'cerrado'];

// Diagnóstico: compara las columnas reales de una tabla contra las esperadas.
async function verificarColumnas(pool, tabla, esperadas) {
  const rs = await pool.request()
    .input('t', sql.NVarChar, tabla)
    .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t`);
  if (rs.recordset.length === 0) return { existe: false, faltantes: esperadas };
  const reales = new Set(rs.recordset.map(r => r.COLUMN_NAME));
  return { existe: true, faltantes: esperadas.filter(c => !reales.has(c)) };
}

// Genera el siguiente folio CASO-<AÑO>-<NNNN> dentro de la transacción.
async function siguienteFolio(tx, anio) {
  const prefijo = `CASO-${anio}-`;
  const rs = await new sql.Request(tx)
    .input('pref', sql.NVarChar, prefijo)
    .query(`
      SELECT ISNULL(MAX(CAST(SUBSTRING(CASO_FOLIO, LEN(@pref) + 1, 10) AS INT)), 0) AS maxn
      FROM dbo.CASOS WITH (UPDLOCK, HOLDLOCK)
      WHERE CASO_FOLIO LIKE @pref + '%'
    `);
  const n = (rs.recordset[0].maxn || 0) + 1;
  return `${prefijo}${String(n).padStart(4, '0')}`;
}

// Inserta un CASO + sus comentarios/evidencias/acción correctiva en una
// transacción. `origen` = { tabla, id }. Devuelve el CASO_ID nuevo, o null si
// ya estaba migrado.
async function migrarUno(pool, { origen, caso, comentarios = [], evidencias = [], accionCorrectiva = null }) {
  // Salto rápido fuera de transacción: ¿ya migrado?
  const yaRs = await pool.request()
    .input('t', sql.NVarChar, origen.tabla)
    .input('i', sql.Int, origen.id)
    .query(`SELECT CASO_ID FROM dbo.CASOS WHERE CASO_ORIGEN_TABLA = @t AND CASO_ORIGEN_ID = @i`);
  if (yaRs.recordset.length > 0) return null;

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const anio = (caso.fechaCreacion ? new Date(caso.fechaCreacion) : new Date()).getFullYear();
    const folio = await siguienteFolio(tx, anio);

    const ins = await new sql.Request(tx)
      .input('folio', sql.NVarChar(20), folio)
      .input('tipo', sql.NVarChar(20), caso.tipo)
      .input('contactoId', sql.Int, caso.contactoId ?? null)
      .input('clienteNombreLibre', sql.NVarChar(200), caso.clienteNombreLibre ?? null)
      .input('titulo', sql.NVarChar(200), caso.titulo)
      .input('descripcion', sql.NVarChar(sql.MAX), caso.descripcion ?? null)
      .input('categoria', sql.NVarChar(50), caso.categoria ?? null)
      .input('referencia', sql.NVarChar(100), caso.referencia ?? null)
      .input('prioridad', sql.NVarChar(20), caso.prioridad ?? 'media')
      .input('slaHoras', sql.Int, caso.slaHoras ?? null)
      .input('fechaLimiteSla', sql.DateTime, caso.fechaLimiteSla ?? null)
      .input('estatus', sql.NVarChar(20), caso.estatus)
      .input('origenCaso', sql.NVarChar(20), caso.origen ?? 'manual')
      .input('asignadoA', sql.Int, caso.asignadoA ?? null)
      .input('creadoPor', sql.Int, caso.creadoPor ?? null)
      .input('fechaCreacion', sql.DateTime, caso.fechaCreacion ?? new Date())
      .input('fechaResolucion', sql.DateTime, caso.fechaResolucion ?? null)
      .input('solucionPropuesta', sql.NVarChar(sql.MAX), caso.solucionPropuesta ?? null)
      .input('fechaCompromiso', sql.Date, caso.fechaCompromiso ?? null)
      .input('origenTabla', sql.NVarChar(20), origen.tabla)
      .input('origenId', sql.Int, origen.id)
      .query(`
        INSERT INTO dbo.CASOS (
          CASO_FOLIO, CASO_TIPO, CASO_CONTACTO_ID, CASO_CLIENTE_NOMBRE_LIBRE,
          CASO_TITULO, CASO_DESCRIPCION, CASO_CATEGORIA, CASO_REFERENCIA,
          CASO_PRIORIDAD, CASO_SLA_HORAS, CASO_FECHA_LIMITE_SLA, CASO_ESTATUS,
          CASO_ORIGEN, CASO_ASIGNADO_A, CASO_CREADO_POR, CASO_FECHA_CREACION,
          CASO_FECHA_RESOLUCION, CASO_SOLUCION_PROPUESTA, CASO_FECHA_COMPROMISO,
          CASO_ORIGEN_TABLA, CASO_ORIGEN_ID
        )
        OUTPUT INSERTED.CASO_ID
        VALUES (
          @folio, @tipo, @contactoId, @clienteNombreLibre,
          @titulo, @descripcion, @categoria, @referencia,
          @prioridad, @slaHoras, @fechaLimiteSla, @estatus,
          @origenCaso, @asignadoA, @creadoPor, @fechaCreacion,
          @fechaResolucion, @solucionPropuesta, @fechaCompromiso,
          @origenTabla, @origenId
        )
      `);
    const casoId = ins.recordset[0].CASO_ID;

    for (const c of comentarios) {
      await new sql.Request(tx)
        .input('casoId', sql.Int, casoId)
        .input('comentario', sql.NVarChar(sql.MAX), c.comentario ?? '')
        .input('usuarioId', sql.Int, c.usuarioId ?? null)
        .input('fecha', sql.DateTime, c.fecha ?? new Date())
        .query(`
          INSERT INTO dbo.CASOS_COMENTARIOS (CCO_CASO_ID, CCO_COMENTARIO, CCO_USUARIO_ID, CCO_FECHA)
          VALUES (@casoId, @comentario, @usuarioId, @fecha)
        `);
    }

    for (const e of evidencias) {
      await new sql.Request(tx)
        .input('casoId', sql.Int, casoId)
        .input('nombreOriginal', sql.NVarChar(255), e.nombreOriginal)
        .input('mimeType', sql.NVarChar(100), e.mimeType ?? null)
        .input('tamanoBytes', sql.BigInt, e.tamanoBytes ?? 0)
        .input('descripcion', sql.NVarChar(500), e.descripcion ?? null)
        .input('encryptedData', sql.VarBinary(sql.MAX), e.encryptedData)
        .input('contentHash', sql.Char(64), e.contentHash)
        .input('encAlgo', sql.NVarChar(30), e.encAlgo ?? 'aes-256-gcm')
        .input('encIv', sql.VarBinary(12), e.encIv)
        .input('encTag', sql.VarBinary(16), e.encTag)
        .input('keyId', sql.NVarChar(50), e.keyId ?? null)
        .input('subidoPor', sql.Int, e.subidoPor ?? null)
        .input('fechaSubida', sql.DateTime, e.fechaSubida ?? new Date())
        .input('activo', sql.Bit, e.activo == null ? 1 : e.activo)
        .query(`
          INSERT INTO dbo.CASOS_EVIDENCIAS (
            EVI_CASO_ID, EVI_NOMBRE_ORIGINAL, EVI_MIME_TYPE, EVI_TAMANO_BYTES,
            EVI_DESCRIPCION, EVI_ENCRYPTED_DATA, EVI_CONTENT_HASH, EVI_ENC_ALGO,
            EVI_ENC_IV, EVI_ENC_TAG, EVI_KEY_ID, EVI_SUBIDO_POR, EVI_FECHA_SUBIDA, EVI_ACTIVO
          )
          VALUES (
            @casoId, @nombreOriginal, @mimeType, @tamanoBytes,
            @descripcion, @encryptedData, @contentHash, @encAlgo,
            @encIv, @encTag, @keyId, @subidoPor, @fechaSubida, @activo
          )
        `);
    }

    if (accionCorrectiva) {
      const ac = accionCorrectiva;
      await new sql.Request(tx)
        .input('casoId', sql.Int, casoId)
        .input('redactorId', sql.Int, ac.redactorId ?? 0)
        .input('redactorNombre', sql.NVarChar(200), ac.redactorNombre ?? null)
        .input('descripcion', sql.NVarChar(sql.MAX), ac.descripcion ?? '')
        .input('responsable', sql.NVarChar(200), ac.responsable ?? '')
        .input('fechaCompromiso', sql.Date, ac.fechaCompromiso ?? new Date())
        .input('estado', sql.NVarChar(30), ac.estado ?? 'pendiente')
        .input('fechaRegistro', sql.DateTime, ac.fechaRegistro ?? new Date())
        .query(`
          INSERT INTO dbo.CASOS_ACCION_CORRECTIVA (
            AC_CASO_ID, AC_REDACTOR_ID, AC_REDACTOR_NOMBRE, AC_DESCRIPCION,
            AC_RESPONSABLE, AC_FECHA_COMPROMISO, AC_ESTADO, AC_FECHA_REGISTRO
          )
          VALUES (
            @casoId, @redactorId, @redactorNombre, @descripcion,
            @responsable, @fechaCompromiso, @estado, @fechaRegistro
          )
        `);
    }

    await tx.commit();
    return casoId;
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* best-effort */ }
    throw err;
  }
}

// ── Migración de CONSULTAS ──────────────────────────────────────────────────
async function migrarConsultas(pool, resumen) {
  const chk = await verificarColumnas(pool, 'CONSULTAS',
    ['CONSULTA_ID', 'USUARIO_ID', 'CLIENTE_NOMBRE', 'ASUNTO', 'MENSAJE', 'ESTATUS', 'FECHA']);
  if (!chk.existe) { console.log('  · CONSULTAS: no existe, se omite'); return; }
  if (chk.faltantes.length) console.warn(`  ⚠️ CONSULTAS: faltan columnas ${chk.faltantes.join(', ')} — se intenta igual`);

  const tieneContactoId = (await verificarColumnas(pool, 'CONSULTAS', ['CONSULTA_CONTACTO_ID'])).faltantes.length === 0;

  const rows = (await pool.request().query(`
    SELECT c.CONSULTA_ID, c.USUARIO_ID, c.CLIENTE_NOMBRE, c.ASUNTO, c.MENSAJE, c.ESTATUS, c.FECHA
           ${tieneContactoId ? ', c.CONSULTA_CONTACTO_ID' : ''}
    FROM dbo.CONSULTAS c
    WHERE NOT EXISTS (SELECT 1 FROM dbo.CASOS k WHERE k.CASO_ORIGEN_TABLA = 'CONSULTAS' AND k.CASO_ORIGEN_ID = c.CONSULTA_ID)
    ORDER BY c.CONSULTA_ID
  `)).recordset;

  for (const r of rows) {
    try {
      const comentarios = (await pool.request().input('id', sql.Int, r.CONSULTA_ID).query(`
        SELECT USUARIO_ID as usuarioId, CONTENIDO as comentario, FECHA as fecha
        FROM dbo.CONSULTAS_COMENTARIOS WHERE CONSULTA_ID = @id ORDER BY COM_ID
      `)).recordset;
      const estatus = MAP_ESTATUS_CONSULTA_ACLARACION[String(r.ESTATUS || '').toLowerCase()] || 'pendiente';
      const casoId = await migrarUno(pool, {
        origen: { tabla: 'CONSULTAS', id: r.CONSULTA_ID },
        caso: {
          tipo: 'consulta',
          contactoId: tieneContactoId ? r.CONSULTA_CONTACTO_ID : null,
          clienteNombreLibre: r.CLIENTE_NOMBRE,
          titulo: r.ASUNTO,
          descripcion: r.MENSAJE,
          estatus,
          origen: 'manual',
          creadoPor: r.USUARIO_ID,
          fechaCreacion: r.FECHA,
          fechaResolucion: ESTATUS_CIERRAN.includes(estatus) ? r.FECHA : null,
        },
        comentarios,
      });
      if (casoId) resumen.insertados++; else resumen.omitidos++;
    } catch (err) {
      resumen.errores++;
      console.error(`  ✗ CONSULTA ${r.CONSULTA_ID}:`, err.message);
    }
  }
}

// ── Migración de ACLARACIONES ───────────────────────────────────────────────
async function migrarAclaraciones(pool, resumen) {
  const chk = await verificarColumnas(pool, 'ACLARACIONES',
    ['ACLARACION_ID', 'USUARIO_ID', 'CLIENTE_NOMBRE', 'REFERENCIA', 'MOTIVO', 'DETALLE', 'ESTATUS', 'FECHA']);
  if (!chk.existe) { console.log('  · ACLARACIONES: no existe, se omite'); return; }
  if (chk.faltantes.length) console.warn(`  ⚠️ ACLARACIONES: faltan columnas ${chk.faltantes.join(', ')} — se intenta igual`);

  const tieneContactoId = (await verificarColumnas(pool, 'ACLARACIONES', ['ACLARACION_CONTACTO_ID'])).faltantes.length === 0;

  const rows = (await pool.request().query(`
    SELECT a.ACLARACION_ID, a.USUARIO_ID, a.CLIENTE_NOMBRE, a.REFERENCIA, a.MOTIVO, a.DETALLE, a.ESTATUS, a.FECHA
           ${tieneContactoId ? ', a.ACLARACION_CONTACTO_ID' : ''}
    FROM dbo.ACLARACIONES a
    WHERE NOT EXISTS (SELECT 1 FROM dbo.CASOS k WHERE k.CASO_ORIGEN_TABLA = 'ACLARACIONES' AND k.CASO_ORIGEN_ID = a.ACLARACION_ID)
    ORDER BY a.ACLARACION_ID
  `)).recordset;

  for (const r of rows) {
    try {
      const comentarios = (await pool.request().input('id', sql.Int, r.ACLARACION_ID).query(`
        SELECT USUARIO_ID as usuarioId, CONTENIDO as comentario, FECHA as fecha
        FROM dbo.ACLARACIONES_COMENTARIOS WHERE ACLARACION_ID = @id ORDER BY COM_ID
      `)).recordset;
      const estatus = MAP_ESTATUS_CONSULTA_ACLARACION[String(r.ESTATUS || '').toLowerCase()] || 'pendiente';
      const casoId = await migrarUno(pool, {
        origen: { tabla: 'ACLARACIONES', id: r.ACLARACION_ID },
        caso: {
          tipo: 'aclaracion',
          contactoId: tieneContactoId ? r.ACLARACION_CONTACTO_ID : null,
          clienteNombreLibre: r.CLIENTE_NOMBRE,
          titulo: r.MOTIVO,
          descripcion: r.DETALLE,
          referencia: r.REFERENCIA,
          estatus,
          origen: 'manual',
          creadoPor: r.USUARIO_ID,
          fechaCreacion: r.FECHA,
          fechaResolucion: ESTATUS_CIERRAN.includes(estatus) ? r.FECHA : null,
        },
        comentarios,
      });
      if (casoId) resumen.insertados++; else resumen.omitidos++;
    } catch (err) {
      resumen.errores++;
      console.error(`  ✗ ACLARACION ${r.ACLARACION_ID}:`, err.message);
    }
  }
}

// ── Migración de QUEJAS ─────────────────────────────────────────────────────
async function migrarQuejas(pool, resumen) {
  const chk = await verificarColumnas(pool, 'QUEJAS',
    ['QUEJA_ID', 'USUARIO_ID', 'TITULO', 'DESCRIPCION', 'FECHA', 'ESTATUS']);
  if (!chk.existe) { console.log('  · QUEJAS: no existe, se omite'); return; }
  if (chk.faltantes.length) console.warn(`  ⚠️ QUEJAS: faltan columnas ${chk.faltantes.join(', ')} — se intenta igual`);

  const rows = (await pool.request().query(`
    SELECT q.QUEJA_ID, q.USUARIO_ID, q.TITULO, q.DESCRIPCION, q.FECHA, q.ESTATUS
    FROM dbo.QUEJAS q
    WHERE NOT EXISTS (SELECT 1 FROM dbo.CASOS k WHERE k.CASO_ORIGEN_TABLA = 'QUEJAS' AND k.CASO_ORIGEN_ID = q.QUEJA_ID)
    ORDER BY q.QUEJA_ID
  `)).recordset;

  for (const r of rows) {
    try {
      const comentarios = (await pool.request().input('id', sql.Int, r.QUEJA_ID).query(`
        SELECT USUARIO_ID as usuarioId, CONTENIDO as comentario, FECHA as fecha
        FROM dbo.QUEJAS_COMENTARIOS WHERE QUEJA_ID = @id ORDER BY COM_ID
      `)).recordset;
      const acRs = (await pool.request().input('id', sql.Int, r.QUEJA_ID).query(`
        SELECT TOP 1 REDACTOR_ID as redactorId, REDACTOR_NOMBRE as redactorNombre, DESCRIPCION as descripcion,
               RESPONSABLE as responsable, FECHA_COMPROMISO as fechaCompromiso, ESTADO_AC as estado, FECHA_REGISTRO as fechaRegistro
        FROM dbo.QUEJAS_ACCION_CORRECTIVA WHERE QUEJA_ID = @id
      `)).recordset;
      const estatus = MAP_ESTATUS_QUEJA[String(r.ESTATUS || '').toLowerCase()] || 'pendiente';
      const casoId = await migrarUno(pool, {
        origen: { tabla: 'QUEJAS', id: r.QUEJA_ID },
        caso: {
          tipo: 'queja',
          contactoId: null,
          clienteNombreLibre: null,
          titulo: r.TITULO,
          descripcion: r.DESCRIPCION,
          estatus,
          origen: 'manual',
          creadoPor: r.USUARIO_ID,
          fechaCreacion: r.FECHA,
          fechaResolucion: ESTATUS_CIERRAN.includes(estatus) ? r.FECHA : null,
        },
        comentarios,
        accionCorrectiva: acRs[0] || null,
      });
      if (casoId) resumen.insertados++; else resumen.omitidos++;
    } catch (err) {
      resumen.errores++;
      console.error(`  ✗ QUEJA ${r.QUEJA_ID}:`, err.message);
    }
  }
}

// ── Migración de CLI_INCIDENCIAS ────────────────────────────────────────────
async function migrarIncidencias(pool, resumen) {
  const chk = await verificarColumnas(pool, 'CLI_INCIDENCIAS',
    ['INC_ID', 'INC_FOLIO', 'INC_CONTACTO_ID', 'INC_TITULO', 'INC_ESTATUS', 'INC_PRIORIDAD']);
  if (!chk.existe) { console.log('  · CLI_INCIDENCIAS: no existe, se omite'); return; }
  if (chk.faltantes.length) console.warn(`  ⚠️ CLI_INCIDENCIAS: faltan columnas ${chk.faltantes.join(', ')} — se intenta igual`);

  const rows = (await pool.request().query(`
    SELECT INC_ID, INC_FOLIO, INC_CONTACTO_ID, INC_TITULO, INC_DESCRIPCION, INC_CATEGORIA,
           INC_PRIORIDAD, INC_SLA_HORAS, INC_FECHA_LIMITE_SLA, INC_ESTATUS, INC_ORIGEN,
           INC_ASIGNADO_A, INC_CREADO_POR, INC_FECHA_CREACION, INC_FECHA_RESOLUCION,
           INC_SOLUCION_PROPUESTA, INC_FECHA_COMPROMISO
    FROM dbo.CLI_INCIDENCIAS
    WHERE INC_ACTIVO = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.CASOS k WHERE k.CASO_ORIGEN_TABLA = 'CLI_INCIDENCIAS' AND k.CASO_ORIGEN_ID = CLI_INCIDENCIAS.INC_ID)
    ORDER BY INC_ID
  `)).recordset;

  for (const r of rows) {
    try {
      const comentarios = (await pool.request().input('id', sql.Int, r.INC_ID).query(`
        SELECT ICO_USUARIO_ID as usuarioId, ICO_COMENTARIO as comentario, ICO_FECHA as fecha
        FROM dbo.CLI_INCIDENCIAS_COMENTARIOS WHERE ICO_INCIDENCIA_ID = @id ORDER BY ICO_ID
      `)).recordset;
      const evidencias = (await pool.request().input('id', sql.Int, r.INC_ID).query(`
        SELECT EVI_NOMBRE_ORIGINAL as nombreOriginal, EVI_MIME_TYPE as mimeType, EVI_TAMANO_BYTES as tamanoBytes,
               EVI_DESCRIPCION as descripcion, EVI_ENCRYPTED_DATA as encryptedData, EVI_CONTENT_HASH as contentHash,
               EVI_ENC_ALGO as encAlgo, EVI_ENC_IV as encIv, EVI_ENC_TAG as encTag, EVI_KEY_ID as keyId,
               EVI_SUBIDO_POR as subidoPor, EVI_FECHA_SUBIDA as fechaSubida, EVI_ACTIVO as activo
        FROM dbo.CLI_INCIDENCIAS_EVIDENCIAS WHERE EVI_INCIDENCIA_ID = @id ORDER BY EVI_ID
      `)).recordset;

      // El folio viejo INC-YYYY-NNNN se preserva en CASO_REFERENCIA; el CASO
      // recibe un folio nuevo CASO-YYYY-NNNN generado en migrarUno.
      const casoId = await migrarUno(pool, {
        origen: { tabla: 'CLI_INCIDENCIAS', id: r.INC_ID },
        caso: {
          tipo: 'incidencia',
          contactoId: r.INC_CONTACTO_ID,
          clienteNombreLibre: null,
          titulo: r.INC_TITULO,
          descripcion: r.INC_DESCRIPCION,
          categoria: r.INC_CATEGORIA,
          referencia: r.INC_FOLIO,
          prioridad: r.INC_PRIORIDAD || 'media',
          slaHoras: r.INC_SLA_HORAS,
          fechaLimiteSla: r.INC_FECHA_LIMITE_SLA,
          estatus: r.INC_ESTATUS || 'pendiente',
          origen: r.INC_ORIGEN || 'manual',
          asignadoA: r.INC_ASIGNADO_A,
          creadoPor: r.INC_CREADO_POR,
          fechaCreacion: r.INC_FECHA_CREACION,
          fechaResolucion: r.INC_FECHA_RESOLUCION,
          solucionPropuesta: r.INC_SOLUCION_PROPUESTA,
          fechaCompromiso: r.INC_FECHA_COMPROMISO,
        },
        comentarios,
        evidencias,
      });
      if (casoId) resumen.insertados++; else resumen.omitidos++;
    } catch (err) {
      resumen.errores++;
      console.error(`  ✗ INCIDENCIA ${r.INC_ID}:`, err.message);
    }
  }
}

async function migrarTenant(tenantKey) {
  console.log(`\n═══ Tenant: ${tenantKey} ═══`);
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`  ✗ Sin pool para ${tenantKey}:`, e.message);
    return;
  }

  // La tabla CASOS debe existir (Fase 1). Si no, este tenant no ha corrido el
  // schema nuevo — se avisa y se salta.
  const casosOk = (await verificarColumnas(pool, 'CASOS', ['CASO_ID'])).existe;
  if (!casosOk) {
    console.error('  ✗ La tabla CASOS no existe en este tenant. Reinicia el backend contra él antes de migrar.');
    return;
  }

  const resumen = { insertados: 0, omitidos: 0, errores: 0 };
  await migrarConsultas(pool, resumen);
  await migrarAclaraciones(pool, resumen);
  await migrarQuejas(pool, resumen);
  await migrarIncidencias(pool, resumen);

  console.log(`  Resumen ${tenantKey}: insertados ${resumen.insertados}, omitidos (ya migrados) ${resumen.omitidos}, errores ${resumen.errores}`);
  return resumen;
}

async function run() {
  // Inicializa el tenant por defecto — esto también carga loadDynamicTenants,
  // por lo que listTenants() ya incluye las empresas creadas desde Accesos.
  await databaseService.initialize();

  const tenants = listTenants();
  console.log(`Migrando ${tenants.length} tenant(s): ${tenants.map(t => t.key).join(', ')}`);

  const totales = { insertados: 0, omitidos: 0, errores: 0 };
  for (const { key } of tenants) {
    const r = await migrarTenant(key);
    if (r) {
      totales.insertados += r.insertados;
      totales.omitidos += r.omitidos;
      totales.errores += r.errores;
    }
  }

  console.log(`\n════════ TOTAL ════════`);
  console.log(`Insertados: ${totales.insertados}  ·  Omitidos: ${totales.omitidos}  ·  Errores: ${totales.errores}`);
  process.exit(totales.errores > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('❌ Error fatal en la migración:', err);
  process.exit(1);
});
