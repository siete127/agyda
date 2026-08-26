const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const logger = global.logger || require('../utils/logger');

// Todo este router hace fetch server-side a URLs arbitrarias pasadas por
// query string (?u=), sin allowlist de dominios, y reenvía las cookies del
// visitante al destino — requerir sesión reduce la superficie de abuso
// (SSRF / exfiltración de cookies) a solo usuarios ya autenticados.
// Sin consumidor conocido en el frontend actual (FrontAgyda ni intranet-react
// lo usan); se mantiene por compatibilidad pero cerrado a anónimos.
router.use(authenticateToken);

// Diagnostic logger for all /proxy requests (temporarily helpful in production)
router.use((req, res, next) => {
  try {
    const origin = req.headers.origin || req.get('host');
    logger.debug(`[proxy/*] ${req.method} ${req.originalUrl} from=${req.ip || (req.connection && req.connection.remoteAddress)} origin=${origin}`);
  } catch (e) {}
  next();
});

// CORS helper para todas las rutas de proxy: devolver cabeceras que permiten
// que el navegador consuma las respuestas cuando el frontend está en otro origen.
router.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Diagnostic endpoint to verify backend receives requests in production
router.get('/ping', (req, res) => {
  logger.debug('[proxy/ping] incoming request from', req.ip || req.connection && req.connection.remoteAddress);
  res.json({ success: true, route: '/proxy/ping', timestamp: new Date().toISOString() });
});

/**
 * GET /proxy/site?u=<URL-ENCODED-HTML>
 * Simple reverse proxy for HTML pages to allow embedding via same-origin.
 * - Injects a <base> tag pointing to the remote origin so relative assets resolve.
 * - Serves as text/html and omits X-Frame-Options/CSP headers that block framing.
 */
