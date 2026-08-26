const sql = require('mssql');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

const TIPOS = ['laptop', 'cpu', 'monitor', 'teclado', 'mouse'];
const ESTADOS = ['disponible', 'asignado', 'reparacion', 'baja'];

exports.getActivos = async (req, res) => {
  try {
    const { tipo, estado, asignadoA, activo } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();

    const condiciones = [];
    if (tipo) {
      request.input('tipo', sql.NVarChar, tipo);
      condiciones.push('a.ACT_TIPO = @tipo');
    }
    if (estado) {
      request.input('estado', sql.NVarChar, estado);
      condiciones.push('a.ACT_ESTADO = @estado');
    }
    if (asignadoA) {
      request.input('asignadoA', sql.Int, asignadoA);
      condiciones.push('a.ACT_ASIGNADO_A = @asignadoA');
    }
    condiciones.push(activo === 'false' ? 'a.ACT_ACTIVO = 0' : 'a.ACT_ACTIVO = 1');

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const result = await request.query(`
      SELECT
        a.ACT_ID as id, a.ACT_TIPO as tipo, a.ACT_MARCA as marca, a.ACT_MODELO as modelo,
        a.ACT_NUMERO_SERIE as numeroSerie, a.ACT_ESTADO as estado,
        a.ACT_ASIGNADO_A as asignadoA, nu.NEUS_NOMBRES as asignadoNombre,
        a.ACT_FECHA_ASIGNACION as fechaAsignacion, a.ACT_ACTIVO as activo,
        a.ACT_FECHA_REGISTRO as fechaRegistro,
        a.ACT_TERMINOS_ACEPTADOS as terminosAceptados,
        a.ACT_FECHA_ACEPTACION as fechaAceptacion
      FROM ACTIVOS a
      LEFT JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.ACT_ASIGNADO_A
      ${where}
      ORDER BY a.ACT_TIPO ASC, a.ACT_FECHA_REGISTRO DESC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando activos:', e);
    return res.status(500).json({ success: false, message: 'Error al listar activos' });
  }
};

exports.createActivo = async (req, res) => {
  try {
    const { tipo, marca, modelo, numeroSerie, estado, asignadoA } = req.body;

    if (!tipo || !TIPOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo inválido. Debe ser uno de: ${TIPOS.join(', ')}` });
    }
    const estadoVal = estado && ESTADOS.includes(estado) ? estado : 'disponible';

    const pool = await databaseService.getPool(req.user?.empresa);
    const asignadoAInt = asignadoA ? parseInt(asignadoA) : null;

    // Si se crea ya asignado, el usuario debe aceptar los términos de uso del equipo.
    const result = await pool.request()
      .input('tipo', sql.NVarChar, tipo)
      .input('marca', sql.NVarChar, marca || null)
      .input('modelo', sql.NVarChar, modelo || null)
      .input('numeroSerie', sql.NVarChar, numeroSerie || null)
      .input('estado', sql.NVarChar, asignadoAInt ? 'asignado' : estadoVal)
      .input('asignadoA', sql.Int, asignadoAInt)
      .input('fechaAsignacion', sql.DateTime, asignadoAInt ? new Date() : null)
      .input('terminosAceptados', sql.Bit, asignadoAInt ? 0 : 1)
      .query(`
        INSERT INTO ACTIVOS (ACT_TIPO, ACT_MARCA, ACT_MODELO, ACT_NUMERO_SERIE, ACT_ESTADO, ACT_ASIGNADO_A, ACT_FECHA_ASIGNACION, ACT_TERMINOS_ACEPTADOS)
        OUTPUT INSERTED.ACT_ID as id
        VALUES (@tipo, @marca, @modelo, @numeroSerie, @estado, @asignadoA, @fechaAsignacion, @terminosAceptados);
      `);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'activos', accion:'crear', entidadId: String(result.recordset[0].id||''), detalle:{ tipo, marca, modelo }, ip:req.ip });
    return res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (e) {
    console.error('Error creando activo:', e);
    return res.status(500).json({ success: false, message: 'Error al crear el activo' });
  }
};

