const sql = require('mssql');
const socketService = require('./socketService');

// Grupos de atención a clientes: grupos de Contact Center (CC_EQUIPOS con
// EQ_ATIENDE_CLIENTES = 1) que además atienden clientes (CC_EQUIPO_CLIENTES,
// cada cliente en un solo grupo). Si el cliente no tiene asesor individual:
//  - su portal habla con el grupo completo (asesores + supervisores) en un
//    chat de Mensajería propio del cliente ("Atención · Empresa");
//  - los avisos de "Atención a clientes" de ese cliente les llegan a los
//    integrantes del grupo en lugar de a todos los que tienen el aviso del módulo.

// Grupo activo que atiende al cliente, con sus integrantes activos (o null).
// miembros: asesores y supervisores; asesores: solo los asesores.
async function grupoDeCliente(pool, contId) {
  const g = (await pool.request().input('c', sql.Int, contId).query(`
    SELECT e.EQ_ID id, e.EQ_NOMBRE nombre, e.EQ_DESCRIPCION descripcion
    FROM CC_EQUIPO_CLIENTES gc JOIN CC_EQUIPOS e ON e.EQ_ID = gc.EQCL_EQUIPO_ID AND e.EQ_ACTIVO = 1 AND e.EQ_ATIENDE_CLIENTES = 1
    WHERE gc.EQCL_CONT_ID = @c`).catch(() => ({ recordset: [] }))).recordset[0];
  if (!g) return null;
  const miembros = (await pool.request().input('g', sql.Int, g.id).query(`
    SELECT u.NEUS_ID id, u.NEUS_NOMBRES nombre, u.NEUS_CORREO correo, u.NEUS_FOTO_URL fotoUrl, m.EQM_ROL rol
    FROM CC_EQUIPO_MIEMBROS m JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.EQM_USUARIO_ID AND u.NEUS_ACTIVO = 1
    WHERE m.EQM_EQUIPO_ID = @g ORDER BY u.NEUS_NOMBRES`)).recordset;
  return { ...g, miembros, asesores: miembros.filter((m) => m.rol === 'agente') };
}

// A quién avisar de algo de un cliente en "Atención a clientes": los
// integrantes de su grupo de atención; si no tiene, quienes tienen el aviso
// por correo del módulo (comportamiento anterior).
async function usuariosAtencionDeCliente(pool, tenantKey, contId) {
  if (contId) {
    const g = await grupoDeCliente(pool, contId).catch(() => null);
    if (g?.miembros.length) return g.miembros.map((m) => m.id);
  }
  const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
  return (await getUsuariosParaNotificarCorreo('atencion-cliente', tenantKey)).map(Number).filter(Boolean);
}

const emitir = (tenantKey, uids, canalId, evento, payload) => {
  try {
    const io = socketService.getIO(tenantKey);
    if (!io) return;
    io.to(`mensajeria:canal:${canalId}`).emit(evento, payload);
    for (const u of uids) io.to(`user:${u}`).emit(evento, payload);
  } catch (_) { /* sin socket se ve al recargar */ }
};

