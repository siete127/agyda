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
    CAST(CASE WHEN t.totalTasks = 0 THEN 0 ELSE (1.0 * t.doneTasks) / t.totalTasks END AS DECIMAL(10,4)) as progress
  FROM PROYECTOS p
  OUTER APPLY (
    SELECT COUNT(*) as totalTasks,
           SUM(CASE WHEN LOWER(ISNULL(PTAR_ESTADO,'')) IN ('done','completed','completada','completado') THEN 1 ELSE 0 END) as doneTasks
    FROM PROYECTO_TAREAS t WHERE t.PTAR_PROY_ID = p.PROY_ID
  ) t
`;

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
    
    const header = await pool.request().input('id', sql.Int, id).query(`
      SELECT CAST(PROY_ID AS NVARCHAR) as id, PROY_NOMBRE as name, PROY_DESCRIPCION as description, 
             PROY_CLIENTE as clientName, PROY_FECHA_INICIO as startDate, PROY_FECHA_FIN as endDate, 
             PROY_ESTADO as status 
      FROM PROYECTOS WHERE PROY_ID = @id`);

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

    const { nombre, descripcion, cliente, fechaInicio, fechaFin, estado, miembros } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Falta nombre' });

    const creadorId = parseInt(req.headers['usuarioid'] || '0') || null;

    // Normalizar estado al formato que guarda la BD
    const ESTADO_MAP = { 'activo': 'Activo', 'pausado': 'Pausado', 'completado': 'Completado', 'cancelado': 'Cancelado' };
    const estadoNorm = ESTADO_MAP[(estado || '').toLowerCase()] || estado || 'Activo';

    const pool = await databaseService.getPool(req.user?.empresa);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const insert = await new sql.Request(transaction)
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('cliente', sql.NVarChar, cliente || null)
      .input('fechaInicio', sql.DateTime, fechaInicio ? new Date(fechaInicio) : null)
      .input('fechaFin', sql.DateTime, fechaFin ? new Date(fechaFin) : null)
      .input('estado', sql.NVarChar, estadoNorm)
      .input('creadorId', sql.Int, creadorId)
      .query(`
        INSERT INTO PROYECTOS (PROY_NOMBRE, PROY_DESCRIPCION, PROY_FECHA_INICIO, PROY_FECHA_FIN, PROY_ESTADO, PROY_CLIENTE, PROY_CREADOR_ID)
        VALUES (@nombre, @descripcion, COALESCE(@fechaInicio, GETDATE()), @fechaFin, @estado, @cliente, @creadorId);
        SELECT SCOPE_IDENTITY() as id;`);

    const projectId = insert.recordset[0].id;
    const createdMembers = [];

    if (Array.isArray(miembros)) {
      for (const m of miembros) {
        const nombreMiembro = m.nombre || m.name;
        const rolMiembro = m.rol || 'member';

        if (!nombreMiembro) continue;

        const ins = await new sql.Request(transaction)
          .input('proyId', sql.Int, projectId)
          .input('nombre', sql.NVarChar, nombreMiembro)
          .input('rol', sql.NVarChar, rolMiembro)
          .query(`
            INSERT INTO PROYECTO_MIEMBROS (PMEM_PROY_ID, PMEM_NOMBRE, PMEM_ROL)
            VALUES (@proyId, @nombre, @rol); 
            SELECT SCOPE_IDENTITY() as id;`);

        createdMembers.push({ id: ins.recordset[0].id, name: nombreMiembro, role: rolMiembro });
      }
    }

    await transaction.commit();

    // Notificar a los miembros creados: "asignado a un proyecto"
    try {
      const pool = await databaseService.getPool(req.user?.empresa);
      for (const m of createdMembers) {
        const r = await pool.request()
          .input('nombre', sql.NVarChar, m.name)
          .query(`SELECT NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_NOMBRES=@nombre AND NEUS_ACTIVO=1`);
        if (r.recordset.length) {
          await notificationService.createNotification({
            usuarioId: r.recordset[0].NEUS_ID,
            tipo: 'proyecto',
            mensaje: `Has sido asignado al proyecto '${nombre}' como '${m.role}'`,
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (notifyErr) {
      console.warn('Error notificación (createProyecto):', notifyErr);
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'proyectos', accion:'crear', entidadId: String(projectId||''), detalle:{ nombre }, ip:req.ip });
    res.status(201).json({
      success: true,
      data: {
        id: projectId,
        name: nombre,
        description: descripcion,
        clientName: cliente,
        startDate: fechaInicio,
        endDate: fechaFin,
        members: createdMembers
      }
    });

  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('Error creando proyecto:', e);
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
    const { nombre, descripcion, cliente, fechaInicio, fechaFin, estado } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);

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
      .query(`
        UPDATE PROYECTOS SET
          PROY_NOMBRE = COALESCE(@nombre, PROY_NOMBRE),
          PROY_DESCRIPCION = COALESCE(@descripcion, PROY_DESCRIPCION),
          PROY_CLIENTE = COALESCE(@cliente, PROY_CLIENTE),
          PROY_FECHA_INICIO = COALESCE(@fechaInicio, PROY_FECHA_INICIO),
          PROY_FECHA_FIN = COALESCE(@fechaFin, PROY_FECHA_FIN),
          PROY_ESTADO = COALESCE(@estado, PROY_ESTADO)
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
          PROY_ESTADO as status
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
