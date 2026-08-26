// Catálogo fijo de métricas/dimensiones/filtros para el generador de Reportes ejecutivos.
// Única whitelist válida: el controller NUNCA interpola nombres de columna del body,
// siempre resuelve la selección del usuario contra estas listas antes de armar el SQL.

const LIMITE_METRICAS = 6;
const LIMITE_DIMENSIONES = 3;
const LIMITE_FILAS = 5000;

// CTE que replica calcularProgresoKr/calcularProgresoObjetivo (planeacionEstrategicaController.js:21-38) en SQL.
const OKR_FROM = `
  FROM AREA_OBJETIVOS_ESTRATEGICOS OE
  LEFT JOIN (
    SELECT
      RC.RC_ID, RC.RC_OBJETIVO_ID, RC.RC_TIPO, RC.RC_PESO, RC.RC_META, RC.RC_VALOR_ACTUAL, RC.RC_RESPONSABLE_ID,
      CASE
        WHEN RC.RC_TIPO = 'booleano' THEN CASE WHEN RC.RC_VALOR_ACTUAL > 0 THEN 100 ELSE 0 END
        WHEN RC.RC_TIPO = 'milestone' THEN ISNULL((
          SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(CASE WHEN MS.MS_COMPLETADO = 1 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 0) END
          FROM AREA_KR_MILESTONES MS WHERE MS.MS_KR_ID = RC.RC_ID
        ), 0)
        WHEN RC.RC_META > 0 THEN CASE WHEN ROUND(RC.RC_VALOR_ACTUAL / RC.RC_META * 100, 0) > 100 THEN 100
                                       WHEN ROUND(RC.RC_VALOR_ACTUAL / RC.RC_META * 100, 0) < 0 THEN 0
                                       ELSE ROUND(RC.RC_VALOR_ACTUAL / RC.RC_META * 100, 0) END
        ELSE 0
      END AS KR_PROGRESO
    FROM AREA_RESULTADOS_CLAVE RC
  ) RC ON RC.RC_OBJETIVO_ID = OE.OE_ID
  WHERE OE.OE_ACTIVO = 1
`;

const KPIS_FROM = `FROM AREA_KPIS AK WHERE 1=1`;

const DECISIONES_FROM = `
  FROM AREA_DECISIONES DE
  INNER JOIN AREA_DECISION_TIPOS DT ON DT.DT_ID = DE.DE_TIPO_ID
  WHERE 1=1
`;

