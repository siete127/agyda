const logger = global.logger || require('../utils/logger');

// Tareas asignadas directamente por un AD a cualquier usuario, sin pasar por
// un proyecto (ver también PROYECTO_TAREAS, que sí cuelga de un proyecto).
// La tarjeta "Mis tareas" del Inicio combina ambas fuentes.
async function ensureSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.TAREAS_PERSONALES', 'U') IS NULL
  CREATE TABLE dbo.TAREAS_PERSONALES (
    TPER_ID           INT IDENTITY(1,1) PRIMARY KEY,
    TPER_TITULO       NVARCHAR(200) NOT NULL,
    TPER_DESCRIPCION  NVARCHAR(MAX) NULL,
    TPER_ASIGNADO_A   INT NOT NULL,
    TPER_ASIGNADO_POR INT NOT NULL,
    TPER_PRIORIDAD    VARCHAR(10) NOT NULL CONSTRAINT DF_TPER_PRIORIDAD DEFAULT ('media'),
    TPER_FECHA_LIMITE DATE NULL,
    TPER_COMPLETADA   BIT NOT NULL CONSTRAINT DF_TPER_COMPLETADA DEFAULT 0,
    TPER_FECHA_CREACION DATETIME NOT NULL CONSTRAINT DF_TPER_FECHA_CREACION DEFAULT GETDATE(),
    TPER_FECHA_COMPLETADA DATETIME NULL
  );
`);
    logger.info('✅ Esquema de tareas personales asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de tareas personales:', err.message);
  }
}

module.exports = { ensureSchema };
