const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { DEFAULT_TENANT } = require('../config/tenants');

// getIO() sin tenantKey devuelve la instancia raw de socket.io, cuyas rooms
// no llevan el prefijo `tenant:{key}:` con el que los sockets de agente se
// unen (ver joinUser en socketService.js) — sin esto, livechat:nueva_conversacion
// y el resto de eventos de esta cola nunca llegaban al agente.
function tenantKeyDe(req) {
  return (req?.user?.empresa || DEFAULT_TENANT).toLowerCase();
}

// Equipo autorizado a recibir transferencias de Chat en Vivo (curado a propósito, no es
// "todos los AD/TI" — solo quienes realmente atienden este canal).
const EQUIPO_TRANSFERENCIA = [1, 61, 2, 43]; // Edgar Montoya, Isabela Esmeralda, Jazminn Miranda, Raúl Pallares

const SELECT_CONVERSACION = `
  SELECT
    LC_ID as id,
    LC_VISITANTE_NOMBRE as visitanteNombre,
    LC_VISITANTE_EMAIL as visitanteEmail,
    LC_VISITANTE_TELEFONO as visitanteTelefono,
    LC_MOTIVO as motivo,
    LC_AGENTE_ID as agenteId,
    LC_AGENTE_NOMBRE as agenteNombre,
    LC_ESTADO as estado,
    LC_ORIGEN as origen,
    LC_FECHA_INICIO as fechaInicio,
    LC_FECHA_CIERRE as fechaCierre,
    LC_RATING as rating,
    LC_COMENTARIO_CIERRE as comentarioCierre,
    LC_MOTIVO_CIERRE as motivoCierre,
    LC_OPO_ID as opoId,
    LC_CAMPANIA_ID as campaniaId,
    LC_GRUPO_ID as grupoId,
    LC_MOTIVO_CIERRE_ID as motivoCierreId,
    LC_TICKET_ID as ticketId,
    LC_SOLICITANTE_ID as solicitanteId
  FROM dbo.LIVECHAT_CONVERSACIONES
`;

const SELECT_MENSAJE = `
  SELECT
    LM_ID as id,
    LM_CONVERSACION_ID as conversacionId,
    LM_EMISOR as emisor,
    LM_AGENTE_ID as agenteId,
    LM_CONTENIDO as contenido,
    LM_ARCHIVO_URL as archivoUrl,
    LM_FECHA as fecha,
    LM_LEIDO as leido
  FROM dbo.LIVECHAT_MENSAJES
`;

// Sin campaniaId: la config global de siempre (retrocompatible). Con
// campaniaId: la config específica de esa campaña si existe una fila para
// ella, si no cae a la global — misma jerarquía campaña > global.
async function getConfig(pool, campaniaId = null) {
  if (campaniaId) {
    const r = await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .query('SELECT TOP 1 * FROM dbo.LIVECHAT_CONFIG WHERE LCF_CAMPANIA_ID = @campaniaId');
    if (r.recordset[0]) return r.recordset[0];
  }
  const global = await pool.request()
    .query('SELECT TOP 1 * FROM dbo.LIVECHAT_CONFIG WHERE LCF_CAMPANIA_ID IS NULL ORDER BY LCF_ID ASC');
  return global.recordset[0] || null;
}

// true si, según el horario configurado, hoy/ahora está fuera de atención.
function isFueraDeHorario(config) {
  if (!config || !config.LCF_HORARIO_INICIO || !config.LCF_HORARIO_FIN) return false;
  // Intl.DateTimeFormat en vez de toLocaleString()+new Date(): ese patrón
  // reinterpreta el string formateado con el timezone LOCAL del proceso, así
  // que si el proceso Node corre con TZ distinta a la del SO (ej. UTC en un
  // contenedor/servicio, o heredada de una sesión distinta a la interactiva
  // donde se revisó "la hora del servidor"), el resultado queda corrido —
  // esto se calcula directamente en America/Mexico_City sin ese intermedio.
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const partesPorTipo = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const DIA_A_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const diaSemana = DIA_A_NUM[partesPorTipo.weekday];
  const horaRaw = partesPorTipo.hour === '24' ? '00' : partesPorTipo.hour;
  const hhmm = `${horaRaw}:${partesPorTipo.minute}`;

  const diasPermitidos = (config.LCF_DIAS_SEMANA || '')
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => !Number.isNaN(d));
  const fueraDia = diasPermitidos.length > 0 && !diasPermitidos.includes(diaSemana);

  // Sábado (6) puede tener su propio horario (ej. 09:00-14:00 vs 09:00-18:00
  // entre semana); si no está configurado, cae al horario general.
  const usaHorarioSabado = diaSemana === 6 && config.LCF_SABADO_HORARIO_INICIO && config.LCF_SABADO_HORARIO_FIN;
  const horaInicio = usaHorarioSabado ? config.LCF_SABADO_HORARIO_INICIO : config.LCF_HORARIO_INICIO;
  const horaFin    = usaHorarioSabado ? config.LCF_SABADO_HORARIO_FIN    : config.LCF_HORARIO_FIN;
  const fueraHora = hhmm < horaInicio || hhmm > horaFin;
  const resultado = fueraDia || fueraHora;

  console.log(`[livechat] isFueraDeHorario: hhmm=${hhmm} diaSemana=${diaSemana} horario=${horaInicio}-${horaFin} dias=${config.LCF_DIAS_SEMANA} => ${resultado ? 'FUERA' : 'dentro'}`);
  return resultado;
}

