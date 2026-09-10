const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

const SELECT_RESPUESTA = `
  SELECT
    RESP_PK as pk,
    RESP_ID as id,
    RESP_TITULO as titulo,
    RESP_CATEGORIA as categoria,
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

// Genera un id técnico (slug) a partir del título — el usuario ya no lo escribe.
// Colisiona -> se le agrega un sufijo numérico en createRespuesta.
function slugify(texto) {
  const sinAcentos = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return sinAcentos.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'respuesta';
}

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
    // El token ya no vive en la campaña (LIVECHAT_CAMPANIAS.LCA_TOKEN): en
    // Omnicanal el token es del CANAL 'web_publica' que apunta a esa campaña
    // (CCO_CANALES.CN_VERIFY_TOKEN) — una campaña puede no tener canal web
    // asignado todavía, de ahí el LEFT JOIN doble.
    idsEtiqueta.length ? pool.request().query(`SELECT e.ETQ_ID as id, e.ETQ_TEXTO_ES as textoEs, e.ETQ_TEXTO_EN as textoEn, e.ETQ_TIPO as tipo, e.ETQ_CAMPANIA_ID as campaniaId, e.ETQ_GRUPO_ID as grupoId, cn.CN_VERIFY_TOKEN as campaniaToken FROM dbo.CHATBOT_ETIQUETAS_MENU e LEFT JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = e.ETQ_CAMPANIA_ID LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_CAMPANIA_ID = c.CM2_ID AND cn.CN_TIPO = 'web_publica' AND cn.CN_HABILITADO = 1 WHERE e.ETQ_ID IN (${idsEtiqueta.join(',')}) AND e.ETQ_ACTIVA = 1`) : { recordset: [] },
    idsCampania.length ? pool.request().query(`SELECT c.CM2_ID as id, c.CM2_NOMBRE as textoBoton, cn.CN_VERIFY_TOKEN as token FROM dbo.CCO_CAMPANIAS c LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_CAMPANIA_ID = c.CM2_ID AND cn.CN_TIPO = 'web_publica' AND cn.CN_HABILITADO = 1 WHERE c.CM2_ID IN (${idsCampania.join(',')}) AND c.CM2_ACTIVO = 1`) : { recordset: [] },
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
    const { id, titulo, categoria, keywords, textoEs, textoEn, botones, senalInteres, orden } = req.body;

    if (!textoEs || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: textoEs, keywords (arreglo no vacío)' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // El id técnico ya no lo escribe el usuario: se autogenera del título (o del
    // texto si no hay título). Si colisiona, se le agrega -2, -3…
    const base = slugify(id || titulo || textoEs);
    let idFinal = base;
    for (let n = 2; n <= 50; n += 1) {
      const dupe = await pool.request()
        .input('id', sql.NVarChar, idFinal)
        .query('SELECT RESP_PK FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_ID = @id');
      if (dupe.recordset.length === 0) break;
      idFinal = `${base}_${n}`;
    }

    const result = await pool.request()
      .input('id', sql.NVarChar, idFinal)
      .input('titulo', sql.NVarChar, (titulo || '').trim().slice(0, 120) || null)
      .input('categoria', sql.NVarChar, (categoria || '').trim().slice(0, 60) || null)
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
          RESP_ID, RESP_TITULO, RESP_CATEGORIA, RESP_KEYWORDS, RESP_TEXTO_ES, RESP_TEXTO_EN, RESP_BOTONES,
          RESP_SENAL_INTERES, RESP_ORDEN, RESP_AUTOR_ID, RESP_AUTOR_NOMBRE,
          RESP_FECHA_CREACION, RESP_ACTIVA
        )
        VALUES (
          @id, @titulo, @categoria, @keywords, @textoEs, @textoEn, @botones,
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

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'chatbot', accion: 'crear', entidadId: idFinal, detalle: { id: idFinal }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando respuesta del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateRespuesta = async (req, res) => {
  try {
    const { pk } = req.params;
    const { id, titulo, categoria, keywords, textoEs, textoEn, botones, senalInteres, orden, activa } = req.body;

    if (!textoEs || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: textoEs, keywords (arreglo no vacío)' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('pk', sql.Int, pk)
      .query('SELECT RESP_PK, RESP_ID FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_PK = @pk');
    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Respuesta no encontrada' });
    }

    // El id técnico solo se toca si el cliente lo manda explícitamente (edición
    // avanzada); si no, se conserva el que ya tenía. El slug nunca se re-deriva
    // del título al editar — cambiar el id rompería enlaces del Flujo Visual.
    const idFinal = id ? slugify(id) : existing.recordset[0].RESP_ID;

    if (id) {
      const duplicada = await pool.request()
        .input('pk', sql.Int, pk)
        .input('id', sql.NVarChar, idFinal)
        .query('SELECT RESP_PK FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_ID = @id AND RESP_PK <> @pk');
      if (duplicada.recordset.length > 0) {
        return res.status(409).json({ success: false, message: `Ya existe otra respuesta con el id "${idFinal}"` });
      }
    }

    await pool.request()
      .input('pk', sql.Int, pk)
      .input('id', sql.NVarChar, idFinal)
      .input('titulo', sql.NVarChar, (titulo || '').trim().slice(0, 120) || null)
      .input('categoria', sql.NVarChar, (categoria || '').trim().slice(0, 60) || null)
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
          RESP_TITULO = @titulo,
          RESP_CATEGORIA = @categoria,
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

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'chatbot', accion: 'editar', entidadId: idFinal, detalle: { id: idFinal }, ip: req.ip });
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

// campaniaId apunta a CCO_CAMPANIAS (Omnicanal) — el token que el widget
// necesita para escalar directo a esa campaña vive en su canal 'web_publica'
// (CCO_CANALES.CN_VERIFY_TOKEN), no en la campaña misma, así que se resuelve
// con un segundo LEFT JOIN. Si la campaña no tiene canal web habilitado
// todavía, campaniaToken sale NULL y el widget cae al comportamiento
// genérico (ver ejecutarAccionBoton en el HTML público).
const SELECT_ETIQUETA = `
  SELECT
    e.ETQ_ID as id,
    e.ETQ_TEXTO_ES as textoEs,
    e.ETQ_TEXTO_EN as textoEn,
    e.ETQ_TIPO as tipo,
    e.ETQ_CAMPANIA_ID as campaniaId,
    c.CM2_NOMBRE as campaniaNombre,
    cn.CN_VERIFY_TOKEN as campaniaToken,
    e.ETQ_GRUPO_ID as grupoId,
    e.ETQ_ORDEN as orden,
    e.ETQ_ACTIVA as activa
  FROM dbo.CHATBOT_ETIQUETAS_MENU e
  LEFT JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = e.ETQ_CAMPANIA_ID
  LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_CAMPANIA_ID = c.CM2_ID AND cn.CN_TIPO = 'web_publica' AND cn.CN_HABILITADO = 1
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

