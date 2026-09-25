const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const casoController = require('./casoController');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const notificationService = require('../services/notificationService');
const { sanitizeFilename, decryptBuffer } = require('../utils/cryptoDocs');
const { getPortalRolAcciones } = require('../middleware/portalCliente');
const facturacionService = require('../services/facturacionService');
const cotizacionesController = require('./crmCotizacionesController');

// Portal del cliente (login real, NEUS_TIPOUSUARIO='CL') — mismo shape de
// datos que crmPortalController.js (el portal por liga/token), pero
// identificando al contacto vía requirePortalCliente (req.contacto) en vez
// de un token de query/body. Separado en un endpoint por sección en vez de
// un solo blob, para que cada pantalla del portal pueda refrescar la suya.

// GET /mis-acciones — acciones del sub-rol del usuario logueado, para que el
// frontend gatee botones/secciones por acción (no por nombre de rol).
exports.getMisAcciones = async (req, res) => {
  try {
    const acciones = await getPortalRolAcciones(req.contacto.subrolId, req.user?.empresa);
    res.json({ success: true, data: Array.from(acciones) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /notificaciones — notificaciones reales del usuario del portal logueado
// (req.user.id es su propio NEUS_ID, igual que para cualquier usuario interno
// — mismo notificationService, solo que aquí el destinatario es el cliente).
exports.getNotificaciones = async (req, res) => {
  try {
    const notificaciones = await notificationService.listNotifications(req.user.id, false, 30, req.user?.empresa);
    res.json({ success: true, data: notificaciones });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /notificaciones/:id/marcar-leida
exports.marcarNotificacionLeida = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    await notificationService.markAsRead(id, req.user?.empresa);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /notificaciones/marcar-todas-leidas
exports.marcarTodasNotificacionesLeidas = async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user.id, req.user?.empresa);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

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

// GET /productos-servicios — productos y servicios contratados por la
// empresa, para mostrarlos en el Principal del portal (mismo puente
// CRM_CONTACTO_PRODUCTOS_SERVICIOS que ya usa el módulo interno de Clientes).
exports.getProductosServicios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, req.contacto.id)
      .query(`
        SELECT
          CCPS.CCPS_ID as id, PS.PS_ID as productoServicioId, PS.PS_TIPO as tipo,
          PS.PS_NOMBRE as nombre, PS.PS_DESCRIPCION as descripcion,
          PS.PS_PRECIO as precio, PS.PS_RECURRENCIA as recurrencia,
          CCPS.CCPS_FECHA_ASIGNACION as fechaAlta
        FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS CCPS
        JOIN PRODUCTOS_SERVICIOS PS ON PS.PS_ID = CCPS.CCPS_PS_ID
        WHERE CCPS.CCPS_CONT_ID = @id
        ORDER BY PS.PS_NOMBRE ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /catalogo-productos-servicios — catálogo completo disponible (no solo
// lo ya contratado), para que el cliente elija qué cotizar.
exports.getCatalogoProductosServicios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT PS_ID as id, PS_TIPO as tipo, PS_NOMBRE as nombre,
             PS_DESCRIPCION as descripcion, PS_PRECIO as precio,
             PS_RECURRENCIA as recurrencia
      FROM PRODUCTOS_SERVICIOS
      WHERE PS_ACTIVO = 1
      ORDER BY PS_NOMBRE ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const _cotizacionRateMap = new Map();
function _rateLimitCotizacion(contactoId) {
  const ahora = Date.now();
  const ultimo = _cotizacionRateMap.get(contactoId) ?? 0;
  if (ahora - ultimo < 60_000) return false;
  _cotizacionRateMap.set(contactoId, ahora);
  return true;
}

// POST /solicitar-cotizacion — el cliente elige productos/servicios del
// catálogo y se crea una CRM_COTIZACIONES real en borrador, igual que si la
// hubiera armado un vendedor interno (reusa _insertItems/_cfgVentas de
// crmCotizacionesController para no duplicar el cálculo de subtotal/IVA).
// Se busca una oportunidad abierta del contacto o se crea una nueva.
exports.solicitarCotizacion = async (req, res) => {
  const pool = await databaseService.getPool(req.user?.empresa);
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: 'Selecciona al menos un producto o servicio' });
    if (items.length > 30) return res.status(400).json({ success: false, message: 'Máximo 30 conceptos por solicitud' });

    if (!_rateLimitCotizacion(req.contacto.id)) {
      return res.status(429).json({ success: false, message: 'Espera un momento antes de enviar otra solicitud' });
    }

    // Valida los psId contra el catálogo real y arma los renglones — nunca se
    // confía en el precio/descripción que mande el cliente desde el frontend.
    const ids = [...new Set(items.map((it) => Number(it.psId)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ success: false, message: 'Selección inválida' });
    const catalogo = await pool.request().query(`
      SELECT PS_ID as id, PS_TIPO as tipo, PS_NOMBRE as nombre, PS_PRECIO as precio,
             PS_COSTO as costo, PS_IVA_TASA as ivaTasa, PS_CLAVE_PROD_SERV as claveProdServ, PS_CLAVE_UNIDAD as claveUnidad
      FROM PRODUCTOS_SERVICIOS WHERE PS_ACTIVO = 1 AND PS_ID IN (${ids.join(',')})
    `);
    const porId = new Map(catalogo.recordset.map((p) => [p.id, p]));
    const renglones = [];
    for (const it of items) {
      const ps = porId.get(Number(it.psId));
      if (!ps) continue;
      const cantidad = Math.max(1, Number(it.cantidad) || 1);
      const requerimientos = it.requerimientos ? String(it.requerimientos).trim().slice(0, 4000) : null;
      renglones.push({
        descripcion: ps.nombre, cantidad, precioUnit: ps.precio, descuento: 0,
        costoUnit: ps.costo, psId: ps.id, ivaTasa: ps.ivaTasa, claveProdServ: ps.claveProdServ, claveUnidad: ps.claveUnidad,
        requerimientos,
      });
    }
    if (!renglones.length) return res.status(400).json({ success: false, message: 'Selección inválida' });

    // Fecha/hora opcional para agendar la contactación como una reunión real
    // (CLI_CITAS), igual que ya hace el módulo de Seguimiento de Cliente —
    // no un campo suelto en la oportunidad.
    const fechaContacto = req.body?.fechaContactacion ? fechaHoraSql(req.body.fechaContactacion) : null;

    let opoId = (await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT TOP 1 OPO_ID as id FROM CRM_OPORTUNIDADES
      WHERE OPO_CONTACTO_ID=@id AND OPO_ACTIVO=1 AND OPO_ETAPA NOT IN ('ganado','perdido')
      ORDER BY OPO_FECHA_REGISTRO DESC
    `)).recordset[0]?.id;

    if (!opoId) {
      const nombreOpo = `Solicitud de cotización — ${req.contacto.empresa || req.contacto.nombre}`.slice(0, 200);
      opoId = (await pool.request()
        .input('nombre', sql.NVarChar, nombreOpo)
        .input('contactoId', sql.Int, req.contacto.id)
        .query(`
          INSERT INTO CRM_OPORTUNIDADES (OPO_NOMBRE,OPO_CONTACTO_ID,OPO_ETAPA,OPO_TAGS)
          VALUES (@nombre,@contactoId,'prospecto','portal-cliente');
          SELECT SCOPE_IDENTITY() as id;
        `)).recordset[0].id;
    }

    const cfg = await cotizacionesController._cfgVentas(req);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const titulo = `Solicitud desde Portal — ${new Date().toLocaleDateString('es-MX')}`;
      const r = await tx.request()
        .input('opoId', sql.Int, opoId).input('titulo', sql.NVarChar(200), titulo)
        .query(`INSERT INTO CRM_COTIZACIONES(COT_OPO_ID,COT_FOLIO,COT_TITULO) OUTPUT INSERTED.COT_ID as id VALUES(@opoId,'',@titulo)`);
      const cotId = r.recordset[0].id;
      const folio = cotizacionesController._fmtFolio(cotId);
      const t = await cotizacionesController._insertItems(tx, cotId, renglones, cfg);
      const semaforo = cotizacionesController._calcSemaforo(t.margenPct, cfg);
      await tx.request()
        .input('id', sql.Int, cotId).input('folio', sql.NVarChar(20), folio)
        .input('sub', sql.Decimal(18, 2), t.subtotal).input('iva', sql.Decimal(18, 2), t.iva)
        .input('total', sql.Decimal(18, 2), t.total).input('ct', sql.Decimal(18, 2), t.costoTotal)
        .input('ut', sql.Decimal(18, 2), t.utilidad).input('mp', sql.Decimal(6, 2), t.margenPct)
        .input('sem', sql.NVarChar(12), semaforo)
        .query(`UPDATE CRM_COTIZACIONES SET COT_FOLIO=@folio, COT_SUBTOTAL=@sub, COT_IVA=@iva, COT_TOTAL=@total,
                  COT_COSTO_TOTAL=@ct, COT_UTILIDAD=@ut, COT_MARGEN_PCT=@mp, COT_SEMAFORO=@sem
                WHERE COT_ID=@id`)
      await tx.commit();

      let citaId = null;
      if (fechaContacto) {
        try {
          const rc = await pool.request()
            .input('contactoId', sql.Int, req.contacto.id)
            .input('titulo', sql.NVarChar(200), `Contactación — Solicitud ${folio}`)
            .input('motivo', sql.NVarChar(sql.MAX), `Seguimiento a la solicitud de cotización ${folio} generada desde el Portal de Cliente.`)
            .input('fechaHora', sql.VarChar(19), fechaContacto)
            .query(`
              INSERT INTO CLI_CITAS (CITA_CONTACTO_ID, CITA_MODALIDAD, CITA_TITULO, CITA_MOTIVO, CITA_FECHA_HORA, CITA_DURACION_MIN, CITA_RECORDAR_MIN_ANTES)
              OUTPUT INSERTED.CITA_ID
              VALUES (@contactoId, 'telefonica', @titulo, @motivo, CONVERT(DATETIME, @fechaHora, 120), 30, '1440,60')
            `);
          citaId = rc.recordset[0].CITA_ID;
        } catch (e) { console.warn('solicitarCotizacion (portal-cliente) crear cita:', e.message); }
      }

      try {
        const sup = await getUsuariosParaNotificarCorreo('crm', req.user?.empresa);
        for (const uid of sup) {
          await notificationService.createNotification({
            usuarioId: uid,
            mensaje: `Nueva solicitud de cotización desde el portal: ${folio} — ${req.contacto.empresa || req.contacto.nombre}`,
            tipo: 'cliente-cotizacion-portal',
            dataExtra: { cotId, folio, opoId, contactoId: req.contacto.id, citaId },
            tenantKey: req.user?.empresa,
          });
        }
      } catch (e) { console.warn('solicitarCotizacion (portal-cliente) aviso ventas:', e.message); }

      res.status(201).json({ success: true, data: { id: cotId, folio, citaId } });
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error('Error solicitarCotizacion (portal-cliente):', e);
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
        WHERE COT_OPO_ID=@opoId AND COT_ACTIVO=1 AND COT_ESTATUS IN ('borrador','enviada','aprobada','rechazada')
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

// GET /facturas/:id/documento/:formato — PDF/XML de una factura propia.
// Calcado de facturasController.descargar (panel interno) pero con el WHERE
// atado a req.contacto.id: sin esto, cualquier usuario del portal podría
// descargar la factura de otro cliente con solo cambiar el :id en la URL.
exports.descargarFacturaDocumento = async (req, res) => {
  try {
    const facId = parseInt(req.params.id, 10);
    const formato = req.params.formato === 'xml' ? 'xml' : 'pdf';
    if (!Number.isInteger(facId) || facId <= 0) {
      return res.status(400).json({ success: false, message: 'Factura inválida' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, facId)
      .input('contactoId', sql.Int, req.contacto.id)
      .query(`SELECT * FROM dbo.FACTURAS WHERE FAC_ID=@id AND FAC_CLIENTE_ID=@contactoId`);
    const f = rs.recordset[0];
    if (!f) return res.status(404).json({ success: false, message: 'Factura no encontrada' });

    if (formato === 'xml' && f.FAC_XML) {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${f.FAC_SERIE}${f.FAC_FOLIO}.xml"`);
      return res.send(f.FAC_XML);
    }
    if (f.FAC_ESTATUS === 'pre-factura' || !f.FAC_PAC_ID) {
      return res.status(409).json({ success: false, message: 'La factura aún no está timbrada.' });
    }
    const buf = await facturacionService.descargar(req.user?.empresa, f.FAC_PAC_ID, formato);
    res.setHeader('Content-Type', formato === 'xml' ? 'application/xml' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${f.FAC_SERIE}${f.FAC_FOLIO}.${formato}"`);
    res.send(buf);
  } catch (e) {
    console.error('portalCliente.descargarFacturaDocumento:', e.message);
    res.status(502).json({ success: false, message: 'No se pudo descargar el documento' });
  }
};

// GET /documentos — documentos visibles al portal del contacto.
exports.getDocumentos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT d.DOC_ID as id, d.DOC_NOMBRE_ORIGINAL as nombreOriginal, d.DOC_MIME_TYPE as mimeType,
             d.DOC_TAMANO_BYTES as tamanoBytes, d.DOC_FECHA_SUBIDA as fechaSubida, d.DOC_DESCRIPCION as descripcion,
             -- Enviado por alguien del portal de esta empresa (vs. publicado por su asesor).
             CASE WHEN EXISTS (SELECT 1 FROM PORTAL_USUARIOS pu WHERE pu.PU_NEUS_ID = d.DOC_SUBIDO_POR AND pu.PU_CONT_ID = @id)
                  THEN 1 ELSE 0 END as subidoPorCliente,
             u.NEUS_NOMBRES as subidoPorNombre
      FROM CRM_DOCUMENTOS_CLIENTE d
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = d.DOC_SUBIDO_POR
      WHERE d.DOC_CONTACTO_ID=@id AND d.DOC_VISIBLE_PORTAL=1 AND d.DOC_ACTIVO=1
      ORDER BY d.DOC_FECHA_SUBIDA DESC
    `);
    res.json({ success: true, data: rs.recordset.map((r) => ({ ...r, subidoPorCliente: !!r.subidoPorCliente })) });
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
