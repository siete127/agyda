const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const crypto = require('crypto');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { BASE_DIR } = require('../middleware/driveUpload');

// Store temporal tokens in memory (consider using Redis for production)
const temporalTokens = new Map();

// Clean expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of temporalTokens.entries()) {
    if (data.expires < now) {
      temporalTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

function getUserRole(req) {
  return (req.user && (req.user.tipoUsuario || req.user.role || req.user.tipousuario) || '').toString().toUpperCase();
}

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.sub) || null;
}

function isADorTI(role) {
  return role === 'AD' || role === 'TI' || role === 'ADMIN' || role === 'ADM';
}
function isAD(role) {
  return role === 'AD';
}

// Listar carpetas visibles (por padreId). AD/TI ven todo; otros por permisos puede_leer
exports.listCarpetas = async (req, res) => {
  try {
    const role = getUserRole(req);
    const usuarioId = getUserId(req);
    const padreId = req.query.padreId ? parseInt(req.query.padreId) : null;
    const pool = await databaseService.getPool(req.user?.empresa);
    // Si es AD: ver todas las carpetas sin restricción de creador/compartido.
    if (isAD(role)) {
      const reqAll = pool.request();
      if (padreId !== null && !isNaN(padreId)) reqAll.input('padreId', sql.Int, padreId);
        const sqlAll = `SELECT c.id, c.nombre, c.padre_id AS padreId, c.fecha_creacion AS fechaCreacion, c.creado_por AS creadoPor,
                  u.NEUS_NOMBRES AS creadoPorNombre, u.NEUS_USUARIO AS creadoPorUsuario
                FROM carpeta c
                LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = c.creado_por
                        WHERE ${padreId === null || isNaN(padreId) ? 'c.padre_id IS NULL' : 'c.padre_id=@padreId'}
                      ORDER BY c.nombre`; 
      const allRows = await reqAll.query(sqlAll);
      return res.json({ success: true, data: allRows.recordset });
    }
    // Resto de roles: propias o compartidas por herencia.
    const request = pool.request().input('uid', sql.Int, usuarioId || 0);
    if (padreId !== null && !isNaN(padreId)) request.input('padreId', sql.Int, padreId);
    const sqlBase = `WITH SharedRoots AS (
        SELECT carpeta_id FROM carpeta_compartida WHERE usuario_id=@uid
      ), SharedTree AS (
        SELECT c.id, c.padre_id FROM carpeta c INNER JOIN SharedRoots sr ON c.id = sr.carpeta_id
        UNION ALL
        SELECT c2.id, c2.padre_id FROM carpeta c2 INNER JOIN SharedTree st ON c2.padre_id = st.id
      )
      SELECT DISTINCT c.id, c.nombre, c.padre_id AS padreId, c.fecha_creacion AS fechaCreacion, c.creado_por AS creadoPor,
        u.NEUS_NOMBRES AS creadoPorNombre, u.NEUS_USUARIO AS creadoPorUsuario
      FROM carpeta c
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = c.creado_por
      LEFT JOIN SharedTree st ON st.id = c.id
      WHERE ${padreId === null || isNaN(padreId) ? 'c.padre_id IS NULL' : 'c.padre_id=@padreId'}
        AND (c.creado_por=@uid OR st.id IS NOT NULL)
      ORDER BY c.nombre OPTION (MAXRECURSION 0);`;
    // Use unlimited recursion (MAXRECURSION 0) to avoid SQL error when folder
    // nesting surpasses 100 levels. If you want to limit recursion, change
    // to a positive integer instead of 0.
    let result;
    try {
      result = await request.query(sqlBase);
    } catch (sqlErr) {
      console.error('❌ SQL error en listCarpetas query:', sqlErr && sqlErr.message || sqlErr);
      // En entornos de desarrollo incluir detalle para depuración
      const devDetail = process.env.NODE_ENV === 'production' ? undefined : (sqlErr && (sqlErr.message || String(sqlErr)));
      return res.status(500).json({ success: false, message: 'Error listando carpetas', detail: devDetail });
    }
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('❌ listCarpetas:', e);
    res.status(500).json({ success: false, message: 'Error listando carpetas' });
  }
};

