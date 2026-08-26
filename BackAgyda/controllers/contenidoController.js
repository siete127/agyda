const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { CONTENIDO_ADJUNTOS_DIR } = require('../middleware/contenidoAdjuntoUpload');

const ESTATUS_VALIDOS = ['idea', 'en_redaccion', 'en_revision', 'aprobado', 'publicado'];
const TIPOS_ADJUNTO_VALIDOS = ['borrador', 'final'];

// ── Tipos de canal editorial ───────────────────────────────────────────────
async function listTipos(req, res) {
  try {
    const soloActivos = req.query.soloActivos !== 'false';
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT CNT_ID as id, CNT_NOMBRE as nombre, CNT_DESCRIPCION as descripcion, CNT_ICONO as icono, CNT_COLOR as color,
             CNT_ACTIVO as activo, CNT_ORDEN as orden
      FROM MARKETING_CONTENIDO_TIPOS
      ${soloActivos ? 'WHERE CNT_ACTIVO = 1' : ''}
      ORDER BY CNT_ORDEN, CNT_NOMBRE
    `);
    res.json({ success: true, data: rs.recordset.map((t) => ({ ...t, activo: !!t.activo })) });
  } catch (err) {
    logger.error('contenidoController.listTipos', err);
    res.status(500).json({ success: false, message: 'Error al obtener tipos de contenido' });
  }
}

async function crearTipo(req, res) {
  try {
    const { nombre, descripcion, icono, color, orden } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('icono', sql.NVarChar, icono || null)
      .input('color', sql.NVarChar, color || null)
      .input('orden', sql.Int, orden || 0)
      .query(`
        INSERT INTO MARKETING_CONTENIDO_TIPOS (CNT_NOMBRE, CNT_DESCRIPCION, CNT_ICONO, CNT_COLOR, CNT_ORDEN)
        OUTPUT INSERTED.CNT_ID as id
        VALUES (@nombre, @descripcion, @icono, @color, @orden);
      `);
    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('contenidoController.crearTipo', err);
    res.status(500).json({ success: false, message: 'Error al crear tipo de contenido' });
  }
}

async function actualizarTipo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, icono, color, activo, orden } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('icono', sql.NVarChar, icono || null)
      .input('color', sql.NVarChar, color || null)
      .input('activo', sql.Bit, activo === false ? 0 : 1)
      .input('orden', sql.Int, orden || 0)
      .query(`
        UPDATE MARKETING_CONTENIDO_TIPOS
        SET CNT_NOMBRE=@nombre, CNT_DESCRIPCION=@descripcion, CNT_ICONO=@icono, CNT_COLOR=@color,
            CNT_ACTIVO=@activo, CNT_ORDEN=@orden
        WHERE CNT_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.actualizarTipo', err);
    res.status(500).json({ success: false, message: 'Error al actualizar tipo de contenido' });
  }
}

async function eliminarTipo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const activasRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as total FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_TIPO_ID=@id AND CNP_ESTATUS <> 'publicado'`);
    if (activasRs.recordset[0].total > 0) {
      return res.status(400).json({ success: false, message: 'Hay piezas activas con este tipo, resuélvelas primero' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE MARKETING_CONTENIDO_TIPOS SET CNT_ACTIVO=0 WHERE CNT_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.eliminarTipo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar tipo de contenido' });
  }
}

// ── Piezas de contenido ──────────────────────────────────────────────────
const SELECT_PIEZA_BASE = `
  SELECT CNP.CNP_ID as id, CNP.CNP_TIPO_ID as tipoId, CNT.CNT_NOMBRE as tipoNombre, CNT.CNT_ICONO as tipoIcono, CNT.CNT_COLOR as tipoColor,
         CNP.CNP_TITULO as titulo, CNP.CNP_BRIEF as brief, CNP.CNP_CONTENIDO as contenido,
         CNP.CNP_AUTOR_ID as autorId, AU.NEUS_NOMBRES as autorNombre,
         CNP.CNP_REVISOR_ID as revisorId, RU.NEUS_NOMBRES as revisorNombre,
         CNP.CNP_ESTATUS as estatus, CNP.CNP_FECHA_PROGRAMADA as fechaProgramada, CNP.CNP_FECHA_PUBLICADO as fechaPublicado,
         CNP.CNP_CAMPANIA_ID as campaniaId, CNP.CNP_POST_ID as postId,
         CNP.CNP_CREATED_AT as createdAt
  FROM MARKETING_CONTENIDO_PIEZAS CNP
  INNER JOIN MARKETING_CONTENIDO_TIPOS CNT ON CNT.CNT_ID = CNP.CNP_TIPO_ID
  LEFT JOIN NEUS_USUARIOS AU ON AU.NEUS_ID = CNP.CNP_AUTOR_ID
  LEFT JOIN NEUS_USUARIOS RU ON RU.NEUS_ID = CNP.CNP_REVISOR_ID
