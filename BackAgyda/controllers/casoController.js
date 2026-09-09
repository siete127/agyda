const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { sanitizeFilename, encryptBuffer, decryptBuffer } = require('../utils/cryptoDocs');

// ─────────────────────────────────────────────────────────────────────────────
// "Caso" unificado (Fase 3 del rediseño de Atención al Cliente) — CRUD completo
// que reemplaza gradualmente a Consulta/Aclaración/Queja/Incidencia. Molde
// directo de clienteIncidenciasController.js.
//
// DEUDA TÉCNICA INTENCIONAL (decisión del usuario, no corregir aquí):
// cuando CASO_TIPO === 'queja', el control de acceso NO usa requireActionAccess
// sino los códigos de empleado hardcodeados de quejaController.js (ADM_0002,
// ADM_0004, ADM_0001). Ver verificarPermisoQueja() más abajo. Esto preserva
// exactamente quién puede ver/gestionar quejas hoy. Para los otros 3 tipos el
// middleware requireActionAccess('atencion-cliente','casos-*') de la ruta ya
// aplica y aquí no se re-chequea nada.
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_VALIDOS = ['consulta', 'aclaracion', 'queja', 'incidencia'];
const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta', 'critica'];
const ESTATUS_VALIDOS = ['pendiente', 'en_proceso', 'en_espera_cliente', 'resuelto', 'escalado', 'cerrado'];
const ESTATUS_QUE_CIERRAN = ['resuelto', 'cerrado'];
const ORIGENES_VALIDOS = ['manual', 'encuesta', 'pago_vencido', 'portal'];
const SLA_HORAS_POR_PRIORIDAD = { baja: 72, media: 48, alta: 24, critica: 8 };
const ESTADOS_AC_VALIDOS = ['pendiente', 'aplicada', 'verificada'];

// Réplica literal de quejaController.js — control de acceso por código de empleado.
const QUEJA_CODIGOS_SUPERVISORES = ['ADM_0002', 'ADM_0004'];
const QUEJA_CODIGOS_LECTORES_AC = ['ADM_0001', 'ADM_0002'];

const CASO_SELECT_FIELDS = `
  K.CASO_ID as id, K.CASO_FOLIO as folio, K.CASO_TIPO as tipo,
  K.CASO_CONTACTO_ID as contactoId, C.CONT_NOMBRE as contactoNombre,
  K.CASO_CLIENTE_NOMBRE_LIBRE as clienteNombreLibre,
  K.CASO_TITULO as titulo, K.CASO_DESCRIPCION as descripcion, K.CASO_CATEGORIA as categoria,
  K.CASO_REFERENCIA as referencia, K.CASO_PRIORIDAD as prioridad,
  K.CASO_SLA_HORAS as slaHoras, K.CASO_FECHA_LIMITE_SLA as fechaLimiteSla,
  K.CASO_ESTATUS as estatus, K.CASO_ORIGEN as origen,
  K.CASO_ASIGNADO_A as asignadoA, U.NEUS_NOMBRES as asignadoNombre,
  K.CASO_SOLUCION_PROPUESTA as solucionPropuesta, K.CASO_FECHA_COMPROMISO as fechaCompromiso,
  K.CASO_CREADO_POR as creadoPor, K.CASO_FECHA_CREACION as fechaCreacion,
  K.CASO_FECHA_RESOLUCION as fechaResolucion
`;

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

