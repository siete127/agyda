const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { ensureUploadDirectories } = require('../utils/helpers');
const { empresaRequierePolitica, validarPoliticaPassword } = require('../utils/passwordPolicy');

// Asegurar directorios al inicializar
ensureUploadDirectories();

exports.getPerfil = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT
                NEUS_ID                                                    as id,
                NEUS_NOMBRES                                               as nombres,
                username                                                   as usuario,
                NEUS_ALIAS                                                 as alias,
                NEUS_FOTO_URL                                              as fotoUrl,
                NEUS_PORTADA_URL                                           as portadaUrl,
                ISNULL(NEUS_CORREO,'')                                     as correo,
                ISNULL(NEUS_TELEFONO,'')                                   as telefono,
                ISNULL(NEUS_PUESTO,'')                                     as puesto,
                ISNULL(NEUS_DEPARTAMENTO,'')                               as departamento,
                NEUS_TIPOUSUARIO                                           as tipoUsuario,
                CONVERT(VARCHAR(10), NEUS_FECHA_INGRESO, 23)               as fechaIngreso
              FROM dbo.NEUS_USUARIOS WHERE NEUS_ID=@id`);
              
    if (!rs.recordset.length) return res.status(404).json({ success:false, message:'Usuario no encontrado' });
    
    const det = await pool.request().input('uid', sql.Int, id)
      .query(`SELECT TOP 1 * FROM dbo.INTRANET_PERFIL_DETALLE WHERE USER_ID=@uid`);

    const cumple = await pool.request().input('uid', sql.Int, id)
      .query(`SELECT CONVERT(VARCHAR(10), fecha_cumpleanos, 23) AS fecha_cumpleanos FROM dbo.NEUS_USUARIOS WHERE NEUS_ID=@uid`);
    
    const base = rs.recordset[0];
    const ext = det.recordset.length ? det.recordset[0] : {};
    
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const fechaCumpleRaw = cumple.recordset[0]?.fecha_cumpleanos;
    console.log('🎂 PERFIL fecha_cumpleanos RAW:', fechaCumpleRaw, '| tipo:', typeof fechaCumpleRaw);
    
    res.json({ success:true, data: { 
      ...base,
      fechaCumpleanos: fechaCumpleRaw || null,
      infoPersonal: ext.INFO_PERSONAL || '',
      infoLaboral: ext.INFO_LABORAL || '',
      acercaDeMi: ext.ACERCA_DE_MI || '',
      librosFavoritos: ext.LIBROS_FAVORITOS || '',
      peliculasFavoritas: ext.PELICULAS_FAVORITAS || '',
      musicaFavorita: ext.MUSICA_FAVORITA || '',
      seriesFavoritas: ext.SERIES_FAVORITAS || '',
      actividadesInteres: ext.ACTIVIDADES_INTERES || ''
    } });
  } catch (e) {
    res.status(500).json({ success:false, message: e.message });
  }
};

exports.getPerfilDetalle = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    
    const det = await pool.request().input('uid', sql.Int, id)
      .query(`SELECT TOP 1 * FROM dbo.INTRANET_PERFIL_DETALLE WHERE USER_ID=@uid`);
    const ext = det.recordset.length ? det.recordset[0] : {};
    
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json({ success:true, data: {
      infoPersonal: ext.INFO_PERSONAL || '',
      infoLaboral: ext.INFO_LABORAL || '',
      acercaDeMi: ext.ACERCA_DE_MI || '',
      librosFavoritos: ext.LIBROS_FAVORITOS || '',
      peliculasFavoritas: ext.PELICULAS_FAVORITAS || '',
      musicaFavorita: ext.MUSICA_FAVORITA || '',
      seriesFavoritas: ext.SERIES_FAVORITAS || '',
      actividadesInteres: ext.ACTIVIDADES_INTERES || ''
    }});
  } catch (e) {
    res.status(500).json({ success:false, message: e.message });
  }
};

exports.updateAlias = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const alias = String(req.body?.alias || '').trim();
    
    if (!alias) return res.status(400).json({ success:false, message:'Alias requerido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).input('alias', sql.NVarChar, alias)
      .query(`UPDATE dbo.NEUS_USUARIOS SET NEUS_ALIAS=@alias WHERE NEUS_ID=@id`);
      
    res.json({ success:true, message:'Alias actualizado' });
  } catch (e) {
    res.status(500).json({ success:false, message: e.message });
  }
};

/**
 * 🔐 Actualiza la contraseña del usuario y sincroniza con la DB de ventas
 */
exports.updatePassword = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success:false, message:'Contraseñas requeridas' });

    if (empresaRequierePolitica(req.user?.empresa)) {
      const errorPolitica = validarPoliticaPassword(newPassword);
      if (errorPolitica) return res.status(400).json({ success:false, message: errorPolitica });
    } else if (newPassword.length < 6) {
      return res.status(400).json({ success:false, message:'La contraseña nueva es muy corta' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT 
        NEUS_CONTRA AS neus, 
        [password] AS pass, 
        username AS ventasUsername, 
        NEUS_USUARIO AS neusUsuario,
        NEUS_NOMBRES AS neusNombres
      FROM dbo.NEUS_USUARIOS 
      WHERE NEUS_ID=@id`);
      
    if (!rs.recordset.length) return res.status(404).json({ success:false, message:'Usuario no encontrado' });
    
    const row = rs.recordset[0];
    const matches = (row.pass === currentPassword) || (row.neus === currentPassword);
    if (!matches) return res.status(401).json({ success:false, message:'Contraseña actual incorrecta' });
    
    // 1. Actualizar NEUS_USUARIOS: username = NEUS_USUARIO, password = NEUS_CONTRA,
    //    y limpiar la bandera de "debe cambiar contraseña" si estaba pendiente.
    await pool.request().input('id', sql.Int, id).input('np', sql.NVarChar, newPassword).query(`
      UPDATE dbo.NEUS_USUARIOS
      SET NEUS_CONTRA=@np, [password]=@np, username=NEUS_USUARIO, NEUS_DEBE_CAMBIAR_PASSWORD=0
      WHERE NEUS_ID=@id`);

    // 2. Obtener los valores actualizados de NEUS_USUARIO, NEUS_CONTRA y NEUS_NOMBRES
    const rs2 = await pool.request().input('id', sql.Int, id).query(`
      SELECT NEUS_USUARIO, NEUS_CONTRA, NEUS_NOMBRES FROM dbo.NEUS_USUARIOS WHERE NEUS_ID=@id`);
    const row2 = rs2.recordset[0];
    const neusUsuario = row2.NEUS_USUARIO || '';
    const neusContra = row2.NEUS_CONTRA || '';
    const neusNombres = row2.NEUS_NOMBRES || '';

    // 3. Forzar que username y password sean exactamente iguales a NEUS_USUARIO y NEUS_CONTRA
    await pool.request().input('id', sql.Int, id)
      .input('user', sql.NVarChar, neusUsuario)
      .input('pass', sql.NVarChar, neusContra)
      .query(`UPDATE dbo.NEUS_USUARIOS SET username=@user, [password]=@pass WHERE NEUS_ID=@id`);

    // 4. Sincronizar en ventas (plata_prospectPRO): username = NEUS_USUARIO, password = NEUS_CONTRA usando nombreAgente (case-insensitive)
    try {
      const ventasConfig = require('../config/database_ventas');
      // Usar un pool dedicado para NO afectar el pool principal de intranet
      const ventasPool = await new sql.ConnectionPool(ventasConfig).connect();
      if (neusNombres && neusUsuario) {
        const reqV = ventasPool.request()
          .input('newUser', sql.NVarChar, neusUsuario)
          .input('newPass', sql.NVarChar, neusContra)
          .input('neusNombres', sql.NVarChar, neusNombres);

        const updateByName = `
          UPDATE dbo.Users
          SET username = @newUser, [password] = @newPass
          WHERE LTRIM(RTRIM(nombreAgente)) COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(@neusNombres)) COLLATE Latin1_General_CI_AI
        `;
        const upd = await reqV.query(updateByName);
        const affected = Array.isArray(upd.rowsAffected) ? upd.rowsAffected.reduce((a,b)=>a+b,0) : (upd.rowsAffected || 0);
        if (affected > 0) console.log('✅ Credenciales sincronizadas en DB ventas por nombre. Filas afectadas:', affected);
        else console.warn('⚠️ No se encontró coincidencia en DB ventas por nombreAgente:', neusNombres);
      } else {
        console.warn('⚠️ NEUS_NOMBRES o NEUS_USUARIO no disponible para sincronización en DB ventas');
      }
      try { await ventasPool.close(); } catch(_){ }
    } catch (syncErr) {
      console.error('Error sincronizando con DB ventas:', syncErr);
    }
      
    res.json({ success:true, message:'Contraseña actualizada' });
  } catch (e) {
    res.status(500).json({ success:false, message: e.message });
  }
};

