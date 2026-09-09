const sql       = require('mssql');
const crypto    = require('crypto');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const casoController = require('./casoController');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const notificationService = require('../services/notificationService');
const { sanitizeFilename, decryptBuffer } = require('../utils/cryptoDocs');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://intranet.ardabytec.vip:8444';

// Rate-limit en memoria para la creación de incidencias desde el portal: un
// intento por contacto cada 60 s (patrón de asistenciaController._checkRateLimit).
const _incidenciaRateMap = new Map();
function _rateLimitIncidencia(contactoId) {
  const ahora = Date.now();
  const ultimo = _incidenciaRateMap.get(contactoId) ?? 0;
  if (ahora - ultimo < 60_000) return false;
  _incidenciaRateMap.set(contactoId, ahora);
  return true;
}

// Valida un token de portal y devuelve { contactoId } o null.
async function resolverToken(pool, token) {
  if (!token) return null;
  const rs = await pool.request()
    .input('token', sql.NVarChar, token)
    .query(`SELECT PT_CONTACTO_ID as contactoId, PT_EXPIRA as expira FROM CRM_PORTAL_TOKENS WHERE PT_TOKEN=@token AND PT_ACTIVO=1`);
  const row = rs.recordset[0];
  if (!row) return null;
  if (row.expira && new Date(row.expira) < new Date()) return null;
  return { contactoId: row.contactoId };
}

