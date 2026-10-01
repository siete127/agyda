const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { porKey, ids, catalogoNuevoGrupo } = require('../services/gruposService');
const { getEmpresaModulosBloqueados, getUserAllowedActions, esSuperAdminFijo } = require('../middleware/moduleAccess');
const { listarPlantillas, crearReportesDeGrupo } = require('../services/reportBuilderPlantillas');

// Asistente "Crear grupo" (portada de Configuración). Igual que "Crear
// empresa": todo lo capturado es un BORRADOR (INTRANET_GRUPOS_BORRADORES, en
// la BD de la empresa) que se guarda solo, y el grupo se crea al final con
// todo configurado, reutilizando el adaptador del tipo en gruposService (las
// mismas tablas y reglas que Configuración → Grupos). Cada etapa se puede
// repetir sin duplicar (el grupo se guarda en BOR_GRUPO_ID en cuanto existe),
// así que una creación interrumpida se continúa.
//
// Funciona en CUALQUIER empresa, también en las que se creen después, siempre
// que tenga activos los módulos que el asistente usa (REQUISITOS). Lo opcional
// (atención a clientes, marcador) solo se ofrece si su módulo está activo.

const REQUISITOS = {
  base: [{ key: 'contact-center', nombre: 'Contact Center' }, { key: 'usuarios', nombre: 'Usuarios' }],
  atencion: [{ key: 'atencion-cliente', nombre: 'Atención al Cliente' }],
  marcador: [{ key: 'webphone', nombre: 'Webphone' }],
  // Reportes del grupo (plantillas del constructor) en la Suite de reportes.
  reportes: [{ key: 'operaciones', nombre: 'Suite de reportes' }],
};
const TIPOS_ASISTENTE = ['cc-equipos', 'atencion-clientes'];
const enProceso = new Set();

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = (s, def) => { try { return s ? JSON.parse(s) : def; } catch (_) { return def; } };
const uid = (req) => parseInt(req.user && (req.user.id || req.user.sub || req.user.userId)) || null;
const poolDe = (req) => databaseService.getPool(req.user?.empresa);
function responderError(res, e, contexto) {
  if (!e.status) console.error(`[grupo-asistente] ${contexto}:`, e);
  return res.status(e.status || 500).json({ success: false, message: e.message });
}
const auditar = async (req, accion, entidad, detalle) => {
  try {
    await logAudit(await poolDe(req), { userId: uid(req), userName: req.user?.nombre || null, modulo: 'usuarios', accion: `asistente-grupo-${accion}`, entidadId: String(entidad ?? ''), detalle, ip: req.ip });
  } catch (_) { /* no bloquea */ }
};

// Qué módulos tiene la empresa y si el usuario puede crear grupos
// (mismo permiso que Configuración → Grupos: AD/TI con "editar" usuarios).
async function disponibilidad(req) {
  const bloqueados = await getEmpresaModulosBloqueados(req.user?.empresa);
  const faltan = REQUISITOS.base.filter((m) => bloqueados.has(m.key));
  let permiso = esSuperAdminFijo(req);
  if (!permiso) {
    const rol = String(req.user?.tipoUsuario || '').toUpperCase();
    if (['AD', 'TI'].includes(rol)) {
      const acciones = await getUserAllowedActions(uid(req), 'usuarios', req.user?.empresa);
      permiso = acciones.has('*') || acciones.has('editar');
    }
  }
  return {
    permiso,
    faltan,
    disponible: permiso && faltan.length === 0,
    atencion: !REQUISITOS.atencion.some((m) => bloqueados.has(m.key)),
    marcador: !REQUISITOS.marcador.some((m) => bloqueados.has(m.key)),
    reportes: !REQUISITOS.reportes.some((m) => bloqueados.has(m.key)),
  };
}

// Middleware de las rutas del asistente.
exports.requireAsistente = (req, res, next) => {
  disponibilidad(req).then((d) => {
    if (!d.permiso) return res.status(403).json({ success: false, message: 'No tienes permiso para crear grupos' });
    if (d.faltan.length) return res.status(403).json({ success: false, message: `La empresa no tiene activo: ${d.faltan.map((m) => m.nombre).join(', ')}` });
    req.disponibilidadGrupos = d;
    next();
  }).catch((e) => responderError(res, e, 'requireAsistente'));
};