/* ════════════════════════════════════════════════════════
   CATEGORÍAS Y CONFIG (Fase 1 reorg UX)
════════════════════════════════════════════════════════ */

// Lista de categorías en uso — para el selector del editor de respuestas.
exports.getCategorias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT RESP_CATEGORIA as categoria, COUNT(*) as total
      FROM dbo.CHATBOT_RESPUESTAS
      WHERE RESP_CATEGORIA IS NOT NULL AND LTRIM(RTRIM(RESP_CATEGORIA)) <> ''
      GROUP BY RESP_CATEGORIA
      ORDER BY RESP_CATEGORIA
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo categorías del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Defaults de la config del bot — se usan tanto para responder /config/publica
// cuando la tabla está vacía como de fallback en el widget.
const CONFIG_DEFAULTS = {
  saludoEs: '¡Hola! 👋 Soy el asistente virtual de ARDABYTEC. ¿En qué puedo ayudarte hoy?',
  saludoEn: "Hi! 👋 I'm ARDABYTEC's virtual assistant. How can I help you today?",
  turnosSinMatchParaEscalar: '3',
  sugerenciaEscalarEs: 'Parece que no estoy resolviendo tu duda. ¿Quieres hablar con un agente?',
  sugerenciaEscalarEn: "It seems I'm not solving your question. Would you like to talk to an agent?",
};

async function leerConfig(pool) {
  const rows = await pool.request().query('SELECT CFG_CLAVE, CFG_VALOR FROM dbo.CHATBOT_CONFIG');
  const cfg = { ...CONFIG_DEFAULTS };
  for (const r of rows.recordset) {
    if (r.CFG_VALOR != null) cfg[r.CFG_CLAVE] = r.CFG_VALOR;
  }
  return cfg;
}

