const sql = require('mssql');
const databaseService = require('../services/databaseService');
const wa = require('../services/waMasivo/waMasivoService');
const { logAudit } = require('../services/auditService');

// WhatsApp masivo (solo envío): cuentas que se turnan, campañas con una
// cadena de mensajes y su lista de números. Ver services/waMasivo.

async function poolDe(req) {
  const pool = await databaseService.getPool(req.user?.empresa);
  await wa.asegurarTablas(pool);
  wa.registrarEmpresa(req.user?.empresa);
  return pool;
}
const uid = (req) => parseInt(req.user?.id || req.user?.userId || req.user?.NEUS_ID, 10) || null;
const idDe = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };
function responderError(res, e, donde) {
  if (e?.status) return res.status(e.status).json({ success: false, message: e.message });
  console.error(`waMasivo.${donde}:`, e);
  return res.status(500).json({ success: false, message: e?.message || 'Error' });
}
const err = (status, message) => Object.assign(new Error(message), { status });
const auditar = (req, pool, accion, entidadId, detalle) => logAudit(pool, {
  userId: uid(req), userName: req.user?.nombre || null, modulo: 'contact-center', accion, entidadId, detalle, ip: req.ip,
}).catch(() => {});

const ESTADOS_DEST = ['pendiente', 'en_cadena', 'completado', 'excluido', 'fallido'];

// GET /resumen — cuentas (con su estado en vivo y cuánto llevan hoy) y campañas con su avance.
exports.resumen = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const cuentas = (await pool.request().query(`
      SELECT c.WMC_ID id, c.WMC_ALIAS alias, c.WMC_NUMERO numero, c.WMC_ESTADO estadoBd, CAST(c.WMC_ACTIVA AS bit) activa,
             c.WMC_TOPE_DIARIO topeDiario, CAST(c.WMC_CALENTAMIENTO AS bit) calentamiento, c.WMC_PAUSA_MOTIVO pausaMotivo,
             c.WMC_FECHA_CONEXION fechaConexion, c.WMC_FECHA_ALTA fechaAlta,
             (SELECT COUNT(*) FROM dbo.WA_MASIVO_ENVIOS e WHERE e.WME_CUENTA_ID = c.WMC_ID AND e.WME_OK = 1 AND e.WME_FECHA >= CAST(GETDATE() AS date)) enviadosHoy,
             (SELECT COUNT(*) FROM dbo.WA_MASIVO_ASIGNACION a WHERE a.WMS_CUENTA_ID = c.WMC_ID) numerosAsignados
      FROM dbo.WA_MASIVO_CUENTAS c WHERE c.WMC_ELIMINADA = 0 ORDER BY c.WMC_ID`)).recordset;
    const campanias = (await pool.request().query(`
      SELECT p.WMP_ID id, p.WMP_NOMBRE nombre, p.WMP_ESTADO estado, p.WMP_FECHA fecha, p.WMP_FECHA_INICIO fechaInicio, p.WMP_FECHA_FIN fechaFin,
             p.WMP_PASOS pasos,
             (SELECT COUNT(*) FROM dbo.WA_MASIVO_DESTINATARIOS d WHERE d.WMD_CAMPANIA_ID = p.WMP_ID) total,
             (SELECT COUNT(*) FROM dbo.WA_MASIVO_DESTINATARIOS d WHERE d.WMD_CAMPANIA_ID = p.WMP_ID AND d.WMD_ESTADO = 'completado') completados,
             (SELECT COUNT(*) FROM dbo.WA_MASIVO_DESTINATARIOS d WHERE d.WMD_CAMPANIA_ID = p.WMP_ID AND d.WMD_ESTADO IN ('excluido', 'fallido')) noEnviados
      FROM dbo.WA_MASIVO_CAMPANIAS p ORDER BY p.WMP_ID DESC`)).recordset;
    res.json({
      success: true,
      data: {
        cuentas: cuentas.map((c) => {
          const vivo = wa.estadoSesion(req.user?.empresa, c.id);
          return { ...c, estado: vivo.estado, topeHoy: wa.topeEfectivo({ WMC_TOPE_DIARIO: c.topeDiario, WMC_CALENTAMIENTO: c.calentamiento, WMC_FECHA_CONEXION: c.fechaConexion }) };
        }),
        campanias: campanias.map(({ pasos, ...c }) => {
          let n = 0;
          try { n = JSON.parse(pasos || '[]').length; } catch (_) { n = 0; }
          return { ...c, pasos: n };
        }),
      },
    });
  } catch (e) { responderError(res, e, 'resumen'); }
};