// Listar archivos de una carpeta. Usuarios normales: sólo propios o compartidos.
exports.listArchivos = async (req, res) => {
  try {
    const role = getUserRole(req);
    const carpetaId = req.query.carpetaId ? parseInt(req.query.carpetaId) : null;
    if (carpetaId === null || isNaN(carpetaId)) {
      return res.status(400).json({ success: false, message: 'carpetaId requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    // AD ve todos los archivos de la carpeta sin validación adicional
    if (isAD(role)) {
      const rowsAll = await pool.request()
        .input('cid', sql.Int, carpetaId)
        .query(`SELECT a.id, a.nombre, a.carpeta_id AS carpetaId, a.extension, a.tamano, a.ruta,
                        a.fecha_subida AS fechaSubida, a.subido_por AS subidoPor,
                        u.NEUS_NOMBRES AS subidoPorNombre, u.NEUS_USUARIO AS subidoPorUsuario
                FROM archivo a
                LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = a.subido_por
                WHERE a.carpeta_id=@cid ORDER BY a.nombre`);
      return res.json({ success: true, data: rowsAll.recordset });
    }
    if (true) {
      // Validar acceso: dueño de carpeta o carpeta compartida (directa o ancestro compartido)
      const usuarioId = getUserId(req) || 0;
      const check = await pool.request()
        .input('cid', sql.Int, carpetaId)
        .input('uid', sql.Int, usuarioId)
        .query(`WITH Ancestors AS (
            SELECT id, padre_id FROM carpeta WHERE id=@cid
            UNION ALL
            SELECT c.id, c.padre_id FROM carpeta c INNER JOIN Ancestors a ON c.id = a.padre_id
          )
          SELECT TOP 1 1 as ok FROM Ancestors a INNER JOIN carpeta cp ON cp.id = a.id AND cp.creado_por=@uid
          UNION ALL
          SELECT TOP 1 1 as ok FROM Ancestors a INNER JOIN carpeta_compartida cc ON cc.carpeta_id = a.id AND cc.usuario_id=@uid`);
      if (check.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Sin permiso para ver archivos' });
      }
      // Asegurar tabla archivo_compartido (para archivos compartidos directamente)
      try {
        await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='archivo_compartido' AND type='U')
        BEGIN
          CREATE TABLE archivo_compartido (
            id INT IDENTITY(1,1) PRIMARY KEY,
            archivo_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL DEFAULT 0,
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END`);
      } catch (_) {}
      const rowsUser = await pool.request()
        .input('cid', sql.Int, carpetaId)
        .input('uid', sql.Int, usuarioId)
        .query(`SELECT a.id, a.nombre, a.carpeta_id AS carpetaId, a.extension, a.tamano, a.ruta,
                        a.fecha_subida AS fechaSubida, a.subido_por AS subidoPor,
                        u.NEUS_NOMBRES AS subidoPorNombre, u.NEUS_USUARIO AS subidoPorUsuario
                FROM archivo a
                LEFT JOIN archivo_compartido ac ON ac.archivo_id = a.id AND ac.usuario_id=@uid
                LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = a.subido_por
                WHERE a.carpeta_id=@cid AND (a.subido_por=@uid OR ac.archivo_id IS NOT NULL)
                ORDER BY a.nombre`);
      return res.json({ success: true, data: rowsUser.recordset });
    }
    // No debería llegar aquí por el return anterior, pero fallback vacío.
    return res.json({ success: true, data: [] });
  } catch (e) {
    console.error('❌ listArchivos:', e);
    res.status(500).json({ success: false, message: 'Error listando archivos' });
  }
};

// Crear carpeta (privada por defecto). Opcional compartir usuarios en body.usuarios (array IDs)
exports.createCarpeta = async (req, res) => {
  try {
    const role = getUserRole(req); // role no limita creación en modo individual
    const { nombre, padreId, usuarios } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request()
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .input('padre', sql.Int, padreId ? parseInt(padreId) : null)
      .input('creado', sql.Int, getUserId(req));
    const result = await request.query(`
      INSERT INTO carpeta (nombre, padre_id, fecha_creacion, creado_por)
      VALUES (@nombre, @padre, GETDATE(), @creado);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    const id = result.recordset[0].id;
    // crear directorio físico
    try {
      const dir = path.join(BASE_DIR, String(id));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}

    // Compartir con usuarios listados (si viene body.usuarios). Si faltan o vacío -> privada solo dueño
    if (Array.isArray(usuarios) && usuarios.length > 0) {
      try {
        await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='carpeta_compartida' AND type='U')
        BEGIN
          CREATE TABLE carpeta_compartida (
            id INT IDENTITY(1,1) PRIMARY KEY,
            carpeta_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL,
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END`);
        for (const uRaw of usuarios) {
          const uId = parseInt(uRaw);
          if (isNaN(uId)) continue;
          await pool.request()
            .input('cid', sql.Int, id)
            .input('uid', sql.Int, uId)
            .input('comp', sql.Int, getUserId(req))
            .query('INSERT INTO carpeta_compartida (carpeta_id, usuario_id, compartido_por) VALUES (@cid, @uid, @comp)');
        }
      } catch (eShare) {
        console.warn('⚠️ No se pudieron compartir usuarios en creación:', eShare.message);
      }
    }
    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    console.error('❌ createCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error creando carpeta' });
  }
};

// Borrar carpeta (solo AD/TI). Borra archivos dentro y la carpeta física correspondiente a este id
exports.deleteCarpeta = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isADorTI(role)) return res.status(403).json({ success: false, message: 'Solo AD/TI pueden borrar carpetas' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);

    // Eliminar archivos físicos de esta carpeta
    try {
      const folderPath = path.join(BASE_DIR, String(id));
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('⚠️ No se pudo eliminar carpeta física:', e.message);
    }

    // Borrar archivos y permisos, luego carpeta
    await pool.request().input('id', sql.Int, id).query(`
      DELETE FROM archivo WHERE carpeta_id = @id;
      DELETE FROM permiso_carpeta WHERE carpeta_id = @id;
      DELETE FROM carpeta WHERE id = @id;
    `);
    res.json({ success: true });
  } catch (e) {
    console.error('❌ deleteCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error borrando carpeta' });
  }
};

// Guardado de archivo: permitir usuario si la carpeta es suya o compartida
exports.uploadArchivo = async (req, res) => {
  try {
    const role = getUserRole(req);
    const file = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null);
    const { nombre, extension, carpetaId } = req.body || {};
    // Permitir crear registro aunque no exista archivo físico adjunto.
    // Si no hay `file`, se creará un registro con tamaño 0 y ruta generada.
    let carpeta = carpetaId ? parseInt(carpetaId) : null;
    const pool = await databaseService.getPool(req.user?.empresa);
    // Si se envió carpetaId pero no existe, crearla automáticamente
    if (carpeta !== null && !isNaN(carpeta)) {
      const checkCarpeta = await pool.request()
        .input('cid', sql.Int, carpeta)
        .query('SELECT TOP 1 id FROM carpeta WHERE id=@cid');
      if (checkCarpeta.recordset.length === 0) {
        const nombreNueva = (req.body && req.body.carpetaNombre) ? String(req.body.carpetaNombre).trim() : 'Carpeta';
        const createdNew = await pool.request()
          .input('nombre', sql.NVarChar, nombreNueva)
          .input('uid', sql.Int, getUserId(req))
          .query('INSERT INTO carpeta (nombre, padre_id, fecha_creacion, creado_por) VALUES (@nombre, NULL, GETDATE(), @uid); SELECT SCOPE_IDENTITY() AS id;');
        carpeta = parseInt(createdNew.recordset[0].id);
        try {
          const dir = path.join(BASE_DIR, String(carpeta));
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        } catch (_) {}
      }
    }
    if (carpeta === null || isNaN(carpeta)) {
      // Fallback: crear/obtener carpeta privada raíz del usuario y mover el archivo si fue guardado en 'root'
      const uid = getUserId(req);
      if (!uid) return res.status(400).json({ success: false, message: 'Usuario no identificado para asignar carpeta' });
      const found = await pool.request()
        .input('uid', sql.Int, uid)
        .query('SELECT TOP 1 id FROM carpeta WHERE creado_por=@uid AND padre_id IS NULL ORDER BY id ASC');
      if (found.recordset.length > 0) {
        carpeta = parseInt(found.recordset[0].id);
      } else {
        const created = await pool.request()
          .input('nombre', sql.NVarChar, 'Privado')
          .input('uid', sql.Int, uid)
          .query('INSERT INTO carpeta (nombre, padre_id, fecha_creacion, creado_por) VALUES (@nombre, NULL, GETDATE(), @uid); SELECT SCOPE_IDENTITY() AS id;');
        carpeta = parseInt(created.recordset[0].id);
      }
      // Si hay archivo físico subido en 'root', moverlo a la carpeta asignada
      if (file && file.filename) {
        try {
          const src = path.join(BASE_DIR, 'root', file.filename);
          const destDir = path.join(BASE_DIR, String(carpeta));
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          const dest = path.join(destDir, file.filename);
          if (fs.existsSync(src)) fs.renameSync(src, dest);
        } catch (_) {}
      }
    }
    const usuarioId = getUserId(req) || 0;
    if (!isAD(role)) {
      const permiso = await pool.request()
        .input('cid', sql.Int, carpeta)
        .input('uid', sql.Int, usuarioId)
        .query(`SELECT TOP 1 1 as ok FROM carpeta WHERE id=@cid AND creado_por=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM carpeta_compartida WHERE carpeta_id=@cid AND usuario_id=@uid`);
      if (permiso.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Sin permiso para subir en esta carpeta' });
      }
    }
    const finalNombre = (nombre || (file && file.originalname) || 'archivo').toString();
    const finalExt = (extension || (file && path.extname(file.originalname || '').replace('.', '')) || '').toString();
    const archivoFileName = file ? file.filename : `${finalNombre}${finalExt ? '.' + finalExt : ''}`;
    const rutaPublica = `/intranet/Drive/${carpeta}/${archivoFileName}`; // Ruta para IIS público
    const tamano = file ? (file.size || 0) : 0;
    const request = pool.request()
      .input('nombre', sql.NVarChar, finalNombre)
      .input('carpeta', sql.Int, carpeta)
      .input('ext', sql.NVarChar, finalExt)
      .input('tam', sql.Int, tamano)
      .input('ruta', sql.NVarChar, rutaPublica)
      .input('subido', sql.Int, getUserId(req));
    await request.query(`
      INSERT INTO archivo (nombre, carpeta_id, extension, tamano, ruta, fecha_subida, subido_por)
      VALUES (@nombre, @carpeta, @ext, @tam, @ruta, GETDATE(), @subido);
    `);
    res.status(201).json({ success: true, data: { ruta: rutaPublica } });
  } catch (e) {
    console.error('❌ uploadArchivo:', e);
    res.status(500).json({ success: false, message: 'Error subiendo archivo' });
  }
};

// Descargar archivo: permitir dueño, compartido o admin
exports.descargarArchivo = async (req, res) => {
  try {
    const role = getUserRole(req); // ya no concede acceso total
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const row = await pool.request().input('id', sql.Int, id).query(`SELECT id, nombre, extension, carpeta_id AS carpetaId, ruta, subido_por AS subidoPor FROM archivo WHERE id=@id`);
    if (row.recordset.length === 0) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    const f = row.recordset[0];
    // AD bypass permisos
    if (!isAD(role)) {
      // Validar siempre (dueño archivo, archivo compartido, dueño carpeta)
    const usuarioId = getUserId(req) || 0;
    const permiso = await pool.request()
      .input('aid', sql.Int, id)
      .input('uid', sql.Int, usuarioId)
      .input('cid', sql.Int, f.carpetaId)
      .query(`SELECT TOP 1 1 as ok FROM archivo WHERE id=@aid AND subido_por=@uid
              UNION ALL
              SELECT TOP 1 1 as ok FROM archivo_compartido WHERE archivo_id=@aid AND usuario_id=@uid
              UNION ALL
              SELECT TOP 1 1 as ok FROM carpeta WHERE id=@cid AND creado_por=@uid`);
    if (permiso.recordset.length === 0) {
      return res.status(403).json({ success: false, message: 'Sin permiso para descargar este archivo' });
    }
    }
    const filePath = path.join(BASE_DIR, String(f.carpetaId), path.basename(f.ruta || ''));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo físico no encontrado' });

    // Construir nombre final
    let nombreDescarga = f.nombre || 'archivo';
    const ext = (f.extension || '').toString().trim();
    if (ext && !nombreDescarga.toLowerCase().endsWith('.' + ext.toLowerCase())) {
      nombreDescarga += '.' + ext.toLowerCase();
    }

    // MIME básico (sin dependencias externas) según extensión común
    const mimeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'txt': 'text/plain; charset=utf-8',
      'csv': 'text/csv; charset=utf-8',
      'json': 'application/json',
      'zip': 'application/zip',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg'
    };
    const contentType = mimeMap[ext.toLowerCase()] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${nombreDescarga}"`);
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      console.error('Stream error:', e.message);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (e) {
    console.error('❌ descargarArchivo:', e);
    res.status(500).json({ success: false, message: 'Error descargando archivo' });
  }
};

// Previsualizar archivo (inline). AD/TI siempre; ST/CC solo si tienen permiso de lectura.
exports.previsualizarArchivo = async (req, res) => {
  try {
    const role = getUserRole(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const row = await pool.request().input('id', sql.Int, id).query(`SELECT id, nombre, extension, carpeta_id AS carpetaId, ruta FROM archivo WHERE id=@id`);
    if (row.recordset.length === 0) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    const f = row.recordset[0];
    if (!isAD(role)) {
      // Validación uniforme: dueño archivo, archivo compartido, dueño carpeta
      const usuarioId = getUserId(req) || 0;
      const permisoPreview = await pool.request()
        .input('aid', sql.Int, id)
        .input('uid', sql.Int, usuarioId)
        .input('cid', sql.Int, f.carpetaId)
        .query(`SELECT TOP 1 1 as ok FROM archivo WHERE id=@aid AND subido_por=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM archivo_compartido WHERE archivo_id=@aid AND usuario_id=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM carpeta WHERE id=@cid AND creado_por=@uid`);
      if (permisoPreview.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Sin permiso para previsualizar' });
      }
    }

    const filePath = path.join(BASE_DIR, String(f.carpetaId), path.basename(f.ruta || ''));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo físico no encontrado' });

    let nombreVista = f.nombre || 'archivo';
    const ext = (f.extension || '').toString().trim();
    if (ext && !nombreVista.toLowerCase().endsWith('.' + ext.toLowerCase())) {
      nombreVista += '.' + ext.toLowerCase();
    }

    const mimeMap = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
      'pdf': 'application/pdf', 'txt': 'text/plain; charset=utf-8', 'csv': 'text/csv; charset=utf-8', 'json': 'application/json',
      'zip': 'application/zip', 'mp4': 'video/mp4', 'mp3': 'audio/mpeg'
    };
    const contentType = mimeMap[ext.toLowerCase()] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    // inline para previsualización en navegador
    res.setHeader('Content-Disposition', `inline; filename="${nombreVista}"`);
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      console.error('Stream error:', e.message);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (e) {
    console.error('❌ previsualizarArchivo:', e);
    res.status(500).json({ success: false, message: 'Error previsualizando archivo' });
  }
};

// Borrar archivo: permitir dueño o admin
exports.borrarArchivo = async (req, res) => {
  try {
    const role = getUserRole(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const row = await pool.request().input('id', sql.Int, id).query(`SELECT id, carpeta_id AS carpetaId, ruta, subido_por AS subidoPor FROM archivo WHERE id=@id`);
    if (row.recordset.length === 0) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    const f = row.recordset[0];
    if (!isADorTI(role)) {
      const usuarioId = getUserId(req) || 0;
      if (f.subidoPor !== usuarioId) {
        const valida = await pool.request()
          .input('cid', sql.Int, f.carpetaId)
          .input('uid', sql.Int, usuarioId)
          .query('SELECT TOP 1 1 as ok FROM carpeta WHERE id=@cid AND creado_por=@uid');
        if (valida.recordset.length === 0) {
          return res.status(403).json({ success: false, message: 'Sin permiso para borrar este archivo' });
        }
      }
    }
    try {
      const filePath = path.join(BASE_DIR, String(f.carpetaId), path.basename(f.ruta || ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('⚠️ No se pudo borrar archivo físico:', e.message);
    }
    await pool.request().input('id', sql.Int, id).query('DELETE FROM archivo WHERE id=@id');
    res.json({ success: true });
  } catch (e) {
    console.error('❌ borrarArchivo:', e);
    res.status(500).json({ success: false, message: 'Error borrando archivo' });
  }
};

// Establecer permisos por área (tipo_usuario) para una carpeta (solo AD/TI)
exports.setPermisosCarpeta = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isADorTI(role)) return res.status(403).json({ success: false, message: 'Solo AD/TI pueden editar permisos' });
    const carpetaId = parseInt(req.params.id);
    if (isNaN(carpetaId)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const { permisos } = req.body || {};
    if (!Array.isArray(permisos)) return res.status(400).json({ success: false, message: 'Formato de permisos inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      // Borrar existentes para esa carpeta
      await new sql.Request(tx).input('cid', sql.Int, carpetaId).query('DELETE FROM permiso_carpeta WHERE carpeta_id=@cid');
      // Insertar nuevos
      for (const p of permisos) {
        const tipo = (p.tipo_usuario || p.tipo || '').toString().toUpperCase();
        const leer = p.puede_leer ? 1 : 0;
        const escribir = p.puede_escribir ? 1 : 0;
        const borrar = p.puede_borrar ? 1 : 0;
        await new sql.Request(tx)
          .input('cid', sql.Int, carpetaId)
          .input('tipo', sql.NVarChar, tipo)
          .input('leer', sql.Bit, leer)
          .input('escr', sql.Bit, escribir)
          .input('bor', sql.Bit, borrar)
          .query('INSERT INTO permiso_carpeta (carpeta_id, tipo_usuario, puede_leer, puede_escribir, puede_borrar) VALUES (@cid, @tipo, @leer, @escr, @bor)');
      }
      await tx.commit();
      res.json({ success: true });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('❌ setPermisosCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error guardando permisos' });
  }
};

// Obtener permisos actuales de una carpeta
exports.getPermisosCarpeta = async (req, res) => {
  try {
    const carpetaId = parseInt(req.params.id);
    if (isNaN(carpetaId)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rows = await pool.request().input('cid', sql.Int, carpetaId).query('SELECT id, carpeta_id AS carpetaId, tipo_usuario AS tipoUsuario, puede_leer AS puedeLeer, puede_escribir AS puedeEscribir, puede_borrar AS puedeBorrar FROM permiso_carpeta WHERE carpeta_id=@cid');
    res.json({ success: true, data: rows.recordset });
  } catch (e) {
    console.error('❌ getPermisosCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo permisos' });
  }
};

// Listar "compartidos" - no implementado por usuario específico; retornar vacío para ahora
exports.listCompartidos = async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    if (!usuarioId) return res.json({ success: true, data: [] });
    const pool = await databaseService.getPool(req.user?.empresa);

    // Asegurar tablas de compartidos (id identity, referencia y usuario, fecha)
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='archivo_compartido' AND type='U')
        BEGIN
          CREATE TABLE archivo_compartido (
            id INT IDENTITY(1,1) PRIMARY KEY,
            archivo_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL,
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END
        ELSE IF COL_LENGTH('archivo_compartido','compartido_por') IS NULL
        BEGIN
          ALTER TABLE archivo_compartido ADD compartido_por INT NOT NULL CONSTRAINT DF_archivo_compartido_comp DEFAULT(0);
        END;

        IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='carpeta_compartida' AND type='U')
        BEGIN
          CREATE TABLE carpeta_compartida (
            id INT IDENTITY(1,1) PRIMARY KEY,
            carpeta_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL,
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END
        ELSE IF COL_LENGTH('carpeta_compartida','compartido_por') IS NULL
        BEGIN
          ALTER TABLE carpeta_compartida ADD compartido_por INT NOT NULL CONSTRAINT DF_carpeta_compartida_comp DEFAULT(0);
        END;`);
    } catch (e) {
      console.warn('⚠️ No se pudo verificar/crear tablas compartido:', e.message);
    }

    // Archivos compartidos directamente
    const direct = await pool.request()
      .input('uid', sql.Int, usuarioId)
      .query(`SELECT a.id, a.nombre, a.carpeta_id AS carpetaId, a.extension, a.tamano, a.ruta, a.fecha_subida AS fechaSubida, a.subido_por AS subidoPor
              FROM archivo a
              INNER JOIN archivo_compartido ac ON ac.archivo_id = a.id AND ac.usuario_id=@uid`);

    // Archivos de carpetas compartidas (incluso subcarpetas descendientes)
    const fromFolders = await pool.request()
      .input('uid', sql.Int, usuarioId)
      .query(`WITH SharedRoots AS (
          SELECT carpeta_id FROM carpeta_compartida WHERE usuario_id=@uid
        ), SharedTree AS (
          SELECT c.id, c.padre_id FROM carpeta c INNER JOIN SharedRoots sr ON c.id = sr.carpeta_id
          UNION ALL
          SELECT c2.id, c2.padre_id FROM carpeta c2 INNER JOIN SharedTree st ON c2.padre_id = st.id
        )
        SELECT a.id, a.nombre, a.carpeta_id AS carpetaId, a.extension, a.tamano, a.ruta, a.fecha_subida AS fechaSubida, a.subido_por AS subidoPor
        FROM archivo a INNER JOIN SharedTree st ON st.id = a.carpeta_id OPTION (MAXRECURSION 100);`);

    // Combinar sin duplicados
    const map = new Map();
    [...direct.recordset, ...fromFolders.recordset].forEach(r => {
      if (!map.has(r.id)) map.set(r.id, r);
    });
    res.json({ success: true, data: Array.from(map.values()) });
  } catch (e) {
    console.error('❌ listCompartidos:', e);
    res.json({ success: true, data: [] });
  }
};

// Listar carpetas compartidas con el usuario (para navegar carpeta completa)
exports.listCarpetasCompartidas = async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    if (!usuarioId) return res.json({ success: true, data: [] });
    const pool = await databaseService.getPool(req.user?.empresa);

    // Asegurar tabla
    try {
      await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='carpeta_compartida' AND type='U')
        BEGIN
          CREATE TABLE carpeta_compartida (
            id INT IDENTITY(1,1) PRIMARY KEY,
            carpeta_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL,
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END`);
    } catch (_) {}

    const rows = await pool.request()
      .input('uid', sql.Int, usuarioId)
      .query(`SELECT c.id, c.nombre, c.padre_id AS padreId, c.fecha_creacion AS fechaCreacion, c.creado_por AS creadoPor
              FROM carpeta c
              INNER JOIN carpeta_compartida cc ON cc.carpeta_id = c.id AND cc.usuario_id=@uid
              ORDER BY c.nombre`);
    return res.json({ success: true, data: rows.recordset });
  } catch (e) {
    console.error('❌ listCarpetasCompartidas:', e);
    res.json({ success: true, data: [] });
  }
};

// Listar usuarios activos para selector de compartir (todos los roles)
exports.listUsuarios = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const meId = getUserId(req) || 0;
    const rows = await pool.request()
      .input('me', sql.Int, meId)
      .query(`SELECT NEUS_ID AS id, NEUS_NOMBRES AS nombre, NEUS_USUARIO AS usuario, NEUS_TIPOUSUARIO AS rol
              FROM dbo.NEUS_USUARIOS
              WHERE NEUS_ACTIVO = 1 AND NEUS_ID <> @me
              ORDER BY NEUS_NOMBRES`);
    res.json({ success: true, data: rows.recordset });
  } catch (e) {
    console.error('❌ listUsuarios:', e);
    res.status(500).json({ success: false, message: 'Error listando usuarios' });
  }
};

// Obtener lista de accesos de un archivo (quién tiene acceso y con qué permiso)
exports.getCompartidosArchivo = async (req, res) => {
  try {
    const archivoId = parseInt(req.params.id);
    if (isNaN(archivoId)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    // Asegurar columna permiso en archivo_compartido
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='archivo_compartido' AND type='U')
        BEGIN
          CREATE TABLE archivo_compartido (
            id INT IDENTITY(1,1) PRIMARY KEY,
            archivo_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL DEFAULT 0,
            permiso NVARCHAR(20) NOT NULL DEFAULT 'ver',
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END
        ELSE IF COL_LENGTH('archivo_compartido','permiso') IS NULL
        BEGIN
          ALTER TABLE archivo_compartido ADD permiso NVARCHAR(20) NOT NULL CONSTRAINT DF_ac_permiso DEFAULT('ver');
        END`);
    } catch (_) {}
    const rows = await pool.request()
      .input('aid', sql.Int, archivoId)
      .query(`SELECT ac.id, ac.usuario_id AS usuarioId, ac.permiso,
                     u.NEUS_NOMBRES AS nombre, u.NEUS_USUARIO AS usuario, u.NEUS_TIPOUSUARIO AS rol
              FROM archivo_compartido ac
              INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ac.usuario_id
              WHERE ac.archivo_id = @aid
              ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: rows.recordset });
  } catch (e) {
    console.error('❌ getCompartidosArchivo:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo accesos' });
  }
};

// Obtener lista de accesos de una carpeta (quién tiene acceso y con qué permiso)
exports.getCompartidosCarpeta = async (req, res) => {
  try {
    const carpetaId = parseInt(req.params.id);
    if (isNaN(carpetaId)) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    // Asegurar columna permiso en carpeta_compartida
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='carpeta_compartida' AND type='U')
        BEGIN
          CREATE TABLE carpeta_compartida (
            id INT IDENTITY(1,1) PRIMARY KEY,
            carpeta_id INT NOT NULL,
            usuario_id INT NOT NULL,
            compartido_por INT NOT NULL DEFAULT 0,
            permiso NVARCHAR(20) NOT NULL DEFAULT 'ver',
            fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
          );
        END
        ELSE IF COL_LENGTH('carpeta_compartida','permiso') IS NULL
        BEGIN
          ALTER TABLE carpeta_compartida ADD permiso NVARCHAR(20) NOT NULL CONSTRAINT DF_cc_permiso DEFAULT('ver');
        END`);
    } catch (_) {}
    const rows = await pool.request()
      .input('cid', sql.Int, carpetaId)
      .query(`SELECT cc.id, cc.usuario_id AS usuarioId, cc.permiso,
                     u.NEUS_NOMBRES AS nombre, u.NEUS_USUARIO AS usuario, u.NEUS_TIPOUSUARIO AS rol
              FROM carpeta_compartida cc
              INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = cc.usuario_id
              WHERE cc.carpeta_id = @cid
              ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: rows.recordset });
  } catch (e) {
    console.error('❌ getCompartidosCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo accesos' });
  }
};

