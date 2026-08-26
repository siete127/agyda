const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { upsertKpi } = require('./areasController');
const logger = global.logger || require('../utils/logger');

async function listMantenimientos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT TM_ID as id, TM_ACTIVO_ID as activoId, TM_TIPO as tipo, TM_FECHA as fecha,
             TM_RESPONSABLE_ID as responsableId, TM_NOTAS as notas
      FROM TI_MANTENIMIENTOS ORDER BY TM_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listMantenimientos', err);
    res.status(500).json({ success: false, message: 'Error al listar mantenimientos' });
  }
}

async function crearMantenimiento(req, res) {
  try {
    const { activoId, tipo, responsableId, notas } = req.body;
    if (!tipo) return res.status(400).json({ success: false, message: 'Tipo requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('activoId', sql.Int, activoId || null)
      .input('tipo', sql.NVarChar, tipo)
      .input('responsableId', sql.Int, responsableId || null)
      .input('notas', sql.NVarChar, notas || null)
      .query(`INSERT INTO TI_MANTENIMIENTOS (TM_ACTIVO_ID, TM_TIPO, TM_RESPONSABLE_ID, TM_NOTAS) VALUES (@activoId, @tipo, @responsableId, @notas)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.crearMantenimiento', err);
    res.status(500).json({ success: false, message: 'Error al crear mantenimiento' });
  }
}

async function listIncidentes(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT TIS_ID as id, TIS_TIPO as tipo, TIS_SEVERIDAD as severidad, TIS_FECHA as fecha,
             TIS_ESTATUS as estatus, TIS_DESCRIPCION as descripcion
      FROM TI_INCIDENTES_SEGURIDAD ORDER BY TIS_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listIncidentes', err);
    res.status(500).json({ success: false, message: 'Error al listar incidentes' });
  }
}

async function crearIncidente(req, res) {
  try {
    const { tipo, severidad, descripcion } = req.body;
    if (!tipo) return res.status(400).json({ success: false, message: 'Tipo requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('tipo', sql.NVarChar, tipo)
      .input('severidad', sql.NVarChar, severidad || 'baja')
      .input('descripcion', sql.NVarChar, descripcion || null)
      .query(`INSERT INTO TI_INCIDENTES_SEGURIDAD (TIS_TIPO, TIS_SEVERIDAD, TIS_DESCRIPCION) VALUES (@tipo, @severidad, @descripcion)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.crearIncidente', err);
    res.status(500).json({ success: false, message: 'Error al crear incidente' });
  }
}

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const incidentesRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM TI_INCIDENTES_SEGURIDAD WHERE TIS_ESTATUS = 'abierto'
    `);
    const incidentesAbiertos = incidentesRs.recordset[0].total;

    const mantenimientosRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM TI_MANTENIMIENTOS
      WHERE MONTH(TM_FECHA) = MONTH(GETDATE()) AND YEAR(TM_FECHA) = YEAR(GETDATE())
    `);
    const mantenimientosMes = mantenimientosRs.recordset[0].total;

    const porSeveridadRs = await pool.request().query(`
      SELECT TIS_SEVERIDAD as severidad, COUNT(*) as count
      FROM TI_INCIDENTES_SEGURIDAD
      GROUP BY TIS_SEVERIDAD
    `);

    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'ti',
      kpiKey: 'incidentes_abiertos',
      label: 'Incidentes de seguridad abiertos',
      valor: incidentesAbiertos,
      unidad: '',
      tono: incidentesAbiertos > 0 ? 'critical' : 'success',
    });

    res.json({
      success: true,
      data: {
        incidentesAbiertos,
        mantenimientosMes,
        porSeveridad: porSeveridadRs.recordset,
      },
    });
  } catch (err) {
    logger.error('tecnologiaController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
}

/* ── Internet y redes: catálogo de enlaces + incidentes de conectividad ── */

async function listEnlaces(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT ENL_ID as id, ENL_NOMBRE as nombre, ENL_PROVEEDOR as proveedor, ENL_UBICACION as ubicacion,
             ENL_VELOCIDAD as velocidad, ENL_ESTADO as estado, ENL_NOTAS as notas,
             ENL_FECHA_CREACION as fechaCreacion, ENL_FECHA_ACTUALIZACION as fechaActualizacion
      FROM TI_ENLACES_RED ORDER BY ENL_NOMBRE ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listEnlaces', err);
    res.status(500).json({ success: false, message: 'Error al listar enlaces' });
  }
}

