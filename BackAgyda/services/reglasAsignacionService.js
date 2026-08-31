const sql = require('mssql');

// Motor de reglas de asignación: unifica el ruteo de Tickets (antes autoAssignTicket,
// aleatorio) y de Livechat (antes least-busy simple) en un solo algoritmo configurable.
// Se divide en dos fases independientes, cada una exportada por separado:
//
// FASE 1 — ENRUTAMIENTO (enrutarTicket): a qué grupo/nivel/especialidad va.
//   1. Carga reglas activas ordenadas por REG_PRIORIDAD_ORDEN.
//   2. Toma la primera regla cuyas condiciones no-NULL matcheen todos los criterios recibidos.
//   3. Si hay match: usa REG_NIVEL_REQUERIDO/REG_ESP_ID si vienen definidos.
//   4. Si no hay match: fallback (nivel = criterios.nivel, sin filtro de especialidad) —
//      el sistema nunca se queda sin destino solo por falta de reglas configuradas.
//   5. Resuelve el GRUPOS_SOPORTE(AREA,NIVEL) correspondiente, informativo.
//
// FASE 2 — ASIGNACIÓN (asignarTecnico): dado ese destino, qué técnico concreto.
//   6. Candidatos: TI_STAFF_STATUS del área/nivel efectivo, disponibles, activos,
//      filtrando horario/prioridades permitidas y especialidad/categoría/sede permitida
//      (regla: sin filas en la tabla puente = sin restricción, compatible hacia atrás).
//   7. Excluye candidatos en/sobre su capacidad (MAX_TICKETS o MAX_CHATS según tipoCarga).
//   8. Ordena por menor carga real (tickets abiertos + chats activos), desempate por
//      LAST_ASSIGNED_AT.
//
// seleccionarTecnico() compone ambas fases y es lo que usan los llamadores existentes
// (ticketController, livechatController) sin que ellos necesiten saber de la separación.

async function buscarReglaAplicable(pool, { area, categoriaId, subcategoriaId, sedeId, prioridad }) {
  // REG_HORARIO_INICIO/FIN son columnas TIME — el driver mssql las devuelve como
  // objetos Date (con fecha base 1970-01-01), no como texto. CONVERT a varchar(5)
  // aquí para que horaActualEnRango reciba 'HH:MM' de forma consistente con lo que
  // ya hace getReglas() en reglasAsignacionController.js.
  const rs = await pool.request().query(`
    SELECT REG_ID as id, REG_AREA as area, REG_CAT_ID as categoriaId, REG_SUBCAT_ID as subcategoriaId,
           REG_SEDE_ID as sedeId, REG_PRIORIDAD as prioridad, REG_NIVEL_REQUERIDO as nivelRequerido, REG_ESP_ID as espId,
           REG_TECNICO_ID as tecnicoId,
           CONVERT(varchar(5), REG_HORARIO_INICIO, 108) as horarioInicio,
           CONVERT(varchar(5), REG_HORARIO_FIN, 108) as horarioFin,
           REG_DIAS_SEMANA as diasSemana
    FROM TI_REGLAS_ASIGNACION
    WHERE REG_ACTIVA = 1
    ORDER BY REG_PRIORIDAD_ORDEN ASC, REG_ID ASC
  `);

  for (const r of rs.recordset) {
    const matchArea = r.area == null || r.area === area;
    const matchCat = r.categoriaId == null || r.categoriaId === categoriaId;
    const matchSubcat = r.subcategoriaId == null || r.subcategoriaId === subcategoriaId;
    const matchSede = r.sedeId == null || r.sedeId === sedeId;
    const matchPrio = r.prioridad == null || r.prioridad === prioridad;
    // Condición de horario de la REGLA (distinta del horario por técnico): si la
    // regla define un rango horario/días, solo se considera "match" dentro de esa
    // ventana — permite reglas tipo "solo aplica de 6pm a 8am" para guardia nocturna.
    const matchHorario = horaActualEnRango(r.horarioInicio, r.horarioFin) && diaActualPermitido(r.diasSemana);
    if (matchArea && matchCat && matchSubcat && matchSede && matchPrio && matchHorario) return r;
  }
  return null;
}