exports.updateActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, marca, modelo, numeroSerie, estado, asignadoA } = req.body;

    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo inválido. Debe ser uno de: ${TIPOS.join(', ')}` });
    }
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ success: false, message: `Estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existe = await pool.request().input('id', sql.Int, id).query('SELECT ACT_ASIGNADO_A FROM ACTIVOS WHERE ACT_ID = @id');
    if (existe.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Activo no encontrado' });
    }

    const asignadoAProvided = asignadoA !== undefined;
    const asignadoAInt = asignadoAProvided ? (asignadoA ? parseInt(asignadoA) : null) : null;
    const cambioAsignacion = asignadoAProvided && asignadoAInt !== existe.recordset[0].ACT_ASIGNADO_A;

    // Si se está (re)asignando o desasignando, ajustar estado y fecha automáticamente
    // salvo que el request ya traiga un estado explícito. Un cambio de asignación
    // siempre reinicia la aceptación de términos: el nuevo dueño debe aceptarlos de nuevo.
    let estadoFinal = estado || null;
    let fechaAsignacion = null;
    let fechaAsignacionProvided = false;
    let terminosAceptados = null;
    let terminosAceptadosProvided = false;
    if (cambioAsignacion) {
      fechaAsignacionProvided = true;
      fechaAsignacion = asignadoAInt ? new Date() : null;
      if (!estado) estadoFinal = asignadoAInt ? 'asignado' : 'disponible';
      terminosAceptadosProvided = true;
      terminosAceptados = asignadoAInt ? 0 : 1;
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('tipo', sql.NVarChar, tipo || null)
      .input('marca', sql.NVarChar, marca !== undefined ? marca : null)
      .input('marcaProvided', sql.Bit, marca !== undefined ? 1 : 0)
      .input('modelo', sql.NVarChar, modelo !== undefined ? modelo : null)
      .input('modeloProvided', sql.Bit, modelo !== undefined ? 1 : 0)
      .input('numeroSerie', sql.NVarChar, numeroSerie !== undefined ? numeroSerie : null)
      .input('numeroSerieProvided', sql.Bit, numeroSerie !== undefined ? 1 : 0)
      .input('estado', sql.NVarChar, estadoFinal)
      .input('asignadoA', sql.Int, asignadoAInt)
      .input('asignadoAProvided', sql.Bit, asignadoAProvided ? 1 : 0)
      .input('fechaAsignacion', sql.DateTime, fechaAsignacion)
      .input('fechaAsignacionProvided', sql.Bit, fechaAsignacionProvided ? 1 : 0)
      .input('terminosAceptados', sql.Bit, terminosAceptados)
      .input('terminosAceptadosProvided', sql.Bit, terminosAceptadosProvided ? 1 : 0)
      .query(`
        UPDATE ACTIVOS SET
          ACT_TIPO = COALESCE(@tipo, ACT_TIPO),
          ACT_MARCA = CASE WHEN @marcaProvided = 1 THEN @marca ELSE ACT_MARCA END,
          ACT_MODELO = CASE WHEN @modeloProvided = 1 THEN @modelo ELSE ACT_MODELO END,
          ACT_NUMERO_SERIE = CASE WHEN @numeroSerieProvided = 1 THEN @numeroSerie ELSE ACT_NUMERO_SERIE END,
          ACT_ESTADO = COALESCE(@estado, ACT_ESTADO),
          ACT_ASIGNADO_A = CASE WHEN @asignadoAProvided = 1 THEN @asignadoA ELSE ACT_ASIGNADO_A END,
          ACT_FECHA_ASIGNACION = CASE WHEN @fechaAsignacionProvided = 1 THEN @fechaAsignacion ELSE ACT_FECHA_ASIGNACION END,
          ACT_TERMINOS_ACEPTADOS = CASE WHEN @terminosAceptadosProvided = 1 THEN @terminosAceptados ELSE ACT_TERMINOS_ACEPTADOS END
        WHERE ACT_ID = @id
      `);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'activos', accion:'editar', entidadId: req.params.id, detalle:{ tipo, marca, modelo }, ip:req.ip });
    return res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando activo:', e);
    return res.status(500).json({ success: false, message: 'Error al actualizar el activo' });
  }
};

// DELETE /api/activos/:id?definitivo=1 — por defecto soft-delete (ACT_ACTIVO=0)
exports.deleteActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const definitivo = req.query.definitivo === '1' || req.query.definitivo === 'true';
    const pool = await databaseService.getPool(req.user?.empresa);

    const existe = await pool.request().input('id', sql.Int, id).query('SELECT ACT_ID FROM ACTIVOS WHERE ACT_ID = @id');
    if (existe.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Activo no encontrado' });
    }

    if (definitivo) {
      await pool.request().input('id', sql.Int, id).query('DELETE FROM ACTIVOS WHERE ACT_ID = @id');
    } else {
      await pool.request().input('id', sql.Int, id).query('UPDATE ACTIVOS SET ACT_ACTIVO = 0 WHERE ACT_ID = @id');
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'activos', accion:'eliminar', entidadId: req.params.id, detalle:null, ip:req.ip });
    return res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando activo:', e);
    return res.status(500).json({ success: false, message: 'Error al eliminar el activo' });
  }
};

