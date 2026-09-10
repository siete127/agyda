const sql = require('mssql');
const databaseService = require('../services/databaseService');

const TIPOS_NODO = ['respuesta', 'etiqueta', 'nodo_arbol'];
const TIPOS_DESTINO = ['respuesta', 'etiqueta', 'nodo_arbol', 'campania'];

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

const normFlujo = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Deriva las conexiones que el widget hoy sigue por convención (sin leer
// CHATBOT_FLUJO_CONEXIONES): etiqueta -> su campaña / al nodo inicio del árbol /
// a la respuesta que matchea su texto; RESP_BOTONES (texto libre) -> la
// respuesta que matchea por keyword; RESP_SENAL_INTERES -> captura de lead.
// `manualPairs` = pares origen->destino ya fijados a mano, que ganan.
function derivarConexionesAutomaticas({ respsData, etiquetas, nodoInicio, manualPairs }) {
  const matchRespuesta = (texto) => {
    const tn = normFlujo(texto);
    if (!tn) return null;
    let mejor = null; let mejorLen = 0;
    for (const r of respsData) {
      for (const kw of r.keywords) {
        const kn = normFlujo(kw);
        if (kn && tn.includes(kn) && kn.length > mejorLen) { mejorLen = kn.length; mejor = r; }
      }
    }
    return mejor;
  };

  const auto = [];
  const push = (origenTipo, origenId, destinoTipo, destinoId, etiqueta) => {
    if (destinoId == null) return;
    const key = `${origenTipo}:${origenId}->${destinoTipo}:${destinoId}`;
    if (manualPairs.has(key)) return;
    auto.push({
      id: `auto-${auto.length}-${key}`,
      origenTipo, origenId, destinoTipo, destinoId,
      etiqueta: etiqueta || null,
      esAutomatica: true,
    });
  };

  for (const e of etiquetas) {
    if (e.tipoAccion === 'escalar_campania' && e.campaniaId != null) {
      push('etiqueta', e.id, 'campania', e.campaniaId);
    } else if (e.tipoAccion === 'arbol_diagnostico' && nodoInicio) {
      push('etiqueta', e.id, 'nodo_arbol', nodoInicio.id);
    } else if (e.tipoAccion === 'respuesta') {
      const r = matchRespuesta(e.texto);
      if (r) push('etiqueta', e.id, 'respuesta', r.id);
    }
  }

  for (const r of respsData) {
    if (r.senalInteres) push('respuesta', r.id, 'captura_lead', 0, 'pide datos de contacto');
    for (const bt of r.botones) {
      const destino = matchRespuesta(bt);
      if (destino && destino.id !== r.id) push('respuesta', r.id, 'respuesta', destino.id, bt);
    }
  }

  return auto;
}

// Carga cruda de todo lo que el canvas y la derivación necesitan.
async function cargarFlujoCrudo(pool) {
  const [respuestas, etiquetas, nodosArbol, opcionesArbol, campanias, conexiones] = await Promise.all([
    pool.request().query(`
      SELECT RESP_PK as id, RESP_ID as codigo, RESP_TEXTO_ES as texto, RESP_BOTONES as botones,
             RESP_KEYWORDS as keywords, RESP_SENAL_INTERES as senalInteres,
             RESP_ACTIVA as activa, RESP_POS_X as posX, RESP_POS_Y as posY
      FROM dbo.CHATBOT_RESPUESTAS ORDER BY RESP_PK`),
    pool.request().query(`
      SELECT ETQ_ID as id, ETQ_TEXTO_ES as texto, ETQ_TIPO as tipoAccion, ETQ_CAMPANIA_ID as campaniaId,
             ETQ_ACTIVA as activa, ETQ_POS_X as posX, ETQ_POS_Y as posY
      FROM dbo.CHATBOT_ETIQUETAS_MENU ORDER BY ETQ_ID`),
    pool.request().query(`
      SELECT NODO_ID as id, NODO_CODIGO as codigo, NODO_TEXTO as texto, NODO_TIPO as tipoNodo,
             NODO_ACTIVO as activa, NODO_POS_X as posX, NODO_POS_Y as posY
      FROM dbo.CHATBOT_NODOS ORDER BY NODO_ID`),
    pool.request().query(`
      SELECT OPC_ID as id, OPC_NODO_ID as nodoId, OPC_TEXTO_BOTON as texto, OPC_NODO_DESTINO_ID as nodoDestinoId
      FROM dbo.CHATBOT_NODO_OPCIONES`),
    pool.request().query(`
      SELECT CM2_ID as id, CM2_NOMBRE as texto, CM2_ACTIVO as activa
      FROM dbo.CCO_CAMPANIAS WHERE CM2_ACTIVO = 1 ORDER BY CM2_NOMBRE`),
    pool.request().query(`
      SELECT FCX_ID as id, FCX_ORIGEN_TIPO as origenTipo, FCX_ORIGEN_ID as origenId,
             FCX_DESTINO_TIPO as destinoTipo, FCX_DESTINO_ID as destinoId, FCX_ETIQUETA as etiqueta
      FROM dbo.CHATBOT_FLUJO_CONEXIONES`),
  ]);

  const respsData = respuestas.recordset.map((r) => ({
    ...r, botones: parseJsonArray(r.botones), keywords: parseJsonArray(r.keywords),
  }));

  return {
    respsData,
    etiquetas: etiquetas.recordset,
    nodosArbol: nodosArbol.recordset,
    opcionesArbol: opcionesArbol.recordset,
    campanias: campanias.recordset,
    conexiones: conexiones.recordset,
    nodoInicio: nodosArbol.recordset.find((n) => n.codigo === 'inicio') || null,
  };
}

// Vista combinada de todo lo que puede aparecer como caja en el canvas: las
// respuestas del diccionario, las etiquetas del menú del widget, los nodos
// del árbol de diagnóstico, y las campañas de Chat en Vivo (solo lectura,
// como destino terminal — no se editan desde acá). Cada uno mantiene su
// propia tabla; esto solo los junta para dibujar el lienzo.
exports.getFlujo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const crudo = await cargarFlujoCrudo(pool);

    // Opciones del árbol = conexiones nativas de esa tabla, homologadas.
    const conexionesDesdeArbol = crudo.opcionesArbol
      .filter((o) => o.nodoDestinoId != null)
      .map((o) => ({
        id: `opcion-${o.id}`,
        origenTipo: 'nodo_arbol', origenId: o.nodoId,
        destinoTipo: 'nodo_arbol', destinoId: o.nodoDestinoId,
        etiqueta: o.texto, esOpcionArbol: true,
      }));

    const manualPairs = new Set(
      crudo.conexiones.map((c) => `${c.origenTipo}:${c.origenId}->${c.destinoTipo}:${c.destinoId}`),
    );
    const auto = derivarConexionesAutomaticas({
      respsData: crudo.respsData,
      etiquetas: crudo.etiquetas,
      nodoInicio: crudo.nodoInicio,
      manualPairs,
    });

    // Respuestas que ningún nodo alcanza — no es un error: son puntos de
    // entrada (el visitante llega escribiendo una de sus palabras clave).
    const alcanzadas = new Set();
    for (const c of [...crudo.conexiones, ...auto]) {
      if (c.destinoTipo === 'respuesta') alcanzadas.add(c.destinoId);
    }

    res.json({
      success: true,
      data: {
        respuestas: crudo.respsData.map(({ keywords, ...r }) => ({
          ...r,
          esEntrada: !alcanzadas.has(r.id),
        })),
        etiquetas: crudo.etiquetas,
        nodosArbol: crudo.nodosArbol,
        campanias: crudo.campanias,
        capturaLead: auto.some((c) => c.destinoTipo === 'captura_lead'),
        automaticasPendientes: auto.filter((c) => c.destinoTipo !== 'captura_lead').length,
        conexiones: [...crudo.conexiones, ...conexionesDesdeArbol, ...auto],
      },
    });
  } catch (error) {
    console.error('Error obteniendo el flujo visual del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /flujo/materializar — persiste las conexiones automáticas en
// CHATBOT_FLUJO_CONEXIONES para que el admin las pueda editar/borrar y el
// widget las obedezca. Idempotente (la UNIQUE evita duplicados). No persiste
// las de captura de lead (el CHECK de FCX_DESTINO_TIPO no la permite y además
// es una propiedad de la respuesta, no un enlace).
exports.materializarFlujo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const crudo = await cargarFlujoCrudo(pool);
    const manualPairs = new Set(
      crudo.conexiones.map((c) => `${c.origenTipo}:${c.origenId}->${c.destinoTipo}:${c.destinoId}`),
    );
    const auto = derivarConexionesAutomaticas({
      respsData: crudo.respsData, etiquetas: crudo.etiquetas, nodoInicio: crudo.nodoInicio, manualPairs,
    }).filter((c) => ['respuesta', 'etiqueta', 'nodo_arbol', 'campania'].includes(c.destinoTipo));

    let creadas = 0;
    for (const c of auto) {
      const r = await pool.request()
        .input('ot', sql.NVarChar(20), c.origenTipo)
        .input('oi', sql.Int, c.origenId)
        .input('dt', sql.NVarChar(20), c.destinoTipo)
        .input('di', sql.Int, c.destinoId)
        .input('et', sql.NVarChar(150), c.etiqueta ? String(c.etiqueta).slice(0, 150) : null)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.CHATBOT_FLUJO_CONEXIONES
            WHERE FCX_ORIGEN_TIPO=@ot AND FCX_ORIGEN_ID=@oi AND FCX_DESTINO_TIPO=@dt AND FCX_DESTINO_ID=@di
          )
          INSERT INTO dbo.CHATBOT_FLUJO_CONEXIONES (FCX_ORIGEN_TIPO, FCX_ORIGEN_ID, FCX_DESTINO_TIPO, FCX_DESTINO_ID, FCX_ETIQUETA)
          VALUES (@ot, @oi, @dt, @di, @et);
          SELECT @@ROWCOUNT as n;
        `);
      creadas += r.recordset[0].n;
    }
    res.json({ success: true, data: { creadas, total: auto.length } });
  } catch (error) {
    console.error('Error materializando el flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const TABLA_POR_TIPO = {
  respuesta: { tabla: 'dbo.CHATBOT_RESPUESTAS', idCol: 'RESP_PK', xCol: 'RESP_POS_X', yCol: 'RESP_POS_Y' },
  etiqueta: { tabla: 'dbo.CHATBOT_ETIQUETAS_MENU', idCol: 'ETQ_ID', xCol: 'ETQ_POS_X', yCol: 'ETQ_POS_Y' },
  nodo_arbol: { tabla: 'dbo.CHATBOT_NODOS', idCol: 'NODO_ID', xCol: 'NODO_POS_X', yCol: 'NODO_POS_Y' },
};

// Guarda la posición de una caja tras soltarla en el canvas — se llama en
// cada "drag stop", no en cada frame del arrastre.
exports.updatePosicion = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { posX, posY } = req.body;
    const info = TABLA_POR_TIPO[tipo];
    if (!info) return res.status(400).json({ success: false, message: 'Tipo de nodo inválido' });
    if (typeof posX !== 'number' || typeof posY !== 'number') {
      return res.status(400).json({ success: false, message: 'posX y posY son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('x', sql.Float, posX)
      .input('y', sql.Float, posY)
      .query(`UPDATE ${info.tabla} SET ${info.xCol} = @x, ${info.yCol} = @y WHERE ${info.idCol} = @id`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando posición del flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

async function existeNodo(pool, tipo, id) {
  if (tipo === 'campania') {
    const r = await pool.request().input('id', sql.Int, id).query('SELECT 1 FROM dbo.CCO_CAMPANIAS WHERE CM2_ID = @id');
    return r.recordset.length > 0;
  }
  const info = TABLA_POR_TIPO[tipo];
  if (!info) return false;
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT 1 FROM ${info.tabla} WHERE ${info.idCol} = @id`);
  return r.recordset.length > 0;
}

