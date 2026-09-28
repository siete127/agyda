const sql = require('mssql');
const crypto = require('crypto');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { getIO } = require('../services/socketService');
const { DEFAULT_TENANT, getTenantConfig, listTenants } = require('../config/tenants');
const { puedeGestionarEmpresas } = require('../utils/gestionEmpresas');
const { validarPoliticaPassword } = require('../utils/passwordPolicy');
const { getEmpresaModulosBloqueados, invalidateEmpresaModulosCache } = require('../middleware/moduleAccess');
const creacion = require('../services/empresaCreacionService');

// Asistente "Crear empresa" (Configuración): crea la empresa y configura sus
// módulos, roles, perfiles y usuarios paso a paso.
//
// Trabaja DIRECTO sobre la BD de la empresa elegida (:empKey) en vez de
// reutilizar los endpoints de roles/perfiles/usuarios: esos resuelven la
// empresa y los permisos con el usuario de la sesión, y cada empresa numera
// sus usuarios desde 1 — el mismo id sería otra persona en la BD nueva. Aquí
// el único permiso que cuenta es accesos/crear-empresas en Ardaby Tec
// (requireGestionEmpresas en la ruta), y las escrituras quedan en la auditoría
// de la empresa maestra.

const accesoCtrl = () => require('./accesoController');
const rolCtrl = () => require('./rolController');

// Plantillas de módulos. "Contact Center" = lo que tienen activo hoy las
// empresas cliente (Fuzion Contact, Santillana, EdoMex, CxN070) + Accesos.
const PLANTILLAS = [
  {
    key: 'contact-center', nombre: 'Contact Center',
    descripcion: 'La configuración que usan hoy las empresas cliente: agentes atendiendo por Contact Center y Webphone.',
    modulos: ['noticias', 'usuarios', 'contact-center', 'mensajeria', 'webphone', 'configuracion', 'accesos'],
  },
  { key: 'completa', nombre: 'Completa', descripcion: 'Todos los módulos del sistema, como Ardaby Tec.', modulos: '*' },
  { key: 'manual', nombre: 'A mano', descripcion: 'Empieza sin módulos y marca uno por uno.', modulos: [] },
];

function empKeyDe(req) {
  const key = String(req.params.empKey || '').toLowerCase();
  if (key === DEFAULT_TENANT) throw Object.assign(new Error('El asistente no configura Ardaby Tec'), { status: 400 });
  getTenantConfig(key); // lanza si no existe
  return key;
}

function responderError(res, e, contexto) {
  if (!e.status) console.error(`[empresa-asistente] ${contexto}:`, e);
  return res.status(e.status || (String(e.message).startsWith('Empresa desconocida') ? 404 : 500)).json({ success: false, message: e.message });
}

async function auditar(req, accion, empKey, detalle) {
  try {
    const master = await databaseService.getPool(DEFAULT_TENANT);
    await logAudit(master, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'accesos', accion: `asistente-empresa-${accion}`, entidadId: empKey, detalle, ip: req.ip,
    });
  } catch (_) { /* la auditoría no bloquea */ }
}

// Pool de la empresa solo si su esquema ya está listo (si no, 409 para que el
// frontend siga esperando).
async function poolListo(empKey) {
  const est = creacion.estadoPreparacion(empKey);
  if (est.estado !== 'listo') throw Object.assign(new Error('La empresa todavía se está preparando, espera unos segundos'), { status: 409 });
  return databaseService.getPool(empKey);
}

