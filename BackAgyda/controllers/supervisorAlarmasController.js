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
const { sqlPausas } = require('../services/pausaTiposService');
const { DEFAULT_TENANT } = require('../config/tenants');

function emitir(tenantKey, room, evento, payload) {
  try { socketService.getIO(tenantKey || DEFAULT_TENANT).to(room).emit(evento, payload); }
  catch (e) { console.warn('[supervisorAlarmas] emit falló:', e?.message || e); }
}

// Evalúa una alarma tipo 'agente_pausa': agentes con pausa abierta de un tipo
// que cuenta en Contact Center (configurable en Configuración → Tipos de pausa)
// hace más de CSA_UMBRAL_MINUTOS. Si la alarma es de una campaña específica
// (CSA_CAMPANIA_ID no nulo), solo evalúa agentes asignados a skills de esa campaña.
async function evaluarAgentePausa(pool, alarma) {
  const rq = pool.request().input('min', sql.Int, alarma.CSA_UMBRAL_MINUTOS);
  let filtroCampania = '';
  if (alarma.CSA_CAMPANIA_ID) {
    rq.input('camp', sql.Int, alarma.CSA_CAMPANIA_ID);
    filtroCampania = `AND ut.neus_id IN (
      SELECT ga.CGA_USUARIO_ID FROM dbo.CCO_GRUPO_AGENTES ga
      JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
      WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID = @camp
    )`;
  }
  const r = await rq.query(`
    SELECT ut.neus_id agenteId, u.NEUS_NOMBRES nombre
    FROM dbo.USUARIO_TIEMPOS ut
    JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
    WHERE ut.fecha_fin IS NULL AND ut.status_id IN ${sqlPausas('contact_center')}
      AND DATEDIFF(MINUTE, ut.fecha_inicio, GETDATE()) > @min
      ${filtroCampania}
  `);
  return r.recordset.map((row) => ({ objetoId: row.agenteId, objetoNombre: row.nombre }));
}

// Evalúa una alarma tipo 'skill_cola': skills con al menos 1 interacción
// en_cola cuya más antigua lleva más de CSA_UMBRAL_MINUTOS esperando. Si la
// alarma es de una campaña específica, solo evalúa skills de esa campaña.
async function evaluarSkillCola(pool, alarma) {
  const rq = pool.request().input('min', sql.Int, alarma.CSA_UMBRAL_MINUTOS);
  let filtroCampania = '';
  if (alarma.CSA_CAMPANIA_ID) {
    rq.input('camp', sql.Int, alarma.CSA_CAMPANIA_ID);
    filtroCampania = 'AND g.CG_CAMPANIA_ID = @camp';
  }
  const r = await rq.query(`
    SELECT g.CG_ID skillId, g.CG_NOMBRE nombre
    FROM dbo.CCO_INTERACCIONES i
    JOIN dbo.CCO_GRUPOS g ON g.CG_ID = i.CI_GRUPO_ID
    WHERE i.CI_ESTADO = 'en_cola' ${filtroCampania}
    GROUP BY g.CG_ID, g.CG_NOMBRE
    HAVING MIN(i.CI_FECHA_INICIO) <= DATEADD(MINUTE, -@min, GETDATE())
  `);
  return r.recordset.map((row) => ({ objetoId: row.skillId, objetoNombre: row.nombre }));
}

const EVALUADORES = { agente_pausa: evaluarAgentePausa, skill_cola: evaluarSkillCola };
const OBJETO_TIPO = { agente_pausa: 'agente', skill_cola: 'skill' };

// Mapa objetoId -> [campaniaId, ...] — un agente puede estar en skills de
// varias campañas a la vez, por eso el valor es un arreglo.
async function campaniasDeAgentes(pool, agenteIds) {
  const r = await pool.request().query(`
    SELECT ga.CGA_USUARIO_ID agenteId, g.CG_CAMPANIA_ID campaniaId
    FROM dbo.CCO_GRUPO_AGENTES ga JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
    WHERE ga.CGA_ACTIVO = 1 AND ga.CGA_USUARIO_ID IN (${agenteIds.join(',')})`);
  const mapa = new Map();
  for (const row of r.recordset) {
    if (!mapa.has(row.agenteId)) mapa.set(row.agenteId, []);
    mapa.get(row.agenteId).push(row.campaniaId);
  }
  return mapa;
}

async function campaniasDeSkills(pool, skillIds) {
  const r = await pool.request().query(`
    SELECT CG_ID skillId, CG_CAMPANIA_ID campaniaId FROM dbo.CCO_GRUPOS WHERE CG_ID IN (${skillIds.join(',')})`);
  const mapa = new Map();
  for (const row of r.recordset) mapa.set(row.skillId, [row.campaniaId]);
  return mapa;
}

