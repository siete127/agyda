const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

const SELECT_RESPUESTA = `
  SELECT
    RESP_PK as pk,
    RESP_ID as id,
    RESP_KEYWORDS as keywords,
    RESP_TEXTO_ES as textoEs,
    RESP_TEXTO_EN as textoEn,
    RESP_BOTONES as botones,
    RESP_SENAL_INTERES as senalInteres,
    RESP_ORDEN as orden,
    RESP_AUTOR_ID as autorId,
    RESP_AUTOR_NOMBRE as autorNombre,
    RESP_FECHA_CREACION as fechaCreacion,
    RESP_FECHA_ACTUALIZACION as fechaActualizacion,
    RESP_ACTIVA as activa
  FROM dbo.CHATBOT_RESPUESTAS
`;

// Convierte el array JSON almacenado en texto a un array real; tolera strings sueltos o vacíos.
function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function mapRow(row) {
  return {
    ...row,
    keywords: parseJsonArray(row.keywords),
    botones: parseJsonArray(row.botones),
  };
}

// Botones "reales" que salen de una Respuesta en el Flujo Visual — cada
// conexión CHATBOT_FLUJO_CONEXIONES con FCX_ORIGEN_TIPO='respuesta' se
// resuelve a su destino real, para que el widget público arme el botón con
// el texto correcto y sepa qué acción tomar al hacer clic, sin depender de
// coincidencia de texto contra 'RESP_BOTONES' (texto libre, el modo viejo).
async function getConexionesSalientesDeRespuestas(pool) {
  const conexiones = await pool.request().query(`
    SELECT FCX_ID as id, FCX_ORIGEN_ID as origenId, FCX_DESTINO_TIPO as destinoTipo, FCX_DESTINO_ID as destinoId, FCX_ETIQUETA as etiqueta
    FROM dbo.CHATBOT_FLUJO_CONEXIONES WHERE FCX_ORIGEN_TIPO = 'respuesta'
  `);
  if (conexiones.recordset.length === 0) return new Map();

  const idsRespuesta = [...new Set(conexiones.recordset.filter((c) => c.destinoTipo === 'respuesta').map((c) => c.destinoId))];
  const idsEtiqueta = [...new Set(conexiones.recordset.filter((c) => c.destinoTipo === 'etiqueta').map((c) => c.destinoId))];
  const idsCampania = [...new Set(conexiones.recordset.filter((c) => c.destinoTipo === 'campania').map((c) => c.destinoId))];
  const idsNodoArbol = [...new Set(conexiones.recordset.filter((c) => c.destinoTipo === 'nodo_arbol').map((c) => c.destinoId))];

  const [respuestas, etiquetas, campanias, nodosArbol] = await Promise.all([
    idsRespuesta.length ? pool.request().query(`SELECT RESP_PK as id, RESP_TEXTO_ES as textoBoton FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_PK IN (${idsRespuesta.join(',')}) AND RESP_ACTIVA = 1`) : { recordset: [] },
    idsEtiqueta.length ? pool.request().query(`SELECT ETQ_ID as id, ETQ_TEXTO_ES as textoEs, ETQ_TEXTO_EN as textoEn, ETQ_TIPO as tipo, ETQ_CAMPANIA_ID as campaniaId, ETQ_GRUPO_ID as grupoId, c.LCA_TOKEN as campaniaToken FROM dbo.CHATBOT_ETIQUETAS_MENU e LEFT JOIN dbo.LIVECHAT_CAMPANIAS c ON c.LCA_ID = e.ETQ_CAMPANIA_ID WHERE ETQ_ID IN (${idsEtiqueta.join(',')}) AND ETQ_ACTIVA = 1`) : { recordset: [] },
    idsCampania.length ? pool.request().query(`SELECT LCA_ID as id, LCA_NOMBRE as textoBoton, LCA_TOKEN as token FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_ID IN (${idsCampania.join(',')}) AND LCA_ACTIVO = 1`) : { recordset: [] },
    idsNodoArbol.length ? pool.request().query(`SELECT NODO_ID as id, NODO_TEXTO as textoBoton FROM dbo.CHATBOT_NODOS WHERE NODO_ID IN (${idsNodoArbol.join(',')}) AND NODO_ACTIVO = 1`) : { recordset: [] },
  ]);

  const porId = (rows) => new Map(rows.map((r) => [r.id, r]));
  const mapaRespuestas = porId(respuestas.recordset);
  const mapaEtiquetas = porId(etiquetas.recordset);
  const mapaCampanias = porId(campanias.recordset);
  const mapaNodosArbol = porId(nodosArbol.recordset);

  const porOrigen = new Map();
  for (const c of conexiones.recordset) {
    let boton = null;
    if (c.destinoTipo === 'respuesta') {
      const r = mapaRespuestas.get(c.destinoId);
      if (r) boton = { texto: c.etiqueta || r.textoBoton, accion: 'respuesta', respuestaPk: r.id };
    } else if (c.destinoTipo === 'etiqueta') {
      const e = mapaEtiquetas.get(c.destinoId);
      if (e) {
        boton = { texto: c.etiqueta || e.textoEs, textoEn: e.textoEn, accion: e.tipo, campaniaToken: e.campaniaToken || null, grupoId: e.grupoId || null };
      }
    } else if (c.destinoTipo === 'campania') {
      const camp = mapaCampanias.get(c.destinoId);
      if (camp) boton = { texto: c.etiqueta || camp.textoBoton, accion: 'escalar_campania', campaniaToken: camp.token, grupoId: null };
    } else if (c.destinoTipo === 'nodo_arbol') {
      const n = mapaNodosArbol.get(c.destinoId);
      if (n) boton = { texto: c.etiqueta || n.textoBoton, accion: 'arbol_diagnostico' };
    }
    if (!boton) continue;
    if (!porOrigen.has(c.origenId)) porOrigen.set(c.origenId, []);
    porOrigen.get(c.origenId).push(boton);
  }
  return porOrigen;
}

