const sql = require('mssql');
const databaseService = require('../services/databaseService');
const pausaTiposService = require('../services/pausaTiposService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');
const logger = global.logger || require('../utils/logger');

const USOS_KEYS = Object.keys(pausaTiposService.USOS);

function notify(req) {
  try {
    socketService.getIO(req.user?.empresa)?.emit('pausa-tipos:updated', {});
  } catch (_) { /* sin sockets, no bloquea */ }
}

function audit(pool, req, accion, detalle) {
  return logAudit(pool, {
    userId: req.user?.id, userName: req.user?.usuario, modulo: 'configuracion',
    accion, detalle: JSON.stringify(detalle), ip: req.ip,
  }).catch(() => {});
}

// Normaliza y valida el body. `parcial` = edición (solo lo que venga).
function leerBody(body, parcial) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  const errores = [];

  if (b.etiqueta !== undefined || !parcial) {
    const etiqueta = String(b.etiqueta ?? '').trim();
    if (!etiqueta || etiqueta.length > 60) errores.push('El nombre es obligatorio (máximo 60 caracteres)');
    out.etiqueta = etiqueta;
  }
  if (b.emoji !== undefined) out.emoji = String(b.emoji || '').trim().slice(0, 16) || null;
  if (b.color !== undefined) {
    if (b.color && !/^#[0-9a-fA-F]{6}$/.test(b.color)) errores.push('Color inválido');
    out.color = b.color || null;
  }
  if (b.limiteMin !== undefined) {
    const n = b.limiteMin === null || b.limiteMin === '' ? null : Number(b.limiteMin);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1440)) errores.push('El límite debe ser de 1 a 1440 minutos');
    out.limiteMin = n;
    out.limiteModo = n === null ? null : (b.limiteModo === 'diario' ? 'diario' : 'visita');
  }
  if (b.activo !== undefined) out.activo = !!b.activo;
  if (b.orden !== undefined) out.orden = Number.isInteger(Number(b.orden)) ? Number(b.orden) : 0;
  if (b.usos !== undefined) {
    out.usos = {};
    for (const k of USOS_KEYS) out.usos[k] = !!b.usos?.[k];
  }
  if (b.limitesArea !== undefined) {
    out.limitesArea = [];
    for (const [area, min] of Object.entries(b.limitesArea || {})) {
      const a = String(area).trim().toUpperCase();
      const n = Number(min);
      if (!/^[A-Z]{2,20}$/.test(a) || !Number.isInteger(n) || n < 1 || n > 1440) {
        errores.push(`Límite por área inválido (${area})`);
        continue;
      }
      out.limitesArea.push({ area: a, limiteMin: n });
    }
  }
  if (b.limitesModulo !== undefined) {
    out.limitesModulo = [];
    for (const [modulo, min] of Object.entries(b.limitesModulo || {})) {
      if (min === null || min === '' || min === undefined) continue; // sin límite propio → usa el general
      const n = Number(min);
      if (!pausaTiposService.LIMITE_MODULOS.includes(modulo) || !Number.isInteger(n) || n < 1 || n > 1440) {
        errores.push(`Límite por módulo inválido (${modulo})`);
        continue;
      }
      out.limitesModulo.push({ modulo, limiteMin: n });
    }
  }
  return { datos: out, errores };
}

async function guardarLimitesModulo(tx, statusId, limites) {
  await new sql.Request(tx).input('id', sql.Int, statusId)
    .query('DELETE FROM dbo.STATUS_LIMITE_MODULO WHERE STATUS_ID = @id');
  for (const l of limites) {
    await new sql.Request(tx)
      .input('id', sql.Int, statusId)
      .input('mod', sql.VarChar(20), l.modulo)
      .input('min', sql.Int, l.limiteMin)
      .query('INSERT INTO dbo.STATUS_LIMITE_MODULO (STATUS_ID, MODULO, LIMITE_MIN) VALUES (@id, @mod, @min)');
  }
}

async function guardarLimitesArea(tx, statusId, limites) {
  await new sql.Request(tx).input('id', sql.Int, statusId)
    .query('DELETE FROM dbo.STATUS_LIMITE_AREA WHERE STATUS_ID = @id');
  for (const l of limites) {
    await new sql.Request(tx)
      .input('id', sql.Int, statusId)
      .input('area', sql.VarChar(20), l.area)
      .input('min', sql.Int, l.limiteMin)
      .query('INSERT INTO dbo.STATUS_LIMITE_AREA (STATUS_ID, AREA, LIMITE_MIN) VALUES (@id, @area, @min)');
  }
}