const CATALOGO_FUENTES = {
  okr: {
    label: 'OKR / Planeación estratégica',
    from: OKR_FROM,
    metricas: [
      { key: 'okr_conteo_objetivos', label: 'Cantidad de objetivos', tipo: 'metrica', agregacion: 'COUNT', expresionSQL: 'DISTINCT OE.OE_ID', formato: 'entero' },
      { key: 'okr_conteo_kr', label: 'Cantidad de resultados clave', tipo: 'metrica', agregacion: 'COUNT', expresionSQL: 'RC.RC_ID', formato: 'entero' },
      { key: 'okr_progreso_prom_kr', label: 'Progreso promedio de KRs (%)', tipo: 'metrica', agregacion: 'AVG', expresionSQL: 'CAST(RC.KR_PROGRESO AS DECIMAL(10,2))', formato: 'porcentaje' },
      { key: 'okr_progreso_prom_objetivo', label: 'Progreso promedio ponderado (%)', tipo: 'metrica', agregacion: 'AVG_PONDERADO', expresionSQL: 'RC.KR_PROGRESO', pesoSQL: 'RC.RC_PESO', formato: 'porcentaje' },
      { key: 'okr_meta_suma', label: 'Suma de metas (numérico/moneda)', tipo: 'metrica', agregacion: 'SUM', expresionSQL: `CASE WHEN RC.RC_TIPO IN ('numerico','moneda') THEN RC.RC_META ELSE 0 END`, formato: 'moneda' },
      { key: 'okr_valor_actual_suma', label: 'Suma de valor actual (numérico/moneda)', tipo: 'metrica', agregacion: 'SUM', expresionSQL: `CASE WHEN RC.RC_TIPO IN ('numerico','moneda') THEN RC.RC_VALOR_ACTUAL ELSE 0 END`, formato: 'moneda' },
    ],
    dimensiones: [
      { key: 'oe_area_key', label: 'Área', agrupable: true, expresionSQL: 'OE.OE_AREA_KEY', formato: 'texto' },
      { key: 'oe_periodo', label: 'Periodo', agrupable: true, expresionSQL: 'OE.OE_PERIODO', formato: 'texto' },
      { key: 'oe_nivel', label: 'Nivel', agrupable: true, expresionSQL: 'OE.OE_NIVEL', formato: 'texto' },
      { key: 'oe_estatus', label: 'Estatus', agrupable: true, expresionSQL: 'OE.OE_ESTATUS', formato: 'texto' },
      { key: 'oe_estatus_manual', label: 'Semáforo (on/at/off track)', agrupable: true, expresionSQL: 'OE.OE_ESTATUS_MANUAL', formato: 'texto' },
      { key: 'oe_responsable_id', label: 'Responsable del objetivo', agrupable: true, expresionSQL: 'OE.OE_RESPONSABLE_ID', formato: 'texto' },
      { key: 'rc_tipo', label: 'Tipo de resultado clave', agrupable: true, expresionSQL: 'RC.RC_TIPO', formato: 'texto' },
      { key: 'rc_responsable_id', label: 'Responsable del KR', agrupable: true, expresionSQL: 'RC.RC_RESPONSABLE_ID', formato: 'texto' },
      { key: 'oe_created_month', label: 'Mes de creación', agrupable: true, expresionSQL: `FORMAT(OE.OE_CREATED_AT,'yyyy-MM')`, formato: 'texto' },
    ],
    filtrosPermitidos: {
      oeAreaKey: { columna: 'OE.OE_AREA_KEY', sqlType: 'NVarChar' },
      oePeriodo: { columna: 'OE.OE_PERIODO', sqlType: 'NVarChar' },
      oeNivel: { columna: 'OE.OE_NIVEL', sqlType: 'NVarChar' },
      oeEstatus: { columna: 'OE.OE_ESTATUS', sqlType: 'NVarChar' },
      oeEstatusManual: { columna: 'OE.OE_ESTATUS_MANUAL', sqlType: 'NVarChar' },
      oeResponsableId: { columna: 'OE.OE_RESPONSABLE_ID', sqlType: 'Int' },
      rcTipo: { columna: 'RC.RC_TIPO', sqlType: 'NVarChar' },
      desde: { columna: 'OE.OE_CREATED_AT', operador: '>=', sqlType: 'DateTime' },
      hasta: { columna: 'OE.OE_CREATED_AT', operador: '<=', sqlType: 'DateTime' },
    },
  },

  kpis: {
    label: 'Indicadores empresariales (KPIs)',
    from: KPIS_FROM,
    metricas: [
      { key: 'kpi_conteo', label: 'Cantidad de KPIs', tipo: 'metrica', agregacion: 'COUNT', expresionSQL: '*', formato: 'entero' },
      { key: 'kpi_valor_prom', label: 'Valor promedio', tipo: 'metrica', agregacion: 'AVG', expresionSQL: 'AK.AK_VALOR', formato: 'entero' },
      { key: 'kpi_valor_suma', label: 'Suma de valores', tipo: 'metrica', agregacion: 'SUM', expresionSQL: 'AK.AK_VALOR', formato: 'entero' },
      { key: 'kpi_meta_prom', label: 'Meta promedio', tipo: 'metrica', agregacion: 'AVG', expresionSQL: 'AK.AK_META', formato: 'entero' },
      { key: 'kpi_cumplimiento_prom', label: '% cumplimiento promedio', tipo: 'metrica', agregacion: 'AVG', expresionSQL: `CASE WHEN AK.AK_META > 0 THEN (AK.AK_VALOR / AK.AK_META) * 100 END`, formato: 'porcentaje' },
      { key: 'kpi_conteo_critical', label: 'Cantidad en semáforo crítico', tipo: 'metrica', agregacion: 'SUM', expresionSQL: `CASE WHEN AK.AK_TONO = 'critical' THEN 1 ELSE 0 END`, formato: 'entero' },
    ],
    dimensiones: [
      { key: 'ak_area_key', label: 'Área', agrupable: true, expresionSQL: 'AK.AK_AREA_KEY', formato: 'texto' },
      { key: 'ak_kpi_key', label: 'KPI', agrupable: true, expresionSQL: 'AK.AK_KPI_KEY', formato: 'texto' },
      { key: 'ak_periodo', label: 'Periodo (mes)', agrupable: true, expresionSQL: 'AK.AK_PERIODO', formato: 'texto' },
      { key: 'ak_tono', label: 'Semáforo', agrupable: true, expresionSQL: 'AK.AK_TONO', formato: 'texto' },
      { key: 'ak_responsable_id', label: 'Responsable', agrupable: true, expresionSQL: 'AK.AK_RESPONSABLE_ID', formato: 'texto' },
      { key: 'ak_origen', label: 'Origen del dato', agrupable: true, expresionSQL: 'AK.AK_ORIGEN', formato: 'texto' },
      { key: 'ak_fecha_corte_month', label: 'Mes de corte', agrupable: true, expresionSQL: `FORMAT(AK.AK_FECHA_CORTE,'yyyy-MM')`, formato: 'texto' },
    ],
    filtrosPermitidos: {
      akAreaKey: { columna: 'AK.AK_AREA_KEY', sqlType: 'NVarChar' },
      akKpiKey: { columna: 'AK.AK_KPI_KEY', sqlType: 'NVarChar' },
      akPeriodo: { columna: 'AK.AK_PERIODO', sqlType: 'NVarChar' },
      akTono: { columna: 'AK.AK_TONO', sqlType: 'NVarChar' },
      akResponsableId: { columna: 'AK.AK_RESPONSABLE_ID', sqlType: 'Int' },
      akOrigen: { columna: 'AK.AK_ORIGEN', sqlType: 'NVarChar' },
      desde: { columna: 'AK.AK_FECHA_CORTE', operador: '>=', sqlType: 'DateTime' },
      hasta: { columna: 'AK.AK_FECHA_CORTE', operador: '<=', sqlType: 'DateTime' },
    },
  },

  decisiones: {
    label: 'Toma de decisiones',
    from: DECISIONES_FROM,
    metricas: [
      { key: 'dec_conteo', label: 'Cantidad de solicitudes', tipo: 'metrica', agregacion: 'COUNT', expresionSQL: '*', formato: 'entero' },
      { key: 'dec_conteo_pendientes', label: 'Cantidad pendientes', tipo: 'metrica', agregacion: 'SUM', expresionSQL: `CASE WHEN DE.DE_ESTATUS = 'pendiente' THEN 1 ELSE 0 END`, formato: 'entero' },
      { key: 'dec_tiempo_resolucion_prom_horas', label: 'Tiempo promedio de resolución (h)', tipo: 'metrica', agregacion: 'AVG', expresionSQL: `CASE WHEN DE.DE_RESUELTA_AT IS NOT NULL THEN DATEDIFF(HOUR, DE.DE_CREATED_AT, DE.DE_RESUELTA_AT) END`, formato: 'entero' },
    ],
    dimensiones: [
      { key: 'de_tipo_nombre', label: 'Tipo de decisión', agrupable: true, expresionSQL: 'DT.DT_NOMBRE', formato: 'texto' },
      { key: 'de_estatus', label: 'Estatus', agrupable: true, expresionSQL: 'DE.DE_ESTATUS', formato: 'texto' },
      { key: 'de_prioridad', label: 'Prioridad', agrupable: true, expresionSQL: 'DE.DE_PRIORIDAD', formato: 'texto' },
      { key: 'de_solicitante_id', label: 'Solicitante', agrupable: true, expresionSQL: 'DE.DE_SOLICITANTE_ID', formato: 'texto' },
      { key: 'de_aprobador_id', label: 'Aprobador', agrupable: true, expresionSQL: 'DE.DE_APROBADOR_ID', formato: 'texto' },
      { key: 'de_created_month', label: 'Mes de creación', agrupable: true, expresionSQL: `FORMAT(DE.DE_CREATED_AT,'yyyy-MM')`, formato: 'texto' },
    ],
    filtrosPermitidos: {
      deTipoId: { columna: 'DE.DE_TIPO_ID', sqlType: 'Int' },
      deEstatus: { columna: 'DE.DE_ESTATUS', sqlType: 'NVarChar' },
      dePrioridad: { columna: 'DE.DE_PRIORIDAD', sqlType: 'NVarChar' },
      deSolicitanteId: { columna: 'DE.DE_SOLICITANTE_ID', sqlType: 'Int' },
      deAprobadorId: { columna: 'DE.DE_APROBADOR_ID', sqlType: 'Int' },
      desde: { columna: 'DE.DE_CREATED_AT', operador: '>=', sqlType: 'DateTime' },
      hasta: { columna: 'DE.DE_CREATED_AT', operador: '<=', sqlType: 'DateTime' },
    },
  },
};

