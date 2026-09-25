// Formularios de Atención (Contact Center) — Entrega 1: CRUD de
// Formulario -> Versión -> Sección -> Campo (+ Opciones) -> Asignación.
// Motor de reglas, resolución en vivo durante una interacción y cierre
// transaccional con tipificación quedan para las Entregas 2 y 3 (ver
// schemaService.ensureFormulariosAtencionSchema para el detalle del
// modelo y las decisiones de diseño).
//
// Convenciones seguidas del resto de Contact Center (ccConfigController.js):
// - pool(req) resuelve el tenant por empresa (multiempresa = 1 BD por
//   empresa, no columna EmpresaID).
// - Permisos vía requireActionAccess('contact-center', accion) en las
//   rutas — aquí solo se valida esGestor() como respaldo adicional en las
//   escrituras administrativas (crear/editar/publicar/asignar), igual que
//   ccConfigController.createCampania/createTipificacion, etc.
// - Edición de secciones/campos: permitida en 'borrador', 'publicado' e
//   'inactivo' — decisión explícita del cliente (2026-09-08) de priorizar
//   edición rápida sobre el versionado estricto que se diseñó originalmente.
//   Advertencia real que queda documentada aquí: si una interacción ya usó
//   esta versión y guardó una respuesta contra un FC_ID que después se borra
//   o cambia de tipo, esa respuesta histórica (Entrega 3, tabla
//   CCO_INTERACCION_FORM_RESPUESTAS) queda huérfana/inconsistente — no hay
//   ninguna protección contra eso a nivel de datos. Solo 'archivado' sigue
//   bloqueado (es un cierre definitivo del formulario). Quien necesite el
//   comportamiento seguro (no tocar lo ya usado) debe seguir usando
//   "Nueva versión" en vez de editar la publicada.
const sql = require('mssql');
const databaseService = require('../services/databaseService');

function esAdmin(req) {
  return ['AD', 'TI'].includes(String(req.user?.tipoUsuario || '').toUpperCase());
}
function esGestor(req) {
  return esAdmin(req);
}
async function pool(req) { return databaseService.getPool(req?.user?.empresa); }
function usuarioIdDe(req) {
  return req.user && (req.user.id || req.user.sub || req.user.userId);
}
function usuarioNombreDe(req) {
  return req.user && (req.user.nombres || req.user.usuario || null);
}

const ESTADOS_VALIDOS = ['borrador', 'publicado', 'inactivo', 'archivado'];
const ANCHOS_VALIDOS = ['completo', 'medio', 'tercio'];
const TIPOS_CAMPO_VALIDOS = [
  'texto_corto', 'texto_largo', 'numero', 'telefono', 'email', 'fecha', 'hora',
  'fecha_hora', 'lista', 'radio', 'checkbox', 'si_no', 'multiseleccion',
  'moneda', 'porcentaje', 'url', 'archivo', 'imagen', 'firma', 'catalogo',
  'usuario_agente', 'sucursal', 'calculado', 'oculto', 'titulo', 'separador',
  // 'buscador': único tipo con comportamiento propio en el
  // DynamicFormRenderer del agente — busca en CCO_INTERACCIONES acotado a
  // las campañas/canales asignados al formulario (GET .../buscador) y
  // permite registrar un contacto nuevo (POST .../buscador/registrar) si no
  // se encuentra. No guarda "una respuesta" como los demás campos: el valor
  // que persiste es el CI_ID de la interacción encontrada o creada.
  'buscador',
  // 'pendientes': panel "Pendientes por contactar" (citas por confirmar,
  // recordar o reagendar) en el formulario externo. Tampoco guarda valor;
  // su configJson dice quién ve qué (alcance) y qué grupos se muestran.
  'pendientes',
];

// Fuentes válidas para un campo tipo 'catalogo' — 'estatico' (opciones
// escritas a mano en CCF_FORM_CAMPO_OPCIONES, comportamiento original) o
// 'tipificaciones_campania' (resuelto en vivo vía
// getOpcionesCatalogoDinamico(Publico) desde CCO_TIPIFICACIONES de la
// campaña asignada al formulario — pedido 2026-09-09). Diseñado para poder
// agregar más fuentes (usuarios, sucursales) sin tocar el contrato.
const CATALOGO_FUENTES_VALIDAS = ['estatico', 'tipificaciones_campania'];

function slugCodigo(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'formulario';
}

// ── Formularios (cabecera) ──────────────────────────────────────────────
exports.listFormularios = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT fr.FR_ID id, fr.FR_CODIGO codigo, fr.FR_NOMBRE nombre, fr.FR_DESCRIPCION descripcion,
             fr.FR_ESTADO estado, fr.FR_ACTIVO activo, fr.FR_CREADO_POR_NOMBRE creadoPorNombre,
             fr.FR_FECHA_CREACION fechaCreacion, fr.FR_FECHA_ACTUALIZACION fechaActualizacion,
             fr.FR_MODO modo, fr.FR_TOKEN_PUBLICO tokenPublico,
             (SELECT MAX(FV_NUMERO) FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = fr.FR_ID) versionMaxima,
             (SELECT TOP 1 FV_NUMERO FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = fr.FR_ID AND FV_ESTADO = 'publicado' ORDER BY FV_NUMERO DESC) versionPublicada
      FROM dbo.CCF_FORMULARIOS fr
      WHERE fr.FR_ACTIVO = 1
      ORDER BY fr.FR_FECHA_ACTUALIZACION DESC`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('ccFormularios.listFormularios:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar formularios' });
  }
};

exports.getFormulario = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT FR_ID id, FR_CODIGO codigo, FR_NOMBRE nombre, FR_DESCRIPCION descripcion,
             FR_ESTADO estado, FR_ACTIVO activo, FR_CREADO_POR_NOMBRE creadoPorNombre,
             FR_FECHA_CREACION fechaCreacion, FR_FECHA_ACTUALIZACION fechaActualizacion,
             FR_MODO modo, FR_TOKEN_PUBLICO tokenPublico
      FROM dbo.CCF_FORMULARIOS WHERE FR_ID = @id`);
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    const versiones = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT FV_ID id, FV_NUMERO numero, FV_ESTADO estado, FV_FECHA_CREACION fechaCreacion,
             FV_PUBLICADO_POR_NOMBRE publicadoPorNombre, FV_FECHA_PUBLICACION fechaPublicacion
      FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = @id ORDER BY FV_NUMERO DESC`);
    res.json({ success: true, data: { ...r.recordset[0], versiones: versiones.recordset } });
  } catch (e) {
    console.error('ccFormularios.getFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener el formulario' });
  }
};

// Alterna interno/externo. Al pasar a 'externo' genera el token público si
// todavía no tiene uno (se conserva entre idas y vueltas interno<->externo,
// así la URL no cambia cada vez que el admin la desactiva y reactiva).
exports.setModoFormulario = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const modo = req.body?.modo === 'externo' ? 'externo' : 'interno';
    const p = await pool(req);
    const actual = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT FR_TOKEN_PUBLICO tokenPublico FROM dbo.CCF_FORMULARIOS WHERE FR_ID = @id');
    if (!actual.recordset.length) return res.status(404).json({ success: false, message: 'No encontrado' });

    let token = actual.recordset[0].tokenPublico;
    if (modo === 'externo' && !token) {
      token = require('crypto').randomBytes(20).toString('hex');
    }
    await p.request().input('id', sql.Int, req.params.id).input('m', sql.NVarChar(10), modo).input('t', sql.NVarChar(64), token)
      .query('UPDATE dbo.CCF_FORMULARIOS SET FR_MODO = @m, FR_TOKEN_PUBLICO = @t WHERE FR_ID = @id');
    res.json({ success: true, data: { modo, tokenPublico: token } });
  } catch (e) {
    console.error('ccFormularios.setModoFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al cambiar el modo del formulario' });
  }
};

// Crear formulario = crea la cabecera + su versión 1 en 'borrador' de una vez
// (un formulario sin ninguna versión no tiene sentido para el constructor).
exports.createFormulario = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!String(b.nombre || '').trim()) {
      return res.status(400).json({ success: false, message: 'Falta el nombre del formulario' });
    }
    const codigo = String(b.codigo || '').trim() ? slugCodigo(b.codigo) : slugCodigo(b.nombre);
    const p = await pool(req);
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const dup = await new sql.Request(tx).input('c', sql.NVarChar(60), codigo)
        .query('SELECT FR_ID id FROM dbo.CCF_FORMULARIOS WHERE FR_CODIGO = @c');
      if (dup.recordset.length) {
        await tx.rollback();
        return res.status(409).json({ success: false, message: `Ya existe un formulario con el código "${codigo}"` });
      }
      const uid = usuarioIdDe(req);
      const uname = usuarioNombreDe(req);
      const frRes = await new sql.Request(tx)
        .input('codigo', sql.NVarChar(60), codigo)
        .input('nombre', sql.NVarChar(200), String(b.nombre).trim())
        .input('desc', sql.NVarChar(sql.MAX), b.descripcion || null)
        .input('uid', sql.Int, uid || null)
        .input('uname', sql.NVarChar(160), uname || null)
        .query(`INSERT INTO dbo.CCF_FORMULARIOS (FR_CODIGO, FR_NOMBRE, FR_DESCRIPCION, FR_CREADO_POR, FR_CREADO_POR_NOMBRE)
                OUTPUT INSERTED.FR_ID id VALUES (@codigo, @nombre, @desc, @uid, @uname)`);
      const formularioId = frRes.recordset[0].id;
      const fvRes = await new sql.Request(tx)
        .input('fid', sql.Int, formularioId)
        .input('uid', sql.Int, uid || null)
        .query(`INSERT INTO dbo.CCF_FORM_VERSIONES (FV_FORMULARIO_ID, FV_NUMERO, FV_CREADO_POR)
                OUTPUT INSERTED.FV_ID id VALUES (@fid, 1, @uid)`);
      await tx.commit();
      res.status(201).json({ success: true, data: { id: formularioId, versionId: fvRes.recordset[0].id } });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('ccFormularios.createFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear el formulario' });
  }
};

exports.updateFormulario = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const p = await pool(req);
    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(200), b.nombre || null)
      .input('d', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('uid', sql.Int, usuarioIdDe(req) || null)
      .query(`UPDATE dbo.CCF_FORMULARIOS SET
                FR_NOMBRE = ISNULL(@n, FR_NOMBRE), FR_DESCRIPCION = @d,
                FR_ACTUALIZADO_POR = @uid, FR_FECHA_ACTUALIZACION = GETDATE()
              WHERE FR_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.updateFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al actualizar el formulario' });
  }
};

// Archivar = soft-delete (no se listan, no se pueden asignar). No borra
// filas físicas — las interacciones históricas siguen resolviendo su
// FV_ID exacto sin problema aunque el formulario ya esté archivado.
exports.archivarFormulario = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.CCF_FORMULARIOS SET FR_ESTADO = 'archivado', FR_ACTIVO = 0 WHERE FR_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.archivarFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al archivar el formulario' });
  }
};

// Clonar = nuevo formulario independiente (código distinto) con una copia
// completa de la versión indicada (secciones + campos + opciones) en
// 'borrador', y la misma selección de tipificaciones. Distinto de "nueva
// versión" (versionarFormulario), que crea una versión dentro del MISMO
// formulario. body.nombre (opcional) = nombre del nuevo; si no, "<origen> (copia)".
exports.clonarFormulario = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const origen = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT FR_NOMBRE nombre, FR_DESCRIPCION descripcion FROM dbo.CCF_FORMULARIOS WHERE FR_ID = @id');
    if (!origen.recordset.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    const versionOrigenId = req.body?.versionId
      ? Number(req.body.versionId)
      : (await p.request().input('id', sql.Int, req.params.id)
          .query('SELECT TOP 1 FV_ID id FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = @id ORDER BY FV_NUMERO DESC')
        ).recordset[0]?.id;
    if (!versionOrigenId) return res.status(400).json({ success: false, message: 'El formulario origen no tiene versiones' });

    const nombrePedido = String(req.body?.nombre || '').trim().slice(0, 200);
    const nombreNuevo = nombrePedido || `${origen.recordset[0].nombre} (copia)`;
    const uid = usuarioIdDe(req);
    const uname = usuarioNombreDe(req);
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      let codigo = slugCodigo(nombreNuevo);
      // Evitar colisión de código añadiendo sufijo incremental.
      for (let intento = 0; intento < 20; intento++) {
        const candidato = intento === 0 ? codigo : `${codigo}_${intento + 1}`;
        const dup = await new sql.Request(tx).input('c', sql.NVarChar(60), candidato)
          .query('SELECT 1 x FROM dbo.CCF_FORMULARIOS WHERE FR_CODIGO = @c');
        if (!dup.recordset.length) { codigo = candidato; break; }
      }
      const frRes = await new sql.Request(tx)
        .input('codigo', sql.NVarChar(60), codigo)
        .input('nombre', sql.NVarChar(200), nombreNuevo)
        .input('desc', sql.NVarChar(sql.MAX), origen.recordset[0].descripcion)
        .input('uid', sql.Int, uid || null)
        .input('uname', sql.NVarChar(160), uname || null)
        .query(`INSERT INTO dbo.CCF_FORMULARIOS (FR_CODIGO, FR_NOMBRE, FR_DESCRIPCION, FR_CREADO_POR, FR_CREADO_POR_NOMBRE)
                OUTPUT INSERTED.FR_ID id VALUES (@codigo, @nombre, @desc, @uid, @uname)`);
      const nuevoFormularioId = frRes.recordset[0].id;
      const nuevaVersionId = await _clonarVersionEnTx(tx, versionOrigenId, nuevoFormularioId, 1, uid);
      // Misma selección de tipificaciones permitidas que el origen.
      await new sql.Request(tx).input('o', sql.Int, req.params.id).input('n', sql.Int, nuevoFormularioId)
        .query(`INSERT INTO dbo.CCF_FORM_TIPIFICACIONES (FT_FORMULARIO_ID, FT_TIPIFICACION_ID)
                SELECT @n, FT_TIPIFICACION_ID FROM dbo.CCF_FORM_TIPIFICACIONES WHERE FT_FORMULARIO_ID = @o`);
      await tx.commit();
      res.status(201).json({ success: true, data: { id: nuevoFormularioId, versionId: nuevaVersionId, nombre: nombreNuevo, codigo } });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('ccFormularios.clonarFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al clonar el formulario' });
  }
};

