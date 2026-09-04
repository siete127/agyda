const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const ccIngest = require('../services/ccIngestService');
const ccRouting = require('../services/ccRoutingService');

function tenantKeyDe(req) { return (req?.user?.empresa || 'agyda').toLowerCase(); }

// POST /api/cc/sim/interacciones  (admin/QA — crea una interacción de prueba)
exports.crearInteraccion = async (req, res) => {
  try {
    const { canalId, clienteNombre, clienteTelefono, mensaje } = req.body || {};
    if (!canalId || !mensaje) return res.status(400).json({ success: false, message: 'Falta canal o mensaje' });
    const p = await databaseService.getPool(req.user?.empresa);
    const cr = await p.request().input('id', sql.Int, canalId).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    const canal = cr.recordset[0];
    if (!canal) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    if ((canal.CN_TIPO || '').toLowerCase() !== 'test') return res.status(400).json({ success: false, message: 'El simulador solo funciona con canales de tipo "test"' });

    const clienteExtId = 'sim_' + crypto.randomBytes(6).toString('hex');
    const intId = await ccIngest.ingestarMensajeCliente(p, tenantKeyDe(req), canal, {
      clienteExtId, clienteNombre: clienteNombre || 'Cliente de prueba',
      clienteTelefono: clienteTelefono || null, texto: String(mensaje),
    });

    const token = crypto.randomBytes(24).toString('hex');
    await p.request().input('t', sql.NVarChar(80), token).input('i', sql.Int, intId)
      .query(`INSERT INTO dbo.CCO_SIM_TOKENS (ST_TOKEN, ST_INTERACCION_ID) VALUES (@t, @i)`);

    res.json({ success: true, data: { interaccionId: intId, simToken: token } });
  } catch (e) {
    console.error('ccSim.crearInteraccion:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la interacción de prueba' });
  }
};

async function resolverSim(token) {
  // usa el tenant por defecto de las pruebas locales; en multi-tenant real el
  // token llevaría el tenant embebido. Para iter.1 el simulador vive en 'agyda'.
  for (const key of require('../config/tenants').listTenants().map((t) => t.key)) {
    try {
      const p = await databaseService.getPool(key);
      const r = await p.request().input('t', sql.NVarChar(80), token)
        .query(`SELECT ST_INTERACCION_ID intId FROM dbo.CCO_SIM_TOKENS WHERE ST_TOKEN = @t AND ST_ACTIVO = 1`);
      if (r.recordset[0]) return { pool: p, tenantKey: key, interaccionId: r.recordset[0].intId };
    } catch (_) { /* siguiente tenant */ }
  }
  return null;
}

// GET /api/cc/sim/:token  (público — hilo para la página del "cliente")
exports.getHilo = async (req, res) => {
  try {
    const s = await resolverSim(req.params.token);
    if (!s) return res.status(404).json({ success: false, message: 'Token inválido' });
    const info = await s.pool.request().input('id', sql.Int, s.interaccionId)
      .query(`SELECT CI_ID id, CI_CLIENTE_NOMBRE clienteNombre, CI_ESTADO estado, CI_AGENTE_NOMBRE agenteNombre FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
    const msgs = await s.pool.request().input('id', sql.Int, s.interaccionId)
      .query(`SELECT MG_ID id, MG_EMISOR emisor, MG_CONTENIDO contenido, MG_FECHA fecha
              FROM dbo.CCO_MENSAJES WHERE MG_INTERACCION_ID = @id AND MG_EMISOR <> 'sistema' ORDER BY MG_FECHA ASC`);
    res.json({ success: true, data: { ...info.recordset[0], mensajes: msgs.recordset } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// POST /api/cc/sim/:token/mensajes  (público — "el cliente" responde)
exports.responder = async (req, res) => {
  try {
    const { mensaje } = req.body || {};
    if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ success: false, message: 'Mensaje vacío' });
    const s = await resolverSim(req.params.token);
    if (!s) return res.status(404).json({ success: false, message: 'Token inválido' });
    const cr = await s.pool.request().input('id', sql.Int, s.interaccionId)
      .query(`SELECT c.* FROM dbo.CCO_INTERACCIONES i INNER JOIN dbo.CCO_CANALES c ON c.CN_ID = i.CI_CANAL_ID WHERE i.CI_ID = @id`);
    const canal = cr.recordset[0];
    const cliente = await s.pool.request().input('id', sql.Int, s.interaccionId)
      .query(`SELECT CI_CLIENTE_EXT_ID ext, CI_CLIENTE_NOMBRE nombre FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id`);
    await ccIngest.ingestarMensajeCliente(s.pool, s.tenantKey, canal, {
      clienteExtId: cliente.recordset[0].ext, clienteNombre: cliente.recordset[0].nombre, texto: String(mensaje),
    });
    res.json({ success: true });
  } catch (e) {
    console.error('ccSim.responder:', e.message);
    res.status(500).json({ success: false, message: 'Error' });
  }
};