// Match `/site`, `/site/` and variants to avoid 404 from trailing slash
// Also accept the encoded remote URL placed as a path segment: `/proxy/site/<ENCODED>`
router.all('/site*', async (req, res) => {
  logger.debug('[proxy/site] method=', req.method, 'query.u=', !!req.query.u, 'from=', req.ip || req.connection && req.connection.remoteAddress);
  // Primary source: `?u=` query param
  let raw = req.query.u;

  // Fallback: if proxy was configured to forward URL as a path segment
  // e.g. /proxy/site/https%3A%2F%2Fexample.com%2Fpage
  if (!raw) {
    try {
      const pathAfterSite = req.originalUrl.replace(/^[^?]*/, (m) => m).split('/site/')[1];
      if (pathAfterSite) {
        // strip any further path/query that might be present
        raw = pathAfterSite.split('?')[0] || undefined;
      }
    } catch (e) {
      raw = undefined;
    }
  }

  if (!raw) {
    return res.status(400).json({ success: false, message: 'Parámetro u requerido' });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'URL inválida', error: e.message });
  }

  // Helper para GET simple
  const fetchGet = (url) => new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    client.get(url, (r) => {
      const data = [];
      r.on('data', c => data.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(data), headers: r.headers }));
    }).on('error', (err) => resolve({ status: 500, error: err.message }));
  });

  // If the incoming request is not GET, forward method and body to remote URL
  if (req.method !== 'GET') {
    try {
      const urlObj = new URL(decoded);
      const client = urlObj.protocol === 'https:' ? https : http;
      const options = {
        method: req.method,
        headers: {}
      };
      // Copy a few headers that are useful for remote POSTs
      if (req.headers['content-type']) options.headers['Content-Type'] = req.headers['content-type'];
      if (req.headers['cookie']) options.headers['Cookie'] = req.headers['cookie'];

      const forwarded = await new Promise((resolve) => {
        const r = client.request(decoded, options, (remoteRes) => {
          const chunks = [];
          remoteRes.on('data', c => chunks.push(c));
          remoteRes.on('end', () => resolve({ status: remoteRes.statusCode, body: Buffer.concat(chunks), headers: remoteRes.headers }));
        });
        r.on('error', (err) => resolve({ status: 500, error: err.message }));

        // Forward body: prefer raw buffer if present, else try JSON/stringified body
        try {
          if (req.body && Buffer.isBuffer(req.body)) {
            r.write(req.body);
          } else if (req.body && typeof req.body === 'object') {
            // If content-type is form-urlencoded, stringify accordingly
            const ct = req.headers['content-type'] || '';
            if (ct.includes('application/x-www-form-urlencoded')) {
              const qs = require('querystring');
              r.write(qs.stringify(req.body));
            } else {
              r.write(JSON.stringify(req.body));
            }
          }
        } catch (e) {}
        r.end();
      });

      if (!forwarded || forwarded.status >= 400) {
        return res.status(forwarded.status || 502).json({ success: false, message: 'No se pudo obtener HTML remoto', detalle: forwarded.error });
      }

      const htmlText = forwarded.body.toString('utf8');
      // Remove framing-blocking headers if present in response headers
      res.removeHeader('x-frame-options');
      res.removeHeader('content-security-policy');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(htmlText);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error proxy POST', error: e.message });
    }
  }

  const result = await fetchGet(decoded);
  if (result.status !== 200 || !result.body) {
    return res.status(result.status || 502).json({ success: false, message: 'No se pudo obtener HTML remoto', detalle: result.error });
  }

  // Si el servidor remoto devolvió cookies de sesión, re-expónerlas para
  // que el navegador las almacene bajo este dominio y las envie en
  // subsecuentes peticiones a /proxy/file. Esto permite que recursos
  // protegidos con sesión (CSS/JS/imagenes) se obtengan correctamente.
  try {
    if (result.headers && result.headers['set-cookie']) {
      // Pasar las cookies tal cual al cliente
      res.setHeader('Set-Cookie', result.headers['set-cookie']);
    }
  } catch (e) {
    console.warn('Proxy: fallo al re-exponeer cookies remotas', e && e.message ? e.message : e);
  }

  // Asegurar que no enviamos cabeceras que puedan bloquear el iframe
  try {
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
  } catch (e) {}

  // Base debe apuntar al directorio del recurso (no sólo al origen)
  let htmlText = result.body.toString('utf8');
  let baseHref = '';
  try {
    const u = new URL(decoded);
    // pathname con barra final del directorio
    const dirPath = u.pathname.replace(/[^\/]*$/, '');
    baseHref = `${u.origin}${dirPath}`;
  } catch (_) {
    const m = decoded.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
    const origin = m ? m[1] : '';
    const path = m && m[2] ? m[2].replace(/[^\/]*$/, '') : '/';
    baseHref = `${origin}${path}`;
  }

  // Inyectar <base> al inicio de <head> para resolver assets relativos
  if (baseHref) {
    if (htmlText.includes('<head')) {
      htmlText = htmlText.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`);
    } else {
      // Si no hay <head>, crear uno mínimo
      htmlText = `<!doctype html><html><head><base href="${baseHref}"></head><body>` + htmlText + `</body></html>`;
    }
  }

  // Escalado opcional para que el sitio se vea más grande
  const scaleParam = parseFloat(req.query.scale);
  const padParamRaw = req.query.pad;
  const padPx = padParamRaw ? parseInt(padParamRaw, 10) : NaN;
  if (!isNaN(scaleParam) && scaleParam > 0) {
    // Aumentar tamaño visual y agregar espacio inferior para que los desplegables no se recorten
    const pad = !isNaN(padPx) && padPx > 0 ? padPx : 360;
    const style = `\n<style>
      /* Chrome/Edge */
      html { zoom: ${scaleParam}; }
      body { min-height: calc(100vh / ${scaleParam}); padding-bottom: ${pad}px; }
      /* Fallback (Firefox) */
      @supports not (zoom: 1) {
        html, body { height: auto; min-height: 100%; }
        body { transform: scale(${scaleParam}); transform-origin: top center; padding-bottom: ${pad}px; }
      }
    </style>\n`;
    if (htmlText.includes('</head>')) {
      htmlText = htmlText.replace('</head>', `${style}</head>`);
    } else {
      htmlText = `<!doctype html><html><head>${style}</head><body>` + htmlText + `</body></html>`;
    }
  }

  // Reescribir recursos (css, js, img, source, video, audio) para servirlos
  // a través del proxy `/proxy/file?u=` y evitar problemas CORS / mixed-content.
  try {
    // Evitar reescrituras en URLs ya proxied
    const replaceAttr = (text) => {
      return text
        // href/src attributes
        .replace(/(href|src)=(["'])(?!\/proxy\/|data:|mailto:|javascript:)(.*?)\2/gi, (m, attr, q, url) => {
          try {
            const trimmed = url.trim();
            const enc = encodeURIComponent(trimmed);
            // Attach the baseHref so /proxy/file can resolve relative URLs
            const baseEnc = encodeURIComponent(baseHref || '');
            return `${attr}=${q}/proxy/file?u=${enc}${baseEnc ? '&base=' + baseEnc : ''}${q}`;
          } catch (e) {
            return m;
          }
        })
        // CSS @import rules
        .replace(/@import\s+(?:url\()?\s*(["'])(?!\/proxy\/)(.*?)\1\s*\)?/gi, (m, q, url) => {
          try {
            const enc = encodeURIComponent(url.trim());
            const baseEnc = encodeURIComponent(baseHref || '');
            return `@import ${q}/proxy/file?u=${enc}${baseEnc ? '&base=' + baseEnc : ''}${q}`;
          } catch (e) {
            return m;
          }
        });
    };

    htmlText = replaceAttr(htmlText);
  } catch (e) {
    // no bloquear la entrega si la reescritura falla
    console.warn('Proxy: fallo al reescribir recursos:', e && e.message ? e.message : e);
  }

  // Entregar como HTML sin cabeceras que bloqueen embedding
  try {
    // Eliminar meta CSP o X-Frame-Options embebidos en el HTML que puedan
    // bloquear la carga de recursos o el framing incluso si quitamos cabeceras.
    htmlText = htmlText.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
    htmlText = htmlText.replace(/<meta[^>]+name=["']?x-frame-options["']?[^>]*>/gi, '');
  } catch (e) {}

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(htmlText);
});

/**
 * GET /proxy/pdf?u=<URL-ENCODED-PDF>
 * Proxies a remote PDF (or other file) to bypass CORS / double encoding issues.
 * - Handles double encoded %20 (%2520) segments.
 * - Tries alternative path adding/removing an extra '/intranet/' if first attempt is 404.
 */
router.get('/pdf', async (req, res) => {
  logger.debug('[proxy/pdf] request, query.u=', !!req.query.u, 'from=', req.ip || req.connection && req.connection.remoteAddress);
  const raw = req.query.u;
  if (!raw) {
    return res.status(400).json({ success: false, message: 'Parámetro u requerido' });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
    // Manejar double encoding (%2520 -> %20)
    // Decodificar repetidamente mientras haya secuencias %25
    let safetyCounter = 0;
    while (decoded.includes('%25') && safetyCounter < 5) {
      decoded = decodeURIComponent(decoded);
      safetyCounter++;
    }
  } catch (e) {
    return res.status(400).json({ success: false, message: 'URL inválida', error: e.message });
  }

  // Función para intentar descargar una URL y devolver buffer
  const fetchUrl = (url) => new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    client.get(url, (r) => {
      if (r.statusCode !== 200) {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ ok: false, status: r.statusCode, body: Buffer.concat(chunks), url }));
        return;
      }
      const data = [];
      r.on('data', c => data.push(c));
      r.on('end', () => resolve({ ok: true, status: r.statusCode, body: Buffer.concat(data), url }));
    }).on('error', (err) => {
      resolve({ ok: false, status: 500, error: err.message, url });
    });
  });

  // Primera URL tentativa
  const attempts = [decoded];
  // Heurística: si sólo hay una ocurrencia de '/intranet/' en la ruta, probar una segunda variante duplicando
  const occurrences = decoded.split('/intranet/').length - 1;
  if (occurrences === 1) {
    attempts.push(decoded.replace('/intranet/', '/intranet/intranet/'));
  }
  // También probar versión sin primer '/intranet' si hay dos
  if (occurrences === 2) {
    attempts.push(decoded.replace('/intranet/intranet/', '/intranet/'));
  }

  let result;
  for (const url of attempts) {
    // Ignorar intentos duplicados
    if (attempts.indexOf(url) !== attempts.lastIndexOf(url)) continue;
    result = await fetchUrl(url);
    if (result.ok) break;
  }

  if (!result || !result.ok) {
    return res.status(result ? result.status : 502).json({
      success: false,
      message: 'No se pudo obtener el archivo remoto',
      attempted: attempts,
      lastStatus: result && result.status,
      error: result && result.error,
    });
  }

  const ext = path.extname(result.url).toLowerCase();
  const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(result.body);
});

/**
 * GET /proxy/file?u=<URL-ENCODED-RESOURCE>
 * Proxies arbitrary remote files (images, docs, etc.) so the browser can
 * request them from this origin and avoid CORS restrictions.
 */
router.get('/file', async (req, res) => {
  const raw = req.query.u;
  if (!raw) {
    return res.status(400).json({ success: false, message: 'Parámetro u requerido' });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
    let safetyCounter = 0;
    while (decoded.includes('%25') && safetyCounter < 5) {
      decoded = decodeURIComponent(decoded);
      safetyCounter++;
    }
  } catch (e) {
    return res.status(400).json({ success: false, message: 'URL inválida', error: e.message });
  }
  // Resolve relative resource URLs (e.g. "./assets/style.css") using this
  // priority: 1) explicit `base` query param (from /site rewrite),
  // 2) Referer header pointing to /proxy/site?u=..., 3) raw decoded value.
  let resolvedPrimary = decoded;
  try {
    const baseParam = req.query.base;
    let baseForResolve = null;
    if (baseParam) {
      try {
        baseForResolve = decodeURIComponent(baseParam);
      } catch (e) {
        baseForResolve = baseParam;
      }
    } else {
      const referer = req.get('referer') || req.get('referrer') || req.headers.referer;
      if (referer) {
        const refQuery = referer.split('?')[1] || '';
        const refParams = new URLSearchParams(refQuery);
        const remoteRaw = refParams.get('u');
        if (remoteRaw) {
          try {
            baseForResolve = decodeURIComponent(remoteRaw);
            let sc = 0;
            while (baseForResolve.includes('%25') && sc < 5) {
              baseForResolve = decodeURIComponent(baseForResolve);
              sc++;
            }
          } catch (e) {
            baseForResolve = remoteRaw;
          }
        }
      }
    }

    if (baseForResolve && !decoded.match(/^https?:\/\//i)) {
      try {
        const remoteUrl = new URL(baseForResolve);
        const dirPath = remoteUrl.pathname.replace(/[^\/]*$/, '');
        const baseDir = `${remoteUrl.origin}${dirPath}`;
        resolvedPrimary = new URL(decoded, baseDir).toString();
      } catch (e) {
        // ignore and fall back to decoded
      }
    }
  } catch (e) {
    resolvedPrimary = decoded;
  }

  // DEBUG: log resolution inputs so we can see why resources fail to fetch.
  logger.debug('[proxy/file] decoded=', decoded);
  logger.debug('[proxy/file] baseParam=', req.query.base);
  logger.debug('[proxy/file] referer=', req.get('referer') || req.get('referrer'));
  logger.debug('[proxy/file] resolvedPrimary=', resolvedPrimary);

  // Determine a sensible Referer to present to the remote host so it
  // recognizes the request as coming from the proxied page.
  let refererForRemote = null;
  try {
    if (req.query.base) {
      try { refererForRemote = decodeURIComponent(req.query.base); } catch (e) { refererForRemote = req.query.base; }
    } else {
      const referer = req.get('referer') || req.get('referrer') || req.headers.referer;
      if (referer) {
        const refQuery = referer.split('?')[1] || '';
        const refParams = new URLSearchParams(refQuery);
        const remoteRaw = refParams.get('u');
        if (remoteRaw) {
          try {
            refererForRemote = decodeURIComponent(remoteRaw);
            let sc = 0;
            while (refererForRemote.includes('%25') && sc < 5) { refererForRemote = decodeURIComponent(refererForRemote); sc++; }
          } catch (e) {
            refererForRemote = remoteRaw;
          }
        }
      }
    }
  } catch (e) { refererForRemote = null; }

  const fetchUrl = (url) => new Promise((resolve) => {
    // Ensure we attempt only absolute http(s) URLs with client.get(url)
    if (!url || !url.match(/^https?:\/\//i)) {
      return resolve({ ok: false, status: 400, error: 'URL no es absoluta', url });
    }
    const client = url.startsWith('https:') ? https : http;
    // Forward cookies that the browser sent to this proxy so the remote
    // origin receives the same session cookies (they were previously
    // re-exponeidas por /proxy/site como Set-Cookie).
    const headers = {};
    try {
      const cookieHeader = req.headers && req.headers.cookie;
      if (cookieHeader) headers['Cookie'] = cookieHeader;
      // Forward User-Agent to avoid some servers returning mobile/blank pages
      if (req.headers && req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];
      // Forward Accept-Language if present
      if (req.headers && req.headers['accept-language']) headers['Accept-Language'] = req.headers['accept-language'];
      // Present a Referer/Origin that matches the proxied page so servers
      // that check for same-origin requests allow returning assets.
      try {
        const u = new URL(url);
        const origin = u.origin;
        headers['Origin'] = origin;
        headers['Referer'] = refererForRemote || origin;
      } catch (e) {}
      // Provide a helpful Accept header (prefer CSS when requesting .css)
      try {
        const pext = path.extname(new URL(url).pathname || '').toLowerCase();
        if (pext === '.css') headers['Accept'] = 'text/css,*/*;q=0.1';
        else headers['Accept'] = '*/*';
      } catch (e) { headers['Accept'] = '*/*'; }
    } catch (e) {}

    client.get(url, { headers }, (r) => {
      const data = [];
      r.on('data', c => data.push(c));
      r.on('end', () => resolve({ ok: r.statusCode === 200, status: r.statusCode, body: Buffer.concat(data), url, headers: r.headers }));
    }).on('error', (err) => resolve({ ok: false, status: 500, error: err.message, url }));
  });

  // Try simple heuristics similar to /pdf: attempt variants if common '/intranet/' duplication
  const attempts = [resolvedPrimary];
  const occurrences = resolvedPrimary.split('/intranet/').length - 1;
  if (occurrences === 1) attempts.push(resolvedPrimary.replace('/intranet/', '/intranet/intranet/'));
  if (occurrences === 2) attempts.push(resolvedPrimary.replace('/intranet/intranet/', '/intranet/'));

  let result;
  logger.debug('[proxy/file] attempts=', attempts);
  for (const url of attempts) {
    logger.debug('[proxy/file] trying url=', url);
    result = await fetchUrl(url);
    logger.debug('[proxy/file] fetched status=', result && result.status, 'ok=', result && result.ok);
    if (result.ok) break;
  }

  if (!result || !result.ok) {
    return res.status(result ? result.status : 502).json({
      success: false,
      message: 'No se pudo obtener el recurso remoto',
      attempted: attempts,
      lastStatus: result && result.status,
      error: result && result.error,
    });
  }

  const ext = path.extname(result.url).toLowerCase();
  let contentType = 'application/octet-stream';
  // Infer some common content types
  if (ext === '.pdf') contentType = 'application/pdf';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  else if (ext === '.css') contentType = 'text/css; charset=utf-8';

  // If the fetched resource is CSS, rewrite any relative `url(...)` and `@import`
  // references so those sub-resources are also requested through /proxy/file.
  if (contentType && contentType.startsWith('text/css')) {
    try {
      let cssText = result.body.toString('utf8');
      const baseForCss = result.url; // absolute URL we fetched

      // Rewrite @import rules that are not already proxied or absolute
      cssText = cssText.replace(/@import\s+(?:url\()?\s*(["'])(?!data:|https?:|\/\/|\/proxy\/)(.*?)\1\s*\)?/gi, (m, q, url) => {
        try {
          const resolved = new URL(url, baseForCss).toString();
          return `@import url('/proxy/file?u=${encodeURIComponent(resolved)}')`;
        } catch (e) {
          return m;
        }
      });

      // Rewrite url(...) occurrences (fonts, images, etc.)
      cssText = cssText.replace(/url\(\s*(["']?)(?!data:|https?:|\/\/|\/proxy\/)(.*?)\1\s*\)/gi, (m, q, url) => {
        try {
          const resolved = new URL(url, baseForCss).toString();
          return `url('/proxy/file?u=${encodeURIComponent(resolved)}')`;
        } catch (e) {
          return m;
        }
      });

      result.body = Buffer.from(cssText, 'utf8');
    } catch (e) {
      console.warn('Proxy: fallo al reescribir CSS:', e && e.message ? e.message : e);
    }
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(result.body);
});

module.exports = router;

// Catch-all diagnostics for unmatched /proxy/* routes (helps identify fronting 404s)
router.use((req, res) => {
  try {
    console.warn('[proxy/*] unmatched route:', req.method, req.originalUrl, 'from=', req.ip || (req.connection && req.connection.remoteAddress));
  } catch (e) {}
  res.status(404).json({
    success: false,
    message: 'Ruta de proxy no encontrada',
    path: req.originalUrl,
    note: 'Si esta petición devuelve 404 en producción pero funciona localmente, el reverse-proxy/frontal probablemente no está reenviando /proxy al backend.'
  });
});