// Copia secciones + campos + opciones de `versionOrigenId` hacia una versión
// nueva (creada dentro de esta misma función) con número `numero` bajo
// `formularioId`. Devuelve el FV_ID de la versión nueva. Debe ejecutarse
// dentro de una transacción ya abierta (tx).
async function _clonarVersionEnTx(tx, versionOrigenId, formularioId, numero, uid) {
  const fvRes = await new sql.Request(tx)
    .input('fid', sql.Int, formularioId)
    .input('num', sql.Int, numero)
    .input('uid', sql.Int, uid || null)
    .query(`INSERT INTO dbo.CCF_FORM_VERSIONES (FV_FORMULARIO_ID, FV_NUMERO, FV_CREADO_POR)
            OUTPUT INSERTED.FV_ID id VALUES (@fid, @num, @uid)`);
  const nuevaVersionId = fvRes.recordset[0].id;

  const secciones = await new sql.Request(tx).input('v', sql.Int, versionOrigenId).query(`
    SELECT FS_ID id, FS_CODIGO codigo, FS_TITULO titulo, FS_DESCRIPCION descripcion, FS_ORDEN orden,
           FS_VISIBLE visible, FS_COLAPSABLE colapsable, FS_ESTADO_INICIAL_COLAPSADO estadoInicialColapsado, FS_CONFIG_JSON configJson
    FROM dbo.CCF_FORM_SECCIONES WHERE FS_VERSION_ID = @v ORDER BY FS_ORDEN`);

  for (const s of secciones.recordset) {
    const fsRes = await new sql.Request(tx)
      .input('v', sql.Int, nuevaVersionId)
      .input('cod', sql.NVarChar(60), s.codigo)
      .input('tit', sql.NVarChar(200), s.titulo)
      .input('desc', sql.NVarChar(sql.MAX), s.descripcion)
      .input('ord', sql.Int, s.orden)
      .input('vis', sql.Bit, s.visible)
      .input('col', sql.Bit, s.colapsable)
      .input('eic', sql.Bit, s.estadoInicialColapsado)
      .input('cfg', sql.NVarChar(sql.MAX), s.configJson)
      .query(`INSERT INTO dbo.CCF_FORM_SECCIONES
                (FS_VERSION_ID, FS_CODIGO, FS_TITULO, FS_DESCRIPCION, FS_ORDEN, FS_VISIBLE, FS_COLAPSABLE, FS_ESTADO_INICIAL_COLAPSADO, FS_CONFIG_JSON)
              OUTPUT INSERTED.FS_ID id
              VALUES (@v, @cod, @tit, @desc, @ord, @vis, @col, @eic, @cfg)`);
    const nuevaSeccionId = fsRes.recordset[0].id;

    const campos = await new sql.Request(tx).input('s', sql.Int, s.id).query(`
      SELECT FC_ID id, FC_CODIGO codigo, FC_TIPO tipo, FC_ETIQUETA etiqueta, FC_DESCRIPCION descripcion,
             FC_PLACEHOLDER placeholder, FC_AYUDA ayuda, FC_OBLIGATORIO obligatorio, FC_SOLO_LECTURA soloLectura,
             FC_VISIBLE visible, FC_VALOR_PREDETERMINADO valorPredeterminado, FC_ORDEN orden, FC_ANCHO ancho,
             FC_LONGITUD_MIN longitudMin, FC_LONGITUD_MAX longitudMax, FC_VALOR_MIN valorMin, FC_VALOR_MAX valorMax,
             FC_REGEX regex, FC_CATALOGO_FUENTE catalogoFuente, FC_CATALOGO_CONFIG_JSON catalogoConfigJson, FC_CONFIG_JSON configJson
      FROM dbo.CCF_FORM_CAMPOS WHERE FC_SECCION_ID = @s ORDER BY FC_ORDEN`);

    for (const c of campos.recordset) {
      const fcRes = await new sql.Request(tx)
        .input('s', sql.Int, nuevaSeccionId)
        .input('cod', sql.NVarChar(80), c.codigo)
        .input('tipo', sql.NVarChar(30), c.tipo)
        .input('et', sql.NVarChar(200), c.etiqueta)
        .input('desc', sql.NVarChar(sql.MAX), c.descripcion)
        .input('ph', sql.NVarChar(200), c.placeholder)
        .input('ayuda', sql.NVarChar(500), c.ayuda)
        .input('obl', sql.Bit, c.obligatorio)
        .input('sl', sql.Bit, c.soloLectura)
        .input('vis', sql.Bit, c.visible)
        .input('vp', sql.NVarChar(sql.MAX), c.valorPredeterminado)
        .input('ord', sql.Int, c.orden)
        .input('an', sql.NVarChar(20), c.ancho)
        .input('lmin', sql.Int, c.longitudMin)
        .input('lmax', sql.Int, c.longitudMax)
        .input('vmin', sql.Decimal(18, 4), c.valorMin)
        .input('vmax', sql.Decimal(18, 4), c.valorMax)
        .input('rx', sql.NVarChar(300), c.regex)
        .input('cf', sql.NVarChar(30), c.catalogoFuente)
        .input('ccfg', sql.NVarChar(sql.MAX), c.catalogoConfigJson)
        .input('cfg', sql.NVarChar(sql.MAX), c.configJson)
        .query(`INSERT INTO dbo.CCF_FORM_CAMPOS
                  (FC_SECCION_ID, FC_CODIGO, FC_TIPO, FC_ETIQUETA, FC_DESCRIPCION, FC_PLACEHOLDER, FC_AYUDA,
                   FC_OBLIGATORIO, FC_SOLO_LECTURA, FC_VISIBLE, FC_VALOR_PREDETERMINADO, FC_ORDEN, FC_ANCHO,
                   FC_LONGITUD_MIN, FC_LONGITUD_MAX, FC_VALOR_MIN, FC_VALOR_MAX, FC_REGEX,
                   FC_CATALOGO_FUENTE, FC_CATALOGO_CONFIG_JSON, FC_CONFIG_JSON)
                OUTPUT INSERTED.FC_ID id
                VALUES (@s, @cod, @tipo, @et, @desc, @ph, @ayuda, @obl, @sl, @vis, @vp, @ord, @an,
                        @lmin, @lmax, @vmin, @vmax, @rx, @cf, @ccfg, @cfg)`);
      const nuevoCampoId = fcRes.recordset[0].id;

      const opciones = await new sql.Request(tx).input('c', sql.Int, c.id).query(
        'SELECT FO_VALOR valor, FO_ETIQUETA etiqueta, FO_ORDEN orden, FO_ACTIVO activo FROM dbo.CCF_FORM_CAMPO_OPCIONES WHERE FO_CAMPO_ID = @c ORDER BY FO_ORDEN');
      for (const o of opciones.recordset) {
        await new sql.Request(tx)
          .input('c', sql.Int, nuevoCampoId)
          .input('v', sql.NVarChar(200), o.valor)
          .input('e', sql.NVarChar(200), o.etiqueta)
          .input('ord', sql.Int, o.orden)
          .input('act', sql.Bit, o.activo)
          .query(`INSERT INTO dbo.CCF_FORM_CAMPO_OPCIONES (FO_CAMPO_ID, FO_VALOR, FO_ETIQUETA, FO_ORDEN, FO_ACTIVO)
                  VALUES (@c, @v, @e, @ord, @act)`);
      }
    }
  }
  return nuevaVersionId;
}

// Nueva versión (dentro del MISMO formulario) — clona la última versión
// existente (publicada o no) como punto de partida en 'borrador'. Requisito
// del prompt: "una versión PUBLICADA nunca se modifica directamente; si se
// desea cambiar, se genera una nueva versión".
exports.crearVersion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const ult = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT TOP 1 FV_ID id, FV_NUMERO numero FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = @id ORDER BY FV_NUMERO DESC');
    if (!ult.recordset.length) return res.status(404).json({ success: false, message: 'El formulario no tiene versiones' });

    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const nuevaVersionId = await _clonarVersionEnTx(tx, ult.recordset[0].id, Number(req.params.id), ult.recordset[0].numero + 1, usuarioIdDe(req));
      await new sql.Request(tx).input('id', sql.Int, req.params.id)
        .query(`UPDATE dbo.CCF_FORMULARIOS SET FR_ESTADO = 'borrador' WHERE FR_ID = @id AND FR_ESTADO <> 'archivado'`);
      await tx.commit();
      res.status(201).json({ success: true, data: { versionId: nuevaVersionId, numero: ult.recordset[0].numero + 1 } });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('ccFormularios.crearVersion:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la versión' });
  }
};

// Publicar: exige al menos una sección con al menos un campo (formulario
// vacío no es publicable). Despublica cualquier otra versión 'publicado'
// del mismo formulario (solo una activa a la vez) dentro de la misma
// transacción — evita que quede más de una versión "vigente" ambigua.
exports.publicarVersion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const v = await p.request().input('id', sql.Int, req.params.versionId)
      .query('SELECT FV_ID id, FV_FORMULARIO_ID formularioId, FV_ESTADO estado FROM dbo.CCF_FORM_VERSIONES WHERE FV_ID = @id');
    if (!v.recordset.length) return res.status(404).json({ success: false, message: 'Versión no encontrada' });
    if (v.recordset[0].estado === 'publicado') {
      return res.status(400).json({ success: false, message: 'Esta versión ya está publicada' });
    }

    const conteo = await p.request().input('id', sql.Int, req.params.versionId).query(`
      SELECT COUNT(*) n FROM dbo.CCF_FORM_CAMPOS c
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      WHERE s.FS_VERSION_ID = @id`);
    if (!conteo.recordset[0].n) {
      return res.status(400).json({ success: false, message: 'No puedes publicar un formulario sin campos' });
    }

    const uid = usuarioIdDe(req);
    const uname = usuarioNombreDe(req);
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      await new sql.Request(tx).input('fid', sql.Int, v.recordset[0].formularioId)
        .query(`UPDATE dbo.CCF_FORM_VERSIONES SET FV_ESTADO = 'inactivo' WHERE FV_FORMULARIO_ID = @fid AND FV_ESTADO = 'publicado'`);
      await new sql.Request(tx)
        .input('id', sql.Int, req.params.versionId)
        .input('uid', sql.Int, uid || null)
        .input('uname', sql.NVarChar(160), uname || null)
        .query(`UPDATE dbo.CCF_FORM_VERSIONES SET FV_ESTADO = 'publicado', FV_PUBLICADO_POR = @uid,
                  FV_PUBLICADO_POR_NOMBRE = @uname, FV_FECHA_PUBLICACION = GETDATE() WHERE FV_ID = @id`);
      await new sql.Request(tx).input('fid', sql.Int, v.recordset[0].formularioId)
        .query(`UPDATE dbo.CCF_FORMULARIOS SET FR_ESTADO = 'publicado', FR_FECHA_ACTUALIZACION = GETDATE() WHERE FR_ID = @fid`);
      await tx.commit();
      res.json({ success: true });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('ccFormularios.publicarVersion:', e.message);
    res.status(500).json({ success: false, message: 'Error al publicar la versión' });
  }
};

exports.inactivarVersion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.versionId)
      .query(`UPDATE dbo.CCF_FORM_VERSIONES SET FV_ESTADO = 'inactivo' WHERE FV_ID = @id AND FV_ESTADO = 'publicado'`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.inactivarVersion:', e.message);
    res.status(500).json({ success: false, message: 'Error al inactivar la versión' });
  }
};

// Definición completa de una versión (secciones + campos + opciones) para
// el constructor. La resolución "en vivo" para una interacción real
// (FormResolverService) es distinta y llega en la Entrega 3 — esta es solo
// para editar/previsualizar en el panel de administración.
exports.getVersionCompleta = async (req, res) => {
  try {
    const p = await pool(req);
    const v = await p.request().input('id', sql.Int, req.params.versionId).query(`
      SELECT FV_ID id, FV_FORMULARIO_ID formularioId, FV_NUMERO numero, FV_ESTADO estado, FV_ROWVERSION rowversion
      FROM dbo.CCF_FORM_VERSIONES WHERE FV_ID = @id`);
    if (!v.recordset.length) return res.status(404).json({ success: false, message: 'Versión no encontrada' });

    const secciones = await p.request().input('id', sql.Int, req.params.versionId).query(`
      SELECT FS_ID id, FS_CODIGO codigo, FS_TITULO titulo, FS_DESCRIPCION descripcion, FS_ORDEN orden,
             FS_VISIBLE visible, FS_COLAPSABLE colapsable, FS_ESTADO_INICIAL_COLAPSADO estadoInicialColapsado, FS_CONFIG_JSON configJson
      FROM dbo.CCF_FORM_SECCIONES WHERE FS_VERSION_ID = @id ORDER BY FS_ORDEN`);

    const campos = await p.request().input('id', sql.Int, req.params.versionId).query(`
      SELECT c.FC_ID id, c.FC_SECCION_ID seccionId, c.FC_CODIGO codigo, c.FC_TIPO tipo, c.FC_ETIQUETA etiqueta,
             c.FC_DESCRIPCION descripcion, c.FC_PLACEHOLDER placeholder, c.FC_AYUDA ayuda, c.FC_OBLIGATORIO obligatorio,
             c.FC_SOLO_LECTURA soloLectura, c.FC_VISIBLE visible, c.FC_VALOR_PREDETERMINADO valorPredeterminado,
             c.FC_ORDEN orden, c.FC_ANCHO ancho, c.FC_LONGITUD_MIN longitudMin, c.FC_LONGITUD_MAX longitudMax,
             c.FC_VALOR_MIN valorMin, c.FC_VALOR_MAX valorMax, c.FC_REGEX regex, c.FC_CATALOGO_FUENTE catalogoFuente,
             c.FC_CATALOGO_CONFIG_JSON catalogoConfigJson, c.FC_CONFIG_JSON configJson
      FROM dbo.CCF_FORM_CAMPOS c
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      WHERE s.FS_VERSION_ID = @id ORDER BY c.FC_ORDEN`);

    // Opciones de todos los campos de la versión de una sola consulta (join
    // por FS_VERSION_ID en vez de mandar la lista de FC_ID como parámetro —
    // más simple que un TVP y evita el límite de parámetros con formularios
    // grandes).
    const opcionesRs = await p.request().input('id', sql.Int, req.params.versionId).query(`
      SELECT fo.FO_CAMPO_ID campoId, fo.FO_ID id, fo.FO_VALOR valor, fo.FO_ETIQUETA etiqueta, fo.FO_ORDEN orden
      FROM dbo.CCF_FORM_CAMPO_OPCIONES fo
      JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = fo.FO_CAMPO_ID
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      WHERE s.FS_VERSION_ID = @id AND fo.FO_ACTIVO = 1
      ORDER BY fo.FO_ORDEN`);
    const opciones = opcionesRs.recordset;

    res.json({
      success: true,
      data: {
        ...v.recordset[0],
        secciones: secciones.recordset.map((s) => ({
          ...s,
          campos: campos.recordset.filter((c) => c.seccionId === s.id).map((c) => ({
            ...c,
            opciones: opciones.filter((o) => o.campoId === c.id),
          })),
        })),
      },
    });
  } catch (e) {
    console.error('ccFormularios.getVersionCompleta:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener la versión' });
  }
};

function _asegurarVersionEditable(estadoVersion) {
  return estadoVersion === 'borrador' || estadoVersion === 'publicado' || estadoVersion === 'inactivo';
}

// ── Secciones ────────────────────────────────────────────────────────────
exports.createSeccion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const v = await p.request().input('id', sql.Int, req.params.versionId)
      .query('SELECT FV_ESTADO estado FROM dbo.CCF_FORM_VERSIONES WHERE FV_ID = @id');
    if (!v.recordset.length) return res.status(404).json({ success: false, message: 'Versión no encontrada' });
    if (!_asegurarVersionEditable(v.recordset[0].estado)) {
      return res.status(400).json({ success: false, message: 'Este formulario está archivado y ya no se puede editar. Clónalo o crea una nueva versión a partir de otra.' });
    }
    const b = req.body || {};
    if (!String(b.titulo || '').trim()) return res.status(400).json({ success: false, message: 'Falta el título de la sección' });
    const r = await p.request()
      .input('v', sql.Int, req.params.versionId)
      .input('cod', sql.NVarChar(60), b.codigo || null)
      .input('tit', sql.NVarChar(200), String(b.titulo).trim())
      .input('desc', sql.NVarChar(sql.MAX), b.descripcion || null)
      .input('ord', sql.Int, b.orden ?? 0)
      .input('vis', sql.Bit, b.visible !== false)
      .input('col', sql.Bit, !!b.colapsable)
      .input('eic', sql.Bit, !!b.estadoInicialColapsado)
      .input('cfg', sql.NVarChar(sql.MAX), b.configJson ? JSON.stringify(b.configJson) : null)
      .query(`INSERT INTO dbo.CCF_FORM_SECCIONES
                (FS_VERSION_ID, FS_CODIGO, FS_TITULO, FS_DESCRIPCION, FS_ORDEN, FS_VISIBLE, FS_COLAPSABLE, FS_ESTADO_INICIAL_COLAPSADO, FS_CONFIG_JSON)
              OUTPUT INSERTED.FS_ID id
              VALUES (@v, @cod, @tit, @desc, @ord, @vis, @col, @eic, @cfg)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) {
    console.error('ccFormularios.createSeccion:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la sección' });
  }
};

exports.updateSeccion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const chk = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT v.FV_ESTADO estado FROM dbo.CCF_FORM_SECCIONES s
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID WHERE s.FS_ID = @id`);
    if (!chk.recordset.length) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (!_asegurarVersionEditable(chk.recordset[0].estado)) {
      return res.status(400).json({ success: false, message: 'Este formulario está archivado y ya no se puede editar. Clónalo o crea una nueva versión a partir de otra.' });
    }
    const b = req.body || {};
    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('cod', sql.NVarChar(60), b.codigo ?? null)
      .input('tit', sql.NVarChar(200), b.titulo || null)
      .input('desc', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('ord', sql.Int, b.orden ?? null)
      .input('vis', sql.Bit, b.visible != null ? !!b.visible : null)
      .input('col', sql.Bit, b.colapsable != null ? !!b.colapsable : null)
      .input('eic', sql.Bit, b.estadoInicialColapsado != null ? !!b.estadoInicialColapsado : null)
      .input('cfg', sql.NVarChar(sql.MAX), b.configJson !== undefined ? JSON.stringify(b.configJson) : null)
      .query(`UPDATE dbo.CCF_FORM_SECCIONES SET
                FS_CODIGO = @cod, FS_TITULO = ISNULL(@tit, FS_TITULO), FS_DESCRIPCION = @desc,
                FS_ORDEN = ISNULL(@ord, FS_ORDEN), FS_VISIBLE = ISNULL(@vis, FS_VISIBLE),
                FS_COLAPSABLE = ISNULL(@col, FS_COLAPSABLE), FS_ESTADO_INICIAL_COLAPSADO = ISNULL(@eic, FS_ESTADO_INICIAL_COLAPSADO),
                FS_CONFIG_JSON = ISNULL(@cfg, FS_CONFIG_JSON)
              WHERE FS_ID = @id`);
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.updateSeccion:', e.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la sección' });
  }
};

