const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const databaseService = require('../services/databaseService');
const ticketController = require('./ticketController');
const emailService = require('../services/emailService');
const { logAudit } = require('../services/auditService');

// Usuario "sistema" sembrado en ensureTicketsSchema (schemaService.js) — no
// puede iniciar sesión (NEUS_ACTIVO=0), solo existe para satisfacer el FK
// NOT NULL de TICKETS.SOLICITANTE_ID cuando el solicitante real es un
// visitante anónimo del sitio web sin cuenta en el sistema.
const USUARIO_SISTEMA_WEB = 'sistema.web.publica';
let cacheSolicitanteId = null;

async function resolverSolicitanteSistema(pool) {
  if (cacheSolicitanteId) return cacheSolicitanteId;
  const rs = await pool.request()
    .input('usuario', sql.VarChar(50), USUARIO_SISTEMA_WEB)
    .query(`SELECT NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_USUARIO = @usuario`);
  if (!rs.recordset.length) return null;
  cacheSolicitanteId = rs.recordset[0].NEUS_ID;
  return cacheSolicitanteId;
}

// Rate-limit en memoria por IP: una solicitud cada 30 segundos, evita que un
// mismo visitante sature el formulario público (no hay CAPTCHA en el sitio,
// ver notas de la investigación de este feature).
const _rateMap = new Map();
function _checkRateLimit(ip) {
  const ahora = Date.now();
  const ultimo = _rateMap.get(ip) ?? 0;
  if (ahora - ultimo < 30_000) return false;
  _rateMap.set(ip, ahora);
  return true;
}