// GET /disponible — para la tarjeta de Configuración
exports.disponible = async (req, res) => {
  try { res.json({ success: true, data: await disponibilidad(req) }); } catch (e) { responderError(res, e, 'disponible'); }
};

// GET /catalogo — campañas (con skills y formularios), marcadores, campañas de
// ventas, usuarios y clientes para capturar el grupo antes de crearlo.
exports.catalogo = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const cat = await catalogoNuevoGrupo(pool);
    const usuarios = (await pool.request().query(`SELECT NEUS_ID id, NEUS_NOMBRES nombre, NEUS_TIPOUSUARIO tipo, NEUS_PUESTO puesto
      FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 AND NEUS_TIPOUSUARIO <> 'CL' ORDER BY NEUS_NOMBRES`)).recordset;
    const d = req.disponibilidadGrupos;
    // Clientes con el grupo de atención que ya los atiende (asignarlos aquí los mueve).
    const clientes = d.atencion ? (await pool.request().query(`
      SELECT c.CONT_ID id, COALESCE(NULLIF(c.CONT_EMPRESA, ''), c.CONT_NOMBRE) nombre, e.EQ_NOMBRE grupo
      FROM CRM_CONTACTOS c
      LEFT JOIN CC_EQUIPO_CLIENTES gc ON gc.EQCL_CONT_ID = c.CONT_ID
      LEFT JOIN CC_EQUIPOS e ON e.EQ_ID = gc.EQCL_EQUIPO_ID AND e.EQ_ACTIVO = 1
      WHERE c.CONT_ES_CLIENTE = 1 AND c.CONT_ACTIVO = 1 ORDER BY nombre`).catch(() => ({ recordset: [] }))).recordset : [];
    // Plantillas de reportes que se pueden crear con el grupo (sin la definición: basta el boceto).
    const plantillasReportes = d.reportes
      ? listarPlantillas().map(({ definicion, ...p }) => ({
        ...p, tipoVisual: definicion.visual?.tipo || 'tabla',
        series: definicion.dimensiones.length === 2 ? 3 : definicion.metricas.length,
      }))
      : [];
    res.json({ success: true, data: { ...cat, usuarios, clientes, atencion: d.atencion, marcador: d.marcador, reportes: d.reportes, plantillasReportes } });
  } catch (e) {
    responderError(res, e, 'catalogo');
  }
};

// ── Validación ───────────────────────────────────────────────────────────────
function pendientesDe(d = {}, disp = { atencion: true, marcador: true }) {
  const p = [];
  const atencion = d.tipo === 'atencion-clientes';
  const modalidad = ['omnicanal', 'marcador', 'ambos'].includes(d.modalidad) ? d.modalidad : 'omnicanal';
  if (!TIPOS_ASISTENTE.includes(d.tipo)) p.push({ paso: 'grupo', texto: 'Elige el tipo de grupo' });
  if (atencion && !disp.atencion) p.push({ paso: 'grupo', texto: 'La empresa no tiene activo Atención al Cliente' });
  if (!String(d.nombre || '').trim()) p.push({ paso: 'grupo', texto: 'Falta el nombre del grupo' });
  const campanias = Array.isArray(d.campanias) ? d.campanias : [];
  if (!campanias.length) p.push({ paso: 'asignaciones', texto: 'Asigna al menos una campaña' });
  if (modalidad !== 'omnicanal' && !disp.marcador) p.push({ paso: 'asignaciones', texto: 'La empresa no tiene activo Webphone: usa Omnicanal' });
  if (modalidad !== 'marcador' && !(Array.isArray(d.skillIds) && d.skillIds.length)) p.push({ paso: 'asignaciones', texto: 'Elige al menos un skill para el omnicanal' });
  if (modalidad !== 'omnicanal' && !(Number(d.webphoneVistaId) > 0)) p.push({ paso: 'asignaciones', texto: 'Elige el marcador del grupo' });
  const sup = (d.supervisores || []).map((x) => Number(x.usuarioId));
  const ag = (d.agentes || []).map((x) => Number(x.usuarioId));
  if (!sup.length) p.push({ paso: 'personas', texto: 'Falta al menos un supervisor' });
  if (!ag.length) p.push({ paso: 'personas', texto: `Falta al menos un ${atencion ? 'asesor' : 'agente'}` });
  if (sup.some((u) => ag.includes(u))) p.push({ paso: 'personas', texto: 'Una persona no puede ser supervisor y agente a la vez' });
  if (atencion && !(d.clientes || []).length) p.push({ paso: 'clientes', texto: 'Asigna al menos un cliente' });
  return p;
}

