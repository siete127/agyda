const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { upsertKpi } = require('./areasController');
const logger = global.logger || require('../utils/logger');

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const ingresosRs = await pool.request()
      .query(`
        SELECT ISNULL(SUM(FI_MONTO), 0) as ingresosMes
        FROM FINANZAS_INGRESOS
        WHERE YEAR(FI_FECHA) = YEAR(GETDATE()) AND MONTH(FI_FECHA) = MONTH(GETDATE())
      `);
    const egresosRs = await pool.request()
      .query(`
        SELECT ISNULL(SUM(FE_MONTO), 0) as egresosMes
        FROM FINANZAS_EGRESOS
        WHERE YEAR(FE_FECHA) = YEAR(GETDATE()) AND MONTH(FE_FECHA) = MONTH(GETDATE())
      `);
    const cxcRs = await pool.request()
      .query(`
        SELECT ISNULL(SUM(FCC_MONTO), 0) as cxcPendiente,
               SUM(CASE WHEN FCC_FECHA_VENCIMIENTO < GETDATE() AND FCC_ESTATUS = 'pendiente' THEN 1 ELSE 0 END) as cxcVencidas
        FROM FINANZAS_CXC
        WHERE FCC_ESTATUS = 'pendiente'
      `);
    const cxpRs = await pool.request()
      .query(`
        SELECT ISNULL(SUM(FCP_MONTO), 0) as cxpPendiente
        FROM FINANZAS_CXP
        WHERE FCP_ESTATUS = 'pendiente'
      `);

    const ingresosMes = ingresosRs.recordset[0].ingresosMes;
    const egresosMes = egresosRs.recordset[0].egresosMes;
    const cxcPendiente = cxcRs.recordset[0].cxcPendiente;
    const cxcVencidas = cxcRs.recordset[0].cxcVencidas || 0;
    const cxpPendiente = cxpRs.recordset[0].cxpPendiente;

    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'finanzas',
      kpiKey: 'ingresos_mes',
      label: 'Ingresos del mes',
      valor: ingresosMes,
      unidad: 'MXN',
      tono: 'success',
    });
    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'finanzas',
      kpiKey: 'egresos_mes',
      label: 'Egresos del mes',
      valor: egresosMes,
      unidad: 'MXN',
      tono: 'warn',
    });
    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'finanzas',
      kpiKey: 'cxc_vencidas',
      label: 'CxC vencidas',
      valor: cxcVencidas,
      unidad: '',
      tono: cxcVencidas > 0 ? 'critical' : 'brand',
    });

    res.json({ success: true, data: { ingresosMes, egresosMes, cxcPendiente, cxpPendiente, cxcVencidas } });
  } catch (err) {
    logger.error('finanzasController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener el dashboard de finanzas' });
  }
}

async function listIngresos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT FI_ID as id, FI_CONCEPTO as concepto, FI_MONTO as monto, FI_FECHA as fecha, FI_CATEGORIA as categoria
        FROM FINANZAS_INGRESOS ORDER BY FI_FECHA DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listIngresos', err);
    res.status(500).json({ success: false, message: 'Error al listar ingresos' });
  }
}

