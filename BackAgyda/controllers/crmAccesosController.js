const sql = require('mssql')
const databaseService = require('../services/databaseService')

// GET /api/crm-accesos — lista usuarios AD/TI activos con su acceso CRM
exports.getAccesos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa)
    const result = await pool.request().query(`
      SELECT
        u.NEUS_ID       AS id,
        u.NEUS_NOMBRES  AS nombre,
        u.NEUS_USUARIO  AS usuario,
        u.NEUS_TIPOUSUARIO AS tipoUsuario,
        u.NEUS_ACTIVO   AS activo,
        u.NEUS_FOTO_URL AS fotoUrl,
        a.VCA_ID        AS accesoId,
        a.VCA_PERMISOS  AS permisos,
        a.VCA_ACTIVO    AS accesoActivo
      FROM NEUS_USUARIOS u
      LEFT JOIN VENTAS_CRM_ACCESOS a ON a.VCA_USER_ID = u.NEUS_ID
      WHERE u.NEUS_TIPOUSUARIO IN ('AD','TI')
        AND u.NEUS_ACTIVO = 1
      ORDER BY u.NEUS_TIPOUSUARIO, u.NEUS_NOMBRES
    `)
    res.json({ success: true, data: result.recordset })
  } catch (e) {
    console.error('crmAccesos.getAccesos:', e)
    res.status(500).json({ success: false, message: 'Error al obtener accesos CRM' })
  }
}

// POST /api/crm-accesos — agregar acceso CRM a un usuario
exports.addAcceso = async (req, res) => {
  try {
    const { userId, permisos } = req.body
    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' })

    const permisosStr = Array.isArray(permisos)
      ? permisos.join(',')
      : (permisos || 'ver_lista,editar,agregar,subir,eliminar,dashboard')

    const pool = await databaseService.getPool(req.user?.empresa)

    // Verificar que el usuario sea AD o TI y esté activo
    const check = await pool.request()
      .input('uid', sql.SmallInt, parseInt(userId))
      .query(`SELECT NEUS_TIPOUSUARIO FROM NEUS_USUARIOS WHERE NEUS_ID=@uid AND NEUS_ACTIVO=1`)
    if (!check.recordset.length) {
      return res.status(400).json({ success: false, message: 'Usuario no encontrado o inactivo' })
    }
    const tipo = check.recordset[0].NEUS_TIPOUSUARIO
    if (!['AD','TI'].includes(tipo)) {
      return res.status(403).json({ success: false, message: 'Solo usuarios AD o TI pueden tener acceso CRM' })
    }

    // Evitar duplicados
    const existe = await pool.request()
      .input('uid', sql.SmallInt, parseInt(userId))
      .query(`SELECT VCA_ID FROM VENTAS_CRM_ACCESOS WHERE VCA_USER_ID=@uid`)
    if (existe.recordset.length) {
      return res.status(409).json({ success: false, message: 'El usuario ya tiene acceso CRM' })
    }

    await pool.request()
      .input('uid',      sql.SmallInt,    parseInt(userId))
      .input('permisos', sql.NVarChar(200), permisosStr)
      .query(`INSERT INTO VENTAS_CRM_ACCESOS (VCA_USER_ID, VCA_PERMISOS) VALUES (@uid, @permisos)`)

    res.json({ success: true, message: 'Acceso CRM agregado' })
  } catch (e) {
    console.error('crmAccesos.addAcceso:', e)
    res.status(500).json({ success: false, message: 'Error al agregar acceso CRM' })
  }
}

// PUT /api/crm-accesos/:id — editar permisos o activar/desactivar
exports.updateAcceso = async (req, res) => {
  try {
    const { id } = req.params
    const { permisos, activo } = req.body

    const pool = await databaseService.getPool(req.user?.empresa)
    const req2 = pool.request().input('id', sql.Int, parseInt(id))

    const sets = []
    if (permisos !== undefined) {
      const ps = Array.isArray(permisos) ? permisos.join(',') : permisos
      req2.input('permisos', sql.NVarChar(200), ps)
      sets.push('VCA_PERMISOS=@permisos')
    }
    if (activo !== undefined) {
      req2.input('activo', sql.Bit, activo ? 1 : 0)
      sets.push('VCA_ACTIVO=@activo')
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nada que actualizar' })

    await req2.query(`UPDATE VENTAS_CRM_ACCESOS SET ${sets.join(',')} WHERE VCA_ID=@id`)
    res.json({ success: true, message: 'Acceso actualizado' })
  } catch (e) {
    console.error('crmAccesos.updateAcceso:', e)
    res.status(500).json({ success: false, message: 'Error al actualizar acceso CRM' })
  }
}

// GET /api/crmaccesos/mis-permisos?userId=X — permisos del usuario logueado
exports.getMisPermisos = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId || '0')
    if (!userId) return res.json({ success: true, permisos: [], activo: false })

    const pool = await databaseService.getPool(req.user?.empresa)
    const result = await pool.request()
      .input('uid', sql.SmallInt, userId)
      .query(`
        SELECT VCA_PERMISOS AS permisos, VCA_ACTIVO AS activo
        FROM VENTAS_CRM_ACCESOS
        WHERE VCA_USER_ID = @uid
      `)

    if (!result.recordset.length) return res.json({ success: true, permisos: [], activo: false })

    const row = result.recordset[0]
    const activo = row.activo === true || row.activo === 1
    const permisos = activo && row.permisos ? String(row.permisos).split(',') : []
    res.json({ success: true, permisos, activo })
  } catch (e) {
    console.error('crmAccesos.getMisPermisos:', e)
    res.status(500).json({ success: false, permisos: [], activo: false })
  }
}

// DELETE /api/crm-accesos/:id — quitar acceso CRM
exports.deleteAcceso = async (req, res) => {
  try {
    const { id } = req.params
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`DELETE FROM VENTAS_CRM_ACCESOS WHERE VCA_ID=@id`)
    res.json({ success: true, message: 'Acceso eliminado' })
  } catch (e) {
    console.error('crmAccesos.deleteAcceso:', e)
    res.status(500).json({ success: false, message: 'Error al eliminar acceso CRM' })
  }
}