// ── Borradores ───────────────────────────────────────────────────────────────
function filaABorrador(r, req, conDatos = false) {
  const datos = parse(r.BOR_DATOS, {});
  return {
    id: r.BOR_ID, tipo: r.BOR_TIPO, nombre: r.BOR_NOMBRE, paso: r.BOR_PASO, estado: r.BOR_ESTADO, grupoId: r.BOR_GRUPO_ID,
    usuarioNombre: r.BOR_USUARIO_NOMBRE, esMio: r.BOR_USUARIO_ID === uid(req), actualizado: r.BOR_ACTUALIZADO,
    interrumpido: r.BOR_ESTADO === 'creando' && !enProceso.has(r.BOR_ID),
    avance: parse(r.BOR_AVANCE, null), error: r.BOR_ERROR,
    resumen: { campanias: (datos.campanias || []).length, supervisores: (datos.supervisores || []).length, agentes: (datos.agentes || []).length, clientes: (datos.clientes || []).length, reportes: (datos.reportes || []).length },
    ...(conDatos ? { datos, pendientes: pendientesDe(datos, req.disponibilidadGrupos) } : {}),
  };
}
async function leerBorrador(pool, id) {
  const rs = await pool.request().input('id', sql.Int, Number(id)).query('SELECT * FROM dbo.INTRANET_GRUPOS_BORRADORES WHERE BOR_ID=@id');
  if (!rs.recordset.length) throw err('Borrador no encontrado', 404);
  return rs.recordset[0];
}
async function actualizar(pool, id, campos) {
  const r = pool.request().input('id', sql.Int, id);
  const sets = ['BOR_ACTUALIZADO=GETDATE()'];
  for (const [col, val] of Object.entries(campos)) {
    if (col === 'BOR_GRUPO_ID' || col === 'BOR_PASO') r.input(col, sql.Int, val);
    else r.input(col, sql.NVarChar, val === null || val === undefined ? null : (typeof val === 'string' ? val : JSON.stringify(val)));
    sets.push(`${col}=@${col}`);
  }
  await r.query(`UPDATE dbo.INTRANET_GRUPOS_BORRADORES SET ${sets.join(', ')} WHERE BOR_ID=@id`);
}

exports.listar = async (req, res) => {
  try {
    const rs = await (await poolDe(req)).request()
      .query(`SELECT * FROM dbo.INTRANET_GRUPOS_BORRADORES WHERE BOR_ESTADO IN ('borrador','creando','error','creado') ORDER BY BOR_ACTUALIZADO DESC`);
    res.json({ success: true, data: rs.recordset.map((r) => filaABorrador(r, req)) });
  } catch (e) { responderError(res, e, 'listar'); }
};

exports.leer = async (req, res) => {
  try { res.json({ success: true, data: filaABorrador(await leerBorrador(await poolDe(req), req.params.id), req, true) }); } catch (e) { responderError(res, e, 'leer'); }
};

