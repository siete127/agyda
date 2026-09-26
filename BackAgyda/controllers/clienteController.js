const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const { errorCorreoObligatorio } = require('../utils/validacionesMx');
const notificationService = require('../services/notificationService');
const { asegurarAncla } = require('../services/portalAnclaService');
const { generarCxcPorProductos, cancelarCxcPorProductos } = require('../services/cxcProductosService');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://agyda.ardabytec.vip';

exports.getProductos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT PROD_ID as id, PROD_NOMBRE as name, PROD_ACTIVO as active
      FROM PRODUCTOS ORDER BY PROD_NOMBRE ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando productos:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.getServicios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT SERV_ID as id, SERV_NOMBRE as name, SERV_ACTIVO as active
      FROM SERVICIOS ORDER BY SERV_NOMBRE ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando servicios:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// Productos/servicios contratados por un cliente. CLIENTES (legacy) fue
// absorbida por CRM_CONTACTOS — "id" aquí es CONT_ID, y el puente moderno
// CRM_CONTACTO_PRODUCTOS_SERVICIOS (ya usado por crmContactosController.js)
// reemplaza a la tabla legacy CLIENTE_PRODUCTOS_SERVICIOS.
exports.getProductosServiciosCliente = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID de cliente inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          CCPS.CCPS_ID as id, PS.PS_ID as productoServicioId, PS.PS_TIPO as tipo,
          PS.PS_NOMBRE as nombre, PS.PS_DESCRIPCION as descripcion,
          PS.PS_PRECIO as precio, PS.PS_RECURRENCIA as recurrencia,
          CCPS.CCPS_FECHA_ASIGNACION as fechaAlta
        FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS CCPS
        JOIN PRODUCTOS_SERVICIOS PS ON PS.PS_ID = CCPS.CCPS_PS_ID
        WHERE CCPS.CCPS_CONT_ID = @id
        ORDER BY PS.PS_NOMBRE ASC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando productos/servicios del cliente:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// GET /clientes/:id/finanzas — resumen informativo de lo facturado/cobrado a un
