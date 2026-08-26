const sql = require('mssql');
const databaseService = require('../services/databaseService');
const asistenciaReporteController = require('./asistenciaReporteController');
const XLSX = require('xlsx');
const { getIO } = require('../services/socketService');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const cron = require('node-cron');

// Notifica a todas las sesiones conectadas que el pool de vacaciones de un usuario
// cambió (marcado/quitado desde Asistencia), para que "Días por agente" y "Mi saldo"
// se refresquen solos sin esperar el staleTime del caché.
function notifyVacacionesDiasActualizados(usuarioId, tenantKey) {
  try {
    getIO(tenantKey).emit('vacaciones:diasActualizados', { usuarioId });
  } catch (_) {}
}

// Horario por defecto si la tabla ASISTENCIA_HORARIOS no tiene datos para el rol.
// ASISTENCIA_HORARIOS es la ÚNICA fuente de verdad de horas y días laborales:
// todo lo que decide si una marca es retardo o si un día sin marca es falta
// (marcado manual, import Excel, sync BioTime, reportes) debe pasar por
// getHorariosPorRol — nunca por una copia hardcodeada aparte.
const HORARIOS_FALLBACK = {
  AD: { entrada: '09:00:00', salida: '18:00:00', tolerancia: 5, diaInicio: 1, diaFin: 5 },
  TI: { entrada: '09:00:00', salida: '18:00:00', tolerancia: 5, diaInicio: 1, diaFin: 5 },
  CC: { entrada: '10:00:00', salida: '19:00:00', tolerancia: 5, diaInicio: 1, diaFin: 5 },
};

// Cache en memoria para no consultar la BD en cada marca de entrada
let horariosCacheTs = 0;
let horariosCache = null;

async function getHorariosPorRol(pool) {
  if (horariosCache && Date.now() - horariosCacheTs < 60_000) return horariosCache;
  try {
    const r = await pool.request().query(
      `SELECT ROL, HORA_ENTRADA, HORA_SALIDA, TOLERANCIA_MINUTOS, DIA_INICIO, DIA_FIN FROM ASISTENCIA_HORARIOS WHERE ACTIVO = 1`
    );
    const map = { ...HORARIOS_FALLBACK };
    for (const row of r.recordset) {
      map[row.ROL] = {
        entrada:    row.HORA_ENTRADA,
        salida:     row.HORA_SALIDA,
        tolerancia: row.TOLERANCIA_MINUTOS ?? 5,
        diaInicio:  row.DIA_INICIO ?? 1,
        diaFin:     row.DIA_FIN ?? 5,
      };
    }
    horariosCache = map;
    horariosCacheTs = Date.now();
    return map;
  } catch {
    // Si la tabla no existe aún, usar fallback
    return HORARIOS_FALLBACK;
  }
}

function invalidarCacheHorarios() { horariosCache = null; horariosCacheTs = 0; }

// GET /api/asistencia/horarios — lista los horarios configurados (AD/TI)
exports.getHorarios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    // Asegurar tabla principal con columnas de rango de días
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ASISTENCIA_HORARIOS')
      CREATE TABLE ASISTENCIA_HORARIOS (
        ID                INT IDENTITY(1,1) PRIMARY KEY,
        ROL               NVARCHAR(10) NOT NULL,
        NOMBRE_AREA       NVARCHAR(80) NOT NULL,
        HORA_ENTRADA      VARCHAR(8)   NOT NULL DEFAULT '09:00:00',
        HORA_SALIDA       VARCHAR(8)   NOT NULL DEFAULT '18:00:00',
        TOLERANCIA_MINUTOS INT         NOT NULL DEFAULT 5,
        DIA_INICIO        TINYINT      NOT NULL DEFAULT 1,
        DIA_FIN           TINYINT      NOT NULL DEFAULT 5,
        ACTIVO            BIT          NOT NULL DEFAULT 1,
        FECHA_MOD         DATETIME     NOT NULL DEFAULT GETDATE()
      )
    `);

    // Migración: agregar columnas si tabla existe pero no las tiene
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ASISTENCIA_HORARIOS' AND COLUMN_NAME='DIA_INICIO')
        ALTER TABLE ASISTENCIA_HORARIOS ADD DIA_INICIO TINYINT NOT NULL DEFAULT 1;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ASISTENCIA_HORARIOS' AND COLUMN_NAME='DIA_FIN')
        ALTER TABLE ASISTENCIA_HORARIOS ADD DIA_FIN TINYINT NOT NULL DEFAULT 5;
    `);

    // Asegurar tabla de horarios especiales (excepciones por día de semana)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ASISTENCIA_HORARIOS_ESP')
      CREATE TABLE ASISTENCIA_HORARIOS_ESP (
        ID                INT IDENTITY(1,1) PRIMARY KEY,
        HORARIO_ID        INT          NOT NULL REFERENCES ASISTENCIA_HORARIOS(ID),
        DIA_SEMANA        TINYINT      NOT NULL,
        HORA_ENTRADA      VARCHAR(8)   NOT NULL,
        HORA_SALIDA       VARCHAR(8)   NOT NULL,
        TOLERANCIA_MINUTOS INT         NOT NULL DEFAULT 5,
        ACTIVO            BIT          NOT NULL DEFAULT 1,
        CONSTRAINT UQ_ESP_HORARIO_DIA UNIQUE (HORARIO_ID, DIA_SEMANA)
      )
    `);

    // Insertar defaults si la tabla principal está vacía
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM ASISTENCIA_HORARIOS)
      BEGIN
        INSERT INTO ASISTENCIA_HORARIOS (ROL, NOMBRE_AREA, HORA_ENTRADA, HORA_SALIDA, TOLERANCIA_MINUTOS, DIA_INICIO, DIA_FIN)
        VALUES ('CC','Call Center','10:00:00','19:00:00',5,1,5),
               ('AD','Administración','09:00:00','18:00:00',5,1,5),
               ('TI','Tecnología','09:00:00','18:00:00',5,1,5)
      END
    `);

    const result = await pool.request().query(`
      SELECT ID as id, ROL as rol, NOMBRE_AREA as nombreArea,
             HORA_ENTRADA as horaEntrada, HORA_SALIDA as horaSalida,
             TOLERANCIA_MINUTOS as toleranciaMinutos,
             DIA_INICIO as diaInicio, DIA_FIN as diaFin,
             ACTIVO as activo
      FROM ASISTENCIA_HORARIOS
      ORDER BY CASE ROL WHEN 'CC' THEN 1 WHEN 'AD' THEN 2 WHEN 'TI' THEN 3 ELSE 4 END
    `);

    const especiales = await pool.request().query(`
      SELECT ID as id, HORARIO_ID as horarioId, DIA_SEMANA as diaSemana,
             HORA_ENTRADA as horaEntrada, HORA_SALIDA as horaSalida,
             TOLERANCIA_MINUTOS as toleranciaMinutos, ACTIVO as activo
      FROM ASISTENCIA_HORARIOS_ESP
      ORDER BY HORARIO_ID, DIA_SEMANA
    `);

    // Agrupar especiales por horarioId
    const espMap = {};
    for (const e of especiales.recordset) {
      if (!espMap[e.horarioId]) espMap[e.horarioId] = [];
      espMap[e.horarioId].push(e);
    }
    const data = result.recordset.map(h => ({ ...h, especiales: espMap[h.id] ?? [] }));

    return res.json({ success: true, data });
  } catch (e) {
    console.error('Error getHorarios:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener horarios' });
  }
};

// PUT /api/asistencia/horarios/:id — actualiza un horario (AD only)
exports.updateHorario = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nombreArea, horaEntrada, horaSalida, toleranciaMinutos, diaInicio, diaFin, activo } = req.body;

    const reHora = /^\d{2}:\d{2}(:\d{2})?$/;
    if (horaEntrada && !reHora.test(horaEntrada)) return res.status(400).json({ success: false, message: 'Formato de hora inválido' });
    if (horaSalida  && !reHora.test(horaSalida))  return res.status(400).json({ success: false, message: 'Formato de hora inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const req2 = pool.request().input('id', sql.Int, id).input('fechaMod', sql.DateTime, new Date());

    const sets = ['FECHA_MOD = @fechaMod'];
    if (nombreArea         != null) { req2.input('nombreArea',         sql.NVarChar, nombreArea);                sets.push('NOMBRE_AREA = @nombreArea'); }
    if (horaEntrada        != null) { req2.input('horaEntrada',        sql.VarChar,  horaEntrada.length === 5 ? `${horaEntrada}:00` : horaEntrada); sets.push('HORA_ENTRADA = @horaEntrada'); }
    if (horaSalida         != null) { req2.input('horaSalida',         sql.VarChar,  horaSalida.length  === 5 ? `${horaSalida}:00`  : horaSalida);  sets.push('HORA_SALIDA = @horaSalida'); }
    if (toleranciaMinutos  != null) { req2.input('toleranciaMinutos',  sql.Int,      parseInt(toleranciaMinutos, 10));                               sets.push('TOLERANCIA_MINUTOS = @toleranciaMinutos'); }
    if (diaInicio          != null) { req2.input('diaInicio',          sql.TinyInt,  parseInt(diaInicio, 10));                                      sets.push('DIA_INICIO = @diaInicio'); }
    if (diaFin             != null) { req2.input('diaFin',             sql.TinyInt,  parseInt(diaFin, 10));                                         sets.push('DIA_FIN = @diaFin'); }
    if (activo             != null) { req2.input('activo',             sql.Bit,      activo ? 1 : 0);                                               sets.push('ACTIVO = @activo'); }

    await req2.query(`UPDATE ASISTENCIA_HORARIOS SET ${sets.join(', ')} WHERE ID = @id`);
    invalidarCacheHorarios();
    return res.json({ success: true });
  } catch (e) {
    console.error('Error updateHorario:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al actualizar horario' });
  }
};

