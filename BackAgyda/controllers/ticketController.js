const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService');
const { normalizeArea } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');
const { EVIDENCIA_DIR } = require('../middleware/evidenceUpload');
const { logAudit } = require('../services/auditService');
const ticketPrioridad = require('../constants/ticketPrioridad');
const TICKET_CATEGORIAS = require('../constants/ticketCategorias');
const TICKET_CODIGOS_CIERRE = require('../constants/ticketCierre');
const reglasAsignacionService = require('../services/reglasAsignacionService');
const TICKET_MOTIVOS_ESPERA = require('../constants/ticketMotivosEspera');

/* ── SLA: reglas configurables (por prioridad + área opcional) evaluadas contra los
   tiempos que este controller ya calcula (tiempoAtencionMinutos / tiempoPrimeraRespuestaMinutos).
   No se guarda nada nuevo por ticket — el cumplimiento se calcula al vuelo. ── */

/* ── Reglas de envío de encuesta de satisfacción: por área, la prioridad
   mínima que amerita encuesta. Cacheado igual que los feriados (cambia poco). ── */
const encuestaConfigCache = new Map(); // tenantKey -> Map<area, prioridadMinima>

async function cargarEncuestaConfig(pool, tenantKey) {
  const key = tenantKey || 'default';
  if (encuestaConfigCache.has(key)) return encuestaConfigCache.get(key);
  const rs = await pool.request().query(`SELECT TEN_AREA as area, TEN_PRIORIDAD_MINIMA as prioridadMinima FROM TICKETS_ENCUESTA_CONFIG`);
  const map = new Map(rs.recordset.map((r) => [r.area, r.prioridadMinima]));
  encuestaConfigCache.set(key, map);
  return map;
}

function invalidarCacheEncuestaConfig(tenantKey) {
  if (tenantKey) encuestaConfigCache.delete(tenantKey);
  else encuestaConfigCache.clear();
}

// true si `prioridad` es igual o más crítica que `prioridadMinima`. El orden
// P1..P4 (ticketPrioridad.PRIORIDADES) va de más a menos crítico, así que
// "más crítica o igual" = índice menor o igual.
function prioridadAmeritaEncuesta(prioridad, prioridadMinima) {
  const orden = ticketPrioridad.PRIORIDADES;
  const idxTicket = orden.indexOf((prioridad || '').toUpperCase());
  const idxMinima = orden.indexOf((prioridadMinima || '').toUpperCase());
  if (idxTicket === -1 || idxMinima === -1) return true; // dato inesperado: no bloquear la encuesta
  return idxTicket <= idxMinima;
}

// Sin fila configurada para el área = comportamiento anterior (siempre aplica),
// para no romper el flujo si el AD no configuró nada todavía.
async function ticketAmeritaEncuesta(pool, tenantKey, area, prioridad) {
  const config = await cargarEncuestaConfig(pool, tenantKey);
  const prioridadMinima = config.get((area || '').toUpperCase());
  if (!prioridadMinima) return true;
  return prioridadAmeritaEncuesta(prioridad, prioridadMinima);
}

/* ── Días festivos: catálogo simple, cacheado en memoria del proceso (cambia
   con muy poca frecuencia — no vale la pena una query en cada listado de
   tickets). Se invalida al crear/eliminar un festivo desde Configuración. ── */
const feriadosCache = new Map(); // tenantKey -> Set<'YYYY-MM-DD'>

async function cargarFeriadosActivos(pool, tenantKey) {
  const key = tenantKey || 'default';
  if (feriadosCache.has(key)) return feriadosCache.get(key);
  const rs = await pool.request().query(`SELECT CONVERT(varchar(10), FEST_FECHA, 23) as fecha FROM TI_DIAS_FESTIVOS`);
  const set = new Set(rs.recordset.map((r) => r.fecha));
  feriadosCache.set(key, set);
  return set;
}

function invalidarCacheFeriados(tenantKey) {
  if (tenantKey) feriadosCache.delete(tenantKey);
  else feriadosCache.clear();
}

