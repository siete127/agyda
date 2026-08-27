const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { normalizeArea } = require('../utils/helpers');

const ESTADOS_TRABAJO = ['disponible', 'pausa', 'fuera_horario', 'ocupado'];

// Carga real de un técnico: tickets abiertos asignados + chats activos.
// Materializa la decisión de negocio "carga de trabajo = tickets + chats".
async function getCargaTecnico(pool, userId) {
  const rs = await pool.request().input('uid', sql.Int, userId).query(`
    SELECT
      (SELECT COUNT(*) FROM TICKETS WHERE ASIGNADO_A=@uid AND ESTADO NOT IN ('resuelto','cerrado')) as tickets,
      (SELECT COUNT(*) FROM LIVECHAT_CONVERSACIONES WHERE LC_AGENTE_ID=@uid AND LC_ESTADO='activa') as chats
  `);
  return { tickets: rs.recordset[0].tickets, chats: rs.recordset[0].chats };
}

function parseCsv(v) {
  return v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null;
}

// GET /api/tecnicos — superset de getStaffTI (ticketController.js) con perfil rico.
exports.getTecnicos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        u.NEUS_ID as userId,
        u.NEUS_NOMBRES as nombre,
        COALESCE(s.AREA, CASE WHEN u.NEUS_TIPOUSUARIO IN ('TI','ST') THEN u.NEUS_TIPOUSUARIO ELSE 'TI' END) as area,
        COALESCE(s.DISPONIBLE,1) as disponible,
        COALESCE(s.NIVEL,1) as nivel,
        COALESCE(s.ESTADO_TRABAJO,'disponible') as estadoTrabajo,
        COALESCE(s.MAX_TICKETS,10) as maxTickets,
        COALESCE(s.MAX_CHATS,5) as maxChats,
        s.PRIORIDADES_PERMITIDAS as prioridadesPermitidas,
        s.HORARIO_INICIO as horarioInicio,
        s.HORARIO_FIN as horarioFin,
        s.DIAS_SEMANA as diasSemana,
        g.NOMBRE as grupoNombre
      FROM NEUS_USUARIOS u
      LEFT JOIN TI_STAFF_STATUS s ON s.USER_ID=u.NEUS_ID
      LEFT JOIN GRUPOS_SOPORTE g ON g.AREA = COALESCE(s.AREA, CASE WHEN u.NEUS_TIPOUSUARIO IN ('TI','ST') THEN u.NEUS_TIPOUSUARIO ELSE 'TI' END)
                                 AND g.NIVEL = COALESCE(s.NIVEL,1)
      WHERE u.NEUS_ACTIVO=1
        AND (
          u.NEUS_TIPOUSUARIO IN ('TI','ST')
          OR EXISTS (SELECT 1 FROM TI_STAFF_STATUS x WHERE x.USER_ID = u.NEUS_ID AND x.AREA IN ('TI','ST'))
        )
      ORDER BY u.NEUS_NOMBRES`);

    const especialidades = await pool.request().query(`
      SELECT TE_USER_ID as userId, e.ESP_ID as id, e.ESP_NOMBRE as nombre
      FROM TI_TECNICO_ESPECIALIDAD te JOIN TI_ESPECIALIDADES e ON e.ESP_ID = te.TE_ESP_ID`);
    const categorias = await pool.request().query(`
      SELECT TC_USER_ID as userId, c.CAT_ID as id, c.CAT_NOMBRE as nombre
      FROM TI_TECNICO_CATEGORIA tc JOIN TICKET_CATEGORIAS c ON c.CAT_ID = tc.TC_CAT_ID`);
    const sedes = await pool.request().query(`
      SELECT TS_USER_ID as userId, se.SEDE_ID as id, se.SEDE_NOMBRE as nombre
      FROM TI_TECNICO_SEDE ts JOIN SEDES se ON se.SEDE_ID = ts.TS_SEDE_ID`);

    const data = [];
    for (const t of rs.recordset) {
      const carga = await getCargaTecnico(pool, t.userId);
      data.push({
        ...t,
        prioridadesPermitidas: parseCsv(t.prioridadesPermitidas),
        diasSemana: parseCsv(t.diasSemana),
        especialidades: especialidades.recordset.filter((e) => e.userId === t.userId).map(({ userId, ...r }) => r),
        categoriasPermitidas: categorias.recordset.filter((c) => c.userId === t.userId).map(({ userId, ...r }) => r),
        sedesPermitidas: sedes.recordset.filter((s) => s.userId === t.userId).map(({ userId, ...r }) => r),
        cargaActual: carga,
      });
    }

    res.json({ success: true, data });
  } catch (e) {
    console.error('Error listando técnicos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTecnicoById = async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT u.NEUS_ID as userId, u.NEUS_NOMBRES as nombre,
        COALESCE(s.AREA,'TI') as area, COALESCE(s.DISPONIBLE,1) as disponible, COALESCE(s.NIVEL,1) as nivel,
        COALESCE(s.ESTADO_TRABAJO,'disponible') as estadoTrabajo,
        COALESCE(s.MAX_TICKETS,10) as maxTickets, COALESCE(s.MAX_CHATS,5) as maxChats,
        s.PRIORIDADES_PERMITIDAS as prioridadesPermitidas, s.HORARIO_INICIO as horarioInicio,
        s.HORARIO_FIN as horarioFin, s.DIAS_SEMANA as diasSemana
      FROM NEUS_USUARIOS u LEFT JOIN TI_STAFF_STATUS s ON s.USER_ID=u.NEUS_ID
      WHERE u.NEUS_ID=@uid`);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Técnico no encontrado' });

    const t = rs.recordset[0];
    const esp = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT e.ESP_ID as id, e.ESP_NOMBRE as nombre FROM TI_TECNICO_ESPECIALIDAD te
      JOIN TI_ESPECIALIDADES e ON e.ESP_ID=te.TE_ESP_ID WHERE te.TE_USER_ID=@uid`);
    const cat = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT c.CAT_ID as id, c.CAT_NOMBRE as nombre FROM TI_TECNICO_CATEGORIA tc
      JOIN TICKET_CATEGORIAS c ON c.CAT_ID=tc.TC_CAT_ID WHERE tc.TC_USER_ID=@uid`);
    const sed = await pool.request().input('uid', sql.Int, userId).query(`
      SELECT s.SEDE_ID as id, s.SEDE_NOMBRE as nombre FROM TI_TECNICO_SEDE ts
      JOIN SEDES s ON s.SEDE_ID=ts.TS_SEDE_ID WHERE ts.TS_USER_ID=@uid`);
    const carga = await getCargaTecnico(pool, userId);

    res.json({
      success: true,
      data: {
        ...t,
        prioridadesPermitidas: parseCsv(t.prioridadesPermitidas),
        diasSemana: parseCsv(t.diasSemana),
        especialidades: esp.recordset,
        categoriasPermitidas: cat.recordset,
        sedesPermitidas: sed.recordset,
        cargaActual: carga,
      },
    });
  } catch (e) {
    console.error('Error obteniendo técnico:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// PUT /api/tecnicos/:userId — reemplazo total de listas: el body siempre debe
// mandar especialidadesIds/categoriasIds/sedesIds completas (no parciales),
// para evitar borrados accidentales por PUT parcial.
exports.actualizarPerfilTecnico = async (req, res) => {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const { userId } = req.params;
    const {
      area, nivel, disponible, estadoTrabajo, maxTickets, maxChats,
      prioridadesPermitidas, horarioInicio, horarioFin, diasSemana,
      especialidadesIds = [], categoriasIds = [], sedesIds = [],
    } = req.body;

    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });

    const a = normalizeArea(area || 'TI');
    const niv = [1, 2, 3].includes(Number(nivel)) ? Number(nivel) : 1;
    const disp = disponible === undefined ? 1 : (disponible ? 1 : 0);
    const estado = ESTADOS_TRABAJO.includes(estadoTrabajo) ? estadoTrabajo : 'disponible';
    const maxT = Number.isFinite(Number(maxTickets)) ? Number(maxTickets) : 10;
    const maxC = Number.isFinite(Number(maxChats)) ? Number(maxChats) : 5;
    const prioCsv = Array.isArray(prioridadesPermitidas) && prioridadesPermitidas.length ? prioridadesPermitidas.join(',') : null;
    const diasCsv = Array.isArray(diasSemana) && diasSemana.length ? diasSemana.join(',') : null;

    await transaction.begin();
    const req1 = new sql.Request(transaction);
    await req1
      .input('uid', sql.Int, userId)
      .input('area', sql.NVarChar, a)
      .input('disp', sql.Bit, disp)
      .input('nivel', sql.TinyInt, niv)
      .input('estado', sql.NVarChar, estado)
      .input('maxT', sql.Int, maxT)
      .input('maxC', sql.Int, maxC)
      .input('prio', sql.NVarChar, prioCsv)
      .input('hIni', sql.VarChar, horarioInicio || null)
      .input('hFin', sql.VarChar, horarioFin || null)
      .input('dias', sql.NVarChar, diasCsv)
      .query(`
MERGE TI_STAFF_STATUS AS tgt
USING (SELECT @uid AS USER_ID) AS src
ON (tgt.USER_ID = src.USER_ID)
WHEN MATCHED THEN UPDATE SET AREA=@area, DISPONIBLE=@disp, NIVEL=@nivel, ESTADO_TRABAJO=@estado,
  MAX_TICKETS=@maxT, MAX_CHATS=@maxC, PRIORIDADES_PERMITIDAS=@prio,
  HORARIO_INICIO=@hIni, HORARIO_FIN=@hFin, DIAS_SEMANA=@dias
WHEN NOT MATCHED THEN INSERT(USER_ID, AREA, DISPONIBLE, NIVEL, ESTADO_TRABAJO, MAX_TICKETS, MAX_CHATS, PRIORIDADES_PERMITIDAS, HORARIO_INICIO, HORARIO_FIN, DIAS_SEMANA)
  VALUES(@uid, @area, @disp, @nivel, @estado, @maxT, @maxC, @prio, @hIni, @hFin, @dias);
      `);

    // Reemplazo total de las 3 tablas puente (DELETE + INSERT en bloque)
    const req2 = new sql.Request(transaction);
    await req2.input('uid', sql.Int, userId).query('DELETE FROM TI_TECNICO_ESPECIALIDAD WHERE TE_USER_ID=@uid');
    for (const espId of especialidadesIds) {
      const r = new sql.Request(transaction);
      await r.input('uid', sql.Int, userId).input('espId', sql.Int, espId)
        .query('INSERT INTO TI_TECNICO_ESPECIALIDAD (TE_USER_ID, TE_ESP_ID) VALUES (@uid, @espId)');
    }

    const req3 = new sql.Request(transaction);
    await req3.input('uid', sql.Int, userId).query('DELETE FROM TI_TECNICO_CATEGORIA WHERE TC_USER_ID=@uid');
    for (const catId of categoriasIds) {
      const r = new sql.Request(transaction);
      await r.input('uid', sql.Int, userId).input('catId', sql.Int, catId)
        .query('INSERT INTO TI_TECNICO_CATEGORIA (TC_USER_ID, TC_CAT_ID) VALUES (@uid, @catId)');
    }

    const req4 = new sql.Request(transaction);
    await req4.input('uid', sql.Int, userId).query('DELETE FROM TI_TECNICO_SEDE WHERE TS_USER_ID=@uid');
    for (const sedeId of sedesIds) {
      const r = new sql.Request(transaction);
      await r.input('uid', sql.Int, userId).input('sedeId', sql.Int, sedeId)
        .query('INSERT INTO TI_TECNICO_SEDE (TS_USER_ID, TS_SEDE_ID) VALUES (@uid, @sedeId)');
    }

    await transaction.commit();

    // Auto-sync con el grupo de la campaña de chat "Soporte TI" (mismo criterio
    // que actualizarStaffTI en ticketController.js).
    if (a === 'TI') {
      try {
        const livechatInternoController = require('./livechatInternoController');
        const camp = await livechatInternoController.resolverCampaniaGrupoSoporteTI(pool);
        if (camp) {
          if (disp === 1) {
            await pool.request().input('grupoId', sql.Int, camp.grupoId).input('uid', sql.Int, userId).query(`
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
    try { await transaction.rollback(); } catch (_) {}
    console.error('Error actualizando perfil de técnico:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getCargaTecnico = getCargaTecnico;
