const sql = require('mssql')
const databaseService = require('../services/databaseService')
const personalizacion = require('./personalizacionController')
const { getUserAllowedActions } = require('../middleware/moduleAccess')
const { esSuperAdminFijo } = require('../utils/superAdmin')

async function _getPool(req) { return databaseService.getPool(req?.user?.empresa) }

function _fmtFolio(id) {
  return 'COT-' + String(id).padStart(4, '0')
}

// Umbrales de margen + IVA default para el tenant del request.
async function _cfgVentas(req) {
  try {
    const config = await personalizacion.getConfigForTenant(req?.user?.empresa)
    return personalizacion.calcMargenConfig(config)
  } catch (_) {
    return { verdeMin: 25, amarilloMin: 15, rojoMax: 15, requiereOverride: true, tasaIvaDefault: 0.16 }
  }
}

function _calcSemaforo(margenPct, cfg) {
  if (margenPct == null) return 'SIN_COSTO'
  if (margenPct > cfg.verdeMin) return 'VERDE'
  if (margenPct >= cfg.amarilloMin) return 'AMARILLO'
  return 'ROJO'
}

// ¿El usuario puede autorizar un margen en rojo?
async function _puedeOverride(req) {
  try {
    if (esSuperAdminFijo(req)) return true
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId)
    if (!uid) return false
    const allowed = await getUserAllowedActions(uid, 'crm', req.user?.empresa)
    return allowed.has('*') || allowed.has('cotizacion-override-margen')
  } catch (_) {
    return false
  }
}

// Recalcula subtotal / IVA / costo / utilidad / margen / semáforo de una cotización
// a partir de sus renglones ya persistidos, y actualiza la cabecera.
async function _recalcCabecera(pool, cotId, cfg) {
  const it = await pool.request().input('id', sql.Int, cotId).query(
    `SELECT COTI_ES_SECCION esSeccion, COTI_CANTIDAD cantidad, COTI_PRECIO_UNIT precio,
            COTI_DESCUENTO dto, COTI_COSTO_UNIT costo, COTI_IVA_TASA ivaTasa
     FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id`,
  )
  let subtotal = 0, iva = 0, costoTotal = 0, conCosto = false
  for (const r of it.recordset) {
    if (r.esSeccion) continue
    const cant = Number(r.cantidad) || 0
    const base = cant * (Number(r.precio) || 0) * (1 - (Number(r.dto) || 0) / 100)
    subtotal += base
    iva += base * (r.ivaTasa != null ? Number(r.ivaTasa) : cfg.tasaIvaDefault)
    if (r.costo != null) { conCosto = true; costoTotal += Number(r.costo) * cant }
  }
  const total = subtotal + iva
  const utilidad = conCosto ? subtotal - costoTotal : null
  const margenPct = conCosto && subtotal > 0 ? (utilidad / subtotal) * 100 : null
  const semaforo = _calcSemaforo(margenPct, cfg)
  await pool.request()
    .input('id', sql.Int, cotId)
    .input('sub', sql.Decimal(18, 2), subtotal)
    .input('iva', sql.Decimal(18, 2), iva)
    .input('total', sql.Decimal(18, 2), total)
    .input('ct', sql.Decimal(18, 2), conCosto ? costoTotal : null)
    .input('ut', sql.Decimal(18, 2), utilidad)
    .input('mp', sql.Decimal(6, 2), margenPct)
    .input('sem', sql.NVarChar(12), semaforo)
    .query(`UPDATE CRM_COTIZACIONES SET COT_SUBTOTAL=@sub, COT_IVA=@iva, COT_TOTAL=@total,
              COT_COSTO_TOTAL=@ct, COT_UTILIDAD=@ut, COT_MARGEN_PCT=@mp, COT_SEMAFORO=@sem
            WHERE COT_ID=@id`)
  return { subtotal, iva, total, costoTotal: conCosto ? costoTotal : null, utilidad, margenPct, semaforo }
}

