const sql = require('mssql')
const databaseService = require('../services/databaseService')

const ETAPAS_VALIDAS = ['prospecto','contactado','propuesta','negociacion','ganado','perdido']
const TIPOS_VALIDOS = ['llamada','email','reunion','nota','tarea']

exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request().query(`SELECT AUTO_ID as id, AUTO_ETAPA_TRIGGER as etapaTrigger, AUTO_TIPO_ACTIVIDAD as tipoActividad, AUTO_DESCRIPCION as descripcion, AUTO_DIAS_OFFSET as diasOffset, AUTO_ACTIVO as activo, AUTO_FECHA as fecha FROM CRM_AUTOMATIZACIONES ORDER BY AUTO_ETAPA_TRIGGER, AUTO_ID`)
    res.json({ success: true, data: r.recordset })
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al obtener reglas' })
  }
}

exports.create = async (req, res) => {
  try {
    const { etapaTrigger, tipoActividad, descripcion, diasOffset } = req.body
    if (!ETAPAS_VALIDAS.includes(etapaTrigger)) return res.status(400).json({ success: false, message: 'Etapa inválida' })
    if (!TIPOS_VALIDOS.includes(tipoActividad)) return res.status(400).json({ success: false, message: 'Tipo inválido' })
    if (!descripcion?.trim()) return res.status(400).json({ success: false, message: 'Descripción requerida' })
    const pool = await databaseService.getPool(req.user?.empresa)
    const r = await pool.request()
      .input('etapa', sql.NVarChar(20), etapaTrigger)
      .input('tipo', sql.NVarChar(20), tipoActividad || 'tarea')
      .input('desc', sql.NVarChar(200), descripcion.trim())
      .input('dias', sql.SmallInt, Number(diasOffset) || 1)
      .query(`INSERT INTO CRM_AUTOMATIZACIONES(AUTO_ETAPA_TRIGGER,AUTO_TIPO_ACTIVIDAD,AUTO_DESCRIPCION,AUTO_DIAS_OFFSET) OUTPUT INSERTED.AUTO_ID as id VALUES(@etapa,@tipo,@desc,@dias)`)
    res.json({ success: true, data: { id: r.recordset[0].id } })
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al crear regla' })
  }
}

exports.update = async (req, res) => {
  try {
    const { id } = req.params
    const { etapaTrigger, tipoActividad, descripcion, diasOffset, activo } = req.body
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request()
      .input('id', sql.Int, id)
      .input('etapa', sql.NVarChar(20), etapaTrigger ?? null)
      .input('tipo', sql.NVarChar(20), tipoActividad ?? null)
      .input('desc', sql.NVarChar(200), descripcion ?? null)
      .input('dias', sql.SmallInt, diasOffset !== undefined ? Number(diasOffset) : null)
      .input('activo', sql.Bit, activo === undefined ? null : (activo ? 1 : 0))
      .query(`UPDATE CRM_AUTOMATIZACIONES SET
        AUTO_ETAPA_TRIGGER = ISNULL(@etapa, AUTO_ETAPA_TRIGGER),
        AUTO_TIPO_ACTIVIDAD = ISNULL(@tipo, AUTO_TIPO_ACTIVIDAD),
        AUTO_DESCRIPCION = ISNULL(@desc, AUTO_DESCRIPCION),
        AUTO_DIAS_OFFSET = ISNULL(@dias, AUTO_DIAS_OFFSET),
        AUTO_ACTIVO = ISNULL(@activo, AUTO_ACTIVO)
        WHERE AUTO_ID = @id`)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al actualizar regla' })
  }
}

exports.delete = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa)
    await pool.request().input('id', sql.Int, req.params.id).query(`DELETE FROM CRM_AUTOMATIZACIONES WHERE AUTO_ID = @id`)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al eliminar regla' })
  }
}
