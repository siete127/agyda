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

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function buildIssuer(emisor) {
  return {
    Rfc: emisor.rfc,
    Name: emisor.nombre,
    FiscalRegime: String(emisor.regimenFiscal || '').trim(),
  };
}

function buildReceiver(receptor, usoDefault) {
  return {
    Rfc: receptor.rfc,
    Name: receptor.nombre,
    CfdiUse: receptor.usoCfdi || usoDefault,
    FiscalRegime: String(receptor.regimenFiscal || '616').trim(),
    TaxZipCode: receptor.cp,
  };
}

function mapItem(c) {
  const base = round2(c.importe != null ? c.importe : (Number(c.cantidad) || 0) * (Number(c.valorUnitario) || 0));
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
    Total: tieneIva ? round2(base * (1 + ivaTasa)) : base,
  };
  if (tieneIva) {
    item.Taxes = [{
      Total: round2(base * ivaTasa),
      Name: 'IVA',
      Base: base,
      Rate: ivaTasa,
      IsRetention: false,
      Type: 'Federal',
    }];
  }
  return item;
}

// Fecha ISO en hora México sin "Z" — Facturama rechaza fechas futuras en UTC.
function fechaMexicoIso(fecha) {
  const d = new Date(new Date(fecha).toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildPayload(cfdi) {
  return {
    Serie: cfdi.serie || 'A',
    Folio: cfdi.folio != null ? String(cfdi.folio) : undefined,
    Currency: cfdi.moneda || 'MXN',
    ExpeditionPlace: cfdi.emisor.cp,
    PaymentForm: cfdi.formaPago || '99',
    PaymentMethod: cfdi.metodoPago || 'PUE',
    CfdiType: 'I',
    Issuer: buildIssuer(cfdi.emisor),
    Receiver: buildReceiver(cfdi.receptor, 'G03'),
    Items: (cfdi.conceptos || []).map(mapItem),
  };
}

function resultadoTimbre(r, payload) {
  const uuid = r?.Complement?.TaxStamp?.Uuid || r?.Uuid || null;
  return {
    uuid,
    pacId: r?.Id || uuid,
    serie: r?.Serie || payload.Serie,
    folio: r?.Folio || payload.Folio,
    subtotal: r?.Subtotal ?? null,
    iva: r?.Taxes?.reduce?.((s, t) => s + Number(t.Total || 0), 0) ?? null,
    total: r?.Total ?? null,
    xml: null,
    raw: r,
  };
}

async function timbrar(cfg, cfdi) {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) throw new Error(g.message);
  const payload = buildPayload(cfdi);
  const r = await req(cfg, 'POST', '/api-lite/3/cfdis', payload);
  return resultadoTimbre(r, payload);
}

// CFDI tipo P — recepción de pago para una factura PPD.
// { emisor, receptor, pago: { fecha, formaPago, monto, moneda }, relacionado: { uuid, serie, folio, parcialidad, saldoAnterior, saldoInsoluto } }
async function timbrarComplementoPago(cfg, { emisor, receptor, pago, relacionado }) {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) throw new Error(g.message);

  const monto = round2(pago.monto);
  const moneda = pago.moneda || 'MXN';
  const RATE = 0.16;
  const base = round2(monto / (1 + RATE));
  const iva = round2(base * RATE);

  const relatedDoc = {
    Uuid: relacionado.uuid,
    ...(relacionado.serie ? { Serie: relacionado.serie } : {}),
    ...(relacionado.folio != null && relacionado.folio !== '' ? { Folio: String(relacionado.folio) } : {}),
    Currency: moneda,
    PaymentMethod: 'PPD',
    PartialityNumber: Number(relacionado.parcialidad) || 1,
    PreviousBalanceAmount: round2(relacionado.saldoAnterior),
    AmountPaid: monto,
    ImpSaldoInsoluto: round2(relacionado.saldoInsoluto),
    TaxObject: '02',
    Taxes: [{ Total: iva, Name: 'IVA', Base: base, Rate: RATE, IsRetention: false }],
  };

  const payload = {
    CfdiType: 'P',
    NameId: '14',
    Folio: String(Date.now()).slice(-6),
    ExpeditionPlace: emisor.cp,
    Issuer: buildIssuer(emisor),
    Receiver: { ...buildReceiver(receptor, 'CP01'), CfdiUse: 'CP01' },
    Complemento: {
      Payments: [{
        Date: fechaMexicoIso(pago.fecha),
        PaymentForm: pago.formaPago,
        Currency: moneda,
        Amount: monto,
        RelatedDocuments: [relatedDoc],
      }],
    },
  };
  const r = await req(cfg, 'POST', '/api-lite/3/cfdis', payload);
  return resultadoTimbre(r, payload);
}

// CFDI tipo E — egreso / nota de crédito relacionada a una factura.
// { emisor, receptor, items: [...], relacionUuid, tipoRelacion, formaPago, metodoPago, serie, folio }
async function timbrarEgreso(cfg, { emisor, receptor, items, relacionUuid, tipoRelacion, formaPago, metodoPago, serie, folio }) {
  const g = validarModoUrl(cfg.modo, cfg.baseUrl);
  if (!g.ok) throw new Error(g.message);
  const payload = {
    Serie: serie || 'NC',
    Folio: folio != null ? String(folio) : undefined,
    CfdiType: 'E',
    Currency: 'MXN',
    ExpeditionPlace: emisor.cp,
    PaymentForm: formaPago || '01',
    PaymentMethod: metodoPago || 'PUE',
    Issuer: buildIssuer(emisor),
    Receiver: buildReceiver(receptor, 'G02'),
    Items: (items || []).map(mapItem),
    Relations: { Type: tipoRelacion || '01', Cfdis: [{ Uuid: relacionUuid }] },
  };
  const r = await req(cfg, 'POST', '/api-lite/3/cfdis', payload);
  return resultadoTimbre(r, payload);
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
  timbrarComplementoPago,
  timbrarEgreso,
  cancelar,
  descargar,
  probarConexion,
};