// sabadoInicio/sabadoFin son opcionales — solo los pasan los candidatos a
// técnico (TI_STAFF_STATUS), no las reglas (TI_REGLAS_ASIGNACION), que no
// tienen ese concepto. Si hoy es sábado y el técnico tiene su propio horario
// de sábado configurado, ese horario reemplaza al general (inicio/fin);
// mismo patrón ya usado en LIVECHAT_CONFIG (LCF_SABADO_HORARIO_*).
function horaActualEnRango(inicio, fin, sabadoInicio = null, sabadoFin = null) {
  const esSabado = new Date().getDay() === 6;
  const usaHorarioSabado = esSabado && sabadoInicio && sabadoFin;
  const horaInicioEfectiva = usaHorarioSabado ? sabadoInicio : inicio;
  const horaFinEfectiva = usaHorarioSabado ? sabadoFin : fin;

  if (!horaInicioEfectiva || !horaFinEfectiva) return true; // sin restricción
  const ahora = new Date();
  const hhmm = ahora.getHours() * 60 + ahora.getMinutes();
  const [hi, mi] = String(horaInicioEfectiva).split(':').map(Number);
  const [hf, mf] = String(horaFinEfectiva).split(':').map(Number);
  const inicioMin = hi * 60 + (mi || 0);
  const finMin = hf * 60 + (mf || 0);
  return hhmm >= inicioMin && hhmm <= finMin;
}

function diaActualPermitido(diasCsv) {
  if (!diasCsv) return true; // sin restricción
  const dias = String(diasCsv).split(',').map((s) => s.trim());
  const hoyIso = new Date().getDay(); // 0=domingo..6=sábado
  const hoy1a7 = hoyIso === 0 ? 7 : hoyIso; // convención 1=lunes..7=domingo usada en DIAS_SEMANA
  return dias.includes(String(hoy1a7));
}

// FASE 1: ENRUTAMIENTO — decide A QUÉ GRUPO/NIVEL/ESPECIALIDAD debe ir el
// ticket/chat, según las reglas configuradas. No elige ningún técnico
// concreto todavía; eso es responsabilidad exclusiva de la fase de asignación.
// Separado de asignarTecnico() para que cada fase se pueda configurar,
// probar y auditar de forma independiente (p.ej. simular a qué grupo iría
// algo sin necesidad de tener técnicos con capacidad disponible).
async function enrutarTicket(pool, { area, categoriaId = null, subcategoriaId = null, sedeId = null, prioridad = null, nivel = 1 }) {
  const regla = await buscarReglaAplicable(pool, { area, categoriaId, subcategoriaId, sedeId, prioridad });
  const nivelEfectivo = regla?.nivelRequerido ?? nivel;
  const espRequerida = regla?.espId ?? null;
  const tecnicoForzadoId = regla?.tecnicoId ?? null;

  let grupo = null;
  const grupoRs = await pool.request()
    .input('area', sql.NVarChar, area)
    .input('nivel', sql.TinyInt, nivelEfectivo)
    .query(`SELECT GRUPO_ID as id, NOMBRE as nombre FROM GRUPOS_SOPORTE WHERE AREA=@area AND NIVEL=@nivel`);
  if (grupoRs.recordset.length) grupo = grupoRs.recordset[0];

  return {
    reglaAplicada: regla?.id ?? null,
    area,
    nivel: nivelEfectivo,
    espId: espRequerida,
    tecnicoForzadoId,
    grupoId: grupo?.id ?? null,
    grupoNombre: grupo?.nombre ?? null,
  };
}