// grupoId opcional: si viene, solo busca entre agentes asignados a ese grupo
// (LIVECHAT_GRUPO_AGENTES) — sin grupoId, busca entre todos los agentes
// online/disponibles, igual que el comportamiento de siempre.
// maxChatsGlobal es el fallback final; la prioridad real de capacidad es
// LAE_MAX_CHATS_OVERRIDE (por agente) > LCA_MAX_CHATS_POR_AGENTE (por
// campaña, si se pasó campaniaId) > maxChatsGlobal.
async function buscarAgenteDisponible(pool, maxChatsGlobal, { grupoId = null, campaniaId = null, usarMotorReglas = false, area = 'TI' } = {}) {
  // Chat interno de Soporte TI: delega al motor de reglas de asignación unificado
  // (especialidad/categoría/sede/capacidad/carga real), en vez del ruteo simple
  // "menos ocupado" que usa el resto de campañas de livechat (que no tienen
  // perfil de "técnico" en TI_STAFF_STATUS).
  if (usarMotorReglas) {
    const reglasAsignacionService = require('../services/reglasAsignacionService');
    const seleccion = await reglasAsignacionService.seleccionarTecnico(pool, { area, nivel: 1, tipoCarga: 'chat' });
    if (!seleccion) return null;
    const rsNombre = await pool.request().input('uid', sql.Int, seleccion.userId).query(`SELECT NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);
    return { usuarioId: seleccion.userId, nombre: rsNombre.recordset[0]?.nombre || null };
  }

  // Cuenta conversaciones LC_ESTADO='activa' reales en vez de confiar en
  // LAE_CONVERSACIONES_ACTIVAS (contador manual incrementado/decrementado en
  // cada punto del código) — si algún flujo deja una conversación sin cerrar
  // formalmente (visitante que cierra la pestaña sin avisar, cierre que
  // falla a medias, etc.), el contador manual queda desincronizado para
  // siempre y el agente deja de recibir chats nuevos sin motivo aparente
  // aunque en la práctica solo tenga 1-2 conversaciones reales abiertas.
  // Contando en vivo, un chat huérfano deja de "contar" en cuanto se cierre
  // por cualquier vía, sin necesitar limpieza manual.
  const joinGrupo = grupoId
    ? 'JOIN dbo.LIVECHAT_GRUPO_AGENTES ga ON ga.LGA_USUARIO_ID = lae.LAE_USUARIO_ID AND ga.LGA_GRUPO_ID = @grupoId AND ga.LGA_ACTIVO = 1'
    : '';

  const request = pool.request()
    .input('maxChatsGlobal', sql.Int, maxChatsGlobal)
    .input('campaniaId', sql.Int, campaniaId);
  if (grupoId) request.input('grupoId', sql.Int, grupoId);

  const r = await request.query(`
      SELECT TOP 1 lae.LAE_USUARIO_ID as usuarioId, u.NEUS_NOMBRES as nombre,
        (SELECT COUNT(*) FROM dbo.LIVECHAT_CONVERSACIONES c WHERE c.LC_AGENTE_ID = lae.LAE_USUARIO_ID AND c.LC_ESTADO = 'activa') as activas,
        COALESCE(
          lae.LAE_MAX_CHATS_OVERRIDE,
          (SELECT LCA_MAX_CHATS_POR_AGENTE FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_ID = @campaniaId),
          @maxChatsGlobal
        ) as maxChatsResuelto
      FROM dbo.LIVECHAT_AGENTE_ESTADO lae
      JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = lae.LAE_USUARIO_ID
      ${joinGrupo}
      WHERE lae.LAE_ONLINE = 1 AND lae.LAE_DISPONIBLE = 1
        AND (SELECT COUNT(*) FROM dbo.LIVECHAT_CONVERSACIONES c WHERE c.LC_AGENTE_ID = lae.LAE_USUARIO_ID AND c.LC_ESTADO = 'activa')
          < COALESCE(
              lae.LAE_MAX_CHATS_OVERRIDE,
              (SELECT LCA_MAX_CHATS_POR_AGENTE FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_ID = @campaniaId),
              @maxChatsGlobal
            )
      ORDER BY activas ASC
    `);
  return r.recordset[0] || null;
}

async function insertarMensajeSistema(pool, conversacionId, contenido) {
  await pool.request()
    .input('convId', sql.Int, conversacionId)
    .input('contenido', sql.NVarChar, contenido)
    .query(`
      INSERT INTO dbo.LIVECHAT_MENSAJES (LM_CONVERSACION_ID, LM_EMISOR, LM_CONTENIDO)
      VALUES (@convId, 'sistema', @contenido)
    `);
}

// Heurística simple: minutos estimados = (visitantes en cola / agentes online) * 5, acotado 1-30.
async function calcularTiempoEsperaEstimado(pool) {
  const [colaR, agentesR] = await Promise.all([
    pool.request().query('SELECT COUNT(*) as total FROM dbo.LIVECHAT_COLA'),
    pool.request().query('SELECT COUNT(*) as total FROM dbo.LIVECHAT_AGENTE_ESTADO WHERE LAE_ONLINE = 1'),
  ]);
  const enCola = colaR.recordset[0].total || 0;
  const agentesOnline = Math.max(agentesR.recordset[0].total || 0, 1);
  const estimado = Math.round((enCola / agentesOnline) * 5) + 2;
  return Math.min(Math.max(estimado, 1), 30);
}

function formatMensajeCola(template, posicion, total, tiempoEstimado) {
  return String(template || '')
    .replace(/\{posicion_cola\}/g, posicion)
    .replace(/\{total_cola\}/g, total)
    .replace(/\{tiempo_espera\}/g, tiempoEstimado);
}

async function getEstadoCola(pool, conversacionId) {
  const r = await pool.request()
    .input('convId', sql.Int, conversacionId)
    .query(`
      SELECT LCO_TICKET as ticket, LCO_FECHA_ENTRADA as fechaEntrada,
        (SELECT COUNT(*) FROM dbo.LIVECHAT_COLA c2 WHERE c2.LCO_TICKET <= c1.LCO_TICKET) as posicion,
        (SELECT COUNT(*) FROM dbo.LIVECHAT_COLA) as total
      FROM dbo.LIVECHAT_COLA c1
      WHERE c1.LCO_CONVERSACION_ID = @convId
    `);
  return r.recordset[0] || null;
}

// Intenta asignar el primer visitante de la cola a un agente recién liberado.
// Se llama después de cerrar una conversación o de que un agente se marque disponible.
async function intentarAsignarSiguienteEnCola(pool, tenantKey = DEFAULT_TENANT) {
  const config = await getConfig(pool);
  const maxChats = config?.LCF_MAX_CHATS_POR_AGENTE || 5;

  const agente = await buscarAgenteDisponible(pool, maxChats);
  if (!agente) return;

  const siguiente = await pool.request().query(`
    SELECT TOP 1 LCO_ID as colaId, LCO_CONVERSACION_ID as conversacionId
    FROM dbo.LIVECHAT_COLA ORDER BY LCO_TICKET ASC
  `);
  const entry = siguiente.recordset[0];
  if (!entry) return;

  await pool.request()
    .input('convId', sql.Int, entry.conversacionId)
    .input('agenteId', sql.Int, agente.usuarioId)
    .input('agenteNombre', sql.NVarChar, agente.nombre)
    .query(`
      UPDATE dbo.LIVECHAT_CONVERSACIONES
      SET LC_AGENTE_ID = @agenteId, LC_AGENTE_NOMBRE = @agenteNombre, LC_ESTADO = 'activa'
      WHERE LC_ID = @convId
    `);

  await pool.request()
    .input('colaId', sql.Int, entry.colaId)
    .query('DELETE FROM dbo.LIVECHAT_COLA WHERE LCO_ID = @colaId');

  await pool.request()
    .input('usuarioId', sql.Int, agente.usuarioId)
    .query(`
      UPDATE dbo.LIVECHAT_AGENTE_ESTADO
      SET LAE_CONVERSACIONES_ACTIVAS = LAE_CONVERSACIONES_ACTIVAS + 1
      WHERE LAE_USUARIO_ID = @usuarioId
    `);

  const bienvenida = config?.LCF_MSG_BIENVENIDA;
  if (bienvenida) await insertarMensajeSistema(pool, entry.conversacionId, bienvenida);

  try {
    // `user:{id}` lleva prefijo de tenant (joinUser, agente logueado); `livechat:{id}`
    // no (visitante público sin empresa declarada) — ver socketService.js:456-461.
    socketService.getIO(tenantKey).to(`user:${agente.usuarioId}`).emit('livechat:nueva_conversacion', { conversacionId: entry.conversacionId });
    socketService.getIO().to(`livechat:${entry.conversacionId}`).emit('livechat:conversacion_tomada', {
      conversacionId: entry.conversacionId,
      agenteNombre: agente.nombre,
    });
  } catch (e) {
    console.warn('⚠️ No se pudo emitir asignación desde cola:', e?.message || e);
  }
}

// Busca un contacto CRM existente por email o teléfono (evita duplicar el
// mismo prospecto si ya escribió antes por Chatbot, formulario web, o un
// livechat previo); si no hay coincidencia, crea contacto + oportunidad
// nuevos, etiquetados 'livechat-web'. Devuelve el OPO_ID en ambos casos, o
// null si no hay ni email ni teléfono con qué identificar al visitante.
async function obtenerOCrearOportunidadLivechat(pool, { nombre, email, telefono, motivo }) {
  const emailNorm = (email || '').trim();
  const telNorm = (telefono || '').trim();
  if (!emailNorm && !telNorm) return null;

  const existente = await pool.request()
    .input('email', sql.NVarChar(200), emailNorm)
    .input('telefono', sql.NVarChar(30), telNorm)
    .query(`
      SELECT TOP 1 o.OPO_ID as opoId
      FROM dbo.CRM_OPORTUNIDADES o
      JOIN dbo.CRM_CONTACTOS c ON c.CONT_ID = o.OPO_CONTACTO_ID
      WHERE o.OPO_ACTIVO = 1
        AND ((@email <> '' AND c.CONT_CORREO = @email) OR (@telefono <> '' AND c.CONT_TELEFONO = @telefono))
      ORDER BY o.OPO_FECHA DESC
    `);
  if (existente.recordset[0]) return existente.recordset[0].opoId;

  const rCont = await pool.request()
    .input('nombre', sql.NVarChar(200), (nombre || 'Visitante web').trim().slice(0, 200))
    .input('correo', sql.NVarChar(200), emailNorm.slice(0, 200))
    .input('telefono', sql.NVarChar(30), telNorm.slice(0, 30))
    .input('notas', sql.NVarChar(sql.MAX), '[livechat-web]')
    .query(`
      INSERT INTO CRM_CONTACTOS (CONT_NOMBRE, CONT_CORREO, CONT_TELEFONO, CONT_NOTAS)
      OUTPUT INSERTED.CONT_ID
      VALUES (@nombre, @correo, @telefono, @notas)
    `);
  const contId = rCont.recordset[0].CONT_ID;

  const nombreOpo = `[Chat en Vivo] ${motivo || 'Consulta'} — ${nombre || 'Visitante web'}`;
  const rOpo = await pool.request()
    .input('nombre', sql.NVarChar(200), nombreOpo.slice(0, 200))
    .input('contId', sql.Int, contId)
    .input('tags', sql.NVarChar(200), 'livechat-web')
    .query(`
      INSERT INTO CRM_OPORTUNIDADES (OPO_NOMBRE, OPO_CONTACTO_ID, OPO_ETAPA, OPO_TAGS)
      OUTPUT INSERTED.OPO_ID
      VALUES (@nombre, @contId, 'prospecto', @tags)
    `);
  const opoId = rOpo.recordset[0].OPO_ID;

  await pool.request()
    .input('opoId', sql.Int, opoId)
    .input('contenido', sql.NVarChar(500), 'Lead desde Chat en Vivo')
    .query(`
      INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO)
      VALUES (@opoId, 'creacion', @contenido)
    `);

  return opoId;
}

// Público (sin auth) — el chatbot de la página web lo llama al escalar a agente humano.
// campaignToken es opcional: sin él, el comportamiento es exactamente el de
// siempre (config global, sin filtro de grupo) — así el chatbot público
// actual, que no manda campaña, sigue funcionando sin cambios.
exports.iniciarConversacion = async (req, res) => {
  try {
    const { nombre, email, telefono, motivo, campaignToken, grupoId: grupoIdBody } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    let campania = null;
    let grupo = null;
    if (campaignToken) {
      const rCampania = await pool.request()
        .input('token', sql.NVarChar(64), campaignToken)
        .query('SELECT LCA_ID as id, LCA_ACTIVO as activo, LCA_MAX_CHATS_POR_AGENTE as maxChatsPorAgente FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_TOKEN = @token');
      campania = rCampania.recordset[0] || null;
      if (!campania || !campania.activo) {
        return res.status(404).json({ success: false, message: 'Campaña no encontrada o inactiva' });
      }

      const grupoRequest = pool.request().input('campaniaId', sql.Int, campania.id);
      let grupoQuery;
      if (grupoIdBody) {
        grupoRequest.input('grupoId', sql.Int, grupoIdBody);
        grupoQuery = 'SELECT LG_ID as id FROM dbo.LIVECHAT_GRUPOS WHERE LG_ID = @grupoId AND LG_CAMPANIA_ID = @campaniaId AND LG_ACTIVO = 1';
      } else {
        grupoQuery = 'SELECT TOP 1 LG_ID as id FROM dbo.LIVECHAT_GRUPOS WHERE LG_CAMPANIA_ID = @campaniaId AND LG_ACTIVO = 1 ORDER BY LG_ID ASC';
      }
      const rGrupo = await grupoRequest.query(grupoQuery);
      grupo = rGrupo.recordset[0] || null;
      if (!grupo) {
        return res.status(404).json({ success: false, message: 'Esta campaña no tiene ningún grupo de atención activo' });
      }
    }

    const config = await getConfig(pool, campania?.id ?? null);
    if (isFueraDeHorario(config)) {
      return res.status(503).json({
        success: false,
        code: 'FUERA_DE_HORARIO',
        message: config?.LCF_MSG_FUERA_HORARIO || 'Fuera de horario de atención.',
      });
    }

    const maxChats = config?.LCF_MAX_CHATS_POR_AGENTE || 5;
    const agente = await buscarAgenteDisponible(pool, maxChats, { grupoId: grupo?.id ?? null, campaniaId: campania?.id ?? null });

    // No debe tumbar el inicio del chat si el CRM falla por cualquier motivo —
    // el chat en vivo es la prioridad; el vínculo a CRM es un valor agregado.
    let opoId = null;
    try {
      opoId = await obtenerOCrearOportunidadLivechat(pool, { nombre, email, telefono, motivo });
    } catch (e) {
      console.warn('⚠️ No se pudo crear/vincular oportunidad CRM para livechat:', e?.message || e);
    }

    const insert = await pool.request()
      .input('nombre', sql.NVarChar, nombre || null)
      .input('email', sql.NVarChar, email || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('motivo', sql.NVarChar, motivo || null)
      .input('agenteId', sql.Int, agente ? agente.usuarioId : null)
      .input('agenteNombre', sql.NVarChar, agente ? agente.nombre : null)
      .input('estado', sql.NVarChar, agente ? 'activa' : 'esperando')
      .input('origen', sql.NVarChar, req.body.origen === 'chatbot_escalado' ? 'chatbot_escalado' : 'directo')
      .input('opoId', sql.Int, opoId)
      .input('campaniaId', sql.Int, campania?.id ?? null)
      .input('grupoId', sql.Int, grupo?.id ?? null)
      .query(`
        INSERT INTO dbo.LIVECHAT_CONVERSACIONES
          (LC_VISITANTE_NOMBRE, LC_VISITANTE_EMAIL, LC_VISITANTE_TELEFONO, LC_MOTIVO, LC_AGENTE_ID, LC_AGENTE_NOMBRE, LC_ESTADO, LC_ORIGEN, LC_OPO_ID, LC_CAMPANIA_ID, LC_GRUPO_ID)
        OUTPUT INSERTED.LC_ID as id
        VALUES (@nombre, @email, @telefono, @motivo, @agenteId, @agenteNombre, @estado, @origen, @opoId, @campaniaId, @grupoId)
      `);

    const conversacionId = insert.recordset[0].id;

    if (motivo) {
      await insertarMensajeSistema(pool, conversacionId, `Motivo: ${motivo}`);
    }

    if (agente) {
      await pool.request()
        .input('usuarioId', sql.Int, agente.usuarioId)
        .query(`
          UPDATE dbo.LIVECHAT_AGENTE_ESTADO
          SET LAE_CONVERSACIONES_ACTIVAS = LAE_CONVERSACIONES_ACTIVAS + 1
          WHERE LAE_USUARIO_ID = @usuarioId
        `);
      const bienvenida = config?.LCF_MSG_BIENVENIDA;
      if (bienvenida) await insertarMensajeSistema(pool, conversacionId, bienvenida);

      try {
        socketService.getIO(tenantKeyDe(req)).to(`user:${agente.usuarioId}`).emit('livechat:nueva_conversacion', { conversacionId });
      } catch (e) {
        console.warn('⚠️ No se pudo emitir livechat:nueva_conversacion:', e?.message || e);
      }
    }

    let cola = null;
    if (!agente) {
      const ticketR = await pool.request().query(`
        SELECT ISNULL(MAX(LCO_TICKET), 0) + 1 as siguienteTicket FROM dbo.LIVECHAT_COLA
      `);
      const ticket = ticketR.recordset[0].siguienteTicket;
      await pool.request()
        .input('convId', sql.Int, conversacionId)
        .input('ticket', sql.Int, ticket)
        .query(`
          INSERT INTO dbo.LIVECHAT_COLA (LCO_CONVERSACION_ID, LCO_TICKET)
          VALUES (@convId, @ticket)
        `);
      const estadoCola = await getEstadoCola(pool, conversacionId);
      const tiempoEstimado = await calcularTiempoEsperaEstimado(pool);
      cola = {
        ticket: estadoCola.posicion,
        posicion: estadoCola.posicion,
        total: estadoCola.total,
        tiempoEstimadoMinutos: tiempoEstimado,
        mensaje: formatMensajeCola(config?.LCF_MSG_EN_COLA, estadoCola.posicion, estadoCola.total, tiempoEstimado),
      };

      // Sin agente asignado todavía: avisamos a todos los agentes conectados (no hay una sala
      // individual a quién dirigir el evento) para que la lista de "esperando" se actualice sola.
      try {
        socketService.getIO(tenantKeyDe(req)).emit('livechat:nueva_en_cola', { conversacionId });
      } catch (e) {
        console.warn('⚠️ No se pudo emitir livechat:nueva_en_cola:', e?.message || e);
      }
    }

    const mensajes = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_MENSAJE} WHERE LM_CONVERSACION_ID = @convId ORDER BY LM_FECHA ASC`);

    res.status(201).json({
      success: true,
      data: {
        conversacionId,
        estado: agente ? 'activa' : 'esperando',
        agenteAsignado: !!agente,
        mensajes: mensajes.recordset,
        mensajeSinAgentes: agente ? null : (config?.LCF_MSG_SIN_AGENTES || 'En este momento no hay agentes disponibles.'),
        cola,
      },
    });
  } catch (error) {
    console.error('Error iniciando conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Público — el visitante consulta su posición en la cola mientras espera.
exports.getPosicionCola = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }
    if (conv.recordset[0].estado !== 'esperando') {
      return res.json({ success: true, data: { enCola: false, estado: conv.recordset[0].estado } });
    }

    const estadoCola = await getEstadoCola(pool, conversacionId);
    if (!estadoCola) {
      return res.json({ success: true, data: { enCola: false, estado: conv.recordset[0].estado } });
    }

    await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query('UPDATE dbo.LIVECHAT_COLA SET LCO_ULTIMO_PING = GETDATE() WHERE LCO_CONVERSACION_ID = @convId');

    const config = await getConfig(pool);
    const tiempoEstimado = await calcularTiempoEsperaEstimado(pool);
    res.json({
      success: true,
      data: {
        enCola: true,
        posicion: estadoCola.posicion,
        total: estadoCola.total,
        tiempoEstimadoMinutos: tiempoEstimado,
        mensaje: formatMensajeCola(config?.LCF_MSG_EN_COLA, estadoCola.posicion, estadoCola.total, tiempoEstimado),
      },
    });
  } catch (error) {
    console.error('Error obteniendo posición en cola:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Público — el visitante abandona la cola (cierra la pestaña, se cansó de esperar, etc.)
exports.abandonarCola = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query('DELETE FROM dbo.LIVECHAT_COLA WHERE LCO_CONVERSACION_ID = @convId');
    const upd = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`
        UPDATE dbo.LIVECHAT_CONVERSACIONES SET LC_ESTADO = 'cerrada', LC_FECHA_CIERRE = GETDATE(), LC_MOTIVO_CIERRE = 'abandono_cola'
        OUTPUT INSERTED.LC_OPO_ID as opoId
        WHERE LC_ID = @convId AND LC_ESTADO = 'esperando'
      `);

    if (upd.recordset[0]) {
      await guardarTranscripcionEnCrm(pool, conversacionId, upd.recordset[0].opoId);
    }

    res.json({ success: true, message: 'Saliste de la cola' });
  } catch (error) {
    console.error('Error abandonando cola:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Compartida entre salirConversacion (endpoint dedicado) y enviarMensaje
// (cuando el visitante escribe "salir"/"cerrar" como texto — el widget público
// no tiene botón de salir, así que es la única vía real que tiene hoy).
// No pasa por 'pendiente_rating' como cerrarConversacion (agente): el visitante
// que se va no se queda para calificar, así que se cierra directo. Si tenía
// agente asignado, se le libera el cupo y se le notifica para que el chat
// desaparezca de su panel sin que tenga que cerrarlo él.
async function cerrarConversacionPorVisitante(pool, conversacion, tenantKey) {
  const conversacionId = conversacion.id;
  // 'pendiente_rating' incluido a propósito: el agente ya cerró desde su lado
  // y el visitante nunca calificó — sigue "abierto" solo para él hasta que
  // cierre la pestaña. Cerrar aquí también evita que el chat quede huérfano
  // contando contra el cupo del agente indefinidamente.
  if (!['esperando', 'activa', 'pendiente_rating'].includes(conversacion.estado)) {
    return false;
  }

  await pool.request()
    .input('convId', sql.Int, conversacionId)
    .query('DELETE FROM dbo.LIVECHAT_COLA WHERE LCO_CONVERSACION_ID = @convId');

  await pool.request()
    .input('convId', sql.Int, conversacionId)
    .query(`
      UPDATE dbo.LIVECHAT_CONVERSACIONES
      SET LC_ESTADO = 'cerrada', LC_FECHA_CIERRE = GETDATE(), LC_MOTIVO_CIERRE = 'visitante_salio'
      WHERE LC_ID = @convId
    `);

  // Si venía de 'pendiente_rating', cerrarConversacion ya le liberó el cupo
  // al agente cuando él cerró desde su lado — no restar de nuevo aquí.
  const agenteId = conversacion.estado === 'activa' ? conversacion.agenteId : null;
  if (agenteId) {
    await pool.request()
      .input('usuarioId', sql.Int, agenteId)
      .query(`
        UPDATE dbo.LIVECHAT_AGENTE_ESTADO
        SET LAE_CONVERSACIONES_ACTIVAS = CASE WHEN LAE_CONVERSACIONES_ACTIVAS > 0 THEN LAE_CONVERSACIONES_ACTIVAS - 1 ELSE 0 END
        WHERE LAE_USUARIO_ID = @usuarioId
      `);
  }

  await guardarTranscripcionEnCrm(pool, conversacionId, conversacion.opoId);

  try {
    socketService.getIO().to(`livechat:${conversacionId}`).emit('livechat:conversacion_cerrada', { conversacionId: Number(conversacionId) });
  } catch (e) {
    console.warn('⚠️ No se pudo emitir livechat:conversacion_cerrada (salida del visitante):', e?.message || e);
  }

  await intentarAsignarSiguienteEnCola(pool, tenantKey);
  return true;
}

// Público — el visitante sale de su propia conversación ya en curso, usando
// el botón/acción dedicada del cliente (si existe).
exports.salirConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }

    const cerrada = await cerrarConversacionPorVisitante(pool, conv.recordset[0], tenantKeyDe(req));
    res.json({ success: true, message: cerrada ? 'Saliste de la conversación' : 'La conversación ya estaba cerrada' });
  } catch (error) {
    console.error('Error al salir de la conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Palabras que el visitante puede escribir para salir del chat, ya que el
// widget público hoy no tiene un botón de salir/cerrar (ver conversación con
// el equipo — no hay código fuente del widget disponible en este servidor).
// Coincidencia exacta e insensible a mayúsculas/acentos/espacios extra, no
// una subcadena — así "cerrar la puerta" no dispara el cierre por accidente.
const PALABRAS_SALIDA = new Set(['salir', 'cerrar', 'cerrar chat', 'salir del chat', 'terminar chat', 'finalizar chat']);

function esComandoDeSalida(texto) {
  const normalizado = (texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return PALABRAS_SALIDA.has(normalizado);
}

// Público — el visitante (o el agente) envía un mensaje.
exports.enviarMensaje = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const { contenido, emisor, archivoUrl } = req.body;

    if (!contenido || !contenido.trim()) {
      return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
    }
    const emisorNormalizado = emisor === 'agente' ? 'agente' : 'visitante';
    if (emisorNormalizado === 'agente' && !req.user) {
      return res.status(401).json({ success: false, message: 'Token requerido para enviar como agente' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }
    if (conv.recordset[0].estado === 'cerrada') {
      return res.status(409).json({ success: false, message: 'La conversación ya está cerrada' });
    }

    const agenteId = emisorNormalizado === 'agente' ? (req.user?.id || null) : null;

    const insert = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .input('emisor', sql.NVarChar, emisorNormalizado)
      .input('agenteId', sql.Int, agenteId)
      .input('contenido', sql.NVarChar, contenido)
      .input('archivoUrl', sql.NVarChar, archivoUrl || null)
      .query(`
        INSERT INTO dbo.LIVECHAT_MENSAJES (LM_CONVERSACION_ID, LM_EMISOR, LM_AGENTE_ID, LM_CONTENIDO, LM_ARCHIVO_URL)
        OUTPUT INSERTED.LM_ID as id
        VALUES (@convId, @emisor, @agenteId, @contenido, @archivoUrl)
      `);

    const mensaje = await pool.request()
      .input('id', sql.Int, insert.recordset[0].id)
      .query(`${SELECT_MENSAJE} WHERE LM_ID = @id`);

    const data = mensaje.recordset[0];

    try {
      // La sala `livechat:{id}` no lleva prefijo de tenant (ver socketService.js:456-461:
      // el widget público no declara empresa al conectar), así que esta sí va por getIO() a secas.
      const io = socketService.getIO();
      io.to(`livechat:${conversacionId}`).emit('receive_livechat_message', data);

      // Aviso aparte para quien tenga la lista de conversaciones abierta pero
      // NO esta conversación seleccionada (join_livechat_conversation solo
      // ocurre al abrir el detalle) — sin esto, un mensaje nuevo de un chat
      // no seleccionado solo se veía tras recargar o esperar el polling.
      // La sala `user:{id}` sí lleva prefijo de tenant (se une vía joinUser, agente logueado).
      const agenteDestino = conv.recordset[0].agenteId;
      if (agenteDestino) {
        socketService.getIO(tenantKeyDe(req)).to(`user:${agenteDestino}`).emit('livechat:actividad_conversacion', { conversacionId: Number(conversacionId) });
      } else {
        io.emit('livechat:actividad_conversacion', { conversacionId: Number(conversacionId) });
      }
    } catch (e) {
      console.warn('⚠️ No se pudo emitir receive_livechat_message:', e?.message || e);
    }

    // El widget público no tiene botón de salir/cerrar hoy — "salir" o
    // "cerrar" escrito como mensaje es la única forma que tiene el visitante
    // de terminar su propia conversación. Se cierra después de guardar y
    // emitir su mensaje normalmente, para que quede en la transcripción.
    if (emisorNormalizado === 'visitante' && esComandoDeSalida(contenido)) {
      await cerrarConversacionPorVisitante(pool, conv.recordset[0], tenantKeyDe(req));
    }

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error enviando mensaje de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Público — el visitante recarga/reconecta y necesita el historial de su conversación.
exports.getConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }

    const mensajes = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_MENSAJE} WHERE LM_CONVERSACION_ID = @convId ORDER BY LM_FECHA ASC`);

    res.json({ success: true, data: { ...conv.recordset[0], mensajes: mensajes.recordset } });
  } catch (error) {
    console.error('Error obteniendo conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado (agente) — sus conversaciones activas/en espera propias, o todas las 'esperando' sin asignar.
exports.getMisConversaciones = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const estado = req.query.estado;

    let where = '(LC_AGENTE_ID = @agenteId)';
    if (estado === 'esperando') {
      where = `(LC_ESTADO = 'esperando' AND LC_AGENTE_ID IS NULL)`;
    } else if (estado) {
      where = '(LC_AGENTE_ID = @agenteId AND LC_ESTADO = @estado)';
    }

    const request = pool.request().input('agenteId', sql.Int, req.user.id);
    if (estado && estado !== 'esperando') request.input('estado', sql.NVarChar, estado);

    // 'esperando' se pinta en el orden real de la cola (por ticket, quién llegó
    // primero), con su posición/total incluidos para que el agente vea "2 de 5"
    // en la lista sin tener que abrir cada conversación.
    if (estado === 'esperando') {
      const result = await request.query(`
        SELECT c.*,
          (SELECT COUNT(*) FROM dbo.LIVECHAT_COLA c2 WHERE c2.LCO_TICKET <= c1.LCO_TICKET) as posicionCola,
          (SELECT COUNT(*) FROM dbo.LIVECHAT_COLA) as totalCola
        FROM (${SELECT_CONVERSACION} WHERE ${where}) c
        LEFT JOIN dbo.LIVECHAT_COLA c1 ON c1.LCO_CONVERSACION_ID = c.id
        ORDER BY ISNULL(c1.LCO_TICKET, 999999999) ASC
      `);
      res.json({ success: true, data: result.recordset });
      return;
    }

    const result = await request.query(`${SELECT_CONVERSACION} WHERE ${where} ORDER BY LC_FECHA_INICIO DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo conversaciones del agente:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado (agente) — toma una conversación en espera.
exports.tomarConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }
    if (conv.recordset[0].agenteId && conv.recordset[0].agenteId !== req.user.id) {
      return res.status(409).json({ success: false, message: 'Ya fue tomada por otro agente' });
    }

    await pool.request()
      .input('convId', sql.Int, conversacionId)
      .input('agenteId', sql.Int, req.user.id)
      .input('agenteNombre', sql.NVarChar, req.user.nombre || req.user.username || null)
      .query(`
        UPDATE dbo.LIVECHAT_CONVERSACIONES
        SET LC_AGENTE_ID = @agenteId, LC_AGENTE_NOMBRE = @agenteNombre, LC_ESTADO = 'activa'
        WHERE LC_ID = @convId
      `);

    await pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        MERGE dbo.LIVECHAT_AGENTE_ESTADO AS target
        USING (SELECT @usuarioId AS usuarioId) AS src
        ON target.LAE_USUARIO_ID = src.usuarioId
        WHEN MATCHED THEN UPDATE SET LAE_CONVERSACIONES_ACTIVAS = LAE_CONVERSACIONES_ACTIVAS + 1
        WHEN NOT MATCHED THEN INSERT (LAE_USUARIO_ID, LAE_ONLINE, LAE_DISPONIBLE, LAE_CONVERSACIONES_ACTIVAS)
          VALUES (@usuarioId, 1, 1, 1);
      `);

    try {
      socketService.getIO().to(`livechat:${conversacionId}`).emit('livechat:conversacion_tomada', {
        conversacionId: Number(conversacionId),
        agenteNombre: req.user.nombre || req.user.username || 'Agente',
      });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir livechat:conversacion_tomada:', e?.message || e);
    }

    res.json({ success: true, message: 'Conversación asignada' });
  } catch (error) {
    console.error('Error tomando conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Arma la transcripción completa de la conversación y la guarda como una
// interacción propia en el Historial de la ficha del prospecto (CRM_INTERACCIONES),
// igual que ya se hace con el Chatbot. No falla el cierre del chat si esto
// falla — se limita a avisar en consola.
async function guardarTranscripcionEnCrm(pool, conversacionId, opoId) {
  if (!opoId) return;
  try {
    const mensajes = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_MENSAJE} WHERE LM_CONVERSACION_ID = @convId ORDER BY LM_FECHA ASC`);
    if (mensajes.recordset.length === 0) return;

    const ROTULOS = { visitante: 'Visitante', agente: 'Agente', sistema: 'Sistema' };
    const transcripcion = mensajes.recordset
      .map((m) => `${ROTULOS[m.emisor] || m.emisor}: ${m.contenido}`)
      .join('\n');

    await pool.request()
      .input('opoId', sql.Int, opoId)
      .input('contenido', sql.NVarChar(sql.MAX), `Transcripción del Chat en Vivo:\n${transcripcion}`)
      .query(`
        INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO)
        VALUES (@opoId, 'livechat', @contenido)
      `);
  } catch (e) {
    console.warn('⚠️ No se pudo guardar transcripción de livechat en CRM:', e?.message || e);
  }
}

