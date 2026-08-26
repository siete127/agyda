const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.getComentariosNoticia = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          COM_ID as id,
          COM_NOTI_ID as noticiaId,
          COM_USUARIO_ID as usuarioId,
          COM_USUARIO_NOMBRE as usuarioNombre,
          COM_CONTENIDO as contenido,
          COM_FECHA_CREACION as fechaCreacion,
          COM_FECHA_ACTUALIZACION as fechaActualizacion,
          COM_ACTIVO as activo
        FROM INTRANET_NOTICIAS_COMENTARIOS
        WHERE COM_NOTI_ID = @id AND COM_ACTIVO = 1
        ORDER BY COM_FECHA_CREACION ASC
      `);

    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error listando comentarios:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createComentarioNoticia = async (req, res) => {
  try {
    const { id } = req.params;
    const { contenido, usuarioId, usuarioNombre } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!contenido || !usuarioId || !usuarioNombre) {
      return res.status(400).json({ success: false, message: 'contenido, usuarioId y usuarioNombre son requeridos' });
    }

    // Verificar que la noticia existe y tiene comentarios habilitados
    const noticia = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT NOTI_ID, NOTI_COMENTARIOS_HABILITADOS, NOTI_ACTIVO FROM INTRANET_NOTICIAS WHERE NOTI_ID = @id`);

    if (noticia.recordset.length === 0 || noticia.recordset[0].NOTI_ACTIVO !== true) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada o inactiva' });
    }
    if (noticia.recordset[0].NOTI_COMENTARIOS_HABILITADOS !== true) {
      return res.status(403).json({ success: false, message: 'Comentarios deshabilitados para esta noticia' });
    }

    const insert = await pool.request()
      .input('id', sql.Int, id)
      .input('usuarioId', sql.Int, usuarioId)
      .input('usuarioNombre', sql.NVarChar, usuarioNombre)
      .input('contenido', sql.NVarChar, contenido)
      .query(`
        INSERT INTO INTRANET_NOTICIAS_COMENTARIOS (
          COM_NOTI_ID, COM_USUARIO_ID, COM_USUARIO_NOMBRE, COM_CONTENIDO, COM_FECHA_CREACION, COM_ACTIVO
        ) VALUES (
          @id, @usuarioId, @usuarioNombre, @contenido, GETDATE(), 1
        );
        SELECT SCOPE_IDENTITY() as id;
      `);

    const commentId = insert.recordset[0].id;
    const saved = await pool.request()
      .input('cid', sql.Int, commentId)
      .query(`
        SELECT 
          COM_ID as id,
          COM_NOTI_ID as noticiaId,
          COM_USUARIO_ID as usuarioId,
          COM_USUARIO_NOMBRE as usuarioNombre,
          COM_CONTENIDO as contenido,
          COM_FECHA_CREACION as fechaCreacion,
          COM_FECHA_ACTUALIZACION as fechaActualizacion,
          COM_ACTIVO as activo
        FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID = @cid
      `);

    res.status(201).json({ success: true, data: saved.recordset[0] });
  } catch (error) {
    console.error('Error creando comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateComentario = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { contenido, usuarioId, tipoUsuario } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!contenido || !usuarioId) {
      return res.status(400).json({ success: false, message: 'contenido y usuarioId son requeridos' });
    }

    const existing = await pool.request()
      .input('cid', sql.Int, commentId)
      .query(`SELECT COM_ID, COM_USUARIO_ID FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID = @cid AND COM_ACTIVO = 1`);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    }

    const ownerId = existing.recordset[0].COM_USUARIO_ID;
    const isAdmin = tipoUsuario === 'admin';
    if (!isAdmin && ownerId !== Number(usuarioId)) {
      return res.status(403).json({ success: false, message: 'No autorizado para editar este comentario' });
    }

    await pool.request()
      .input('cid', sql.Int, commentId)
      .input('contenido', sql.NVarChar, contenido)
      .query(`
        UPDATE INTRANET_NOTICIAS_COMENTARIOS
        SET COM_CONTENIDO = @contenido, COM_FECHA_ACTUALIZACION = GETDATE()
        WHERE COM_ID = @cid
      `);

    const updated = await pool.request()
      .input('cid', sql.Int, commentId)
      .query(`
        SELECT 
          COM_ID as id,
          COM_NOTI_ID as noticiaId,
          COM_USUARIO_ID as usuarioId,
          COM_USUARIO_NOMBRE as usuarioNombre,
          COM_CONTENIDO as contenido,
          COM_FECHA_CREACION as fechaCreacion,
          COM_FECHA_ACTUALIZACION as fechaActualizacion,
          COM_ACTIVO as activo
        FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID = @cid
      `);

    res.json({ success: true, data: updated.recordset[0] });
  } catch (error) {
    console.error('Error editando comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteComentario = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { usuarioId, tipoUsuario } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!usuarioId) {
      return res.status(400).json({ success: false, message: 'usuarioId es requerido' });
    }

    const existing = await pool.request()
      .input('cid', sql.Int, commentId)
      .query(`SELECT COM_ID, COM_USUARIO_ID FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID = @cid AND COM_ACTIVO = 1`);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    }

    const ownerId = existing.recordset[0].COM_USUARIO_ID;
    const isAdmin = tipoUsuario === 'admin';
    if (!isAdmin && ownerId !== Number(usuarioId)) {
      return res.status(403).json({ success: false, message: 'No autorizado para eliminar este comentario' });
    }

    await pool.request()
      .input('cid', sql.Int, commentId)
      .query(`
        UPDATE INTRANET_NOTICIAS_COMENTARIOS
        SET COM_ACTIVO = 0, COM_FECHA_ACTUALIZACION = GETDATE()
        WHERE COM_ID = @cid
      `);

    res.json({ success: true, message: 'Comentario eliminado' });
  } catch (error) {
    console.error('Error eliminando comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};