// cliente, tomado del módulo de Finanzas. FINANZAS_INGRESOS no tiene columna de
// cliente, así que se cruza por el nombre de la empresa en el concepto; las
// cuentas por cobrar (FINANZAS_CXC) sí guardan el nombre del cliente. Es solo
// lectura — la gestión real se hace en el módulo de Finanzas.
exports.getFinanzasCliente = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID de cliente inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    const cli = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CONT_EMPRESA as empresa, CONT_NOMBRE as nombre FROM CRM_CONTACTOS WHERE CONT_ID = @id`);
    if (!cli.recordset.length) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    const { empresa, nombre } = cli.recordset[0];
    const patron = `%${(empresa || nombre || '').trim()}%`;

    // Ingresos del cliente: los de cobros de CxC y pagos de factura van ligados
    // por FI_CONT_ID; los capturados a mano, solo por el nombre en el concepto.
    const ingresosDelCliente = `((FI_CONT_ID = @id) OR (FI_CONT_ID IS NULL AND @p <> '%%' AND FI_CONCEPTO LIKE @p))`;
    const ingresos = await pool.request()
      .input('p', sql.NVarChar, patron)
      .input('id', sql.Int, id)
      .query(`
        SELECT ISNULL(SUM(FI_MONTO), 0) as total, COUNT(*) as n,
               MAX(FI_FECHA) as ultima
        FROM FINANZAS_INGRESOS
        WHERE ${ingresosDelCliente}
      `).catch(() => ({ recordset: [{ total: 0, n: 0, ultima: null }] }));

    // CxC del cliente: las generadas al asignarle productos van ligadas por
    // FCC_CONT_ID; las capturadas a mano en Finanzas, solo por el nombre. Lo
    // ya cobrado con ingreso ligado (FI_CXC_ID) ya está en los ingresos: aquí
    // solo cuenta lo que falta por cobrar (monto − abonos).
    const cxcDelCliente = `((FCC_CONT_ID = @id) OR (FCC_CONT_ID IS NULL AND @p <> '%%' AND FCC_CLIENTE LIKE @p))`;
    const sinIngreso = `NOT EXISTS (SELECT 1 FROM FINANZAS_INGRESOS fi WHERE fi.FI_CXC_ID = FCC_ID)`;
    const cxc = await pool.request()
      .input('p', sql.NVarChar, patron)
      .input('id', sql.Int, id)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN FCC_ESTATUS IN ('pagada','pagado','cobrada','cobrado') AND ab.monto IS NULL THEN FCC_MONTO ELSE 0 END), 0) as cobrado,
          ISNULL(SUM(CASE WHEN FCC_ESTATUS NOT IN ('pagada','pagado','cobrada','cobrado','cancelada','cancelado')
                          AND FCC_MONTO > ISNULL(ab.monto, 0) THEN FCC_MONTO - ISNULL(ab.monto, 0) ELSE 0 END), 0) as pendiente,
          SUM(CASE WHEN ab.monto IS NULL THEN 1 ELSE 0 END) as n
        FROM FINANZAS_CXC
        OUTER APPLY (SELECT SUM(fi.FI_MONTO) monto FROM FINANZAS_INGRESOS fi WHERE fi.FI_CXC_ID = FCC_ID) ab
        WHERE ${cxcDelCliente}
      `).catch(() => ({ recordset: [{ cobrado: 0, pendiente: 0, n: 0 }] }));

    // Histórico por mes de los últimos 12 meses (ingresos + CxC cobradas).
    const historicoRs = await pool.request()
      .input('p', sql.NVarChar, patron)
      .input('id', sql.Int, id)
      .query(`
        SELECT FORMAT(fecha, 'yyyy-MM') as mes, SUM(monto) as total
        FROM (
          SELECT FI_FECHA as fecha, FI_MONTO as monto
          FROM FINANZAS_INGRESOS
          WHERE ${ingresosDelCliente} AND FI_FECHA >= DATEADD(month, -12, CAST(GETDATE() AS date))
          UNION ALL
          SELECT COALESCE(FCC_FECHA_PAGO, FCC_FECHA_VENCIMIENTO) as fecha, FCC_MONTO as monto
          FROM FINANZAS_CXC
          WHERE ${cxcDelCliente} AND ${sinIngreso}
            AND FCC_ESTATUS IN ('pagada','pagado','cobrada','cobrado')
            AND COALESCE(FCC_FECHA_PAGO, FCC_FECHA_VENCIMIENTO) >= DATEADD(month, -12, CAST(GETDATE() AS date))
        ) x
        GROUP BY FORMAT(fecha, 'yyyy-MM')
        ORDER BY mes
      `).catch(() => ({ recordset: [] }));

    const i = ingresos.recordset[0];
    const c = cxc.recordset[0];
    return res.json({
      success: true,
      data: {
        // "ingresado por factura": ingresos registrados + CxC ya cobradas
        totalIngresado: Number(i.total || 0) + Number(c.cobrado || 0),
        pendienteCobro: Number(c.pendiente || 0),
        registros: Number(i.n || 0) + Number(c.n || 0),
        ultimaFecha: i.ultima || null,
        historico: historicoRs.recordset.map((r) => ({ mes: r.mes, total: Number(r.total || 0) })),
      },
    });
  } catch (e) {
    console.error('Error resumen de finanzas del cliente:', e);
    return res.json({ success: true, data: { totalIngresado: 0, pendienteCobro: 0, registros: 0, ultimaFecha: null, historico: [] } });
  }
};