async function crearIngreso(req, res) {
  try {
    const { concepto, monto, fecha, categoria } = req.body;
    if (!concepto || !monto) return res.status(400).json({ success: false, message: 'Concepto y monto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('concepto', sql.NVarChar, concepto)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('fecha', sql.Date, fecha || new Date())
      .input('categoria', sql.NVarChar, categoria || null)
      .query(`INSERT INTO FINANZAS_INGRESOS (FI_CONCEPTO, FI_MONTO, FI_FECHA, FI_CATEGORIA) VALUES (@concepto, @monto, @fecha, @categoria)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.crearIngreso', err);
    res.status(500).json({ success: false, message: 'Error al crear ingreso' });
  }
}

async function eliminarIngreso(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM FINANZAS_INGRESOS WHERE FI_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarIngreso', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el ingreso' });
  }
}

async function listEgresos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT FE_ID as id, FE_CONCEPTO as concepto, FE_MONTO as monto, FE_FECHA as fecha, FE_CATEGORIA as categoria
        FROM FINANZAS_EGRESOS ORDER BY FE_FECHA DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listEgresos', err);
    res.status(500).json({ success: false, message: 'Error al listar egresos' });
  }
}

async function crearEgreso(req, res) {
  try {
    const { concepto, monto, fecha, categoria } = req.body;
    if (!concepto || !monto) return res.status(400).json({ success: false, message: 'Concepto y monto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('concepto', sql.NVarChar, concepto)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('fecha', sql.Date, fecha || new Date())
      .input('categoria', sql.NVarChar, categoria || null)
      .query(`INSERT INTO FINANZAS_EGRESOS (FE_CONCEPTO, FE_MONTO, FE_FECHA, FE_CATEGORIA) VALUES (@concepto, @monto, @fecha, @categoria)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.crearEgreso', err);
    res.status(500).json({ success: false, message: 'Error al crear egreso' });
  }
}

async function eliminarEgreso(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM FINANZAS_EGRESOS WHERE FE_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarEgreso', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el egreso' });
  }
}

async function listCxc(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT FCC_ID as id, FCC_CLIENTE as cliente, FCC_MONTO as monto, FCC_FECHA_VENCIMIENTO as fechaVencimiento, FCC_ESTATUS as estatus
        FROM FINANZAS_CXC ORDER BY FCC_FECHA_VENCIMIENTO ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listCxc', err);
    res.status(500).json({ success: false, message: 'Error al listar cuentas por cobrar' });
  }
}

async function crearCxc(req, res) {
  try {
    const { cliente, monto, fechaVencimiento } = req.body;
    if (!cliente || !monto) return res.status(400).json({ success: false, message: 'Cliente y monto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('cliente', sql.NVarChar, cliente)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('fechaVencimiento', sql.Date, fechaVencimiento || null)
      .query(`INSERT INTO FINANZAS_CXC (FCC_CLIENTE, FCC_MONTO, FCC_FECHA_VENCIMIENTO) VALUES (@cliente, @monto, @fechaVencimiento)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.crearCxc', err);
    res.status(500).json({ success: false, message: 'Error al crear cuenta por cobrar' });
  }
}

// PATCH /api/finanzas/cxc/:id/estatus — marcar como pagada o volver a pendiente.
async function actualizarEstatusCxc(req, res) {
  try {
    const { id } = req.params;
    const { estatus } = req.body;
    if (!['pendiente', 'pagada'].includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).input('estatus', sql.NVarChar, estatus)
      .query('UPDATE FINANZAS_CXC SET FCC_ESTATUS = @estatus WHERE FCC_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.actualizarEstatusCxc', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el estatus' });
  }
}

async function eliminarCxc(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM FINANZAS_CXC WHERE FCC_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarCxc', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la cuenta por cobrar' });
  }
}

async function listCxp(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT FCP_ID as id, FCP_PROVEEDOR as proveedor, FCP_MONTO as monto, FCP_FECHA_VENCIMIENTO as fechaVencimiento, FCP_ESTATUS as estatus
        FROM FINANZAS_CXP ORDER BY FCP_FECHA_VENCIMIENTO ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listCxp', err);
    res.status(500).json({ success: false, message: 'Error al listar cuentas por pagar' });
  }
}

async function crearCxp(req, res) {
  try {
    const { proveedor, monto, fechaVencimiento } = req.body;
    if (!proveedor || !monto) return res.status(400).json({ success: false, message: 'Proveedor y monto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('proveedor', sql.NVarChar, proveedor)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('fechaVencimiento', sql.Date, fechaVencimiento || null)
      .query(`INSERT INTO FINANZAS_CXP (FCP_PROVEEDOR, FCP_MONTO, FCP_FECHA_VENCIMIENTO) VALUES (@proveedor, @monto, @fechaVencimiento)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.crearCxp', err);
    res.status(500).json({ success: false, message: 'Error al crear cuenta por pagar' });
  }
}

// PATCH /api/finanzas/cxp/:id/estatus — marcar como pagada o volver a pendiente.
async function actualizarEstatusCxp(req, res) {
  try {
    const { id } = req.params;
    const { estatus } = req.body;
    if (!['pendiente', 'pagada'].includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).input('estatus', sql.NVarChar, estatus)
      .query('UPDATE FINANZAS_CXP SET FCP_ESTATUS = @estatus WHERE FCP_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.actualizarEstatusCxp', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el estatus' });
  }
}

async function eliminarCxp(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM FINANZAS_CXP WHERE FCP_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarCxp', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la cuenta por pagar' });
  }
}

/* ── Bancos: cuentas bancarias de la empresa + movimientos manuales (depósito/retiro) ── */

// GET /api/finanzas/bancos/cuentas — cuentas activas con su saldo actual calculado
// (saldo inicial + depósitos - retiros registrados en FINANZAS_MOVIMIENTOS).
async function listCuentas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT c.FCU_ID as id, c.FCU_BANCO as banco, c.FCU_ALIAS as alias, c.FCU_NUMERO as numero,
             c.FCU_SALDO_INICIAL as saldoInicial, c.FCU_ACTIVA as activa,
             c.FCU_SALDO_INICIAL
               + ISNULL((SELECT SUM(CASE WHEN FM_TIPO = 'deposito' THEN FM_MONTO ELSE -FM_MONTO END) FROM FINANZAS_MOVIMIENTOS WHERE FM_CUENTA_ID = c.FCU_ID), 0) as saldoActual
      FROM FINANZAS_CUENTAS c
      WHERE c.FCU_ACTIVA = 1
      ORDER BY c.FCU_BANCO, c.FCU_ALIAS
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listCuentas', err);
    res.status(500).json({ success: false, message: 'Error al listar las cuentas bancarias' });
  }
}

