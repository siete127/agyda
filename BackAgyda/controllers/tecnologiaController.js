const sql = require('mssql');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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

/* ═══════════════════════════════════════════════════════════════════════
   Monitoreo de red en vivo — ingesta del agente PowerShell + lecturas
   ═══════════════════════════════════════════════════════════════════════ */

const AGENTE_INACTIVO_MIN = 6;      // sin señal en N min → agente "sin señal"
const DISP_OFFLINE_MIN = 6;         // no visto en N min → dispositivo offline
const RETENCION_DIAS = 90;          // mediciones más viejas se purgan

// POST /api/tecnologia/red/ingesta  (apiKeyAuth — el pool viene de req.dbPool)
// Body: { agente:{ nombre, version?, so?, ipLocal?, gateway? }, enlaceId?,
//         online, latenciaMs?, jitterMs?, perdidaPct?, downMbps?, upMbps?,
//         linkMbps?, adaptadorUp?, dispositivos:[{ mac, ip?, hostname?, fabricante?, origen? }] }
async function ingestaRed(req, res) {
  try {
    const pool = req.dbPool || await databaseService.getPool(req.query.empresa || req.body?.empresa);
    const b = req.body || {};

    const online = b.online === true || b.online === 1 || b.online === '1';
    const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    const enlaceId = num(b.enlaceId);
    const dispositivos = Array.isArray(b.dispositivos) ? b.dispositivos : [];
    const agente = b.agente || {};
    const nombreAgente = String(agente.nombre || b.origen || 'agente-desconocido').slice(0, 120);
    const router = b.router || {};

    // 1) upsert del agente
    let agenteId = null;
    try {
      const ag = await pool.request()
        .input('nombre', sql.NVarChar, nombreAgente)
        .input('enlaceId', sql.Int, enlaceId)
        .input('version', sql.NVarChar, (agente.version || null))
        .input('so', sql.NVarChar, (agente.so || null))
        .input('ipLocal', sql.NVarChar, (agente.ipLocal || null))
        .input('gateway', sql.NVarChar, (agente.gateway || null))
        .input('rEstado', sql.NVarChar, (router.estado || null))
        .input('rMarca', sql.NVarChar, (router.marca || null))
        .input('rModelo', sql.NVarChar, (router.modelo ? String(router.modelo).slice(0, 120) : null))
        .input('rMetodo', sql.NVarChar, (router.metodo || null))
        .query(`
          MERGE dbo.TI_RED_AGENTES AS t
          USING (SELECT @nombre AS RA_NOMBRE) AS s ON t.RA_NOMBRE = s.RA_NOMBRE
          WHEN MATCHED THEN UPDATE SET
            RA_ENLACE_ID = COALESCE(@enlaceId, t.RA_ENLACE_ID),
            RA_VERSION = @version, RA_SO = @so, RA_IP_LOCAL = @ipLocal,
            RA_GATEWAY = @gateway, RA_ULTIMA_SENAL = GETDATE(),
            RA_ROUTER_ESTADO = @rEstado, RA_ROUTER_MARCA = COALESCE(@rMarca, t.RA_ROUTER_MARCA),
            RA_ROUTER_MODELO = COALESCE(@rModelo, t.RA_ROUTER_MODELO), RA_ROUTER_METODO = @rMetodo
          WHEN NOT MATCHED THEN INSERT
            (RA_NOMBRE, RA_ENLACE_ID, RA_VERSION, RA_SO, RA_IP_LOCAL, RA_GATEWAY, RA_ULTIMA_SENAL,
             RA_ROUTER_ESTADO, RA_ROUTER_MARCA, RA_ROUTER_MODELO, RA_ROUTER_METODO)
            VALUES (@nombre, @enlaceId, @version, @so, @ipLocal, @gateway, GETDATE(),
                    @rEstado, @rMarca, @rModelo, @rMetodo)
          OUTPUT INSERTED.RA_ID;
        `);
      agenteId = ag.recordset[0]?.RA_ID ?? null;
    } catch (e) { logger.warn('ingestaRed: upsert agente', e.message); }

    // 2) medición
    const med = await pool.request()
      .input('enlaceId', sql.Int, enlaceId)
      .input('agenteId', sql.Int, agenteId)
      .input('online', sql.Bit, online ? 1 : 0)
      .input('lat', sql.Decimal(7, 2), num(b.latenciaMs))
      .input('jit', sql.Decimal(7, 2), num(b.jitterMs))
      .input('loss', sql.Decimal(5, 2), num(b.perdidaPct))
      .input('down', sql.Decimal(9, 2), num(b.downMbps))
      .input('up', sql.Decimal(9, 2), num(b.upMbps))
      .input('link', sql.Decimal(9, 2), num(b.linkMbps))
      .input('adapUp', sql.Bit, b.adaptadorUp === undefined ? null : (b.adaptadorUp ? 1 : 0))
      .input('disp', sql.Int, dispositivos.length)
      .input('origen', sql.NVarChar, nombreAgente)
      .query(`
        INSERT INTO dbo.TI_RED_MEDICIONES
          (RM_ENLACE_ID, RM_AGENTE_ID, RM_ONLINE, RM_LATENCIA_MS, RM_JITTER_MS, RM_PERDIDA_PCT,
           RM_DOWN_MBPS, RM_UP_MBPS, RM_LINK_MBPS, RM_ADAPTADOR_UP, RM_DISP_ONLINE, RM_ORIGEN)
        OUTPUT INSERTED.RM_ID
        VALUES (@enlaceId, @agenteId, @online, @lat, @jit, @loss, @down, @up, @link, @adapUp, @disp, @origen);
      `);
    const medicionId = med.recordset[0].RM_ID;

    // 3) upsert de dispositivos vistos
    let dispGuardados = 0;
    for (const d of dispositivos) {
      const mac = String(d.mac || '').trim().toUpperCase();
      if (!mac || mac.length < 11) continue;
      try {
        await pool.request()
          .input('mac', sql.NVarChar, mac)
          .input('enlaceId', sql.Int, enlaceId)
          .input('ip', sql.NVarChar, (d.ip || null))
          .input('host', sql.NVarChar, (d.hostname || null))
          .input('fab', sql.NVarChar, (d.fabricante || null))
          .input('origen', sql.NVarChar, (d.origen || 'arp'))
          .query(`
            MERGE dbo.TI_RED_DISPOSITIVOS AS t
            USING (SELECT @mac AS RD_MAC) AS s ON t.RD_MAC = s.RD_MAC
            WHEN MATCHED THEN UPDATE SET
              RD_IP = COALESCE(@ip, t.RD_IP),
              RD_HOSTNAME = COALESCE(@host, t.RD_HOSTNAME),
              RD_FABRICANTE = COALESCE(@fab, t.RD_FABRICANTE),
              RD_ENLACE_ID = COALESCE(@enlaceId, t.RD_ENLACE_ID),
              RD_ORIGEN = @origen, RD_ULTIMA_VEZ = GETDATE(), RD_ONLINE = 1
            WHEN NOT MATCHED THEN INSERT (RD_MAC, RD_ENLACE_ID, RD_IP, RD_HOSTNAME, RD_FABRICANTE, RD_ORIGEN)
              VALUES (@mac, @enlaceId, @ip, @host, @fab, @origen);
          `);
        dispGuardados++;
      } catch (e) { logger.warn('ingestaRed: upsert disp', e.message); }
    }

    // 4) marcar offline los no vistos recientemente
    await pool.request().query(`
      UPDATE dbo.TI_RED_DISPOSITIVOS SET RD_ONLINE = 0
      WHERE RD_ONLINE = 1 AND RD_ULTIMA_VEZ < DATEADD(MINUTE, -${DISP_OFFLINE_MIN}, GETDATE())
    `);

    // 5) estado del enlace + incidentes automáticos
    if (enlaceId) {
      const enl = await pool.request().input('id', sql.Int, enlaceId)
        .query('SELECT ENL_ESTADO FROM dbo.TI_ENLACES_RED WHERE ENL_ID = @id');
      const estadoActual = enl.recordset[0]?.ENL_ESTADO;
      if (!online && estadoActual && estadoActual !== 'caido' && estadoActual !== 'mantenimiento') {
        await pool.request().input('id', sql.Int, enlaceId)
          .query(`UPDATE dbo.TI_ENLACES_RED SET ENL_ESTADO='caido', ENL_FECHA_ACTUALIZACION=GETDATE() WHERE ENL_ID=@id`);
        const abierto = await pool.request().input('id', sql.Int, enlaceId)
          .query(`SELECT TOP 1 IR_ID FROM dbo.TI_INCIDENTES_RED WHERE IR_ENLACE_ID=@id AND IR_FECHA_FIN IS NULL`);
        if (!abierto.recordset.length) {
          await pool.request().input('id', sql.Int, enlaceId)
            .query(`INSERT INTO dbo.TI_INCIDENTES_RED (IR_ENLACE_ID, IR_TIPO, IR_DESCRIPCION)
                    VALUES (@id, 'caida', 'Detectado automáticamente por el agente de monitoreo')`);
        }
      } else if (online && estadoActual === 'caido') {
        await pool.request().input('id', sql.Int, enlaceId)
          .query(`UPDATE dbo.TI_ENLACES_RED SET ENL_ESTADO='activo', ENL_FECHA_ACTUALIZACION=GETDATE() WHERE ENL_ID=@id`);
        await pool.request().input('id', sql.Int, enlaceId)
          .query(`UPDATE dbo.TI_INCIDENTES_RED SET IR_FECHA_FIN=GETDATE()
                  WHERE IR_ENLACE_ID=@id AND IR_FECHA_FIN IS NULL`);
      }
    }

    // 6) purga de mediciones viejas (barato: 1 DELETE con tope)
    await pool.request().query(`
      DELETE TOP (2000) FROM dbo.TI_RED_MEDICIONES
      WHERE RM_FECHA < DATEADD(DAY, -${RETENCION_DIAS}, GETDATE())
    `);

    res.json({ success: true, data: { medicionId, dispositivos: dispGuardados, agenteId } });
  } catch (err) {
    logger.error('tecnologiaController.ingestaRed', err);
    res.status(500).json({ success: false, message: 'Error al procesar la ingesta de red' });
  }
}

