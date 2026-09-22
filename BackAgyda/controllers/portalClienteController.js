const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const casoController = require('./casoController');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const notificationService = require('../services/notificationService');
const { sanitizeFilename, decryptBuffer } = require('../utils/cryptoDocs');

// Portal del cliente (login real, NEUS_TIPOUSUARIO='CL') — mismo shape de
// datos que crmPortalController.js (el portal por liga/token), pero
// identificando al contacto vía requirePortalCliente (req.contacto) en vez
// de un token de query/body. Separado en un endpoint por sección en vez de
// un solo blob, para que cada pantalla del portal pueda refrescar la suya.

// GET /resumen — KPIs + actividad reciente para "Principal".
exports.getResumen = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const id = req.contacto.id;

    const incidenciasAbiertas = (await pool.request().input('id', sql.Int, id).query(`
      SELECT COUNT(*) as n FROM CASOS WHERE CASO_CONTACTO_ID=@id AND CASO_ACTIVO=1 AND CASO_TIPO='incidencia' AND CASO_ESTATUS NOT IN ('resuelto','cerrado')
    `)).recordset[0].n;

    const citasProximas = (await pool.request().input('id', sql.Int, id).query(`
      SELECT COUNT(*) as n FROM CLI_CITAS
      WHERE CITA_CONTACTO_ID=@id AND CITA_ACTIVO=1 AND CITA_ESTATUS NOT IN ('cancelada','asistio','no_asistio')
        AND CITA_FECHA_HORA >= DATEADD(HOUR, -1, GETDATE())
    `)).recordset[0].n;

    const proximaCita = (await pool.request().input('id', sql.Int, id).query(`
      SELECT TOP 1 CITA_ID as id, CITA_TITULO as titulo, CONVERT(NVARCHAR(19), CITA_FECHA_HORA, 126) as fechaHora, CITA_MODALIDAD as modalidad
      FROM CLI_CITAS
      WHERE CITA_CONTACTO_ID=@id AND CITA_ACTIVO=1 AND CITA_ESTATUS NOT IN ('cancelada','asistio','no_asistio')
        AND CITA_FECHA_HORA >= DATEADD(HOUR, -1, GETDATE())
      ORDER BY CITA_FECHA_HORA ASC
    `)).recordset[0] || null;

    // Actividad reciente: últimas interacciones + citas + casos, unificadas por fecha.
    const [interacciones, citas, casos] = await Promise.all([
      pool.request().input('id', sql.Int, id).query(`
        SELECT TOP 10 'interaccion' as tipo, i.INT_TIPO as subtipo, i.INT_CONTENIDO as texto, i.INT_FECHA as fecha
        FROM CRM_INTERACCIONES i
        JOIN CRM_OPORTUNIDADES o ON o.OPO_ID=i.INT_OPO_ID AND o.OPO_CONTACTO_ID=@id
        WHERE o.OPO_ACTIVO=1 AND i.INT_TIPO NOT IN ('creacion')
        ORDER BY i.INT_FECHA DESC
      `),
      pool.request().input('id', sql.Int, id).query(`
        SELECT TOP 10 'cita' as tipo, CITA_ESTATUS as subtipo, CITA_TITULO as texto, CITA_FECHA_HORA as fecha
        FROM CLI_CITAS WHERE CITA_CONTACTO_ID=@id AND CITA_ACTIVO=1
        ORDER BY CITA_FECHA_HORA DESC
      `),
      pool.request().input('id', sql.Int, id).query(`
        SELECT TOP 10 'incidencia' as tipo, CASO_ESTATUS as subtipo, CASO_TITULO as texto, CASO_FECHA_CREACION as fecha
        FROM CASOS WHERE CASO_CONTACTO_ID=@id AND CASO_ACTIVO=1 AND CASO_TIPO='incidencia'
        ORDER BY CASO_FECHA_CREACION DESC
      `),
    ]);
    const actividad = [...interacciones.recordset, ...citas.recordset, ...casos.recordset]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        stats: { incidenciasAbiertas, citasProximas },
        proximaCita,
        actividad,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /proyectos — oportunidades del contacto que ya generaron un proyecto real.
