const sql = require('mssql');

// Productos/servicios asignados a un cliente → cuenta por cobrar + pre-factura.
// Al asignarle uno con precio se generan, ligadas entre sí (FCC_FAC_ID):
//  - su CxC (precio + IVA) en Finanzas, ligada al cliente y al producto
//    (FCC_CONT_ID / FCC_PS_ID): "Pendiente de cobro" en la ficha del cliente;
//  - su pre-factura en Facturación (sin timbrar), con el mismo total.
// Cobrarla (desde Cuentas por cobrar o registrando el pago en la factura)
// registra el ingreso y deja ambas como pagadas. Si se le quita el producto
// antes de cobrar, la CxC se elimina y la pre-factura queda cancelada.

const RECURRENCIA_TXT = {
  SEMANAL: 'semanal', QUINCENAL: 'quincenal', MENSUAL: 'mensual', ANUAL: 'anual', UNICO: 'pago único',
};
const DIAS_VENCIMIENTO = 30;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const idsValidos = (psIds) => [...new Set((psIds || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];

// Devuelve { creadas, monto, facturas } con lo que se generó.
async function generarCxcPorProductos(pool, contId, psIds) {
  const ids = idsValidos(psIds);
  if (!ids.length) return { creadas: 0, monto: 0, facturas: 0 };

  const cli = (await pool.request().input('c', sql.Int, contId)
    .query(`SELECT CONT_EMPRESA empresa, CONT_NOMBRE nombre, CONT_RFC rfc, CONT_RAZON_SOCIAL razon, CONT_USO_CFDI uso
            FROM CRM_CONTACTOS WHERE CONT_ID = @c`)).recordset[0];
  if (!cli) return { creadas: 0, monto: 0, facturas: 0 };
  const cliente = String(cli.empresa || cli.nombre || 'Cliente').trim();

  const productos = (await pool.request().query(`
    SELECT PS_ID id, PS_NOMBRE nombre, PS_PRECIO precio, PS_RECURRENCIA recurrencia, ISNULL(PS_IVA_TASA, 0.16) iva
    FROM PRODUCTOS_SERVICIOS WHERE PS_ID IN (${ids.join(',')})`)).recordset;

  const vence = new Date();
  vence.setDate(vence.getDate() + DIAS_VENCIMIENTO);

  let creadas = 0;
  let facturas = 0;
  let monto = 0;
  for (const p of productos) {
    const precio = round2(p.precio || 0);
    if (!(precio > 0)) continue;
    const iva = round2(precio * Number(p.iva || 0));
    const total = round2(precio + iva);
    const recurrencia = RECURRENCIA_TXT[p.recurrencia] || String(p.recurrencia || '').toLowerCase();
    const concepto = `${p.nombre}${recurrencia ? ` (${recurrencia})` : ''}`.slice(0, 255);
    // Si ya tiene una pendiente por ese producto (lo quitaron y volvieron a
    // poner sin cobrar), no se duplica ni la CxC ni la pre-factura.
    const r = await pool.request()
      .input('cli', sql.NVarChar(255), cliente.slice(0, 255))
      .input('sub', sql.Decimal(18, 2), precio)
      .input('iva', sql.Decimal(18, 2), iva)
      .input('monto', sql.Decimal(18, 2), total)
      .input('vence', sql.Date, vence)
      .input('concepto', sql.NVarChar(255), concepto)
      .input('cont', sql.Int, contId)
      .input('ps', sql.Int, p.id)
      .input('rfc', sql.NVarChar(13), cli.rfc ? String(cli.rfc).slice(0, 13) : null)
      .input('rnom', sql.NVarChar(255), String(cli.razon || cliente).slice(0, 255))
      .input('uso', sql.NVarChar(4), cli.uso || null)
      .query(`
        DECLARE @fac INT = NULL, @creada BIT = 0;
        IF NOT EXISTS (SELECT 1 FROM FINANZAS_CXC WHERE FCC_CONT_ID = @cont AND FCC_PS_ID = @ps AND FCC_ESTATUS = 'pendiente')
        BEGIN
          IF OBJECT_ID('dbo.FACTURAS','U') IS NOT NULL
          BEGIN
            INSERT INTO dbo.FACTURAS (FAC_CLIENTE_ID, FAC_RECEPTOR_RFC, FAC_RECEPTOR_NOMBRE, FAC_SUBTOTAL, FAC_IVA, FAC_TOTAL,
                                      FAC_USO_CFDI, FAC_ESTATUS, FAC_SALDO, FAC_CONCEPTO)
            VALUES (@cont, @rfc, @rnom, @sub, @iva, @monto, @uso, 'pre-factura', @monto, @concepto);
            SET @fac = SCOPE_IDENTITY();
          END
          INSERT INTO FINANZAS_CXC (FCC_CLIENTE, FCC_MONTO, FCC_FECHA_VENCIMIENTO, FCC_ESTATUS, FCC_CONCEPTO, FCC_CONT_ID, FCC_PS_ID, FCC_FAC_ID)
          VALUES (@cli, @monto, @vence, 'pendiente', @concepto, @cont, @ps, @fac);
          SET @creada = 1;
        END
        SELECT @creada creada, @fac facId;`);
    const fila = r.recordset[0] || {};
    if (fila.creada) {
      creadas++;
      if (fila.facId) facturas++;
      monto = round2(monto + total);
    }
  }
  return { creadas, monto, facturas };
}

// Al quitarle productos: elimina sus CxC aún pendientes y sin abonos, y
// cancela su pre-factura. Devuelve cuántas.
async function cancelarCxcPorProductos(pool, contId, psIds) {
  const ids = idsValidos(psIds);
  if (!ids.length) return 0;
  const r = await pool.request().input('cont', sql.Int, contId).query(`
    DECLARE @x TABLE (cxc INT, fac INT);
    INSERT INTO @x
      SELECT FCC_ID, FCC_FAC_ID FROM FINANZAS_CXC c
      WHERE FCC_CONT_ID = @cont AND FCC_PS_ID IN (${ids.join(',')}) AND FCC_ESTATUS = 'pendiente'
        AND NOT EXISTS (SELECT 1 FROM FINANZAS_INGRESOS i WHERE i.FI_CXC_ID = c.FCC_ID);
    IF OBJECT_ID('dbo.FACTURAS','U') IS NOT NULL
      UPDATE dbo.FACTURAS SET FAC_ESTATUS = 'cancelada', FAC_FECHA_CANCELACION = GETDATE()
      WHERE FAC_ID IN (SELECT fac FROM @x WHERE fac IS NOT NULL) AND FAC_ESTATUS = 'pre-factura';
    DELETE FROM FINANZAS_CXC WHERE FCC_ID IN (SELECT cxc FROM @x);
    SELECT COUNT(*) n FROM @x;`);
  return r.recordset[0]?.n || 0;
}

module.exports = { generarCxcPorProductos, cancelarCxcPorProductos };