// Admin: enviar invitación de acceso al portal a un contacto
exports.invitar = async (req, res) => {
  try {
    const { contactoId } = req.body;
    if (!contactoId) return res.status(400).json({ success: false, message: 'contactoId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const cont = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_NOMBRE as nombre, CONT_CORREO as correo FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);

    if (!cont.recordset[0]) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    const { nombre, correo } = cont.recordset[0];
    if (!correo) return res.status(400).json({ success: false, message: 'El contacto no tiene correo registrado' });

    const token  = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    // Desactivar tokens anteriores
    await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`UPDATE CRM_PORTAL_TOKENS SET PT_ACTIVO=0 WHERE PT_CONTACTO_ID=@id`);

    await pool.request()
      .input('cid',    sql.Int,      contactoId)
      .input('token',  sql.NVarChar, token)
      .input('email',  sql.NVarChar, correo)
      .input('expira', sql.DateTime, expira)
      .query(`INSERT INTO CRM_PORTAL_TOKENS (PT_CONTACTO_ID,PT_TOKEN,PT_EMAIL,PT_EXPIRA) VALUES (@cid,@token,@email,@expira)`);

    const link = `${BASE_URL}/portal?token=${token}`;
    await emailService.sendInvitacionPortalEmail({ nombre, correo, link });

    res.json({ success: true, message: `Invitación enviada a ${correo}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Portal: validar token y obtener datos del contacto + sus oportunidades
exports.getPortal = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tkRow = await pool.request()
      .input('token', sql.NVarChar, token)
      .query(`
        SELECT pt.PT_CONTACTO_ID as contactoId, pt.PT_EMAIL as email, pt.PT_EXPIRA as expira
        FROM CRM_PORTAL_TOKENS pt
        WHERE pt.PT_TOKEN=@token AND pt.PT_ACTIVO=1
      `);

    if (!tkRow.recordset[0]) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });
    const { contactoId, email, expira } = tkRow.recordset[0];
    if (expira && new Date(expira) < new Date())
      return res.status(401).json({ success: false, message: 'Enlace expirado' });

    // Telemetría: marca cuándo abrió el cliente su portal (best-effort).
    pool.request().input('token', sql.NVarChar, token)
      .query(`UPDATE CRM_PORTAL_TOKENS SET PT_ULTIMA_APERTURA=GETDATE() WHERE PT_TOKEN=@token`)
      .catch(() => {});

    const cont = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_NOMBRE as nombre, CONT_EMPRESA as empresa, CONT_ES_CLIENTE as esCliente FROM CRM_CONTACTOS WHERE CONT_ID=@id`);
    const esCliente = !!cont.recordset[0]?.esCliente;

    const opos = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT
          o.OPO_ID as id, o.OPO_NOMBRE as nombre, o.OPO_ETAPA as etapa,
          o.OPO_VALOR as valor,
          CONVERT(NVARCHAR(10), o.OPO_FECHA_CIERRE, 23) as fechaCierre,
          o.OPO_NOTAS as notas,
          u.NEUS_NOMBRES as responsable,
          (SELECT COUNT(*) FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID=o.OPO_ID AND ACT_COMPLETADA=0) as pendientes,
          (SELECT COUNT(*) FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID=o.OPO_ID AND ACT_COMPLETADA=1) as completadas
        FROM CRM_OPORTUNIDADES o
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
        WHERE o.OPO_CONTACTO_ID=@id AND o.OPO_ACTIVO=1
        ORDER BY o.OPO_FECHA DESC
      `);

    const interacciones = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT i.INT_ID as id, i.INT_OPO_ID as opoId, o.OPO_NOMBRE as opoNombre,
               i.INT_TIPO as tipo, i.INT_CONTENIDO as contenido,
               i.INT_USUARIO_NOMBRE as usuarioNombre, i.INT_FECHA as fecha
        FROM CRM_INTERACCIONES i
        JOIN CRM_OPORTUNIDADES o ON o.OPO_ID=i.INT_OPO_ID AND o.OPO_CONTACTO_ID=@id
        WHERE o.OPO_ACTIVO=1 AND i.INT_TIPO NOT IN ('creacion')
        ORDER BY i.INT_FECHA DESC
      `);

    // Para cada oportunidad, traer cotizaciones enviadas/aprobadas/rechazadas
    const oposConCots = opos.recordset;
    for (const opo of oposConCots) {
      const cots = await pool.request()
        .input('opoId', sql.Int, opo.id)
        .query(`SELECT COT_ID as id, COT_FOLIO as folio, COT_TITULO as titulo, COT_ESTATUS as estatus, COT_TOTAL as total FROM CRM_COTIZACIONES WHERE COT_OPO_ID=@opoId AND COT_ACTIVO=1 AND COT_ESTATUS IN ('enviada','aprobada','rechazada') ORDER BY COT_FECHA_REGISTRO DESC`);
      opo.cotizaciones = cots.recordset;
    }

    const documentos = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT DOC_ID as id, DOC_NOMBRE_ORIGINAL as nombreOriginal, DOC_MIME_TYPE as mimeType,
               DOC_TAMANO_BYTES as tamanoBytes, DOC_FECHA_SUBIDA as fechaSubida
        FROM CRM_DOCUMENTOS_CLIENTE
        WHERE DOC_CONTACTO_ID=@id AND DOC_VISIBLE_PORTAL=1 AND DOC_ACTIVO=1
        ORDER BY DOC_FECHA_SUBIDA DESC
      `);

    // Seguimiento a clientes: solo para contactos dados de alta como cliente.
    // Nunca se exponen datos internos (asignado, comentarios, evidencias).
    let incidencias = [], pagos = [], renovaciones = [];
    if (esCliente) {
      // Fase 6: el portal lee las incidencias desde CASOS (tipo 'incidencia').
      // Nunca se exponen asignado / comentarios / evidencias.
      const incRs = await pool.request().input('id', sql.Int, contactoId).query(`
        SELECT CASO_ID as id, CASO_FOLIO as folio, CASO_TITULO as titulo, CASO_CATEGORIA as categoria,
               CASO_PRIORIDAD as prioridad, CASO_ESTATUS as estatus, CASO_FECHA_CREACION as fechaCreacion,
               CASO_FECHA_LIMITE_SLA as fechaLimiteSla, CASO_SOLUCION_PROPUESTA as solucionPropuesta,
               CASO_FECHA_COMPROMISO as fechaCompromiso, CASO_FECHA_RESOLUCION as fechaResolucion
        FROM CASOS
        WHERE CASO_CONTACTO_ID=@id AND CASO_ACTIVO=1 AND CASO_TIPO='incidencia'
        ORDER BY CASO_FECHA_CREACION DESC
      `);
      incidencias = incRs.recordset;

      const pagRs = await pool.request().input('id', sql.Int, contactoId).query(`
        SELECT REC_ID as id, REC_CONCEPTO as concepto, REC_MONTO as monto, REC_MONTO_PAGADO as montoPagado,
               CONVERT(NVARCHAR(10), REC_FECHA_LIMITE, 23) as fechaLimite, REC_ESTATUS as estatus,
               DATEDIFF(DAY, CAST(GETDATE() AS DATE), REC_FECHA_LIMITE) as diasRestantes
        FROM CRM_RECORDATORIOS_PAGO
        WHERE REC_CONTACTO_ID=@id AND REC_ACTIVO=1 AND REC_ESTATUS IN ('pendiente','enviado','parcial')
        ORDER BY REC_FECHA_LIMITE ASC
      `);
      pagos = pagRs.recordset.map((p) => ({
        ...p,
        estatusVisual: p.diasRestantes < 0 ? 'vencido' : p.diasRestantes === 0 ? 'vence_hoy' : 'proximo_vencer',
      }));

      const renRs = await pool.request().input('id', sql.Int, contactoId).query(`
        SELECT FEC_ID as id, FEC_TIPO as tipo, FEC_DESCRIPCION as descripcion,
               CONVERT(NVARCHAR(10), FEC_FECHA, 23) as fecha,
               DATEDIFF(DAY, CAST(GETDATE() AS DATE), FEC_FECHA) as diasRestantes
        FROM CLI_FECHAS_IMPORTANTES
        WHERE FEC_CONTACTO_ID=@id AND FEC_ACTIVO=1 AND FEC_ESTATUS='vigente'
        ORDER BY FEC_FECHA ASC
      `);
      renovaciones = renRs.recordset;
    }

    res.json({
      success: true,
      data: {
        contacto:      { nombre: cont.recordset[0]?.nombre, empresa: cont.recordset[0]?.empresa, email, esCliente },
        oportunidades: oposConCots,
        interacciones: interacciones.recordset,
        documentos:    documentos.recordset,
        incidencias,
        pagos,
        renovaciones,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Portal: descarga de documento del cliente, validando token igual que getPortal
exports.downloadDocumentoPortal = async (req, res) => {
  try {
    const { token } = req.query;
    const docId = parseInt(req.params.docId, 10);
    if (!token) return res.status(400).json({ success: false, message: 'Token requerido' });
    if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tkRow = await pool.request()
      .input('token', sql.NVarChar, token)
      .query(`
        SELECT pt.PT_CONTACTO_ID as contactoId, pt.PT_EXPIRA as expira
        FROM CRM_PORTAL_TOKENS pt
        WHERE pt.PT_TOKEN=@token AND pt.PT_ACTIVO=1
      `);
    if (!tkRow.recordset[0]) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });
    const { contactoId, expira } = tkRow.recordset[0];
    if (expira && new Date(expira) < new Date())
      return res.status(401).json({ success: false, message: 'Enlace expirado' });

    const doc = await pool.request()
      .input('docId', sql.Int, docId)
      .input('contactoId', sql.Int, contactoId)
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
      console.error('❌ Error descifrando documento portal CRM:', err);
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

// Portal: el cliente abre una incidencia/solicitud. Público, token en el body
// (mismo patrón que aprobar/rechazar cotización). Prioridad forzada a 'media'
// (el cliente no elige), asignada al responsable del contacto.
exports.crearIncidenciaPortal = async (req, res) => {
  try {
    const { portalToken, titulo, descripcion, categoria } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    const tk = await resolverToken(pool, portalToken);
    if (!tk) return res.status(401).json({ success: false, message: 'Enlace inválido o expirado' });

    const tit = String(titulo || '').trim();
    const desc = String(descripcion || '').trim();
    if (!tit || tit.length > 200) return res.status(400).json({ success: false, message: 'El título es requerido (máx. 200 caracteres)' });
    if (!desc || desc.length > 4000) return res.status(400).json({ success: false, message: 'La descripción es requerida (máx. 4000 caracteres)' });

    if (!_rateLimitIncidencia(tk.contactoId)) {
      return res.status(429).json({ success: false, message: 'Espera un momento antes de enviar otra solicitud' });
    }

    const cat = categoria ? String(categoria).trim().slice(0, 50) : null;

    const resultado = await casoController.crearCasoAutomatico(
      {
        tipo: 'incidencia',
        contactoId: tk.contactoId,
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
      const resp = await pool.request().input('id', sql.Int, tk.contactoId)
        .query(`SELECT CONT_RESPONSABLE_ID as responsableId FROM CRM_CONTACTOS WHERE CONT_ID=@id`);
      if (!resp.recordset[0]?.responsableId) {
        const sup = await getUsuariosParaNotificarCorreo('atencion-cliente', req.user?.empresa);
        for (const uid of sup) {
          await notificationService.createNotification({
            usuarioId: uid,
            mensaje: `Solicitud desde el portal: ${resultado.folio} — ${tit}`,
            tipo: 'cliente-incidencia-portal',
            dataExtra: { incidenciaId: resultado.id, folio: resultado.folio, contactoId: tk.contactoId },
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (e) { console.warn('crearIncidenciaPortal aviso supervisores:', e.message); }

    res.status(201).json({ success: true, folio: resultado.folio });
  } catch (e) {
    console.error('Error crearIncidenciaPortal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
