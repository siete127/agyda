const sql = require('mssql');

async function getNodo(pool, codigoONodoId) {
  const esNumero = /^\d+$/.test(String(codigoONodoId));
  const rs = await pool.request()
    .input('val', esNumero ? sql.Int : sql.NVarChar, esNumero ? Number(codigoONodoId) : codigoONodoId)
    .query(`
      SELECT NODO_ID as id, NODO_CODIGO as codigo, NODO_TEXTO as texto, NODO_TIPO as tipo, NODO_CATEGORIA_ID as categoriaId
      FROM CHATBOT_NODOS
      WHERE NODO_ACTIVO = 1 AND ${esNumero ? 'NODO_ID = @val' : 'NODO_CODIGO = @val'}
    `);
  const nodo = rs.recordset[0];
  if (!nodo) return null;

  const opciones = await pool.request().input('nodoId', sql.Int, nodo.id).query(`
    SELECT OPC_ID as id, OPC_TEXTO_BOTON as texto, OPC_NODO_DESTINO_ID as nodoDestinoId, OPC_ORDEN as orden
    FROM CHATBOT_NODO_OPCIONES WHERE OPC_NODO_ID = @nodoId ORDER BY OPC_ORDEN, OPC_ID
  `);
  return { ...nodo, opciones: opciones.recordset };
}

async function iniciarSesion(pool, { usuarioId = null } = {}) {
  const nodoInicio = await getNodo(pool, 'inicio');
  if (!nodoInicio) throw new Error('El árbol del chatbot no tiene un nodo "inicio" configurado');

  const ins = await pool.request()
    .input('usuarioId', sql.Int, usuarioId)
    .input('nodoId', sql.Int, nodoInicio.id)
    .query(`
      INSERT INTO CHATBOT_SESIONES (SES_USUARIO_ID, SES_NODO_ACTUAL_ID)
      OUTPUT INSERTED.SES_TOKEN as token
      VALUES (@usuarioId, @nodoId)
    `);
  return { sesionToken: ins.recordset[0].token, nodo: nodoInicio };
}

async function getSesion(pool, sesionToken) {
  const rs = await pool.request().input('token', sql.UniqueIdentifier, sesionToken).query(`
    SELECT SES_ID as id, SES_USUARIO_ID as usuarioId, SES_NODO_ACTUAL_ID as nodoActualId,
           SES_TICKET_ID as ticketId, SES_CONVERSACION_ID as conversacionId, SES_FECHA_FIN as fechaFin
    FROM CHATBOT_SESIONES WHERE SES_TOKEN = @token
  `);
  return rs.recordset[0] || null;
}

async function avanzar(pool, { sesionToken, opcionId }) {
  const sesion = await getSesion(pool, sesionToken);
  if (!sesion) return { ok: false, status: 404, message: 'Sesión no encontrada' };
  if (sesion.fechaFin) return { ok: false, status: 409, message: 'Esta conversación ya finalizó' };

  const opcionRs = await pool.request().input('opcId', sql.Int, opcionId).query(`
    SELECT OPC_ID as id, OPC_NODO_ID as nodoOrigenId, OPC_NODO_DESTINO_ID as nodoDestinoId
    FROM CHATBOT_NODO_OPCIONES WHERE OPC_ID = @opcId
  `);
  const opcion = opcionRs.recordset[0];
  if (!opcion) return { ok: false, status: 404, message: 'Opción no encontrada' };
  if (opcion.nodoOrigenId !== sesion.nodoActualId) {
    return { ok: false, status: 400, message: 'Esa opción no pertenece al paso actual de la conversación' };
  }
  if (!opcion.nodoDestinoId) {
    return { ok: false, status: 400, message: 'Esta opción no lleva a ningún nodo' };
  }

  await pool.request().input('token', sql.UniqueIdentifier, sesionToken).input('nodoId', sql.Int, opcion.nodoDestinoId)
    .query(`UPDATE CHATBOT_SESIONES SET SES_NODO_ACTUAL_ID = @nodoId WHERE SES_TOKEN = @token`);

  const nodo = await getNodo(pool, opcion.nodoDestinoId);
  return { ok: true, nodo };
}

async function cerrarSesion(pool, sesionToken, { ticketId = null, conversacionId = null } = {}) {
  await pool.request()
    .input('token', sql.UniqueIdentifier, sesionToken)
    .input('ticketId', sql.Int, ticketId)
    .input('convId', sql.Int, conversacionId)
    .query(`UPDATE CHATBOT_SESIONES SET SES_FECHA_FIN = GETDATE(), SES_TICKET_ID = @ticketId, SES_CONVERSACION_ID = @convId WHERE SES_TOKEN = @token`);
}

module.exports = { getNodo, iniciarSesion, getSesion, avanzar, cerrarSesion };
