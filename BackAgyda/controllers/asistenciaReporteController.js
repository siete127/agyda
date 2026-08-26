const sql = require('mssql');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');

const RETARDOS_PARA_ACTA = 3;

// POST /api/asistencia/:asistenciaId/reporte — genera el reporte de un retardo (solo AD)
exports.crearReporte = async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const creadoPor = req.user?.id;
    const pool = await databaseService.getPool(req.user?.empresa);

    const entrada = await pool.request()
      .input('id', sql.Int, asistenciaId)
      .query(`SELECT ID, NEUS_ID, ES_RETARDO FROM ASISTENCIA_ENTRADAS WHERE ID = @id`);

    if (entrada.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro de asistencia no encontrado' });
    }
    if (!entrada.recordset[0].ES_RETARDO) {
      return res.status(400).json({ success: false, message: 'Este registro no tiene retardo' });
    }

    const existente = await pool.request()
      .input('asistenciaId', sql.Int, asistenciaId)
      .query(`SELECT ID, FECHA_CREACION FROM ASISTENCIA_REPORTES WHERE ASISTENCIA_ID = @asistenciaId`);

    if (existente.recordset.length > 0) {
      return res.status(200).json({
        success: true,
        data: { id: existente.recordset[0].ID, fechaCreacion: existente.recordset[0].FECHA_CREACION },
      });
    }

    const insert = await pool.request()
      .input('asistenciaId', sql.Int, asistenciaId)
      .input('neusId', sql.Int, entrada.recordset[0].NEUS_ID)
      .input('creadoPor', sql.Int, creadoPor)
      .query(`
        INSERT INTO ASISTENCIA_REPORTES (ASISTENCIA_ID, NEUS_ID, CREADO_POR)
        OUTPUT INSERTED.ID, INSERTED.FECHA_CREACION
        VALUES (@asistenciaId, @neusId, @creadoPor);
      `);

    return res.status(201).json({
      success: true,
      data: { id: insert.recordset[0].ID, fechaCreacion: insert.recordset[0].FECHA_CREACION },
    });
  } catch (e) {
    console.error('Error creando reporte de asistencia:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al generar el reporte' });
  }
};

// GET /api/asistencia/:asistenciaId/reporte — devuelve el reporte de ese registro si existe (solo AD)
exports.getReporte = async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('asistenciaId', sql.Int, asistenciaId)
      .query(`SELECT ID as id, FECHA_CREACION as fechaCreacion FROM ASISTENCIA_REPORTES WHERE ASISTENCIA_ID = @asistenciaId`);

    return res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    console.error('Error consultando reporte de asistencia:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al consultar el reporte' });
  }
};

// Parsea una fecha DATE de SQL (ej. "2026-07-16T00:00:00.000Z") sin desfase de zona horaria
function parseFechaSql(f) {
  const s = typeof f === 'string' ? f : (f instanceof Date ? f.toISOString() : String(f));
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function obtenerDatosReporte(pool, reporteId) {
  const result = await pool.request()
    .input('reporteId', sql.Int, reporteId)
    .query(`
      SELECT
        r.ID as id, r.FECHA_CREACION as fechaCreacion,
        nu.NEUS_NOMBRES as nombre, a.ROL as rol, a.FECHA as fecha,
        FORMAT(a.HORA_ENTRADA, 'HH:mm') as horaEntrada,
        FORMAT(a.HORA_ESPERADA, 'HH:mm') as horaEsperada,
        a.MINUTOS_RETARDO as minutosRetardo
      FROM ASISTENCIA_REPORTES r
      INNER JOIN ASISTENCIA_ENTRADAS a ON a.ID = r.ASISTENCIA_ID
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = r.NEUS_ID
      WHERE r.ID = @reporteId
    `);
  return result.recordset[0] ?? null;
}

const ROLES_LABEL = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', CL: 'Clientes' };

function generarPdfBuffer(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 60 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fechaGen = new Date(datos.fechaCreacion).toLocaleString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const fechaRetardo = parseFechaSql(datos.fecha).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    // ── Encabezado ──
    doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Retardo', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Generado el ${fechaGen}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── Datos del colaborador ──
    doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text('Colaborador');
    doc.font('Helvetica').text(datos.nombre);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').text('Área');
    doc.font('Helvetica').text(ROLES_LABEL[datos.rol] ?? datos.rol);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').text('Fecha del retardo');
    doc.font('Helvetica').text(fechaRetardo);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').text('Hora esperada / hora de entrada');
    doc.font('Helvetica').text(`${datos.horaEsperada} / ${datos.horaEntrada}  (${datos.minutosRetardo} min de retardo)`);
    doc.moveDown(1.5);

    // ── Observaciones ──
    doc.font('Helvetica-Bold').text('Observaciones');
    doc.font('Helvetica').text(
      'El colaborador registró entrada fuera del horario establecido para su área. ' +
      'Este documento queda como constancia del incidente para seguimiento por parte de Recursos Humanos.'
    );
    doc.moveDown(2.5);

    // ── Firmas ──
    const pageWidth = doc.page.width - 120; // margen izq + der
    const colW = pageWidth / 2;
    const y = doc.y;

    doc.moveTo(60, y).lineTo(60 + colW - 20, y).stroke();
    doc.moveTo(60 + colW + 20, y).lineTo(60 + pageWidth, y).stroke();
    doc.moveDown(0.4);

    doc.fontSize(9).font('Helvetica')
      .text('Firma del colaborador', 60, doc.y, { width: colW - 20, align: 'center' });
    doc.text('Firma de Recursos Humanos', 60 + colW + 20, doc.y - doc.currentLineHeight(), { width: colW - 20, align: 'center' });
    doc.moveDown(0.2);
    doc.fillColor('#666666')
      .text(datos.nombre, 60, doc.y, { width: colW - 20, align: 'center' });

    doc.end();
  });
}