// Revocar acceso de un usuario a un archivo
exports.revocarAccesoArchivo = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isADorTI(role)) return res.status(403).json({ success: false, message: 'Sin permiso' });
    const archivoId = parseInt(req.params.id);
    const usuarioId = parseInt(req.params.usuarioId);
    if (isNaN(archivoId) || isNaN(usuarioId)) return res.status(400).json({ success: false, message: 'IDs inválidos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('aid', sql.Int, archivoId)
      .input('uid', sql.Int, usuarioId)
      .query('DELETE FROM archivo_compartido WHERE archivo_id=@aid AND usuario_id=@uid');
    res.json({ success: true });
  } catch (e) {
    console.error('❌ revocarAccesoArchivo:', e);
    res.status(500).json({ success: false, message: 'Error revocando acceso' });
  }
};

// Revocar acceso de un usuario a una carpeta
exports.revocarAccesoCarpeta = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isADorTI(role)) return res.status(403).json({ success: false, message: 'Sin permiso' });
    const carpetaId = parseInt(req.params.id);
    const usuarioId = parseInt(req.params.usuarioId);
    if (isNaN(carpetaId) || isNaN(usuarioId)) return res.status(400).json({ success: false, message: 'IDs inválidos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('cid', sql.Int, carpetaId)
      .input('uid', sql.Int, usuarioId)
      .query('DELETE FROM carpeta_compartida WHERE carpeta_id=@cid AND usuario_id=@uid');
    res.json({ success: true });
  } catch (e) {
    console.error('❌ revocarAccesoCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error revocando acceso' });
  }
};