// ── Cuentas ───────────────────────────────────────────────────────────────
function datosCuenta(b) {
  const alias = String(b.alias || '').trim().slice(0, 80);
  const tope = Math.min(5000, Math.max(1, parseInt(b.topeDiario, 10) || 200));
  return { alias, tope, calentamiento: b.calentamiento === false ? 0 : 1 };
}

exports.crearCuenta = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const d = datosCuenta(req.body || {});
    if (!d.alias) throw err(400, 'Ponle un nombre a la cuenta');
    const id = (await pool.request().input('a', sql.NVarChar(80), d.alias).input('t', sql.Int, d.tope).input('cal', sql.Bit, d.calentamiento)
      .query('INSERT INTO dbo.WA_MASIVO_CUENTAS (WMC_ALIAS, WMC_TOPE_DIARIO, WMC_CALENTAMIENTO) OUTPUT INSERTED.WMC_ID id VALUES (@a, @t, @cal)')).recordset[0].id;
    auditar(req, pool, 'wa-masivo-crear-cuenta', id, { alias: d.alias });
    res.status(201).json({ success: true, data: { id } });
  } catch (e) { responderError(res, e, 'crearCuenta'); }
};

// PUT /cuentas/:id — { alias, topeDiario, calentamiento, activa, reanudar }
exports.editarCuenta = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    if (!id) throw err(400, 'Cuenta inválida');
    const pool = await poolDe(req);
    const b = req.body || {};
    const d = datosCuenta(b);
    if (!d.alias) throw err(400, 'Ponle un nombre a la cuenta');
    const up = await pool.request().input('id', sql.Int, id).input('a', sql.NVarChar(80), d.alias).input('t', sql.Int, d.tope)
      .input('cal', sql.Bit, d.calentamiento).input('act', sql.Bit, typeof b.activa === 'boolean' ? (b.activa ? 1 : 0) : null)
      .input('re', sql.Bit, b.reanudar ? 1 : 0)
      .query(`UPDATE dbo.WA_MASIVO_CUENTAS SET WMC_ALIAS = @a, WMC_TOPE_DIARIO = @t, WMC_CALENTAMIENTO = @cal,
                WMC_ACTIVA = ISNULL(@act, WMC_ACTIVA), WMC_PAUSA_MOTIVO = CASE WHEN @re = 1 THEN NULL ELSE WMC_PAUSA_MOTIVO END
              WHERE WMC_ID = @id AND WMC_ELIMINADA = 0`);
    if (!up.rowsAffected[0]) throw err(404, 'Cuenta no encontrada');
    res.json({ success: true });
  } catch (e) { responderError(res, e, 'editarCuenta'); }
};

exports.conectarCuenta = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    const c = (await pool.request().input('id', sql.Int, id).query('SELECT WMC_ID FROM dbo.WA_MASIVO_CUENTAS WHERE WMC_ID = @id AND WMC_ELIMINADA = 0')).recordset[0];
    if (!c) throw err(404, 'Cuenta no encontrada');
    await wa.conectarCuenta(req.user?.empresa, id);
    res.json({ success: true, data: wa.estadoSesion(req.user?.empresa, id) });
  } catch (e) { responderError(res, e, 'conectarCuenta'); }
};

exports.estadoCuenta = async (req, res) => {
  try {
    res.json({ success: true, data: wa.estadoSesion(req.user?.empresa, idDe(req.params.id)) });
  } catch (e) { responderError(res, e, 'estadoCuenta'); }
};

exports.desconectarCuenta = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    await wa.desconectarCuenta(req.user?.empresa, id);
    auditar(req, pool, 'wa-masivo-desvincular-cuenta', id, null);
    res.json({ success: true });
  } catch (e) { responderError(res, e, 'desconectarCuenta'); }
};

