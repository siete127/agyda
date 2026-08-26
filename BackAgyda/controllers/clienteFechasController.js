const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

const TIPOS_VALIDOS = ['contrato', 'servicio', 'mantenimiento', 'cumpleanos', 'personalizada'];
const ESTATUS_VALIDOS = ['vigente', 'renovada', 'vencida', 'cancelada'];
const DIAS_ALERTA_DEFAULT = '30,15,7';

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

function normalizarDiasAlerta(diasAlerta) {
  if (!diasAlerta) return DIAS_ALERTA_DEFAULT;
  const dias = String(diasAlerta).split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => Number.isInteger(d) && d > 0);
  return dias.length ? dias.join(',') : DIAS_ALERTA_DEFAULT;
}

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT FEC_ID as id, FEC_CONTACTO_ID as contactoId, FEC_TIPO as tipo, FEC_DESCRIPCION as descripcion,
               CONVERT(NVARCHAR(10), FEC_FECHA, 23) as fecha, FEC_RECURRENTE_ANUAL as recurrenteAnual,
               FEC_DIAS_ALERTA as diasAlerta, FEC_ESTATUS as estatus, FEC_CREADO_POR as creadoPor,
               FEC_FECHA_CREACION as fechaCreacion
        FROM CLI_FECHAS_IMPORTANTES
        WHERE FEC_CONTACTO_ID = @id AND FEC_ACTIVO = 1
        ORDER BY FEC_FECHA ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listByContacto fechas importantes:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const { tipo, descripcion, fecha, recurrenteAnual, diasAlerta } = req.body || {};
    if (!descripcion || !String(descripcion).trim()) return res.status(400).json({ success: false, message: 'Descripción requerida' });
    if (!fecha) return res.status(400).json({ success: false, message: 'Fecha requerida' });
    const tip = TIPOS_VALIDOS.includes(tipo) ? tipo : 'personalizada';

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .input('tipo', sql.NVarChar(30), tip)
      .input('descripcion', sql.NVarChar(200), String(descripcion).trim())
      .input('fecha', sql.Date, fecha)
      .input('recurrenteAnual', sql.Bit, !!recurrenteAnual)
      .input('diasAlerta', sql.NVarChar(50), normalizarDiasAlerta(diasAlerta))
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CLI_FECHAS_IMPORTANTES (FEC_CONTACTO_ID, FEC_TIPO, FEC_DESCRIPCION, FEC_FECHA, FEC_RECURRENTE_ANUAL, FEC_DIAS_ALERTA, FEC_CREADO_POR)
        OUTPUT INSERTED.FEC_ID
        VALUES (@contactoId, @tipo, @descripcion, @fecha, @recurrenteAnual, @diasAlerta, @creadoPor)
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-fecha-importante', entidadId: ins.recordset[0].FEC_ID,
      detalle: { contactoId, tipo: tip, fecha }, ip: req.ip,
    });

    res.status(201).json({ success: true, data: { id: ins.recordset[0].FEC_ID } });
  } catch (e) {
    console.error('Error create fecha importante:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const { tipo, descripcion, fecha, recurrenteAnual, diasAlerta, estatus } = req.body || {};
    if (!descripcion || !String(descripcion).trim()) return res.status(400).json({ success: false, message: 'Descripción requerida' });
    if (!fecha) return res.status(400).json({ success: false, message: 'Fecha requerida' });
    const tip = TIPOS_VALIDOS.includes(tipo) ? tipo : 'personalizada';
    const est = ESTATUS_VALIDOS.includes(estatus) ? estatus : 'vigente';

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('tipo', sql.NVarChar(30), tip)
      .input('descripcion', sql.NVarChar(200), String(descripcion).trim())
      .input('fecha', sql.Date, fecha)
      .input('recurrenteAnual', sql.Bit, !!recurrenteAnual)
      .input('diasAlerta', sql.NVarChar(50), normalizarDiasAlerta(diasAlerta))
      .input('estatus', sql.NVarChar(20), est)
      .query(`
        UPDATE CLI_FECHAS_IMPORTANTES SET
          FEC_TIPO=@tipo, FEC_DESCRIPCION=@descripcion, FEC_FECHA=@fecha,
          FEC_RECURRENTE_ANUAL=@recurrenteAnual, FEC_DIAS_ALERTA=@diasAlerta, FEC_ESTATUS=@estatus
        WHERE FEC_ID=@id AND FEC_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Fecha importante no encontrada' });

    res.json({ success: true });
  } catch (e) {
    console.error('Error update fecha importante:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE CLI_FECHAS_IMPORTANTES SET FEC_ACTIVO=0 WHERE FEC_ID=@id AND FEC_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Fecha importante no encontrada' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'eliminar-fecha-importante', entidadId: id, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error delete fecha importante:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
