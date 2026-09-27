const sql = require('mssql');

// Grupos de Contact Center (CC_EQUIPOS): se crea el grupo, se le asignan
// campañas, skills, modo y marcador, y después sus agentes y supervisores;
// quien está dentro recibe todo automáticamente:
//  - Campañas (CC_EQUIPO_CAMPANIAS): sus supervisores supervisan esas
//    campañas; cada campaña con su formulario para el link del marcador del
//    grupo (/formulario-publico/c/<campaña>?equipo=<slug>).
//  - Skills (CC_EQUIPO_SKILLS, de sus campañas): sus agentes quedan como
//    agentes de esos skills (reciben las conversaciones de sus canales) y sus
//    supervisores como supervisores de esos skills.
//  - Modo: 'omnicanal' (skills), 'marcador' (sin conversaciones: los agentes
//    no entran a los skills) o 'ambos'.
//  - Marcador (EQ_WEBPHONE_VISTA_ID): la vista de Webphone de sus agentes.
//  - Campaña de ventas (EQ_VENTAS_CAMPANA_ID): la de la plataforma de Ventas de sus agentes.
// Un skill o una campaña ligados a grupos los controlan los grupos: sus
// agentes/supervisores = los de sus grupos (no se editan a mano).

const ids = (arr) => [...new Set((arr || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
const q = (pool, texto, params = {}) => {
  const r = pool.request();
  for (const [k, [tipo, v]] of Object.entries(params)) r.input(k, tipo, v);
  return r.query(texto).then((x) => x.recordset);
};
const slugDe = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'grupo';

// Grupos que controlan un skill / una campaña.
function equiposDeSkill(pool, grupoId) {
  return q(pool, `SELECT e.EQ_ID id, e.EQ_NOMBRE nombre FROM CC_EQUIPO_SKILLS s JOIN CC_EQUIPOS e ON e.EQ_ID = s.EQS_EQUIPO_ID AND e.EQ_ACTIVO = 1
    WHERE s.EQS_GRUPO_ID = @g ORDER BY e.EQ_NOMBRE`, { g: [sql.Int, grupoId] }).catch(() => []);
}
function equiposDeCampania(pool, campaniaId) {
  return q(pool, `SELECT e.EQ_ID id, e.EQ_NOMBRE nombre FROM CC_EQUIPO_CAMPANIAS c JOIN CC_EQUIPOS e ON e.EQ_ID = c.EQC_EQUIPO_ID AND e.EQ_ACTIVO = 1
    WHERE c.EQC_CAMPANIA_ID = @c ORDER BY e.EQ_NOMBRE`, { c: [sql.Int, campaniaId] }).catch(() => []);
}

// Agentes y supervisores de un skill según sus grupos. Si ya no lo controla
// ningún grupo, solo saca a `quitar` (la gente de un grupo que se desligó).
async function sincronizarSkill(pool, grupoId, { quitar = [] } = {}) {
  const equipos = await equiposDeSkill(pool, grupoId);
  if (!equipos.length) {
    const fuera = ids(quitar);
    if (fuera.length) {
      await q(pool, `UPDATE CCO_GRUPO_AGENTES SET CGA_ACTIVO = 0 WHERE CGA_GRUPO_ID = @g AND CGA_USUARIO_ID IN (${fuera.join(',')})`, { g: [sql.Int, grupoId] });
      await q(pool, `DELETE FROM CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID = @g AND GS_SUPERVISOR_ID IN (${fuera.join(',')})`, { g: [sql.Int, grupoId] });
    }
    return;
  }
  const deseados = await q(pool, `
    SELECT DISTINCT m.EQM_USUARIO_ID u, m.EQM_ROL rol
    FROM CC_EQUIPO_SKILLS s JOIN CC_EQUIPOS e ON e.EQ_ID = s.EQS_EQUIPO_ID AND e.EQ_ACTIVO = 1
    JOIN CC_EQUIPO_MIEMBROS m ON m.EQM_EQUIPO_ID = e.EQ_ID
    JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID AND u.NEUS_ACTIVO = 1
    WHERE s.EQS_GRUPO_ID = @g AND (m.EQM_ROL = 'supervisor' OR e.EQ_MODALIDAD <> 'marcador')`, { g: [sql.Int, grupoId] });
  const agentes = ids(deseados.filter((d) => d.rol === 'agente').map((d) => d.u));
  const supervisores = ids(deseados.filter((d) => d.rol === 'supervisor').map((d) => d.u));

  for (const u of agentes) {
    await q(pool, `MERGE CCO_GRUPO_AGENTES AS t USING (SELECT @g g, @u u) s ON t.CGA_GRUPO_ID = s.g AND t.CGA_USUARIO_ID = s.u
      WHEN MATCHED THEN UPDATE SET CGA_ACTIVO = 1 WHEN NOT MATCHED THEN INSERT (CGA_GRUPO_ID, CGA_USUARIO_ID) VALUES (@g, @u);`,
    { g: [sql.Int, grupoId], u: [sql.Int, u] });
  }
  await q(pool, `UPDATE CCO_GRUPO_AGENTES SET CGA_ACTIVO = 0 WHERE CGA_GRUPO_ID = @g AND CGA_ACTIVO = 1
    AND CGA_USUARIO_ID NOT IN (${agentes.concat(0).join(',')})`, { g: [sql.Int, grupoId] });
  for (const u of supervisores) {
    await q(pool, `IF NOT EXISTS (SELECT 1 FROM CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID = @g AND GS_SUPERVISOR_ID = @u)
      INSERT INTO CCO_GRUPO_SUPERVISORES (GS_GRUPO_ID, GS_SUPERVISOR_ID) VALUES (@g, @u)`, { g: [sql.Int, grupoId], u: [sql.Int, u] });
  }
  await q(pool, `DELETE FROM CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID = @g
    AND GS_SUPERVISOR_ID NOT IN (${supervisores.concat(0).join(',')})`, { g: [sql.Int, grupoId] });
}

// Supervisores de una campaña según sus grupos (mismo criterio que los skills).
async function sincronizarCampania(pool, campaniaId, { quitar = [] } = {}) {
  const equipos = await equiposDeCampania(pool, campaniaId);
  if (!equipos.length) {
    const fuera = ids(quitar);
    if (fuera.length) await q(pool, `DELETE FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c AND CS_SUPERVISOR_ID IN (${fuera.join(',')})`, { c: [sql.Int, campaniaId] });
    return;
  }
  const supervisores = ids((await q(pool, `
    SELECT DISTINCT m.EQM_USUARIO_ID u FROM CC_EQUIPO_CAMPANIAS c JOIN CC_EQUIPOS e ON e.EQ_ID = c.EQC_EQUIPO_ID AND e.EQ_ACTIVO = 1
    JOIN CC_EQUIPO_MIEMBROS m ON m.EQM_EQUIPO_ID = e.EQ_ID AND m.EQM_ROL = 'supervisor'
    JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID AND u.NEUS_ACTIVO = 1
    WHERE c.EQC_CAMPANIA_ID = @c`, { c: [sql.Int, campaniaId] })).map((r) => r.u));
  for (const u of supervisores) {
    await q(pool, `IF NOT EXISTS (SELECT 1 FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c AND CS_SUPERVISOR_ID = @u)
      INSERT INTO CC_CAMPANIAS_SUPERVISORES (CS_CAMPANIA_ID, CS_SUPERVISOR_ID) VALUES (@c, @u)`, { c: [sql.Int, campaniaId], u: [sql.Int, u] });
  }
  await q(pool, `DELETE FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c
    AND CS_SUPERVISOR_ID NOT IN (${supervisores.concat(0).join(',')})`, { c: [sql.Int, campaniaId] });
}

// Aplica todo lo del grupo a su gente. `antes`: { skills, campanias } que
// tenía antes del cambio; `quitados`: usuarios que acaban de salir.
async function sincronizarEquipo(pool, equipoId, { antes = {}, quitados = [] } = {}) {
  const eq = (await q(pool, `SELECT EQ_ID id, EQ_MODALIDAD modalidad, EQ_WEBPHONE_VISTA_ID vista, EQ_ACTIVO activo,
    EQ_VENTAS_CAMPANA_ID ventasId, EQ_VENTAS_CAMPANA_NOMBRE ventasNombre FROM CC_EQUIPOS WHERE EQ_ID = @id`, { id: [sql.Int, equipoId] }))[0];
  const skills = eq ? (await q(pool, 'SELECT EQS_GRUPO_ID g FROM CC_EQUIPO_SKILLS WHERE EQS_EQUIPO_ID = @id', { id: [sql.Int, equipoId] })).map((r) => r.g) : [];
  const campanias = eq ? (await q(pool, 'SELECT EQC_CAMPANIA_ID c FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID = @id', { id: [sql.Int, equipoId] })).map((r) => r.c) : [];
  const miembros = eq ? await q(pool, 'SELECT EQM_USUARIO_ID u, EQM_ROL rol FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @id', { id: [sql.Int, equipoId] }) : [];
  const todos = ids([...miembros.map((m) => m.u), ...quitados]);
  const agentes = miembros.filter((m) => m.rol === 'agente').map((m) => m.u);

  for (const g of ids([...skills, ...(antes.skills || [])])) await sincronizarSkill(pool, g, { quitar: todos });
  for (const c of ids([...campanias, ...(antes.campanias || [])])) await sincronizarCampania(pool, c, { quitar: todos });

  // Marcador: los agentes usan la vista de Webphone del grupo.
  let conMarcador = 0;
  if (eq?.activo && eq.modalidad !== 'omnicanal' && eq.vista) {
    for (const u of agentes) {
      await q(pool, `MERGE WEBPHONE_ASIGNACIONES AS t USING (SELECT @u u) s ON t.WASG_NEUS_ID = s.u
        WHEN MATCHED THEN UPDATE SET WASG_VISTA_ID = @v WHEN NOT MATCHED THEN INSERT (WASG_NEUS_ID, WASG_VISTA_ID) VALUES (@u, @v);`,
      { u: [sql.Int, u], v: [sql.Int, eq.vista] });
      conMarcador++;
    }
  }
  // Campaña de ventas: la de todos sus agentes.
  let conVentas = 0;
  if (eq?.activo && eq.ventasId) {
    for (const u of agentes) {
      await q(pool, `MERGE AC_CAMPANIAS_AGENTES AS t USING (SELECT @u u) s ON t.ACA_NEUS_ID = s.u
        WHEN MATCHED THEN UPDATE SET ACA_VENTAS_CAMPANA_ID = @c, ACA_VENTAS_CAMPANA_NOMBRE = @n, ACA_FECHA_ASIGNACION = GETDATE()
        WHEN NOT MATCHED THEN INSERT (ACA_NEUS_ID, ACA_VENTAS_CAMPANA_ID, ACA_VENTAS_CAMPANA_NOMBRE) VALUES (@u, @c, @n);`,
      { u: [sql.Int, u], c: [sql.Int, eq.ventasId], n: [sql.NVarChar(200), eq.ventasNombre || ''] });
      conVentas++;
    }
  }
  return { campanias: campanias.length, skills: skills.length, agentes: agentes.length, supervisores: miembros.length - agentes.length, conMarcador, conVentas };
}

// Lo que está enlazado a un grupo, para elegir qué borrar junto con él.
// Lo que también usa otro grupo (o, en formularios, otra campaña) viene con
// `bloqueado` y no se puede borrar desde aquí. Agentes y supervisores nunca
// se borran (solo salen del grupo) y los clientes solo quedan sin grupo.
async function enlacesDeEquipo(pool, equipoId) {
  const p = { id: [sql.Int, equipoId] };
  const campanias = await q(pool, `
    SELECT c.CM2_ID id, c.CM2_NOMBRE nombre,
           (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_CAMPANIAS oc JOIN CC_EQUIPOS oe ON oe.EQ_ID = oc.EQC_EQUIPO_ID AND oe.EQ_ACTIVO = 1
             WHERE oc.EQC_CAMPANIA_ID = c.CM2_ID AND oc.EQC_EQUIPO_ID <> @id) otros,
           (SELECT COUNT(*) FROM CCO_INTERACCIONES i WHERE i.CI_CAMPANIA_ID = c.CM2_ID) conversaciones
    FROM CC_EQUIPO_CAMPANIAS ec JOIN CCO_CAMPANIAS c ON c.CM2_ID = ec.EQC_CAMPANIA_ID AND c.CM2_ACTIVO = 1
    WHERE ec.EQC_EQUIPO_ID = @id ORDER BY c.CM2_NOMBRE`, p);
  const skills = await q(pool, `
    SELECT g.CG_ID id, g.CG_NOMBRE nombre, c.CM2_NOMBRE campania,
           (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_SKILLS os JOIN CC_EQUIPOS oe ON oe.EQ_ID = os.EQS_EQUIPO_ID AND oe.EQ_ACTIVO = 1
             WHERE os.EQS_GRUPO_ID = g.CG_ID AND os.EQS_EQUIPO_ID <> @id) otros
    FROM CC_EQUIPO_SKILLS es JOIN CCO_GRUPOS g ON g.CG_ID = es.EQS_GRUPO_ID AND g.CG_ACTIVO = 1
    LEFT JOIN CCO_CAMPANIAS c ON c.CM2_ID = g.CG_CAMPANIA_ID
    WHERE es.EQS_EQUIPO_ID = @id ORDER BY g.CG_NOMBRE`, p);
  const canales = await q(pool, `
    SELECT cn.CN_ID id, cn.CN_NOMBRE nombre, cn.CN_TIPO tipo, g.CG_NOMBRE skill,
           (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_SKILLS os JOIN CC_EQUIPOS oe ON oe.EQ_ID = os.EQS_EQUIPO_ID AND oe.EQ_ACTIVO = 1
             WHERE os.EQS_GRUPO_ID = cn.CN_GRUPO_ID AND os.EQS_EQUIPO_ID <> @id) otros,
           (SELECT COUNT(*) FROM CCO_INTERACCIONES i WHERE i.CI_CANAL_ID = cn.CN_ID) conversaciones
    FROM CCO_CANALES cn JOIN CC_EQUIPO_SKILLS es ON es.EQS_GRUPO_ID = cn.CN_GRUPO_ID AND es.EQS_EQUIPO_ID = @id
    JOIN CCO_GRUPOS g ON g.CG_ID = cn.CN_GRUPO_ID ORDER BY cn.CN_NOMBRE`, p);
  const formularios = await q(pool, `
    SELECT DISTINCT f.FR_ID id, f.FR_NOMBRE nombre,
           (SELECT STRING_AGG(x.n, ', ') FROM (
              SELECT DISTINCT c2.CM2_NOMBRE n FROM CCF_FORM_ASIGNACIONES fa JOIN CCF_FORM_VERSIONES v ON v.FV_ID = fa.FA_FORM_VERSION_ID
              JOIN CCO_CAMPANIAS c2 ON c2.CM2_ID = fa.FA_CAMPANIA_ID AND c2.CM2_ACTIVO = 1
              WHERE v.FV_FORMULARIO_ID = f.FR_ID AND fa.FA_ACTIVO = 1
              UNION SELECT oe.EQ_NOMBRE FROM CC_EQUIPO_CAMPANIAS oc JOIN CC_EQUIPOS oe ON oe.EQ_ID = oc.EQC_EQUIPO_ID AND oe.EQ_ACTIVO = 1
              WHERE oc.EQC_FORM_ID = f.FR_ID AND oc.EQC_EQUIPO_ID <> @id) x) otros
    FROM CC_EQUIPO_CAMPANIAS ec JOIN CCF_FORMULARIOS f ON f.FR_ID = ec.EQC_FORM_ID AND f.FR_ACTIVO = 1
    WHERE ec.EQC_EQUIPO_ID = @id`, p);
  const conteo = (await q(pool, `SELECT
      (SELECT COUNT(*) FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @id AND EQM_ROL = 'agente') agentes,
      (SELECT COUNT(*) FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @id AND EQM_ROL = 'supervisor') supervisores,
      (SELECT COUNT(*) FROM CC_EQUIPO_CLIENTES WHERE EQCL_EQUIPO_ID = @id) clientes`, p).catch(() => [{ agentes: 0, supervisores: 0, clientes: 0 }]))[0];
  const marcar = (arr, tipo) => arr.map((x) => ({ ...x, bloqueado: x.otros ? `También lo usa ${tipo === 'formulario' ? '' : 'el grupo '}${x.otros}` : null }));
  return {
    campanias: marcar(campanias), skills: marcar(skills), canales: marcar(canales), formularios: marcar(formularios, 'formulario'),
    ...conteo,
  };
}

// Borra lo elegido de lo que estaba enlazado a un grupo ya eliminado. Solo
// lo que ningún otro grupo usa (se vuelve a verificar aquí). Mismos criterios
// que la app: campañas y skills se desactivan, canales sin conversaciones se
// borran (con historial solo se apagan), formularios se archivan.
async function borrarEnlazados(pool, { campanias = [], skills = [], canales = [], formularios = [] }) {
  const libres = async (tabla, col, lista) => {
    const l = ids(lista);
    if (!l.length) return [];
    const usados = (await q(pool, `SELECT DISTINCT t.${col} v FROM ${tabla} t JOIN CC_EQUIPOS e ON e.EQ_ID = t.${tabla === 'CC_EQUIPO_SKILLS' ? 'EQS' : 'EQC'}_EQUIPO_ID AND e.EQ_ACTIVO = 1
      WHERE t.${col} IN (${l.join(',')})`)).map((r) => r.v);
    return l.filter((x) => !usados.includes(x));
  };
  const hecho = { campanias: 0, skills: 0, canalesBorrados: 0, canalesApagados: 0, formularios: 0 };

  const canalIds = ids(canales);
  if (canalIds.length) {
    // Solo canales cuyo skill ya no controla otro grupo.
    const permitidos = (await q(pool, `SELECT cn.CN_ID id FROM CCO_CANALES cn WHERE cn.CN_ID IN (${canalIds.join(',')})
      AND NOT EXISTS (SELECT 1 FROM CC_EQUIPO_SKILLS s JOIN CC_EQUIPOS e ON e.EQ_ID = s.EQS_EQUIPO_ID AND e.EQ_ACTIVO = 1 WHERE s.EQS_GRUPO_ID = cn.CN_GRUPO_ID)`)).map((r) => r.id);
    for (const c of permitidos) {
      const n = (await q(pool, 'SELECT COUNT(*) n FROM CCO_INTERACCIONES WHERE CI_CANAL_ID = @c', { c: [sql.Int, c] }))[0].n;
      if (n > 0) {
        await q(pool, 'UPDATE CCO_CANALES SET CN_HABILITADO = 0, CN_GRUPO_ID = NULL WHERE CN_ID = @c', { c: [sql.Int, c] });
        hecho.canalesApagados++;
      } else {
        await q(pool, `DELETE FROM CCF_FORM_ASIGNACIONES WHERE FA_CANAL_ID = @c;
          DELETE FROM CCO_CANAL_AGENTE_SESION WHERE CAS_CANAL_ID = @c;
          DELETE FROM CCO_CANALES WHERE CN_ID = @c;`, { c: [sql.Int, c] });
        hecho.canalesBorrados++;
      }
    }
  }
  const sk = await libres('CC_EQUIPO_SKILLS', 'EQS_GRUPO_ID', skills);
  if (sk.length) {
    await q(pool, `UPDATE CCO_GRUPO_AGENTES SET CGA_ACTIVO = 0 WHERE CGA_GRUPO_ID IN (${sk.join(',')});
      DELETE FROM CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID IN (${sk.join(',')});
      UPDATE CCO_GRUPOS SET CG_ACTIVO = 0 WHERE CG_ID IN (${sk.join(',')});`);
    hecho.skills = sk.length;
  }
  const ca = await libres('CC_EQUIPO_CAMPANIAS', 'EQC_CAMPANIA_ID', campanias);
  if (ca.length) {
    await q(pool, `UPDATE CCO_CAMPANIAS SET CM2_ACTIVO = 0 WHERE CM2_ID IN (${ca.join(',')})`);
    hecho.campanias = ca.length;
  }
  const fo = ids(formularios);
  if (fo.length) {
    // Solo los que ya no usa ninguna campaña activa ni otro grupo.
    const libresF = (await q(pool, `SELECT f.FR_ID id FROM CCF_FORMULARIOS f WHERE f.FR_ID IN (${fo.join(',')})
      AND NOT EXISTS (SELECT 1 FROM CCF_FORM_ASIGNACIONES fa JOIN CCF_FORM_VERSIONES v ON v.FV_ID = fa.FA_FORM_VERSION_ID
        JOIN CCO_CAMPANIAS c ON c.CM2_ID = fa.FA_CAMPANIA_ID AND c.CM2_ACTIVO = 1 WHERE v.FV_FORMULARIO_ID = f.FR_ID AND fa.FA_ACTIVO = 1)
      AND NOT EXISTS (SELECT 1 FROM CC_EQUIPO_CAMPANIAS oc JOIN CC_EQUIPOS e ON e.EQ_ID = oc.EQC_EQUIPO_ID AND e.EQ_ACTIVO = 1 WHERE oc.EQC_FORM_ID = f.FR_ID)`)).map((r) => r.id);
    if (libresF.length) {
      await q(pool, `UPDATE CCF_FORMULARIOS SET FR_ESTADO = 'archivado', FR_ACTIVO = 0 WHERE FR_ID IN (${libresF.join(',')})`);
      hecho.formularios = libresF.length;
    }
  }
  return hecho;
}

// Slug único (para el link del marcador del grupo).
async function slugLibre(pool, nombre, exceptoId = 0) {
  const base = slugDe(nombre);
  for (let i = 0; i < 50; i++) {
    const s = i ? `${base}-${i + 1}` : base;
    const r = await q(pool, 'SELECT 1 x FROM CC_EQUIPOS WHERE EQ_SLUG = @s AND EQ_ID <> @id', { s: [sql.NVarChar(60), s], id: [sql.Int, exceptoId] });
    if (!r.length) return s;
  }
  return `${base}-${Date.now()}`;
}

module.exports = {
  equiposDeSkill, equiposDeCampania, sincronizarSkill, sincronizarCampania, sincronizarEquipo, slugLibre,
  enlacesDeEquipo, borrarEnlazados,
};
