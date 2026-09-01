const sql = require('mssql');
const databaseService = require('../services/databaseService');
const dbVentas = require('../config/database_ventas');
const { upsertKpi } = require('./areasController');
const { evaluarFormula, validarFormula } = require('../services/formulaService');
const { getPausasHoyDe } = require('./reportController');
const logger = global.logger || require('../utils/logger');

// Variables disponibles para escribir fórmulas de incentivo (ver formulaService.js).
const VARIABLES_FORMULA_INCENTIVO = ['ventas', 'meta', 'pctcumplimiento', 'montocomision'];

function periodoActual() {
  return new Date().toISOString().slice(0, 7);
}

/* Pool de conexión a plata_prospectPRO (BD separada del sistema de Ventas/Vicidial,
   distinta de la BD principal de la Intranet donde vive VENTAS_METAS). */
let _ventasPool = null;
async function getVentasPool() {
  if (_ventasPool && _ventasPool.connected) return _ventasPool;
  _ventasPool = await new sql.ConnectionPool(dbVentas).connect();
  return _ventasPool;
}

// GET /api/ventas-area/asesores — asesores activos del sistema de Ventas (Users, en
// la BD plata_prospectPRO), para poblar el selector del formulario de metas.
async function listAsesores(req, res) {
  try {
    const pool = await getVentasPool();
    const rs = await pool.request().query(`
      SELECT idUser as id, nombreAgente as nombre FROM Users WHERE role='agente' AND Activo=1 ORDER BY nombreAgente
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('ventasAreaController.listAsesores', err);
    res.status(500).json({ success: false, message: 'Error al obtener los asesores' });
  }
}

// GET /api/ventas-area/campanas — campañas activas del sistema de Ventas, para el
// selector del formulario de metas.
async function listCampanas(req, res) {
  try {
    const pool = await getVentasPool();
    const rs = await pool.request().query(`SELECT id, nombre FROM [Campanas] WHERE activo = 1 ORDER BY nombre`);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('ventasAreaController.listCampanas', err);
    res.status(500).json({ success: false, message: 'Error al obtener las campañas' });
  }
}

// GET /api/ventas-area/metas?periodo= — metas del periodo (o todas si no se especifica),
// con avance real de unidades vendidas (ventas Aprobada/Formalizada/Garantizada) leído
// desde la BD del sistema de Ventas (plata_prospectPRO). VM_TIPO='diaria' -> periodo
// YYYY-MM-DD, comparado con CONVERT(DATE, fecha); 'mensual' -> YYYY-MM, con FORMAT.
async function listMetas(req, res) {
  try {
    const periodo = req.query.periodo ? req.query.periodo.toString() : null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const req1 = pool.request();
    if (periodo) req1.input('periodo', sql.NVarChar, periodo);
    const rs = await req1.query(`
      SELECT VM_ID as id, VM_ASESOR_ID as asesorId, VM_PERIODO as periodo,
             VM_META_MONTO as metaMonto, VM_META_UNIDADES as metaUnidades,
             VM_CAMPANA_ID as campanaId, VM_TIPO as tipo, VM_ALCANCE as alcance
      FROM VENTAS_METAS
      ${periodo ? 'WHERE VM_PERIODO = @periodo' : ''}
      ORDER BY VM_PERIODO DESC, VM_ASESOR_ID
    `);
    const metas = rs.recordset;

    if (metas.length === 0) return res.json({ success: true, data: [] });

    const ventasPool = await getVentasPool();

    const asesorIds = [...new Set(metas.filter((m) => m.asesorId).map((m) => m.asesorId))];
    const nombrePorId = new Map();
    if (asesorIds.length) {
      const nombresRs = await ventasPool.request().query(`SELECT idUser as id, nombreAgente as nombre FROM Users WHERE idUser IN (${asesorIds.join(',')})`);
      for (const u of nombresRs.recordset) nombrePorId.set(u.id, u.nombre);
    }

    const campanaIds = [...new Set(metas.filter((m) => m.campanaId).map((m) => m.campanaId))];
    const campanaPorId = new Map();
    if (campanaIds.length) {
      const campRs = await ventasPool.request().query(`SELECT id, nombre FROM [Campanas] WHERE id IN (${campanaIds.join(',')})`);
      for (const c of campRs.recordset) campanaPorId.set(c.id, c.nombre);
    }

    // Avance mensual: agrupado por asesor+periodo(YYYY-MM), sin filtrar campaña
    // (una meta mensual histórica no distinguía campaña).
    const mensuales = metas.filter((m) => m.tipo !== 'diaria');
    const avanceMensualPorClave = new Map();
    if (mensuales.length) {
      const periodos = [...new Set(mensuales.map((m) => m.periodo))];
      const avanceRs = await ventasPool.request().query(`
        SELECT idUser as asesorId, FORMAT(fecha, 'yyyy-MM') as periodo, COUNT(*) as unidades
        FROM Ventas
        WHERE estatus IN ('Aprobada', 'Formalizada', 'Formalizado', 'Garantizada')
          AND FORMAT(fecha, 'yyyy-MM') IN (${periodos.map((p) => `'${p}'`).join(',')})
        GROUP BY idUser, FORMAT(fecha, 'yyyy-MM')
      `);
      for (const a of avanceRs.recordset) avanceMensualPorClave.set(`${a.asesorId}|${a.periodo}`, a.unidades);
    }

    // Avance diario: por asesor+campaña+día (alcance 'asesor') o por campaña+día
    // completa (alcance 'campana', suma de todos los agentes de esa campaña).
    const diarias = metas.filter((m) => m.tipo === 'diaria');
    const avanceDiarioAsesor = new Map();   // "asesorId|campanaId|fecha" -> unidades
    const avanceDiarioCampana = new Map();  // "campanaId|fecha" -> unidades
    if (diarias.length) {
      const fechas = [...new Set(diarias.map((m) => m.periodo))];
      const fechasSql = fechas.map((f) => `'${f}'`).join(',');
      const rsAsesor = await ventasPool.request().query(`
        SELECT idUser as asesorId, campaignId as campanaId, CONVERT(varchar(10), fecha, 120) as dia, COUNT(*) as unidades
        FROM Ventas
        WHERE estatus IN ('Aprobada', 'Formalizada', 'Formalizado', 'Garantizada')
          AND CONVERT(varchar(10), fecha, 120) IN (${fechasSql})
        GROUP BY idUser, campaignId, CONVERT(varchar(10), fecha, 120)
      `);
      for (const a of rsAsesor.recordset) {
        avanceDiarioAsesor.set(`${a.asesorId}|${a.campanaId}|${a.dia}`, a.unidades);
        avanceDiarioCampana.set(`${a.campanaId}|${a.dia}`, (avanceDiarioCampana.get(`${a.campanaId}|${a.dia}`) ?? 0) + a.unidades);
      }
    }

    const data = metas.map((m) => {
      let avanceUnidades = 0;
      if (m.tipo === 'diaria') {
        avanceUnidades = m.alcance === 'campana'
          ? avanceDiarioCampana.get(`${m.campanaId}|${m.periodo}`) ?? 0
          : avanceDiarioAsesor.get(`${m.asesorId}|${m.campanaId}|${m.periodo}`) ?? 0;
      } else {
        avanceUnidades = avanceMensualPorClave.get(`${m.asesorId}|${m.periodo}`) ?? 0;
      }
      return {
        ...m,
        asesorNombre: m.asesorId ? (nombrePorId.get(m.asesorId) ?? `Asesor #${m.asesorId}`) : null,
        campanaNombre: m.campanaId ? (campanaPorId.get(m.campanaId) ?? `Campaña #${m.campanaId}`) : null,
        avanceUnidades,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    logger.error('ventasAreaController.listMetas', err);
    res.status(500).json({ success: false, message: 'Error al listar metas' });
  }
}

async function crearMeta(req, res) {
  try {
    const { asesorId, campanaId, periodo, periodoFin, tipo, alcance, metaMonto, metaUnidades } = req.body;
    const tipoNorm = tipo === 'diaria' ? 'diaria' : 'mensual';
    const alcanceNorm = alcance === 'campana' ? 'campana' : 'asesor';

    if (!periodo) return res.status(400).json({ success: false, message: 'El periodo es requerido' });
    if (alcanceNorm === 'asesor' && !asesorId) return res.status(400).json({ success: false, message: 'El asesor es requerido' });
    if (alcanceNorm === 'campana' && !campanaId) return res.status(400).json({ success: false, message: 'La campaña es requerida' });

    const asesorIdFinal = alcanceNorm === 'campana' ? 0 : Number(asesorId);
    const campanaIdFinal = campanaId ? Number(campanaId) : null;

    // Meta diaria con rango: la misma meta se replica en cada día del rango
    // [periodo .. periodoFin]. Sin periodoFin (o meta mensual) = un solo periodo.
    const fechas = [];
    if (tipoNorm === 'diaria' && periodoFin && periodoFin > periodo) {
      const d = new Date(periodo + 'T00:00:00');
      const fin = new Date(periodoFin + 'T00:00:00');
      if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime())) {
        return res.status(400).json({ success: false, message: 'Fechas del rango inválidas' });
      }
      // tope de seguridad: máximo 366 días
      let guard = 0;
      while (d <= fin && guard++ < 366) {
        fechas.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
    } else {
      fechas.push(periodo);
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    for (const f of fechas) {
      await pool.request()
        .input('asesorId', sql.Int, asesorIdFinal)
        .input('periodo', sql.NVarChar, f)
        .input('campanaId', sql.Int, campanaIdFinal)
        .input('tipo', sql.NVarChar, tipoNorm)
        .input('alcance', sql.NVarChar, alcanceNorm)
        .input('metaMonto', sql.Decimal(18, 2), metaMonto || 0)
        .input('metaUnidades', sql.Int, metaUnidades || 0)
        .query(`
          MERGE VENTAS_METAS AS t
          USING (SELECT @asesorId AS a, @periodo AS p, @campanaId AS c) AS s
            ON t.VM_ASESOR_ID = s.a AND t.VM_PERIODO = s.p AND (t.VM_CAMPANA_ID = s.c OR (t.VM_CAMPANA_ID IS NULL AND s.c IS NULL))
          WHEN MATCHED THEN UPDATE SET VM_META_MONTO = @metaMonto, VM_META_UNIDADES = @metaUnidades, VM_TIPO = @tipo, VM_ALCANCE = @alcance
          WHEN NOT MATCHED THEN INSERT (VM_ASESOR_ID, VM_PERIODO, VM_CAMPANA_ID, VM_TIPO, VM_ALCANCE, VM_META_MONTO, VM_META_UNIDADES)
            VALUES (@asesorId, @periodo, @campanaId, @tipo, @alcance, @metaMonto, @metaUnidades);
        `);
    }

    const countRs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`SELECT COUNT(*) as total FROM VENTAS_METAS WHERE VM_PERIODO = @periodo`);
    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'ventas',
      kpiKey: 'metas_definidas',
      label: 'Metas definidas este periodo',
      valor: countRs.recordset[0].total,
      unidad: '',
      tono: 'brand',
      periodo,
    });

    res.json({ success: true, data: { creadas: fechas.length } });
  } catch (err) {
    logger.error('ventasAreaController.crearMeta', err);
    res.status(500).json({ success: false, message: 'Error al guardar meta' });
  }
}