// POST /api/asistencia/horarios/:id/especiales — agrega horario especial a un área (AD only)
exports.createHorarioEspecial = async (req, res) => {
  try {
    const horarioId = parseInt(req.params.id, 10);
    const { diaSemana, horaEntrada, horaSalida, toleranciaMinutos } = req.body;

    const reHora = /^\d{2}:\d{2}(:\d{2})?$/;
    if (!reHora.test(horaEntrada)) return res.status(400).json({ success: false, message: 'Formato hora entrada inválido' });
    if (!reHora.test(horaSalida))  return res.status(400).json({ success: false, message: 'Formato hora salida inválido' });
    if (diaSemana == null || diaSemana < 0 || diaSemana > 6) return res.status(400).json({ success: false, message: 'Día inválido (0=Dom, 6=Sáb)' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('hid',   sql.Int,     horarioId)
      .input('dia',   sql.TinyInt, parseInt(diaSemana, 10))
      .input('ent',   sql.VarChar, horaEntrada.length === 5 ? `${horaEntrada}:00` : horaEntrada)
      .input('sal',   sql.VarChar, horaSalida.length  === 5 ? `${horaSalida}:00`  : horaSalida)
      .input('tol',   sql.Int,     parseInt(toleranciaMinutos ?? 5, 10))
      .query(`
        MERGE ASISTENCIA_HORARIOS_ESP AS t
        USING (SELECT @hid AS HORARIO_ID, @dia AS DIA_SEMANA) AS s
          ON t.HORARIO_ID = s.HORARIO_ID AND t.DIA_SEMANA = s.DIA_SEMANA
        WHEN MATCHED THEN
          UPDATE SET HORA_ENTRADA=@ent, HORA_SALIDA=@sal, TOLERANCIA_MINUTOS=@tol, ACTIVO=1
        WHEN NOT MATCHED THEN
          INSERT (HORARIO_ID, DIA_SEMANA, HORA_ENTRADA, HORA_SALIDA, TOLERANCIA_MINUTOS)
          VALUES (@hid, @dia, @ent, @sal, @tol);
      `);
    invalidarCacheHorarios();
    return res.json({ success: true });
  } catch (e) {
    console.error('Error createHorarioEspecial:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al guardar horario especial' });
  }
};

// DELETE /api/asistencia/horarios/:id/especiales/:espId — elimina un horario especial (AD only)
exports.deleteHorarioEspecial = async (req, res) => {
  try {
    const espId = parseInt(req.params.espId, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, espId).query(`DELETE FROM ASISTENCIA_HORARIOS_ESP WHERE ID = @id`);
    invalidarCacheHorarios();
    return res.json({ success: true });
  } catch (e) {
    console.error('Error deleteHorarioEspecial:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al eliminar horario especial' });
  }
};

const TOLERANCIA_MINUTOS = 5;

// Rate-limit en memoria: un intento por usuario cada 10 segundos
const _entradaRateMap = new Map();
function _checkRateLimit(neusId) {
  const ahora = Date.now();
  const ultimo = _entradaRateMap.get(neusId) ?? 0;
  if (ahora - ultimo < 10_000) return false;
  _entradaRateMap.set(neusId, ahora);
  return true;
}

// POST /api/asistencia/entrada — registra la hora de entrada del usuario autenticado (una vez por día)
exports.marcarEntrada = async (req, res) => {
  try {
    const neusId = req.user?.id;
    const rol = (req.user?.tipoUsuario || '').toString().toUpperCase();

    if (!_checkRateLimit(neusId)) {
      return res.status(429).json({ success: false, message: 'Demasiados intentos, espera unos segundos' });
    }
    if (!neusId) return res.status(400).json({ success: false, message: 'Falta el usuario' });

    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener horario desde BD (con fallback al hardcoded)
    const horarios = await getHorariosPorRol(pool);
    const horarioRol = horarios[rol];
    if (!horarioRol) {
      return res.status(400).json({ success: false, message: `No hay horario configurado para el rol ${rol}` });
    }
    const horaLimite = horarioRol.entrada;
    const toleranciaUsar = horarioRol.tolerancia ?? TOLERANCIA_MINUTOS;

    const existente = await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`SELECT ID FROM ASISTENCIA_ENTRADAS WHERE NEUS_ID = @neusId AND FECHA = CAST(GETDATE() AS date)`);
    if (existente.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya registraste tu entrada hoy' });
    }

    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('rol', sql.NVarChar, rol)
      .input('horaLimite', sql.VarChar, horaLimite)
      .input('tolerancia', sql.Int, toleranciaUsar)
      .query(`
        DECLARE @horaEntrada DATETIME = GETDATE();
        DECLARE @horaEsperada DATETIME = CAST(CAST(@horaEntrada AS date) AS datetime) + CAST(@horaLimite AS datetime);
        DECLARE @minutosRetardo INT = CASE
          WHEN DATEDIFF(SECOND, @horaEsperada, @horaEntrada) > 0
            THEN DATEDIFF(SECOND, @horaEsperada, @horaEntrada) / 60
          ELSE 0
        END;
        DECLARE @esRetardo BIT = CASE WHEN @minutosRetardo > @tolerancia THEN 1 ELSE 0 END;

        INSERT INTO ASISTENCIA_ENTRADAS (NEUS_ID, FECHA, ROL, HORA_ENTRADA, HORA_ESPERADA, MINUTOS_RETARDO, ES_RETARDO)
        OUTPUT INSERTED.ID,
          FORMAT(INSERTED.HORA_ENTRADA, 'HH:mm:ss') AS HORA_ENTRADA_FMT,
          FORMAT(INSERTED.HORA_ESPERADA, 'HH:mm') AS HORA_ESPERADA_FMT,
          INSERTED.MINUTOS_RETARDO, INSERTED.ES_RETARDO
        VALUES (@neusId, CAST(@horaEntrada AS date), @rol, @horaEntrada, @horaEsperada, @minutosRetardo, @esRetardo);
      `);

    const inserted = result.recordset[0];

    if (inserted.ES_RETARDO) {
      // No bloquear la respuesta del usuario por esto; los errores se registran internamente.
      asistenciaReporteController.evaluarActaPorRetardos(pool, neusId, new Date(), req.user?.empresa);
    }

    return res.status(201).json({
      success: true,
      data: {
        id: inserted.ID,
        horaEntrada: inserted.HORA_ENTRADA_FMT,
        horaEsperada: inserted.HORA_ESPERADA_FMT,
        minutosRetardo: inserted.MINUTOS_RETARDO,
        esRetardo: Boolean(inserted.ES_RETARDO),
      },
    });
  } catch (e) {
    if (e && e.number === 2627) {
      return res.status(409).json({ success: false, message: 'Ya registraste tu entrada hoy' });
    }
    console.error('Error marcarEntrada:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al registrar la entrada' });
  }
};

// GET /api/asistencia/entrada/hoy — devuelve el registro de entrada de hoy del usuario, si existe
exports.getEntradaHoy = async (req, res) => {
  try {
    const neusId = req.user?.id;
    if (!neusId) return res.status(400).json({ success: false, message: 'Falta el usuario' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`
        SELECT ID as id,
               FORMAT(HORA_ENTRADA, 'HH:mm:ss') as horaEntrada,
               FORMAT(HORA_ESPERADA, 'HH:mm') as horaEsperada,
               MINUTOS_RETARDO as minutosRetardo, ES_RETARDO as esRetardo
        FROM ASISTENCIA_ENTRADAS
        WHERE NEUS_ID = @neusId AND FECHA = CAST(GETDATE() AS date)
      `);

    return res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    console.error('Error getEntradaHoy:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al consultar la entrada' });
  }
};

