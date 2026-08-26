const sql      = require('mssql');
const path     = require('path');
const fs       = require('fs');
const dbVentas = require('../config/database_ventas');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');

const JWT_SECRET_VENTAS = process.env.VENTAS_JWT_SECRET || 'M3X1C0.2025$%';

/* Pool de conexion a plata_prospectPRO */
let _pool = null;
async function getVentasPool() {
  if (_pool && _pool.connected) return _pool;
  _pool = await new sql.ConnectionPool(dbVentas).connect();
  return _pool;
}

/* Middleware: verificar JWT de ventas */
exports.verifyVentasToken = (req, res, next) => {
  const token = req.headers['x-access-token'] || (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token de ventas requerido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET_VENTAS);
    req.ventasUserId = decoded.id;
    req.ventasRole   = decoded.role;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token de ventas invalido o expirado' });
  }
};

/* Middleware: solo admin/superadmin/supervisor */
exports.requireAdmin = (req, res, next) => {
  if (!['admin', 'superadmin', 'supervisor'].includes(req.ventasRole)) {
    return res.status(403).json({ message: 'Acceso denegado' });
  }
  next();
};

/* Multer para evidencias */
const evidenciaDir = path.join(__dirname, '../public/uploads/evidencias');
if (!fs.existsSync(evidenciaDir)) fs.mkdirSync(evidenciaDir, { recursive: true });

exports.upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, evidenciaDir),
    filename:    (_req, file, cb) => cb(null, 'ev_' + Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Solo imagenes'));
  },
});

/* =========================================================
   AUTH
========================================================= */
exports.loginVentas = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Usuario y contrasena requeridos' });

    const pool   = await getVentasPool();
    const result = await pool.request()
      .input('username', sql.NVarChar, username.trim())
      .input('password', sql.NVarChar, password.trim())
      .query(`
        SELECT TOP 1 idUser, nombreAgente, username, role, Activo, campaign
        FROM Users
        WHERE username = @username AND [password] = @password AND Activo = 1
      `);

    if (!result.recordset.length) return res.status(401).json({ message: 'Credenciales incorrectas' });
    const user = result.recordset[0];

    const campResult = await pool.request()
      .input('userId', sql.Int, user.idUser)
      .query(`
        SELECT DISTINCT c.id, c.nombre
        FROM [Campanas] c
        INNER JOIN UserCampaigns uc ON uc.campaignId = c.id
        WHERE uc.userId = @userId AND c.activo = 1
        UNION
        SELECT c.id, c.nombre FROM [Campanas] c
        INNER JOIN Users u ON u.campaign = c.id
        WHERE u.idUser = @userId AND c.activo = 1
      `);

    const token = jwt.sign(
      { id: user.idUser, role: user.role, username: user.username },
      JWT_SECRET_VENTAS,
      { expiresIn: '24h' }
    );

    res.json({ accessToken: token, id: user.idUser, role: user.role, nombreAgente: user.nombreAgente, username: user.username, campaigns: campResult.recordset });
  } catch (err) {
    console.error('[loginVentas]', err);
    res.status(500).json({ message: 'Error de servidor' });
  }
};

exports.intranetSSOVentas = async (req, res) => {
  try {
    const intranetToken = req.headers['x-intranet-token'];
    if (!intranetToken) return res.status(400).json({ message: 'Token de intranet requerido' });

    const intranetSecret = process.env.JWT_SECRET || 'intranet_secret_key';
    let payload;
    try { payload = jwt.verify(intranetToken, intranetSecret); }
    catch (e) { return res.status(401).json({ message: 'Token de intranet invalido' }); }

    const intraDbService = require('../services/databaseService');
    const intraPool      = await intraDbService.getPool();
    const intraResult    = await intraPool.request()
      .input('id', sql.Int, Number(payload.id || payload.user || payload.sub))
      .query(`SELECT TOP 1 NEUS_NOMBRES, NEUS_USUARIO FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @id`);

    const intraRow       = intraResult.recordset[0] || {};
    const nombreIntranet = (intraRow.NEUS_NOMBRES || '').trim();
    const usernameIntra  = (intraRow.NEUS_USUARIO  || '').trim();
    if (!nombreIntranet) return res.status(404).json({ message: 'Usuario no encontrado en intranet' });

    const pool = await getVentasPool();
    // Buscar primero por username (match exacto), luego por nombre (fallback)
    const ventasResult = await pool.request()
      .input('username', sql.NVarChar, usernameIntra)
      .input('nombre',   sql.NVarChar, nombreIntranet)
      .query(`
        SELECT TOP 1 idUser, nombreAgente, username, role, Activo, campaign
        FROM Users
        WHERE Activo = 1
          AND (
            LTRIM(RTRIM(username))     COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(@username)) COLLATE Latin1_General_CI_AI
            OR
            LTRIM(RTRIM(nombreAgente)) COLLATE Latin1_General_CI_AI LIKE '%' + LTRIM(RTRIM(@nombre)) + '%' COLLATE Latin1_General_CI_AI
            OR
            LTRIM(RTRIM(@nombre)) COLLATE Latin1_General_CI_AI LIKE '%' + LTRIM(RTRIM(nombreAgente)) + '%' COLLATE Latin1_General_CI_AI
          )
        ORDER BY
          CASE WHEN LTRIM(RTRIM(username)) COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(@username)) COLLATE Latin1_General_CI_AI THEN 0 ELSE 1 END
      `);

    if (!ventasResult.recordset.length) {
      return res.status(404).json({ message: 'Usuario no encontrado en ventas: ' + nombreIntranet });
    }

    const user = ventasResult.recordset[0];

    let campResult;
    if (['admin', 'superadmin'].includes(user.role)) {
      campResult = await pool.request().query(`SELECT id, nombre FROM [Campanas] WHERE activo = 1 ORDER BY id`);
    } else {
      campResult = await pool.request()
        .input('userId', sql.Int, user.idUser)
        .query(`
          SELECT DISTINCT c.id, c.nombre
          FROM [Campanas] c
          INNER JOIN UserCampaigns uc ON uc.campaignId = c.id
          WHERE uc.userId = @userId AND c.activo = 1
          UNION
          SELECT c.id, c.nombre FROM [Campanas] c
          INNER JOIN Users u ON u.campaign = c.id
          WHERE u.idUser = @userId AND c.activo = 1
        `);
    }

    const token = jwt.sign(
      { id: user.idUser, role: user.role, username: user.username },
      JWT_SECRET_VENTAS,
      { expiresIn: '24h' }
    );

    res.json({ accessToken: token, id: user.idUser, role: user.role, nombreAgente: user.nombreAgente, username: user.username, campaigns: campResult.recordset });
  } catch (err) {
    console.error('[intranetSSOVentas]', err);
    res.status(500).json({ message: 'Error de servidor' });
  }
};

/* =========================================================
   AGENTE: CAMPANAS
========================================================= */
exports.getAssignedCampaigns = async (req, res) => {
  try {
    const pool   = await getVentasPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.ventasUserId)
      .query(`
        SELECT DISTINCT c.id, c.nombre
        FROM [Campanas] c
        INNER JOIN UserCampaigns uc ON uc.campaignId = c.id
        WHERE uc.userId = @userId AND c.activo = 1
        UNION
        SELECT c.id, c.nombre FROM [Campanas] c
        INNER JOIN Users u ON u.campaign = c.id
        WHERE u.idUser = @userId AND c.activo = 1
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener campanas' });
  }
};

exports.getAllCampaignsForAgent = async (req, res) => {
  try {
    const pool   = await getVentasPool();
    const result = await pool.request().query('SELECT id, nombre, activo, color FROM [Campanas] WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener campanas' });
  }
};

/* =========================================================
   AGENTE: VENTAS DEL DIA
========================================================= */
exports.getAgentSalesToday = async (req, res) => {
  try {
    const pool   = await getVentasPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.ventasUserId)
      .query(`
        SELECT idVenta, nombreAgente, nombreCliente, telefonoCliente,
               estatus, evidencia, fecha, campaignId, idUser
        FROM Ventas
        WHERE idUser = @userId AND CONVERT(DATE, fecha) = CONVERT(DATE, GETDATE())
        ORDER BY fecha DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener ventas' });
  }
};

exports.createSale = async (req, res) => {
  try {
    const { nombreCliente, telefonoCliente, estatus, campaignId, evidencia, fechaAgendada, horaAgendada } = req.body;
    if (!nombreCliente || !telefonoCliente || !campaignId) return res.status(400).json({ message: 'Datos incompletos' });

    const pool = await getVentasPool();
    const userRes = await pool.request().input('id', sql.Int, req.ventasUserId).query('SELECT TOP 1 nombreAgente FROM Users WHERE idUser=@id');
    const nombreAgente = (userRes.recordset[0] || {}).nombreAgente || '';

    if (fechaAgendada) {
      await pool.request()
        .input('idUser',          sql.Int,      req.ventasUserId)
        .input('nombreAgente',    sql.NVarChar,  nombreAgente)
        .input('nombreCliente',   sql.NVarChar,  nombreCliente)
        .input('telefonoCliente', sql.NVarChar,  telefonoCliente)
        .input('campaignId',      sql.Int,       parseInt(campaignId))
        .input('fechaAgendada',   sql.NVarChar,  fechaAgendada)
        .input('horaAgendada',    sql.NVarChar,  horaAgendada || '')
        .query(`INSERT INTO Ventas (idUser,nombreAgente,nombreCliente,telefonoCliente,estatus,campaignId,fechaAgendada,horaAgendada,fecha)
                VALUES (@idUser,@nombreAgente,@nombreCliente,@telefonoCliente,'Agendada',@campaignId,@fechaAgendada,@horaAgendada,GETDATE())`);
    } else {
      await pool.request()
        .input('idUser',          sql.Int,      req.ventasUserId)
        .input('nombreAgente',    sql.NVarChar,  nombreAgente)
        .input('nombreCliente',   sql.NVarChar,  nombreCliente)
        .input('telefonoCliente', sql.NVarChar,  telefonoCliente)
        .input('estatus',         sql.NVarChar,  estatus || 'Pendiente')
        .input('evidencia',       sql.NVarChar,  evidencia || null)
        .input('campaignId',      sql.Int,       parseInt(campaignId))
        .query(`INSERT INTO Ventas (idUser,nombreAgente,nombreCliente,telefonoCliente,estatus,evidencia,campaignId,fecha)
                VALUES (@idUser,@nombreAgente,@nombreCliente,@telefonoCliente,@estatus,@evidencia,@campaignId,GETDATE())`);
    }
    res.status(201).json({ message: 'Venta registrada' });
  } catch (err) {
    console.error('[createSale]', err);
    res.status(500).json({ message: 'Error al registrar venta' });
  }
};

