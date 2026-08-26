const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const clienteIncidencias = require('./clienteIncidenciasController');
const { listTenants } = require('../config/tenants');

// Mismas listas que crmEncuestasSeguimientoController.js — duplicadas aquí a
// propósito (job independiente, sin depender de exports internos de otro
// controller) para clasificar la respuesta de una encuesta de satisfacción.
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

// Automatización 3 (encuesta negativa → incidencia): detecta encuestas de
// seguimiento (CRM_ENCUESTAS_ENVIADAS) ya respondidas y sin clasificar,
// clasifica por la primera opción de escala respondida, y si es negativa crea
// automáticamente una incidencia ligada al cliente.
async function clasificarEncuestasRespondidas() {
  for (const { key } of listTenants()) {
    await clasificarEncuestasRespondidasTenant(key);
  }
}

async function clasificarEncuestasRespondidasTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CRM ENCUESTAS][${tenantKey}] Sin pool:`, e.message); return;
  }

  try {
    const pendientes = await pool.request().query(`
      SELECT ces.CES_ID as id, ces.CES_CONTACTO_ID as contactoId, ces.CES_ENC_ID as encuestaId,
             c.CONT_CORREO as correo, c.CONT_NOMBRE as contactoNombre, enc.ENC_TITULO as encuestaTitulo
      FROM CRM_ENCUESTAS_ENVIADAS ces
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = ces.CES_CONTACTO_ID
      INNER JOIN ENCUESTAS enc ON enc.ENC_ID = ces.CES_ENC_ID
      WHERE ces.CES_CLASIFICACION IS NULL AND c.CONT_CORREO IS NOT NULL
    `);

    for (const ces of pendientes.recordset) {
      try {
        const respondiente = await pool.request()
          .input('encId', sql.Int, ces.encuestaId)
          .input('email', sql.NVarChar, ces.correo.trim().toLowerCase())
          .query(`
            SELECT TOP 1 ERP_ID as respondienteId
            FROM ENCUESTA_RESPONDIENTES_PUBLICOS
            WHERE ERP_ENC_ID = @encId AND LOWER(LTRIM(RTRIM(ERP_EMAIL))) = @email
          `);
        if (!respondiente.recordset.length) continue; // aún no respondió

        const respondienteId = respondiente.recordset[0].respondienteId;
        const respuestas = await pool.request()
          .input('respondienteId', sql.Int, respondienteId)
          .query(`
            SELECT p.EPR_ORDEN as orden, p.EPR_TEXTO as pregunta, ISNULL(o.EOP_TEXTO, r.ERE_RESPUESTA_TEXTO) as respuesta
            FROM ENCUESTA_RESPUESTAS r
            INNER JOIN ENCUESTA_PREGUNTAS p ON p.EPR_ID = r.ERE_EPR_ID
            LEFT JOIN ENCUESTA_OPCIONES o ON o.EOP_ID = r.ERE_EOP_ID
            WHERE r.ERE_RESPONDIENTE_PUB_ID = @respondienteId
            ORDER BY p.EPR_ORDEN
          `);

        // Si la encuesta trae la pregunta "Satisfacción general" (plantilla de 8
        // dimensiones — ver schemaService.ensureEncuestaSatisfaccionClienteSeed),
        // la clasificación se basa únicamente en esa respuesta puntual. Para
        // encuestas antiguas de una sola pregunta de escala, cae al comportamiento
        // previo: la primera respuesta que matchee alguna palabra clave.
        const preguntaGeneral = respuestas.recordset.find((r) => normTexto(r.pregunta).includes('satisfaccion general'));
        let clasificacion = null;
        if (preguntaGeneral) {
          clasificacion = clasificarPorTexto(preguntaGeneral.respuesta);
        } else {
          for (const r of respuestas.recordset) {
            clasificacion = clasificarPorTexto(r.respuesta);
            if (clasificacion) break; // primera pregunta que clasifique claramente
          }
        }
        if (!clasificacion) continue; // sin pregunta de escala reconocible aún — reintenta después

        let incidenciaId = null;
        if (clasificacion === 'necesita_mejora') {
          const creada = await clienteIncidencias.crearIncidenciaAutomatica({
            contactoId: ces.contactoId,
            titulo: `Encuesta de satisfacción negativa — ${ces.contactoNombre}`,
            descripcion: `El cliente respondió negativamente a la encuesta "${ces.encuestaTitulo}".`,
            categoria: 'satisfaccion',
            prioridad: 'alta',
            origen: 'encuesta',
            tenantKey,
          });
          incidenciaId = creada?.id ?? null;
        }

        await pool.request()
          .input('id', sql.Int, ces.id)
          .input('clasificacion', sql.NVarChar(20), clasificacion)
          .input('incidenciaId', sql.Int, incidenciaId)
          .query(`UPDATE CRM_ENCUESTAS_ENVIADAS SET CES_CLASIFICACION=@clasificacion, CES_INCIDENCIA_ID=@incidenciaId WHERE CES_ID=@id`);

        console.log(`[CRM ENCUESTAS] Encuesta enviada ${ces.id} clasificada como '${clasificacion}'${incidenciaId ? ` (incidencia ${incidenciaId})` : ''}`);
      } catch (e) {
        console.error(`[CRM ENCUESTAS] Error clasificando encuesta enviada ${ces.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[CRM ENCUESTAS] Error consultando encuestas pendientes de clasificar:', e.message);
  }
}

// Cron corto (cada 30 min) — clasificar tan pronto el cliente responde, sin
// esperar al ciclo diario de 8am que usan los otros crons de este módulo.
cron.schedule('*/30 * * * *', () => {
  clasificarEncuestasRespondidas();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await clasificarEncuestasRespondidas();
    res.json({ success: true, message: 'Clasificación de encuestas ejecutada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = clasificarEncuestasRespondidas;