// GET /api/asistencia/reporte/:id/pdf — genera y descarga el PDF del reporte (solo AD)
exports.descargarPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const datos = await obtenerDatosReporte(pool, id);

    if (!datos) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    const buffer = await generarPdfBuffer(datos);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="reporte_retardo_${id}.pdf"`);
    return res.send(buffer);
  } catch (e) {
    console.error('Error generando PDF de reporte de asistencia:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al generar el PDF' });
  }
};

/**
 * Se llama tras registrar un retardo (marcarEntrada). Si el usuario acumula
 * RETARDOS_PARA_ACTA o más retardos en el mes de `fechaEntrada` y todavía no
 * existe acta para ese (usuario, año, mes), genera el acta, notifica al
 * empleado y a todos los AD activos. Nunca debe tumbar el registro de entrada
 * si algo falla aquí — se captura y solo se registra en log.
 */
async function evaluarActaPorRetardos(pool, neusId, fechaEntrada, tenantKey) {
  try {
    const fecha = new Date(fechaEntrada);
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;

    const yaExiste = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('anio', sql.Int, anio)
      .input('mes', sql.Int, mes)
      .query(`SELECT ID FROM ASISTENCIA_ACTAS WHERE NEUS_ID = @neusId AND ANIO = @anio AND MES = @mes`);
    if (yaExiste.recordset.length > 0) return;

    const conteo = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('anio', sql.Int, anio)
      .input('mes', sql.Int, mes)
      .query(`
        SELECT COUNT(*) as total
        FROM ASISTENCIA_ENTRADAS
        WHERE NEUS_ID = @neusId AND ES_RETARDO = 1
          AND YEAR(FECHA) = @anio AND MONTH(FECHA) = @mes
      `);
    const totalRetardos = conteo.recordset[0].total;
    if (totalRetardos < RETARDOS_PARA_ACTA) return;

    const insert = await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('anio', sql.Int, anio)
      .input('mes', sql.Int, mes)
      .input('total', sql.Int, totalRetardos)
      .query(`
        INSERT INTO ASISTENCIA_ACTAS (NEUS_ID, ANIO, MES, TOTAL_RETARDOS)
        OUTPUT INSERTED.ID
        VALUES (@neusId, @anio, @mes, @total);
      `);
    const actaId = insert.recordset[0].ID;

    const usuario = await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId`);
    const nombre = usuario.recordset[0]?.NEUS_NOMBRES ?? `Usuario #${neusId}`;

    // Al empleado no se le notifica por campana: se le bloquea con un modal (igual que
    // "Registra tu entrada") la próxima vez que abra la app, hasta que lo reconozca.
    const ads = await pool.request()
      .query(`SELECT NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_TIPOUSUARIO = 'AD' AND NEUS_ACTIVO = 1`);
    const mensajeAd = `${nombre} acumuló ${totalRetardos} retardos este mes. Se generó un acta administrativa.`;
    for (const ad of ads.recordset) {
      await notificationService.createNotification({
        usuarioId: ad.NEUS_ID,
        tipo: 'acta_retardos',
        mensaje: mensajeAd,
        dataExtra: { actaId },
        tenantKey,
      });
    }
  } catch (e) {
    console.error('Error evaluando acta por retardos:', e?.message);
  }
}

