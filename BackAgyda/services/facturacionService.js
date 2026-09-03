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

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Alimenta el bloque "Ingresado por factura" del cliente (FINANZAS_INGRESOS se
// cruza por texto en el concepto).
async function registrarIngresoFinanzas(pool, { clienteNombre, folioFactura, monto, fecha }) {
  try {
    const concepto = `Pago factura ${folioFactura}${clienteNombre ? ` — ${clienteNombre}` : ''}`;
    const r = await pool.request()
      .input('c', sql.NVarChar(255), concepto.slice(0, 255))
      .input('m', sql.Decimal(18, 2), round2(monto))
      .input('f', sql.Date, fecha ? new Date(fecha) : new Date())
      .query(`INSERT INTO dbo.FINANZAS_INGRESOS (FI_CONCEPTO, FI_MONTO, FI_FECHA, FI_CATEGORIA)
              OUTPUT INSERTED.FI_ID id VALUES (@c, @m, @f, 'Facturación')`);
    return r.recordset[0]?.id || null;
  } catch (e) {
    console.warn('registrarIngresoFinanzas:', e.message);
    return null;
  }
}

// ── Registro de pago de una factura ──────────────────────────────────────
// { fechaPago, formaPago, monto, moneda }
async function registrarPago(tenantKey, facturaId, datos) {
  const pool = await databaseService.getPool(tenantKey);
  const fr = await pool.request().input('id', sql.Int, facturaId)
    .query(`SELECT f.*, ISNULL(c.CONT_NOMBRE, c2.CL_NOMBRE) clienteNombre,
                   c.CONT_RFC rfc, c.CONT_RAZON_SOCIAL razon, c.CONT_REGIMEN_FISCAL reg, c.CONT_CP_FISCAL cp
            FROM dbo.FACTURAS f
            LEFT JOIN dbo.CRM_CONTACTOS c ON c.CONT_ID = f.FAC_CLIENTE_ID
            LEFT JOIN dbo.CLIENTES c2 ON c2.CL_ID = f.FAC_CLIENTE_ID
            WHERE f.FAC_ID = @id`);
  const f = fr.recordset[0];
  if (!f) throw new Error('Factura no encontrada');
  if (f.FAC_ESTATUS === 'cancelada') throw new Error('La factura está cancelada');

  const monto = round2(datos.monto);
  if (!(monto > 0)) throw new Error('El monto debe ser mayor a 0');

  const saldoActual = f.FAC_SALDO != null ? Number(f.FAC_SALDO) : Number(f.FAC_TOTAL || 0);
  if (monto > saldoActual + 0.01) {
    throw new Error(`El pago (${monto}) supera el saldo pendiente (${round2(saldoActual)})`);
  }
  const saldoInsoluto = round2(saldoActual - monto);

  const prev = await pool.request().input('id', sql.Int, facturaId)
    .query(`SELECT COUNT(*) n FROM dbo.FACTURA_PAGOS WHERE PAG_FACTURA_ID = @id AND PAG_ESTATUS <> 'cancelado'`);
  const parcialidad = (prev.recordset[0].n || 0) + 1;

  const esPPD = f.FAC_METODO_PAGO === 'PPD';
  const facturaTimbrada = f.FAC_ESTATUS === 'timbrada' && f.FAC_UUID;

  let cfdi = { uuid: null, pacId: null, xml: null, estatus: 'registrado', error: null };
  if (esPPD && facturaTimbrada) {
    const cfg = await getPacConfig(tenantKey);
    const emisor = await getEmpresaFiscal(tenantKey);
    if (pacListo(cfg, emisor)) {
      try {
        const adapter = getAdapter(cfg.proveedor);
        const res = await adapter.timbrarComplementoPago(cfg, {
          emisor: { rfc: emisor.rfc, nombre: emisor.razonSocial, regimenFiscal: emisor.regimenFiscal, cp: emisor.cp },
          receptor: { rfc: f.FAC_RECEPTOR_RFC || f.rfc, nombre: f.FAC_RECEPTOR_NOMBRE || f.razon, regimenFiscal: f.reg, cp: f.cp },
          pago: { fecha: datos.fechaPago, formaPago: datos.formaPago, monto, moneda: datos.moneda || 'MXN' },
          relacionado: {
            uuid: f.FAC_UUID, serie: f.FAC_SERIE, folio: f.FAC_FOLIO,
            parcialidad, saldoAnterior: saldoActual, saldoInsoluto,
          },
        });
        let xml = null;
        try { if (res.pacId) xml = (await adapter.descargar(cfg, res.pacId, 'xml')).toString('utf8'); } catch (_) { /* reintentable */ }
        cfdi = { uuid: res.uuid, pacId: res.pacId, xml, estatus: 'timbrado', error: null };
      } catch (e) {
        cfdi = { uuid: null, pacId: null, xml: null, estatus: 'error', error: String(e.message || e).slice(0, 1000) };
      }
    }
  }

  const finanzasId = await registrarIngresoFinanzas(pool, {
    clienteNombre: f.clienteNombre, folioFactura: `${f.FAC_SERIE || ''}${f.FAC_FOLIO || ''}`,
    monto, fecha: datos.fechaPago,
  });

  const ins = await pool.request()
    .input('fac', sql.Int, facturaId)
    .input('fecha', sql.DateTime, new Date(datos.fechaPago))
    .input('forma', sql.NVarChar(3), datos.formaPago)
    .input('monto', sql.Decimal(18, 2), monto)
    .input('mon', sql.NVarChar(3), datos.moneda || 'MXN')
    .input('parc', sql.Int, parcialidad)
    .input('sant', sql.Decimal(18, 2), saldoActual)
    .input('sins', sql.Decimal(18, 2), saldoInsoluto)
    .input('uuid', sql.NVarChar(40), cfdi.uuid)
    .input('pac', sql.NVarChar(60), cfdi.pacId)
    .input('xml', sql.NVarChar(sql.MAX), cfdi.xml)
    .input('est', sql.NVarChar(20), cfdi.estatus)
    .input('err', sql.NVarChar(1000), cfdi.error)
    .input('fin', sql.Int, finanzasId)
    .input('by', sql.Int, datos.usuarioId || null)
    .query(`INSERT INTO dbo.FACTURA_PAGOS
      (PAG_FACTURA_ID,PAG_FECHA_PAGO,PAG_FORMA_PAGO,PAG_MONTO,PAG_MONEDA,PAG_PARCIALIDAD,
       PAG_SALDO_ANTERIOR,PAG_SALDO_INSOLUTO,PAG_CFDI_UUID,PAG_CFDI_PAC_ID,PAG_CFDI_XML,
       PAG_ESTATUS,PAG_ERROR,PAG_FINANZAS_ID,PAG_CREADO_POR)
      OUTPUT INSERTED.PAG_ID id
      VALUES (@fac,@fecha,@forma,@monto,@mon,@parc,@sant,@sins,@uuid,@pac,@xml,@est,@err,@fin,@by)`);

  await pool.request().input('id', sql.Int, facturaId).input('s', sql.Decimal(18, 2), saldoInsoluto)
    .query(`UPDATE dbo.FACTURAS SET FAC_SALDO = @s, FAC_PAGADA = CASE WHEN @s <= 0.01 THEN 1 ELSE 0 END WHERE FAC_ID = @id`);

  return { id: ins.recordset[0].id, parcialidad, saldoInsoluto, cfdi: cfdi.estatus, uuid: cfdi.uuid, error: cfdi.error };
}

async function listPagos(tenantKey, facturaId) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().input('id', sql.Int, facturaId)
    .query(`SELECT PAG_ID id, PAG_FECHA_PAGO fechaPago, PAG_FORMA_PAGO formaPago, PAG_MONTO monto,
                   PAG_MONEDA moneda, PAG_PARCIALIDAD parcialidad, PAG_SALDO_INSOLUTO saldoInsoluto,
                   PAG_CFDI_UUID uuid, PAG_ESTATUS estatus, PAG_ERROR error
            FROM dbo.FACTURA_PAGOS WHERE PAG_FACTURA_ID = @id ORDER BY PAG_PARCIALIDAD`);
  return r.recordset;
}

