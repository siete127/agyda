/**
 * Catálogo declarativo del Constructor de Reportes de la Suite de Reportes
 * (Contact Center). Inspirado en los reportes estándar de plataformas como
 * InConcert: Tiempos de agentes, Llamadas atendidas, Interacciones atendidas,
 * Tipificaciones, etc.
 *
 * Cada ORIGEN describe una consulta base segura (FROM + JOINs fijos) y un
 * conjunto cerrado de:
 *   - dimensiones  → columnas por las que se puede agrupar / mostrar / filtrar
 *   - metricas     → agregaciones (COUNT, SUM, AVG…) sobre expresiones fijas
 *   - filtros      → predicados parametrizados (fechas, ids, listas)
 *
 * El compilador (runReportBuilder) SOLO usa expresiones de este archivo — nada
 * viene del cliente como SQL. El cliente solo manda IDs de dimensiones/métricas/
 * filtros y valores de filtro, que se bindean con mssql.
 *
 * Grupos (Configuración → Grupos, tabla CC_EQUIPOS): cada origen declara cómo
 * se liga a un grupo (por su agente, su skill o su campaña). Eso da la
 * dimensión/filtro "Grupo" y el ALCANCE de un supervisor (solo sus grupos).
 * `requiere` = modalidades de grupo con las que el origen tiene sentido
 * (omnicanal → interacciones; marcador → llamadas).
 */

const sql = require('mssql');

// Duración (minutos) de un tramo de USUARIO_TIEMPOS, acotada a 16h para que una
// sesión que quedó abierta (fecha_fin NULL) no sume miles de minutos fantasma.
const DUR_TIEMPO_TRAMO =
  "CASE WHEN DATEDIFF(MINUTE, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE())) BETWEEN 0 AND 960 " +
  "THEN DATEDIFF(MINUTE, ut.fecha_inicio, ISNULL(ut.fecha_fin, GETDATE())) " +
  "WHEN ut.fecha_fin IS NULL THEN 0 ELSE 960 END";
const DUR_TIEMPO = `SUM(${DUR_TIEMPO_TRAMO})`;

// Tipos de dato de filtro y cómo se bindean
const FILTRO_TIPOS = {
  fecha_rango: 'fecha_rango', // { desde, hasta } o { preset } → col >= desde AND col < hasta+1d
  hora_rango: 'hora_rango',   // { desde, hasta } horas 0-23 → DATEPART(HOUR, col) BETWEEN
  texto: 'texto',             // LIKE %valor%   (excluir → NOT LIKE)
  id: 'id',                   // = @valor  (int)
  id_lista: 'id_lista',       // IN (@v0,@v1,...)  (int[])   (excluir → NOT IN)
  enum: 'enum',               // IN (...)  (string[] de un set permitido)
  grupo: 'grupo',             // grupos de Configuración (CC_EQUIPOS), por agente/skill/campaña
};

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const diaSemanaExpr = (col) => `(((DATEPART(WEEKDAY, ${col}) + @@DATEFIRST - 2) % 7) + 1)`;

// Dimensiones de tiempo a partir de la columna de fecha del origen.
function dimsTiempo(col, etiqueta) {
  return {
    fecha:      { label: `${etiqueta} (día)`, expr: `CAST(${col} AS date)`, tipo: 'date', tiempo: true },
    semana:     { label: 'Semana (inicia lunes)', expr: `CAST(DATEADD(DAY, -((DATEPART(WEEKDAY, ${col}) + @@DATEFIRST - 2) % 7), CAST(${col} AS date)) AS date)`, tipo: 'date', tiempo: true },
    mes:        { label: 'Mes', expr: `CONVERT(char(7), ${col}, 120)`, tipo: 'mes', tiempo: true },
    trimestre:  { label: 'Trimestre', expr: `CONCAT(YEAR(${col}), '-T', DATEPART(QUARTER, ${col}))`, tipo: 'texto', tiempo: true },
    anio:       { label: 'Año', expr: `YEAR(${col})`, tipo: 'anio', tiempo: true },
    dia_semana: { label: 'Día de la semana', expr: diaSemanaExpr(col), tipo: 'dia_semana', tiempo: true },
    hora:       { label: 'Hora del día', expr: `DATEPART(HOUR, ${col})`, tipo: 'hora', tiempo: true },
  };
}