exports.uploadEvidence = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se subio ningun archivo' });
    const url = '/uploads/evidencias/' + req.file.filename;
    res.json({ url, filePath: url });
  } catch (err) {
    res.status(500).json({ message: 'Error al subir evidencia' });
  }
};

exports.checkPhone = async (req, res) => {
  try {
    const { telefonoCliente, campaignId } = req.query;
    if (!telefonoCliente) return res.json({ exists: false });
    const pool    = await getVentasPool();
    const request = pool.request().input('telefono', sql.NVarChar, telefonoCliente);
    let query = 'SELECT TOP 1 estatus FROM Ventas WHERE telefonoCliente=@telefono';
    if (campaignId) { request.input('campaignId', sql.Int, parseInt(campaignId)); query += ' AND campaignId=@campaignId'; }
    const result = await request.query(query);
    res.json({ exists: result.recordset.length > 0, ultimoEstatus: (result.recordset[0] || {}).estatus || null });
  } catch (err) {
    res.json({ exists: false });
  }
};

/* =========================================================
   AGENTE: AGENDADAS
========================================================= */
exports.getScheduledSales = async (req, res) => {
  try {
    const pool   = await getVentasPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.ventasUserId)
      .query(`SELECT idVenta,nombreCliente,telefonoCliente,fechaAgendada,horaAgendada,campaignId,nombreAgente
              FROM Ventas WHERE idUser=@userId AND estatus='Agendada' ORDER BY fechaAgendada,horaAgendada`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener agendadas' });
  }
};

exports.completeScheduledSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { evidencia, estatus } = req.body;
    const pool = await getVentasPool();
    await pool.request()
      .input('idVenta',   sql.Int,      parseInt(id))
      .input('evidencia', sql.NVarChar,  evidencia || null)
      .input('estatus',   sql.NVarChar,  estatus || 'Aprobada')
      .query('UPDATE Ventas SET evidencia=@evidencia,estatus=@estatus WHERE idVenta=@idVenta');
    res.json({ message: 'Completada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al completar' });
  }
};

exports.deleteScheduledSale = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getVentasPool();
    await pool.request().input('idVenta', sql.Int, parseInt(id))
      .query("DELETE FROM Ventas WHERE idVenta=@idVenta AND estatus='Agendada'");
    res.json({ message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

/* =========================================================
   ADMIN: ESTADISTICAS
========================================================= */
async function getStats(period, req, res) {
  try {
    const { date, campaign } = req.query;
    const campaignId = campaign ? parseInt(campaign) : null;
    const pool       = await getVentasPool();
    const dateStr    = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);

    let periodFilter = '';
    if (period === 'day')   periodFilter = `AND CONVERT(DATE, v.fecha) = '${dateStr}'`;
    if (period === 'week')  periodFilter = `AND DATEPART(week,v.fecha)=DATEPART(week,'${dateStr}') AND DATEPART(year,v.fecha)=DATEPART(year,'${dateStr}')`;
    if (period === 'month') periodFilter = `AND DATEPART(month,v.fecha)=DATEPART(month,'${dateStr}') AND DATEPART(year,v.fecha)=DATEPART(year,'${dateStr}')`;

    // Filtrar agentes que pertenecen a la campa�a (primaria O asignada en UserCampaigns)
    // Filtrar ventas tambi�n por campaignId para no mezclar ventas de otras campa�as
    const agentCampFilter = campaignId
      ? `AND (u.campaign=${campaignId} OR EXISTS (SELECT 1 FROM UserCampaigns uc WHERE uc.userId=u.idUser AND uc.campaignId=${campaignId}))`
      : '';
    const ventaCampFilter = campaignId ? `AND v.campaignId=${campaignId}` : '';

    const request = pool.request();
    const result = await request.query(`
      SELECT
        u.idUser AS agentId, u.nombreAgente,
        ${campaignId || 'u.campaign'} AS campaignId,
        c.nombre AS campaignNombre,
        SUM(CASE WHEN v.estatus='Aprobada' THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN v.estatus IN ('Rechazada','Declinado') THEN 1 ELSE 0 END) AS rechazadas,
        SUM(CASE WHEN v.estatus='Pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN v.estatus IN ('Formalizada','Formalizado') THEN 1 ELSE 0 END) AS formalizadas,
        SUM(CASE WHEN v.estatus='Garantizada' THEN 1 ELSE 0 END) AS garantizadas,
        COUNT(v.idVenta) AS total
      FROM Users u
      LEFT JOIN Ventas v ON v.idUser = u.idUser ${periodFilter} ${ventaCampFilter}
      LEFT JOIN [Campanas] c ON c.id = ${campaignId || 'u.campaign'}
      WHERE u.role='agente' AND u.Activo=1 ${agentCampFilter}
      GROUP BY u.idUser, u.nombreAgente, u.campaign, c.nombre
      ORDER BY total DESC
    `);

    const stats = result.recordset;
    res.json({
      stats,
      totales: {
        aprobadas:   stats.reduce((s, r) => s + r.aprobadas,   0),
        rechazadas:  stats.reduce((s, r) => s + r.rechazadas,  0),
        pendientes:  stats.reduce((s, r) => s + r.pendientes,  0),
        formalizadas:stats.reduce((s, r) => s + r.formalizadas,0),
        total:       stats.reduce((s, r) => s + r.total,       0),
      },
      ventas: [],
    });
  } catch (err) {
    console.error('[getStats]', err);
    res.status(500).json({ message: 'Error al obtener estadisticas' });
  }
}

exports.getDailyStats   = (req, res) => getStats('day',   req, res);
exports.getWeeklyStats  = (req, res) => getStats('week',  req, res);
exports.getMonthlyStats = (req, res) => getStats('month', req, res);

/* =========================================================
   ADMIN: ESTADISTICAS DINAMICAS POR ESTATUS DE CAMPANA
========================================================= */
async function getStatsDynamic(period, req, res) {
  try {
    const { date, campaign } = req.query;
    const campaignId = campaign ? parseInt(campaign) : null;
    const pool       = await getVentasPool();
    const dateStr    = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);

    let periodFilter = '';
    if (period === 'day')   periodFilter = `AND CONVERT(DATE, v.fecha) = '${dateStr}'`;
    if (period === 'week')  periodFilter = `AND DATEPART(week,v.fecha)=DATEPART(week,'${dateStr}') AND DATEPART(year,v.fecha)=DATEPART(year,'${dateStr}')`;
    if (period === 'month') periodFilter = `AND DATEPART(month,v.fecha)=DATEPART(month,'${dateStr}') AND DATEPART(year,v.fecha)=DATEPART(year,'${dateStr}')`;

    const agentCampFilter = campaignId
      ? `AND (u.campaign=${campaignId} OR EXISTS (SELECT 1 FROM UserCampaigns uc WHERE uc.userId=u.idUser AND uc.campaignId=${campaignId}))`
      : '';
    const ventaCampFilter = campaignId ? `AND v.campaignId=${campaignId}` : '';

    // Obtener estatus activos de la campana (si hay campaignId)
    let statuses = [];
    if (campaignId) {
      const stRes = await pool.request()
        .input('cid', sql.Int, campaignId)
        .query('SELECT id, nombreEstado, color FROM CampaignStatuses WHERE campaignId=@cid AND activo=1 ORDER BY orden, id');
      statuses = stRes.recordset;
    }

    // Query principal de ventas por agente
    const request = pool.request();
    const result = await request.query(`
      SELECT
        u.idUser AS agentId, u.nombreAgente,
        v.estatus,
        COUNT(v.idVenta) AS cantidad
      FROM Users u
      LEFT JOIN Ventas v ON v.idUser = u.idUser ${periodFilter} ${ventaCampFilter}
      WHERE u.role='agente' AND u.Activo=1 ${agentCampFilter}
      GROUP BY u.idUser, u.nombreAgente, v.estatus
      ORDER BY u.nombreAgente
    `);




    // Agrupar por agente
    const byAgent = {};
    for (const row of result.recordset) {
      const aid = row.agentId;
      if (!byAgent[aid]) {
        byAgent[aid] = {
          agentId: aid,
          nombreAgente: row.nombreAgente,
          estatusCounts: {},
          total: 0,
        };
      }
      if (row.estatus) {
        byAgent[aid].estatusCounts[row.estatus] = (byAgent[aid].estatusCounts[row.estatus] || 0) + row.cantidad;
        byAgent[aid].total += row.cantidad;
      }
    }

    const stats = Object.values(byAgent).sort((a, b) => b.total - a.total);

    // Totales por estatus
    const totalesPorEstatus = {};
    for (const ag of stats) {
      for (const [est, cnt] of Object.entries(ag.estatusCounts)) {
        totalesPorEstatus[est] = (totalesPorEstatus[est] || 0) + cnt;
      }
    }

    res.json({ stats, statuses, totalesPorEstatus, ventas: [] });
  } catch (err) {
    console.error('[getStatsDynamic]', err);
    res.status(500).json({ message: 'Error al obtener estadisticas dinamicas' });
  }
}

exports.getDailyStatsDynamic   = (req, res) => getStatsDynamic('day',   req, res);
exports.getWeeklyStatsDynamic  = (req, res) => getStatsDynamic('week',  req, res);
exports.getMonthlyStatsDynamic = (req, res) => getStatsDynamic('month', req, res);

/* =========================================================
   ADMIN: TODAS LAS VENTAS
========================================================= */
exports.getAllSales = async (req, res) => {
  try {
    const { campaign } = req.query;
    const campaignId   = campaign ? parseInt(campaign) : null;
    const pool         = await getVentasPool();
    const request      = pool.request();
    let query = 'SELECT idVenta,nombreAgente,nombreCliente,telefonoCliente,estatus,evidencia,fecha,campaignId,idUser FROM Ventas WHERE 1=1';
    if (campaignId) { request.input('campaignId', sql.Int, campaignId); query += ' AND campaignId=@campaignId'; }
    query += ' ORDER BY fecha DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener ventas' });
  }
};