async function modulosActivosDe(empKey) {
  const { MODULOS_DISPONIBLES } = accesoCtrl();
  const bloqueados = await getEmpresaModulosBloqueados(empKey);
  return MODULOS_DISPONIBLES.map((m) => m.key).filter((k) => !bloqueados.has(k.toLowerCase()));
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

async function guardarAsistente(empKey, cambios) {
  const master = await databaseService.getPool(DEFAULT_TENANT);
  const rs = await master.request().input('k', sql.NVarChar, empKey)
    .query('SELECT EMP_ASISTENTE FROM dbo.INTRANET_EMPRESAS WHERE EMP_KEY=@k');
  let actual = {};
  try { actual = JSON.parse(rs.recordset[0]?.EMP_ASISTENTE || '{}') || {}; } catch (_) { actual = {}; }
  const completos = new Set([...(actual.completos || []), ...(cambios.completos || [])]);
  const nuevo = { ...actual, ...cambios, completos: [...completos] };
  await master.request().input('k', sql.NVarChar, empKey).input('a', sql.NVarChar, JSON.stringify(nuevo))
    .query('UPDATE dbo.INTRANET_EMPRESAS SET EMP_ASISTENTE=@a WHERE EMP_KEY=@k');
  return nuevo;
}

// GET /puedo — ¿el usuario puede usar el asistente? (tarjeta de Configuración)
exports.puedo = async (req, res) => {
  try {
    res.json({ success: true, data: { puede: await puedeGestionarEmpresas(req) } });
  } catch (e) {
    res.json({ success: true, data: { puede: false } });
  }
};

// GET /catalogo — módulos, acciones por módulo, plantillas y empresas para "copiar de"
exports.catalogo = async (req, res) => {
  try {
    const { MODULOS_DISPONIBLES, accionesDeEmpresa } = accesoCtrl();
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
        empresas,
      },
    });
  } catch (e) {
    responderError(res, e, 'catalogo');
  }
};

// GET /codigo?nombre= — sugiere un código libre a partir del nombre
exports.sugerirCodigo = async (req, res) => {
  const base = String(req.query.nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 26) || 'empresa';
  let codigo = base.length >= 2 ? base : `${base}_e`;
  for (let i = 2; i < 100; i++) {
    try { creacion.validarCodigo(codigo); break; } catch (_) { codigo = `${base.slice(0, 26)}${i}`; }
  }
  res.json({ success: true, data: { codigo } });
};

// POST / { nombre, codigo } — crea la empresa; el esquema se prepara en segundo plano
exports.crear = async (req, res) => {
  try {
    const { nombre, codigo } = req.body || {};
    const empresa = await creacion.crearEmpresaBase({
      codigo, nombre, creadoPor: req.user?.id || null,
      estricto: true, asistente: { paso: 1, completos: ['empresa'], terminado: false },
      esperarEsquema: false,
    });
    await auditar(req, 'crear', empresa.key, { nombre: empresa.nombre, database: empresa.database });
    res.status(201).json({ success: true, data: empresa });
  } catch (e) {
    responderError(res, e, 'crear');
  }
};

