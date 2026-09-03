const sql = require('mssql');
const databaseService = require('./databaseService');

const ADAPTERS = {
  facturama: require('./pac/facturamaAdapter'),
};

function getAdapter(proveedor) {
  return ADAPTERS[proveedor] || ADAPTERS.facturama;
}

// ── Config del emisor + PAC para un tenant ───────────────────────────────
async function getEmpresaFiscal(tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().query('SELECT TOP 1 * FROM dbo.EMPRESA_FISCAL ORDER BY EF_ID DESC');
  const row = r.recordset[0];
  if (!row) return null;
  return {
    rfc: row.EF_RFC,
    razonSocial: row.EF_RAZON_SOCIAL,
    regimenFiscal: row.EF_REGIMEN_FISCAL,
    cp: row.EF_CP,
    csdCargado: !!row.EF_CSD_CARGADO,
    csdNumCert: row.EF_CSD_NUM_CERT,
    csdVigenciaHasta: row.EF_CSD_VIGENCIA_HASTA,
    _cer: row.EF_CSD_CER,
    _key: row.EF_CSD_KEY,
    _csdPassword: row.EF_CSD_PASSWORD,
  };
}

async function getPacConfig(tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().query('SELECT TOP 1 * FROM dbo.FACTURACION_CONFIG ORDER BY FC_ID DESC');
  const row = r.recordset[0];
  if (!row) return null;
  return {
    habilitado: !!row.FC_HABILITADO,
    proveedor: row.FC_PROVEEDOR || 'facturama',
    modo: row.FC_MODO || 'sandbox',
    baseUrl: row.FC_BASE_URL,
    usuario: row.FC_USUARIO,
    password: row.FC_PASSWORD,
    apiKey: row.FC_API_KEY,
    serie: row.FC_SERIE || 'A',
    folioActual: row.FC_FOLIO_ACTUAL || 0,
  };
}

// ¿Podemos timbrar de verdad, o estamos en modo pre-factura?
function pacListo(cfg, emisor) {
  return !!(
    cfg && cfg.habilitado && cfg.baseUrl &&
    (cfg.password || cfg.apiKey) &&
    emisor && emisor.rfc && emisor.regimenFiscal && emisor.cp
  );
}

// ── Timbrado ─────────────────────────────────────────────────────────────
// cfdi canónico (sin serie/folio/emisor — se completan aquí):
// { receptor, conceptos, formaPago, metodoPago, moneda }
async function timbrar(tenantKey, cfdi) {
  const cfg = await getPacConfig(tenantKey);
  const emisor = await getEmpresaFiscal(tenantKey);

  if (!pacListo(cfg, emisor)) {
    // Modo pre-factura: folio interno, sin UUID. No se llama a ningún PAC.
    const folio = await siguienteFolio(tenantKey, 'PRE');
    return {
      modo: 'pre-factura',
      uuid: null,
      pacId: null,
      serie: 'PRE',
      folio,
      xml: null,
      _sinTimbre: true,
    };
  }

  const adapter = getAdapter(cfg.proveedor);
  const folio = await siguienteFolio(tenantKey, cfg.serie);
  const res = await adapter.timbrar(cfg, {
    ...cfdi,
    serie: cfg.serie,
    folio,
    emisor: {
      rfc: emisor.rfc,
      nombre: emisor.razonSocial,
      regimenFiscal: emisor.regimenFiscal,
      cp: emisor.cp,
    },
  });

  let xml = null;
  try {
    if (res.pacId) xml = (await adapter.descargar(cfg, res.pacId, 'xml')).toString('utf8');
  } catch (_) { /* el XML se puede reintentar luego */ }

  return { modo: 'timbrada', ...res, xml };
}

async function cancelar(tenantKey, pacId, motivo) {
  const cfg = await getPacConfig(tenantKey);
  if (!cfg || !cfg.baseUrl) throw new Error('No hay PAC configurado');
  const adapter = getAdapter(cfg.proveedor);
  return adapter.cancelar(cfg, pacId, motivo);
}

async function descargar(tenantKey, pacId, formato) {
  const cfg = await getPacConfig(tenantKey);
  if (!cfg || !cfg.baseUrl) throw new Error('No hay PAC configurado');
  const adapter = getAdapter(cfg.proveedor);
  return adapter.descargar(cfg, pacId, formato);
}

async function probarConexion(tenantKey) {
  const cfg = await getPacConfig(tenantKey);
  if (!cfg || !cfg.baseUrl || !(cfg.password || cfg.apiKey)) {
    return { ok: false, message: 'Faltan datos del PAC (URL y credenciales)' };
  }
  const adapter = getAdapter(cfg.proveedor);
  return adapter.probarConexion(cfg);
}

// Sube el CSD al PAC (para Facturama multiemisor). Silencioso si el PAC no
// lo requiere.
async function subirCSDAlPac(tenantKey, { rfc, cerBase64, keyBase64, passwordCsd }) {
  const cfg = await getPacConfig(tenantKey);
  if (!cfg || !cfg.baseUrl || !(cfg.password || cfg.apiKey)) {
    return { ok: false, message: 'Configura primero las credenciales del PAC para subir el CSD.' };
  }
  const adapter = getAdapter(cfg.proveedor);
  if (!adapter.requiereCSDEnPac) return { ok: true, message: 'El PAC no requiere subir el CSD.' };
  try {
    await adapter.subirCSD(cfg, { rfc, cerBase64, keyBase64, passwordCsd });
    return { ok: true, message: 'CSD registrado en el PAC.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ── Folio consecutivo por serie ──────────────────────────────────────────
async function siguienteFolio(tenantKey, serie) {
  const pool = await databaseService.getPool(tenantKey);
  // Sólo el consecutivo de FACTURACION_CONFIG avanza; PRE usa su propio conteo
  // sobre la tabla FACTURAS para no contaminar el folio fiscal.
  if (serie === 'PRE') {
    const r = await pool.request().query(
      `SELECT ISNULL(MAX(TRY_CAST(FAC_FOLIO AS INT)), 0) + 1 AS n FROM dbo.FACTURAS WHERE FAC_SERIE = 'PRE'`,
    );
    return String(r.recordset[0].n).padStart(4, '0');
  }
  const r = await pool.request()
    .query(`UPDATE dbo.FACTURACION_CONFIG SET FC_FOLIO_ACTUAL = FC_FOLIO_ACTUAL + 1
            OUTPUT INSERTED.FC_FOLIO_ACTUAL AS n
            WHERE FC_ID = (SELECT TOP 1 FC_ID FROM dbo.FACTURACION_CONFIG ORDER BY FC_ID DESC)`);
  return String(r.recordset[0]?.n || 1);
}

module.exports = {
  getEmpresaFiscal,
  getPacConfig,
  pacListo,
  timbrar,
  cancelar,
  descargar,
  probarConexion,
  subirCSDAlPac,
  getAdapter,
};