exports.listByOpo = async (req, res) => {
  try {
    const pool = await _getPool(req)
    const r = await pool.request()
      .input('opoId', sql.Int, req.params.opoId)
      .query(`SELECT COT_ID as id, COT_OPO_ID as opoId, COT_FOLIO as folio, COT_TITULO as titulo, COT_FECHA as fecha, COT_FECHA_VTO as fechaVto, COT_ESTATUS as estatus,
                     COT_TOTAL as total, COT_SUBTOTAL as subtotal, COT_IVA as iva,
                     COT_COSTO_TOTAL as costoTotal, COT_UTILIDAD as utilidad, COT_MARGEN_PCT as margenPct,
                     COT_SEMAFORO as semaforo, COT_APROB_OVERRIDE as aprobOverride, COT_FACTURA_ID as facturaId
              FROM CRM_COTIZACIONES WHERE COT_OPO_ID=@opoId AND COT_ACTIVO=1 ORDER BY COT_FECHA_REGISTRO DESC`)
    res.json({ success: true, data: r.recordset })
  } catch (e) {
    console.error('listByOpo:', e)
    res.status(500).json({ success: false, message: 'Error al obtener cotizaciones' })
  }
}

exports.getById = async (req, res) => {
  try {
    const pool = await _getPool(req)
    const cot = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT COT_ID as id, COT_OPO_ID as opoId, COT_FOLIO as folio, COT_TITULO as titulo, COT_FECHA as fecha, COT_FECHA_VTO as fechaVto, COT_ESTATUS as estatus, COT_NOTAS as notas,
                     COT_TOTAL as total, COT_SUBTOTAL as subtotal, COT_IVA as iva,
                     COT_COSTO_TOTAL as costoTotal, COT_UTILIDAD as utilidad, COT_MARGEN_PCT as margenPct,
                     COT_SEMAFORO as semaforo, COT_APROB_OVERRIDE as aprobOverride, COT_FACTURA_ID as facturaId
              FROM CRM_COTIZACIONES WHERE COT_ID=@id AND COT_ACTIVO=1`)
    if (!cot.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' })
    const items = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT COTI_ID as id, COTI_ES_SECCION as esSeccion, COTI_DESCRIPCION as descripcion, COTI_CANTIDAD as cantidad, COTI_PRECIO_UNIT as precioUnit, COTI_DESCUENTO as descuento, COTI_SUBTOTAL as subtotal,
                     COTI_COSTO_UNIT as costoUnit, COTI_PS_ID as psId, COTI_IVA_TASA as ivaTasa,
                     COTI_CLAVE_PROD_SERV as claveProdServ, COTI_CLAVE_UNIDAD as claveUnidad
              FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id ORDER BY COTI_ORDEN`)
    res.json({ success: true, data: { ...cot.recordset[0], items: items.recordset } })
  } catch (e) {
    console.error('getById:', e)
    res.status(500).json({ success: false, message: 'Error al obtener cotización' })
  }
}