// GET /:empKey — estado completo para el asistente
exports.estado = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const master = await databaseService.getPool(DEFAULT_TENANT);
    const empR = await master.request().input('k', sql.NVarChar, empKey)
      .query('SELECT EMP_KEY, EMP_NOMBRE, EMP_ASISTENTE, EMP_MODULOS_ESTRICTO FROM dbo.INTRANET_EMPRESAS WHERE EMP_KEY=@k');
    const emp = empR.recordset[0];
    if (!emp) return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
    let asistente = null;
    try { asistente = emp.EMP_ASISTENTE ? JSON.parse(emp.EMP_ASISTENTE) : null; } catch (_) { asistente = null; }

    const preparacion = creacion.estadoPreparacion(empKey);
    const base = {
      empresa: { key: emp.EMP_KEY, nombre: emp.EMP_NOMBRE, estricto: emp.EMP_MODULOS_ESTRICTO === true || emp.EMP_MODULOS_ESTRICTO === 1 },
      asistente, preparacion,
    };
    if (preparacion.estado !== 'listo') return res.json({ success: true, data: base });

    const pool = await databaseService.getPool(empKey);
    const [rolesR, permR, perfilesR, usuariosR] = await Promise.all([
      pool.request().query('SELECT ROL_ID, NOMBRE, DESCRIPCION, ROL_BASE, ES_SISTEMA FROM dbo.INTRANET_ROLES WHERE ACTIVO=1 ORDER BY ES_SISTEMA DESC, NOMBRE'),
      pool.request().query('SELECT ROL_ID, MODULO_KEY, ACCION_KEY FROM dbo.INTRANET_ROLES_PERMISOS'),
      pool.request().query(`SELECT p.PERFIL_ID, p.NOMBRE, p.DESCRIPCION, p.ROL_ID, p.PUESTO, p.DEPARTAMENTO, p.ID_HORARIO, r.NOMBRE AS ROL_NOMBRE
                            FROM dbo.INTRANET_PERFILES p LEFT JOIN dbo.INTRANET_ROLES r ON r.ROL_ID = p.ROL_ID WHERE p.ACTIVO=1 ORDER BY p.NOMBRE`),
      pool.request().query(`SELECT NEUS_ID, NEUS_NOMBRES, NEUS_USUARIO, NEUS_TIPOUSUARIO, NEUS_CORREO, NEUS_PUESTO, NEUS_ACTIVO
                            FROM NEUS_USUARIOS ORDER BY NEUS_ID`),
    ]);
    let horarios = [];
    try {
      horarios = (await pool.request().query(`IF OBJECT_ID('dbo.horarios','U') IS NOT NULL SELECT id, horario, nomenclatura FROM dbo.horarios ELSE SELECT TOP 0 1 AS id, '' AS horario, '' AS nomenclatura`)).recordset;
    } catch (_) { horarios = []; }

    const permisosPorRol = {};
    for (const p of permR.recordset) {
      if (!permisosPorRol[p.ROL_ID]) permisosPorRol[p.ROL_ID] = { modulos: [], acciones: {} };
      const r = permisosPorRol[p.ROL_ID];
      if (p.ACCION_KEY === '*') r.modulos.push(p.MODULO_KEY);
      else {
        if (!r.acciones[p.MODULO_KEY]) r.acciones[p.MODULO_KEY] = [];
        r.acciones[p.MODULO_KEY].push(p.ACCION_KEY);
      }
    }

    res.json({
      success: true,
      data: {
        ...base,
        modulos: await modulosActivosDe(empKey),
        roles: rolesR.recordset.map((r) => ({
          rolId: r.ROL_ID, nombre: r.NOMBRE, descripcion: r.DESCRIPCION, rolBase: r.ROL_BASE,
          esSistema: r.ES_SISTEMA === true || r.ES_SISTEMA === 1,
          modulos: permisosPorRol[r.ROL_ID]?.modulos ?? [], acciones: permisosPorRol[r.ROL_ID]?.acciones ?? {},
        })),
        perfiles: perfilesR.recordset.map((p) => ({
          perfilId: p.PERFIL_ID, nombre: p.NOMBRE, descripcion: p.DESCRIPCION, rolId: p.ROL_ID, rolNombre: p.ROL_NOMBRE,
          puesto: p.PUESTO, departamento: p.DEPARTAMENTO, idHorario: p.ID_HORARIO,
        })),
        usuarios: usuariosR.recordset.map((u) => ({
          id: u.NEUS_ID, nombre: u.NEUS_NOMBRES, usuario: u.NEUS_USUARIO, tipo: u.NEUS_TIPOUSUARIO,
          correo: u.NEUS_CORREO, puesto: u.NEUS_PUESTO, activo: u.NEUS_ACTIVO === true || u.NEUS_ACTIVO === 1,
        })),
        horarios,
      },
    });
  } catch (e) {
    responderError(res, e, 'estado');
  }
};

// PUT /:empKey/asistente { paso?, completos?, terminado? } — guarda el avance
exports.guardarAvance = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const { paso, completos, terminado } = req.body || {};
    const cambios = {};
    if (Number.isInteger(paso)) cambios.paso = paso;
    if (Array.isArray(completos)) cambios.completos = completos.map(String).slice(0, 20);
    if (typeof terminado === 'boolean') cambios.terminado = terminado;
    res.json({ success: true, data: await guardarAsistente(empKey, cambios) });
  } catch (e) {
    responderError(res, e, 'guardarAvance');
  }
};

