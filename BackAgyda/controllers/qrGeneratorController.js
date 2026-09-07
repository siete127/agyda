const sql = require('mssql');
const crypto = require('crypto');
const QRCode = require('qrcode');
const databaseService = require('../services/databaseService');
const { ensureQrCodesSchema } = require('../services/schemaService');

function esAdmin(req) {
  return ['AD', 'TI'].includes(String(req.user?.tipoUsuario || '').toUpperCase());
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }

const ENTORNOS_VALIDOS = ['publico', 'privado'];
const MODOS_VALIDOS = ['url', 'llamada_directa', 'llamada_medible'];

// Portado de qr_campaign_service.normalize_did — acepta espacios/paréntesis/
// guiones y un '+' inicial opcional; exige entre 3 y 20 dígitos reales.
function normalizarDid(valor) {
  const raw = String(valor || '').trim();
  const conMas = raw.startsWith('+');
  const digitos = raw.replace(/\D/g, '');
  if (digitos.length < 3 || digitos.length > 20) {
    throw new Error('El número (DID) debe contener entre 3 y 20 dígitos.');
  }
  return (conMas ? '+' : '') + digitos;
}

function publicBaseUrl() {
  const base = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '').trim().replace(/\/$/, '');
  return base || null;
}

// Anonimiza la IP con HMAC (mismo enfoque que anonymize_ip en Python) — nunca
// se guarda la IP real, solo un hash irreversible con el secreto del proyecto.
function anonimizarIp(ip) {
  const secreto = process.env.JWT_SECRET || '';
  if (!secreto) return null;
  return crypto.createHmac('sha256', secreto).update(String(ip || '')).digest('hex');
}

function familiaDispositivo(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android';
  if (['windows', 'macintosh', 'linux', 'cros'].some((s) => ua.includes(s))) return 'Escritorio';
  return 'Otro dispositivo';
}

// Ventanas de deduplicación por tipo de evento (segundos) — mismo criterio
// que _EVENT_DEDUPE_SECONDS en Python: un mismo visitante no cuenta dos
// veces el mismo evento si vuelve a disparar la landing en ese lapso.
const DEDUPE_SEG = { VIEW: 300, CALL_INTENT: 30, CALL_CONFIRMED: 300, CALL_NOT_COMPLETED: 300 };

function mapRow(row) {
  return {
    id: row.id, nombre: row.nombre, url: row.url, entorno: row.entorno,
    modo: row.modo || 'url', did: row.did || null,
    publicToken: row.publicToken || null,
    landingUrl: row.publicToken ? `${publicBaseUrl() || ''}/q/${row.publicToken}` : null,
    imagenDataUrl: row.imagenDataUrl, autorNombre: row.autorNombre, fechaCreacion: row.fechaCreacion,
  };
}

