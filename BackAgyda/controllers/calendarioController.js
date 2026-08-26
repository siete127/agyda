const sql = require('mssql');
const dbConfig = require('../config/database');
const notificationService = require('../services/notificationService');

// =============================================
// CONTROLADOR DE CALENDARIO
// =============================================

// Extrae menciones @usuario de un texto libre (letras/números/._- sin espacios,
// igual criterio que el autocompletado del frontend) y devuelve nombres únicos.
function extraerMenciones(texto) {
  if (!texto || typeof texto !== 'string') return [];
  const matches = texto.match(/@([a-zA-Z0-9._-]+(?:\s[a-zA-Z0-9._-]+)?)/g) || [];
  const nombres = matches.map((m) => m.slice(1).trim()).filter(Boolean);
  return [...new Set(nombres)];
}

// Resuelve menciones de texto a usuarios reales (excluyendo al propio creador)
// y crea una notificación inmediata para cada uno.
async function notificarMenciones(pool, { descripcion, idEvento, titulo, idCreador, nombreCreador, tenantKey }) {
  const nombresMencionados = extraerMenciones(descripcion);
  if (nombresMencionados.length === 0) return;

  const usuarios = await pool.request().query(`
    SELECT NEUS_ID as id, NEUS_NOMBRES as nombre
    FROM NEUS_USUARIOS
    WHERE NEUS_ACTIVO = 1
  `);

  for (const nombreMencion of nombresMencionados) {
    const match = usuarios.recordset.find(
      (u) => u.nombre && u.nombre.toLowerCase() === nombreMencion.toLowerCase()
    );
    if (!match || Number(match.id) === Number(idCreador)) continue;

    try {
      await notificationService.createNotification({
        usuarioId: match.id,
        mensaje: `${nombreCreador || 'Alguien'} te mencionó en el evento "${titulo}"`,
        tipo: 'calendario',
        dataExtra: { eventoId: idEvento, action: 'ver_evento' },
        tenantKey,
      });
    } catch (e) {
      console.error('Error notificando mención de calendario:', e);
    }
  }
}

/**
 * Obtener eventos próximos para mostrar en la portada
 */
const getEventosProximos = async (req, res) => {
  try {
    const { dias = 30, limite = 10 } = req.query;
    
    const pool = await sql.connect(dbConfig);
    let eventos = [];
    try {
      const sp = await pool.request()
        .input('dias_adelante', sql.Int, parseInt(dias))
        .input('limite', sql.Int, parseInt(limite))
        .execute('sp_obtener_eventos_proximos');
      eventos = sp.recordset || [];
    } catch (e) {
      console.warn('⚠️ sp_obtener_eventos_proximos falló, usando consulta directa:', e.message);
    }

    if (!eventos || eventos.length === 0) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + parseInt(dias));
      const direct = await pool.request()
        .input('start', sql.DateTime, start)
        .input('end', sql.DateTime, end)
        .input('lim', sql.Int, parseInt(limite))
        .query(`
          SELECT TOP (@lim)
            e.*,
            u.NEUS_NOMBRES AS usuario_nombre,
            NULL AS usuario_apellidos
          FROM neus_calendario_eventos e
          LEFT JOIN NEUS_USUARIOS u ON e.id_usuario = u.NEUS_ID
          WHERE e.activo = 1
            AND e.fecha_inicio >= @start
            AND e.fecha_inicio < @end
          ORDER BY e.fecha_inicio ASC
        `);
      eventos = direct.recordset || [];
    }

    return res.status(200).json({
      success: true,
      eventos
    });
  } catch (error) {
    console.error('Error al obtener eventos próximos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener eventos próximos',
      error: error.message
    });
  }
};

/**
 * Obtener todos los eventos del calendario con filtros
 */
