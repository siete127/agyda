const sql = require('mssql');
const databaseService = require('../services/databaseService');

// ─────────────────────────────────────────────────────────────────────────────
// Horario de disponibilidad por asesor: el asesor PROPONE su horario semanal
// (HORARIOS_ASESOR_PROPUESTAS, estatus pendiente/aprobada/rechazada) y un
// supervisor (permiso 'horario-asesores'/'gestionar') la aprueba tal cual o
// la edita y aprueba en un solo paso. Solo lo aprobado se vuelca a
// HORARIOS_ASESOR, que es la única tabla que usa el cálculo de disponibilidad
// (getDisponibilidadAsesor) — así nunca corre una propuesta sin revisar.
// Las vacaciones/permisos NO se guardan aquí: se consultan en vivo desde
// dbo.solicitudes_vacaciones (estado='APROBADA') para no duplicar ese dato.
// ─────────────────────────────────────────────────────────────────────────────

const HORA_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DURACION_SLOT_MIN = 30;
const DIAS_A_CALCULAR = 14;

function validarHora(v) {
  return typeof v === 'string' && HORA_HHMM.test(v) ? v : null;
}

// Valida y normaliza un array de días crudo (del body) a la forma que se
// persiste tanto en la propuesta (JSON) como en HORARIOS_ASESOR (filas).
function normalizarDias(diasRaw) {
  const dias = Array.isArray(diasRaw) ? diasRaw : [];
  const out = [];
  for (const d of dias) {
    const diaSemana = Number(d.diaSemana);
    const horaInicio = validarHora(d.horaInicio);
    const horaFin = validarHora(d.horaFin);
    if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) continue;
    if (!horaInicio || !horaFin || horaFin <= horaInicio) continue;
    const comidaInicio = validarHora(d.comidaInicio);
    const comidaFin = validarHora(d.comidaFin);
    const tieneComida = comidaInicio && comidaFin && comidaFin > comidaInicio;
    out.push({ diaSemana, horaInicio, horaFin, comidaInicio: tieneComida ? comidaInicio : null, comidaFin: tieneComida ? comidaFin : null });
  }
  return out;
}

// Vuelca una lista normalizada de días a HORARIOS_ASESOR (vigente) dentro de
// una transacción ya abierta — borra y reinserta, igual que antes.
async function _aplicarHorarioVigente(tx, usuarioId, dias, actualizadoPor) {
  await tx.request().input('uid', sql.Int, usuarioId).query(`DELETE FROM HORARIOS_ASESOR WHERE HA_USUARIO_ID=@uid`);
  for (const d of dias) {
    await tx.request()
      .input('uid', sql.Int, usuarioId)
      .input('dia', sql.TinyInt, d.diaSemana)
      .input('hi', sql.Char(5), d.horaInicio)
      .input('hf', sql.Char(5), d.horaFin)
      .input('ci', sql.Char(5), d.comidaInicio)
      .input('cf', sql.Char(5), d.comidaFin)
      .input('actPor', sql.Int, actualizadoPor)
      .query(`
        INSERT INTO HORARIOS_ASESOR (HA_USUARIO_ID, HA_DIA_SEMANA, HA_HORA_INICIO, HA_HORA_FIN, HA_COMIDA_INICIO, HA_COMIDA_FIN, HA_ACTUALIZADO_POR)
        VALUES (@uid, @dia, @hi, @hf, @ci, @cf, @actPor)
      `);
  }
}