async function evaluarAlarma(pool, tenantKey, alarma) {
  const evaluador = EVALUADORES[alarma.CSA_TIPO];
  if (!evaluador) return;
  const objetoTipo = OBJETO_TIPO[alarma.CSA_TIPO];

  let enCondicion = await evaluador(pool, alarma);
  // Una alarma global (CSA_CAMPANIA_ID NULL) no debe disparar para objetos ya
  // cubiertos por una alarma específica de campaña del mismo tipo — esa
  // tiene prioridad (su propio umbral la reemplaza, no se suman ambas).
  if (!alarma.CSA_CAMPANIA_ID) {
    const cubiertosRs = await pool.request().input('tipo', sql.NVarChar(20), alarma.CSA_TIPO).query(`
      SELECT CSA_CAMPANIA_ID campaniaId FROM dbo.CSA_ALARMAS
      WHERE CSA_TIPO = @tipo AND CSA_ACTIVA = 1 AND CSA_CAMPANIA_ID IS NOT NULL`);
    const campaniasConAlarmaPropia = new Set(cubiertosRs.recordset.map((r) => r.campaniaId));
    if (campaniasConAlarmaPropia.size) {
      const objetoIds = enCondicion.map((o) => o.objetoId);
      if (objetoIds.length) {
        const campaniaPorObjeto = objetoTipo === 'agente'
          ? await campaniasDeAgentes(pool, objetoIds)
          : await campaniasDeSkills(pool, objetoIds);
        enCondicion = enCondicion.filter((o) => {
          const camps = campaniaPorObjeto.get(o.objetoId) ?? [];
          return !camps.some((c) => campaniasConAlarmaPropia.has(c));
        });
      }
    }
  }
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

// Verifica que el usuario pueda administrar alarmas de esa campaña (AD/TI
// sin restricción, incluida la alarma global CSA_CAMPANIA_ID=NULL; un
// supervisor normal solo sobre sus propias campañas asignadas, y nunca
// puede tocar una alarma global).
async function puedeAdministrarCampania(pool, req, campaniaId) {
  const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
  if (['AD', 'TI'].includes(tipoUsuario)) return true;
  if (!campaniaId) return false;
  const uid = req.user?.id;
  const r = await pool.request().input('c', sql.Int, campaniaId).input('uid', sql.Int, uid).query(
    `SELECT 1 FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c AND CS_SUPERVISOR_ID = @uid`);
  return !!r.recordset[0];
}

// GET /api/operaciones/supervisores/alarmas/config — catálogo de alarmas
// configuradas (no instancias). AD/TI ven todas; un supervisor solo las
// globales (de solo lectura para él) y las de sus campañas asignadas.
exports.listConfig = async (req, res) => {
  try {
    const tipoUsuario = (req.user?.tipoUsuario || '').toString().toUpperCase();
    const esAdmin = ['AD', 'TI'].includes(tipoUsuario);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rq = pool.request();
    let filtro = '';
    if (!esAdmin) {
      rq.input('uid', sql.Int, req.user?.id);
      filtro = `WHERE a.CSA_CAMPANIA_ID IS NULL OR a.CSA_CAMPANIA_ID IN (
        SELECT CS_CAMPANIA_ID FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_SUPERVISOR_ID = @uid
      )`;
    }
    const r = await rq.query(`
      SELECT a.CSA_ID id, a.CSA_NOMBRE nombre, a.CSA_TIPO tipo, a.CSA_UMBRAL_MINUTOS umbralMinutos,
             a.CSA_CAMPANIA_ID campaniaId, c.CM2_NOMBRE campaniaNombre, a.CSA_ACTIVA activa
      FROM dbo.CSA_ALARMAS a
      LEFT JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = a.CSA_CAMPANIA_ID
      ${filtro}
      ORDER BY a.CSA_CAMPANIA_ID IS NULL DESC, c.CM2_NOMBRE, a.CSA_TIPO
    `);
    res.json({ success: true, data: r.recordset });
  } catch (err) {
    console.error('supervisorAlarmasController.listConfig', err.message);
    res.status(500).json({ success: false, message: 'Error al listar la configuración de alarmas' });
  }
};

// POST /api/operaciones/supervisores/alarmas/config — crea una alarma nueva.
// Solo puede haber una alarma activa por (tipo, campaña) — si ya existe una
// para esa combinación, se rechaza (edítala en vez de duplicarla).
exports.crearConfig = async (req, res) => {
  try {
    const tipo = ['agente_pausa', 'skill_cola'].includes(req.body?.tipo) ? req.body.tipo : null;
    const umbralMinutos = Number(req.body?.umbralMinutos);
    const campaniaId = req.body?.campaniaId ? Number(req.body.campaniaId) : null;
    const nombre = (req.body?.nombre || '').toString().trim();
    if (!tipo) return res.status(400).json({ success: false, message: 'Tipo inválido' });
    if (!Number.isInteger(umbralMinutos) || umbralMinutos < 1) return res.status(400).json({ success: false, message: 'El umbral debe ser un número de minutos mayor a 0' });
    if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });

    const pool = await databaseService.getPool(req.user?.empresa);
    if (!(await puedeAdministrarCampania(pool, req, campaniaId))) {
      return res.status(403).json({ success: false, message: 'No tienes permiso sobre esa campaña' });
    }
    const dup = await pool.request().input('tipo', sql.NVarChar(20), tipo)
      .input('camp', sql.Int, campaniaId)
      .query(`SELECT 1 FROM dbo.CSA_ALARMAS WHERE CSA_TIPO = @tipo AND CSA_ACTIVA = 1
              AND ((CSA_CAMPANIA_ID IS NULL AND @camp IS NULL) OR CSA_CAMPANIA_ID = @camp)`);
    if (dup.recordset[0]) {
      return res.status(409).json({ success: false, message: 'Ya existe una alarma activa de este tipo para esa campaña' });
    }
    const ins = await pool.request()
      .input('nombre', sql.NVarChar(120), nombre).input('tipo', sql.NVarChar(20), tipo)
      .input('min', sql.Int, umbralMinutos).input('camp', sql.Int, campaniaId)
      .query(`INSERT INTO dbo.CSA_ALARMAS (CSA_NOMBRE, CSA_TIPO, CSA_UMBRAL_MINUTOS, CSA_CAMPANIA_ID)
              OUTPUT INSERTED.CSA_ID id VALUES (@nombre, @tipo, @min, @camp)`);
    res.json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (err) {
    console.error('supervisorAlarmasController.crearConfig', err.message);
    res.status(500).json({ success: false, message: 'Error al crear la alarma' });
  }
};