// PUT /:empKey/modulos { modulos: string[] } — la lista COMPLETA de módulos activos.
// Guarda una fila por cada módulo del catálogo (1 = activo, 0 = bloqueado) y deja
// la empresa en modo estricto: un módulo que se agregue al sistema después llega apagado.
exports.guardarModulos = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const { MODULOS_DISPONIBLES } = accesoCtrl();
    const elegidos = new Set((Array.isArray(req.body?.modulos) ? req.body.modulos : []).map(String));
    const master = await databaseService.getPool(DEFAULT_TENANT);
    const adminId = parseInt(req.user?.id) || null;
    const tx = new sql.Transaction(master);
    await tx.begin();
    try {
      for (const m of MODULOS_DISPONIBLES) {
        await new sql.Request(tx)
          .input('empKey', sql.NVarChar, empKey).input('mod', sql.NVarChar, m.key)
          .input('allow', sql.Bit, elegidos.has(m.key) ? 1 : 0).input('by', sql.Int, adminId)
          .query(`
            MERGE INTRANET_EMPRESAS_MODULOS AS t
            USING (SELECT @empKey AS EMP_KEY, @mod AS MODULO_KEY) AS s
            ON t.EMP_KEY = s.EMP_KEY AND t.MODULO_KEY = s.MODULO_KEY
            WHEN MATCHED THEN UPDATE SET ALLOW = @allow, GRANTED_BY = @by, GRANTED_AT = GETDATE()
            WHEN NOT MATCHED THEN INSERT (EMP_KEY, MODULO_KEY, ALLOW, GRANTED_BY) VALUES (s.EMP_KEY, s.MODULO_KEY, @allow, @by);
          `);
      }
      await new sql.Request(tx).input('k', sql.NVarChar, empKey)
        .query('UPDATE dbo.INTRANET_EMPRESAS SET EMP_MODULOS_ESTRICTO = 1 WHERE EMP_KEY = @k');
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateEmpresaModulosCache(empKey);
    try { getIO(empKey).emit('empresa-modulos-updated'); } catch (_) { /* sin sockets */ }
    await guardarAsistente(empKey, { completos: ['modulos'] });
    await auditar(req, 'modulos', empKey, { activos: [...elegidos] });
    res.json({ success: true, data: { activos: await modulosActivosDe(empKey) } });
  } catch (e) {
    responderError(res, e, 'guardarModulos');
  }
};

// ── Roles ────────────────────────────────────────────────────────────────────
// Solo se guardan permisos de módulos activos en la empresa.
async function filasPermiso(empKey, modulos, acciones) {
  const activos = new Set(await modulosActivosDe(empKey));
  const mods = (Array.isArray(modulos) ? modulos : []).filter((m) => activos.has(String(m)));
  const accs = {};
  for (const [m, lista] of Object.entries(acciones && typeof acciones === 'object' ? acciones : {})) {
    if (activos.has(m) && Array.isArray(lista)) accs[m] = lista.filter((a) => String(a) !== 'crear-empresas');
  }
  return { rows: rolCtrl().buildPermisoRows(mods, accs), mods };
}

async function escribirPermisos(tx, rolId, rows) {
  await new sql.Request(tx).input('id', sql.Int, rolId).query('DELETE FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID=@id');
  for (const r of rows) {
    await new sql.Request(tx).input('id', sql.Int, rolId).input('m', sql.NVarChar, r.moduloKey).input('a', sql.NVarChar, r.accionKey)
      .query('INSERT INTO dbo.INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY) VALUES (@id, @m, @a)');
  }
}

exports.crearRol = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ success: false, message: 'El nombre del rol es obligatorio' });
    const dup = await pool.request().input('n', sql.NVarChar, nombre).query('SELECT 1 FROM dbo.INTRANET_ROLES WHERE NOMBRE=@n');
    if (dup.recordset.length) return res.status(400).json({ success: false, message: 'Ya existe un rol con ese nombre' });
    const { rows, mods } = await filasPermiso(empKey, req.body?.modulos, req.body?.acciones);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const ins = await new sql.Request(tx)
        .input('n', sql.NVarChar, nombre)
        .input('d', sql.NVarChar, req.body?.descripcion ? String(req.body.descripcion).trim() : null)
        .input('b', sql.NVarChar, rolCtrl().derivarRolBase(mods))
        .query('INSERT INTO dbo.INTRANET_ROLES (NOMBRE, DESCRIPCION, ROL_BASE, ES_SISTEMA, ACTIVO) VALUES (@n, @d, @b, 0, 1); SELECT SCOPE_IDENTITY() AS ROL_ID;');
      const rolId = Number(ins.recordset[0].ROL_ID);
      await escribirPermisos(tx, rolId, rows);
      await tx.commit();
      await auditar(req, 'rol-crear', empKey, { rolId, nombre, permisos: rows.length });
      res.status(201).json({ success: true, data: { rolId } });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (e) {
    responderError(res, e, 'crearRol');
  }
};