// DELETE /api/ventas-area/metas/:id
async function eliminarMeta(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM VENTAS_METAS WHERE VM_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('ventasAreaController.eliminarMeta', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la meta' });
  }
}

// GET /api/ventas-area/mis-metas — metas de HOY del usuario autenticado, para la
// card del Inicio: su meta individual diaria (si tiene) + las metas globales de
// campaña de la(s) campaña(s) donde está asignado. Vincula NEUS_USUARIOS -> Users
// (BD de ventas) por nombre, igual que el resto del módulo (no hay id compartido).
async function getMisMetas(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const nombreRs = await pool.request()
      .input('id', sql.Int, req.user?.id)
      .query(`SELECT NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID = @id`);
    const nombre = nombreRs.recordset[0]?.nombre;
    if (!nombre) return res.json({ success: true, data: [] });

    const ventasPool = await getVentasPool();
    const asesorRs = await ventasPool.request()
      .input('nombre', sql.NVarChar, nombre)
      .query(`SELECT TOP 1 idUser as id, campaign as campanaId FROM Users WHERE LTRIM(RTRIM(nombreAgente)) = LTRIM(RTRIM(@nombre)) AND Activo = 1`);
    const asesor = asesorRs.recordset[0];
    if (!asesor) return res.json({ success: true, data: [] });

    const hoy = new Date().toISOString().slice(0, 10);
    const metasRs = await pool.request()
      .input('asesorId', sql.Int, asesor.id)
      .input('campanaId', sql.Int, asesor.campanaId ?? 0)
      .input('hoy', sql.NVarChar, hoy)
      .query(`
        SELECT VM_ID as id, VM_ASESOR_ID as asesorId, VM_PERIODO as periodo,
               VM_META_UNIDADES as metaUnidades, VM_CAMPANA_ID as campanaId, VM_ALCANCE as alcance
        FROM VENTAS_METAS
        WHERE VM_TIPO = 'diaria' AND VM_PERIODO = @hoy
          AND ((VM_ALCANCE = 'asesor' AND VM_ASESOR_ID = @asesorId)
            OR (VM_ALCANCE = 'campana' AND VM_CAMPANA_ID = @campanaId))
      `);
    const metas = metasRs.recordset;
    if (!metas.length) return res.json({ success: true, data: [] });

    const campanaNombreRs = asesor.campanaId
      ? await ventasPool.request().input('id', sql.Int, asesor.campanaId).query(`SELECT nombre FROM [Campanas] WHERE id = @id`)
      : { recordset: [] };
    const campanaNombre = campanaNombreRs.recordset[0]?.nombre ?? null;

    const avanceIndividualRs = await ventasPool.request()
      .input('asesorId', sql.Int, asesor.id)
      .input('hoy', sql.NVarChar, hoy)
      .query(`
        SELECT COUNT(*) as unidades FROM Ventas
        WHERE idUser = @asesorId AND estatus IN ('Aprobada','Formalizada','Formalizado','Garantizada')
          AND CONVERT(varchar(10), fecha, 120) = @hoy
      `);
    const avanceIndividual = avanceIndividualRs.recordset[0]?.unidades ?? 0;

    const avanceCampanaRs = asesor.campanaId
      ? await ventasPool.request()
          .input('campanaId', sql.Int, asesor.campanaId)
          .input('hoy', sql.NVarChar, hoy)
          .query(`
            SELECT COUNT(*) as unidades FROM Ventas
            WHERE campaignId = @campanaId AND estatus IN ('Aprobada','Formalizada','Formalizado','Garantizada')
              AND CONVERT(varchar(10), fecha, 120) = @hoy
          `)
      : { recordset: [{ unidades: 0 }] };
    const avanceCampana = avanceCampanaRs.recordset[0]?.unidades ?? 0;

    const data = metas.map((m) => ({
      id: m.id,
      alcance: m.alcance,
      campanaId: m.campanaId,
      campanaNombre,
      metaUnidades: m.metaUnidades ?? 0,
      avanceUnidades: m.alcance === 'campana' ? avanceCampana : avanceIndividual,
    }));

    res.json({ success: true, data });
  } catch (err) {
    logger.error('ventasAreaController.getMisMetas', err);
    res.status(500).json({ success: false, message: 'Error al obtener tus metas' });
  }
}