exports.updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombreCliente, telefonoCliente, estatus, fecha } = req.body;
    const pool = await getVentasPool();
    await pool.request()
      .input('id',              sql.Int,       parseInt(id))
      .input('nombreCliente',   sql.NVarChar,  nombreCliente)
      .input('telefonoCliente', sql.NVarChar,  telefonoCliente)
      .input('estatus',         sql.NVarChar,  estatus)
      .input('fecha',           sql.DateTime,  fecha ? new Date(fecha) : new Date())
      .query('UPDATE Ventas SET nombreCliente=@nombreCliente,telefonoCliente=@telefonoCliente,estatus=@estatus,fecha=@fecha WHERE idVenta=@id');
    res.json({ message: 'Actualizada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar' });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await getVentasPool();
    await pool.request().input('id', sql.Int, parseInt(id)).query('DELETE FROM Ventas WHERE idVenta=@id');
    res.json({ message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

/* =========================================================
   ADMIN: AGENDADAS (vista admin)
========================================================= */
exports.getAllScheduledSales = async (req, res) => {
  try {
    const { campaign } = req.query;
    const campaignId   = campaign ? parseInt(campaign) : null;
    const pool         = await getVentasPool();
    const request      = pool.request();
    let query = "SELECT idVenta,nombreAgente,nombreCliente,telefonoCliente,fechaAgendada,horaAgendada,campaignId FROM Ventas WHERE estatus='Agendada'";
    if (campaignId) { request.input('campaignId', sql.Int, campaignId); query += ' AND campaignId=@campaignId'; }
    query += ' ORDER BY fechaAgendada,horaAgendada';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener agendadas admin' });
  }
};

/* =========================================================
   ADMIN: AGENTES
========================================================= */
exports.getAgentes = async (req, res) => {
  try {
    const pool   = await getVentasPool();
    const result = await pool.request().query(`
      SELECT u.idUser AS id, u.nombreAgente, u.username, u.role, u.Activo AS activo,
             u.campaign AS campaignId, c.nombre AS campaignNombre
      FROM Users u
      LEFT JOIN [Campanas] c ON c.id = u.campaign
      ORDER BY u.nombreAgente
    `);
    const agentes = result.recordset;
    // Traer campa�as asignadas por UserCampaigns para cada agente
    const ucResult = await pool.request().query(`
      SELECT uc.userId, uc.campaignId FROM UserCampaigns uc
    `);
    const ucMap = {};
    for (const row of ucResult.recordset) {
      if (!ucMap[row.userId]) ucMap[row.userId] = [];
      if (!ucMap[row.userId].includes(row.campaignId)) ucMap[row.userId].push(row.campaignId);
    }
    for (const a of agentes) {
      const ids = ucMap[a.id] ?? [];
      // Incluir campa�a primaria si no est� ya en la lista
      if (a.campaignId && !ids.includes(a.campaignId)) ids.push(a.campaignId);
      a.campaignIds = ids;
    }
    res.json(agentes);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener agentes' });
  }
};

exports.createAgente = async (req, res) => {
  try {
    const { nombreAgente, username, password, role, campaignId } = req.body;
    if (!nombreAgente || !username || !password || !role) return res.status(400).json({ message: 'Datos incompletos' });
    const pool   = await getVentasPool();
    const exists = await pool.request().input('u', sql.NVarChar, username).query('SELECT TOP 1 idUser FROM Users WHERE username=@u');
    if (exists.recordset.length) return res.status(400).json({ message: 'El usuario ya existe' });
    await pool.request()
      .input('nombreAgente', sql.NVarChar, nombreAgente)
      .input('username',     sql.NVarChar, username)
      .input('password',     sql.NVarChar, password)
      .input('role',         sql.NVarChar, role)
      .input('campaign',     sql.Int,      campaignId || null)
      .query("INSERT INTO Users (nombreAgente,username,[password],role,campaign,Activo) VALUES (@nombreAgente,@username,@password,@role,@campaign,1)");
    res.status(201).json({ message: 'Agente creado' });
  } catch (err) {
    console.error('[createAgente]', err);
    res.status(500).json({ message: 'Error al crear agente' });
  }
};

exports.updateAgente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombreAgente, username, role, campaignId, campaigns, newPassword, currentPassword } = req.body;
    const userId = parseInt(id);
    const pool = await getVentasPool();

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ message: 'Contrasena actual requerida' });
      const check = await pool.request().input('id', sql.Int, userId).input('pass', sql.NVarChar, currentPassword)
        .query('SELECT TOP 1 idUser FROM Users WHERE idUser=@id AND [password]=@pass');
      if (!check.recordset.length) return res.status(400).json({ message: 'Contrasena actual incorrecta' });
    }

    // Si solo vienen campaigns (desde Asignaciones), actualizar UserCampaigns sin tocar otros campos
    if (Array.isArray(campaigns) && !nombreAgente && !username) {
      const ids = campaigns.map(Number).filter(n => n > 0);
      const primaryCamp = ids[0] || null;
      await pool.request().input('id', sql.Int, userId).input('camp', sql.Int, primaryCamp)
        .query('UPDATE Users SET campaign=@camp WHERE idUser=@id');
      await pool.request().input('id', sql.Int, userId)
        .query('DELETE FROM UserCampaigns WHERE userId=@id');
      for (const cid of ids) {
        await pool.request().input('uid', sql.Int, userId).input('cid', sql.Int, cid)
          .query('INSERT INTO UserCampaigns (userId, campaignId) VALUES (@uid, @cid)');
      }
      return res.json({ message: 'Campa�as actualizadas' });
    }

    // Actualizaci�n completa de datos del agente
    const fields  = ['nombreAgente=@nombre', 'username=@user', 'role=@role', 'campaign=@camp'];
    const request = pool.request()
      .input('id',     sql.Int,      userId)
      .input('nombre', sql.NVarChar,  nombreAgente)
      .input('user',   sql.NVarChar,  username)
      .input('role',   sql.NVarChar,  role)
      .input('camp',   sql.Int,       campaignId || null);
    if (newPassword) { fields.push('[password]=@newPass'); request.input('newPass', sql.NVarChar, newPassword); }
    await request.query('UPDATE Users SET ' + fields.join(',') + ' WHERE idUser=@id');

    // Si tambi�n vienen campaigns, sincronizar UserCampaigns
    if (Array.isArray(campaigns) && campaigns.length > 0) {
      const ids = campaigns.map(Number).filter(n => n > 0);
      await pool.request().input('id', sql.Int, userId)
        .query('DELETE FROM UserCampaigns WHERE userId=@id');
      for (const cid of ids) {
        await pool.request().input('uid', sql.Int, userId).input('cid', sql.Int, cid)
          .query('INSERT INTO UserCampaigns (userId, campaignId) VALUES (@uid, @cid)');
      }
    }

    res.json({ message: 'Agente actualizado' });
  } catch (err) {
    console.error('[updateAgente]', err);
    res.status(500).json({ message: 'Error al actualizar' });
  }
};

exports.deleteAgente = async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await getVentasPool();
    await pool.request().input('id', sql.Int, parseInt(id)).query('DELETE FROM Users WHERE idUser=@id');
    res.json({ message: 'Agente eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

exports.toggleAgente = async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await getVentasPool();
    await pool.request().input('id', sql.Int, parseInt(id))
      .query('UPDATE Users SET Activo=CASE WHEN Activo=1 THEN 0 ELSE 1 END WHERE idUser=@id');
    res.json({ message: 'Estado actualizado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al togglear' });
  }
};

/* =========================================================
   ADMIN: CAMPANAS
========================================================= */
exports.getCampanas = async (req, res) => {
  try {
    const pool   = await getVentasPool();
    const result = await pool.request().query('SELECT id, nombre, activo, color FROM [Campanas] ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener campanas' });
  }
};

exports.createCampana = async (req, res) => {
  try {
    const { nombre, color } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ message: 'Nombre requerido' });
    const pool = await getVentasPool();
    await pool.request().input('nombre', sql.NVarChar, nombre.trim()).input('color', sql.NVarChar, color || '#2563eb')
      .query('INSERT INTO [Campanas] (nombre, activo, color) VALUES (@nombre, 1, @color)');
    res.status(201).json({ message: 'Campana creada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al crear campana' });
  }
};

exports.toggleCampana = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID requerido' });
    const pool = await getVentasPool();
    await pool.request().input('id', sql.Int, id)
      .query('UPDATE [Campanas] SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END WHERE id = @id');
    const result = await pool.request().input('id', sql.Int, id)
      .query('SELECT activo FROM [Campanas] WHERE id = @id');
    res.json({ activo: result.recordset[0]?.activo ?? 0 });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar campa�a' });
  }
};

exports.updateCampana = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, color } = req.body;
    if (!id || !nombre?.trim()) return res.status(400).json({ message: 'ID y nombre requeridos' });
    const pool = await getVentasPool();
    await pool.request().input('id', sql.Int, id).input('nombre', sql.NVarChar, nombre.trim()).input('color', sql.NVarChar, color || null)
      .query('UPDATE [Campanas] SET nombre = @nombre, color = COALESCE(@color, color) WHERE id = @id');
    res.json({ message: 'Campa�a actualizada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar campa�a' });
  }
};

exports.getCampanaStatuses = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getVentasPool();
    const result = await pool.request().input('id', sql.Int, id)
      .query('SELECT id, nombreEstado, orden, activo, color FROM CampaignStatuses WHERE campaignId = @id ORDER BY orden, id');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener estatus' });
  }
};

exports.addCampanaStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombreEstado, color } = req.body;
    if (!id || !nombreEstado?.trim()) return res.status(400).json({ message: 'Datos requeridos' });
    const pool = await getVentasPool();
    const maxOrden = await pool.request().input('id', sql.Int, id)
      .query('SELECT ISNULL(MAX(orden), 0) + 1 AS next FROM CampaignStatuses WHERE campaignId = @id');
    const orden = maxOrden.recordset[0]?.next ?? 1;
    await pool.request()
      .input('cid', sql.Int, id)
      .input('nombre', sql.NVarChar, nombreEstado.trim())
      .input('orden', sql.Int, orden)
      .input('color', sql.NVarChar, color || null)
      .query('INSERT INTO CampaignStatuses (campaignId, nombreEstado, orden, activo, color, createdAt, updatedAt) VALUES (@cid, @nombre, @orden, 1, @color, GETDATE(), GETDATE())');
  } catch (err) {
    res.status(500).json({ message: 'Error al agregar estatus' });
  }
};

