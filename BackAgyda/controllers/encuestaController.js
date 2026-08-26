const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { validateEmail } = require('../utils/validators');
const crypto = require('crypto');

// Resuelve el EOP_ID de una opción a partir de su texto exacto para una pregunta dada,
// o null si la respuesta es texto libre (pregunta abierta o el texto no matchea ninguna opción).
async function resolverOpcionPorTexto(pool, preguntaId, respuesta) {
  if (typeof respuesta !== 'string') return null;
  const opcionResult = await pool.request()
    .input('preguntaId', sql.Int, preguntaId)
    .input('texto', sql.NVarChar, respuesta)
    .query(`SELECT EOP_ID FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @preguntaId AND EOP_TEXTO = @texto`);
  return opcionResult.recordset[0]?.EOP_ID || null;
}

exports.getEncuestas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    // Auto-cerrar encuestas cuya fecha fin ya pasó (comparar solo fecha, no hora)
    await pool.request().query(`
      UPDATE ENCUESTAS
      SET ENC_ESTADO = 'cerrada'
      WHERE ENC_ESTADO = 'activa'
        AND ENC_FECHA_FIN IS NOT NULL
        AND CAST(ENC_FECHA_FIN AS DATE) < CAST(GETDATE() AS DATE)
    `);
    const result = await pool.request().query(`
      SELECT
        ENC_ID              as id,
        ENC_TITULO          as titulo,
        ENC_DESCRIPCION     as descripcion,
        ENC_ESTADO          as estado,
        ENC_FECHA_INICIO    as fechaInicio,
        ENC_FECHA_FIN       as fechaFin,
        ENC_CREADO_POR      as creadoPor,
        ENC_FECHA_CREACION  as fechaCreacion,
        ISNULL(ENC_VISIBILIDAD, 'general') as visibilidad,
        ISNULL(ENC_PUBLICAR_EN, 'encuestas') as publicarEn,
        ISNULL(ENC_TIPO_ACCESO, 'privada') as tipoAcceso,
        ENC_SLUG_PUBLICO as slugPublico,
        (SELECT COUNT(*) FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = ENC_ID) as totalPreguntas,
        (SELECT COUNT(*) FROM ENCUESTA_ASIGNACION WHERE EAS_ENC_ID = ENC_ID) as totalAsignados
      FROM ENCUESTAS
      ORDER BY ENC_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error encuestas todas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Encuestas de una categoría (ej. 'satisfaccion'), creadas por el propio
// usuario o visibles para AD/TI — usado por vistas de área (ej. Atención al
// Cliente) que no requieren el permiso admin completo de Encuestas.
exports.getEncuestasPorCategoria = async (req, res) => {
  try {
    const categoria = String(req.params.categoria || '').toLowerCase();
    if (!categoria) return res.status(400).json({ success: false, message: 'Falta la categoría' });

    const pool = await databaseService.getPool(req.user?.empresa);
    // Las categorías (ej. 'satisfaccion') son compartidas por diseño — cualquier
    // usuario autenticado que pueda ver esta vista ve todas las encuestas de la
    // categoría, sin filtrar por quién las creó (a diferencia del listado admin
    // general, que sí respeta esa restricción para categorías sin dueño único).
    const result = await pool.request()
      .input('categoria', sql.NVarChar, categoria)
      .query(`
      SELECT
        ENC_ID              as id,
        ENC_TITULO          as titulo,
        ENC_DESCRIPCION     as descripcion,
        ENC_ESTADO          as estado,
        ENC_FECHA_INICIO    as fechaInicio,
        ENC_FECHA_FIN       as fechaFin,
        ENC_CREADO_POR      as creadoPor,
        ISNULL(ENC_TIPO_ACCESO, 'privada') as tipoAcceso,
        ENC_SLUG_PUBLICO as slugPublico,
        ENC_CATEGORIA as categoria,
        (SELECT COUNT(*) FROM ENCUESTA_RESPUESTAS r WHERE r.ERE_ENC_ID = ENCUESTAS.ENC_ID) as totalRespuestas
      FROM ENCUESTAS
      WHERE LOWER(ISNULL(ENC_CATEGORIA, '')) = @categoria
      ORDER BY ENC_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error obteniendo encuestas por categoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Encuestas activas para mostrar en noticias (con o sin asignación)
exports.getEncuestasNoticias = async (req, res) => {
  try {
    const userId = Number(req.query.userId || 0);
    const tipoUsuario = String(req.query.tipoUsuario || '').toUpperCase();
    const pool = await databaseService.getPool(req.user?.empresa);

    // Auto-cerrar vencidas (comparar solo fecha)
    await pool.request().query(`
      UPDATE ENCUESTAS SET ENC_ESTADO = 'cerrada'
      WHERE ENC_ESTADO = 'activa' AND ENC_FECHA_FIN IS NOT NULL AND CAST(ENC_FECHA_FIN AS DATE) < CAST(GETDATE() AS DATE)
    `);

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT
          e.ENC_ID              as encuestaId,
          e.ENC_TITULO          as titulo,
          e.ENC_DESCRIPCION     as descripcion,
          e.ENC_ESTADO          as estado,
          e.ENC_FECHA_INICIO    as fechaInicio,
          e.ENC_FECHA_FIN       as fechaFin,
          ISNULL(e.ENC_VISIBILIDAD, 'general') as visibilidad,
          ISNULL(e.ENC_PUBLICAR_EN, 'encuestas') as publicarEn,
          (SELECT COUNT(*) FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = e.ENC_ID) as totalPreguntas,
          CASE WHEN a.EAS_ID IS NOT NULL THEN 1 ELSE 0 END as asignado,
          CASE WHEN ISNULL(a.EAS_ESTADO,'') = 'completada' THEN 1 ELSE 0 END as respondida,
          a.EAS_ID as asignacionId
        FROM ENCUESTAS e
        LEFT JOIN ENCUESTA_ASIGNACION a ON a.EAS_ENC_ID = e.ENC_ID AND a.EAS_NEUS_ID = @userId
        WHERE e.ENC_ESTADO = 'activa'
          AND (e.ENC_PUBLICAR_EN = 'noticias' OR e.ENC_PUBLICAR_EN = 'ambas')
        ORDER BY e.ENC_FECHA_CREACION DESC
      `);

    // Filtrar por visibilidad del área
    const encuestas = result.recordset.filter(enc => {
      const vis = (enc.visibilidad || 'general').toLowerCase();
      if (vis === 'general') return true;
      if (!tipoUsuario) return false;
      try {
        const areas = JSON.parse(vis);
        return Array.isArray(areas) && areas.map(a => a.toUpperCase()).includes(tipoUsuario);
      } catch { return false; }
    });

    res.json({ success: true, data: encuestas });
  } catch (e) {
    console.error('Error encuestas noticias:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getEncuestasRespondidas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT DISTINCT 
        e.ENC_ID as id, 
        e.ENC_TITULO as titulo, 
        e.ENC_DESCRIPCION as descripcion
      FROM ENCUESTAS e
      INNER JOIN ENCUESTA_RESPUESTAS r ON e.ENC_ID = r.ERE_ENC_ID
      ORDER BY e.ENC_ID DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error encuestas respondidas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getEncuestasCompletasRespondidas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const encuestasResult = await pool.request().query(`
      SELECT DISTINCT e.ENC_ID
      FROM ENCUESTAS e
      INNER JOIN ENCUESTA_RESPUESTAS r ON e.ENC_ID = r.ERE_ENC_ID
    `);

    const encuestasIds = encuestasResult.recordset.map(e => e.ENC_ID);
    const encuestasCompletas = [];

    for (const encuestaId of encuestasIds) {
      const encuestaResult = await pool.request()
        .input('encuestaId', sql.Int, encuestaId)
        .query(`SELECT * FROM ENCUESTAS WHERE ENC_ID = @encuestaId`);
      const encuesta = encuestaResult.recordset[0];

      const preguntasResult = await pool.request()
        .input('encuestaId', sql.Int, encuestaId)
        .query(`SELECT * FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @encuestaId ORDER BY EPR_ORDEN`);
      const preguntas = preguntasResult.recordset;

      for (let pregunta of preguntas) {
        const opcionesResult = await pool.request()
          .input('preguntaId', sql.Int, pregunta.EPR_ID)
          .query(`SELECT * FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @preguntaId ORDER BY EOP_ORDEN`);
        pregunta.opciones = opcionesResult.recordset;

        const respuestasResult = await pool.request()
          .input('encuestaId', sql.Int, encuestaId)
          .input('preguntaId', sql.Int, pregunta.EPR_ID)
            .query(`
              SELECT 
                ISNULL(o.EOP_TEXTO, r.ERE_RESPUESTA_TEXTO) as respuesta,
                u.NEUS_NOMBRES as usuarioNombre,
                r.ERE_FECHA_RESPUESTA as fecha
              FROM ENCUESTA_RESPUESTAS r
              LEFT JOIN ENCUESTA_OPCIONES o ON r.ERE_EOP_ID = o.EOP_ID
              INNER JOIN NEUS_USUARIOS u ON r.ERE_NEUS_ID = u.NEUS_ID
              WHERE r.ERE_ENC_ID = @encuestaId AND r.ERE_EPR_ID = @preguntaId
              ORDER BY r.ERE_FECHA_RESPUESTA
            `);
          pregunta.respuestas = respuestasResult.recordset;
      }

      encuesta.preguntas = preguntas;
      encuestasCompletas.push(encuesta);
    }

    res.json({ success: true, data: encuestasCompletas });
  } catch (err) {
    console.error('Error encuestas completas respondidas:', err);
    if ((err.message || '').toLowerCase().includes('invalid object name')) {
      // Compatibilidad: si aún no existen tablas, no romper la UI
      return res.json({ success: true, data: [], message: 'Encuestas no disponibles' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getEncuestasUsuario = async (req, res) => {
  try {
    const { usuarioId } = req.params;

    if (!usuarioId) {
      return res.status(400).json({ success: false, message: 'Usuario no válido' });
    }

    const rolSolicitante = String(req.user?.tipoUsuario || req.user?.role || '').toUpperCase();
    if (Number(usuarioId) !== Number(req.user?.id) && !['AD', 'TI'].includes(rolSolicitante)) {
      return res.status(403).json({ success: false, message: 'No puedes consultar encuestas de otro usuario' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('usuarioId', sql.Int, usuarioId)
      .query(`
        SELECT
          a.EAS_ID as asignacionId,
          a.EAS_ENC_ID as encuestaId,
          e.ENC_TITULO as titulo,
          e.ENC_DESCRIPCION as descripcion,
          e.ENC_FECHA_INICIO as fechaInicio,
          e.ENC_FECHA_FIN as fechaFin,
          e.ENC_ESTADO as estado,
          CASE WHEN ISNULL(a.EAS_ESTADO,'') = 'completada' THEN 1 ELSE 0 END as respondida,
          a.EAS_ESTADO as estadoAsignacion,
          a.EAS_FECHA_ASIGNACION as fechaAsignacion,
          a.EAS_ASIGNADO_POR as asignadoPor,
          (SELECT COUNT(*) FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = e.ENC_ID) as totalPreguntas
        FROM ENCUESTA_ASIGNACION a
        INNER JOIN ENCUESTAS e ON e.ENC_ID = a.EAS_ENC_ID
        WHERE a.EAS_NEUS_ID = @usuarioId
        ORDER BY a.EAS_FECHA_ASIGNACION DESC
      `);

    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('❌ Error obteniendo encuestas de usuario:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getEncuestasCompletadas = async (req, res) => {
  try {
    const usuarioId = req.params.usuarioId;

    const rolSolicitante = String(req.user?.tipoUsuario || req.user?.role || '').toUpperCase();
    if (Number(usuarioId) !== Number(req.user?.id) && !['AD', 'TI'].includes(rolSolicitante)) {
      return res.status(403).json({ success: false, message: 'No puedes consultar encuestas de otro usuario' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('usuarioId', sql.Int, usuarioId)
      .query(`
        SELECT 
          e.ENC_ID as id,
          e.ENC_TITULO as titulo,
          e.ENC_DESCRIPCION as descripcion,
          a.EAS_FECHA_ASIGNACION as fechaAsignacion
        FROM ENCUESTAS e
        INNER JOIN ENCUESTA_ASIGNACION a ON a.EAS_ENC_ID = e.ENC_ID
        WHERE a.EAS_NEUS_ID = @usuarioId AND a.EAS_ESTADO = 'completada'
        ORDER BY a.EAS_FECHA_ASIGNACION DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error encuestas completadas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getEncuestaById = async (req, res) => {
  try {
    const encuestaId = req.params.encuestaId;
    const pool = await databaseService.getPool(req.user?.empresa);

    const encuestaResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query('SELECT * FROM ENCUESTAS WHERE ENC_ID = @encuestaId');
      
    if (!encuestaResult.recordset[0]) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }
    
    const encuesta = encuestaResult.recordset[0];

    const preguntasResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query('SELECT * FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @encuestaId ORDER BY EPR_ORDEN');
    const preguntas = preguntasResult.recordset;

    for (let pregunta of preguntas) {
      const opcionesResult = await pool.request()
        .input('preguntaId', sql.Int, pregunta.EPR_ID)
        .query('SELECT * FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @preguntaId ORDER BY EOP_ORDEN');
      pregunta.opciones = opcionesResult.recordset;
    }

    encuesta.preguntas = preguntas;

    // Alias camelCase además de las columnas ENC_* crudas: parseEncuesta() (frontend)
    // espera nombres normalizados (id, titulo, etc.) igual que el resto de endpoints
    // de este controller (getEncuestas, getEncuestasUsuario). Las columnas ENC_*
    // se conservan tal cual para no romper a EditarEncuestaModal, que ya las lee crudas.
    encuesta.id = encuesta.ENC_ID;
    encuesta.titulo = encuesta.ENC_TITULO;
    encuesta.descripcion = encuesta.ENC_DESCRIPCION;
    encuesta.estado = encuesta.ENC_ESTADO;
    encuesta.fechaInicio = encuesta.ENC_FECHA_INICIO;
    encuesta.fechaFin = encuesta.ENC_FECHA_FIN;
    encuesta.publicarEn = encuesta.ENC_PUBLICAR_EN;
    encuesta.visibilidad = encuesta.ENC_VISIBILIDAD;
    encuesta.tipoAcceso = encuesta.ENC_TIPO_ACCESO;
    encuesta.slugPublico = encuesta.ENC_SLUG_PUBLICO;
    encuesta.categoria = encuesta.ENC_CATEGORIA;
    encuesta.totalPreguntas = preguntas.length;

    res.json({ success: true, data: encuesta });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Pública (sin sesión) — trae la encuesta por su slug para renderizar el formulario.
// No expone campos administrativos (creador, contadores de asignados, etc.).
exports.getEncuestaPublicaBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const encuestaResult = await pool.request()
      .input('slug', sql.NVarChar, slug)
      .query(`
        SELECT ENC_ID as id, ENC_TITULO as titulo, ENC_DESCRIPCION as descripcion, ENC_ESTADO as estado
        FROM ENCUESTAS
        WHERE ENC_SLUG_PUBLICO = @slug AND ENC_TIPO_ACCESO = 'publica'
      `);

    if (!encuestaResult.recordset[0]) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const encuesta = encuestaResult.recordset[0];
    if (String(encuesta.estado).toLowerCase() !== 'activa') {
      return res.status(400).json({ success: false, message: 'Esta encuesta ya no está disponible' });
    }

    const preguntasResult = await pool.request()
      .input('encuestaId', sql.Int, encuesta.id)
      .query('SELECT EPR_ID as id, EPR_TEXTO as texto, EPR_TIPO as tipo, EPR_ORDEN as orden FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @encuestaId ORDER BY EPR_ORDEN');
    const preguntas = preguntasResult.recordset;

    for (const pregunta of preguntas) {
      const opcionesResult = await pool.request()
        .input('preguntaId', sql.Int, pregunta.id)
        .query('SELECT EOP_ID as id, EOP_TEXTO as texto, EOP_ORDEN as orden FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @preguntaId ORDER BY EOP_ORDEN');
      pregunta.opciones = opcionesResult.recordset.map((o) => o.texto);
    }

    res.json({ success: true, data: { id: encuesta.id, titulo: encuesta.titulo, descripcion: encuesta.descripcion, preguntas } });
  } catch (err) {
    console.error('Error obteniendo encuesta pública:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Pública (sin sesión) — registra nombre+correo del respondiente y sus respuestas.
// Anti-duplicado suave: rechaza si ese correo ya respondió esta encuesta (best-effort,
// sin transacción de aislamiento estricta — ver postulanteController.createPostulante
// para el mismo patrón de verificación optimista usado en Vacantes).
exports.responderEncuestaPublica = async (req, res) => {
  try {
    const { slug } = req.params;
    const { nombre, email, respuestas } = req.body;

    if (!nombre || !String(nombre).trim() || !email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: nombre, email' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }
    if (!respuestas || !Array.isArray(respuestas) || respuestas.length === 0) {
      return res.status(400).json({ success: false, message: 'Faltan respuestas' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const encuestaResult = await pool.request()
      .input('slug', sql.NVarChar, slug)
      .query(`
        SELECT ENC_ID as id, ENC_ESTADO as estado
        FROM ENCUESTAS WHERE ENC_SLUG_PUBLICO = @slug AND ENC_TIPO_ACCESO = 'publica'
      `);
    if (!encuestaResult.recordset[0]) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }
    const encuestaId = encuestaResult.recordset[0].id;
    if (String(encuestaResult.recordset[0].estado).toLowerCase() !== 'activa') {
      return res.status(400).json({ success: false, message: 'Esta encuesta ya no está disponible' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const yaRespondio = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .input('email', sql.NVarChar, emailNorm)
      .query(`
        SELECT TOP 1 1 as existe FROM ENCUESTA_RESPONDIENTES_PUBLICOS
        WHERE ERP_ENC_ID = @encuestaId AND LOWER(LTRIM(RTRIM(ERP_EMAIL))) = @email
      `);
    if (yaRespondio.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya has respondido esta encuesta anteriormente' });
    }

    const respondienteResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .input('email', sql.NVarChar, String(email).trim())
      .input('ip', sql.NVarChar, req.ip || null)
      .query(`
        INSERT INTO ENCUESTA_RESPONDIENTES_PUBLICOS (ERP_ENC_ID, ERP_NOMBRE, ERP_EMAIL, ERP_IP)
        OUTPUT INSERTED.ERP_ID
        VALUES (@encuestaId, @nombre, @email, @ip)
      `);
    const respondientePubId = respondienteResult.recordset[0].ERP_ID;

    for (const r of respuestas) {
      const opcionId = await resolverOpcionPorTexto(pool, r.preguntaId, r.respuesta);
      await pool.request()
        .input('encuestaId', sql.Int, encuestaId)
        .input('preguntaId', sql.Int, r.preguntaId)
        .input('opcionId', sql.Int, opcionId)
        .input('respuestaTexto', sql.NVarChar, opcionId ? null : String(r.respuesta ?? ''))
        .input('respondientePubId', sql.Int, respondientePubId)
        .query(`
          INSERT INTO ENCUESTA_RESPUESTAS
            (ERE_ENC_ID, ERE_EPR_ID, ERE_EOP_ID, ERE_RESPUESTA_TEXTO, ERE_NEUS_ID, ERE_RESPONDIENTE_PUB_ID, ERE_FECHA_RESPUESTA)
          VALUES
            (@encuestaId, @preguntaId, @opcionId, @respuestaTexto, NULL, @respondientePubId, GETDATE())
        `);
    }

    await logAudit(pool, { userId: null, userName: nombre, modulo: 'encuestas', accion: 'responder-publica', entidadId: String(encuestaId), detalle: { email: emailNorm }, ip: req.ip });
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error respondiendo encuesta pública:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getResultadosEncuesta = async (req, res) => {
  try {
    const encuestaId = req.params.encuestaId;
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query(`
        SELECT 
          p.EPR_TEXTO as pregunta,
          ISNULL(o.EOP_TEXTO, r.ERE_RESPUESTA_TEXTO) as respuesta,
          u.NEUS_NOMBRES as usuarioNombre,
          r.ERE_FECHA_RESPUESTA as fecha
        FROM ENCUESTA_RESPUESTAS r
        JOIN ENCUESTA_PREGUNTAS p ON r.ERE_EPR_ID = p.EPR_ID
        LEFT JOIN ENCUESTA_OPCIONES o ON r.ERE_EOP_ID = o.EOP_ID
        INNER JOIN NEUS_USUARIOS u ON r.ERE_NEUS_ID = u.NEUS_ID
        WHERE r.ERE_ENC_ID = @encuestaId
        ORDER BY p.EPR_ORDEN, r.ERE_FECHA_RESPUESTA
      `);

    const grouped = {};
    for (const row of result.recordset) {
      if (!grouped[row.pregunta]) grouped[row.pregunta] = [];
      grouped[row.pregunta].push({
        usuarioNombre: row.usuarioNombre,
        respuesta: row.respuesta,
        fecha: row.fecha,
      });
    }
    
    const data = Object.entries(grouped).map(([pregunta, respuestas]) => ({
      pregunta,
      respuestas,
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error obteniendo resultados:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Autenticada — resultados separados en cerradas (con gráficas) y abiertas (tabla).
// Autorización interna: solo el creador de la encuesta o rol AD/TI (además del
// requireActionAccess('encuestas','ver') ya aplicado en la ruta).
exports.getResultadosSeparados = async (req, res) => {
  try {
    const encuestaId = req.params.encuestaId;
    const pool = await databaseService.getPool(req.user?.empresa);

    const encuestaResult = await pool.request()
      .input('id', sql.Int, encuestaId)
      .query('SELECT ENC_ID as id, ENC_TITULO as titulo, ENC_CREADO_POR as creadoPor FROM ENCUESTAS WHERE ENC_ID = @id');
    if (!encuestaResult.recordset[0]) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const rol = String(req.user?.tipoUsuario || req.user?.role || '').toUpperCase();
    const esCreador = Number(encuestaResult.recordset[0].creadoPor) === Number(req.user?.id);
    if (!esCreador && !['AD', 'TI'].includes(rol)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver los resultados de esta encuesta' });
    }

    // Preguntas cerradas: todas las opciones, incluidas las que tienen 0 respuestas (LEFT JOIN).
    const cerradasResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query(`
        SELECT
          p.EPR_ID as preguntaId,
          p.EPR_TEXTO as pregunta,
          o.EOP_TEXTO as opcion,
          COUNT(r.ERE_ID) as total
        FROM ENCUESTA_PREGUNTAS p
        INNER JOIN ENCUESTA_OPCIONES o ON o.EOP_EPR_ID = p.EPR_ID
        LEFT JOIN ENCUESTA_RESPUESTAS r ON r.ERE_EOP_ID = o.EOP_ID
        WHERE p.EPR_ENC_ID = @encuestaId
        GROUP BY p.EPR_ID, p.EPR_TEXTO, p.EPR_ORDEN, o.EOP_TEXTO, o.EOP_ORDEN
        ORDER BY p.EPR_ORDEN, o.EOP_ORDEN
      `);
    const cerradasMap = new Map();
    for (const row of cerradasResult.recordset) {
      if (!cerradasMap.has(row.preguntaId)) {
        cerradasMap.set(row.preguntaId, { preguntaId: row.preguntaId, pregunta: row.pregunta, opciones: [] });
      }
      cerradasMap.get(row.preguntaId).opciones.push({ opcion: row.opcion, total: row.total });
    }

    // Preguntas abiertas: respuestas de texto libre, de usuarios de intranet o respondientes públicos.
    const abiertasResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query(`
        SELECT
          p.EPR_ID as preguntaId,
          p.EPR_TEXTO as pregunta,
          r.ERE_RESPUESTA_TEXTO as respuesta,
          r.ERE_FECHA_RESPUESTA as fecha,
          u.NEUS_NOMBRES as respondienteInterno,
          rp.ERP_NOMBRE as respondientePublico
        FROM ENCUESTA_RESPUESTAS r
        INNER JOIN ENCUESTA_PREGUNTAS p ON p.EPR_ID = r.ERE_EPR_ID
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = r.ERE_NEUS_ID
        LEFT JOIN ENCUESTA_RESPONDIENTES_PUBLICOS rp ON rp.ERP_ID = r.ERE_RESPONDIENTE_PUB_ID
        WHERE p.EPR_ENC_ID = @encuestaId AND r.ERE_EOP_ID IS NULL
        ORDER BY p.EPR_ORDEN, r.ERE_FECHA_RESPUESTA
      `);
    const abiertasMap = new Map();
    for (const row of abiertasResult.recordset) {
      if (!abiertasMap.has(row.preguntaId)) {
        abiertasMap.set(row.preguntaId, { preguntaId: row.preguntaId, pregunta: row.pregunta, respuestas: [] });
      }
      const esPublico = !row.respondienteInterno && !!row.respondientePublico;
      abiertasMap.get(row.preguntaId).respuestas.push({
        respondiente: row.respondienteInterno || row.respondientePublico || 'Anónimo',
        esPublico,
        respuesta: row.respuesta,
        fecha: row.fecha,
      });
    }

    res.json({
      success: true,
      data: {
        titulo: encuestaResult.recordset[0].titulo,
        cerradas: Array.from(cerradasMap.values()),
        abiertas: Array.from(abiertasMap.values()),
      },
    });
  } catch (err) {
    console.error('Error obteniendo resultados separados:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createEncuesta = async (req, res) => {
  let transaction;
  try {
    console.log('[createEncuesta] body recibido:', JSON.stringify(req.body));
    const { titulo, descripcion, fechaInicio, fechaFin, maxRespuestas, estado, preguntas, visibilidad, publicarEn, tipoAcceso, categoria } = req.body;
    // Acepta creadoPor del body o del header JWT como fallback
    const creadoPor = Number(req.body.creadoPor ?? req.headers['usuarioid'] ?? 0) || null;

    if (!titulo || !fechaInicio || !fechaFin || !creadoPor) {
      console.log('[createEncuesta] 400 - faltan campos:', { titulo: !!titulo, fechaInicio: !!fechaInicio, fechaFin: !!fechaFin, creadoPor });
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    // visibilidad: 'general' o JSON array de áreas ['CC','TI',...]
    const visibilidadVal = visibilidad && visibilidad !== 'general'
      ? JSON.stringify(visibilidad) : 'general';
    const publicarEnVal = publicarEn || 'encuestas';
    const tipoAccesoVal = tipoAcceso === 'publica' ? 'publica' : 'privada';
    const slugPublico = tipoAccesoVal === 'publica' ? crypto.randomBytes(8).toString('hex') : null;

    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const categoriaVal = categoria ? String(categoria).slice(0, 30) : null;
    const encuestaResult = await new sql.Request(transaction).query`
      INSERT INTO ENCUESTAS
      (ENC_TITULO, ENC_DESCRIPCION, ENC_FECHA_INICIO, ENC_FECHA_FIN, ENC_MAX_RESPUESTAS, ENC_ESTADO, ENC_CREADO_POR, ENC_FECHA_CREACION, ENC_VISIBILIDAD, ENC_PUBLICAR_EN, ENC_TIPO_ACCESO, ENC_SLUG_PUBLICO, ENC_CATEGORIA)
      VALUES (${String(titulo)}, ${String(descripcion || '')}, ${new Date(fechaInicio)}, ${new Date(fechaFin)}, ${maxRespuestas || 100}, ${String(estado || 'borrador')}, ${creadoPor}, GETDATE(), ${visibilidadVal}, ${publicarEnVal}, ${tipoAccesoVal}, ${slugPublico}, ${categoriaVal});
      SELECT SCOPE_IDENTITY() as encuestaId;
    `;
    const encuestaId = encuestaResult.recordset[0].encuestaId;

    if (preguntas && preguntas.length > 0) {
      let orden = 1;
      for (const p of preguntas) {
        const preguntaResult = await new sql.Request(transaction).query`
          INSERT INTO ENCUESTA_PREGUNTAS 
            (EPR_ENC_ID, EPR_TEXTO, EPR_TIPO, EPR_PERMITE_MULTIPLE, EPR_ORDEN)
          VALUES 
            (${encuestaId}, ${String(p.texto)}, ${String(p.tipo)}, ${p.permiteMultiple || 0}, ${orden});
          SELECT SCOPE_IDENTITY() as preguntaId;
        `;
        const preguntaId = preguntaResult.recordset[0].preguntaId;

        if (p.opciones && p.opciones.length > 0) {
          for (const o of p.opciones) {
            await new sql.Request(transaction).query`
              INSERT INTO ENCUESTA_OPCIONES (EOP_EPR_ID, EOP_TEXTO, EOP_ORDEN)
              VALUES (${preguntaId}, ${String(o.texto)}, ${o.orden});
            `;
          }
        }
        orden++;
      }
    }

    await transaction.commit();
    const poolAuditEnc = await databaseService.getPool(req.user?.empresa);
    await logAudit(poolAuditEnc, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'encuestas', accion:'crear', entidadId: String(encuestaId||''), detalle:{ titulo }, ip:req.ip });
    res.status(201).json({ success: true, encuestaId, tipoAcceso: tipoAccesoVal, slugPublico });
  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('Error crear encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Duplica una encuesta existente (con sus preguntas y opciones) como una encuesta
// nueva e independiente en estado 'borrador'. Body opcional: { titulo } para
// nombrar la copia; si no se manda, usa "<original> (copia)".
exports.duplicarEncuesta = async (req, res) => {
  let transaction;
  try {
    const encuestaId = req.params.encuestaId;
    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');

    const origenResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query('SELECT * FROM ENCUESTAS WHERE ENC_ID = @encuestaId');
    const origen = origenResult.recordset[0];
    if (!origen) {
      return res.status(404).json({ success: false, message: 'Encuesta no encontrada' });
    }

    const preguntasResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query('SELECT * FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @encuestaId ORDER BY EPR_ORDEN');
    const preguntasOrigen = preguntasResult.recordset;
    for (const pregunta of preguntasOrigen) {
      const opcionesResult = await pool.request()
        .input('preguntaId', sql.Int, pregunta.EPR_ID)
        .query('SELECT * FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @preguntaId ORDER BY EOP_ORDEN');
      pregunta.opciones = opcionesResult.recordset;
    }

    const creadoPor = Number(req.body?.creadoPor ?? req.headers['usuarioid'] ?? origen.ENC_CREADO_POR ?? 0) || null;
    const tituloNuevo = (req.body?.titulo && String(req.body.titulo).trim()) || `${origen.ENC_TITULO} (copia)`;
    const tipoAccesoVal = origen.ENC_TIPO_ACCESO === 'publica' ? 'publica' : 'privada';
    const slugPublico = tipoAccesoVal === 'publica' ? crypto.randomBytes(8).toString('hex') : null;

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const nuevaResult = await new sql.Request(transaction).query`
      INSERT INTO ENCUESTAS
      (ENC_TITULO, ENC_DESCRIPCION, ENC_FECHA_INICIO, ENC_FECHA_FIN, ENC_MAX_RESPUESTAS, ENC_ESTADO, ENC_CREADO_POR, ENC_FECHA_CREACION, ENC_VISIBILIDAD, ENC_PUBLICAR_EN, ENC_TIPO_ACCESO, ENC_SLUG_PUBLICO)
      VALUES (${tituloNuevo}, ${origen.ENC_DESCRIPCION || ''}, ${origen.ENC_FECHA_INICIO}, ${origen.ENC_FECHA_FIN}, ${origen.ENC_MAX_RESPUESTAS || 100}, ${'borrador'}, ${creadoPor}, GETDATE(), ${origen.ENC_VISIBILIDAD || 'general'}, ${origen.ENC_PUBLICAR_EN || 'encuestas'}, ${tipoAccesoVal}, ${slugPublico});
      SELECT SCOPE_IDENTITY() as encuestaId;
    `;
    const nuevaEncuestaId = nuevaResult.recordset[0].encuestaId;

    let orden = 1;
    for (const p of preguntasOrigen) {
      const preguntaResult = await new sql.Request(transaction).query`
        INSERT INTO ENCUESTA_PREGUNTAS
          (EPR_ENC_ID, EPR_TEXTO, EPR_TIPO, EPR_PERMITE_MULTIPLE, EPR_ORDEN)
        VALUES
          (${nuevaEncuestaId}, ${p.EPR_TEXTO}, ${p.EPR_TIPO}, ${p.EPR_PERMITE_MULTIPLE || 0}, ${orden});
        SELECT SCOPE_IDENTITY() as preguntaId;
      `;
      const preguntaId = preguntaResult.recordset[0].preguntaId;

      for (const o of (p.opciones || [])) {
        await new sql.Request(transaction).query`
          INSERT INTO ENCUESTA_OPCIONES (EOP_EPR_ID, EOP_TEXTO, EOP_ORDEN)
          VALUES (${preguntaId}, ${o.EOP_TEXTO}, ${o.EOP_ORDEN});
        `;
      }
      orden++;
    }

    await transaction.commit();
    const poolAudit = await databaseService.getPool(req.user?.empresa);
    await logAudit(poolAudit, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'encuestas', accion:'duplicar', entidadId: String(nuevaEncuestaId||''), detalle:{ origenId: encuestaId, titulo: tituloNuevo }, ip:req.ip });
    res.status(201).json({ success: true, encuestaId: nuevaEncuestaId, tipoAcceso: tipoAccesoVal, slugPublico });
  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('Error duplicar encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.asignarEncuesta = async (req, res) => {
  let transaction;
  try {
    const { encuesta_id, usuarios, asignado_por } = req.body;

    if (!encuesta_id || !usuarios || usuarios.length === 0 || !asignado_por) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');
    
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const userId of usuarios) {
      await new sql.Request(transaction).query`
        INSERT INTO ENCUESTA_ASIGNACION (EAS_ENC_ID, EAS_NEUS_ID, EAS_ASIGNADO_POR, EAS_FECHA_ASIGNACION)
        VALUES (${encuesta_id}, ${userId}, ${asignado_por}, GETDATE())
      `;
    }

    await transaction.commit();
    
    // Obtener el nombre de la encuesta
    const encuestaResult = await pool.request()
      .input('encuestaId', sql.Int, encuesta_id)
      .query('SELECT ENC_TITULO FROM ENCUESTAS WHERE ENC_ID = @encuestaId');
    
    const nombreEncuesta = encuestaResult.recordset[0]?.ENC_TITULO || `Encuesta #${encuesta_id}`;
    
    // Crear notificaciones para los usuarios asignados
    try {
      for (const userId of usuarios) {
        await notificationService.createNotification({
          usuarioId: userId,
          mensaje: `Se te ha asignado la encuesta: ${nombreEncuesta}`,
          tipo: 'encuesta',
          dataExtra: {
            encuestaId: encuesta_id,
            action: 'responder_encuesta'
          },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (e) {
      console.warn('⚠️ Error creando notificaciones de encuesta:', e?.message || e);
    }

    res.json({
      success: true,
      message: 'Encuesta asignada correctamente',
      encuesta_id,
      usuarios,
      asignado_por
    });

  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('❌ Error asignando encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.asignarPorArea = async (req, res) => {
  let transaction;
  try {
    const { encuestaId } = req.params;
    const { area, asignadoPor } = req.body;

    if (!area) {
      return res.status(400).json({ success: false, message: 'Falta el área' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');

    // Obtener todos los usuarios activos del área
    const usuariosResult = await pool.request()
      .input('area', sql.NVarChar, area)
      .query(`
        SELECT NEUS_ID as userId, NEUS_NOMBRES as nombre
        FROM NEUS_USUARIOS
        WHERE NEUS_TIPOUSUARIO = @area AND NEUS_ACTIVO = 1
      `);

    const usuarios = usuariosResult.recordset;
    if (usuarios.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay usuarios activos en esa área' });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    let asignados = 0;
    for (const u of usuarios) {
      // Evitar duplicados
      const existe = await new sql.Request(transaction)
        .input('encuestaId', sql.Int, encuestaId)
        .input('userId', sql.Int, u.userId)
        .query(`SELECT 1 FROM ENCUESTA_ASIGNACION WHERE EAS_ENC_ID = @encuestaId AND EAS_NEUS_ID = @userId`);
      if (existe.recordset.length === 0) {
        await new sql.Request(transaction)
          .input('encuestaId', sql.Int, encuestaId)
          .input('userId', sql.Int, u.userId)
          .input('asignadoPor', sql.Int, asignadoPor || null)
          .query(`
            INSERT INTO ENCUESTA_ASIGNACION (EAS_ENC_ID, EAS_NEUS_ID, EAS_ASIGNADO_POR, EAS_FECHA_ASIGNACION)
            VALUES (@encuestaId, @userId, @asignadoPor, GETDATE())
          `);
        asignados++;
      }
    }

    await transaction.commit();

    // Notificaciones
    const encuestaResult = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .query('SELECT ENC_TITULO FROM ENCUESTAS WHERE ENC_ID = @encuestaId');
    const nombreEncuesta = encuestaResult.recordset[0]?.ENC_TITULO || `Encuesta #${encuestaId}`;

    try {
      for (const u of usuarios) {
        await notificationService.createNotification({
          usuarioId: u.userId,
          mensaje: `Se te ha asignado la encuesta: ${nombreEncuesta}`,
          tipo: 'encuesta',
          dataExtra: { encuestaId: Number(encuestaId), action: 'responder_encuesta' },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (e) {
      console.warn('⚠️ Error creando notificaciones:', e?.message);
    }

    res.json({ success: true, asignados, total: usuarios.length });
  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('❌ Error asignando por área:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.checkIfSurveyAnswered = async (req, res) => {
  try {
    const { asignacionId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    // Verificar si existe al menos una respuesta para esta asignación
    const result = await pool.request()
      .input('asignacionId', sql.Int, asignacionId)
      .query(`
        SELECT TOP 1 1 as existe
        FROM ENCUESTA_RESPUESTAS r
        INNER JOIN ENCUESTA_ASIGNACION a ON r.ERE_ENC_ID = a.EAS_ENC_ID AND r.ERE_NEUS_ID = a.EAS_NEUS_ID
        WHERE a.EAS_ID = @asignacionId
      `);

    const answered = result.recordset.length > 0;
    res.json({ success: true, answered });
  } catch (e) {
    console.error('❌ Error verificando si encuesta fue respondida:', e);
    res.status(500).json({ success: false, message: e.message, answered: false });
  }
};

exports.responderEncuesta = async (req, res) => {
  console.log('[responder] body recibido:', JSON.stringify(req.body));
  try {
    const { asignacionId, encuestaId: encuestaIdBody, usuarioId: usuarioIdBody, respuestas } = req.body;
    if (!respuestas || !Array.isArray(respuestas) || respuestas.length === 0) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    let encuestaId, usuarioId, resolvedAsignacionId = asignacionId || null;

    if (asignacionId) {
      // Flujo normal: encuesta asignada
      const asignacionResult = await pool.request()
        .input('asignacionId', sql.Int, asignacionId)
        .query(`
          SELECT EAS_ENC_ID as encuestaId, EAS_NEUS_ID as usuarioId, EAS_ESTADO as estado
          FROM ENCUESTA_ASIGNACION
          WHERE EAS_ID = @asignacionId
        `);

      if (!asignacionResult.recordset[0]) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }

      const estadoActual = asignacionResult.recordset[0].estado;
      if (estadoActual === 'completada') {
        return res.status(400).json({ success: false, message: 'Esta encuesta ya ha sido respondida anteriormente' });
      }

      encuestaId = asignacionResult.recordset[0].encuestaId;
      usuarioId = asignacionResult.recordset[0].usuarioId;
    } else {
      // Flujo encuesta en noticias sin asignación previa
      if (!encuestaIdBody || !usuarioIdBody) {
        return res.status(400).json({ success: false, message: 'Datos incompletos' });
      }
      encuestaId = encuestaIdBody;
      usuarioId = usuarioIdBody;

      // Buscar si ya tiene asignación para esta encuesta
      const asigExistente = await pool.request()
        .input('encuestaId', sql.Int, encuestaId)
        .input('usuarioId', sql.Int, usuarioId)
        .query(`
          SELECT EAS_ID as id, EAS_ESTADO as estado
          FROM ENCUESTA_ASIGNACION
          WHERE EAS_ENC_ID = @encuestaId AND EAS_NEUS_ID = @usuarioId
        `);

      if (asigExistente.recordset[0]) {
        if (asigExistente.recordset[0].estado === 'completada') {
          return res.status(400).json({ success: false, message: 'Ya has respondido esta encuesta anteriormente' });
        }
        resolvedAsignacionId = asigExistente.recordset[0].id;
      } else {
        // Crear asignación automáticamente (autoasignada desde noticias)
        const nuevaAsig = await pool.request()
          .input('encuestaId', sql.Int, encuestaId)
          .input('usuarioId', sql.Int, usuarioId)
          .query(`
            INSERT INTO ENCUESTA_ASIGNACION (EAS_ENC_ID, EAS_NEUS_ID, EAS_ASIGNADO_POR, EAS_ESTADO, EAS_FECHA_ASIGNACION)
            OUTPUT INSERTED.EAS_ID
            VALUES (@encuestaId, @usuarioId, @usuarioId, 'pendiente', GETDATE())
          `);
        resolvedAsignacionId = nuevaAsig.recordset[0]?.EAS_ID || null;
      }
    }

    // Verificar si ya existen respuestas en la base de datos
    const respuestasExistentes = await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .input('usuarioId', sql.Int, usuarioId)
      .query(`
        SELECT COUNT(*) as total
        FROM ENCUESTA_RESPUESTAS
        WHERE ERE_ENC_ID = @encuestaId AND ERE_NEUS_ID = @usuarioId
      `);

    if (respuestasExistentes.recordset[0].total > 0) {
      return res.status(400).json({ success: false, message: 'Ya has respondido esta encuesta anteriormente' });
    }

    for (const r of respuestas) {
      let opcionId = null;
      if (typeof r.respuesta === 'string') {
        const opcionResult = await pool.request()
          .input('preguntaId', sql.Int, r.preguntaId)
          .input('texto', sql.NVarChar, r.respuesta)
          .query(`
            SELECT EOP_ID FROM ENCUESTA_OPCIONES
            WHERE EOP_EPR_ID = @preguntaId AND EOP_TEXTO = @texto
          `);
        if (opcionResult.recordset[0]) {
          opcionId = opcionResult.recordset[0].EOP_ID;
        }
      }

      await pool.request()
        .input('encuestaId', sql.Int, encuestaId)
        .input('preguntaId', sql.Int, r.preguntaId)
        .input('opcionId', sql.Int, opcionId)
        .input('respuestaTexto', sql.NVarChar, opcionId ? null : r.respuesta)
        .input('usuarioId', sql.Int, usuarioId)
        .input('fecha', sql.DateTime, new Date())
        .query(`
          INSERT INTO ENCUESTA_RESPUESTAS
            (ERE_ENC_ID, ERE_EPR_ID, ERE_EOP_ID, ERE_RESPUESTA_TEXTO, ERE_NEUS_ID, ERE_FECHA_RESPUESTA)
          VALUES
            (@encuestaId, @preguntaId, @opcionId, @respuestaTexto, @usuarioId, @fecha)
        `);
    }

    if (resolvedAsignacionId) {
      await pool.request()
        .input('asignacionId', sql.Int, resolvedAsignacionId)
        .query(`UPDATE ENCUESTA_ASIGNACION SET EAS_ESTADO = 'completada' WHERE EAS_ID = @asignacionId`);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('❌ Error guardando respuestas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.editarEncuesta = async (req, res) => {
  let transaction;
  try {
    const encuestaId = req.params.encuestaId;
    const { titulo, descripcion, fechaInicio, fechaFin, publicarEn, visibilidad, preguntas } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');

    const check = await pool.request()
      .input('id', sql.Int, encuestaId)
      .query(`SELECT ENC_ESTADO FROM ENCUESTAS WHERE ENC_ID = @id`);
    if (!check.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    const estadoActual = check.recordset[0].ENC_ESTADO;
    if (estadoActual === 'cerrada') {
      return res.status(400).json({ success: false, message: 'No se puede editar una encuesta cerrada' });
    }

    const visibilidadVal = visibilidad && visibilidad !== 'general'
      ? JSON.stringify(visibilidad) : 'general';

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input('id', sql.Int, encuestaId)
      .input('titulo', sql.NVarChar, String(titulo))
      .input('descripcion', sql.NVarChar, String(descripcion || ''))
      .input('fechaInicio', sql.DateTime, new Date(fechaInicio))
      .input('fechaFin', sql.DateTime, new Date(fechaFin))
      .input('publicarEn', sql.NVarChar, publicarEn || 'encuestas')
      .input('visibilidad', sql.NVarChar, visibilidadVal)
      .query(`
        UPDATE ENCUESTAS SET
          ENC_TITULO = @titulo,
          ENC_DESCRIPCION = @descripcion,
          ENC_FECHA_INICIO = @fechaInicio,
          ENC_FECHA_FIN = @fechaFin,
          ENC_PUBLICAR_EN = @publicarEn,
          ENC_VISIBILIDAD = @visibilidad
        WHERE ENC_ID = @id
      `);

    if (preguntas && Array.isArray(preguntas)) {
      // IDs de preguntas que vienen del frontend (las que tienen id > 0 ya existen en BD)
      const idsEnviados = preguntas.filter(p => p.id > 0).map(p => p.id);

      // Eliminar preguntas que ya no están en la lista enviada
      // (solo las que NO tienen respuestas referenciadas)
      const preguntasActuales = await new sql.Request(transaction)
        .input('eid', sql.Int, encuestaId)
        .query(`SELECT EPR_ID FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @eid`);
      for (const row of preguntasActuales.recordset) {
        const pid = row.EPR_ID;
        if (!idsEnviados.includes(pid)) {
          // Borrar opciones que no tengan respuestas asociadas
          await new sql.Request(transaction)
            .input('pid', sql.Int, pid)
            .query(`DELETE FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @pid AND EOP_ID NOT IN (SELECT ERE_EOP_ID FROM ENCUESTA_RESPUESTAS WHERE ERE_EOP_ID IS NOT NULL)`);
          // Borrar la pregunta solo si no tiene respuestas
          const tieneResp = await new sql.Request(transaction)
            .input('pid', sql.Int, pid)
            .query(`SELECT TOP 1 1 as c FROM ENCUESTA_RESPUESTAS WHERE ERE_EPR_ID = @pid`);
          if (tieneResp.recordset.length === 0) {
            await new sql.Request(transaction).input('pid', sql.Int, pid).query(`DELETE FROM ENCUESTA_PREGUNTAS WHERE EPR_ID = @pid`);
          }
        }
      }

      let orden = 1;
      for (const p of preguntas) {
        let preguntaId = p.id > 0 ? p.id : null;

        if (preguntaId) {
          // Actualizar pregunta existente
          await new sql.Request(transaction)
            .input('pid', sql.Int, preguntaId)
            .input('texto', sql.NVarChar, String(p.texto))
            .input('tipo', sql.NVarChar, String(p.tipo))
            .input('orden', sql.Int, orden)
            .query(`UPDATE ENCUESTA_PREGUNTAS SET EPR_TEXTO=@texto, EPR_TIPO=@tipo, EPR_ORDEN=@orden WHERE EPR_ID=@pid`);
        } else {
          // Insertar pregunta nueva
          const pr = await new sql.Request(transaction)
            .input('encuestaId', sql.Int, encuestaId)
            .input('texto', sql.NVarChar, String(p.texto))
            .input('tipo', sql.NVarChar, String(p.tipo))
            .input('orden', sql.Int, orden)
            .query(`INSERT INTO ENCUESTA_PREGUNTAS (EPR_ENC_ID, EPR_TEXTO, EPR_TIPO, EPR_PERMITE_MULTIPLE, EPR_ORDEN)
                    VALUES (@encuestaId, @texto, @tipo, 0, @orden);
                    SELECT SCOPE_IDENTITY() as preguntaId;`);
          preguntaId = pr.recordset[0].preguntaId;
        }

        // Sincronizar opciones de la pregunta
        if (p.opciones && p.opciones.length > 0) {
          const idsOpcionesEnviadas = (p.opciones).filter(o => o.id > 0).map(o => o.id);
          // Borrar opciones eliminadas (solo las que no tengan respuestas)
          await new sql.Request(transaction)
            .input('pid', sql.Int, preguntaId)
            .query(`DELETE FROM ENCUESTA_OPCIONES
                    WHERE EOP_EPR_ID = @pid
                    ${idsOpcionesEnviadas.length > 0 ? `AND EOP_ID NOT IN (${idsOpcionesEnviadas.join(',')})` : ''}
                    AND EOP_ID NOT IN (SELECT ERE_EOP_ID FROM ENCUESTA_RESPUESTAS WHERE ERE_EOP_ID IS NOT NULL)`);
          let opOrden = 1;
          for (const o of p.opciones) {
            if (o.id > 0) {
              await new sql.Request(transaction)
                .input('oid', sql.Int, o.id)
                .input('texto', sql.NVarChar, String(o.texto))
                .input('orden', sql.Int, opOrden)
                .query(`UPDATE ENCUESTA_OPCIONES SET EOP_TEXTO=@texto, EOP_ORDEN=@orden WHERE EOP_ID=@oid`);
            } else {
              await new sql.Request(transaction)
                .input('pid', sql.Int, preguntaId)
                .input('texto', sql.NVarChar, String(o.texto))
                .input('orden', sql.Int, opOrden)
                .query(`INSERT INTO ENCUESTA_OPCIONES (EOP_EPR_ID, EOP_TEXTO, EOP_ORDEN) VALUES (@pid, @texto, @orden)`);
            }
            opOrden++;
          }
        } else if (p.tipo !== 'opcion_multiple') {
          // Si cambió a tipo sin opciones, borrar opciones sin respuestas
          await new sql.Request(transaction)
            .input('pid', sql.Int, preguntaId)
            .query(`DELETE FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID = @pid AND EOP_ID NOT IN (SELECT ERE_EOP_ID FROM ENCUESTA_RESPUESTAS WHERE ERE_EOP_ID IS NOT NULL)`);
        }
        orden++;
      }
    }

    await transaction.commit();
    const poolAuditEdit = await databaseService.getPool(req.user?.empresa);
    await logAudit(poolAuditEdit, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'encuestas', accion:'editar', entidadId: req.params.encuestaId, detalle:{ titulo }, ip:req.ip });
    res.json({ success: true, message: 'Encuesta actualizada' });
  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('Error editando encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.cambiarEstadoEncuesta = async (req, res) => {
  try {
    const encuestaId = req.params.encuestaId;
    const nuevoEstado = req.body.nuevoEstado ?? req.body.estado ?? 'cerrada';

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('encuestaId', sql.Int, encuestaId)
      .input('nuevoEstado', sql.NVarChar, nuevoEstado)
      .query('UPDATE ENCUESTAS SET ENC_ESTADO = @nuevoEstado WHERE ENC_ID = @encuestaId');

    const poolAuditEst = await databaseService.getPool(req.user?.empresa);
    await logAudit(poolAuditEst, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'encuestas', accion:'cambiar-estado', entidadId: req.params.encuestaId, detalle:{ estado: req.body.nuevoEstado||req.body.estado }, ip:req.ip });
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (e) {
    console.error('Error actualizando estado:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteEncuesta = async (req, res) => {
  let transaction;
  try {
    const encuestaId = req.params.encuestaId;
    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');
    
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input('encuestaId', sql.Int, encuestaId)
      .query('DELETE FROM ENCUESTA_RESPUESTAS WHERE ERE_ENC_ID = @encuestaId');
    
    await new sql.Request(transaction)
      .input('encuestaId', sql.Int, encuestaId)
      .query('DELETE FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID IN (SELECT EPR_ID FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @encuestaId)');
    
    await new sql.Request(transaction)
      .input('encuestaId', sql.Int, encuestaId)
      .query('DELETE FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID = @encuestaId');
    
    await new sql.Request(transaction)
      .input('encuestaId', sql.Int, encuestaId)
      .query('DELETE FROM ENCUESTA_ASIGNACION WHERE EAS_ENC_ID = @encuestaId');
    
    await new sql.Request(transaction)
      .input('encuestaId', sql.Int, encuestaId)
      .query('DELETE FROM ENCUESTAS WHERE ENC_ID = @encuestaId');

    await transaction.commit();
    const poolAuditDel = await databaseService.getPool(req.user?.empresa);
    await logAudit(poolAuditDel, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'encuestas', accion:'eliminar', entidadId: req.params.encuestaId, detalle:null, ip:req.ip });
    res.status(200).json({ success: true, message: 'Encuesta eliminada' });
  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('Error eliminando encuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/encuestas/dashboard/resumen
exports.getResumenDashboard = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request().query(`
      UPDATE ENCUESTAS SET ENC_ESTADO = 'cerrada'
      WHERE ENC_ESTADO = 'activa' AND ENC_FECHA_FIN IS NOT NULL AND ENC_FECHA_FIN < GETDATE()
    `);

    const encuestas = await pool.request().query(`
      SELECT
        e.ENC_ID as id,
        e.ENC_TITULO as titulo,
        CASE
          WHEN UPPER(e.ENC_ESTADO) IN ('CERRADA', 'FINALIZADA') THEN 'cerrada'
          WHEN UPPER(e.ENC_ESTADO) = 'ACTIVA' THEN 'activa'
          ELSE 'borrador'
        END as estado,
        e.ENC_FECHA_CREACION as fechaCreacion,
        (SELECT COUNT(*) FROM ENCUESTA_ASIGNACION WHERE EAS_ENC_ID = e.ENC_ID) as totalAsignados,
        (SELECT COUNT(*) FROM ENCUESTA_ASIGNACION WHERE EAS_ENC_ID = e.ENC_ID AND EAS_ESTADO = 'completada') as totalCompletadas
      FROM ENCUESTAS e
      ORDER BY e.ENC_FECHA_CREACION DESC
    `);

    const opciones = await pool.request().query(`
      SELECT TOP 30
        p.EPR_ENC_ID as encuestaId,
        e.ENC_TITULO as encuestaTitulo,
        p.EPR_ID as preguntaId,
        p.EPR_TEXTO as pregunta,
        o.EOP_TEXTO as opcion,
        COUNT(r.ERE_ID) as total
      FROM ENCUESTA_OPCIONES o
      INNER JOIN ENCUESTA_PREGUNTAS p ON p.EPR_ID = o.EOP_EPR_ID
      INNER JOIN ENCUESTAS e ON e.ENC_ID = p.EPR_ENC_ID
      LEFT JOIN ENCUESTA_RESPUESTAS r ON r.ERE_EOP_ID = o.EOP_ID
      WHERE UPPER(p.EPR_TIPO) IN ('OPCION_MULTIPLE', 'OPCION MULTIPLE')
      GROUP BY p.EPR_ENC_ID, e.ENC_TITULO, p.EPR_ID, p.EPR_TEXTO, o.EOP_TEXTO, o.EOP_ORDEN
      ORDER BY p.EPR_ENC_ID DESC, p.EPR_ID, o.EOP_ORDEN
    `);

    const preguntasMap = new Map();
    for (const row of opciones.recordset) {
      if (!preguntasMap.has(row.preguntaId)) {
        preguntasMap.set(row.preguntaId, {
          encuestaId: row.encuestaId,
          encuestaTitulo: row.encuestaTitulo,
          pregunta: row.pregunta,
          opciones: [],
        });
      }
      preguntasMap.get(row.preguntaId).opciones.push({ opcion: row.opcion, total: row.total });
    }

    res.json({
      success: true,
      data: {
        encuestas: encuestas.recordset,
        preguntasOpcionMultiple: Array.from(preguntasMap.values()),
      },
    });
  } catch (e) {
    console.error('Error obteniendo resumen de dashboard de encuestas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