async function crearCuenta(req, res) {
  try {
    const { banco, alias, numero, saldoInicial } = req.body;
    if (!banco || !alias) return res.status(400).json({ success: false, message: 'Banco y alias son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('banco', sql.NVarChar, banco)
      .input('alias', sql.NVarChar, alias)
      .input('numero', sql.NVarChar, numero || null)
      .input('saldoInicial', sql.Decimal(18, 2), saldoInicial || 0)
      .query(`INSERT INTO FINANZAS_CUENTAS (FCU_BANCO, FCU_ALIAS, FCU_NUMERO, FCU_SALDO_INICIAL) VALUES (@banco, @alias, @numero, @saldoInicial)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.crearCuenta', err);
    res.status(500).json({ success: false, message: 'Error al crear la cuenta' });
  }
}

// DELETE /api/finanzas/bancos/cuentas/:id — baja lógica (no borra el historial de movimientos).
async function eliminarCuenta(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('UPDATE FINANZAS_CUENTAS SET FCU_ACTIVA = 0 WHERE FCU_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarCuenta', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la cuenta' });
  }
}

// GET /api/finanzas/bancos/cuentas/:id/movimientos
async function listMovimientos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('cuentaId', sql.Int, id).query(`
      SELECT FM_ID as id, FM_TIPO as tipo, FM_CONCEPTO as concepto, FM_MONTO as monto, FM_FECHA as fecha
      FROM FINANZAS_MOVIMIENTOS WHERE FM_CUENTA_ID = @cuentaId ORDER BY FM_FECHA DESC, FM_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listMovimientos', err);
    res.status(500).json({ success: false, message: 'Error al listar los movimientos' });
  }
}

async function crearMovimiento(req, res) {
  try {
    const { id } = req.params;
    const { tipo, concepto, monto, fecha } = req.body;
    if (!['deposito', 'retiro'].includes(tipo)) return res.status(400).json({ success: false, message: 'Tipo de movimiento inválido' });
    if (!concepto || !monto || monto <= 0) return res.status(400).json({ success: false, message: 'Concepto y monto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('cuentaId', sql.Int, id)
      .input('tipo', sql.NVarChar, tipo)
      .input('concepto', sql.NVarChar, concepto)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('fecha', sql.Date, fecha || new Date())
      .query(`INSERT INTO FINANZAS_MOVIMIENTOS (FM_CUENTA_ID, FM_TIPO, FM_CONCEPTO, FM_MONTO, FM_FECHA) VALUES (@cuentaId, @tipo, @concepto, @monto, @fecha)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.crearMovimiento', err);
    res.status(500).json({ success: false, message: 'Error al registrar el movimiento' });
  }
}

async function eliminarMovimiento(req, res) {
  try {
    const { movId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, movId).query('DELETE FROM FINANZAS_MOVIMIENTOS WHERE FM_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarMovimiento', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el movimiento' });
  }
}

/* ── Presupuestos: monto asignado y ejercido por área del organigrama, por periodo ── */

// GET /api/finanzas/presupuestos?periodo=YYYY-MM — presupuestos del periodo (o mes
// actual), con el % ejercido calculado.
async function listPresupuestos(req, res) {
  try {
    const periodo = (req.query.periodo || new Date().toISOString().slice(0, 7)).toString();
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('periodo', sql.NVarChar, periodo).query(`
      SELECT FP_ID as id, FP_AREA_KEY as areaKey, FP_PERIODO as periodo,
             FP_MONTO_ASIGNADO as montoAsignado, FP_MONTO_EJERCIDO as montoEjercido
      FROM FINANZAS_PRESUPUESTOS
      WHERE FP_PERIODO = @periodo
      ORDER BY FP_AREA_KEY
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('finanzasController.listPresupuestos', err);
    res.status(500).json({ success: false, message: 'Error al listar los presupuestos' });
  }
}

// POST /api/finanzas/presupuestos — crea o actualiza (upsert) el presupuesto de un
// área para un periodo, dado que FP_AREA_KEY+FP_PERIODO es único.
async function guardarPresupuesto(req, res) {
  try {
    const { areaKey, periodo, montoAsignado, montoEjercido } = req.body;
    if (!areaKey || !periodo) return res.status(400).json({ success: false, message: 'Área y periodo son requeridos' });
    if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ success: false, message: 'Periodo inválido (YYYY-MM)' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('periodo', sql.NVarChar, periodo)
      .input('montoAsignado', sql.Decimal(18, 2), montoAsignado || 0)
      .input('montoEjercido', sql.Decimal(18, 2), montoEjercido || 0)
      .query(`
        IF EXISTS (SELECT 1 FROM FINANZAS_PRESUPUESTOS WHERE FP_AREA_KEY = @areaKey AND FP_PERIODO = @periodo)
          UPDATE FINANZAS_PRESUPUESTOS SET FP_MONTO_ASIGNADO = @montoAsignado, FP_MONTO_EJERCIDO = @montoEjercido
          WHERE FP_AREA_KEY = @areaKey AND FP_PERIODO = @periodo
        ELSE
          INSERT INTO FINANZAS_PRESUPUESTOS (FP_AREA_KEY, FP_PERIODO, FP_MONTO_ASIGNADO, FP_MONTO_EJERCIDO)
          VALUES (@areaKey, @periodo, @montoAsignado, @montoEjercido)
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.guardarPresupuesto', err);
    res.status(500).json({ success: false, message: 'Error al guardar el presupuesto' });
  }
}

async function eliminarPresupuesto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM FINANZAS_PRESUPUESTOS WHERE FP_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('finanzasController.eliminarPresupuesto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el presupuesto' });
  }
}

/* ── Reportes financieros: consolidado de ingresos/egresos por mes + estado actual ── */

// GET /api/finanzas/reportes?meses=6 — ingresos vs egresos de los últimos N meses
// (por defecto 6), más el estado actual de CxC/CxP y el saldo total en bancos.
// Consolida datos ya existentes de Ingresos, Egresos, CxC, CxP y Bancos, sin tabla nueva.
async function getReporteConsolidado(req, res) {
  try {
    const meses = Math.min(24, Math.max(1, parseInt(req.query.meses, 10) || 6));
    const pool = await databaseService.getPool(req.user?.empresa);

    const ingresosPorMesRs = await pool.request().input('meses', sql.Int, meses).query(`
      SELECT FORMAT(FI_FECHA, 'yyyy-MM') as mes, SUM(FI_MONTO) as total
      FROM FINANZAS_INGRESOS
      WHERE FI_FECHA >= DATEADD(month, -@meses, GETDATE())
      GROUP BY FORMAT(FI_FECHA, 'yyyy-MM')
    `);
    const egresosPorMesRs = await pool.request().input('meses', sql.Int, meses).query(`
      SELECT FORMAT(FE_FECHA, 'yyyy-MM') as mes, SUM(FE_MONTO) as total
      FROM FINANZAS_EGRESOS
      WHERE FE_FECHA >= DATEADD(month, -@meses, GETDATE())
      GROUP BY FORMAT(FE_FECHA, 'yyyy-MM')
    `);

    const ingresosPorMes = new Map(ingresosPorMesRs.recordset.map((r) => [r.mes, r.total]));
    const egresosPorMes = new Map(egresosPorMesRs.recordset.map((r) => [r.mes, r.total]));
    const mesesSet = new Set([...ingresosPorMes.keys(), ...egresosPorMes.keys()]);

    const hoyDate = new Date();
    for (let i = 0; i < meses; i++) {
      const d = new Date(hoyDate.getFullYear(), hoyDate.getMonth() - i, 1);
      mesesSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const serie = [...mesesSet].sort().map((mes) => {
      const ingresos = ingresosPorMes.get(mes) ?? 0;
      const egresos = egresosPorMes.get(mes) ?? 0;
      return { mes, ingresos, egresos, balance: ingresos - egresos };
    });

    const cxcRs = await pool.request().query(`
      SELECT ISNULL(SUM(CASE WHEN FCC_ESTATUS = 'pendiente' THEN FCC_MONTO ELSE 0 END), 0) as cxcPendiente,
             ISNULL(SUM(CASE WHEN FCC_ESTATUS = 'pagada' THEN FCC_MONTO ELSE 0 END), 0) as cxcCobrado
      FROM FINANZAS_CXC
    `);
    const cxpRs = await pool.request().query(`
      SELECT ISNULL(SUM(CASE WHEN FCP_ESTATUS = 'pendiente' THEN FCP_MONTO ELSE 0 END), 0) as cxpPendiente
      FROM FINANZAS_CXP
    `);
    const bancosRs = await pool.request().query(`
      SELECT ISNULL(SUM(c.FCU_SALDO_INICIAL + mv.neto), 0) as saldoTotal
      FROM FINANZAS_CUENTAS c
      CROSS APPLY (
        SELECT ISNULL(SUM(CASE WHEN FM_TIPO = 'deposito' THEN FM_MONTO ELSE -FM_MONTO END), 0) as neto
        FROM FINANZAS_MOVIMIENTOS WHERE FM_CUENTA_ID = c.FCU_ID
      ) mv
      WHERE c.FCU_ACTIVA = 1
    `);

    const totalIngresos = serie.reduce((s, m) => s + m.ingresos, 0);
    const totalEgresos = serie.reduce((s, m) => s + m.egresos, 0);

    res.json({
      success: true,
      data: {
        meses,
        serieMensual: serie,
        totales: { ingresos: totalIngresos, egresos: totalEgresos, balance: totalIngresos - totalEgresos },
        cxcPendiente: cxcRs.recordset[0].cxcPendiente,
        cxcCobrado: cxcRs.recordset[0].cxcCobrado,
        cxpPendiente: cxpRs.recordset[0].cxpPendiente,
        saldoBancos: bancosRs.recordset[0].saldoTotal,
      },
    });
  } catch (err) {
    logger.error('finanzasController.getReporteConsolidado', err);
    res.status(500).json({ success: false, message: 'Error al obtener el reporte consolidado' });
  }
}

module.exports = {
  getDashboard,
  listIngresos,
  crearIngreso,
  eliminarIngreso,
  listEgresos,
  crearEgreso,
  eliminarEgreso,
  listCxc,
  actualizarEstatusCxc,
  eliminarCxc,
  crearCxc,
  listCxp,
  crearCxp,
  actualizarEstatusCxp,
  eliminarCxp,
  listCuentas,
  crearCuenta,
  eliminarCuenta,
  listMovimientos,
  crearMovimiento,
  eliminarMovimiento,
  getReporteConsolidado,
  listPresupuestos,
  guardarPresupuesto,
  eliminarPresupuesto,
};