async function cancelarPago(tenantKey, pagoId, motivo) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().input('id', sql.Int, pagoId)
    .query('SELECT * FROM dbo.FACTURA_PAGOS WHERE PAG_ID = @id');
  const p = r.recordset[0];
  if (!p) throw new Error('Pago no encontrado');
  if (p.PAG_ESTATUS === 'cancelado') throw new Error('El pago ya está cancelado');
  if (p.PAG_ESTATUS === 'timbrado' && p.PAG_CFDI_PAC_ID) {
    await cancelar(tenantKey, p.PAG_CFDI_PAC_ID, motivo || '02');
  }
  await pool.request().input('id', sql.Int, pagoId)
    .query(`UPDATE dbo.FACTURA_PAGOS SET PAG_ESTATUS = 'cancelado' WHERE PAG_ID = @id`);
  // Devolver el monto al saldo de la factura.
  await pool.request().input('fac', sql.Int, p.PAG_FACTURA_ID).input('m', sql.Decimal(18, 2), Number(p.PAG_MONTO))
    .query(`UPDATE dbo.FACTURAS SET FAC_SALDO = ISNULL(FAC_SALDO, FAC_TOTAL) + @m, FAC_PAGADA = 0 WHERE FAC_ID = @fac`);
  if (p.PAG_FINANZAS_ID) {
    await pool.request().input('id', sql.Int, p.PAG_FINANZAS_ID)
      .query('DELETE FROM dbo.FINANZAS_INGRESOS WHERE FI_ID = @id').catch(() => {});
  }
  return { ok: true };
}