async function obtenerDatosActa(pool, actaId) {
  const acta = await pool.request()
    .input('actaId', sql.Int, actaId)
    .query(`
      SELECT a.ID as id, a.NEUS_ID as neusId, a.ANIO as anio, a.MES as mes,
        a.TOTAL_RETARDOS as totalRetardos, a.FECHA_CREACION as fechaCreacion,
        a.RECONOCIDA as reconocida, a.FECHA_RECONOCIMIENTO as fechaReconocimiento,
        nu.NEUS_NOMBRES as nombre
      FROM ASISTENCIA_ACTAS a
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.NEUS_ID
      WHERE a.ID = @actaId
    `);
  if (acta.recordset.length === 0) return null;
  const datosActa = acta.recordset[0];

  const retardos = await pool.request()
    .input('neusId', sql.Int, datosActa.neusId)
    .input('anio', sql.Int, datosActa.anio)
    .input('mes', sql.Int, datosActa.mes)
    .query(`
      SELECT FORMAT(FECHA, 'yyyy-MM-dd') as fecha, FORMAT(HORA_ENTRADA, 'HH:mm') as horaEntrada,
        FORMAT(HORA_ESPERADA, 'HH:mm') as horaEsperada, MINUTOS_RETARDO as minutosRetardo
      FROM ASISTENCIA_ENTRADAS
      WHERE NEUS_ID = @neusId AND ES_RETARDO = 1
        AND YEAR(FECHA) = @anio AND MONTH(FECHA) = @mes
      ORDER BY FECHA ASC
    `);

  return { ...datosActa, retardos: retardos.recordset };
}

const MESES_LABEL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function generarActaPdfBuffer(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 60 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fechaGen = new Date(datos.fechaCreacion).toLocaleString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // ── Encabezado ──
    doc.fontSize(18).font('Helvetica-Bold').text('Acta Administrativa por Retardos', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Generada el ${fechaGen}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── Datos del colaborador ──
    doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text('Colaborador');
    doc.font('Helvetica').text(datos.nombre);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').text('Periodo');
    doc.font('Helvetica').text(`${MESES_LABEL[datos.mes - 1]} de ${datos.anio}`);
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').text('Total de retardos en el mes');
    doc.font('Helvetica').text(String(datos.totalRetardos));
    doc.moveDown(1);

    // ── Detalle de retardos ──
    doc.font('Helvetica-Bold').text('Detalle de retardos');
    doc.moveDown(0.3);
    datos.retardos.forEach((r, i) => {
      const fechaR = parseFechaSql(r.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.font('Helvetica').text(
        `${i + 1}. ${fechaR} — entrada ${r.horaEntrada} (esperada ${r.horaEsperada}), ${r.minutosRetardo} min de retardo`
      );
    });
    doc.moveDown(1.5);

    // ── Observaciones ──
    doc.font('Helvetica-Bold').text('Observaciones');
    doc.font('Helvetica').text(
      `El colaborador acumuló ${datos.totalRetardos} retardos durante el mes de ` +
      `${MESES_LABEL[datos.mes - 1]} de ${datos.anio}, superando el límite permitido por el reglamento interno. ` +
      'Esta acta queda como constancia formal del incidente y deberá ser reconocida por el colaborador.'
    );
    doc.moveDown(0.8);

    // ── Fecha de reconocimiento (si ya fue firmada) ──
    if (datos.reconocida && datos.fechaReconocimiento) {
      const fechaRec = new Date(datos.fechaReconocimiento).toLocaleString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      doc.fillColor('#1a7a3a').font('Helvetica-Bold').text('Reconocida por el colaborador');
      doc.font('Helvetica').text(fechaRec);
      doc.fillColor('#000000');
      doc.moveDown(1.5);
    } else {
      doc.moveDown(1);
    }

    // ── Firmas ──
    const pageWidth = doc.page.width - 120;
    const colW = pageWidth / 2;
    const y = doc.y;

    doc.moveTo(60, y).lineTo(60 + colW - 20, y).stroke();
    doc.moveTo(60 + colW + 20, y).lineTo(60 + pageWidth, y).stroke();
    doc.moveDown(0.4);

    doc.fontSize(9).font('Helvetica')
      .text('Firma del colaborador', 60, doc.y, { width: colW - 20, align: 'center' });
    doc.text('Firma de Recursos Humanos', 60 + colW + 20, doc.y - doc.currentLineHeight(), { width: colW - 20, align: 'center' });
    doc.moveDown(0.2);
    doc.fillColor('#666666')
      .text(datos.nombre, 60, doc.y, { width: colW - 20, align: 'center' });

    doc.end();
  });
}