// Minutos "laborables" entre dos fechas: cuenta días completos (24h) salvo
// sábados, domingos y las fechas en `feriados` (Set de 'YYYY-MM-DD'), que se
// excluyen por completo del conteo. No recorta por horario de oficina dentro
// de un día laborable — un día lunes-viernes cuenta sus 24 horas igual.
function minutosLaborablesEntre(fechaInicio, fechaFin, feriados) {
  if (fechaFin <= fechaInicio) return 0;
  const feriadosSet = feriados || new Set();

  let minutos = 0;
  const cursor = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate());
  const finDia = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), fechaFin.getDate());

  while (cursor <= finDia) {
    const diaSemana = cursor.getDay(); // 0=domingo, 6=sábado
    const yyyyMmDd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const esNoLaborable = diaSemana === 0 || diaSemana === 6 || feriadosSet.has(yyyyMmDd);

    if (!esNoLaborable) {
      const inicioTramo = cursor.getTime() > fechaInicio.getTime() ? cursor : fechaInicio;
      const finDelDia = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      const finTramo = finDelDia.getTime() < fechaFin.getTime() ? finDelDia : fechaFin;
      const tramoInicio = Math.max(inicioTramo.getTime(), cursor.getTime());
      minutos += Math.max(0, Math.round((finTramo.getTime() - tramoInicio) / 60000));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return minutos;
}

async function cargarReglasSlaActivas(pool) {
  const rs = await pool.request().query(`
    SELECT TSR_ID as id, TSR_PRIORIDAD as prioridad, TSR_AREA as area, TSR_SERVICIO as servicio,
           TSR_MIN_PRIMERA_RESPUESTA as minPrimeraRespuesta, TSR_MIN_RESOLUCION as minResolucion
    FROM TICKETS_SLA_REGLAS WHERE TSR_ACTIVA = 1
  `);
  return rs.recordset;
}

// Busca la regla más específica primero: prioridad+área+servicio exactos.
// Si no hay match, va cayendo a reglas más genéricas (prioridad+área,
// prioridad sola) — retrocompatible: si nunca se configuró una regla por
// servicio, el comportamiento es idéntico al de antes.
function buscarReglaSla(reglas, prioridad, area, servicio) {
  const prio = (prioridad || '').toString().toUpperCase();
  const ar = (area || '').toString().toUpperCase();
  const srv = (servicio || '').toString().toLowerCase();
  return reglas.find((r) => r.prioridad === prio && (r.area || '').toUpperCase() === ar && (r.servicio || '').toLowerCase() === srv && srv)
    || reglas.find((r) => r.prioridad === prio && (r.area || '').toUpperCase() === ar && !r.servicio)
    || reglas.find((r) => r.prioridad === prio && !r.area && !r.servicio)
    || null;
}

// Añade a cada ticket: sla (regla aplicada o null), slaRespuesta y slaResolucion
// ('cumplido' | 'incumplido' | 'en_riesgo' | 'en_tiempo' | null si no hay regla).
function enriquecerConSla(tickets, reglas, feriados = null) {
  const ahora = new Date();
  // feriados === null (no se cargó el catálogo) => tiempo de reloj simple, sin
  // excluir nada. feriados es un Set (aunque esté vacío) => siempre excluye
  // fin de semana como mínimo, más lo que haya en el Set — ver minutosLaborablesEntre.
  const transcurridos = feriados !== null
    ? (desde, hasta) => minutosLaborablesEntre(desde, hasta, feriados)
    : (desde, hasta) => Math.round((hasta.getTime() - desde.getTime()) / 60000);

  return tickets.map((t) => {
    const regla = buscarReglaSla(reglas, t.PRIORIDAD ?? t.prioridad, t.AREA ?? t.area, t.SERVICIO_AFECTADO ?? t.servicioAfectado);
    if (!regla) return { ...t, slaRespuesta: null, slaResolucion: null, slaReglaId: null };

    const creacion = new Date(t.FECHA_CREACION ?? t.fechaCreacion);

    let slaRespuesta = null;
    const primeraRespuesta = t.FECHA_PRIMERA_RESPUESTA ?? t.fechaPrimeraRespuesta;
    if (primeraRespuesta) {
      const minutos = transcurridos(creacion, new Date(primeraRespuesta));
      slaRespuesta = minutos <= regla.minPrimeraRespuesta ? 'cumplido' : 'incumplido';
    } else {
      const minutosTranscurridos = transcurridos(creacion, ahora);
      if (minutosTranscurridos > regla.minPrimeraRespuesta) slaRespuesta = 'incumplido';
      else if (minutosTranscurridos >= regla.minPrimeraRespuesta * 0.85) slaRespuesta = 'en_riesgo';
      else slaRespuesta = 'en_tiempo';
    }

    // El reloj de SLA de resolución se pausa mientras el ticket está en_espera:
    // se descuenta el tiempo ya acumulado (MINUTOS_TOTAL_ESPERA) y, si está
    // actualmente en espera, también el tramo en curso desde FECHA_INICIO_ESPERA.
    // Los minutos de espera se restan tal cual (en tiempo de reloj, no laborable)
    // porque ya representan una pausa explícita del SLA, no tiempo transcurrido.
    const minutosTotalEspera = t.MINUTOS_TOTAL_ESPERA ?? t.minutosTotalEspera ?? 0;
    const estadoTicket = t.ESTADO ?? t.estado;
    const fechaInicioEspera = t.FECHA_INICIO_ESPERA ?? t.fechaInicioEspera;
    const minutosEsperaEnCurso = (estadoTicket === 'en_espera' && fechaInicioEspera)
      ? Math.round((ahora.getTime() - new Date(fechaInicioEspera).getTime()) / 60000)
      : 0;

    let slaResolucion = null;
    const cierre = t.FECHA_CIERRE ?? t.fechaCierre;
    if (cierre) {
      const minutos = transcurridos(creacion, new Date(cierre)) - minutosTotalEspera;
      slaResolucion = minutos <= regla.minResolucion ? 'cumplido' : 'incumplido';
    } else {
      const minutosTranscurridos = transcurridos(creacion, ahora) - minutosTotalEspera - minutosEsperaEnCurso;
      if (minutosTranscurridos > regla.minResolucion) slaResolucion = 'incumplido';
      else if (minutosTranscurridos >= regla.minResolucion * 0.85) slaResolucion = 'en_riesgo';
      else slaResolucion = 'en_tiempo';
    }

    return { ...t, slaRespuesta, slaResolucion, slaReglaId: regla.id };
  });
}

// Cierra un ticket 'resuelto' (ESTADO='cerrado' + FECHA_CIERRE) y congela un
// snapshot del SLA/tiempos en ese instante — ver columnas SLA_*_CUMPLIDO/
// MINUTOS_* en schemaService.js. Se llama desde dos puntos: registrarSatisfaccion
// (ticket con encuesta, cierra tras calificar) y validarResolucion (ticket sin
// encuesta aplicable, cierra directo al confirmar que la solución funcionó) —
// ambos deben producir el mismo snapshot, de ahí la función compartida.
async function cerrarTicketConSnapshot(pool, ticketId, tenantKey) {
  const hdr = await pool.request().input('tid', sql.Int, ticketId).query(`
    SELECT TICKET_ID, PRIORIDAD, AREA, SERVICIO_AFECTADO, FECHA_CREACION, FECHA_PRIMERA_RESPUESTA,
           MINUTOS_TOTAL_ESPERA, FECHA_CIERRE
    FROM TICKETS WHERE TICKET_ID=@tid`);
  if (!hdr.recordset.length) return;
  const t = hdr.recordset[0];

  const reglas = await cargarReglasSlaActivas(pool);
  const feriados = await cargarFeriadosActivos(pool, tenantKey);
  const regla = buscarReglaSla(reglas, t.PRIORIDAD, t.AREA, t.SERVICIO_AFECTADO);

  const ahoraCierre = t.FECHA_CIERRE ? new Date(t.FECHA_CIERRE) : new Date();
  const creacion = new Date(t.FECHA_CREACION);
  const transcurridos = (desde, hasta) => minutosLaborablesEntre(desde, hasta, feriados);

  let slaRespuestaCumplido = null;
  let minutosPrimeraRespuesta = null;
  if (t.FECHA_PRIMERA_RESPUESTA) {
    minutosPrimeraRespuesta = transcurridos(creacion, new Date(t.FECHA_PRIMERA_RESPUESTA));
    if (regla) slaRespuestaCumplido = minutosPrimeraRespuesta <= regla.minPrimeraRespuesta;
  }

  const minutosTrabajados = transcurridos(creacion, ahoraCierre) - (t.MINUTOS_TOTAL_ESPERA || 0);
  const slaResolucionCumplido = regla ? minutosTrabajados <= regla.minResolucion : null;

  await pool.request()
    .input('tid', sql.Int, ticketId)
    .input('fecha', sql.DateTime, ahoraCierre)
    .input('slaResp', sql.Bit, slaRespuestaCumplido)
    .input('slaRes', sql.Bit, slaResolucionCumplido)
    .input('minResp', sql.Int, minutosPrimeraRespuesta)
    .input('minTrab', sql.Int, minutosTrabajados)
    .query(`UPDATE TICKETS SET
              ESTADO='cerrado', FECHA_CIERRE = COALESCE(FECHA_CIERRE, @fecha),
              SLA_RESPUESTA_CUMPLIDO=@slaResp, SLA_RESOLUCION_CUMPLIDO=@slaRes,
              MINUTOS_PRIMERA_RESPUESTA=@minResp, MINUTOS_TRABAJADOS=@minTrab
            WHERE TICKET_ID=@tid`);
}

// GET /api/tickets/sla/reglas
exports.listReglasSla = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT TSR_ID as id, TSR_PRIORIDAD as prioridad, TSR_AREA as area, TSR_SERVICIO as servicio,
             TSR_MIN_PRIMERA_RESPUESTA as minPrimeraRespuesta,
             TSR_MIN_PRIMERA_RESPUESTA_DESDE as minPrimeraRespuestaDesde,
             TSR_MIN_RESOLUCION as minResolucion,
             TSR_MIN_RESOLUCION_DESDE as minResolucionDesde,
             TSR_ACTIVA as activa
      FROM TICKETS_SLA_REGLAS ORDER BY TSR_PRIORIDAD, TSR_AREA
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando reglas SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tickets/sla/reglas
exports.crearReglaSla = async (req, res) => {
  try {
    const { prioridad, area, servicio, minPrimeraRespuesta, minPrimeraRespuestaDesde, minResolucion, minResolucionDesde } = req.body;
    if (!prioridad || !minPrimeraRespuesta || !minResolucion) {
      return res.status(400).json({ success: false, message: 'Prioridad, minutos de primera respuesta y de resolución son requeridos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('prioridad', sql.NVarChar, prioridad.toString().toUpperCase())
      .input('area', sql.NVarChar, area ? area.toString().toUpperCase() : null)
      .input('servicio', sql.NVarChar, servicio || null)
      .input('minRespuestaDesde', sql.Int, minPrimeraRespuestaDesde || null)
      .input('minRespuesta', sql.Int, minPrimeraRespuesta)
      .input('minResolucionDesde', sql.Int, minResolucionDesde || null)
      .input('minResolucion', sql.Int, minResolucion)
      .input('creadoPor', sql.SmallInt, req.headers['usuarioid'] ? Number(req.headers['usuarioid']) : null)
      .query(`
        INSERT INTO TICKETS_SLA_REGLAS (TSR_PRIORIDAD, TSR_AREA, TSR_SERVICIO, TSR_MIN_PRIMERA_RESPUESTA_DESDE, TSR_MIN_PRIMERA_RESPUESTA, TSR_MIN_RESOLUCION_DESDE, TSR_MIN_RESOLUCION, TSR_CREADO_POR)
        VALUES (@prioridad, @area, @servicio, @minRespuestaDesde, @minRespuesta, @minResolucionDesde, @minResolucion, @creadoPor)
      `);
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('Error creando regla SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// PATCH /api/tickets/sla/reglas/:id
exports.actualizarReglaSla = async (req, res) => {
  try {
    const { id } = req.params;
    const { prioridad, area, servicio, minPrimeraRespuesta, minPrimeraRespuestaDesde, minResolucion, minResolucionDesde, activa } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('prioridad', sql.NVarChar, prioridad ? prioridad.toString().toUpperCase() : null)
      .input('area', sql.NVarChar, area ? area.toString().toUpperCase() : null)
      .input('servicio', sql.NVarChar, servicio || null)
      .input('minRespuestaDesde', sql.Int, minPrimeraRespuestaDesde || null)
      .input('minRespuesta', sql.Int, minPrimeraRespuesta)
      .input('minResolucionDesde', sql.Int, minResolucionDesde || null)
      .input('minResolucion', sql.Int, minResolucion)
      .input('activa', sql.Bit, activa ? 1 : 0)
      .query(`
        UPDATE TICKETS_SLA_REGLAS
        SET TSR_PRIORIDAD = @prioridad, TSR_AREA = @area, TSR_SERVICIO = @servicio,
            TSR_MIN_PRIMERA_RESPUESTA_DESDE = @minRespuestaDesde, TSR_MIN_PRIMERA_RESPUESTA = @minRespuesta,
            TSR_MIN_RESOLUCION_DESDE = @minResolucionDesde, TSR_MIN_RESOLUCION = @minResolucion, TSR_ACTIVA = @activa
        WHERE TSR_ID = @id
      `);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando regla SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/tickets/sla/reglas/:id
exports.eliminarReglaSla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM TICKETS_SLA_REGLAS WHERE TSR_ID = @id');
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando regla SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/tickets/sla/reporte — % de cumplimiento general y por área/prioridad,
// sobre tickets ya cerrados (SLA de resolución final, no en tiempo real).
exports.getReporteSla = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const reglas = await cargarReglasSlaActivas(pool);
    if (reglas.length === 0) return res.json({ success: true, data: { totalEvaluados: 0, cumplidos: 0, pctCumplimiento: null, porArea: [], porPrioridad: [] } });
    const feriados = await cargarFeriadosActivos(pool, req.user?.empresa);

    const rs = await pool.request().query(`
      SELECT TICKET_ID as id, AREA as area, PRIORIDAD as prioridad, FECHA_CREACION as fechaCreacion, FECHA_CIERRE as fechaCierre
      FROM TICKETS WHERE FECHA_CIERRE IS NOT NULL
    `);
    const enriquecidos = enriquecerConSla(rs.recordset, reglas, feriados).filter((t) => t.slaResolucion !== null);

    const cumplidos = enriquecidos.filter((t) => t.slaResolucion === 'cumplido').length;
    const totalEvaluados = enriquecidos.length;

    const agrupar = (campo) => {
      const mapa = new Map();
      for (const t of enriquecidos) {
        const key = t[campo];
        if (!mapa.has(key)) mapa.set(key, { key, total: 0, cumplidos: 0 });
        const entry = mapa.get(key);
        entry.total += 1;
        if (t.slaResolucion === 'cumplido') entry.cumplidos += 1;
      }
      return [...mapa.values()].map((e) => ({ ...e, pctCumplimiento: Math.round((e.cumplidos / e.total) * 1000) / 10 }));
    };

    res.json({
      success: true,
      data: {
        totalEvaluados,
        cumplidos,
        pctCumplimiento: totalEvaluados > 0 ? Math.round((cumplidos / totalEvaluados) * 1000) / 10 : null,
        porArea: agrupar('area'),
        porPrioridad: agrupar('prioridad'),
      },
    });
  } catch (e) {
    console.error('Error generando reporte SLA:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Panel de KPIs de Tickets (mismo alcance que SLA: informativo dentro del
// módulo, no se conecta a AREA_KPIS/Supervisión General de Dirección
// General). Todo se calcula sobre TICKETS + TICKET_SATISFACCION, sin
// depender de que haya reglas de SLA configuradas.
exports.getKpisTickets = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const abiertosRs = await pool.request().query(`
      SELECT ESTADO as estado, COUNT(*) as total FROM TICKETS
      WHERE ESTADO NOT IN ('resuelto', 'cerrado')
      GROUP BY ESTADO
    `);
    const totalAbiertos = abiertosRs.recordset.reduce((sum, r) => sum + r.total, 0);

    const cerradosRs = await pool.request().query(`
      SELECT TICKET_ID as id, AREA as area, PRIORIDAD as prioridad, ESTADO as estado,
             FECHA_CREACION as fechaCreacion, FECHA_CIERRE as fechaCierre, REABIERTO_VECES as reabiertoVeces
      FROM TICKETS WHERE FECHA_CIERRE IS NOT NULL
    `);
    const cerrados = cerradosRs.recordset;
    const totalCerrados = cerrados.length;

    const minutosResolucion = cerrados
      .map((t) => Math.round((new Date(t.fechaCierre).getTime() - new Date(t.fechaCreacion).getTime()) / 60000))
      .filter((m) => Number.isFinite(m) && m >= 0);
    const promedioResolucionMin = minutosResolucion.length
      ? Math.round(minutosResolucion.reduce((a, b) => a + b, 0) / minutosResolucion.length)
      : null;

    const reabiertos = cerrados.filter((t) => (t.reabiertoVeces || 0) > 0).length;
    const pctReabiertos = totalCerrados > 0 ? Math.round((reabiertos / totalCerrados) * 1000) / 10 : null;

    let pctCumplimientoSla = null;
    try {
      const reglas = await cargarReglasSlaActivas(pool);
      if (reglas.length > 0) {
        const feriados = await cargarFeriadosActivos(pool, req.user?.empresa);
        const enriquecidos = enriquecerConSla(cerrados, reglas, feriados).filter((t) => t.slaResolucion !== null);
        if (enriquecidos.length > 0) {
          const cumplidos = enriquecidos.filter((t) => t.slaResolucion === 'cumplido').length;
          pctCumplimientoSla = Math.round((cumplidos / enriquecidos.length) * 1000) / 10;
        }
      }
    } catch (e) {
      console.warn('KPIs tickets: no se pudo calcular % cumplimiento SLA:', e.message);
    }

    const satisfaccionRs = await pool.request().query(`
      SELECT AVG(CAST(RATING as FLOAT)) as promedio, COUNT(*) as total
      FROM TICKET_SATISFACCION WHERE RATING IS NOT NULL
    `);
    const satisfaccionPromedio = satisfaccionRs.recordset[0]?.promedio != null
      ? Math.round(satisfaccionRs.recordset[0].promedio * 10) / 10
      : null;
    const satisfaccionTotal = satisfaccionRs.recordset[0]?.total || 0;

    const porArea = (campo) => {
      const mapa = new Map();
      for (const t of cerrados) {
        const key = t[campo];
        mapa.set(key, (mapa.get(key) || 0) + 1);
      }
      return [...mapa.entries()].map(([key, total]) => ({ key, total }));
    };

    // Umbrales configurables desde Configuración > Tecnología/TI (ver
    // getKpisConfig/actualizarKpisConfig) — con fallback a los valores por
    // defecto si la tabla falla o está vacía.
    let umbrales = { umbralSlaBueno: 80, umbralReabiertosMalo: 10, umbralSatisfaccionBueno: 4 };
    try {
      const cfgRs = await pool.request().query(`
        SELECT TOP 1 TKC_UMBRAL_SLA_BUENO as umbralSlaBueno,
          TKC_UMBRAL_REABIERTOS_MALO as umbralReabiertosMalo,
          TKC_UMBRAL_SATISFACCION_BUENO as umbralSatisfaccionBueno
        FROM TICKETS_KPIS_CONFIG ORDER BY TKC_ID`);
      if (cfgRs.recordset[0]) umbrales = cfgRs.recordset[0];
    } catch (e) {
      console.warn('KPIs tickets: no se pudo leer configuración de umbrales, usando default:', e.message);
    }

    res.json({
      success: true,
      data: {
        totalAbiertos,
        porEstado: abiertosRs.recordset.map((r) => ({ key: r.estado, total: r.total })),
        totalCerrados,
        promedioResolucionMin,
        pctReabiertos,
        pctCumplimientoSla,
        satisfaccionPromedio,
        satisfaccionTotal,
        volumenPorArea: porArea('area'),
        volumenPorPrioridad: porArea('prioridad'),
        ...umbrales,
      },
    });
  } catch (e) {
    console.error('Error generando KPIs de tickets:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Valida que un usuario sea un agente activo del pool de soporte de un área
// (opcionalmente restringido a un nivel). Reemplaza whitelists hardcodeadas.
async function validarAgentePool(pool, area, userId, nivel = null) {
  if (!userId) return false;
  const a = normalizeArea(area);
  const req = pool.request()
    .input('uid', sql.Int, userId)
    .input('area', sql.NVarChar, a);
  let query = `
    SELECT 1 FROM NEUS_USUARIOS u
    INNER JOIN TI_STAFF_STATUS s ON s.USER_ID = u.NEUS_ID
    WHERE u.NEUS_ID = @uid AND u.NEUS_ACTIVO = 1 AND s.AREA = @area`;
  if (nivel != null) {
    req.input('nivel', sql.TinyInt, nivel);
    query += ' AND s.NIVEL = @nivel';
  }
  const rs = await req.query(query);
  return rs.recordset.length > 0;
}

const TICKETS_SELECT_COLUMNAS = `
  t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.DESCRIPCION, t.ESTADO,
  t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
  t.CLASIFICACION, t.CATEGORIA, t.SUBCATEGORIA, t.ELEMENTO, t.SERVICIO_AFECTADO, t.IMPACTO, t.URGENCIA, t.NIVEL_ACTUAL,
  t.MOTIVO_ESPERA, t.FECHA_INICIO_ESPERA, t.MINUTOS_TOTAL_ESPERA,
  t.CODIGO_CIERRE, t.VALIDADO_USUARIO, t.REABIERTO_VECES, t.ARTICULO_KB_ID,
  t.CAUSA_RAIZ, t.FECHA_RESOLUCION_PROPUESTA,
  su.NEUS_NOMBRES AS SOLICITANTE_NOMBRE,
  au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
  s.RATING as rating,
  CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
`;

// Filtros opcionales de listado (estado/prioridad/área/técnico asignado/rango
// de fechas) + paginación real — aplican igual sobre cualquiera de las 4 ramas
// de visibilidad por rol de abajo, que ya no cambian (son seguridad, no filtro).
function aplicarFiltrosYPaginacion(query, req) {
  const condiciones = [];
  const request = query.request;
  if (req.query.estado) {
    condiciones.push('t.ESTADO = @fEstado');
    request.input('fEstado', sql.NVarChar, String(req.query.estado));
  }
  if (req.query.prioridad) {
    condiciones.push('t.PRIORIDAD = @fPrioridad');
    request.input('fPrioridad', sql.NVarChar, String(req.query.prioridad).toUpperCase());
  }
  if (req.query.area) {
    condiciones.push('t.AREA = @fArea');
    request.input('fArea', sql.NVarChar, normalizeArea(req.query.area));
  }
  if (req.query.asignadoA) {
    condiciones.push('t.ASIGNADO_A = @fAsignadoA');
    request.input('fAsignadoA', sql.Int, Number(req.query.asignadoA));
  }
  if (req.query.fechaDesde) {
    condiciones.push('t.FECHA_CREACION >= @fFechaDesde');
    request.input('fFechaDesde', sql.Date, req.query.fechaDesde);
  }
  if (req.query.fechaHasta) {
    condiciones.push('t.FECHA_CREACION < DATEADD(DAY, 1, @fFechaHasta)');
    request.input('fFechaHasta', sql.Date, req.query.fechaHasta);
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  request.input('fLimit', sql.Int, limit);
  request.input('fOffset', sql.Int, offset);

  return { extraWhere: condiciones.length ? ` AND ${condiciones.join(' AND ')}` : '', limit, offset };
}

exports.getTickets = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const usuarioId = Number(req.headers['usuarioid'] || req.query.usuarioId || 0) || null;
    const clienteId = Number(req.headers['clienteid'] || req.query.clienteId || 0) || null;
    const areaParam = req.query.area ? normalizeArea(req.query.area) : null;

    const pool = await databaseService.getPool(req.user?.empresa);
    const reglasSla = await cargarReglasSlaActivas(pool);
    const feriadosSla = await cargarFeriadosActivos(pool, req.user?.empresa);

    // If a clienteId is provided, return only tickets for that solicitante
    if (clienteId) {
      const request = pool.request().input('clienteId', sql.Int, clienteId);
      const { extraWhere } = aplicarFiltrosYPaginacion({ request }, req);
      const rs = await request.query(`
          SELECT ${TICKETS_SELECT_COLUMNAS}
          FROM TICKETS t
          LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
          LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
          LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
          WHERE t.SOLICITANTE_ID = @clienteId${extraWhere}
          ORDER BY t.TICKET_ID DESC
          OFFSET @fOffset ROWS FETCH NEXT @fLimit ROWS ONLY`);
      return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla, feriadosSla) });
    }

    // Admins ven todo
    if (['AD','ADMIN','ADM'].includes(tipoUsuario)) {
      const request = pool.request();
      const { extraWhere } = aplicarFiltrosYPaginacion({ request }, req);
      const rs = await request.query(`
        SELECT ${TICKETS_SELECT_COLUMNAS}
        FROM TICKETS t
        LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
        LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
        LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
        WHERE 1=1${extraWhere}
        ORDER BY t.TICKET_ID DESC
        OFFSET @fOffset ROWS FETCH NEXT @fLimit ROWS ONLY`);
      return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla, feriadosSla) });
    }

    // TI/ST: ver sólo asignados al usuario
    if (['TI','ST'].includes(tipoUsuario)) {
      if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });

      const request = pool.request().input('uid', sql.Int, usuarioId);
      const { extraWhere } = aplicarFiltrosYPaginacion({ request }, req);
      const rs = await request.query(`
          SELECT ${TICKETS_SELECT_COLUMNAS}
          FROM TICKETS t
          LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
          LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
          LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
          WHERE (t.ASIGNADO_A = @uid
             OR EXISTS (
               SELECT 1 FROM TICKET_HISTORIAL h
               WHERE h.TICKET_ID = t.TICKET_ID
                 AND h.TIPO IN ('asignado','transferido','transferido_por','participante')
                 AND h.USER_ID = @uid
             ))${extraWhere}
          ORDER BY t.TICKET_ID DESC
          OFFSET @fOffset ROWS FETCH NEXT @fLimit ROWS ONLY`);
      return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla, feriadosSla) });
    }

    // Resto: sólo sus propios tickets
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });

    const request = pool.request().input('uid', sql.Int, usuarioId);
    const { extraWhere } = aplicarFiltrosYPaginacion({ request }, req);
    const rs = await request.query(`
              SELECT ${TICKETS_SELECT_COLUMNAS}
              FROM TICKETS t
              LEFT JOIN NEUS_USUARIOS su ON su.NEUS_ID = t.SOLICITANTE_ID
              LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
              LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
              WHERE t.SOLICITANTE_ID=@uid${extraWhere}
              ORDER BY t.TICKET_ID DESC
              OFFSET @fOffset ROWS FETCH NEXT @fLimit ROWS ONLY`);

    return res.json({ success: true, data: enriquecerConSla(rs.recordset, reglasSla, feriadosSla) });
  } catch (e) {
    console.error('Error listando tickets:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    
    const header = await pool.request().input('tid', sql.Int, id).query(`
      SELECT 
        t.TICKET_ID as id, t.SOLICITANTE_ID as solicitanteId, t.AREA, t.PRIORIDAD, t.TITULO, t.DESCRIPCION, t.ESTADO,
        t.FECHA_CREACION, t.FECHA_ASIGNACION, t.FECHA_PRIMERA_RESPUESTA, t.FECHA_CIERRE, t.ASIGNADO_A,
        t.CLASIFICACION, t.CATEGORIA, t.SUBCATEGORIA, t.ELEMENTO, t.SERVICIO_AFECTADO, t.IMPACTO, t.URGENCIA, t.NIVEL_ACTUAL,
        t.MOTIVO_ESPERA, t.FECHA_INICIO_ESPERA, t.MINUTOS_TOTAL_ESPERA,
        t.CODIGO_CIERRE, t.VALIDADO_USUARIO, t.REABIERTO_VECES,
        t.SEDE, t.DEPARTAMENTO, t.ACTIVO_AFECTADO, t.SERVICIO_AFECTADO, t.CANAL_ORIGEN, t.CAUSA_RAIZ, t.DIAGNOSTICO, t.ACCIONES_REALIZADAS,
        t.ACTIVO_AFECTADO_ID, t.SERVICIO_AFECTADO_ID,
        t.SLA_RESPUESTA_CUMPLIDO, t.SLA_RESOLUCION_CUMPLIDO, t.MINUTOS_PRIMERA_RESPUESTA, t.MINUTOS_TRABAJADOS,
        t.FECHA_RESOLUCION_PROPUESTA, t.FECHA_VALIDACION, t.ARTICULO_KB_ID,
        au.NEUS_NOMBRES AS ASIGNADO_NOMBRE,
        chat.LC_ID as chatRelacionadoId, chat.LC_ESTADO as chatRelacionadoEstado,
        CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos,
        CASE WHEN t.FECHA_PRIMERA_RESPUESTA IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_PRIMERA_RESPUESTA) ELSE NULL END AS tiempoPrimeraRespuestaMinutos
      FROM TICKETS t
      LEFT JOIN NEUS_USUARIOS au ON au.NEUS_ID = t.ASIGNADO_A
      LEFT JOIN LIVECHAT_CONVERSACIONES chat ON chat.LC_TICKET_ID = t.TICKET_ID
      WHERE t.TICKET_ID=@tid`);
      
    if (header.recordset.length === 0) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

    const reglasSla = await cargarReglasSlaActivas(pool);
    const feriadosSla = await cargarFeriadosActivos(pool, req.user?.empresa);
    const [ticketConSla] = enriquecerConSla(header.recordset, reglasSla, feriadosSla);

    const comentarios = await pool.request().input('tid', sql.Int, id).query(`
      SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
             c.CONTENIDO as contenido, c.CREATED_AT as createdAt
      FROM TICKET_COMENTARIOS c
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
      WHERE c.TICKET_ID=@tid
      ORDER BY c.COM_ID ASC`);

    const hist = await pool.request().input('tid', sql.Int, id).query(`
      SELECT HIST_ID as id, TIPO as tipo, DETALLE as detalle, USER_ID as userId, CREATED_AT as createdAt
      FROM TICKET_HISTORIAL WHERE TICKET_ID=@tid ORDER BY HIST_ID ASC`);

    const sat = await pool.request().input('tid', sql.Int, id).query(`
      SELECT TICKET_ID as ticketId, RATING, COMENTARIO, SUBMIT_AT FROM TICKET_SATISFACCION WHERE TICKET_ID=@tid`);

    const camposPersonalizados = await pool.request().input('tid', sql.Int, id).query(`
      SELECT tcv.TCV_CAMPO_ID as campoId, cp.CP_NOMBRE as nombre, cp.CP_TIPO as tipo, tcv.TCV_VALOR as valor
      FROM TICKET_CAMPOS_VALORES tcv
      JOIN TI_CAMPOS_PERSONALIZADOS cp ON cp.CP_ID = tcv.TCV_CAMPO_ID
      WHERE tcv.TCV_TICKET_ID=@tid ORDER BY cp.CP_ORDEN, cp.CP_NOMBRE`);

    const encuestaAplica = await ticketAmeritaEncuesta(pool, req.user?.empresa, ticketConSla.AREA, ticketConSla.PRIORIDAD);

    return res.json({
      success: true,
      data: {
        ...ticketConSla,
        comentarios: comentarios.recordset,
        historial: hist.recordset,
        satisfaccion: sat.recordset[0] || null,
        camposPersonalizados: camposPersonalizados.recordset,
        encuestaAplica,
      }
    });
  } catch (e) {
    console.error('Error detalle ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Lógica de negocio de creación de ticket, separada del handler HTTP para que
// los distintos puntos de entrada (portal, chatbot, chat en vivo, técnico)
// la reusen sin duplicar código, siguiendo el mismo patrón que escalarTicketInterno.
// 'api' se conserva en la lista solo por compatibilidad con tickets históricos
// creados por la API pública ya retirada.
const CANALES_ORIGEN_VALIDOS = ['portal', 'chatbot', 'chat_en_vivo', 'tecnico', 'api'];

async function crearTicketInterno(pool, {
  solicitanteId, area, titulo, descripcion, prioridad, categoria, asignadoA,
  clasificacion, subcategoria, elemento, sede, departamento, activoAfectado, servicioAfectado,
  activoAfectadoId, servicioAfectadoId,
  impacto, urgencia, prioridadManual: prioridadManualFlag, esAD,
  tenantKey, camposPersonalizados, canalOrigen,
}) {
    area = normalizeArea(area || 'TI');
    const canal = CANALES_ORIGEN_VALIDOS.includes(canalOrigen) ? canalOrigen : 'portal';
    const tituloTrim = (titulo ?? '').toString().trim();

    if (!solicitanteId || !tituloTrim) {
      const missing = [
        !solicitanteId ? 'solicitanteId' : null,
        !tituloTrim ? 'titulo' : null,
      ].filter(Boolean);
      return { ok: false, status: 400, message: `Campos faltantes: ${missing.join(', ')}` };
    }

    const a = area;
    // La prioridad se deriva SIEMPRE de impacto×urgencia cuando ambos vienen.
    // Un AD puede forzarla manualmente enviando prioridad + prioridadManual=true.
    const clasif = (clasificacion || '').toString().toLowerCase();
    // Clasificaciones administrables desde Configuración (ver
    // catalogosTiController.js) — se valida contra la tabla en vez del array
    // fijo legacy de constants/ticketPrioridad.js, que queda solo como
    // fallback si la tabla está vacía o falla.
    let clavesClasifValidas;
    try {
      const clasifRs = await pool.request().query(
        `SELECT CLA_CLAVE as clave FROM TICKET_CLASIFICACIONES WHERE CLA_ACTIVA = 1`
      );
      clavesClasifValidas = clasifRs.recordset.map(r => r.clave);
      if (clavesClasifValidas.length === 0) clavesClasifValidas = ticketPrioridad.CLASIFICACIONES;
    } catch (e) {
      clavesClasifValidas = ticketPrioridad.CLASIFICACIONES;
    }
    const clasifValida = clavesClasifValidas.includes(clasif) ? clasif : null;
    const impactoNorm = (impacto || '').toString().toUpperCase() || null;
    const urgenciaNorm = (urgencia || '').toString().toUpperCase() || null;

    const prioridadManual = !!esAD && !!prioridadManualFlag && !!prioridad;
    let prio;
    if (prioridadManual) {
      prio = prioridad.toString().toUpperCase();
    } else if (impactoNorm && urgenciaNorm) {
      // Matriz administrable desde Configuración (ver catalogosTiController.js)
      // — se consulta la tabla en vez de la MATRIZ fija legacy de
      // constants/ticketPrioridad.js, que queda solo como fallback.
      try {
        const matrizRs = await pool.request()
          .input('imp', sql.NVarChar, impactoNorm)
          .input('urg', sql.NVarChar, urgenciaNorm)
          .query(`SELECT MAT_PRIORIDAD as prioridad FROM TICKET_MATRIZ_PRIORIDAD WHERE MAT_IMPACTO=@imp AND MAT_URGENCIA=@urg`);
        prio = matrizRs.recordset[0]?.prioridad || ticketPrioridad.calcularPrioridad(impactoNorm, urgenciaNorm);
      } catch (e) {
        prio = ticketPrioridad.calcularPrioridad(impactoNorm, urgenciaNorm);
      }
    } else {
      prio = (prioridad || 'P3').toString().toUpperCase();
    }

    const ins = await pool.request()
      .input('sol', sql.Int, solicitanteId)
      .input('area', sql.NVarChar, a)
      .input('prio', sql.NVarChar, prio)
      .input('tit', sql.NVarChar, tituloTrim)
      .input('desc', sql.NVarChar, descripcion || null)
      .input('clasif', sql.NVarChar, clasifValida)
      .input('cat', sql.NVarChar, categoria || null)
      .input('subcat', sql.NVarChar, subcategoria || null)
      .input('elem', sql.NVarChar, elemento || null)
      .input('sede', sql.NVarChar, sede || null)
      .input('depto', sql.NVarChar, departamento || null)
      .input('activo', sql.NVarChar, activoAfectado || null)
      .input('servicio', sql.NVarChar, servicioAfectado || null)
      .input('activoId', sql.Int, activoAfectadoId || null)
      .input('servicioId', sql.Int, servicioAfectadoId || null)
      .input('impacto', sql.NVarChar, impactoNorm)
      .input('urgencia', sql.NVarChar, urgenciaNorm)
      .input('prioManual', sql.Bit, prioridadManual ? 1 : 0)
      .input('canal', sql.NVarChar, canal)
      .query(`INSERT INTO TICKETS
                (SOLICITANTE_ID, AREA, PRIORIDAD, TITULO, DESCRIPCION, ESTADO,
                 CLASIFICACION, CATEGORIA, SUBCATEGORIA, ELEMENTO, SEDE, DEPARTAMENTO, ACTIVO_AFECTADO, SERVICIO_AFECTADO,
                 ACTIVO_AFECTADO_ID, SERVICIO_AFECTADO_ID,
                 IMPACTO, URGENCIA, PRIORIDAD_MANUAL, NIVEL_ACTUAL, CANAL_ORIGEN)
              VALUES (@sol, @area, @prio, @tit, @desc, 'abierto',
                 @clasif, @cat, @subcat, @elem, @sede, @depto, @activo, @servicio,
                 @activoId, @servicioId,
                 @impacto, @urgencia, @prioManual, 1, @canal);
              SELECT SCOPE_IDENTITY() as id;`);

    const ticketId = Number(ins.recordset[0].id);

    // Historial: creado
    await pool.request()
      .input('tid', sql.Int, ticketId)
      .input('uid', sql.Int, solicitanteId)
      .input('det', sql.NVarChar, categoria ? `categoria:${categoria}` : null)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'creado', @det, @uid)`);

    // Si se provee un asignado específico, validar que sea un agente real del pool TI/ST
    let finalAsignado = null;
    if (asignadoA) {
      const aid = Number(asignadoA);
      if (await validarAgentePool(pool, a, aid)) {
        finalAsignado = aid;
      }
    }

    // Si no hay asignación manual válida, aplicar el motor de reglas de asignación
    // (especialidad/categoría/sede/carga real) dentro del Nivel 1. categoria/sede
    // llegan como texto (compatibilidad hacia atrás) — se resuelve el ID del
    // catálogo por nombre; si no matchea, el motor cae a comodín sin romper la creación.
    if (!finalAsignado) {
      let categoriaId = null, sedeId = null;
      if (categoria) {
        const rsCat = await pool.request().input('nombre', sql.NVarChar, categoria).query(`SELECT CAT_ID FROM TICKET_CATEGORIAS WHERE CAT_NOMBRE=@nombre`);
        categoriaId = rsCat.recordset[0]?.CAT_ID ?? null;
      }
      if (sede) {
        const rsSede = await pool.request().input('nombre', sql.NVarChar, sede).query(`SELECT SEDE_ID FROM SEDES WHERE SEDE_NOMBRE=@nombre`);
        sedeId = rsSede.recordset[0]?.SEDE_ID ?? null;
      }
      const seleccion = await reglasAsignacionService.seleccionarTecnico(pool, {
        area: a, nivel: 1, categoriaId, subcategoriaId: null, sedeId, prioridad: prio, tipoCarga: 'ticket',
      });
      finalAsignado = seleccion?.userId ?? null;
    }
    
    if (finalAsignado) {
      await pool.request()
        .input('tid', sql.Int, ticketId)
        .input('asid', sql.Int, finalAsignado)
        .query(`UPDATE TICKETS SET ASIGNADO_A=@asid, ESTADO='asignado', FECHA_ASIGNACION=GETDATE() WHERE TICKET_ID=@tid`);
        
      await pool.request()
        .input('tid', sql.Int, ticketId)
        .input('uid', sql.Int, finalAsignado)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'asignado', @uid)`);
        
      await pool.request().input('uid', sql.Int, finalAsignado).query(`UPDATE TI_STAFF_STATUS SET LAST_ASSIGNED_AT=GETDATE() WHERE USER_ID=@uid`);
      
      // Notificación a asignado (tabla antigua de tickets)
      await pool.request()
        .input('uid', sql.Int, finalAsignado)
        .input('tid', sql.Int, ticketId)
        .input('msg', sql.NVarChar, `Nuevo ticket #${ticketId} asignado`)
        .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_nuevo', @tid, @msg)`);
      // Emitir notificación en tiempo real y persistir en tabla moderna
      try {
        await notificationService.createNotification({
          usuarioId: finalAsignado,
          mensaje: `Nuevo ticket #${ticketId} asignado`,
          tipo: 'ticket_nuevo',
          dataExtra: { ticketId },
          tenantKey,
        });
      } catch (e) {
        console.warn('⚠️ Error creando notificacion via notificationService:', e?.message || e);
      }
    }

    // 🔔 Notificar al solicitante que se ha creado su ticket
    try {
      await notificationService.createNotification({
        usuarioId: solicitanteId,
        mensaje: `Tu ticket #${ticketId} "${tituloTrim}" ha sido creado`,
        tipo: 'ticket',
        dataExtra: {
          ticketId: ticketId,
          action: 'ver_ticket'
        },
        tenantKey,
      });
    } catch (e) {
      console.warn('⚠️ Error enviando notificación de ticket creado:', e?.message || e);
    }

    // 🔔 Notificar al líder del área correspondiente
    try {
      // Obtener el nombre del solicitante
      const rsSolicitante = await pool.request()
        .input('uid', sql.Int, solicitanteId)
        .query(`SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);

      const nombreSolicitante = rsSolicitante.recordset.length > 0
        ? rsSolicitante.recordset[0].NEUS_NOMBRES
        : 'Usuario';

      // Determinar el líder según el área
      let liderAreaId = null;
      if (a === 'ST') {
        liderAreaId = 11; // ID del líder del área ST (Soporte Técnico)
      } else if (a === 'TI' || a === 'DESARROLLO') {
        liderAreaId = 7; // ID del líder del área TI/Desarrollo
      }

      // Si hay un líder definido y no es el mismo solicitante, enviar notificación
      if (liderAreaId && liderAreaId !== solicitanteId) {
        await notificationService.createNotification({
          usuarioId: liderAreaId,
          mensaje: `Nuevo ticket #${ticketId} de ${nombreSolicitante} en área ${a}: "${tituloTrim}"`,
          tipo: 'ticket',
          dataExtra: {
            ticketId: ticketId,
            action: 'ver_ticket'
          },
          tenantKey,
        });
      }
    } catch (e) {
      console.warn('⚠️ Error enviando notificación al líder de área:', e?.message || e);
    }

    const header = await pool.request().input('tid', sql.Int, ticketId).query(`
      SELECT TICKET_ID as id, SOLICITANTE_ID as solicitanteId, AREA as area, PRIORIDAD as prioridad, TITULO as titulo,
             DESCRIPCION as descripcion, ESTADO as estado, FECHA_CREACION as fechaCreacion, FECHA_ASIGNACION as fechaAsignacion,
             FECHA_PRIMERA_RESPUESTA as fechaPrimeraRespuesta, FECHA_CIERRE as fechaCierre, ASIGNADO_A as asignadoA,
             CLASIFICACION as clasificacion, CATEGORIA as categoria, SUBCATEGORIA as subcategoria, ELEMENTO as elemento,
             SEDE as sede, DEPARTAMENTO as departamento, ACTIVO_AFECTADO as activoAfectado,
             ACTIVO_AFECTADO_ID as activoAfectadoId, SERVICIO_AFECTADO_ID as servicioAfectadoId,
             IMPACTO as impacto, URGENCIA as urgencia, NIVEL_ACTUAL as nivelActual, CANAL_ORIGEN as canalOrigen
      FROM TICKETS WHERE TICKET_ID=@tid`);

    // Emitir evento en tiempo real sobre creación de ticket
    try {
      const io = socketService.getIO(tenantKey);
      const ticketData = header.recordset[0];
      if (ticketData) {
        // Emitir al room del ticket y a los usuarios implicados
        io.to(`ticket:${ticketId}`).emit('ticket:created', ticketData);
        // Usar los aliases devueltos por la consulta (asignadoA, solicitanteId)
        if (ticketData.asignadoA) io.to(`user:${ticketData.asignadoA}`).emit('ticket:created', ticketData);
        if (ticketData.solicitanteId) io.to(`user:${ticketData.solicitanteId}`).emit('ticket:created', ticketData);
      }
    } catch (e) {
      // No bloquear la respuesta si socket no está disponible
    }

    if (camposPersonalizados) {
      try {
        const camposPersonalizadosController = require('./camposPersonalizadosController');
        await camposPersonalizadosController.guardarValoresDeTicket(pool, ticketId, camposPersonalizados);
      } catch (e) {
        console.warn('⚠️ Error guardando campos personalizados del ticket:', e?.message || e);
      }
    }

    return { ok: true, status: 201, data: header.recordset[0] };
}