// DELETE /cuentas/:id — la quita y libera sus números (sus cadenas a medias quedan como fallidas).
exports.eliminarCuenta = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    await wa.desconectarCuenta(req.user?.empresa, id).catch(() => {});
    const r = await pool.request().input('id', sql.Int, id).query(`
      UPDATE dbo.WA_MASIVO_CUENTAS SET WMC_ELIMINADA = 1, WMC_ACTIVA = 0, WMC_ESTADO = 'desconectado' WHERE WMC_ID = @id;
      UPDATE dbo.WA_MASIVO_DESTINATARIOS SET WMD_ESTADO = 'fallido', WMD_ERROR = 'Se eliminó la cuenta que le escribía'
        WHERE WMD_CUENTA_ID = @id AND WMD_ESTADO = 'en_cadena';
      DELETE FROM dbo.WA_MASIVO_ASIGNACION WHERE WMS_CUENTA_ID = @id;
      SELECT @@ROWCOUNT AS liberados;`);
    auditar(req, pool, 'wa-masivo-eliminar-cuenta', id, { liberados: r.recordset[0]?.liberados });
    res.json({ success: true, data: { liberados: r.recordset[0]?.liberados ?? 0 } });
  } catch (e) { responderError(res, e, 'eliminarCuenta'); }
};

// ── Archivos de los pasos ─────────────────────────────────────────────────
exports.subirArchivo = async (req, res) => {
  try {
    if (!req.file) throw err(400, 'No llegó ningún archivo');
    const pool = await poolDe(req);
    const nombre = String(req.file.originalname || 'archivo').slice(0, 260);
    const id = (await pool.request().input('n', sql.NVarChar(260), nombre).input('m', sql.NVarChar(120), req.file.mimetype || null)
      .input('a', sql.NVarChar(260), req.file.filename).input('t', sql.Int, req.file.size || null)
      .query('INSERT INTO dbo.WA_MASIVO_ARCHIVOS (WMA_NOMBRE, WMA_MIME, WMA_ARCHIVO, WMA_TAMANO) OUTPUT INSERTED.WMA_ID id VALUES (@n, @m, @a, @t)')).recordset[0].id;
    res.status(201).json({ success: true, data: { id, nombre, mime: req.file.mimetype, tamano: req.file.size, url: `/uploads/wa-masivo/${req.file.filename}` } });
  } catch (e) { responderError(res, e, 'subirArchivo'); }
};

// ── Campañas ──────────────────────────────────────────────────────────────
// Pasos: [{ tipo: texto|imagen|video|documento, textos: [variantes], archivoId, esperaSeg }]
function limpiarPasos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 20).map((p) => ({
    tipo: wa.TIPOS_PASO.includes(p?.tipo) ? p.tipo : 'texto',
    textos: (Array.isArray(p?.textos) ? p.textos : []).map((t) => String(t || '').slice(0, 4000)).filter((t) => t.trim()).slice(0, 5),
    archivoId: idDe(p?.archivoId),
    esperaSeg: Math.min(30 * 86400, Math.max(0, parseInt(p?.esperaSeg, 10) || 0)),
  }));
}
function problemasPasos(pasos) {
  if (!pasos.length) return 'Agrega al menos un mensaje a la cadena';
  for (const [i, p] of pasos.entries()) {
    if (p.tipo === 'texto' && !p.textos.length) return `El paso ${i + 1} es de texto y no tiene texto`;
    if (p.tipo !== 'texto' && !p.archivoId) return `El paso ${i + 1} necesita su archivo`;
  }
  return null;
}
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function leerCampania(pool, id) {
  const c = (await pool.request().input('id', sql.Int, id).query('SELECT * FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ID = @id')).recordset[0];
  if (!c) return null;
  let pasos = [];
  try { pasos = JSON.parse(c.WMP_PASOS || '[]'); } catch (_) { pasos = []; }
  const archivoIds = [...new Set(pasos.map((p) => p.archivoId).filter(Boolean))];
  const archivos = archivoIds.length ? (await pool.request().query(`SELECT WMA_ID id, WMA_NOMBRE nombre, WMA_MIME mime, WMA_TAMANO tamano, WMA_ARCHIVO archivo
    FROM dbo.WA_MASIVO_ARCHIVOS WHERE WMA_ID IN (${archivoIds.map(Number).join(',')})`)).recordset : [];
  const conteo = (await pool.request().input('id', sql.Int, id).query(`
    SELECT WMD_ESTADO estado, COUNT(*) n FROM dbo.WA_MASIVO_DESTINATARIOS WHERE WMD_CAMPANIA_ID = @id GROUP BY WMD_ESTADO`)).recordset;
  const porCuenta = (await pool.request().input('id', sql.Int, id).query(`
    SELECT d.WMD_CUENTA_ID cuentaId, c.WMC_ALIAS alias, COUNT(*) numeros,
           SUM(CASE WHEN d.WMD_ESTADO = 'completado' THEN 1 ELSE 0 END) completados,
           (SELECT COUNT(*) FROM dbo.WA_MASIVO_ENVIOS e JOIN dbo.WA_MASIVO_DESTINATARIOS x ON x.WMD_ID = e.WME_DEST_ID
             WHERE x.WMD_CAMPANIA_ID = @id AND e.WME_CUENTA_ID = d.WMD_CUENTA_ID AND e.WME_OK = 1) mensajes
    FROM dbo.WA_MASIVO_DESTINATARIOS d LEFT JOIN dbo.WA_MASIVO_CUENTAS c ON c.WMC_ID = d.WMD_CUENTA_ID
    WHERE d.WMD_CAMPANIA_ID = @id AND d.WMD_CUENTA_ID IS NOT NULL GROUP BY d.WMD_CUENTA_ID, c.WMC_ALIAS`)).recordset;
  const cuenta = Object.fromEntries(ESTADOS_DEST.map((e) => [e, 0]));
  for (const r of conteo) cuenta[r.estado] = r.n;
  return {
    id: c.WMP_ID, nombre: c.WMP_NOMBRE, estado: c.WMP_ESTADO,
    pasos: pasos.map((p) => {
      const a = archivos.find((x) => x.id === p.archivoId);
      return { ...p, archivo: a ? { id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, url: `/uploads/wa-masivo/${a.archivo}` } : null };
    }),
    pausaMin: c.WMP_PAUSA_MIN, pausaMax: c.WMP_PAUSA_MAX, horaInicio: String(c.WMP_HORA_INICIO).slice(0, 5), horaFin: String(c.WMP_HORA_FIN).slice(0, 5),
    dias: String(c.WMP_DIAS || '').split(',').filter(Boolean).map(Number),
    fecha: c.WMP_FECHA, fechaInicio: c.WMP_FECHA_INICIO, fechaFin: c.WMP_FECHA_FIN,
    enHorario: wa.enHorario(c),
    conteo: cuenta, total: Object.values(cuenta).reduce((a, b) => a + b, 0), porCuenta,
  };
}