// Lectura pública: el widget de la página web la usa para construir el diccionario en el navegador.
exports.getRespuestasPublicas = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      ${SELECT_RESPUESTA}
      WHERE RESP_ACTIVA = 1
      ORDER BY RESP_ORDEN ASC, RESP_PK ASC
    `);
    const conexionesPorOrigen = await getConexionesSalientesDeRespuestas(pool);
    const data = result.recordset.map(mapRow).map((r) => ({
      ...r,
      botonesFlujo: conexionesPorOrigen.get(r.pk) || [],
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo respuestas del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Lectura administrativa: incluye inactivas, para el panel de edición.
exports.getRespuestas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      ${SELECT_RESPUESTA}
      ORDER BY RESP_ORDEN ASC, RESP_PK ASC
    `);
    res.json({ success: true, data: result.recordset.map(mapRow) });
  } catch (error) {
    console.error('Error obteniendo respuestas del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createRespuesta = async (req, res) => {
  try {
    const { id, keywords, textoEs, textoEn, botones, senalInteres, orden } = req.body;

    if (!id || !textoEs || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: id, textoEs, keywords (arreglo no vacío)' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT RESP_PK FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_ID = @id');
    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, message: `Ya existe una respuesta con el id "${id}"` });
    }

    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('keywords', sql.NVarChar, JSON.stringify(keywords))
      .input('textoEs', sql.NVarChar, textoEs)
      .input('textoEn', sql.NVarChar, textoEn || null)
      .input('botones', sql.NVarChar, JSON.stringify(Array.isArray(botones) ? botones : []))
      .input('senalInteres', sql.Bit, senalInteres === true)
      .input('orden', sql.Int, Number.isFinite(orden) ? orden : 0)
      .input('autorId', sql.Int, req.user?.id || null)
      .input('autorNombre', sql.NVarChar, req.user?.nombre || null)
      .query(`
        INSERT INTO dbo.CHATBOT_RESPUESTAS (
          RESP_ID, RESP_KEYWORDS, RESP_TEXTO_ES, RESP_TEXTO_EN, RESP_BOTONES,
          RESP_SENAL_INTERES, RESP_ORDEN, RESP_AUTOR_ID, RESP_AUTOR_NOMBRE,
          RESP_FECHA_CREACION, RESP_ACTIVA
        )
        VALUES (
          @id, @keywords, @textoEs, @textoEn, @botones,
          @senalInteres, @orden, @autorId, @autorNombre,
          GETDATE(), 1
        );
        SELECT SCOPE_IDENTITY() as pk;
      `);

    const pk = result.recordset[0].pk;
    const creada = await pool.request()
      .input('pk', sql.Int, pk)
      .query(`${SELECT_RESPUESTA} WHERE RESP_PK = @pk`);

    const data = mapRow(creada.recordset[0]);

    try {
      socketService.getIO(req.user?.empresa).emit('chatbot:respuestaCreada', data);
    } catch (e) {
      console.warn('⚠️ No se pudo emitir chatbot:respuestaCreada:', e?.message || e);
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'chatbot', accion: 'crear', entidadId: id, detalle: { id }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando respuesta del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateRespuesta = async (req, res) => {
  try {
    const { pk } = req.params;
    const { id, keywords, textoEs, textoEn, botones, senalInteres, orden, activa } = req.body;

    if (!id || !textoEs || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: id, textoEs, keywords (arreglo no vacío)' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('pk', sql.Int, pk)
      .query('SELECT RESP_PK FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_PK = @pk');
    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Respuesta no encontrada' });
    }

    const duplicada = await pool.request()
      .input('pk', sql.Int, pk)
      .input('id', sql.NVarChar, id)
      .query('SELECT RESP_PK FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_ID = @id AND RESP_PK <> @pk');
    if (duplicada.recordset.length > 0) {
      return res.status(409).json({ success: false, message: `Ya existe otra respuesta con el id "${id}"` });
    }

    await pool.request()
      .input('pk', sql.Int, pk)
      .input('id', sql.NVarChar, id)
      .input('keywords', sql.NVarChar, JSON.stringify(keywords))
      .input('textoEs', sql.NVarChar, textoEs)
      .input('textoEn', sql.NVarChar, textoEn || null)
      .input('botones', sql.NVarChar, JSON.stringify(Array.isArray(botones) ? botones : []))
      .input('senalInteres', sql.Bit, senalInteres === true)
      .input('orden', sql.Int, Number.isFinite(orden) ? orden : 0)
      .input('activa', sql.Bit, activa !== false)
      .query(`
        UPDATE dbo.CHATBOT_RESPUESTAS
        SET
          RESP_ID = @id,
          RESP_KEYWORDS = @keywords,
          RESP_TEXTO_ES = @textoEs,
          RESP_TEXTO_EN = @textoEn,
          RESP_BOTONES = @botones,
          RESP_SENAL_INTERES = @senalInteres,
          RESP_ORDEN = @orden,
          RESP_FECHA_ACTUALIZACION = GETDATE(),
          RESP_ACTIVA = @activa
        WHERE RESP_PK = @pk
      `);

    const actualizada = await pool.request()
      .input('pk', sql.Int, pk)
      .query(`${SELECT_RESPUESTA} WHERE RESP_PK = @pk`);

    const data = mapRow(actualizada.recordset[0]);

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('chatbot:respuestaActualizada', data);
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'chatbot', accion: 'editar', entidadId: id, detalle: { id }, ip: req.ip });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error actualizando respuesta del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleActiva = async (req, res) => {
  try {
    const { pk } = req.params;
    const { activa } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('pk', sql.Int, pk)
      .input('activa', sql.Bit, activa === true)
      .query(`
        UPDATE dbo.CHATBOT_RESPUESTAS
        SET RESP_ACTIVA = @activa, RESP_FECHA_ACTUALIZACION = GETDATE()
        WHERE RESP_PK = @pk
      `);

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('chatbot:toggleActiva', { pk: parseInt(pk), activa });
    }

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error cambiando estado de respuesta del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRespuesta = async (req, res) => {
  try {
    const { pk } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const check = await pool.request()
      .input('pk', sql.Int, pk)
      .query('SELECT RESP_PK, RESP_ID FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_PK = @pk');

    if (check.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Respuesta no encontrada' });
    }

    await pool.request()
      .input('pk', sql.Int, pk)
      .query('DELETE FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_PK = @pk');

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('chatbot:respuestaEliminada', { pk: parseInt(pk) });
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'chatbot', accion: 'eliminar', entidadId: check.recordset[0].RESP_ID, detalle: {}, ip: req.ip });
    res.json({ success: true, message: 'Respuesta eliminada' });
  } catch (error) {
    console.error('Error eliminando respuesta del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   ETIQUETAS DEL MENÚ INICIAL DEL WIDGET
   Reemplazan el arreglo fijo `menuInicial` que antes vivía
   hardcodeado en extra/Pagina de Intranet_1/index.html — cada fila
   es un botón del menú, editable/reordenable desde el panel.
════════════════════════════════════════════════════════ */

const SELECT_ETIQUETA = `
  SELECT
    e.ETQ_ID as id,
    e.ETQ_TEXTO_ES as textoEs,
    e.ETQ_TEXTO_EN as textoEn,
    e.ETQ_TIPO as tipo,
    e.ETQ_CAMPANIA_ID as campaniaId,
    c.LCA_NOMBRE as campaniaNombre,
    c.LCA_TOKEN as campaniaToken,
    e.ETQ_GRUPO_ID as grupoId,
    e.ETQ_ORDEN as orden,
    e.ETQ_ACTIVA as activa
  FROM dbo.CHATBOT_ETIQUETAS_MENU e
  LEFT JOIN dbo.LIVECHAT_CAMPANIAS c ON c.LCA_ID = e.ETQ_CAMPANIA_ID
`;

const TIPOS_ETIQUETA = ['respuesta', 'escalar_campania', 'escalar_generico', 'arbol_diagnostico'];

// Lectura pública: el widget arma su menú inicial con esto en vez del arreglo fijo.
// No expone campaniaToken salvo que el tipo sea 'escalar_campania' — es lo único
// que el widget necesita para poder escalar directo a esa campaña.
exports.getEtiquetasMenuPublicas = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      ${SELECT_ETIQUETA}
      WHERE e.ETQ_ACTIVA = 1
      ORDER BY e.ETQ_ORDEN ASC, e.ETQ_ID ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo etiquetas del menú del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEtiquetasMenu = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`${SELECT_ETIQUETA} ORDER BY e.ETQ_ORDEN ASC, e.ETQ_ID ASC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo etiquetas del menú del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEtiquetaMenu = async (req, res) => {
  try {
    const { textoEs, textoEn, tipo, campaniaId, grupoId, orden } = req.body;
    if (!textoEs || !textoEs.trim()) {
      return res.status(400).json({ success: false, message: 'El texto de la etiqueta es requerido' });
    }
    const tipoNorm = TIPOS_ETIQUETA.includes(tipo) ? tipo : 'respuesta';
    if (tipoNorm === 'escalar_campania' && !campaniaId) {
      return res.status(400).json({ success: false, message: 'Selecciona una campaña para este tipo de etiqueta' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('textoEs', sql.NVarChar, textoEs.trim())
      .input('textoEn', sql.NVarChar, textoEn || null)
      .input('tipo', sql.NVarChar, tipoNorm)
      .input('campaniaId', sql.Int, tipoNorm === 'escalar_campania' ? campaniaId : null)
      .input('grupoId', sql.Int, tipoNorm === 'escalar_campania' ? (grupoId || null) : null)
      .input('orden', sql.Int, Number.isFinite(orden) ? orden : 0)
      .query(`
        INSERT INTO dbo.CHATBOT_ETIQUETAS_MENU (ETQ_TEXTO_ES, ETQ_TEXTO_EN, ETQ_TIPO, ETQ_CAMPANIA_ID, ETQ_GRUPO_ID, ETQ_ORDEN)
        OUTPUT INSERTED.ETQ_ID as id
        VALUES (@textoEs, @textoEn, @tipo, @campaniaId, @grupoId, @orden)
      `);

    const creada = await pool.request()
      .input('id', sql.Int, result.recordset[0].id)
      .query(`${SELECT_ETIQUETA} WHERE e.ETQ_ID = @id`);
    res.status(201).json({ success: true, data: creada.recordset[0] });
  } catch (error) {
    console.error('Error creando etiqueta del menú del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEtiquetaMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { textoEs, textoEn, tipo, campaniaId, grupoId, orden, activa } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const existente = await pool.request().input('id', sql.Int, id)
      .query(`${SELECT_ETIQUETA} WHERE e.ETQ_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Etiqueta no encontrada' });
    }
    const actual = existente.recordset[0];
    const tipoNorm = tipo !== undefined ? (TIPOS_ETIQUETA.includes(tipo) ? tipo : actual.tipo) : actual.tipo;
    if (tipoNorm === 'escalar_campania' && !(campaniaId ?? actual.campaniaId)) {
      return res.status(400).json({ success: false, message: 'Selecciona una campaña para este tipo de etiqueta' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('textoEs', sql.NVarChar, textoEs !== undefined ? textoEs.trim() : actual.textoEs)
      .input('textoEn', sql.NVarChar, textoEn !== undefined ? (textoEn || null) : actual.textoEn)
      .input('tipo', sql.NVarChar, tipoNorm)
      .input('campaniaId', sql.Int, tipoNorm === 'escalar_campania' ? (campaniaId ?? actual.campaniaId) : null)
      .input('grupoId', sql.Int, tipoNorm === 'escalar_campania' ? (grupoId !== undefined ? grupoId : actual.grupoId) : null)
      .input('orden', sql.Int, Number.isFinite(orden) ? orden : actual.orden)
      .input('activa', sql.Bit, activa !== undefined ? !!activa : actual.activa)
      .query(`
        UPDATE dbo.CHATBOT_ETIQUETAS_MENU
        SET ETQ_TEXTO_ES = @textoEs, ETQ_TEXTO_EN = @textoEn, ETQ_TIPO = @tipo,
            ETQ_CAMPANIA_ID = @campaniaId, ETQ_GRUPO_ID = @grupoId, ETQ_ORDEN = @orden, ETQ_ACTIVA = @activa
        WHERE ETQ_ID = @id
      `);

    const actualizada = await pool.request().input('id', sql.Int, id)
      .query(`${SELECT_ETIQUETA} WHERE e.ETQ_ID = @id`);
    res.json({ success: true, data: actualizada.recordset[0] });
  } catch (error) {
    console.error('Error actualizando etiqueta del menú del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEtiquetaMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const del = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM dbo.CHATBOT_ETIQUETAS_MENU OUTPUT DELETED.ETQ_ID as id WHERE ETQ_ID = @id');
    if (del.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Etiqueta no encontrada' });
    }
    res.json({ success: true, message: 'Etiqueta eliminada' });
  } catch (error) {
    console.error('Error eliminando etiqueta del menú del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Leads capturados por el chatbot — oportunidades del CRM etiquetadas 'chatbot-web'
// (ver crmLeadMarketingController.recibirLeadChatbot). No es una tabla propia del
// chatbot; se lee directo de CRM_OPORTUNIDADES para no duplicar el dato.
exports.getLeads = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        o.OPO_ID as id,
        o.OPO_NOMBRE as nombre,
        c.CONT_NOMBRE as contactoNombre,
        c.CONT_EMPRESA as contactoEmpresa,
        c.CONT_CORREO as contactoEmail,
        c.CONT_TELEFONO as contactoTelefono,
        c.CONT_CARGO as contactoCargo,
        o.OPO_ETAPA as etapa,
        o.OPO_VALOR as valor,
        o.OPO_NOTAS as notas,
        o.OPO_FECHA as fecha
      FROM dbo.CRM_OPORTUNIDADES o
      LEFT JOIN dbo.CRM_CONTACTOS c ON c.CONT_ID = o.OPO_CONTACTO_ID
      WHERE o.OPO_ACTIVO = 1 AND o.OPO_TAGS LIKE '%chatbot-web%'
      ORDER BY o.OPO_FECHA DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo leads del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