// Compartir archivo con lista de usuarios + permiso (solo AD/TI)
exports.compartirArchivo = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isADorTI(role)) return res.status(403).json({ success: false, message: 'Solo AD/TI comparten archivos' });
    const archivoId = parseInt(req.params.id);
    if (isNaN(archivoId)) return res.status(400).json({ success: false, message: 'ID archivo inválido' });
    // usuarios puede ser array de IDs o array de { id, permiso }
    const { usuarios, permiso: permisoGlobal = 'ver' } = req.body || {};
    if (!Array.isArray(usuarios) || usuarios.length === 0) return res.status(400).json({ success: false, message: 'Lista de usuarios requerida' });
    const PERMISOS_VALIDOS = ['todo', 'ver', 'descargar', 'eliminar'];
    const pool = await databaseService.getPool(req.user?.empresa);
    // Asegurar tabla con columna permiso
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='archivo_compartido' AND type='U')
      BEGIN
        CREATE TABLE archivo_compartido (
          id INT IDENTITY(1,1) PRIMARY KEY,
          archivo_id INT NOT NULL,
          usuario_id INT NOT NULL,
          compartido_por INT NOT NULL DEFAULT 0,
          permiso NVARCHAR(20) NOT NULL DEFAULT 'ver',
          fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
        );
      END
      ELSE IF COL_LENGTH('archivo_compartido','permiso') IS NULL
      BEGIN
        ALTER TABLE archivo_compartido ADD permiso NVARCHAR(20) NOT NULL CONSTRAINT DF_ac_permiso DEFAULT('ver');
      END`);
    // Obtener datos para notificación
    let archivoNombre = null;
    try {
      const rsA = await pool.request().input('aid', sql.Int, archivoId).query('SELECT TOP 1 nombre FROM archivo WHERE id=@aid');
      archivoNombre = rsA.recordset?.[0]?.nombre || null;
    } catch (_) {}
    let nombreQuienComparte = null;
    const quienComparteId = getUserId(req);
    try {
      const rsU = await pool.request().input('uid', sql.Int, quienComparteId).query("SELECT TOP 1 NEUS_NOMBRES as nombre, NEUS_USUARIO as usuario FROM dbo.NEUS_USUARIOS WHERE NEUS_ID=@uid");
      const rowU = rsU.recordset?.[0];
      nombreQuienComparte = rowU ? (rowU.nombre || rowU.usuario || null) : null;
    } catch (_) {}

    const inserted = [];
    for (const item of usuarios) {
      const uid = parseInt(typeof item === 'object' ? item.id : item);
      if (isNaN(uid)) continue;
      const permisoItem = (typeof item === 'object' && PERMISOS_VALIDOS.includes(item.permiso))
        ? item.permiso
        : (PERMISOS_VALIDOS.includes(permisoGlobal) ? permisoGlobal : 'ver');
      const exists = await pool.request()
        .input('aid', sql.Int, archivoId)
        .input('uid', sql.Int, uid)
        .query('SELECT TOP 1 id FROM archivo_compartido WHERE archivo_id=@aid AND usuario_id=@uid');
      if (exists.recordset.length > 0) {
        // Actualizar permiso si ya existe
        await pool.request()
          .input('aid', sql.Int, archivoId)
          .input('uid', sql.Int, uid)
          .input('p', sql.NVarChar, permisoItem)
          .query('UPDATE archivo_compartido SET permiso=@p WHERE archivo_id=@aid AND usuario_id=@uid');
      } else {
        await pool.request()
          .input('aid', sql.Int, archivoId)
          .input('uid', sql.Int, uid)
          .input('comp', sql.Int, quienComparteId)
          .input('p', sql.NVarChar, permisoItem)
          .query('INSERT INTO archivo_compartido (archivo_id, usuario_id, compartido_por, permiso) VALUES (@aid, @uid, @comp, @p)');
        inserted.push(uid);
        try {
          const permisoLabel = { todo: 'acceso total', ver: 'ver', descargar: 'descargar', eliminar: 'eliminar' }[permisoItem] || permisoItem;
          const mensaje = `📄 ${archivoNombre || 'Archivo'} compartido contigo (${permisoLabel}) por ${nombreQuienComparte || 'usuario'}`;
          await notificationService.createNotification({
            usuarioId: uid, mensaje, tipo: 'drive-archivo',
            dataExtra: { tipo: 'archivo', archivoId, nombre: archivoNombre, permiso: permisoItem, compartidoPor: quienComparteId },
            tenantKey: req.user?.empresa,
          });
        } catch (eNot) {
          console.warn('⚠️ No se pudo notificar archivo compartido a', uid, eNot.message);
        }
      }
    }
    res.json({ success: true, data: { archivoId, usuarios: inserted } });
  } catch (e) {
    console.error('❌ compartirArchivo:', e);
    res.status(500).json({ success: false, message: 'Error compartiendo archivo' });
  }
};

// Compartir carpeta con lista de usuarios + permiso (solo AD/TI)
exports.compartirCarpeta = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isADorTI(role)) return res.status(403).json({ success: false, message: 'Solo AD/TI comparten carpetas' });
    const carpetaId = parseInt(req.params.id);
    if (isNaN(carpetaId)) return res.status(400).json({ success: false, message: 'ID carpeta inválido' });
    // usuarios puede ser array de IDs o array de { id, permiso }
    const { usuarios, permiso: permisoGlobal = 'ver' } = req.body || {};
    if (!Array.isArray(usuarios) || usuarios.length === 0) return res.status(400).json({ success: false, message: 'Lista de usuarios requerida' });
    const PERMISOS_VALIDOS = ['todo', 'ver', 'descargar', 'eliminar'];
    const pool = await databaseService.getPool(req.user?.empresa);
    const existsCarpeta = await pool.request().input('cid', sql.Int, carpetaId)
      .query('SELECT TOP 1 id FROM carpeta WHERE id=@cid');
    if (existsCarpeta.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Carpeta no encontrada' });
    }
    // Asegurar tabla con columna permiso
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='carpeta_compartida' AND type='U')
      BEGIN
        CREATE TABLE carpeta_compartida (
          id INT IDENTITY(1,1) PRIMARY KEY,
          carpeta_id INT NOT NULL,
          usuario_id INT NOT NULL,
          compartido_por INT NOT NULL DEFAULT 0,
          permiso NVARCHAR(20) NOT NULL DEFAULT 'ver',
          fecha_compartido DATETIME NOT NULL DEFAULT GETDATE()
        );
      END
      ELSE IF COL_LENGTH('carpeta_compartida','permiso') IS NULL
      BEGIN
        ALTER TABLE carpeta_compartida ADD permiso NVARCHAR(20) NOT NULL CONSTRAINT DF_cc_permiso DEFAULT('ver');
      END`);

    let carpetaNombre = null;
    try {
      const rsC = await pool.request().input('cid', sql.Int, carpetaId).query('SELECT TOP 1 nombre FROM carpeta WHERE id=@cid');
      carpetaNombre = rsC.recordset?.[0]?.nombre || null;
    } catch (_) {}
    let nombreQuienComparte = null;
    const quienComparteId = getUserId(req);
    try {
      const rsU = await pool.request().input('uid', sql.Int, quienComparteId).query("SELECT TOP 1 NEUS_NOMBRES as nombre, NEUS_USUARIO as usuario FROM dbo.NEUS_USUARIOS WHERE NEUS_ID=@uid");
      const rowU = rsU.recordset?.[0];
      nombreQuienComparte = rowU ? (rowU.nombre || rowU.usuario || null) : null;
    } catch (_) {}

    const inserted = [];
    for (const item of usuarios) {
      const uid = parseInt(typeof item === 'object' ? item.id : item);
      if (isNaN(uid)) continue;
      const permisoItem = (typeof item === 'object' && PERMISOS_VALIDOS.includes(item.permiso))
        ? item.permiso
        : (PERMISOS_VALIDOS.includes(permisoGlobal) ? permisoGlobal : 'ver');
      const exists = await pool.request()
        .input('cid', sql.Int, carpetaId)
        .input('uid', sql.Int, uid)
        .query('SELECT TOP 1 id FROM carpeta_compartida WHERE carpeta_id=@cid AND usuario_id=@uid');
      if (exists.recordset.length > 0) {
        // Actualizar permiso
        await pool.request()
          .input('cid', sql.Int, carpetaId)
          .input('uid', sql.Int, uid)
          .input('p', sql.NVarChar, permisoItem)
          .query('UPDATE carpeta_compartida SET permiso=@p WHERE carpeta_id=@cid AND usuario_id=@uid');
      } else {
        await pool.request()
          .input('cid', sql.Int, carpetaId)
          .input('uid', sql.Int, uid)
          .input('comp', sql.Int, quienComparteId)
          .input('p', sql.NVarChar, permisoItem)
          .query('INSERT INTO carpeta_compartida (carpeta_id, usuario_id, compartido_por, permiso) VALUES (@cid, @uid, @comp, @p)');
        inserted.push(uid);
        try {
          const permisoLabel = { todo: 'acceso total', ver: 'ver', descargar: 'descargar', eliminar: 'eliminar' }[permisoItem] || permisoItem;
          const mensaje = `📁 ${carpetaNombre || ('#'+carpetaId)} compartido contigo (${permisoLabel}) por ${nombreQuienComparte || 'usuario'}`;
          await notificationService.createNotification({
            usuarioId: uid, mensaje, tipo: 'drive-carpeta',
            dataExtra: { tipo: 'carpeta', carpetaId, nombre: carpetaNombre, permiso: permisoItem, compartidoPor: quienComparteId },
            tenantKey: req.user?.empresa,
          });
        } catch (eNot) {
          console.warn('⚠️ No se pudo notificar carpeta compartida a', uid, eNot.message);
        }
      }
    }
    res.json({ success: true, data: { carpetaId, usuarios: inserted } });
  } catch (e) {
    console.error('❌ compartirCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error compartiendo carpeta', detail: String(e && e.message || e) });
  }
};