exports.getCampania = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const c = await leerCampania(pool, idDe(req.params.id));
    if (!c) throw err(404, 'Campaña no encontrada');
    res.json({ success: true, data: c });
  } catch (e) { responderError(res, e, 'getCampania'); }
};

// GET /campanias/:id/destinatarios?estado=&buscar=&pagina=
exports.listDestinatarios = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    const estado = ESTADOS_DEST.includes(req.query.estado) ? req.query.estado : null;
    const buscar = String(req.query.buscar || '').trim().slice(0, 60);
    const pagina = Math.max(0, parseInt(req.query.pagina, 10) || 0);
    const r = await pool.request().input('id', sql.Int, id).input('e', sql.NVarChar(20), estado)
      .input('b', sql.NVarChar(70), buscar ? `%${buscar}%` : null).input('off', sql.Int, pagina * 100).query(`
        SELECT d.WMD_ID id, d.WMD_TELEFONO telefono, d.WMD_NOMBRE nombre, d.WMD_ESTADO estado, d.WMD_PASO paso,
               d.WMD_PROXIMO proximo, d.WMD_ERROR error, d.WMD_FECHA_ULTIMO fechaUltimo, c.WMC_ALIAS cuenta,
               COUNT(*) OVER () totalFiltrado
        FROM dbo.WA_MASIVO_DESTINATARIOS d LEFT JOIN dbo.WA_MASIVO_CUENTAS c ON c.WMC_ID = d.WMD_CUENTA_ID
        WHERE d.WMD_CAMPANIA_ID = @id AND (@e IS NULL OR d.WMD_ESTADO = @e)
          AND (@b IS NULL OR d.WMD_TELEFONO LIKE @b OR d.WMD_NOMBRE LIKE @b)
        ORDER BY d.WMD_ID OFFSET @off ROWS FETCH NEXT 100 ROWS ONLY`);
    res.json({ success: true, data: { filas: r.recordset.map(({ totalFiltrado, ...x }) => x), total: r.recordset[0]?.totalFiltrado ?? 0 } });
  } catch (e) { responderError(res, e, 'listDestinatarios'); }
};

