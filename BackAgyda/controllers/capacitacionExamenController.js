const sql = require('mssql');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

const SELECT_EXAMEN = `
  SELECT
    EXA_ID as id, EXA_CURSO_ID as cursoId, EXA_TITULO as titulo, EXA_DESCRIPCION as descripcion,
    EXA_TIPO_ACCESO as tipoAcceso, EXA_SLUG_PUBLICO as slugPublico, EXA_PUNTAJE_MINIMO as puntajeMinimo,
    EXA_CREADO_POR as creadoPor, EXA_FECHA_CREACION as fechaCreacion, EXA_ACTIVO as activo
  FROM dbo.CAP_EXAMENES
`;

async function attachPreguntas(pool, examenId) {
  const pregs = await pool.request()
    .input('examenId', sql.Int, examenId)
    .query(`
      SELECT EPR_ID as id, EPR_TEXTO as texto, EPR_TIPO as tipo, EPR_PUNTOS as puntos, EPR_ORDEN as orden
      FROM dbo.CAP_EXAMEN_PREGUNTAS WHERE EPR_EXAMEN_ID = @examenId ORDER BY EPR_ORDEN
    `);
  const preguntas = pregs.recordset;
  if (preguntas.length === 0) return [];

  const ids = preguntas.map((p) => p.id);
  const ops = await pool.request().query(`
    SELECT EOP_ID as id, EOP_PREGUNTA_ID as preguntaId, EOP_TEXTO as texto, EOP_ES_CORRECTA as esCorrecta, EOP_ORDEN as orden
    FROM dbo.CAP_EXAMEN_OPCIONES WHERE EOP_PREGUNTA_ID IN (${ids.join(',')}) ORDER BY EOP_ORDEN
  `);
  const opcionesPorPregunta = new Map();
  for (const o of ops.recordset) {
    if (!opcionesPorPregunta.has(o.preguntaId)) opcionesPorPregunta.set(o.preguntaId, []);
    opcionesPorPregunta.get(o.preguntaId).push(o);
  }
  return preguntas.map((p) => ({ ...p, opciones: opcionesPorPregunta.get(p.id) ?? [] }));
}

// Igual que la variante pública/administrativa oculta cuál opción es correcta
// cuando se manda al que va a presentar el examen (no a quien lo administra).
function ocultarCorrectas(preguntas) {
  return preguntas.map((p) => ({
    ...p,
    opciones: p.opciones.map((o) => ({ id: o.id, texto: o.texto, orden: o.orden })),
  }));
}