// ── Nota de crédito (CFDI tipo E) ────────────────────────────────────────
// { motivo, tipoRelacion, items: [{ descripcion, claveProdServ, claveUnidad, cantidad, precioUnit, ivaTasa }] }
// items vacío = NC total (toma los renglones de la cotización origen o el total de la factura).
async function emitirNotaCredito(tenantKey, facturaId, datos) {
  const pool = await databaseService.getPool(tenantKey);
  const fr = await pool.request().input('id', sql.Int, facturaId)
    .query(`SELECT f.*, c.CONT_RFC rfc, c.CONT_RAZON_SOCIAL razon, c.CONT_REGIMEN_FISCAL reg, c.CONT_CP_FISCAL cp
            FROM dbo.FACTURAS f LEFT JOIN dbo.CRM_CONTACTOS c ON c.CONT_ID = f.FAC_CLIENTE_ID
            WHERE f.FAC_ID = @id`);
  const f = fr.recordset[0];
  if (!f) throw new Error('Factura no encontrada');
  if (f.FAC_ESTATUS !== 'timbrada' || !f.FAC_UUID) {
    throw new Error('La nota de crédito requiere una factura timbrada (con folio fiscal).');
  }

  let items = Array.isArray(datos.items) && datos.items.length ? datos.items : null;
  if (!items && f.FAC_COT_ID) {
    const ci = await pool.request().input('c', sql.Int, f.FAC_COT_ID)
      .query(`SELECT COTI_DESCRIPCION descripcion, COTI_CLAVE_PROD_SERV claveProdServ, COTI_CLAVE_UNIDAD claveUnidad,
                     COTI_CANTIDAD cantidad, COTI_PRECIO_UNIT precioUnit, COTI_IVA_TASA ivaTasa
              FROM dbo.CRM_COTIZACION_ITEMS WHERE COTI_COT_ID = @c AND COTI_ES_SECCION = 0`);
    items = ci.recordset;
  }
  if (!items || !items.length) {
    // NC total sin detalle: un solo renglón por el subtotal de la factura.
    items = [{
      descripcion: `Nota de crédito de la factura ${f.FAC_SERIE || ''}${f.FAC_FOLIO || ''}`,
      claveProdServ: '84111506', claveUnidad: 'ACT',
      cantidad: 1, precioUnit: Number(f.FAC_SUBTOTAL || 0), ivaTasa: 0.16,
    }];
  }

  let subtotal = 0, iva = 0;
  for (const it of items) {
    const base = round2((Number(it.cantidad) || 1) * (Number(it.precioUnit) || 0));
    subtotal += base;
    iva += round2(base * (it.ivaTasa != null ? Number(it.ivaTasa) : 0.16));
  }
  subtotal = round2(subtotal); iva = round2(iva);
  const total = round2(subtotal + iva);

  const nc = await pool.request()
    .input('fac', sql.Int, facturaId)
    .input('tr', sql.NVarChar(2), datos.tipoRelacion || '01')
    .input('mot', sql.NVarChar(300), datos.motivo ? String(datos.motivo).slice(0, 300) : null)
    .input('sub', sql.Decimal(18, 2), subtotal).input('iva', sql.Decimal(18, 2), iva).input('tot', sql.Decimal(18, 2), total)
    .input('by', sql.Int, datos.usuarioId || null)
    .query(`INSERT INTO dbo.NOTAS_CREDITO (NC_FACTURA_ID,NC_TIPO_RELACION,NC_MOTIVO,NC_SUBTOTAL,NC_IVA,NC_TOTAL,NC_CREADO_POR)
            OUTPUT INSERTED.NC_ID id VALUES (@fac,@tr,@mot,@sub,@iva,@tot,@by)`);
  const ncId = nc.recordset[0].id;

  for (const it of items) {
    await pool.request()
      .input('nc', sql.Int, ncId)
      .input('d', sql.NVarChar(400), it.descripcion || '')
      .input('cps', sql.NVarChar(12), it.claveProdServ || null)
      .input('cu', sql.NVarChar(6), it.claveUnidad || null)
      .input('cant', sql.Decimal(10, 3), Number(it.cantidad) || 1)
      .input('pu', sql.Decimal(18, 2), Number(it.precioUnit) || 0)
      .input('iva', sql.Decimal(5, 4), it.ivaTasa != null ? Number(it.ivaTasa) : 0.16)
      .query(`INSERT INTO dbo.NOTA_CREDITO_ITEMS (NCI_NC_ID,NCI_DESCRIPCION,NCI_CLAVE_PROD_SERV,NCI_CLAVE_UNIDAD,NCI_CANTIDAD,NCI_PRECIO_UNIT,NCI_IVA_TASA)
              VALUES (@nc,@d,@cps,@cu,@cant,@pu,@iva)`);
  }

  const cfg = await getPacConfig(tenantKey);
  const emisor = await getEmpresaFiscal(tenantKey);
  let estatus = 'pre-nota';
  if (pacListo(cfg, emisor)) {
    try {
      const adapter = getAdapter(cfg.proveedor);
      const folio = await siguienteFolio(tenantKey, 'NC');
      const res = await adapter.timbrarEgreso(cfg, {
        emisor: { rfc: emisor.rfc, nombre: emisor.razonSocial, regimenFiscal: emisor.regimenFiscal, cp: emisor.cp },
        receptor: { rfc: f.FAC_RECEPTOR_RFC || f.rfc, nombre: f.FAC_RECEPTOR_NOMBRE || f.razon, regimenFiscal: f.reg, cp: f.cp, usoCfdi: 'G02' },
        items: items.map((it) => ({
          descripcion: it.descripcion, claveProdServ: it.claveProdServ, claveUnidad: it.claveUnidad,
          cantidad: it.cantidad, valorUnitario: it.precioUnit, ivaTasa: it.ivaTasa,
        })),
        relacionUuid: f.FAC_UUID, tipoRelacion: datos.tipoRelacion || '01',
        formaPago: f.FAC_FORMA_PAGO || '01', metodoPago: 'PUE', serie: 'NC', folio,
      });
      let xml = null;
      try { if (res.pacId) xml = (await adapter.descargar(cfg, res.pacId, 'xml')).toString('utf8'); } catch (_) { /* reintentable */ }
      await pool.request().input('id', sql.Int, ncId)
        .input('uuid', sql.NVarChar(40), res.uuid).input('pac', sql.NVarChar(60), res.pacId)
        .input('serie', sql.NVarChar(10), res.serie).input('folio', sql.NVarChar(20), String(res.folio))
        .input('xml', sql.NVarChar(sql.MAX), xml)
        .query(`UPDATE dbo.NOTAS_CREDITO SET NC_UUID=@uuid, NC_PAC_ID=@pac, NC_SERIE=@serie, NC_FOLIO=@folio, NC_XML=@xml, NC_ESTATUS='timbrada' WHERE NC_ID=@id`);
      estatus = 'timbrada';
    } catch (e) {
      await pool.request().input('id', sql.Int, ncId).input('err', sql.NVarChar(1000), String(e.message || e).slice(0, 1000))
        .query(`UPDATE dbo.NOTAS_CREDITO SET NC_ESTATUS='error', NC_ERROR=@err WHERE NC_ID=@id`);
      throw new Error(`El PAC rechazó la nota de crédito: ${e.message}`);
    }
  }

  return { id: ncId, estatus, subtotal, iva, total };
}

