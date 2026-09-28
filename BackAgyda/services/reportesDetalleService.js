// Catálogo de reportes detallados (Reportes > Reporte detallado).
//
// Cada reporte es una consulta de solo lectura sobre la BD de la empresa que
// devuelve filas listas para mostrar: los alias de columna ya vienen en
// español y las fechas ya formateadas como texto, así el frontend pinta
// cualquier reporte con la misma tabla genérica y lo exporta a Excel tal cual.
//
// Filtros comunes (parámetros de la consulta):
//   @desde / @hasta  — 'YYYY-MM-DD', rango inclusivo
//   @usuarioId       — NEUS_ID o NULL (todos)
//   @rol             — NEUS_TIPOUSUARIO o NULL (todos)
//   @limite          — tope de filas
// Todas las consultas unen al colaborador como alias `u` (NEUS_USUARIOS) para
// que FILTRO_USUARIO aplique igual en todas.
//
// `permiso` [modulo, accion] marca reportes con datos de otro módulo sensible
// (nómina, auditoría): además de reports/ver-reportes, el usuario necesita
// ese permiso para verlos.

const LIMITE_FILAS = 5000;

const FILTRO_USUARIO = `
  AND (@usuarioId IS NULL OR u.NEUS_ID = @usuarioId)
  AND (@rol IS NULL OR u.NEUS_TIPOUSUARIO = @rol)`;

const fecha     = (x) => `CONVERT(varchar(10), ${x}, 23)`;
const fechaHora = (x) => `CONVERT(varchar(16), ${x}, 120)`;
const hora      = (x) => `CONVERT(varchar(5), ${x}, 108)`;
const enRango   = (x) => `CAST(${x} AS date) BETWEEN @desde AND @hasta`;
const ROL = `CASE u.NEUS_TIPOUSUARIO WHEN 'AD' THEN 'Administración' WHEN 'TI' THEN 'Tecnología'
               WHEN 'CC' THEN 'Call Center' ELSE u.NEUS_TIPOUSUARIO END`;