exports.deleteSeccion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const chk = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT v.FV_ESTADO estado FROM dbo.CCF_FORM_SECCIONES s
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID WHERE s.FS_ID = @id`);
    if (!chk.recordset.length) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (!_asegurarVersionEditable(chk.recordset[0].estado)) {
      return res.status(400).json({ success: false, message: 'Este formulario está archivado y ya no se puede editar. Clónalo o crea una nueva versión a partir de otra.' });
    }
    await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM dbo.CCF_FORM_SECCIONES WHERE FS_ID = @id');
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.deleteSeccion:', e.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la sección' });
  }
};

// ── Campos ───────────────────────────────────────────────────────────────
exports.createCampo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const chk = await p.request().input('id', sql.Int, req.params.seccionId).query(`
      SELECT v.FV_ESTADO estado FROM dbo.CCF_FORM_SECCIONES s
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID WHERE s.FS_ID = @id`);
    if (!chk.recordset.length) return res.status(404).json({ success: false, message: 'Sección no encontrada' });
    if (!_asegurarVersionEditable(chk.recordset[0].estado)) {
      return res.status(400).json({ success: false, message: 'Este formulario está archivado y ya no se puede editar. Clónalo o crea una nueva versión a partir de otra.' });
    }
    const b = req.body || {};
    if (!String(b.codigo || '').trim()) return res.status(400).json({ success: false, message: 'Falta el código interno del campo' });
    if (!String(b.etiqueta || '').trim()) return res.status(400).json({ success: false, message: 'Falta la etiqueta del campo' });
    const tipo = String(b.tipo || '').trim();
    if (!TIPOS_CAMPO_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo de campo no soportado: "${tipo}"` });
    }
    if (b.catalogoFuente && !CATALOGO_FUENTES_VALIDAS.includes(b.catalogoFuente)) {
      return res.status(400).json({ success: false, message: `Fuente de catálogo no soportada: "${b.catalogoFuente}"` });
    }
    const ancho = ANCHOS_VALIDOS.includes(b.ancho) ? b.ancho : 'completo';

    const r = await p.request()
      .input('s', sql.Int, req.params.seccionId)
      .input('cod', sql.NVarChar(80), slugCodigo(b.codigo))
      .input('tipo', sql.NVarChar(30), tipo)
      .input('et', sql.NVarChar(200), String(b.etiqueta).trim())
      .input('desc', sql.NVarChar(sql.MAX), b.descripcion || null)
      .input('ph', sql.NVarChar(200), b.placeholder || null)
      .input('ayuda', sql.NVarChar(500), b.ayuda || null)
      .input('obl', sql.Bit, !!b.obligatorio)
      .input('sl', sql.Bit, !!b.soloLectura)
      .input('vis', sql.Bit, b.visible !== false)
      .input('vp', sql.NVarChar(sql.MAX), b.valorPredeterminado ?? null)
      .input('ord', sql.Int, b.orden ?? 0)
      .input('an', sql.NVarChar(20), ancho)
      .input('lmin', sql.Int, b.longitudMin ?? null)
      .input('lmax', sql.Int, b.longitudMax ?? null)
      .input('vmin', sql.Decimal(18, 4), b.valorMin ?? null)
      .input('vmax', sql.Decimal(18, 4), b.valorMax ?? null)
      .input('rx', sql.NVarChar(300), b.regex || null)
      .input('cf', sql.NVarChar(30), b.catalogoFuente || null)
      .input('ccfg', sql.NVarChar(sql.MAX), b.catalogoConfigJson ? JSON.stringify(b.catalogoConfigJson) : null)
      .input('cfg', sql.NVarChar(sql.MAX), b.configJson ? JSON.stringify(b.configJson) : null)
      .query(`INSERT INTO dbo.CCF_FORM_CAMPOS
                (FC_SECCION_ID, FC_CODIGO, FC_TIPO, FC_ETIQUETA, FC_DESCRIPCION, FC_PLACEHOLDER, FC_AYUDA,
                 FC_OBLIGATORIO, FC_SOLO_LECTURA, FC_VISIBLE, FC_VALOR_PREDETERMINADO, FC_ORDEN, FC_ANCHO,
                 FC_LONGITUD_MIN, FC_LONGITUD_MAX, FC_VALOR_MIN, FC_VALOR_MAX, FC_REGEX,
                 FC_CATALOGO_FUENTE, FC_CATALOGO_CONFIG_JSON, FC_CONFIG_JSON)
              OUTPUT INSERTED.FC_ID id
              VALUES (@s, @cod, @tipo, @et, @desc, @ph, @ayuda, @obl, @sl, @vis, @vp, @ord, @an,
                      @lmin, @lmax, @vmin, @vmax, @rx, @cf, @ccfg, @cfg)`);
    const campoId = r.recordset[0].id;

    if (Array.isArray(b.opciones) && b.opciones.length) {
      for (let i = 0; i < b.opciones.length; i++) {
        const o = b.opciones[i];
        if (!o || !String(o.valor ?? '').trim()) continue;
        await p.request()
          .input('c', sql.Int, campoId)
          .input('v', sql.NVarChar(200), String(o.valor).trim())
          .input('e', sql.NVarChar(200), String(o.etiqueta ?? o.valor).trim())
          .input('ord', sql.Int, o.orden ?? i)
          .query(`INSERT INTO dbo.CCF_FORM_CAMPO_OPCIONES (FO_CAMPO_ID, FO_VALOR, FO_ETIQUETA, FO_ORDEN) VALUES (@c, @v, @e, @ord)`);
      }
    }
    res.status(201).json({ success: true, data: { id: campoId } });
  } catch (e) {
    console.error('ccFormularios.createCampo:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear el campo' });
  }
};

exports.updateCampo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const chk = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT v.FV_ESTADO estado FROM dbo.CCF_FORM_CAMPOS c
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID WHERE c.FC_ID = @id`);
    if (!chk.recordset.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    if (!_asegurarVersionEditable(chk.recordset[0].estado)) {
      return res.status(400).json({ success: false, message: 'Este formulario está archivado y ya no se puede editar. Clónalo o crea una nueva versión a partir de otra.' });
    }
    const b = req.body || {};
    if (b.catalogoFuente && !CATALOGO_FUENTES_VALIDAS.includes(b.catalogoFuente)) {
      return res.status(400).json({ success: false, message: `Fuente de catálogo no soportada: "${b.catalogoFuente}"` });
    }
    if (b.tipo !== undefined && !TIPOS_CAMPO_VALIDOS.includes(b.tipo)) {
      return res.status(400).json({ success: false, message: `Tipo de campo no soportado: "${b.tipo}"` });
    }
    await p.request()
      .input('id', sql.Int, req.params.id)
      .input('cod', sql.NVarChar(80), b.codigo ? slugCodigo(b.codigo) : null)
      .input('tipo', sql.NVarChar(30), b.tipo || null)
      .input('et', sql.NVarChar(200), b.etiqueta || null)
      .input('desc', sql.NVarChar(sql.MAX), b.descripcion ?? null)
      .input('ph', sql.NVarChar(200), b.placeholder ?? null)
      .input('ayuda', sql.NVarChar(500), b.ayuda ?? null)
      .input('obl', sql.Bit, b.obligatorio != null ? !!b.obligatorio : null)
      .input('sl', sql.Bit, b.soloLectura != null ? !!b.soloLectura : null)
      .input('vis', sql.Bit, b.visible != null ? !!b.visible : null)
      .input('vp', sql.NVarChar(sql.MAX), b.valorPredeterminado !== undefined ? b.valorPredeterminado : null)
      .input('ord', sql.Int, b.orden ?? null)
      .input('an', sql.NVarChar(20), ANCHOS_VALIDOS.includes(b.ancho) ? b.ancho : null)
      .input('lmin', sql.Int, b.longitudMin ?? null)
      .input('lmax', sql.Int, b.longitudMax ?? null)
      .input('vmin', sql.Decimal(18, 4), b.valorMin ?? null)
      .input('vmax', sql.Decimal(18, 4), b.valorMax ?? null)
      .input('rx', sql.NVarChar(300), b.regex ?? null)
      .input('cf', sql.NVarChar(30), b.catalogoFuente ?? null)
      .input('ccfg', sql.NVarChar(sql.MAX), b.catalogoConfigJson !== undefined ? JSON.stringify(b.catalogoConfigJson) : null)
      .input('cfg', sql.NVarChar(sql.MAX), b.configJson !== undefined ? JSON.stringify(b.configJson) : null)
      .query(`UPDATE dbo.CCF_FORM_CAMPOS SET
                FC_CODIGO = ISNULL(@cod, FC_CODIGO), FC_TIPO = ISNULL(@tipo, FC_TIPO), FC_ETIQUETA = ISNULL(@et, FC_ETIQUETA),
                FC_DESCRIPCION = @desc, FC_PLACEHOLDER = @ph, FC_AYUDA = @ayuda,
                FC_OBLIGATORIO = ISNULL(@obl, FC_OBLIGATORIO), FC_SOLO_LECTURA = ISNULL(@sl, FC_SOLO_LECTURA),
                FC_VISIBLE = ISNULL(@vis, FC_VISIBLE), FC_VALOR_PREDETERMINADO = @vp, FC_ORDEN = ISNULL(@ord, FC_ORDEN),
                FC_ANCHO = ISNULL(@an, FC_ANCHO), FC_LONGITUD_MIN = @lmin, FC_LONGITUD_MAX = @lmax,
                FC_VALOR_MIN = @vmin, FC_VALOR_MAX = @vmax, FC_REGEX = @rx, FC_CATALOGO_FUENTE = @cf,
                FC_CATALOGO_CONFIG_JSON = ISNULL(@ccfg, FC_CATALOGO_CONFIG_JSON), FC_CONFIG_JSON = ISNULL(@cfg, FC_CONFIG_JSON)
              WHERE FC_ID = @id`);

    if (Array.isArray(b.opciones)) {
      await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM dbo.CCF_FORM_CAMPO_OPCIONES WHERE FO_CAMPO_ID = @id');
      for (let i = 0; i < b.opciones.length; i++) {
        const o = b.opciones[i];
        if (!o || !String(o.valor ?? '').trim()) continue;
        await p.request()
          .input('c', sql.Int, req.params.id)
          .input('v', sql.NVarChar(200), String(o.valor).trim())
          .input('e', sql.NVarChar(200), String(o.etiqueta ?? o.valor).trim())
          .input('ord', sql.Int, o.orden ?? i)
          .query(`INSERT INTO dbo.CCF_FORM_CAMPO_OPCIONES (FO_CAMPO_ID, FO_VALOR, FO_ETIQUETA, FO_ORDEN) VALUES (@c, @v, @e, @ord)`);
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.updateCampo:', e.message);
    res.status(500).json({ success: false, message: 'Error al actualizar el campo' });
  }
};

exports.deleteCampo = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    const chk = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT v.FV_ESTADO estado FROM dbo.CCF_FORM_CAMPOS c
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID WHERE c.FC_ID = @id`);
    if (!chk.recordset.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    if (!_asegurarVersionEditable(chk.recordset[0].estado)) {
      return res.status(400).json({ success: false, message: 'Este formulario está archivado y ya no se puede editar. Clónalo o crea una nueva versión a partir de otra.' });
    }
    await p.request().input('id', sql.Int, req.params.id).query('DELETE FROM dbo.CCF_FORM_CAMPOS WHERE FC_ID = @id');
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.deleteCampo:', e.message);
    res.status(500).json({ success: false, message: 'Error al eliminar el campo' });
  }
};

// ── Tipos de campo disponibles (para el panel de componentes del constructor) ──
exports.listTiposCampo = async (_req, res) => {
  res.json({ success: true, data: TIPOS_CAMPO_VALIDOS });
};

