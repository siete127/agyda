const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const databaseService = require('../services/databaseService');
const logger = global.logger || require('../utils/logger');
const { PUBLICIDAD_IMAGENES_DIR } = require('../middleware/publicidadImagenUpload');

const PLATAFORMAS_VALIDAS = ['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads', 'otro'];
const ESTATUS_CAMPANIA_VALIDOS = ['planeada', 'activa', 'pausada', 'finalizada'];
const ESTATUS_ANUNCIO_VALIDOS = ['activo', 'pausado', 'finalizado'];

// ── Campañas ─────────────────────────────────────────────────────────────
async function listCampanias(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT PBC.PBC_ID as id, PBC.PBC_NOMBRE as nombre, PBC.PBC_PLATAFORMA as plataforma, PBC.PBC_OBJETIVO as objetivo,
             PBC.PBC_PRESUPUESTO as presupuesto, PBC.PBC_FECHA_INICIO as fechaInicio, PBC.PBC_FECHA_FIN as fechaFin,
             PBC.PBC_ESTATUS as estatus, PBC.PBC_RESPONSABLE_ID as responsableId, U.NEUS_NOMBRES as responsableNombre,
             PBC.PBC_CAMPANIA_ID as campaniaId, PBC.PBC_CREATED_AT as createdAt
      FROM MARKETING_PUBLICIDAD_CAMPANIAS PBC
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = PBC.PBC_RESPONSABLE_ID
      ORDER BY PBC.PBC_CREATED_AT DESC
    `);

    const campanias = rs.recordset;
    const ids = campanias.map((c) => c.id);
    let anunciosPorCampania = new Map();
    let gastoPorCampania = new Map();

    if (ids.length) {
      const anunciosRs = await pool.request()
        .query(`SELECT PBA_CAMPANIA_ID as campaniaId, COUNT(*) as total FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_CAMPANIA_ID IN (${ids.join(',')}) GROUP BY PBA_CAMPANIA_ID`);
      anunciosPorCampania = new Map(anunciosRs.recordset.map((a) => [a.campaniaId, a.total]));

      const gastoRs = await pool.request().query(`
        SELECT PBA.PBA_CAMPANIA_ID as campaniaId, SUM(PBM.PBM_GASTO) as gasto
        FROM MARKETING_PUBLICIDAD_METRICAS PBM
        INNER JOIN MARKETING_PUBLICIDAD_ANUNCIOS PBA ON PBA.PBA_ID = PBM.PBM_ANUNCIO_ID
        WHERE PBA.PBA_CAMPANIA_ID IN (${ids.join(',')})
        GROUP BY PBA.PBA_CAMPANIA_ID
      `);
      gastoPorCampania = new Map(gastoRs.recordset.map((g) => [g.campaniaId, g.gasto || 0]));
    }

    const data = campanias.map((c) => ({
      ...c,
      anunciosTotal: anunciosPorCampania.get(c.id) || 0,
      gastoTotal: gastoPorCampania.get(c.id) || 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    logger.error('publicidadController.listCampanias', err);
    res.status(500).json({ success: false, message: 'Error al listar campañas publicitarias' });
  }
}

async function crearCampania(req, res) {
  try {
    const { nombre, plataforma, objetivo, presupuesto, fechaInicio, fechaFin, responsableId, campaniaId } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    if (!PLATAFORMAS_VALIDAS.includes(plataforma)) return res.status(400).json({ success: false, message: 'Plataforma inválida' });
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('plataforma', sql.NVarChar, plataforma)
      .input('objetivo', sql.NVarChar, objetivo || null)
      .input('presupuesto', sql.Decimal(18, 2), presupuesto || null)
      .input('fechaInicio', sql.Date, fechaInicio || null)
      .input('fechaFin', sql.Date, fechaFin || null)
      .input('responsableId', sql.Int, responsableId || null)
      .input('campaniaId', sql.Int, campaniaId || null)
      .query(`
        INSERT INTO MARKETING_PUBLICIDAD_CAMPANIAS (PBC_NOMBRE, PBC_PLATAFORMA, PBC_OBJETIVO, PBC_PRESUPUESTO, PBC_FECHA_INICIO, PBC_FECHA_FIN, PBC_RESPONSABLE_ID, PBC_CAMPANIA_ID)
        OUTPUT INSERTED.PBC_ID as id
        VALUES (@nombre, @plataforma, @objetivo, @presupuesto, @fechaInicio, @fechaFin, @responsableId, @campaniaId);
      `);

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('publicidadController.crearCampania', err);
    res.status(500).json({ success: false, message: 'Error al crear campaña publicitaria' });
  }
}

async function actualizarCampania(req, res) {
  try {
    const { id } = req.params;
    const { nombre, plataforma, objetivo, presupuesto, fechaInicio, fechaFin, estatus, responsableId, campaniaId } = req.body;
    if (!PLATAFORMAS_VALIDAS.includes(plataforma)) return res.status(400).json({ success: false, message: 'Plataforma inválida' });
    if (estatus && !ESTATUS_CAMPANIA_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('plataforma', sql.NVarChar, plataforma)
      .input('objetivo', sql.NVarChar, objetivo || null)
      .input('presupuesto', sql.Decimal(18, 2), presupuesto || null)
      .input('fechaInicio', sql.Date, fechaInicio || null)
      .input('fechaFin', sql.Date, fechaFin || null)
      .input('estatus', sql.NVarChar, estatus || 'planeada')
      .input('responsableId', sql.Int, responsableId || null)
      .input('campaniaId', sql.Int, campaniaId || null)
      .query(`
        UPDATE MARKETING_PUBLICIDAD_CAMPANIAS
        SET PBC_NOMBRE=@nombre, PBC_PLATAFORMA=@plataforma, PBC_OBJETIVO=@objetivo, PBC_PRESUPUESTO=@presupuesto,
            PBC_FECHA_INICIO=@fechaInicio, PBC_FECHA_FIN=@fechaFin, PBC_ESTATUS=@estatus,
            PBC_RESPONSABLE_ID=@responsableId, PBC_CAMPANIA_ID=@campaniaId
        WHERE PBC_ID=@id
      `);

    res.json({ success: true });
  } catch (err) {
    logger.error('publicidadController.actualizarCampania', err);
    res.status(500).json({ success: false, message: 'Error al actualizar campaña publicitaria' });
  }
}

async function eliminarCampania(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const anunciosRs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PBA_ID as id, PBA_IMAGEN_ARCHIVO as imagenArchivo FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_CAMPANIA_ID=@id`);
    for (const anuncio of anunciosRs.recordset) {
      if (anuncio.imagenArchivo) {
        try {
          const filePath = path.join(PUBLICIDAD_IMAGENES_DIR, path.basename(anuncio.imagenArchivo));
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (fsErr) {
          logger.warn('publicidadController.eliminarCampania fs', fsErr?.message || fsErr);
        }
      }
    }

    await pool.request().input('id', sql.Int, id).query(`
      DELETE FROM MARKETING_PUBLICIDAD_METRICAS WHERE PBM_ANUNCIO_ID IN (SELECT PBA_ID FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_CAMPANIA_ID=@id)
    `);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_CAMPANIA_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_PUBLICIDAD_CAMPANIAS WHERE PBC_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('publicidadController.eliminarCampania', err);
    res.status(500).json({ success: false, message: 'Error al eliminar campaña publicitaria' });
  }
}