exports.crearCampania = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const nombre = String(req.body?.nombre || '').trim().slice(0, 150);
    if (!nombre) throw err(400, 'Ponle un nombre a la campaña');
    const id = (await pool.request().input('n', sql.NVarChar(150), nombre).input('u', sql.Int, uid(req))
      .query("INSERT INTO dbo.WA_MASIVO_CAMPANIAS (WMP_NOMBRE, WMP_PASOS, WMP_CREADO_POR) OUTPUT INSERTED.WMP_ID id VALUES (@n, '[]', @u)")).recordset[0].id;
    auditar(req, pool, 'wa-masivo-crear-campania', id, { nombre });
    res.status(201).json({ success: true, data: { id } });
  } catch (e) { responderError(res, e, 'crearCampania'); }
};

// PUT /campanias/:id — nombre, pasos, ritmo y horario (solo en borrador o pausada).
exports.guardarCampania = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    const actual = (await pool.request().input('id', sql.Int, id).query('SELECT WMP_ESTADO e FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ID = @id')).recordset[0];
    if (!actual) throw err(404, 'Campaña no encontrada');
    if (!['borrador', 'pausada'].includes(actual.e)) throw err(409, 'Para cambiarla, primero pausa la campaña');
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 150);
    if (!nombre) throw err(400, 'Ponle un nombre a la campaña');
    const pasos = limpiarPasos(b.pasos);
    const pMin = Math.min(3600, Math.max(5, parseInt(b.pausaMin, 10) || 20));
    const pMax = Math.min(3600, Math.max(pMin, parseInt(b.pausaMax, 10) || 45));
    const hIni = HORA_RE.test(b.horaInicio) ? b.horaInicio : '09:00';
    const hFin = HORA_RE.test(b.horaFin) ? b.horaFin : '19:00';
    if (hFin <= hIni) throw err(400, 'La hora de fin debe ser después de la de inicio');
    const dias = [...new Set((Array.isArray(b.dias) ? b.dias : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    if (!dias.length) throw err(400, 'Elige al menos un día de envío');
    await pool.request().input('id', sql.Int, id).input('n', sql.NVarChar(150), nombre).input('p', sql.NVarChar(sql.MAX), JSON.stringify(pasos))
      .input('mn', sql.Int, pMin).input('mx', sql.Int, pMax).input('hi', sql.Char(5), hIni).input('hf', sql.Char(5), hFin).input('d', sql.NVarChar(20), dias.join(','))
      .query(`UPDATE dbo.WA_MASIVO_CAMPANIAS SET WMP_NOMBRE = @n, WMP_PASOS = @p, WMP_PAUSA_MIN = @mn, WMP_PAUSA_MAX = @mx,
                WMP_HORA_INICIO = @hi, WMP_HORA_FIN = @hf, WMP_DIAS = @d WHERE WMP_ID = @id`);
    res.json({ success: true, data: await leerCampania(pool, id) });
  } catch (e) { responderError(res, e, 'guardarCampania'); }
};

// POST /campanias/:id/destinatarios — { filas: [{ telefono, nombre, variables }] }
// Normaliza (lada 52 si traen 10 dígitos), descarta inválidos y repetidos.
exports.agregarDestinatarios = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    const c = (await pool.request().input('id', sql.Int, id).query('SELECT WMP_ESTADO e FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ID = @id')).recordset[0];
    if (!c) throw err(404, 'Campaña no encontrada');
    if (['terminada', 'cancelada'].includes(c.e)) throw err(409, 'La campaña ya terminó');
    const filas = Array.isArray(req.body?.filas) ? req.body.filas.slice(0, 50000) : [];
    let invalidos = 0;
    const vistos = new Set();
    const limpias = [];
    for (const f of filas) {
      const tel = wa.normalizarTelefono(f?.telefono);
      if (!tel) { invalidos++; continue; }
      if (vistos.has(tel)) continue;
      vistos.add(tel);
      const vars = f?.variables && typeof f.variables === 'object' ? f.variables : {};
      limpias.push({ t: tel, n: String(f?.nombre || '').trim().slice(0, 150) || null, v: Object.keys(vars).length ? JSON.stringify(vars).slice(0, 4000) : null });
    }
    let agregados = 0;
    for (let i = 0; i < limpias.length; i += 1000) {
      const lote = limpias.slice(i, i + 1000);
      const r = await pool.request().input('id', sql.Int, id).input('j', sql.NVarChar(sql.MAX), JSON.stringify(lote)).query(`
        INSERT INTO dbo.WA_MASIVO_DESTINATARIOS (WMD_CAMPANIA_ID, WMD_TELEFONO, WMD_NOMBRE, WMD_VARIABLES)
        SELECT @id, j.t, j.n, j.v FROM OPENJSON(@j) WITH (t NVARCHAR(20), n NVARCHAR(150), v NVARCHAR(4000)) j
        WHERE NOT EXISTS (SELECT 1 FROM dbo.WA_MASIVO_DESTINATARIOS d WHERE d.WMD_CAMPANIA_ID = @id AND d.WMD_TELEFONO = j.t);
        SELECT @@ROWCOUNT AS n;`);
      agregados += r.recordset[0]?.n ?? 0;
    }
    res.json({ success: true, data: { recibidos: filas.length, agregados, repetidos: filas.length - invalidos - agregados, invalidos } });
  } catch (e) { responderError(res, e, 'agregarDestinatarios'); }
};