// GET /api/asistencia/mis-entradas?mes=YYYY-MM — historial del usuario autenticado en un mes (o mes actual)
exports.getMisEntradas = async (req, res) => {
  try {
    const neusId = req.user?.id;
    if (!neusId) return res.status(400).json({ success: false, message: 'Falta el usuario' });

    const mesParam = extractDate(req.query.mes ? `${req.query.mes}-01` : null);
    const fecha = mesParam ? new Date(`${mesParam}T12:00:00`) : new Date();
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('anio', sql.Int, anio)
      .input('mes', sql.Int, mes)
      .query(`
        SELECT
          FORMAT(FECHA, 'yyyy-MM-dd') as fecha,
          FORMAT(HORA_ENTRADA, 'HH:mm:ss') as horaEntrada,
          FORMAT(HORA_ESPERADA, 'HH:mm') as horaEsperada,
          MINUTOS_RETARDO as minutosRetardo, ES_RETARDO as esRetardo
        FROM ASISTENCIA_ENTRADAS
        WHERE NEUS_ID = @neusId AND YEAR(FECHA) = @anio AND MONTH(FECHA) = @mes
        ORDER BY FECHA DESC
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getMisEntradas:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al consultar el historial' });
  }
};

function extractDate(s) {
  if (!s) return null;
  const match = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// GET /api/asistencia/retardos?from=&to=&area=&nombre=&estado=a-tiempo|retardo — reporte de asistencia (solo AD)
exports.getReporteRetardos = async (req, res) => {
  try {
    const { from, to, area, nombre, estado } = req.query;
    const fromDate = extractDate(from) || new Date().toISOString().slice(0, 10);
    const toDate = extractDate(to) || fromDate;

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcepcionesTable(pool);
    await ensureExentosTable(pool);
    const request = pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate);

    const condiciones = [];
    if (area) {
      request.input('area', sql.NVarChar, area.toUpperCase());
      condiciones.push('a.ROL = @area');
    }
    if (nombre) {
      request.input('nombre', sql.NVarChar, `%${nombre}%`);
      condiciones.push('nu.NEUS_NOMBRES LIKE @nombre');
    }
    if (estado === 'retardo') condiciones.push('a.ES_RETARDO = 1');
    else if (estado === 'a-tiempo') condiciones.push('a.ES_RETARDO = 0');

    const filtros = condiciones.length ? `AND ${condiciones.join(' AND ')}` : '';

    const result = await request.query(`
      SELECT
        a.ID as id, a.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as nombre, a.ROL as rol,
        FORMAT(a.FECHA, 'yyyy-MM-dd') as fecha,
        FORMAT(a.HORA_ENTRADA, 'HH:mm:ss') as horaEntrada,
        FORMAT(a.HORA_ESPERADA, 'HH:mm') as horaEsperada,
        a.MINUTOS_RETARDO as minutosRetardo, a.ES_RETARDO as esRetardo,
        CASE WHEN e.ID IS NOT NULL THEN 1 ELSE 0 END as esVacaciones,
        e.ID as excepcionId
      FROM ASISTENCIA_ENTRADAS a
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.NEUS_ID
      LEFT JOIN ASISTENCIA_EXCEPCIONES e ON e.NEUS_ID = a.NEUS_ID AND e.FECHA = a.FECHA
      WHERE a.FECHA >= @fromDate AND a.FECHA <= @toDate
        ${filtros}
      ORDER BY a.FECHA DESC,
               CASE a.ROL WHEN 'CC' THEN 1 WHEN 'AD' THEN 2 WHEN 'TI' THEN 3 ELSE 4 END,
               nu.NEUS_NOMBRES ASC
    `);

    // Faltas: usuarios activos (CC/AD/TI) sin registro ese día ni excepción de vacaciones.
    // Se generan como filas sintéticas (id negativo, sin hora de entrada) para que aparezcan
    // en el mismo listado que retardos/a-tiempo, en vez de desaparecer silenciosamente.
    const condicionesFalta = [];
    const requestFalta = pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate);
    if (area) {
      requestFalta.input('area', sql.NVarChar, area.toUpperCase());
      condicionesFalta.push('nu.NEUS_TIPOUSUARIO = @area');
    }
    if (nombre) {
      requestFalta.input('nombre', sql.NVarChar, `%${nombre}%`);
      condicionesFalta.push('nu.NEUS_NOMBRES LIKE @nombre');
    }
    const filtrosFalta = condicionesFalta.length ? `AND ${condicionesFalta.join(' AND ')}` : '';

    let faltas = [];
    if (!estado || estado === 'falta') {
      const faltaResult = await requestFalta.query(`
        WITH Fechas AS (
          SELECT CAST(@fromDate AS date) AS f
          UNION ALL
          SELECT DATEADD(day, 1, f) FROM Fechas WHERE DATEADD(day, 1, f) <= CAST(@toDate AS date)
        ),
        FechasFiltradas AS (
          SELECT f FROM Fechas WHERE f <= CAST(GETDATE() AS date)
        ),
        EmpleadosActivos AS (
          SELECT NEUS_ID, NEUS_NOMBRES, NEUS_TIPOUSUARIO
          FROM NEUS_USUARIOS nu
          WHERE nu.NEUS_ACTIVO = 1 AND nu.NEUS_TIPOUSUARIO IN ('CC','AD','TI') ${filtrosFalta}
            AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXENTOS ex2 WHERE ex2.NEUS_ID = nu.NEUS_ID)
        )
        SELECT ff.f AS fechaRaw, ea.NEUS_ID AS usuarioId, ea.NEUS_NOMBRES AS nombre, ea.NEUS_TIPOUSUARIO AS rol
        FROM FechasFiltradas ff
        CROSS JOIN EmpleadosActivos ea
        LEFT JOIN ASISTENCIA_HORARIOS h ON h.ROL = ea.NEUS_TIPOUSUARIO AND h.ACTIVO = 1
        WHERE NOT EXISTS (SELECT 1 FROM ASISTENCIA_ENTRADAS p WHERE p.FECHA = ff.f AND p.NEUS_ID = ea.NEUS_ID)
          AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXCEPCIONES ex WHERE ex.FECHA = ff.f AND ex.NEUS_ID = ea.NEUS_ID)
          AND (
            (ISNULL(h.DIA_INICIO, 1) <= ISNULL(h.DIA_FIN, 5)
              AND (DATEPART(WEEKDAY, ff.f) - 1) BETWEEN ISNULL(h.DIA_INICIO, 1) AND ISNULL(h.DIA_FIN, 5))
            OR
            (ISNULL(h.DIA_INICIO, 1) > ISNULL(h.DIA_FIN, 5)
              AND ((DATEPART(WEEKDAY, ff.f) - 1) >= ISNULL(h.DIA_INICIO, 1) OR (DATEPART(WEEKDAY, ff.f) - 1) <= ISNULL(h.DIA_FIN, 5)))
          )
        OPTION (MAXRECURSION 366)
      `);
      faltas = faltaResult.recordset.map((f, i) => ({
        id: -1 - i,
        usuarioId: f.usuarioId,
        nombre: f.nombre,
        rol: f.rol,
        fecha: new Date(f.fechaRaw).toISOString().slice(0, 10),
        horaEntrada: null,
        horaEsperada: null,
        minutosRetardo: 0,
        esRetardo: false,
        esVacaciones: false,
        excepcionId: null,
        esFalta: true,
      }));
    }

    // Vacaciones sin registro de entrada: la excepción existe (ASISTENCIA_EXCEPCIONES)
    // pero nunca hubo fila en ASISTENCIA_ENTRADAS ese día — el INNER JOIN de `result`
    // nunca las trae, y el bloque de faltas las excluye a propósito. Sin este bloque
    // ese día queda invisible: no aparece como falta ni como vacaciones.
    const vacSinEntradaResult = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT e.ID as excepcionId, e.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as nombre, nu.NEUS_TIPOUSUARIO as rol,
               FORMAT(e.FECHA, 'yyyy-MM-dd') as fecha
        FROM ASISTENCIA_EXCEPCIONES e
        INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = e.NEUS_ID
        WHERE e.FECHA >= @fromDate AND e.FECHA <= @toDate
          AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_ENTRADAS a WHERE a.NEUS_ID = e.NEUS_ID AND a.FECHA = e.FECHA)
      `);
    const vacacionesSinEntrada = vacSinEntradaResult.recordset.map((v, i) => ({
      id: -10000 - i,
      usuarioId: v.usuarioId,
      nombre: v.nombre,
      rol: v.rol,
      fecha: v.fecha,
      horaEntrada: null,
      horaEsperada: null,
      minutosRetardo: 0,
      esRetardo: false,
      esVacaciones: true,
      excepcionId: v.excepcionId,
      esFalta: false,
    }));

    const data = [...result.recordset.map(r => ({ ...r, esFalta: false })), ...faltas, ...vacacionesSinEntrada]
      .sort((a, b) => {
        if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
        const orden = { CC: 1, AD: 2, TI: 3 };
        if ((orden[a.rol] ?? 4) !== (orden[b.rol] ?? 4)) return (orden[a.rol] ?? 4) - (orden[b.rol] ?? 4);
        return (a.nombre ?? '').localeCompare(b.nombre ?? '');
      });

    return res.json({ success: true, data });
  } catch (e) {
    console.error('Error getReporteRetardos:', e?.message);
    return res.status(500).json({ success: false, message: 'Error generando reporte de retardos' });
  }
};

// GET /api/asistencia/retardos/stats?from=&to= — conteo de retardos por persona (solo AD), para el dashboard
exports.getRetardosStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = extractDate(from) || new Date().toISOString().slice(0, 10);
    const toDate = extractDate(to) || fromDate;

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT
          a.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as usuarioNombre, a.ROL as usuarioRol,
          COUNT(*) as totalRetardos
        FROM ASISTENCIA_ENTRADAS a
        INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.NEUS_ID
        WHERE a.FECHA >= @fromDate AND a.FECHA <= @toDate AND a.ES_RETARDO = 1
        GROUP BY a.NEUS_ID, nu.NEUS_NOMBRES, a.ROL
        ORDER BY totalRetardos DESC
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getRetardosStats:', e?.message);
    return res.status(500).json({ success: false, message: 'Error generando estadísticas de retardos' });
  }
};

// GET /api/asistencia/resumen-mes?mes=MM&anio=YYYY
// Devuelve por cada día del mes cuántos retardos y faltas hay (para el indicador en el calendario).
// Solo accesible para AD/TI.
exports.getResumenMes = async (req, res) => {
  try {
    const mes  = parseInt(req.query.mes,  10);
    const anio = parseInt(req.query.anio, 10);
    if (!mes || !anio || mes < 1 || mes > 12) {
      return res.status(400).json({ success: false, message: 'Parámetros mes/anio inválidos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcepcionesTable(pool);
    await ensureExentosTable(pool);

    // Retardos por día del mes (excluye días marcados como vacaciones)
    const retResult = await pool.request()
      .input('mes', sql.Int, mes)
      .input('anio', sql.Int, anio)
      .query(`
        SELECT DAY(a.FECHA) AS dia, COUNT(*) AS total
        FROM ASISTENCIA_ENTRADAS a
        WHERE YEAR(a.FECHA) = @anio AND MONTH(a.FECHA) = @mes AND a.ES_RETARDO = 1
          AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXCEPCIONES e WHERE e.NEUS_ID = a.NEUS_ID AND e.FECHA = a.FECHA)
        GROUP BY DAY(a.FECHA)
      `);

    // Faltas: empleados activos sin entrada, por día (excluye días marcados como vacaciones y usuarios exentos)
    // Se calcula generando las fechas del mes (hasta hoy) y cruzando con empleados activos
    const faltaResult = await pool.request()
      .input('mes', sql.Int, mes)
      .input('anio', sql.Int, anio)
      .query(`
        WITH Fechas AS (
          SELECT CAST(DATEFROMPARTS(@anio, @mes, 1) AS date) AS f
          UNION ALL
          SELECT DATEADD(day, 1, f) FROM Fechas WHERE DATEADD(day, 1, f) < DATEFROMPARTS(@anio, @mes + 1, 1)
        ),
        FechasFiltradas AS (
          SELECT f FROM Fechas WHERE f <= CAST(GETDATE() AS date)
        ),
        EmpleadosActivos AS (
          SELECT NEUS_ID, NEUS_TIPOUSUARIO FROM NEUS_USUARIOS nu WHERE nu.NEUS_ACTIVO = 1 AND nu.NEUS_TIPOUSUARIO IN ('CC','AD','TI')
            AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXENTOS ex2 WHERE ex2.NEUS_ID = nu.NEUS_ID)
        ),
        Presentes AS (
          SELECT FECHA, NEUS_ID FROM ASISTENCIA_ENTRADAS
          WHERE YEAR(FECHA) = @anio AND MONTH(FECHA) = @mes
          UNION
          SELECT FECHA, NEUS_ID FROM ASISTENCIA_EXCEPCIONES
          WHERE YEAR(FECHA) = @anio AND MONTH(FECHA) = @mes
        )
        SELECT DAY(ff.f) AS dia, COUNT(*) AS total
        FROM FechasFiltradas ff
        CROSS JOIN EmpleadosActivos ea
        LEFT JOIN ASISTENCIA_HORARIOS h ON h.ROL = ea.NEUS_TIPOUSUARIO AND h.ACTIVO = 1
        WHERE NOT EXISTS (SELECT 1 FROM Presentes p WHERE p.FECHA = ff.f AND p.NEUS_ID = ea.NEUS_ID)
          AND (
            (ISNULL(h.DIA_INICIO, 1) <= ISNULL(h.DIA_FIN, 5)
              AND (DATEPART(WEEKDAY, ff.f) - 1) BETWEEN ISNULL(h.DIA_INICIO, 1) AND ISNULL(h.DIA_FIN, 5))
            OR
            (ISNULL(h.DIA_INICIO, 1) > ISNULL(h.DIA_FIN, 5)
              AND ((DATEPART(WEEKDAY, ff.f) - 1) >= ISNULL(h.DIA_INICIO, 1) OR (DATEPART(WEEKDAY, ff.f) - 1) <= ISNULL(h.DIA_FIN, 5)))
          )
        GROUP BY DAY(ff.f)
        OPTION (MAXRECURSION 31)
      `);

    return res.json({
      success: true,
      retardos: retResult.recordset,   // [{ dia, total }]
      faltas:   faltaResult.recordset, // [{ dia, total }]
    });
  } catch (e) {
    console.error('Error getResumenMes:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener resumen del mes' });
  }
};

// GET /api/asistencia/resumen-dia?fecha=YYYY-MM-DD
// Devuelve los retardos del día y los empleados que no registraron entrada (faltas).
// Solo accesible para AD/TI. Las faltas se calculan comparando empleados activos con
// ASISTENCIA_ENTRADAS en esa fecha — un empleado activo sin fila = falta.
exports.getResumenDia = async (req, res) => {
  try {
    const fechaStr = extractDate(req.query.fecha);
    if (!fechaStr) return res.status(400).json({ success: false, message: 'Falta el parámetro fecha (YYYY-MM-DD)' });

    // No mostrar datos de días futuros
    const hoy = new Date();
    const fechaSol = new Date(`${fechaStr}T12:00:00`);
    if (fechaSol > hoy) {
      return res.json({ success: true, retardos: [], faltas: [] });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcepcionesTable(pool);
    await ensureExentosTable(pool);

    // Retardos del día con nombre, hora y rol (excluye días marcados como vacaciones)
    const retResult = await pool.request()
      .input('fecha', sql.NVarChar, fechaStr)
      .query(`
        SELECT
          a.NEUS_ID    AS usuarioId,
          nu.NEUS_NOMBRES AS nombre,
          a.ROL        AS rol,
          FORMAT(a.HORA_ENTRADA,  'HH:mm:ss') AS horaEntrada,
          FORMAT(a.HORA_ESPERADA, 'HH:mm:ss') AS horaEsperada,
          a.MINUTOS_RETARDO AS minutosRetardo
        FROM ASISTENCIA_ENTRADAS a
        INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.NEUS_ID
        WHERE a.FECHA = @fecha AND a.ES_RETARDO = 1
          AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXCEPCIONES e WHERE e.NEUS_ID = a.NEUS_ID AND e.FECHA = a.FECHA)
        ORDER BY
          CASE a.ROL WHEN 'CC' THEN 1 WHEN 'AD' THEN 2 WHEN 'TI' THEN 3 ELSE 4 END,
          a.MINUTOS_RETARDO DESC
      `);

    // Faltas: empleados activos con rol conocido que NO tienen entrada ni excepción ese día
    // Solo roles CC, AD, TI (excluye CL y otros sin horario)
    const faltaResult = await pool.request()
      .input('fecha', sql.NVarChar, fechaStr)
      .query(`
        SELECT
          nu.NEUS_ID          AS usuarioId,
          nu.NEUS_NOMBRES     AS nombre,
          nu.NEUS_TIPOUSUARIO AS rol
        FROM NEUS_USUARIOS nu
        WHERE nu.NEUS_ACTIVO = 1
          AND nu.NEUS_TIPOUSUARIO IN ('CC','AD','TI')
          AND nu.NEUS_ID NOT IN (
            SELECT NEUS_ID FROM ASISTENCIA_ENTRADAS WHERE FECHA = @fecha
          )
          AND nu.NEUS_ID NOT IN (
            SELECT NEUS_ID FROM ASISTENCIA_EXCEPCIONES WHERE FECHA = @fecha
          )
          AND nu.NEUS_ID NOT IN (
            SELECT NEUS_ID FROM ASISTENCIA_EXENTOS
          )
        ORDER BY
          CASE nu.NEUS_TIPOUSUARIO WHEN 'CC' THEN 1 WHEN 'AD' THEN 2 WHEN 'TI' THEN 3 ELSE 4 END,
          nu.NEUS_NOMBRES ASC
      `);

    // Vacaciones del día (para mostrarlas en el detalle)
    const vacacionesResult = await pool.request()
      .input('fecha', sql.NVarChar, fechaStr)
      .query(`
        SELECT e.ID as id, nu.NEUS_ID AS usuarioId, nu.NEUS_NOMBRES AS nombre, nu.NEUS_TIPOUSUARIO AS rol
        FROM ASISTENCIA_EXCEPCIONES e
        INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = e.NEUS_ID
        WHERE e.FECHA = @fecha
        ORDER BY
          CASE nu.NEUS_TIPOUSUARIO WHEN 'CC' THEN 1 WHEN 'AD' THEN 2 WHEN 'TI' THEN 3 ELSE 4 END,
          nu.NEUS_NOMBRES ASC
      `);

    return res.json({
      success: true,
      retardos: retResult.recordset,
      faltas: faltaResult.recordset,
      vacaciones: vacacionesResult.recordset,
    });
  } catch (e) {
    console.error('Error getResumenDia:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener resumen del día' });
  }
};

/* ══════════════════════════════════════════════════════
   EXCEPCIONES DE ASISTENCIA (Vacaciones)
   Permite marcar un día como "Vacaciones" para que no
   cuente como falta ni retardo, exista o no un registro
   de entrada ese día. Solo AD/TI (validado en la ruta).
══════════════════════════════════════════════════════ */
async function ensureExcepcionesTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_EXCEPCIONES' AND xtype='U')
    CREATE TABLE ASISTENCIA_EXCEPCIONES (
      ID              INT IDENTITY(1,1) PRIMARY KEY,
      NEUS_ID         INT NOT NULL,
      FECHA           DATE NOT NULL,
      TIPO            NVARCHAR(20) NOT NULL DEFAULT 'VACACIONES',
      CREADO_POR      INT NOT NULL,
      FECHA_CREACION  DATETIME DEFAULT GETDATE(),
      SOLICITUD_ID    INT NULL,
      CONSTRAINT UQ_ASISTENCIA_EXCEPCIONES UNIQUE (NEUS_ID, FECHA)
    )
  `);
  // Migración: agregar columna si la tabla ya existía sin ella
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ASISTENCIA_EXCEPCIONES' AND COLUMN_NAME='SOLICITUD_ID')
      ALTER TABLE ASISTENCIA_EXCEPCIONES ADD SOLICITUD_ID INT NULL;
  `);
}