exports.getProyectos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const id = req.contacto.id;

    const proyectos = (await pool.request().input('id', sql.Int, id).query(`
      SELECT p.PROY_ID as id, p.PROY_NOMBRE as nombre, p.PROY_ESTADO as estatus,
             CONVERT(NVARCHAR(10), p.PROY_FECHA_INICIO, 23) as fechaInicio,
             CONVERT(NVARCHAR(10), p.PROY_FECHA_FIN, 23) as fechaFin
      FROM CRM_OPORTUNIDADES o
      JOIN PROYECTOS p ON p.PROY_ID = o.OPO_PROYECTO_ID
      WHERE o.OPO_CONTACTO_ID=@id AND o.OPO_ACTIVO=1
      ORDER BY p.PROY_FECHA_INICIO DESC
    `)).recordset;

    for (const proy of proyectos) {
      const [miembros, tareas] = await Promise.all([
        pool.request().input('pid', sql.Int, proy.id).query(`SELECT PMEM_NOMBRE as nombre, PMEM_ROL as rol FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID=@pid`),
        pool.request().input('pid', sql.Int, proy.id).query(`SELECT PTAR_PROGRESO as progreso FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID=@pid`),
      ]);
      proy.equipo = miembros.recordset;
      const progresos = tareas.recordset.map((t) => Number(t.progreso) || 0);
      proy.avance = progresos.length ? Math.round(progresos.reduce((s, p) => s + p, 0) / progresos.length) : 0;
    }

    res.json({ success: true, data: proyectos });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /cotizaciones — cotizaciones enviadas/aprobadas/rechazadas del contacto.
exports.getCotizaciones = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const id = req.contacto.id;

    const opos = (await pool.request().input('id', sql.Int, id).query(`
      SELECT OPO_ID as id FROM CRM_OPORTUNIDADES WHERE OPO_CONTACTO_ID=@id AND OPO_ACTIVO=1
    `)).recordset;

    const cotizaciones = [];
    for (const opo of opos) {
      const cots = await pool.request().input('opoId', sql.Int, opo.id).query(`
        SELECT COT_ID as id, COT_FOLIO as folio, COT_TITULO as titulo, COT_ESTATUS as estatus, COT_TOTAL as total,
               CONVERT(NVARCHAR(10), COT_FECHA, 23) as fecha
        FROM CRM_COTIZACIONES
        WHERE COT_OPO_ID=@opoId AND COT_ACTIVO=1 AND COT_ESTATUS IN ('enviada','aprobada','rechazada')
        ORDER BY COT_FECHA_REGISTRO DESC
      `);
      cotizaciones.push(...cots.recordset);
    }

    res.json({ success: true, data: cotizaciones });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /facturas — facturas reales del contacto.
exports.getFacturas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT FAC_ID as id, FAC_SERIE as serie, FAC_FOLIO as folio, FAC_TOTAL as total, FAC_MONEDA as moneda,
             FAC_ESTATUS as estatus, CONVERT(NVARCHAR(10), FAC_FECHA, 23) as fecha,
             CONVERT(NVARCHAR(10), FAC_FECHA_TIMBRADO, 23) as fechaTimbrado
      FROM FACTURAS
      WHERE FAC_CLIENTE_ID=@id
      ORDER BY FAC_FECHA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /documentos — documentos visibles al portal del contacto.
exports.getDocumentos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT DOC_ID as id, DOC_NOMBRE_ORIGINAL as nombreOriginal, DOC_MIME_TYPE as mimeType,
             DOC_TAMANO_BYTES as tamanoBytes, DOC_FECHA_SUBIDA as fechaSubida
      FROM CRM_DOCUMENTOS_CLIENTE
      WHERE DOC_CONTACTO_ID=@id AND DOC_VISIBLE_PORTAL=1 AND DOC_ACTIVO=1
      ORDER BY DOC_FECHA_SUBIDA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /documentos/:id/download
