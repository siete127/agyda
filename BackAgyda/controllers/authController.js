const sql = require('mssql');
const jwt = require('jsonwebtoken');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { buildCookieHeaderFromSetCookieArray, rewriteVentasContent } = require('../utils/helpers');
const { DEFAULT_TENANT, listTenants } = require('../config/tenants');
const { revokeToken } = require('../middleware/tokenDenylist');
const { SUPER_ADMIN_CROSS_EMPRESA_USERNAMES } = require('../utils/superAdmin');
const logger = global.logger || require('../utils/logger');

// Bypass de login cross-empresa: si el usuario/password no existen en la BD
// de la empresa elegida, pero SÍ coinciden con la cuenta de este mismo
// username en la BD maestra 'agyda', se le deja entrar igual — sin necesidad
// de tener una fila NEUS_USUARIOS propia en cada empresa. Solo aplica a los
// usernames en SUPER_ADMIN_CROSS_EMPRESA_USERNAMES (ver utils/superAdmin.js),
// que ya son super admin en cualquier empresa una vez logueados.
async function intentarLoginCrossEmpresaComoAgyda(usuario, password) {
  if (!SUPER_ADMIN_CROSS_EMPRESA_USERNAMES.has(String(usuario).toUpperCase())) return null;
  try {
    const poolMaestro = await databaseService.getPool(DEFAULT_TENANT);
    const sql = require('mssql');
    const r = await poolMaestro.request()
      .input('usuario', sql.NVarChar, usuario)
      .input('password', sql.NVarChar, password)
      .query(`
        SELECT
          NEUS_ID AS [ID USUARIO], NEUS_NOMBRES AS [NOMBRE], NEUS_USUARIO,
          NEUS_CONTRA, username, [password],
          NEUS_TIPOUSUARIO AS [TIPO USUARIO], NEUS_STATUS AS [STATUS],
          NEUS_ACTIVO AS [ACTIVO], NEUS_BASE AS [CARTERA], NEUS_GENERO AS [GENERO]
        FROM dbo.NEUS_USUARIOS
        WHERE (username = @usuario OR NEUS_USUARIO = @usuario)
          AND ([password] = @password OR NEUS_CONTRA = @password)
          AND NEUS_ACTIVO = 1
      `);
    return r.recordset.length ? r.recordset[0] : null;
  } catch (e) {
    logger.warn('⚠️ Error en bypass de login cross-empresa:', e && e.message);
    return null;
  }
}

exports.getEmpresas = async (req, res) => {
  res.json({ success: true, data: listTenants() });
};