// ── Asignaciones (Campaña + Canal -> Versión publicada) ─────────────────
exports.listAsignaciones = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT fa.FA_ID id, fa.FA_CAMPANIA_ID campaniaId, c.CM2_NOMBRE campaniaNombre,
             fa.FA_CANAL_ID canalId, cn.CN_NOMBRE canalNombre, cn.CN_TIPO canalTipo,
             fa.FA_FORM_VERSION_ID formVersionId, fr.FR_ID formularioId, fr.FR_NOMBRE formularioNombre, fv.FV_NUMERO version,
             fa.FA_ACTIVO activo, fa.FA_FECHA_CREACION fechaCreacion
      FROM dbo.CCF_FORM_ASIGNACIONES fa
      JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = fa.FA_CAMPANIA_ID
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = fa.FA_CANAL_ID
      JOIN dbo.CCF_FORM_VERSIONES fv ON fv.FV_ID = fa.FA_FORM_VERSION_ID
      JOIN dbo.CCF_FORMULARIOS fr ON fr.FR_ID = fv.FV_FORMULARIO_ID
      WHERE fa.FA_ACTIVO = 1
      ORDER BY c.CM2_NOMBRE, cn.CN_NOMBRE`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('ccFormularios.listAsignaciones:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar asignaciones' });
  }
};

// Crea/reemplaza la asignación activa para (campaña, canal). Si ya existe
// una activa para ese par exacto, la desactiva primero — así el índice
// único filtrado (UQ_CCF_FA_CAMPANIA_CANAL_ACTIVA) nunca choca y no queda
// más de una asignación activa ambigua por (campaña, canal).
exports.createAsignacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const campaniaId = Number(b.campaniaId);
    const canalId = b.canalId != null && b.canalId !== '' ? Number(b.canalId) : null;
    const formVersionId = Number(b.formVersionId);
    if (!campaniaId || !formVersionId) {
      return res.status(400).json({ success: false, message: 'Faltan campaniaId o formVersionId' });
    }
    const p = await pool(req);
    const v = await p.request().input('id', sql.Int, formVersionId)
      .query(`SELECT FV_ESTADO estado FROM dbo.CCF_FORM_VERSIONES WHERE FV_ID = @id`);
    if (!v.recordset.length) return res.status(404).json({ success: false, message: 'Versión no encontrada' });
    if (v.recordset[0].estado !== 'publicado') {
      return res.status(400).json({ success: false, message: 'Solo puedes asignar una versión publicada' });
    }

    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const reqDesact = new sql.Request(tx).input('c', sql.Int, campaniaId);
      if (canalId) reqDesact.input('cn', sql.Int, canalId);
      await reqDesact.query(canalId
        ? `UPDATE dbo.CCF_FORM_ASIGNACIONES SET FA_ACTIVO = 0 WHERE FA_CAMPANIA_ID = @c AND FA_CANAL_ID = @cn AND FA_ACTIVO = 1`
        : `UPDATE dbo.CCF_FORM_ASIGNACIONES SET FA_ACTIVO = 0 WHERE FA_CAMPANIA_ID = @c AND FA_CANAL_ID IS NULL AND FA_ACTIVO = 1`);

      const ins = new sql.Request(tx)
        .input('c', sql.Int, campaniaId)
        .input('cn', sql.Int, canalId)
        .input('v', sql.Int, formVersionId)
        .input('uid', sql.Int, usuarioIdDe(req) || null);
      const r = await ins.query(`INSERT INTO dbo.CCF_FORM_ASIGNACIONES (FA_CAMPANIA_ID, FA_CANAL_ID, FA_FORM_VERSION_ID, FA_CREADO_POR)
              OUTPUT INSERTED.FA_ID id VALUES (@c, @cn, @v, @uid)`);
      await tx.commit();
      res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('ccFormularios.createAsignacion:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la asignación' });
  }
};

exports.deleteAsignacion = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query('UPDATE dbo.CCF_FORM_ASIGNACIONES SET FA_ACTIVO = 0 WHERE FA_ID = @id');
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.deleteAsignacion:', e.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la asignación' });
  }
};

// Canales reales disponibles para el registro manual del campo 'buscador':
// resuelve la asignación tal cual la ve el backend (con canal específico,
// o "cualquier canal" = todos los de la campaña asignada) para que el
// frontend no tenga que adivinar cuál canal ofrecer cuando la asignación es
// abierta (FA_CANAL_ID NULL). Compartido entre el endpoint autenticado y el
// público (modo externo) — ver ambos exports más abajo.
async function _listCanalesDisponibles(p, formularioId) {
  const { campaniaIds, canalIds } = await _campaniasYCanalesDelFormulario(p, formularioId);
  if (!campaniaIds.length) return [];

  if (canalIds.length) {
    const rq = p.request();
    const params = canalIds.map((id, i) => { rq.input(`c${i}`, sql.Int, id); return `@c${i}`; });
    const r = await rq.query(`SELECT CN_ID id, CN_NOMBRE nombre, CN_TIPO tipo FROM dbo.CCO_CANALES WHERE CN_ID IN (${params.join(',')})`);
    return r.recordset;
  }
  // Asignación abierta ("cualquier canal") — todos los canales de las
  // campañas asignadas.
  const rq = p.request();
  const params = campaniaIds.map((id, i) => { rq.input(`camp${i}`, sql.Int, id); return `@camp${i}`; });
  const r = await rq.query(`SELECT CN_ID id, CN_NOMBRE nombre, CN_TIPO tipo FROM dbo.CCO_CANALES WHERE CN_CAMPANIA_ID IN (${params.join(',')})`);
  return r.recordset;
}

exports.listCanalesDisponiblesDelFormulario = async (req, res) => {
  try {
    const p = await pool(req);
    const data = await _listCanalesDisponibles(p, req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    console.error('ccFormularios.listCanalesDisponiblesDelFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los canales' });
  }
};

// ── Tipificaciones del formulario ────────────────────────────────────────
// Un formulario hereda las tipificaciones de la(s) campaña(s) a las que está
// asignado (CCF_FORM_ASIGNACIONES.FA_CAMPANIA_ID) — las tipificaciones en sí
// siguen viviendo en CCO_TIPIFICACIONES (administradas desde Campañas, no se
// duplican aquí). Esto solo agrega una capa de selección: cuáles de esas
// tipificaciones son válidas para cerrar una interacción que usó ESTE
// formulario. Sin selección guardada = todas están permitidas.
// Campañas asignadas + tipificaciones heredadas — compartido entre el panel
// admin (listTipificacionesDelFormulario) y el uso en vivo, tanto interno
// como público (campo tipo 'catalogo' con catalogoFuente
// 'tipificaciones_campania' — ver getOpcionesCatalogoDinamico más abajo).
async function _tipificacionesDelFormulario(p, formularioId) {
  const campanias = await p.request().input('id', sql.Int, formularioId).query(`
    SELECT DISTINCT fa.FA_CAMPANIA_ID campaniaId, c.CM2_NOMBRE campaniaNombre
    FROM dbo.CCF_FORM_ASIGNACIONES fa
    JOIN dbo.CCF_FORM_VERSIONES fv ON fv.FV_ID = fa.FA_FORM_VERSION_ID
    JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = fa.FA_CAMPANIA_ID
    WHERE fv.FV_FORMULARIO_ID = @id AND fa.FA_ACTIVO = 1`);

  if (!campanias.recordset.length) return { campanias: [], tipificaciones: [] };

  const campaniaIds = campanias.recordset.map((c) => c.campaniaId);
  const rq1 = p.request();
  const params = campaniaIds.map((id, i) => { rq1.input(`camp${i}`, sql.Int, id); return `@camp${i}`; });
  const tipificaciones = await rq1.query(`
    SELECT CT_ID id, CT_CAMPANIA_ID campaniaId, CT_NOMBRE nombre, CT_DESCRIPCION descripcion,
           CT_REQUIERE_COMENTARIO requiereComentario, CT_ORDEN orden
    FROM dbo.CCO_TIPIFICACIONES
    WHERE CT_ACTIVO = 1 AND (CT_CAMPANIA_ID IN (${params.join(',')}) OR CT_CAMPANIA_ID IS NULL)
    ORDER BY CT_ORDEN, CT_NOMBRE`);

  return { campanias: campanias.recordset, tipificaciones: tipificaciones.recordset };
}

exports.listTipificacionesDelFormulario = async (req, res) => {
  try {
    const p = await pool(req);
    const { campanias, tipificaciones } = await _tipificacionesDelFormulario(p, req.params.id);
    if (!campanias.length) {
      return res.json({ success: true, data: { campanias: [], tipificaciones: [], seleccionadas: [] } });
    }
    const seleccionadas = await p.request().input('id', sql.Int, req.params.id)
      .query('SELECT FT_TIPIFICACION_ID id FROM dbo.CCF_FORM_TIPIFICACIONES WHERE FT_FORMULARIO_ID = @id');
    res.json({
      success: true,
      data: { campanias, tipificaciones, seleccionadas: seleccionadas.recordset.map((r) => r.id) },
    });
  } catch (e) {
    console.error('ccFormularios.listTipificacionesDelFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener las tipificaciones del formulario' });
  }
};

// GET /formularios/:id/opciones-catalogo?fuente=tipificaciones_campania —
// opciones de un catálogo DINÁMICO para un campo tipo 'catalogo' del
// constructor. Hoy solo soporta 'tipificaciones_campania' (las tipificaciones
// de la campaña asignada, mismo criterio que la pestaña Tipificaciones);
// diseñado para agregar más fuentes (usuarios, sucursales, etc.) sin cambiar
// el contrato — el frontend solo sabe que le pide un catálogo por nombre y
// recibe {valor, etiqueta}[].
exports.getOpcionesCatalogoDinamico = async (req, res) => {
  try {
    const p = await pool(req);
    const fuente = String(req.query.fuente || '');
    if (fuente === 'tipificaciones_campania') {
      const { tipificaciones } = await _tipificacionesDelFormulario(p, req.params.id);
      return res.json({ success: true, data: tipificaciones.map((t) => ({ valor: String(t.id), etiqueta: t.nombre })) });
    }
    res.json({ success: true, data: [] });
  } catch (e) {
    console.error('ccFormularios.getOpcionesCatalogoDinamico:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener el catálogo' });
  }
};

// Misma resolución que getOpcionesCatalogoDinamico pero por token público
// (modo externo, sin sesión) — usa _resolverFormularioPublico igual que el
// resto de endpoints públicos del formulario.
exports.getOpcionesCatalogoDinamicoPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const fuente = String(req.query.fuente || '');
    if (fuente === 'tipificaciones_campania') {
      const { tipificaciones } = await _tipificacionesDelFormulario(r.pool, r.formularioId);
      return res.json({ success: true, data: tipificaciones.map((t) => ({ valor: String(t.id), etiqueta: t.nombre })) });
    }
    res.json({ success: true, data: [] });
  } catch (e) {
    console.error('ccFormularios.getOpcionesCatalogoDinamicoPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener el catálogo' });
  }
};

// Reemplaza la selección completa (delete + insert dentro de una
// transacción) — más simple y menos propenso a inconsistencias que un diff
// incremental, y la lista nunca es grande (tipificaciones de 1-2 campañas).
exports.setTipificacionesDelFormulario = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const ids = Array.isArray(req.body?.tipificacionIds)
      ? req.body.tipificacionIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const p = await pool(req);

    const formExiste = await p.request().input('id', sql.Int, req.params.id).query('SELECT 1 x FROM dbo.CCF_FORMULARIOS WHERE FR_ID = @id');
    if (!formExiste.recordset.length) return res.status(404).json({ success: false, message: 'Formulario no encontrado' });

    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id)
        .query('DELETE FROM dbo.CCF_FORM_TIPIFICACIONES WHERE FT_FORMULARIO_ID = @id');
      for (const tipId of ids) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('t', sql.Int, tipId)
          .query('INSERT INTO dbo.CCF_FORM_TIPIFICACIONES (FT_FORMULARIO_ID, FT_TIPIFICACION_ID) VALUES (@id, @t)');
      }
      await tx.commit();
      res.json({ success: true });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error('ccFormularios.setTipificacionesDelFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar las tipificaciones del formulario' });
  }
};

// ── Buscador de interacciones de las campañas asignadas al formulario ────
// Delega en ccInteraccionesController.historial (ya soporta campaniaId en
// CSV) resolviendo primero las campañas asignadas a este formulario — evita
// que el frontend tenga que conocer esa relación para armar el filtro.
// Campañas (y, de paso, canales) a los que un formulario está activamente
// asignado — compartido entre el panel administrativo de "Interacciones"
// (pestaña del constructor) y el campo tipo 'buscador' que el agente usa en
// vivo durante una atención real.
async function _campaniasYCanalesDelFormulario(p, formularioId) {
  const r = await p.request().input('id', sql.Int, formularioId).query(`
    SELECT DISTINCT fa.FA_CAMPANIA_ID campaniaId, fa.FA_CANAL_ID canalId
    FROM dbo.CCF_FORM_ASIGNACIONES fa
    JOIN dbo.CCF_FORM_VERSIONES fv ON fv.FV_ID = fa.FA_FORM_VERSION_ID
    WHERE fv.FV_FORMULARIO_ID = @id AND fa.FA_ACTIVO = 1`);
  return {
    campaniaIds: [...new Set(r.recordset.map((x) => x.campaniaId))],
    canalIds: [...new Set(r.recordset.map((x) => x.canalId).filter((x) => x != null))],
  };
}

exports.buscarInteraccionesDelFormulario = async (req, res) => {
  try {
    const p = await pool(req);
    const { campaniaIds } = await _campaniasYCanalesDelFormulario(p, req.params.id);
    if (!campaniaIds.length) return res.json({ success: true, data: [] });

    const rq = p.request();
    const where = [`i.CI_ESTADO = 'cerrada'`];
    const params = campaniaIds.map((id, i) => { rq.input(`camp${i}`, sql.Int, id); return `@camp${i}`; });
    where.push(`i.CI_CAMPANIA_ID IN (${params.join(',')})`);
    if (req.query.texto) { rq.input('t', sql.NVarChar(200), `%${req.query.texto}%`); where.push('(i.CI_CLIENTE_NOMBRE LIKE @t OR i.CI_CLIENTE_TELEFONO LIKE @t)'); }
    if (req.query.agenteId) { rq.input('a', sql.Int, req.query.agenteId); where.push('i.CI_AGENTE_ID = @a'); }
    if (req.query.tipificacionId) { rq.input('tip', sql.Int, req.query.tipificacionId); where.push('i.CI_TIPIFICACION_ID = @tip'); }
    if (req.query.fechaDesde) { rq.input('fd', sql.DateTime, new Date(req.query.fechaDesde)); where.push('i.CI_FECHA_CIERRE >= @fd'); }
    if (req.query.fechaHasta) { rq.input('fh', sql.DateTime, new Date(req.query.fechaHasta)); where.push('i.CI_FECHA_CIERRE <= @fh'); }

    const r = await rq.query(`
      SELECT i.CI_ID id, i.CI_CLIENTE_NOMBRE clienteNombre, i.CI_CLIENTE_TELEFONO clienteTelefono,
             i.CI_AGENTE_NOMBRE agenteNombre, i.CI_FECHA_INICIO fechaInicio, i.CI_FECHA_CIERRE fechaCierre,
             i.CI_ESTADO estado, cn.CN_NOMBRE canalNombre, cm.CM2_NOMBRE campaniaNombre, ti.CT_NOMBRE tipificacionNombre
      FROM dbo.CCO_INTERACCIONES i
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
      LEFT JOIN dbo.CCO_CAMPANIAS cm ON cm.CM2_ID = i.CI_CAMPANIA_ID
      LEFT JOIN dbo.CCO_TIPIFICACIONES ti ON ti.CT_ID = i.CI_TIPIFICACION_ID
      WHERE ${where.join(' AND ')}
      ORDER BY i.CI_FECHA_CIERRE DESC
      OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('ccFormularios.buscarInteraccionesDelFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al buscar interacciones' });
  }
};

// ── Registros capturados en un formulario (vista rápida) ────────────────
// GET /formularios/:id/registros — un renglón por interacción que usó ESTE
// formulario (cualquiera de sus versiones), con el valor de cada campo ya
// legible: opciones de lista/catálogo por su etiqueta, la tipificación por
// su nombre y las fechas como 'YYYY-MM-DD'. Las fechas se guardan a
// medianoche UTC (fecha sin hora): se cortan en UTC para que no se recorran
// un día al mostrarlas en México. Solo los más recientes (MAX_REGISTROS).
const MAX_REGISTROS = 1000;
const TIPOS_SIN_VALOR = new Set(['titulo', 'separador', 'buscador', 'pendientes']);

function _valorLegible(campo, fila, opcionesPorCampo, tipificaciones) {
  if (fila.booleano !== null && fila.booleano !== undefined) return fila.booleano ? 'Sí' : 'No';
  if (fila.fecha) {
    const d = new Date(fila.fecha);
    if (Number.isNaN(d.getTime())) return null;
    return campo?.tipo === 'fecha' ? d.toISOString().slice(0, 10) : d.toISOString();
  }
  const etiquetaDe = (v) => {
    const s = String(v);
    if (campo?.catalogoFuente === 'tipificaciones_campania') return tipificaciones.get(Number(s)) ?? s;
    return opcionesPorCampo.get(campo?.id)?.get(s) ?? s;
  };
  if (fila.json) {
    try {
      const v = JSON.parse(fila.json);
      return Array.isArray(v) ? v.map(etiquetaDe).join(', ') : (typeof v === 'object' && v !== null ? JSON.stringify(v) : etiquetaDe(v));
    } catch { return fila.json; }
  }
  const crudo = fila.texto ?? (fila.numero !== null && fila.numero !== undefined ? String(Number(fila.numero)) : null);
  if (crudo === null || crudo === '') return null;
  return etiquetaDe(crudo);
}

exports.listRegistrosDelFormulario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Id inválido' });
    const p = await pool(req);
    const fr = await p.request().input('id', sql.Int, id)
      .query('SELECT FR_ID id, FR_NOMBRE nombre FROM dbo.CCF_FORMULARIOS WHERE FR_ID = @id');
    if (!fr.recordset.length) return res.status(404).json({ success: false, message: 'Formulario no encontrado' });

    const base = await p.request().input('id', sql.Int, id).input('max', sql.Int, MAX_REGISTROS).query(`
      SELECT c.FC_ID id, c.FC_CODIGO codigo, c.FC_ETIQUETA etiqueta, c.FC_TIPO tipo, c.FC_CATALOGO_FUENTE catalogoFuente,
             v.FV_ID versionId, v.FV_NUMERO numero, v.FV_ESTADO estado
      FROM dbo.CCF_FORM_CAMPOS c
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID
      WHERE v.FV_FORMULARIO_ID = @id
      ORDER BY v.FV_NUMERO, s.FS_ORDEN, c.FC_ORDEN;

      SELECT o.FO_CAMPO_ID campoId, o.FO_VALOR valor, o.FO_ETIQUETA etiqueta
      FROM dbo.CCF_FORM_CAMPO_OPCIONES o
      JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = o.FO_CAMPO_ID
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = s.FS_VERSION_ID
      WHERE v.FV_FORMULARIO_ID = @id;

      SELECT COUNT(DISTINCT r.FIR_INTERACCION_ID) total
      FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
      JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = r.FIR_VERSION_ID
      WHERE v.FV_FORMULARIO_ID = @id;

      SELECT TOP (@max) i.CI_ID id, i.CI_FECHA_INICIO fecha, i.CI_AGENTE_NOMBRE agenteNombre,
             i.CI_CLIENTE_NOMBRE clienteNombre, i.CI_CLIENTE_TELEFONO clienteTelefono, i.CI_ESTADO estado
      FROM dbo.CCO_INTERACCIONES i
      WHERE i.CI_ID IN (
        SELECT r.FIR_INTERACCION_ID FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
        JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = r.FIR_VERSION_ID
        WHERE v.FV_FORMULARIO_ID = @id)
      ORDER BY i.CI_ID DESC;`);
    const [campos, opciones, [{ total }], interacciones] = base.recordsets;

    // Columnas = campos con valor de la versión publicada más reciente (o la
    // última); los de versiones anteriores se leen por su mismo código.
    const versiones = [...new Map(campos.map((c) => [c.versionId, c])).values()];
    const vCols = [...versiones].reverse().find((v) => v.estado === 'publicado') ?? versiones[versiones.length - 1];
    const columnas = campos
      .filter((c) => vCols && c.versionId === vCols.versionId && !TIPOS_SIN_VALOR.has(c.tipo))
      .map((c) => ({ codigo: c.codigo, etiqueta: c.etiqueta, tipo: c.tipo }));
    const campoPorId = new Map(campos.map((c) => [c.id, c]));
    const opcionesPorCampo = new Map();
    for (const o of opciones) {
      if (!opcionesPorCampo.has(o.campoId)) opcionesPorCampo.set(o.campoId, new Map());
      opcionesPorCampo.get(o.campoId).set(String(o.valor), o.etiqueta);
    }

    let respuestas = [];
    const tipificaciones = new Map();
    if (interacciones.length) {
      const ids = interacciones.map((i) => Number(i.id)).filter(Number.isInteger);
      const r = await p.request().input('id', sql.Int, id).query(`
        SELECT r.FIR_INTERACCION_ID interaccionId, r.FIR_CAMPO_ID campoId, r.FIR_VALOR_TEXTO texto, r.FIR_VALOR_NUMERO numero,
               r.FIR_VALOR_FECHA fecha, r.FIR_VALOR_BOOLEANO booleano, r.FIR_VALOR_JSON json
        FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
        JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = r.FIR_VERSION_ID
        WHERE v.FV_FORMULARIO_ID = @id AND r.FIR_INTERACCION_ID IN (${ids.join(',')})`);
      respuestas = r.recordset;
      const ctIds = [...new Set(respuestas
        .filter((x) => campoPorId.get(x.campoId)?.catalogoFuente === 'tipificaciones_campania')
        .map((x) => Number(x.texto ?? x.numero))
        .filter((n) => Number.isInteger(n) && n > 0))];
      if (ctIds.length) {
        const t = await p.request().query(`SELECT CT_ID id, CT_NOMBRE nombre FROM dbo.CCO_TIPIFICACIONES WHERE CT_ID IN (${ctIds.join(',')})`);
        for (const x of t.recordset) tipificaciones.set(x.id, String(x.nombre).trim());
      }
    }

    const valoresPorInteraccion = new Map();
    for (const x of respuestas) {
      const campo = campoPorId.get(x.campoId);
      if (!campo || TIPOS_SIN_VALOR.has(campo.tipo)) continue;
      if (!valoresPorInteraccion.has(x.interaccionId)) valoresPorInteraccion.set(x.interaccionId, {});
      const v = _valorLegible(campo, x, opcionesPorCampo, tipificaciones);
      const destino = valoresPorInteraccion.get(x.interaccionId);
      if (v !== null || !(campo.codigo in destino)) destino[campo.codigo] = typeof v === 'string' ? v.trim() : v;
    }

    res.json({
      success: true,
      data: {
        formulario: fr.recordset[0],
        columnas,
        total,
        limite: MAX_REGISTROS,
        registros: interacciones.map((i) => ({
          interaccionId: i.id,
          fecha: i.fecha,
          estado: i.estado,
          agenteNombre: i.agenteNombre ? String(i.agenteNombre).trim() : null,
          clienteNombre: i.clienteNombre ? String(i.clienteNombre).trim() : null,
          clienteTelefono: i.clienteTelefono ? String(i.clienteTelefono).trim() : null,
          valores: valoresPorInteraccion.get(i.id) ?? {},
        })),
      },
    });
  } catch (e) {
    console.error('ccFormularios.listRegistrosDelFormulario:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los registros del formulario' });
  }
};

