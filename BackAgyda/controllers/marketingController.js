const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const areasController = require('./areasController');
const logger = global.logger || require('../utils/logger');
const { MARKETING_POSTS_DIR } = require('../middleware/marketingPostImagenUpload');

const REDES_VALIDAS = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'otro'];
const ESTATUS_POST = ['borrador', 'programado', 'publicado'];

async function listCampanias(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT MC_ID as id, MC_NOMBRE as nombre, MC_CANAL as canal, MC_ESTATUS as estatus,
               MC_FECHA_INICIO as fechaInicio, MC_FECHA_FIN as fechaFin, MC_PRESUPUESTO as presupuesto
        FROM MARKETING_CAMPANIAS
        ORDER BY MC_ID DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('marketingController.listCampanias', err);
    res.status(500).json({ success: false, message: 'Error al listar campañas' });
  }
}

async function crearCampania(req, res) {
  try {
    const { nombre, canal, estatus, fechaInicio, fechaFin, presupuesto, responsableId } = req.body;
    if (!nombre) {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('canal', sql.NVarChar, canal || null)
      .input('estatus', sql.NVarChar, estatus || 'activa')
      .input('fechaInicio', sql.DateTime, fechaInicio || null)
      .input('fechaFin', sql.DateTime, fechaFin || null)
      .input('presupuesto', sql.Decimal(18, 2), presupuesto || 0)
      .input('responsableId', sql.Int, responsableId || null)
      .query(`
        INSERT INTO MARKETING_CAMPANIAS (MC_NOMBRE, MC_CANAL, MC_ESTATUS, MC_FECHA_INICIO, MC_FECHA_FIN, MC_PRESUPUESTO, MC_RESPONSABLE_ID)
        VALUES (@nombre, @canal, @estatus, @fechaInicio, @fechaFin, @presupuesto, @responsableId)
      `);

    const agg = await pool.request()
      .query(`SELECT COUNT(*) as total FROM MARKETING_CAMPANIAS WHERE MC_ESTATUS = 'activa'`);
    const total = agg.recordset[0]?.total || 0;

    await areasController.upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'marketing',
      kpiKey: 'campanias_activas',
      label: 'Campañas activas',
      valor: total,
      unidad: '',
      tono: 'brand',
      updatedBy: req.user?.id,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.crearCampania', err);
    res.status(500).json({ success: false, message: 'Error al crear campaña' });
  }
}

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const resumen = await pool.request()
      .query(`
        SELECT COUNT(*) as campaniasActivas, SUM(MC_PRESUPUESTO) as presupuestoTotal
        FROM MARKETING_CAMPANIAS
        WHERE MC_ESTATUS = 'activa'
      `);
    const porCanalRs = await pool.request()
      .query(`
        SELECT MC_CANAL as canal, COUNT(*) as count
        FROM MARKETING_CAMPANIAS
        GROUP BY MC_CANAL
      `);

    res.json({
      success: true,
      data: {
        campaniasActivas: resumen.recordset[0]?.campaniasActivas || 0,
        presupuestoTotal: resumen.recordset[0]?.presupuestoTotal || 0,
        porCanal: porCanalRs.recordset,
      },
    });
  } catch (err) {
    logger.error('marketingController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
}

// ── Cuentas de red social ────────────────────────────────────────────────
async function listCuentas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .query(`
        SELECT MRC_ID as id, MRC_NOMBRE as nombre, MRC_RED as red, MRC_HANDLE as handle, MRC_ACTIVA as activa
        FROM MARKETING_REDES_CUENTAS
        ORDER BY MRC_NOMBRE ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('marketingController.listCuentas', err);
    res.status(500).json({ success: false, message: 'Error al listar cuentas' });
  }
}

async function crearCuenta(req, res) {
  try {
    const { nombre, red, handle } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    if (!REDES_VALIDAS.includes(red)) return res.status(400).json({ success: false, message: 'Red social inválida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('red', sql.NVarChar, red)
      .input('handle', sql.NVarChar, handle || null)
      .query(`
        INSERT INTO MARKETING_REDES_CUENTAS (MRC_NOMBRE, MRC_RED, MRC_HANDLE)
        OUTPUT INSERTED.MRC_ID as id
        VALUES (@nombre, @red, @handle);
      `);
    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('marketingController.crearCuenta', err);
    res.status(500).json({ success: false, message: 'Error al crear cuenta' });
  }
}

async function actualizarCuenta(req, res) {
  try {
    const { id } = req.params;
    const { nombre, red, handle, activa } = req.body;
    if (!REDES_VALIDAS.includes(red)) return res.status(400).json({ success: false, message: 'Red social inválida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('red', sql.NVarChar, red)
      .input('handle', sql.NVarChar, handle || null)
      .input('activa', sql.Bit, activa !== false)
      .query(`
        UPDATE MARKETING_REDES_CUENTAS
        SET MRC_NOMBRE=@nombre, MRC_RED=@red, MRC_HANDLE=@handle, MRC_ACTIVA=@activa
        WHERE MRC_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.actualizarCuenta', err);
    res.status(500).json({ success: false, message: 'Error al actualizar cuenta' });
  }
}

