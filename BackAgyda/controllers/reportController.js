const sql = require('mssql');
const databaseService = require('../services/databaseService');
const pausaTiposService = require('../services/pausaTiposService');

// status_id de todos los tipos de pausa (configurables en Configuración).
const SQL_PAUSAS = pausaTiposService.sqlPausas();

// Reporte: Agregación de minutos por usuario y por estado entre fechas
exports.getUserTimesReport = async (req, res) => {
  try {
    const { from, to, format } = req.query;
    // Validar fechas mínimas
    if (!from || !to) return res.status(400).json({ success: false, message: 'Parámetros from y to son requeridos (YYYY-MM-DD)' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Formato de fecha inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // Query: sumar minutos por usuario, status_key y día
    const q = `
      SELECT
        u.NEUS_ID as usuarioId,
        u.NEUS_NOMBRES as usuarioNombre,
        ISNULL(s.clave, 'DESCONECTADO') as status_key,
        CAST(ut.fecha_inicio AS date) as dia,
        SUM(CASE WHEN ut.duracion_minutos IS NOT NULL AND ut.duracion_minutos > 0 THEN ut.duracion_minutos
                 ELSE DATEDIFF(MINUTE, ut.fecha_inicio, COALESCE(ut.fecha_fin, SYSUTCDATETIME())) END) as total_minutos
      FROM USUARIO_TIEMPOS ut
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
      LEFT JOIN STATUS s ON s.status_id = ut.status_id
      WHERE CAST(ut.fecha_inicio AS date) >= @fromDate AND CAST(ut.fecha_inicio AS date) <= @toDate
      GROUP BY u.NEUS_ID, u.NEUS_NOMBRES, ISNULL(s.clave,'DESCONECTADO'), CAST(ut.fecha_inicio AS date)
      ORDER BY u.NEUS_NOMBRES, dia
    `;

    const request = pool.request()
      .input('fromDate', sql.Date, fromDate)
      .input('toDate', sql.Date, toDate);

    const result = await request.query(q);
    const rows = result.recordset || [];

    // Si solicitan CSV, generar contenido
    const outFormat = (format || 'json').toString().toLowerCase();
    if (outFormat === 'csv') {
      // Cabeceras CSV
      const headers = ['usuarioId', 'usuarioNombre', 'status_key', 'dia', 'total_minutos'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        const line = [r.usuarioId, '"' + String((r.usuarioNombre || '')).replace(/"/g, '""') + '"', '"' + String((r.status_key||'')).replace(/"/g,'""') + '"', r.dia ? r.dia.toISOString().slice(0,10) : '', r.total_minutos || 0];
        lines.push(line.join(','));
      }
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="usuarios_times_${from}_to_${to}.csv"`);
      return res.send(csv);
    }

    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('Error getUserTimesReport:', e && e.message);
    return res.status(500).json({ success: false, message: 'Error generando reporte' });
  }
};

// POST /api/reports/pausa/iniciar — registra inicio de pausa para el usuario autenticado
exports.iniciarPausa = async (req, res) => {
  try {
    const { statusId } = req.body;
    const neusId = req.user?.id;
    if (!neusId || !statusId) return res.status(400).json({ success: false, message: 'Faltan datos' });

    const pool = await databaseService.getPool(req.user?.empresa);
    // Solo tipos de pausa activos se pueden iniciar.
    const tipo = await pool.request()
      .input('statusId', sql.Int, Number(statusId))
      .query('SELECT 1 AS ok FROM dbo.STATUS WHERE status_id = @statusId AND ES_PAUSA = 1 AND ACTIVO = 1');
    if (!tipo.recordset.length) return res.status(400).json({ success: false, message: 'statusId inválido' });

    // Si ya existe una pausa abierta del mismo tipo, devolverla sin duplicar
    const existing = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('statusId', sql.Int, Number(statusId))
      .query(`
        SELECT TOP 1 tiempo_id
        FROM USUARIO_TIEMPOS
        WHERE neus_id = @neusId AND status_id = @statusId AND fecha_fin IS NULL
        ORDER BY tiempo_id DESC
      `);
    if (existing.recordset.length > 0) {
      return res.json({ success: true, tiempoId: existing.recordset[0].tiempo_id });
    }

    // Cerrar cualquier otra pausa abierta distinta (no debería haber, pero por seguridad)
    await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`
        UPDATE USUARIO_TIEMPOS SET fecha_fin = GETDATE()
        WHERE neus_id = @neusId AND status_id IN ${SQL_PAUSAS} AND fecha_fin IS NULL
      `);

    // Insertar nuevo registro
    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('statusId', sql.Int, Number(statusId))
      .query(`
        INSERT INTO USUARIO_TIEMPOS (neus_id, status_id, fecha_inicio)
        OUTPUT INSERTED.tiempo_id
        VALUES (@neusId, @statusId, GETDATE())
      `);

    const tiempoId = result.recordset[0]?.tiempo_id;
    return res.json({ success: true, tiempoId });
  } catch (e) {
    console.error('Error iniciarPausa:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al iniciar pausa' });
  }
};

// POST /api/reports/pausa/terminar — cierra la pausa abierta del usuario
exports.terminarPausa = async (req, res) => {
  try {
    const { statusId } = req.body;
    const neusId = req.user?.id;
    if (!neusId || !statusId) return res.status(400).json({ success: false, message: 'Faltan datos' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('statusId', sql.Int, Number(statusId))
      .query(`
        UPDATE USUARIO_TIEMPOS
        SET fecha_fin = GETDATE()
        WHERE neus_id = @neusId
          AND status_id = @statusId
          AND fecha_fin IS NULL
      `);

    return res.json({ success: true });
  } catch (e) {
    console.error('Error terminarPausa:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al terminar pausa' });
  }
};

// GET /api/reports/pausa/activa — devuelve la pausa activa del usuario autenticado
exports.getPausaActiva = async (req, res) => {
  try {
    const neusId = req.user?.id;
    if (!neusId) return res.status(400).json({ success: false });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`
        SELECT TOP 1 ut.tiempo_id, ut.status_id, ut.fecha_inicio,
          DATEDIFF(SECOND, ut.fecha_inicio, GETDATE()) AS duracionSegundos
        FROM USUARIO_TIEMPOS ut
        WHERE ut.neus_id = @neusId
          AND ut.fecha_fin IS NULL
          AND ut.status_id IN ${SQL_PAUSAS}
        ORDER BY ut.fecha_inicio DESC
      `);

    const activa = result.recordset[0] ?? null;
    return res.json({ success: true, data: activa });
  } catch (e) {
    console.error('Error getPausaActiva:', e?.message);
    return res.status(500).json({ success: false, message: 'Error' });
  }
};

// GET /api/reports/pausa/hoy — total de segundos por estado consumidos HOY por
// el usuario autenticado (incluye la sesión abierta hasta ahora). Se usa para
// que el cronómetro del menú de perfil arranque en el acumulado del día.
exports.getPausaHoy = async (req, res) => {
  try {
    const neusId = req.user?.id;
    if (!neusId) return res.status(400).json({ success: false });

    const pool = await databaseService.getPool(req.user?.empresa);
    // { "2": 45, "3": 552, "5": 2, "6": 0, ...un valor por cada tipo de pausa }
    return res.json({ success: true, data: await getPausasHoyDe(pool, neusId) });
  } catch (e) {
    console.error('Error getPausaHoy:', e?.message);
    return res.json({ success: true, data: { 2: 0, 3: 0, 5: 0, 6: 0 } });
  }
};

// Resuelve la jornada esperada de HOY para un usuario: hora de entrada real
// (checada, ASISTENCIA_ENTRADAS) y hora de salida esperada (excepción del día
// de la semana en ASISTENCIA_HORARIOS_ESP si existe, si no el horario general
// de ASISTENCIA_HORARIOS por rol). Devuelve null si no hay checada hoy.
async function getJornadaHoy(pool, neusId, rol) {
  const r = await pool.request()
    .input('neusId', sql.Int, neusId)
    .input('rol', sql.NVarChar, rol)
    .query(`
      DECLARE @diaSemana TINYINT = ((DATEPART(WEEKDAY, GETDATE()) + @@DATEFIRST - 2) % 7) + 1; -- 1=lunes..7=domingo

      SELECT
        e.HORA_ENTRADA AS horaEntradaReal,
        COALESCE(esp.HORA_SALIDA, h.HORA_SALIDA, '18:00:00') AS horaSalidaEsperada
      FROM ASISTENCIA_ENTRADAS e
      LEFT JOIN ASISTENCIA_HORARIOS h ON h.ROL = @rol AND h.ACTIVO = 1
      LEFT JOIN ASISTENCIA_HORARIOS_ESP esp ON esp.HORARIO_ID = h.ID AND esp.DIA_SEMANA = @diaSemana AND esp.ACTIVO = 1
      WHERE e.NEUS_ID = @neusId AND e.FECHA = CAST(GETDATE() AS date)
    `);
  if (!r.recordset.length) return null;
  const { horaEntradaReal, horaSalidaEsperada } = r.recordset[0];

  const jr = await pool.request()
    .input('entrada', sql.DateTime, horaEntradaReal)
    .input('salidaEsp', sql.VarChar, horaSalidaEsperada)
    .query(`
      DECLARE @salidaHoy DATETIME = CAST(CAST(GETDATE() AS date) AS datetime) + CAST(@salidaEsp AS datetime);
      DECLARE @tope DATETIME = CASE WHEN GETDATE() < @salidaHoy THEN GETDATE() ELSE @salidaHoy END;
      SELECT CASE WHEN @tope > @entrada THEN DATEDIFF(SECOND, @entrada, @tope) ELSE 0 END AS jornadaSeg;
    `);
  return { jornadaSeg: Math.max(0, jr.recordset[0].jornadaSeg || 0), horaEntrada: horaEntradaReal };
}

// Suma de pausas de HOY por status_id para un usuario: { 2: seg, 3: seg, ... },
// con una llave por cada tipo de pausa (en 0 si no hubo). `tipos` es opcional
// (se pasa cuando ya se cargaron, p. ej. en un ciclo por usuario).
async function getPausasHoyDe(pool, neusId, tipos) {
  const tiposPausa = tipos ?? await pausaTiposService.listar(pool);
  const result = await pool.request()
    .input('neusId', sql.Int, neusId)
    .query(`
      SELECT ut.status_id,
        SUM(DATEDIFF(SECOND, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE()))) AS totalSegundos
      FROM USUARIO_TIEMPOS ut
      WHERE ut.neus_id = @neusId
        AND ut.status_id IN ${SQL_PAUSAS}
        AND CAST(ut.fecha_inicio AS DATE) = CAST(GETDATE() AS DATE)
      GROUP BY ut.status_id
    `);
  const porEstado = pausaTiposService.mapaEnCero(tiposPausa);
  for (const r of result.recordset) porEstado[r.status_id] = Math.max(0, r.totalSegundos || 0);
  return porEstado;
}
// Reutilizable desde otros módulos (p. ej. Ventas Área — pausas por meta).
exports.getPausasHoyDe = getPausasHoyDe;

// Campos de tiempos de un usuario: los 4 por default (compatibilidad) +
// `pausasPorTipo` con todos los tipos. El disponible solo descuenta las pausas
// que cuentan en Asistencia.
function camposTiempos(tipos, pausas, jornada) {
  const { porTipo, total } = pausaTiposService.desglose(tipos, pausas, 'asistencia');
  return {
    sinEntrada: !jornada,
    jornadaSeg: jornada ? jornada.jornadaSeg : 0,
    disponibleSeg: jornada ? Math.max(0, jornada.jornadaSeg - total) : 0,
    ...pausaTiposService.camposSeg(tipos, pausas),
    pausasPorTipo: porTipo.map(({ valor, ...t }) => ({ ...t, seg: valor })),
  };
}

// GET /api/reports/tiempos/hoy — tiempo disponible (jornada − pausas) + desglose
// de pausas del día para el usuario autenticado. Emparejado con /pausa/hoy: misma
// fuente (USUARIO_TIEMPOS) y mismo criterio de "hoy".
exports.getTiemposHoy = async (req, res) => {
  try {
    const neusId = req.user?.id;
    const rol = (req.user?.tipoUsuario || '').toString().toUpperCase();
    if (!neusId) return res.status(400).json({ success: false });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tipos = await pausaTiposService.listar(pool);
    const jornada = await getJornadaHoy(pool, neusId, rol);
    const pausas = await getPausasHoyDe(pool, neusId, tipos);
    return res.json({ success: true, data: camposTiempos(tipos, pausas, jornada) });
  } catch (e) {
    console.error('Error getTiemposHoy:', e?.message);
    return res.json({ success: true, data: { sinEntrada: true, jornadaSeg: 0, disponibleSeg: 0, comidaSeg: 0, banioSeg: 0, capacitacionSeg: 0, permisoSeg: 0, pausasPorTipo: [] } });
  }
};

// GET /api/reports/tiempos/hoy/equipo?area= — mismo desglose por cada usuario
// activo del área (o de todas si no se especifica). Requiere reports:ver-equipo.
exports.getTiemposHoyEquipo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const area = req.query.area ? String(req.query.area).toUpperCase() : null;

    const req1 = pool.request();
    if (area) req1.input('area', sql.NVarChar, area);
    const usuarios = await req1.query(`
      SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_TIPOUSUARIO as rol
      FROM NEUS_USUARIOS
      WHERE NEUS_ACTIVO = 1 ${area ? 'AND NEUS_TIPOUSUARIO = @area' : ''}
      ORDER BY NEUS_NOMBRES
    `);

    const tipos = await pausaTiposService.listar(pool);
    const data = [];
    for (const u of usuarios.recordset) {
      const jornada = await getJornadaHoy(pool, u.id, u.rol);
      const pausas = await getPausasHoyDe(pool, u.id, tipos);
      data.push({ usuarioId: u.id, nombre: u.nombre, area: u.rol, ...camposTiempos(tipos, pausas, jornada) });
    }

    return res.json({ success: true, data });
  } catch (e) {
    console.error('Error getTiemposHoyEquipo:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al obtener los tiempos del equipo' });
  }
};

// GET /api/reports/resumen-general?from=&to=&rol= — resumen consolidado por colaborador (solo AD)
exports.getResumenGeneral = async (req, res) => {
  try {
    const tipoUsuario = (req.user?.tipoUsuario || req.headers.tipousuario || '').toString().toUpperCase();
    if (!['AD', 'ADMIN', 'ADMINISTRADOR'].includes(tipoUsuario)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const { from, to, rol } = req.query;
    const usuarioId = Number(req.query.usuarioId) || null;
    const extractDate = (s) => {
      if (!s) return null;
      const match = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    };
    const fromDate = extractDate(from) || new Date().toISOString().slice(0, 10);
    const toDate = extractDate(to) || fromDate;

    const pool = await databaseService.getPool(req.user?.empresa);

    // 1. Usuarios AD/TI/CC activos (o solo el colaborador pedido, aunque ya esté inactivo)
    const usuariosResult = await pool.request()
      .input('rolFilter', sql.NVarChar, rol || '')
      .input('usuarioId', sql.Int, usuarioId)
      .query(`
        SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_TIPOUSUARIO as rol
        FROM NEUS_USUARIOS
        WHERE NEUS_TIPOUSUARIO IN ('AD','TI','CC')
          ${usuarioId ? 'AND NEUS_ID = @usuarioId' : 'AND NEUS_ACTIVO = 1'}
          ${rol ? `AND NEUS_TIPOUSUARIO = @rolFilter` : ''}
        ORDER BY NEUS_NOMBRES
      `);
    const usuarios = usuariosResult.recordset;
    if (usuarios.length === 0) return res.json({ success: true, data: [] });

    const ids = usuarios.map((u) => u.id).join(',');

    // 2. Quejas por usuario — desde CASOS (tipo 'queja'); la tabla QUEJAS legacy
    //    quedó congelada en la Fase 9.
    const quejasResult = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT CASO_CREADO_POR as usuarioId, COUNT(*) as total
        FROM CASOS
        WHERE CASO_TIPO = 'queja'
          AND CAST(CASO_FECHA_CREACION AS date) >= @fromDate AND CAST(CASO_FECHA_CREACION AS date) <= @toDate
          AND CASO_CREADO_POR IN (${ids})
        GROUP BY CASO_CREADO_POR
      `).catch(() => ({ recordset: [] }));
    const quejasPorUser = Object.fromEntries(quejasResult.recordset.map((r) => [r.usuarioId, r.total]));

    // 3. Pausas por tipo (todos los tipos configurados; 3=baño, 2=comida, 5=capacitación, 6=permiso por default)
    const pausasResult = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT neus_id as usuarioId, status_id as statusId,
          SUM(CASE WHEN fecha_fin IS NOT NULL THEN DATEDIFF(SECOND, fecha_inicio, fecha_fin)
                   ELSE DATEDIFF(SECOND, fecha_inicio, GETDATE()) END) / 60 as totalMinutos
        FROM USUARIO_TIEMPOS
        WHERE CAST(fecha_inicio AS date) >= @fromDate AND CAST(fecha_inicio AS date) <= @toDate
          AND status_id IN ${SQL_PAUSAS}
          AND neus_id IN (${ids})
        GROUP BY neus_id, status_id
      `);
    const pausasMap = {};
    for (const p of pausasResult.recordset) {
      if (!pausasMap[p.usuarioId]) pausasMap[p.usuarioId] = {};
      pausasMap[p.usuarioId][p.statusId] = p.totalMinutos;
    }

    // 4. Checklist completados — la tabla es TI_CHECKLIST_ITEMS (antes apuntaba a
    //    CHECKLIST_ITEMS, que no existe, y el .catch dejaba la columna siempre en 0).
    const checklistResult = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT ci.COMPLETADO_POR as usuarioId, COUNT(*) as total
        FROM TI_CHECKLIST_ITEMS ci
        WHERE ci.COMPLETADO = 1
          AND CAST(ci.COMPLETADO_AT AS date) >= @fromDate AND CAST(ci.COMPLETADO_AT AS date) <= @toDate
          AND ci.COMPLETADO_POR IN (${ids})
        GROUP BY ci.COMPLETADO_POR
      `).catch(() => ({ recordset: [] }));
    const checklistPorUser = Object.fromEntries(checklistResult.recordset.map((r) => [r.usuarioId, r.total]));

    // 5. Asistencia: a tiempo vs retardos
    const asistenciaResult = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT NEUS_ID as usuarioId,
          SUM(CASE WHEN ES_RETARDO = 0 THEN 1 ELSE 0 END) as aTiempo,
          SUM(CASE WHEN ES_RETARDO = 1 THEN 1 ELSE 0 END) as retardos
        FROM ASISTENCIA_ENTRADAS
        WHERE FECHA >= @fromDate AND FECHA <= @toDate
          AND NEUS_ID IN (${ids})
        GROUP BY NEUS_ID
      `).catch(() => ({ recordset: [] }));
    const asistenciaPorUser = Object.fromEntries(asistenciaResult.recordset.map((r) => [r.usuarioId, r]));

    // 6. Tickets por solicitante
    const ticketsResult = await pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate', sql.NVarChar, toDate)
      .query(`
        SELECT SOLICITANTE_ID as usuarioId, COUNT(*) as total
        FROM TICKETS
        WHERE CAST(FECHA_CREACION AS date) >= @fromDate AND CAST(FECHA_CREACION AS date) <= @toDate
          AND SOLICITANTE_ID IN (${ids})
        GROUP BY SOLICITANTE_ID
      `);
    const ticketsPorUser = Object.fromEntries(ticketsResult.recordset.map((r) => [r.usuarioId, r.total]));

    // Los 4 tipos por default se ubican por clave (su status_id cambia entre empresas).
    const tiposPausa = await pausaTiposService.listar(pool);
    const data = usuarios.map((u) => ({
      usuarioId: u.id,
      nombre: u.nombre,
      rol: u.rol,
      quejas: quejasPorUser[u.id] ?? 0,
      ...pausaTiposService.camposMin(tiposPausa, pausasMap[u.id] ?? {}),
      // Minutos por cada tipo de pausa (incluye los creados por la empresa).
      pausasMinPorTipo: pausasMap[u.id] ?? {},
      checklistCompletados: checklistPorUser[u.id] ?? 0,
      entradasATiempo: asistenciaPorUser[u.id]?.aTiempo ?? 0,
      retardos: asistenciaPorUser[u.id]?.retardos ?? 0,
      tickets: ticketsPorUser[u.id] ?? 0,
    }));

    return res.json({ success: true, data });
  } catch (e) {
    console.error('Error getResumenGeneral:', e?.message);
    return res.status(500).json({ success: false, message: 'Error generando resumen general' });
  }
};

// Reporte de pausas: todos los tipos configurados (baño, comida, capacitación, permiso y los que agregue la empresa)
exports.getBanioReport = async (req, res) => {
  try {
    const { from, to, statusId, area } = req.query;

    // Extraer solo la parte de fecha (YYYY-MM-DD) que manda el frontend.
    // SQL Server almacena con GETDATE() (hora local del servidor = hora México UTC-6),
    // así que comparamos directamente CAST(fecha_inicio AS date) contra la fecha local.
    const extractDate = (s) => {
      if (!s) return null;
      // Acepta "2026-07-03" o "2026-07-03T00:00:00"
      const match = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    };
    const fromDate = extractDate(from) || new Date().toISOString().slice(0, 10);
    const toDate   = extractDate(to)   || fromDate;

    const pool = await databaseService.getPool(req.user?.empresa);

    const statusFilter = statusId
      ? 'AND ut.status_id = @statusId'
      : `AND ut.status_id IN ${SQL_PAUSAS}`;

    const areaFilter = area ? 'AND nu.NEUS_TIPOUSUARIO = @area' : '';

    const req2 = pool.request()
      .input('fromDate', sql.NVarChar, fromDate)
      .input('toDate',   sql.NVarChar, toDate);
    if (statusId) req2.input('statusId', sql.Int, parseInt(statusId));
    if (area)     req2.input('area', sql.NVarChar, area.toUpperCase());

    const result = await req2.query(`
      SELECT
        ut.tiempo_id        AS id,
        nu.NEUS_ID          AS usuarioId,
        nu.NEUS_NOMBRES     AS nombre,
        nu.NEUS_USUARIO     AS usuario,
        nu.NEUS_TIPOUSUARIO AS area,
        ut.status_id        AS statusId,
        s.clave             AS statusClave,
        s.descripcion       AS statusDesc,
        ut.fecha_inicio     AS entrada,
        ut.fecha_fin        AS salida,
        CASE
          WHEN ut.fecha_fin IS NOT NULL
            THEN DATEDIFF(SECOND, ut.fecha_inicio, ut.fecha_fin)
          ELSE
            DATEDIFF(SECOND, ut.fecha_inicio, GETDATE())
        END AS duracionSegundos,
        CASE WHEN ut.fecha_fin IS NULL THEN 1 ELSE 0 END AS activo
      FROM USUARIO_TIEMPOS ut
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = ut.neus_id
      INNER JOIN STATUS s ON s.status_id = ut.status_id
      WHERE CAST(ut.fecha_inicio AS date) >= @fromDate
        AND CAST(ut.fecha_inicio AS date) <= @toDate
        ${statusFilter}
        ${areaFilter}
      ORDER BY ut.fecha_inicio DESC
    `);

    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getBanioReport:', e && e.message);
    return res.status(500).json({ success: false, message: 'Error generando reporte de pausas' });
  }
};

// ── Reporte detallado ─────────────────────────────────────────────────────────
// Catálogo en services/reportesDetalleService.js. Filtros: tipo de reporte,
// colaborador, rol y rango de fechas. tipo='todos' corre todos los reportes
// para un colaborador (su "expediente" del periodo).

const { getEmpresaModulosBloqueados, getUserAllowedActions, esSuperAdminFijo } = require('../middleware/moduleAccess');
const reportesDetalle = require('../services/reportesDetalleService');
const dbVentas = require('../config/database_ventas');

const ROLES_LABEL = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center' };

// Mismo criterio que requireActionAccess, para reportes que muestran datos de
// otro módulo sensible (nómina, auditoría).
async function puedeVerReporte(req, reporte) {
  if (!reporte.permiso) return true;
  const [modulo, accion] = reporte.permiso;
  if (esSuperAdminFijo(req)) return true;
  const bloqueados = await getEmpresaModulosBloqueados(req.user?.empresa);
  if (bloqueados.has(modulo)) return false;
  const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
  const permitidas = await getUserAllowedActions(uid, modulo, req.user?.empresa);
  return permitidas.has('*') || permitidas.has(accion);
}

async function reportesPermitidos(req) {
  const lista = [];
  for (const r of reportesDetalle.REPORTES) if (await puedeVerReporte(req, r)) lista.push(r);
  return lista;
}

let _ventasPool = null;
async function getVentasPool() {
  if (_ventasPool && _ventasPool.connected) return _ventasPool;
  _ventasPool = await new sql.ConnectionPool(dbVentas).connect();
  return _ventasPool;
}

// Las ventas viven en otra BD y solo traen el nombre del agente: se ligan al
// colaborador con la misma heurística de nombre que usa Nómina (exacto,
// prefijo en cualquier dirección, o 20 caracteres iguales al inicio).
function normNombre(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function mismoAgente(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.startsWith(a)) return true;
  if (b.length >= 8 && a.startsWith(b)) return true;
  const len = Math.min(a.length, b.length, 20);
  return len >= 20 && a.slice(0, len) === b.slice(0, len);
}

async function reporteVentas(pool, f) {
  const usuarios = (await pool.request()
    .input('usuarioId', sql.Int, f.usuarioId).input('rol', sql.NVarChar, f.rol)
    .query(`SELECT NEUS_ID id, NEUS_NOMBRES nombre, NEUS_TIPOUSUARIO rol FROM NEUS_USUARIOS u
            WHERE 1=1 AND (@usuarioId IS NULL OR u.NEUS_ID = @usuarioId) AND (@rol IS NULL OR u.NEUS_TIPOUSUARIO = @rol)`))
    .recordset.map((u) => ({ ...u, norm: normNombre(u.nombre) }));
  const filtrado = f.usuarioId !== null || f.rol !== null;

  const campR = await pool.request().query('SELECT campana_id, campana_nombre FROM nomina_campana_config')
    .catch(() => ({ recordset: [] }));
  const campanas = Object.fromEntries(campR.recordset.map((c) => [Number(c.campana_id), c.campana_nombre]));

  const vPool = await getVentasPool();
  const vR = await vPool.request()
    .input('desde', sql.NVarChar, f.desde).input('hasta', sql.NVarChar, f.hasta)
    .query(`SELECT idVenta, nombreAgente, campaignId, nombreCliente, telefonoCliente, estatus, fecha
            FROM Ventas WHERE CAST(fecha AS date) BETWEEN @desde AND @hasta ORDER BY fecha DESC`);

  const cache = new Map();
  const filas = [];
  for (const v of vR.recordset) {
    const norm = normNombre(v.nombreAgente);
    if (!cache.has(norm)) cache.set(norm, usuarios.find((u) => mismoAgente(u.norm, norm)) ?? null);
    const u = cache.get(norm);
    if (filtrado && !u) continue;
    filas.push({
      Agente: u ? u.nombre : v.nombreAgente,
      Rol: u ? (ROLES_LABEL[u.rol] ?? u.rol) : null,
      Venta: v.idVenta,
      'Campaña': campanas[Number(v.campaignId)] ?? v.campaignId,
      Cliente: v.nombreCliente,
      'Teléfono': v.telefonoCliente,
      Estatus: v.estatus,
      Fecha: v.fecha ? new Date(v.fecha).toISOString().slice(0, 16).replace('T', ' ') : null,
    });
    if (filas.length >= f.limite) break;
  }
  return filas;
}

async function correrReporte(pool, reporte, f) {
  const filas = reporte.externo === 'ventas'
    ? await reporteVentas(pool, f)
    : (await pool.request()
        .input('desde', sql.NVarChar, f.desde).input('hasta', sql.NVarChar, f.hasta)
        .input('usuarioId', sql.Int, f.usuarioId).input('rol', sql.NVarChar, f.rol)
        .input('limite', sql.Int, f.limite)
        .query(reporte.sql)).recordset;
  return { key: reporte.key, grupo: reporte.grupo, label: reporte.label, filas, truncado: filas.length >= f.limite };
}

// GET /api/reports/detalle/catalogo — tipos de reporte que el usuario puede ver + colaboradores para el filtro
exports.getCatalogoReportes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const reportes = (await reportesPermitidos(req))
      .map(({ key, grupo, label, descripcion }) => ({ key, grupo, label, descripcion }));
    const usuarios = await pool.request().query(`
      SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_TIPOUSUARIO as rol, CAST(NEUS_ACTIVO AS bit) as activo
      FROM NEUS_USUARIOS
      WHERE NEUS_TIPOUSUARIO IN ('AD','TI','CC')
      ORDER BY NEUS_ACTIVO DESC, NEUS_NOMBRES
    `);
    return res.json({ success: true, data: { reportes, usuarios: usuarios.recordset } });
  } catch (e) {
    console.error('Error getCatalogoReportes:', e?.message);
    return res.status(500).json({ success: false, message: 'Error cargando el catálogo de reportes' });
  }
};

// GET /api/reports/detalle?tipo=&usuarioId=&rol=&from=&to=
exports.getReporteDetalle = async (req, res) => {
  try {
    const tipo = String(req.query.tipo || '');
    const fechaOk = (s) => (String(s || '').match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const desde = fechaOk(req.query.from);
    const hasta = fechaOk(req.query.to) || desde;
    if (!desde) return res.status(400).json({ success: false, message: 'El rango de fechas es obligatorio' });
    const rol = req.query.rol ? String(req.query.rol).toUpperCase() : null;
    const f = { desde, hasta, usuarioId: Number(req.query.usuarioId) || null, rol, limite: reportesDetalle.LIMITE_FILAS };

    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipo === 'todos') {
      if (!f.usuarioId) return res.status(400).json({ success: false, message: 'Para ver todos los reportes elige un colaborador' });
      const secciones = [];
      for (const r of await reportesPermitidos(req)) {
        try {
          secciones.push(await correrReporte(pool, r, f));
        } catch (e) {
          // Un reporte que falla (p. ej. la BD de Ventas no responde) no tumba los demás
          secciones.push({ key: r.key, grupo: r.grupo, label: r.label, filas: [], truncado: false, error: e.message });
        }
      }
      return res.json({ success: true, data: { secciones } });
    }

    const reporte = reportesDetalle.porKey[tipo];
    if (!reporte) return res.status(400).json({ success: false, message: 'Tipo de reporte no válido' });
    if (!(await puedeVerReporte(req, reporte))) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte' });
    }
    return res.json({ success: true, data: await correrReporte(pool, reporte, f) });
  } catch (e) {
    console.error('Error getReporteDetalle:', e?.message);
    return res.status(500).json({ success: false, message: `Error generando el reporte: ${e.message}` });
  }
};
