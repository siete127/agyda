const sql = require('mssql');
const databaseService = require('../services/databaseService');

const GIROS = {
  tecnologia: 'Tecnología / IT',
  comercio: 'Comercio / Retail',
  manufactura: 'Manufactura',
  servicios: 'Servicios Profesionales',
  otro: 'Otro',
};

const REQUERIMIENTOS = {
  soporte: 'Soporte Técnico',
  infraestructura: 'Infraestructura IT',
  ciberseguridad: 'Ciberseguridad',
  desarrollo: 'Desarrollo de Software',
  consultoria: 'Consultoría IT',
};

const COMO_SE_ENTERO = {
  redes: 'Redes Sociales',
  recomendacion: 'Recomendación',
  busqueda: 'Búsqueda en Google',
  aliado: 'A través de un Aliado',
};

exports.recibirLeadMarketing = async (req, res) => {
  try {
    const {
      nombreCompleto, puesto, empresa, giroEmpresa,
      email, telefono, tipoRequerimiento, mensaje,
      comoSeEntero, ubicacion,
    } = req.body || {};

    if (!nombreCompleto || (!email && !telefono)) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y al menos un contacto (email o teléfono) son requeridos.' });
    }

    const giroLabel     = GIROS[giroEmpresa]           || giroEmpresa           || '';
    const requeLabel    = REQUERIMIENTOS[tipoRequerimiento] || tipoRequerimiento || '';
    const comoLabel     = COMO_SE_ENTERO[comoSeEntero] || comoSeEntero         || '';

    const notasContacto = [
      giroLabel    ? `Giro: ${giroLabel}`                : '',
      ubicacion    ? `Ubicación: ${ubicacion}`           : '',
      comoLabel    ? `¿Cómo nos conoció? ${comoLabel}`  : '',
      mensaje      ? `Mensaje: ${mensaje}`               : '',
    ].filter(Boolean).join('\n');

    const nombreOpo  = `[Web] ${requeLabel || 'Requerimiento'} — ${empresa || nombreCompleto}`;
    const notasOpo   = mensaje || '';

    const pool = await databaseService.getPool(req.user?.empresa);

    // 1. Insertar contacto
    const rCont = await pool.request()
      .input('nombre',   sql.NVarChar(200), (nombreCompleto || '').trim().slice(0, 200))
      .input('empresa',  sql.NVarChar(200), (empresa        || '').trim().slice(0, 200))
      .input('correo',   sql.NVarChar(200), (email          || '').trim().slice(0, 200))
      .input('telefono', sql.NVarChar(30),  (telefono       || '').trim().slice(0, 30))
      .input('cargo',    sql.NVarChar(100), (puesto         || '').trim().slice(0, 100))
      .input('notas',    sql.NVarChar(sql.MAX), notasContacto)
      .query(`
        INSERT INTO CRM_CONTACTOS
          (CONT_NOMBRE, CONT_EMPRESA, CONT_CORREO, CONT_TELEFONO, CONT_CARGO, CONT_NOTAS)
        OUTPUT INSERTED.CONT_ID
        VALUES (@nombre, @empresa, @correo, @telefono, @cargo, @notas)
      `);

    const contId = rCont.recordset[0].CONT_ID;

    // 2. Insertar oportunidad vinculada al contacto
    const rOpo = await pool.request()
      .input('nombre',     sql.NVarChar(200), nombreOpo.slice(0, 200))
      .input('contId',     sql.Int,           contId)
      .input('notasOpo',   sql.NVarChar(sql.MAX), notasOpo)
      .query(`
        INSERT INTO CRM_OPORTUNIDADES
          (OPO_NOMBRE, OPO_CONTACTO_ID, OPO_ETAPA, OPO_NOTAS)
        OUTPUT INSERTED.OPO_ID
        VALUES (@nombre, @contId, 'prospecto', @notasOpo)
      `);

    const opoId = rOpo.recordset[0].OPO_ID;

    // 3. Registrar interacción de creación
    await pool.request()
      .input('opoId',     sql.Int,           opoId)
      .input('contenido', sql.NVarChar(500), 'Lead desde página web')
      .query(`
        INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO)
        VALUES (@opoId, 'creacion', @contenido)
      `);

    res.json({ ok: true, contId, opoId });
  } catch (e) {
    console.error('Error recibirLeadMarketing:', e);
    res.status(500).json({ ok: false, mensaje: 'Error interno al guardar el lead.' });
  }
};

