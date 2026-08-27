const sql = require('mssql');

// Motor de reglas de asignación: unifica el ruteo de Tickets (antes autoAssignTicket,
// aleatorio) y de Livechat (antes least-busy simple) en un solo algoritmo configurable.
//
// Algoritmo:
// 1. Carga reglas activas ordenadas por REG_PRIORIDAD_ORDEN.
// 2. Toma la primera regla cuyas condiciones no-NULL matcheen todos los criterios recibidos.
// 3. Si hay match: usa REG_NIVEL_REQUERIDO/REG_ESP_ID si vienen definidos.
// 4. Si no hay match: fallback (nivel = criterios.nivel, sin filtro de especialidad) —
//    el sistema nunca se queda sin poder asignar solo por falta de reglas configuradas.
// 5. Candidatos: TI_STAFF_STATUS del área/nivel efectivo, disponibles, activos,
//    filtrando horario/prioridades permitidas y especialidad/categoría/sede permitida
//    (regla: sin filas en la tabla puente = sin restricción, compatible hacia atrás).
// 6. Excluye candidatos en/sobre su capacidad (MAX_TICKETS o MAX_CHATS según tipoCarga).
// 7. Ordena por menor carga real (tickets abiertos + chats activos), desempate por
//    LAST_ASSIGNED_AT.

async function buscarReglaAplicable(pool, { area, categoriaId, subcategoriaId, sedeId, prioridad }) {
  const rs = await pool.request().query(`
    SELECT REG_ID as id, REG_AREA as area, REG_CAT_ID as categoriaId, REG_SUBCAT_ID as subcategoriaId,
           REG_SEDE_ID as sedeId, REG_PRIORIDAD as prioridad, REG_NIVEL_REQUERIDO as nivelRequerido, REG_ESP_ID as espId
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
    if (matchArea && matchCat && matchSubcat && matchSede && matchPrio) return r;
  }
  return null;
}

function horaActualEnRango(inicio, fin) {
  if (!inicio || !fin) return true; // sin restricción
  const ahora = new Date();
  const hhmm = ahora.getHours() * 60 + ahora.getMinutes();
  const [hi, mi] = String(inicio).split(':').map(Number);
  const [hf, mf] = String(fin).split(':').map(Number);
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

async function seleccionarTecnico(pool, {
  area, nivel = 1, categoriaId = null, subcategoriaId = null, sedeId = null,
  prioridad = null, tipoCarga = 'ticket',
}) {
  const regla = await buscarReglaAplicable(pool, { area, categoriaId, subcategoriaId, sedeId, prioridad });

  const nivelEfectivo = regla?.nivelRequerido ?? nivel;
  const espRequerida = regla?.espId ?? null;

  const rs = await pool.request()
    .input('area', sql.NVarChar, area)
    .input('nivel', sql.TinyInt, nivelEfectivo)
    .query(`
      SELECT u.NEUS_ID as userId, s.MAX_TICKETS as maxTickets, s.MAX_CHATS as maxChats,
             s.PRIORIDADES_PERMITIDAS as prioridadesPermitidas, s.HORARIO_INICIO as horarioInicio,
             s.HORARIO_FIN as horarioFin, s.DIAS_SEMANA as diasSemana, s.LAST_ASSIGNED_AT as lastAssignedAt
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
  candidatos = candidatos.filter((c) => horaActualEnRango(c.horarioInicio, c.horarioFin) && diaActualPermitido(c.diasSemana));

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

  return { userId: conCarga[0].userId, reglaAplicada: regla?.id ?? null };
}

async function evaluarReglasParaCriterios(pool, criterios) {
  const regla = await buscarReglaAplicable(pool, criterios);
  const resultado = await seleccionarTecnico(pool, criterios);
  return { regla, resultado };
}

module.exports = { seleccionarTecnico, evaluarReglasParaCriterios };
