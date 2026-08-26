const sql = require('mssql')
const databaseService = require('../services/databaseService')
const { logAudit } = require('../services/auditService')
const path = require('path')
const fs = require('fs')

/* ── helpers ── */
function userId(req) { return req.user?.id || req.user?.userId || parseInt(req.headers.usuarioid) || 0 }
function userName(req) { return req.user?.nombre || req.user?.username || req.headers['x-user-nombre'] || 'Sistema' }
function userTipo(req) { return (req.user?.tipoUsuario || req.user?.role || req.headers.tipousuario || '').toUpperCase() }
function isAdmin(req) { const t = userTipo(req); return t === 'AD' || t === 'TI' }

/* ══════════════════════
   CATEGORÍAS
══════════════════════ */
exports.getCategorias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request().query(`
      SELECT GC_ID as id, GC_CODIGO as codigo, GC_NOMBRE as nombre,
             GC_DESCRIPCION as descripcion, GC_TIPO as tipo,
             GC_TARIFA_KM as tarifaKm, GC_ACTIVO as activo
      FROM GASTOS_CATEGORIAS
      WHERE GC_ACTIVO = 1
      ORDER BY GC_ORDEN, GC_NOMBRE
    `)
    res.json({ success: true, data: r.recordset })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.createCategoria = async (req, res) => {
  try {
    const { codigo, nombre, descripcion, tipo, tarifaKm, orden } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request()
      .input('cod',  sql.NVarChar, codigo)
      .input('nom',  sql.NVarChar, nombre)
      .input('desc', sql.NVarChar, descripcion || null)
      .input('tipo', sql.NVarChar, tipo || 'monto')
      .input('km',   sql.Decimal,  tarifaKm || null)
      .input('ord',  sql.SmallInt, orden || 0)
      .query(`
        INSERT INTO GASTOS_CATEGORIAS (GC_CODIGO,GC_NOMBRE,GC_DESCRIPCION,GC_TIPO,GC_TARIFA_KM,GC_ORDEN)
        OUTPUT INSERTED.GC_ID as id
        VALUES (@cod,@nom,@desc,@tipo,@km,@ord)
      `)
    res.json({ success: true, data: { id: r.recordset[0].id } })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.updateCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, tipo, tarifaKm, activo, orden } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request()
      .input('id',   sql.Int,      req.params.id)
      .input('nom',  sql.NVarChar, nombre)
      .input('desc', sql.NVarChar, descripcion || null)
      .input('tipo', sql.NVarChar, tipo || 'monto')
      .input('km',   sql.Decimal,  tarifaKm || null)
      .input('act',  sql.Bit,      activo ?? 1)
      .input('ord',  sql.SmallInt, orden || 0)
      .query(`
        UPDATE GASTOS_CATEGORIAS
        SET GC_NOMBRE=@nom, GC_DESCRIPCION=@desc, GC_TIPO=@tipo,
            GC_TARIFA_KM=@km, GC_ACTIVO=@act, GC_ORDEN=@ord
        WHERE GC_ID=@id
      `)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

/* ══════════════════════
   GASTOS INDIVIDUALES
══════════════════════ */
exports.getMisGastos = async (req, res) => {
  try {
    const uid = userId(req)
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request()
      .input('uid', sql.Int, uid)
      .query(`
        SELECT g.G_ID as id, g.G_CATEGORIA_ID as categoriaId,
               c.GC_NOMBRE as categoriaNombre, c.GC_CODIGO as categoriaCodigo,
               c.GC_TIPO as categoriaTipo, c.GC_TARIFA_KM as tarifaKm,
               g.G_DESCRIPCION as descripcion,
               CONVERT(VARCHAR(10), g.G_FECHA, 23) as fecha,
               g.G_MONTO as monto, g.G_CANTIDAD as cantidad,
               g.G_PAGADO_POR as pagadoPor, g.G_RECIBO_URL as reciboUrl,
               g.G_REPORTE_ID as reporteId, g.G_NOTAS as notas,
               g.G_ESTATUS as estatus, g.G_FECHA_REG as fechaReg
        FROM GASTOS g
        JOIN GASTOS_CATEGORIAS c ON c.GC_ID = g.G_CATEGORIA_ID
        WHERE g.G_USUARIO_ID = @uid AND g.G_ACTIVO = 1
        ORDER BY g.G_FECHA DESC, g.G_ID DESC
      `)
    res.json({ success: true, data: r.recordset })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.createGasto = async (req, res) => {
  try {
    const uid = userId(req)
    const { categoriaId, descripcion, fecha, monto, cantidad, pagadoPor, notas } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request()
      .input('uid',  sql.Int,      uid)
      .input('cat',  sql.Int,      categoriaId)
      .input('desc', sql.NVarChar, descripcion)
      .input('fec',  sql.Date,     fecha)
      .input('mon',  sql.Decimal,  monto || 0)
      .input('cant', sql.Decimal,  cantidad || null)
      .input('pag',  sql.NVarChar, pagadoPor || 'empleado')
      .input('not',  sql.NVarChar, notas || null)
      .query(`
        INSERT INTO GASTOS (G_USUARIO_ID,G_CATEGORIA_ID,G_DESCRIPCION,G_FECHA,G_MONTO,G_CANTIDAD,G_PAGADO_POR,G_NOTAS)
        OUTPUT INSERTED.G_ID as id
        VALUES (@uid,@cat,@desc,@fec,@mon,@cant,@pag,@not)
      `)
    const id = r.recordset[0].id
    await logAudit(pool, { userId: uid, userName: userName(req), modulo: 'Gastos', accion: 'CREAR_GASTO', entidadId: id, ip: req.ip })
    res.json({ success: true, data: { id } })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.updateGasto = async (req, res) => {
  try {
    const uid = userId(req)
    const { categoriaId, descripcion, fecha, monto, cantidad, pagadoPor, notas } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    // Solo puede editar gastos propios en borrador
    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('uid', sql.Int, uid)
      .query(`SELECT G_ESTATUS FROM GASTOS WHERE G_ID=@id AND G_USUARIO_ID=@uid AND G_ACTIVO=1`)
    if (!check.recordset.length) return res.status(404).json({ success: false, message: 'Gasto no encontrado' })
    if (check.recordset[0].G_ESTATUS !== 'borrador') return res.status(400).json({ success: false, message: 'Solo se pueden editar gastos en borrador' })

    await pool.request()
      .input('id',   sql.Int,      req.params.id)
      .input('cat',  sql.Int,      categoriaId)
      .input('desc', sql.NVarChar, descripcion)
      .input('fec',  sql.Date,     fecha)
      .input('mon',  sql.Decimal,  monto || 0)
      .input('cant', sql.Decimal,  cantidad || null)
      .input('pag',  sql.NVarChar, pagadoPor || 'empleado')
      .input('not',  sql.NVarChar, notas || null)
      .query(`
        UPDATE GASTOS SET G_CATEGORIA_ID=@cat, G_DESCRIPCION=@desc, G_FECHA=@fec,
          G_MONTO=@mon, G_CANTIDAD=@cant, G_PAGADO_POR=@pag, G_NOTAS=@not
        WHERE G_ID=@id
      `)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.deleteGasto = async (req, res) => {
  try {
    const uid = userId(req)
    const pool = await databaseService.getPool(req.user?.empresa)
    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('uid', sql.Int, uid)
      .query(`SELECT G_ESTATUS, G_RECIBO_URL FROM GASTOS WHERE G_ID=@id AND G_USUARIO_ID=@uid AND G_ACTIVO=1`)
    if (!check.recordset.length) return res.status(404).json({ success: false, message: 'Gasto no encontrado' })
    if (check.recordset[0].G_ESTATUS !== 'borrador') return res.status(400).json({ success: false, message: 'Solo se pueden eliminar gastos en borrador' })

    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE GASTOS SET G_ACTIVO=0 WHERE G_ID=@id`)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.uploadRecibo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió archivo' })
    const uid = userId(req)
    const pool = await databaseService.getPool(req.user?.empresa)
    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('uid', sql.Int, uid)
      .query(`SELECT G_ID FROM GASTOS WHERE G_ID=@id AND G_USUARIO_ID=@uid AND G_ACTIVO=1`)
    if (!check.recordset.length) return res.status(404).json({ success: false, message: 'Gasto no encontrado' })

    const reciboUrl = `/intranet/Gastos/${req.file.filename}`
    await pool.request()
      .input('id',  sql.Int,      req.params.id)
      .input('url', sql.NVarChar, reciboUrl)
      .query(`UPDATE GASTOS SET G_RECIBO_URL=@url WHERE G_ID=@id`)
    res.json({ success: true, data: { reciboUrl } })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

/* ══════════════════════
   REPORTES
══════════════════════ */
exports.getMisReportes = async (req, res) => {
  try {
    const uid = userId(req)
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request()
      .input('uid', sql.Int, uid)
      .query(`
        SELECT gr.GR_ID as id, gr.GR_TITULO as titulo, gr.GR_TOTAL as total,
               gr.GR_ESTATUS as estatus, gr.GR_METODO_PAGO as metodoPago,
               gr.GR_NOTAS as notas,
               CONVERT(VARCHAR(23), gr.GR_FECHA_REG, 126) as fechaReg,
               CONVERT(VARCHAR(23), gr.GR_FECHA_ENVIO, 126) as fechaEnvio,
               CONVERT(VARCHAR(23), gr.GR_FECHA_PAGO, 126) as fechaPago,
               m.NEUS_NOMBRES as managerNombre,
               (SELECT COUNT(*) FROM GASTOS WHERE G_REPORTE_ID=gr.GR_ID AND G_ACTIVO=1) as numGastos
        FROM GASTOS_REPORTES gr
        LEFT JOIN NEUS_USUARIOS m ON m.NEUS_ID = gr.GR_MANAGER_ID
        WHERE gr.GR_USUARIO_ID = @uid AND gr.GR_ACTIVO = 1
        ORDER BY gr.GR_FECHA_REG DESC
      `)
    res.json({ success: true, data: r.recordset })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.createReporte = async (req, res) => {
  try {
    const uid = userId(req)
    const { titulo, gastoIds } = req.body
    if (!Array.isArray(gastoIds) || !gastoIds.length) return res.status(400).json({ success: false, message: 'Selecciona al menos un gasto' })

    const pool = await databaseService.getPool(req.user?.empresa)

    // Verificar que todos los gastos sean del usuario y estén en borrador
    const ids = gastoIds.map(Number).join(',')
    const check = await pool.request().input('uid', sql.Int, uid)
      .query(`SELECT G_ID, G_MONTO FROM GASTOS WHERE G_ID IN (${ids}) AND G_USUARIO_ID=@uid AND G_ESTATUS='borrador' AND G_ACTIVO=1`)
    if (check.recordset.length !== gastoIds.length) return res.status(400).json({ success: false, message: 'Algunos gastos no son válidos o ya están en un reporte' })

    const total = check.recordset.reduce((s, g) => s + Number(g.G_MONTO), 0)

    const ins = await pool.request()
      .input('tit', sql.NVarChar, titulo)
      .input('uid', sql.Int, uid)
      .input('tot', sql.Decimal, total)
      .query(`
        INSERT INTO GASTOS_REPORTES (GR_TITULO, GR_USUARIO_ID, GR_TOTAL)
        OUTPUT INSERTED.GR_ID as id
        VALUES (@tit, @uid, @tot)
      `)
    const reporteId = ins.recordset[0].id

    await pool.request().input('rid', sql.Int, reporteId)
      .query(`UPDATE GASTOS SET G_REPORTE_ID=@rid, G_ESTATUS='en_reporte' WHERE G_ID IN (${ids})`)

    await logAudit(pool, { userId: uid, userName: userName(req), modulo: 'Gastos', accion: 'CREAR_REPORTE', entidadId: reporteId, ip: req.ip })
    res.json({ success: true, data: { id: reporteId } })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.getReporte = async (req, res) => {
  try {
    const uid = userId(req)
    const admin = isAdmin(req)
    const pool = await databaseService.getPool(req.user?.empresa)

    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT gr.GR_ID as id, gr.GR_TITULO as titulo,
               gr.GR_USUARIO_ID as usuarioId, u.NEUS_NOMBRES as usuarioNombre,
               gr.GR_MANAGER_ID as managerId, m.NEUS_NOMBRES as managerNombre,
               gr.GR_TOTAL as total, gr.GR_ESTATUS as estatus,
               gr.GR_METODO_PAGO as metodoPago, gr.GR_NOTAS as notas,
               CONVERT(VARCHAR(23), gr.GR_FECHA_REG, 126) as fechaReg,
               CONVERT(VARCHAR(23), gr.GR_FECHA_ENVIO, 126) as fechaEnvio,
               CONVERT(VARCHAR(23), gr.GR_FECHA_PAGO, 126) as fechaPago
        FROM GASTOS_REPORTES gr
        JOIN NEUS_USUARIOS u ON u.NEUS_ID = gr.GR_USUARIO_ID
        LEFT JOIN NEUS_USUARIOS m ON m.NEUS_ID = gr.GR_MANAGER_ID
        WHERE gr.GR_ID=@id AND gr.GR_ACTIVO=1
      `)
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'Reporte no encontrado' })
    const rep = r.recordset[0]

    // Solo el dueño o admin pueden ver
    if (!admin && rep.usuarioId !== uid) return res.status(403).json({ success: false, message: 'Sin acceso' })

    const gastos = await pool.request().input('rid', sql.Int, req.params.id).query(`
      SELECT g.G_ID as id, g.G_CATEGORIA_ID as categoriaId,
             c.GC_NOMBRE as categoriaNombre, c.GC_CODIGO as categoriaCodigo,
             g.G_DESCRIPCION as descripcion,
             CONVERT(VARCHAR(10), g.G_FECHA, 23) as fecha,
             g.G_MONTO as monto, g.G_CANTIDAD as cantidad,
             g.G_PAGADO_POR as pagadoPor, g.G_RECIBO_URL as reciboUrl,
             g.G_NOTAS as notas, g.G_ESTATUS as estatus
      FROM GASTOS g
      JOIN GASTOS_CATEGORIAS c ON c.GC_ID = g.G_CATEGORIA_ID
      WHERE g.G_REPORTE_ID=@rid AND g.G_ACTIVO=1
      ORDER BY g.G_FECHA, g.G_ID
    `)

    const coms = await pool.request().input('rid', sql.Int, req.params.id).query(`
      SELECT gc.GCOM_ID as id, gc.GCOM_USUARIO_ID as usuarioId,
             u.NEUS_NOMBRES as usuarioNombre, gc.GCOM_TEXTO as texto,
             CONVERT(VARCHAR(23), gc.GCOM_FECHA, 126) as fecha
      FROM GASTOS_COMENTARIOS gc
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = gc.GCOM_USUARIO_ID
      WHERE gc.GCOM_REPORTE_ID=@rid
      ORDER BY gc.GCOM_FECHA
    `)

    res.json({ success: true, data: { ...rep, gastos: gastos.recordset, comentarios: coms.recordset } })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.enviarReporte = async (req, res) => {
  try {
    const uid = userId(req)
    const pool = await databaseService.getPool(req.user?.empresa)
    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('uid', sql.Int, uid)
      .query(`SELECT GR_ESTATUS FROM GASTOS_REPORTES WHERE GR_ID=@id AND GR_USUARIO_ID=@uid AND GR_ACTIVO=1`)
    if (!check.recordset.length) return res.status(404).json({ success: false, message: 'Reporte no encontrado' })
    if (check.recordset[0].GR_ESTATUS !== 'borrador') return res.status(400).json({ success: false, message: 'El reporte ya fue enviado' })

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE GASTOS_REPORTES SET GR_ESTATUS='enviado', GR_FECHA_ENVIO=GETDATE() WHERE GR_ID=@id`)

    await logAudit(pool, { userId: uid, userName: userName(req), modulo: 'Gastos', accion: 'ENVIAR_REPORTE', entidadId: req.params.id, ip: req.ip })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.addComentario = async (req, res) => {
  try {
    const uid = userId(req)
    const { texto } = req.body
    if (!texto?.trim()) return res.status(400).json({ success: false, message: 'Texto requerido' })
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request()
      .input('rid', sql.Int, req.params.id)
      .input('uid', sql.Int, uid)
      .input('txt', sql.NVarChar, texto.trim())
      .query(`INSERT INTO GASTOS_COMENTARIOS (GCOM_REPORTE_ID,GCOM_USUARIO_ID,GCOM_TEXTO) VALUES (@rid,@uid,@txt)`)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

/* ══════════════════════
   ADMIN
══════════════════════ */
exports.getAllReportes = async (req, res) => {
  try {
    const { estatus, usuarioId, fechaDesde, fechaHasta } = req.query
    const pool = await databaseService.getPool(req.user?.empresa)
    let where = 'gr.GR_ACTIVO=1'
    const req2 = pool.request()
    if (estatus) { where += ' AND gr.GR_ESTATUS=@est'; req2.input('est', sql.NVarChar, estatus) }
    if (usuarioId) { where += ' AND gr.GR_USUARIO_ID=@uid'; req2.input('uid', sql.Int, usuarioId) }
    if (fechaDesde) { where += ' AND gr.GR_FECHA_REG >= @fd'; req2.input('fd', sql.DateTime, new Date(fechaDesde)) }
    if (fechaHasta) { where += ' AND gr.GR_FECHA_REG <= @fh'; req2.input('fh', sql.DateTime, new Date(fechaHasta + 'T23:59:59')) }

    const r = await req2.query(`
      SELECT gr.GR_ID as id, gr.GR_TITULO as titulo,
             gr.GR_USUARIO_ID as usuarioId, u.NEUS_NOMBRES as usuarioNombre,
             gr.GR_TOTAL as total, gr.GR_ESTATUS as estatus,
             gr.GR_METODO_PAGO as metodoPago,
             CONVERT(VARCHAR(23), gr.GR_FECHA_REG, 126) as fechaReg,
             CONVERT(VARCHAR(23), gr.GR_FECHA_ENVIO, 126) as fechaEnvio,
             CONVERT(VARCHAR(23), gr.GR_FECHA_PAGO, 126) as fechaPago,
             (SELECT COUNT(*) FROM GASTOS WHERE G_REPORTE_ID=gr.GR_ID AND G_ACTIVO=1) as numGastos
      FROM GASTOS_REPORTES gr
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = gr.GR_USUARIO_ID
      WHERE ${where}
      ORDER BY gr.GR_FECHA_REG DESC
    `)
    res.json({ success: true, data: r.recordset })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.aprobarReporte = async (req, res) => {
  try {
    const uid = userId(req)
    const { gastoIdsRechazados = [] } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)

    const check = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT GR_ESTATUS FROM GASTOS_REPORTES WHERE GR_ID=@id AND GR_ACTIVO=1`)
    if (!check.recordset.length) return res.status(404).json({ success: false, message: 'Reporte no encontrado' })
    if (!['enviado', 'borrador'].includes(check.recordset[0].GR_ESTATUS)) return res.status(400).json({ success: false, message: 'El reporte no está en estado enviado' })

    await pool.request()
      .input('id',  sql.Int, req.params.id)
      .input('mid', sql.Int, uid)
      .query(`UPDATE GASTOS_REPORTES SET GR_ESTATUS='aprobado', GR_MANAGER_ID=@mid WHERE GR_ID=@id`)

    // Gastos aprobados
    await pool.request().input('rid', sql.Int, req.params.id)
      .query(`UPDATE GASTOS SET G_ESTATUS='aprobado' WHERE G_REPORTE_ID=@rid AND G_ACTIVO=1`)

    // Gastos rechazados (si los hay)
    if (gastoIdsRechazados.length) {
      const idsStr = gastoIdsRechazados.map(Number).join(',')
      await pool.request().query(`UPDATE GASTOS SET G_ESTATUS='rechazado' WHERE G_ID IN (${idsStr})`)
    }

    await logAudit(pool, { userId: uid, userName: userName(req), modulo: 'Gastos', accion: 'APROBAR_REPORTE', entidadId: req.params.id, ip: req.ip })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.rechazarReporte = async (req, res) => {
  try {
    const uid = userId(req)
    const { notas } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request()
      .input('id',   sql.Int,      req.params.id)
      .input('mid',  sql.Int,      uid)
      .input('not',  sql.NVarChar, notas || null)
      .query(`UPDATE GASTOS_REPORTES SET GR_ESTATUS='rechazado', GR_MANAGER_ID=@mid, GR_NOTAS=@not WHERE GR_ID=@id`)

    await pool.request().input('rid', sql.Int, req.params.id)
      .query(`UPDATE GASTOS SET G_ESTATUS='rechazado' WHERE G_REPORTE_ID=@rid AND G_ACTIVO=1`)

    await logAudit(pool, { userId: uid, userName: userName(req), modulo: 'Gastos', accion: 'RECHAZAR_REPORTE', entidadId: req.params.id, ip: req.ip })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

exports.registrarPago = async (req, res) => {
  try {
    const uid = userId(req)
    const { metodoPago } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request()
      .input('id',  sql.Int,      req.params.id)
      .input('met', sql.NVarChar, metodoPago || 'transferencia')
      .query(`UPDATE GASTOS_REPORTES SET GR_ESTATUS='pagado', GR_METODO_PAGO=@met, GR_FECHA_PAGO=GETDATE() WHERE GR_ID=@id`)

    await logAudit(pool, { userId: uid, userName: userName(req), modulo: 'Gastos', accion: 'REGISTRAR_PAGO', entidadId: req.params.id, ip: req.ip })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}
