const sql = require('mssql');
const databaseService = require('../services/databaseService');
const dbVentas = require('../config/database_ventas');
const { logAudit } = require('../services/auditService');

// Pool separado hacia la BD del sistema Ventas (plata_prospectPRO) — mismo
// patrón que ventasController.getVentasPool(), duplicado aquí a propósito
// para no acoplar este controller a las rutas/middlewares de Ventas.
let _ventasPool = null;
async function getVentasPool() {
  if (_ventasPool && _ventasPool.connected) return _ventasPool;
  _ventasPool = await new sql.ConnectionPool(dbVentas).connect();
  return _ventasPool;
}

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// Catálogo de campañas activas — se jala en vivo del sistema Ventas, nunca
// se cachea en AGYDA (evita que quede desactualizado si Ventas crea/renombra).
exports.listCampanasDisponibles = async (req, res) => {
  try {
    const pool = await getVentasPool();
    const result = await pool.request().query(
      `SELECT id, nombre, color, CAST(ISNULL(tieneSeguimiento, 0) AS bit) AS seguimiento FROM [Campanas] WHERE activo = 1 ORDER BY nombre`
    );
    const tipos = await tiposDe(req);
    res.json({ success: true, data: result.recordset.map((c) => ponerTipo(c, tipos)) });
  } catch (e) {
    console.error('Error listCampanasDisponibles:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Campaña asignada por agente — todos los agentes CC con su campaña actual
// (si tienen una asignada). LEFT JOIN para incluir agentes sin asignación.
exports.listAgentesCampanas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT u.NEUS_ID as neusId, u.NEUS_NOMBRES as nombre,
             a.ACA_VENTAS_CAMPANA_ID as campanaId, a.ACA_VENTAS_CAMPANA_NOMBRE as campanaNombre,
             a.ACA_FECHA_ASIGNACION as fechaAsignacion
      FROM NEUS_USUARIOS u
      LEFT JOIN AC_CAMPANIAS_AGENTES a ON a.ACA_NEUS_ID = u.NEUS_ID
      WHERE u.NEUS_TIPOUSUARIO = 'CC' AND u.NEUS_ACTIVO = 1
      ORDER BY u.NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listAgentesCampanas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getAgenteCampana = async (req, res) => {
  try {
    const neusId = parseInt(req.params.neusId, 10);
    if (!Number.isFinite(neusId)) return res.status(400).json({ success: false, message: 'neusId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, neusId)
      .query(`
        SELECT ACA_VENTAS_CAMPANA_ID as campanaId, ACA_VENTAS_CAMPANA_NOMBRE as campanaNombre, ACA_FECHA_ASIGNACION as fechaAsignacion
        FROM AC_CAMPANIAS_AGENTES WHERE ACA_NEUS_ID = @id
      `);
    res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    console.error('Error getAgenteCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Asigna/reemplaza la campaña de un agente. Body: { campanaId, campanaNombre }
// — el nombre se manda desde el frontend (viene del mismo catálogo que se
// listó en listCampanasDisponibles) para no depender de una segunda consulta
// a Ventas en cada guardado.
exports.setAgenteCampana = async (req, res) => {
  try {
    const neusId = parseInt(req.params.neusId, 10);
    if (!Number.isFinite(neusId)) return res.status(400).json({ success: false, message: 'neusId inválido' });

    const { campanaId, campanaNombre } = req.body || {};
    if (!campanaId || !campanaNombre) return res.status(400).json({ success: false, message: 'campanaId y campanaNombre requeridos' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const usuario = await pool.request()
      .input('id', sql.Int, neusId)
      .query(`SELECT TOP 1 NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_ID=@id AND NEUS_ACTIVO=1`);
    if (!usuario.recordset.length) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    await pool.request()
      .input('neusId', sql.Int, neusId)
      .input('campanaId', sql.Int, Number(campanaId))
      .input('campanaNombre', sql.NVarChar(200), String(campanaNombre))
      .input('asignadoPor', sql.Int, getUserId(req))
      .query(`
        MERGE AC_CAMPANIAS_AGENTES AS target
        USING (SELECT @neusId AS neusId) AS src ON target.ACA_NEUS_ID = src.neusId
        WHEN MATCHED THEN
          UPDATE SET ACA_VENTAS_CAMPANA_ID=@campanaId, ACA_VENTAS_CAMPANA_NOMBRE=@campanaNombre,
                     ACA_ASIGNADO_POR=@asignadoPor, ACA_FECHA_ASIGNACION=GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (ACA_NEUS_ID, ACA_VENTAS_CAMPANA_ID, ACA_VENTAS_CAMPANA_NOMBRE, ACA_ASIGNADO_POR)
          VALUES (@neusId, @campanaId, @campanaNombre, @asignadoPor);
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'asignar-campana-agente',
      entidadId: neusId, detalle: { campanaId, campanaNombre }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error setAgenteCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteAgenteCampana = async (req, res) => {
  try {
    const neusId = parseInt(req.params.neusId, 10);
    if (!Number.isFinite(neusId)) return res.status(400).json({ success: false, message: 'neusId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, neusId)
      .query(`DELETE FROM AC_CAMPANIAS_AGENTES WHERE ACA_NEUS_ID=@id`);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'quitar-campana-agente', entidadId: neusId, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleteAgenteCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/* ── Campañas del sistema de Ventas (plata_prospectPRO): alta, edición y baja ──
   Se escriben directo en la BD de Ventas (la misma que usa ventas.ardabytec.vip):
   Campanas (nombre, color, activo) y CampaignStatuses (sus estatus/tipificaciones,
   en orden). Eliminar = desactivar: sus ventas y metas se conservan. */

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const limpiarColor = (c) => (COLOR_RE.test(String(c || '')) ? String(c) : null);
// Estatus con los que nace una campaña nueva (los mismos que usan PlataCard y Amex).
const ESTATUS_INICIALES = [
  { nombre: 'Aprobada', color: '#22c55e' },
  { nombre: 'Rechazada', color: '#ef4444' },
  { nombre: 'Agendada', color: '#3b82f6' },
  { nombre: 'Pendiente', color: '#f59e0b' },
];

// [{ id?, nombre, color, activo }] → validado, sin duplicados por nombre, máx. 30.
function normalizarEstatus(lista) {
  const vistos = new Set();
  const out = [];
  for (const e of Array.isArray(lista) ? lista : []) {
    const nombre = String(e?.nombre || '').trim().slice(0, 100);
    if (!nombre || vistos.has(nombre.toLowerCase())) continue;
    vistos.add(nombre.toLowerCase());
    out.push({ id: Number(e.id) || null, nombre, color: limpiarColor(e.color), activo: e.activo !== false });
    if (out.length >= 30) break;
  }
  return out;
}

async function leerCampanaVentas(pv, id) {
  const c = (await pv.request().input('id', sql.Int, id)
    .query('SELECT ID AS id, LTRIM(RTRIM(nombre)) AS nombre, color, CAST(activo AS bit) AS activo, CAST(ISNULL(tieneSeguimiento, 0) AS bit) AS seguimiento FROM [Campanas] WHERE ID = @id')).recordset[0];
  if (!c) return null;
  const est = (await pv.request().input('id', sql.Int, id).query(`
    SELECT id, LTRIM(RTRIM(nombreEstado)) AS nombre, color, CAST(activo AS bit) AS activo, orden
    FROM CampaignStatuses WHERE campaignId = @id ORDER BY orden, id`)).recordset;
  const ventas = (await pv.request().input('id', sql.Int, id).query('SELECT COUNT(*) AS n FROM Ventas WHERE campaignId = @id')).recordset[0].n;
  return { ...c, estatus: est.map((e) => ({ ...e, activo: !!e.activo })), ventas };
}

// Guarda los estatus de una campaña dentro de la transacción: actualiza los
// que traen id, crea los nuevos y desactiva (no borra: hay ventas con ese
// estatus) los que ya no vienen.
async function guardarEstatus(tx, campanaId, estatus) {
  const actuales = (await new sql.Request(tx).input('c', sql.Int, campanaId)
    .query('SELECT id FROM CampaignStatuses WHERE campaignId = @c')).recordset.map((r) => r.id);
  const conservados = new Set();
  for (const [i, e] of estatus.entries()) {
    if (e.id && actuales.includes(e.id)) {
      conservados.add(e.id);
      await new sql.Request(tx).input('id', sql.Int, e.id).input('n', sql.NVarChar(100), e.nombre).input('col', sql.NVarChar(20), e.color)
        .input('o', sql.Int, i + 1).input('a', sql.Bit, e.activo ? 1 : 0)
        .query('UPDATE CampaignStatuses SET nombreEstado = @n, color = @col, orden = @o, activo = @a, updatedAt = SYSDATETIME() WHERE id = @id');
    } else {
      await new sql.Request(tx).input('c', sql.Int, campanaId).input('n', sql.NVarChar(100), e.nombre).input('col', sql.NVarChar(20), e.color)
        .input('o', sql.Int, i + 1).input('a', sql.Bit, e.activo ? 1 : 0)
        .query(`INSERT INTO CampaignStatuses (campaignId, nombreEstado, orden, activo, createdAt, updatedAt, color)
                VALUES (@c, @n, @o, @a, SYSDATETIME(), SYSDATETIME(), @col)`);
    }
  }
  const quitar = actuales.filter((id) => !conservados.has(id));
  if (quitar.length) {
    await new sql.Request(tx).query(`UPDATE CampaignStatuses SET activo = 0, updatedAt = SYSDATETIME() WHERE id IN (${quitar.map(Number).join(',')})`);
  }
}

// GET /campanas/grupos — grupos de Contact Center (CC_EQUIPOS activos) con todo
// lo que tienen enlazado: campañas, campaña de Ventas, marcador, skills, canales
// (los de sus skills), formularios y tipificaciones (los de sus campañas),
// supervisores, agentes y clientes. Para la pestaña Grupos de Campañas.
exports.listGruposDetalle = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const q = (t) => pool.request().query(t).then((r) => r.recordset).catch(() => []);
    const grupos = await q(`
      SELECT e.EQ_ID id, e.EQ_NOMBRE nombre, e.EQ_DESCRIPCION descripcion, ISNULL(e.EQ_MODALIDAD, 'omnicanal') modalidad,
             CAST(ISNULL(e.EQ_ATIENDE_CLIENTES, 0) AS bit) atiendeClientes, e.EQ_CREADO_EN creadoEn,
             e.EQ_VENTAS_CAMPANA_ID ventasId, e.EQ_VENTAS_CAMPANA_NOMBRE ventasNombre, v.WVIS_LABEL marcador, e.EQ_CAMPANIA_ID campaniaLegacy
      FROM CC_EQUIPOS e LEFT JOIN WEBPHONE_VISTAS v ON v.WVIS_ID = e.EQ_WEBPHONE_VISTA_ID
      WHERE e.EQ_ACTIVO = 1 ORDER BY e.EQ_NOMBRE`);
    if (!grupos.length) return res.json({ success: true, data: [] });
    const ids = grupos.map((g) => g.id).join(',');

    const [campanias, skills, canales, miembros, clientes, formularios, tipificaciones] = await Promise.all([
      q(`SELECT x.equipoId, c.CM2_ID id, c.CM2_NOMBRE nombre FROM (
           SELECT EQC_EQUIPO_ID equipoId, EQC_CAMPANIA_ID campaniaId FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID IN (${ids})
           UNION SELECT EQ_ID, EQ_CAMPANIA_ID FROM CC_EQUIPOS WHERE EQ_ID IN (${ids}) AND EQ_CAMPANIA_ID IS NOT NULL) x
         JOIN CCO_CAMPANIAS c ON c.CM2_ID = x.campaniaId AND c.CM2_ACTIVO = 1`),
      q(`SELECT s.EQS_EQUIPO_ID equipoId, g.CG_ID id, g.CG_NOMBRE nombre FROM CC_EQUIPO_SKILLS s
         JOIN CCO_GRUPOS g ON g.CG_ID = s.EQS_GRUPO_ID AND g.CG_ACTIVO = 1 WHERE s.EQS_EQUIPO_ID IN (${ids})`),
      q(`SELECT s.EQS_EQUIPO_ID equipoId, cn.CN_ID id, cn.CN_NOMBRE nombre, cn.CN_TIPO tipo, CAST(ISNULL(cn.CN_HABILITADO, 1) AS bit) habilitado
         FROM CC_EQUIPO_SKILLS s JOIN CCO_CANALES cn ON cn.CN_GRUPO_ID = s.EQS_GRUPO_ID WHERE s.EQS_EQUIPO_ID IN (${ids})`),
      q(`SELECT m.EQM_EQUIPO_ID equipoId, m.EQM_ROL rol, u.NEUS_ID id, LTRIM(RTRIM(u.NEUS_NOMBRES)) nombre
         FROM CC_EQUIPO_MIEMBROS m JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID AND u.NEUS_ACTIVO = 1
         WHERE m.EQM_EQUIPO_ID IN (${ids}) ORDER BY u.NEUS_NOMBRES`),
      q(`SELECT EQCL_EQUIPO_ID equipoId, COUNT(*) n FROM CC_EQUIPO_CLIENTES WHERE EQCL_EQUIPO_ID IN (${ids}) GROUP BY EQCL_EQUIPO_ID`),
      q(`SELECT DISTINCT x.equipoId, f.FR_ID id, f.FR_NOMBRE nombre FROM (
           SELECT EQC_EQUIPO_ID equipoId, EQC_CAMPANIA_ID campaniaId FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID IN (${ids})
           UNION SELECT EQ_ID, EQ_CAMPANIA_ID FROM CC_EQUIPOS WHERE EQ_ID IN (${ids}) AND EQ_CAMPANIA_ID IS NOT NULL) x
         JOIN CCF_FORM_ASIGNACIONES fa ON fa.FA_CAMPANIA_ID = x.campaniaId AND fa.FA_ACTIVO = 1
         JOIN CCF_FORM_VERSIONES fv ON fv.FV_ID = fa.FA_FORM_VERSION_ID
         JOIN CCF_FORMULARIOS f ON f.FR_ID = fv.FV_FORMULARIO_ID`),
      q(`SELECT x.equipoId, t.CT_NOMBRE nombre FROM (
           SELECT EQC_EQUIPO_ID equipoId, EQC_CAMPANIA_ID campaniaId FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID IN (${ids})
           UNION SELECT EQ_ID, EQ_CAMPANIA_ID FROM CC_EQUIPOS WHERE EQ_ID IN (${ids}) AND EQ_CAMPANIA_ID IS NOT NULL) x
         JOIN CCO_TIPIFICACIONES t ON t.CT_CAMPANIA_ID = x.campaniaId AND ISNULL(t.CT_ACTIVO, 1) = 1`),
    ]);
    const de = (lista, id) => lista.filter((x) => x.equipoId === id).map(({ equipoId, ...r }) => r);
    const unicos = (lista) => lista.filter((x, i) => lista.findIndex((y) => y.id === x.id) === i);

    // Estatus de Ventas de su campaña de ventas (son sus tipificaciones en el marcador).
    let estatusVentas = new Map();
    const ventasIds = [...new Set(grupos.map((g) => g.ventasId).filter(Boolean))];
    if (ventasIds.length) {
      try {
        const pv = await getVentasPool();
        const r = await pv.request().query(`SELECT campaignId, LTRIM(RTRIM(nombreEstado)) nombre FROM CampaignStatuses WHERE activo = 1 AND campaignId IN (${ventasIds.map(Number).join(',')}) ORDER BY orden`);
        for (const e of r.recordset) estatusVentas.set(e.campaignId, [...(estatusVentas.get(e.campaignId) ?? []), e.nombre]);
      } catch (e) { console.error('listGruposDetalle → estatus de Ventas:', e.message); }
    }

    res.json({
      success: true,
      data: grupos.map((g) => {
        const tips = [...new Set(de(tipificaciones, g.id).map((t) => String(t.nombre).trim()))];
        const deVentas = g.ventasId ? estatusVentas.get(g.ventasId) ?? [] : [];
        const mbr = de(miembros, g.id);
        return {
          id: g.id, nombre: g.nombre, descripcion: g.descripcion, modalidad: g.modalidad, atiendeClientes: !!g.atiendeClientes,
          creadoEn: g.creadoEn, marcador: g.marcador,
          ventas: g.ventasId ? { id: g.ventasId, nombre: g.ventasNombre } : null,
          campanias: unicos(de(campanias, g.id)),
          skills: unicos(de(skills, g.id)),
          canales: unicos(de(canales, g.id)).map((c) => ({ ...c, habilitado: !!c.habilitado })),
          formularios: unicos(de(formularios, g.id)),
          // Las de sus campañas (omnicanal) y, si es de ventas, los estatus de Ventas (marcador).
          tipificaciones: [...tips, ...deVentas.filter((n) => !tips.some((t) => t.toLowerCase() === n.toLowerCase()))],
          supervisores: mbr.filter((m) => m.rol === 'supervisor').map(({ rol, ...m }) => m),
          agentes: mbr.filter((m) => m.rol !== 'supervisor').map(({ rol, ...m }) => m),
          clientes: clientes.find((c) => c.equipoId === g.id)?.n ?? 0,
        };
      }),
    });
  } catch (e) {
    console.error('Error listGruposDetalle:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /campanas/ventas/:id/tipificaciones-a/:campaniaId — copia los estatus
// de esa campaña de Ventas como tipificaciones de una campaña de AGYDA (el
// asistente de campaña lo usa mientras el grupo todavía es borrador, para que
// el formulario ya las vea).
exports.copiarEstatusACampania = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const campaniaId = parseInt(req.params.campaniaId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(campaniaId)) return res.status(400).json({ success: false, message: 'Id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const data = await require('../services/ventasCampaniaService').espejoTipificacionesVentas(pool, id, [campaniaId]);
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error copiarEstatusACampania:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Tipos de campaña de Ventas ──
// En Ventas el tipo es solo la columna tieneSeguimiento (Ventas o Seguimiento).
// Los tipos que agrega cada empresa (ej. "Mixto") viven en AGYDA:
// VENTAS_TIPOS_CAMPANA, y qué tipo tiene cada campaña en VENTAS_CAMPANA_TIPO.
// Cada tipo dice si lleva seguimiento, y eso es lo que se escribe en Ventas.
// Las tablas se crean al crear el primer tipo; sin ellas solo hay los dos de base.
const TIPOS_BASE = [
  { clave: 'ventas', id: null, nombre: 'Ventas', descripcion: 'Se captura la venta y se tipifica con sus estatus', color: '#f59e0b', seguimiento: false, base: true, activo: true },
  { clave: 'seguimiento', id: null, nombre: 'Seguimiento', descripcion: 'Además lleva seguimiento de cada venta (como AT&T)', color: '#0ea5e9', seguimiento: true, base: true, activo: true },
];
const conTablasTipo = new Set();
async function asegurarTablasTipo(pool) {
  if (conTablasTipo.has(pool)) return;
  await pool.request().query(`
    IF OBJECT_ID('dbo.VENTAS_TIPOS_CAMPANA', 'U') IS NULL
      CREATE TABLE dbo.VENTAS_TIPOS_CAMPANA (
        VTC_ID          INT IDENTITY(1,1) PRIMARY KEY,
        VTC_NOMBRE      NVARCHAR(60) NOT NULL,
        VTC_DESCRIPCION NVARCHAR(200) NULL,
        VTC_COLOR       NVARCHAR(20) NULL,
        VTC_SEGUIMIENTO BIT NOT NULL DEFAULT 0,
        VTC_ACTIVO      BIT NOT NULL DEFAULT 1,
        VTC_FECHA       DATETIME NOT NULL DEFAULT GETDATE()
      );
    IF OBJECT_ID('dbo.VENTAS_CAMPANA_TIPO', 'U') IS NULL
      CREATE TABLE dbo.VENTAS_CAMPANA_TIPO (
        VCT_CAMPANA_ID INT NOT NULL PRIMARY KEY,
        VCT_TIPO_ID    INT NOT NULL,
        VCT_FECHA      DATETIME NOT NULL DEFAULT GETDATE()
      );`);
  conTablasTipo.add(pool);
}
async function hayTablasTipo(pool) {
  if (conTablasTipo.has(pool)) return true;
  const r = await pool.request().query(`SELECT CASE WHEN OBJECT_ID('dbo.VENTAS_TIPOS_CAMPANA', 'U') IS NOT NULL
    AND OBJECT_ID('dbo.VENTAS_CAMPANA_TIPO', 'U') IS NOT NULL THEN 1 ELSE 0 END AS ok`);
  if (!r.recordset[0].ok) return false;
  conTablasTipo.add(pool);
  return true;
}
// Los tipos de la empresa (los de base y los agregados) y qué tipo tiene cada campaña.
async function leerTipos(pool) {
  if (!(await hayTablasTipo(pool))) return { tipos: TIPOS_BASE, asignados: new Map() };
  const r = await pool.request().query(`
    SELECT t.VTC_ID AS id, t.VTC_NOMBRE AS nombre, t.VTC_DESCRIPCION AS descripcion, t.VTC_COLOR AS color,
      CAST(t.VTC_SEGUIMIENTO AS bit) AS seguimiento, CAST(t.VTC_ACTIVO AS bit) AS activo,
      (SELECT COUNT(*) FROM dbo.VENTAS_CAMPANA_TIPO x WHERE x.VCT_TIPO_ID = t.VTC_ID) AS campanas
    FROM dbo.VENTAS_TIPOS_CAMPANA t ORDER BY t.VTC_NOMBRE;
    SELECT VCT_CAMPANA_ID AS c, VCT_TIPO_ID AS t FROM dbo.VENTAS_CAMPANA_TIPO;`);
  const propios = r.recordsets[0].map((t) => ({ ...t, clave: `c${t.id}`, seguimiento: !!t.seguimiento, activo: !!t.activo, base: false }));
  return { tipos: [...TIPOS_BASE, ...propios], asignados: new Map(r.recordsets[1].map((x) => [x.c, `c${x.t}`])) };
}
// A una campaña ({ id, seguimiento }) le pone su tipo: el agregado si tiene, si no el de base.
function ponerTipo(c, { tipos, asignados }) {
  const { seguimiento, ...resto } = c;
  const t = tipos.find((x) => x.clave === asignados.get(c.id)) || TIPOS_BASE[seguimiento ? 1 : 0];
  return { ...resto, tipo: t.clave, tipoNombre: t.nombre, tipoColor: t.color };
}
async function tiposDe(req) {
  try {
    return await leerTipos(await databaseService.getPool(req.user?.empresa));
  } catch (e) {
    console.error('tipos de campaña:', e.message);
    return { tipos: TIPOS_BASE, asignados: new Map() };
  }
}

// GET /campanas/ventas/tipos — los de base y los agregados (también los deshabilitados).
exports.listTiposCampana = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    res.json({ success: true, data: (await leerTipos(pool)).tipos });
  } catch (e) {
    console.error('Error listTiposCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /campanas/ventas/tipos — { nombre, descripcion?, color?, seguimiento }
// PUT  /campanas/ventas/tipos/:id — lo mismo y activo? (para volver a habilitarlo)
exports.guardarTipoCampana = async (req, res) => {
  const id = req.params.id ? parseInt(req.params.id, 10) : null;
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 60);
    if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    const descripcion = String(b.descripcion || '').trim().slice(0, 200) || null;
    const color = limpiarColor(b.color);
    const seguimiento = b.seguimiento ? 1 : 0;
    const activo = typeof b.activo === 'boolean' ? (b.activo ? 1 : 0) : null;
    if (TIPOS_BASE.some((t) => t.nombre.toLowerCase() === nombre.toLowerCase())) {
      return res.status(409).json({ success: false, message: 'Ese tipo ya existe' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await asegurarTablasTipo(pool);
    const dup = (await pool.request().input('n', sql.NVarChar(60), nombre).input('id', sql.Int, id || 0)
      .query('SELECT TOP 1 VTC_ID FROM dbo.VENTAS_TIPOS_CAMPANA WHERE LOWER(LTRIM(RTRIM(VTC_NOMBRE))) = LOWER(@n) AND VTC_ID <> @id')).recordset[0];
    if (dup) return res.status(409).json({ success: false, message: 'Ya existe un tipo con ese nombre' });

    let tipoId = id;
    const r = pool.request().input('n', sql.NVarChar(60), nombre).input('d', sql.NVarChar(200), descripcion)
      .input('col', sql.NVarChar(20), color).input('s', sql.Bit, seguimiento);
    if (id) {
      const up = await r.input('id', sql.Int, id).input('a', sql.Bit, activo).query(`
        UPDATE dbo.VENTAS_TIPOS_CAMPANA SET VTC_NOMBRE = @n, VTC_DESCRIPCION = @d, VTC_COLOR = @col,
          VTC_SEGUIMIENTO = @s, VTC_ACTIVO = ISNULL(@a, VTC_ACTIVO) WHERE VTC_ID = @id`);
      if (!up.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Tipo no encontrado' });
      // Sus campañas llevan (o no) seguimiento en Ventas igual que el tipo.
      const camp = (await pool.request().input('id', sql.Int, id)
        .query('SELECT VCT_CAMPANA_ID AS c FROM dbo.VENTAS_CAMPANA_TIPO WHERE VCT_TIPO_ID = @id')).recordset.map((x) => Number(x.c));
      if (camp.length) {
        await (await getVentasPool()).request().input('s', sql.Bit, seguimiento)
          .query(`UPDATE [Campanas] SET tieneSeguimiento = @s WHERE ID IN (${camp.join(',')})`);
      }
    } else {
      tipoId = (await r.query(`INSERT INTO dbo.VENTAS_TIPOS_CAMPANA (VTC_NOMBRE, VTC_DESCRIPCION, VTC_COLOR, VTC_SEGUIMIENTO)
        OUTPUT INSERTED.VTC_ID AS id VALUES (@n, @d, @col, @s)`)).recordset[0].id;
    }
    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: id ? 'editar-tipo-campana' : 'crear-tipo-campana',
      entidadId: tipoId, detalle: { nombre, seguimiento: !!seguimiento }, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, data: (await leerTipos(pool)).tipos.find((t) => t.id === tipoId) });
  } catch (e) {
    console.error('Error guardarTipoCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /campanas/ventas/tipos/:id — lo deshabilita: ya no se ofrece para
// campañas nuevas; las que lo tienen lo conservan.
exports.desactivarTipoCampana = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    if (!(await hayTablasTipo(pool))) return res.status(404).json({ success: false, message: 'Tipo no encontrado' });
    const up = await pool.request().input('id', sql.Int, id).query('UPDATE dbo.VENTAS_TIPOS_CAMPANA SET VTC_ACTIVO = 0 WHERE VTC_ID = @id');
    if (!up.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Tipo no encontrado' });
    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'desactivar-tipo-campana', entidadId: id, detalle: null, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('Error desactivarTipoCampana:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /campanas/ventas — todas las campañas de Ventas, también las deshabilitadas.
exports.listCampanasVentas = async (req, res) => {
  try {
    const pv = await getVentasPool();
    const r = await pv.request().query(`
      SELECT c.ID AS id, LTRIM(RTRIM(c.nombre)) AS nombre, c.color, CAST(c.activo AS bit) AS activo,
        CAST(ISNULL(c.tieneSeguimiento, 0) AS bit) AS seguimiento,
        (SELECT COUNT(*) FROM Ventas v WHERE v.campaignId = c.ID) AS ventas
      FROM [Campanas] c ORDER BY c.nombre`);
    const tipos = await tiposDe(req);
    res.json({ success: true, data: r.recordset.map((c) => ponerTipo({ ...c, activo: !!c.activo }, tipos)) });
  } catch (e) {
    console.error('Error listCampanasVentas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /campanas/ventas/:id/activar — vuelve a habilitar una campaña deshabilitada.
exports.activarCampanaVentas = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Id inválido' });
    const pv = await getVentasPool();
    const up = await pv.request().input('id', sql.Int, id).query('UPDATE [Campanas] SET activo = 1 WHERE ID = @id');
    if (!up.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'habilitar-campana-ventas', entidadId: id, detalle: null, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('Error activarCampanaVentas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /campanas/ventas/:id — la campaña con sus estatus y cuántas ventas tiene.
exports.getCampanaVentas = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Id inválido' });
    const data = await leerCampanaVentas(await getVentasPool(), id);
    if (!data) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    res.json({ success: true, data: ponerTipo(data, await tiposDe(req)) });
  } catch (e) {
    console.error('Error getCampanaVentas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /campanas/ventas — { nombre, color, tipo?, estatus? }. Sin estatus: los iniciales.
// PUT  /campanas/ventas/:id — { nombre, color, tipo?, estatus }
// tipo: 'ventas' | 'seguimiento' (columna tieneSeguimiento) o 'c<id>', uno agregado
// por la empresa: lleva seguimiento según el tipo y se recuerda en AGYDA.
exports.guardarCampanaVentas = async (req, res) => {
  const id = req.params.id ? parseInt(req.params.id, 10) : null;
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 100);
    if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    const color = limpiarColor(b.color);
    const estatus = normalizarEstatus(b.estatus);
    // Sin tipo al editar: se deja el que tenía.
    let seguimiento = b.tipo === 'seguimiento' ? 1 : b.tipo === 'ventas' ? 0 : null;
    let tipoPropio = null;
    const mTipo = /^c([0-9]+)$/.exec(String(b.tipo || ''));
    if (mTipo) {
      const t = (await tiposDe(req)).tipos.find((x) => x.id === Number(mTipo[1]));
      if (!t) return res.status(400).json({ success: false, message: 'Ese tipo de campaña no existe' });
      tipoPropio = t.id;
      seguimiento = t.seguimiento ? 1 : 0;
    }
    const pv = await getVentasPool();

    const dup = (await pv.request().input('n', sql.NVarChar(100), nombre).input('id', sql.Int, id || 0)
      .query('SELECT TOP 1 ID FROM [Campanas] WHERE LTRIM(RTRIM(nombre)) = @n AND ID <> @id')).recordset[0];
    if (dup) return res.status(409).json({ success: false, message: 'Ya existe una campaña de Ventas con ese nombre' });

    const tx = new sql.Transaction(pv);
    await tx.begin();
    let campanaId = id;
    try {
      if (id) {
        const up = await new sql.Request(tx).input('id', sql.Int, id).input('n', sql.NVarChar(100), nombre).input('col', sql.NVarChar(20), color).input('seg', sql.Bit, seguimiento)
          .query('UPDATE [Campanas] SET nombre = @n, color = ISNULL(@col, color), tieneSeguimiento = ISNULL(@seg, tieneSeguimiento) WHERE ID = @id');
        if (!up.rowsAffected[0]) { await tx.rollback(); return res.status(404).json({ success: false, message: 'Campaña no encontrada' }); }
        if (Array.isArray(b.estatus)) await guardarEstatus(tx, id, estatus);
      } else {
        const ins = await new sql.Request(tx).input('n', sql.NVarChar(100), nombre).input('col', sql.NVarChar(20), color).input('seg', sql.Bit, seguimiento ?? 0)
          .query('INSERT INTO [Campanas] (nombre, activo, color, tieneSeguimiento) OUTPUT INSERTED.ID AS id VALUES (@n, 1, @col, @seg)');
        campanaId = ins.recordset[0].id;
        await guardarEstatus(tx, campanaId, estatus.length ? estatus : ESTATUS_INICIALES.map((e) => ({ ...e, activo: true })));
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }

    // El tipo agregado se recuerda en AGYDA; uno de base quita el que tuviera.
    if (b.tipo) {
      try {
        const poolE = await databaseService.getPool(req.user?.empresa);
        if (tipoPropio) {
          await asegurarTablasTipo(poolE);
          await poolE.request().input('c', sql.Int, campanaId).input('t', sql.Int, tipoPropio).query(`
            UPDATE dbo.VENTAS_CAMPANA_TIPO SET VCT_TIPO_ID = @t, VCT_FECHA = GETDATE() WHERE VCT_CAMPANA_ID = @c;
            IF @@ROWCOUNT = 0 INSERT INTO dbo.VENTAS_CAMPANA_TIPO (VCT_CAMPANA_ID, VCT_TIPO_ID) VALUES (@c, @t);`);
        } else if (await hayTablasTipo(poolE)) {
          await poolE.request().input('c', sql.Int, campanaId).query('DELETE FROM dbo.VENTAS_CAMPANA_TIPO WHERE VCT_CAMPANA_ID = @c');
        }
      } catch (e) {
        console.error('guardarCampanaVentas → tipo:', e.message);
      }
    }

    // Los estatus son las tipificaciones de las campañas de AGYDA ligadas por sus grupos.
    if (id) {
      const poolT = await databaseService.getPool(req.user?.empresa);
      await require('../services/ventasCampaniaService').espejoTipificacionesVentas(poolT, id)
        .catch((e) => console.error('guardarCampanaVentas → tipificaciones:', e.message));
    }
    // El nombre de la campaña se guarda copiado en los grupos y en las asignaciones de agentes.
    if (id) {
      const pool = await databaseService.getPool(req.user?.empresa);
      await pool.request().input('id', sql.Int, id).input('n', sql.NVarChar(200), nombre).query(`
        UPDATE CC_EQUIPOS SET EQ_VENTAS_CAMPANA_NOMBRE = @n WHERE EQ_VENTAS_CAMPANA_ID = @id;
        UPDATE AC_CAMPANIAS_AGENTES SET ACA_VENTAS_CAMPANA_NOMBRE = @n WHERE ACA_VENTAS_CAMPANA_ID = @id;`).catch((e) => console.error('guardarCampanaVentas → nombre en AGYDA:', e.message));
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: id ? 'editar-campana-ventas' : 'crear-campana-ventas',
      entidadId: campanaId, detalle: { nombre, color, tipo: b.tipo ?? null, estatus: estatus.map((e) => e.nombre) }, ip: req.ip,
    }).catch(() => {});

    const leida = await leerCampanaVentas(pv, campanaId);
    res.json({ success: true, data: leida && ponerTipo(leida, await tiposDe(req)) });
  } catch (e) {
    console.error('Error guardarCampanaVentas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /campanas/ventas/:id — la desactiva (sus ventas, metas y estatus se conservan).
exports.desactivarCampanaVentas = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Id inválido' });
    const pv = await getVentasPool();
    const up = await pv.request().input('id', sql.Int, id).query('UPDATE [Campanas] SET activo = 0 WHERE ID = @id');
    if (!up.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'usuarios', accion: 'desactivar-campana-ventas', entidadId: id, detalle: null, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('Error desactivarCampanaVentas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
