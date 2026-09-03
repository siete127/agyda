const sql = require('mssql');
const databaseService = require('../services/databaseService');
const facturacionService = require('../services/facturacionService');

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

async function ensureRow(pool) {
  await pool.request().query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.FACTURACION_CONFIG)
     INSERT INTO dbo.FACTURACION_CONFIG (FC_HABILITADO) VALUES (0)`,
  );
}

const PROVEEDORES = ['facturama'];

exports.getConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRow(pool);
    const r = await pool.request().query('SELECT TOP 1 * FROM dbo.FACTURACION_CONFIG ORDER BY FC_ID DESC');
    const row = r.recordset[0];
    const emisor = await facturacionService.getEmpresaFiscal(req.user?.empresa);
    res.json({
      success: true,
      data: {
        habilitado: !!row.FC_HABILITADO,
        proveedor: row.FC_PROVEEDOR || 'facturama',
        modo: row.FC_MODO || 'sandbox',
        baseUrl: row.FC_BASE_URL || '',
        usuario: row.FC_USUARIO || '',
        passwordConfigurado: !!row.FC_PASSWORD,
        apiKeyConfigurado: !!row.FC_API_KEY,
        serie: row.FC_SERIE || 'A',
        folioActual: row.FC_FOLIO_ACTUAL || 0,
        proveedores: PROVEEDORES,
        // Estado agregado para que la UI sepa si ya "funciona normal".
        listoParaTimbrar: facturacionService.pacListo(
          {
            habilitado: !!row.FC_HABILITADO, baseUrl: row.FC_BASE_URL,
            password: row.FC_PASSWORD, apiKey: row.FC_API_KEY,
          },
          emisor,
        ),
      },
    });
  } catch (e) {
    console.error('getConfig facturacion:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener la configuración de facturación' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRow(pool);

    const cur = await pool.request().query('SELECT TOP 1 * FROM dbo.FACTURACION_CONFIG ORDER BY FC_ID DESC');
    const existente = cur.recordset[0];

    const proveedor = PROVEEDORES.includes(b.proveedor) ? b.proveedor : 'facturama';
    const modo = b.modo === 'produccion' ? 'produccion' : 'sandbox';
    const baseUrl = b.baseUrl ? String(b.baseUrl).trim() : null;
    // Patrón "no lo mando de vuelta, no lo borres": secreto sólo si viene lleno.
    const password = b.password ? String(b.password) : existente.FC_PASSWORD;
    const apiKey = b.apiKey ? String(b.apiKey) : existente.FC_API_KEY;

    // Guardarraíl sandbox/producción usando el adapter del proveedor.
    if (baseUrl) {
      const adapter = facturacionService.getAdapter(proveedor);
      const g = adapter.validarModoUrl(modo, baseUrl);
      if (!g.ok) return res.status(400).json({ success: false, message: g.message });
    }

    await pool.request()
      .input('hab', sql.Bit, !!b.habilitado)
      .input('prov', sql.NVarChar(30), proveedor)
      .input('modo', sql.NVarChar(10), modo)
      .input('url', sql.NVarChar(200), baseUrl)
      .input('user', sql.NVarChar(200), b.usuario ? String(b.usuario) : null)
      .input('pass', sql.NVarChar(400), password || null)
      .input('key', sql.NVarChar(400), apiKey || null)
      .input('serie', sql.NVarChar(10), b.serie ? String(b.serie).slice(0, 10) : 'A')
      .query(`UPDATE dbo.FACTURACION_CONFIG SET
                FC_HABILITADO=@hab, FC_PROVEEDOR=@prov, FC_MODO=@modo, FC_BASE_URL=@url,
                FC_USUARIO=@user, FC_PASSWORD=@pass, FC_API_KEY=@key, FC_SERIE=@serie,
                FC_FECHA_ACTUALIZACION=GETDATE()
              WHERE FC_ID=(SELECT TOP 1 FC_ID FROM dbo.FACTURACION_CONFIG ORDER BY FC_ID DESC)`);

    res.json({ success: true });
  } catch (e) {
    console.error('updateConfig facturacion:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar la configuración de facturación' });
  }
};

exports.probarConexion = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const r = await facturacionService.probarConexion(req.user?.empresa);
    res.status(r.ok ? 200 : 400).json({ success: r.ok, message: r.message });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
