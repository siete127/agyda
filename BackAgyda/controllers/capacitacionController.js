const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

const SELECT_CURSO = `
  SELECT
    CUR_ID as id,
    CUR_TITULO as titulo,
    CUR_DESCRIPCION as descripcion,
    CUR_CATEGORIA as categoria,
    CUR_DURACION_MIN as duracionMin,
    CUR_AUTOR_ID as autorId,
    CUR_AUTOR_NOMBRE as autorNombre,
    CUR_FECHA_CREACION as fechaCreacion,
    CUR_FECHA_ACTUALIZACION as fechaActualizacion,
    CUR_ACTIVO as activo,
    CUR_TIMER_CORRIENDO as timerCorriendo,
    CUR_TIMER_INICIO as timerInicio,
    CUR_TIMER_SEGUNDOS_ACUM as timerSegundosAcum
  FROM dbo.CAP_CURSOS
`;

// Segundos reales transcurridos ahora mismo: lo acumulado + lo corrido desde
// que se le dio play la última vez (si sigue corriendo). Se calcula siempre
// en el momento de leer, nunca se confía en un valor cacheado en el cliente.
function calcularTimerSegundos(row) {
  const acumulado = Number(row.CUR_TIMER_SEGUNDOS_ACUM ?? row.timerSegundosAcum ?? 0);
  const corriendo = row.CUR_TIMER_CORRIENDO ?? row.timerCorriendo;
  const inicio = row.CUR_TIMER_INICIO ?? row.timerInicio;
  if (!corriendo || !inicio) return acumulado;
  const segundosDesdeInicio = Math.max(0, Math.floor((Date.now() - new Date(inicio).getTime()) / 1000));
  return acumulado + segundosDesdeInicio;
}

const SELECT_MATERIAL = `
  SELECT
    MAT_ID as id,
    MAT_CURSO_ID as cursoId,
    MAT_NOMBRE as nombre,
    MAT_URL as url,
    MAT_TIPO as tipo,
    MAT_FECHA as fecha
  FROM dbo.CAP_MATERIALES
`;

async function attachMateriales(pool, cursos) {
  if (cursos.length === 0) return cursos;
  const ids = cursos.map((c) => c.id);
  const result = await pool.request().query(`${SELECT_MATERIAL} WHERE MAT_CURSO_ID IN (${ids.join(',')}) ORDER BY MAT_FECHA ASC`);
  const porCurso = new Map();
  for (const m of result.recordset) {
    if (!porCurso.has(m.cursoId)) porCurso.set(m.cursoId, []);
    porCurso.get(m.cursoId).push(m);
  }
  return cursos.map((c) => ({ ...c, materiales: porCurso.get(c.id) ?? [], timerSegundos: calcularTimerSegundos(c) }));
}