// POST /api/asistencia/excepciones — marca un día como Vacaciones (AD/TI)
// Si el tipo es VACACIONES, también crea una solicitud APROBADA de 1 día en
// solicitudes_vacaciones para que el día se descuente del pool del agente y
// se refleje en "Vacaciones y Permisos → Días por agente".
exports.marcarExcepcion = async (req, res) => {
  try {
    const { usuarioId, fecha, tipo } = req.body;
    const uid = parseInt(usuarioId, 10);
    const fechaStr = extractDate(fecha);
    const tipoExcepcion = tipo || 'VACACIONES';
    if (!uid || !fechaStr) {
      return res.status(400).json({ success: false, message: 'usuarioId y fecha son requeridos' });
    }
    const creadoPor = req.user?.id || req.user?.userId || 0;
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcepcionesTable(pool);

    // Si ya existe una excepción para ese usuario/fecha, se actualiza el tipo (sin duplicar solicitud)
    const existente = await pool.request()
      .input('uid', sql.Int, uid)
      .input('fecha', sql.NVarChar, fechaStr)
      .query('SELECT ID, SOLICITUD_ID FROM ASISTENCIA_EXCEPCIONES WHERE NEUS_ID=@uid AND FECHA=@fecha');

    if (existente.recordset.length > 0) {
      await pool.request()
        .input('id', sql.Int, existente.recordset[0].ID)
        .input('tipo', sql.NVarChar, tipoExcepcion)
        .query('UPDATE ASISTENCIA_EXCEPCIONES SET TIPO=@tipo WHERE ID=@id');
      return res.json({ success: true, id: existente.recordset[0].ID, message: 'Excepción actualizada' });
    }

    // Crear la solicitud de vacaciones vinculada (solo tipo VACACIONES)
    let solicitudId = null;
    if (tipoExcepcion === 'VACACIONES') {
      const userRes = await pool.request()
        .input('uid', sql.Int, uid)
        .query('SELECT NEUS_NOMBRES, NEUS_TIPOUSUARIO FROM NEUS_USUARIOS WHERE NEUS_ID=@uid');
      const userRow = userRes.recordset[0];
      const solResult = await pool.request()
        .input('numeroPersonal', sql.Int, uid)
        .input('nombreEmpleado', sql.NVarChar, userRow?.NEUS_NOMBRES || '')
        .input('puesto', sql.NVarChar, userRow?.NEUS_TIPOUSUARIO || '')
        .input('fechaInicio', sql.Date, fechaStr)
        .input('fechaFin', sql.Date, fechaStr)
        .input('creadoPorNombre', sql.NVarChar, `Marcado desde Asistencia (usuario #${creadoPor})`)
        .query(`
          INSERT INTO [dbo].[solicitudes_vacaciones]
          (numero_personal, nombre_empleado, puesto, departamento, tipo_solicitud,
           fecha_inicio, fecha_fin, dias_solicitados, turno_original, email_solicitante,
           descontados_permisos_goce, descontados_vacaciones, estado, comentario_admin, revisado_por)
          OUTPUT INSERTED.id
          VALUES (@numeroPersonal, @nombreEmpleado, @puesto, '', '0200',
                  @fechaInicio, @fechaFin, 1, '', '',
                  0, 1, 'APROBADA', @creadoPorNombre, @creadoPorNombre)
        `);
      solicitudId = solResult.recordset[0].id;
    }

    const result = await pool.request()
      .input('uid', sql.Int, uid)
      .input('fecha', sql.NVarChar, fechaStr)
      .input('tipo', sql.NVarChar, tipoExcepcion)
      .input('creadoPor', sql.Int, creadoPor)
      .input('solicitudId', sql.Int, solicitudId)
      .query(`
        INSERT INTO ASISTENCIA_EXCEPCIONES (NEUS_ID, FECHA, TIPO, CREADO_POR, SOLICITUD_ID)
        OUTPUT INSERTED.ID
        VALUES (@uid, @fecha, @tipo, @creadoPor, @solicitudId)
      `);

    if (solicitudId) notifyVacacionesDiasActualizados(uid, req.user?.empresa);

    return res.status(201).json({ success: true, id: result.recordset[0].ID, solicitudId, message: 'Marcado como vacaciones' });
  } catch (e) {
    console.error('Error marcarExcepcion:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al marcar la excepción' });
  }
};

// DELETE /api/asistencia/excepciones/:id — quita la marca de vacaciones (AD/TI)
// También cancela la solicitud de vacaciones vinculada, si existe, para devolver el día al pool.
exports.eliminarExcepcion = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcepcionesTable(pool);

    const existente = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT NEUS_ID, SOLICITUD_ID FROM ASISTENCIA_EXCEPCIONES WHERE ID=@id');
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Excepción no encontrada' });
    }
    const { NEUS_ID: excepcionUid, SOLICITUD_ID: solicitudId } = existente.recordset[0];

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM ASISTENCIA_EXCEPCIONES WHERE ID=@id');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, message: 'Excepción no encontrada' });
    }

    if (solicitudId) {
      await pool.request()
        .input('sid', sql.Int, solicitudId)
        .query(`UPDATE [dbo].[solicitudes_vacaciones] SET estado='CANCELADA' WHERE id=@sid`);
      notifyVacacionesDiasActualizados(excepcionUid, req.user?.empresa);
    }

    return res.json({ success: true, message: 'Excepción eliminada' });
  } catch (e) {
    console.error('Error eliminarExcepcion:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al eliminar la excepción' });
  }
};