function getCatalogoPublico() {
  const fuentes = Object.keys(CATALOGO_FUENTES).map((key) => ({ key, label: CATALOGO_FUENTES[key].label }));
  const porFuente = {};
  for (const key of Object.keys(CATALOGO_FUENTES)) {
    const f = CATALOGO_FUENTES[key];
    porFuente[key] = {
      metricas: f.metricas.map(({ key: k, label, tipo, agregacion, formato }) => ({ key: k, label, tipo, agregacion, formato })),
      dimensiones: f.dimensiones.map(({ key: k, label, agrupable, formato }) => ({ key: k, label, tipo: 'dimension', agrupable, formato })),
      filtros: Object.keys(f.filtrosPermitidos).map((k) => ({ key: k, label: FILTRO_LABEL[k] || k, tipo: FILTRO_TIPO[k] || 'texto' })),
    };
  }
  return { fuentes, porFuente };
}

// Labels/tipo de input sugerido para filtros compartidos entre fuentes (fecha, ids) o específicos.
const FILTRO_LABEL = {
  oeAreaKey: 'Área', oePeriodo: 'Periodo', oeNivel: 'Nivel', oeEstatus: 'Estatus', oeEstatusManual: 'Semáforo',
  oeResponsableId: 'Responsable (ID)', rcTipo: 'Tipo de KR',
  akAreaKey: 'Área', akKpiKey: 'KPI', akPeriodo: 'Periodo', akTono: 'Semáforo', akResponsableId: 'Responsable (ID)', akOrigen: 'Origen',
  deTipoId: 'Tipo de decisión (ID)', deEstatus: 'Estatus', dePrioridad: 'Prioridad', deSolicitanteId: 'Solicitante (ID)', deAprobadorId: 'Aprobador (ID)',
  desde: 'Desde', hasta: 'Hasta',
};
const FILTRO_TIPO = {
  desde: 'fecha', hasta: 'fecha',
  oeResponsableId: 'texto', akResponsableId: 'texto', deTipoId: 'texto', deSolicitanteId: 'texto', deAprobadorId: 'texto',
};

module.exports = {
  CATALOGO_FUENTES,
  getCatalogoPublico,
  LIMITE_METRICAS,
  LIMITE_DIMENSIONES,
  LIMITE_FILAS,
};
