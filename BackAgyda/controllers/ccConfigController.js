const sql = require('mssql');
const databaseService = require('../services/databaseService');
const metaClient = require('../services/canalesMeta/metaClient');

function esAdmin(req) {
  return ['AD', 'TI'].includes(String(req.user?.tipoUsuario || '').toUpperCase());
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }
function tenantKeyDe(req) { return (req?.user?.empresa || 'agyda').toLowerCase(); }

async function ensureConfigRow(p) {
  await p.request().query(`IF NOT EXISTS (SELECT 1 FROM dbo.CCO_CONFIG) INSERT INTO dbo.CCO_CONFIG (CF_MSG_BIENVENIDA) VALUES (N'Hola, en un momento te atendemos.')`);
}

// ── Config global ───────────────────────────────────────────────────────
exports.getConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await ensureConfigRow(p);
    const r = await p.request().query('SELECT TOP 1 * FROM dbo.CCO_CONFIG ORDER BY CF_ID');
    const row = r.recordset[0];
    res.json({ success: true, data: {
      slaPrimeraRespuestaSeg: row.CF_SLA_PRIMERA_RESPUESTA_SEG,
      slaRespuestaSeg: row.CF_SLA_RESPUESTA_SEG,
      acwSeg: row.CF_ACW_SEG,
      maxInteraccionesPorAgente: row.CF_MAX_INTERACCIONES_POR_AGENTE,
      autocierreInactividadMin: row.CF_AUTOCIERRE_INACTIVIDAD_MIN,
      msgBienvenida: row.CF_MSG_BIENVENIDA || '',
      msgFueraHorario: row.CF_MSG_FUERA_HORARIO || '',
      horarioInicio: row.CF_HORARIO_INICIO || '', horarioFin: row.CF_HORARIO_FIN || '',
      diasSemana: row.CF_DIAS_SEMANA || '1,2,3,4,5',
    } });
  } catch (e) {
    console.error('ccConfig.getConfig:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await ensureConfigRow(p);
    const cl = (n, min, max, def) => { const v = Number(n); return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : def; };
    await p.request()
      .input('sla1', sql.Int, cl(b.slaPrimeraRespuestaSeg, 10, 86400, 120))
      .input('sla2', sql.Int, cl(b.slaRespuestaSeg, 10, 86400, 300))
      .input('acw', sql.Int, cl(b.acwSeg, 0, 3600, 60))
      .input('max', sql.Int, cl(b.maxInteraccionesPorAgente, 1, 50, 4))
      .input('auto', sql.Int, cl(b.autocierreInactividadMin, 5, 10080, 60))
      .input('mb', sql.NVarChar(sql.MAX), b.msgBienvenida || null)
      .input('mf', sql.NVarChar(sql.MAX), b.msgFueraHorario || null)
      .input('hi', sql.NVarChar(5), b.horarioInicio || null)
      .input('hf', sql.NVarChar(5), b.horarioFin || null)
      .input('ds', sql.NVarChar(20), b.diasSemana || null)
      .query(`UPDATE dbo.CCO_CONFIG SET
        CF_SLA_PRIMERA_RESPUESTA_SEG=@sla1, CF_SLA_RESPUESTA_SEG=@sla2, CF_ACW_SEG=@acw,
        CF_MAX_INTERACCIONES_POR_AGENTE=@max, CF_AUTOCIERRE_INACTIVIDAD_MIN=@auto,
        CF_MSG_BIENVENIDA=@mb, CF_MSG_FUERA_HORARIO=@mf,
        CF_HORARIO_INICIO=@hi, CF_HORARIO_FIN=@hf, CF_DIAS_SEMANA=@ds,
        CF_FECHA_ACTUALIZACION=GETDATE()
        WHERE CF_ID=(SELECT TOP 1 CF_ID FROM dbo.CCO_CONFIG ORDER BY CF_ID)`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccConfig.updateConfig:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// ── Canales ─────────────────────────────────────────────────────────────
const TIPOS_CANAL = ['whatsapp', 'messenger', 'instagram', 'test'];

exports.listCanales = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT CN_ID id, CN_TIPO tipo, CN_NOMBRE nombre, CN_HABILITADO habilitado,
             CN_GRUPO_ID grupoId, CN_CAMPANIA_ID campaniaId,
             CN_META_PAGE_ID metaPageId, CN_META_BUSINESS_ID metaBusinessId,
             CN_VERIFY_TOKEN verifyToken, CN_WEBHOOK_SUSCRITO webhookSuscrito,
             CASE WHEN CN_ACCESS_TOKEN IS NOT NULL AND LEN(CN_ACCESS_TOKEN) > 0 THEN 1 ELSE 0 END accessTokenConfigurado,
             CASE WHEN CN_APP_SECRET IS NOT NULL AND LEN(CN_APP_SECRET) > 0 THEN 1 ELSE 0 END appSecretConfigurado
      FROM dbo.CCO_CANALES ORDER BY CN_ID`);
    const base = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '';
    const tk = tenantKeyDe(req);
    res.json({ success: true, data: r.recordset.map((c) => ({
      ...c,
      habilitado: !!c.habilitado, webhookSuscrito: !!c.webhookSuscrito,
      accessTokenConfigurado: !!c.accessTokenConfigurado, appSecretConfigurado: !!c.appSecretConfigurado,
      webhookUrl: `${base}/api/cc/webhook/${tk}/${c.id}`,
    })) });
  } catch (e) {
    console.error('ccConfig.listCanales:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

exports.createCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!TIPOS_CANAL.includes(b.tipo)) return res.status(400).json({ success: false, message: 'Tipo de canal inválido' });
    if (!b.nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const p = await pool(req);
    const r = await p.request()
      .input('tipo', sql.NVarChar(20), b.tipo).input('nombre', sql.NVarChar(120), b.nombre)
      .query(`INSERT INTO dbo.CCO_CANALES (CN_TIPO, CN_NOMBRE) OUTPUT INSERTED.CN_ID id VALUES (@tipo, @nombre)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al crear canal' });
  }
};

exports.updateCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    const cur = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const ex = cur.recordset[0];
    if (!ex) return res.status(404).json({ success: false, message: 'No encontrado' });
    // "no lo mando de vuelta, no lo borres" para los secretos
    const accessToken = b.accessToken ? String(b.accessToken) : ex.CN_ACCESS_TOKEN;
    const appSecret = b.appSecret ? String(b.appSecret) : ex.CN_APP_SECRET;
    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar(120), b.nombre ?? ex.CN_NOMBRE)
      .input('hab', sql.Bit, b.habilitado != null ? !!b.habilitado : !!ex.CN_HABILITADO)
      .input('grupo', sql.Int, b.grupoId != null ? b.grupoId : ex.CN_GRUPO_ID)
      .input('camp', sql.Int, b.campaniaId != null ? b.campaniaId : ex.CN_CAMPANIA_ID)
      .input('page', sql.NVarChar(60), b.metaPageId != null ? b.metaPageId : ex.CN_META_PAGE_ID)
      .input('biz', sql.NVarChar(60), b.metaBusinessId != null ? b.metaBusinessId : ex.CN_META_BUSINESS_ID)
      .input('tok', sql.NVarChar(600), accessToken || null)
      .input('sec', sql.NVarChar(200), appSecret || null)
      .input('vt', sql.NVarChar(100), b.verifyToken != null ? b.verifyToken : ex.CN_VERIFY_TOKEN)
      .query(`UPDATE dbo.CCO_CANALES SET
        CN_NOMBRE=@nombre, CN_HABILITADO=@hab, CN_GRUPO_ID=@grupo, CN_CAMPANIA_ID=@camp,
        CN_META_PAGE_ID=@page, CN_META_BUSINESS_ID=@biz, CN_ACCESS_TOKEN=@tok,
        CN_APP_SECRET=@sec, CN_VERIFY_TOKEN=@vt, CN_FECHA_ACTUALIZACION=GETDATE()
        WHERE CN_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccConfig.updateCanal:', e.message);
    res.status(500).json({ success: false, message: 'Error al actualizar canal' });
  }
};

exports.deleteCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const uso = await p.request().input('id', sql.Int, req.params.id)
      .query(`SELECT COUNT(*) n FROM dbo.CCO_INTERACCIONES WHERE CI_CANAL_ID = @id`);
    if (uso.recordset[0].n > 0) {
      await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_CANALES SET CN_HABILITADO = 0 WHERE CN_ID = @id`);
      return res.json({ success: true, message: 'Canal con historial: se deshabilitó en vez de borrar' });
    }
    await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al eliminar canal' });
  }
};