// GET /api/activos/pendiente — activo asignado al usuario autenticado con términos aún no
// aceptados. Es lo que dispara el modal bloqueante al iniciar sesión (no requiere rol AD/TI).
exports.getActivoPendiente = async (req, res) => {
  try {
    const neusId = req.user?.id;
    if (!neusId) return res.status(400).json({ success: false, message: 'Falta el usuario' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('neusId', sql.Int, neusId)
      .query(`
        SELECT TOP 1 ACT_ID as id, ACT_TIPO as tipo, ACT_MARCA as marca, ACT_MODELO as modelo,
          ACT_NUMERO_SERIE as numeroSerie, ACT_FECHA_ASIGNACION as fechaAsignacion
        FROM ACTIVOS
        WHERE ACT_ASIGNADO_A = @neusId AND ACT_TERMINOS_ACEPTADOS = 0 AND ACT_ACTIVO = 1
        ORDER BY ACT_FECHA_ASIGNACION ASC
      `);

    return res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    console.error('Error consultando activo pendiente:', e);
    return res.status(500).json({ success: false, message: 'Error al consultar el activo pendiente' });
  }
};

// GET /api/activos/:id/carta-responsiva — genera y descarga PDF de carta responsiva
exports.getCartaResponsiva = async (req, res) => {
  try {
    const { id } = req.params;
    const neusId = req.user?.id;
    const isAdmin = req.user?.tipoUsuario === 'AD' || req.user?.tipoUsuario === 'TI';
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT a.ACT_ID as id, a.ACT_TIPO as tipo, a.ACT_MARCA as marca, a.ACT_MODELO as modelo,
               a.ACT_NUMERO_SERIE as numeroSerie, a.ACT_ESTADO as estado,
               a.ACT_ASIGNADO_A as asignadoA, a.ACT_FECHA_ASIGNACION as fechaAsignacion,
               a.ACT_TERMINOS_ACEPTADOS as terminosAceptados, a.ACT_FECHA_ACEPTACION as fechaAceptacion,
               nu.NEUS_NOMBRES as empleadoNombre, nu.NEUS_TIPOUSUARIO as empleadoTipo,
               nu.NEUS_USUARIO as empleadoUsuario
        FROM ACTIVOS a
        LEFT JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = a.ACT_ASIGNADO_A
        WHERE a.ACT_ID = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Activo no encontrado' });
    }

    const a = result.recordset[0];
    if (!isAdmin && a.asignadoA !== neusId) {
      return res.status(403).json({ success: false, message: 'Sin permiso para ver esta carta responsiva' });
    }

    const TIPO_LABEL = { laptop: 'Laptop', cpu: 'CPU/Computadora de escritorio', monitor: 'Monitor', teclado: 'Teclado', mouse: 'Mouse' };
    const tipoLabel = TIPO_LABEL[a.tipo] ?? a.tipo;
    const equipo = [a.marca, a.modelo].filter(Boolean).join(' ') || tipoLabel;
    const fechaAcep = a.fechaAceptacion ? new Date(a.fechaAceptacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Pendiente';
    const fechaAsig = a.fechaAsignacion ? new Date(a.fechaAsignacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha';
    const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    const doc = new PDFDocument({ size: 'letter', margin: 72 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    await new Promise((resolve) => {
      doc.on('end', resolve);

      // Encabezado
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1B4FD8')
         .text('CARTA RESPONSIVA DE EQUIPO DE CÓMPUTO', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#6B7280')
         .text('Ardabytec · Recursos Humanos / TI', { align: 'center' });
      doc.moveDown(1.5);

      // Línea divisora
      doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#E5E7EB').lineWidth(1).stroke();
      doc.moveDown(1);

      // Cuerpo
      doc.fontSize(11).font('Helvetica').fillColor('#111827');
      doc.text(`Fecha de emisión: `, { continued: true }).font('Helvetica-Bold').text(hoy);
      doc.moveDown(1.2);

      doc.font('Helvetica').fontSize(11)
         .text('Por medio del presente documento, yo:');
      doc.moveDown(0.8);

      // Datos del empleado
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
         .text(a.empleadoNombre ?? 'Sin nombre', { indent: 20 });
      doc.font('Helvetica').fontSize(10).fillColor('#6B7280')
         .text(`Usuario: @${a.empleadoUsuario ?? '—'}`, { indent: 20 });
      doc.moveDown(1.2);

      doc.font('Helvetica').fontSize(11).fillColor('#111827')
         .text('Declaro haber recibido en calidad de resguardo el siguiente equipo:');
      doc.moveDown(1);

      // Cuadro del equipo
      const boxTop = doc.y;
      doc.rect(72, boxTop, 468, 90).fillColor('#F9FAFB').fill();
      doc.rect(72, boxTop, 468, 90).strokeColor('#E5E7EB').lineWidth(1).stroke();
      doc.fillColor('#111827');

      const col1 = 90;
      const col2 = 250;
      let row = boxTop + 14;

      doc.font('Helvetica-Bold').fontSize(10).text('Tipo de equipo:', col1, row);
      doc.font('Helvetica').text(tipoLabel, col2, row);
      row += 18;
      doc.font('Helvetica-Bold').fontSize(10).text('Marca y modelo:', col1, row);
      doc.font('Helvetica').text(equipo, col2, row);
      row += 18;
      doc.font('Helvetica-Bold').fontSize(10).text('Número de serie:', col1, row);
      doc.font('Helvetica').text(a.numeroSerie || 'Sin número de serie', col2, row);
      row += 18;
      doc.font('Helvetica-Bold').fontSize(10).text('Fecha de asignación:', col1, row);
      doc.font('Helvetica').text(fechaAsig, col2, row);

      doc.moveDown(0.5);
      doc.y = boxTop + 100;
      doc.moveDown(1.2);

      // Condiciones
      doc.font('Helvetica').fontSize(11).fillColor('#111827')
         .text('Me comprometo a:');
      doc.moveDown(0.5);
      const compromisos = [
        'Utilizar el equipo exclusivamente para actividades laborales relacionadas con mi puesto.',
        'Mantener el equipo en buen estado y reportar cualquier daño o desperfecto de inmediato al área de TI.',
        'No instalar software no autorizado ni modificar la configuración del equipo sin aprobación.',
        'Devolver el equipo en las mismas condiciones en que fue entregado al término de mi relación laboral o cuando sea requerido.',
        'Asumir la responsabilidad económica por pérdida o daño causado por negligencia.',
      ];
      compromisos.forEach((c, i) => {
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
           .text(`${i + 1}. ${c}`, { indent: 10, width: 448 });
        doc.moveDown(0.4);
      });

      doc.moveDown(1);

      // Aceptación
      if (a.terminosAceptados) {
        doc.rect(72, doc.y, 468, 28).fillColor('#ECFDF5').fill();
        doc.rect(72, doc.y - 0, 468, 28).strokeColor('#6EE7B7').stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#065F46')
           .text(`✓  Términos aceptados digitalmente el ${fechaAcep}`, 82, doc.y + 9);
        doc.moveDown(0.5);
        doc.y += 18;
      }

      doc.moveDown(2.5);

      // Firmas
      const yFirma = doc.y;
      const leftX = 90;
      const rightX = 340;

      doc.moveTo(leftX, yFirma).lineTo(leftX + 160, yFirma).strokeColor('#9CA3AF').lineWidth(0.8).stroke();
      doc.moveTo(rightX, yFirma).lineTo(rightX + 160, yFirma).strokeColor('#9CA3AF').stroke();

      doc.font('Helvetica').fontSize(9).fillColor('#6B7280')
         .text('Firma del colaborador', leftX, yFirma + 5, { width: 160, align: 'center' });
      doc.text('Firma del responsable de TI', rightX, yFirma + 5, { width: 160, align: 'center' });

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151')
         .text(a.empleadoNombre ?? '', leftX, yFirma + 18, { width: 160, align: 'center' });

      doc.moveDown(3);
      doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF')
         .text('Documento generado por el sistema de intranet — Ardabytec', { align: 'center' });

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const filename = `carta_responsiva_${(a.empleadoNombre ?? 'empleado').replace(/\s+/g, '_')}_${id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (e) {
    console.error('Error generando carta responsiva:', e);
    return res.status(500).json({ success: false, message: 'Error al generar la carta responsiva' });
  }
};

// POST /api/activos/:id/aceptar-terminos — el propio empleado acepta los términos de uso
exports.aceptarTerminos = async (req, res) => {
  try {
    const { id } = req.params;
    const neusId = req.user?.id;
    const pool = await databaseService.getPool(req.user?.empresa);

    const activo = await pool.request().input('id', sql.Int, id).query('SELECT ACT_ASIGNADO_A FROM ACTIVOS WHERE ACT_ID = @id');
    if (activo.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Activo no encontrado' });
    }
    if (activo.recordset[0].ACT_ASIGNADO_A !== neusId) {
      return res.status(403).json({ success: false, message: 'No puedes aceptar los términos de un equipo que no tienes asignado' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE ACTIVOS SET ACT_TERMINOS_ACEPTADOS = 1, ACT_FECHA_ACEPTACION = GETDATE() WHERE ACT_ID = @id`);

    return res.json({ success: true });
  } catch (e) {
    console.error('Error aceptando términos de activo:', e);
    return res.status(500).json({ success: false, message: 'Error al aceptar los términos' });
  }
};