// GET /api/tecnologia/red/estado-actual
async function getEstadoActualRed(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const ultima = await pool.request().query(`
      SELECT TOP 1 RM_FECHA as fecha, RM_ONLINE as online, RM_LATENCIA_MS as latenciaMs,
             RM_JITTER_MS as jitterMs, RM_PERDIDA_PCT as perdidaPct, RM_DOWN_MBPS as downMbps,
             RM_UP_MBPS as upMbps, RM_LINK_MBPS as linkMbps, RM_ADAPTADOR_UP as adaptadorUp,
             RM_DISP_ONLINE as dispOnline, RM_ORIGEN as origen
      FROM dbo.TI_RED_MEDICIONES ORDER BY RM_FECHA DESC
    `);
    const ultimaVel = await pool.request().query(`
      SELECT TOP 1 RM_FECHA as fecha, RM_DOWN_MBPS as downMbps, RM_UP_MBPS as upMbps
      FROM dbo.TI_RED_MEDICIONES WHERE RM_DOWN_MBPS IS NOT NULL ORDER BY RM_FECHA DESC
    `);
    const disp = await pool.request().query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN RD_ONLINE=1 THEN 1 ELSE 0 END) as online
      FROM dbo.TI_RED_DISPOSITIVOS
    `);
    const agentes = await pool.request().query(`
      SELECT RA_ID as id, RA_NOMBRE as nombre, RA_ENLACE_ID as enlaceId, RA_VERSION as version,
             RA_ULTIMA_SENAL as ultimaSenal, RA_GATEWAY as gateway,
             RA_ROUTER_ESTADO as routerEstado, RA_ROUTER_MARCA as routerMarca,
             RA_ROUTER_MODELO as routerModelo, RA_ROUTER_METODO as routerMetodo,
             CASE WHEN RA_ULTIMA_SENAL >= DATEADD(MINUTE, -${AGENTE_INACTIVO_MIN}, GETDATE()) THEN 1 ELSE 0 END as vivo
      FROM dbo.TI_RED_AGENTES WHERE RA_ACTIVO = 1 ORDER BY RA_ULTIMA_SENAL DESC
    `);
    const enlaces = await pool.request().query(`
      SELECT ENL_ID as id, ENL_NOMBRE as nombre, ENL_ESTADO as estado, ENL_PROVEEDOR as proveedor
      FROM dbo.TI_ENLACES_RED ORDER BY ENL_NOMBRE
    `);
    res.json({
      success: true,
      data: {
        ultima: ultima.recordset[0] ?? null,
        ultimaVelocidad: ultimaVel.recordset[0] ?? null,
        dispositivos: { total: disp.recordset[0]?.total ?? 0, online: disp.recordset[0]?.online ?? 0 },
        agentes: agentes.recordset,
        enlaces: enlaces.recordset,
      },
    });
  } catch (err) {
    logger.error('tecnologiaController.getEstadoActualRed', err);
    res.status(500).json({ success: false, message: 'Error al obtener el estado de la red' });
  }
}

// GET /api/tecnologia/red/mediciones?enlaceId=&horas=24
async function getMedicionesRed(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const horas = Math.min(Math.max(parseInt(req.query.horas) || 24, 1), 24 * 30);
    const enlaceId = parseInt(req.query.enlaceId) || null;
    const rq = pool.request().input('horas', sql.Int, horas);
    let filtro = '';
    if (enlaceId) { rq.input('enlaceId', sql.Int, enlaceId); filtro = 'AND RM_ENLACE_ID = @enlaceId'; }
    const rs = await rq.query(`
      SELECT RM_FECHA as fecha, RM_ONLINE as online, RM_LATENCIA_MS as latenciaMs,
             RM_JITTER_MS as jitterMs, RM_PERDIDA_PCT as perdidaPct,
             RM_DOWN_MBPS as downMbps, RM_UP_MBPS as upMbps, RM_LINK_MBPS as linkMbps,
             RM_DISP_ONLINE as dispOnline
      FROM dbo.TI_RED_MEDICIONES
      WHERE RM_FECHA >= DATEADD(HOUR, -@horas, GETDATE()) ${filtro}
      ORDER BY RM_FECHA ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.getMedicionesRed', err);
    res.status(500).json({ success: false, message: 'Error al obtener las mediciones de red' });
  }
}