// GET /api/asistencia/excepciones?desde=&hasta= — lista excepciones en un rango (AD/TI)
exports.getExcepciones = async (req, res) => {
  try {
    const desde = extractDate(req.query.desde) || new Date().toISOString().slice(0, 10);
    const hasta = extractDate(req.query.hasta) || desde;
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcepcionesTable(pool);
    const result = await pool.request()
      .input('desde', sql.NVarChar, desde)
      .input('hasta', sql.NVarChar, hasta)
      .query(`
        SELECT e.ID as id, e.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as nombre, nu.NEUS_TIPOUSUARIO as rol,
               FORMAT(e.FECHA, 'yyyy-MM-dd') as fecha, e.TIPO as tipo,
               e.CREADO_POR as creadoPor, FORMAT(e.FECHA_CREACION, 'yyyy-MM-dd HH:mm') as fechaCreacion
        FROM ASISTENCIA_EXCEPCIONES e
        INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = e.NEUS_ID
        WHERE e.FECHA >= @desde AND e.FECHA <= @hasta
        ORDER BY e.FECHA DESC, nu.NEUS_NOMBRES ASC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getExcepciones:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener excepciones' });
  }
};

/* ══════════════════════════════════════════════════════
   USUARIOS EXENTOS DE ASISTENCIA
   Personas que existen en el sistema (ej. directivos,
   cuentas de prueba) pero que no deben contarse ni como
   falta ni como retardo en ningún reporte. Exención
   permanente hasta que un AD/TI la quite.
══════════════════════════════════════════════════════ */
async function ensureExentosTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_EXENTOS' AND xtype='U')
    CREATE TABLE ASISTENCIA_EXENTOS (
      ID              INT IDENTITY(1,1) PRIMARY KEY,
      NEUS_ID         INT NOT NULL UNIQUE,
      MOTIVO          NVARCHAR(200) NULL,
      CREADO_POR      INT NOT NULL,
      FECHA_CREACION  DATETIME DEFAULT GETDATE()
    )
  `);
}

// GET /api/asistencia/exentos — lista usuarios exentos (AD/TI)
exports.getExentos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExentosTable(pool);
    const result = await pool.request().query(`
      SELECT ex.ID as id, ex.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as nombre, nu.NEUS_TIPOUSUARIO as rol,
             ex.MOTIVO as motivo, FORMAT(ex.FECHA_CREACION, 'yyyy-MM-dd HH:mm') as fechaCreacion
      FROM ASISTENCIA_EXENTOS ex
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = ex.NEUS_ID
      ORDER BY nu.NEUS_NOMBRES ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getExentos:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener usuarios exentos' });
  }
};

// POST /api/asistencia/exentos — marca a un usuario como exento (AD/TI)
exports.marcarExento = async (req, res) => {
  try {
    const { usuarioId, motivo } = req.body;
    const uid = parseInt(usuarioId, 10);
    if (!uid) return res.status(400).json({ success: false, message: 'usuarioId requerido' });
    const creadoPor = req.user?.id || req.user?.userId || 0;
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExentosTable(pool);
    const result = await pool.request()
      .input('uid', sql.Int, uid)
      .input('motivo', sql.NVarChar, motivo || null)
      .input('creadoPor', sql.Int, creadoPor)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXENTOS WHERE NEUS_ID = @uid)
          INSERT INTO ASISTENCIA_EXENTOS (NEUS_ID, MOTIVO, CREADO_POR) OUTPUT INSERTED.ID
          VALUES (@uid, @motivo, @creadoPor)
        ELSE
          SELECT ID FROM ASISTENCIA_EXENTOS WHERE NEUS_ID = @uid
      `);
    return res.status(201).json({ success: true, id: result.recordset[0].ID, message: 'Usuario marcado como exento' });
  } catch (e) {
    console.error('Error marcarExento:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al marcar como exento' });
  }
};

// DELETE /api/asistencia/exentos/:id — quita la exención (AD/TI)
exports.quitarExento = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExentosTable(pool);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM ASISTENCIA_EXENTOS WHERE ID=@id');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, message: 'Registro no encontrado' });
    }
    return res.json({ success: true, message: 'Exención removida' });
  } catch (e) {
    console.error('Error quitarExento:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al quitar la exención' });
  }
};

