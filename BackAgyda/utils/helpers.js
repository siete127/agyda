const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const logger = global.logger || require('./logger');

function normalizeArea(area) {
  const a = String(area || '').toUpperCase().trim();
  if (
    a === 'ST' ||
    a === 'SOPORTE TECNICO' || a === 'SOPORTE TÉCNICO' ||
    a === 'SOPORTE_TECNICO' ||
    a === 'SOPORTE TECNICO (ST)' || a === 'SOPORTE TÉCNICO (ST)' ||
    a === 'TI SOPORTE' || a === 'TI_SOPORTE' || a === 'SOPORTE' ||
    a === 'TIS'
  ) return 'ST';
  return 'TI';
}

function buildCookieHeaderFromSetCookieArray(arr) {
  if (!arr || !arr.length) return '';
  const pairs = [];
  for (const sc of arr) {
    const firstPart = String(sc).split(';')[0];
    if (firstPart && firstPart.includes('=')) {
      pairs.push(firstPart.trim());
    }
  }
  return pairs.join('; ');
}

function rewriteVentasContent(text, contentType) {
  try {
    if (!contentType) return text;
    const isHtml = contentType.includes('text/html');
    if (!isHtml) return text;

    let out = text;
    // Normalize known absolute origins
    out = out.replaceAll('https://ventas.ardabytec.vip:8443/api', '/proxy/ventas_api');
    out = out.replaceAll('https://ventas.ardabytec.vip:8443', '/proxy/ventas');
    out = out.replaceAll('https://ventas.ardabytec.vip/', '/proxy/ventas/');
    out = out.replaceAll('https://ventas.ardabytec.vip', '/proxy/ventas');
    // Protocol-relative URLs
    out = out.replaceAll('//ventas.ardabytec.vip:8443/api', '/proxy/ventas_api');
    out = out.replaceAll('//ventas.ardabytec.vip:8443', '/proxy/ventas');
    out = out.replaceAll('//ventas.ardabytec.vip/', '/proxy/ventas/');
    out = out.replaceAll('//ventas.ardabytec.vip', '/proxy/ventas');

    // Rewrite href/src that begin with / (preserve the rest of the path)
    // Special-case paths starting with /call -> map to /proxy/ventas/call/...
    out = out.replace(/(href|src)=("|')?\/call(\/[^"'\s>]*)?/gi, (m, attr, quote, rest) => {
      const q = quote || '"';
      const pathPart = rest || '';
      return `${attr}=${q}/proxy/ventas/call${pathPart}${q}`;
    });

    out = out.replace(/(href|src)=("|')?\/(?!proxy\/ventas|proxy\/ventas_api)([^"'\s>]+)/gi, (m, attr, quote, rest) => {
      const q = quote || '"';
      let p = rest || '';
      if (p.startsWith('/')) p = p.slice(1);
      return `${attr}=${q}/proxy/ventas/${p}${q}`;
    });

    // srcset: handle simple cases where entries start with /
    out = out.replace(/srcset=("|')?([^"']*?)\/(?!proxy\/ventas|proxy\/ventas_api)([^"']*)/gi, (m, quote, prefix, rest) => {
      const q = quote || '"';
      return `srcset=${q}${prefix}/proxy/ventas/${rest}${q}`;
    });

    if (isHtml) {
      const injection = `\n<script>(function(){\ntry{\n  var _hostRe=/^https?:\\/\\/ventas\\.ardabytec\\.vip:8443/;\n  var _rewrite=function(u){try{if(typeof u==='string'){return u.replace(_hostRe,'/proxy/ventas_api');} if(u && typeof u.url==='string'){u.url=u.url.replace(_hostRe,'/proxy/ventas_api');} return u;}catch(e){return u;}};\n  var _fetch=window.fetch;\n  if(typeof _fetch==='function'){\n    window.fetch=new Proxy(_fetch,{apply:function(target,thisArg,args){args[0]=_rewrite(args[0]); return Reflect.apply(target,thisArg,args);}});\n  }\n  if (window.XMLHttpRequest){\n    var _open=XMLHttpRequest.prototype.open;\n    XMLHttpRequest.prototype.open=function(method,url){\n      try{url=_rewrite(url);}catch(e){}\n      return _open.apply(this,arguments);\n    };\n  }\n  if(navigator && navigator.serviceWorker && navigator.serviceWorker.getRegistrations){\n    navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});\n  }\n}catch(e){}\n})();</script>\n`;
      
      const baseTag = '\n<base href="/proxy/ventas/">\n';
      if (out.includes('<head')) {
        if (!/\<base\s+href=/i.test(out)) {
          out = out.replace(/<head[^>]*>/i, function(m){ return m + baseTag + injection; });
        } else {
          out = out.replace(/<head[^>]*>/i, function(m){ return m + injection; });
        }
      } else if (out.includes('<body')) {
        out = out.replace(/<body[^>]*>/i, function(m){ return m + baseTag + injection; });
      } else {
        out = baseTag + injection + out;
      }
    }
    return out;
  } catch (e) {
    logger.warn('⚠️ Error reescribiendo contenido ventas:', e.message);
    return text;
  }
}

function htmlResponse(title, message, ok) {
  const color = ok ? '#2E7D32' : '#D32F2F';
  const icon = ok ? '✅' : '❌';
  const bgColor = ok ? '#E8F5E9' : '#FFEBEE';
  const borderColor = ok ? '#2E7D32' : '#D32F2F';
  
  return `<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} - AGYDA ArdaBytec</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .container {
        max-width: 600px;
        background-color: #ffffff;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        padding: 48px 40px;
        margin: 20px;
        text-align: center;
        animation: slideIn 0.5s ease-out;
      }
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .icon-circle {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background-color: ${bgColor};
        border: 4px solid ${borderColor};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        margin: 0 auto 24px;
      }
      h1 {
        color: ${color};
        margin: 0 0 16px 0;
        font-size: 32px;
        font-weight: 600;
      }
      p {
        color: #555;
        margin: 0 0 32px 0;
        font-size: 18px;
        line-height: 1.6;
      }
      .button {
        display: inline-block;
        background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%);
        color: #ffffff;
        padding: 14px 32px;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 16px;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 4px 12px rgba(13,71,161,0.3);
      }
      .button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(13,71,161,0.4);
      }
      .footer {
        margin-top: 40px;
        padding-top: 24px;
        border-top: 1px solid #e0e0e0;
        color: #999;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon-circle">${icon}</div>
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="${process.env.BASE_PUBLIC_URL || 'https://intranet.ardabytec.vip:8444'}" class="button">🏠 Volver a AGYDA</a>
      <div class="footer">
        Sistema de Gestión de Permisos<br>
        AGYDA ArdaBytec · Copyright (c) 2026 ArdaBytec · v20.11.0
      </div>
    </div>
  </body>
  </html>`;
}

function ensureUploadDirectories() {
  const profileDir = process.env.PROFILE_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Perfil';
  const portadaDir = process.env.PORTADA_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Portadas';
  
  try {
      if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
      logger.info('📁 Carpeta de perfil creada:', profileDir);
    }
    if (!fs.existsSync(portadaDir)) {
      fs.mkdirSync(portadaDir, { recursive: true });
      logger.info('📁 Carpeta de portadas creada:', portadaDir);
    }
  } catch (e) {
    console.warn('⚠️ No se pudieron crear carpetas:', e.message);
  }
}

module.exports = {
  normalizeArea,
  buildCookieHeaderFromSetCookieArray,
  rewriteVentasContent,
  htmlResponse,
  ensureUploadDirectories
};