// ── Anuncios ─────────────────────────────────────────────────────────────
async function listAnuncios(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('campaniaId', sql.Int, id)
      .query(`
        SELECT PBA_ID as id, PBA_CAMPANIA_ID as campaniaId, PBA_TITULO as titulo, PBA_COPY as copy,
               PBA_PRESUPUESTO as presupuesto, PBA_ESTATUS as estatus, PBA_IMAGEN_ARCHIVO as imagenArchivo,
               PBA_IMAGEN_ORIGINAL as imagenOriginal, PBA_CREATED_AT as createdAt
        FROM MARKETING_PUBLICIDAD_ANUNCIOS
        WHERE PBA_CAMPANIA_ID=@campaniaId
        ORDER BY PBA_CREATED_AT ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('publicidadController.listAnuncios', err);
    res.status(500).json({ success: false, message: 'Error al listar anuncios' });
  }
}

async function crearAnuncio(req, res) {
  try {
    const { id } = req.params;
    const { titulo, copy, presupuesto } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, message: 'Título requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request()
      .input('campaniaId', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo.trim())
      .input('copy', sql.NVarChar, copy || null)
      .input('presupuesto', sql.Decimal(18, 2), presupuesto || null)
      .query(`
        INSERT INTO MARKETING_PUBLICIDAD_ANUNCIOS (PBA_CAMPANIA_ID, PBA_TITULO, PBA_COPY, PBA_PRESUPUESTO)
        OUTPUT INSERTED.PBA_ID as id
        VALUES (@campaniaId, @titulo, @copy, @presupuesto);
      `);

    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (err) {
    logger.error('publicidadController.crearAnuncio', err);
    res.status(500).json({ success: false, message: 'Error al crear anuncio' });
  }
}

async function actualizarAnuncio(req, res) {
  try {
    const { id } = req.params;
    const { titulo, copy, presupuesto, estatus } = req.body;
    if (estatus && !ESTATUS_ANUNCIO_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('copy', sql.NVarChar, copy || null)
      .input('presupuesto', sql.Decimal(18, 2), presupuesto || null)
      .input('estatus', sql.NVarChar, estatus || 'activo')
      .query(`
        UPDATE MARKETING_PUBLICIDAD_ANUNCIOS
        SET PBA_TITULO=@titulo, PBA_COPY=@copy, PBA_PRESUPUESTO=@presupuesto, PBA_ESTATUS=@estatus
        WHERE PBA_ID=@id
      `);

    res.json({ success: true });
  } catch (err) {
    logger.error('publicidadController.actualizarAnuncio', err);
    res.status(500).json({ success: false, message: 'Error al actualizar anuncio' });
  }
}

async function eliminarAnuncio(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PBA_IMAGEN_ARCHIVO as imagenArchivo FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_ID=@id`);
    const anuncio = rs.recordset[0];
    if (anuncio?.imagenArchivo) {
      try {
        const filePath = path.join(PUBLICIDAD_IMAGENES_DIR, path.basename(anuncio.imagenArchivo));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsErr) {
        logger.warn('publicidadController.eliminarAnuncio fs', fsErr?.message || fsErr);
      }
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_PUBLICIDAD_METRICAS WHERE PBM_ANUNCIO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('publicidadController.eliminarAnuncio', err);
    res.status(500).json({ success: false, message: 'Error al eliminar anuncio' });
  }
}

