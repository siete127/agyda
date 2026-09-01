const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Crear tabla WEBPHONE_VISTAS si no existe, en la empresa del pool dado.
// Se llama on-demand desde cada endpoint (igual que seedVistas) en vez de una
// sola vez al cargar el módulo: al importarse este archivo, el catálogo de
// tenants dinámicos (config/tenants.js) todavía no está poblado —
// loadDynamicTenants corre async dentro de la inicialización del pool de
// 'agyda', después de que server.js ya hizo require() de esta ruta — así que
// una empresa creada después de 'agyda'/'demo' (ej. una nueva sucursal) nunca
// llegaba a tener esta tabla creada.
async function ensureWebphoneVistasSchema(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WEBPHONE_VISTAS')
      CREATE TABLE WEBPHONE_VISTAS (
        WVIS_ID       INT IDENTITY PRIMARY KEY,
        WVIS_LABEL    NVARCHAR(100) NOT NULL,
        WVIS_URL      NVARCHAR(500) NOT NULL,
        WVIS_VPN      BIT NOT NULL DEFAULT 0,
        WVIS_ORDEN    INT NOT NULL DEFAULT 1,
        WVIS_PROVIDER NVARCHAR(20) NOT NULL DEFAULT 'Azul1'
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='WEBPHONE_VISTAS' AND COLUMN_NAME='WVIS_PROVIDER')
      ALTER TABLE WEBPHONE_VISTAS ADD WVIS_PROVIDER NVARCHAR(20) NOT NULL DEFAULT 'Azul1'
    `);
  } catch (e) {
    console.warn('⚠️ No se pudo asegurar esquema de WEBPHONE_VISTAS:', e && e.message);
  }
}

const PROVIDERS = ['Azul1', 'Vici', 'Integra'];

const DEFAULTS = [
  { label: 'Azul 1',   url: 'https://azul1.ardabytec.vip/', vpn: false, provider: 'Azul1' },
  { label: 'Dialer 20450', url: 'https://dialer20450.pbxhosting.com.mx/', vpn: true, provider: 'Vici' },
];

async function seedVistas(pool) {
  const check = await pool.request().query('SELECT COUNT(*) c FROM WEBPHONE_VISTAS');
  if (check.recordset[0].c > 0) return;
  for (let i = 0; i < DEFAULTS.length; i++) {
    const d = DEFAULTS[i];
    await pool.request()
      .input('label', sql.NVarChar, d.label)
      .input('url',   sql.NVarChar, d.url)
      .input('vpn',   sql.Bit, d.vpn)
      .input('orden', sql.Int, i + 1)
      .input('provider', sql.NVarChar, d.provider)
      .query('INSERT INTO WEBPHONE_VISTAS (WVIS_LABEL,WVIS_URL,WVIS_VPN,WVIS_ORDEN,WVIS_PROVIDER) VALUES (@label,@url,@vpn,@orden,@provider)');
  }
}

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || req.body?.tipoUsuario || req.headers['tipousuario'] || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

exports.getVistas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureWebphoneVistasSchema(pool);
    await seedVistas(pool);
    const r = await pool.request().query(
      'SELECT WVIS_ID as id, WVIS_LABEL as label, WVIS_URL as url, WVIS_VPN as requiereVpn, WVIS_ORDEN as orden, WVIS_PROVIDER as provider FROM WEBPHONE_VISTAS ORDER BY WVIS_ORDEN'
    );
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createVista = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { label, url, requiereVpn, provider } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    if (!url || !/^https?:\/\//i.test(url.trim())) return res.status(400).json({ success: false, message: 'URL inválida' });
    const proveedor = PROVIDERS.includes(provider) ? provider : 'Azul1';

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureWebphoneVistasSchema(pool);
    const maxOrden = await pool.request().query('SELECT ISNULL(MAX(WVIS_ORDEN),0)+1 as next FROM WEBPHONE_VISTAS');
    const orden = maxOrden.recordset[0].next;
    const ins = await pool.request()
      .input('label', sql.NVarChar, label.trim())
      .input('url',   sql.NVarChar, url.trim())
      .input('vpn',   sql.Bit, !!requiereVpn)
      .input('orden', sql.Int, orden)
      .input('provider', sql.NVarChar, proveedor)
      .query('INSERT INTO WEBPHONE_VISTAS (WVIS_LABEL,WVIS_URL,WVIS_VPN,WVIS_ORDEN,WVIS_PROVIDER) VALUES (@label,@url,@vpn,@orden,@provider); SELECT SCOPE_IDENTITY() as id');
    return res.status(201).json({ success: true, data: { id: ins.recordset[0].id, label: label.trim(), url: url.trim(), requiereVpn: !!requiereVpn, orden, provider: proveedor } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateVista = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { id } = req.params;
    const { label, url, requiereVpn, provider } = req.body || {};
    if (url && !/^https?:\/\//i.test(url.trim())) return res.status(400).json({ success: false, message: 'URL inválida' });
    if (provider != null && !PROVIDERS.includes(provider)) return res.status(400).json({ success: false, message: 'Proveedor inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',    sql.Int, Number(id))
      .input('label', sql.NVarChar, label != null ? label.trim() : null)
      .input('url',   sql.NVarChar, url != null ? url.trim() : null)
      .input('vpn',   sql.Bit, requiereVpn != null ? !!requiereVpn : null)
      .input('provider', sql.NVarChar, provider != null ? provider : null)
      .query(`UPDATE WEBPHONE_VISTAS SET
        WVIS_LABEL    = COALESCE(@label, WVIS_LABEL),
        WVIS_URL      = COALESCE(@url,   WVIS_URL),
        WVIS_VPN      = COALESCE(@vpn,   WVIS_VPN),
        WVIS_PROVIDER = COALESCE(@provider, WVIS_PROVIDER)
      WHERE WVIS_ID=@id`);
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.setPredeterminada = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const actual = await pool.request().input('id', sql.Int, Number(id))
      .query('SELECT WVIS_ORDEN as orden FROM WEBPHONE_VISTAS WHERE WVIS_ID=@id');
    if (!actual.recordset.length) return res.status(404).json({ success: false, message: 'Vista no encontrada' });
    if (actual.recordset[0].orden === 1) return res.json({ success: true });

    // Sube en uno todas las vistas que estaban antes de la elegida, y esta pasa a ser la primera.
    await pool.request()
      .input('id', sql.Int, Number(id))
      .query(`
        UPDATE WEBPHONE_VISTAS SET WVIS_ORDEN = WVIS_ORDEN + 1 WHERE WVIS_ID <> @id;
        UPDATE WEBPHONE_VISTAS SET WVIS_ORDEN = 1 WHERE WVIS_ID = @id;
      `);
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteVista = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const count = await pool.request().query('SELECT COUNT(*) c FROM WEBPHONE_VISTAS');
    if (count.recordset[0].c <= 1)
      return res.status(409).json({ success: false, message: 'Debe quedar al menos una vista configurada' });

    await pool.request()
      .input('id', sql.Int, Number(id))
      .query('DELETE FROM WEBPHONE_VISTAS WHERE WVIS_ID=@id');
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Asignación dura por usuario: cada NEUS_ID puede tener a lo sumo UNA vista
// fija asignada. A diferencia de WEBPHONE_CREDENCIALES (agente x vista, N:N,
// solo credenciales de auto-login), esto decide QUÉ vista ve el agente en el
// Marcador — si tiene una asignada, el frontend oculta el selector y usa esa
// siempre, ignorando la vista predeterminada global.
async function ensureAsignacionesSchema(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WEBPHONE_ASIGNACIONES')
      CREATE TABLE WEBPHONE_ASIGNACIONES (
        WASG_ID       INT IDENTITY PRIMARY KEY,
        WASG_NEUS_ID  SMALLINT NOT NULL,
        WASG_VISTA_ID INT NOT NULL,
        CONSTRAINT UQ_WASG_NEUS UNIQUE (WASG_NEUS_ID),
        CONSTRAINT FK_WASG_VISTA FOREIGN KEY (WASG_VISTA_ID) REFERENCES WEBPHONE_VISTAS(WVIS_ID) ON DELETE CASCADE
      )
    `);
  } catch (e) {
    console.warn('⚠️ No se pudo asegurar esquema de WEBPHONE_ASIGNACIONES:', e && e.message);
  }
}