async function listNotasCredito(tenantKey, facturaId) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().input('id', sql.Int, facturaId)
    .query(`SELECT NC_ID id, NC_MOTIVO motivo, NC_SUBTOTAL subtotal, NC_IVA iva, NC_TOTAL total,
                   NC_UUID uuid, NC_SERIE serie, NC_FOLIO folio, NC_ESTATUS estatus, NC_ERROR error, NC_FECHA fecha
            FROM dbo.NOTAS_CREDITO WHERE NC_FACTURA_ID = @id ORDER BY NC_ID DESC`);
  return r.recordset;
}

async function cancelarNotaCredito(tenantKey, ncId, motivo) {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().input('id', sql.Int, ncId).query('SELECT * FROM dbo.NOTAS_CREDITO WHERE NC_ID = @id');
  const n = r.recordset[0];
  if (!n) throw new Error('Nota de crédito no encontrada');
  if (n.NC_ESTATUS === 'cancelada') throw new Error('Ya está cancelada');
  if (n.NC_ESTATUS === 'timbrada' && n.NC_PAC_ID) {
    await cancelar(tenantKey, n.NC_PAC_ID, motivo || '02');
  }
  await pool.request().input('id', sql.Int, ncId)
    .query(`UPDATE dbo.NOTAS_CREDITO SET NC_ESTATUS = 'cancelada' WHERE NC_ID = @id`);
  return { ok: true };
}

