const sql = require('mssql');
const crypto = require('crypto');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { getIO } = require('../services/socketService');
const { DEFAULT_TENANT, listTenants } = require('../config/tenants');
const { puedeGestionarEmpresas } = require('../utils/gestionEmpresas');
const { validarPoliticaPassword } = require('../utils/passwordPolicy');
const { getEmpresaModulosBloqueados, invalidateEmpresaModulosCache } = require('../middleware/moduleAccess');
const creacion = require('../services/empresaCreacionService');
const logger = global.logger || require('../utils/logger');

// Asistente "Crear empresa" (Configuración).
//
// Todo lo que se captura (empresa, módulos, roles, perfiles, usuarios) es un
// BORRADOR (INTRANET_EMPRESAS_BORRADORES, BD maestra) que se guarda solo
// mientras se avanza. No se crea nada hasta "Crear empresa": ahí un proceso en
// segundo plano crea la BD y aplica todo en orden, registrando cada etapa en
// BOR_AVANCE. Cada etapa es idempotente (busca antes de crear), así que si se
// interrumpe (error, reinicio, se cerró la ventana) "Continuar" la retoma sin
// duplicar nada.
//
// Las escrituras van DIRECTO a la BD de la empresa nueva: los endpoints de
// roles/usuarios resuelven empresa y permisos con el usuario de la sesión, y
// cada empresa numera sus usuarios desde 1. El único permiso que cuenta es
// accesos/crear-empresas en Ardaby Tec (requireGestionEmpresas en la ruta).

const accesoCtrl = () => require('./accesoController');
const rolCtrl = () => require('./rolController');

// "Contact Center" = lo que tienen activo hoy las empresas cliente (Fuzion
// Contact, Santillana, EdoMex, CxN070) + Accesos.
const PLANTILLAS = [
  {
    key: 'contact-center', nombre: 'Contact Center',
    descripcion: 'La configuración que usan hoy las empresas cliente: agentes atendiendo por Contact Center y Webphone.',
    modulos: ['noticias', 'usuarios', 'contact-center', 'mensajeria', 'webphone', 'configuracion', 'accesos'],
  },
  { key: 'completa', nombre: 'Completa', descripcion: 'Todos los módulos del sistema, como Ardaby Tec.', modulos: '*' },
  { key: 'manual', nombre: 'A mano', descripcion: 'Empieza sin módulos y marca uno por uno.', modulos: [] },
];

const ETAPAS = ['empresa', 'esquema', 'modulos', 'roles', 'perfiles', 'usuarios'];
const ESTADOS_ABIERTOS = ['borrador', 'creando', 'error', 'creada'];
const enProceso = new Set(); // borradores cuya creación corre en este proceso

function responderError(res, e, contexto) {
  if (!e.status) console.error(`[empresa-asistente] ${contexto}:`, e);
  return res.status(e.status || 500).json({ success: false, message: e.message });
}
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = (s, def) => { try { return s ? JSON.parse(s) : def; } catch (_) { return def; } };
const uid = (req) => parseInt(req.user && (req.user.id || req.user.sub || req.user.userId)) || null;

async function master() { return databaseService.getPool(DEFAULT_TENANT); }

async function auditar(req, accion, entidad, detalle) {
  try {
    await logAudit(await master(), {
      userId: uid(req), userName: req.user?.nombre || null,
      modulo: 'accesos', accion: `asistente-empresa-${accion}`, entidadId: entidad, detalle, ip: req.ip,
    });
  } catch (_) { /* la auditoría no bloquea */ }
}

function passwordTemporal() {
  const may = 'ABCDEFGHJKLMNPQRSTUVWXYZ', min = 'abcdefghijkmnpqrstuvwxyz', dig = '23456789', esp = '#$%&*+?!';
  const todos = may + min + dig + esp;
  const pick = (s) => s[crypto.randomInt(s.length)];
  for (;;) {
    const chars = [pick(may), pick(min), pick(dig), pick(esp)];
    while (chars.length < 12) chars.push(pick(todos));
    for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    const p = chars.join('');
    if (!validarPoliticaPassword(p)) return p;
  }
}

