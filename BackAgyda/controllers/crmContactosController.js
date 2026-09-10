const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const clienteSeguimientoController = require('./clienteSeguimientoController');

const CONTACTO_SELECT_FIELDS = `
  CONT_ID as id, CONT_NOMBRE as nombre, CONT_EMPRESA as empresa,
  CONT_CORREO as correo, CONT_TELEFONO as telefono, CONT_CARGO as cargo,
  CONT_NOTAS as notas, CONT_FECHA as fecha, CONT_ACTIVO as activo,
  CONT_TIPO_CLIENTE as tipoCliente, CONT_DIRECCION as direccion,
  CONT_PRODUCTO_SERVICIO as productoServicio, CONT_RESPONSABLE_ID as responsableId,
  CONT_ESTATUS_CLIENTE as estatusCliente, CONT_MEDIO_CONTACTO as medioContacto,
  CONT_OBSERVACIONES_INICIALES as observacionesIniciales, CONT_ES_CLIENTE as esCliente
`;

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const q = req.query.q ? `%${req.query.q}%` : null;
    const esCliente = req.query.esCliente;
    let query = `
      SELECT ${CONTACTO_SELECT_FIELDS}
      FROM CRM_CONTACTOS
      WHERE CONT_ACTIVO = 1`;
    if (q) query += ` AND (CONT_NOMBRE LIKE @q OR CONT_EMPRESA LIKE @q OR CONT_CORREO LIKE @q)`;
    if (esCliente !== undefined) query += ` AND CONT_ES_CLIENTE = @esCliente`;
    query += ` ORDER BY CONT_NOMBRE`;
    const req2 = pool.request();
    if (q) req2.input('q', sql.NVarChar, q);
    if (esCliente !== undefined) req2.input('esCliente', sql.Bit, esCliente === '1' || esCliente === 'true' ? 1 : 0);
    const result = await req2.query(query);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getAll contactos CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT ${CONTACTO_SELECT_FIELDS}
        FROM CRM_CONTACTOS WHERE CONT_ID = @id AND CONT_ACTIVO = 1
      `);
    if (!result.recordset[0]) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { nombre, empresa, correo, telefono, cargo, notas, creadoPor } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('empresa', sql.NVarChar, empresa || null)
      .input('correo', sql.NVarChar, correo || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('cargo', sql.NVarChar, cargo || null)
      .input('notas', sql.NVarChar(sql.MAX), notas || null)
      .input('creadoPor', sql.Int, creadoPor || null)
      .query(`
        INSERT INTO CRM_CONTACTOS (CONT_NOMBRE,CONT_EMPRESA,CONT_CORREO,CONT_TELEFONO,CONT_CARGO,CONT_NOTAS,CONT_CREADO_POR)
        VALUES (@nombre,@empresa,@correo,@telefono,@cargo,@notas,@creadoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre, empresa, correo, telefono, cargo, notas } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('empresa', sql.NVarChar, empresa || null)
      .input('correo', sql.NVarChar, correo || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('cargo', sql.NVarChar, cargo || null)
      .input('notas', sql.NVarChar(sql.MAX), notas || null)
      .query(`
        UPDATE CRM_CONTACTOS SET
          CONT_NOMBRE=@nombre, CONT_EMPRESA=@empresa, CONT_CORREO=@correo,
          CONT_TELEFONO=@telefono, CONT_CARGO=@cargo, CONT_NOTAS=@notas
        WHERE CONT_ID=@id
      `);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    // Desvincula el contacto de oportunidades activas antes del soft-delete
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE CRM_OPORTUNIDADES SET OPO_CONTACTO_ID=NULL WHERE OPO_CONTACTO_ID=@id AND OPO_ACTIVO=1`);
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE CRM_CONTACTOS SET CONT_ACTIVO=0 WHERE CONT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const ESTATUS_CLIENTE_VALIDOS = ['verde', 'azul', 'amarillo', 'naranja', 'rojo', 'negro', 'morado'];

// Da de alta (o actualiza) los datos de "cliente" de un contacto ya existente en
// CRM_CONTACTOS — la entidad se comparte entre Ventas (prospección) y Atención al
// Cliente; CONT_ES_CLIENTE distingue un simple contacto de un cliente dado de alta.
exports.altaCliente = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const {
      tipoCliente, direccion, productoServicio, responsableId,
      estatusCliente, medioContacto, observacionesIniciales,
    } = req.body || {};

    const estatus = estatusCliente && ESTATUS_CLIENTE_VALIDOS.includes(estatusCliente) ? estatusCliente : 'verde';

    const pool = await databaseService.getPool(req.user?.empresa);
    const existe = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 CONT_ID, CONT_ES_CLIENTE FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
    if (!existe.recordset.length) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    const esAltaNueva = !existe.recordset[0].CONT_ES_CLIENTE;
    const responsableIdNum = responsableId ? parseInt(responsableId, 10) : null;

    await pool.request()
      .input('id', sql.Int, id)
      .input('tipoCliente', sql.NVarChar(50), tipoCliente || null)
      .input('direccion', sql.NVarChar(300), direccion || null)
      .input('productoServicio', sql.NVarChar(300), productoServicio || null)
      .input('responsableId', sql.Int, responsableIdNum)
      .input('estatusCliente', sql.NVarChar(20), estatus)
      .input('medioContacto', sql.NVarChar(50), medioContacto || null)
      .input('observacionesIniciales', sql.NVarChar(sql.MAX), observacionesIniciales || null)
      .query(`
        UPDATE CRM_CONTACTOS SET
          CONT_TIPO_CLIENTE=@tipoCliente, CONT_DIRECCION=@direccion, CONT_PRODUCTO_SERVICIO=@productoServicio,
          CONT_RESPONSABLE_ID=@responsableId, CONT_ESTATUS_CLIENTE=@estatusCliente, CONT_MEDIO_CONTACTO=@medioContacto,
          CONT_OBSERVACIONES_INICIALES=@observacionesIniciales, CONT_ES_CLIENTE=1
        WHERE CONT_ID=@id
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'alta-cliente', entidadId: id,
      detalle: { tipoCliente, responsableId: responsableIdNum, estatusCliente: estatus }, ip: req.ip,
    });

    // Automatización 1: solo en la primera alta (no en ediciones posteriores)
    // se registra el seguimiento inicial y se crea la tarea de bienvenida.
    if (esAltaNueva) {
      await clienteSeguimientoController.registrarAltaAutomatica(pool, {
        contactoId: id, responsableId: responsableIdNum, userId: getUserId(req), tenantKey: req.user?.empresa,
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error altaCliente CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Header del Perfil de Cliente: datos generales + conteos de cada sección del
// expediente, para no tener que disparar 8 queries separadas al abrir la página.
exports.getExpediente = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const contacto = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT ${CONTACTO_SELECT_FIELDS} FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
    if (!contacto.recordset.length) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    const conteos = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM CRM_DOCUMENTOS_CLIENTE WHERE DOC_CONTACTO_ID=@id AND DOC_ACTIVO=1) as documentos,
          (SELECT COUNT(*) FROM CRM_RECORDATORIOS_PAGO WHERE REC_CONTACTO_ID=@id AND REC_ACTIVO=1) as pagos,
          (SELECT COUNT(*) FROM CRM_ENCUESTAS_ENVIADAS WHERE CES_CONTACTO_ID=@id) as encuestas,
          (SELECT COUNT(*) FROM CRM_OPORTUNIDADES WHERE OPO_CONTACTO_ID=@id AND OPO_ACTIVO=1) as oportunidades
      `);

    // Vista comercial (solo lectura) del cliente: sus oportunidades del pipeline
    // + las cotizaciones de cada una. El expediente de Atención al Cliente las
    // muestra para dar contexto de venta sin salir del módulo.
    const opos = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          o.OPO_ID          as id,
          o.OPO_NOMBRE       as nombre,
          o.OPO_ETAPA        as etapa,
          o.OPO_VALOR        as valor,
          o.OPO_PRIORIDAD    as prioridad,
          CONVERT(NVARCHAR(19), o.OPO_FECHA, 126)        as fecha,
          CONVERT(NVARCHAR(19), o.OPO_FECHA_CIERRE, 126) as fechaCierre,
          o.OPO_PROYECTO_ID  as proyectoId,
          u.NEUS_NOMBRES    as asignadoNombre
        FROM CRM_OPORTUNIDADES o
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
        WHERE o.OPO_CONTACTO_ID = @id AND o.OPO_ACTIVO = 1
        ORDER BY o.OPO_FECHA DESC
      `);

    let cotizaciones = { recordset: [] };
    const opoIds = opos.recordset.map((o) => o.id);
    if (opoIds.length) {
      cotizaciones = await pool.request().query(`
        SELECT
          COT_ID       as id,
          COT_OPO_ID   as opoId,
          COT_FOLIO    as folio,
          COT_TITULO   as titulo,
          COT_ESTATUS  as estatus,
          COT_TOTAL    as total,
          COT_SEMAFORO as semaforo,
          CONVERT(NVARCHAR(19), COT_FECHA, 126)     as fecha,
          CONVERT(NVARCHAR(19), COT_FECHA_VTO, 126) as fechaVto
        FROM CRM_COTIZACIONES
        WHERE COT_OPO_ID IN (${opoIds.join(',')}) AND COT_ACTIVO = 1
        ORDER BY COT_FECHA DESC
      `);
    }

    const oportunidades = opos.recordset.map((o) => ({
      ...o,
      cotizaciones: cotizaciones.recordset.filter((c) => c.opoId === o.id),
    }));

    res.json({ success: true, data: { ...contacto.recordset[0], conteos: conteos.recordset[0], oportunidades } });
  } catch (e) {
    console.error('Error getExpediente CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