async function crearEnlace(req, res) {
  try {
    const { nombre, proveedor, ubicacion, velocidad, notas } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('proveedor', sql.NVarChar, proveedor || null)
      .input('ubicacion', sql.NVarChar, ubicacion || null)
      .input('velocidad', sql.NVarChar, velocidad || null)
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        INSERT INTO TI_ENLACES_RED (ENL_NOMBRE, ENL_PROVEEDOR, ENL_UBICACION, ENL_VELOCIDAD, ENL_NOTAS)
        VALUES (@nombre, @proveedor, @ubicacion, @velocidad, @notas);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (err) {
    logger.error('tecnologiaController.crearEnlace', err);
    res.status(500).json({ success: false, message: 'Error al crear enlace' });
  }
}

async function actualizarEnlace(req, res) {
  try {
    const { id } = req.params;
    const { nombre, proveedor, ubicacion, velocidad, estado, notas } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT ENL_ID FROM TI_ENLACES_RED WHERE ENL_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Enlace no encontrado' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('proveedor', sql.NVarChar, proveedor || null)
      .input('ubicacion', sql.NVarChar, ubicacion || null)
      .input('velocidad', sql.NVarChar, velocidad || null)
      .input('estado', sql.NVarChar, estado || 'activo')
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        UPDATE TI_ENLACES_RED
        SET ENL_NOMBRE=@nombre, ENL_PROVEEDOR=@proveedor, ENL_UBICACION=@ubicacion,
            ENL_VELOCIDAD=@velocidad, ENL_ESTADO=@estado, ENL_NOTAS=@notas, ENL_FECHA_ACTUALIZACION=GETDATE()
        WHERE ENL_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.actualizarEnlace', err);
    res.status(500).json({ success: false, message: 'Error al actualizar enlace' });
  }
}

async function eliminarEnlace(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM TI_ENLACES_RED WHERE ENL_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.eliminarEnlace', err);
    res.status(500).json({ success: false, message: 'Error al eliminar enlace' });
  }
}

async function listIncidentesRed(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT ir.IR_ID as id, ir.IR_ENLACE_ID as enlaceId, e.ENL_NOMBRE as enlaceNombre,
             ir.IR_TIPO as tipo, ir.IR_FECHA_INICIO as fechaInicio, ir.IR_FECHA_FIN as fechaFin,
             ir.IR_DESCRIPCION as descripcion, ir.IR_REPORTADO_POR as reportadoPor
      FROM TI_INCIDENTES_RED ir
      LEFT JOIN TI_ENLACES_RED e ON e.ENL_ID = ir.IR_ENLACE_ID
      ORDER BY ir.IR_FECHA_INICIO DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listIncidentesRed', err);
    res.status(500).json({ success: false, message: 'Error al listar incidentes de red' });
  }
}

