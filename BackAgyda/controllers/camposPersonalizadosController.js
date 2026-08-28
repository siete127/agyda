const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

const TIPOS_VALIDOS = ['texto', 'numero', 'lista', 'fecha'];

function parseCsv(v) {
  return v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/* ── Definición de campos (administración, Configuración > Categorías) ── */

exports.getCampos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const incluirInactivos = req.query.incluirInactivos === '1';
    const campos = await pool.request().query(`
      SELECT CP_ID as id, CP_NOMBRE as nombre, CP_TIPO as tipo, CP_OPCIONES as opciones,
             CP_REQUERIDO as requerido, CP_ORDEN as orden, CP_ACTIVO as activo
      FROM TI_CAMPOS_PERSONALIZADOS
      ${incluirInactivos ? '' : 'WHERE CP_ACTIVO = 1'}
      ORDER BY CP_ORDEN, CP_NOMBRE`);
    const categorias = await pool.request().query(`
      SELECT TCP_CAMPO_ID as campoId, c.CAT_ID as id, c.CAT_NOMBRE as nombre
      FROM TI_CAMPO_PERSONALIZADO_CATEGORIA tcp
      JOIN TICKET_CATEGORIAS c ON c.CAT_ID = tcp.TCP_CAT_ID`);

    const data = campos.recordset.map((c) => ({
      ...c,
      opciones: parseCsv(c.opciones),
      categorias: categorias.recordset.filter((cat) => cat.campoId === c.id).map(({ campoId, ...rest }) => rest),
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error listando campos personalizados:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createCampo = async (req, res) => {
  try {
    const { nombre, tipo, opciones, requerido, orden, categoriasIds = [] } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, message: 'nombre requerido' });
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ success: false, message: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
    if (tipo === 'lista' && (!Array.isArray(opciones) || opciones.length === 0)) {
      return res.status(400).json({ success: false, message: 'Los campos tipo lista requieren al menos una opción' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const opcionesCsv = tipo === 'lista' ? opciones.join(',') : null;

    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('tipo', sql.NVarChar, tipo)
      .input('opciones', sql.NVarChar, opcionesCsv)
      .input('requerido', sql.Bit, requerido ? 1 : 0)
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO TI_CAMPOS_PERSONALIZADOS (CP_NOMBRE, CP_TIPO, CP_OPCIONES, CP_REQUERIDO, CP_ORDEN)
              VALUES (@nombre, @tipo, @opciones, @requerido, @orden); SELECT SCOPE_IDENTITY() as id;`);
    const campoId = Number(ins.recordset[0].id);

    for (const catId of categoriasIds) {
      await pool.request().input('campoId', sql.Int, campoId).input('catId', sql.Int, catId)
        .query(`INSERT INTO TI_CAMPO_PERSONALIZADO_CATEGORIA (TCP_CAMPO_ID, TCP_CAT_ID) VALUES (@campoId, @catId)`);
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'campos-personalizados', accion:'crear', entidadId: String(campoId), detalle:{ nombre, tipo }, ip:req.ip });
    res.status(201).json({ success: true, data: { id: campoId, nombre: nombre.trim(), tipo, opciones: opciones || [], requerido: !!requerido, orden: orden || 0, activo: true } });
  } catch (e) {
    console.error('Error creando campo personalizado:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateCampo = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, opciones, requerido, orden, categoriasIds } = req.body;
    if (tipo && !TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ success: false, message: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
    if (tipo === 'lista' && (!Array.isArray(opciones) || opciones.length === 0)) {
      return res.status(400).json({ success: false, message: 'Los campos tipo lista requieren al menos una opción' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const opcionesCsv = tipo === 'lista' ? opciones.join(',') : null;

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('tipo', sql.NVarChar, tipo)
      .input('opciones', sql.NVarChar, opcionesCsv)
      .input('requerido', sql.Bit, requerido ? 1 : 0)
      .input('orden', sql.Int, orden || 0)
      .query(`UPDATE TI_CAMPOS_PERSONALIZADOS SET CP_NOMBRE=@nombre, CP_TIPO=@tipo, CP_OPCIONES=@opciones,
                CP_REQUERIDO=@requerido, CP_ORDEN=@orden WHERE CP_ID=@id`);

    // Reemplazo total de categorías asociadas, mismo patrón que TecnicosTab
    // (DELETE+INSERT) — el body siempre debe mandar la lista completa.
    if (Array.isArray(categoriasIds)) {
      await pool.request().input('id', sql.Int, id).query(`DELETE FROM TI_CAMPO_PERSONALIZADO_CATEGORIA WHERE TCP_CAMPO_ID=@id`);
      for (const catId of categoriasIds) {
        await pool.request().input('campoId', sql.Int, id).input('catId', sql.Int, catId)
          .query(`INSERT INTO TI_CAMPO_PERSONALIZADO_CATEGORIA (TCP_CAMPO_ID, TCP_CAT_ID) VALUES (@campoId, @catId)`);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando campo personalizado:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleCampoActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TI_CAMPOS_PERSONALIZADOS SET CP_ACTIVO = 1 - CP_ACTIVO WHERE CP_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de campo personalizado:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteCampo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const usos = await pool.request().input('id', sql.Int, id).query(`SELECT COUNT(*) as c FROM TICKET_CAMPOS_VALORES WHERE TCV_CAMPO_ID=@id`);
    if (usos.recordset[0].c > 0) {
      return res.status(409).json({ success: false, message: `No se puede eliminar: ${usos.recordset[0].c} ticket(s) ya tienen un valor guardado para este campo. Desactívalo en su lugar.` });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM TI_CAMPO_PERSONALIZADO_CATEGORIA WHERE TCP_CAMPO_ID=@id`);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM TI_CAMPOS_PERSONALIZADOS WHERE CP_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando campo personalizado:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Valores por ticket (usado desde el formulario de creación y el detalle) ── */

// GET /api/campos-personalizados/por-categoria/:catId — campos activos aplicables
// a una categoría, para que el frontend los renderice dinámicamente al crear un ticket.
exports.getCamposPorCategoria = async (req, res) => {
  try {
    const { catId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('catId', sql.Int, catId).query(`
      SELECT cp.CP_ID as id, cp.CP_NOMBRE as nombre, cp.CP_TIPO as tipo, cp.CP_OPCIONES as opciones, cp.CP_REQUERIDO as requerido
      FROM TI_CAMPO_PERSONALIZADO_CATEGORIA tcp
      JOIN TI_CAMPOS_PERSONALIZADOS cp ON cp.CP_ID = tcp.TCP_CAMPO_ID AND cp.CP_ACTIVO = 1
      WHERE tcp.TCP_CAT_ID = @catId
      ORDER BY cp.CP_ORDEN, cp.CP_NOMBRE`);
    res.json({ success: true, data: rs.recordset.map((c) => ({ ...c, opciones: parseCsv(c.opciones) })) });
  } catch (e) {
    console.error('Error listando campos por categoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/campos-personalizados/valores/:ticketId
exports.getValoresDeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('tid', sql.Int, ticketId).query(`
      SELECT tcv.TCV_CAMPO_ID as campoId, cp.CP_NOMBRE as nombre, cp.CP_TIPO as tipo, tcv.TCV_VALOR as valor
      FROM TICKET_CAMPOS_VALORES tcv
      JOIN TI_CAMPOS_PERSONALIZADOS cp ON cp.CP_ID = tcv.TCV_CAMPO_ID
      WHERE tcv.TCV_TICKET_ID=@tid
      ORDER BY cp.CP_ORDEN, cp.CP_NOMBRE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error obteniendo valores de campos personalizados:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Uso interno (no HTTP) — reutilizado por ticketController.crearTicketInterno
// para persistir los valores enviados junto con el resto del formulario de
// creación, en la misma transacción lógica (aunque sin sql.Transaction real,
// consistente con el resto de crearTicketInterno).
async function guardarValoresDeTicket(pool, ticketId, valores) {
  if (!valores || typeof valores !== 'object') return;
  for (const [campoId, valor] of Object.entries(valores)) {
    if (valor === undefined || valor === null || valor === '') continue;
    await pool.request()
      .input('tid', sql.Int, ticketId)
      .input('campoId', sql.Int, Number(campoId))
      .input('valor', sql.NVarChar, String(valor))
      .query(`
        MERGE TICKET_CAMPOS_VALORES AS target
        USING (SELECT @tid AS tid, @campoId AS campoId) AS src
        ON target.TCV_TICKET_ID = src.tid AND target.TCV_CAMPO_ID = src.campoId
        WHEN MATCHED THEN UPDATE SET TCV_VALOR = @valor
        WHEN NOT MATCHED THEN INSERT (TCV_TICKET_ID, TCV_CAMPO_ID, TCV_VALOR) VALUES (@tid, @campoId, @valor);
      `);
  }
}

exports.guardarValoresDeTicket = guardarValoresDeTicket;