// PATCH /api/operaciones/supervisores/alarmas/config/:id — edita nombre,
// umbral y/o si está activa. No se permite cambiar tipo ni campaña (eso
// cambiaría qué evalúa la alarma; hay que borrarla y crear otra).
exports.actualizarConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const cur = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT CSA_CAMPANIA_ID campaniaId FROM dbo.CSA_ALARMAS WHERE CSA_ID = @id');
    if (!cur.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (!(await puedeAdministrarCampania(pool, req, cur.recordset[0].campaniaId))) {
      return res.status(403).json({ success: false, message: 'No tienes permiso sobre esa alarma' });
    }

    const sets = [];
    const rq = pool.request().input('id', sql.Int, req.params.id);
    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) return res.status(400).json({ success: false, message: 'El nombre no puede estar vacío' });
      rq.input('nombre', sql.NVarChar(120), nombre);
      sets.push('CSA_NOMBRE = @nombre');
    }
    if (req.body?.umbralMinutos !== undefined) {
      const min = Number(req.body.umbralMinutos);
      if (!Number.isInteger(min) || min < 1) return res.status(400).json({ success: false, message: 'El umbral debe ser un número de minutos mayor a 0' });
      rq.input('min', sql.Int, min);
      sets.push('CSA_UMBRAL_MINUTOS = @min');
    }
    if (req.body?.activa !== undefined) {
      rq.input('activa', sql.Bit, !!req.body.activa);
      sets.push('CSA_ACTIVA = @activa');
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nada que actualizar' });

    await rq.query(`UPDATE dbo.CSA_ALARMAS SET ${sets.join(', ')} WHERE CSA_ID = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error('supervisorAlarmasController.actualizarConfig', err.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la alarma' });
  }
};

// DELETE /api/operaciones/supervisores/alarmas/config/:id
exports.eliminarConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const cur = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT CSA_CAMPANIA_ID campaniaId FROM dbo.CSA_ALARMAS WHERE CSA_ID = @id');
    if (!cur.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (!(await puedeAdministrarCampania(pool, req, cur.recordset[0].campaniaId))) {
      return res.status(403).json({ success: false, message: 'No tienes permiso sobre esa alarma' });
    }
    // Las instancias históricas quedan (FK sin ON DELETE CASCADE a propósito
    // — es auditoría de alarmas pasadas); solo se borra la configuración.
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM dbo.CSA_ALARMAS WHERE CSA_ID = @id');
    res.json({ success: true });
  } catch (err) {
    if (err.number === 547) { // FK violation
      return res.status(409).json({ success: false, message: 'No se puede eliminar: tiene instancias de alarma registradas. Desactívala en su lugar.' });
    }
    console.error('supervisorAlarmasController.eliminarConfig', err.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la alarma' });
  }
};

exports.runNow = async (_req, res) => {
  await runAll();
  res.json({ success: true, message: 'Evaluación de alarmas ejecutada' });
};
exports.init = runAll;