// GET /api/capacitacion/cursos/:cursoId/examenes — listado admin (incluye slug/config)
exports.listByCurso = async (req, res) => {
  try {
    const cursoId = parseInt(req.params.cursoId, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('cursoId', sql.Int, cursoId)
      .query(`${SELECT_EXAMEN} WHERE EXA_CURSO_ID = @cursoId AND EXA_ACTIVO = 1 ORDER BY EXA_FECHA_CREACION DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listByCurso examenes:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id).query(`${SELECT_EXAMEN} WHERE EXA_ID = @id`);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Examen no encontrado' });
    const preguntas = await attachPreguntas(pool, id);
    res.json({ success: true, data: { ...result.recordset[0], preguntas } });
  } catch (e) {
    console.error('Error getById examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/capacitacion/cursos/:cursoId/examenes — crea examen + preguntas + opciones en una transacción
exports.create = async (req, res) => {
  let transaction;
  try {
    const cursoId = parseInt(req.params.cursoId, 10);
    const { titulo, descripcion, tipoAcceso, puntajeMinimo, preguntas } = req.body || {};
    if (!titulo || !Array.isArray(preguntas) || preguntas.length === 0) {
      return res.status(400).json({ success: false, message: 'titulo y al menos una pregunta son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const curso = await pool.request().input('id', sql.Int, cursoId).query('SELECT CUR_ID FROM dbo.CAP_CURSOS WHERE CUR_ID = @id');
    if (!curso.recordset.length) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    const tipoAccesoVal = tipoAcceso === 'publico' ? 'publico' : 'privado';
    const slugPublico = tipoAccesoVal === 'publico' ? crypto.randomBytes(8).toString('hex') : null;

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const exaResult = await new sql.Request(transaction)
      .input('cursoId', sql.Int, cursoId)
      .input('titulo', sql.NVarChar(150), titulo)
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('tipoAcceso', sql.NVarChar(20), tipoAccesoVal)
      .input('slugPublico', sql.NVarChar(50), slugPublico)
      .input('puntajeMinimo', sql.Int, Number.isFinite(Number(puntajeMinimo)) ? Number(puntajeMinimo) : 70)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO dbo.CAP_EXAMENES (EXA_CURSO_ID, EXA_TITULO, EXA_DESCRIPCION, EXA_TIPO_ACCESO, EXA_SLUG_PUBLICO, EXA_PUNTAJE_MINIMO, EXA_CREADO_POR)
        OUTPUT INSERTED.EXA_ID
        VALUES (@cursoId, @titulo, @descripcion, @tipoAcceso, @slugPublico, @puntajeMinimo, @creadoPor)
      `);
    const examenId = exaResult.recordset[0].EXA_ID;

    let orden = 1;
    for (const p of preguntas) {
      const tipo = p.tipo === 'cerrada' ? 'cerrada' : 'abierta';
      const puntos = Number.isFinite(Number(p.puntos)) && Number(p.puntos) > 0 ? Number(p.puntos) : 1;
      const pregResult = await new sql.Request(transaction)
        .input('examenId', sql.Int, examenId)
        .input('texto', sql.NVarChar(sql.MAX), String(p.texto || '').trim())
        .input('tipo', sql.NVarChar(20), tipo)
        .input('puntos', sql.Int, puntos)
        .input('orden', sql.Int, orden)
        .query(`
          INSERT INTO dbo.CAP_EXAMEN_PREGUNTAS (EPR_EXAMEN_ID, EPR_TEXTO, EPR_TIPO, EPR_PUNTOS, EPR_ORDEN)
          OUTPUT INSERTED.EPR_ID
          VALUES (@examenId, @texto, @tipo, @puntos, @orden)
        `);
      const preguntaId = pregResult.recordset[0].EPR_ID;

      if (tipo === 'cerrada' && Array.isArray(p.opciones)) {
        let opOrden = 1;
        for (const o of p.opciones) {
          await new sql.Request(transaction)
            .input('preguntaId', sql.Int, preguntaId)
            .input('texto', sql.NVarChar(500), String(o.texto || '').trim())
            .input('esCorrecta', sql.Bit, !!o.esCorrecta)
            .input('orden', sql.Int, opOrden)
            .query(`
              INSERT INTO dbo.CAP_EXAMEN_OPCIONES (EOP_PREGUNTA_ID, EOP_TEXTO, EOP_ES_CORRECTA, EOP_ORDEN)
              VALUES (@preguntaId, @texto, @esCorrecta, @orden)
            `);
          opOrden++;
        }
      }
      orden++;
    }

    await transaction.commit();

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'capacitacion', accion: 'crear-examen', entidadId: String(examenId), detalle: { titulo, cursoId }, ip: req.ip,
    });

    res.status(201).json({ success: true, data: { id: examenId, slugPublico } });
  } catch (e) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('Error create examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id).query(`
      UPDATE dbo.CAP_EXAMENES SET EXA_ACTIVO = 0 WHERE EXA_ID = @id;
      SELECT @@ROWCOUNT as affected;
    `);
    if (!result.recordset[0].affected) return res.status(404).json({ success: false, message: 'Examen no encontrado' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'capacitacion', accion: 'eliminar-examen', entidadId: String(id), detalle: null, ip: req.ip,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error delete examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/capacitacion/examenes/publico/:slug — sin sesión, oculta respuestas correctas
exports.getPublicoBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('slug', sql.NVarChar(50), slug)
      .query(`${SELECT_EXAMEN} WHERE EXA_SLUG_PUBLICO = @slug AND EXA_TIPO_ACCESO = 'publico' AND EXA_ACTIVO = 1`);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Examen no encontrado' });

    const examen = result.recordset[0];
    const preguntas = ocultarCorrectas(await attachPreguntas(pool, examen.id));
    res.json({ success: true, data: { id: examen.id, titulo: examen.titulo, descripcion: examen.descripcion, preguntas } });
  } catch (e) {
    console.error('Error getPublicoBySlug examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Calificación: cerradas se comparan contra la opción correcta guardada;
// abiertas no se autocalifican (puntos no se suman, quedan para revisión manual).
async function calificarIntento(pool, examenId, respuestas) {
  const preguntas = await attachPreguntas(pool, examenId);
  const preguntasPorId = new Map(preguntas.map((p) => [p.id, p]));

  let puntajeObtenido = 0;
  let puntajeTotal = 0;
  const detalleRespuestas = [];

  for (const p of preguntas) {
    puntajeTotal += p.puntos;
    const respuesta = respuestas.find((r) => Number(r.preguntaId) === p.id);
    if (!respuesta) { detalleRespuestas.push({ preguntaId: p.id, opcionId: null, texto: null, esCorrecta: null }); continue; }

    if (p.tipo === 'cerrada') {
      const opcion = p.opciones.find((o) => o.id === Number(respuesta.opcionId));
      const esCorrecta = !!opcion?.esCorrecta;
      if (esCorrecta) puntajeObtenido += p.puntos;
      detalleRespuestas.push({ preguntaId: p.id, opcionId: opcion?.id ?? null, texto: null, esCorrecta });
    } else {
      detalleRespuestas.push({ preguntaId: p.id, opcionId: null, texto: String(respuesta.texto || '').trim() || null, esCorrecta: null });
    }
  }

  const porcentaje = puntajeTotal > 0 ? Math.round((puntajeObtenido / puntajeTotal) * 10000) / 100 : 0;
  return { puntajeObtenido, puntajeTotal, porcentaje, detalleRespuestas };
}

async function guardarIntento(pool, { examenId, usuarioId, respondientePubId, respuestas, puntajeMinimo }) {
  const { puntajeObtenido, puntajeTotal, porcentaje, detalleRespuestas } = await calificarIntento(pool, examenId, respuestas);
  const aprobado = porcentaje >= puntajeMinimo;

  const intentoResult = await pool.request()
    .input('examenId', sql.Int, examenId)
    .input('usuarioId', sql.Int, usuarioId || null)
    .input('respondientePubId', sql.Int, respondientePubId || null)
    .input('puntajeObtenido', sql.Int, puntajeObtenido)
    .input('puntajeTotal', sql.Int, puntajeTotal)
    .input('porcentaje', sql.Decimal(5, 2), porcentaje)
    .input('aprobado', sql.Bit, aprobado)
    .query(`
      INSERT INTO dbo.CAP_EXAMEN_INTENTOS (INT_EXAMEN_ID, INT_USUARIO_ID, INT_RESPONDIENTE_PUB_ID, INT_PUNTAJE_OBTENIDO, INT_PUNTAJE_TOTAL, INT_PORCENTAJE, INT_APROBADO)
      OUTPUT INSERTED.INT_ID
      VALUES (@examenId, @usuarioId, @respondientePubId, @puntajeObtenido, @puntajeTotal, @porcentaje, @aprobado)
    `);
  const intentoId = intentoResult.recordset[0].INT_ID;

  for (const r of detalleRespuestas) {
    await pool.request()
      .input('intentoId', sql.Int, intentoId)
      .input('preguntaId', sql.Int, r.preguntaId)
      .input('opcionId', sql.Int, r.opcionId)
      .input('texto', sql.NVarChar(sql.MAX), r.texto)
      .input('esCorrecta', sql.Bit, r.esCorrecta)
      .query(`
        INSERT INTO dbo.CAP_EXAMEN_RESPUESTAS (ERE_INTENTO_ID, ERE_PREGUNTA_ID, ERE_OPCION_ID, ERE_RESPUESTA_TEXTO, ERE_ES_CORRECTA)
        VALUES (@intentoId, @preguntaId, @opcionId, @texto, @esCorrecta)
      `);
  }

  return { intentoId, puntajeObtenido, puntajeTotal, porcentaje, aprobado };
}

// POST /api/capacitacion/examenes/:id/responder — usuario autenticado (link privado)
exports.responder = async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });

    const { respuestas } = req.body || {};
    if (!Array.isArray(respuestas)) return res.status(400).json({ success: false, message: 'respuestas requeridas' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const examen = await pool.request().input('id', sql.Int, examenId)
      .query('SELECT EXA_PUNTAJE_MINIMO as puntajeMinimo, EXA_ACTIVO as activo FROM dbo.CAP_EXAMENES WHERE EXA_ID=@id');
    if (!examen.recordset.length || !examen.recordset[0].activo) return res.status(404).json({ success: false, message: 'Examen no encontrado' });

    const resultado = await guardarIntento(pool, {
      examenId, usuarioId: uid, respondientePubId: null, respuestas, puntajeMinimo: examen.recordset[0].puntajeMinimo,
    });

    await logAudit(pool, {
      userId: uid, userName: req.user?.nombre || null, modulo: 'capacitacion', accion: 'responder-examen',
      entidadId: String(examenId), detalle: { porcentaje: resultado.porcentaje, aprobado: resultado.aprobado }, ip: req.ip,
    });

    res.status(201).json({ success: true, data: resultado });
  } catch (e) {
    console.error('Error responder examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/capacitacion/examenes/publico/:slug/responder — sin sesión
exports.responderPublico = async (req, res) => {
  try {
    const { slug } = req.params;
    const { nombre, email, respuestas } = req.body || {};
    if (!nombre || !email) return res.status(400).json({ success: false, message: 'nombre y email requeridos' });
    if (!Array.isArray(respuestas)) return res.status(400).json({ success: false, message: 'respuestas requeridas' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const examen = await pool.request().input('slug', sql.NVarChar(50), slug)
      .query(`SELECT EXA_ID as id, EXA_PUNTAJE_MINIMO as puntajeMinimo FROM dbo.CAP_EXAMENES WHERE EXA_SLUG_PUBLICO=@slug AND EXA_TIPO_ACCESO='publico' AND EXA_ACTIVO=1`);
    if (!examen.recordset.length) return res.status(404).json({ success: false, message: 'Examen no encontrado' });
    const { id: examenId, puntajeMinimo } = examen.recordset[0];

    const respondienteResult = await pool.request()
      .input('examenId', sql.Int, examenId)
      .input('nombre', sql.NVarChar(150), String(nombre).trim())
      .input('email', sql.NVarChar(150), String(email).trim())
      .input('ip', sql.NVarChar(50), req.ip || null)
      .query(`
        INSERT INTO dbo.CAP_EXAMEN_RESPONDIENTES_PUBLICOS (ERP_EXAMEN_ID, ERP_NOMBRE, ERP_EMAIL, ERP_IP)
        OUTPUT INSERTED.ERP_ID
        VALUES (@examenId, @nombre, @email, @ip)
      `);
    const respondientePubId = respondienteResult.recordset[0].ERP_ID;

    const resultado = await guardarIntento(pool, { examenId, usuarioId: null, respondientePubId, respuestas, puntajeMinimo });
    res.status(201).json({ success: true, data: resultado });
  } catch (e) {
    console.error('Error responderPublico examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

function generarExamenPdfBuffer({ titulo, descripcion, puntajeMinimo, preguntas }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#0D1B3E').font('Helvetica-Bold').fontSize(9).text('ARDABYTEC · CAPACITACIÓN', { characterSpacing: 1 });
    doc.moveDown(0.6);
    doc.fillColor('#1B4FD8').font('Helvetica-Bold').fontSize(20).text(titulo);
    if (descripcion) {
      doc.moveDown(0.3);
      doc.fillColor('#4B5768').font('Helvetica').fontSize(10).text(descripcion);
    }
    doc.moveDown(0.3);
    doc.fillColor('#8891A0').font('Helvetica').fontSize(9)
      .text(`${preguntas.length} pregunta${preguntas.length !== 1 ? 's' : ''} · Mínimo para aprobar: ${puntajeMinimo}%`);
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.75).stroke('#B9CBFA');
    doc.moveDown(1);

    preguntas.forEach((p, i) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.fillColor('#16202E').font('Helvetica-Bold').fontSize(11).text(`${i + 1}. ${p.texto}`, { width: doc.page.width - 100 });
      doc.moveDown(0.3);
      if (p.tipo === 'cerrada') {
        p.opciones.forEach((o, oi) => {
          doc.fillColor('#4B5768').font('Helvetica').fontSize(10)
            .text(`${String.fromCharCode(65 + oi)}) ${o.texto}`, 70, doc.y, { width: doc.page.width - 120 });
        });
      } else {
        doc.fillColor('#8891A0').font('Helvetica-Oblique').fontSize(9).text('Respuesta abierta', 70, doc.y);
        doc.moveDown(0.2);
        doc.moveTo(70, doc.y + 12).lineTo(doc.page.width - 50, doc.y + 12).lineWidth(0.5).stroke('#D6DCE5');
        doc.moveDown(1);
      }
      doc.moveDown(0.8);
    });

    doc.end();
  });
}

// GET /api/capacitacion/examenes/:id/pdf — plantilla imprimible del examen
// (sin marcar respuestas correctas), para distribuir en papel o revisar offline.
exports.descargarPdf = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id).query(`${SELECT_EXAMEN} WHERE EXA_ID = @id`);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Examen no encontrado' });

    const examen = result.recordset[0];
    const preguntas = ocultarCorrectas(await attachPreguntas(pool, id));
    const buffer = await generarExamenPdfBuffer({ titulo: examen.titulo, descripcion: examen.descripcion, puntajeMinimo: examen.puntajeMinimo, preguntas });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="examen_${id}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error('Error descargarPdf examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/capacitacion/examenes/:id/intentos — admin ve todos los intentos
exports.listIntentos = async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('examenId', sql.Int, examenId).query(`
      SELECT
        i.INT_ID as id, i.INT_USUARIO_ID as usuarioId, u.NEUS_NOMBRES as usuarioNombre,
        i.INT_RESPONDIENTE_PUB_ID as respondienteId, erp.ERP_NOMBRE as respondienteNombre, erp.ERP_EMAIL as respondienteEmail,
        i.INT_PUNTAJE_OBTENIDO as puntajeObtenido, i.INT_PUNTAJE_TOTAL as puntajeTotal,
        i.INT_PORCENTAJE as porcentaje, i.INT_APROBADO as aprobado, i.INT_FECHA as fecha
      FROM dbo.CAP_EXAMEN_INTENTOS i
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = i.INT_USUARIO_ID
      LEFT JOIN dbo.CAP_EXAMEN_RESPONDIENTES_PUBLICOS erp ON erp.ERP_ID = i.INT_RESPONDIENTE_PUB_ID
      WHERE i.INT_EXAMEN_ID = @examenId
      ORDER BY i.INT_FECHA DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listIntentos examen:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