// GET /horario-asesor/:usuarioId — horario VIGENTE (ya aprobado) de un asesor.
exports.getHorario = async (req, res) => {
  try {
    const usuarioId = parseInt(req.params.usuarioId, 10);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('uid', sql.Int, usuarioId).query(`
      SELECT HA_DIA_SEMANA as diaSemana, HA_HORA_INICIO as horaInicio, HA_HORA_FIN as horaFin,
             HA_COMIDA_INICIO as comidaInicio, HA_COMIDA_FIN as comidaFin, HA_ACTIVO as activo
      FROM HORARIOS_ASESOR WHERE HA_USUARIO_ID=@uid ORDER BY HA_DIA_SEMANA ASC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /horario-asesor/:usuarioId/propuesta — la propuesta pendiente (si hay)
// del asesor, para que él mismo vea el estatus de lo que envió.
exports.getMiPropuestaPendiente = async (req, res) => {
  try {
    const usuarioId = parseInt(req.params.usuarioId, 10);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('uid', sql.Int, usuarioId).query(`
      SELECT TOP 1 HAP_ID as id, HAP_DIAS_JSON as diasJson, HAP_ESTATUS as estatus,
             HAP_COMENTARIO as comentario, HAP_ENVIADA_EN as enviadaEn, HAP_RESUELTA_EN as resueltaEn
      FROM HORARIOS_ASESOR_PROPUESTAS WHERE HAP_USUARIO_ID=@uid ORDER BY HAP_ID DESC
    `);
    const row = rs.recordset[0];
    if (!row) return res.json({ success: true, data: null });
    res.json({ success: true, data: { ...row, dias: JSON.parse(row.diasJson) } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /horario-asesor/:usuarioId/proponer — el propio asesor envía su
// horario propuesto. Reemplaza cualquier propuesta pendiente anterior suya
// (no se acumulan borradores viejos sin resolver).
exports.proponerHorario = async (req, res) => {
  try {
    const usuarioId = parseInt(req.params.usuarioId, 10);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    }
    const dias = normalizarDias(req.body?.dias);
    if (!dias.length) return res.status(400).json({ success: false, message: 'Selección de horario inválida' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('uid', sql.Int, usuarioId)
      .query(`DELETE FROM HORARIOS_ASESOR_PROPUESTAS WHERE HAP_USUARIO_ID=@uid AND HAP_ESTATUS='pendiente'`);
    await pool.request()
      .input('uid', sql.Int, usuarioId)
      .input('json', sql.NVarChar(sql.MAX), JSON.stringify(dias))
      .query(`INSERT INTO HORARIOS_ASESOR_PROPUESTAS (HAP_USUARIO_ID, HAP_DIAS_JSON) VALUES (@uid, @json)`);

    res.status(201).json({ success: true });
  } catch (e) {
    console.error('Error proponerHorario:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /horario-asesor/propuestas/pendientes — bandeja del supervisor.
exports.listarPropuestasPendientes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT p.HAP_ID as id, p.HAP_USUARIO_ID as usuarioId, u.NEUS_NOMBRES as usuarioNombre,
             p.HAP_DIAS_JSON as diasJson, p.HAP_ENVIADA_EN as enviadaEn
      FROM HORARIOS_ASESOR_PROPUESTAS p
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = p.HAP_USUARIO_ID
      WHERE p.HAP_ESTATUS='pendiente'
      ORDER BY p.HAP_ENVIADA_EN ASC
    `);
    const data = rs.recordset.map((r) => ({ ...r, dias: JSON.parse(r.diasJson) }));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /horario-asesor/propuestas/:propuestaId/resolver — aprobar (tal cual o
// con días editados por el supervisor) o rechazar. Al aprobar, se vuelca de
// inmediato a HORARIOS_ASESOR (vigente) dentro de la misma transacción.
exports.resolverPropuesta = async (req, res) => {
  const propuestaId = parseInt(req.params.propuestaId, 10);
  if (!Number.isInteger(propuestaId) || propuestaId <= 0) {
    return res.status(400).json({ success: false, message: 'propuestaId inválido' });
  }
  const { accion, comentario } = req.body || {};
  if (!['aprobar', 'rechazar'].includes(accion)) {
    return res.status(400).json({ success: false, message: 'Acción inválida' });
  }

  const pool = await databaseService.getPool(req.user?.empresa);
  const resueltaPor = req.user?.id ? Number(req.user.id) : null;
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    const prop = await tx.request().input('id', sql.Int, propuestaId).query(`
      SELECT HAP_USUARIO_ID as usuarioId, HAP_DIAS_JSON as diasJson, HAP_ESTATUS as estatus
      FROM HORARIOS_ASESOR_PROPUESTAS WHERE HAP_ID=@id
    `);
    const row = prop.recordset[0];
    if (!row) { await tx.rollback(); return res.status(404).json({ success: false, message: 'Propuesta no encontrada' }); }
    if (row.estatus !== 'pendiente') { await tx.rollback(); return res.status(400).json({ success: false, message: 'Esta propuesta ya fue resuelta' }); }

    // Si el supervisor manda `dias` en el body, son los días EDITADOS por él
    // (se aprueba esa versión); si no manda nada, se aprueba tal cual se propuso.
    const diasFinales = accion === 'aprobar'
      ? (req.body?.dias ? normalizarDias(req.body.dias) : JSON.parse(row.diasJson))
      : null;
    if (accion === 'aprobar' && !diasFinales.length) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Selección de horario inválida' });
    }

    await tx.request()
      .input('id', sql.Int, propuestaId)
      .input('estatus', sql.NVarChar(20), accion === 'aprobar' ? 'aprobada' : 'rechazada')
      .input('comentario', sql.NVarChar(500), comentario || null)
      .input('resueltaPor', sql.Int, resueltaPor)
      .input('diasJson', sql.NVarChar(sql.MAX), diasFinales ? JSON.stringify(diasFinales) : row.diasJson)
      .query(`
        UPDATE HORARIOS_ASESOR_PROPUESTAS
        SET HAP_ESTATUS=@estatus, HAP_COMENTARIO=@comentario, HAP_RESUELTA_EN=GETDATE(), HAP_RESUELTA_POR=@resueltaPor,
            HAP_DIAS_JSON=@diasJson
        WHERE HAP_ID=@id
      `);

    if (accion === 'aprobar') {
      await _aplicarHorarioVigente(tx, row.usuarioId, diasFinales, resueltaPor);
    }

    await tx.commit();
    res.json({ success: true });
  } catch (e) {
    await tx.rollback().catch(() => {});
    console.error('Error resolverPropuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Arma las franjas de DURACION_SLOT_MIN minutos entre inicio y fin (strings
// 'HH:mm'), excluyendo el bloque de comida si cae dentro del rango.
function _slotsDelDia(horaInicio, horaFin, comidaInicio, comidaFin) {
  const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const inicio = aMin(horaInicio);
  const fin = aMin(horaFin);
  const comIni = comidaInicio ? aMin(comidaInicio) : null;
  const comFin = comidaFin ? aMin(comidaFin) : null;

  const slots = [];
  for (let m = inicio; m + DURACION_SLOT_MIN <= fin; m += DURACION_SLOT_MIN) {
    if (comIni != null && comFin != null && m < comFin && m + DURACION_SLOT_MIN > comIni) continue;
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${h}:${mm}`);
  }
  return slots;
}

// GET /portal-cliente/disponibilidad-asesor — slots libres de los próximos
// DIAS_A_CALCULAR días para el asesor del contacto autenticado, cruzando:
// horario configurado del asesor (HORARIOS_ASESOR) × vacaciones aprobadas
// (solicitudes_vacaciones) × citas ya agendadas (CLI_CITAS). Si el contacto
// no tiene CONT_RESPONSABLE_ID, se responde con needsFallback para que el
// frontend use el horario general de Canales sin cruzar contra una agenda.
exports.getDisponibilidadAsesor = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const contacto = await pool.request().input('id', sql.Int, req.contacto.id).query(`
      SELECT CONT_RESPONSABLE_ID as responsableId FROM CRM_CONTACTOS WHERE CONT_ID=@id
    `);
    const asesorId = contacto.recordset[0]?.responsableId;
    if (!asesorId) {
      return res.json({ success: true, data: { asesorId: null, dias: [] } });
    }

    const horario = await pool.request().input('uid', sql.Int, asesorId).query(`
      SELECT HA_DIA_SEMANA as diaSemana, HA_HORA_INICIO as horaInicio, HA_HORA_FIN as horaFin,
             HA_COMIDA_INICIO as comidaInicio, HA_COMIDA_FIN as comidaFin
      FROM HORARIOS_ASESOR WHERE HA_USUARIO_ID=@uid AND HA_ACTIVO=1
    `);
    if (!horario.recordset.length) {
      return res.json({ success: true, data: { asesorId, dias: [] } });
    }
    const horarioPorDia = new Map(horario.recordset.map((h) => [h.diaSemana, h]));

    const hoy = new Date();
    const limite = new Date(hoy); limite.setDate(limite.getDate() + DIAS_A_CALCULAR);

    const vacaciones = await pool.request()
      .input('uid', sql.Int, asesorId)
      .input('hoy', sql.Date, hoy)
      .input('limite', sql.Date, limite)
      .query(`
        SELECT fecha_inicio as inicio, fecha_fin as fin
        FROM solicitudes_vacaciones
        WHERE numero_personal=@uid AND estado='APROBADA' AND fecha_fin >= @hoy AND fecha_inicio <= @limite
      `);

    const citas = await pool.request()
      .input('uid', sql.Int, asesorId)
      .input('desde', sql.DateTime, hoy)
      .input('hasta', sql.DateTime, limite)
      .query(`
        SELECT CONVERT(NVARCHAR(19), CITA_FECHA_HORA, 126) as fechaHora, ISNULL(CITA_DURACION_MIN, 30) as duracionMin
        FROM CLI_CITAS
        WHERE CITA_ASIGNADO_A=@uid AND CITA_ACTIVO=1 AND CITA_ESTATUS NOT IN ('cancelada','no_asistio')
          AND CITA_FECHA_HORA BETWEEN @desde AND @hasta
      `);

    function enVacaciones(fecha) {
      return vacaciones.recordset.some((v) => fecha >= v.inicio && fecha <= v.fin);
    }
    function ocupadoPorCita(fechaStr, horaSlot) {
      const [h, m] = horaSlot.split(':').map(Number);
      const slotInicio = new Date(`${fechaStr}T${horaSlot}:00`);
      const slotFin = new Date(slotInicio.getTime() + DURACION_SLOT_MIN * 60000);
      return citas.recordset.some((c) => {
        const citaInicio = new Date(c.fechaHora);
        const citaFin = new Date(citaInicio.getTime() + c.duracionMin * 60000);
        return slotInicio < citaFin && slotFin > citaInicio;
      });
    }

    const dias = [];
    for (let i = 0; i < DIAS_A_CALCULAR; i++) {
      const fecha = new Date(hoy); fecha.setDate(fecha.getDate() + i);
      const diaSemanaISO = ((fecha.getDay() + 6) % 7) + 1; // JS: 0=Domingo → ISO: 1=Lunes..7=Domingo
      const cfg = horarioPorDia.get(diaSemanaISO);
      if (!cfg) continue;
      const fechaStr = fecha.toISOString().slice(0, 10);
      if (enVacaciones(fechaStr)) continue;

      let slots = _slotsDelDia(cfg.horaInicio, cfg.horaFin, cfg.comidaInicio, cfg.comidaFin);
      if (i === 0) {
        const ahoraHHMM = `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`;
        slots = slots.filter((s) => s > ahoraHHMM);
      }
      slots = slots.filter((s) => !ocupadoPorCita(fechaStr, s));
      if (slots.length) dias.push({ fecha: fechaStr, slots });
    }

    res.json({ success: true, data: { asesorId, dias } });
  } catch (e) {
    console.error('Error getDisponibilidadAsesor:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