// ── Campo tipo 'buscador' (usado por el agente EN VIVO, dentro de una
// atención real) ──────────────────────────────────────────────────────────
// Mismo criterio de acotamiento que buscarInteraccionesDelFormulario (solo
// campañas/canales asignados a este formulario) pero pensado para
// consumirse desde el DynamicFormRenderer del agente, no desde el panel
// administrativo — por eso vive bajo un path propio y no exige permiso de
// 'gestionar-formularios', solo 'atender' (ver rutas).
// Arma el UNION ALL de las dos fuentes reales donde puede vivir "un
// registro ya existente" de la campaña: interacciones cerradas de Contact
// Center (CCO_INTERACCIONES) y postulantes del formulario público de
// registro (CCO_CAMPANIA_POSTULANTES — ej. Postulación Totis). Comparten
// campaña pero NO tabla ni ciclo de vida (una interacción se cierra desde
// un canal de mensajería/voz; un postulante se crea desde un formulario web
// sin login y se tipifica aparte en WEBPHONE_LLAMADAS_TIPIFICADAS) — de ahí
// que haya que unir dos queries en vez de un solo SELECT. `origen` en el
// resultado le dice al frontend de cuál tabla salió cada fila.
async function _buscarEnFuentesDeCampania(p, campaniaIds, canalIds, texto) {
  const rq = p.request();
  const paramsCamp = campaniaIds.map((id, i) => { rq.input(`camp${i}`, sql.Int, id); return `@camp${i}`; });
  const whereInteracciones = [`i.CI_ESTADO = 'cerrada'`, `i.CI_CAMPANIA_ID IN (${paramsCamp.join(',')})`];
  // Si el formulario tiene asignaciones específicas por canal (no solo
  // "cualquier canal" = FA_CANAL_ID NULL), acota también por esos canales —
  // esto solo aplica a interacciones (los postulantes no tienen canal).
  if (canalIds.length) {
    const paramsCanal = canalIds.map((id, i) => { rq.input(`can${i}`, sql.Int, id); return `@can${i}`; });
    whereInteracciones.push(`i.CI_CANAL_ID IN (${paramsCanal.join(',')})`);
  }
  rq.input('t', sql.NVarChar(200), `%${texto}%`);
  whereInteracciones.push('(i.CI_CLIENTE_NOMBRE LIKE @t OR i.CI_CLIENTE_TELEFONO LIKE @t)');

  const paramsCampPost = campaniaIds.map((id, i) => `@camp${i}`); // mismos @campN, reutilizados

  const r = await rq.query(`
    SELECT TOP 25 * FROM (
      SELECT 'interaccion' origen, i.CI_ID id, i.CI_CLIENTE_NOMBRE clienteNombre, i.CI_CLIENTE_TELEFONO clienteTelefono,
             i.CI_FECHA_CIERRE fecha, i.CI_CANAL_ID canalId, cn.CN_NOMBRE canalNombre, ti.CT_NOMBRE tipificacionNombre
      FROM dbo.CCO_INTERACCIONES i
      LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
      LEFT JOIN dbo.CCO_TIPIFICACIONES ti ON ti.CT_ID = i.CI_TIPIFICACION_ID
      WHERE ${whereInteracciones.join(' AND ')}

      UNION ALL

      -- Los postulantes (CCO_CAMPANIA_POSTULANTES) no tienen canal propio —
      -- se registraron desde el formulario web de Totis, no desde un canal
      -- del Contact Center — de ahí canalId/canalNombre NULL a propósito.
      SELECT 'postulante' origen, cp.CP_ID id, cp.CP_NOMBRE clienteNombre, cp.CP_TELEFONO clienteTelefono,
             cp.CP_FECHA_REGISTRO fecha, NULL canalId, NULL canalNombre,
             (SELECT TOP 1 WLT_TIPIFICACION FROM dbo.WEBPHONE_LLAMADAS_TIPIFICADAS WHERE WLT_POSTULANTE_ID = cp.CP_ID ORDER BY WLT_FECHA DESC) tipificacionNombre
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      WHERE cp.CP_CAMPANIA_ID IN (${paramsCampPost.join(',')})
        AND (cp.CP_NOMBRE LIKE @t OR cp.CP_TELEFONO LIKE @t)
    ) todo
    ORDER BY fecha DESC`);
  return r.recordset;
}

exports.buscarRegistrosCampoBuscador = async (req, res) => {
  try {
    const p = await pool(req);
    const { campaniaIds, canalIds } = await _campaniasYCanalesDelFormulario(p, req.params.id);
    if (!campaniaIds.length) return res.json({ success: true, data: [] });

    const texto = String(req.query.texto || '').trim();
    if (!texto) return res.json({ success: true, data: [] });

    const data = await _buscarEnFuentesDeCampania(p, campaniaIds, canalIds, texto);
    res.json({ success: true, data });
  } catch (e) {
    console.error('ccFormularios.buscarRegistrosCampoBuscador:', e.message);
    res.status(500).json({ success: false, message: 'Error al buscar registros' });
  }
};

// Registro manual de una interacción "histórica" desde el campo tipo
// 'buscador' — para cuando el agente no encuentra al cliente en el
// histórico y quiere dejar constancia del contacto actual para reportería.
// Se crea DIRECTO como 'cerrada' (sin pasar por cola/ACD, a diferencia de
// ccIngestService.ingestarMensajeCliente): no es un mensaje entrante real,
// es un registro administrativo de que el contacto ocurrió. Requiere que el
// canal pertenezca a una de las asignaciones activas del formulario, para
// no poder inyectar interacciones en campañas/canales ajenos al formulario
// que se está usando (ver validación de canalId más abajo).
exports.crearRegistroCampoBuscador = async (req, res) => {
  try {
    const uid = usuarioIdDe(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });
    const b = req.body || {};
    const clienteNombre = String(b.clienteNombre || '').trim();
    const clienteTelefono = String(b.clienteTelefono || '').trim();
    if (!clienteNombre && !clienteTelefono) {
      return res.status(400).json({ success: false, message: 'Captura al menos el nombre o el teléfono del cliente' });
    }
    const canalId = Number(b.canalId);
    if (!canalId) return res.status(400).json({ success: false, message: 'Falta el canal' });

    const p = await pool(req);
    const { campaniaIds, canalIds } = await _campaniasYCanalesDelFormulario(p, req.params.id);
    if (!campaniaIds.length) {
      return res.status(400).json({ success: false, message: 'Este formulario no tiene campañas asignadas' });
    }
    const canal = await p.request().input('id', sql.Int, canalId).query('SELECT CN_ID id, CN_CAMPANIA_ID campaniaId, CN_TIPO tipo FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    if (!canal.recordset.length) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    const canalRow = canal.recordset[0];
    // El canal debe pertenecer a una de las campañas asignadas, y si el
    // formulario tiene asignaciones acotadas a canales específicos, debe ser
    // uno de esos — mismo criterio de acotamiento que la búsqueda, aplicado
    // ahora como validación de seguridad en la escritura (nunca confiar en
    // el canalId que manda el cliente sin revalidar contra el formulario).
    if (!campaniaIds.includes(canalRow.campaniaId)) {
      return res.status(403).json({ success: false, message: 'Este canal no pertenece a las campañas asignadas al formulario' });
    }
    if (canalIds.length && !canalIds.includes(canalId)) {
      return res.status(403).json({ success: false, message: 'Este canal no está entre los canales asignados al formulario' });
    }

    const agente = await p.request().input('u', sql.Int, uid).query('SELECT NEUS_NOMBRES n FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @u');
    const agenteNombre = agente.recordset[0]?.n || null;

    const tipificacionId = b.tipificacionId ? Number(b.tipificacionId) : null;
    if (tipificacionId) {
      const tip = await p.request().input('id', sql.Int, tipificacionId).input('c', sql.Int, canalRow.campaniaId)
        .query(`SELECT 1 x FROM dbo.CCO_TIPIFICACIONES WHERE CT_ID = @id AND CT_ACTIVO = 1 AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)`);
      if (!tip.recordset.length) return res.status(400).json({ success: false, message: 'Tipificación inválida para esta campaña' });
    }

    const ins = await p.request()
      .input('canal', sql.Int, canalId)
      .input('tipo', sql.NVarChar(20), canalRow.tipo)
      .input('nombre', sql.NVarChar(160), clienteNombre || null)
      .input('tel', sql.NVarChar(40), clienteTelefono || null)
      .input('camp', sql.Int, canalRow.campaniaId)
      .input('agenteId', sql.Int, uid)
      .input('agenteNombre', sql.NVarChar(160), agenteNombre)
      .input('tip', sql.Int, tipificacionId)
      .input('com', sql.NVarChar(sql.MAX), b.comentario || null)
      .query(`INSERT INTO dbo.CCO_INTERACCIONES
                (CI_CANAL_ID, CI_TIPO, CI_CLIENTE_NOMBRE, CI_CLIENTE_TELEFONO, CI_CAMPANIA_ID,
                 CI_AGENTE_ID, CI_AGENTE_NOMBRE, CI_ESTADO, CI_TIPIFICACION_ID, CI_COMENTARIO_CIERRE,
                 CI_FECHA_INICIO, CI_FECHA_CIERRE)
              OUTPUT INSERTED.CI_ID id
              VALUES (@canal, @tipo, @nombre, @tel, @camp, @agenteId, @agenteNombre, 'cerrada', @tip, @com, GETDATE(), GETDATE())`);

    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (e) {
    console.error('ccFormularios.crearRegistroCampoBuscador:', e.message);
    res.status(500).json({ success: false, message: 'Error al registrar la interacción' });
  }
};

// ── Formulario EXTERNO (público, sin login) ──────────────────────────────
// Pensado para integrarse a VICIdial vía URL con query params, mismo patrón
// que /crm?cliente=&agente=&agenteId= (CRMPublicPage.tsx): VICIdial abre
// esta URL al conectar la llamada, sin que el agente tenga que iniciar
// sesión en AGYDA de nuevo. Como cada empresa vive en su propia BD
// (multi-tenant por pool, no por columna), y esta ruta no tiene JWT del que
// sacar req.user.empresa, hay que recorrer los tenants buscando el token —
// mismo patrón ya usado en ccSimuladorController.resolverSim.
async function _resolverFormularioPublico(token) {
  if (!token) return null;
  const { listTenants } = require('../config/tenants');
  for (const t of listTenants()) {
    try {
      const p = await databaseService.getPool(t.key);
      const r = await p.request().input('t', sql.NVarChar(64), token)
        .query(`SELECT FR_ID id, FR_NOMBRE nombre, FR_MODO modo FROM dbo.CCF_FORMULARIOS WHERE FR_TOKEN_PUBLICO = @t AND FR_ACTIVO = 1`);
      if (r.recordset.length && r.recordset[0].modo === 'externo') {
        return { pool: p, tenantKey: t.key, formularioId: r.recordset[0].id, nombre: r.recordset[0].nombre };
      }
    } catch (_) { /* siguiente tenant */ }
  }
  return null;
}

// GET /api/contact-center/formularios-publico/:token — definición completa
// de la versión publicada, para que la página pública la renderice sin
// necesitar sesión. Si el formulario vuelve a modo 'interno', el token dejar
// de resolver (código de arriba exige FR_MODO = 'externo').
exports.getFormularioPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });

    const version = await r.pool.request().input('id', sql.Int, r.formularioId)
      .query(`SELECT TOP 1 FV_ID id, FV_NUMERO numero FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = @id AND FV_ESTADO = 'publicado' ORDER BY FV_NUMERO DESC`);
    if (!version.recordset.length) return res.status(404).json({ success: false, message: 'Este formulario no tiene una versión publicada' });
    const versionId = version.recordset[0].id;

    const secciones = await r.pool.request().input('id', sql.Int, versionId).query(`
      SELECT FS_ID id, FS_TITULO titulo, FS_DESCRIPCION descripcion, FS_ORDEN orden, FS_VISIBLE visible
      FROM dbo.CCF_FORM_SECCIONES WHERE FS_VERSION_ID = @id ORDER BY FS_ORDEN`);
    const campos = await r.pool.request().input('id', sql.Int, versionId).query(`
      SELECT c.FC_ID id, c.FC_SECCION_ID seccionId, c.FC_CODIGO codigo, c.FC_TIPO tipo, c.FC_ETIQUETA etiqueta,
             c.FC_PLACEHOLDER placeholder, c.FC_AYUDA ayuda, c.FC_OBLIGATORIO obligatorio, c.FC_VISIBLE visible,
             c.FC_ORDEN orden, c.FC_ANCHO ancho, c.FC_CATALOGO_FUENTE catalogoFuente, c.FC_CONFIG_JSON configJson
      FROM dbo.CCF_FORM_CAMPOS c
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      WHERE s.FS_VERSION_ID = @id ORDER BY c.FC_ORDEN`);
    const opciones = await r.pool.request().input('id', sql.Int, versionId).query(`
      SELECT fo.FO_CAMPO_ID campoId, fo.FO_VALOR valor, fo.FO_ETIQUETA etiqueta, fo.FO_ORDEN orden
      FROM dbo.CCF_FORM_CAMPO_OPCIONES fo
      JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = fo.FO_CAMPO_ID
      JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
      WHERE s.FS_VERSION_ID = @id AND fo.FO_ACTIVO = 1 ORDER BY fo.FO_ORDEN`);

    res.json({
      success: true,
      data: {
        formularioId: r.formularioId,
        nombre: r.nombre,
        versionId,
        numero: version.recordset[0].numero,
        secciones: secciones.recordset.filter((s) => s.visible).map((s) => ({
          ...s,
          campos: campos.recordset.filter((c) => c.seccionId === s.id && c.visible).map((c) => ({
            ...c,
            opciones: opciones.recordset.filter((o) => o.campoId === c.id),
          })),
        })),
      },
    });
  } catch (e) {
    console.error('ccFormularios.getFormularioPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener el formulario' });
  }
};

// GET /api/contact-center/formularios-publico/:token/buscador?texto=&agenteId=
// Mismo criterio de acotamiento que buscarRegistrosCampoBuscador, pero
// resolviendo el formulario por token público en vez de JWT+id.
// GET /api/contact-center/formularios-publico/:token/canales-disponibles
exports.listCanalesDisponiblesPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const data = await _listCanalesDisponibles(r.pool, r.formularioId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('ccFormularios.listCanalesDisponiblesPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los canales' });
  }
};

exports.buscarRegistrosCampoBuscadorPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const texto = String(req.query.texto || '').trim();
    if (!texto) return res.json({ success: true, data: [] });

    const { campaniaIds, canalIds } = await _campaniasYCanalesDelFormulario(r.pool, r.formularioId);
    if (!campaniaIds.length) return res.json({ success: true, data: [] });

    const data = await _buscarEnFuentesDeCampania(r.pool, campaniaIds, canalIds, texto);
    res.json({ success: true, data });
  } catch (e) {
    console.error('ccFormularios.buscarRegistrosCampoBuscadorPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al buscar registros' });
  }
};