// Admin — genera un QR (PNG en base64) y lo guarda en el historial.
// modo='url' (default): el QR codifica la URL tal cual, como siempre.
// modo='llamada_directa': el QR codifica "tel:{did}" — al escanear, el
//   teléfono ofrece marcar directo, sin pasar por ningún servidor.
// modo='llamada_medible': el QR apunta a la landing pública /q/{token}, que
//   registra el recorrido (vio → abrió el marcador → confirmó si llamó)
//   antes de ofrecer el tel:. Requiere PUBLIC_BASE_URL configurado con una
//   URL alcanzable desde el teléfono (no localhost).
exports.generar = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { nombre, url, entorno, modo, did } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, message: 'Falta el nombre' });
    }
    const modoNorm = MODOS_VALIDOS.includes(modo) ? modo : 'url';
    const entornoNorm = ENTORNOS_VALIDOS.includes(entorno) ? entorno : 'publico';

    let urlLimpia = null, didNorm = null, publicToken = null, targetQr = null;

    if (modoNorm === 'url') {
      if (!url || !/^https?:\/\//i.test(String(url).trim())) {
        return res.status(400).json({ success: false, message: 'URL inválida (debe empezar con http:// o https://)' });
      }
      urlLimpia = String(url).trim();
      targetQr = urlLimpia;
    } else {
      didNorm = normalizarDid(did);
      urlLimpia = `tel:${didNorm}`; // se guarda también en QR_URL para que el historial siga mostrando "a dónde apunta"
      if (modoNorm === 'llamada_directa') {
        targetQr = `tel:${didNorm}`;
      } else {
        const base = publicBaseUrl();
        if (!base) {
          return res.status(400).json({ success: false, message: 'El QR medible necesita PUBLIC_BASE_URL configurado con una URL HTTPS accesible desde el teléfono.' });
        }
        publicToken = crypto.randomBytes(16).toString('hex'); // 32 hex chars
        targetQr = `${base}/q/${publicToken}`;
      }
    }

    const dataUrl = await QRCode.toDataURL(targetQr, { width: 512, margin: 2, errorCorrectionLevel: 'M' });

    const p = await pool(req);
    await ensureQrCodesSchema(p);
    const ins = await p.request()
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .input('url', sql.NVarChar, urlLimpia)
      .input('entorno', sql.NVarChar, entornoNorm)
      .input('modo', sql.NVarChar, modoNorm)
      .input('did', sql.NVarChar, didNorm)
      .input('token', sql.Char(32), publicToken)
      .input('imagen', sql.NVarChar(sql.MAX), dataUrl)
      .input('autorId', sql.Int, req.user?.id ?? null)
      .input('autorNombre', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .query(`
        INSERT INTO dbo.INTRANET_QR_CODES (QR_NOMBRE, QR_URL, QR_ENTORNO, QR_MODO, QR_DID, QR_PUBLIC_TOKEN, QR_IMAGEN_DATAURL, QR_AUTOR_ID, QR_AUTOR_NOMBRE)
        OUTPUT INSERTED.QR_ID as id, INSERTED.QR_FECHA_CREACION as fechaCreacion
        VALUES (@nombre, @url, @entorno, @modo, @did, @token, @imagen, @autorId, @autorNombre)
      `);

    const row = ins.recordset[0];
    res.status(201).json({
      success: true,
      data: mapRow({
        id: row.id, nombre: String(nombre).trim(), url: urlLimpia, entorno: entornoNorm,
        modo: modoNorm, did: didNorm, publicToken,
        imagenDataUrl: dataUrl, autorNombre: req.user?.nombre || req.user?.username || null,
        fechaCreacion: row.fechaCreacion,
      }),
    });
  } catch (e) {
    res.status(e.message?.includes('DID') ? 400 : 500).json({ success: false, message: e.message });
  }
};

