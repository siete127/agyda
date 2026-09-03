/**
 * Obtener todos los horarios disponibles de la tabla horarios_totis
 */
exports.getHorariosTotis = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT [id], [horario], [nomenclatura]
      FROM [intranet_totis].[dbo].[horarios_totis]
      ORDER BY [id]
    `);
    res.json({ success: true, horarios: result.recordset });
  } catch (error) {
    console.error("❌ Error obteniendo horarios-totis:", error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

/* =========================================================
   OBTENER UN HORARIO POR ID (FROM intranet.dbo.horarios)
   Fallback a intranet_totis.dbo.horarios_totis si no existe
========================================================= */
exports.getHorarioById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    // Intentar tabla central
    let result = await pool
      .request()
      .input('id_horario', sql.Int, id)
      .query(`
        SELECT TOP 1 [horario], [nomenclatura]
        FROM [horarios]
        WHERE [id] = @id_horario
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Horario no encontrado' });
    }

    const row = result.recordset[0];
    res.json({ success: true, data: { horario: row.horario, nomenclatura: row.nomenclatura } });
  } catch (error) {
    console.error('❌ Error obteniendo horario por id:', error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};
/**
 * Controlador de Vacaciones / Permisos
 * Versión refactorizada:
 * - Se elimina la duplicación de contarSolicitudesPendientes.
 * - Se corrige la función accionDesdeEmail (flujo limpio, sin devolver días al aprobar).
 * - Se unifica la lógica: los días se descuentan AL CREAR la solicitud.
 *   - Al aprobar: NO se descuenta nuevamente.
 *   - Al rechazar: se devuelven exactamente los campos descontados (descontados_permisos_goce / descontados_vacaciones).
 * - Se estandariza tipo_solicitud usando códigos:
 *     "0100" = Permiso con goce
 *     "0200" = Vacaciones
 * - Se simplifica responderSolicitud acorde a la regla anterior.
 * - Se mantiene editarSolicitud (asume que los códigos se envían correctamente).
 */

const databaseService = require("../services/databaseService");
const sql = require("mssql");
const { logAudit } = require("../services/auditService");
const jwt = require("jsonwebtoken");
const { getIO } = require("../services/socketService");
const { getUserAllowedActions, esSuperAdminFijo } = require("../middleware/moduleAccess");

// Notifica a todas las sesiones conectadas que el pool de vacaciones de un usuario
// cambió, para que "Días por agente" y "Mi saldo" se refresquen solos.
function notifyVacacionesDiasActualizados(usuarioId, tenantKey) {
  try {
    getIO(tenantKey).emit('vacaciones:diasActualizados', { usuarioId });
  } catch (_) {}
}
const JWT_SECRET = 
  process.env.JWT_SECRET || "AKOLATRONIC";

// Mapeo de códigos a descripciones legibles (para emails, logs, etc.)
function descripcionTipoSolicitud(codigo) {
  switch (codigo) {
    case "0100":
      return "Permiso con goce";
    case "0200":
      return "Vacaciones";
    default:
      return codigo || "Desconocido";
  }
}

// Función utilitaria para devolver días descontados (vacaciones y permisos con goce)
async function devolverDiasDescontados(pool, solicitud) {
  const numeroPersonal = solicitud.numero_personal;
  const descontadosPermisosGoce = solicitud.descontados_permisos_goce || 0;
  const descontadosVacaciones = solicitud.descontados_vacaciones || 0;

  if (descontadosPermisosGoce > 0) {
    try {
      await pool
        .request()
        .input("numeroPersonal", sql.NVarChar, numeroPersonal)
        .input("dias", sql.Int, descontadosPermisosGoce).query(`
          UPDATE [NEUS_USUARIOS]
          SET permisos_goce_disponibles = ISNULL(permisos_goce_disponibles, 0) + @dias
          WHERE NEUS_ID = @numeroPersonal
        `);
      console.log(
        `↩️ ${descontadosPermisosGoce} días de permisos con goce devueltos correctamente`
      );
    } catch (err) {
      console.warn(
        '⚠️ No se pudo actualizar permisos en [dbo].[neus_vacaciones]. Se ignorará el update.',
        err.message
      );
    }
  }

  if (descontadosVacaciones > 0) {
    try {
      await pool
        .request()
        .input("numeroPersonal", sql.NVarChar, numeroPersonal)
        .input("dias", sql.Int, descontadosVacaciones).query(`
          UPDATE [NEUS_USUARIOS]
          SET dias_vacaciones_disponibles = ISNULL(dias_vacaciones_disponibles, 0) + @dias
          WHERE NEUS_ID = @numeroPersonal
        `);
      console.log(
        `↩️ ${descontadosVacaciones} días de vacaciones devueltos correctamente`
      );
    } catch (err) {
      console.warn(
        '⚠️ No se pudo actualizar vacaciones en [dbo].[neus_vacaciones]. Se ignorará el update.',
        err.message
      );
    }
  }
}

/* =========================================================
   FORMATEO DE TURNOS
========================================================= */
function formatearTurno(turnoOriginal) {
  if (!turnoOriginal) return "No especificado";

  const turno = turnoOriginal.trim();
  const dias = {
    L: "lunes",
    M: "martes",
    X: "miércoles",
    J: "jueves",
    V: "viernes",
    S: "sábado",
    D: "domingo",
  };

  const formatearHora = (hora) => {
    if (!hora) return "";
    let minutos = "00";
    let horaNum = parseFloat(hora.replace('½', '.5'));
    if (hora.includes("½")) {
      minutos = "30";
      horaNum = parseInt(hora);
    }
    if (horaNum < 12) {
      return horaNum === 0
        ? "12:00 a.m."
        : `${Math.floor(horaNum)}:${minutos} a.m.`;
    } else if (horaNum === 12) {
      return `12:${minutos} p.m.`;
    } else {
      return `${Math.floor(horaNum - 12)}:${minutos} p.m.`;
    }
  };

  // Extraer días y horas
  const regex = /^([A-Z,\-]+)\s+(\d+½?)-(\d+½?)$/;
  const match = turno.match(regex);
  let diasTexto = "";
  let horasTexto = "";
  if (match) {
    // Días
    const diasRaw = match[1];
    if (diasRaw.includes(",")) {
      // Ejemplo: L,V-D
      const partes = diasRaw.split(",");
      const diasFormateados = partes.map((parte) => {
        if (parte.includes("-")) {
          const inicio = dias[parte[0]];
          const fin = dias[parte[parte.length - 1]];
          return `${inicio} a ${fin}`;
        } else {
          return dias[parte] || parte;
        }
      });
      diasTexto = diasFormateados.join(" y ");
    } else if (diasRaw.includes("-")) {
      // Ejemplo: LV, L-V
      const inicio = dias[diasRaw[0]];
      const fin = dias[diasRaw[diasRaw.length - 1]];
      diasTexto = `${inicio} a ${fin}`;
    } else {
      // Ejemplo: LS
      const letras = diasRaw.split("");
      diasTexto = letras.map((d) => dias[d] || d).join(" a ");
    }
    // Horas
    horasTexto = `con horario de ${formatearHora(match[2])} a ${formatearHora(match[3])}`;
    return `${diasTexto}, ${horasTexto}`;
  }

  // Si no coincide el regex, intentar extraer días y horas por separado
  const partes = turno.split(" ");
  let diasRaw = "";
  let horaInicio = "";
  let horaFin = "";
  partes.forEach((parte) => {
    if (/^\d+½?$/.test(parte)) {
      if (!horaInicio) horaInicio = parte;
      else horaFin = parte;
    } else if (/^[A-Z,\-]+$/.test(parte)) {
      diasRaw = parte;
    }
  });
  if (diasRaw) {
    if (diasRaw.includes(",")) {
      const partesDias = diasRaw.split(",");
      const diasFormateados = partesDias.map((parte) => {
        if (parte.includes("-")) {
          const inicio = dias[parte[0]];
          const fin = dias[parte[parte.length - 1]];
          return `${inicio} a ${fin}`;
        } else {
          return dias[parte] || parte;
        }
      });
      diasTexto = diasFormateados.join(" y ");
    } else if (diasRaw.includes("-")) {
      const inicio = dias[diasRaw[0]];
      const fin = dias[diasRaw[diasRaw.length - 1]];
      diasTexto = `${inicio} a ${fin}`;
    } else {
      const letras = diasRaw.split("");
      diasTexto = letras.map((d) => dias[d] || d).join(" a ");
    }
  }
  if (horaInicio && horaFin) {
    horasTexto = `con horario de ${formatearHora(horaInicio)} a ${formatearHora(horaFin)}`;
  }
  if (diasTexto && horasTexto) {
    return `${diasTexto}, ${horasTexto}`;
  } else if (diasTexto) {
    return diasTexto;
  } else {
    return turnoOriginal;
  }
}

/* =========================================================
   OBTENER DATOS DEL EMPLEADO
========================================================= */
exports.getEmpleadoByNumero = async (req, res) => {
  try {
    const numeroPersonal =
      req.user && (req.user.id || req.user.numeroPersonal || req.user.userId);
    if (!numeroPersonal) {
      return res.status(401).json({
        success: false,
        message:
          "No se pudo determinar el número de empleado desde el token de sesión.",
      });
    }
    console.log(`📋 Obteniendo datos del empleado (token): ${numeroPersonal}`);

    const pool = await databaseService.getPool(req.user?.empresa);
    // Ahora usamos directamente NEUS_USUARIOS como fuente de verdad
    let empleado = null;
    try {
      const alt = await pool
        .request()
        .input("numeroPersonal", sql.BigInt, numeroPersonal)
        .query(`
          SELECT
            NEUS_ID,
            NEUS_NOMBRES,
            NEUS_ALIAS,
            NEUS_TIPOUSUARIO,
            NEUS_ACTIVO,
            NEUS_STATUS,
            NEUS_FECHA_REGISTRO,
            NEUS_FECHA_INGRESO,
            id_horario,
            NEUS_FOTO_URL,
            NEUS_PORTADA_URL,
            username,
            dias_vacaciones_disponibles,
            permisos_goce_disponibles
          FROM [NEUS_USUARIOS]
          WHERE NEUS_ID = @numeroPersonal
        `);
      if (alt.recordset.length === 0) {
        return res.status(404).json({ success: false, message: "Empleado no encontrado" });
      }
      const row = alt.recordset[0];
      // Mapear campos a la estructura esperada por la lógica existente
      const nombres = (row.NEUS_NOMBRES || "").trim();
      const partes = nombres.split(/\s+/);
      const nombre = partes[0] || "";
      const apellido = partes.length > 1 ? partes.slice(-1)[0] : "";
      const segundoApellido = partes.length > 2 ? partes.slice(1, -1).join(' ') : '';

      empleado = {
        "Número de personal": row.NEUS_ID,
        "Nombre": nombre,
        "Apellido": apellido,
        "Segundo apellido": segundoApellido,
        "Posición": row.NEUS_TIPOUSUARIO || row.NEUS_ALIAS || '',
        "Unidad organizativa": '',
        "Regla para plan horario trabajo": '',
        "Status ocupación": row.NEUS_ACTIVO == 1 ? 'Activo' : (row.NEUS_STATUS || 'Inactivo'),
        "email": (row.username && row.username.indexOf('@') !== -1) ? row.username : null,
        "Fecha de alta": row.NEUS_FECHA_INGRESO || row.NEUS_FECHA_REGISTRO,
        id_horario: row.id_horario || null,
        dias_vacaciones_disponibles: row.dias_vacaciones_disponibles,
        permisos_goce_disponibles: row.permisos_goce_disponibles,
      };
      console.log('ℹ️ Datos obtenidos desde NEUS_USUARIOS para empleado', empleado["Número de personal"]);
    } catch (err) {
      console.error('❌ Error consultando NEUS_USUARIOS:', err);
      return res.status(500).json({ success: false, message: `Error en el servidor: ${err.message}` });
    }

    const fechaAlta = empleado["Fecha de alta"];
    let aniosAntiguedad = 0;

    if (fechaAlta) {
      const fechaAltaDate = new Date(fechaAlta);
      const hoy = new Date();
      const diffTime = hoy - fechaAltaDate;
      const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
      aniosAntiguedad = Math.floor(diffYears);
      if (aniosAntiguedad < 0) aniosAntiguedad = 0;
    }

    console.log(
      `📅 Fecha de alta: ${fechaAlta}, Años de antigüedad: ${aniosAntiguedad}`
    );

    // Saldos de vacaciones/permisos: usar directamente lo que hay en NEUS_USUARIOS
    let diasVacacionesDisponibles = empleado.dias_vacaciones_disponibles || 0;
    let permisosConGoce = empleado.permisos_goce_disponibles || 0;

    console.log(
      `📊 Días disponibles reales - Vacaciones: ${diasVacacionesDisponibles}, Permisos: ${permisosConGoce}`
    );

    // Preferir obtener el horario desde la tabla central `intranet.dbo.horarios`
    // usando `id_horario`. Si no existe, caer a `intranet_totis.dbo.horarios_totis`.
    let turnoOriginal = '';
    let horarioTotis = null;
    let horarioTotisFormateado = null;
    let nomenclaturaTotis = null;
    if (empleado.id_horario) {
      try {
        const horarioResult = await pool
          .request()
          .input("id_horario", sql.Int, empleado.id_horario)
          .query(`
            SELECT TOP 1 [horario], [nomenclatura]
            FROM [horarios]
            WHERE [id] = @id_horario
          `);
        if (horarioResult.recordset.length > 0) {
          horarioTotis = horarioResult.recordset[0].horario;
          horarioTotisFormateado = formatearTurno(horarioTotis);
          nomenclaturaTotis = horarioResult.recordset[0].nomenclatura;
        }
      } catch (err) {
        console.warn('⚠️ Error consultando [horarios]:', err.message);
      }
    }

    // Si obtuvimos un horario desde las tablas, sobreescribir turnoOriginal
    if (horarioTotis) {
      turnoOriginal = horarioTotis;
    }
    const turnoFormateado = formatearTurno(turnoOriginal);

    const datosCompletos = {
      ...empleado,
      horario: horarioTotis || turnoOriginal || '',
      horario_formateado: turnoFormateado,
      turno_original: turnoOriginal,
      anios_antiguedad: aniosAntiguedad,
      permisos_disponibles: permisosConGoce,
      vacaciones_disponibles: diasVacacionesDisponibles,
      horario_totis: horarioTotis || '',
      horario_totis_formateado: horarioTotisFormateado || '',
      rt_totis: nomenclaturaTotis || '',
      id_horario: empleado.id_horario || null,
    };

    console.log('RT para empleado:', empleado["Número de personal"], 'id_horario:', empleado.id_horario, 'rt_totis:', nomenclaturaTotis);
    console.log("✅ Datos del empleado obtenidos correctamente");

    res.json({
      success: true,
      data: datosCompletos,
    });
  } catch (error) {
    console.error("❌ Error obteniendo datos del empleado:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   POOL DE 12 DÍAS — saldo compartido vacaciones + permisos
   Condiciones: usuario activo + más de 1 año de antigüedad
========================================================= */
const POOL_DIAS = 12;

// MODO='ASIGNAR' fuerza tienePool=1 aunque no califique por antigüedad/rol.
// MODO='QUITAR'  fuerza tienePool=0 aunque califique (incluye AD).
async function ensurePoolOverrideTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='VACACIONES_POOL_OVERRIDE' AND xtype='U')
    CREATE TABLE VACACIONES_POOL_OVERRIDE (
      NEUS_ID         INT NOT NULL PRIMARY KEY,
      MODO            NVARCHAR(10) NOT NULL DEFAULT 'ASIGNAR',
      ASIGNADO_POR    INT NOT NULL,
      FECHA_ASIGNADO  DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='VACACIONES_POOL_OVERRIDE' AND COLUMN_NAME='MODO')
      ALTER TABLE VACACIONES_POOL_OVERRIDE ADD MODO NVARCHAR(10) NOT NULL DEFAULT 'ASIGNAR';
  `);
}

async function setPoolOverride(pool, uid, modo, asignadoPor) {
  await ensurePoolOverrideTable(pool);
  await pool.request()
    .input('uid', sql.Int, uid)
    .input('modo', sql.NVarChar, modo)
    .input('asignadoPor', sql.Int, asignadoPor)
    .query(`
      MERGE VACACIONES_POOL_OVERRIDE AS t
      USING (SELECT @uid AS NEUS_ID) AS s ON t.NEUS_ID = s.NEUS_ID
      WHEN MATCHED THEN UPDATE SET MODO=@modo, ASIGNADO_POR=@asignadoPor, FECHA_ASIGNADO=GETDATE()
      WHEN NOT MATCHED THEN INSERT (NEUS_ID, MODO, ASIGNADO_POR) VALUES (@uid, @modo, @asignadoPor);
    `);
}

// POST /api/vacaciones/pool-override/:usuarioId — asigna manualmente el pool de 12 días
// a un empleado que por antigüedad (< 1 año) todavía no calificaría.
exports.asignarPoolManual = async (req, res) => {
  try {
    const uid = parseInt(req.params.usuarioId, 10);
    if (!uid) return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    const asignadoPor = req.user?.id || req.user?.userId || 0;

    const pool = await databaseService.getPool(req.user?.empresa);
    await setPoolOverride(pool, uid, 'ASIGNAR', asignadoPor);

    try { getIO(req.user?.empresa).emit('vacaciones:diasActualizados', { usuarioId: uid }); } catch (_) {}
    return res.json({ success: true, message: 'Pool asignado' });
  } catch (e) {
    console.error('❌ Error asignarPoolManual:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/vacaciones/pool-override/:usuarioId — quita el pool manualmente
// (incluye AD y usuarios que ya calificaban por antigüedad; queda marcado como
// exclusión explícita hasta que se restaure con POST /restaurar).
exports.quitarPoolManual = async (req, res) => {
  try {
    const uid = parseInt(req.params.usuarioId, 10);
    if (!uid) return res.status(400).json({ success: false, message: 'usuarioId inválido' });
    const asignadoPor = req.user?.id || req.user?.userId || 0;

    const pool = await databaseService.getPool(req.user?.empresa);
    await setPoolOverride(pool, uid, 'QUITAR', asignadoPor);

    try { getIO(req.user?.empresa).emit('vacaciones:diasActualizados', { usuarioId: uid }); } catch (_) {}
    return res.json({ success: true, message: 'Pool retirado' });
  } catch (e) {
    console.error('❌ Error quitarPoolManual:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/vacaciones/pool-override/:usuarioId/restaurar — quita cualquier
// override y deja que el pool se calcule de forma automática (rol/antigüedad).
exports.restaurarPoolAutomatico = async (req, res) => {
  try {
    const uid = parseInt(req.params.usuarioId, 10);
    if (!uid) return res.status(400).json({ success: false, message: 'usuarioId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensurePoolOverrideTable(pool);
    await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM VACACIONES_POOL_OVERRIDE WHERE NEUS_ID=@uid`);

    try { getIO(req.user?.empresa).emit('vacaciones:diasActualizados', { usuarioId: uid }); } catch (_) {}
    return res.json({ success: true, message: 'Pool restaurado a automático' });
  } catch (e) {
    console.error('❌ Error restaurarPoolAutomatico:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

async function calcularSaldoPool(pool, userId) {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return { elegible: false, razon: 'ID de usuario inválido', diasUsados: 0, diasDisponibles: 0, sinPool: false };

  const r = await pool.request()
    .input('uid', sql.Int, uid)
    .query(`
      SELECT
        NEUS_ACTIVO,
        NEUS_FECHA_INGRESO,
        NEUS_FECHA_REGISTRO,
        NEUS_TIPOUSUARIO
      FROM [NEUS_USUARIOS]
      WHERE NEUS_ID = @uid
    `);
  if (!r.recordset.length) return { elegible: false, razon: 'Usuario no encontrado', diasUsados: 0, diasDisponibles: 0, sinPool: false };

  const row = r.recordset[0];
  if (!row.NEUS_ACTIVO) return { elegible: false, razon: 'Usuario inactivo', diasUsados: 0, diasDisponibles: 0, sinPool: false };

  // Calcular antigüedad (AD siempre tiene pool)
  const esAdmin = (row.NEUS_TIPOUSUARIO || '').toUpperCase() === 'AD';
  let tienePool = esAdmin;
  let anios = 99;

  if (!esAdmin) {
    const fechaIngreso = row.NEUS_FECHA_INGRESO || row.NEUS_FECHA_REGISTRO;
    if (fechaIngreso) {
      anios = (Date.now() - new Date(fechaIngreso).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      tienePool = anios >= 1;
    }
    // Sin fecha de ingreso: se permite la solicitud pero sin pool (descuento en nómina)
  }

  // Override manual (ambos sentidos, incluye AD): ASIGNAR fuerza pool aunque no
  // califique todavía; QUITAR lo retira aunque califique por rol/antigüedad.
  await ensurePoolOverrideTable(pool);
  const ov = await pool.request().input('uid', sql.Int, uid)
    .query('SELECT MODO FROM VACACIONES_POOL_OVERRIDE WHERE NEUS_ID=@uid');
  if (ov.recordset.length > 0) {
    tienePool = ov.recordset[0].MODO === 'ASIGNAR';
  }

  if (!tienePool) {
    // Usuarios con < 1 año: pueden solicitar permisos pero sin pool — se descuenta de nómina
    const meses = Math.floor(anios * 12);
    return {
      elegible: true,
      sinPool: true,
      mesesAntigüedad: meses,
      diasUsados: 0,
      diasDisponibles: 0,
      poolTotal: 0,
      anios: 0,
    };
  }

  // Usuarios con ≥ 1 año: pool de 12 días
  const anioActual = new Date().getFullYear();
  const usados = await pool.request()
    .input('uid', sql.Int, uid)
    .input('anio', sql.Int, anioActual)
    .query(`
      SELECT ISNULL(SUM(dias_solicitados), 0) AS total
      FROM [dbo].[solicitudes_vacaciones]
      WHERE numero_personal = @uid
        AND estado IN ('PENDIENTE', 'APROBADA')
        AND YEAR(fecha_inicio) = @anio
    `);

  const diasUsados = usados.recordset[0].total || 0;
  const diasDisponibles = Math.max(0, POOL_DIAS - diasUsados);

  return { elegible: true, sinPool: false, diasUsados, diasDisponibles, poolTotal: POOL_DIAS, anios: Math.floor(anios) };
}

exports.getMiSaldo = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user.userId || req.user.NEUS_ID);
    if (!userId) return res.status(401).json({ success: false, message: 'Sin usuario autenticado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const saldo = await calcularSaldoPool(pool, userId);
    return res.json({ success: true, data: saldo });
  } catch (err) {
    console.error('❌ Error getMiSaldo:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   CREAR SOLICITUD (Descuenta días al momento de crear)
========================================================= */
exports.crearSolicitud = async (req, res) => {
  try {
    const {
      numeroPersonal,
      nombreEmpleado,
      puesto,
      departamento,
      tipoSolicitud,
      fechaInicio,
      fechaFin,
      diasSolicitados,
      turnoOriginal,
      emailSolicitante,
    } = req.body;

    const npInt = parseInt(numeroPersonal, 10);
    console.log(`📝 Creando solicitud para empleado: ${npInt}, tipo: ${tipoSolicitud}`);

    const pool = await databaseService.getPool(req.user?.empresa);

    // Validar elegibilidad y saldo del pool de 12 días
    const saldo = await calcularSaldoPool(pool, npInt);
    if (!saldo.elegible) {
      return res.status(403).json({ success: false, message: saldo.razon });
    }

    // Usuarios sin pool (< 1 año): solo pueden solicitar permisos, no vacaciones
    if (saldo.sinPool) {
      const tipoEnviado = tipoSolicitud === '0100' || tipoSolicitud === '0200' ? tipoSolicitud : '0200';
      if (tipoEnviado === '0200') {
        return res.status(403).json({
          success: false,
          message: `No puedes solicitar vacaciones aún. Necesitas al menos 1 año de antigüedad (tienes ${saldo.mesesAntigüedad} mes${saldo.mesesAntigüedad !== 1 ? 'es' : ''}).`,
        });
      }
      // Permiso sin pool: se permite pero se notifica descuento en nómina
    }

    if (!saldo.sinPool && diasSolicitados > saldo.diasDisponibles) {
      return res.status(400).json({
        success: false,
        message: `No tienes días disponibles suficientes. Disponibles: ${saldo.diasDisponibles} de ${POOL_DIAS}. Ya usados este año: ${saldo.diasUsados}.`,
      });
    }

    const hoy = new Date();
    const fechaInicioDate = new Date(fechaInicio);
    const diffDias = Math.ceil((fechaInicioDate - hoy) / (1000 * 60 * 60 * 24));
    if (diffDias < 3) {
      console.warn(`⚠️ Solicitud con menos de 3 días de anticipación: ${diffDias} día(s).`);
    }

    // Tipo determinado por lo que manda el frontend (0100=Permiso, 0200=Vacaciones)
    const tipoSolicitudDB = (tipoSolicitud === '0100' || tipoSolicitud === '0200') ? tipoSolicitud : '0200';
    const restaPermisos   = tipoSolicitudDB === '0100' ? (diasSolicitados || 0) : 0;
    const restaVacaciones = tipoSolicitudDB === '0200' ? (diasSolicitados || 0) : 0;

    // Insertar solicitud
    const result = await pool
      .request()
      .input("numeroPersonal", sql.Int, npInt)
      .input("nombreEmpleado", sql.NVarChar, nombreEmpleado)
      .input("puesto", sql.NVarChar, puesto)
      .input("departamento", sql.NVarChar, departamento)
      .input("tipoSolicitud", sql.NVarChar, tipoSolicitudDB)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .input("diasSolicitados", sql.Int, diasSolicitados)
      .input("turnoOriginal", sql.NVarChar, turnoOriginal || "")
      .input("emailSolicitante", sql.NVarChar, emailSolicitante || "")
      .input("descontados_permisos_goce", sql.Int, restaPermisos)
      .input("descontados_vacaciones", sql.Int, restaVacaciones).query(`
        INSERT INTO [dbo].[solicitudes_vacaciones] 
        (numero_personal, nombre_empleado, puesto, departamento, tipo_solicitud, 
         fecha_inicio, fecha_fin, dias_solicitados, turno_original, email_solicitante, descontados_permisos_goce, descontados_vacaciones)
        OUTPUT INSERTED.id
        VALUES (@numeroPersonal, @nombreEmpleado, @puesto, @departamento, @tipoSolicitud,
                @fechaInicio, @fechaFin, @diasSolicitados, @turnoOriginal, @emailSolicitante, @descontados_permisos_goce, @descontados_vacaciones)
      `);

    const solicitudId = result.recordset[0].id;
    console.log(`✅ Solicitud creada con ID: ${solicitudId}`);
    notifyVacacionesDiasActualizados(npInt, req.user?.empresa);

    // Correo del solicitante: se toma del perfil (NEUS_CORREO), no de lo que mande el frontend
    let correoSolicitante = "";
    try {
      const correoResult = await pool
        .request()
        .input("uid", sql.Int, npInt)
        .query(`SELECT ISNULL(NEUS_CORREO,'') as correo FROM [NEUS_USUARIOS] WHERE NEUS_ID = @uid`);
      correoSolicitante = correoResult.recordset[0]?.correo || "";
    } catch (err) {
      console.warn("⚠️ No se pudo leer el correo del solicitante:", err.message);
    }

    // Notificar a los administradores (AD) definidos en PERMISOS_MAIL_TO,
    // y también al solicitante si tiene correo registrado en su perfil.
    const notificadoPorCorreo = Boolean(correoSolicitante);
    const emailService = require("../services/emailService");
    try {
      await emailService.sendVacacionSolicitudEmail({
        solicitudId,
        empleadoNombre: nombreEmpleado,
        numeroPersonal,
        tipoSolicitud: tipoSolicitudDB,
        fechaInicio,
        fechaFin,
        diasSolicitados,
        puesto,
        departamento,
        correoSolicitante,
        tenantKey: req.user?.empresa,
      });
      console.log(
        notificadoPorCorreo
          ? `✅ Emails de solicitud enviados a PERMISOS_MAIL_TO y a ${correoSolicitante}`
          : "✅ Emails de solicitud enviados a PERMISOS_MAIL_TO (solicitante sin correo en su perfil, notificado solo por intranet)"
      );
    } catch (emailError) {
      console.error(
        "⚠️ Error enviando emails de solicitud de vacaciones:",
        emailError.message
      );
    }

    // Saldos actualizados (desde NEUS_USUARIOS)
    let saldoPermisos = null;
    let saldoVacaciones = null;
    try {
      const saldoResult = await pool
        .request()
        .input("numeroPersonal", sql.Int, npInt).query(`
          SELECT permisos_goce_disponibles, dias_vacaciones_disponibles
          FROM [NEUS_USUARIOS]
          WHERE NEUS_ID = @numeroPersonal
        `);
      if (saldoResult.recordset.length > 0) {
        saldoPermisos = saldoResult.recordset[0].permisos_goce_disponibles;
        saldoVacaciones = saldoResult.recordset[0].dias_vacaciones_disponibles;
      }
    } catch (err) {
      console.warn('⚠️ No se pudo leer saldos finales en NEUS_USUARIOS; se devolverán nulls. Error:', err.message);
    }

    res.json({
      success: true,
      message: "Solicitud creada correctamente",
      solicitudId,
      descuentoNomina: saldo.sinPool === true,
      permisosConGoce: saldoPermisos,
      diasVacaciones: saldoVacaciones,
      notificadoPorCorreo,
    });
  } catch (error) {
    console.error("❌ Error creando solicitud:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   OBTENER SOLICITUDES
========================================================= */
exports.getSolicitudes = async (req, res) => {
  try {
    const { estado } = req.query;
    let { numeroPersonal } = req.query;

    // Solo quien tiene el permiso de aprobar/rechazar (o es super-admin) puede ver
    // el historial de TODOS. Cualquier otro usuario solo ve sus propias solicitudes,
    // sin importar qué numeroPersonal intente mandar en el query string.
    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    if (!esSuperAdminFijo(req)) {
      const allowed = await getUserAllowedActions(uid, "vacaciones", req.user?.empresa);
      const puedeVerTodas = allowed.has("*") || allowed.has("aprobar-rechazar");
      if (!puedeVerTodas) numeroPersonal = String(uid);
    }

    console.log(
      `📋 Obteniendo solicitudes - Estado: ${
        estado || "TODAS"
      }, NumeroPersonal: ${numeroPersonal || "TODOS"}`
    );

    const pool = await databaseService.getPool(req.user?.empresa);

    let query = `
      SELECT 
        id,
        numero_personal,
        nombre_empleado,
        puesto,
        departamento,
        tipo_solicitud,
        fecha_inicio,
        fecha_fin,
        dias_solicitados,
        estado,
        comentario_admin,
        fecha_solicitud,
        fecha_respuesta,
        revisado_por,
        email_solicitante,
        descontados_permisos_goce,
        descontados_vacaciones
      FROM [dbo].[solicitudes_vacaciones]
    `;

    const conditions = [];
    if (estado && estado !== "TODAS") conditions.push("estado = @estado");
    if (numeroPersonal) conditions.push("numero_personal = @numeroPersonal");

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += " ORDER BY fecha_solicitud DESC";

    const request = pool.request();
    if (estado && estado !== "TODAS")
      request.input("estado", sql.NVarChar, estado);
    if (numeroPersonal)
      request.input("numeroPersonal", sql.NVarChar, numeroPersonal);

    const result = await request.query(query);

    console.log(`✅ Solicitudes encontradas: ${result.recordset.length}`);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("❌ Error obteniendo solicitudes:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   CONTAR SOLICITUDES PENDIENTES (UNICA VERSIÓN)
========================================================= */
exports.contarSolicitudesPendientes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
        SELECT COUNT(*) as total
        FROM [dbo].[solicitudes_vacaciones]
        WHERE estado = 'PENDIENTE'
      `);
    const total = result.recordset[0].total;
    res.json({ success: true, total });
  } catch (error) {
    console.error("❌ Error contando solicitudes:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   OBTENER TABLA dias_goce (INTRANET)
   Devuelve todos los registros ordenados por anios_antiguedad
========================================================= */
exports.getDiasGoce = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT [id], [anios_antiguedad], [dias_vacaciones], [fecha_creacion]
      FROM [dias_goce]
      ORDER BY [anios_antiguedad]
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('❌ Error obteniendo dias_goce:', error);
    res.status(500).json({ success: false, message: `Error en el servidor: ${error.message}` });
  }
};

/* =========================================================
   RESPONDER SOLICITUD (APROBAR / RECHAZAR desde frontend)
   - Ya NO descuenta días al aprobar porque se hizo al crear.
   - Si RECHAZA: devuelve días descontados.
========================================================= */
// Crea (si no existen) una fila en ASISTENCIA_EXCEPCIONES por cada día del rango
// [fecha_inicio, fecha_fin] de una solicitud de vacaciones ya aprobada. Idempotente:
// si el día ya tiene excepción (ej. se marcó primero desde Asistencia) no la duplica.
async function crearExcepcionesAsistenciaDesdeSolicitud(pool, solicitud, creadoPor, tenantKey) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_EXCEPCIONES' AND xtype='U')
      CREATE TABLE ASISTENCIA_EXCEPCIONES (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        NEUS_ID         INT NOT NULL,
        FECHA           DATE NOT NULL,
        TIPO            NVARCHAR(20) NOT NULL DEFAULT 'VACACIONES',
        CREADO_POR      INT NOT NULL,
        FECHA_CREACION  DATETIME DEFAULT GETDATE(),
        SOLICITUD_ID    INT NULL,
        CONSTRAINT UQ_ASISTENCIA_EXCEPCIONES UNIQUE (NEUS_ID, FECHA)
      )
    `);

    const uid = parseInt(solicitud.numero_personal, 10);
    if (!uid) return;
    const fi = new Date(solicitud.fecha_inicio);
    const ff = new Date(solicitud.fecha_fin || solicitud.fecha_inicio);
    if (isNaN(fi.getTime()) || isNaN(ff.getTime())) return;

    for (let d = new Date(fi); d <= ff; d.setDate(d.getDate() + 1)) {
      const fechaStr = d.toISOString().slice(0, 10);
      await pool.request()
        .input('uid', sql.Int, uid)
        .input('fecha', sql.NVarChar, fechaStr)
        .input('tipo', sql.NVarChar, 'VACACIONES')
        .input('creadoPor', sql.Int, creadoPor || 0)
        .input('solicitudId', sql.Int, solicitud.id)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXCEPCIONES WHERE NEUS_ID=@uid AND FECHA=@fecha)
            INSERT INTO ASISTENCIA_EXCEPCIONES (NEUS_ID, FECHA, TIPO, CREADO_POR, SOLICITUD_ID)
            VALUES (@uid, @fecha, @tipo, @creadoPor, @solicitudId)
        `);
    }

    try { getIO(tenantKey).emit('vacaciones:diasActualizados', { usuarioId: uid }); } catch (_) {}
  } catch (e) {
    console.error('❌ Error crearExcepcionesAsistenciaDesdeSolicitud:', e.message);
    // No se relanza: un fallo aquí no debe bloquear la aprobación de la solicitud.
  }
}

exports.responderSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentarioAdmin, revisadoPor } = req.body;

    console.log(`✅ Respondiendo solicitud ${id}: ${estado}`);

    const pool = await databaseService.getPool(req.user?.empresa);
    const solicitudResult = await pool.request().input("id", sql.Int, id)
      .query(`
        SELECT * FROM [dbo].[solicitudes_vacaciones]
        WHERE id = @id
      `);

    if (solicitudResult.recordset.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Solicitud no encontrada" });
    }

    const solicitud = solicitudResult.recordset[0];

    // Devolver días si se rechaza
    if (estado === "RECHAZADA") {
      await devolverDiasDescontados(pool, solicitud);
    }

    // Al aprobar VACACIONES (tipo '0200'), reflejar cada día del rango como excepción
    // en Asistencia (ASISTENCIA_EXCEPCIONES) — mismo efecto que "marcar desde Asistencia",
    // así el día deja de contarse como Falta ahí y, vía ASISTENCIA_EXCEPCIONES, tampoco
    // se descuenta en Nómina, sin depender de que un admin lo repita a mano en cada módulo.
    if (estado === "APROBADA" && solicitud.tipo_solicitud === "0200") {
      const aprobadoPorId = req.user?.id || req.user?.userId || 0;
      await crearExcepcionesAsistenciaDesdeSolicitud(pool, solicitud, aprobadoPorId, req.user?.empresa);
    }

    // Actualizar estado y comentario
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("estado", sql.NVarChar, estado)
      .input("comentarioAdmin", sql.NVarChar, comentarioAdmin || "")
      .input("revisadoPor", sql.NVarChar, revisadoPor || "").query(`
        UPDATE [dbo].[solicitudes_vacaciones]
        SET estado = @estado,
            comentario_admin = @comentarioAdmin,
            revisado_por = @revisadoPor,
            fecha_respuesta = GETDATE()
        WHERE id = @id
      `);

    notifyVacacionesDiasActualizados(solicitud.numero_personal, req.user?.empresa);

    // Email al solicitante (deshabilitado temporalmente: usuarios sin correo)
    // if (solicitud.email_solicitante) {
    //   const emailService = require("../services/emailService");
    //   try {
    //     await emailService.sendVacacionRespuestaEmail({
    //       email: solicitud.email_solicitante,
    //       nombreEmpleado: solicitud.nombre_empleado,
    //       tipoSolicitud: solicitud.tipo_solicitud,
    //       fechaInicio: solicitud.fecha_inicio,
    //       fechaFin: solicitud.fecha_fin,
    //       diasSolicitados: solicitud.dias_solicitados,
    //       estado,
    //       comentarioAdmin: comentarioAdmin || "",
    //     });
    //     console.log(
    //       `✅ Email de respuesta enviado a: ${solicitud.email_solicitante}`
    //     );
    //   } catch (emailError) {
    //     console.error(
    //       "⚠️ Error enviando email de respuesta:",
    //       emailError.message
    //     );
    //   }
    // }

    // Push al solicitante — no depende de tener correo registrado (a
    // diferencia del email de arriba), así que sí puede ir siempre que el
    // usuario tenga una suscripción push activa.
    try {
      const pushService = require("../services/pushService");
      const tipoLegibleResp = solicitud.tipo_solicitud === "0100" ? "permiso con goce" : "solicitud de vacaciones";
      await pushService.enviarATodasLasSuscripciones(pool, parseInt(solicitud.numero_personal, 10), {
        titulo: estado === "APROBADA" ? "Solicitud aprobada" : "Solicitud rechazada",
        cuerpo: `Tu ${tipoLegibleResp} fue ${estado === "APROBADA" ? "aprobada" : "rechazada"}${comentarioAdmin ? ": " + comentarioAdmin : ""}`,
        url: "/vacaciones",
        tag: `vacacion-resultado-${id}`,
      });
    } catch (pushError) {
      console.error("⚠️ Error enviando push de respuesta de vacaciones:", pushError.message);
    }

    // Saldos solo si se rechazó (fueron devueltos)
    let saldoPermisos = null;
    let saldoVacaciones = null;
    if (estado === "RECHAZADA") {
      const saldoResult = await pool
        .request()
        .input("numeroPersonal", sql.NVarChar, solicitud.numero_personal)
        .query(`
          SELECT permisos_goce_disponibles, dias_vacaciones_disponibles
          FROM [NEUS_USUARIOS]
          WHERE NEUS_ID = @numeroPersonal
        `);
      if (saldoResult.recordset.length > 0) {
        saldoPermisos = saldoResult.recordset[0].permisos_goce_disponibles;
        saldoVacaciones = saldoResult.recordset[0].dias_vacaciones_disponibles;
      }
    }

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || null,
      modulo:    'vacaciones',
      accion:    estado === 'APROBADA' ? 'aprobar' : 'rechazar',
      entidadId: id,
      detalle:   { solicitudId: id, empleado: solicitud.nombre_empleado, tipo: solicitud.tipo_solicitud, dias: solicitud.dias_solicitados, estado },
      ip:        req.ip
    });

    res.json({
      success: true,
      message: `Solicitud ${estado.toLowerCase()} correctamente`,
      permisosConGoce: saldoPermisos,
      diasVacaciones: saldoVacaciones,
    });
  } catch (error) {
    console.error("❌ Error respondiendo solicitud:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   EDITAR SOLICITUD (Solo si PENDIENTE y del mismo usuario)
   - Reajusta saldos según diferencia.
========================================================= */
exports.editarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      numeroPersonal,
      nombreEmpleado,
      puesto,
      departamento,
      tipoSolicitud,
      fechaInicio,
      fechaFin,
      diasSolicitados,
      turnoOriginal,
      emailSolicitante,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);

    const solicitudResult = await pool.request().input("id", sql.Int, id)
      .query(`
        SELECT * FROM [dbo].[solicitudes_vacaciones]
        WHERE id = @id
      `);

    if (solicitudResult.recordset.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Solicitud no encontrada" });
    }
    const solicitud = solicitudResult.recordset[0];
    if (solicitud.estado !== "PENDIENTE") {
      return res.status(400).json({
        success: false,
        message: "Solo se pueden editar solicitudes pendientes",
      });
    }

    console.log("🔎 Validando número de empleado para edición:");
    console.log(
      "  solicitud.numero_personal:",
      solicitud.numero_personal,
      "| tipo:",
      typeof solicitud.numero_personal
    );
    console.log(
      "  numeroPersonal (body):",
      numeroPersonal,
      "| tipo:",
      typeof numeroPersonal
    );

    if (String(solicitud.numero_personal) !== String(numeroPersonal)) {
      console.warn(
        "❌ No coinciden los números de empleado. Bloqueando edición."
      );
      return res.status(403).json({
        success: false,
        message:
          "No tienes permiso para editar esta solicitud. Verifica tu sesión y número de empleado.",
      });
    }

    // Diferencia de días
    const diasOriginal = solicitud.dias_solicitados;
    const diferencia = diasSolicitados - diasOriginal;
    let nuevoSaldoPermisos = null;
    let nuevoSaldoVacaciones = null;

    if (diferencia !== 0) {
      // Obtener saldos
      const saldoPermisosResult = await pool
        .request()
        .input("numeroPersonal", sql.BigInt, numeroPersonal)
        .query(
          "SELECT permisos_goce_disponibles FROM [NEUS_USUARIOS] WHERE NEUS_ID = @numeroPersonal"
        );
      const saldoVacacionesResult = await pool
        .request()
        .input("numeroPersonal", sql.BigInt, numeroPersonal)
        .query(
          "SELECT dias_vacaciones_disponibles FROM [NEUS_USUARIOS] WHERE NEUS_ID = @numeroPersonal"
        );

      let saldoPermisos =
        saldoPermisosResult.recordset[0]?.permisos_goce_disponibles ?? 0;
      let saldoVacaciones =
        saldoVacacionesResult.recordset[0]?.dias_vacaciones_disponibles ?? 0;

      if (diferencia > 0) {
        // Aumenta días: restar primero permisos con goce
        let restar = diferencia;
        let restaPermisos = 0;
        let restaVacaciones = 0;
        if (saldoPermisos > 0) {
          if (restar <= saldoPermisos) {
            restaPermisos = restar;
            restar = 0;
          } else {
            restaPermisos = saldoPermisos;
            restar -= saldoPermisos;
          }
        }
        if (restar > 0 && saldoVacaciones > 0) {
          if (restar <= saldoVacaciones) {
            restaVacaciones = restar;
            restar = 0;
          } else {
            restaVacaciones = saldoVacaciones;
            restar -= saldoVacaciones;
          }
        }
        if (restaPermisos > 0) {
          await pool
            .request()
            .input("numeroPersonal", sql.BigInt, numeroPersonal)
            .input("nuevoSaldo", sql.Int, saldoPermisos - restaPermisos)
            .query(
              "UPDATE [NEUS_USUARIOS] SET permisos_goce_disponibles = @nuevoSaldo WHERE NEUS_ID = @numeroPersonal"
            );
        }
        if (restaVacaciones > 0) {
          await pool
            .request()
            .input("numeroPersonal", sql.BigInt, numeroPersonal)
            .input("nuevoSaldo", sql.Int, saldoVacaciones - restaVacaciones)
            .query(
              "UPDATE [NEUS_USUARIOS] SET dias_vacaciones_disponibles = @nuevoSaldo WHERE NEUS_ID = @numeroPersonal"
            );
        }
        nuevoSaldoPermisos = saldoPermisos - restaPermisos;
        nuevoSaldoVacaciones = saldoVacaciones - restaVacaciones;
      } else {
        // Disminuye días: devolver saldos proporcional a lo descontado originalmente
        let devolver = -diferencia;
        let devuelvePermisos = 0;
        let devuelveVacaciones = 0;

        if (solicitud.descontados_permisos_goce > 0) {
          if (devolver <= solicitud.descontados_permisos_goce) {
            devuelvePermisos = devolver;
            devolver = 0;
          } else {
            devuelvePermisos = solicitud.descontados_permisos_goce;
            devolver -= solicitud.descontados_permisos_goce;
          }
        }
        if (devolver > 0 && solicitud.descontados_vacaciones > 0) {
          if (devolver <= solicitud.descontados_vacaciones) {
            devuelveVacaciones = devolver;
            devolver = 0;
          } else {
            devuelveVacaciones = solicitud.descontados_vacaciones;
            devolver -= solicitud.descontados_vacaciones;
          }
        }
        if (devuelvePermisos > 0) {
          await pool
            .request()
            .input("numeroPersonal", sql.BigInt, numeroPersonal)
            .input("nuevoSaldo", sql.Int, saldoPermisos + devuelvePermisos)
            .query(
              "UPDATE [NEUS_USUARIOS] SET permisos_goce_disponibles = @nuevoSaldo WHERE NEUS_ID = @numeroPersonal"
            );
        }
        if (devuelveVacaciones > 0) {
          await pool
            .request()
            .input("numeroPersonal", sql.BigInt, numeroPersonal)
            .input("nuevoSaldo", sql.Int, saldoVacaciones + devuelveVacaciones)
            .query(
              "UPDATE [NEUS_USUARIOS] SET dias_vacaciones_disponibles = @nuevoSaldo WHERE NEUS_ID = @numeroPersonal"
            );
        }
        nuevoSaldoPermisos = saldoPermisos + devuelvePermisos;
        nuevoSaldoVacaciones = saldoVacaciones + devuelveVacaciones;
      }
    }

    // Recalcular distribución de días descontados para la solicitud editada
    const saldoActualPermisos = await pool
      .request()
      .input("numeroPersonal", sql.BigInt, numeroPersonal)
      .query(
        "SELECT permisos_goce_disponibles FROM [NEUS_USUARIOS] WHERE NEUS_ID = @numeroPersonal"
      );
    const saldoActualVacaciones = await pool
      .request()
      .input("numeroPersonal", sql.BigInt, numeroPersonal)
      .query(
        "SELECT dias_vacaciones_disponibles FROM [NEUS_USUARIOS] WHERE NEUS_ID = @numeroPersonal"
      );

    let permisosConGoce =
      saldoActualPermisos.recordset[0]?.permisos_goce_disponibles ?? 0;
    let diasVacacionesDisponibles =
      saldoActualVacaciones.recordset[0]?.dias_vacaciones_disponibles ?? 0;

    let diasRestar = diasSolicitados;
    let descontadosPermisosGoce = 0;
    let descontadosVacaciones = 0;

    if (permisosConGoce > 0) {
      if (diasRestar <= permisosConGoce) {
        descontadosPermisosGoce = diasRestar;
        diasRestar = 0;
      } else {
        descontadosPermisosGoce = permisosConGoce;
        diasRestar -= permisosConGoce;
      }
    }

    if (diasRestar > 0 && diasVacacionesDisponibles > 0) {
      if (diasRestar <= diasVacacionesDisponibles) {
        descontadosVacaciones = diasRestar;
        diasRestar = 0;
      } else {
        descontadosVacaciones = diasVacacionesDisponibles;
        diasRestar -= diasVacacionesDisponibles;
      }
    }

    if (diasRestar > 0) {
      descontadosVacaciones += diasRestar; // saldo negativo
      diasRestar = 0;
    }

    // Invalidar token anterior (si existe) y marcar token_invalido
    await pool.request().input("id", sql.Int, id).query(`
        UPDATE [dbo].[solicitudes_vacaciones] SET token_invalido = 1 WHERE id = @id
      `);

    // Actualizar solicitud
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombreEmpleado", sql.NVarChar, nombreEmpleado)
      .input("puesto", sql.NVarChar, puesto)
      .input("departamento", sql.NVarChar, departamento)
      .input("tipoSolicitud", sql.NVarChar, tipoSolicitud)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .input("diasSolicitados", sql.Int, diasSolicitados)
      .input("turnoOriginal", sql.NVarChar, turnoOriginal || "")
      .input("emailSolicitante", sql.NVarChar, emailSolicitante || "")
      .input("descontadosPermisosGoce", sql.Int, descontadosPermisosGoce)
      .input("descontadosVacaciones", sql.Int, descontadosVacaciones).query(`
        UPDATE [dbo].[solicitudes_vacaciones]
        SET nombre_empleado = @nombreEmpleado,
            puesto = @puesto,
            departamento = @departamento,
            tipo_solicitud = @tipoSolicitud,
            fecha_inicio = @fechaInicio,
            fecha_fin = @fechaFin,
            dias_solicitados = @diasSolicitados,
            turno_original = @turnoOriginal,
            email_solicitante = @emailSolicitante,
            descontados_permisos_goce = @descontadosPermisosGoce,
            descontados_vacaciones = @descontadosVacaciones
        WHERE id = @id
      `);

    // Reenviar correo a administradores (lista PERMISOS_MAIL_TO) con nuevo token
    const emailService = require("../services/emailService");
    try {
      await emailService.sendVacacionSolicitudEmail({
        solicitudId: id,
        empleadoNombre: nombreEmpleado,
        numeroPersonal,
        tipoSolicitud,
        fechaInicio,
        fechaFin,
        diasSolicitados,
        puesto,
        departamento,
        tenantKey: req.user?.empresa,
      });
      console.log("✅ Emails de edición de solicitud enviados a PERMISOS_MAIL_TO");
    } catch (emailError) {
      console.error(
        "⚠️ Error enviando emails de edición de solicitud:",
        emailError.message
      );
    }

    // Obtener saldo actualizado si hubo cambio
    let saldoFinal = nuevoSaldoPermisos;
    if (saldoFinal === null) {
      const saldoResult = await pool
        .request()
        .input("numeroPersonal", sql.BigInt, numeroPersonal)
        .query(
          "SELECT permisos_goce_disponibles FROM [NEUS_USUARIOS] WHERE NEUS_ID = @numeroPersonal"
        );
      saldoFinal = saldoResult.recordset[0]?.permisos_goce_disponibles ?? 0;
    }

    res.json({
      success: true,
      message: "Solicitud editada correctamente",
      permisosConGoce: saldoFinal,
    });
  } catch (error) {
    console.error("❌ Error editando solicitud:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   ACCIÓN DESDE EMAIL (APROBAR / RECHAZAR)
   - Corrige flujo: no devuelve días en aprobar.
========================================================= */
exports.accionDesdeEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    const pool = await databaseService.getPool(req.user?.empresa);

    // Obtener solicitud
    const solicitudResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM [dbo].[solicitudes_vacaciones] WHERE id = @id");

    if (solicitudResult.recordset.length === 0) {
      return res.status(404).send("Solicitud no encontrada");
    }

    const solicitud = solicitudResult.recordset[0];

    // Token invalidado
    if (solicitud.token_invalido === 1) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8" /><title>Enlace inválido</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
          .error { color:#D32F2F; font-size:18px; font-weight:bold; }
        </style></head>
        <body><div class="container">
          <h1 class="error">❌ Enlace inválido</h1>
          <p>Este enlace ya no es válido porque la solicitud fue editada. Usa el enlace más reciente o ingresa al sistema.</p>
        </div></body></html>
      `);
    }

    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
        <title>Error - Token faltante</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
          .error { color:#D32F2F; font-size:18px; font-weight:bold; }
        </style></head>
        <body><div class="container">
          <h1 class="error">❌ Token faltante</h1><p>No se encontró token en el enlace.</p>
        </div></body></html>
      `);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).send(`
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
        <title>Token Expirado</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
          .warning { color:#F57C00; font-size:18px; font-weight:bold; }
        </style></head>
        <body><div class="container">
          <h1 class="warning">⚠️ Token expirado</h1>
          <p>El enlace ha caducado. Ingresa al sistema para gestionar la solicitud.</p>
        </div></body></html>
      `);
    }

    if (
      decoded.type !== "vacation_action" ||
      String(decoded.solicitudId) !== String(id)
    ) {
      return res.status(403).send(`
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
        <title>Acceso Denegado</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
          .error { color:#D32F2F; font-size:18px; font-weight:bold; }
        </style></head>
        <body><div class="container">
          <h1 class="error">🚫 Acceso denegado</h1>
          <p>El token no corresponde a esta solicitud.</p>
        </div></body></html>
      `);
    }

    const action = decoded.action; // 'APROBAR' o 'RECHAZAR'
    const adminNombre = decoded.adminNombre;

    if (solicitud.estado !== "PENDIENTE") {
      return res.status(400).send(`
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
        <title>Solicitud procesada</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
          .warning { color:#F57C00; font-size:18px; font-weight:bold; }
        </style></head>
        <body><div class="container">
          <h1 class="warning">⚠️ Solicitud ya procesada</h1>
          <p>La solicitud ya fue ${solicitud.estado.toLowerCase()} anteriormente.</p>
        </div></body></html>
      `);
    }

    if (action === "RECHAZAR") {
      return res.send(`
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
        <title>Rechazar Solicitud</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
          h1 { color:#D32F2F; }
          label { display:block; margin:20px 0 8px; font-weight:bold; }
          textarea { width:100%; padding:12px; border:1px solid #ddd; border-radius:6px; font-size:14px; }
          .btn { padding:14px 28px; background:#D32F2F; color:#fff; border:none; border-radius:6px; font-size:16px; cursor:pointer; margin-top:20px; }
          .btn:hover { background:#B71C1C; }
          .note { background:#FFF9C4; padding:12px; border-left:3px solid #FBC02D; margin:20px 0; }
        </style></head>
        <body><div class="container">
          <h1>✗ Rechazar Solicitud</h1>
          <div class="note"><strong>Importante:</strong> Proporciona un motivo. Será enviado al empleado.</div>
          <form method="POST" action="/api/vacaciones/solicitudes/${id}/rechazo-email">
            <input type="hidden" name="token" value="${token}" />
            <label for="comentario">Motivo del rechazo *</label>
            <textarea id="comentario" name="comentario" rows="5" required></textarea>
            <button type="submit" class="btn">Confirmar Rechazo</button>
          </form>
        </div></body></html>
      `);
    }

    if (action === "APROBAR") {
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("estado", sql.NVarChar, "APROBADA")
        .input("revisadoPor", sql.NVarChar, adminNombre).query(`
          UPDATE [dbo].[solicitudes_vacaciones]
          SET estado = @estado,
              revisado_por = @revisadoPor,
              fecha_respuesta = GETDATE()
          WHERE id = @id
        `);

      notifyVacacionesDiasActualizados(solicitud.numero_personal, req.user?.empresa);

      console.log(
        `✅ Solicitud ${id} aprobada por ${adminNombre} (no se descuentan días de nuevo)`
      );

      // Notificación al solicitante deshabilitada temporalmente (usuarios sin correo)
      // if (solicitud.email_solicitante) {
      //   const emailService = require("../services/emailService");
      //   try {
      //     await emailService.sendVacacionRespuestaEmail({
      //       email: solicitud.email_solicitante,
      //       nombreEmpleado: solicitud.nombre_empleado,
      //       tipoSolicitud: solicitud.tipo_solicitud,
      //       fechaInicio: solicitud.fecha_inicio,
      //       fechaFin: solicitud.fecha_fin,
      //       diasSolicitados: solicitud.dias_solicitados,
      //       estado: "APROBADA",
      //       comentarioAdmin: "",
      //     });
      //   } catch (e) {
      //     console.error("⚠️ Error enviando email de aprobación:", e.message);
      //   }
      // }

      try {
        const pushService = require("../services/pushService");
        const tipoLegibleResp = solicitud.tipo_solicitud === "0100" ? "permiso con goce" : "solicitud de vacaciones";
        await pushService.enviarATodasLasSuscripciones(pool, parseInt(solicitud.numero_personal, 10), {
          titulo: "Solicitud aprobada",
          cuerpo: `Tu ${tipoLegibleResp} fue aprobada`,
          url: "/vacaciones",
          tag: `vacacion-resultado-${id}`,
        });
      } catch (pushError) {
        console.error("⚠️ Error enviando push de aprobación de vacaciones:", pushError.message);
      }

      return res.send(`
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
        <title>Solicitud Aprobada</title>
        <style>
          body { font-family: Arial; background:#f4f4f4; padding:40px; }
          .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); text-align:center; }
          .success { color:#2E7D32; font-size:48px; }
        </style></head>
        <body><div class="container">
          <div class="success">✓</div>
          <h1>Solicitud Aprobada</h1>
          <p>La solicitud de <strong>${solicitud.nombre_empleado}</strong> fue aprobada.</p>
          <p>Se notificó al empleado.</p>
        </div></body></html>
      `);
    }

    return res.status(400).send("Acción inválida");
  } catch (error) {
    console.error("❌ Error en accionDesdeEmail:", error);
    return res.status(500).send(`
      <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
      <title>Error del Servidor</title>
      <style>
        body { font-family: Arial; background:#f4f4f4; padding:40px; }
        .container { max-width:600px; margin:0 auto; background:#fff; padding:40px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
        .error { color:#D32F2F; font-size:18px; font-weight:bold; }
      </style></head>
      <body><div class="container">
        <h1 class="error">❌ Error del Servidor</h1>
        <p>Ocurrió un error al procesar la acción.</p>
        <p style="color:#999;font-size:12px;">${error.message}</p>
      </div></body></html>
    `);
  }
};

/* =========================================================
   PROCESAR RECHAZO DESDE EMAIL (POST del formulario)
========================================================= */
exports.procesarRechazoDesdeEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const comentario =
      req.body && req.body.comentario ? req.body.comentario : "";
    const token = req.query.token || req.body.token;

    console.log("🔧 procesarRechazoDesdeEmail INIT", {
      id,
      body: req.body,
      query: req.query,
      comentarioLength: comentario.length,
      hasToken: !!token,
      contentType: req.headers["content-type"],
    });

    if (!comentario || comentario.trim() === "") {
      return res
        .status(400)
        .send(
          `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comentario requerido</title></head><body><h1>⚠️ Comentario requerido</h1><p>Debes proporcionar un motivo para rechazar.</p></body></html>`
        );
    }
    if (!token) {
      return res.status(400).send("Token faltante");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).send("Token expirado o inválido");
    }

    const adminNombre = decoded.adminNombre;
    const pool = await databaseService.getPool(req.user?.empresa);

    const solicitudResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        `SELECT * FROM [dbo].[solicitudes_vacaciones] WHERE id = @id AND estado = 'PENDIENTE'`
      );

    if (solicitudResult.recordset.length === 0) {
      return res.status(404).send("Solicitud no encontrada o ya procesada");
    }

    const solicitud = solicitudResult.recordset[0];

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("estado", sql.NVarChar, "RECHAZADA")
      .input("comentarioAdmin", sql.NVarChar, comentario)
      .input("revisadoPor", sql.NVarChar, adminNombre).query(`
        UPDATE [dbo].[solicitudes_vacaciones]
        SET estado = @estado,
            comentario_admin = @comentarioAdmin,
            revisado_por = @revisadoPor,
            fecha_respuesta = GETDATE()
        WHERE id = @id
      `);

    await devolverDiasDescontados(pool, solicitud);
    notifyVacacionesDiasActualizados(solicitud.numero_personal, req.user?.empresa);

    // Notificación al solicitante deshabilitada temporalmente (usuarios sin correo)
    // if (solicitud.email_solicitante) {
    //   const emailService = require("../services/emailService");
    //   try {
    //     await emailService.sendVacacionRespuestaEmail({
    //       email: solicitud.email_solicitante,
    //       nombreEmpleado: solicitud.nombre_empleado,
    //       tipoSolicitud: solicitud.tipo_solicitud,
    //       fechaInicio: solicitud.fecha_inicio,
    //       fechaFin: solicitud.fecha_fin,
    //       diasSolicitados: solicitud.dias_solicitados,
    //       estado: "RECHAZADA",
    //       comentarioAdmin: comentario,
    //     });
    //   } catch (emailErr) {
    //     console.error("⚠️ Error email rechazo:", emailErr.message);
    //   }
    // }

    try {
      const pushService = require("../services/pushService");
      const tipoLegibleResp = solicitud.tipo_solicitud === "0100" ? "permiso con goce" : "solicitud de vacaciones";
      await pushService.enviarATodasLasSuscripciones(pool, parseInt(solicitud.numero_personal, 10), {
        titulo: "Solicitud rechazada",
        cuerpo: `Tu ${tipoLegibleResp} fue rechazada: ${comentario}`,
        url: "/vacaciones",
        tag: `vacacion-resultado-${id}`,
      });
    } catch (pushError) {
      console.error("⚠️ Error enviando push de rechazo de vacaciones:", pushError.message);
    }

    return res.send(
      `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Rechazo OK</title></head><body><h1>Solicitud Rechazada</h1><p>Motivo registrado y días devueltos.</p></body></html>`
    );
  } catch (error) {
    console.error("❌ Error procesando rechazo:", error);
    return res.status(500).send("Error del servidor: " + error.message);
  }
};

/* =========================================================
   CANCELAR APROBACIÓN (Admin) - Devuelve días si estaba aprobada
========================================================= */
exports.cancelarAprobacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, motivo, esAdmin } = req.body;

    if (!esAdmin) {
      return res.status(403).json({
        success: false,
        message: "Solo un administrador puede cancelar la aprobación.",
      });
    }
    if (!motivo || motivo.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Debes proporcionar un motivo para cancelar la aprobación.",
      });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const solicitudResult = await pool.request().input("id", sql.Int, id)
      .query(`
        SELECT * FROM [dbo].[solicitudes_vacaciones]
        WHERE id = @id
      `);

    if (solicitudResult.recordset.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Solicitud no encontrada" });
    }

    const solicitud = solicitudResult.recordset[0];

    if (solicitud.estado !== "APROBADA") {
      return res.status(400).json({
        success: false,
        message: "Solo se pueden cancelar solicitudes aprobadas",
      });
    }

    // Devolver días descontados
    await devolverDiasDescontados(pool, solicitud);

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("estado", sql.NVarChar, "CANCELADA")
      .input(
        "comentarioAdmin",
        sql.NVarChar,
        `Cancelada por admin${usuario ? ": " + usuario : ""}. Motivo: ${motivo}`
      ).query(`
        UPDATE [dbo].[solicitudes_vacaciones]
        SET estado = @estado,
            comentario_admin = @comentarioAdmin,
            fecha_respuesta = GETDATE()
        WHERE id = @id
      `);

    notifyVacacionesDiasActualizados(solicitud.numero_personal, req.user?.empresa);

    await logAudit(pool, {
      userId:    req.user?.id || null,
      userName:  req.user?.nombre || usuario || null,
      modulo:    'vacaciones',
      accion:    'cancelar-aprobacion',
      entidadId: id,
      detalle:   { solicitudId: id, motivo, empleado: solicitud.nombre_empleado },
      ip:        req.ip
    });

    return res.json({
      success: true,
      message: "Aprobación cancelada, días devueltos y motivo registrado.",
    });
  } catch (error) {
    console.error("❌ Error cancelando aprobación:", error);
    res.status(500).json({
      success: false,
      message: `Error en el servidor: ${error.message}`,
    });
  }
};

/* =========================================================
   RESUMEN DE DÍAS RESTANTES POR AGENTE (dashboard admin)
========================================================= */
exports.getResumenAgentes = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const anioActual = new Date().getFullYear();

    // ASISTENCIA_EXENTOS se crea de forma lazy en el módulo de Asistencia; si aún no
    // existe (primer arranque) se omite el filtro en vez de fallar la query completa.
    const tablaExentosExiste = await pool.request().query(`
      SELECT CASE WHEN EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_EXENTOS' AND xtype='U') THEN 1 ELSE 0 END AS existe
    `);
    const filtroExentos = tablaExentosExiste.recordset[0].existe === 1
      ? 'AND NOT EXISTS (SELECT 1 FROM ASISTENCIA_EXENTOS ex WHERE ex.NEUS_ID = u.NEUS_ID)'
      : '';

    await ensurePoolOverrideTable(pool);

    const result = await pool.request()
      .input('anio', sql.Int, anioActual)
      .query(`
        SELECT
          u.NEUS_ID                                          AS id,
          u.NEUS_NOMBRES                                     AS nombre,
          u.NEUS_TIPOUSUARIO                                 AS tipo,
          u.NEUS_ACTIVO                                      AS activo,
          u.NEUS_FECHA_INGRESO                               AS fechaIngreso,
          u.NEUS_FECHA_REGISTRO                              AS fechaRegistro,
          ISNULL(sv.diasUsados, 0)                           AS diasUsados,
          CASE
            WHEN po.MODO = 'QUITAR' THEN 0
            WHEN po.MODO = 'ASIGNAR' THEN 1
            WHEN u.NEUS_TIPOUSUARIO = 'AD' THEN 1
            WHEN u.NEUS_FECHA_INGRESO IS NOT NULL
              AND DATEDIFF(DAY, u.NEUS_FECHA_INGRESO, GETDATE()) >= 365 THEN 1
            WHEN u.NEUS_FECHA_INGRESO IS NULL
              AND u.NEUS_FECHA_REGISTRO IS NOT NULL
              AND DATEDIFF(DAY, u.NEUS_FECHA_REGISTRO, GETDATE()) >= 365 THEN 1
            ELSE 0
          END                                                AS tienePool
        FROM [NEUS_USUARIOS] u
        LEFT JOIN (
          SELECT
            numero_personal,
            ISNULL(SUM(dias_solicitados), 0) AS diasUsados
          FROM [dbo].[solicitudes_vacaciones]
          WHERE estado IN ('PENDIENTE', 'APROBADA')
            AND YEAR(fecha_inicio) = @anio
          GROUP BY numero_personal
        ) sv ON sv.numero_personal = u.NEUS_ID
        LEFT JOIN VACACIONES_POOL_OVERRIDE po ON po.NEUS_ID = u.NEUS_ID
        WHERE u.NEUS_ACTIVO = 1
          ${filtroExentos}
        ORDER BY u.NEUS_NOMBRES
      `);

    const POOL_TOTAL = 12;
    const agentes = result.recordset.map(r => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      tienePool: r.tienePool === 1,
      diasUsados: r.tienePool === 1 ? (r.diasUsados || 0) : 0,
      diasRestantes: r.tienePool === 1 ? Math.max(0, POOL_TOTAL - (r.diasUsados || 0)) : 0,
      poolTotal: r.tienePool === 1 ? POOL_TOTAL : 0,
    }));

    return res.json({ success: true, data: agentes, anio: anioActual });
  } catch (err) {
    console.error('❌ Error getResumenAgentes:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   EDITAR SOLO LA FECHA de una solicitud (admin) — a diferencia de
   editarSolicitud (que recalcula saldos completos y solo aplica a
   PENDIENTE, pensado para que el propio empleado corrija su solicitud
   antes de revisión), este endpoint es un ajuste administrativo simple:
   mueve fecha_inicio/fecha_fin de solicitudes PENDIENTE o APROBADA sin
   tocar el conteo de días (mismo número de días, solo cambia cuándo).
   Reglas de validez:
   - La nueva fecha no puede ser pasada (debe ser hoy o futura).
   - Si la fecha ORIGINAL de la solicitud ya es hoy (o pasada), se
     bloquea la edición por completo — no tiene sentido reprogramar
     algo que ya está ocurriendo o ya pasó.
========================================================= */
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

exports.editarFechaSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { fechaInicio, fechaFin } = req.body;

    if (!fechaInicio) {
      return res.status(400).json({ success: false, message: 'fechaInicio es requerida' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const solicitudResult = await pool.request().input('id', sql.Int, id)
      .query('SELECT * FROM [dbo].[solicitudes_vacaciones] WHERE id = @id');

    if (solicitudResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    }
    const solicitud = solicitudResult.recordset[0];

    if (!['PENDIENTE', 'APROBADA'].includes(solicitud.estado)) {
      return res.status(400).json({ success: false, message: 'Solo se puede modificar la fecha de solicitudes pendientes o aprobadas' });
    }

    const hoy = hoyISO();
    const fechaOriginal = new Date(solicitud.fecha_inicio).toISOString().slice(0, 10);
    if (fechaOriginal <= hoy) {
      return res.status(400).json({
        success: false,
        message: 'No se puede modificar esta solicitud porque su fecha ya es hoy o ya pasó.',
      });
    }

    const nuevaFechaInicio = String(fechaInicio).slice(0, 10);
    const nuevaFechaFin = String(fechaFin || fechaInicio).slice(0, 10);
    if (nuevaFechaInicio < hoy) {
      return res.status(400).json({
        success: false,
        message: 'No se puede elegir una fecha pasada.',
      });
    }
    if (nuevaFechaInicio === hoy) {
      return res.status(400).json({
        success: false,
        message: 'No se puede elegir el día de hoy como nueva fecha.',
      });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('fechaInicio', sql.Date, nuevaFechaInicio)
      .input('fechaFin', sql.Date, nuevaFechaFin)
      .query(`
        UPDATE [dbo].[solicitudes_vacaciones]
        SET fecha_inicio = @fechaInicio, fecha_fin = @fechaFin
        WHERE id = @id
      `);

    // Si estaba APROBADA, mover también sus excepciones de Asistencia (borrar
    // las viejas ligadas a esta solicitud, crear las nuevas en el rango actualizado)
    // para que Asistencia/Nómina reflejen el cambio de fecha correctamente.
    if (solicitud.estado === 'APROBADA' && solicitud.tipo_solicitud === '0200') {
      try {
        await pool.request().input('sid', sql.Int, id)
          .query(`
            IF EXISTS (SELECT 1 FROM sysobjects WHERE name='ASISTENCIA_EXCEPCIONES' AND xtype='U')
              DELETE FROM ASISTENCIA_EXCEPCIONES WHERE SOLICITUD_ID = @sid
          `);
        const aprobadoPorId = req.user?.id || req.user?.userId || 0;
        await crearExcepcionesAsistenciaDesdeSolicitud(
          pool,
          { ...solicitud, fecha_inicio: nuevaFechaInicio, fecha_fin: nuevaFechaFin },
          aprobadoPorId,
          req.user?.empresa,
        );
      } catch (e) {
        console.error('⚠️ No se pudieron reubicar las excepciones de Asistencia:', e.message);
      }
    }

    notifyVacacionesDiasActualizados(solicitud.numero_personal, req.user?.empresa);

    return res.json({ success: true, message: 'Fecha actualizada correctamente' });
  } catch (err) {
    console.error('❌ Error editarFechaSolicitud:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