// GET /api/ventas-area/metas/:id/pausas — desglose de tiempos de pausa de HOY
// (baño, comida, capacitación, permiso) de la(s) persona(s) de una meta.
//   - alcance 'asesor'  -> una fila: el asesor de la meta.
//   - alcance 'campana' -> una fila por cada agente activo de la campaña.
// Cruza Users (BD de ventas) -> NEUS_USUARIOS por nombre y suma de USUARIO_TIEMPOS.
async function getMetaPausas(req, res) {
  try {
    const metaId = parseInt(req.params.id, 10);
    if (!metaId) return res.status(400).json({ success: false, message: 'Meta inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const metaRs = await pool.request()
      .input('id', sql.Int, metaId)
      .query(`SELECT VM_ASESOR_ID as asesorId, VM_CAMPANA_ID as campanaId, VM_ALCANCE as alcance FROM VENTAS_METAS WHERE VM_ID = @id`);
    const meta = metaRs.recordset[0];
    if (!meta) return res.status(404).json({ success: false, message: 'Meta no encontrada' });

    const ventasPool = await getVentasPool();

    // Lista de agentes { id, nombre } según el alcance.
    let agentes = [];
    if (meta.alcance === 'campana' && meta.campanaId) {
      const rs = await ventasPool.request()
        .input('c', sql.Int, meta.campanaId)
        .query(`SELECT idUser as id, nombreAgente as nombre FROM Users WHERE campaign = @c AND role = 'agente' AND Activo = 1 ORDER BY nombreAgente`);
      agentes = rs.recordset;
    } else if (meta.asesorId) {
      const rs = await ventasPool.request()
        .input('a', sql.Int, meta.asesorId)
        .query(`SELECT idUser as id, nombreAgente as nombre FROM Users WHERE idUser = @a`);
      agentes = rs.recordset;
    }
    if (!agentes.length) return res.json({ success: true, data: { alcance: meta.alcance, agentes: [] } });

    // Nombre -> NEUS_ID (los usuarios de asistencia/pausas viven en la Intranet).
    const nombres = [...new Set(agentes.map((a) => a.nombre).filter(Boolean))];
    const neusPorNombre = new Map();
    for (const nombre of nombres) {
      const r = await pool.request()
        .input('n', sql.NVarChar, nombre)
        .query(`SELECT TOP 1 NEUS_ID as id FROM NEUS_USUARIOS WHERE LTRIM(RTRIM(NEUS_NOMBRES)) = LTRIM(RTRIM(@n)) AND NEUS_ACTIVO = 1`);
      if (r.recordset[0]) neusPorNombre.set(nombre, r.recordset[0].id);
    }

    const data = [];
    for (const a of agentes) {
      const neusId = neusPorNombre.get(a.nombre);
      if (!neusId) {
        data.push({ agenteId: a.id, nombre: a.nombre, sinRegistro: true, comidaSeg: 0, banioSeg: 0, capacitacionSeg: 0, permisoSeg: 0, totalSeg: 0 });
        continue;
      }
      const p = await getPausasHoyDe(pool, neusId);
      const totalSeg = p[2] + p[3] + p[5] + p[6];
      data.push({
        agenteId: a.id, nombre: a.nombre, sinRegistro: false,
        comidaSeg: p[2], banioSeg: p[3], capacitacionSeg: p[5], permisoSeg: p[6], totalSeg,
      });
    }

    res.json({ success: true, data: { alcance: meta.alcance, agentes: data } });
  } catch (err) {
    logger.error('ventasAreaController.getMetaPausas', err);
    res.status(500).json({ success: false, message: 'Error al obtener los tiempos de pausa' });
  }
}

async function getDashboard(req, res) {
  try {
    const periodo = req.query.periodo || periodoActual();
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT COUNT(*) as metasDefinidas, ISNULL(SUM(VM_META_MONTO), 0) as metaMontoTotal
        FROM VENTAS_METAS WHERE VM_PERIODO = @periodo
      `);
    const { metasDefinidas, metaMontoTotal } = rs.recordset[0];
    res.json({ success: true, data: { metasDefinidas, metaMontoTotal } });
  } catch (err) {
    logger.error('ventasAreaController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener el dashboard de ventas' });
  }
}

// GET /api/ventas-area/reportes-resultados?periodo=day|week|month&fecha=YYYY-MM-DD —
// resultados de ventas del periodo, agrupados por agente y por campaña (Aprobada,
// Rechazada/Declinado, Pendiente, Formalizada/Formalizado, Garantizada). Reutiliza la
// misma tabla Ventas del sistema legado (plata_prospectPRO), expuesto con el auth de
// la Intranet en vez del token separado de Vicidial.
async function getReporteResultados(req, res) {
  try {
    const periodo = ['day', 'week', 'month'].includes(req.query.periodo) ? req.query.periodo : 'month';
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString().slice(0, 10);
    const pool = await getVentasPool();

    let periodFilter = '';
    if (periodo === 'day') periodFilter = `AND CONVERT(DATE, v.fecha) = @fecha`;
    if (periodo === 'week') periodFilter = `AND DATEPART(week, v.fecha) = DATEPART(week, @fecha) AND DATEPART(year, v.fecha) = DATEPART(year, @fecha)`;
    if (periodo === 'month') periodFilter = `AND DATEPART(month, v.fecha) = DATEPART(month, @fecha) AND DATEPART(year, v.fecha) = DATEPART(year, @fecha)`;

    const ESTATUS_CASE = `
      SUM(CASE WHEN v.estatus='Aprobada' THEN 1 ELSE 0 END) AS aprobadas,
      SUM(CASE WHEN v.estatus IN ('Rechazada','Declinado') THEN 1 ELSE 0 END) AS rechazadas,
      SUM(CASE WHEN v.estatus='Pendiente' THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN v.estatus IN ('Formalizada','Formalizado') THEN 1 ELSE 0 END) AS formalizadas,
      SUM(CASE WHEN v.estatus='Garantizada' THEN 1 ELSE 0 END) AS garantizadas,
      COUNT(v.idVenta) AS total
    `;

    const porAgenteRs = await pool.request()
      .input('fecha', sql.Date, fecha)
      .query(`
        SELECT u.idUser AS agentId, u.nombreAgente, u.campaign AS campaignId, c.nombre AS campaignNombre, ${ESTATUS_CASE}
        FROM Users u
        LEFT JOIN Ventas v ON v.idUser = u.idUser ${periodFilter}
        LEFT JOIN [Campanas] c ON c.id = u.campaign
        WHERE u.role='agente' AND u.Activo=1
        GROUP BY u.idUser, u.nombreAgente, u.campaign, c.nombre
        ORDER BY total DESC
      `);

    const porCampaniaRs = await pool.request()
      .input('fecha', sql.Date, fecha)
      .query(`
        SELECT c.id AS campaniaId, c.nombre AS campaniaNombre, ${ESTATUS_CASE}
        FROM [Campanas] c
        LEFT JOIN Users u ON u.campaign = c.id AND u.role='agente' AND u.Activo=1
        LEFT JOIN Ventas v ON v.idUser = u.idUser ${periodFilter}
        GROUP BY c.id, c.nombre
        ORDER BY total DESC
      `);

    const sumar = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
    const totales = {
      aprobadas: sumar(porAgenteRs.recordset, 'aprobadas'),
      rechazadas: sumar(porAgenteRs.recordset, 'rechazadas'),
      pendientes: sumar(porAgenteRs.recordset, 'pendientes'),
      formalizadas: sumar(porAgenteRs.recordset, 'formalizadas'),
      garantizadas: sumar(porAgenteRs.recordset, 'garantizadas'),
      total: sumar(porAgenteRs.recordset, 'total'),
    };

    res.json({
      success: true,
      data: {
        periodo,
        fecha,
        totales,
        porAgente: porAgenteRs.recordset,
        porCampania: porCampaniaRs.recordset,
      },
    });
  } catch (err) {
    logger.error('ventasAreaController.getReporteResultados', err);
    res.status(500).json({ success: false, message: 'Error al obtener el reporte de resultados' });
  }
}

// GET /api/ventas-area/asesores/:id/perfil?periodo=day|week|month&fecha=YYYY-MM-DD —
// ficha individual de un asesor: sus resultados del periodo (mismo desglose que
// getReporteResultados, acotado a este asesor), su % de conversión, y su meta activa
// del mes con avance (de VENTAS_METAS), si tiene una registrada.
async function getPerfilAsesor(req, res) {
  try {
    const asesorId = parseInt(req.params.id, 10);
    if (!asesorId) return res.status(400).json({ success: false, message: 'Asesor inválido' });
    const periodo = ['day', 'week', 'month'].includes(req.query.periodo) ? req.query.periodo : 'month';
    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10)).toString().slice(0, 10);

    const pool = await getVentasPool();
    let periodFilter = '';
    if (periodo === 'day') periodFilter = `AND CONVERT(DATE, v.fecha) = @fecha`;
    if (periodo === 'week') periodFilter = `AND DATEPART(week, v.fecha) = DATEPART(week, @fecha) AND DATEPART(year, v.fecha) = DATEPART(year, @fecha)`;
    if (periodo === 'month') periodFilter = `AND DATEPART(month, v.fecha) = DATEPART(month, @fecha) AND DATEPART(year, v.fecha) = DATEPART(year, @fecha)`;

    const asesorRs = await pool.request()
      .input('asesorId', sql.Int, asesorId)
      .query(`
        SELECT u.idUser as id, u.nombreAgente as nombre, u.campaign as campaignId, c.nombre as campaignNombre
        FROM Users u LEFT JOIN [Campanas] c ON c.id = u.campaign
        WHERE u.idUser = @asesorId
      `);
    if (asesorRs.recordset.length === 0) return res.status(404).json({ success: false, message: 'Asesor no encontrado' });
    const asesor = asesorRs.recordset[0];

    const resultadosRs = await pool.request()
      .input('asesorId', sql.Int, asesorId)
      .input('fecha', sql.Date, fecha)
      .query(`
        SELECT
          SUM(CASE WHEN v.estatus='Aprobada' THEN 1 ELSE 0 END) AS aprobadas,
          SUM(CASE WHEN v.estatus IN ('Rechazada','Declinado') THEN 1 ELSE 0 END) AS rechazadas,
          SUM(CASE WHEN v.estatus='Pendiente' THEN 1 ELSE 0 END) AS pendientes,
          SUM(CASE WHEN v.estatus IN ('Formalizada','Formalizado') THEN 1 ELSE 0 END) AS formalizadas,
          SUM(CASE WHEN v.estatus='Garantizada' THEN 1 ELSE 0 END) AS garantizadas,
          COUNT(v.idVenta) AS total
        FROM Ventas v
        WHERE v.idUser = @asesorId ${periodFilter}
      `);
    const r = resultadosRs.recordset[0];
    const resultados = {
      aprobadas: r.aprobadas || 0,
      rechazadas: r.rechazadas || 0,
      pendientes: r.pendientes || 0,
      formalizadas: r.formalizadas || 0,
      garantizadas: r.garantizadas || 0,
      total: r.total || 0,
    };
    const conversion = resultados.total > 0 ? Math.round((resultados.aprobadas / resultados.total) * 1000) / 10 : 0;

    const periodoMes = fecha.slice(0, 7);
    const pool2 = await databaseService.getPool(req.user?.empresa);
    const metaRs = await pool2.request()
      .input('asesorId', sql.Int, asesorId)
      .input('periodo', sql.NVarChar, periodoMes)
      .query(`SELECT VM_META_MONTO as metaMonto, VM_META_UNIDADES as metaUnidades FROM VENTAS_METAS WHERE VM_ASESOR_ID = @asesorId AND VM_PERIODO = @periodo`);
    const meta = metaRs.recordset[0] ?? null;

    res.json({
      success: true,
      data: {
        asesor,
        periodo,
        fecha,
        resultados,
        conversion,
        meta: meta ? { ...meta, periodoMes, avanceUnidades: resultados.aprobadas + resultados.formalizadas + resultados.garantizadas } : null,
      },
    });
  } catch (err) {
    logger.error('ventasAreaController.getPerfilAsesor', err);
    res.status(500).json({ success: false, message: 'Error al obtener el perfil del asesor' });
  }
}

// GET /api/ventas-area/prospeccion — resumen de seguimiento de prospectos, de solo
// lectura, por campaña: total de prospectos cargados (CRMInteracciones), cuántos ya
// tienen al menos una gestión registrada vs. cuántos siguen sin contactar, y el total
// de gestiones registradas en los últimos 30 días. No toca la carga/gestión, que sigue
// haciéndose en el sistema de Ventas/CRM legado.
async function getResumenProspeccion(req, res) {
  try {
    const pool = await getVentasPool();

    const porCampaniaRs = await pool.request().query(`
      SELECT c.id as campaniaId, c.nombre as campaniaNombre,
             COUNT(ci.id) as totalProspectos,
             SUM(CASE WHEN ci.id IS NOT NULL AND ci.ultimaGestion IS NOT NULL THEN 1 ELSE 0 END) as gestionados,
             SUM(CASE WHEN ci.id IS NOT NULL AND ci.ultimaGestion IS NULL THEN 1 ELSE 0 END) as sinGestionar
      FROM [Campanas] c
      LEFT JOIN CRMInteracciones ci ON ci.campaignId = c.id
      GROUP BY c.id, c.nombre
      ORDER BY totalProspectos DESC
    `);

    const gestiones30dRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM CRMGestiones WHERE fecha >= DATEADD(day, -30, GETDATE())
    `);

    const porTipoRs = await pool.request().query(`
      SELECT TOP 10 tipo, COUNT(*) as total
      FROM CRMGestiones
      WHERE fecha >= DATEADD(day, -30, GETDATE())
      GROUP BY tipo
      ORDER BY total DESC
    `);

    const porCampania = porCampaniaRs.recordset.map((c) => ({
      ...c,
      pctGestionado: c.totalProspectos > 0 ? Math.round((c.gestionados / c.totalProspectos) * 1000) / 10 : 0,
    }));

    res.json({
      success: true,
      data: {
        totales: {
          totalProspectos: porCampania.reduce((s, c) => s + c.totalProspectos, 0),
          gestionados: porCampania.reduce((s, c) => s + c.gestionados, 0),
          sinGestionar: porCampania.reduce((s, c) => s + c.sinGestionar, 0),
          gestiones30d: gestiones30dRs.recordset[0].total,
        },
        porCampania,
        porTipoGestion: porTipoRs.recordset,
      },
    });
  } catch (err) {
    logger.error('ventasAreaController.getResumenProspeccion', err);
    res.status(500).json({ success: false, message: 'Error al obtener el resumen de prospección' });
  }
}

/* ── Comisiones: KPIs de ventas + cumplimiento de meta por asesor ──
   Fuente de ventas: NOMINA_COMISIONES (dato YA calculado y aprobado por Nómina para
   las quincenas cerradas dentro del mes) + un conteo PROVISIONAL de ventas aprobadas/
   formalizadas/garantizadas para los días del mes que aún no caen dentro de ninguna
   quincena calculada en Nómina (para no dejar el KPI vacío a mitad de periodo).
   Nunca se recalcula ni se sobreescribe nada de Nómina — es solo lectura + conteo
   provisional aparte, claramente etiquetado. La meta reutiliza VENTAS_METAS. */

function normalizarNombre(n) {
  return (n || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Núcleo compartido entre Comisiones e Incentivos: ventas por asesor del mes (Nómina +
// provisional) cruzadas contra VENTAS_METAS, con % de cumplimiento. Extraído para que
// Incentivos aplique sus reglas sobre exactamente el mismo cálculo, sin duplicarlo.
async function calcularCumplimientoAsesores(periodo, tenantKey) {
  const [anio, mes] = periodo.split('-').map(Number);
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0);
  const inicioStr = inicioMes.toISOString().slice(0, 10);
  const finStr = finMes.toISOString().slice(0, 10);

  const poolIntranet = await databaseService.getPool(tenantKey);
  const poolVentas = await getVentasPool();

  // 1) Comisiones ya calculadas por Nómina en quincenas que caen dentro del mes.
  const periodosRs = await poolIntranet.request()
    .input('inicio', sql.Date, inicioStr)
    .input('fin', sql.Date, finStr)
    .query(`
      SELECT ID, CONVERT(VARCHAR(10), FECHA_INICIO, 23) as fechaInicio, CONVERT(VARCHAR(10), FECHA_FIN, 23) as fechaFin
      FROM NOMINA_PERIODOS
      WHERE NOT (FECHA_FIN < @inicio OR FECHA_INICIO > @fin) AND ESTADO IN ('borrador', 'aprobado')
      ORDER BY FECHA_INICIO
    `);
  const periodosDelMes = periodosRs.recordset;

  let comisionesPorNeus = new Map();
  if (periodosDelMes.length > 0) {
    const periodoIds = periodosDelMes.map((p) => p.ID);
    const comisionesRs = await poolIntranet.request().query(`
      SELECT c.NEUS_ID as neusId, u.NEUS_NOMBRES as nombre,
             SUM(c.NUM_COMISIONES) as ventasNomina, SUM(c.MONTO) as montoComision
      FROM NOMINA_COMISIONES c
      INNER JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.NEUS_ID
      WHERE c.PERIODO_ID IN (${periodoIds.join(',')})
      GROUP BY c.NEUS_ID, u.NEUS_NOMBRES
    `);
    comisionesPorNeus = new Map(comisionesRs.recordset.map((r) => [r.neusId, r]));
  }

  // Rango de días del mes SIN cobertura de un periodo de Nómina calculado (para el
  // conteo provisional). Si todo el mes ya está cubierto, no hay nada provisional.
  let rangoSinCubrir = null;
  const ultimaFechaCubierta = periodosDelMes.length > 0 ? periodosDelMes[periodosDelMes.length - 1].fechaFin : null;
  if (!ultimaFechaCubierta || ultimaFechaCubierta < finStr) {
    const desde = ultimaFechaCubierta && ultimaFechaCubierta >= inicioStr
      ? new Date(new Date(ultimaFechaCubierta).getTime() + 86400000).toISOString().slice(0, 10)
      : inicioStr;
    if (desde <= finStr) rangoSinCubrir = { desde, hasta: finStr };
  }

  // 2) Conteo provisional de ventas del tramo del mes aún no calculado en Nómina.
  let provisionalPorAgente = new Map();
  if (rangoSinCubrir) {
    const provRs = await poolVentas.request()
      .input('desde', sql.Date, rangoSinCubrir.desde)
      .input('hasta', sql.Date, rangoSinCubrir.hasta)
      .query(`
        SELECT u.idUser as id, u.nombreAgente as nombre,
               SUM(CASE WHEN v.estatus IN ('Aprobada','Formalizada','Formalizado','Garantizada') THEN 1 ELSE 0 END) as ventasProvisionales
        FROM Users u
        LEFT JOIN Ventas v ON v.idUser = u.idUser AND CONVERT(DATE, v.fecha) BETWEEN @desde AND @hasta
        WHERE u.role = 'agente' AND u.Activo = 1
        GROUP BY u.idUser, u.nombreAgente
      `);
    provisionalPorAgente = new Map(provRs.recordset.map((r) => [normalizarNombre(r.nombre), r]));
  }

  // 3) Metas del periodo (VENTAS_METAS ya existente, por asesor).
  const metasRs = await poolIntranet.request().input('periodo', sql.NVarChar, periodo).query(`
    SELECT VM_ASESOR_ID as asesorId, VM_META_UNIDADES as metaUnidades, VM_META_MONTO as metaMonto
    FROM VENTAS_METAS WHERE VM_PERIODO = @periodo
  `);
  const asesoresConMeta = metasRs.recordset.map((m) => m.asesorId);
  let nombresAsesoresMeta = new Map();
  if (asesoresConMeta.length > 0) {
    const nombresRs = await poolVentas.request().query(`SELECT idUser as id, nombreAgente as nombre FROM Users WHERE idUser IN (${asesoresConMeta.join(',')})`);
    nombresAsesoresMeta = new Map(nombresRs.recordset.map((u) => [u.id, u.nombre]));
  }

  // Unificar por nombre normalizado: Nómina (NEUS) + provisional (Ventas) + meta (Ventas).
  const filas = new Map(); // key: nombre normalizado

  for (const [neusId, c] of comisionesPorNeus) {
    const key = normalizarNombre(c.nombre);
    filas.set(key, {
      nombre: c.nombre,
      neusId,
      ventasNomina: c.ventasNomina || 0,
      montoComision: c.montoComision || 0,
      ventasProvisionales: 0,
    });
  }
  for (const [key, p] of provisionalPorAgente) {
    const existente = filas.get(key);
    if (existente) existente.ventasProvisionales = p.ventasProvisionales || 0;
    else filas.set(key, { nombre: p.nombre, neusId: null, ventasNomina: 0, montoComision: 0, ventasProvisionales: p.ventasProvisionales || 0 });
  }
  for (const m of metasRs.recordset) {
    const nombreAsesor = nombresAsesoresMeta.get(m.asesorId);
    if (!nombreAsesor) continue;
    const key = normalizarNombre(nombreAsesor);
    const existente = filas.get(key);
    if (existente) {
      existente.asesorId = m.asesorId;
      existente.metaUnidades = m.metaUnidades;
      existente.metaMonto = m.metaMonto;
    } else {
      filas.set(key, {
        nombre: nombreAsesor, neusId: null, asesorId: m.asesorId,
        ventasNomina: 0, montoComision: 0, ventasProvisionales: 0,
        metaUnidades: m.metaUnidades, metaMonto: m.metaMonto,
      });
    }
  }

  const asesores = [...filas.values()].map((f) => {
    const ventasTotal = f.ventasNomina + f.ventasProvisionales;
    const metaUnidades = f.metaUnidades ?? 0;
    const pctCumplimiento = metaUnidades > 0 ? Math.round((ventasTotal / metaUnidades) * 1000) / 10 : null;
    return { ...f, ventasTotal, pctCumplimiento };
  }).sort((a, b) => b.ventasTotal - a.ventasTotal);

  return { periodo, quincenasCubiertas: periodosDelMes.map((p) => ({ id: p.ID, fechaInicio: p.fechaInicio, fechaFin: p.fechaFin })), rangoProvisional: rangoSinCubrir, asesores };
}

// GET /api/ventas-area/comisiones?periodo=YYYY-MM
async function getKpisComisiones(req, res) {
  try {
    const periodo = (req.query.periodo || periodoActual()).toString();
    if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ success: false, message: 'Periodo inválido (YYYY-MM)' });

    const { quincenasCubiertas, rangoProvisional, asesores } = await calcularCumplimientoAsesores(periodo, req.user?.empresa);

    res.json({
      success: true,
      data: {
        periodo,
        quincenasCubiertas,
        rangoProvisional,
        asesores,
        totales: {
          ventasNomina: asesores.reduce((s, f) => s + f.ventasNomina, 0),
          ventasProvisionales: asesores.reduce((s, f) => s + f.ventasProvisionales, 0),
          montoComision: asesores.reduce((s, f) => s + f.montoComision, 0),
        },
      },
    });
  } catch (err) {
    logger.error('ventasAreaController.getKpisComisiones', err);
    res.status(500).json({ success: false, message: 'Error al obtener los KPIs de comisiones' });
  }
}

/* ── Incentivos: fórmulas de bono escritas y editadas por el admin ──
   El admin escribe la fórmula misma (no solo un umbral fijo), usando variables:
   ventas, meta, pctCumplimiento, montoComision. Ej: "IF(pctCumplimiento >= 100, 500, 0)"
   o "ventas * 15". Se evalúa con formulaService (sin eval/Function, sin código
   arbitrario) sobre el mismo cálculo de cumplimiento que ya usa Comisiones. Todas las
   fórmulas activas se evalúan y se SUMAN por asesor — cada fórmula decide su propia
   condición internamente vía IF(), así que varias fórmulas activas son bonos
   independientes que se acumulan (a diferencia de "el mayor umbral que aplique"). */

async function listReglasIncentivo(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT VIR_ID as id, VIR_NOMBRE as nombre, VIR_FORMULA as formula, VIR_ORDEN as orden, VIR_ACTIVA as activa
      FROM VENTAS_INCENTIVOS_REGLAS ORDER BY VIR_ORDEN ASC, VIR_ID ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('ventasAreaController.listReglasIncentivo', err);
    res.status(500).json({ success: false, message: 'Error al listar las fórmulas de incentivo' });
  }
}

