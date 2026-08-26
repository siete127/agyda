const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { encryptText, decryptText } = require('../utils/crypto');

// Credenciales REALES de cada agente en VICIdial — una fila por (agente, vista),
// ya que cada vista de Webphone (WEBPHONE_VISTAS) puede apuntar a un servidor
// VICIdial distinto (Azul Dial, Web21 RC9, etc.) con credenciales propias.
// El login real de vicidial.php es solo usuario+contraseña+campaña (sin
// extensión SIP separada). Se guardan cifradas (AES-256-GCM, ver utils/crypto.js)
// porque se necesitan recuperables en texto plano para auto-loguear al agente
// en el iframe (vicidial_redirect.php).
// Ambos pasos (migración + creación) corren en secuencia estricta dentro de
// una sola promesa — antes vivían en dos bloques `.then()` independientes sin
// await entre ellos, lo que generaba una condición de carrera real: el DROP de
// migración y el CREATE podían ejecutarse en cualquier orden relativo entre
// reinicios, dejando la tabla sin crear en algunos arranques.
async function ensureSchema(tenantKey) {
  const pool = await databaseService.getPool(tenantKey);

  // Migración: tablas creadas antes de que existiera WCRE_VISTA_ID (esquema
  // previo, por agente sin distinguir vista) — se recrean vacías porque no hay
  // forma segura de inferir a qué vista pertenecía cada fila vieja.
  await pool.request().query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WEBPHONE_CREDENCIALES')
       AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='WEBPHONE_CREDENCIALES' AND COLUMN_NAME='WCRE_VISTA_ID')
    BEGIN
      DROP TABLE WEBPHONE_CREDENCIALES;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WEBPHONE_CREDENCIALES')
    CREATE TABLE WEBPHONE_CREDENCIALES (
      WCRE_ID           INT IDENTITY PRIMARY KEY,
      WCRE_NEUS_ID      SMALLINT NOT NULL,
      WCRE_VISTA_ID     INT NOT NULL,
      WCRE_VD_LOGIN     NVARCHAR(100) NOT NULL,
      WCRE_VD_PASS      NVARCHAR(500) NOT NULL,
      WCRE_CAMPANA      NVARCHAR(100) NULL,
      WCRE_FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE(),
      CONSTRAINT FK_WCRE_NEUS FOREIGN KEY (WCRE_NEUS_ID) REFERENCES NEUS_USUARIOS(NEUS_ID),
      CONSTRAINT FK_WCRE_VISTA FOREIGN KEY (WCRE_VISTA_ID) REFERENCES WEBPHONE_VISTAS(WVIS_ID) ON DELETE CASCADE,
      CONSTRAINT UQ_WCRE_NEUS_VISTA UNIQUE (WCRE_NEUS_ID, WCRE_VISTA_ID)
    )
  `);
}

require('../config/tenants').listTenants().forEach(({ key }) => {
  ensureSchema(key).catch((e) => {
    console.error(`⚠️ No se pudo asegurar el esquema de WEBPHONE_CREDENCIALES (empresa: ${key}):`, e.message);
  });
});

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || req.headers['tipousuario'] || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

// Lista todos los agentes con sus credenciales por cada vista configurada
// (matriz agente x vista). NUNCA se devuelve la contraseña, solo si existe.
exports.getCredenciales = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const usuarios = await pool.request().query(`
      SELECT NEUS_ID as neusId, NEUS_NOMBRES as nombre, NEUS_USUARIO as usuarioAgyda, NEUS_TIPOUSUARIO as tipoUsuario
      FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 ORDER BY NEUS_NOMBRES
    `);
    const vistas = await pool.request().query(`SELECT WVIS_ID as id, WVIS_LABEL as label FROM WEBPHONE_VISTAS ORDER BY WVIS_ORDEN`);
    const creds = await pool.request().query(`
      SELECT WCRE_NEUS_ID as neusId, WCRE_VISTA_ID as vistaId, WCRE_VD_LOGIN as vdLogin, WCRE_CAMPANA as campana
      FROM WEBPHONE_CREDENCIALES
    `);

    const credMap = new Map();
    for (const c of creds.recordset) credMap.set(`${c.neusId}:${c.vistaId}`, c);

    const data = usuarios.recordset.map((u) => ({
      neusId: u.neusId,
      nombre: u.nombre,
      usuarioAgyda: u.usuarioAgyda,
      tipoUsuario: u.tipoUsuario,
      credencialesPorVista: vistas.recordset.map((v) => {
        const c = credMap.get(`${u.neusId}:${v.id}`);
        return {
          vistaId: v.id,
          vistaLabel: v.label,
          vdLogin: c?.vdLogin ?? null,
          campana: c?.campana ?? null,
          tieneCredenciales: !!c,
        };
      }),
    }));

    return res.json({ success: true, data, vistas: vistas.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Crea o actualiza las credenciales de un agente para una vista específica.
// La contraseña solo se sobreescribe si viene no-vacía.
exports.upsertCredencial = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });

    const neusId = Number(req.params.neusId);
    const vistaId = Number(req.params.vistaId);
    if (!Number.isFinite(neusId) || neusId <= 0 || !Number.isFinite(vistaId) || vistaId <= 0) {
      return res.status(400).json({ success: false, message: 'neusId/vistaId inválidos' });
    }

    const { vdLogin, vdPass, campana } = req.body || {};
    if (!vdLogin || !String(vdLogin).trim()) {
      return res.status(400).json({ success: false, message: 'vdLogin es requerido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const existe = await pool.request()
      .input('nid', sql.Int, neusId)
      .input('vid', sql.Int, vistaId)
      .query('SELECT WCRE_ID FROM WEBPHONE_CREDENCIALES WHERE WCRE_NEUS_ID=@nid AND WCRE_VISTA_ID=@vid');

    const vdPassEnc = vdPass && String(vdPass).trim() ? encryptText(String(vdPass).trim()) : null;
    const campanaVal = campana ? String(campana).trim() : null;

    if (existe.recordset.length > 0) {
      if (!vdPassEnc) {
        await pool.request()
          .input('nid', sql.Int, neusId)
          .input('vid', sql.Int, vistaId)
          .input('login', sql.NVarChar, String(vdLogin).trim())
          .input('camp', sql.NVarChar, campanaVal)
          .query(`
            UPDATE WEBPHONE_CREDENCIALES SET
              WCRE_VD_LOGIN = @login,
              WCRE_CAMPANA = @camp,
              WCRE_FECHA_ACTUALIZACION = GETDATE()
            WHERE WCRE_NEUS_ID = @nid AND WCRE_VISTA_ID = @vid
          `);
      } else {
        await pool.request()
          .input('nid', sql.Int, neusId)
          .input('vid', sql.Int, vistaId)
          .input('login', sql.NVarChar, String(vdLogin).trim())
          .input('pass', sql.NVarChar, vdPassEnc)
          .input('camp', sql.NVarChar, campanaVal)
          .query(`
            UPDATE WEBPHONE_CREDENCIALES SET
              WCRE_VD_LOGIN = @login,
              WCRE_VD_PASS = @pass,
              WCRE_CAMPANA = @camp,
              WCRE_FECHA_ACTUALIZACION = GETDATE()
            WHERE WCRE_NEUS_ID = @nid AND WCRE_VISTA_ID = @vid
          `);
      }
    } else {
      if (!vdPassEnc) {
        return res.status(400).json({ success: false, message: 'vdPass es requerido para crear nuevas credenciales' });
      }
      await pool.request()
        .input('nid', sql.Int, neusId)
        .input('vid', sql.Int, vistaId)
        .input('login', sql.NVarChar, String(vdLogin).trim())
        .input('pass', sql.NVarChar, vdPassEnc)
        .input('camp', sql.NVarChar, campanaVal)
        .query(`
          INSERT INTO WEBPHONE_CREDENCIALES (WCRE_NEUS_ID, WCRE_VISTA_ID, WCRE_VD_LOGIN, WCRE_VD_PASS, WCRE_CAMPANA)
          VALUES (@nid, @vid, @login, @pass, @camp)
        `);
    }

    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteCredencial = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const neusId = Number(req.params.neusId);
    const vistaId = Number(req.params.vistaId);
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('nid', sql.Int, neusId)
      .input('vid', sql.Int, vistaId)
      .query('DELETE FROM WEBPHONE_CREDENCIALES WHERE WCRE_NEUS_ID=@nid AND WCRE_VISTA_ID=@vid');
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Devuelve la URL de auto-login (vicidial_redirect.php) para el usuario
// autenticado actual, en la vista indicada — o null si no tiene credenciales
// guardadas para esa vista. Se usa desde el propio WebphoneFrame del agente,
// no requiere ser admin (cada quien solo puede pedir su propia URL).
exports.getAutoLoginUrl = async (req, res) => {
  try {
    const neusId = Number(req.user?.id);
    const vistaId = Number(req.query.vistaId);
    if (!Number.isFinite(neusId) || neusId <= 0 || !Number.isFinite(vistaId) || vistaId <= 0) {
      return res.status(400).json({ success: false, message: 'vistaId inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const vistaR = await pool.request()
      .input('vid', sql.Int, vistaId)
      .query('SELECT WVIS_URL as url FROM WEBPHONE_VISTAS WHERE WVIS_ID=@vid');
    const vistaUrl = vistaR.recordset[0]?.url;
    if (!vistaUrl) return res.json({ success: true, url: null });

    const credR = await pool.request()
      .input('nid', sql.Int, neusId)
      .input('vid', sql.Int, vistaId)
      .query('SELECT WCRE_VD_LOGIN as vdLogin, WCRE_VD_PASS as vdPass, WCRE_CAMPANA as campana FROM WEBPHONE_CREDENCIALES WHERE WCRE_NEUS_ID=@nid AND WCRE_VISTA_ID=@vid');
    const cred = credR.recordset[0];
    if (!cred) return res.json({ success: true, url: null });

    const base = vistaUrl.replace(/\/+$/, '');
    const params = new URLSearchParams({
      VD_login: cred.vdLogin,
      VD_pass: decryptText(cred.vdPass),
    });
    if (cred.campana) params.set('VD_campaign', cred.campana);

    return res.json({ success: true, url: `${base}/agc/vicidial_redirect.php?${params.toString()}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