// Autenticado (agente) — cierra la conversación (lado agente).
// Si la conversación pertenece a un grupo (viene de una campaña), el motivo
// de cierre es obligatorio y debe ser uno de LIVECHAT_MOTIVOS_CIERRE de ese
// grupo — da reportes de cierre consistentes por campaña. Sin grupo (flujo
// actual del chatbot público, sin campaña), sigue aceptando motivoCierre
// como texto libre opcional, igual que siempre — retrocompatible.
// El cierre real ya NO ocurre aquí: pasa a 'pendiente_rating' y espera a que
// el visitante califique (ver exports.calificarConversacion) antes de
// liberar el cupo del agente y guardar la transcripción en el CRM.
exports.cerrarConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const { motivoCierre, motivoCierreId, comentarioCierre } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }
    const conversacion = conv.recordset[0];

    let motivoCierreTexto = motivoCierre || null;
    if (conversacion.grupoId) {
      if (!motivoCierreId) {
        return res.status(400).json({ success: false, message: 'Debes elegir un motivo de cierre' });
      }
      const rMotivo = await pool.request()
        .input('id', sql.Int, motivoCierreId)
        .input('grupoId', sql.Int, conversacion.grupoId)
        .query('SELECT LMC_MOTIVO as motivo, LMC_REQUIERE_COMENTARIO as requiereComentario FROM dbo.LIVECHAT_MOTIVOS_CIERRE WHERE LMC_ID = @id AND LMC_GRUPO_ID = @grupoId AND LMC_ACTIVO = 1');
      const motivoRow = rMotivo.recordset[0];
      if (!motivoRow) {
        return res.status(400).json({ success: false, message: 'El motivo de cierre no es válido para este grupo' });
      }
      if (motivoRow.requiereComentario && !(comentarioCierre || '').trim()) {
        return res.status(400).json({ success: false, message: 'Este motivo requiere un comentario' });
      }
      motivoCierreTexto = motivoRow.motivo;
    }

    await pool.request()
      .input('convId', sql.Int, conversacionId)
      .input('motivoCierre', sql.NVarChar, motivoCierreTexto)
      .input('motivoCierreId', sql.Int, motivoCierreId || null)
      .input('comentarioCierre', sql.NVarChar, comentarioCierre || null)
      .query(`
        UPDATE dbo.LIVECHAT_CONVERSACIONES
        SET LC_ESTADO = 'pendiente_rating', LC_MOTIVO_CIERRE = @motivoCierre, LC_MOTIVO_CIERRE_ID = @motivoCierreId, LC_COMENTARIO_CIERRE = @comentarioCierre
        WHERE LC_ID = @convId
      `);

    // El chat deja de contar contra el cupo del agente aunque, del lado del
    // visitante, siga "abierto" a la espera de que califique.
    const agenteId = conversacion.agenteId;
    if (agenteId) {
      await pool.request()
        .input('usuarioId', sql.Int, agenteId)
        .query(`
          UPDATE dbo.LIVECHAT_AGENTE_ESTADO
          SET LAE_CONVERSACIONES_ACTIVAS = CASE WHEN LAE_CONVERSACIONES_ACTIVAS > 0 THEN LAE_CONVERSACIONES_ACTIVAS - 1 ELSE 0 END
          WHERE LAE_USUARIO_ID = @usuarioId
        `);
    }

    try {
      socketService.getIO().to(`livechat:${conversacionId}`).emit('livechat:pendiente_calificacion', { conversacionId: Number(conversacionId) });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir livechat:pendiente_calificacion:', e?.message || e);
    }

    await intentarAsignarSiguienteEnCola(pool, tenantKeyDe(req));

    res.json({ success: true, message: 'Conversación cerrada, esperando calificación del visitante' });
  } catch (error) {
    console.error('Error cerrando conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Público (sin auth) — el visitante califica la atención tras el cierre del
// agente. Solo aquí se completa el cierre real: guarda la transcripción en
// el CRM y libera el turno de la cola. Si el visitante nunca califica, la
// conversación queda en 'pendiente_rating' indefinidamente — no bloquea al
// agente (su cupo ya se liberó en cerrarConversacion).
exports.calificarConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const { rating, comentario } = req.body;
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'La calificación debe ser un número entero entre 1 y 5' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }
    if (conv.recordset[0].estado !== 'pendiente_rating') {
      return res.status(409).json({ success: false, message: 'Esta conversación no está esperando calificación' });
    }

    await pool.request()
      .input('convId', sql.Int, conversacionId)
      .input('rating', sql.Int, ratingNum)
      .input('comentario', sql.NVarChar, comentario || null)
      .query(`
        UPDATE dbo.LIVECHAT_CONVERSACIONES
        SET LC_ESTADO = 'cerrada', LC_FECHA_CIERRE = GETDATE(), LC_RATING = @rating,
            LC_COMENTARIO_CIERRE = COALESCE(@comentario, LC_COMENTARIO_CIERRE)
        WHERE LC_ID = @convId
      `);

    await guardarTranscripcionEnCrm(pool, conversacionId, conv.recordset[0].opoId);

    try {
      socketService.getIO().to(`livechat:${conversacionId}`).emit('livechat:conversacion_cerrada', { conversacionId: Number(conversacionId) });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir livechat:conversacion_cerrada:', e?.message || e);
    }

    await intentarAsignarSiguienteEnCola(pool, tenantKeyDe(req));

    res.json({ success: true, message: 'Gracias por tu calificación' });
  } catch (error) {
    console.error('Error calificando conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado (agente) — toggle disponible/no disponible manual. Un toggle
// manual saca al agente del modo automático (ver ajustarDisponibilidadPorHorarioCron)
// para que el cron de horario no le revierta la decisión en el siguiente tick;
// vuelve a modo automático al inicio del siguiente bloque de horario (ver cron).
exports.setDisponible = async (req, res) => {
  try {
    const { disponible } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .input('disponible', sql.Bit, disponible === true)
      .query(`
        MERGE dbo.LIVECHAT_AGENTE_ESTADO AS target
        USING (SELECT @usuarioId AS usuarioId) AS src
        ON target.LAE_USUARIO_ID = src.usuarioId
        WHEN MATCHED THEN UPDATE SET LAE_ONLINE = 1, LAE_DISPONIBLE = @disponible, LAE_ULTIMA_CONEXION = GETDATE(), LAE_MODO_AUTOMATICO = 0
        WHEN NOT MATCHED THEN INSERT (LAE_USUARIO_ID, LAE_ONLINE, LAE_DISPONIBLE, LAE_CONVERSACIONES_ACTIVAS, LAE_ULTIMA_CONEXION, LAE_MODO_AUTOMATICO)
          VALUES (@usuarioId, 1, @disponible, 0, GETDATE(), 0);
      `);

    if (disponible === true) {
      await intentarAsignarSiguienteEnCola(pool, tenantKeyDe(req));
    }

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error actualizando disponibilidad de agente:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMiEstado = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        SELECT LAE_ONLINE as online, LAE_DISPONIBLE as disponible, LAE_CONVERSACIONES_ACTIVAS as conversacionesActivas
        FROM dbo.LIVECHAT_AGENTE_ESTADO WHERE LAE_USUARIO_ID = @usuarioId
      `);
    res.json({ success: true, data: r.recordset[0] || { online: false, disponible: false, conversacionesActivas: 0 } });
  } catch (error) {
    console.error('Error obteniendo estado de agente:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado — lista de todo agente que alguna vez tocó el toggle de
// disponibilidad (tiene fila en LIVECHAT_AGENTE_ESTADO), con su estado actual.
// Es el mismo universo/condición que usa buscarAgenteDisponible (LAE_ONLINE=1
// AND LAE_DISPONIBLE=1) para decidir a quién asignarle la siguiente conversación.
exports.getAgentesEstado = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().query(`
      SELECT
        lae.LAE_USUARIO_ID as usuarioId,
        u.NEUS_NOMBRES as nombre,
        lae.LAE_ONLINE as online,
        lae.LAE_DISPONIBLE as disponible,
        lae.LAE_CONVERSACIONES_ACTIVAS as conversacionesActivas,
        lae.LAE_MODO_AUTOMATICO as modoAutomatico,
        lae.LAE_ULTIMA_CONEXION as ultimaConexion
      FROM dbo.LIVECHAT_AGENTE_ESTADO lae
      JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = lae.LAE_USUARIO_ID
      ORDER BY (CASE WHEN lae.LAE_ONLINE = 1 AND lae.LAE_DISPONIBLE = 1 THEN 0 ELSE 1 END), u.NEUS_NOMBRES ASC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (error) {
    console.error('Error obteniendo estado de agentes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Corre cada minuto (ver cron.schedule al final del archivo). Pone
// automáticamente disponible=1 a los agentes en modo automático cuando entra
// el horario de atención, y disponible=0 cuando sale — así nadie tiene que
// darle clic al botón. Un agente que togglea el botón a mano queda en modo
// manual (LAE_MODO_AUTOMATICO=0) y no se toca aquí hasta que vuelva a activarse
// el modo automático (única forma hoy: reinsertar la fila, o vía soporte).
// Recorre todos los tenants registrados — igual que el resto de crons de
// AGYDA — para que el ajuste de horario aplique en cada empresa, no solo en
// el tenant por defecto.
// Corre cada minuto (ver cron.schedule al final del archivo). Los chats de la
// campaña "Soporte TI" ya crean su ticket vinculado desde el momento en que
// se inician (ver livechatInternoController.js), tengan o no agente disponible
// de inmediato — así que no hace falta "crear el ticket por timeout". Lo que sí
// falta es reforzar ese ticket si el chat sigue sin agente después de
// LCF_TIMEOUT_COLA_MINUTOS: se sube su prioridad a P1 y se notifica al técnico
// asignado (si ya lo hay) o, si no hay técnico, queda con prioridad máxima
// visible para cualquiera que revise la bandeja de Tickets. Se marca
// LCO_ESPERA_ESCALADA=1 para no repetir el aviso cada minuto.
//
// NOTA sobre el diagrama de flujo de Soporte TI: el diagrama describe "si supera
// tiempo máximo de espera → crear ticket automáticamente". Este cron cubre ese
// mismo resultado de forma más fuerte: el ticket ya existe desde el segundo 0
// del chat (nunca hay una ventana sin ticket mientras se espera agente), así
// que al vencer el timeout no hay nada que crear — solo escalar lo que ya
// existe. Decisión tomada explícitamente: no se agrega una creación de ticket
// aquí porque duplicaría el ticket ya vinculado en LC_TICKET_ID.
async function escalarChatsSoporteTiEnEsperaCron() {
  const { listTenants } = require('../config/tenants');
  const notificationService = require('../services/notificationService');
  for (const { key } of listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      const config = await getConfig(pool);
      const timeoutMin = config?.LCF_TIMEOUT_COLA_MINUTOS || 15;

      const rs = await pool.request().input('timeoutMin', sql.Int, timeoutMin).query(`
        SELECT lco.LCO_ID as colaId, lco.LCO_CONVERSACION_ID as conversacionId,
               c.LC_TICKET_ID as ticketId, c.LC_SOLICITANTE_ID as solicitanteId,
               t.ASIGNADO_A as asignadoA
        FROM dbo.LIVECHAT_COLA lco
        JOIN dbo.LIVECHAT_CONVERSACIONES c ON c.LC_ID = lco.LCO_CONVERSACION_ID
        LEFT JOIN dbo.TICKETS t ON t.TICKET_ID = c.LC_TICKET_ID
        WHERE c.LC_ORIGEN = 'empleado_interno'
          AND c.LC_ESTADO = 'esperando'
          AND lco.LCO_ESPERA_ESCALADA = 0
          AND DATEDIFF(MINUTE, lco.LCO_FECHA_ENTRADA, GETDATE()) >= @timeoutMin
      `);

      for (const row of rs.recordset) {
        if (row.ticketId) {
          await pool.request().input('tid', sql.Int, row.ticketId).query(`
            UPDATE dbo.TICKETS SET PRIORIDAD = 'P1' WHERE TICKET_ID = @tid AND PRIORIDAD <> 'P1'
          `);
          await pool.request().input('tid', sql.Int, row.ticketId).input('det', sql.NVarChar,
            `Chat de Soporte TI sin atender tras ${timeoutMin} minutos en espera — prioridad escalada automáticamente a P1`)
            .query(`INSERT INTO dbo.TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE) VALUES (@tid, 'escalado_espera_chat', @det)`);
        }

        const destinatarioId = row.asignadoA || null;
        if (destinatarioId) {
          try {
            await notificationService.createNotification({
              usuarioId: destinatarioId,
              mensaje: row.ticketId
                ? `Chat de Soporte TI sin atender hace ${timeoutMin}+ min — ticket #${row.ticketId} escalado a P1`
                : `Chat de Soporte TI sin atender hace ${timeoutMin}+ min`,
              tipo: 'livechat_espera_escalada',
              dataExtra: { conversacionId: row.conversacionId, ticketId: row.ticketId || null },
              tenantKey: key,
            });
          } catch (e) {
            console.warn('⚠️ No se pudo notificar escalamiento de espera de chat Soporte TI:', e?.message || e);
          }
        }

        await pool.request().input('id', sql.Int, row.colaId)
          .query(`UPDATE dbo.LIVECHAT_COLA SET LCO_ESPERA_ESCALADA = 1 WHERE LCO_ID = @id`);
      }
    } catch (error) {
      console.error(`Error en escalarChatsSoporteTiEnEsperaCron (tenant=${key}):`, error);
    }
  }
}

async function ajustarDisponibilidadPorHorarioCron() {
  const { listTenants } = require('../config/tenants');
  for (const { key } of listTenants()) {
    try {
      const pool = await databaseService.getPool(key);
      const config = await getConfig(pool);
      if (!config) continue;

      const dentroDeHorario = !isFueraDeHorario(config);

      await pool.request()
        .input('disponible', sql.Bit, dentroDeHorario)
        .query(`
          UPDATE dbo.LIVECHAT_AGENTE_ESTADO
          SET LAE_DISPONIBLE = @disponible
          WHERE LAE_MODO_AUTOMATICO = 1 AND LAE_DISPONIBLE <> @disponible
        `);

      if (dentroDeHorario) {
        await intentarAsignarSiguienteEnCola(pool, key);
      }
    } catch (error) {
      console.error(`Error en ajustarDisponibilidadPorHorarioCron (tenant=${key}):`, error);
    }
  }
}

// Autenticado (agente/admin) — configuración de horario y mensajes automáticos.
exports.getConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await getConfig(pool);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Configuración no inicializada' });
    }
    res.json({
      success: true,
      data: {
        id: config.LCF_ID,
        horarioInicio: config.LCF_HORARIO_INICIO,
        horarioFin: config.LCF_HORARIO_FIN,
        sabadoHorarioInicio: config.LCF_SABADO_HORARIO_INICIO,
        sabadoHorarioFin: config.LCF_SABADO_HORARIO_FIN,
        diasSemana: config.LCF_DIAS_SEMANA,
        mensajeBienvenida: config.LCF_MSG_BIENVENIDA,
        mensajeFueraHorario: config.LCF_MSG_FUERA_HORARIO,
        mensajeSinAgentes: config.LCF_MSG_SIN_AGENTES,
        mensajeEnCola: config.LCF_MSG_EN_COLA,
        maxChatsPorAgente: config.LCF_MAX_CHATS_POR_AGENTE,
        timeoutColaMinutos: config.LCF_TIMEOUT_COLA_MINUTOS,
      },
    });
  } catch (error) {
    console.error('Error obteniendo configuración de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const {
      horarioInicio, horarioFin, sabadoHorarioInicio, sabadoHorarioFin, diasSemana,
      mensajeBienvenida, mensajeFueraHorario, mensajeSinAgentes, mensajeEnCola,
      maxChatsPorAgente, timeoutColaMinutos,
    } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await getConfig(pool);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Configuración no inicializada' });
    }

    await pool.request()
      .input('id', sql.Int, config.LCF_ID)
      .input('horarioInicio', sql.NVarChar, horarioInicio || null)
      .input('horarioFin', sql.NVarChar, horarioFin || null)
      .input('sabadoHorarioInicio', sql.NVarChar, sabadoHorarioInicio || null)
      .input('sabadoHorarioFin', sql.NVarChar, sabadoHorarioFin || null)
      .input('diasSemana', sql.NVarChar, diasSemana || null)
      .input('mensajeBienvenida', sql.NVarChar, mensajeBienvenida || null)
      .input('mensajeFueraHorario', sql.NVarChar, mensajeFueraHorario || null)
      .input('mensajeSinAgentes', sql.NVarChar, mensajeSinAgentes || null)
      .input('mensajeEnCola', sql.NVarChar, mensajeEnCola || null)
      .input('maxChatsPorAgente', sql.Int, Number.isFinite(maxChatsPorAgente) ? maxChatsPorAgente : 5)
      .input('timeoutColaMinutos', sql.Int, Number.isFinite(timeoutColaMinutos) ? timeoutColaMinutos : 15)
      .query(`
        UPDATE dbo.LIVECHAT_CONFIG
        SET LCF_HORARIO_INICIO = @horarioInicio,
            LCF_HORARIO_FIN = @horarioFin,
            LCF_SABADO_HORARIO_INICIO = @sabadoHorarioInicio,
            LCF_SABADO_HORARIO_FIN = @sabadoHorarioFin,
            LCF_DIAS_SEMANA = @diasSemana,
            LCF_MSG_BIENVENIDA = @mensajeBienvenida,
            LCF_MSG_FUERA_HORARIO = @mensajeFueraHorario,
            LCF_MSG_SIN_AGENTES = @mensajeSinAgentes,
            LCF_MSG_EN_COLA = @mensajeEnCola,
            LCF_MAX_CHATS_POR_AGENTE = @maxChatsPorAgente,
            LCF_TIMEOUT_COLA_MINUTOS = @timeoutColaMinutos
        WHERE LCF_ID = @id
      `);

    res.json({ success: true, message: 'Configuración actualizada' });
  } catch (error) {
    console.error('Error actualizando configuración de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado (agente) — otros agentes online a los que se puede transferir una conversación.
exports.getAgentesTransferibles = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }

    const config = await getConfig(pool);
    const maxChats = config?.LCF_MAX_CHATS_POR_AGENTE || 5;

    // Candidatos a recibir una transferencia, aunque nunca hayan usado el módulo Chat en Vivo
    // antes (LEFT JOIN: si no tienen fila en LIVECHAT_AGENTE_ESTADO, se asumen offline con
    // 0 conversaciones — el agente que transfiere ve su estado real de todas formas). El filtro
    // por tipo de usuario se quitó a propósito: EQUIPO_TRANSFERENCIA ya es la whitelist real.
    const r = await pool.request()
      .input('agenteActualId', sql.Int, req.user.id)
      .query(`
        SELECT u.NEUS_ID as usuarioId, u.NEUS_NOMBRES as nombre,
               ISNULL(lae.LAE_ONLINE, 0) as online,
               ISNULL(lae.LAE_CONVERSACIONES_ACTIVAS, 0) as conversacionesActivas
        FROM dbo.NEUS_USUARIOS u
        LEFT JOIN dbo.LIVECHAT_AGENTE_ESTADO lae ON lae.LAE_USUARIO_ID = u.NEUS_ID
        WHERE u.NEUS_ACTIVO = 1 AND u.NEUS_ID <> @agenteActualId
          AND u.NEUS_ID IN (${EQUIPO_TRANSFERENCIA.join(',')})
        ORDER BY ISNULL(lae.LAE_ONLINE, 0) DESC, ISNULL(lae.LAE_CONVERSACIONES_ACTIVAS, 0) ASC, u.NEUS_NOMBRES ASC
      `);

    const agentes = r.recordset.map(a => ({ ...a, disponible: a.conversacionesActivas < maxChats }));
    res.json({ success: true, data: agentes });
  } catch (error) {
    console.error('Error obteniendo agentes transferibles:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado (agente) — transfiere la conversación a otro agente online.
exports.transferirConversacion = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const { nuevoAgenteId } = req.body;
    if (!nuevoAgenteId) {
      return res.status(400).json({ success: false, message: 'Falta el id del agente destino' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const conv = await pool.request()
      .input('convId', sql.Int, conversacionId)
      .query(`${SELECT_CONVERSACION} WHERE LC_ID = @convId`);
    if (conv.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }
    const conversacion = conv.recordset[0];
    if (conversacion.estado !== 'activa') {
      return res.status(409).json({ success: false, message: 'Solo se pueden transferir conversaciones activas' });
    }
    if (conversacion.agenteId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Solo el agente asignado puede transferir esta conversación' });
    }
    if (Number(nuevoAgenteId) === req.user.id) {
      return res.status(400).json({ success: false, message: 'No puedes transferirte la conversación a ti mismo' });
    }

    if (!EQUIPO_TRANSFERENCIA.includes(Number(nuevoAgenteId))) {
      return res.status(403).json({ success: false, message: 'Ese usuario no está autorizado a recibir transferencias de Chat en Vivo' });
    }

    const destino = await pool.request()
      .input('usuarioId', sql.Int, nuevoAgenteId)
      .query(`
        SELECT u.NEUS_ID as usuarioId, u.NEUS_NOMBRES as nombre, ISNULL(lae.LAE_ONLINE, 0) as online
        FROM dbo.NEUS_USUARIOS u
        LEFT JOIN dbo.LIVECHAT_AGENTE_ESTADO lae ON lae.LAE_USUARIO_ID = u.NEUS_ID
        WHERE u.NEUS_ID = @usuarioId AND u.NEUS_ACTIVO = 1
      `);
    if (destino.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'El agente destino no existe o no es válido' });
    }
    if (!destino.recordset[0].online) {
      return res.status(409).json({ success: false, message: 'El agente destino no está conectado al Chat en Vivo en este momento' });
    }
    const agenteDestino = destino.recordset[0];

    await pool.request()
      .input('convId', sql.Int, conversacionId)
      .input('agenteId', sql.Int, agenteDestino.usuarioId)
      .input('agenteNombre', sql.NVarChar, agenteDestino.nombre)
      .query(`
        UPDATE dbo.LIVECHAT_CONVERSACIONES
        SET LC_AGENTE_ID = @agenteId, LC_AGENTE_NOMBRE = @agenteNombre
        WHERE LC_ID = @convId
      `);

    // El agente que transfiere libera un cupo; el agente destino ocupa uno.
    await pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        UPDATE dbo.LIVECHAT_AGENTE_ESTADO
        SET LAE_CONVERSACIONES_ACTIVAS = CASE WHEN LAE_CONVERSACIONES_ACTIVAS > 0 THEN LAE_CONVERSACIONES_ACTIVAS - 1 ELSE 0 END
        WHERE LAE_USUARIO_ID = @usuarioId
      `);
    await pool.request()
      .input('usuarioId', sql.Int, agenteDestino.usuarioId)
      .query(`
        MERGE dbo.LIVECHAT_AGENTE_ESTADO AS target
        USING (SELECT @usuarioId AS usuarioId) AS src
        ON target.LAE_USUARIO_ID = src.usuarioId
        WHEN MATCHED THEN UPDATE SET LAE_CONVERSACIONES_ACTIVAS = LAE_CONVERSACIONES_ACTIVAS + 1
        WHEN NOT MATCHED THEN INSERT (LAE_USUARIO_ID, LAE_ONLINE, LAE_DISPONIBLE, LAE_CONVERSACIONES_ACTIVAS)
          VALUES (@usuarioId, 1, 1, 1);
      `);

    await insertarMensajeSistema(pool, conversacionId, `La conversación fue transferida a ${agenteDestino.nombre}`);

    try {
      socketService.getIO().to(`livechat:${conversacionId}`).emit('livechat:conversacion_transferida', {
        conversacionId: Number(conversacionId),
        agenteNombre: agenteDestino.nombre,
      });
      socketService.getIO(tenantKeyDe(req)).to(`user:${agenteDestino.usuarioId}`).emit('livechat:nueva_conversacion', { conversacionId: Number(conversacionId) });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir evento de transferencia:', e?.message || e);
    }

    // El agente origen deja de recibir mensajes de esta conversación al perder la sesión de sala;
    // intentamos también asignar a alguien de la cola por si el agente origen quedó libre.
    await intentarAsignarSiguienteEnCola(pool, tenantKeyDe(req));

    res.json({ success: true, message: 'Conversación transferida' });
  } catch (error) {
    console.error('Error transfiriendo conversación de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado — historial de conversaciones cerradas, con filtros opcionales.
async function buildHistorialQuery(req) {
  const { agenteId, fechaDesde, fechaHasta, texto } = req.query;
  const condiciones = [`LC_ESTADO = 'cerrada'`];
  const inputs = [];

  if (agenteId) {
    condiciones.push('LC_AGENTE_ID = @agenteId');
    inputs.push(['agenteId', sql.Int, Number(agenteId)]);
  }
  if (fechaDesde) {
    condiciones.push('LC_FECHA_INICIO >= @fechaDesde');
    inputs.push(['fechaDesde', sql.DateTime, new Date(fechaDesde)]);
  }
  if (fechaHasta) {
    condiciones.push('LC_FECHA_INICIO <= @fechaHasta');
    inputs.push(['fechaHasta', sql.DateTime, new Date(`${fechaHasta}T23:59:59`)]);
  }
  if (texto) {
    condiciones.push(`(LC_VISITANTE_NOMBRE LIKE @texto OR LC_VISITANTE_EMAIL LIKE @texto OR LC_MOTIVO LIKE @texto)`);
    inputs.push(['texto', sql.NVarChar, `%${texto}%`]);
  }

  return { where: condiciones.join(' AND '), inputs };
}

exports.getHistorial = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const { where, inputs } = await buildHistorialQuery(req);

    const request = pool.request();
    inputs.forEach(([name, type, value]) => request.input(name, type, value));

    const result = await request.query(`
      ${SELECT_CONVERSACION}
      WHERE ${where}
      ORDER BY LC_FECHA_INICIO DESC
      OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo historial de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportHistorialCsv = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const { where, inputs } = await buildHistorialQuery(req);

    const request = pool.request();
    inputs.forEach(([name, type, value]) => request.input(name, type, value));

    const result = await request.query(`
      ${SELECT_CONVERSACION}
      WHERE ${where}
      ORDER BY LC_FECHA_INICIO DESC
    `);

    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const formatFecha = (v) => {
      if (!v) return '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const headers = ['ID', 'Visitante', 'Email', 'Telefono', 'Motivo', 'Agente', 'Estado', 'Origen', 'FechaInicio', 'FechaCierre', 'Rating', 'MotivoCierre', 'ComentarioCierre'];
    const filas = result.recordset.map(c => [
      c.id, c.visitanteNombre, c.visitanteEmail, c.visitanteTelefono, c.motivo, c.agenteNombre,
      c.estado, c.origen, formatFecha(c.fechaInicio), formatFecha(c.fechaCierre), c.rating, c.motivoCierre, c.comentarioCierre,
    ].map(escape).join(','));

    const csv = '﻿' + [headers.join(','), ...filas].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="livechat-historial-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exportando historial de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Cron: cada minuto, activa/desactiva automáticamente a los agentes de Chat en
// Vivo según el horario configurado (Lun-Vie y, si aplica, horario propio de
// Sábado) — así ya no hace falta darle clic al botón de disponible.
cron.schedule('* * * * *', () => {
  ajustarDisponibilidadPorHorarioCron();
}, { timezone: 'America/Mexico_City' });

cron.schedule('* * * * *', () => {
  escalarChatsSoporteTiEnEsperaCron();
}, { timezone: 'America/Mexico_City' });

// Reutilizadas por livechatInternoController.js (chat interno de empleados
// autenticados hacia la campaña "Soporte TI") para no duplicar la lógica de
// horario/ruteo/mensajes de sistema del flujo público.
exports.buscarAgenteDisponible = buscarAgenteDisponible;
exports.getConfig = getConfig;
exports.isFueraDeHorario = isFueraDeHorario;
exports.insertarMensajeSistema = insertarMensajeSistema;
exports.calcularTiempoEsperaEstimado = calcularTiempoEsperaEstimado;
exports.formatMensajeCola = formatMensajeCola;
exports.tenantKeyDe = tenantKeyDe;
