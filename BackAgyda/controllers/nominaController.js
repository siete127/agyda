const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

// Conexión a la BD de ventas para leer ventas aprobadas por quincena.
// Usa la config centralizada (config/database_ventas.js) — antes este archivo
// tenía un host interno hardcodeado (WIN-NRURD70NF62) que dejó de resolver;
// el resto del sistema ya usaba ventas.ardabytec.vip vía esta config.
const VENTAS_CONFIG = require('../config/database_ventas');
let _ventasPool = null;
async function getVentasPool() {
  if (!_ventasPool || !_ventasPool.connected) _ventasPool = await new sql.ConnectionPool(VENTAS_CONFIG).connect();
  return _ventasPool;
}

// ── Config global ─────────────────────────────────────────────────────────────

exports.getConfigGlobal = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const cfgR = await pool.request().query('SELECT TOP 1 * FROM nomina_config_global ORDER BY id DESC');
    const campR = await pool.request().query('SELECT * FROM nomina_campana_config ORDER BY campana_id');
    const bonR  = await pool.request().query('SELECT id, lugar, label, monto, activo, campana_id FROM nomina_bonos_config ORDER BY lugar, campana_id');
    const cfgRaw = cfgR.recordset[0] ?? {};
    res.json({
      success: true,
      data: {
        config: {
          sueldo_base:          Number(cfgRaw.sueldo_base          ?? 6000),
          dias_quincena:        Number(cfgRaw.dias_quincena        ?? 15),
          factor_dia_completo:  Number(cfgRaw.factor_dia_completo  ?? 1.0),
          factor_medio_dia:     Number(cfgRaw.factor_medio_dia     ?? 0.5),
          factor_falta_justificada: Number(cfgRaw.factor_falta_justificada ?? 0.5),
          monto_retardo:        Number(cfgRaw.monto_retardo        ?? 0),
          minutos_pausa_libre:  Number(cfgRaw.minutos_pausa_libre  ?? 30),
          monto_exceso_pausa:   Number(cfgRaw.monto_exceso_pausa   ?? 0),
          retardos_por_falta:   Number(cfgRaw.retardos_por_falta   ?? 3),
          pausas_activo:        cfgRaw.pausas_activo !== undefined ? Boolean(cfgRaw.pausas_activo) : true,
        },
        campanas: campR.recordset,
        bonos:    bonR.recordset,
      },
    });
  } catch (e) {
    console.error('[nomina] getConfigGlobal error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateConfigGlobal = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    // Asegurar que las columnas existan (idempotente)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='factor_dia_completo')
        ALTER TABLE nomina_config_global ADD factor_dia_completo DECIMAL(5,4) NOT NULL DEFAULT 1.0;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='factor_medio_dia')
        ALTER TABLE nomina_config_global ADD factor_medio_dia DECIMAL(5,4) NOT NULL DEFAULT 0.5;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='factor_falta_justificada')
        ALTER TABLE nomina_config_global ADD factor_falta_justificada DECIMAL(5,4) NOT NULL DEFAULT 0.5;
    `);

    const { sueldo_base, dias_quincena, factor_dia_completo, factor_medio_dia, factor_falta_justificada,
            monto_retardo, minutos_pausa_libre, monto_exceso_pausa, retardos_por_falta, pausas_activo, campanas, bonos } = req.body;

    // Asegurar columnas nuevas (idempotente)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='monto_retardo')
        ALTER TABLE nomina_config_global ADD monto_retardo DECIMAL(10,2) NOT NULL DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='minutos_pausa_libre')
        ALTER TABLE nomina_config_global ADD minutos_pausa_libre INT NOT NULL DEFAULT 30;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='monto_exceso_pausa')
        ALTER TABLE nomina_config_global ADD monto_exceso_pausa DECIMAL(10,2) NOT NULL DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='retardos_por_falta')
        ALTER TABLE nomina_config_global ADD retardos_por_falta INT NOT NULL DEFAULT 3;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_config_global' AND COLUMN_NAME='pausas_activo')
        ALTER TABLE nomina_config_global ADD pausas_activo BIT NOT NULL DEFAULT 1;
    `);

    if (sueldo_base !== undefined || dias_quincena !== undefined || factor_dia_completo !== undefined || factor_medio_dia !== undefined
        || factor_falta_justificada !== undefined
        || monto_retardo !== undefined || minutos_pausa_libre !== undefined || monto_exceso_pausa !== undefined || retardos_por_falta !== undefined || pausas_activo !== undefined) {
      // Si cambia el sueldo global, sincronizar registros no-manuales de NOMINA_PERCEPCIONES
      if (sueldo_base !== undefined) {
        await pool.request()
          .input('sb', sql.Decimal(10, 2), Number(sueldo_base))
          .query('UPDATE NOMINA_PERCEPCIONES SET SUELDO_QUINCENAL=@sb WHERE ES_MANUAL=0 AND ACTIVO=1');
      }
      await pool.request()
        .input('sb',  sql.Decimal(10, 2), Number(sueldo_base ?? 6000))
        .input('dq',  sql.Int,            Number(dias_quincena ?? 15))
        .input('fdc', sql.Decimal(5, 4),  Number(factor_dia_completo ?? 1.0))
        .input('fmd', sql.Decimal(5, 4),  Number(factor_medio_dia ?? 0.5))
        .input('ffj', sql.Decimal(5, 4),  Number(factor_falta_justificada ?? 0.5))
        .input('mr',  sql.Decimal(10, 2), Number(monto_retardo ?? 0))
        .input('mpl', sql.Int,            Number(minutos_pausa_libre ?? 30))
        .input('mep', sql.Decimal(10, 2), Number(monto_exceso_pausa ?? 0))
        .input('rpf', sql.Int,            Number(retardos_por_falta ?? 3))
        .input('pa',  sql.Bit,            pausas_activo !== undefined ? (pausas_activo ? 1 : 0) : 1)
        .query(`
          IF EXISTS (SELECT 1 FROM nomina_config_global)
            UPDATE nomina_config_global SET
              sueldo_base=@sb, dias_quincena=@dq, factor_dia_completo=@fdc, factor_medio_dia=@fmd,
              factor_falta_justificada=@ffj,
              monto_retardo=@mr, minutos_pausa_libre=@mpl, monto_exceso_pausa=@mep,
              retardos_por_falta=@rpf, pausas_activo=@pa, updated_at=GETDATE()
          ELSE
            INSERT INTO nomina_config_global
              (sueldo_base, dias_quincena, factor_dia_completo, factor_medio_dia, factor_falta_justificada, monto_retardo, minutos_pausa_libre, monto_exceso_pausa, retardos_por_falta, pausas_activo)
            VALUES (@sb, @dq, @fdc, @fmd, @ffj, @mr, @mpl, @mep, @rpf, @pa)
        `);
    }

    // Asegurar columna ganancia_neta en nomina_campana_config (idempotente)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nomina_campana_config' AND COLUMN_NAME='ganancia_neta')
        ALTER TABLE nomina_campana_config ADD ganancia_neta DECIMAL(10,2) NOT NULL DEFAULT 0;
    `);

    if (Array.isArray(campanas)) {
      for (const c of campanas) {
        await pool.request()
          .input('id',      sql.Int,          Number(c.campana_id))
          .input('nombre',  sql.NVarChar,      String(c.campana_nombre))
          .input('tipo',    sql.NVarChar,      String(c.tipo_tarifa ?? 'fijo'))
          .input('tarifa',  sql.Decimal(10,2), Number(c.tarifa ?? 0))
          .input('activo',  sql.Bit,           c.activo !== false ? 1 : 0)
          .input('ganeta',  sql.Decimal(10,2), Number(c.ganancia_neta ?? 0))
          .query(`
            IF EXISTS (SELECT 1 FROM nomina_campana_config WHERE campana_id=@id)
              UPDATE nomina_campana_config SET campana_nombre=@nombre, tipo_tarifa=@tipo, tarifa=@tarifa, activo=@activo, ganancia_neta=@ganeta WHERE campana_id=@id
            ELSE
              INSERT INTO nomina_campana_config (campana_id, campana_nombre, tipo_tarifa, tarifa, activo, ganancia_neta) VALUES (@id, @nombre, @tipo, @tarifa, @activo, @ganeta)
          `);
      }
    }

    if (Array.isArray(bonos)) {
      // Primero eliminamos todos los bonos activos para reemplazar con la nueva config completa
      await pool.request().query('DELETE FROM nomina_bonos_config');
      for (const b of bonos) {
        const campanaId = b.campana_id != null ? Number(b.campana_id) : null;
        const req2 = pool.request()
          .input('lugar',  sql.Int,          Number(b.lugar))
          .input('label',  sql.NVarChar,      String(b.label))
          .input('monto',  sql.Decimal(10,2), Number(b.monto ?? 0))
          .input('activo', sql.Bit,           b.activo !== false ? 1 : 0);
        if (campanaId !== null) {
          req2.input('cid', sql.Int, campanaId);
          await req2.query('INSERT INTO nomina_bonos_config (lugar, label, monto, activo, campana_id) VALUES (@lugar, @label, @monto, @activo, @cid)');
        } else {
          await req2.query('INSERT INTO nomina_bonos_config (lugar, label, monto, activo, campana_id) VALUES (@lugar, @label, @monto, @activo, NULL)');
        }
      }
    }

    const poolAudit = await databaseService.getPool(req.user?.empresa);
    await logAudit(poolAudit, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'nomina',
      accion:    'editar-config',
      entidadId: null,
      detalle:   { sueldo_base, dias_quincena, monto_retardo },
      ip:        req.ip
    });
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] updateConfigGlobal error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Periodos ──────────────────────────────────────────────────────────────────

exports.getPeriodos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().query(`
      SELECT
        ID                as id,
        CONVERT(VARCHAR(10), FECHA_INICIO,  23) as fechaInicio,
        CONVERT(VARCHAR(10), FECHA_FIN,     23) as fechaFin,
        CONVERT(VARCHAR(10), FECHA_BASE,    23) as fechaBase,
        CONVERT(VARCHAR(10), FECHA_CORTE,   23) as fechaCorte,
        RTRIM(LTRIM(ESTADO))                    as estado,
        FECHA_CALCULO     as fechaCalculo,
        FECHA_APROBACION  as fechaAprobacion
      FROM NOMINA_PERIODOS
      ORDER BY FECHA_INICIO DESC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('[nomina] getPeriodos error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createPeriodo = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, fechaBase, fechaCorte } = req.body;
    if (!fechaInicio || !fechaFin) return res.status(400).json({ success: false, message: 'Fechas requeridas' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const overlap = await pool.request()
      .input('fi', sql.Date, new Date(fechaInicio))
      .input('ff', sql.Date, new Date(fechaFin))
      .query('SELECT TOP 1 ID FROM NOMINA_PERIODOS WHERE NOT (FECHA_FIN < @fi OR FECHA_INICIO > @ff)');
    if (overlap.recordset.length > 0)
      return res.status(400).json({ success: false, message: 'Ya existe un periodo que se solapa con esas fechas' });

    // FECHA_BASE/CORTE = rango real de asistencias/ventas; por defecto igual al periodo
    const fb = fechaBase  ? new Date(fechaBase)  : new Date(fechaInicio);
    const fc = fechaCorte ? new Date(fechaCorte) : new Date(fechaFin);

    const r = await pool.request()
      .input('fi', sql.Date, new Date(fechaInicio))
      .input('ff', sql.Date, new Date(fechaFin))
      .input('fb', sql.Date, fb)
      .input('fc', sql.Date, fc)
      .query(`INSERT INTO NOMINA_PERIODOS (FECHA_INICIO, FECHA_FIN, FECHA_BASE, FECHA_CORTE, ESTADO) OUTPUT INSERTED.ID VALUES (@fi, @ff, @fb, @fc, 'borrador')`);
    res.status(201).json({ success: true, id: r.recordset[0].ID });
  } catch (e) {
    console.error('[nomina] createPeriodo error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateFechasPeriodo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fechaBase, fechaCorte } = req.body;
    if (!fechaBase || !fechaCorte) return res.status(400).json({ success: false, message: 'fechaBase y fechaCorte requeridas' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const est = await pool.request().input('id', sql.Int, id)
      .query('SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id');
    if (!est.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (est.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'Solo se puede editar un periodo en borrador' });
    await pool.request()
      .input('id', sql.Int, id)
      .input('fb', sql.Date, new Date(fechaBase))
      .input('fc', sql.Date, new Date(fechaCorte))
      .query('UPDATE NOMINA_PERIODOS SET FECHA_BASE=@fb, FECHA_CORTE=@fc WHERE ID=@id');
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] updateFechasPeriodo error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Calcular nómina ───────────────────────────────────────────────────────────

exports.calcularNomina = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);

    const periodoR = await pool.request()
      .input('id', sql.Int, periodoId)
      .query(`SELECT ID as id, RTRIM(LTRIM(ESTADO)) as estado,
                CONVERT(VARCHAR(10), FECHA_INICIO, 23) as fecha_inicio,
                CONVERT(VARCHAR(10), FECHA_FIN,    23) as fecha_fin,
                CONVERT(VARCHAR(10), ISNULL(FECHA_BASE,  FECHA_INICIO), 23) as fecha_base,
                CONVERT(VARCHAR(10), ISNULL(FECHA_CORTE, FECHA_FIN),    23) as fecha_corte
              FROM NOMINA_PERIODOS WHERE ID=@id`);
    const periodo = periodoR.recordset[0];
    if (!periodo) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (periodo.estado !== 'borrador') return res.status(400).json({ success: false, message: 'Solo se pueden recalcular periodos en borrador' });

    // Config global
    const cfgR = await pool.request().query('SELECT TOP 1 * FROM nomina_config_global ORDER BY id DESC');
    const cfg = cfgR.recordset[0] ?? {};
    const SUELDO_BASE         = Number(cfg.sueldo_base         ?? 6000);
    const DIAS_QUINCENA       = Number(cfg.dias_quincena       ?? 15);
    const FACTOR_DIA_COMPLETO = Number(cfg.factor_dia_completo ?? 1.0);
    const FACTOR_MEDIO_DIA    = Number(cfg.factor_medio_dia    ?? 0.5);
    const FACTOR_FALTA_JUSTIFICADA = Number(cfg.factor_falta_justificada ?? 0.5);
    const MONTO_RETARDO       = Number(cfg.monto_retardo       ?? 0);
    const MINUTOS_PAUSA_LIBRE = Number(cfg.minutos_pausa_libre ?? 30);
    const MONTO_EXCESO_PAUSA  = Number(cfg.monto_exceso_pausa  ?? 0);
    const RETARDOS_POR_FALTA  = Number(cfg.retardos_por_falta  ?? 3); // N retardos = 1 día de falta completa
    const PAUSAS_ACTIVO       = cfg.pausas_activo !== undefined ? Boolean(cfg.pausas_activo) : true;

    // Campañas con su tarifa
    const campCfgR = await pool.request().query('SELECT * FROM nomina_campana_config WHERE activo=1');
    const campCfg = {};
    for (const c of campCfgR.recordset) campCfg[c.campana_id] = c;

    // Bonos de ranking — cargamos todos activos; campana_id NULL = aplica a todas
    const bonosCfgR = await pool.request().query('SELECT * FROM nomina_bonos_config WHERE activo=1 ORDER BY lugar, campana_id');
    const bonosCfg = bonosCfgR.recordset;

    // Obtener todos los CC (activos e inactivos) para filtrar en JS
    const allCcR = await pool.request().query(`
      SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_ACTIVO as activo
      FROM NEUS_USUARIOS
      WHERE NEUS_TIPOUSUARIO = 'CC'
      ORDER BY NEUS_NOMBRES
    `);

    // Percepciones activas
    const percActivasR = await pool.request().query('SELECT DISTINCT NEUS_ID FROM NOMINA_PERCEPCIONES WHERE ACTIVO=1');
    const idsConPercepcion = new Set(percActivasR.recordset.map((r) => r.NEUS_ID));

    // IDs con asistencias dentro del rango
    const asistRangoR = await pool.request()
      .input('fi2', sql.NVarChar, periodo.fecha_base)
      .input('ff2', sql.NVarChar, periodo.fecha_corte)
      .query('SELECT DISTINCT NEUS_ID as id FROM ASISTENCIA_ENTRADAS WHERE FECHA >= @fi2 AND FECHA <= @ff2');
    const idsConAsistenciaEnRango = new Set(asistRangoR.recordset.map((r) => r.id));

    // Normaliza un nombre: minúsculas, sin tildes, sin espacios dobles
    function normName(s) {
      return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    // Ventas aprobadas por agente+campaña desde BD de ventas — se calcula ANTES
    // del filtro de inclusión para que el criterio "tiene ventas" use el mismo
    // matching estricto que después alimenta las comisiones (evita que un match
    // débil por nombre corto incluya a alguien que en realidad no vendió nada).
    //
    // Esta conexión ahora es CRÍTICA (no opcional): con la regla "asistencia Y
    // ventas reales", si no se puede leer Ventas no hay forma de saber quién
    // califica. Antes este error se tragaba en silencio y el cálculo seguía con
    // 0 ventas para todos, vaciando el detalle sin avisar. Ahora se aborta.
    const ventasByNorm   = {};  // por nombre normalizado → { campId: num } — SOLO aprobadas (alimenta comisiones)
    const userCampByNorm = {};  // por nombre normalizado → Set de campaignIds asignados
    const nombresConActividadVenta = new Set(); // por nombre normalizado — aprobadas + rechazadas (solo decide inclusión)

    try {
      const vPool = await getVentasPool();

      // 1. Ventas aprobadas en el rango agrupadas por agente+campaña
      const ventasR = await vPool.request()
        .input('fi', sql.Date, new Date(periodo.fecha_base))
        .input('ff', sql.Date, new Date(periodo.fecha_corte))
        .query(`
          SELECT v.nombreAgente, v.campaignId, COUNT(*) as num_ventas
          FROM Ventas v
          WHERE v.estatus IN ('Aprobada','approved','Formalizado','formalized_banamex','approved_banamex')
            AND CAST(v.fecha AS DATE) BETWEEN @fi AND @ff
          GROUP BY v.nombreAgente, v.campaignId
        `);
      for (const v of ventasR.recordset) {
        const key = normName(v.nombreAgente);
        if (!ventasByNorm[key]) ventasByNorm[key] = {};
        ventasByNorm[key][v.campaignId] = (ventasByNorm[key][v.campaignId] || 0) + Number(v.num_ventas);
      }

      // 2. Campañas asignadas a cada usuario (UserCampaigns JOIN Users)
      const ucR = await vPool.request().query(`
        SELECT u.nombreAgente, uc.campaignId
        FROM UserCampaigns uc
        JOIN Users u ON u.idUser = uc.userId
      `);
      for (const row of ucR.recordset) {
        const key = normName(row.nombreAgente);
        if (!userCampByNorm[key]) userCampByNorm[key] = new Set();
        userCampByNorm[key].add(Number(row.campaignId));
      }

      // 3. Solo para decidir INCLUSIÓN en nómina (no para comisiones): agentes
      // que tuvieron actividad de venta real en el periodo, aprobada o rechazada
      // — un agente cuya venta fue rechazada sí trabajó y debe entrar a nómina
      // con su sueldo base, aunque esa venta rechazada nunca pague comisión
      // (las comisiones siguen calculándose solo sobre ventasByNorm, arriba).
      const ventasConRechazoR = await vPool.request()
        .input('fi', sql.Date, new Date(periodo.fecha_base))
        .input('ff', sql.Date, new Date(periodo.fecha_corte))
        .query(`
          SELECT DISTINCT v.nombreAgente
          FROM Ventas v
          WHERE v.estatus IN ('Aprobada','approved','Formalizado','Formalizada','formalized_banamex','approved_banamex','Rechazada')
            AND CAST(v.fecha AS DATE) BETWEEN @fi AND @ff
        `);
      for (const v of ventasConRechazoR.recordset) {
        nombresConActividadVenta.add(normName(v.nombreAgente));
      }
    } catch (ve) {
      console.error('[nomina] Error CRÍTICO leyendo ventas — cálculo abortado:', ve.message);
      return res.status(503).json({
        success: false,
        message: `No se pudo conectar a la base de datos de Ventas (${ve.message}). El cálculo requiere verificar ventas reales y fue cancelado para no dejar el detalle incompleto — intenta de nuevo cuando la conexión esté disponible.`,
      });
    }

    // Match difuso de nombre: exacto, prefijo en cualquier dirección, o prefijo
    // común de 20 caracteres — misma heurística para ventas (comisiones) y para
    // actividad de venta (inclusión), reutilizada abajo en ambos casos.
    function fuzzyMatchKey(empNorm, normKeys) {
      let matchKey = normKeys.find((k) => k === empNorm);
      if (!matchKey) matchKey = normKeys.find((k) => k.length >= 8 && empNorm.startsWith(k));
      if (!matchKey) matchKey = normKeys.find((k) => k.length >= 8 && k.startsWith(empNorm));
      if (!matchKey) {
        const MIN_PREFIX = 20;
        matchKey = normKeys.find((k) => {
          const len = Math.min(k.length, empNorm.length, MIN_PREFIX);
          return len >= MIN_PREFIX && k.slice(0, len) === empNorm.slice(0, len);
        });
      }
      return matchKey;
    }

    // Construir mapa de ventas por NEUS_ID con match por nombre normalizado —
    // sobre TODOS los CC (no solo los ya filtrados), porque el resultado se usa
    // para decidir a quién incluir.
    const ventasPorAgente = {}; // neusId -> { campaignId: num } — SOLO aprobadas (comisiones)
    const ventasNormKeys  = Object.keys(ventasByNorm);
    const actividadVentaNormKeys = Array.from(nombresConActividadVenta);
    const idsConActividadVenta = new Set(); // neusId -> tuvo aprobada O rechazada (inclusión)

    for (const emp of allCcR.recordset) {
      const empNorm = normName(emp.nombre);
      const matchKey = fuzzyMatchKey(empNorm, ventasNormKeys);
      if (matchKey) {
        ventasPorAgente[emp.id] = ventasByNorm[matchKey];
      }

      if (fuzzyMatchKey(empNorm, actividadVentaNormKeys)) {
        idsConActividadVenta.add(emp.id);
      }

      // Guardar también qué campañas tiene asignadas (para validar comisiones)
      emp._campañasAsignadas = userCampByNorm[empNorm]
        ?? (matchKey ? userCampByNorm[matchKey] : null)
        ?? null;
    }

    // Decide inclusión en nómina: contar también ventas rechazadas (el agente
    // trabajó y generó actividad, aunque esa venta no pague comisión) — a
    // diferencia de ventasPorAgente/NOMINA_COMISIONES, que solo usa aprobadas.
    const tieneVentasReales = (neusId) => idsConActividadVenta.has(neusId);

    // Regla: se incluye SOLO a quien tuvo asistencia real Y actividad de venta
    // (aprobada o rechazada) dentro del rango del periodo — no basta con estar
    // "activo" en el sistema de usuarios ni con cumplir una sola de las dos
    // condiciones. Una venta rechazada cuenta como actividad (el agente
    // trabajó), pero solo las aprobadas pagan comisión (ver ventasPorAgente).
    const empleadosR = { recordset: allCcR.recordset.filter((emp) =>
      idsConAsistenciaEnRango.has(emp.id) && tieneVentasReales(emp.id)
    )};
    const empleados = empleadosR.recordset;

    // Percepciones individuales — solo las marcadas como ES_MANUAL=1 sobreescriben el global
    const percR = await pool.request().query('SELECT NEUS_ID as neus_id, SUELDO_QUINCENAL as sueldo_quincenal FROM NOMINA_PERCEPCIONES WHERE ACTIVO=1 AND ES_MANUAL=1');
    const percMap = {};
    for (const p of percR.recordset) percMap[p.neus_id] = Number(p.sueldo_quincenal);

    // Faltas manuales del periodo (tabla NOMINA_FALTAS_MANUALES) — ajuste manual sobre el cálculo automático
    const faltasR = await pool.request()
      .input('pid', sql.Int, periodoId)
      .query('SELECT NEUS_ID as neus_id, DIAS_FALTA as dias FROM NOMINA_FALTAS_MANUALES WHERE PERIODO_ID=@pid');
    const faltasManualMap = {};
    for (const f of faltasR.recordset) faltasManualMap[f.neus_id] = Number(f.dias);

    // Excepciones del periodo:
    // - Justificado genérico: no cuenta como inasistencia, $0 de descuento.
    // - MEDIO_DIA: tampoco cuenta como día completo, pero sí como 0.5 falta (factor_medio_dia).
    // - FALTA_JUSTIFICADA: SÍ cuenta como 1 falta completa, pero con su propio factor
    //   de descuento (factor_falta_justificada), distinto al de "Día completo de falta".
    const excR = await pool.request()
      .input('pid', sql.Int, periodoId)
      .query(`SELECT NEUS_ID as neus_id,
                SUM(CASE WHEN MOTIVO IN ('MEDIO_DIA','FALTA_JUSTIFICADA') THEN 0 ELSE 1 END) as dias_justificados,
                SUM(CASE WHEN MOTIVO='MEDIO_DIA' THEN 1 ELSE 0 END) as dias_medio,
                SUM(CASE WHEN MOTIVO='FALTA_JUSTIFICADA' THEN 1 ELSE 0 END) as dias_falta_justificada
              FROM NOMINA_EXCEPCIONES WHERE PERIODO_ID=@pid GROUP BY NEUS_ID`);
    const excMap = {};      // días justificados completos genéricos (se restan de inasistencias, $0)
    const medioMap = {};    // días de medio tiempo (añaden 0.5 falta cada uno)
    const justFaltaMap = {}; // faltas justificadas (cuentan como falta, factor propio)
    for (const e of excR.recordset) {
      excMap[e.neus_id]       = Number(e.dias_justificados);
      medioMap[e.neus_id]     = Number(e.dias_medio);
      justFaltaMap[e.neus_id] = Number(e.dias_falta_justificada);
    }

    // ── Asistencias automáticas ───────────────────────────────────────────────
    // 1. Días hábiles (lunes-sábado) dentro del periodo
    // Solo se cuentan hasta hoy: días futuros no se marcan como falta
    function diasHabiles(fi, ff) {
      let count = 0;
      const cur = new Date(fi + 'T12:00:00');
      const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
      const end = new Date(ff + 'T12:00:00');
      const limite = end < hoy ? end : hoy;
      while (cur <= limite) {
        const dow = cur.getDay(); // 0=Dom, 6=Sab
        if (dow !== 0) count++; // lunes-sábado son días laborables CC
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    }
    // Usar FECHA_BASE/FECHA_CORTE para asistencias, retardos, pausas y ventas
    // Si no están configuradas, caen en las fechas del periodo (compatibilidad hacia atrás)
    const FB = periodo.fecha_base;
    const FC = periodo.fecha_corte;

    const totalDiasHabiles = diasHabiles(FB, FC);

    // 2. Entradas registradas por empleado en el rango base-corte
    const entradasR = await pool.request()
      .input('fi', sql.NVarChar, FB)
      .input('ff', sql.NVarChar, FC)
      .query(`
        SELECT NEUS_ID as neus_id, COUNT(*) as dias_con_entrada
        FROM ASISTENCIA_ENTRADAS
        WHERE FECHA >= @fi AND FECHA <= @ff
        GROUP BY NEUS_ID
      `);
    const entradasMap = {};
    for (const e of entradasR.recordset) entradasMap[e.neus_id] = Number(e.dias_con_entrada);

    // Vacaciones/permisos aprobados en Asistencia (ASISTENCIA_EXCEPCIONES) dentro del
    // rango base-corte — se suman a excMap para que no se cuenten como inasistencia,
    // sin necesidad de marcarlos también manualmente en NOMINA_EXCEPCIONES.
    let excAsistR = { recordset: [] };
    try {
      excAsistR = await pool.request()
        .input('fi', sql.NVarChar, FB)
        .input('ff', sql.NVarChar, FC)
        .query(`SELECT NEUS_ID as neus_id, COUNT(*) as dias
                FROM ASISTENCIA_EXCEPCIONES
                WHERE FECHA >= @fi AND FECHA <= @ff
                GROUP BY NEUS_ID`);
    } catch (_e) { /* tabla puede no existir aún si Asistencia nunca la creó */ }
    for (const e of excAsistR.recordset) {
      excMap[e.neus_id] = (excMap[e.neus_id] ?? 0) + Number(e.dias);
    }

    // 3. Retardos en el rango base-corte (no se suman si hay 2 meses: se toman del rango como un bloque)
    const retardosR = await pool.request()
      .input('fi', sql.NVarChar, FB)
      .input('ff', sql.NVarChar, FC)
      .query(`
        SELECT NEUS_ID as neus_id, COUNT(*) as total_retardos
        FROM ASISTENCIA_ENTRADAS
        WHERE ES_RETARDO = 1 AND FECHA >= @fi AND FECHA <= @ff
        GROUP BY NEUS_ID
      `);
    const retardosMap = {};
    for (const r of retardosR.recordset) retardosMap[r.neus_id] = Number(r.total_retardos);

    // Exceso de minutos en pausas dentro del rango base-corte
    const pausasR = await pool.request()
      .input('fi', sql.NVarChar, FB)
      .input('ff', sql.NVarChar, FC)
      .query(`
        SELECT
          neus_id,
          CAST(fecha_inicio AS date) as dia,
          SUM(ISNULL(DATEDIFF(MINUTE, fecha_inicio, ISNULL(fecha_fin, GETDATE())), 0)) as minutos_pausa
        FROM USUARIO_TIEMPOS
        WHERE status_id IN (2,3,5,6)
          AND CAST(fecha_inicio AS date) >= @fi
          AND CAST(fecha_inicio AS date) <= @ff
          AND fecha_fin IS NOT NULL
        GROUP BY neus_id, CAST(fecha_inicio AS date)
      `);
    // pausasExcesoMap[neusId] = total minutos de exceso acumulados en todo el periodo
    const pausasExcesoMap = {};
    for (const p of pausasR.recordset) {
      const exceso = Math.max(0, Number(p.minutos_pausa) - MINUTOS_PAUSA_LIBRE);
      if (exceso > 0) {
        pausasExcesoMap[p.neus_id] = (pausasExcesoMap[p.neus_id] ?? 0) + exceso;
      }
    }

    // Calcular por empleado
    const resultados = [];
    for (const emp of empleados) {
      const sueldoQ        = percMap[emp.id] ?? SUELDO_BASE;
      const sueldoD        = sueldoQ / DIAS_QUINCENA;

      const esActivo          = Boolean(emp.activo);
      const diasConEntrada    = entradasMap[emp.id] ?? 0;
      const diasJustificados  = excMap[emp.id] ?? 0;
      const diasMedioExc      = medioMap[emp.id] ?? 0;
      const diasFaltaJust     = justFaltaMap[emp.id] ?? 0;

      // Inactivos sin ninguna asistencia en el rango: no se les evalúa asistencia ni se les cobran faltas.
      // Solo se incluyen por sus ventas/comisiones.
      const evaluarAsistencia = esActivo || diasConEntrada > 0;

      // FALTA_JUSTIFICADA se resta igual que el resto de excepciones (el día no tiene
      // registro de entrada), pero se cuenta y descuenta aparte con su propio factor.
      const inasistenciasAuto = evaluarAsistencia
        ? Math.max(0, totalDiasHabiles - diasConEntrada - diasJustificados - diasMedioExc - diasFaltaJust)
        : 0;

      const totalRetardos     = evaluarAsistencia ? (retardosMap[emp.id] ?? 0) : 0;
      const faltasPorRetardos = (evaluarAsistencia && RETARDOS_POR_FALTA > 0) ? Math.floor(totalRetardos / RETARDOS_POR_FALTA) : 0;

      const faltaRaw = faltasManualMap[emp.id] !== undefined
        ? faltasManualMap[emp.id]
        : inasistenciasAuto + faltasPorRetardos + diasMedioExc * 0.5 + diasFaltaJust;

      const faltaSinMedios = faltasManualMap[emp.id] !== undefined
        ? faltaRaw
        : inasistenciasAuto + faltasPorRetardos;
      const diasCompletos  = Math.floor(faltaSinMedios);
      const diasMedios     = diasMedioExc;
      const diasFalta      = faltaRaw;
      const descuentoFaltas  = (diasCompletos * FACTOR_DIA_COMPLETO + diasMedios * FACTOR_MEDIO_DIA + diasFaltaJust * FACTOR_FALTA_JUSTIFICADA) * sueldoD;

      // Monto fijo adicional por retardo (si aún se quiere cobrar algo más allá de las faltas)
      const descuentoRetardo = totalRetardos * MONTO_RETARDO;

      const minutosExceso    = pausasExcesoMap[emp.id] ?? 0;
      // Se cobra MONTO_EXCESO_PAUSA por cada bloque de 5 minutos de exceso solo si está activado
      const bloques          = (PAUSAS_ACTIVO && minutosExceso > 0) ? Math.ceil(minutosExceso / 5) : 0;
      const descuentoPausa   = bloques * MONTO_EXCESO_PAUSA;

      const descuento      = descuentoFaltas + descuentoRetardo + descuentoPausa;
      const sueldoNeto     = Math.max(0, sueldoQ - descuento);

      const ventasCamp      = ventasPorAgente[emp.id] ?? {};
      const campAsignadas   = emp._campañasAsignadas; // Set de campaignIds o null (sin restricción)

      let totalComisiones  = 0;
      let totalVentas      = 0;
      let campPrincipalId  = null;
      let campPrincipalMax = 0;
      const comisiones     = [];

      for (const [campIdStr, cc] of Object.entries(campCfg)) {
        const campId = Number(campIdStr);
        // Si el agente tiene campañas asignadas en UserCampaigns, solo contar las que le corresponden
        const estaAsignado = !campAsignadas || campAsignadas.has(campId);
        const num    = estaAsignado ? (ventasCamp[campId] ?? 0) : 0;
        totalVentas += num;
        if (num > campPrincipalMax) { campPrincipalMax = num; campPrincipalId = campId; }
        const monto  = cc.tipo_tarifa === 'porcentaje'
          ? num * sueldoQ * (Number(cc.tarifa) / 100)
          : num * Number(cc.tarifa);
        totalComisiones += monto;
        comisiones.push({ campana_id: campId, campana_nombre: cc.campana_nombre, num, tarifa: Number(cc.tarifa), tipo_tarifa: cc.tipo_tarifa, monto });
      }

      resultados.push({ emp, sueldoQ, sueldoD, diasFalta, diasMedios, descuento, sueldoNeto, totalComisiones, totalVentas, campPrincipalId, comisiones, totalRetardos, descuentoRetardo, minutosExceso, descuentoPausa, diasConEntrada, inasistenciasAuto, faltasPorRetardos, faltaManual: faltasManualMap[emp.id] !== undefined });
    }

    const resultadosFinales = resultados; // ya filtrados arriba: asistencia real Y ventas reales

    // Limpiar del periodo a cualquiera que haya quedado en NOMINA_DETALLE de un
    // cálculo anterior pero ya no califique con la regla/datos actuales — evita
    // que datos obsoletos queden "pegados" en pantalla si esta corrida incluyó
    // a menos gente (p.ej. porque la BD de ventas no respondió, o cambió la regla).
    const idsFinales = new Set(resultadosFinales.map((r) => r.emp.id));
    const idsPrevios = await pool.request().input('pid', sql.Int, periodoId)
      .query('SELECT NEUS_ID as id FROM NOMINA_DETALLE WHERE PERIODO_ID=@pid');
    const idsAEliminar = idsPrevios.recordset.map((r) => r.id).filter((id) => !idsFinales.has(id));
    for (const nid of idsAEliminar) {
      await pool.request()
        .input('pid', sql.Int, periodoId)
        .input('nid', sql.Int, nid)
        .query('DELETE FROM NOMINA_DETALLE WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
      await pool.request()
        .input('pid', sql.Int, periodoId)
        .input('nid', sql.Int, nid)
        .query('DELETE FROM NOMINA_COMISIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
    }

    // Ranking solo entre quienes tienen ventas
    const sorted = [...resultadosFinales].filter((r) => r.totalVentas > 0).sort((a, b) => b.totalVentas - a.totalVentas);
    const rankMap = {};
    sorted.forEach((r, i) => { rankMap[r.emp.id] = i + 1; });

    // Asegurar columnas nuevas en NOMINA_DETALLE (idempotente)
    await ensureNominaDetalleColumns(pool);

    // Guardar en BD
    const actualizadoPor = req.userId ?? 1;
    for (const r of resultadosFinales) {
      const lugar = rankMap[r.emp.id];
      // Busca bono específico para la campaña principal del empleado; si no hay, usa el de campana_id=NULL
      const bonoCfgEspecifico = bonosCfg.find((b) => b.lugar === lugar && b.campana_id === r.campPrincipalId);
      const bonoCfgGeneral    = bonosCfg.find((b) => b.lugar === lugar && b.campana_id === null);
      const bonoCfg           = bonoCfgEspecifico ?? bonoCfgGeneral ?? null;
      const bonoRanking       = bonoCfg ? Number(bonoCfg.monto) : 0;
      const totalAPagar = r.sueldoNeto + r.totalComisiones + bonoRanking;

      // Upsert NOMINA_DETALLE
      await pool.request()
        .input('pid',    sql.Int,          periodoId)
        .input('nid',    sql.Int,          r.emp.id)
        .input('nombre', sql.NVarChar,     r.emp.nombre)
        .input('sq',     sql.Decimal(10,2), r.sueldoQ)
        .input('sd',     sql.Decimal(10,2), r.sueldoD)
        .input('df',     sql.Decimal(5,2),  r.diasFalta)
        .input('dmt',    sql.Decimal(5,2),  r.diasMedios)
        .input('md',     sql.Decimal(10,2), r.descuento)
        .input('sn',     sql.Decimal(10,2), r.sueldoNeto)
        .input('tc',     sql.Decimal(10,2), r.totalComisiones)
        .input('br',     sql.Decimal(10,2), bonoRanking)
        .input('tap',    sql.Decimal(10,2), totalAPagar)
        .input('tv',     sql.Int,           r.totalVentas)
        .input('lr',     sql.Int,           lugar)
        .input('tr',     sql.Int,           r.totalRetardos)
        .input('dr',     sql.Decimal(10,2), r.descuentoRetardo)
        .input('mep',    sql.Int,           r.minutosExceso)
        .input('dp',     sql.Decimal(10,2), r.descuentoPausa)
        .input('dce',    sql.Int,           r.diasConEntrada)
        .input('fam',    sql.Bit,           r.faltaManual ? 1 : 0)
        .input('fpr',    sql.Int,           r.faltasPorRetardos)
        .query(`
          IF EXISTS (SELECT 1 FROM NOMINA_DETALLE WHERE PERIODO_ID=@pid AND NEUS_ID=@nid)
            UPDATE NOMINA_DETALLE SET
              NOMBRE=@nombre, SUELDO_QUINCENAL=@sq, SUELDO_DIARIO=@sd,
              DIAS_FALTA=@df, DIAS_MEDIO_TIEMPO=@dmt, DIAS_DESCONTADOS=@df,
              MONTO_DESCUENTO=@md, SUELDO_NETO=@sn,
              TOTAL_COMISIONES=@tc, BONO_RANKING=@br, TOTAL_A_PAGAR=@tap,
              TOTAL_VENTAS=@tv, LUGAR_RANKING=@lr,
              TOTAL_RETARDOS=@tr, DESCUENTO_RETARDO=@dr,
              MINUTOS_EXCESO_PAUSA=@mep, DESCUENTO_PAUSA=@dp,
              DIAS_CON_ENTRADA=@dce, FALTA_AJUSTADA_MANUAL=@fam,
              FALTAS_POR_RETARDOS=@fpr
            WHERE PERIODO_ID=@pid AND NEUS_ID=@nid
          ELSE
            INSERT INTO NOMINA_DETALLE
              (PERIODO_ID, NEUS_ID, NOMBRE, SUELDO_QUINCENAL, SUELDO_DIARIO,
               DIAS_FALTA, DIAS_MEDIO_TIEMPO, DIAS_DESCONTADOS, MONTO_DESCUENTO,
               SUELDO_NETO, TOTAL_COMISIONES, BONO_RANKING, TOTAL_A_PAGAR, TOTAL_VENTAS, LUGAR_RANKING,
               TOTAL_RETARDOS, DESCUENTO_RETARDO, MINUTOS_EXCESO_PAUSA, DESCUENTO_PAUSA,
               DIAS_CON_ENTRADA, FALTA_AJUSTADA_MANUAL, FALTAS_POR_RETARDOS)
            VALUES (@pid, @nid, @nombre, @sq, @sd, @df, @dmt, @df, @md, @sn, @tc, @br, @tap, @tv, @lr,
                    @tr, @dr, @mep, @dp, @dce, @fam, @fpr)
        `);

      // Limpiar filas legacy con CAMPANA_ID NULL que quedan de sistemas anteriores
      await pool.request()
        .input('pid', sql.Int, periodoId)
        .input('nid', sql.Int, r.emp.id)
        .query('DELETE FROM NOMINA_COMISIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CAMPANA_ID IS NULL');

      // Upsert NOMINA_COMISIONES por campaña
      for (const com of r.comisiones) {
        await pool.request()
          .input('pid',    sql.Int,          periodoId)
          .input('nid',    sql.Int,          r.emp.id)
          .input('cid',    sql.Int,          com.campana_id)
          .input('cnombre',sql.NVarChar,     com.campana_nombre)
          .input('camp',   sql.NVarChar,     String(com.campana_id))
          .input('nc',     sql.Int,          com.num)
          .input('tarifa', sql.Decimal(10,2), com.tarifa)
          .input('tipo',   sql.NVarChar,     com.tipo_tarifa)
          .input('monto',  sql.Decimal(10,2), com.monto)
          .input('uby',    sql.Int,          actualizadoPor)
          .query(`
            IF EXISTS (SELECT 1 FROM NOMINA_COMISIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CAMPANA_ID=@cid)
              UPDATE NOMINA_COMISIONES
              SET NUM_COMISIONES=@nc, TARIFA=@tarifa, TIPO_TARIFA=@tipo, MONTO=@monto,
                  CAMPANA_NOMBRE=@cnombre, ACTUALIZADO_POR=@uby, FECHA_ACTUALIZACION=GETDATE()
              WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CAMPANA_ID=@cid
            ELSE
              INSERT INTO NOMINA_COMISIONES
                (PERIODO_ID, NEUS_ID, CAMPANA, CAMPANA_ID, CAMPANA_NOMBRE, NUM_COMISIONES, TARIFA, TIPO_TARIFA, MONTO, ACTUALIZADO_POR, FECHA_ACTUALIZACION)
              VALUES (@pid, @nid, @camp, @cid, @cnombre, @nc, @tarifa, @tipo, @monto, @uby, GETDATE())
          `);
      }
    }

    await pool.request()
      .input('id', sql.Int, periodoId)
      .query('UPDATE NOMINA_PERIODOS SET FECHA_CALCULO=GETDATE() WHERE ID=@id');

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'nomina',
      accion:    'calcular',
      entidadId: periodoId,
      detalle:   { periodoId, fechaInicio: periodo.fecha_inicio, fechaFin: periodo.fecha_fin },
      ip:        req.ip
    });

    const conVentas = resultadosFinales.filter((r) => r.totalVentas > 0).length;
    res.json({ success: true, message: `Nómina calculada — ${resultadosFinales.length} empleados (${conVentas} con ventas, ${resultadosFinales.length - conVentas} sin ventas en el periodo)` });
  } catch (e) {
    console.error('[nomina] calcularNomina error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Detalle ───────────────────────────────────────────────────────────────────

async function ensureNominaDetalleColumns(pool) {
  // Cada ALTER se ejecuta en su propio batch para evitar que SQL Server
  // falle al compilar el SELECT si la columna aún no existe.
  const cols = [
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='TOTAL_RETARDOS')
       ALTER TABLE NOMINA_DETALLE ADD TOTAL_RETARDOS INT NOT NULL DEFAULT 0`,
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='DESCUENTO_RETARDO')
       ALTER TABLE NOMINA_DETALLE ADD DESCUENTO_RETARDO DECIMAL(10,2) NOT NULL DEFAULT 0`,
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='MINUTOS_EXCESO_PAUSA')
       ALTER TABLE NOMINA_DETALLE ADD MINUTOS_EXCESO_PAUSA INT NOT NULL DEFAULT 0`,
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='DESCUENTO_PAUSA')
       ALTER TABLE NOMINA_DETALLE ADD DESCUENTO_PAUSA DECIMAL(10,2) NOT NULL DEFAULT 0`,
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='DIAS_CON_ENTRADA')
       ALTER TABLE NOMINA_DETALLE ADD DIAS_CON_ENTRADA INT NOT NULL DEFAULT 0`,
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='FALTA_AJUSTADA_MANUAL')
       ALTER TABLE NOMINA_DETALLE ADD FALTA_AJUSTADA_MANUAL BIT NOT NULL DEFAULT 0`,
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOMINA_DETALLE' AND COLUMN_NAME='FALTAS_POR_RETARDOS')
       ALTER TABLE NOMINA_DETALLE ADD FALTAS_POR_RETARDOS INT NOT NULL DEFAULT 0`,
  ];
  for (const sql_ of cols) await pool.request().query(sql_);
}

exports.getDetalle = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureNominaDetalleColumns(pool);
    const r = await pool.request()
      .input('pid', sql.Int, periodoId)
      .query(`
        SELECT
          ID                as id,
          NEUS_ID           as neusId,
          ISNULL(NOMBRE, '') as nombre,
          NULL              as puesto,
          SUELDO_QUINCENAL  as sueldoQuincenal,
          SUELDO_DIARIO     as sueldoDiario,
          DIAS_FALTA        as diasFalta,
          DIAS_MEDIO_TIEMPO as diasMedioTiempo,
          DIAS_DESCONTADOS  as diasDescontados,
          MONTO_DESCUENTO   as montoDescuento,
          SUELDO_NETO       as sueldoNeto,
          TOTAL_COMISIONES  as totalComisiones,
          ISNULL(BONO_RANKING,0)  as bonoRanking,
          TOTAL_A_PAGAR     as totalAPagar,
          ISNULL(TOTAL_VENTAS,0)  as totalVentas,
          LUGAR_RANKING     as lugarRanking,
          ISNULL(TOTAL_RETARDOS,0)       as totalRetardos,
          ISNULL(DESCUENTO_RETARDO,0)    as descuentoRetardo,
          ISNULL(MINUTOS_EXCESO_PAUSA,0) as minutosExcesoPausa,
          ISNULL(DESCUENTO_PAUSA,0)      as descuentoPausa,
          ISNULL(DIAS_CON_ENTRADA,0)     as diasConEntrada,
          ISNULL(FALTA_AJUSTADA_MANUAL,0) as faltaAjustadaManual,
          ISNULL(FALTAS_POR_RETARDOS,0)  as faltasPorRetardos
        FROM NOMINA_DETALLE
        WHERE PERIODO_ID=@pid
        ORDER BY ISNULL(LUGAR_RANKING,999) ASC, NOMBRE ASC
      `);

    // Comisiones por campaña para todos los empleados del periodo
    const comR = await pool.request()
      .input('pid', sql.Int, periodoId)
      .query(`
        SELECT c.NEUS_ID, c.CAMPANA_ID, ISNULL(c.CAMPANA_NOMBRE, cc.campana_nombre) as campana_nombre,
               c.NUM_COMISIONES as num_ventas, c.TARIFA as tarifa, c.TIPO_TARIFA as tipo_tarifa, c.MONTO as monto,
               ISNULL(cc.ganancia_neta, 0) as ganancia_neta
        FROM NOMINA_COMISIONES c
        LEFT JOIN nomina_campana_config cc ON cc.campana_id = c.CAMPANA_ID
        WHERE c.PERIODO_ID=@pid AND c.CAMPANA_ID IS NOT NULL
        ORDER BY c.NEUS_ID, c.CAMPANA_ID
      `);
    const comMap = {};
    for (const c of comR.recordset) {
      if (!comMap[c.NEUS_ID]) comMap[c.NEUS_ID] = [];
      comMap[c.NEUS_ID].push({
        campanaId:    c.CAMPANA_ID,
        campana:      c.campana_nombre ?? String(c.CAMPANA_ID),
        numVentas:    Number(c.num_ventas),
        tarifa:       Number(c.tarifa),
        tipoTarifa:   c.tipo_tarifa,
        monto:        Number(c.monto),
        gananciaNeta: Number(c.ganancia_neta),
      });
    }

    const data = r.recordset.map((d) => ({
      ...d,
      comisiones: comMap[d.neusId] ?? [],
    }));

    res.json({ success: true, data });
  } catch (e) {
    console.error('[nomina] getDetalle error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Excepciones ───────────────────────────────────────────────────────────────

exports.getExcepciones = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('pid', sql.Int, periodoId)
      .query(`
        SELECT e.ID as id, e.NEUS_ID as neusId,
          ISNULL(e.NOMBRE, u.NEUS_NOMBRES) as nombre,
          CONVERT(VARCHAR(10), e.FECHA_INCIDENCIA, 23) as fechaIncidencia,
          e.MOTIVO as motivo,
          CONVERT(VARCHAR(23), e.FECHA_CREACION, 126) as fechaCreacion
        FROM NOMINA_EXCEPCIONES e
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = e.NEUS_ID
        WHERE e.PERIODO_ID=@pid
        ORDER BY e.FECHA_INCIDENCIA DESC
      `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('[nomina] getExcepciones error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createExcepcion = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const { neusId, fechaIncidencia, motivo } = req.body;
    if (!neusId || !fechaIncidencia || !motivo?.trim())
      return res.status(400).json({ success: false, message: 'neusId, fechaIncidencia y motivo son requeridos' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const pr = await pool.request()
      .input('id', sql.Int, periodoId)
      .query('SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id');
    if (!pr.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (pr.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'El periodo ya está aprobado' });

    const creadoPor = req.userId ?? 1;
    const nombreR = await pool.request()
      .input('nid', sql.Int, Number(neusId))
      .query('SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID=@nid');
    const nombre = nombreR.recordset[0]?.NEUS_NOMBRES ?? null;

    await pool.request()
      .input('pid',    sql.Int,  periodoId)
      .input('nid',    sql.Int,  Number(neusId))
      .input('nombre', sql.NVarChar, nombre)
      .input('fi',     sql.Date, new Date(fechaIncidencia))
      .input('motivo', sql.NVarChar, motivo.trim())
      .input('uby',    sql.Int,  creadoPor)
      .query(`
        INSERT INTO NOMINA_EXCEPCIONES (PERIODO_ID, NEUS_ID, NOMBRE, FECHA_INCIDENCIA, MOTIVO, CREADO_POR, FECHA_CREACION)
        VALUES (@pid, @nid, @nombre, @fi, @motivo, @uby, GETDATE())
      `);
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('[nomina] createExcepcion error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteExcepcion = async (req, res) => {
  try {
    const excId = Number(req.params.excId);
    const pool = await databaseService.getPool(req.user?.empresa);
    const pr = await pool.request()
      .input('eid', sql.Int, excId)
      .query(`
        SELECT RTRIM(LTRIM(p.ESTADO)) as estado
        FROM NOMINA_EXCEPCIONES e JOIN NOMINA_PERIODOS p ON p.ID=e.PERIODO_ID
        WHERE e.ID=@eid
      `);
    if (!pr.recordset[0]) return res.status(404).json({ success: false, message: 'Excepción no encontrada' });
    if (pr.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'Periodo aprobado, no editable' });

    await pool.request().input('eid', sql.Int, excId).query('DELETE FROM NOMINA_EXCEPCIONES WHERE ID=@eid');
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] deleteExcepcion error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Eliminar periodo completo (solo borrador) ─────────────────────────────────

exports.deletePeriodo = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);

    const pR = await pool.request()
      .input('id', sql.Int, periodoId)
      .query(`SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id`);
    if (!pR.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (pR.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'Solo se pueden eliminar periodos en borrador' });

    await pool.request().input('pid', sql.Int, periodoId).query('DELETE FROM NOMINA_COMISIONES    WHERE PERIODO_ID=@pid');
    await pool.request().input('pid', sql.Int, periodoId).query('DELETE FROM NOMINA_DETALLE       WHERE PERIODO_ID=@pid');
    await pool.request().input('pid', sql.Int, periodoId).query('DELETE FROM NOMINA_EXCEPCIONES   WHERE PERIODO_ID=@pid');
    await pool.request().input('pid', sql.Int, periodoId).query('DELETE FROM NOMINA_FALTAS_MANUALES WHERE PERIODO_ID=@pid');
    await pool.request().input('pid', sql.Int, periodoId).query('DELETE FROM NOMINA_PERIODOS      WHERE ID=@pid');

    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] deletePeriodo error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Eliminar fila de detalle (quitar empleado del pre-cálculo) ────────────────

exports.deleteDetalleEmpleado = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const pool = await databaseService.getPool(req.user?.empresa);

    const pR = await pool.request()
      .input('id', sql.Int, periodoId)
      .query(`SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id`);
    if (!pR.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (pR.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'Periodo aprobado, no editable' });

    await pool.request().input('pid', sql.Int, periodoId).input('nid', sql.Int, neusId)
      .query('DELETE FROM NOMINA_DETALLE   WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
    await pool.request().input('pid', sql.Int, periodoId).input('nid', sql.Int, neusId)
      .query('DELETE FROM NOMINA_COMISIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');

    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] deleteDetalleEmpleado error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Aprobar / Revertir ────────────────────────────────────────────────────────

exports.aprobarPeriodo = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    const pr = await pool.request()
      .input('id', sql.Int, periodoId)
      .query('SELECT RTRIM(LTRIM(ESTADO)) as estado, FECHA_CALCULO FROM NOMINA_PERIODOS WHERE ID=@id');
    if (!pr.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (pr.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'El periodo ya está aprobado' });
    if (!pr.recordset[0].FECHA_CALCULO) return res.status(400).json({ success: false, message: 'Calcula la nómina antes de aprobar' });

    await pool.request()
      .input('id', sql.Int, periodoId)
      .query("UPDATE NOMINA_PERIODOS SET ESTADO='aprobado', FECHA_APROBACION=GETDATE() WHERE ID=@id");

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'nomina',
      accion:    'aprobar',
      entidadId: periodoId,
      detalle:   { periodoId },
      ip:        req.ip
    });

    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] aprobarPeriodo error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.revertirPeriodo = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, periodoId)
      .query("UPDATE NOMINA_PERIODOS SET ESTADO='borrador', FECHA_APROBACION=NULL WHERE ID=@id");

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'nomina',
      accion:    'revertir',
      entidadId: periodoId,
      detalle:   { periodoId },
      ip:        req.ip
    });

    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] revertirPeriodo error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Comisiones por empleado ───────────────────────────────────────────────────

exports.getComisiones = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('pid', sql.Int, periodoId)
      .input('nid', sql.Int, neusId)
      .query(`
        SELECT
          cc.campana_id               as campana,
          cc.campana_nombre           as label,
          ISNULL(c.NUM_COMISIONES, 0) as numComisiones,
          ISNULL(c.TARIFA, cc.tarifa) as tarifa,
          ISNULL(c.MONTO, 0)          as monto
        FROM nomina_campana_config cc
        LEFT JOIN NOMINA_COMISIONES c
          ON c.CAMPANA_ID = cc.campana_id
          AND c.PERIODO_ID = @pid
          AND c.NEUS_ID    = @nid
        WHERE cc.activo = 1
        ORDER BY cc.campana_id
      `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('[nomina] getComisiones error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateComisiones = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const { campana, numComisiones, tarifa } = req.body;
    if (campana === undefined) return res.status(400).json({ success: false, message: 'campana requerida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const cfgR = await pool.request()
      .input('cid', sql.Int, Number(campana))
      .query('SELECT * FROM nomina_campana_config WHERE campana_id=@cid');
    const cc         = cfgR.recordset[0];
    const tarifaVal  = tarifa !== undefined ? Number(tarifa) : (cc?.tarifa ?? 0);
    const tipo       = cc?.tipo_tarifa ?? 'fijo';
    const nc         = Number(numComisiones ?? 0);
    const actualizadoPor = req.userId ?? 1;

    let monto = tipo === 'porcentaje'
      ? nc * 6000 * (tarifaVal / 100)  // fallback sueldo si no hay detalle
      : nc * tarifaVal;

    // Si hay detalle calculado usar el sueldo real
    const dR = await pool.request()
      .input('pid', sql.Int, periodoId)
      .input('nid', sql.Int, neusId)
      .query('SELECT SUELDO_QUINCENAL FROM NOMINA_DETALLE WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
    if (dR.recordset[0] && tipo === 'porcentaje') {
      monto = nc * Number(dR.recordset[0].SUELDO_QUINCENAL) * (tarifaVal / 100);
    }

    await pool.request()
      .input('pid',    sql.Int,          periodoId)
      .input('nid',    sql.Int,          neusId)
      .input('cid',    sql.Int,          Number(campana))
      .input('camp',   sql.NVarChar,     String(campana))
      .input('cnombre',sql.NVarChar,     cc?.campana_nombre ?? String(campana))
      .input('nc',     sql.Int,          nc)
      .input('tarifa', sql.Decimal(10,2), tarifaVal)
      .input('tipo',   sql.NVarChar,     tipo)
      .input('monto',  sql.Decimal(10,2), monto)
      .input('uby',    sql.Int,          actualizadoPor)
      .query(`
        IF EXISTS (SELECT 1 FROM NOMINA_COMISIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CAMPANA_ID=@cid)
          UPDATE NOMINA_COMISIONES
          SET NUM_COMISIONES=@nc, TARIFA=@tarifa, TIPO_TARIFA=@tipo, MONTO=@monto,
              CAMPANA_NOMBRE=@cnombre, ACTUALIZADO_POR=@uby, FECHA_ACTUALIZACION=GETDATE()
          WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CAMPANA_ID=@cid
        ELSE
          INSERT INTO NOMINA_COMISIONES
            (PERIODO_ID, NEUS_ID, CAMPANA, CAMPANA_ID, CAMPANA_NOMBRE, NUM_COMISIONES, TARIFA, TIPO_TARIFA, MONTO, ACTUALIZADO_POR, FECHA_ACTUALIZACION)
          VALUES (@pid, @nid, @camp, @cid, @cnombre, @nc, @tarifa, @tipo, @monto, @uby, GETDATE())
      `);
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] updateComisiones error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Días de falta inline ──────────────────────────────────────────────────────

exports.updateFaltas = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const { diasFalta } = req.body;
    if (diasFalta === undefined || Number(diasFalta) < 0)
      return res.status(400).json({ success: false, message: 'diasFalta requerido (>= 0)' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const pr = await pool.request()
      .input('id', sql.Int, periodoId)
      .query('SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id');
    if (pr.recordset[0]?.estado !== 'borrador')
      return res.status(400).json({ success: false, message: 'Periodo aprobado, no editable' });

    const actualizadoPor = req.userId ?? 1;
    const df = Number(diasFalta);

    // Upsert en NOMINA_FALTAS_MANUALES
    await pool.request()
      .input('pid', sql.Int, periodoId)
      .input('nid', sql.Int, neusId)
      .input('df',  sql.Decimal(5,2), df)
      .input('uby', sql.Int, actualizadoPor)
      .query(`
        IF EXISTS (SELECT 1 FROM NOMINA_FALTAS_MANUALES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid)
          UPDATE NOMINA_FALTAS_MANUALES SET DIAS_FALTA=@df, ACTUALIZADO_POR=@uby, FECHA_ACTUALIZACION=GETDATE()
          WHERE PERIODO_ID=@pid AND NEUS_ID=@nid
        ELSE
          INSERT INTO NOMINA_FALTAS_MANUALES (PERIODO_ID, NEUS_ID, DIAS_FALTA, ACTUALIZADO_POR, FECHA_ACTUALIZACION)
          VALUES (@pid, @nid, @df, @uby, GETDATE())
      `);

    // Actualizar NOMINA_DETALLE en tiempo real si ya está calculado
    const dR = await pool.request()
      .input('pid', sql.Int, periodoId)
      .input('nid', sql.Int, neusId)
      .query('SELECT SUELDO_DIARIO FROM NOMINA_DETALLE WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
    if (dR.recordset[0]) {
      const cfgR2 = await pool.request().query('SELECT TOP 1 * FROM nomina_config_global ORDER BY id DESC');
      const cfg2  = cfgR2.recordset[0] ?? {};
      const FDC   = Number(cfg2.factor_dia_completo ?? 1.0);
      const FMD   = Number(cfg2.factor_medio_dia    ?? 0.5);
      const sd    = Number(dR.recordset[0].SUELDO_DIARIO);
      const dc    = Math.floor(df);
      const dm    = Math.round((df - dc) * 2) / 2;
      const dmt   = dm;
      const md    = (dc * FDC + dm * FMD) * sd;
      const sq    = sd * (Number(cfgR2.recordset[0]?.dias_quincena ?? 15));
      const sn    = Math.max(0, sq - md);
      await pool.request()
        .input('pid', sql.Int,           periodoId)
        .input('nid', sql.Int,           neusId)
        .input('df',  sql.Decimal(5,2),  df)
        .input('dmt', sql.Decimal(5,2),  dmt)
        .input('md',  sql.Decimal(10,2), md)
        .input('sn',  sql.Decimal(10,2), sn)
        .query(`
          UPDATE NOMINA_DETALLE
          SET DIAS_FALTA=@df, DIAS_MEDIO_TIEMPO=@dmt, DIAS_DESCONTADOS=@df,
              MONTO_DESCUENTO=@md, SUELDO_NETO=@sn
          WHERE PERIODO_ID=@pid AND NEUS_ID=@nid
        `);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] updateFaltas error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Percepciones ──────────────────────────────────────────────────────────────

exports.getPercepciones = async (req, res) => {
  try {
    const neusId = Number(req.params.empleadoId);
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('nid', sql.Int, neusId)
      .query('SELECT ID as id, NEUS_ID as neus_id, SUELDO_QUINCENAL as sueldo_quincenal, ACTIVO as activo FROM NOMINA_PERCEPCIONES WHERE NEUS_ID=@nid ORDER BY FECHA_CREACION DESC');
    res.json({ success: true, data: r.recordset.map((p) => ({ ...p, sueldoQuincenal: Number(p.sueldo_quincenal), activo: !!p.activo })) });
  } catch (e) {
    console.error('[nomina] getPercepciones error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePercepciones = async (req, res) => {
  try {
    const neusId = Number(req.params.empleadoId);
    const { sueldoQuincenal } = req.body;
    if (!sueldoQuincenal || Number(sueldoQuincenal) <= 0)
      return res.status(400).json({ success: false, message: 'sueldoQuincenal requerido' });

    const creadoPor = req.userId ?? 1;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('nid', sql.Int, neusId).query('UPDATE NOMINA_PERCEPCIONES SET ACTIVO=0 WHERE NEUS_ID=@nid AND ACTIVO=1');
    await pool.request()
      .input('nid', sql.Int, neusId)
      .input('sq',  sql.Decimal(10,2), Number(sueldoQuincenal))
      .input('uby', sql.Int, creadoPor)
      .query(`
        INSERT INTO NOMINA_PERCEPCIONES (NEUS_ID, SUELDO_QUINCENAL, VIGENTE_DESDE, ACTIVO, CREADO_POR, FECHA_CREACION, ES_MANUAL)
        VALUES (@nid, @sq, CAST(GETDATE() AS DATE), 1, @uby, GETDATE(), 1)
      `);
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] updatePercepciones error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Dashboard resumen ─────────────────────────────────────────────────────────

exports.getDashboardResumen = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const pr = await pool.request().query(`
      SELECT TOP 1 ID as id,
        CONVERT(VARCHAR(10), FECHA_INICIO, 23) as fechaInicio,
        CONVERT(VARCHAR(10), FECHA_FIN, 23)    as fechaFin,
        RTRIM(LTRIM(ESTADO)) as estado
      FROM NOMINA_PERIODOS WHERE FECHA_CALCULO IS NOT NULL
      ORDER BY FECHA_INICIO DESC
    `);
    const periodo = pr.recordset[0];
    if (!periodo) return res.json({ success: true, data: { periodo: null } });

    const dr = await pool.request()
      .input('pid', sql.Int, periodo.id)
      .query('SELECT NEUS_ID, NOMBRE, DIAS_FALTA, MONTO_DESCUENTO, TOTAL_A_PAGAR, SUELDO_NETO FROM NOMINA_DETALLE WHERE PERIODO_ID=@pid');
    const detalle = dr.recordset;

    const costoTotal         = detalle.reduce((s, d) => s + Number(d.TOTAL_A_PAGAR), 0);
    const totalDescuentos    = detalle.reduce((s, d) => s + Number(d.MONTO_DESCUENTO), 0);
    const totalEmpleados     = detalle.length;
    const costoPorHoraPromedio = totalEmpleados > 0 ? (costoTotal / totalEmpleados / 15 / 8) : 0;

    res.json({
      success: true,
      data: {
        periodo,
        costoTotal,
        totalDescuentos,
        totalEmpleados,
        costoPorHoraPromedio,
        proyeccionMensual: costoTotal * 2,
        proyeccionAnual:   costoTotal * 24,
        detalle: detalle.map((d) => ({
          neusId: d.NEUS_ID,
          nombre: d.NOMBRE || '',
          diasFalta: Number(d.DIAS_FALTA),
          montoDescuento: Number(d.MONTO_DESCUENTO),
        })),
      },
    });
  } catch (e) {
    console.error('[nomina] getDashboardResumen error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Ventas individuales de un empleado en un periodo ─────────────────────────
exports.getVentasEmpleado = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener nombre del empleado y fechas base/corte
    const pR = await pool.request()
      .input('id', sql.Int, periodoId)
      .query(`SELECT
        CONVERT(VARCHAR(10), ISNULL(FECHA_BASE,  FECHA_INICIO), 23) as fecha_base,
        CONVERT(VARCHAR(10), ISNULL(FECHA_CORTE, FECHA_FIN),    23) as fecha_corte
      FROM NOMINA_PERIODOS WHERE ID=@id`);
    if (!pR.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    const { fecha_base: FB, fecha_corte: FC } = pR.recordset[0];

    const empR = await pool.request()
      .input('nid', sql.Int, neusId)
      .query(`SELECT NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID=@nid`);
    const nombreEmp = empR.recordset[0]?.nombre ?? '';

    // Buscar ventas en BD de ventas por nombre normalizado
    function normName(s) {
      return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    }
    const normEmp = normName(nombreEmp);

    const vPool = await getVentasPool();
    const vR = await vPool.request()
      .input('fi', sql.Date, new Date(FB))
      .input('ff', sql.Date, new Date(FC))
      .query(`SELECT idVenta, nombreCliente, telefonoCliente, evidencia, fecha, nombreAgente, estatus, campaignId
              FROM Ventas
              WHERE estatus IN ('Aprobada','approved','Formalizado','formalized_banamex','approved_banamex')
                AND CAST(fecha AS DATE) BETWEEN @fi AND @ff
              ORDER BY fecha DESC`);

    // Filtrar por nombre del empleado
    const ventas = vR.recordset.filter((v) => {
      const normV = normName(v.nombreAgente);
      if (normV === normEmp) return true;
      const MIN = 8;
      if (normV.length >= MIN && normEmp.startsWith(normV)) return true;
      if (normEmp.length >= MIN && normV.startsWith(normEmp)) return true;
      const len = Math.min(normV.length, normEmp.length, 20);
      return len >= 20 && normV.slice(0, len) === normEmp.slice(0, len);
    });

    res.json({
      success: true,
      data: ventas.map((v) => ({
        id: v.idVenta,
        nombreCliente: v.nombreCliente,
        telefono: v.telefonoCliente,
        evidencia: v.evidencia,
        fecha: v.fecha,
        estatus: v.estatus,
        campaignId: v.campaignId,
      })),
    });
  } catch (e) {
    console.error('[nomina] getVentasEmpleado error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Editar estado de un día de asistencia ────────────────────────────────────
// tipo: 'asistencia' | 'retardo' | 'falta' | 'justificado' | 'medio_dia' | 'falta_justificada'
exports.patchDiaAsistencia = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const { fecha, tipo, motivo } = req.body;
    if (!fecha || !tipo) return res.status(400).json({ success: false, message: 'fecha y tipo requeridos' });

    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipo === 'falta') {
      // Eliminar la entrada de ese día si existe (queda sin registro = falta)
      await pool.request()
        .input('nid',   sql.Int,      neusId)
        .input('fecha', sql.NVarChar, fecha)
        .query(`DELETE FROM ASISTENCIA_ENTRADAS WHERE NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA, 23)=@fecha`);
      // Si el día venía marcado como excepción (justificado/medio_dia/falta_justificada),
      // hay que quitar esa excepción — si no, el día sigue leyéndose con el motivo viejo
      // aunque ya no tenga entrada de asistencia.
      await pool.request()
        .input('pid',   sql.Int,      periodoId)
        .input('nid',   sql.Int,      neusId)
        .input('fecha', sql.NVarChar, fecha)
        .query(`DELETE FROM NOMINA_EXCEPCIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA_INCIDENCIA, 23)=@fecha`);
    } else if (tipo === 'asistencia' || tipo === 'retardo') {
      const esRetardo = tipo === 'retardo' ? 1 : 0;
      // Upsert: si ya existe actualiza ES_RETARDO, si no inserta con hora ficticia 10:00
      const existe = await pool.request()
        .input('nid',   sql.Int,      neusId)
        .input('fecha', sql.NVarChar, fecha)
        .query(`SELECT TOP 1 ID FROM ASISTENCIA_ENTRADAS WHERE NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA, 23)=@fecha`);
      if (existe.recordset.length > 0) {
        await pool.request()
          .input('nid',       sql.Int,      neusId)
          .input('fecha',     sql.NVarChar, fecha)
          .input('esRetardo', sql.Bit,      esRetardo)
          .query(`UPDATE ASISTENCIA_ENTRADAS SET ES_RETARDO=@esRetardo WHERE NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA, 23)=@fecha`);
      } else {
        // Obtener el ROL del usuario para no violar el NOT NULL
        const rolR = await pool.request()
          .input('nid', sql.Int, neusId)
          .query(`SELECT TOP 1 NEUS_TIPOUSUARIO as rol FROM NEUS_USUARIOS WHERE NEUS_ID=@nid`);
        const rol = rolR.recordset[0]?.rol ?? 'CC';
        const fechaBase = new Date(fecha + 'T10:00:00');
        await pool.request()
          .input('nid',        sql.Int,      neusId)
          .input('fecha',      sql.DateTime, fechaBase)
          .input('horaEsp',    sql.DateTime, fechaBase)
          .input('rol',        sql.NVarChar, rol)
          .input('esRetardo',  sql.Bit,      esRetardo)
          .query(`INSERT INTO ASISTENCIA_ENTRADAS (NEUS_ID, FECHA, HORA_ENTRADA, HORA_ESPERADA, ROL, ES_RETARDO, MINUTOS_RETARDO)
                  VALUES (@nid, @fecha, @fecha, @horaEsp, @rol, @esRetardo, 0)`);
      }
      // Igual que en 'falta': si el día tenía una excepción vieja (medio_dia/justificado/
      // falta_justificada), hay que quitarla o el día se sigue leyendo con el motivo viejo.
      await pool.request()
        .input('pid',   sql.Int,      periodoId)
        .input('nid',   sql.Int,      neusId)
        .input('fecha', sql.NVarChar, fecha)
        .query(`DELETE FROM NOMINA_EXCEPCIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA_INCIDENCIA, 23)=@fecha`);
    } else if (tipo === 'justificado' || tipo === 'medio_dia' || tipo === 'falta_justificada') {
      // Eliminar la entrada (queda sin registro) y agregar excepción en el periodo
      await pool.request()
        .input('nid',   sql.Int,      neusId)
        .input('fecha', sql.NVarChar, fecha)
        .query(`DELETE FROM ASISTENCIA_ENTRADAS WHERE NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA, 23)=@fecha`);
      // Upsert excepción — MEDIO_DIA y FALTA_JUSTIFICADA usan motivo especial para
      // distinguirse de Justificado genérico (que no cuenta como falta ni se descuenta)
      const motivoFinal = tipo === 'medio_dia' ? 'MEDIO_DIA'
        : tipo === 'falta_justificada' ? 'FALTA_JUSTIFICADA'
        : (motivo || 'Justificado');
      const creadoPor   = req.user?.id ?? neusId;
      const excExiste = await pool.request()
        .input('pid',   sql.Int,      periodoId)
        .input('nid',   sql.Int,      neusId)
        .input('fecha', sql.NVarChar, fecha)
        .query(`SELECT TOP 1 ID FROM NOMINA_EXCEPCIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA_INCIDENCIA, 23)=@fecha`);
      if (excExiste.recordset.length === 0) {
        await pool.request()
          .input('pid',       sql.Int,      periodoId)
          .input('nid',       sql.Int,      neusId)
          .input('fecha',     sql.Date,     new Date(fecha))
          .input('motivo',    sql.NVarChar, motivoFinal)
          .input('creadoPor', sql.Int,      creadoPor)
          .query(`INSERT INTO NOMINA_EXCEPCIONES (PERIODO_ID, NEUS_ID, FECHA_INCIDENCIA, MOTIVO, CREADO_POR) VALUES (@pid, @nid, @fecha, @motivo, @creadoPor)`);
      } else {
        await pool.request()
          .input('pid',    sql.Int,      periodoId)
          .input('nid',    sql.Int,      neusId)
          .input('fecha',  sql.NVarChar, fecha)
          .input('motivo', sql.NVarChar, motivoFinal)
          .query(`UPDATE NOMINA_EXCEPCIONES SET MOTIVO=@motivo WHERE PERIODO_ID=@pid AND NEUS_ID=@nid AND CONVERT(VARCHAR(10), FECHA_INCIDENCIA, 23)=@fecha`);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] patchDiaAsistencia error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Desglose de faltas/retardos por empleado en un periodo ───────────────────
exports.getDesgloseFaltas = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const neusId    = Number(req.params.neusId);
    const pool = await databaseService.getPool(req.user?.empresa);

    const pR = await pool.request()
      .input('id', sql.Int, periodoId)
      .query(`SELECT
        CONVERT(VARCHAR(10), ISNULL(FECHA_BASE,  FECHA_INICIO), 23) as fecha_base,
        CONVERT(VARCHAR(10), ISNULL(FECHA_CORTE, FECHA_FIN),    23) as fecha_corte
      FROM NOMINA_PERIODOS WHERE ID=@id`);
    if (!pR.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    const { fecha_base: FB, fecha_corte: FC } = pR.recordset[0];

    function diasHabilesLista(fi, ff) {
      const dias = [];
      const cur = new Date(fi + 'T12:00:00');
      const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
      const end = new Date(ff + 'T12:00:00');
      const limite = end < hoy ? end : hoy;
      while (cur <= limite) {
        if (cur.getDay() !== 0) dias.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return dias;
    }
    const diasHabiles = diasHabilesLista(FB, FC);

    const entR = await pool.request()
      .input('nid', sql.Int, neusId)
      .input('fi',  sql.NVarChar, FB)
      .input('ff',  sql.NVarChar, FC)
      .query(`SELECT
        CONVERT(VARCHAR(10), FECHA, 23) as fecha,
        ISNULL(ES_RETARDO, 0) as es_retardo,
        CONVERT(VARCHAR(5), HORA_ENTRADA, 108) as hora
      FROM ASISTENCIA_ENTRADAS
      WHERE NEUS_ID=@nid AND FECHA >= @fi AND FECHA <= @ff
      ORDER BY FECHA`);
    const entradasPorDia = {};
    for (const e of entR.recordset) {
      entradasPorDia[e.fecha] = { esRetardo: e.es_retardo === true || e.es_retardo === 1, hora: e.hora };
    }

    const excR = await pool.request()
      .input('pid', sql.Int, periodoId)
      .input('nid', sql.Int, neusId)
      .query(`SELECT CONVERT(VARCHAR(10), FECHA_INCIDENCIA, 23) as fecha, MOTIVO as motivo
              FROM NOMINA_EXCEPCIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid`);
    const excPorDia = {};
    for (const e of excR.recordset) excPorDia[e.fecha] = e.motivo || 'Justificado';

    const cfgR = await pool.request().query('SELECT TOP 1 retardos_por_falta FROM nomina_config_global ORDER BY id DESC');
    const retardosPorFalta = Number(cfgR.recordset[0]?.retardos_por_falta ?? 3);

    const dias = diasHabiles.map((fecha) => {
      const entrada     = entradasPorDia[fecha];
      const excMotivo   = excPorDia[fecha];
      let tipo;
      if (entrada)                              tipo = entrada.esRetardo ? 'retardo' : 'asistencia';
      else if (excMotivo === 'MEDIO_DIA')       tipo = 'medio_dia';
      else if (excMotivo === 'FALTA_JUSTIFICADA') tipo = 'falta_justificada';
      else if (excMotivo)                       tipo = 'justificado';
      else                                       tipo = 'falta';
      return { fecha, tipo, hora: entrada?.hora ?? null, motivo: excMotivo ?? null };
    });

    const totalFaltasDirectas    = dias.filter((d) => d.tipo === 'falta').length;
    const totalMediosDias        = dias.filter((d) => d.tipo === 'medio_dia').length;
    const totalFaltasJustificadas = dias.filter((d) => d.tipo === 'falta_justificada').length;
    const totalRetardos          = dias.filter((d) => d.tipo === 'retardo').length;
    const faltasPorRetardos   = retardosPorFalta > 0 ? Math.floor(totalRetardos / retardosPorFalta) : 0;
    // Medio día equivale a 0.5 falta; falta justificada cuenta como 1 falta completa
    const totalFaltas = totalFaltasDirectas + faltasPorRetardos + totalMediosDias * 0.5 + totalFaltasJustificadas;

    res.json({
      success: true,
      data: {
        dias,
        resumen: {
          totalDiasHabiles: diasHabiles.length,
          totalAsistencias: dias.filter((d) => d.tipo === 'asistencia').length,
          totalRetardos,
          totalFaltasDirectas,
          totalMediosDias,
          totalFaltasJustificadas,
          faltasPorRetardos,
          retardosPorFalta,
          totalFaltas,
        },
      },
    });
  } catch (e) {
    console.error('[nomina] getDesgloseFaltas error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Lista negra de agentes (excluidos de todo cálculo futuro) ─────────────────
// Un agente inactivo puede seguir apareciendo en cálculos si tuvo asistencia o
// ventas dentro del rango del periodo (regla intencional para no perder pagos
// pendientes). Cuando ya no debe volver a aparecer en ningún corte futuro, un
// admin lo agrega aquí; puede quitarlo en cualquier momento si vuelve a aplicar.

async function ensureExcluidosTabla(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='NOMINA_AGENTES_EXCLUIDOS')
    CREATE TABLE NOMINA_AGENTES_EXCLUIDOS (
      ID          INT IDENTITY PRIMARY KEY,
      NEUS_ID     INT NOT NULL UNIQUE,
      MOTIVO      NVARCHAR(300) NULL,
      CREADO_POR  INT NULL,
      FECHA       DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

exports.getAgentesExcluidos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcluidosTabla(pool);
    const r = await pool.request().query(`
      SELECT x.ID as id, x.NEUS_ID as neusId, u.NEUS_NOMBRES as nombre, x.MOTIVO as motivo,
             CONVERT(VARCHAR(19), x.FECHA, 120) as fecha
      FROM NOMINA_AGENTES_EXCLUIDOS x
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = x.NEUS_ID
      ORDER BY x.FECHA DESC
    `);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('[nomina] getAgentesExcluidos error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addAgenteExcluido = async (req, res) => {
  try {
    const { neusId, motivo, periodoId } = req.body || {};
    const id = Number(neusId);
    if (!id) return res.status(400).json({ success: false, message: 'neusId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcluidosTabla(pool);

    const dup = await pool.request().input('nid', sql.Int, id)
      .query('SELECT 1 FROM NOMINA_AGENTES_EXCLUIDOS WHERE NEUS_ID=@nid');
    if (dup.recordset.length > 0)
      return res.status(409).json({ success: false, message: 'Ese agente ya está en la lista de excluidos' });

    const creadoPor = req.user?.id ?? null;
    await pool.request()
      .input('nid', sql.Int, id)
      .input('motivo', sql.NVarChar(300), motivo || null)
      .input('creadoPor', sql.Int, creadoPor)
      .query('INSERT INTO NOMINA_AGENTES_EXCLUIDOS (NEUS_ID, MOTIVO, CREADO_POR) VALUES (@nid, @motivo, @creadoPor)');

    // Si se excluye desde el detalle de un periodo en borrador, también se
    // quita su fila ya calculada — de lo contrario seguiría visible ahí hasta
    // el próximo "Calcular nómina", aunque ya esté en la lista negra.
    const pid = Number(periodoId);
    if (pid) {
      const pR = await pool.request().input('id', sql.Int, pid)
        .query(`SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id`);
      if (pR.recordset[0]?.estado === 'borrador') {
        await pool.request().input('pid', sql.Int, pid).input('nid', sql.Int, id)
          .query('DELETE FROM NOMINA_DETALLE    WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
        await pool.request().input('pid', sql.Int, pid).input('nid', sql.Int, id)
          .query('DELETE FROM NOMINA_COMISIONES WHERE PERIODO_ID=@pid AND NEUS_ID=@nid');
      }
    }

    res.status(201).json({ success: true });
  } catch (e) {
    console.error('[nomina] addAgenteExcluido error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.removeAgenteExcluido = async (req, res) => {
  try {
    const neusId = Number(req.params.neusId);
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcluidosTabla(pool);
    await pool.request().input('nid', sql.Int, neusId)
      .query('DELETE FROM NOMINA_AGENTES_EXCLUIDOS WHERE NEUS_ID=@nid');
    res.json({ success: true });
  } catch (e) {
    console.error('[nomina] removeAgenteExcluido error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Vacía toda la lista negra de una sola vez (rollback de emergencia)
exports.clearAgentesExcluidos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcluidosTabla(pool);
    const r = await pool.request().query('DELETE FROM NOMINA_AGENTES_EXCLUIDOS');
    res.json({ success: true, eliminados: r.rowsAffected[0] });
  } catch (e) {
    console.error('[nomina] clearAgentesExcluidos error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Limpia del detalle ya calculado de un periodo (en borrador) a cualquier
// agente que esté en la lista negra — cubre casos donde la exclusión se hizo
// antes de que existiera el borrado automático, o se agregó desde el modal
// de "Excluidos" sin pasar por un periodo específico.
exports.limpiarExcluidosDePeriodo = async (req, res) => {
  try {
    const periodoId = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureExcluidosTabla(pool);

    const pR = await pool.request().input('id', sql.Int, periodoId)
      .query(`SELECT RTRIM(LTRIM(ESTADO)) as estado FROM NOMINA_PERIODOS WHERE ID=@id`);
    if (!pR.recordset[0]) return res.status(404).json({ success: false, message: 'Periodo no encontrado' });
    if (pR.recordset[0].estado !== 'borrador') return res.status(400).json({ success: false, message: 'Periodo aprobado, no editable' });

    const r = await pool.request().input('pid', sql.Int, periodoId).query(`
      DELETE d
      OUTPUT DELETED.NEUS_ID
      FROM NOMINA_DETALLE d
      INNER JOIN NOMINA_AGENTES_EXCLUIDOS x ON x.NEUS_ID = d.NEUS_ID
      WHERE d.PERIODO_ID = @pid
    `);
    await pool.request().input('pid', sql.Int, periodoId).query(`
      DELETE c FROM NOMINA_COMISIONES c
      INNER JOIN NOMINA_AGENTES_EXCLUIDOS x ON x.NEUS_ID = c.NEUS_ID
      WHERE c.PERIODO_ID = @pid
    `);

    res.json({ success: true, removidos: r.recordset.length });
  } catch (e) {
    console.error('[nomina] limpiarExcluidosDePeriodo error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};
