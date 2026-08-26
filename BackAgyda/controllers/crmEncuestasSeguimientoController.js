const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');

// Heurística de clasificación por texto de la opción de escala respondida —
// evita tocar el motor genérico de Encuestas (sin columna de "valor" en
// ENCUESTA_OPCIONES). Palabras en español, sin acentos, minúsculas.
const PALABRAS_SATISFECHO = ['satisfecho', 'excelente', 'bueno', 'muy bueno', 'muy satisfecho'];
const PALABRAS_REGULAR = ['regular', 'aceptable', 'neutral'];
const PALABRAS_NEGATIVO = ['malo', 'insatisfecho', 'necesita mejora', 'muy malo', 'deficiente', 'muy insatisfecho'];

function normTexto(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function clasificarPorTexto(textoOpcion) {
  const t = normTexto(textoOpcion);
  if (!t) return null;
  if (PALABRAS_NEGATIVO.some((p) => t.includes(p))) return 'necesita_mejora';
  if (PALABRAS_REGULAR.some((p) => t.includes(p))) return 'regular';
  if (PALABRAS_SATISFECHO.some((p) => t.includes(p))) return 'satisfecho';
  return null;
}

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

exports.listEncuestasPublicasDisponibles = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT ENC_ID as id, ENC_TITULO as titulo, ENC_SLUG_PUBLICO as slugPublico
      FROM ENCUESTAS
      WHERE ISNULL(ENC_TIPO_ACCESO, 'privada') = 'publica' AND ENC_ESTADO = 'activa' AND ENC_SLUG_PUBLICO IS NOT NULL
      ORDER BY ENC_TITULO
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listEncuestasPublicasDisponibles:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.enviar = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    const encuestaId = parseInt(req.body.encuestaId, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'contactoId inválido' });
    if (!Number.isFinite(encuestaId)) return res.status(400).json({ success: false, message: 'encuestaId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);

    const contacto = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_ID as id, CONT_NOMBRE as nombre, CONT_CORREO as correo FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
    if (!contacto.recordset.length) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    const cont = contacto.recordset[0];
    if (!cont.correo) return res.status(400).json({ success: false, message: 'El contacto no tiene correo registrado' });

    const encuesta = await pool.request()
      .input('id', sql.Int, encuestaId)
      .query(`
        SELECT ENC_ID as id, ENC_TITULO as titulo, ENC_SLUG_PUBLICO as slugPublico
        FROM ENCUESTAS
        WHERE ENC_ID=@id AND ISNULL(ENC_TIPO_ACCESO,'privada')='publica' AND ENC_ESTADO='activa' AND ENC_SLUG_PUBLICO IS NOT NULL
      `);
    if (!encuesta.recordset.length) return res.status(404).json({ success: false, message: 'Encuesta pública no encontrada o no activa' });
    const enc = encuesta.recordset[0];

    const ins = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .input('encId', sql.Int, encuestaId)
      .input('enviadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CRM_ENCUESTAS_ENVIADAS (CES_CONTACTO_ID, CES_ENC_ID, CES_ENVIADO_POR)
        OUTPUT INSERTED.CES_ID
        VALUES (@contactoId, @encId, @enviadoPor)
      `);

    await emailService.sendEncuestaSeguimientoEmail({
      contactoNombre: cont.nombre,
      contactoCorreo: cont.correo,
      encuestaTitulo: enc.titulo,
      slugPublico: enc.slugPublico,
    });

    res.json({ success: true, data: { id: ins.recordset[0].CES_ID } });
  } catch (e) {
    console.error('Error enviar encuesta seguimiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'contactoId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);

    const contacto = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_CORREO as correo FROM CRM_CONTACTOS WHERE CONT_ID=@id`);
    const correo = contacto.recordset[0]?.correo || null;

    const enviadas = await pool.request()
      .input('contactoId', sql.Int, contactoId)
      .query(`
        SELECT CES_ID as id, CES_CONTACTO_ID as contactoId, CES_ENC_ID as encuestaId,
               CES_ENVIADO_POR as enviadoPor, CES_FECHA_ENVIO as fechaEnvio, CES_CANAL as canal,
               CES_CLASIFICACION as clasificacion, CES_INCIDENCIA_ID as incidenciaId
        FROM CRM_ENCUESTAS_ENVIADAS
        WHERE CES_CONTACTO_ID = @contactoId
        ORDER BY CES_FECHA_ENVIO DESC
      `);

    const data = [];
    for (const row of enviadas.recordset) {
      const encuesta = await pool.request()
        .input('id', sql.Int, row.encuestaId)
        .query(`SELECT ENC_TITULO as titulo, ENC_SLUG_PUBLICO as slugPublico FROM ENCUESTAS WHERE ENC_ID=@id`);
      const encInfo = encuesta.recordset[0] || null;

      let respondio = false;
      let respuestas = [];
      if (correo && encInfo) {
        const rp = await pool.request()
          .input('encId', sql.Int, row.encuestaId)
          .input('email', sql.NVarChar, correo.trim().toLowerCase())
          .query(`
            SELECT ERP_ID as respondienteId, ERP_FECHA as fecha
            FROM ENCUESTA_RESPONDIENTES_PUBLICOS
            WHERE ERP_ENC_ID = @encId AND LOWER(LTRIM(RTRIM(ERP_EMAIL))) = @email
          `);
        if (rp.recordset.length) {
          respondio = true;
          const respondienteId = rp.recordset[0].respondienteId;
          const resp = await pool.request()
            .input('respondienteId', sql.Int, respondienteId)
            .query(`
              SELECT p.EPR_TEXTO as pregunta,
                     ISNULL(o.EOP_TEXTO, r.ERE_RESPUESTA_TEXTO) as respuesta
              FROM ENCUESTA_RESPUESTAS r
              INNER JOIN ENCUESTA_PREGUNTAS p ON p.EPR_ID = r.ERE_EPR_ID
              LEFT JOIN ENCUESTA_OPCIONES o ON o.EOP_ID = r.ERE_EOP_ID
              WHERE r.ERE_RESPONDIENTE_PUB_ID = @respondienteId
              ORDER BY p.EPR_ORDEN
            `);
          respuestas = resp.recordset;
        }
      }

      data.push({
        id: row.id,
        contactoId: row.contactoId,
        encuestaId: row.encuestaId,
        encuestaTitulo: encInfo?.titulo || null,
        enviadoPor: row.enviadoPor,
        fechaEnvio: row.fechaEnvio,
        canal: row.canal,
        respondio,
        respuestas,
        clasificacion: row.clasificacion,
        incidenciaId: row.incidenciaId,
      });
    }

    res.json({ success: true, data });
  } catch (e) {
    console.error('Error listByContacto encuestas seguimiento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
