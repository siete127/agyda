const sql = require('mssql');
const databaseService = require('../services/databaseService');
const facturacionService = require('../services/facturacionService');

async function _pool(req) { return databaseService.getPool(req?.user?.empresa); }

function mapFactura(r) {
  return {
    id: r.FAC_ID,
    cotId: r.FAC_COT_ID,
    opoId: r.FAC_OPO_ID,
    clienteId: r.FAC_CLIENTE_ID,
    uuid: r.FAC_UUID,
    pacId: r.FAC_PAC_ID,
    serie: r.FAC_SERIE,
    folio: r.FAC_FOLIO,
    emisorRfc: r.FAC_EMISOR_RFC,
    receptorRfc: r.FAC_RECEPTOR_RFC,
    receptorNombre: r.FAC_RECEPTOR_NOMBRE,
    subtotal: r.FAC_SUBTOTAL,
    iva: r.FAC_IVA,
    total: r.FAC_TOTAL,
    moneda: r.FAC_MONEDA,
    usoCfdi: r.FAC_USO_CFDI,
    formaPago: r.FAC_FORMA_PAGO,
    metodoPago: r.FAC_METODO_PAGO,
    estatus: r.FAC_ESTATUS,
    error: r.FAC_ERROR,
    saldo: r.FAC_SALDO != null ? Number(r.FAC_SALDO) : null,
    pagada: !!r.FAC_PAGADA,
    fechaTimbrado: r.FAC_FECHA_TIMBRADO,
    fechaCancelacion: r.FAC_FECHA_CANCELACION,
    fecha: r.FAC_FECHA,
    // Qué se factura cuando viene de un producto asignado al cliente.
    concepto: r.FAC_CONCEPTO || null,
  };
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Renglones de la factura (FACTURA_CONCEPTOS).
async function guardarConceptos(pool, facId, conceptos) {
  for (const k of conceptos) {
    await pool.request()
      .input('fac', sql.Int, facId).input('ps', sql.Int, k.psId || null)
      .input('d', sql.NVarChar(400), String(k.descripcion || '').slice(0, 400) || 'Concepto')
      .input('cant', sql.Decimal(10, 3), Number(k.cantidad) || 1)
      .input('pu', sql.Decimal(18, 2), round2(k.precioUnit || 0))
      .input('iva', sql.Decimal(5, 4), k.ivaTasa != null ? Number(k.ivaTasa) : 0.16)
      .input('cps', sql.NVarChar(12), k.claveProdServ || null).input('cu', sql.NVarChar(6), k.claveUnidad || null)
      .query(`INSERT INTO dbo.FACTURA_CONCEPTOS (FCO_FAC_ID, FCO_PS_ID, FCO_DESCRIPCION, FCO_CANTIDAD, FCO_PRECIO_UNIT, FCO_IVA_TASA, FCO_CLAVE_PROD_SERV, FCO_CLAVE_UNIDAD)
              VALUES (@fac, @ps, @d, @cant, @pu, @iva, @cps, @cu)`)
      .catch((e) => console.warn('facturas.guardarConceptos:', e.message));
  }
}

// Toda factura emitida queda como cuenta por cobrar ligada (FCC_FAC_ID): sale
// en Cuentas por cobrar y en la ficha del cliente, y al cobrarla (por
// cualquiera de los dos lados) se registra el ingreso una sola vez.
async function crearCxcDeFactura(pool, { facId, contId, cliente, total, concepto }) {
  const vence = new Date();
  vence.setDate(vence.getDate() + 30);
  await pool.request()
    .input('cli', sql.NVarChar(255), String(cliente || 'Cliente').slice(0, 255))
    .input('m', sql.Decimal(18, 2), round2(total || 0)).input('v', sql.Date, vence)
    .input('c', sql.NVarChar(255), String(concepto || '').slice(0, 255) || null)
    .input('cont', sql.Int, contId || null).input('fac', sql.Int, facId)
    .query(`IF NOT EXISTS (SELECT 1 FROM FINANZAS_CXC WHERE FCC_FAC_ID = @fac)
              INSERT INTO FINANZAS_CXC (FCC_CLIENTE, FCC_MONTO, FCC_FECHA_VENCIMIENTO, FCC_ESTATUS, FCC_CONCEPTO, FCC_CONT_ID, FCC_FAC_ID)
              VALUES (@cli, @m, @v, 'pendiente', @c, @cont, @fac)`)
    .catch((e) => console.warn('facturas.crearCxcDeFactura:', e.message));
}

// GET /api/facturas/por-facturar — lo que la vista de Finanzas ofrece facturar:
// cotizaciones aprobadas aún sin factura y los clientes (para facturar
// productos/servicios sueltos).
exports.porFacturar = async (req, res) => {
  try {
    const pool = await _pool(req);
    const cot = await pool.request().query(`
      SELECT c.COT_ID id, c.COT_FOLIO folio, c.COT_TITULO titulo, c.COT_FECHA fecha, c.COT_TOTAL total,
             o.OPO_CONTACTO_ID clienteId, COALESCE(NULLIF(ct.CONT_EMPRESA, ''), ct.CONT_NOMBRE) cliente,
             (SELECT COUNT(*) FROM dbo.CRM_COTIZACION_ITEMS i WHERE i.COTI_COT_ID = c.COT_ID AND i.COTI_ES_SECCION = 0) renglones
      FROM dbo.CRM_COTIZACIONES c
      LEFT JOIN dbo.CRM_OPORTUNIDADES o ON o.OPO_ID = c.COT_OPO_ID
      LEFT JOIN dbo.CRM_CONTACTOS ct ON ct.CONT_ID = o.OPO_CONTACTO_ID
      WHERE c.COT_ACTIVO = 1 AND c.COT_ESTATUS = 'aprobada' AND c.COT_FACTURA_ID IS NULL
      ORDER BY c.COT_FECHA DESC, c.COT_ID DESC`);
    const cli = await pool.request().query(`
      SELECT CONT_ID id, COALESCE(NULLIF(CONT_EMPRESA, ''), CONT_NOMBRE) nombre, CONT_NOMBRE contacto, CONT_RFC rfc
      FROM dbo.CRM_CONTACTOS WHERE CONT_ES_CLIENTE = 1 AND CONT_ACTIVO = 1
      ORDER BY COALESCE(NULLIF(CONT_EMPRESA, ''), CONT_NOMBRE)`);
    res.json({ success: true, data: { cotizaciones: cot.recordset, clientes: cli.recordset } });
  } catch (e) {
    console.error('facturas.porFacturar:', e.message);
    res.status(500).json({ success: false, message: 'Error al cargar lo pendiente de facturar' });
  }
};

// GET /api/facturas/receptor/:clienteId — datos fiscales guardados del cliente.
exports.receptor = async (req, res) => {
  try {
    const pool = await _pool(req);
    const r = await pool.request().input('id', sql.Int, Number(req.params.clienteId)).query(`
      SELECT CONT_RFC rfc, COALESCE(NULLIF(CONT_RAZON_SOCIAL, ''), NULLIF(CONT_EMPRESA, ''), CONT_NOMBRE) nombre,
             CONT_REGIMEN_FISCAL regimenFiscal, CONT_CP_FISCAL cp, ISNULL(CONT_USO_CFDI, 'G03') usoCfdi
      FROM dbo.CRM_CONTACTOS WHERE CONT_ID = @id`);
    if (!r.recordset[0]) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, data: r.recordset[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al obtener los datos fiscales' });
  }
};

// POST /api/facturas/manual — factura de productos/servicios sueltos.
// body: { clienteId, conceptos: [{ psId?, descripcion, cantidad, precioUnit, ivaTasa? }],
//         receptor?: { rfc, nombre, regimenFiscal, cp, usoCfdi }, formaPago, metodoPago }
exports.manual = async (req, res) => {
  try {
    const pool = await _pool(req);
    const b = req.body || {};
    const clienteId = Number(b.clienteId);
    const cont = (await pool.request().input('id', sql.Int, clienteId || 0).query(`
      SELECT CONT_ID id, CONT_NOMBRE nombre, CONT_EMPRESA empresa, CONT_RFC rfc, CONT_RAZON_SOCIAL razon,
             CONT_REGIMEN_FISCAL reg, CONT_CP_FISCAL cp, CONT_USO_CFDI uso
      FROM dbo.CRM_CONTACTOS WHERE CONT_ID = @id`)).recordset[0];
    if (!cont) return res.status(400).json({ success: false, message: 'Selecciona el cliente a facturar' });

    const entrada = (Array.isArray(b.conceptos) ? b.conceptos : [])
      .map((k) => ({ ...k, psId: Number(k.psId) || null, cantidad: Number(k.cantidad), precioUnit: Number(k.precioUnit) }))
      .filter((k) => k.cantidad > 0 && k.precioUnit >= 0 && (k.psId || String(k.descripcion || '').trim()));
    if (!entrada.length) return res.status(400).json({ success: false, message: 'Agrega al menos un producto o servicio' });

    // Del catálogo se toman nombre, claves SAT e IVA si no vienen.
    const psIds = [...new Set(entrada.map((k) => k.psId).filter(Boolean))];
    const cat = psIds.length ? (await pool.request().query(`
      SELECT PS_ID id, PS_NOMBRE nombre, PS_CLAVE_PROD_SERV cps, PS_CLAVE_UNIDAD cu, ISNULL(PS_IVA_TASA, 0.16) iva
      FROM PRODUCTOS_SERVICIOS WHERE PS_ID IN (${psIds.join(',')})`)).recordset : [];
    const conceptos = entrada.map((k) => {
      const p = cat.find((x) => x.id === k.psId) || {};
      const ivaTasa = k.ivaTasa != null && k.ivaTasa !== '' ? Number(k.ivaTasa) : (p.iva != null ? Number(p.iva) : 0.16);
      const importe = round2(k.cantidad * k.precioUnit);
      return {
        psId: k.psId, descripcion: String(k.descripcion || p.nombre || '').trim(), cantidad: k.cantidad,
        precioUnit: round2(k.precioUnit), valorUnitario: round2(k.precioUnit), importe, ivaTasa,
        claveProdServ: k.claveProdServ || p.cps || null, claveUnidad: k.claveUnidad || p.cu || null,
      };
    });
    const subtotal = round2(conceptos.reduce((s, k) => s + k.importe, 0));
    const iva = round2(conceptos.reduce((s, k) => s + round2(k.importe * k.ivaTasa), 0));
    const total = round2(subtotal + iva);
    if (!(total > 0)) return res.status(400).json({ success: false, message: 'El total debe ser mayor a 0' });

    const receptor = b.receptor || (cont.rfc ? {
      rfc: cont.rfc, nombre: cont.razon || cont.empresa || cont.nombre, regimenFiscal: cont.reg, cp: cont.cp, usoCfdi: cont.uso || 'G03',
    } : null);
    if (!receptor || !receptor.rfc || !receptor.nombre) {
      return res.status(400).json({ success: false, message: 'Faltan los datos fiscales del receptor (RFC, razón social, régimen, CP)', code: 'RECEPTOR_REQUERIDO' });
    }

    const cfdi = { receptor, conceptos, formaPago: b.formaPago || '99', metodoPago: b.metodoPago || 'PUE', moneda: 'MXN' };
    let resultado;
    try {
      resultado = await facturacionService.timbrar(req.user?.empresa, cfdi);
    } catch (e) {
      return res.status(502).json({ success: false, message: `El PAC rechazó el timbrado: ${e.message}` });
    }
    const emisor = await facturacionService.getEmpresaFiscal(req.user?.empresa);
    const estatus = resultado.modo === 'timbrada' ? 'timbrada' : 'pre-factura';
    const concepto = (conceptos.length === 1 ? conceptos[0].descripcion
      : `${conceptos[0].descripcion} y ${conceptos.length - 1} concepto${conceptos.length > 2 ? 's' : ''} más`).slice(0, 255);

    const ins = await pool.request()
      .input('cli', sql.Int, cont.id)
      .input('uuid', sql.NVarChar(40), resultado.uuid || null).input('pac', sql.NVarChar(60), resultado.pacId || null)
      .input('serie', sql.NVarChar(10), resultado.serie || null).input('folio', sql.NVarChar(20), resultado.folio != null ? String(resultado.folio) : null)
      .input('erfc', sql.NVarChar(13), emisor?.rfc || null)
      .input('rrfc', sql.NVarChar(13), receptor.rfc).input('rnom', sql.NVarChar(255), receptor.nombre)
      .input('sub', sql.Decimal(18, 2), subtotal).input('iva', sql.Decimal(18, 2), iva).input('tot', sql.Decimal(18, 2), total)
      .input('uso', sql.NVarChar(4), receptor.usoCfdi || 'G03')
      .input('fp', sql.NVarChar(3), cfdi.formaPago).input('mp', sql.NVarChar(4), cfdi.metodoPago)
      .input('est', sql.NVarChar(20), estatus).input('xml', sql.NVarChar(sql.MAX), resultado.xml || null)
      .input('ft', sql.DateTime, estatus === 'timbrada' ? new Date() : null)
      .input('by', sql.Int, req.user?.id || null).input('con', sql.NVarChar(255), concepto)
      .query(`INSERT INTO dbo.FACTURAS
        (FAC_CLIENTE_ID,FAC_UUID,FAC_PAC_ID,FAC_SERIE,FAC_FOLIO,FAC_EMISOR_RFC,FAC_RECEPTOR_RFC,FAC_RECEPTOR_NOMBRE,
         FAC_SUBTOTAL,FAC_IVA,FAC_TOTAL,FAC_USO_CFDI,FAC_FORMA_PAGO,FAC_METODO_PAGO,FAC_ESTATUS,FAC_XML,FAC_FECHA_TIMBRADO,
         FAC_CREADO_POR,FAC_SALDO,FAC_CONCEPTO)
        OUTPUT INSERTED.FAC_ID id
        VALUES (@cli,@uuid,@pac,@serie,@folio,@erfc,@rrfc,@rnom,@sub,@iva,@tot,@uso,@fp,@mp,@est,@xml,@ft,@by,@tot,@con)`);
    const facId = ins.recordset[0].id;

    await guardarConceptos(pool, facId, conceptos);
    await crearCxcDeFactura(pool, { facId, contId: cont.id, cliente: cont.empresa || cont.nombre, total, concepto });

    // Guardar los datos fiscales en el cliente para la próxima vez.
    if (b.receptor?.rfc) {
      await pool.request().input('id', sql.Int, cont.id)
        .input('rfc', sql.NVarChar(13), receptor.rfc).input('rs', sql.NVarChar(255), receptor.nombre)
        .input('reg', sql.NVarChar(3), receptor.regimenFiscal || null).input('cp', sql.NVarChar(5), receptor.cp || null)
        .input('uso', sql.NVarChar(4), receptor.usoCfdi || null)
        .query(`UPDATE dbo.CRM_CONTACTOS SET CONT_RFC=@rfc, CONT_RAZON_SOCIAL=@rs, CONT_REGIMEN_FISCAL=@reg,
                  CONT_CP_FISCAL=@cp, CONT_USO_CFDI=@uso WHERE CONT_ID=@id`)
        .catch(() => {});
    }

    res.json({ success: true, data: { id: facId, estatus, uuid: resultado.uuid, folio: resultado.folio, serie: resultado.serie, modo: resultado.modo, total } });
  } catch (e) {
    console.error('facturas.manual:', e.message);
    res.status(500).json({ success: false, message: 'Error al generar la factura' });
  }
};

// GET /api/facturas?opoId=&cotId=
exports.list = async (req, res) => {
  try {
    const pool = await _pool(req);
    const rq = pool.request();
    const where = ['1=1'];
    if (req.query.opoId) { rq.input('opo', sql.Int, req.query.opoId); where.push('FAC_OPO_ID=@opo'); }
    if (req.query.cotId) { rq.input('cot', sql.Int, req.query.cotId); where.push('FAC_COT_ID=@cot'); }
    if (req.query.clienteId) { rq.input('cli', sql.Int, req.query.clienteId); where.push('FAC_CLIENTE_ID=@cli'); }
    const r = await rq.query(`SELECT * FROM dbo.FACTURAS WHERE ${where.join(' AND ')} ORDER BY FAC_ID DESC`);
    res.json({ success: true, data: r.recordset.map(mapFactura) });
  } catch (e) {
    console.error('facturas.list:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar facturas' });
  }
};

exports.getById = async (req, res) => {
  try {
    const pool = await _pool(req);
    const r = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM dbo.FACTURAS WHERE FAC_ID=@id');
    if (!r.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: mapFactura(r.recordset[0]) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al obtener la factura' });
  }
};

// POST /api/facturas/desde-cotizacion/:cotId
// body: { receptor: { rfc, nombre, regimenFiscal, cp, usoCfdi }, formaPago, metodoPago }
exports.desdeCotizacion = async (req, res) => {
  const pool = await _pool(req);
  try {
    const cotId = Number(req.params.cotId);
    const cot = await pool.request().input('id', sql.Int, cotId)
      .query(`SELECT c.*, o.OPO_CONTACTO_ID contactoId
              FROM dbo.CRM_COTIZACIONES c
              LEFT JOIN dbo.CRM_OPORTUNIDADES o ON o.OPO_ID = c.COT_OPO_ID
              WHERE c.COT_ID=@id AND c.COT_ACTIVO=1`);
    const c = cot.recordset[0];
    if (!c) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
    if (c.COT_ESTATUS !== 'aprobada') {
      return res.status(400).json({ success: false, message: 'La cotización debe estar aprobada para facturar' });
    }
    if (c.COT_FACTURA_ID) {
      return res.status(400).json({ success: false, message: 'Esta cotización ya tiene una factura' });
    }

    const items = await pool.request().input('id', sql.Int, cotId)
      .query(`SELECT * FROM dbo.CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id AND COTI_ES_SECCION=0 ORDER BY COTI_ORDEN`);
    if (!items.recordset.length) {
      return res.status(400).json({ success: false, message: 'La cotización no tiene renglones facturables' });
    }

    const b = req.body || {};
    let receptor = b.receptor;
    if (!receptor && c.contactoId) {
      const ct = await pool.request().input('id', sql.Int, c.contactoId)
        .query(`SELECT CONT_NOMBRE nombre, CONT_EMPRESA empresa, CONT_RFC rfc, CONT_RAZON_SOCIAL razon,
                       CONT_REGIMEN_FISCAL reg, CONT_CP_FISCAL cp, CONT_USO_CFDI uso
                FROM dbo.CRM_CONTACTOS WHERE CONT_ID=@id`);
      const x = ct.recordset[0];
      if (x && x.rfc) {
        receptor = {
          rfc: x.rfc, nombre: x.razon || x.empresa || x.nombre,
          regimenFiscal: x.reg, cp: x.cp, usoCfdi: x.uso || 'G03',
        };
      }
    }
    if (!receptor || !receptor.rfc || !receptor.nombre) {
      return res.status(400).json({ success: false, message: 'Faltan los datos fiscales del receptor (RFC, razón social, régimen, CP)', code: 'RECEPTOR_REQUERIDO' });
    }

    const conceptos = items.recordset.map((it) => {
      const base = Number(it.COTI_CANTIDAD) * Number(it.COTI_PRECIO_UNIT) * (1 - Number(it.COTI_DESCUENTO || 0) / 100);
      return {
        claveProdServ: it.COTI_CLAVE_PROD_SERV || null,
        claveUnidad: it.COTI_CLAVE_UNIDAD || null,
        cantidad: Number(it.COTI_CANTIDAD),
        descripcion: it.COTI_DESCRIPCION || '',
        valorUnitario: Number(it.COTI_PRECIO_UNIT),
        importe: base,
        ivaTasa: it.COTI_IVA_TASA != null ? Number(it.COTI_IVA_TASA) : 0.16,
      };
    });

    const cfdi = {
      receptor,
      conceptos,
      formaPago: b.formaPago || '99',
      metodoPago: b.metodoPago || 'PUE',
      moneda: 'MXN',
    };

    let resultado;
    try {
      resultado = await facturacionService.timbrar(req.user?.empresa, cfdi);
    } catch (e) {
      // Persistir el intento fallido para trazabilidad, sin bloquear la cotización.
      await pool.request()
        .input('cot', sql.Int, cotId).input('opo', sql.Int, c.COT_OPO_ID)
        .input('cli', sql.Int, c.contactoId || null)
        .input('err', sql.NVarChar(1000), String(e.message || e).slice(0, 1000))
        .input('sub', sql.Decimal(18, 2), c.COT_SUBTOTAL)
        .input('iva', sql.Decimal(18, 2), c.COT_IVA)
        .input('tot', sql.Decimal(18, 2), c.COT_TOTAL)
        .query(`INSERT INTO dbo.FACTURAS (FAC_COT_ID,FAC_OPO_ID,FAC_CLIENTE_ID,FAC_ESTATUS,FAC_ERROR,FAC_SUBTOTAL,FAC_IVA,FAC_TOTAL)
                VALUES (@cot,@opo,@cli,'error',@err,@sub,@iva,@tot)`);
      return res.status(502).json({ success: false, message: `El PAC rechazó el timbrado: ${e.message}` });
    }

    const emisor = await facturacionService.getEmpresaFiscal(req.user?.empresa);
    const estatus = resultado.modo === 'timbrada' ? 'timbrada' : 'pre-factura';

    const ins = await pool.request()
      .input('cot', sql.Int, cotId).input('opo', sql.Int, c.COT_OPO_ID)
      .input('cli', sql.Int, c.contactoId || null)
      .input('uuid', sql.NVarChar(40), resultado.uuid || null)
      .input('pac', sql.NVarChar(60), resultado.pacId || null)
      .input('serie', sql.NVarChar(10), resultado.serie || null)
      // El folio interno de pre-factura llega como número.
      .input('folio', sql.NVarChar(20), resultado.folio != null ? String(resultado.folio) : null)
      .input('erfc', sql.NVarChar(13), emisor?.rfc || null)
      .input('rrfc', sql.NVarChar(13), receptor.rfc)
      .input('rnom', sql.NVarChar(255), receptor.nombre)
      .input('sub', sql.Decimal(18, 2), c.COT_SUBTOTAL)
      .input('iva', sql.Decimal(18, 2), c.COT_IVA)
      .input('tot', sql.Decimal(18, 2), c.COT_TOTAL)
      .input('uso', sql.NVarChar(4), receptor.usoCfdi || 'G03')
      .input('fp', sql.NVarChar(3), cfdi.formaPago)
      .input('mp', sql.NVarChar(4), cfdi.metodoPago)
      .input('est', sql.NVarChar(20), estatus)
      .input('xml', sql.NVarChar(sql.MAX), resultado.xml || null)
      .input('ft', sql.DateTime, estatus === 'timbrada' ? new Date() : null)
      .input('by', sql.Int, req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null)
      .query(`INSERT INTO dbo.FACTURAS
        (FAC_COT_ID,FAC_OPO_ID,FAC_CLIENTE_ID,FAC_UUID,FAC_PAC_ID,FAC_SERIE,FAC_FOLIO,
         FAC_EMISOR_RFC,FAC_RECEPTOR_RFC,FAC_RECEPTOR_NOMBRE,FAC_SUBTOTAL,FAC_IVA,FAC_TOTAL,
         FAC_USO_CFDI,FAC_FORMA_PAGO,FAC_METODO_PAGO,FAC_ESTATUS,FAC_XML,FAC_FECHA_TIMBRADO,FAC_CREADO_POR,
         FAC_SALDO)
        OUTPUT INSERTED.FAC_ID id
        VALUES (@cot,@opo,@cli,@uuid,@pac,@serie,@folio,@erfc,@rrfc,@rnom,@sub,@iva,@tot,
                @uso,@fp,@mp,@est,@xml,@ft,@by,
                @tot)`);
    const facId = ins.recordset[0].id;

    await pool.request().input('fac', sql.Int, facId).input('cot', sql.Int, cotId)
      .query(`UPDATE dbo.CRM_COTIZACIONES SET COT_FACTURA_ID=@fac, COT_ESTATUS='facturada' WHERE COT_ID=@cot`);

    // Guardar los datos fiscales en el contacto para la próxima vez.
    if (c.contactoId && receptor.rfc) {
      await pool.request().input('id', sql.Int, c.contactoId)
        .input('rfc', sql.NVarChar(13), receptor.rfc)
        .input('rs', sql.NVarChar(255), receptor.nombre)
        .input('reg', sql.NVarChar(3), receptor.regimenFiscal || null)
        .input('cp', sql.NVarChar(5), receptor.cp || null)
        .input('uso', sql.NVarChar(4), receptor.usoCfdi || null)
        .query(`UPDATE dbo.CRM_CONTACTOS SET
                  CONT_RFC=@rfc, CONT_RAZON_SOCIAL=@rs, CONT_REGIMEN_FISCAL=@reg,
                  CONT_CP_FISCAL=@cp, CONT_USO_CFDI=@uso
                WHERE CONT_ID=@id`)
        .catch(() => {});
    }

    // Detalle de la factura, y su cuenta por cobrar (Finanzas y ficha del cliente).
    const concepto = `Cotización ${c.COT_FOLIO || `#${cotId}`}${c.COT_TITULO ? ` · ${c.COT_TITULO}` : ''}`;
    await pool.request().input('id', sql.Int, facId).input('c', sql.NVarChar(255), concepto.slice(0, 255))
      .query('UPDATE dbo.FACTURAS SET FAC_CONCEPTO = @c WHERE FAC_ID = @id').catch(() => {});
    await guardarConceptos(pool, facId, items.recordset.map((it) => ({
      psId: it.COTI_PS_ID, descripcion: it.COTI_DESCRIPCION, cantidad: it.COTI_CANTIDAD,
      precioUnit: Number(it.COTI_PRECIO_UNIT) * (1 - Number(it.COTI_DESCUENTO || 0) / 100),
      ivaTasa: it.COTI_IVA_TASA, claveProdServ: it.COTI_CLAVE_PROD_SERV, claveUnidad: it.COTI_CLAVE_UNIDAD,
    })));
    await crearCxcDeFactura(pool, { facId, contId: c.contactoId, cliente: receptor.nombre, total: c.COT_TOTAL, concepto });

    res.json({ success: true, data: { id: facId, estatus, uuid: resultado.uuid, folio: resultado.folio, modo: resultado.modo } });
  } catch (e) {
    console.error('facturas.desdeCotizacion:', e.message);
    res.status(500).json({ success: false, message: 'Error al generar la factura' });
  }
};

exports.cancelar = async (req, res) => {
  try {
    const pool = await _pool(req);
    const { motivo = '02' } = req.body || {};
    const r = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM dbo.FACTURAS WHERE FAC_ID=@id');
    const f = r.recordset[0];
    if (!f) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (f.FAC_ESTATUS === 'cancelada') return res.status(400).json({ success: false, message: 'Ya está cancelada' });

    if (f.FAC_ESTATUS === 'timbrada' && f.FAC_PAC_ID) {
      await facturacionService.cancelar(req.user?.empresa, f.FAC_PAC_ID, motivo);
    }
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.FACTURAS SET FAC_ESTATUS='cancelada', FAC_FECHA_CANCELACION=GETDATE() WHERE FAC_ID=@id`);
    // La cuenta por cobrar que acompañaba a la factura (producto asignado al
    // cliente) ya no se cobra, si seguía pendiente y sin abonos.
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE c FROM FINANZAS_CXC c
              WHERE c.FCC_FAC_ID = @id AND c.FCC_ESTATUS = 'pendiente'
                AND NOT EXISTS (SELECT 1 FROM FINANZAS_INGRESOS i WHERE i.FI_CXC_ID = c.FCC_ID)`)
      .catch((e) => console.warn('facturas.cancelar → CxC:', e.message));
    res.json({ success: true });
  } catch (e) {
    console.error('facturas.cancelar:', e.message);
    res.status(502).json({ success: false, message: `No se pudo cancelar: ${e.message}` });
  }
};

exports.descargar = async (req, res) => {
  try {
    const formato = req.params.formato === 'xml' ? 'xml' : 'pdf';
    const pool = await _pool(req);
    const r = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM dbo.FACTURAS WHERE FAC_ID=@id');
    const f = r.recordset[0];
    if (!f) return res.status(404).send('No encontrada');

    if (formato === 'xml' && f.FAC_XML) {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${f.FAC_SERIE}${f.FAC_FOLIO}.xml"`);
      return res.send(f.FAC_XML);
    }
    if (f.FAC_ESTATUS === 'pre-factura' || !f.FAC_PAC_ID) {
      return res.status(409).json({ success: false, message: 'La pre-factura no tiene PDF/XML fiscal. Timbra primero.' });
    }
    const buf = await facturacionService.descargar(req.user?.empresa, f.FAC_PAC_ID, formato);
    res.setHeader('Content-Type', formato === 'xml' ? 'application/xml' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${f.FAC_SERIE}${f.FAC_FOLIO}.${formato}"`);
    res.send(buf);
  } catch (e) {
    console.error('facturas.descargar:', e.message);
    res.status(502).send('No se pudo descargar el documento');
  }
};

// ── Pagos ────────────────────────────────────────────────────────────────
exports.listPagos = async (req, res) => {
  try {
    const data = await facturacionService.listPagos(req.user?.empresa, Number(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al listar pagos' });
  }
};

exports.registrarPago = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.fechaPago || !b.formaPago || b.monto == null) {
      return res.status(400).json({ success: false, message: 'Faltan fecha, forma de pago o monto' });
    }
    const r = await facturacionService.registrarPago(req.user?.empresa, Number(req.params.id), {
      fechaPago: b.fechaPago, formaPago: b.formaPago, monto: Number(b.monto), moneda: b.moneda || 'MXN',
      usuarioId: req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null,
    });
    res.json({ success: true, data: r });
  } catch (e) {
    console.error('facturas.registrarPago:', e.message);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.cancelarPago = async (req, res) => {
  try {
    await facturacionService.cancelarPago(req.user?.empresa, Number(req.params.pagoId), req.body?.motivo);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// ── Notas de crédito ─────────────────────────────────────────────────────
exports.listNotasCredito = async (req, res) => {
  try {
    const data = await facturacionService.listNotasCredito(req.user?.empresa, Number(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al listar notas de crédito' });
  }
};

exports.emitirNotaCredito = async (req, res) => {
  try {
    const b = req.body || {};
    const r = await facturacionService.emitirNotaCredito(req.user?.empresa, Number(req.params.id), {
      motivo: b.motivo, tipoRelacion: b.tipoRelacion, items: b.items,
      usuarioId: req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null,
    });
    res.json({ success: true, data: r });
  } catch (e) {
    console.error('facturas.emitirNotaCredito:', e.message);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.cancelarNotaCredito = async (req, res) => {
  try {
    await facturacionService.cancelarNotaCredito(req.user?.empresa, Number(req.params.ncId), req.body?.motivo);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.descargarSecundario = async (req, res) => {
  try {
    const tipo = req.params.tipo === 'pago' ? 'pago' : 'nota-credito';
    const formato = req.params.formato === 'xml' ? 'xml' : 'pdf';
    const buf = await facturacionService.descargarSecundario(req.user?.empresa, tipo, Number(req.params.docId), formato);
    res.setHeader('Content-Type', formato === 'xml' ? 'application/xml' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}-${req.params.docId}.${formato}"`);
    res.send(buf);
  } catch (e) {
    res.status(502).send(e.message || 'No se pudo descargar');
  }
};