/**
 * ✏️ Actualiza nombreAgente y sincroniza también con DB de ventas
 */
exports.updateNombreAgente = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const nuevoNombre = String(req.body?.nombreAgente || '').trim();
    
    if (!nuevoNombre) 
      return res.status(400).json({ success:false, message:'Nombre de agente requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);

    // Actualizar en la intranet
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nuevoNombre)
      .query(`UPDATE dbo.NEUS_USUARIOS SET NEUS_NOMBRES=@nombre WHERE NEUS_ID=@id`);

    // Sincronizar con DB de ventas
    try {
      const ventasConfig = require('../config/database_ventas');
      const sqlVentas = require('mssql');
      const ventasPool = await sqlVentas.connect(ventasConfig);

      await ventasPool.request()
        .input('nuevoNombre', sql.NVarChar, nuevoNombre)
        .input('id', sql.Int, id)
        .query(`UPDATE dbo.Users SET nombreAgente=@nuevoNombre WHERE username IN (
                  SELECT NEUS_USUARIO FROM dbo.NEUS_USUARIOS WHERE NEUS_ID=@id
                )`);

      try { await ventasPool.close(); } catch(_){ }
    } catch (syncErr) {
      console.error('Error sincronizando nombreAgente con DB ventas:', syncErr);
    }

    res.json({ success:true, message:'Nombre de agente actualizado y sincronizado' });
  } catch (e) {
    res.status(500).json({ success:false, message:e.message });
  }
};

