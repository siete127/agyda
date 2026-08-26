const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { getUserAllowedActions } = require('../middleware/moduleAccess');

// Vista consolidada de casos ABIERTOS (pendiente/en proceso) de Consultas,
// Aclaraciones y Quejas, para dar seguimiento sin entrar a cada módulo por
// separado. Cada fuente respeta su propia regla de visibilidad ya existente:
// - Consultas/Aclaraciones: 'gestionar-*' (atencion-cliente) ve todas, si no solo las propias.
// - Quejas: rol AD ve todas (igual que QuejasPage), si no solo las propias.
exports.getCasosAbiertos = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const rol = String(req.user?.tipoUsuario || req.user?.role || '').toUpperCase();

    const pool = await databaseService.getPool(req.user?.empresa);
    const allowed = await getUserAllowedActions(userId, 'atencion-cliente');
    const puedeTodasConsultas = allowed.has('*') || allowed.has('gestionar-consultas');
    const puedeTodasAclaraciones = allowed.has('*') || allowed.has('gestionar-aclaraciones');
    const puedeTodasQuejas = rol === 'AD';

    const casos = [];

    // Consultas
    try {
      const req1 = pool.request().input('estatus1', sql.NVarChar, 'pendiente').input('estatus2', sql.NVarChar, 'proceso');
      if (!puedeTodasConsultas) req1.input('usuarioId', sql.Int, userId);
      const rs = await req1.query(`
        SELECT c.CONSULTA_ID as id, c.ASUNTO as titulo, c.CLIENTE_NOMBRE as clienteNombre,
               c.ESTATUS as estatus, c.FECHA as fecha, u.NEUS_NOMBRES as usuarioNombre
        FROM CONSULTAS c
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USUARIO_ID
        WHERE c.ESTATUS IN (@estatus1, @estatus2) ${puedeTodasConsultas ? '' : 'AND c.USUARIO_ID = @usuarioId'}
        ORDER BY c.FECHA DESC
      `);
      for (const r of rs.recordset) {
        casos.push({ tipo: 'consulta', id: r.id, titulo: r.titulo, clienteNombre: r.clienteNombre, estatus: r.estatus, fecha: r.fecha, usuarioNombre: r.usuarioNombre, linkTo: `/atencion-cliente/consultas?consultaId=${r.id}` });
      }
    } catch (e) { console.warn('Seguimiento: error leyendo consultas:', e.message); }

    // Aclaraciones
    try {
      const req2 = pool.request().input('estatus1', sql.NVarChar, 'pendiente').input('estatus2', sql.NVarChar, 'proceso');
      if (!puedeTodasAclaraciones) req2.input('usuarioId', sql.Int, userId);
      const rs = await req2.query(`
        SELECT a.ACLARACION_ID as id, a.MOTIVO as titulo, a.CLIENTE_NOMBRE as clienteNombre,
               a.ESTATUS as estatus, a.FECHA as fecha, u.NEUS_NOMBRES as usuarioNombre
        FROM ACLARACIONES a
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.USUARIO_ID
        WHERE a.ESTATUS IN (@estatus1, @estatus2) ${puedeTodasAclaraciones ? '' : 'AND a.USUARIO_ID = @usuarioId'}
        ORDER BY a.FECHA DESC
      `);
      for (const r of rs.recordset) {
        casos.push({ tipo: 'aclaracion', id: r.id, titulo: r.titulo, clienteNombre: r.clienteNombre, estatus: r.estatus, fecha: r.fecha, usuarioNombre: r.usuarioNombre, linkTo: `/atencion-cliente/aclaraciones?aclaracionId=${r.id}` });
      }
    } catch (e) { console.warn('Seguimiento: error leyendo aclaraciones:', e.message); }

    // Quejas (estatus: pendiente/proceso, mismos valores que Consultas/Aclaraciones)
    try {
      const req3 = pool.request().input('estatus1', sql.NVarChar, 'pendiente').input('estatus2', sql.NVarChar, 'proceso');
      if (!puedeTodasQuejas) req3.input('usuarioId', sql.SmallInt, userId);
      const rs = await req3.query(`
        SELECT q.QUEJA_ID as id, q.TITULO as titulo, q.ESTATUS as estatus, q.FECHA as fecha,
               u.NEUS_NOMBRES as usuarioNombre
        FROM QUEJAS q
        LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = q.USUARIO_ID
        WHERE q.ESTATUS IN (@estatus1, @estatus2) ${puedeTodasQuejas ? '' : 'AND q.USUARIO_ID = @usuarioId'}
        ORDER BY q.FECHA DESC
      `);
      for (const r of rs.recordset) {
        casos.push({ tipo: 'queja', id: r.id, titulo: r.titulo, clienteNombre: null, estatus: r.estatus, fecha: r.fecha, usuarioNombre: r.usuarioNombre, linkTo: `/quejas?quejaId=${r.id}` });
      }
    } catch (e) { console.warn('Seguimiento: error leyendo quejas:', e.message); }

    casos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    res.json({ success: true, data: casos });
  } catch (e) {
    console.error('Error obteniendo casos abiertos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