// ── Imagen del anuncio ────────────────────────────────────────────────────
async function subirImagenAnuncio(req, res) {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'Ningún archivo recibido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PBA_IMAGEN_ARCHIVO as imagenArchivo FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_ID=@id`);
    const anuncio = rs.recordset[0];
    if (!anuncio) return res.status(404).json({ success: false, message: 'Anuncio no encontrado' });

    if (anuncio.imagenArchivo) {
      try {
        const oldPath = path.join(PUBLICIDAD_IMAGENES_DIR, path.basename(anuncio.imagenArchivo));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (fsErr) {
        logger.warn('publicidadController.subirImagenAnuncio fs', fsErr?.message || fsErr);
      }
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('nombreOriginal', sql.NVarChar, req.file.originalname)
      .query(`UPDATE MARKETING_PUBLICIDAD_ANUNCIOS SET PBA_IMAGEN_ARCHIVO=@nombreArchivo, PBA_IMAGEN_ORIGINAL=@nombreOriginal WHERE PBA_ID=@id`);

    res.json({ success: true });
  } catch (err) {
    logger.error('publicidadController.subirImagenAnuncio', err);
    res.status(500).json({ success: false, message: 'Error al subir imagen' });
  }
}

async function verImagenAnuncio(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PBA_IMAGEN_ARCHIVO as imagenArchivo, PBA_IMAGEN_ORIGINAL as imagenOriginal FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_ID=@id`);
    const anuncio = rs.recordset[0];
    if (!anuncio || !anuncio.imagenArchivo) return res.status(404).json({ success: false, message: 'Imagen no encontrada' });

    const filename = path.basename(anuncio.imagenArchivo);
    const filePath = path.join(PUBLICIDAD_IMAGENES_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) return res.status(403).json({ success: false, message: 'Tipo de archivo no permitido' });

    res.setHeader('Content-Type', `image/${ext.replace('.', '')}`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(anuncio.imagenOriginal || filename)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      logger.error('publicidadController.verImagenAnuncio stream', streamErr);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error('publicidadController.verImagenAnuncio', err);
    res.status(500).json({ success: false, message: 'Error al servir imagen' });
  }
}

// ── Métricas ─────────────────────────────────────────────────────────────
async function guardarMetricas(req, res) {
  try {
    const { id } = req.params;
    const { impresiones, clics, conversiones, gasto } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const anuncioRs = await pool.request().input('id', sql.Int, id).query(`SELECT PBA_ID as id FROM MARKETING_PUBLICIDAD_ANUNCIOS WHERE PBA_ID=@id`);
    if (!anuncioRs.recordset[0]) return res.status(404).json({ success: false, message: 'Anuncio no encontrado' });

    await pool.request()
      .input('anuncioId', sql.Int, id)
      .input('impresiones', sql.Int, impresiones ?? null)
      .input('clics', sql.Int, clics ?? null)
      .input('conversiones', sql.Int, conversiones ?? null)
      .input('gasto', sql.Decimal(18, 2), gasto ?? null)
      .input('capturadoPor', sql.Int, req.user?.id || null)
      .query(`
        MERGE MARKETING_PUBLICIDAD_METRICAS AS target
        USING (SELECT @anuncioId AS PBM_ANUNCIO_ID) AS src
        ON target.PBM_ANUNCIO_ID = src.PBM_ANUNCIO_ID
        WHEN MATCHED THEN UPDATE SET PBM_IMPRESIONES=@impresiones, PBM_CLICS=@clics, PBM_CONVERSIONES=@conversiones,
          PBM_GASTO=@gasto, PBM_CAPTURADO_POR=@capturadoPor, PBM_CAPTURADO_AT=GETDATE()
        WHEN NOT MATCHED THEN INSERT (PBM_ANUNCIO_ID, PBM_IMPRESIONES, PBM_CLICS, PBM_CONVERSIONES, PBM_GASTO, PBM_CAPTURADO_POR)
          VALUES (@anuncioId, @impresiones, @clics, @conversiones, @gasto, @capturadoPor);
      `);

    res.json({ success: true });
  } catch (err) {
    logger.error('publicidadController.guardarMetricas', err);
    res.status(500).json({ success: false, message: 'Error al guardar métricas' });
  }
}

async function getMetricas(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PBM_IMPRESIONES as impresiones, PBM_CLICS as clics, PBM_CONVERSIONES as conversiones, PBM_GASTO as gasto, PBM_CAPTURADO_AT as capturadoAt FROM MARKETING_PUBLICIDAD_METRICAS WHERE PBM_ANUNCIO_ID=@id`);
    res.json({ success: true, data: rs.recordset[0] || null });
  } catch (err) {
    logger.error('publicidadController.getMetricas', err);
    res.status(500).json({ success: false, message: 'Error al obtener métricas' });
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────
async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const campaniasRs = await pool.request().query(`
      SELECT COUNT(*) as campaniasActivas, SUM(PBC_PRESUPUESTO) as presupuestoTotal
      FROM MARKETING_PUBLICIDAD_CAMPANIAS
      WHERE PBC_ESTATUS = 'activa'
    `);

    const metricasRs = await pool.request().query(`
      SELECT
        SUM(CASE WHEN MONTH(PBM_CAPTURADO_AT)=MONTH(GETDATE()) AND YEAR(PBM_CAPTURADO_AT)=YEAR(GETDATE()) THEN PBM_GASTO ELSE 0 END) as gastoMes,
        SUM(PBM_CLICS) as clicsTotal,
        SUM(PBM_IMPRESIONES) as impresionesTotal
      FROM MARKETING_PUBLICIDAD_METRICAS
    `);
    const m = metricasRs.recordset[0];
    const ctrPromedio = m.impresionesTotal ? (m.clicsTotal / m.impresionesTotal) * 100 : 0;

    res.json({
      success: true,
      data: {
        campaniasActivas: campaniasRs.recordset[0]?.campaniasActivas || 0,
        presupuestoTotal: campaniasRs.recordset[0]?.presupuestoTotal || 0,
        gastoMes: m.gastoMes || 0,
        ctrPromedio,
      },
    });
  } catch (err) {
    logger.error('publicidadController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard de publicidad' });
  }
}

module.exports = {
  listCampanias,
  crearCampania,
  actualizarCampania,
  eliminarCampania,
  listAnuncios,
  crearAnuncio,
  actualizarAnuncio,
  eliminarAnuncio,
  subirImagenAnuncio,
  verImagenAnuncio,
  guardarMetricas,
  getMetricas,
  getDashboard,
};
