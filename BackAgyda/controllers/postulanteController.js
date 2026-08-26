const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const emailService = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const { validateEmail } = require('../utils/validators');

const ESTADOS_VALIDOS = ['nuevo', 'revisado', 'descartado', 'contactado'];
const ETAPAS_VALIDAS = ['nuevo', 'revision_cv', 'entrevista', 'oferta', 'contratado', 'descartado'];

const SELECT_POSTULANTE = `
  SELECT
    POST_ID as id,
    POST_VACANTE_ID as vacanteId,
    POST_NOMBRE as nombre,
    POST_EMAIL as email,
    POST_TELEFONO as telefono,
    POST_CV_URL as cvUrl,
    POST_MENSAJE as mensaje,
    POST_FECHA as fecha,
    POST_ESTADO as estado,
    POST_ETAPA as etapa,
    POST_ORDEN as orden
  FROM dbo.INTRANET_VACANTES_POSTULANTES
`;

exports.getPostulantesByVacante = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('vacanteId', sql.Int, id)
      .query(`${SELECT_POSTULANTE} WHERE POST_VACANTE_ID = @vacanteId ORDER BY POST_FECHA DESC`);

    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo postulantes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Todas las postulaciones de todas las vacantes, con el título de cada vacante — para el dashboard.
exports.getAllPostulantes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request().query(`
      SELECT
        p.POST_ID as id,
        p.POST_VACANTE_ID as vacanteId,
        v.VAC_TITULO as vacanteTitulo,
        p.POST_NOMBRE as nombre,
        p.POST_EMAIL as email,
        p.POST_TELEFONO as telefono,
        p.POST_CV_URL as cvUrl,
        p.POST_MENSAJE as mensaje,
        p.POST_FECHA as fecha,
        p.POST_ESTADO as estado,
        p.POST_ETAPA as etapa,
        p.POST_ORDEN as orden
      FROM dbo.INTRANET_VACANTES_POSTULANTES p
      INNER JOIN dbo.INTRANET_VACANTES v ON v.VAC_ID = p.POST_VACANTE_ID
      ORDER BY p.POST_FECHA DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo todas las postulaciones:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Métricas agregadas para el dashboard de vacantes.
exports.getDashboardStats = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const totales = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.INTRANET_VACANTES) as vacantesTotal,
        (SELECT COUNT(*) FROM dbo.INTRANET_VACANTES WHERE VAC_ACTIVO = 1) as vacantesActivas,
        (SELECT COUNT(*) FROM dbo.INTRANET_VACANTES_POSTULANTES) as postulacionesTotal
    `);

    const porEstado = await pool.request().query(`
      SELECT POST_ESTADO as estado, COUNT(*) as total
      FROM dbo.INTRANET_VACANTES_POSTULANTES
      GROUP BY POST_ESTADO
    `);

    const porVacante = await pool.request().query(`
      SELECT
        v.VAC_ID as vacanteId,
        v.VAC_TITULO as vacanteTitulo,
        v.VAC_ACTIVO as vacanteActiva,
        COUNT(p.POST_ID) as totalPostulantes
      FROM dbo.INTRANET_VACANTES v
      LEFT JOIN dbo.INTRANET_VACANTES_POSTULANTES p ON p.POST_VACANTE_ID = v.VAC_ID
      GROUP BY v.VAC_ID, v.VAC_TITULO, v.VAC_ACTIVO
      ORDER BY totalPostulantes DESC
    `);

    res.json({
      success: true,
      data: {
        ...totales.recordset[0],
        porEstado: porEstado.recordset,
        porVacante: porVacante.recordset,
      },
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del dashboard de vacantes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPostulante = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, telefono, cvUrl, mensaje } = req.body;

    if (!nombre || !email || !cvUrl) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: nombre, email, cvUrl' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const vacante = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT VAC_ID, VAC_TITULO, VAC_ACTIVO FROM dbo.INTRANET_VACANTES WHERE VAC_ID = @id');

    if (vacante.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Vacante no encontrada' });
    }
    if (!vacante.recordset[0].VAC_ACTIVO) {
      return res.status(400).json({ success: false, message: 'Esta vacante ya no está disponible' });
    }

    // Evita que la misma persona se postule dos veces a la misma vacante:
    // se compara email (case-insensitive) y/o teléfono (solo dígitos) contra postulaciones ya existentes.
    const nombreNorm = String(nombre).trim().toLowerCase();
    const emailNorm = String(email).trim().toLowerCase();
    const telefonoNorm = telefono ? String(telefono).replace(/\D/g, '') : null;

    const existentes = await pool.request()
      .input('vacanteId', sql.Int, id)
      .query('SELECT POST_NOMBRE, POST_EMAIL, POST_TELEFONO FROM dbo.INTRANET_VACANTES_POSTULANTES WHERE POST_VACANTE_ID = @vacanteId');

    const yaPostulado = existentes.recordset.some((p) => {
      const pEmail = String(p.POST_EMAIL || '').trim().toLowerCase();
      const pTelefono = p.POST_TELEFONO ? String(p.POST_TELEFONO).replace(/\D/g, '') : null;
      const pNombre = String(p.POST_NOMBRE || '').trim().toLowerCase();

      if (pEmail && pEmail === emailNorm) return true;
      if (telefonoNorm && pTelefono && pTelefono === telefonoNorm) return true;
      if (pNombre && pNombre === nombreNorm) return true;
      return false;
    });

    if (yaPostulado) {
      return res.status(409).json({ success: false, message: 'Ya te has postulado a esta vacante anteriormente.' });
    }

    const result = await pool.request()
      .input('vacanteId', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('email', sql.NVarChar, email)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('cvUrl', sql.NVarChar, cvUrl)
      .input('mensaje', sql.NVarChar, mensaje || null)
      .input('estado', sql.NVarChar, 'nuevo')
      .input('etapa', sql.NVarChar, 'nuevo')
      .query(`
        INSERT INTO dbo.INTRANET_VACANTES_POSTULANTES (
          POST_VACANTE_ID, POST_NOMBRE, POST_EMAIL, POST_TELEFONO, POST_CV_URL, POST_MENSAJE, POST_FECHA, POST_ESTADO, POST_ETAPA
        )
        VALUES (@vacanteId, @nombre, @email, @telefono, @cvUrl, @mensaje, GETDATE(), @estado, @etapa);
        SELECT SCOPE_IDENTITY() as id;
      `);

    const postulanteId = result.recordset[0].id;

    const creado = await pool.request()
      .input('id', sql.Int, postulanteId)
      .query(`${SELECT_POSTULANTE} WHERE POST_ID = @id`);

    const data = creado.recordset[0];

    try {
      socketService.getIO(req.user?.empresa).emit('vacante:postulante', { vacanteId: Number(id), postulante: data });
    } catch (e) {
      console.warn('⚠️ No se pudo emitir vacante:postulante:', e?.message || e);
    }

    try {
      await emailService.sendNuevoPostulanteEmail({
        vacanteTitulo: vacante.recordset[0].VAC_TITULO,
        nombre,
        email,
        telefono,
        cvUrl,
        mensaje,
      });
    } catch (e) {
      console.warn('⚠️ No se pudo enviar el correo de aviso de postulación:', e?.message || e);
    }

    await logAudit(pool, { userId: null, userName: nombre, modulo: 'vacantes', accion: 'postular', entidadId: String(id), detalle: { postulanteId, email }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando postulante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEstadoPostulante = async (req, res) => {
  try {
    const { postId } = req.params;
    const { estado } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ success: false, message: `Estado inválido. Use uno de: ${ESTADOS_VALIDOS.join(', ')}` });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('id', sql.Int, postId)
      .query('SELECT POST_ID, POST_VACANTE_ID FROM dbo.INTRANET_VACANTES_POSTULANTES WHERE POST_ID = @id');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Postulante no encontrado' });
    }

    await pool.request()
      .input('id', sql.Int, postId)
      .input('estado', sql.NVarChar, estado)
      .query('UPDATE dbo.INTRANET_VACANTES_POSTULANTES SET POST_ESTADO = @estado WHERE POST_ID = @id');

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('vacante:postulanteEstado', { postId: parseInt(postId), estado });
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'editar-postulante', entidadId: String(postId), detalle: { estado }, ip: req.ip });
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error actualizando estado de postulante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mueve un postulante entre etapas del pipeline (kanban de Reclutamiento y selección).
// Independiente de POST_ESTADO/updateEstadoPostulante, que sigue usando /vacantes.
exports.updateEtapaPostulante = async (req, res) => {
  try {
    const { postId } = req.params;
    const { etapa, orden } = req.body;

    if (!ETAPAS_VALIDAS.includes(etapa)) {
      return res.status(400).json({ success: false, message: `Etapa inválida. Use una de: ${ETAPAS_VALIDAS.join(', ')}` });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('id', sql.Int, postId)
      .query('SELECT POST_ID, POST_VACANTE_ID FROM dbo.INTRANET_VACANTES_POSTULANTES WHERE POST_ID = @id');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Postulante no encontrado' });
    }

    const vacanteId = existing.recordset[0].POST_VACANTE_ID;
    const ordenFinal = Number.isFinite(Number(orden)) ? Number(orden) : 0;

    await pool.request()
      .input('id', sql.Int, postId)
      .input('etapa', sql.NVarChar, etapa)
      .input('orden', sql.Int, ordenFinal)
      .query('UPDATE dbo.INTRANET_VACANTES_POSTULANTES SET POST_ETAPA = @etapa, POST_ORDEN = @orden WHERE POST_ID = @id');

    // Al descartar desde el kanban, reflejar también en POST_ESTADO para que
    // /vacantes (que solo conoce los 4 estados viejos) se mantenga coherente.
    if (etapa === 'descartado') {
      await pool.request()
        .input('id', sql.Int, postId)
        .query("UPDATE dbo.INTRANET_VACANTES_POSTULANTES SET POST_ESTADO = 'descartado' WHERE POST_ID = @id");
    }

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('vacante:postulanteEtapa', { postId: parseInt(postId), vacanteId, etapa, orden: ordenFinal });
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'mover-etapa-postulante', entidadId: String(postId), detalle: { etapa, orden: ordenFinal }, ip: req.ip });
    res.json({ success: true, message: 'Etapa actualizada' });
  } catch (error) {
    console.error('Error actualizando etapa de postulante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