exports.crearBorrador = async (req, res) => {
  try {
    const datos = req.body?.datos || {};
    const rs = await (await poolDe(req)).request()
      .input('uid', sql.Int, uid(req)).input('un', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .input('t', sql.NVarChar, TIPOS_ASISTENTE.includes(datos.tipo) ? datos.tipo : 'cc-equipos')
      .input('n', sql.NVarChar, String(datos.nombre || '').trim() || null)
      .input('d', sql.NVarChar, JSON.stringify(datos)).input('p', sql.Int, Number(req.body?.paso) || 0)
      .query(`INSERT INTO dbo.INTRANET_GRUPOS_BORRADORES (BOR_USUARIO_ID, BOR_USUARIO_NOMBRE, BOR_TIPO, BOR_NOMBRE, BOR_DATOS, BOR_PASO)
              VALUES (@uid, @un, @t, @n, @d, @p); SELECT SCOPE_IDENTITY() AS id;`);
    res.status(201).json({ success: true, data: { id: Number(rs.recordset[0].id) } });
  } catch (e) { responderError(res, e, 'crearBorrador'); }
};

exports.guardar = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const r = await leerBorrador(pool, req.params.id);
    if (!['borrador', 'error'].includes(r.BOR_ESTADO)) throw err('Este grupo ya se está creando; no se puede editar', 409);
    const datos = req.body?.datos || {};
    // Si el grupo ya existe (creación interrumpida), su tipo ya no cambia.
    if (r.BOR_GRUPO_ID) datos.tipo = r.BOR_TIPO;
    await actualizar(pool, r.BOR_ID, {
      BOR_TIPO: TIPOS_ASISTENTE.includes(datos.tipo) ? datos.tipo : r.BOR_TIPO,
      BOR_NOMBRE: String(datos.nombre || '').trim() || null, BOR_DATOS: datos, BOR_PASO: Number(req.body?.paso) || 0,
    });
    res.json({ success: true, data: { pendientes: pendientesDe(datos, req.disponibilidadGrupos) } });
  } catch (e) { responderError(res, e, 'guardar'); }
};

exports.descartar = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const r = await leerBorrador(pool, req.params.id);
    // Un borrador de actualización sí se descarta: el grupo ya existía y queda como estaba.
    if (r.BOR_GRUPO_ID && parse(r.BOR_AVANCE, {})?.modo !== 'actualizar') throw err('El grupo ya se creó; continúa la creación para terminarlo (o elimínalo en Configuración → Grupos)', 409);
    await pool.request().input('id', sql.Int, r.BOR_ID).query('DELETE FROM dbo.INTRANET_GRUPOS_BORRADORES WHERE BOR_ID=@id');
    await auditar(req, 'borrador-descartar', r.BOR_ID, { nombre: r.BOR_NOMBRE });
    res.json({ success: true });
  } catch (e) { responderError(res, e, 'descartar'); }
};

exports.terminar = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const r = await leerBorrador(pool, req.params.id);
    if (r.BOR_ESTADO !== 'creado') throw err('El grupo todavía no termina de crearse', 409);
    await actualizar(pool, r.BOR_ID, { BOR_ESTADO: 'terminado' });
    res.json({ success: true });
  } catch (e) { responderError(res, e, 'terminar'); }
};

// GET /personas-de-campanias?campanias=1,2&ventas=1 — la gente que esas
// campañas ya tienen, para cargarla sola en el paso 3 ("Supervisores y
// agentes"): supervisores de las campañas; agentes de sus skills y, si hay
// campaña de Ventas, los agentes asignados a ella (Operaciones → Campañas).
// Solo usuarios internos activos; quien es supervisor no se repite como agente.
exports.personasDeCampanias = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const camp = ids(String(req.query.campanias || '').split(','));
    const ventas = Number(req.query.ventas) > 0 ? Number(req.query.ventas) : null;
    if (!camp.length && !ventas) return res.json({ success: true, data: { supervisores: [], agentes: [] } });
    const enCamp = camp.length ? camp.join(',') : '0';
    const activos = `JOIN NEUS_USUARIOS u ON u.NEUS_ID = x.u AND u.NEUS_ACTIVO = 1 AND u.NEUS_TIPOUSUARIO <> 'CL'`;
    const supervisores = (await pool.request().query(`
      SELECT DISTINCT u.NEUS_ID usuarioId, LTRIM(RTRIM(u.NEUS_NOMBRES)) nombre FROM (
        SELECT CS_SUPERVISOR_ID u FROM CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID IN (${enCamp})) x ${activos}`)
      .catch(() => ({ recordset: [] }))).recordset;
    const agentes = (await pool.request().input('v', sql.Int, ventas).query(`
      SELECT DISTINCT u.NEUS_ID usuarioId, LTRIM(RTRIM(u.NEUS_NOMBRES)) nombre FROM (
        SELECT ga.CGA_USUARIO_ID u FROM CCO_GRUPO_AGENTES ga JOIN CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID AND g.CG_ACTIVO = 1
        WHERE ga.CGA_ACTIVO = 1 AND g.CG_CAMPANIA_ID IN (${enCamp})
        UNION SELECT ACA_NEUS_ID FROM AC_CAMPANIAS_AGENTES WHERE @v IS NOT NULL AND ACA_VENTAS_CAMPANA_ID = @v) x ${activos}`)
      .catch(() => ({ recordset: [] }))).recordset;
    const sup = new Set(supervisores.map((s) => s.usuarioId));
    const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    res.json({ success: true, data: { supervisores: supervisores.sort(orden), agentes: agentes.filter((a) => !sup.has(a.usuarioId)).sort(orden) } });
  } catch (e) { responderError(res, e, 'personasDeCampanias'); }
};

