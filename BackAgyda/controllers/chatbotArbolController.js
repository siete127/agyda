const sql = require('mssql');
const databaseService = require('../services/databaseService');
const chatbotArbolService = require('../services/chatbotArbolService');
const ticketController = require('../controllers/ticketController');
const livechatInternoController = require('./livechatInternoController');
const livechatController = require('./livechatController');

// POST /api/chatbot/arbol/sesiones — público (authenticateTokenOptional asocia
// el usuario si está logueado, sin exigirlo — el widget público también lo usa).
exports.iniciarSesion = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const { sesionToken, nodo } = await chatbotArbolService.iniciarSesion(pool, { usuarioId: req.user?.id || null });
    res.status(201).json({ success: true, data: { sesionToken, nodo } });
  } catch (e) {
    console.error('Error iniciando sesión de árbol del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getEstadoSesion = async (req, res) => {
  try {
    const { token } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const sesion = await chatbotArbolService.getSesion(pool, token);
    if (!sesion) return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    const nodo = sesion.nodoActualId ? await chatbotArbolService.getNodo(pool, sesion.nodoActualId) : null;
    res.json({ success: true, data: { ...sesion, nodo } });
  } catch (e) {
    console.error('Error obteniendo sesión de árbol del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/chatbot/arbol/sesiones/:token/avanzar — resuelve la acción
// terminal (resolucion/escalar_chat/crear_ticket) cuando el nodo destino
// no tiene más opciones (hoja del árbol).
exports.avanzar = async (req, res) => {
  try {
    const { token } = req.params;
    const { opcionId } = req.body;
    if (!opcionId) return res.status(400).json({ success: false, message: 'opcionId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await chatbotArbolService.avanzar(pool, { sesionToken: token, opcionId });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    const nodo = result.nodo;
    let accion = null;

    if (nodo.tipo === 'resolucion') {
      await chatbotArbolService.cerrarSesion(pool, token);
      accion = { tipo: 'resolucion' };
    } else if (nodo.tipo === 'escalar_chat') {
      if (req.user?.id) {
        // Usuario autenticado: reusa el flujo del chat interno de Soporte TI
        // (mismo ruteo por motor de reglas y ticket vinculado automático).
        const fakeRes = { statusCode: 200, status(c) { this.statusCode = c; return this; }, body: null, json(b) { this.body = b; return this; } };
        await livechatInternoController.iniciarConversacionInterna(
          { body: { motivo: nodo.texto }, user: req.user },
          fakeRes,
        );
        if (fakeRes.body?.success) {
          await chatbotArbolService.cerrarSesion(pool, token, { conversacionId: fakeRes.body.data.conversacionId, ticketId: fakeRes.body.data.ticketId });
          accion = { tipo: 'escalar_chat', ...fakeRes.body.data };
        } else {
          accion = { tipo: 'escalar_chat', error: fakeRes.body?.message || 'No se pudo iniciar el chat' };
        }
      } else {
        // Visitante anónimo del widget público: escala al flujo público existente.
        const fakeRes = { statusCode: 200, status(c) { this.statusCode = c; return this; }, body: null, json(b) { this.body = b; return this; } };
        await livechatController.iniciarConversacion(
          { body: { motivo: nodo.texto, origen: 'chatbot_escalado' }, user: req.user },
          fakeRes,
        );
        if (fakeRes.body?.success) {
          await chatbotArbolService.cerrarSesion(pool, token, { conversacionId: fakeRes.body.data.conversacionId });
          accion = { tipo: 'escalar_chat', ...fakeRes.body.data };
        } else {
          accion = { tipo: 'escalar_chat', error: fakeRes.body?.message || 'No se pudo iniciar el chat' };
        }
      }
    } else if (nodo.tipo === 'consultar_tickets') {
      if (!req.user?.id) {
        accion = { tipo: 'consultar_tickets', error: 'Necesitas iniciar sesión para consultar tus tickets' };
      } else {
        const rsTickets = await pool.request().input('uid', sql.Int, req.user.id).query(`
          SELECT TOP 10 TICKET_ID as id, TITULO as titulo, PRIORIDAD as prioridad, ESTADO as estado,
                 FECHA_CREACION as fechaCreacion, NIVEL_ACTUAL as nivelActual
          FROM TICKETS
          WHERE SOLICITANTE_ID=@uid AND ESTADO NOT IN ('resuelto','cerrado')
          ORDER BY FECHA_CREACION DESC`);
        await chatbotArbolService.cerrarSesion(pool, token);
        accion = { tipo: 'consultar_tickets', tickets: rsTickets.recordset };
      }
    } else if (nodo.tipo === 'crear_ticket') {
      if (!req.user?.id) {
        accion = { tipo: 'crear_ticket', error: 'Necesitas iniciar sesión para crear un ticket' };
      } else {
        let categoriaNombre = null;
        if (nodo.categoriaId) {
          const rsCat = await pool.request().input('id', sql.Int, nodo.categoriaId).query(`SELECT CAT_NOMBRE FROM TICKET_CATEGORIAS WHERE CAT_ID=@id`);
          categoriaNombre = rsCat.recordset[0]?.CAT_NOMBRE || null;
        }
        const result = await ticketController.crearTicketInterno(pool, {
          solicitanteId: req.user.id,
          area: 'TI',
          titulo: `Chatbot: ${nodo.texto.slice(0, 120)}`,
          descripcion: nodo.texto,
          clasificacion: 'consulta',
          categoria: categoriaNombre,
          tenantKey: req.user?.empresa,
          esAD: false,
        });
        if (result.ok) {
          await chatbotArbolService.cerrarSesion(pool, token, { ticketId: result.data.id });
          accion = { tipo: 'crear_ticket', ticketId: result.data.id };
        } else {
          accion = { tipo: 'crear_ticket', error: result.message };
        }
      }
    }

    res.json({ success: true, data: { nodo, accion } });
  } catch (e) {
    console.error('Error avanzando en árbol del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Administración de nodos/opciones (Configuración > Chatbot) ── */
exports.getNodos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const nodos = await pool.request().query(`
      SELECT NODO_ID as id, NODO_CODIGO as codigo, NODO_TEXTO as texto, NODO_TIPO as tipo, NODO_CATEGORIA_ID as categoriaId, NODO_ACTIVO as activo
      FROM CHATBOT_NODOS ORDER BY NODO_ID`);
    const opciones = await pool.request().query(`
      SELECT OPC_ID as id, OPC_NODO_ID as nodoId, OPC_TEXTO_BOTON as texto, OPC_NODO_DESTINO_ID as nodoDestinoId, OPC_ORDEN as orden
      FROM CHATBOT_NODO_OPCIONES ORDER BY OPC_ORDEN, OPC_ID`);
    res.json({
      success: true,
      data: nodos.recordset.map((n) => ({ ...n, opciones: opciones.recordset.filter((o) => o.nodoId === n.id) })),
    });
  } catch (e) {
    console.error('Error listando nodos del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createNodo = async (req, res) => {
  try {
    const { codigo, texto, tipo, categoriaId } = req.body;
    if (!codigo || !texto) return res.status(400).json({ success: false, message: 'codigo y texto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('codigo', sql.NVarChar, codigo)
      .input('texto', sql.NVarChar, texto)
      .input('tipo', sql.NVarChar, tipo || 'pregunta')
      .input('catId', sql.Int, categoriaId || null)
      .query(`INSERT INTO CHATBOT_NODOS (NODO_CODIGO, NODO_TEXTO, NODO_TIPO, NODO_CATEGORIA_ID) VALUES (@codigo, @texto, @tipo, @catId); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id) } });
  } catch (e) {
    console.error('Error creando nodo del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateNodo = async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, tipo, categoriaId, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('texto', sql.NVarChar, texto)
      .input('tipo', sql.NVarChar, tipo)
      .input('catId', sql.Int, categoriaId || null)
      .input('activo', sql.Bit, activo === undefined ? 1 : (activo ? 1 : 0))
      .query(`UPDATE CHATBOT_NODOS SET NODO_TEXTO=@texto, NODO_TIPO=@tipo, NODO_CATEGORIA_ID=@catId, NODO_ACTIVO=@activo WHERE NODO_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando nodo del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteNodo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const refs = await pool.request().input('id', sql.Int, id).query(`
      SELECT
        (SELECT COUNT(*) FROM CHATBOT_NODO_OPCIONES WHERE OPC_NODO_DESTINO_ID=@id) as comoDestino,
        (SELECT COUNT(*) FROM CHATBOT_SESIONES WHERE SES_NODO_ACTUAL_ID=@id AND SES_FECHA_FIN IS NULL) as sesionesActivas
    `);
    if (refs.recordset[0].comoDestino > 0 || refs.recordset[0].sesionesActivas > 0) {
      return res.status(409).json({ success: false, message: 'No se puede eliminar: el nodo es destino de otra opción o tiene sesiones activas' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM CHATBOT_NODO_OPCIONES WHERE OPC_NODO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM CHATBOT_NODOS WHERE NODO_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando nodo del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createOpcion = async (req, res) => {
  try {
    const { nodoId, texto, nodoDestinoId, orden } = req.body;
    if (!nodoId || !texto) return res.status(400).json({ success: false, message: 'nodoId y texto son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nodoId', sql.Int, nodoId)
      .input('texto', sql.NVarChar, texto)
      .input('destinoId', sql.Int, nodoDestinoId || null)
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO CHATBOT_NODO_OPCIONES (OPC_NODO_ID, OPC_TEXTO_BOTON, OPC_NODO_DESTINO_ID, OPC_ORDEN) VALUES (@nodoId, @texto, @destinoId, @orden); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id) } });
  } catch (e) {
    console.error('Error creando opción del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateOpcion = async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, nodoDestinoId, orden } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('texto', sql.NVarChar, texto)
      .input('destinoId', sql.Int, nodoDestinoId || null)
      .input('orden', sql.Int, orden || 0)
      .query(`UPDATE CHATBOT_NODO_OPCIONES SET OPC_TEXTO_BOTON=@texto, OPC_NODO_DESTINO_ID=@destinoId, OPC_ORDEN=@orden WHERE OPC_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando opción del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteOpcion = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM CHATBOT_NODO_OPCIONES WHERE OPC_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando opción del chatbot:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
