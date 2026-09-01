const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { empresaRequierePolitica } = require('../utils/passwordPolicy');
const { logAudit } = require('../services/auditService');

exports.getUsuarios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        u.NEUS_ID as id,
        u.NEUS_NOMBRES as nombre,
        u.NEUS_USUARIO as usuario,
        u.NEUS_TIPOUSUARIO as tipoUsuario,
        u.NEUS_STATUS as status,
        u.NEUS_ACTIVO as activo,
        ISNULL(u.NEUS_BASE,0) as cartera,
        u.NEUS_FECHA_INGRESO as fechaIngreso,
        u.NEUS_FOTO_URL as fotoUrl,
        ISNULL(u.NEUS_CORREO,'') as correo,
        ISNULL(u.NEUS_PUESTO,'') as puesto,
        ISNULL(u.NEUS_DEPARTAMENTO,'') as departamento,
        ISNULL(u.NEUS_GENERO,'') as genero,
        a.ACA_VENTAS_CAMPANA_NOMBRE as campana
      FROM NEUS_USUARIOS u
      LEFT JOIN AC_CAMPANIAS_AGENTES a ON a.ACA_NEUS_ID = u.NEUS_ID
      WHERE u.NEUS_ACTIVO = 1
      ORDER BY u.NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error usuarios:', e);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo usuarios',
      error: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
};

exports.getUsuariosDesactivados = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        NEUS_ID as id,
        NEUS_NOMBRES as nombre,
        NEUS_USUARIO as usuario,
        NEUS_TIPOUSUARIO as tipoUsuario,
        NEUS_STATUS as status,
        NEUS_ACTIVO as activo,
        NEUS_FECHA_INGRESO as fechaIngreso,
        NEUS_FOTO_URL as fotoUrl,
        ISNULL(NEUS_CORREO,'') as correo,
        ISNULL(NEUS_PUESTO,'') as puesto,
        ISNULL(NEUS_DEPARTAMENTO,'') as departamento,
        ISNULL(NEUS_GENERO,'') as genero
      FROM NEUS_USUARIOS
      WHERE NEUS_ACTIVO = 0
      ORDER BY NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error usuarios desactivados:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getUsuariosTI = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT 
        NEUS_ID as id,
        NEUS_NOMBRES as nombre,
        NEUS_USUARIO as usuario,
        NEUS_TIPOUSUARIO as tipoUsuario,
        NEUS_STATUS as status,
        NEUS_ACTIVO as activo,
        ISNULL(NEUS_BASE,0) as cartera
      FROM NEUS_USUARIOS
      WHERE NEUS_TIPOUSUARIO = 'TI'
      ORDER BY NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error usuarios TI:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo usuarios TI' });
  }
};

exports.getUsuarioById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT
          NEUS_ID as id,
          NEUS_NOMBRES as nombre,
          NEUS_USUARIO as usuario,
          NEUS_TIPOUSUARIO as tipoUsuario,
          NEUS_STATUS as status,
          NEUS_ACTIVO as activo,
          ISNULL(NEUS_BASE,0) as cartera,
          NEUS_FECHA_REGISTRO as fechaRegistro,
          NEUS_FECHA_INGRESO as fechaIngreso,
          NEUS_FOTO_URL as fotoUrl,
          ISNULL(NEUS_CORREO,'') as correo,
          ISNULL(NEUS_PUESTO,'') as puesto,
          ISNULL(NEUS_DEPARTAMENTO,'') as departamento,
          ISNULL(NEUS_GENERO,'') as genero
        FROM NEUS_USUARIOS
        WHERE NEUS_ID = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const u = result.recordset[0];
    return res.json({ success: true, data: u });
  } catch (e) {
    console.error('Error detalle usuario:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo usuario' });
  }
};

