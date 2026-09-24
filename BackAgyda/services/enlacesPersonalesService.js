const logger = global.logger || require('../utils/logger');

// Enlaces externos personales de cada usuario (tarjeta "Mis enlaces" del
// inicio). Mismo formato que los enlaces del encabezado de la empresa
// (personalizacion.enlacesTopbar), pero guardados por usuario: una fila por
// NEUS_ID con la lista en JSON.
async function ensureSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.USUARIO_ENLACES_PERSONALES', 'U') IS NULL
  CREATE TABLE dbo.USUARIO_ENLACES_PERSONALES (
    NEUS_ID    INT           NOT NULL PRIMARY KEY,
    ENLACES    NVARCHAR(MAX) NOT NULL,
    UPDATED_AT DATETIME      NOT NULL CONSTRAINT DF_USUARIO_ENLACES_PERSONALES_UPDATED DEFAULT GETDATE()
  );
`);
    logger.info('✅ Esquema de enlaces personales asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de enlaces personales:', err.message);
  }
}

module.exports = { ensureSchema };
