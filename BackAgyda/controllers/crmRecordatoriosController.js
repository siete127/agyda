const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');

const METODOS_PAGO_VALIDOS = ['transferencia', 'efectivo', 'tarjeta', 'cheque', 'otro'];

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// El flujo pedido usa 5 estatus visuales (pagado/próximo a vencer/vence hoy/
// vencido/pago parcial), pero "próximo a vencer"/"vence hoy"/"vencido" son
// derivados de la fecha, no un estado que se persista aparte — se calculan
// aquí a partir de REC_ESTATUS (workflow real: pendiente/enviado/pagado/
// parcial/cancelado) + REC_FECHA_LIMITE, para que nunca queden desincronizados
// del tiempo real como pasaría si fueran columnas guardadas.
function calcularEstatusVisual(estatus, fechaLimite) {
  if (estatus === 'pagado' || estatus === 'cancelado' || estatus === 'parcial') return estatus;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(`${fechaLimite}T00:00:00`);
  const dias = Math.round((limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'vence_hoy';
  return 'proximo_vencer';
}

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.query.contactoId, 10);
    if (!Number.isFinite(contactoId)) {
      return res.status(400).json({ success: false, message: 'contactoId requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .query(`
        SELECT REC_ID as id, REC_CONTACTO_ID as contactoId, REC_OPO_ID as opoId,
               REC_CONCEPTO as concepto, REC_MONTO as monto,
               CONVERT(NVARCHAR(10), REC_FECHA_LIMITE, 23) as fechaLimite,
               REC_ESTATUS as estatus, REC_NOTAS as notas,
               REC_CREADO_POR as creadoPor, REC_FECHA_CREACION as fechaCreacion,
               REC_FECHA_ENVIO as fechaEnvio, REC_FECHA_PAGO as fechaPago,
               REC_METODO_PAGO as metodoPago, REC_COMPROBANTE_DOC_ID as comprobanteDocId,
               REC_CONFIRMADO_POR as confirmadoPor, REC_MONTO_PAGADO as montoPagado
        FROM CRM_RECORDATORIOS_PAGO
        WHERE REC_CONTACTO_ID = @contactoId AND REC_ACTIVO = 1
        ORDER BY REC_FECHA_LIMITE DESC
      `);
    const data = result.recordset.map((r) => ({ ...r, estatusVisual: calcularEstatusVisual(r.estatus, r.fechaLimite) }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error listByContacto recordatorios:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { contactoId, opoId, concepto, monto, fechaLimite, notas } = req.body;
    const contId = parseInt(contactoId, 10);
    if (!Number.isFinite(contId)) return res.status(400).json({ success: false, message: 'contactoId requerido' });
    if (!concepto || !String(concepto).trim()) return res.status(400).json({ success: false, message: 'Concepto requerido' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ success: false, message: 'Monto inválido' });
    if (!fechaLimite) return res.status(400).json({ success: false, message: 'Fecha límite requerida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('contactoId', sql.Int, contId)
      .input('opoId', sql.Int, opoId ? parseInt(opoId, 10) : null)
      .input('concepto', sql.NVarChar(200), String(concepto).trim())
      .input('monto', sql.Decimal(18, 2), montoNum)
      .input('fechaLimite', sql.Date, fechaLimite)
      .input('notas', sql.NVarChar(500), notas || null)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CRM_RECORDATORIOS_PAGO
          (REC_CONTACTO_ID, REC_OPO_ID, REC_CONCEPTO, REC_MONTO, REC_FECHA_LIMITE, REC_NOTAS, REC_CREADO_POR)
        OUTPUT INSERTED.REC_ID
        VALUES (@contactoId, @opoId, @concepto, @monto, @fechaLimite, @notas, @creadoPor)
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'crm', accion: 'crear-recordatorio-pago',
      entidadId: ins.recordset[0].REC_ID, detalle: { contactoId: contId, concepto, monto: montoNum, fechaLimite }, ip: req.ip
    });

    res.json({ success: true, data: { id: ins.recordset[0].REC_ID } });
  } catch (e) {
    console.error('Error create recordatorio:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE CRM_RECORDATORIOS_PAGO SET REC_ESTATUS = 'cancelado'
        WHERE REC_ID = @id AND REC_ACTIVO = 1 AND REC_ESTATUS = 'pendiente';
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(409).json({ success: false, message: 'Solo se pueden cancelar recordatorios pendientes' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'crm', accion: 'cancelar-recordatorio-pago', entidadId: id, detalle: null, ip: req.ip
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error cancel recordatorio:', e);
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
        UPDATE CRM_RECORDATORIOS_PAGO SET REC_ACTIVO = 0
        WHERE REC_ID = @id AND REC_ACTIVO = 1;
        SELECT @@ROWCOUNT as affected;
      `);
    const affected = result.recordset?.[0]?.affected || 0;
    if (!affected) return res.status(404).json({ success: false, message: 'Recordatorio no encontrado' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'crm', accion: 'eliminar-recordatorio-pago', entidadId: id, detalle: null, ip: req.ip
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error delete recordatorio:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Fase 3: confirmación de pago con comprobante (opcional, subido antes vía el
// endpoint genérico de documentos de cliente con categoria='comprobante_pago').
exports.confirmarPago = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const { metodoPago, comprobanteDocId, fechaPago, montoPagado } = req.body || {};
    const metodo = METODOS_PAGO_VALIDOS.includes(metodoPago) ? metodoPago : null;
    const compDocId = comprobanteDocId ? parseInt(comprobanteDocId, 10) : null;

    const pool = await databaseService.getPool(req.user?.empresa);

    if (compDocId) {
      const doc = await pool.request()
        .input('id', sql.Int, compDocId)
        .query(`SELECT TOP 1 DOC_ID FROM CRM_DOCUMENTOS_CLIENTE WHERE DOC_ID=@id AND DOC_ACTIVO=1`);
      if (!doc.recordset.length) return res.status(400).json({ success: false, message: 'Comprobante no encontrado' });
    }

    // Pago parcial: si el monto pagado es menor al monto del recordatorio, el
    // estatus queda en 'parcial' en vez de 'pagado' (punto 5 del flujo: 🔵 Pago parcial).
    const recordatorio = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT REC_MONTO as monto FROM CRM_RECORDATORIOS_PAGO WHERE REC_ID=@id AND REC_ACTIVO=1`);
    if (!recordatorio.recordset.length) return res.status(404).json({ success: false, message: 'Recordatorio no encontrado' });
    const montoTotal = Number(recordatorio.recordset[0].monto);
    const montoPagadoNum = montoPagado !== undefined && montoPagado !== null ? Number(montoPagado) : montoTotal;
    const esParcial = montoPagadoNum > 0 && montoPagadoNum < montoTotal;
    const nuevoEstatus = esParcial ? 'parcial' : 'pagado';

    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar(20), nuevoEstatus)
      .input('metodoPago', sql.NVarChar(50), metodo)
      .input('comprobanteDocId', sql.Int, compDocId)
      .input('fechaPago', sql.DateTime, fechaPago ? new Date(fechaPago) : new Date())
      .input('montoPagado', sql.Decimal(18, 2), montoPagadoNum)
      .input('confirmadoPor', sql.Int, getUserId(req))
      .query(`
        UPDATE CRM_RECORDATORIOS_PAGO SET
          REC_ESTATUS=@estatus, REC_METODO_PAGO=@metodoPago, REC_COMPROBANTE_DOC_ID=@comprobanteDocId,
          REC_FECHA_PAGO=@fechaPago, REC_MONTO_PAGADO=@montoPagado, REC_CONFIRMADO_POR=@confirmadoPor
        WHERE REC_ID=@id AND REC_ACTIVO=1 AND REC_ESTATUS IN ('pendiente','enviado','parcial');
        SELECT @@ROWCOUNT as affected, (SELECT REC_CONTACTO_ID FROM CRM_RECORDATORIOS_PAGO WHERE REC_ID=@id) as contactoId,
               (SELECT REC_CONCEPTO FROM CRM_RECORDATORIOS_PAGO WHERE REC_ID=@id) as concepto,
               (SELECT REC_CREADO_POR FROM CRM_RECORDATORIOS_PAGO WHERE REC_ID=@id) as creadoPor;
      `);
    const row = result.recordset?.[0];
    if (!row?.affected) return res.status(409).json({ success: false, message: 'Solo se pueden confirmar recordatorios pendientes, enviados o con pago parcial' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'confirmar-pago-cliente', entidadId: id,
      detalle: { metodoPago: metodo, comprobanteDocId: compDocId, montoPagado: montoPagadoNum, estatus: nuevoEstatus }, ip: req.ip,
    });

    if (row.creadoPor) {
      await notificationService.createNotification({
        usuarioId: row.creadoPor,
        mensaje: `Pago confirmado: ${row.concepto}`,
        tipo: 'cliente-pago-confirmado',
        dataExtra: { recordatorioId: id, contactoId: row.contactoId },
        tenantKey: req.user?.empresa,
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error confirmarPago recordatorio:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
