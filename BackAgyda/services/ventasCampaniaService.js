/**
 * La BD de Ventas (plata_prospectPRO) vista desde una campaña de AGYDA.
 *
 * Una campaña de AGYDA "es" de ventas cuando alguno de sus grupos
 * (CC_EQUIPOS) tiene campaña de ventas asignada (EQ_VENTAS_CAMPANA_ID:
 * PlataCardADBA, Amex, Banamex…) — el mismo criterio con el que
 * ventasSyncService copia los registros a Ventas. Los reportes de la
 * campaña en la Suite (interacciones, ejecutivo, productividad) leen de
 * aquí el histórico de Ventas, sus estatus (las tipificaciones de Ventas)
 * y cruzan a los agentes con los asesores de Ventas por nombre, igual que
 * Nómina y Metas.
 */
const sql = require('mssql');
const ventasSync = require('./ventasSyncService');

// Estatus de venta que Nómina paga como comisión (mismos que calcularNomina
// en nominaController).
const ESTATUS_NOMINA = ['Aprobada', 'approved', 'Formalizado', 'formalized_banamex', 'approved_banamex'];

const sqlIn = (lista) => (lista.length ? lista.map((e) => `'${String(e).replace(/'/g, "''")}'`).join(',') : "''");

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Mismo match difuso de nombres que Nómina: exacto, prefijo en cualquier
// dirección (8+ letras) o los primeros 20 caracteres iguales.
function mismoNombre(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.startsWith(a)) return true;
  if (b.length >= 8 && a.startsWith(b)) return true;
  const len = Math.min(a.length, b.length, 20);
  return len >= 20 && a.slice(0, len) === b.slice(0, len);
}

/**
 * Campaña de ventas de una campaña de AGYDA según sus grupos activos, o null.
 * `soloMarcador`: todos sus grupos son de marcador (sin conversaciones) —
 * entonces las tipificaciones que valen son las de Ventas.
 */
async function contextoVentas(p, campaniaId) {
  if (!campaniaId) return null;
  const grupos = (await p.request().input('c', sql.Int, campaniaId).query(`
    SELECT e.EQ_ID id, e.EQ_NOMBRE nombre, ISNULL(e.EQ_MODALIDAD, 'omnicanal') modalidad,
           e.EQ_VENTAS_CAMPANA_ID ventasId, e.EQ_VENTAS_CAMPANA_NOMBRE ventasNombre
    FROM dbo.CC_EQUIPOS e
    WHERE e.EQ_ACTIVO = 1
      AND (e.EQ_CAMPANIA_ID = @c OR EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID AND ec.EQC_CAMPANIA_ID = @c))
    ORDER BY e.EQ_ID`).catch(() => ({ recordset: [] }))).recordset;
  const conVentas = grupos.find((g) => g.ventasId);
  if (!conVentas) return null;
  return {
    campanaVentasId: conVentas.ventasId,
    campanaVentasNombre: conVentas.ventasNombre || `Campaña #${conVentas.ventasId}`,
    soloMarcador: grupos.every((g) => g.modalidad === 'marcador'),
    grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, modalidad: g.modalidad })),
  };
}

// Estatus de la campaña en Ventas (CampaignStatuses activos, en su orden) más
// los que aparecen en sus ventas aunque ya no estén en la lista (p. ej. "Cancelada").
async function estatusDeCampana(pv, campanaVentasId) {
  const conf = (await pv.request().input('c', sql.Int, campanaVentasId).query(`
    SELECT LTRIM(RTRIM(nombreEstado)) nombre, color FROM CampaignStatuses
    WHERE campaignId = @c AND activo = 1 ORDER BY orden, id`)).recordset;
  const usados = (await pv.request().input('c', sql.Int, campanaVentasId).query(`
    SELECT LTRIM(RTRIM(estatus)) nombre, COUNT(*) n FROM Ventas
    WHERE campaignId = @c AND estatus IS NOT NULL AND LTRIM(RTRIM(estatus)) <> ''
    GROUP BY LTRIM(RTRIM(estatus)) ORDER BY n DESC`)).recordset;
  const lista = conf.map((c) => ({ nombre: c.nombre, color: c.color || null }));
  for (const u of usados) {
    if (!lista.some((l) => normalizar(l.nombre) === normalizar(u.nombre))) lista.push({ nombre: u.nombre, color: null });
  }
  return lista;
}