exports.createTicket = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const solicitanteId = req.body.solicitanteId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    const {
      area, titulo, descripcion, prioridad, categoria, asignadoA,
      clasificacion, subcategoria, elemento, sede, departamento, activoAfectado, servicioAfectado,
      activoAfectadoId, servicioAfectadoId,
      impacto, urgencia, camposPersonalizados,
    } = req.body;
    console.warn(`[createTicket] solicitante=${solicitanteId} area=${area} tipo=${tipoUsuario}`);

    if (!['CC','ADM','AD','ADMIN'].includes(tipoUsuario)) {
      console.warn('Creación de ticket sin rol CC/ADM/AD explícito. Cabecera x-user-tipo:', tipoUsuario);
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const esAD = ['AD', 'ADMIN'].includes(tipoUsuario);
    // Si quien crea el ticket es distinto del solicitante, lo está creando un
    // técnico/AD a nombre de otro usuario (canal 'tecnico'); si no, es el propio
    // usuario desde el portal (canal 'portal').
    const canalOrigen = req.user?.id && Number(req.user.id) !== Number(solicitanteId) ? 'tecnico' : 'portal';

    const result = await crearTicketInterno(pool, {
      solicitanteId, area, titulo, descripcion, prioridad, categoria, asignadoA,
      clasificacion, subcategoria, elemento, sede, departamento, activoAfectado, servicioAfectado,
      activoAfectadoId, servicioAfectadoId,
      impacto, urgencia, prioridadManual: req.body.prioridadManual, esAD,
      tenantKey: req.user?.empresa, camposPersonalizados, canalOrigen,
    });

    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'crear', entidadId: String(result.data?.id||''), detalle:{ titulo, area }, ip:req.ip });
    return res.status(result.status).json({ success: true, data: result.data });
  } catch (e) {
    console.error('Error creando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;
    const { titulo, descripcion, prioridad } = req.body;
    
    if (!actorId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID FROM TICKETS WHERE TICKET_ID=@tid`);
    
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    
    const ownerId = Number(rs.recordset[0].SOLICITANTE_ID);
    if (ownerId !== actorId) return res.status(403).json({ success: false, message: 'Solo el solicitante puede editar el ticket' });
    
    await pool.request()
      .input('tid', sql.Int, id)
      .input('tit', sql.NVarChar, (titulo ?? '').toString().trim())
      .input('desc', sql.NVarChar, (descripcion ?? '').toString().trim())
      .input('pri', sql.NVarChar, (prioridad ?? '').toString().toUpperCase())
      .query(`UPDATE TICKETS SET TITULO=CASE WHEN @tit<>'' THEN @tit ELSE TITULO END,
                               DESCRIPCION=CASE WHEN @desc<>'' THEN @desc ELSE DESCRIPCION END,
                               PRIORIDAD=CASE WHEN @pri<>'' THEN @pri ELSE PRIORIDAD END
                     WHERE TICKET_ID=@tid`);
                     
    await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, 'editado').input('uid', sql.Int, actorId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'editado', @det, @uid)`);

    // Emitir actualización en tiempo real
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: id, tipo: 'editado' });
      // También notificar al propietario y al asignado si existen
      const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
      if (rsTicket.recordset.length) {
        const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
        const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
        if (solicitanteId) io.to(`user:${solicitanteId}`).emit('ticket:updated', { ticketId: id, tipo: 'editado' });
        if (asignadoA) io.to(`user:${asignadoA}`).emit('ticket:updated', { ticketId: id, tipo: 'editado' });
      }
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'editar', entidadId: req.params.id, detalle:{ titulo }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error editando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    
    // Permitir que TI y AD eliminen tickets
    if (!['TI','AD'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'Solo TI o AD pueden eliminar tickets' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKET_COMENTARIOS WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKET_HISTORIAL WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKET_SATISFACCION WHERE TICKET_ID=@tid`);
    await pool.request().input('tid', sql.Int, id).query(`DELETE FROM TICKETS WHERE TICKET_ID=@tid`);

    // Emitir evento en tiempo real: ticket eliminado
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:deleted', { ticketId: id });
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'eliminar', entidadId: req.params.id, detalle:null, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getComentarios = async (req, res) => {
  try {
    const { id } = req.params;
    const sinceId = req.query.sinceId ? Number(req.query.sinceId) : null;
    
    const pool = await databaseService.getPool(req.user?.empresa);
    let query = `
      SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
             c.CONTENIDO as contenido, c.CREATED_AT as createdAt
      FROM TICKET_COMENTARIOS c
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
      WHERE c.TICKET_ID=@tid`;
      
    if (sinceId && sinceId > 0) {
      query += ' AND COM_ID > @sid';
    }
    
    query += ' ORDER BY COM_ID ASC';
    const request = pool.request().input('tid', sql.Int, id);
    
    if (sinceId && sinceId > 0) request.input('sid', sql.Int, sinceId);
    const rs = await request.query(query);
    
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando comentarios:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    const contenido = req.body.contenido ?? req.body.comentario ?? req.body.texto;
    
    if (!userId || !contenido) return res.status(400).json({ success: false, message: 'userId y contenido requeridos' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');
    
    const insertRs = await pool.request()
      .input('tid', sql.Int, id)
      .input('uid', sql.Int, userId)
      .input('txt', sql.NVarChar, contenido)
      .query(`
        DECLARE @newId TABLE (ID INT);
        INSERT INTO TICKET_COMENTARIOS (TICKET_ID, USER_ID, CONTENIDO)
        OUTPUT inserted.COM_ID INTO @newId(ID)
        VALUES (@tid, @uid, @txt);
        SELECT ID FROM @newId;
      `);
      
    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, userId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'comentario', @uid)`);

    // Primera respuesta
    const rsHeader = await pool.request().input('tid', sql.Int, id).query(`SELECT FECHA_PRIMERA_RESPUESTA, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    const hdr = rsHeader.recordset[0];
    
    if (!hdr.FECHA_PRIMERA_RESPUESTA && hdr.ASIGNADO_A && Number(hdr.ASIGNADO_A) === Number(userId)) {
      await pool.request().input('tid', sql.Int, id).query(`UPDATE TICKETS SET FECHA_PRIMERA_RESPUESTA=GETDATE(), ESTADO = CASE WHEN ESTADO='abierto' OR ESTADO='asignado' THEN 'en_proceso' ELSE ESTADO END WHERE TICKET_ID=@tid`);
    }

    // Notificaciones
    const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    
    if (rsTicket.recordset.length) {
      const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
      const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
      
      if (Number(userId) !== Number(solicitanteId)) {
        await pool.request()
          .input('uid', sql.Int, solicitanteId)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Nuevo comentario en ticket #${id}`)
          .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_comentario', @tid, @msg)`);
        try {
          await notificationService.createNotification({
            usuarioId: solicitanteId,
            mensaje: `Nuevo comentario en ticket #${id}`,
            tipo: 'ticket_comentario',
            dataExtra: { ticketId: id },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error notificando solicitante via notificationService:', e?.message || e);
        }
      } else if (asignadoA && Number(asignadoA) !== Number(userId)) {
        await pool.request()
          .input('uid', sql.Int, asignadoA)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Nuevo comentario del solicitante en ticket #${id}`)
          .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_comentario', @tid, @msg)`);
        try {
          await notificationService.createNotification({
            usuarioId: asignadoA,
            mensaje: `Nuevo comentario del solicitante en ticket #${id}`,
            tipo: 'ticket_comentario',
            dataExtra: { ticketId: id },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error notificando asignado via notificationService:', e?.message || e);
        }
      }
    }

    const comentarios = await pool.request().input('tid', sql.Int, id).query(`
      SELECT COM_ID as id, USER_ID as userId, CONTENIDO as contenido, CREATED_AT as createdAt
      FROM TICKET_COMENTARIOS WHERE TICKET_ID=@tid ORDER BY COM_ID ASC`);
      
    // Emitir nuevo comentario por socket
    try {
      const lastId = insertRs?.recordset?.[0]?.ID;
      if (lastId) {
        const rsOne = await pool.request()
          .input('tid', sql.Int, id)
          .input('cid', sql.Int, lastId)
          .query(`
            SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
                   c.CONTENIDO as contenido, c.CREATED_AT as createdAt
            FROM TICKET_COMENTARIOS c
            LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
            WHERE c.TICKET_ID=@tid AND c.COM_ID=@cid
          `);
        const msg = rsOne.recordset[0];
        if (msg && socketService.getIO(req.user?.empresa)) {
          const io = socketService.getIO(req.user?.empresa);
          io.to(`ticket:${id}`).emit('ticket:comment', msg);

          // Emitir también a salas de usuario (solicitante/asignado) por fiabilidad
          try {
            const rsTicket = await pool.request().input('tid', sql.Int, id)
              .query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
            if (rsTicket.recordset.length) {
              const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
              const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
              if (solicitanteId) io.to(`user:${solicitanteId}`).emit('ticket:comment', msg);
              if (asignadoA) io.to(`user:${asignadoA}`).emit('ticket:comment', msg);
            }
          } catch (ee) {
            console.warn('⚠️ Error emitiendo ticket:comment a user rooms:', ee?.message || ee);
          }
        }
      }
    } catch (ee) {
      console.warn('⚠️ No se pudo emitir evento de chat:', ee.message);
    }
    
    res.json({ success: true, data: comentarios.recordset });
  } catch (e) {
    console.error('Error comentando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.uploadEvidencia = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const usuarioId = (req.body.usuarioId ?? Number(req.headers['usuarioid'])) || null;

    if (!file) return res.status(400).json({ success: false, message: 'Archivo evidencia requerido (campo: evidencia)' });

    const pool = await databaseService.getPool(req.user?.empresa);

    const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!rsTicket.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

    const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
    const asignadoA = rsTicket.recordset[0].ASIGNADO_A;

    // Construir URL pública. En producción IIS sirve /intranet/Evidencia
    // directo bajo el dominio; en desarrollo el propio Express la sirve
    // (ver server.js) usando la ruta relativa como fallback.
    const EVIDENCIA_PUBLIC_BASE = process.env.EVIDENCIA_PUBLIC_BASE_URL || '/intranet/Evidencia';
    const publicUrl = `${EVIDENCIA_PUBLIC_BASE}/${encodeURIComponent(file.filename)}`;

    // Guardar en historial como evidencia
    await pool.request()
      .input('tid', sql.Int, id)
      .input('det', sql.NVarChar, publicUrl)
      .input('uid', sql.Int, usuarioId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'evidencia', @det, @uid)`);

    // Opcional: notificar al solicitante si quien sube no es el solicitante
    try {
      if (solicitanteId && Number(solicitanteId) !== Number(usuarioId)) {
        await pool.request()
          .input('uid', sql.Int, solicitanteId)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `Nueva evidencia en ticket #${id}`)
          .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_evidencia', @tid, @msg)`);
      }
    } catch (e) {
      console.warn('⚠️ Error creando notificacion de evidencia:', e?.message || e);
    }

    // Emitir evento socket con info de la evidencia
    try {
      const io = socketService.getIO(req.user?.empresa);
      const payload = { ticketId: Number(id), filename: file.filename, url: publicUrl, uploadedBy: usuarioId, createdAt: new Date().toISOString() };
      io.to(`ticket:${id}`).emit('ticket:evidence', payload);
      if (solicitanteId) {
        io.to(`user:${solicitanteId}`).emit('notificacion', { usuarioId: solicitanteId, mensaje: `Nueva evidencia en ticket #${id}`, tipo: 'ticket_evidencia', dataExtra: { ticketId: id, url: publicUrl }, fecha: new Date().toISOString(), leida: 0 });
        try { io.to(`user:${solicitanteId}`).emit('chat:notify', { usuarioId: solicitanteId, mensaje: `Nueva evidencia en ticket #${id}`, tipo: 'ticket_evidencia', dataExtra: { ticketId: id, url: publicUrl }, fecha: new Date().toISOString(), leida: 0 }); } catch(e) {}
      }
      if (asignadoA) {
        io.to(`user:${asignadoA}`).emit('ticket:evidence', payload);
      }
    } catch (e) { /* non-fatal */ }

    return res.json({ success: true, data: { filename: file.filename, url: publicUrl, originalname: file.originalname } });
  } catch (e) {
    console.error('Error subiendo evidencia:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Eliminar una evidencia (historial) por su id
exports.deleteEvidencia = async (req, res) => {
  try {
    const { id, histId } = req.params;
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const usuarioId = Number(req.headers['usuarioid'] || req.body.usuarioId || 0) || null;

    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener la entrada de historial
    const rs = await pool.request().input('hid', sql.Int, histId).input('tid', sql.Int, id)
      .query(`SELECT HIST_ID as id, TIPO as tipo, DETALLE as detalle, USER_ID as userId FROM TICKET_HISTORIAL WHERE HIST_ID=@hid AND TICKET_ID=@tid`);

    if (rs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    const row = rs.recordset[0];
    if ((row.tipo || '').toString().toLowerCase() !== 'evidencia') {
      return res.status(400).json({ success: false, message: 'El historial no es una evidencia' });
    }

    // Permisos: AD/TI/ADM/ADMIN o el autor de la evidencia
    const canManage = ['AD','TI','ADM','ADMIN'].includes(tipoUsuario) || (usuarioId && usuarioId === row.userId);
    if (!canManage) return res.status(403).json({ success: false, message: 'No autorizado para eliminar esta evidencia' });

    // Intentar eliminar el archivo físico siDETALLE parece una URL al directorio de evidencias
    try {
      const detalle = (row.detalle || '').toString();
      if (detalle) {
        // extraer filename
        const filename = detalle.split('/').pop();
        if (filename) {
          const filePath = path.join(EVIDENCIA_DIR, decodeURIComponent(filename));
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {
            console.warn('No se pudo eliminar archivo de evidencia:', filePath, e?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn('Error al procesar borrado de archivo de evidencia:', e?.message || e);
    }

    // Borrar registro de historial
    await pool.request().input('hid', sql.Int, histId).query(`DELETE FROM TICKET_HISTORIAL WHERE HIST_ID=@hid`);

    // Emitir evento de actualización del ticket para refrescar vistas
    try {
      const io = socketService.getIo();
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: Number(id), action: 'evidence_deleted', histId: Number(histId) });
      io.to(`user:${row.userId}`).emit('notificacion', { usuarioId: row.userId, mensaje: `Evidencia eliminada en ticket #${id}`, tipo: 'ticket_evidencia_deleted', dataExtra: { ticketId: Number(id), histId: Number(histId) }, fecha: new Date().toISOString(), leida: 1 });
    } catch (_) {}

    return res.json({ success: true, message: 'Evidencia eliminada' });
  } catch (e) {
    console.error('Error eliminando evidencia:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.transferirTicket = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    const { id } = req.params;
    const rawUsuarioId = req.body.aUsuarioId ?? req.body.nuevoAsignadoId ?? req.body.asignadoA ?? req.body.userId ?? req.body.usuarioId;
    const aUsuarioId = rawUsuarioId != null ? Number(rawUsuarioId) : null;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;

    console.warn(`[transferirTicket] ticket=${id} destino=${aUsuarioId} actor=${actorId} tipo=${tipoUsuario} body=${JSON.stringify(req.body)}`);

    // Permitir transferir a usuarios TI, ST, AD, ADMIN, ADM
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    
    if (!aUsuarioId || !Number.isFinite(aUsuarioId)) return res.status(400).json({ success: false, message: 'aUsuarioId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);

    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT AREA, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!hdr.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    
    const area = hdr.recordset[0].AREA;
    const prevAsignado = hdr.recordset[0].ASIGNADO_A;

    // Validar que el usuario destino existe y está activo
    const rsOk = await pool.request().input('uid', sql.Int, aUsuarioId)
      .query(`SELECT 1 as ok FROM NEUS_USUARIOS WHERE NEUS_ID = @uid AND NEUS_ACTIVO = 1`);

    if (!rsOk.recordset.length) {
      console.warn(`[transferirTicket] destino uid=${aUsuarioId} no está activo`);
      return res.status(400).json({ success: false, message: 'El usuario destino no está disponible' });
    }

    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, aUsuarioId)
      .query(`UPDATE TICKETS SET ASIGNADO_A=@uid, ESTADO='asignado', FECHA_ASIGNACION=GETDATE() WHERE TICKET_ID=@tid`);
      
    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, aUsuarioId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'transferido', @uid)`);
      
    if (prevAsignado) {
      await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, prevAsignado)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'participante', @uid)`);
    }
    
    if (actorId) {
      await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, actorId)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'transferido_por', @uid)`);
    }
    
    await pool.request().input('uid', sql.Int, aUsuarioId).query(`UPDATE TI_STAFF_STATUS SET LAST_ASSIGNED_AT=GETDATE() WHERE USER_ID=@uid`);
    
    // Notificación al nuevo asignado
    await pool.request().input('uid', sql.Int, aUsuarioId).input('tid', sql.Int, id)
      .input('msg', sql.NVarChar, `Ticket #${id} transferido a ti`).query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_transferido', @tid, @msg)`);
    
    // Emitir notificación en tiempo real and persistir en notificacion_campana
    try {
      await notificationService.createNotification({
        usuarioId: aUsuarioId,
        mensaje: `Ticket #${id} transferido a ti`,
        tipo: 'ticket_transferido',
        dataExtra: { ticketId: id, transferidoPor: actorId },
        tenantKey: req.user?.empresa,
      });
    } catch (e) {
      console.warn('⚠️ Error creando notificacion para nuevo asignado via notificationService:', e?.message || e);
    }

    // Emitir notificación en tiempo real y notificar al anterior asignado si aplica
    try {
      // Intentar crear una copia de la notificación para el anterior asignado
      if (prevAsignado && Number(prevAsignado) !== Number(aUsuarioId)) {
        try {
          await pool.request()
            .input('uid', sql.Int, prevAsignado)
            .input('tid', sql.Int, id)
            .input('msg', sql.NVarChar, `Ticket #${id} fue transferido a otro usuario`)
            .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_transferido', @tid, @msg)`);
        } catch (nerr) {
          console.warn('⚠️ Error creando notificación para prevAsignado:', nerr?.message || nerr);
        }
        try {
          await notificationService.createNotification({
            usuarioId: prevAsignado,
            mensaje: `Ticket #${id} fue transferido a otro usuario`,
            tipo: 'ticket_transferido_ajeno',
            dataExtra: { ticketId: id, nuevoAsignado: aUsuarioId },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error creando notificacion para prevAsignado via notificationService:', e?.message || e);
        }
      }

      // Enviar evento socket si está disponible (para notificaciones en tiempo real)
      try {
        const io = socketService.getIO(req.user?.empresa);
        // Notificar al nuevo asignado en su room de usuario
        const _notifNuevo = {
          tipo: 'ticket_transferido',
          ticketId: id,
          mensaje: `Ticket #${id} transferido a ti`
        };
        io.to(`user:${aUsuarioId}`).emit('notificacion', _notifNuevo);
        try { io.to(`user:${aUsuarioId}`).emit('chat:notify', _notifNuevo); } catch(e) {}

        // Notificar al ticket room sobre el cambio de asignación
        io.to(`ticket:${id}`).emit('ticket:updated', {
          ticketId: id,
          nuevoAsignado: aUsuarioId,
          tipo: 'transferido'
        });

        // Notificar al anterior asignado (si existe y es distinto)
        if (prevAsignado && Number(prevAsignado) !== Number(aUsuarioId)) {
          const _notifPrev = {
            tipo: 'ticket_transferido_ajeno',
            ticketId: id,
            mensaje: `Ticket #${id} fue transferido a otro usuario`
          };
          io.to(`user:${prevAsignado}`).emit('notificacion', _notifPrev);
          try { io.to(`user:${prevAsignado}`).emit('chat:notify', _notifPrev); } catch(e) {}
        }
      } catch (se) {
        // socket might not be initialized; no problem
      }
    } catch (e) {
      console.warn('⚠️ Error enviando notificaciones en transferirTicket:', e?.message || e);
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'transferir', entidadId: req.params.id, detalle:{ aUsuarioId }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error transfiriendo ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tickets/:id/espera — sub-estado de espera aditivo (D4 del plan):
// no reemplaza el modelo de ESTADO existente, solo agrega 'en_espera' como
// valor nuevo. El SLA se pausa mientras dure (ver ticketSlaCronController.js
// y enriquecerConSla, que descuentan MINUTOS_TOTAL_ESPERA).
exports.ponerEnEspera = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const { id } = req.params;
    const { motivo } = req.body;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;

    const pool = await databaseService.getPool(req.user?.empresa);

    // Motivos de espera administrables desde Configuración (ver
    // catalogosTiController.js) — se valida contra la tabla en vez del array
    // fijo legacy de constants/ticketMotivosEspera.js, que queda solo como
    // fallback si la tabla está vacía o falla.
    let clavesMotivoValidas;
    try {
      const motivosRs = await pool.request().query(
        `SELECT MOT_CLAVE as clave FROM TICKET_MOTIVOS_ESPERA WHERE MOT_ACTIVA = 1`
      );
      clavesMotivoValidas = motivosRs.recordset.map(r => r.clave);
      if (clavesMotivoValidas.length === 0) clavesMotivoValidas = TICKET_MOTIVOS_ESPERA;
    } catch (e) {
      clavesMotivoValidas = TICKET_MOTIVOS_ESPERA;
    }
    if (!clavesMotivoValidas.includes(motivo)) {
      return res.status(400).json({ success: false, message: `Motivo inválido. Valores permitidos: ${clavesMotivoValidas.join(', ')}` });
    }

    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT ESTADO FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!hdr.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    if (['resuelto', 'cerrado', 'en_espera'].includes(hdr.recordset[0].ESTADO)) {
      return res.status(400).json({ success: false, message: 'El ticket no puede pasar a espera desde su estado actual' });
    }

    await pool.request().input('tid', sql.Int, id).input('motivo', sql.NVarChar, motivo)
      .query(`UPDATE TICKETS SET ESTADO='en_espera', MOTIVO_ESPERA=@motivo, FECHA_INICIO_ESPERA=GETDATE() WHERE TICKET_ID=@tid`);

    await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, `Motivo: ${motivo}`).input('uid', sql.Int, actorId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'en_espera', @det, @uid)`);

    res.json({ success: true, estado: 'en_espera', motivoEspera: motivo });
  } catch (e) {
    console.error('Error poniendo ticket en espera:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tickets/:id/salir-espera — vuelve a 'en_proceso' y acumula el
// tiempo pausado en MINUTOS_TOTAL_ESPERA (para que el cálculo de SLA lo descuente).
exports.salirDeEspera = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const { id } = req.params;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;

    const pool = await databaseService.getPool(req.user?.empresa);
    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT ESTADO FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!hdr.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    if (hdr.recordset[0].ESTADO !== 'en_espera') {
      return res.status(400).json({ success: false, message: 'El ticket no está en espera' });
    }

    await pool.request().input('tid', sql.Int, id)
      .query(`UPDATE TICKETS SET
                ESTADO='en_proceso',
                MINUTOS_TOTAL_ESPERA = MINUTOS_TOTAL_ESPERA + DATEDIFF(MINUTE, FECHA_INICIO_ESPERA, GETDATE()),
                MOTIVO_ESPERA = NULL,
                FECHA_INICIO_ESPERA = NULL
              WHERE TICKET_ID=@tid`);

    await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, actorId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'salio_espera', @uid)`);

    res.json({ success: true, estado: 'en_proceso' });
  } catch (e) {
    console.error('Error saliendo de espera:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    const { id } = req.params;
    const { estado } = req.body;
    const nota = req.body.nota ?? req.body.detalle ?? req.body.descripcion ?? null;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;
    const nuevo = String(estado || '').toLowerCase();
    // 'resuelto' se maneja vía POST /:id/resolver (captura diagnóstico/acciones/causa raíz
    // estructurados); 'reabierto' se dispara vía POST /:id/validar cuando el usuario rechaza
    // la solución. Este endpoint solo cubre las transiciones simples sin datos adicionales.
    const validos = ['abierto','asignado','en_proceso','cerrado','reabierto'];

    if (!validos.includes(nuevo)) return res.status(400).json({ success: false, message: 'Estado inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);

    // Solo el solicitante puede cerrar o reabrir el ticket
    if (nuevo === 'cerrado' || nuevo === 'reabierto') {
      if (!actorId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });

      const rsOwn = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID FROM TICKETS WHERE TICKET_ID=@tid`);
      if (!rsOwn.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

      const ownerId = Number(rsOwn.recordset[0].SOLICITANTE_ID);
      if (ownerId !== actorId) {
        return res.status(403).json({ success: false, message: `Solo el solicitante puede ${nuevo === 'cerrado' ? 'cerrar' : 'reabrir'} el ticket` });
      }
    }

    let setExtra = '';
    if (nuevo === 'cerrado') setExtra = ', FECHA_CIERRE = COALESCE(FECHA_CIERRE, GETDATE())';
    if (nuevo === 'reabierto') setExtra = ", FECHA_CIERRE = NULL, VALIDADO_USUARIO = NULL, REABIERTO_VECES = REABIERTO_VECES + 1";

    await pool.request().input('tid', sql.Int, id).input('est', sql.NVarChar, nuevo)
      .query(`UPDATE TICKETS SET ESTADO=@est ${setExtra} WHERE TICKET_ID=@tid`);
      
    // Insert historial for estado change (with actor if available)
    if (actorId) {
      await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, nuevo).input('uid', sql.Int, actorId)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'estado', @det, @uid)`);
    } else {
      await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, nuevo)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE) VALUES (@tid, 'estado', @det)`);
    }

    // If a resolution note was provided, save it as a resolucion entry in historial
    if (nota) {
      try {
        if (actorId) {
          await pool.request().input('tid', sql.Int, id).input('det2', sql.NVarChar, nota).input('uid2', sql.Int, actorId)
            .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'resolucion', @det2, @uid2)`);
        } else {
          await pool.request().input('tid', sql.Int, id).input('det2', sql.NVarChar, nota)
            .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE) VALUES (@tid, 'resolucion', @det2)`);
        }
      } catch (e) {
        console.warn('⚠️ Error guardando nota de resolución en historial:', e?.message || e);
      }
    }

    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT ESTADO FROM TICKETS WHERE TICKET_ID=@tid`);
    const estadoActual = hdr.recordset[0]?.ESTADO;

    // Notificar al asignado si el solicitante reabrió el ticket
    if (estadoActual === 'reabierto') {
      const rsAsig = await pool.request().input('tid', sql.Int, id).query(`SELECT ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
      const asignadoId = rsAsig.recordset[0]?.ASIGNADO_A;
      if (asignadoId) {
        const insertRs = await pool.request().input('uid', sql.Int, asignadoId)
          .input('tid', sql.Int, id)
          .input('msg', sql.NVarChar, `El ticket #${id} fue reabierto por el solicitante`)
          .query(`
            DECLARE @newId TABLE (ID INT);
            INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE)
            OUTPUT inserted.NOTI_ID INTO @newId(ID)
            VALUES (@uid, 'ticket_estado', @tid, @msg);
            SELECT ID FROM @newId;
          `);
        try {
          const newId = insertRs.recordset?.[0]?.ID || null;
          const payload = { id: newId ? Number(newId) : null, usuarioId: asignadoId, mensaje: `El ticket #${id} fue reabierto por el solicitante`, tipo: 'ticket_estado', leida: 0, fecha: new Date().toISOString(), dataExtra: { ticketId: id, nota: nota || null } };
          const io = socketService.getIO(req.user?.empresa);
          io.to(`user:${asignadoId}`).emit('notificacion', payload);
          try { io.to(`user:${asignadoId}`).emit('chat:notify', payload); } catch(e) {}
        } catch (emitErr) { /* non-fatal */ }
      }
    }
    // Emitir cambio de estado en tiempo real
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: id, nuevoEstado: estadoActual });
      // Notificar a solicitante y asignado
      const rsTicket = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
      if (rsTicket.recordset.length) {
        const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
        const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
        if (solicitanteId) io.to(`user:${solicitanteId}`).emit('ticket:updated', { ticketId: id, nuevoEstado: estadoActual });
        if (asignadoA) io.to(`user:${asignadoA}`).emit('ticket:updated', { ticketId: id, nuevoEstado: estadoActual });
      }
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'cambiar-estado', entidadId: req.params.id, detalle:{ estado: nuevo }, ip:req.ip });
    res.json({ success: true, estado: estadoActual });
  } catch (e) {
    console.error('Error cambiando estado de ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.registrarSatisfaccion = async (req, res) => {
  try {
    const { id } = req.params;
    const solicitanteId = req.body.solicitanteId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    const rating = req.body.rating ?? req.body.calificacion ?? req.body.puntaje;
    const { comentario } = req.body;
    
    if (!solicitanteId || !rating) return res.status(400).json({ success: false, message: 'solicitanteId y rating requeridos' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rt = Number(rating);
    
    if (!(rt >= 1 && rt <= 5)) return res.status(400).json({ success: false, message: 'rating debe ser 1..5' });

    // Validar que el solicitante sea dueño del ticket
    const rs = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, VALIDADO_USUARIO FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

    if (Number(rs.recordset[0].SOLICITANTE_ID) !== Number(solicitanteId)) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede contestar la encuesta' });
    }

    if (rs.recordset[0].VALIDADO_USUARIO !== true) {
      return res.status(400).json({ success: false, message: 'Primero debes confirmar si la solución funcionó (POST /:id/validar)' });
    }

    await pool.request().input('tid', sql.Int, id).input('r', sql.Int, rt).input('c', sql.NVarChar, comentario || null)
      .query(`
MERGE TICKET_SATISFACCION AS tgt
USING (SELECT @tid AS TICKET_ID) AS src
ON (tgt.TICKET_ID = src.TICKET_ID)
WHEN MATCHED THEN UPDATE SET RATING=@r, COMENTARIO=@c, SUBMIT_AT=GETDATE()
WHEN NOT MATCHED THEN INSERT (TICKET_ID, RATING, COMENTARIO) VALUES (@tid, @r, @c);
      `);
      
    await cerrarTicketConSnapshot(pool, Number(id), req.user?.empresa);
    await pool.request().input('tid', sql.Int, id).query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO) VALUES (@tid, 'encuesta')`);
    
    // Notificar al asignado
    const rsAsig = await pool.request().input('tid', sql.Int, id).query(`SELECT ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
    if (rsAsig.recordset.length && rsAsig.recordset[0].ASIGNADO_A) {
      const asignadoId = rsAsig.recordset[0].ASIGNADO_A;
      const insertRs = await pool.request().input('uid', sql.Int, asignadoId)
        .input('tid', sql.Int, id)
        .input('msg', sql.NVarChar, `Ticket #${id} fue cerrado por el solicitante`)
        .query(`
          DECLARE @newId TABLE (ID INT);
          INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE)
          OUTPUT inserted.NOTI_ID INTO @newId(ID)
          VALUES (@uid, 'ticket_estado', @tid, @msg);
          SELECT ID FROM @newId;
        `);
      try {
        const newId = insertRs.recordset?.[0]?.ID || null;
        const payload = { id: newId ? Number(newId) : null, usuarioId: asignadoId, mensaje: `Ticket #${id} fue cerrado por el solicitante`, tipo: 'ticket_estado', leida: 0, fecha: new Date().toISOString(), dataExtra: { ticketId: id } };
        const io = socketService.getIO(req.user?.empresa);
        io.to(`user:${asignadoId}`).emit('notificacion', payload);
        try { io.to(`user:${asignadoId}`).emit('chat:notify', payload); } catch(e) {}
      } catch (emitErr) { /* non-fatal */ }
    }

    // Emitir evento en tiempo real: ticket cerrado / encuesta respondida
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: id, nuevoEstado: 'cerrado', tipo: 'satisfaccion' });
      if (rsAsig.recordset.length && rsAsig.recordset[0].ASIGNADO_A) {
        io.to(`user:${rsAsig.recordset[0].ASIGNADO_A}`).emit('ticket:updated', { ticketId: id, nuevoEstado: 'cerrado' });
      }
    } catch (e) {}

    res.json({ success: true, message: 'Gracias por tu respuesta' });
  } catch (e) {
    console.error('Error guardando satisfacción:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Escalamiento N1→N2→N3 ────────────────────────────────────────────────
// Lógica de negocio separada del handler HTTP para que el cron de SLA
// (ticketSlaCronController.js) pueda invocarla directamente sin simular
// un req/res de Express.
async function escalarTicketInterno(pool, { ticketId, nivelDestino, motivo, actorId, tenantKey, tipo = 'manual', proveedorId = null }) {
  const hdr = await pool.request().input('tid', sql.Int, ticketId)
    .query(`SELECT AREA, ASIGNADO_A, NIVEL_ACTUAL, ESTADO, SOLICITANTE_ID, CATEGORIA, SEDE, PRIORIDAD FROM TICKETS WHERE TICKET_ID=@tid`);
  if (!hdr.recordset.length) return { ok: false, message: 'Ticket no encontrado' };

  const t = hdr.recordset[0];
  if (['cerrado', 'resuelto'].includes(t.ESTADO)) {
    return { ok: false, message: 'No se puede escalar un ticket resuelto o cerrado' };
  }

  const nivelOrigen = t.NIVEL_ACTUAL || 1;
  const destino = nivelDestino || Math.min(nivelOrigen + 1, 3);
  if (destino <= nivelOrigen) return { ok: false, message: 'El nivel destino debe ser mayor al actual' };

  const prevAsignado = t.ASIGNADO_A;
  // Si no hay agente disponible en el nivel destino, el ticket escala igual
  // y queda sin asignar — se notifica a todo el pool de ese nivel/área para
  // que alguien lo tome, en vez de bloquear el escalamiento.
  let categoriaId = null, sedeId = null;
  if (t.CATEGORIA) {
    const rsCat = await pool.request().input('nombre', sql.NVarChar, t.CATEGORIA).query(`SELECT CAT_ID FROM TICKET_CATEGORIAS WHERE CAT_NOMBRE=@nombre`);
    categoriaId = rsCat.recordset[0]?.CAT_ID ?? null;
  }
  if (t.SEDE) {
    const rsSede = await pool.request().input('nombre', sql.NVarChar, t.SEDE).query(`SELECT SEDE_ID FROM SEDES WHERE SEDE_NOMBRE=@nombre`);
    sedeId = rsSede.recordset[0]?.SEDE_ID ?? null;
  }
  const seleccionEscalamiento = await reglasAsignacionService.seleccionarTecnico(pool, {
    area: t.AREA, nivel: destino, categoriaId, subcategoriaId: null, sedeId, prioridad: t.PRIORIDAD, tipoCarga: 'ticket',
  });
  const nuevoAsignado = seleccionEscalamiento?.userId ?? null;

  await pool.request()
    .input('tid', sql.Int, ticketId)
    .input('nivel', sql.TinyInt, destino)
    .input('asid', sql.Int, nuevoAsignado)
    .query(`UPDATE TICKETS SET NIVEL_ACTUAL=@nivel, ASIGNADO_A=@asid,
              ESTADO = CASE WHEN @asid IS NOT NULL THEN 'asignado' ELSE ESTADO END,
              FECHA_ASIGNACION = CASE WHEN @asid IS NOT NULL THEN GETDATE() ELSE FECHA_ASIGNACION END
            WHERE TICKET_ID=@tid`);

  await pool.request()
    .input('tid', sql.Int, ticketId)
    .input('no', sql.TinyInt, nivelOrigen)
    .input('nd', sql.TinyInt, destino)
    .input('tipo', sql.NVarChar, tipo)
    .input('motivo', sql.NVarChar, motivo || null)
    .input('prev', sql.Int, prevAsignado)
    .input('nuevo', sql.Int, nuevoAsignado)
    .input('actor', sql.Int, actorId || null)
    .input('provId', sql.Int, proveedorId || null)
    .query(`INSERT INTO TICKET_ESCALAMIENTOS
              (TICKET_ID, NIVEL_ORIGEN, NIVEL_DESTINO, TIPO, MOTIVO, ASIGNADO_ANTERIOR, ASIGNADO_NUEVO, ACTOR_ID, PROVEEDOR_ID)
            VALUES (@tid, @no, @nd, @tipo, @motivo, @prev, @nuevo, @actor, @provId)`);

  let proveedorNombre = null;
  if (proveedorId) {
    const rsProv = await pool.request().input('id', sql.Int, proveedorId).query(`SELECT PROV_NOMBRE FROM TI_PROVEEDORES WHERE PROV_ID=@id`);
    proveedorNombre = rsProv.recordset[0]?.PROV_NOMBRE ?? null;
  }

  await pool.request()
    .input('tid', sql.Int, ticketId)
    .input('det', sql.NVarChar, `Escalado de N${nivelOrigen} a N${destino}${motivo ? ` — ${motivo}` : ''} (${tipo})${proveedorNombre ? ` — Proveedor: ${proveedorNombre}` : ''}`)
    .input('uid', sql.Int, actorId || null)
    .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'escalado', @det, @uid)`);

  if (nuevoAsignado) {
    await pool.request().input('uid', sql.Int, nuevoAsignado).query(`UPDATE TI_STAFF_STATUS SET LAST_ASSIGNED_AT=GETDATE() WHERE USER_ID=@uid`);
  }

  // Notificar: al nuevo agente si hay uno; si no, a todo el pool disponible del nivel/área destino
  const mensaje = `Ticket #${ticketId} escalado a Nivel ${destino}${tipo === 'automatico' ? ' (SLA vencido)' : ''}`;
  try {
    if (nuevoAsignado) {
      await notificationService.createNotification({
        usuarioId: nuevoAsignado, mensaje, tipo: 'ticket_escalado',
        dataExtra: { ticketId, nivel: destino }, tenantKey,
      });
    } else {
      const pool2 = pool;
      const rsPool = await pool2.request().input('area', sql.NVarChar, normalizeArea(t.AREA)).input('nivel', sql.TinyInt, destino)
        .query(`SELECT u.NEUS_ID as userId FROM NEUS_USUARIOS u
                INNER JOIN TI_STAFF_STATUS s ON s.USER_ID = u.NEUS_ID
                WHERE u.NEUS_ACTIVO = 1 AND s.AREA = @area AND s.NIVEL = @nivel`);
      for (const row of rsPool.recordset) {
        await notificationService.createNotification({
          usuarioId: row.userId, mensaje: `${mensaje} — sin agente disponible, requiere atención`,
          tipo: 'ticket_escalado', dataExtra: { ticketId, nivel: destino }, tenantKey,
        });
      }
    }
    if (t.SOLICITANTE_ID) {
      await notificationService.createNotification({
        usuarioId: t.SOLICITANTE_ID, mensaje: `Tu ticket #${ticketId} fue escalado a Nivel ${destino}`,
        tipo: 'ticket_escalado', dataExtra: { ticketId, nivel: destino }, tenantKey,
      });
    }
  } catch (e) {
    console.warn('⚠️ Error notificando escalamiento:', e?.message || e);
  }

  try {
    const io = socketService.getIO(tenantKey);
    io.to(`ticket:${ticketId}`).emit('ticket:updated', { ticketId, nivelActual: destino, tipo: 'escalado' });
    if (nuevoAsignado) io.to(`user:${nuevoAsignado}`).emit('ticket:updated', { ticketId, nivelActual: destino });
    if (prevAsignado) io.to(`user:${prevAsignado}`).emit('ticket:updated', { ticketId, nivelActual: destino });
  } catch (e) {}

  await logAudit(pool, {
    userId: actorId || null, userName: null, modulo: 'tickets', accion: 'escalar',
    entidadId: String(ticketId), detalle: { nivelOrigen, nivelDestino: destino, tipo, motivo }, ip: null,
  });

  return { ok: true, nivelActual: destino, asignadoA: nuevoAsignado, proveedorId: proveedorId || null, proveedorNombre };
}

// POST /api/tickets/:id/escalar
exports.escalarTicket = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const { id } = req.params;
    const { nivelDestino, motivo, proveedorId } = req.body;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await escalarTicketInterno(pool, {
      ticketId: Number(id),
      nivelDestino: nivelDestino ? Number(nivelDestino) : null,
      motivo, actorId, tenantKey: req.user?.empresa, tipo: 'manual',
      proveedorId: proveedorId ? Number(proveedorId) : null,
    });

    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    res.json({ success: true, nivelActual: result.nivelActual, asignadoA: result.asignadoA, proveedorId: result.proveedorId, proveedorNombre: result.proveedorNombre });
  } catch (e) {
    console.error('Error escalando ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Resolución estructurada ──────────────────────────────────────────────
// POST /api/tickets/:id/resolver
exports.resolverTicket = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['TI','ST','AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const { id } = req.params;
    const { diagnostico, accionesRealizadas, causaRaiz, codigoCierre, articuloKbId, nuevoArticuloKb } = req.body;
    const actorId = Number(req.headers['usuarioid'] || req.body.actorId || 0) || null;

    if (!diagnostico || !accionesRealizadas) {
      return res.status(400).json({ success: false, message: 'diagnostico y accionesRealizadas son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // Códigos de cierre administrables desde Configuración (ver
    // catalogosTiController.js) — se valida contra la tabla en vez del array
    // fijo legacy de constants/ticketCierre.js.
    const codigosRs = await pool.request().query(
      `SELECT COD_NOMBRE as nombre FROM TICKET_CODIGOS_CIERRE WHERE COD_ACTIVA = 1 ORDER BY COD_ORDEN, COD_NOMBRE`
    );
    const codigosValidos = codigosRs.recordset.map(r => r.nombre);
    const codigo = codigoCierre && codigosValidos.includes(codigoCierre)
      ? codigoCierre
      : (codigosValidos[0] || TICKET_CODIGOS_CIERRE[0]);
    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ESTADO FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!hdr.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
    if (['cerrado'].includes(hdr.recordset[0].ESTADO)) {
      return res.status(400).json({ success: false, message: 'El ticket ya está cerrado' });
    }

    // Vincular un artículo existente (articuloKbId) o crear uno nuevo desde
    // el propio cierre (nuevoArticuloKb) — mutuamente excluyentes; si llega
    // nuevoArticuloKb, se crea primero y se usa su ID resultante.
    let artId = Number(articuloKbId) || null;
    if (!artId && nuevoArticuloKb?.titulo && nuevoArticuloKb?.contenido) {
      const kbController = require('./kbController');
      const kbResult = await kbController.crearArticuloInterno(pool, {
        titulo: nuevoArticuloKb.titulo,
        contenido: nuevoArticuloKb.contenido,
        categoria: nuevoArticuloKb.categoria,
        tipo: nuevoArticuloKb.tipo,
        autorId: req.user?.id || actorId,
        autorNombre: req.user?.nombre || null,
        ip: req.ip,
      });
      if (kbResult.ok) artId = kbResult.data.id;
    }

    await pool.request()
      .input('tid', sql.Int, id)
      .input('diag', sql.NVarChar, diagnostico)
      .input('acc', sql.NVarChar, accionesRealizadas)
      .input('causa', sql.NVarChar, causaRaiz || null)
      .input('cod', sql.NVarChar, codigo)
      .input('art', sql.Int, artId)
      .query(`UPDATE TICKETS SET
                ESTADO = 'resuelto',
                DIAGNOSTICO = @diag,
                ACCIONES_REALIZADAS = @acc,
                CAUSA_RAIZ = @causa,
                CODIGO_CIERRE = @cod,
                ARTICULO_KB_ID = @art,
                FECHA_RESOLUCION_PROPUESTA = GETDATE(),
                VALIDADO_USUARIO = NULL
              WHERE TICKET_ID=@tid`);

    const detalle = `Diagnóstico: ${diagnostico}\nAcciones: ${accionesRealizadas}${causaRaiz ? `\nCausa raíz: ${causaRaiz}` : ''}${artId ? `\nArtículo KB: #${artId}` : ''}`;
    await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, detalle).input('uid', sql.Int, actorId)
      .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'resolucion', @det, @uid)`);

    const ownerId = hdr.recordset[0].SOLICITANTE_ID;
    try {
      await notificationService.createNotification({
        usuarioId: ownerId,
        mensaje: `Tu ticket #${id} fue resuelto. Confirma si la solución funcionó.`,
        tipo: 'ticket_resuelto',
        dataExtra: { ticketId: Number(id), action: 'validar_ticket' },
        tenantKey: req.user?.empresa,
      });
    } catch (e) {
      console.warn('⚠️ Error notificando resolución:', e?.message || e);
    }

    try {
      const io = socketService.getIO(req.user?.empresa);
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: Number(id), nuevoEstado: 'resuelto' });
      if (ownerId) io.to(`user:${ownerId}`).emit('ticket:updated', { ticketId: Number(id), nuevoEstado: 'resuelto' });
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'resolver', entidadId: String(id), detalle:{ codigoCierre: codigo }, ip:req.ip });
    res.json({ success: true, estado: 'resuelto' });
  } catch (e) {
    console.error('Error resolviendo ticket:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Validación de la solución por el solicitante ─────────────────────────
// POST /api/tickets/:id/validar
exports.validarResolucion = async (req, res) => {
  try {
    const { id } = req.params;
    const solicitanteId = req.body.solicitanteId ?? req.body.usuarioId ?? Number(req.headers['usuarioid']);
    const { confirma, comentario } = req.body;

    if (!solicitanteId || typeof confirma !== 'boolean') {
      return res.status(400).json({ success: false, message: 'solicitanteId y confirma (boolean) son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const hdr = await pool.request().input('tid', sql.Int, id).query(`SELECT SOLICITANTE_ID, ESTADO, ASIGNADO_A, AREA, PRIORIDAD FROM TICKETS WHERE TICKET_ID=@tid`);
    if (!hdr.recordset.length) return res.status(404).json({ success: false, message: 'Ticket no encontrado' });

    const t = hdr.recordset[0];
    if (Number(t.SOLICITANTE_ID) !== Number(solicitanteId)) {
      return res.status(403).json({ success: false, message: 'Solo el solicitante puede validar la solución' });
    }
    if (t.ESTADO !== 'resuelto') {
      return res.status(400).json({ success: false, message: 'El ticket debe estar en estado resuelto para validarse' });
    }

    if (confirma) {
      await pool.request().input('tid', sql.Int, id)
        .query(`UPDATE TICKETS SET VALIDADO_USUARIO = 1, FECHA_VALIDACION = GETDATE() WHERE TICKET_ID=@tid`);
      await pool.request().input('tid', sql.Int, id).input('uid', sql.Int, solicitanteId)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'validado', @uid)`);

      // Si el ticket no amerita encuesta (Configuración > Encuestas), nunca se le
      // muestra el panel de calificación al usuario — cerrarlo aquí mismo, o
      // quedaría 'resuelto' para siempre sin pasar nunca por registrarSatisfaccion.
      const amerita = await ticketAmeritaEncuesta(pool, req.user?.empresa, t.AREA, t.PRIORIDAD);
      if (!amerita) {
        await cerrarTicketConSnapshot(pool, Number(id), req.user?.empresa);
        await pool.request().input('tid', sql.Int, id).query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE) VALUES (@tid, 'cerrado', 'Cerrado automáticamente: no amerita encuesta')`);
      }
    } else {
      await pool.request().input('tid', sql.Int, id)
        .query(`UPDATE TICKETS SET
                  VALIDADO_USUARIO = 0, FECHA_VALIDACION = GETDATE(), ESTADO = 'reabierto',
                  REABIERTO_VECES = REABIERTO_VECES + 1, FECHA_CIERRE = NULL,
                  FECHA_RESOLUCION_PROPUESTA = NULL
                WHERE TICKET_ID=@tid`);
      await pool.request().input('tid', sql.Int, id).input('det', sql.NVarChar, comentario || null).input('uid', sql.Int, solicitanteId)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'reabierto', @det, @uid)`);

      if (t.ASIGNADO_A) {
        try {
          await notificationService.createNotification({
            usuarioId: t.ASIGNADO_A,
            mensaje: `El solicitante indicó que el ticket #${id} no quedó resuelto`,
            tipo: 'ticket_reabierto',
            dataExtra: { ticketId: Number(id) },
            tenantKey: req.user?.empresa,
          });
        } catch (e) {
          console.warn('⚠️ Error notificando reapertura:', e?.message || e);
        }
      }
    }

    try {
      const io = socketService.getIO(req.user?.empresa);
      const nuevoEstado = confirma ? 'resuelto' : 'reabierto';
      io.to(`ticket:${id}`).emit('ticket:updated', { ticketId: Number(id), nuevoEstado, validadoUsuario: confirma });
      if (t.ASIGNADO_A) io.to(`user:${t.ASIGNADO_A}`).emit('ticket:updated', { ticketId: Number(id), nuevoEstado });
    } catch (e) {}

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'validar', entidadId: String(id), detalle:{ confirma }, ip:req.ip });
    res.json({ success: true, confirma });
  } catch (e) {
    console.error('Error validando resolución:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getCategorias = async (req, res) => {
  res.json({ success: true, data: TICKET_CATEGORIAS });
};

exports.getCodigosCierre = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(
      `SELECT COD_NOMBRE as nombre FROM TICKET_CODIGOS_CIERRE WHERE COD_ACTIVA = 1 ORDER BY COD_ORDEN, COD_NOMBRE`
    );
    const data = rs.recordset.map(r => r.nombre);
    return res.json({ success: true, data: data.length ? data : TICKET_CODIGOS_CIERRE });
  } catch (e) {
    console.error('Error obteniendo códigos de cierre, usando fallback fijo:', e.message);
    return res.json({ success: true, data: TICKET_CODIGOS_CIERRE });
  }
};

