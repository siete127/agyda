const sql = require('mssql');
const socketService = require('./socketService');
const { invalidateActionsCache } = require('../middleware/moduleAccess');
const { equiposDeSkill, sincronizarEquipo, slugLibre, enlacesDeEquipo, borrarEnlazados } = require('./ccEquiposService');

// Configuración → Usuarios y Seguridad → Grupos.
//
// AGYDA no tiene una sola tabla de "grupos": cada módulo agrupa usuarios a su
// manera (skills del omnicanal, supervisores, niveles de soporte, avisos por
// correo, grupos de mensajería…). Este servicio los reúne en un solo lugar con
// un adaptador por tipo, que lee y escribe en las MISMAS tablas y con las
// mismas reglas que su módulo (p. ej. quitar un agente de un skill lo
// desactiva, igual que ccConfigController), así que lo que se cambia aquí se
// ve en el módulo y viceversa.
//
// Cada tipo declara: segmento, textos, qué permite (crear grupos, cambiar
// miembros, eliminar) y si un usuario solo puede estar en UN grupo de ese tipo
// (`unico`: agregarlo lo mueve).

const SEGMENTOS = [
  { key: 'equipos', nombre: 'Equipos y avisos', descripcion: 'Quién gestiona y quién recibe los avisos de cada módulo' },
  { key: 'contact-center', nombre: 'Contact Center / Omnicanal', descripcion: 'Crea grupos y asígnales campañas, skills, marcador y supervisores; después sus agentes' },
  { key: 'soporte', nombre: 'Soporte TI', descripcion: 'Niveles de atención y especialidades de los técnicos' },
  { key: 'comunicacion', nombre: 'Clientes y comunicación', descripcion: 'Grupos de atención a clientes, grupos de Mensajería y usuarios del Portal de Cliente' },
  { key: 'acceso', nombre: 'Acceso', descripcion: 'Roles de permisos (se administran en Roles y Usuarios)' },
  // Lo que los grupos de Contact Center aplican, pieza por pieza: solo para
  // consultar. Agentes y supervisores se eligen únicamente en los grupos.
  { key: 'cc-detalle', nombre: 'Contact Center: detalle', descripcion: 'Qué aplicó cada grupo, pieza por pieza (skills, supervisores, marcador…). Solo consulta: la gente se asigna en los Grupos de Contact Center.' },
];