// Crea la flecha de conexión al soltar un enlace entre dos cajas del canvas.
// Valida que ambos extremos existan de verdad — arrastrar a una caja borrada
// hace un instante (carrera entre pestañas) no debe dejar una conexión huérfana.
exports.createConexion = async (req, res) => {
  try {
    const { origenTipo, origenId, destinoTipo, destinoId, etiqueta } = req.body;
    if (!TIPOS_NODO.includes(origenTipo) || !TIPOS_DESTINO.includes(destinoTipo)) {
      return res.status(400).json({ success: false, message: 'Tipo de origen o destino inválido' });
    }
    if (!origenId || !destinoId) {
      return res.status(400).json({ success: false, message: 'origenId y destinoId son requeridos' });
    }
    if (origenTipo === destinoTipo && Number(origenId) === Number(destinoId)) {
      return res.status(400).json({ success: false, message: 'Un nodo no puede conectarse a sí mismo' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const [origenOk, destinoOk] = await Promise.all([
      existeNodo(pool, origenTipo, origenId),
      existeNodo(pool, destinoTipo, destinoId),
    ]);
    if (!origenOk || !destinoOk) {
      return res.status(404).json({ success: false, message: 'El origen o el destino ya no existe' });
    }

    const ins = await pool.request()
      .input('origenTipo', sql.NVarChar, origenTipo)
      .input('origenId', sql.Int, origenId)
      .input('destinoTipo', sql.NVarChar, destinoTipo)
      .input('destinoId', sql.Int, destinoId)
      .input('etiqueta', sql.NVarChar, etiqueta || null)
      .query(`
        INSERT INTO dbo.CHATBOT_FLUJO_CONEXIONES (FCX_ORIGEN_TIPO, FCX_ORIGEN_ID, FCX_DESTINO_TIPO, FCX_DESTINO_ID, FCX_ETIQUETA)
        OUTPUT INSERTED.FCX_ID as id
        VALUES (@origenTipo, @origenId, @destinoTipo, @destinoId, @etiqueta)
      `);
    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (error) {
    if (String(error.message || '').includes('UQ_CHATBOT_FCX')) {
      return res.status(409).json({ success: false, message: 'Esa conexión ya existe' });
    }
    console.error('Error creando conexión del flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteConexion = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const del = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM dbo.CHATBOT_FLUJO_CONEXIONES OUTPUT DELETED.FCX_ID as id WHERE FCX_ID = @id');
    if (del.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Conexión no encontrada' });
    }
    res.json({ success: true, message: 'Conexión eliminada' });
  } catch (error) {
    console.error('Error eliminando conexión del flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   CREAR / EDITAR / BORRAR CAJAS DESDE EL CANVAS (Camino A)
   Cada "tipo" sigue viviendo en su tabla; estos endpoints
   son la fachada para hacerlo sin salir del lienzo.
════════════════════════════════════════════════════════ */

function slugFlujo(texto) {
  const base = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return base || 'nodo';
}

// POST /flujo/nodos  { tipo, texto, textoEn?, keywords?, tipoAccion?, campaniaId?, tipoNodo?, posX, posY }
exports.createNodo = async (req, res) => {
  try {
    const { tipo, texto, textoEn, keywords, tipoAccion, campaniaId, tipoNodo, posX, posY } = req.body || {};
    if (!TIPOS_NODO.includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo de nodo inválido' });
    }
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ success: false, message: 'El texto del nodo es requerido' });
    }
    const x = typeof posX === 'number' ? posX : 0;
    const y = typeof posY === 'number' ? posY : 0;
    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipo === 'respuesta') {
      const kws = Array.isArray(keywords) && keywords.length ? keywords : [String(texto).trim().slice(0, 40)];
      let idTec = slugFlujo(texto);
      for (let n = 2; n <= 50; n += 1) {
        const dupe = await pool.request().input('id', sql.NVarChar, idTec)
          .query('SELECT 1 FROM dbo.CHATBOT_RESPUESTAS WHERE RESP_ID = @id');
        if (dupe.recordset.length === 0) break;
        idTec = `${slugFlujo(texto)}_${n}`;
      }
      const ins = await pool.request()
        .input('id', sql.NVarChar, idTec)
        .input('titulo', sql.NVarChar, String(texto).trim().slice(0, 120))
        .input('keywords', sql.NVarChar, JSON.stringify(kws))
        .input('textoEs', sql.NVarChar, String(texto).trim())
        .input('textoEn', sql.NVarChar, textoEn || null)
        .input('x', sql.Float, x).input('y', sql.Float, y)
        .query(`
          INSERT INTO dbo.CHATBOT_RESPUESTAS (RESP_ID, RESP_TITULO, RESP_KEYWORDS, RESP_TEXTO_ES, RESP_TEXTO_EN, RESP_BOTONES, RESP_ACTIVA, RESP_POS_X, RESP_POS_Y)
          OUTPUT INSERTED.RESP_PK as id
          VALUES (@id, @titulo, @keywords, @textoEs, @textoEn, '[]', 1, @x, @y)
        `);
      return res.status(201).json({ success: true, data: { tipo, id: ins.recordset[0].id } });
    }

    if (tipo === 'etiqueta') {
      const accion = TIPOS_DESTINO.includes(tipoAccion) || ['respuesta', 'escalar_campania', 'escalar_generico', 'arbol_diagnostico'].includes(tipoAccion)
        ? tipoAccion : 'respuesta';
      const ins = await pool.request()
        .input('textoEs', sql.NVarChar, String(texto).trim().slice(0, 150))
        .input('textoEn', sql.NVarChar, textoEn || null)
        .input('tipo', sql.NVarChar, accion)
        .input('campaniaId', sql.Int, accion === 'escalar_campania' && campaniaId ? Number(campaniaId) : null)
        .input('x', sql.Float, x).input('y', sql.Float, y)
        .query(`
          INSERT INTO dbo.CHATBOT_ETIQUETAS_MENU (ETQ_TEXTO_ES, ETQ_TEXTO_EN, ETQ_TIPO, ETQ_CAMPANIA_ID, ETQ_ORDEN, ETQ_ACTIVA, ETQ_POS_X, ETQ_POS_Y)
          OUTPUT INSERTED.ETQ_ID as id
          VALUES (@textoEs, @textoEn, @tipo, @campaniaId, (SELECT ISNULL(MAX(ETQ_ORDEN),0)+1 FROM dbo.CHATBOT_ETIQUETAS_MENU), 1, @x, @y)
        `);
      return res.status(201).json({ success: true, data: { tipo, id: ins.recordset[0].id } });
    }

    // tipo === 'nodo_arbol'
    const nodoTipo = ['pregunta', 'mensaje', 'escalar_chat', 'crear_ticket'].includes(tipoNodo) ? tipoNodo : 'pregunta';
    let codigo = slugFlujo(texto);
    for (let n = 2; n <= 50; n += 1) {
      const dupe = await pool.request().input('c', sql.NVarChar, codigo)
        .query('SELECT 1 FROM dbo.CHATBOT_NODOS WHERE NODO_CODIGO = @c');
      if (dupe.recordset.length === 0) break;
      codigo = `${slugFlujo(texto)}_${n}`;
    }
    const ins = await pool.request()
      .input('codigo', sql.NVarChar, codigo)
      .input('texto', sql.NVarChar, String(texto).trim())
      .input('tipo', sql.NVarChar, nodoTipo)
      .input('x', sql.Float, x).input('y', sql.Float, y)
      .query(`
        INSERT INTO dbo.CHATBOT_NODOS (NODO_CODIGO, NODO_TEXTO, NODO_TIPO, NODO_ACTIVO, NODO_POS_X, NODO_POS_Y)
        OUTPUT INSERTED.NODO_ID as id
        VALUES (@codigo, @texto, @tipo, 1, @x, @y)
      `);
    return res.status(201).json({ success: true, data: { tipo, id: ins.recordset[0].id } });
  } catch (error) {
    console.error('Error creando nodo del flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /flujo/nodos/:tipo/:id  — edición inline del contenido de una caja.
exports.updateNodo = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { texto, textoEn, keywords, tipoAccion, campaniaId, tipoNodo, activa } = req.body || {};
    if (!TIPOS_NODO.includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo de nodo inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipo === 'respuesta') {
      const sets = [];
      const rq = pool.request().input('id', sql.Int, id);
      if (texto != null) { sets.push('RESP_TEXTO_ES = @texto', 'RESP_TITULO = @titulo'); rq.input('texto', sql.NVarChar, String(texto)).input('titulo', sql.NVarChar, String(texto).trim().slice(0, 120)); }
      if (textoEn !== undefined) { sets.push('RESP_TEXTO_EN = @textoEn'); rq.input('textoEn', sql.NVarChar, textoEn || null); }
      if (Array.isArray(keywords)) { sets.push('RESP_KEYWORDS = @kw'); rq.input('kw', sql.NVarChar, JSON.stringify(keywords)); }
      if (activa !== undefined) { sets.push('RESP_ACTIVA = @activa'); rq.input('activa', sql.Bit, activa !== false); }
      if (!sets.length) return res.json({ success: true });
      sets.push('RESP_FECHA_ACTUALIZACION = GETDATE()');
      await rq.query(`UPDATE dbo.CHATBOT_RESPUESTAS SET ${sets.join(', ')} WHERE RESP_PK = @id`);
      return res.json({ success: true });
    }

    if (tipo === 'etiqueta') {
      const sets = [];
      const rq = pool.request().input('id', sql.Int, id);
      if (texto != null) { sets.push('ETQ_TEXTO_ES = @texto'); rq.input('texto', sql.NVarChar, String(texto).slice(0, 150)); }
      if (textoEn !== undefined) { sets.push('ETQ_TEXTO_EN = @textoEn'); rq.input('textoEn', sql.NVarChar, textoEn || null); }
      if (tipoAccion != null && ['respuesta', 'escalar_campania', 'escalar_generico', 'arbol_diagnostico'].includes(tipoAccion)) {
        sets.push('ETQ_TIPO = @tipo'); rq.input('tipo', sql.NVarChar, tipoAccion);
        sets.push('ETQ_CAMPANIA_ID = @camp');
        rq.input('camp', sql.Int, tipoAccion === 'escalar_campania' && campaniaId ? Number(campaniaId) : null);
      } else if (campaniaId !== undefined) {
        sets.push('ETQ_CAMPANIA_ID = @camp'); rq.input('camp', sql.Int, campaniaId ? Number(campaniaId) : null);
      }
      if (activa !== undefined) { sets.push('ETQ_ACTIVA = @activa'); rq.input('activa', sql.Bit, activa !== false); }
      if (!sets.length) return res.json({ success: true });
      await rq.query(`UPDATE dbo.CHATBOT_ETIQUETAS_MENU SET ${sets.join(', ')} WHERE ETQ_ID = @id`);
      return res.json({ success: true });
    }

    // nodo_arbol
    const sets = [];
    const rq = pool.request().input('id', sql.Int, id);
    if (texto != null) { sets.push('NODO_TEXTO = @texto'); rq.input('texto', sql.NVarChar, String(texto)); }
    if (tipoNodo != null && ['pregunta', 'mensaje', 'escalar_chat', 'crear_ticket'].includes(tipoNodo)) {
      sets.push('NODO_TIPO = @tipo'); rq.input('tipo', sql.NVarChar, tipoNodo);
    }
    if (activa !== undefined) { sets.push('NODO_ACTIVO = @activa'); rq.input('activa', sql.Bit, activa !== false); }
    if (!sets.length) return res.json({ success: true });
    await rq.query(`UPDATE dbo.CHATBOT_NODOS SET ${sets.join(', ')} WHERE NODO_ID = @id`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error editando nodo del flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /flujo/nodos/:tipo/:id — borra la caja y sus conexiones (salientes y
// entrantes) del canvas. El nodo 'inicio' del árbol no se puede borrar.
exports.deleteNodo = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const info = TABLA_POR_TIPO[tipo];
    if (!info) return res.status(400).json({ success: false, message: 'Tipo de nodo inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipo === 'nodo_arbol') {
      const esInicio = await pool.request().input('id', sql.Int, id)
        .query("SELECT 1 FROM dbo.CHATBOT_NODOS WHERE NODO_ID = @id AND NODO_CODIGO = 'inicio'");
      if (esInicio.recordset.length) {
        return res.status(400).json({ success: false, message: 'El nodo de inicio del árbol no se puede eliminar' });
      }
    }

    // conexiones del canvas donde este nodo es origen o destino
    await pool.request()
      .input('tipo', sql.NVarChar, tipo).input('id', sql.Int, id)
      .query(`DELETE FROM dbo.CHATBOT_FLUJO_CONEXIONES
              WHERE (FCX_ORIGEN_TIPO = @tipo AND FCX_ORIGEN_ID = @id)
                 OR (FCX_DESTINO_TIPO = @tipo AND FCX_DESTINO_ID = @id)`);

    if (tipo === 'nodo_arbol') {
      // opciones nativas del árbol que salen de o apuntan a este nodo
      await pool.request().input('id', sql.Int, id)
        .query('DELETE FROM dbo.CHATBOT_NODO_OPCIONES WHERE OPC_NODO_ID = @id OR OPC_NODO_DESTINO_ID = @id');
    }

    const del = await pool.request().input('id', sql.Int, id)
      .query(`DELETE FROM ${info.tabla} OUTPUT DELETED.${info.idCol} as id WHERE ${info.idCol} = @id`);
    if (del.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Nodo no encontrado' });
    }
    res.json({ success: true, message: 'Nodo eliminado' });
  } catch (error) {
    console.error('Error eliminando nodo del flujo del chatbot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