// GET /api/capacitacion/cursos — catálogo (todo empleado autenticado). Incluye
// mi inscripción/estado si existe, para que el frontend sepa si mostrar
// "Inscribirme" / "Continuar" / "Completado".
exports.getCursos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const includeInactive = String(req.query.includeInactive || '0') === '1';
    const where = includeInactive ? '1=1' : 'CUR_ACTIVO = 1';

    const cursosResult = await pool.request().query(`${SELECT_CURSO} WHERE ${where} ORDER BY CUR_FECHA_CREACION DESC`);
    const cursos = await attachMateriales(pool, cursosResult.recordset);

    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.json({ success: true, data: cursos.map((c) => ({ ...c, miEstado: null })) });

    const inscripciones = await pool.request()
      .input('uid', sql.Int, uid)
      .query('SELECT INSC_CURSO_ID as cursoId, INSC_ESTADO as estado FROM dbo.CAP_INSCRIPCIONES WHERE INSC_USUARIO_ID = @uid');
    const estadoPorCurso = new Map(inscripciones.recordset.map((i) => [i.cursoId, i.estado]));

    const data = cursos.map((c) => ({ ...c, miEstado: estadoPorCurso.get(c.id) ?? null }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo cursos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCursoById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id).query(`${SELECT_CURSO} WHERE CUR_ID = @id`);
    if (result.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    const [curso] = await attachMateriales(pool, result.recordset);
    res.json({ success: true, data: curso });
  } catch (error) {
    console.error('Error obteniendo curso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos — solo admin (AD/TI vía requireActionAccess)
exports.createCurso = async (req, res) => {
  try {
    const { titulo, descripcion, categoria, duracionMin } = req.body;
    if (!titulo || !descripcion) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: titulo, descripcion' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion)
      .input('categoria', sql.NVarChar, categoria || null)
      .input('duracionMin', sql.Int, duracionMin || null)
      .input('autorId', sql.Int, req.user?.id || null)
      .input('autorNombre', sql.NVarChar, req.user?.nombre || null)
      .query(`
        INSERT INTO dbo.CAP_CURSOS (CUR_TITULO, CUR_DESCRIPCION, CUR_CATEGORIA, CUR_DURACION_MIN, CUR_AUTOR_ID, CUR_AUTOR_NOMBRE, CUR_ACTIVO)
        VALUES (@titulo, @descripcion, @categoria, @duracionMin, @autorId, @autorNombre, 1);
        SELECT SCOPE_IDENTITY() as id;
      `);

    const cursoId = result.recordset[0].id;
    const creado = await pool.request().input('id', sql.Int, cursoId).query(`${SELECT_CURSO} WHERE CUR_ID = @id`);
    const data = { ...creado.recordset[0], materiales: [] };

    try { socketService.getIO(req.user?.empresa).emit('capacitacion:curso-creado', data); } catch (_) {}
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'crear-curso', entidadId: String(cursoId), detalle: { titulo }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando curso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, categoria, duracionMin, duracionMinAgregar, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request().input('id', sql.Int, id).query('SELECT CUR_ID, CUR_ACTIVO FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    // Un curso ya activo acumula la duración en vez de reemplazarla — evita que
    // editar el título/descripción de un curso en marcha borre accidentalmente
    // el tiempo ya invertido en él. duracionMinAgregar suma; duracionMin (solo
    // relevante mientras el curso todavía no está activo) fija el valor total.
    const eraActivo = !!existing.recordset[0].CUR_ACTIVO;
    const sumarDuracion = eraActivo && Number.isFinite(Number(duracionMinAgregar)) && Number(duracionMinAgregar) > 0;

    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion)
      .input('categoria', sql.NVarChar, categoria || null)
      .input('duracionMin', sql.Int, duracionMin || null)
      .input('duracionMinAgregar', sql.Int, sumarDuracion ? Number(duracionMinAgregar) : 0)
      .input('activo', sql.Bit, activo !== false)
      .query(`
        UPDATE dbo.CAP_CURSOS
        SET CUR_TITULO=@titulo, CUR_DESCRIPCION=@descripcion, CUR_CATEGORIA=@categoria,
            CUR_DURACION_MIN = CASE WHEN ${sumarDuracion ? '1=1' : '1=0'}
              THEN ISNULL(CUR_DURACION_MIN,0) + @duracionMinAgregar
              ELSE @duracionMin END,
            CUR_ACTIVO=@activo, CUR_FECHA_ACTUALIZACION=GETDATE()
        WHERE CUR_ID=@id
      `);

    const actualizado = await pool.request().input('id', sql.Int, id).query(`${SELECT_CURSO} WHERE CUR_ID = @id`);
    const [data] = await attachMateriales(pool, actualizado.recordset);

    try { socketService.getIO(req.user?.empresa).emit('capacitacion:curso-actualizado', data); } catch (_) {}
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'editar-curso', entidadId: id, detalle: { titulo }, ip: req.ip });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error actualizando curso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const check = await pool.request().input('id', sql.Int, id).query('SELECT CUR_ID FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (check.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    await pool.request().input('id', sql.Int, id).query('UPDATE dbo.CAP_CURSOS SET CUR_ACTIVO = 0, CUR_FECHA_ACTUALIZACION = GETDATE() WHERE CUR_ID = @id');

    try { socketService.getIO(req.user?.empresa).emit('capacitacion:curso-eliminado', { id: parseInt(id) }); } catch (_) {}
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'despublicar-curso', entidadId: id, detalle: {}, ip: req.ip });
    res.json({ success: true, message: 'Curso despublicado' });
  } catch (error) {
    console.error('Error despublicando curso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos/:id/materiales — admin sube un archivo (multipart, ya resuelto por multer en la ruta)
exports.subirMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const curso = await pool.request().input('id', sql.Int, id).query('SELECT CUR_ID FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (curso.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    const url = `/capacitacion-materiales/${req.file.filename}`;
    const tipo = path.extname(req.file.originalname || '').replace('.', '').toLowerCase() || null;

    const result = await pool.request()
      .input('cursoId', sql.Int, id)
      .input('nombre', sql.NVarChar, req.file.originalname)
      .input('url', sql.NVarChar, url)
      .input('tipo', sql.NVarChar, tipo)
      .query(`
        INSERT INTO dbo.CAP_MATERIALES (MAT_CURSO_ID, MAT_NOMBRE, MAT_URL, MAT_TIPO)
        VALUES (@cursoId, @nombre, @url, @tipo);
        SELECT SCOPE_IDENTITY() as id;
      `);

    const materialId = result.recordset[0].id;
    const creado = await pool.request().input('id', sql.Int, materialId).query(`${SELECT_MATERIAL} WHERE MAT_ID = @id`);

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'subir-material', entidadId: id, detalle: { nombre: req.file.originalname }, ip: req.ip });
    res.status(201).json({ success: true, data: creado.recordset[0] });
  } catch (error) {
    console.error('Error subiendo material:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const material = await pool.request().input('id', sql.Int, materialId).query('SELECT MAT_URL FROM dbo.CAP_MATERIALES WHERE MAT_ID = @id');
    if (material.recordset.length === 0) return res.status(404).json({ success: false, message: 'Material no encontrado' });

    await pool.request().input('id', sql.Int, materialId).query('DELETE FROM dbo.CAP_MATERIALES WHERE MAT_ID = @id');

    try {
      const uploadDir = process.env.CAPACITACION_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Capacitacion';
      const filename = path.basename(material.recordset[0].MAT_URL);
      const filePath = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('No se pudo borrar el archivo físico del material:', e.message);
    }

    res.json({ success: true, message: 'Material eliminado' });
  } catch (error) {
    console.error('Error eliminando material:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos/:id/inscribirse — cualquier empleado autenticado
exports.inscribirse = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const curso = await pool.request().input('id', sql.Int, id).query('SELECT CUR_ID, CUR_ACTIVO FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (curso.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    if (!curso.recordset[0].CUR_ACTIVO) return res.status(400).json({ success: false, message: 'Este curso ya no está disponible' });

    const existing = await pool.request()
      .input('cursoId', sql.Int, id)
      .input('uid', sql.Int, uid)
      .query('SELECT INSC_ID, INSC_ESTADO FROM dbo.CAP_INSCRIPCIONES WHERE INSC_CURSO_ID=@cursoId AND INSC_USUARIO_ID=@uid');

    if (existing.recordset.length > 0) {
      return res.json({ success: true, data: { estado: existing.recordset[0].INSC_ESTADO }, message: 'Ya estabas inscrito' });
    }

    await pool.request()
      .input('cursoId', sql.Int, id)
      .input('uid', sql.Int, uid)
      .query("INSERT INTO dbo.CAP_INSCRIPCIONES (INSC_CURSO_ID, INSC_USUARIO_ID, INSC_ESTADO) VALUES (@cursoId, @uid, 'inscrito')");

    res.status(201).json({ success: true, data: { estado: 'inscrito' } });
  } catch (error) {
    console.error('Error inscribiendo al curso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos/:id/completar — marca completado (requiere estar inscrito)
exports.completar = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const inscripcion = await pool.request()
      .input('cursoId', sql.Int, id)
      .input('uid', sql.Int, uid)
      .query('SELECT INSC_ID, INSC_ESTADO FROM dbo.CAP_INSCRIPCIONES WHERE INSC_CURSO_ID=@cursoId AND INSC_USUARIO_ID=@uid');

    if (inscripcion.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Debes inscribirte al curso antes de completarlo' });
    }
    if (inscripcion.recordset[0].INSC_ESTADO === 'completado') {
      return res.json({ success: true, data: { estado: 'completado' }, message: 'Ya habías completado este curso' });
    }

    await pool.request()
      .input('id', sql.Int, inscripcion.recordset[0].INSC_ID)
      .query("UPDATE dbo.CAP_INSCRIPCIONES SET INSC_ESTADO='completado', INSC_FECHA_COMPLETADO=GETDATE() WHERE INSC_ID=@id");

    await logAudit(pool, { userId: uid, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'completar-curso', entidadId: id, detalle: {}, ip: req.ip });
    res.json({ success: true, data: { estado: 'completado' } });
  } catch (error) {
    console.error('Error completando curso:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/capacitacion/mis-cursos — historial del usuario actual (para su perfil)
exports.getMisCursos = async (req, res) => {
  try {
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('uid', sql.Int, uid).query(`
      SELECT
        c.CUR_ID as cursoId, c.CUR_TITULO as titulo, c.CUR_CATEGORIA as categoria,
        i.INSC_ESTADO as estado, i.INSC_FECHA_INSCRIPCION as fechaInscripcion, i.INSC_FECHA_COMPLETADO as fechaCompletado
      FROM dbo.CAP_INSCRIPCIONES i
      INNER JOIN dbo.CAP_CURSOS c ON c.CUR_ID = i.INSC_CURSO_ID
      WHERE i.INSC_USUARIO_ID = @uid
      ORDER BY i.INSC_FECHA_INSCRIPCION DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo mis cursos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos/:id/timer/play — arranca el cronómetro del
// curso (compartido, no por persona). Si ya estaba corriendo, no hace nada.
exports.timerPlay = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const curso = await pool.request().input('id', sql.Int, id)
      .query('SELECT CUR_TIMER_CORRIENDO as corriendo FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (curso.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    if (!curso.recordset[0].corriendo) {
      await pool.request().input('id', sql.Int, id)
        .query('UPDATE dbo.CAP_CURSOS SET CUR_TIMER_CORRIENDO=1, CUR_TIMER_INICIO=GETDATE() WHERE CUR_ID=@id');
    }
    const actualizado = await pool.request().input('id', sql.Int, id).query(`${SELECT_CURSO} WHERE CUR_ID = @id`);
    const row = actualizado.recordset[0];
    res.json({ success: true, data: { timerCorriendo: !!row.timerCorriendo, timerSegundos: calcularTimerSegundos(row) } });
  } catch (error) {
    console.error('Error timerPlay:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos/:id/timer/pause — congela el cronómetro,
// consolidando lo corrido desde el último play en el acumulado.
exports.timerPause = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const curso = await pool.request().input('id', sql.Int, id)
      .query('SELECT CUR_TIMER_CORRIENDO as corriendo, CUR_TIMER_INICIO as inicio, CUR_TIMER_SEGUNDOS_ACUM as acum FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (curso.recordset.length === 0) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    const row = curso.recordset[0];
    if (row.corriendo) {
      const nuevoAcum = calcularTimerSegundos({ CUR_TIMER_SEGUNDOS_ACUM: row.acum, CUR_TIMER_CORRIENDO: row.corriendo, CUR_TIMER_INICIO: row.inicio });
      await pool.request()
        .input('id', sql.Int, id)
        .input('acum', sql.BigInt, nuevoAcum)
        .query('UPDATE dbo.CAP_CURSOS SET CUR_TIMER_CORRIENDO=0, CUR_TIMER_INICIO=NULL, CUR_TIMER_SEGUNDOS_ACUM=@acum WHERE CUR_ID=@id');
    }
    const actualizado = await pool.request().input('id', sql.Int, id).query(`${SELECT_CURSO} WHERE CUR_ID = @id`);
    const rowFinal = actualizado.recordset[0];
    res.json({ success: true, data: { timerCorriendo: !!rowFinal.timerCorriendo, timerSegundos: calcularTimerSegundos(rowFinal) } });
  } catch (error) {
    console.error('Error timerPause:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/capacitacion/cursos/:id/timer/agregar — ajuste manual del admin,
// suma minutos directo al acumulado sin importar si el timer está corriendo.
exports.timerAgregar = async (req, res) => {
  try {
    const { id } = req.params;
    const minutos = Number(req.body?.minutos);
    if (!Number.isFinite(minutos) || minutos <= 0) {
      return res.status(400).json({ success: false, message: 'minutos debe ser un número positivo' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('segundos', sql.BigInt, Math.round(minutos * 60))
      .query(`
        UPDATE dbo.CAP_CURSOS SET CUR_TIMER_SEGUNDOS_ACUM = CUR_TIMER_SEGUNDOS_ACUM + @segundos WHERE CUR_ID=@id;
        SELECT @@ROWCOUNT as affected;
      `);
    if (!result.recordset[0].affected) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'agregar-tiempo-curso', entidadId: id, detalle: { minutos }, ip: req.ip });

    const actualizado = await pool.request().input('id', sql.Int, id).query(`${SELECT_CURSO} WHERE CUR_ID = @id`);
    const row = actualizado.recordset[0];
    res.json({ success: true, data: { timerCorriendo: !!row.timerCorriendo, timerSegundos: calcularTimerSegundos(row) } });
  } catch (error) {
    console.error('Error timerAgregar:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

function generarConstanciaBuffer({ nombreEmpleado, tituloCurso, fechaCompletado }) {
  return new Promise((resolve, reject) => {
    const logoPath = path.join(__dirname, '../assets/LOGO.png');
    const hasLogo = fs.existsSync(logoPath);

    const doc = new PDFDocument({ size: 'letter', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;

    // Marco decorativo
    doc.rect(24, 24, PAGE_W - 48, PAGE_H - 48).lineWidth(1.5).stroke('#1B4FD8');
    doc.rect(30, 30, PAGE_W - 60, PAGE_H - 60).lineWidth(0.75).stroke('#B9CBFA');

    if (hasLogo) {
      try { doc.image(logoPath, PAGE_W / 2 - 40, 60, { width: 80 }); } catch (_) {}
    }

    doc.fillColor('#0D1B3E').font('Helvetica-Bold').fontSize(11)
      .text('ARDABYTEC', 0, 148, { align: 'center', characterSpacing: 2 });

    doc.moveDown(1.5);
    doc.fillColor('#1B4FD8').font('Helvetica-Bold').fontSize(28)
      .text('CONSTANCIA DE CAPACITACIÓN', 60, 200, { align: 'center', width: PAGE_W - 120 });

    doc.moveDown(1.2);
    doc.fillColor('#4B5768').font('Helvetica').fontSize(12)
      .text('Se otorga la presente constancia a:', { align: 'center' });

    doc.moveDown(0.8);
    doc.fillColor('#16202E').font('Helvetica-Bold').fontSize(22)
      .text(nombreEmpleado, { align: 'center' });

    doc.moveDown(1);
    doc.fillColor('#4B5768').font('Helvetica').fontSize(12)
      .text('por haber completado satisfactoriamente el curso:', { align: 'center' });

    doc.moveDown(0.6);
    doc.fillColor('#16202E').font('Helvetica-Bold').fontSize(16)
      .text(tituloCurso, 90, doc.y, { align: 'center', width: PAGE_W - 180 });

    doc.moveDown(2);
    const fecha = new Date(fechaCompletado).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.fillColor('#8891A0').font('Helvetica').fontSize(10)
      .text(`Fecha de finalización: ${fecha}`, { align: 'center' });

    // Firma
    const lineY = PAGE_H - 150;
    doc.moveTo(PAGE_W / 2 - 90, lineY).lineTo(PAGE_W / 2 + 90, lineY).lineWidth(0.75).stroke('#8891A0');
    doc.fontSize(9).fillColor('#4B5768')
      .text('Recursos Humanos — ArdaBytec', PAGE_W / 2 - 90, lineY + 6, { width: 180, align: 'center' });

    doc.end();
  });
}

// GET /api/capacitacion/cursos/:id/constancia — solo si el curso fue completado por el usuario actual
exports.descargarConstancia = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('cursoId', sql.Int, id)
      .input('uid', sql.Int, uid)
      .query(`
        SELECT c.CUR_TITULO as titulo, i.INSC_ESTADO as estado, i.INSC_FECHA_COMPLETADO as fechaCompletado, u.NEUS_NOMBRES as nombreEmpleado
        FROM dbo.CAP_INSCRIPCIONES i
        INNER JOIN dbo.CAP_CURSOS c ON c.CUR_ID = i.INSC_CURSO_ID
        INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = i.INSC_USUARIO_ID
        WHERE i.INSC_CURSO_ID = @cursoId AND i.INSC_USUARIO_ID = @uid
      `);

    if (result.recordset.length === 0 || result.recordset[0].estado !== 'completado') {
      return res.status(400).json({ success: false, message: 'Debes completar el curso antes de descargar tu constancia' });
    }

    const { titulo, fechaCompletado, nombreEmpleado } = result.recordset[0];
    const buffer = await generarConstanciaBuffer({ nombreEmpleado, tituloCurso: titulo, fechaCompletado });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="constancia_${id}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Error generando constancia:', error);
    res.status(500).json({ success: false, message: 'Error al generar la constancia' });
  }
};