// Reconstruye el usuario completo (mismo shape que login) a partir del id del
// token vigente. Usado por /auth-bridge de la página pública para entrar a la
// Intranet reusando la sesión sin pedir usuario/contraseña de nuevo.
exports.getMe = async (req, res) => {
  try {
    const id = req.user && (req.user.id || req.user.sub || req.user.userId);
    const empresa = (req.user && req.user.empresa) || DEFAULT_TENANT;
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.query.token || '';
    if (!id) {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }

    const pool = await databaseService.getPool(empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          NEUS_ID AS [ID USUARIO],
          NEUS_NOMBRES AS [NOMBRE],
          NEUS_USUARIO,
          username,
          NEUS_TIPOUSUARIO AS [TIPO USUARIO],
          NEUS_STATUS AS [STATUS],
          NEUS_ACTIVO AS [ACTIVO],
          NEUS_BASE AS [CARTERA],
          NEUS_GENERO AS [GENERO]
        FROM dbo.NEUS_USUARIOS
        WHERE NEUS_ID = @id AND NEUS_ACTIVO = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const user = result.recordset[0];
    const ventasUsuario = (
      user.username ||
      user.NEUS_USUARIO ||
      user['NEUS_USUARIO'] ||
      user['USUARIO'] ||
      ''
    ).replace(/ /g, '_');

    return res.json({
      success: true,
      data: {
        id: user['ID USUARIO'],
        nombre: user['NOMBRE'],
        usuario: ventasUsuario,
        tipoUsuario: user['TIPO USUARIO'],
        status: user['STATUS'],
        activo: user['ACTIVO'],
        cartera: user['CARTERA'],
        ventasUsuario: ventasUsuario,
        genero: (user['GENERO'] || '').trim() || null,
        accessToken: token,
        empresa,
      },
    });
  } catch (error) {
    logger.error('❌ Error obteniendo usuario actual:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    logger.debug('🔐 Intento de login recibido');
    const { usuario, password, empresa } = req.body;

    if (!usuario || !password) {
      logger.warn('⚠️ Faltan usuario o password');
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }

    let pool;
    try {
      pool = await databaseService.getPool(empresa);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Empresa inválida' });
    }
    logger.debug(`🔍 Buscando usuario: ${usuario} (empresa: ${empresa || DEFAULT_TENANT})`);

    let result;
    const sql = require('mssql');
    try {
      result = await pool.request()
        .input('usuario', sql.NVarChar, usuario)
        .input('password', sql.NVarChar, password)
        .execute('[dbo].[CONSULTA_NEUS_USUARIOS]');
    } catch (spError) {
      logger.warn('⚠️ Error con SP, intentando consulta directa:', spError.message);
      result = await pool.request()
        .input('usuario', sql.NVarChar, usuario)
        .input('password', sql.NVarChar, password)
        .query(`
          SELECT
            NEUS_ID AS [ID USUARIO],
            NEUS_NOMBRES AS [NOMBRE],
            NEUS_USUARIO,
            NEUS_CONTRA,
            username,
            [password],
            NEUS_TIPOUSUARIO AS [TIPO USUARIO],
            NEUS_STATUS AS [STATUS],
            NEUS_ACTIVO AS [ACTIVO],
            NEUS_BASE AS [CARTERA],
            NEUS_GENERO AS [GENERO]
          FROM dbo.NEUS_USUARIOS
          WHERE
            (username = @usuario OR NEUS_USUARIO = @usuario)
            AND ([password] = @password OR NEUS_CONTRA = @password)
            AND NEUS_ACTIVO = 1
        `);
    }

    logger.debug(`📊 Resultados encontrados: ${result.recordset.length}`);

    let user;
    let esLoginCrossEmpresa = false;
    if (result.recordset.length === 0) {
      // No existe fila propia en esta empresa — probar el bypass cross-empresa
      // (solo aplica a usernames fijos en SUPER_ADMIN_CROSS_EMPRESA_USERNAMES).
      const usuarioMaestro = await intentarLoginCrossEmpresaComoAgyda(usuario, password);
      if (!usuarioMaestro) {
        logger.warn('❌ Usuario o contraseña incorrectos');
        return res.status(401).json({
          success: false,
          message: 'Usuario o contraseña incorrectos'
        });
      }
      logger.info(`🔓 Login cross-empresa (bypass) para ${usuario} en empresa=${empresa || DEFAULT_TENANT}`);
      user = usuarioMaestro;
      esLoginCrossEmpresa = true;
    } else {
      user = result.recordset[0];
    }
    // Bloquear login si el usuario está inactivo
    try {
      const activoVal =
        user['ACTIVO'] === 1 ||
        user['ACTIVO'] === true ||
        user['NEUS_ACTIVO'] === 1 ||
        user['NEUS_ACTIVO'] === true ||
        String(user['activo'] ?? '').toLowerCase() === '1' ||
        String(user['activo'] ?? '').toLowerCase() === 'true' ||
        user['activo'] === true;
      if (!activoVal) {
        logger.warn('⛔ Usuario inactivo, denegando acceso:', usuario);
        return res.status(403).json({
          success: false,
          message: 'Usuario inactivo. Contacta a TI para reactivar tu acceso.'
        });
      }
    } catch (e) {
      console.warn('Aviso: no se pudo evaluar ACTIVO en login:', e && e.message);
    }
    logger.debug('👤 Usuario encontrado:', {
      id: user['ID USUARIO'],
      nombre: user['NOMBRE'],
      tipo: user['TIPO USUARIO']
    });

    // username (campo ventas), NEUS_USUARIO (campo intranet login), o derivar del tipo+id como último recurso
    const ventasUsuario = (
      user.username ||
      user.NEUS_USUARIO ||
      user['NEUS_USUARIO'] ||
      user['USUARIO'] ||
      (user['TIPO USUARIO'] && user['ID USUARIO'] ? `${user['TIPO USUARIO']}_${String(user['ID USUARIO']).padStart(4,'0')}` : '')
    ).replace(/ /g, '_');
    const ventasPassword = user.password || user.NEUS_CONTRA;
    const empresaResuelta = (empresa || DEFAULT_TENANT).toLowerCase();

    const token = jwt.sign(
      {
        id: user['ID USUARIO'],
        role: user['TIPO USUARIO'],
        tipoUsuario: user['TIPO USUARIO'],
        ventasUsuario: ventasUsuario,
        nombre: user['NOMBRE'] || '',
        empresa: empresaResuelta
      },
      process.env.JWT_SECRET || 'AKOLATRONIC',
      { expiresIn: '12h' }
    );

    const response = {
      success: true,
      data: {
        id: user['ID USUARIO'],
        nombre: user['NOMBRE'],
        usuario: ventasUsuario,
        tipoUsuario: user['TIPO USUARIO'],
        status: user['STATUS'],
        activo: user['ACTIVO'],
        cartera: user['CARTERA'],
        ventasUsuario: ventasUsuario,
        ventasPassword: ventasPassword,
        genero: (user['GENERO'] || '').trim() || null,
        accessToken: token,
        ventasToken: token,
        empresa: empresaResuelta
      }
    };

    // Indicar al cliente que, puesto que creamos el registro de presencia,
    // el usuario está online (esto permite actualizar la UI inmediatamente)
    try {
      if (!response.data) response.data = {};
      response.data.online = true;
      response.data.presenceAt = new Date().toISOString();
    } catch (e) {
      // no bloquear por errores de formateo
    }

    // Intentar insertar un registro de presencia en USUARIO_TIEMPOS, y el
    // reinicio de disponibilidad de Chat en Vivo (bloque completo más abajo)
    // — ambos se omiten en login cross-empresa: el ID viene de la BD maestra
    // y no corresponde a ninguna fila real en esta empresa, escribir ahí
    // ensuciaría a otro usuario si ese mismo NEUS_ID ya existe con otra
    // identidad en la BD de esta empresa.
    try {
      if (esLoginCrossEmpresa) throw new Error('skip: login cross-empresa');
      const pool2 = await databaseService.getPool(empresaResuelta);
      // Buscar status 'online' en tabla STATUS para asignarlo a la entrada de tiempo
      let onlineStatusId = null;
      try {
        const rsStat = await pool2.request().query(`
          SELECT TOP 1 status_id FROM STATUS
          WHERE LOWER(ISNULL(clave,'')) LIKE '%line%'
            OR LOWER(ISNULL(clave,'')) LIKE '%online%'
            OR LOWER(ISNULL(descripcion,'')) LIKE '%line%'
            OR LOWER(ISNULL(descripcion,'')) LIKE '%online%'
        `);
        if (rsStat && rsStat.recordset && rsStat.recordset.length) {
          onlineStatusId = rsStat.recordset[0].status_id;
        }
      } catch (e) {
        // ignorar si no se puede consultar STATUS
      }

      const insertRs = await pool2.request()
        .input('id', sql.Int, user['ID USUARIO'])
        .input('statusId', sql.Int, onlineStatusId)
        .query(`
          DECLARE @new TABLE (id INT);
          INSERT INTO USUARIO_TIEMPOS (NEUS_ID, STATUS_ID, FECHA_INICIO)
          OUTPUT inserted.tiempo_id INTO @new(id)
          VALUES (@id, @statusId, GETDATE());
          SELECT id FROM @new;
        `);

      const tiempoId = insertRs && insertRs.recordset && insertRs.recordset[0] ? insertRs.recordset[0].id : null;
      if (!response.data) response.data = {};
      response.data.presenceTiempoId = tiempoId;
      logger.debug(`✅ Marca de presencia creada (USUARIO_TIEMPOS) id=${tiempoId} para usuario=${user['ID USUARIO']}`);
      // Emitir evento de presencia via socket (si está inicializado)
      try {
        const io = socketService.getIO(empresaResuelta);
        const payload = { userId: user['ID USUARIO'], status: 'online' };
        io.emit('presence:update', payload);
        io.emit('presence:updated', payload);
        io.to(`user:${user['ID USUARIO']}`).emit('presence:update', payload);
        io.to(`user:${user['ID USUARIO']}`).emit('presence:updated', payload);
        logger.debug(`📣 Emitido presence:update online para usuario=${user['ID USUARIO']}`);
      } catch (e) {
        // ignorar si socket.io no está listo
      }
    } catch (e) {
      console.warn('⚠️ No fue posible crear registro de presencia en USUARIO_TIEMPOS:', e && e.message);
    }

    // Cada login arranca en "No disponible" en Chat en Vivo — el agente debe
    // activarlo a mano cada vez que entra, no heredar el estado de la sesión
    // anterior (evita que quede "Disponible" olvidado de ayer y le lleguen
    // chats sin que esté realmente atendiendo). Solo toca la fila si ya existe;
    // si el agente nunca ha usado el módulo, se crea hasta su primer toggle.
    try {
      if (esLoginCrossEmpresa) throw new Error('skip: login cross-empresa');
      const pool3 = await databaseService.getPool(empresaResuelta);
      await pool3.request()
        .input('usuarioId', sql.Int, user['ID USUARIO'])
        .query(`
          UPDATE dbo.LIVECHAT_AGENTE_ESTADO
          SET LAE_DISPONIBLE = 0
          WHERE LAE_USUARIO_ID = @usuarioId
        `);
    } catch (e) {
      console.warn('⚠️ No se pudo reiniciar disponibilidad de Chat en Vivo en login:', e && e.message);
    }

    logger.info('✅ Login exitoso para:', usuario);
    res.json(response);

  } catch (error) {
    console.error('❌ Error login:', error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`
    });
  }
};

exports.ventasLogin = async (req, res) => {
  try {
    const { ventasUsuario, ventasPassword } = req.body;

    logger.debug('════════════════════════════════════════');
    logger.debug('🔐 LOGIN VENTAS INICIADO');
    logger.debug('🔐 Session ID:', req.sessionID);
    logger.debug('🔐 Credenciales recibidas para:', ventasUsuario);

    if (!ventasUsuario || !ventasPassword) {
      return res.status(400).json({ success: false, message: 'Faltan credenciales' });
    }

    const username = ventasUsuario.trim();
    const password = ventasPassword.trim();
    const target = 'https://ventas.ardabytec.vip:8443/api/auth/login';
    let ventasSessionCookie = req.session.ventasSessionCookie || '';

    const response = await fetch(target, {
      method: 'POST',
      headers: { 
        'Cookie': ventasSessionCookie, 
        'User-Agent': req.headers['user-agent'] || '',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password }),
      redirect: 'follow'
    });

    const contentType = response.headers.get('content-type') || '';
    let responseData;
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
      console.error('❌ Respuesta no es JSON, contenido recibido:', responseData.substring(0, 200));
      return res.status(response.status).json({
        success: false,
        message: 'Respuesta de Ventas no es JSON',
        detalle: responseData.substring(0, 500)
      });
    }
    logger.debug('⬅️ Respuesta de Ventas - Status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: 'Error en login de Ventas',
        ventasError: responseData
      });
    }

    req.session.ventasJWT = responseData.accessToken;
    req.session.ventasUserData = {
      id: responseData.id,
      username: responseData.username,
      role: responseData.role,
      nombreAgente: responseData.nombreAgente,
      campaign: responseData.campaign,
      loggedIn: true,
      timestamp: new Date().toISOString()
    };

    const setCookie = response.headers.raw ? response.headers.raw()['set-cookie'] : response.headers.get('set-cookie');
    if (setCookie) {
      if (Array.isArray(setCookie)) {
        ventasSessionCookie = setCookie.map(sc => sc.split(';')[0]).join('; ');
      } else if (typeof setCookie === 'string') {
        ventasSessionCookie = setCookie.split(';')[0];
      }
      req.session.ventasSessionCookie = ventasSessionCookie;
      logger.debug('✅ Cookie de sesión de Ventas guardada:', ventasSessionCookie);
    } else {
      req.session.ventasSessionCookie = null;
      logger.warn('⚠️ No se recibió cookie de sesión de Ventas en login.');
    }

    req.session.save((err) => {
      if (err) {
        console.error('❌ Error guardando sesión:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Error guardando sesión' 
        });
      }
      
      logger.info('✅ Sesión guardada exitosamente con JWT y cookie de sesión de Ventas');
      
      res.json({ 
        success: true, 
        ventasRespuesta: responseData,
        sessionCreated: true,
        sessionId: req.sessionID,
        usingJWT: true,
        ventasSessionCookie: ventasSessionCookie
      });
    });

  } catch (error) {
    logger.error('❌ Error proxy ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

exports.ventasAutoLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    logger.debug('🔐 AUTO-LOGIN VENTAS - Username:', username);
    
    if (!username || !password) {
      return res.status(400).send(`
        <html>
          <body>
            <p>Error: Credenciales faltantes</p>
          </body>
        </html>
      `);
    }
    
    try {
      // Crear un formulario HTML que se enviará automáticamente a Ventas
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Iniciando sesión...</title>
        </head>
        <body>
            <form id="ventasForm" method="POST" action="https://ventas.ardabytec.vip/" style="display:none;">
                <input type="text" name="username" value="${username}">
                <input type="password" name="password" value="${password}">
                <button type="submit">Acceder</button>
            </form>
            <p>Redirigiendo a Ventas...</p>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    setTimeout(function() {
                        document.getElementById('ventasForm').submit();
                    }, 500);
                });
            </script>
        </body>
        </html>
      `;
      
      logger.info('✅ Auto-login form generado para:', username);
      res.send(htmlResponse);
      
    } catch (fetchError) {
      logger.error('❌ Error en auto-login ventas:', fetchError.message);
      return res.status(500).send(`
        <html>
          <body>
            <p>Error procesando auto-login</p>
            <script>window.location.href = 'https://ventas.ardabytec.vip/';</script>
          </body>
        </html>
      `);
    }
  } catch (error) {
    logger.error('❌ Error en auto-login ventas:', error);
    res.status(500).send(`
      <html>
        <body>
          <p>Error: ${error.message}</p>
          <script>window.location.href = 'https://ventas.ardabytec.vip/';</script>
        </body>
      </html>
    `);
  }
};

// Busca credenciales del usuario en plata_prospectPRO por nombreAgente
// y hace login en el backend de ventas, devolviendo el accessToken
exports.intranetVentasLogin = async (req, res) => {
  try {
    const intranetToken = req.headers['x-intranet-token'];
    if (!intranetToken) {
      return res.status(400).json({ success: false, message: 'Token de intranet requerido' });
    }

    // Verificar el JWT de intranet para obtener el nombre del usuario
    const jwtSecret = process.env.JWT_SECRET || 'intranet_secret_key';
    let payload;
    try {
      payload = jwt.verify(intranetToken, jwtSecret);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Token de intranet inválido' });
    }

    // El JWT tiene el id del usuario — buscar el nombre en la BD de intranet
    const userId = payload.id || payload.user || payload.sub;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'No se pudo obtener el ID del usuario del token' });
    }

    const pool = await databaseService.getPool(payload.empresa);
    const intranetResult = await pool.request()
      .input('id', sql.Int, Number(userId))
      .query(`SELECT TOP 1 NEUS_NOMBRES FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @id`);

    const nombreIntranet = intranetResult.recordset[0]?.NEUS_NOMBRES || '';
    if (!nombreIntranet) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado en intranet' });
    }

    logger.info(`[intranetVentasLogin] Buscando en ventas por nombre: "${nombreIntranet}"`);

    // Conectar a plata_prospectPRO y buscar por nombreAgente
    const ventasDbConfig = require('../config/database_ventas');
    const sqlVentas = require('mssql');
    const ventasPool = await new sqlVentas.ConnectionPool(ventasDbConfig).connect();

    let ventasUser;
    try {
      const result = await ventasPool.request()
        .input('nombre', sqlVentas.NVarChar, nombreIntranet.trim())
        .query(`
          SELECT TOP 1 username, [password], nombreAgente
          FROM dbo.Users
          WHERE LTRIM(RTRIM(nombreAgente)) COLLATE Latin1_General_CI_AI
              = LTRIM(RTRIM(@nombre))    COLLATE Latin1_General_CI_AI
        `);
      ventasUser = result.recordset[0];
    } finally {
      try { await ventasPool.close(); } catch (_) {}
    }

    if (!ventasUser) {
      logger.warn(`[intranetVentasLogin] No se encontró usuario en ventas para nombre: "${nombreIntranet}"`);
      return res.status(404).json({ success: false, message: 'Usuario no encontrado en el sistema de ventas' });
    }

    logger.info(`[intranetVentasLogin] Credenciales encontradas para: ${ventasUser.username}`);

    // Hacer login en el backend de ventas con esas credenciales
    const ventasLoginUrl = 'https://ventas.ardabytec.vip:8443/api/auth/login';
    const loginResp = await fetch(ventasLoginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username: ventasUser.username, password: ventasUser.password }),
    });

    if (!loginResp.ok) {
      const errBody = await loginResp.text();
      logger.warn(`[intranetVentasLogin] Login ventas falló ${loginResp.status}: ${errBody.substring(0, 200)}`);
      return res.status(loginResp.status).json({ success: false, message: 'Login en ventas falló', detail: errBody.substring(0, 200) });
    }

    const loginData = await loginResp.json();
    const accessToken = loginData.accessToken || loginData.token || loginData.access_token
      || loginData.data?.accessToken || null;

    if (!accessToken) {
      return res.status(500).json({ success: false, message: 'Ventas no devolvió accessToken', raw: loginData });
    }

    logger.info(`[intranetVentasLogin] ✅ Token obtenido para ${ventasUser.username}`);
    return res.json({ success: true, accessToken, username: ventasUser.username });

  } catch (err) {
    logger.error('[intranetVentasLogin] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.ventasStatus = (req, res) => {
  const ventasSessionCookie = req.session.ventasSessionCookie;
  res.json({
    success: true,
    hasSession: !!ventasSessionCookie,
    sessionInfo: ventasSessionCookie ? 'Sesión activa' : 'No hay sesión'
  });
};

exports.logout = async (req, res) => {
  try {
    logger.debug('🔓 LOGOUT - Session ID:', req.sessionID);

    // Revocar el token con el que se llamó a /logout. A partir de aquí, cualquier
    // pestaña de AGYDA que siguiera abierta con ese mismo token cae al login en
    // su siguiente request. Lo dispara "Cerrar sesión" en la página pública.
    try {
      const authHeader = req.headers['authorization'] || '';
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
      const token = bearer || req.headers['x-access-token'] || req.headers['token']
        || (req.query && (req.query.token || req.query.access_token)) || '';
      if (token) revokeToken(token);
    } catch (e) {
      console.warn('⚠️ No se pudo revocar el token en logout:', e && e.message);
    }

    // Limpiar sesión de proxy/ventas
    req.session.ventasSessionCookie = null;
    req.session.ventasSessionData = null;

    // Si la ruta fue llamada con token (authenticateToken), cerrar registro de presencia
    try {
      const userId = req.user && (req.user.id || req.user.user || req.user.sub);
      if (userId) {
        const pool = await databaseService.getPool(req.user?.empresa);
        await pool.request().input('id', sql.Int, Number(userId)).query(`
          UPDATE USUARIO_TIEMPOS
          SET FECHA_FIN = GETDATE()
          WHERE NEUS_ID = @id AND FECHA_FIN IS NULL
        `);
        logger.debug(`✅ Cerrado registro de presencia (USUARIO_TIEMPOS) para usuario=${userId}`);
        try {
          const io = socketService.getIO(req.user?.empresa);
          const payload = { userId: Number(userId), status: 'offline' };
          io.emit('presence:update', payload);
          io.emit('presence:updated', payload);
          io.to(`user:${Number(userId)}`).emit('presence:update', payload);
          io.to(`user:${Number(userId)}`).emit('presence:updated', payload);
          logger.debug(`📣 Emitido presence:update offline para usuario=${userId}`);
        } catch (e) {}
      }
    } catch (e) {
      console.warn('⚠️ Error cerrando registro de presencia en logout:', e && e.message);
    }

    req.session.save(() => {
      res.json({ success: true, message: 'Sesión de Ventas limpia y presencia cerrada (si corresponde)' });
    });
  } catch (e) {
    res.json({ success: true, message: 'Sesión de Ventas limpia en proxy' });
  }
};

exports.debugSession = (req, res) => {
  logger.debug('🔍 DEBUG SESSION - Session ID:', req.sessionID);
  logger.debug('🔍 DEBUG SESSION - Session data:', JSON.stringify(req.session));
  logger.debug('🔍 DEBUG SESSION - Ventas cookie:', req.session.ventasSessionCookie);
  
  res.json({
    sessionId: req.sessionID,
    hasVentasCookie: !!req.session.ventasSessionCookie,
    ventasCookie: req.session.ventasSessionCookie ? 'PRESENTE' : 'NO EXISTE',
    sessionData: req.session
  });
};

// 🔄 REFRESH TOKEN PARA VENTAS
exports.refreshVentasToken = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }
    
    logger.debug('🔄 Refrescando token de Ventas para:', username);
    
    try {
      // Llamar a Ventas API para obtener nuevo token
      const response = await fetch('https://ventas.ardabytec.vip:8443/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });
      
      logger.debug('📡 Respuesta Ventas API:', response.status);
      
      if (response.status === 200) {
        const responseData = await response.json();
        logger.debug('✅ Token refrescado para:', username);
        
        // Guardar token en sesión si es necesario
        if (responseData.accessToken) {
          req.session.ventasToken = responseData.accessToken;
          logger.debug('💾 Token guardado en sesión');
        }
        
        return res.json({
          success: true,
          data: {
            accessToken: responseData.accessToken || responseData.data?.accessToken,
            token: responseData.token,
            username: responseData.username,
            message: 'Token refrescado exitosamente'
          }
        });
      } else {
        const errorBody = await response.text();
        logger.warn('⚠️ Error refrescando token:', response.status, errorBody);
        return res.status(response.status).json({
          success: false,
          message: 'Error al refrescar token en Ventas',
          details: errorBody
        });
      }
    } catch (fetchError) {
      logger.error('❌ Error llamando Ventas API:', fetchError.message);
      return res.status(500).json({
        success: false,
        message: 'Error conectando con Ventas',
        error: fetchError.message
      });
    }
  } catch (error) {
    logger.error('❌ Error en refreshVentasToken:', error);
    res.status(500).json({
      success: false,
      message: 'Error refrescando token',
      error: error.message
    });
  }
};

