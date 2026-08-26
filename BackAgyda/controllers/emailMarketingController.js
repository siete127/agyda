const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailMarketingService = require('../services/emailMarketingService');

const SELECT_PLANTILLA = `
  SELECT
    EPL_ID as id, EPL_NOMBRE as nombre, EPL_ASUNTO as asunto,
    EPL_CUERPO_HTML as cuerpoHtml, EPL_CUERPO_TEXTO as cuerpoTexto,
    EPL_VARIABLES as variables, EPL_ACTIVO as activo, EPL_FECHA as fecha
  FROM dbo.EMAIL_PLANTILLAS
`;

const SELECT_CAMPANIA = `
  SELECT
    eca.ECA_ID as id, eca.ECA_NOMBRE as nombre, eca.ECA_PLANTILLA_ID as plantillaId,
    epl.EPL_NOMBRE as plantillaNombre,
    eca.ECA_ESTADO as estado, eca.ECA_FILTRO as filtro, eca.ECA_FILTRO_TAG as filtroTag,
    eca.ECA_CONTACTOS_IDS as contactosIds, eca.ECA_EMAILS_POR_HORA as emailsPorHora,
    eca.ECA_FECHA_PROGRAMADA as fechaProgramada, eca.ECA_FECHA_INICIO as fechaInicio,
    eca.ECA_FECHA_FIN as fechaFin, eca.ECA_FECHA_CREACION as fechaCreacion
  FROM dbo.EMAIL_CAMPANIAS eca
  JOIN dbo.EMAIL_PLANTILLAS epl ON epl.EPL_ID = eca.ECA_PLANTILLA_ID
`;

function extraerVariables(html, asunto) {
  const texto = `${asunto || ''} ${html || ''}`;
  const encontradas = new Set();
  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  let m;
  while ((m = regex.exec(texto))) encontradas.add(m[1]);
  return JSON.stringify([...encontradas]);
}

/* ════════════════════════════════════════════════════════
   PLANTILLAS
════════════════════════════════════════════════════════ */