// Aviso al cliente de que se le asignó un producto/servicio: notificación en su
// portal y correo con el botón "Soporte técnico" (abre /portal-cliente con el
// chat de su asesor, o el aviso para pedir uno). Sin usuarios del portal, un
// correo a su contacto sin enlace. Devuelve el resumen para la pantalla.
// retirado=true: el mismo aviso, pero de que se le QUITÓ (con Soporte técnico por dudas).
async function avisarProductoAsignado(pool, req, contId, psIds, { retirado = false } = {}) {
  const ids = psIds.map(Number).filter(Boolean);
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
        tenantKey: req.user?.empresa,
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

exports.asignarProductoServicio = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Uno (productoServicioId) o varios (productoServicioIds) a la vez.
    const psIds = [...new Set((Array.isArray(req.body.productoServicioIds) ? req.body.productoServicioIds : [req.body.productoServicioId])
      .map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x > 0))];
    if (!Number.isInteger(id) || id <= 0 || !psIds.length) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const nuevosIds = [];
    for (const psId of psIds) {
      const ins = await pool.request()
        .input('contId', sql.Int, id)
        .input('psId', sql.Int, psId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @contId AND CCPS_PS_ID = @psId)
            INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)
        `);
      if ((ins.rowsAffected || []).some((n) => n > 0)) nuevosIds.push(psId);
    }
    const nuevos = nuevosIds.length;
    // Lo recién asignado genera su cuenta por cobrar en Finanzas.
    const cxc = await generarCxcPorProductos(pool, id, nuevosIds).catch((e) => {
      console.warn('asignarProductoServicio CxC:', e.message);
      return null;
    });
    // Cada vez que se da "Agregar" se avisa al cliente (aunque ya lo tuviera),
    // con UN solo aviso para todo lo asignado en esta vez.
    const aviso = await avisarProductoAsignado(pool, req, id, psIds).catch((e) => {
      console.warn('asignarProductoServicio aviso al cliente:', e.message);
      return null;
    });
    return res.status(201).json({ success: true, data: { nuevo: nuevos > 0, nuevos, aviso, cxc } });
  } catch (e) {
    console.error('Error asignando producto/servicio a cliente:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.quitarProductoServicio = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const psId = parseInt(req.params.psId, 10);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(psId) || psId <= 0) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const del = await pool.request()
      .input('contId', sql.Int, id)
      .input('psId', sql.Int, psId)
      .query(`DELETE FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @contId AND CCPS_PS_ID = @psId`);
    const quitado = (del.rowsAffected || []).some((n) => n > 0);
    // Su cuenta por cobrar, si aún no se cobraba, deja de existir.
    const cxcCanceladas = await cancelarCxcPorProductos(pool, id, [psId]).catch((e) => {
      console.warn('quitarProductoServicio CxC:', e.message);
      return 0;
    });
    // Avisar al cliente solo si de verdad lo tenía (correo + su portal).
    const aviso = quitado ? await avisarProductoAsignado(pool, req, id, [psId], { retirado: true }).catch((e) => {
      console.warn('quitarProductoServicio aviso al cliente:', e.message);
      return null;
    }) : null;
    return res.json({ success: true, data: { quitado, aviso, cxcCanceladas } });
  } catch (e) {
    console.error('Error quitando producto/servicio de cliente:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// El módulo Clientes ahora lee/escribe sobre CRM_CONTACTOS (CLIENTES fue
// absorbida) — solo contactos marcados CONT_ES_CLIENTE=1, para no listar los
// ~80 contactos/prospectos del CRM que no son clientes formales. Los alias de
// salida (id/empresa/nombre/...) se mantienen idénticos a los de la tabla
// legacy para que el frontend (ClientesPage.tsx) no requiera cambios.
exports.getClientes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        C.CONT_ID as id,
        C.CONT_NEUS_ID as neusId,
        NU.NEUS_ACTIVO as accesoActivo,
        NU.NEUS_USUARIO as accesoUsuario,
        C.CONT_EMPRESA as empresa,
        C.CONT_RFC as rfc,
        C.CONT_NOMBRE as nombre,
        C.CONT_TELEFONO as telefono,
        C.CONT_CIUDAD as ciudad,
        C.CONT_CORREO as correo,
        C.CONT_ACTIVO as activo,
        C.CONT_FECHA as fechaRegistro,
        C.CONT_CALLE as calle,
        C.CONT_NUM_EXT as numExt,
        C.CONT_NUM_INT as numInt,
        C.CONT_COLONIA as colonia,
        C.CONT_CP as cp,
        C.CONT_PAIS as pais,
        C.CONT_OBSERVACIONES as observaciones
      FROM CRM_CONTACTOS C
      LEFT JOIN NEUS_USUARIOS NU ON NU.NEUS_ID = C.CONT_NEUS_ID
      WHERE C.CONT_ES_CLIENTE = 1
      ORDER BY C.CONT_EMPRESA ASC, C.CONT_NOMBRE ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    console.error('Error getClientes:', err);
    res.status(500).json({ success: false, message: 'Error fetching clientes' });
  }
};
exports.createCliente = async (req, res) => {
  try {
    const {
      neusId,
      empresa,
      nombre,
      telefono,
      domicilio,
      ciudad,
      correo,
      activo,
      password,
      calle,
      numExt,
      numInt,
      colonia,
      cp,
      rfc,
      pais,
      observaciones
    } = req.body;

    // El correo del cliente es obligatorio y debe poder recibir correo.
    const errorCorreo = await errorCorreoObligatorio(correo);
    if (errorCorreo) return res.status(400).json({ success: false, message: errorCorreo, campo: 'correo' });

    if ((!empresa || empresa.toString().trim() === '') && (!nombre || nombre.toString().trim() === '')) {
      return res.status(400).json({ success: false, message: 'Falta empresa o nombre del cliente' });
    }

    // Debug logging
    console.info('POST /api/clientes body:', {
      neusId,
      empresa,
      nombre,
      telefono,
      domicilio,
      ciudad,
      correo,
      activo,
      password: password ? '[REDACTED]' : null,
      rfc
    });

    // Parse neusId strictly: only positive integers are accepted
    const parsedNeusId = (neusId === undefined || neusId === null || String(neusId).trim() === '') ? null : parseInt(neusId, 10);
    const hasNeusId = Number.isInteger(parsedNeusId) && parsedNeusId > 0;
    console.info('parsedNeusId:', parsedNeusId, 'hasNeusId:', hasNeusId);

    const pool = await databaseService.getPool(req.user?.empresa);

    // Transacción: si hace falta crear un NEUS_USUARIOS y luego el contacto,
    // que ambos pasen o ninguno.
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      const trRequest = transaction.request();

      let finalNeusId = parsedNeusId;

      // If no valid neusId provided, create a NEUS_USUARIOS record and use its id
      if (!hasNeusId) {
        // Derive sensible defaults for new user
        const neusNombres = (nombre && nombre.trim() !== '') ? nombre : (empresa || 'Cliente');
        // IMPORTANT: Use correo (email) as NEUS_USUARIO if provided, otherwise generate a default
        const neusUsuario = (correo && String(correo).trim() !== '' && correo.toString().includes('@')) ? correo : `cliente${Date.now()}`;
        const neusContra = (password === undefined || password === null) ? '' : String(password);

        const createUserResult = await trRequest
          .input('neusNombres', sql.NVarChar, neusNombres)
          .input('neusUsuario', sql.NVarChar, neusUsuario)
          .input('neusContra', sql.NVarChar, neusContra)
          .input('status', sql.Bit, 1)
          .input('base', sql.NVarChar, '1')
          .query(`
            INSERT INTO NEUS_USUARIOS (NEUS_NOMBRES, NEUS_USUARIO, NEUS_CONTRA, NEUS_TIPOUSUARIO, NEUS_ACTIVO, NEUS_STATUS, NEUS_BASE, NEUS_FECHA_REGISTRO)
            VALUES (@neusNombres, @neusUsuario, @neusContra, 'CL', 1, @status, @base, GETDATE());
            SELECT SCOPE_IDENTITY() as id;
          `);

        finalNeusId = createUserResult.recordset && createUserResult.recordset[0] ? createUserResult.recordset[0].id : null;
        if (!finalNeusId) throw new Error('No se pudo crear NEUS_USUARIOS');
      } else {
        // If we have an existing NEUS_ID and possibly a password, update the usuario
        if (password !== undefined && password !== null) {
          await trRequest
            .input('neusId', sql.Int, finalNeusId)
            .input('password', sql.NVarChar, String(password))
            .query(`UPDATE NEUS_USUARIOS SET NEUS_CONTRA = ISNULL(@password, NEUS_CONTRA) WHERE NEUS_ID = @neusId`);
        }
        // Also ensure tipo usuario is CL
        await trRequest
          .input('neusId', sql.Int, finalNeusId)
          .query(`UPDATE NEUS_USUARIOS SET NEUS_TIPOUSUARIO = 'CL' WHERE NEUS_ID = @neusId`);
      }

      // Insertar el contacto usando finalNeusId (garantizado no-nulo).
      // Map domicilio -> calle if calle not provided
      const calleFinal = (calle && String(calle).trim() !== '') ? calle : (domicilio || null);

      const insReq = transaction.request()
        .input('neusIdFinal', sql.Int, finalNeusId)
        .input('empresa', sql.NVarChar, empresa || null)
        .input('nombre', sql.NVarChar, nombre || (empresa || 'Cliente'))
        .input('telefono', sql.NVarChar, telefono || null)
        .input('ciudad', sql.NVarChar, ciudad || null)
        .input('correo', sql.NVarChar, correo || null)
        .input('rfc', sql.NVarChar, rfc || null)
        .input('activo', sql.Bit, (activo === undefined || activo === null) ? 1 : (activo ? 1 : 0))
        .input('calle', sql.NVarChar, calleFinal || null)
        .input('numExt', sql.NVarChar, numExt || null)
        .input('numInt', sql.NVarChar, numInt || null)
        .input('colonia', sql.NVarChar, colonia || null)
        .input('cp', sql.NVarChar, cp || null)
        .input('pais', sql.NVarChar, pais || null)
        .input('observaciones', sql.NVarChar, observaciones || null);

      const insertClienteResult = await insReq.query(`
        INSERT INTO CRM_CONTACTOS (CONT_NEUS_ID, CONT_EMPRESA, CONT_RFC, CONT_NOMBRE, CONT_TELEFONO, CONT_CIUDAD, CONT_CORREO, CONT_ACTIVO, CONT_FECHA, CONT_CALLE, CONT_NUM_EXT, CONT_NUM_INT, CONT_COLONIA, CONT_CP, CONT_PAIS, CONT_OBSERVACIONES, CONT_ES_CLIENTE)
        VALUES (@neusIdFinal, @empresa, @rfc, @nombre, @telefono, @ciudad, @correo, @activo, GETDATE(), @calle, @numExt, @numInt, @colonia, @cp, @pais, @observaciones, 1);
        SELECT SCOPE_IDENTITY() as id;
      `);

      const createdId = insertClienteResult.recordset && insertClienteResult.recordset[0] ? insertClienteResult.recordset[0].id : null;

        // Guardar productos y servicios seleccionados si vienen en el body
        const productos = Array.isArray(req.body.productos) ? req.body.productos : (req.body.productos ? [req.body.productos] : []);
        const servicios = Array.isArray(req.body.servicios) ? req.body.servicios : (req.body.servicios ? [req.body.servicios] : []);
        // El módulo Clientes distinguía productos/servicios en catálogos separados
        // (PRODUCTOS/SERVICIOS); el puente moderno CRM_CONTACTO_PRODUCTOS_SERVICIOS
        // los unifica sobre PRODUCTOS_SERVICIOS (PS_ID), así que ambas listas se
        // insertan igual, solo tratando cada id como un PS_ID.
        const psIds = [...productos, ...servicios];

        if (createdId) {
          for (const p of psIds) {
            const psId = parseInt(p, 10);
            if (!Number.isInteger(psId) || psId <= 0) continue;
            await transaction.request()
              .input('contId', sql.Int, createdId)
              .input('psId', sql.Int, psId)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @contId AND CCPS_PS_ID = @psId)
                  INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)
              `);
          }
        }

        await transaction.commit();

        return res.status(201).json({ success: true, data: { id: createdId, neusId: finalNeusId } });
    } catch (txErr) {
      try { await transaction.rollback(); } catch (rErr) { /* ignore */ }
      console.error('Transaction error creando cliente:', txErr);
      return res.status(500).json({ success: false, message: txErr.message || 'Error creando cliente' });
    }

  } catch (e) {
    console.error('Error creando cliente:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateCliente = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID de cliente inválido' });
    }

    const {
      neusId,
      empresa,
      nombre,
      telefono,
      ciudad,
      correo,
      activo,
      password,
      calle,
      numExt,
      numInt,
      colonia,
      cp,
      rfc,
      pais,
      activarAcceso,
      enviarInvitacion,
      observaciones,
    } = req.body;

    // Si se manda el correo (edición del formulario), debe ser válido; los
    // cambios parciales (p. ej. solo { activo }) no lo traen y no se validan.
    if (correo !== undefined) {
      const errorCorreo = await errorCorreoObligatorio(correo);
      if (errorCorreo) return res.status(400).json({ success: false, message: errorCorreo, campo: 'correo' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      // Activar/desactivar el acceso al sistema sin borrar el usuario —
      // toggle independiente del password/correo de abajo.
      if (activarAcceso !== undefined && neusId) {
        await transaction.request()
          .input('neusId', sql.Int, neusId)
          .input('activo', sql.Bit, activarAcceso ? 1 : 0)
          .query(`UPDATE NEUS_USUARIOS SET NEUS_ACTIVO = @activo WHERE NEUS_ID = @neusId`);
      }

      // Update NEUS_USUARIOS password and/or correo as NEUS_USUARIO if provided
      // (request propio — no compartir parámetros con el UPDATE de CRM_CONTACTOS de abajo).
      if ((password !== undefined && password !== null) || (correo !== undefined && correo !== null)) {
        let updateQuery = 'UPDATE NEUS_USUARIOS SET ';
        const updateFields = [];
        let neusReq = transaction.request();

        if (password !== undefined && password !== null) {
          updateFields.push('NEUS_CONTRA = @password');
          neusReq = neusReq.input('password', sql.NVarChar, String(password));
        }

        if (correo !== undefined && correo !== null && String(correo).trim() !== '') {
          updateFields.push('NEUS_USUARIO = @correo');
          neusReq = neusReq.input('correo', sql.NVarChar, String(correo));
        }

        if (updateFields.length > 0) {
          updateQuery += updateFields.join(', ') + ' WHERE NEUS_ID = @neusId';
          await neusReq.input('neusId', sql.Int, neusId || null).query(updateQuery);
        }
      }

      // Update CRM_CONTACTOS fields
      await transaction.request()
        .input('id', sql.Int, id)
        .input('empresa', sql.NVarChar, empresa || null)
        .input('nombre', sql.NVarChar, nombre || null)
        .input('telefono', sql.NVarChar, telefono || null)
        .input('ciudad', sql.NVarChar, ciudad || null)
        .input('correo', sql.NVarChar, correo || null)
        .input('rfc', sql.NVarChar, rfc || null)
        .input('activo', sql.Bit, (activo === undefined || activo === null) ? null : (activo ? 1 : 0))
        .input('calle', sql.NVarChar, calle || null)
        .input('numExt', sql.NVarChar, numExt || null)
        .input('numInt', sql.NVarChar, numInt || null)
        .input('colonia', sql.NVarChar, colonia || null)
        .input('cp', sql.NVarChar, cp || null)
        .input('pais', sql.NVarChar, pais || null)
        .input('observaciones', sql.NVarChar, observaciones || null)
        .query(`
          UPDATE CRM_CONTACTOS SET
            CONT_EMPRESA = COALESCE(@empresa, CONT_EMPRESA),
            CONT_NOMBRE = COALESCE(@nombre, CONT_NOMBRE),
            CONT_TELEFONO = COALESCE(@telefono, CONT_TELEFONO),
            CONT_CIUDAD = COALESCE(@ciudad, CONT_CIUDAD),
            CONT_CORREO = COALESCE(@correo, CONT_CORREO),
            CONT_RFC = COALESCE(@rfc, CONT_RFC),
            CONT_CALLE = COALESCE(@calle, CONT_CALLE),
            CONT_NUM_EXT = COALESCE(@numExt, CONT_NUM_EXT),
            CONT_NUM_INT = COALESCE(@numInt, CONT_NUM_INT),
            CONT_COLONIA = COALESCE(@colonia, CONT_COLONIA),
            CONT_CP = COALESCE(@cp, CONT_CP),
            CONT_PAIS = COALESCE(@pais, CONT_PAIS),
            CONT_OBSERVACIONES = COALESCE(@observaciones, CONT_OBSERVACIONES),
            CONT_ACTIVO = CASE WHEN @activo IS NULL THEN CONT_ACTIVO ELSE @activo END
          WHERE CONT_ID = @id
        `);

      // Si vienen listas de productos/servicios, reemplazarlas (borrar existentes e insertar nuevas)
      const productos = Array.isArray(req.body.productos) ? req.body.productos : (req.body.productos ? [req.body.productos] : []);
      const servicios = Array.isArray(req.body.servicios) ? req.body.servicios : (req.body.servicios ? [req.body.servicios] : []);
      const psIds = [...productos, ...servicios];

      if (psIds.length > 0) {
        await transaction.request().input('id', sql.Int, id).query(`DELETE FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @id`);
        for (const p of psIds) {
          const psId = parseInt(p, 10);
          if (!Number.isInteger(psId) || psId <= 0) continue;
          await transaction.request()
            .input('contId', sql.Int, id)
            .input('psId', sql.Int, psId)
            .query(`INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)`);
        }
      }

      await transaction.commit();

      // Invitación por correo con credenciales — solo si se pidió explícitamente
      // (switch en el frontend) y hay a quién mandarla.
      if (enviarInvitacion && neusId && correo) {
        const usuarioRs = await pool.request().input('id', sql.Int, neusId)
          .query(`SELECT NEUS_USUARIO as usuario, NEUS_CONTRA as contra FROM NEUS_USUARIOS WHERE NEUS_ID=@id`);
        const usuarioLogin = usuarioRs.recordset[0]?.usuario;
        if (usuarioLogin) {
          // La invitación siempre lleva contraseña: la nueva si se capturó; si no,
          // la actual; y si no tiene ninguna, una temporal que se guarda aquí.
          let passwordEnviar = password || usuarioRs.recordset[0]?.contra || null;
          if (!passwordEnviar) {
            passwordEnviar = require('crypto').randomBytes(8).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'Temp' + Date.now().toString().slice(-6);
            await pool.request().input('id', sql.Int, neusId).input('p', sql.NVarChar, passwordEnviar)
              .query(`UPDATE NEUS_USUARIOS SET NEUS_CONTRA = @p, [password] = @p WHERE NEUS_ID = @id`);
          }
          const tenant = String(req.user?.empresa || require('../config/tenants').DEFAULT_TENANT).toLowerCase();
          emailService.sendInvitacionAccesoSistemaEmail({
            nombre: nombre || empresa,
            correo,
            usuario: usuarioLogin,
            password: passwordEnviar,
            link: `${BASE_URL}/login?tenant=${encodeURIComponent(tenant)}`,
          }).catch(() => {});
        }
      }

      return res.json({ success: true });
    } catch (txErr) {
      try { await transaction.rollback(); } catch (e) {}
      console.error('Error transaction updateCliente:', txErr);
      return res.status(500).json({ success: false, message: txErr.message });
    }
  } catch (e) {
    console.error('Error updateCliente:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteCliente = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID de cliente inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      // Decide whether the deletion should be definitive (permanent)
      const definitivo = (
        req.query.definitivo === '1' ||
        req.query.permanente === '1' ||
        req.body && (req.body.definitivo === true || req.body.permanente === true)
      );

      const selectReq = transaction.request();
      const clienteRs = await selectReq.input('id', sql.Int, id).query(
        `SELECT CONT_NEUS_ID as neusId FROM CRM_CONTACTOS WHERE CONT_ID = @id`
      );

      if (!clienteRs.recordset || clienteRs.recordset.length === 0) {
        try { await transaction.rollback(); } catch (e) {}
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }

      const neusId = clienteRs.recordset[0] ? clienteRs.recordset[0].neusId : null;

      if (definitivo) {
        // A diferencia de la tabla legacy CLIENTES (sin FKs reales), un contacto
        // de CRM puede tener oportunidades/documentos/casos asociados — borrar
        // esa fila rompería el historial. Se bloquea el borrado definitivo si
        // existe cualquier referencia real; el soft-delete de abajo siempre
        // sigue disponible.
        const refsRs = await transaction.request().input('id', sql.Int, id).query(`
          SELECT
            (SELECT COUNT(*) FROM CRM_OPORTUNIDADES WHERE OPO_CONTACTO_ID = @id) +
            (SELECT COUNT(*) FROM CRM_DOCUMENTOS_CLIENTE WHERE DOC_CONTACTO_ID = @id) +
            (SELECT COUNT(*) FROM CASOS WHERE CASO_CONTACTO_ID = @id) as n
        `);
        const tieneReferencias = (refsRs.recordset[0]?.n || 0) > 0;
        if (tieneReferencias) {
          try { await transaction.rollback(); } catch (e) {}
          return res.status(409).json({ success: false, message: 'No se puede eliminar definitivamente: el cliente tiene oportunidades, documentos o casos asociados. Desactívalo en su lugar.' });
        }

        await transaction.request().input('id', sql.Int, id).query(`DELETE FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @id`);
        await transaction.request().input('id', sql.Int, id).query(`DELETE FROM CRM_CONTACTOS WHERE CONT_ID = @id`);

        // If NEUS_ID exists, check if other CRM_CONTACTOS reference it
        if (neusId) {
          const countReq = transaction.request();
          const othersRs = await countReq
            .input('neusId', sql.Int, neusId)
            .input('id', sql.Int, id)
            .query(`SELECT COUNT(1) as cnt FROM CRM_CONTACTOS WHERE CONT_NEUS_ID = @neusId AND CONT_ID <> @id`);

          const others = (othersRs.recordset && othersRs.recordset[0]) ? parseInt(othersRs.recordset[0].cnt, 10) : 0;
          if (others === 0) {
            const delEncuestaReq = transaction.request();
            await delEncuestaReq.input('neusId', sql.Int, neusId).query(`DELETE FROM ENCUESTA_ASIGNACION WHERE EAS_NEUS_ID = @neusId`);

            const delUserReq = transaction.request();
            await delUserReq.input('neusId', sql.Int, neusId).query(`DELETE FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId`);
          }
        }

        await transaction.commit();
        return res.json({ success: true, message: 'Cliente eliminado definitivamente' });
      } else {
        // Soft-delete: desactiva el contacto sin tocar CONT_ES_CLIENTE (conserva
        // el historial de que llegó a ser cliente).
        const updateClienteReq = transaction.request();
        await updateClienteReq.input('id', sql.Int, id).query(`UPDATE CRM_CONTACTOS SET CONT_ACTIVO = 0 WHERE CONT_ID = @id`);

        if (neusId) {
          const countReq = transaction.request();
          const othersRs = await countReq
            .input('neusId', sql.Int, neusId)
            .input('id', sql.Int, id)
            .query(`SELECT COUNT(1) as cnt FROM CRM_CONTACTOS WHERE CONT_NEUS_ID = @neusId AND CONT_ID <> @id`);

          const others = (othersRs.recordset && othersRs.recordset[0]) ? parseInt(othersRs.recordset[0].cnt, 10) : 0;
          if (others === 0) {
            const delEncuestaReq = transaction.request();
            await delEncuestaReq.input('neusId', sql.Int, neusId).query(`DELETE FROM ENCUESTA_ASIGNACION WHERE EAS_NEUS_ID = @neusId`);

            const delUserReq = transaction.request();
            await delUserReq.input('neusId', sql.Int, neusId).query(`DELETE FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId`);
          } else {
            const updateUserReq = transaction.request();
            await updateUserReq.input('neusId', sql.Int, neusId).query(`UPDATE NEUS_USUARIOS SET NEUS_ACTIVO = 0 WHERE NEUS_ID = @neusId`);
          }
        }

        await transaction.commit();
        return res.json({ success: true, message: 'Cliente desactivado' });
      }
    } catch (txErr) {
      try { await transaction.rollback(); } catch (e) {}
      console.error('Transaction error deleteCliente:', txErr, txErr.stack || 'no-stack');
      return res.status(500).json({ success: false, message: txErr.message || 'Error deleting cliente' });
    }
  } catch (e) {
    console.error('Error deleteCliente:', e, e.stack || 'no-stack');
    return res.status(500).json({ success: false, message: e.message });
  }
};