// Abre (o reutiliza) el chat del cliente con su grupo: un canal de grupo por
// cliente y grupo (MC_DM_KEY 'atc:grupo:cliente'). En cada apertura se
// sincroniza: entran el usuario del portal que lo abre y los integrantes
// actuales del grupo (asesores y supervisores); salen los internos que ya no
// son del grupo. Devuelve el canal con la forma de Mensajería (la de un DM).
async function abrirChatGrupo(pool, { tenantKey, grupo, contId, clienteNombre, usuarioId }) {
  const key = `atc:${grupo.id}:${contId}`;
  const nombre = `Atención · ${clienteNombre || 'Cliente'}`.slice(0, 150);
  const internos = grupo.miembros.map((m) => m.id);
  let canal = (await pool.request().input('k', sql.NVarChar(40), key)
    .query('SELECT MC_ID id FROM MSJ_CANALES WHERE MC_DM_KEY = @k')).recordset[0];
  let creado = false;
  if (!canal) {
    try {
      canal = (await pool.request().input('k', sql.NVarChar(40), key).input('n', sql.NVarChar(150), nombre)
        .input('d', sql.NVarChar(500), `Chat del cliente con el grupo de atención "${grupo.nombre}"`)
        .input('por', sql.Int, usuarioId)
        .query(`INSERT INTO MSJ_CANALES (MC_TIPO, MC_NOMBRE, MC_DESCRIPCION, MC_DM_KEY, MC_CREADO_POR)
                OUTPUT INSERTED.MC_ID id VALUES ('grupo', @n, @d, @k, @por)`)).recordset[0];
      creado = true;
    } catch (e) {
      // Carrera: otro request lo creó al mismo tiempo.
      canal = (await pool.request().input('k', sql.NVarChar(40), key)
        .query('SELECT MC_ID id FROM MSJ_CANALES WHERE MC_DM_KEY = @k')).recordset[0];
      if (!canal) throw e;
    }
  }
  const canalId = canal.id;

  const deseados = [...new Set([usuarioId, ...internos])];
  const nuevos = [];
  for (const u of deseados) {
    const r = await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, u).query(`
      IF NOT EXISTS (SELECT 1 FROM MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID = @c AND MCM_USUARIO_ID = @u)
        INSERT INTO MSJ_CANAL_MIEMBROS (MCM_CANAL_ID, MCM_USUARIO_ID, MCM_ROL) VALUES (@c, @u, 'miembro')`);
    if ((r.rowsAffected || []).some((n) => n > 0)) nuevos.push(u);
  }
  // Internos que ya no son del grupo salen del chat (los usuarios del portal se quedan).
  const salen = (await pool.request().input('c', sql.Int, canalId).query(`
    DELETE m OUTPUT DELETED.MCM_USUARIO_ID u
    FROM MSJ_CANAL_MIEMBROS m JOIN NEUS_USUARIOS u ON u.NEUS_ID = m.MCM_USUARIO_ID
    WHERE m.MCM_CANAL_ID = @c AND u.NEUS_TIPOUSUARIO <> 'CL'
      AND m.MCM_USUARIO_ID NOT IN (${internos.concat(0).join(',')})`)).recordset.map((r) => r.u);
  // Nombre al día si cambió la empresa.
  await pool.request().input('c', sql.Int, canalId).input('n', sql.NVarChar(150), nombre)
    .query('UPDATE MSJ_CANALES SET MC_NOMBRE = @n WHERE MC_ID = @c AND ISNULL(MC_NOMBRE, \'\') <> @n');

  const fila = (await pool.request().input('c', sql.Int, canalId).query(`
    SELECT MC_ID id, MC_TIPO tipo, MC_NOMBRE nombre, MC_DESCRIPCION descripcion, MC_CREADO_POR creadoPor,
           MC_FECHA_CREACION fechaCreacion, MC_ULTIMO_MENSAJE_FECHA ultimoMensajeFecha
    FROM MSJ_CANALES WHERE MC_ID = @c`)).recordset[0];
  const data = { ...fila, otroUsuarioId: null, ultimoMensajePreview: null, noLeidos: 0 };

  if (creado) emitir(tenantKey, deseados, canalId, 'mensajeria:canal_creado', data);
  else if (nuevos.length) {
    const usuarios = (await pool.request().query(`SELECT NEUS_ID id, NEUS_NOMBRES nombre FROM NEUS_USUARIOS WHERE NEUS_ID IN (${nuevos.join(',')})`)).recordset;
    emitir(tenantKey, nuevos, canalId, 'mensajeria:miembro_agregado', { canalId, usuarios });
  }
  for (const u of salen) emitir(tenantKey, [u], canalId, 'mensajeria:miembro_removido', { canalId, usuarioId: u });
  return { canal: data, creado };
}

module.exports = { grupoDeCliente, usuariosAtencionDeCliente, abrirChatGrupo };