exports.getPlantillas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`${SELECT_PLANTILLA} WHERE EPL_ACTIVO = 1 ORDER BY EPL_FECHA DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo plantillas de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPlantilla = async (req, res) => {
  try {
    const { nombre, asunto, cuerpoHtml, cuerpoTexto } = req.body;
    if (!nombre || !asunto || !cuerpoHtml) {
      return res.status(400).json({ success: false, message: 'Nombre, asunto y cuerpo HTML son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const insert = await pool.request()
      .input('nombre', sql.NVarChar(255), nombre.trim().slice(0, 255))
      .input('asunto', sql.NVarChar(300), asunto.trim().slice(0, 300))
      .input('html', sql.NVarChar(sql.MAX), cuerpoHtml)
      .input('texto', sql.NVarChar(sql.MAX), cuerpoTexto || null)
      .input('variables', sql.NVarChar(500), extraerVariables(cuerpoHtml, asunto))
      .input('creadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO dbo.EMAIL_PLANTILLAS (EPL_NOMBRE, EPL_ASUNTO, EPL_CUERPO_HTML, EPL_CUERPO_TEXTO, EPL_VARIABLES, EPL_CREADO_POR)
        OUTPUT INSERTED.EPL_ID as id
        VALUES (@nombre, @asunto, @html, @texto, @variables, @creadoPor)
      `);

    const plantilla = await pool.request().input('id', sql.Int, insert.recordset[0].id).query(`${SELECT_PLANTILLA} WHERE EPL_ID = @id`);
    res.status(201).json({ success: true, data: plantilla.recordset[0] });
  } catch (error) {
    console.error('Error creando plantilla de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, asunto, cuerpoHtml, cuerpoTexto, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const existente = await pool.request().input('id', sql.Int, id).query(`${SELECT_PLANTILLA} WHERE EPL_ID = @id`);
    if (existente.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }
    const actual = existente.recordset[0];

    const nuevoHtml = cuerpoHtml ?? actual.cuerpoHtml;
    const nuevoAsunto = asunto ?? actual.asunto;

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(255), (nombre ?? actual.nombre).slice(0, 255))
      .input('asunto', sql.NVarChar(300), nuevoAsunto.slice(0, 300))
      .input('html', sql.NVarChar(sql.MAX), nuevoHtml)
      .input('texto', sql.NVarChar(sql.MAX), cuerpoTexto !== undefined ? cuerpoTexto : actual.cuerpoTexto)
      .input('variables', sql.NVarChar(500), extraerVariables(nuevoHtml, nuevoAsunto))
      .input('activo', sql.Bit, activo !== undefined ? !!activo : actual.activo)
      .query(`
        UPDATE dbo.EMAIL_PLANTILLAS
        SET EPL_NOMBRE = @nombre, EPL_ASUNTO = @asunto, EPL_CUERPO_HTML = @html,
            EPL_CUERPO_TEXTO = @texto, EPL_VARIABLES = @variables, EPL_ACTIVO = @activo
        WHERE EPL_ID = @id
      `);

    const actualizada = await pool.request().input('id', sql.Int, id).query(`${SELECT_PLANTILLA} WHERE EPL_ID = @id`);
    res.json({ success: true, data: actualizada.recordset[0] });
  } catch (error) {
    console.error('Error actualizando plantilla de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// No se borra físicamente — puede tener campañas históricas vinculadas por FK.
exports.deletePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request().input('id', sql.Int, id)
      .query(`UPDATE dbo.EMAIL_PLANTILLAS SET EPL_ACTIVO = 0 OUTPUT INSERTED.EPL_ID WHERE EPL_ID = @id`);
    if (upd.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }
    res.json({ success: true, message: 'Plantilla desactivada' });
  } catch (error) {
    console.error('Error desactivando plantilla de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.previewPlantilla = async (req, res) => {
  try {
    const { cuerpoHtml, asunto } = req.body;
    const muestra = { id: 0, nombre: 'Juan Pérez', empresa: 'Empresa de Ejemplo S.A.', correo: 'juan@ejemplo.com' };
    const reemplazar = (str) => String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => muestra[k] ?? '');
    res.json({ success: true, data: { asunto: reemplazar(asunto), html: reemplazar(cuerpoHtml) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════
   CAMPAÑAS
════════════════════════════════════════════════════════ */

exports.getCampanias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`${SELECT_CAMPANIA} ORDER BY eca.ECA_FECHA_CREACION DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo campañas de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCampania = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id).query(`${SELECT_CAMPANIA} WHERE eca.ECA_ID = @id`);
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error obteniendo campaña de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCampania = async (req, res) => {
  try {
    const { nombre, plantillaId, filtro, filtroTag, contactosIds, emailsPorHora } = req.body;
    if (!nombre || !plantillaId) {
      return res.status(400).json({ success: false, message: 'Nombre y plantilla son requeridos' });
    }
    const filtroVal = ['todos', 'tag', 'manual'].includes(filtro) ? filtro : 'todos';
    if (filtroVal === 'tag' && !filtroTag) {
      return res.status(400).json({ success: false, message: 'Falta el tag para el filtro por tag' });
    }
    if (filtroVal === 'manual' && (!Array.isArray(contactosIds) || contactosIds.length === 0)) {
      return res.status(400).json({ success: false, message: 'Falta la lista de contactos para el filtro manual' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const insert = await pool.request()
      .input('nombre', sql.NVarChar(200), nombre.trim().slice(0, 200))
      .input('plantillaId', sql.Int, plantillaId)
      .input('filtro', sql.NVarChar(20), filtroVal)
      .input('filtroTag', sql.NVarChar(100), filtroTag || null)
      .input('contactosIds', sql.NVarChar(sql.MAX), filtroVal === 'manual' ? JSON.stringify(contactosIds.map(Number)) : null)
      .input('emailsPorHora', sql.Int, Number.isFinite(emailsPorHora) && emailsPorHora > 0 ? emailsPorHora : 200)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO dbo.EMAIL_CAMPANIAS (ECA_NOMBRE, ECA_PLANTILLA_ID, ECA_FILTRO, ECA_FILTRO_TAG, ECA_CONTACTOS_IDS, ECA_EMAILS_POR_HORA, ECA_CREADO_POR)
        OUTPUT INSERTED.ECA_ID as id
        VALUES (@nombre, @plantillaId, @filtro, @filtroTag, @contactosIds, @emailsPorHora, @creadoPor)
      `);

    const campania = await pool.request().input('id', sql.Int, insert.recordset[0].id).query(`${SELECT_CAMPANIA} WHERE eca.ECA_ID = @id`);
    res.status(201).json({ success: true, data: campania.recordset[0] });
  } catch (error) {
    console.error('Error creando campaña de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Cuenta en vivo cuántos contactos recibirían la campaña con el filtro dado,
// sin crear nada — lo usa el frontend al armar el formulario ("le llegará a N contactos").
exports.contarDestinatarios = async (req, res) => {
  try {
    const { filtro, filtroTag, contactosIds } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const destinatarios = await emailMarketingService.resolverDestinatarios(pool, {
      filtro: ['todos', 'tag', 'manual'].includes(filtro) ? filtro : 'todos',
      filtroTag,
      contactosIds: JSON.stringify(contactosIds || []),
    });
    res.json({ success: true, data: { total: destinatarios.length } });
  } catch (error) {
    console.error('Error contando destinatarios:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.iniciarCampania = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rEstado = await pool.request().input('id', sql.Int, id).query(`SELECT ECA_ESTADO as estado FROM dbo.EMAIL_CAMPANIAS WHERE ECA_ID = @id`);
    if (rEstado.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    }
    if (!['borrador', 'programada'].includes(rEstado.recordset[0].estado)) {
      return res.status(409).json({ success: false, message: `No se puede iniciar una campaña en estado "${rEstado.recordset[0].estado}"` });
    }

    const { destinatarios } = await emailMarketingService.iniciarEnvio(id, req.user?.empresa);
    res.json({ success: true, message: `Envío iniciado a ${destinatarios} contacto(s)`, data: { destinatarios } });
  } catch (error) {
    console.error('Error iniciando campaña de email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.pausarCampania = async (req, res) => {
  try {
    await emailMarketingService.pausarEnvio(req.params.id, req.user?.empresa);
    res.json({ success: true, message: 'Campaña pausada — los envíos pendientes se detendrán en el siguiente minuto' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reanudarCampania = async (req, res) => {
  try {
    await emailMarketingService.reanudarEnvio(req.params.id, req.user?.empresa);
    res.json({ success: true, message: 'Campaña reanudada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelarCampania = async (req, res) => {
  try {
    await emailMarketingService.cancelarEnvio(req.params.id, req.user?.empresa);
    res.json({ success: true, message: 'Campaña cancelada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEnvios = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request().input('id', sql.Int, id);
    let where = 'EEN_CAMPANIA_ID = @id';
    if (estado) {
      request.input('estado', sql.NVarChar(20), estado);
      where += ' AND EEN_ESTADO = @estado';
    }
    const result = await request.query(`
      SELECT EEN_ID as id, EEN_CORREO as correo, EEN_ESTADO as estado, EEN_INTENTOS as intentos,
             EEN_ERROR as error, EEN_FECHA_ENVIO as fechaEnvio
      FROM dbo.EMAIL_ENVIOS WHERE ${where}
      ORDER BY EEN_ID ASC
      OFFSET 0 ROWS FETCH NEXT 500 ROWS ONLY
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo envíos de campaña:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReporte = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT EEN_ESTADO as estado, COUNT(*) as total
      FROM dbo.EMAIL_ENVIOS WHERE EEN_CAMPANIA_ID = @id
      GROUP BY EEN_ESTADO
    `);
    const conteos = { pendiente: 0, enviado: 0, fallido: 0, omitido_baja: 0 };
    result.recordset.forEach((r) => { conteos[r.estado] = r.total; });
    const totalDestinatarios = Object.values(conteos).reduce((a, b) => a + b, 0);
    res.json({ success: true, data: { ...conteos, total: totalDestinatarios } });
  } catch (error) {
    console.error('Error obteniendo reporte de campaña:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
