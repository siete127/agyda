const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');

const ALLOWED = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);

function getUserIdFromReq(req) {
  const fromToken = req.user && (req.user.id || req.user.userId || req.user.sub);
  const fromBody = req.body && (req.body.usuarioId || req.body.userId);
  const userId = Number(fromToken || fromBody);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

function normalizeTipo(tipo) {
  if (tipo == null) return null;
  const t = String(tipo).trim().toLowerCase();
  return ALLOWED.has(t) ? t : null;
}

function countsFromRecordset(rows) {
  const counts = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
  for (const r of rows || []) {
    const tipo = (r.tipo || r.TIPO || r.REAC_TIPO || r.CREAC_TIPO || '').toString().toLowerCase();
    const count = Number(r.count || r.COUNT || r.cantidad || r.CANTIDAD || 0);
    if (ALLOWED.has(tipo)) counts[tipo] = count;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

function safeEmit(event, payload, tenantKey) {
  try {
    const io = socketService.getIO(tenantKey);
    io.emit(event, { ...payload, timestamp: new Date().toISOString() });
  } catch (_) {
    // Socket opcional: si no está inicializado, no bloquear.
  }
}

// -----------------------------------------------------------------------------
// NOTICIAS
// -----------------------------------------------------------------------------
exports.getNoticiaReacciones = async (req, res) => {
  try {
    const { id } = req.params;
    const noticiaId = Number(id);
    if (!Number.isFinite(noticiaId) || noticiaId <= 0) {
      return res.status(400).json({ success: false, message: 'id inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const exists = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query('SELECT NOTI_ID FROM INTRANET_NOTICIAS WHERE NOTI_ID = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }

    const grouped = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query(`
        SELECT REAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_REACCIONES
        WHERE REAC_NOTI_ID = @id
        GROUP BY REAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);

    let myReaction = null;
    const userId = getUserIdFromReq(req);
    if (userId) {
      const mine = await pool.request()
        .input('id', sql.Int, noticiaId)
        .input('uid', sql.Int, userId)
        .query(`
          SELECT TOP 1 REAC_TIPO as tipo
          FROM dbo.INTRANET_NOTICIAS_REACCIONES
          WHERE REAC_NOTI_ID = @id AND REAC_USUARIO_ID = @uid
        `);
      if (mine.recordset.length) myReaction = mine.recordset[0].tipo;
    }

    return res.json({ success: true, data: { counts, total, myReaction } });
  } catch (error) {
    console.error('Error obteniendo reacciones noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Lista de usuarios que reaccionaron (para vista tipo tabla)
exports.getNoticiaReactores = async (req, res) => {
  try {
    const { id } = req.params;
    const noticiaId = Number(id);
    if (!Number.isFinite(noticiaId) || noticiaId <= 0) {
      return res.status(400).json({ success: false, message: 'id inválido' });
    }

    const tipo = normalizeTipo(req.query && req.query.tipo);

    const pool = await databaseService.getPool(req.user?.empresa);

    const exists = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query('SELECT NOTI_ID FROM INTRANET_NOTICIAS WHERE NOTI_ID = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }

    const grouped = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query(`
        SELECT REAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_REACCIONES
        WHERE REAC_NOTI_ID = @id
        GROUP BY REAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);

    const list = await pool.request()
      .input('id', sql.Int, noticiaId)
      .input('tipo', sql.NVarChar(20), tipo)
      .query(`
        SELECT
          r.REAC_USUARIO_ID as usuarioId,
          u.NEUS_NOMBRES as nombre,
          u.NEUS_FOTO_URL as fotoUrl,
          r.REAC_TIPO as tipo,
          COALESCE(r.REAC_FECHA_ACTUALIZACION, r.REAC_FECHA_CREACION) as fecha
        FROM dbo.INTRANET_NOTICIAS_REACCIONES r
        LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = r.REAC_USUARIO_ID
        WHERE r.REAC_NOTI_ID = @id
          AND (@tipo IS NULL OR r.REAC_TIPO = @tipo)
        ORDER BY COALESCE(r.REAC_FECHA_ACTUALIZACION, r.REAC_FECHA_CREACION) DESC
      `);

    return res.json({
      success: true,
      data: {
        counts,
        total,
        items: list.recordset || [],
      },
    });
  } catch (error) {
    console.error('Error obteniendo reactores de noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setNoticiaReaccion = async (req, res) => {
  try {
    const { id } = req.params;
    const noticiaId = Number(id);
    const userId = getUserIdFromReq(req);
    const tipo = normalizeTipo(req.body && req.body.tipo);

    if (!Number.isFinite(noticiaId) || noticiaId <= 0) {
      return res.status(400).json({ success: false, message: 'id inválido' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }
    if (!tipo) {
      return res.status(400).json({ success: false, message: 'tipo inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // Upsert sin MERGE (más compatible)
    await pool.request()
      .input('id', sql.Int, noticiaId)
      .input('uid', sql.Int, userId)
      .input('tipo', sql.NVarChar(20), tipo)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.INTRANET_NOTICIAS_REACCIONES
          WHERE REAC_NOTI_ID = @id AND REAC_USUARIO_ID = @uid
        )
        BEGIN
          UPDATE dbo.INTRANET_NOTICIAS_REACCIONES
          SET REAC_TIPO = @tipo, REAC_FECHA_ACTUALIZACION = GETDATE()
          WHERE REAC_NOTI_ID = @id AND REAC_USUARIO_ID = @uid;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.INTRANET_NOTICIAS_REACCIONES (REAC_NOTI_ID, REAC_USUARIO_ID, REAC_TIPO)
          VALUES (@id, @uid, @tipo);
        END
      `);

    // Retornar snapshot
    const grouped = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query(`
        SELECT REAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_REACCIONES
        WHERE REAC_NOTI_ID = @id
        GROUP BY REAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);
    safeEmit('noticia:reaccion', { noticiaId, counts, total }, req.user?.empresa);
    return res.json({ success: true, data: { counts, total, myReaction: tipo } });
  } catch (error) {
    console.error('Error seteando reacción noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeNoticiaReaccion = async (req, res) => {
  try {
    const { id } = req.params;
    const noticiaId = Number(id);
    const userId = getUserIdFromReq(req);

    if (!Number.isFinite(noticiaId) || noticiaId <= 0) {
      return res.status(400).json({ success: false, message: 'id inválido' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, noticiaId)
      .input('uid', sql.Int, userId)
      .query(`
        DELETE FROM dbo.INTRANET_NOTICIAS_REACCIONES
        WHERE REAC_NOTI_ID = @id AND REAC_USUARIO_ID = @uid
      `);

    const grouped = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query(`
        SELECT REAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_REACCIONES
        WHERE REAC_NOTI_ID = @id
        GROUP BY REAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);
    safeEmit('noticia:reaccion', { noticiaId, counts, total }, req.user?.empresa);
    return res.json({ success: true, data: { counts, total, myReaction: null } });
  } catch (error) {
    console.error('Error eliminando reacción noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// -----------------------------------------------------------------------------
// COMENTARIOS
// -----------------------------------------------------------------------------
exports.getComentarioReacciones = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comId = Number(commentId);
    if (!Number.isFinite(comId) || comId <= 0) {
      return res.status(400).json({ success: false, message: 'commentId inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const exists = await pool.request()
      .input('cid', sql.Int, comId)
      .query('SELECT COM_ID FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID = @cid');

    if (exists.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    }

    const grouped = await pool.request()
      .input('cid', sql.Int, comId)
      .query(`
        SELECT CREAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
        WHERE CREAC_COM_ID = @cid
        GROUP BY CREAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);

    let myReaction = null;
    const userId = getUserIdFromReq(req);
    if (userId) {
      const mine = await pool.request()
        .input('cid', sql.Int, comId)
        .input('uid', sql.Int, userId)
        .query(`
          SELECT TOP 1 CREAC_TIPO as tipo
          FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
          WHERE CREAC_COM_ID = @cid AND CREAC_USUARIO_ID = @uid
        `);
      if (mine.recordset.length) myReaction = mine.recordset[0].tipo;
    }

    return res.json({ success: true, data: { counts, total, myReaction } });
  } catch (error) {
    console.error('Error obteniendo reacciones comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setComentarioReaccion = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comId = Number(commentId);
    const userId = getUserIdFromReq(req);
    const tipo = normalizeTipo(req.body && req.body.tipo);

    if (!Number.isFinite(comId) || comId <= 0) {
      return res.status(400).json({ success: false, message: 'commentId inválido' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }
    if (!tipo) {
      return res.status(400).json({ success: false, message: 'tipo inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('cid', sql.Int, comId)
      .input('uid', sql.Int, userId)
      .input('tipo', sql.NVarChar(20), tipo)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
          WHERE CREAC_COM_ID = @cid AND CREAC_USUARIO_ID = @uid
        )
        BEGIN
          UPDATE dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
          SET CREAC_TIPO = @tipo, CREAC_FECHA_ACTUALIZACION = GETDATE()
          WHERE CREAC_COM_ID = @cid AND CREAC_USUARIO_ID = @uid;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES (CREAC_COM_ID, CREAC_USUARIO_ID, CREAC_TIPO)
          VALUES (@cid, @uid, @tipo);
        END
      `);

    const grouped = await pool.request()
      .input('cid', sql.Int, comId)
      .query(`
        SELECT CREAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
        WHERE CREAC_COM_ID = @cid
        GROUP BY CREAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);
    safeEmit('comentario:reaccion', { commentId: comId, counts, total }, req.user?.empresa);
    return res.json({ success: true, data: { counts, total, myReaction: tipo } });
  } catch (error) {
    console.error('Error seteando reacción comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeComentarioReaccion = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comId = Number(commentId);
    const userId = getUserIdFromReq(req);

    if (!Number.isFinite(comId) || comId <= 0) {
      return res.status(400).json({ success: false, message: 'commentId inválido' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('cid', sql.Int, comId)
      .input('uid', sql.Int, userId)
      .query(`
        DELETE FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
        WHERE CREAC_COM_ID = @cid AND CREAC_USUARIO_ID = @uid
      `);

    const grouped = await pool.request()
      .input('cid', sql.Int, comId)
      .query(`
        SELECT CREAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
        WHERE CREAC_COM_ID = @cid
        GROUP BY CREAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);
    safeEmit('comentario:reaccion', { commentId: comId, counts, total }, req.user?.empresa);
    return res.json({ success: true, data: { counts, total, myReaction: null } });
  } catch (error) {
    console.error('Error eliminando reacción comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Lista de usuarios que reaccionaron (para vista tipo tabla)
exports.getComentarioReactores = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comId = Number(commentId);
    if (!Number.isFinite(comId) || comId <= 0) {
      return res.status(400).json({ success: false, message: 'commentId inválido' });
    }

    const tipo = normalizeTipo(req.query && req.query.tipo);
    const pool = await databaseService.getPool(req.user?.empresa);

    const exists = await pool.request()
      .input('cid', sql.Int, comId)
      .query('SELECT COM_ID FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID = @cid');

    if (exists.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    }

    const grouped = await pool.request()
      .input('cid', sql.Int, comId)
      .query(`
        SELECT CREAC_TIPO as tipo, COUNT(1) as count
        FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES
        WHERE CREAC_COM_ID = @cid
        GROUP BY CREAC_TIPO
      `);

    const { counts, total } = countsFromRecordset(grouped.recordset);

    const list = await pool.request()
      .input('cid', sql.Int, comId)
      .input('tipo', sql.NVarChar(20), tipo)
      .query(`
        SELECT
          r.CREAC_USUARIO_ID as usuarioId,
          u.NEUS_NOMBRES as nombre,
          u.NEUS_FOTO_URL as fotoUrl,
          r.CREAC_TIPO as tipo,
          COALESCE(r.CREAC_FECHA_ACTUALIZACION, r.CREAC_FECHA_CREACION) as fecha
        FROM dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES r
        LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = r.CREAC_USUARIO_ID
        WHERE r.CREAC_COM_ID = @cid
          AND (@tipo IS NULL OR r.CREAC_TIPO = @tipo)
        ORDER BY COALESCE(r.CREAC_FECHA_ACTUALIZACION, r.CREAC_FECHA_CREACION) DESC
      `);

    return res.json({
      success: true,
      data: {
        counts,
        total,
        items: list.recordset || [],
      },
    });
  } catch (error) {
    console.error('Error obteniendo reactores de comentario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};