async function crearIncidenteRed(req, res) {
  try {
    const { enlaceId, tipo, descripcion } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    if (enlaceId) {
      await pool.request()
        .input('enlaceId', sql.Int, enlaceId)
        .input('estado', sql.NVarChar, 'caido')
        .query('UPDATE TI_ENLACES_RED SET ENL_ESTADO=@estado, ENL_FECHA_ACTUALIZACION=GETDATE() WHERE ENL_ID=@enlaceId');
    }

    const result = await pool.request()
      .input('enlaceId', sql.Int, enlaceId || null)
      .input('tipo', sql.NVarChar, tipo || 'caida')
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('reportadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO TI_INCIDENTES_RED (IR_ENLACE_ID, IR_TIPO, IR_DESCRIPCION, IR_REPORTADO_POR)
        VALUES (@enlaceId, @tipo, @descripcion, @reportadoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (err) {
    logger.error('tecnologiaController.crearIncidenteRed', err);
    res.status(500).json({ success: false, message: 'Error al crear incidente de red' });
  }
}

// PATCH — marca el incidente como resuelto (fecha fin) y, si tiene enlace asociado, lo vuelve a 'activo'.
async function resolverIncidenteRed(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT IR_ENLACE_ID as enlaceId FROM TI_INCIDENTES_RED WHERE IR_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Incidente no encontrado' });

    await pool.request().input('id', sql.Int, id).query('UPDATE TI_INCIDENTES_RED SET IR_FECHA_FIN=GETDATE() WHERE IR_ID=@id');

    const enlaceId = existing.recordset[0].enlaceId;
    if (enlaceId) {
      await pool.request()
        .input('enlaceId', sql.Int, enlaceId)
        .input('estado', sql.NVarChar, 'activo')
        .query('UPDATE TI_ENLACES_RED SET ENL_ESTADO=@estado, ENL_FECHA_ACTUALIZACION=GETDATE() WHERE ENL_ID=@enlaceId');
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.resolverIncidenteRed', err);
    res.status(500).json({ success: false, message: 'Error al resolver incidente de red' });
  }
}

async function getDashboardRed(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const enlacesRs = await pool.request().query(`SELECT ENL_ESTADO as estado, COUNT(*) as total FROM TI_ENLACES_RED GROUP BY ENL_ESTADO`);
    const incidentesAbiertosRs = await pool.request().query(`SELECT COUNT(*) as total FROM TI_INCIDENTES_RED WHERE IR_FECHA_FIN IS NULL`);
    const incidentesAbiertos = incidentesAbiertosRs.recordset[0].total;

    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'ti',
      kpiKey: 'enlaces_caidos',
      label: 'Enlaces de red caídos',
      valor: enlacesRs.recordset.find((e) => e.estado === 'caido')?.total ?? 0,
      unidad: '',
      tono: incidentesAbiertos > 0 ? 'critical' : 'success',
    });

    res.json({
      success: true,
      data: {
        porEstado: enlacesRs.recordset,
        incidentesAbiertos,
      },
    });
  } catch (err) {
    logger.error('tecnologiaController.getDashboardRed', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard de red' });
  }
}

/* ── Respaldos: qué se respalda + bitácora de ejecuciones ── */

async function listRespaldosConfig(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        c.RC_ID as id, c.RC_NOMBRE as nombre, c.RC_DESCRIPCION as descripcion,
        c.RC_PERIODICIDAD_DIAS as periodicidadDias, c.RC_ACTIVO as activo,
        u.RR_FECHA as ultimoRespaldoFecha, u.RR_EXITO as ultimoRespaldoExito
      FROM TI_RESPALDOS_CONFIG c
      OUTER APPLY (
        SELECT TOP 1 RR_FECHA, RR_EXITO FROM TI_RESPALDOS_REGISTROS
        WHERE RR_CONFIG_ID = c.RC_ID ORDER BY RR_FECHA DESC
      ) u
      ORDER BY c.RC_NOMBRE ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listRespaldosConfig', err);
    res.status(500).json({ success: false, message: 'Error al listar la configuración de respaldos' });
  }
}

async function crearRespaldoConfig(req, res) {
  try {
    const { nombre, descripcion, periodicidadDias } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('periodicidad', sql.Int, Number(periodicidadDias) > 0 ? Number(periodicidadDias) : 1)
      .query(`
        INSERT INTO TI_RESPALDOS_CONFIG (RC_NOMBRE, RC_DESCRIPCION, RC_PERIODICIDAD_DIAS)
        VALUES (@nombre, @descripcion, @periodicidad);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (err) {
    logger.error('tecnologiaController.crearRespaldoConfig', err);
    res.status(500).json({ success: false, message: 'Error al crear la configuración de respaldo' });
  }
}

async function actualizarRespaldoConfig(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, periodicidadDias, activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT RC_ID FROM TI_RESPALDOS_CONFIG WHERE RC_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Configuración no encontrada' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('periodicidad', sql.Int, Number(periodicidadDias) > 0 ? Number(periodicidadDias) : 1)
      .input('activo', sql.Bit, activo !== false)
      .query(`
        UPDATE TI_RESPALDOS_CONFIG
        SET RC_NOMBRE=@nombre, RC_DESCRIPCION=@descripcion, RC_PERIODICIDAD_DIAS=@periodicidad, RC_ACTIVO=@activo
        WHERE RC_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.actualizarRespaldoConfig', err);
    res.status(500).json({ success: false, message: 'Error al actualizar la configuración de respaldo' });
  }
}

async function eliminarRespaldoConfig(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM TI_RESPALDOS_CONFIG WHERE RC_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.eliminarRespaldoConfig', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la configuración de respaldo' });
  }
}