// Admin — matriz de todos los usuarios activos con su vista asignada (o
// ninguna, si todavía caen en la predeterminada global).
exports.getAsignaciones = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureWebphoneVistasSchema(pool);
    await ensureAsignacionesSchema(pool);

    const usuarios = await pool.request().query(`
      SELECT NEUS_ID as neusId, NEUS_NOMBRES as nombre, NEUS_USUARIO as usuarioAgyda, NEUS_TIPOUSUARIO as tipoUsuario
      FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 ORDER BY NEUS_NOMBRES
    `);
    const asignaciones = await pool.request().query(`
      SELECT WASG_NEUS_ID as neusId, WASG_VISTA_ID as vistaId FROM WEBPHONE_ASIGNACIONES
    `);
    const mapa = new Map(asignaciones.recordset.map((a) => [a.neusId, a.vistaId]));

    const data = usuarios.recordset.map((u) => ({ ...u, vistaId: mapa.get(u.neusId) ?? null }));
    return res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.setAsignacion = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const neusId = Number(req.params.neusId);
    const { vistaId } = req.body || {};
    if (!Number.isFinite(neusId) || neusId <= 0) {
      return res.status(400).json({ success: false, message: 'neusId inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureWebphoneVistasSchema(pool);
    await ensureAsignacionesSchema(pool);

    if (!vistaId) {
      await pool.request().input('nid', sql.Int, neusId).query('DELETE FROM WEBPHONE_ASIGNACIONES WHERE WASG_NEUS_ID=@nid');
      return res.json({ success: true });
    }

    const existe = await pool.request().input('nid', sql.Int, neusId)
      .query('SELECT WASG_ID FROM WEBPHONE_ASIGNACIONES WHERE WASG_NEUS_ID=@nid');
    if (existe.recordset.length > 0) {
      await pool.request().input('nid', sql.Int, neusId).input('vid', sql.Int, Number(vistaId))
        .query('UPDATE WEBPHONE_ASIGNACIONES SET WASG_VISTA_ID=@vid WHERE WASG_NEUS_ID=@nid');
    } else {
      await pool.request().input('nid', sql.Int, neusId).input('vid', sql.Int, Number(vistaId))
        .query('INSERT INTO WEBPHONE_ASIGNACIONES (WASG_NEUS_ID, WASG_VISTA_ID) VALUES (@nid, @vid)');
    }
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// El propio agente — no requiere ser admin, cada quien solo puede pedir su
// asignación. null si no tiene ninguna (cae a la predeterminada global, como
// antes de esta función existir).
exports.getMiAsignacion = async (req, res) => {
  try {
    const neusId = Number(req.user?.id);
    if (!Number.isFinite(neusId) || neusId <= 0) {
      return res.status(400).json({ success: false, message: 'Sesión inválida' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureWebphoneVistasSchema(pool);
    await ensureAsignacionesSchema(pool);
    const r = await pool.request().input('nid', sql.Int, neusId)
      .query('SELECT WASG_VISTA_ID as vistaId FROM WEBPHONE_ASIGNACIONES WHERE WASG_NEUS_ID=@nid');
    return res.json({ success: true, vistaId: r.recordset[0]?.vistaId ?? null });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.ensureWebphoneVistasSchema = ensureWebphoneVistasSchema;
exports.ensureAsignacionesSchema = ensureAsignacionesSchema;
