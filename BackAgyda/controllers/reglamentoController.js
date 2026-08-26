const databaseService = require('../services/databaseService');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');

exports.getStatus = async (req, res) => {
  try {
    // Permitir obtener el userId del token autenticado si no viene en query
    const tokenUserId = req.user && (req.user.id || req.user.userId || req.user.NEUS_ID);
    const queryUserId = req.query.userId;
    const userId = parseInt(tokenUserId || queryUserId);
    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rsMeta = await pool.request().query(`SELECT TOP 1 CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC`);
    const currentVersion = rsMeta.recordset.length ? rsMeta.recordset[0].CURRENT_VERSION : 1;

    const rsAcc = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`SELECT TOP 1 VERSION FROM dbo.INTRANET_REGLAMENTO_ACEPTACIONES WHERE USER_ID=@uid ORDER BY VERSION DESC`);
    const acceptedVersion = rsAcc.recordset.length ? rsAcc.recordset[0].VERSION : 0;

    return res.json({
      success: true,
      data: {
        currentVersion,
        acceptedVersion,
        pending: acceptedVersion !== currentVersion
      }
    });
  } catch (err) {
    console.error('Error reglamento/status:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.acceptReglamento = async (req, res) => {
  try {
    // Usar el id del usuario autenticado si existe, sino permitir body (compatibilidad)
    const tokenUserId = req.user && (req.user.id || req.user.userId || req.user.NEUS_ID);
    const bodyUserId = req.body && req.body.userId;
    const userId = parseInt(tokenUserId || bodyUserId);
    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rsMeta = await pool.request().query(`SELECT TOP 1 CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC`);
    const currentVersion = rsMeta.recordset.length ? rsMeta.recordset[0].CURRENT_VERSION : 1;

    await pool.request()
      .input('uid', sql.Int, userId)
      .input('ver', sql.Int, currentVersion)
      .query(`
MERGE dbo.INTRANET_REGLAMENTO_ACEPTACIONES AS tgt
USING (SELECT @uid AS USER_ID, @ver AS VERSION) AS src
ON (tgt.USER_ID = src.USER_ID AND tgt.VERSION = src.VERSION)
WHEN NOT MATCHED THEN
  INSERT (USER_ID, VERSION, ACCEPTED_AT) VALUES (src.USER_ID, src.VERSION, GETDATE())
WHEN MATCHED THEN
  UPDATE SET ACCEPTED_AT = GETDATE();
`);
    return res.json({ success: true, message: 'Reglamento aceptado', data: { userId, version: currentVersion } });
  } catch (err) {
    console.error('Error reglamento/accept:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.bumpVersion = async (req, res) => {
  try {
    const { tipoUsuario } = req.body || {};
    if (!['AD', 'TI'].includes((tipoUsuario || '').toUpperCase())) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().query(`
DECLARE @cur INT;
IF EXISTS(SELECT 1 FROM dbo.INTRANET_REGLAMENTO_META)
BEGIN
  SELECT TOP 1 @cur = CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC;
  UPDATE dbo.INTRANET_REGLAMENTO_META SET CURRENT_VERSION = @cur + 1, UPDATED_AT = GETDATE();
END
ELSE
BEGIN
  INSERT INTO dbo.INTRANET_REGLAMENTO_META (CURRENT_VERSION) VALUES (1);
END
`);
    return res.json({ success: true, message: 'Versión de reglamento incrementada' });
  } catch (err) {
    console.error('Error reglamento/bump:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUsersStatus = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener versión vigente
    const rsMeta = await pool.request().query(`SELECT TOP 1 CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC`);
    const currentVersion = rsMeta.recordset.length ? rsMeta.recordset[0].CURRENT_VERSION : 1;

    // Última aceptación por usuario
    const rs = await pool.request().query(`
      WITH last_accept AS (
        SELECT USER_ID, MAX(VERSION) AS VERSION, MAX(ACCEPTED_AT) AS ACCEPTED_AT
        FROM dbo.INTRANET_REGLAMENTO_ACEPTACIONES
        GROUP BY USER_ID
      )
      SELECT 
        U.NEUS_ID as id,
        U.NEUS_NOMBRES as nombre,
        U.NEUS_USUARIO as usuario,
        U.NEUS_TIPOUSUARIO as tipoUsuario,
        U.NEUS_STATUS as status,
        U.NEUS_ACTIVO as activo,
        ${process.env.NODE_ENV === 'development' ? 'CONVERT(int,'+currentVersion+')' : currentVersion} as currentVersion,
        ISNULL(A.VERSION, 0) as acceptedVersion,
        A.ACCEPTED_AT as acceptedAt,
        CASE WHEN ISNULL(A.VERSION,0) <> ${process.env.NODE_ENV === 'development' ? 'CONVERT(int,'+currentVersion+')' : currentVersion} THEN 1 ELSE 0 END as pending
      FROM NEUS_USUARIOS U
      LEFT JOIN last_accept A ON A.USER_ID = U.NEUS_ID
      ORDER BY U.NEUS_NOMBRES
    `);

    return res.json({ success: true, data: rs.recordset, currentVersion });
  } catch (err) {
    console.error('Error reglamento/users-status:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.resetUser = async (req, res) => {
  try {
    const { userId, tipoUsuario } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });
    if (!['AD', 'TI'].includes(String(tipoUsuario || '').toUpperCase())) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const rsMeta = await pool.request().query(`SELECT TOP 1 CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC`);
    const currentVersion = rsMeta.recordset.length ? rsMeta.recordset[0].CURRENT_VERSION : 1;

    await pool.request()
      .input('uid', sql.Int, userId)
      .input('ver', sql.Int, currentVersion)
      .query(`DELETE FROM dbo.INTRANET_REGLAMENTO_ACEPTACIONES WHERE USER_ID=@uid AND VERSION=@ver`);

    return res.json({ success: true, message: 'Aceptación reiniciada para el usuario' });
  } catch (err) {
    console.error('Error reglamento/reset-user:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.resetAll = async (req, res) => {
  try {
    const { tipoUsuario } = req.body || {};
    if (!['AD', 'TI'].includes(String(tipoUsuario || '').toUpperCase())) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);

    const rsMeta = await pool.request().query(`SELECT TOP 1 CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC`);
    const currentVersion = rsMeta.recordset.length ? rsMeta.recordset[0].CURRENT_VERSION : 1;

    // Solo usuarios activos — los inactivos no deben afectar ni ser afectados por este flujo
    await pool.request()
      .input('ver', sql.Int, currentVersion)
      .query(`
        DELETE A FROM dbo.INTRANET_REGLAMENTO_ACEPTACIONES A
        INNER JOIN NEUS_USUARIOS U ON U.NEUS_ID = A.USER_ID
        WHERE A.VERSION=@ver AND U.NEUS_ACTIVO = 1
      `);

    return res.json({ success: true, message: 'Aceptaciones reiniciadas para los usuarios activos' });
  } catch (err) {
    console.error('Error reglamento/reset-all:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Reemplazar el PDF del reglamento y publicar automáticamente una nueva versión
// (todos los usuarios activos quedan con pending=1 al comparar contra CURRENT_VERSION)
// POST /api/reglamento/upload (multipart/form-data, campo "file")
exports.uploadPdf = async (req, res) => {
  try {
    const { tipoUsuario } = req.body || {};
    if (!['AD', 'TI'].includes((tipoUsuario || '').toUpperCase())) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Archivo PDF requerido' });
    }

    const baseDir = process.env.REGLAMENTO_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Aviso y reglamento';
    const filePath = path.resolve(baseDir, 'REGLAMENTO INTERNO.pdf');

    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    // Respaldo del archivo anterior antes de sobrescribir, por si hay que revertir
    if (fs.existsSync(filePath)) {
      const backupPath = path.resolve(baseDir, `REGLAMENTO INTERNO.backup.${Date.now()}.pdf`);
      fs.copyFileSync(filePath, backupPath);
    }

    fs.writeFileSync(filePath, req.file.buffer);

    // Publicar nueva versión — misma lógica que bumpVersion
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().query(`
DECLARE @cur INT;
IF EXISTS(SELECT 1 FROM dbo.INTRANET_REGLAMENTO_META)
BEGIN
  SELECT TOP 1 @cur = CURRENT_VERSION FROM dbo.INTRANET_REGLAMENTO_META ORDER BY UPDATED_AT DESC;
  UPDATE dbo.INTRANET_REGLAMENTO_META SET CURRENT_VERSION = @cur + 1, UPDATED_AT = GETDATE();
END
ELSE
BEGIN
  INSERT INTO dbo.INTRANET_REGLAMENTO_META (CURRENT_VERSION) VALUES (1);
END
`);

    return res.json({ success: true, message: 'Reglamento reemplazado y nueva versión publicada' });
  } catch (err) {
    console.error('Error reglamento/upload:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Servir PDFs de Reglamento y Aviso de Privacidad
// GET /api/reglamento/pdf?doc=reglamento | aviso
exports.getPdf = async (req, res) => {
  try {
    const { doc } = req.query;
    if (!doc) return res.status(400).json({ success: false, message: 'Parámetro doc requerido (reglamento|aviso)' });

    const map = {
      reglamento: 'REGLAMENTO INTERNO.pdf',
      aviso: 'AVISO DE PRIVACIDAD R.R.H.H.pdf'
    };

    const key = String(doc).toLowerCase();
    const filename = map[key];
    if (!filename) return res.status(400).json({ success: false, message: 'Valor de doc inválido' });

    const baseDir = process.env.REGLAMENTO_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Aviso y reglamento';
    const filePath = path.resolve(baseDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Archivo no encontrado en servidor', path: filePath });
    }

    // Devolver como base64 en JSON — evita que IIS bloquee application/pdf con 406
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    return res.json({ success: true, data: base64, filename });
  } catch (err) {
    console.error('Error reglamento/pdf:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};