exports.actualizarRol = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    const rolId = Number(req.params.rolId);
    const rolR = await pool.request().input('id', sql.Int, rolId).query('SELECT ES_SISTEMA FROM dbo.INTRANET_ROLES WHERE ROL_ID=@id');
    if (!rolR.recordset.length) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    const esSistema = rolR.recordset[0].ES_SISTEMA === true || rolR.recordset[0].ES_SISTEMA === 1;
    const { rows, mods } = await filasPermiso(empKey, req.body?.modulos, req.body?.acciones);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      // Roles de sistema: solo sus permisos (el nombre y el código no cambian).
      if (!esSistema) {
        await new sql.Request(tx).input('id', sql.Int, rolId)
          .input('n', sql.NVarChar, req.body?.nombre ? String(req.body.nombre).trim() : null)
          .input('d', sql.NVarChar, req.body?.descripcion ? String(req.body.descripcion).trim() : null)
          .input('b', sql.NVarChar, rolCtrl().derivarRolBase(mods))
          .query('UPDATE dbo.INTRANET_ROLES SET NOMBRE=ISNULL(@n, NOMBRE), DESCRIPCION=@d, ROL_BASE=@b WHERE ROL_ID=@id');
      }
      await escribirPermisos(tx, rolId, rows);
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    await auditar(req, 'rol-editar', empKey, { rolId, permisos: rows.length });
    res.json({ success: true });
  } catch (e) {
    responderError(res, e, 'actualizarRol');
  }
};

exports.eliminarRol = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    const rolId = Number(req.params.rolId);
    const rolR = await pool.request().input('id', sql.Int, rolId).query('SELECT ES_SISTEMA FROM dbo.INTRANET_ROLES WHERE ROL_ID=@id');
    if (!rolR.recordset.length) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    if (rolR.recordset[0].ES_SISTEMA === true || rolR.recordset[0].ES_SISTEMA === 1) {
      return res.status(400).json({ success: false, message: 'Los roles de sistema no se eliminan; puedes ajustar sus permisos' });
    }
    const uso = await pool.request().input('id', sql.Int, rolId).query('SELECT COUNT(*) AS n FROM dbo.INTRANET_PERFILES WHERE ROL_ID=@id AND ACTIVO=1');
    if (uso.recordset[0].n > 0) return res.status(400).json({ success: false, message: 'Hay perfiles que usan este rol; cámbialos primero' });
    await pool.request().input('id', sql.Int, rolId).query('DELETE FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID=@id; DELETE FROM dbo.INTRANET_ROLES WHERE ROL_ID=@id;');
    await auditar(req, 'rol-eliminar', empKey, { rolId });
    res.json({ success: true });
  } catch (e) {
    responderError(res, e, 'eliminarRol');
  }
};

// ── Perfiles ─────────────────────────────────────────────────────────────────
function datosPerfil(b) {
  const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  const str = (v) => (v ? String(v).trim() : null);
  return { nombre: str(b?.nombre), descripcion: str(b?.descripcion), rolId: num(b?.rolId), puesto: str(b?.puesto), departamento: str(b?.departamento), idHorario: num(b?.idHorario) };
}