// POST /api/tickets/solicitud-publica — formulario anónimo del sitio
// institucional (extra/Pagina de Intranet_1/index.html). Crea un ticket real
// en TICKETS (canalOrigen='web_publica') y notifica al grupo configurado en
// Configuración > Notificaciones > Correo (módulo 'web_publica'), separado
// del módulo 'tickets' usado para tickets internos.
exports.crearSolicitudPublica = async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'desconocida';
    if (!_checkRateLimit(ip)) {
      return res.status(429).json({ success: false, message: 'Demasiadas solicitudes, espera unos segundos e inténtalo de nuevo.' });
    }

    const nombre = (req.body?.nombre || '').toString().trim().slice(0, 150);
    const email = (req.body?.email || '').toString().trim().slice(0, 200);
    const telefono = (req.body?.telefono || '').toString().trim().slice(0, 40);
    const mensaje = (req.body?.mensaje || '').toString().trim().slice(0, 4000);
    // Clasificación opcional: si el visitante no la llena, crearTicketInterno
    // cae en sus propios valores por defecto (comodín de categoría/sede,
    // prioridad P3) sin romper la creación — ver reglasAsignacionService.
    const categoria = (req.body?.categoria || '').toString().trim().slice(0, 50) || null;
    const sede = (req.body?.sede || '').toString().trim().slice(0, 100) || null;
    const impacto = (req.body?.impacto || '').toString().trim().slice(0, 20) || null;
    const urgencia = (req.body?.urgencia || '').toString().trim().slice(0, 20) || null;
    const evidenciaUrl = (req.body?.evidenciaUrl || '').toString().trim().slice(0, 500) || null;

    if (!nombre || (!email && !telefono) || !mensaje) {
      return res.status(400).json({ success: false, message: 'Nombre, un medio de contacto (correo o teléfono) y el mensaje son requeridos.' });
    }

    const pool = await databaseService.getPool(req.query?.empresa);
    const solicitanteId = await resolverSolicitanteSistema(pool);
    if (!solicitanteId) {
      console.error('❌ [crearSolicitudPublica] Usuario sistema.web.publica no existe en NEUS_USUARIOS');
      return res.status(500).json({ success: false, message: 'El formulario no está disponible en este momento.' });
    }

    const contactoLineas = [
      `Solicitud recibida desde el sitio web público.`,
      `Nombre: ${nombre}`,
      email ? `Correo: ${email}` : null,
      telefono ? `Teléfono: ${telefono}` : null,
      evidenciaUrl ? `Evidencia: ${evidenciaUrl}` : null,
      '',
      mensaje,
    ].filter((l) => l !== null).join('\n');

    const resultado = await ticketController.crearTicketInterno(pool, {
      solicitanteId,
      area: 'TI',
      titulo: `Solicitud web: ${nombre}`.slice(0, 200),
      descripcion: contactoLineas,
      clasificacion: 'consulta',
      categoria,
      sede,
      impacto,
      urgencia,
      esAD: false,
      prioridadManual: false,
      tenantKey: req.query?.empresa,
      canalOrigen: 'web_publica',
    });

    if (!resultado.ok) {
      return res.status(resultado.status).json({ success: false, message: resultado.message });
    }

    const ticketId = resultado.data?.id;

    if (evidenciaUrl && ticketId) {
      pool.request()
        .input('tid', sql.Int, ticketId)
        .input('det', sql.NVarChar, evidenciaUrl)
        .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, DETALLE, USER_ID) VALUES (@tid, 'evidencia', @det, NULL)`)
        .catch((e) => console.warn('⚠️ Error registrando evidencia de solicitud web:', e?.message || e));
    }

    logAudit(pool, {
      userId: null,
      userName: `Web pública (${ip})`,
      modulo: 'tickets',
      accion: 'crear-solicitud-publica',
      entidadId: ticketId,
      detalle: `${nombre} · ${email || telefono}`,
      ip,
    }).catch(() => {});

    emailService.sendSolicitudWebPublicaEmail({
      ticketId,
      titulo: `Solicitud web: ${nombre}`,
      descripcion: mensaje,
      contactoNombre: nombre,
      contactoEmail: email || null,
      contactoTelefono: telefono || null,
      tenantKey: req.query?.empresa,
    }).catch((e) => console.warn('⚠️ Error enviando aviso de solicitud web pública:', e?.message || e));

    return res.status(201).json({ success: true, message: 'Solicitud recibida. Te contactaremos pronto.' });
  } catch (e) {
    console.error('Error crearSolicitudPublica:', e);
    return res.status(500).json({ success: false, message: 'No se pudo enviar la solicitud, intenta de nuevo más tarde.' });
  }
};

// GET /api/tickets/solicitud-publica/catalogos — catálogos de solo lectura
// (Categorías, Sedes, Impactos, Urgencias) para poblar los selectores del
// formulario público. Reusa los mismos controllers de Configuración >
// Tecnología/TI (catalogosTiController), que ya son agnósticos a req.user.
exports.getCatalogosPublicos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.query?.empresa);
    const [cats, sedes, impactos, urgencias] = await Promise.all([
      pool.request().query(`SELECT CAT_ID as id, CAT_NOMBRE as nombre FROM TICKET_CATEGORIAS WHERE CAT_ACTIVA = 1 ORDER BY CAT_ORDEN, CAT_NOMBRE`),
      pool.request().query(`SELECT SEDE_ID as id, SEDE_NOMBRE as nombre FROM SEDES WHERE SEDE_ACTIVA = 1 ORDER BY SEDE_NOMBRE`),
      pool.request().query(`SELECT IMP_ID as id, IMP_CLAVE as clave, IMP_NOMBRE as nombre FROM TICKET_IMPACTOS WHERE IMP_ACTIVA = 1 ORDER BY IMP_ORDEN, IMP_NOMBRE`),
      pool.request().query(`SELECT URG_ID as id, URG_CLAVE as clave, URG_NOMBRE as nombre FROM TICKET_URGENCIAS WHERE URG_ACTIVA = 1 ORDER BY URG_ORDEN, URG_NOMBRE`),
    ]);
    res.json({
      success: true,
      data: {
        categorias: cats.recordset,
        sedes: sedes.recordset,
        impactos: impactos.recordset,
        urgencias: urgencias.recordset,
      },
    });
  } catch (e) {
    console.error('Error listando catálogos públicos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tickets/solicitud-publica/evidencia — subida anónima de un
// archivo de evidencia (imagen o PDF) para adjuntar a una solicitud pública.
// Sigue el mismo patrón que uploadController.uploadVacanteCV (JSON con
// base64, sin multer): solo el visitante hace este POST antes de enviar el
// formulario, no un ticket ya creado.
const EVIDENCIA_PUBLICA_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const EVIDENCIA_PUBLICA_EXT_VALIDAS = /\.(pdf|jpg|jpeg|png|webp)$/i;

exports.subirEvidenciaPublica = async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'desconocida';
    if (!_checkRateLimit(`evidencia:${ip}`)) {
      return res.status(429).json({ success: false, message: 'Demasiados intentos, espera unos segundos e inténtalo de nuevo.' });
    }

    const { base64, filename } = req.body || {};
    if (!base64 || !filename) {
      return res.status(400).json({ success: false, message: 'base64 y filename son requeridos' });
    }

    const originalName = path.basename(String(filename).replace(/\\/g, '/'));
    if (!EVIDENCIA_PUBLICA_EXT_VALIDAS.test(originalName)) {
      return res.status(400).json({ success: false, message: 'Solo se permiten archivos PDF, JPG, PNG o WEBP' });
    }
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const commaIdx = base64.indexOf(',');
    const dataPart = commaIdx >= 0 ? base64.substring(commaIdx + 1) : base64;
    const buffer = Buffer.from(dataPart, 'base64');

    if (buffer.length > EVIDENCIA_PUBLICA_MAX_BYTES) {
      return res.status(400).json({ success: false, message: 'El archivo excede el tamaño máximo de 5MB' });
    }

    const carpeta = path.join(__dirname, '..', 'public', 'uploads', 'solicitud-publica-evidencia');
    if (!fs.existsSync(carpeta)) {
      fs.mkdirSync(carpeta, { recursive: true });
    }

    const finalName = `${Date.now()}_${safeName}`;
    fs.writeFileSync(path.join(carpeta, finalName), buffer);

    const base = (process.env.BASE_PUBLIC_URL || '').replace(/\/$/, '');
    const publicUrl = base
      ? `${base}/uploads/solicitud-publica-evidencia/${finalName}`
      : `/uploads/solicitud-publica-evidencia/${finalName}`;

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (e) {
    console.error('Error subiendo evidencia de solicitud pública:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
