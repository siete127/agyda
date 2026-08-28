const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const livechatController = require('./livechatController');
const ticketController = require('./ticketController');

// Resuelve la campaña "Soporte TI" (sembrada idempotentemente por nombre en
// ensureLivechatCampanasSchema) y su grupo por defecto. El flujo interno
// nunca usa LCA_TOKEN — ese campo solo existe porque la columna lo exige.
async function resolverCampaniaGrupoSoporteTI(pool) {
  const r = await pool.request().query(`
    SELECT TOP 1 c.LCA_ID as campaniaId, c.LCA_MAX_CHATS_POR_AGENTE as maxChatsPorAgente, g.LG_ID as grupoId
    FROM dbo.LIVECHAT_CAMPANIAS c
    JOIN dbo.LIVECHAT_GRUPOS g ON g.LG_CAMPANIA_ID = c.LCA_ID AND g.LG_ACTIVO = 1
    WHERE c.LCA_NOMBRE = N'Soporte TI' AND c.LCA_ACTIVO = 1
    ORDER BY g.LG_ID ASC
  `);
  return r.recordset[0] || null;
}

// POST /api/livechat/interno/conversaciones — autenticado. Cualquier empleado
// logueado inicia un chat de soporte TI con su identidad real (no un visitante
// anónimo como el widget público). El chat genera automáticamente un ticket
// vinculado (LC_TICKET_ID), asignado al mismo técnico que atienda el chat.
exports.iniciarConversacionInterna = async (req, res) => {
  try {
    const { motivo } = req.body;
    const solicitanteId = req.user?.id;
    if (!solicitanteId) return res.status(401).json({ success: false, message: 'Sesión requerida' });
    if (!motivo || !motivo.trim()) return res.status(400).json({ success: false, message: 'Describe brevemente tu problema' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tenantKey = livechatController.tenantKeyDe(req);

    const camp = await resolverCampaniaGrupoSoporteTI(pool);
    if (!camp) return res.status(500).json({ success: false, message: 'La campaña "Soporte TI" no está configurada' });

    const config = await livechatController.getConfig(pool, camp.campaniaId);
    if (livechatController.isFueraDeHorario(config)) {
      return res.status(503).json({ success: false, code: 'FUERA_DE_HORARIO', message: config?.LCF_MSG_FUERA_HORARIO || 'Fuera de horario de atención.' });
    }

    const maxChats = camp.maxChatsPorAgente || config?.LCF_MAX_CHATS_POR_AGENTE || 5;
    const agente = await livechatController.buscarAgenteDisponible(pool, maxChats, {
      campaniaId: camp.campaniaId, grupoId: camp.grupoId, usarMotorReglas: true, area: 'TI',
    });

    const rsUser = await pool.request().input('uid', sql.Int, solicitanteId)
      .query(`SELECT NEUS_NOMBRES as nombre, NEUS_CORREO as correo FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);
    const solicitante = rsUser.recordset[0] || {};

    const insert = await pool.request()
      .input('nombre', sql.NVarChar, solicitante.nombre || null)
      .input('email', sql.NVarChar, solicitante.correo || null)
      .input('motivo', sql.NVarChar, motivo)
      .input('agenteId', sql.Int, agente ? agente.usuarioId : null)
      .input('agenteNombre', sql.NVarChar, agente ? agente.nombre : null)
      .input('estado', sql.NVarChar, agente ? 'activa' : 'esperando')
      .input('campaniaId', sql.Int, camp.campaniaId)
      .input('grupoId', sql.Int, camp.grupoId)
      .input('solicitanteId', sql.Int, solicitanteId)
      .query(`
        INSERT INTO dbo.LIVECHAT_CONVERSACIONES
          (LC_VISITANTE_NOMBRE, LC_VISITANTE_EMAIL, LC_MOTIVO, LC_AGENTE_ID, LC_AGENTE_NOMBRE, LC_ESTADO,
           LC_ORIGEN, LC_CAMPANIA_ID, LC_GRUPO_ID, LC_SOLICITANTE_ID)
        OUTPUT INSERTED.LC_ID as id
        VALUES (@nombre, @email, @motivo, @agenteId, @agenteNombre, @estado,
                'empleado_interno', @campaniaId, @grupoId, @solicitanteId)
      `);
    const conversacionId = insert.recordset[0].id;

    await livechatController.insertarMensajeSistema(pool, conversacionId, `Motivo: ${motivo}`);

    // Ticket vinculado — reusa la lógica de creación ya existente. Si falla,
    // no se revierte la conversación (sin transacción distribuida por
    // simplicidad): se loggea y la conversación queda sin LC_TICKET_ID.
    let ticketResult = { ok: false };
    try {
      ticketResult = await ticketController.crearTicketInterno(pool, {
        solicitanteId,
        area: 'TI',
        titulo: `Chat interno: ${motivo.slice(0, 120)}`,
        descripcion: motivo,
        clasificacion: 'consulta',
        asignadoA: agente ? agente.usuarioId : undefined,
        tenantKey,
        esAD: false,
        canalOrigen: 'chat_en_vivo',
      });
    } catch (e) {
      console.warn('⚠️ Error creando ticket vinculado al chat interno de Soporte TI:', e?.message || e);
    }

    if (ticketResult.ok) {
      await pool.request()
        .input('convId', sql.Int, conversacionId)
        .input('ticketId', sql.Int, ticketResult.data.id)
        .query(`UPDATE dbo.LIVECHAT_CONVERSACIONES SET LC_TICKET_ID = @ticketId WHERE LC_ID = @convId`);
    } else {
      console.warn('⚠️ No se pudo crear el ticket vinculado al chat interno:', ticketResult.message);
    }

    if (agente) {
      await pool.request().input('usuarioId', sql.Int, agente.usuarioId).query(`
        UPDATE dbo.LIVECHAT_AGENTE_ESTADO SET LAE_CONVERSACIONES_ACTIVAS = LAE_CONVERSACIONES_ACTIVAS + 1 WHERE LAE_USUARIO_ID = @usuarioId
      `);
      const bienvenida = config?.LCF_MSG_BIENVENIDA;
      if (bienvenida) await livechatController.insertarMensajeSistema(pool, conversacionId, bienvenida);
      try {
        socketService.getIO(tenantKey).to(`user:${agente.usuarioId}`).emit('livechat:nueva_conversacion', { conversacionId });
      } catch (e) {
        console.warn('⚠️ No se pudo emitir livechat:nueva_conversacion:', e?.message || e);
      }
    } else {
      // Sin técnico TI disponible: se encola igual que el flujo público, para
      // que la conversación no quede huérfana y el usuario vea su posición.
      const ticketColaR = await pool.request().query(`SELECT ISNULL(MAX(LCO_TICKET), 0) + 1 as siguienteTicket FROM dbo.LIVECHAT_COLA`);
      const ticketCola = ticketColaR.recordset[0].siguienteTicket;
      await pool.request().input('convId', sql.Int, conversacionId).input('ticket', sql.Int, ticketCola)
        .query(`INSERT INTO dbo.LIVECHAT_COLA (LCO_CONVERSACION_ID, LCO_TICKET) VALUES (@convId, @ticket)`);
      try {
        socketService.getIO(tenantKey).emit('livechat:nueva_en_cola', { conversacionId });
      } catch (e) {
        console.warn('⚠️ No se pudo emitir livechat:nueva_en_cola:', e?.message || e);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        conversacionId,
        ticketId: ticketResult.ok ? ticketResult.data.id : null,
        estado: agente ? 'activa' : 'esperando',
        agenteAsignado: !!agente,
      },
    });
  } catch (error) {
    console.error('Error iniciando conversación interna de Soporte TI:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resolverCampaniaGrupoSoporteTI = resolverCampaniaGrupoSoporteTI;
