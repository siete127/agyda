// WhatsApp masivo (solo envío) — varias cuentas de WhatsApp (Baileys, NO
// oficial) que se turnan para mandar una CADENA de mensajes (texto, imagen,
// video o documento, cada paso con su espera antes del siguiente) a una lista
// de números cargada desde Excel o a mano.
//
// Reglas:
//  - Las cuentas son aparte de los canales de chat del Contact Center (otro
//    número, otra sesión): si a una la banea WhatsApp, el chat no se entera.
//  - Un número que ya recibió mensajes de una cuenta SIEMPRE sigue con esa
//    cuenta (WA_MASIVO_ASIGNACION), en esta campaña y en las siguientes. Si
//    esa cuenta se desconecta, el número espera; nunca se pasa a otra solo.
//  - Ritmo humano por cuenta: pausa aleatoria entre envíos, tope diario (con
//    calentamiento para cuentas nuevas), horario y días de la campaña. Cada
//    cuenta trabaja en paralelo con las demás.
//  - Si una cuenta acumula 3 envíos fallidos seguidos se pausa sola.
//  - Solo envío: lo que respondan esos números no se registra en ningún lado.
//
// Sesiones en memoria (como baileysManager); credenciales en disco en
// baileys_sessions/masivo_<empresa>_<cuenta>/ para reconectar sin QR.
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const sql = require('mssql');
const logger = global.logger || require('../../utils/logger');
const databaseService = require('../databaseService');
const { normalizarTelefono } = require('../crmWhatsappService');

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'baileys_sessions');
const ARCHIVOS_DIR = process.env.CC_MEDIA_DIR
  ? path.join(process.env.CC_MEDIA_DIR, '../wa-masivo')
  : path.join(__dirname, '..', '..', 'public', 'uploads', 'wa-masivo');
fs.mkdirSync(ARCHIVOS_DIR, { recursive: true });

const TIPOS_PASO = ['texto', 'imagen', 'video', 'documento'];
const FALLOS_PARA_PAUSAR = 3;
const deshabilitado = () => process.env.BAILEYS_DISABLE_AUTORECONNECT === '1';