// Admin — lista el historial de QRs generados, más recientes primero.
exports.listar = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await ensureQrCodesSchema(p);
    const r = await p.request().query(`
      SELECT QR_ID as id, QR_NOMBRE as nombre, QR_URL as url, QR_ENTORNO as entorno,
             QR_MODO as modo, QR_DID as did, QR_PUBLIC_TOKEN as publicToken,
             QR_IMAGEN_DATAURL as imagenDataUrl, QR_AUTOR_NOMBRE as autorNombre,
             QR_FECHA_CREACION as fechaCreacion
      FROM dbo.INTRANET_QR_CODES
      ORDER BY QR_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: r.recordset.map(mapRow) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Admin — elimina un QR del historial (sus eventos se borran en cascada).
exports.eliminar = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.INTRANET_QR_CODES WHERE QR_ID = @id');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Admin — resumen de conversión de un QR medible: visitantes únicos, cuántos
// abrieron el marcador, cuántos confirmaron que llamaron.
exports.analytics = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const qrId = Number(req.params.id);
    const r = await p.request().input('id', sql.Int, qrId).query(`
      WITH recorridos AS (
        SELECT EVT_VISITANTE_ID as visitanteId,
               MAX(CASE WHEN EVT_TIPO = 'VIEW' THEN 1 ELSE 0 END) as vio,
               MAX(CASE WHEN EVT_TIPO = 'CALL_INTENT' THEN 1 ELSE 0 END) as intento,
               MAX(CASE WHEN EVT_TIPO = 'CALL_CONFIRMED' THEN 1 ELSE 0 END) as confirmo,
               MAX(CASE WHEN EVT_TIPO = 'CALL_NOT_COMPLETED' THEN 1 ELSE 0 END) as noCompleto
        FROM dbo.INTRANET_QR_EVENTOS WHERE EVT_QR_ID = @id GROUP BY EVT_VISITANTE_ID
      )
      SELECT COALESCE(SUM(vio), 0) as visitantesUnicos,
             COALESCE(SUM(intento), 0) as intentosLlamada,
             COALESCE(SUM(confirmo), 0) as llamadasConfirmadas,
             COALESCE(SUM(CASE WHEN vio = 1 AND intento = 0 THEN 1 ELSE 0 END), 0) as soloVieron,
             COALESCE(SUM(noCompleto), 0) as noCompletadas
      FROM recorridos
    `);
    const s = r.recordset[0];
    res.json({
      success: true,
      data: {
        visitantesUnicos: s.visitantesUnicos, intentosLlamada: s.intentosLlamada,
        llamadasConfirmadas: s.llamadasConfirmadas, soloVieron: s.soloVieron, noCompletadas: s.noCompletadas,
        tasaIntento: s.visitantesUnicos ? Math.round((s.intentosLlamada * 100 / s.visitantesUnicos) * 10) / 10 : 0,
        tasaConfirmacion: s.intentosLlamada ? Math.round((s.llamadasConfirmadas * 100 / s.intentosLlamada) * 10) / 10 : 0,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Público (sin auth) — landing del QR medible y sus 3 eventos ──────────

async function getQrPorToken(p, token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  const r = await p.request().input('token', sql.Char(32), token)
    .query(`SELECT QR_ID id, QR_NOMBRE nombre, QR_DID did, QR_URL url FROM dbo.INTRANET_QR_CODES WHERE QR_PUBLIC_TOKEN = @token`);
  return r.recordset[0] || null;
}

// Sin cookie-parser montado globalmente (no vale la pena agregarlo solo para
// esto) — se lee/escribe la cookie a mano desde el header Cookie/Set-Cookie.
function visitanteIdDe(req) {
  const header = String(req.headers.cookie || '');
  const match = header.match(/(?:^|;\s*)qr_visitor_id=([0-9a-f-]{36})/i);
  return match ? match[1] : crypto.randomUUID();
}

async function registrarEvento(p, qrId, visitanteId, tipo, visitanteNombre, req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
  await p.request()
    .input('qr', sql.Int, qrId).input('vis', sql.Char(36), visitanteId).input('tipo', sql.NVarChar(20), tipo)
    .input('nombre', sql.NVarChar(120), visitanteNombre || null).input('ip', sql.Char(64), anonimizarIp(ip))
    .input('ua', sql.NVarChar(500), String(req.headers['user-agent'] || '').slice(0, 500))
    .input('disp', sql.NVarChar(40), familiaDispositivo(req.headers['user-agent']))
    .input('seg', sql.Int, DEDUPE_SEG[tipo])
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.INTRANET_QR_EVENTOS
        WHERE EVT_QR_ID = @qr AND EVT_VISITANTE_ID = @vis AND EVT_TIPO = @tipo
          AND EVT_FECHA >= DATEADD(SECOND, -@seg, GETDATE())
      )
      INSERT INTO dbo.INTRANET_QR_EVENTOS (EVT_QR_ID, EVT_VISITANTE_ID, EVT_TIPO, EVT_VISITANTE_NOMBRE, EVT_IP_HASH, EVT_USER_AGENT, EVT_DISPOSITIVO)
      VALUES (@qr, @vis, @tipo, @nombre, @ip, @ua, @disp)
    `);
}

