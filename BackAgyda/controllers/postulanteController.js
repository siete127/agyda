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
    POST_ORDEN as orden,
    POST_TICKET_CRED as ticketCredencialesId
  FROM dbo.INTRANET_VACANTES_POSTULANTES
`;

// Ticket de TI con el que se pidieron las credenciales de un contratado (evita
// pedirlas dos veces). Se asegura al primer uso en cada BD.
const conColumnas = new WeakSet();
async function poolConColumnas(req) {
  const pool = await databaseService.getPool(req.user?.empresa);
  if (!conColumnas.has(pool)) {
    await pool.request().query(`
      IF COL_LENGTH('dbo.INTRANET_VACANTES_POSTULANTES', 'POST_TICKET_CRED') IS NULL
        ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES ADD POST_TICKET_CRED INT NULL;`);
    conColumnas.add(pool);
  }
  return pool;
}

exports.getPostulantesByVacante = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolConColumnas(req);

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
    const pool = await poolConColumnas(req);

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
        p.POST_ORDEN as orden,
        p.POST_TICKET_CRED as ticketCredencialesId
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

    const pool = await poolConColumnas(req);

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

    // Push a quienes de PERMISOS_MAIL_TO (lista fija de .env, sin usuarioId)
    // sí tengan cuenta AGYDA — se cruza por correo contra NEUS_USUARIOS. Los
    // que no tengan cuenta (direcciones externas en la lista) simplemente no
    // reciben push, pero el correo de arriba les llega igual.
    try {
      const { PERMISOS_MAIL_TO } = require('../config/email');
      if (PERMISOS_MAIL_TO.length) {
        const reqPush = pool.request();
        const placeholders = PERMISOS_MAIL_TO.map((correo, i) => {
          reqPush.input(`c${i}`, sql.NVarChar, correo);
          return `@c${i}`;
        });
        const rsDestPush = await reqPush.query(`
          SELECT NEUS_ID as id FROM NEUS_USUARIOS
          WHERE NEUS_ACTIVO = 1 AND NEUS_CORREO IN (${placeholders.join(',')})
        `);
        if (rsDestPush.recordset.length) {
          const pushService = require('../services/pushService');
          await pushService.enviarAVarios(pool, rsDestPush.recordset.map((r) => r.id), {
            titulo: 'Nueva postulación',
            cuerpo: `${nombre} se postuló a: ${vacante.recordset[0].VAC_TITULO}`,
            url: '/vacantes',
            tag: `postulante-${postulanteId}`,
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudo enviar push de aviso de postulación:', e?.message || e);
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

/* ── Reclutamiento: prospecto manual, credenciales y expediente ── */

// POST /vacantes/:id/postulantes/manual — RH registra un prospecto desde la
// intranet (llamada, referido, feria…). A diferencia de la postulación pública
// no exige CV ni que la vacante siga abierta, no manda el correo/push de
// "nueva postulación" y puede entrar directo en cualquier etapa.
exports.createPostulanteManual = async (req, res) => {
  try {
    const vacanteId = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre || '').trim();
    const email = String(req.body?.email || '').trim();
    const telefono = String(req.body?.telefono || '').trim();
    const mensaje = String(req.body?.mensaje || '').trim();
    const cvUrl = String(req.body?.cvUrl || '').trim();
    const etapa = ETAPAS_VALIDAS.includes(req.body?.etapa) ? req.body.etapa : 'nuevo';

    if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre del prospecto' });
    if (!email && !telefono) return res.status(400).json({ success: false, message: 'Captura al menos un correo o un teléfono' });
    if (email && !validateEmail(email)) return res.status(400).json({ success: false, message: 'Correo inválido' });

    const pool = await poolConColumnas(req);
    const vacante = await pool.request().input('id', sql.Int, vacanteId)
      .query('SELECT VAC_ID, VAC_TITULO FROM dbo.INTRANET_VACANTES WHERE VAC_ID = @id');
    if (!vacante.recordset.length) return res.status(404).json({ success: false, message: 'Vacante no encontrada' });

    // Mismo criterio de duplicado que la postulación pública (correo o teléfono en la misma vacante).
    const telNorm = telefono.replace(/\D/g, '');
    const existentes = await pool.request().input('v', sql.Int, vacanteId)
      .query('SELECT POST_NOMBRE nombre, POST_EMAIL email, POST_TELEFONO telefono FROM dbo.INTRANET_VACANTES_POSTULANTES WHERE POST_VACANTE_ID = @v');
    const dup = existentes.recordset.find((p) =>
      (email && String(p.email || '').trim().toLowerCase() === email.toLowerCase())
      || (telNorm && String(p.telefono || '').replace(/\D/g, '') === telNorm));
    if (dup) return res.status(409).json({ success: false, message: `Ya está registrado en esta vacante como "${dup.nombre}"` });

    const ins = await pool.request()
      .input('v', sql.Int, vacanteId).input('nombre', sql.NVarChar, nombre).input('email', sql.NVarChar, email)
      .input('tel', sql.NVarChar, telefono || null).input('cv', sql.NVarChar, cvUrl)
      .input('msg', sql.NVarChar, mensaje || null).input('etapa', sql.NVarChar, etapa)
      .input('estado', sql.NVarChar, etapa === 'descartado' ? 'descartado' : 'nuevo')
      .query(`INSERT INTO dbo.INTRANET_VACANTES_POSTULANTES
                (POST_VACANTE_ID, POST_NOMBRE, POST_EMAIL, POST_TELEFONO, POST_CV_URL, POST_MENSAJE, POST_FECHA, POST_ESTADO, POST_ETAPA)
              OUTPUT INSERTED.POST_ID id
              VALUES (@v, @nombre, @email, @tel, @cv, @msg, GETDATE(), @estado, @etapa)`);
    const postId = ins.recordset[0].id;
    const data = (await pool.request().input('id', sql.Int, postId).query(`${SELECT_POSTULANTE} WHERE POST_ID = @id`)).recordset[0];

    try { socketService.getIO(req.user?.empresa).emit('vacante:postulante', { vacanteId, postulante: data }); } catch (_) { /* opcional */ }
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'crear-prospecto', entidadId: String(postId), detalle: { vacanteId, nombre, etapa }, ip: req.ip });
    res.status(201).json({ success: true, data: { ...data, vacanteTitulo: vacante.recordset[0].VAC_TITULO } });
  } catch (error) {
    console.error('Error creando prospecto:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

async function leerPostulante(pool, postId) {
  const rs = await pool.request().input('id', sql.Int, postId).query(`
    SELECT p.POST_ID id, p.POST_VACANTE_ID vacanteId, p.POST_NOMBRE nombre, p.POST_EMAIL email, p.POST_TELEFONO telefono,
           p.POST_ETAPA etapa, p.POST_TICKET_CRED ticketId, v.VAC_TITULO vacante, v.VAC_UBICACION ubicacion
    FROM dbo.INTRANET_VACANTES_POSTULANTES p
    INNER JOIN dbo.INTRANET_VACANTES v ON v.VAC_ID = p.POST_VACANTE_ID
    WHERE p.POST_ID = @id`);
  return rs.recordset[0] || null;
}

// POST /vacantes/:id/postulantes/:postId/credenciales — con el candidato ya
// contratado, abre un ticket a TI para crear su usuario y credenciales con
// sus datos. Una sola vez por postulante (se guarda el ticket).
exports.solicitarCredenciales = async (req, res) => {
  try {
    const pool = await poolConColumnas(req);
    const p = await leerPostulante(pool, parseInt(req.params.postId, 10));
    if (!p) return res.status(404).json({ success: false, message: 'Postulante no encontrado' });
    if (p.etapa !== 'contratado') return res.status(400).json({ success: false, message: 'Solo se piden credenciales de candidatos contratados' });
    if (p.ticketId) return res.status(409).json({ success: false, message: `Ya se pidieron sus credenciales (ticket #${p.ticketId})`, ticketId: p.ticketId });

    const puesto = String(req.body?.puesto || '').trim() || p.vacante;
    const fechaIngreso = String(req.body?.fechaIngreso || '').trim();
    const area = String(req.body?.area || '').trim();
    const accesos = String(req.body?.accesos || '').trim();
    const notas = String(req.body?.notas || '').trim();
    const descripcion = [
      'Alta de colaborador contratado desde Reclutamiento y selección.',
      '',
      `Nombre: ${p.nombre}`,
      `Correo personal: ${p.email || 'no registrado'}`,
      `Teléfono: ${p.telefono || 'no registrado'}`,
      `Puesto: ${puesto}`,
      p.ubicacion ? `Ubicación: ${p.ubicacion}` : null,
      area ? `Área: ${area}` : null,
      fechaIngreso ? `Fecha de ingreso: ${fechaIngreso}` : null,
      accesos ? `Accesos que necesita: ${accesos}` : null,
      notas ? `Notas: ${notas}` : null,
      '',
      'Se solicita: crear su usuario en la intranet y entregar sus credenciales de acceso.',
    ].filter((l) => l !== null).join('\n');

    const { crearTicketInterno } = require('./ticketController');
    const r = await crearTicketInterno(pool, {
      solicitanteId: req.user?.id, area: 'TI',
      titulo: `Alta de usuario y credenciales: ${p.nombre}`,
      descripcion, clasificacion: 'acceso', categoria: 'Usuarios y Accesos',
      tenantKey: req.user?.empresa, canalOrigen: 'portal',
    });
    if (!r.ok) return res.status(r.status || 400).json({ success: false, message: r.message });
    const ticketId = r.data?.id;
    await pool.request().input('id', sql.Int, p.id).input('t', sql.Int, ticketId)
      .query('UPDATE dbo.INTRANET_VACANTES_POSTULANTES SET POST_TICKET_CRED = @t WHERE POST_ID = @id');

    try { socketService.getIO(req.user?.empresa).emit('vacante:postulanteEtapa', { postId: p.id, vacanteId: p.vacanteId, etapa: p.etapa }); } catch (_) { /* opcional */ }
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'solicitar-credenciales', entidadId: String(p.id), detalle: { ticketId }, ip: req.ip });
    res.status(201).json({ success: true, data: { ticketId } });
  } catch (error) {
    console.error('Error solicitando credenciales:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /vacantes/:id/postulantes/:postId/usuario — el usuario del sistema de un
// contratado (para abrir su expediente): se busca por correo y, si no, por nombre.
exports.usuarioDePostulante = async (req, res) => {
  try {
    const pool = await poolConColumnas(req);
    const p = await leerPostulante(pool, parseInt(req.params.postId, 10));
    if (!p) return res.status(404).json({ success: false, message: 'Postulante no encontrado' });
    const rs = await pool.request().input('c', sql.NVarChar, String(p.email || '').trim()).input('n', sql.NVarChar, String(p.nombre || '').trim())
      .query(`SELECT TOP 1 NEUS_ID id, NEUS_NOMBRES nombres, NEUS_PUESTO puesto, NEUS_TIPOUSUARIO tipoUsuario
              FROM NEUS_USUARIOS
              WHERE NEUS_ACTIVO = 1 AND NEUS_TIPOUSUARIO <> 'CL'
                AND ((@c <> '' AND LOWER(NEUS_CORREO) = LOWER(@c))
                  OR NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI = @n COLLATE SQL_Latin1_General_CP1_CI_AI)
              ORDER BY CASE WHEN @c <> '' AND LOWER(NEUS_CORREO) = LOWER(@c) THEN 0 ELSE 1 END, NEUS_ID DESC`);
    res.json({ success: true, data: rs.recordset[0] || null });
  } catch (error) {
    console.error('Error buscando usuario del postulante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