exports.guardarPerfil = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    const d = datosPerfil(req.body);
    const perfilId = req.params.perfilId ? Number(req.params.perfilId) : null;
    if (!d.nombre) return res.status(400).json({ success: false, message: 'El nombre del perfil es obligatorio' });
    if (!d.rolId) return res.status(400).json({ success: false, message: 'Elige el rol del perfil' });
    const dup = await pool.request().input('n', sql.NVarChar, d.nombre).input('id', sql.Int, perfilId)
      .query('SELECT 1 FROM dbo.INTRANET_PERFILES WHERE NOMBRE=@n AND (@id IS NULL OR PERFIL_ID <> @id)');
    if (dup.recordset.length) return res.status(400).json({ success: false, message: 'Ya existe un perfil con ese nombre' });

    const r = pool.request()
      .input('n', sql.NVarChar, d.nombre).input('d', sql.NVarChar, d.descripcion).input('rol', sql.Int, d.rolId)
      .input('p', sql.NVarChar, d.puesto).input('dep', sql.NVarChar, d.departamento).input('h', sql.Int, d.idHorario);
    let id = perfilId;
    if (perfilId) {
      await r.input('id', sql.Int, perfilId).query(`UPDATE dbo.INTRANET_PERFILES SET NOMBRE=@n, DESCRIPCION=@d, ROL_ID=@rol, PUESTO=@p, DEPARTAMENTO=@dep, ID_HORARIO=@h WHERE PERFIL_ID=@id`);
    } else {
      const ins = await r.query(`INSERT INTO dbo.INTRANET_PERFILES (NOMBRE, DESCRIPCION, ROL_ID, PUESTO, DEPARTAMENTO, ID_HORARIO, ACTIVO)
                                 VALUES (@n, @d, @rol, @p, @dep, @h, 1); SELECT SCOPE_IDENTITY() AS PERFIL_ID;`);
      id = Number(ins.recordset[0].PERFIL_ID);
    }
    await auditar(req, perfilId ? 'perfil-editar' : 'perfil-crear', empKey, { perfilId: id, nombre: d.nombre });
    res.status(perfilId ? 200 : 201).json({ success: true, data: { perfilId: id } });
  } catch (e) {
    responderError(res, e, 'guardarPerfil');
  }
};

exports.eliminarPerfil = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    await pool.request().input('id', sql.Int, Number(req.params.perfilId)).query('DELETE FROM dbo.INTRANET_PERFILES WHERE PERFIL_ID=@id');
    await auditar(req, 'perfil-eliminar', empKey, { perfilId: Number(req.params.perfilId) });
    res.json({ success: true });
  } catch (e) {
    responderError(res, e, 'eliminarPerfil');
  }
};

// ── Usuarios ─────────────────────────────────────────────────────────────────
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USUARIO_RE = /^[A-Za-z0-9._-]{3,50}$/;

async function perfilesPorId(pool) {
  const rs = await pool.request().query('SELECT PERFIL_ID, NOMBRE, ROL_ID, PUESTO, DEPARTAMENTO, ID_HORARIO FROM dbo.INTRANET_PERFILES WHERE ACTIVO=1');
  return rs.recordset;
}

// Una fila de usuario → datos listos para crear, o la lista de errores.
function revisarFila(f, perfiles, usuariosExistentes, usuariosEnLote) {
  const errores = [];
  const nombres = String(f.nombres ?? f.nombre ?? '').trim();
  const usuario = String(f.usuario ?? '').trim();
  const correo = String(f.correo ?? '').trim();
  const contra = f.contra ? String(f.contra) : null;
  if (!nombres) errores.push('Falta el nombre');
  if (!USUARIO_RE.test(usuario)) errores.push('Usuario inválido (3 a 50 letras, números, punto, guion)');
  else if (usuariosExistentes.has(usuario.toLowerCase())) errores.push('Ese usuario ya existe en la empresa');
  else if (usuariosEnLote.has(usuario.toLowerCase())) errores.push('Usuario repetido en el archivo');
  if (correo && !CORREO_RE.test(correo)) errores.push('Correo inválido');
  let perfil = null;
  if (f.perfilId) perfil = perfiles.find((p) => p.PERFIL_ID === Number(f.perfilId)) ?? null;
  else if (f.perfil) perfil = perfiles.find((p) => p.NOMBRE.trim().toLowerCase() === String(f.perfil).trim().toLowerCase()) ?? null;
  if (!perfil && !f.rolId) errores.push(f.perfil ? `No existe el perfil "${f.perfil}"` : 'Falta el perfil');
  if (contra) { const err = validarPoliticaPassword(contra); if (err) errores.push(err); }
  return { nombres, usuario, correo, contra, perfil, rolId: f.rolId ? Number(f.rolId) : perfil?.ROL_ID ?? null, errores };
}