exports.toggleCampanaStatus = async (req, res) => {
  try {
    const statusId = parseInt(req.params.statusId);
    const pool = await getVentasPool();
    await pool.request().input('id', sql.Int, statusId)
      .query('UPDATE CampaignStatuses SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END, updatedAt = GETDATE() WHERE id = @id');
    const result = await pool.request().input('id', sql.Int, statusId)
      .query('SELECT activo FROM CampaignStatuses WHERE id = @id');
    res.json({ activo: result.recordset[0]?.activo ?? 0 });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar estatus' });
  }
};

exports.deleteCampanaStatus = async (req, res) => {
  try {
    const statusId = parseInt(req.params.statusId);
    const pool = await getVentasPool();
    await pool.request().input('id', sql.Int, statusId)
      .query('DELETE FROM CampaignStatuses WHERE id = @id');
    res.json({ message: 'Estatus eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar estatus' });
  }
};



exports.updateCampanaStatus = async (req, res) => {
  try {
    const statusId = parseInt(req.params.statusId);
    const { nombreEstado, color } = req.body;
    if (!statusId) return res.status(400).json({ message: 'ID requerido' });
    const pool = await getVentasPool();
    await pool.request()
      .input('id', sql.Int, statusId)
      .input('nombre', sql.NVarChar, nombreEstado?.trim() || null)
      .input('color', sql.NVarChar, color || null)
      .query('UPDATE CampaignStatuses SET nombreEstado = COALESCE(@nombre, nombreEstado), color = COALESCE(@color, color), updatedAt = GETDATE() WHERE id = @id');
    res.json({ message: 'Estatus actualizado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar estatus' });
  }
};

/* =========================================================
   TIPIFICACIONES (solo campaña Plata)
========================================================= */
async function ensureTipificacionesTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Tipificaciones')
    CREATE TABLE Tipificaciones (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      idUser        INT NOT NULL,
      nombreAgente  NVARCHAR(200) NOT NULL DEFAULT '',
      campaignId    INT NOT NULL,
      telefono      NVARCHAR(20) NOT NULL,
      edad          INT NULL,
      estado        NVARCHAR(100) NOT NULL,
      notas         NVARCHAR(500) NULL,
      fecha         DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

exports.createTipificacion = async (req, res) => {
  try {
    const { telefono, edad, estado, notas, campaignId } = req.body;
    if (!telefono || !estado) return res.status(400).json({ message: 'Telefono y estado son requeridos' });
    const pool = await getVentasPool();
    await ensureTipificacionesTable(pool);
    const userRes = await pool.request().input('id', sql.Int, req.ventasUserId)
      .query('SELECT TOP 1 nombreAgente FROM Users WHERE idUser=@id');
    const nombreAgente = (userRes.recordset[0] || {}).nombreAgente || '';
    await pool.request()
      .input('idUser',       sql.Int,       req.ventasUserId)
      .input('nombreAgente', sql.NVarChar,  nombreAgente)
      .input('campaignId',   sql.Int,       parseInt(campaignId) || 0)
      .input('telefono',     sql.NVarChar,  telefono.trim())
      .input('edad',         sql.Int,       edad ? parseInt(edad) : null)
      .input('estado',       sql.NVarChar,  estado.trim())
      .input('notas',        sql.NVarChar,  notas ? notas.trim() : null)
      .query(`INSERT INTO Tipificaciones (idUser,nombreAgente,campaignId,telefono,edad,estado,notas,fecha)
              VALUES (@idUser,@nombreAgente,@campaignId,@telefono,@edad,@estado,@notas,GETDATE())`);
    res.status(201).json({ message: 'Tipificacion registrada' });
  } catch (err) {
    console.error('[createTipificacion]', err);
    res.status(500).json({ message: 'Error al registrar tipificacion' });
  }
};

exports.getTipificaciones = async (req, res) => {
  try {
    const { campaignId } = req.query;
    const pool = await getVentasPool();
    await ensureTipificacionesTable(pool);
    const request = pool.request().input('userId', sql.Int, req.ventasUserId);
    let query = `SELECT id, idUser, nombreAgente, campaignId, telefono, edad, estado, notas, fecha
                 FROM Tipificaciones WHERE idUser = @userId`;
    if (campaignId) { request.input('campaignId', sql.Int, parseInt(campaignId)); query += ' AND campaignId = @campaignId'; }
    query += ' ORDER BY fecha DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener tipificaciones' });
  }
};

exports.deleteTipificacion = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getVentasPool();
    await pool.request()
      .input('id',     sql.Int, parseInt(id))
      .input('userId', sql.Int, req.ventasUserId)
      .query('DELETE FROM Tipificaciones WHERE id=@id AND idUser=@userId');
    res.json({ message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

/* =========================================================
   SEGUIMIENTO DE VENTAS
   - ProcesosCampana: pasos configurados por campaña
   - SeguimientoVentas: historial de seguimiento por venta
========================================================= */
async function ensureSeguimientoTables(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProcesosCampana')
    CREATE TABLE ProcesosCampana (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      campaignId  INT NOT NULL,
      nombre      NVARCHAR(200) NOT NULL,
      descripcion NVARCHAR(500) NULL,
      orden       INT NOT NULL DEFAULT 1,
      activo      BIT NOT NULL DEFAULT 1,
      creadoEn    DATETIME NOT NULL DEFAULT GETDATE()
    );

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SeguimientoVentas')
    CREATE TABLE SeguimientoVentas (
      id               INT IDENTITY(1,1) PRIMARY KEY,
      ventaId          INT NOT NULL,
      procesoId        INT NOT NULL,
      idUser           INT NOT NULL,
      nombreAgente     NVARCHAR(200) NOT NULL DEFAULT '',
      campaignId       INT NOT NULL,
      notas            NVARCHAR(1000) NULL,
      evidencia        NVARCHAR(500) NULL,
      fechaSeguimiento DATETIME NOT NULL DEFAULT GETDATE(),
      proximoContacto  DATETIME NULL
    );
  `);
}

/* ── Procesos de campaña (admin) ── */

exports.getProcesosCampana = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getVentasPool();
    await ensureSeguimientoTables(pool);
    const result = await pool.request()
      .input('cid', sql.Int, id)
      .query('SELECT id, campaignId, nombre, descripcion, orden, activo FROM ProcesosCampana WHERE campaignId=@cid ORDER BY orden, id');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener procesos' });
  }
};

exports.addProcesoCampana = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, descripcion } = req.body;
    if (!id || !nombre?.trim()) return res.status(400).json({ message: 'Datos requeridos' });
    const pool = await getVentasPool();
    await ensureSeguimientoTables(pool);
    const maxOrden = await pool.request().input('cid', sql.Int, id)
      .query('SELECT ISNULL(MAX(orden),0)+1 AS next FROM ProcesosCampana WHERE campaignId=@cid');
    const orden = maxOrden.recordset[0]?.next ?? 1;
    const result = await pool.request()
      .input('cid',  sql.Int,      id)
      .input('nom',  sql.NVarChar, nombre.trim())
      .input('desc', sql.NVarChar, descripcion?.trim() || null)
      .input('ord',  sql.Int,      orden)
      .query('INSERT INTO ProcesosCampana (campaignId,nombre,descripcion,orden) OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.descripcion, INSERTED.orden, INSERTED.activo VALUES (@cid,@nom,@desc,@ord)');
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error al agregar proceso' });
  }
};

exports.updateProcesoCampana = async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const { nombre, descripcion } = req.body;
    if (!pid || !nombre?.trim()) return res.status(400).json({ message: 'Datos requeridos' });
    const pool = await getVentasPool();
    await pool.request()
      .input('id',   sql.Int,      pid)
      .input('nom',  sql.NVarChar, nombre.trim())
      .input('desc', sql.NVarChar, descripcion?.trim() || null)
      .query('UPDATE ProcesosCampana SET nombre=@nom, descripcion=@desc WHERE id=@id');
    res.json({ message: 'Actualizado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar proceso' });
  }
};

exports.toggleProcesoCampana = async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const pool = await getVentasPool();
    await pool.request().input('id', sql.Int, pid)
      .query('UPDATE ProcesosCampana SET activo=CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=@id');
    const r = await pool.request().input('id', sql.Int, pid)
      .query('SELECT activo FROM ProcesosCampana WHERE id=@id');
    res.json({ activo: r.recordset[0]?.activo ?? 0 });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar proceso' });
  }
};

exports.deleteProcesoCampana = async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const pool = await getVentasPool();
    await pool.request().input('id', sql.Int, pid)
      .query('DELETE FROM ProcesosCampana WHERE id=@id');
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar proceso' });
  }
};

/* ── Seguimiento de ventas (agente) ── */

exports.getSeguimientoVenta = async (req, res) => {
  try {
    const ventaId = parseInt(req.params.ventaId);
    const pool = await getVentasPool();
    await ensureSeguimientoTables(pool);
    const result = await pool.request()
      .input('ventaId', sql.Int, ventaId)
      .query(`
        SELECT s.id, s.ventaId, s.procesoId, s.idUser, s.nombreAgente,
               s.notas, s.evidencia, s.fechaSeguimiento, s.proximoContacto,
               p.nombre AS procesoNombre, p.orden AS procesoOrden
        FROM SeguimientoVentas s
        LEFT JOIN ProcesosCampana p ON p.id = s.procesoId
        WHERE s.ventaId = @ventaId
        ORDER BY s.fechaSeguimiento DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener seguimiento' });
  }
};

exports.getSeguimientoAgente = async (req, res) => {
  try {
    const { campaignId } = req.query;
    const pool = await getVentasPool();
    await ensureSeguimientoTables(pool);
    const request = pool.request().input('userId', sql.Int, req.ventasUserId);
    let query = `
      SELECT s.id, s.ventaId, s.procesoId, s.idUser, s.nombreAgente,
             s.notas, s.evidencia, s.fechaSeguimiento, s.proximoContacto,
             p.nombre AS procesoNombre, p.orden AS procesoOrden,
             v.nombreCliente, v.telefonoCliente, v.estatus AS ventaEstatus
      FROM SeguimientoVentas s
      LEFT JOIN ProcesosCampana p ON p.id = s.procesoId
      LEFT JOIN Ventas v ON v.idVenta = s.ventaId
      WHERE s.idUser = @userId`;
    if (campaignId) {
      request.input('campaignId', sql.Int, parseInt(campaignId));
      query += ' AND s.campaignId = @campaignId';
    }
    query += ' ORDER BY s.proximoContacto ASC, s.fechaSeguimiento DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener seguimiento' });
  }
};

