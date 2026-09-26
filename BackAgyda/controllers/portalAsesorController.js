const sql = require('mssql');
const path = require('path');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const { FUNCIONES, usuariosConFuncion } = require('../services/funcionesUsuarioService');
const mensajeriaController = require('./mensajeriaController');
const crmDocumentosCliente = require('./crmDocumentosClienteController');

// Portal de Cliente: su asesor (el responsable del contacto en el CRM), el
// chat con él (un DM de Mensajería) y el aviso al grupo "Asesor de clientes"
// cuando todavía no tiene uno. También la subida de documentos del cliente.
// req.contacto lo resuelve requirePortalCliente (la empresa cliente).

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://agyda.ardabytec.vip';

// Asesor = responsable del contacto, si sigue activo.
async function asesorDe(pool, contactoId) {
  const r = await pool.request().input('id', sql.Int, contactoId).query(`
    SELECT u.NEUS_ID id, u.NEUS_NOMBRES nombre, u.NEUS_PUESTO puesto, u.NEUS_FOTO_URL fotoUrl
    FROM dbo.CRM_CONTACTOS c
    JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = c.CONT_RESPONSABLE_ID AND u.NEUS_ACTIVO = 1
    WHERE c.CONT_ID = @id`);
  return r.recordset[0] || null;
}

// GET /portal-cliente/asesor
exports.getAsesor = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const asesor = await asesorDe(pool, req.contacto.id);
    res.json({ success: true, data: { asesor } });
  } catch (e) {
    console.error('portalAsesor.getAsesor:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener tu asesor' });
  }
};

// POST /portal-cliente/asesor/chat — abre (o reutiliza) el chat directo con
// su asesor, con la misma lógica de Mensajería: el asesor lo ve y contesta
// desde su Mensajería normal. El cliente nunca elige con quién hablar.
exports.abrirChatAsesor = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const asesor = await asesorDe(pool, req.contacto.id);
    if (!asesor) return res.status(409).json({ success: false, message: 'Aún no tienes un asesor asignado', sinAsesor: true });
    return mensajeriaController.crearOReusarDM({ ...req, body: { usuarioId: asesor.id } }, res);
  } catch (e) {
    console.error('portalAsesor.abrirChatAsesor:', e.message);
    res.status(500).json({ success: false, message: 'No se pudo abrir el chat' });
  }
};

// Un aviso por empresa cliente cada 30 minutos (evita que el botón se vuelva spam).
const _notificarRate = new Map();
const NOTIFICAR_CADA_MS = 30 * 60 * 1000;

// POST /portal-cliente/asesor/notificar { mensaje? } — el cliente no tiene
// asesor: avisa por correo y en AGYDA a los usuarios con la función "Asesor
// de clientes". Si nadie la tiene, a quienes reciben correos de Atención a
// clientes, para que la solicitud no se pierda.
exports.notificarSinAsesor = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    if (await asesorDe(pool, req.contacto.id)) {
      return res.status(409).json({ success: false, message: 'Ya tienes un asesor asignado' });
    }
    const ultimo = _notificarRate.get(req.contacto.id);
    if (ultimo && Date.now() - ultimo < NOTIFICAR_CADA_MS) {
      const min = Math.ceil((NOTIFICAR_CADA_MS - (Date.now() - ultimo)) / 60000);
      return res.status(429).json({ success: false, message: `Ya avisamos al equipo. Podrás volver a avisar en ${min} min.` });
    }

    let destinatarios = await usuariosConFuncion(pool, FUNCIONES.ASESOR_CLIENTES);
    if (!destinatarios.length) {
      const ids = (await getUsuariosParaNotificarCorreo('atencion-cliente', req.user?.empresa)).map(Number).filter(Boolean);
      if (ids.length) {
        const r = await pool.request().query(`SELECT NEUS_ID id, NEUS_NOMBRES nombre, NEUS_CORREO correo FROM dbo.NEUS_USUARIOS
          WHERE NEUS_ACTIVO = 1 AND NEUS_ID IN (${ids.join(',')})`);
        destinatarios = r.recordset;
      }
    }
    if (!destinatarios.length) {
      return res.status(503).json({ success: false, message: 'Por ahora no hay asesores disponibles para avisar. Intenta más tarde.' });
    }

    const yo = (await pool.request().input('id', sql.Int, req.user.id)
      .query('SELECT NEUS_NOMBRES nombre, NEUS_USUARIO usuario FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @id')).recordset[0] || {};
    const clienteNombre = req.contacto.empresa || req.contacto.nombre || 'Cliente';
    const mensaje = String(req.body?.mensaje || '').trim().slice(0, 500) || null;
    const link = `${BASE_URL}/atencion-cliente/clientes?tab=clientes`;

    let correos = 0;
    for (const d of destinatarios) {
      await notificationService.createNotification({
        usuarioId: d.id,
        mensaje: `${clienteNombre} pide un asesor desde su portal`,
        tipo: 'cliente-sin-asesor',
        dataExtra: { contactoId: req.contacto.id, contactoNombre: clienteNombre },
        tenantKey: req.user?.empresa,
        dedupeKey: `sin-asesor-${req.contacto.id}`,
      }).catch(() => {});
      if (d.correo) {
        const r = await emailService.sendClienteSinAsesorEmail({
          nombre: d.nombre, correo: d.correo, clienteNombre,
          solicitanteNombre: yo.nombre || 'Usuario del portal', solicitanteCorreo: yo.usuario || null,
          mensaje, link,
        });
        if (r?.enviado) correos++;
      }
    }
    _notificarRate.set(req.contacto.id, Date.now());
    res.json({ success: true, data: { avisados: destinatarios.length, correos } });
  } catch (e) {
    console.error('portalAsesor.notificarSinAsesor:', e.message);
    res.status(500).json({ success: false, message: 'No se pudo avisar al equipo' });
  }
};

// Tipos que el cliente puede subir desde el portal (documentos comunes).
const EXT_PERMITIDAS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.ppt', '.pptx', '.zip', '.xml']);

// POST /portal-cliente/documentos (multipart: file, descripcion?) — lo guarda
// igual que el CRM (cifrado, en CRM_DOCUMENTOS_CLIENTE), visible en su portal
// y marcado como enviado por el cliente; avisa a su asesor.
exports.subirDocumento = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Selecciona un archivo' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!EXT_PERMITIDAS.has(ext)) {
    return res.status(400).json({ success: false, message: 'Tipo de archivo no permitido (PDF, imágenes, Office, CSV, TXT, ZIP o XML)' });
  }
  req.params.id = String(req.contacto.id);
  req.body = { descripcion: req.body?.descripcion, categoria: 'Enviado por el cliente', visiblePortal: 'true' };

  // Tras guardar, avisar al asesor (si tiene) sin cambiar la respuesta del CRM.
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      (async () => {
        const pool = await databaseService.getPool(req.user?.empresa);
        const asesor = await asesorDe(pool, req.contacto.id);
        if (asesor) {
          await notificationService.createNotification({
            usuarioId: asesor.id,
            mensaje: `${req.contacto.empresa || req.contacto.nombre} subió un documento: ${body.data?.nombreOriginal ?? ''}`,
            tipo: 'cliente-documento-portal',
            // docClienteId (no documentoId): ese nombre lo enruta notificationTarget a Legal.
            dataExtra: { contactoId: req.contacto.id, docClienteId: body.data?.id },
            tenantKey: req.user?.empresa,
          });
        }
      })().catch((e) => console.warn('portalAsesor.subirDocumento aviso:', e.message));
    }
    return json(body);
  };
  return crmDocumentosCliente.upload(req, res);
};