// Inserta los renglones de una cotización dentro de la transacción y devuelve
// los acumulados (subtotal sin IVA, IVA, costo total, si hubo costo).
async function _insertItems(tx, cotId, items, cfg) {
  let subtotal = 0, iva = 0, costoTotal = 0, conCosto = false
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {}
    const esS = it.esSeccion ? 1 : 0
    const cant = esS ? 1 : (Number(it.cantidad) || 1)
    const precio = esS ? 0 : (Number(it.precioUnit) || 0)
    const dto = esS ? 0 : (Number(it.descuento) || 0)
    const base = esS ? 0 : cant * precio * (1 - dto / 100)
    const ivaTasa = esS ? 0 : (it.ivaTasa != null ? Number(it.ivaTasa) : cfg.tasaIvaDefault)
    const costoUnit = (!esS && it.costoUnit != null && it.costoUnit !== '') ? Number(it.costoUnit) : null
    subtotal += base
    iva += base * ivaTasa
    if (costoUnit != null) { conCosto = true; costoTotal += costoUnit * cant }
    await tx.request()
      .input('cotId', sql.Int, cotId).input('orden', sql.SmallInt, i)
      .input('esS', sql.Bit, esS).input('desc', sql.NVarChar(400), it.descripcion || '')
      .input('cant', sql.Decimal(10, 3), cant)
      .input('precio', sql.Decimal(18, 2), precio)
      .input('dto', sql.Decimal(5, 2), dto)
      .input('costo', sql.Decimal(18, 2), costoUnit)
      .input('psId', sql.Int, (!esS && it.psId) ? Number(it.psId) : null)
      .input('ivaTasa', sql.Decimal(5, 4), esS ? 0 : ivaTasa)
      .input('cps', sql.NVarChar(12), (!esS && it.claveProdServ) ? String(it.claveProdServ).slice(0, 12) : null)
      .input('cu', sql.NVarChar(6), (!esS && it.claveUnidad) ? String(it.claveUnidad).slice(0, 6) : null)
      // COTI_SUBTOTAL se omite a propósito: en algunos tenants es columna
      // calculada. Donde es columna normal queda NULL y getById lo recalcula.
      .query(`INSERT INTO CRM_COTIZACION_ITEMS
        (COTI_COT_ID,COTI_ORDEN,COTI_ES_SECCION,COTI_DESCRIPCION,COTI_CANTIDAD,COTI_PRECIO_UNIT,COTI_DESCUENTO,
         COTI_COSTO_UNIT,COTI_PS_ID,COTI_IVA_TASA,COTI_CLAVE_PROD_SERV,COTI_CLAVE_UNIDAD)
        VALUES (@cotId,@orden,@esS,@desc,@cant,@precio,@dto,@costo,@psId,@ivaTasa,@cps,@cu)`)
  }
  const total = subtotal + iva
  const utilidad = conCosto ? subtotal - costoTotal : null
  const margenPct = conCosto && subtotal > 0 ? (utilidad / subtotal) * 100 : null
  return { subtotal, iva, total, costoTotal: conCosto ? costoTotal : null, utilidad, margenPct }
}

exports.create = async (req, res) => {
  const pool = await _getPool(req)
  const cfg = await _cfgVentas(req)
  const tx = new sql.Transaction(pool)
  let began = false
  try {
    const { opoId, titulo, fechaVto, notas, items = [], overrideMargen = false } = req.body
    await tx.begin(); began = true
    const creadoPor = req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null
    const r = await tx.request()
      .input('opoId', sql.Int, opoId)
      .input('titulo', sql.NVarChar(200), titulo)
      .input('fechaVto', sql.Date, fechaVto || null)
      .input('notas', sql.NVarChar(sql.MAX), notas || null)
      .input('creadoPor', sql.Int, creadoPor)
      .query(`INSERT INTO CRM_COTIZACIONES(COT_OPO_ID,COT_FOLIO,COT_TITULO,COT_FECHA_VTO,COT_NOTAS,COT_CREADO_POR) OUTPUT INSERTED.COT_ID as id VALUES(@opoId,'',@titulo,@fechaVto,@notas,@creadoPor)`)
    const cotId = r.recordset[0].id
    const folio = _fmtFolio(cotId)

    const t = await _insertItems(tx, cotId, items, cfg)
    const semaforo = _calcSemaforo(t.margenPct, cfg)

    if (semaforo === 'ROJO' && cfg.requiereOverride && !(overrideMargen && await _puedeOverride(req))) {
      await tx.rollback()
      return res.status(400).json({
        success: false, code: 'MARGEN_BAJO',
        data: { margenPct: t.margenPct, semaforo },
        message: 'El margen de la cotización está por debajo del mínimo. Requiere autorización.',
      })
    }

    await tx.request()
      .input('id', sql.Int, cotId).input('folio', sql.NVarChar(20), folio)
      .input('sub', sql.Decimal(18, 2), t.subtotal).input('iva', sql.Decimal(18, 2), t.iva)
      .input('total', sql.Decimal(18, 2), t.total).input('ct', sql.Decimal(18, 2), t.costoTotal)
      .input('ut', sql.Decimal(18, 2), t.utilidad).input('mp', sql.Decimal(6, 2), t.margenPct)
      .input('sem', sql.NVarChar(12), semaforo)
      .input('ovr', sql.Bit, semaforo === 'ROJO' ? 1 : 0)
      .query(`UPDATE CRM_COTIZACIONES SET COT_FOLIO=@folio, COT_SUBTOTAL=@sub, COT_IVA=@iva, COT_TOTAL=@total,
                COT_COSTO_TOTAL=@ct, COT_UTILIDAD=@ut, COT_MARGEN_PCT=@mp, COT_SEMAFORO=@sem,
                COT_APROB_OVERRIDE = CASE WHEN @ovr=1 THEN 1 ELSE COT_APROB_OVERRIDE END
              WHERE COT_ID=@id`)
    await tx.commit()
    res.json({ success: true, data: { id: cotId, folio, semaforo, margenPct: t.margenPct } })
  } catch (e) {
    if (began) await tx.rollback().catch(() => {})
    console.error('create cotizacion:', e)
    res.status(500).json({ success: false, message: 'Error al crear cotización' })
  }
}