exports.createSeguimiento = async (req, res) => {
  try {
    const { ventaId, procesoId, notas, evidencia, proximoContacto, campaignId } = req.body;
    if (!ventaId || !procesoId) return res.status(400).json({ message: 'ventaId y procesoId requeridos' });
    const pool = await getVentasPool();
    await ensureSeguimientoTables(pool);
    const userRes = await pool.request().input('id', sql.Int, req.ventasUserId)
      .query('SELECT TOP 1 nombreAgente FROM Users WHERE idUser=@id');
    const nombreAgente = (userRes.recordset[0] || {}).nombreAgente || '';
    const result = await pool.request()
      .input('ventaId',         sql.Int,      parseInt(ventaId))
      .input('procesoId',       sql.Int,      parseInt(procesoId))
      .input('idUser',          sql.Int,      req.ventasUserId)
      .input('nombreAgente',    sql.NVarChar, nombreAgente)
      .input('campaignId',      sql.Int,      parseInt(campaignId) || 0)
      .input('notas',           sql.NVarChar, notas?.trim() || null)
      .input('evidencia',       sql.NVarChar, evidencia || null)
      .input('proximoContacto', sql.DateTime, proximoContacto ? new Date(proximoContacto) : null)
      .query(`
        INSERT INTO SeguimientoVentas (ventaId,procesoId,idUser,nombreAgente,campaignId,notas,evidencia,proximoContacto)
        OUTPUT INSERTED.id, INSERTED.fechaSeguimiento
        VALUES (@ventaId,@procesoId,@idUser,@nombreAgente,@campaignId,@notas,@evidencia,@proximoContacto)
      `);
    res.status(201).json({ message: 'Seguimiento registrado', id: result.recordset[0]?.id });
  } catch (err) {
    console.error('[createSeguimiento]', err);
    res.status(500).json({ message: 'Error al registrar seguimiento' });
  }
};

exports.deleteSeguimiento = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getVentasPool();
    await pool.request()
      .input('id',     sql.Int, parseInt(id))
      .input('userId', sql.Int, req.ventasUserId)
      .query('DELETE FROM SeguimientoVentas WHERE id=@id AND idUser=@userId');
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar seguimiento' });
  }
};

/* Upload evidencia de seguimiento — reutiliza el mismo middleware de multer */
exports.uploadEvidenciaSeguimiento = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se subio ningun archivo' });
    const url = '/uploads/evidencias/' + req.file.filename;
    res.json({ url, filePath: url });
  } catch (err) {
    res.status(500).json({ message: 'Error al subir evidencia' });
  }
};

/* =========================================================
   CRM BASE DE DATOS — Importaciones, Interacciones, Gestiones
========================================================= */

/* Multer para archivos CSV/XLSX */
const crmUploadDir = path.join(__dirname, '../public/uploads/crm');
if (!fs.existsSync(crmUploadDir)) fs.mkdirSync(crmUploadDir, { recursive: true });

exports.uploadCRM = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, crmUploadDir),
    filename:    (_req, file, cb) => cb(null, 'crm_' + Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname) ||
      ['text/csv','application/vnd.ms-excel',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Solo CSV o XLSX'));
  },
});

async function ensureCRMTables(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMImportaciones' AND xtype='U')
    CREATE TABLE CRMImportaciones (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      nombre       NVARCHAR(200)     NOT NULL,
      campaignId   INT               NOT NULL,
      columnas     NVARCHAR(MAX)     NOT NULL,
      totalRegistros INT             DEFAULT 0,
      confirmada   BIT               DEFAULT 0,
      creadoPor    INT               NOT NULL,
      creadoEn     DATETIME          DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMRegistros' AND xtype='U')
    CREATE TABLE CRMRegistros (
      id             INT IDENTITY(1,1) PRIMARY KEY,
      importacionId  INT           NOT NULL,
      campaignId     INT           NOT NULL,
      telefono       NVARCHAR(30)  NOT NULL,
      nombre         NVARCHAR(200) NOT NULL,
      datos          NVARCHAR(MAX) NOT NULL,
      creadoEn       DATETIME      DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMInteracciones' AND xtype='U')
    CREATE TABLE CRMInteracciones (
      id             INT IDENTITY(1,1) PRIMARY KEY,
      telefono       NVARCHAR(30)  NOT NULL,
      nombre         NVARCHAR(200) NOT NULL,
      campaignId     INT           NOT NULL,
      importacionId  INT           NOT NULL,
      columnas       NVARCHAR(MAX) NOT NULL,
      datos          NVARCHAR(MAX) NOT NULL,
      ultimaGestion  DATETIME      NULL,
      creadoEn       DATETIME      DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMGestiones' AND xtype='U')
    CREATE TABLE CRMGestiones (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      telefono     NVARCHAR(30)  NOT NULL,
      campaignId   INT           NOT NULL,
      idUser       INT           NOT NULL,
      nombreAgente NVARCHAR(200) NOT NULL,
      tipo         NVARCHAR(50)  NOT NULL,
      datos        NVARCHAR(MAX) NULL,
      fecha        DATETIME      DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMCamposConfig' AND xtype='U')
    CREATE TABLE CRMCamposConfig (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      campaignId   INT           NOT NULL,
      importacionId INT          NOT NULL,
      campo        NVARCHAR(100) NOT NULL,
      etiqueta     NVARCHAR(100) NOT NULL,
      editable     BIT           DEFAULT 0,
      visible      BIT           DEFAULT 1,
      orden        INT           DEFAULT 0
    )
  `);
}

/* ── Importaciones ── */

exports.getCRMImportaciones = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const campaignId = parseInt(req.query.campaignId) || 0;
    const result = await pool.request()
      .input('campaignId', sql.Int, campaignId)
      .query(`
        SELECT i.*, u.nombreAgente as creadoPorNombre
        FROM CRMImportaciones i
        LEFT JOIN Users u ON u.idUser = i.creadoPor
        WHERE i.campaignId = @campaignId
        ORDER BY i.creadoEn DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[getCRMImportaciones]', err);
    res.status(500).json({ message: 'Error al obtener importaciones' });
  }
};

exports.createCRMImportacion = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const { nombre, campaignId, columnas } = req.body;
    if (!nombre || !campaignId || !columnas) return res.status(400).json({ message: 'Faltan datos' });
    const result = await pool.request()
      .input('nombre',     sql.NVarChar, nombre.trim())
      .input('campaignId', sql.Int,      parseInt(campaignId))
      .input('columnas',   sql.NVarChar, typeof columnas === 'string' ? columnas : JSON.stringify(columnas))
      .input('creadoPor',  sql.Int,      req.ventasUserId)
      .query(`
        INSERT INTO CRMImportaciones (nombre, campaignId, columnas, creadoPor)
        OUTPUT INSERTED.id
        VALUES (@nombre, @campaignId, @columnas, @creadoPor)
      `);
    res.status(201).json({ id: result.recordset[0].id });
  } catch (err) {
    console.error('[createCRMImportacion]', err);
    res.status(500).json({ message: 'Error al crear importacion' });
  }
};

exports.deleteCRMImportacion = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const id = parseInt(req.params.id);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CRMRegistros WHERE importacionId=@id');
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CRMCamposConfig WHERE importacionId=@id');
    await pool.request().input('id', sql.Int, id).query('DELETE FROM CRMImportaciones WHERE id=@id');
    res.json({ message: 'Importacion eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar importacion' });
  }
};

/* ── Registros de una importación ── */

exports.addCRMRegistros = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const { importacionId, campaignId, registros } = req.body;
    if (!importacionId || !campaignId || !Array.isArray(registros) || registros.length === 0)
      return res.status(400).json({ message: 'Faltan datos o registros vacíos' });

    const table = new sql.Table('CRMRegistros');
    table.create = false;
    table.columns.add('importacionId', sql.Int,          { nullable: false });
    table.columns.add('campaignId',    sql.Int,          { nullable: false });
    table.columns.add('telefono',      sql.NVarChar(30), { nullable: false });
    table.columns.add('nombre',        sql.NVarChar(200),{ nullable: false });
    table.columns.add('datos',         sql.NVarChar(sql.MAX), { nullable: false });

    for (const r of registros) {
      table.rows.add(
        parseInt(importacionId),
        parseInt(campaignId),
        String(r.telefono ?? '').trim().replace(/\D/g, '').slice(0, 30),
        String(r.nombre ?? '').trim().slice(0, 200),
        JSON.stringify(r.datos ?? {})
      );
    }

    const request = pool.request();
    await request.bulk(table);

    await pool.request()
      .input('id',    sql.Int, parseInt(importacionId))
      .input('total', sql.Int, registros.length)
      .query('UPDATE CRMImportaciones SET totalRegistros = totalRegistros + @total WHERE id=@id');

    res.status(201).json({ message: 'Registros importados', count: registros.length });
  } catch (err) {
    console.error('[addCRMRegistros]', err);
    res.status(500).json({ message: 'Error al importar registros' });
  }
};