`;

async function listPiezas(req, res) {
  try {
    const { tipoId, estatus, autorId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    const where = [];

    if (tipoId) { request.input('tipoId', sql.Int, tipoId); where.push('CNP.CNP_TIPO_ID = @tipoId'); }
    if (estatus && ESTATUS_VALIDOS.includes(estatus)) { request.input('estatus', sql.NVarChar, estatus); where.push('CNP.CNP_ESTATUS = @estatus'); }
    if (autorId) { request.input('autorId', sql.Int, autorId); where.push('CNP.CNP_AUTOR_ID = @autorId'); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rs = await request.query(`${SELECT_PIEZA_BASE} ${whereSql} ORDER BY COALESCE(CNP.CNP_FECHA_PROGRAMADA, CNP.CNP_CREATED_AT) DESC`);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('contenidoController.listPiezas', err);
    res.status(500).json({ success: false, message: 'Error al obtener piezas de contenido' });
  }
}

async function getResumen(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ESTATUS IN ('idea','en_redaccion')) as enRedaccion,
        (SELECT COUNT(*) FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ESTATUS = 'en_revision') as enRevision,
        (SELECT COUNT(*) FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ESTATUS = 'aprobado') as aprobadas,
        (SELECT COUNT(*) FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ESTATUS = 'publicado' AND MONTH(CNP_FECHA_PUBLICADO)=MONTH(GETDATE()) AND YEAR(CNP_FECHA_PUBLICADO)=YEAR(GETDATE())) as publicadasMes
    `);
    res.json({ success: true, data: rs.recordset[0] });
  } catch (err) {
    logger.error('contenidoController.getResumen', err);
    res.status(500).json({ success: false, message: 'Error al obtener resumen' });
  }
}

async function crearPieza(req, res) {
  try {
    const { tipoId, titulo, brief, contenido, revisorId, fechaProgramada, campaniaId, postId } = req.body;
    if (!tipoId) return res.status(400).json({ success: false, message: 'Tipo de contenido requerido' });
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tipoRs = await pool.request().input('tipoId', sql.Int, tipoId)
      .query(`SELECT CNT_ACTIVO as activo FROM MARKETING_CONTENIDO_TIPOS WHERE CNT_ID=@tipoId`);
    if (!tipoRs.recordset[0]?.activo) return res.status(400).json({ success: false, message: 'Tipo de contenido inválido' });

    const autorId = req.user?.id || null;
    const rs = await pool.request()
      .input('tipoId', sql.Int, tipoId)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('brief', sql.NVarChar, brief || null)
      .input('contenido', sql.NVarChar, contenido || null)
      .input('autorId', sql.Int, autorId)
      .input('revisorId', sql.Int, revisorId || null)
      .input('fechaProgramada', sql.DateTime, fechaProgramada || null)
      .input('campaniaId', sql.Int, campaniaId || null)
      .input('postId', sql.Int, postId || null)
      .input('createdBy', sql.Int, autorId)
      .query(`
        INSERT INTO MARKETING_CONTENIDO_PIEZAS (CNP_TIPO_ID, CNP_TITULO, CNP_BRIEF, CNP_CONTENIDO, CNP_AUTOR_ID, CNP_REVISOR_ID, CNP_FECHA_PROGRAMADA, CNP_CAMPANIA_ID, CNP_POST_ID, CNP_CREATED_BY)
        OUTPUT INSERTED.CNP_ID as id
        VALUES (@tipoId, @titulo, @brief, @contenido, @autorId, @revisorId, @fechaProgramada, @campaniaId, @postId, @createdBy);
      `);

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('contenidoController.crearPieza', err);
    res.status(500).json({ success: false, message: 'Error al crear pieza de contenido' });
  }
}

