// Adaptador del PAC Facturama (API multiemisor). Traduce el CFDI canónico de
// AGYDA al formato de Facturama y timbra. Usa fetch nativo (Node >= 18).
//
// CFDI canónico que recibe `timbrar`:
// {
//   serie, folio, formaPago, metodoPago, moneda,
//   emisor:   { rfc, nombre, regimenFiscal },
//   receptor: { rfc, nombre, regimenFiscal, cp, usoCfdi },
//   conceptos: [{ claveProdServ, claveUnidad, cantidad, descripcion, valorUnitario, importe, ivaTasa }]
// }

const HOSTS_PRODUCCION = [/(^|\.)api\.facturama\.mx$/i];
const HOSTS_SANDBOX = [/(^|\.)apisandbox\.facturama\.mx$/i];

function hostDe(url) {
  try { return new URL(url).host; } catch { return ''; }
}

// Guardarraíl: en modo sandbox nunca pegarle a un host de producción y viceversa.
function validarModoUrl(modo, baseUrl) {
  const host = hostDe(baseUrl);
  if (!host) return { ok: false, message: 'La URL base del PAC no es válida' };
  const esProd = HOSTS_PRODUCCION.some((r) => r.test(host));
  const esSandbox = HOSTS_SANDBOX.some((r) => r.test(host));
  if (modo === 'sandbox' && esProd) {
    return { ok: false, message: `Modo sandbox con una URL de producción (${host}). Timbraría CFDIs reales ante el SAT.` };
  }
  if (modo === 'produccion' && esSandbox) {
    return { ok: false, message: `Modo producción con una URL de pruebas (${host}). Los timbres no tendrían validez fiscal.` };
  }
  return { ok: true };
}

function authHeader(cfg) {
  const user = cfg.usuario || '';
  const pass = cfg.password || cfg.apiKey || '';
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

async function req(cfg, method, ruta, body) {
  const url = cfg.baseUrl.replace(/\/$/, '') + ruta;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(cfg),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.Message || data.message)) || `${res.status} ${res.statusText}`;
    const err = new Error(`[Facturama] ${msg}`);
    err.pac = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Facturama multiemisor: sube el CSD del emisor al PAC.
async function subirCSD(cfg, { rfc, cerBase64, keyBase64, passwordCsd }) {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) throw new Error(g.message);
  return req(cfg, 'POST', '/api-lite/csds', {
    Rfc: rfc,
    Certificate: cerBase64,
    PrivateKey: keyBase64,
    PrivateKeyPassword: passwordCsd,
  });
}

async function listarCSDs(cfg) {
  return req(cfg, 'GET', '/api-lite/csds');
}

function buildPayload(cfdi) {
  const items = (cfdi.conceptos || []).map((c) => {
    const base = Number(c.importe != null ? c.importe : (Number(c.cantidad) || 0) * (Number(c.valorUnitario) || 0));
    const ivaTasa = c.ivaTasa != null ? Number(c.ivaTasa) : 0.16;
    const tieneIva = ivaTasa > 0;
    const item = {
      ProductCode: c.claveProdServ || '01010101',
      UnitCode: c.claveUnidad || 'H87',
      Description: c.descripcion || '',
      Quantity: Number(c.cantidad) || 1,
      UnitPrice: Number(c.valorUnitario) || 0,
      Subtotal: base,
      TaxObject: tieneIva ? '02' : '01',
      Total: tieneIva ? base * (1 + ivaTasa) : base,
    };
    if (tieneIva) {
      item.Taxes = [{
        Total: base * ivaTasa,
        Name: 'IVA',
        Base: base,
        Rate: ivaTasa,
        IsRetention: false,
        Type: 'Federal',
      }];
    }
    return item;
  });

  return {
    Serie: cfdi.serie || 'A',
    Folio: cfdi.folio != null ? String(cfdi.folio) : undefined,
    Currency: cfdi.moneda || 'MXN',
    ExpeditionPlace: cfdi.emisor.cp,
    PaymentForm: cfdi.formaPago || '99',
    PaymentMethod: cfdi.metodoPago || 'PUE',
    CfdiType: 'I',
    Issuer: {
      Rfc: cfdi.emisor.rfc,
      Name: cfdi.emisor.nombre,
      FiscalRegime: String(cfdi.emisor.regimenFiscal || '').trim(),
    },
    Receiver: {
      Rfc: cfdi.receptor.rfc,
      Name: cfdi.receptor.nombre,
      CfdiUse: cfdi.receptor.usoCfdi || 'G03',
      FiscalRegime: String(cfdi.receptor.regimenFiscal || '616').trim(),
      TaxZipCode: cfdi.receptor.cp,
    },
    Items: items,
  };
}

async function timbrar(cfg, cfdi) {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) throw new Error(g.message);
  const payload = buildPayload(cfdi);
  const r = await req(cfg, 'POST', '/api-lite/3/cfdis', payload);
  const uuid = r?.Complement?.TaxStamp?.Uuid || r?.Uuid || null;
  return {
    uuid,
    pacId: r?.Id || uuid,
    serie: r?.Serie || payload.Serie,
    folio: r?.Folio || payload.Folio,
    subtotal: r?.Subtotal ?? null,
    iva: r?.Taxes?.reduce?.((s, t) => s + Number(t.Total || 0), 0) ?? null,
    total: r?.Total ?? null,
    xml: null, // se descarga aparte
    raw: r,
  };
}

async function cancelar(cfg, pacId, motivo = '02') {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) throw new Error(g.message);
  return req(cfg, 'DELETE', `/api-lite/cfdis/${encodeURIComponent(pacId)}?motive=${encodeURIComponent(motivo)}`);
}

async function descargar(cfg, pacId, formato) {
  const ruta = formato === 'xml'
    ? `/api-lite/cfdi/xml/issuedLite/${encodeURIComponent(pacId)}`
    : `/api-lite/cfdi/pdf/issuedLite/${encodeURIComponent(pacId)}`;
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + ruta, {
    headers: { Authorization: authHeader(cfg) },
  });
  if (!res.ok) throw new Error(`[Facturama] descarga ${formato}: ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  // Facturama a veces envuelve el contenido en JSON { Content: base64 }
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      if (j?.Content) return Buffer.from(j.Content, 'base64');
    } catch { /* no era JSON */ }
  }
  return buf;
}

async function probarConexion(cfg) {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) return { ok: false, message: g.message };
  try {
    await req(cfg, 'GET', '/api-lite/csds');
    return { ok: true, message: 'Conexión con el PAC verificada.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = {
  clave: 'facturama',
  requiereCSDEnPac: true,
  validarModoUrl,
  subirCSD,
  listarCSDs,
  timbrar,
  cancelar,
  descargar,
  probarConexion,
};