// ── Tablas ────────────────────────────────────────────────────────────────
const conTablas = new Set();
async function asegurarTablas(pool) {
  if (conTablas.has(pool)) return;
  await pool.request().query(`
    IF OBJECT_ID('dbo.WA_MASIVO_CUENTAS', 'U') IS NULL
      CREATE TABLE dbo.WA_MASIVO_CUENTAS (
        WMC_ID             INT IDENTITY(1,1) PRIMARY KEY,
        WMC_ALIAS          NVARCHAR(80) NOT NULL,
        WMC_NUMERO         NVARCHAR(40) NULL,
        WMC_ESTADO         NVARCHAR(20) NOT NULL DEFAULT 'desconectado',
        WMC_ACTIVA         BIT NOT NULL DEFAULT 1,
        WMC_TOPE_DIARIO    INT NOT NULL DEFAULT 200,
        WMC_CALENTAMIENTO  BIT NOT NULL DEFAULT 1,
        WMC_PAUSA_MOTIVO   NVARCHAR(300) NULL,
        WMC_FECHA_ALTA     DATETIME NOT NULL DEFAULT GETDATE(),
        WMC_FECHA_CONEXION DATETIME NULL,
        WMC_ELIMINADA      BIT NOT NULL DEFAULT 0
      );
    IF OBJECT_ID('dbo.WA_MASIVO_ARCHIVOS', 'U') IS NULL
      CREATE TABLE dbo.WA_MASIVO_ARCHIVOS (
        WMA_ID      INT IDENTITY(1,1) PRIMARY KEY,
        WMA_NOMBRE  NVARCHAR(260) NOT NULL,
        WMA_MIME    NVARCHAR(120) NULL,
        WMA_ARCHIVO NVARCHAR(260) NOT NULL,
        WMA_TAMANO  INT NULL,
        WMA_FECHA   DATETIME NOT NULL DEFAULT GETDATE()
      );
    IF OBJECT_ID('dbo.WA_MASIVO_CAMPANIAS', 'U') IS NULL
      CREATE TABLE dbo.WA_MASIVO_CAMPANIAS (
        WMP_ID           INT IDENTITY(1,1) PRIMARY KEY,
        WMP_NOMBRE       NVARCHAR(150) NOT NULL,
        WMP_ESTADO       NVARCHAR(20) NOT NULL DEFAULT 'borrador',
        WMP_PASOS        NVARCHAR(MAX) NULL,
        WMP_PAUSA_MIN    INT NOT NULL DEFAULT 20,
        WMP_PAUSA_MAX    INT NOT NULL DEFAULT 45,
        WMP_HORA_INICIO  CHAR(5) NOT NULL DEFAULT '09:00',
        WMP_HORA_FIN     CHAR(5) NOT NULL DEFAULT '19:00',
        WMP_DIAS         NVARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6',
        WMP_CREADO_POR   INT NULL,
        WMP_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
        WMP_FECHA_INICIO DATETIME NULL,
        WMP_FECHA_FIN    DATETIME NULL
      );
    IF OBJECT_ID('dbo.WA_MASIVO_DESTINATARIOS', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.WA_MASIVO_DESTINATARIOS (
        WMD_ID           INT IDENTITY(1,1) PRIMARY KEY,
        WMD_CAMPANIA_ID  INT NOT NULL,
        WMD_TELEFONO     NVARCHAR(20) NOT NULL,
        WMD_NOMBRE       NVARCHAR(150) NULL,
        WMD_VARIABLES    NVARCHAR(MAX) NULL,
        WMD_JID          NVARCHAR(80) NULL,
        WMD_CUENTA_ID    INT NULL,
        WMD_PASO         INT NOT NULL DEFAULT 0,
        WMD_PROXIMO      DATETIME NULL,
        WMD_ESTADO       NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
        WMD_ERROR        NVARCHAR(300) NULL,
        WMD_FECHA_ULTIMO DATETIME NULL,
        CONSTRAINT UQ_WA_MASIVO_DEST UNIQUE (WMD_CAMPANIA_ID, WMD_TELEFONO)
      );
      CREATE INDEX IX_WA_MASIVO_DEST_TRABAJO ON dbo.WA_MASIVO_DESTINATARIOS (WMD_ESTADO, WMD_CUENTA_ID, WMD_PROXIMO);
    END
    IF OBJECT_ID('dbo.WA_MASIVO_ASIGNACION', 'U') IS NULL
      CREATE TABLE dbo.WA_MASIVO_ASIGNACION (
        WMS_TELEFONO  NVARCHAR(20) NOT NULL PRIMARY KEY,
        WMS_CUENTA_ID INT NOT NULL,
        WMS_FECHA     DATETIME NOT NULL DEFAULT GETDATE()
      );
    IF OBJECT_ID('dbo.WA_MASIVO_ENVIOS', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.WA_MASIVO_ENVIOS (
        WME_ID        BIGINT IDENTITY(1,1) PRIMARY KEY,
        WME_DEST_ID   INT NOT NULL,
        WME_CUENTA_ID INT NOT NULL,
        WME_PASO      INT NOT NULL,
        WME_OK        BIT NOT NULL,
        WME_ERROR     NVARCHAR(300) NULL,
        WME_MSG_ID    NVARCHAR(80) NULL,
        WME_FECHA     DATETIME NOT NULL DEFAULT GETDATE()
      );
      CREATE INDEX IX_WA_MASIVO_ENVIOS_CUENTA ON dbo.WA_MASIVO_ENVIOS (WME_CUENTA_ID, WME_FECHA);
    END`);
  conTablas.add(pool);
}
async function hayTablas(pool) {
  if (conTablas.has(pool)) return true;
  const r = await pool.request().query("SELECT OBJECT_ID('dbo.WA_MASIVO_ENVIOS', 'U') AS t");
  if (!r.recordset[0].t) return false;
  conTablas.add(pool);
  return true;
}

// Tope del día: con calentamiento, una cuenta recién vinculada arranca baja y
// sube 20 por día hasta su tope configurado (WhatsApp desconfía de números
// nuevos que de golpe mandan cientos de mensajes).
function topeEfectivo(c) {
  const tope = Math.max(1, Number(c.WMC_TOPE_DIARIO) || 1);
  if (!c.WMC_CALENTAMIENTO || !c.WMC_FECHA_CONEXION) return tope;
  const dias = Math.max(0, Math.floor((Date.now() - new Date(c.WMC_FECHA_CONEXION).getTime()) / 86_400_000));
  return Math.min(tope, 30 + dias * 20);
}