async function getCodigoUsuario(pool, userId) {
  try {
    const rs = await pool.request()
      .input('uid', sql.Int, userId)
      .query('SELECT TOP 1 NEUS_USUARIO FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
    return rs.recordset[0]?.NEUS_USUARIO ?? null;
  } catch { return null; }
}

// Permisos especiales para CASO_TIPO === 'queja' (deuda técnica replicada).
// `accion`: 'gestionar-estatus' | 'eliminar' | 'accion-correctiva' | 'leer-ac'.
// Devuelve null si autorizado, o un string con el mensaje de rechazo.
async function verificarPermisoQueja(req, pool, accion) {
  let codigo = req.user?.codigo || null;
  if (!codigo && req.user?.id) codigo = await getCodigoUsuario(pool, req.user.id);
  if (accion === 'eliminar') {
    return codigo === 'ADM_0002' ? null : 'Solo ADM_0002 puede eliminar quejas';
  }
  if (accion === 'leer-ac') {
    return QUEJA_CODIGOS_LECTORES_AC.includes(codigo) ? null : 'No autorizado para ver acciones correctivas';
  }
  // 'gestionar-estatus' y 'accion-correctiva' → supervisores
  return QUEJA_CODIGOS_SUPERVISORES.includes(codigo)
    ? null
    : 'Solo los supervisores pueden gestionar quejas';
}

function generarFolioEnTransaccion(transaction) {
  const anio = new Date().getFullYear();
  return new sql.Request(transaction)
    .input('prefijo', sql.NVarChar, `CASO-${anio}-`)
    .query(`
      SELECT MAX(CAST(SUBSTRING(CASO_FOLIO, LEN(@prefijo) + 1, 10) AS INT)) as maxConsecutivo
      FROM CASOS WITH (UPDLOCK, HOLDLOCK)
      WHERE CASO_FOLIO LIKE @prefijo + '%'
    `)
    .then((rs) => {
      const siguiente = (rs.recordset[0].maxConsecutivo || 0) + 1;
      return `CASO-${anio}-${String(siguiente).padStart(4, '0')}`;
    });
}

// ── Lecturas ────────────────────────────────────────────────────────────────

exports.list = async (req, res) => {
  try {
    const { tipo, estatus, prioridad, contactoId } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const cond = ['K.CASO_ACTIVO = 1'];
    const request = pool.request();
    if (tipo) { cond.push('K.CASO_TIPO = @tipo'); request.input('tipo', sql.NVarChar, tipo); }
    if (estatus) { cond.push('K.CASO_ESTATUS = @estatus'); request.input('estatus', sql.NVarChar, estatus); }
    if (prioridad) { cond.push('K.CASO_PRIORIDAD = @prioridad'); request.input('prioridad', sql.NVarChar, prioridad); }
    if (contactoId) { cond.push('K.CASO_CONTACTO_ID = @contactoId'); request.input('contactoId', sql.Int, contactoId); }

    const rs = await request.query(`
      SELECT ${CASO_SELECT_FIELDS}
      FROM CASOS K
      LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CASO_CONTACTO_ID
      LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CASO_ASIGNADO_A
      WHERE ${cond.join(' AND ')}
      ORDER BY K.CASO_FECHA_CREACION DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error list casos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listByContacto = async (req, res) => {
  try {
    const contactoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(contactoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`
        SELECT ${CASO_SELECT_FIELDS}
        FROM CASOS K
        LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CASO_CONTACTO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CASO_ASIGNADO_A
        WHERE K.CASO_CONTACTO_ID = @id AND K.CASO_ACTIVO = 1
        ORDER BY K.CASO_FECHA_CREACION DESC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listByContacto casos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${CASO_SELECT_FIELDS}
        FROM CASOS K
        LEFT JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CASO_CONTACTO_ID
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = K.CASO_ASIGNADO_A
        WHERE K.CASO_ID = @id AND K.CASO_ACTIVO = 1
      `);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Caso no encontrado' });
    res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error getById caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Crear ───────────────────────────────────────────────────────────────────

exports.create = async (req, res) => {
  const pool = await databaseService.getPool(req.user?.empresa);
  const transaction = new sql.Transaction(pool);
  try {
    const {
      tipo, contactoId, clienteNombreLibre, titulo, descripcion, categoria, referencia,
      prioridad, asignadoA, origen, solucionPropuesta, fechaCompromiso,
    } = req.body || {};

    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ success: false, message: 'tipo inválido (consulta|aclaracion|queja|incidencia)' });
    if (!titulo || !String(titulo).trim()) return res.status(400).json({ success: false, message: 'Título requerido' });

    // Contacto: obligatorio solo para incidencia (como hoy); opcional para el resto.
    const contId = contactoId ? parseInt(contactoId, 10) : null;
    if (tipo === 'incidencia' && !Number.isFinite(contId)) {
      return res.status(400).json({ success: false, message: 'contactoId requerido para una incidencia' });
    }
    // Si no hay contacto ligado, exigir el nombre libre (excepto queja, que hoy no lleva cliente).
    const nombreLibre = clienteNombreLibre ? String(clienteNombreLibre).trim() : null;
    if (!contId && !nombreLibre && tipo !== 'queja') {
      return res.status(400).json({ success: false, message: 'Indica el contacto o el nombre del cliente' });
    }

    const prio = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : 'media';
    const org = ORIGENES_VALIDOS.includes(origen) ? origen : 'manual';
    // SLA solo para incidencia (las 3 entidades ligeras no tenían SLA).
    const slaHoras = tipo === 'incidencia' ? SLA_HORAS_POR_PRIORIDAD[prio] : null;
    const asignado = asignadoA ? parseInt(asignadoA, 10) : null;

    await transaction.begin();
    const folio = await generarFolioEnTransaccion(transaction);

    const rs = await new sql.Request(transaction)
      .input('folio', sql.NVarChar(20), folio)
      .input('tipo', sql.NVarChar(20), tipo)
      .input('contactoId', sql.Int, contId)
      .input('clienteNombreLibre', sql.NVarChar(200), nombreLibre)
      .input('titulo', sql.NVarChar(200), String(titulo).trim())
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('categoria', sql.NVarChar(50), categoria || null)
      .input('referencia', sql.NVarChar(100), referencia || null)
      .input('prioridad', sql.NVarChar(20), prio)
      .input('slaHoras', sql.Int, slaHoras)
      .input('origen', sql.NVarChar(20), org)
      .input('asignadoA', sql.Int, asignado)
      .input('solucionPropuesta', sql.NVarChar(sql.MAX), solucionPropuesta || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .input('creadoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CASOS
          (CASO_FOLIO, CASO_TIPO, CASO_CONTACTO_ID, CASO_CLIENTE_NOMBRE_LIBRE, CASO_TITULO, CASO_DESCRIPCION,
           CASO_CATEGORIA, CASO_REFERENCIA, CASO_PRIORIDAD, CASO_SLA_HORAS, CASO_FECHA_LIMITE_SLA,
           CASO_ORIGEN, CASO_ASIGNADO_A, CASO_SOLUCION_PROPUESTA, CASO_FECHA_COMPROMISO, CASO_CREADO_POR)
        OUTPUT INSERTED.CASO_ID
        VALUES (@folio, @tipo, @contactoId, @clienteNombreLibre, @titulo, @descripcion,
                @categoria, @referencia, @prioridad, @slaHoras,
                CASE WHEN @slaHoras IS NULL THEN NULL ELSE DATEADD(HOUR, @slaHoras, GETDATE()) END,
                @origen, @asignadoA, @solucionPropuesta, @fechaCompromiso, @creadoPor)
      `);
    await transaction.commit();

    const id = rs.recordset[0].CASO_ID;

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-caso', entidadId: id,
      detalle: { folio, tipo, contactoId: contId, prioridad: prio, origen: org }, ip: req.ip,
    });

    if (asignado) {
      await notificationService.createNotification({
        usuarioId: asignado,
        mensaje: `Nuevo caso asignado: ${folio} — ${String(titulo).trim()}`,
        tipo: 'caso-asignado',
        dataExtra: { casoId: id, contactoId: contId, folio, tipo },
        tenantKey: req.user?.empresa,
      });
    }

    res.status(201).json({ success: true, data: { id, folio } });
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    console.error('Error create caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Estatus / solución ──────────────────────────────────────────────────────

exports.updateEstatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { estatus } = req.body || {};
    if (!ESTATUS_VALIDOS.includes(estatus)) return res.status(400).json({ success: false, message: 'Estatus inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);

    // Deuda técnica: si es queja, control por código de empleado.
    const caso = (await pool.request().input('id', sql.Int, id)
      .query(`SELECT CASO_TIPO as tipo FROM CASOS WHERE CASO_ID=@id AND CASO_ACTIVO=1`)).recordset[0];
    if (!caso) return res.status(404).json({ success: false, message: 'Caso no encontrado' });
    if (caso.tipo === 'queja') {
      const err = await verificarPermisoQueja(req, pool, 'gestionar-estatus');
      if (err) return res.status(403).json({ success: false, message: err });
    }

    const esCierre = ESTATUS_QUE_CIERRAN.includes(estatus);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('estatus', sql.NVarChar(20), estatus)
      .input('fechaResolucion', sql.DateTime, esCierre ? new Date() : null)
      .query(`
        UPDATE CASOS SET CASO_ESTATUS=@estatus, CASO_FECHA_RESOLUCION=@fechaResolucion
        WHERE CASO_ID=@id AND CASO_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    if (!(result.recordset?.[0]?.affected || 0)) return res.status(404).json({ success: false, message: 'Caso no encontrado' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'actualizar-estatus-caso', entidadId: id,
      detalle: { estatus, tipo: caso.tipo }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error updateEstatus caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateSolucion = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { solucionPropuesta, fechaCompromiso } = req.body || {};

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('solucionPropuesta', sql.NVarChar(sql.MAX), solucionPropuesta || null)
      .input('fechaCompromiso', sql.Date, fechaCompromiso || null)
      .query(`
        UPDATE CASOS SET CASO_SOLUCION_PROPUESTA=@solucionPropuesta, CASO_FECHA_COMPROMISO=@fechaCompromiso
        WHERE CASO_ID=@id AND CASO_ACTIVO=1;
        SELECT @@ROWCOUNT as affected;
      `);
    if (!(result.recordset?.[0]?.affected || 0)) return res.status(404).json({ success: false, message: 'Caso no encontrado' });

    res.json({ success: true });
  } catch (e) {
    console.error('Error updateSolucion caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteCaso = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const caso = (await pool.request().input('id', sql.Int, id)
      .query(`SELECT CASO_TIPO as tipo FROM CASOS WHERE CASO_ID=@id AND CASO_ACTIVO=1`)).recordset[0];
    if (!caso) return res.status(404).json({ success: false, message: 'Caso no encontrado' });
    if (caso.tipo === 'queja') {
      const err = await verificarPermisoQueja(req, pool, 'eliminar');
      if (err) return res.status(403).json({ success: false, message: err });
    }

    await pool.request().input('id', sql.Int, id)
      .query(`UPDATE CASOS SET CASO_ACTIVO=0 WHERE CASO_ID=@id`);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'eliminar-caso', entidadId: id, detalle: { tipo: caso.tipo }, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleteCaso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Comentarios ─────────────────────────────────────────────────────────────

exports.listComentarios = async (req, res) => {
  try {
    const casoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(casoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, casoId)
      .query(`
        SELECT CCO_ID as id, CCO_CASO_ID as casoId, CCO_COMENTARIO as comentario,
               CCO_USUARIO_ID as usuarioId, U.NEUS_NOMBRES as usuarioNombre, CCO_FECHA as fecha
        FROM CASOS_COMENTARIOS CCO
        LEFT JOIN NEUS_USUARIOS U ON U.NEUS_ID = CCO.CCO_USUARIO_ID
        WHERE CCO_CASO_ID = @id
        ORDER BY CCO_FECHA ASC
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listComentarios caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addComentario = async (req, res) => {
  try {
    const casoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(casoId)) return res.status(400).json({ success: false, message: 'id inválido' });
    const { comentario } = req.body || {};
    if (!comentario || !String(comentario).trim()) return res.status(400).json({ success: false, message: 'Comentario requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('casoId', sql.Int, casoId)
      .input('comentario', sql.NVarChar(sql.MAX), String(comentario).trim())
      .input('usuarioId', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CASOS_COMENTARIOS (CCO_CASO_ID, CCO_COMENTARIO, CCO_USUARIO_ID)
        OUTPUT INSERTED.CCO_ID
        VALUES (@casoId, @comentario, @usuarioId)
      `);
    res.status(201).json({ success: true, data: { id: ins.recordset[0].CCO_ID } });
  } catch (e) {
    console.error('Error addComentario caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Evidencias (adjuntos cifrados AES-256-GCM) ───────────────────────────────

exports.subirEvidencia = async (req, res) => {
  try {
    const casoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(casoId)) return res.status(400).json({ success: false, message: 'id inválido' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ success: false, message: 'Archivo requerido (field: file)' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const caso = await pool.request()
      .input('id', sql.Int, casoId)
      .query(`SELECT TOP 1 CASO_ID FROM CASOS WHERE CASO_ID=@id AND CASO_ACTIVO=1`);
    if (!caso.recordset.length) return res.status(404).json({ success: false, message: 'Caso no encontrado' });

    const originalName = sanitizeFilename(req.file.originalname);
    const mime = (req.file.mimetype || '').toString().slice(0, 100);
    const sizeBytes = req.file.size || req.file.buffer.length;
    const descripcion = req.body && req.body.descripcion ? String(req.body.descripcion) : null;
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    let encrypted;
    try {
      encrypted = encryptBuffer(req.file.buffer);
    } catch (err) {
      console.error('❌ Error cifrando evidencia de caso:', err);
      return res.status(500).json({
        success: false,
        message: err && err.message ? err.message : 'Error cifrando evidencia',
        errorCode: 'ENCRYPTION_CONFIG_ERROR',
        hint: 'Configura EXPEDIENTE_ENCRYPTION_KEY (32 bytes base64/hex) en BackAgyda/.env y reinicia el backend.',
      });
    }
    const { data, iv, tag, cipherName } = encrypted;
    const keyId = (process.env.EXPEDIENTE_KEY_ID || '').trim() || null;

    const result = await pool.request()
      .input('casoId', sql.Int, casoId)
      .input('nombreOriginal', sql.NVarChar(255), originalName)
      .input('mime', sql.NVarChar(100), mime || null)
      .input('sizeBytes', sql.BigInt, sizeBytes)
      .input('descripcion', sql.NVarChar(500), descripcion)
      .input('data', sql.VarBinary(sql.MAX), data)
      .input('hash', sql.Char(64), sha256)
      .input('encAlgo', sql.NVarChar(30), cipherName)
      .input('iv', sql.VarBinary(12), iv)
      .input('tag', sql.VarBinary(16), tag)
      .input('keyId', sql.NVarChar(50), keyId)
      .input('subidoPor', sql.Int, getUserId(req))
      .query(`
        INSERT INTO CASOS_EVIDENCIAS
          (EVI_CASO_ID, EVI_NOMBRE_ORIGINAL, EVI_MIME_TYPE, EVI_TAMANO_BYTES, EVI_DESCRIPCION,
           EVI_ENCRYPTED_DATA, EVI_CONTENT_HASH, EVI_ENC_ALGO, EVI_ENC_IV, EVI_ENC_TAG, EVI_KEY_ID, EVI_SUBIDO_POR)
        OUTPUT INSERTED.EVI_ID, INSERTED.EVI_FECHA_SUBIDA
        VALUES
          (@casoId, @nombreOriginal, @mime, @sizeBytes, @descripcion,
           @data, @hash, @encAlgo, @iv, @tag, @keyId, @subidoPor)
      `);

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'subir-evidencia-caso', entidadId: casoId,
      detalle: { filename: originalName, sizeBytes }, ip: req.ip,
    });

    res.json({
      success: true,
      data: {
        id: result.recordset[0].EVI_ID,
        casoId,
        nombreOriginal: originalName,
        sizeBytes,
        fechaSubida: result.recordset[0].EVI_FECHA_SUBIDA,
      },
    });
  } catch (e) {
    console.error('Error subirEvidencia caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listEvidencias = async (req, res) => {
  try {
    const casoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(casoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('casoId', sql.Int, casoId)
      .query(`
        SELECT EVI_ID as id, EVI_CASO_ID as casoId, EVI_NOMBRE_ORIGINAL as nombreOriginal,
               EVI_MIME_TYPE as mimeType, EVI_TAMANO_BYTES as tamanoBytes, EVI_DESCRIPCION as descripcion,
               EVI_SUBIDO_POR as subidoPor, EVI_FECHA_SUBIDA as fechaSubida
        FROM CASOS_EVIDENCIAS
        WHERE EVI_CASO_ID = @casoId AND EVI_ACTIVO = 1
        ORDER BY EVI_FECHA_SUBIDA DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listEvidencias caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.downloadEvidencia = async (req, res) => {
  try {
    const evidenciaId = parseInt(req.params.evidenciaId, 10);
    if (!Number.isFinite(evidenciaId)) return res.status(400).json({ success: false, message: 'evidenciaId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('evidenciaId', sql.Int, evidenciaId)
      .query(`
        SELECT TOP 1 EVI_ID, EVI_NOMBRE_ORIGINAL, EVI_MIME_TYPE, EVI_ENC_IV, EVI_ENC_TAG, EVI_ENCRYPTED_DATA
        FROM CASOS_EVIDENCIAS WHERE EVI_ID = @evidenciaId AND EVI_ACTIVO = 1
      `);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    const row = result.recordset[0];
    let decrypted;
    try {
      decrypted = decryptBuffer(row.EVI_ENCRYPTED_DATA, row.EVI_ENC_IV, row.EVI_ENC_TAG);
    } catch (err) {
      console.error('❌ Error descifrando evidencia de caso:', err);
      return res.status(500).json({ success: false, message: 'Error descifrando evidencia', errorCode: 'DECRYPTION_ERROR' });
    }

    const filename = sanitizeFilename(row.EVI_NOMBRE_ORIGINAL);
    res.setHeader('Content-Type', row.EVI_MIME_TYPE || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(decrypted);
  } catch (e) {
    console.error('Error downloadEvidencia caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteEvidencia = async (req, res) => {
  try {
    const evidenciaId = parseInt(req.params.evidenciaId, 10);
    if (!Number.isFinite(evidenciaId)) return res.status(400).json({ success: false, message: 'evidenciaId inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('evidenciaId', sql.Int, evidenciaId)
      .query(`
        UPDATE CASOS_EVIDENCIAS SET EVI_ACTIVO = 0
        WHERE EVI_ID = @evidenciaId AND EVI_ACTIVO = 1;
        SELECT @@ROWCOUNT as affected;
      `);
    if (!(result.recordset?.[0]?.affected || 0)) return res.status(404).json({ success: false, message: 'Evidencia no encontrada' });

    await logAudit(pool, {
      userId: getUserId(req), userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'eliminar-evidencia-caso', entidadId: evidenciaId, detalle: null, ip: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error deleteEvidencia caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Acción correctiva (una sola por caso, inmutable tras crearse) ────────────

exports.getAccionCorrectiva = async (req, res) => {
  try {
    const casoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(casoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const caso = (await pool.request().input('id', sql.Int, casoId)
      .query(`SELECT CASO_TIPO as tipo FROM CASOS WHERE CASO_ID=@id AND CASO_ACTIVO=1`)).recordset[0];
    if (!caso) return res.status(404).json({ success: false, message: 'Caso no encontrado' });
    if (caso.tipo === 'queja') {
      const err = await verificarPermisoQueja(req, pool, 'leer-ac');
      if (err) return res.status(403).json({ success: false, message: err });
    }

    const rs = await pool.request()
      .input('id', sql.Int, casoId)
      .query(`
        SELECT AC_ID as id, AC_CASO_ID as casoId, AC_REDACTOR_ID as redactorId,
               AC_REDACTOR_NOMBRE as redactorNombre, AC_DESCRIPCION as descripcion,
               AC_RESPONSABLE as responsable,
               CONVERT(VARCHAR(10), AC_FECHA_COMPROMISO, 23) as fechaCompromiso,
               AC_ESTADO as estado,
               CONVERT(VARCHAR(19), AC_FECHA_REGISTRO, 120) as fechaRegistro
        FROM CASOS_ACCION_CORRECTIVA WHERE AC_CASO_ID = @id
      `);
    res.json({ success: true, data: rs.recordset[0] || null });
  } catch (e) {
    console.error('Error getAccionCorrectiva caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createAccionCorrectiva = async (req, res) => {
  try {
    const casoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(casoId)) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const userId = getUserId(req);

    const caso = (await pool.request().input('id', sql.Int, casoId)
      .query(`SELECT CASO_TIPO as tipo FROM CASOS WHERE CASO_ID=@id AND CASO_ACTIVO=1`)).recordset[0];
    if (!caso) return res.status(404).json({ success: false, message: 'Caso no encontrado' });
    if (caso.tipo === 'queja') {
      const err = await verificarPermisoQueja(req, pool, 'accion-correctiva');
      if (err) return res.status(403).json({ success: false, message: err });
    }

    const { descripcion, responsable, fechaCompromiso, estado } = req.body || {};
    if (!descripcion?.trim() || !responsable?.trim() || !fechaCompromiso) {
      return res.status(400).json({ success: false, message: 'descripcion, responsable y fechaCompromiso son obligatorios' });
    }
    const est = ESTADOS_AC_VALIDOS.includes(estado) ? estado : 'pendiente';

    const existe = await pool.request().input('id', sql.Int, casoId)
      .query('SELECT 1 as ok FROM CASOS_ACCION_CORRECTIVA WHERE AC_CASO_ID = @id');
    if (existe.recordset.length) {
      return res.status(409).json({ success: false, message: 'Ya existe una acción correctiva para este caso. No se puede modificar.' });
    }

    const redactorNombre = (await pool.request().input('uid', sql.Int, userId)
      .query('SELECT NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @uid')).recordset[0]?.NEUS_NOMBRES ?? null;

    const rs = await pool.request()
      .input('id', sql.Int, casoId)
      .input('rid', sql.Int, userId)
      .input('rn', sql.NVarChar(200), redactorNombre)
      .input('desc', sql.NVarChar(sql.MAX), descripcion.trim())
      .input('resp', sql.NVarChar(200), responsable.trim())
      .input('fc', sql.Date, new Date(fechaCompromiso + 'T12:00:00'))
      .input('est', sql.NVarChar(30), est)
      .query(`
        INSERT INTO CASOS_ACCION_CORRECTIVA
          (AC_CASO_ID, AC_REDACTOR_ID, AC_REDACTOR_NOMBRE, AC_DESCRIPCION, AC_RESPONSABLE, AC_FECHA_COMPROMISO, AC_ESTADO)
        OUTPUT INSERTED.AC_ID as id, CONVERT(VARCHAR(19), INSERTED.AC_FECHA_REGISTRO, 120) as fechaRegistro
        VALUES (@id, @rid, @rn, @desc, @resp, @fc, @est)
      `);

    await logAudit(pool, {
      userId, userName: req.user?.nombre || null,
      modulo: 'atencion-cliente', accion: 'crear-accion-correctiva-caso', entidadId: casoId,
      detalle: { responsable, descripcion }, ip: req.ip,
    });

    res.status(201).json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error createAccionCorrectiva caso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Helper no-HTTP: creación automática (crons, portal) ──────────────────────
// Molde de crearIncidenciaAutomatica. `tipo` fijo por el llamador (hoy siempre
// 'incidencia'). `opts` igual que en incidencias:
//   prioridadDefault, asignarAResponsable, notifTipo, notifEmailFn(u, ctx).
exports.crearCasoAutomatico = async ({ tipo, contactoId, titulo, descripcion, categoria, prioridad, origen, tenantKey }, opts = {}) => {
  const {
    prioridadDefault = 'alta',
    asignarAResponsable = false,
    notifTipo = 'caso-automatico',
    notifEmailFn = null,
  } = opts;
  const casoTipo = TIPOS_VALIDOS.includes(tipo) ? tipo : 'incidencia';
  const pool = await databaseService.getPool(tenantKey);
  const transaction = new sql.Transaction(pool);
  try {
    const prio = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : prioridadDefault;
    const slaHoras = casoTipo === 'incidencia' ? SLA_HORAS_POR_PRIORIDAD[prio] : null;

    const contacto = await pool.request()
      .input('id', sql.Int, contactoId)
      .query(`SELECT CONT_RESPONSABLE_ID as responsableId FROM CRM_CONTACTOS WHERE CONT_ID=@id`);
    const responsableId = contacto.recordset[0]?.responsableId || null;
    const asignadoA = asignarAResponsable ? responsableId : null;

    await transaction.begin();
    const folio = await generarFolioEnTransaccion(transaction);

    const rs = await new sql.Request(transaction)
      .input('folio', sql.NVarChar(20), folio)
      .input('tipo', sql.NVarChar(20), casoTipo)
      .input('contactoId', sql.Int, contactoId)
      .input('titulo', sql.NVarChar(200), titulo)
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion || null)
      .input('categoria', sql.NVarChar(50), categoria || null)
      .input('prioridad', sql.NVarChar(20), prio)
      .input('slaHoras', sql.Int, slaHoras)
      .input('origen', sql.NVarChar(20), origen || 'manual')
      .input('asignadoA', sql.Int, asignadoA)
      .query(`
        INSERT INTO CASOS
          (CASO_FOLIO, CASO_TIPO, CASO_CONTACTO_ID, CASO_TITULO, CASO_DESCRIPCION, CASO_CATEGORIA,
           CASO_PRIORIDAD, CASO_SLA_HORAS, CASO_FECHA_LIMITE_SLA, CASO_ORIGEN, CASO_ASIGNADO_A)
        OUTPUT INSERTED.CASO_ID
        VALUES (@folio, @tipo, @contactoId, @titulo, @descripcion, @categoria,
                @prioridad, @slaHoras,
                CASE WHEN @slaHoras IS NULL THEN NULL ELSE DATEADD(HOUR, @slaHoras, GETDATE()) END,
                @origen, @asignadoA)
      `);
    await transaction.commit();

    const id = rs.recordset[0].CASO_ID;

    if (responsableId) {
      await notificationService.createNotification({
        usuarioId: responsableId,
        mensaje: `Caso creado: ${folio} — ${titulo}`,
        tipo: notifTipo,
        dataExtra: { casoId: id, contactoId, folio, tipo: casoTipo },
        tenantKey,
      });
      if (notifEmailFn) {
        try {
          const u = await pool.request().input('uid', sql.Int, responsableId)
            .query(`SELECT NEUS_NOMBRES AS nombre, NEUS_CORREO AS correo FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);
          if (u.recordset[0]?.correo) await notifEmailFn(u.recordset[0], { folio, titulo });
        } catch (e) { console.warn('crearCasoAutomatico correo:', e.message); }
      }
    }

    return { id, folio };
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* best-effort */ }
    console.error('Error crearCasoAutomatico:', e);
    return null;
  }
};
