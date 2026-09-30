/**
 * Plantillas del Constructor de Reportes y adaptación de una definición a un
 * grupo de Configuración.
 *
 * Una plantilla es una definición lista (sin ids de agentes, campañas ni
 * grupos), así sirve para cualquier empresa y cualquier grupo. Al usarla o al
 * "copiar de otro" reporte se hace una COPIA independiente: cambiar la copia no
 * toca el original, y viceversa.
 *
 * `requiere` sale del origen (omnicanal / marcador): una plantilla de llamadas
 * no aplica a un grupo solo omnicanal.
 */

const sql = require('mssql');
const { ORIGENES } = require('./reportBuilderCatalog');

const PLANTILLAS = [
  /* ── Resumen ── */
  {
    id: 'resumen_mes',
    categoria: 'Resumen',
    nombre: 'Resumen del mes',
    descripcion: 'Indicadores principales del mes en curso comparados con el mes anterior.',
    definicion: {
      origen: 'interacciones', dimensiones: [],
      metricas: ['total', 'atendidas', 'pct_cerradas', 'tmo_seg', 'primera_resp_seg', 'rating_prom'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], comparar: 'periodo_anterior',
      visual: { tipo: 'kpi' },
    },
  },
  {
    id: 'volumen_diario',
    categoria: 'Resumen',
    nombre: 'Volumen diario de interacciones',
    descripcion: 'Cuántas interacciones entran y se cierran cada día.',
    definicion: {
      origen: 'interacciones', dimensiones: ['fecha'], metricas: ['total', 'cerradas'],
      filtros: [{ id: 'fecha', preset: 'ult30' }], visual: { tipo: 'lineas' },
    },
  },
  {
    id: 'demanda_dia_hora',
    categoria: 'Resumen',
    nombre: 'Demanda por día y hora',
    descripcion: 'Mapa de calor para planear turnos: en qué días y horas entra más trabajo.',
    definicion: {
      origen: 'interacciones', dimensiones: ['dia_semana', 'hora'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'ult90' }], visual: { tipo: 'calor' }, limite: 500,
    },
  },
  {
    id: 'canales',
    categoria: 'Resumen',
    nombre: 'Interacciones por canal',
    descripcion: 'Qué canales (WhatsApp, Messenger, Instagram, web) concentran el volumen.',
    definicion: {
      origen: 'interacciones', dimensiones: ['tipo_canal'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], visual: { tipo: 'pastel' },
    },
  },

  /* ── Agentes ── */
  {
    id: 'productividad_agente',
    categoria: 'Agentes',
    nombre: 'Productividad por agente',
    descripcion: 'Interacciones atendidas, TMO y calificación de cada agente.',
    definicion: {
      origen: 'interacciones', dimensiones: ['agente'], metricas: ['atendidas', 'tmo_seg', 'rating_prom'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], orden: { campo: 'atendidas', dir: 'desc' },
      visual: { tipo: 'barras_h', pct: true },
    },
  },
  {
    id: 'calidad_agente',
    categoria: 'Agentes',
    nombre: 'Calidad por agente',
    descripcion: 'Calificación promedio de los clientes por agente (solo agentes con calificaciones).',
    definicion: {
      origen: 'interacciones', dimensiones: ['agente'], metricas: ['rating_prom', 'con_rating', 'pct_con_rating'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], condiciones: [{ metrica: 'con_rating', op: '>=', valor: 1 }],
      orden: { campo: 'rating_prom', dir: 'desc' }, visual: { tipo: 'barras_h' },
    },
  },
  {
    id: 'pausas_agente',
    categoria: 'Agentes',
    nombre: 'Pausas por agente',
    descripcion: 'Minutos de cada tipo de pausa por agente en la semana.',
    definicion: {
      origen: 'tiempos_agente', dimensiones: ['agente', 'estado'], metricas: ['minutos'],
      filtros: [{ id: 'fecha', preset: 'semana_actual' }, { id: 'es_pausa', valores: ['Pausa'] }],
      visual: { tipo: 'apiladas' }, limite: 2000,
    },
  },
  {
    id: 'pct_pausa_agente',
    categoria: 'Agentes',
    nombre: '% del tiempo en pausa',
    descripcion: 'Qué parte de su tiempo registrado pasa cada agente en pausa.',
    definicion: {
      origen: 'tiempos_agente', dimensiones: ['agente'], metricas: ['pct_pausa', 'min_pausa'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], orden: { campo: 'pct_pausa', dir: 'desc' },
      visual: { tipo: 'barras_h' },
    },
  },

  /* ── Tiempos de atención ── */
  {
    id: 'tiempos_semana',
    categoria: 'Tiempos de atención',
    nombre: 'Tiempos de respuesta por semana',
    descripcion: 'Evolución del tiempo de primera respuesta y del TMO semana a semana.',
    definicion: {
      origen: 'interacciones', dimensiones: ['semana'], metricas: ['primera_resp_seg', 'tmo_seg'],
      filtros: [{ id: 'fecha', preset: 'ult90' }], visual: { tipo: 'lineas' },
    },
  },
  {
    id: 'tipificaciones',
    categoria: 'Tiempos de atención',
    nombre: 'Resultados (tipificaciones)',
    descripcion: 'Con qué tipificación se cierran las interacciones.',
    definicion: {
      origen: 'interacciones', dimensiones: ['tipificacion'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], visual: { tipo: 'barras_h', pct: true },
    },
  },
  {
    id: 'mensajes_emisor',
    categoria: 'Tiempos de atención',
    nombre: 'Mensajes por día y emisor',
    descripcion: 'Mensajes de clientes, agentes y sistema cada día.',
    definicion: {
      origen: 'mensajes', dimensiones: ['fecha'], metricas: ['de_cliente', 'de_agente', 'de_sistema'],
      filtros: [{ id: 'fecha', preset: 'ult30' }], visual: { tipo: 'apiladas' },
    },
  },

  /* ── Marcador ── */
  {
    id: 'llamadas_dia',
    categoria: 'Marcador',
    nombre: 'Llamadas por día',
    descripcion: 'Llamadas tipificadas y teléfonos distintos contactados cada día.',
    definicion: {
      origen: 'llamadas', dimensiones: ['fecha'], metricas: ['total', 'telefonos_unicos'],
      filtros: [{ id: 'fecha', preset: 'ult30' }], visual: { tipo: 'lineas' },
    },
  },
  {
    id: 'llamadas_tipificacion',
    categoria: 'Marcador',
    nombre: 'Llamadas por tipificación',
    descripcion: 'Resultado de las llamadas del marcador.',
    definicion: {
      origen: 'llamadas', dimensiones: ['tipificacion'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], visual: { tipo: 'barras_h', pct: true },
    },
  },
  {
    id: 'llamadas_hora',
    categoria: 'Marcador',
    nombre: 'Llamadas por hora del día',
    descripcion: 'A qué horas se marcan y tipifican más llamadas.',
    definicion: {
      origen: 'llamadas', dimensiones: ['hora'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'ult30' }], visual: { tipo: 'barras' },
    },
  },

  {
    id: 'ventas_resumen_mes',
    categoria: 'Marcador',
    nombre: 'Resumen de ventas del mes',
    descripcion: 'Registros, ventas, conversión y ventas por asesor del mes, contra el mes anterior (BD de Ventas).',
    definicion: {
      origen: 'ventas', dimensiones: [],
      metricas: ['total', 'ventas', 'pct_conversion', 'asesores', 'ventas_por_asesor'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], comparar: 'periodo_anterior',
      visual: { tipo: 'kpi' },
    },
  },
  {
    id: 'ventas_asesor',
    categoria: 'Marcador',
    nombre: 'Ventas por asesor',
    descripcion: 'Ventas, registros y conversión de cada asesor en el mes.',
    definicion: {
      origen: 'ventas', dimensiones: ['asesor'], metricas: ['ventas', 'total', 'pct_conversion'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], orden: { campo: 'ventas', dir: 'desc' },
      visual: { tipo: 'barras_h' },
    },
  },
  {
    id: 'ventas_dia_estatus',
    categoria: 'Marcador',
    nombre: 'Ventas por día y estatus',
    descripcion: 'Cada día, cuántos registros quedaron aprobados, rechazados, agendados…',
    definicion: {
      origen: 'ventas', dimensiones: ['fecha', 'estatus'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'ult30' }], visual: { tipo: 'apiladas' }, limite: 2000,
    },
  },

  /* ── Reclutamiento ── */
  {
    id: 'postulantes_campania',
    categoria: 'Reclutamiento',
    nombre: 'Postulantes y seguimiento por campaña',
    descripcion: 'Postulantes registrados por campaña y qué porcentaje ya tiene seguimiento.',
    definicion: {
      origen: 'postulantes', dimensiones: ['campania'], metricas: ['total', 'con_notas', 'pct_gestionados'],
      filtros: [{ id: 'fecha', preset: 'mes_actual' }], visual: { tipo: 'barras_h' },
    },
  },
  {
    id: 'postulantes_semana',
    categoria: 'Reclutamiento',
    nombre: 'Postulantes por semana',
    descripcion: 'Registro semanal de postulantes, separando los que ya tienen seguimiento.',
    definicion: {
      origen: 'postulantes', dimensiones: ['semana', 'gestionado'], metricas: ['total'],
      filtros: [{ id: 'fecha', preset: 'ult90' }], visual: { tipo: 'apiladas' },
    },
  },
];

