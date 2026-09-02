const sql = require('mssql');
const logger = global.logger || require('../utils/logger');

// Tabla raíz del sistema — decenas de otras tablas la referencian por FK, pero
// nunca tuvo su propio CREATE TABLE en código (se creó a mano hace tiempo en
// la BD original). Necesaria para que una empresa nueva, con una BD 100%
// vacía, pueda arrancar: debe correr ANTES que el resto de ensureXSchema.
async function ensureNeusUsuariosSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.NEUS_USUARIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NEUS_USUARIOS (
    NEUS_ID                      SMALLINT IDENTITY(1,1) PRIMARY KEY,
    NEUS_NOMBRES                 VARCHAR(150)   NOT NULL,
    NEUS_USUARIO                 VARCHAR(50)    NOT NULL,
    NEUS_CONTRA                  VARCHAR(50)    NULL,
    NEUS_TIPOUSUARIO              VARCHAR(50)    NOT NULL,
    NEUS_ACTIVO                  BIT            NOT NULL,
    NEUS_STATUS                  BIT            NOT NULL,
    NEUS_BASE                    SMALLINT       NOT NULL,
    NEUS_FECHA_REGISTRO          DATETIME       NOT NULL DEFAULT (GETDATE()),
    username                     NVARCHAR(100)  NULL,
    password                     NVARCHAR(200)  NULL,
    NEUS_ALIAS                   NVARCHAR(200)  NULL,
    NEUS_FOTO_URL                NVARCHAR(1000) NULL,
    NEUS_PORTADA_URL             NVARCHAR(1000) NULL,
    fecha_cumpleanos             DATE           NULL,
    NEUS_FECHA_INGRESO           DATE           NULL,
    id_horario                   INT            NULL,
    dias_vacaciones_disponibles  INT            NULL,
    permisos_goce_disponibles    INT            NULL,
    NEUS_PUESTO                  NVARCHAR(300)  NULL,
    NEUS_CORREO                  NVARCHAR(400)  NULL,
    NEUS_TELEFONO                NVARCHAR(60)   NULL,
    NEUS_DEPARTAMENTO            NVARCHAR(200)  NULL,
    NEUS_GENERO                  CHAR(1)        NULL
  );
  CREATE INDEX IX_NEUS_USUARIOS_id_horario ON dbo.NEUS_USUARIOS(id_horario);
END
    `);
    logger.info('✅ Esquema de NEUS_USUARIOS asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de NEUS_USUARIOS:', err.message);
  }

  // Bandera de política de contraseña (empresas ≠ agyda, ver
  // utils/passwordPolicy.js): fuerza cambio de contraseña en el próximo
  // login hasta que cumpla la política nueva. La BD de la empresa maestra
  // (agyda) se llama 'intranet' — es la única excluida del sembrado masivo,
  // consistente con utils/passwordPolicy.empresaRequierePolitica.
  try {
    const yaExisteColumna = await pool.request().query(
      `SELECT 1 AS existe FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NEUS_USUARIOS') AND name = 'NEUS_DEBE_CAMBIAR_PASSWORD'`
    );
    if (!yaExisteColumna.recordset.length) {
      await pool.request().batch(`ALTER TABLE dbo.NEUS_USUARIOS ADD NEUS_DEBE_CAMBIAR_PASSWORD BIT NOT NULL DEFAULT 0;`);
      // Sembrado único: al crear la columna, marcar a todos los usuarios
      // activos como pendientes de cambio — salvo en la BD maestra.
      const dbActual = await pool.request().query(`SELECT DB_NAME() AS nombre`);
      if (dbActual.recordset[0].nombre.toLowerCase() !== 'intranet') {
        await pool.request().query(
          `UPDATE dbo.NEUS_USUARIOS SET NEUS_DEBE_CAMBIAR_PASSWORD = 1 WHERE NEUS_ACTIVO = 1`
        );
      }
    }
  } catch (err) {
    console.warn('⚠️ No se pudo agregar NEUS_DEBE_CAMBIAR_PASSWORD:', err.message);
  }
}

async function ensureCommentsSchema(pool) {
  try {
    const batchSql = `
IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_COMENTARIOS_HABILITADOS') IS NULL
BEGIN
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_COMENTARIOS_HABILITADOS BIT NOT NULL DEFAULT (1);
END

IF OBJECT_ID('dbo.INTRANET_NOTICIAS_COMENTARIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_NOTICIAS_COMENTARIOS (
    COM_ID INT IDENTITY(1,1) PRIMARY KEY,
    COM_NOTI_ID INT NOT NULL,
    COM_USUARIO_ID INT NOT NULL,
    COM_USUARIO_NOMBRE NVARCHAR(200) NOT NULL,
    COM_CONTENIDO NVARCHAR(MAX) NOT NULL,
    COM_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    COM_FECHA_ACTUALIZACION DATETIME NULL,
    COM_ACTIVO BIT NOT NULL DEFAULT 1
  );
  ALTER TABLE dbo.INTRANET_NOTICIAS_COMENTARIOS WITH CHECK
    ADD CONSTRAINT FK_COM_NOTI FOREIGN KEY(COM_NOTI_ID)
    REFERENCES dbo.INTRANET_NOTICIAS(NOTI_ID) ON DELETE CASCADE;
  CREATE INDEX IX_INTRANET_NOTICIAS_COMENTARIOS_NOTI ON dbo.INTRANET_NOTICIAS_COMENTARIOS(COM_NOTI_ID);
  CREATE INDEX IX_INTRANET_NOTICIAS_COMENTARIOS_USUARIO ON dbo.INTRANET_NOTICIAS_COMENTARIOS(COM_USUARIO_ID);
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de comentarios asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de comentarios:', err.message);
  }
}

async function ensureReaccionesNoticiasSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.INTRANET_NOTICIAS_REACCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_NOTICIAS_REACCIONES (
    REAC_ID INT IDENTITY(1,1) PRIMARY KEY,
    REAC_NOTI_ID INT NOT NULL,
    REAC_USUARIO_ID INT NOT NULL,
    REAC_TIPO NVARCHAR(20) NOT NULL,
    REAC_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    REAC_FECHA_ACTUALIZACION DATETIME NULL,
    CONSTRAINT UQ_NOTI_REAC UNIQUE (REAC_NOTI_ID, REAC_USUARIO_ID),
    CONSTRAINT CK_NOTI_REAC_TIPO CHECK (REAC_TIPO IN ('like','love','haha','wow','sad','angry'))
  );
  ALTER TABLE dbo.INTRANET_NOTICIAS_REACCIONES WITH CHECK
    ADD CONSTRAINT FK_NOTI_REAC_NOTI FOREIGN KEY(REAC_NOTI_ID)
    REFERENCES dbo.INTRANET_NOTICIAS(NOTI_ID) ON DELETE CASCADE;
  CREATE INDEX IX_NOTI_REAC_NOTI ON dbo.INTRANET_NOTICIAS_REACCIONES(REAC_NOTI_ID);
  CREATE INDEX IX_NOTI_REAC_USUARIO ON dbo.INTRANET_NOTICIAS_REACCIONES(REAC_USUARIO_ID);
END

-- Asegurar/actualizar constraint (por si la tabla ya existía)
IF OBJECT_ID('dbo.INTRANET_NOTICIAS_REACCIONES', 'U') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_NOTI_REAC_TIPO'
      AND parent_object_id = OBJECT_ID('dbo.INTRANET_NOTICIAS_REACCIONES')
  )
  BEGIN
    ALTER TABLE dbo.INTRANET_NOTICIAS_REACCIONES DROP CONSTRAINT CK_NOTI_REAC_TIPO;
  END
  ALTER TABLE dbo.INTRANET_NOTICIAS_REACCIONES WITH CHECK
    ADD CONSTRAINT CK_NOTI_REAC_TIPO CHECK (REAC_TIPO IN ('like','love','haha','wow','sad','angry'));
END

IF OBJECT_ID('dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES (
    CREAC_ID INT IDENTITY(1,1) PRIMARY KEY,
    CREAC_COM_ID INT NOT NULL,
    CREAC_USUARIO_ID INT NOT NULL,
    CREAC_TIPO NVARCHAR(20) NOT NULL,
    CREAC_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    CREAC_FECHA_ACTUALIZACION DATETIME NULL,
    CONSTRAINT UQ_COM_REAC UNIQUE (CREAC_COM_ID, CREAC_USUARIO_ID),
    CONSTRAINT CK_COM_REAC_TIPO CHECK (CREAC_TIPO IN ('like','love','haha','wow','sad','angry'))
  );
  ALTER TABLE dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES WITH CHECK
    ADD CONSTRAINT FK_COM_REAC_COM FOREIGN KEY(CREAC_COM_ID)
    REFERENCES dbo.INTRANET_NOTICIAS_COMENTARIOS(COM_ID) ON DELETE CASCADE;
  CREATE INDEX IX_COM_REAC_COM ON dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES(CREAC_COM_ID);
  CREATE INDEX IX_COM_REAC_USUARIO ON dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES(CREAC_USUARIO_ID);
END

-- Asegurar/actualizar constraint (por si la tabla ya existía)
IF OBJECT_ID('dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES', 'U') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_COM_REAC_TIPO'
      AND parent_object_id = OBJECT_ID('dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES')
  )
  BEGIN
    ALTER TABLE dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES DROP CONSTRAINT CK_COM_REAC_TIPO;
  END
  ALTER TABLE dbo.INTRANET_NOTICIAS_COMENTARIOS_REACCIONES WITH CHECK
    ADD CONSTRAINT CK_COM_REAC_TIPO CHECK (CREAC_TIPO IN ('like','love','haha','wow','sad','angry'));
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de reacciones (noticias/comentarios) asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de reacciones:', err.message);
  }
}

// Noticias: asegurar columnas nuevas usadas por el backend (portada, imágenes, destacada)
async function ensureNoticiasSchema(pool) {
  try {
    const batchSql = `
IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_PORTADA') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_PORTADA NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_IMAGENES') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_IMAGENES NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_DESTACADA') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_DESTACADA BIT NOT NULL DEFAULT (0);

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_FECHA_CREACION') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_FECHA_CREACION DATETIME NOT NULL DEFAULT (GETDATE());

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_CATEGORIA') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_CATEGORIA NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_IMAGEN_PORTADA') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_IMAGEN_PORTADA NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_AUTOR_NOMBRE') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_AUTOR_NOMBRE NVARCHAR(200) NULL;

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_FECHA_ACTUALIZACION') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_FECHA_ACTUALIZACION DATETIME NULL;

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_ACTIVO') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_ACTIVO BIT NOT NULL DEFAULT (1);

IF COL_LENGTH('dbo.INTRANET_NOTICIAS', 'NOTI_FOCO') IS NULL
  ALTER TABLE dbo.INTRANET_NOTICIAS ADD NOTI_FOCO NVARCHAR(50) NULL;
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de noticias asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de noticias:', err.message);
  }
}

// Calendario: asegura tablas mínimas para evitar 500 en rutas públicas
async function ensureCalendarioSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.neus_calendario_eventos','U') IS NULL
BEGIN
  CREATE TABLE dbo.neus_calendario_eventos (
    id_evento INT IDENTITY(1,1) PRIMARY KEY,
    titulo NVARCHAR(200) NOT NULL,
    descripcion NVARCHAR(MAX) NULL,
    tipo_evento NVARCHAR(50) NOT NULL,
    fecha_inicio DATETIME NOT NULL,
    fecha_fin DATETIME NULL,
    todo_el_dia BIT NOT NULL DEFAULT 0,
    color NVARCHAR(20) NULL,
    ubicacion NVARCHAR(200) NULL,
    es_recurrente BIT NOT NULL DEFAULT 0,
    frecuencia NVARCHAR(20) NULL,
    intervalo INT NULL,
    dias_semana NVARCHAR(50) NULL,
    fecha_fin_recurrencia DATE NULL,
    recordatorio_minutos INT NULL,
    id_usuario INT NULL,
    creado_por INT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT GETDATE(),
    modificado_por INT NULL,
    fecha_modificacion DATETIME NULL,
    activo BIT NOT NULL DEFAULT 1
  );
  CREATE INDEX IX_calendario_eventos_fecha_inicio ON dbo.neus_calendario_eventos(fecha_inicio);
  CREATE INDEX IX_calendario_eventos_tipo ON dbo.neus_calendario_eventos(tipo_evento);
END
ELSE
BEGIN
  -- Asegurar columnas faltantes en tabla existente
  IF COL_LENGTH('dbo.neus_calendario_eventos','descripcion') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD descripcion NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','tipo_evento') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD tipo_evento NVARCHAR(50) NOT NULL DEFAULT 'fecha_importante';
  IF COL_LENGTH('dbo.neus_calendario_eventos','fecha_inicio') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD fecha_inicio DATETIME NOT NULL DEFAULT GETDATE();
  IF COL_LENGTH('dbo.neus_calendario_eventos','fecha_fin') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD fecha_fin DATETIME NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','todo_el_dia') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD todo_el_dia BIT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.neus_calendario_eventos','color') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD color NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','ubicacion') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD ubicacion NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','es_recurrente') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD es_recurrente BIT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.neus_calendario_eventos','frecuencia') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD frecuencia NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','intervalo') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD intervalo INT NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','dias_semana') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD dias_semana NVARCHAR(50) NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','fecha_fin_recurrencia') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD fecha_fin_recurrencia DATE NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','recordatorio_minutos') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD recordatorio_minutos INT NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','id_usuario') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD id_usuario INT NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','creado_por') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD creado_por INT NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','fecha_creacion') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD fecha_creacion DATETIME NOT NULL DEFAULT GETDATE();
  IF COL_LENGTH('dbo.neus_calendario_eventos','modificado_por') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD modificado_por INT NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','fecha_modificacion') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD fecha_modificacion DATETIME NULL;
  IF COL_LENGTH('dbo.neus_calendario_eventos','activo') IS NULL ALTER TABLE dbo.neus_calendario_eventos ADD activo BIT NOT NULL DEFAULT 1;
  -- Asegurar índices clave
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_calendario_eventos_fecha_inicio' AND object_id = OBJECT_ID('dbo.neus_calendario_eventos'))
    CREATE INDEX IX_calendario_eventos_fecha_inicio ON dbo.neus_calendario_eventos(fecha_inicio);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_calendario_eventos_tipo' AND object_id = OBJECT_ID('dbo.neus_calendario_eventos'))
    CREATE INDEX IX_calendario_eventos_tipo ON dbo.neus_calendario_eventos(tipo_evento);
END

IF OBJECT_ID('dbo.neus_calendario_participantes','U') IS NULL
BEGIN
  CREATE TABLE dbo.neus_calendario_participantes (
    id_evento INT NOT NULL,
    id_usuario INT NOT NULL,
    estado_asistencia NVARCHAR(20) NULL,
    fecha_respuesta DATETIME NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_neus_cal_part PRIMARY KEY (id_evento, id_usuario)
  );
  CREATE INDEX IX_calendario_participantes_evento ON dbo.neus_calendario_participantes(id_evento);
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.neus_calendario_participantes','estado_asistencia') IS NULL ALTER TABLE dbo.neus_calendario_participantes ADD estado_asistencia NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.neus_calendario_participantes','fecha_respuesta') IS NULL ALTER TABLE dbo.neus_calendario_participantes ADD fecha_respuesta DATETIME NULL;
  IF COL_LENGTH('dbo.neus_calendario_participantes','fecha_creacion') IS NULL ALTER TABLE dbo.neus_calendario_participantes ADD fecha_creacion DATETIME NOT NULL DEFAULT GETDATE();
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_calendario_participantes_evento' AND object_id = OBJECT_ID('dbo.neus_calendario_participantes'))
    CREATE INDEX IX_calendario_participantes_evento ON dbo.neus_calendario_participantes(id_evento);
END

IF OBJECT_ID('dbo.neus_calendario_notificaciones','U') IS NULL
BEGIN
  CREATE TABLE dbo.neus_calendario_notificaciones (
    id_notificacion INT IDENTITY(1,1) PRIMARY KEY,
    id_evento INT NOT NULL,
    id_usuario INT NOT NULL,
    fecha_programada DATETIME NOT NULL,
    enviada BIT NOT NULL DEFAULT 0,
    fecha_creacion DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_calendario_notif_programada ON dbo.neus_calendario_notificaciones(fecha_programada);
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.neus_calendario_notificaciones','fecha_programada') IS NULL ALTER TABLE dbo.neus_calendario_notificaciones ADD fecha_programada DATETIME NOT NULL DEFAULT GETDATE();
  IF COL_LENGTH('dbo.neus_calendario_notificaciones','enviada') IS NULL ALTER TABLE dbo.neus_calendario_notificaciones ADD enviada BIT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.neus_calendario_notificaciones','fecha_creacion') IS NULL ALTER TABLE dbo.neus_calendario_notificaciones ADD fecha_creacion DATETIME NOT NULL DEFAULT GETDATE();
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_calendario_notif_programada' AND object_id = OBJECT_ID('dbo.neus_calendario_notificaciones'))
    CREATE INDEX IX_calendario_notif_programada ON dbo.neus_calendario_notificaciones(fecha_programada);
END

-- Campo de cumpleaños en usuarios si no existe
IF COL_LENGTH('dbo.NEUS_USUARIOS', 'fecha_cumpleanos') IS NULL
BEGIN
  ALTER TABLE dbo.NEUS_USUARIOS ADD fecha_cumpleanos DATE NULL;
END
`;
    await pool.request().batch(batchSql);
    
    // Vista de apoyo - ejecutar en batch separado
    await pool.request().batch(`
CREATE OR ALTER VIEW dbo.vw_calendario_eventos_completo AS
SELECT 
  e.id_evento,
  e.titulo,
  e.descripcion,
  e.tipo_evento,
  e.fecha_inicio,
  e.fecha_fin,
  e.todo_el_dia,
  e.color,
  e.ubicacion,
  e.es_recurrente,
  e.frecuencia,
  e.intervalo,
  e.dias_semana,
  e.fecha_fin_recurrencia,
  e.recordatorio_minutos,
  e.id_usuario,
  e.activo,
  u.NEUS_NOMBRES AS usuario_nombre,
  NULL AS usuario_apellidos,
  u.username AS usuario_email,
  uc.NEUS_NOMBRES AS creador_nombre,
  NULL AS creador_apellidos,
  e.fecha_creacion,
  e.fecha_modificacion
FROM dbo.neus_calendario_eventos e
LEFT JOIN dbo.NEUS_USUARIOS u ON e.id_usuario = u.NEUS_ID
LEFT JOIN dbo.NEUS_USUARIOS uc ON e.creado_por = uc.NEUS_ID;
`);

    // Procedimiento: eventos próximos - ejecutar en batch separado
    await pool.request().batch(`
CREATE OR ALTER PROCEDURE dbo.sp_obtener_eventos_proximos
  @dias_adelante INT = 30,
  @limite INT = 10
AS
BEGIN
  SET NOCOUNT ON;
  -- Usar solo la fecha sin hora para comparación
  DECLARE @fecha_actual_solo DATE = CAST(GETDATE() AS DATE);
  DECLARE @fecha_limite DATE = DATEADD(DAY, @dias_adelante, @fecha_actual_solo);
  
  SELECT TOP (@limite)
    e.id_evento,
    e.titulo,
    e.descripcion,
    e.tipo_evento,
    e.fecha_inicio,
    e.fecha_fin,
    e.todo_el_dia,
    e.color,
    e.ubicacion,
    e.es_recurrente,
    e.frecuencia,
    e.recordatorio_minutos,
    e.creado_por,
    e.fecha_creacion,
    CASE WHEN e.tipo_evento = 'cumpleanos' THEN u.NEUS_NOMBRES ELSE NULL END AS nombre_completo,
    -- Calcular días restantes comparando solo fechas (sin hora)
    DATEDIFF(DAY, @fecha_actual_solo, CAST(e.fecha_inicio AS DATE)) AS dias_restantes
  FROM dbo.neus_calendario_eventos e
  LEFT JOIN dbo.NEUS_USUARIOS u ON e.id_usuario = u.NEUS_ID
  WHERE e.activo = 1
    -- Comparar solo la fecha sin hora
    AND CAST(e.fecha_inicio AS DATE) >= @fecha_actual_solo
    AND CAST(e.fecha_inicio AS DATE) <= @fecha_limite
  ORDER BY e.fecha_inicio ASC;
END
`);

    // Procedimiento: sincronizar cumpleaños - ejecutar en batch separado
    await pool.request().batch(`
CREATE OR ALTER PROCEDURE dbo.sp_sincronizar_cumpleanos
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM dbo.neus_calendario_eventos
  WHERE tipo_evento = 'cumpleanos'
    AND YEAR(fecha_inicio) = YEAR(GETDATE());

  INSERT INTO dbo.neus_calendario_eventos
    (titulo, descripcion, tipo_evento, fecha_inicio, fecha_fin, todo_el_dia, color, es_recurrente, frecuencia, id_usuario, creado_por, activo)
  SELECT 
    'Cumpleaños de ' + u.NEUS_NOMBRES,
    '¡Feliz cumpleaños!',
    'cumpleanos',
    DATETIMEFROMPARTS(YEAR(GETDATE()), MONTH(u.fecha_cumpleanos), DAY(u.fecha_cumpleanos), 0, 0, 0, 0),
    DATETIMEFROMPARTS(YEAR(GETDATE()), MONTH(u.fecha_cumpleanos), DAY(u.fecha_cumpleanos), 23, 59, 59, 0),
    1,
    '#FF6B9D',
    1,
    'anual',
    u.NEUS_ID,
    1,
    1
  FROM dbo.NEUS_USUARIOS u
  WHERE u.fecha_cumpleanos IS NOT NULL AND u.NEUS_ACTIVO = 1;
END
`);
  logger.info('✅ Esquema de calendario asegurado/actualizado');
    // Intentar sincronizar cumpleaños inmediatamente para poblar eventos
    try {
      await pool.request().execute('sp_sincronizar_cumpleanos');
      logger.info('🎉 Cumpleaños sincronizados tras asegurar esquema');
    } catch (syncErr) {
      console.warn('⚠️ No se pudo sincronizar cumpleaños automáticamente:', syncErr.message);
    }
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de calendario:', err.message);
  }
}

async function ensureLayoutSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.INTRANET_NOTICIAS_LAYOUT', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_NOTICIAS_LAYOUT (
    LAYOUT_ID INT IDENTITY(1,1) PRIMARY KEY,
    LAYOUT_DATA NVARCHAR(MAX) NOT NULL,
    LAYOUT_TIMESTAMP DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_INTRANET_NOTICIAS_LAYOUT_TS ON dbo.INTRANET_NOTICIAS_LAYOUT(LAYOUT_TIMESTAMP DESC);
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de layout asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de layout:', err.message);
  }
}

// Personalización de marca por empresa (tenant): logo, colores, favicon, nombre.
// Una sola fila de config (la última gana, igual que INTRANET_NOTICIAS_LAYOUT) +
// una tabla de assets (binarios en disco, metadatos aquí).
async function ensurePersonalizacionSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.INTRANET_PERSONALIZACION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_PERSONALIZACION (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    CONFIG_DATA NVARCHAR(MAX) NOT NULL,
    UPDATED_AT  DATETIME NOT NULL DEFAULT GETDATE(),
    UPDATED_BY  INT NULL
  );
END

IF OBJECT_ID('dbo.INTRANET_PERSONALIZACION_ASSETS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_PERSONALIZACION_ASSETS (
    ASSET_ID        INT IDENTITY(1,1) PRIMARY KEY,
    ASSET_TIPO      NVARCHAR(30) NOT NULL,          -- logo-principal | logo-compacto | favicon | login
    NOMBRE_ARCHIVO  NVARCHAR(300) NOT NULL,
    NOMBRE_ORIGINAL NVARCHAR(300) NULL,
    MIME            NVARCHAR(100) NULL,
    TAMANIO         INT NULL,
    SUBIDO_POR      INT NULL,
    CREATED_AT      DATETIME NOT NULL DEFAULT GETDATE()
  );
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de personalización asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de personalización:', err.message);
  }
}

async function ensureReglamentoSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.INTRANET_REGLAMENTO_META', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_REGLAMENTO_META (
    META_ID INT IDENTITY(1,1) PRIMARY KEY,
    CURRENT_VERSION INT NOT NULL DEFAULT(1),
    UPDATED_AT DATETIME NOT NULL DEFAULT(GETDATE())
  );
  INSERT INTO dbo.INTRANET_REGLAMENTO_META(CURRENT_VERSION) VALUES (1);
END

IF OBJECT_ID('dbo.INTRANET_REGLAMENTO_ACEPTACIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_REGLAMENTO_ACEPTACIONES (
    USER_ID INT NOT NULL,
    VERSION INT NOT NULL,
    ACCEPTED_AT DATETIME NOT NULL DEFAULT(GETDATE()),
    CONSTRAINT PK_REGLAMENTO_ACEPT PRIMARY KEY (USER_ID, VERSION)
  );
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de reglamento asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de reglamento:', err.message);
  }
}

// Catálogos base del flujo integral de soporte TI: Sedes, árbol de Categorías/
// Subcategorías (reemplaza la lista fija de constants/ticketCategorias.js como
// fuente de verdad para la UI), y Especialidades de técnico.
async function ensureCatalogosTiSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.SEDES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.SEDES (
    SEDE_ID INT IDENTITY(1,1) PRIMARY KEY,
    SEDE_NOMBRE NVARCHAR(100) NOT NULL,
    SEDE_DIRECCION NVARCHAR(300) NULL,
    SEDE_ACTIVA BIT NOT NULL DEFAULT 1,
    SEDE_CREADO_POR INT NULL,
    SEDE_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_SEDES_NOMBRE UNIQUE (SEDE_NOMBRE)
  );
END

IF OBJECT_ID('dbo.TICKET_CATEGORIAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_CATEGORIAS (
    CAT_ID INT IDENTITY(1,1) PRIMARY KEY,
    CAT_NOMBRE NVARCHAR(80) NOT NULL,
    CAT_ORDEN INT NOT NULL DEFAULT 0,
    CAT_ACTIVA BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TICKET_CATEGORIAS_NOMBRE UNIQUE (CAT_NOMBRE)
  );
END

IF OBJECT_ID('dbo.TICKET_SUBCATEGORIAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_SUBCATEGORIAS (
    SUBCAT_ID INT IDENTITY(1,1) PRIMARY KEY,
    SUBCAT_CAT_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TICKET_CATEGORIAS(CAT_ID),
    SUBCAT_NOMBRE NVARCHAR(100) NOT NULL,
    SUBCAT_ORDEN INT NOT NULL DEFAULT 0,
    SUBCAT_ACTIVA BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TICKET_SUBCAT UNIQUE (SUBCAT_CAT_ID, SUBCAT_NOMBRE)
  );
  CREATE INDEX IX_TICKET_SUBCAT_CAT ON dbo.TICKET_SUBCATEGORIAS(SUBCAT_CAT_ID);
END

-- Tercer nivel del árbol de clasificación (Categoría > Subcategoría > Elemento),
-- mismo patrón que TICKET_SUBCATEGORIAS un nivel arriba. Opcional: no toda
-- subcategoría necesita elementos (p.ej. "Contraseñas" puede no requerir
-- desglose adicional), así que el frontend debe tratar "sin elementos" como
-- válido, no como error.
IF OBJECT_ID('dbo.TICKET_ELEMENTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_ELEMENTOS (
    ELEM_ID INT IDENTITY(1,1) PRIMARY KEY,
    ELEM_SUBCAT_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TICKET_SUBCATEGORIAS(SUBCAT_ID),
    ELEM_NOMBRE NVARCHAR(100) NOT NULL,
    ELEM_ORDEN INT NOT NULL DEFAULT 0,
    ELEM_ACTIVO BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TICKET_ELEM UNIQUE (ELEM_SUBCAT_ID, ELEM_NOMBRE)
  );
  CREATE INDEX IX_TICKET_ELEM_SUBCAT ON dbo.TICKET_ELEMENTOS(ELEM_SUBCAT_ID);
END

IF OBJECT_ID('dbo.TI_ESPECIALIDADES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_ESPECIALIDADES (
    ESP_ID INT IDENTITY(1,1) PRIMARY KEY,
    ESP_NOMBRE NVARCHAR(100) NOT NULL,
    ESP_ACTIVA BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TI_ESPECIALIDADES_NOMBRE UNIQUE (ESP_NOMBRE)
  );
END

-- Reemplaza el array fijo BackAgyda/constants/ticketCierre.js — el frontend
-- pasa a leer estos códigos de la BD para poder administrarlos desde
-- Configuración > Tecnología/TI, igual que Especialidades.
IF OBJECT_ID('dbo.TICKET_CODIGOS_CIERRE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_CODIGOS_CIERRE (
    COD_ID INT IDENTITY(1,1) PRIMARY KEY,
    COD_NOMBRE NVARCHAR(100) NOT NULL,
    COD_ORDEN INT NOT NULL DEFAULT 0,
    COD_ACTIVA BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TICKET_CODIGOS_CIERRE_NOMBRE UNIQUE (COD_NOMBRE)
  );
END
`;
    await pool.request().batch(batchSql);

    // Seeds idempotentes (solo si la tabla respectiva está vacía)
    const seedSedes = await pool.request().query('SELECT COUNT(*) as n FROM dbo.SEDES');
    if (seedSedes.recordset[0].n === 0) {
      await pool.request().query(`INSERT INTO dbo.SEDES (SEDE_NOMBRE) VALUES ('Matriz')`);
    }

    const seedCategorias = await pool.request().query('SELECT COUNT(*) as n FROM dbo.TICKET_CATEGORIAS');
    if (seedCategorias.recordset[0].n === 0) {
      await pool.request().query(`
        INSERT INTO dbo.TICKET_CATEGORIAS (CAT_NOMBRE, CAT_ORDEN) VALUES
          ('Hardware',1),('Software',2),('Usuarios y Accesos',3),('Redes',4),
          ('Servidores',5),('Telefonía/Contact Center',6),('ERP',7),('CRM',8),
          ('Bases de Datos',9),('Seguridad',10),('Desarrollo',11),('Otros',12)
      `);
    }

    const seedEsp = await pool.request().query('SELECT COUNT(*) as n FROM dbo.TI_ESPECIALIDADES');
    if (seedEsp.recordset[0].n === 0) {
      await pool.request().query(`
        INSERT INTO dbo.TI_ESPECIALIDADES (ESP_NOMBRE) VALUES
          ('Hardware'),('Redes'),('Bases de Datos'),('Seguridad'),('ERP'),
          ('CRM'),('Telefonía'),('Desarrollo'),('Sistemas Operativos'),('Servidores')
      `);
    }

    const seedCodigosCierre = await pool.request().query('SELECT COUNT(*) as n FROM dbo.TICKET_CODIGOS_CIERRE');
    if (seedCodigosCierre.recordset[0].n === 0) {
      await pool.request().query(`
        INSERT INTO dbo.TICKET_CODIGOS_CIERRE (COD_NOMBRE, COD_ORDEN) VALUES
          ('Solucionado',1),('Solucionado con workaround',2),('Solicitud completada',3),
          ('Configuración/cambio realizado',4),('Resuelto por proveedor',5),('Resuelto por desarrollo',6),
          ('Error de usuario / orientación',7),('Falla no encontrada',8),('Duplicado',9),
          ('Cancelado',10),('Sin respuesta del usuario',11),('No procede',12)
      `);
    }

    logger.info('✅ Catálogos de Tecnología/TI asegurados (Sedes, Categorías, Especialidades, Códigos de Cierre)');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar catálogos de Tecnología/TI:', err.message);
  }
}

async function ensureTicketsSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.TICKETS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS (
    TICKET_ID INT IDENTITY(1,1) PRIMARY KEY,
    SOLICITANTE_ID INT NOT NULL,
    AREA NVARCHAR(10) NOT NULL,
    PRIORIDAD NVARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    TITULO NVARCHAR(200) NOT NULL,
    DESCRIPCION NVARCHAR(MAX) NULL,
    ESTADO NVARCHAR(20) NOT NULL DEFAULT 'abierto',
    FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    FECHA_ASIGNACION DATETIME NULL,
    FECHA_PRIMERA_RESPUESTA DATETIME NULL,
    FECHA_CIERRE DATETIME NULL,
    ASIGNADO_A INT NULL
  );
  CREATE INDEX IX_TICKETS_AREA_ESTADO ON dbo.TICKETS(AREA, ESTADO);
  CREATE INDEX IX_TICKETS_ASIGNADO ON dbo.TICKETS(ASIGNADO_A) WHERE ASIGNADO_A IS NOT NULL;
END

IF OBJECT_ID('dbo.TICKET_HISTORIAL', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_HISTORIAL (
    HIST_ID INT IDENTITY(1,1) PRIMARY KEY,
    TICKET_ID INT NOT NULL,
    TIPO NVARCHAR(30) NOT NULL,
    DETALLE NVARCHAR(MAX) NULL,
    USER_ID INT NULL,
    CREATED_AT DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_TICKET_HIST_TICKET ON dbo.TICKET_HISTORIAL(TICKET_ID);
END

IF OBJECT_ID('dbo.TICKET_COMENTARIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_COMENTARIOS (
    COM_ID INT IDENTITY(1,1) PRIMARY KEY,
    TICKET_ID INT NOT NULL,
    USER_ID INT NOT NULL,
    CONTENIDO NVARCHAR(MAX) NOT NULL,
    CREATED_AT DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_TICKET_COM_TICKET ON dbo.TICKET_COMENTARIOS(TICKET_ID);
END

IF OBJECT_ID('dbo.TICKET_SATISFACCION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_SATISFACCION (
    TICKET_ID INT NOT NULL PRIMARY KEY,
    RATING INT NOT NULL,
    COMENTARIO NVARCHAR(MAX) NULL,
    SUBMIT_AT DATETIME NOT NULL DEFAULT GETDATE()
  );
END

IF OBJECT_ID('dbo.TI_STAFF_STATUS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_STAFF_STATUS (
    USER_ID INT NOT NULL PRIMARY KEY,
    AREA NVARCHAR(10) NOT NULL DEFAULT 'TI',
    DISPONIBLE BIT NOT NULL DEFAULT 1,
    LAST_ASSIGNED_AT DATETIME NULL
  );
END

IF OBJECT_ID('dbo.NOTIFICACIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NOTIFICACIONES (
    NOTI_ID INT IDENTITY(1,1) PRIMARY KEY,
    USER_ID INT NOT NULL,
    TIPO NVARCHAR(50) NOT NULL,
    TICKET_ID INT NULL,
    MENSAJE NVARCHAR(500) NULL,
    DATA_EXTRA NVARCHAR(MAX) NULL,
    CREATED_AT DATETIME NOT NULL DEFAULT GETDATE(),
    LEIDA BIT NOT NULL DEFAULT 0
  );
  CREATE INDEX IX_NOTI_USER_LEIDA ON dbo.NOTIFICACIONES(USER_ID, LEIDA, CREATED_AT DESC);
END
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NOTIFICACIONES' AND COLUMN_NAME='DATA_EXTRA')
    ALTER TABLE dbo.NOTIFICACIONES ADD DATA_EXTRA NVARCHAR(MAX) NULL;
END

-- Suscripciones de notificaciones push del navegador (Web Push / VAPID).
-- Un usuario puede tener varias (una por navegador/dispositivo donde activó
-- push). PUSH_ENDPOINT es único por navegador — sirve de llave natural para
-- evitar duplicar la misma suscripción si el usuario la vuelve a activar.
IF OBJECT_ID('dbo.PUSH_SUSCRIPCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PUSH_SUSCRIPCIONES (
    PUSH_ID INT IDENTITY(1,1) PRIMARY KEY,
    PUSH_USER_ID INT NOT NULL,
    PUSH_ENDPOINT NVARCHAR(500) NOT NULL,
    PUSH_P256DH NVARCHAR(300) NOT NULL,
    PUSH_AUTH NVARCHAR(150) NOT NULL,
    PUSH_USER_AGENT NVARCHAR(300) NULL,
    PUSH_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    PUSH_ULTIMO_USO DATETIME NULL,
    CONSTRAINT UQ_PUSH_ENDPOINT UNIQUE (PUSH_ENDPOINT)
  );
  CREATE INDEX IX_PUSH_USER ON dbo.PUSH_SUSCRIPCIONES(PUSH_USER_ID);
END

-- Catálogo de días festivos/no laborables para el cálculo de SLA. El SLA de
-- tickets excluye sábados, domingos y las fechas listadas aquí (día completo,
-- no franjas horarias) — ver minutosLaborablesEntre() en ticketController.js.
IF OBJECT_ID('dbo.TI_DIAS_FESTIVOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_DIAS_FESTIVOS (
    FEST_ID INT IDENTITY(1,1) PRIMARY KEY,
    FEST_FECHA DATE NOT NULL,
    FEST_DESCRIPCION NVARCHAR(150) NULL,
    CONSTRAINT UQ_TI_DIAS_FESTIVOS_FECHA UNIQUE (FEST_FECHA)
  );
END

IF OBJECT_ID('dbo.TICKETS_SLA_REGLAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_SLA_REGLAS (
    TSR_ID                  INT IDENTITY(1,1) PRIMARY KEY,
    TSR_PRIORIDAD            NVARCHAR(10)  NOT NULL,
    TSR_AREA                 NVARCHAR(10)  NULL,
    TSR_MIN_PRIMERA_RESPUESTA INT          NOT NULL,
    TSR_MIN_RESOLUCION       INT           NOT NULL,
    TSR_ACTIVA               BIT           NOT NULL DEFAULT 1,
    TSR_CREADO_POR           SMALLINT      NULL,
    TSR_FECHA_CREACION       DATETIME      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_TSR_PRIORIDAD_AREA ON dbo.TICKETS_SLA_REGLAS(TSR_PRIORIDAD, TSR_AREA);
END
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS_SLA_REGLAS' AND COLUMN_NAME='TSR_SERVICIO')
  ALTER TABLE dbo.TICKETS_SLA_REGLAS ADD TSR_SERVICIO NVARCHAR(100) NULL;
-- Mínimo esperado de primera respuesta (meta, no límite estricto de SLA):
-- TSR_MIN_PRIMERA_RESPUESTA sigue siendo el máximo/límite real que define
-- cumplimiento; este campo es puramente informativo para mostrar un rango
-- ("1 a 5 min") en vez de un solo número. NULL = sin mínimo, se muestra igual
-- que antes (solo el máximo).
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS_SLA_REGLAS' AND COLUMN_NAME='TSR_MIN_PRIMERA_RESPUESTA_DESDE')
  ALTER TABLE dbo.TICKETS_SLA_REGLAS ADD TSR_MIN_PRIMERA_RESPUESTA_DESDE INT NULL;
-- Mismo patrón para Resolución: TSR_MIN_RESOLUCION sigue siendo el máximo/
-- límite real de SLA; este campo es puramente informativo para el rango.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS_SLA_REGLAS' AND COLUMN_NAME='TSR_MIN_RESOLUCION_DESDE')
  ALTER TABLE dbo.TICKETS_SLA_REGLAS ADD TSR_MIN_RESOLUCION_DESDE INT NULL;

-- Campos personalizados por categoría: el AD define campos extra (texto,
-- número, lista o fecha) que aparecen en el formulario de ticket SOLO cuando
-- se elige una de las categorías asociadas al campo (TCP_CAMPO_CATEGORIA).
-- Sin categorías asociadas = el campo no aparece en ningún formulario (evita
-- que un campo "huérfano" aparezca por accidente en todos los tickets).
IF OBJECT_ID('dbo.TI_CAMPOS_PERSONALIZADOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_CAMPOS_PERSONALIZADOS (
    CP_ID INT IDENTITY(1,1) PRIMARY KEY,
    CP_NOMBRE NVARCHAR(100) NOT NULL,
    CP_TIPO NVARCHAR(20) NOT NULL, -- 'texto' | 'numero' | 'lista' | 'fecha'
    CP_OPCIONES NVARCHAR(MAX) NULL, -- CSV de opciones, solo para CP_TIPO='lista'
    CP_REQUERIDO BIT NOT NULL DEFAULT 0,
    CP_ORDEN INT NOT NULL DEFAULT 0,
    CP_ACTIVO BIT NOT NULL DEFAULT 1,
    CP_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_TI_CAMPOS_PERSONALIZADOS_NOMBRE UNIQUE (CP_NOMBRE)
  );
END
IF OBJECT_ID('dbo.TI_CAMPO_PERSONALIZADO_CATEGORIA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_CAMPO_PERSONALIZADO_CATEGORIA (
    TCP_ID INT IDENTITY(1,1) PRIMARY KEY,
    TCP_CAMPO_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TI_CAMPOS_PERSONALIZADOS(CP_ID) ON DELETE CASCADE,
    TCP_CAT_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TICKET_CATEGORIAS(CAT_ID),
    CONSTRAINT UQ_TI_CAMPO_CATEGORIA UNIQUE (TCP_CAMPO_ID, TCP_CAT_ID)
  );
  CREATE INDEX IX_TCP_CAT ON dbo.TI_CAMPO_PERSONALIZADO_CATEGORIA(TCP_CAT_ID);
END
IF OBJECT_ID('dbo.TICKET_CAMPOS_VALORES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_CAMPOS_VALORES (
    TCV_ID INT IDENTITY(1,1) PRIMARY KEY,
    TCV_TICKET_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TICKETS(TICKET_ID) ON DELETE CASCADE,
    TCV_CAMPO_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TI_CAMPOS_PERSONALIZADOS(CP_ID),
    TCV_VALOR NVARCHAR(500) NULL, -- texto/número/fecha(ISO)/opción de lista, todos como texto
    CONSTRAINT UQ_TICKET_CAMPO_VALOR UNIQUE (TCV_TICKET_ID, TCV_CAMPO_ID)
  );
  CREATE INDEX IX_TCV_TICKET ON dbo.TICKET_CAMPOS_VALORES(TCV_TICKET_ID);
END

-- Reglas de envío de encuesta de satisfacción: una fila por área (TI/ST) con
-- la prioridad MÍNIMA que amerita encuesta. P1 es la más crítica, así que
-- "prioridad mínima P2" significa que P1 y P2 sí reciben encuesta, P3/P4 no.
-- Sin fila para un área = comportamiento anterior (siempre se ofrece), para
-- no romper el flujo si el AD no configuró nada todavía.
IF OBJECT_ID('dbo.TICKETS_ENCUESTA_CONFIG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_ENCUESTA_CONFIG (
    TEN_ID INT IDENTITY(1,1) PRIMARY KEY,
    TEN_AREA NVARCHAR(10) NOT NULL,
    TEN_PRIORIDAD_MINIMA NVARCHAR(10) NOT NULL DEFAULT 'P4', -- P4 = todas las prioridades reciben encuesta
    CONSTRAINT UQ_TICKETS_ENCUESTA_CONFIG_AREA UNIQUE (TEN_AREA)
  );
END

-- Catálogo de Servicios y Proveedores (Tecnología/TI). TICKETS.SERVICIO_AFECTADO
-- sigue siendo texto libre (igual que CATEGORIA/SEDE, decisión D3) para no
-- migrar histórico ni tocar queries existentes — el frontend lo llena desde
-- este catálogo, el backend no lo valida contra FK.
IF OBJECT_ID('dbo.TI_SERVICIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_SERVICIOS (
    SRV_ID INT IDENTITY(1,1) PRIMARY KEY,
    SRV_NOMBRE NVARCHAR(100) NOT NULL,
    SRV_DESCRIPCION NVARCHAR(300) NULL,
    SRV_PROVEEDOR_ID INT NULL,
    SRV_ACTIVO BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TI_SERVICIOS_NOMBRE UNIQUE (SRV_NOMBRE)
  );
END
IF OBJECT_ID('dbo.TI_PROVEEDORES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_PROVEEDORES (
    PROV_ID INT IDENTITY(1,1) PRIMARY KEY,
    PROV_NOMBRE NVARCHAR(150) NOT NULL,
    PROV_CONTACTO NVARCHAR(150) NULL,
    PROV_TELEFONO NVARCHAR(30) NULL,
    PROV_CORREO NVARCHAR(150) NULL,
    PROV_ACTIVO BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_TI_PROVEEDORES_NOMBRE UNIQUE (PROV_NOMBRE)
  );
END
IF OBJECT_ID('dbo.TI_SERVICIOS', 'U') IS NOT NULL AND OBJECT_ID('dbo.TI_PROVEEDORES', 'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TI_SERVICIOS_PROVEEDOR')
BEGIN
  ALTER TABLE dbo.TI_SERVICIOS ADD CONSTRAINT FK_TI_SERVICIOS_PROVEEDOR
    FOREIGN KEY (SRV_PROVEEDOR_ID) REFERENCES dbo.TI_PROVEEDORES(PROV_ID);
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SERVICIO_AFECTADO')
  ALTER TABLE dbo.TICKETS ADD SERVICIO_AFECTADO NVARCHAR(100) NULL;

-- FK real hacia los catálogos, ADITIVA sobre las columnas de texto libre
-- existentes (mismo patrón D3 ya usado para CATEGORIA/SEDE): no se migra el
-- histórico ni se toca ninguna query que ya lee SERVICIO_AFECTADO/ACTIVO_AFECTADO
-- como texto. Tickets nuevos creados desde un catálogo llenan ambas columnas
-- (texto + ID); tickets viejos quedan con ID NULL y siguen mostrando su texto.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SERVICIO_AFECTADO_ID')
  ALTER TABLE dbo.TICKETS ADD SERVICIO_AFECTADO_ID INT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TICKETS_SERVICIO_AFECTADO')
  ALTER TABLE dbo.TICKETS ADD CONSTRAINT FK_TICKETS_SERVICIO_AFECTADO FOREIGN KEY (SERVICIO_AFECTADO_ID) REFERENCES dbo.TI_SERVICIOS(SRV_ID);

-- Canal por el que se originó el ticket. Valores usados en JS (sin CHECK
-- constraint, para no requerir migración si se agrega un canal nuevo):
-- 'portal' | 'chatbot' | 'chat_en_vivo' | 'tecnico' | 'api'. NULL en tickets
-- históricos creados antes de esta columna.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='CANAL_ORIGEN')
  ALTER TABLE dbo.TICKETS ADD CANAL_ORIGEN NVARCHAR(20) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='CLASIFICACION')
  ALTER TABLE dbo.TICKETS ADD CLASIFICACION NVARCHAR(30) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='CATEGORIA')
  ALTER TABLE dbo.TICKETS ADD CATEGORIA NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SUBCATEGORIA')
  ALTER TABLE dbo.TICKETS ADD SUBCATEGORIA NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='ELEMENTO')
  ALTER TABLE dbo.TICKETS ADD ELEMENTO NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SEDE')
  ALTER TABLE dbo.TICKETS ADD SEDE NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='DEPARTAMENTO')
  ALTER TABLE dbo.TICKETS ADD DEPARTAMENTO NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='ACTIVO_AFECTADO')
  ALTER TABLE dbo.TICKETS ADD ACTIVO_AFECTADO NVARCHAR(200) NULL;

-- ACTIVO_AFECTADO_ID: FK hacia ACTIVOS_GENERALES(AG_ID). La constraint se crea
-- en ensureActivosGeneralesSchema (más abajo), no aquí, porque esa tabla se
-- asegura DESPUÉS de esta función en ensureAllSchemas — crear la FK antes de
-- que exista la tabla destino rompería el bootstrap en una instalación nueva.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='ACTIVO_AFECTADO_ID')
  ALTER TABLE dbo.TICKETS ADD ACTIVO_AFECTADO_ID INT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='IMPACTO')
  ALTER TABLE dbo.TICKETS ADD IMPACTO NVARCHAR(10) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='URGENCIA')
  ALTER TABLE dbo.TICKETS ADD URGENCIA NVARCHAR(10) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='PRIORIDAD_MANUAL')
  ALTER TABLE dbo.TICKETS ADD PRIORIDAD_MANUAL BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='NIVEL_ACTUAL')
  ALTER TABLE dbo.TICKETS ADD NIVEL_ACTUAL TINYINT NOT NULL DEFAULT 1;

-- Snapshot de SLA/tiempos al momento del cierre. enriquecerConSla() calcula esto
-- en vivo en cada GET usando la regla SLA ACTUAL — si un admin edita/borra esa
-- regla después, el resultado mostrado para tickets ya cerrados cambia
-- retroactivamente. Estas columnas congelan el resultado real en el momento
-- del cierre, para reportes históricos y auditoría. NULL en tickets cerrados
-- antes de esta columna (no se recalculan retroactivamente).
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SLA_RESPUESTA_CUMPLIDO')
  ALTER TABLE dbo.TICKETS ADD SLA_RESPUESTA_CUMPLIDO BIT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SLA_RESOLUCION_CUMPLIDO')
  ALTER TABLE dbo.TICKETS ADD SLA_RESOLUCION_CUMPLIDO BIT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='MINUTOS_PRIMERA_RESPUESTA')
  ALTER TABLE dbo.TICKETS ADD MINUTOS_PRIMERA_RESPUESTA INT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='MINUTOS_TRABAJADOS')
  ALTER TABLE dbo.TICKETS ADD MINUTOS_TRABAJADOS INT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='CODIGO_CIERRE')
  ALTER TABLE dbo.TICKETS ADD CODIGO_CIERRE NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='CAUSA_RAIZ')
  ALTER TABLE dbo.TICKETS ADD CAUSA_RAIZ NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='DIAGNOSTICO')
  ALTER TABLE dbo.TICKETS ADD DIAGNOSTICO NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='ACCIONES_REALIZADAS')
  ALTER TABLE dbo.TICKETS ADD ACCIONES_REALIZADAS NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='FECHA_RESOLUCION_PROPUESTA')
  ALTER TABLE dbo.TICKETS ADD FECHA_RESOLUCION_PROPUESTA DATETIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='VALIDADO_USUARIO')
  ALTER TABLE dbo.TICKETS ADD VALIDADO_USUARIO BIT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='FECHA_VALIDACION')
  ALTER TABLE dbo.TICKETS ADD FECHA_VALIDACION DATETIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='REABIERTO_VECES')
  ALTER TABLE dbo.TICKETS ADD REABIERTO_VECES INT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SLA_RIESGO_NOTIFICADO')
  ALTER TABLE dbo.TICKETS ADD SLA_RIESGO_NOTIFICADO BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='SLA_VENCIDO_NOTIFICADO')
  ALTER TABLE dbo.TICKETS ADD SLA_VENCIDO_NOTIFICADO BIT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='NIVEL')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD NIVEL TINYINT NOT NULL DEFAULT 1;

-- Perfil rico de técnico (flujo integral de soporte TI): estado de trabajo,
-- capacidad, prioridades/horario permitidos.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='ESTADO_TRABAJO')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD ESTADO_TRABAJO NVARCHAR(20) NOT NULL DEFAULT 'disponible';
  -- valores válidos en JS (sin CHECK CONSTRAINT, para poder agregar estados sin migración):
  -- 'disponible' | 'pausa' | 'fuera_horario' | 'ocupado'
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='MAX_TICKETS')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD MAX_TICKETS INT NOT NULL DEFAULT 10;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='MAX_CHATS')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD MAX_CHATS INT NOT NULL DEFAULT 5;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='PRIORIDADES_PERMITIDAS')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD PRIORIDADES_PERMITIDAS NVARCHAR(20) NULL; -- CSV 'P1,P2,P3,P4'; NULL = todas
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='HORARIO_INICIO')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD HORARIO_INICIO TIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='HORARIO_FIN')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD HORARIO_FIN TIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='DIAS_SEMANA')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD DIAS_SEMANA NVARCHAR(20) NULL; -- CSV '1,2,3,4,5' (1=lunes); NULL = sin restricción
-- Sábado puede tener su propio horario (ej. 09:00-14:00 vs 09:00-18:00 entre
-- semana), mismo patrón ya usado en LIVECHAT_CONFIG (LCF_SABADO_HORARIO_*).
-- Si no está configurado, cae al horario general (HORARIO_INICIO/FIN).
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='HORARIO_SABADO_INICIO')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD HORARIO_SABADO_INICIO TIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_STAFF_STATUS' AND COLUMN_NAME='HORARIO_SABADO_FIN')
  ALTER TABLE dbo.TI_STAFF_STATUS ADD HORARIO_SABADO_FIN TIME NULL;

-- Puentes técnico <-> especialidad / categoría permitida / sede permitida.
-- Regla semántica: sin filas = sin restricción (permitido en todo), no "prohibido en todo".
IF OBJECT_ID('dbo.TI_TECNICO_ESPECIALIDAD', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_TECNICO_ESPECIALIDAD (
    TE_ID INT IDENTITY(1,1) PRIMARY KEY,
    TE_USER_ID INT NOT NULL,
    TE_ESP_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TI_ESPECIALIDADES(ESP_ID),
    CONSTRAINT UQ_TI_TEC_ESP UNIQUE (TE_USER_ID, TE_ESP_ID)
  );
  CREATE INDEX IX_TI_TEC_ESP_USER ON dbo.TI_TECNICO_ESPECIALIDAD(TE_USER_ID);
END

IF OBJECT_ID('dbo.TI_TECNICO_CATEGORIA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_TECNICO_CATEGORIA (
    TC_ID INT IDENTITY(1,1) PRIMARY KEY,
    TC_USER_ID INT NOT NULL,
    TC_CAT_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.TICKET_CATEGORIAS(CAT_ID),
    CONSTRAINT UQ_TI_TEC_CAT UNIQUE (TC_USER_ID, TC_CAT_ID)
  );
  CREATE INDEX IX_TI_TEC_CAT_USER ON dbo.TI_TECNICO_CATEGORIA(TC_USER_ID);
END

IF OBJECT_ID('dbo.TI_TECNICO_SEDE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_TECNICO_SEDE (
    TS_ID INT IDENTITY(1,1) PRIMARY KEY,
    TS_USER_ID INT NOT NULL,
    TS_SEDE_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.SEDES(SEDE_ID),
    CONSTRAINT UQ_TI_TEC_SEDE UNIQUE (TS_USER_ID, TS_SEDE_ID)
  );
  CREATE INDEX IX_TI_TEC_SEDE_USER ON dbo.TI_TECNICO_SEDE(TS_USER_ID);
END

IF OBJECT_ID('dbo.TICKET_ESCALAMIENTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKET_ESCALAMIENTOS (
    ESC_ID            INT IDENTITY(1,1) PRIMARY KEY,
    TICKET_ID         INT NOT NULL FOREIGN KEY REFERENCES dbo.TICKETS(TICKET_ID),
    NIVEL_ORIGEN      TINYINT NOT NULL,
    NIVEL_DESTINO     TINYINT NOT NULL,
    TIPO              NVARCHAR(20) NOT NULL,
    MOTIVO            NVARCHAR(300) NULL,
    ASIGNADO_ANTERIOR INT NULL,
    ASIGNADO_NUEVO    INT NULL,
    ACTOR_ID          INT NULL,
    CREATED_AT        DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_TICKET_ESC_TICKET ON dbo.TICKET_ESCALAMIENTOS(TICKET_ID);
END
-- Vínculo real hacia el catálogo de Proveedores (D del diagrama: Nivel 3
-- puede escalar a "Proveedor"). Aditivo — el resto de escalamientos (a
-- especialista/desarrollo interno) simplemente dejan esto NULL.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKET_ESCALAMIENTOS' AND COLUMN_NAME='PROVEEDOR_ID')
  ALTER TABLE dbo.TICKET_ESCALAMIENTOS ADD PROVEEDOR_ID INT NULL FOREIGN KEY REFERENCES dbo.TI_PROVEEDORES(PROV_ID);

IF OBJECT_ID('dbo.TICKETS_API_KEYS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_API_KEYS (
    KEY_ID          INT IDENTITY(1,1) PRIMARY KEY,
    KEY_HASH        NVARCHAR(128) NOT NULL,
    NOMBRE          NVARCHAR(100) NOT NULL,
    ACTIVA          BIT NOT NULL DEFAULT 1,
    CREADO_POR      INT NULL,
    FECHA_CREACION  DATETIME NOT NULL DEFAULT GETDATE(),
    ULTIMO_USO      DATETIME NULL
  );
  CREATE INDEX IX_TICKETS_API_KEYS_HASH ON dbo.TICKETS_API_KEYS(KEY_HASH);
END

IF OBJECT_ID('dbo.GRUPOS_SOPORTE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.GRUPOS_SOPORTE (
    GRUPO_ID  INT IDENTITY(1,1) PRIMARY KEY,
    AREA      NVARCHAR(10) NOT NULL,
    NIVEL     TINYINT NOT NULL,
    NOMBRE    NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_GRUPOS_SOPORTE_AREA_NIVEL UNIQUE (AREA, NIVEL)
  );
END

IF NOT EXISTS (SELECT 1 FROM dbo.GRUPOS_SOPORTE)
BEGIN
  INSERT INTO dbo.GRUPOS_SOPORTE (AREA, NIVEL, NOMBRE) VALUES
    ('TI', 1, 'Mesa de Ayuda TI'), ('TI', 2, 'Soporte Técnico TI'), ('TI', 3, 'Especialistas TI'),
    ('ST', 1, 'Mesa de Ayuda ST'), ('ST', 2, 'Soporte Técnico ST'), ('ST', 3, 'Especialistas ST');
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='ARTICULO_KB_ID')
  ALTER TABLE dbo.TICKETS ADD ARTICULO_KB_ID INT NULL;

-- Sub-estados de espera: aditivos, no reemplazan el modelo de ESTADO existente.
-- ESTADO gana el valor 'en_espera'; MOTIVO_ESPERA solo es válido en ese estado.
-- MINUTOS_TOTAL_ESPERA acumula el tiempo pausado para poder descontarlo del
-- cálculo de SLA (el reloj de SLA se pausa mientras el ticket está en espera).
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='MOTIVO_ESPERA')
  ALTER TABLE dbo.TICKETS ADD MOTIVO_ESPERA NVARCHAR(30) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='FECHA_INICIO_ESPERA')
  ALTER TABLE dbo.TICKETS ADD FECHA_INICIO_ESPERA DATETIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='MINUTOS_TOTAL_ESPERA')
  ALTER TABLE dbo.TICKETS ADD MINUTOS_TOTAL_ESPERA INT NOT NULL DEFAULT 0;

-- Motor de reglas de asignación: condiciones estructuradas (todas NULL = comodín)
-- que determinan nivel/especialidad requerida al elegir técnico para un ticket o chat.
IF OBJECT_ID('dbo.TI_REGLAS_ASIGNACION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_REGLAS_ASIGNACION (
    REG_ID INT IDENTITY(1,1) PRIMARY KEY,
    REG_NOMBRE NVARCHAR(150) NOT NULL,
    REG_ACTIVA BIT NOT NULL DEFAULT 1,
    REG_PRIORIDAD_ORDEN INT NOT NULL DEFAULT 0,
    REG_AREA NVARCHAR(10) NULL,
    REG_CAT_ID INT NULL FOREIGN KEY REFERENCES dbo.TICKET_CATEGORIAS(CAT_ID),
    REG_SUBCAT_ID INT NULL FOREIGN KEY REFERENCES dbo.TICKET_SUBCATEGORIAS(SUBCAT_ID),
    REG_SEDE_ID INT NULL FOREIGN KEY REFERENCES dbo.SEDES(SEDE_ID),
    REG_PRIORIDAD NVARCHAR(10) NULL,
    REG_NIVEL_REQUERIDO TINYINT NULL,
    REG_ESP_ID INT NULL FOREIGN KEY REFERENCES dbo.TI_ESPECIALIDADES(ESP_ID),
    REG_CREADO_POR INT NULL,
    REG_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_TI_REGLAS_ACTIVA_ORDEN ON dbo.TI_REGLAS_ASIGNACION(REG_ACTIVA, REG_PRIORIDAD_ORDEN);
END
-- Condición de horario a nivel de REGLA (distinta del horario por TÉCNICO que ya
-- existía en TI_STAFF_STATUS): permite reglas tipo "solo aplica de 6pm a 8am" para
-- rutear a especialistas de guardia nocturna. NULL = sin restricción de horario.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_REGLAS_ASIGNACION' AND COLUMN_NAME='REG_HORARIO_INICIO')
  ALTER TABLE dbo.TI_REGLAS_ASIGNACION ADD REG_HORARIO_INICIO TIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_REGLAS_ASIGNACION' AND COLUMN_NAME='REG_HORARIO_FIN')
  ALTER TABLE dbo.TI_REGLAS_ASIGNACION ADD REG_HORARIO_FIN TIME NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_REGLAS_ASIGNACION' AND COLUMN_NAME='REG_DIAS_SEMANA')
  ALTER TABLE dbo.TI_REGLAS_ASIGNACION ADD REG_DIAS_SEMANA NVARCHAR(20) NULL; -- CSV '1,2,3,4,5' (1=lunes); NULL = todos los días

-- Regla "por técnico": fuerza la asignación a UN técnico específico (no un pool
-- por especialidad). Distinto de REG_ESP_ID (que exige una skill, dejando que el
-- algoritmo elija entre varios candidatos con esa skill) — aquí se salta el
-- balanceo de carga por completo y va directo a esa persona. Si el técnico
-- forzado no tiene capacidad disponible, el motor cae al fallback normal
-- (ver asignarTecnico en reglasAsignacionService.js) en vez de bloquear la asignación.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TI_REGLAS_ASIGNACION' AND COLUMN_NAME='REG_TECNICO_ID')
  ALTER TABLE dbo.TI_REGLAS_ASIGNACION ADD REG_TECNICO_ID INT NULL;

IF OBJECT_ID('dbo.TICKETS_ESCALAMIENTO_CONFIG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_ESCALAMIENTO_CONFIG (
    TEC_ID INT IDENTITY(1,1) PRIMARY KEY,
    TEC_AUTO_ESCALAMIENTO BIT NOT NULL DEFAULT 1,
    TEC_UMBRAL_RIESGO DECIMAL(4,2) NOT NULL DEFAULT 0.8,
    TEC_FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE()
  );
END
IF NOT EXISTS (SELECT 1 FROM dbo.TICKETS_ESCALAMIENTO_CONFIG)
  INSERT INTO dbo.TICKETS_ESCALAMIENTO_CONFIG (TEC_AUTO_ESCALAMIENTO, TEC_UMBRAL_RIESGO) VALUES (1, 0.8);

-- Recordatorios automáticos: notifica al técnico asignado cuando un ticket
-- abierto lleva N días SIN actividad (sin comentarios ni cambios de historial).
-- Config global de una sola fila, mismo patrón que TICKETS_ESCALAMIENTO_CONFIG.
IF OBJECT_ID('dbo.TICKETS_RECORDATORIOS_CONFIG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_RECORDATORIOS_CONFIG (
    TRC_ID INT IDENTITY(1,1) PRIMARY KEY,
    TRC_ACTIVO BIT NOT NULL DEFAULT 1,
    TRC_DIAS_SIN_ACTIVIDAD INT NOT NULL DEFAULT 3,
    TRC_FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE()
  );
END
IF NOT EXISTS (SELECT 1 FROM dbo.TICKETS_RECORDATORIOS_CONFIG)
  INSERT INTO dbo.TICKETS_RECORDATORIOS_CONFIG (TRC_ACTIVO, TRC_DIAS_SIN_ACTIVIDAD) VALUES (1, 3);

-- Config general de Tecnología/TI (fila única global). ZONA_HORARIA es
-- puramente INFORMATIVA: el sistema real siempre calcula con la hora del
-- servidor (America/Mexico_City) en SLA, crons y horarios — cambiar este
-- valor NO afecta ningún cálculo. Sirve solo para que el admin deje
-- documentado en qué zona horaria opera la mesa de servicio.
IF OBJECT_ID('dbo.TI_CONFIG_GENERAL', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_CONFIG_GENERAL (
    TCG_ID INT IDENTITY(1,1) PRIMARY KEY,
    TCG_ZONA_HORARIA NVARCHAR(60) NOT NULL DEFAULT 'America/Mexico_City',
    TCG_FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE()
  );
END
IF NOT EXISTS (SELECT 1 FROM dbo.TI_CONFIG_GENERAL)
  INSERT INTO dbo.TI_CONFIG_GENERAL (TCG_ZONA_HORARIA) VALUES ('America/Mexico_City');

-- Fecha del último recordatorio enviado para este ticket — a diferencia de
-- SLA_RIESGO_NOTIFICADO (un bit, porque el SLA solo empeora con el tiempo),
-- "sin actividad" puede resetearse: si llega un comentario nuevo, el ticket
-- vuelve a tener actividad reciente y debe poder disparar OTRO recordatorio
-- más adelante si vuelve a quedarse inactivo. Guardar la fecha (no un bit)
-- permite comparar "¿la actividad más reciente es posterior al último aviso?".
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TICKETS' AND COLUMN_NAME='FECHA_ULTIMO_RECORDATORIO')
  ALTER TABLE dbo.TICKETS ADD FECHA_ULTIMO_RECORDATORIO DATETIME NULL;

-- Placeholder clave/valor para Integraciones (Configuración > Tecnología/TI).
-- INT_VALOR es texto plano SIN CIFRAR — no usar para secretos reales (API keys,
-- contraseñas) hasta implementar cifrado. Solo para flags/URLs no sensibles.
IF OBJECT_ID('dbo.TI_INTEGRACIONES_CONFIG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TI_INTEGRACIONES_CONFIG (
    INT_ID INT IDENTITY(1,1) PRIMARY KEY,
    INT_CLAVE NVARCHAR(80) NOT NULL,
    INT_VALOR NVARCHAR(500) NULL,
    INT_FECHA_ACTUALIZACION DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_TI_INTEGRACIONES_CLAVE UNIQUE (INT_CLAVE)
  );
END

-- Plantillas de correo: texto reutilizable para copiar/pegar en el cliente de
-- correo del técnico. El sistema NO envía correos automáticamente (Correo no
-- es un canal real de creación/respuesta de tickets en este proyecto).
IF OBJECT_ID('dbo.TICKETS_PLANTILLAS_CORREO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_PLANTILLAS_CORREO (
    PC_ID INT IDENTITY(1,1) PRIMARY KEY,
    PC_NOMBRE NVARCHAR(150) NOT NULL,
    PC_ASUNTO NVARCHAR(300) NULL,
    PC_CONTENIDO NVARCHAR(MAX) NOT NULL,
    PC_ACTIVA BIT NOT NULL DEFAULT 1,
    PC_CREADO_POR INT NULL,
    PC_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE()
  );
END

-- Plantillas de respuesta rápida para tickets: texto reutilizable que un
-- técnico inserta directo en un comentario o en el diagnóstico/acciones al
-- resolver (a diferencia de las de correo, que son solo para copiar/pegar
-- fuera del sistema — estas se insertan dentro de la misma app).
IF OBJECT_ID('dbo.TICKETS_PLANTILLAS_RESPUESTA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TICKETS_PLANTILLAS_RESPUESTA (
    PR_ID INT IDENTITY(1,1) PRIMARY KEY,
    PR_NOMBRE NVARCHAR(150) NOT NULL,
    PR_CONTENIDO NVARCHAR(MAX) NOT NULL,
    PR_ACTIVA BIT NOT NULL DEFAULT 1,
    PR_CREADO_POR INT NULL,
    PR_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE()
  );
END
`;
    await pool.request().batch(batchSql);

    // Migración de datos: PRIORIDAD legado (BAJA/MEDIA/ALTA/NORMAL) -> P1-P4.
    // Se corre siempre pero es idempotente (los WHERE ya no matchean nada
    // una vez migrados los valores).
    await pool.request().batch(`
      UPDATE dbo.TICKETS SET PRIORIDAD = 'P2' WHERE PRIORIDAD = 'ALTA';
      UPDATE dbo.TICKETS SET PRIORIDAD = 'P3' WHERE PRIORIDAD = 'MEDIA';
      UPDATE dbo.TICKETS SET PRIORIDAD = 'P4' WHERE PRIORIDAD = 'BAJA';
      UPDATE dbo.TICKETS SET PRIORIDAD = 'P3' WHERE PRIORIDAD NOT IN ('P1','P2','P3','P4');

      UPDATE dbo.TICKETS_SLA_REGLAS SET TSR_PRIORIDAD = 'P2' WHERE TSR_PRIORIDAD = 'ALTA';
      UPDATE dbo.TICKETS_SLA_REGLAS SET TSR_PRIORIDAD = 'P3' WHERE TSR_PRIORIDAD = 'MEDIA';
      UPDATE dbo.TICKETS_SLA_REGLAS SET TSR_PRIORIDAD = 'P4' WHERE TSR_PRIORIDAD = 'BAJA';
    `);

    logger.info('✅ Esquema de tickets asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de tickets:', err.message);
  }
}

// ArdaWiki (artículos vinculables a la resolución de tickets)
async function ensureKbSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.KB_ARTICULOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.KB_ARTICULOS (
          ART_ID                   INT IDENTITY(1,1) PRIMARY KEY,
          ART_TITULO                NVARCHAR(200) NOT NULL,
          ART_CONTENIDO             NVARCHAR(MAX) NOT NULL,
          ART_CATEGORIA             NVARCHAR(50) NULL,
          ART_TIPO                  NVARCHAR(10) NOT NULL DEFAULT 'articulo', -- 'articulo' | 'faq'
          ART_AUTOR_ID              INT NULL,
          ART_AUTOR_NOMBRE          NVARCHAR(150) NULL,
          ART_ACTIVO                BIT NOT NULL DEFAULT 1,
          ART_FECHA_CREACION        DATETIME NOT NULL DEFAULT GETDATE(),
          ART_FECHA_ACTUALIZACION   DATETIME NULL
        );
        CREATE INDEX IX_KB_CATEGORIA ON dbo.KB_ARTICULOS(ART_CATEGORIA);
      END
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KB_ARTICULOS' AND COLUMN_NAME='ART_TIPO')
        ALTER TABLE dbo.KB_ARTICULOS ADD ART_TIPO NVARCHAR(10) NOT NULL DEFAULT 'articulo';
      -- Caché de traducción al inglés para ArdaWiki (KB pública): se
      -- llena la primera vez que alguien pide el artículo en inglés (traducción
      -- automática con Google, gratuita pero con rate-limit) y de ahí en
      -- adelante se sirve directo de aquí sin volver a llamar al traductor.
      -- NULL = aún no traducido.
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KB_ARTICULOS' AND COLUMN_NAME='ART_TITULO_EN')
        ALTER TABLE dbo.KB_ARTICULOS ADD ART_TITULO_EN NVARCHAR(200) NULL;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KB_ARTICULOS' AND COLUMN_NAME='ART_CONTENIDO_EN')
        ALTER TABLE dbo.KB_ARTICULOS ADD ART_CONTENIDO_EN NVARCHAR(MAX) NULL;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KB_ARTICULOS' AND COLUMN_NAME='ART_CATEGORIA_EN')
        ALTER TABLE dbo.KB_ARTICULOS ADD ART_CATEGORIA_EN NVARCHAR(50) NULL;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KB_ARTICULOS' AND COLUMN_NAME='ART_TRADUCIDO_EN')
        ALTER TABLE dbo.KB_ARTICULOS ADD ART_TRADUCIDO_EN DATETIME NULL;
      -- Visibilidad del artículo: público (aparece también en el sitio web
      -- institucional, además de ArdaWiki interno) o privado (solo dentro de
      -- AGYDA). Independiente de ART_ACTIVO — un artículo puede estar activo
      -- pero marcado privado. Default 1 para no ocultar de golpe los
      -- artículos ya existentes en el sitio público al agregar la columna.
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KB_ARTICULOS' AND COLUMN_NAME='ART_PUBLICO')
        ALTER TABLE dbo.KB_ARTICULOS ADD ART_PUBLICO BIT NOT NULL DEFAULT 1;
    `);
    logger.info('✅ Esquema de ArdaWiki asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de ArdaWiki:', err.message);
  }
}

async function ensureProfileSchema(pool) {
  try {
    const batchSql = `
IF COL_LENGTH('dbo.NEUS_USUARIOS', 'NEUS_ALIAS') IS NULL
BEGIN
  ALTER TABLE dbo.NEUS_USUARIOS ADD NEUS_ALIAS NVARCHAR(100) NULL;
END

IF COL_LENGTH('dbo.NEUS_USUARIOS', 'NEUS_FOTO_URL') IS NULL
BEGIN
  ALTER TABLE dbo.NEUS_USUARIOS ADD NEUS_FOTO_URL NVARCHAR(500) NULL;
END

IF COL_LENGTH('dbo.NEUS_USUARIOS', 'NEUS_PORTADA_URL') IS NULL
BEGIN
  ALTER TABLE dbo.NEUS_USUARIOS ADD NEUS_PORTADA_URL NVARCHAR(500) NULL;
END

IF COL_LENGTH('dbo.NEUS_USUARIOS', 'NEUS_FECHA_INGRESO') IS NULL
BEGIN
  ALTER TABLE dbo.NEUS_USUARIOS ADD NEUS_FECHA_INGRESO DATE NULL;
END

IF OBJECT_ID('dbo.INTRANET_PERFIL_DETALLE','U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_PERFIL_DETALLE (
    USER_ID INT NOT NULL PRIMARY KEY,
    INFO_PERSONAL NVARCHAR(MAX) NULL,
    INFO_LABORAL NVARCHAR(MAX) NULL,
    ACERCA_DE_MI NVARCHAR(MAX) NULL,
    LIBROS_FAVORITOS NVARCHAR(MAX) NULL,
    PELICULAS_FAVORITAS NVARCHAR(MAX) NULL,
    MUSICA_FAVORITA NVARCHAR(MAX) NULL,
    SERIES_FAVORITAS NVARCHAR(MAX) NULL,
    ACTIVIDADES_INTERES NVARCHAR(MAX) NULL,
    UPDATED_AT DATETIME NOT NULL DEFAULT GETDATE()
  );
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de perfil asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de perfil:', err.message);
  }
}

async function ensurePermisosSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.PERMISOS','U') IS NULL
BEGIN
  CREATE TABLE dbo.PERMISOS (
    PERMISO_ID INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID INT NOT NULL,
    TIPO NVARCHAR(50) NOT NULL,
    FECHA_SOLICITUD DATETIME NOT NULL DEFAULT GETDATE(),
    FECHA_INICIO DATE NOT NULL,
    FECHA_FIN DATE NOT NULL,
    MOTIVO NVARCHAR(MAX) NULL,
    ESTATUS NVARCHAR(50) NOT NULL DEFAULT 'pendiente',
    COMENTARIO_ADMIN NVARCHAR(MAX) NULL
  );
  CREATE INDEX IX_PERMISOS_USUARIO ON dbo.PERMISOS(USUARIO_ID);
  CREATE INDEX IX_PERMISOS_ESTATUS ON dbo.PERMISOS(ESTATUS);
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de permisos asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de permisos:', err.message);
  }
}

// Expedientes: documentos por usuario (cifrados en BD)
async function ensureExpedientesSchema(pool) {
  try {
    const batchSql = `
-- Tabla esperada por el sistema (legacy): dbo.EXPEDIENTE_DOCUMENTOS
IF OBJECT_ID('dbo.EXPEDIENTE_DOCUMENTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_DOCUMENTOS (
    DOC_ID INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID INT NOT NULL,

    NOMBRE_ORIGINAL NVARCHAR(255) NOT NULL,
    MIME_TYPE NVARCHAR(100) NULL,
    TAMANO_BYTES BIGINT NOT NULL,
    DESCRIPCION NVARCHAR(500) NULL,
    CATEGORIA NVARCHAR(100) NULL,

    ENCRYPTED_DATA VARBINARY(MAX) NOT NULL,
    CONTENT_HASH CHAR(64) NOT NULL,
    HASH_ALGO NVARCHAR(20) NOT NULL DEFAULT 'sha256',

    ENC_ALGO NVARCHAR(30) NOT NULL DEFAULT 'aes-256-gcm',
    ENC_IV VARBINARY(12) NOT NULL,
    ENC_TAG VARBINARY(16) NOT NULL,
    KEY_ID NVARCHAR(50) NULL,

    SUBIDO_POR INT NULL,
    FECHA_SUBIDA DATETIME NOT NULL DEFAULT GETDATE(),
    ACTIVO BIT NOT NULL DEFAULT 1
  );

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_USUARIO' AND object_id = OBJECT_ID('dbo.EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_USUARIO ON dbo.EXPEDIENTE_DOCUMENTOS(USUARIO_ID, ACTIVO);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_FECHA' AND object_id = OBJECT_ID('dbo.EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_FECHA ON dbo.EXPEDIENTE_DOCUMENTOS(FECHA_SUBIDA);
END
ELSE
BEGIN
  -- Asegurar columnas clave si la tabla existe con una definición anterior
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'USUARIO_ID') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD USUARIO_ID INT NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'NOMBRE_ORIGINAL') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD NOMBRE_ORIGINAL NVARCHAR(255) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'MIME_TYPE') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD MIME_TYPE NVARCHAR(100) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'TAMANO_BYTES') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD TAMANO_BYTES BIGINT NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'DESCRIPCION') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD DESCRIPCION NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'CATEGORIA') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD CATEGORIA NVARCHAR(100) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'ENCRYPTED_DATA') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD ENCRYPTED_DATA VARBINARY(MAX) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'CONTENT_HASH') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD CONTENT_HASH CHAR(64) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'HASH_ALGO') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD HASH_ALGO NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'ENC_ALGO') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD ENC_ALGO NVARCHAR(30) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'ENC_IV') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD ENC_IV VARBINARY(12) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'ENC_TAG') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD ENC_TAG VARBINARY(16) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'KEY_ID') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD KEY_ID NVARCHAR(50) NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'SUBIDO_POR') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD SUBIDO_POR INT NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'FECHA_SUBIDA') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD FECHA_SUBIDA DATETIME NULL;
  IF COL_LENGTH('dbo.EXPEDIENTE_DOCUMENTOS', 'ACTIVO') IS NULL ALTER TABLE dbo.EXPEDIENTE_DOCUMENTOS ADD ACTIVO BIT NOT NULL DEFAULT 1;

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_USUARIO' AND object_id = OBJECT_ID('dbo.EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_USUARIO ON dbo.EXPEDIENTE_DOCUMENTOS(USUARIO_ID, ACTIVO);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_FECHA' AND object_id = OBJECT_ID('dbo.EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_FECHA ON dbo.EXPEDIENTE_DOCUMENTOS(FECHA_SUBIDA);
END

IF OBJECT_ID('dbo.NEUS_EXPEDIENTE_DOCUMENTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS (
    DOC_ID INT IDENTITY(1,1) PRIMARY KEY,
    NEUS_ID INT NOT NULL,

    DOC_NOMBRE_ORIGINAL NVARCHAR(255) NOT NULL,
    DOC_EXTENSION NVARCHAR(20) NULL,
    DOC_MIME NVARCHAR(100) NULL,
    DOC_TAMANO_BYTES BIGINT NOT NULL,
    DOC_SHA256 CHAR(64) NOT NULL,

    DOC_CIPHER NVARCHAR(30) NOT NULL DEFAULT 'aes-256-gcm',
    DOC_IV VARBINARY(12) NOT NULL,
    DOC_TAG VARBINARY(16) NOT NULL,
    DOC_KEY_ID NVARCHAR(50) NULL,
    DOC_DATA VARBINARY(MAX) NOT NULL,

    DOC_DESCRIPCION NVARCHAR(500) NULL,
    DOC_FECHA_SUBIDA DATETIME NOT NULL DEFAULT GETDATE(),
    DOC_SUBIDO_POR INT NULL,
    DOC_ACTIVO BIT NOT NULL DEFAULT 1
  );

  BEGIN TRY
    ALTER TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS WITH CHECK
      ADD CONSTRAINT FK_EXP_DOC_USUARIO FOREIGN KEY(NEUS_ID)
      REFERENCES dbo.NEUS_USUARIOS(NEUS_ID) ON DELETE CASCADE;
  END TRY
  BEGIN CATCH
    -- Si NEUS_USUARIOS no tiene PK/unique en NEUS_ID, el FK puede fallar.
  END CATCH

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_USUARIO' AND object_id = OBJECT_ID('dbo.NEUS_EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_USUARIO ON dbo.NEUS_EXPEDIENTE_DOCUMENTOS(NEUS_ID, DOC_ACTIVO);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_FECHA' AND object_id = OBJECT_ID('dbo.NEUS_EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_FECHA ON dbo.NEUS_EXPEDIENTE_DOCUMENTOS(DOC_FECHA_SUBIDA);
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.NEUS_EXPEDIENTE_DOCUMENTOS', 'DOC_DESCRIPCION') IS NULL ALTER TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS ADD DOC_DESCRIPCION NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.NEUS_EXPEDIENTE_DOCUMENTOS', 'DOC_SUBIDO_POR') IS NULL ALTER TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS ADD DOC_SUBIDO_POR INT NULL;
  IF COL_LENGTH('dbo.NEUS_EXPEDIENTE_DOCUMENTOS', 'DOC_KEY_ID') IS NULL ALTER TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS ADD DOC_KEY_ID NVARCHAR(50) NULL;
  IF COL_LENGTH('dbo.NEUS_EXPEDIENTE_DOCUMENTOS', 'DOC_ACTIVO') IS NULL ALTER TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS ADD DOC_ACTIVO BIT NOT NULL DEFAULT 1;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_EXP_DOC_USUARIO' AND parent_object_id = OBJECT_ID('dbo.NEUS_EXPEDIENTE_DOCUMENTOS'))
  BEGIN
    BEGIN TRY
      ALTER TABLE dbo.NEUS_EXPEDIENTE_DOCUMENTOS WITH CHECK
        ADD CONSTRAINT FK_EXP_DOC_USUARIO FOREIGN KEY(NEUS_ID)
        REFERENCES dbo.NEUS_USUARIOS(NEUS_ID) ON DELETE CASCADE;
    END TRY
    BEGIN CATCH
      -- Ver comentario arriba
    END CATCH
  END

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_USUARIO' AND object_id = OBJECT_ID('dbo.NEUS_EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_USUARIO ON dbo.NEUS_EXPEDIENTE_DOCUMENTOS(NEUS_ID, DOC_ACTIVO);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EXP_DOC_FECHA' AND object_id = OBJECT_ID('dbo.NEUS_EXPEDIENTE_DOCUMENTOS'))
    CREATE INDEX IX_EXP_DOC_FECHA ON dbo.NEUS_EXPEDIENTE_DOCUMENTOS(DOC_FECHA_SUBIDA);
END
`;
    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de expedientes asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de expedientes:', err.message);
  }
}

async function removeClientesUniqueConstraint(pool) {
  try {
    // Rutina opcional: si no existe la tabla/constraints, no debe impedir el arranque.
    // Busca y elimina cualquier UNIQUE constraint / unique index en dbo.CLIENTES.
    const batchSql = `
IF OBJECT_ID('dbo.CLIENTES', 'U') IS NULL
  RETURN;

DECLARE @sql NVARCHAR(MAX) = N'';

-- UNIQUE constraints (tipo UQ) en la tabla
SELECT @sql = @sql + N'ALTER TABLE dbo.CLIENTES DROP CONSTRAINT ' + QUOTENAME(k.name) + N';'
FROM sys.key_constraints k
WHERE k.parent_object_id = OBJECT_ID('dbo.CLIENTES')
  AND k.[type] = 'UQ';

-- Unique indexes (que no sean PK y no sean unique_constraint)
SELECT @sql = @sql + N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.CLIENTES;'
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.CLIENTES')
  AND i.is_unique = 1
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0;

IF (LEN(@sql) > 0)
  EXEC sp_executesql @sql;
`;

    await pool.request().batch(batchSql);
    logger.info('✅ Revisión de UNIQUE en dbo.CLIENTES completada');
  } catch (err) {
    console.warn(
      '⚠️ No se pudo remover UNIQUE de dbo.CLIENTES (continuando):',
      err && err.message ? err.message : err
    );
  }
}

async function ensureUiBackgroundSchema(pool) {
  try {
    const batchSql = `
IF OBJECT_ID('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS (
    ID INT NOT NULL CONSTRAINT PK_INTRANET_UI_BACKGROUND_SETTINGS PRIMARY KEY,
    MODE NVARCHAR(20) NOT NULL CONSTRAINT DF_INTRANET_UIBG_MODE DEFAULT ('solid'),
    COLOR1 INT NOT NULL CONSTRAINT DF_INTRANET_UIBG_COLOR1 DEFAULT (-460036),
    COLOR2 INT NOT NULL CONSTRAINT DF_INTRANET_UIBG_COLOR2 DEFAULT (-460036),
    DIRECTION INT NOT NULL CONSTRAINT DF_INTRANET_UIBG_DIRECTION DEFAULT (0),
    UPDATED_AT DATETIME2 NULL,
    UPDATED_BY INT NULL
  );
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'MODE') IS NULL
    ALTER TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS
      ADD MODE NVARCHAR(20) NOT NULL CONSTRAINT DF_INTRANET_UIBG_MODE DEFAULT ('solid') WITH VALUES;

  IF COL_LENGTH('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'COLOR1') IS NULL
    ALTER TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS
      ADD COLOR1 INT NOT NULL CONSTRAINT DF_INTRANET_UIBG_COLOR1 DEFAULT (-460036) WITH VALUES;

  IF COL_LENGTH('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'COLOR2') IS NULL
    ALTER TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS
      ADD COLOR2 INT NOT NULL CONSTRAINT DF_INTRANET_UIBG_COLOR2 DEFAULT (-460036) WITH VALUES;

  IF COL_LENGTH('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'DIRECTION') IS NULL
    ALTER TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS
      ADD DIRECTION INT NOT NULL CONSTRAINT DF_INTRANET_UIBG_DIRECTION DEFAULT (0) WITH VALUES;

  IF COL_LENGTH('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'UPDATED_AT') IS NULL
    ALTER TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS
      ADD UPDATED_AT DATETIME2 NULL;

  IF COL_LENGTH('dbo.INTRANET_UI_BACKGROUND_SETTINGS', 'UPDATED_BY') IS NULL
    ALTER TABLE dbo.INTRANET_UI_BACKGROUND_SETTINGS
      ADD UPDATED_BY INT NULL;
END

IF NOT EXISTS (SELECT 1 FROM dbo.INTRANET_UI_BACKGROUND_SETTINGS WHERE ID = 1)
BEGIN
  INSERT INTO dbo.INTRANET_UI_BACKGROUND_SETTINGS (ID, MODE, COLOR1, COLOR2, DIRECTION)
  VALUES (1, 'solid', -460036, -460036, 0);
END
`;

    await pool.request().batch(batchSql);
    logger.info('✅ Esquema de UI background asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema UI background:', err.message);
  }
}

async function ensureAsistenciaSchema(pool) {
  try {
    // Tabla principal de entradas (incluye BIOTIME_ID para deduplicación con BioTime)
    await pool.request().batch(`
      IF OBJECT_ID('dbo.ASISTENCIA_ENTRADAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ASISTENCIA_ENTRADAS (
          ID              INT IDENTITY(1,1) PRIMARY KEY,
          NEUS_ID         INT           NOT NULL,
          FECHA           DATE          NOT NULL,
          ROL             NVARCHAR(10)  NOT NULL,
          HORA_ENTRADA    DATETIME      NOT NULL,
          HORA_ESPERADA   DATETIME      NOT NULL,
          MINUTOS_RETARDO INT           NOT NULL DEFAULT 0,
          ES_RETARDO      BIT           NOT NULL DEFAULT 0,
          BIOTIME_ID      INT           NULL,
          CONSTRAINT UQ_ASISTENCIA_USUARIO_FECHA UNIQUE (NEUS_ID, FECHA)
        );
        CREATE INDEX IX_ASISTENCIA_FECHA ON dbo.ASISTENCIA_ENTRADAS(FECHA);
        CREATE UNIQUE INDEX UX_ASISTENCIA_ENTRADAS_BIOTIME_ID
          ON dbo.ASISTENCIA_ENTRADAS(BIOTIME_ID) WHERE BIOTIME_ID IS NOT NULL;
      END
    `);

    // Agregar BIOTIME_ID si la tabla ya existe pero la columna no
    await pool.request().batch(`
      IF OBJECT_ID('dbo.ASISTENCIA_ENTRADAS', 'U') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ASISTENCIA_ENTRADAS') AND name='BIOTIME_ID')
      BEGIN
        ALTER TABLE dbo.ASISTENCIA_ENTRADAS ADD BIOTIME_ID INT NULL;
        CREATE UNIQUE INDEX UX_ASISTENCIA_ENTRADAS_BIOTIME_ID
          ON dbo.ASISTENCIA_ENTRADAS(BIOTIME_ID) WHERE BIOTIME_ID IS NOT NULL;
      END
    `);

    // Mapa emp_code (BioTime) → NEUS_ID
    await pool.request().batch(`
      IF OBJECT_ID('dbo.BIOTIME_CHECADOR_MAP', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.BIOTIME_CHECADOR_MAP (
          ID           INT IDENTITY(1,1) PRIMARY KEY,
          NEUS_ID      INT          NOT NULL,
          EMP_CODE     VARCHAR(20)  NOT NULL,
          FECHA_MAPEO  DATETIME     NOT NULL DEFAULT GETDATE(),
          METODO       VARCHAR(20)  NOT NULL DEFAULT 'AUTO_NOMBRE',
          CONSTRAINT UX_BIOTIME_CHECADOR_MAP_EMPCODE UNIQUE (EMP_CODE)
        );
      END
    `);

    // Log de usuarios inactivos que marcaron en biométrico
    await pool.request().batch(`
      IF OBJECT_ID('dbo.BIOTIME_SYNC_ALERTAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.BIOTIME_SYNC_ALERTAS (
          ID               INT IDENTITY(1,1) PRIMARY KEY,
          EMP_CODE         VARCHAR(20)  NOT NULL,
          NEUS_ID          INT          NULL,
          PUNCH_TIME       DATETIME     NOT NULL,
          TIPO             VARCHAR(50)  NOT NULL DEFAULT 'USUARIO_INACTIVO_MARCO_ASISTENCIA',
          FECHA_DETECCION  DATETIME     NOT NULL DEFAULT GETDATE()
        );
      END
    `);

    logger.info('✅ Esquema de asistencia + BioTime asegurado/actualizado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de asistencia:', err.message);
  }
}

// Actas de retardos acumulados por mes — usada por asistenciaReporteController.js
// (no tenía CREATE TABLE en código, solo existía porque se creó a mano en la BD original).
async function ensureAsistenciaActasSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.ASISTENCIA_ACTAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ASISTENCIA_ACTAS (
    ID                   INT IDENTITY(1,1) PRIMARY KEY,
    NEUS_ID              INT      NOT NULL,
    ANIO                 INT      NOT NULL,
    MES                  INT      NOT NULL,
    TOTAL_RETARDOS       INT      NOT NULL,
    FECHA_CREACION       DATETIME NOT NULL DEFAULT (GETDATE()),
    RECONOCIDA           BIT      NOT NULL DEFAULT (0),
    FECHA_RECONOCIMIENTO DATETIME NULL,
    CONSTRAINT UQ_ASIS_ACTA_MES UNIQUE (NEUS_ID, ANIO, MES)
  );
  CREATE INDEX IX_ASIS_ACTA_NEUS ON dbo.ASISTENCIA_ACTAS(NEUS_ID);
END
    `);
    logger.info('✅ Esquema de actas de asistencia asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de actas de asistencia:', err.message);
  }
}

async function ensureActivosGeneralesSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.ACTIVOS_GENERALES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ACTIVOS_GENERALES (
    AG_ID               INT IDENTITY(1,1) PRIMARY KEY,
    AG_DEPARTAMENTO     NVARCHAR(100)  NULL,
    AG_NOMBRE_EQUIPO    NVARCHAR(200)  NULL,
    AG_MARCA            NVARCHAR(100)  NULL,
    AG_MODELO           NVARCHAR(200)  NULL,
    AG_NUMERO_SERIE     NVARCHAR(200)  NULL,
    AG_SO               NVARCHAR(200)  NULL,
    AG_UBICACION        NVARCHAR(200)  NULL,
    AG_ESTADO           NVARCHAR(50)   NULL DEFAULT 'activo',
    AG_MONITOR1         NVARCHAR(100)  NULL,
    AG_MONITOR2         NVARCHAR(100)  NULL,
    AG_CARACTERISTICAS  NVARCHAR(MAX)  NULL,
    AG_ACCESORIOS       NVARCHAR(MAX)  NULL,
    AG_DIADEMAS         NVARCHAR(200)  NULL,
    AG_ASIGNADO_A       INT            NULL,
    AG_FECHA_ASIGNACION DATETIME       NULL,
    AG_ACTIVO           BIT            NOT NULL DEFAULT 1,
    AG_FECHA_REGISTRO   DATETIME       NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_AG_DEPARTAMENTO ON dbo.ACTIVOS_GENERALES(AG_DEPARTAMENTO);
  CREATE INDEX IX_AG_ASIGNADO_A   ON dbo.ACTIVOS_GENERALES(AG_ASIGNADO_A);
END
IF OBJECT_ID('dbo.TICKETS', 'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TICKETS_ACTIVO_AFECTADO')
BEGIN
  ALTER TABLE dbo.TICKETS ADD CONSTRAINT FK_TICKETS_ACTIVO_AFECTADO FOREIGN KEY (ACTIVO_AFECTADO_ID) REFERENCES dbo.ACTIVOS_GENERALES(AG_ID);
END
    `);
    logger.info('✅ Esquema de activos generales asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de activos generales:', err.message);
  }
}

async function ensureCrmSchema(pool) {
  const batches = [
    `IF OBJECT_ID('dbo.CRM_CONTACTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_CONTACTOS (
    CONT_ID          INT IDENTITY(1,1) PRIMARY KEY,
    CONT_NOMBRE      NVARCHAR(200) NOT NULL,
    CONT_EMPRESA     NVARCHAR(200) NULL,
    CONT_CORREO      NVARCHAR(200) NULL,
    CONT_TELEFONO    NVARCHAR(30)  NULL,
    CONT_CARGO       NVARCHAR(100) NULL,
    CONT_NOTAS       NVARCHAR(MAX) NULL,
    CONT_CREADO_POR  INT NULL,
    CONT_FECHA       DATETIME NOT NULL DEFAULT GETDATE(),
    CONT_ACTIVO      BIT NOT NULL DEFAULT 1
  );
  CREATE INDEX IX_CRM_CONTACTOS_NOMBRE ON dbo.CRM_CONTACTOS(CONT_NOMBRE);
END`,
    `IF OBJECT_ID('dbo.CRM_OPORTUNIDADES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_OPORTUNIDADES (
    OPO_ID           INT IDENTITY(1,1) PRIMARY KEY,
    OPO_NOMBRE       NVARCHAR(200) NOT NULL,
    OPO_CONTACTO_ID  INT NULL,
    OPO_ETAPA        NVARCHAR(50)  NOT NULL DEFAULT 'prospecto',
    OPO_VALOR        DECIMAL(18,2) NULL,
    OPO_FECHA_CIERRE DATE NULL,
    OPO_ASIGNADO_A   INT NULL,
    OPO_CREADO_POR   INT NULL,
    OPO_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
    OPO_NOTAS        NVARCHAR(MAX) NULL,
    OPO_ORDEN        INT NOT NULL DEFAULT 0,
    OPO_ACTIVO       BIT NOT NULL DEFAULT 1
  );
  CREATE INDEX IX_CRM_OPO_ETAPA ON dbo.CRM_OPORTUNIDADES(OPO_ETAPA);
  CREATE INDEX IX_CRM_OPO_ASIGNADO ON dbo.CRM_OPORTUNIDADES(OPO_ASIGNADO_A);
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_OPORTUNIDADES') AND name = 'OPO_PROYECTO_ID')
BEGIN
  ALTER TABLE dbo.CRM_OPORTUNIDADES ADD OPO_PROYECTO_ID INT NULL;
END`,
    // Columnas de "Cliente" (módulo Atención al Cliente) sobre la misma entidad
    // CRM_CONTACTOS ya usada por Ventas — CONT_ES_CLIENTE distingue un contacto
    // de prospección de un cliente dado de alta.
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_TIPO_CLIENTE')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_TIPO_CLIENTE NVARCHAR(50) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_DIRECCION')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_DIRECCION NVARCHAR(300) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_PRODUCTO_SERVICIO')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_PRODUCTO_SERVICIO NVARCHAR(300) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_RESPONSABLE_ID')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_RESPONSABLE_ID INT NULL;
  CREATE INDEX IX_CRM_CONTACTOS_RESPONSABLE ON dbo.CRM_CONTACTOS(CONT_RESPONSABLE_ID);
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_ESTATUS_CLIENTE')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_ESTATUS_CLIENTE NVARCHAR(20) NOT NULL
    CONSTRAINT DF_CRM_CONTACTOS_ESTATUS_CLIENTE DEFAULT ('verde');
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_MEDIO_CONTACTO')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_MEDIO_CONTACTO NVARCHAR(50) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_OBSERVACIONES_INICIALES')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_OBSERVACIONES_INICIALES NVARCHAR(MAX) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_CONTACTOS') AND name = 'CONT_ES_CLIENTE')
BEGIN
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_ES_CLIENTE BIT NOT NULL
    CONSTRAINT DF_CRM_CONTACTOS_ES_CLIENTE DEFAULT (0);
END`,
    `IF OBJECT_ID('dbo.CRM_ACTIVIDADES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_ACTIVIDADES (
    ACT_ID           INT IDENTITY(1,1) PRIMARY KEY,
    ACT_OPO_ID       INT NOT NULL,
    ACT_TIPO         NVARCHAR(50) NOT NULL,
    ACT_DESCRIPCION  NVARCHAR(500) NULL,
    ACT_FECHA_DUE    DATETIME NULL,
    ACT_ASIGNADO_A   INT NULL,
    ACT_CREADO_POR   INT NULL,
    ACT_COMPLETADA   BIT NOT NULL DEFAULT 0,
    ACT_FECHA_COMP   DATETIME NULL,
    ACT_FECHA        DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_CRM_ACT_OPO ON dbo.CRM_ACTIVIDADES(ACT_OPO_ID);
  CREATE INDEX IX_CRM_ACT_COMPLETADA ON dbo.CRM_ACTIVIDADES(ACT_COMPLETADA);
END`,
    `IF OBJECT_ID('dbo.CRM_INTERACCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_INTERACCIONES (
    INT_ID             INT IDENTITY(1,1) PRIMARY KEY,
    INT_OPO_ID         INT NOT NULL,
    INT_TIPO           NVARCHAR(50) NOT NULL,
    INT_CONTENIDO      NVARCHAR(MAX) NULL,
    INT_USUARIO_ID     INT NULL,
    INT_USUARIO_NOMBRE NVARCHAR(200) NULL,
    INT_FECHA          DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_CRM_INT_OPO ON dbo.CRM_INTERACCIONES(INT_OPO_ID);
END`,
  ];
  for (const batch of batches) {
    try {
      await pool.request().batch(batch);
    } catch (err) {
      console.warn('⚠️ CRM schema batch:', err.message);
    }
  }
  logger.info('✅ Esquema CRM asegurado/actualizado');
}

async function ensureCrmSeguimientoSchema(pool) {
  const batches = [
    `IF OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_RECORDATORIOS_PAGO (
    REC_ID            INT IDENTITY(1,1) PRIMARY KEY,
    REC_CONTACTO_ID   INT NOT NULL,
    REC_OPO_ID        INT NULL,
    REC_CONCEPTO      NVARCHAR(200) NOT NULL,
    REC_MONTO         DECIMAL(18,2) NOT NULL,
    REC_FECHA_LIMITE  DATE NOT NULL,
    REC_ESTATUS       NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
    REC_NOTAS         NVARCHAR(500) NULL,
    REC_CREADO_POR    INT NULL,
    REC_FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
    REC_FECHA_ENVIO   DATETIME NULL,
    REC_ACTIVO        BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_REC_CONTACTO FOREIGN KEY (REC_CONTACTO_ID) REFERENCES dbo.CRM_CONTACTOS(CONT_ID),
    CONSTRAINT FK_REC_OPO FOREIGN KEY (REC_OPO_ID) REFERENCES dbo.CRM_OPORTUNIDADES(OPO_ID),
    CONSTRAINT CK_REC_ESTATUS CHECK (REC_ESTATUS IN ('pendiente','enviado','cancelado'))
  );
  CREATE INDEX IX_REC_CONTACTO ON dbo.CRM_RECORDATORIOS_PAGO(REC_CONTACTO_ID);
  CREATE INDEX IX_REC_FECHA_ESTATUS ON dbo.CRM_RECORDATORIOS_PAGO(REC_FECHA_LIMITE, REC_ESTATUS) WHERE REC_ACTIVO = 1;
END`,
    `IF OBJECT_ID('dbo.CRM_DOCUMENTOS_CLIENTE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_DOCUMENTOS_CLIENTE (
    DOC_ID            INT IDENTITY(1,1) PRIMARY KEY,
    DOC_CONTACTO_ID   INT NOT NULL,
    DOC_NOMBRE_ORIGINAL NVARCHAR(255) NOT NULL,
    DOC_MIME_TYPE     NVARCHAR(100) NULL,
    DOC_TAMANO_BYTES  BIGINT NOT NULL,
    DOC_DESCRIPCION   NVARCHAR(500) NULL,
    DOC_CATEGORIA     NVARCHAR(100) NULL,
    DOC_ENCRYPTED_DATA VARBINARY(MAX) NOT NULL,
    DOC_CONTENT_HASH  CHAR(64) NOT NULL,
    DOC_ENC_ALGO      NVARCHAR(30) NOT NULL DEFAULT 'aes-256-gcm',
    DOC_ENC_IV        VARBINARY(12) NOT NULL,
    DOC_ENC_TAG       VARBINARY(16) NOT NULL,
    DOC_KEY_ID        NVARCHAR(50) NULL,
    DOC_VISIBLE_PORTAL BIT NOT NULL DEFAULT 1,
    DOC_SUBIDO_POR    INT NULL,
    DOC_FECHA_SUBIDA  DATETIME NOT NULL DEFAULT GETDATE(),
    DOC_ACTIVO        BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_DOC_CONTACTO FOREIGN KEY (DOC_CONTACTO_ID) REFERENCES dbo.CRM_CONTACTOS(CONT_ID)
  );
  CREATE INDEX IX_DOC_CONTACTO ON dbo.CRM_DOCUMENTOS_CLIENTE(DOC_CONTACTO_ID, DOC_ACTIVO);
  CREATE INDEX IX_DOC_PORTAL ON dbo.CRM_DOCUMENTOS_CLIENTE(DOC_CONTACTO_ID, DOC_VISIBLE_PORTAL) WHERE DOC_ACTIVO = 1;
END`,
    `IF OBJECT_ID('dbo.CRM_ENCUESTAS_ENVIADAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CRM_ENCUESTAS_ENVIADAS (
    CES_ID            INT IDENTITY(1,1) PRIMARY KEY,
    CES_CONTACTO_ID   INT NOT NULL,
    CES_ENC_ID        INT NOT NULL,
    CES_ENVIADO_POR   INT NULL,
    CES_FECHA_ENVIO   DATETIME NOT NULL DEFAULT GETDATE(),
    CES_CANAL         NVARCHAR(20) NOT NULL DEFAULT 'correo',
    CONSTRAINT FK_CES_CONTACTO FOREIGN KEY (CES_CONTACTO_ID) REFERENCES dbo.CRM_CONTACTOS(CONT_ID)
  );
  CREATE INDEX IX_CES_CONTACTO ON dbo.CRM_ENCUESTAS_ENVIADAS(CES_CONTACTO_ID);
  CREATE INDEX IX_CES_ENC ON dbo.CRM_ENCUESTAS_ENVIADAS(CES_ENC_ID);
END`,
    // Fase 3: confirmación de pago con comprobante + alertas escalonadas.
    // El CHECK original de REC_ESTATUS no incluía 'pagado'/'parcial' — se
    // sustituye solo si la definición actual no contiene ya 'parcial' (evita
    // DROP/CREATE innecesario en cada restart una vez migrado).
    `IF EXISTS (
  SELECT 1 FROM sys.check_constraints cc
  WHERE cc.name = 'CK_REC_ESTATUS' AND cc.definition NOT LIKE '%parcial%'
)
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO DROP CONSTRAINT CK_REC_ESTATUS;
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD CONSTRAINT CK_REC_ESTATUS CHECK (REC_ESTATUS IN ('pendiente','enviado','pagado','parcial','cancelado'));
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_REC_ESTATUS')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD CONSTRAINT CK_REC_ESTATUS CHECK (REC_ESTATUS IN ('pendiente','enviado','pagado','parcial','cancelado'));
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO') AND name = 'REC_MONTO_PAGADO')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD REC_MONTO_PAGADO DECIMAL(18,2) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO') AND name = 'REC_FECHA_PAGO')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD REC_FECHA_PAGO DATETIME NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO') AND name = 'REC_METODO_PAGO')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD REC_METODO_PAGO NVARCHAR(50) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO') AND name = 'REC_COMPROBANTE_DOC_ID')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD REC_COMPROBANTE_DOC_ID INT NULL
    CONSTRAINT FK_REC_COMPROBANTE_DOC REFERENCES dbo.CRM_DOCUMENTOS_CLIENTE(DOC_ID);
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO') AND name = 'REC_CONFIRMADO_POR')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD REC_CONFIRMADO_POR INT NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_RECORDATORIOS_PAGO') AND name = 'REC_ULTIMA_ALERTA_DIAS')
BEGIN
  ALTER TABLE dbo.CRM_RECORDATORIOS_PAGO ADD REC_ULTIMA_ALERTA_DIAS INT NULL;
END`,
    // Fase 4: clasificación de la respuesta de encuesta de satisfacción y, si es
    // negativa, referencia a la incidencia auto-creada (CLI_INCIDENCIAS, Fase 5
    // — se agrega sin FK aquí porque esa tabla todavía no existe en esta fase).
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_ENCUESTAS_ENVIADAS') AND name = 'CES_CLASIFICACION')
BEGIN
  ALTER TABLE dbo.CRM_ENCUESTAS_ENVIADAS ADD CES_CLASIFICACION NVARCHAR(20) NULL;
END`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_ENCUESTAS_ENVIADAS') AND name = 'CES_INCIDENCIA_ID')
BEGIN
  ALTER TABLE dbo.CRM_ENCUESTAS_ENVIADAS ADD CES_INCIDENCIA_ID INT NULL;
END`,
  ];
  for (const batch of batches) {
    try {
      await pool.request().batch(batch);
    } catch (err) {
      console.warn('⚠️ CRM seguimiento schema batch:', err.message);
    }
  }
  logger.info('✅ Esquema CRM Seguimiento a Clientes asegurado/actualizado');
}

// Catálogo dinámico de empresas (tenants) — vive solo en la BD maestra
// ('agyda'/intranet). Las empresas creadas desde Accesos > Empresas se
// registran aquí, además de en config/tenants.js (caché en memoria).
async function ensureEmpresasSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.INTRANET_EMPRESAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_EMPRESAS (
    EMP_ID          INT IDENTITY(1,1) PRIMARY KEY,
    EMP_KEY         NVARCHAR(50)  NOT NULL UNIQUE,
    EMP_NOMBRE      NVARCHAR(200) NOT NULL,
    EMP_DATABASE    NVARCHAR(128) NOT NULL UNIQUE,
    EMP_CREADO_POR  INT NULL,
    EMP_FECHA_CREACION DATETIME NOT NULL DEFAULT (GETDATE())
  );
END
    `);
    logger.info('✅ Esquema de empresas (tenants) asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de empresas:', err.message);
  }
}

// Módulos activos por empresa completa (no por usuario) — vive solo en la BD
// maestra ('agyda'), mismo criterio que INTRANET_EMPRESAS. Ausencia de filas
// para una EMP_KEY = todos los módulos activos (sin centinela de
// inicialización: a diferencia de INTRANET_USUARIOS_MODULOS, aquí el default
// es un único valor constante, no algo que dependa de un rol a calcular).
// Solo los 2 super-admins fijos (ver utils/superAdmin.js) pueden escribir
// aquí; el middleware moduleAccess.getEmpresaModulosBloqueados la consulta
// para intersectar con los permisos por usuario de cada tenant.
async function ensureEmpresasModulosSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.INTRANET_EMPRESAS_MODULOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_EMPRESAS_MODULOS (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    EMP_KEY     NVARCHAR(50)  NOT NULL,
    MODULO_KEY  NVARCHAR(100) NOT NULL,
    ALLOW       BIT           NOT NULL DEFAULT 1,
    GRANTED_BY  INT           NULL,
    GRANTED_AT  DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_EMPRESA_MODULO UNIQUE (EMP_KEY, MODULO_KEY)
  );
  CREATE INDEX IX_INTRANET_EMPMOD_EMPKEY ON dbo.INTRANET_EMPRESAS_MODULOS(EMP_KEY);
END
    `);
    logger.info('✅ Esquema de módulos por empresa asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de módulos por empresa:', err.message);
  }
}

// Carga las empresas registradas en INTRANET_EMPRESAS (BD maestra) al caché
// en memoria de config/tenants.js — se llama una vez al boot, después de
// asegurar el esquema de la BD 'agyda'. Las empresas creadas después se
// agregan al caché directamente vía registerTenant, sin re-leer la tabla.
async function loadDynamicTenants(pool) {
  try {
    const { registerTenant } = require('../config/tenants');
    const rs = await pool.request().query(`SELECT EMP_KEY, EMP_NOMBRE, EMP_DATABASE FROM dbo.INTRANET_EMPRESAS`);
    for (const row of rs.recordset) {
      registerTenant(row.EMP_KEY, row.EMP_NOMBRE, row.EMP_DATABASE);
    }
    if (rs.recordset.length) logger.info(`✅ ${rs.recordset.length} empresa(s) dinámica(s) cargada(s) desde INTRANET_EMPRESAS`);
  } catch (err) {
    console.warn('⚠️ No se pudieron cargar empresas dinámicas:', err.message);
  }
}

// Roles = plantillas nombradas de permisos (módulos + acciones). Al crear un
// usuario se elige un rol y sus permisos se COPIAN a INTRANET_USUARIOS_MODULOS /
// INTRANET_USUARIOS_ACCIONES. El rol lleva ROL_BASE (AD/TI/CC/ST/VE/CL) que es lo
// que se guarda en NEUS_TIPOUSUARIO para no romper verificarRol ni el login.
async function ensureRolesSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.INTRANET_ROLES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.INTRANET_ROLES (
          ROL_ID       INT IDENTITY(1,1) PRIMARY KEY,
          NOMBRE       NVARCHAR(80)  NOT NULL,
          DESCRIPCION  NVARCHAR(255) NULL,
          ROL_BASE     NVARCHAR(10)  NOT NULL,
          ES_SISTEMA   BIT           NOT NULL DEFAULT 0,
          ACTIVO       BIT           NOT NULL DEFAULT 1,
          CREADO_EN    DATETIME      NOT NULL DEFAULT GETDATE(),
          CREADO_POR   INT           NULL,
          CONSTRAINT UQ_INTRANET_ROLES_NOMBRE UNIQUE (NOMBRE)
        );
      END

      IF OBJECT_ID('dbo.INTRANET_ROLES_PERMISOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.INTRANET_ROLES_PERMISOS (
          ID          INT IDENTITY(1,1) PRIMARY KEY,
          ROL_ID      INT           NOT NULL,
          MODULO_KEY  NVARCHAR(100) NOT NULL,
          ACCION_KEY  NVARCHAR(100) NOT NULL,
          CONSTRAINT UQ_INTRANET_ROLES_PERMISOS UNIQUE (ROL_ID, MODULO_KEY, ACCION_KEY)
        );
        CREATE INDEX IX_INTRANET_ROLES_PERMISOS_ROL ON dbo.INTRANET_ROLES_PERMISOS(ROL_ID);
      END
    `);

    // Seed de los 6 roles de sistema — SOLO en el primer arranque (tabla vacía).
    // Si el usuario borra un rol de sistema después, no reaparece.
    const cnt = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.INTRANET_ROLES`);
    if (cnt.recordset[0].n > 0) {
      logger.info('✅ Esquema de roles asegurado');
      return;
    }

    // Permisos = los módulos por defecto de ese rol, con ACCION_KEY='*' (acceso al módulo).
    const { DEFAULT_MODULES_BY_ROLE, MODULOS_DISPONIBLES } = require('../controllers/accesoController');
    const SISTEMA = [
      { base: 'AD', nombre: 'Administrador',  desc: 'Acceso completo de administracion' },
      { base: 'TI', nombre: 'Tecnologia',     desc: 'Acceso completo del equipo de TI' },
      { base: 'CC', nombre: 'Call Center',    desc: 'Agente de Call Center' },
      { base: 'ST', nombre: 'Staff',          desc: 'Personal interno' },
      { base: 'VE', nombre: 'Ventas',         desc: 'Equipo de ventas' },
      { base: 'CL', nombre: 'Cliente',        desc: 'Cliente externo - acceso minimo' },
    ];
    const todosLosModulos = MODULOS_DISPONIBLES.map((m) => m.key);
    for (const r of SISTEMA) {
      const ins = await pool.request()
        .input('nombre', require('mssql').NVarChar, r.nombre)
        .input('desc', require('mssql').NVarChar, r.desc)
        .input('base', require('mssql').NVarChar, r.base)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.INTRANET_ROLES WHERE ROL_BASE=@base AND ES_SISTEMA=1)
          BEGIN
            INSERT INTO dbo.INTRANET_ROLES (NOMBRE, DESCRIPCION, ROL_BASE, ES_SISTEMA, ACTIVO)
            VALUES (@nombre, @desc, @base, 1, 1);
            SELECT SCOPE_IDENTITY() AS ROL_ID;
          END
          ELSE SELECT NULL AS ROL_ID;
        `);
      const rolId = ins.recordset && ins.recordset[0] ? ins.recordset[0].ROL_ID : null;
      if (!rolId) continue; // ya existía
      const defaults = DEFAULT_MODULES_BY_ROLE[r.base.toLowerCase()] ?? [];
      const mods = defaults[0] === '*' ? todosLosModulos : defaults;
      for (const modKey of mods) {
        await pool.request()
          .input('rolId', require('mssql').Int, rolId)
          .input('modKey', require('mssql').NVarChar, modKey)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID=@rolId AND MODULO_KEY=@modKey AND ACCION_KEY='*')
              INSERT INTO dbo.INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY) VALUES (@rolId, @modKey, '*')
          `);
      }
    }
    logger.info('✅ Esquema de roles asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de roles:', err.message);
  }
}

// Perfiles = plantillas de datos de usuario. Predefinen puesto, departamento,
// horario, vacaciones/permisos y el ROL de permisos. Al crear un usuario se
// elige un perfil y esos campos se autocompletan (quedan editables).
async function ensurePerfilesSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.INTRANET_PERFILES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.INTRANET_PERFILES (
          PERFIL_ID       INT IDENTITY(1,1) PRIMARY KEY,
          NOMBRE          NVARCHAR(80)  NOT NULL,
          DESCRIPCION     NVARCHAR(255) NULL,
          ROL_ID          INT           NULL,
          PUESTO          NVARCHAR(150) NULL,
          DEPARTAMENTO    NVARCHAR(150) NULL,
          ID_HORARIO      INT           NULL,
          ACTIVO          BIT           NOT NULL DEFAULT 1,
          CREADO_EN       DATETIME      NOT NULL DEFAULT GETDATE(),
          CREADO_POR      INT           NULL,
          CONSTRAINT UQ_INTRANET_PERFILES_NOMBRE UNIQUE (NOMBRE)
        );
      END
    `);
    logger.info('✅ Esquema de perfiles asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de perfiles:', err.message);
  }
}

async function ensureAccesosSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.INTRANET_USUARIOS_MODULOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.INTRANET_USUARIOS_MODULOS (
          ID          INT IDENTITY(1,1) PRIMARY KEY,
          USUARIO_ID  INT           NOT NULL,
          MODULO_KEY  NVARCHAR(100) NOT NULL,
          ALLOW       BIT           NOT NULL DEFAULT 1,
          GRANTED_BY  INT           NULL,
          GRANTED_AT  DATETIME      NOT NULL DEFAULT GETDATE(),
          CONSTRAINT UQ_USUARIO_MODULO UNIQUE (USUARIO_ID, MODULO_KEY)
        );
        CREATE INDEX IX_INTRANET_MOD_USUARIO ON dbo.INTRANET_USUARIOS_MODULOS(USUARIO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AccesosSchema:', err.message);
  }

  // Permisos granulares por acción dentro de un módulo (ej. crear, editar, exportar-pdf).
  // Independiente de INTRANET_USUARIOS_MODULOS (acceso al módulo completo).
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.INTRANET_USUARIOS_ACCIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.INTRANET_USUARIOS_ACCIONES (
          ID          INT IDENTITY(1,1) PRIMARY KEY,
          USUARIO_ID  INT           NOT NULL,
          MODULO_KEY  NVARCHAR(100) NOT NULL,
          ACCION_KEY  NVARCHAR(100) NOT NULL,
          ALLOW       BIT           NOT NULL DEFAULT 1,
          GRANTED_BY  INT           NULL,
          GRANTED_AT  DATETIME      NOT NULL DEFAULT GETDATE(),
          CONSTRAINT UQ_USUARIO_MODULO_ACCION UNIQUE (USUARIO_ID, MODULO_KEY, ACCION_KEY)
        );
        CREATE INDEX IX_INTRANET_ACC_USUARIO ON dbo.INTRANET_USUARIOS_ACCIONES(USUARIO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AccionesSchema:', err.message);
  }
}

// Tablas compartidas AREA_* usadas por el scaffold estandarizado de módulos de área
// (Dirección General, Calidad, Marketing, Legal, Finanzas, Ventas, Operaciones, TI,
// Atención al Cliente, RH). Ver plan "Expansión de la Intranet a las 10 Áreas".
async function ensureAreasSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KPIS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KPIS (
          AK_ID           INT IDENTITY(1,1) PRIMARY KEY,
          AK_AREA_KEY     NVARCHAR(50)   NOT NULL,
          AK_KPI_KEY      NVARCHAR(50)   NOT NULL,
          AK_LABEL        NVARCHAR(200)  NOT NULL,
          AK_VALOR        DECIMAL(18,2)  NOT NULL DEFAULT 0,
          AK_META         DECIMAL(18,2)  NULL,
          AK_UNIDAD       NVARCHAR(20)   NULL,
          AK_TONO         NVARCHAR(20)   NULL,
          AK_PERIODO      NVARCHAR(20)   NOT NULL,
          AK_FECHA_CORTE  DATETIME       NOT NULL DEFAULT GETDATE(),
          AK_UPDATED_BY   INT            NULL,
          CONSTRAINT UQ_AREA_KPI UNIQUE (AK_AREA_KEY, AK_KPI_KEY, AK_PERIODO)
        );
        CREATE INDEX IX_AREA_KPIS_AREA ON dbo.AREA_KPIS(AK_AREA_KEY, AK_PERIODO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKpisSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF COL_LENGTH('dbo.AREA_KPIS', 'AK_RESPONSABLE_ID') IS NULL
        ALTER TABLE dbo.AREA_KPIS ADD AK_RESPONSABLE_ID INT NULL;
      IF COL_LENGTH('dbo.AREA_KPIS', 'AK_FORMULA') IS NULL
        ALTER TABLE dbo.AREA_KPIS ADD AK_FORMULA NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.AREA_KPIS', 'AK_ORIGEN') IS NULL
        ALTER TABLE dbo.AREA_KPIS ADD AK_ORIGEN NVARCHAR(100) NULL;
    `);
  } catch (err) {
    console.warn('⚠️ AreaKpisGobernanzaSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_DOCUMENTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_DOCUMENTOS (
          AD_ID              INT IDENTITY(1,1) PRIMARY KEY,
          AD_AREA_KEY        NVARCHAR(50)   NOT NULL,
          AD_TITULO          NVARCHAR(255)  NOT NULL,
          AD_CATEGORIA       NVARCHAR(100)  NULL,
          AD_NOMBRE_ARCHIVO  NVARCHAR(255)  NOT NULL,
          AD_RUTA_FISICA     NVARCHAR(500)  NOT NULL,
          AD_SUBIDO_POR      INT            NULL,
          AD_FECHA_SUBIDA    DATETIME       NOT NULL DEFAULT GETDATE(),
          AD_ACTIVO          BIT            NOT NULL DEFAULT 1
        );
        CREATE INDEX IX_AREA_DOCUMENTOS_AREA ON dbo.AREA_DOCUMENTOS(AD_AREA_KEY, AD_ACTIVO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaDocumentosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_OBJETIVOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_OBJETIVOS (
          AO_ID           INT IDENTITY(1,1) PRIMARY KEY,
          AO_AREA_KEY     NVARCHAR(50)   NOT NULL UNIQUE,
          AO_OBJETIVO     NVARCHAR(MAX)  NULL,
          AO_MISION       NVARCHAR(MAX)  NULL,
          AO_VISION       NVARCHAR(MAX)  NULL,
          AO_UPDATED_BY   INT            NULL,
          AO_UPDATED_AT   DATETIME       NOT NULL DEFAULT GETDATE()
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaObjetivosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_PROCESOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_PROCESOS (
          AP_ID            INT IDENTITY(1,1) PRIMARY KEY,
          AP_AREA_KEY      NVARCHAR(50)   NOT NULL,
          AP_TITULO        NVARCHAR(255)  NOT NULL,
          AP_DESCRIPCION   NVARCHAR(MAX)  NULL,
          AP_ESTATUS       NVARCHAR(30)   NOT NULL DEFAULT 'activo',
          AP_RESPONSABLE_ID INT           NULL,
          AP_ORDEN         INT            NOT NULL DEFAULT 0,
          AP_ACTIVO        BIT            NOT NULL DEFAULT 1
        );
        CREATE INDEX IX_AREA_PROCESOS_AREA ON dbo.AREA_PROCESOS(AP_AREA_KEY, AP_ACTIVO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaProcesosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KPI_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KPI_COMENTARIOS (
          KC_ID           INT IDENTITY(1,1) PRIMARY KEY,
          KC_AREA_KEY     NVARCHAR(50)   NOT NULL,
          KC_KPI_KEY      NVARCHAR(50)   NOT NULL,
          KC_PERIODO      NVARCHAR(20)   NOT NULL,
          KC_USUARIO_ID   INT            NULL,
          KC_TEXTO        NVARCHAR(MAX)  NOT NULL,
          KC_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_AREA_KPI_COMENTARIOS ON dbo.AREA_KPI_COMENTARIOS(KC_AREA_KEY, KC_KPI_KEY, KC_PERIODO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKpiComentariosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KPI_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KPI_ALERTAS_LOG (
          KL_ID           INT IDENTITY(1,1) PRIMARY KEY,
          KL_AREA_KEY     NVARCHAR(50)   NOT NULL,
          KL_KPI_KEY      NVARCHAR(50)   NOT NULL,
          KL_PERIODO      NVARCHAR(20)   NOT NULL,
          KL_FECHA        DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_AREA_KPI_ALERTAS_LOG ON dbo.AREA_KPI_ALERTAS_LOG(KL_AREA_KEY, KL_KPI_KEY, KL_PERIODO, KL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKpiAlertasLogSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KPI_SNAPSHOT_TOKENS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KPI_SNAPSHOT_TOKENS (
          ST_ID           INT IDENTITY(1,1) PRIMARY KEY,
          ST_TOKEN        NVARCHAR(64)   NOT NULL,
          ST_PERIODO      NVARCHAR(20)   NOT NULL,
          ST_CREADO_POR   INT            NULL,
          ST_ACTIVO       BIT            NOT NULL DEFAULT 1,
          ST_EXPIRA       DATETIME       NOT NULL,
          ST_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT UQ_AREA_KPI_SNAPSHOT_TOKEN UNIQUE (ST_TOKEN)
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKpiSnapshotTokensSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_OBJETIVOS_ESTRATEGICOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_OBJETIVOS_ESTRATEGICOS (
          OE_ID              INT IDENTITY(1,1) PRIMARY KEY,
          OE_AREA_KEY        NVARCHAR(50)   NOT NULL,
          OE_TITULO          NVARCHAR(255)  NOT NULL,
          OE_DESCRIPCION     NVARCHAR(MAX)  NULL,
          OE_PERIODO         NVARCHAR(20)   NOT NULL,
          OE_RESPONSABLE_ID  INT            NULL,
          OE_ESTATUS         NVARCHAR(30)   NOT NULL DEFAULT 'activo',
          OE_ACTIVO          BIT            NOT NULL DEFAULT 1,
          OE_CREATED_BY      INT            NULL,
          OE_CREATED_AT      DATETIME       NOT NULL DEFAULT GETDATE(),
          OE_UPDATED_AT      DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_AREA_OBJ_ESTRAT_AREA ON dbo.AREA_OBJETIVOS_ESTRATEGICOS(OE_AREA_KEY, OE_PERIODO, OE_ACTIVO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaObjetivosEstrategicosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_RESULTADOS_CLAVE', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_RESULTADOS_CLAVE (
          RC_ID            INT IDENTITY(1,1) PRIMARY KEY,
          RC_OBJETIVO_ID   INT            NOT NULL,
          RC_TITULO        NVARCHAR(255)  NOT NULL,
          RC_VALOR_ACTUAL  DECIMAL(18,2)  NOT NULL DEFAULT 0,
          RC_META          DECIMAL(18,2)  NOT NULL DEFAULT 0,
          RC_UNIDAD        NVARCHAR(20)   NULL,
          RC_ORDEN         INT            NOT NULL DEFAULT 0,
          RC_UPDATED_AT    DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_RC_OBJETIVO FOREIGN KEY (RC_OBJETIVO_ID) REFERENCES dbo.AREA_OBJETIVOS_ESTRATEGICOS(OE_ID)
        );
        CREATE INDEX IX_AREA_RESULTADOS_CLAVE_OBJ ON dbo.AREA_RESULTADOS_CLAVE(RC_OBJETIVO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaResultadosClaveSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF COL_LENGTH('dbo.AREA_OBJETIVOS_ESTRATEGICOS', 'OE_OBJETIVO_PADRE_ID') IS NULL
        ALTER TABLE dbo.AREA_OBJETIVOS_ESTRATEGICOS ADD OE_OBJETIVO_PADRE_ID INT NULL;
      IF COL_LENGTH('dbo.AREA_OBJETIVOS_ESTRATEGICOS', 'OE_NIVEL') IS NULL
        ALTER TABLE dbo.AREA_OBJETIVOS_ESTRATEGICOS ADD OE_NIVEL NVARCHAR(30) NOT NULL DEFAULT 'departamento';
      IF COL_LENGTH('dbo.AREA_OBJETIVOS_ESTRATEGICOS', 'OE_ESTATUS_MANUAL') IS NULL
        ALTER TABLE dbo.AREA_OBJETIVOS_ESTRATEGICOS ADD OE_ESTATUS_MANUAL NVARCHAR(20) NOT NULL DEFAULT 'on_track';
    `);
  } catch (err) {
    console.warn('⚠️ AreaObjetivosEstrategicosAltersSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF COL_LENGTH('dbo.AREA_RESULTADOS_CLAVE', 'RC_TIPO') IS NULL
        ALTER TABLE dbo.AREA_RESULTADOS_CLAVE ADD RC_TIPO NVARCHAR(20) NOT NULL DEFAULT 'numerico';
      IF COL_LENGTH('dbo.AREA_RESULTADOS_CLAVE', 'RC_PESO') IS NULL
        ALTER TABLE dbo.AREA_RESULTADOS_CLAVE ADD RC_PESO DECIMAL(6,2) NOT NULL DEFAULT 1;
      IF COL_LENGTH('dbo.AREA_RESULTADOS_CLAVE', 'RC_RESPONSABLE_ID') IS NULL
        ALTER TABLE dbo.AREA_RESULTADOS_CLAVE ADD RC_RESPONSABLE_ID INT NULL;
    `);
  } catch (err) {
    console.warn('⚠️ AreaResultadosClaveAltersSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KR_CHECKINS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KR_CHECKINS (
          KC_ID             INT IDENTITY(1,1) PRIMARY KEY,
          KC_KR_ID          INT            NOT NULL,
          KC_VALOR_ANTERIOR DECIMAL(18,2)  NOT NULL DEFAULT 0,
          KC_VALOR_NUEVO    DECIMAL(18,2)  NOT NULL DEFAULT 0,
          KC_COMENTARIO     NVARCHAR(MAX)  NULL,
          KC_AUTOR_ID       INT            NULL,
          KC_FECHA          DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_KC_KR FOREIGN KEY (KC_KR_ID) REFERENCES dbo.AREA_RESULTADOS_CLAVE(RC_ID)
        );
        CREATE INDEX IX_AREA_KR_CHECKINS_KR ON dbo.AREA_KR_CHECKINS(KC_KR_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKrCheckinsSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KR_MILESTONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KR_MILESTONES (
          MS_ID          INT IDENTITY(1,1) PRIMARY KEY,
          MS_KR_ID       INT            NOT NULL,
          MS_TITULO      NVARCHAR(255)  NOT NULL,
          MS_COMPLETADO  BIT            NOT NULL DEFAULT 0,
          MS_ORDEN       INT            NOT NULL DEFAULT 0,
          CONSTRAINT FK_MS_KR FOREIGN KEY (MS_KR_ID) REFERENCES dbo.AREA_RESULTADOS_CLAVE(RC_ID)
        );
        CREATE INDEX IX_AREA_KR_MILESTONES_KR ON dbo.AREA_KR_MILESTONES(MS_KR_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKrMilestonesSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_OBJETIVO_COLABORADORES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_OBJETIVO_COLABORADORES (
          OC_ID           INT IDENTITY(1,1) PRIMARY KEY,
          OC_OBJETIVO_ID  INT NOT NULL,
          OC_USUARIO_ID   INT NOT NULL,
          CONSTRAINT FK_OC_OBJETIVO FOREIGN KEY (OC_OBJETIVO_ID) REFERENCES dbo.AREA_OBJETIVOS_ESTRATEGICOS(OE_ID),
          CONSTRAINT UQ_AREA_OBJ_COLAB UNIQUE (OC_OBJETIVO_ID, OC_USUARIO_ID)
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaObjetivoColaboradoresSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_OBJETIVO_ETIQUETAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_OBJETIVO_ETIQUETAS (
          OT_ID           INT IDENTITY(1,1) PRIMARY KEY,
          OT_OBJETIVO_ID  INT NOT NULL,
          OT_ETIQUETA     NVARCHAR(50) NOT NULL,
          CONSTRAINT FK_OT_OBJETIVO FOREIGN KEY (OT_OBJETIVO_ID) REFERENCES dbo.AREA_OBJETIVOS_ESTRATEGICOS(OE_ID)
        );
        CREATE INDEX IX_AREA_OBJ_ETIQUETAS_OBJ ON dbo.AREA_OBJETIVO_ETIQUETAS(OT_OBJETIVO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaObjetivoEtiquetasSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_OBJETIVO_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_OBJETIVO_COMENTARIOS (
          CM_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CM_OBJETIVO_ID  INT NOT NULL,
          CM_USUARIO_ID   INT NULL,
          CM_TEXTO        NVARCHAR(MAX) NOT NULL,
          CM_CREATED_AT   DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CM_OBJETIVO FOREIGN KEY (CM_OBJETIVO_ID) REFERENCES dbo.AREA_OBJETIVOS_ESTRATEGICOS(OE_ID)
        );
        CREATE INDEX IX_AREA_OBJ_COMENTARIOS_OBJ ON dbo.AREA_OBJETIVO_COMENTARIOS(CM_OBJETIVO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaObjetivoComentariosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_OKR_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_OKR_ALERTAS_LOG (
          AL_ID           INT IDENTITY(1,1) PRIMARY KEY,
          AL_OBJETIVO_ID  INT NOT NULL,
          AL_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_AL_OBJETIVO FOREIGN KEY (AL_OBJETIVO_ID) REFERENCES dbo.AREA_OBJETIVOS_ESTRATEGICOS(OE_ID)
        );
        CREATE INDEX IX_AREA_OKR_ALERTAS_LOG_OBJ ON dbo.AREA_OKR_ALERTAS_LOG(AL_OBJETIVO_ID, AL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaOkrAlertasLogSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_KR_EVIDENCIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_KR_EVIDENCIAS (
          EV_ID               INT IDENTITY(1,1) PRIMARY KEY,
          EV_KR_ID             INT NOT NULL,
          EV_USUARIO_ID        INT NULL,
          EV_NOMBRE_ARCHIVO    NVARCHAR(255) NOT NULL,
          EV_NOMBRE_ORIGINAL   NVARCHAR(255) NOT NULL,
          EV_MIME              NVARCHAR(100) NULL,
          EV_TAMANIO           INT NULL,
          EV_CREATED_AT        DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_EV_KR FOREIGN KEY (EV_KR_ID) REFERENCES dbo.AREA_RESULTADOS_CLAVE(RC_ID)
        );
        CREATE INDEX IX_AREA_KR_EVIDENCIAS_KR ON dbo.AREA_KR_EVIDENCIAS(EV_KR_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaKrEvidenciasSchema:', err.message);
  }
}

// Calidad: evaluaciones de monitoreo de llamadas (QA)
async function ensureCalidadSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CALIDAD_EVALUACIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_EVALUACIONES (
          CE_ID            INT IDENTITY(1,1) PRIMARY KEY,
          CE_AGENTE_ID     INT            NOT NULL,
          CE_EVALUADOR_ID  INT            NULL,
          CE_LLAMADA_REF   NVARCHAR(200)  NULL,
          CE_PUNTAJE       DECIMAL(5,2)   NOT NULL DEFAULT 0,
          CE_CRITERIOS_JSON NVARCHAR(MAX) NULL,
          CE_FECHA         DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_CALIDAD_EVAL_AGENTE ON dbo.CALIDAD_EVALUACIONES(CE_AGENTE_ID);
      END

      IF OBJECT_ID('dbo.CALIDAD_RETROALIMENTACION', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_RETROALIMENTACION (
          CR_ID            INT IDENTITY(1,1) PRIMARY KEY,
          CR_EVALUACION_ID INT            NOT NULL,
          CR_AGENTE_ID     INT            NOT NULL,
          CR_AUTOR_ID      SMALLINT       NULL,
          CR_COMENTARIO    NVARCHAR(2000) NOT NULL,
          CR_PLAN_MEJORA   NVARCHAR(2000) NULL,
          CR_VISTA         BIT            NOT NULL DEFAULT 0,
          CR_FECHA_VISTA   DATETIME       NULL,
          CR_FECHA         DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CALIDAD_RETRO_EVAL FOREIGN KEY (CR_EVALUACION_ID)
            REFERENCES dbo.CALIDAD_EVALUACIONES(CE_ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_CALIDAD_RETRO_AGENTE ON dbo.CALIDAD_RETROALIMENTACION(CR_AGENTE_ID, CR_VISTA);
      END

      IF OBJECT_ID('dbo.CALIDAD_PLANES_MEJORA', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_PLANES_MEJORA (
          CPM_ID              INT IDENTITY(1,1) PRIMARY KEY,
          CPM_EVALUACION_ID   INT            NOT NULL,
          CPM_AGENTE_ID       INT            NOT NULL,
          CPM_TITULO          NVARCHAR(200)  NOT NULL,
          CPM_DESCRIPCION     NVARCHAR(2000) NULL,
          CPM_FECHA_LIMITE    DATE           NULL,
          CPM_ESTATUS         NVARCHAR(20)   NOT NULL DEFAULT 'pendiente',
          CPM_CREADO_POR      SMALLINT       NULL,
          CPM_COMPLETADO_POR  SMALLINT       NULL,
          CPM_FECHA_COMPLETADO DATETIME      NULL,
          CPM_FECHA_CREACION  DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CALIDAD_PLAN_ESTATUS CHECK (CPM_ESTATUS IN ('pendiente', 'en_progreso', 'completado')),
          CONSTRAINT FK_CALIDAD_PLAN_EVAL FOREIGN KEY (CPM_EVALUACION_ID)
            REFERENCES dbo.CALIDAD_EVALUACIONES(CE_ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_CALIDAD_PLAN_AGENTE ON dbo.CALIDAD_PLANES_MEJORA(CPM_AGENTE_ID, CPM_ESTATUS);
      END

      IF OBJECT_ID('dbo.CALIDAD_PROCESOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_PROCESOS (
          CP_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CP_NOMBRE       NVARCHAR(200)  NOT NULL,
          CP_DESCRIPCION  NVARCHAR(1000) NULL,
          CP_PASOS_JSON   NVARCHAR(MAX)  NOT NULL,
          CP_ACTIVO       BIT            NOT NULL DEFAULT 1,
          CP_CREADO_POR   SMALLINT       NULL,
          CP_FECHA_CREACION DATETIME     NOT NULL DEFAULT GETDATE()
        );
      END

      IF OBJECT_ID('dbo.CALIDAD_PROCESOS_REGISTROS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_PROCESOS_REGISTROS (
          CPR_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CPR_PROCESO_ID   INT            NOT NULL,
          CPR_AGENTE_ID    INT            NOT NULL,
          CPR_EVALUADOR_ID SMALLINT       NULL,
          CPR_PASOS_JSON   NVARCHAR(MAX)  NOT NULL,
          CPR_PCT_CUMPLIMIENTO DECIMAL(5,2) NOT NULL DEFAULT 0,
          CPR_NOTAS        NVARCHAR(1000) NULL,
          CPR_FECHA        DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CALIDAD_PROCREG_PROCESO FOREIGN KEY (CPR_PROCESO_ID)
            REFERENCES dbo.CALIDAD_PROCESOS(CP_ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_CALIDAD_PROCREG_AGENTE ON dbo.CALIDAD_PROCESOS_REGISTROS(CPR_AGENTE_ID, CPR_FECHA);
      END

      IF OBJECT_ID('dbo.CALIDAD_AUDITORIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_AUDITORIAS (
          CA_ID              INT IDENTITY(1,1) PRIMARY KEY,
          CA_TITULO          NVARCHAR(200)  NOT NULL,
          CA_ALCANCE         NVARCHAR(1000) NULL,
          CA_PERIODO_INICIO  DATE           NULL,
          CA_PERIODO_FIN     DATE           NULL,
          CA_AUDITOR_ID      SMALLINT       NULL,
          CA_VEREDICTO       NVARCHAR(20)   NOT NULL DEFAULT 'en_curso',
          CA_HALLAZGOS       NVARCHAR(2000) NULL,
          CA_FECHA_CIERRE    DATETIME       NULL,
          CA_FECHA_CREACION  DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CALIDAD_AUD_VEREDICTO CHECK (CA_VEREDICTO IN ('en_curso', 'aprobada', 'observaciones', 'no_aprobada'))
        );
      END

      IF OBJECT_ID('dbo.CALIDAD_AUDITORIAS_REGISTROS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_AUDITORIAS_REGISTROS (
          CAR_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CAR_AUDITORIA_ID INT NOT NULL,
          CAR_REGISTRO_ID  INT NOT NULL,
          CONSTRAINT FK_CALIDAD_AUDREG_AUDITORIA FOREIGN KEY (CAR_AUDITORIA_ID)
            REFERENCES dbo.CALIDAD_AUDITORIAS(CA_ID) ON DELETE CASCADE,
          CONSTRAINT FK_CALIDAD_AUDREG_REGISTRO FOREIGN KEY (CAR_REGISTRO_ID)
            REFERENCES dbo.CALIDAD_PROCESOS_REGISTROS(CPR_ID) ON DELETE CASCADE,
          CONSTRAINT UQ_CALIDAD_AUDREG UNIQUE (CAR_AUDITORIA_ID, CAR_REGISTRO_ID)
        );
      END

      IF OBJECT_ID('dbo.CALIDAD_ERRORES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CALIDAD_ERRORES (
          CER_ID              INT IDENTITY(1,1) PRIMARY KEY,
          CER_AGENTE_ID       INT            NOT NULL,
          CER_EVALUACION_ID   INT            NULL,
          CER_CATEGORIA       NVARCHAR(100)  NOT NULL,
          CER_SEVERIDAD       NVARCHAR(20)   NOT NULL DEFAULT 'leve',
          CER_DESCRIPCION     NVARCHAR(2000) NOT NULL,
          CER_ESTATUS         NVARCHAR(20)   NOT NULL DEFAULT 'abierto',
          CER_DETECTADO_POR   SMALLINT       NULL,
          CER_RESUELTO_POR    SMALLINT       NULL,
          CER_FECHA_RESOLUCION DATETIME      NULL,
          CER_NOTAS_RESOLUCION NVARCHAR(1000) NULL,
          CER_FECHA           DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CALIDAD_ERR_SEVERIDAD CHECK (CER_SEVERIDAD IN ('leve', 'moderado', 'grave')),
          CONSTRAINT CK_CALIDAD_ERR_ESTATUS CHECK (CER_ESTATUS IN ('abierto', 'resuelto')),
          CONSTRAINT FK_CALIDAD_ERR_EVAL FOREIGN KEY (CER_EVALUACION_ID)
            REFERENCES dbo.CALIDAD_EVALUACIONES(CE_ID) ON DELETE SET NULL
        );
        CREATE INDEX IX_CALIDAD_ERR_AGENTE ON dbo.CALIDAD_ERRORES(CER_AGENTE_ID, CER_ESTATUS);
      END
    `);
  } catch (err) {
    console.warn('⚠️ CalidadSchema:', err.message);
  }
}

// Marketing: campañas
async function ensureMarketingSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_CAMPANIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_CAMPANIAS (
          MC_ID             INT IDENTITY(1,1) PRIMARY KEY,
          MC_NOMBRE         NVARCHAR(200)  NOT NULL,
          MC_CANAL          NVARCHAR(100)  NULL,
          MC_ESTATUS        NVARCHAR(30)   NOT NULL DEFAULT 'activa',
          MC_FECHA_INICIO   DATE           NULL,
          MC_FECHA_FIN      DATE           NULL,
          MC_PRESUPUESTO    DECIMAL(18,2)  NULL,
          MC_RESPONSABLE_ID INT            NULL
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingSchema:', err.message);
  }
}

// Legal y Cumplimiento: metadatos de documentos (los bytes siguen en filesystem)
async function ensureLegalesMetaSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_DOCUMENTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_DOCUMENTOS (
          LD_ID              INT IDENTITY(1,1) PRIMARY KEY,
          LD_TITULO          NVARCHAR(255)  NOT NULL,
          LD_CATEGORIA       NVARCHAR(100)  NULL,
          LD_NOMBRE_ARCHIVO  NVARCHAR(255)  NOT NULL,
          LD_NOMBRE_ORIGINAL NVARCHAR(255)  NULL,
          LD_SUBIDO_POR      INT            NULL,
          LD_FECHA_SUBIDA    DATETIME       NOT NULL DEFAULT GETDATE(),
          LD_ACTIVO          BIT            NOT NULL DEFAULT 1
        );
        CREATE INDEX IX_LEGALES_DOC_ACTIVO ON dbo.LEGALES_DOCUMENTOS(LD_ACTIVO);
        CREATE INDEX IX_LEGALES_DOC_CATEGORIA ON dbo.LEGALES_DOCUMENTOS(LD_CATEGORIA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesMetaSchema:', err.message);
  }
}

// Finanzas y Administración
async function ensureFinanzasSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.FINANZAS_INGRESOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_INGRESOS (
          FI_ID         INT IDENTITY(1,1) PRIMARY KEY,
          FI_CONCEPTO   NVARCHAR(255)  NOT NULL,
          FI_MONTO      DECIMAL(18,2)  NOT NULL,
          FI_FECHA      DATE           NOT NULL,
          FI_CATEGORIA  NVARCHAR(100)  NULL
        );
      END

      IF OBJECT_ID('dbo.FINANZAS_EGRESOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_EGRESOS (
          FE_ID         INT IDENTITY(1,1) PRIMARY KEY,
          FE_CONCEPTO   NVARCHAR(255)  NOT NULL,
          FE_MONTO      DECIMAL(18,2)  NOT NULL,
          FE_FECHA      DATE           NOT NULL,
          FE_CATEGORIA  NVARCHAR(100)  NULL
        );
      END

      IF OBJECT_ID('dbo.FINANZAS_PRESUPUESTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_PRESUPUESTOS (
          FP_ID               INT IDENTITY(1,1) PRIMARY KEY,
          FP_AREA_KEY         NVARCHAR(50)   NOT NULL,
          FP_PERIODO          NVARCHAR(20)   NOT NULL,
          FP_MONTO_ASIGNADO   DECIMAL(18,2)  NOT NULL DEFAULT 0,
          FP_MONTO_EJERCIDO   DECIMAL(18,2)  NOT NULL DEFAULT 0,
          CONSTRAINT UQ_FINANZAS_PRESUPUESTO UNIQUE (FP_AREA_KEY, FP_PERIODO)
        );
      END

      IF OBJECT_ID('dbo.FINANZAS_CXC', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_CXC (
          FCC_ID                INT IDENTITY(1,1) PRIMARY KEY,
          FCC_CLIENTE           NVARCHAR(255)  NOT NULL,
          FCC_MONTO             DECIMAL(18,2)  NOT NULL,
          FCC_FECHA_VENCIMIENTO DATE           NULL,
          FCC_ESTATUS           NVARCHAR(30)   NOT NULL DEFAULT 'pendiente'
        );
      END

      IF OBJECT_ID('dbo.FINANZAS_CXP', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_CXP (
          FCP_ID                INT IDENTITY(1,1) PRIMARY KEY,
          FCP_PROVEEDOR         NVARCHAR(255)  NOT NULL,
          FCP_MONTO             DECIMAL(18,2)  NOT NULL,
          FCP_FECHA_VENCIMIENTO DATE           NULL,
          FCP_ESTATUS           NVARCHAR(30)   NOT NULL DEFAULT 'pendiente'
        );
      END

      IF OBJECT_ID('dbo.FINANZAS_CUENTAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_CUENTAS (
          FCU_ID            INT IDENTITY(1,1) PRIMARY KEY,
          FCU_BANCO         NVARCHAR(150)  NOT NULL,
          FCU_ALIAS         NVARCHAR(150)  NOT NULL,
          FCU_NUMERO        NVARCHAR(50)   NULL,
          FCU_SALDO_INICIAL DECIMAL(18,2)  NOT NULL DEFAULT 0,
          FCU_ACTIVA        BIT            NOT NULL DEFAULT 1,
          FCU_FECHA_ALTA    DATETIME       NOT NULL DEFAULT GETDATE()
        );
      END

      IF OBJECT_ID('dbo.FINANZAS_MOVIMIENTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FINANZAS_MOVIMIENTOS (
          FM_ID          INT IDENTITY(1,1) PRIMARY KEY,
          FM_CUENTA_ID   INT            NOT NULL,
          FM_TIPO        NVARCHAR(20)   NOT NULL,
          FM_CONCEPTO    NVARCHAR(255)  NOT NULL,
          FM_MONTO       DECIMAL(18,2)  NOT NULL,
          FM_FECHA       DATE           NOT NULL,
          FM_CREADO_EN   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_FINANZAS_MOV_TIPO CHECK (FM_TIPO IN ('deposito', 'retiro')),
          CONSTRAINT FK_FINANZAS_MOV_CUENTA FOREIGN KEY (FM_CUENTA_ID)
            REFERENCES dbo.FINANZAS_CUENTAS(FCU_ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_FINANZAS_MOV_CUENTA ON dbo.FINANZAS_MOVIMIENTOS(FM_CUENTA_ID, FM_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ FinanzasSchema:', err.message);
  }
}

// Ventas: metas por asesor/periodo (complementa CRM/ventas existentes).
// VM_CAMPANA_ID/VM_TIPO/VM_ALCANCE permiten metas diarias por campaña (global,
// VM_ASESOR_ID=0) además de las mensuales por asesor originales.
async function ensureVentasMetasSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.VENTAS_METAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.VENTAS_METAS (
          VM_ID            INT IDENTITY(1,1) PRIMARY KEY,
          VM_ASESOR_ID     INT            NOT NULL,
          VM_PERIODO       NVARCHAR(20)   NOT NULL,
          VM_META_MONTO    DECIMAL(18,2)  NULL,
          VM_META_UNIDADES INT            NULL,
          VM_CAMPANA_ID    INT            NULL,
          VM_TIPO          NVARCHAR(10)   NOT NULL DEFAULT 'mensual',
          VM_ALCANCE       NVARCHAR(10)   NOT NULL DEFAULT 'asesor',
          CONSTRAINT UQ_VENTAS_META UNIQUE (VM_ASESOR_ID, VM_PERIODO, VM_CAMPANA_ID)
        );
      END
      ELSE
      BEGIN
        IF COL_LENGTH('dbo.VENTAS_METAS','VM_CAMPANA_ID') IS NULL
          ALTER TABLE dbo.VENTAS_METAS ADD VM_CAMPANA_ID INT NULL;
        IF COL_LENGTH('dbo.VENTAS_METAS','VM_TIPO') IS NULL
          ALTER TABLE dbo.VENTAS_METAS ADD VM_TIPO NVARCHAR(10) NOT NULL DEFAULT 'mensual';
        IF COL_LENGTH('dbo.VENTAS_METAS','VM_ALCANCE') IS NULL
          ALTER TABLE dbo.VENTAS_METAS ADD VM_ALCANCE NVARCHAR(10) NOT NULL DEFAULT 'asesor';

        -- La UNIQUE original (VM_ASESOR_ID, VM_PERIODO) no admite dos metas del
        -- mismo asesor/día en campañas distintas. Se reemplaza por una que
        -- incluye VM_CAMPANA_ID, una sola vez (detectada por su nombre).
        IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_VENTAS_META' AND parent_object_id = OBJECT_ID('dbo.VENTAS_METAS'))
          AND NOT EXISTS (
            SELECT 1 FROM sys.index_columns ic
            JOIN sys.key_constraints kc ON kc.unique_index_id = ic.index_id AND kc.parent_object_id = ic.object_id
            JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE kc.name = 'UQ_VENTAS_META' AND c.name = 'VM_CAMPANA_ID'
          )
        BEGIN
          ALTER TABLE dbo.VENTAS_METAS DROP CONSTRAINT UQ_VENTAS_META;
          ALTER TABLE dbo.VENTAS_METAS ADD CONSTRAINT UQ_VENTAS_META UNIQUE (VM_ASESOR_ID, VM_PERIODO, VM_CAMPANA_ID);
        END
      END
    `);
  } catch (err) {
    console.warn('⚠️ VentasMetasSchema:', err.message);
  }
}

// Ventas: fórmulas de incentivo definidas por el admin (texto de expresión, evaluada
// por formulaService contra variables del asesor: ventas, meta, pctCumplimiento,
// montoComision). Sin fórmula fija en código — el usuario la escribe/edita desde la UI.
async function ensureIncentivosSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.VENTAS_INCENTIVOS_REGLAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.VENTAS_INCENTIVOS_REGLAS (
          VIR_ID              INT IDENTITY(1,1) PRIMARY KEY,
          VIR_NOMBRE          NVARCHAR(150)   NOT NULL,
          VIR_FORMULA         NVARCHAR(1000)  NOT NULL,
          VIR_ORDEN           INT             NOT NULL DEFAULT 0,
          VIR_ACTIVA          BIT             NOT NULL DEFAULT 1,
          VIR_CREADO_POR      SMALLINT        NULL,
          VIR_FECHA_CREACION  DATETIME        NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_VIR_ORDEN ON dbo.VENTAS_INCENTIVOS_REGLAS(VIR_ORDEN);
      END
    `);
    // Migración: si la tabla quedó creada con el esquema viejo (umbral fijo) de una
    // versión anterior de este módulo, se agrega la columna de fórmula sin perder filas.
    const colInfo = await pool.request().query(`
      SELECT COL_LENGTH('dbo.VENTAS_INCENTIVOS_REGLAS', 'VIR_FORMULA') as tieneFormula,
             COL_LENGTH('dbo.VENTAS_INCENTIVOS_REGLAS', 'VIR_PCT_MINIMO') as tienePctViejo
    `);
    const { tieneFormula, tienePctViejo } = colInfo.recordset[0];
    if (!tieneFormula) {
      await pool.request().batch(`ALTER TABLE dbo.VENTAS_INCENTIVOS_REGLAS ADD VIR_FORMULA NVARCHAR(1000) NULL, VIR_ORDEN INT NOT NULL DEFAULT 0`);
      if (tienePctViejo) {
        await pool.request().batch(`UPDATE dbo.VENTAS_INCENTIVOS_REGLAS SET VIR_FORMULA = 'IF(pctCumplimiento >= ' + CAST(VIR_PCT_MINIMO AS NVARCHAR(20)) + ', ' + CAST(VIR_MONTO_BONO AS NVARCHAR(20)) + ', 0)' WHERE VIR_FORMULA IS NULL`);
      }
      await pool.request().batch(`UPDATE dbo.VENTAS_INCENTIVOS_REGLAS SET VIR_FORMULA = '0' WHERE VIR_FORMULA IS NULL`);
      await pool.request().batch(`ALTER TABLE dbo.VENTAS_INCENTIVOS_REGLAS ALTER COLUMN VIR_FORMULA NVARCHAR(1000) NOT NULL`);
    }
    // Columnas del esquema viejo (umbral fijo) ya no se usan; se dejan como nullable
    // (no se borran, para no perder datos de instalaciones previas). Se ejecuta siempre
    // — independiente de si VIR_FORMULA ya existía — por si quedaron NOT NULL de una
    // migración anterior interrumpida.
    if (tienePctViejo) {
      const nullableRs = await pool.request().query(`
        SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'VENTAS_INCENTIVOS_REGLAS' AND COLUMN_NAME = 'VIR_PCT_MINIMO'
      `);
      if (nullableRs.recordset[0]?.IS_NULLABLE === 'NO') {
        await pool.request().batch(`ALTER TABLE dbo.VENTAS_INCENTIVOS_REGLAS ALTER COLUMN VIR_PCT_MINIMO DECIMAL(6,2) NULL`);
        await pool.request().batch(`ALTER TABLE dbo.VENTAS_INCENTIVOS_REGLAS ALTER COLUMN VIR_MONTO_BONO DECIMAL(18,2) NULL`);
      }
    }
  } catch (err) {
    console.warn('⚠️ IncentivosSchema:', err.message);
  }
}

// Operaciones / Call Center: campañas y asignación de bases
async function ensureCallCenterSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CC_CAMPANIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CC_CAMPANIAS (
          CC_ID            INT IDENTITY(1,1) PRIMARY KEY,
          CC_NOMBRE        NVARCHAR(200)  NOT NULL,
          CC_ESTATUS       NVARCHAR(30)   NOT NULL DEFAULT 'activa',
          CC_FECHA_INICIO  DATE           NULL
        );
      END

      IF OBJECT_ID('dbo.CC_ASIGNACION_BASE', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CC_ASIGNACION_BASE (
          CAB_ID                INT IDENTITY(1,1) PRIMARY KEY,
          CAB_CAMPANIA_ID       INT            NOT NULL,
          CAB_AGENTE_ID         INT            NOT NULL,
          CAB_CANTIDAD_REGISTROS INT           NOT NULL DEFAULT 0,
          CAB_FECHA             DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_CC_ASIG_CAMPANIA ON dbo.CC_ASIGNACION_BASE(CAB_CAMPANIA_ID);
      END

      IF OBJECT_ID('dbo.CC_CAMPANIAS_SUPERVISORES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CC_CAMPANIAS_SUPERVISORES (
          CS_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CS_CAMPANIA_ID  INT            NOT NULL,
          CS_SUPERVISOR_ID INT           NOT NULL,
          CS_FECHA        DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CC_CAMP_SUP_CAMPANIA FOREIGN KEY (CS_CAMPANIA_ID)
            REFERENCES dbo.CC_CAMPANIAS(CC_ID) ON DELETE CASCADE,
          CONSTRAINT UQ_CC_CAMP_SUP UNIQUE (CS_CAMPANIA_ID, CS_SUPERVISOR_ID)
        );
        CREATE INDEX IX_CC_CAMP_SUP_SUPERVISOR ON dbo.CC_CAMPANIAS_SUPERVISORES(CS_SUPERVISOR_ID);
      END

      IF OBJECT_ID('dbo.CC_METAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CC_METAS (
          CM_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CM_TIPO         NVARCHAR(20)   NOT NULL,
          CM_CAMPANIA_ID  INT            NULL,
          CM_AGENTE_ID    SMALLINT       NULL,
          CM_PERIODO      CHAR(7)        NOT NULL,
          CM_META_REGISTROS INT          NOT NULL DEFAULT 0,
          CM_CREADO_POR   SMALLINT       NULL,
          CM_FECHA_CREACION DATETIME     NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CC_METAS_TIPO CHECK (CM_TIPO IN ('campania', 'agente')),
          CONSTRAINT FK_CC_METAS_CAMPANIA FOREIGN KEY (CM_CAMPANIA_ID)
            REFERENCES dbo.CC_CAMPANIAS(CC_ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_CC_METAS_PERIODO ON dbo.CC_METAS(CM_PERIODO);
        CREATE UNIQUE INDEX UQ_CC_METAS_CAMPANIA ON dbo.CC_METAS(CM_CAMPANIA_ID, CM_PERIODO) WHERE CM_TIPO = 'campania';
        CREATE UNIQUE INDEX UQ_CC_METAS_AGENTE ON dbo.CC_METAS(CM_AGENTE_ID, CM_PERIODO) WHERE CM_TIPO = 'agente';
      END
    `);
  } catch (err) {
    console.warn('⚠️ CallCenterSchema:', err.message);
  }

  // Campaña asignada a cada agente CC — el catálogo de campañas vive en el
  // sistema externo de Ventas (BD plata_prospectPRO.dbo.Campanas, ver
  // ventasController.getVentasPool), no se duplica aquí. Esta tabla solo
  // guarda la asignación agente→campaña (editable desde Usuarios) más un
  // snapshot del nombre de campaña, por si en Ventas se renombra o se
  // desactiva después de la asignación.
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AC_CAMPANIAS_AGENTES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AC_CAMPANIAS_AGENTES (
          ACA_ID                  INT IDENTITY(1,1) PRIMARY KEY,
          ACA_NEUS_ID             SMALLINT NOT NULL,
          ACA_VENTAS_CAMPANA_ID   INT NOT NULL,
          ACA_VENTAS_CAMPANA_NOMBRE NVARCHAR(200) NOT NULL,
          ACA_ASIGNADO_POR        INT NULL,
          ACA_FECHA_ASIGNACION    DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_ACA_NEUS FOREIGN KEY (ACA_NEUS_ID) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID),
          CONSTRAINT UQ_ACA_NEUS UNIQUE (ACA_NEUS_ID)
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ CampaniasAgentesSchema:', err.message);
  }
}

// Tecnología / TI: mantenimientos e incidentes de seguridad
async function ensureTiAreaSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.TI_MANTENIMIENTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_MANTENIMIENTOS (
          TM_ID             INT IDENTITY(1,1) PRIMARY KEY,
          TM_ACTIVO_ID      INT            NULL,
          TM_TIPO           NVARCHAR(100)  NOT NULL,
          TM_FECHA          DATETIME       NOT NULL DEFAULT GETDATE(),
          TM_RESPONSABLE_ID INT            NULL,
          TM_NOTAS          NVARCHAR(MAX)  NULL
        );
      END

      IF OBJECT_ID('dbo.TI_INCIDENTES_SEGURIDAD', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_INCIDENTES_SEGURIDAD (
          TIS_ID          INT IDENTITY(1,1) PRIMARY KEY,
          TIS_TIPO        NVARCHAR(100)  NOT NULL,
          TIS_SEVERIDAD   NVARCHAR(30)   NOT NULL DEFAULT 'baja',
          TIS_FECHA       DATETIME       NOT NULL DEFAULT GETDATE(),
          TIS_ESTATUS     NVARCHAR(30)   NOT NULL DEFAULT 'abierto',
          TIS_DESCRIPCION NVARCHAR(MAX)  NULL
        );
      END

      IF OBJECT_ID('dbo.TI_ENLACES_RED', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_ENLACES_RED (
          ENL_ID           INT IDENTITY(1,1) PRIMARY KEY,
          ENL_NOMBRE       NVARCHAR(150)  NOT NULL,
          ENL_PROVEEDOR    NVARCHAR(100)  NULL,
          ENL_UBICACION    NVARCHAR(150)  NULL,
          ENL_VELOCIDAD    NVARCHAR(50)   NULL,
          ENL_ESTADO       NVARCHAR(20)   NOT NULL DEFAULT 'activo',
          ENL_NOTAS        NVARCHAR(MAX)  NULL,
          ENL_FECHA_CREACION DATETIME     NOT NULL DEFAULT GETDATE(),
          ENL_FECHA_ACTUALIZACION DATETIME NULL
        );
      END

      IF OBJECT_ID('dbo.TI_INCIDENTES_RED', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_INCIDENTES_RED (
          IR_ID           INT IDENTITY(1,1) PRIMARY KEY,
          IR_ENLACE_ID    INT            NULL,
          IR_TIPO         NVARCHAR(30)   NOT NULL DEFAULT 'caida',
          IR_FECHA_INICIO DATETIME       NOT NULL DEFAULT GETDATE(),
          IR_FECHA_FIN    DATETIME       NULL,
          IR_DESCRIPCION  NVARCHAR(MAX)  NULL,
          IR_REPORTADO_POR INT           NULL,
          CONSTRAINT FK_TI_INCIDENTES_RED_ENLACE FOREIGN KEY (IR_ENLACE_ID)
            REFERENCES dbo.TI_ENLACES_RED(ENL_ID) ON DELETE SET NULL
        );
        CREATE INDEX IX_TI_INCIDENTES_RED_ENLACE ON dbo.TI_INCIDENTES_RED(IR_ENLACE_ID);
      END

      IF OBJECT_ID('dbo.TI_RESPALDOS_CONFIG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_RESPALDOS_CONFIG (
          RC_ID              INT IDENTITY(1,1) PRIMARY KEY,
          RC_NOMBRE          NVARCHAR(150)  NOT NULL,
          RC_DESCRIPCION     NVARCHAR(MAX)  NULL,
          RC_PERIODICIDAD_DIAS INT          NOT NULL DEFAULT 1,
          RC_ACTIVO          BIT            NOT NULL DEFAULT 1,
          RC_FECHA_CREACION  DATETIME       NOT NULL DEFAULT GETDATE()
        );
      END

      IF OBJECT_ID('dbo.TI_RESPALDOS_REGISTROS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_RESPALDOS_REGISTROS (
          RR_ID          INT IDENTITY(1,1) PRIMARY KEY,
          RR_CONFIG_ID   INT            NOT NULL,
          RR_FECHA       DATETIME       NOT NULL DEFAULT GETDATE(),
          RR_EXITO       BIT            NOT NULL DEFAULT 1,
          RR_NOTAS       NVARCHAR(MAX)  NULL,
          RR_REGISTRADO_POR INT         NULL,
          CONSTRAINT FK_TI_RESPALDOS_REGISTROS_CONFIG FOREIGN KEY (RR_CONFIG_ID)
            REFERENCES dbo.TI_RESPALDOS_CONFIG(RC_ID) ON DELETE CASCADE
        );
        CREATE INDEX IX_TI_RESPALDOS_REGISTROS_CONFIG ON dbo.TI_RESPALDOS_REGISTROS(RR_CONFIG_ID, RR_FECHA DESC);
      END

      IF OBJECT_ID('dbo.TI_SISTEMAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_SISTEMAS (
          SIS_ID           INT IDENTITY(1,1) PRIMARY KEY,
          SIS_NOMBRE       NVARCHAR(150)  NOT NULL,
          SIS_DESCRIPCION  NVARCHAR(MAX)  NULL,
          SIS_URL          NVARCHAR(300)  NULL,
          SIS_ESTADO       NVARCHAR(20)   NOT NULL DEFAULT 'operativo',
          SIS_NOTAS        NVARCHAR(MAX)  NULL,
          SIS_FECHA_CREACION DATETIME     NOT NULL DEFAULT GETDATE(),
          SIS_FECHA_ACTUALIZACION DATETIME NULL
        );
      END

      IF OBJECT_ID('dbo.TI_INCIDENTES_SISTEMA', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_INCIDENTES_SISTEMA (
          ISI_ID           INT IDENTITY(1,1) PRIMARY KEY,
          ISI_SISTEMA_ID   INT            NULL,
          ISI_TIPO         NVARCHAR(30)   NOT NULL DEFAULT 'caido',
          ISI_FECHA_INICIO DATETIME       NOT NULL DEFAULT GETDATE(),
          ISI_FECHA_FIN    DATETIME       NULL,
          ISI_DESCRIPCION  NVARCHAR(MAX)  NULL,
          ISI_REPORTADO_POR INT           NULL,
          CONSTRAINT FK_TI_INCIDENTES_SISTEMA_SIS FOREIGN KEY (ISI_SISTEMA_ID)
            REFERENCES dbo.TI_SISTEMAS(SIS_ID) ON DELETE SET NULL
        );
        CREATE INDEX IX_TI_INCIDENTES_SISTEMA_SIS ON dbo.TI_INCIDENTES_SISTEMA(ISI_SISTEMA_ID);
      END

      /* ── Monitoreo de red en vivo (agente PowerShell → ingesta) ── */

      IF OBJECT_ID('dbo.TI_RED_AGENTES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_RED_AGENTES (
          RA_ID            INT IDENTITY(1,1) PRIMARY KEY,
          RA_NOMBRE        NVARCHAR(120)  NOT NULL,        -- hostname o etiqueta
          RA_ENLACE_ID     INT            NULL,            -- enlace que monitorea
          RA_VERSION       NVARCHAR(30)   NULL,
          RA_SO            NVARCHAR(120)  NULL,
          RA_IP_LOCAL      NVARCHAR(45)   NULL,
          RA_GATEWAY       NVARCHAR(45)   NULL,
          RA_ROUTER_ESTADO NVARCHAR(20)   NULL,            -- ok | sin-acceso | deshabilitado | ...
          RA_ROUTER_MARCA  NVARCHAR(60)   NULL,
          RA_ROUTER_MODELO NVARCHAR(120)  NULL,
          RA_ROUTER_METODO NVARCHAR(40)   NULL,            -- que sonda funciono
          RA_ULTIMA_SENAL  DATETIME       NULL,            -- última ingesta recibida
          RA_PRIMERA_VEZ   DATETIME       NOT NULL DEFAULT GETDATE(),
          RA_ACTIVO        BIT            NOT NULL DEFAULT 1,
          CONSTRAINT UQ_TI_RED_AGENTES_NOMBRE UNIQUE (RA_NOMBRE),
          CONSTRAINT FK_TI_RED_AGENTES_ENLACE FOREIGN KEY (RA_ENLACE_ID)
            REFERENCES dbo.TI_ENLACES_RED(ENL_ID) ON DELETE SET NULL
        );
      END
      ELSE
      BEGIN
        IF COL_LENGTH('dbo.TI_RED_AGENTES','RA_ROUTER_ESTADO') IS NULL ALTER TABLE dbo.TI_RED_AGENTES ADD RA_ROUTER_ESTADO NVARCHAR(20) NULL;
        IF COL_LENGTH('dbo.TI_RED_AGENTES','RA_ROUTER_MARCA')  IS NULL ALTER TABLE dbo.TI_RED_AGENTES ADD RA_ROUTER_MARCA  NVARCHAR(60) NULL;
        IF COL_LENGTH('dbo.TI_RED_AGENTES','RA_ROUTER_MODELO') IS NULL ALTER TABLE dbo.TI_RED_AGENTES ADD RA_ROUTER_MODELO NVARCHAR(120) NULL;
        IF COL_LENGTH('dbo.TI_RED_AGENTES','RA_ROUTER_METODO') IS NULL ALTER TABLE dbo.TI_RED_AGENTES ADD RA_ROUTER_METODO NVARCHAR(40) NULL;
      END

      IF OBJECT_ID('dbo.TI_RED_MEDICIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_RED_MEDICIONES (
          RM_ID            BIGINT IDENTITY(1,1) PRIMARY KEY,
          RM_ENLACE_ID     INT            NULL,
          RM_AGENTE_ID     INT            NULL,
          RM_FECHA         DATETIME       NOT NULL DEFAULT GETDATE(),
          RM_ONLINE        BIT            NOT NULL,
          RM_LATENCIA_MS   DECIMAL(7,2)   NULL,
          RM_JITTER_MS     DECIMAL(7,2)   NULL,
          RM_PERDIDA_PCT   DECIMAL(5,2)   NULL,
          RM_DOWN_MBPS     DECIMAL(9,2)   NULL,
          RM_UP_MBPS       DECIMAL(9,2)   NULL,
          RM_LINK_MBPS     DECIMAL(9,2)   NULL,
          RM_ADAPTADOR_UP  BIT            NULL,
          RM_DISP_ONLINE   INT            NULL,
          RM_ORIGEN        NVARCHAR(120)  NULL,
          CONSTRAINT FK_TI_RED_MEDICIONES_ENLACE FOREIGN KEY (RM_ENLACE_ID)
            REFERENCES dbo.TI_ENLACES_RED(ENL_ID) ON DELETE SET NULL
        );
        CREATE INDEX IX_TI_RED_MEDICIONES_FECHA ON dbo.TI_RED_MEDICIONES(RM_FECHA DESC);
        CREATE INDEX IX_TI_RED_MEDICIONES_ENLACE ON dbo.TI_RED_MEDICIONES(RM_ENLACE_ID, RM_FECHA DESC);
      END

      IF OBJECT_ID('dbo.TI_RED_DISPOSITIVOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TI_RED_DISPOSITIVOS (
          RD_ID            INT IDENTITY(1,1) PRIMARY KEY,
          RD_MAC           NVARCHAR(40)   NOT NULL,
          RD_ENLACE_ID     INT            NULL,
          RD_IP            NVARCHAR(45)   NULL,
          RD_HOSTNAME      NVARCHAR(160)  NULL,
          RD_FABRICANTE    NVARCHAR(140)  NULL,          -- OUI vendor
          RD_ALIAS         NVARCHAR(160)  NULL,          -- editable por TI
          RD_ORIGEN        NVARCHAR(20)   NULL,          -- 'arp' | 'dhcp' | 'router'
          RD_PRIMERA_VEZ   DATETIME       NOT NULL DEFAULT GETDATE(),
          RD_ULTIMA_VEZ    DATETIME       NOT NULL DEFAULT GETDATE(),
          RD_ONLINE        BIT            NOT NULL DEFAULT 1,
          RD_BLOQUEADO     BIT            NOT NULL DEFAULT 0,
          CONSTRAINT UQ_TI_RED_DISPOSITIVOS_MAC UNIQUE (RD_MAC)
        );
        CREATE INDEX IX_TI_RED_DISPOSITIVOS_ULTIMA ON dbo.TI_RED_DISPOSITIVOS(RD_ULTIMA_VEZ DESC);
      END
    `);
  } catch (err) {
    console.warn('⚠️ TiAreaSchema:', err.message);
  }
}

// Atención al Cliente: retención / riesgo de churn (satisfacción reusa TICKET_SATISFACCION existente)
async function ensureAtencionClienteSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AC_RETENCION', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AC_RETENCION (
          AR_ID                INT IDENTITY(1,1) PRIMARY KEY,
          AR_CLIENTE_ID        INT            NULL,
          AR_CLIENTE_NOMBRE    NVARCHAR(255)  NULL,
          AR_ESTATUS           NVARCHAR(30)   NOT NULL DEFAULT 'estable',
          AR_FECHA_EVALUACION  DATETIME       NOT NULL DEFAULT GETDATE(),
          AR_MOTIVO_RIESGO     NVARCHAR(MAX)  NULL
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ AtencionClienteSchema:', err.message);
  }

  // Fase 8: AR_CLIENTE_ID pasa a ser FK real a CRM_CONTACTOS (antes era un INT
  // suelto sin integridad referencial) — AR_CLIENTE_NOMBRE se mantiene como
  // texto libre para cuando el cliente aún no está dado de alta.
  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_AR_CLIENTE_CONTACTO')
        AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AC_RETENCION') AND name = 'AR_CLIENTE_ID')
      BEGIN
        ALTER TABLE dbo.AC_RETENCION ADD CONSTRAINT FK_AR_CLIENTE_CONTACTO FOREIGN KEY (AR_CLIENTE_ID) REFERENCES dbo.CRM_CONTACTOS(CONT_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AtencionClienteSchemaFkCliente:', err.message);
  }
}

// Bitácora de seguimiento (contactos con cliente, estatus de 7 colores) y tareas
// asignables por cliente — Fase 2 del módulo "Seguimiento de Clientes", sobre
// CRM_CONTACTOS (ya extendida en ensureCrmSchema con los campos de "cliente").
async function ensureClienteSeguimientoSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CLI_SEGUIMIENTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CLI_SEGUIMIENTOS (
          SEG_ID             INT IDENTITY(1,1) PRIMARY KEY,
          SEG_CONTACTO_ID    INT NOT NULL,
          SEG_TIPO_CONTACTO  NVARCHAR(30) NOT NULL DEFAULT 'otro',
          SEG_ESTATUS_COLOR  NVARCHAR(20) NOT NULL DEFAULT 'verde',
          SEG_NOTA           NVARCHAR(MAX) NULL,
          SEG_USUARIO_ID     INT NULL,
          SEG_FECHA          DATETIME NOT NULL DEFAULT GETDATE(),
          SEG_ACTIVO         BIT NOT NULL DEFAULT 1
        );
        CREATE INDEX IX_CLI_SEGUIMIENTOS_CONTACTO ON dbo.CLI_SEGUIMIENTOS(SEG_CONTACTO_ID, SEG_FECHA DESC);
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliSeguimientosSchema:', err.message);
  }

  // Campos explícitos del flujo (punto 3): Motivo, Acuerdos y Próxima fecha de
  // seguimiento — antes solo existía SEG_NOTA como comentario libre único.
  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CLI_SEGUIMIENTOS') AND name = 'SEG_MOTIVO')
      BEGIN
        ALTER TABLE dbo.CLI_SEGUIMIENTOS ADD SEG_MOTIVO NVARCHAR(200) NULL;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliSeguimientosMotivoSchema:', err.message);
  }
  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CLI_SEGUIMIENTOS') AND name = 'SEG_ACUERDOS')
      BEGIN
        ALTER TABLE dbo.CLI_SEGUIMIENTOS ADD SEG_ACUERDOS NVARCHAR(MAX) NULL;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliSeguimientosAcuerdosSchema:', err.message);
  }
  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CLI_SEGUIMIENTOS') AND name = 'SEG_PROXIMA_FECHA')
      BEGIN
        ALTER TABLE dbo.CLI_SEGUIMIENTOS ADD SEG_PROXIMA_FECHA DATE NULL;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliSeguimientosProximaFechaSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CLI_TAREAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CLI_TAREAS (
          TAR_ID                 INT IDENTITY(1,1) PRIMARY KEY,
          TAR_CONTACTO_ID        INT NOT NULL,
          TAR_TITULO              NVARCHAR(200) NOT NULL,
          TAR_DESCRIPCION         NVARCHAR(MAX) NULL,
          TAR_PRIORIDAD           NVARCHAR(20) NOT NULL DEFAULT 'media',
          TAR_ASIGNADO_A          INT NULL,
          TAR_FECHA_VENCIMIENTO   DATE NULL,
          TAR_ESTATUS             NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
          TAR_CREADO_POR          INT NULL,
          TAR_FECHA_CREACION      DATETIME NOT NULL DEFAULT GETDATE(),
          TAR_FECHA_COMPLETADA    DATETIME NULL,
          TAR_ACTIVO              BIT NOT NULL DEFAULT 1
        );
        CREATE INDEX IX_CLI_TAREAS_CONTACTO ON dbo.CLI_TAREAS(TAR_CONTACTO_ID);
        CREATE INDEX IX_CLI_TAREAS_ASIGNADO ON dbo.CLI_TAREAS(TAR_ASIGNADO_A, TAR_ESTATUS);
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliTareasSchema:', err.message);
  }

  // Catálogo de tipos de actividad (punto 4 del flujo): Llamar al cliente,
  // Solicitar documentación, Confirmar recepción de documentos, Dar seguimiento
  // a una solicitud, Recordar fecha de pago, Confirmar pago, Renovación de
  // servicio, Encuesta de satisfacción, Seguimiento de incidencia, u Otro.
  // TAR_TITULO se mantiene como detalle libre; TAR_TIPO clasifica la tarea.
  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CLI_TAREAS') AND name = 'TAR_TIPO')
      BEGIN
        ALTER TABLE dbo.CLI_TAREAS ADD TAR_TIPO NVARCHAR(40) NOT NULL DEFAULT 'otro';
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliTareasTipoSchema:', err.message);
  }
}

// Gestión de incidencias de cliente — Fase 5 del módulo "Seguimiento de
// Clientes". INC_ORIGEN distingue si se creó manualmente o automáticamente
// (encuesta negativa, pago vencido — ver Fases 4/3).
async function ensureClienteIncidenciasSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CLI_INCIDENCIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CLI_INCIDENCIAS (
          INC_ID               INT IDENTITY(1,1) PRIMARY KEY,
          INC_FOLIO             NVARCHAR(20) NOT NULL,
          INC_CONTACTO_ID       INT NOT NULL,
          INC_TITULO            NVARCHAR(200) NOT NULL,
          INC_DESCRIPCION       NVARCHAR(MAX) NULL,
          INC_CATEGORIA         NVARCHAR(50) NULL,
          INC_PRIORIDAD         NVARCHAR(20) NOT NULL DEFAULT 'media',
          INC_SLA_HORAS         INT NULL,
          INC_FECHA_LIMITE_SLA  DATETIME NULL,
          INC_ESTATUS           NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
          INC_ORIGEN            NVARCHAR(20) NOT NULL DEFAULT 'manual',
          INC_ASIGNADO_A        INT NULL,
          INC_CREADO_POR        INT NULL,
          INC_FECHA_CREACION    DATETIME NOT NULL DEFAULT GETDATE(),
          INC_FECHA_RESOLUCION  DATETIME NULL,
          INC_ACTIVO            BIT NOT NULL DEFAULT 1,
          CONSTRAINT UQ_CLI_INCIDENCIAS_FOLIO UNIQUE (INC_FOLIO)
        );
        CREATE INDEX IX_CLI_INCIDENCIAS_CONTACTO ON dbo.CLI_INCIDENCIAS(INC_CONTACTO_ID);
        CREATE INDEX IX_CLI_INCIDENCIAS_ESTATUS ON dbo.CLI_INCIDENCIAS(INC_ESTATUS) WHERE INC_ACTIVO = 1;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliIncidenciasSchema:', err.message);
  }

  // Enum de estatus renombrado al literal del flujo pedido (abierta→pendiente,
  // resuelta→resuelto, cerrada→cerrado) + campos de solución propuesta/fecha
  // compromiso (Atención → Solución propuesta → Fecha compromiso → Cierre).
  try {
    await pool.request().batch(`
      UPDATE dbo.CLI_INCIDENCIAS SET INC_ESTATUS='pendiente' WHERE INC_ESTATUS='abierta';
      UPDATE dbo.CLI_INCIDENCIAS SET INC_ESTATUS='resuelto' WHERE INC_ESTATUS='resuelta';
      UPDATE dbo.CLI_INCIDENCIAS SET INC_ESTATUS='cerrado' WHERE INC_ESTATUS='cerrada';
    `);
  } catch (err) {
    console.warn('⚠️ CliIncidenciasEstatusMigracion:', err.message);
  }

  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CLI_INCIDENCIAS') AND name = 'INC_SOLUCION_PROPUESTA')
      BEGIN
        ALTER TABLE dbo.CLI_INCIDENCIAS ADD INC_SOLUCION_PROPUESTA NVARCHAR(MAX) NULL;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliIncidenciasSolucionPropuestaSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CLI_INCIDENCIAS') AND name = 'INC_FECHA_COMPROMISO')
      BEGIN
        ALTER TABLE dbo.CLI_INCIDENCIAS ADD INC_FECHA_COMPROMISO DATE NULL;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliIncidenciasFechaCompromisoSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CLI_INCIDENCIAS_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CLI_INCIDENCIAS_COMENTARIOS (
          ICO_ID              INT IDENTITY(1,1) PRIMARY KEY,
          ICO_INCIDENCIA_ID   INT NOT NULL,
          ICO_COMENTARIO      NVARCHAR(MAX) NOT NULL,
          ICO_USUARIO_ID      INT NULL,
          ICO_FECHA           DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_ICO_INCIDENCIA FOREIGN KEY (ICO_INCIDENCIA_ID) REFERENCES dbo.CLI_INCIDENCIAS(INC_ID)
        );
        CREATE INDEX IX_CLI_INCIDENCIAS_COMENTARIOS_INC ON dbo.CLI_INCIDENCIAS_COMENTARIOS(ICO_INCIDENCIA_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliIncidenciasComentariosSchema:', err.message);
  }

  // Evidencias (adjuntos) de incidencia — punto 7 del flujo del documento:
  // Atención → Solución propuesta → Fecha compromiso → Evidencias → Cierre.
  // Mismo patrón de cifrado AES-256-GCM que CRM_DOCUMENTOS_CLIENTE (utils/cryptoDocs.js,
  // misma EXPEDIENTE_ENCRYPTION_KEY), pero ligado a la incidencia, no al cliente.
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CLI_INCIDENCIAS_EVIDENCIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CLI_INCIDENCIAS_EVIDENCIAS (
          EVI_ID               INT IDENTITY(1,1) PRIMARY KEY,
          EVI_INCIDENCIA_ID    INT NOT NULL,
          EVI_NOMBRE_ORIGINAL  NVARCHAR(255) NOT NULL,
          EVI_MIME_TYPE        NVARCHAR(100) NULL,
          EVI_TAMANO_BYTES     BIGINT NOT NULL,
          EVI_DESCRIPCION      NVARCHAR(500) NULL,
          EVI_ENCRYPTED_DATA   VARBINARY(MAX) NOT NULL,
          EVI_CONTENT_HASH     CHAR(64) NOT NULL,
          EVI_ENC_ALGO         NVARCHAR(30) NOT NULL DEFAULT 'aes-256-gcm',
          EVI_ENC_IV           VARBINARY(12) NOT NULL,
          EVI_ENC_TAG          VARBINARY(16) NOT NULL,
          EVI_KEY_ID           NVARCHAR(50) NULL,
          EVI_SUBIDO_POR       INT NULL,
          EVI_FECHA_SUBIDA     DATETIME NOT NULL DEFAULT GETDATE(),
          EVI_ACTIVO           BIT NOT NULL DEFAULT 1,
          CONSTRAINT FK_EVI_INCIDENCIA FOREIGN KEY (EVI_INCIDENCIA_ID) REFERENCES dbo.CLI_INCIDENCIAS(INC_ID)
        );
        CREATE INDEX IX_CLI_INCIDENCIAS_EVIDENCIAS_INC ON dbo.CLI_INCIDENCIAS_EVIDENCIAS(EVI_INCIDENCIA_ID, EVI_ACTIVO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliIncidenciasEvidenciasSchema:', err.message);
  }
}

// Renovaciones y fechas importantes de cliente (contrato, servicio, mantenimiento,
// cumpleaños, personalizadas) — Fase 6 del módulo "Seguimiento de Clientes".
// FEC_DIAS_ALERTA es un CSV configurable por registro (default '30,15,7'),
// evaluado por el cron en clienteFechasCronController.js.
async function ensureClienteFechasSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.CLI_FECHAS_IMPORTANTES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CLI_FECHAS_IMPORTANTES (
          FEC_ID                 INT IDENTITY(1,1) PRIMARY KEY,
          FEC_CONTACTO_ID        INT NOT NULL,
          FEC_TIPO                NVARCHAR(30) NOT NULL DEFAULT 'personalizada',
          FEC_DESCRIPCION         NVARCHAR(200) NOT NULL,
          FEC_FECHA               DATE NOT NULL,
          FEC_RECURRENTE_ANUAL    BIT NOT NULL DEFAULT 0,
          FEC_DIAS_ALERTA         NVARCHAR(50) NOT NULL DEFAULT '30,15,7',
          FEC_ULTIMA_ALERTA_DIAS  INT NULL,
          FEC_ESTATUS             NVARCHAR(20) NOT NULL DEFAULT 'vigente',
          FEC_CREADO_POR          INT NULL,
          FEC_FECHA_CREACION      DATETIME NOT NULL DEFAULT GETDATE(),
          FEC_ACTIVO              BIT NOT NULL DEFAULT 1
        );
        CREATE INDEX IX_CLI_FECHAS_CONTACTO ON dbo.CLI_FECHAS_IMPORTANTES(FEC_CONTACTO_ID);
        CREATE INDEX IX_CLI_FECHAS_FECHA ON dbo.CLI_FECHAS_IMPORTANTES(FEC_FECHA) WHERE FEC_ACTIVO = 1;
      END
    `);
  } catch (err) {
    console.warn('⚠️ CliFechasImportantesSchema:', err.message);
  }
}

// Recursos Humanos: reclutamiento (vacantes/candidatos) — clima laboral reusa módulo Encuestas
async function ensureRhAreaSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.RH_VACANTES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.RH_VACANTES (
          RV_ID             INT IDENTITY(1,1) PRIMARY KEY,
          RV_PUESTO         NVARCHAR(200)  NOT NULL,
          RV_AREA_KEY       NVARCHAR(50)   NULL,
          RV_ESTATUS        NVARCHAR(30)   NOT NULL DEFAULT 'abierta',
          RV_FECHA_APERTURA DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE)
        );
      END

      IF OBJECT_ID('dbo.RH_CANDIDATOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.RH_CANDIDATOS (
          RC_ID          INT IDENTITY(1,1) PRIMARY KEY,
          RC_VACANTE_ID  INT            NOT NULL,
          RC_NOMBRE      NVARCHAR(200)  NOT NULL,
          RC_ETAPA       NVARCHAR(50)   NOT NULL DEFAULT 'nuevo',
          RC_FECHA       DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_RH_CANDIDATOS_VACANTE ON dbo.RH_CANDIDATOS(RC_VACANTE_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ RhAreaSchema:', err.message);
  }
}

async function ensureDecisionesSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_DECISION_TIPOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_DECISION_TIPOS (
          DT_ID                    INT IDENTITY(1,1) PRIMARY KEY,
          DT_NOMBRE                NVARCHAR(150)  NOT NULL,
          DT_DESCRIPCION           NVARCHAR(500)  NULL,
          DT_ICONO                 NVARCHAR(50)   NULL,
          DT_COLOR                 NVARCHAR(20)   NULL,
          DT_APROBADOR_DEFAULT_ID  INT            NULL,
          DT_REQUIERE_ADJUNTO      BIT            NOT NULL DEFAULT 0,
          DT_ACTIVO                BIT            NOT NULL DEFAULT 1,
          DT_ORDEN                 INT            NOT NULL DEFAULT 0,
          DT_CREATED_BY            INT            NULL,
          DT_CREATED_AT            DATETIME       NOT NULL DEFAULT GETDATE(),
          DT_UPDATED_AT            DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_AREA_DECISION_TIPOS_ACTIVO ON dbo.AREA_DECISION_TIPOS(DT_ACTIVO, DT_ORDEN);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaDecisionTiposSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_DECISIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_DECISIONES (
          DE_ID                 INT IDENTITY(1,1) PRIMARY KEY,
          DE_TIPO_ID             INT            NOT NULL,
          DE_TITULO              NVARCHAR(255)  NOT NULL,
          DE_DESCRIPCION         NVARCHAR(MAX)  NULL,
          DE_SOLICITANTE_ID      INT            NOT NULL,
          DE_APROBADOR_ID        INT            NOT NULL,
          DE_ESTATUS             NVARCHAR(20)   NOT NULL DEFAULT 'pendiente',
          DE_PRIORIDAD           NVARCHAR(20)   NOT NULL DEFAULT 'normal',
          DE_MOTIVO_RESOLUCION   NVARCHAR(MAX)  NULL,
          DE_FECHA_LIMITE        DATE           NULL,
          DE_RESUELTA_POR        INT            NULL,
          DE_RESUELTA_AT         DATETIME       NULL,
          DE_CREATED_AT          DATETIME       NOT NULL DEFAULT GETDATE(),
          DE_UPDATED_AT          DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DE_TIPO FOREIGN KEY (DE_TIPO_ID) REFERENCES dbo.AREA_DECISION_TIPOS(DT_ID)
        );
        CREATE INDEX IX_AREA_DECISIONES_SOLICITANTE ON dbo.AREA_DECISIONES(DE_SOLICITANTE_ID, DE_ESTATUS);
        CREATE INDEX IX_AREA_DECISIONES_APROBADOR ON dbo.AREA_DECISIONES(DE_APROBADOR_ID, DE_ESTATUS);
        CREATE INDEX IX_AREA_DECISIONES_ESTATUS ON dbo.AREA_DECISIONES(DE_ESTATUS, DE_CREATED_AT);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaDecisionesSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_DECISION_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_DECISION_COMENTARIOS (
          DC_ID           INT IDENTITY(1,1) PRIMARY KEY,
          DC_DECISION_ID  INT            NOT NULL,
          DC_USUARIO_ID   INT            NULL,
          DC_TEXTO        NVARCHAR(MAX)  NOT NULL,
          DC_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DC_DECISION FOREIGN KEY (DC_DECISION_ID) REFERENCES dbo.AREA_DECISIONES(DE_ID)
        );
        CREATE INDEX IX_AREA_DECISION_COMENTARIOS_DEC ON dbo.AREA_DECISION_COMENTARIOS(DC_DECISION_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaDecisionComentariosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_DECISION_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_DECISION_ADJUNTOS (
          DA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          DA_DECISION_ID       INT            NOT NULL,
          DA_USUARIO_ID        INT            NULL,
          DA_NOMBRE_ARCHIVO    NVARCHAR(255)  NOT NULL,
          DA_NOMBRE_ORIGINAL   NVARCHAR(255)  NOT NULL,
          DA_MIME              NVARCHAR(100)  NULL,
          DA_TAMANIO           INT            NULL,
          DA_CREATED_AT        DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DA_DECISION FOREIGN KEY (DA_DECISION_ID) REFERENCES dbo.AREA_DECISIONES(DE_ID)
        );
        CREATE INDEX IX_AREA_DECISION_ADJUNTOS_DEC ON dbo.AREA_DECISION_ADJUNTOS(DA_DECISION_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaDecisionAdjuntosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_DECISION_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_DECISION_ALERTAS_LOG (
          DL_ID           INT IDENTITY(1,1) PRIMARY KEY,
          DL_DECISION_ID  INT      NOT NULL,
          DL_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DL_DECISION FOREIGN KEY (DL_DECISION_ID) REFERENCES dbo.AREA_DECISIONES(DE_ID)
        );
        CREATE INDEX IX_AREA_DECISION_ALERTAS_LOG ON dbo.AREA_DECISION_ALERTAS_LOG(DL_DECISION_ID, DL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaDecisionAlertasLogSchema:', err.message);
  }
}

async function ensureReportesEjecutivosSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_REPORTE_PLANTILLAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_REPORTE_PLANTILLAS (
          RP_ID            INT IDENTITY(1,1) PRIMARY KEY,
          RP_NOMBRE        NVARCHAR(150)  NOT NULL,
          RP_DESCRIPCION   NVARCHAR(500)  NULL,
          RP_FUENTE        NVARCHAR(30)   NOT NULL,
          RP_CONFIG        NVARCHAR(MAX)  NOT NULL,
          RP_CREADO_POR    INT            NULL,
          RP_ACTIVO        BIT            NOT NULL DEFAULT 1,
          RP_CREATED_AT    DATETIME       NOT NULL DEFAULT GETDATE(),
          RP_UPDATED_AT    DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_AREA_REPORTE_PLANTILLAS_FUENTE ON dbo.AREA_REPORTE_PLANTILLAS(RP_FUENTE, RP_ACTIVO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaReportePlantillasSchema:', err.message);
  }
}

async function ensureSupervisionAlertasSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.AREA_SUPERVISION_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AREA_SUPERVISION_ALERTAS_LOG (
          SAL_ID        INT IDENTITY(1,1) PRIMARY KEY,
          SAL_AREA_KEY  NVARCHAR(50)   NOT NULL,
          SAL_PERIODO   NVARCHAR(20)   NOT NULL,
          SAL_FECHA     DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_AREA_SUPERVISION_ALERTAS_LOG ON dbo.AREA_SUPERVISION_ALERTAS_LOG(SAL_AREA_KEY, SAL_PERIODO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ AreaSupervisionAlertasLogSchema:', err.message);
  }
}

async function ensureMejoraContinuaSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MC_HALLAZGOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MC_HALLAZGOS (
          MH_ID                   INT IDENTITY(1,1) PRIMARY KEY,
          MH_TITULO               NVARCHAR(255)  NOT NULL,
          MH_DESCRIPCION          NVARCHAR(MAX)  NULL,
          MH_AREA_ORIGEN          NVARCHAR(50)   NULL,
          MH_SEVERIDAD            NVARCHAR(20)   NOT NULL DEFAULT 'media',
          MH_ESTATUS              NVARCHAR(20)   NOT NULL DEFAULT 'abierto',
          MH_CAUSA_RAIZ           NVARCHAR(MAX)  NULL,
          MH_RESPONSABLE_ID       INT            NULL,
          MH_FECHA_DETECCION      DATETIME       NOT NULL DEFAULT GETDATE(),
          MH_FECHA_COMPROMISO     DATE           NULL,
          MH_VERIFICADO_POR       INT            NULL,
          MH_FECHA_VERIFICACION   DATETIME       NULL,
          MH_EVIDENCIA_CIERRE     NVARCHAR(MAX)  NULL,
          MH_CREATED_BY           INT            NULL,
          MH_CREATED_AT           DATETIME       NOT NULL DEFAULT GETDATE(),
          MH_UPDATED_AT           DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_MC_HALLAZGOS_ESTATUS ON dbo.MC_HALLAZGOS(MH_ESTATUS, MH_AREA_ORIGEN);
      END
    `);
  } catch (err) {
    console.warn('⚠️ McHallazgosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MC_ACCIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MC_ACCIONES (
          MA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          MA_HALLAZGO_ID      INT            NOT NULL,
          MA_TIPO             NVARCHAR(20)   NOT NULL DEFAULT 'correctiva',
          MA_DESCRIPCION      NVARCHAR(MAX)  NOT NULL,
          MA_RESPONSABLE_ID   INT            NULL,
          MA_FECHA_COMPROMISO DATE           NULL,
          MA_ESTATUS          NVARCHAR(20)   NOT NULL DEFAULT 'pendiente',
          MA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_MA_HALLAZGO FOREIGN KEY (MA_HALLAZGO_ID) REFERENCES dbo.MC_HALLAZGOS(MH_ID)
        );
        CREATE INDEX IX_MC_ACCIONES_HALLAZGO ON dbo.MC_ACCIONES(MA_HALLAZGO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ McAccionesSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MC_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MC_COMENTARIOS (
          MCM_ID           INT IDENTITY(1,1) PRIMARY KEY,
          MCM_HALLAZGO_ID  INT            NOT NULL,
          MCM_USUARIO_ID   INT            NULL,
          MCM_TEXTO        NVARCHAR(MAX)  NOT NULL,
          MCM_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_MCM_HALLAZGO FOREIGN KEY (MCM_HALLAZGO_ID) REFERENCES dbo.MC_HALLAZGOS(MH_ID)
        );
        CREATE INDEX IX_MC_COMENTARIOS_HALLAZGO ON dbo.MC_COMENTARIOS(MCM_HALLAZGO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ McComentariosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_FOLIO') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_FOLIO NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_TIPO') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_TIPO NVARCHAR(30) NULL DEFAULT 'no_conformidad';
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_ORIGEN') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_ORIGEN NVARCHAR(30) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_REQUISITO_INCUMPLIDO') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_REQUISITO_INCUMPLIDO NVARCHAR(255) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_IMPACTO_COSTO') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_IMPACTO_COSTO NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_IMPACTO_CLIENTE') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_IMPACTO_CLIENTE NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_IMPACTO_LEGAL') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_IMPACTO_LEGAL NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_PORQUE_1') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_PORQUE_1 NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_PORQUE_2') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_PORQUE_2 NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_PORQUE_3') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_PORQUE_3 NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_PORQUE_4') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_PORQUE_4 NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_PORQUE_5') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_PORQUE_5 NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.MC_HALLAZGOS', 'MH_EFICAZ') IS NULL ALTER TABLE dbo.MC_HALLAZGOS ADD MH_EFICAZ BIT NULL;
    `);
  } catch (err) {
    console.warn('⚠️ McHallazgosCamposFase2Schema:', err.message);
  }

  // Filas creadas con el DEFAULT original de la columna ('abierto') quedaron con un
  // estatus que no pertenece al enum de 8 estados que usa el frontend (ESTATUS_CONFIG),
  // causando un TypeError al leer .cls de un valor undefined y tumbando la página.
  try {
    await pool.request().batch(`
      UPDATE dbo.MC_HALLAZGOS SET MH_ESTATUS = 'registrado' WHERE MH_ESTATUS = 'abierto' OR MH_ESTATUS IS NULL;
    `);
  } catch (err) {
    console.warn('⚠️ McHallazgosNormalizarEstatusSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF COL_LENGTH('dbo.MC_ACCIONES', 'MA_FECHA_REAL_CIERRE') IS NULL ALTER TABLE dbo.MC_ACCIONES ADD MA_FECHA_REAL_CIERRE DATE NULL;
    `);
  } catch (err) {
    console.warn('⚠️ McAccionesCamposFase2Schema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MC_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MC_ADJUNTOS (
          MCA_ID             INT IDENTITY(1,1) PRIMARY KEY,
          MCA_HALLAZGO_ID    INT            NOT NULL,
          MCA_USUARIO_ID     INT            NULL,
          MCA_NOMBRE_ARCHIVO NVARCHAR(255)  NOT NULL,
          MCA_NOMBRE_ORIGINAL NVARCHAR(255) NOT NULL,
          MCA_MIME           NVARCHAR(100)  NULL,
          MCA_TAMANIO        INT            NULL,
          MCA_CREATED_AT     DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_MCA_HALLAZGO FOREIGN KEY (MCA_HALLAZGO_ID) REFERENCES dbo.MC_HALLAZGOS(MH_ID)
        );
        CREATE INDEX IX_MC_ADJUNTOS_HALLAZGO ON dbo.MC_ADJUNTOS(MCA_HALLAZGO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ McAdjuntosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MC_ACCIONES_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MC_ACCIONES_ALERTAS_LOG (
          MAL_ID        INT IDENTITY(1,1) PRIMARY KEY,
          MAL_ACCION_ID INT      NOT NULL,
          MAL_FECHA     DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_MAL_ACCION FOREIGN KEY (MAL_ACCION_ID) REFERENCES dbo.MC_ACCIONES(MA_ID)
        );
        CREATE INDEX IX_MC_ACCIONES_ALERTAS_LOG ON dbo.MC_ACCIONES_ALERTAS_LOG(MAL_ACCION_ID, MAL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ McAccionesAlertasLogSchema:', err.message);
  }
}

// Marketing: Redes sociales (cuentas, posts/calendario, métricas manuales)
async function ensureMarketingRedesSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_REDES_CUENTAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_REDES_CUENTAS (
          MRC_ID         INT IDENTITY(1,1) PRIMARY KEY,
          MRC_NOMBRE     NVARCHAR(150)  NOT NULL,
          MRC_RED        NVARCHAR(30)   NOT NULL,
          MRC_HANDLE     NVARCHAR(150)  NULL,
          MRC_ACTIVA     BIT            NOT NULL DEFAULT 1,
          MRC_CREATED_AT DATETIME       NOT NULL DEFAULT GETDATE()
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingRedesCuentasSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_REDES_POSTS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_REDES_POSTS (
          MRP_ID               INT IDENTITY(1,1) PRIMARY KEY,
          MRP_CUENTA_ID        INT            NOT NULL,
          MRP_CAMPANIA_ID      INT            NULL,
          MRP_TITULO           NVARCHAR(200)  NOT NULL,
          MRP_CONTENIDO        NVARCHAR(MAX)  NULL,
          MRP_ESTATUS          NVARCHAR(20)   NOT NULL DEFAULT 'borrador',
          MRP_FECHA_PROGRAMADA DATETIME       NULL,
          MRP_FECHA_PUBLICADO  DATETIME       NULL,
          MRP_IMAGEN_ARCHIVO   NVARCHAR(255)  NULL,
          MRP_IMAGEN_ORIGINAL  NVARCHAR(255)  NULL,
          MRP_RESPONSABLE_ID   INT            NULL,
          MRP_CREATED_BY       INT            NULL,
          MRP_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_MRP_CUENTA FOREIGN KEY (MRP_CUENTA_ID) REFERENCES dbo.MARKETING_REDES_CUENTAS(MRC_ID),
          CONSTRAINT FK_MRP_CAMPANIA FOREIGN KEY (MRP_CAMPANIA_ID) REFERENCES dbo.MARKETING_CAMPANIAS(MC_ID)
        );
        CREATE INDEX IX_MARKETING_REDES_POSTS_ESTATUS ON dbo.MARKETING_REDES_POSTS(MRP_ESTATUS, MRP_FECHA_PROGRAMADA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingRedesPostsSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_REDES_METRICAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_REDES_METRICAS (
          MRM_ID             INT IDENTITY(1,1) PRIMARY KEY,
          MRM_POST_ID        INT            NOT NULL UNIQUE,
          MRM_ALCANCE        INT            NULL,
          MRM_INTERACCIONES  INT            NULL,
          MRM_CLICS          INT            NULL,
          MRM_CAPTURADO_POR  INT            NULL,
          MRM_CAPTURADO_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_MRM_POST FOREIGN KEY (MRM_POST_ID) REFERENCES dbo.MARKETING_REDES_POSTS(MRP_ID)
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingRedesMetricasSchema:', err.message);
  }
}

// Marketing: Diseño (solicitudes, comentarios y adjuntos de entregables)
async function ensureMarketingDisenoSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_DISENO_TIPOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_DISENO_TIPOS (
          DZT_ID           INT IDENTITY(1,1) PRIMARY KEY,
          DZT_NOMBRE       NVARCHAR(150)  NOT NULL,
          DZT_DESCRIPCION  NVARCHAR(500)  NULL,
          DZT_ICONO        NVARCHAR(50)   NULL,
          DZT_COLOR        NVARCHAR(20)   NULL,
          DZT_ACTIVO       BIT            NOT NULL DEFAULT 1,
          DZT_ORDEN        INT            NOT NULL DEFAULT 0,
          DZT_CREATED_BY   INT            NULL,
          DZT_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          DZT_UPDATED_AT   DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_MARKETING_DISENO_TIPOS_ACTIVO ON dbo.MARKETING_DISENO_TIPOS(DZT_ACTIVO, DZT_ORDEN);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingDisenoTiposSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_DISENO_SOLICITUDES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_DISENO_SOLICITUDES (
          DZS_ID                 INT IDENTITY(1,1) PRIMARY KEY,
          DZS_TIPO_ID            INT            NOT NULL,
          DZS_TITULO             NVARCHAR(200)  NOT NULL,
          DZS_DESCRIPCION        NVARCHAR(MAX)  NULL,
          DZS_SOLICITANTE_ID     INT            NOT NULL,
          DZS_ASIGNADO_ID        INT            NULL,
          DZS_ESTATUS            NVARCHAR(20)   NOT NULL DEFAULT 'pendiente',
          DZS_PRIORIDAD          NVARCHAR(20)   NOT NULL DEFAULT 'normal',
          DZS_FECHA_LIMITE       DATE           NULL,
          DZS_MOTIVO_RESOLUCION  NVARCHAR(MAX)  NULL,
          DZS_RESUELTA_POR       INT            NULL,
          DZS_RESUELTA_AT        DATETIME       NULL,
          DZS_CREATED_AT         DATETIME       NOT NULL DEFAULT GETDATE(),
          DZS_UPDATED_AT         DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DZS_TIPO FOREIGN KEY (DZS_TIPO_ID) REFERENCES dbo.MARKETING_DISENO_TIPOS(DZT_ID)
        );
        CREATE INDEX IX_MARKETING_DISENO_SOL_SOLICITANTE ON dbo.MARKETING_DISENO_SOLICITUDES(DZS_SOLICITANTE_ID, DZS_ESTATUS);
        CREATE INDEX IX_MARKETING_DISENO_SOL_ASIGNADO ON dbo.MARKETING_DISENO_SOLICITUDES(DZS_ASIGNADO_ID, DZS_ESTATUS);
        CREATE INDEX IX_MARKETING_DISENO_SOL_ESTATUS ON dbo.MARKETING_DISENO_SOLICITUDES(DZS_ESTATUS, DZS_CREATED_AT);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingDisenoSolicitudesSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_DISENO_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_DISENO_COMENTARIOS (
          DZC_ID            INT IDENTITY(1,1) PRIMARY KEY,
          DZC_SOLICITUD_ID  INT            NOT NULL,
          DZC_USUARIO_ID    INT            NULL,
          DZC_TEXTO         NVARCHAR(MAX)  NOT NULL,
          DZC_CREATED_AT    DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DZC_SOLICITUD FOREIGN KEY (DZC_SOLICITUD_ID) REFERENCES dbo.MARKETING_DISENO_SOLICITUDES(DZS_ID)
        );
        CREATE INDEX IX_MARKETING_DISENO_COM_SOL ON dbo.MARKETING_DISENO_COMENTARIOS(DZC_SOLICITUD_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingDisenoComentariosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_DISENO_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_DISENO_ADJUNTOS (
          DZA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          DZA_SOLICITUD_ID     INT            NOT NULL,
          DZA_USUARIO_ID       INT            NULL,
          DZA_TIPO             NVARCHAR(20)   NOT NULL DEFAULT 'referencia',
          DZA_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          DZA_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          DZA_MIME             NVARCHAR(100)  NULL,
          DZA_TAMANIO          INT            NULL,
          DZA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_DZA_SOLICITUD FOREIGN KEY (DZA_SOLICITUD_ID) REFERENCES dbo.MARKETING_DISENO_SOLICITUDES(DZS_ID)
        );
        CREATE INDEX IX_MARKETING_DISENO_ADJ_SOL ON dbo.MARKETING_DISENO_ADJUNTOS(DZA_SOLICITUD_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingDisenoAdjuntosSchema:', err.message);
  }
}

// Marketing: Publicidad (campañas pagadas + anuncios individuales + métricas manuales)
async function ensureMarketingPublicidadSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_PUBLICIDAD_CAMPANIAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_PUBLICIDAD_CAMPANIAS (
          PBC_ID              INT IDENTITY(1,1) PRIMARY KEY,
          PBC_NOMBRE          NVARCHAR(200)  NOT NULL,
          PBC_PLATAFORMA      NVARCHAR(30)   NOT NULL,
          PBC_OBJETIVO        NVARCHAR(150)  NULL,
          PBC_PRESUPUESTO     DECIMAL(18,2)  NULL,
          PBC_FECHA_INICIO    DATE           NULL,
          PBC_FECHA_FIN       DATE           NULL,
          PBC_ESTATUS         NVARCHAR(20)   NOT NULL DEFAULT 'planeada',
          PBC_RESPONSABLE_ID  INT            NULL,
          PBC_CAMPANIA_ID     INT            NULL,
          PBC_CREATED_AT      DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_PBC_CAMPANIA FOREIGN KEY (PBC_CAMPANIA_ID) REFERENCES dbo.MARKETING_CAMPANIAS(MC_ID)
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingPublicidadCampaniasSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_PUBLICIDAD_ANUNCIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_PUBLICIDAD_ANUNCIOS (
          PBA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          PBA_CAMPANIA_ID      INT            NOT NULL,
          PBA_TITULO           NVARCHAR(200)  NOT NULL,
          PBA_COPY             NVARCHAR(MAX)  NULL,
          PBA_PRESUPUESTO      DECIMAL(18,2)  NULL,
          PBA_ESTATUS          NVARCHAR(20)   NOT NULL DEFAULT 'activo',
          PBA_IMAGEN_ARCHIVO   NVARCHAR(255)  NULL,
          PBA_IMAGEN_ORIGINAL  NVARCHAR(255)  NULL,
          PBA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_PBA_CAMPANIA FOREIGN KEY (PBA_CAMPANIA_ID) REFERENCES dbo.MARKETING_PUBLICIDAD_CAMPANIAS(PBC_ID)
        );
        CREATE INDEX IX_MARKETING_PUBLICIDAD_ANUNCIOS_CAMP ON dbo.MARKETING_PUBLICIDAD_ANUNCIOS(PBA_CAMPANIA_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingPublicidadAnunciosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_PUBLICIDAD_METRICAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_PUBLICIDAD_METRICAS (
          PBM_ID             INT IDENTITY(1,1) PRIMARY KEY,
          PBM_ANUNCIO_ID     INT            NOT NULL UNIQUE,
          PBM_IMPRESIONES    INT            NULL,
          PBM_CLICS          INT            NULL,
          PBM_CONVERSIONES   INT            NULL,
          PBM_GASTO          DECIMAL(18,2)  NULL,
          PBM_CAPTURADO_POR  INT            NULL,
          PBM_CAPTURADO_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_PBM_ANUNCIO FOREIGN KEY (PBM_ANUNCIO_ID) REFERENCES dbo.MARKETING_PUBLICIDAD_ANUNCIOS(PBA_ID)
        );
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingPublicidadMetricasSchema:', err.message);
  }
}

// Marketing: Contenido (calendario editorial multicanal: blog, newsletter, video, podcast, etc.)
async function ensureMarketingContenidoSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_CONTENIDO_TIPOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_CONTENIDO_TIPOS (
          CNT_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CNT_NOMBRE       NVARCHAR(150)  NOT NULL,
          CNT_DESCRIPCION  NVARCHAR(500)  NULL,
          CNT_ICONO        NVARCHAR(50)   NULL,
          CNT_COLOR        NVARCHAR(20)   NULL,
          CNT_ACTIVO       BIT            NOT NULL DEFAULT 1,
          CNT_ORDEN        INT            NOT NULL DEFAULT 0,
          CNT_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_MARKETING_CONTENIDO_TIPOS_ACTIVO ON dbo.MARKETING_CONTENIDO_TIPOS(CNT_ACTIVO, CNT_ORDEN);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingContenidoTiposSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_CONTENIDO_PIEZAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_CONTENIDO_PIEZAS (
          CNP_ID                INT IDENTITY(1,1) PRIMARY KEY,
          CNP_TIPO_ID           INT            NOT NULL,
          CNP_TITULO            NVARCHAR(200)  NOT NULL,
          CNP_BRIEF             NVARCHAR(MAX)  NULL,
          CNP_CONTENIDO         NVARCHAR(MAX)  NULL,
          CNP_AUTOR_ID          INT            NULL,
          CNP_REVISOR_ID        INT            NULL,
          CNP_ESTATUS           NVARCHAR(20)   NOT NULL DEFAULT 'idea',
          CNP_FECHA_PROGRAMADA  DATETIME       NULL,
          CNP_FECHA_PUBLICADO   DATETIME       NULL,
          CNP_CAMPANIA_ID       INT            NULL,
          CNP_POST_ID           INT            NULL,
          CNP_CREATED_BY        INT            NULL,
          CNP_CREATED_AT        DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CNP_TIPO FOREIGN KEY (CNP_TIPO_ID) REFERENCES dbo.MARKETING_CONTENIDO_TIPOS(CNT_ID),
          CONSTRAINT FK_CNP_CAMPANIA FOREIGN KEY (CNP_CAMPANIA_ID) REFERENCES dbo.MARKETING_CAMPANIAS(MC_ID),
          CONSTRAINT FK_CNP_POST FOREIGN KEY (CNP_POST_ID) REFERENCES dbo.MARKETING_REDES_POSTS(MRP_ID)
        );
        CREATE INDEX IX_MARKETING_CONTENIDO_PIEZAS_ESTATUS ON dbo.MARKETING_CONTENIDO_PIEZAS(CNP_ESTATUS, CNP_FECHA_PROGRAMADA);
        CREATE INDEX IX_MARKETING_CONTENIDO_PIEZAS_AUTOR ON dbo.MARKETING_CONTENIDO_PIEZAS(CNP_AUTOR_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingContenidoPiezasSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_CONTENIDO_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_CONTENIDO_ADJUNTOS (
          CNA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          CNA_PIEZA_ID         INT            NOT NULL,
          CNA_USUARIO_ID       INT            NULL,
          CNA_TIPO             NVARCHAR(20)   NOT NULL DEFAULT 'borrador',
          CNA_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          CNA_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          CNA_MIME             NVARCHAR(100)  NULL,
          CNA_TAMANIO          INT            NULL,
          CNA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CNA_PIEZA FOREIGN KEY (CNA_PIEZA_ID) REFERENCES dbo.MARKETING_CONTENIDO_PIEZAS(CNP_ID)
        );
        CREATE INDEX IX_MARKETING_CONTENIDO_ADJUNTOS_PIEZA ON dbo.MARKETING_CONTENIDO_ADJUNTOS(CNA_PIEZA_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingContenidoAdjuntosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_CONTENIDO_COMENTARIOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_CONTENIDO_COMENTARIOS (
          CNC_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CNC_PIEZA_ID     INT            NOT NULL,
          CNC_USUARIO_ID   INT            NULL,
          CNC_TEXTO        NVARCHAR(MAX)  NOT NULL,
          CNC_CREATED_AT   DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CNC_PIEZA FOREIGN KEY (CNC_PIEZA_ID) REFERENCES dbo.MARKETING_CONTENIDO_PIEZAS(CNP_ID)
        );
        CREATE INDEX IX_MARKETING_CONTENIDO_COMENTARIOS_PIEZA ON dbo.MARKETING_CONTENIDO_COMENTARIOS(CNC_PIEZA_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingContenidoComentariosSchema:', err.message);
  }
}

// Marketing: Imagen corporativa (repositorio de assets de marca: logos, paleta, tipografías, plantillas, manual)
async function ensureMarketingImagenCorporativaSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.MARKETING_IMAGEN_ASSETS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MARKETING_IMAGEN_ASSETS (
          MIA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          MIA_TITULO           NVARCHAR(200)  NOT NULL,
          MIA_CATEGORIA        NVARCHAR(30)   NOT NULL,
          MIA_DESCRIPCION      NVARCHAR(500)  NULL,
          MIA_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          MIA_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          MIA_MIME             NVARCHAR(100)  NULL,
          MIA_TAMANIO          INT            NULL,
          MIA_SUBIDO_POR       INT            NULL,
          MIA_ACTIVO           BIT            NOT NULL DEFAULT 1,
          MIA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_MARKETING_IMAGEN_ASSETS_CAT ON dbo.MARKETING_IMAGEN_ASSETS(MIA_ACTIVO, MIA_CATEGORIA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ MarketingImagenAssetsSchema:', err.message);
  }
}

// Legal y Cumplimiento: Contratos (con adjuntos y log de alertas de vencimiento)
async function ensureContratosSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CONTRATOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CONTRATOS (
          CT_ID                     INT IDENTITY(1,1) PRIMARY KEY,
          CT_TITULO                 NVARCHAR(200)  NOT NULL,
          CT_TIPO                   NVARCHAR(30)   NOT NULL,
          CT_CONTRAPARTE            NVARCHAR(200)  NULL,
          CT_FECHA_INICIO           DATE           NULL,
          CT_FECHA_VENCIMIENTO      DATE           NULL,
          CT_RENOVACION_AUTOMATICA  BIT            NOT NULL DEFAULT 0,
          CT_MONTO                  DECIMAL(18,2)  NULL,
          CT_MONEDA                 NVARCHAR(10)   NULL,
          CT_ESTATUS                NVARCHAR(20)   NOT NULL DEFAULT 'vigente',
          CT_RESPONSABLE_ID         INT            NULL,
          CT_NOTAS                  NVARCHAR(MAX)  NULL,
          CT_CREATED_BY             INT            NULL,
          CT_CREATED_AT             DATETIME       NOT NULL DEFAULT GETDATE(),
          CT_UPDATED_AT             DATETIME       NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_LEGALES_CONTRATOS_ESTATUS ON dbo.LEGALES_CONTRATOS(CT_ESTATUS, CT_FECHA_VENCIMIENTO);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesContratosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CONTRATOS_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CONTRATOS_ADJUNTOS (
          CTA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          CTA_CONTRATO_ID      INT            NOT NULL,
          CTA_USUARIO_ID       INT            NULL,
          CTA_TIPO             NVARCHAR(20)   NOT NULL DEFAULT 'firmado',
          CTA_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          CTA_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          CTA_MIME             NVARCHAR(100)  NULL,
          CTA_TAMANIO          INT            NULL,
          CTA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CTA_CONTRATO FOREIGN KEY (CTA_CONTRATO_ID) REFERENCES dbo.LEGALES_CONTRATOS(CT_ID)
        );
        CREATE INDEX IX_LEGALES_CONTRATOS_ADJUNTOS_CT ON dbo.LEGALES_CONTRATOS_ADJUNTOS(CTA_CONTRATO_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesContratosAdjuntosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CONTRATOS_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CONTRATOS_ALERTAS_LOG (
          CAL_ID           INT IDENTITY(1,1) PRIMARY KEY,
          CAL_CONTRATO_ID  INT      NOT NULL,
          CAL_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CAL_CONTRATO FOREIGN KEY (CAL_CONTRATO_ID) REFERENCES dbo.LEGALES_CONTRATOS(CT_ID)
        );
        CREATE INDEX IX_LEGALES_CONTRATOS_ALERTAS_LOG ON dbo.LEGALES_CONTRATOS_ALERTAS_LOG(CAL_CONTRATO_ID, CAL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesContratosAlertasLogSchema:', err.message);
  }
}

// Legal y Cumplimiento: Protección de datos (Registro de Actividades de Tratamiento / RAT)
async function ensureProteccionDatosSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_RAT_ACTIVIDADES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_RAT_ACTIVIDADES (
          RAT_ID                         INT IDENTITY(1,1) PRIMARY KEY,
          RAT_NOMBRE_ACTIVIDAD           NVARCHAR(200)  NOT NULL,
          RAT_AREA_DUENA                 NVARCHAR(150)  NULL,
          RAT_RESPONSABLE_TRATAMIENTO    NVARCHAR(200)  NOT NULL,
          RAT_RESPONSABLE_CONTACTO       NVARCHAR(200)  NULL,
          RAT_FINALIDAD                  NVARCHAR(MAX)  NOT NULL,
          RAT_BASE_LEGAL                 NVARCHAR(40)   NOT NULL,
          RAT_BASE_LEGAL_DETALLE         NVARCHAR(500)  NULL,
          RAT_CATEGORIAS_DATOS           NVARCHAR(MAX)  NOT NULL,
          RAT_CATEGORIAS_DATOS_SENSIBLES BIT            NOT NULL DEFAULT 0,
          RAT_CATEGORIAS_INTERESADOS     NVARCHAR(MAX)  NOT NULL,
          RAT_DESTINATARIOS              NVARCHAR(MAX)  NULL,
          RAT_PLAZO_CONSERVACION         NVARCHAR(300)  NOT NULL,
          RAT_MEDIDAS_SEGURIDAD_TECNICAS       NVARCHAR(MAX) NULL,
          RAT_MEDIDAS_SEGURIDAD_ORGANIZATIVAS  NVARCHAR(MAX) NULL,
          RAT_TRANSFERENCIA_INTERNACIONAL      BIT           NOT NULL DEFAULT 0,
          RAT_TRANSFERENCIA_PAIS_DESTINO       NVARCHAR(150) NULL,
          RAT_TRANSFERENCIA_GARANTIAS          NVARCHAR(MAX) NULL,
          RAT_ESTATUS                    NVARCHAR(20)   NOT NULL DEFAULT 'activa',
          RAT_FECHA_ULTIMA_REVISION      DATE           NULL,
          RAT_FRECUENCIA_REVISION_MESES  INT            NOT NULL DEFAULT 12,
          RAT_RESPONSABLE_REVISION_ID    INT            NULL,
          RAT_NOTAS                      NVARCHAR(MAX)  NULL,
          RAT_CREATED_BY                 INT            NULL,
          RAT_CREATED_AT                 DATETIME       NOT NULL DEFAULT GETDATE(),
          RAT_UPDATED_AT                 DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_RAT_BASE_LEGAL CHECK (RAT_BASE_LEGAL IN (
            'consentimiento', 'contrato', 'obligacion_legal', 'interes_legitimo',
            'interes_vital', 'funcion_publica', 'obligacion_laboral'
          )),
          CONSTRAINT CK_RAT_ESTATUS CHECK (RAT_ESTATUS IN ('activa','inactiva'))
        );
        CREATE INDEX IX_LEGALES_RAT_ESTATUS_REVISION ON dbo.LEGALES_RAT_ACTIVIDADES(RAT_ESTATUS, RAT_FECHA_ULTIMA_REVISION);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesRatActividadesSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_RAT_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_RAT_ADJUNTOS (
          RATA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          RATA_ACTIVIDAD_ID     INT            NOT NULL,
          RATA_USUARIO_ID       INT            NULL,
          RATA_TIPO             NVARCHAR(30)   NOT NULL DEFAULT 'otro',
          RATA_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          RATA_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          RATA_MIME             NVARCHAR(100)  NULL,
          RATA_TAMANIO          INT            NULL,
          RATA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_RATA_ACTIVIDAD FOREIGN KEY (RATA_ACTIVIDAD_ID) REFERENCES dbo.LEGALES_RAT_ACTIVIDADES(RAT_ID)
        );
        CREATE INDEX IX_LEGALES_RAT_ADJUNTOS_ACT ON dbo.LEGALES_RAT_ADJUNTOS(RATA_ACTIVIDAD_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesRatAdjuntosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_RAT_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_RAT_ALERTAS_LOG (
          RATL_ID           INT IDENTITY(1,1) PRIMARY KEY,
          RATL_ACTIVIDAD_ID INT      NOT NULL,
          RATL_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_RATL_ACTIVIDAD FOREIGN KEY (RATL_ACTIVIDAD_ID) REFERENCES dbo.LEGALES_RAT_ACTIVIDADES(RAT_ID)
        );
        CREATE INDEX IX_LEGALES_RAT_ALERTAS_LOG ON dbo.LEGALES_RAT_ALERTAS_LOG(RATL_ACTIVIDAD_ID, RATL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesRatAlertasLogSchema:', err.message);
  }
}

// Legal y Cumplimiento: Cumplimiento normativo (obligaciones, historial de cumplimientos, alertas)
async function ensureCumplimientoNormativoSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CUMPLIMIENTO_OBLIGACIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CUMPLIMIENTO_OBLIGACIONES (
          CN_ID                          INT IDENTITY(1,1) PRIMARY KEY,
          CN_NOMBRE                      NVARCHAR(200)  NOT NULL,
          CN_CATEGORIA                   NVARCHAR(30)   NOT NULL,
          CN_AUTORIDAD                   NVARCHAR(200)  NULL,
          CN_RESPONSABLE_ID              INT            NULL,
          CN_BASE_LEGAL                  NVARCHAR(500)  NULL,
          CN_DESCRIPCION                 NVARCHAR(MAX)  NULL,
          CN_FRECUENCIA                  NVARCHAR(20)   NOT NULL,
          CN_FECHA_LIMITE                DATE           NOT NULL,
          CN_ESTATUS                     NVARCHAR(20)   NOT NULL DEFAULT 'pendiente',
          CN_NIVEL_RIESGO                NVARCHAR(20)   NOT NULL DEFAULT 'medio',
          CN_CONSECUENCIA_INCUMPLIMIENTO NVARCHAR(MAX)  NULL,
          CN_NOTAS                       NVARCHAR(MAX)  NULL,
          CN_CREATED_BY                  INT            NULL,
          CN_CREATED_AT                  DATETIME       NOT NULL DEFAULT GETDATE(),
          CN_UPDATED_AT                  DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CN_CATEGORIA CHECK (CN_CATEGORIA IN (
            'fiscal','laboral','ambiental','proteccion_datos','salud_seguridad','financiero','comercial','otra'
          )),
          CONSTRAINT CK_CN_FRECUENCIA CHECK (CN_FRECUENCIA IN (
            'unica_vez','mensual','trimestral','semestral','anual'
          )),
          CONSTRAINT CK_CN_NIVEL_RIESGO CHECK (CN_NIVEL_RIESGO IN ('bajo','medio','alto','critico')),
          CONSTRAINT CK_CN_ESTATUS CHECK (CN_ESTATUS IN ('pendiente','cumplida'))
        );
        CREATE INDEX IX_LEGALES_CUMPLIMIENTO_ESTATUS ON dbo.LEGALES_CUMPLIMIENTO_OBLIGACIONES(CN_ESTATUS, CN_FECHA_LIMITE);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesCumplimientoObligacionesSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CUMPLIMIENTO_HISTORIAL', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CUMPLIMIENTO_HISTORIAL (
          CNH_ID                    INT IDENTITY(1,1) PRIMARY KEY,
          CNH_OBLIGACION_ID         INT           NOT NULL,
          CNH_FECHA_CUMPLIMIENTO    DATE          NOT NULL,
          CNH_FECHA_LIMITE_ORIGINAL DATE          NOT NULL,
          CNH_USUARIO_ID            INT           NULL,
          CNH_COMENTARIO            NVARCHAR(MAX) NULL,
          CNH_CREATED_AT            DATETIME      NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CNH_OBLIGACION FOREIGN KEY (CNH_OBLIGACION_ID) REFERENCES dbo.LEGALES_CUMPLIMIENTO_OBLIGACIONES(CN_ID)
        );
        CREATE INDEX IX_LEGALES_CUMPLIMIENTO_HISTORIAL ON dbo.LEGALES_CUMPLIMIENTO_HISTORIAL(CNH_OBLIGACION_ID, CNH_FECHA_CUMPLIMIENTO DESC);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesCumplimientoHistorialSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CUMPLIMIENTO_ADJUNTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CUMPLIMIENTO_ADJUNTOS (
          CNA_ID               INT IDENTITY(1,1) PRIMARY KEY,
          CNA_OBLIGACION_ID    INT            NOT NULL,
          CNA_USUARIO_ID       INT            NULL,
          CNA_TIPO             NVARCHAR(30)   NOT NULL DEFAULT 'evidencia',
          CNA_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          CNA_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          CNA_MIME             NVARCHAR(100)  NULL,
          CNA_TAMANIO          INT            NULL,
          CNA_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CNA_OBLIGACION FOREIGN KEY (CNA_OBLIGACION_ID) REFERENCES dbo.LEGALES_CUMPLIMIENTO_OBLIGACIONES(CN_ID)
        );
        CREATE INDEX IX_LEGALES_CUMPLIMIENTO_ADJUNTOS_OB ON dbo.LEGALES_CUMPLIMIENTO_ADJUNTOS(CNA_OBLIGACION_ID);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesCumplimientoAdjuntosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CUMPLIMIENTO_ALERTAS_LOG', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CUMPLIMIENTO_ALERTAS_LOG (
          CNL_ID            INT IDENTITY(1,1) PRIMARY KEY,
          CNL_OBLIGACION_ID INT      NOT NULL,
          CNL_FECHA         DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CNL_OBLIGACION FOREIGN KEY (CNL_OBLIGACION_ID) REFERENCES dbo.LEGALES_CUMPLIMIENTO_OBLIGACIONES(CN_ID)
        );
        CREATE INDEX IX_LEGALES_CUMPLIMIENTO_ALERTAS_LOG ON dbo.LEGALES_CUMPLIMIENTO_ALERTAS_LOG(CNL_OBLIGACION_ID, CNL_FECHA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesCumplimientoAlertasLogSchema:', err.message);
  }
}

// Legal y Cumplimiento: Control documental (documentos con historial de versiones)
async function ensureControlDocumentalSchema(pool) {
  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CTRLDOC_DOCUMENTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CTRLDOC_DOCUMENTOS (
          CD_ID              INT IDENTITY(1,1) PRIMARY KEY,
          CD_TITULO          NVARCHAR(255)  NOT NULL,
          CD_CATEGORIA       NVARCHAR(30)   NOT NULL,
          CD_DESCRIPCION     NVARCHAR(MAX)  NULL,
          CD_ESTADO_VIGENCIA NVARCHAR(20)   NOT NULL DEFAULT 'vigente',
          CD_RESPONSABLE_ID  INT            NULL,
          CD_CREATED_BY      INT            NULL,
          CD_CREATED_AT      DATETIME       NOT NULL DEFAULT GETDATE(),
          CD_UPDATED_AT      DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CD_CATEGORIA CHECK (CD_CATEGORIA IN (
            'politica','contrato_tipo','formato','plantilla','manual','otro'
          )),
          CONSTRAINT CK_CD_ESTADO_VIGENCIA CHECK (CD_ESTADO_VIGENCIA IN ('vigente','en_revision','obsoleto'))
        );
        CREATE INDEX IX_LEGALES_CTRLDOC_CATEGORIA ON dbo.LEGALES_CTRLDOC_DOCUMENTOS(CD_CATEGORIA);
        CREATE INDEX IX_LEGALES_CTRLDOC_ESTADO ON dbo.LEGALES_CTRLDOC_DOCUMENTOS(CD_ESTADO_VIGENCIA);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesCtrldocDocumentosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
      IF OBJECT_ID('dbo.LEGALES_CTRLDOC_VERSIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.LEGALES_CTRLDOC_VERSIONES (
          CDV_ID               INT IDENTITY(1,1) PRIMARY KEY,
          CDV_DOCUMENTO_ID     INT            NOT NULL,
          CDV_NUMERO_VERSION   INT            NOT NULL,
          CDV_NOMBRE_ARCHIVO   NVARCHAR(255)  NOT NULL,
          CDV_NOMBRE_ORIGINAL  NVARCHAR(255)  NOT NULL,
          CDV_MIME             NVARCHAR(150)  NULL,
          CDV_TAMANIO          INT            NULL,
          CDV_USUARIO_ID       INT            NULL,
          CDV_NOTA_CAMBIO      NVARCHAR(MAX)  NULL,
          CDV_CREATED_AT       DATETIME       NOT NULL DEFAULT GETDATE(),
          CONSTRAINT FK_CDV_DOCUMENTO FOREIGN KEY (CDV_DOCUMENTO_ID) REFERENCES dbo.LEGALES_CTRLDOC_DOCUMENTOS(CD_ID),
          CONSTRAINT UQ_CDV_DOC_VERSION UNIQUE (CDV_DOCUMENTO_ID, CDV_NUMERO_VERSION)
        );
        CREATE INDEX IX_LEGALES_CTRLDOC_VERSIONES_DOC ON dbo.LEGALES_CTRLDOC_VERSIONES(CDV_DOCUMENTO_ID, CDV_NUMERO_VERSION DESC);
      END
    `);
  } catch (err) {
    console.warn('⚠️ LegalesCtrldocVersionesSchema:', err.message);
  }
}

async function ensureAllSchemas(pool) {
  await ensureNeusUsuariosSchema(pool);
  await ensureEmpresasSchema(pool);
  await ensureEmpresasModulosSchema(pool);
  await ensureNoticiasSchema(pool);
  await ensureCommentsSchema(pool);
  await ensureReaccionesNoticiasSchema(pool);
  await ensureLayoutSchema(pool);
  await ensurePersonalizacionSchema(pool);
  await ensureReglamentoSchema(pool);
  await ensureCatalogosTiSchema(pool);
  await ensureTicketsSchema(pool);
  await ensureKbSchema(pool);
  await ensureProfileSchema(pool);
  await ensurePermisosSchema(pool);
  await ensureCalendarioSchema(pool);
  await ensureExpedientesSchema(pool);
  await ensureUiBackgroundSchema(pool);
  await ensurePlaylistSchema(pool);
  await ensureAsistenciaSchema(pool);
  await ensureAsistenciaActasSchema(pool);
  await ensureActivosGeneralesSchema(pool);
  await ensureContactoSchema(pool);
  await ensureExpedienteCompletoSchema(pool);
  await ensureAuditoriaSchema(pool);
  await ensureVacantesSchema(pool);
  await ensureCapacitacionSchema(pool);
  await ensureIncapacidadesSchema(pool);
  await ensureEvaluacionDesempenoSchema(pool);
  await ensureLivechatSchema(pool);
  await ensureLivechatCampanasSchema(pool);
  await ensureChatbotSchema(pool);
  await ensureMensajeriaSchema(pool);
  await ensureEncuestasSchema(pool);
  await ensureEncuestaSatisfaccionClienteSeed(pool);
  await ensureCrmSchema(pool);
  await ensureCrmSeguimientoSchema(pool);
  await ensureEmailMarketingSchema(pool);
  await ensureRolesSchema(pool);
  await ensurePerfilesSchema(pool);
  await ensureAccesosSchema(pool);
  await ensureAreasSchema(pool);
  await ensureCalidadSchema(pool);
  await ensureMarketingSchema(pool);
  await ensureLegalesMetaSchema(pool);
  await ensureFinanzasSchema(pool);
  await ensureVentasMetasSchema(pool);
  await ensureIncentivosSchema(pool);
  await ensureCallCenterSchema(pool);
  await ensureTiAreaSchema(pool);
  await ensureAtencionClienteSchema(pool);
  await ensureClienteSeguimientoSchema(pool);
  await ensureClienteIncidenciasSchema(pool);
  await ensureClienteFechasSchema(pool);
  await ensureRhAreaSchema(pool);
  await ensureDecisionesSchema(pool);
  await ensureReportesEjecutivosSchema(pool);
  await ensureSupervisionAlertasSchema(pool);
  await ensureMejoraContinuaSchema(pool);
  await ensureMarketingRedesSchema(pool);
  await ensureMarketingDisenoSchema(pool);
  await ensureMarketingPublicidadSchema(pool);
  await ensureMarketingContenidoSchema(pool);
  await ensureMarketingImagenCorporativaSchema(pool);
  await ensureContratosSchema(pool);
  await ensureProteccionDatosSchema(pool);
  await ensureCumplimientoNormativoSchema(pool);
  await ensureControlDocumentalSchema(pool);
  await ensureProductosServiciosSchema(pool);
  await ensureActivosSchema(pool);
  await ensureUsuarioTiemposSchema(pool);
}

// Expediente extendido (tabs "Persona", "Adicionales", "Familiares", "Formación", "Talento")
async function ensureExpedienteCompletoSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.EXPEDIENTE_PERSONA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_PERSONA (
    USUARIO_ID                      INT NOT NULL PRIMARY KEY,
    ALIAS                            NVARCHAR(100) NULL,
    GENERO                           NVARCHAR(30)  NULL,
    ESTADO_CIVIL                     NVARCHAR(30)  NULL,
    NACIONALIDAD                    NVARCHAR(100) NULL,
    FECHA_NACIMIENTO                DATE          NULL,
    PAIS_NACIMIENTO                 NVARCHAR(100) NULL,
    ESTADO_NACIMIENTO                NVARCHAR(100) NULL,
    CIUDAD_NACIMIENTO               NVARCHAR(100) NULL,
    PAIS_RESIDENCIA                 NVARCHAR(100) NULL,
    ESTADO_RESIDENCIA                NVARCHAR(100) NULL,
    CIUDAD_RESIDENCIA                NVARCHAR(100) NULL,
    NUM_SEGURO_SOCIAL                NVARCHAR(30)  NULL,
    RFC                              NVARCHAR(20)  NULL,
    ID_CIF                           NVARCHAR(30)  NULL,
    CURP                             NVARCHAR(20)  NULL,
    POLIZA_GASTOS_MEDICOS            NVARCHAR(50)  NULL,
    POLIZA_SEGURO_VIDA               NVARCHAR(50)  NULL,
    ACERCA_DE_MI                     NVARCHAR(MAX) NULL,
    LIBROS_FAVORITOS                 NVARCHAR(MAX) NULL,
    PELICULAS_FAVORITAS              NVARCHAR(MAX) NULL,
    MUSICA_FAVORITA                  NVARCHAR(MAX) NULL,
    SERIES_FAVORITAS                 NVARCHAR(MAX) NULL,
    ACTIVIDADES_FAVORITAS            NVARCHAR(MAX) NULL,
    TEMAS_INTERES                    NVARCHAR(MAX) NULL,
    PASTEL_FAVORITO                  NVARCHAR(100) NULL,
    BEBIDA_FAVORITA                  NVARCHAR(100) NULL,
    SUPERHEROE_FAVORITO              NVARCHAR(100) NULL,
    COLOR_FAVORITO                   NVARCHAR(100) NULL,
    AUTO_FAVORITO                    NVARCHAR(100) NULL,
    ANIMAL_FAVORITO                  NVARCHAR(100) NULL,
    DEPORTE_FAVORITO                 NVARCHAR(100) NULL,
    TALLA_PLAYERA                    NVARCHAR(10)  NULL,
    TALLA_PANTALON                   NVARCHAR(10)  NULL,
    TALLA_CALZADO                    NVARCHAR(10)  NULL,
    TIPO_SANGRE                      NVARCHAR(10)  NULL,
    ALERGIAS                        NVARCHAR(MAX) NULL,
    ENFERMEDADES_CRONICAS            NVARCHAR(MAX) NULL,
    MEDICAMENTOS                    NVARCHAR(MAX) NULL,
    BANCO_NOMBRE                     NVARCHAR(100) NULL,
    BANCO_SWIFT                      NVARCHAR(20)  NULL,
    BANCO_CUENTA                     NVARCHAR(30)  NULL,
    BANCO_CLABE                      NVARCHAR(20)  NULL,
    BANCO_NOMBRE_2                   NVARCHAR(100) NULL,
    BANCO_CUENTA_2                   NVARCHAR(30)  NULL,
    BANCO_CLABE_2                    NVARCHAR(20)  NULL,
    NUM_FONACOT                      NVARCHAR(30)  NULL,
    NUM_INFONAVIT                    NVARCHAR(30)  NULL,
    AFORE_INSTITUCION                NVARCHAR(100) NULL,
    AFORE_CUENTA                     NVARCHAR(30)  NULL,
    RIESGO_TRABAJO_INSTITUCION        NVARCHAR(100) NULL,
    RIESGO_TRABAJO_CUENTA             NVARCHAR(30)  NULL,
    ACTUALIZADO_EN                   DATETIME NOT NULL DEFAULT GETDATE()
  );
END

IF OBJECT_ID('dbo.EXPEDIENTE_FAMILIARES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_FAMILIARES (
    FAM_ID              INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID           INT NOT NULL,
    NOMBRE_COMPLETO       NVARCHAR(200) NULL,
    RELACION             NVARCHAR(50)  NULL,
    DEPENDIENTE_ECONOMICO BIT NOT NULL DEFAULT 0,
    BENEFICIARIO          BIT NOT NULL DEFAULT 0,
    CURP                  NVARCHAR(20)  NULL,
    FECHA_NACIMIENTO      DATE NULL,
    CONTACTO_EMERGENCIA   BIT NOT NULL DEFAULT 0,
    CORREO                NVARCHAR(200) NULL,
    TELEFONO_MOVIL        NVARCHAR(30)  NULL,
    TELEFONO_CASA         NVARCHAR(30)  NULL,
    FECHA_CREACION        DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_EXP_FAMILIARES_USUARIO ON dbo.EXPEDIENTE_FAMILIARES(USUARIO_ID);
END

IF OBJECT_ID('dbo.EXPEDIENTE_CERTIFICACIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_CERTIFICACIONES (
    CERT_ID          INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID        INT NOT NULL,
    NOMBRE            NVARCHAR(200) NULL,
    INSTITUCION       NVARCHAR(200) NULL,
    NUM_FOLIO         NVARCHAR(100) NULL,
    FECHA_EMISION     DATE NULL,
    FECHA_VENCIMIENTO DATE NULL,
    FECHA_CREACION    DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_EXP_CERT_USUARIO ON dbo.EXPEDIENTE_CERTIFICACIONES(USUARIO_ID);
END

IF OBJECT_ID('dbo.EXPEDIENTE_ACADEMICO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_ACADEMICO (
    ACAD_ID         INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID       INT NOT NULL,
    NIVEL            NVARCHAR(50)  NULL,
    INSTITUCION      NVARCHAR(200) NULL,
    CARRERA_TITULO   NVARCHAR(200) NULL,
    FECHA_INICIO     DATE NULL,
    FECHA_FIN        DATE NULL,
    EN_CURSO         BIT NOT NULL DEFAULT 0,
    FECHA_CREACION   DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_EXP_ACAD_USUARIO ON dbo.EXPEDIENTE_ACADEMICO(USUARIO_ID);
END

IF OBJECT_ID('dbo.EXPEDIENTE_EXPERIENCIA_LABORAL', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_EXPERIENCIA_LABORAL (
    EXP_ID          INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID       INT NOT NULL,
    EMPRESA          NVARCHAR(200) NULL,
    PUESTO           NVARCHAR(200) NULL,
    FECHA_INICIO     DATE NULL,
    FECHA_FIN        DATE NULL,
    ACTUAL           BIT NOT NULL DEFAULT 0,
    DESCRIPCION      NVARCHAR(MAX) NULL,
    FECHA_CREACION   DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_EXP_LABORAL_USUARIO ON dbo.EXPEDIENTE_EXPERIENCIA_LABORAL(USUARIO_ID);
END

IF OBJECT_ID('dbo.EXPEDIENTE_TALENTO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_TALENTO (
    TAL_ID         INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID      INT NOT NULL,
    CATEGORIA       NVARCHAR(30)  NOT NULL,
    NOMBRE          NVARCHAR(200) NULL,
    NIVEL           NVARCHAR(30)  NULL,
    FECHA_CREACION  DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_EXP_TALENTO_USUARIO ON dbo.EXPEDIENTE_TALENTO(USUARIO_ID, CATEGORIA);
END
    `);
    logger.info('✅ Esquema de expediente completo (Persona/Familiares/Formación/Talento) asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de expediente completo:', err.message);
  }
}

// Datos de contacto del expediente
async function ensureContactoSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.EXPEDIENTE_CONTACTO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EXPEDIENTE_CONTACTO (
    USUARIO_ID          INT           NOT NULL PRIMARY KEY,
    TEL_PRINCIPAL        NVARCHAR(30)  NULL,
    CORREO               NVARCHAR(200) NULL,
    DIR_CALLE_NUMERO     NVARCHAR(200) NULL,
    DIR_COLONIA          NVARCHAR(150) NULL,
    DIR_CODIGO_POSTAL    NVARCHAR(15)  NULL,
    DIR_CIUDAD           NVARCHAR(150) NULL,
    DIR_ESTADO           NVARCHAR(150) NULL,
    DIR_PAIS             NVARCHAR(150) NULL,
    TELEFONOS_ADICIONALES NVARCHAR(MAX) NULL,
    REDES_SOCIALES        NVARCHAR(MAX) NULL,
    ACTUALIZADO_EN       DATETIME      NOT NULL DEFAULT GETDATE()
  );
END

IF COL_LENGTH('dbo.EXPEDIENTE_CONTACTO','TELEFONOS_ADICIONALES') IS NULL
  ALTER TABLE dbo.EXPEDIENTE_CONTACTO ADD TELEFONOS_ADICIONALES NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.EXPEDIENTE_CONTACTO','REDES_SOCIALES') IS NULL
  ALTER TABLE dbo.EXPEDIENTE_CONTACTO ADD REDES_SOCIALES NVARCHAR(MAX) NULL;
    `);
    logger.info('✅ Esquema de contacto de expediente asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de contacto de expediente:', err.message);
  }
}

async function ensurePlaylistSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.MUSICA_PLAYLIST_PRIVADA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MUSICA_PLAYLIST_PRIVADA (
    PP_ID         INT IDENTITY(1,1) PRIMARY KEY,
    PP_USUARIO_ID INT           NOT NULL,
    PP_TITULO     NVARCHAR(200) NOT NULL,
    PP_ARTISTA    NVARCHAR(200) NOT NULL DEFAULT '',
    PP_URL        NVARCHAR(500) NOT NULL,
    PP_EMOJI      NVARCHAR(10)  NOT NULL DEFAULT N'🎵',
    PP_FILENAME   NVARCHAR(300) NULL,
    PP_FECHA      DATETIME      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_MUSICA_PRIVADA_USER ON dbo.MUSICA_PLAYLIST_PRIVADA(PP_USUARIO_ID);
END

IF COL_LENGTH('dbo.MUSICA_PLAYLIST_PRIVADA','PP_FILENAME') IS NULL
  ALTER TABLE dbo.MUSICA_PLAYLIST_PRIVADA ADD PP_FILENAME NVARCHAR(300) NULL;

IF OBJECT_ID('dbo.MUSICA_PLAYLIST_GENERAL', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MUSICA_PLAYLIST_GENERAL (
    PL_ID         INT IDENTITY(1,1) PRIMARY KEY,
    PL_USUARIO_ID INT           NOT NULL,
    PL_TITULO     NVARCHAR(200) NOT NULL,
    PL_ARTISTA    NVARCHAR(200) NOT NULL DEFAULT '',
    PL_URL        NVARCHAR(500) NOT NULL,
    PL_EMOJI      NVARCHAR(10)  NOT NULL DEFAULT N'🎵',
    PL_FECHA      DATETIME      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_MUSICA_GENERAL_USER ON dbo.MUSICA_PLAYLIST_GENERAL(PL_USUARIO_ID);
END
    `);
    logger.info('✅ Esquema de playlist de música asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de playlist:', err.message);
  }
}

// Módulo de Vacantes (vacantes públicas + postulantes con CV)
async function ensureVacantesSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.INTRANET_VACANTES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_VACANTES (
    VAC_ID                INT IDENTITY(1,1) PRIMARY KEY,
    VAC_TITULO             NVARCHAR(150)   NOT NULL,
    VAC_DESCRIPCION        NVARCHAR(MAX)   NOT NULL,
    VAC_REQUISITOS         NVARCHAR(MAX)   NULL,
    VAC_UBICACION          NVARCHAR(150)   NULL,
    VAC_MODALIDAD          NVARCHAR(20)    NULL,
    VAC_TIPO_CONTRATO      NVARCHAR(50)    NULL,
    VAC_SALARIO            NVARCHAR(100)   NULL,
    VAC_AUTOR_ID           INT             NULL,
    VAC_AUTOR_NOMBRE       NVARCHAR(150)   NULL,
    VAC_FECHA_CREACION     DATETIME        NOT NULL DEFAULT GETDATE(),
    VAC_FECHA_ACTUALIZACION DATETIME       NULL,
    VAC_FECHA_LIMITE       DATETIME        NULL,
    VAC_ACTIVO             BIT             NOT NULL DEFAULT (1),
    CONSTRAINT CK_VACANTES_MODALIDAD CHECK (VAC_MODALIDAD IS NULL OR VAC_MODALIDAD IN ('remoto','presencial','hibrido'))
  );
  CREATE INDEX IX_VACANTES_ACTIVO_FECHA ON dbo.INTRANET_VACANTES(VAC_ACTIVO, VAC_FECHA_CREACION DESC);
END
-- Caché de traducción al inglés para la página pública de Careers — mismo
-- patrón que KB_ARTICULOS.ART_*_EN (ver ensureKbSchema). NULL = sin traducir.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='INTRANET_VACANTES' AND COLUMN_NAME='VAC_TITULO_EN')
  ALTER TABLE dbo.INTRANET_VACANTES ADD VAC_TITULO_EN NVARCHAR(150) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='INTRANET_VACANTES' AND COLUMN_NAME='VAC_DESCRIPCION_EN')
  ALTER TABLE dbo.INTRANET_VACANTES ADD VAC_DESCRIPCION_EN NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='INTRANET_VACANTES' AND COLUMN_NAME='VAC_REQUISITOS_EN')
  ALTER TABLE dbo.INTRANET_VACANTES ADD VAC_REQUISITOS_EN NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='INTRANET_VACANTES' AND COLUMN_NAME='VAC_UBICACION_EN')
  ALTER TABLE dbo.INTRANET_VACANTES ADD VAC_UBICACION_EN NVARCHAR(150) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='INTRANET_VACANTES' AND COLUMN_NAME='VAC_TRADUCIDO_EN')
  ALTER TABLE dbo.INTRANET_VACANTES ADD VAC_TRADUCIDO_EN DATETIME NULL;

IF OBJECT_ID('dbo.INTRANET_VACANTES_POSTULANTES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_VACANTES_POSTULANTES (
    POST_ID          INT IDENTITY(1,1) PRIMARY KEY,
    POST_VACANTE_ID  INT             NOT NULL,
    POST_NOMBRE      NVARCHAR(150)   NOT NULL,
    POST_EMAIL       NVARCHAR(150)   NOT NULL,
    POST_TELEFONO    NVARCHAR(30)    NULL,
    POST_CV_URL      NVARCHAR(500)   NOT NULL,
    POST_MENSAJE     NVARCHAR(MAX)   NULL,
    POST_FECHA       DATETIME        NOT NULL DEFAULT GETDATE(),
    POST_ESTADO      NVARCHAR(20)    NOT NULL DEFAULT ('nuevo'),
    CONSTRAINT FK_POSTULANTES_VACANTE FOREIGN KEY (POST_VACANTE_ID)
      REFERENCES dbo.INTRANET_VACANTES(VAC_ID) ON DELETE CASCADE,
    CONSTRAINT CK_POSTULANTES_ESTADO CHECK (POST_ESTADO IN ('nuevo','revisado','descartado','contactado'))
  );
  CREATE INDEX IX_POSTULANTES_VACANTE ON dbo.INTRANET_VACANTES_POSTULANTES(POST_VACANTE_ID, POST_FECHA DESC);
END

`);

    // Pipeline de reclutamiento (kanban por etapas, tipo Odoo) — columnas nuevas,
    // coexisten con POST_ESTADO (no se toca ni se borra, /vacantes sigue usándola).
    // Se ejecutan en batches separados: SQL Server compila el batch entero antes
    // de correrlo, así que un UPDATE que referencia una columna agregada en el
    // mismo batch falla con "Invalid column name" si no se separan con GO/batch.
    await pool.request().batch(`
IF COL_LENGTH('dbo.INTRANET_VACANTES_POSTULANTES', 'POST_ETAPA') IS NULL
  ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES ADD POST_ETAPA NVARCHAR(30) NULL;

IF COL_LENGTH('dbo.INTRANET_VACANTES_POSTULANTES', 'POST_ORDEN') IS NULL
  ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES ADD POST_ORDEN INT NOT NULL DEFAULT (0);
`);

    await pool.request().batch(`
-- Migración idempotente: solo filas que aún no tienen etapa asignada.
UPDATE dbo.INTRANET_VACANTES_POSTULANTES
SET POST_ETAPA = CASE POST_ESTADO
    WHEN 'nuevo'      THEN 'nuevo'
    WHEN 'revisado'   THEN 'revision_cv'
    WHEN 'contactado' THEN 'entrevista'
    WHEN 'descartado' THEN 'descartado'
    ELSE 'nuevo'
  END
WHERE POST_ETAPA IS NULL;
`);

    await pool.request().batch(`
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.INTRANET_VACANTES_POSTULANTES') AND name = 'POST_ETAPA' AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES ADD CONSTRAINT DF_POSTULANTES_ETAPA DEFAULT ('nuevo') FOR POST_ETAPA;
  ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES ALTER COLUMN POST_ETAPA NVARCHAR(30) NOT NULL;
END
`);

    await pool.request().batch(`
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_POSTULANTES_ETAPA')
  ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES DROP CONSTRAINT CK_POSTULANTES_ETAPA;
ALTER TABLE dbo.INTRANET_VACANTES_POSTULANTES WITH CHECK
  ADD CONSTRAINT CK_POSTULANTES_ETAPA CHECK (POST_ETAPA IN ('nuevo','revision_cv','entrevista','oferta','contratado','descartado'));

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_POSTULANTES_ETAPA' AND object_id = OBJECT_ID('dbo.INTRANET_VACANTES_POSTULANTES')
)
  CREATE INDEX IX_POSTULANTES_ETAPA ON dbo.INTRANET_VACANTES_POSTULANTES(POST_ETAPA, POST_ORDEN);
`);

    logger.info('✅ Esquema de vacantes asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de vacantes:', err.message);
  }
}

// Módulo de Capacitación (catálogo de cursos, materiales adjuntos e inscripciones con constancia).
async function ensureCapacitacionSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.CAP_CURSOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_CURSOS (
    CUR_ID                INT IDENTITY(1,1) PRIMARY KEY,
    CUR_TITULO             NVARCHAR(150)   NOT NULL,
    CUR_DESCRIPCION        NVARCHAR(MAX)   NOT NULL,
    CUR_CATEGORIA          NVARCHAR(50)    NULL,
    CUR_DURACION_MIN       INT             NULL,
    CUR_AUTOR_ID           INT             NULL,
    CUR_AUTOR_NOMBRE       NVARCHAR(150)   NULL,
    CUR_FECHA_CREACION     DATETIME        NOT NULL DEFAULT GETDATE(),
    CUR_FECHA_ACTUALIZACION DATETIME       NULL,
    CUR_ACTIVO             BIT             NOT NULL DEFAULT (1)
  );
  CREATE INDEX IX_CAP_CURSOS_ACTIVO_FECHA ON dbo.CAP_CURSOS(CUR_ACTIVO, CUR_FECHA_CREACION DESC);
END

IF OBJECT_ID('dbo.CAP_CURSOS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.CAP_CURSOS') AND name='CUR_TIMER_CORRIENDO')
BEGIN
  ALTER TABLE dbo.CAP_CURSOS ADD CUR_TIMER_CORRIENDO BIT NOT NULL CONSTRAINT DF_CAP_CURSOS_TIMER_CORRIENDO DEFAULT (0);
END
IF OBJECT_ID('dbo.CAP_CURSOS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.CAP_CURSOS') AND name='CUR_TIMER_INICIO')
BEGIN
  ALTER TABLE dbo.CAP_CURSOS ADD CUR_TIMER_INICIO DATETIME NULL;
END
IF OBJECT_ID('dbo.CAP_CURSOS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.CAP_CURSOS') AND name='CUR_TIMER_SEGUNDOS_ACUM')
BEGIN
  ALTER TABLE dbo.CAP_CURSOS ADD CUR_TIMER_SEGUNDOS_ACUM BIGINT NOT NULL CONSTRAINT DF_CAP_CURSOS_TIMER_SEG DEFAULT (0);
END

IF OBJECT_ID('dbo.CAP_MATERIALES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_MATERIALES (
    MAT_ID          INT IDENTITY(1,1) PRIMARY KEY,
    MAT_CURSO_ID    INT             NOT NULL,
    MAT_NOMBRE      NVARCHAR(255)   NOT NULL,
    MAT_URL         NVARCHAR(500)   NOT NULL,
    MAT_TIPO        NVARCHAR(20)    NULL,
    MAT_FECHA       DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_CAP_MATERIALES_CURSO FOREIGN KEY (MAT_CURSO_ID)
      REFERENCES dbo.CAP_CURSOS(CUR_ID) ON DELETE CASCADE
  );
  CREATE INDEX IX_CAP_MATERIALES_CURSO ON dbo.CAP_MATERIALES(MAT_CURSO_ID);
END

IF OBJECT_ID('dbo.CAP_INSCRIPCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_INSCRIPCIONES (
    INSC_ID               INT IDENTITY(1,1) PRIMARY KEY,
    INSC_CURSO_ID         INT             NOT NULL,
    INSC_USUARIO_ID       INT             NOT NULL,
    INSC_ESTADO           NVARCHAR(20)    NOT NULL DEFAULT ('inscrito'),
    INSC_FECHA_INSCRIPCION DATETIME       NOT NULL DEFAULT GETDATE(),
    INSC_FECHA_COMPLETADO DATETIME        NULL,
    CONSTRAINT FK_CAP_INSCRIPCIONES_CURSO FOREIGN KEY (INSC_CURSO_ID)
      REFERENCES dbo.CAP_CURSOS(CUR_ID) ON DELETE CASCADE,
    CONSTRAINT CK_CAP_INSCRIPCIONES_ESTADO CHECK (INSC_ESTADO IN ('inscrito','completado')),
    CONSTRAINT UQ_CAP_INSCRIPCIONES_CURSO_USUARIO UNIQUE (INSC_CURSO_ID, INSC_USUARIO_ID)
  );
  CREATE INDEX IX_CAP_INSCRIPCIONES_USUARIO ON dbo.CAP_INSCRIPCIONES(INSC_USUARIO_ID, INSC_ESTADO);
END
`);
    logger.info('✅ Esquema de capacitación asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de capacitación:', err.message);
  }

  // Exámenes de curso — plantilla propia de Capacitación (no reusa las tablas
  // de ENCUESTAS: esas no están versionadas en este repo y mezclar dominios de
  // calificación con las de satisfacción complicaría ambos). Mismo mecanismo de
  // acceso público/privado que Encuestas (TIPO_ACCESO + SLUG_PUBLICO), más lo
  // que un examen sí necesita y una encuesta no: opción correcta, puntaje por
  // pregunta y calificación/aprobado por intento.
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.CAP_EXAMENES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_EXAMENES (
    EXA_ID                INT IDENTITY(1,1) PRIMARY KEY,
    EXA_CURSO_ID           INT             NOT NULL,
    EXA_TITULO             NVARCHAR(150)   NOT NULL,
    EXA_DESCRIPCION        NVARCHAR(MAX)   NULL,
    EXA_TIPO_ACCESO        NVARCHAR(20)    NOT NULL DEFAULT ('privado'),
    EXA_SLUG_PUBLICO       NVARCHAR(50)    NULL,
    EXA_PUNTAJE_MINIMO     INT             NOT NULL DEFAULT (70),
    EXA_CREADO_POR         INT             NULL,
    EXA_FECHA_CREACION     DATETIME        NOT NULL DEFAULT GETDATE(),
    EXA_ACTIVO             BIT             NOT NULL DEFAULT (1),
    CONSTRAINT FK_CAP_EXAMENES_CURSO FOREIGN KEY (EXA_CURSO_ID)
      REFERENCES dbo.CAP_CURSOS(CUR_ID) ON DELETE CASCADE,
    CONSTRAINT CK_CAP_EXAMENES_ACCESO CHECK (EXA_TIPO_ACCESO IN ('privado','publico'))
  );
  CREATE INDEX IX_CAP_EXAMENES_CURSO ON dbo.CAP_EXAMENES(EXA_CURSO_ID);
  CREATE UNIQUE INDEX UX_CAP_EXAMENES_SLUG ON dbo.CAP_EXAMENES(EXA_SLUG_PUBLICO) WHERE EXA_SLUG_PUBLICO IS NOT NULL;
END

IF OBJECT_ID('dbo.CAP_EXAMEN_PREGUNTAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_EXAMEN_PREGUNTAS (
    EPR_ID          INT IDENTITY(1,1) PRIMARY KEY,
    EPR_EXAMEN_ID   INT             NOT NULL,
    EPR_TEXTO       NVARCHAR(MAX)   NOT NULL,
    EPR_TIPO        NVARCHAR(20)    NOT NULL DEFAULT ('abierta'),
    EPR_PUNTOS      INT             NOT NULL DEFAULT (1),
    EPR_ORDEN       INT             NOT NULL DEFAULT (1),
    CONSTRAINT FK_CAP_EXA_PREG_EXAMEN FOREIGN KEY (EPR_EXAMEN_ID)
      REFERENCES dbo.CAP_EXAMENES(EXA_ID) ON DELETE CASCADE,
    CONSTRAINT CK_CAP_EXA_PREG_TIPO CHECK (EPR_TIPO IN ('abierta','cerrada'))
  );
  CREATE INDEX IX_CAP_EXA_PREG_EXAMEN ON dbo.CAP_EXAMEN_PREGUNTAS(EPR_EXAMEN_ID, EPR_ORDEN);
END

IF OBJECT_ID('dbo.CAP_EXAMEN_OPCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_EXAMEN_OPCIONES (
    EOP_ID          INT IDENTITY(1,1) PRIMARY KEY,
    EOP_PREGUNTA_ID INT             NOT NULL,
    EOP_TEXTO       NVARCHAR(500)   NOT NULL,
    EOP_ES_CORRECTA BIT             NOT NULL DEFAULT (0),
    EOP_ORDEN       INT             NOT NULL DEFAULT (1),
    CONSTRAINT FK_CAP_EXA_OPC_PREGUNTA FOREIGN KEY (EOP_PREGUNTA_ID)
      REFERENCES dbo.CAP_EXAMEN_PREGUNTAS(EPR_ID) ON DELETE CASCADE
  );
  CREATE INDEX IX_CAP_EXA_OPC_PREGUNTA ON dbo.CAP_EXAMEN_OPCIONES(EOP_PREGUNTA_ID, EOP_ORDEN);
END

IF OBJECT_ID('dbo.CAP_EXAMEN_RESPONDIENTES_PUBLICOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_EXAMEN_RESPONDIENTES_PUBLICOS (
    ERP_ID       INT IDENTITY(1,1) PRIMARY KEY,
    ERP_EXAMEN_ID INT            NOT NULL,
    ERP_NOMBRE   NVARCHAR(150)   NOT NULL,
    ERP_EMAIL    NVARCHAR(150)   NOT NULL,
    ERP_FECHA    DATETIME        NOT NULL DEFAULT GETDATE(),
    ERP_IP       NVARCHAR(50)    NULL,
    CONSTRAINT FK_CAP_EXA_RESP_PUB_EXAMEN FOREIGN KEY (ERP_EXAMEN_ID)
      REFERENCES dbo.CAP_EXAMENES(EXA_ID) ON DELETE CASCADE
  );
  CREATE INDEX IX_CAP_EXA_RESP_PUB_EXAMEN ON dbo.CAP_EXAMEN_RESPONDIENTES_PUBLICOS(ERP_EXAMEN_ID);
END

IF OBJECT_ID('dbo.CAP_EXAMEN_INTENTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_EXAMEN_INTENTOS (
    INT_ID                 INT IDENTITY(1,1) PRIMARY KEY,
    INT_EXAMEN_ID          INT             NOT NULL,
    INT_USUARIO_ID         INT             NULL,
    INT_RESPONDIENTE_PUB_ID INT            NULL,
    INT_PUNTAJE_OBTENIDO   INT             NOT NULL DEFAULT (0),
    INT_PUNTAJE_TOTAL      INT             NOT NULL DEFAULT (0),
    INT_PORCENTAJE         DECIMAL(5,2)    NOT NULL DEFAULT (0),
    INT_APROBADO           BIT             NOT NULL DEFAULT (0),
    INT_FECHA              DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_CAP_EXA_INTENTO_EXAMEN FOREIGN KEY (INT_EXAMEN_ID)
      REFERENCES dbo.CAP_EXAMENES(EXA_ID) ON DELETE CASCADE,
    CONSTRAINT FK_CAP_EXA_INTENTO_RESP_PUB FOREIGN KEY (INT_RESPONDIENTE_PUB_ID)
      REFERENCES dbo.CAP_EXAMEN_RESPONDIENTES_PUBLICOS(ERP_ID)
  );
  CREATE INDEX IX_CAP_EXA_INTENTO_EXAMEN ON dbo.CAP_EXAMEN_INTENTOS(INT_EXAMEN_ID);
  CREATE INDEX IX_CAP_EXA_INTENTO_USUARIO ON dbo.CAP_EXAMEN_INTENTOS(INT_USUARIO_ID);
END

IF OBJECT_ID('dbo.CAP_EXAMEN_RESPUESTAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CAP_EXAMEN_RESPUESTAS (
    ERE_ID              INT IDENTITY(1,1) PRIMARY KEY,
    ERE_INTENTO_ID       INT             NOT NULL,
    ERE_PREGUNTA_ID      INT             NOT NULL,
    ERE_OPCION_ID        INT             NULL,
    ERE_RESPUESTA_TEXTO  NVARCHAR(MAX)   NULL,
    ERE_ES_CORRECTA      BIT             NULL,
    CONSTRAINT FK_CAP_EXA_RESPUESTA_INTENTO FOREIGN KEY (ERE_INTENTO_ID)
      REFERENCES dbo.CAP_EXAMEN_INTENTOS(INT_ID) ON DELETE CASCADE,
    CONSTRAINT FK_CAP_EXA_RESPUESTA_PREGUNTA FOREIGN KEY (ERE_PREGUNTA_ID)
      REFERENCES dbo.CAP_EXAMEN_PREGUNTAS(EPR_ID),
    CONSTRAINT FK_CAP_EXA_RESPUESTA_OPCION FOREIGN KEY (ERE_OPCION_ID)
      REFERENCES dbo.CAP_EXAMEN_OPCIONES(EOP_ID)
  );
  CREATE INDEX IX_CAP_EXA_RESPUESTA_INTENTO ON dbo.CAP_EXAMEN_RESPUESTAS(ERE_INTENTO_ID);
END
`);
    logger.info('✅ Esquema de exámenes de capacitación asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de exámenes de capacitación:', err.message);
  }
}

// Módulo de Incapacidades (solicitud médica del empleado + comprobante cifrado + aprobación de RH).
async function ensureIncapacidadesSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.INCAPACIDADES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INCAPACIDADES (
    INC_ID              INT IDENTITY(1,1) PRIMARY KEY,
    INC_USUARIO_ID       SMALLINT        NOT NULL,
    INC_TIPO             NVARCHAR(30)    NOT NULL,
    INC_MOTIVO           NVARCHAR(MAX)   NULL,
    INC_FECHA_INICIO     DATE            NOT NULL,
    INC_FECHA_FIN        DATE            NOT NULL,
    INC_DIAS             INT             NOT NULL,
    INC_ESTADO           NVARCHAR(20)    NOT NULL DEFAULT ('pendiente'),
    INC_COMENTARIO_ADMIN NVARCHAR(500)   NULL,
    INC_REVISADO_POR     INT             NULL,
    INC_FECHA_SOLICITUD  DATETIME        NOT NULL DEFAULT GETDATE(),
    INC_FECHA_RESPUESTA  DATETIME        NULL,
    CONSTRAINT CK_INCAPACIDADES_TIPO CHECK (INC_TIPO IN ('enfermedad_general','maternidad','riesgo_trabajo','otro')),
    CONSTRAINT CK_INCAPACIDADES_ESTADO CHECK (INC_ESTADO IN ('pendiente','aprobada','rechazada'))
  );
  BEGIN TRY
    ALTER TABLE dbo.INCAPACIDADES WITH CHECK
      ADD CONSTRAINT FK_INCAPACIDADES_USUARIO FOREIGN KEY (INC_USUARIO_ID)
      REFERENCES dbo.NEUS_USUARIOS(NEUS_ID) ON DELETE CASCADE;
  END TRY
  BEGIN CATCH
    -- Si el tipo de NEUS_ID no coincide en este entorno, seguir sin el FK (igual patrón que NEUS_EXPEDIENTE_DOCUMENTOS).
  END CATCH
  CREATE INDEX IX_INCAPACIDADES_USUARIO ON dbo.INCAPACIDADES(INC_USUARIO_ID, INC_FECHA_SOLICITUD DESC);
  CREATE INDEX IX_INCAPACIDADES_ESTADO ON dbo.INCAPACIDADES(INC_ESTADO);
END

IF OBJECT_ID('dbo.INCAPACIDADES_DOCUMENTOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INCAPACIDADES_DOCUMENTOS (
    IDOC_ID              INT IDENTITY(1,1) PRIMARY KEY,
    IDOC_INCAPACIDAD_ID  INT             NOT NULL,
    IDOC_NOMBRE_ORIGINAL NVARCHAR(255)   NOT NULL,
    IDOC_MIME            NVARCHAR(100)   NULL,
    IDOC_TAMANO_BYTES    BIGINT          NOT NULL,
    IDOC_SHA256          CHAR(64)        NOT NULL,
    IDOC_CIPHER          NVARCHAR(30)    NOT NULL DEFAULT ('aes-256-gcm'),
    IDOC_IV              VARBINARY(12)   NOT NULL,
    IDOC_TAG             VARBINARY(16)   NOT NULL,
    IDOC_KEY_ID          NVARCHAR(50)    NULL,
    IDOC_DATA            VARBINARY(MAX)  NOT NULL,
    IDOC_FECHA_SUBIDA    DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_INCAPACIDADES_DOC FOREIGN KEY (IDOC_INCAPACIDAD_ID)
      REFERENCES dbo.INCAPACIDADES(INC_ID) ON DELETE CASCADE
  );
  CREATE INDEX IX_INCAPACIDADES_DOC_INC ON dbo.INCAPACIDADES_DOCUMENTOS(IDOC_INCAPACIDAD_ID);
END
`);
    logger.info('✅ Esquema de incapacidades asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de incapacidades:', err.message);
  }
}

// Módulo de Evaluación de Desempeño (ciclos periódicos, criterios fijos 1-5,
// metas personalizadas por empleado, retroalimentación y plan de mejora).
async function ensureEvaluacionDesempenoSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.EVAL_DESEMPENO_CICLOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EVAL_DESEMPENO_CICLOS (
    CICLO_ID           INT IDENTITY(1,1) PRIMARY KEY,
    CICLO_NOMBRE       NVARCHAR(100)   NOT NULL,
    CICLO_FECHA_INICIO DATE            NOT NULL,
    CICLO_FECHA_FIN    DATE            NOT NULL,
    CICLO_ACTIVO       BIT             NOT NULL DEFAULT (1),
    CICLO_CREADO_POR   INT             NULL,
    CICLO_FECHA_CREACION DATETIME      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_EVAL_CICLOS_ACTIVO ON dbo.EVAL_DESEMPENO_CICLOS(CICLO_ACTIVO, CICLO_FECHA_INICIO DESC);
END

IF OBJECT_ID('dbo.EVAL_DESEMPENO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EVAL_DESEMPENO (
    EVAL_ID              INT IDENTITY(1,1) PRIMARY KEY,
    EVAL_CICLO_ID        INT             NOT NULL,
    EVAL_EMPLEADO_ID     SMALLINT        NOT NULL,
    EVAL_EVALUADOR_ID    SMALLINT        NULL,
    EVAL_EVALUADOR_NOMBRE NVARCHAR(150)  NULL,
    EVAL_ESTADO          NVARCHAR(20)    NOT NULL DEFAULT ('borrador'),
    EVAL_CALIFICACION    DECIMAL(5,2)    NULL,
    EVAL_FORTALEZAS      NVARCHAR(MAX)   NULL,
    EVAL_AREAS_MEJORA    NVARCHAR(MAX)   NULL,
    EVAL_PLAN_ACCION     NVARCHAR(MAX)   NULL,
    EVAL_FECHA_CREACION  DATETIME        NOT NULL DEFAULT GETDATE(),
    EVAL_FECHA_FINALIZADA DATETIME       NULL,
    CONSTRAINT FK_EVAL_DESEMPENO_CICLO FOREIGN KEY (EVAL_CICLO_ID)
      REFERENCES dbo.EVAL_DESEMPENO_CICLOS(CICLO_ID) ON DELETE CASCADE,
    CONSTRAINT CK_EVAL_DESEMPENO_ESTADO CHECK (EVAL_ESTADO IN ('borrador','finalizada')),
    CONSTRAINT UQ_EVAL_DESEMPENO_CICLO_EMPLEADO UNIQUE (EVAL_CICLO_ID, EVAL_EMPLEADO_ID)
  );
  BEGIN TRY
    ALTER TABLE dbo.EVAL_DESEMPENO WITH CHECK
      ADD CONSTRAINT FK_EVAL_DESEMPENO_EMPLEADO FOREIGN KEY (EVAL_EMPLEADO_ID)
      REFERENCES dbo.NEUS_USUARIOS(NEUS_ID) ON DELETE CASCADE;
  END TRY
  BEGIN CATCH
  END CATCH
  CREATE INDEX IX_EVAL_DESEMPENO_EMPLEADO ON dbo.EVAL_DESEMPENO(EVAL_EMPLEADO_ID, EVAL_FECHA_CREACION DESC);
  CREATE INDEX IX_EVAL_DESEMPENO_CICLO ON dbo.EVAL_DESEMPENO(EVAL_CICLO_ID);
END

IF OBJECT_ID('dbo.EVAL_DESEMPENO_CRITERIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EVAL_DESEMPENO_CRITERIOS (
    EC_ID          INT IDENTITY(1,1) PRIMARY KEY,
    EC_EVAL_ID     INT             NOT NULL,
    EC_CRITERIO    NVARCHAR(50)    NOT NULL,
    EC_CALIFICACION INT            NOT NULL,
    CONSTRAINT FK_EVAL_CRITERIOS_EVAL FOREIGN KEY (EC_EVAL_ID)
      REFERENCES dbo.EVAL_DESEMPENO(EVAL_ID) ON DELETE CASCADE,
    CONSTRAINT CK_EVAL_CRITERIOS_CALIF CHECK (EC_CALIFICACION BETWEEN 1 AND 5),
    CONSTRAINT UQ_EVAL_CRITERIOS UNIQUE (EC_EVAL_ID, EC_CRITERIO)
  );
  CREATE INDEX IX_EVAL_CRITERIOS_EVAL ON dbo.EVAL_DESEMPENO_CRITERIOS(EC_EVAL_ID);
END

IF OBJECT_ID('dbo.EVAL_DESEMPENO_METAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EVAL_DESEMPENO_METAS (
    EM_ID           INT IDENTITY(1,1) PRIMARY KEY,
    EM_EVAL_ID      INT             NOT NULL,
    EM_DESCRIPCION  NVARCHAR(300)   NOT NULL,
    EM_CUMPLIMIENTO INT             NULL,
    CONSTRAINT FK_EVAL_METAS_EVAL FOREIGN KEY (EM_EVAL_ID)
      REFERENCES dbo.EVAL_DESEMPENO(EVAL_ID) ON DELETE CASCADE,
    CONSTRAINT CK_EVAL_METAS_CUMPLIMIENTO CHECK (EM_CUMPLIMIENTO IS NULL OR EM_CUMPLIMIENTO BETWEEN 0 AND 100)
  );
  CREATE INDEX IX_EVAL_METAS_EVAL ON dbo.EVAL_DESEMPENO_METAS(EM_EVAL_ID);
END
`);
    logger.info('✅ Esquema de evaluación de desempeño asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de evaluación de desempeño:', err.message);
  }
}

// Diccionario de respuestas del chatbot de la página pública (widget) + panel de edición interno.
async function ensureChatbotSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.CHATBOT_RESPUESTAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CHATBOT_RESPUESTAS (
    RESP_PK             INT IDENTITY(1,1) PRIMARY KEY,
    RESP_ID              NVARCHAR(80)    NOT NULL,
    RESP_KEYWORDS         NVARCHAR(MAX)   NOT NULL,
    RESP_TEXTO_ES         NVARCHAR(MAX)   NOT NULL,
    RESP_TEXTO_EN         NVARCHAR(MAX)   NULL,
    RESP_BOTONES          NVARCHAR(MAX)   NULL,
    RESP_SENAL_INTERES    BIT             NOT NULL DEFAULT (0),
    RESP_ORDEN            INT             NOT NULL DEFAULT (0),
    RESP_AUTOR_ID         INT             NULL,
    RESP_AUTOR_NOMBRE     NVARCHAR(150)   NULL,
    RESP_FECHA_CREACION   DATETIME        NOT NULL DEFAULT GETDATE(),
    RESP_FECHA_ACTUALIZACION DATETIME     NULL,
    RESP_ACTIVA           BIT             NOT NULL DEFAULT (1),
    CONSTRAINT UQ_CHATBOT_RESPUESTAS_ID UNIQUE (RESP_ID)
  );
  CREATE INDEX IX_CHATBOT_RESPUESTAS_ACTIVA ON dbo.CHATBOT_RESPUESTAS(RESP_ACTIVA, RESP_ORDEN);
END

-- Árbol de decisión básico (sin IA/NLU): nodos de pregunta con opciones que
-- llevan a otro nodo, o a una acción terminal (resolver, escalar a chat, crear ticket).
IF OBJECT_ID('dbo.CHATBOT_NODOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CHATBOT_NODOS (
    NODO_ID INT IDENTITY(1,1) PRIMARY KEY,
    NODO_CODIGO NVARCHAR(60) NOT NULL,
    NODO_TEXTO NVARCHAR(MAX) NOT NULL,
    NODO_TIPO NVARCHAR(20) NOT NULL DEFAULT 'pregunta',
    NODO_CATEGORIA_ID INT NULL FOREIGN KEY REFERENCES dbo.TICKET_CATEGORIAS(CAT_ID),
    NODO_ACTIVO BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_CHATBOT_NODOS_CODIGO UNIQUE (NODO_CODIGO)
  );
END

IF OBJECT_ID('dbo.CHATBOT_NODO_OPCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CHATBOT_NODO_OPCIONES (
    OPC_ID INT IDENTITY(1,1) PRIMARY KEY,
    OPC_NODO_ID INT NOT NULL FOREIGN KEY REFERENCES dbo.CHATBOT_NODOS(NODO_ID),
    OPC_TEXTO_BOTON NVARCHAR(150) NOT NULL,
    OPC_NODO_DESTINO_ID INT NULL FOREIGN KEY REFERENCES dbo.CHATBOT_NODOS(NODO_ID),
    OPC_ORDEN INT NOT NULL DEFAULT 0
  );
  CREATE INDEX IX_CHATBOT_OPC_NODO ON dbo.CHATBOT_NODO_OPCIONES(OPC_NODO_ID);
END

IF OBJECT_ID('dbo.CHATBOT_SESIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CHATBOT_SESIONES (
    SES_ID INT IDENTITY(1,1) PRIMARY KEY,
    SES_TOKEN UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    SES_USUARIO_ID INT NULL,
    SES_NODO_ACTUAL_ID INT NULL FOREIGN KEY REFERENCES dbo.CHATBOT_NODOS(NODO_ID),
    SES_TICKET_ID INT NULL FOREIGN KEY REFERENCES dbo.TICKETS(TICKET_ID),
    SES_CONVERSACION_ID INT NULL FOREIGN KEY REFERENCES dbo.LIVECHAT_CONVERSACIONES(LC_ID),
    SES_FECHA_INICIO DATETIME NOT NULL DEFAULT GETDATE(),
    SES_FECHA_FIN DATETIME NULL,
    CONSTRAINT UQ_CHATBOT_SESIONES_TOKEN UNIQUE (SES_TOKEN)
  );
END
`);

    const nodoInicio = await pool.request().query(`SELECT 1 FROM dbo.CHATBOT_NODOS WHERE NODO_CODIGO='inicio'`);
    if (!nodoInicio.recordset.length) {
      await pool.request().query(`
        INSERT INTO dbo.CHATBOT_NODOS (NODO_CODIGO, NODO_TEXTO, NODO_TIPO)
        VALUES ('inicio', N'¿En qué te podemos ayudar?', 'pregunta')
      `);
    }

    // Árbol de ejemplo (3 ramas: Hardware con autoservicio, Contraseña con
    // resolución directa, y escalamiento a un humano) para que el chatbot
    // tenga contenido navegable desde el primer arranque, en vez de quedar
    // con solo el nodo 'inicio' sin opciones. Solo corre si el nodo 'inicio'
    // sigue sin ninguna opción — así no pisa un árbol que el admin ya haya
    // personalizado manualmente desde Configuración > Chatbot.
    const inicioSinOpciones = await pool.request().query(`
      SELECT n.NODO_ID as id FROM dbo.CHATBOT_NODOS n
      WHERE n.NODO_CODIGO='inicio' AND NOT EXISTS (SELECT 1 FROM dbo.CHATBOT_NODO_OPCIONES o WHERE o.OPC_NODO_ID = n.NODO_ID)
    `);
    if (inicioSinOpciones.recordset.length) {
      const inicioId = inicioSinOpciones.recordset[0].id;
      const catHardware = await pool.request().query(`SELECT CAT_ID as id FROM dbo.TICKET_CATEGORIAS WHERE CAT_NOMBRE='Hardware'`);
      const catAccesos = await pool.request().query(`SELECT CAT_ID as id FROM dbo.TICKET_CATEGORIAS WHERE CAT_NOMBRE='Usuarios y Accesos'`);
      const catHardwareId = catHardware.recordset[0]?.id ?? null;
      const catAccesosId = catAccesos.recordset[0]?.id ?? null;

      const crearNodo = async (codigo, texto, tipo, categoriaId = null) => {
        const ins = await pool.request()
          .input('cod', sql.NVarChar, codigo).input('txt', sql.NVarChar, texto)
          .input('tipo', sql.NVarChar, tipo).input('catId', sql.Int, categoriaId)
          .query(`INSERT INTO dbo.CHATBOT_NODOS (NODO_CODIGO, NODO_TEXTO, NODO_TIPO, NODO_CATEGORIA_ID)
                  VALUES (@cod, @txt, @tipo, @catId); SELECT SCOPE_IDENTITY() as id;`);
        return Number(ins.recordset[0].id);
      };
      const crearOpcion = async (nodoId, textoBoton, nodoDestinoId, orden) => {
        await pool.request()
          .input('nodoId', sql.Int, nodoId).input('txt', sql.NVarChar, textoBoton)
          .input('destId', sql.Int, nodoDestinoId).input('orden', sql.Int, orden)
          .query(`INSERT INTO dbo.CHATBOT_NODO_OPCIONES (OPC_NODO_ID, OPC_TEXTO_BOTON, OPC_NODO_DESTINO_ID, OPC_ORDEN)
                  VALUES (@nodoId, @txt, @destId, @orden)`);
      };

      // Rama Hardware: pregunta -> pasos de autoservicio -> resuelto o crear ticket
      const hwNoEnciende = await crearNodo('hw_no_enciende', '¿Probaste desconectar el equipo de la corriente 30 segundos y volver a conectarlo?', 'pregunta', catHardwareId);
      const hwFuncionaAutoservicio = await crearNodo('hw_resuelto_autoservicio', 'Genial, eso resuelve la mayoría de los casos. Si vuelve a pasar, no dudes en contactarnos de nuevo.', 'resolucion');
      const hwCrearTicket = await crearNodo('hw_crear_ticket_no_enciende', 'Vamos a crear un ticket para que un técnico revise el equipo en sitio.', 'crear_ticket', catHardwareId);
      await crearOpcion(hwNoEnciende, 'Sí, ya lo intenté y sigue sin encender', hwCrearTicket, 1);
      await crearOpcion(hwNoEnciende, 'No lo había intentado, lo voy a probar', hwFuncionaAutoservicio, 2);

      // Rama Contraseña/Acceso: resolución directa con instrucciones de autoservicio
      const accesoContrasena = await crearNodo('acceso_contrasena', 'Puedes restablecer tu contraseña desde el portal de autoservicio con tu correo institucional. Si el problema persiste después de intentarlo, contáctanos.', 'resolucion', catAccesosId);

      // Rama de escalamiento directo a un humano
      const hablarTecnico = await crearNodo('hablar_tecnico', 'Te conectamos con un técnico disponible.', 'escalar_chat');

      // Nodo raíz: 3 opciones hacia las ramas anteriores
      await crearOpcion(inicioId, 'Mi equipo no enciende', hwNoEnciende, 1);
      await crearOpcion(inicioId, 'Olvidé mi contraseña', accesoContrasena, 2);
      await crearOpcion(inicioId, 'Quiero hablar con un técnico', hablarTecnico, 3);
    }

    // Botones del menú inicial del widget público — antes vivían hardcodeados
    // como un arreglo fijo de 4 strings en extra/Pagina de Intranet_1/index.html.
    // Ahora son filas editables: 'respuesta' dispara el diccionario de siempre
    // (por texto), 'escalar_campania' escala directo a Chat en Vivo con el
    // campaignToken de una campaña específica (sin pasar por el flujo genérico
    // "Hablar con alguien" que no elige campaña), y 'arbol_diagnostico' abre el
    // árbol de decisión de arriba. ETQ_CAMPANIA_ID es NULL salvo en ese último caso.
    await pool.request().query(`
      IF OBJECT_ID('dbo.CHATBOT_ETIQUETAS_MENU', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CHATBOT_ETIQUETAS_MENU (
          ETQ_ID              INT IDENTITY(1,1) PRIMARY KEY,
          ETQ_TEXTO_ES         NVARCHAR(150)   NOT NULL,
          ETQ_TEXTO_EN         NVARCHAR(150)   NULL,
          ETQ_TIPO             NVARCHAR(30)    NOT NULL DEFAULT ('respuesta'),
          ETQ_CAMPANIA_ID      INT             NULL FOREIGN KEY REFERENCES dbo.LIVECHAT_CAMPANIAS(LCA_ID),
          ETQ_GRUPO_ID         INT             NULL FOREIGN KEY REFERENCES dbo.LIVECHAT_GRUPOS(LG_ID),
          ETQ_ORDEN            INT             NOT NULL DEFAULT (0),
          ETQ_ACTIVA           BIT             NOT NULL DEFAULT (1),
          ETQ_FECHA_CREACION   DATETIME        NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CHATBOT_ETIQUETAS_TIPO CHECK (ETQ_TIPO IN ('respuesta','escalar_campania','escalar_generico','arbol_diagnostico'))
        );
        CREATE INDEX IX_CHATBOT_ETIQUETAS_ACTIVA ON dbo.CHATBOT_ETIQUETAS_MENU(ETQ_ACTIVA, ETQ_ORDEN);
      END
    `);

    // Tenants donde la tabla ya existía antes de agregar 'escalar_generico' al
    // tipo tienen el CHECK constraint viejo — lo recrea con la lista completa
    // para que el UPDATE/INSERT de abajo no choque contra un constraint desfasado.
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CHATBOT_ETIQUETAS_TIPO')
      BEGIN
        ALTER TABLE dbo.CHATBOT_ETIQUETAS_MENU DROP CONSTRAINT CK_CHATBOT_ETIQUETAS_TIPO;
        ALTER TABLE dbo.CHATBOT_ETIQUETAS_MENU ADD CONSTRAINT CK_CHATBOT_ETIQUETAS_TIPO
          CHECK (ETQ_TIPO IN ('respuesta','escalar_campania','escalar_generico','arbol_diagnostico'));
      END
    `);

    const etiquetasCount = await pool.request().query('SELECT COUNT(*) as total FROM dbo.CHATBOT_ETIQUETAS_MENU');
    if (etiquetasCount.recordset[0].total === 0) {
      await pool.request().query(`
        INSERT INTO dbo.CHATBOT_ETIQUETAS_MENU (ETQ_TEXTO_ES, ETQ_TEXTO_EN, ETQ_TIPO, ETQ_ORDEN) VALUES
          (N'Conocer servicios', N'Our services', 'respuesta', 1),
          (N'Precios y cotización', N'Pricing & quote', 'escalar_generico', 2),
          (N'Hablar con alguien', N'Talk to someone', 'escalar_generico', 3),
          (N'Diagnóstico guiado', N'Guided diagnosis', 'arbol_diagnostico', 4)
      `);
    } else {
      // Corrige el seed inicial que salió con tipo 'respuesta' en estas dos filas
      // (deploy anterior a agregar el tipo 'escalar_generico') — filtra por
      // ETQ_ID (1-4, los únicos que pudo haber creado el seed original) en vez de
      // texto, para no depender de collation/acentos.
      await pool.request().query(`
        UPDATE dbo.CHATBOT_ETIQUETAS_MENU SET ETQ_TIPO = 'escalar_generico'
        WHERE ETQ_ID IN (2, 3) AND ETQ_TIPO = 'respuesta'
          AND ETQ_CAMPANIA_ID IS NULL AND ETQ_GRUPO_ID IS NULL
      `);
    }

    // Flujo visual (canvas de arrastrar y conectar) — cada tabla que puede
    // aparecer como caja en el lienzo (respuestas, etiquetas del menú, nodos
    // del árbol) gana su posición X/Y. Las campañas de LIVECHAT_CAMPANIAS no
    // llevan posición propia: el frontend les asigna una por defecto la
    // primera vez que aparecen, sin tocar esa tabla.
    await pool.request().query(`
      IF COL_LENGTH('dbo.CHATBOT_RESPUESTAS', 'RESP_POS_X') IS NULL
        ALTER TABLE dbo.CHATBOT_RESPUESTAS ADD RESP_POS_X FLOAT NULL, RESP_POS_Y FLOAT NULL;
      IF COL_LENGTH('dbo.CHATBOT_ETIQUETAS_MENU', 'ETQ_POS_X') IS NULL
        ALTER TABLE dbo.CHATBOT_ETIQUETAS_MENU ADD ETQ_POS_X FLOAT NULL, ETQ_POS_Y FLOAT NULL;
      IF COL_LENGTH('dbo.CHATBOT_NODOS', 'NODO_POS_X') IS NULL
        ALTER TABLE dbo.CHATBOT_NODOS ADD NODO_POS_X FLOAT NULL, NODO_POS_Y FLOAT NULL;
    `);

    // Conexiones del canvas — genérica por (tipo, id) en vez de FKs tipadas,
    // porque el origen/destino puede ser cualquiera de los 4 tipos de caja
    // (respuesta, etiqueta, nodo_arbol, campania) en cualquier combinación.
    // La integridad referencial real la valida el controller al crear la
    // conexión, no la base de datos.
    await pool.request().query(`
      IF OBJECT_ID('dbo.CHATBOT_FLUJO_CONEXIONES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CHATBOT_FLUJO_CONEXIONES (
          FCX_ID              INT IDENTITY(1,1) PRIMARY KEY,
          FCX_ORIGEN_TIPO      NVARCHAR(20)    NOT NULL,
          FCX_ORIGEN_ID        INT             NOT NULL,
          FCX_DESTINO_TIPO     NVARCHAR(20)    NOT NULL,
          FCX_DESTINO_ID       INT             NOT NULL,
          FCX_ETIQUETA         NVARCHAR(150)   NULL,
          FCX_FECHA_CREACION   DATETIME        NOT NULL DEFAULT GETDATE(),
          CONSTRAINT CK_CHATBOT_FCX_ORIGEN_TIPO CHECK (FCX_ORIGEN_TIPO IN ('respuesta','etiqueta','nodo_arbol')),
          CONSTRAINT CK_CHATBOT_FCX_DESTINO_TIPO CHECK (FCX_DESTINO_TIPO IN ('respuesta','etiqueta','nodo_arbol','campania')),
          CONSTRAINT UQ_CHATBOT_FCX UNIQUE (FCX_ORIGEN_TIPO, FCX_ORIGEN_ID, FCX_DESTINO_TIPO, FCX_DESTINO_ID)
        );
        CREATE INDEX IX_CHATBOT_FCX_ORIGEN ON dbo.CHATBOT_FLUJO_CONEXIONES(FCX_ORIGEN_TIPO, FCX_ORIGEN_ID);
      END
    `);

    logger.info('✅ Esquema de chatbot asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de chatbot:', err.message);
  }
}

// Chat en vivo con agentes humanos — escalación desde el chatbot de diccionario de la página pública.
async function ensureLivechatSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.LIVECHAT_CONVERSACIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_CONVERSACIONES (
    LC_ID                 INT IDENTITY(1,1) PRIMARY KEY,
    LC_VISITANTE_NOMBRE   NVARCHAR(150)   NULL,
    LC_VISITANTE_EMAIL    NVARCHAR(200)   NULL,
    LC_VISITANTE_TELEFONO NVARCHAR(40)    NULL,
    LC_MOTIVO             NVARCHAR(MAX)   NULL,
    LC_AGENTE_ID          INT             NULL,
    LC_AGENTE_NOMBRE      NVARCHAR(150)   NULL,
    LC_ESTADO             NVARCHAR(20)    NOT NULL DEFAULT ('esperando'),
    LC_ORIGEN             NVARCHAR(30)    NOT NULL DEFAULT ('directo'),
    LC_FECHA_INICIO       DATETIME        NOT NULL DEFAULT GETDATE(),
    LC_FECHA_CIERRE       DATETIME        NULL,
    LC_RATING             INT             NULL,
    LC_COMENTARIO_CIERRE  NVARCHAR(MAX)   NULL,
    LC_MOTIVO_CIERRE      NVARCHAR(200)   NULL,
    CONSTRAINT CK_LIVECHAT_CONV_ESTADO CHECK (LC_ESTADO IN ('esperando','activa','pendiente_rating','cerrada'))
  );
  CREATE INDEX IX_LIVECHAT_CONV_ESTADO ON dbo.LIVECHAT_CONVERSACIONES(LC_ESTADO);
  CREATE INDEX IX_LIVECHAT_CONV_AGENTE ON dbo.LIVECHAT_CONVERSACIONES(LC_AGENTE_ID);
END

IF OBJECT_ID('dbo.LIVECHAT_MENSAJES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_MENSAJES (
    LM_ID              INT IDENTITY(1,1) PRIMARY KEY,
    LM_CONVERSACION_ID INT             NOT NULL,
    LM_EMISOR          NVARCHAR(15)    NOT NULL,
    LM_AGENTE_ID       INT             NULL,
    LM_CONTENIDO       NVARCHAR(MAX)   NOT NULL,
    LM_ARCHIVO_URL     NVARCHAR(500)   NULL,
    LM_FECHA           DATETIME        NOT NULL DEFAULT GETDATE(),
    LM_LEIDO           BIT             NOT NULL DEFAULT (0),
    CONSTRAINT CK_LIVECHAT_MSG_EMISOR CHECK (LM_EMISOR IN ('visitante','agente','sistema')),
    CONSTRAINT FK_LIVECHAT_MSG_CONV FOREIGN KEY (LM_CONVERSACION_ID)
      REFERENCES dbo.LIVECHAT_CONVERSACIONES(LC_ID) ON DELETE CASCADE
  );
  CREATE INDEX IX_LIVECHAT_MSG_CONV ON dbo.LIVECHAT_MENSAJES(LM_CONVERSACION_ID, LM_FECHA);
END

IF OBJECT_ID('dbo.LIVECHAT_AGENTE_ESTADO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_AGENTE_ESTADO (
    LAE_USUARIO_ID            INT NOT NULL PRIMARY KEY,
    LAE_ONLINE                BIT NOT NULL DEFAULT (0),
    LAE_DISPONIBLE             BIT NOT NULL DEFAULT (0),
    LAE_CONVERSACIONES_ACTIVAS INT NOT NULL DEFAULT (0),
    LAE_ULTIMA_CONEXION        DATETIME NULL
  );
END

IF OBJECT_ID('dbo.LIVECHAT_COLA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_COLA (
    LCO_ID              INT IDENTITY(1,1) PRIMARY KEY,
    LCO_CONVERSACION_ID INT NOT NULL,
    LCO_TICKET          INT NOT NULL,
    LCO_FECHA_ENTRADA   DATETIME NOT NULL DEFAULT GETDATE(),
    LCO_ULTIMO_PING     DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LIVECHAT_COLA_CONV FOREIGN KEY (LCO_CONVERSACION_ID)
      REFERENCES dbo.LIVECHAT_CONVERSACIONES(LC_ID) ON DELETE CASCADE
  );
END
IF COL_LENGTH('dbo.LIVECHAT_COLA', 'LCO_ESPERA_ESCALADA') IS NULL
  ALTER TABLE dbo.LIVECHAT_COLA ADD LCO_ESPERA_ESCALADA BIT NOT NULL DEFAULT 0;

IF OBJECT_ID('dbo.LIVECHAT_CONFIG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_CONFIG (
    LCF_ID                INT IDENTITY(1,1) PRIMARY KEY,
    LCF_HORARIO_INICIO    NVARCHAR(5)     NULL,
    LCF_HORARIO_FIN       NVARCHAR(5)     NULL,
    LCF_DIAS_SEMANA       NVARCHAR(20)    NULL,
    LCF_MSG_BIENVENIDA    NVARCHAR(MAX)   NULL,
    LCF_MSG_FUERA_HORARIO NVARCHAR(MAX)   NULL,
    LCF_MSG_SIN_AGENTES   NVARCHAR(MAX)   NULL,
    LCF_MSG_EN_COLA       NVARCHAR(MAX)   NULL,
    LCF_MAX_CHATS_POR_AGENTE INT          NOT NULL DEFAULT (5)
  );
  INSERT INTO dbo.LIVECHAT_CONFIG (LCF_HORARIO_INICIO, LCF_HORARIO_FIN, LCF_DIAS_SEMANA, LCF_MSG_BIENVENIDA, LCF_MSG_FUERA_HORARIO, LCF_MSG_SIN_AGENTES, LCF_MSG_EN_COLA)
  VALUES ('09:00', '18:00', '1,2,3,4,5',
    N'¡Hola! Un agente se unirá a la conversación en breve.',
    N'En este momento estamos fuera de horario de atención. Te responderemos por correo lo antes posible.',
    N'En este momento todos nuestros agentes están ocupados. Te responderemos por correo lo antes posible.',
    N'Estás en la posición {posicion_cola} de {total_cola}. Tiempo estimado de espera: {tiempo_espera} min.');
END

IF COL_LENGTH('dbo.LIVECHAT_CONFIG', 'LCF_SABADO_HORARIO_INICIO') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONFIG ADD LCF_SABADO_HORARIO_INICIO NVARCHAR(5) NULL;
IF COL_LENGTH('dbo.LIVECHAT_CONFIG', 'LCF_SABADO_HORARIO_FIN') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONFIG ADD LCF_SABADO_HORARIO_FIN NVARCHAR(5) NULL;
IF COL_LENGTH('dbo.LIVECHAT_CONFIG', 'LCF_TIMEOUT_COLA_MINUTOS') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONFIG ADD LCF_TIMEOUT_COLA_MINUTOS INT NOT NULL DEFAULT (15);

IF COL_LENGTH('dbo.LIVECHAT_AGENTE_ESTADO', 'LAE_MODO_AUTOMATICO') IS NULL
  ALTER TABLE dbo.LIVECHAT_AGENTE_ESTADO ADD LAE_MODO_AUTOMATICO BIT NOT NULL DEFAULT (1);

IF COL_LENGTH('dbo.LIVECHAT_CONVERSACIONES', 'LC_OPO_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONVERSACIONES ADD LC_OPO_ID INT NULL;
`);
    logger.info('✅ Esquema de livechat asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de livechat:', err.message);
  }
}

// Campañas de Chat en Vivo: jerarquía Campaña → Grupo → Agente, con plantillas
// de respuesta rápida y motivos de cierre obligatorios por grupo. Todo opcional:
// una conversación sin campaignToken sigue funcionando exactamente igual que antes.
async function ensureLivechatCampanasSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.LIVECHAT_CAMPANIAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_CAMPANIAS (
    LCA_ID              INT IDENTITY(1,1) PRIMARY KEY,
    LCA_NOMBRE          NVARCHAR(200)   NOT NULL,
    LCA_DESCRIPCION     NVARCHAR(MAX)   NULL,
    LCA_TOKEN           NVARCHAR(64)    NOT NULL,
    LCA_ACTIVO          BIT             NOT NULL DEFAULT (1),
    LCA_FECHA_INICIO    DATETIME        NULL,
    LCA_FECHA_FIN       DATETIME        NULL,
    LCA_FECHA_CREACION  DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_LIVECHAT_CAMPANIAS_TOKEN UNIQUE (LCA_TOKEN)
  );
END

IF OBJECT_ID('dbo.LIVECHAT_GRUPOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_GRUPOS (
    LG_ID           INT IDENTITY(1,1) PRIMARY KEY,
    LG_CAMPANIA_ID  INT             NOT NULL,
    LG_NOMBRE       NVARCHAR(100)   NOT NULL,
    LG_DESCRIPCION  NVARCHAR(MAX)   NULL,
    LG_ICONO        NVARCHAR(10)    NULL DEFAULT ('📞'),
    LG_ACTIVO       BIT             NOT NULL DEFAULT (1),
    CONSTRAINT FK_LIVECHAT_GRUPOS_CAMPANIA FOREIGN KEY (LG_CAMPANIA_ID)
      REFERENCES dbo.LIVECHAT_CAMPANIAS(LCA_ID)
  );
  CREATE INDEX IX_LIVECHAT_GRUPOS_CAMPANIA ON dbo.LIVECHAT_GRUPOS(LG_CAMPANIA_ID);
END

IF OBJECT_ID('dbo.LIVECHAT_GRUPO_AGENTES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_GRUPO_AGENTES (
    LGA_ID                INT IDENTITY(1,1) PRIMARY KEY,
    LGA_GRUPO_ID          INT NOT NULL,
    LGA_USUARIO_ID        INT NOT NULL,
    LGA_ACTIVO            BIT NOT NULL DEFAULT (1),
    LGA_FECHA_ASIGNACION  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LIVECHAT_GA_GRUPO FOREIGN KEY (LGA_GRUPO_ID) REFERENCES dbo.LIVECHAT_GRUPOS(LG_ID),
    CONSTRAINT UQ_LIVECHAT_GA_GRUPO_USUARIO UNIQUE (LGA_GRUPO_ID, LGA_USUARIO_ID)
  );
END

IF OBJECT_ID('dbo.LIVECHAT_PLANTILLAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_PLANTILLAS (
    LP_ID           INT IDENTITY(1,1) PRIMARY KEY,
    LP_GRUPO_ID     INT             NOT NULL,
    LP_NOMBRE       NVARCHAR(255)   NOT NULL,
    LP_CONTENIDO    NVARCHAR(MAX)   NOT NULL,
    LP_TIPO         NVARCHAR(50)    NOT NULL DEFAULT ('general'),
    LP_VISIBILIDAD  NVARCHAR(20)    NOT NULL DEFAULT ('publica'),
    LP_USUARIO_ID   INT             NULL,
    LP_ACTIVO       BIT             NOT NULL DEFAULT (1),
    CONSTRAINT FK_LIVECHAT_PLANTILLAS_GRUPO FOREIGN KEY (LP_GRUPO_ID) REFERENCES dbo.LIVECHAT_GRUPOS(LG_ID),
    CONSTRAINT CK_LIVECHAT_PLANTILLAS_VISIBILIDAD CHECK (LP_VISIBILIDAD IN ('publica','privada'))
  );
  CREATE INDEX IX_LIVECHAT_PLANTILLAS_GRUPO ON dbo.LIVECHAT_PLANTILLAS(LP_GRUPO_ID);
END

IF OBJECT_ID('dbo.LIVECHAT_MOTIVOS_CIERRE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LIVECHAT_MOTIVOS_CIERRE (
    LMC_ID                  INT IDENTITY(1,1) PRIMARY KEY,
    LMC_GRUPO_ID            INT             NOT NULL,
    LMC_MOTIVO              NVARCHAR(255)   NOT NULL,
    LMC_DESCRIPCION         NVARCHAR(MAX)   NULL,
    LMC_REQUIERE_COMENTARIO BIT             NOT NULL DEFAULT (0),
    LMC_ORDEN               INT             NOT NULL DEFAULT (0),
    LMC_ACTIVO              BIT             NOT NULL DEFAULT (1),
    CONSTRAINT FK_LIVECHAT_MOTIVOS_GRUPO FOREIGN KEY (LMC_GRUPO_ID) REFERENCES dbo.LIVECHAT_GRUPOS(LG_ID)
  );
  CREATE INDEX IX_LIVECHAT_MOTIVOS_GRUPO ON dbo.LIVECHAT_MOTIVOS_CIERRE(LMC_GRUPO_ID);
END

IF COL_LENGTH('dbo.LIVECHAT_CONVERSACIONES', 'LC_CAMPANIA_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONVERSACIONES ADD LC_CAMPANIA_ID INT NULL;
IF COL_LENGTH('dbo.LIVECHAT_CONVERSACIONES', 'LC_GRUPO_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONVERSACIONES ADD LC_GRUPO_ID INT NULL;
IF COL_LENGTH('dbo.LIVECHAT_CONVERSACIONES', 'LC_MOTIVO_CIERRE_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONVERSACIONES ADD LC_MOTIVO_CIERRE_ID INT NULL;

-- Chat interno de Soporte TI: vínculo al ticket creado automáticamente y al
-- empleado autenticado que inició la conversación (distinto de los campos
-- LC_VISITANTE_* de texto libre, usados por el widget público anónimo).
IF COL_LENGTH('dbo.LIVECHAT_CONVERSACIONES', 'LC_TICKET_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONVERSACIONES ADD LC_TICKET_ID INT NULL FOREIGN KEY REFERENCES dbo.TICKETS(TICKET_ID);
IF COL_LENGTH('dbo.LIVECHAT_CONVERSACIONES', 'LC_SOLICITANTE_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONVERSACIONES ADD LC_SOLICITANTE_ID INT NULL;

IF COL_LENGTH('dbo.LIVECHAT_CONFIG', 'LCF_CAMPANIA_ID') IS NULL
  ALTER TABLE dbo.LIVECHAT_CONFIG ADD LCF_CAMPANIA_ID INT NULL;

IF COL_LENGTH('dbo.LIVECHAT_AGENTE_ESTADO', 'LAE_MAX_CHATS_OVERRIDE') IS NULL
  ALTER TABLE dbo.LIVECHAT_AGENTE_ESTADO ADD LAE_MAX_CHATS_OVERRIDE INT NULL;

IF COL_LENGTH('dbo.LIVECHAT_CAMPANIAS', 'LCA_MAX_CHATS_POR_AGENTE') IS NULL
  ALTER TABLE dbo.LIVECHAT_CAMPANIAS ADD LCA_MAX_CHATS_POR_AGENTE INT NULL;

IF COL_LENGTH('dbo.LIVECHAT_CAMPANIAS', 'LCA_AREA') IS NULL
  ALTER TABLE dbo.LIVECHAT_CAMPANIAS ADD LCA_AREA NVARCHAR(100) NULL;
`);

    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LIVECHAT_CONV_TICKET' AND object_id=OBJECT_ID('dbo.LIVECHAT_CONVERSACIONES'))
        CREATE INDEX IX_LIVECHAT_CONV_TICKET ON dbo.LIVECHAT_CONVERSACIONES(LC_TICKET_ID) WHERE LC_TICKET_ID IS NOT NULL;
    `);

    // Seed idempotente de la campaña "Soporte TI" (chat interno de empleados
    // logueados, distinto del widget público) + su grupo por defecto. Se
    // localiza por nombre, nunca por token — el flujo interno no usa el token.
    const campExiste = await pool.request().query(`SELECT LCA_ID FROM dbo.LIVECHAT_CAMPANIAS WHERE LCA_NOMBRE = N'Soporte TI'`);
    if (!campExiste.recordset.length) {
      const insCamp = await pool.request().query(`
        INSERT INTO dbo.LIVECHAT_CAMPANIAS (LCA_NOMBRE, LCA_DESCRIPCION, LCA_TOKEN, LCA_ACTIVO)
        VALUES (N'Soporte TI', N'Chat interno de soporte técnico para empleados', CONVERT(NVARCHAR(64), NEWID()), 1);
        SELECT SCOPE_IDENTITY() as id;
      `);
      const campId = Number(insCamp.recordset[0].id);
      await pool.request().input('campId', sql.Int, campId).query(`
        INSERT INTO dbo.LIVECHAT_GRUPOS (LG_CAMPANIA_ID, LG_NOMBRE, LG_ICONO, LG_ACTIVO)
        VALUES (@campId, N'Soporte TI - General', N'🛠️', 1)
      `);
      logger.info('✅ Campaña "Soporte TI" y grupo por defecto sembrados');
    }

    logger.info('✅ Esquema de campañas de livechat asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de campañas de livechat:', err.message);
  }
}

// Email Marketing: campañas de correo masivo sobre los contactos que ya existen
// en CRM_CONTACTOS — sin lista de contactos aparte. CONT_EMAIL_BAJA se respeta
// siempre al armar destinatarios, sin importar el filtro de la campaña.
async function ensureEmailMarketingSchema(pool) {
  const batches = [
    `IF OBJECT_ID('dbo.EMAIL_PLANTILLAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EMAIL_PLANTILLAS (
    EPL_ID            INT IDENTITY(1,1) PRIMARY KEY,
    EPL_NOMBRE        NVARCHAR(255)   NOT NULL,
    EPL_ASUNTO        NVARCHAR(300)   NOT NULL,
    EPL_CUERPO_HTML   NVARCHAR(MAX)   NOT NULL,
    EPL_CUERPO_TEXTO  NVARCHAR(MAX)   NULL,
    EPL_VARIABLES     NVARCHAR(500)   NULL,
    EPL_ACTIVO        BIT             NOT NULL DEFAULT (1),
    EPL_CREADO_POR    INT             NULL,
    EPL_FECHA         DATETIME        NOT NULL DEFAULT GETDATE()
  );
END`,
    `IF OBJECT_ID('dbo.EMAIL_CAMPANIAS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EMAIL_CAMPANIAS (
    ECA_ID                INT IDENTITY(1,1) PRIMARY KEY,
    ECA_NOMBRE            NVARCHAR(200)   NOT NULL,
    ECA_PLANTILLA_ID      INT             NOT NULL,
    ECA_ESTADO            NVARCHAR(20)    NOT NULL DEFAULT ('borrador'),
    ECA_FILTRO            NVARCHAR(20)    NOT NULL DEFAULT ('todos'),
    ECA_FILTRO_TAG        NVARCHAR(100)   NULL,
    ECA_CONTACTOS_IDS     NVARCHAR(MAX)   NULL,
    ECA_EMAILS_POR_HORA   INT             NOT NULL DEFAULT (200),
    ECA_FECHA_PROGRAMADA  DATETIME        NULL,
    ECA_FECHA_INICIO      DATETIME        NULL,
    ECA_FECHA_FIN         DATETIME        NULL,
    ECA_CREADO_POR        INT             NULL,
    ECA_FECHA_CREACION    DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ECA_PLANTILLA FOREIGN KEY (ECA_PLANTILLA_ID) REFERENCES dbo.EMAIL_PLANTILLAS(EPL_ID),
    CONSTRAINT CK_ECA_ESTADO CHECK (ECA_ESTADO IN ('borrador','programada','enviando','pausada','completada','cancelada')),
    CONSTRAINT CK_ECA_FILTRO CHECK (ECA_FILTRO IN ('todos','tag','manual'))
  );
END`,
    `IF OBJECT_ID('dbo.EMAIL_ENVIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EMAIL_ENVIOS (
    EEN_ID              BIGINT IDENTITY(1,1) PRIMARY KEY,
    EEN_CAMPANIA_ID     INT             NOT NULL,
    EEN_CONTACTO_ID     INT             NOT NULL,
    EEN_CORREO          NVARCHAR(200)   NOT NULL,
    EEN_ESTADO          NVARCHAR(20)    NOT NULL DEFAULT ('pendiente'),
    EEN_INTENTOS        INT             NOT NULL DEFAULT (0),
    EEN_ERROR           NVARCHAR(500)   NULL,
    EEN_FECHA_ENVIO     DATETIME        NULL,
    EEN_FECHA_CREACION  DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_EEN_CAMPANIA FOREIGN KEY (EEN_CAMPANIA_ID) REFERENCES dbo.EMAIL_CAMPANIAS(ECA_ID),
    CONSTRAINT FK_EEN_CONTACTO FOREIGN KEY (EEN_CONTACTO_ID) REFERENCES dbo.CRM_CONTACTOS(CONT_ID),
    CONSTRAINT CK_EEN_ESTADO CHECK (EEN_ESTADO IN ('pendiente','enviado','fallido','omitido_baja'))
  );
  CREATE INDEX IX_EEN_CAMPANIA_ESTADO ON dbo.EMAIL_ENVIOS(EEN_CAMPANIA_ID, EEN_ESTADO);
END`,
    `IF COL_LENGTH('dbo.CRM_CONTACTOS', 'CONT_EMAIL_BAJA') IS NULL
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_EMAIL_BAJA BIT NOT NULL DEFAULT (0);`,
    `IF COL_LENGTH('dbo.CRM_CONTACTOS', 'CONT_EMAIL_BAJA_FECHA') IS NULL
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_EMAIL_BAJA_FECHA DATETIME NULL;`,
    `IF COL_LENGTH('dbo.CRM_CONTACTOS', 'CONT_TAGS') IS NULL
  ALTER TABLE dbo.CRM_CONTACTOS ADD CONT_TAGS NVARCHAR(300) NULL;`,
  ];
  for (const batch of batches) {
    try {
      await pool.request().batch(batch);
    } catch (err) {
      console.warn('⚠️ EmailMarketing schema batch:', err.message);
    }
  }
  logger.info('✅ Esquema de email marketing asegurado');
}

// Mensajería interna: chat en tiempo real entre usuarios (DMs y grupos/canales).
// Un DM es un canal MC_TIPO='directo' con exactamente 2 miembros; MC_DM_KEY (par de
// ids ordenado) más el índice único filtrado evita crear DMs duplicados entre el mismo par.
async function ensureMensajeriaSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.MSJ_CANALES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MSJ_CANALES (
    MC_ID           INT IDENTITY(1,1) PRIMARY KEY,
    MC_TIPO         NVARCHAR(10)   NOT NULL DEFAULT ('directo'),
    MC_NOMBRE       NVARCHAR(150)  NULL,
    MC_DESCRIPCION  NVARCHAR(500)  NULL,
    MC_DM_KEY       NVARCHAR(40)   NULL,
    MC_CREADO_POR   SMALLINT       NOT NULL,
    MC_FECHA_CREACION DATETIME     NOT NULL DEFAULT GETDATE(),
    MC_ULTIMO_MENSAJE_FECHA DATETIME NULL,
    CONSTRAINT CK_MSJ_CANALES_TIPO CHECK (MC_TIPO IN ('directo','grupo')),
    CONSTRAINT FK_MSJ_CANALES_CREADOR FOREIGN KEY (MC_CREADO_POR) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID)
  );
  CREATE UNIQUE INDEX UX_MSJ_CANALES_DMKEY ON dbo.MSJ_CANALES(MC_DM_KEY) WHERE MC_DM_KEY IS NOT NULL;
  CREATE INDEX IX_MSJ_CANALES_ULTIMOMSG ON dbo.MSJ_CANALES(MC_ULTIMO_MENSAJE_FECHA DESC);
END

IF OBJECT_ID('dbo.MSJ_CANAL_MIEMBROS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MSJ_CANAL_MIEMBROS (
    MCM_ID                     INT IDENTITY(1,1) PRIMARY KEY,
    MCM_CANAL_ID                INT NOT NULL,
    MCM_USUARIO_ID               SMALLINT NOT NULL,
    MCM_ROL                     NVARCHAR(10) NOT NULL DEFAULT ('miembro'),
    MCM_FECHA_INGRESO           DATETIME NOT NULL DEFAULT GETDATE(),
    MCM_ULTIMO_LEIDO_MENSAJE_ID INT NULL,
    MCM_ULTIMA_LECTURA_FECHA     DATETIME NULL,
    CONSTRAINT CK_MSJ_MIEMBROS_ROL CHECK (MCM_ROL IN ('admin','miembro')),
    CONSTRAINT FK_MSJ_MIEMBROS_CANAL FOREIGN KEY (MCM_CANAL_ID) REFERENCES dbo.MSJ_CANALES(MC_ID) ON DELETE CASCADE,
    CONSTRAINT FK_MSJ_MIEMBROS_USUARIO FOREIGN KEY (MCM_USUARIO_ID) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID),
    CONSTRAINT UQ_MSJ_MIEMBROS_CANAL_USUARIO UNIQUE (MCM_CANAL_ID, MCM_USUARIO_ID)
  );
  CREATE INDEX IX_MSJ_MIEMBROS_USUARIO ON dbo.MSJ_CANAL_MIEMBROS(MCM_USUARIO_ID);
  CREATE INDEX IX_MSJ_MIEMBROS_CANAL ON dbo.MSJ_CANAL_MIEMBROS(MCM_CANAL_ID);
END

IF OBJECT_ID('dbo.MSJ_MENSAJES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MSJ_MENSAJES (
    MM_ID           INT IDENTITY(1,1) PRIMARY KEY,
    MM_CANAL_ID     INT NOT NULL,
    MM_EMISOR_ID    SMALLINT NOT NULL,
    MM_CONTENIDO    NVARCHAR(MAX) NOT NULL,
    MM_ARCHIVO_URL  NVARCHAR(500) NULL,
    MM_FECHA        DATETIME NOT NULL DEFAULT GETDATE(),
    MM_EDITADO      BIT NOT NULL DEFAULT (0),
    CONSTRAINT FK_MSJ_MENSAJES_CANAL FOREIGN KEY (MM_CANAL_ID) REFERENCES dbo.MSJ_CANALES(MC_ID) ON DELETE CASCADE,
    CONSTRAINT FK_MSJ_MENSAJES_EMISOR FOREIGN KEY (MM_EMISOR_ID) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID)
  );
  CREATE INDEX IX_MSJ_MENSAJES_CANAL ON dbo.MSJ_MENSAJES(MM_CANAL_ID, MM_ID DESC);
END

IF OBJECT_ID('dbo.MSJ_PREFERENCIAS_USUARIO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MSJ_PREFERENCIAS_USUARIO (
    MPU_ID                   INT IDENTITY(1,1) PRIMARY KEY,
    MPU_USUARIO_ID            SMALLINT NOT NULL,
    MPU_BURBUJA_ACTIVA        BIT NOT NULL DEFAULT (1),
    MPU_BURBUJA_AUTOOCULTAR   BIT NOT NULL DEFAULT (1),
    MPU_BURBUJA_DURACION_SEG  INT NOT NULL DEFAULT (15),
    MPU_PERMITIR_ADJUNTOS     BIT NOT NULL DEFAULT (1),
    MPU_TEMA                 NVARCHAR(20) NOT NULL DEFAULT ('claro'),
    MPU_COLOR_MENSAJE_PROPIO NVARCHAR(9)  NOT NULL DEFAULT ('#2563EB'),
    MPU_COLOR_MENSAJE_AJENO  NVARCHAR(9)  NOT NULL DEFAULT ('#FFFFFF'),
    MPU_FECHA_ACTUALIZACION  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT CK_MPU_DURACION CHECK (MPU_BURBUJA_DURACION_SEG BETWEEN 3 AND 120),
    CONSTRAINT CK_MPU_TEMA CHECK (MPU_TEMA IN ('claro','oscuro')),
    CONSTRAINT FK_MPU_USUARIO FOREIGN KEY (MPU_USUARIO_ID) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID),
    CONSTRAINT UQ_MPU_USUARIO UNIQUE (MPU_USUARIO_ID)
  );
END
`);
    logger.info('✅ Esquema de mensajería asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de mensajería:', err.message);
  }

  // Se separa en pasos independientes (cada uno con su propio try/catch) en
  // vez de un solo CREATE TABLE con las FK/UNIQUE inline — así, si un tenant
  // tiene algún problema puntual con una referencia, el resto igual se crea
  // en vez de que "Could not create constraint or index" tumbe todo el batch
  // sin decir cuál constraint fue la que realmente falló.
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.MSJ_MENSAJE_REACCIONES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MSJ_MENSAJE_REACCIONES (
    MMR_ID          INT IDENTITY(1,1) PRIMARY KEY,
    MMR_MENSAJE_ID  INT NOT NULL,
    MMR_USUARIO_ID  SMALLINT NOT NULL,
    MMR_EMOJI       NVARCHAR(20) NOT NULL,
    MMR_FECHA       DATETIME NOT NULL DEFAULT GETDATE()
  );
END
`);
    logger.info('✅ Tabla MSJ_MENSAJE_REACCIONES asegurada');
  } catch (err) {
    console.warn('⚠️ No se pudo crear tabla MSJ_MENSAJE_REACCIONES:', err.message);
  }

  try {
    await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MSJ_REACCIONES_MENSAJE')
ALTER TABLE dbo.MSJ_MENSAJE_REACCIONES ADD CONSTRAINT FK_MSJ_REACCIONES_MENSAJE
  FOREIGN KEY (MMR_MENSAJE_ID) REFERENCES dbo.MSJ_MENSAJES(MM_ID) ON DELETE CASCADE;
`);
  } catch (err) {
    console.warn('⚠️ No se pudo crear FK_MSJ_REACCIONES_MENSAJE:', err.message);
  }

  try {
    await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MSJ_REACCIONES_USUARIO')
ALTER TABLE dbo.MSJ_MENSAJE_REACCIONES ADD CONSTRAINT FK_MSJ_REACCIONES_USUARIO
  FOREIGN KEY (MMR_USUARIO_ID) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID);
`);
  } catch (err) {
    console.warn('⚠️ No se pudo crear FK_MSJ_REACCIONES_USUARIO:', err.message);
  }

  try {
    // Una sola reacción activa por usuario y mensaje (como WhatsApp): al elegir
    // otro emoji se reemplaza la fila en vez de acumular varias por la misma persona.
    await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_MSJ_REACCIONES_MENSAJE_USUARIO' AND object_id = OBJECT_ID('dbo.MSJ_MENSAJE_REACCIONES'))
ALTER TABLE dbo.MSJ_MENSAJE_REACCIONES ADD CONSTRAINT UQ_MSJ_REACCIONES_MENSAJE_USUARIO UNIQUE (MMR_MENSAJE_ID, MMR_USUARIO_ID);
`);
  } catch (err) {
    console.warn('⚠️ No se pudo crear UQ_MSJ_REACCIONES_MENSAJE_USUARIO:', err.message);
  }

  try {
    await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSJ_REACCIONES_MENSAJE' AND object_id = OBJECT_ID('dbo.MSJ_MENSAJE_REACCIONES'))
CREATE INDEX IX_MSJ_REACCIONES_MENSAJE ON dbo.MSJ_MENSAJE_REACCIONES(MMR_MENSAJE_ID);
`);
    logger.info('✅ Esquema de reacciones de mensajería asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo crear IX_MSJ_REACCIONES_MENSAJE:', err.message);
  }
}

// Encuestas: las tablas base (ENCUESTAS, ENCUESTA_PREGUNTAS, ENCUESTA_OPCIONES,
// ENCUESTA_ASIGNACION, ENCUESTA_RESPUESTAS) ya existen en la BD de producción sin DDL
// versionado en este repo — no se recrean aquí. Esta función solo agrega lo necesario
// para encuestas públicas (sin sesión): tipo de acceso, slug del link público, tabla de
// respondientes externos (nombre/email, sin cuenta de intranet) y el FK opcional desde
// ENCUESTA_RESPUESTAS hacia esa tabla nueva.
//
// DDL inferido de columnas ya existentes (referencia, no se ejecuta):
//   ENCUESTAS(ENC_ID, ENC_TITULO, ENC_DESCRIPCION, ENC_ESTADO, ENC_FECHA_INICIO, ENC_FECHA_FIN,
//     ENC_MAX_RESPUESTAS, ENC_CREADO_POR, ENC_FECHA_CREACION, ENC_VISIBILIDAD, ENC_PUBLICAR_EN)
//   ENCUESTA_RESPUESTAS(ERE_ID, ERE_ENC_ID, ERE_EPR_ID, ERE_EOP_ID, ERE_RESPUESTA_TEXTO,
//     ERE_NEUS_ID, ERE_FECHA_RESPUESTA)
async function ensureEncuestasSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.ENCUESTAS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ENCUESTAS') AND name='ENC_TIPO_ACCESO')
BEGIN
  ALTER TABLE dbo.ENCUESTAS ADD ENC_TIPO_ACCESO NVARCHAR(20) NOT NULL CONSTRAINT DF_ENCUESTAS_TIPO_ACCESO DEFAULT ('privada');
END

IF OBJECT_ID('dbo.ENCUESTAS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ENCUESTAS') AND name='ENC_SLUG_PUBLICO')
BEGIN
  ALTER TABLE dbo.ENCUESTAS ADD ENC_SLUG_PUBLICO NVARCHAR(50) NULL;
  CREATE UNIQUE INDEX UX_ENCUESTAS_SLUG_PUBLICO ON dbo.ENCUESTAS(ENC_SLUG_PUBLICO) WHERE ENC_SLUG_PUBLICO IS NOT NULL;
END

IF OBJECT_ID('dbo.ENCUESTA_RESPONDIENTES_PUBLICOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ENCUESTA_RESPONDIENTES_PUBLICOS (
    ERP_ID     INT IDENTITY(1,1) PRIMARY KEY,
    ERP_ENC_ID INT NOT NULL,
    ERP_NOMBRE NVARCHAR(150) NOT NULL,
    ERP_EMAIL  NVARCHAR(150) NOT NULL,
    ERP_FECHA  DATETIME NOT NULL DEFAULT GETDATE(),
    ERP_IP     NVARCHAR(50) NULL,
    CONSTRAINT FK_ERP_ENCUESTA FOREIGN KEY (ERP_ENC_ID) REFERENCES dbo.ENCUESTAS(ENC_ID) ON DELETE CASCADE
  );
  CREATE INDEX IX_ERP_ENC_EMAIL ON dbo.ENCUESTA_RESPONDIENTES_PUBLICOS(ERP_ENC_ID, ERP_EMAIL);
END

IF OBJECT_ID('dbo.ENCUESTA_RESPUESTAS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ENCUESTA_RESPUESTAS') AND name='ERE_RESPONDIENTE_PUB_ID')
BEGIN
  ALTER TABLE dbo.ENCUESTA_RESPUESTAS ADD ERE_RESPONDIENTE_PUB_ID INT NULL
    CONSTRAINT FK_ERE_RESPONDIENTE_PUB FOREIGN KEY REFERENCES dbo.ENCUESTA_RESPONDIENTES_PUBLICOS(ERP_ID);
END

IF OBJECT_ID('dbo.ENCUESTAS', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ENCUESTAS') AND name='ENC_CATEGORIA')
BEGIN
  ALTER TABLE dbo.ENCUESTAS ADD ENC_CATEGORIA NVARCHAR(30) NULL;
END
`);

    // ERE_NEUS_ID debe admitir NULL para respuestas públicas (sin usuario de intranet).
    // Se hace en un batch separado porque requiere leer el estado real de la columna primero.
    const col = await pool.request().query(`
      SELECT c.is_nullable
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('dbo.ENCUESTA_RESPUESTAS') AND c.name = 'ERE_NEUS_ID'
    `);
    if (col.recordset.length > 0 && col.recordset[0].is_nullable === false) {
      await pool.request().batch(`ALTER TABLE dbo.ENCUESTA_RESPUESTAS ALTER COLUMN ERE_NEUS_ID SMALLINT NULL;`);
      logger.info('✅ ERE_NEUS_ID ajustado a NULLable para respuestas públicas');
    }

    logger.info('✅ Esquema de encuestas (públicas) asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de encuestas:', err.message);
  }
}

// Plantilla fija de encuesta de satisfacción (punto 6 del flujo del documento):
// 8 dimensiones exactas, pública/activa, categoría 'satisfaccion', para que
// Atención al Cliente pueda enviarla desde el alta sin que nadie tenga que
// armarla a mano. Idempotente por título — si ya existe una encuesta con ese
// título exacto no se vuelve a crear, aunque el usuario luego la edite/borre.
const ENCUESTA_SATISFACCION_TITULO = 'Satisfacción del cliente';
const ENCUESTA_SATISFACCION_PREGUNTAS = [
  { texto: 'Calidad del servicio', tipo: 'opcion_multiple' },
  { texto: 'Atención recibida', tipo: 'opcion_multiple' },
  { texto: 'Tiempo de respuesta', tipo: 'opcion_multiple' },
  { texto: 'Facilidad del proceso', tipo: 'opcion_multiple' },
  { texto: 'Cumplimiento de expectativas', tipo: 'opcion_multiple' },
  { texto: 'Satisfacción general', tipo: 'opcion_multiple' },
  { texto: 'Recomendación del servicio', tipo: 'opcion_multiple' },
  { texto: 'Comentarios adicionales', tipo: 'texto' },
];
const ENCUESTA_SATISFACCION_OPCIONES = ['Muy satisfecho', 'Satisfecho', 'Regular', 'Insatisfecho', 'Muy insatisfecho'];

async function ensureEncuestaSatisfaccionClienteSeed(pool) {
  try {
    const existe = await pool.request()
      .input('titulo', require('mssql').NVarChar(200), ENCUESTA_SATISFACCION_TITULO)
      .query(`SELECT TOP 1 ENC_ID FROM ENCUESTAS WHERE ENC_TITULO = @titulo`);
    if (existe.recordset.length > 0) return;

    const crypto = require('crypto');
    const sql = require('mssql');
    const slugPublico = crypto.randomBytes(8).toString('hex');

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const encuestaResult = await new sql.Request(transaction).query`
        INSERT INTO ENCUESTAS
          (ENC_TITULO, ENC_DESCRIPCION, ENC_FECHA_INICIO, ENC_FECHA_FIN, ENC_MAX_RESPUESTAS, ENC_ESTADO, ENC_CREADO_POR, ENC_FECHA_CREACION, ENC_VISIBILIDAD, ENC_PUBLICAR_EN, ENC_TIPO_ACCESO, ENC_SLUG_PUBLICO, ENC_CATEGORIA)
        VALUES
          (${ENCUESTA_SATISFACCION_TITULO}, ${'Encuesta estándar de satisfacción para clientes de Atención al Cliente.'},
           ${new Date()}, ${new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)}, ${100000}, ${'activa'}, ${1},
           GETDATE(), ${'general'}, ${'encuestas'}, ${'publica'}, ${slugPublico}, ${'satisfaccion'});
        SELECT SCOPE_IDENTITY() as encuestaId;
      `;
      const encuestaId = encuestaResult.recordset[0].encuestaId;

      let orden = 1;
      for (const p of ENCUESTA_SATISFACCION_PREGUNTAS) {
        const preguntaResult = await new sql.Request(transaction).query`
          INSERT INTO ENCUESTA_PREGUNTAS (EPR_ENC_ID, EPR_TEXTO, EPR_TIPO, EPR_PERMITE_MULTIPLE, EPR_ORDEN)
          VALUES (${encuestaId}, ${p.texto}, ${p.tipo}, ${0}, ${orden});
          SELECT SCOPE_IDENTITY() as preguntaId;
        `;
        const preguntaId = preguntaResult.recordset[0].preguntaId;

        if (p.tipo === 'opcion_multiple') {
          let opOrden = 1;
          for (const textoOpcion of ENCUESTA_SATISFACCION_OPCIONES) {
            await new sql.Request(transaction).query`
              INSERT INTO ENCUESTA_OPCIONES (EOP_EPR_ID, EOP_TEXTO, EOP_ORDEN)
              VALUES (${preguntaId}, ${textoOpcion}, ${opOrden});
            `;
            opOrden++;
          }
        }
        orden++;
      }

      await transaction.commit();
      logger.info(`✅ Encuesta de satisfacción del cliente creada (ENC_ID=${encuestaId}, slug=${slugPublico})`);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.warn('⚠️ EncuestaSatisfaccionClienteSeed:', err.message);
  }
}

// Catálogo unificado de productos/servicios (con precio y recurrencia) y su
// relación con clientes. Reemplaza en uso a las tablas legado PRODUCTOS/
// SERVICIOS/CLIENTE_PRODUCTOS/CLIENTE_SERVICIOS (que se dejan intactas por
// compatibilidad con clienteController.getProductos/getServicios), migrando
// su contenido una sola vez al crear la tabla nueva.
async function ensureProductosServiciosSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.PRODUCTOS_SERVICIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PRODUCTOS_SERVICIOS (
    PS_ID             INT IDENTITY(1,1) PRIMARY KEY,
    PS_TIPO           NVARCHAR(20)  NOT NULL,
    PS_NOMBRE         NVARCHAR(200) NOT NULL,
    PS_DESCRIPCION    NVARCHAR(500) NULL,
    PS_PRECIO         DECIMAL(18,2) NOT NULL DEFAULT 0,
    PS_RECURRENCIA    NVARCHAR(20)  NOT NULL DEFAULT 'UNICO',
    PS_ACTIVO         BIT           NOT NULL DEFAULT 1,
    PS_FECHA_REGISTRO DATETIME      NOT NULL DEFAULT GETDATE()
  );

  IF OBJECT_ID('dbo.PRODUCTOS', 'U') IS NOT NULL
  BEGIN
    INSERT INTO dbo.PRODUCTOS_SERVICIOS (PS_TIPO, PS_NOMBRE, PS_ACTIVO)
      SELECT 'PRODUCTO', PROD_NOMBRE, PROD_ACTIVO FROM dbo.PRODUCTOS;
  END

  IF OBJECT_ID('dbo.SERVICIOS', 'U') IS NOT NULL
  BEGIN
    INSERT INTO dbo.PRODUCTOS_SERVICIOS (PS_TIPO, PS_NOMBRE, PS_ACTIVO)
      SELECT 'SERVICIO', SERV_NOMBRE, SERV_ACTIVO FROM dbo.SERVICIOS;
  END
END
`);
  } catch (err) {
    console.warn('⚠️ ProductosServiciosSchema:', err.message);
  }

  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.CLIENTE_PRODUCTOS_SERVICIOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CLIENTE_PRODUCTOS_SERVICIOS (
    CPS_ID         INT IDENTITY(1,1) PRIMARY KEY,
    CL_ID          INT NOT NULL,
    PS_ID          INT NOT NULL,
    CPS_FECHA_ALTA DATETIME NOT NULL DEFAULT GETDATE(),
    CPS_ACTIVO     BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_CLIENTE_PS UNIQUE (CL_ID, PS_ID)
  );
  CREATE INDEX IX_CPS_CLIENTE ON dbo.CLIENTE_PRODUCTOS_SERVICIOS(CL_ID);
END
`);
  } catch (err) {
    console.warn('⚠️ ClienteProductosServiciosSchema:', err.message);
  }
}

// Inventario de activos de la empresa (mouse, teclado, monitor, cpu, laptop)
// asignables a un usuario. Tabla legado sin CREATE TABLE versionado hasta
// ahora — existía manualmente en 'agyda' pero nunca se creaba para empresas
// nuevas (ej. Edomex), causando 500 "Invalid object name 'ACTIVOS'" en
// cualquier request a /api/activos/*.
async function ensureActivosSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.ACTIVOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ACTIVOS (
    ACT_ID                  INT IDENTITY(1,1) PRIMARY KEY,
    ACT_TIPO                NVARCHAR(40)  NOT NULL,
    ACT_MARCA               NVARCHAR(200) NULL,
    ACT_MODELO              NVARCHAR(200) NULL,
    ACT_NUMERO_SERIE        NVARCHAR(200) NULL,
    ACT_ESTADO              NVARCHAR(40)  NOT NULL,
    ACT_ASIGNADO_A          SMALLINT      NULL,
    ACT_FECHA_ASIGNACION    DATETIME      NULL,
    ACT_ACTIVO              BIT           NOT NULL DEFAULT 1,
    ACT_FECHA_REGISTRO      DATETIME      NOT NULL DEFAULT GETDATE(),
    ACT_TERMINOS_ACEPTADOS  BIT           NOT NULL DEFAULT 0,
    ACT_FECHA_ACEPTACION    DATETIME      NULL,
    CONSTRAINT CK_ACT_TIPO CHECK (ACT_TIPO IN ('mouse','teclado','monitor','cpu','laptop')),
    CONSTRAINT CK_ACT_ESTADO CHECK (ACT_ESTADO IN ('baja','reparacion','asignado','disponible'))
  );
  CREATE INDEX IX_ACTIVOS_TIPO ON dbo.ACTIVOS(ACT_TIPO);
  CREATE INDEX IX_ACTIVOS_ASIGNADO ON dbo.ACTIVOS(ACT_ASIGNADO_A);
END
`);
    logger.info('✅ Esquema de activos asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de activos:', err.message);
  }
}

// Catálogo de estatus de presencia (online/comida/sanitario/etc.) y bitácora
// de tiempos por usuario — se consultan desde el login (marca de presencia) y
// desde el widget global de "pausa activa" (reportController.getPausaActiva),
// ambos fuera de cualquier gate de módulo. Tablas legado sin CREATE TABLE
// versionado hasta ahora.
async function ensureUsuarioTiemposSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.STATUS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.STATUS (
    status_id   TINYINT PRIMARY KEY,
    clave       VARCHAR(20)  NOT NULL,
    descripcion VARCHAR(100) NOT NULL
  );
  INSERT INTO dbo.STATUS (status_id, clave, descripcion) VALUES
    (1, 'online', 'Usuario en línea'),
    (2, 'comida', 'Usuario en horario de comida'),
    (3, 'sanitario', 'Usuario ausente momentáneamente'),
    (4, 'offline', 'Usuario desconectado'),
    (5, 'capacitacion', 'Usuario en capacitación'),
    (6, 'permiso', 'Usuario con permiso');
END
`);
    await pool.request().batch(`
IF OBJECT_ID('dbo.USUARIO_TIEMPOS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.USUARIO_TIEMPOS (
    tiempo_id         INT IDENTITY(1,1) PRIMARY KEY,
    neus_id           SMALLINT NOT NULL,
    status_id         TINYINT  NOT NULL,
    fecha_inicio      DATETIME NOT NULL,
    fecha_fin         DATETIME NULL,
    creado_en         DATETIME NOT NULL DEFAULT GETDATE(),
    duracion_minutos  INT      NULL,
    CONSTRAINT FK_TIEMPO_USUARIO FOREIGN KEY (neus_id) REFERENCES dbo.NEUS_USUARIOS(NEUS_ID),
    CONSTRAINT FK_TIEMPO_STATUS FOREIGN KEY (status_id) REFERENCES dbo.STATUS(status_id)
  );
END
`);
    logger.info('✅ Esquema de STATUS/USUARIO_TIEMPOS asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de STATUS/USUARIO_TIEMPOS:', err.message);
  }
}

async function ensureAuditoriaSchema(pool) {
  try {
    await pool.request().batch(`
IF OBJECT_ID('dbo.INTRANET_AUDITORIA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INTRANET_AUDITORIA (
    AUDIT_ID       INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID     INT NULL,
    USUARIO_NOMBRE NVARCHAR(200) NULL,
    MODULO         NVARCHAR(50)  NOT NULL,
    ACCION         NVARCHAR(50)  NOT NULL,
    ENTIDAD_ID     NVARCHAR(100) NULL,
    DETALLE        NVARCHAR(MAX) NULL,
    IP_ORIGEN      NVARCHAR(50)  NULL,
    FECHA          DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_AUDITORIA_FECHA   ON dbo.INTRANET_AUDITORIA(FECHA);
  CREATE INDEX IX_AUDITORIA_MODULO  ON dbo.INTRANET_AUDITORIA(MODULO);
  CREATE INDEX IX_AUDITORIA_USUARIO ON dbo.INTRANET_AUDITORIA(USUARIO_ID);
END
`);
    logger.info('✅ Esquema de auditoría asegurado');
  } catch (err) {
    console.warn('⚠️ No se pudo asegurar esquema de auditoría:', err.message);
  }
}

module.exports = {
    ensureNoticiasSchema,
    ensureAllSchemas,
    ensureEmpresasSchema,
    ensureEmpresasModulosSchema,
    loadDynamicTenants,
    ensureCommentsSchema,
    ensureReaccionesNoticiasSchema,
    ensureLayoutSchema,
    ensurePersonalizacionSchema,
    ensureReglamentoSchema,
    ensureTicketsSchema,
    ensureProfileSchema,
    ensurePermisosSchema,
    ensureCalendarioSchema,
    ensureExpedientesSchema,
    ensureUiBackgroundSchema,
    ensurePlaylistSchema,
    ensureAsistenciaSchema,
    ensureActivosGeneralesSchema,
    ensureContactoSchema,
    ensureExpedienteCompletoSchema,
    removeClientesUniqueConstraint,
    ensureAuditoriaSchema,
    ensureProductosServiciosSchema,
    ensureActivosSchema,
    ensureUsuarioTiemposSchema,
    ensureVacantesSchema,
    ensureCapacitacionSchema,
    ensureIncapacidadesSchema,
    ensureEvaluacionDesempenoSchema,
    ensureChatbotSchema,
    ensureLivechatSchema,
    ensureLivechatCampanasSchema,
    ensureEmailMarketingSchema,
    ensureMensajeriaSchema,
    ensureEncuestasSchema,
    ensureRolesSchema,
    ensurePerfilesSchema
};