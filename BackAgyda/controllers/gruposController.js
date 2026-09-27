const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { SEGMENTOS, TIPOS, porKey, descriptor, ids } = require('../services/gruposService');

// Configuración → Usuarios y Seguridad → Grupos: todos los grupos de usuarios
// de AGYDA (de distintos módulos) en un solo lugar. La lógica de cada tipo
// vive en services/gruposService.js.

const pool = (req) => databaseService.getPool(req.user?.empresa);
const ctxDe = (req) => ({ tenantKey: req.user?.empresa, userId: req.user?.id || null });
const tipoDe = (req, res) => {
  const t = porKey[req.params.tipo];
  if (!t) res.status(404).json({ success: false, message: 'Tipo de grupo desconocido' });
  return t;
};
const auditar = (p, req, accion, detalle) => logAudit(p, {
  userId: req.user?.id, userName: req.user?.nombre || null, modulo: 'usuarios', accion,
  entidadId: String(req.params.id || ''), detalle: { tipo: req.params.tipo, ...detalle }, ip: req.ip,
}).catch(() => {});

// GET /api/grupos — segmentos con sus tipos y sus grupos (con conteo de miembros).
exports.resumen = async (req, res) => {
  try {
    const p = await pool(req);
    // En secuencia: son consultas cortas y así no se acaparan conexiones.
    const tipos = [];
    for (const t of TIPOS) {
      try {
        tipos.push({ ...descriptor(t), grupos: await t.listar(p) });
      } catch (e) {
        console.warn(`grupos.resumen ${t.key}:`, e.message);
        tipos.push({ ...descriptor(t), grupos: [], error: 'No disponible' });
      }
    }
    res.json({ success: true, data: { segmentos: SEGMENTOS, tipos } });
  } catch (e) {
    console.error('grupos.resumen:', e.message);
    res.status(500).json({ success: false, message: 'Error al cargar los grupos' });
  }
};

// GET /api/grupos/opciones — catálogos para crear (campañas del omnicanal) y
// usuarios internos activos para agregar como miembros.
exports.opciones = async (req, res) => {
  try {
    const p = await pool(req);
    const campanias = await p.request().query('SELECT CM2_ID id, CM2_NOMBRE nombre FROM CCO_CAMPANIAS WHERE CM2_ACTIVO = 1 ORDER BY CM2_NOMBRE')
      .then((r) => r.recordset).catch(() => []);
    const usuarios = (await p.request().query(`SELECT NEUS_ID id, NEUS_NOMBRES nombre, NEUS_TIPOUSUARIO tipo, NEUS_PUESTO puesto, NEUS_FOTO_URL fotoUrl
      FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 AND NEUS_TIPOUSUARIO <> 'CL' ORDER BY NEUS_NOMBRES`)).recordset;
    // Clientes (para los grupos de atención), con el grupo que ya los atiende.
    const clientes = (await p.request().query(`
      SELECT c.CONT_ID id, COALESCE(NULLIF(c.CONT_EMPRESA, ''), c.CONT_NOMBRE) nombre, g.AG_NOMBRE grupo
      FROM CRM_CONTACTOS c
      LEFT JOIN ATC_GRUPO_CLIENTES gc ON gc.AGC_CONT_ID = c.CONT_ID
      LEFT JOIN ATC_GRUPOS g ON g.AG_ID = gc.AGC_GRUPO_ID
      WHERE c.CONT_ES_CLIENTE = 1 AND c.CONT_ACTIVO = 1 ORDER BY nombre`).catch(() => ({ recordset: [] }))).recordset;
    res.json({ success: true, data: { campanias, usuarios, clientes } });
  } catch (e) {
    console.error('grupos.opciones:', e.message);
    res.status(500).json({ success: false, message: 'Error al cargar las opciones' });
  }
};

// GET /api/grupos/:tipo/:id/miembros
exports.miembros = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  try {
    res.json({ success: true, data: await t.miembros(await pool(req), req.params.id) });
  } catch (e) {
    console.error('grupos.miembros:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los miembros' });
  }
};

// POST /api/grupos/:tipo/:id/miembros { usuarioIds }
exports.agregarMiembros = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (t.soloLectura || !t.agregar) return res.status(400).json({ success: false, message: 'Este grupo se administra desde su propio módulo' });
  const usuarioIds = ids(req.body?.usuarioIds);
  if (!usuarioIds.length) return res.status(400).json({ success: false, message: 'Elige al menos un usuario' });
  try {
    const p = await pool(req);
    // Solo usuarios internos activos.
    const validos = (await p.request().query(`SELECT NEUS_ID id FROM NEUS_USUARIOS
      WHERE NEUS_ACTIVO = 1 AND NEUS_TIPOUSUARIO <> 'CL' AND NEUS_ID IN (${usuarioIds.join(',')})`)).recordset.map((r) => r.id);
    if (!validos.length) return res.status(400).json({ success: false, message: 'Usuarios no válidos' });
    await t.agregar(p, req.params.id, validos, ctxDe(req));
    await auditar(p, req, 'grupo-agregar-miembros', { usuarioIds: validos });
    res.json({ success: true, data: { agregados: validos.length } });
  } catch (e) {
    console.error('grupos.agregarMiembros:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudieron agregar' });
  }
};

// DELETE /api/grupos/:tipo/:id/miembros/:usuarioId
exports.quitarMiembro = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (t.soloLectura || !t.quitar) return res.status(400).json({ success: false, message: 'Este grupo se administra desde su propio módulo' });
  const uid = Number(req.params.usuarioId);
  if (!Number.isInteger(uid) || uid <= 0) return res.status(400).json({ success: false, message: 'Usuario inválido' });
  try {
    const p = await pool(req);
    await t.quitar(p, req.params.id, uid, ctxDe(req));
    await auditar(p, req, 'grupo-quitar-miembro', { usuarioId: uid });
    res.json({ success: true });
  } catch (e) {
    console.error('grupos.quitarMiembro:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudo quitar' });
  }
};

