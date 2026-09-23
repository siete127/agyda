const sql = require('mssql');
const socketService = require('./socketService');
const notificationService = require('./notificationService');
const { DEFAULT_TENANT } = require('../config/tenants');

// ACD del Contact Center omnicanal. Least-busy con capacidad, filtrado por
// skill (grupo) y bloqueando agentes en pausa (USUARIO_TIEMPOS) o en ACW.
// Adaptado de livechatController.buscarAgenteDisponible.

const STATUS_PAUSA = [2, 3, 5, 6]; // comida, sanitario, capacitacion, permiso — ver STATUS seed

async function getConfig(pool) {
  try {
    const r = await pool.request().query('SELECT TOP 1 * FROM dbo.CCO_CONFIG ORDER BY CF_ID');
    return r.recordset[0] || {};
  } catch (_) {
    return {};
  }
}

// Resuelve el modo de asignación efectivo de una interacción en cascada:
//   canal ('auto'|'manual' mandan; 'campania' delega)
//     -> campaña ('auto'|'manual' mandan; 'global' delega)
//       -> global CCO_CONFIG.CF_MODO_ASIGNACION (default 'auto')
// Devuelve 'auto' | 'manual'. Ante cualquier duda/error -> 'auto' (no rompe
// el flujo actual).
async function modoAsignacionEfectivo(pool, { canalId, campaniaId }) {
  try {
    if (canalId) {
      const c = await pool.request().input('id', sql.Int, canalId)
        .query('SELECT CN_MODO_ASIGNACION m FROM dbo.CCO_CANALES WHERE CN_ID = @id');
      const m = c.recordset[0] && c.recordset[0].m;
      if (m === 'auto' || m === 'manual') return m;
    }
    if (campaniaId) {
      const c = await pool.request().input('id', sql.Int, campaniaId)
        .query('SELECT CM2_MODO_ASIGNACION m FROM dbo.CCO_CAMPANIAS WHERE CM2_ID = @id');
      const m = c.recordset[0] && c.recordset[0].m;
      if (m === 'auto' || m === 'manual') return m;
    }
    const cfg = await getConfig(pool);
    return cfg.CF_MODO_ASIGNACION === 'manual' ? 'manual' : 'auto';
  } catch (_) {
    return 'auto';
  }
}

// Devuelve { usuarioId, nombre } del agente disponible con menos interacciones
// activas dentro del grupo/skill dado, o null.
async function buscarAgenteDisponible(pool, { grupoId, campaniaId, maxGlobal = 4 } = {}) {
  const rq = pool.request().input('max', sql.Int, maxGlobal);
  let joinGrupo = '';
  if (grupoId) {
    rq.input('grupoId', sql.Int, grupoId);
    joinGrupo = `INNER JOIN dbo.CCO_GRUPO_AGENTES ga
                   ON ga.CGA_USUARIO_ID = ae.CAE_USUARIO_ID
                  AND ga.CGA_GRUPO_ID = @grupoId AND ga.CGA_ACTIVO = 1`;
  }
  if (campaniaId) rq.input('campaniaId', sql.Int, campaniaId);

  const r = await rq.query(`
    SELECT TOP 1
      ae.CAE_USUARIO_ID as usuarioId,
      ISNULL(u.NEUS_NOMBRES, CONVERT(NVARCHAR(20), ae.CAE_USUARIO_ID)) as nombre,
      (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES i
        WHERE i.CI_AGENTE_ID = ae.CAE_USUARIO_ID AND i.CI_ESTADO = 'activa') as activas
    FROM dbo.CCO_AGENTE_ESTADO ae
    ${joinGrupo}
    LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ae.CAE_USUARIO_ID
    LEFT JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = ${campaniaId ? '@campaniaId' : 'NULL'}
    WHERE ae.CAE_ONLINE = 1 AND ae.CAE_DISPONIBLE = 1
      AND (ae.CAE_ACW_HASTA IS NULL OR ae.CAE_ACW_HASTA < GETDATE())
      AND NOT EXISTS (
        SELECT 1 FROM dbo.USUARIO_TIEMPOS ut
        WHERE ut.neus_id = ae.CAE_USUARIO_ID AND ut.fecha_fin IS NULL
          AND ut.status_id IN (${STATUS_PAUSA.join(',')})
      )
      AND (SELECT COUNT(*) FROM dbo.CCO_INTERACCIONES i
            WHERE i.CI_AGENTE_ID = ae.CAE_USUARIO_ID AND i.CI_ESTADO = 'activa')
          < COALESCE(c.CM2_MAX_CHATS_POR_AGENTE, @max)
    ORDER BY activas ASC, ae.CAE_ULTIMA_CONEXION ASC
  `);
  return r.recordset[0] || null;
}

