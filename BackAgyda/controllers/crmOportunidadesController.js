const sql = require('mssql');
const databaseService = require('../services/databaseService');

const OPO_SELECT = `
  SELECT o.OPO_ID as id, o.OPO_NOMBRE as nombre, o.OPO_CONTACTO_ID as contactoId,
         c.CONT_NOMBRE as contactoNombre, c.CONT_EMPRESA as contactoEmpresa,
         o.OPO_ETAPA as etapa, o.OPO_VALOR as valor,
         CONVERT(NVARCHAR(10), o.OPO_FECHA_CIERRE, 23) as fechaCierre,
         o.OPO_ASIGNADO_A as asignadoA,
         u.NEUS_NOMBRES as asignadoNombre,
         o.OPO_CREADO_POR as creadoPor,
         o.OPO_FECHA as fecha, o.OPO_NOTAS as notas, o.OPO_ORDEN as orden,
         (SELECT COUNT(*) FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID=o.OPO_ID AND ACT_COMPLETADA=0) as actividadesPendientes,
         ISNULL(o.OPO_TAGS,'') as tags,
         ISNULL(o.OPO_PRIORIDAD,0) as prioridad,
         o.OPO_PROYECTO_ID as proyectoId
  FROM CRM_OPORTUNIDADES o
  LEFT JOIN CRM_CONTACTOS c ON c.CONT_ID = o.OPO_CONTACTO_ID
  LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
`;

exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(
      OPO_SELECT + ` WHERE o.OPO_ACTIVO = 1 ORDER BY o.OPO_ETAPA, o.OPO_ORDEN, o.OPO_FECHA DESC`
    );
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error getAll oportunidades:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(OPO_SELECT + ` WHERE o.OPO_ID = @id AND o.OPO_ACTIVO = 1`);
    if (!result.recordset[0]) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { nombre, contactoId, etapa, valor, fechaCierre, asignadoA, creadoPor, notas, usuarioNombre, tags, prioridad } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const etapaVal = ['prospecto','contactado','propuesta','negociacion','ganado','perdido'].includes(etapa) ? etapa : 'prospecto';
    const tagsVal = typeof tags === 'string' ? tags.slice(0, 500) : '';
    const prioridadVal = Math.min(3, Math.max(0, parseInt(prioridad) || 0));
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre',     sql.NVarChar, nombre.trim())
      .input('contactoId', sql.Int,      contactoId || null)
      .input('etapa',      sql.NVarChar, etapaVal)
      .input('valor',      sql.Decimal(18,2), valor || null)
      .input('fechaCierre',sql.Date,     fechaCierre || null)
      .input('asignadoA',  sql.Int,      asignadoA || null)
      .input('creadoPor',  sql.Int,      creadoPor || null)
      .input('notas',      sql.NVarChar(sql.MAX), notas || null)
      .input('tags',       sql.NVarChar(500), tagsVal || null)
      .input('prioridad',  sql.TinyInt,  prioridadVal)
      .query(`
        INSERT INTO CRM_OPORTUNIDADES
          (OPO_NOMBRE,OPO_CONTACTO_ID,OPO_ETAPA,OPO_VALOR,OPO_FECHA_CIERRE,OPO_ASIGNADO_A,OPO_CREADO_POR,OPO_NOTAS,OPO_TAGS,OPO_PRIORIDAD)
        VALUES (@nombre,@contactoId,@etapa,@valor,@fechaCierre,@asignadoA,@creadoPor,@notas,@tags,@prioridad);
        SELECT SCOPE_IDENTITY() as id;
      `);
    const newId = ins.recordset[0].id;
    // Registrar interacción de creación
    await pool.request()
      .input('opoId',    sql.Int,      newId)
      .input('uId',      sql.Int,      creadoPor || null)
      .input('uNombre',  sql.NVarChar, usuarioNombre || null)
      .query(`
        INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_ID,INT_USUARIO_NOMBRE)
        VALUES (@opoId,'creacion','Oportunidad creada',@uId,@uNombre)
      `);
    res.status(201).json({ success: true, data: { id: newId } });
  } catch (e) {
    console.error('Error create oportunidad:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre, contactoId, etapa, valor, fechaCierre, asignadoA, notas, usuarioId, usuarioNombre, tags, prioridad, orden } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const etapaVal = ['prospecto','contactado','propuesta','negociacion','ganado','perdido'].includes(etapa) ? etapa : 'prospecto';
    const tagsVal = typeof tags === 'string' ? tags.slice(0, 500) : '';
    const prioridadVal = Math.min(3, Math.max(0, parseInt(prioridad) || 0));
    const pool = await databaseService.getPool(req.user?.empresa);

    // Verificar si cambia de etapa para registrar interacción
    const prev = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT OPO_ETAPA FROM CRM_OPORTUNIDADES WHERE OPO_ID=@id`);
    const etapaAnterior = prev.recordset[0]?.OPO_ETAPA;

    await pool.request()
      .input('id',         sql.Int,      req.params.id)
      .input('nombre',     sql.NVarChar, nombre.trim())
      .input('contactoId', sql.Int,      contactoId || null)
      .input('etapa',      sql.NVarChar, etapaVal)
      .input('valor',      sql.Decimal(18,2), valor || null)
      .input('fechaCierre',sql.Date,     fechaCierre || null)
      .input('asignadoA',  sql.Int,      asignadoA || null)
      .input('notas',      sql.NVarChar(sql.MAX), notas || null)
      .input('tags',       sql.NVarChar(500), tagsVal || null)
      .input('prioridad',  sql.TinyInt,  prioridadVal)
      .input('orden',      sql.Int,      orden != null ? orden : null)
      .query(`
        UPDATE CRM_OPORTUNIDADES SET
          OPO_NOMBRE=@nombre, OPO_CONTACTO_ID=@contactoId, OPO_ETAPA=@etapa,
          OPO_VALOR=@valor, OPO_FECHA_CIERRE=@fechaCierre, OPO_ASIGNADO_A=@asignadoA, OPO_NOTAS=@notas,
          OPO_TAGS=@tags, OPO_PRIORIDAD=@prioridad,
          OPO_ORDEN=ISNULL(@orden, OPO_ORDEN)
        WHERE OPO_ID=@id
      `);

    if (etapaAnterior && etapaAnterior !== etapaVal) {
      const etapaLabels = { prospecto:'Prospecto', contactado:'Contactado', propuesta:'Propuesta', negociacion:'Negociación', ganado:'Ganado', perdido:'Perdido' };
      await pool.request()
        .input('opoId',   sql.Int,      req.params.id)
        .input('uId',     sql.Int,      usuarioId || null)
        .input('uNombre', sql.NVarChar, usuarioNombre || null)
        .input('content', sql.NVarChar, `Etapa cambiada: ${etapaLabels[etapaAnterior] || etapaAnterior} → ${etapaLabels[etapaVal] || etapaVal}`)
        .query(`
          INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_ID,INT_USUARIO_NOMBRE)
          VALUES (@opoId,'cambio_etapa',@content,@uId,@uNombre)
        `);

      // Trigger automatizaciones al cambiar etapa
      try {
        const reglas = await pool.request()
          .input('etapa', sql.NVarChar, etapaVal)
          .query(`SELECT AUTO_TIPO_ACTIVIDAD as tipo, AUTO_DESCRIPCION as descripcion, AUTO_DIAS_OFFSET as dias FROM CRM_AUTOMATIZACIONES WHERE AUTO_ETAPA_TRIGGER=@etapa AND AUTO_ACTIVO=1`)
        for (const r of reglas.recordset) {
          const due = new Date(); due.setDate(due.getDate() + (r.dias || 1))
          await pool.request()
            .input('opoId', sql.Int, req.params.id)
            .input('tipo', sql.NVarChar, r.tipo)
            .input('desc', sql.NVarChar, r.descripcion)
            .input('due', sql.DateTime, due)
            .query(`INSERT INTO CRM_ACTIVIDADES(ACT_OPO_ID,ACT_TIPO,ACT_DESCRIPCION,ACT_FECHA_DUE) VALUES(@opoId,@tipo,@desc,@due)`)
        }
      } catch (eAuto) {
        console.error('Error en automatizaciones:', eAuto)
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Error update oportunidad:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE CRM_OPORTUNIDADES SET OPO_ACTIVO=0 WHERE OPO_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getActividades = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT ACT_ID as id, ACT_OPO_ID as opoId, ACT_TIPO as tipo,
               ACT_DESCRIPCION as descripcion, ACT_FECHA_DUE as fechaDue,
               ACT_ASIGNADO_A as asignadoA, ACT_COMPLETADA as completada,
               ACT_FECHA_COMP as fechaComp, ACT_FECHA as fecha
        FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID=@id ORDER BY ACT_COMPLETADA, ACT_FECHA_DUE
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getInteracciones = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT INT_ID as id, INT_OPO_ID as opoId, INT_TIPO as tipo,
               INT_CONTENIDO as contenido, INT_USUARIO_ID as usuarioId,
               INT_USUARIO_NOMBRE as usuarioNombre, INT_FECHA as fecha
        FROM CRM_INTERACCIONES WHERE INT_OPO_ID=@id ORDER BY INT_FECHA DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getAllActividades = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT a.ACT_ID as id, a.ACT_OPO_ID as opoId, o.OPO_NOMBRE as opoNombre,
             a.ACT_TIPO as tipo, a.ACT_DESCRIPCION as descripcion,
             a.ACT_FECHA_DUE as fechaDue, a.ACT_ASIGNADO_A as asignadoA,
             a.ACT_COMPLETADA as completada, a.ACT_FECHA_COMP as fechaComp, a.ACT_FECHA as fecha
      FROM CRM_ACTIVIDADES a
      JOIN CRM_OPORTUNIDADES o ON o.OPO_ID = a.ACT_OPO_ID AND o.OPO_ACTIVO = 1
      ORDER BY a.ACT_COMPLETADA, a.ACT_FECHA_DUE
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