// FASE 2: ASIGNACIÓN — dado un destino ya enrutado (área/nivel/especialidad),
// elige QUÉ TÉCNICO específico se hace cargo: filtra candidatos por
// horario/prioridades/especialidad/categoría/sede permitida, excluye a
// quienes están en/sobre capacidad, y ordena por menor carga real.
async function asignarTecnico(pool, {
  area, nivel = 1, espId = null, categoriaId = null, sedeId = null,
  prioridad = null, tipoCarga = 'ticket', tecnicoForzadoId = null,
}) {
  const nivelEfectivo = nivel;
  const espRequerida = espId;

  // Regla "por técnico": si la regla exige una persona específica, saltar el
  // resto del algoritmo (especialidad/categoría/sede/orden por carga) y usar
  // esa persona directo, siempre que esté disponible y con capacidad. Si no
  // califica, se cae al flujo normal (fallback) en vez de bloquear la
  // asignación — mismo principio que "sin reglas = fallback" del resto del motor.
  if (tecnicoForzadoId) {
    const forzadoRs = await pool.request().input('uid', sql.Int, tecnicoForzadoId).query(`
      SELECT u.NEUS_ID as userId, s.MAX_TICKETS as maxTickets, s.MAX_CHATS as maxChats
      FROM NEUS_USUARIOS u
      INNER JOIN TI_STAFF_STATUS s ON s.USER_ID = u.NEUS_ID
      WHERE u.NEUS_ACTIVO = 1 AND s.DISPONIBLE = 1 AND s.ESTADO_TRABAJO = 'disponible' AND u.NEUS_ID = @uid
    `);
    const forzado = forzadoRs.recordset[0];
    if (forzado) {
      const cargaRs = await pool.request().input('uid', sql.Int, forzado.userId).query(`
        SELECT
          (SELECT COUNT(*) FROM TICKETS WHERE ASIGNADO_A=@uid AND ESTADO NOT IN ('resuelto','cerrado')) as tickets,
          (SELECT COUNT(*) FROM LIVECHAT_CONVERSACIONES WHERE LC_AGENTE_ID=@uid AND LC_ESTADO='activa') as chats
      `);
      const carga = cargaRs.recordset[0];
      const limite = tipoCarga === 'chat' ? forzado.maxChats : forzado.maxTickets;
      const actual = tipoCarga === 'chat' ? carga.chats : carga.tickets;
      if (actual < limite) return { userId: forzado.userId };
    }
  }

  // HORARIO_INICIO/FIN son TIME, hay que convertirlas a 'HH:MM' explícitamente
  // o el driver las entrega como Date (ver buscarReglaAplicable más arriba).
  const rs = await pool.request()
    .input('area', sql.NVarChar, area)
    .input('nivel', sql.TinyInt, nivelEfectivo)
    .query(`
      SELECT u.NEUS_ID as userId, s.MAX_TICKETS as maxTickets, s.MAX_CHATS as maxChats,
             s.PRIORIDADES_PERMITIDAS as prioridadesPermitidas,
             CONVERT(varchar(5), s.HORARIO_INICIO, 108) as horarioInicio,
             CONVERT(varchar(5), s.HORARIO_FIN, 108) as horarioFin,
             CONVERT(varchar(5), s.HORARIO_SABADO_INICIO, 108) as horarioSabadoInicio,
             CONVERT(varchar(5), s.HORARIO_SABADO_FIN, 108) as horarioSabadoFin,
             s.DIAS_SEMANA as diasSemana, s.LAST_ASSIGNED_AT as lastAssignedAt
      FROM NEUS_USUARIOS u
      INNER JOIN TI_STAFF_STATUS s ON s.USER_ID = u.NEUS_ID
      WHERE u.NEUS_ACTIVO = 1
        AND s.DISPONIBLE = 1
        AND s.ESTADO_TRABAJO = 'disponible'
        AND s.AREA = @area
        AND s.NIVEL = @nivel
    `);

  let candidatos = rs.recordset;

  // Filtro de horario/día (NULL = sin restricción)
  candidatos = candidatos.filter((c) => horaActualEnRango(c.horarioInicio, c.horarioFin, c.horarioSabadoInicio, c.horarioSabadoFin) && diaActualPermitido(c.diasSemana));

  // Filtro de prioridades permitidas (NULL o CSV vacío = todas)
  if (prioridad) {
    candidatos = candidatos.filter((c) => {
      if (!c.prioridadesPermitidas) return true;
      return String(c.prioridadesPermitidas).split(',').map((s) => s.trim()).includes(prioridad);
    });
  }

  // Filtro de especialidad exigida por la regla (si aplica)
  if (espRequerida) {
    const espRs = await pool.request().input('espId', sql.Int, espRequerida)
      .query(`SELECT TE_USER_ID as userId FROM TI_TECNICO_ESPECIALIDAD WHERE TE_ESP_ID=@espId`);
    const conEspecialidad = new Set(espRs.recordset.map((r) => r.userId));
    // A diferencia de categoría/sede (restricciones del perfil general del técnico,
    // donde "sin filas" = sin restricción), aquí la REGLA exige puntualmente una
    // especialidad concreta — es un requisito duro de esa regla, no del perfil.
    // Solo califican quienes la tengan asignada explícitamente en TI_TECNICO_ESPECIALIDAD.
    candidatos = candidatos.filter((c) => conEspecialidad.has(c.userId));
  }

  // Filtro de categoría/sede permitida (sin filas = sin restricción)
  if (categoriaId) {
    const catRs = await pool.request().query(`SELECT DISTINCT TC_USER_ID as userId, TC_CAT_ID as catId FROM TI_TECNICO_CATEGORIA`);
    const porUsuario = new Map();
    for (const r of catRs.recordset) {
      if (!porUsuario.has(r.userId)) porUsuario.set(r.userId, new Set());
      porUsuario.get(r.userId).add(r.catId);
    }
    candidatos = candidatos.filter((c) => !porUsuario.has(c.userId) || porUsuario.get(c.userId).has(categoriaId));
  }
  if (sedeId) {
    const sedeRs = await pool.request().query(`SELECT DISTINCT TS_USER_ID as userId, TS_SEDE_ID as sedeId FROM TI_TECNICO_SEDE`);
    const porUsuario = new Map();
    for (const r of sedeRs.recordset) {
      if (!porUsuario.has(r.userId)) porUsuario.set(r.userId, new Set());
      porUsuario.get(r.userId).add(r.sedeId);
    }
    candidatos = candidatos.filter((c) => !porUsuario.has(c.userId) || porUsuario.get(c.userId).has(sedeId));
  }

  if (!candidatos.length) return null;

  // Carga real + filtro de capacidad
  const conCarga = [];
  for (const c of candidatos) {
    const cargaRs = await pool.request().input('uid', sql.Int, c.userId).query(`
      SELECT
        (SELECT COUNT(*) FROM TICKETS WHERE ASIGNADO_A=@uid AND ESTADO NOT IN ('resuelto','cerrado')) as tickets,
        (SELECT COUNT(*) FROM LIVECHAT_CONVERSACIONES WHERE LC_AGENTE_ID=@uid AND LC_ESTADO='activa') as chats
    `);
    const carga = cargaRs.recordset[0];
    const limite = tipoCarga === 'chat' ? c.maxChats : c.maxTickets;
    const actual = tipoCarga === 'chat' ? carga.chats : carga.tickets;
    if (actual >= limite) continue;
    conCarga.push({ ...c, cargaTotal: carga.tickets + carga.chats });
  }

  if (!conCarga.length) return null;

  conCarga.sort((a, b) => {
    if (a.cargaTotal !== b.cargaTotal) return a.cargaTotal - b.cargaTotal;
    const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
    const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
    return aTime - bTime;
  });

  return { userId: conCarga[0].userId };
}

// Composición de las dos fases — mantiene la firma histórica de
// seleccionarTecnico() para que ticketController/livechatController no
// necesiten cambiar. Internamente ya no hace todo en un solo paso: primero
// enruta (fase 1), luego asigna dentro de ese destino (fase 2).
async function seleccionarTecnico(pool, {
  area, nivel = 1, categoriaId = null, subcategoriaId = null, sedeId = null,
  prioridad = null, tipoCarga = 'ticket',
}) {
  const ruteo = await enrutarTicket(pool, { area, categoriaId, subcategoriaId, sedeId, prioridad, nivel });
  const asignacion = await asignarTecnico(pool, {
    area, nivel: ruteo.nivel, espId: ruteo.espId, categoriaId, sedeId, prioridad, tipoCarga,
    tecnicoForzadoId: ruteo.tecnicoForzadoId,
  });
  if (!asignacion) return null;
  return { userId: asignacion.userId, reglaAplicada: ruteo.reglaAplicada, grupoId: ruteo.grupoId, grupoNombre: ruteo.grupoNombre };
}

module.exports = { seleccionarTecnico, enrutarTicket, asignarTecnico };
