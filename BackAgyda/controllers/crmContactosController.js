const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const clienteSeguimientoController = require('./clienteSeguimientoController');
const emailService = require('../services/emailService');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://intranet.ardabytec.vip:8444';

const CONTACTO_SELECT_FIELDS = `
  CONT_ID as id, CONT_NOMBRE as nombre, CONT_EMPRESA as empresa,
  CONT_CORREO as correo, CONT_TELEFONO as telefono, CONT_CARGO as cargo,
  CONT_NOTAS as notas, CONT_FECHA as fecha, CONT_ACTIVO as activo,
  CONT_TIPO_CLIENTE as tipoCliente, CONT_DIRECCION as direccion,
  CONT_PRODUCTO_SERVICIO as productoServicio, CONT_RESPONSABLE_ID as responsableId,
  CONT_ESTATUS_CLIENTE as estatusCliente, CONT_MEDIO_CONTACTO as medioContacto,
  CONT_OBSERVACIONES_INICIALES as observacionesIniciales, CONT_ES_CLIENTE as esCliente,
  CONT_TIPO_CLIENTE_ID as tipoClienteId, tc.TIP_NOMBRE as tipoClienteNombre,
  CONT_SEGMENTO_ID as segmentoId, sg.SEG_NOMBRE as segmentoNombre,
  CONT_CATEGORIA_ID as categoriaId, ct.CAT_NOMBRE as categoriaNombre,
  CONT_INDUSTRIA_ID as industriaId, id2.IND_NOMBRE as industriaNombre,
  CONT_CLASIFICACION_ID as clasificacionId, clc.CLC_NOMBRE as clasificacionNombre,
  CONT_NEUS_ID as neusId,
  CONT_TIPO_ACCESO_ID as tipoAccesoId, tap.TAP_NOMBRE as tipoAccesoNombre
`;

// Joins de los catálogos de Clientes — se concatenan al FROM base donde se usa
// CONTACTO_SELECT_FIELDS con estos alias (tc/sg/ct/id2/clc/tap).
const CONTACTO_CATALOGOS_JOIN = `
  LEFT JOIN CRM_TIPOS_CLIENTE tc ON tc.TIP_ID = CRM_CONTACTOS.CONT_TIPO_CLIENTE_ID
  LEFT JOIN CRM_SEGMENTOS sg ON sg.SEG_ID = CRM_CONTACTOS.CONT_SEGMENTO_ID
  LEFT JOIN CRM_CATEGORIAS_CLIENTE ct ON ct.CAT_ID = CRM_CONTACTOS.CONT_CATEGORIA_ID
  LEFT JOIN CRM_INDUSTRIAS id2 ON id2.IND_ID = CRM_CONTACTOS.CONT_INDUSTRIA_ID
  LEFT JOIN CRM_CLASIFICACIONES_CLIENTE clc ON clc.CLC_ID = CRM_CONTACTOS.CONT_CLASIFICACION_ID
  LEFT JOIN CRM_TIPOS_ACCESO_PORTAL tap ON tap.TAP_ID = CRM_CONTACTOS.CONT_TIPO_ACCESO_ID
`;

// Etiquetas (multi-valor) de un contacto, como array [{id, nombre}].
async function getEtiquetasContacto(pool, contactoId) {
  const rs = await pool.request().input('id', sql.Int, contactoId).query(`
    SELECT e.ETQ_ID as id, e.ETQ_NOMBRE as nombre
    FROM CRM_CONTACTOS_ETIQUETAS ce
    INNER JOIN CRM_ETIQUETAS e ON e.ETQ_ID = ce.CCE_ETIQUETA_ID
    WHERE ce.CCE_CONTACTO_ID = @id
    ORDER BY e.ETQ_ORDEN, e.ETQ_NOMBRE
  `);
  return rs.recordset;
}