exports.update = async (req, res) => {
  const pool = await _getPool(req)
  const cfg = await _cfgVentas(req)
  const tx = new sql.Transaction(pool)
  let began = false
  try {
    const { id } = req.params
    const { titulo, fechaVto, notas, items = [], overrideMargen = false } = req.body
    await tx.begin(); began = true
    const check = await tx.request().input('id', sql.Int, id)
      .query(`SELECT COT_ESTATUS as estatus FROM CRM_COTIZACIONES WHERE COT_ID=@id AND COT_ACTIVO=1`)
    if (!check.recordset[0]) { await tx.rollback(); return res.status(404).json({ success: false, message: 'No encontrada' }) }
    if (check.recordset[0].estatus !== 'borrador') { await tx.rollback(); return res.status(400).json({ success: false, message: 'Solo se puede editar en estado borrador' }) }
    await tx.request().input('id', sql.Int, id).input('titulo', sql.NVarChar(200), titulo)
      .input('fechaVto', sql.Date, fechaVto || null).input('notas', sql.NVarChar(sql.MAX), notas || null)
      .query(`UPDATE CRM_COTIZACIONES SET COT_TITULO=ISNULL(@titulo,COT_TITULO),COT_FECHA_VTO=@fechaVto,COT_NOTAS=@notas WHERE COT_ID=@id`)
    await tx.request().input('id', sql.Int, id).query(`DELETE FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id`)

    const t = await _insertItems(tx, Number(id), items, cfg)
    const semaforo = _calcSemaforo(t.margenPct, cfg)

    if (semaforo === 'ROJO' && cfg.requiereOverride && !(overrideMargen && await _puedeOverride(req))) {
      await tx.rollback()
      return res.status(400).json({
        success: false, code: 'MARGEN_BAJO',
        data: { margenPct: t.margenPct, semaforo },
        message: 'El margen de la cotización está por debajo del mínimo. Requiere autorización.',
      })
    }

    await tx.request()
      .input('id', sql.Int, id)
      .input('sub', sql.Decimal(18, 2), t.subtotal).input('iva', sql.Decimal(18, 2), t.iva)
      .input('total', sql.Decimal(18, 2), t.total).input('ct', sql.Decimal(18, 2), t.costoTotal)
      .input('ut', sql.Decimal(18, 2), t.utilidad).input('mp', sql.Decimal(6, 2), t.margenPct)
      .input('sem', sql.NVarChar(12), semaforo)
      .input('ovr', sql.Bit, semaforo === 'ROJO' ? 1 : 0)
      .query(`UPDATE CRM_COTIZACIONES SET COT_SUBTOTAL=@sub, COT_IVA=@iva, COT_TOTAL=@total,
                COT_COSTO_TOTAL=@ct, COT_UTILIDAD=@ut, COT_MARGEN_PCT=@mp, COT_SEMAFORO=@sem,
                COT_APROB_OVERRIDE = CASE WHEN @ovr=1 THEN 1 ELSE COT_APROB_OVERRIDE END
              WHERE COT_ID=@id`)
    await tx.commit()
    res.json({ success: true, data: { semaforo, margenPct: t.margenPct } })
  } catch (e) {
    if (began) await tx.rollback().catch(() => {})
    console.error('update cotizacion:', e)
    res.status(500).json({ success: false, message: 'Error al actualizar cotización' })
  }
}