function setVisitorCookie(res, visitanteId) {
  res.setHeader('Set-Cookie', `qr_visitor_id=${visitanteId}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax; Secure`);
}

// Landing pública: registra VIEW y muestra un botón para abrir el marcador.
exports.landingPublica = async (req, res) => {
  try {
    const p = await pool(req);
    const qr = await getQrPorToken(p, req.params.token);
    if (!qr) return res.status(404).send('<h1>Código QR no válido</h1>');
    const visitanteId = visitanteIdDe(req);
    await registrarEvento(p, qr.id, visitanteId, 'VIEW', null, req);
    setVisitorCookie(res, visitanteId);
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${qr.nombre}</title>
      <style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#fff;display:flex;min-height:100vh;
        align-items:center;justify-content:center;margin:0} .card{background:#1e293b;border-radius:20px;padding:32px;
        text-align:center;max-width:360px} a.btn{display:inline-block;margin-top:20px;background:#7c3aed;color:#fff;
        text-decoration:none;padding:14px 28px;border-radius:14px;font-weight:700}</style></head>
      <body><div class="card"><h1>${qr.nombre}</h1><p>Toca el botón para llamarnos</p>
        <a class="btn" id="callBtn" href="tel:${qr.did}">📞 Llamar ahora</a></div>
      <script>
        document.getElementById('callBtn').addEventListener('click', function () {
          fetch('/api/qr-generator/publico/${req.params.token}/intento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        });
      </script></body></html>`);
  } catch (e) {
    res.status(500).send('<h1>Error</h1>');
  }
};

exports.registrarIntento = async (req, res) => {
  try {
    const p = await pool(req);
    const qr = await getQrPorToken(p, req.params.token);
    if (!qr) return res.status(404).json({ success: false, message: 'Código QR no válido' });
    const visitanteId = visitanteIdDe(req);
    await registrarEvento(p, qr.id, visitanteId, 'CALL_INTENT', req.body?.nombre, req);
    setVisitorCookie(res, visitanteId);
    res.json({ success: true, data: { did: qr.did } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.registrarConfirmacion = async (req, res) => {
  try {
    if (req.body?.completado === undefined) {
      return res.status(400).json({ success: false, message: 'Indica si la llamada fue realizada' });
    }
    const p = await pool(req);
    const qr = await getQrPorToken(p, req.params.token);
    if (!qr) return res.status(404).json({ success: false, message: 'Código QR no válido' });
    const visitanteId = visitanteIdDe(req);
    await registrarEvento(p, qr.id, visitanteId, req.body.completado ? 'CALL_CONFIRMED' : 'CALL_NOT_COMPLETED', req.body?.nombre, req);
    setVisitorCookie(res, visitanteId);
    res.json({ success: true, data: { completado: !!req.body.completado } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Acortador propio: código de 10 caracteres que SIRVE el contenido ─────
// del destino directo (proxy interno), en vez de un redirect 302 — la URL
// en la barra del navegador se queda en el código corto todo el tiempo,
// incluso al recargar la página.
const ALFABETO_CORTO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O/I/l/1 para evitar confusión visual

function generarCodigoCorto() {
  let codigo = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) codigo += ALFABETO_CORTO[bytes[i] % ALFABETO_CORTO.length];
  return codigo;
}

// Admin — crea una URL corta apuntando a `destino` (URL completa http(s), o
// ruta relativa al mismo sitio, ej. '/postulacion-totis/registro').
exports.crearUrlCorta = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { destino, nombre } = req.body || {};
    const destinoLimpio = String(destino || '').trim();
    if (!destinoLimpio) return res.status(400).json({ success: false, message: 'Falta el destino' });
    if (!/^https?:\/\//i.test(destinoLimpio) && !destinoLimpio.startsWith('/')) {
      return res.status(400).json({ success: false, message: 'El destino debe ser una URL completa (http/https) o una ruta que empiece con /' });
    }

    const p = await pool(req);
    await ensureQrCodesSchema(p);

    let codigo, intentos = 0;
    do {
      codigo = generarCodigoCorto();
      const dup = await p.request().input('c', sql.Char(10), codigo).query('SELECT 1 FROM dbo.INTRANET_URLS_CORTAS WHERE UC_CODIGO = @c');
      if (!dup.recordset.length) break;
      intentos++;
    } while (intentos < 5);
    if (intentos >= 5) return res.status(500).json({ success: false, message: 'No se pudo generar un código único, intenta de nuevo' });

    const ins = await p.request()
      .input('codigo', sql.Char(10), codigo).input('destino', sql.NVarChar(1000), destinoLimpio)
      .input('nombre', sql.NVarChar(200), nombre ? String(nombre).trim() : null)
      .input('autorId', sql.Int, req.user?.id ?? null).input('autorNombre', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .query(`
        INSERT INTO dbo.INTRANET_URLS_CORTAS (UC_CODIGO, UC_DESTINO, UC_NOMBRE, UC_AUTOR_ID, UC_AUTOR_NOMBRE)
        OUTPUT INSERTED.UC_ID as id, INSERTED.UC_FECHA_CREACION as fechaCreacion
        VALUES (@codigo, @destino, @nombre, @autorId, @autorNombre)
      `);

    const base = publicBaseUrl() || '';
    res.status(201).json({
      success: true,
      data: { id: ins.recordset[0].id, codigo, destino: destinoLimpio, nombre: nombre || null, url: `${base}/p/${codigo}`, fechaCreacion: ins.recordset[0].fechaCreacion },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listarUrlsCortas = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await ensureQrCodesSchema(p);
    const r = await p.request().query(`
      SELECT UC_ID as id, UC_CODIGO as codigo, UC_DESTINO as destino, UC_NOMBRE as nombre,
             UC_VISITAS as visitas, UC_AUTOR_NOMBRE as autorNombre, UC_FECHA_CREACION as fechaCreacion
      FROM dbo.INTRANET_URLS_CORTAS ORDER BY UC_FECHA_CREACION DESC
    `);
    const base = publicBaseUrl() || '';
    res.json({ success: true, data: r.recordset.map((row) => ({ ...row, url: `${base}/p/${row.codigo}` })) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.eliminarUrlCorta = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.INTRANET_URLS_CORTAS WHERE UC_ID = @id');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Público (sin auth) — resuelve el código y SIRVE el contenido del destino
// directo (proxy interno vía fetch), sin redirect: la barra de direcciones
// del navegador se queda en /p/{codigo} todo el tiempo. Si el destino es una
// ruta relativa (empieza con /), se resuelve contra el propio PUBLIC_BASE_URL
// del sitio (mismo dominio donde vive este backend); si es una URL completa,
// se reenvía tal cual.
exports.resolverUrlCorta = async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '');
    if (!/^[A-Za-z0-9]{10}$/.test(codigo)) return res.status(404).send('Enlace no válido');

    const p = await pool(req);
    const r = await p.request().input('c', sql.Char(10), codigo).query('SELECT UC_ID id, UC_DESTINO destino FROM dbo.INTRANET_URLS_CORTAS WHERE UC_CODIGO = @c');
    const row = r.recordset[0];
    if (!row) return res.status(404).send('Enlace no encontrado');

    p.request().input('id', sql.Int, row.id).query('UPDATE dbo.INTRANET_URLS_CORTAS SET UC_VISITAS = UC_VISITAS + 1 WHERE UC_ID = @id').catch(() => {});

    const destinoUrl = /^https?:\/\//i.test(row.destino) ? row.destino : `${publicBaseUrl() || ''}${row.destino}`;
    if (!destinoUrl) return res.status(500).send('No se pudo resolver el destino (falta PUBLIC_BASE_URL)');

    const upstream = await fetch(destinoUrl);
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    console.error('qrGenerator.resolverUrlCorta:', e.message);
    res.status(500).send('Error al cargar la página');
  }
};
