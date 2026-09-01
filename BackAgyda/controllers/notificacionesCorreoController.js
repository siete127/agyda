const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { PERMISOS_MAIL_TO } = require('../config/email');
const emailService = require('../services/emailService');

// Módulos que notifican a un grupo configurable de usuarios por correo.
const MODULOS = [
  { key: 'permisos',      nombre: 'Nueva solicitud de permiso',    descripcion: 'Se notifica cuando un usuario solicita un permiso' },
  { key: 'vacaciones',    nombre: 'Nueva solicitud de vacaciones', descripcion: 'Se notifica cuando un usuario solicita vacaciones o permiso con goce' },
  { key: 'posible_baja',  nombre: 'Alerta de posible baja',        descripcion: 'Se notifica cuando un empleado acumula faltas consecutivas' },
];

let seeded = false;

async function ensureTabla(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='NOTIFICACIONES_CORREO_DESTINATARIOS')
    CREATE TABLE NOTIFICACIONES_CORREO_DESTINATARIOS (
      NCD_ID       INT IDENTITY PRIMARY KEY,
      NCD_MODULO   NVARCHAR(30) NOT NULL,
      NCD_USUARIO_ID INT NOT NULL,
      CONSTRAINT UQ_NOTIF_CORREO_MOD_USR UNIQUE (NCD_MODULO, NCD_USUARIO_ID)
    )
  `);
}

// Siembra inicial una sola vez: migra ASISTENCIA_BAJAS_DESTINATARIOS a
// 'posible_baja', y resuelve PERMISOS_MAIL_TO (correos del .env) a usuarios
// existentes por NEUS_CORREO para 'permisos' y 'vacaciones'. Si la tabla ya
// tiene filas para un módulo, no se vuelve a sembrar (el admin ya lo gestionó).
async function seedInicial(pool) {
  if (seeded) return;
  seeded = true;
  try {
    const countR = await pool.request().query('SELECT COUNT(*) c FROM NOTIFICACIONES_CORREO_DESTINATARIOS');
    if (countR.recordset[0].c > 0) return;

    const tieneBajas = await pool.request().query(
      "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ASISTENCIA_BAJAS_DESTINATARIOS'"
    );
    if (tieneBajas.recordset.length > 0) {
      const bajasR = await pool.request().query('SELECT NEUS_ID as id FROM ASISTENCIA_BAJAS_DESTINATARIOS');
      for (const r of bajasR.recordset) {
        await pool.request()
          .input('mod', sql.NVarChar, 'posible_baja')
          .input('uid', sql.Int, r.id)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid)
            INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID) VALUES (@mod, @uid)
          `);
      }
    }

    if (PERMISOS_MAIL_TO.length > 0) {
      const placeholders = PERMISOS_MAIL_TO.map((_, i) => `@c${i}`).join(',');
      const req = pool.request();
      PERMISOS_MAIL_TO.forEach((c, i) => req.input(`c${i}`, sql.NVarChar, c));
      const usuariosR = await req.query(
        `SELECT NEUS_ID as id FROM NEUS_USUARIOS WHERE NEUS_CORREO IN (${placeholders})`
      );
      for (const mod of ['permisos', 'vacaciones']) {
        for (const r of usuariosR.recordset) {
          await pool.request()
            .input('mod', sql.NVarChar, mod)
            .input('uid', sql.Int, r.id)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid)
              INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID) VALUES (@mod, @uid)
            `);
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ [notificacionesCorreo] Error en seed inicial:', e.message);
  }
}

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

// ── Servidor de correo (credenciales SMTP / Microsoft Graph) ─────────────
// Fila única por tenant — reemplaza las variables de entorno SMTP_*/AZURE_*
// para que sean editables desde Configuración sin tocar .env ni reiniciar
// el servidor. Client secret se guarda en texto plano (misma limitación que
// TI_INTEGRACIONES_CONFIG en otros módulos del proyecto) — aceptable porque
// el acceso a este endpoint ya está restringido a AD/TI.
async function ensureTablaServidor(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='EMAIL_SERVIDOR_CONFIG')
    CREATE TABLE EMAIL_SERVIDOR_CONFIG (
      ESC_ID            INT IDENTITY PRIMARY KEY,
      ESC_HABILITADO    BIT NOT NULL DEFAULT 0,
      ESC_TIPO          NVARCHAR(10) NOT NULL DEFAULT 'smtp',
      ESC_SMTP_HOST     NVARCHAR(150) NULL,
      ESC_SMTP_PORT     INT NULL,
      ESC_SMTP_SECURE   BIT NOT NULL DEFAULT 1,
      ESC_SMTP_USER     NVARCHAR(150) NULL,
      ESC_SMTP_PASS     NVARCHAR(300) NULL,
      ESC_TENANT_ID     NVARCHAR(100) NULL,
      ESC_CLIENT_ID     NVARCHAR(100) NULL,
      ESC_CLIENT_SECRET NVARCHAR(300) NULL,
      ESC_BUZON_REMITENTE NVARCHAR(150) NULL,
      ESC_CORREO_FROM   NVARCHAR(150) NULL,
      ESC_NOMBRE_REMITENTE NVARCHAR(100) NULL,
      ESC_FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

function mapFilaServidor(r) {
  if (!r) return null;
  return {
    habilitado: !!r.ESC_HABILITADO,
    tipo: r.ESC_TIPO,
    smtpHost: r.ESC_SMTP_HOST,
    smtpPort: r.ESC_SMTP_PORT,
    smtpSecure: !!r.ESC_SMTP_SECURE,
    smtpUser: r.ESC_SMTP_USER,
    smtpPass: r.ESC_SMTP_PASS,
    tenantId: r.ESC_TENANT_ID,
    clientId: r.ESC_CLIENT_ID,
    clientSecret: r.ESC_CLIENT_SECRET,
    buzonRemitente: r.ESC_BUZON_REMITENTE,
    correoFrom: r.ESC_CORREO_FROM,
    nombreRemitente: r.ESC_NOMBRE_REMITENTE,
  };
}

// Usada por server.js al arrancar (antes de que exista req) — por eso acepta
// tenantKey directo en vez de leerlo de req.user.
async function getConfigServidorCorreo(tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  await ensureTablaServidor(pool);
  const r = await pool.request().query('SELECT TOP 1 * FROM EMAIL_SERVIDOR_CONFIG ORDER BY ESC_ID DESC');
  return mapFilaServidor(r.recordset[0]);
}

// GET — trae la config guardada. El client secret / password NO se regresan
// tal cual al frontend (solo un booleano "yaConfigurado") para no exponer el
// secreto en cada carga de pantalla; el admin debe volver a escribirlo si
// quiere cambiarlo (igual que un password field típico).
exports.getServidorConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTablaServidor(pool);
    const r = await pool.request().query('SELECT TOP 1 * FROM EMAIL_SERVIDOR_CONFIG ORDER BY ESC_ID DESC');
    const row = mapFilaServidor(r.recordset[0]);
    if (!row) return res.json({ success: true, data: null });

    return res.json({
      success: true,
      data: {
        habilitado: row.habilitado,
        tipo: row.tipo,
        smtpHost: row.smtpHost,
        smtpPort: row.smtpPort,
        smtpSecure: row.smtpSecure,
        smtpUser: row.smtpUser,
        smtpPassConfigurado: Boolean(row.smtpPass),
        tenantId: row.tenantId,
        clientId: row.clientId,
        clientSecretConfigurado: Boolean(row.clientSecret),
        buzonRemitente: row.buzonRemitente,
        correoFrom: row.correoFrom,
        nombreRemitente: row.nombreRemitente,
        transporteActivo: emailService.getTransporteActivo(),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// PUT — guarda la config y recarga el transporte de correo en caliente (sin
// reiniciar el proceso). Si smtpPass/clientSecret vienen vacíos en el body,
// conserva el valor guardado anteriormente (patrón "no lo mando de vuelta,
// no lo borres" — evita que la UI tenga que reenviar el secreto en cada
// guardado de un campo que no lo tocó).
exports.saveServidorConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTablaServidor(pool);

    const existenteR = await pool.request().query('SELECT TOP 1 * FROM EMAIL_SERVIDOR_CONFIG ORDER BY ESC_ID DESC');
    const existente = mapFilaServidor(existenteR.recordset[0]);

    const body = req.body || {};
    const tipo = body.tipo === 'graph' ? 'graph' : 'smtp';
    const smtpPass = body.smtpPass ? String(body.smtpPass) : (existente?.smtpPass || null);
    const clientSecret = body.clientSecret ? String(body.clientSecret) : (existente?.clientSecret || null);

    const reqDb = pool.request()
      .input('habilitado', sql.Bit, !!body.habilitado)
      .input('tipo', sql.NVarChar, tipo)
      .input('smtpHost', sql.NVarChar, body.smtpHost || null)
      .input('smtpPort', sql.Int, body.smtpPort ? Number(body.smtpPort) : null)
      .input('smtpSecure', sql.Bit, body.smtpSecure !== false)
      .input('smtpUser', sql.NVarChar, body.smtpUser || null)
      .input('smtpPass', sql.NVarChar, smtpPass)
      .input('tenantId', sql.NVarChar, body.tenantId || null)
      .input('clientId', sql.NVarChar, body.clientId || null)
      .input('clientSecret', sql.NVarChar, clientSecret)
      .input('buzonRemitente', sql.NVarChar, body.buzonRemitente || null)
      .input('correoFrom', sql.NVarChar, body.correoFrom || null)
      .input('nombreRemitente', sql.NVarChar, body.nombreRemitente || null);

    if (existenteR.recordset.length) {
      await reqDb.query(`
        UPDATE EMAIL_SERVIDOR_CONFIG SET
          ESC_HABILITADO=@habilitado, ESC_TIPO=@tipo,
          ESC_SMTP_HOST=@smtpHost, ESC_SMTP_PORT=@smtpPort, ESC_SMTP_SECURE=@smtpSecure,
          ESC_SMTP_USER=@smtpUser, ESC_SMTP_PASS=@smtpPass,
          ESC_TENANT_ID=@tenantId, ESC_CLIENT_ID=@clientId, ESC_CLIENT_SECRET=@clientSecret,
          ESC_BUZON_REMITENTE=@buzonRemitente, ESC_CORREO_FROM=@correoFrom, ESC_NOMBRE_REMITENTE=@nombreRemitente,
          ESC_FECHA_ACTUALIZACION=GETDATE()
      `);
    } else {
      await reqDb.query(`
        INSERT INTO EMAIL_SERVIDOR_CONFIG (
          ESC_HABILITADO, ESC_TIPO, ESC_SMTP_HOST, ESC_SMTP_PORT, ESC_SMTP_SECURE,
          ESC_SMTP_USER, ESC_SMTP_PASS, ESC_TENANT_ID, ESC_CLIENT_ID, ESC_CLIENT_SECRET,
          ESC_BUZON_REMITENTE, ESC_CORREO_FROM, ESC_NOMBRE_REMITENTE
        ) VALUES (
          @habilitado, @tipo, @smtpHost, @smtpPort, @smtpSecure,
          @smtpUser, @smtpPass, @tenantId, @clientId, @clientSecret,
          @buzonRemitente, @correoFrom, @nombreRemitente
        )
      `);
    }

    // Recarga en caliente: la próxima notificación ya usa la config nueva.
    const nuevaConfig = await getConfigServidorCorreo(req.user?.empresa);
    emailService.initialize(nuevaConfig);

    return res.json({ success: true, transporteActivo: emailService.getTransporteActivo() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST — envía un correo de prueba con la config actualmente activa (la que
// ya está cargada en memoria, sea de BD o de .env) para validar que
// realmente funciona antes de confiar en ella.
exports.enviarPrueba = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { correo } = req.body || {};
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ success: false, message: 'Correo destino inválido' });
    }
    const result = await emailService.sendTestEmail(correo);
    if (!result.success) return res.status(500).json(result);
    return res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Estado completo para la pantalla de administración: por cada módulo, la
// lista de usuarios activos con su correo (o null si no tienen) y si están
// marcados como destinatarios de ese módulo.
exports.getConfiguracion = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTabla(pool);
    await seedInicial(pool);

    const usuariosR = await pool.request().query(`
      SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_TIPOUSUARIO as tipoUsuario, NEUS_CORREO as correo
      FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 ORDER BY NEUS_NOMBRES
    `);
    const destR = await pool.request().query('SELECT NCD_MODULO as modulo, NCD_USUARIO_ID as usuarioId FROM NOTIFICACIONES_CORREO_DESTINATARIOS');

    const porModulo = {};
    for (const m of MODULOS) porModulo[m.key] = new Set();
    for (const d of destR.recordset) {
      if (porModulo[d.modulo]) porModulo[d.modulo].add(d.usuarioId);
    }

    return res.json({
      success: true,
      data: {
        modulos: MODULOS,
        usuarios: usuariosR.recordset,
        destinatarios: Object.fromEntries(
          Object.entries(porModulo).map(([k, set]) => [k, [...set]])
        ),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Marca/desmarca un usuario como destinatario de un módulo.
exports.setDestinatario = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { modulo, usuarioId } = req.params;
    const { activo } = req.body || {};
    if (!MODULOS.some((m) => m.key === modulo)) return res.status(400).json({ success: false, message: 'Módulo inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTabla(pool);

    if (activo) {
      await pool.request()
        .input('mod', sql.NVarChar, modulo)
        .input('uid', sql.Int, Number(usuarioId))
        .query(`
          IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid)
          INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID) VALUES (@mod, @uid)
        `);
    } else {
      await pool.request()
        .input('mod', sql.NVarChar, modulo)
        .input('uid', sql.Int, Number(usuarioId))
        .query('DELETE FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid');
    }
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Actualiza el correo de un usuario (para cuando falta o está mal capturado).
exports.setCorreoUsuario = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { usuarioId } = req.params;
    const { correo } = req.body || {};
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ success: false, message: 'Correo inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('uid', sql.Int, Number(usuarioId))
      .input('correo', sql.NVarChar, correo.trim())
      .query('UPDATE NEUS_USUARIOS SET NEUS_CORREO=@correo WHERE NEUS_ID=@uid');
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Resuelve destinatarios (correo) de un módulo — usado por emailService al
// disparar cada notificación. Solo incluye usuarios con correo capturado.
async function getDestinatariosCorreo(modulo, tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  await ensureTabla(pool);
  await seedInicial(pool);
  const r = await pool.request()
    .input('mod', sql.NVarChar, modulo)
    .query(`
      SELECT nu.NEUS_CORREO as correo
      FROM NOTIFICACIONES_CORREO_DESTINATARIOS d
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = d.NCD_USUARIO_ID
      WHERE d.NCD_MODULO = @mod AND nu.NEUS_ACTIVO = 1 AND nu.NEUS_CORREO IS NOT NULL AND nu.NEUS_CORREO <> ''
    `);
  return r.recordset.map((row) => row.correo);
}

// Igual que getDestinatariosCorreo, pero devuelve también el usuarioId — para
// módulos que además crean una notificación in-app por cada destinatario
// (p. ej. posible_baja), sin filtrar por si tienen correo o no.
async function getDestinatariosUsuarios(modulo, tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  await ensureTabla(pool);
  await seedInicial(pool);
  const r = await pool.request()
    .input('mod', sql.NVarChar, modulo)
    .query(`
      SELECT nu.NEUS_ID as id, nu.NEUS_CORREO as correo
      FROM NOTIFICACIONES_CORREO_DESTINATARIOS d
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = d.NCD_USUARIO_ID
      WHERE d.NCD_MODULO = @mod AND nu.NEUS_ACTIVO = 1
    `);
  return r.recordset;
}

module.exports.getDestinatariosCorreo = getDestinatariosCorreo;
module.exports.getDestinatariosUsuarios = getDestinatariosUsuarios;
module.exports.getConfigServidorCorreo = getConfigServidorCorreo;
