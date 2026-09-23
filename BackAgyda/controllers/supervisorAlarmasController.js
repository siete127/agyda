// Alarmas del módulo Supervisor (/operaciones/supervisores) — Fase 1 del plan
// de evolución basado en PSUP de Mitrol. Dos tipos por ahora:
//   'agente_pausa': un agente lleva más de N minutos en una pausa abierta
//     (USUARIO_TIEMPOS, mismo criterio que operacionesController.getMiPanel).
//   'skill_cola': un skill/grupo tiene interacciones en_cola esperando más
//     de N minutos sin agente (CCO_INTERACCIONES.CI_GRUPO_ID).
// Ciclo de vida de una instancia: en_alarma -> atendida (con comentario, no
// se cierra sola) -> fin_alarma (la condición dejó de cumplirse, se cierra
// sola aunque nadie la haya atendido) — mismo patrón que describe el manual
// de Mitrol (eaAlarma -> eaAtendida -> eaFinAlarma).
const cron = require('node-cron');
const sql = require('mssql');
const { listTenants } = require('../config/tenants');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { DEFAULT_TENANT } = require('../config/tenants');

function emitir(tenantKey, room, evento, payload) {
  try { socketService.getIO(tenantKey || DEFAULT_TENANT).to(room).emit(evento, payload); }
  catch (e) { console.warn('[supervisorAlarmas] emit falló:', e?.message || e); }
}

// Evalúa una alarma tipo 'agente_pausa': agentes con pausa abierta (status_id
// en 2,3,5,6 — comida/baño/capacitación/permiso, mismo set que PAUSA_LABELS
// de operacionesController) hace más de CSA_UMBRAL_MINUTOS.
async function evaluarAgentePausa(pool, alarma) {
  const r = await pool.request().input('min', sql.Int, alarma.CSA_UMBRAL_MINUTOS).query(`
    SELECT ut.neus_id agenteId, u.NEUS_NOMBRES nombre
    FROM dbo.USUARIO_TIEMPOS ut
    JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
    WHERE ut.fecha_fin IS NULL AND ut.status_id IN (2,3,5,6)
      AND DATEDIFF(MINUTE, ut.fecha_inicio, GETDATE()) > @min
  `);
  return r.recordset.map((row) => ({ objetoId: row.agenteId, objetoNombre: row.nombre }));
}

// Evalúa una alarma tipo 'skill_cola': skills con al menos 1 interacción
// en_cola cuya más antigua lleva más de CSA_UMBRAL_MINUTOS esperando.
async function evaluarSkillCola(pool, alarma) {
  const r = await pool.request().input('min', sql.Int, alarma.CSA_UMBRAL_MINUTOS).query(`
    SELECT g.CG_ID skillId, g.CG_NOMBRE nombre
    FROM dbo.CCO_INTERACCIONES i
    JOIN dbo.CCO_GRUPOS g ON g.CG_ID = i.CI_GRUPO_ID
    WHERE i.CI_ESTADO = 'en_cola'
    GROUP BY g.CG_ID, g.CG_NOMBRE
    HAVING MIN(i.CI_FECHA_INICIO) <= DATEADD(MINUTE, -@min, GETDATE())
  `);
  return r.recordset.map((row) => ({ objetoId: row.skillId, objetoNombre: row.nombre }));
}

const EVALUADORES = { agente_pausa: evaluarAgentePausa, skill_cola: evaluarSkillCola };
const OBJETO_TIPO = { agente_pausa: 'agente', skill_cola: 'skill' };

async function evaluarAlarma(pool, tenantKey, alarma) {
  const evaluador = EVALUADORES[alarma.CSA_TIPO];
  if (!evaluador) return;
  const objetoTipo = OBJETO_TIPO[alarma.CSA_TIPO];

  const enCondicion = await evaluador(pool, alarma);
  const idsEnCondicion = new Set(enCondicion.map((o) => o.objetoId));

  // Instancias abiertas hoy para esta alarma (en_alarma o atendida — ambas
  // siguen "vivas" hasta que la condición deje de cumplirse).
  const abiertasRs = await pool.request().input('alarma', sql.Int, alarma.CSA_ID).query(`
    SELECT CSI_ID id, CSI_OBJETO_ID objetoId, CSI_ESTADO estado
    FROM dbo.CSA_ALARMA_INSTANCIAS
    WHERE CSI_ALARMA_ID = @alarma AND CSI_ESTADO IN ('en_alarma','atendida')
  `);
  const abiertaPorObjeto = new Map(abiertasRs.recordset.map((r) => [r.objetoId, r]));

  // Nuevas instancias: en condición pero sin fila abierta todavía.
  for (const obj of enCondicion) {
    if (abiertaPorObjeto.has(obj.objetoId)) continue;
    await pool.request()
      .input('alarma', sql.Int, alarma.CSA_ID).input('tipo', sql.NVarChar(20), objetoTipo)
      .input('objId', sql.Int, obj.objetoId).input('nombre', sql.NVarChar(160), obj.objetoNombre)
      .query(`INSERT INTO dbo.CSA_ALARMA_INSTANCIAS (CSI_ALARMA_ID, CSI_OBJETO_TIPO, CSI_OBJETO_ID, CSI_OBJETO_NOMBRE)
              VALUES (@alarma, @tipo, @objId, @nombre)`);
    emitir(tenantKey, 'supervisores', 'cs:alarma_nueva', { alarmaId: alarma.CSA_ID, tipo: alarma.CSA_TIPO });
  }

  // Instancias que ya no aplican: estaban abiertas pero el objeto salió de
  // la condición (el agente volvió, la cola se vació) -> fin_alarma, aunque
  // nadie la haya atendido — igual que el manual (eaFinAlarma).
  for (const [objetoId, fila] of abiertaPorObjeto.entries()) {
    if (idsEnCondicion.has(objetoId)) continue;
    await pool.request().input('id', sql.Int, fila.id)
      .query(`UPDATE dbo.CSA_ALARMA_INSTANCIAS SET CSI_ESTADO = 'fin_alarma', CSI_FECHA_FIN = GETDATE() WHERE CSI_ID = @id`);
    emitir(tenantKey, 'supervisores', 'cs:alarma_fin', { alarmaId: alarma.CSA_ID });
  }
}