/* ══════════════════════════════════════════════════════
   ALERTA DE POSIBLE BAJA POR FALTAS ACUMULADAS
   Regla configurable (activar/desactivar + umbral de días de
   falta en el mes). Al superarse, notifica in-app y por correo
   a los usuarios (AD/TI) seleccionados como destinatarios.
   Una sola alerta por usuario/mes (no se repite cada día).
══════════════════════════════════════════════════════ */
async function ensureBajasConfigTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_CONFIG_BAJAS' AND xtype='U')
    CREATE TABLE ASISTENCIA_CONFIG_BAJAS (
      ID                 INT IDENTITY(1,1) PRIMARY KEY,
      ACTIVO             BIT NOT NULL DEFAULT 0,
      DIAS_FALTA_UMBRAL  INT NOT NULL DEFAULT 3,
      FECHA_MOD          DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

async function ensureBajasDestinatariosTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_BAJAS_DESTINATARIOS' AND xtype='U')
    CREATE TABLE ASISTENCIA_BAJAS_DESTINATARIOS (
      NEUS_ID  INT NOT NULL PRIMARY KEY
    )
  `);
}

// Historial append-only: una fila por cada racha que llegó a disparar la alerta
// (puede haber varias por usuario a lo largo del tiempo, una por cada racha distinta).
async function ensureAlertasBajaTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_ALERTAS_BAJA' AND xtype='U')
    CREATE TABLE ASISTENCIA_ALERTAS_BAJA (
      ID              INT IDENTITY(1,1) PRIMARY KEY,
      NEUS_ID         INT NOT NULL,
      DIAS_CONSECUTIVOS INT NOT NULL,
      FECHA_ULTIMA_FALTA DATE NOT NULL,
      FECHA_CREACION  DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

// Estado de la racha actual por usuario: se actualiza en cada evaluación diaria.
// RACHA_DIAS = días laborales consecutivos sin marcar hasta la fecha evaluada.
// ALERTADO = ya se avisó por esta racha (evita repetir el correo cada día mientras
// la racha sigue creciendo); se resetea a 0 en cuanto el empleado vuelve a marcar.
async function ensureRachaFaltasTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_RACHA_FALTAS' AND xtype='U')
    CREATE TABLE ASISTENCIA_RACHA_FALTAS (
      NEUS_ID             INT NOT NULL PRIMARY KEY,
      RACHA_DIAS          INT NOT NULL DEFAULT 0,
      FECHA_ULTIMA_FALTA  DATE NULL,
      ALERTADO            BIT NOT NULL DEFAULT 0,
      FECHA_MOD           DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

// GET /api/asistencia/bajas/config — regla activo/umbral (AD/TI)
exports.getBajasConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureBajasConfigTable(pool);
    const r = await pool.request().query('SELECT TOP 1 * FROM ASISTENCIA_CONFIG_BAJAS ORDER BY ID DESC');
    const row = r.recordset[0];
    return res.json({
      success: true,
      data: {
        activo: row ? Boolean(row.ACTIVO) : false,
        diasFaltaUmbral: row ? Number(row.DIAS_FALTA_UMBRAL) : 3,
      },
    });
  } catch (e) {
    console.error('Error getBajasConfig:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener la configuración' });
  }
};

// PUT /api/asistencia/bajas/config — actualiza activo/umbral (AD only)
exports.updateBajasConfig = async (req, res) => {
  try {
    const { activo, diasFaltaUmbral } = req.body;
    const umbral = parseInt(diasFaltaUmbral, 10);
    if (!umbral || umbral < 1) {
      return res.status(400).json({ success: false, message: 'diasFaltaUmbral debe ser un entero mayor a 0' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureBajasConfigTable(pool);
    const existe = await pool.request().query('SELECT TOP 1 ID FROM ASISTENCIA_CONFIG_BAJAS ORDER BY ID DESC');
    if (existe.recordset.length > 0) {
      await pool.request()
        .input('id', sql.Int, existe.recordset[0].ID)
        .input('activo', sql.Bit, activo ? 1 : 0)
        .input('umbral', sql.Int, umbral)
        .query('UPDATE ASISTENCIA_CONFIG_BAJAS SET ACTIVO=@activo, DIAS_FALTA_UMBRAL=@umbral, FECHA_MOD=GETDATE() WHERE ID=@id');
    } else {
      await pool.request()
        .input('activo', sql.Bit, activo ? 1 : 0)
        .input('umbral', sql.Int, umbral)
        .query('INSERT INTO ASISTENCIA_CONFIG_BAJAS (ACTIVO, DIAS_FALTA_UMBRAL) VALUES (@activo, @umbral)');
    }
    return res.json({ success: true, message: 'Configuración actualizada' });
  } catch (e) {
    console.error('Error updateBajasConfig:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al actualizar la configuración' });
  }
};

// GET /api/asistencia/bajas/destinatarios — usuarios AD/TI que reciben la alerta (AD/TI)
exports.getBajasDestinatarios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureBajasDestinatariosTable(pool);
    const r = await pool.request().query(`
      SELECT nu.NEUS_ID as id, nu.NEUS_NOMBRES as nombre, nu.NEUS_TIPOUSUARIO as rol,
             nu.NEUS_CORREO as correo,
             CASE WHEN d.NEUS_ID IS NOT NULL THEN 1 ELSE 0 END as seleccionado
      FROM NEUS_USUARIOS nu
      LEFT JOIN ASISTENCIA_BAJAS_DESTINATARIOS d ON d.NEUS_ID = nu.NEUS_ID
      WHERE nu.NEUS_ACTIVO = 1 AND nu.NEUS_TIPOUSUARIO IN ('AD','TI')
      ORDER BY nu.NEUS_NOMBRES ASC
    `);
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('Error getBajasDestinatarios:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener destinatarios' });
  }
};

// PUT /api/asistencia/bajas/destinatarios — reemplaza la lista completa de destinatarios (AD only)
// Body: { usuarioIds: number[] }
exports.setBajasDestinatarios = async (req, res) => {
  try {
    const { usuarioIds } = req.body;
    if (!Array.isArray(usuarioIds)) {
      return res.status(400).json({ success: false, message: 'usuarioIds debe ser un array' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureBajasDestinatariosTable(pool);
    await pool.request().query('DELETE FROM ASISTENCIA_BAJAS_DESTINATARIOS');
    for (const uid of usuarioIds) {
      const id = parseInt(uid, 10);
      if (!id) continue;
      await pool.request().input('uid', sql.Int, id)
        .query('INSERT INTO ASISTENCIA_BAJAS_DESTINATARIOS (NEUS_ID) VALUES (@uid)');
    }
    return res.json({ success: true, message: 'Destinatarios actualizados' });
  } catch (e) {
    console.error('Error setBajasDestinatarios:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al actualizar destinatarios' });
  }
};

// GET /api/asistencia/bajas/alertas — historial de alertas disparadas (AD/TI)
exports.getAlertasBaja = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureAlertasBajaTable(pool);
    const r = await pool.request().query(`
      SELECT a.ID as id, a.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as nombre, nu.NEUS_TIPOUSUARIO as rol,
             a.DIAS_CONSECUTIVOS as diasConsecutivos,
             FORMAT(a.FECHA_ULTIMA_FALTA, 'yyyy-MM-dd') as fechaUltimaFalta,
             FORMAT(a.FECHA_CREACION, 'yyyy-MM-dd HH:mm') as fechaCreacion
      FROM ASISTENCIA_ALERTAS_BAJA a
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.NEUS_ID
      ORDER BY a.FECHA_CREACION DESC
    `);
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('Error getAlertasBaja:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener alertas' });
  }
};

// Cuenta la racha de días laborales CONSECUTIVOS sin marcar hasta `hastaFecha` (inclusive):
// va día por día hacia atrás desde `hastaFecha`, saltando los días que el rol no
// trabaja (fuera de DIA_INICIO/DIA_FIN), y se detiene en cuanto encuentra un día
// laboral con entrada registrada o con excepción (vacación/permiso) — ese día "corta"
// la racha, así que no cuenta ni los días antes de él.
async function contarRachaFaltasConsecutivas(pool, neusId, rol, hastaFecha) {
  const horarios = await getHorariosPorRol(pool);
  const regla = horarios[rol] || HORARIOS_FALLBACK.AD;
  const r = await pool.request()
    .input('neusId', sql.Int, neusId)
    .input('hasta', sql.NVarChar, hastaFecha.toISOString().slice(0, 10))
    .input('diaInicio', sql.TinyInt, regla.diaInicio ?? 1)
    .input('diaFin', sql.TinyInt, regla.diaFin ?? 5)
    .query(`
      WITH Fechas AS (
        SELECT CAST(@hasta AS date) AS f, 0 AS n
        UNION ALL
        SELECT DATEADD(day, -1, f), n + 1 FROM Fechas WHERE n < 60
      ),
      DiasLaborales AS (
        SELECT f, n FROM Fechas
        WHERE (
          (@diaInicio <= @diaFin AND (DATEPART(WEEKDAY, f) - 1) BETWEEN @diaInicio AND @diaFin)
          OR
          (@diaInicio > @diaFin AND ((DATEPART(WEEKDAY, f) - 1) >= @diaInicio OR (DATEPART(WEEKDAY, f) - 1) <= @diaFin))
        )
      ),
      DiasConEstado AS (
        SELECT f,
          ROW_NUMBER() OVER (ORDER BY f DESC) AS orden,
          CASE WHEN EXISTS (SELECT 1 FROM ASISTENCIA_ENTRADAS p WHERE p.FECHA = f AND p.NEUS_ID = @neusId)
                 OR EXISTS (SELECT 1 FROM ASISTENCIA_EXCEPCIONES ex WHERE ex.FECHA = f AND ex.NEUS_ID = @neusId)
               THEN 1 ELSE 0 END AS presente
        FROM DiasLaborales
      ),
      -- Primer día laboral (el más reciente) que SÍ tiene registro — corta la racha ahí.
      PrimerCorte AS (
        SELECT MIN(orden) AS orden FROM DiasConEstado WHERE presente = 1
      )
      SELECT COUNT(*) AS racha, MAX(f) AS ultimaFalta
      FROM DiasConEstado
      WHERE orden < ISNULL((SELECT orden FROM PrimerCorte), 999999)
      OPTION (MAXRECURSION 60)
    `);
  return {
    racha: r.recordset[0]?.racha ?? 0,
    ultimaFalta: r.recordset[0]?.ultimaFalta ?? null,
  };
}

// Evalúa la racha de faltas consecutivas de un empleado y dispara la alerta si supera
// el umbral configurado. Se llama diariamente (cron) para TODOS los empleados activos,
// sin importar si marcaron o no ese día — es la única forma de detectar una racha que
// sigue creciendo sin ningún evento propio que la dispare.
async function evaluarPosibleBaja(pool, neusId, fecha, tenantKey) {
  try {
    await ensureBajasConfigTable(pool);
    await ensureBajasDestinatariosTable(pool);
    await ensureAlertasBajaTable(pool);
    await ensureRachaFaltasTable(pool);

    const cfgR = await pool.request().query('SELECT TOP 1 * FROM ASISTENCIA_CONFIG_BAJAS ORDER BY ID DESC');
    const cfg = cfgR.recordset[0];
    if (!cfg || !cfg.ACTIVO) return;

    const usuarioR = await pool.request().input('neusId', sql.Int, neusId)
      .query('SELECT NEUS_NOMBRES, NEUS_TIPOUSUARIO, NEUS_ACTIVO FROM NEUS_USUARIOS WHERE NEUS_ID=@neusId');
    const usuario = usuarioR.recordset[0];
    if (!usuario || !usuario.NEUS_ACTIVO) return;

    const exento = await pool.request().input('neusId', sql.Int, neusId)
      .query('SELECT 1 FROM ASISTENCIA_EXENTOS WHERE NEUS_ID=@neusId');
    if (exento.recordset.length > 0) return;

    const { racha, ultimaFalta } = await contarRachaFaltasConsecutivas(pool, neusId, usuario.NEUS_TIPOUSUARIO, fecha);

    // Persistir el estado de la racha (para que la UI/futuras corridas sepan dónde va).
    // Si la racha se rompió (racha=0), también resetea ALERTADO para poder re-avisar
    // si el empleado vuelve a acumular faltas más adelante.
    await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('racha', sql.Int, racha)
      .input('ultimaFalta', sql.NVarChar, ultimaFalta ? new Date(ultimaFalta).toISOString().slice(0, 10) : null)
      .query(`
        MERGE ASISTENCIA_RACHA_FALTAS AS t
        USING (SELECT @neusId AS NEUS_ID) AS s ON t.NEUS_ID = s.NEUS_ID
        WHEN MATCHED THEN UPDATE SET
          RACHA_DIAS = @racha,
          FECHA_ULTIMA_FALTA = @ultimaFalta,
          ALERTADO = CASE WHEN @racha = 0 THEN 0 ELSE t.ALERTADO END,
          FECHA_MOD = GETDATE()
        WHEN NOT MATCHED THEN INSERT (NEUS_ID, RACHA_DIAS, FECHA_ULTIMA_FALTA, ALERTADO)
          VALUES (@neusId, @racha, @ultimaFalta, 0);
      `);

    if (racha < cfg.DIAS_FALTA_UMBRAL) return;

    // Ya se avisó por esta misma racha (sigue activa, sin romperse) — no repetir cada día.
    const estadoR = await pool.request().input('neusId', sql.Int, neusId)
      .query('SELECT ALERTADO FROM ASISTENCIA_RACHA_FALTAS WHERE NEUS_ID=@neusId');
    if (estadoR.recordset[0]?.ALERTADO) return;

    const insert = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('racha', sql.Int, racha)
      .input('ultimaFalta', sql.NVarChar, ultimaFalta ? new Date(ultimaFalta).toISOString().slice(0, 10) : fecha.toISOString().slice(0, 10))
      .query(`
        INSERT INTO ASISTENCIA_ALERTAS_BAJA (NEUS_ID, DIAS_CONSECUTIVOS, FECHA_ULTIMA_FALTA)
        OUTPUT INSERTED.ID VALUES (@neusId, @racha, @ultimaFalta)
      `);
    const alertaId = insert.recordset[0].ID;

    await pool.request().input('neusId', sql.Int, neusId)
      .query('UPDATE ASISTENCIA_RACHA_FALTAS SET ALERTADO = 1 WHERE NEUS_ID=@neusId');

    const destinatariosR = await pool.request().query(`
      SELECT nu.NEUS_ID as id, nu.NEUS_CORREO as correo
      FROM ASISTENCIA_BAJAS_DESTINATARIOS d
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = d.NEUS_ID
      WHERE nu.NEUS_ACTIVO = 1
    `);
    if (destinatariosR.recordset.length === 0) return;

    const mensaje = `${usuario.NEUS_NOMBRES} acumula ${racha} días de falta consecutivos. Posible baja.`;

    for (const dest of destinatariosR.recordset) {
      await notificationService.createNotification({
        usuarioId: dest.id,
        tipo: 'posible_baja',
        mensaje,
        dataExtra: { alertaId, neusId },
        tenantKey,
      });
    }

    const correos = destinatariosR.recordset.map(d => d.correo).filter(Boolean);
    if (correos.length > 0) {
      await emailService.sendPosibleBajaEmail({
        to: correos,
        nombreEmpleado: usuario.NEUS_NOMBRES,
        rol: usuario.NEUS_TIPOUSUARIO,
        totalFaltas: racha,
        umbral: cfg.DIAS_FALTA_UMBRAL,
      });
    }
  } catch (e) {
    console.error('Error evaluando posible baja:', e?.message);
  }
}
exports.evaluarPosibleBaja = evaluarPosibleBaja;

// Recorre todos los empleados activos y evalúa la alerta de posible baja para el mes
// actual. Se usa desde un cron diario porque una falta, a diferencia de un retardo,
// no dispara ningún evento propio (nadie "marca" una ausencia).
async function evaluarPosibleBajaTodos(pool, tenantKey) {
  const cfgR = await pool.request().query('SELECT TOP 1 * FROM ASISTENCIA_CONFIG_BAJAS ORDER BY ID DESC');
  if (!cfgR.recordset[0]?.ACTIVO) return;
  const empleadosR = await pool.request().query(`
    SELECT NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 AND NEUS_TIPOUSUARIO IN ('CC','AD','TI')
  `);
  for (const emp of empleadosR.recordset) {
    await evaluarPosibleBaja(pool, emp.NEUS_ID, new Date(), tenantKey);
  }
}
exports.evaluarPosibleBajaTodos = evaluarPosibleBajaTodos;

// Cron: todos los días a las 21:00 revisa faltas acumuladas del mes en curso
// (después de que ya se pudo haber marcado entrada/BioTime del día).
cron.schedule('0 21 * * *', async () => {
  for (const { key } of require('../config/tenants').listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      await evaluarPosibleBajaTodos(pool, key);
    } catch (e) {
      console.error(`[CRON posible-baja][${key}] Error:`, e?.message);
    }
  }
}, { timezone: 'America/Mexico_City' });

// Mapeo de texto de área del Excel → código de rol interno
const AREA_ROL_MAP = {
  'ADMINISTRACIÓN': 'AD', 'ADMINISTRACION': 'AD', 'ADMINISTRACIÓN ': 'AD',
  'TI SOPORTE': 'TI', 'TI SOPORTE  ': 'TI', 'TI': 'TI',
  'CALL CENTER': 'CC', 'CALL CENTER ': 'CC',
  // Filas de encabezado repetido que actúan como separadores — se ignoran sin resetear rolActual
  'COLABORADOR': '_SKIP', 'COLABORADORES': '_SKIP',
};

function excelSerialToDateStr(serial) {
  // Excel serial -> Date (ajuste por bug de 1900: Excel cuenta 1900-02-29 que no existe)
  const d = new Date((serial - 25569) * 86400 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseHoraFromCell(val) {
  if (!val && val !== 0) return null;
  // Puede ser un número decimal (fracción del día) o string "HH:mm:ss"
  if (typeof val === 'number') {
    const totalSeg = Math.round(val * 24 * 3600);
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const match = val.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}:${(match[3] || '00').padStart(2, '0')}`;
  }
  return null;
}