exports.getCRMRegistros = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const importacionId = parseInt(req.params.id);
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '50');
    const offset = (page - 1) * limit;
    const result = await pool.request()
      .input('importacionId', sql.Int, importacionId)
      .input('offset', sql.Int, offset)
      .input('limit',  sql.Int, limit)
      .query(`
        SELECT id, telefono, nombre, datos, creadoEn
        FROM CRMRegistros
        WHERE importacionId = @importacionId
        ORDER BY id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    const count = await pool.request()
      .input('importacionId', sql.Int, importacionId)
      .query('SELECT COUNT(*) as total FROM CRMRegistros WHERE importacionId=@importacionId');
    res.json({ registros: result.recordset, total: count.recordset[0].total, page, limit });
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener registros' });
  }
};

/* ── Confirmar importación → mover a Interacciones ── */

exports.confirmarCRMImportacion = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const importacionId = parseInt(req.params.id);

    const imp = await pool.request()
      .input('id', sql.Int, importacionId)
      .query('SELECT * FROM CRMImportaciones WHERE id=@id');
    if (!imp.recordset.length) return res.status(404).json({ message: 'Importacion no encontrada' });

    const { columnas, campaignId } = imp.recordset[0];

    /* Obtener todos los registros de la importación */
    const regs = await pool.request()
      .input('importacionId', sql.Int, importacionId)
      .query('SELECT * FROM CRMRegistros WHERE importacionId=@importacionId');

    let insertados = 0, actualizados = 0;
    for (const r of regs.recordset) {
      const tel = r.telefono;
      const existe = await pool.request()
        .input('tel', sql.NVarChar, tel)
        .input('cid', sql.Int, parseInt(campaignId))
        .query('SELECT id FROM CRMInteracciones WHERE telefono=@tel AND campaignId=@cid');

      if (existe.recordset.length) {
        await pool.request()
          .input('tel',          sql.NVarChar, tel)
          .input('cid',          sql.Int,      parseInt(campaignId))
          .input('nombre',       sql.NVarChar, r.nombre)
          .input('datos',        sql.NVarChar, r.datos)
          .input('columnas',     sql.NVarChar, columnas)
          .input('importacionId',sql.Int,      importacionId)
          .query(`UPDATE CRMInteracciones SET nombre=@nombre, datos=@datos, columnas=@columnas, importacionId=@importacionId
                  WHERE telefono=@tel AND campaignId=@cid`);
        actualizados++;
      } else {
        await pool.request()
          .input('tel',          sql.NVarChar, tel)
          .input('nombre',       sql.NVarChar, r.nombre)
          .input('cid',          sql.Int,      parseInt(campaignId))
          .input('importacionId',sql.Int,      importacionId)
          .input('columnas',     sql.NVarChar, columnas)
          .input('datos',        sql.NVarChar, r.datos)
          .query(`INSERT INTO CRMInteracciones (telefono,nombre,campaignId,importacionId,columnas,datos)
                  VALUES (@tel,@nombre,@cid,@importacionId,@columnas,@datos)`);
        insertados++;
      }
    }

    await pool.request()
      .input('id', sql.Int, importacionId)
      .query('UPDATE CRMImportaciones SET confirmada=1 WHERE id=@id');

    res.json({ message: 'Base confirmada', insertados, actualizados });
  } catch (err) {
    console.error('[confirmarCRMImportacion]', err);
    res.status(500).json({ message: 'Error al confirmar importacion' });
  }
};

/* ── Campos config (admin) ── */

exports.getCRMCamposConfig = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const importacionId = parseInt(req.params.id);
    const result = await pool.request()
      .input('importacionId', sql.Int, importacionId)
      .query('SELECT * FROM CRMCamposConfig WHERE importacionId=@importacionId ORDER BY orden');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener config' });
  }
};

exports.saveCRMCamposConfig = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const importacionId = parseInt(req.params.id);
    const { campaignId, campos } = req.body;
    if (!Array.isArray(campos)) return res.status(400).json({ message: 'campos debe ser array' });

    await pool.request()
      .input('importacionId', sql.Int, importacionId)
      .query('DELETE FROM CRMCamposConfig WHERE importacionId=@importacionId');

    for (let i = 0; i < campos.length; i++) {
      const c = campos[i];
      await pool.request()
        .input('campaignId',   sql.Int,      parseInt(campaignId))
        .input('importacionId',sql.Int,      importacionId)
        .input('campo',        sql.NVarChar, c.campo)
        .input('etiqueta',     sql.NVarChar, c.etiqueta || c.campo)
        .input('editable',     sql.Bit,      c.editable ? 1 : 0)
        .input('visible',      sql.Bit,      c.visible !== false ? 1 : 0)
        .input('orden',        sql.Int,      i)
        .query(`INSERT INTO CRMCamposConfig (campaignId,importacionId,campo,etiqueta,editable,visible,orden)
                VALUES (@campaignId,@importacionId,@campo,@etiqueta,@editable,@visible,@orden)`);
    }
    res.json({ message: 'Configuracion guardada' });
  } catch (err) {
    console.error('[saveCRMCamposConfig]', err);
    res.status(500).json({ message: 'Error al guardar config' });
  }
};

/* ── CRM público: obtener datos del cliente por teléfono ── */

exports.getCRMCliente = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const telefono = String(req.query.cliente || req.params.telefono || '').trim().replace(/\D/g, '');
    if (!telefono) return res.status(400).json({ message: 'Telefono requerido' });

    /* Buscar en interacciones (puede existir en varias campañas) */
    const result = await pool.request()
      .input('tel', sql.NVarChar, telefono)
      .query(`
        SELECT ci.*, imp.nombre as importacionNombre, imp.columnas as columnasDef
        FROM CRMInteracciones ci
        LEFT JOIN CRMImportaciones imp ON imp.id = ci.importacionId
        WHERE ci.telefono = @tel
        ORDER BY ci.ultimaGestion DESC, ci.creadoEn DESC
      `);

    if (!result.recordset.length) return res.json({ found: false, telefono, interacciones: [] });

    /* Historial de gestiones */
    const gestiones = await pool.request()
      .input('tel', sql.NVarChar, telefono)
      .query(`
        SELECT g.*, u.nombreAgente as agenteNombre
        FROM CRMGestiones g
        LEFT JOIN Users u ON u.idUser = g.idUser
        WHERE g.telefono = @tel
        ORDER BY g.fecha DESC
      `);

    /* Configuración de campos por importacion */
    const camposResult = await pool.request()
      .input('tel', sql.NVarChar, telefono)
      .query(`
        SELECT cc.*
        FROM CRMCamposConfig cc
        INNER JOIN CRMInteracciones ci ON ci.importacionId = cc.importacionId
        WHERE ci.telefono = @tel
        ORDER BY cc.orden
      `);

    res.json({
      found: true,
      telefono,
      interacciones: result.recordset.map(r => ({
        ...r,
        datos: (() => { try { return JSON.parse(r.datos) } catch { return {} } })(),
        columnasDef: (() => { try { return JSON.parse(r.columnasDef) } catch { return [] } })(),
      })),
      gestiones: gestiones.recordset,
      camposConfig: camposResult.recordset,
    });
  } catch (err) {
    console.error('[getCRMCliente]', err);
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
};

/* ── Registrar gestión (apertura automática desde VICIdial) ── */

exports.registrarGestionCRM = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const { telefono, campaignId, tipo, datos } = req.body;
    if (!telefono) return res.status(400).json({ message: 'Telefono requerido' });

    const tel = String(telefono).trim().replace(/\D/g, '');
    const idUser      = req.ventasUserId || 0;
    const nombreAgente = req.ventasNombreAgente || '';

    /* Si el agente viene en el token, obtener su nombre */
    let agenteName = nombreAgente;
    if (!agenteName && idUser) {
      const u = await pool.request()
        .input('id', sql.Int, idUser)
        .query('SELECT TOP 1 nombreAgente FROM Users WHERE idUser=@id');
      agenteName = u.recordset[0]?.nombreAgente || '';
    }

    await pool.request()
      .input('telefono',     sql.NVarChar, tel)
      .input('campaignId',   sql.Int,      parseInt(campaignId) || 0)
      .input('idUser',       sql.Int,      idUser)
      .input('nombreAgente', sql.NVarChar, agenteName)
      .input('tipo',         sql.NVarChar, tipo || 'apertura')
      .input('datos',        sql.NVarChar, datos ? JSON.stringify(datos) : null)
      .query(`
        INSERT INTO CRMGestiones (telefono,campaignId,idUser,nombreAgente,tipo,datos)
        VALUES (@telefono,@campaignId,@idUser,@nombreAgente,@tipo,@datos)
      `);

    /* Actualizar ultimaGestion en interacciones */
    await pool.request()
      .input('tel', sql.NVarChar, tel)
      .query('UPDATE CRMInteracciones SET ultimaGestion=GETDATE() WHERE telefono=@tel');

    res.json({ message: 'Gestion registrada' });
  } catch (err) {
    console.error('[registrarGestionCRM]', err);
    res.status(500).json({ message: 'Error al registrar gestion' });
  }
};

/* Gestión pública (sin token) — llamada desde la URL del CRM al abrirse */
exports.registrarGestionCRMPublica = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const { telefono, campaignId, agente, agenteId } = req.body;
    if (!telefono) return res.status(400).json({ message: 'Telefono requerido' });

    const tel = String(telefono).trim().replace(/\D/g, '');
    await pool.request()
      .input('telefono',     sql.NVarChar, tel)
      .input('campaignId',   sql.Int,      parseInt(campaignId) || 0)
      .input('idUser',       sql.Int,      parseInt(agenteId)   || 0)
      .input('nombreAgente', sql.NVarChar, agente || 'VICIdial')
      .input('tipo',         sql.NVarChar, 'apertura')
      .input('datos',        sql.NVarChar, null)
      .query(`
        INSERT INTO CRMGestiones (telefono,campaignId,idUser,nombreAgente,tipo,datos)
        VALUES (@telefono,@campaignId,@idUser,@nombreAgente,@tipo,@datos)
      `);

    await pool.request()
      .input('tel', sql.NVarChar, tel)
      .query('UPDATE CRMInteracciones SET ultimaGestion=GETDATE() WHERE telefono=@tel');

    res.json({ message: 'ok' });
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.updateCRMInteraccion = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const { telefono, campaignId, datos } = req.body;
    if (!telefono) return res.status(400).json({ message: 'Telefono requerido' });
    const tel = String(telefono).trim().replace(/\D/g, '');
    await pool.request()
      .input('tel',  sql.NVarChar, tel)
      .input('cid',  sql.Int,      parseInt(campaignId) || 0)
      .input('datos',sql.NVarChar, JSON.stringify(datos ?? {}))
      .query('UPDATE CRMInteracciones SET datos=@datos WHERE telefono=@tel AND campaignId=@cid');
    res.json({ message: 'Actualizado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar' });
  }
};

/* =========================================================
   CRM — IMPORTACIÓN DESDE ARCHIVO VICIDIAL (.txt TSV)
   Formato: lead_id, entry_date, ..., phone_number, first_name, last_name, state, ...
========================================================= */
exports.importarListaVICIdial = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);

    /* Asegurar tabla CRMListasVICIdial para guardar la info cruda */
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMListasVICIdial' AND xtype='U')
      CREATE TABLE CRMListasVICIdial (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        nombre        NVARCHAR(200) NOT NULL,
        campaignId    INT           NOT NULL,
        importacionId INT           NULL,
        totalRegistros INT          DEFAULT 0,
        creadoPor     INT           NOT NULL,
        creadoEn      DATETIME      DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMListasVICIdialRegistros' AND xtype='U')
      CREATE TABLE CRMListasVICIdialRegistros (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        listaId     INT           NOT NULL,
        lead_id     NVARCHAR(30)  NULL,
        status      NVARCHAR(20)  NULL,
        [user]      NVARCHAR(50)  NULL,
        list_id     NVARCHAR(20)  NULL,
        phone_number NVARCHAR(30) NOT NULL,
        first_name  NVARCHAR(100) NULL,
        last_name   NVARCHAR(200) NULL,
        state       NVARCHAR(10)  NULL,
        entry_date  NVARCHAR(30)  NULL,
        modify_date NVARCHAR(30)  NULL,
        called_count NVARCHAR(10) NULL,
        extra_data  NVARCHAR(MAX) NULL
      )
    `);

    const { nombre, campaignId, registros } = req.body;
    if (!nombre || !campaignId || !Array.isArray(registros) || registros.length === 0)
      return res.status(400).json({ message: 'Faltan datos' });

    /* 1 — Crear registro de lista */
    const listaRes = await pool.request()
      .input('nombre',     sql.NVarChar, nombre.trim())
      .input('campaignId', sql.Int,      parseInt(campaignId))
      .input('creadoPor',  sql.Int,      req.ventasUserId)
      .query(`INSERT INTO CRMListasVICIdial (nombre, campaignId, creadoPor)
              OUTPUT INSERTED.id VALUES (@nombre, @campaignId, @creadoPor)`);
    const listaId = listaRes.recordset[0].id;

    /* 2 — Guardar registros crudos en bulk */
    const tableR = new sql.Table('CRMListasVICIdialRegistros');
    tableR.create = false;
    tableR.columns.add('listaId',      sql.Int,          { nullable: false });
    tableR.columns.add('lead_id',      sql.NVarChar(30), { nullable: true  });
    tableR.columns.add('status',       sql.NVarChar(20), { nullable: true  });
    tableR.columns.add('user',         sql.NVarChar(50), { nullable: true  });
    tableR.columns.add('list_id',      sql.NVarChar(20), { nullable: true  });
    tableR.columns.add('phone_number', sql.NVarChar(30), { nullable: false });
    tableR.columns.add('first_name',   sql.NVarChar(100),{ nullable: true  });
    tableR.columns.add('last_name',    sql.NVarChar(200),{ nullable: true  });
    tableR.columns.add('state',        sql.NVarChar(10), { nullable: true  });
    tableR.columns.add('entry_date',   sql.NVarChar(30), { nullable: true  });
    tableR.columns.add('modify_date',  sql.NVarChar(30), { nullable: true  });
    tableR.columns.add('called_count', sql.NVarChar(10), { nullable: true  });
    tableR.columns.add('extra_data',   sql.NVarChar(sql.MAX), { nullable: true });

    for (const r of registros) {
      const phone = String(r.phone_number ?? '').trim().replace(/\D/g, '').slice(0, 30);
      if (!phone) continue;
      const extra = {};
      for (const k of Object.keys(r)) {
        if (!['lead_id','status','user','list_id','phone_number','first_name','last_name','state','entry_date','modify_date','called_count'].includes(k))
          extra[k] = r[k];
      }
      tableR.rows.add(
        listaId,
        String(r.lead_id    ?? '').slice(0,30) || null,
        String(r.status     ?? '').slice(0,20) || null,
        String(r.user       ?? '').slice(0,50) || null,
        String(r.list_id    ?? '').slice(0,20) || null,
        phone,
        String(r.first_name ?? '').slice(0,100) || null,
        String(r.last_name  ?? '').slice(0,200) || null,
        String(r.state      ?? '').slice(0,10)  || null,
        String(r.entry_date ?? '').slice(0,30)  || null,
        String(r.modify_date ?? '').slice(0,30) || null,
        String(r.called_count ?? '').slice(0,10)|| null,
        Object.keys(extra).length ? JSON.stringify(extra) : null
      );
    }
    await pool.request().bulk(tableR);
    await pool.request()
      .input('id',    sql.Int, listaId)
      .input('total', sql.Int, registros.length)
      .query('UPDATE CRMListasVICIdial SET totalRegistros=@total WHERE id=@id');

    /* 3 — Crear importación CRM automáticamente y cargar registros */
    const columnas = JSON.stringify([
      { original: 'phone_number', campo: 'telefono',  etiqueta: 'Teléfono' },
      { original: 'first_name',   campo: 'nombre',    etiqueta: 'Nombre' },
      { original: 'last_name',    campo: 'apellido',  etiqueta: 'Apellido' },
      { original: 'state',        campo: 'estado',    etiqueta: 'Estado' },
      { original: 'status',       campo: 'status_vd', etiqueta: 'Status VICIdial' },
      { original: 'lead_id',      campo: 'lead_id',   etiqueta: 'Lead ID' },
    ]);

    const impRes = await pool.request()
      .input('nombre',     sql.NVarChar, nombre.trim())
      .input('campaignId', sql.Int,      parseInt(campaignId))
      .input('columnas',   sql.NVarChar, columnas)
      .input('creadoPor',  sql.Int,      req.ventasUserId)
      .query(`INSERT INTO CRMImportaciones (nombre, campaignId, columnas, creadoPor)
              OUTPUT INSERTED.id VALUES (@nombre, @campaignId, @columnas, @creadoPor)`);
    const importacionId = impRes.recordset[0].id;

    /* Vincular lista con importación */
    await pool.request()
      .input('id',  sql.Int, listaId)
      .input('imp', sql.Int, importacionId)
      .query('UPDATE CRMListasVICIdial SET importacionId=@imp WHERE id=@id');

    /* Bulk insert de registros CRM */
    const tableC = new sql.Table('CRMRegistros');
    tableC.create = false;
    tableC.columns.add('importacionId', sql.Int,          { nullable: false });
    tableC.columns.add('campaignId',    sql.Int,          { nullable: false });
    tableC.columns.add('telefono',      sql.NVarChar(30), { nullable: false });
    tableC.columns.add('nombre',        sql.NVarChar(200),{ nullable: false });
    tableC.columns.add('datos',         sql.NVarChar(sql.MAX), { nullable: false });

    let insertadosCRM = 0;
    for (const r of registros) {
      const phone = String(r.phone_number ?? '').trim().replace(/\D/g, '').slice(0, 30);
      if (!phone) continue;
      const nombreCompleto = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || phone;
      const datos = {
        telefono:  phone,
        nombre:    String(r.first_name  ?? ''),
        apellido:  String(r.last_name   ?? ''),
        estado:    String(r.state       ?? ''),
        status_vd: String(r.status      ?? ''),
        lead_id:   String(r.lead_id     ?? ''),
      };
      tableC.rows.add(importacionId, parseInt(campaignId), phone, nombreCompleto.slice(0,200), JSON.stringify(datos));
      insertadosCRM++;
    }
    await pool.request().bulk(tableC);
    await pool.request()
      .input('id',    sql.Int, importacionId)
      .input('total', sql.Int, insertadosCRM)
      .query('UPDATE CRMImportaciones SET totalRegistros=@total WHERE id=@id');

    res.status(201).json({ message: 'Lista importada', listaId, importacionId, total: insertadosCRM });
  } catch (err) {
    console.error('[importarListaVICIdial]', err);
    res.status(500).json({ message: 'Error al importar lista VICIdial' });
  }
};