exports.createUsuario = async (req, res) => {
  try {
    let { nombres, usuario, contra, tipoUsuario, activo, status, base, ventasUsuario, ventasPassword, fechaIngreso, correo, puesto, departamento, genero, rolId, idHorario } = req.body;
    // Días de vacaciones/permisos NO se setean aquí: el trigger
    // trg_NEUS_USUARIOS_SetDiasIniciales los calcula por antigüedad tras el INSERT.
    idHorario = (idHorario === '' || idHorario === null || idHorario === undefined || Number.isNaN(Number(idHorario))) ? null : Number(idHorario);

    if (!ventasUsuario && req.body && typeof req.body.username !== 'undefined') {
      ventasUsuario = req.body.username;
    }
    if (!ventasPassword && req.body && typeof req.body.password !== 'undefined') {
      ventasPassword = req.body.password;
    }

    // Si viene rolId (plantilla de rol), su ROL_BASE define el NEUS_TIPOUSUARIO.
    // Se resuelve aquí para que la validación de "faltan campos" pase igual.
    let rolBaseDesdeRol = null;
    if (rolId) {
      try {
        const poolRol = await databaseService.getPool(req.user?.empresa);
        const rs = await poolRol.request()
          .input('id', sql.Int, parseInt(rolId))
          .query(`SELECT ROL_BASE FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id AND ACTIVO = 1`);
        if (rs.recordset.length) {
          rolBaseDesdeRol = rs.recordset[0].ROL_BASE;
          tipoUsuario = rolBaseDesdeRol;
        }
      } catch (e) {
        console.warn('⚠️ No se pudo resolver rolId, se usa tipoUsuario del body:', e.message);
      }
    }

    if (!nombres || !usuario || !contra || !tipoUsuario) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    const activoValue = activo === true || activo === 1 || activo === '1';
    const statusValue = status === true || status === 1 || status === '1';
    // NEUS_GENERO es char(1): solo 'M' / 'F', si no queda NULL
    const generoValue = (genero === 'M' || genero === 'F') ? genero : null;

    const pool = await databaseService.getPool(req.user?.empresa);

    console.log('🆕 POST /api/usuarios - Body:', JSON.stringify(req.body));
    
    const checkUser = await pool.request()
      .input('usuario', sql.NVarChar, usuario)
      .query('SELECT COUNT(*) as count FROM NEUS_USUARIOS WHERE NEUS_USUARIO = @usuario');
    
    if (checkUser.recordset[0].count > 0) {
      return res.status(400).json({ success: false, message: 'El usuario ya existe' });
    }

    const request = pool.request()
      .input('nombres', sql.NVarChar, nombres)
      .input('usuario', sql.NVarChar, usuario)
      .input('contra', sql.NVarChar, contra)
      .input('tipoUsuario', sql.NVarChar, tipoUsuario)
      .input('activo', sql.Bit, activoValue)
      .input('status', sql.Bit, statusValue)
      .input('base', sql.NVarChar, base || '1')
      .input('ventasUsuario', sql.NVarChar, ventasUsuario ? String(ventasUsuario).trim() : null)
      .input('ventasPassword', sql.NVarChar, ventasPassword ? String(ventasPassword).trim() : null)
      .input('fechaIngreso', sql.Date, fechaIngreso ? new Date(fechaIngreso) : null)
      .input('correo', sql.NVarChar, correo ? String(correo).trim() : null)
      .input('puesto', sql.NVarChar, puesto ? String(puesto).trim() : null)
      .input('departamento', sql.NVarChar, departamento ? String(departamento).trim() : null)
      .input('genero', sql.Char(1), generoValue)
      .input('idHorario', sql.Int, idHorario)
      .input('debeCambiarPassword', sql.Bit, empresaRequierePolitica(req.user?.empresa) ? 1 : 0);

    const insertResult = await request.query(`
      INSERT INTO NEUS_USUARIOS
      (NEUS_NOMBRES, NEUS_USUARIO, NEUS_CONTRA, NEUS_TIPOUSUARIO, NEUS_ACTIVO, NEUS_STATUS, NEUS_BASE, NEUS_FECHA_REGISTRO, username, [password], NEUS_FECHA_INGRESO, NEUS_CORREO, NEUS_PUESTO, NEUS_DEPARTAMENTO, NEUS_GENERO, id_horario, NEUS_DEBE_CAMBIAR_PASSWORD)
      VALUES (@nombres, @usuario, @contra, @tipoUsuario, @activo, @status, @base, GETDATE(), @ventasUsuario, @ventasPassword, @fechaIngreso, @correo, @puesto, @departamento, @genero, @idHorario, @debeCambiarPassword);
      SELECT SCOPE_IDENTITY() AS NEUS_ID;
    `);

    const newUserId = insertResult.recordset[0]?.NEUS_ID;

    // Crear carpeta de expediente automáticamente para el nuevo usuario
    if (newUserId) {
      try {
        await pool.request()
          .input('USUARIO_ID', sql.Int, newUserId)
          .input('NOMBRES', sql.NVarChar(255), nombres)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.EXPEDIENTE_CARPETAS WHERE USUARIO_ID = @USUARIO_ID)
              INSERT INTO dbo.EXPEDIENTE_CARPETAS (USUARIO_ID, NOMBRES, CREADA_EN)
              VALUES (@USUARIO_ID, @NOMBRES, GETDATE())
          `);
      } catch (carpetaErr) {
        // Si la tabla no existe todavía, no fallar el create del usuario
        console.warn('⚠️ No se pudo crear carpeta expediente (tabla puede no existir):', carpetaErr.message);
      }
    }

    // Copiar los permisos del rol (plantilla) a las tablas del nuevo usuario.
    // Es una copia one-shot: después el usuario se edita individualmente sin
    // afectar al rol ni a otros usuarios.
    if (newUserId && rolId && rolBaseDesdeRol) {
      try {
        const { aplicarRolAUsuario } = require('./rolController');
        await aplicarRolAUsuario(pool, rolId, newUserId, req.user?.id || null);
      } catch (rolErr) {
        console.warn('⚠️ No se pudieron copiar los permisos del rol al usuario:', rolErr.message);
      }
    }

    console.log('✅ Usuario creado con username/password:', {
      username: ventasUsuario ? String(ventasUsuario).trim() : null,
      password: ventasPassword ? '***' : null,
      fechaIngreso: fechaIngreso || null
    });

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'usuarios',
      accion:    'crear',
      entidadId: newUserId || usuario,
      detalle:   { usuario, nombres, tipoUsuario },
      ip:        req.ip
    });

    res.status(201).json({ success: true, message: 'Usuario creado exitosamente' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (status === undefined || status === null) {
      return res.status(400).json({ success: false, message: 'Campo status requerido' });
    }
    const statusValue = status === true || status === 1 || status === '1';
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.Bit, statusValue)
      .query('UPDATE NEUS_USUARIOS SET NEUS_STATUS = @status WHERE NEUS_ID = @id');

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'usuarios',
      accion:    statusValue ? 'activar_ventas' : 'desactivar_ventas',
      entidadId: id,
      detalle:   null,
      ip:        req.ip
    });

    res.json({ success: true, status: statusValue });
  } catch (e) {
    console.error('Error en toggleStatus:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Cambiar el rol de un usuario existente.
//  - Siempre actualiza NEUS_TIPOUSUARIO al ROL_BASE del rol nuevo (acceso a rutas).
//  - Si reaplicarPermisos=true, además borra los permisos actuales del usuario y
//    copia los del rol nuevo. Si es false, solo cambia el código y los permisos
//    de módulos/acciones del usuario quedan como estaban.
exports.cambiarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { rolId, reaplicarPermisos } = req.body;
    if (!rolId) return res.status(400).json({ success: false, message: 'rolId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rolRs = await pool.request()
      .input('rid', sql.Int, parseInt(rolId))
      .query(`SELECT ROL_BASE, NOMBRE FROM dbo.INTRANET_ROLES WHERE ROL_ID = @rid AND ACTIVO = 1`);
    if (rolRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }
    const rolBase = rolRs.recordset[0].ROL_BASE;

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('tipo', sql.NVarChar, rolBase)
      .query(`UPDATE NEUS_USUARIOS SET NEUS_TIPOUSUARIO = @tipo WHERE NEUS_ID = @id`);

    if (reaplicarPermisos === true || reaplicarPermisos === 1 || reaplicarPermisos === '1') {
      const { aplicarRolAUsuario } = require('./rolController');
      await aplicarRolAUsuario(pool, rolId, parseInt(id), req.user?.id || null, true);
    }

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'cambiar-rol', entidadId: id,
      detalle: { rolId, rolBase, reaplicarPermisos: !!reaplicarPermisos }, ip: req.ip,
    });

    return res.json({ success: true, message: 'Rol actualizado', data: { rolBase } });
  } catch (e) {
    console.error('Error cambiarRol:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    if (activo === undefined || activo === null) {
      return res.status(400).json({ success: false, message: 'Campo activo requerido' });
    }
    const activoValue = activo === true || activo === 1 || activo === '1';
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activoValue)
      .query('UPDATE NEUS_USUARIOS SET NEUS_ACTIVO = @activo WHERE NEUS_ID = @id');

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'usuarios',
      accion:    activoValue ? 'activar' : 'desactivar',
      entidadId: id,
      detalle:   null,
      ip:        req.ip
    });

    res.json({ success: true, activo: activoValue });
  } catch (e) {
    console.error('Error en toggleActivo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    let { nombres, usuario, contra, tipoUsuario, activo, status, base, ventasUsuario, ventasPassword, fechaIngreso, correo, puesto, departamento, genero } = req.body;

    if (!ventasUsuario && req.body && typeof req.body.username !== 'undefined') {
      ventasUsuario = req.body.username;
    }
    if (!ventasPassword && req.body && typeof req.body.password !== 'undefined') {
      ventasPassword = req.body.password;
    }

    console.log('🛠️ PUT /api/usuarios/:id', id);

    if (!nombres || !usuario || !tipoUsuario) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    const activoValue = activo === true || activo === 1 || activo === '1';
    const statusValue = status === true || status === 1 || status === '1';
    const generoValue = (genero === 'M' || genero === 'F') ? genero : null;

    const pool = await databaseService.getPool(req.user?.empresa);
    
    const checkUser = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM NEUS_USUARIOS WHERE NEUS_ID = @id');
    
    if (checkUser.recordset[0].count === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    let updateQuery = `
      UPDATE NEUS_USUARIOS SET
        NEUS_NOMBRES = @nombres,
        NEUS_USUARIO = @usuario,
        NEUS_TIPOUSUARIO = @tipoUsuario,
        NEUS_ACTIVO = @activo,
        NEUS_STATUS = @status,
        NEUS_BASE = @base,
        username = @ventasUsuario,
        [password] = @ventasPassword,
        NEUS_FECHA_INGRESO = @fechaIngreso,
        NEUS_CORREO = @correo,
        NEUS_PUESTO = @puesto,
        NEUS_DEPARTAMENTO = @departamento,
        NEUS_GENERO = @genero
    `;

    const request = pool.request()
      .input('id', sql.Int, id)
      .input('nombres', sql.NVarChar, nombres)
      .input('usuario', sql.NVarChar, usuario)
      .input('tipoUsuario', sql.NVarChar, tipoUsuario)
      .input('activo', sql.Bit, activoValue)
      .input('status', sql.Bit, statusValue)
      .input('base', sql.NVarChar, base || '1')
      .input('ventasUsuario', sql.NVarChar, ventasUsuario ? String(ventasUsuario).trim() : null)
      .input('ventasPassword', sql.NVarChar, ventasPassword ? String(ventasPassword).trim() : null)
      .input('fechaIngreso', sql.Date, fechaIngreso ? new Date(fechaIngreso) : null)
      .input('correo', sql.NVarChar, correo ? String(correo).trim() : null)
      .input('puesto', sql.NVarChar, puesto ? String(puesto).trim() : null)
      .input('departamento', sql.NVarChar, departamento ? String(departamento).trim() : null)
      .input('genero', sql.Char(1), generoValue);
    
    if (contra && String(contra).trim() !== '') {
      updateQuery += ', NEUS_CONTRA = @contra';
      request.input('contra', sql.NVarChar, String(contra).trim());
    }
    
    updateQuery += ' WHERE NEUS_ID = @id';
    
    console.log('📝 Update SQL:', updateQuery);
    
    const result = await request.query(updateQuery);
    console.log('✅ Filas afectadas:', result.rowsAffected);

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'usuarios',
      accion:    'editar',
      entidadId: id,
      detalle:   { usuario, nombres, tipoUsuario },
      ip:        req.ip
    });

    res.json({ success: true, message: 'Usuario actualizado exitosamente' });
  } catch (e) {
    console.error('❌ Error en PUT /api/usuarios/:id:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await databaseService.getPool(req.user?.empresa);
    
    const checkUser = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM NEUS_USUARIOS WHERE NEUS_ID = @id');
    
    if (checkUser.recordset[0].count === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM NEUS_USUARIOS WHERE NEUS_ID = @id');

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'usuarios',
      accion:    'eliminar',
      entidadId: id,
      detalle:   null,
      ip:        req.ip
    });

    res.json({ success: true, message: 'Usuario eliminado exitosamente' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Cambiar el estado de un usuario: cierra el registro activo, inserta uno nuevo y actualiza NEUS_USUARIOS.NEUS_STATUS_ID
exports.changeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statusId } = req.body;
    if (!id || !statusId) return res.status(400).json({ success: false, message: 'ID de usuario y statusId requeridos' });

    // Verificar que el usuario autenticado pueda cambiar este estado
    const tokenUserId = req.user && (req.user.id || req.user.sub || req.user.userId);
    const tokenTipo = req.user && (req.user.tipoUsuario || req.user.role || req.user.tipousuario);
    const allowedAdminRoles = ['ad', 'admin', 'administrador'];
    if (!tokenUserId) return res.status(401).json({ success: false, message: 'Token inválido o no autenticado' });
    const tokenIdStr = String(tokenUserId);
    // Permitir si es el mismo usuario o si tiene rol admin
    if (tokenIdStr !== String(id) && !allowedAdminRoles.includes((tokenTipo || '').toString().toLowerCase())) {
      return res.status(403).json({ success: false, message: 'No autorizado para cambiar el estado de otro usuario' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Use separate Request objects bound to the transaction to avoid reusing parameters
      const closeReq = new sql.Request(transaction);
      const parsedId = parseInt(id);
      const parsedStatus = parseInt(statusId);

      if (Number.isNaN(parsedId) || Number.isNaN(parsedStatus)) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'ID o statusId inválido' });
      }

      // Cerrar registro activo anterior si existe
      try {
        await closeReq.input('id', sql.Int, parsedId).query(`
          UPDATE USUARIO_TIEMPOS SET fecha_fin = SYSUTCDATETIME()
          WHERE neus_id = @id AND fecha_fin IS NULL
        `);
        // Actualizar duracion_minutos solo para los registros de tipos 'ausente' (comida, sanitario, pausa...)
        try {
          await closeReq.input('id', sql.Int, parsedId).query(`
            UPDATE ut
            SET ut.duracion_minutos = DATEDIFF(MINUTE, ut.fecha_inicio, ut.fecha_fin)
            FROM USUARIO_TIEMPOS ut
            INNER JOIN STATUS s ON s.status_id = ut.status_id
            WHERE ut.neus_id = @id
              AND ut.fecha_fin IS NOT NULL
              AND (ut.duracion_minutos IS NULL OR ut.duracion_minutos = 0)
              AND (
                LOWER(s.clave) LIKE '%comida%' OR LOWER(s.clave) LIKE '%lunch%' OR LOWER(s.clave) LIKE '%almuerzo%'
                OR LOWER(s.clave) LIKE '%sanitar%' OR LOWER(s.clave) LIKE '%ba%' OR LOWER(s.clave) LIKE '%baño%' OR LOWER(s.clave) LIKE '%bath%'
                OR LOWER(s.clave) LIKE '%ausente%' OR LOWER(s.clave) LIKE '%pausa%' OR LOWER(s.clave) LIKE '%break%'
              );
          `);
        } catch (dErr) {
          console.warn('Aviso: no se pudo actualizar duracion_minutos (posible columna faltante o permiso):', dErr && dErr.message);
        }
      } catch (qerr) {
        console.error('Error cerrando registro activo (usuario %s):', id, qerr && qerr.message);
        throw qerr;
      }

      // Insertar nuevo registro de tiempo SOLO si el nuevo estado es de tipo 'ausente'
      try {
        const statusCheckReq = new sql.Request(transaction);
        const statusRow = await statusCheckReq.input('statusId', sql.Int, parsedStatus).query("SELECT ISNULL(clave,'') as clave FROM STATUS WHERE status_id = @statusId");
        const statusKey = (statusRow && statusRow.recordset && statusRow.recordset[0] && statusRow.recordset[0].clave) ? String(statusRow.recordset[0].clave).toLowerCase() : '';
        const isAbsent = (statusKey.indexOf('comida') !== -1 || statusKey.indexOf('lunch') !== -1 || statusKey.indexOf('almuerzo') !== -1 || statusKey.indexOf('sanitar') !== -1 || statusKey.indexOf('ba') !== -1 || statusKey.indexOf('baño') !== -1 || statusKey.indexOf('bath') !== -1 || statusKey.indexOf('ausente') !== -1 || statusKey.indexOf('pausa') !== -1 || statusKey.indexOf('break') !== -1);
        if (isAbsent) {
          const insReq = new sql.Request(transaction);
          await insReq.input('id', sql.Int, parsedId).input('statusId', sql.Int, parsedStatus).query(`
            INSERT INTO USUARIO_TIEMPOS (neus_id, status_id, fecha_inicio) VALUES (@id, @statusId, SYSUTCDATETIME())
          `);
        } else {
          console.debug('No se crea USUARIO_TIEMPOS para estado no ausente:', parsedStatus, statusKey);
        }
      } catch (qerr) {
        console.error('Error insertando USUARIO_TIEMPOS (usuario %s, status %s):', id, statusId, qerr && qerr.message);
        throw qerr;
      }

      // Actualizar estado actual del usuario.
      try {
        const updReq = new sql.Request(transaction);
        // Use dynamic SQL to avoid compile-time error if column NEUS_STATUS_ID does not exist
        const sqlText = `
          IF COL_LENGTH('dbo.NEUS_USUARIOS', 'NEUS_STATUS_ID') IS NOT NULL
          BEGIN
            EXEC sp_executesql N'UPDATE dbo.NEUS_USUARIOS SET NEUS_STATUS_ID = @s WHERE NEUS_ID = @i', N'@s int,@i int', @s=@statusId2, @i=@id;
          END
          ELSE
          BEGIN
            UPDATE dbo.NEUS_USUARIOS SET NEUS_STATUS = CASE WHEN @statusId2 = 1 THEN 1 ELSE 0 END WHERE NEUS_ID = @id;
          END
        `;
        await updReq.input('id', sql.Int, parsedId).input('statusId2', sql.Int, parsedStatus).query(sqlText);
      } catch (qerr) {
        console.error('Error actualizando NEUS_USUARIOS (usuario %s):', id, qerr && qerr.message);
        throw qerr;
      }

      await transaction.commit();
      return res.json({ success: true, message: 'Estado actualizado' });
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      console.error('Error changeStatus inner:', err && err.message, err && err.stack);
      return res.status(500).json({ success: false, message: 'Error cambiando estado', error: process.env.NODE_ENV === 'development' ? (err && err.message) : undefined });
    }
  } catch (e) {
    console.error('Error changeStatus:', e);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};

// Obtener status actual junto con descripción
exports.getCurrentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    // Primero, comprobar si existe una entrada activa en USUARIO_TIEMPOS (fecha_fin IS NULL)
    try {
      const active = await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query(`
          SELECT TOP 1 u.NEUS_ID as id, u.NEUS_NOMBRES as nombre, ut.status_id as statusId, s.clave as status_key, s.descripcion as description, ut.fecha_inicio
          FROM USUARIO_TIEMPOS ut
          LEFT JOIN STATUS s ON s.status_id = ut.status_id
          LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
          WHERE ut.neus_id = @id AND ut.fecha_fin IS NULL
          ORDER BY ut.fecha_inicio DESC
        `);
      if (active && active.recordset && active.recordset.length > 0) {
        return res.json({ success: true, data: active.recordset[0] });
      }
    } catch (activeErr) {
      // No bloquear la respuesta si falla esta comprobación; seguimos con la lógica normal
      console.warn('Aviso: fallo comprobando USUARIO_TIEMPOS activo:', activeErr && activeErr.message);
    }

    // Si no hay entrada activa, usar estado explícito si existe; de lo contrario, devolver DESCONECTADO
    try {
      const colCheck = await pool.request().query("SELECT COL_LENGTH('dbo.NEUS_USUARIOS','NEUS_STATUS_ID') as hascol");
      const hasCol = colCheck && colCheck.recordset && colCheck.recordset.length > 0 && colCheck.recordset[0].hascol != null;

      if (hasCol) {
        const result = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query(`
            SELECT u.NEUS_ID as id, u.NEUS_NOMBRES as nombre, u.NEUS_STATUS_ID as statusId, s.clave as status_key, s.descripcion as description
            FROM NEUS_USUARIOS u
            LEFT JOIN STATUS s ON s.status_id = u.NEUS_STATUS_ID
            WHERE u.NEUS_ID = @id
          `);
        if (result.recordset.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        const row = result.recordset[0];
        // Si no hay statusId definido, devolver DESCONECTADO por defecto
        if (row.statusId == null) {
          return res.json({ success: true, data: { id: row.id, nombre: row.nombre, statusId: null, status_key: 'offline', description: 'DESCONECTADO' } });
        }
        return res.json({ success: true, data: row });
      } else {
        // Schema legacy: NO usar NEUS_STATUS (bit) como "en línea"; por defecto, devolver DESCONECTADO
        const result = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query(`
            SELECT NEUS_ID as id, NEUS_NOMBRES as nombre
            FROM NEUS_USUARIOS
            WHERE NEUS_ID = @id
          `);
        if (result.recordset.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        const row = result.recordset[0];
        return res.json({ success: true, data: { id: row.id, nombre: row.nombre, statusId: null, status_key: 'offline', description: 'DESCONECTADO' } });
      }
    } catch (colErr) {
      console.error('Error comprobando columna NEUS_STATUS_ID en getCurrentStatus:', colErr && colErr.message);
      return res.status(500).json({ success: false, message: 'Error interno verificando esquema' });
    }
  } catch (e) {
    console.error('Error getCurrentStatus:', e);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};

// Obtener historial de tiempos de un usuario
exports.getTimes = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT
          ut.tiempo_id as id,
          ut.neus_id as neusId,
          ut.status_id as statusId,
          s.clave as status_key,
          s.descripcion as description,
          ut.fecha_inicio,
          ut.fecha_fin,
          CASE WHEN (
            LOWER(ISNULL(s.clave,'')) LIKE '%comida%' OR LOWER(ISNULL(s.clave,'')) LIKE '%lunch%' OR LOWER(ISNULL(s.clave,'')) LIKE '%almuerzo%'
            OR LOWER(ISNULL(s.clave,'')) LIKE '%sanitar%' OR LOWER(ISNULL(s.clave,'')) LIKE '%ba%' OR LOWER(ISNULL(s.clave,'')) LIKE '%baño%' OR LOWER(ISNULL(s.clave,'')) LIKE '%bath%'
            OR LOWER(ISNULL(s.clave,'')) LIKE '%ausente%' OR LOWER(ISNULL(s.clave,'')) LIKE '%pausa%' OR LOWER(ISNULL(s.clave,'')) LIKE '%break%'
          ) THEN ISNULL(ut.duracion_minutos, DATEDIFF(MINUTE, ut.fecha_inicio, COALESCE(ut.fecha_fin, SYSUTCDATETIME()))) ELSE NULL END as duracion_minutos
        FROM USUARIO_TIEMPOS ut
        LEFT JOIN STATUS s ON s.status_id = ut.status_id
        WHERE ut.neus_id = @id
        ORDER BY ut.fecha_inicio DESC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getTimes:', e);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};

exports.getTodosConArea = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        u.NEUS_ID as id,
        u.NEUS_NOMBRES as nombre,
        u.NEUS_USUARIO as usuario,
        u.NEUS_TIPOUSUARIO as tipoUsuario,
        u.NEUS_ALIAS as alias,
        u.NEUS_FOTO_URL as fotoUrl,
        u.NEUS_FECHA_INGRESO as fechaIngreso,
        ISNULL(u.NEUS_PUESTO,'') as puesto,
        a.ACA_VENTAS_CAMPANA_NOMBRE as campana
      FROM NEUS_USUARIOS u
      LEFT JOIN AC_CAMPANIAS_AGENTES a ON a.ACA_NEUS_ID = u.NEUS_ID
      WHERE u.NEUS_ACTIVO = 1
      ORDER BY u.NEUS_TIPOUSUARIO, u.NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getTodosConArea:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo usuarios' });
  }
};

exports.getUsuariosByArea = async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!tipo) return res.status(400).json({ success: false, message: 'Tipo requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('tipo', sql.NVarChar, tipo.toUpperCase())
      .query(`
        SELECT
          u.NEUS_ID as id,
          u.NEUS_NOMBRES as nombre,
          u.NEUS_USUARIO as usuario,
          u.NEUS_TIPOUSUARIO as tipoUsuario,
          u.NEUS_ALIAS as alias,
          u.NEUS_FOTO_URL as fotoUrl,
          u.NEUS_FECHA_INGRESO as fechaIngreso,
          ISNULL(u.NEUS_PUESTO,'') as puesto,
          a.ACA_VENTAS_CAMPANA_NOMBRE as campana
        FROM NEUS_USUARIOS u
        LEFT JOIN AC_CAMPANIAS_AGENTES a ON a.ACA_NEUS_ID = u.NEUS_ID
        WHERE u.NEUS_TIPOUSUARIO = @tipo AND u.NEUS_ACTIVO = 1
        ORDER BY u.NEUS_NOMBRES
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getUsuariosByArea:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo área' });
  }
};

exports.getNuevosColaboradores = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT 
        NEUS_ID as id,
        NEUS_NOMBRES as nombre,
        NEUS_FOTO_URL as fotoUrl,
        NEUS_FECHA_INGRESO as fechaIngreso,
        DATEDIFF(DAY, NEUS_FECHA_INGRESO, GETDATE()) as diasDesdeIngreso
      FROM NEUS_USUARIOS
      WHERE NEUS_FECHA_INGRESO IS NOT NULL
        AND NEUS_ACTIVO = 1
        AND DATEDIFF(DAY, NEUS_FECHA_INGRESO, GETDATE()) <= 7
        AND DATEDIFF(DAY, NEUS_FECHA_INGRESO, GETDATE()) >= 0
      ORDER BY NEUS_FECHA_INGRESO DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error nuevos colaboradores:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo nuevos colaboradores' });
  }
};

