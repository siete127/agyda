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
    res.json({ success: true, data: result.recordset.map(mapRow) });
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