// Reemplaza el set completo de etiquetas de un contacto (delete + insert).
async function setEtiquetasContacto(pool, contactoId, etiquetaIds) {
  const ids = Array.isArray(etiquetaIds) ? [...new Set(etiquetaIds.map(Number).filter(Number.isFinite))] : [];
  await pool.request().input('id', sql.Int, contactoId).query(`DELETE FROM CRM_CONTACTOS_ETIQUETAS WHERE CCE_CONTACTO_ID=@id`);
  for (const etiquetaId of ids) {
    await pool.request().input('id', sql.Int, contactoId).input('etiquetaId', sql.Int, etiquetaId)
      .query(`INSERT INTO CRM_CONTACTOS_ETIQUETAS (CCE_CONTACTO_ID, CCE_ETIQUETA_ID) VALUES (@id, @etiquetaId)`);
  }
}

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
    // conSeguimiento=1: solo contactos que ya "entraron" formalmente al
    // radar de Atención al Cliente — cliente dado de alta (CONT_ES_CLIENTE=1)
    // o con al menos una oportunidad convertida a proyecto (OPO_PROYECTO_ID).
    // Sin esto, un contacto suelto del formulario web (sin alta ni proyecto)
    // no tiene por qué aparecer en el módulo de Seguimiento de clientes —
    // solo en el Pipeline de Ventas hasta que alguien lo convierta.
    const conSeguimiento = req.query.conSeguimiento === '1' || req.query.conSeguimiento === 'true';
    let query = `
      SELECT ${CONTACTO_SELECT_FIELDS}
      FROM CRM_CONTACTOS
      ${CONTACTO_CATALOGOS_JOIN}
      WHERE CONT_ACTIVO = 1`;
    if (q) query += ` AND (CONT_NOMBRE LIKE @q OR CONT_EMPRESA LIKE @q OR CONT_CORREO LIKE @q)`;
    if (esCliente !== undefined) query += ` AND CONT_ES_CLIENTE = @esCliente`;
    if (conSeguimiento) {
      query += ` AND (CONT_ES_CLIENTE = 1 OR EXISTS (
        SELECT 1 FROM CRM_OPORTUNIDADES o
        WHERE o.OPO_CONTACTO_ID = CRM_CONTACTOS.CONT_ID AND o.OPO_PROYECTO_ID IS NOT NULL
      ))`;
    }
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
        FROM CRM_CONTACTOS
        ${CONTACTO_CATALOGOS_JOIN}
        WHERE CONT_ID = @id AND CONT_ACTIVO = 1
      `);
    if (!result.recordset[0]) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    const etiquetas = await getEtiquetasContacto(pool, req.params.id);
    res.json({ success: true, data: { ...result.recordset[0], etiquetas } });
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

// Crea o vincula el login de portal-cliente (NEUS_USUARIOS, NEUS_TIPOUSUARIO='CL')
// de un contacto — mismo mecanismo que antes vivía en clienteController.createCliente
// (módulo CLIENTES, ahora retirado), movido aquí para que el alta de cliente del CRM
// sea el único flujo que otorga acceso al portal. Devuelve el NEUS_ID a guardar en
// CONT_NEUS_ID, o null si no se pidió generar acceso.
async function generarOActualizarAccesoPortal(pool, { neusIdActual, correo, nombre, password }) {
  if (neusIdActual) {
    if (password) {
      await pool.request().input('id', sql.Int, neusIdActual).input('password', sql.NVarChar, String(password))
        .query(`UPDATE NEUS_USUARIOS SET NEUS_CONTRA = @password WHERE NEUS_ID = @id`);
    }
    const rs = await pool.request().input('id', sql.Int, neusIdActual).query(`SELECT NEUS_USUARIO as usuario FROM NEUS_USUARIOS WHERE NEUS_ID=@id`);
    return { neusId: neusIdActual, usuario: rs.recordset[0]?.usuario ?? null };
  }
  const neusUsuario = correo && String(correo).includes('@') ? correo : `cliente${Date.now()}`;
  const ins = await pool.request()
    .input('nombres', sql.NVarChar, nombre || 'Cliente')
    .input('usuario', sql.NVarChar, neusUsuario)
    .input('contra', sql.NVarChar, password ? String(password) : '')
    .query(`
      INSERT INTO NEUS_USUARIOS (NEUS_NOMBRES, NEUS_USUARIO, NEUS_CONTRA, NEUS_TIPOUSUARIO, NEUS_ACTIVO, NEUS_STATUS, NEUS_BASE, NEUS_FECHA_REGISTRO)
      VALUES (@nombres, @usuario, @contra, 'CL', 1, 1, '1', GETDATE());
      SELECT SCOPE_IDENTITY() as id;
    `);
  const neusId = ins.recordset[0]?.id ? Number(ins.recordset[0].id) : null;
  return { neusId, usuario: neusUsuario };
}

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
      tipoClienteId, segmentoId, categoriaId, industriaId, clasificacionId, etiquetaIds,
      generarAccesoPortal, passwordPortal, tipoAccesoId, enviarInvitacion,
    } = req.body || {};

    const estatus = estatusCliente && ESTATUS_CLIENTE_VALIDOS.includes(estatusCliente) ? estatusCliente : 'verde';

    const pool = await databaseService.getPool(req.user?.empresa);
    const existe = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 CONT_ID, CONT_ES_CLIENTE, CONT_NEUS_ID, CONT_NOMBRE, CONT_CORREO FROM CRM_CONTACTOS WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
    if (!existe.recordset.length) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    const contactoActual = existe.recordset[0];
    const esAltaNueva = !contactoActual.CONT_ES_CLIENTE;
    const responsableIdNum = responsableId ? parseInt(responsableId, 10) : null;
    const toIdOrNull = (v) => (v ? parseInt(v, 10) : null);

    let neusId = contactoActual.CONT_NEUS_ID || null;
    let neusUsuario = null;
    if (generarAccesoPortal) {
      const resultado = await generarOActualizarAccesoPortal(pool, {
        neusIdActual: neusId, correo: contactoActual.CONT_CORREO, nombre: contactoActual.CONT_NOMBRE, password: passwordPortal,
      });
      neusId = resultado.neusId;
      neusUsuario = resultado.usuario;
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('tipoCliente', sql.NVarChar(50), tipoCliente || null)
      .input('direccion', sql.NVarChar(300), direccion || null)
      .input('productoServicio', sql.NVarChar(300), productoServicio || null)
      .input('responsableId', sql.Int, responsableIdNum)
      .input('estatusCliente', sql.NVarChar(20), estatus)
      .input('medioContacto', sql.NVarChar(50), medioContacto || null)
      .input('observacionesIniciales', sql.NVarChar(sql.MAX), observacionesIniciales || null)
      .input('tipoClienteId', sql.Int, toIdOrNull(tipoClienteId))
      .input('segmentoId', sql.Int, toIdOrNull(segmentoId))
      .input('categoriaId', sql.Int, toIdOrNull(categoriaId))
      .input('industriaId', sql.Int, toIdOrNull(industriaId))
      .input('clasificacionId', sql.Int, toIdOrNull(clasificacionId))
      .input('neusId', sql.Int, neusId)
      .input('tipoAccesoId', sql.Int, toIdOrNull(tipoAccesoId))
      .query(`
        UPDATE CRM_CONTACTOS SET
          CONT_TIPO_CLIENTE=@tipoCliente, CONT_DIRECCION=@direccion, CONT_PRODUCTO_SERVICIO=@productoServicio,
          CONT_RESPONSABLE_ID=@responsableId, CONT_ESTATUS_CLIENTE=@estatusCliente, CONT_MEDIO_CONTACTO=@medioContacto,
          CONT_OBSERVACIONES_INICIALES=@observacionesIniciales, CONT_ES_CLIENTE=1,
          CONT_TIPO_CLIENTE_ID=@tipoClienteId, CONT_SEGMENTO_ID=@segmentoId, CONT_CATEGORIA_ID=@categoriaId,
          CONT_INDUSTRIA_ID=@industriaId, CONT_CLASIFICACION_ID=@clasificacionId, CONT_NEUS_ID=@neusId,
          CONT_TIPO_ACCESO_ID=@tipoAccesoId
        WHERE CONT_ID=@id
      `);
    await setEtiquetasContacto(pool, id, etiquetaIds);

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

    // Invitación por correo con credenciales de acceso — solo si se generó/
    // actualizó el acceso en esta misma llamada y se pidió explícitamente
    // (switch en el frontend), para no reenviar la contraseña sin querer.
    if (generarAccesoPortal && enviarInvitacion && neusUsuario && contactoActual.CONT_CORREO) {
      emailService.sendInvitacionAccesoSistemaEmail({
        nombre: contactoActual.CONT_NOMBRE,
        correo: contactoActual.CONT_CORREO,
        usuario: neusUsuario,
        password: passwordPortal || null,
        link: `${BASE_URL}/login`,
      }).catch(() => {});
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
      .query(`SELECT ${CONTACTO_SELECT_FIELDS} FROM CRM_CONTACTOS ${CONTACTO_CATALOGOS_JOIN} WHERE CONT_ID=@id AND CONT_ACTIVO=1`);
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

    const etiquetas = await getEtiquetasContacto(pool, id);
    res.json({ success: true, data: { ...contacto.recordset[0], etiquetas, conteos: conteos.recordset[0], oportunidades } });
  } catch (e) {
    console.error('Error getExpediente CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Productos/servicios asignados a un contacto CRM — equivalente a
// CLIENTE_PRODUCTOS_SERVICIOS (clienteController.js) pero para CRM_CONTACTOS,
// vía la tabla puente CRM_CONTACTO_PRODUCTOS_SERVICIOS.
exports.getProductosServicios = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          CCPS.CCPS_ID as id, PS.PS_ID as productoServicioId, PS.PS_TIPO as tipo,
          PS.PS_NOMBRE as nombre, PS.PS_DESCRIPCION as descripcion,
          PS.PS_PRECIO as precio, PS.PS_RECURRENCIA as recurrencia,
          CCPS.CCPS_FECHA_ASIGNACION as fechaAsignacion
        FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS CCPS
        JOIN PRODUCTOS_SERVICIOS PS ON PS.PS_ID = CCPS.CCPS_PS_ID
        WHERE CCPS.CCPS_CONT_ID = @id
        ORDER BY PS.PS_NOMBRE ASC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando productos/servicios del contacto CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.asignarProductoServicio = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const psId = parseInt(req.body?.psId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(psId)) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('contId', sql.Int, id)
      .input('psId', sql.Int, psId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @contId AND CCPS_PS_ID = @psId)
          INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)
      `);
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('Error asignando producto/servicio a contacto CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.quitarProductoServicio = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const psId = parseInt(req.params.psId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(psId)) {
      return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('contId', sql.Int, id)
      .input('psId', sql.Int, psId)
      .query(`DELETE FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID = @contId AND CCPS_PS_ID = @psId`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error quitando producto/servicio de contacto CRM:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