exports.probarCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const canal = r.recordset[0];
    if (!canal) return res.status(404).json({ success: false, message: 'No encontrado' });
    if ((canal.CN_TIPO || '').toLowerCase() === 'test') return res.json({ success: true, message: 'Canal de prueba: no requiere conexión.' });
    const out = await metaClient.verificarConexion(canal);
    res.status(out.ok ? 200 : 400).json({ success: out.ok, message: out.message });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.suscribirCanal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const canal = r.recordset[0];
    if (!canal) return res.status(404).json({ success: false, message: 'No encontrado' });
    await metaClient.suscribirWebhook(canal);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_CANALES SET CN_WEBHOOK_SUSCRITO = 1 WHERE CN_ID = @id`);
    res.json({ success: true, message: 'Webhook suscrito.' });
  } catch (e) {
    res.status(400).json({ success: false, message: `No se pudo suscribir: ${e.message}` });
  }
};

// ── Campañas / skills(grupos) / plantillas / motivos / tipificaciones ────
function esGestor(req) {
  return esAdmin(req);
}

exports.listCampanias = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`SELECT CM2_ID id, CM2_NOMBRE nombre, CM2_DESCRIPCION descripcion,
      CM2_MAX_CHATS_POR_AGENTE maxChatsPorAgente FROM dbo.CCO_CAMPANIAS WHERE CM2_ACTIVO = 1 ORDER BY CM2_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const p = await pool(req);
    const r = await p.request().input('n', sql.NVarChar(200), b.nombre).input('d', sql.NVarChar(sql.MAX), b.descripcion || null)
      .input('m', sql.Int, b.maxChatsPorAgente || null)
      .query(`INSERT INTO dbo.CCO_CAMPANIAS (CM2_NOMBRE, CM2_DESCRIPCION, CM2_MAX_CHATS_POR_AGENTE) OUTPUT INSERTED.CM2_ID id VALUES (@n, @d, @m)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(200), b.nombre || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('m', sql.Int, b.maxChatsPorAgente ?? null)
      .query(`UPDATE dbo.CCO_CAMPANIAS SET CM2_NOMBRE = ISNULL(@n, CM2_NOMBRE), CM2_DESCRIPCION = @d, CM2_MAX_CHATS_POR_AGENTE = @m WHERE CM2_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteCampania = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_CAMPANIAS SET CM2_ACTIVO = 0 WHERE CM2_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.listGrupos = async (req, res) => {
  try {
    const p = await pool(req);
    const rq = p.request();
    let where = 'CG_ACTIVO = 1';
    if (req.query.campaniaId) { rq.input('c', sql.Int, req.query.campaniaId); where += ' AND CG_CAMPANIA_ID = @c'; }
    const r = await rq.query(`SELECT CG_ID id, CG_CAMPANIA_ID campaniaId, CG_NOMBRE nombre, CG_DESCRIPCION descripcion, CG_ICONO icono FROM dbo.CCO_GRUPOS WHERE ${where} ORDER BY CG_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.campaniaId || !b.nombre) return res.status(400).json({ success: false, message: 'Falta campaña o nombre' });
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, b.campaniaId).input('n', sql.NVarChar(120), b.nombre)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion || null).input('i', sql.NVarChar(10), b.icono || '💬')
      .query(`INSERT INTO dbo.CCO_GRUPOS (CG_CAMPANIA_ID, CG_NOMBRE, CG_DESCRIPCION, CG_ICONO) OUTPUT INSERTED.CG_ID id VALUES (@c, @n, @d, @i)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(120), b.nombre || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null).input('i', sql.NVarChar(10), b.icono || null)
      .query(`UPDATE dbo.CCO_GRUPOS SET CG_NOMBRE = ISNULL(@n, CG_NOMBRE), CG_DESCRIPCION = @d, CG_ICONO = ISNULL(@i, CG_ICONO) WHERE CG_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const uso = await p.request().input('id', sql.Int, req.params.id).query(`SELECT COUNT(*) n FROM dbo.CCO_GRUPO_AGENTES WHERE CGA_GRUPO_ID = @id AND CGA_ACTIVO = 1`);
    if (uso.recordset[0].n > 0) return res.status(400).json({ success: false, message: 'El skill tiene agentes asignados' });
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_GRUPOS SET CG_ACTIVO = 0 WHERE CG_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getAgentesDeGrupo = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId).query(`
      SELECT ga.CGA_USUARIO_ID usuarioId, u.NEUS_NOMBRES nombre
      FROM dbo.CCO_GRUPO_AGENTES ga LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ga.CGA_USUARIO_ID
      WHERE ga.CGA_GRUPO_ID = @g AND ga.CGA_ACTIVO = 1 ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.asignarAgenteAGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('g', sql.Int, req.params.grupoId).input('u', sql.Int, req.body?.usuarioId)
      .query(`MERGE dbo.CCO_GRUPO_AGENTES AS t USING (SELECT @g g, @u u) s ON t.CGA_GRUPO_ID = s.g AND t.CGA_USUARIO_ID = s.u
              WHEN MATCHED THEN UPDATE SET CGA_ACTIVO = 1 WHEN NOT MATCHED THEN INSERT (CGA_GRUPO_ID, CGA_USUARIO_ID) VALUES (@g, @u);`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.quitarAgenteDeGrupo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('g', sql.Int, req.params.grupoId).input('u', sql.Int, req.params.usuarioId)
      .query(`UPDATE dbo.CCO_GRUPO_AGENTES SET CGA_ACTIVO = 0 WHERE CGA_GRUPO_ID = @g AND CGA_USUARIO_ID = @u`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Matriz agente × skill (para la pantalla de asignación)
exports.getMatrizAgentes = async (req, res) => {
  try {
    const p = await pool(req);
    const grupos = await p.request().query(`SELECT CG_ID id, CG_NOMBRE nombre, CG_ICONO icono FROM dbo.CCO_GRUPOS WHERE CG_ACTIVO = 1 ORDER BY CG_NOMBRE`);
    const asign = await p.request().query(`SELECT CGA_USUARIO_ID usuarioId, CGA_GRUPO_ID grupoId FROM dbo.CCO_GRUPO_AGENTES WHERE CGA_ACTIVO = 1`);
    res.json({ success: true, data: { grupos: grupos.recordset, asignaciones: asign.recordset } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Tipificaciones ──────────────────────────────────────────────────────
exports.listTipificaciones = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`SELECT CT_ID id, CT_CAMPANIA_ID campaniaId, CT_NOMBRE nombre, CT_DESCRIPCION descripcion,
      CT_REQUIERE_COMENTARIO requiereComentario, CT_ORDEN orden FROM dbo.CCO_TIPIFICACIONES WHERE CT_ACTIVO = 1 ORDER BY CT_ORDEN, CT_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createTipificacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const p = await pool(req);
    const r = await p.request().input('c', sql.Int, b.campaniaId || null).input('n', sql.NVarChar(200), b.nombre)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion || null).input('rc', sql.Bit, !!b.requiereComentario).input('o', sql.Int, b.orden || 0)
      .query(`INSERT INTO dbo.CCO_TIPIFICACIONES (CT_CAMPANIA_ID, CT_NOMBRE, CT_DESCRIPCION, CT_REQUIERE_COMENTARIO, CT_ORDEN) OUTPUT INSERTED.CT_ID id VALUES (@c, @n, @d, @rc, @o)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateTipificacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(200), b.nombre || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('rc', sql.Bit, b.requiereComentario != null ? !!b.requiereComentario : null).input('o', sql.Int, b.orden ?? null)
      .input('c', sql.Int, b.campaniaId ?? null)
      .query(`UPDATE dbo.CCO_TIPIFICACIONES SET CT_NOMBRE = ISNULL(@n, CT_NOMBRE), CT_DESCRIPCION = @d,
        CT_REQUIERE_COMENTARIO = ISNULL(@rc, CT_REQUIERE_COMENTARIO), CT_ORDEN = ISNULL(@o, CT_ORDEN), CT_CAMPANIA_ID = @c WHERE CT_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteTipificacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_TIPIFICACIONES SET CT_ACTIVO = 0 WHERE CT_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Motivos de cierre por grupo ────────────────────────────────────────
exports.listMotivos = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId)
      .query(`SELECT CMC_ID id, CMC_MOTIVO motivo, CMC_DESCRIPCION descripcion, CMC_REQUIERE_COMENTARIO requiereComentario, CMC_ORDEN orden
              FROM dbo.CCO_MOTIVOS_CIERRE WHERE CMC_GRUPO_ID = @g AND CMC_ACTIVO = 1 ORDER BY CMC_ORDEN`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createMotivo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!b.motivo) return res.status(400).json({ success: false, message: 'Falta el motivo' });
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId).input('m', sql.NVarChar(200), b.motivo)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion || null).input('rc', sql.Bit, !!b.requiereComentario).input('o', sql.Int, b.orden || 0)
      .query(`INSERT INTO dbo.CCO_MOTIVOS_CIERRE (CMC_GRUPO_ID, CMC_MOTIVO, CMC_DESCRIPCION, CMC_REQUIERE_COMENTARIO, CMC_ORDEN) OUTPUT INSERTED.CMC_ID id VALUES (@g, @m, @d, @rc, @o)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updateMotivo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .input('m', sql.NVarChar(200), b.motivo || null).input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('rc', sql.Bit, b.requiereComentario != null ? !!b.requiereComentario : null).input('o', sql.Int, b.orden ?? null)
      .query(`UPDATE dbo.CCO_MOTIVOS_CIERRE SET CMC_MOTIVO = ISNULL(@m, CMC_MOTIVO), CMC_DESCRIPCION = @d,
        CMC_REQUIERE_COMENTARIO = ISNULL(@rc, CMC_REQUIERE_COMENTARIO), CMC_ORDEN = ISNULL(@o, CMC_ORDEN) WHERE CMC_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deleteMotivo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_MOTIVOS_CIERRE SET CMC_ACTIVO = 0 WHERE CMC_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Plantillas por grupo ───────────────────────────────────────────────
exports.listPlantillas = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('g', sql.Int, req.params.grupoId)
      .query(`SELECT CP_ID id, CP_NOMBRE nombre, CP_CONTENIDO contenido, CP_VISIBILIDAD visibilidad, CP_USUARIO_ID usuarioId
              FROM dbo.CCO_PLANTILLAS WHERE CP_GRUPO_ID = @g AND CP_ACTIVO = 1 ORDER BY CP_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.createPlantilla = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.nombre || !b.contenido) return res.status(400).json({ success: false, message: 'Falta nombre o contenido' });
    const p = await pool(req);
    const uid = req.user && (req.user.id || req.user.sub);
    const visibilidad = b.visibilidad === 'privada' ? 'privada' : 'publica';
    if (visibilidad === 'publica' && !esGestor(req)) return res.status(403).json({ success: false, message: 'Solo un gestor crea plantillas públicas' });
    const r = await p.request().input('g', sql.Int, req.params.grupoId).input('n', sql.NVarChar(200), b.nombre)
      .input('c', sql.NVarChar(sql.MAX), b.contenido).input('v', sql.NVarChar(20), visibilidad).input('u', sql.Int, visibilidad === 'privada' ? uid : null)
      .query(`INSERT INTO dbo.CCO_PLANTILLAS (CP_GRUPO_ID, CP_NOMBRE, CP_CONTENIDO, CP_VISIBILIDAD, CP_USUARIO_ID) OUTPUT INSERTED.CP_ID id VALUES (@g, @n, @c, @v, @u)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.updatePlantilla = async (req, res) => {
  try {
    const b = req.body || {};
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).input('n', sql.NVarChar(200), b.nombre || null).input('c', sql.NVarChar(sql.MAX), b.contenido ?? null)
      .query(`UPDATE dbo.CCO_PLANTILLAS SET CP_NOMBRE = ISNULL(@n, CP_NOMBRE), CP_CONTENIDO = ISNULL(@c, CP_CONTENIDO) WHERE CP_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.deletePlantilla = async (req, res) => {
  try {
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query(`UPDATE dbo.CCO_PLANTILLAS SET CP_ACTIVO = 0 WHERE CP_ID = @id`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