async function eliminarCuenta(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const postsRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as total FROM MARKETING_REDES_POSTS WHERE MRP_CUENTA_ID=@id`);
    if (postsRs.recordset[0].total > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: hay publicaciones asociadas a esta cuenta. Desactívala en su lugar.' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_REDES_CUENTAS WHERE MRC_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.eliminarCuenta', err);
    res.status(500).json({ success: false, message: 'Error al eliminar cuenta' });
  }
}

// ── Posts ────────────────────────────────────────────────────────────────
async function listPosts(req, res) {
  try {
    const { cuentaId, estatus, mes } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const condiciones = [];
    const request = pool.request();
    if (cuentaId) { condiciones.push('MRP.MRP_CUENTA_ID = @cuentaId'); request.input('cuentaId', sql.Int, cuentaId); }
    if (estatus) { condiciones.push('MRP.MRP_ESTATUS = @estatus'); request.input('estatus', sql.NVarChar, estatus); }
    if (mes) {
      condiciones.push('FORMAT(COALESCE(MRP.MRP_FECHA_PROGRAMADA, MRP.MRP_CREATED_AT), \'yyyy-MM\') = @mes');
      request.input('mes', sql.NVarChar, mes);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const rs = await request.query(`
      SELECT MRP.MRP_ID as id, MRP.MRP_CUENTA_ID as cuentaId, C.MRC_NOMBRE as cuentaNombre, C.MRC_RED as red,
             MRP.MRP_CAMPANIA_ID as campaniaId, MRP.MRP_TITULO as titulo, MRP.MRP_CONTENIDO as contenido,
             MRP.MRP_ESTATUS as estatus, MRP.MRP_FECHA_PROGRAMADA as fechaProgramada, MRP.MRP_FECHA_PUBLICADO as fechaPublicado,
             MRP.MRP_IMAGEN_ARCHIVO as imagenArchivo, MRP.MRP_IMAGEN_ORIGINAL as imagenOriginal,
             MRP.MRP_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre, MRP.MRP_CREATED_AT as createdAt
      FROM MARKETING_REDES_POSTS MRP
      INNER JOIN MARKETING_REDES_CUENTAS C ON C.MRC_ID = MRP.MRP_CUENTA_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = MRP.MRP_RESPONSABLE_ID
      ${where}
      ORDER BY COALESCE(MRP.MRP_FECHA_PROGRAMADA, MRP.MRP_CREATED_AT) DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('marketingController.listPosts', err);
    res.status(500).json({ success: false, message: 'Error al listar publicaciones' });
  }
}

