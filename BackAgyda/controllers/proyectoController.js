const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');

async function puedeAdministrarProyecto(pool, proyId, req) {
  const tipo = String(req.headers['x-user-tipo'] || '').toUpperCase();
  if (tipo === 'AD') return true;
  const userId = parseInt(req.headers['usuarioid'] || '0') || null;
  if (!userId) return false;
  const r = await pool.request()
    .input('proyId', sql.Int, proyId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT 1 FROM PROYECTOS WHERE PROY_ID=@proyId AND PROY_CREADOR_ID=@userId
      UNION ALL
      SELECT 1 FROM PROYECTO_MIEMBROS m
        JOIN NEUS_USUARIOS u
          ON u.NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI
           = m.PMEM_NOMBRE  COLLATE SQL_Latin1_General_CP1_CI_AI
      WHERE m.PMEM_PROY_ID=@proyId AND u.NEUS_ID=@userId
        AND LOWER(m.PMEM_ROL) IN ('lider','líder','leader')
    `);
  return r.recordset.length > 0;
}

const PROYECTOS_QUERY_BASE = `
  SELECT
    p.PROY_ID as id,
    p.PROY_NOMBRE as name,
    p.PROY_DESCRIPCION as description,
    p.PROY_CLIENTE as clientName,
    p.PROY_FECHA_INICIO as startDate,
    p.PROY_FECHA_FIN as endDate,
    p.PROY_ESTADO as status,
    p.PROY_CREADOR_ID as creadorId,
    p.PROY_CONT_ID as clienteId,
    p.PROY_PS_ID as productoId,
    ps.PS_NOMBRE as productoNombre,
    CAST(CASE WHEN t.totalTasks = 0 THEN 0 ELSE (1.0 * t.doneTasks) / t.totalTasks END AS DECIMAL(10,4)) as progress
  FROM PROYECTOS p
  LEFT JOIN PRODUCTOS_SERVICIOS ps ON ps.PS_ID = p.PROY_PS_ID
  OUTER APPLY (
    SELECT COUNT(*) as totalTasks,
           SUM(CASE WHEN LOWER(ISNULL(PTAR_ESTADO,'')) IN ('done','completed','completada','completado') THEN 1 ELSE 0 END) as doneTasks
    FROM PROYECTO_TAREAS t WHERE t.PTAR_PROY_ID = p.PROY_ID
  ) t
`;

// Vínculo del proyecto con un cliente (CRM_CONTACTOS) y con el producto o
// servicio que lo origina (PRODUCTOS_SERVICIOS). PROY_CLIENTE (texto) se sigue
// llenando con el nombre del cliente para lo que ya lo lee así (Flutter, CRM).
// Se asegura al primer uso en cada BD, así también aplica a empresas nuevas.
const conVinculo = new WeakSet();
async function asegurarColumnasVinculo(pool) {
  if (conVinculo.has(pool)) return;
  await pool.request().query(`
    IF COL_LENGTH('PROYECTOS', 'PROY_CONT_ID') IS NULL ALTER TABLE PROYECTOS ADD PROY_CONT_ID INT NULL;
    IF COL_LENGTH('PROYECTOS', 'PROY_PS_ID') IS NULL ALTER TABLE PROYECTOS ADD PROY_PS_ID INT NULL;
  `);
  conVinculo.add(pool);
}
exports.asegurarColumnasVinculo = asegurarColumnasVinculo;

// Roles de integrante (los mismos del proyecto generado desde el CRM).
const ROLES = new Set(['lider', 'miembro', 'revisor']);
const ROL_ALIAS = { 'líder': 'lider', leader: 'lider', member: 'miembro', developer: 'miembro', reviewer: 'revisor' };
const normalizarRol = (r) => {
  const k = String(r || '').trim().toLowerCase();
  return ROLES.has(k) ? k : (ROL_ALIAS[k] || 'miembro');
};
const normalizarMiembros = (lista) => {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : [])
    .map((m) => ({ nombre: String(m?.nombre || m?.name || '').trim(), rol: normalizarRol(m?.rol || m?.role) }))
    .filter((m) => m.nombre && !vistos.has(m.nombre.toLowerCase()) && vistos.add(m.nombre.toLowerCase()));
};
const ESTADOS = { activo: 'Activo', pausado: 'Pausado', completado: 'Completado', cancelado: 'Cancelado' };
const normalizarEstado = (e) => ESTADOS[String(e || '').toLowerCase()] || 'Activo';

// Cliente formal (CRM_CONTACTOS con CONT_ES_CLIENTE) → { id, nombre }.
async function leerCliente(consulta, clienteId) {
  const id = parseInt(clienteId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = await consulta.input('cid', sql.Int, id).query(`
    SELECT CONT_ID id, COALESCE(NULLIF(LTRIM(RTRIM(CONT_EMPRESA)), ''), CONT_NOMBRE) nombre, CONT_RESPONSABLE_ID responsableId
    FROM CRM_CONTACTOS WHERE CONT_ID = @cid AND CONT_ES_CLIENTE = 1`);
  return r.recordset[0] || null;
}
async function leerProducto(consulta, productoId) {
  const id = parseInt(productoId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = await consulta.input('psid', sql.Int, id).query(`
    SELECT PS_ID id, PS_NOMBRE nombre, PS_TIPO tipo, PS_DESCRIPCION descripcion, PS_RECURRENCIA recurrencia
    FROM PRODUCTOS_SERVICIOS WHERE PS_ID = @psid`);
  return r.recordset[0] || null;
}

// Inserta el proyecto y sus integrantes dentro de una transacción ya abierta.
async function insertarProyecto(tx, d) {
  const ins = await new sql.Request(tx)
    .input('nombre', sql.NVarChar, d.nombre)
    .input('descripcion', sql.NVarChar, d.descripcion || null)
    .input('cliente', sql.NVarChar, d.clienteNombre || null)
    .input('fechaInicio', sql.DateTime, d.fechaInicio ? new Date(d.fechaInicio) : null)
    .input('fechaFin', sql.DateTime, d.fechaFin ? new Date(d.fechaFin) : null)
    .input('estado', sql.NVarChar, normalizarEstado(d.estado))
    .input('creadorId', sql.Int, d.creadorId || null)
    .input('contId', sql.Int, d.clienteId || null)
    .input('psId', sql.Int, d.productoId || null)
    .query(`
      INSERT INTO PROYECTOS (PROY_NOMBRE, PROY_DESCRIPCION, PROY_FECHA_INICIO, PROY_FECHA_FIN, PROY_ESTADO, PROY_CLIENTE, PROY_CREADOR_ID, PROY_CONT_ID, PROY_PS_ID)
      VALUES (@nombre, @descripcion, COALESCE(@fechaInicio, GETDATE()), @fechaFin, @estado, @cliente, @creadorId, @contId, @psId);
      SELECT SCOPE_IDENTITY() as id;`);
  const id = Number(ins.recordset[0].id);
  const miembros = [];
  for (const m of d.miembros || []) {
    const r = await new sql.Request(tx)
      .input('proyId', sql.Int, id).input('nombre', sql.NVarChar, m.nombre).input('rol', sql.NVarChar, m.rol)
      .query(`INSERT INTO PROYECTO_MIEMBROS (PMEM_PROY_ID, PMEM_NOMBRE, PMEM_ROL) VALUES (@proyId, @nombre, @rol); SELECT SCOPE_IDENTITY() as id;`);
    miembros.push({ id: Number(r.recordset[0].id), name: m.nombre, role: m.rol });
  }
  return { id, miembros };
}

// Avisa a cada integrante (se resuelve su usuario por nombre, como el resto del módulo).
async function notificarIntegrantes(pool, tenantKey, proyectoNombre, miembros) {
  for (const m of miembros) {
    try {
      const r = await pool.request().input('nombre', sql.NVarChar, m.name)
        .query(`SELECT TOP 1 NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_NOMBRES=@nombre AND NEUS_ACTIVO=1`);
      if (r.recordset.length) {
        await notificationService.createNotification({
          usuarioId: r.recordset[0].NEUS_ID, tipo: 'proyecto', tenantKey,
          mensaje: `Has sido asignado al proyecto '${proyectoNombre}' como '${m.role}'`,
        });
      }
    } catch (e) { console.warn('Error notificación de proyecto:', e.message); }
  }
}

// Migraciones al arrancar, en cada empresa configurada
Promise.all(require('../config/tenants').listTenants().map(({ key }) => databaseService.getPool(key))).then((pools) => {
  pools.forEach((pool) => {
    pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='INTRA_CONFIG')
      CREATE TABLE INTRA_CONFIG (
        IC_CLAVE   NVARCHAR(100) PRIMARY KEY,
        IC_VALOR   NVARCHAR(500) NOT NULL
      );
      IF NOT EXISTS (SELECT 1 FROM INTRA_CONFIG WHERE IC_CLAVE='ad_ve_todos_proyectos')
        INSERT INTO INTRA_CONFIG (IC_CLAVE, IC_VALOR) VALUES ('ad_ve_todos_proyectos','0');
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME='PROYECTOS' AND COLUMN_NAME='PROY_CREADOR_ID'
      )
        ALTER TABLE PROYECTOS ADD PROY_CREADOR_ID INT NULL;
    `).catch(() => {});
  });
}).catch(() => {});