async function descargarSecundario(tenantKey, tabla, id, formato) {
  const pool = await databaseService.getPool(tenantKey);
  const col = tabla === 'pago' ? 'PAG' : 'NC';
  const t = tabla === 'pago' ? 'FACTURA_PAGOS' : 'NOTAS_CREDITO';
  const idCol = tabla === 'pago' ? 'PAG_ID' : 'NC_ID';
  const pacCol = tabla === 'pago' ? 'PAG_CFDI_PAC_ID' : 'NC_PAC_ID';
  const xmlCol = tabla === 'pago' ? 'PAG_CFDI_XML' : 'NC_XML';
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${pacCol} pac, ${xmlCol} xml FROM dbo.${t} WHERE ${idCol} = @id`);
  const row = r.recordset[0];
  if (!row) throw new Error('No encontrado');
  if (formato === 'xml' && row.xml) return Buffer.from(row.xml, 'utf8');
  if (!row.pac) throw new Error('Sin documento fiscal (no timbrado).');
  const cfg = await getPacConfig(tenantKey);
  return getAdapter(cfg.proveedor).descargar(cfg, row.pac, formato);
}

// ── Folio consecutivo por serie ──────────────────────────────────────────
async function siguienteFolio(tenantKey, serie) {
  const pool = await databaseService.getPool(tenantKey);
  // PRE (pre-factura) y NC (notas de crédito) llevan su propio conteo sobre su
  // tabla para no contaminar el folio fiscal de las facturas.
  if (serie === 'PRE') {
    const r = await pool.request().query(
      `SELECT ISNULL(MAX(TRY_CAST(FAC_FOLIO AS INT)), 0) + 1 AS n FROM dbo.FACTURAS WHERE FAC_SERIE = 'PRE'`,
    );
    return String(r.recordset[0].n).padStart(4, '0');
  }
  if (serie === 'NC') {
    const r = await pool.request().query(
      `SELECT ISNULL(MAX(TRY_CAST(NC_FOLIO AS INT)), 0) + 1 AS n FROM dbo.NOTAS_CREDITO WHERE NC_SERIE = 'NC'`,
    );
    return String(r.recordset[0].n);
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
  registrarPago,
  listPagos,
  cancelarPago,
  emitirNotaCredito,
  listNotasCredito,
  cancelarNotaCredito,
  descargarSecundario,
};