async function crearReglaIncentivo(req, res) {
  try {
    const { nombre, formula } = req.body;
    if (!nombre || !formula) return res.status(400).json({ success: false, message: 'Nombre y fórmula son requeridos' });
    try {
      validarFormula(formula, VARIABLES_FORMULA_INCENTIVO);
    } catch (formulaErr) {
      return res.status(400).json({ success: false, message: `Fórmula inválida: ${formulaErr.message}` });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const ordenRs = await pool.request().query('SELECT ISNULL(MAX(VIR_ORDEN), 0) + 1 as siguiente FROM VENTAS_INCENTIVOS_REGLAS');
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('formula', sql.NVarChar, formula)
      .input('orden', sql.Int, ordenRs.recordset[0].siguiente)
      .input('creadoPor', sql.SmallInt, req.user?.id ?? null)
      .query(`INSERT INTO VENTAS_INCENTIVOS_REGLAS (VIR_NOMBRE, VIR_FORMULA, VIR_ORDEN, VIR_CREADO_POR) VALUES (@nombre, @formula, @orden, @creadoPor)`);
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('ventasAreaController.crearReglaIncentivo', err);
    res.status(500).json({ success: false, message: 'Error al crear la fórmula de incentivo' });
  }
}

async function actualizarReglaIncentivo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, formula, activa } = req.body;
    if (formula) {
      try {
        validarFormula(formula, VARIABLES_FORMULA_INCENTIVO);
      } catch (formulaErr) {
        return res.status(400).json({ success: false, message: `Fórmula inválida: ${formulaErr.message}` });
      }
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('formula', sql.NVarChar, formula)
      .input('activa', sql.Bit, activa ? 1 : 0)
      .query(`
        UPDATE VENTAS_INCENTIVOS_REGLAS
        SET VIR_NOMBRE = @nombre, VIR_FORMULA = @formula, VIR_ACTIVA = @activa
        WHERE VIR_ID = @id
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('ventasAreaController.actualizarReglaIncentivo', err);
    res.status(500).json({ success: false, message: 'Error al actualizar la fórmula de incentivo' });
  }
}

async function eliminarReglaIncentivo(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query('DELETE FROM VENTAS_INCENTIVOS_REGLAS WHERE VIR_ID = @id');
    res.json({ success: true });
  } catch (err) {
    logger.error('ventasAreaController.eliminarReglaIncentivo', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la fórmula de incentivo' });
  }
}

// POST /api/ventas-area/incentivos/reglas/probar — evalúa una fórmula contra valores
// de ejemplo (sin guardar), para que el admin la pruebe antes de crearla/editarla.
async function probarFormulaIncentivo(req, res) {
  try {
    const { formula, ventas, meta, pctCumplimiento, montoComision } = req.body;
    if (!formula) return res.status(400).json({ success: false, message: 'Fórmula requerida' });
    const resultado = evaluarFormula(formula, {
      ventas: Number(ventas) || 0,
      meta: Number(meta) || 0,
      pctcumplimiento: Number(pctCumplimiento) || 0,
      montocomision: Number(montoComision) || 0,
    });
    res.json({ success: true, data: { resultado } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

// GET /api/ventas-area/incentivos?periodo=YYYY-MM — evalúa todas las fórmulas activas
// (definidas por el admin) por asesor, sobre el mismo cálculo de cumplimiento que ya
// usa Comisiones, y suma sus resultados.
async function getKpisIncentivos(req, res) {
  try {
    const periodo = (req.query.periodo || periodoActual()).toString();
    if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ success: false, message: 'Periodo inválido (YYYY-MM)' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const reglasRs = await pool.request().query(`
      SELECT VIR_ID as id, VIR_NOMBRE as nombre, VIR_FORMULA as formula
      FROM VENTAS_INCENTIVOS_REGLAS WHERE VIR_ACTIVA = 1 ORDER BY VIR_ORDEN ASC, VIR_ID ASC
    `);
    const reglasActivas = reglasRs.recordset;

    const { asesores } = await calcularCumplimientoAsesores(periodo, req.user?.empresa);

    const asesoresConIncentivo = asesores.map((a) => {
      const variables = {
        ventas: a.ventasTotal,
        meta: a.metaUnidades ?? 0,
        pctcumplimiento: a.pctCumplimiento ?? 0,
        montocomision: a.montoComision,
      };
      const desglose = [];
      let montoIncentivo = 0;
      for (const regla of reglasActivas) {
        try {
          const monto = evaluarFormula(regla.formula, variables);
          if (monto > 0) {
            montoIncentivo += monto;
            desglose.push({ nombre: regla.nombre, monto });
          }
        } catch (err) {
          logger.warn(`ventasAreaController.getKpisIncentivos: fórmula "${regla.nombre}" falló para ${a.nombre}: ${err.message}`);
        }
      }
      return { ...a, montoIncentivo, desglose };
    });

    res.json({
      success: true,
      data: {
        periodo,
        reglas: reglasActivas,
        asesores: asesoresConIncentivo,
        totales: { montoIncentivoTotal: asesoresConIncentivo.reduce((s, a) => s + a.montoIncentivo, 0) },
      },
    });
  } catch (err) {
    logger.error('ventasAreaController.getKpisIncentivos', err);
    res.status(500).json({ success: false, message: 'Error al obtener los KPIs de incentivos' });
  }
}

module.exports = {
  listMetas,
  crearMeta,
  eliminarMeta,
  listCampanas,
  getMisMetas,
  getMetaPausas,
  getDashboard,
  listAsesores,
  getReporteResultados,
  getPerfilAsesor,
  getResumenProspeccion,
  getKpisComisiones,
  listReglasIncentivo,
  crearReglaIncentivo,
  actualizarReglaIncentivo,
  eliminarReglaIncentivo,
  probarFormulaIncentivo,
  getKpisIncentivos,
};
