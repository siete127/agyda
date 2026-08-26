const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService'); // ya importado
const { logAudit } = require('../services/auditService');

// Normaliza y deduplica la lista de imágenes (acepta string JSON o array)
const normalizeImagenesArray = (imagenes) => {
  if (!imagenes) return [];

  let arr = imagenes;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch (e) {
      // Fallback básico para strings separadas por coma
      arr = arr.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(arr)) return [];

  const seen = new Set();
  const deduped = [];
  
  for (const img of arr) {
    if (!img || typeof img !== 'string') continue;
    const trimmed = img.trim();
    if (!trimmed) continue;
    
    // Normalización robusta: remover protocolo, puerto, query strings y fragments
    // Esto asegura que https://... y http://... se consideren iguales
    let normalized = trimmed
      .toLowerCase()
      .replace(/^https?:\/\//i, '') // remover protocolo
      .replace(/:\d+/g, '') // remover puertos
      .replace(/[?#].*$/, '') // remover query strings y fragments
      .replace(/\/+$/, '') // remover trailing slashes
      .replace(/\s+/g, '%20') // normalizar espacios codificados
      .replace(/^\/+/, ''); // remover leading slashes
    
    if (!normalized) continue;
    if (seen.has(normalized)) {
      console.log(`⚠️ Imagen duplicada detectada y removida: ${trimmed}`);
      continue;
    }
    
    seen.add(normalized);
    deduped.push(trimmed);
  }

  if (arr.length > deduped.length) {
    console.log(`✅ Imágenes deduplicadas: ${arr.length} → ${deduped.length}`);
  }
  return deduped;
};

const dedupeImagenesInRows = (rows = []) => rows.map((row) => ({
  ...row,
  imagenes: normalizeImagenesArray(row.imagenes),
}));

exports.getNoticias = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const userId = req.user && (req.user.id || req.user.userId || req.user.sub)
      ? Number(req.user.id || req.user.userId || req.user.sub)
      : null;
    const includeInactive = String(req.query.includeInactive || req.query.all || '0').toLowerCase();
    const showAll = includeInactive === '1' || includeInactive === 'true' || includeInactive === 'yes';
    const whereClause = showAll ? '1=1' : 'NOTI_ACTIVO = 1';
    
    const request = pool.request();
    request.input('uid', sql.Int, Number.isFinite(userId) ? userId : null);

    const result = await request.query(`
      SELECT 
        NOTI_ID as id,
        NOTI_TITULO as titulo,
        NOTI_CONTENIDO as contenido,
        NOTI_PORTADA as imagenPortada,
        ISNULL(NOTI_FOCO, 'center') as imagenFoco,
        NOTI_IMAGENES as imagenes,
        NOTI_AUTOR_ID as autorId,
        NOTI_AUTOR_NOMBRE as autorNombre,
        NOTI_FECHA_CREACION as fechaCreacion,
        NOTI_FECHA_ACTUALIZACION as fechaActualizacion,
        NOTI_ACTIVO as activo,
        NOTI_DESTACADA as destacada,
        NOTI_CATEGORIA as categoria,
        NOTI_COMENTARIOS_HABILITADOS as comentariosHabilitados,
        ISNULL(rt.total, 0) as reaccionesTotal,
        mr.REAC_TIPO as miReaccion
      FROM INTRANET_NOTICIAS
      LEFT JOIN (
        SELECT REAC_NOTI_ID, COUNT(1) as total
        FROM dbo.INTRANET_NOTICIAS_REACCIONES
        GROUP BY REAC_NOTI_ID
      ) rt ON rt.REAC_NOTI_ID = NOTI_ID
      LEFT JOIN dbo.INTRANET_NOTICIAS_REACCIONES mr
        ON mr.REAC_NOTI_ID = NOTI_ID AND mr.REAC_USUARIO_ID = @uid
      WHERE ${whereClause}
      ORDER BY NOTI_FECHA_CREACION DESC
    `);
    
    const data = dedupeImagenesInRows(result.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo noticias:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNoticiasDestacadas = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const userId = req.user && (req.user.id || req.user.userId || req.user.sub)
      ? Number(req.user.id || req.user.userId || req.user.sub)
      : null;
    const includeInactive = String(req.query.includeInactive || req.query.all || '0').toLowerCase();
    const whereActivo = (includeInactive === '1' || includeInactive === 'true' || includeInactive === 'yes')
      ? '1=1'
      : 'NOTI_ACTIVO = 1';
      
    const request = pool.request();
    request.input('uid', sql.Int, Number.isFinite(userId) ? userId : null);

    const result = await request.query(`
      SELECT 
        NOTI_ID as id,
        NOTI_TITULO as titulo,
        NOTI_CONTENIDO as contenido,
        NOTI_PORTADA as imagenPortada,
        ISNULL(NOTI_FOCO, 'center') as imagenFoco,
        NOTI_IMAGENES as imagenes,
        NOTI_AUTOR_ID as autorId,
        NOTI_AUTOR_NOMBRE as autorNombre,
        NOTI_FECHA_CREACION as fechaCreacion,
        NOTI_FECHA_ACTUALIZACION as fechaActualizacion,
        NOTI_ACTIVO as activo,
        NOTI_DESTACADA as destacada,
        NOTI_CATEGORIA as categoria,
        NOTI_COMENTARIOS_HABILITADOS as comentariosHabilitados,
        ISNULL(rt.total, 0) as reaccionesTotal,
        mr.REAC_TIPO as miReaccion
      FROM INTRANET_NOTICIAS
      LEFT JOIN (
        SELECT REAC_NOTI_ID, COUNT(1) as total
        FROM dbo.INTRANET_NOTICIAS_REACCIONES
        GROUP BY REAC_NOTI_ID
      ) rt ON rt.REAC_NOTI_ID = NOTI_ID
      LEFT JOIN dbo.INTRANET_NOTICIAS_REACCIONES mr
        ON mr.REAC_NOTI_ID = NOTI_ID AND mr.REAC_USUARIO_ID = @uid
      WHERE ${whereActivo} AND NOTI_DESTACADA = 1
      ORDER BY NOTI_FECHA_CREACION DESC
    `);
    
    const data = dedupeImagenesInRows(result.recordset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo noticias destacadas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNoticiaById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const userId = req.user && (req.user.id || req.user.userId || req.user.sub)
      ? Number(req.user.id || req.user.userId || req.user.sub)
      : null;
    
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('uid', sql.Int, Number.isFinite(userId) ? userId : null);

    const result = await request.query(`
        SELECT 
          NOTI_ID as id,
          NOTI_TITULO as titulo,
          NOTI_CONTENIDO as contenido,
          NOTI_PORTADA as imagenPortada,
        ISNULL(NOTI_FOCO, 'center') as imagenFoco,
          NOTI_IMAGENES as imagenes,
          NOTI_AUTOR_ID as autorId,
          NOTI_AUTOR_NOMBRE as autorNombre,
          NOTI_FECHA_CREACION as fechaCreacion,
          NOTI_FECHA_ACTUALIZACION as fechaActualizacion,
          NOTI_ACTIVO as activo,
          NOTI_DESTACADA as destacada,
          NOTI_CATEGORIA as categoria,
          NOTI_COMENTARIOS_HABILITADOS as comentariosHabilitados,
          ISNULL(rt.total, 0) as reaccionesTotal,
          mr.REAC_TIPO as miReaccion
        FROM INTRANET_NOTICIAS
        LEFT JOIN (
          SELECT REAC_NOTI_ID, COUNT(1) as total
          FROM dbo.INTRANET_NOTICIAS_REACCIONES
          GROUP BY REAC_NOTI_ID
        ) rt ON rt.REAC_NOTI_ID = NOTI_ID
        LEFT JOIN dbo.INTRANET_NOTICIAS_REACCIONES mr
          ON mr.REAC_NOTI_ID = NOTI_ID AND mr.REAC_USUARIO_ID = @uid
        WHERE NOTI_ID = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }
    
    const data = dedupeImagenesInRows(result.recordset);
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error obteniendo noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createNoticia = async (req, res) => {
  try {
    const {
      titulo,
      contenido,
      imagenPortada,
      imagenFoco,
      imagenes,
      autorId,
      autorNombre,
      destacada,
      categoria
    } = req.body;

    if (!titulo || !contenido || !autorId || !autorNombre) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const imagenesLimpias = normalizeImagenesArray(imagenes);

    const imagenesJson = JSON.stringify(imagenesLimpias);
    const focoValido = ['top', 'center', 'bottom'].includes(imagenFoco) ? imagenFoco : 'center';

    const result = await pool.request()
      .input('titulo', sql.NVarChar, titulo)
      .input('contenido', sql.NVarChar, contenido)
      .input('imagenPortada', sql.NVarChar, imagenPortada || null)
      .input('imagenFoco', sql.NVarChar, focoValido)
      .input('imagenes', sql.NVarChar, imagenesJson)
      .input('autorId', sql.Int, autorId)
      .input('autorNombre', sql.NVarChar, autorNombre)
      .input('activo', sql.Bit, true)
      .input('destacada', sql.Bit, destacada === true)
      .input('categoria', sql.NVarChar, categoria || 'Comunicado')
      .query(`
        INSERT INTO INTRANET_NOTICIAS (
          NOTI_TITULO,
          NOTI_CONTENIDO,
          NOTI_PORTADA,
          NOTI_FOCO,
          NOTI_IMAGENES,
          NOTI_AUTOR_ID,
          NOTI_AUTOR_NOMBRE,
          NOTI_FECHA_CREACION,
          NOTI_ACTIVO,
          NOTI_DESTACADA,
          NOTI_CATEGORIA
        )
        VALUES (
          @titulo,
          @contenido,
          @imagenPortada,
          @imagenFoco,
          @imagenes,
          @autorId,
          @autorNombre,
          GETDATE(),
          @activo,
          @destacada,
          @categoria
        );
        
        SELECT SCOPE_IDENTITY() as id;
      `);

    const noticiaId = result.recordset[0].id;

    const noticiaCreada = await pool.request()
      .input('id', sql.Int, noticiaId)
      .query(`
        SELECT 
          NOTI_ID as id,
          NOTI_TITULO as titulo,
          NOTI_CONTENIDO as contenido,
          NOTI_PORTADA as imagenPortada,
        ISNULL(NOTI_FOCO, 'center') as imagenFoco,
          NOTI_IMAGENES as imagenes,
          NOTI_AUTOR_ID as autorId,
          NOTI_AUTOR_NOMBRE as autorNombre,
          NOTI_FECHA_CREACION as fechaCreacion,
          NOTI_FECHA_ACTUALIZACION as fechaActualizacion,
          NOTI_ACTIVO as activo,
          NOTI_DESTACADA as destacada,
          NOTI_CATEGORIA as categoria,
          NOTI_COMENTARIOS_HABILITADOS as comentariosHabilitados
        FROM INTRANET_NOTICIAS
        WHERE NOTI_ID = @id
      `);

    const creada = dedupeImagenesInRows(noticiaCreada.recordset)[0];

    // 📡 Emitir evento en tiempo real a todos los clientes
    try {
      const io = socketService.getIO(req.user?.empresa);
      io.emit('noticia:created', creada);
      console.log('📡 Evento noticia:created emitido');
    } catch (e) {
      console.warn('⚠️ No se pudo emitir noticia:created:', e?.message || e);
    }

    // 📢 Crear notificación para todos los usuarios (usa servicio centralizado)
    try {
      const total = await notificationService.broadcastNews({
        noticiaId,
        titulo: creada.titulo,
        categoria: creada.categoria,
        destacada: !!creada.destacada,
      });
      console.log(`📢 Notificaciones creadas para ${total} usuarios`);
    } catch (e) {
      console.warn('⚠️ No se pudieron crear notificaciones globales:', e?.message || e);
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'noticias', accion:'crear', entidadId: String(noticiaId||''), detalle:{ titulo }, ip:req.ip });
    res.status(201).json({ success: true, data: creada });
  } catch (error) {
    console.error('Error creando noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateNoticia = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titulo,
      contenido,
      imagenPortada,
      imagenFoco,
      imagenes,
      activo,
      destacada,
      categoria
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT NOTI_ID FROM INTRANET_NOTICIAS WHERE NOTI_ID = @id');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }

    const imagenesLimpias = normalizeImagenesArray(imagenes);

    const imagenesJson = JSON.stringify(imagenesLimpias);
    const focoValido = ['top', 'center', 'bottom'].includes(imagenFoco) ? imagenFoco : 'center';

    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('contenido', sql.NVarChar, contenido)
      .input('imagenPortada', sql.NVarChar, imagenPortada || null)
      .input('imagenFoco', sql.NVarChar, focoValido)
      .input('imagenes', sql.NVarChar, imagenesJson)
      .input('activo', sql.Bit, activo !== false)
      .input('destacada', sql.Bit, destacada === true)
      .input('categoria', sql.NVarChar, categoria || 'Comunicado')
      .query(`
        UPDATE INTRANET_NOTICIAS
        SET
          NOTI_TITULO = @titulo,
          NOTI_CONTENIDO = @contenido,
          NOTI_PORTADA = @imagenPortada,
          NOTI_FOCO = @imagenFoco,
          NOTI_IMAGENES = @imagenes,
          NOTI_FECHA_ACTUALIZACION = GETDATE(),
          NOTI_ACTIVO = @activo,
          NOTI_DESTACADA = @destacada,
          NOTI_CATEGORIA = @categoria
        WHERE NOTI_ID = @id
      `);

    const noticiaActualizada = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          NOTI_ID as id,
          NOTI_TITULO as titulo,
          NOTI_CONTENIDO as contenido,
          NOTI_PORTADA as imagenPortada,
        ISNULL(NOTI_FOCO, 'center') as imagenFoco,
          NOTI_IMAGENES as imagenes,
          NOTI_AUTOR_ID as autorId,
          NOTI_AUTOR_NOMBRE as autorNombre,
          NOTI_FECHA_CREACION as fechaCreacion,
          NOTI_FECHA_ACTUALIZACION as fechaActualizacion,
          NOTI_ACTIVO as activo,
          NOTI_DESTACADA as destacada,
          NOTI_CATEGORIA as categoria,
          NOTI_COMENTARIOS_HABILITADOS as comentariosHabilitados
        FROM INTRANET_NOTICIAS
        WHERE NOTI_ID = @id
      `);

    const noticiaResponse = dedupeImagenesInRows(noticiaActualizada.recordset)[0];
    
    // Emitir evento WebSocket
    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('noticia:updated', noticiaResponse);
      console.log('📡 Evento noticia:updated emitido');
    }
    
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'noticias', accion:'editar', entidadId: req.params.id, detalle:{ titulo }, ip:req.ip });
    res.json({ success: true, data: noticiaResponse });
  } catch (error) {
    console.error('Error actualizando noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteNoticia = async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const check = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT NOTI_ID, NOTI_ACTIVO
        FROM INTRANET_NOTICIAS
        WHERE NOTI_ID = @id
      `);

    if (check.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }

    const noticia = check.recordset[0];
    const isActive = noticia.NOTI_ACTIVO;

    if (permanent === '1' || !isActive) {
      await pool.request()
        .input('id', sql.Int, id)
        .query(`
          DELETE FROM INTRANET_NOTICIAS
          WHERE NOTI_ID = @id
        `);
      
      if (socketService.getIO(req.user?.empresa)) {
        socketService.getIO(req.user?.empresa).emit('noticia:deleted', { id: parseInt(id), permanent: true });
        console.log('📡 Evento noticia:deleted emitido (hard)');
      }
      
      await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'noticias', accion:'eliminar', entidadId: req.params.id, detalle:{ permanent:true }, ip:req.ip });
      res.json({
        success: true,
        message: 'Noticia eliminada permanentemente',
        permanent: true
      });
    } else {
      await pool.request()
        .input('id', sql.Int, id)
        .query(`
          UPDATE INTRANET_NOTICIAS
          SET NOTI_ACTIVO = 0
          WHERE NOTI_ID = @id
        `);
      
      if (socketService.getIO(req.user?.empresa)) {
        socketService.getIO(req.user?.empresa).emit('noticia:hidden', { id: parseInt(id), activo: false });
        console.log('📡 Evento noticia:hidden emitido (soft)');
      }
      
      await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'noticias', accion:'ocultar', entidadId: req.params.id, detalle:{ permanent:false }, ip:req.ip });
      res.json({
        success: true,
        message: 'Noticia ocultada',
        permanent: false
      });
    }
  } catch (error) {
    console.error('Error eliminando noticia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activo === true)
      .query(`
        UPDATE INTRANET_NOTICIAS
        SET NOTI_ACTIVO = @activo,
            NOTI_FECHA_ACTUALIZACION = GETDATE()
        WHERE NOTI_ID = @id
      `);

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('noticia:toggleActivo', { id: parseInt(id), activo });
      console.log('📡 Evento noticia:toggleActivo emitido');
    }

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error cambiando estado activo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleDestacada = async (req, res) => {
  try {
    const { id } = req.params;
    const { destacada } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('destacada', sql.Bit, destacada === true)
      .query(`
        UPDATE INTRANET_NOTICIAS
        SET NOTI_DESTACADA = @destacada,
            NOTI_FECHA_ACTUALIZACION = GETDATE()
        WHERE NOTI_ID = @id
      `);

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('noticia:toggleDestacada', { id: parseInt(id), destacada });
      console.log('📡 Evento noticia:toggleDestacada emitido');
    }

    res.json({ success: true, message: 'Estado destacada actualizado' });
  } catch (error) {
    console.error('Error cambiando estado destacada:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleCommentsEnabled = async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, tipoUsuario } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    if (tipoUsuario !== 'admin') {
      return res.status(403).json({ success: false, message: 'Solo administradores pueden cambiar esta configuración' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('enabled', sql.Bit, enabled === true)
      .query(`
        UPDATE INTRANET_NOTICIAS
        SET NOTI_COMENTARIOS_HABILITADOS = @enabled,
            NOTI_FECHA_ACTUALIZACION = GETDATE()
        WHERE NOTI_ID = @id
      `);

    res.json({ success: true, message: 'Comentarios habilitados/inhabilitados actualizado' });
  } catch (error) {
    console.error('Error cambiando comentarios habilitados:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getLayout = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    const pool = await databaseService.getPool(req.user?.empresa);

    const selectQuery = `
      SELECT TOP 1
        LAYOUT_DATA as layoutData,
        LAYOUT_TIMESTAMP as timestamp
      FROM dbo.INTRANET_NOTICIAS_LAYOUT
      ORDER BY LAYOUT_TIMESTAMP DESC
    `;

    let result;
    try {
      result = await pool.request().query(selectQuery);
    } catch (e) {
      // Intento de autorreparación: asegurar el esquema y reintentar una vez
      try {
        const schemaService = require('../services/schemaService');
        await schemaService.ensureLayoutSchema(pool);
        result = await pool.request().query(selectQuery);
      } catch (e2) {
        console.warn('⚠️ No se pudo obtener el layout, devolviendo vacío:', e2.message);
        return res.json({ success: true, data: null, message: 'Layout no disponible' });
      }
    }

    if (result.recordset.length === 0) {
      return res.json({ success: true, data: null, message: 'No hay layout guardado' });
    }

    let layoutData;
    try {
      layoutData = JSON.parse(result.recordset[0].layoutData);
    } catch (e) {
      console.warn('⚠️ Layout malformado, devolviendo vacío');
      layoutData = null;
    }
    
    res.json({ 
      success: true, 
      data: layoutData,
      timestamp: result.recordset[0].timestamp
    });
  } catch (error) {
    console.error('Error obteniendo layout:', error);
    // Último recurso: no romper la portada; devolver respuesta vacía
    res.json({ success: true, data: null, message: 'Layout no disponible' });
  }
};

const crypto = require('crypto');

exports.saveLayout = async (req, res) => {
  try {
    const { order, config, hash } = req.body;
    // Verificar rol (ya pasó por requireAdmin en la ruta; redundancia defensiva)
    const tipoUsuario = (req.user && (req.user.tipoUsuario || req.user.role)) || null;
    const usuarioCodigo = (req.user && req.user.usuario) || null;
    if (!tipoUsuario && !usuarioCodigo) {
      return res.status(403).json({ success: false, message: 'Usuario no autenticado' });
    }
    // Solo permitir guardar a usuarios con rol AD
    const roleUpper = String(tipoUsuario || '').toUpperCase();
    const isAuthorized = (roleUpper === 'AD');
    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Sin permisos para guardar el layout' });
    }
    
    if (!order || !config) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requieren order y config' 
      });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    // Calcular hash canónico del payload recibido
    const canonical = JSON.stringify({ order, config });
    const serverHash = crypto.createHash('sha256').update(canonical).digest('hex');

    if (hash && hash !== serverHash) {
      return res.status(400).json({
        success: false,
        message: 'Hash de integridad no coincide',
        expected: serverHash,
        received: hash,
      });
    }

    // Guardar incluyendo el hash dentro del JSON para que el cliente pueda verificar a la carga
    const layoutData = JSON.stringify({ order, config, hash: serverHash });

    try {
      await pool.request()
        .input('layoutData', sql.NVarChar, layoutData)
        .query(`
          INSERT INTO dbo.INTRANET_NOTICIAS_LAYOUT (LAYOUT_DATA, LAYOUT_TIMESTAMP)
          VALUES (@layoutData, GETDATE())
        `);
    } catch (e) {
      if ((e.message || '').toLowerCase().includes('invalid object name')) {
        const schemaService = require('../services/schemaService');
        await schemaService.ensureLayoutSchema(pool);
        await pool.request()
          .input('layoutData', sql.NVarChar, layoutData)
          .query(`
            INSERT INTO dbo.INTRANET_NOTICIAS_LAYOUT (LAYOUT_DATA, LAYOUT_TIMESTAMP)
            VALUES (@layoutData, GETDATE())
          `);
      } else {
        throw e;
      }
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('noticia:layoutChanged', { order, config, timestamp: new Date().toISOString() });
      console.log('📡 Evento noticia:layoutChanged emitido');
    }
    
    res.json({ 
      success: true, 
      message: 'Layout guardado correctamente',
      timestamp: new Date().toISOString(),
      hash: serverHash,
    });
  } catch (error) {
    console.error('Error guardando layout:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};