// POST /desde-campania — { tipo: 'cc' | 'ventas', id }. Para "Editar campaña"
// desde Operaciones → Campañas: busca el grupo que ya la usa y abre su
// configuración actual como BORRADOR de actualización (BOR_GRUPO_ID = ese
// grupo, avance.modo = 'actualizar'); al "crear" se aplica sobre ese grupo.
// Si el usuario ya tenía un borrador abierto de ese grupo, se retoma.
// Sin grupo: { borradorId: null } y el asistente arranca uno nuevo con la campaña.
exports.desdeCampania = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const tipo = req.body?.tipo === 'ventas' ? 'ventas' : 'cc';
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id < 1) throw err('Campaña inválida');
    const grupos = (await pool.request().input('c', sql.Int, id).query(tipo === 'ventas'
      ? `SELECT EQ_ID id, EQ_NOMBRE nombre, EQ_DESCRIPCION descripcion, CAST(ISNULL(EQ_ATIENDE_CLIENTES, 0) AS bit) atiende
         FROM CC_EQUIPOS WHERE EQ_ACTIVO = 1 AND EQ_VENTAS_CAMPANA_ID = @c ORDER BY EQ_ID`
      : `SELECT e.EQ_ID id, e.EQ_NOMBRE nombre, e.EQ_DESCRIPCION descripcion, CAST(ISNULL(e.EQ_ATIENDE_CLIENTES, 0) AS bit) atiende
         FROM CC_EQUIPOS e WHERE e.EQ_ACTIVO = 1 AND (e.EQ_CAMPANIA_ID = @c
           OR EXISTS (SELECT 1 FROM CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID AND ec.EQC_CAMPANIA_ID = @c))
         ORDER BY e.EQ_ID`)).recordset;
    if (!grupos.length) return res.json({ success: true, data: { borradorId: null, grupo: null, otros: [] } });
    const g = grupos[0];
    const otros = grupos.slice(1).map((x) => x.nombre);

    const r = await borradorDeGrupo(req, pool, g, null, { campania: { tipo, id } });
    res.status(r.retomado ? 200 : 201).json({ success: true, data: { ...r, otros } });
  } catch (e) { responderError(res, e, 'desdeCampania'); }
};

// POST /desde-grupo/:grupoId — { agregar?: { tipo: 'cc' | 'ventas', id } }.
// Después de crear una campaña: abre ese grupo como borrador de cambios (o
// retoma el abierto) con la campaña ya agregada — la de Contact Center a sus
// campañas, la de Ventas como su campaña de Ventas. Al guardar se aplica.
exports.desdeGrupo = async (req, res) => {
  try {
    const pool = await poolDe(req);
    const g = (await pool.request().input('g', sql.Int, Number(req.params.grupoId)).query(`
      SELECT EQ_ID id, EQ_NOMBRE nombre, EQ_DESCRIPCION descripcion, CAST(ISNULL(EQ_ATIENDE_CLIENTES, 0) AS bit) atiende
      FROM CC_EQUIPOS WHERE EQ_ID = @g AND EQ_ACTIVO = 1`)).recordset[0];
    if (!g) throw err('Grupo no encontrado', 404);
    const a = req.body?.agregar;
    const agregar = a && ['cc', 'ventas'].includes(a.tipo) && Number(a.id) > 0 ? { tipo: a.tipo, id: Number(a.id) } : null;
    const r = await borradorDeGrupo(req, pool, g, agregar, { agregar });
    res.status(r.retomado ? 200 : 201).json({ success: true, data: { ...r, otros: [] } });
  } catch (e) { responderError(res, e, 'desdeGrupo'); }
};