exports.updatePerfilDetalle = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      infoPersonal = '',
      infoLaboral = '',
      acercaDeMi = '',
      librosFavoritos = '',
      peliculasFavoritas = '',
      musicaFavorita = '',
      seriesFavoritas = '',
      actividadesInteres = ''
    } = req.body || {};
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const exists = await pool.request().input('uid', sql.Int, id)
      .query(`SELECT 1 FROM dbo.INTRANET_PERFIL_DETALLE WHERE USER_ID=@uid`);
      
    if (exists.recordset.length) {
      await pool.request()
        .input('uid', sql.Int, id)
        .input('p1', sql.NVarChar, infoPersonal)
        .input('p2', sql.NVarChar, infoLaboral)
        .input('p3', sql.NVarChar, acercaDeMi)
        .input('p4', sql.NVarChar, librosFavoritos)
        .input('p5', sql.NVarChar, peliculasFavoritas)
        .input('p6', sql.NVarChar, musicaFavorita)
        .input('p7', sql.NVarChar, seriesFavoritas)
        .input('p8', sql.NVarChar, actividadesInteres)
        .query(`UPDATE dbo.INTRANET_PERFIL_DETALLE
                SET INFO_PERSONAL=@p1, INFO_LABORAL=@p2, ACERCA_DE_MI=@p3,
                    LIBROS_FAVORITOS=@p4, PELICULAS_FAVORITAS=@p5, MUSICA_FAVORITA=@p6,
                    SERIES_FAVORITAS=@p7, ACTIVIDADES_INTERES=@p8, UPDATED_AT=GETDATE()
                WHERE USER_ID=@uid`);
    } else {
      await pool.request()
        .input('uid', sql.Int, id)
        .input('p1', sql.NVarChar, infoPersonal)
        .input('p2', sql.NVarChar, infoLaboral)
        .input('p3', sql.NVarChar, acercaDeMi)
        .input('p4', sql.NVarChar, librosFavoritos)
        .input('p5', sql.NVarChar, peliculasFavoritas)
        .input('p6', sql.NVarChar, musicaFavorita)
        .input('p7', sql.NVarChar, seriesFavoritas)
        .input('p8', sql.NVarChar, actividadesInteres)
        .query(`INSERT INTO dbo.INTRANET_PERFIL_DETALLE
                (USER_ID, INFO_PERSONAL, INFO_LABORAL, ACERCA_DE_MI, LIBROS_FAVORITOS,
                 PELICULAS_FAVORITAS, MUSICA_FAVORITA, SERIES_FAVORITAS, ACTIVIDADES_INTERES, UPDATED_AT)
                VALUES (@uid, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, GETDATE())`);
    }
    
    res.json({ success:true, message:'Perfil actualizado' });
  } catch (e) {
    res.status(500).json({ success:false, message: e.message });
  }
};