exports.descargarDocumento = async (req, res) => {
  try {
    const docId = parseInt(req.params.id, 10);
    if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const doc = await pool.request()
      .input('docId', sql.Int, docId)
      .input('contactoId', sql.Int, req.contacto.id)
      .query(`
        SELECT TOP 1 DOC_NOMBRE_ORIGINAL, DOC_MIME_TYPE, DOC_ENC_IV, DOC_ENC_TAG, DOC_ENCRYPTED_DATA
        FROM CRM_DOCUMENTOS_CLIENTE
        WHERE DOC_ID=@docId AND DOC_CONTACTO_ID=@contactoId AND DOC_VISIBLE_PORTAL=1 AND DOC_ACTIVO=1
      `);
    if (!doc.recordset.length) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

    const row = doc.recordset[0];
    let decrypted;
    try {
      decrypted = decryptBuffer(row.DOC_ENCRYPTED_DATA, row.DOC_ENC_IV, row.DOC_ENC_TAG);
    } catch (err) {
      console.error('❌ Error descifrando documento portal-cliente:', err);
      return res.status(500).json({ success: false, message: 'Error descifrando documento' });
    }

    const filename = sanitizeFilename(row.DOC_NOMBRE_ORIGINAL);
    res.setHeader('Content-Type', row.DOC_MIME_TYPE || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(decrypted);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /citas — próximas citas del contacto.
exports.getCitas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT K.CITA_ID as id, K.CITA_TITULO as titulo, K.CITA_MODALIDAD as modalidad,
             CONVERT(NVARCHAR(19), K.CITA_FECHA_HORA, 126) as fechaHora,
             K.CITA_DURACION_MIN as duracionMin, K.CITA_ENLACE as enlace, K.CITA_TELEFONO as telefono,
             K.CITA_ESTATUS as estatus, K.CITA_CONFIRMADA_POR_CLIENTE as confirmadaPorCliente,
             T.TRAT_NOMBRE as tratamientoNombre, K.CITA_NUMERO_SESION as numeroSesion,
             T.TRAT_TOTAL_SESIONES as tratamientoTotalSesiones,
             (SELECT TOP 1 S.SOL_TIPO FROM CLI_CITAS_SOLICITUDES S
                WHERE S.SOL_CITA_ID = K.CITA_ID AND S.SOL_ESTATUS = 'pendiente') as solicitudPendienteTipo
      FROM CLI_CITAS K
      LEFT JOIN CLI_TRATAMIENTOS T ON T.TRAT_ID = K.CITA_TRATAMIENTO_ID
      WHERE K.CITA_CONTACTO_ID = @id AND K.CITA_ACTIVO = 1
        AND K.CITA_ESTATUS NOT IN ('cancelada','asistio','no_asistio')
        AND K.CITA_FECHA_HORA >= DATEADD(HOUR, -1, GETDATE())
      ORDER BY K.CITA_FECHA_HORA ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /citas/historial — citas pasadas/cerradas del contacto.
exports.getCitasHistorial = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT K.CITA_ID as id, K.CITA_TITULO as titulo, K.CITA_MODALIDAD as modalidad,
             CONVERT(NVARCHAR(19), K.CITA_FECHA_HORA, 126) as fechaHora,
             K.CITA_ESTATUS as estatus, T.TRAT_NOMBRE as tratamientoNombre, K.CITA_NUMERO_SESION as numeroSesion
      FROM CLI_CITAS K
      LEFT JOIN CLI_TRATAMIENTOS T ON T.TRAT_ID = K.CITA_TRATAMIENTO_ID
      WHERE K.CITA_CONTACTO_ID = @id AND K.CITA_ACTIVO = 1
        AND (K.CITA_ESTATUS IN ('cancelada','asistio','no_asistio') OR K.CITA_FECHA_HORA < DATEADD(HOUR, -1, GETDATE()))
      ORDER BY K.CITA_FECHA_HORA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const _citaRateMap = new Map();
function _rateLimitCita(contactoId) {
  const ahora = Date.now();
  const ultimo = _citaRateMap.get(contactoId) ?? 0;
  if (ahora - ultimo < 30_000) return false;
  _citaRateMap.set(contactoId, ahora);
  return true;
}

async function _notificarAsesorCita(pool, tenantKey, citaId, tipo, contactoNombre) {
  try {
    const cita = (await pool.request().input('id', sql.Int, citaId)
      .query(`SELECT CITA_ASIGNADO_A as asignadoA FROM CLI_CITAS WHERE CITA_ID=@id`)).recordset[0];
    const destinatarios = new Set();
    if (cita?.asignadoA) destinatarios.add(cita.asignadoA);
    for (const s of await getUsuariosParaNotificarCorreo('atencion-cliente', tenantKey)) destinatarios.add(s);
    for (const uid of destinatarios) {
      await notificationService.createNotification({
        usuarioId: uid,
        mensaje: tipo === 'confirmada'
          ? `${contactoNombre || 'Un cliente'} confirmó su cita`
          : `${contactoNombre || 'Un cliente'} solicitó ${tipo === 'cancelar' ? 'cancelar' : 'reprogramar'} una cita`,
        tipo: tipo === 'confirmada' ? 'cliente-cita-confirmada' : 'cliente-cita-solicitud',
        dataExtra: { citaId },
        tenantKey,
      });
    }
  } catch (e) {
    console.warn('[portal-cliente cita] notif asesor:', e.message);
  }
}

// Normaliza fecha-hora naïf igual que citaController (evita corrimiento de zona).
function fechaHoraSql(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]} ${m[2]}:${m[3]}:${m[4] || '00'}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// POST /citas/:id/confirmar
exports.confirmarCita = async (req, res) => {
  try {
    const citaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(citaId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const cita = (await pool.request().input('id', sql.Int, citaId).input('c', sql.Int, req.contacto.id)
      .query(`SELECT CITA_ID id, CITA_ESTATUS estatus FROM CLI_CITAS WHERE CITA_ID=@id AND CITA_CONTACTO_ID=@c AND CITA_ACTIVO=1`)).recordset[0];
    if (!cita) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
    if (['cancelada', 'asistio', 'no_asistio'].includes(cita.estatus)) {
      return res.status(409).json({ success: false, message: 'Esta cita ya no se puede confirmar' });
    }

    await pool.request().input('id', sql.Int, citaId).query(`
      UPDATE CLI_CITAS
      SET CITA_CONFIRMADA_POR_CLIENTE=1, CITA_ESTATUS='confirmada', CITA_FECHA_CONFIRMACION=GETDATE()
      WHERE CITA_ID=@id
    `);

    await _notificarAsesorCita(pool, req.user?.empresa, citaId, 'confirmada', req.contacto.nombre);

    res.json({ success: true });
  } catch (e) {
    console.error('Error confirmarCita (portal-cliente):', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /citas/:id/solicitar-cambio
exports.solicitarCambioCita = async (req, res) => {
  try {
    const { tipo, fechaPropuesta, motivo } = req.body || {};
    const citaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(citaId)) return res.status(400).json({ success: false, message: 'id inválido' });
    if (!['reprogramar', 'cancelar'].includes(tipo)) return res.status(400).json({ success: false, message: 'tipo inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    if (!_rateLimitCita(req.contacto.id)) {
      return res.status(429).json({ success: false, message: 'Espera un momento antes de enviar otra solicitud' });
    }

    const cita = (await pool.request().input('id', sql.Int, citaId).input('c', sql.Int, req.contacto.id)
      .query(`SELECT CITA_ID id, CITA_ESTATUS estatus FROM CLI_CITAS WHERE CITA_ID=@id AND CITA_CONTACTO_ID=@c AND CITA_ACTIVO=1`)).recordset[0];
    if (!cita) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
    if (['cancelada', 'asistio', 'no_asistio'].includes(cita.estatus)) {
      return res.status(409).json({ success: false, message: 'Esta cita ya no admite cambios' });
    }

    const pend = (await pool.request().input('id', sql.Int, citaId)
      .query(`SELECT TOP 1 1 x FROM CLI_CITAS_SOLICITUDES WHERE SOL_CITA_ID=@id AND SOL_ESTATUS='pendiente'`)).recordset[0];
    if (pend) return res.status(409).json({ success: false, message: 'Ya tienes una solicitud pendiente para esta cita' });

    const fh = tipo === 'reprogramar' && fechaPropuesta ? fechaHoraSql(fechaPropuesta) : null;
    await pool.request()
      .input('cid', sql.Int, citaId)
      .input('tipo', sql.NVarChar(20), tipo)
      .input('f', sql.VarChar(19), fh)
      .input('m', sql.NVarChar(500), motivo ? String(motivo).slice(0, 500) : null)
      .query(`
        INSERT INTO CLI_CITAS_SOLICITUDES (SOL_CITA_ID, SOL_TIPO, SOL_FECHA_PROPUESTA, SOL_MOTIVO)
        VALUES (@cid, @tipo, CASE WHEN @f IS NULL THEN NULL ELSE CONVERT(DATETIME, @f, 120) END, @m)
      `);

    await _notificarAsesorCita(pool, req.user?.empresa, citaId, tipo, req.contacto.nombre);

    res.status(201).json({ success: true });
  } catch (e) {
    console.error('Error solicitarCambioCita (portal-cliente):', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /incidencias
exports.getIncidencias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT CASO_ID as id, CASO_FOLIO as folio, CASO_TITULO as titulo, CASO_CATEGORIA as categoria,
             CASO_PRIORIDAD as prioridad, CASO_ESTATUS as estatus, CASO_FECHA_CREACION as fechaCreacion,
             CASO_FECHA_LIMITE_SLA as fechaLimiteSla, CASO_SOLUCION_PROPUESTA as solucionPropuesta,
             CASO_FECHA_COMPROMISO as fechaCompromiso, CASO_FECHA_RESOLUCION as fechaResolucion
      FROM CASOS
      WHERE CASO_CONTACTO_ID=@id AND CASO_ACTIVO=1 AND CASO_TIPO='incidencia'
      ORDER BY CASO_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const _incidenciaRateMap = new Map();
function _rateLimitIncidencia(contactoId) {
  const ahora = Date.now();
  const ultimo = _incidenciaRateMap.get(contactoId) ?? 0;
  if (ahora - ultimo < 60_000) return false;
  _incidenciaRateMap.set(contactoId, ahora);
  return true;
}

// POST /incidencias — el cliente abre una incidencia/solicitud. Prioridad
// forzada a 'media' (el cliente no elige), asignada al responsable del contacto.
exports.crearIncidencia = async (req, res) => {
  try {
    const { titulo, descripcion, categoria } = req.body || {};

    const tit = String(titulo || '').trim();
    const desc = String(descripcion || '').trim();
    if (!tit || tit.length > 200) return res.status(400).json({ success: false, message: 'El título es requerido (máx. 200 caracteres)' });
    if (!desc || desc.length > 4000) return res.status(400).json({ success: false, message: 'La descripción es requerida (máx. 4000 caracteres)' });

    if (!_rateLimitIncidencia(req.contacto.id)) {
      return res.status(429).json({ success: false, message: 'Espera un momento antes de enviar otra solicitud' });
    }

    const cat = categoria ? String(categoria).trim().slice(0, 50) : null;

    const resultado = await casoController.crearCasoAutomatico(
      {
        tipo: 'incidencia',
        contactoId: req.contacto.id,
        titulo: tit,
        descripcion: desc,
        categoria: cat,
        prioridad: 'media',
        origen: 'portal',
        tenantKey: req.user?.empresa,
      },
      {
        prioridadDefault: 'media',
        asignarAResponsable: true,
        notifTipo: 'cliente-incidencia-portal',
        notifEmailFn: (u, ctx) => emailService.sendIncidenciaSlaEmail({
          nombre: u.nombre, correo: u.correo, folio: ctx.folio, titulo: ctx.titulo,
          contactoNombre: null, prioridad: 'media', fechaLimiteSla: null, nivel: 'riesgo',
        }),
      },
    );

    if (!resultado) return res.status(500).json({ success: false, message: 'No se pudo registrar la solicitud' });

    // Si el contacto no tiene responsable, avisar a los supervisores del módulo.
    try {
      const pool = await databaseService.getPool(req.user?.empresa);
      const resp = await pool.request().input('id', sql.Int, req.contacto.id)
        .query(`SELECT CONT_RESPONSABLE_ID as responsableId FROM CRM_CONTACTOS WHERE CONT_ID=@id`);
      if (!resp.recordset[0]?.responsableId) {
        const sup = await getUsuariosParaNotificarCorreo('atencion-cliente', req.user?.empresa);
        for (const uid of sup) {
          await notificationService.createNotification({
            usuarioId: uid,
            mensaje: `Solicitud desde el portal: ${resultado.folio} — ${tit}`,
            tipo: 'cliente-incidencia-portal',
            dataExtra: { incidenciaId: resultado.id, folio: resultado.folio, contactoId: req.contacto.id },
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (e) { console.warn('crearIncidencia (portal-cliente) aviso supervisores:', e.message); }

    res.status(201).json({ success: true, folio: resultado.folio });
  } catch (e) {
    console.error('Error crearIncidencia (portal-cliente):', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