exports.proxyVentas = async (req, res) => {
  try {
    logger.debug('📡 Solicitud a /proxy/ventas:', req.path);
    let ventasSessionCookie = req.session.ventasSessionCookie;
    
    const proxiedPath = req.path.replace('/proxy/ventas', '') || '/';
    const targetUrl = `https://ventas.ardabytec.vip${proxiedPath}`;
    logger.debug('➡️ Redirigiendo a:', targetUrl);

    const response = await fetch(targetUrl, {
      headers: {
        ...(ventasSessionCookie ? { 'Cookie': ventasSessionCookie } : {}),
        'User-Agent': req.headers['user-agent'] || '',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Encoding': 'identity'
      },
      redirect: 'follow'
    });

    if (response.status === 401 || response.status === 403) {
      logger.warn('⚠️ Ventas devolvió', response.status, 'para', targetUrl);
    }

    const ct = response.headers.get('content-type') || '';
    res.status(response.status);
    if (ct) res.set('content-type', ct);

    const buffer = await response.arrayBuffer();
    const textDecodable = ct.includes('text') || ct.includes('javascript') || ct.includes('json');

    if (textDecodable) {
      const text = Buffer.from(buffer).toString('utf-8');
      const rewritten = rewriteVentasContent(text, ct);
      return res.send(rewritten);
    }

    return res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('❌ Error proxy /proxy/ventas:', error);
    res.status(500).json({ success: false, message: 'Error al cargar recurso de Ventas', error: error.message });
  }
};

