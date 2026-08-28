const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

/* ── Sedes ── */
exports.getSedes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const incluirInactivas = req.query.incluirInactivas === '1';
    const rs = await pool.request().query(`
      SELECT SEDE_ID as id, SEDE_NOMBRE as nombre, SEDE_DIRECCION as direccion, SEDE_ACTIVA as activa
      FROM SEDES ${incluirInactivas ? '' : 'WHERE SEDE_ACTIVA = 1'}
      ORDER BY SEDE_NOMBRE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando sedes:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createSede = async (req, res) => {
  try {
    const { nombre, direccion } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('direccion', sql.NVarChar, direccion || null)
      .query(`INSERT INTO SEDES (SEDE_NOMBRE, SEDE_DIRECCION) VALUES (@nombre, @direccion); SELECT SCOPE_IDENTITY() as id;`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'catalogos-ti', accion:'crear-sede', entidadId: String(ins.recordset[0].id), detalle:{ nombre }, ip:req.ip });
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, direccion: direccion || null, activa: true } });
  } catch (e) {
    console.error('Error creando sede:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateSede = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, direccion } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('direccion', sql.NVarChar, direccion || null)
      .query(`UPDATE SEDES SET SEDE_NOMBRE=@nombre, SEDE_DIRECCION=@direccion WHERE SEDE_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando sede:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleSedeActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE SEDES SET SEDE_ACTIVA = 1 - SEDE_ACTIVA WHERE SEDE_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de sede:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Categorías / Subcategorías / Elementos (árbol de 3 niveles) ── */
exports.getCategorias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const incluirInactivas = req.query.incluirInactivas === '1';
    const cats = await pool.request().query(`
      SELECT CAT_ID as id, CAT_NOMBRE as nombre, CAT_ORDEN as orden, CAT_ACTIVA as activa
      FROM TICKET_CATEGORIAS ${incluirInactivas ? '' : 'WHERE CAT_ACTIVA = 1'}
      ORDER BY CAT_ORDEN, CAT_NOMBRE`);
    const subs = await pool.request().query(`
      SELECT SUBCAT_ID as id, SUBCAT_CAT_ID as categoriaId, SUBCAT_NOMBRE as nombre, SUBCAT_ORDEN as orden, SUBCAT_ACTIVA as activa
      FROM TICKET_SUBCATEGORIAS ${incluirInactivas ? '' : 'WHERE SUBCAT_ACTIVA = 1'}
      ORDER BY SUBCAT_ORDEN, SUBCAT_NOMBRE`);
    const elems = await pool.request().query(`
      SELECT ELEM_ID as id, ELEM_SUBCAT_ID as subcategoriaId, ELEM_NOMBRE as nombre, ELEM_ORDEN as orden, ELEM_ACTIVO as activa
      FROM TICKET_ELEMENTOS ${incluirInactivas ? '' : 'WHERE ELEM_ACTIVO = 1'}
      ORDER BY ELEM_ORDEN, ELEM_NOMBRE`);

    const arbol = cats.recordset.map((c) => ({
      ...c,
      subcategorias: subs.recordset.filter((s) => s.categoriaId === c.id).map(({ categoriaId, ...rest }) => ({
        ...rest,
        elementos: elems.recordset.filter((el) => el.subcategoriaId === rest.id).map(({ subcategoriaId, ...restEl }) => restEl),
      })),
    }));
    res.json({ success: true, data: arbol });
  } catch (e) {
    console.error('Error listando categorías:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createCategoria = async (req, res) => {
  try {
    const { nombre, orden } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO TICKET_CATEGORIAS (CAT_NOMBRE, CAT_ORDEN) VALUES (@nombre, @orden); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, orden: orden || 0, activa: true, subcategorias: [] } });
  } catch (e) {
    console.error('Error creando categoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, orden } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .query(`UPDATE TICKET_CATEGORIAS SET CAT_NOMBRE=@nombre, CAT_ORDEN=@orden WHERE CAT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando categoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleCategoriaActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TICKET_CATEGORIAS SET CAT_ACTIVA = 1 - CAT_ACTIVA WHERE CAT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de categoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createSubcategoria = async (req, res) => {
  try {
    const { categoriaId, nombre, orden } = req.body;
    if (!categoriaId || !nombre) return res.status(400).json({ success: false, message: 'categoriaId y nombre son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('catId', sql.Int, categoriaId)
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO TICKET_SUBCATEGORIAS (SUBCAT_CAT_ID, SUBCAT_NOMBRE, SUBCAT_ORDEN) VALUES (@catId, @nombre, @orden); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, orden: orden || 0, activa: true } });
  } catch (e) {
    console.error('Error creando subcategoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateSubcategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, orden } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .query(`UPDATE TICKET_SUBCATEGORIAS SET SUBCAT_NOMBRE=@nombre, SUBCAT_ORDEN=@orden WHERE SUBCAT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando subcategoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleSubcategoriaActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TICKET_SUBCATEGORIAS SET SUBCAT_ACTIVA = 1 - SUBCAT_ACTIVA WHERE SUBCAT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de subcategoría:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Elementos (tercer nivel del árbol, colgado de subcategoría) ── */
exports.createElemento = async (req, res) => {
  try {
    const { subcategoriaId, nombre, orden } = req.body;
    if (!subcategoriaId || !nombre) return res.status(400).json({ success: false, message: 'subcategoriaId y nombre son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('subcatId', sql.Int, subcategoriaId)
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO TICKET_ELEMENTOS (ELEM_SUBCAT_ID, ELEM_NOMBRE, ELEM_ORDEN) VALUES (@subcatId, @nombre, @orden); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, orden: orden || 0, activa: true } });
  } catch (e) {
    console.error('Error creando elemento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateElemento = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, orden } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('orden', sql.Int, orden || 0)
      .query(`UPDATE TICKET_ELEMENTOS SET ELEM_NOMBRE=@nombre, ELEM_ORDEN=@orden WHERE ELEM_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando elemento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleElementoActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TICKET_ELEMENTOS SET ELEM_ACTIVO = 1 - ELEM_ACTIVO WHERE ELEM_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de elemento:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Especialidades ── */
exports.getEspecialidades = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const incluirInactivas = req.query.incluirInactivas === '1';
    const rs = await pool.request().query(`
      SELECT ESP_ID as id, ESP_NOMBRE as nombre, ESP_ACTIVA as activa
      FROM TI_ESPECIALIDADES ${incluirInactivas ? '' : 'WHERE ESP_ACTIVA = 1'}
      ORDER BY ESP_NOMBRE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando especialidades:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createEspecialidad = async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request().input('nombre', sql.NVarChar, nombre)
      .query(`INSERT INTO TI_ESPECIALIDADES (ESP_NOMBRE) VALUES (@nombre); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, activa: true } });
  } catch (e) {
    console.error('Error creando especialidad:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEspecialidad = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).input('nombre', sql.NVarChar, nombre)
      .query(`UPDATE TI_ESPECIALIDADES SET ESP_NOMBRE=@nombre WHERE ESP_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando especialidad:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleEspecialidadActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TI_ESPECIALIDADES SET ESP_ACTIVA = 1 - ESP_ACTIVA WHERE ESP_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de especialidad:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Proveedores ── */
exports.getProveedores = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const incluirInactivos = req.query.incluirInactivos === '1';
    const rs = await pool.request().query(`
      SELECT PROV_ID as id, PROV_NOMBRE as nombre, PROV_CONTACTO as contacto,
             PROV_TELEFONO as telefono, PROV_CORREO as correo, PROV_ACTIVO as activo
      FROM TI_PROVEEDORES ${incluirInactivos ? '' : 'WHERE PROV_ACTIVO = 1'}
      ORDER BY PROV_NOMBRE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando proveedores:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createProveedor = async (req, res) => {
  try {
    const { nombre, contacto, telefono, correo } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('contacto', sql.NVarChar, contacto || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('correo', sql.NVarChar, correo || null)
      .query(`INSERT INTO TI_PROVEEDORES (PROV_NOMBRE, PROV_CONTACTO, PROV_TELEFONO, PROV_CORREO)
              VALUES (@nombre, @contacto, @telefono, @correo); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, contacto: contacto || null, telefono: telefono || null, correo: correo || null, activo: true } });
  } catch (e) {
    console.error('Error creando proveedor:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateProveedor = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, contacto, telefono, correo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('contacto', sql.NVarChar, contacto || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('correo', sql.NVarChar, correo || null)
      .query(`UPDATE TI_PROVEEDORES SET PROV_NOMBRE=@nombre, PROV_CONTACTO=@contacto, PROV_TELEFONO=@telefono, PROV_CORREO=@correo WHERE PROV_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando proveedor:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleProveedorActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TI_PROVEEDORES SET PROV_ACTIVO = 1 - PROV_ACTIVO WHERE PROV_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de proveedor:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Servicios ── */
exports.getServicios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const incluirInactivos = req.query.incluirInactivos === '1';
    const rs = await pool.request().query(`
      SELECT s.SRV_ID as id, s.SRV_NOMBRE as nombre, s.SRV_DESCRIPCION as descripcion,
             s.SRV_PROVEEDOR_ID as proveedorId, p.PROV_NOMBRE as proveedorNombre, s.SRV_ACTIVO as activo
      FROM TI_SERVICIOS s
      LEFT JOIN TI_PROVEEDORES p ON p.PROV_ID = s.SRV_PROVEEDOR_ID
      ${incluirInactivos ? '' : 'WHERE s.SRV_ACTIVO = 1'}
      ORDER BY s.SRV_NOMBRE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando servicios:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createServicio = async (req, res) => {
  try {
    const { nombre, descripcion, proveedorId } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('proveedorId', sql.Int, proveedorId || null)
      .query(`INSERT INTO TI_SERVICIOS (SRV_NOMBRE, SRV_DESCRIPCION, SRV_PROVEEDOR_ID)
              VALUES (@nombre, @descripcion, @proveedorId); SELECT SCOPE_IDENTITY() as id;`);
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), nombre, descripcion: descripcion || null, proveedorId: proveedorId || null, activo: true } });
  } catch (e) {
    console.error('Error creando servicio:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateServicio = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, proveedorId } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('proveedorId', sql.Int, proveedorId || null)
      .query(`UPDATE TI_SERVICIOS SET SRV_NOMBRE=@nombre, SRV_DESCRIPCION=@descripcion, SRV_PROVEEDOR_ID=@proveedorId WHERE SRV_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando servicio:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleServicioActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE TI_SERVICIOS SET SRV_ACTIVO = 1 - SRV_ACTIVO WHERE SRV_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de servicio:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Días festivos (excluidos del cálculo de SLA — ver minutosLaborablesEntre en ticketController.js) ── */
exports.getDiasFestivos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT FEST_ID as id, CONVERT(varchar(10), FEST_FECHA, 23) as fecha, FEST_DESCRIPCION as descripcion
      FROM TI_DIAS_FESTIVOS ORDER BY FEST_FECHA`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando días festivos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createDiaFestivo = async (req, res) => {
  try {
    const { fecha, descripcion } = req.body;
    if (!fecha) return res.status(400).json({ success: false, message: 'fecha requerida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('fecha', sql.Date, fecha)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .query(`INSERT INTO TI_DIAS_FESTIVOS (FEST_FECHA, FEST_DESCRIPCION) VALUES (@fecha, @descripcion); SELECT SCOPE_IDENTITY() as id;`);
    require('./ticketController').invalidarCacheFeriados(req.user?.empresa);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'catalogos-ti', accion:'crear-dia-festivo', entidadId: String(ins.recordset[0].id), detalle:{ fecha, descripcion }, ip:req.ip });
    res.status(201).json({ success: true, data: { id: Number(ins.recordset[0].id), fecha, descripcion: descripcion || null } });
  } catch (e) {
    console.error('Error creando día festivo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteDiaFestivo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM TI_DIAS_FESTIVOS WHERE FEST_ID=@id`);
    require('./ticketController').invalidarCacheFeriados(req.user?.empresa);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando día festivo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Config general (fila única). ZONA_HORARIA es informativa, no funcional
   — ver comentario en schemaService.js. ── */
exports.getConfigGeneral = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`SELECT TOP 1 TCG_ZONA_HORARIA as zonaHoraria FROM TI_CONFIG_GENERAL ORDER BY TCG_ID`);
    res.json({ success: true, data: rs.recordset[0] || { zonaHoraria: 'America/Mexico_City' } });
  } catch (e) {
    console.error('Error obteniendo config general:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateConfigGeneral = async (req, res) => {
  try {
    const { zonaHoraria } = req.body;
    if (!zonaHoraria) return res.status(400).json({ success: false, message: 'zonaHoraria requerida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('zh', sql.NVarChar, zonaHoraria).query(`
      UPDATE TI_CONFIG_GENERAL SET TCG_ZONA_HORARIA=@zh, TCG_FECHA_ACTUALIZACION=GETDATE()
      WHERE TCG_ID = (SELECT TOP 1 TCG_ID FROM TI_CONFIG_GENERAL ORDER BY TCG_ID)
    `);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'catalogos-ti', accion:'actualizar-config-general', entidadId: 'zona-horaria', detalle:{ zonaHoraria }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando config general:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Integraciones (placeholder clave/valor, sin cifrado — ver comentario en schemaService.js) ── */
exports.getIntegraciones = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`SELECT INT_ID as id, INT_CLAVE as clave, INT_VALOR as valor, INT_FECHA_ACTUALIZACION as fechaActualizacion FROM TI_INTEGRACIONES_CONFIG ORDER BY INT_CLAVE`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando integraciones:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.setIntegracion = async (req, res) => {
  try {
    const { clave, valor } = req.body;
    if (!clave) return res.status(400).json({ success: false, message: 'clave requerida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('clave', sql.NVarChar, clave)
      .input('valor', sql.NVarChar, valor || null)
      .query(`
        MERGE dbo.TI_INTEGRACIONES_CONFIG AS target
        USING (SELECT @clave AS clave) AS src
        ON target.INT_CLAVE = src.clave
        WHEN MATCHED THEN UPDATE SET INT_VALOR = @valor, INT_FECHA_ACTUALIZACION = GETDATE()
        WHEN NOT MATCHED THEN INSERT (INT_CLAVE, INT_VALOR) VALUES (@clave, @valor);
      `);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'catalogos-ti', accion:'set-integracion', entidadId: clave, detalle:{ clave }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error guardando integración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteIntegracion = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM TI_INTEGRACIONES_CONFIG WHERE INT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando integración:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