// Lectura pública: el widget la consulta al iniciar. Nunca falla con 500 —
// si algo sale mal devuelve los defaults, para no dejar el chat sin saludo.
exports.getConfigPublica = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const pool = await databaseService.getPool(req.user?.empresa);
    res.json({ success: true, data: await leerConfig(pool) });
  } catch (error) {
    console.warn('Config pública del chatbot no disponible, se devuelven defaults:', error.message);
    res.json({ success: true, data: CONFIG_DEFAULTS });
  }
};

// Lectura administrativa (igual que la pública por ahora, separada para poder
// agregar campos internos después sin exponerlos al widget).
exports.getConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    res.json({ success: true, data: await leerConfig(pool) });
  } catch (error) {
    console.error('Error obteniendo config del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Guarda un subconjunto de claves (merge, no reemplazo total).
exports.updateConfig = async (req, res) => {
  try {
    const cambios = req.body && typeof req.body === 'object' ? req.body : {};
    const clavesValidas = Object.keys(CONFIG_DEFAULTS);
    const pool = await databaseService.getPool(req.user?.empresa);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (!clavesValidas.includes(clave)) continue;
      await pool.request()
        .input('clave', sql.NVarChar(60), clave)
        .input('valor', sql.NVarChar(sql.MAX), valor == null ? null : String(valor))
        .query(`
          MERGE dbo.CHATBOT_CONFIG AS t
          USING (SELECT @clave AS c) AS s ON t.CFG_CLAVE = s.c
          WHEN MATCHED THEN UPDATE SET CFG_VALOR = @valor, CFG_FECHA = GETDATE()
          WHEN NOT MATCHED THEN INSERT (CFG_CLAVE, CFG_VALOR) VALUES (@clave, @valor);
        `);
    }
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'chatbot', accion: 'config', detalle: cambios, ip: req.ip });
    res.json({ success: true, data: await leerConfig(pool) });
  } catch (error) {
    console.error('Error guardando config del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   FEEDBACK Y PREGUNTAS SIN MATCH (Fase 2)
   Endpoints públicos que el widget dispara fire-and-forget —
   nunca deben tumbar la conversación, por eso todos responden
   200 aunque algo falle internamente.
════════════════════════════════════════════════════════ */

// El visitante toca 👍/👎 bajo una respuesta enlatada.
exports.postFeedback = async (req, res) => {
  try {
    const respPk = parseInt(req.body?.respuestaPk, 10);
    const util = req.body?.util === true || req.body?.util === 'true' || req.body?.util === 1;
    const sesion = typeof req.body?.sesionToken === 'string' ? req.body.sesionToken.slice(0, 80) : null;
    if (!Number.isFinite(respPk)) return res.json({ success: true });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('pk', sql.Int, respPk)
      .input('sesion', sql.NVarChar(80), sesion)
      .input('util', sql.Bit, util)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_PK = @pk)
          INSERT INTO dbo.CHATBOT_FEEDBACK (FBK_RESP_PK, FBK_SESION_TOKEN, FBK_UTIL) VALUES (@pk, @sesion, @util);
      `);
    res.json({ success: true });
  } catch (error) {
    console.warn('Feedback del chatbot no registrado:', error.message);
    res.json({ success: true });
  }
};

// Pregunta que no hizo match con ninguna respuesta. UPSERT por texto normalizado
// (minúsculas, sin acentos, sin signos, colapsando espacios).
function normalizarPregunta(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\wñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

exports.postSinMatch = async (req, res) => {
  try {
    const textoEjemplo = typeof req.body?.texto === 'string' ? req.body.texto.trim().slice(0, 500) : '';
    const norm = normalizarPregunta(textoEjemplo);
    if (norm.length < 3) return res.json({ success: true });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('norm', sql.NVarChar(300), norm)
      .input('ejemplo', sql.NVarChar(500), textoEjemplo)
      .query(`
        MERGE dbo.CHATBOT_SIN_MATCH AS t
        USING (SELECT @norm AS n) AS s ON t.SNM_TEXTO_NORM = s.n
        WHEN MATCHED THEN UPDATE SET SNM_VECES = SNM_VECES + 1, SNM_ULTIMA_FECHA = GETDATE()
        WHEN NOT MATCHED THEN INSERT (SNM_TEXTO_NORM, SNM_TEXTO_EJEMPLO) VALUES (@norm, @ejemplo);
      `);
    res.json({ success: true });
  } catch (error) {
    console.warn('Pregunta sin match no registrada:', error.message);
    res.json({ success: true });
  }
};

// Hito del embudo (abrio | interactuo | dio_dato | lead_enviado | escalo_humano | abrio_arbol).
const EVENTO_TIPOS = ['abrio', 'interactuo', 'dio_dato', 'lead_enviado', 'escalo_humano', 'abrio_arbol'];

exports.postEvento = async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || '');
    const sesion = typeof req.body?.sesionToken === 'string' ? req.body.sesionToken.slice(0, 80) : null;
    if (!EVENTO_TIPOS.includes(tipo) || !sesion) return res.json({ success: true });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('sesion', sql.NVarChar(80), sesion)
      .input('tipo', sql.NVarChar(30), tipo)
      .query('INSERT INTO dbo.CHATBOT_EVENTOS (EVT_SESION_TOKEN, EVT_TIPO) VALUES (@sesion, @tipo)');
    res.json({ success: true });
  } catch (error) {
    console.warn('Evento del chatbot no registrado:', error.message);
    res.json({ success: true });
  }
};

// Panel de Rendimiento: embudo + respuestas ordenadas por 👎, + preguntas sin match.
exports.getRendimiento = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    // Embudo: sesiones DISTINCT por hito en los últimos 30 días.
    const embudoRows = await pool.request().query(`
      SELECT EVT_TIPO as tipo, COUNT(DISTINCT EVT_SESION_TOKEN) as sesiones
      FROM dbo.CHATBOT_EVENTOS
      WHERE EVT_FECHA >= DATEADD(DAY, -30, GETDATE())
      GROUP BY EVT_TIPO
    `);
    const porTipo = Object.fromEntries(embudoRows.recordset.map((r) => [r.tipo, r.sesiones]));
    const embudo = [
      { tipo: 'abrio', label: 'Abrieron el chat', sesiones: porTipo.abrio || 0 },
      { tipo: 'interactuo', label: 'Interactuaron', sesiones: porTipo.interactuo || 0 },
      { tipo: 'dio_dato', label: 'Dieron un dato', sesiones: porTipo.dio_dato || 0 },
      { tipo: 'lead_enviado', label: 'Lead enviado', sesiones: porTipo.lead_enviado || 0 },
    ];

    const respuestas = await pool.request().query(`
      SELECT
        r.RESP_PK as pk,
        r.RESP_ID as id,
        r.RESP_TITULO as titulo,
        r.RESP_CATEGORIA as categoria,
        r.RESP_ACTIVA as activa,
        SUM(CASE WHEN f.FBK_UTIL = 1 THEN 1 ELSE 0 END) as utiles,
        SUM(CASE WHEN f.FBK_UTIL = 0 THEN 1 ELSE 0 END) as noUtiles
      FROM dbo.CHATBOT_RESPUESTAS r
      LEFT JOIN dbo.CHATBOT_FEEDBACK f ON f.FBK_RESP_PK = r.RESP_PK
      GROUP BY r.RESP_PK, r.RESP_ID, r.RESP_TITULO, r.RESP_CATEGORIA, r.RESP_ACTIVA
      HAVING SUM(CASE WHEN f.FBK_UTIL IS NOT NULL THEN 1 ELSE 0 END) > 0
      ORDER BY noUtiles DESC, utiles ASC
    `);

    const sinMatch = await pool.request().query(`
      SELECT TOP 50
        SNM_ID as id, SNM_TEXTO_EJEMPLO as texto, SNM_VECES as veces,
        CONVERT(NVARCHAR(19), SNM_ULTIMA_FECHA, 126) as ultimaFecha
      FROM dbo.CHATBOT_SIN_MATCH
      WHERE SNM_RESUELTO = 0
      ORDER BY SNM_VECES DESC, SNM_ULTIMA_FECHA DESC
    `);

    res.json({ success: true, data: { embudo, respuestas: respuestas.recordset, sinMatch: sinMatch.recordset } });
  } catch (error) {
    console.error('Error obteniendo rendimiento del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Marca una pregunta sin match como resuelta (ya se le creó respuesta, o se descarta).
exports.resolverSinMatch = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id)
      .query('UPDATE dbo.CHATBOT_SIN_MATCH SET SNM_RESUELTO = 1 WHERE SNM_ID = @id');
    res.json({ success: true });
  } catch (error) {
    console.error('Error resolviendo pregunta sin match:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