async function actualizarPieza(req, res) {
  try {
    const { id } = req.params;
    const { tipoId, titulo, brief, contenido, estatus, autorId, revisorId, fechaProgramada, campaniaId, postId } = req.body;
    if (estatus && !ESTATUS_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('tipoId', sql.Int, tipoId)
      .input('titulo', sql.NVarChar, titulo)
      .input('brief', sql.NVarChar, brief || null)
      .input('contenido', sql.NVarChar, contenido || null)
      .input('estatus', sql.NVarChar, estatus || 'idea')
      .input('autorId', sql.Int, autorId || null)
      .input('revisorId', sql.Int, revisorId || null)
      .input('fechaProgramada', sql.DateTime, fechaProgramada || null)
      .input('campaniaId', sql.Int, campaniaId || null)
      .input('postId', sql.Int, postId || null)
      .query(`
        UPDATE MARKETING_CONTENIDO_PIEZAS
        SET CNP_TIPO_ID=@tipoId, CNP_TITULO=@titulo, CNP_BRIEF=@brief, CNP_CONTENIDO=@contenido, CNP_ESTATUS=@estatus,
            CNP_AUTOR_ID=@autorId, CNP_REVISOR_ID=@revisorId, CNP_FECHA_PROGRAMADA=@fechaProgramada,
            CNP_CAMPANIA_ID=@campaniaId, CNP_POST_ID=@postId,
            CNP_FECHA_PUBLICADO = CASE WHEN @estatus='publicado' AND CNP_FECHA_PUBLICADO IS NULL THEN GETDATE()
                                        WHEN @estatus<>'publicado' THEN NULL
                                        ELSE CNP_FECHA_PUBLICADO END
        WHERE CNP_ID=@id
      `);

    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.actualizarPieza', err);
    res.status(500).json({ success: false, message: 'Error al actualizar pieza de contenido' });
  }
}

async function eliminarPieza(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const adjuntosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNA_NOMBRE_ARCHIVO as nombreArchivo FROM MARKETING_CONTENIDO_ADJUNTOS WHERE CNA_PIEZA_ID=@id`);
    for (const adj of adjuntosRs.recordset) {
      try {
        const filePath = path.join(CONTENIDO_ADJUNTOS_DIR, path.basename(adj.nombreArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('contenidoController.eliminarPieza fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_CONTENIDO_ADJUNTOS WHERE CNA_PIEZA_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_CONTENIDO_COMENTARIOS WHERE CNC_PIEZA_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.eliminarPieza', err);
    res.status(500).json({ success: false, message: 'Error al eliminar pieza de contenido' });
  }
}

async function enviarARevision(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNP_ESTATUS as estatus, CNP_AUTOR_ID as autorId FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ID=@id`);
    const pieza = rs.recordset[0];
    if (!pieza) return res.status(404).json({ success: false, message: 'Pieza no encontrada' });
    if (pieza.autorId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el autor puede enviar la pieza a revisión' });
    }
    if (!['idea', 'en_redaccion'].includes(pieza.estatus)) {
      return res.status(400).json({ success: false, message: 'Solo se pueden enviar a revisión piezas en redacción' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE MARKETING_CONTENIDO_PIEZAS SET CNP_ESTATUS='en_revision' WHERE CNP_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.enviarARevision', err);
    res.status(500).json({ success: false, message: 'Error al enviar a revisión' });
  }
}

async function aprobarPieza(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNP_ESTATUS as estatus, CNP_REVISOR_ID as revisorId FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ID=@id`);
    const pieza = rs.recordset[0];
    if (!pieza) return res.status(404).json({ success: false, message: 'Pieza no encontrada' });
    if (pieza.revisorId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el revisor puede aprobar la pieza' });
    }
    if (pieza.estatus !== 'en_revision') {
      return res.status(400).json({ success: false, message: 'Solo se pueden aprobar piezas en revisión' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE MARKETING_CONTENIDO_PIEZAS SET CNP_ESTATUS='aprobado' WHERE CNP_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.aprobarPieza', err);
    res.status(500).json({ success: false, message: 'Error al aprobar la pieza' });
  }
}

async function solicitarCambios(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo || !motivo.trim()) return res.status(400).json({ success: false, message: 'El motivo es requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNP_ESTATUS as estatus, CNP_REVISOR_ID as revisorId FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ID=@id`);
    const pieza = rs.recordset[0];
    if (!pieza) return res.status(404).json({ success: false, message: 'Pieza no encontrada' });
    if (pieza.revisorId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo el revisor puede solicitar cambios' });
    }
    if (pieza.estatus !== 'en_revision') {
      return res.status(400).json({ success: false, message: 'Solo se pueden pedir cambios en piezas en revisión' });
    }
    await pool.request().input('id', sql.Int, id).query(`UPDATE MARKETING_CONTENIDO_PIEZAS SET CNP_ESTATUS='en_redaccion' WHERE CNP_ID=@id`);

    await pool.request()
      .input('piezaId', sql.Int, id)
      .input('usuarioId', sql.Int, req.user?.id || null)
      .input('texto', sql.NVarChar, `Cambios solicitados: ${motivo.trim()}`)
      .query(`INSERT INTO MARKETING_CONTENIDO_COMENTARIOS (CNC_PIEZA_ID, CNC_USUARIO_ID, CNC_TEXTO) VALUES (@piezaId, @usuarioId, @texto);`);

    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.solicitarCambios', err);
    res.status(500).json({ success: false, message: 'Error al solicitar cambios' });
  }
}