function minutosRetardo(horaEntrada, horaEsperada) {
  const [eh, em, es = 0] = horaEntrada.split(':').map(Number);
  const [lh, lm] = horaEsperada.split(':').map(Number);
  const diffSeg = (eh * 3600 + em * 60 + es) - (lh * 3600 + lm * 60);
  return diffSeg > 0 ? Math.floor(diffSeg / 60) : 0;
}

// POST /api/asistencia/upload-biometrico — carga masiva desde Excel biométrico (solo AD)
exports.uploadBiometrico = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Si el libro tiene múltiples hojas, elegir la que tenga más datos de asistencia
    // (la hoja del mes actual, no la primera hoja que puede ser de un mes pasado)
    const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const mesActual = MESES_ES[new Date().getMonth()];
    let wsName = wb.SheetNames[0];
    // 1. Buscar hoja cuyo nombre contenga el mes actual
    const hojaDelMes = wb.SheetNames.find(n => n.toLowerCase().includes(mesActual));
    if (hojaDelMes) {
      wsName = hojaDelMes;
    } else if (wb.SheetNames.length > 1) {
      // 2. Si no hay hoja del mes, usar la que tenga más celdas con seriales de fecha
      let maxFechas = -1;
      for (const shName of wb.SheetNames) {
        const shRows = XLSX.utils.sheet_to_json(wb.Sheets[shName], { header: 1, defval: null });
        const count = shRows.flat().filter(v => typeof v === 'number' && v > 45000).length;
        if (count > maxFechas) { maxFechas = count; wsName = shName; }
      }
    }

    const ws = wb.Sheets[wsName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    console.log('[BIOMETRICO] Leyendo hoja:', wsName, '— filas:', rows.length);

    const pool = await databaseService.getPool(req.user?.empresa);
    const horarios = await getHorariosPorRol(pool);

    // Buscar todos los colaboradores activos para mapear nombre → NEUS_ID
    const usersResult = await pool.request().query(
      `SELECT NEUS_ID, NEUS_NOMBRES, NEUS_TIPOUSUARIO FROM NEUS_USUARIOS`
    );
    const usuarios = usersResult.recordset;

    // Normalizar nombre para matching (sin tildes, sin espacios extra, lowercase)
    function normalizar(s) {
      return (s || '').toString().trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    function findUser(nombreExcel) {
      // Si el nombre viene con prefijo "ID - Nombre" (ej: "145 - DIEGO ARMANDO"), buscar por ID primero
      const prefixMatch = nombreExcel.trim().match(/^(\d+)\s*-\s*/);
      if (prefixMatch) {
        const idFromExcel = parseInt(prefixMatch[1], 10);
        const byId = usuarios.find(u => u.NEUS_ID === idFromExcel);
        if (byId) return byId;
        // Si no está activo o no existe, intentar con el nombre restante
        nombreExcel = nombreExcel.trim().slice(prefixMatch[0].length).trim();
      }

      const norm = normalizar(nombreExcel);
      const palabrasExcel = norm.split(/\s+/).filter(p => p.length > 2);

      // 1. Exacta
      let found = usuarios.find(u => normalizar(u.NEUS_NOMBRES) === norm);
      if (found) return found;

      // 2. Contención directa (el nombre del Excel está dentro del nombre BD o viceversa)
      found = usuarios.find(u => {
        const un = normalizar(u.NEUS_NOMBRES);
        return un.includes(norm) || norm.includes(un);
      });
      if (found) return found;

      // 3. Todas las palabras del Excel presentes en el nombre BD
      if (palabrasExcel.length >= 2) {
        found = usuarios.find(u => {
          const un = normalizar(u.NEUS_NOMBRES);
          return palabrasExcel.every(p => un.includes(p));
        });
        if (found) return found;
      }

      // 4. Primera y última palabra del Excel ambas presentes en el nombre BD
      if (palabrasExcel.length >= 2) {
        const primera = palabrasExcel[0];
        const ultima  = palabrasExcel[palabrasExcel.length - 1];
        found = usuarios.find(u => {
          const un = normalizar(u.NEUS_NOMBRES);
          return un.includes(primera) && un.includes(ultima);
        });
        if (found) return found;
      }

      // 5. Solo primer nombre (para casos como "MARY", "IVETH" — solo si es único)
      if (palabrasExcel.length === 1) {
        const matches = usuarios.filter(u => normalizar(u.NEUS_NOMBRES).startsWith(palabrasExcel[0]));
        if (matches.length === 1) return matches[0];
      }

      return null;
    }

    let insertados = 0;
    let saltados = 0;
    let noEncontrados = [];
    let errores = [];

    let rolActual = null;
    let fechas = []; // array de strings 'YYYY-MM-DD', índice = posición de columna desde C (índice 2)

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || row.length === 0) continue;

      const colA = row[0] ? row[0].toString().trim() : '';
      const colB = row[1] ? row[1].toString().trim() : '';

      // Detectar fila de área (contiene nombre de área en A y "JORNADA LABORAL" en B)
      if (colB.toUpperCase().includes('JORNADA LABORAL') || AREA_ROL_MAP[colA.toUpperCase()]) {
        const rolDetectado = AREA_ROL_MAP[colA.toUpperCase()];
        if (rolDetectado === '_SKIP') { continue; } // encabezado repetido — mantener rolActual
        if (rolDetectado) {
          rolActual = rolDetectado;
          // Las fechas están en columna C en adelante (cada 3 columnas: ENTRADA, SALIDA, HORAS)
          // Fila de área: [Área, JORNADA LABORAL, fecha1, null, null, fecha2, null, null, ...]
          fechas = [];
          for (let ci = 2; ci < row.length; ci++) {
            if (typeof row[ci] === 'number' && row[ci] > 40000) {
              // Es un número serial de fecha Excel
              fechas.push({ dateStr: excelSerialToDateStr(row[ci]), colIdx: ci });
            } else {
              fechas.push(null);
            }
          }
        }
        continue;
      }

      // Fila de encabezado de columnas (COLABORADOR, HORARIO, ENTRADA, SALIDA...)
      if (colA.toUpperCase().includes('COLABORADOR')) continue;

      // Fila de datos de colaborador
      if (!rolActual || !colA || colA.length < 2) continue;
      // Ignorar filas de totales/secciones (colA todo mayúsculas y sin dígitos → es encabezado de sección)
      if (!colA.match(/[a-záéíóúüñ]/i) && !colA.match(/\d/)) continue;

      const user = findUser(colA);
      if (!user) {
        if (!noEncontrados.includes(colA)) noEncontrados.push(colA);
        saltados++;
        continue;
      }

      const neusId = user.NEUS_ID;
      const reglaRol = horarios[rolActual] || HORARIOS_FALLBACK.AD;
      const horaEsperada = (reglaRol.entrada || '09:00:00').slice(0, 5);
      const toleranciaRol = reglaRol.tolerancia ?? 5;

      // Iterar sobre las fechas detectadas
      for (let fi = 0; fi < fechas.length; fi++) {
        const fechaInfo = fechas[fi];
        if (!fechaInfo) continue;

        // La columna de ENTRADA para esta fecha es fechaInfo.colIdx
        const colEntrada = fechaInfo.colIdx;
        const horaEntradaRaw = row[colEntrada];
        const horaEntrada = parseHoraFromCell(horaEntradaRaw);

        if (!horaEntrada) continue; // Sin registro de entrada ese día

        // Calcular retardo contra la regla vigente del área (ASISTENCIA_HORARIOS)
        const minRet = minutosRetardo(horaEntrada, horaEsperada);
        const esRetardo = minRet > toleranciaRol;

        const fechaStr = fechaInfo.dateStr;
        // Pasar como string y convertir dentro de SQL Server para evitar
        // que Node.js interprete la hora como UTC y desplace 6 horas al guardarse
        const horaEntradaStr = `${fechaStr} ${horaEntrada}`;
        const horaEsperadaStr = `${fechaStr} ${horaEsperada}:00`;

        try {
          await pool.request()
            .input('neusId', sql.Int, neusId)
            .input('fecha', sql.NVarChar, fechaStr)
            .input('rol', sql.NVarChar, rolActual)
            .input('horaEntrada', sql.NVarChar, horaEntradaStr)
            .input('horaEsperada', sql.NVarChar, horaEsperadaStr)
            .input('minutosRetardo', sql.Int, minRet)
            .input('esRetardo', sql.Bit, esRetardo ? 1 : 0)
            .query(`
              MERGE ASISTENCIA_ENTRADAS AS target
              USING (VALUES (@neusId, @fecha)) AS src(neusId, fecha)
                ON target.NEUS_ID = src.neusId AND target.FECHA = src.fecha
              WHEN MATCHED THEN
                UPDATE SET
                  ROL = @rol,
                  HORA_ENTRADA = CONVERT(datetime, @horaEntrada, 120),
                  HORA_ESPERADA = CONVERT(datetime, @horaEsperada, 120),
                  MINUTOS_RETARDO = @minutosRetardo,
                  ES_RETARDO = @esRetardo
              WHEN NOT MATCHED THEN
                INSERT (NEUS_ID, FECHA, ROL, HORA_ENTRADA, HORA_ESPERADA, MINUTOS_RETARDO, ES_RETARDO)
                VALUES (@neusId, @fecha, @rol, CONVERT(datetime, @horaEntrada, 120), CONVERT(datetime, @horaEsperada, 120), @minutosRetardo, @esRetardo);
            `);

          insertados++;
        } catch (insErr) {
          errores.push(`${colA} / ${fechaStr}: ${insErr.message}`);
        }
      }
    }

    return res.json({
      success: true,
      insertados,
      saltados,
      noEncontrados,
      errores: errores.slice(0, 10),
      mensaje: `Se insertaron ${insertados} registros. ${saltados} ya existían o se omitieron.`,
    });
  } catch (e) {
    console.error('Error uploadBiometrico:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al procesar el archivo: ' + e?.message });
  }
};

