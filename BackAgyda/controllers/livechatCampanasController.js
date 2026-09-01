const sql = require('mssql');
const crypto = require('crypto');
const databaseService = require('../services/databaseService');
const { getUserAllowedActions, SUPER_ADMIN_IDS } = require('../middleware/moduleAccess');

// true si el usuario autenticado puede administrar campañas/plantillas/motivos
// (no solo atender chats) — mismo criterio que usa requireActionAccess, pero
// calculado dentro del controller porque estos endpoints los usan tanto
// gestores (ven/editan todo) como agentes normales (ven lo suyo + lo público).
async function puedeGestionarCampanas(req) {
  const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
  if (!uid) return false;
  if (SUPER_ADMIN_IDS.has(parseInt(uid))) return true;
  const allowed = await getUserAllowedActions(uid, 'livechat', req.user?.empresa);
  return allowed.has('*') || allowed.has('gestionar-campanas');
}

const SELECT_CAMPANIA = `
  SELECT
    LCA_ID as id,
    LCA_NOMBRE as nombre,
    LCA_DESCRIPCION as descripcion,
    LCA_TOKEN as token,
    LCA_ACTIVO as activo,
    LCA_FECHA_INICIO as fechaInicio,
    LCA_FECHA_FIN as fechaFin,
    LCA_FECHA_CREACION as fechaCreacion,
    LCA_MAX_CHATS_POR_AGENTE as maxChatsPorAgente,
    LCA_AREA as area
  FROM dbo.LIVECHAT_CAMPANIAS
`;

const SELECT_GRUPO = `
  SELECT
    LG_ID as id,
    LG_CAMPANIA_ID as campaniaId,
    LG_NOMBRE as nombre,
    LG_DESCRIPCION as descripcion,
    LG_ICONO as icono,
    LG_ACTIVO as activo
  FROM dbo.LIVECHAT_GRUPOS
`;

const SELECT_PLANTILLA = `
  SELECT
    LP_ID as id,
    LP_GRUPO_ID as grupoId,
    LP_NOMBRE as nombre,
    LP_CONTENIDO as contenido,
    LP_TIPO as tipo,
    LP_VISIBILIDAD as visibilidad,
    LP_USUARIO_ID as usuarioId,
    LP_ACTIVO as activo
  FROM dbo.LIVECHAT_PLANTILLAS
`;

const SELECT_MOTIVO_CIERRE = `
  SELECT
    LMC_ID as id,
    LMC_GRUPO_ID as grupoId,
    LMC_MOTIVO as motivo,
    LMC_DESCRIPCION as descripcion,
    LMC_REQUIERE_COMENTARIO as requiereComentario,
    LMC_ORDEN as orden,
    LMC_ACTIVO as activo
  FROM dbo.LIVECHAT_MOTIVOS_CIERRE
`;

/* ════════════════════════════════════════════════════════
   CAMPAÑAS
════════════════════════════════════════════════════════ */

