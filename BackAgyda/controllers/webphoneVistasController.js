const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Crear tabla WEBPHONE_VISTAS si no existe, en cada empresa configurada
Promise.all(require('../config/tenants').listTenants().map(({ key }) => databaseService.getPool(key))).then((pools) => {
  pools.forEach((pool) => {
    pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WEBPHONE_VISTAS')
      CREATE TABLE WEBPHONE_VISTAS (
        WVIS_ID     INT IDENTITY PRIMARY KEY,
        WVIS_LABEL  NVARCHAR(100) NOT NULL,
        WVIS_URL    NVARCHAR(500) NOT NULL,
        WVIS_VPN    BIT NOT NULL DEFAULT 0,
        WVIS_ORDEN  INT NOT NULL DEFAULT 1
      )
    `).catch(() => {});
  });
}).catch(() => {});

const DEFAULTS = [
  { label: 'Azul 1',   url: 'https://azul1.ardabytec.vip/', vpn: false },
  { label: 'Web21 RC9', url: 'https://web21.rc9.com.mx/',    vpn: true  },
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
      .query('INSERT INTO WEBPHONE_VISTAS (WVIS_LABEL,WVIS_URL,WVIS_VPN,WVIS_ORDEN) VALUES (@label,@url,@vpn,@orden)');
  }
}

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || req.body?.tipoUsuario || req.headers['tipousuario'] || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

exports.getVistas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await seedVistas(pool);
    const r = await pool.request().query(
      'SELECT WVIS_ID as id, WVIS_LABEL as label, WVIS_URL as url, WVIS_VPN as requiereVpn, WVIS_ORDEN as orden FROM WEBPHONE_VISTAS ORDER BY WVIS_ORDEN'
    );
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createVista = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { label, url, requiereVpn } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    if (!url || !/^https?:\/\//i.test(url.trim())) return res.status(400).json({ success: false, message: 'URL inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const maxOrden = await pool.request().query('SELECT ISNULL(MAX(WVIS_ORDEN),0)+1 as next FROM WEBPHONE_VISTAS');
    const orden = maxOrden.recordset[0].next;
    const ins = await pool.request()
      .input('label', sql.NVarChar, label.trim())
      .input('url',   sql.NVarChar, url.trim())
      .input('vpn',   sql.Bit, !!requiereVpn)
      .input('orden', sql.Int, orden)
      .query('INSERT INTO WEBPHONE_VISTAS (WVIS_LABEL,WVIS_URL,WVIS_VPN,WVIS_ORDEN) VALUES (@label,@url,@vpn,@orden); SELECT SCOPE_IDENTITY() as id');
    return res.status(201).json({ success: true, data: { id: ins.recordset[0].id, label: label.trim(), url: url.trim(), requiereVpn: !!requiereVpn, orden } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateVista = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { id } = req.params;
    const { label, url, requiereVpn } = req.body || {};
    if (url && !/^https?:\/\//i.test(url.trim())) return res.status(400).json({ success: false, message: 'URL inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',    sql.Int, Number(id))
      .input('label', sql.NVarChar, label != null ? label.trim() : null)
      .input('url',   sql.NVarChar, url != null ? url.trim() : null)
      .input('vpn',   sql.Bit, requiereVpn != null ? !!requiereVpn : null)
      .query(`UPDATE WEBPHONE_VISTAS SET
        WVIS_LABEL = COALESCE(@label, WVIS_LABEL),
        WVIS_URL   = COALESCE(@url,   WVIS_URL),
        WVIS_VPN   = COALESCE(@vpn,   WVIS_VPN)
      WHERE WVIS_ID=@id`);
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