exports.proxyVentasApi = async (req, res) => {
  try {
    const ventasSessionCookie = req.session.ventasSessionCookie;
    if (!ventasSessionCookie) {
      return res.status(401).json({ success: false, message: 'No hay sesión activa en Ventas' });
    }

    const apiPath = req.path.replace('/proxy/ventas_api', '') || '/';
    const targetUrl = `https://ventas.ardabytec.vip:8443${apiPath}`;
    const method = req.method;

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const k = key.toLowerCase();
      if (['host', 'content-length', 'connection'].includes(k)) continue;
      headers[k] = Array.isArray(value) ? value.join(', ') : value;
    }
    headers['cookie'] = ventasSessionCookie;
    if (!headers['accept']) headers['accept'] = '*/*';
    if (!headers['user-agent']) headers['user-agent'] = req.headers['user-agent'] || '';

    const body = ['GET', 'HEAD'].includes(method) ? undefined : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const response = await fetch(targetUrl, { method, headers, body });

    res.status(response.status);
    const ct = response.headers.get('content-type');
    if (ct) res.set('content-type', ct);

    const buf = await response.arrayBuffer();
    return res.send(Buffer.from(buf));

  } catch (error) {
    console.error('❌ Error proxy /proxy/ventas_api:', error);
    res.status(500).json({ success: false, message: 'Error en proxy de API Ventas', detalle: error.message });
  }
};