/* Lista VICIdial disponibles */
exports.getListasVICIdial = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRMListasVICIdial' AND xtype='U')
      CREATE TABLE CRMListasVICIdial (
        id INT IDENTITY(1,1) PRIMARY KEY, nombre NVARCHAR(200) NOT NULL, campaignId INT NOT NULL,
        importacionId INT NULL, totalRegistros INT DEFAULT 0, creadoPor INT NOT NULL, creadoEn DATETIME DEFAULT GETDATE()
      )
    `);
    const campaignId = parseInt(req.query.campaignId) || 0;
    const result = await pool.request()
      .input('campaignId', sql.Int, campaignId)
      .query(`
        SELECT l.*, u.nombreAgente as creadoPorNombre
        FROM CRMListasVICIdial l
        LEFT JOIN Users u ON u.idUser = l.creadoPor
        WHERE l.campaignId = @campaignId
        ORDER BY l.creadoEn DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener listas' });
  }
};

/* =========================================================
   CRM — REPORTES (descarga CSV/TSV)
========================================================= */

/* Helper: convierte array de objetos a CSV string */
function toCSV(rows, cols) {
  const header = cols.map(c => `"${c.label}"`).join(',');
  const body = rows.map(row =>
    cols.map(c => {
      const v = String(row[c.key] ?? '').replace(/"/g, '""');
      return `"${v}"`;
    }).join(',')
  );
  return [header, ...body].join('\r\n');
}

/* Reporte 1: Lista para re-subir a VICIdial (solo teléfonos filtrados por status) */
exports.reporteListaResubir = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const listaId    = parseInt(req.query.listaId    || '0');
    const campaignId = parseInt(req.query.campaignId || '0');
    const statuses   = req.query.statuses ? String(req.query.statuses).split(',').map(s => s.trim()).filter(Boolean) : [];

    let whereExtra = '';
    if (listaId)       whereExtra += ' AND r.listaId = @listaId';
    if (statuses.length) {
      const placeholders = statuses.map((_, i) => `@st${i}`).join(',');
      whereExtra += ` AND r.status IN (${placeholders})`;
    }

    const request = pool.request();
    if (listaId) request.input('listaId', sql.Int, listaId);
    statuses.forEach((s, i) => request.input(`st${i}`, sql.NVarChar, s));

    const result = await request.query(`
      SELECT r.phone_number, r.first_name, r.last_name, r.state, r.status,
             r.lead_id, r.entry_date, r.modify_date, r.called_count
      FROM CRMListasVICIdialRegistros r
      WHERE 1=1 ${whereExtra}
      ORDER BY r.id
    `);

    /* Formato TXT igual al que exporta VICIdial */
    const lines = result.recordset.map(r =>
      [r.phone_number, r.first_name ?? '', r.last_name ?? '', r.state ?? ''].join('\t')
    );
    const content = 'phone_number\tfirst_name\tlast_name\tstate\r\n' + lines.join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lista_resubir_${Date.now()}.txt"`);
    res.send(content);
  } catch (err) {
    console.error('[reporteListaResubir]', err);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

/* Reporte 2: Gestiones CRM */
exports.reporteGestionesCRM = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const campaignId = parseInt(req.query.campaignId || '0');
    const desde      = req.query.desde  ? String(req.query.desde)  : null;
    const hasta      = req.query.hasta  ? String(req.query.hasta)  : null;

    let where = campaignId ? 'WHERE g.campaignId = @cid' : 'WHERE 1=1';
    const request = pool.request();
    if (campaignId) request.input('cid', sql.Int, campaignId);
    if (desde) { where += ' AND g.fecha >= @desde'; request.input('desde', sql.NVarChar, desde); }
    if (hasta) { where += ' AND g.fecha <= @hasta'; request.input('hasta', sql.NVarChar, hasta + ' 23:59:59'); }

    const result = await request.query(`
      SELECT g.id, g.telefono, g.campaignId, g.nombreAgente, g.tipo, g.datos, g.fecha,
             ci.nombre as nombreCliente
      FROM CRMGestiones g
      LEFT JOIN CRMInteracciones ci ON ci.telefono = g.telefono AND ci.campaignId = g.campaignId
      ${where}
      ORDER BY g.fecha DESC
    `);

    const rows = result.recordset.map(r => {
      let extras = {};
      try { extras = JSON.parse(r.datos ?? '{}'); } catch {}
      return {
        id:           r.id,
        telefono:     r.telefono,
        campaignId:   r.campaignId,
        nombreCliente:r.nombreCliente ?? '',
        nombreAgente: r.nombreAgente,
        tipo:         r.tipo,
        fecha:        r.fecha ? new Date(r.fecha).toLocaleString('es-MX') : '',
        notas:        extras.notas ?? '',
        resultado:    extras.resultado ?? '',
        extra:        JSON.stringify(extras),
      };
    });

    const csv = toCSV(rows, [
      { key: 'id',           label: 'ID' },
      { key: 'telefono',     label: 'Teléfono' },
      { key: 'nombreCliente',label: 'Cliente' },
      { key: 'campaignId',   label: 'Campaña ID' },
      { key: 'nombreAgente', label: 'Agente' },
      { key: 'tipo',         label: 'Tipo' },
      { key: 'fecha',        label: 'Fecha' },
      { key: 'notas',        label: 'Notas' },
      { key: 'resultado',    label: 'Resultado' },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gestiones_crm_${Date.now()}.csv"`);
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[reporteGestionesCRM]', err);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

/* Reporte 3: Ventas */
exports.reporteVentas = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const campaignId = parseInt(req.query.campaignId || '0');
    const desde      = req.query.desde ? String(req.query.desde) : null;
    const hasta      = req.query.hasta ? String(req.query.hasta) : null;

    let where = campaignId ? 'WHERE v.campaignId = @cid' : 'WHERE 1=1';
    const request = pool.request();
    if (campaignId) request.input('cid', sql.Int, campaignId);
    if (desde) { where += ' AND v.fecha >= @desde'; request.input('desde', sql.NVarChar, desde); }
    if (hasta) { where += ' AND v.fecha <= @hasta'; request.input('hasta', sql.NVarChar, hasta + ' 23:59:59'); }

    const result = await request.query(`
      SELECT v.idVenta as id, v.nombreCliente, v.telefonoCliente, v.estatus,
             v.fecha, v.campaignId, v.nombreAgente, v.fechaAgendada, v.horaAgendada,
             c.nombre as campaNombre
      FROM Ventas v
      LEFT JOIN Campanas c ON c.ID = v.campaignId
      ${where}
      ORDER BY v.fecha DESC
    `);

    const csv = toCSV(result.recordset, [
      { key: 'id',             label: 'ID' },
      { key: 'nombreCliente',  label: 'Cliente' },
      { key: 'telefonoCliente',label: 'Teléfono' },
      { key: 'estatus',        label: 'Estatus' },
      { key: 'campaNombre',    label: 'Campaña' },
      { key: 'nombreAgente',   label: 'Agente' },
      { key: 'fecha',          label: 'Fecha' },
      { key: 'fechaAgendada',  label: 'Fecha Agendada' },
      { key: 'horaAgendada',   label: 'Hora Agendada' },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ventas_${Date.now()}.csv"`);
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[reporteVentas]', err);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

/* Reporte 4: Base completa VICIdial enriquecida con gestiones */
exports.reporteBaseCompleta = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const listaId    = parseInt(req.query.listaId    || '0');
    const campaignId = parseInt(req.query.campaignId || '0');

    /* Registros base VICIdial */
    let where = '1=1';
    const request = pool.request();
    if (listaId)    { where += ' AND r.listaId=@lid';      request.input('lid', sql.Int, listaId); }
    if (campaignId) { where += ' AND l.campaignId=@cid';   request.input('cid', sql.Int, campaignId); }

    const baseRes = await request.query(`
      SELECT r.phone_number, r.first_name, r.last_name, r.state,
             r.status as status_vd, r.lead_id, r.entry_date, r.modify_date,
             r.called_count, l.nombre as lista_nombre
      FROM CRMListasVICIdialRegistros r
      INNER JOIN CRMListasVICIdial l ON l.id = r.listaId
      WHERE ${where}
      ORDER BY r.id
    `);

    /* Obtener la última gestión por teléfono */
    const telList = [...new Set(baseRes.recordset.map(r => r.phone_number))];
    const gestionMap = {};
    if (telList.length) {
      /* Consultar por lotes de 500 */
      for (let i = 0; i < telList.length; i += 500) {
        const lote = telList.slice(i, i + 500);
        const phs  = lote.map((_, j) => `@t${i+j}`).join(',');
        const req2 = pool.request();
        lote.forEach((t, j) => req2.input(`t${i+j}`, sql.NVarChar, t));
        const gRes = await req2.query(`
          SELECT g.telefono, g.tipo, g.nombreAgente, g.fecha, g.datos,
                 ROW_NUMBER() OVER (PARTITION BY g.telefono ORDER BY g.fecha DESC) as rn
          FROM CRMGestiones g
          WHERE g.telefono IN (${phs})
        `);
        gRes.recordset.filter(r => r.rn === 1).forEach(r => { gestionMap[r.telefono] = r; });
      }
    }

    const rows = baseRes.recordset.map(r => {
      const g = gestionMap[r.phone_number];
      let notas = '', resultado = '';
      if (g) { try { const d = JSON.parse(g.datos ?? '{}'); notas = d.notas ?? ''; resultado = d.resultado ?? ''; } catch {} }
      return {
        phone_number:     r.phone_number,
        nombre:           [r.first_name, r.last_name].filter(Boolean).join(' '),
        state:            r.state ?? '',
        status_vd:        r.status_vd ?? '',
        lead_id:          r.lead_id ?? '',
        lista:            r.lista_nombre ?? '',
        last_modify:      r.modify_date ?? '',
        called_count:     r.called_count ?? '',
        ultima_gestion_tipo:    g?.tipo ?? '',
        ultima_gestion_agente:  g?.nombreAgente ?? '',
        ultima_gestion_fecha:   g?.fecha ? new Date(g.fecha).toLocaleString('es-MX') : '',
        notas,
        resultado,
      };
    });

    const csv = toCSV(rows, [
      { key: 'phone_number',           label: 'Teléfono' },
      { key: 'nombre',                 label: 'Nombre' },
      { key: 'state',                  label: 'Estado' },
      { key: 'status_vd',              label: 'Status VICIdial' },
      { key: 'lead_id',                label: 'Lead ID' },
      { key: 'lista',                  label: 'Lista' },
      { key: 'last_modify',            label: 'Última modificación' },
      { key: 'called_count',           label: 'Llamadas' },
      { key: 'ultima_gestion_tipo',    label: 'Tipo gestión' },
      { key: 'ultima_gestion_agente',  label: 'Agente gestión' },
      { key: 'ultima_gestion_fecha',   label: 'Fecha gestión' },
      { key: 'notas',                  label: 'Notas' },
      { key: 'resultado',              label: 'Resultado' },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="base_completa_${Date.now()}.csv"`);
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[reporteBaseCompleta]', err);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

/* Registrar gestión tipificada desde CRM público (con datos de resultado) */
exports.registrarTipificacionCRMPublica = async (req, res) => {
  try {
    const pool = await getVentasPool();
    await ensureCRMTables(pool);
    const { telefono, campaignId, agente, agenteId, resultado, notas, datosExtra } = req.body;
    if (!telefono) return res.status(400).json({ message: 'Telefono requerido' });

    const tel = String(telefono).trim().replace(/\D/g, '');
    const datos = { resultado: resultado ?? '', notas: notas ?? '', ...(datosExtra ?? {}) };

    await pool.request()
      .input('telefono',     sql.NVarChar, tel)
      .input('campaignId',   sql.Int,      parseInt(campaignId) || 0)
      .input('idUser',       sql.Int,      parseInt(agenteId)   || 0)
      .input('nombreAgente', sql.NVarChar, agente || 'Agente')
      .input('tipo',         sql.NVarChar, 'tipificacion')
      .input('datos',        sql.NVarChar, JSON.stringify(datos))
      .query(`INSERT INTO CRMGestiones (telefono,campaignId,idUser,nombreAgente,tipo,datos)
              VALUES (@telefono,@campaignId,@idUser,@nombreAgente,@tipo,@datos)`);

    await pool.request()
      .input('tel', sql.NVarChar, tel)
      .query('UPDATE CRMInteracciones SET ultimaGestion=GETDATE() WHERE telefono=@tel');

    res.json({ message: 'Tipificacion registrada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al registrar tipificacion' });
  }
};