// Autenticado — lista todas las campañas (activas e inactivas; el frontend filtra).
exports.getCampanias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`${SELECT_CAMPANIA} ORDER BY LCA_FECHA_CREACION DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo campañas de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Autenticado (gestionar-campanas) — crea campaña con token público único para el widget.
exports.createCampania = async (req, res) => {
  try {
    const { nombre, descripcion, fechaInicio, fechaFin, maxChatsPorAgente, area } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre de la campaña es requerido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const token = crypto.randomBytes(24).toString('hex');

    const insert = await pool.request()
      .input('nombre', sql.NVarChar(200), nombre.trim().slice(0, 200))
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('token', sql.NVarChar(64), token)
      .input('fechaInicio', sql.DateTime, fechaInicio ? new Date(fechaInicio) : null)
      .input('fechaFin', sql.DateTime, fechaFin ? new Date(fechaFin) : null)
      .input('maxChats', sql.Int, Number.isFinite(maxChatsPorAgente) ? maxChatsPorAgente : null)
      .input('area', sql.NVarChar(100), area || null)
      .query(`
        INSERT INTO dbo.LIVECHAT_CAMPANIAS
          (LCA_NOMBRE, LCA_DESCRIPCION, LCA_TOKEN, LCA_FECHA_INICIO, LCA_FECHA_FIN, LCA_MAX_CHATS_POR_AGENTE, LCA_AREA)
        OUTPUT INSERTED.LCA_ID as id
        VALUES (@nombre, @descripcion, @token, @fechaInicio, @fechaFin, @maxChats, @area)
      `);

    const campania = await pool.request()
      .input('id', sql.Int, insert.recordset[0].id)
      .query(`${SELECT_CAMPANIA} WHERE LCA_ID = @id`);

    res.status(201).json({ success: true, data: campania.recordset[0] });
  } catch (error) {
    console.error('Error creando campaña de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCampania = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, activo, fechaInicio, fechaFin, maxChatsPorAgente, area } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request().input('id', sql.Int, id).query(`${SELECT_CAMPANIA} WHERE LCA_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    }
    const actual = existente.recordset[0];

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(200), (nombre ?? actual.nombre).slice(0, 200))
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion !== undefined ? descripcion : actual.descripcion)
      .input('activo', sql.Bit, activo !== undefined ? !!activo : actual.activo)
      .input('fechaInicio', sql.DateTime, fechaInicio !== undefined ? (fechaInicio ? new Date(fechaInicio) : null) : actual.fechaInicio)
      .input('fechaFin', sql.DateTime, fechaFin !== undefined ? (fechaFin ? new Date(fechaFin) : null) : actual.fechaFin)
      .input('maxChats', sql.Int, maxChatsPorAgente !== undefined ? maxChatsPorAgente : actual.maxChatsPorAgente)
      .input('area', sql.NVarChar(100), area !== undefined ? area : actual.area)
      .query(`
        UPDATE dbo.LIVECHAT_CAMPANIAS
        SET LCA_NOMBRE = @nombre, LCA_DESCRIPCION = @descripcion, LCA_ACTIVO = @activo,
            LCA_FECHA_INICIO = @fechaInicio, LCA_FECHA_FIN = @fechaFin, LCA_MAX_CHATS_POR_AGENTE = @maxChats,
            LCA_AREA = @area
        WHERE LCA_ID = @id
      `);

    const actualizada = await pool.request().input('id', sql.Int, id).query(`${SELECT_CAMPANIA} WHERE LCA_ID = @id`);
    res.json({ success: true, data: actualizada.recordset[0] });
  } catch (error) {
    console.error('Error actualizando campaña de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// No se borra físicamente (podría tener conversaciones históricas vinculadas
// vía LC_CAMPANIA_ID) — se desactiva, igual que el resto de "eliminar" en AGYDA.
exports.deleteCampania = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE dbo.LIVECHAT_CAMPANIAS SET LCA_ACTIVO = 0, LCA_FECHA_FIN = GETDATE()
        OUTPUT INSERTED.LCA_ID
        WHERE LCA_ID = @id
      `);
    if (upd.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    }
    res.json({ success: true, message: 'Campaña desactivada' });
  } catch (error) {
    console.error('Error desactivando campaña de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   GRUPOS
════════════════════════════════════════════════════════ */

exports.getGrupos = async (req, res) => {
  try {
    const { campaniaId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .query(`${SELECT_GRUPO} WHERE LG_CAMPANIA_ID = @campaniaId AND LG_ACTIVO = 1 ORDER BY LG_NOMBRE ASC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo grupos de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createGrupo = async (req, res) => {
  try {
    const { campaniaId } = req.params;
    const { nombre, descripcion, icono } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre del grupo es requerido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const campania = await pool.request().input('id', sql.Int, campaniaId).query('SELECT LCA_ID FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_ID = @id');
    if (campania.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    }

    const insert = await pool.request()
      .input('campaniaId', sql.Int, campaniaId)
      .input('nombre', sql.NVarChar(100), nombre.trim().slice(0, 100))
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('icono', sql.NVarChar(10), icono || '📞')
      .query(`
        INSERT INTO dbo.LIVECHAT_GRUPOS (LG_CAMPANIA_ID, LG_NOMBRE, LG_DESCRIPCION, LG_ICONO)
        OUTPUT INSERTED.LG_ID as id
        VALUES (@campaniaId, @nombre, @descripcion, @icono)
      `);

    const grupo = await pool.request().input('id', sql.Int, insert.recordset[0].id).query(`${SELECT_GRUPO} WHERE LG_ID = @id`);
    res.status(201).json({ success: true, data: grupo.recordset[0] });
  } catch (error) {
    console.error('Error creando grupo de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateGrupo = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { nombre, descripcion, icono, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request().input('id', sql.Int, grupoId).query(`${SELECT_GRUPO} WHERE LG_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
    }
    const actual = existente.recordset[0];

    await pool.request()
      .input('id', sql.Int, grupoId)
      .input('nombre', sql.NVarChar(100), (nombre ?? actual.nombre).slice(0, 100))
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion !== undefined ? descripcion : actual.descripcion)
      .input('icono', sql.NVarChar(10), icono ?? actual.icono)
      .input('activo', sql.Bit, activo !== undefined ? !!activo : actual.activo)
      .query(`
        UPDATE dbo.LIVECHAT_GRUPOS
        SET LG_NOMBRE = @nombre, LG_DESCRIPCION = @descripcion, LG_ICONO = @icono, LG_ACTIVO = @activo
        WHERE LG_ID = @id
      `);

    const actualizado = await pool.request().input('id', sql.Int, grupoId).query(`${SELECT_GRUPO} WHERE LG_ID = @id`);
    res.json({ success: true, data: actualizado.recordset[0] });
  } catch (error) {
    console.error('Error actualizando grupo de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGrupo = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const agentesCount = await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .query('SELECT COUNT(*) as total FROM dbo.LIVECHAT_GRUPO_AGENTES WHERE LGA_GRUPO_ID = @grupoId AND LGA_ACTIVO = 1');
    if (agentesCount.recordset[0].total > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar el grupo porque tiene ${agentesCount.recordset[0].total} agente(s) asignado(s). Reasigna o quita los agentes primero.`,
      });
    }

    const upd = await pool.request()
      .input('id', sql.Int, grupoId)
      .query('UPDATE dbo.LIVECHAT_GRUPOS SET LG_ACTIVO = 0 OUTPUT INSERTED.LG_ID WHERE LG_ID = @id');
    if (upd.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
    }
    res.json({ success: true, message: 'Grupo desactivado' });
  } catch (error) {
    console.error('Error desactivando grupo de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   AGENTES POR GRUPO
════════════════════════════════════════════════════════ */

exports.getAgentesDeGrupo = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .query(`
        SELECT ga.LGA_ID as id, ga.LGA_USUARIO_ID as usuarioId, u.NEUS_NOMBRES as nombre, ga.LGA_ACTIVO as activo
        FROM dbo.LIVECHAT_GRUPO_AGENTES ga
        JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ga.LGA_USUARIO_ID
        WHERE ga.LGA_GRUPO_ID = @grupoId AND ga.LGA_ACTIVO = 1
        ORDER BY u.NEUS_NOMBRES ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo agentes del grupo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.asignarAgenteAGrupo = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { usuarioId } = req.body;
    if (!usuarioId) {
      return res.status(400).json({ success: false, message: 'Falta el id del usuario a asignar' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .input('usuarioId', sql.Int, usuarioId)
      .query(`
        MERGE dbo.LIVECHAT_GRUPO_AGENTES AS target
        USING (SELECT @grupoId AS grupoId, @usuarioId AS usuarioId) AS src
        ON target.LGA_GRUPO_ID = src.grupoId AND target.LGA_USUARIO_ID = src.usuarioId
        WHEN MATCHED THEN UPDATE SET LGA_ACTIVO = 1
        WHEN NOT MATCHED THEN INSERT (LGA_GRUPO_ID, LGA_USUARIO_ID, LGA_ACTIVO)
          VALUES (@grupoId, @usuarioId, 1);
      `);

    res.status(201).json({ success: true, message: 'Agente asignado al grupo' });
  } catch (error) {
    console.error('Error asignando agente a grupo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.quitarAgenteDeGrupo = async (req, res) => {
  try {
    const { grupoId, usuarioId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .input('usuarioId', sql.Int, usuarioId)
      .query('UPDATE dbo.LIVECHAT_GRUPO_AGENTES SET LGA_ACTIVO = 0 WHERE LGA_GRUPO_ID = @grupoId AND LGA_USUARIO_ID = @usuarioId');
    res.json({ success: true, message: 'Agente quitado del grupo' });
  } catch (error) {
    console.error('Error quitando agente de grupo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   PLANTILLAS DE MENSAJES
════════════════════════════════════════════════════════ */

// Autenticado — admin/gestor ve todas; un agente ve las públicas + las suyas
// privadas (mismo criterio de visibilidad que el proyecto origen).
exports.getPlantillas = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const gestiona = await puedeGestionarCampanas(req);
    const request = pool.request().input('grupoId', sql.Int, grupoId);

    let where = 'LP_GRUPO_ID = @grupoId AND LP_ACTIVO = 1';
    if (!gestiona) {
      request.input('usuarioId', sql.Int, req.user.id);
      where += " AND (LP_VISIBILIDAD = 'publica' OR (LP_VISIBILIDAD = 'privada' AND LP_USUARIO_ID = @usuarioId))";
    }

    const result = await request.query(`${SELECT_PLANTILLA} WHERE ${where} ORDER BY LP_TIPO ASC, LP_NOMBRE ASC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo plantillas de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPlantilla = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { nombre, contenido, tipo, visibilidad } = req.body;
    if (!nombre || !contenido) {
      return res.status(400).json({ success: false, message: 'El nombre y el contenido son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const grupo = await pool.request().input('id', sql.Int, grupoId).query('SELECT LG_ID FROM dbo.LIVECHAT_GRUPOS WHERE LG_ID = @id');
    if (grupo.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
    }

    const visibilidadVal = visibilidad === 'privada' ? 'privada' : 'publica';
    const insert = await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .input('nombre', sql.NVarChar(255), nombre.trim().slice(0, 255))
      .input('contenido', sql.NVarChar(sql.MAX), contenido)
      .input('tipo', sql.NVarChar(50), tipo || 'general')
      .input('visibilidad', sql.NVarChar(20), visibilidadVal)
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        INSERT INTO dbo.LIVECHAT_PLANTILLAS (LP_GRUPO_ID, LP_NOMBRE, LP_CONTENIDO, LP_TIPO, LP_VISIBILIDAD, LP_USUARIO_ID)
        OUTPUT INSERTED.LP_ID as id
        VALUES (@grupoId, @nombre, @contenido, @tipo, @visibilidad, @usuarioId)
      `);

    const plantilla = await pool.request().input('id', sql.Int, insert.recordset[0].id).query(`${SELECT_PLANTILLA} WHERE LP_ID = @id`);
    res.status(201).json({ success: true, data: plantilla.recordset[0] });
  } catch (error) {
    console.error('Error creando plantilla de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, contenido, tipo, visibilidad, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request().input('id', sql.Int, id).query(`${SELECT_PLANTILLA} WHERE LP_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }
    const actual = existente.recordset[0];

    const gestiona = await puedeGestionarCampanas(req);
    if (!gestiona && actual.usuarioId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'No autorizado para editar esta plantilla' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(255), (nombre ?? actual.nombre).slice(0, 255))
      .input('contenido', sql.NVarChar(sql.MAX), contenido ?? actual.contenido)
      .input('tipo', sql.NVarChar(50), tipo ?? actual.tipo)
      .input('visibilidad', sql.NVarChar(20), visibilidad === 'privada' ? 'privada' : (visibilidad === 'publica' ? 'publica' : actual.visibilidad))
      .input('activo', sql.Bit, activo !== undefined ? !!activo : actual.activo)
      .query(`
        UPDATE dbo.LIVECHAT_PLANTILLAS
        SET LP_NOMBRE = @nombre, LP_CONTENIDO = @contenido, LP_TIPO = @tipo, LP_VISIBILIDAD = @visibilidad, LP_ACTIVO = @activo
        WHERE LP_ID = @id
      `);

    const actualizada = await pool.request().input('id', sql.Int, id).query(`${SELECT_PLANTILLA} WHERE LP_ID = @id`);
    res.json({ success: true, data: actualizada.recordset[0] });
  } catch (error) {
    console.error('Error actualizando plantilla de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request().input('id', sql.Int, id).query(`${SELECT_PLANTILLA} WHERE LP_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }
    const actual = existente.recordset[0];

    const gestiona = await puedeGestionarCampanas(req);
    if (!gestiona && actual.usuarioId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'No autorizado para eliminar esta plantilla' });
    }

    await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.LIVECHAT_PLANTILLAS WHERE LP_ID = @id');
    res.json({ success: true, message: 'Plantilla eliminada' });
  } catch (error) {
    console.error('Error eliminando plantilla de livechat:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   MOTIVOS DE CIERRE
════════════════════════════════════════════════════════ */

exports.getMotivosCierre = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .query(`${SELECT_MOTIVO_CIERRE} WHERE LMC_GRUPO_ID = @grupoId AND LMC_ACTIVO = 1 ORDER BY LMC_ORDEN ASC, LMC_MOTIVO ASC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo motivos de cierre:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createMotivoCierre = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { motivo, descripcion, requiereComentario, orden } = req.body;
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ success: false, message: 'El motivo es requerido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const grupo = await pool.request().input('id', sql.Int, grupoId).query('SELECT LG_ID FROM dbo.LIVECHAT_GRUPOS WHERE LG_ID = @id');
    if (grupo.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
    }

    const insert = await pool.request()
      .input('grupoId', sql.Int, grupoId)
      .input('motivo', sql.NVarChar(255), motivo.trim().slice(0, 255))
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('requiereComentario', sql.Bit, !!requiereComentario)
      .input('orden', sql.Int, Number.isFinite(orden) ? orden : 0)
      .query(`
        INSERT INTO dbo.LIVECHAT_MOTIVOS_CIERRE (LMC_GRUPO_ID, LMC_MOTIVO, LMC_DESCRIPCION, LMC_REQUIERE_COMENTARIO, LMC_ORDEN)
        OUTPUT INSERTED.LMC_ID as id
        VALUES (@grupoId, @motivo, @descripcion, @requiereComentario, @orden)
      `);

    const motivoRow = await pool.request().input('id', sql.Int, insert.recordset[0].id).query(`${SELECT_MOTIVO_CIERRE} WHERE LMC_ID = @id`);
    res.status(201).json({ success: true, data: motivoRow.recordset[0] });
  } catch (error) {
    console.error('Error creando motivo de cierre:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMotivoCierre = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, descripcion, requiereComentario, orden, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request().input('id', sql.Int, id).query(`${SELECT_MOTIVO_CIERRE} WHERE LMC_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Motivo de cierre no encontrado' });
    }
    const actual = existente.recordset[0];

    await pool.request()
      .input('id', sql.Int, id)
      .input('motivo', sql.NVarChar(255), (motivo ?? actual.motivo).slice(0, 255))
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion !== undefined ? descripcion : actual.descripcion)
      .input('requiereComentario', sql.Bit, requiereComentario !== undefined ? !!requiereComentario : actual.requiereComentario)
      .input('orden', sql.Int, Number.isFinite(orden) ? orden : actual.orden)
      .input('activo', sql.Bit, activo !== undefined ? !!activo : actual.activo)
      .query(`
        UPDATE dbo.LIVECHAT_MOTIVOS_CIERRE
        SET LMC_MOTIVO = @motivo, LMC_DESCRIPCION = @descripcion, LMC_REQUIERE_COMENTARIO = @requiereComentario,
            LMC_ORDEN = @orden, LMC_ACTIVO = @activo
        WHERE LMC_ID = @id
      `);

    const actualizado = await pool.request().input('id', sql.Int, id).query(`${SELECT_MOTIVO_CIERRE} WHERE LMC_ID = @id`);
    res.json({ success: true, data: actualizado.recordset[0] });
  } catch (error) {
    console.error('Error actualizando motivo de cierre:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMotivoCierre = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE dbo.LIVECHAT_MOTIVOS_CIERRE SET LMC_ACTIVO = 0 OUTPUT INSERTED.LMC_ID WHERE LMC_ID = @id');
    if (upd.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Motivo de cierre no encontrado' });
    }
    res.json({ success: true, message: 'Motivo de cierre eliminado' });
  } catch (error) {
    console.error('Error eliminando motivo de cierre:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reorderMotivosCierre = async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { orders } = req.body; // [{ id, orden }]
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, message: 'Falta el arreglo "orders"' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    for (const { id, orden } of orders) {
      await pool.request()
        .input('id', sql.Int, id)
        .input('grupoId', sql.Int, grupoId)
        .input('orden', sql.Int, orden)
        .query('UPDATE dbo.LIVECHAT_MOTIVOS_CIERRE SET LMC_ORDEN = @orden WHERE LMC_ID = @id AND LMC_GRUPO_ID = @grupoId');
    }

    res.json({ success: true, message: 'Orden actualizado' });
  } catch (error) {
    console.error('Error reordenando motivos de cierre:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
