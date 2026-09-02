const sql = require('mssql');
const databaseService = require('../services/databaseService');

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
          CPS.CPS_ID as id, PS.PS_ID as productoServicioId, PS.PS_TIPO as tipo,
          PS.PS_NOMBRE as nombre, PS.PS_DESCRIPCION as descripcion,
          PS.PS_PRECIO as precio, PS.PS_RECURRENCIA as recurrencia,
          CPS.CPS_FECHA_ALTA as fechaAlta
        FROM CLIENTE_PRODUCTOS_SERVICIOS CPS
        JOIN PRODUCTOS_SERVICIOS PS ON PS.PS_ID = CPS.PS_ID
        WHERE CPS.CL_ID = @id AND CPS.CPS_ACTIVO = 1
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
      .query(`SELECT CL_EMPRESA as empresa, CL_NOMBRE as nombre FROM CLIENTES WHERE CL_ID = @id`);
    if (!cli.recordset.length) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    const { empresa, nombre } = cli.recordset[0];
    const patron = `%${(empresa || nombre || '').trim()}%`;

    const ingresos = await pool.request()
      .input('p', sql.NVarChar, patron)
      .query(`
        SELECT ISNULL(SUM(FI_MONTO), 0) as total, COUNT(*) as n,
               MAX(FI_FECHA) as ultima
        FROM FINANZAS_INGRESOS
        WHERE @p <> '%%' AND FI_CONCEPTO LIKE @p
      `).catch(() => ({ recordset: [{ total: 0, n: 0, ultima: null }] }));

    const cxc = await pool.request()
      .input('p', sql.NVarChar, patron)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN FCC_ESTATUS IN ('pagada','pagado','cobrada','cobrado') THEN FCC_MONTO ELSE 0 END), 0) as cobrado,
          ISNULL(SUM(CASE WHEN FCC_ESTATUS NOT IN ('pagada','pagado','cobrada','cobrado','cancelada','cancelado') THEN FCC_MONTO ELSE 0 END), 0) as pendiente,
          COUNT(*) as n
        FROM FINANZAS_CXC
        WHERE @p <> '%%' AND FCC_CLIENTE LIKE @p
      `).catch(() => ({ recordset: [{ cobrado: 0, pendiente: 0, n: 0 }] }));

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
      },
    });
  } catch (e) {
    console.error('Error resumen de finanzas del cliente:', e);
    return res.json({ success: true, data: { totalIngresado: 0, pendienteCobro: 0, registros: 0, ultimaFecha: null } });
  }
};

exports.asignarProductoServicio = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const psId = parseInt(req.body.productoServicioId, 10);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(psId) || psId <= 0) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('clId', sql.Int, id)
      .input('psId', sql.Int, psId)
      .query(`
        IF EXISTS (SELECT 1 FROM CLIENTE_PRODUCTOS_SERVICIOS WHERE CL_ID = @clId AND PS_ID = @psId)
          UPDATE CLIENTE_PRODUCTOS_SERVICIOS SET CPS_ACTIVO = 1 WHERE CL_ID = @clId AND PS_ID = @psId
        ELSE
          INSERT INTO CLIENTE_PRODUCTOS_SERVICIOS (CL_ID, PS_ID) VALUES (@clId, @psId)
      `);
    return res.status(201).json({ success: true });
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
    await pool.request()
      .input('clId', sql.Int, id)
      .input('psId', sql.Int, psId)
      .query(`DELETE FROM CLIENTE_PRODUCTOS_SERVICIOS WHERE CL_ID = @clId AND PS_ID = @psId`);
    return res.json({ success: true });
  } catch (e) {
    console.error('Error quitando producto/servicio de cliente:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.getClientes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT 
        CL.CL_ID as id,
        CL.NEUS_ID as neusId,
        CL.CL_EMPRESA as empresa,
        CL.CL_RFC as rfc,
        CL.CL_NOMBRE as nombre,
        CL.CL_TELEFONO as telefono,
        CL.CL_CIUDAD as ciudad,
        CL.CL_CORREO as correo,
        CL.CL_ACTIVO as activo,
        CL.CL_FECHA_REGISTRO as fechaRegistro,
        CL.CL_CALLE as calle,
        CL.CL_NUM_EXT as numExt,
        CL.CL_NUM_INT as numInt,
        CL.CL_COLONIA as colonia,
        CL.CL_CP as cp,
        CL.CL_PAIS as pais
      FROM CLIENTES CL
      ORDER BY CL.CL_EMPRESA ASC, CL.CL_NOMBRE ASC
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
      pais
    } = req.body;

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

    // Use a transaction: if we need to create a NEUS_USUARIOS row and then CLIENTES,
    // ensure both succeed or both roll back.
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

      // Now insert the CLIENTES row using finalNeusId (guaranteed non-null)
      // Map domicilio -> calle if calle not provided
      const calleFinal = (calle && String(calle).trim() !== '') ? calle : (domicilio || null);

      const insReq = transaction.request()
        .input('neusIdFinal', sql.Int, finalNeusId)
        .input('empresa', sql.NVarChar, empresa || null)
        .input('nombre', sql.NVarChar, nombre || null)
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
        .input('pais', sql.NVarChar, pais || null);

      const insertClienteResult = await insReq.query(`
        INSERT INTO CLIENTES (NEUS_ID, CL_EMPRESA, CL_RFC, CL_NOMBRE, CL_TELEFONO, CL_CIUDAD, CL_CORREO, CL_ACTIVO, CL_FECHA_REGISTRO, CL_CALLE, CL_NUM_EXT, CL_NUM_INT, CL_COLONIA, CL_CP, CL_PAIS)
        VALUES (@neusIdFinal, @empresa, @rfc, @nombre, @telefono, @ciudad, @correo, @activo, GETDATE(), @calle, @numExt, @numInt, @colonia, @cp, @pais);
        SELECT SCOPE_IDENTITY() as id;
      `);

      const createdId = insertClienteResult.recordset && insertClienteResult.recordset[0] ? insertClienteResult.recordset[0].id : null;

        // Guardar productos y servicios seleccionados si vienen en el body
        const productos = Array.isArray(req.body.productos) ? req.body.productos : (req.body.productos ? [req.body.productos] : []);
        const servicios = Array.isArray(req.body.servicios) ? req.body.servicios : (req.body.servicios ? [req.body.servicios] : []);

        if (createdId) {
          // Insertar productos seleccionados
          for (const p of productos) {
            const prodId = parseInt(p, 10);
            if (!Number.isInteger(prodId) || prodId <= 0) continue;
            await transaction.request()
              .input('clId', sql.Int, createdId)
              .input('prodId', sql.Int, prodId)
              .query(`INSERT INTO CLIENTE_PRODUCTOS (CL_ID, PROD_ID) VALUES (@clId, @prodId)`);
          }

          // Insertar servicios seleccionados
          for (const s of servicios) {
            const servId = parseInt(s, 10);
            if (!Number.isInteger(servId) || servId <= 0) continue;
            await transaction.request()
              .input('clId', sql.Int, createdId)
              .input('servId', sql.Int, servId)
              .query(`INSERT INTO CLIENTE_SERVICIOS (CL_ID, SERV_ID) VALUES (@clId, @servId)`);
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
      pais
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      const tr = transaction.request();

      // Update NEUS_USUARIOS password and/or correo as NEUS_USUARIO if provided
      if ((password !== undefined && password !== null) || (correo !== undefined && correo !== null)) {
        let updateQuery = 'UPDATE NEUS_USUARIOS SET ';
        const updateFields = [];
        
        if (password !== undefined && password !== null) {
          updateFields.push('NEUS_CONTRA = @password');
          tr = tr.input('password', sql.NVarChar, String(password));
        }
        
        if (correo !== undefined && correo !== null && String(correo).trim() !== '') {
          updateFields.push('NEUS_USUARIO = @correo');
          tr = tr.input('correo', sql.NVarChar, String(correo));
        }
        
        if (updateFields.length > 0) {
          updateQuery += updateFields.join(', ') + ' WHERE NEUS_ID = @neusId';
          await tr.input('neusId', sql.Int, neusId || null).query(updateQuery);
        }
      }

      // Update CLIENTES fields
      await tr
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
        .query(`
          UPDATE CLIENTES SET
            CL_EMPRESA = COALESCE(@empresa, CL_EMPRESA),
            CL_NOMBRE = COALESCE(@nombre, CL_NOMBRE),
            CL_TELEFONO = COALESCE(@telefono, CL_TELEFONO),
            CL_CIUDAD = COALESCE(@ciudad, CL_CIUDAD),
            CL_CORREO = COALESCE(@correo, CL_CORREO),
            CL_RFC = COALESCE(@rfc, CL_RFC),
            CL_CALLE = COALESCE(@calle, CL_CALLE),
            CL_NUM_EXT = COALESCE(@numExt, CL_NUM_EXT),
            CL_NUM_INT = COALESCE(@numInt, CL_NUM_INT),
            CL_COLONIA = COALESCE(@colonia, CL_COLONIA),
            CL_CP = COALESCE(@cp, CL_CP),
            CL_PAIS = COALESCE(@pais, CL_PAIS),
            CL_ACTIVO = CASE WHEN @activo IS NULL THEN CL_ACTIVO ELSE @activo END
          WHERE CL_ID = @id
        `);

      // Si vienen listas de productos/servicios, reemplazarlas (borrar existentes e insertar nuevas)
      const productos = Array.isArray(req.body.productos) ? req.body.productos : (req.body.productos ? [req.body.productos] : []);
      const servicios = Array.isArray(req.body.servicios) ? req.body.servicios : (req.body.servicios ? [req.body.servicios] : []);

      if (productos.length > 0) {
        // Borrar productos actuales
        await transaction.request().input('id', sql.Int, id).query(`DELETE FROM CLIENTE_PRODUCTOS WHERE CL_ID = @id`);
        // Insertar los nuevos
        for (const p of productos) {
          const prodId = parseInt(p, 10);
          if (!Number.isInteger(prodId) || prodId <= 0) continue;
          await transaction.request()
            .input('clId', sql.Int, id)
            .input('prodId', sql.Int, prodId)
            .query(`INSERT INTO CLIENTE_PRODUCTOS (CL_ID, PROD_ID) VALUES (@clId, @prodId)`);
        }
      }

      if (servicios.length > 0) {
        // Borrar servicios actuales
        await transaction.request().input('id', sql.Int, id).query(`DELETE FROM CLIENTE_SERVICIOS WHERE CL_ID = @id`);
        // Insertar los nuevos
        for (const s of servicios) {
          const servId = parseInt(s, 10);
          if (!Number.isInteger(servId) || servId <= 0) continue;
          await transaction.request()
            .input('clId', sql.Int, id)
            .input('servId', sql.Int, servId)
            .query(`INSERT INTO CLIENTE_SERVICIOS (CL_ID, SERV_ID) VALUES (@clId, @servId)`);
        }
      }

      await transaction.commit();
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

      // Use fresh Request objects per query to avoid input parameter bleed
      const selectReq = transaction.request();
      const clienteRs = await selectReq.input('id', sql.Int, id).query(
        `SELECT NEUS_ID as neusId FROM CLIENTES WHERE CL_ID = @id`
      );

      // If the cliente doesn't exist, rollback and return 404
      if (!clienteRs.recordset || clienteRs.recordset.length === 0) {
        try { await transaction.rollback(); } catch (e) {}
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }

      const neusId = clienteRs.recordset[0] ? clienteRs.recordset[0].neusId : null;

      if (definitivo) {
        // Permanent delete: first remove related records due to foreign key constraints
        // Delete from CLIENTE_SERVICIOS
        const delServiciosReq = transaction.request();
        await delServiciosReq.input('id', sql.Int, id).query(`DELETE FROM CLIENTE_SERVICIOS WHERE CL_ID = @id`);

        // Delete from CLIENTE_PRODUCTOS
        const delProductosReq = transaction.request();
        await delProductosReq.input('id', sql.Int, id).query(`DELETE FROM CLIENTE_PRODUCTOS WHERE CL_ID = @id`);

        // Now remove CLIENTES row
        const delClienteReq = transaction.request();
        await delClienteReq.input('id', sql.Int, id).query(`DELETE FROM CLIENTES WHERE CL_ID = @id`);

        // If NEUS_ID exists, check if other CLIENTES reference it
        if (neusId) {
          const countReq = transaction.request();
          const othersRs = await countReq
            .input('neusId', sql.Int, neusId)
            .input('id', sql.Int, id)
            .query(`SELECT COUNT(1) as cnt FROM CLIENTES WHERE NEUS_ID = @neusId AND CL_ID <> @id`);

          const others = (othersRs.recordset && othersRs.recordset[0]) ? parseInt(othersRs.recordset[0].cnt, 10) : 0;
          if (others === 0) {
            // No other clients reference this user, so delete user-related records from other tables
            // Delete from ENCUESTA_ASIGNACION
            const delEncuestaReq = transaction.request();
            await delEncuestaReq.input('neusId', sql.Int, neusId).query(`DELETE FROM ENCUESTA_ASIGNACION WHERE EAS_NEUS_ID = @neusId`);

            // Delete from NEUS_USUARIOS
            const delUserReq = transaction.request();
            await delUserReq.input('neusId', sql.Int, neusId).query(`DELETE FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId`);
          }
        }

        await transaction.commit();
        return res.json({ success: true, message: 'Cliente eliminado definitivamente' });
      } else {
        // Soft-delete (existing behavior): deactivate cliente and usuario
        const updateClienteReq = transaction.request();
        await updateClienteReq.input('id', sql.Int, id).query(`UPDATE CLIENTES SET CL_ACTIVO = 0 WHERE CL_ID = @id`);

        // Check if there are other clients referencing this NEUS_ID
        if (neusId) {
          const countReq = transaction.request();
          const othersRs = await countReq
            .input('neusId', sql.Int, neusId)
            .input('id', sql.Int, id)
            .query(`SELECT COUNT(1) as cnt FROM CLIENTES WHERE NEUS_ID = @neusId AND CL_ID <> @id`);

          const others = (othersRs.recordset && othersRs.recordset[0]) ? parseInt(othersRs.recordset[0].cnt, 10) : 0;
          if (others === 0) {
            // No other clients reference this user, so delete user and related records
            // First delete from ENCUESTA_ASIGNACION
            const delEncuestaReq = transaction.request();
            await delEncuestaReq.input('neusId', sql.Int, neusId).query(`DELETE FROM ENCUESTA_ASIGNACION WHERE EAS_NEUS_ID = @neusId`);

            // Then delete the user
            const delUserReq = transaction.request();
            await delUserReq.input('neusId', sql.Int, neusId).query(`DELETE FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId`);
          } else {
            // Other clients reference this user, so just deactivate
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
