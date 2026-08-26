const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');

const AUDIO_BASE_URL = process.env.AUDIO_BASE_URL || 'https://intranet.ardabytec.vip:8444/audio';
const AUDIO_DIR = process.env.AUDIO_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Musica';

function getUserId(req) {
  const fromToken = req.user && (req.user.id || req.user.userId || req.user.sub);
  const fromHeader = req.headers['usuarioid'];
  const id = Number(fromToken || fromHeader);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// POST /api/playlist/privada/audio — sube un MP3 y crea el track privado
exports.uploadAudio = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió archivo de audio' });

    const titulo  = (req.body.titulo  || path.parse(req.file.originalname).name).trim();
    const artista = (req.body.artista || '').trim();
    const emoji   = (req.body.emoji   || '🎵').trim();
    const audioUrl = `${AUDIO_BASE_URL}/${req.file.filename}`;

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('uid',      sql.Int,          userId)
      .input('titulo',   sql.NVarChar(200), titulo)
      .input('artista',  sql.NVarChar(200), artista)
      .input('url',      sql.NVarChar(500), audioUrl)
      .input('emoji',    sql.NVarChar(10),  emoji)
      .input('filename', sql.NVarChar(300), req.file.filename)
      .query(`
        INSERT INTO MUSICA_PLAYLIST_PRIVADA (PP_USUARIO_ID, PP_TITULO, PP_ARTISTA, PP_URL, PP_EMOJI, PP_FILENAME)
        VALUES (@uid, @titulo, @artista, @url, @emoji, @filename);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    res.status(201).json({ success: true, data: { id: rs.recordset[0].id, url: audioUrl } });
  } catch (e) {
    // Si hubo error, eliminar archivo subido
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/playlist/general
exports.getGeneral = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        t.PL_ID         AS id,
        t.PL_TITULO     AS titulo,
        t.PL_ARTISTA    AS artista,
        t.PL_URL        AS url,
        t.PL_EMOJI      AS emoji,
        t.PL_USUARIO_ID AS compartidoPor,
        u.NEUS_NOMBRES  AS compartidoPorNombre,
        t.PL_FECHA      AS fechaCompartido
      FROM MUSICA_PLAYLIST_GENERAL t
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.PL_USUARIO_ID
      ORDER BY t.PL_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/playlist/privada  — solo del usuario autenticado
exports.getPrivada = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`
        SELECT
          PP_ID       AS id,
          PP_TITULO   AS titulo,
          PP_ARTISTA  AS artista,
          PP_URL      AS url,
          PP_EMOJI    AS emoji,
          PP_FECHA    AS fechaAgregado
        FROM MUSICA_PLAYLIST_PRIVADA
        WHERE PP_USUARIO_ID = @uid
        ORDER BY PP_ID DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/playlist/privada
exports.addPrivada = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });

    const { titulo, artista, url, emoji } = req.body;
    if (!titulo || !url) {
      return res.status(400).json({ success: false, message: 'titulo y url son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('uid',     sql.Int,          userId)
      .input('titulo',  sql.NVarChar(200), titulo.trim())
      .input('artista', sql.NVarChar(200), (artista || '').trim())
      .input('url',     sql.NVarChar(500), url.trim())
      .input('emoji',   sql.NVarChar(10),  (emoji || '🎵').trim())
      .query(`
        INSERT INTO MUSICA_PLAYLIST_PRIVADA (PP_USUARIO_ID, PP_TITULO, PP_ARTISTA, PP_URL, PP_EMOJI)
        VALUES (@uid, @titulo, @artista, @url, @emoji);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    res.status(201).json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/playlist/privada/:id
exports.deletePrivada = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });

    const trackId = Number(req.params.id);
    if (!trackId) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const check = await pool.request()
      .input('id',  sql.Int, trackId)
      .input('uid', sql.Int, userId)
      .query(`SELECT 1 AS ok FROM MUSICA_PLAYLIST_PRIVADA WHERE PP_ID = @id AND PP_USUARIO_ID = @uid`);

    if (!check.recordset.length) {
      return res.status(404).json({ success: false, message: 'No encontrado o no autorizado' });
    }

    await pool.request()
      .input('id', sql.Int, trackId)
      .query(`DELETE FROM MUSICA_PLAYLIST_PRIVADA WHERE PP_ID = @id`);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/playlist/general/compartir  — comparte un track privado a la lista general
exports.compartirAGeneral = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });

    const trackId = Number(req.body.trackId);
    if (!trackId) return res.status(400).json({ success: false, message: 'trackId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener datos del track privado
    const src = await pool.request()
      .input('id',  sql.Int, trackId)
      .input('uid', sql.Int, userId)
      .query(`SELECT PP_TITULO, PP_ARTISTA, PP_URL, PP_EMOJI FROM MUSICA_PLAYLIST_PRIVADA WHERE PP_ID = @id AND PP_USUARIO_ID = @uid`);

    if (!src.recordset.length) {
      return res.status(404).json({ success: false, message: 'Track no encontrado o no es tuyo' });
    }

    const { PP_TITULO, PP_ARTISTA, PP_URL, PP_EMOJI } = src.recordset[0];

    // Insertar en lista general
    const ins = await pool.request()
      .input('uid',     sql.Int,          userId)
      .input('titulo',  sql.NVarChar(200), PP_TITULO)
      .input('artista', sql.NVarChar(200), PP_ARTISTA)
      .input('url',     sql.NVarChar(500), PP_URL)
      .input('emoji',   sql.NVarChar(10),  PP_EMOJI)
      .query(`
        INSERT INTO MUSICA_PLAYLIST_GENERAL (PL_USUARIO_ID, PL_TITULO, PL_ARTISTA, PL_URL, PL_EMOJI)
        VALUES (@uid, @titulo, @artista, @url, @emoji);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/playlist/general/:id  — solo el dueño o un AD
exports.deleteGeneral = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });

    const trackId = Number(req.params.id);
    if (!trackId) return res.status(400).json({ success: false, message: 'id inválido' });

    const tipoUsuario = (req.user?.tipoUsuario || req.headers['tipousuario'] || '').toUpperCase();
    const isAdmin = ['AD', 'ADMIN', 'ADM'].includes(tipoUsuario);

    const pool = await databaseService.getPool(req.user?.empresa);

    const check = await pool.request()
      .input('id',  sql.Int, trackId)
      .input('uid', sql.Int, userId)
      .query(`SELECT PL_USUARIO_ID FROM MUSICA_PLAYLIST_GENERAL WHERE PL_ID = @id`);

    if (!check.recordset.length) {
      return res.status(404).json({ success: false, message: 'No encontrado' });
    }

    if (!isAdmin && check.recordset[0].PL_USUARIO_ID !== userId) {
      return res.status(403).json({ success: false, message: 'Solo el autor o un admin puede quitarlo' });
    }

    await pool.request()
      .input('id', sql.Int, trackId)
      .query(`DELETE FROM MUSICA_PLAYLIST_GENERAL WHERE PL_ID = @id`);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