// ── Sesiones (una por cuenta) ─────────────────────────────────────────────
// sesiones[`${empresa}|${cuentaId}`] = { sock, estado, qrDataUrl, numero }
const sesiones = {};
const claveDe = (tenantKey, cuentaId) => `${String(tenantKey || '').toLowerCase()}|${cuentaId}`;
function dirDe(tenantKey, cuentaId) {
  const dir = path.join(SESSIONS_DIR, `masivo_${String(tenantKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')}_${cuentaId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const tieneCredenciales = (tenantKey, cuentaId) => {
  try { return fs.existsSync(path.join(dirDe(tenantKey, cuentaId), 'creds.json')); } catch (_) { return false; }
};

async function guardarEstado(tenantKey, cuentaId, campos) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    const r = pool.request().input('id', sql.Int, cuentaId)
      .input('e', sql.NVarChar(20), campos.estado ?? null)
      .input('n', sql.NVarChar(40), campos.numero ?? null)
      .input('con', sql.Bit, campos.conectada ? 1 : 0);
    await r.query(`UPDATE dbo.WA_MASIVO_CUENTAS SET
        WMC_ESTADO = ISNULL(@e, WMC_ESTADO),
        WMC_NUMERO = ISNULL(@n, WMC_NUMERO),
        WMC_FECHA_CONEXION = CASE WHEN @con = 1 AND WMC_FECHA_CONEXION IS NULL THEN GETDATE() ELSE WMC_FECHA_CONEXION END
      WHERE WMC_ID = @id`);
  } catch (e) {
    logger.warn('[wa-masivo] no se pudo guardar el estado de la cuenta:', e?.message || e);
  }
}

async function conectarCuenta(tenantKey, cuentaId) {
  if (deshabilitado()) {
    throw new Error('Este proceso tiene deshabilitada la conexión a WhatsApp (BAILEYS_DISABLE_AUTORECONNECT=1): vincula las cuentas desde el otro entorno.');
  }
  const clave = claveDe(tenantKey, cuentaId);
  const previa = sesiones[clave];
  if (previa?.sock) {
    if (previa.estado === 'conectado') return previa;
    // QR viejo (puede haber caducado): se cierra y se arma uno nuevo.
    try { previa.sock.ev.removeAllListeners(); } catch (_) { /* no-op */ }
    try { previa.sock.end(undefined); } catch (_) { /* no-op */ }
    delete sesiones[clave];
  }

  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
  const { state, saveCreds } = await useMultiFileAuthState(dirDe(tenantKey, cuentaId));
  const { version } = await fetchLatestBaileysVersion();

  sesiones[clave] = { sock: null, estado: 'esperando_qr', qrDataUrl: null, numero: null };
  await guardarEstado(tenantKey, cuentaId, { estado: 'esperando_qr' });

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false });
  sesiones[clave].sock = sock;
  sock.ev.on('creds.update', saveCreds);
  // Solo envío: los mensajes que lleguen a estas cuentas no se procesan.

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    const s = sesiones[clave];
    if (!s) return;
    if (qr) {
      try { s.qrDataUrl = await QRCode.toDataURL(qr); } catch (_) { /* sin QR */ }
      s.estado = 'esperando_qr';
    }
    if (connection === 'open') {
      s.estado = 'conectado';
      s.qrDataUrl = null;
      s.numero = sock.user?.id?.split(':')[0] || null;
      await guardarEstado(tenantKey, cuentaId, { estado: 'conectado', numero: s.numero, conectada: true });
      logger.info(`✅ WhatsApp masivo conectado — cuenta ${clave}, número ${s.numero}`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconectar = code !== DisconnectReason.loggedOut && code !== DisconnectReason.timedOut;
      s.sock = null;
      if (reconectar) {
        setTimeout(() => conectarCuenta(tenantKey, cuentaId).catch(async (e) => {
          logger.error('[wa-masivo] reconexión falló:', e?.message || e);
          if (sesiones[clave]) sesiones[clave].estado = 'desconectado';
          await guardarEstado(tenantKey, cuentaId, { estado: 'desconectado' });
        }), 3000);
      } else {
        // Sesión cerrada desde el teléfono, QR sin escanear o baneo: hay que volver a vincular.
        s.estado = 'desconectado';
        s.qrDataUrl = null;
        await guardarEstado(tenantKey, cuentaId, { estado: 'desconectado' });
        try { fs.rmSync(dirDe(tenantKey, cuentaId), { recursive: true, force: true }); } catch (_) { /* no-op */ }
      }
    }
  });
  registrarEmpresa(tenantKey);
  return sesiones[clave];
}

async function desconectarCuenta(tenantKey, cuentaId) {
  const clave = claveDe(tenantKey, cuentaId);
  const s = sesiones[clave];
  if (s?.sock) {
    try { s.sock.ev.removeAllListeners(); } catch (_) { /* no-op */ }
    try { await s.sock.logout(); } catch (_) { /* ya cerrada */ }
  }
  delete sesiones[clave];
  try { fs.rmSync(dirDe(tenantKey, cuentaId), { recursive: true, force: true }); } catch (_) { /* no-op */ }
  await guardarEstado(tenantKey, cuentaId, { estado: 'desconectado' });
}

function estadoSesion(tenantKey, cuentaId) {
  const s = sesiones[claveDe(tenantKey, cuentaId)];
  if (!s) return { estado: 'desconectado', qrDataUrl: null, numero: null };
  return { estado: s.estado, qrDataUrl: s.estado === 'esperando_qr' ? s.qrDataUrl : null, numero: s.numero };
}

// ── Mensajes ──────────────────────────────────────────────────────────────
function renderTexto(plantilla, vars) {
  return String(plantilla || '').replace(/\{\{\s*([\wáéíóúñ]+)\s*\}\}/gi, (_, k) => {
    const v = vars[String(k).toLowerCase()];
    return v == null ? '' : String(v);
  }).trim();
}
const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function armarContenido(pool, paso, vars) {
  const textos = (Array.isArray(paso.textos) ? paso.textos : []).map((t) => String(t || '').trim()).filter(Boolean);
  const texto = textos.length ? renderTexto(azar(textos), vars) : '';
  if (paso.tipo === 'texto') return { contenido: { text: texto }, texto };
  const a = (await pool.request().input('id', sql.Int, Number(paso.archivoId) || 0)
    .query('SELECT WMA_NOMBRE nombre, WMA_MIME mime, WMA_ARCHIVO archivo FROM dbo.WA_MASIVO_ARCHIVOS WHERE WMA_ID = @id')).recordset[0];
  if (!a) throw new Error('El archivo del paso ya no existe');
  const url = path.join(ARCHIVOS_DIR, a.archivo);
  if (!fs.existsSync(url)) throw new Error('El archivo del paso no está en el servidor');
  if (paso.tipo === 'imagen') return { contenido: { image: { url }, caption: texto || undefined }, texto };
  if (paso.tipo === 'video') return { contenido: { video: { url }, caption: texto || undefined }, texto };
  return { contenido: { document: { url }, mimetype: a.mime || 'application/octet-stream', fileName: a.nombre, caption: texto || undefined }, texto };
}

// ── Motor ─────────────────────────────────────────────────────────────────
const empresas = new Set();          // empresas con algo del masivo
const estadoCuenta = {};             // por clave: { ocupada, proximoTurno, fallos }
let timer = null;
let corriendo = false;

function registrarEmpresa(tenantKey) {
  empresas.add(String(tenantKey || '').toLowerCase());
  if (!timer && !deshabilitado()) timer = setInterval(tick, 3000);
}

function enHorario(c, ahora = new Date()) {
  const dias = String(c.WMP_DIAS || '').split(',').map((d) => Number(d.trim()));
  if (!dias.includes(ahora.getDay())) return false;
  const hm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  return hm >= String(c.WMP_HORA_INICIO).slice(0, 5) && hm < String(c.WMP_HORA_FIN).slice(0, 5);
}

async function tick() {
  if (corriendo) return;
  corriendo = true;
  try {
    for (const t of empresas) {
      try { await tickEmpresa(t); } catch (e) { logger.warn(`[wa-masivo] tick (${t}):`, e?.message || e); }
    }
  } finally {
    corriendo = false;
  }
}

async function tickEmpresa(tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  if (!(await hayTablas(pool))) return;
  const camps = (await pool.request().query("SELECT * FROM dbo.WA_MASIVO_CAMPANIAS WHERE WMP_ESTADO = 'enviando'")).recordset;
  if (!camps.length) return;

  // Campañas sin nada pendiente: terminadas.
  await pool.request().query(`
    UPDATE c SET WMP_ESTADO = 'terminada', WMP_FECHA_FIN = GETDATE()
    FROM dbo.WA_MASIVO_CAMPANIAS c
    WHERE c.WMP_ESTADO = 'enviando'
      AND NOT EXISTS (SELECT 1 FROM dbo.WA_MASIVO_DESTINATARIOS d WHERE d.WMD_CAMPANIA_ID = c.WMP_ID AND d.WMD_ESTADO IN ('pendiente', 'en_cadena'))`);

  const abiertas = camps.filter((c) => enHorario(c));
  if (!abiertas.length) return;
  const porId = new Map(abiertas.map((c) => [c.WMP_ID, c]));
  const cuentas = (await pool.request().query(`
    SELECT c.*, (SELECT COUNT(*) FROM dbo.WA_MASIVO_ENVIOS e
                 WHERE e.WME_CUENTA_ID = c.WMC_ID AND e.WME_OK = 1 AND e.WME_FECHA >= CAST(GETDATE() AS date)) AS enviadosHoy
    FROM dbo.WA_MASIVO_CUENTAS c
    WHERE c.WMC_ACTIVA = 1 AND c.WMC_ELIMINADA = 0 AND c.WMC_PAUSA_MOTIVO IS NULL`)).recordset;

  for (const cuenta of cuentas) {
    const clave = claveDe(tenantKey, cuenta.WMC_ID);
    const s = sesiones[clave];
    if (!s?.sock || s.estado !== 'conectado') continue;
    const st = estadoCuenta[clave] || (estadoCuenta[clave] = { ocupada: false, proximoTurno: 0, fallos: 0 });
    if (st.ocupada || Date.now() < st.proximoTurno) continue;
    if (cuenta.enviadosHoy >= topeEfectivo(cuenta)) continue;
    st.ocupada = true;
    // Sin await: cada cuenta envía en paralelo con las demás.
    trabajarCuenta(pool, cuenta, s, st, porId)
      .catch((e) => logger.warn(`[wa-masivo] cuenta ${clave}:`, e?.message || e))
      .finally(() => { st.ocupada = false; });
  }
}

// Toma el siguiente trabajo de una cuenta: primero el siguiente paso de una
// cadena que ya lleva (si ya le toca), si no, un número nuevo (los asignados a
// ella primero; los que no tienen cuenta, para quien los tome — así se turnan).
async function trabajarCuenta(pool, cuenta, s, st, porId) {
  const ids = [...porId.keys()].join(',');
  let d = (await pool.request().input('c', sql.Int, cuenta.WMC_ID).query(`
    SELECT TOP 1 * FROM dbo.WA_MASIVO_DESTINATARIOS
    WHERE WMD_CUENTA_ID = @c AND WMD_ESTADO = 'en_cadena' AND WMD_PROXIMO <= GETDATE() AND WMD_CAMPANIA_ID IN (${ids})
    ORDER BY WMD_PROXIMO`)).recordset[0];

  if (!d) {
    // Tomarlo es atómico (UPDATE sobre el CTE): dos cuentas nunca agarran el mismo.
    d = (await pool.request().input('c', sql.Int, cuenta.WMC_ID).query(`
      ;WITH x AS (
        SELECT TOP 1 d.* FROM dbo.WA_MASIVO_DESTINATARIOS d
        LEFT JOIN dbo.WA_MASIVO_ASIGNACION a ON a.WMS_TELEFONO = d.WMD_TELEFONO
        WHERE d.WMD_ESTADO = 'pendiente' AND d.WMD_CAMPANIA_ID IN (${ids})
          AND (a.WMS_CUENTA_ID IS NULL OR a.WMS_CUENTA_ID = @c)
        ORDER BY CASE WHEN a.WMS_CUENTA_ID = @c THEN 0 ELSE 1 END, d.WMD_ID)
      UPDATE x SET WMD_ESTADO = 'en_cadena', WMD_CUENTA_ID = @c, WMD_PROXIMO = GETDATE()
      OUTPUT inserted.*`)).recordset[0];
    if (!d) return;
    // Asignación fija número → cuenta. Si otra cuenta lo ganó al mismo tiempo, se le devuelve.
    const a = (await pool.request().input('t', sql.NVarChar(20), d.WMD_TELEFONO).input('c', sql.Int, cuenta.WMC_ID).query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.WA_MASIVO_ASIGNACION WHERE WMS_TELEFONO = @t)
        INSERT INTO dbo.WA_MASIVO_ASIGNACION (WMS_TELEFONO, WMS_CUENTA_ID) VALUES (@t, @c);
      SELECT WMS_CUENTA_ID AS cuenta FROM dbo.WA_MASIVO_ASIGNACION WHERE WMS_TELEFONO = @t`)).recordset[0];
    if (a && a.cuenta !== cuenta.WMC_ID) {
      await pool.request().input('id', sql.Int, d.WMD_ID).input('c', sql.Int, a.cuenta)
        .query('UPDATE dbo.WA_MASIVO_DESTINATARIOS SET WMD_CUENTA_ID = @c WHERE WMD_ID = @id');
      return;
    }
  }

  const camp = porId.get(d.WMD_CAMPANIA_ID);
  let pasos = [];
  try { pasos = JSON.parse(camp?.WMP_PASOS || '[]'); } catch (_) { pasos = []; }
  const paso = pasos[d.WMD_PASO];
  const marcar = (estado, extra = {}) => pool.request().input('id', sql.Int, d.WMD_ID)
    .input('e', sql.NVarChar(20), estado).input('err', sql.NVarChar(300), extra.error ? String(extra.error).slice(0, 300) : null)
    .input('paso', sql.Int, extra.paso ?? d.WMD_PASO).input('seg', sql.Int, extra.esperaSeg ?? null).input('jid', sql.NVarChar(80), extra.jid ?? null)
    .query(`UPDATE dbo.WA_MASIVO_DESTINATARIOS SET WMD_ESTADO = @e, WMD_ERROR = @err, WMD_PASO = @paso,
              WMD_PROXIMO = CASE WHEN @seg IS NULL THEN WMD_PROXIMO ELSE DATEADD(second, @seg, GETDATE()) END,
              WMD_JID = ISNULL(@jid, WMD_JID), WMD_FECHA_ULTIMO = GETDATE() WHERE WMD_ID = @id`);
  if (!paso) { await marcar('completado'); return; }

  // Antes del primer mensaje: ¿ese número tiene WhatsApp?
  let jid = d.WMD_JID;
  if (!jid) {
    const r = await s.sock.onWhatsApp(d.WMD_TELEFONO).catch(() => null);
    const e = Array.isArray(r) ? r[0] : null;
    if (!e?.exists) {
      await marcar('excluido', { error: 'El número no tiene WhatsApp' });
      // Nunca se le escribió: no queda amarrado a esta cuenta.
      await pool.request().input('t', sql.NVarChar(20), d.WMD_TELEFONO).query(`
        DELETE FROM dbo.WA_MASIVO_ASIGNACION WHERE WMS_TELEFONO = @t AND NOT EXISTS (
          SELECT 1 FROM dbo.WA_MASIVO_ENVIOS e JOIN dbo.WA_MASIVO_DESTINATARIOS x ON x.WMD_ID = e.WME_DEST_ID
          WHERE x.WMD_TELEFONO = @t AND e.WME_OK = 1)`);
      st.proximoTurno = Date.now() + 2000;
      return;
    }
    jid = e.jid;
  }

  let vars = {};
  try { vars = JSON.parse(d.WMD_VARIABLES || '{}'); } catch (_) { vars = {}; }
  vars = { ...vars, nombre: d.WMD_NOMBRE || vars.nombre || '', telefono: d.WMD_TELEFONO };

  try {
    const { contenido, texto } = await armarContenido(pool, paso, vars);
    // Como persona: "escribiendo…" unos segundos antes de un texto.
    if (paso.tipo === 'texto') {
      await s.sock.sendPresenceUpdate('composing', jid).catch(() => {});
      await esperar(Math.min(4000, 800 + texto.length * 40));
      await s.sock.sendPresenceUpdate('paused', jid).catch(() => {});
    }
    const r = await s.sock.sendMessage(jid, contenido);
    await pool.request().input('d', sql.Int, d.WMD_ID).input('c', sql.Int, cuenta.WMC_ID).input('p', sql.Int, d.WMD_PASO)
      .input('m', sql.NVarChar(80), r?.key?.id || null)
      .query('INSERT INTO dbo.WA_MASIVO_ENVIOS (WME_DEST_ID, WME_CUENTA_ID, WME_PASO, WME_OK, WME_MSG_ID) VALUES (@d, @c, @p, 1, @m)');
    const siguiente = d.WMD_PASO + 1;
    if (siguiente < pasos.length) await marcar('en_cadena', { paso: siguiente, esperaSeg: Math.max(0, Number(paso.esperaSeg) || 0), jid });
    else await marcar('completado', { paso: siguiente, jid });
    st.fallos = 0;
  } catch (e) {
    const msg = e?.message || String(e);
    await pool.request().input('d', sql.Int, d.WMD_ID).input('c', sql.Int, cuenta.WMC_ID).input('p', sql.Int, d.WMD_PASO)
      .input('err', sql.NVarChar(300), msg.slice(0, 300))
      .query('INSERT INTO dbo.WA_MASIVO_ENVIOS (WME_DEST_ID, WME_CUENTA_ID, WME_PASO, WME_OK, WME_ERROR) VALUES (@d, @c, @p, 0, @err)');
    // Un reintento en 5 minutos; si vuelve a fallar, el número queda como fallido.
    if (d.WMD_ERROR) await marcar('fallido', { error: msg, jid });
    else await marcar('en_cadena', { error: msg, esperaSeg: 300, jid });
    st.fallos++;
    if (st.fallos >= FALLOS_PARA_PAUSAR) {
      await pool.request().input('id', sql.Int, cuenta.WMC_ID)
        .input('m', sql.NVarChar(300), `Se pausó sola: ${FALLOS_PARA_PAUSAR} envíos seguidos fallaron (${msg.slice(0, 200)})`)
        .query('UPDATE dbo.WA_MASIVO_CUENTAS SET WMC_PAUSA_MOTIVO = @m WHERE WMC_ID = @id');
      st.fallos = 0;
      logger.warn(`[wa-masivo] cuenta ${cuenta.WMC_ID} pausada por fallos seguidos`);
    }
  }
  // Pausa humana aleatoria antes de que esta cuenta mande el siguiente.
  const min = Math.max(5, Number(camp?.WMP_PAUSA_MIN) || 20);
  const max = Math.max(min, Number(camp?.WMP_PAUSA_MAX) || 45);
  st.proximoTurno = Date.now() + (min + Math.random() * (max - min)) * 1000;
}

