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

// Vista combinada de todo lo que puede aparecer como caja en el canvas: las
// respuestas del diccionario, las etiquetas del menú del widget, los nodos
// del árbol de diagnóstico, y las campañas de Chat en Vivo (solo lectura,
// como destino terminal — no se editan desde acá). Cada uno mantiene su
// propia tabla; esto solo los junta para dibujar el lienzo.
exports.getFlujo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const respuestas = await pool.request().query(`
      SELECT RESP_PK as id, RESP_ID as codigo, RESP_TEXTO_ES as texto, RESP_BOTONES as botones,
             RESP_ACTIVA as activa, RESP_POS_X as posX, RESP_POS_Y as posY
      FROM dbo.CHATBOT_RESPUESTAS ORDER BY RESP_PK
    `);
    const etiquetas = await pool.request().query(`
      SELECT ETQ_ID as id, ETQ_TEXTO_ES as texto, ETQ_TIPO as tipoAccion, ETQ_CAMPANIA_ID as campaniaId,
             ETQ_ACTIVA as activa, ETQ_POS_X as posX, ETQ_POS_Y as posY
      FROM dbo.CHATBOT_ETIQUETAS_MENU ORDER BY ETQ_ID
    `);
    const nodosArbol = await pool.request().query(`
      SELECT NODO_ID as id, NODO_CODIGO as codigo, NODO_TEXTO as texto, NODO_TIPO as tipoNodo,
             NODO_ACTIVO as activa, NODO_POS_X as posX, NODO_POS_Y as posY
      FROM dbo.CHATBOT_NODOS ORDER BY NODO_ID
    `);
    const opcionesArbol = await pool.request().query(`
      SELECT OPC_ID as id, OPC_NODO_ID as nodoId, OPC_TEXTO_BOTON as texto, OPC_NODO_DESTINO_ID as nodoDestinoId
      FROM dbo.CHATBOT_NODO_OPCIONES
    `);
    const campanias = await pool.request().query(`
      SELECT LCA_ID as id, LCA_NOMBRE as texto, LCA_ACTIVO as activa
      FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_ACTIVO = 1 ORDER BY LCA_NOMBRE
    `);
    const conexiones = await pool.request().query(`
      SELECT FCX_ID as id, FCX_ORIGEN_TIPO as origenTipo, FCX_ORIGEN_ID as origenId,
             FCX_DESTINO_TIPO as destinoTipo, FCX_DESTINO_ID as destinoId, FCX_ETIQUETA as etiqueta
      FROM dbo.CHATBOT_FLUJO_CONEXIONES
    `);

    // Las opciones del árbol ya son "conexiones" nativas de esa tabla — se
    // exponen homologadas junto a CHATBOT_FLUJO_CONEXIONES para que el canvas
    // dibuje una sola flecha por cada una, sin duplicar el dato en la tabla nueva.
    const conexionesDesdeArbol = opcionesArbol.recordset
      .filter((o) => o.nodoDestinoId != null)
      .map((o) => ({
        id: `opcion-${o.id}`,
        origenTipo: 'nodo_arbol',
        origenId: o.nodoId,
        destinoTipo: 'nodo_arbol',
        destinoId: o.nodoDestinoId,
        etiqueta: o.texto,
        esOpcionArbol: true,
      }));

    res.json({
      success: true,
      data: {
        respuestas: respuestas.recordset.map((r) => ({ ...r, botones: parseJsonArray(r.botones) })),
        etiquetas: etiquetas.recordset,
        nodosArbol: nodosArbol.recordset,
        campanias: campanias.recordset,
        conexiones: [...conexiones.recordset, ...conexionesDesdeArbol],
      },
    });
  } catch (error) {
    console.error('Error obteniendo el flujo visual del chatbot:', error);
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
    const r = await pool.request().input('id', sql.Int, id).query('SELECT 1 FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_ID = @id');
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