async function modulosActivosDe(empKey) {
  const { MODULOS_DISPONIBLES } = accesoCtrl();
  const bloqueados = await getEmpresaModulosBloqueados(empKey);
  return MODULOS_DISPONIBLES.map((m) => m.key).filter((k) => !bloqueados.has(k.toLowerCase()));
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

exports.puedo = async (req, res) => {
  try { res.json({ success: true, data: { puede: await puedeGestionarEmpresas(req) } }); } catch (_) { res.json({ success: true, data: { puede: false } }); }
};

exports.catalogo = async (req, res) => {
  try {
    const { MODULOS_DISPONIBLES, accionesDeEmpresa, ROLES_SISTEMA, modulosDefaultDeRol } = accesoCtrl();
    const empresas = [];
    for (const t of listTenants()) {
      try { empresas.push({ key: t.key, nombre: t.nombre, modulos: await modulosActivosDe(t.key) }); } catch (_) { /* sin datos */ }
    }
    res.json({
      success: true,
      data: {
        modulos: MODULOS_DISPONIBLES.map(({ key, nombre, descripcion }) => ({ key, nombre, descripcion })),
        // Acciones tal como las verá una empresa cliente (sin las exclusivas de Ardaby Tec).
        acciones: accionesDeEmpresa('__cliente__'),
        plantillas: PLANTILLAS.map((p) => ({ ...p, modulos: p.modulos === '*' ? MODULOS_DISPONIBLES.map((m) => m.key) : p.modulos })),
        // Roles con los que nace cada empresa (clave estable 'sys:<BASE>' en el borrador).
        rolesSistema: ROLES_SISTEMA.map((r) => ({ key: `sys:${r.base}`, nombre: r.nombre, descripcion: r.desc, rolBase: r.base, modulos: modulosDefaultDeRol(r.base) })),
        empresas,
      },
    });
  } catch (e) {
    responderError(res, e, 'catalogo');
  }
};

// GET /codigo?nombre=&codigo= — sugiere un código libre, o dice si el dado está libre
exports.codigo = async (req, res) => {
  if (req.query.codigo) {
    const codigo = String(req.query.codigo).toLowerCase();
    try {
      creacion.validarCodigo(codigo);
      const ocupado = await codigoOcupadoEnBD(codigo);
      return res.json({ success: true, data: { codigo, disponible: !ocupado, ...(ocupado ? { motivo: ocupado } : {}) } });
    } catch (e) {
      return res.json({ success: true, data: { codigo, disponible: false, motivo: e.message } });
    }
  }
  const base = String(req.query.nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 26) || 'empresa';
  let codigo = base.length >= 2 ? base : `${base}_e`;
  // Tampoco repetir un código ya apartado por otro borrador abierto.
  const apartados = new Set((await (await master()).request()
    .query(`SELECT BOR_CODIGO FROM dbo.INTRANET_EMPRESAS_BORRADORES WHERE BOR_ESTADO IN ('borrador','creando','error') AND BOR_CODIGO IS NOT NULL`))
    .recordset.map((r) => String(r.BOR_CODIGO).toLowerCase()));
  for (let i = 2; i < 100; i++) {
    let libre = !apartados.has(codigo);
    if (libre) { try { creacion.validarCodigo(codigo); } catch (_) { libre = false; } }
    if (libre) break;
    codigo = `${base.slice(0, 26)}${i}`;
  }
  res.json({ success: true, data: { codigo, disponible: true } });
};

// ── Validación del borrador ──────────────────────────────────────────────────
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USUARIO_RE = /^[A-Za-z0-9._-]{3,50}$/;

// Lista de pendientes que impiden crear la empresa (vacía = se puede crear).
// El frontend calcula lo mismo para mostrarlo en vivo; esto es lo que manda.
function pendientesDe(datos, { empKeyYaCreada = false } = {}) {
  const p = [];
  const d = datos || {};
  const nombre = String(d.empresa?.nombre || '').trim();
  const codigo = String(d.empresa?.codigo || '').trim().toLowerCase();
  if (!nombre) p.push({ paso: 'empresa', texto: 'Falta el nombre de la empresa' });
  if (!empKeyYaCreada) {
    try { creacion.validarCodigo(codigo); } catch (e) { p.push({ paso: 'empresa', texto: e.message }); }
  }
  const modulos = Array.isArray(d.modulos) ? d.modulos : [];
  if (!modulos.length) p.push({ paso: 'modulos', texto: 'Elige al menos un módulo' });

  const roles = Array.isArray(d.roles) ? d.roles : [];
  const rolKeys = new Set(roles.map((r) => r.key));
  const nombresRol = new Set();
  for (const r of roles) {
    const n = String(r.nombre || '').trim().toLowerCase();
    if (!n) p.push({ paso: 'roles', texto: 'Hay un rol sin nombre' });
    else if (nombresRol.has(n)) p.push({ paso: 'roles', texto: `El rol "${r.nombre}" está repetido` });
    nombresRol.add(n);
  }

  const perfiles = Array.isArray(d.perfiles) ? d.perfiles : [];
  const perfilKeys = new Set(perfiles.map((x) => x.key));
  const nombresPerfil = new Set();
  for (const x of perfiles) {
    const n = String(x.nombre || '').trim().toLowerCase();
    if (!n) p.push({ paso: 'perfiles', texto: 'Hay un perfil sin nombre' });
    else if (nombresPerfil.has(n)) p.push({ paso: 'perfiles', texto: `El perfil "${x.nombre}" está repetido` });
    nombresPerfil.add(n);
    if (!rolKeys.has(x.rolKey)) p.push({ paso: 'perfiles', texto: `El perfil "${x.nombre || '(sin nombre)'}" no tiene rol` });
  }

  const usuarios = Array.isArray(d.usuarios) ? d.usuarios : [];
  if (!usuarios.some((u) => u.esAdmin)) p.push({ paso: 'usuarios', texto: 'Falta el administrador de la empresa' });
  const vistos = new Set();
  let conError = 0;
  for (const u of usuarios) {
    const us = String(u.usuario || '').trim().toLowerCase();
    const malo = !String(u.nombres || '').trim() || !USUARIO_RE.test(us) || vistos.has(us)
      || (u.correo && !CORREO_RE.test(String(u.correo).trim()))
      || (!u.esAdmin && !perfilKeys.has(u.perfilKey))
      || (u.contra && validarPoliticaPassword(String(u.contra)));
    if (malo) conError++;
    vistos.add(us);
  }
  if (conError) p.push({ paso: 'usuarios', texto: `${conError} usuario(s) con datos incompletos o repetidos` });
  return p;
}

// Además del catálogo en memoria, revisa la BD maestra: que no haya otra
// empresa con ese código ni una base de datos con ese nombre.
async function codigoOcupadoEnBD(codigo) {
  const k = String(codigo || '').trim().toLowerCase();
  if (!k) return null;
  const rs = await (await master()).request().input('k', sql.NVarChar, k).input('db', sql.NVarChar, `intranet_${k}`)
    .query(`SELECT (SELECT COUNT(*) FROM dbo.INTRANET_EMPRESAS WHERE EMP_KEY=@k) AS enCatalogo, CASE WHEN DB_ID(@db) IS NULL THEN 0 ELSE 1 END AS bd`);
  const f = rs.recordset[0];
  if (f.enCatalogo > 0) return 'Ya existe una empresa con ese código';
  if (f.bd) return `Ya existe una base de datos llamada intranet_${k}`;
  return null;
}

async function pendientesCompletos(datos, { empKeyYaCreada = false } = {}) {
  const p = pendientesDe(datos, { empKeyYaCreada });
  if (!empKeyYaCreada && !p.some((x) => x.paso === 'empresa' && /código/i.test(x.texto))) {
    const ocupado = await codigoOcupadoEnBD(datos?.empresa?.codigo);
    if (ocupado) p.unshift({ paso: 'empresa', texto: ocupado });
  }
  return p;
}

// ── Borradores ───────────────────────────────────────────────────────────────

function filaABorrador(r, req, { conDatos = false } = {}) {
  const datos = parse(r.BOR_DATOS, {});
  return {
    id: r.BOR_ID,
    nombre: r.BOR_NOMBRE, codigo: r.BOR_CODIGO, paso: r.BOR_PASO, estado: r.BOR_ESTADO, empKey: r.BOR_EMP_KEY,
    usuarioNombre: r.BOR_USUARIO_NOMBRE, esMio: r.BOR_USUARIO_ID === uid(req),
    actualizado: r.BOR_ACTUALIZADO, creado: r.BOR_CREADO,
    // La creación figura "en curso" solo si de verdad corre en este proceso;
    // 'creando' sin proceso = se interrumpió (reinicio) y hay que continuarla.
    interrumpido: r.BOR_ESTADO === 'creando' && !enProceso.has(r.BOR_ID),
    avance: parse(r.BOR_AVANCE, null), error: r.BOR_ERROR,
    resumen: { modulos: (datos.modulos || []).length, roles: (datos.roles || []).length, perfiles: (datos.perfiles || []).length, usuarios: (datos.usuarios || []).length },
    ...(conDatos ? { datos, pendientes: pendientesDe(datos, { empKeyYaCreada: !!r.BOR_EMP_KEY }) } : {}),
  };
}

async function leerBorrador(id) {
  const rs = await (await master()).request().input('id', sql.Int, Number(id))
    .query('SELECT * FROM dbo.INTRANET_EMPRESAS_BORRADORES WHERE BOR_ID=@id');
  if (!rs.recordset.length) throw err('Borrador no encontrado', 404);
  return rs.recordset[0];
}

// GET /borradores — empresas pendientes (todas; `esMio` marca las propias)
exports.listarBorradores = async (req, res) => {
  try {
    const rs = await (await master()).request()
      .query(`SELECT * FROM dbo.INTRANET_EMPRESAS_BORRADORES WHERE BOR_ESTADO IN ('borrador','creando','error','creada') ORDER BY BOR_ACTUALIZADO DESC`);
    res.json({ success: true, data: rs.recordset.map((r) => filaABorrador(r, req)) });
  } catch (e) {
    responderError(res, e, 'listarBorradores');
  }
};

exports.leer = async (req, res) => {
  try {
    const r = await leerBorrador(req.params.id);
    const b = filaABorrador(r, req, { conDatos: true });
    // Contraseñas temporales: solo cuando ya se creó (hasta que se termine el asistente).
    if (['creada', 'creando', 'error'].includes(r.BOR_ESTADO)) b.resultado = parse(r.BOR_RESULTADO, null);
    res.json({ success: true, data: b });
  } catch (e) {
    responderError(res, e, 'leer');
  }
};

// POST /borradores { datos, paso }
exports.crearBorrador = async (req, res) => {
  try {
    const datos = req.body?.datos || {};
    const rs = await (await master()).request()
      .input('uid', sql.Int, uid(req)).input('un', sql.NVarChar, req.user?.nombre || req.user?.username || null)
      .input('n', sql.NVarChar, String(datos.empresa?.nombre || '').trim() || null)
      .input('c', sql.NVarChar, String(datos.empresa?.codigo || '').trim().toLowerCase() || null)
      .input('d', sql.NVarChar, JSON.stringify(datos)).input('p', sql.Int, Number(req.body?.paso) || 0)
      .query(`INSERT INTO dbo.INTRANET_EMPRESAS_BORRADORES (BOR_USUARIO_ID, BOR_USUARIO_NOMBRE, BOR_NOMBRE, BOR_CODIGO, BOR_DATOS, BOR_PASO)
              VALUES (@uid, @un, @n, @c, @d, @p); SELECT SCOPE_IDENTITY() AS id;`);
    const id = Number(rs.recordset[0].id);
    await auditar(req, 'borrador-crear', String(id), { nombre: datos.empresa?.nombre });
    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    responderError(res, e, 'crearBorrador');
  }
};

// PUT /borradores/:id { datos, paso } — guardado automático mientras se captura
exports.guardarBorrador = async (req, res) => {
  try {
    const r = await leerBorrador(req.params.id);
    if (!['borrador', 'error'].includes(r.BOR_ESTADO)) throw err('Esta empresa ya se está creando; no se puede editar', 409);
    const datos = req.body?.datos || {};
    // Si la BD ya existe (creación interrumpida), el código ya no cambia.
    if (r.BOR_EMP_KEY && datos.empresa) datos.empresa.codigo = r.BOR_EMP_KEY;
    await (await master()).request().input('id', sql.Int, r.BOR_ID)
      .input('n', sql.NVarChar, String(datos.empresa?.nombre || '').trim() || null)
      .input('c', sql.NVarChar, String(datos.empresa?.codigo || '').trim().toLowerCase() || null)
      .input('d', sql.NVarChar, JSON.stringify(datos)).input('p', sql.Int, Number(req.body?.paso) || 0)
      .query(`UPDATE dbo.INTRANET_EMPRESAS_BORRADORES SET BOR_NOMBRE=@n, BOR_CODIGO=@c, BOR_DATOS=@d, BOR_PASO=@p, BOR_ACTUALIZADO=GETDATE() WHERE BOR_ID=@id`);
    res.json({ success: true, data: { pendientes: pendientesDe(datos, { empKeyYaCreada: !!r.BOR_EMP_KEY }) } });
  } catch (e) {
    responderError(res, e, 'guardarBorrador');
  }
};

// DELETE /borradores/:id — descartar (solo si la empresa aún no se creó)
exports.descartar = async (req, res) => {
  try {
    const r = await leerBorrador(req.params.id);
    if (r.BOR_EMP_KEY) throw err('La base de datos de esta empresa ya se creó; continúa la creación para terminarla', 409);
    if (r.BOR_ESTADO === 'creando' && enProceso.has(r.BOR_ID)) throw err('La empresa se está creando en este momento', 409);
    await (await master()).request().input('id', sql.Int, r.BOR_ID).query('DELETE FROM dbo.INTRANET_EMPRESAS_BORRADORES WHERE BOR_ID=@id');
    await auditar(req, 'borrador-descartar', String(r.BOR_ID), { nombre: r.BOR_NOMBRE });
    res.json({ success: true });
  } catch (e) {
    responderError(res, e, 'descartar');
  }
};

// POST /borradores/:id/crear — valida y arranca (o continúa) la creación en segundo plano
exports.crearEmpresa = async (req, res) => {
  try {
    const r = await leerBorrador(req.params.id);
    if (enProceso.has(r.BOR_ID)) return res.json({ success: true, data: { estado: 'creando' } });
    if (!['borrador', 'error', 'creando'].includes(r.BOR_ESTADO)) throw err('Esta empresa ya se creó', 409);
    const datos = parse(r.BOR_DATOS, {});
    const pendientes = await pendientesCompletos(datos, { empKeyYaCreada: !!r.BOR_EMP_KEY });
    if (pendientes.length) return res.status(400).json({ success: false, message: 'Falta completar datos antes de crear la empresa', pendientes });

    await (await master()).request().input('id', sql.Int, r.BOR_ID)
      .query(`UPDATE dbo.INTRANET_EMPRESAS_BORRADORES SET BOR_ESTADO='creando', BOR_ERROR=NULL, BOR_ACTUALIZADO=GETDATE() WHERE BOR_ID=@id`);
    await auditar(req, r.BOR_EMP_KEY ? 'continuar-creacion' : 'crear', r.BOR_CODIGO, { borrador: r.BOR_ID, nombre: r.BOR_NOMBRE });
    ejecutarCreacion(r.BOR_ID, { id: uid(req) }).catch(() => { /* el error queda en el borrador */ });
    res.json({ success: true, data: { estado: 'creando' } });
  } catch (e) {
    responderError(res, e, 'crearEmpresa');
  }
};

// POST /borradores/:id/terminar — cierra el asistente y borra las contraseñas temporales guardadas
exports.terminar = async (req, res) => {
  try {
    const r = await leerBorrador(req.params.id);
    if (r.BOR_ESTADO !== 'creada') throw err('La empresa todavía no termina de crearse', 409);
    await (await master()).request().input('id', sql.Int, r.BOR_ID)
      .query(`UPDATE dbo.INTRANET_EMPRESAS_BORRADORES SET BOR_ESTADO='terminado', BOR_RESULTADO=NULL, BOR_ACTUALIZADO=GETDATE() WHERE BOR_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    responderError(res, e, 'terminar');
  }
};

// ── Creación (segundo plano) ─────────────────────────────────────────────────

async function actualizarBorrador(id, campos) {
  const req = (await master()).request().input('id', sql.Int, id);
  const sets = ['BOR_ACTUALIZADO=GETDATE()'];
  for (const [col, val] of Object.entries(campos)) {
    req.input(col, sql.NVarChar, val === null || val === undefined ? null : (typeof val === 'string' ? val : JSON.stringify(val)));
    sets.push(`${col}=@${col}`);
  }
  await req.query(`UPDATE dbo.INTRANET_EMPRESAS_BORRADORES SET ${sets.join(', ')} WHERE BOR_ID=@id`);
}

async function guardarModulosEmpresa(empKey, elegidos, adminId) {
  const { MODULOS_DISPONIBLES } = accesoCtrl();
  const set = new Set(elegidos.map(String));
  const pool = await master();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const m of MODULOS_DISPONIBLES) {
      await new sql.Request(tx)
        .input('empKey', sql.NVarChar, empKey).input('mod', sql.NVarChar, m.key)
        .input('allow', sql.Bit, set.has(m.key) ? 1 : 0).input('by', sql.Int, adminId)
        .query(`
          MERGE INTRANET_EMPRESAS_MODULOS AS t
          USING (SELECT @empKey AS EMP_KEY, @mod AS MODULO_KEY) AS s
          ON t.EMP_KEY = s.EMP_KEY AND t.MODULO_KEY = s.MODULO_KEY
          WHEN MATCHED THEN UPDATE SET ALLOW = @allow, GRANTED_BY = @by, GRANTED_AT = GETDATE()
          WHEN NOT MATCHED THEN INSERT (EMP_KEY, MODULO_KEY, ALLOW, GRANTED_BY) VALUES (s.EMP_KEY, s.MODULO_KEY, @allow, @by);
        `);
    }
    await new sql.Request(tx).input('k', sql.NVarChar, empKey).query('UPDATE dbo.INTRANET_EMPRESAS SET EMP_MODULOS_ESTRICTO = 1 WHERE EMP_KEY = @k');
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
  invalidateEmpresaModulosCache(empKey);
  try { getIO(empKey).emit('empresa-modulos-updated'); } catch (_) { /* sin sockets */ }
}

// Permisos de un rol limitados a los módulos activos de la empresa.
function filasRol(rol, activos) {
  const mods = (rol.modulos || []).filter((m) => activos.has(String(m)));
  const accs = {};
  for (const [m, lista] of Object.entries(rol.acciones || {})) {
    if (activos.has(m) && Array.isArray(lista)) accs[m] = lista.filter((a) => String(a) !== 'crear-empresas');
  }
  return { rows: rolCtrl().buildPermisoRows(mods, accs), mods };
}

async function escribirRol(pool, rolId, rol, activos, esSistema) {
  const { rows, mods } = filasRol(rol, activos);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    if (!esSistema) {
      await new sql.Request(tx).input('id', sql.Int, rolId)
        .input('d', sql.NVarChar, rol.descripcion ? String(rol.descripcion).trim() : null)
        .input('b', sql.NVarChar, rolCtrl().derivarRolBase(mods))
        .query('UPDATE dbo.INTRANET_ROLES SET DESCRIPCION=@d, ROL_BASE=@b WHERE ROL_ID=@id');
    }
    await new sql.Request(tx).input('id', sql.Int, rolId).query('DELETE FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID=@id');
    for (const r of rows) {
      await new sql.Request(tx).input('id', sql.Int, rolId).input('m', sql.NVarChar, r.moduloKey).input('a', sql.NVarChar, r.accionKey)
        .query('INSERT INTO dbo.INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY) VALUES (@id, @m, @a)');
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

async function ejecutarCreacion(borId, sesion) {
  if (enProceso.has(borId)) return;
  enProceso.add(borId);
  let r;
  try {
    r = await leerBorrador(borId);
  } catch (e) {
    enProceso.delete(borId);
    throw e;
  }
  const datos = parse(r.BOR_DATOS, {});
  const avance = parse(r.BOR_AVANCE, null) || { completadas: [] };
  const resultado = parse(r.BOR_RESULTADO, null) || { creados: [], yaExistian: [] };
  const marcar = async (etapa, extra = {}) => {
    avance.etapa = etapa;
    Object.assign(avance, extra);
    await actualizarBorrador(borId, { BOR_AVANCE: avance });
  };
  const completar = async (etapa) => {
    if (!avance.completadas.includes(etapa)) avance.completadas.push(etapa);
    await actualizarBorrador(borId, { BOR_AVANCE: avance });
  };

  try {
    // 1. Empresa: BD + catálogo (solo la primera vez).
    let empKey = r.BOR_EMP_KEY;
    await marcar('empresa');
    if (!empKey) {
      const emp = await creacion.crearEmpresaBase({
        codigo: datos.empresa.codigo, nombre: datos.empresa.nombre, creadoPor: sesion.id,
        estricto: true, asistente: { terminado: false, borradorId: borId }, esperarEsquema: false,
      });
      empKey = emp.key;
      await actualizarBorrador(borId, { BOR_EMP_KEY: empKey });
    }
    await completar('empresa');

    // 2. Esquema (≈1 min la primera vez; si ya está listo, es inmediato).
    await marcar('esquema');
    const pool = await databaseService.getPool(empKey);
    await completar('esquema');

    // 3. Módulos (lista completa, modo estricto).
    await marcar('modulos');
    await guardarModulosEmpresa(empKey, datos.modulos || [], sesion.id);
    const activos = new Set(await modulosActivosDe(empKey));
    await completar('modulos');

    // 4. Roles: los de sistema se buscan por su código; los propios, por nombre.
    await marcar('roles');
    const rolIdPorKey = {};
    for (const rol of datos.roles || []) {
      const base = String(rol.key || '').startsWith('sys:') ? rol.key.slice(4) : null;
      let rolId = null;
      if (base) {
        const q = await pool.request().input('b', sql.NVarChar, base).query('SELECT ROL_ID FROM dbo.INTRANET_ROLES WHERE ES_SISTEMA=1 AND ROL_BASE=@b');
        rolId = q.recordset[0]?.ROL_ID ?? null;
      }
      if (!rolId) {
        const q = await pool.request().input('n', sql.NVarChar, String(rol.nombre).trim()).query('SELECT ROL_ID FROM dbo.INTRANET_ROLES WHERE NOMBRE=@n');
        rolId = q.recordset[0]?.ROL_ID ?? null;
      }
      if (!rolId) {
        const ins = await pool.request().input('n', sql.NVarChar, String(rol.nombre).trim()).input('b', sql.NVarChar, base || 'ST')
          .query('INSERT INTO dbo.INTRANET_ROLES (NOMBRE, ROL_BASE, ES_SISTEMA, ACTIVO) VALUES (@n, @b, 0, 1); SELECT SCOPE_IDENTITY() AS ROL_ID;');
        rolId = Number(ins.recordset[0].ROL_ID);
      }
      await escribirRol(pool, rolId, rol, activos, !!base);
      rolIdPorKey[rol.key] = rolId;
    }
    await completar('roles');

    // 5. Perfiles (por nombre).
    await marcar('perfiles');
    const perfilPorKey = {};
    for (const p of datos.perfiles || []) {
      const nombre = String(p.nombre).trim();
      const rq = pool.request().input('n', sql.NVarChar, nombre)
        .input('d', sql.NVarChar, p.descripcion ? String(p.descripcion).trim() : null)
        .input('rol', sql.Int, rolIdPorKey[p.rolKey] ?? null)
        .input('pu', sql.NVarChar, p.puesto ? String(p.puesto).trim() : null)
        .input('de', sql.NVarChar, p.departamento ? String(p.departamento).trim() : null);
      const q = await rq.query(`
        IF EXISTS (SELECT 1 FROM dbo.INTRANET_PERFILES WHERE NOMBRE=@n)
          UPDATE dbo.INTRANET_PERFILES SET DESCRIPCION=@d, ROL_ID=@rol, PUESTO=@pu, DEPARTAMENTO=@de, ACTIVO=1 WHERE NOMBRE=@n
        ELSE
          INSERT INTO dbo.INTRANET_PERFILES (NOMBRE, DESCRIPCION, ROL_ID, PUESTO, DEPARTAMENTO, ACTIVO) VALUES (@n, @d, @rol, @pu, @de, 1);
        SELECT PERFIL_ID FROM dbo.INTRANET_PERFILES WHERE NOMBRE=@n;`);
      perfilPorKey[p.key] = { id: q.recordset[0]?.PERFIL_ID, rolId: rolIdPorKey[p.rolKey] ?? null, puesto: p.puesto, departamento: p.departamento, nombre };
    }
    await completar('perfiles');

    // 6. Usuarios: el que ya existe (de un intento anterior) no se vuelve a crear.
    const usuarios = datos.usuarios || [];
    await marcar('usuarios', { usuariosTotal: usuarios.length, usuariosHechos: 0 });
    const existentes = new Set((await pool.request().query('SELECT NEUS_USUARIO FROM NEUS_USUARIOS')).recordset.map((x) => String(x.NEUS_USUARIO).toLowerCase()));
    let hechos = 0;
    for (const u of usuarios) {
      const usuario = String(u.usuario).trim();
      if (!existentes.has(usuario.toLowerCase())) {
        const perfil = u.esAdmin ? null : perfilPorKey[u.perfilKey];
        const contra = u.contra ? String(u.contra) : passwordTemporal();
        await creacion.crearUsuarioEnEmpresa(pool, empKey, {
          nombres: u.nombres, usuario, contra, correo: u.correo || null,
          rolId: u.esAdmin ? rolIdPorKey['sys:AD'] : perfil?.rolId,
          tipoUsuario: u.esAdmin ? 'AD' : undefined,
          puesto: perfil?.puesto, departamento: perfil?.departamento,
        }, sesion.id);
        existentes.add(usuario.toLowerCase());
        resultado.creados.push({ nombre: u.nombres, usuario, perfil: u.esAdmin ? 'Administrador' : perfil?.nombre ?? null, contraTemporal: u.contra ? null : contra });
      } else if (!resultado.creados.some((c) => c.usuario.toLowerCase() === usuario.toLowerCase())) {
        resultado.yaExistian.push(usuario);
      }
      hechos++;
      // Guardar las contraseñas generadas cada tanto: si se interrumpe no se pierden.
      if (hechos % 10 === 0 || hechos === usuarios.length) {
        avance.usuariosHechos = hechos;
        await actualizarBorrador(borId, { BOR_AVANCE: avance, BOR_RESULTADO: resultado });
      }
    }
    await completar('usuarios');

    // Listo.
    await (await master()).request().input('k', sql.NVarChar, empKey)
      .input('a', sql.NVarChar, JSON.stringify({ terminado: true, borradorId: borId }))
      .query('UPDATE dbo.INTRANET_EMPRESAS SET EMP_ASISTENTE=@a WHERE EMP_KEY=@k');
    avance.etapa = 'listo';
    await actualizarBorrador(borId, { BOR_ESTADO: 'creada', BOR_AVANCE: avance, BOR_RESULTADO: resultado, BOR_ERROR: null });
    logger.info(`✅ Empresa ${empKey} creada con el asistente (borrador ${borId})`);
  } catch (e) {
    logger.error(`❌ Falló la creación de la empresa (borrador ${borId}):`, e);
    await actualizarBorrador(borId, { BOR_ESTADO: 'error', BOR_ERROR: e.message, BOR_AVANCE: avance, BOR_RESULTADO: resultado }).catch(() => {});
    throw e;
  } finally {
    enProceso.delete(borId);
  }
}

exports.ETAPAS = ETAPAS;
exports.ESTADOS_ABIERTOS = ESTADOS_ABIERTOS;
exports.pendientesDe = pendientesDe;