async function crearDesdeFila(pool, empKey, fila, grantedBy) {
  const contra = fila.contra || passwordTemporal();
  const u = await creacion.crearUsuarioEnEmpresa(pool, empKey, {
    nombres: fila.nombres, usuario: fila.usuario, contra, correo: fila.correo || null,
    rolId: fila.rolId, puesto: fila.perfil?.PUESTO, departamento: fila.perfil?.DEPARTAMENTO, idHorario: fila.perfil?.ID_HORARIO,
  }, grantedBy);
  // La contraseña solo se devuelve si la generó el sistema (para entregarla una vez).
  return { id: u.id, nombre: fila.nombres, usuario: fila.usuario, perfil: fila.perfil?.NOMBRE ?? null, contraTemporal: fila.contra ? null : contra };
}

// POST /:empKey/usuarios { nombres, usuario, correo?, perfilId? | rolId?, contra? }
exports.crearUsuario = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    const existentes = new Set((await pool.request().query('SELECT NEUS_USUARIO FROM NEUS_USUARIOS')).recordset.map((r) => String(r.NEUS_USUARIO).toLowerCase()));
    const fila = revisarFila(req.body || {}, await perfilesPorId(pool), existentes, new Set());
    if (fila.errores.length) return res.status(400).json({ success: false, message: fila.errores.join(' · ') });
    const creado = await crearDesdeFila(pool, empKey, fila, parseInt(req.user?.id) || null);
    await guardarAsistente(empKey, { completos: ['usuarios'] });
    await auditar(req, 'usuario-crear', empKey, { usuario: creado.usuario, perfil: creado.perfil });
    res.status(201).json({ success: true, data: creado });
  } catch (e) {
    responderError(res, e, 'crearUsuario');
  }
};

// POST /:empKey/usuarios/importar { filas: [...], confirmar: boolean }
// Sin confirmar: revisa cada fila y devuelve los errores (vista previa).
// Con confirmar: crea SOLO las filas válidas y devuelve las contraseñas temporales.
exports.importarUsuarios = async (req, res) => {
  try {
    const empKey = empKeyDe(req);
    const pool = await poolListo(empKey);
    const filasIn = Array.isArray(req.body?.filas) ? req.body.filas : [];
    if (!filasIn.length) return res.status(400).json({ success: false, message: 'El archivo no tiene filas' });
    if (filasIn.length > 1000) return res.status(400).json({ success: false, message: 'Máximo 1000 usuarios por archivo' });

    const perfiles = await perfilesPorId(pool);
    const existentes = new Set((await pool.request().query('SELECT NEUS_USUARIO FROM NEUS_USUARIOS')).recordset.map((r) => String(r.NEUS_USUARIO).toLowerCase()));
    const enLote = new Set();
    const revisadas = filasIn.map((f, i) => {
      const r = revisarFila(f, perfiles, existentes, enLote);
      if (r.usuario) enLote.add(r.usuario.toLowerCase());
      return { fila: i + 2, ...r }; // +2: encabezado del Excel en la fila 1
    });
    const validas = revisadas.filter((r) => !r.errores.length);

    if (!req.body?.confirmar) {
      return res.json({
        success: true,
        data: {
          total: revisadas.length, validas: validas.length, conError: revisadas.length - validas.length,
          filas: revisadas.map((r) => ({ fila: r.fila, nombres: r.nombres, usuario: r.usuario, correo: r.correo, perfil: r.perfil?.NOMBRE ?? null, errores: r.errores })),
        },
      });
    }

    const creados = [];
    const fallidos = [];
    for (const f of validas) {
      try { creados.push(await crearDesdeFila(pool, empKey, f, parseInt(req.user?.id) || null)); } catch (err) { fallidos.push({ fila: f.fila, usuario: f.usuario, error: err.message }); }
    }
    if (creados.length) await guardarAsistente(empKey, { completos: ['usuarios'] });
    await auditar(req, 'usuarios-importar', empKey, { creados: creados.length, fallidos: fallidos.length, omitidos: revisadas.length - validas.length });
    res.json({ success: true, data: { creados, fallidos, omitidos: revisadas.length - validas.length } });
  } catch (e) {
    responderError(res, e, 'importarUsuarios');
  }
};