// ── Comentarios ──────────────────────────────────────────────────────────
async function listComentarios(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('piezaId', sql.Int, id)
      .query(`
        SELECT CNC.CNC_ID as id, CNC.CNC_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre, CNC.CNC_TEXTO as texto, CNC.CNC_CREATED_AT as createdAt
        FROM MARKETING_CONTENIDO_COMENTARIOS CNC
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CNC.CNC_USUARIO_ID
        WHERE CNC.CNC_PIEZA_ID=@piezaId
        ORDER BY CNC.CNC_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('contenidoController.listComentarios', err);
    res.status(500).json({ success: false, message: 'Error al obtener comentarios' });
  }
}

async function crearComentario(req, res) {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'Texto requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const rs = await pool.request()
      .input('piezaId', sql.Int, id)
      .input('usuarioId', sql.Int, usuarioId)
      .input('texto', sql.NVarChar, texto.trim())
      .query(`
        INSERT INTO MARKETING_CONTENIDO_COMENTARIOS (CNC_PIEZA_ID, CNC_USUARIO_ID, CNC_TEXTO)
        OUTPUT INSERTED.CNC_ID as id
        VALUES (@piezaId, @usuarioId, @texto);
      `);
    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('contenidoController.crearComentario', err);
    res.status(500).json({ success: false, message: 'Error al crear comentario' });
  }
}

async function eliminarComentario(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNC_USUARIO_ID as usuarioId FROM MARKETING_CONTENIDO_COMENTARIOS WHERE CNC_ID=@id`);
    const comentario = rs.recordset[0];
    if (!comentario) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    if (comentario.usuarioId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar tus propios comentarios' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_CONTENIDO_COMENTARIOS WHERE CNC_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.eliminarComentario', err);
    res.status(500).json({ success: false, message: 'Error al eliminar comentario' });
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
async function listAdjuntos(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('piezaId', sql.Int, id)
      .query(`
        SELECT CNA.CNA_ID as id, CNA.CNA_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as autorNombre,
               CNA.CNA_TIPO as tipo, CNA.CNA_NOMBRE_ORIGINAL as nombreOriginal, CNA.CNA_MIME as mime, CNA.CNA_TAMANIO as tamanio, CNA.CNA_CREATED_AT as createdAt
        FROM MARKETING_CONTENIDO_ADJUNTOS CNA
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CNA.CNA_USUARIO_ID
        WHERE CNA.CNA_PIEZA_ID=@piezaId
        ORDER BY CNA.CNA_CREATED_AT DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('contenidoController.listAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos' });
  }
}

async function subirAdjuntos(req, res) {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const tipo = TIPOS_ADJUNTO_VALIDOS.includes(req.body.tipo) ? req.body.tipo : 'borrador';
    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarioId = req.user?.id || null;

    const piezaRs = await pool.request().input('id', sql.Int, id).query(`SELECT CNP_ID as id FROM MARKETING_CONTENIDO_PIEZAS WHERE CNP_ID=@id`);
    if (!piezaRs.recordset[0]) return res.status(404).json({ success: false, message: 'Pieza no encontrada' });

    for (const file of req.files) {
      await pool.request()
        .input('piezaId', sql.Int, id)
        .input('usuarioId', sql.Int, usuarioId)
        .input('tipo', sql.NVarChar, tipo)
        .input('nombreArchivo', sql.NVarChar, file.filename)
        .input('nombreOriginal', sql.NVarChar, file.originalname)
        .input('mime', sql.NVarChar, file.mimetype)
        .input('tamanio', sql.Int, file.size)
        .query(`
          INSERT INTO MARKETING_CONTENIDO_ADJUNTOS (CNA_PIEZA_ID, CNA_USUARIO_ID, CNA_TIPO, CNA_NOMBRE_ARCHIVO, CNA_NOMBRE_ORIGINAL, CNA_MIME, CNA_TAMANIO)
          VALUES (@piezaId, @usuarioId, @tipo, @nombreArchivo, @nombreOriginal, @mime, @tamanio);
        `);
    }

    res.json({ success: true, data: { cantidad: req.files.length } });
  } catch (err) {
    logger.error('contenidoController.subirAdjuntos', err);
    res.status(500).json({ success: false, message: 'Error al subir adjuntos' });
  }
}

async function eliminarAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`
        SELECT CNA.CNA_USUARIO_ID as usuarioId, CNA.CNA_NOMBRE_ARCHIVO as nombreArchivo, CNP.CNP_AUTOR_ID as autorId
        FROM MARKETING_CONTENIDO_ADJUNTOS CNA
        INNER JOIN MARKETING_CONTENIDO_PIEZAS CNP ON CNP.CNP_ID = CNA.CNA_PIEZA_ID
        WHERE CNA.CNA_ID=@id
      `);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    if (adjunto.usuarioId !== req.user?.id && adjunto.autorId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Solo quien subió el archivo o el autor pueden eliminarlo' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_CONTENIDO_ADJUNTOS WHERE CNA_ID=@id`);

    try {
      const filePath = path.join(CONTENIDO_ADJUNTOS_DIR, path.basename(adjunto.nombreArchivo));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      logger.warn('contenidoController.eliminarAdjunto fs', fsErr?.message || fsErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('contenidoController.eliminarAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al eliminar adjunto' });
  }
}

async function verAdjunto(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT CNA_NOMBRE_ARCHIVO as nombreArchivo, CNA_NOMBRE_ORIGINAL as nombreOriginal FROM MARKETING_CONTENIDO_ADJUNTOS WHERE CNA_ID=@id`);
    const adjunto = rs.recordset[0];
    if (!adjunto) return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });

    const filename = path.basename(adjunto.nombreArchivo);
    const filePath = path.join(CONTENIDO_ADJUNTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('contenidoController.verAdjunto stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('contenidoController.verAdjunto', err);
    res.status(500).json({ success: false, message: 'Error al servir adjunto' });
  }
}

module.exports = {
  listTipos,
  crearTipo,
  actualizarTipo,
  eliminarTipo,
  listPiezas,
  getResumen,
  crearPieza,
  actualizarPieza,
  eliminarPieza,
  enviarARevision,
  aprobarPieza,
  solicitarCambios,
  listComentarios,
  crearComentario,
  eliminarComentario,
  listAdjuntos,
  subirAdjuntos,
  eliminarAdjunto,
  verAdjunto,
};