exports.getAniversarios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT 
        NEUS_ID as id,
        NEUS_NOMBRES as nombre,
        NEUS_FOTO_URL as fotoUrl,
        NEUS_FECHA_INGRESO as fechaIngreso,
        DATEDIFF(YEAR, NEUS_FECHA_INGRESO, GETDATE()) as anios,
        DATENAME(MONTH, NEUS_FECHA_INGRESO) as mes,
        DAY(NEUS_FECHA_INGRESO) as dia
      FROM NEUS_USUARIOS
      WHERE NEUS_FECHA_INGRESO IS NOT NULL
        AND NEUS_ACTIVO = 1
        -- Excluir a quienes llevan 0 años (es decir, recién ingresados hoy/años recientes)
        AND DATEDIFF(YEAR, NEUS_FECHA_INGRESO, GETDATE()) > 0
        AND MONTH(NEUS_FECHA_INGRESO) = MONTH(GETDATE())
        AND DAY(NEUS_FECHA_INGRESO) = DAY(GETDATE())
      ORDER BY NEUS_FECHA_INGRESO DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error aniversarios:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo aniversarios' });
  }
};
    // Método para verificar si un usuario está en línea (sesión/estado activo)
    exports.checkUserOnline = async (req, res) => {
      try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, message: 'ID requerido' });

        const pool = await databaseService.getPool(req.user?.empresa);

        // 1) Hay registro activo en USUARIO_TIEMPOS (fecha_fin IS NULL)
        const active = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query(`
            SELECT TOP 1 1 as active
            FROM USUARIO_TIEMPOS
            WHERE neus_id = @id AND fecha_fin IS NULL
          `);
        if (active && active.recordset && active.recordset.length > 0) {
          return res.json({ success: true, data: { online: true, reason: 'tiempo_activo' } });
        }

        // 2) Si existe NEUS_STATUS_ID y su clave indica 'linea/online'
        const colCheck = await pool.request().query("SELECT COL_LENGTH('dbo.NEUS_USUARIOS','NEUS_STATUS_ID') as hascol");
        const hasCol = colCheck && colCheck.recordset && colCheck.recordset.length > 0 && colCheck.recordset[0].hascol != null;
        if (hasCol) {
          const r = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
              SELECT s.clave as status_key
              FROM NEUS_USUARIOS u
              LEFT JOIN STATUS s ON s.status_id = u.NEUS_STATUS_ID
              WHERE u.NEUS_ID = @id
            `);
          if (r.recordset.length > 0) {
            const key = (r.recordset[0].status_key || '').toString().toLowerCase();
            if (key.includes('line') || key.includes('linea') || key.includes('online')) {
              return res.json({ success: true, data: { online: true, reason: 'status_linea' } });
            }
          }
        }

        // 3) Por defecto, offline
        return res.json({ success: true, data: { online: false } });
      } catch (e) {
        console.error('Error checkUserOnline:', e);
        return res.status(500).json({ success: false, message: 'Error interno' });
      }
    };

exports.updatePuesto = async (req, res) => {
  try {
    const { id } = req.params;
    const { puesto } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('puesto', sql.NVarChar(200), puesto ?? null)
      .query(`UPDATE NEUS_USUARIOS SET NEUS_PUESTO = @puesto WHERE NEUS_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error updatePuesto:', e);
    res.status(500).json({ success: false, message: 'Error actualizando puesto' });
  }
};

