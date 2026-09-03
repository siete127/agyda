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
    fechaTimbrado: r.FAC_FECHA_TIMBRADO,
    fechaCancelacion: r.FAC_FECHA_CANCELACION,
    fecha: r.FAC_FECHA,
  };
}

// GET /api/facturas?opoId=&cotId=
exports.list = async (req, res) => {
  try {
    const pool = await _pool(req);
    const rq = pool.request();
    const where = ['1=1'];
    if (req.query.opoId) { rq.input('opo', sql.Int, req.query.opoId); where.push('FAC_OPO_ID=@opo'); }
    if (req.query.cotId) { rq.input('cot', sql.Int, req.query.cotId); where.push('FAC_COT_ID=@cot'); }
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
      .input('folio', sql.NVarChar(20), resultado.folio || null)
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
         FAC_USO_CFDI,FAC_FORMA_PAGO,FAC_METODO_PAGO,FAC_ESTATUS,FAC_XML,FAC_FECHA_TIMBRADO,FAC_CREADO_POR)
        OUTPUT INSERTED.FAC_ID id
        VALUES (@cot,@opo,@cli,@uuid,@pac,@serie,@folio,@erfc,@rrfc,@rnom,@sub,@iva,@tot,
                @uso,@fp,@mp,@est,@xml,@ft,@by)`);
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