// POST /api/asistencia/sync-biotime — sincronización desde BioTime (JSON) (solo AD)
// Body: { registros: [{ emp_code, punch_time, biotime_id }] }
exports.syncBiotime = async (req, res) => {
  try {
    const { registros } = req.body;
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ success: false, message: 'Se requiere un array "registros" no vacío' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const horarios = await getHorariosPorRol(pool);

    const usersResult = await pool.request().query(
      `SELECT NEUS_ID, NEUS_NOMBRES, NEUS_TIPOUSUARIO, NEUS_ACTIVO FROM NEUS_USUARIOS`
    );
    const usuarios = usersResult.recordset;

    const mapResult = await pool.request().query(
      `SELECT EMP_CODE, NEUS_ID FROM BIOTIME_CHECADOR_MAP`
    );
    const empCodeMap = {};
    mapResult.recordset.forEach(r => { empCodeMap[r.EMP_CODE] = r.NEUS_ID; });

    function normalizar(s) {
      return (s || '').toString().trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    function findUserByNombre(nombre) {
      const norm = normalizar(nombre);
      const palabras = norm.split(/\s+/).filter(p => p.length > 2);
      let found = usuarios.find(u => normalizar(u.NEUS_NOMBRES) === norm);
      if (found) return found;
      found = usuarios.find(u => {
        const un = normalizar(u.NEUS_NOMBRES);
        return un.includes(norm) || norm.includes(un);
      });
      if (found) return found;
      if (palabras.length >= 2) {
        found = usuarios.find(u => {
          const un = normalizar(u.NEUS_NOMBRES);
          return palabras.every(p => un.includes(p));
        });
        if (found) return found;
        const primera = palabras[0];
        const ultima = palabras[palabras.length - 1];
        found = usuarios.find(u => {
          const un = normalizar(u.NEUS_NOMBRES);
          return un.includes(primera) && un.includes(ultima);
        });
        if (found) return found;
      }
      return null;
    }

    let insertados = 0;
    let actualizados = 0;
    let saltados = 0;
    let sinMapeo = [];
    let alertas = 0;
    const errores = [];

    for (const reg of registros) {
      const { emp_code, punch_time, biotime_id, nombre } = reg;
      if (!emp_code || !punch_time) { saltados++; continue; }

      // Resolver NEUS_ID desde el mapa o por nombre
      let neusId = empCodeMap[emp_code] || null;
      let usuario = null;

      if (!neusId) {
        if (nombre) {
          usuario = findUserByNombre(nombre);
          if (usuario) {
            neusId = usuario.NEUS_ID;
            // Guardar el nuevo mapeo
            try {
              await pool.request()
                .input('neusId', sql.Int, neusId)
                .input('empCode', sql.VarChar, emp_code)
                .query(`
                  IF NOT EXISTS (SELECT 1 FROM BIOTIME_CHECADOR_MAP WHERE EMP_CODE=@empCode)
                    INSERT INTO BIOTIME_CHECADOR_MAP (NEUS_ID, EMP_CODE, METODO)
                    VALUES (@neusId, @empCode, 'AUTO_NOMBRE')
                `);
              empCodeMap[emp_code] = neusId;
            } catch (_e) { /* ignorar duplicado */ }
          }
        }
        if (!neusId) {
          sinMapeo.push(emp_code);
          saltados++;
          continue;
        }
      } else {
        usuario = usuarios.find(u => u.NEUS_ID === neusId);
      }

      // Si el usuario está inactivo → alerta, no insertar en ASISTENCIA_ENTRADAS
      const activo = usuario ? (usuario.NEUS_ACTIVO === true || usuario.NEUS_ACTIVO === 1) : true;
      if (!activo) {
        try {
          await pool.request()
            .input('empCode', sql.VarChar, emp_code)
            .input('neusId', sql.Int, neusId)
            .input('punchTime', sql.NVarChar, punch_time)
            .query(`
              INSERT INTO BIOTIME_SYNC_ALERTAS (EMP_CODE, NEUS_ID, PUNCH_TIME, TIPO)
              VALUES (@empCode, @neusId, CONVERT(datetime, @punchTime, 120), 'USUARIO_INACTIVO_MARCO_ASISTENCIA')
            `);
        } catch (_e) { /* ignorar */ }
        alertas++;
        saltados++;
        continue;
      }

      // Extraer fecha y hora de punch_time ("YYYY-MM-DD HH:mm:ss")
      const punchDate = punch_time.slice(0, 10);
      const punchHora = punch_time.slice(11, 19) || punch_time.slice(11);

      const rol = usuario ? (usuario.NEUS_TIPOUSUARIO || 'CC') : 'CC';
      const reglaRol = horarios[rol] || HORARIOS_FALLBACK.AD;
      const horaEsperada = (reglaRol.entrada || '09:00:00').slice(0, 5);
      const minRet = minutosRetardo(punchHora, horaEsperada);
      const esRetardo = minRet > (reglaRol.tolerancia ?? 5);
      const horaEntradaStr = `${punchDate} ${punchHora}`;
      const horaEsperadaStr = `${punchDate} ${horaEsperada}:00`;

      try {
        if (biotime_id) {
          // Deduplicar por BIOTIME_ID
          const r = await pool.request()
            .input('neusId', sql.Int, neusId)
            .input('fecha', sql.NVarChar, punchDate)
            .input('rol', sql.NVarChar, rol)
            .input('horaEntrada', sql.NVarChar, horaEntradaStr)
            .input('horaEsperada', sql.NVarChar, horaEsperadaStr)
            .input('minutosRetardo', sql.Int, minRet)
            .input('esRetardo', sql.Bit, esRetardo ? 1 : 0)
            .input('biotimeId', sql.Int, biotime_id)
            .query(`
              MERGE ASISTENCIA_ENTRADAS AS target
              USING (VALUES (@biotimeId)) AS src(biotimeId)
                ON target.BIOTIME_ID = src.biotimeId
              WHEN MATCHED THEN
                UPDATE SET
                  NEUS_ID = @neusId,
                  FECHA = CONVERT(date, @fecha, 23),
                  ROL = @rol,
                  HORA_ENTRADA = CONVERT(datetime, @horaEntrada, 120),
                  HORA_ESPERADA = CONVERT(datetime, @horaEsperada, 120),
                  MINUTOS_RETARDO = @minutosRetardo,
                  ES_RETARDO = @esRetardo
              WHEN NOT MATCHED THEN
                INSERT (NEUS_ID, FECHA, ROL, HORA_ENTRADA, HORA_ESPERADA, MINUTOS_RETARDO, ES_RETARDO, BIOTIME_ID)
                VALUES (@neusId, CONVERT(date, @fecha, 23), @rol,
                        CONVERT(datetime, @horaEntrada, 120), CONVERT(datetime, @horaEsperada, 120),
                        @minutosRetardo, @esRetardo, @biotimeId);
              SELECT @@ROWCOUNT AS affected, XACT_STATE() AS xstate;
            `);
          // Si el MERGE hizo UPDATE en lugar de INSERT lo detectamos via rowcount pero
          // simplificamos: siempre incrementar insertados (idempotente)
          insertados++;
        } else {
          // Sin BIOTIME_ID: deduplicar por (NEUS_ID, FECHA) igual que Excel
          await pool.request()
            .input('neusId', sql.Int, neusId)
            .input('fecha', sql.NVarChar, punchDate)
            .input('rol', sql.NVarChar, rol)
            .input('horaEntrada', sql.NVarChar, horaEntradaStr)
            .input('horaEsperada', sql.NVarChar, horaEsperadaStr)
            .input('minutosRetardo', sql.Int, minRet)
            .input('esRetardo', sql.Bit, esRetardo ? 1 : 0)
            .query(`
              MERGE ASISTENCIA_ENTRADAS AS target
              USING (VALUES (@neusId, @fecha)) AS src(neusId, fecha)
                ON target.NEUS_ID = src.neusId AND target.FECHA = src.fecha
              WHEN MATCHED THEN
                UPDATE SET ROL=@rol,
                  HORA_ENTRADA=CONVERT(datetime,@horaEntrada,120),
                  HORA_ESPERADA=CONVERT(datetime,@horaEsperada,120),
                  MINUTOS_RETARDO=@minutosRetardo, ES_RETARDO=@esRetardo
              WHEN NOT MATCHED THEN
                INSERT (NEUS_ID,FECHA,ROL,HORA_ENTRADA,HORA_ESPERADA,MINUTOS_RETARDO,ES_RETARDO)
                VALUES (@neusId,CONVERT(date,@fecha,23),@rol,
                        CONVERT(datetime,@horaEntrada,120),CONVERT(datetime,@horaEsperada,120),
                        @minutosRetardo,@esRetardo);
            `);
          insertados++;
        }
      } catch (e2) {
        errores.push(`${emp_code} / ${punchDate}: ${e2.message}`);
      }
    }

    return res.json({
      success: true,
      insertados,
      actualizados,
      saltados,
      sinMapeo: [...new Set(sinMapeo)],
      alertas,
      errores: errores.slice(0, 20),
    });
  } catch (e) {
    console.error('[syncBiotime] error:', e?.message);
    return res.status(500).json({ success: false, message: e?.message });
  }
};

// GET /api/asistencia/biotime/map — lista de mapeos emp_code → NEUS_ID (solo AD)
exports.getBiotimeMap = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().query(`
      SELECT m.ID, m.EMP_CODE, m.NEUS_ID, u.NEUS_NOMBRES as nombre,
             u.NEUS_TIPOUSUARIO as rol, u.NEUS_ACTIVO as activo,
             CONVERT(varchar(16), m.FECHA_MAPEO, 120) as fechaMapeo, m.METODO
      FROM BIOTIME_CHECADOR_MAP m
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.NEUS_ID
      ORDER BY m.FECHA_MAPEO DESC
    `);
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('[getBiotimeMap] error:', e?.message);
    return res.status(500).json({ success: false, message: e?.message });
  }
};

// GET /api/asistencia/biotime/alertas — log de inactivos que marcaron (solo AD)
// Query params: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&page=1&limit=50
exports.getBiotimeAlertas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const { desde, hasta, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = '';
    const req2 = pool.request()
      .input('limit', sql.Int, Number(limit))
      .input('offset', sql.Int, offset);

    if (desde) { req2.input('desde', sql.NVarChar, desde); where += ` AND CONVERT(date, PUNCH_TIME) >= @desde`; }
    if (hasta) { req2.input('hasta', sql.NVarChar, hasta); where += ` AND CONVERT(date, PUNCH_TIME) <= @hasta`; }

    const r = await req2.query(`
      SELECT a.ID, a.EMP_CODE, a.NEUS_ID, u.NEUS_NOMBRES as nombre,
             CONVERT(varchar(19), a.PUNCH_TIME, 120) as punchTime,
             a.TIPO, CONVERT(varchar(16), a.FECHA_DETECCION, 120) as fechaDeteccion
      FROM BIOTIME_SYNC_ALERTAS a
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.NEUS_ID
      WHERE 1=1 ${where}
      ORDER BY a.PUNCH_TIME DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const req3 = pool.request();
    let where3 = '';
    if (desde) { req3.input('desde3', sql.NVarChar, desde); where3 += ` AND CONVERT(date, PUNCH_TIME) >= @desde3`; }
    if (hasta) { req3.input('hasta3', sql.NVarChar, hasta); where3 += ` AND CONVERT(date, PUNCH_TIME) <= @hasta3`; }
    const countR = await req3.query(`SELECT COUNT(*) as total FROM BIOTIME_SYNC_ALERTAS WHERE 1=1 ${where3}`);

    return res.json({
      success: true,
      data: r.recordset,
      total: countR.recordset[0].total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    console.error('[getBiotimeAlertas] error:', e?.message);
    return res.status(500).json({ success: false, message: e?.message });
  }
};