// Filtros cuyos valores son ids de cosas que pertenecen a un grupo (sus agentes,
// campañas, skills, canales). Al pasar el reporte a otro grupo ya no aplican.
const FILTROS_DEL_GRUPO = new Set(['agente', 'campania', 'grupo', 'canal', 'equipo']);

const _copia = (x) => JSON.parse(JSON.stringify(x));

/** ¿El origen aplica a un grupo con esa modalidad? (null = sin grupo → siempre) */
function origenAplica(origenId, modalidad) {
  const o = ORIGENES[origenId];
  if (!o) return false;
  return !modalidad || !o.requiere || o.requiere.includes(modalidad);
}

/**
 * Copia una definición y la ajusta a otro grupo (o a "sin grupo"):
 * - fija `grupoId`;
 * - si cambia de grupo, quita los filtros con ids del grupo anterior
 *   (agentes, campañas, skills, canales) y el desglose por Grupo;
 * - devuelve qué se quitó para avisarle al usuario.
 */
function adaptarAGrupo(definicion, grupo /* { id, modalidad } | null */) {
  const def = _copia(definicion || {});
  const origen = ORIGENES[def.origen];
  if (!origen) return { definicion: def, quitados: [], aplica: false, motivo: 'El origen de datos ya no existe' };
  if (grupo && !origenAplica(def.origen, grupo.modalidad)) {
    return {
      definicion: def, quitados: [], aplica: false,
      motivo: `"${origen.label}" no aplica a un grupo ${grupo.modalidad === 'marcador' ? 'de marcador' : 'omnicanal'}`,
    };
  }

  const anterior = def.grupoId ?? null;
  const nuevo = grupo ? grupo.id : null;
  const quitados = [];
  // Hacia un grupo distinto: sus agentes/campañas/skills/canales pueden no ser
  // los del reporte original. Hacia "sin grupo" los ids siguen siendo válidos.
  if (nuevo != null && anterior !== nuevo) {
    def.filtros = (def.filtros || []).filter((f) => {
      if (FILTROS_DEL_GRUPO.has(f.id) && Array.isArray(f.valores) && f.valores.length > 0) {
        quitados.push(origen.filtros[f.id]?.label || f.id);
        return false;
      }
      return true;
    });
    if ((def.dimensiones || []).includes('equipo')) {
      def.dimensiones = def.dimensiones.filter((d) => d !== 'equipo');
      quitados.push('Desglose por grupo');
    }
  }
  def.grupoId = nuevo;
  return { definicion: def, quitados, aplica: true, motivo: null };
}