// Clientes que atiende un grupo (solo tipos con `clientes`, p. ej. atención a clientes).
// GET /api/grupos/:tipo/:id/clientes
exports.clientes = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.clientes) return res.status(400).json({ success: false, message: 'Este tipo de grupo no tiene clientes' });
  try {
    res.json({ success: true, data: await t.clientes(await pool(req), req.params.id) });
  } catch (e) {
    console.error('grupos.clientes:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los clientes' });
  }
};

// POST /api/grupos/:tipo/:id/clientes { clienteIds }
exports.agregarClientes = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.agregarClientes) return res.status(400).json({ success: false, message: 'Este tipo de grupo no tiene clientes' });
  const clienteIds = ids(req.body?.clienteIds);
  if (!clienteIds.length) return res.status(400).json({ success: false, message: 'Elige al menos un cliente' });
  try {
    const p = await pool(req);
    const validos = (await p.request().query(`SELECT CONT_ID id FROM CRM_CONTACTOS
      WHERE CONT_ES_CLIENTE = 1 AND CONT_ID IN (${clienteIds.join(',')})`)).recordset.map((r) => r.id);
    if (!validos.length) return res.status(400).json({ success: false, message: 'Clientes no válidos' });
    await t.agregarClientes(p, Number(req.params.id), validos, ctxDe(req));
    await auditar(p, req, 'grupo-agregar-clientes', { clienteIds: validos });
    res.json({ success: true, data: { agregados: validos.length } });
  } catch (e) {
    console.error('grupos.agregarClientes:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudieron asignar' });
  }
};

// DELETE /api/grupos/:tipo/:id/clientes/:clienteId
exports.quitarCliente = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.quitarCliente) return res.status(400).json({ success: false, message: 'Este tipo de grupo no tiene clientes' });
  try {
    const p = await pool(req);
    await t.quitarCliente(p, Number(req.params.id), Number(req.params.clienteId), ctxDe(req));
    await auditar(p, req, 'grupo-quitar-cliente', { clienteId: Number(req.params.clienteId) });
    res.json({ success: true });
  } catch (e) {
    console.error('grupos.quitarCliente:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudo quitar' });
  }
};

// Configuración propia del grupo (grupos del omnicanal: canales, modo de
// comunicación y link del marcador).
// GET /api/grupos/:tipo/:id/config
exports.leerConfig = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.config) return res.status(400).json({ success: false, message: 'Este tipo de grupo no tiene configuración' });
  try {
    res.json({ success: true, data: await t.config.leer(await pool(req), Number(req.params.id)) });
  } catch (e) {
    console.error('grupos.leerConfig:', e.message);
    res.status(400).json({ success: false, message: e.message || 'Error al leer la configuración' });
  }
};

// PUT /api/grupos/:tipo/:id/config
exports.guardarConfig = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.config) return res.status(400).json({ success: false, message: 'Este tipo de grupo no tiene configuración' });
  try {
    const p = await pool(req);
    const data = await t.config.guardar(p, Number(req.params.id), req.body || {}, ctxDe(req));
    await auditar(p, req, 'grupo-configurar', data);
    res.json({ success: true, data });
  } catch (e) {
    console.error('grupos.guardarConfig:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudo guardar' });
  }
};

// POST /api/grupos/:tipo { nombre, descripcion?, campaniaId? }
exports.crear = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.crear) return res.status(400).json({ success: false, message: 'Este tipo de grupo no se crea aquí' });
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
  try {
    const p = await pool(req);
    const id = await t.crear(p, { nombre, descripcion: String(req.body?.descripcion || '').trim() || null, campaniaId: req.body?.campaniaId }, ctxDe(req));
    req.params.id = String(id);
    await auditar(p, req, 'grupo-crear', { nombre });
    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    console.error('grupos.crear:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudo crear' });
  }
};

// GET /api/grupos/:tipo/:id/enlaces — lo enlazado al grupo, para elegir qué
// borrar junto con él (solo grupos de Contact Center / atención a clientes).
exports.enlaces = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.enlaces) return res.json({ success: true, data: null });
  try {
    res.json({ success: true, data: await t.enlaces(await pool(req), req.params.id) });
  } catch (e) {
    console.error('grupos.enlaces:', e.message);
    res.status(500).json({ success: false, message: 'Error al consultar lo enlazado' });
  }
};

// DELETE /api/grupos/:tipo/:id  body opcional { borrar: { campanias, skills, canales, formularios } }
exports.eliminar = async (req, res) => {
  const t = tipoDe(req, res); if (!t) return;
  if (!t.eliminar) return res.status(400).json({ success: false, message: 'Este tipo de grupo no se elimina aquí' });
  try {
    const p = await pool(req);
    const b = req.body?.borrar;
    const borrar = b && typeof b === 'object'
      ? { campanias: ids(b.campanias), skills: ids(b.skills), canales: ids(b.canales), formularios: ids(b.formularios) }
      : null;
    const borrado = await t.eliminar(p, req.params.id, ctxDe(req), borrar);
    await auditar(p, req, 'grupo-eliminar', { borrar, borrado });
    res.json({ success: true, data: { borrado: borrado || null } });
  } catch (e) {
    console.error('grupos.eliminar:', e.message);
    res.status(400).json({ success: false, message: e.message || 'No se pudo eliminar' });
  }
};