// GET /api/asistencia/acta/:id/pdf — genera y descarga el PDF del acta administrativa (solo AD)
exports.descargarActaPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const datos = await obtenerDatosActa(pool, id);

    if (!datos) {
      return res.status(404).json({ success: false, message: 'Acta no encontrada' });
    }

    const buffer = await generarActaPdfBuffer(datos);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="acta_retardos_${id}.pdf"`);
    return res.send(buffer);
  } catch (e) {
    console.error('Error generando PDF de acta de asistencia:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al generar el PDF del acta' });
  }
};

// GET /api/asistencia/actas?neusId= — lista las actas generadas (solo AD)
exports.listarActas = async (req, res) => {
  try {
    const { neusId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    let where = '';
    if (neusId) {
      request.input('neusId', sql.Int, neusId);
      where = 'WHERE a.NEUS_ID = @neusId';
    }
    const result = await request.query(`
      SELECT a.ID as id, a.NEUS_ID as usuarioId, nu.NEUS_NOMBRES as nombre,
        a.ANIO as anio, a.MES as mes, a.TOTAL_RETARDOS as totalRetardos, a.FECHA_CREACION as fechaCreacion,
        a.RECONOCIDA as reconocida
      FROM ASISTENCIA_ACTAS a
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.NEUS_ID
      ${where}
      ORDER BY a.FECHA_CREACION DESC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando actas de asistencia:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al listar actas' });
  }
};

exports.evaluarActaPorRetardos = evaluarActaPorRetardos;

// GET /api/asistencia/acta/pendiente — acta del usuario autenticado aún no reconocida, o null.
// La consulta el propio empleado (no requiere rol AD): es lo que bloquea el modal al iniciar sesión.
exports.getActaPendiente = async (req, res) => {
  try {
    const neusId = req.user?.id;
    if (!neusId) return res.status(400).json({ success: false, message: 'Falta el usuario' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`
        SELECT TOP 1 ID as id, ANIO as anio, MES as mes, TOTAL_RETARDOS as totalRetardos, FECHA_CREACION as fechaCreacion
        FROM ASISTENCIA_ACTAS
        WHERE NEUS_ID = @neusId AND RECONOCIDA = 0
        ORDER BY FECHA_CREACION ASC
      `);

    return res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    console.error('Error consultando acta pendiente:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al consultar el acta pendiente' });
  }
};

// POST /api/asistencia/acta/:id/reconocer — el propio empleado acepta el acta (cierra el modal bloqueante)
exports.reconocerActa = async (req, res) => {
  try {
    const { id } = req.params;
    const neusId = req.user?.id;
    const pool = await databaseService.getPool(req.user?.empresa);

    const acta = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT NEUS_ID FROM ASISTENCIA_ACTAS WHERE ID = @id`);

    if (acta.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Acta no encontrada' });
    }
    if (acta.recordset[0].NEUS_ID !== neusId) {
      return res.status(403).json({ success: false, message: 'No puedes reconocer un acta de otro usuario' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE ASISTENCIA_ACTAS SET RECONOCIDA = 1, FECHA_RECONOCIMIENTO = GETDATE() WHERE ID = @id`);

    return res.json({ success: true });
  } catch (e) {
    console.error('Error reconociendo acta:', e?.message);
    return res.status(500).json({ success: false, message: 'Error al reconocer el acta' });
  }
};