// ── Persona por teléfono: prellenado + historial ─────────────────────────
// GET /api/contact-center/formularios-publico/:token/prellenar?telefono=
// Un postulante se reconoce por su teléfono (últimos 10 dígitos: hay números
// guardados con 521 o con símbolos) en TODA la empresa, no solo en la campaña
// de este formulario: si vuelve a postularse (otra vacante, otra campaña) se
// reutilizan sus datos y se ve su historial completo.
//   valores   → datos de identidad (nombre, apellidos, correo, identificador…)
//               de su registro más reciente con formulario, copiados al campo
//               de ESTA versión con el mismo código o, si ese formulario usa
//               otros códigos, con el mismo "rol" (_rolDeCampo).
//   ultimos   → campos con configJson.mostrarUltimo: su último valor en ESTA
//               postulación (campañas del formulario); el estatus o canal de
//               otra campaña no aplican aquí.
//   historial → todos sus contactos (interacciones de cualquier formulario o
//               canal y registros del formulario web de postulantes), del más
//               reciente al más viejo. Guardar el formulario agrega uno nuevo:
//               el seguimiento no borra lo anterior.
// Fechas, horario, estatus, etc. son de cada contacto y nunca se prellenan.
const TIPOS_PRELLENABLES = new Set(['texto_corto', 'texto_largo', 'telefono', 'email']);
const ROLES_IDENTIDAD = new Set(['paterno', 'materno', 'nombres', 'nombre', 'correo', 'identificador']);
const MAX_HISTORIAL = 50;
const sqlSoloDigitos = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(${col}, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')`;

// Qué dato es un campo, por su tipo y código/etiqueta (nunca por un código
// fijo), para relacionar formularios distintos entre sí.
function _rolDeCampo(c) {
  const t = `${c.codigo || ''} ${c.etiqueta || ''}`.toLowerCase();
  if (c.tipo === 'telefono') return 'telefono';
  if (c.tipo === 'email') return 'correo';
  if (c.tipo === 'usuario_agente') return 'asesor';
  if (c.tipo === 'catalogo' && c.catalogoFuente === 'tipificaciones_campania') return 'estatus';
  if (c.tipo === 'fecha' && /asist|cita/.test(t)) return 'asistencia';
  if (c.tipo === 'texto_corto' && /paterno/.test(t)) return 'paterno';
  if (c.tipo === 'texto_corto' && /materno/.test(t)) return 'materno';
  if (c.tipo === 'texto_corto' && /^nombres?\b|nombre\(s\)/.test(t)) return 'nombres';
  if (/identif|folio|id_postulante/.test(t)) return 'identificador';
  if (/horario|hour|\bhora\b/.test(t)) return 'horario';
  if (/canal|channel/.test(t)) return 'canal';
  if (/puesto|place|vacante/.test(t)) return 'puesto';
  if (c.tipo === 'texto_corto' && /nombre|interesado/.test(t)) return 'nombre';
  return null;
}

async function _personaPorTelefono(p, formularioId, versionId, telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const tel10 = digitos.slice(-10);
  const { campaniaIds } = await _campaniasYCanalesDelFormulario(p, formularioId);
  const deEstaPostulacion = (campaniaId) => campaniaIds.includes(Number(campaniaId));

  const campos = (await p.request().input('v', sql.Int, versionId).query(`
    SELECT c.FC_ID id, c.FC_CODIGO codigo, c.FC_TIPO tipo, c.FC_ETIQUETA etiqueta,
           c.FC_CATALOGO_FUENTE catalogoFuente, c.FC_CONFIG_JSON configJson
    FROM dbo.CCF_FORM_CAMPOS c JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
    WHERE s.FS_VERSION_ID = @v`)).recordset;
  const muestraUltimo = (c) => { try { return !!JSON.parse(c.configJson || '{}').mostrarUltimo; } catch { return false; } };

  // 1) Sus interacciones, en cualquier campaña. Manda el teléfono capturado
  //    en el formulario: CI_CLIENTE_TELEFONO llegó a quedar con el número de
  //    la persona anterior (la página vieja tenía un segundo teléfono que no
  //    se limpiaba); solo si el registro no trae teléfono en el formulario se
  //    usa el de la interacción.
  const inters = (await p.request().input('t', sql.NVarChar(10), tel10).input('max', sql.Int, MAX_HISTORIAL).query(`
    WITH ids AS (
      SELECT r.FIR_INTERACCION_ID id
      FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
      JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = r.FIR_CAMPO_ID
      WHERE c.FC_TIPO = 'telefono' AND RIGHT(${sqlSoloDigitos('r.FIR_VALOR_TEXTO')}, 10) = @t
      UNION
      SELECT i.CI_ID FROM dbo.CCO_INTERACCIONES i
      WHERE RIGHT(${sqlSoloDigitos('i.CI_CLIENTE_TELEFONO')}, 10) = @t
        AND NOT EXISTS (
          SELECT 1 FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
          JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = r.FIR_CAMPO_ID
          WHERE r.FIR_INTERACCION_ID = i.CI_ID AND c.FC_TIPO = 'telefono'
            AND LEN(${sqlSoloDigitos('r.FIR_VALOR_TEXTO')}) >= 10)
    )
    SELECT TOP (@max) i.CI_ID id, i.CI_CAMPANIA_ID campaniaId, ca.CM2_NOMBRE campania, i.CI_FECHA_INICIO fecha,
           i.CI_CLIENTE_NOMBRE clienteNombre, i.CI_AGENTE_NOMBRE agenteNombre, cn.CN_NOMBRE canalNombre,
           t.CT_NOMBRE tipificacion,
           (SELECT TOP 1 fr.FR_NOMBRE FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
              JOIN dbo.CCF_FORM_VERSIONES v ON v.FV_ID = r.FIR_VERSION_ID
              JOIN dbo.CCF_FORMULARIOS fr ON fr.FR_ID = v.FV_FORMULARIO_ID
            WHERE r.FIR_INTERACCION_ID = i.CI_ID) formulario
    FROM ids JOIN dbo.CCO_INTERACCIONES i ON i.CI_ID = ids.id
    LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = i.CI_CAMPANIA_ID
    LEFT JOIN dbo.CCO_CANALES cn ON cn.CN_ID = i.CI_CANAL_ID
    LEFT JOIN dbo.CCO_TIPIFICACIONES t ON t.CT_ID = i.CI_TIPIFICACION_ID
    ORDER BY i.CI_ID DESC`)).recordset;

  // 2) Sus respuestas de formulario, con el valor ya legible y su "rol".
  const porInteraccion = new Map(); // CI_ID -> [{ codigo, rol, tipo, texto, legible }]
  if (inters.length) {
    const idsIn = inters.map((x) => Number(x.id)).filter(Number.isInteger).join(',');
    const resp = (await p.request().query(`
      SELECT r.FIR_INTERACCION_ID iid, c.FC_ID campoId, c.FC_CODIGO codigo, c.FC_TIPO tipo, c.FC_ETIQUETA etiqueta,
             c.FC_CATALOGO_FUENTE catalogoFuente, r.FIR_VALOR_TEXTO texto, r.FIR_VALOR_NUMERO numero,
             r.FIR_VALOR_FECHA fecha, r.FIR_VALOR_BOOLEANO booleano, r.FIR_VALOR_JSON json
      FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
      JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = r.FIR_CAMPO_ID
      WHERE r.FIR_INTERACCION_ID IN (${idsIn})`)).recordset;
    const opcionesPorCampo = new Map();
    const tipificaciones = new Map();
    if (resp.length) {
      const campoIds = [...new Set(resp.map((x) => Number(x.campoId)))].join(',');
      for (const o of (await p.request().query(`
        SELECT FO_CAMPO_ID campoId, FO_VALOR valor, FO_ETIQUETA etiqueta FROM dbo.CCF_FORM_CAMPO_OPCIONES
        WHERE FO_CAMPO_ID IN (${campoIds})`)).recordset) {
        if (!opcionesPorCampo.has(o.campoId)) opcionesPorCampo.set(o.campoId, new Map());
        opcionesPorCampo.get(o.campoId).set(String(o.valor), o.etiqueta);
      }
      const ctIds = [...new Set(resp.filter((x) => x.catalogoFuente === 'tipificaciones_campania')
        .map((x) => Number(x.texto ?? x.numero)).filter((n) => Number.isInteger(n) && n > 0))];
      if (ctIds.length) {
        for (const x of (await p.request().query(`SELECT CT_ID id, CT_NOMBRE nombre FROM dbo.CCO_TIPIFICACIONES WHERE CT_ID IN (${ctIds.join(',')})`)).recordset) {
          tipificaciones.set(x.id, String(x.nombre).trim());
        }
      }
    }
    for (const x of resp) {
      if (!porInteraccion.has(x.iid)) porInteraccion.set(x.iid, []);
      const v = _valorLegible({ id: x.campoId, tipo: x.tipo, catalogoFuente: x.catalogoFuente }, x, opcionesPorCampo, tipificaciones);
      porInteraccion.get(x.iid).push({
        codigo: x.codigo, tipo: x.tipo, rol: _rolDeCampo(x),
        texto: x.texto != null ? String(x.texto).trim() : null,
        legible: typeof v === 'string' ? v.trim() : v,
      });
    }
  }
  const deRol = (iid, rol) => (porInteraccion.get(iid) || []).find((x) => x.rol === rol && x.legible)?.legible ?? null;
  const nombreDe = (iid) => ['paterno', 'materno', 'nombres'].map((r) => deRol(iid, r)).filter(Boolean).join(' ') || deRol(iid, 'nombre');

  // 3) Sus registros en el formulario web de postulantes (cualquier campaña).
  const webs = (await p.request().input('t', sql.NVarChar(10), tel10).query(`
    SELECT TOP 20 cp.CP_ID id, cp.CP_CAMPANIA_ID campaniaId, ca.CM2_NOMBRE campania, cp.CP_NOMBRE nombre,
           cp.CP_CORREO correo, cp.CP_FECHA_REGISTRO fecha
    FROM dbo.CCO_CAMPANIA_POSTULANTES cp
    LEFT JOIN dbo.CCO_CAMPANIAS ca ON ca.CM2_ID = cp.CP_CAMPANIA_ID
    WHERE RIGHT(${sqlSoloDigitos('cp.CP_TELEFONO')}, 10) = @t
    ORDER BY cp.CP_ID DESC`)).recordset;

  const txt = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
  const historial = [
    ...inters.map((i) => ({
      origen: 'interaccion',
      id: i.id,
      fecha: i.fecha,
      postulacion: txt(i.formulario) || txt(i.campania) || txt(i.canalNombre) || 'Contacto',
      campania: txt(i.campania),
      estaPostulacion: deEstaPostulacion(i.campaniaId),
      nombre: nombreDe(i.id) || txt(i.clienteNombre),
      estatus: deRol(i.id, 'estatus') || txt(i.tipificacion),
      asistencia: deRol(i.id, 'asistencia'),
      horario: deRol(i.id, 'horario'),
      canal: deRol(i.id, 'canal') || txt(i.canalNombre),
      puesto: deRol(i.id, 'puesto'),
      asesor: deRol(i.id, 'asesor') || txt(i.agenteNombre),
    })),
    ...webs.map((w) => ({
      origen: 'web',
      id: w.id,
      fecha: w.fecha,
      postulacion: `Registro web${w.campania ? ` · ${String(w.campania).trim()}` : ''}`,
      campania: txt(w.campania),
      estaPostulacion: deEstaPostulacion(w.campaniaId),
      nombre: txt(w.nombre),
      estatus: null, asistencia: null, horario: null, canal: 'Página web', puesto: null, asesor: null,
    })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // 4) Identidad: su registro más reciente con formulario (cualquier campaña).
  const valores = {};
  const fuenteIdentidad = inters.find((i) => (porInteraccion.get(i.id) || []).some((x) => ROLES_IDENTIDAD.has(x.rol) && x.texto));
  if (fuenteIdentidad) {
    const resp = porInteraccion.get(fuenteIdentidad.id);
    for (const c of campos) {
      if (!TIPOS_PRELLENABLES.has(c.tipo) || muestraUltimo(c) || c.tipo === 'telefono') continue;
      const rol = _rolDeCampo(c);
      const r = resp.find((x) => x.codigo === c.codigo && TIPOS_PRELLENABLES.has(x.tipo) && x.texto)
        ?? (rol && ROLES_IDENTIDAD.has(rol) ? resp.find((x) => x.rol === rol && TIPOS_PRELLENABLES.has(x.tipo) && x.texto) : null);
      if (r) valores[c.id] = r.texto;
    }
  } else if (webs[0]) {
    // Solo registro web: nombre completo (si el formulario tiene un solo
    // campo de nombre; no se reparte en apellidos) y correo.
    for (const c of campos) {
      const rol = _rolDeCampo(c);
      if (rol === 'nombre' && webs[0].nombre) valores[c.id] = String(webs[0].nombre).trim();
      if (rol === 'correo' && webs[0].correo) valores[c.id] = String(webs[0].correo).trim();
    }
  }

  // 5) "Último guardado" de ESTA postulación, para los campos marcados.
  const ultimos = {};
  const fuenteEsta = inters.find((i) => deEstaPostulacion(i.campaniaId) && porInteraccion.has(i.id));
  if (fuenteEsta) {
    const resp = porInteraccion.get(fuenteEsta.id);
    for (const c of campos.filter(muestraUltimo)) {
      const rol = _rolDeCampo(c);
      const r = resp.find((x) => x.codigo === c.codigo && x.legible) ?? (rol ? resp.find((x) => x.rol === rol && x.legible) : null);
      if (r) ultimos[c.id] = r.legible;
    }
  }

  const reciente = historial[0] || null;
  return {
    origen: inters.length ? 'interaccion' : webs.length ? 'postulante' : null,
    nombre: (fuenteIdentidad && nombreDe(fuenteIdentidad.id)) || reciente?.nombre || null,
    fecha: reciente?.fecha ?? null,
    estatus: reciente?.estatus ?? null,
    postulacion: reciente?.postulacion ?? null,
    valores,
    ultimos,
    historial,
  };
}

exports.prellenarPorTelefonoPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const version = await r.pool.request().input('id', sql.Int, r.formularioId)
      .query(`SELECT TOP 1 FV_ID id FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = @id AND FV_ESTADO = 'publicado' ORDER BY FV_NUMERO DESC`);
    if (!version.recordset.length) return res.status(404).json({ success: false, message: 'Este formulario no tiene una versión publicada' });
    const data = await _personaPorTelefono(r.pool, r.formularioId, version.recordset[0].id, req.query.telefono);
    if (!data) return res.status(400).json({ success: false, message: 'Teléfono incompleto (mínimo 10 dígitos)' });
    res.json({ success: true, data });
  } catch (e) {
    console.error('ccFormularios.prellenarPorTelefonoPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al buscar el teléfono' });
  }
};

// ── Pendientes por contactar (citas) ────────────────────────────────────
// GET /api/contact-center/formularios-publico/:token/pendientes
// Panel del formulario externo con a quién hay que llamar. Se toma el ÚLTIMO
// registro de cada persona (por teléfono, últimos 10 dígitos) en las campañas
// del formulario — de cualquier formulario de la campaña con los mismos
// códigos de campo, así el duplicado ve lo capturado en el original — y se
// clasifica por su estatus (tipificación) y su fecha de asistencia:
//   confirmar → "Cita agendada" con fecha hoy o después
//   recordar  → "Cita confirmada" con fecha hoy o mañana
//   vencida   → "Cita agendada" con fecha que ya pasó (para reagendar)
// Los campos se detectan en la versión publicada por tipo/etiqueta (fecha de
// asistencia/cita, horario, tipificación, asesor…), no por un código fijo.
// El panel existe solo si el formulario tiene un campo tipo 'pendientes'; su
// configJson define:
//   alcance: 'todos'    → cualquier agente ve todos los pendientes;
//            'propios'  → cada agente solo los de registros donde él es el
//                         asesor (el agente de la interacción o, en registros
//                         viejos sin ese dato, el campo asesor por nombre,
//                         sin distinguir mayúsculas ni acentos). El agente
//                         viene en la liga (?agenteId=&agente=): ordena el
//                         trabajo, no es un control de seguridad.
//   grupos:  qué grupos se muestran (por defecto los 3).
const MAX_PENDIENTES = 300;
const GRUPOS_PENDIENTES = ['confirmar', 'recordar', 'vencida'];
function _configPendientes(configJson) {
  let c = {};
  try { c = JSON.parse(configJson || '{}') || {}; } catch { c = {}; }
  const grupos = Array.isArray(c.grupos) ? c.grupos.filter((g) => GRUPOS_PENDIENTES.includes(g)) : GRUPOS_PENDIENTES;
  return { alcance: c.alcance === 'propios' ? 'propios' : 'todos', grupos: grupos.length ? grupos : GRUPOS_PENDIENTES };
}