// Filtros de calendario comunes (rango de horas y días de la semana).
function filtrosCalendario(col) {
  return {
    hora:       { label: 'Horario', tipo: FILTRO_TIPOS.hora_rango, col },
    dia_semana: { label: 'Días de la semana', tipo: FILTRO_TIPOS.enum, col: diaSemanaExpr(col), valores: ['1', '2', '3', '4', '5', '6', '7'], etiquetas: DIAS },
  };
}

// Cómo pertenece una fila a un grupo de Configuración: por su agente (miembro
// con rol agente), su skill (CC_EQUIPO_SKILLS) o su campaña (CC_EQUIPO_CAMPANIAS).
// Devuelve la condición para filtrar (con {ids}) y el OUTER APPLY para la
// dimensión (primer grupo activo que coincide).
function ligaGrupo({ agente, skill, campania }) {
  const conds = (ids) => [
    agente && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_MIEMBROS gm WHERE gm.EQM_EQUIPO_ID IN (${ids}) AND gm.EQM_ROL = 'agente' AND gm.EQM_USUARIO_ID = ${agente})`,
    skill && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_SKILLS gs WHERE gs.EQS_EQUIPO_ID IN (${ids}) AND gs.EQS_GRUPO_ID = ${skill})`,
    campania && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_CAMPANIAS gc WHERE gc.EQC_EQUIPO_ID IN (${ids}) AND gc.EQC_CAMPANIA_ID = ${campania})`,
    // Grupos viejos guardaban una sola campaña en CC_EQUIPOS.EQ_CAMPANIA_ID.
    campania && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPOS ge WHERE ge.EQ_ID IN (${ids}) AND ge.EQ_CAMPANIA_ID = ${campania})`,
  ].filter(Boolean);
  const condApply = [
    campania && `e.EQ_CAMPANIA_ID = ${campania}`,
    agente && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_MIEMBROS gm WHERE gm.EQM_EQUIPO_ID = e.EQ_ID AND gm.EQM_ROL = 'agente' AND gm.EQM_USUARIO_ID = ${agente})`,
    skill && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_SKILLS gs WHERE gs.EQS_EQUIPO_ID = e.EQ_ID AND gs.EQS_GRUPO_ID = ${skill})`,
    campania && `EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_CAMPANIAS gc WHERE gc.EQC_EQUIPO_ID = e.EQ_ID AND gc.EQC_CAMPANIA_ID = ${campania})`,
  ].filter(Boolean);
  return {
    condicion: (ids) => `(${conds(ids).join(' OR ')})`,
    apply: `OUTER APPLY (SELECT TOP 1 e.EQ_NOMBRE AS nombre FROM dbo.CC_EQUIPOS e WHERE e.EQ_ACTIVO = 1 AND (${condApply.join(' OR ')}) ORDER BY e.EQ_ID) gq`,
  };
}
const dimGrupo = (liga) => ({ label: 'Grupo', expr: "ISNULL(gq.nombre, '(sin grupo)')", apply: liga.apply });
const filtroGrupo = (liga) => ({ label: 'Grupo', tipo: FILTRO_TIPOS.grupo, condicion: liga.condicion, catalogo: 'equipo' });

/* ─────────────────────────────────────────────────────────────────────────
 *  ORÍGENES
 * ──────────────────────────────────────────────────────────────────────── */

const LIGA_INTERACCIONES = ligaGrupo({ agente: 'i.CI_AGENTE_ID', skill: 'i.CI_GRUPO_ID' });
const LIGA_MENSAJES = ligaGrupo({ agente: 'ISNULL(m.MG_AGENTE_ID, i.CI_AGENTE_ID)', skill: 'i.CI_GRUPO_ID' });
const LIGA_LLAMADAS = ligaGrupo({ campania: 'cp.CP_CAMPANIA_ID' });
const LIGA_TIEMPOS = ligaGrupo({ agente: 'ut.neus_id' });
const LIGA_POSTULANTES = ligaGrupo({ campania: 'cp.CP_CAMPANIA_ID' });