// GET /api/pausa-tipos — todos los tipos de pausa (activos e inactivos).
exports.list = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    res.json({ success: true, data: await pausaTiposService.listar(pool) });
  } catch (e) {
    logger.error('pausaTiposController.list', e);
    res.status(500).json({ success: false, message: 'Error al obtener los tipos de pausa' });
  }
};

// POST /api/pausa-tipos — crea un tipo de pausa.
exports.create = async (req, res) => {
  const { datos, errores } = leerBody(req.body, false);
  if (errores.length) return res.status(400).json({ success: false, message: errores.join('. ') });
  const usos = datos.usos ?? Object.fromEntries(USOS_KEYS.map((k) => [k, true]));
  if (!USOS_KEYS.some((k) => usos[k])) return res.status(400).json({ success: false, message: 'Elige al menos un módulo donde se use' });

  let tx;
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    tx = new sql.Transaction(pool);
    await tx.begin();
    // status_id cambia entre empresas: TINYINT sin IDENTITY (BD creada por
    // schemaService) o TINYINT/INT con IDENTITY (BD legado).
    const meta = await pausaTiposService.metaStatusId({ request: () => new sql.Request(tx) });
    const next = (await new sql.Request(tx).query(`
      SELECT ISNULL(MAX(status_id), 0) + 1 AS id, ISNULL(MAX(ORDEN), 0) + 1 AS orden,
             IDENT_CURRENT('dbo.STATUS') + IDENT_INCR('dbo.STATUS') AS siguienteIdentity
      FROM dbo.STATUS WITH (UPDLOCK, HOLDLOCK)`)).recordset[0];
    const idPrevisto = meta.identity ? Number(next.siguienteIdentity) : next.id;
    if (idPrevisto > meta.max) {
      await tx.rollback();
      return res.status(409).json({ success: false, message: 'Se alcanzó el máximo de estados posibles' });
    }
    const slug = datos.etiqueta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const claveDe = (id) => `p${id}_${slug}`.slice(0, 20);

    const ins = await new sql.Request(tx)
      .input('id', sql.Int, next.id)
      .input('clave', sql.VarChar(20), claveDe(idPrevisto))
      .input('desc', sql.VarChar(100), datos.etiqueta.slice(0, 100))
      .input('etiqueta', sql.NVarChar(60), datos.etiqueta)
      .input('emoji', sql.NVarChar(16), datos.emoji ?? null)
      .input('color', sql.VarChar(9), datos.color ?? null)
      .input('orden', sql.Int, datos.orden ?? next.orden)
      .input('activo', sql.Bit, datos.activo ?? true)
      .input('limite', sql.Int, datos.limiteMin ?? null)
      .input('modo', sql.VarChar(10), datos.limiteModo ?? null)
      .input('ua', sql.Bit, usos.asistencia)
      .input('un', sql.Bit, usos.nomina)
      .input('ucc', sql.Bit, usos.contact_center)
      .query(`
        INSERT INTO dbo.STATUS (${meta.identity ? '' : 'status_id, '}clave, descripcion, ETIQUETA, EMOJI, COLOR, ORDEN, ES_PAUSA, ACTIVO, ES_SISTEMA,
          CONTROL_OCUPACION, LIMITE_MIN, LIMITE_MODO, USO_ASISTENCIA, USO_NOMINA, USO_CONTACT_CENTER)
        OUTPUT INSERTED.status_id AS id
        VALUES (${meta.identity ? '' : '@id, '}@clave, @desc, @etiqueta, @emoji, @color, @orden, 1, @activo, 0,
          0, @limite, @modo, @ua, @un, @ucc)
      `);
    const id = ins.recordset[0].id;
    // Con IDENTITY el id real puede no ser el previsto (huecos): la clave lo refleja.
    if (id !== idPrevisto) {
      await new sql.Request(tx).input('id', sql.Int, id).input('clave', sql.VarChar(20), claveDe(id))
        .query('UPDATE dbo.STATUS SET clave = @clave WHERE status_id = @id');
    }
    await guardarLimitesArea(tx, id, datos.limitesArea ?? []);
    await guardarLimitesModulo(tx, id, datos.limitesModulo ?? []);
    await tx.commit();

    await audit(pool, req, 'pausa-tipo-crear', { id, ...datos, usos });
    notify(req);
    const tipo = (await pausaTiposService.listar(pool)).find((t) => t.statusId === id);
    res.status(201).json({ success: true, data: tipo });
  } catch (e) {
    if (tx) await tx.rollback().catch(() => {});
    logger.error('pausaTiposController.create', e);
    res.status(500).json({ success: false, message: 'Error al crear el tipo de pausa' });
  }
};