// Las que el asistente "Crear grupo" deja marcadas de inicio (se crean solo
// las que apliquen a la modalidad del grupo).
const RECOMENDADAS = new Set(['resumen_mes', 'volumen_diario', 'productividad_agente', 'pausas_agente', 'llamadas_dia', 'llamadas_tipificacion', 'ventas_resumen_mes', 'ventas_asesor']);

/** Plantillas en formato público, con el origen y a qué modalidades aplica. */
function listarPlantillas() {
  return PLANTILLAS
    .filter((p) => ORIGENES[p.definicion.origen])
    .map((p) => ({
      id: p.id,
      categoria: p.categoria,
      nombre: p.nombre,
      descripcion: p.descripcion,
      origen: p.definicion.origen,
      origenLabel: ORIGENES[p.definicion.origen].label,
      requiere: ORIGENES[p.definicion.origen].requiere || null,
      recomendada: RECOMENDADAS.has(p.id),
      definicion: _copia(p.definicion),
    }));
}

const carpetaDeGrupo = (nombre) => `Grupo ${String(nombre || '').trim()}`.slice(0, 200);

/**
 * Crea en la Suite los reportes de un grupo nuevo a partir de plantillas
 * (asistente "Crear grupo"). Cada uno es una copia de la plantilla ya ajustada
 * al grupo, en la carpeta "Grupo <nombre>". Repetible sin duplicar: si en esa
 * carpeta ya hay un reporte con el mismo nombre, se omite.
 *
 * Quedan públicos dentro del constructor: los administradores los ven todos y
 * un supervisor solo los de sus grupos (ese filtro lo hace el listado).
 * `asegurarTablas(pool)` crea CC_RDL_CARPETAS / CC_REPORTES_CONSTRUIDOS si la
 * empresa aún no las tiene.
 */