async function crearPost(req, res) {
  try {
    const { cuentaId, campaniaId, titulo, contenido, fechaProgramada, responsableId, estatus } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    if (!cuentaId) return res.status(400).json({ success: false, message: 'Cuenta requerida' });
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('cuentaId', sql.Int, cuentaId)
      .input('campaniaId', sql.Int, campaniaId || null)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('contenido', sql.NVarChar, contenido || null)
      .input('estatus', sql.NVarChar, ESTATUS_POST.includes(estatus) ? estatus : 'borrador')
      .input('fechaProgramada', sql.DateTime, fechaProgramada || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO MARKETING_REDES_POSTS (MRP_CUENTA_ID, MRP_CAMPANIA_ID, MRP_TITULO, MRP_CONTENIDO, MRP_ESTATUS, MRP_FECHA_PROGRAMADA, MRP_RESPONSABLE_ID, MRP_CREATED_BY)
        OUTPUT INSERTED.MRP_ID as id
        VALUES (@cuentaId, @campaniaId, @titulo, @contenido, @estatus, @fechaProgramada, @responsableId, @createdBy);
      `);
    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('marketingController.crearPost', err);
    res.status(500).json({ success: false, message: 'Error al crear publicación' });
  }
}

async function actualizarPost(req, res) {
  try {
    const { id } = req.params;
    const { cuentaId, campaniaId, titulo, contenido, estatus, fechaProgramada, responsableId } = req.body;
    if (estatus && !ESTATUS_POST.includes(estatus)) {
      return res.status(400).json({ success: false, message: 'Estatus inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('cuentaId', sql.Int, cuentaId)
      .input('campaniaId', sql.Int, campaniaId || null)
      .input('titulo', sql.NVarChar, titulo)
      .input('contenido', sql.NVarChar, contenido || null)
      .input('estatus', sql.NVarChar, estatus || 'borrador')
      .input('fechaProgramada', sql.DateTime, fechaProgramada || null)
      .input('responsableId', sql.Int, responsableId || null)
      .query(`
        UPDATE MARKETING_REDES_POSTS
        SET MRP_CUENTA_ID=@cuentaId, MRP_CAMPANIA_ID=@campaniaId, MRP_TITULO=@titulo, MRP_CONTENIDO=@contenido,
            MRP_ESTATUS=@estatus, MRP_FECHA_PROGRAMADA=@fechaProgramada, MRP_RESPONSABLE_ID=@responsableId,
            MRP_FECHA_PUBLICADO = CASE WHEN @estatus='publicado' AND MRP_FECHA_PUBLICADO IS NULL THEN GETDATE()
                                        WHEN @estatus<>'publicado' THEN NULL
                                        ELSE MRP_FECHA_PUBLICADO END
        WHERE MRP_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.actualizarPost', err);
    res.status(500).json({ success: false, message: 'Error al actualizar publicación' });
  }
}

async function eliminarPost(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MRP_IMAGEN_ARCHIVO as imagenArchivo FROM MARKETING_REDES_POSTS WHERE MRP_ID=@id`);
    const post = rs.recordset[0];
    if (post?.imagenArchivo) {
      try {
        const filePath = path.join(MARKETING_POSTS_DIR, path.basename(post.imagenArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('marketingController.eliminarPost fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_REDES_METRICAS WHERE MRM_POST_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_REDES_POSTS WHERE MRP_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.eliminarPost', err);
    res.status(500).json({ success: false, message: 'Error al eliminar publicación' });
  }
}

// ── Imagen del post ─────────────────────────────────────────────────────
async function subirImagenPost(req, res) {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MRP_IMAGEN_ARCHIVO as imagenArchivo FROM MARKETING_REDES_POSTS WHERE MRP_ID=@id`);
    const post = rs.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Publicación no encontrada' });

    if (post.imagenArchivo) {
      try {
        const oldPath = path.join(MARKETING_POSTS_DIR, path.basename(post.imagenArchivo));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (fsErr) {
        logger.warn('marketingController.subirImagenPost fs', fsErr?.message || fsErr);
      }
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .query(`UPDATE MARKETING_REDES_POSTS SET MRP_IMAGEN_ARCHIVO=@nombreArchivo, MRP_IMAGEN_ORIGINAL=@nombreOriginal WHERE MRP_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.subirImagenPost', err);
    res.status(500).json({ success: false, message: 'Error al subir imagen' });
  }
}

async function verImagenPost(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MRP_IMAGEN_ARCHIVO as imagenArchivo, MRP_IMAGEN_ORIGINAL as imagenOriginal FROM MARKETING_REDES_POSTS WHERE MRP_ID=@id`);
    const post = rs.recordset[0];
    if (!post || !post.imagenArchivo) return res.status(404).json({ success: false, message: 'Imagen no encontrada' });

    const filename = path.basename(post.imagenArchivo);
    const filePath = path.join(MARKETING_POSTS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(post.imagenOriginal || filename)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('marketingController.verImagenPost stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('marketingController.verImagenPost', err);
    res.status(500).json({ success: false, message: 'Error al servir imagen' });
  }
}

// ── Métricas ─────────────────────────────────────────────────────────────
async function guardarMetricas(req, res) {
  try {
    const { id } = req.params;
    const { alcance, interacciones, clics } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const postRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MRP_ESTATUS as estatus FROM MARKETING_REDES_POSTS WHERE MRP_ID=@id`);
    const post = postRs.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Publicación no encontrada' });
    if (post.estatus !== 'publicado') {
      return res.status(400).json({ success: false, message: 'Solo se pueden capturar métricas de publicaciones ya publicadas' });
    }

    await pool.request()
      .input('postId', sql.Int, id)
      .input('alcance', sql.Int, alcance ?? null)
      .input('interacciones', sql.Int, interacciones ?? null)
      .input('clics', sql.Int, clics ?? null)
      .input('capturadoPor', sql.Int, req.user?.id || null)
      .query(`
        MERGE MARKETING_REDES_METRICAS AS target
        USING (SELECT @postId AS MRM_POST_ID) AS src
        ON target.MRM_POST_ID = src.MRM_POST_ID
        WHEN MATCHED THEN UPDATE SET MRM_ALCANCE=@alcance, MRM_INTERACCIONES=@interacciones, MRM_CLICS=@clics,
          MRM_CAPTURADO_POR=@capturadoPor, MRM_CAPTURADO_AT=GETDATE()
        WHEN NOT MATCHED THEN INSERT (MRM_POST_ID, MRM_ALCANCE, MRM_INTERACCIONES, MRM_CLICS, MRM_CAPTURADO_POR)
          VALUES (@postId, @alcance, @interacciones, @clics, @capturadoPor);
      `);

    res.json({ success: true });
  } catch (err) {
    logger.error('marketingController.guardarMetricas', err);
    res.status(500).json({ success: false, message: 'Error al guardar métricas' });
  }
}

async function getMetricas(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT MRM_ALCANCE as alcance, MRM_INTERACCIONES as interacciones, MRM_CLICS as clics, MRM_CAPTURADO_AT as capturadoAt FROM MARKETING_REDES_METRICAS WHERE MRM_POST_ID=@id`);
    res.json({ success: true, data: rs.recordset[0] || null });
  } catch (err) {
    logger.error('marketingController.getMetricas', err);
    res.status(500).json({ success: false, message: 'Error al obtener métricas' });
  }
}

// ── Dashboard de redes ───────────────────────────────────────────────────
async function getDashboardRedes(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const postsRs = await pool.request().query(`
      SELECT
        SUM(CASE WHEN MRP_ESTATUS='programado' AND MONTH(MRP_FECHA_PROGRAMADA)=MONTH(GETDATE()) AND YEAR(MRP_FECHA_PROGRAMADA)=YEAR(GETDATE()) THEN 1 ELSE 0 END) as postsProgramadosMes,
        SUM(CASE WHEN MRP_ESTATUS='publicado' AND MONTH(MRP_FECHA_PUBLICADO)=MONTH(GETDATE()) AND YEAR(MRP_FECHA_PUBLICADO)=YEAR(GETDATE()) THEN 1 ELSE 0 END) as postsPublicadosMes
      FROM MARKETING_REDES_POSTS
    `);

    const cuentasRs = await pool.request().query(`SELECT COUNT(*) as total FROM MARKETING_REDES_CUENTAS WHERE MRC_ACTIVA=1`);

    const alcanceRs = await pool.request().query(`
      SELECT SUM(M.MRM_ALCANCE) as alcanceTotalMes
      FROM MARKETING_REDES_METRICAS M
      INNER JOIN MARKETING_REDES_POSTS P ON P.MRP_ID = M.MRM_POST_ID
      WHERE MONTH(P.MRP_FECHA_PUBLICADO)=MONTH(GETDATE()) AND YEAR(P.MRP_FECHA_PUBLICADO)=YEAR(GETDATE())
    `);

    res.json({
      success: true,
      data: {
        postsProgramadosMes: postsRs.recordset[0]?.postsProgramadosMes || 0,
        postsPublicadosMes: postsRs.recordset[0]?.postsPublicadosMes || 0,
        cuentasActivas: cuentasRs.recordset[0]?.total || 0,
        alcanceTotalMes: alcanceRs.recordset[0]?.alcanceTotalMes || 0,
      },
    });
  } catch (err) {
    logger.error('marketingController.getDashboardRedes', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard de redes' });
  }
}

// ── Resultados consolidados ───────────────────────────────────────────────
function ultimosSeisMeses() {
  const meses = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

async function getResultados(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const [campaniasRs, redesRs, disenoRs, publicidadRs, contenidoRs] = await Promise.all([
      pool.request().query(`SELECT COUNT(*) as campaniasActivas, SUM(MC_PRESUPUESTO) as presupuestoTotal FROM MARKETING_CAMPANIAS WHERE MC_ESTATUS = 'activa'`),
      pool.request().query(`
        SELECT
          SUM(CASE WHEN MRP_ESTATUS='publicado' AND MONTH(MRP_FECHA_PUBLICADO)=MONTH(GETDATE()) AND YEAR(MRP_FECHA_PUBLICADO)=YEAR(GETDATE()) THEN 1 ELSE 0 END) as postsPublicadosMes
        FROM MARKETING_REDES_POSTS
      `),
      pool.request().query(`
        SELECT
          SUM(CASE WHEN DZS_ESTATUS NOT IN ('entregado','cancelada') THEN 1 ELSE 0 END) as enProceso,
          SUM(CASE WHEN DZS_ESTATUS='entregado' AND MONTH(DZS_RESUELTA_AT)=MONTH(GETDATE()) AND YEAR(DZS_RESUELTA_AT)=YEAR(GETDATE()) THEN 1 ELSE 0 END) as entregadasMes
        FROM MARKETING_DISENO_SOLICITUDES
      `),
      pool.request().query(`
        SELECT SUM(CASE WHEN MONTH(PBM_CAPTURADO_AT)=MONTH(GETDATE()) AND YEAR(PBM_CAPTURADO_AT)=YEAR(GETDATE()) THEN PBM_GASTO ELSE 0 END) as gastoMes
        FROM MARKETING_PUBLICIDAD_METRICAS
      `),
      pool.request().query(`
        SELECT SUM(CASE WHEN CNP_ESTATUS='publicado' AND MONTH(CNP_FECHA_PUBLICADO)=MONTH(GETDATE()) AND YEAR(CNP_FECHA_PUBLICADO)=YEAR(GETDATE()) THEN 1 ELSE 0 END) as publicadasMes
        FROM MARKETING_CONTENIDO_PIEZAS
      `),
    ]);

    const snapshot = {
      campaniasActivas: campaniasRs.recordset[0]?.campaniasActivas || 0,
      presupuestoTotal: campaniasRs.recordset[0]?.presupuestoTotal || 0,
      postsPublicadosMes: redesRs.recordset[0]?.postsPublicadosMes || 0,
      disenoEnProceso: disenoRs.recordset[0]?.enProceso || 0,
      disenoEntregadasMes: disenoRs.recordset[0]?.entregadasMes || 0,
      gastoPublicidadMes: publicidadRs.recordset[0]?.gastoMes || 0,
      piezasPublicadasMes: contenidoRs.recordset[0]?.publicadasMes || 0,
    };

    const [tendRedes, tendDiseno, tendPublicidad, tendContenido] = await Promise.all([
      pool.request().query(`
        SELECT FORMAT(MRP_FECHA_PUBLICADO, 'yyyy-MM') as mes, COUNT(*) as total
        FROM MARKETING_REDES_POSTS
        WHERE MRP_ESTATUS='publicado' AND MRP_FECHA_PUBLICADO >= DATEADD(MONTH, -5, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        GROUP BY FORMAT(MRP_FECHA_PUBLICADO, 'yyyy-MM')
      `),
      pool.request().query(`
        SELECT FORMAT(DZS_RESUELTA_AT, 'yyyy-MM') as mes, COUNT(*) as total
        FROM MARKETING_DISENO_SOLICITUDES
        WHERE DZS_ESTATUS='entregado' AND DZS_RESUELTA_AT >= DATEADD(MONTH, -5, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        GROUP BY FORMAT(DZS_RESUELTA_AT, 'yyyy-MM')
      `),
      pool.request().query(`
        SELECT FORMAT(PBM_CAPTURADO_AT, 'yyyy-MM') as mes, SUM(PBM_GASTO) as total
        FROM MARKETING_PUBLICIDAD_METRICAS
        WHERE PBM_CAPTURADO_AT >= DATEADD(MONTH, -5, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        GROUP BY FORMAT(PBM_CAPTURADO_AT, 'yyyy-MM')
      `),
      pool.request().query(`
        SELECT FORMAT(CNP_FECHA_PUBLICADO, 'yyyy-MM') as mes, COUNT(*) as total
        FROM MARKETING_CONTENIDO_PIEZAS
        WHERE CNP_ESTATUS='publicado' AND CNP_FECHA_PUBLICADO >= DATEADD(MONTH, -5, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        GROUP BY FORMAT(CNP_FECHA_PUBLICADO, 'yyyy-MM')
      `),
    ]);

    const mapa = (rs) => new Map(rs.recordset.map((r) => [r.mes, r.total || 0]));
    const mRedes = mapa(tendRedes);
    const mDiseno = mapa(tendDiseno);
    const mPublicidad = mapa(tendPublicidad);
    const mContenido = mapa(tendContenido);

    const tendencia = ultimosSeisMeses().map((mes) => ({
      mes,
      postsPublicados: mRedes.get(mes) || 0,
      solicitudesEntregadas: mDiseno.get(mes) || 0,
      gastoPublicidad: mPublicidad.get(mes) || 0,
      piezasPublicadas: mContenido.get(mes) || 0,
    }));

    res.json({ success: true, data: { snapshot, tendencia } });
  } catch (err) {
    logger.error('marketingController.getResultados', err);
    res.status(500).json({ success: false, message: 'Error al obtener resultados' });
  }
}

module.exports = {
  listCampanias,
  crearCampania,
  getDashboard,
  listCuentas,
  crearCuenta,
  actualizarCuenta,
  eliminarCuenta,
  listPosts,
  crearPost,
  actualizarPost,
  eliminarPost,
  subirImagenPost,
  verImagenPost,
  guardarMetricas,
  getMetricas,
  getDashboardRedes,
  getResultados,
};
