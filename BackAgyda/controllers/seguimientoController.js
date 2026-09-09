const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { getUserAllowedActions } = require('../middleware/moduleAccess');

// Vista consolidada de CASOS ABIERTOS (pendiente / en proceso / en espera de
// cliente / escalado) para dar seguimiento sin entrar caso por caso.
//
// Fase 5 del rediseño de Atención al Cliente: antes esto hacía 3 queries
// dispersas contra CONSULTAS / ACLARACIONES / QUEJAS (sin Incidencia). Ahora es
// una sola query sobre CASOS, que ya incluye los 4 tipos (consulta, aclaración,
// queja, incidencia) migrados en Fase 2 y creados desde Fase 4.
//
// Reglas de visibilidad (se conservan las de antes):
// - tipos consulta/aclaracion/incidencia: con 'casos-gestionar' (o '*') se ven
//   todos; si no, solo los propios (creados por o asignados al usuario).
// - tipo queja: rol AD ve todos (igual que QuejasPage histórico); si no, solo
//   los propios. Deuda técnica replicada, no se unifica (decisión del usuario).
const ESTATUS_ABIERTOS = ['pendiente', 'en_proceso', 'en_espera_cliente', 'escalado'];

exports.getCasosAbiertos = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });
    const rol = String(req.user?.tipoUsuario || req.user?.role || '').toUpperCase();

    const pool = await databaseService.getPool(req.user?.empresa);
    const allowed = await getUserAllowedActions(userId, 'atencion-cliente');
    const puedeGestionarCasos = allowed.has('*') || allowed.has('casos-gestionar');
    const esAD = rol === 'AD';

    const request = pool.request().input('userId', sql.Int, userId);
    ESTATUS_ABIERTOS.forEach((e, i) => request.input(`est${i}`, sql.NVarChar, e));
    const inEstatus = ESTATUS_ABIERTOS.map((_, i) => `@est${i}`).join(', ');

    // Filtro de visibilidad por tipo, construido en SQL:
    //  - queja:  esAD ? (todas) : solo propias
    //  - resto:  puedeGestionarCasos ? (todas) : solo propias
    const propio = '(K.CASO_CREADO_POR = @userId OR K.CASO_ASIGNADO_A = @userId)';
    const filtroVisibilidad =
      puedeGestionarCasos && esAD
        ? '1 = 1'
        : puedeGestionarCasos
          ? `(K.CASO_TIPO <> 'queja' OR ${propio})`
          : esAD
            ? `(K.CASO_TIPO = 'queja' OR ${propio})`
            : propio;

    const rs = await request.query(`
      SELECT K.CASO_ID as id, K.CASO_FOLIO as folio, K.CASO_TIPO as tipo,
             K.CASO_TITULO as titulo,
             COALESCE(C.CONT_NOMBRE, K.CASO_CLIENTE_NOMBRE_LIBRE) as clienteNombre,
             K.CASO_ESTATUS as estatus, K.CASO_PRIORIDAD as prioridad,
             K.CASO_FECHA_LIMITE_SLA as fechaLimiteSla,
             K.CASO_FECHA_CREACION as fecha,
             U.NEUS_NOMBRES as usuarioNombre
      FROM CASOS K
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CASO_CONTACTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = COALESCE(K.CASO_ASIGNADO_A, K.CASO_CREADO_POR)
      WHERE K.CASO_ACTIVO = 1
        AND K.CASO_ESTATUS IN (${inEstatus})
        AND (${filtroVisibilidad})
      ORDER BY K.CASO_FECHA_CREACION DESC
    `);

    const data = rs.recordset.map((r) => ({
      tipo: r.tipo,
      id: r.id,
      folio: r.folio,
      titulo: r.titulo,
      clienteNombre: r.clienteNombre || null,
      estatus: r.estatus,
      prioridad: r.prioridad,
      fechaLimiteSla: r.fechaLimiteSla,
      fecha: r.fecha,
      usuarioNombre: r.usuarioNombre,
      linkTo: `/atencion-cliente/casos?casoId=${r.id}`,
    }));

    res.json({ success: true, data });
  } catch (e) {
    console.error('Error obteniendo casos abiertos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