async function listRespaldosRegistros(req, res) {
  try {
    const { configId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    let where = '';
    if (configId) { where = 'WHERE r.RR_CONFIG_ID = @configId'; request.input('configId', sql.Int, configId); }
    const rs = await request.query(`
      SELECT r.RR_ID as id, r.RR_CONFIG_ID as configId, c.RC_NOMBRE as configNombre,
             r.RR_FECHA as fecha, r.RR_EXITO as exito, r.RR_NOTAS as notas, r.RR_REGISTRADO_POR as registradoPor
      FROM TI_RESPALDOS_REGISTROS r
      INNER JOIN TI_RESPALDOS_CONFIG c ON c.RC_ID = r.RR_CONFIG_ID
      ${where}
      ORDER BY r.RR_FECHA DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listRespaldosRegistros', err);
    res.status(500).json({ success: false, message: 'Error al listar los registros de respaldo' });
  }
}

async function crearRespaldoRegistro(req, res) {
  try {
    const { configId, exito, notas } = req.body;
    if (!configId) return res.status(400).json({ success: false, message: 'configId requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('configId', sql.Int, configId)
      .input('exito', sql.Bit, exito !== false)
      .input('notas', sql.NVarChar, notas || null)
      .input('registradoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO TI_RESPALDOS_REGISTROS (RR_CONFIG_ID, RR_EXITO, RR_NOTAS, RR_REGISTRADO_POR)
        VALUES (@configId, @exito, @notas, @registradoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (err) {
    logger.error('tecnologiaController.crearRespaldoRegistro', err);
    res.status(500).json({ success: false, message: 'Error al registrar el respaldo' });
  }
}

/* ── Sistemas: catálogo de aplicaciones/servicios internos + su estado ── */

async function listSistemas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT SIS_ID as id, SIS_NOMBRE as nombre, SIS_DESCRIPCION as descripcion, SIS_URL as url,
             SIS_ESTADO as estado, SIS_NOTAS as notas,
             SIS_FECHA_CREACION as fechaCreacion, SIS_FECHA_ACTUALIZACION as fechaActualizacion
      FROM TI_SISTEMAS ORDER BY SIS_NOMBRE ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listSistemas', err);
    res.status(500).json({ success: false, message: 'Error al listar sistemas' });
  }
}

async function crearSistema(req, res) {
  try {
    const { nombre, descripcion, url, notas } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('url', sql.NVarChar, url || null)
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        INSERT INTO TI_SISTEMAS (SIS_NOMBRE, SIS_DESCRIPCION, SIS_URL, SIS_NOTAS)
        VALUES (@nombre, @descripcion, @url, @notas);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (err) {
    logger.error('tecnologiaController.crearSistema', err);
    res.status(500).json({ success: false, message: 'Error al crear el sistema' });
  }
}

async function actualizarSistema(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, url, estado, notas } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT SIS_ID FROM TI_SISTEMAS WHERE SIS_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Sistema no encontrado' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('url', sql.NVarChar, url || null)
      .input('estado', sql.NVarChar, estado || 'operativo')
      .input('notas', sql.NVarChar, notas || null)
      .query(`
        UPDATE TI_SISTEMAS
        SET SIS_NOMBRE=@nombre, SIS_DESCRIPCION=@descripcion, SIS_URL=@url,
            SIS_ESTADO=@estado, SIS_NOTAS=@notas, SIS_FECHA_ACTUALIZACION=GETDATE()
        WHERE SIS_ID=@id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.actualizarSistema', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el sistema' });
  }
}

async function eliminarSistema(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM TI_SISTEMAS WHERE SIS_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.eliminarSistema', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el sistema' });
  }
}

async function listIncidentesSistema(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT isi.ISI_ID as id, isi.ISI_SISTEMA_ID as sistemaId, s.SIS_NOMBRE as sistemaNombre,
             isi.ISI_TIPO as tipo, isi.ISI_FECHA_INICIO as fechaInicio, isi.ISI_FECHA_FIN as fechaFin,
             isi.ISI_DESCRIPCION as descripcion, isi.ISI_REPORTADO_POR as reportadoPor
      FROM TI_INCIDENTES_SISTEMA isi
      LEFT JOIN TI_SISTEMAS s ON s.SIS_ID = isi.ISI_SISTEMA_ID
      ORDER BY isi.ISI_FECHA_INICIO DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.listIncidentesSistema', err);
    res.status(500).json({ success: false, message: 'Error al listar incidentes de sistema' });
  }
}

