const sql = require('mssql');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const { asegurarAncla } = require('./portalAnclaService');

// Productos/servicios de un cliente ligados a su factura, y el aviso al cliente.
// Al agregarlos desde Clientes se factura primero: quedan 'pendiente-pago'
// (CCPS_FAC_ID = la factura) y solo al validarse el pago pasan a 'activo' y
// se avisa al cliente (portal + correo con "Soporte técnico").

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://agyda.ardabytec.vip';
const idsValidos = (psIds) => [...new Set((psIds || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];

// Aviso al cliente de que se le asignó un producto/servicio: notificación en su
// portal y correo con el botón "Soporte técnico" (abre /portal-cliente con el
// chat de su asesor, o el aviso para pedir uno). Sin usuarios del portal, un
// correo a su contacto sin enlace. Devuelve el resumen para la pantalla.
// retirado=true: el mismo aviso, pero de que se le QUITÓ (con Soporte técnico por dudas).
async function avisarProductoAsignado(pool, tenantKey, contId, psIds, { retirado = false } = {}) {
  const ids = idsValidos(psIds);
  const productos = ids.length ? (await pool.request()
    .query(`SELECT PS_NOMBRE nombre FROM PRODUCTOS_SERVICIOS WHERE PS_ID IN (${ids.join(',')}) ORDER BY PS_NOMBRE`)).recordset.map((r) => r.nombre) : [];
  // "A", "A y B", "A, B y C"
  const productoNombre = productos.length <= 1 ? (productos[0] || 'tu producto')
    : `${productos.slice(0, -1).join(', ')} y ${productos[productos.length - 1]}`;
  const psId = ids[0];
  // Si su acceso (Clientes → Acceso al sistema) aún no está en el portal, se
  // registra como su cuenta principal para que reciba el botón de soporte.
  await asegurarAncla(pool, { contId }).catch(() => 0);
  const usuarios = (await pool.request().input('c', sql.Int, contId).query(`
    SELECT u.NEUS_ID id, u.NEUS_NOMBRES nombre,
           COALESCE(NULLIF(u.NEUS_CORREO, ''), CASE WHEN u.NEUS_USUARIO LIKE '%_@_%._%' THEN u.NEUS_USUARIO END) correo
    FROM PORTAL_USUARIOS pu JOIN NEUS_USUARIOS u ON u.NEUS_ID = pu.PU_NEUS_ID AND u.NEUS_ACTIVO = 1
    WHERE pu.PU_CONT_ID = @c AND pu.PU_ACTIVO = 1`)).recordset;
  const linkPortal = `${BASE_URL}/portal-cliente`;
  const linkSoporte = `${linkPortal}?soporte=1`;
  let correos = 0;

  if (usuarios.length) {
    for (const u of usuarios) {
      await notificationService.createNotification({
        usuarioId: u.id,
        mensaje: (retirado
          ? `Se retiró de tu cuenta: ${productoNombre}. ¿Dudas? Abre Soporte técnico.`
          : `Ya tienes asignado: ${productoNombre}. ¿Necesitas ayuda? Abre Soporte técnico.`).slice(0, 480),
        tipo: retirado ? 'cliente-producto-retirado' : 'cliente-producto-asignado',
        dataExtra: { productoServicioId: psId, productoServicioIds: ids, soporte: true },
        tenantKey,
      }).catch(() => {});
      if (u.correo) {
        const r = await emailService.sendProductoAsignadoEmail({ nombre: u.nombre, correo: u.correo, productoNombre, productos, linkSoporte, linkPortal, retirado });
        if (r?.enviado) correos++;
      }
    }
    return { conPortal: true, usuarios: usuarios.length, correos, productoNombre, productos: productos.length };
  }

  const cont = (await pool.request().input('c', sql.Int, contId)
    .query('SELECT CONT_NOMBRE nombre, CONT_CORREO correo FROM CRM_CONTACTOS WHERE CONT_ID = @c')).recordset[0];
  if (cont?.correo) {
    const r = await emailService.sendProductoAsignadoEmail({ nombre: cont.nombre, correo: cont.correo, productoNombre, productos, retirado });
    if (r?.enviado) correos++;
  }
  return { conPortal: false, usuarios: 0, correos, productoNombre, productos: productos.length };
}

// Liga al cliente los productos de una factura recién emitida, pendientes de
// pago. Lo que ya tenía activo (p. ej. una renovación) se queda activo.
async function asignarPendientesDeFactura(pool, contId, psIds, facId) {
  const ids = idsValidos(psIds);
  for (const ps of ids) {
    await pool.request().input('c', sql.Int, contId).input('ps', sql.Int, ps).input('fac', sql.Int, facId).query(`
      IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @c AND CCPS_PS_ID = @ps)
        INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID, CCPS_ESTATUS, CCPS_FAC_ID)
        VALUES (@c, @ps, 'pendiente-pago', @fac)
      ELSE
        UPDATE CRM_CONTACTO_PRODUCTOS_SERVICIOS SET CCPS_FAC_ID = @fac
        WHERE CCPS_CONT_ID = @c AND CCPS_PS_ID = @ps AND CCPS_ESTATUS = 'pendiente-pago'`);
  }
  return ids.length;
}

// Pago validado (factura liquidada): sus productos pendientes pasan a activos
// y ahora sí se avisa al cliente. Devuelve el aviso o null si no había nada.
async function activarProductosDeFactura(pool, tenantKey, facId) {
  const r = await pool.request().input('fac', sql.Int, facId).query(`
    UPDATE CRM_CONTACTO_PRODUCTOS_SERVICIOS SET CCPS_ESTATUS = 'activo', CCPS_FECHA_ASIGNACION = GETDATE()
    OUTPUT INSERTED.CCPS_CONT_ID cont, INSERTED.CCPS_PS_ID ps
    WHERE CCPS_FAC_ID = @fac AND CCPS_ESTATUS = 'pendiente-pago'`);
  const filas = r.recordset || [];
  if (!filas.length) return null;
  const contId = filas[0].cont;
  return avisarProductoAsignado(pool, tenantKey, contId, filas.map((f) => f.ps));
}

// Se canceló el pago de la factura: sus productos vuelven a pendientes.
async function revertirProductosDeFactura(pool, facId) {
  await pool.request().input('fac', sql.Int, facId).query(`
    UPDATE CRM_CONTACTO_PRODUCTOS_SERVICIOS SET CCPS_ESTATUS = 'pendiente-pago'
    WHERE CCPS_FAC_ID = @fac AND CCPS_ESTATUS = 'activo'`);
}

// Se canceló la factura: los productos que esperaban ese pago se retiran.
async function quitarPendientesDeFactura(pool, facId) {
  const r = await pool.request().input('fac', sql.Int, facId).query(`
    DELETE FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_FAC_ID = @fac AND CCPS_ESTATUS = 'pendiente-pago'`);
  return (r.rowsAffected || []).reduce((s, n) => s + n, 0);
}

module.exports = {
  avisarProductoAsignado,
  asignarPendientesDeFactura,
  activarProductosDeFactura,
  revertirProductosDeFactura,
  quitarPendientesDeFactura,
};