exports.uploadFoto = async (req, res) => {
  try {
    const rawId = (req.params.id || '').toString().trim();
    if (!req.file) return res.status(400).json({ success:false, message:'Archivo foto requerido (campo "foto")' });

    const filename = req.file.filename;
    const PROFILE_PUBLIC_BASE = process.env.PROFILE_PUBLIC_BASE_URL || '/intranet/Perfil';
    const publicUrl = `${PROFILE_PUBLIC_BASE}/${encodeURIComponent(filename)}`;

    const pool = await databaseService.getPool(req.user?.empresa);

    // Permitir identificar al usuario por ID numérico o por username
    let userId = null;
    if (/^\d+$/.test(rawId)) {
      userId = parseInt(rawId, 10);
    } else if (rawId) {
      const rsUser = await pool.request()
        .input('username', sql.NVarChar, rawId)
        .query(`SELECT TOP 1 NEUS_ID FROM dbo.NEUS_USUARIOS WHERE username=@username OR NEUS_USUARIO=@username`);
      if (!rsUser.recordset.length) {
        return res.status(404).json({ success:false, message:'Usuario no encontrado para el identificador proporcionado' });
      }
      userId = rsUser.recordset[0].NEUS_ID;
    }

    if (!userId) {
      return res.status(400).json({ success:false, message:'Identificador de usuario inválido' });
    }

    await pool.request().input('id', sql.Int, userId).input('url', sql.NVarChar, publicUrl)
      .query(`UPDATE dbo.NEUS_USUARIOS SET NEUS_FOTO_URL=@url WHERE NEUS_ID=@id`);
      
    res.json({ success:true, url: publicUrl, filename, userId });
  } catch (e) {
    console.error('Error subiendo foto:', e);
    res.status(500).json({ success:false, message: e.message });
  }
};

exports.uploadPortada = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ success:false, message:'Archivo portada requerido (campo "portada")' });
    
    const filename = req.file.filename;
    const PORTADA_PUBLIC_BASE = process.env.PORTADA_PUBLIC_BASE_URL || '/intranet/Portadas';
    const publicUrl = `${PORTADA_PUBLIC_BASE}/${encodeURIComponent(filename)}`;
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).input('url', sql.NVarChar, publicUrl)
      .query(`UPDATE dbo.NEUS_USUARIOS SET NEUS_PORTADA_URL=@url WHERE NEUS_ID=@id`);
      
    res.json({ success:true, url: publicUrl, filename });
  } catch (e) {
    console.error('Error subiendo portada:', e);
    res.status(500).json({ success:false, message: e.message });
  }
};

exports.updateFechaCumpleanos = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { fecha_cumpleanos } = req.body;
    
    if (!fecha_cumpleanos) {
      return res.status(400).json({ success: false, message: 'Fecha de cumpleaños requerida' });
    }

    // Tomar solo la parte YYYY-MM-DD para evitar desfase de zona horaria
    const soloFecha = String(fecha_cumpleanos).split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
      return res.status(400).json({ success: false, message: 'Formato de fecha inválido' });
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('fecha', sql.NVarChar, soloFecha)
      .query(`UPDATE dbo.NEUS_USUARIOS SET fecha_cumpleanos = CONVERT(DATE, @fecha, 23) WHERE NEUS_ID = @id`);
    
    try {
      await pool.request().execute('sp_sincronizar_cumpleanos');
    } catch (syncError) {
      console.error('Error al sincronizar cumpleaños en calendario:', syncError);
    }
      
    res.json({ success: true, message: 'Fecha de cumpleaños actualizada exitosamente' });
  } catch (e) {
    console.error('Error actualizando fecha de cumpleaños:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateContacto = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const telefono = String(req.body?.telefono ?? '').trim();
    const correo   = String(req.body?.correo   ?? '').trim();
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',       sql.Int,         id)
      .input('telefono', sql.NVarChar(30), telefono || null)
      .input('correo',   sql.NVarChar(200),correo   || null)
      .query(`UPDATE dbo.NEUS_USUARIOS
              SET NEUS_TELEFONO = @telefono, NEUS_CORREO = @correo
              WHERE NEUS_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePuesto = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const puesto      = String(req.body?.puesto      ?? '').trim();
    const departamento= String(req.body?.departamento?? '').trim();
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',           sql.Int,          id)
      .input('puesto',       sql.NVarChar(100), puesto       || null)
      .input('departamento', sql.NVarChar(100), departamento || null)
      .query(`UPDATE dbo.NEUS_USUARIOS
              SET NEUS_PUESTO = @puesto, NEUS_DEPARTAMENTO = @departamento
              WHERE NEUS_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
