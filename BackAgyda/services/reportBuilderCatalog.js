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
  fecha_rango: 'fecha_rango', // { desde, hasta } → col >= desde AND col < hasta+1d
  texto: 'texto',             // LIKE %valor%
  id: 'id',                   // = @valor  (int)
  id_lista: 'id_lista',       // IN (@v0,@v1,...)  (int[])
  enum: 'enum',               // IN (...)  (string[] de un set permitido)
};

/* ─────────────────────────────────────────────────────────────────────────
 *  ORÍGENES
 * ──────────────────────────────────────────────────────────────────────── */

const ORIGENES = {
  /* ═══ Interacciones atendidas (omnicanal: WhatsApp, Messenger, IG, web) ═══ */
  interacciones: {
    label: 'Interacciones atendidas',
    descripcion: 'Conversaciones omnicanal (WhatsApp, Messenger, Instagram, chat web): volumen, tiempos y resultado.',
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
      fecha:        { label: 'Fecha (inicio)', expr: 'CAST(i.CI_FECHA_INICIO AS date)', tipo: 'date' },
      canal:        { label: 'Canal', expr: 'ISNULL(cn.CN_NOMBRE, i.CI_TIPO)' },
      tipo_canal:   { label: 'Tipo de canal', expr: 'i.CI_TIPO' },
      campania:     { label: 'Campaña', expr: "ISNULL(ca.CM2_NOMBRE, '(sin campaña)')" },
      grupo:        { label: 'Skill / grupo', expr: "ISNULL(g.CG_NOMBRE, '(sin grupo)')" },
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
      tmo_seg:            { label: 'TMO promedio (seg)', expr: 'AVG(CASE WHEN i.CI_FECHA_CIERRE IS NOT NULL THEN DATEDIFF(SECOND, i.CI_FECHA_INICIO, i.CI_FECHA_CIERRE) END)', formato: 'duracion' },
      tmo_total_seg:      { label: 'Tiempo total conversación (seg)', expr: 'SUM(CASE WHEN i.CI_FECHA_CIERRE IS NOT NULL THEN DATEDIFF(SECOND, i.CI_FECHA_INICIO, i.CI_FECHA_CIERRE) END)', formato: 'duracion' },
      primera_resp_seg:   { label: 'Tiempo 1ª respuesta prom. (seg)', expr: 'AVG(CASE WHEN i.CI_FECHA_PRIMER_RESPUESTA IS NOT NULL THEN DATEDIFF(SECOND, i.CI_FECHA_INICIO, i.CI_FECHA_PRIMER_RESPUESTA) END)', formato: 'duracion' },
      rating_prom:        { label: 'Calificación promedio', expr: 'AVG(CAST(i.CI_RATING AS float))', formato: 'decimal' },
      con_rating:         { label: 'Con calificación', expr: 'COUNT(i.CI_RATING)', formato: 'entero' },
      clientes_unicos:    { label: 'Clientes únicos', expr: 'COUNT(DISTINCT ISNULL(i.CI_CLIENTE_EXT_ID, i.CI_CLIENTE_TELEFONO))', formato: 'entero' },
    },
    filtros: {
      fecha:        { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'i.CI_FECHA_INICIO', porDefecto: true },
      campania:     { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_CAMPANIA_ID' },
      grupo:        { label: 'Skill / grupo', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_GRUPO_ID' },
      agente:       { label: 'Agente', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_AGENTE_ID' },
      canal:        { label: 'Canal', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_CANAL_ID' },
      estado:       { label: 'Estado', tipo: FILTRO_TIPOS.enum, col: 'i.CI_ESTADO', valores: ['en_cola', 'activa', 'pendiente_tipificacion', 'cerrada'] },
      tipo_canal:   { label: 'Tipo de canal', tipo: FILTRO_TIPOS.enum, col: 'i.CI_TIPO', valores: ['whatsapp', 'messenger', 'instagram', 'web_publica', 'llamada'] },
      tipificacion: { label: 'Tipificación', tipo: FILTRO_TIPOS.id_lista, col: 'i.CI_TIPIFICACION_ID' },
    },
    ordenPorDefecto: 'fecha',
  },

  /* ═══ Mensajes ═══ */
  mensajes: {
    label: 'Mensajes de interacciones',
    descripcion: 'Volumen de mensajes intercambiados (cliente / agente / sistema) por interacción, agente o canal.',
    from: `
      dbo.CCO_MENSAJES m
      INNER JOIN dbo.CCO_INTERACCIONES i ON i.CI_ID = m.MG_INTERACCION_ID
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
      LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = i.CI_CAMPANIA_ID
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ISNULL(m.MG_AGENTE_ID, i.CI_AGENTE_ID)
    `,
    dimensiones: {
      fecha:     { label: 'Fecha', expr: 'CAST(m.MG_FECHA AS date)', tipo: 'date' },
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
    },
    filtros: {
      fecha:    { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'm.MG_FECHA', porDefecto: true },
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
    from: `
      dbo.WEBPHONE_LLAMADAS_TIPIFICADAS w
      LEFT JOIN dbo.CCO_CAMPANIA_POSTULANTES cp ON cp.CP_ID = w.WLT_POSTULANTE_ID
      LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = cp.CP_CAMPANIA_ID
    `,
    dimensiones: {
      fecha:        { label: 'Fecha', expr: 'CAST(w.WLT_FECHA AS date)', tipo: 'date' },
      tipificacion: { label: 'Tipificación', expr: 'w.WLT_TIPIFICACION' },
      extension:    { label: 'Extensión', expr: "ISNULL(w.WLT_EXTENSION, '(sin extensión)')" },
      campania:     { label: 'Campaña', expr: "ISNULL(ca.CM2_NOMBRE, '(sin campaña)')" },
      con_postulante:{ label: '¿Ligada a postulante?', expr: "CASE WHEN w.WLT_POSTULANTE_ID IS NOT NULL THEN 'Sí' ELSE 'No' END" },
    },
    metricas: {
      total:            { label: 'Llamadas', expr: 'COUNT(*)', formato: 'entero' },
      telefonos_unicos: { label: 'Teléfonos únicos', expr: 'COUNT(DISTINCT w.WLT_TELEFONO)', formato: 'entero' },
      con_observacion:  { label: 'Con observación', expr: "SUM(CASE WHEN LEN(ISNULL(w.WLT_OBSERVACIONES, '')) > 0 THEN 1 ELSE 0 END)", formato: 'entero' },
    },
    filtros: {
      fecha:        { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'w.WLT_FECHA', porDefecto: true },
      tipificacion: { label: 'Tipificación', tipo: FILTRO_TIPOS.texto, col: 'w.WLT_TIPIFICACION' },
      extension:    { label: 'Extensión', tipo: FILTRO_TIPOS.texto, col: 'w.WLT_EXTENSION' },
      campania:     { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'cp.CP_CAMPANIA_ID' },
    },
    ordenPorDefecto: 'fecha',
  },

  /* ═══ Tiempos de agentes ═══ */
  tiempos_agente: {
    label: 'Tiempos de agentes',
    descripcion: 'Sesiones y pausas por agente (comida, sanitario, capacitación, permiso, en línea): minutos y conteos.',
    from: `
      dbo.USUARIO_TIEMPOS ut
      INNER JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = ut.neus_id
      LEFT JOIN dbo.STATUS s ON s.status_id = ut.status_id
    `,
    dimensiones: {
      fecha:  { label: 'Fecha', expr: 'CAST(ut.fecha_inicio AS date)', tipo: 'date' },
      agente: { label: 'Agente', expr: 'u.NEUS_NOMBRES' },
      estado: { label: 'Estado', expr: "ISNULL(s.descripcion, s.clave)" },
      clave:  { label: 'Clave de estado', expr: 's.clave' },
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
      min_pausa:    { label: 'Minutos en pausa', expr: `SUM(CASE WHEN ut.status_id IN (2,3,5,6) THEN ${DUR_TIEMPO_TRAMO} ELSE 0 END)`, formato: 'minutos' },
      min_online:   { label: 'Minutos en línea', expr: `SUM(CASE WHEN ut.status_id = 1 THEN ${DUR_TIEMPO_TRAMO} ELSE 0 END)`, formato: 'minutos' },
      sesiones_abiertas: { label: 'Sesiones sin cerrar', expr: 'SUM(CASE WHEN ut.fecha_fin IS NULL THEN 1 ELSE 0 END)', formato: 'entero' },
    },
    filtros: {
      fecha:  { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'ut.fecha_inicio', porDefecto: true },
      agente: { label: 'Agente', tipo: FILTRO_TIPOS.id_lista, col: 'ut.neus_id' },
      estado: { label: 'Estado', tipo: FILTRO_TIPOS.enum, col: 's.clave', valores: ['online', 'comida', 'sanitario', 'capacitacion', 'permiso', 'offline'] },
    },
    ordenPorDefecto: 'agente',
  },

  /* ═══ Postulantes ═══ */
  postulantes: {
    label: 'Postulantes',
    descripcion: 'Postulantes registrados por campaña y su seguimiento (notas de agentes).',
    from: `
      dbo.CCO_CAMPANIA_POSTULANTES cp
      INNER JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = cp.CP_CAMPANIA_ID
      LEFT JOIN (
        SELECT PN_POSTULANTE_ID, COUNT(*) AS notas, MAX(PN_FECHA) AS ultima_nota
        FROM dbo.CCO_POSTULANTE_NOTAS GROUP BY PN_POSTULANTE_ID
      ) n ON n.PN_POSTULANTE_ID = cp.CP_ID
    `,
    dimensiones: {
      fecha:    { label: 'Fecha de registro', expr: 'CAST(cp.CP_FECHA_REGISTRO AS date)', tipo: 'date' },
      campania: { label: 'Campaña', expr: 'ca.CM2_NOMBRE' },
      con_correo:{ label: '¿Tiene correo?', expr: "CASE WHEN LEN(ISNULL(cp.CP_CORREO, '')) > 0 THEN 'Sí' ELSE 'No' END" },
      gestionado:{ label: '¿Gestionado?', expr: "CASE WHEN n.notas > 0 THEN 'Sí' ELSE 'No' END" },
    },
    metricas: {
      total:          { label: 'Postulantes', expr: 'COUNT(*)', formato: 'entero' },
      con_notas:      { label: 'Con seguimiento', expr: 'SUM(CASE WHEN n.notas > 0 THEN 1 ELSE 0 END)', formato: 'entero' },
      notas_totales:  { label: 'Notas registradas', expr: 'SUM(ISNULL(n.notas, 0))', formato: 'entero' },
      con_correo_c:   { label: 'Con correo', expr: "SUM(CASE WHEN LEN(ISNULL(cp.CP_CORREO, '')) > 0 THEN 1 ELSE 0 END)", formato: 'entero' },
    },
    filtros: {
      fecha:    { label: 'Rango de fechas', tipo: FILTRO_TIPOS.fecha_rango, col: 'cp.CP_FECHA_REGISTRO', porDefecto: true },
      campania: { label: 'Campaña', tipo: FILTRO_TIPOS.id_lista, col: 'cp.CP_CAMPANIA_ID' },
    },
    ordenPorDefecto: 'fecha',
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 *  Catálogos auxiliares para poblar los selectores de filtro en el front
 * ──────────────────────────────────────────────────────────────────────── */

const CATALOGOS_FILTRO = {
  campania: `SELECT CM2_ID AS id, CM2_NOMBRE AS nombre FROM dbo.CCO_CAMPANIAS ORDER BY CM2_NOMBRE`,
  grupo:    `SELECT CG_ID AS id, CG_NOMBRE AS nombre FROM dbo.CCO_GRUPOS WHERE CG_ACTIVO = 1 ORDER BY CG_NOMBRE`,
  canal:    `SELECT CN_ID AS id, CN_NOMBRE AS nombre FROM dbo.CCO_CANALES ORDER BY CN_NOMBRE`,
  agente:   `SELECT NEUS_ID AS id, NEUS_NOMBRES AS nombre FROM dbo.NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 ORDER BY NEUS_NOMBRES`,
  tipificacion: `SELECT CT_ID AS id, CT_NOMBRE AS nombre FROM dbo.CCO_TIPIFICACIONES WHERE CT_ACTIVO = 1 ORDER BY CT_NOMBRE`,
};

/* Vista "pública" del catálogo — sin exponer expresiones SQL. */
function catalogoPublico() {
  const origenes = {};
  for (const [id, o] of Object.entries(ORIGENES)) {
    origenes[id] = {
      id,
      label: o.label,
      descripcion: o.descripcion,
      dimensiones: Object.entries(o.dimensiones).map(([k, d]) => ({ id: k, label: d.label, tipo: d.tipo || 'texto' })),
      metricas: Object.entries(o.metricas).map(([k, m]) => ({ id: k, label: m.label, formato: m.formato })),
      filtros: Object.entries(o.filtros).map(([k, f]) => ({
        id: k, label: f.label, tipo: f.tipo,
        valores: f.valores || null,
        catalogo: CATALOGOS_FILTRO[k] ? k : null,
        porDefecto: !!f.porDefecto,
      })),
      ordenPorDefecto: o.ordenPorDefecto,
    };
  }
  return { origenes };
}

module.exports = { ORIGENES, CATALOGOS_FILTRO, FILTRO_TIPOS, catalogoPublico, sql };