async function crearReportesDeGrupo(pool, { grupo, plantillaIds, usuario, asegurarTablas }) {
  const elegidas = PLANTILLAS.filter((p) => (plantillaIds || []).includes(p.id));
  const res = { creados: 0, yaExistian: 0, omitidos: [], carpeta: carpetaDeGrupo(grupo.nombre) };
  if (!elegidas.length) return res;
  if (asegurarTablas) await asegurarTablas(pool);

  let carpeta = (await pool.request().input('n', sql.NVarChar, res.carpeta)
    .query('SELECT RDC_ID AS id FROM CC_RDL_CARPETAS WHERE RDC_NOMBRE = @n')).recordset[0];
  if (!carpeta) {
    carpeta = (await pool.request().input('n', sql.NVarChar, res.carpeta).input('u', sql.SmallInt, usuario?.id ?? null)
      .query('INSERT INTO CC_RDL_CARPETAS (RDC_NOMBRE, RDC_CREADO_POR) OUTPUT INSERTED.RDC_ID AS id VALUES (@n, @u)')).recordset[0];
  }

  for (const p of elegidas) {
    const { definicion, aplica, motivo } = adaptarAGrupo(p.definicion, { id: grupo.id, modalidad: grupo.modalidad });
    if (!aplica) { res.omitidos.push({ nombre: p.nombre, motivo }); continue; }
    const existe = await pool.request().input('c', sql.Int, carpeta.id).input('n', sql.NVarChar, p.nombre)
      .query('SELECT 1 AS x FROM CC_REPORTES_CONSTRUIDOS WHERE RC_CARPETA_ID = @c AND RC_NOMBRE = @n');
    if (existe.recordset.length) { res.yaExistian++; continue; }
    await pool.request()
      .input('nombre', sql.NVarChar, p.nombre)
      .input('descripcion', sql.NVarChar, p.descripcion)
      .input('carpeta', sql.NVarChar, res.carpeta)
      .input('carpetaId', sql.Int, carpeta.id)
      .input('origen', sql.NVarChar, definicion.origen)
      .input('definicion', sql.NVarChar, JSON.stringify(definicion))
      .input('creadoPor', sql.SmallInt, usuario?.id ?? null)
      .input('creadoNombre', sql.NVarChar, usuario?.nombre ?? null)
      .query(`INSERT INTO CC_REPORTES_CONSTRUIDOS
                (RC_NOMBRE, RC_DESCRIPCION, RC_CARPETA, RC_CARPETA_ID, RC_ORIGEN, RC_DEFINICION, RC_CREADO_POR, RC_CREADO_NOMBRE)
              VALUES (@nombre, @descripcion, @carpeta, @carpetaId, @origen, @definicion, @creadoPor, @creadoNombre)`);
    res.creados++;
  }
  return res;
}

module.exports = { PLANTILLAS, FILTROS_DEL_GRUPO, listarPlantillas, adaptarAGrupo, origenAplica, crearReportesDeGrupo, carpetaDeGrupo };
