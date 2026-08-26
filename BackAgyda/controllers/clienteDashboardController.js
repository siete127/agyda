const sql = require('mssql');
const databaseService = require('../services/databaseService');

const RANGOS = { dia: 1, semana: 7, mes: 30 };

function resolverRango(req) {
  const { rango, desde, hasta } = req.query || {};
  if (desde && hasta) return { desde, hasta };
  const dias = RANGOS[rango] || RANGOS.semana;
  const fin = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - dias);
  return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
}

// Dashboard del módulo "Seguimiento de Clientes" (Fase 7) — ~15 métricas por
// rango de fechas, todas queries directas COUNT/SUM (sin el generador dinámico
// de Reportes Ejecutivos, que es innecesario para este alcance más simple).
exports.getDashboard = async (req, res) => {
  try {
    const { desde, hasta } = resolverRango(req);
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request().input('desde', sql.Date, desde).input('hasta', sql.Date, hasta);

    const rs = await request.query(`
      SELECT
        (SELECT COUNT(*) FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE=1 AND CONT_ACTIVO=1
           AND CAST(CONT_FECHA AS DATE) BETWEEN @desde AND @hasta) as clientesNuevos,
        (SELECT COUNT(*) FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE=1 AND CONT_ACTIVO=1) as clientesTotal,
        (SELECT COUNT(*) FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE=1 AND CONT_ACTIVO=1 AND CONT_ESTATUS_CLIENTE NOT IN ('negro','morado')) as clientesActivos,
        (SELECT COUNT(*) FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE=1 AND CONT_ACTIVO=1 AND CONT_ESTATUS_CLIENTE='negro') as clientesInactivos,
        (SELECT COUNT(*) FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE=1 AND CONT_ACTIVO=1 AND CONT_ESTATUS_CLIENTE='amarillo') as clientesPendienteDocumentacion,
        (SELECT COUNT(*) FROM CLI_TAREAS WHERE TAR_ACTIVO=1 AND TAR_ESTATUS IN ('pendiente','en_proceso')) as tareasPendientes,
        (SELECT COUNT(*) FROM CLI_TAREAS WHERE TAR_ACTIVO=1 AND TAR_ESTATUS IN ('pendiente','en_proceso') AND TAR_FECHA_VENCIMIENTO < CAST(GETDATE() AS DATE)) as tareasVencidas,
        (SELECT COUNT(*) FROM CLI_SEGUIMIENTOS WHERE SEG_ACTIVO=1 AND SEG_PROXIMA_FECHA IS NOT NULL AND SEG_PROXIMA_FECHA >= CAST(GETDATE() AS DATE)) as seguimientosPendientes,
        (SELECT COUNT(*) FROM CLI_SEGUIMIENTOS WHERE SEG_ACTIVO=1 AND SEG_PROXIMA_FECHA IS NOT NULL AND SEG_PROXIMA_FECHA < CAST(GETDATE() AS DATE)) as seguimientosVencidos,
        (SELECT COUNT(*) FROM CRM_RECORDATORIOS_PAGO WHERE REC_ACTIVO=1 AND REC_ESTATUS IN ('pendiente','enviado')
           AND REC_FECHA_LIMITE BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY,7,CAST(GETDATE() AS DATE))) as pagosProximosVencer,
        (SELECT COUNT(*) FROM CRM_RECORDATORIOS_PAGO WHERE REC_ACTIVO=1 AND REC_ESTATUS IN ('pendiente','enviado') AND REC_FECHA_LIMITE < CAST(GETDATE() AS DATE)) as pagosVencidos,
        (SELECT COUNT(*) FROM CRM_RECORDATORIOS_PAGO WHERE REC_ACTIVO=1 AND REC_ESTATUS='pagado'
           AND CAST(REC_FECHA_PAGO AS DATE) BETWEEN @desde AND @hasta) as pagosRealizados,
        (SELECT ISNULL(SUM(REC_MONTO),0) FROM CRM_RECORDATORIOS_PAGO WHERE REC_ACTIVO=1 AND REC_ESTATUS='pagado'
           AND CAST(REC_FECHA_PAGO AS DATE) BETWEEN @desde AND @hasta) as montoPagadoRango,
        (SELECT COUNT(*) FROM CRM_ENCUESTAS_ENVIADAS WHERE CAST(CES_FECHA_ENVIO AS DATE) BETWEEN @desde AND @hasta) as encuestasEnviadas,
        (SELECT COUNT(*) FROM CRM_ENCUESTAS_ENVIADAS WHERE CAST(CES_FECHA_ENVIO AS DATE) BETWEEN @desde AND @hasta AND CES_CLASIFICACION IS NOT NULL) as encuestasRespondidas,
        (SELECT COUNT(*) FROM CRM_ENCUESTAS_ENVIADAS WHERE CAST(CES_FECHA_ENVIO AS DATE) BETWEEN @desde AND @hasta AND CES_CLASIFICACION='satisfecho') as encuestasSatisfecho,
        (SELECT COUNT(*) FROM CLI_INCIDENCIAS WHERE INC_ACTIVO=1 AND INC_ESTATUS IN ('pendiente','en_proceso','en_espera_cliente','escalado')) as incidenciasAbiertas,
        (SELECT COUNT(*) FROM CLI_INCIDENCIAS WHERE INC_ACTIVO=1 AND INC_ESTATUS IN ('resuelto','cerrado')
           AND CAST(INC_FECHA_RESOLUCION AS DATE) BETWEEN @desde AND @hasta) as incidenciasResueltas,
        (SELECT COUNT(*) FROM CLI_FECHAS_IMPORTANTES WHERE FEC_ACTIVO=1 AND FEC_ESTATUS='vigente'
           AND FEC_FECHA BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY,30,CAST(GETDATE() AS DATE))) as renovacionesProximas
    `);

    const row = rs.recordset[0];
    const tasaSatisfaccion = row.encuestasRespondidas > 0 ? Math.round((row.encuestasSatisfecho / row.encuestasRespondidas) * 100) : null;

    res.json({
      success: true,
      data: {
        rango: { desde, hasta },
        clientesNuevos: row.clientesNuevos,
        clientesTotal: row.clientesTotal,
        clientesActivos: row.clientesActivos,
        clientesInactivos: row.clientesInactivos,
        clientesPendienteDocumentacion: row.clientesPendienteDocumentacion,
        tareasPendientes: row.tareasPendientes,
        tareasVencidas: row.tareasVencidas,
        seguimientosPendientes: row.seguimientosPendientes,
        seguimientosVencidos: row.seguimientosVencidos,
        pagosProximosVencer: row.pagosProximosVencer,
        pagosVencidos: row.pagosVencidos,
        pagosRealizados: row.pagosRealizados,
        montoPagadoRango: row.montoPagadoRango,
        encuestasEnviadas: row.encuestasEnviadas,
        encuestasRespondidas: row.encuestasRespondidas,
        tasaSatisfaccion,
        incidenciasAbiertas: row.incidenciasAbiertas,
        incidenciasResueltas: row.incidenciasResueltas,
        renovacionesProximas: row.renovacionesProximas,
      },
    });
  } catch (e) {
    console.error('Error getDashboard clientes:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Reporte descargable: listado plano de clientes con datos relevantes dentro
// del rango — el frontend arma el Excel (patrón ya usado en el resto del
// sistema, ej. ReportesEjecutivosPage.tsx), aquí solo se devuelven las filas.
exports.getReporte = async (req, res) => {
  try {
    const { desde, hasta } = resolverRango(req);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta)
      .query(`
        SELECT C.CONT_ID as id, C.CONT_NOMBRE as nombre, C.CONT_EMPRESA as empresa,
               C.CONT_ESTATUS_CLIENTE as estatus, C.CONT_TIPO_CLIENTE as tipoCliente,
               U.NEUS_NOMBRES as responsable, CONVERT(NVARCHAR(10), C.CONT_FECHA, 23) as fechaAlta,
               (SELECT COUNT(*) FROM CLI_INCIDENCIAS WHERE INC_CONTACTO_ID=C.CONT_ID AND INC_ACTIVO=1 AND INC_ESTATUS IN ('pendiente','en_proceso','en_espera_cliente','escalado')) as incidenciasAbiertas,
               (SELECT COUNT(*) FROM CRM_RECORDATORIOS_PAGO WHERE REC_CONTACTO_ID=C.CONT_ID AND REC_ACTIVO=1 AND REC_ESTATUS IN ('pendiente','enviado') AND REC_FECHA_LIMITE < CAST(GETDATE() AS DATE)) as pagosVencidos
        FROM CRM_CONTACTOS C
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = C.CONT_RESPONSABLE_ID
        WHERE C.CONT_ES_CLIENTE = 1 AND C.CONT_ACTIVO = 1
          AND CAST(C.CONT_FECHA AS DATE) BETWEEN @desde AND @hasta
        ORDER BY C.CONT_FECHA DESC
      `);
    res.json({ success: true, data: { rango: { desde, hasta }, filas: rs.recordset } });
  } catch (e) {
    console.error('Error getReporte clientes:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