async function insertarMensajeSistema(pool, interaccionId, contenido, tenantKey) {
  await pool.request()
    .input('int', sql.Int, interaccionId)
    .input('c', sql.NVarChar(sql.MAX), contenido)
    .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_CONTENIDO)
            VALUES (@int, 'sistema', @c)`);
  emitir(tenantKey, `cc:interaccion:${interaccionId}`, 'cc:mensaje', { interaccionId });
}

function emitir(tenantKey, room, evento, payload) {
  try {
    socketService.getIO(tenantKey || DEFAULT_TENANT).to(room).emit(evento, payload);
  } catch (e) {
    console.warn('[ccRouting] emit falló:', e?.message || e);
  }
}

// Asigna una interacción a un agente: pone activa, +1, notifica.
async function asignarInteraccion(pool, tenantKey, interaccion, agente) {
  await pool.request()
    .input('id', sql.Int, interaccion.id)
    .input('agenteId', sql.Int, agente.usuarioId)
    .input('agenteNombre', sql.NVarChar(160), agente.nombre)
    .query(`UPDATE dbo.CCO_INTERACCIONES
            SET CI_AGENTE_ID = @agenteId, CI_AGENTE_NOMBRE = @agenteNombre,
                CI_ESTADO = 'activa'
            WHERE CI_ID = @id`);
  await pool.request().input('u', sql.Int, agente.usuarioId)
    .query(`MERGE dbo.CCO_AGENTE_ESTADO AS t
            USING (SELECT @u AS u) s ON t.CAE_USUARIO_ID = s.u
            WHEN MATCHED THEN UPDATE SET CAE_INTERACCIONES_ACTIVAS = CAE_INTERACCIONES_ACTIVAS + 1
            WHEN NOT MATCHED THEN INSERT (CAE_USUARIO_ID, CAE_INTERACCIONES_ACTIVAS) VALUES (@u, 1);`);

  emitir(tenantKey, `user:${agente.usuarioId}`, 'cc:nueva_interaccion', { interaccionId: interaccion.id });
  emitir(tenantKey, `cc:interaccion:${interaccion.id}`, 'cc:interaccion_tomada', {
    interaccionId: interaccion.id, agenteNombre: agente.nombre,
  });
  notificationService.createNotification({
    usuarioId: agente.usuarioId,
    mensaje: `Nueva interacción de ${interaccion.tipo}: ${interaccion.clienteNombre || 'cliente'}`,
    tipo: 'cc_interaccion_asignada',
    dataExtra: { interaccionId: interaccion.id, canal: interaccion.tipo },
    dedupeKey: `cc-int-${interaccion.id}`,
    tenantKey,
  }).catch(() => {});
}

// Intenta asignar UNA interacción entrante (recién creada, aún en_cola).
async function rutearInteraccion(pool, tenantKey, interaccionId) {
  const r = await pool.request().input('id', sql.Int, interaccionId).query(`
    SELECT CI_ID as id, CI_TIPO as tipo, CI_CANAL_ID as canalId, CI_GRUPO_ID as grupoId, CI_CAMPANIA_ID as campaniaId,
           CI_CLIENTE_NOMBRE as clienteNombre, CI_ESTADO as estado
    FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
  const it = r.recordset[0];
  if (!it || it.estado !== 'en_cola') return null;

  // Modo manual: no se auto-asigna — queda en cola para que un agente la jale.
  const modo = await modoAsignacionEfectivo(pool, { canalId: it.canalId, campaniaId: it.campaniaId });
  if (modo === 'manual') {
    emitir(tenantKey, 'supervisores', 'cc:cola_cambio', {});
    try { socketService.getIO(tenantKey || DEFAULT_TENANT).emit('cc:nueva_en_cola', { interaccionId: it.id }); } catch (_) {}
    return null;
  }

  const cfg = await getConfig(pool);
  const agente = await buscarAgenteDisponible(pool, {
    grupoId: it.grupoId, campaniaId: it.campaniaId,
    maxGlobal: cfg.CF_MAX_INTERACCIONES_POR_AGENTE || 4,
  });
  if (!agente) return null;

  await asignarInteraccion(pool, tenantKey, it, agente);
  const bienvenida = cfg.CF_MSG_BIENVENIDA;
  if (bienvenida) await insertarMensajeSistema(pool, it.id, bienvenida, tenantKey).catch(() => {});
  return agente;
}

// Tras cerrar / ponerse disponible / cron: toma la cabeza FIFO de la cola y la asigna.
async function intentarAsignarSiguienteEnCola(pool, tenantKey = DEFAULT_TENANT) {
  const cfg = await getConfig(pool);
  // varias interacciones en cola pueden ir a distintos grupos: iterar la cola FIFO
  // y para cada una buscar agente de su grupo hasta que no haya más asignables.
  const cola = await pool.request().query(`
    SELECT CI_ID as id, CI_TIPO as tipo, CI_CANAL_ID as canalId, CI_GRUPO_ID as grupoId, CI_CAMPANIA_ID as campaniaId,
           CI_CLIENTE_NOMBRE as clienteNombre
    FROM dbo.CCO_INTERACCIONES
    WHERE CI_ESTADO = 'en_cola'
    ORDER BY CI_TICKET ASC, CI_ID ASC`);
  for (const it of cola.recordset) {
    // Las de modo manual las jala un agente a mano — no se auto-asignan aquí.
    const modo = await modoAsignacionEfectivo(pool, { canalId: it.canalId, campaniaId: it.campaniaId });
    if (modo === 'manual') continue;
    const agente = await buscarAgenteDisponible(pool, {
      grupoId: it.grupoId, campaniaId: it.campaniaId,
      maxGlobal: cfg.CF_MAX_INTERACCIONES_POR_AGENTE || 4,
    });
    if (!agente) continue;
    await asignarInteraccion(pool, tenantKey, it, agente);
    if (cfg.CF_MSG_BIENVENIDA) await insertarMensajeSistema(pool, it.id, cfg.CF_MSG_BIENVENIDA, tenantKey).catch(() => {});
  }
}

module.exports = {
  getConfig,
  modoAsignacionEfectivo,
  buscarAgenteDisponible,
  rutearInteraccion,
  intentarAsignarSiguienteEnCola,
  insertarMensajeSistema,
  emitir,
};