// PUT /api/pausa-tipos/:id — edita un tipo (los de sistema también, salvo
// eliminarlos o desactivar el baño, que depende del semáforo de ocupación).
exports.update = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Id inválido' });
  const { datos, errores } = leerBody(req.body, true);
  if (errores.length) return res.status(400).json({ success: false, message: errores.join('. ') });
  if (datos.usos && !USOS_KEYS.some((k) => datos.usos[k])) {
    return res.status(400).json({ success: false, message: 'Elige al menos un módulo donde se use' });
  }

  let tx;
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const actual = (await pausaTiposService.listar(pool)).find((t) => t.statusId === id);
    if (!actual) return res.status(404).json({ success: false, message: 'Tipo de pausa no encontrado' });
    if (actual.controlOcupacion && datos.activo === false) {
      return res.status(409).json({ success: false, message: 'El baño no se puede desactivar: lo usa el botón de ocupación.' });
    }

    const sets = [];
    const r = () => new sql.Request(tx);
    tx = new sql.Transaction(pool);
    await tx.begin();
    const upd = r().input('id', sql.Int, id);
    if (datos.etiqueta !== undefined) { sets.push('ETIQUETA = @etiqueta'); upd.input('etiqueta', sql.NVarChar(60), datos.etiqueta); }
    if (datos.emoji !== undefined) { sets.push('EMOJI = @emoji'); upd.input('emoji', sql.NVarChar(16), datos.emoji); }
    if (datos.color !== undefined) { sets.push('COLOR = @color'); upd.input('color', sql.VarChar(9), datos.color); }
    if (datos.orden !== undefined) { sets.push('ORDEN = @orden'); upd.input('orden', sql.Int, datos.orden); }
    if (datos.activo !== undefined) { sets.push('ACTIVO = @activo'); upd.input('activo', sql.Bit, datos.activo); }
    if (datos.limiteMin !== undefined) {
      sets.push('LIMITE_MIN = @limite', 'LIMITE_MODO = @modo');
      upd.input('limite', sql.Int, datos.limiteMin).input('modo', sql.VarChar(10), datos.limiteModo);
    }
    if (datos.usos) {
      sets.push('USO_ASISTENCIA = @ua', 'USO_NOMINA = @un', 'USO_CONTACT_CENTER = @ucc');
      upd.input('ua', sql.Bit, datos.usos.asistencia).input('un', sql.Bit, datos.usos.nomina).input('ucc', sql.Bit, datos.usos.contact_center);
    }
    if (sets.length) await upd.query(`UPDATE dbo.STATUS SET ${sets.join(', ')} WHERE status_id = @id AND ES_PAUSA = 1`);
    if (datos.limitesArea) await guardarLimitesArea(tx, id, datos.limitesArea);
    if (datos.limitesModulo) await guardarLimitesModulo(tx, id, datos.limitesModulo);
    await tx.commit();

    await audit(pool, req, 'pausa-tipo-editar', { id, antes: actual, cambios: datos });
    notify(req);
    const tipo = (await pausaTiposService.listar(pool)).find((t) => t.statusId === id);
    res.json({ success: true, data: tipo });
  } catch (e) {
    if (tx) await tx.rollback().catch(() => {});
    logger.error('pausaTiposController.update', e);
    res.status(500).json({ success: false, message: 'Error al guardar el tipo de pausa' });
  }
};

// DELETE /api/pausa-tipos/:id — solo tipos creados por la empresa y sin
// registros; si ya se usó, se desactiva en vez de borrarse (conserva historial).
exports.remove = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Id inválido' });
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const actual = (await pausaTiposService.listar(pool)).find((t) => t.statusId === id);
    if (!actual) return res.status(404).json({ success: false, message: 'Tipo de pausa no encontrado' });
    if (actual.esSistema) return res.status(409).json({ success: false, message: 'Los tipos por default no se pueden eliminar; puedes editarlos o desactivarlos.' });

    const usoRs = await pool.request().input('id', sql.Int, id)
      .query('SELECT COUNT(*) AS total FROM dbo.USUARIO_TIEMPOS WHERE status_id = @id');
    const total = usoRs.recordset[0].total;
    if (total > 0) {
      return res.status(409).json({
        success: false,
        message: `Este tipo ya tiene ${total} registro(s) de pausa; desactívalo en lugar de eliminarlo para conservar el historial.`,
      });
    }
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM dbo.STATUS WHERE status_id = @id AND ES_PAUSA = 1 AND ES_SISTEMA = 0');

    await audit(pool, req, 'pausa-tipo-eliminar', { id, etiqueta: actual.etiqueta });
    notify(req);
    res.json({ success: true });
  } catch (e) {
    logger.error('pausaTiposController.remove', e);
    res.status(500).json({ success: false, message: 'Error al eliminar el tipo de pausa' });
  }
};