async function runTenant(tenantKey) {
  let pool;
  try { pool = await databaseService.getPool(tenantKey); }
  catch (e) { console.error(`[supervisorAlarmas][${tenantKey}] sin pool:`, e.message); return; }

  try {
    const alarmasRs = await pool.request().query(`SELECT * FROM dbo.CSA_ALARMAS WHERE CSA_ACTIVA = 1`);
    for (const alarma of alarmasRs.recordset) {
      await evaluarAlarma(pool, tenantKey, alarma).catch((e) =>
        console.error(`[supervisorAlarmas][${tenantKey}] alarma ${alarma.CSA_ID}:`, e.message));
    }
  } catch (e) {
    console.error(`[supervisorAlarmas][${tenantKey}]`, e.message);
  }
}

async function runAll() {
  for (const { key } of listTenants()) await runTenant(key);
}

cron.schedule('* * * * *', () => { runAll(); }, { timezone: 'America/Mexico_City' });

// GET /api/operaciones/supervisores/alarmas — instancias activas (en_alarma
// o atendida) visibles para el supervisor autenticado. AD/TI ven todas; un
// supervisor específico solo ve agentes/skills de sus campañas asignadas
// (mismo filtro que operacionesController.getMiPanel).
exports.listInstancias = async (req, res) => {
  try {
    const uid = req.user?.id;
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const pool = await databaseService.getPool(req.user?.empresa);

    let filtroObjetos = '';
    const rq = pool.request();
    if (!esAdmin) {
      // Agentes y skills visibles: los de las campañas asignadas a este supervisor.
      rq.input('uid', sql.Int, uid);
      filtroObjetos = `AND (
        (i.CSI_OBJETO_TIPO = 'skill' AND i.CSI_OBJETO_ID IN (
          SELECT CG_ID FROM dbo.CCO_GRUPOS WHERE CG_CAMPANIA_ID IN (SELECT CS_CAMPANIA_ID FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)
        ))
        OR
        (i.CSI_OBJETO_TIPO = 'agente' AND i.CSI_OBJETO_ID IN (
          SELECT ga.CGA_USUARIO_ID FROM dbo.CCO_GRUPO_AGENTES ga
          JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
          WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (SELECT CS_CAMPANIA_ID FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid)
        ))
      )`;
    }

    const r = await rq.query(`
      SELECT i.CSI_ID id, i.CSI_ALARMA_ID alarmaId, a.CSA_NOMBRE alarmaNombre, a.CSA_TIPO tipo,
             i.CSI_OBJETO_TIPO objetoTipo, i.CSI_OBJETO_ID objetoId, i.CSI_OBJETO_NOMBRE objetoNombre,
             i.CSI_ESTADO estado, i.CSI_FECHA_INICIO fechaInicio, i.CSI_FECHA_ATENDIDA fechaAtendida,
             i.CSI_ATENDIDA_POR atendidaPor, i.CSI_COMENTARIO comentario
      FROM dbo.CSA_ALARMA_INSTANCIAS i
      JOIN dbo.CSA_ALARMAS a ON a.CSA_ID = i.CSI_ALARMA_ID
      WHERE i.CSI_ESTADO IN ('en_alarma','atendida') ${filtroObjetos}
      ORDER BY i.CSI_ESTADO ASC, i.CSI_FECHA_INICIO ASC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (err) {
    console.error('supervisorAlarmasController.listInstancias', err.message);
    res.status(500).json({ success: false, message: 'Error al listar alarmas' });
  }
};

// POST /api/operaciones/supervisores/alarmas/:id/atender — marca la instancia
// como atendida con un comentario opcional. No la cierra (eso lo hace el
// cron solo cuando la condición ya no se cumple, ver evaluarAlarma).
exports.atenderInstancia = async (req, res) => {
  try {
    const uid = req.user?.id;
    const { comentario } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().input('id', sql.Int, req.params.id).query(
      `SELECT CSI_ID id, CSI_ESTADO estado FROM dbo.CSA_ALARMA_INSTANCIAS WHERE CSI_ID = @id`);
    const inst = r.recordset[0];
    if (!inst) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (inst.estado !== 'en_alarma') {
      return res.status(400).json({ success: false, message: 'Solo se pueden atender instancias en alarma' });
    }
    await pool.request()
      .input('id', sql.Int, req.params.id).input('uid', sql.Int, uid)
      .input('com', sql.NVarChar(500), comentario || null)
      .query(`UPDATE dbo.CSA_ALARMA_INSTANCIAS
              SET CSI_ESTADO = 'atendida', CSI_FECHA_ATENDIDA = GETDATE(), CSI_ATENDIDA_POR = @uid, CSI_COMENTARIO = @com
              WHERE CSI_ID = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error('supervisorAlarmasController.atenderInstancia', err.message);
    res.status(500).json({ success: false, message: 'Error al atender la alarma' });
  }
};

exports.runNow = async (_req, res) => {
  await runAll();
  res.json({ success: true, message: 'Evaluación de alarmas ejecutada' });
};
exports.init = runAll;