/* ===============================
   GET LISTA DE PROYECTOS
================================*/
exports.getProyectos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await asegurarColumnasVinculo(pool);
    const usuarioIdRaw = req.query.usuarioId;
    const usuarioId = usuarioIdRaw ? parseInt(usuarioIdRaw) : null;
    const tipoUsuario = String(req.query.tipoUsuario ?? '').toUpperCase();
    const usuarioLogin = String(req.query.usuario ?? '').trim(); // username (NEUS_USUARIO)

    // ADM_0001 siempre ve todo
    if (usuarioLogin === 'ADM_0001') {
      const result = await pool.request().query(PROYECTOS_QUERY_BASE + ' ORDER BY p.PROY_ID DESC');
      return res.json({ success: true, data: result.recordset });
    }

    // Para AD: consultar configuración
    if (tipoUsuario === 'AD') {
      const cfg = await pool.request().query(`SELECT IC_VALOR FROM INTRA_CONFIG WHERE IC_CLAVE='ad_ve_todos_proyectos'`);
      const adVeTodos = cfg.recordset[0]?.IC_VALOR === '1';
      if (adVeTodos) {
        const result = await pool.request().query(PROYECTOS_QUERY_BASE + ' ORDER BY p.PROY_ID DESC');
        return res.json({ success: true, data: result.recordset });
      }
    }

    // Para el resto (o AD sin permiso global): solo proyectos donde es miembro o creador
    if (usuarioId && !isNaN(usuarioId)) {
      const result = await pool.request()
        .input('usuarioId', sql.Int, usuarioId)
        .query(PROYECTOS_QUERY_BASE + `
          WHERE (
            p.PROY_CREADOR_ID = @usuarioId
            OR EXISTS (
              SELECT 1 FROM PROYECTO_MIEMBROS m
              JOIN NEUS_USUARIOS u
                ON u.NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI
                 = m.PMEM_NOMBRE  COLLATE SQL_Latin1_General_CP1_CI_AI
              WHERE m.PMEM_PROY_ID = p.PROY_ID AND u.NEUS_ID = @usuarioId
            )
          )
          ORDER BY p.PROY_ID DESC`);
      return res.json({ success: true, data: result.recordset });
    }

    // Sin usuarioId: no mostrar nada (no debería ocurrir en uso normal)
    return res.json({ success: true, data: [] });
  } catch (e) {
    console.error('Error listando proyectos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   CONFIG: AD ve todos los proyectos
================================*/
exports.getConfigProyectosAD = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().query(`SELECT IC_VALOR FROM INTRA_CONFIG WHERE IC_CLAVE='ad_ve_todos_proyectos'`);
    return res.json({ success: true, adVeTodos: r.recordset[0]?.IC_VALOR === '1' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.setConfigProyectosAD = async (req, res) => {
  try {
    const { adVeTodos } = req.body;
    const valor = adVeTodos ? '1' : '0';
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('valor', sql.NVarChar, valor)
      .query(`UPDATE INTRA_CONFIG SET IC_VALOR=@valor WHERE IC_CLAVE='ad_ve_todos_proyectos'`);
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   GET PROYECTO DETALLE
================================*/
exports.getProyectoById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    
    await asegurarColumnasVinculo(pool);
    const header = await pool.request().input('id', sql.Int, id).query(`
      SELECT CAST(p.PROY_ID AS NVARCHAR) as id, p.PROY_NOMBRE as name, p.PROY_DESCRIPCION as description,
             p.PROY_CLIENTE as clientName, p.PROY_FECHA_INICIO as startDate, p.PROY_FECHA_FIN as endDate,
             p.PROY_ESTADO as status, p.PROY_CONT_ID as clienteId, p.PROY_PS_ID as productoId, ps.PS_NOMBRE as productoNombre
      FROM PROYECTOS p LEFT JOIN PRODUCTOS_SERVICIOS ps ON ps.PS_ID = p.PROY_PS_ID
      WHERE p.PROY_ID = @id`);

    if (header.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });
    }

    const tareas = await pool.request().input('id', sql.Int, id).query(`
      SELECT PTAR_ID as id, PTAR_TITULO as title, PTAR_DESCRIPCION as description, 
             PTAR_FECHA_LIMITE as dueDate, PTAR_ESTADO as status, PTAR_PROGRESO as progress, 
             PTAR_ASIGNADO_A as assignedTo 
      FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID = @id ORDER BY PTAR_ID DESC`);

    const miembros = await pool.request().input('id', sql.Int, id).query(`
      SELECT PMEM_ID as id, PMEM_NOMBRE as name, PMEM_ROL as role 
      FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID = @id ORDER BY PMEM_ID DESC`);

    const counts = await pool.request().input('id', sql.Int, id).query(`
      SELECT COUNT(*) total, 
             SUM(CASE WHEN PTAR_ESTADO IN ('done','completed') THEN 1 ELSE 0 END) as done 
      FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID = @id`);

    const total = counts.recordset[0].total || 0;
    const done = counts.recordset[0].done || 0;
    const progress = total === 0 ? 0 : done / total;

    const data = { ...header.recordset[0], progress, tasks: tareas.recordset, members: miembros.recordset };
    res.json({ success: true, data });

  } catch (e) {
    console.error('Error detalle proyecto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   CREAR PROYECTO
================================*/
exports.createProyecto = async (req, res) => {
  let transaction;
  try {
    const tipoUsuario = (req.headers['x-user-tipo'] || req.headers['x-user-type'] || '').toString().toUpperCase();
    if (tipoUsuario === 'TI') {
      return res.status(403).json({ success: false, message: 'No tienes permisos para crear proyectos.' });
    }

    const { nombre, descripcion, cliente, fechaInicio, fechaFin, estado, miembros, clienteId, productoId } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Falta nombre' });

    const creadorId = parseInt(req.headers['usuarioid'] || '0') || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    await asegurarColumnasVinculo(pool);

    // Cliente y producto ligados (el web siempre manda producto; otros clientes
    // de la API, como la app, pueden seguir mandando solo el texto del cliente).
    const cli = clienteId ? await leerCliente(pool.request(), clienteId) : null;
    if (clienteId && !cli) return res.status(400).json({ success: false, message: 'El cliente elegido no existe o ya no es cliente' });
    const prod = productoId ? await leerProducto(pool.request(), productoId) : null;
    if (productoId && !prod) return res.status(400).json({ success: false, message: 'El producto o servicio elegido no existe' });

    const integrantes = normalizarMiembros(miembros);
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const { id: projectId, miembros: createdMembers } = await insertarProyecto(transaction, {
      nombre, descripcion, fechaInicio, fechaFin, estado, creadorId, miembros: integrantes,
      clienteId: cli?.id, clienteNombre: cli?.nombre || cliente || null, productoId: prod?.id,
    });
    await transaction.commit();

    await notificarIntegrantes(pool, req.user?.empresa, nombre, createdMembers);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'proyectos', accion:'crear', entidadId: String(projectId||''), detalle:{ nombre, clienteId: cli?.id || null, productoId: prod?.id || null }, ip:req.ip });
    res.status(201).json({
      success: true,
      data: {
        id: projectId,
        name: nombre,
        description: descripcion,
        clientName: cli?.nombre || cliente || null,
        clienteId: cli?.id || null,
        productoId: prod?.id || null,
        productoNombre: prod?.nombre || null,
        startDate: fechaInicio,
        endDate: fechaFin,
        members: createdMembers
      }
    });

  } catch (e) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('Error creando proyecto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   PROYECTOS DESDE PRODUCTOS (Clientes → asignar productos)
================================*/

// GET /proyectos/opciones — clientes, productos/servicios y qué tiene contratado
// cada cliente, para ligar un proyecto sin pedir acceso al módulo de Clientes.
exports.getOpcionesVinculo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const [clientes, productos, contratados] = await Promise.all([
      pool.request().query(`SELECT CONT_ID id, COALESCE(NULLIF(LTRIM(RTRIM(CONT_EMPRESA)), ''), CONT_NOMBRE) nombre
        FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE = 1 AND CONT_ACTIVO = 1 ORDER BY nombre`),
      pool.request().query(`SELECT PS_ID id, PS_NOMBRE nombre, PS_TIPO tipo, PS_RECURRENCIA recurrencia
        FROM PRODUCTOS_SERVICIOS WHERE PS_ACTIVO = 1 ORDER BY PS_NOMBRE`),
      pool.request().query(`SELECT CCPS_CONT_ID clienteId, CCPS_PS_ID productoId FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS`),
    ]);
    res.json({ success: true, data: { clientes: clientes.recordset, productos: productos.recordset, contratados: contratados.recordset } });
  } catch (e) {
    console.error('Error opciones de vínculo de proyecto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Fin sugerido según la recurrencia del producto (mensual → 1 mes, anual → 1 año).
function finSugerido(recurrencia) {
  const d = new Date();
  if (String(recurrencia || '').toUpperCase() === 'ANUAL') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// GET /proyectos/prellenado?clienteId=&productoIds=1,2 — lo que se puede
// precargar del proyecto de cada producto: nombre, descripción, fechas y los
// integrantes con sus roles. Los integrantes salen del último proyecto de ese
// mismo producto (así cada producto conserva su equipo y sus roles); si nunca
// ha tenido uno, el ejecutivo responsable del cliente queda como líder, y si
// tampoco hay, quien lo está creando. También lista los proyectos que el
// cliente ya tiene, para vincular uno existente en lugar de duplicar.
exports.getPrellenado = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await asegurarColumnasVinculo(pool);
    const cli = req.query.clienteId ? await leerCliente(pool.request(), req.query.clienteId) : null;
    const ids = [...new Set(String(req.query.productoIds || '').split(',').map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 30);

    // Quién crea (respaldo como líder).
    const uid = parseInt(req.user?.id, 10) || parseInt(req.headers['usuarioid'] || '0', 10) || null;
    const yo = uid ? (await pool.request().input('u', sql.Int, uid).query('SELECT NEUS_NOMBRES nombre FROM NEUS_USUARIOS WHERE NEUS_ID = @u')).recordset[0]?.nombre : null;
    const responsable = cli?.responsableId
      ? (await pool.request().input('u', sql.Int, cli.responsableId).query('SELECT NEUS_NOMBRES nombre FROM NEUS_USUARIOS WHERE NEUS_ID = @u AND NEUS_ACTIVO = 1')).recordset[0]?.nombre
      : null;

    const existentes = cli ? (await pool.request().input('c', sql.Int, cli.id).input('n', sql.NVarChar, cli.nombre).query(`
      SELECT p.PROY_ID id, p.PROY_NOMBRE nombre, p.PROY_ESTADO estado, p.PROY_PS_ID productoId, ps.PS_NOMBRE productoNombre
      FROM PROYECTOS p LEFT JOIN PRODUCTOS_SERVICIOS ps ON ps.PS_ID = p.PROY_PS_ID
      WHERE p.PROY_CONT_ID = @c OR (p.PROY_CONT_ID IS NULL AND p.PROY_CLIENTE = @n)
      ORDER BY p.PROY_ID DESC`)).recordset : [];

    const sugerencias = [];
    for (const psId of ids) {
      const prod = await leerProducto(pool.request(), psId);
      if (!prod) continue;
      const previo = (await pool.request().input('ps', sql.Int, psId).query(`
        SELECT TOP 1 PROY_ID id, PROY_NOMBRE nombre FROM PROYECTOS
        WHERE PROY_PS_ID = @ps AND EXISTS (SELECT 1 FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID = PROY_ID)
        ORDER BY PROY_ID DESC`)).recordset[0];
      let miembros = [];
      let origenMiembros = null;
      if (previo) {
        const m = await pool.request().input('p', sql.Int, previo.id)
          .query(`SELECT PMEM_NOMBRE nombre, PMEM_ROL rol FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID = @p ORDER BY PMEM_ID`);
        miembros = normalizarMiembros(m.recordset);
        origenMiembros = { tipo: 'proyecto', proyectoId: previo.id, nombre: previo.nombre };
      } else if (responsable) {
        miembros = [{ nombre: responsable, rol: 'lider' }];
        origenMiembros = { tipo: 'responsable' };
      } else if (yo) {
        miembros = [{ nombre: yo, rol: 'lider' }];
        origenMiembros = { tipo: 'creador' };
      }
      const tipo = String(prod.tipo || '').toUpperCase() === 'SERVICIO' ? 'servicio' : 'producto';
      sugerencias.push({
        productoId: prod.id,
        productoNombre: prod.nombre,
        productoTipo: prod.tipo,
        recurrencia: prod.recurrencia,
        nombre: cli ? `${prod.nombre} · ${cli.nombre}` : prod.nombre,
        descripcion: String(prod.descripcion || '').trim() || `Proyecto del ${tipo} "${prod.nombre}"${cli ? ` para ${cli.nombre}` : ''}.`,
        fechaInicio: new Date().toISOString().slice(0, 10),
        fechaFin: finSugerido(prod.recurrencia),
        miembros,
        origenMiembros,
        yaTiene: existentes.filter((p) => p.productoId === prod.id),
      });
    }
    res.json({ success: true, data: { cliente: cli ? { id: cli.id, nombre: cli.nombre } : null, sugerencias, existentes } });
  } catch (e) {
    console.error('Error prellenado de proyecto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /proyectos/desde-productos { clienteId, items: [{ productoId, modo, ... }] }
// modo 'nuevo': crea el proyecto del producto (con sus integrantes y roles);
// modo 'existente': liga un proyecto que ya existe al cliente y al producto.
// Todo en una sola transacción.
exports.crearDesdeProductos = async (req, res) => {
  let tx;
  try {
    const tipoUsuario = String(req.headers['x-user-tipo'] || req.headers['x-user-type'] || '').toUpperCase();
    if (tipoUsuario === 'TI') return res.status(403).json({ success: false, message: 'No tienes permisos para crear proyectos.' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await asegurarColumnasVinculo(pool);
    const cli = await leerCliente(pool.request(), req.body?.clienteId);
    if (!cli) return res.status(400).json({ success: false, message: 'Cliente inválido' });
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).filter((i) => i && ['nuevo', 'existente'].includes(i.modo));
    if (!items.length) return res.json({ success: true, data: { creados: [], vinculados: 0 } });

    // Validaciones antes de abrir la transacción.
    for (const it of items) {
      const prod = await leerProducto(pool.request(), it.productoId);
      if (!prod) return res.status(400).json({ success: false, message: `Producto inválido (${it.productoId})` });
      it._prod = prod;
      if (it.modo === 'nuevo' && !String(it.nombre || '').trim()) return res.status(400).json({ success: false, message: `Falta el nombre del proyecto de "${prod.nombre}"` });
      if (it.modo === 'existente' && !(parseInt(it.proyectoId, 10) > 0)) return res.status(400).json({ success: false, message: `Elige el proyecto existente para "${prod.nombre}"` });
    }

    const creadorId = parseInt(req.headers['usuarioid'] || '0', 10) || parseInt(req.user?.id, 10) || null;
    const creados = [];
    let vinculados = 0;
    tx = new sql.Transaction(pool);
    await tx.begin();
    for (const it of items) {
      if (it.modo === 'nuevo') {
        const nombre = String(it.nombre).trim();
        const r = await insertarProyecto(tx, {
          nombre, descripcion: it.descripcion, fechaInicio: it.fechaInicio, fechaFin: it.fechaFin, estado: it.estado,
          creadorId, miembros: normalizarMiembros(it.miembros), clienteId: cli.id, clienteNombre: cli.nombre, productoId: it._prod.id,
        });
        creados.push({ id: r.id, nombre, productoId: it._prod.id, miembros: r.miembros });
      } else {
        const up = await new sql.Request(tx)
          .input('id', sql.Int, parseInt(it.proyectoId, 10)).input('c', sql.Int, cli.id)
          .input('n', sql.NVarChar, cli.nombre).input('ps', sql.Int, it._prod.id)
          .query(`UPDATE PROYECTOS SET PROY_CONT_ID = @c, PROY_CLIENTE = @n, PROY_PS_ID = @ps WHERE PROY_ID = @id`);
        vinculados += up.rowsAffected[0] || 0;
      }
    }
    await tx.commit();

    for (const c of creados) await notificarIntegrantes(pool, req.user?.empresa, c.nombre, c.miembros);
    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'proyectos', accion: 'crear-desde-productos',
      entidadId: String(cli.id), detalle: { creados: creados.map((c) => c.id), vinculados }, ip: req.ip,
    });
    res.status(201).json({ success: true, data: { creados: creados.map(({ miembros, ...c }) => c), vinculados } });
  } catch (e) {
    if (tx) await tx.rollback().catch(() => {});
    console.error('Error creando proyectos desde productos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   AGREGAR MIEMBRO A PROYECTO
================================*/
exports.addMiembro = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, usuarioId, rol } = req.body;
    if (!rol || (!nombre && !usuarioId)) {
      return res.status(400).json({ success: false, message: 'Faltan datos: nombre/usuarioId y rol.' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    if (!await puedeAdministrarProyecto(pool, Number(id), req))
      return res.status(403).json({ success: false, message: 'Solo el líder o un AD puede agregar miembros.' });
    // Buscar usuario
    let user;
    if (usuarioId) {
      const r = await pool.request()
        .input('usuarioId', sql.Int, usuarioId)
        .query(`SELECT NEUS_ID, NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @usuarioId AND NEUS_ACTIVO = 1`);
      user = r.recordset[0];
    } else if (nombre) {
      const r = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .query(`SELECT TOP 1 NEUS_ID, NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_NOMBRES = @nombre AND NEUS_ACTIVO = 1`);
      user = r.recordset[0];
    }
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado o inactivo' });
    }
    // Evitar duplicados
    const dup = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, user.NEUS_NOMBRES)
      .query(`SELECT COUNT(*) c FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID = @id AND PMEM_NOMBRE = @nombre`);
    if (dup.recordset[0].c > 0) {
      return res.status(409).json({ success: false, message: 'El usuario ya es miembro del proyecto' });
    }
    // Insertar miembro
    const ins = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, user.NEUS_NOMBRES)
      .input('rol', sql.NVarChar, rol)
      .query(`INSERT INTO PROYECTO_MIEMBROS (PMEM_PROY_ID, PMEM_NOMBRE, PMEM_ROL) VALUES (@id, @nombre, @rol); SELECT SCOPE_IDENTITY() AS id;`);
    // Notificación: asignado a proyecto
    try {
      await notificationService.createNotification({
        usuarioId: user.NEUS_ID,
        tipo: 'proyecto',
        mensaje: `Has sido asignado al proyecto '${id}' como '${rol}'`,
        tenantKey: req.user?.empresa,
      });
    } catch (notifError) {
      console.warn('Error enviando notificación:', notifError);
    }
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'proyectos', accion:'agregar-miembro', entidadId: req.params.id, detalle:{ nombre, rol }, ip:req.ip });
    return res.status(201).json({
      success: true,
      data: {
        id: ins.recordset[0].id,
        nombre: user.NEUS_NOMBRES,
        rol
      }
    });
  } catch (e) {
    console.error('Error agregando miembro:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
exports.createTarea = async (req, res) => {
  try {
    // Acepta distintas cabeceras y alinea permisos con createProyecto
    const tipoUsuario = String(
      req.headers['x-user-tipo'] ??
      req.headers['x-user-type'] ??
      req.headers['x-user-role'] ??
      req.headers['tipousuario'] ??
      ''
    ).toUpperCase();

    if (tipoUsuario === 'TI') {
      return res.status(403).json({ success: false, message: 'No tienes permisos para agregar miembros.' });
    }

    const { id } = req.params;
    const { nombre, usuarioId, rol } = req.body;

    if (!rol || (!nombre && !usuarioId)) {
      return res.status(400).json({ success: false, message: 'Faltan datos: nombre/usuarioId y rol.' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener proyecto para usar su nombre en la notificación
    const proyecto = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT PROY_NOMBRE FROM PROYECTOS WHERE PROY_ID = @id`);

    if (proyecto.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Proyecto no existe' });
    }

    const nombreProyecto = proyecto.recordset[0].PROY_NOMBRE;

    // Buscar usuario
    let user;
    if (usuarioId) {
      const r = await pool.request()
        .input('usuarioId', sql.Int, usuarioId)
        .query(`SELECT NEUS_ID, NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @usuarioId AND NEUS_ACTIVO = 1`);
      user = r.recordset[0];
    } else if (nombre) {
      const r = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .query(`SELECT TOP 1 NEUS_ID, NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_NOMBRES = @nombre AND NEUS_ACTIVO = 1`);
      user = r.recordset[0];
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado o inactivo' });
    }

    // Evitar duplicados
    const dup = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, user.NEUS_NOMBRES)
      .query(`
        SELECT COUNT(*) c FROM PROYECTO_MIEMBROS 
        WHERE PMEM_PROY_ID = @id AND PMEM_NOMBRE = @nombre`);

    if (dup.recordset[0].c > 0) {
      return res.status(409).json({ success: false, message: 'El usuario ya es miembro del proyecto' });
    }

    // Insertar miembro
    const ins = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, user.NEUS_NOMBRES)
      .input('rol', sql.NVarChar, rol)
      .query(`
        INSERT INTO PROYECTO_MIEMBROS (PMEM_PROY_ID, PMEM_NOMBRE, PMEM_ROL)
        VALUES (@id, @nombre, @rol);
        SELECT SCOPE_IDENTITY() AS id;`);

    // Notificación: asignado a proyecto
    try {
      await notificationService.createNotification({
        usuarioId: user.NEUS_ID,
        tipo: 'proyecto',
        mensaje: `Has sido asignado al proyecto '${nombreProyecto}' como '${rol}'`,
        tenantKey: req.user?.empresa,
      });
    } catch (notifError) {
      console.warn('Error enviando notificación:', notifError);
    }

    return res.status(201).json({
      success: true,
      data: {
        id: ins.recordset[0].id,
        nombre: user.NEUS_NOMBRES,
        rol
      }
    });
  } catch (e) {
    console.error('Error agregando miembro:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   GET / UPDATE / DELETE MIEMBRO
   (SIN CAMBIOS)
================================*/
exports.getMiembros = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const miembros = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT PMEM_ID as id, PMEM_NOMBRE as name, PMEM_ROL as role FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID = @id ORDER BY PMEM_ID DESC`);
    res.json({ success: true, data: miembros.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getMiembroById = async (req, res) => {
  try {
    const { id, miembroId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('miembroId', sql.Int, miembroId)
      .query(`
        SELECT PMEM_ID as id, PMEM_NOMBRE as name, PMEM_ROL as role
        FROM PROYECTO_MIEMBROS 
        WHERE PMEM_PROY_ID = @id AND PMEM_ID = @miembroId`);

    if (r.recordset.length === 0)
      return res.status(404).json({ success: false, message: 'Miembro no encontrado' });

    res.json({ success: true, data: r.recordset[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateMiembro = async (req, res) => {
  try {
    const { id, miembroId } = req.params;
    const { rol } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    if (!rol) return res.status(400).json({ success: false, message: 'Rol requerido' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('miembroId', sql.Int, miembroId)
      .input('rol', sql.NVarChar, rol)
      .query(`
        UPDATE PROYECTO_MIEMBROS
        SET PMEM_ROL = @rol
        WHERE PMEM_PROY_ID = @id AND PMEM_ID = @miembroId`);

    res.json({ success: true, message: 'Miembro actualizado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteMiembro = async (req, res) => {
  try {
    const { id, miembroId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    if (!await puedeAdministrarProyecto(pool, Number(id), req))
      return res.status(403).json({ success: false, message: 'Solo el líder o un AD puede eliminar miembros.' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('miembroId', sql.Int, miembroId)
      .query(`
        DELETE FROM PROYECTO_MIEMBROS
        WHERE PMEM_PROY_ID = @id AND PMEM_ID = @miembroId`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'proyectos', accion:'eliminar-miembro', entidadId: req.params.id, detalle:{ miembroId: req.params.miembroId }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   ACTUALIZAR PROYECTO
================================*/
exports.updateProyecto = async (req, res) => {
  try {
    const tipoUsuario = String(
      req.headers['x-user-tipo'] ??
      req.headers['x-user-type'] ??
      req.headers['x-user-role'] ??
      req.headers['tipousuario'] ?? ''
    ).toUpperCase();

    if (tipoUsuario === 'TI') {
      return res.status(403).json({ success: false, message: 'No tienes permisos para actualizar proyectos.' });
    }

    const { id } = req.params;
    const { nombre, descripcion, fechaInicio, fechaFin, estado } = req.body;
    let { cliente } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    await asegurarColumnasVinculo(pool);

    // Vínculo con cliente y producto: solo se toca si viene en el cuerpo
    // (null lo quita). Elegir un cliente también actualiza el texto PROY_CLIENTE.
    const tocaCliente = Object.prototype.hasOwnProperty.call(req.body, 'clienteId');
    const tocaProducto = Object.prototype.hasOwnProperty.call(req.body, 'productoId');
    let cli = null;
    let prod = null;
    if (tocaCliente && req.body.clienteId) {
      cli = await leerCliente(pool.request(), req.body.clienteId);
      if (!cli) return res.status(400).json({ success: false, message: 'El cliente elegido no existe o ya no es cliente' });
      cliente = cli.nombre;
    }
    if (tocaProducto && req.body.productoId) {
      prod = await leerProducto(pool.request(), req.body.productoId);
      if (!prod) return res.status(400).json({ success: false, message: 'El producto o servicio elegido no existe' });
    }

    // Verifica existencia
    const exists = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT 1 FROM PROYECTOS WHERE PROY_ID = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre ?? null)
      .input('descripcion', sql.NVarChar, descripcion ?? null)
      .input('cliente', sql.NVarChar, cliente ?? null)
      .input('fechaInicio', sql.DateTime, fechaInicio ? new Date(fechaInicio) : null)
      .input('fechaFin', sql.DateTime, fechaFin ? new Date(fechaFin) : null)
      .input('estado', sql.NVarChar, estado ?? null)
      .input('contId', sql.Int, cli?.id ?? null)
      .input('psId', sql.Int, prod?.id ?? null)
      .query(`
        UPDATE PROYECTOS SET
          PROY_NOMBRE = COALESCE(@nombre, PROY_NOMBRE),
          PROY_DESCRIPCION = COALESCE(@descripcion, PROY_DESCRIPCION),
          PROY_CLIENTE = COALESCE(@cliente, PROY_CLIENTE),
          PROY_FECHA_INICIO = COALESCE(@fechaInicio, PROY_FECHA_INICIO),
          PROY_FECHA_FIN = COALESCE(@fechaFin, PROY_FECHA_FIN),
          PROY_ESTADO = COALESCE(@estado, PROY_ESTADO)
          ${tocaCliente ? ', PROY_CONT_ID = @contId' : ''}
          ${tocaProducto ? ', PROY_PS_ID = @psId' : ''}
        WHERE PROY_ID = @id
      `);

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          PROY_ID as id,
          PROY_NOMBRE as name,
          PROY_DESCRIPCION as description,
          PROY_CLIENTE as clientName,
          PROY_FECHA_INICIO as startDate,
          PROY_FECHA_FIN as endDate,
          PROY_ESTADO as status,
          PROY_CONT_ID as clienteId,
          PROY_PS_ID as productoId
        FROM PROYECTOS WHERE PROY_ID = @id
      `);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'proyectos', accion:'editar', entidadId: req.params.id, detalle:{ nombre }, ip:req.ip });
    return res.json({ success: true, data: updated.recordset[0] });
  } catch (e) {
    console.error('Error actualizando proyecto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ===============================
   ELIMINAR PROYECTO
================================*/
exports.deleteProyecto = async (req, res) => {
  let tx;
  try {
    const tipoUsuario = String(
      req.headers['x-user-tipo'] ??
      req.headers['x-user-type'] ??
      req.headers['x-user-role'] ??
      req.headers['tipousuario'] ?? ''
    ).toUpperCase();

    if (tipoUsuario === 'TI') {
      return res.status(403).json({ success: false, message: 'No tienes permisos para eliminar proyectos.' });
    }

    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    tx = new sql.Transaction(pool);
    await tx.begin();

    const exists = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query('SELECT 1 FROM PROYECTOS WHERE PROY_ID = @id');

    if (exists.recordset.length === 0) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });
    }

    await new sql.Request(tx).input('id', sql.Int, id)
      .query('DELETE FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID = @id');

    await new sql.Request(tx).input('id', sql.Int, id)
      .query('DELETE FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID = @id');

    await new sql.Request(tx).input('id', sql.Int, id)
      .query('DELETE FROM PROYECTOS WHERE PROY_ID = @id');

    await tx.commit();
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'proyectos', accion:'eliminar', entidadId: req.params.id, detalle:null, ip:req.ip });
    return res.json({ success: true });
  } catch (e) {
    if (tx) await tx.rollback();
    console.error('Error eliminando proyecto:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
