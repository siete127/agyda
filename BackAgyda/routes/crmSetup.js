const express = require('express');
const router  = express.Router();
const sql     = require('mssql');
const databaseService = require('../services/databaseService');
const { authenticateToken, verificarRol } = require('../middleware/auth');

router.post('/setup-tables', authenticateToken, verificarRol(['AD', 'TI']), async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRM_CUOTAS' AND xtype='U')
      CREATE TABLE CRM_CUOTAS (
        CUOTA_ID         INT IDENTITY(1,1) PRIMARY KEY,
        CUOTA_USUARIO_ID INT NOT NULL,
        CUOTA_ANIO       INT NOT NULL,
        CUOTA_MES        INT NOT NULL,
        CUOTA_META       DECIMAL(18,2) NOT NULL DEFAULT 0,
        CUOTA_FECHA      DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_CUOTA UNIQUE (CUOTA_USUARIO_ID, CUOTA_ANIO, CUOTA_MES)
      )
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRM_EMAILS' AND xtype='U')
      CREATE TABLE CRM_EMAILS (
        EMAIL_ID             INT IDENTITY(1,1) PRIMARY KEY,
        EMAIL_OPO_ID         INT NULL,
        EMAIL_CONTACTO_ID    INT NULL,
        EMAIL_PARA           NVARCHAR(500) NOT NULL,
        EMAIL_ASUNTO         NVARCHAR(500) NOT NULL,
        EMAIL_CUERPO         NVARCHAR(MAX) NOT NULL,
        EMAIL_ENVIADO_POR    INT NULL,
        EMAIL_USUARIO_NOMBRE NVARCHAR(200) NULL,
        EMAIL_FECHA          DATETIME DEFAULT GETDATE(),
        EMAIL_OK             BIT DEFAULT 1,
        EMAIL_ERROR          NVARCHAR(500) NULL
      )
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='CRM_PORTAL_TOKENS' AND xtype='U')
      CREATE TABLE CRM_PORTAL_TOKENS (
        PT_ID          INT IDENTITY(1,1) PRIMARY KEY,
        PT_CONTACTO_ID INT NOT NULL,
        PT_TOKEN       NVARCHAR(100) NOT NULL UNIQUE,
        PT_EMAIL       NVARCHAR(300) NOT NULL,
        PT_ACTIVO      BIT DEFAULT 1,
        PT_EXPIRA      DATETIME NULL,
        PT_FECHA       DATETIME DEFAULT GETDATE()
      )
    `);

    res.json({ success: true, message: 'Tablas CRM creadas/verificadas' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