const getEventos = async (req, res) => {
  try {
    const { 
      fecha_inicio, 
      fecha_fin, 
      tipo_evento, 
      mes, 
      anio 
    } = req.query;

    const pool = await sql.connect(dbConfig);
    let query = `
      SELECT 
        e.*,
        u.NEUS_NOMBRES AS usuario_nombre,
        NULL AS usuario_apellidos,
        uc.NEUS_NOMBRES AS creador_nombre,
        NULL AS creador_apellidos
      FROM neus_calendario_eventos e
      LEFT JOIN NEUS_USUARIOS u ON e.id_usuario = u.NEUS_ID
      LEFT JOIN NEUS_USUARIOS uc ON e.creado_por = uc.NEUS_ID
      WHERE e.activo = 1
    `;

    const request = pool.request();

    if (fecha_inicio && fecha_fin) {
      query += ' AND e.fecha_inicio >= @fecha_inicio AND e.fecha_inicio <= @fecha_fin';
      request.input('fecha_inicio', sql.DateTime, new Date(fecha_inicio));
      request.input('fecha_fin', sql.DateTime, new Date(fecha_fin));
    } else if (mes && anio) {
      query += ' AND MONTH(e.fecha_inicio) = @mes AND YEAR(e.fecha_inicio) = @anio';
      request.input('mes', sql.Int, parseInt(mes));
      request.input('anio', sql.Int, parseInt(anio));
    }

    if (tipo_evento) {
      query += ' AND e.tipo_evento = @tipo_evento';
      request.input('tipo_evento', sql.NVarChar, tipo_evento);
    }

    query += ' ORDER BY e.fecha_inicio ASC';

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      eventos: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener eventos',
      error: error.message
    });
  }
};

/**
 * Obtener un evento específico por ID
 */
const getEventoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('id_evento', sql.Int, id)
      .query(`
        SELECT 
          e.*,
          u.NEUS_NOMBRES AS usuario_nombre,
          NULL AS usuario_apellidos,
          u.username AS usuario_email,
          uc.NEUS_NOMBRES AS creador_nombre,
          NULL AS creador_apellidos
        FROM neus_calendario_eventos e
        LEFT JOIN NEUS_USUARIOS u ON e.id_usuario = u.NEUS_ID
        LEFT JOIN NEUS_USUARIOS uc ON e.creado_por = uc.NEUS_ID
        WHERE e.id_evento = @id_evento AND e.activo = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Obtener participantes
    const participantes = await pool.request()
      .input('id_evento', sql.Int, id)
      .query(`
        SELECT 
          p.*,
          u.NEUS_NOMBRES AS nombre,
          NULL AS apellidos,
          u.username AS email
        FROM neus_calendario_participantes p
        INNER JOIN NEUS_USUARIOS u ON p.id_usuario = u.NEUS_ID
        WHERE p.id_evento = @id_evento
      `);

    const evento = result.recordset[0];
    evento.participantes = participantes.recordset;

    return res.status(200).json({
      success: true,
      evento
    });
  } catch (error) {
    console.error('Error al obtener evento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener evento',
      error: error.message
    });
  }
};

/**
 * Crear un nuevo evento (solo administradores)
 */
const crearEvento = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      tipo_evento,
      fecha_inicio,
      fecha_fin,
      todo_el_dia,
      color,
      ubicacion,
      es_recurrente,
      frecuencia,
      intervalo,
      dias_semana,
      fecha_fin_recurrencia,
      recordatorio_minutos,
      participantes
    } = req.body;

    const user = req.user || {};
    const id_usuario_creador = (user.NEUS_ID || user.id || user.userId || null);
    const userRole = (user.tipoUsuario || user.role || user.tipousuario || '').toString().toLowerCase();
    const isAdmin = ['adm', 'admin', 'ad'].includes(userRole);

    // Regla de acceso:
    // - Permitir a cualquier usuario autenticado crear 'fecha_importante'
    // - Para cualquier otro tipo de evento, exigir rol ADM
    if ((tipo_evento || '').toString().toLowerCase() !== 'fecha_importante' && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: solo administradores pueden crear este tipo de evento'
      });
    }

    // Sanitizar longitudes para evitar truncamientos en SQL
    const safeTitulo = (titulo || '').toString().slice(0, 200);
    const safeColor = (color || '').toString().slice(0, 20) || null;
    const safeUbicacion = (ubicacion || '').toString().slice(0, 200) || null;

    // Validaciones
    if (!titulo || !tipo_evento || !fecha_inicio) {
      return res.status(400).json({
        success: false,
        message: 'Título, tipo de evento y fecha de inicio son obligatorios'
      });
    }

    const pool = await sql.connect(dbConfig);
    
    // Insertar evento
    const result = await pool.request()
      .input('titulo', sql.NVarChar, safeTitulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('tipo_evento', sql.NVarChar, tipo_evento)
      .input('fecha_inicio', sql.DateTime, new Date(fecha_inicio))
      .input('fecha_fin', sql.DateTime, fecha_fin ? new Date(fecha_fin) : null)
      .input('todo_el_dia', sql.Bit, todo_el_dia || false)
      .input('color', sql.NVarChar, safeColor)
      .input('ubicacion', sql.NVarChar, safeUbicacion)
      .input('es_recurrente', sql.Bit, es_recurrente || false)
      .input('frecuencia', sql.NVarChar, frecuencia || null)
      .input('intervalo', sql.Int, intervalo || 1)
      .input('dias_semana', sql.NVarChar, dias_semana || null)
      .input('fecha_fin_recurrencia', sql.Date, fecha_fin_recurrencia ? new Date(fecha_fin_recurrencia) : null)
      .input('recordatorio_minutos', sql.Int, recordatorio_minutos || null)
      .input('creado_por', sql.Int, id_usuario_creador)
      .query(`
        INSERT INTO neus_calendario_eventos 
        (titulo, descripcion, tipo_evento, fecha_inicio, fecha_fin, todo_el_dia, color, ubicacion,
         es_recurrente, frecuencia, intervalo, dias_semana, fecha_fin_recurrencia, recordatorio_minutos,
         creado_por, fecha_creacion, activo)
        VALUES 
        (@titulo, @descripcion, @tipo_evento, @fecha_inicio, @fecha_fin, @todo_el_dia, @color, @ubicacion,
         @es_recurrente, @frecuencia, @intervalo, @dias_semana, @fecha_fin_recurrencia, @recordatorio_minutos,
         @creado_por, GETDATE(), 1);
        
        SELECT SCOPE_IDENTITY() AS id_evento;
      `);

    const id_evento = result.recordset[0].id_evento;

    // Notificar a usuarios mencionados con @ en la descripción
    await notificarMenciones(pool, {
      descripcion,
      idEvento: id_evento,
      titulo: safeTitulo,
      idCreador: id_usuario_creador,
      nombreCreador: user.nombre || user.NOMBRE,
      tenantKey: req.user?.empresa,
    });

    // Agregar participantes si hay
    if (participantes && Array.isArray(participantes) && participantes.length > 0) {
      for (const id_participante of participantes) {
        await pool.request()
          .input('id_evento', sql.Int, id_evento)
          .input('id_usuario', sql.Int, id_participante)
          .query(`
            INSERT INTO neus_calendario_participantes (id_evento, id_usuario, fecha_creacion)
            VALUES (@id_evento, @id_usuario, GETDATE())
          `);
      }
    }

    // Crear notificaciones si hay recordatorio
    if (recordatorio_minutos && participantes && participantes.length > 0) {
      const fecha_notificacion = new Date(fecha_inicio);
      fecha_notificacion.setMinutes(fecha_notificacion.getMinutes() - recordatorio_minutos);

      for (const id_participante of participantes) {
        await pool.request()
          .input('id_evento', sql.Int, id_evento)
          .input('id_usuario', sql.Int, id_participante)
          .input('fecha_programada', sql.DateTime, fecha_notificacion)
          .query(`
            INSERT INTO neus_calendario_notificaciones (id_evento, id_usuario, fecha_programada, fecha_creacion)
            VALUES (@id_evento, @id_usuario, @fecha_programada, GETDATE())
          `);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Evento creado exitosamente',
      id_evento
    });
  } catch (error) {
    console.error('Error al crear evento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear evento',
      error: error.message
    });
  }
};

/**
 * Actualizar un evento existente
 */
const actualizarEvento = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titulo,
      descripcion,
      tipo_evento,
      fecha_inicio,
      fecha_fin,
      todo_el_dia,
      color,
      ubicacion,
      es_recurrente,
      frecuencia,
      intervalo,
      dias_semana,
      fecha_fin_recurrencia,
      recordatorio_minutos
    } = req.body;

    const id_usuario_modificador = req.session.userId;

    const pool = await sql.connect(dbConfig);
    
    // Verificar que el evento existe
    const eventoExistente = await pool.request()
      .input('id_evento', sql.Int, id)
      .query('SELECT * FROM neus_calendario_eventos WHERE id_evento = @id_evento AND activo = 1');

    if (eventoExistente.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Actualizar evento
    await pool.request()
      .input('id_evento', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('tipo_evento', sql.NVarChar, tipo_evento)
      .input('fecha_inicio', sql.DateTime, new Date(fecha_inicio))
      .input('fecha_fin', sql.DateTime, fecha_fin ? new Date(fecha_fin) : null)
      .input('todo_el_dia', sql.Bit, todo_el_dia || false)
      .input('color', sql.NVarChar, color || null)
      .input('ubicacion', sql.NVarChar, ubicacion || null)
      .input('es_recurrente', sql.Bit, es_recurrente || false)
      .input('frecuencia', sql.NVarChar, frecuencia || null)
      .input('intervalo', sql.Int, intervalo || 1)
      .input('dias_semana', sql.NVarChar, dias_semana || null)
      .input('fecha_fin_recurrencia', sql.Date, fecha_fin_recurrencia ? new Date(fecha_fin_recurrencia) : null)
      .input('recordatorio_minutos', sql.Int, recordatorio_minutos || null)
      .input('modificado_por', sql.Int, id_usuario_modificador)
      .query(`
        UPDATE neus_calendario_eventos
        SET titulo = @titulo,
            descripcion = @descripcion,
            tipo_evento = @tipo_evento,
            fecha_inicio = @fecha_inicio,
            fecha_fin = @fecha_fin,
            todo_el_dia = @todo_el_dia,
            color = @color,
            ubicacion = @ubicacion,
            es_recurrente = @es_recurrente,
            frecuencia = @frecuencia,
            intervalo = @intervalo,
            dias_semana = @dias_semana,
            fecha_fin_recurrencia = @fecha_fin_recurrencia,
            recordatorio_minutos = @recordatorio_minutos,
            modificado_por = @modificado_por,
            fecha_modificacion = GETDATE()
        WHERE id_evento = @id_evento
      `);

    return res.status(200).json({
      success: true,
      message: 'Evento actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar evento',
      error: error.message
    });
  }
};

/**
 * Eliminar un evento (soft delete)
 */
const eliminarEvento = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await sql.connect(dbConfig);
    
    const result = await pool.request()
      .input('id_evento', sql.Int, id)
      .query(`
        UPDATE neus_calendario_eventos
        SET activo = 0, fecha_modificacion = GETDATE()
        WHERE id_evento = @id_evento
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar evento',
      error: error.message
    });
  }
};