exports.softDelete = async (req, res) => {
  try {
    const pool = await _getPool(req)
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE CRM_COTIZACIONES SET COT_ACTIVO=0 WHERE COT_ID=@id`)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al eliminar' })
  }
}

exports.enviar = async (req, res) => {
  try {
    const pool = await _getPool(req)
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE CRM_COTIZACIONES SET COT_ESTATUS='enviada' WHERE COT_ID=@id AND COT_ACTIVO=1`)
    // Registrar interacción
    const cot = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT COT_OPO_ID as opoId, COT_FOLIO as folio FROM CRM_COTIZACIONES WHERE COT_ID=@id`)
    if (cot.recordset[0]) {
      await pool.request()
        .input('opoId', sql.Int, cot.recordset[0].opoId)
        .input('desc', sql.NVarChar(500), `Cotización ${cot.recordset[0].folio} enviada`)
        .query(`INSERT INTO CRM_INTERACCIONES(INT_OPO_ID,INT_TIPO,INT_CONTENIDO) VALUES(@opoId,'email',@desc)`)
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al enviar' })
  }
}

// Aprobación interna (por un gerente/supervisor), a diferencia de `aprobar` que
// exige portalToken porque la dispara el cliente desde el portal público.
exports.aprobarInterna = async (req, res) => {
  try {
    const pool = await _getPool(req)
    const { id } = req.params
    const { overrideMargen = false } = req.body || {}
    const row = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COT_ESTATUS estatus, COT_SEMAFORO semaforo, COT_OPO_ID opoId, COT_FOLIO folio
              FROM CRM_COTIZACIONES WHERE COT_ID=@id AND COT_ACTIVO=1`)
    const c = row.recordset[0]
    if (!c) return res.status(404).json({ success: false, message: 'No encontrada' })
    if (!['borrador', 'enviada'].includes(c.estatus)) {
      return res.status(400).json({ success: false, message: `No se puede aprobar una cotización en estado ${c.estatus}` })
    }
    const cfg = await _cfgVentas(req)
    if (c.semaforo === 'ROJO' && cfg.requiereOverride && !(overrideMargen && await _puedeOverride(req))) {
      return res.status(400).json({
        success: false, code: 'MARGEN_BAJO',
        message: 'El margen está por debajo del mínimo. Se requiere autorización para aprobar.',
      })
    }
    const uid = req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null
    await pool.request().input('id', sql.Int, id).input('uid', sql.Int, uid)
      .input('ovr', sql.Bit, c.semaforo === 'ROJO' ? 1 : 0)
      .query(`UPDATE CRM_COTIZACIONES
              SET COT_ESTATUS='aprobada', COT_APROB_POR=@uid, COT_APROB_FECHA=GETDATE(),
                  COT_APROB_OVERRIDE = CASE WHEN @ovr=1 THEN 1 ELSE COT_APROB_OVERRIDE END
              WHERE COT_ID=@id AND COT_ACTIVO=1`)
    await pool.request()
      .input('opoId', sql.Int, c.opoId)
      .input('desc', sql.NVarChar(500), `Cotización ${c.folio} aprobada internamente`)
      .query(`INSERT INTO CRM_INTERACCIONES(INT_OPO_ID,INT_TIPO,INT_CONTENIDO) VALUES(@opoId,'nota',@desc)`)
      .catch(() => {})
    res.json({ success: true })
  } catch (e) {
    console.error('aprobarInterna:', e)
    res.status(500).json({ success: false, message: 'Error al aprobar la cotización' })
  }
}