async function crearIncidenteSistema(req, res) {
  try {
    const { sistemaId, tipo, descripcion } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    if (sistemaId) {
      await pool.request()
        .input('sistemaId', sql.Int, sistemaId)
        .input('estado', sql.NVarChar, 'caido')
        .query('UPDATE TI_SISTEMAS SET SIS_ESTADO=@estado, SIS_FECHA_ACTUALIZACION=GETDATE() WHERE SIS_ID=@sistemaId');
    }

    const result = await pool.request()
      .input('sistemaId', sql.Int, sistemaId || null)
      .input('tipo', sql.NVarChar, tipo || 'caido')
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('reportadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO TI_INCIDENTES_SISTEMA (ISI_SISTEMA_ID, ISI_TIPO, ISI_DESCRIPCION, ISI_REPORTADO_POR)
        VALUES (@sistemaId, @tipo, @descripcion, @reportadoPor);
        SELECT SCOPE_IDENTITY() as id;
      `);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (err) {
    logger.error('tecnologiaController.crearIncidenteSistema', err);
    res.status(500).json({ success: false, message: 'Error al crear incidente de sistema' });
  }
}

async function resolverIncidenteSistema(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT ISI_SISTEMA_ID as sistemaId FROM TI_INCIDENTES_SISTEMA WHERE ISI_ID = @id');
    if (existing.recordset.length === 0) return res.status(404).json({ success: false, message: 'Incidente no encontrado' });

    await pool.request().input('id', sql.Int, id).query('UPDATE TI_INCIDENTES_SISTEMA SET ISI_FECHA_FIN=GETDATE() WHERE ISI_ID=@id');

    const sistemaId = existing.recordset[0].sistemaId;
    if (sistemaId) {
      await pool.request()
        .input('sistemaId', sql.Int, sistemaId)
        .input('estado', sql.NVarChar, 'operativo')
        .query('UPDATE TI_SISTEMAS SET SIS_ESTADO=@estado, SIS_FECHA_ACTUALIZACION=GETDATE() WHERE SIS_ID=@sistemaId');
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.resolverIncidenteSistema', err);
    res.status(500).json({ success: false, message: 'Error al resolver incidente de sistema' });
  }
}

async function getDashboardSistemas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const sistemasRs = await pool.request().query(`SELECT SIS_ESTADO as estado, COUNT(*) as total FROM TI_SISTEMAS GROUP BY SIS_ESTADO`);
    const incidentesAbiertosRs = await pool.request().query(`SELECT COUNT(*) as total FROM TI_INCIDENTES_SISTEMA WHERE ISI_FECHA_FIN IS NULL`);
    const incidentesAbiertos = incidentesAbiertosRs.recordset[0].total;

    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'ti',
      kpiKey: 'sistemas_caidos',
      label: 'Sistemas internos caídos',
      valor: sistemasRs.recordset.find((s) => s.estado === 'caido')?.total ?? 0,
      unidad: '',
      tono: incidentesAbiertos > 0 ? 'critical' : 'success',
    });

    res.json({ success: true, data: { porEstado: sistemasRs.recordset, incidentesAbiertos } });
  } catch (err) {
    logger.error('tecnologiaController.getDashboardSistemas', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard de sistemas' });
  }
}

module.exports = {
  listMantenimientos,
  crearMantenimiento,
  listIncidentes,
  crearIncidente,
  getDashboard,
  listEnlaces,
  crearEnlace,
  actualizarEnlace,
  eliminarEnlace,
  listIncidentesRed,
  crearIncidenteRed,
  resolverIncidenteRed,
  getDashboardRed,
  listRespaldosConfig,
  crearRespaldoConfig,
  actualizarRespaldoConfig,
  eliminarRespaldoConfig,
  listRespaldosRegistros,
  crearRespaldoRegistro,
  listSistemas,
  crearSistema,
  actualizarSistema,
  eliminarSistema,
  listIncidentesSistema,
  crearIncidenteSistema,
  resolverIncidenteSistema,
  getDashboardSistemas,
};