async function _pendientesPorContactar(p, formularioId, versionId, agente = {}) {
  const { campaniaIds } = await _campaniasYCanalesDelFormulario(p, formularioId);
  const campos = (await p.request().input('v', sql.Int, versionId).query(`
    SELECT c.FC_CODIGO codigo, c.FC_TIPO tipo, c.FC_ETIQUETA etiqueta, c.FC_CATALOGO_FUENTE catalogoFuente, c.FC_CONFIG_JSON configJson
    FROM dbo.CCF_FORM_CAMPOS c JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
    WHERE s.FS_VERSION_ID = @v AND c.FC_VISIBLE = 1`)).recordset;
  const campoPanel = campos.find((c) => c.tipo === 'pendientes');
  if (!campoPanel) return { disponible: false, hoy: null, pendientes: [] };
  const config = _configPendientes(campoPanel.configJson);

  // "Solo los suyos": el nombre del agente se toma de NEUS_USUARIOS si viene
  // su id (más confiable que el texto de la liga); si no, del texto.
  const agenteId = Number.isInteger(Number(agente.id)) && Number(agente.id) > 0 ? Number(agente.id) : null;
  let agenteNombre = String(agente.nombre || '').trim() || null;
  if (agenteId) {
    const u = (await p.request().input('id', sql.Int, agenteId).query('SELECT NEUS_NOMBRES n FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @id')).recordset[0];
    if (u?.n) agenteNombre = String(u.n).trim();
  }
  if (config.alcance === 'propios' && !agenteId && !agenteNombre) {
    return { disponible: true, ...config, requiereAgente: true, hoy: null, pendientes: [] };
  }
  const busca = (pred) => campos.find((c) => pred(c, `${c.codigo} ${c.etiqueta}`.toLowerCase()))?.codigo ?? null;
  const cod = {
    asis: busca((c, t) => c.tipo === 'fecha' && /asist|cita/.test(t)),
    est: busca((c) => c.tipo === 'catalogo' && c.catalogoFuente === 'tipificaciones_campania'),
    tel: busca((c) => c.tipo === 'telefono'),
    hora: busca((_, t) => /horario|hour|\bhora\b/.test(t)),
    asesor: busca((c) => c.tipo === 'usuario_agente'),
    pat: busca((c, t) => c.tipo === 'texto_corto' && /paterno/.test(t)),
    mat: busca((c, t) => c.tipo === 'texto_corto' && /materno/.test(t)),
    nom: busca((c, t) => c.tipo === 'texto_corto' && /^nombres?\b|nombre\(s\)/.test(t)),
    puesto: busca((_, t) => /puesto|place|vacante/.test(t)),
  };
  if (!campaniaIds.length || !cod.asis || !cod.est) return { disponible: false, hoy: null, pendientes: [] };

  const campIn = campaniaIds.map(Number).filter(Number.isInteger).join(',');
  const rq = p.request().input('max', sql.Int, MAX_PENDIENTES)
    .input('propios', sql.Bit, config.alcance === 'propios')
    .input('aid', sql.Int, agenteId)
    .input('anom', sql.NVarChar(200), agenteNombre);
  for (const [k, v] of Object.entries(cod)) rq.input(`c_${k}`, sql.NVarChar(80), v ?? '__sin_campo__');
  const r = await rq.query(`
    WITH r AS (
      SELECT x.FIR_INTERACCION_ID iid, c.FC_CODIGO cod, x.FIR_VALOR_TEXTO t, x.FIR_VALOR_FECHA f
      FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS x
      JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = x.FIR_CAMPO_ID
      JOIN dbo.CCO_INTERACCIONES i ON i.CI_ID = x.FIR_INTERACCION_ID
      WHERE i.CI_CAMPANIA_ID IN (${campIn})
        AND c.FC_CODIGO IN (@c_asis, @c_est, @c_tel, @c_hora, @c_asesor, @c_pat, @c_mat, @c_nom, @c_puesto)
    ), p AS (
      SELECT iid,
        MAX(CASE WHEN cod = @c_asis THEN f END) asis,
        MAX(CASE WHEN cod = @c_est THEN t END) est,
        MAX(CASE WHEN cod = @c_tel THEN t END) tel,
        MAX(CASE WHEN cod = @c_hora THEN t END) hora,
        MAX(CASE WHEN cod = @c_asesor THEN t END) asesor,
        MAX(CASE WHEN cod = @c_pat THEN t END) pat,
        MAX(CASE WHEN cod = @c_mat THEN t END) mat,
        MAX(CASE WHEN cod = @c_nom THEN t END) nom,
        MAX(CASE WHEN cod = @c_puesto THEN t END) puesto
      FROM r GROUP BY iid
    ), b AS (
      SELECT p.*, i.CI_FECHA_INICIO fecha, i.CI_CLIENTE_NOMBRE clienteNombre, i.CI_AGENTE_NOMBRE agenteNombre, i.CI_AGENTE_ID agenteId,
             COALESCE(NULLIF(LTRIM(RTRIM(p.tel)), ''), i.CI_CLIENTE_TELEFONO) telefono,
             COALESCE(TRY_CAST(p.est AS INT), i.CI_TIPIFICACION_ID) tip,
             RIGHT(${sqlSoloDigitos("COALESCE(NULLIF(LTRIM(RTRIM(p.tel)), ''), i.CI_CLIENTE_TELEFONO)")}, 10) tel10
      FROM p JOIN dbo.CCO_INTERACCIONES i ON i.CI_ID = p.iid
    ), u AS (
      SELECT b.*, ROW_NUMBER() OVER (PARTITION BY tel10 ORDER BY iid DESC) rn FROM b WHERE LEN(tel10) = 10
    )
    SELECT TOP (@max) u.iid, u.telefono, u.tel10, u.asis, u.hora, u.asesor, u.pat, u.mat, u.nom, u.puesto,
           u.fecha, u.clienteNombre, u.agenteNombre, t.CT_NOMBRE estatus,
           CASE WHEN t.CT_NOMBRE LIKE '%confirm%' THEN 'recordar'
                WHEN CAST(u.asis AS date) >= CAST(GETDATE() AS date) THEN 'confirmar'
                ELSE 'vencida' END grupo
    FROM u JOIN dbo.CCO_TIPIFICACIONES t ON t.CT_ID = u.tip
    WHERE u.rn = 1 AND u.asis IS NOT NULL AND (
      (t.CT_NOMBRE LIKE '%agendad%' AND t.CT_NOMBRE NOT LIKE '%confirm%')
      OR (t.CT_NOMBRE LIKE '%confirm%'
          AND CAST(u.asis AS date) BETWEEN CAST(GETDATE() AS date) AND DATEADD(DAY, 1, CAST(GETDATE() AS date))))
      -- "Solo los suyos": el asesor de su registro más reciente es este agente.
      AND (@propios = 0
        OR (@aid IS NOT NULL AND u.agenteId = @aid)
        OR (@anom IS NOT NULL AND LTRIM(RTRIM(COALESCE(NULLIF(LTRIM(RTRIM(u.asesor)), ''), u.agenteNombre))) COLLATE Latin1_General_CI_AI
                                  = LTRIM(RTRIM(@anom)) COLLATE Latin1_General_CI_AI))
    ORDER BY CASE WHEN CAST(u.asis AS date) >= CAST(GETDATE() AS date) THEN 0 ELSE 1 END,
             CASE WHEN CAST(u.asis AS date) >= CAST(GETDATE() AS date) THEN u.asis END ASC,
             u.asis DESC, u.hora;
    SELECT CONVERT(varchar(10), GETDATE(), 23) hoy;`);
  const txt = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
  return {
    disponible: true,
    ...config,
    agente: config.alcance === 'propios' ? agenteNombre : null,
    hoy: r.recordsets[1][0].hoy,
    pendientes: r.recordsets[0].filter((x) => config.grupos.includes(x.grupo)).map((x) => ({
      interaccionId: x.iid,
      grupo: x.grupo,
      telefono: txt(x.telefono),
      nombre: [txt(x.pat), txt(x.mat), txt(x.nom)].filter(Boolean).join(' ') || txt(x.clienteNombre),
      fechaAsistencia: new Date(x.asis).toISOString().slice(0, 10), // fecha sin hora, cortada en UTC
      horario: txt(x.hora),
      puesto: txt(x.puesto),
      estatus: txt(x.estatus),
      asesor: txt(x.asesor) || txt(x.agenteNombre),
      ultimoContacto: x.fecha,
    })),
  };
}

exports.pendientesPorContactarPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const version = await r.pool.request().input('id', sql.Int, r.formularioId)
      .query(`SELECT TOP 1 FV_ID id FROM dbo.CCF_FORM_VERSIONES WHERE FV_FORMULARIO_ID = @id AND FV_ESTADO = 'publicado' ORDER BY FV_NUMERO DESC`);
    if (!version.recordset.length) return res.status(404).json({ success: false, message: 'Este formulario no tiene una versión publicada' });
    const agente = { id: req.query.agenteId, nombre: req.query.agente };
    res.json({ success: true, data: await _pendientesPorContactar(r.pool, r.formularioId, version.recordset[0].id, agente) });
  } catch (e) {
    console.error('ccFormularios.pendientesPorContactarPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los pendientes' });
  }
};

// POST /api/contact-center/formularios-publico/:token/buscador/registrar
// Mismo comportamiento que crearRegistroCampoBuscador, pero el "agente" no
// sale de req.user (no hay sesión) sino del body — agenteId/agenteNombre,
// que en la integración real vienen de los query params que VICIdial ya
// manda hoy a /crm (?agente=&agenteId=). Si no se manda agenteId válido, el
// registro queda sin agente asociado en vez de fallar — más útil que
// bloquear el registro de un contacto real por un dato secundario.
exports.crearRegistroCampoBuscadorPublico = async (req, res) => {
  try {
    const r = await _resolverFormularioPublico(req.params.token);
    if (!r) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const b = req.body || {};
    const clienteNombre = String(b.clienteNombre || '').trim();
    const clienteTelefono = String(b.clienteTelefono || '').trim();
    if (!clienteNombre && !clienteTelefono) {
      return res.status(400).json({ success: false, message: 'Captura al menos el nombre o el teléfono del cliente' });
    }
    const canalId = Number(b.canalId);
    if (!canalId) return res.status(400).json({ success: false, message: 'Falta el canal' });

    const { campaniaIds, canalIds } = await _campaniasYCanalesDelFormulario(r.pool, r.formularioId);
    if (!campaniaIds.length) return res.status(400).json({ success: false, message: 'Este formulario no tiene campañas asignadas' });

    const canal = await r.pool.request().input('id', sql.Int, canalId)
      .query('SELECT CN_ID id, CN_CAMPANIA_ID campaniaId, CN_TIPO tipo FROM dbo.CCO_CANALES WHERE CN_ID = @id');
    if (!canal.recordset.length) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    const canalRow = canal.recordset[0];
    if (!campaniaIds.includes(canalRow.campaniaId)) {
      return res.status(403).json({ success: false, message: 'Este canal no pertenece a las campañas asignadas al formulario' });
    }
    if (canalIds.length && !canalIds.includes(canalId)) {
      return res.status(403).json({ success: false, message: 'Este canal no está entre los canales asignados al formulario' });
    }

    const agenteId = Number(b.agenteId) || null;
    let agenteNombre = String(b.agenteNombre || '').trim() || null;
    if (agenteId && !agenteNombre) {
      const ag = await r.pool.request().input('u', sql.Int, agenteId).query('SELECT NEUS_NOMBRES n FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @u');
      agenteNombre = ag.recordset[0]?.n || null;
    }

    const ins = await r.pool.request()
      .input('canal', sql.Int, canalId)
      .input('tipo', sql.NVarChar(20), canalRow.tipo)
      .input('nombre', sql.NVarChar(160), clienteNombre || null)
      .input('tel', sql.NVarChar(40), clienteTelefono || null)
      .input('camp', sql.Int, canalRow.campaniaId)
      .input('agenteId', sql.Int, agenteId)
      .input('agenteNombre', sql.NVarChar(160), agenteNombre)
      .input('com', sql.NVarChar(sql.MAX), b.comentario || null)
      .query(`INSERT INTO dbo.CCO_INTERACCIONES
                (CI_CANAL_ID, CI_TIPO, CI_CLIENTE_NOMBRE, CI_CLIENTE_TELEFONO, CI_CAMPANIA_ID,
                 CI_AGENTE_ID, CI_AGENTE_NOMBRE, CI_ESTADO, CI_COMENTARIO_CIERRE, CI_FECHA_INICIO, CI_FECHA_CIERRE)
              OUTPUT INSERTED.CI_ID id
              VALUES (@canal, @tipo, @nombre, @tel, @camp, @agenteId, @agenteNombre, 'cerrada', @com, GETDATE(), GETDATE())`);

    res.status(201).json({ success: true, data: { id: ins.recordset[0].id } });
  } catch (e) {
    console.error('ccFormularios.crearRegistroCampoBuscadorPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al registrar la interacción' });
  }
};

// ── Guardar respuestas de una atención (interno) ─────────────────────────
// Tipos con esquema flexible pero consultable (ver
// schemaService.ensureFormulariosAtencionSchema): cada respuesta llena UNA
// columna de valor según el tipo de campo, nunca todo como texto plano.
const TIPO_A_COLUMNA_VALOR = {
  numero: 'numero', moneda: 'numero', porcentaje: 'numero',
  fecha: 'fecha', hora: 'fecha', fecha_hora: 'fecha',
  si_no: 'booleano', checkbox: 'booleano',
  multiseleccion: 'json',
};
function _columnaValorDe(tipo) {
  return TIPO_A_COLUMNA_VALOR[tipo] || 'texto';
}

// Inserta/actualiza una respuesta contra (interaccionId, campoId) — MERGE
// en vez de "borrar todo e insertar de nuevo" (como setTipificacionesDelFormulario)
// porque aquí sí importa poder reabrir un registro más adelante y solo
// tocar los campos que cambiaron, sin perder created_at de los que no.
async function _guardarRespuestaEnTx(tx, interaccionId, versionId, campoId, tipo, valorCrudo, uid) {
  const columna = _columnaValorDe(tipo);
  const req = new sql.Request(tx)
    .input('int', sql.Int, interaccionId)
    .input('ver', sql.Int, versionId)
    .input('campo', sql.Int, campoId)
    .input('uid', sql.Int, uid || null);

  let colSql, valInput;
  if (valorCrudo === null || valorCrudo === undefined || valorCrudo === '') {
    // Guardamos la fila igual (con todos los valores NULL) para dejar
    // constancia de que el campo se visitó, aunque quedara vacío — así
    // "obligatorio pero vacío" es detectable después sin ambigüedad frente
    // a "nunca se mostró este campo".
    colSql = 'FIR_VALOR_TEXTO'; valInput = null;
  } else if (columna === 'numero') {
    colSql = 'FIR_VALOR_NUMERO'; valInput = Number(valorCrudo);
    if (!Number.isFinite(valInput)) { colSql = 'FIR_VALOR_TEXTO'; valInput = String(valorCrudo); }
  } else if (columna === 'fecha') {
    const d = new Date(valorCrudo);
    colSql = 'FIR_VALOR_FECHA'; valInput = Number.isNaN(d.getTime()) ? null : d;
  } else if (columna === 'booleano') {
    colSql = 'FIR_VALOR_BOOLEANO'; valInput = !!valorCrudo && valorCrudo !== 'false' && valorCrudo !== 'no';
  } else if (columna === 'json') {
    colSql = 'FIR_VALOR_JSON'; valInput = JSON.stringify(valorCrudo);
  } else {
    colSql = 'FIR_VALOR_TEXTO'; valInput = String(valorCrudo);
  }

  if (colSql === 'FIR_VALOR_NUMERO') req.input('v', sql.Decimal(18, 4), valInput);
  else if (colSql === 'FIR_VALOR_FECHA') req.input('v', sql.DateTime, valInput);
  else if (colSql === 'FIR_VALOR_BOOLEANO') req.input('v', sql.Bit, valInput);
  else req.input('v', sql.NVarChar(sql.MAX), valInput);

  // Resetear a NULL las otras 3 columnas de valor (nunca la que se va a
  // escribir — SQL Server rechaza asignar la misma columna dos veces en un
  // SET, error real encontrado al probar esto con colSql='FIR_VALOR_TEXTO').
  const otrasColumnas = ['FIR_VALOR_TEXTO', 'FIR_VALOR_NUMERO', 'FIR_VALOR_FECHA', 'FIR_VALOR_BOOLEANO', 'FIR_VALOR_JSON']
    .filter((c) => c !== colSql)
    .map((c) => `${c} = NULL`)
    .join(', ');

  await req.query(`
    MERGE dbo.CCF_INTERACCION_FORM_RESPUESTAS AS t
    USING (SELECT @int i, @campo c) s ON t.FIR_INTERACCION_ID = s.i AND t.FIR_CAMPO_ID = s.c
    WHEN MATCHED THEN UPDATE SET
      ${otrasColumnas}, ${colSql} = @v, FIR_ACTUALIZADO_POR = @uid, FIR_FECHA_ACTUALIZACION = GETDATE()
    WHEN NOT MATCHED THEN INSERT (FIR_INTERACCION_ID, FIR_VERSION_ID, FIR_CAMPO_ID, ${colSql}, FIR_CREADO_POR)
      VALUES (@int, @ver, @campo, @v, @uid);
  `);
}