async function _cambiarEstatus(id, nuevoEstatus, portalToken, pool) {
  // portalToken es obligatorio: sin él, cualquiera podría cambiar el estatus
  // de cualquier cotización llamando el endpoint directo sin pasar por el
  // portal público (que sí lo adjunta siempre).
  if (!portalToken) throw new Error('Token inválido')
  const tok = await pool.request()
    .input('tok', sql.NVarChar(200), portalToken)
    .query(`SELECT PT_ID FROM CRM_PORTAL_TOKENS WHERE PT_TOKEN=@tok AND PT_ACTIVO=1`)
  if (!tok.recordset[0]) throw new Error('Token inválido')
  await pool.request().input('id', sql.Int, id).input('estatus', sql.NVarChar(20), nuevoEstatus)
    .query(`UPDATE CRM_COTIZACIONES SET COT_ESTATUS=@estatus WHERE COT_ID=@id AND COT_ACTIVO=1`)
  const cot = await pool.request().input('id', sql.Int, id)
    .query(`SELECT COT_OPO_ID as opoId, COT_FOLIO as folio FROM CRM_COTIZACIONES WHERE COT_ID=@id`)
  if (cot.recordset[0]) {
    await pool.request()
      .input('opoId', sql.Int, cot.recordset[0].opoId)
      .input('desc', sql.NVarChar(500), `Cotización ${cot.recordset[0].folio} ${nuevoEstatus}`)
      .query(`INSERT INTO CRM_INTERACCIONES(INT_OPO_ID,INT_TIPO,INT_CONTENIDO) VALUES(@opoId,'nota',@desc)`)
  }
}

exports.aprobar = async (req, res) => {
  try {
    const pool = await _getPool(req)
    await _cambiarEstatus(req.params.id, 'aprobada', req.body?.portalToken, pool)
    res.json({ success: true })
  } catch (e) {
    if (e.message === 'Token inválido') return res.status(403).json({ success: false, message: 'Token inválido' })
    res.status(500).json({ success: false, message: 'Error al aprobar' })
  }
}

exports.rechazar = async (req, res) => {
  try {
    const pool = await _getPool(req)
    await _cambiarEstatus(req.params.id, 'rechazada', req.body?.portalToken, pool)
    res.json({ success: true })
  } catch (e) {
    if (e.message === 'Token inválido') return res.status(403).json({ success: false, message: 'Token inválido' })
    res.status(500).json({ success: false, message: 'Error al rechazar' })
  }
}

