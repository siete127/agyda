const sql = require('mssql')
const databaseService = require('../services/databaseService')

async function ensureTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VENTAS_TAB_ACCESOS' AND xtype='U')
    CREATE TABLE VENTAS_TAB_ACCESOS (
      VTA_ID       INT IDENTITY(1,1) PRIMARY KEY,
      VTA_USER_ID  SMALLINT     NOT NULL,
      VTA_TAB      NVARCHAR(50) NOT NULL,
      VTA_PERMISOS NVARCHAR(500) NOT NULL DEFAULT '',
      VTA_ACTIVO   BIT          NOT NULL DEFAULT 1,
      CONSTRAINT UQ_VENTAS_TAB_ACCESOS UNIQUE (VTA_USER_ID, VTA_TAB)
    )
  `)
}

// GET /api/tabaccesos?userId=X — obtener todas las pestañas del usuario
exports.getTabAccesos = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId || '0')
    if (!userId) return res.json({ success: true, data: [] })

    const pool = await databaseService.getPool(req.user?.empresa)
    await ensureTable(pool)

    const result = await pool.request()
      .input('uid', sql.SmallInt, userId)
      .query(`
        SELECT VTA_TAB AS tab, VTA_PERMISOS AS permisos, VTA_ACTIVO AS activo
        FROM VENTAS_TAB_ACCESOS
        WHERE VTA_USER_ID = @uid
      `)

    const data = result.recordset.map(r => ({
      tab: r.tab,
      permisos: r.permisos ? String(r.permisos).split(',').filter(Boolean) : [],
      activo: r.activo === true || r.activo === 1,
    }))
    res.json({ success: true, data })
  } catch (e) {
    console.error('tabAccesos.getTabAccesos:', e)
    res.status(500).json({ success: false, data: [] })
  }
}

// GET /api/tabaccesos/mis-permisos?userId=X — para carga al login
exports.getMisTabPermisos = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId || '0')
    if (!userId) return res.json({ success: true, data: [] })

    const pool = await databaseService.getPool(req.user?.empresa)
    await ensureTable(pool)

    const result = await pool.request()
      .input('uid', sql.SmallInt, userId)
      .query(`
        SELECT VTA_TAB AS tab, VTA_PERMISOS AS permisos
        FROM VENTAS_TAB_ACCESOS
        WHERE VTA_USER_ID = @uid AND VTA_ACTIVO = 1
      `)

    const data = result.recordset.map(r => ({
      tab: r.tab,
      permisos: r.permisos ? String(r.permisos).split(',').filter(Boolean) : [],
    }))
    res.json({ success: true, data })
  } catch (e) {
    console.error('tabAccesos.getMisTabPermisos:', e)
    res.status(500).json({ success: false, data: [] })
  }
}

// POST /api/tabaccesos — guardar permisos de pestañas de un usuario (reemplaza todos)
exports.setTabAccesos = async (req, res) => {
  try {
    const { userId, tabs } = req.body
    // tabs: [{ tab: 'ventas', permisos: ['ver','descargar'], activo: true }, ...]
    if (!userId || !Array.isArray(tabs)) {
      return res.status(400).json({ success: false, message: 'userId y tabs requeridos' })
    }

    const pool = await databaseService.getPool(req.user?.empresa)
    await ensureTable(pool)

    // Verificar que el usuario sea AD o TI
    const check = await pool.request()
      .input('uid', sql.SmallInt, parseInt(userId))
      .query(`SELECT NEUS_TIPOUSUARIO FROM NEUS_USUARIOS WHERE NEUS_ID=@uid AND NEUS_ACTIVO=1`)
    if (!check.recordset.length) {
      return res.status(400).json({ success: false, message: 'Usuario no encontrado o inactivo' })
    }
    if (!['AD','TI'].includes(check.recordset[0].NEUS_TIPOUSUARIO)) {
      return res.status(403).json({ success: false, message: 'Solo usuarios AD o TI' })
    }

    // Borrar registros existentes del usuario
    await pool.request()
      .input('uid', sql.SmallInt, parseInt(userId))
      .query(`DELETE FROM VENTAS_TAB_ACCESOS WHERE VTA_USER_ID=@uid`)

    // Insertar los nuevos
    for (const t of tabs) {
      if (!t.tab) continue
      const permStr = Array.isArray(t.permisos) ? t.permisos.join(',') : ''
      await pool.request()
        .input('uid',      sql.SmallInt,     parseInt(userId))
        .input('tab',      sql.NVarChar(50), t.tab)
        .input('permisos', sql.NVarChar(500), permStr)
        .input('activo',   sql.Bit,          t.activo !== false ? 1 : 0)
        .query(`
          INSERT INTO VENTAS_TAB_ACCESOS (VTA_USER_ID, VTA_TAB, VTA_PERMISOS, VTA_ACTIVO)
          VALUES (@uid, @tab, @permisos, @activo)
        `)
    }

    res.json({ success: true, message: 'Permisos de pestañas actualizados' })
  } catch (e) {
    console.error('tabAccesos.setTabAccesos:', e)
    res.status(500).json({ success: false, message: 'Error al guardar permisos de pestañas' })
  }
}