// ── Grupos de soporte (nombre descriptivo para AREA+NIVEL) ───────────────
exports.getGruposSoporte = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`SELECT GRUPO_ID as id, AREA as area, NIVEL as nivel, NOMBRE as nombre FROM GRUPOS_SOPORTE ORDER BY AREA, NIVEL`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando grupos de soporte:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createGrupoSoporte = async (req, res) => {
  try {
    const { area, nivel, nombre } = req.body;
    if (!area || !nivel || !nombre) return res.status(400).json({ success: false, message: 'area, nivel y nombre son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('area', sql.NVarChar, area)
      .input('nivel', sql.TinyInt, nivel)
      .input('nombre', sql.NVarChar, nombre)
      .query(`INSERT INTO GRUPOS_SOPORTE (AREA, NIVEL, NOMBRE) VALUES (@area, @nivel, @nombre); SELECT SCOPE_IDENTITY() as id;`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'crear-grupo-soporte', entidadId: String(ins.recordset[0].id), detalle:{ area, nivel, nombre }, ip:req.ip });
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), area, nivel, nombre } });
  } catch (e) {
    console.error('Error creando grupo de soporte:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.actualizarGrupoSoporte = async (req, res) => {
  try {
    const { id } = req.params;
    const { area, nivel, nombre } = req.body;
    if (!area || !nivel || !nombre) return res.status(400).json({ success: false, message: 'area, nivel y nombre son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('area', sql.NVarChar, area)
      .input('nivel', sql.TinyInt, nivel)
      .input('nombre', sql.NVarChar, nombre)
      .query(`UPDATE GRUPOS_SOPORTE SET AREA=@area, NIVEL=@nivel, NOMBRE=@nombre WHERE GRUPO_ID=@id`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'actualizar-grupo-soporte', entidadId: String(id), detalle:{ area, nivel, nombre }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando grupo de soporte:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.eliminarGrupoSoporte = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM GRUPOS_SOPORTE WHERE GRUPO_ID=@id`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'eliminar-grupo-soporte', entidadId: String(id), detalle:{}, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando grupo de soporte:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Wrapper fino sobre tecnicosController.getTecnicos (superset con perfil rico) —
// se mantiene por compatibilidad con callers existentes (ej. selector de
// técnico en TicketsPage) que solo necesitan userId/nombre/area/disponible/nivel/grupoNombre.
exports.getStaffTI = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        u.NEUS_ID as userId,
        u.NEUS_NOMBRES as nombre,
        COALESCE(s.AREA, CASE WHEN u.NEUS_TIPOUSUARIO IN ('TI','ST') THEN u.NEUS_TIPOUSUARIO ELSE 'TI' END) as area,
        COALESCE(s.DISPONIBLE,1) as disponible,
        COALESCE(s.NIVEL,1) as nivel,
        g.NOMBRE as grupoNombre,
        s.LAST_ASSIGNED_AT as lastAssignedAt
      FROM NEUS_USUARIOS u
      LEFT JOIN TI_STAFF_STATUS s ON s.USER_ID=u.NEUS_ID
      LEFT JOIN GRUPOS_SOPORTE g ON g.AREA = COALESCE(s.AREA, CASE WHEN u.NEUS_TIPOUSUARIO IN ('TI','ST') THEN u.NEUS_TIPOUSUARIO ELSE 'TI' END)
                                 AND g.NIVEL = COALESCE(s.NIVEL,1)
      WHERE u.NEUS_ACTIVO=1
        AND (
          u.NEUS_TIPOUSUARIO IN ('TI','ST')
          OR EXISTS (
            SELECT 1 FROM TI_STAFF_STATUS x
            WHERE x.USER_ID = u.NEUS_ID AND x.AREA IN ('TI','ST')
          )
        )
      ORDER BY u.NEUS_NOMBRES`);

    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando staff TI:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Solo AD puede reasignar área/nivel de un agente (ruta protegida con verificarRol(['AD'])).
// disponible sí lo puede tocar el propio agente vía otra ruta sin esa restricción.
// NOTA: NO delega a tecnicosController.actualizarPerfilTecnico — ese endpoint hace un
// reemplazo total (DELETE+INSERT) de especialidades/categorías/sedes permitidas, y este
// endpoint legado solo conoce area/disponible/nivel. Delegar borraría esas listas.
exports.actualizarStaffTI = async (req, res) => {
  try {
    const userId = req.body.userId ?? req.body.usuarioId ?? req.body.uid ?? Number(req.headers['usuarioid']);
    const { area, disponible, nivel } = req.body;

    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const a = normalizeArea(area || 'TI');
    const disp = disponible === undefined ? 1 : (disponible ? 1 : 0);
    const niv = [1, 2, 3].includes(Number(nivel)) ? Number(nivel) : 1;

    await pool.request()
      .input('uid', sql.Int, userId)
      .input('area', sql.NVarChar, a)
      .input('disp', sql.Bit, disp)
      .input('nivel', sql.TinyInt, niv)
      .query(`
MERGE TI_STAFF_STATUS AS tgt
USING (SELECT @uid AS USER_ID) AS src
ON (tgt.USER_ID = src.USER_ID)
WHEN MATCHED THEN UPDATE SET AREA=@area, DISPONIBLE=@disp, NIVEL=@nivel
WHEN NOT MATCHED THEN INSERT(USER_ID, AREA, DISPONIBLE, NIVEL) VALUES(@uid, @area, @disp, @nivel);
      `);

    // Auto-sync con el grupo de la campaña de chat "Soporte TI": cualquier
    // alta/baja/cambio de disponibilidad de un agente de área TI pasa por acá,
    // así que es el único punto que necesita mantener sincronizada la tabla
    // puente LIVECHAT_GRUPO_AGENTES, sin cron ni job adicional.
    if (a === 'TI') {
      try {
        const livechatInternoController = require('./livechatInternoController');
        const camp = await livechatInternoController.resolverCampaniaGrupoSoporteTI(pool);
        if (camp) {
          if (disp === 1) {
            await pool.request()
              .input('grupoId', sql.Int, camp.grupoId)
              .input('uid', sql.Int, userId)
              .query(`
MERGE LIVECHAT_GRUPO_AGENTES AS tgt
USING (SELECT @grupoId AS LGA_GRUPO_ID, @uid AS LGA_USUARIO_ID) AS src
ON (tgt.LGA_GRUPO_ID = src.LGA_GRUPO_ID AND tgt.LGA_USUARIO_ID = src.LGA_USUARIO_ID)
WHEN MATCHED THEN UPDATE SET LGA_ACTIVO=1
WHEN NOT MATCHED THEN INSERT (LGA_GRUPO_ID, LGA_USUARIO_ID, LGA_ACTIVO) VALUES (@grupoId, @uid, 1);
              `);
          } else {
            await pool.request().input('grupoId', sql.Int, camp.grupoId).input('uid', sql.Int, userId)
              .query(`UPDATE LIVECHAT_GRUPO_AGENTES SET LGA_ACTIVO=0 WHERE LGA_GRUPO_ID=@grupoId AND LGA_USUARIO_ID=@uid`);
          }
        }
      } catch (e) {
        console.warn('⚠️ No se pudo sincronizar el grupo de Soporte TI:', e?.message || e);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error guardando staff TI:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getNotificaciones = async (req, res) => {
  try {
    const usuarioId = Number(req.headers['usuarioid'] || req.query.usuarioId || 0) || null;
    if (!usuarioId) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('uid', sql.Int, usuarioId)
      .query(`SELECT NOTI_ID as id, USER_ID as userId, TIPO as tipo, TICKET_ID as ticketId, MENSAJE as mensaje, CREATED_AT as createdAt
              FROM NOTIFICACIONES WHERE USER_ID=@uid AND LEIDA=0 ORDER BY CREATED_AT DESC`);
              
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando notificaciones:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.marcarNotificacionLeida = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('nid', sql.Int, id).query(`UPDATE NOTIFICACIONES SET LEIDA=1 WHERE NOTI_ID=@nid`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error marcando notificación:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getReporteSatisfaccion = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const { from, to, area } = req.query;
    const condiciones = ['1=1'];
    const request = pool.request();

    if (from) { condiciones.push('t.FECHA_CREACION >= @rsFrom'); request.input('rsFrom', sql.DateTime, from); }
    if (to) { condiciones.push('t.FECHA_CREACION <= @rsTo'); request.input('rsTo', sql.DateTime, to); }
    if (area) { condiciones.push('t.AREA = @rsArea'); request.input('rsArea', sql.NVarChar, normalizeArea(area)); }

    const rs = await request.query(`
      SELECT
        t.TICKET_ID as id,
        t.TITULO as titulo,
        t.AREA as area,
        t.ESTADO as estado,
        t.FECHA_CREACION as fechaCreacion,
        t.FECHA_CIERRE as fechaCierre,
        owner.NEUS_NOMBRES as solicitanteNombre,
        asg.NEUS_NOMBRES as asignadoNombre,
        s.RATING as rating,
        s.COMENTARIO as comentario,
        CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
      FROM TICKETS t
      LEFT JOIN NEUS_USUARIOS owner ON owner.NEUS_ID = t.SOLICITANTE_ID
      LEFT JOIN NEUS_USUARIOS asg ON asg.NEUS_ID = t.ASIGNADO_A
      LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
      WHERE ${condiciones.join(' AND ')}
      ORDER BY t.TICKET_ID DESC
    `);
    
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error reporte satisfaccion:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getReporteSatisfaccionCSV = async (req, res) => {
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || req.headers['tipousuario'] || '').toString().toUpperCase();
    if (!['AD','ADMIN','ADM'].includes(tipoUsuario)) return res.status(403).json({ success: false, message: 'No autorizado' });
    
    req.headers.accept = 'text/csv';
    req.headers['content-type'] = 'text/csv; charset=utf-8';
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const { from, to, area } = req.query;
    const condiciones = ['1=1'];
    const request = pool.request();

    if (from) { condiciones.push('t.FECHA_CREACION >= @rsFrom'); request.input('rsFrom', sql.DateTime, from); }
    if (to) { condiciones.push('t.FECHA_CREACION <= @rsTo'); request.input('rsTo', sql.DateTime, to); }
    if (area) { condiciones.push('t.AREA = @rsArea'); request.input('rsArea', sql.NVarChar, normalizeArea(area)); }

    const rs = await request.query(`
      SELECT
        t.TICKET_ID as id,
        t.TITULO as titulo,
        t.AREA as area,
        t.ESTADO as estado,
        t.FECHA_CREACION as fechaCreacion,
        t.FECHA_CIERRE as fechaCierre,
        owner.NEUS_NOMBRES as solicitanteNombre,
        asg.NEUS_NOMBRES as asignadoNombre,
        s.RATING as rating,
        s.COMENTARIO as comentario,
        CASE WHEN t.FECHA_CIERRE IS NOT NULL THEN DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) ELSE NULL END AS tiempoAtencionMinutos
      FROM TICKETS t
      LEFT JOIN NEUS_USUARIOS owner ON owner.NEUS_ID = t.SOLICITANTE_ID
      LEFT JOIN NEUS_USUARIOS asg ON asg.NEUS_ID = t.ASIGNADO_A
      LEFT JOIN TICKET_SATISFACCION s ON s.TICKET_ID = t.TICKET_ID
      WHERE ${condiciones.join(' AND ')}
      ORDER BY t.TICKET_ID DESC
    `);
    
    const rows = rs.recordset;
    let csv = 'id,titulo,area,estado,fechaCreacion,fechaCierre,tiempoAtencionMinutos,solicitante,asignado,rating,comentario\n';
    
    for (const r of rows) {
      let tiempoStr = '';
      if (r.tiempoAtencionMinutos !== null && r.tiempoAtencionMinutos !== undefined) {
        const m = Number(r.tiempoAtencionMinutos);
        if (!Number.isNaN(m)) {
          if (m <= 0) {
            tiempoStr = '0 min';
          } else if (m < 60) {
            tiempoStr = `${m} min`;
          } else {
            const h = Math.floor(m / 60);
            const mm = m % 60;
            tiempoStr = mm > 0 ? `${h} h ${mm} min` : `${h} h`;
          }
        }
      }

      const line = [
        r.id,
        `"${(r.titulo||'').replace(/"/g,'\"')}"`,
        r.area,
        r.estado,
        r.fechaCreacion?.toISOString?.() || r.fechaCreacion,
        r.fechaCierre?.toISOString?.() || r.fechaCierre,
        tiempoStr,
        `"${(r.solicitanteNombre||'').replace(/"/g,'\"')}"`,
        `"${(r.asignadoNombre||'').replace(/"/g,'\"')}"`,
        r.rating ?? '',
        `"${(r.comentario||'').replace(/"/g,'\"')}"`
      ].join(',');
      csv += line + '\n';
    }
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tickets_satisfaccion.csv"');
    res.send(csv);
  } catch (e) {
    console.error('Error reporte satisfaccion CSV:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Configuración de escalamiento automático (fila única global) ────────
exports.getEscalamientoConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`SELECT TOP 1 TEC_ID as id, TEC_AUTO_ESCALAMIENTO as autoEscalamiento, TEC_UMBRAL_RIESGO as umbralRiesgo FROM TICKETS_ESCALAMIENTO_CONFIG ORDER BY TEC_ID`);
    res.json({ success: true, data: rs.recordset[0] || { autoEscalamiento: true, umbralRiesgo: 0.8 } });
  } catch (e) {
    console.error('Error obteniendo configuración de escalamiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.actualizarEscalamientoConfig = async (req, res) => {
  try {
    const { autoEscalamiento, umbralRiesgo } = req.body;
    if (umbralRiesgo !== undefined && (umbralRiesgo <= 0 || umbralRiesgo > 1)) {
      return res.status(400).json({ success: false, message: 'umbralRiesgo debe estar entre 0 y 1' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const existente = await pool.request().query(`SELECT TOP 1 TEC_ID as id FROM TICKETS_ESCALAMIENTO_CONFIG ORDER BY TEC_ID`);
    if (!existente.recordset[0]) {
      return res.status(404).json({ success: false, message: 'Configuración no inicializada' });
    }
    await pool.request()
      .input('id', sql.Int, existente.recordset[0].id)
      .input('auto', sql.Bit, autoEscalamiento !== undefined ? !!autoEscalamiento : true)
      .input('umbral', sql.Decimal(4, 2), umbralRiesgo !== undefined ? umbralRiesgo : 0.8)
      .query(`UPDATE TICKETS_ESCALAMIENTO_CONFIG SET TEC_AUTO_ESCALAMIENTO=@auto, TEC_UMBRAL_RIESGO=@umbral, TEC_FECHA_ACTUALIZACION=GETDATE() WHERE TEC_ID=@id`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'actualizar-escalamiento-config', entidadId: String(existente.recordset[0].id), detalle:{ autoEscalamiento, umbralRiesgo }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando configuración de escalamiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Umbrales del panel de KPIs de Tickets (config global de una sola fila) ──
exports.getKpisConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT TOP 1 TKC_ID as id, TKC_UMBRAL_SLA_BUENO as umbralSlaBueno,
        TKC_UMBRAL_REABIERTOS_MALO as umbralReabiertosMalo,
        TKC_UMBRAL_SATISFACCION_BUENO as umbralSatisfaccionBueno
      FROM TICKETS_KPIS_CONFIG ORDER BY TKC_ID`);
    res.json({ success: true, data: rs.recordset[0] || { umbralSlaBueno: 80, umbralReabiertosMalo: 10, umbralSatisfaccionBueno: 4 } });
  } catch (e) {
    console.error('Error obteniendo configuración de KPIs:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.actualizarKpisConfig = async (req, res) => {
  try {
    const { umbralSlaBueno, umbralReabiertosMalo, umbralSatisfaccionBueno } = req.body;
    if (umbralSlaBueno !== undefined && (umbralSlaBueno < 0 || umbralSlaBueno > 100)) {
      return res.status(400).json({ success: false, message: 'umbralSlaBueno debe estar entre 0 y 100' });
    }
    if (umbralReabiertosMalo !== undefined && (umbralReabiertosMalo < 0 || umbralReabiertosMalo > 100)) {
      return res.status(400).json({ success: false, message: 'umbralReabiertosMalo debe estar entre 0 y 100' });
    }
    if (umbralSatisfaccionBueno !== undefined && (umbralSatisfaccionBueno < 0 || umbralSatisfaccionBueno > 5)) {
      return res.status(400).json({ success: false, message: 'umbralSatisfaccionBueno debe estar entre 0 y 5' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const existente = await pool.request().query(`SELECT TOP 1 TKC_ID as id FROM TICKETS_KPIS_CONFIG ORDER BY TKC_ID`);
    if (!existente.recordset[0]) {
      return res.status(404).json({ success: false, message: 'Configuración no inicializada' });
    }
    await pool.request()
      .input('id', sql.Int, existente.recordset[0].id)
      .input('sla', sql.Decimal(5, 2), umbralSlaBueno !== undefined ? umbralSlaBueno : 80)
      .input('reabiertos', sql.Decimal(5, 2), umbralReabiertosMalo !== undefined ? umbralReabiertosMalo : 10)
      .input('satisfaccion', sql.Decimal(3, 2), umbralSatisfaccionBueno !== undefined ? umbralSatisfaccionBueno : 4)
      .query(`UPDATE TICKETS_KPIS_CONFIG SET TKC_UMBRAL_SLA_BUENO=@sla, TKC_UMBRAL_REABIERTOS_MALO=@reabiertos, TKC_UMBRAL_SATISFACCION_BUENO=@satisfaccion, TKC_FECHA_ACTUALIZACION=GETDATE() WHERE TKC_ID=@id`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'actualizar-kpis-config', entidadId: String(existente.recordset[0].id), detalle:{ umbralSlaBueno, umbralReabiertosMalo, umbralSatisfaccionBueno }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando configuración de KPIs:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Configuración de envío de encuesta de satisfacción (una fila por área) ──
exports.getEncuestaConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`SELECT TEN_ID as id, TEN_AREA as area, TEN_PRIORIDAD_MINIMA as prioridadMinima FROM TICKETS_ENCUESTA_CONFIG ORDER BY TEN_AREA`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error obteniendo configuración de encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.actualizarEncuestaConfig = async (req, res) => {
  try {
    const { area, prioridadMinima } = req.body;
    if (!area || !['TI', 'ST'].includes(area.toUpperCase())) return res.status(400).json({ success: false, message: 'area debe ser TI o ST' });
    if (!ticketPrioridad.PRIORIDADES.includes((prioridadMinima || '').toUpperCase())) {
      return res.status(400).json({ success: false, message: `prioridadMinima debe ser una de: ${ticketPrioridad.PRIORIDADES.join(', ')}` });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const a = area.toUpperCase();
    await pool.request()
      .input('area', sql.NVarChar, a)
      .input('prioridadMinima', sql.NVarChar, prioridadMinima.toUpperCase())
      .query(`
        MERGE TICKETS_ENCUESTA_CONFIG AS target
        USING (SELECT @area AS area) AS src
        ON target.TEN_AREA = src.area
        WHEN MATCHED THEN UPDATE SET TEN_PRIORIDAD_MINIMA = @prioridadMinima
        WHEN NOT MATCHED THEN INSERT (TEN_AREA, TEN_PRIORIDAD_MINIMA) VALUES (@area, @prioridadMinima);
      `);
    invalidarCacheEncuestaConfig(req.user?.empresa);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tickets', accion:'actualizar-encuesta-config', entidadId: a, detalle:{ area: a, prioridadMinima }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando configuración de encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/tickets/ficha-usuario/:userId — vista combinada para identificar
// al solicitante desde cualquier canal (portal, chat en vivo, chatbot):
// perfil, tickets abiertos/recientes y activos asignados en una sola llamada.
// Solo expone campos que realmente existen en NEUS_USUARIOS — no inventa
// "sede" ni "nivel de servicio" porque no hay dato real detrás de esos campos.
exports.getFichaUsuario = async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const perfilR = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_CORREO as correo,
             NEUS_TELEFONO as telefono, NEUS_DEPARTAMENTO as departamento,
             NEUS_TIPOUSUARIO as tipoUsuario, NEUS_ACTIVO as activo, NEUS_USUARIO as usuarioRed
      FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);
    if (!perfilR.recordset.length) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    const perfil = perfilR.recordset[0];

    const ticketsAbiertosR = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT TOP 20 TICKET_ID as id, TITULO as titulo, AREA as area, PRIORIDAD as prioridad,
             ESTADO as estado, FECHA_CREACION as fechaCreacion, NIVEL_ACTUAL as nivelActual
      FROM TICKETS
      WHERE SOLICITANTE_ID=@uid AND ESTADO NOT IN ('resuelto','cerrado')
      ORDER BY FECHA_CREACION DESC`);

    const statsR = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT
        (SELECT COUNT(*) FROM TICKETS WHERE SOLICITANTE_ID=@uid) as totalTickets,
        (SELECT COUNT(*) FROM TICKETS WHERE SOLICITANTE_ID=@uid AND ESTADO NOT IN ('resuelto','cerrado')) as ticketsAbiertos,
        (SELECT COUNT(*) FROM TICKETS WHERE SOLICITANTE_ID=@uid AND ESTADO='reabierto') as ticketsReabiertos,
        (SELECT AVG(CAST(RATING as FLOAT)) FROM TICKET_SATISFACCION s JOIN TICKETS t ON t.TICKET_ID=s.TICKET_ID WHERE t.SOLICITANTE_ID=@uid) as ratingPromedio`);

    // Reutiliza la misma lógica de match por nombre que ya existe en
    // activoGeneralController.getActivosGeneralesPorUsuario, para no duplicar
    // la heurística de búsqueda de activos.
    let activos = [];
    try {
      const primerNombre = (perfil.nombre || '').trim().split(/\s+/)[0] || '';
      const activosR = await pool.request().input('nombre', sql.NVarChar, `%${primerNombre}%`).query(`
        SELECT TOP 20 AG_ID as id, AG_NOMBRE_EQUIPO as nombreEquipo, AG_MARCA as marca, AG_MODELO as modelo,
               AG_NUMERO_SERIE as numeroSerie, AG_SO as sistemaOperativo, AG_UBICACION as ubicacion, AG_ESTADO as estado
        FROM ACTIVOS_GENERALES
        WHERE AG_ACTIVO = 1 AND ISNULL(AG_DEPARTAMENTO, '') NOT IN ('MONITOR', 'CPU', 'HP')
          AND AG_USUARIO_EXCEL LIKE @nombre`);
      activos = activosR.recordset;
    } catch (e) {
      console.warn('⚠️ Error obteniendo activos para ficha de usuario:', e?.message || e);
    }

    res.json({
      success: true,
      data: {
        perfil,
        ticketsAbiertos: ticketsAbiertosR.recordset,
        activos,
        stats: {
          totalTickets: statsR.recordset[0].totalTickets,
          ticketsAbiertos: statsR.recordset[0].ticketsAbiertos,
          ticketsReabiertos: statsR.recordset[0].ticketsReabiertos,
          ratingPromedio: statsR.recordset[0].ratingPromedio,
        },
      },
    });
  } catch (e) {
    console.error('Error obteniendo ficha de usuario:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Reutilizado por ticketSlaCronController.js: evita duplicar la carga de
// reglas SLA y la lógica de escalamiento fuera de un ciclo request/response.
exports.cargarReglasSlaActivas = cargarReglasSlaActivas;
exports.buscarReglaSla = buscarReglaSla;
exports.cargarFeriadosActivos = cargarFeriadosActivos;
exports.minutosLaborablesEntre = minutosLaborablesEntre;
exports.invalidarCacheFeriados = invalidarCacheFeriados;
exports.ticketAmeritaEncuesta = ticketAmeritaEncuesta;
exports.invalidarCacheEncuestaConfig = invalidarCacheEncuestaConfig;
exports.escalarTicketInterno = escalarTicketInterno;
exports.crearTicketInterno = crearTicketInterno;