// Al arrancar el backend (lo llama baileysManager.reconectarSesionesGuardadas):
// reconecta las cuentas que ya tenían sesión y prende el motor.
async function arrancar() {
  if (deshabilitado()) return;
  try {
    const { listTenants } = require('../../config/tenants');
    for (const { key } of listTenants()) {
      let pool;
      try { pool = await databaseService.getPool(key); } catch (_) { continue; }
      if (!(await hayTablas(pool))) continue;
      registrarEmpresa(key);
      const cuentas = (await pool.request().query('SELECT WMC_ID id FROM dbo.WA_MASIVO_CUENTAS WHERE WMC_ELIMINADA = 0 AND WMC_ACTIVA = 1')).recordset;
      let n = 0;
      for (const c of cuentas) {
        if (!tieneCredenciales(key, c.id)) continue;
        n++;
        conectarCuenta(key, c.id).catch((e) => logger.error(`[wa-masivo] reconexión al arrancar (cuenta ${c.id}):`, e?.message || e));
      }
      if (n) logger.info(`✅ WhatsApp masivo: reconectando ${n} cuenta(s) (empresa ${key})`);
    }
  } catch (e) {
    logger.error('[wa-masivo] arrancar falló:', e?.message || e);
  }
}

module.exports = {
  ARCHIVOS_DIR, TIPOS_PASO,
  asegurarTablas, hayTablas, topeEfectivo, enHorario,
  conectarCuenta, desconectarCuenta, estadoSesion, registrarEmpresa,
  normalizarTelefono, arrancar,
  // Solo para pruebas (sesiones simuladas, sin WhatsApp real).
  _pruebas: { sesiones, claveDe, trabajarCuenta },
};