// GET /api/tecnologia/red/dispositivos
async function getDispositivosRed(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT RD_ID as id, RD_MAC as mac, RD_IP as ip, RD_HOSTNAME as hostname,
             RD_FABRICANTE as fabricante, RD_ALIAS as alias, RD_ORIGEN as origen,
             RD_PRIMERA_VEZ as primeraVez, RD_ULTIMA_VEZ as ultimaVez,
             RD_ONLINE as online, RD_BLOQUEADO as bloqueado
      FROM dbo.TI_RED_DISPOSITIVOS
      ORDER BY RD_ONLINE DESC, RD_ULTIMA_VEZ DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('tecnologiaController.getDispositivosRed', err);
    res.status(500).json({ success: false, message: 'Error al obtener los dispositivos de red' });
  }
}

// PATCH /api/tecnologia/red/dispositivos/:id  { alias?, bloqueado? }
async function actualizarDispositivoRed(req, res) {
  try {
    const { id } = req.params;
    const { alias, bloqueado } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);
    const existe = await pool.request().input('id', sql.Int, id)
      .query('SELECT RD_ID FROM dbo.TI_RED_DISPOSITIVOS WHERE RD_ID = @id');
    if (!existe.recordset.length) return res.status(404).json({ success: false, message: 'Dispositivo no encontrado' });
    await pool.request()
      .input('id', sql.Int, id)
      .input('alias', sql.NVarChar, alias === undefined ? null : (alias || null))
      .input('bloqueado', sql.Bit, bloqueado === undefined ? null : (bloqueado ? 1 : 0))
      .query(`
        UPDATE dbo.TI_RED_DISPOSITIVOS SET
          RD_ALIAS = COALESCE(@alias, RD_ALIAS),
          RD_BLOQUEADO = COALESCE(@bloqueado, RD_BLOQUEADO)
        WHERE RD_ID = @id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('tecnologiaController.actualizarDispositivoRed', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el dispositivo' });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Descarga del agente PRECONFIGURADO para la empresa del usuario
   ═══════════════════════════════════════════════════════════════════════ */

const AGENTE_KEY_NOMBRE = 'Agente de red — monitoreo';

// Devuelve (creándola si hace falta) la API key en texto plano para el agente
// de esta empresa. La guarda hasheada en TICKETS_API_KEYS; si ya existe una
// activa con ese nombre pero no tenemos el texto, se rota (se desactiva la
// vieja y se crea una nueva) para poder entregar una key funcional.
async function obtenerApiKeyAgente(pool, userId) {
  const rawKey = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
  // desactiva llaves previas con el mismo nombre (rotación) e inserta la nueva
  await pool.request()
    .input('nombre', sql.NVarChar, AGENTE_KEY_NOMBRE)
    .query(`UPDATE TICKETS_API_KEYS SET ACTIVA = 0 WHERE NOMBRE = @nombre AND ACTIVA = 1`);
  await pool.request()
    .input('hash', sql.NVarChar, hash)
    .input('nombre', sql.NVarChar, AGENTE_KEY_NOMBRE)
    .input('creadoPor', sql.Int, userId || null)
    .query(`INSERT INTO TICKETS_API_KEYS (KEY_HASH, NOMBRE, CREADO_POR) VALUES (@hash, @nombre, @creadoPor)`);
  return rawKey;
}

function baseUrlDe(req) {
  if (process.env.AGENTE_PUBLIC_BASE_URL) return process.env.AGENTE_PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

// Genera el instalador .ps1 autocontenido con la config de la empresa embebida.
function construirInstaladorPs1({ apiUrl, apiKey, empresa, enlaceId, agenteScriptUrl }) {
  const cfg = {
    ApiUrl: apiUrl,
    ApiKey: apiKey,
    Empresa: empresa,
    EnlaceId: enlaceId ?? null,
    PingHosts: ['8.8.8.8', '1.1.1.1', 'www.google.com'],
    SpeedtestCadaMin: 30,
    SpeedtestExe: '',
    HabilitarRouter: false,
    RouterHost: '',
    RouterUser: 'admin',
    RouterPass: '',
    RouterSnmpComunidad: 'public',
    TimeoutSeg: 30,
  };
  const cfgJson = JSON.stringify(cfg, null, 2);
  return `<#
  AGYDA - Instalador del agente de monitoreo de red (PRECONFIGURADO)
  Empresa: ${empresa}
  Generado: ${new Date().toISOString()}

  Este instalador YA trae la API key y la empresa. Solo ejecutalo como
  Administrador en una PC de la oficina (siempre encendida):
      powershell -ExecutionPolicy Bypass -File .\\install-${empresa}.ps1
#>
$ErrorActionPreference = 'Stop'
$InstallDir = 'C:\\AGYDA\\agente-red'
$TaskName   = 'AGYDA - Monitor de Red'
$AgenteUrl  = '${agenteScriptUrl}'

# ── requiere admin ──
$pr = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Ejecuta este instalador como Administrador.' -ForegroundColor Red
    exit 1
}

Write-Host '== AGYDA - Agente de red (empresa: ${empresa}) ==' -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }

# ── 1) descargar el script del agente (siempre el ultimo, sin secretos) ──
Write-Host '  descargando agente-red.ps1 ...' -ForegroundColor Gray
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $AgenteUrl -OutFile (Join-Path $InstallDir 'agente-red.ps1') -UseBasicParsing

# ── 2) escribir la config preconfigurada ──
$cfg = @'
${cfgJson}
'@
Set-Content -Path (Join-Path $InstallDir 'agente-red.config.json') -Value $cfg -Encoding UTF8
Write-Host '  config escrita (API key y empresa embebidas).' -ForegroundColor Green

# ── 3) Speedtest CLI ──
if (-not (Get-Command speedtest -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try { winget install --id Ookla.Speedtest.CLI --silent --accept-package-agreements --accept-source-agreements | Out-Null } catch {}
    }
    if (-not (Get-Command speedtest -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $InstallDir 'speedtest.exe'))) {
        try {
            $zip = Join-Path $env:TEMP 'speedtest.zip'
            Invoke-WebRequest -Uri 'https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-win64.zip' -OutFile $zip -UseBasicParsing
            Expand-Archive -Path $zip -DestinationPath $InstallDir -Force
            Remove-Item $zip -Force
        } catch { Write-Host '  (Speedtest CLI no instalado; la velocidad quedara sin datos)' -ForegroundColor Yellow }
    }
}