/**
 * Sincronizar cumpleaños desde la tabla de usuarios
 */
const sincronizarCumpleanos = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    await pool.request().execute('sp_sincronizar_cumpleanos');

    return res.status(200).json({
      success: true,
      message: 'Cumpleaños sincronizados exitosamente'
    });
  } catch (error) {
    console.error('Error al sincronizar cumpleaños:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al sincronizar cumpleaños',
      error: error.message
    });
  }
};

/**
 * Agregar participantes a un evento
 */
const agregarParticipantes = async (req, res) => {
  try {
    const { id } = req.params;
    const { participantes } = req.body;

    if (!participantes || !Array.isArray(participantes) || participantes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar un array de IDs de participantes'
      });
    }

    const pool = await sql.connect(dbConfig);

    // Verificar que el evento existe
    const eventoExistente = await pool.request()
      .input('id_evento', sql.Int, id)
      .query('SELECT * FROM neus_calendario_eventos WHERE id_evento = @id_evento AND activo = 1');

    if (eventoExistente.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Agregar participantes
    for (const id_participante of participantes) {
      try {
        await pool.request()
          .input('id_evento', sql.Int, id)
          .input('id_usuario', sql.Int, id_participante)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM neus_calendario_participantes WHERE id_evento = @id_evento AND id_usuario = @id_usuario)
            BEGIN
              INSERT INTO neus_calendario_participantes (id_evento, id_usuario, fecha_creacion)
              VALUES (@id_evento, @id_usuario, GETDATE())
            END
          `);
      } catch (error) {
        console.error(`Error al agregar participante ${id_participante}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Participantes agregados exitosamente'
    });
  } catch (error) {
    console.error('Error al agregar participantes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al agregar participantes',
      error: error.message
    });
  }
};