// Borrador de cambios ("actualizar") de un grupo existente con su
// configuración actual; si el usuario ya tenía uno abierto de ese grupo, lo
// retoma. `agregar` mete una campaña al borrador (sin guardarla en el grupo).
async function borradorDeGrupo(req, pool, g, agregar, detalleAuditoria) {
  const meter = (datos) => {
    if (!agregar) return datos;
    if (agregar.tipo === 'ventas') return { ...datos, ventasCampanaId: agregar.id };
    return (datos.campanias || []).some((c) => c.id === agregar.id) ? datos
      : { ...datos, campanias: [...(datos.campanias || []), { id: agregar.id, formularioId: null }] };
  };
  const abierto = (await pool.request().input('g', sql.Int, g.id).input('u', sql.Int, uid(req)).query(`
    SELECT TOP 1 BOR_ID id, BOR_DATOS datos FROM dbo.INTRANET_GRUPOS_BORRADORES
    WHERE BOR_GRUPO_ID = @g AND BOR_USUARIO_ID = @u AND BOR_ESTADO IN ('borrador', 'error') ORDER BY BOR_ACTUALIZADO DESC`)).recordset[0];
  if (abierto) {
    if (agregar) await actualizar(pool, abierto.id, { BOR_DATOS: meter(parse(abierto.datos, {})), BOR_PASO: 1 });
    return { borradorId: abierto.id, grupo: { id: g.id, nombre: g.nombre }, retomado: true };
  }

  const tipoGrupo = g.atiende ? 'atencion-clientes' : 'cc-equipos';
  const t = porKey[tipoGrupo];
  const cfg = await t.config.leer(pool, g.id);
  const agentes = await t.miembros(pool, g.id);
  const clientes = g.atiende && t.clientes ? await t.clientes(pool, g.id) : [];
  let datos = {
    tipo: tipoGrupo, nombre: g.nombre, descripcion: g.descripcion || '',
    campanias: cfg.campanias.filter((c) => c.asignada).map((c) => ({ id: c.id, formularioId: c.formularioId ?? null })),
    modalidad: cfg.modalidad || 'omnicanal',
    skillIds: cfg.skillIds || [],
    webphoneVistaId: cfg.webphoneVistaId || null,
    ventasCampanaId: cfg.ventasCampanaId || null,
    supervisores: (cfg.supervisores || []).map((s) => ({ usuarioId: s.usuarioId, nombre: s.nombre })),
    agentes: agentes.map((a) => ({ usuarioId: a.usuarioId, nombre: a.nombre })),
    clientes: clientes.map((c) => ({ clienteId: c.usuarioId ?? c.clienteId, nombre: c.nombre })),
    reportes: [], // sus reportes ya existen; solo se crean los que se elijan de nuevo
  };
  // Su gente ya es la del grupo: el paso 3 no agrega a nadie solo, salvo que
  // cambien las campañas (misma clave que clavePersonasDe del front).
  datos.personasCargadas = `${datos.campanias.map((c) => c.id).sort((a, b) => a - b).join(',')}|${datos.ventasCampanaId ?? ''}`;
  // La campaña nueva entra después de fijar la clave: así el paso 3 sí trae a su gente.
  datos = meter(datos);
  const rs = await pool.request()
    .input('uid', sql.Int, uid(req)).input('un', sql.NVarChar, req.user?.nombre || req.user?.username || null)
    .input('t', sql.NVarChar, tipoGrupo).input('n', sql.NVarChar, g.nombre)
    .input('d', sql.NVarChar, JSON.stringify(datos)).input('g', sql.Int, g.id)
    .input('a', sql.NVarChar, JSON.stringify({ completadas: ['grupo'], modo: 'actualizar' }))
    .query(`INSERT INTO dbo.INTRANET_GRUPOS_BORRADORES (BOR_USUARIO_ID, BOR_USUARIO_NOMBRE, BOR_TIPO, BOR_NOMBRE, BOR_DATOS, BOR_PASO, BOR_GRUPO_ID, BOR_AVANCE)
            VALUES (@uid, @un, @t, @n, @d, 1, @g, @a); SELECT SCOPE_IDENTITY() AS id;`);
  await auditar(req, 'borrador-desde-grupo', g.id, detalleAuditoria);
  return { borradorId: Number(rs.recordset[0].id), grupo: { id: g.id, nombre: g.nombre } };
}