// DELETE /campanias/:id/destinatarios — quita los que aún no reciben nada.
exports.quitarPendientes = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const r = await pool.request().input('id', sql.Int, idDe(req.params.id))
      .query("DELETE FROM dbo.WA_MASIVO_DESTINATARIOS WHERE WMD_CAMPANIA_ID = @id AND WMD_ESTADO = 'pendiente'");
    res.json({ success: true, data: { quitados: r.rowsAffected[0] } });
  } catch (e) { responderError(res, e, 'quitarPendientes'); }
};

// POST /campanias/:id/estado — { accion: iniciar | pausar | reanudar | cancelar }
exports.cambiarEstado = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    const c = (await pool.request().input('id', sql.Int, id).query('SELECT * FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ID = @id')).recordset[0];
    if (!c) throw err(404, 'Campaña no encontrada');
    const accion = String(req.body?.accion || '');
    const pasar = { iniciar: ['borrador', 'enviando'], pausar: ['enviando', 'pausada'], reanudar: ['pausada', 'enviando'] };
    if (accion === 'cancelar') {
      if (['terminada', 'cancelada'].includes(c.WMP_ESTADO)) throw err(409, 'La campaña ya terminó');
      await pool.request().input('id', sql.Int, id).query(`
        UPDATE dbo.WA_MASIVO_CAMPANIAS SET WMP_ESTADO = 'cancelada', WMP_FECHA_FIN = GETDATE() WHERE WMP_ID = @id`);
    } else if (pasar[accion]) {
      const [de, a] = pasar[accion];
      if (c.WMP_ESTADO !== de) throw err(409, `No se puede ${accion} una campaña ${c.WMP_ESTADO}`);
      if (a === 'enviando') {
        let pasos = [];
        try { pasos = JSON.parse(c.WMP_PASOS || '[]'); } catch (_) { pasos = []; }
        const p = problemasPasos(pasos);
        if (p) throw err(400, p);
        const n = (await pool.request().input('id', sql.Int, id)
          .query("SELECT COUNT(*) n FROM dbo.WA_MASIVO_DESTINATARIOS WHERE WMD_CAMPANIA_ID = @id AND WMD_ESTADO IN ('pendiente', 'en_cadena')")).recordset[0].n;
        if (!n) throw err(400, 'No hay números por enviar en esta campaña');
      }
      await pool.request().input('id', sql.Int, id).input('e', sql.NVarChar(20), a)
        .query(`UPDATE dbo.WA_MASIVO_CAMPANIAS SET WMP_ESTADO = @e, WMP_FECHA_INICIO = ISNULL(WMP_FECHA_INICIO, CASE WHEN @e = 'enviando' THEN GETDATE() END) WHERE WMP_ID = @id`);
    } else {
      throw err(400, 'Acción inválida');
    }
    auditar(req, pool, `wa-masivo-${accion}-campania`, id, null);
    res.json({ success: true, data: await leerCampania(pool, id) });
  } catch (e) { responderError(res, e, 'cambiarEstado'); }
};

// DELETE /campanias/:id — solo un borrador.
exports.eliminarCampania = async (req, res) => {
  try {
    const id = idDe(req.params.id);
    const pool = await poolDe(req);
    const c = (await pool.request().input('id', sql.Int, id).query('SELECT WMP_ESTADO e FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ID = @id')).recordset[0];
    if (!c) throw err(404, 'Campaña no encontrada');
    if (c.e !== 'borrador') throw err(409, 'Solo se puede borrar una campaña que no ha empezado (si ya envió, cancélala)');
    await pool.request().input('id', sql.Int, id).query(`
      DELETE FROM dbo.WA_MASIVO_DESTINATARIOS WHERE WMD_CAMPANIA_ID = @id;
      DELETE FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ID = @id;`);
    res.json({ success: true });
  } catch (e) { responderError(res, e, 'eliminarCampania'); }
};