/**
 * Eliminar un participante de un evento
 */
const eliminarParticipante = async (req, res) => {
  try {
    const { id, id_usuario } = req.params;

    const pool = await sql.connect(dbConfig);
    
    const result = await pool.request()
      .input('id_evento', sql.Int, id)
      .input('id_usuario', sql.Int, id_usuario)
      .query(`
        DELETE FROM neus_calendario_participantes
        WHERE id_evento = @id_evento AND id_usuario = @id_usuario
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Participante no encontrado en este evento'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Participante eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar participante:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar participante',
      error: error.message
    });
  }
};

/**
 * Actualizar estado de asistencia de un participante
 */
const actualizarEstadoAsistencia = async (req, res) => {
  try {
    const { id, id_usuario } = req.params;
    const { estado } = req.body;

    if (!['pendiente', 'confirmado', 'rechazado'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado de asistencia inválido'
      });
    }

    const pool = await sql.connect(dbConfig);
    
    const result = await pool.request()
      .input('id_evento', sql.Int, id)
      .input('id_usuario', sql.Int, id_usuario)
      .input('estado', sql.NVarChar, estado)
      .query(`
        UPDATE neus_calendario_participantes
        SET estado_asistencia = @estado,
            fecha_respuesta = GETDATE()
        WHERE id_evento = @id_evento AND id_usuario = @id_usuario
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Participante no encontrado en este evento'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Estado de asistencia actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar estado de asistencia:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar estado de asistencia',
      error: error.message
    });
  }
};

/**
 * Obtener cumpleaños del mes actual
 */
const getCumpleanosMes = async (req, res) => {
  try {
    const { mes, anio } = req.query;
    const mesActual = mes ? parseInt(mes) : new Date().getMonth() + 1;
    const anioActual = anio ? parseInt(anio) : new Date().getFullYear();

    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('mes', sql.Int, mesActual)
      .input('anio', sql.Int, anioActual)
      .query(`
        SELECT 
          u.NEUS_ID AS id_usuario,
          u.NEUS_NOMBRES AS nombre,
          NULL AS apellidos,
          u.username AS email,
          CONVERT(VARCHAR(10), u.fecha_cumpleanos, 23) AS fecha_cumpleanos,
          DATEDIFF(YEAR, u.fecha_cumpleanos, GETDATE()) AS edad,
          DAY(u.fecha_cumpleanos) AS dia_cumpleanos
        FROM NEUS_USUARIOS u
        WHERE u.fecha_cumpleanos IS NOT NULL
          AND u.NEUS_ACTIVO = 1
          AND MONTH(u.fecha_cumpleanos) = @mes
        ORDER BY DAY(u.fecha_cumpleanos) ASC
      `);

    console.log('🎂 CUMPLEAÑOS RAW:', JSON.stringify(result.recordset.slice(0, 3)));
    return res.status(200).json({
      success: true,
      cumpleanos: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener cumpleaños del mes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener cumpleaños del mes',
      error: error.message
    });
  }
};

module.exports = {
  getEventosProximos,
  getEventos,
  getEventoPorId,
  crearEvento,
  actualizarEvento,
  eliminarEvento,
  sincronizarCumpleanos,
  agregarParticipantes,
  eliminarParticipante,
  actualizarEstadoAsistencia,
  getCumpleanosMes
};