const claveDe = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const ids = (arr) => [...new Set((arr || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
const q = (pool, texto, params = {}) => {
  const r = pool.request();
  for (const [k, [tipo, v]] of Object.entries(params)) r.input(k, tipo, v);
  return r.query(texto).then((x) => x.recordset);
};
const miembrosSql = (pool, texto, id) => q(pool, texto, { id: [sql.Int, id] });

// ── Campañas de ventas (BD de Ventas, externa) ──────────────────────────
let _ventasPool = null;
async function campanasVentas() {
  try {
    if (!_ventasPool || !_ventasPool.connected) {
      _ventasPool = await new sql.ConnectionPool(require('../config/database_ventas')).connect();
    }
    return (await _ventasPool.request().query('SELECT id, nombre FROM [Campanas] WHERE activo = 1 ORDER BY nombre')).recordset;
  } catch (e) {
    console.warn('grupos: BD de Ventas no disponible:', e.message);
    return null;
  }
}

// Sincroniza a un técnico de TI con el grupo de chat "Soporte TI" (mismo
// criterio que tecnicosController / ticketController).
async function syncLivechatSoporteTI(pool, userId, activo) {
  try {
    const camp = await require('../controllers/livechatInternoController').resolverCampaniaGrupoSoporteTI(pool);
    if (!camp) return;
    if (activo) {
      await q(pool, `MERGE LIVECHAT_GRUPO_AGENTES AS t USING (SELECT @g g, @u u) s ON t.LGA_GRUPO_ID = s.g AND t.LGA_USUARIO_ID = s.u
        WHEN MATCHED THEN UPDATE SET LGA_ACTIVO = 1 WHEN NOT MATCHED THEN INSERT (LGA_GRUPO_ID, LGA_USUARIO_ID, LGA_ACTIVO) VALUES (@g, @u, 1);`,
      { g: [sql.Int, camp.grupoId], u: [sql.Int, userId] });
    } else {
      await q(pool, 'UPDATE LIVECHAT_GRUPO_AGENTES SET LGA_ACTIVO = 0 WHERE LGA_GRUPO_ID = @g AND LGA_USUARIO_ID = @u',
        { g: [sql.Int, camp.grupoId], u: [sql.Int, userId] });
    }
  } catch (e) {
    console.warn('grupos: sync Soporte TI:', e.message);
  }
}

const emitirMensajeria = (ctx, uids, canalId, evento, payload) => {
  try {
    const io = socketService.getIO(ctx.tenantKey);
    if (!io) return;
    io.to(`mensajeria:canal:${canalId}`).emit(evento, payload);
    for (const u of uids) io.to(`user:${u}`).emit(evento, payload);
  } catch (_) { /* sin socket no pasa nada: se ve al recargar */ }
};

// Grupo de Contact Center (CC_EQUIPOS): se crea, se le asignan campañas,
// skills, comunicación, marcador y supervisores, y al final su gente. Lo usan
// dos tipos: "Grupos de Contact Center" y "Grupos de atención a clientes"
// (el mismo grupo, que además atiende clientes: o.atencion).
function grupoCC(o) {
  return {
    key: o.key, segmento: o.segmento, nombre: o.nombre,
    descripcion: o.descripcion,
    miembroLabel: o.miembroLabel, puedeCrear: true, puedeEliminar: true,
    crearCampos: ['nombre', 'descripcion'],
    listar: (pool) => q(pool, `
      SELECT e.EQ_ID id, e.EQ_NOMBRE nombre, e.EQ_DESCRIPCION descripcion,
             CONCAT(
               ISNULL((SELECT STRING_AGG(c.CM2_NOMBRE, ', ') FROM CC_EQUIPO_CAMPANIAS ec JOIN CCO_CAMPANIAS c ON c.CM2_ID = ec.EQC_CAMPANIA_ID
                       WHERE ec.EQC_EQUIPO_ID = e.EQ_ID), 'Sin campaña'), ' · ',
               CASE e.EQ_MODALIDAD WHEN 'marcador' THEN 'Marcador' WHEN 'ambos' THEN 'Omnicanal + Marcador' ELSE 'Omnicanal' END,
               ' · ', (SELECT COUNT(*) FROM CC_EQUIPO_SKILLS s WHERE s.EQS_EQUIPO_ID = e.EQ_ID), ' skill(s)',
               ' · ', (SELECT COUNT(*) FROM CC_EQUIPO_MIEMBROS m WHERE m.EQM_EQUIPO_ID = e.EQ_ID AND m.EQM_ROL = 'supervisor'), ' supervisor(es)'${o.atencion ? ", ' · ', (SELECT COUNT(*) FROM CC_EQUIPO_CLIENTES cl WHERE cl.EQCL_EQUIPO_ID = e.EQ_ID), ' cliente(s)'" : ''}) contexto,
             (SELECT COUNT(*) FROM CC_EQUIPO_MIEMBROS m WHERE m.EQM_EQUIPO_ID = e.EQ_ID AND m.EQM_ROL = 'agente') miembros
      FROM CC_EQUIPOS e WHERE e.EQ_ACTIVO = 1 AND ISNULL(e.EQ_ATIENDE_CLIENTES, 0) = ${o.atencion ? 1 : 0} ORDER BY e.EQ_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre, v.WVIS_LABEL extra
      FROM CC_EQUIPO_MIEMBROS m JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID
      LEFT JOIN WEBPHONE_ASIGNACIONES wa ON wa.WASG_NEUS_ID = u.NEUS_ID
      LEFT JOIN WEBPHONE_VISTAS v ON v.WVIS_ID = wa.WASG_VISTA_ID
      WHERE m.EQM_EQUIPO_ID = @id AND m.EQM_ROL = 'agente' ORDER BY u.NEUS_NOMBRES`, id),
    agregar: async (pool, id, uids) => {
      // Cada persona tiene un solo papel en el grupo: un supervisor no se vuelve agente sin querer.
      const sup = await q(pool, `SELECT u.NEUS_NOMBRES n FROM CC_EQUIPO_MIEMBROS m JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID
        WHERE m.EQM_EQUIPO_ID = @e AND m.EQM_ROL = 'supervisor' AND m.EQM_USUARIO_ID IN (${ids(uids).concat(0).join(',')})`, { e: [sql.Int, id] });
      if (sup.length) throw new Error(`${sup.map((x) => x.n).join(', ')} ya es supervisor del grupo: quítalo de supervisores para agregarlo como ${o.atencion ? 'asesor' : 'agente'}`);
      for (const u of uids) {
        await q(pool, `INSERT INTO CC_EQUIPO_MIEMBROS (EQM_EQUIPO_ID, EQM_USUARIO_ID, EQM_ROL)
          SELECT @e, @u, 'agente' WHERE NOT EXISTS (SELECT 1 FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @e AND EQM_USUARIO_ID = @u);`,
        { e: [sql.Int, id], u: [sql.Int, u] });
      }
      return sincronizarEquipo(pool, Number(id));
    },
    quitar: async (pool, id, u) => {
      await q(pool, 'DELETE FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @e AND EQM_USUARIO_ID = @u', { e: [sql.Int, id], u: [sql.Int, u] });
      return sincronizarEquipo(pool, Number(id), { quitados: [u] });
    },
    crear: async (pool, d, ctx) => {
      const slug = await slugLibre(pool, d.nombre);
      return (await q(pool, `INSERT INTO CC_EQUIPOS (EQ_NOMBRE, EQ_DESCRIPCION, EQ_SLUG, EQ_CREADO_POR, EQ_ATIENDE_CLIENTES)
        OUTPUT INSERTED.EQ_ID id VALUES (@n, @d, @s, @por, ${o.atencion ? 1 : 0})`,
      { n: [sql.NVarChar(120), d.nombre.slice(0, 120)], d: [sql.NVarChar(300), d.descripcion?.slice(0, 300) || null],
        s: [sql.NVarChar(60), slug], por: [sql.Int, ctx.userId || null] }))[0].id;
    },
    // Lo enlazado al grupo (para elegir qué borrar junto con él).
    enlaces: (pool, id) => enlacesDeEquipo(pool, Number(id)),
    // Al eliminarlo, su gente sale de las campañas y skills que controlaba;
    // `borrar` = lo enlazado que también se borra (campañas, skills, canales,
    // formularios). Agentes y supervisores no se borran; los clientes quedan sin grupo.
    eliminar: async (pool, id, ctx, borrar) => {
      const antes = {
        skills: (await q(pool, 'SELECT EQS_GRUPO_ID g FROM CC_EQUIPO_SKILLS WHERE EQS_EQUIPO_ID = @id', { id: [sql.Int, id] })).map((r) => r.g),
        campanias: (await q(pool, 'SELECT EQC_CAMPANIA_ID c FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID = @id', { id: [sql.Int, id] })).map((r) => r.c),
      };
      const quitados = (await q(pool, 'SELECT EQM_USUARIO_ID u FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @id', { id: [sql.Int, id] })).map((r) => r.u);
      await q(pool, 'DELETE FROM CC_EQUIPOS WHERE EQ_ID = @id', { id: [sql.Int, id] });
      await sincronizarEquipo(pool, Number(id), { antes, quitados });
      return borrar ? borrarEnlazados(pool, borrar) : null;
    },
    // Todo lo que se le asigna al grupo, en orden: campañas → skills y
    // comunicación → supervisores (los agentes son los miembros).
    config: {
      leer: async (pool, id) => {
        const e = (await q(pool, `SELECT EQ_ID id, EQ_MODALIDAD modalidad, EQ_WEBPHONE_VISTA_ID webphoneVistaId, EQ_SLUG slug,
          EQ_VENTAS_CAMPANA_ID ventasCampanaId FROM CC_EQUIPOS WHERE EQ_ID = @id`, { id: [sql.Int, id] }))[0];
        if (!e) throw new Error('Grupo no encontrado');
        const campaniasRs = await q(pool, `
          SELECT c.CM2_ID id, c.CM2_NOMBRE nombre, c.CM2_SLUG slug,
                 ec.EQC_CAMPANIA_ID asignada, ec.EQC_FORM_ID formularioId,
                 (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_CAMPANIAS oc JOIN CC_EQUIPOS oe ON oe.EQ_ID = oc.EQC_EQUIPO_ID AND oe.EQ_ACTIVO = 1
                   WHERE oc.EQC_CAMPANIA_ID = c.CM2_ID AND oc.EQC_EQUIPO_ID <> @id) otrosGrupos
          FROM CCO_CAMPANIAS c LEFT JOIN CC_EQUIPO_CAMPANIAS ec ON ec.EQC_CAMPANIA_ID = c.CM2_ID AND ec.EQC_EQUIPO_ID = @id
          WHERE c.CM2_ACTIVO = 1 ORDER BY c.CM2_NOMBRE`, { id: [sql.Int, id] });
        const skillsRs = await q(pool, `
          SELECT g.CG_ID id, g.CG_NOMBRE nombre, g.CG_CAMPANIA_ID campaniaId,
                 (SELECT COUNT(*) FROM CCO_CANALES cn WHERE cn.CN_GRUPO_ID = g.CG_ID) canales,
                 CASE WHEN EXISTS (SELECT 1 FROM CC_EQUIPO_SKILLS s WHERE s.EQS_EQUIPO_ID = @id AND s.EQS_GRUPO_ID = g.CG_ID) THEN 1 ELSE 0 END asignado,
                 (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_SKILLS os JOIN CC_EQUIPOS oe ON oe.EQ_ID = os.EQS_EQUIPO_ID AND oe.EQ_ACTIVO = 1
                   WHERE os.EQS_GRUPO_ID = g.CG_ID AND os.EQS_EQUIPO_ID <> @id) otrosGrupos
          FROM CCO_GRUPOS g WHERE g.CG_ACTIVO = 1 ORDER BY g.CG_NOMBRE`, { id: [sql.Int, id] });
        const formsCtrl = require('../controllers/ccFormulariosController');
        const campanias = [];
        for (const c of campaniasRs) {
          const asignada = !!c.asignada;
          campanias.push({
            id: c.id, nombre: c.nombre, asignada, formularioId: c.formularioId ?? null, otrosGrupos: c.otrosGrupos,
            // Formularios que puede abrir el marcador (solo se consultan para las asignadas).
            formularios: asignada ? (await formsCtrl._formulariosDeCampania(pool, c.id)).filter((f) => f.abrePorUrl).map((f) => ({ id: f.id, nombre: f.nombre })) : [],
            linkMarcador: c.slug ? `/formulario-publico/c/${c.slug}?equipo=${e.slug}` : null,
            skills: skillsRs.filter((s) => s.campaniaId === c.id).map((s) => ({ id: s.id, nombre: s.nombre, canales: s.canales, asignado: !!s.asignado, otrosGrupos: s.otrosGrupos })),
          });
        }
        const supervisores = await q(pool, `SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM CC_EQUIPO_MIEMBROS m
          JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID WHERE m.EQM_EQUIPO_ID = @id AND m.EQM_ROL = 'supervisor' ORDER BY u.NEUS_NOMBRES`,
        { id: [sql.Int, id] });
        const vistas = await q(pool, 'SELECT WVIS_ID id, WVIS_LABEL nombre FROM WEBPHONE_VISTAS ORDER BY WVIS_ORDEN, WVIS_LABEL');
        const ventas = await campanasVentas();
        return {
          ...e, campanias, supervisores, vistas,
          campaniaIds: campanias.filter((c) => c.asignada).map((c) => c.id),
          skillIds: skillsRs.filter((s) => s.asignado).map((s) => s.id),
          supervisorIds: supervisores.map((s) => s.usuarioId),
          campanasVentas: (ventas || []).map((v) => ({ id: v.id, nombre: v.nombre })),
        };
      },
      guardar: async (pool, id, d) => {
        const eq = (await q(pool, 'SELECT EQ_ID id FROM CC_EQUIPOS WHERE EQ_ID = @id', { id: [sql.Int, id] }))[0];
        if (!eq) throw new Error('Grupo no encontrado');
        const modalidad = ['omnicanal', 'marcador', 'ambos'].includes(d.modalidad) ? d.modalidad : 'omnicanal';
        const usaMarcador = modalidad !== 'omnicanal';
        const vista = usaMarcador && Number(d.webphoneVistaId) > 0 ? Number(d.webphoneVistaId) : null;
        if (usaMarcador && !vista) throw new Error('Elige el marcador del grupo');

        // Campañas (con su formulario para el link del marcador).
        const campPedidas = (Array.isArray(d.campanias) ? d.campanias : [])
          .map((c) => ({ id: Number(c.id), formularioId: Number(c.formularioId) > 0 ? Number(c.formularioId) : null }))
          .filter((c) => c.id > 0);
        const campValidas = campPedidas.length ? (await q(pool, `SELECT CM2_ID id FROM CCO_CAMPANIAS WHERE CM2_ACTIVO = 1 AND CM2_ID IN (${campPedidas.map((c) => c.id).join(',')})`)).map((r) => r.id) : [];
        const campanias = campPedidas.filter((c) => campValidas.includes(c.id));
        if (!campanias.length) throw new Error('Asigna al menos una campaña al grupo');
        // Skills: solo de sus campañas.
        const pedidos = ids(d.skillIds);
        const skillIds = pedidos.length ? (await q(pool, `SELECT CG_ID id FROM CCO_GRUPOS WHERE CG_ACTIVO = 1 AND CG_ID IN (${pedidos.join(',')})
          AND CG_CAMPANIA_ID IN (${campanias.map((c) => c.id).join(',')})`)).map((r) => r.id) : [];
        if (modalidad !== 'marcador' && !skillIds.length) throw new Error('Elige al menos un skill para el omnicanal');
        const supervisorIds = ids(d.supervisorIds);
        // Campaña de ventas (opcional).
        let ventasId = Number(d.ventasCampanaId) > 0 ? Number(d.ventasCampanaId) : null;
        let ventasNombre = null;
        if (ventasId) {
          ventasNombre = (await campanasVentas() || []).find((v) => v.id === ventasId)?.nombre || null;
          if (!ventasNombre) ventasId = null;
        }

        const antes = {
          skills: (await q(pool, 'SELECT EQS_GRUPO_ID g FROM CC_EQUIPO_SKILLS WHERE EQS_EQUIPO_ID = @id', { id: [sql.Int, id] })).map((r) => r.g),
          campanias: (await q(pool, 'SELECT EQC_CAMPANIA_ID c FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID = @id', { id: [sql.Int, id] })).map((r) => r.c),
        };
        const supAntes = (await q(pool, `SELECT EQM_USUARIO_ID u FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @id AND EQM_ROL = 'supervisor'`, { id: [sql.Int, id] })).map((r) => r.u);

        await q(pool, `UPDATE CC_EQUIPOS SET EQ_MODALIDAD = @m, EQ_WEBPHONE_VISTA_ID = @v, EQ_VENTAS_CAMPANA_ID = @vc, EQ_VENTAS_CAMPANA_NOMBRE = @vn
          WHERE EQ_ID = @id`, { m: [sql.NVarChar(12), modalidad], v: [sql.Int, vista], vc: [sql.Int, ventasId], vn: [sql.NVarChar(200), ventasNombre], id: [sql.Int, id] });
        await q(pool, 'DELETE FROM CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID = @id', { id: [sql.Int, id] });
        for (const c of campanias) {
          await q(pool, 'INSERT INTO CC_EQUIPO_CAMPANIAS (EQC_EQUIPO_ID, EQC_CAMPANIA_ID, EQC_FORM_ID) VALUES (@id, @c, @f)',
            { id: [sql.Int, id], c: [sql.Int, c.id], f: [sql.Int, c.formularioId] });
        }
        await q(pool, 'DELETE FROM CC_EQUIPO_SKILLS WHERE EQS_EQUIPO_ID = @id', { id: [sql.Int, id] });
        for (const g of skillIds) {
          await q(pool, 'INSERT INTO CC_EQUIPO_SKILLS (EQS_EQUIPO_ID, EQS_GRUPO_ID) VALUES (@id, @g)', { id: [sql.Int, id], g: [sql.Int, g] });
        }
        // Supervisores (si alguno era agente del grupo, pasa a supervisor).
        await q(pool, `DELETE FROM CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID = @id AND EQM_ROL = 'supervisor'
          AND EQM_USUARIO_ID NOT IN (${supervisorIds.concat(0).join(',')})`, { id: [sql.Int, id] });
        for (const u of supervisorIds) {
          await q(pool, `MERGE CC_EQUIPO_MIEMBROS AS t USING (SELECT @e e, @u u) s ON t.EQM_EQUIPO_ID = s.e AND t.EQM_USUARIO_ID = s.u
            WHEN MATCHED THEN UPDATE SET EQM_ROL = 'supervisor' WHEN NOT MATCHED THEN INSERT (EQM_EQUIPO_ID, EQM_USUARIO_ID, EQM_ROL) VALUES (@e, @u, 'supervisor');`,
          { e: [sql.Int, id], u: [sql.Int, u] });
        }
        const r = await sincronizarEquipo(pool, Number(id), { antes, quitados: supAntes.filter((u) => !supervisorIds.includes(u)) });
        return { modalidad, ...r };
      },
    },
    ...(o.atencion ? CLIENTES_DE_GRUPO : {}),
  };
}

// Lo mismo que config.leer ofrece para elegir, pero para un grupo que todavía
// no existe (asistente "Crear grupo", que captura todo antes de crearlo):
// campañas activas con sus skills y los formularios que abre el marcador,
// marcadores (Webphone) y campañas de ventas.
async function catalogoNuevoGrupo(pool) {
  const campaniasRs = await q(pool, `
    SELECT c.CM2_ID id, c.CM2_NOMBRE nombre, c.CM2_SLUG slug,
           (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_CAMPANIAS oc JOIN CC_EQUIPOS oe ON oe.EQ_ID = oc.EQC_EQUIPO_ID AND oe.EQ_ACTIVO = 1
             WHERE oc.EQC_CAMPANIA_ID = c.CM2_ID) otrosGrupos
    FROM CCO_CAMPANIAS c WHERE c.CM2_ACTIVO = 1 ORDER BY c.CM2_NOMBRE`);
  const skillsRs = await q(pool, `
    SELECT g.CG_ID id, g.CG_NOMBRE nombre, g.CG_CAMPANIA_ID campaniaId,
           (SELECT COUNT(*) FROM CCO_CANALES cn WHERE cn.CN_GRUPO_ID = g.CG_ID) canales,
           (SELECT STRING_AGG(oe.EQ_NOMBRE, ', ') FROM CC_EQUIPO_SKILLS os JOIN CC_EQUIPOS oe ON oe.EQ_ID = os.EQS_EQUIPO_ID AND oe.EQ_ACTIVO = 1
             WHERE os.EQS_GRUPO_ID = g.CG_ID) otrosGrupos
    FROM CCO_GRUPOS g WHERE g.CG_ACTIVO = 1 ORDER BY g.CG_NOMBRE`);
  const formsCtrl = require('../controllers/ccFormulariosController');
  const campanias = [];
  for (const c of campaniasRs) {
    let formularios = [];
    try { formularios = (await formsCtrl._formulariosDeCampania(pool, c.id)).filter((f) => f.abrePorUrl).map((f) => ({ id: f.id, nombre: f.nombre })); } catch (_) { /* sin formularios */ }
    campanias.push({
      id: c.id, nombre: c.nombre, otrosGrupos: c.otrosGrupos, formularios,
      // El link del marcador lleva el identificador del grupo, que se genera al crearlo.
      tieneLinkMarcador: !!c.slug,
      skills: skillsRs.filter((s) => s.campaniaId === c.id).map((s) => ({ id: s.id, nombre: s.nombre, canales: s.canales, otrosGrupos: s.otrosGrupos })),
    });
  }
  const vistas = await q(pool, 'SELECT WVIS_ID id, WVIS_LABEL nombre FROM WEBPHONE_VISTAS ORDER BY WVIS_ORDEN, WVIS_LABEL').catch(() => []);
  const ventas = await campanasVentas();
  return { campanias, vistas, campanasVentas: (ventas || []).map((v) => ({ id: v.id, nombre: v.nombre })) };
}

// Clientes que atiende un grupo de atención (cada cliente en un solo grupo:
// asignarlo aquí lo mueve). Si el cliente no tiene asesor individual, su
// portal chatea con el grupo y los avisos de "Atención a clientes" de ese
// cliente les llegan a sus integrantes (services/atencionGruposService.js).
const CLIENTES_DE_GRUPO = {
  clientes: (pool, id) => miembrosSql(pool, `
    SELECT c.CONT_ID clienteId, COALESCE(NULLIF(c.CONT_EMPRESA, ''), c.CONT_NOMBRE) nombre,
           CASE WHEN u.NEUS_ID IS NOT NULL THEN CONCAT('Asesor individual: ', u.NEUS_NOMBRES) END extra
    FROM CC_EQUIPO_CLIENTES gc JOIN CRM_CONTACTOS c ON c.CONT_ID = gc.EQCL_CONT_ID
    LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.CONT_RESPONSABLE_ID AND u.NEUS_ACTIVO = 1
    WHERE gc.EQCL_EQUIPO_ID = @id ORDER BY nombre`, id),
  agregarClientes: async (pool, id, contIds) => {
    for (const c of contIds) {
      await q(pool, `MERGE CC_EQUIPO_CLIENTES AS t USING (SELECT @c c) s ON t.EQCL_CONT_ID = s.c
        WHEN MATCHED THEN UPDATE SET EQCL_EQUIPO_ID = @g, EQCL_FECHA = GETDATE()
        WHEN NOT MATCHED THEN INSERT (EQCL_CONT_ID, EQCL_EQUIPO_ID) VALUES (@c, @g);`, { c: [sql.Int, c], g: [sql.Int, id] });
    }
  },
  quitarCliente: (pool, id, c) => q(pool, 'DELETE FROM CC_EQUIPO_CLIENTES WHERE EQCL_CONT_ID = @c AND EQCL_EQUIPO_ID = @g',
    { c: [sql.Int, c], g: [sql.Int, id] }),
};

const TIPOS = [
  // ── Equipos y avisos ──────────────────────────────────────────────────
  {
    key: 'funciones', segmento: 'equipos', nombre: 'Funciones de usuario',
    descripcion: 'Etiquetas de función que se asignan a cualquier usuario. "Asesor de clientes" recibe los avisos de clientes del portal sin asesor.',
    miembroLabel: 'Integrantes', puedeCrear: true, puedeEliminar: true,
    crearCampos: ['nombre', 'descripcion'],
    listar: (pool) => q(pool, `
      SELECT f.FUN_ID id, f.FUN_NOMBRE nombre, f.FUN_DESCRIPCION descripcion, f.FUN_ES_SISTEMA sistema,
             (SELECT COUNT(*) FROM INTRANET_USUARIO_FUNCIONES uf WHERE uf.UF_FUNCION_ID = f.FUN_ID) miembros
      FROM INTRANET_FUNCIONES f WHERE f.FUN_ACTIVO = 1 ORDER BY f.FUN_ES_SISTEMA DESC, f.FUN_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM INTRANET_USUARIO_FUNCIONES uf
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = uf.UF_USUARIO_ID WHERE uf.UF_FUNCION_ID = @id ORDER BY u.NEUS_NOMBRES`, id),
    agregar: async (pool, id, uids, ctx) => {
      for (const u of uids) {
        await q(pool, `IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIO_FUNCIONES WHERE UF_USUARIO_ID = @u AND UF_FUNCION_ID = @f)
          INSERT INTO INTRANET_USUARIO_FUNCIONES (UF_USUARIO_ID, UF_FUNCION_ID, UF_ASIGNADO_POR) VALUES (@u, @f, @por)`,
        { u: [sql.Int, u], f: [sql.Int, id], por: [sql.Int, ctx.userId || null] });
      }
    },
    quitar: (pool, id, u) => q(pool, 'DELETE FROM INTRANET_USUARIO_FUNCIONES WHERE UF_USUARIO_ID = @u AND UF_FUNCION_ID = @f',
      { u: [sql.Int, u], f: [sql.Int, id] }),
    crear: async (pool, d) => {
      const clave = claveDe(d.nombre);
      if (!clave) throw new Error('Nombre inválido');
      const dup = await q(pool, 'SELECT 1 x FROM INTRANET_FUNCIONES WHERE FUN_CLAVE = @c', { c: [sql.NVarChar(60), clave] });
      if (dup.length) throw new Error('Ya existe una función con ese nombre');
      const r = await q(pool, `INSERT INTO INTRANET_FUNCIONES (FUN_CLAVE, FUN_NOMBRE, FUN_DESCRIPCION) OUTPUT INSERTED.FUN_ID id VALUES (@c, @n, @d)`,
        { c: [sql.NVarChar(60), clave], n: [sql.NVarChar(100), d.nombre.slice(0, 100)], d: [sql.NVarChar(300), d.descripcion?.slice(0, 300) || null] });
      return r[0].id;
    },
    eliminar: async (pool, id) => {
      const f = (await q(pool, 'SELECT FUN_ES_SISTEMA sis FROM INTRANET_FUNCIONES WHERE FUN_ID = @id', { id: [sql.Int, id] }))[0];
      if (f?.sis) throw new Error('Es un equipo del sistema: no se puede eliminar');
      await q(pool, 'DELETE FROM INTRANET_FUNCIONES WHERE FUN_ID = @id', { id: [sql.Int, id] });
    },
  },
  {
    key: 'avisos-modulo', segmento: 'equipos', nombre: 'Avisos por correo de cada módulo',
    descripcion: 'Quién recibe los correos de cada módulo (p. ej. Atención a clientes, Dirección General, Legal). Es la acción "Notificar por correo" de Accesos.',
    miembroLabel: 'Reciben avisos', puedeCrear: false, puedeEliminar: false,
    listar: async (pool) => {
      const { ACCIONES_POR_MODULO, MODULOS_DISPONIBLES } = require('../controllers/accesoController');
      const nombres = Object.fromEntries(MODULOS_DISPONIBLES.map((m) => [m.key, m.nombre]));
      const cuenta = Object.fromEntries((await q(pool, `
        SELECT a.MODULO_KEY k, COUNT(*) n FROM INTRANET_USUARIOS_ACCIONES a JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.USUARIO_ID AND u.NEUS_ACTIVO = 1
        WHERE a.ACCION_KEY = 'notificar-correo' AND a.ALLOW = 1 GROUP BY a.MODULO_KEY`)).map((r) => [r.k, r.n]));
      return Object.entries(ACCIONES_POR_MODULO)
        .filter(([, acciones]) => acciones.some((a) => a.key === 'notificar-correo'))
        .map(([k]) => ({ id: k, nombre: nombres[k] || k, descripcion: null, miembros: cuenta[k] || 0 }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    miembros: (pool, id) => q(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM INTRANET_USUARIOS_ACCIONES a
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.USUARIO_ID AND u.NEUS_ACTIVO = 1
      WHERE a.MODULO_KEY = @m AND a.ACCION_KEY = 'notificar-correo' AND a.ALLOW = 1 ORDER BY u.NEUS_NOMBRES`,
    { m: [sql.NVarChar(100), String(id)] }),
    agregar: async (pool, id, uids, ctx) => {
      const { ACCIONES_POR_MODULO } = require('../controllers/accesoController');
      const acciones = (ACCIONES_POR_MODULO[id] || []).map((a) => a.key);
      for (const u of uids) {
        // Sin filas en el módulo = "todas permitidas". Al agregar la primera
        // fila se siembran las demás acciones permitidas para no quitarle nada.
        const tiene = await q(pool, 'SELECT COUNT(*) n FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID = @u AND MODULO_KEY = @m',
          { u: [sql.Int, u], m: [sql.NVarChar(100), id] });
        const aSembrar = tiene[0].n ? ['notificar-correo'] : acciones;
        for (const acc of aSembrar) {
          await q(pool, `MERGE INTRANET_USUARIOS_ACCIONES AS t USING (SELECT @u u, @m m, @a a) s
            ON t.USUARIO_ID = s.u AND t.MODULO_KEY = s.m AND t.ACCION_KEY = s.a
            WHEN MATCHED THEN UPDATE SET ALLOW = 1 WHEN NOT MATCHED THEN INSERT (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW) VALUES (@u, @m, @a, 1);`,
          { u: [sql.Int, u], m: [sql.NVarChar(100), id], a: [sql.NVarChar(100), acc] });
        }
        invalidateActionsCache(u, id, ctx.tenantKey);
      }
    },
    quitar: async (pool, id, u, ctx) => {
      await q(pool, `UPDATE INTRANET_USUARIOS_ACCIONES SET ALLOW = 0 WHERE USUARIO_ID = @u AND MODULO_KEY = @m AND ACCION_KEY = 'notificar-correo'`,
        { u: [sql.Int, u], m: [sql.NVarChar(100), String(id)] });
      invalidateActionsCache(u, id, ctx.tenantKey);
    },
  },
  {
    key: 'avisos-evento', segmento: 'equipos', nombre: 'Destinatarios por evento',
    descripcion: 'Quién recibe el correo de eventos puntuales: solicitudes de permiso y vacaciones, posible baja, tickets y solicitudes del sitio público.',
    miembroLabel: 'Destinatarios', puedeCrear: false, puedeEliminar: false,
    listar: async (pool) => {
      const { MODULOS } = require('../controllers/notificacionesCorreoController');
      const cuenta = Object.fromEntries((await q(pool, `SELECT NCD_MODULO k, COUNT(*) n FROM NOTIFICACIONES_CORREO_DESTINATARIOS GROUP BY NCD_MODULO`)
        .catch(() => [])).map((r) => [r.k, r.n]));
      return MODULOS.map((m) => ({ id: m.key, nombre: m.nombre, descripcion: m.descripcion, miembros: cuenta[m.key] || 0 }));
    },
    miembros: (pool, id) => q(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre,
             CONCAT(CASE WHEN d.NCD_MAIL = 1 THEN 'Correo' END, CASE WHEN d.NCD_MAIL = 1 AND d.NCD_TELEGRAM = 1 THEN ' · ' END, CASE WHEN d.NCD_TELEGRAM = 1 THEN 'Telegram' END) extra
      FROM NOTIFICACIONES_CORREO_DESTINATARIOS d JOIN NEUS_USUARIOS u ON u.NEUS_ID = d.NCD_USUARIO_ID
      WHERE d.NCD_MODULO = @m ORDER BY u.NEUS_NOMBRES`, { m: [sql.NVarChar(30), String(id)] }),
    agregar: async (pool, id, uids) => {
      for (const u of uids) {
        await q(pool, `IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO = @m AND NCD_USUARIO_ID = @u)
          INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID, NCD_MAIL, NCD_TELEGRAM) VALUES (@m, @u, 1, 0)`,
        { m: [sql.NVarChar(30), id], u: [sql.Int, u] });
      }
    },
    quitar: (pool, id, u) => q(pool, 'DELETE FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO = @m AND NCD_USUARIO_ID = @u',
      { m: [sql.NVarChar(30), String(id)], u: [sql.Int, u] }),
  },

  // ── Contact Center / Omnicanal ────────────────────────────────────────
  grupoCC({
    key: 'cc-equipos', segmento: 'contact-center', nombre: 'Grupos de Contact Center',
    descripcion: 'Crea el grupo y asígnale campañas, skills, forma de comunicación (Omnicanal / Marcador / Ambos), marcador y supervisores; al final sus agentes. Quien entra o sale del grupo recibe o pierde todo automáticamente.',
    miembroLabel: 'Agentes', atencion: false,
  }),
  {
    key: 'cc-skills', segmento: 'cc-detalle', nombre: 'Skills (canales)',
    descripcion: 'Grupos de conversaciones de cada campaña: qué canales entran a cada skill. Sus agentes y supervisores los pone el grupo de Contact Center que lo tenga.',
    miembroLabel: 'Agentes', puedeCrear: true, puedeEliminar: true, soloLectura: true, notaSoloLectura: 'Se asignan desde los Grupos de Contact Center (Configuración → Grupos)',
    crearCampos: ['nombre', 'descripcion', 'campaniaId'],
    listar: (pool) => q(pool, `
      SELECT g.CG_ID id, g.CG_NOMBRE nombre, g.CG_DESCRIPCION descripcion,
             CONCAT(c.CM2_NOMBRE, ' · ', (SELECT COUNT(*) FROM CCO_CANALES cn WHERE cn.CN_GRUPO_ID = g.CG_ID), ' canal(es)',
               (SELECT CONCAT(' · Grupo: ', STRING_AGG(e.EQ_NOMBRE, ', ')) FROM CC_EQUIPO_SKILLS s JOIN CC_EQUIPOS e ON e.EQ_ID = s.EQS_EQUIPO_ID AND e.EQ_ACTIVO = 1
                 WHERE s.EQS_GRUPO_ID = g.CG_ID HAVING COUNT(*) > 0)) contexto,
             (SELECT COUNT(*) FROM CCO_GRUPO_AGENTES a WHERE a.CGA_GRUPO_ID = g.CG_ID AND a.CGA_ACTIVO = 1) miembros
      FROM CCO_GRUPOS g JOIN CCO_CAMPANIAS c ON c.CM2_ID = g.CG_CAMPANIA_ID
      WHERE g.CG_ACTIVO = 1 ORDER BY c.CM2_NOMBRE, g.CG_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM CCO_GRUPO_AGENTES a JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.CGA_USUARIO_ID
      WHERE a.CGA_GRUPO_ID = @id AND a.CGA_ACTIVO = 1 ORDER BY u.NEUS_NOMBRES`, id),
    // Canales del skill.
    config: {
      leer: async (pool, id) => {
        const g = (await q(pool, 'SELECT CG_ID id, CG_CAMPANIA_ID campaniaId FROM CCO_GRUPOS WHERE CG_ID = @id', { id: [sql.Int, id] }))[0];
        if (!g) throw new Error('Skill no encontrado');
        const canales = await q(pool, `
          SELECT cn.CN_ID id, cn.CN_NOMBRE nombre, cn.CN_TIPO tipo, cn.CN_HABILITADO habilitado,
                 cn.CN_GRUPO_ID grupoId, og.CG_NOMBRE grupoNombre
          FROM CCO_CANALES cn LEFT JOIN CCO_GRUPOS og ON og.CG_ID = cn.CN_GRUPO_ID
          WHERE cn.CN_CAMPANIA_ID = @c OR cn.CN_CAMPANIA_ID IS NULL OR cn.CN_GRUPO_ID = @id
          ORDER BY cn.CN_TIPO, cn.CN_NOMBRE`, { c: [sql.Int, g.campaniaId], id: [sql.Int, id] });
        const equipos = await equiposDeSkill(pool, id);
        return { ...g, canalIds: canales.filter((c) => c.grupoId === g.id).map((c) => c.id), canales, equipos };
      },
      guardar: async (pool, id, d) => {
        const g = (await q(pool, 'SELECT CG_CAMPANIA_ID c FROM CCO_GRUPOS WHERE CG_ID = @id', { id: [sql.Int, id] }))[0];
        if (!g) throw new Error('Skill no encontrado');
        const canalIds = ids(d.canalIds);
        // Los elegidos pasan a este skill (y a su campaña); los que ya no, quedan sin skill.
        await q(pool, `UPDATE CCO_CANALES SET CN_GRUPO_ID = NULL, CN_FECHA_ACTUALIZACION = GETDATE()
          WHERE CN_GRUPO_ID = @id AND CN_ID NOT IN (${canalIds.concat(0).join(',')})`, { id: [sql.Int, id] });
        if (canalIds.length) {
          await q(pool, `UPDATE CCO_CANALES SET CN_GRUPO_ID = @id, CN_CAMPANIA_ID = ISNULL(CN_CAMPANIA_ID, @c), CN_FECHA_ACTUALIZACION = GETDATE()
            WHERE CN_ID IN (${canalIds.join(',')}) AND (CN_CAMPANIA_ID IS NULL OR CN_CAMPANIA_ID = @c)`,
          { id: [sql.Int, id], c: [sql.Int, g.c] });
        }
        return { canales: canalIds.length };
      },
    },
    crear: async (pool, d) => {
      if (!Number(d.campaniaId)) throw new Error('Elige la campaña del skill');
      const r = await q(pool, `INSERT INTO CCO_GRUPOS (CG_CAMPANIA_ID, CG_NOMBRE, CG_DESCRIPCION) OUTPUT INSERTED.CG_ID id VALUES (@c, @n, @d)`,
        { c: [sql.Int, Number(d.campaniaId)], n: [sql.NVarChar(120), d.nombre.slice(0, 120)], d: [sql.NVarChar(sql.MAX), d.descripcion || null] });
      return r[0].id;
    },
    eliminar: async (pool, id) => {
      const equipos = await equiposDeSkill(pool, id);
      if (equipos.length) throw new Error(`El skill está en el grupo "${equipos.map((e) => e.nombre).join('", "')}": quítalo del grupo primero`);
      // Su gente sale del skill (solo se asigna desde los grupos).
      await q(pool, `UPDATE CCO_GRUPO_AGENTES SET CGA_ACTIVO = 0 WHERE CGA_GRUPO_ID = @id;
        DELETE FROM CCO_GRUPO_SUPERVISORES WHERE GS_GRUPO_ID = @id;
        UPDATE CCO_GRUPOS SET CG_ACTIVO = 0 WHERE CG_ID = @id`, { id: [sql.Int, id] });
    },
  },
  {
    key: 'cc-skill-supervisores', segmento: 'cc-detalle', nombre: 'Supervisores por skill',
    descripcion: 'Supervisores acotados a un solo skill de la campaña (ven y supervisan solo esas conversaciones): son los supervisores de los grupos que tienen el skill.',
    miembroLabel: 'Supervisores', puedeCrear: false, puedeEliminar: false, soloLectura: true, notaSoloLectura: 'Se asignan desde los Grupos de Contact Center (Configuración → Grupos)',
    listar: (pool) => q(pool, `
      SELECT g.CG_ID id, g.CG_NOMBRE nombre, NULL descripcion, c.CM2_NOMBRE contexto,
             (SELECT COUNT(*) FROM CCO_GRUPO_SUPERVISORES s WHERE s.GS_GRUPO_ID = g.CG_ID) miembros
      FROM CCO_GRUPOS g JOIN CCO_CAMPANIAS c ON c.CM2_ID = g.CG_CAMPANIA_ID
      WHERE g.CG_ACTIVO = 1 ORDER BY c.CM2_NOMBRE, g.CG_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM CCO_GRUPO_SUPERVISORES s JOIN NEUS_USUARIOS u ON u.NEUS_ID = s.GS_SUPERVISOR_ID
      WHERE s.GS_GRUPO_ID = @id ORDER BY u.NEUS_NOMBRES`, id),
  },
  {
    key: 'cc-campania-supervisores', segmento: 'cc-detalle', nombre: 'Supervisores por campaña',
    descripcion: 'Supervisores de toda la campaña: supervisan todos sus skills y reciben sus alertas. Son los supervisores de los grupos que tienen la campaña.',
    miembroLabel: 'Supervisores', puedeCrear: false, puedeEliminar: false, soloLectura: true, notaSoloLectura: 'Se asignan desde los Grupos de Contact Center (Configuración → Grupos)',
    listar: (pool) => q(pool, `
      SELECT c.CM2_ID id, c.CM2_NOMBRE nombre, NULL descripcion,
             (SELECT COUNT(*) FROM CC_CAMPANIAS_SUPERVISORES s WHERE s.CS_CAMPANIA_ID = c.CM2_ID) miembros
      FROM CCO_CAMPANIAS c WHERE c.CM2_ACTIVO = 1 ORDER BY c.CM2_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM CC_CAMPANIAS_SUPERVISORES s JOIN NEUS_USUARIOS u ON u.NEUS_ID = s.CS_SUPERVISOR_ID
      WHERE s.CS_CAMPANIA_ID = @id ORDER BY u.NEUS_NOMBRES`, id),
  },
  {
    key: 'ventas-campanias', segmento: 'cc-detalle', nombre: 'Agentes por campaña de ventas',
    descripcion: 'Campaña de la plataforma de Ventas en la que trabaja cada agente (una sola por agente). La pone el grupo de Contact Center del agente.',
    miembroLabel: 'Agentes', puedeCrear: false, puedeEliminar: false, unico: true, soloLectura: true, notaSoloLectura: 'Se asignan desde los Grupos de Contact Center (Configuración → Grupos)',
    listar: async (pool) => {
      const asignados = await q(pool, `SELECT ACA_VENTAS_CAMPANA_ID id, MAX(ACA_VENTAS_CAMPANA_NOMBRE) nombre, COUNT(*) miembros
        FROM AC_CAMPANIAS_AGENTES GROUP BY ACA_VENTAS_CAMPANA_ID`);
      const externas = await campanasVentas();
      const porId = new Map(asignados.map((a) => [a.id, a]));
      const lista = (externas || []).map((c) => ({ id: c.id, nombre: c.nombre, descripcion: null, miembros: porId.get(c.id)?.miembros || 0 }));
      for (const a of asignados) if (!lista.some((x) => x.id === a.id)) lista.push({ ...a, descripcion: externas ? 'Campaña inactiva en Ventas' : null });
      return lista;
    },
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM AC_CAMPANIAS_AGENTES a JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.ACA_NEUS_ID
      WHERE a.ACA_VENTAS_CAMPANA_ID = @id ORDER BY u.NEUS_NOMBRES`, id),
  },
  {
    key: 'webphone-vistas', segmento: 'cc-detalle', nombre: 'Vistas de Webphone',
    descripcion: 'Qué marcador (vista) usa cada usuario en el Webphone (una sola por usuario). La pone el grupo de Contact Center del usuario.',
    miembroLabel: 'Usuarios', puedeCrear: false, puedeEliminar: false, unico: true, soloLectura: true, notaSoloLectura: 'Se asignan desde los Grupos de Contact Center (Configuración → Grupos)',
    listar: (pool) => q(pool, `
      SELECT v.WVIS_ID id, v.WVIS_LABEL nombre, v.WVIS_PROVIDER contexto, NULL descripcion,
             (SELECT COUNT(*) FROM WEBPHONE_ASIGNACIONES a WHERE a.WASG_VISTA_ID = v.WVIS_ID) miembros
      FROM WEBPHONE_VISTAS v ORDER BY v.WVIS_ORDEN, v.WVIS_LABEL`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM WEBPHONE_ASIGNACIONES a JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.WASG_NEUS_ID
      WHERE a.WASG_VISTA_ID = @id ORDER BY u.NEUS_NOMBRES`, id),
  },
  {
    key: 'livechat-grupos', segmento: 'cc-detalle', nombre: 'Grupos de LiveChat',
    descripcion: 'Motor de chat anterior al Omnicanal; hoy lo usa el chat de soporte TI interno. "Soporte TI - General" se sincroniza solo con los técnicos de TI disponibles.',
    miembroLabel: 'Agentes', puedeCrear: false, puedeEliminar: false,
    listar: (pool) => q(pool, `
      SELECT g.LG_ID id, g.LG_NOMBRE nombre, g.LG_DESCRIPCION descripcion, c.LCA_NOMBRE contexto,
             (SELECT COUNT(*) FROM LIVECHAT_GRUPO_AGENTES a WHERE a.LGA_GRUPO_ID = g.LG_ID AND a.LGA_ACTIVO = 1) miembros
      FROM LIVECHAT_GRUPOS g JOIN LIVECHAT_CAMPANIAS c ON c.LCA_ID = g.LG_CAMPANIA_ID
      WHERE g.LG_ACTIVO = 1 ORDER BY c.LCA_NOMBRE, g.LG_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM LIVECHAT_GRUPO_AGENTES a JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.LGA_USUARIO_ID
      WHERE a.LGA_GRUPO_ID = @id AND a.LGA_ACTIVO = 1 ORDER BY u.NEUS_NOMBRES`, id),
    agregar: async (pool, id, uids) => {
      for (const u of uids) {
        await q(pool, `MERGE LIVECHAT_GRUPO_AGENTES AS t USING (SELECT @g g, @u u) s ON t.LGA_GRUPO_ID = s.g AND t.LGA_USUARIO_ID = s.u
          WHEN MATCHED THEN UPDATE SET LGA_ACTIVO = 1 WHEN NOT MATCHED THEN INSERT (LGA_GRUPO_ID, LGA_USUARIO_ID, LGA_ACTIVO) VALUES (@g, @u, 1);`,
        { g: [sql.Int, id], u: [sql.Int, u] });
      }
    },
    quitar: (pool, id, u) => q(pool, 'UPDATE LIVECHAT_GRUPO_AGENTES SET LGA_ACTIVO = 0 WHERE LGA_GRUPO_ID = @g AND LGA_USUARIO_ID = @u',
      { g: [sql.Int, id], u: [sql.Int, u] }),
  },

  // ── Soporte TI ────────────────────────────────────────────────────────
  {
    key: 'soporte-niveles', segmento: 'soporte', nombre: 'Niveles de soporte',
    descripcion: 'Técnicos por área (TI / Soporte Técnico) y nivel. Un técnico está en un solo nivel: agregarlo a otro lo mueve. Quitarlo lo deja de considerar técnico.',
    miembroLabel: 'Técnicos', puedeCrear: false, puedeEliminar: false, unico: true,
    listar: (pool) => q(pool, `
      SELECT CONCAT(g.AREA, '-', g.NIVEL) id, g.NOMBRE nombre, CONCAT('Área ', g.AREA, ' · Nivel ', g.NIVEL) contexto, NULL descripcion,
             (SELECT COUNT(*) FROM TI_STAFF_STATUS s WHERE s.AREA = g.AREA AND ISNULL(s.NIVEL, 1) = g.NIVEL) miembros
      FROM GRUPOS_SOPORTE g ORDER BY g.AREA, g.NIVEL`),
    miembros: (pool, id) => {
      const [area, nivel] = String(id).split('-');
      return q(pool, `
        SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre, CASE WHEN s.DISPONIBLE = 1 THEN 'Disponible' ELSE 'No disponible' END extra
        FROM TI_STAFF_STATUS s JOIN NEUS_USUARIOS u ON u.NEUS_ID = s.USER_ID
        WHERE s.AREA = @a AND ISNULL(s.NIVEL, 1) = @n ORDER BY u.NEUS_NOMBRES`,
      { a: [sql.NVarChar(10), area], n: [sql.TinyInt, Number(nivel)] });
    },
    agregar: async (pool, id, uids) => {
      const [area, nivel] = String(id).split('-');
      for (const u of uids) {
        await q(pool, `MERGE TI_STAFF_STATUS AS t USING (SELECT @u u) s ON t.USER_ID = s.u
          WHEN MATCHED THEN UPDATE SET AREA = @a, NIVEL = @n
          WHEN NOT MATCHED THEN INSERT (USER_ID, AREA, DISPONIBLE, NIVEL) VALUES (@u, @a, 1, @n);`,
        { u: [sql.Int, u], a: [sql.NVarChar(10), area], n: [sql.TinyInt, Number(nivel)] });
        const disp = (await q(pool, 'SELECT DISPONIBLE d FROM TI_STAFF_STATUS WHERE USER_ID = @u', { u: [sql.Int, u] }))[0]?.d;
        await syncLivechatSoporteTI(pool, u, area === 'TI' && !!disp);
      }
    },
    quitar: async (pool, id, u) => {
      const [area, nivel] = String(id).split('-');
      await q(pool, 'DELETE FROM TI_STAFF_STATUS WHERE USER_ID = @u AND AREA = @a AND ISNULL(NIVEL, 1) = @n',
        { u: [sql.Int, u], a: [sql.NVarChar(10), area], n: [sql.TinyInt, Number(nivel)] });
      if (area === 'TI') await syncLivechatSoporteTI(pool, u, false);
    },
  },
  {
    key: 'ti-especialidades', segmento: 'soporte', nombre: 'Especialidades de técnicos',
    descripcion: 'Qué sabe atender cada técnico (Redes, CRM, Telefonía…). Las reglas de asignación de tickets las usan para elegir técnico.',
    miembroLabel: 'Técnicos', puedeCrear: true, puedeEliminar: true,
    crearCampos: ['nombre'],
    listar: (pool) => q(pool, `
      SELECT e.ESP_ID id, e.ESP_NOMBRE nombre, NULL descripcion,
             (SELECT COUNT(*) FROM TI_TECNICO_ESPECIALIDAD t WHERE t.TE_ESP_ID = e.ESP_ID) miembros
      FROM TI_ESPECIALIDADES e WHERE e.ESP_ACTIVA = 1 ORDER BY e.ESP_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre FROM TI_TECNICO_ESPECIALIDAD t JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.TE_USER_ID
      WHERE t.TE_ESP_ID = @id ORDER BY u.NEUS_NOMBRES`, id),
    agregar: async (pool, id, uids) => {
      for (const u of uids) {
        await q(pool, `IF NOT EXISTS (SELECT 1 FROM TI_TECNICO_ESPECIALIDAD WHERE TE_USER_ID = @u AND TE_ESP_ID = @e)
          INSERT INTO TI_TECNICO_ESPECIALIDAD (TE_USER_ID, TE_ESP_ID) VALUES (@u, @e)`, { u: [sql.Int, u], e: [sql.Int, id] });
      }
    },
    quitar: (pool, id, u) => q(pool, 'DELETE FROM TI_TECNICO_ESPECIALIDAD WHERE TE_USER_ID = @u AND TE_ESP_ID = @e',
      { u: [sql.Int, u], e: [sql.Int, id] }),
    crear: async (pool, d) => {
      const dup = await q(pool, 'SELECT ESP_ID id, ESP_ACTIVA a FROM TI_ESPECIALIDADES WHERE ESP_NOMBRE = @n', { n: [sql.NVarChar(100), d.nombre.slice(0, 100)] });
      if (dup[0]?.a) throw new Error('Ya existe esa especialidad');
      if (dup[0]) {
        await q(pool, 'UPDATE TI_ESPECIALIDADES SET ESP_ACTIVA = 1 WHERE ESP_ID = @id', { id: [sql.Int, dup[0].id] });
        return dup[0].id;
      }
      return (await q(pool, 'INSERT INTO TI_ESPECIALIDADES (ESP_NOMBRE) OUTPUT INSERTED.ESP_ID id VALUES (@n)', { n: [sql.NVarChar(100), d.nombre.slice(0, 100)] }))[0].id;
    },
    eliminar: (pool, id) => q(pool, 'UPDATE TI_ESPECIALIDADES SET ESP_ACTIVA = 0 WHERE ESP_ID = @id', { id: [sql.Int, id] }),
  },

  // ── Clientes y comunicación ───────────────────────────────────────────
  grupoCC({
    key: 'atencion-clientes', segmento: 'comunicacion', nombre: 'Grupos de atención a clientes',
    descripcion: 'Grupos que atienden clientes. Se crean igual que los de Contact Center (campaña, skill, comunicación, marcador y su link, supervisores y asesores) y además se les asignan sus clientes: si el cliente no tiene asesor individual, su portal chatea con el grupo y los avisos de ese cliente les llegan a sus supervisores y asesores.',
    miembroLabel: 'Asesores', atencion: true,
  }),
  {
    key: 'mensajeria-grupos', segmento: 'comunicacion', nombre: 'Grupos de Mensajería',
    descripcion: 'Chats de grupo de la Mensajería interna. Los miembros los ven en su Mensajería al momento.',
    miembroLabel: 'Miembros', puedeCrear: true, puedeEliminar: false,
    crearCampos: ['nombre', 'descripcion'],
    listar: (pool) => q(pool, `
      SELECT c.MC_ID id, c.MC_NOMBRE nombre, c.MC_DESCRIPCION descripcion,
             (SELECT COUNT(*) FROM MSJ_CANAL_MIEMBROS m WHERE m.MCM_CANAL_ID = c.MC_ID) miembros
      FROM MSJ_CANALES c WHERE c.MC_TIPO = 'grupo' ORDER BY c.MC_NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre, CASE WHEN m.MCM_ROL = 'admin' THEN 'Administrador' END extra
      FROM MSJ_CANAL_MIEMBROS m JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.MCM_USUARIO_ID
      WHERE m.MCM_CANAL_ID = @id ORDER BY CASE WHEN m.MCM_ROL = 'admin' THEN 0 ELSE 1 END, u.NEUS_NOMBRES`, id),
    agregar: async (pool, id, uids, ctx) => {
      const nuevos = [];
      for (const u of uids) {
        const r = await pool.request().input('c', sql.Int, id).input('u', sql.Int, u).query(`
          IF NOT EXISTS (SELECT 1 FROM MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @c AND MCM_USUARIO_ID = @u)
            INSERT INTO MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL) VALUES (@c, @u, 'miembro')`);
        if ((r.rowsAffected || []).some((n) => n > 0)) nuevos.push(u);
      }
      if (nuevos.length) {
        const usuarios = await q(pool, `SELECT NEUS_ID id, NEUS_NOMBRES nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${nuevos.join(',')})`);
        emitirMensajeria(ctx, nuevos, id, 'mensajeria:miembro_agregado', { canalId: Number(id), usuarios });
      }
    },
    quitar: async (pool, id, u, ctx) => {
      const admins = await q(pool, `SELECT MCM_USUARIO_ID u FROM MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @c AND MCM_ROL = 'admin'`, { c: [sql.Int, id] });
      if (admins.length === 1 && admins[0].u === Number(u)) throw new Error('Es el único administrador del grupo: agrega otro antes de quitarlo');
      await q(pool, 'DELETE FROM MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @c AND MCM_USUARIO_ID = @u', { c: [sql.Int, id], u: [sql.Int, u] });
      emitirMensajeria(ctx, [u], id, 'mensajeria:miembro_removido', { canalId: Number(id), usuarioId: Number(u) });
    },
    crear: async (pool, d, ctx) => {
      const r = await q(pool, `INSERT INTO MSJ_CANALES (MC_TIPO, MC_NOMBRE, MC_DESCRIPCION, MC_CREADO_POR) OUTPUT INSERTED.MC_ID id VALUES ('grupo', @n, @d, @por)`,
        { n: [sql.NVarChar(150), d.nombre.slice(0, 150)], d: [sql.NVarChar(500), d.descripcion?.slice(0, 500) || null], por: [sql.Int, ctx.userId] });
      await q(pool, `INSERT INTO MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL) VALUES (@c, @u, 'admin')`,
        { c: [sql.Int, r[0].id], u: [sql.Int, ctx.userId] });
      return r[0].id;
    },
  },
  {
    key: 'portal-subroles', segmento: 'comunicacion', nombre: 'Usuarios del Portal de Cliente',
    descripcion: 'Cuentas de las empresas cliente por sub-rol. Cada cliente administra las suyas desde su portal; aquí solo se consultan.',
    miembroLabel: 'Usuarios', puedeCrear: false, puedeEliminar: false, soloLectura: true,
    listar: (pool) => q(pool, `
      SELECT r.ROL_ID id, r.NOMBRE nombre, NULL descripcion,
             (SELECT COUNT(*) FROM PORTAL_USUARIOS u WHERE u.PU_SUBROL_ID = r.ROL_ID AND u.PU_ACTIVO = 1) miembros
      FROM PORTAL_ROLES r ORDER BY r.ROL_ID`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre, COALESCE(NULLIF(c.CONT_EMPRESA, ''), c.CONT_NOMBRE) extra
      FROM PORTAL_USUARIOS pu JOIN NEUS_USUARIOS u ON u.NEUS_ID = pu.PU_NEUS_ID
      LEFT JOIN CRM_CONTACTOS c ON c.CONT_ID = pu.PU_CONT_ID
      WHERE pu.PU_SUBROL_ID = @id AND pu.PU_ACTIVO = 1 ORDER BY extra, u.NEUS_NOMBRES`, id),
  },

  // ── Acceso ────────────────────────────────────────────────────────────
  {
    key: 'roles', segmento: 'acceso', nombre: 'Roles',
    descripcion: 'Usuarios por rol base. El rol se cambia desde Usuarios y sus permisos desde Roles; aquí solo se consultan.',
    miembroLabel: 'Usuarios', puedeCrear: false, puedeEliminar: false, soloLectura: true,
    listar: (pool) => q(pool, `
      SELECT r.ROL_ID id, r.NOMBRE nombre, r.DESCRIPCION descripcion, CONCAT('Rol base ', r.ROL_BASE) contexto,
             (SELECT COUNT(*) FROM NEUS_USUARIOS u WHERE u.NEUS_ACTIVO = 1 AND u.NEUS_TIPOUSUARIO = r.ROL_BASE) miembros
      FROM INTRANET_ROLES r WHERE r.ACTIVO = 1 ORDER BY r.ES_SISTEMA DESC, r.NOMBRE`),
    miembros: (pool, id) => miembrosSql(pool, `
      SELECT u.NEUS_ID usuarioId, u.NEUS_NOMBRES nombre, u.NEUS_PUESTO extra FROM NEUS_USUARIOS u
      JOIN INTRANET_ROLES r ON r.ROL_BASE = u.NEUS_TIPOUSUARIO
      WHERE r.ROL_ID = @id AND u.NEUS_ACTIVO = 1 ORDER BY u.NEUS_NOMBRES`, id),
  },
];

const porKey = Object.fromEntries(TIPOS.map((t) => [t.key, t]));

// Datos públicos de un tipo (sin las funciones).
function descriptor(t) {
  return {
    key: t.key, segmento: t.segmento, nombre: t.nombre, descripcion: t.descripcion, miembroLabel: t.miembroLabel,
    puedeCrear: !!t.crear, puedeEliminar: !!t.eliminar, puedeEditarMiembros: !t.soloLectura && !!t.agregar, notaSoloLectura: t.notaSoloLectura || null,
    unico: !!t.unico, crearCampos: t.crearCampos || [], conClientes: !!t.clientes, conConfig: !!t.config, conEnlaces: !!t.enlaces,
  };
}

module.exports = { SEGMENTOS, TIPOS, porKey, descriptor, ids, catalogoNuevoGrupo };