// Ventas que ya vienen de una interacción de AGYDA (CC_VENTAS_SYNC): en los
// listados que mezclan ambas fuentes no se repiten.
async function ventasSincronizadas(p, campanaVentasId) {
  await ventasSync.asegurarTabla(p);
  return (await p.request().input('c', sql.Int, campanaVentasId)
    .query('SELECT VS_VENTA_ID id FROM dbo.CC_VENTAS_SYNC WHERE VS_CAMPANA_VENTAS_ID = @c')).recordset.map((r) => r.id);
}

// "Venta contada" de Metas (Configuración → CRM → Ventas), como lista.
async function estatusContados(p, uso = 'metas') {
  const rs = await p.request().query('SELECT TOP 1 CONFIG_DATA FROM dbo.INTRANET_PERSONALIZACION ORDER BY ID DESC')
    .catch(() => ({ recordset: [] }));
  const stored = rs.recordset.length ? JSON.parse(rs.recordset[0].CONFIG_DATA) : null;
  return require('../controllers/personalizacionController').getEstatusContados(stored, uso);
}

// Asesores de Ventas (Users) cuyo nombre corresponde al de un agente de AGYDA.
async function asesoresVentas(pv) {
  const us = (await pv.request().query('SELECT idUser id, nombreAgente nombre, Activo activo FROM Users')).recordset;
  return us.map((u) => ({ ...u, norm: normalizar(u.nombre) }));
}
function idsVentasDe(asesores, nombreAgyda) {
  const n = normalizar(nombreAgyda);
  return asesores.filter((u) => mismoNombre(u.norm, n)).map((u) => u.id);
}

/**
 * ¿Puede editar las ventas de esta campaña de Ventas desde AGYDA? Sí los
 * administradores (AD/TI, superadmin) y los supervisores de un grupo con esa
 * campaña de Ventas: supervisor del grupo o de alguna de sus campañas.
 */
async function puedeEditarVentas(p, req, campanaVentasId) {
  const tipo = String(req.user?.tipoUsuario || '').toUpperCase();
  if (['AD', 'TI'].includes(tipo) || require('../utils/superAdmin').esSuperAdminFijo(req)) return true;
  const uid = Number(req.user?.id) || 0;
  if (!uid || !campanaVentasId) return false;
  const r = await p.request().input('c', sql.Int, campanaVentasId).input('u', sql.Int, uid).query(`
    SELECT TOP 1 1 ok FROM dbo.CC_EQUIPOS e
    WHERE e.EQ_ACTIVO = 1 AND e.EQ_VENTAS_CAMPANA_ID = @c AND (
      EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_MIEMBROS m WHERE m.EQM_EQUIPO_ID = e.EQ_ID AND m.EQM_ROL = 'supervisor' AND m.EQM_USUARIO_ID = @u)
      OR EXISTS (SELECT 1 FROM dbo.CC_CAMPANIAS_SUPERVISORES cs WHERE cs.CS_SUPERVISOR_ID = @u
                 AND (cs.CS_CAMPANIA_ID = e.EQ_CAMPANIA_ID
                   OR cs.CS_CAMPANIA_ID IN (SELECT ec.EQC_CAMPANIA_ID FROM dbo.CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID))))`)
    .catch(() => ({ recordset: [] }));
  return r.recordset.length > 0;
}

module.exports = {
  ESTATUS_NOMINA, sqlIn, normalizar, mismoNombre, puedeEditarVentas,
  contextoVentas, estatusDeCampana, ventasSincronizadas, estatusContados, asesoresVentas, idsVentasDe,
  poolVentas: ventasSync.poolVentas, asegurarTabla: ventasSync.asegurarTabla,
};