// ── Ficha rápida del usuario: contacto + fecha de nacimiento + dirección ──
// Consolida NEUS_USUARIOS (correo, teléfono, fecha_cumpleanos) con el expediente
// (EXPEDIENTE_PERSONA.FECHA_NACIMIENTO y EXPEDIENTE_CONTACTO para la dirección),
// para poder ver/editar lo básico sin abrir el expediente completo.

const toISODate = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

exports.getUsuarioFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          u.NEUS_ID              AS id,
          u.NEUS_NOMBRES         AS nombre,
          ISNULL(u.NEUS_CORREO, '')    AS correo,
          ISNULL(u.NEUS_TELEFONO, '')  AS telefono,
          u.fecha_cumpleanos           AS fechaNacimientoNeus,
          per.FECHA_NACIMIENTO         AS fechaNacimientoExp,
          ISNULL(con.TEL_PRINCIPAL, '') AS telPrincipal,
          ISNULL(con.DIR_CALLE_NUMERO, '') AS calleNumero,
          ISNULL(con.DIR_COLONIA, '')      AS colonia,
          ISNULL(con.DIR_CODIGO_POSTAL, '') AS codigoPostal,
          ISNULL(con.DIR_CIUDAD, '')       AS ciudad,
          ISNULL(con.DIR_ESTADO, '')       AS estado,
          ISNULL(con.DIR_PAIS, '')         AS pais
        FROM NEUS_USUARIOS u
        LEFT JOIN EXPEDIENTE_PERSONA  per ON per.USUARIO_ID = u.NEUS_ID
        LEFT JOIN EXPEDIENTE_CONTACTO con ON con.USUARIO_ID = u.NEUS_ID
        WHERE u.NEUS_ID = @id
      `);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    const r = rs.recordset[0];
    res.json({
      success: true,
      data: {
        id: r.id,
        nombre: r.nombre,
        correo: r.correo,
        telefono: r.telefono || r.telPrincipal,
        fechaNacimiento: toISODate(r.fechaNacimientoExp) || toISODate(r.fechaNacimientoNeus),
        direccion: {
          calleNumero: r.calleNumero,
          colonia: r.colonia,
          codigoPostal: r.codigoPostal,
          ciudad: r.ciudad,
          estado: r.estado,
          pais: r.pais,
        },
      },
    });
  } catch (e) {
    console.error('Error getUsuarioFicha:', e);
    res.status(500).json({ success: false, message: 'Error al obtener la ficha del usuario' });
  }
};

exports.updateUsuarioFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const { correo, telefono, fechaNacimiento, direccion } = req.body || {};
    const dir = direccion || {};
    const fnac = fechaNacimiento ? new Date(fechaNacimiento) : null;
    // Solo se acepta una fecha de nacimiento plausible: entre 1940 y hoy.
    // Evita ensuciar la card de cumpleaños / el calendario con años futuros o basura.
    let fnacValida = fnac && !Number.isNaN(fnac.getTime()) ? fnac : null;
    if (fnacValida) {
      const y = fnacValida.getFullYear();
      if (y < 1940 || fnacValida > new Date()) {
        return res.status(400).json({ success: false, message: 'La fecha de nacimiento no es válida' });
      }
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // 1) NEUS_USUARIOS — correo, teléfono, cumpleaños (se mantiene sincronizado)
    await pool.request()
      .input('id', sql.Int, id)
      .input('correo', sql.NVarChar, correo ? String(correo).trim() : null)
      .input('telefono', sql.NVarChar, telefono ? String(telefono).trim() : null)
      .input('fnac', sql.Date, fnacValida)
      .query(`
        UPDATE NEUS_USUARIOS
        SET NEUS_CORREO = @correo,
            NEUS_TELEFONO = @telefono,
            fecha_cumpleanos = COALESCE(@fnac, fecha_cumpleanos)
        WHERE NEUS_ID = @id
      `);

    // 2) EXPEDIENTE_PERSONA — FECHA_NACIMIENTO (fuente de verdad del expediente)
    if (fnacValida) {
      await pool.request()
        .input('id', sql.Int, id)
        .input('fnac', sql.Date, fnacValida)
        .query(`
          MERGE dbo.EXPEDIENTE_PERSONA AS t
          USING (SELECT @id AS USUARIO_ID) AS s ON t.USUARIO_ID = s.USUARIO_ID
          WHEN MATCHED THEN UPDATE SET FECHA_NACIMIENTO = @fnac, ACTUALIZADO_EN = GETDATE()
          WHEN NOT MATCHED THEN INSERT (USUARIO_ID, FECHA_NACIMIENTO) VALUES (@id, @fnac);
        `);
    }

    // 3) EXPEDIENTE_CONTACTO — dirección + tel/correo espejo
    await pool.request()
      .input('id', sql.Int, id)
      .input('tel', sql.NVarChar, telefono ? String(telefono).trim() : null)
      .input('correo', sql.NVarChar, correo ? String(correo).trim() : null)
      .input('calle', sql.NVarChar, dir.calleNumero || null)
      .input('colonia', sql.NVarChar, dir.colonia || null)
      .input('cp', sql.NVarChar, dir.codigoPostal || null)
      .input('ciudad', sql.NVarChar, dir.ciudad || null)
      .input('estado', sql.NVarChar, dir.estado || null)
      .input('pais', sql.NVarChar, dir.pais || null)
      .query(`
        MERGE dbo.EXPEDIENTE_CONTACTO AS t
        USING (SELECT @id AS USUARIO_ID) AS s ON t.USUARIO_ID = s.USUARIO_ID
        WHEN MATCHED THEN UPDATE SET
          TEL_PRINCIPAL = @tel, CORREO = @correo,
          DIR_CALLE_NUMERO = @calle, DIR_COLONIA = @colonia, DIR_CODIGO_POSTAL = @cp,
          DIR_CIUDAD = @ciudad, DIR_ESTADO = @estado, DIR_PAIS = @pais,
          ACTUALIZADO_EN = GETDATE()
        WHEN NOT MATCHED THEN INSERT
          (USUARIO_ID, TEL_PRINCIPAL, CORREO, DIR_CALLE_NUMERO, DIR_COLONIA, DIR_CODIGO_POSTAL, DIR_CIUDAD, DIR_ESTADO, DIR_PAIS)
          VALUES (@id, @tel, @correo, @calle, @colonia, @cp, @ciudad, @estado, @pais);
      `);

    // 4) Si cambió la fecha de nacimiento, resincronizar los eventos de cumpleaños
    //    del calendario (mismo SP que usa el módulo de perfil).
    if (fnacValida) {
      try {
        await pool.request().execute('sp_sincronizar_cumpleanos');
      } catch (syncError) {
        console.error('updateUsuarioFicha: error al sincronizar cumpleaños en calendario:', syncError.message);
      }
    }

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'editar-ficha', entidadId: id,
      detalle: { correo, telefono }, ip: req.ip,
    }).catch(() => {});

    res.json({ success: true });
  } catch (e) {
    console.error('Error updateUsuarioFicha:', e);
    res.status(500).json({ success: false, message: 'Error al guardar la ficha del usuario' });
  }
};