// POST /api/crm/lead-chatbot — captura del "Asistente ARDABYTEC" en la página
// de marketing (chatbot.enviarLead en index.html). Etiquetadas 'chatbot-web'
// en las notas para distinguirlas del formulario de contacto (recibirLeadMarketing).
exports.recibirLeadChatbot = async (req, res) => {
  try {
    const { nombre, email, telefono, interes, empresa, cargo, presupuesto, resumen } = req.body || {};

    if (!nombre || (!email && !telefono)) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y al menos un contacto (email o teléfono) son requeridos.' });
    }

    const notasContacto = [
      '[chatbot-web]',
      interes ? `Interés: ${interes}` : '',
      presupuesto != null && presupuesto !== '' ? `Presupuesto: ${presupuesto}` : '',
      resumen ? `Resumen de la conversación:\n${resumen}` : '',
    ].filter(Boolean).join('\n');

    const nombreOpo = `[Chatbot] ${interes || 'Requerimiento'} — ${empresa || nombre}`;

    const pool = await databaseService.getPool(req.user?.empresa);

    const rCont = await pool.request()
      .input('nombre',   sql.NVarChar(200), String(nombre).trim().slice(0, 200))
      .input('empresa',  sql.NVarChar(200), (empresa  || '').trim().slice(0, 200))
      .input('correo',   sql.NVarChar(200), (email    || '').trim().slice(0, 200))
      .input('telefono', sql.NVarChar(30),  (telefono || '').trim().slice(0, 30))
      .input('cargo',    sql.NVarChar(100), (cargo    || '').trim().slice(0, 100))
      .input('notas',    sql.NVarChar(sql.MAX), notasContacto)
      .query(`
        INSERT INTO CRM_CONTACTOS
          (CONT_NOMBRE, CONT_EMPRESA, CONT_CORREO, CONT_TELEFONO, CONT_CARGO, CONT_NOTAS)
        OUTPUT INSERTED.CONT_ID
        VALUES (@nombre, @empresa, @correo, @telefono, @cargo, @notas)
      `);
    const contId = rCont.recordset[0].CONT_ID;

    const rOpo = await pool.request()
      .input('nombre',   sql.NVarChar(200), nombreOpo.slice(0, 200))
      .input('contId',   sql.Int, contId)
      .input('notasOpo', sql.NVarChar(sql.MAX), resumen || '')
      .query(`
        INSERT INTO CRM_OPORTUNIDADES
          (OPO_NOMBRE, OPO_CONTACTO_ID, OPO_ETAPA, OPO_NOTAS)
        OUTPUT INSERTED.OPO_ID
        VALUES (@nombre, @contId, 'prospecto', @notasOpo)
      `);
    const opoId = rOpo.recordset[0].OPO_ID;

    await pool.request()
      .input('opoId',     sql.Int, opoId)
      .input('contenido', sql.NVarChar(500), 'Lead desde chatbot web')
      .query(`
        INSERT INTO CRM_INTERACCIONES (INT_OPO_ID, INT_TIPO, INT_CONTENIDO)
        VALUES (@opoId, 'creacion', @contenido)
      `);

    res.json({ ok: true, contId, opoId });
  } catch (e) {
    console.error('Error recibirLeadChatbot:', e);
    res.status(500).json({ ok: false, mensaje: 'Error interno al guardar el lead.' });
  }
};