// POST /borradores/:id/crear — crea (o continúa creando) el grupo con todo.
// Tarda segundos, así que corre dentro de la petición; cada etapa queda en
// BOR_AVANCE por si se interrumpe.
exports.crearGrupo = async (req, res) => {
  const pool = await poolDe(req).catch(() => null);
  if (!pool) return res.status(500).json({ success: false, message: 'Sin conexión a la base de datos' });
  let borId = null;
  try {
    const r = await leerBorrador(pool, req.params.id);
    borId = r.BOR_ID;
    if (enProceso.has(borId)) throw err('Este grupo se está creando en este momento', 409);
    if (!['borrador', 'error', 'creando'].includes(r.BOR_ESTADO)) throw err('Este grupo ya se creó', 409);
    const datos = parse(r.BOR_DATOS, {});
    const pendientes = pendientesDe(datos, req.disponibilidadGrupos);
    if (pendientes.length) return res.status(400).json({ success: false, message: 'Falta completar datos antes de crear el grupo', pendientes });

    enProceso.add(borId);
    const t = porKey[datos.tipo];
    const ctx = { tenantKey: req.user?.empresa, userId: uid(req) };
    const avance = parse(r.BOR_AVANCE, null) || { completadas: [] };
    const etapa = async (nombre, fn) => {
      if (avance.completadas.includes(nombre) && nombre !== 'config') return; // config se reaplica (es idempotente)
      avance.etapa = nombre;
      await actualizar(pool, borId, { BOR_ESTADO: 'creando', BOR_AVANCE: avance, BOR_ERROR: null });
      await fn();
      if (!avance.completadas.includes(nombre)) avance.completadas.push(nombre);
      await actualizar(pool, borId, { BOR_AVANCE: avance });
    };

    // 1. El grupo (una sola vez).
    let grupoId = r.BOR_GRUPO_ID;
    await etapa('grupo', async () => {
      if (grupoId) return;
      grupoId = await t.crear(pool, { nombre: String(datos.nombre).trim(), descripcion: String(datos.descripcion || '').trim() || null }, ctx);
      await actualizar(pool, borId, { BOR_GRUPO_ID: grupoId });
    });

    // Actualizar un grupo existente (borrador abierto con "Editar campaña"):
    // su nombre/descripción y quitar a quien ya no esté (antes de reasignar
    // papeles, así alguien puede pasar de agente a supervisor o al revés).
    const actualizando = avance.modo === 'actualizar';
    if (actualizando) {
      await etapa('datos', async () => {
        await pool.request().input('id', sql.Int, grupoId)
          .input('n', sql.NVarChar(120), String(datos.nombre).trim().slice(0, 120))
          .input('d', sql.NVarChar(300), String(datos.descripcion || '').trim().slice(0, 300) || null)
          .query('UPDATE CC_EQUIPOS SET EQ_NOMBRE = @n, EQ_DESCRIPCION = @d WHERE EQ_ID = @id');
      });
      await etapa('quitar', async () => {
        const quedan = new Set(ids((datos.agentes || []).map((a) => a.usuarioId)));
        for (const m of await t.miembros(pool, grupoId)) {
          if (!quedan.has(Number(m.usuarioId))) await t.quitar(pool, grupoId, Number(m.usuarioId), ctx);
        }
        if (datos.tipo === 'atencion-clientes' && t.clientes) {
          const siguen = new Set(ids((datos.clientes || []).map((c) => c.clienteId)));
          for (const c of await t.clientes(pool, grupoId)) {
            if (!siguen.has(Number(c.clienteId))) await t.quitarCliente(pool, grupoId, Number(c.clienteId), ctx);
          }
        }
      });
    }

    // 2. Campañas, skills, comunicación, marcador y supervisores (reemplaza, no duplica).
    const modalidad = ['omnicanal', 'marcador', 'ambos'].includes(datos.modalidad) ? datos.modalidad : 'omnicanal';
    let resultado = null;
    await etapa('config', async () => {
      resultado = await t.config.guardar(pool, grupoId, {
        campanias: datos.campanias, modalidad,
        skillIds: modalidad === 'marcador' ? [] : datos.skillIds,
        supervisorIds: (datos.supervisores || []).map((s) => s.usuarioId),
        webphoneVistaId: modalidad === 'omnicanal' ? null : datos.webphoneVistaId,
        ventasCampanaId: datos.ventasCampanaId || null,
      }, ctx);
    });

    // 3. Agentes (solo usuarios internos activos; los que ya estén no se repiten).
    await etapa('agentes', async () => {
      const pedidos = ids((datos.agentes || []).map((a) => a.usuarioId));
      if (!pedidos.length) return;
      const validos = (await pool.request().query(`SELECT NEUS_ID id FROM NEUS_USUARIOS
        WHERE NEUS_ACTIVO = 1 AND NEUS_TIPOUSUARIO <> 'CL' AND NEUS_ID IN (${pedidos.join(',')})`)).recordset.map((x) => x.id);
      if (validos.length) await t.agregar(pool, grupoId, validos, ctx);
      avance.agentesOmitidos = pedidos.length - validos.length;
    });

    // 4. Clientes (grupos de atención).
    if (datos.tipo === 'atencion-clientes') {
      await etapa('clientes', async () => {
        const pedidos = ids((datos.clientes || []).map((c) => c.clienteId));
        if (!pedidos.length) return;
        const validos = (await pool.request().query(`SELECT CONT_ID id FROM CRM_CONTACTOS WHERE CONT_ES_CLIENTE = 1 AND CONT_ID IN (${pedidos.join(',')})`)).recordset.map((x) => x.id);
        if (validos.length) await t.agregarClientes(pool, grupoId, validos, ctx);
      });
    }

    // 5. Reportes del grupo en la Suite (copias de plantillas ajustadas al grupo).
    const plantillaIds = Array.isArray(datos.reportes) ? datos.reportes.map(String) : [];
    if (req.disponibilidadGrupos?.reportes && plantillaIds.length) {
      await etapa('reportes', async () => {
        // Se requiere aquí para no cargar el controlador de operaciones al iniciar este.
        const { asegurarTablasSuite } = require('./operacionesController');
        avance.reportes = await crearReportesDeGrupo(pool, {
          grupo: { id: grupoId, nombre: String(datos.nombre).trim(), modalidad },
          plantillaIds,
          usuario: { id: uid(req), nombre: req.user?.nombre || req.user?.username || null },
          asegurarTablas: asegurarTablasSuite,
        });
      });
    }

    avance.etapa = 'listo';
    avance.resultado = resultado;
    await actualizar(pool, borId, { BOR_ESTADO: 'creado', BOR_AVANCE: avance, BOR_ERROR: null });
    await auditar(req, actualizando ? 'actualizar' : 'crear', grupoId, { borrador: borId, tipo: datos.tipo, nombre: datos.nombre });
    res.json({ success: true, data: { grupoId, resultado } });
  } catch (e) {
    if (borId && !e.status) await actualizar(pool, borId, { BOR_ESTADO: 'error', BOR_ERROR: e.message }).catch(() => {});
    responderError(res, e, 'crearGrupo');
  } finally {
    if (borId) enProceso.delete(borId);
  }
};

exports.pendientesDe = pendientesDe;
exports.REQUISITOS = REQUISITOS;