const pct = (num, den) => `CAST(${num} * 100.0 / NULLIF(${den}, 0) AS decimal(9,1))`;

const ORIGENES = {
  /* ═══ Interacciones atendidas (omnicanal: WhatsApp, Messenger, IG, web) ═══ */
  interacciones: {
    label: 'Interacciones atendidas',
    descripcion: 'Conversaciones omnicanal (WhatsApp, Messenger, Instagram, chat web): volumen, tiempos y resultado.',
    requiere: ['omnicanal', 'ambos'],
    liga: LIGA_INTERACCIONES,
    from: `
      dbo.CCO_INTERACCIONES i
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
      LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = i.CI_CAMPANIA_ID
      LEFT JOIN dbo.CCO_GRUPOS g ON g.CG_ID = i.CI_GRUPO_ID
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = i.CI_AGENTE_ID
      LEFT JOIN dbo.CCO_TIPIFICACIONES t ON t.CT_ID = i.CI_TIPIFICACION_ID
      LEFT JOIN dbo.CCO_MOTIVOS_CIERRE mc ON mc.CMC_ID = i.CI_MOTIVO_CIERRE_ID
    `,
    dimensiones: {
      ...dimsTiempo('i.CI_FECHA_INICIO', 'Fecha de inicio'),
      equipo:       dimGrupo(LIGA_INTERACCIONES),
      canal:        { label: 'Canal', expr: 'ISNULL(cn.CN_NOMBRE, i.CI_TIPO)' },
      tipo_canal:   { label: 'Tipo de canal', expr: 'i.CI_TIPO' },
      campania:     { label: 'Campaña', expr: "ISNULL(ca.CM2_NOMBRE, '(sin campaña)')" },
      grupo:        { label: 'Skill', expr: "ISNULL(g.CG_NOMBRE, '(sin skill)')" },
      agente:       { label: 'Agente', expr: "ISNULL(u.NEUS_NOMBRES, i.CI_AGENTE_NOMBRE)" },
      estado:       { label: 'Estado', expr: 'i.CI_ESTADO' },
      tipificacion: { label: 'Tipificación', expr: "ISNULL(t.CT_NOMBRE, '(sin tipificar)')" },
      motivo_cierre:{ label: 'Motivo de cierre', expr: "ISNULL(mc.CMC_MOTIVO, '(sin motivo)')" },
      rating:       { label: 'Calificación (1-5)', expr: 'i.CI_RATING' },
    },
    metricas: {
      total:              { label: 'Interacciones', expr: 'COUNT(*)', formato: 'entero' },
      cerradas:           { label: 'Cerradas', expr: "SUM(CASE WHEN i.CI_ESTADO = 'cerrada' THEN 1 ELSE 0 END)", formato: 'entero' },
      en_cola:            { label: 'En cola', expr: "SUM(CASE WHEN i.CI_ESTADO = 'en_cola' THEN 1 ELSE 0 END)", formato: 'entero' },
      atendidas:          { label: 'Atendidas (con agente)', expr: 'COUNT(i.CI_AGENTE_ID)', formato: 'entero' },
      pct_cerradas:       { label: '% cerradas', expr: pct("SUM(CASE WHEN i.CI_ESTADO = 'cerrada' THEN 1 ELSE 0 END)", 'COUNT(*)'), formato: 'porcentaje' },
      tmo_seg:            { label: 'TMO promedio', expr: 'AVG(CASE WHEN i.CI_FECHA_CIERRE IS NOT NULL THEN DATEDIFF(SECOND, i.CI_FECHA_INICIO, i.CI_FECHA_CIERRE) END)', formato: 'duracion' },
      tmo_total_seg:      { label: 'Tiempo total de conversación', expr: 'SUM(CASE WHEN i.CI_FECHA_CIERRE IS NOT NULL THEN DATEDIFF(SECOND, i.CI_FECHA_INICIO, i.CI_FECHA_CIERRE) END)', formato: 'duracion' },
      primera_resp_seg:   { label: 'Tiempo de 1ª respuesta prom.', expr: 'AVG(CASE WHEN i.CI_FECHA_PRIMER_RESPUESTA IS NOT NULL THEN DATEDIFF(SECOND, i.CI_FECHA_INICIO, i.CI_FECHA_PRIMER_RESPUESTA) END)', formato: 'duracion' },
      rating_prom:        { label: 'Calificación promedio', expr: 'AVG(CAST(i.CI_RATING AS float))', formato: 'decimal' },
      con_rating:         { label: 'Con calificación', expr: 'COUNT(i.CI_RATING)', formato: 'entero' },
      pct_con_rating:     { label: '% con calificación', expr: pct('COUNT(i.CI_RATING)', 'COUNT(*)'), formato: 'porcentaje' },
      clientes_unicos:    { label: 'Clientes únicos', expr: 'COUNT(DISTINCT ISNULL(i.CI_CLIENTE_EXT_ID, i.CI_CLIENTE_TELEFONO))', formato: 'entero' },
      agentes:            { label: 'Agentes', expr: 'COUNT(DISTINCT i.CI_AGENTE_ID)', formato: 'entero' },
      prom_por_agente:    { label: 'Interacciones por agente', expr: 'CAST(COUNT(i.CI_AGENTE_ID) * 1.0 / NULLIF(COUNT(DISTINCT i.CI_AGENTE_ID), 0) AS decimal(9,1))', formato: 'decimal' },
    },
    filtros: {
      fecha:        { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'i.CI_FECHA_INICIO', porDefecto: true },
      ...filtrosCalendario('i.CI_FECHA_INICIO'),
      equipo:       filtroGrupo(LIGA_INTERACCIONES),
      campania:     { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_CAMPANIA_ID' },
      grupo:        { label: 'Skill', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_GRUPO_ID' },
      agente:       { label: 'Agente', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_AGENTE_ID' },
      canal:        { label: 'Canal', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_CANAL_ID' },
      estado:       { label: 'Estado', tipo: FILTRO_TIPOS.enum, col: 'i.CI_ESTADO', valores: ['en_cola', 'activa', 'pendiente_tipificacion', 'cerrada'] },
      tipo_canal:   { label: 'Tipo de canal', tipo: FILTRO_TIPOS.enum, col: 'i.CI_TIPO', valores: ['whatsapp', 'messenger', 'instagram', 'web_publica', 'llamada'] },
      tipificacion: { label: 'Tipificación', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_TIPIFICACION_ID' },
      motivo_cierre:{ label: 'Motivo de cierre', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_MOTIVO_CIERRE_ID' },
      rating:       { label: 'Calificación', tipo: FILTRO_TIPOS.enum, col: 'CAST(i.CI_RATING AS nvarchar(2))', valores: ['1', '2', '3', '4', '5'] },
      telefono:     { label: 'Teléfono del cliente', tipo: FILTRO_TIPOS.texto, col: 'i.CI_CLIENTE_TELEFONO' },
    },
    ordenPorDefecto: 'fecha',
  },

  /* ═══ Mensajes ═══ */
  mensajes: {
    label: 'Mensajes de interacciones',
    descripcion: 'Volumen de mensajes intercambiados (cliente / agente / sistema) por interacción, agente o canal.',
    requiere: ['omnicanal', 'ambos'],
    liga: LIGA_MENSAJES,
    from: `
      dbo.CCO_MENSAJES m
      INNER JOIN dbo.CCO_INTERACCIONES i ON i.CI_ID = m.MG_INTERACCION_ID
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
      LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = i.CI_CAMPANIA_ID
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ISNULL(m.MG_AGENTE_ID, i.CI_AGENTE_ID)
    `,
    dimensiones: {
      ...dimsTiempo('m.MG_FECHA', 'Fecha'),
      equipo:    dimGrupo(LIGA_MENSAJES),
      emisor:    { label: 'Emisor', expr: 'm.MG_EMISOR' },
      canal:     { label: 'Canal', expr: 'ISNULL(cn.CN_NOMBRE, i.CI_TIPO)' },
      campania:  { label: 'Campaña', expr: "ISNULL(ca.CM2_NOMBRE, '(sin campaña)')" },
      agente:    { label: 'Agente', expr: "ISNULL(u.NEUS_NOMBRES, i.CI_AGENTE_NOMBRE)" },
    },
    metricas: {
      total:        { label: 'Mensajes', expr: 'COUNT(*)', formato: 'entero' },
      de_cliente:   { label: 'De cliente', expr: "SUM(CASE WHEN m.MG_EMISOR = 'cliente' THEN 1 ELSE 0 END)", formato: 'entero' },
      de_agente:    { label: 'De agente', expr: "SUM(CASE WHEN m.MG_EMISOR = 'agente' THEN 1 ELSE 0 END)", formato: 'entero' },
      de_sistema:   { label: 'De sistema', expr: "SUM(CASE WHEN m.MG_EMISOR = 'sistema' THEN 1 ELSE 0 END)", formato: 'entero' },
      con_media:    { label: 'Con adjunto', expr: 'COUNT(m.MG_MEDIA_ID)', formato: 'entero' },
      interacciones:{ label: 'Interacciones', expr: 'COUNT(DISTINCT m.MG_INTERACCION_ID)', formato: 'entero' },
      por_interaccion: { label: 'Mensajes por interacción', expr: 'CAST(COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT m.MG_INTERACCION_ID), 0) AS decimal(9,1))', formato: 'decimal' },
    },
    filtros: {
      fecha:    { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'm.MG_FECHA', porDefecto: true },
      ...filtrosCalendario('m.MG_FECHA'),
      equipo:   filtroGrupo(LIGA_MENSAJES),
      emisor:   { label: 'Emisor', tipo: FILTRO_TIPOS.enum, col: 'm.MG_EMISOR', valores: ['cliente', 'agente', 'sistema'] },
      campania: { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_CAMPANIA_ID' },
      agente:   { label: 'Agente', tipo: FILTRO_TIPOS.id_lista, col: 'ISNULL(m.MG_AGENTE_ID, i.CI_AGENTE_ID)' },
    },
    ordenPorDefecto: 'fecha',
  },

  /* ═══ Llamadas atendidas (Webphone) ═══ */
  llamadas: {
    label: 'Llamadas atendidas',
    descripcion: 'Llamadas telefónicas tipificadas desde el Webphone: volumen por tipificación, extensión y fecha.',
    requiere: ['marcador', 'ambos'],
    liga: LIGA_LLAMADAS,
    from: `
      dbo.WEBPHONE_LLAMADAS_TIPIFICADAS w
      LEFT JOIN dbo.CCO_CAMPANIA_POSTULANTES cp ON cp.CP_ID = w.WLT_POSTULANTE_ID
      LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = cp.CP_CAMPANIA_ID
    `,
    dimensiones: {
      ...dimsTiempo('w.WLT_FECHA', 'Fecha'),
      equipo:       dimGrupo(LIGA_LLAMADAS),
      tipificacion: { label: 'Tipificación', expr: 'w.WLT_TIPIFICACION' },
      extension:    { label: 'Extensión', expr: "ISNULL(w.WLT_EXTENSION, '(sin extensión)')" },
      campania:     { label: 'Campaña', expr: "ISNULL(ca.CM2_NOMBRE, '(sin campaña)')" },
      con_postulante:{ label: '¿Ligada a postulante?', expr: "CASE WHEN w.WLT_POSTULANTE_ID IS NOT NULL THEN 'Sí' ELSE 'No' END" },
    },
    metricas: {
      total:            { label: 'Llamadas', expr: 'COUNT(*)', formato: 'entero' },
      telefonos_unicos: { label: 'Teléfonos únicos', expr: 'COUNT(DISTINCT w.WLT_TELEFONO)', formato: 'entero' },
      con_observacion:  { label: 'Con observación', expr: "SUM(CASE WHEN LEN(ISNULL(w.WLT_OBSERVACIONES, '')) > 0 THEN 1 ELSE 0 END)", formato: 'entero' },
      por_telefono:     { label: 'Llamadas por teléfono', expr: 'CAST(COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT w.WLT_TELEFONO), 0) AS decimal(9,1))', formato: 'decimal' },
    },
    filtros: {
      fecha:        { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'w.WLT_FECHA', porDefecto: true },
      ...filtrosCalendario('w.WLT_FECHA'),
      equipo:       filtroGrupo(LIGA_LLAMADAS),
      tipificacion: { label: 'Tipificación', tipo: FILTRO_TIPOS.texto, col: 'w.WLT_TIPIFICACION' },
      extension:    { label: 'Extensión', tipo: FILTRO_TIPOS.texto, col: 'w.WLT_EXTENSION' },
      campania:     { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'cp.CP_CAMPANIA_ID' },
      con_postulante:{ label: '¿Ligada a postulante?', tipo: FILTRO_TIPOS.enum, col: "CASE WHEN w.WLT_POSTULANTE_ID IS NOT NULL THEN N'Sí' ELSE N'No' END", valores: ['Sí', 'No'] },
    },
    ordenPorDefecto: 'fecha',
  },

  /* ═══ Tiempos de agentes ═══ */
  tiempos_agente: {
    label: 'Tiempos de agentes',
    descripcion: 'Sesiones y pausas por agente (todos los tipos de pausa y en línea): minutos y conteos.',
    requiere: null,
    liga: LIGA_TIEMPOS,
    from: `
      dbo.USUARIO_TIEMPOS ut
      INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
      LEFT JOIN dbo.STATUS s ON s.status_id = ut.status_id
    `,
    dimensiones: {
      ...dimsTiempo('ut.fecha_inicio', 'Fecha'),
      equipo: dimGrupo(LIGA_TIEMPOS),
      agente: { label: 'Agente', expr: 'u.NEUS_NOMBRES' },
      // Los tipos de pausa son configurables (Configuración): se muestra su etiqueta.
      estado: { label: 'Estado / pausa', expr: "ISNULL(s.ETIQUETA, ISNULL(s.descripcion, s.clave))" },
      clave:  { label: 'Clave de estado', expr: 's.clave' },
      es_pausa: { label: '¿Es pausa?', expr: "CASE WHEN s.ES_PAUSA = 1 THEN 'Pausa' ELSE 'No pausa' END" },
      abierta:{ label: '¿En curso?', expr: 'CASE WHEN ut.fecha_fin IS NULL THEN \'Sí\' ELSE \'No\' END' },
    },
    // Duración de cada tramo, acotada: si la sesión sigue abierta se mide hasta
    // ahora, pero nunca más de 16h (una jornada larga) — así una fila vieja que
    // nunca se cerró no infla el total con miles de minutos fantasma.
    metricas: {
      sesiones:     { label: 'Sesiones', expr: 'COUNT(*)', formato: 'entero' },
      minutos:      { label: 'Minutos', expr: DUR_TIEMPO, formato: 'minutos' },
      minutos_prom: { label: 'Minutos promedio', expr: `AVG(CAST(${DUR_TIEMPO_TRAMO} AS float))`, formato: 'decimal' },
      agentes:      { label: 'Agentes', expr: 'COUNT(DISTINCT ut.neus_id)', formato: 'entero' },
      min_pausa:    { label: 'Minutos en pausa', expr: `SUM(CASE WHEN s.ES_PAUSA = 1 THEN ${DUR_TIEMPO_TRAMO} ELSE 0 END)`, formato: 'minutos' },
      // Por clave, no por id: los ids de STATUS cambian entre empresas.
      min_online:   { label: 'Minutos en línea', expr: `SUM(CASE WHEN s.clave = 'online' THEN ${DUR_TIEMPO_TRAMO} ELSE 0 END)`, formato: 'minutos' },
      pct_pausa:    { label: '% del tiempo en pausa', expr: pct(`SUM(CASE WHEN s.ES_PAUSA = 1 THEN ${DUR_TIEMPO_TRAMO} ELSE 0 END)`, DUR_TIEMPO), formato: 'porcentaje' },
      sesiones_abiertas: { label: 'Sesiones sin cerrar', expr: 'SUM(CASE WHEN ut.fecha_fin IS NULL THEN 1 ELSE 0 END)', formato: 'entero' },
    },
    filtros: {
      fecha:  { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'ut.fecha_inicio', porDefecto: true },
      ...filtrosCalendario('ut.fecha_inicio'),
      equipo: filtroGrupo(LIGA_TIEMPOS),
      agente: { label: 'Agente', tipo: FILTRO_TIPOS.id_lista, col: 'ut.neus_id' },
      // Antes era una lista fija de claves: ahora toma los estados y pausas
      // configurados en la empresa (por clave, que es estable entre empresas).
      estado: { label: 'Estado / pausa', tipo: FILTRO_TIPOS.enum, col: 's.clave', valoresDe: 'estado_tiempo', catalogo: 'estado_tiempo' },
      es_pausa: { label: '¿Es pausa?', tipo: FILTRO_TIPOS.enum, col: "CASE WHEN s.ES_PAUSA = 1 THEN N'Pausa' ELSE N'No pausa' END", valores: ['Pausa', 'No pausa'] },
    },
    ordenPorDefecto: 'agente',
  },

  /* ═══ Postulantes ═══ */
  postulantes: {
    label: 'Postulantes',
    descripcion: 'Postulantes registrados por campaña y su seguimiento (notas de agentes).',
    requiere: null,
    liga: LIGA_POSTULANTES,
    from: `
      dbo.CCO_CAMPANIA_POSTULANTES cp
      INNER JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = cp.CP_CAMPANIA_ID
      LEFT JOIN (
        SELECT PN_POSTULANTE_ID, COUNT(*) AS notas, MAX(PN_FECHA) AS ultima_nota
        FROM dbo.CCO_POSTULANTE_NOTAS GROUP BY PN_POSTULANTE_ID
      ) n ON n.PN_POSTULANTE_ID = cp.CP_ID
    `,
    dimensiones: {
      ...dimsTiempo('cp.CP_FECHA_REGISTRO', 'Fecha de registro'),
      equipo:   dimGrupo(LIGA_POSTULANTES),
      campania: { label: 'Campaña', expr: 'ca.CM2_NOMBRE' },
      con_correo:{ label: '¿Tiene correo?', expr: "CASE WHEN LEN(ISNULL(cp.CP_CORREO, '')) > 0 THEN 'Sí' ELSE 'No' END" },
      gestionado:{ label: '¿Gestionado?', expr: "CASE WHEN n.notas > 0 THEN 'Sí' ELSE 'No' END" },
    },
    metricas: {
      total:          { label: 'Postulantes', expr: 'COUNT(*)', formato: 'entero' },
      con_notas:      { label: 'Con seguimiento', expr: 'SUM(CASE WHEN n.notas > 0 THEN 1 ELSE 0 END)', formato: 'entero' },
      pct_gestionados:{ label: '% con seguimiento', expr: pct('SUM(CASE WHEN n.notas > 0 THEN 1 ELSE 0 END)', 'COUNT(*)'), formato: 'porcentaje' },
      notas_totales:  { label: 'Notas registradas', expr: 'SUM(ISNULL(n.notas, 0))', formato: 'entero' },
      con_correo_c:   { label: 'Con correo', expr: "SUM(CASE WHEN LEN(ISNULL(cp.CP_CORREO, '')) > 0 THEN 1 ELSE 0 END)", formato: 'entero' },
    },
    filtros: {
      fecha:    { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'cp.CP_FECHA_REGISTRO', porDefecto: true },
      ...filtrosCalendario('cp.CP_FECHA_REGISTRO'),
      equipo:   filtroGrupo(LIGA_POSTULANTES),
      campania: { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'cp.CP_CAMPANIA_ID' },
      gestionado:{ label: '¿Gestionado?', tipo: FILTRO_TIPOS.enum, col: "CASE WHEN n.notas > 0 THEN N'Sí' ELSE N'No' END", valores: ['Sí', 'No'] },
      con_correo:{ label: '¿Tiene correo?', tipo: FILTRO_TIPOS.enum, col: "CASE WHEN LEN(ISNULL(cp.CP_CORREO, '')) > 0 THEN N'Sí' ELSE N'No' END", valores: ['Sí', 'No'] },
    },
    ordenPorDefecto: 'fecha',
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 *  Catálogos auxiliares para poblar los selectores de filtro en el front.
 *  `alcance` = null (todo) o SQL de ids de grupos visibles: los selectores de
 *  un supervisor solo muestran lo de sus grupos.
 * ──────────────────────────────────────────────────────────────────────── */

const CATALOGOS_FILTRO = {
  campania: (g) => `SELECT CM2_ID AS id, CM2_NOMBRE AS nombre FROM dbo.CCO_CAMPANIAS
    ${g ? `WHERE CM2_ID IN (SELECT EQC_CAMPANIA_ID FROM dbo.CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID IN (${g}))
       OR CM2_ID IN (SELECT EQ_CAMPANIA_ID FROM dbo.CC_EQUIPOS WHERE EQ_ID IN (${g}))` : ''} ORDER BY CM2_NOMBRE`,
  grupo: (g) => `SELECT CG_ID AS id, CG_NOMBRE AS nombre FROM dbo.CCO_GRUPOS WHERE CG_ACTIVO = 1
    ${g ? `AND CG_ID IN (SELECT EQS_GRUPO_ID FROM dbo.CC_EQUIPO_SKILLS WHERE EQS_EQUIPO_ID IN (${g}))` : ''} ORDER BY CG_NOMBRE`,
  canal: (g) => `SELECT CN_ID AS id, CN_NOMBRE AS nombre FROM dbo.CCO_CANALES
    ${g ? `WHERE CN_CAMPANIA_ID IN (SELECT EQC_CAMPANIA_ID FROM dbo.CC_EQUIPO_CAMPANIAS WHERE EQC_EQUIPO_ID IN (${g}))` : ''} ORDER BY CN_NOMBRE`,
  agente: (g) => `SELECT NEUS_ID AS id, NEUS_NOMBRES AS nombre FROM dbo.NEUS_USUARIOS WHERE NEUS_ACTIVO = 1
    ${g ? `AND NEUS_ID IN (SELECT EQM_USUARIO_ID FROM dbo.CC_EQUIPO_MIEMBROS WHERE EQM_EQUIPO_ID IN (${g}))` : ''} ORDER BY NEUS_NOMBRES`,
  tipificacion: () => `SELECT CT_ID AS id, CT_NOMBRE AS nombre FROM dbo.CCO_TIPIFICACIONES WHERE CT_ACTIVO = 1 ORDER BY CT_NOMBRE`,
  motivo_cierre: () => `SELECT CMC_ID AS id, CMC_MOTIVO AS nombre FROM dbo.CCO_MOTIVOS_CIERRE WHERE CMC_ACTIVO = 1 ORDER BY CMC_MOTIVO`,
  // id = clave (texto): el filtro de estado es por clave, no por status_id.
  estado_tiempo: () => `SELECT clave AS id, ISNULL(ETIQUETA, ISNULL(descripcion, clave)) AS nombre FROM dbo.STATUS WHERE ISNULL(ACTIVO, 1) = 1 ORDER BY ORDEN, status_id`,
  equipo: (g) => `SELECT EQ_ID AS id, EQ_NOMBRE AS nombre FROM dbo.CC_EQUIPOS WHERE EQ_ACTIVO = 1
    ${g ? `AND EQ_ID IN (${g})` : ''} ORDER BY EQ_NOMBRE`,
};

/* Vista "pública" del catálogo — sin exponer expresiones SQL. */
function catalogoPublico() {
  const origenes = {};
  for (const [id, o] of Object.entries(ORIGENES)) {
    origenes[id] = {
      id,
      label: o.label,
      descripcion: o.descripcion,
      requiere: o.requiere || null,
      dimensiones: Object.entries(o.dimensiones).map(([k, d]) => ({ id: k, label: d.label, tipo: d.tipo || 'texto', tiempo: !!d.tiempo })),
      metricas: Object.entries(o.metricas).map(([k, m]) => ({ id: k, label: m.label, formato: m.formato })),
      filtros: Object.entries(o.filtros).map(([k, f]) => ({
        id: k, label: f.label, tipo: f.tipo,
        valores: f.valores || null,
        etiquetas: f.etiquetas || null,
        catalogo: f.catalogo || (CATALOGOS_FILTRO[k] ? k : null),
        porDefecto: !!f.porDefecto,
      })),
      ordenPorDefecto: o.ordenPorDefecto,
    };
  }
  return { origenes };
}

module.exports = { ORIGENES, CATALOGOS_FILTRO, FILTRO_TIPOS, catalogoPublico, sql };