# ── 4) tarea programada cada 2 min ──
$ps1 = Join-Path $InstallDir 'agente-red.ps1'
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$ps1\`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "  tarea '$TaskName' registrada (cada 2 min, como SYSTEM)." -ForegroundColor Green

# ── 5) prueba ──
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 12
$log = Join-Path $InstallDir 'agente-red.log'
if (Test-Path $log) { Write-Host '  --- log ---' -ForegroundColor Gray; Get-Content $log -Tail 5 | ForEach-Object { Write-Host "   $_" } }

Write-Host ''
Write-Host 'Listo. En 2-4 min la primera medicion aparece en Internet y redes -> Monitoreo en vivo.' -ForegroundColor Green
Write-Host "Desinstalar:  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:\`$false" -ForegroundColor Gray
`;
}

// GET /api/tecnologia/red/agente/instalador?enlaceId=&formato=ps1|exe
async function descargarAgente(req, res) {
  try {
    const empresa = req.user?.empresa || 'agyda';
    const pool = await databaseService.getPool(empresa);
    const enlaceId = parseInt(req.query.enlaceId) || null;
    const formato = (req.query.formato === 'exe') ? 'exe' : 'ps1';

    const apiKey = await obtenerApiKeyAgente(pool, req.user?.id);
    const base = baseUrlDe(req);
    const ps1 = construirInstaladorPs1({
      apiUrl: `${base}/api/tecnologia/red/ingesta`,
      apiKey,
      empresa,
      enlaceId,
      agenteScriptUrl: `${base}/agente-red/agente-red.ps1`,
    });

    if (formato === 'exe') {
      // Empaquetar con PS2EXE si está disponible; si no, caer a .ps1.
      const tmpPs1 = path.join(require('os').tmpdir(), `install-${empresa}-${Date.now()}.ps1`);
      const tmpExe = tmpPs1.replace(/\.ps1$/, '.exe');
      fs.writeFileSync(tmpPs1, ps1, 'utf8');
      const { execFile } = require('child_process');
      const args = ['-NoProfile', '-Command',
        `try { Import-Module ps2exe -ErrorAction Stop } catch { Install-Module ps2exe -Scope CurrentUser -Force -ErrorAction Stop }; ` +
        `Invoke-ps2exe -inputFile '${tmpPs1}' -outputFile '${tmpExe}' -noConsole:$false -requireAdmin`];
      execFile('powershell.exe', args, { timeout: 60000 }, (err) => {
        if (err || !fs.existsSync(tmpExe)) {
          logger.warn('descargarAgente: PS2EXE no disponible, se entrega .ps1', err?.message);
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="install-${empresa}.ps1"`);
          res.send(ps1);
          try { fs.unlinkSync(tmpPs1); } catch { /* noop */ }
          return;
        }
        res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
        res.setHeader('Content-Disposition', `attachment; filename="AgenteRedAGYDA-${empresa}.exe"`);
        res.sendFile(tmpExe, () => {
          try { fs.unlinkSync(tmpPs1); } catch { /* noop */ }
          try { fs.unlinkSync(tmpExe); } catch { /* noop */ }
        });
      });
      return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="install-${empresa}.ps1"`);
    res.send(ps1);
  } catch (err) {
    logger.error('tecnologiaController.descargarAgente', err);
    res.status(500).json({ success: false, message: 'No se pudo generar el instalador del agente' });
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
  ingestaRed,
  getEstadoActualRed,
  getMedicionesRed,
  getDispositivosRed,
  actualizarDispositivoRed,
  descargarAgente,
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