// POST /formularios/versiones/:versionId/respuestas — guarda TODAS las
// respuestas capturadas por el agente de una sola vez. Si no se manda
// interaccionId, crea una interacción nueva (mismo criterio de
// campaña/canal que crearRegistroCampoBuscador) — así el botón "Guardar" del
// formulario funciona igual sea la primera vez o una reapertura.
// Transaccional: si falla guardar una sola respuesta, no se guarda ninguna
// ni se deja una interacción a medio crear sin sus respuestas.
// Núcleo compartido entre el guardado autenticado (exports.guardarRespuestas)
// y el público sin sesión (exports.guardarRespuestasPublico) — mismo motivo
// que _campaniasYCanalesDelFormulario: la única diferencia real entre ambos
// caminos es de dónde sale el "agente" (JWT vs body/query), todo lo demás
// (transacción, validación de campos, creación de interacción) es idéntico.
// agenteInfo = { uid, nombre } — uid puede ser null en el camino público
// (VICIdial no siempre manda agenteId), y ahí la interacción queda sin
// agente asociado en vez de fallar.
async function _guardarRespuestasCore(p, versionId, formularioId, agenteInfo, b) {
  const respuestas = Array.isArray(b.respuestas) ? b.respuestas : [];

  const camposValidos = await p.request().input('id', sql.Int, versionId).query(`
    SELECT c.FC_ID id, c.FC_CODIGO codigo, c.FC_ETIQUETA etiqueta, c.FC_TIPO tipo, c.FC_OBLIGATORIO obligatorio, c.FC_CATALOGO_FUENTE catalogoFuente
    FROM dbo.CCF_FORM_CAMPOS c JOIN dbo.CCF_FORM_SECCIONES s ON s.FS_ID = c.FC_SECCION_ID
    WHERE s.FS_VERSION_ID = @id`);
  const mapaCampos = new Map(camposValidos.recordset.map((c) => [c.id, c]));
  const respuestasValidas = respuestas.filter((r) => mapaCampos.has(Number(r.campoId)));

  // Deriva nombre/teléfono de las respuestas del formulario cuando no vienen
  // explícitos en el body — bug real encontrado 2026-09-09: el bloque "Datos
  // del cliente" del frontend es un formulario aparte de los campos propios
  // (Nombre Interesado/Teléfono Interesado); si el agente solo llena estos
  // últimos y deja vacío el bloque de arriba, el teléfono nunca llegaba a
  // CI_CLIENTE_TELEFONO aunque sí quedara guardado como respuesta de campo.
  // Mismo criterio de detección por TIPO que ya usa el frontend para
  // autocompletar (nunca por código específico, para que aplique a
  // cualquier formulario).
  const campoTelefono = camposValidos.recordset.find((c) => c.tipo === 'telefono');
  const respuestaDe = (campo) => campo && respuestasValidas.find((r) => Number(r.campoId) === campo.id)?.valor;

  // Nombre del cliente: si el formulario separa Apellido paterno/Apellido
  // materno/Nombre(s) en campos independientes (caso de Reclutamiento Totis,
  // 2026-09-10 — se necesitaba ese orden fijo para "Gestión por asesor" y
  // demás reportes), se arma "Paterno Materno Nombre(s)" a partir de esos 3.
  // Si no existen esos campos, cae al criterio viejo de un solo campo tipo
  // texto_corto con "nombre"/"interesado" en código o etiqueta, para no
  // romper formularios ya existentes que no separan el nombre así.
  const campoApellidoPaterno = camposValidos.recordset.find((c) => c.tipo === 'texto_corto' && /apellido.?paterno/i.test(`${c.codigo} ${c.etiqueta}`));
  const campoApellidoMaterno = camposValidos.recordset.find((c) => c.tipo === 'texto_corto' && /apellido.?materno/i.test(`${c.codigo} ${c.etiqueta}`));
  const campoNombrePila = camposValidos.recordset.find((c) => c.tipo === 'texto_corto' && /^nombre(s)?$|nombre.?\(?s\)?$/i.test(`${c.codigo} ${c.etiqueta}`.trim()));
  const nombreEstructurado = () => {
    if (!campoApellidoPaterno && !campoApellidoMaterno && !campoNombrePila) return null;
    const partes = [respuestaDe(campoApellidoPaterno), respuestaDe(campoApellidoMaterno), respuestaDe(campoNombrePila)]
      .map((v) => String(v || '').trim()).filter(Boolean);
    return partes.length ? partes.join(' ') : null;
  };
  const campoNombre = campoApellidoPaterno || campoApellidoMaterno || campoNombrePila
    ? null
    : camposValidos.recordset.find((c) => c.tipo === 'texto_corto' && /nombre|interesado/i.test(`${c.codigo} ${c.etiqueta}`))
      ?? camposValidos.recordset.find((c) => c.tipo === 'texto_corto');
  const nombreDeRespuestas = () => nombreEstructurado() ?? respuestaDe(campoNombre);

  // Detecta el campo tipo 'catalogo' cuya fuente es 'tipificaciones_campania'
  // — su respuesta guarda el CT_ID (ver getOpcionesCatalogoDinamico: opciones
  // como {valor: String(t.id), etiqueta: t.nombre}), y ese CT_ID es lo que
  // debe quedar en CI_TIPIFICACION_ID de la interacción. Bug real encontrado
  // 2026-09-09: esa respuesta se guardaba en CCF_INTERACCION_FORM_RESPUESTAS
  // pero nunca se reflejaba en CCO_INTERACCIONES, por eso Suite de Reportes
  // (que lee CI_TIPIFICACION_ID, no las respuestas del formulario) siempre
  // la veía vacía.
  const campoTipificacion = camposValidos.recordset.find((c) => c.tipo === 'catalogo' && c.catalogoFuente === 'tipificaciones_campania');
  const tipificacionIdDetectada = (() => {
    const v = respuestaDe(campoTipificacion);
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  let interaccionId = b.interaccionId ? Number(b.interaccionId) : null;

  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    if (!interaccionId) {
      // Crear interacción — mismo criterio de campaña/canal que
      // crearRegistroCampoBuscador, validado dentro de esta misma
      // transacción para que "interacción creada sin respuestas" nunca
      // quede como estado intermedio si algo falla después.
      const clienteNombre = String(b.clienteNombre || nombreDeRespuestas() || '').trim();
      const clienteTelefono = String(b.clienteTelefono || respuestaDe(campoTelefono) || '').trim();
      const canalId = Number(b.canalId);
      if (!canalId) { await tx.rollback(); return { error: [400, 'Falta el canal'] }; }

      const { campaniaIds, canalIds } = await _campaniasYCanalesDelFormulario(p, formularioId);
      if (!campaniaIds.length) { await tx.rollback(); return { error: [400, 'Este formulario no tiene campañas asignadas'] }; }
      const canal = await new sql.Request(tx).input('id', sql.Int, canalId)
        .query('SELECT CN_ID id, CN_CAMPANIA_ID campaniaId, CN_TIPO tipo FROM dbo.CCO_CANALES WHERE CN_ID = @id');
      if (!canal.recordset.length) { await tx.rollback(); return { error: [404, 'Canal no encontrado'] }; }
      const canalRow = canal.recordset[0];
      if (!campaniaIds.includes(canalRow.campaniaId) || (canalIds.length && !canalIds.includes(canalId))) {
        await tx.rollback();
        return { error: [403, 'Este canal no está asignado al formulario'] };
      }

      // La tipificación detectada debe pertenecer a la campaña real de esta
      // interacción (o ser una global CT_CAMPANIA_ID NULL) — nunca confiar
      // en el CT_ID que manda el cliente sin revalidarlo contra la campaña.
      let tipificacionIdValidada = null;
      if (tipificacionIdDetectada) {
        const tip = await new sql.Request(tx).input('id', sql.Int, tipificacionIdDetectada).input('c', sql.Int, canalRow.campaniaId)
          .query(`SELECT 1 x FROM dbo.CCO_TIPIFICACIONES WHERE CT_ID = @id AND CT_ACTIVO = 1 AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)`);
        if (tip.recordset.length) tipificacionIdValidada = tipificacionIdDetectada;
      }

      let agenteNombre = agenteInfo.nombre || null;
      if (agenteInfo.uid && !agenteNombre) {
        const ag = await new sql.Request(tx).input('u', sql.Int, agenteInfo.uid).query('SELECT NEUS_NOMBRES n FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @u');
        agenteNombre = ag.recordset[0]?.n || null;
      }
      const ins = await new sql.Request(tx)
        .input('canal', sql.Int, canalId).input('tipo', sql.NVarChar(20), canalRow.tipo)
        .input('nombre', sql.NVarChar(160), clienteNombre || null).input('tel', sql.NVarChar(40), clienteTelefono || null)
        .input('camp', sql.Int, canalRow.campaniaId).input('agenteId', sql.Int, agenteInfo.uid || null)
        .input('agenteNombre', sql.NVarChar(160), agenteNombre)
        .input('tip', sql.Int, tipificacionIdValidada)
        .query(`INSERT INTO dbo.CCO_INTERACCIONES
                  (CI_CANAL_ID, CI_TIPO, CI_CLIENTE_NOMBRE, CI_CLIENTE_TELEFONO, CI_CAMPANIA_ID, CI_AGENTE_ID, CI_AGENTE_NOMBRE, CI_ESTADO, CI_TIPIFICACION_ID, CI_FECHA_INICIO, CI_FECHA_CIERRE)
                OUTPUT INSERTED.CI_ID id
                VALUES (@canal, @tipo, @nombre, @tel, @camp, @agenteId, @agenteNombre, 'cerrada', @tip, GETDATE(), GETDATE())`);
      interaccionId = ins.recordset[0].id;
    } else {
      // Reabrir/re-guardar sobre una interacción existente (creada antes por
      // el Buscador o un guardado previo). Dos sincronizaciones independientes,
      // cada una solo si aplica — antes solo corría la de tipificación (y solo
      // si tipificacionIdDetectada), así que nombre/teléfono capturados en un
      // guardado posterior al alta nunca llegaban a CI_CLIENTE_NOMBRE/TELEFONO,
      // aunque sí quedaran en CCF_INTERACCION_FORM_RESPUESTAS — bug real
      // encontrado 2026-09-10: Suite de Reportes lee CI_CLIENTE_TELEFONO
      // directo, así que esas interacciones aparecían sin teléfono.
      const actual = await new sql.Request(tx).input('id', sql.Int, interaccionId)
        .query('SELECT CI_CAMPANIA_ID campaniaId, CI_CLIENTE_NOMBRE nombre, CI_CLIENTE_TELEFONO telefono FROM dbo.CCO_INTERACCIONES WHERE CI_ID = @id');
      const actualRow = actual.recordset[0];

      if (tipificacionIdDetectada && actualRow?.campaniaId) {
        const tip = await new sql.Request(tx).input('id', sql.Int, tipificacionIdDetectada).input('c', sql.Int, actualRow.campaniaId)
          .query(`SELECT 1 x FROM dbo.CCO_TIPIFICACIONES WHERE CT_ID = @id AND CT_ACTIVO = 1 AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)`);
        if (tip.recordset.length) {
          await new sql.Request(tx).input('id', sql.Int, interaccionId).input('tip', sql.Int, tipificacionIdDetectada)
            .query('UPDATE dbo.CCO_INTERACCIONES SET CI_TIPIFICACION_ID = @tip WHERE CI_ID = @id');
        }
      }

      const nombreNuevo = String(b.clienteNombre || nombreDeRespuestas() || '').trim();
      const telefonoNuevo = String(b.clienteTelefono || respuestaDe(campoTelefono) || '').trim();
      // Solo rellena lo que esté vacío — nunca pisa un nombre/teléfono que
      // ya tenga la interacción (p.ej. capturado directo en el Buscador).
      if (actualRow && (!actualRow.nombre && nombreNuevo) || (!actualRow?.telefono && telefonoNuevo)) {
        await new sql.Request(tx)
          .input('id', sql.Int, interaccionId)
          .input('nombre', sql.NVarChar(160), (!actualRow.nombre && nombreNuevo) ? nombreNuevo : actualRow.nombre)
          .input('tel', sql.NVarChar(40), (!actualRow.telefono && telefonoNuevo) ? telefonoNuevo : actualRow.telefono)
          .query('UPDATE dbo.CCO_INTERACCIONES SET CI_CLIENTE_NOMBRE = @nombre, CI_CLIENTE_TELEFONO = @tel WHERE CI_ID = @id');
      }
    }

    for (const r of respuestasValidas) {
      const campo = mapaCampos.get(Number(r.campoId));
      await _guardarRespuestaEnTx(tx, interaccionId, versionId, Number(r.campoId), campo.tipo, r.valor, agenteInfo.uid);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  // Acciones sugeridas (fuera de la transacción — son solo lectura del
  // catálogo, no afectan la atomicidad del guardado).
  const acciones = await p.request().input('id', sql.Int, formularioId).query(`
    SELECT FAP_ID id, FAP_TIPO tipo, FAP_ETIQUETA etiqueta, FAP_DESCRIPCION descripcion, FAP_ORDEN orden
    FROM dbo.CCF_FORM_ACCIONES_POST WHERE FAP_FORMULARIO_ID = @id AND FAP_ACTIVO = 1 ORDER BY FAP_ORDEN`);

  return { interaccionId, acciones: acciones.recordset };
}

exports.guardarRespuestas = async (req, res) => {
  try {
    const uid = usuarioIdDe(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });
    const p = await pool(req);

    const version = await p.request().input('id', sql.Int, req.params.versionId)
      .query('SELECT FV_ID id, FV_FORMULARIO_ID formularioId FROM dbo.CCF_FORM_VERSIONES WHERE FV_ID = @id');
    if (!version.recordset.length) return res.status(404).json({ success: false, message: 'Versión no encontrada' });

    const r = await _guardarRespuestasCore(p, Number(req.params.versionId), version.recordset[0].formularioId, { uid, nombre: null }, req.body || {});
    if (r.error) return res.status(r.error[0]).json({ success: false, message: r.error[1] });
    res.json({ success: true, data: { interaccionId: r.interaccionId, acciones: r.acciones } });
  } catch (e) {
    console.error('ccFormularios.guardarRespuestas:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar el registro' });
  }
};

// GET /formularios/versiones/:versionId/respuestas/:interaccionId — para
// reabrir un registro guardado (continuar editándolo).
exports.getRespuestas = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.interaccionId).query(`
      SELECT FIR_CAMPO_ID campoId, FIR_VALOR_TEXTO texto, FIR_VALOR_NUMERO numero,
             FIR_VALOR_FECHA fecha, FIR_VALOR_BOOLEANO booleano, FIR_VALOR_JSON json
      FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS WHERE FIR_INTERACCION_ID = @id`);
    const data = r.recordset.map((row) => ({
      campoId: row.campoId,
      valor: row.texto ?? row.numero ?? row.fecha ?? row.booleano ?? (row.json ? JSON.parse(row.json) : null),
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('ccFormularios.getRespuestas:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener las respuestas' });
  }
};

// ── Acciones sugeridas después de guardar ────────────────────────────────
exports.listAccionesPost = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, req.params.id).query(`
      SELECT FAP_ID id, FAP_TIPO tipo, FAP_ETIQUETA etiqueta, FAP_DESCRIPCION descripcion, FAP_ORDEN orden, FAP_ACTIVO activo
      FROM dbo.CCF_FORM_ACCIONES_POST WHERE FAP_FORMULARIO_ID = @id ORDER BY FAP_ORDEN`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('ccFormularios.listAccionesPost:', e.message);
    res.status(500).json({ success: false, message: 'Error al listar acciones' });
  }
};

const TIPOS_ACCION_POST_VALIDOS = ['create_followup', 'return_to_queue', 'send_whatsapp', 'send_sms', 'send_email', 'call_webhook', 'change_customer_status', 'change_stage', 'custom'];

exports.createAccionPost = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    if (!TIPOS_ACCION_POST_VALIDOS.includes(b.tipo)) return res.status(400).json({ success: false, message: 'Tipo de acción inválido' });
    if (!String(b.etiqueta || '').trim()) return res.status(400).json({ success: false, message: 'Falta la etiqueta' });
    const p = await pool(req);
    const r = await p.request()
      .input('id', sql.Int, req.params.id).input('tipo', sql.NVarChar(30), b.tipo)
      .input('et', sql.NVarChar(200), String(b.etiqueta).trim()).input('desc', sql.NVarChar(500), b.descripcion || null)
      .input('ord', sql.Int, b.orden ?? 0)
      .query(`INSERT INTO dbo.CCF_FORM_ACCIONES_POST (FAP_FORMULARIO_ID, FAP_TIPO, FAP_ETIQUETA, FAP_DESCRIPCION, FAP_ORDEN)
              OUTPUT INSERTED.FAP_ID id VALUES (@id, @tipo, @et, @desc, @ord)`);
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) {
    console.error('ccFormularios.createAccionPost:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la acción' });
  }
};

exports.deleteAccionPost = async (req, res) => {
  try {
    if (!esGestor(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const p = await pool(req);
    await p.request().input('id', sql.Int, req.params.id).query('UPDATE dbo.CCF_FORM_ACCIONES_POST SET FAP_ACTIVO = 0 WHERE FAP_ID = @id');
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.deleteAccionPost:', e.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la acción' });
  }
};

// Marca una acción como ejecutada/hecha por el agente para una interacción
// concreta — hoy es solo bitácora manual (el agente confirma que llamó,
// mandó el WhatsApp, etc. por fuera de AGYDA); el ejecutor automático real
// es un paso posterior desacoplado de este endpoint.
exports.marcarAccionEjecutada = async (req, res) => {
  try {
    const uid = usuarioIdDe(req);
    const p = await pool(req);
    const accion = await p.request().input('id', sql.Int, req.params.accionId).query('SELECT 1 x FROM dbo.CCF_FORM_ACCIONES_POST WHERE FAP_ID = @id AND FAP_ACTIVO = 1');
    if (!accion.recordset.length) return res.status(404).json({ success: false, message: 'Acción no encontrada' });
    await p.request().input('int', sql.Int, req.params.interaccionId).input('acc', sql.Int, req.params.accionId).input('u', sql.Int, uid || null)
      .query('INSERT INTO dbo.CCF_INTERACCION_ACCIONES_EJECUTADAS (FAE_INTERACCION_ID, FAE_ACCION_ID, FAE_USUARIO_ID) VALUES (@int, @acc, @u)');
    res.json({ success: true });
  } catch (e) {
    console.error('ccFormularios.marcarAccionEjecutada:', e.message);
    res.status(500).json({ success: false, message: 'Error al marcar la acción' });
  }
};

// POST /formularios-publico/:token/respuestas — mismo comportamiento que
// guardarRespuestas, pero resolviendo el formulario por token público (sin
// JWT). El "agente" sale de agenteId/agenteNombre en el body — en la
// integración real vienen de los query params que VICIdial ya manda hoy
// (?agente=&agenteId=), igual que en crearRegistroCampoBuscadorPublico.
exports.guardarRespuestasPublico = async (req, res) => {
  try {
    const r0 = await _resolverFormularioPublico(req.params.token);
    if (!r0) return res.status(404).json({ success: false, message: 'Formulario no disponible' });
    const b = req.body || {};
    const versionId = Number(req.params.versionId);

    // El versionId siempre debe pertenecer al formulario resuelto por el
    // token — nunca confiar en que el cliente mande el par correcto.
    const version = await r0.pool.request().input('id', sql.Int, versionId)
      .query('SELECT FV_ID id, FV_FORMULARIO_ID formularioId FROM dbo.CCF_FORM_VERSIONES WHERE FV_ID = @id');
    if (!version.recordset.length || version.recordset[0].formularioId !== r0.formularioId) {
      return res.status(404).json({ success: false, message: 'Versión no encontrada para este formulario' });
    }

    const agenteId = Number(b.agenteId) || null;
    const agenteNombre = String(b.agenteNombre || '').trim() || null;
    const rr = await _guardarRespuestasCore(r0.pool, versionId, r0.formularioId, { uid: agenteId, nombre: agenteNombre }, b);
    if (rr.error) return res.status(rr.error[0]).json({ success: false, message: rr.error[1] });
    res.json({ success: true, data: { interaccionId: rr.interaccionId, acciones: rr.acciones } });
  } catch (e) {
    console.error('ccFormularios.guardarRespuestasPublico:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar el registro' });
  }
};
