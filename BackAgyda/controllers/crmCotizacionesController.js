const sql = require('mssql')
const databaseService = require('../services/databaseService')

async function _getPool(req) { return databaseService.getPool(req?.user?.empresa) }

function _fmtFolio(id) {
  return 'COT-' + String(id).padStart(4, '0')
}

exports.listByOpo = async (req, res) => {
  try {
    const pool = await _getPool(req)
    const r = await pool.request()
      .input('opoId', sql.Int, req.params.opoId)
      .query(`SELECT COT_ID as id, COT_OPO_ID as opoId, COT_FOLIO as folio, COT_TITULO as titulo, COT_FECHA as fecha, COT_FECHA_VTO as fechaVto, COT_ESTATUS as estatus, COT_TOTAL as total FROM CRM_COTIZACIONES WHERE COT_OPO_ID=@opoId AND COT_ACTIVO=1 ORDER BY COT_FECHA_REGISTRO DESC`)
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
      .query(`SELECT COT_ID as id, COT_OPO_ID as opoId, COT_FOLIO as folio, COT_TITULO as titulo, COT_FECHA as fecha, COT_FECHA_VTO as fechaVto, COT_ESTATUS as estatus, COT_NOTAS as notas, COT_TOTAL as total FROM CRM_COTIZACIONES WHERE COT_ID=@id AND COT_ACTIVO=1`)
    if (!cot.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' })
    const items = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT COTI_ID as id, COTI_ES_SECCION as esSeccion, COTI_DESCRIPCION as descripcion, COTI_CANTIDAD as cantidad, COTI_PRECIO_UNIT as precioUnit, COTI_DESCUENTO as descuento, COTI_SUBTOTAL as subtotal FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id ORDER BY COTI_ORDEN`)
    res.json({ success: true, data: { ...cot.recordset[0], items: items.recordset } })
  } catch (e) {
    console.error('getById:', e)
    res.status(500).json({ success: false, message: 'Error al obtener cotización' })
  }
}

exports.create = async (req, res) => {
  const pool = await _getPool(req)
  const tx = new sql.Transaction(pool)
  try {
    await tx.begin()
    const { opoId, titulo, fechaVto, notas, items = [] } = req.body
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
    await tx.request().input('folio', sql.NVarChar(20), folio).input('id', sql.Int, cotId)
      .query(`UPDATE CRM_COTIZACIONES SET COT_FOLIO=@folio WHERE COT_ID=@id`)
    let total = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const esS = it.esSeccion ? 1 : 0
      const sub = esS ? 0 : (Number(it.cantidad)||1) * (Number(it.precioUnit)||0) * (1 - (Number(it.descuento)||0)/100)
      total += sub
      await tx.request()
        .input('cotId', sql.Int, cotId).input('orden', sql.SmallInt, i)
        .input('esS', sql.Bit, esS).input('desc', sql.NVarChar(400), it.descripcion || '')
        .input('cant', sql.Decimal(10,3), esS ? 1 : (Number(it.cantidad)||1))
        .input('precio', sql.Decimal(18,2), esS ? 0 : (Number(it.precioUnit)||0))
        .input('dto', sql.Decimal(5,2), esS ? 0 : (Number(it.descuento)||0))
        .query(`INSERT INTO CRM_COTIZACION_ITEMS(COTI_COT_ID,COTI_ORDEN,COTI_ES_SECCION,COTI_DESCRIPCION,COTI_CANTIDAD,COTI_PRECIO_UNIT,COTI_DESCUENTO) VALUES(@cotId,@orden,@esS,@desc,@cant,@precio,@dto)`)
    }
    await tx.request().input('total', sql.Decimal(18,2), total).input('id', sql.Int, cotId)
      .query(`UPDATE CRM_COTIZACIONES SET COT_TOTAL=@total WHERE COT_ID=@id`)
    await tx.commit()
    res.json({ success: true, data: { id: cotId, folio } })
  } catch (e) {
    await tx.rollback().catch(() => {})
    console.error('create cotizacion:', e)
    res.status(500).json({ success: false, message: 'Error al crear cotización' })
  }
}

exports.update = async (req, res) => {
  const pool = await _getPool(req)
  const tx = new sql.Transaction(pool)
  try {
    await tx.begin()
    const { id } = req.params
    const check = await tx.request().input('id', sql.Int, id)
      .query(`SELECT COT_ESTATUS as estatus FROM CRM_COTIZACIONES WHERE COT_ID=@id AND COT_ACTIVO=1`)
    if (!check.recordset[0]) { await tx.rollback(); return res.status(404).json({ success: false, message: 'No encontrada' }) }
    if (check.recordset[0].estatus !== 'borrador') { await tx.rollback(); return res.status(400).json({ success: false, message: 'Solo se puede editar en estado borrador' }) }
    const { titulo, fechaVto, notas, items = [] } = req.body
    await tx.request().input('id', sql.Int, id).input('titulo', sql.NVarChar(200), titulo)
      .input('fechaVto', sql.Date, fechaVto || null).input('notas', sql.NVarChar(sql.MAX), notas || null)
      .query(`UPDATE CRM_COTIZACIONES SET COT_TITULO=ISNULL(@titulo,COT_TITULO),COT_FECHA_VTO=@fechaVto,COT_NOTAS=@notas WHERE COT_ID=@id`)
    await tx.request().input('id', sql.Int, id).query(`DELETE FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID=@id`)
    let total = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const esS = it.esSeccion ? 1 : 0
      const sub = esS ? 0 : (Number(it.cantidad)||1) * (Number(it.precioUnit)||0) * (1 - (Number(it.descuento)||0)/100)
      total += sub
      await tx.request()
        .input('cotId', sql.Int, id).input('orden', sql.SmallInt, i)
        .input('esS', sql.Bit, esS).input('desc', sql.NVarChar(400), it.descripcion || '')
        .input('cant', sql.Decimal(10,3), esS ? 1 : (Number(it.cantidad)||1))
        .input('precio', sql.Decimal(18,2), esS ? 0 : (Number(it.precioUnit)||0))
        .input('dto', sql.Decimal(5,2), esS ? 0 : (Number(it.descuento)||0))
        .query(`INSERT INTO CRM_COTIZACION_ITEMS(COTI_COT_ID,COTI_ORDEN,COTI_ES_SECCION,COTI_DESCRIPCION,COTI_CANTIDAD,COTI_PRECIO_UNIT,COTI_DESCUENTO) VALUES(@cotId,@orden,@esS,@desc,@cant,@precio,@dto)`)
    }
    await tx.request().input('total', sql.Decimal(18,2), total).input('id', sql.Int, id)
      .query(`UPDATE CRM_COTIZACIONES SET COT_TOTAL=@total WHERE COT_ID=@id`)
    await tx.commit()
    res.json({ success: true })
  } catch (e) {
    await tx.rollback().catch(() => {})
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
      .query(`SELECT c.COT_ID as id, c.COT_FOLIO as folio, c.COT_TITULO as titulo, c.COT_FECHA as fecha, c.COT_FECHA_VTO as fechaVto, c.COT_NOTAS as notas, c.COT_TOTAL as total, o.OPO_NOMBRE as opoNombre, ct.CONT_NOMBRE as contacto, ct.CONT_EMPRESA as empresa FROM CRM_COTIZACIONES c LEFT JOIN CRM_OPORTUNIDADES o ON o.OPO_ID=c.COT_OPO_ID LEFT JOIN CRM_CONTACTOS ct ON ct.CONT_ID=o.OPO_CONTACTO_ID WHERE c.COT_ID=@id AND c.COT_ACTIVO=1`)
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
      <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:8px;padding:16px 24px;min-width:220px">
        <div style="display:flex;justify-content:space-between;gap:32px">
          <span style="font-weight:700;font-size:16px">TOTAL</span>
          <span style="font-weight:800;font-size:20px;color:#16a34a">${fmt(d.total)}</span>
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