// Renombrar carpeta (solo AD)
exports.renombrarCarpeta = async (req, res) => {
  try {
    const role = getUserRole(req);
    if (!isAD(role)) return res.status(403).json({ success: false, message: 'Solo AD puede renombrar carpetas' });
    const carpetaId = parseInt(req.params.id);
    const { nombre } = req.body || {};
    if (isNaN(carpetaId)) return res.status(400).json({ success: false, message: 'ID inválido' });
    if (!nombre || String(nombre).trim() === '') return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('cid', sql.Int, carpetaId)
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .query('UPDATE carpeta SET nombre=@nombre WHERE id=@cid');
    res.json({ success: true });
  } catch (e) {
    console.error('❌ renombrarCarpeta:', e);
    res.status(500).json({ success: false, message: 'Error renombrando carpeta' });
  }
};

// 🔹 Generar token temporal para previsualización pública
exports.generarTokenPreview = async (req, res) => {
  try {
    const role = getUserRole(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID inválido' });
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const row = await pool.request().input('id', sql.Int, id).query(`SELECT id, nombre, extension, carpeta_id AS carpetaId FROM archivo WHERE id=@id`);
    if (row.recordset.length === 0) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    
    const f = row.recordset[0];
    
    // Verificar permisos
    if (!isAD(role)) {
      const usuarioId = getUserId(req) || 0;
      const permisoCheck = await pool.request()
        .input('aid', sql.Int, id)
        .input('uid', sql.Int, usuarioId)
        .input('cid', sql.Int, f.carpetaId)
        .query(`SELECT TOP 1 1 as ok FROM archivo WHERE id=@aid AND subido_por=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM archivo_compartido WHERE archivo_id=@aid AND usuario_id=@uid
                UNION ALL
                SELECT TOP 1 1 as ok FROM carpeta WHERE id=@cid AND creado_por=@uid`);
      if (permisoCheck.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Sin permiso para este archivo' });
      }
    }
    
    // Generar token temporal (válido por 10 minutos)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (10 * 60 * 1000); // 10 minutos
    
    temporalTokens.set(token, {
      archivoId: id,
      expires: expires,
      usuarioId: getUserId(req)
    });
    
    console.log(`🔑 Token temporal generado para archivo ${id}: ${token.substring(0, 10)}... (expira en 10 min)`);
    
    res.json({ 
      success: true, 
      token,
      expiresAt: new Date(expires).toISOString(),
      previewUrl: `${req.protocol}://${req.get('host')}/api/drive/archivos/public/${token}`
    });
  } catch (e) {
    console.error('❌ generarTokenPreview:', e);
    res.status(500).json({ success: false, message: 'Error generando token' });
  }
};

// 🔹 Previsualizar archivo con token temporal (acceso público)
exports.previsualizarArchivoPublico = async (req, res) => {
  try {
    const token = req.params.token;
    
    if (!token || !temporalTokens.has(token)) {
      return res.status(404).json({ success: false, message: 'Token inválido o expirado' });
    }
    
    const tokenData = temporalTokens.get(token);
    
    // Verificar expiración
    if (tokenData.expires < Date.now()) {
      temporalTokens.delete(token);
      return res.status(404).json({ success: false, message: 'Token expirado' });
    }
    
    const id = tokenData.archivoId;
    const pool = await databaseService.getPool(req.user?.empresa);
    const row = await pool.request().input('id', sql.Int, id).query(`SELECT id, nombre, extension, carpeta_id AS carpetaId, ruta FROM archivo WHERE id=@id`);
    
    if (row.recordset.length === 0) {
      temporalTokens.delete(token);
      return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    }
    
    const f = row.recordset[0];
    const filePath = path.join(BASE_DIR, String(f.carpetaId), path.basename(f.ruta || ''));
    
    if (!fs.existsSync(filePath)) {
      temporalTokens.delete(token);
      return res.status(404).json({ success: false, message: 'Archivo físico no encontrado' });
    }

    let nombreVista = f.nombre || 'archivo';
    const ext = (f.extension || '').toString().trim();
    if (ext && !nombreVista.toLowerCase().endsWith('.' + ext.toLowerCase())) {
      nombreVista += '.' + ext.toLowerCase();
    }

    const mimeMap = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
      'pdf': 'application/pdf', 'txt': 'text/plain; charset=utf-8', 'csv': 'text/csv; charset=utf-8', 'json': 'application/json',
      'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'zip': 'application/zip', 'mp4': 'video/mp4', 'mp3': 'audio/mpeg'
    };
    const contentType = mimeMap[ext.toLowerCase()] || 'application/octet-stream';

    // Headers para permitir acceso desde Google Docs Viewer
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${nombreVista}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      console.error('Stream error:', e.message);
      if (!res.headersSent) res.status(500).end();
    });
    
    console.log(`📄 Archivo servido públicamente vía token: ${nombreVista} (${id})`);
    stream.pipe(res);
  } catch (e) {
    console.error('❌ previsualizarArchivoPublico:', e);
    res.status(500).json({ success: false, message: 'Error previsualizando archivo' });
  }
};