const REPORTES = [
  // ── Asistencia ──────────────────────────────────────────────────────────────
  {
    key: 'asistencia', grupo: 'Asistencia', label: 'Entradas y retardos',
    descripcion: 'Cada checada de entrada con su hora esperada y minutos de retardo.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ${fecha('e.FECHA')} AS [Fecha], ${hora('e.HORA_ESPERADA')} AS [Hora esperada],
        ${hora('e.HORA_ENTRADA')} AS [Hora de entrada],
        CASE WHEN e.ES_RETARDO = 1 THEN 'Sí' ELSE 'No' END AS [Retardo],
        ISNULL(e.MINUTOS_RETARDO, 0) AS [Minutos de retardo]
      FROM ASISTENCIA_ENTRADAS e
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = e.NEUS_ID
      WHERE e.FECHA BETWEEN @desde AND @hasta ${FILTRO_USUARIO}
      ORDER BY e.FECHA DESC, u.NEUS_NOMBRES`,
  },
  {
    key: 'excepciones-asistencia', grupo: 'Asistencia', label: 'Vacaciones, permisos y justificaciones',
    descripcion: 'Días marcados como excepción en Asistencia (vacaciones, permisos, justificados).',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ${fecha('x.FECHA')} AS [Fecha], x.TIPO AS [Tipo],
        c.NEUS_NOMBRES AS [Registrado por], ${fechaHora('x.FECHA_CREACION')} AS [Registrado el]
      FROM ASISTENCIA_EXCEPCIONES x
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = x.NEUS_ID
      LEFT JOIN NEUS_USUARIOS c ON c.NEUS_ID = x.CREADO_POR
      WHERE x.FECHA BETWEEN @desde AND @hasta ${FILTRO_USUARIO}
      ORDER BY x.FECHA DESC, u.NEUS_NOMBRES`,
  },
  {
    key: 'actas', grupo: 'Asistencia', label: 'Actas por retardos',
    descripcion: 'Actas administrativas generadas por acumular retardos en el mes.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        a.ANIO AS [Año], a.MES AS [Mes], a.TOTAL_RETARDOS AS [Retardos en el mes],
        ${fechaHora('a.FECHA_CREACION')} AS [Generada],
        CASE WHEN a.RECONOCIDA = 1 THEN 'Sí' ELSE 'No' END AS [Reconocida],
        ${fechaHora('a.FECHA_RECONOCIMIENTO')} AS [Reconocida el]
      FROM ASISTENCIA_ACTAS a
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.NEUS_ID
      WHERE ${enRango('a.FECHA_CREACION')} ${FILTRO_USUARIO}
      ORDER BY a.FECHA_CREACION DESC`,
  },
  {
    key: 'incapacidades', grupo: 'Asistencia', label: 'Incapacidades',
    descripcion: 'Incapacidades que caen dentro del rango, con su estado de revisión.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        i.INC_TIPO AS [Tipo], i.INC_MOTIVO AS [Motivo],
        ${fecha('i.INC_FECHA_INICIO')} AS [Inicio], ${fecha('i.INC_FECHA_FIN')} AS [Fin],
        i.INC_DIAS AS [Días], i.INC_ESTADO AS [Estado],
        ${fechaHora('i.INC_FECHA_SOLICITUD')} AS [Solicitada], i.INC_COMENTARIO_ADMIN AS [Comentario]
      FROM INCAPACIDADES i
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = i.INC_USUARIO_ID
      WHERE i.INC_FECHA_INICIO <= @hasta AND i.INC_FECHA_FIN >= @desde ${FILTRO_USUARIO}
      ORDER BY i.INC_FECHA_INICIO DESC`,
  },

  // ── Tiempos y pausas ────────────────────────────────────────────────────────
  {
    key: 'pausas', grupo: 'Tiempos y pausas', label: 'Pausas (detalle)',
    descripcion: 'Cada pausa tomada: tipo, hora de inicio y fin, y duración.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ISNULL(s.ETIQUETA, s.descripcion) AS [Pausa],
        ${fechaHora('t.fecha_inicio')} AS [Inicio], ${fechaHora('t.fecha_fin')} AS [Fin],
        DATEDIFF(MINUTE, t.fecha_inicio, ISNULL(t.fecha_fin, GETDATE())) AS [Minutos],
        CASE WHEN t.fecha_fin IS NULL THEN 'En curso' ELSE 'Terminada' END AS [Estado]
      FROM USUARIO_TIEMPOS t
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.neus_id
      JOIN STATUS s ON s.status_id = t.status_id
      WHERE s.ES_PAUSA = 1 AND ${enRango('t.fecha_inicio')} ${FILTRO_USUARIO}
      ORDER BY t.fecha_inicio DESC`,
  },
  {
    key: 'tiempos-estado', grupo: 'Tiempos y pausas', label: 'Tiempo por estado y día',
    descripcion: 'Minutos acumulados en cada estado (disponible, en llamada, pausas…) por día.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ${fecha('CAST(t.fecha_inicio AS date)')} AS [Día],
        ISNULL(s.ETIQUETA, ISNULL(s.descripcion, 'Sin estado')) AS [Estado],
        COUNT(*) AS [Veces],
        SUM(DATEDIFF(MINUTE, t.fecha_inicio, ISNULL(t.fecha_fin, GETDATE()))) AS [Minutos]
      FROM USUARIO_TIEMPOS t
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.neus_id
      LEFT JOIN STATUS s ON s.status_id = t.status_id
      WHERE ${enRango('t.fecha_inicio')} ${FILTRO_USUARIO}
      GROUP BY u.NEUS_NOMBRES, u.NEUS_TIPOUSUARIO, CAST(t.fecha_inicio AS date),
        ISNULL(s.ETIQUETA, ISNULL(s.descripcion, 'Sin estado'))
      ORDER BY CAST(t.fecha_inicio AS date) DESC, u.NEUS_NOMBRES`,
  },

  // ── Tickets y casos ─────────────────────────────────────────────────────────
  {
    key: 'tickets-levantados', grupo: 'Tickets y casos', label: 'Tickets levantados',
    descripcion: 'Tickets que el colaborador pidió, con quién lo atendió y cuánto tardó en cerrarse.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Solicitante], ${ROL} AS [Rol],
        t.TICKET_ID AS [Ticket], t.TITULO AS [Título], t.AREA AS [Área], t.CATEGORIA AS [Categoría],
        t.PRIORIDAD AS [Prioridad], t.ESTADO AS [Estado], a.NEUS_NOMBRES AS [Asignado a],
        ${fechaHora('t.FECHA_CREACION')} AS [Creado], ${fechaHora('t.FECHA_CIERRE')} AS [Cerrado],
        CAST(ROUND(DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) / 60.0, 1) AS decimal(10,1)) AS [Horas para cerrar]
      FROM TICKETS t
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.SOLICITANTE_ID
      LEFT JOIN NEUS_USUARIOS a ON a.NEUS_ID = t.ASIGNADO_A
      WHERE ${enRango('t.FECHA_CREACION')} ${FILTRO_USUARIO}
      ORDER BY t.FECHA_CREACION DESC`,
  },
  {
    key: 'tickets-atendidos', grupo: 'Tickets y casos', label: 'Tickets atendidos',
    descripcion: 'Tickets asignados al colaborador: tiempo de primera respuesta y de cierre.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Atendió], ${ROL} AS [Rol],
        t.TICKET_ID AS [Ticket], t.TITULO AS [Título], s.NEUS_NOMBRES AS [Solicitante],
        t.CATEGORIA AS [Categoría], t.PRIORIDAD AS [Prioridad], t.ESTADO AS [Estado],
        ${fechaHora('t.FECHA_CREACION')} AS [Creado],
        DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_PRIMERA_RESPUESTA) AS [Min. a primera respuesta],
        ${fechaHora('t.FECHA_CIERRE')} AS [Cerrado],
        CAST(ROUND(DATEDIFF(MINUTE, t.FECHA_CREACION, t.FECHA_CIERRE) / 60.0, 1) AS decimal(10,1)) AS [Horas para cerrar]
      FROM TICKETS t
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.ASIGNADO_A
      LEFT JOIN NEUS_USUARIOS s ON s.NEUS_ID = t.SOLICITANTE_ID
      WHERE ${enRango('t.FECHA_CREACION')} ${FILTRO_USUARIO}
      ORDER BY t.FECHA_CREACION DESC`,
  },
  {
    key: 'casos', grupo: 'Tickets y casos', label: 'Quejas y casos',
    descripcion: 'Quejas y casos que el colaborador creó o tiene asignados.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        CASE WHEN u.NEUS_ID = c.CASO_CREADO_POR THEN 'Lo creó' ELSE 'Asignado' END AS [Participación],
        c.CASO_FOLIO AS [Folio], c.CASO_TIPO AS [Tipo], c.CASO_TITULO AS [Título],
        c.CASO_CATEGORIA AS [Categoría], c.CASO_PRIORIDAD AS [Prioridad], c.CASO_ESTATUS AS [Estatus],
        c.CASO_CLIENTE_NOMBRE_LIBRE AS [Cliente], a.NEUS_NOMBRES AS [Asignado a],
        ${fechaHora('c.CASO_FECHA_CREACION')} AS [Creado], ${fechaHora('c.CASO_FECHA_RESOLUCION')} AS [Resuelto]
      FROM CASOS c
      JOIN NEUS_USUARIOS u ON u.NEUS_ID IN (c.CASO_CREADO_POR, c.CASO_ASIGNADO_A)
      LEFT JOIN NEUS_USUARIOS a ON a.NEUS_ID = c.CASO_ASIGNADO_A
      WHERE ${enRango('c.CASO_FECHA_CREACION')} ${FILTRO_USUARIO}
      ORDER BY c.CASO_FECHA_CREACION DESC`,
  },

  // ── Contact Center ──────────────────────────────────────────────────────────
  {
    key: 'interacciones-cc', grupo: 'Contact Center', label: 'Interacciones omnicanal',
    descripcion: 'Conversaciones de WhatsApp, Messenger, Instagram, etc. atendidas por el agente.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Agente], ${ROL} AS [Rol],
        i.CI_ID AS [Interacción], ISNULL(cn.CN_NOMBRE, i.CI_TIPO) AS [Canal], cm.CM2_NOMBRE AS [Campaña],
        i.CI_CLIENTE_NOMBRE AS [Cliente], i.CI_CLIENTE_TELEFONO AS [Teléfono], i.CI_ESTADO AS [Estado],
        tp.CT_NOMBRE AS [Tipificación], ${fechaHora('i.CI_FECHA_INICIO')} AS [Inicio],
        DATEDIFF(MINUTE, i.CI_FECHA_INICIO, i.CI_FECHA_PRIMER_RESPUESTA) AS [Min. a primera respuesta],
        ${fechaHora('i.CI_FECHA_CIERRE')} AS [Cierre], i.CI_RATING AS [Calificación]
      FROM CCO_INTERACCIONES i
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = i.CI_AGENTE_ID
      LEFT JOIN CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
      LEFT JOIN CCO_CAMPANIAS cm ON cm.CM2_ID = i.CI_CAMPANIA_ID
      LEFT JOIN CCO_TIPIFICACIONES tp ON tp.CT_ID = i.CI_TIPIFICACION_ID
      WHERE ${enRango('i.CI_FECHA_INICIO')} ${FILTRO_USUARIO}
      ORDER BY i.CI_FECHA_INICIO DESC`,
  },
  {
    key: 'livechat', grupo: 'Contact Center', label: 'Chat en vivo',
    descripcion: 'Conversaciones del chat de la página web atendidas por el agente.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Agente], ${ROL} AS [Rol],
        lc.LC_ID AS [Conversación], lc.LC_VISITANTE_NOMBRE AS [Visitante], lc.LC_VISITANTE_TELEFONO AS [Teléfono],
        lc.LC_MOTIVO AS [Motivo], lc.LC_ESTADO AS [Estado], lc.LC_ORIGEN AS [Origen],
        ${fechaHora('lc.LC_FECHA_INICIO')} AS [Inicio], ${fechaHora('lc.LC_FECHA_CIERRE')} AS [Cierre],
        DATEDIFF(MINUTE, lc.LC_FECHA_INICIO, lc.LC_FECHA_CIERRE) AS [Duración (min)],
        lc.LC_RATING AS [Calificación], lc.LC_MOTIVO_CIERRE AS [Motivo de cierre]
      FROM LIVECHAT_CONVERSACIONES lc
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = lc.LC_AGENTE_ID
      WHERE ${enRango('lc.LC_FECHA_INICIO')} ${FILTRO_USUARIO}
      ORDER BY lc.LC_FECHA_INICIO DESC`,
  },
  {
    key: 'formularios', grupo: 'Contact Center', label: 'Formularios capturados',
    descripcion: 'Formularios de atención llenados por el agente (uno por interacción).',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Agente], ${ROL} AS [Rol],
        r.FIR_INTERACCION_ID AS [Interacción], COUNT(*) AS [Campos capturados],
        ${fechaHora('MIN(r.FIR_FECHA_CREACION)')} AS [Capturado],
        ${fechaHora('MAX(ISNULL(r.FIR_FECHA_ACTUALIZACION, r.FIR_FECHA_CREACION))')} AS [Última edición]
      FROM CCF_INTERACCION_FORM_RESPUESTAS r
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = r.FIR_CREADO_POR
      WHERE ${enRango('r.FIR_FECHA_CREACION')} ${FILTRO_USUARIO}
      GROUP BY u.NEUS_NOMBRES, u.NEUS_TIPOUSUARIO, r.FIR_INTERACCION_ID
      ORDER BY MIN(r.FIR_FECHA_CREACION) DESC`,
  },
  {
    key: 'crm-interacciones', grupo: 'Contact Center', label: 'Seguimiento en CRM',
    descripcion: 'Notas, llamadas y demás interacciones registradas en oportunidades del CRM.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        i.INT_TIPO AS [Tipo], i.INT_OPO_ID AS [Oportunidad], LEFT(i.INT_CONTENIDO, 300) AS [Contenido],
        ${fechaHora('i.INT_FECHA')} AS [Fecha]
      FROM CRM_INTERACCIONES i
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = i.INT_USUARIO_ID
      WHERE ${enRango('i.INT_FECHA')} ${FILTRO_USUARIO}
      ORDER BY i.INT_FECHA DESC`,
  },
  {
    // Se resuelve aparte (BD de Ventas, ligada por nombre del agente) — ver reportController.
    key: 'ventas', grupo: 'Contact Center', label: 'Ventas',
    descripcion: 'Ventas registradas en el sistema de Ventas (todas las estatus), ligadas por nombre del agente.',
    externo: 'ventas',
  },

  // ── Desempeño y desarrollo ──────────────────────────────────────────────────
  {
    key: 'capacitacion', grupo: 'Desempeño y desarrollo', label: 'Cursos de capacitación',
    descripcion: 'Cursos asignados o completados en el rango, con su estado.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        c.CUR_TITULO AS [Curso], c.CUR_CATEGORIA AS [Categoría], c.CUR_DURACION_MIN AS [Duración (min)],
        ins.INSC_ESTADO AS [Estado], ${fechaHora('ins.INSC_FECHA_INSCRIPCION')} AS [Inscrito],
        ${fechaHora('ins.INSC_FECHA_COMPLETADO')} AS [Completado]
      FROM CAP_INSCRIPCIONES ins
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = ins.INSC_USUARIO_ID
      JOIN CAP_CURSOS c ON c.CUR_ID = ins.INSC_CURSO_ID
      WHERE (${enRango('ins.INSC_FECHA_INSCRIPCION')} OR ${enRango('ins.INSC_FECHA_COMPLETADO')}) ${FILTRO_USUARIO}
      ORDER BY ins.INSC_FECHA_INSCRIPCION DESC`,
  },
  {
    key: 'eval-capacitacion', grupo: 'Desempeño y desarrollo', label: 'Evaluaciones semanales de capacitación',
    descripcion: 'Retroalimentación semanal del supervisor: calificación, fortalezas y áreas de oportunidad.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Agente], ${ROL} AS [Rol],
        ${fecha('e.SEMANA_INICIO')} AS [Semana], e.SUPERVISOR_NOMBRE AS [Supervisor],
        e.CALIFICACION AS [Calificación], e.ESTADO AS [Estado],
        e.FORTALEZAS AS [Fortalezas], e.AREAS_OPORTUNIDAD AS [Áreas de oportunidad], e.PLAN_ACCION AS [Plan de acción]
      FROM EVAL_CAPACITACION e
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = e.AGENTE_ID
      WHERE e.SEMANA_INICIO BETWEEN @desde AND @hasta ${FILTRO_USUARIO}
      ORDER BY e.SEMANA_INICIO DESC`,
  },
  {
    key: 'eval-desempeno', grupo: 'Desempeño y desarrollo', label: 'Evaluaciones de desempeño',
    descripcion: 'Evaluaciones del ciclo de desempeño con su calificación y plan de acción.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        e.EVAL_EVALUADOR_NOMBRE AS [Evaluador], e.EVAL_ESTADO AS [Estado], e.EVAL_CALIFICACION AS [Calificación],
        e.EVAL_FORTALEZAS AS [Fortalezas], e.EVAL_AREAS_MEJORA AS [Áreas de mejora], e.EVAL_PLAN_ACCION AS [Plan de acción],
        ${fechaHora('e.EVAL_FECHA_CREACION')} AS [Creada], ${fechaHora('e.EVAL_FECHA_FINALIZADA')} AS [Finalizada]
      FROM EVAL_DESEMPENO e
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = e.EVAL_EMPLEADO_ID
      WHERE ${enRango('e.EVAL_FECHA_CREACION')} ${FILTRO_USUARIO}
      ORDER BY e.EVAL_FECHA_CREACION DESC`,
  },
  {
    key: 'calidad', grupo: 'Desempeño y desarrollo', label: 'Evaluaciones de calidad (QA)',
    descripcion: 'Monitoreos de llamadas del área de Calidad con su puntaje.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Agente], ${ROL} AS [Rol],
        ev.NEUS_NOMBRES AS [Evaluador], c.CE_LLAMADA_REF AS [Llamada], c.CE_PUNTAJE AS [Puntaje],
        ${fechaHora('c.CE_FECHA')} AS [Fecha]
      FROM CALIDAD_EVALUACIONES c
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.CE_AGENTE_ID
      LEFT JOIN NEUS_USUARIOS ev ON ev.NEUS_ID = c.CE_EVALUADOR_ID
      WHERE ${enRango('c.CE_FECHA')} ${FILTRO_USUARIO}
      ORDER BY c.CE_FECHA DESC`,
  },
  {
    key: 'tareas', grupo: 'Desempeño y desarrollo', label: 'Tareas de proyectos',
    descripcion: 'Tareas asignadas en Proyectos cuya fecha (fin, límite o inicio) cae en el rango.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        p.PROY_NOMBRE AS [Proyecto], t.PTAR_TITULO AS [Tarea], t.PTAR_ESTADO AS [Estado],
        t.PTAR_PROGRESO AS [Progreso %], ${fecha('t.PTAR_FECHA_INICIO')} AS [Inicio],
        ${fecha('t.PTAR_FECHA_LIMITE')} AS [Fecha límite], ${fecha('t.PTAR_FECHA_FIN')} AS [Terminada]
      FROM PROYECTO_TAREAS t
      CROSS APPLY STRING_SPLIT(ISNULL(t.PTAR_ASIGNADO_A, ''), ',') sp
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = TRY_CAST(LTRIM(RTRIM(sp.value)) AS int)
      LEFT JOIN PROYECTOS p ON p.PROY_ID = t.PTAR_PROY_ID
      WHERE ISNULL(t.PTAR_ELIMINADA, 0) = 0
        AND ${enRango('COALESCE(t.PTAR_FECHA_FIN, t.PTAR_FECHA_LIMITE, t.PTAR_FECHA_INICIO)')} ${FILTRO_USUARIO}
      ORDER BY COALESCE(t.PTAR_FECHA_FIN, t.PTAR_FECHA_LIMITE, t.PTAR_FECHA_INICIO) DESC`,
  },
  {
    key: 'checklist', grupo: 'Desempeño y desarrollo', label: 'Checklist completado',
    descripcion: 'Actividades del checklist diario marcadas como hechas por el colaborador.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ${fecha('d.FECHA')} AS [Día], d.AREA AS [Área], i.TITULO AS [Actividad], i.PRIORIDAD AS [Prioridad],
        ${fechaHora('i.COMPLETADO_AT')} AS [Completada]
      FROM TI_CHECKLIST_ITEMS i
      JOIN TI_CHECKLIST_DIAS d ON d.DIA_ID = i.DIA_ID
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = i.COMPLETADO_POR
      WHERE i.COMPLETADO = 1 AND ${enRango('i.COMPLETADO_AT')} ${FILTRO_USUARIO}
      ORDER BY i.COMPLETADO_AT DESC`,
  },

  // ── Nómina ──────────────────────────────────────────────────────────────────
  {
    key: 'nomina', grupo: 'Nómina', label: 'Nómina por quincena',
    descripcion: 'Lo calculado en cada quincena que se cruza con el rango: faltas, descuentos, comisiones y total.',
    permiso: ['nomina', 'ver'],
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ${fecha('p.FECHA_INICIO')} + ' a ' + ${fecha('p.FECHA_FIN')} AS [Quincena], RTRIM(LTRIM(p.ESTADO)) AS [Estado],
        n.SUELDO_QUINCENAL AS [Sueldo quincenal], n.DIAS_FALTA AS [Días de falta], ISNULL(n.TOTAL_RETARDOS, 0) AS [Retardos],
        n.MONTO_DESCUENTO AS [Descuento], n.SUELDO_NETO AS [Sueldo neto], ISNULL(n.TOTAL_VENTAS, 0) AS [Ventas],
        n.TOTAL_COMISIONES AS [Comisiones], ISNULL(n.BONO_RANKING, 0) AS [Bono ranking], n.TOTAL_A_PAGAR AS [Total a pagar]
      FROM NOMINA_DETALLE n
      JOIN NOMINA_PERIODOS p ON p.ID = n.PERIODO_ID
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = n.NEUS_ID
      WHERE p.FECHA_INICIO <= @hasta AND p.FECHA_FIN >= @desde ${FILTRO_USUARIO}
      ORDER BY p.FECHA_INICIO DESC, u.NEUS_NOMBRES`,
  },

  // ── Sistema ─────────────────────────────────────────────────────────────────
  {
    key: 'encuestas', grupo: 'Sistema', label: 'Encuestas respondidas',
    descripcion: 'Encuestas internas que el colaborador contestó.',
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        e.ENC_TITULO AS [Encuesta], e.ENC_CATEGORIA AS [Categoría], COUNT(*) AS [Preguntas respondidas],
        ${fechaHora('MAX(r.ERE_FECHA_RESPUESTA)')} AS [Respondida]
      FROM ENCUESTA_RESPUESTAS r
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = r.ERE_NEUS_ID
      JOIN ENCUESTAS e ON e.ENC_ID = r.ERE_ENC_ID
      WHERE ${enRango('r.ERE_FECHA_RESPUESTA')} ${FILTRO_USUARIO}
      GROUP BY u.NEUS_NOMBRES, u.NEUS_TIPOUSUARIO, e.ENC_TITULO, e.ENC_CATEGORIA
      ORDER BY MAX(r.ERE_FECHA_RESPUESTA) DESC`,
  },
  {
    key: 'auditoria', grupo: 'Sistema', label: 'Acciones en el sistema (auditoría)',
    descripcion: 'Bitácora de acciones administrativas hechas por el colaborador.',
    permiso: ['auditoria', 'ver'],
    sql: `
      SELECT TOP (@limite) u.NEUS_NOMBRES AS [Colaborador], ${ROL} AS [Rol],
        ${fechaHora('a.FECHA')} AS [Fecha], a.MODULO AS [Módulo], a.ACCION AS [Acción],
        a.ENTIDAD_ID AS [Registro], LEFT(a.DETALLE, 300) AS [Detalle], a.IP_ORIGEN AS [IP]
      FROM INTRANET_AUDITORIA a
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = a.USUARIO_ID
      WHERE ${enRango('a.FECHA')} ${FILTRO_USUARIO}
      ORDER BY a.FECHA DESC`,
  },
];

const porKey = Object.fromEntries(REPORTES.map((r) => [r.key, r]));

module.exports = { REPORTES, porKey, LIMITE_FILAS };