exports.getPdf = async (req, res) => {
  try {
    const pool = await _getPool(req)
    const cot = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT c.COT_ID as id, c.COT_FOLIO as folio, c.COT_TITULO as titulo, c.COT_FECHA as fecha, c.COT_FECHA_VTO as fechaVto, c.COT_NOTAS as notas, c.COT_TOTAL as total, c.COT_SUBTOTAL as subtotal, c.COT_IVA as iva, o.OPO_NOMBRE as opoNombre, ct.CONT_NOMBRE as contacto, ct.CONT_EMPRESA as empresa FROM CRM_COTIZACIONES c LEFT JOIN CRM_OPORTUNIDADES o ON o.OPO_ID=c.COT_OPO_ID LEFT JOIN CRM_CONTACTOS ct ON ct.CONT_ID=o.OPO_CONTACTO_ID WHERE c.COT_ID=@id AND c.COT_ACTIVO=1`)
    if (!cot.recordset[0]) return res.status(404).send('No encontrada')
    const items = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT COTI_ES_SECCION as esSeccion, COTI_DESCRIPCION as descripcion, COTI_CANTIDAD as cantidad, COTI_PRECIO_UNIT as precioUnit, COTI_DESCUENTO as descuento, COTI_SUBTOTAL as subtotal FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id ORDER BY COTI_ORDEN`)
    const d = cot.recordset[0]
    const fmt = (n) => '$' + Number(n||0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtDate = (s) => s ? new Date(s).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' }) : '—'
    const itemsHtml = items.recordset.map(it => {
      if (it.esSeccion) return `<tr style="background:#f5f5f5"><td colspan="5" style="padding:8px 12px;font-weight:700;font-size:13px">${it.descripcion}</td></tr>`
      return `<tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 12px">${it.descripcion}</td>
        <td style="padding:8px 12px;text-align:right">${Number(it.cantidad)}</td>
        <td style="padding:8px 12px;text-align:right">${fmt(it.precioUnit)}</td>
        <td style="padding:8px 12px;text-align:right">${Number(it.descuento||0)}%</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600">${fmt(it.subtotal)}</td>
      </tr>`
    }).join('')
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${d.folio}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#222;font-size:14px;padding:32px}
    @media print{@page{margin:1.5cm}}table{width:100%;border-collapse:collapse}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
      <div><h1 style="font-size:28px;font-weight:800;color:#1B4FD8">${d.folio}</h1><p style="color:#666;margin-top:4px">Cotización</p></div>
      <div style="text-align:right"><p style="font-weight:700;font-size:16px">Ardabytec</p><p style="color:#666;font-size:12px">Fecha: ${fmtDate(d.fecha)}</p>${d.fechaVto ? `<p style="color:#e65;font-size:12px">Válida hasta: ${fmtDate(d.fechaVto)}</p>` : ''}</div>
    </div>
    <div style="background:#f8f9ff;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="font-weight:700;font-size:15px">${d.opoNombre || d.titulo}</p>
      ${d.contacto ? `<p style="color:#555;margin-top:2px">${d.contacto}${d.empresa ? ' · ' + d.empresa : ''}</p>` : ''}
    </div>
    <h3 style="margin-bottom:12px;font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#666">${d.titulo}</h3>
    <table style="margin-bottom:24px">
      <thead><tr style="background:#1B4FD8;color:#fff">
        <th style="padding:10px 12px;text-align:left">Descripción</th>
        <th style="padding:10px 12px;text-align:right">Cant.</th>
        <th style="padding:10px 12px;text-align:right">Precio unit.</th>
        <th style="padding:10px 12px;text-align:right">Dto.</th>
        <th style="padding:10px 12px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:24px">
      <div style="min-width:260px">
        ${d.subtotal != null ? `<div style="display:flex;justify-content:space-between;gap:32px;padding:4px 24px;color:#555">
          <span>Subtotal</span><span>${fmt(d.subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:32px;padding:4px 24px;color:#555">
          <span>IVA</span><span>${fmt(d.iva)}</span>
        </div>` : ''}
        <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:8px;padding:16px 24px;margin-top:6px">
          <div style="display:flex;justify-content:space-between;gap:32px">
            <span style="font-weight:700;font-size:16px">TOTAL</span>
            <span style="font-weight:800;font-size:20px;color:#16a34a">${fmt(d.total)}</span>
          </div>
        </div>
      </div>
    </div>
    ${d.notas ? `<div style="border-top:1px solid #eee;padding-top:16px"><p style="font-weight:600;margin-bottom:4px">Notas</p><p style="color:#555;font-size:13px">${d.notas}</p></div>` : ''}
    <div style="margin-top:40px;border-top:1px solid #eee;padding-top:12px;text-align:center;color:#999;font-size:11px">Cotización generada por sistema Ardabytec · ${d.folio}</div>
    </body></html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) {
    console.error('getPdf:', e)
    res.status(500).send('Error al generar PDF')
  }
}
