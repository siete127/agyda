const sql = require('mssql');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

// Migración idempotente: agrega AG_CARTA_DOC_ID si no existe. Corre al cargar
// el módulo (sin request HTTP detrás), así que aplica a todas las empresas.
Promise.all(require('../config/tenants').listTenants().map(({ key }) => databaseService.getPool(key))).then((pools) => {
  pools.forEach((pool) => {
    pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_NAME='ACTIVOS_GENERALES' AND COLUMN_NAME='AG_CARTA_DOC_ID')
        ALTER TABLE ACTIVOS_GENERALES ADD AG_CARTA_DOC_ID INT NULL
    `).catch(() => {});
  });
}).catch(() => {});

exports.getActivosGenerales = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        ag.AG_ID              as id,
        ag.AG_DEPARTAMENTO    as departamento,
        ag.AG_USUARIO_EXCEL   as usuarioExcel,
        ag.AG_NOMBRE_EQUIPO   as nombreEquipo,
        ag.AG_MARCA           as marca,
        ag.AG_MODELO          as modelo,
        ag.AG_NUMERO_SERIE    as numeroSerie,
        ag.AG_SO              as sistemaOperativo,
        ag.AG_UBICACION       as ubicacion,
        ag.AG_ESTADO          as estado,
        ag.AG_MONITOR1        as monitor1,
        ag.AG_MONITOR2        as monitor2,
        ag.AG_CARACTERISTICAS as caracteristicas,
        ag.AG_ACCESORIOS      as accesorios,
        ag.AG_DIADEMAS        as diademas,
        ag.AG_ASIGNADO_A      as asignadoA,
        nu.NEUS_NOMBRES       as asignadoNombre,
        ag.AG_FECHA_ASIGNACION as fechaAsignacion,
        ag.AG_FECHA_REGISTRO   as fechaRegistro,
        ag.AG_CARTA_DOC_ID    as cartaDocId
      FROM ACTIVOS_GENERALES ag
      LEFT JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = ag.AG_ASIGNADO_A
      WHERE ag.AG_ACTIVO = 1
      ORDER BY ag.AG_ID ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando activos generales:', e);
    return res.status(500).json({ success: false, message: 'Error al listar activos generales' });
  }
};

exports.createActivoGeneral = async (req, res) => {
  try {
    const {
      departamento, usuarioExcel, nombreEquipo, marca, modelo, numeroSerie,
      sistemaOperativo, ubicacion, estado, monitor1, monitor2,
      caracteristicas, accesorios, diademas, asignadoA,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const r = pool.request();

    r.input('departamento',    sql.NVarChar, departamento    || null);
    r.input('usuarioExcel',    sql.NVarChar, usuarioExcel    || null);
    r.input('nombreEquipo',    sql.NVarChar, nombreEquipo    || null);
    r.input('marca',           sql.NVarChar, marca           || null);
    r.input('modelo',          sql.NVarChar, modelo          || null);
    r.input('numeroSerie',     sql.NVarChar, numeroSerie     || null);
    r.input('sistemaOperativo',sql.NVarChar, sistemaOperativo|| null);
    r.input('ubicacion',       sql.NVarChar, ubicacion       || null);
    r.input('estado',          sql.NVarChar, estado          || 'Activo');
    r.input('monitor1',        sql.NVarChar, monitor1        || null);
    r.input('monitor2',        sql.NVarChar, monitor2        || null);
    r.input('caracteristicas', sql.NVarChar, caracteristicas || null);
    r.input('accesorios',      sql.NVarChar, accesorios      || null);
    r.input('diademas',        sql.NVarChar, diademas        || null);
    r.input('asignadoA',       sql.Int,      asignadoA       || null);

    const result = await r.query(`
      INSERT INTO ACTIVOS_GENERALES (
        AG_DEPARTAMENTO, AG_USUARIO_EXCEL, AG_NOMBRE_EQUIPO, AG_MARCA, AG_MODELO,
        AG_NUMERO_SERIE, AG_SO, AG_UBICACION, AG_ESTADO, AG_MONITOR1, AG_MONITOR2,
        AG_CARACTERISTICAS, AG_ACCESORIOS, AG_DIADEMAS, AG_ASIGNADO_A,
        AG_FECHA_ASIGNACION, AG_FECHA_REGISTRO, AG_ACTIVO
      ) VALUES (
        @departamento, @usuarioExcel, @nombreEquipo, @marca, @modelo,
        @numeroSerie, @sistemaOperativo, @ubicacion, @estado, @monitor1, @monitor2,
        @caracteristicas, @accesorios, @diademas, @asignadoA,
        ${asignadoA ? 'GETDATE()' : 'NULL'}, GETDATE(), 1
      );
      SELECT SCOPE_IDENTITY() as id;
    `);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'activos', accion:'crear-general', entidadId: String(result.recordset[0]?.id||''), detalle:{ nombreEquipo, marca, modelo }, ip:req.ip });
    return res.status(201).json({ success: true, id: result.recordset[0]?.id });
  } catch (e) {
    console.error('Error creando activo general:', e);
    return res.status(500).json({ success: false, message: 'Error al crear activo general' });
  }
};

function normalizarTexto(s) {
  return (s ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Encabezados aceptados por columna destino — varios alias en español para
// tolerar variaciones típicas de Excel (con/sin acentos, mayúsculas, etc.).
const ALIAS_ENCABEZADOS = {
  departamento: ['departamento', 'area', 'área'],
  usuarioExcel: ['usuario', 'usuario asignado', 'colaborador', 'empleado'],
  nombreEquipo: ['nombre de equipo', 'nombre del equipo', 'equipo', 'nombre'],
  marca: ['marca'],
  modelo: ['modelo'],
  numeroSerie: ['numero de serie', 'número de serie', 'no. serie', 'no serie', 'serie'],
  sistemaOperativo: ['sistema operativo', 'so', 's.o.'],
  ubicacion: ['ubicacion', 'ubicación'],
  estado: ['estado', 'estatus'],
  monitor1: ['monitor 1', 'monitor1', 'monitor'],
  monitor2: ['monitor 2', 'monitor2'],
  caracteristicas: ['caracteristicas', 'características'],
  accesorios: ['accesorios'],
  diademas: ['diademas', 'diadema'],
};

function mapearEncabezados(filaEncabezados) {
  const indicePorCampo = {};
  filaEncabezados.forEach((celda, idx) => {
    const norm = normalizarTexto(celda);
    if (!norm) return;
    for (const [campo, alias] of Object.entries(ALIAS_ENCABEZADOS)) {
      if (indicePorCampo[campo] !== undefined) continue;
      if (alias.some((a) => normalizarTexto(a) === norm)) indicePorCampo[campo] = idx;
    }
  });
  return indicePorCampo;
}

// POST /activos/generales/importar — carga masiva desde un .xlsx con
// encabezados en la primera fila. Upsert por número de serie: si ya existe
// un activo con ese número de serie, se actualiza; si no, se crea.
exports.importarActivosGenerales = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });

    let wb;
    try {
      wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (e) {
      return res.status(400).json({ success: false, message: 'El archivo no es un Excel válido' });
    }

    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (filas.length < 2) return res.status(400).json({ success: false, message: 'El archivo no tiene datos (solo encabezado o vacío)' });

    const indicePorCampo = mapearEncabezados(filas[0]);
    if (indicePorCampo.numeroSerie === undefined) {
      return res.status(400).json({ success: false, message: 'No se encontró la columna "Número de serie" en el encabezado' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const usuariosR = await pool.request().query(`SELECT NEUS_ID, NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1`);
    const usuarios = usuariosR.recordset;

    function buscarUsuario(nombreExcel) {
      if (!nombreExcel) return null;
      const norm = normalizarTexto(nombreExcel);
      let found = usuarios.find((u) => normalizarTexto(u.NEUS_NOMBRES) === norm);
      if (found) return found;
      const palabras = norm.split(/\s+/).filter((p) => p.length > 2);
      if (palabras.length >= 2) {
        found = usuarios.find((u) => {
          const un = normalizarTexto(u.NEUS_NOMBRES);
          return palabras.every((p) => un.includes(p));
        });
      }
      return found || null;
    }

    let insertados = 0;
    let actualizados = 0;
    let saltados = 0;
    const errores = [];

    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i];
      if (!fila || fila.every((c) => c === null || c === '')) continue;

      const get = (campo) => {
        const idx = indicePorCampo[campo];
        if (idx === undefined) return null;
        const v = fila[idx];
        return v === null || v === undefined ? null : String(v).trim() || null;
      };

      const numeroSerie = get('numeroSerie');
      if (!numeroSerie) { saltados++; continue; }

      try {
        const departamento = get('departamento');
        const usuarioExcel = get('usuarioExcel');
        const nombreEquipo = get('nombreEquipo');
        const marca = get('marca');
        const modelo = get('modelo');
        const sistemaOperativo = get('sistemaOperativo');
        const ubicacion = get('ubicacion');
        const estadoRaw = get('estado');
        const estado = estadoRaw && normalizarTexto(estadoRaw).startsWith('inactiv') ? 'Inactivo' : 'Activo';
        const monitor1 = get('monitor1');
        const monitor2 = get('monitor2');
        const caracteristicas = get('caracteristicas');
        const accesorios = get('accesorios');
        const diademas = get('diademas');
        const usuarioMatch = buscarUsuario(usuarioExcel);
        const asignadoA = usuarioMatch ? usuarioMatch.NEUS_ID : null;

        const existente = await pool.request()
          .input('serie', sql.NVarChar, numeroSerie)
          .query(`SELECT TOP 1 AG_ID FROM ACTIVOS_GENERALES WHERE AG_NUMERO_SERIE = @serie AND AG_ACTIVO = 1`);

        const r = pool.request();
        r.input('departamento', sql.NVarChar, departamento);
        r.input('usuarioExcel', sql.NVarChar, usuarioExcel);
        r.input('nombreEquipo', sql.NVarChar, nombreEquipo);
        r.input('marca', sql.NVarChar, marca);
        r.input('modelo', sql.NVarChar, modelo);
        r.input('numeroSerie', sql.NVarChar, numeroSerie);
        r.input('sistemaOperativo', sql.NVarChar, sistemaOperativo);
        r.input('ubicacion', sql.NVarChar, ubicacion);
        r.input('estado', sql.NVarChar, estado);
        r.input('monitor1', sql.NVarChar, monitor1);
        r.input('monitor2', sql.NVarChar, monitor2);
        r.input('caracteristicas', sql.NVarChar, caracteristicas);
        r.input('accesorios', sql.NVarChar, accesorios);
        r.input('diademas', sql.NVarChar, diademas);
        r.input('asignadoA', sql.Int, asignadoA);

        if (existente.recordset.length) {
          r.input('id', sql.Int, existente.recordset[0].AG_ID);
          await r.query(`
            UPDATE ACTIVOS_GENERALES SET
              AG_DEPARTAMENTO=@departamento, AG_USUARIO_EXCEL=@usuarioExcel, AG_NOMBRE_EQUIPO=@nombreEquipo,
              AG_MARCA=@marca, AG_MODELO=@modelo, AG_SO=@sistemaOperativo, AG_UBICACION=@ubicacion,
              AG_ESTADO=@estado, AG_MONITOR1=@monitor1, AG_MONITOR2=@monitor2,
              AG_CARACTERISTICAS=@caracteristicas, AG_ACCESORIOS=@accesorios, AG_DIADEMAS=@diademas,
              AG_ASIGNADO_A=@asignadoA
            WHERE AG_ID=@id
          `);
          actualizados++;
        } else {
          await r.query(`
            INSERT INTO ACTIVOS_GENERALES (
              AG_DEPARTAMENTO, AG_USUARIO_EXCEL, AG_NOMBRE_EQUIPO, AG_MARCA, AG_MODELO,
              AG_NUMERO_SERIE, AG_SO, AG_UBICACION, AG_ESTADO, AG_MONITOR1, AG_MONITOR2,
              AG_CARACTERISTICAS, AG_ACCESORIOS, AG_DIADEMAS, AG_ASIGNADO_A,
              AG_FECHA_ASIGNACION, AG_FECHA_REGISTRO, AG_ACTIVO
            ) VALUES (
              @departamento, @usuarioExcel, @nombreEquipo, @marca, @modelo,
              @numeroSerie, @sistemaOperativo, @ubicacion, @estado, @monitor1, @monitor2,
              @caracteristicas, @accesorios, @diademas, @asignadoA,
              ${asignadoA ? 'GETDATE()' : 'NULL'}, GETDATE(), 1
            )
          `);
          insertados++;
        }
      } catch (e) {
        errores.push({ fila: i + 1, numeroSerie, error: e.message });
      }
    }

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'activos', accion: 'importar-generales-excel',
      entidadId: null, detalle: { insertados, actualizados, saltados, errores: errores.length }, ip: req.ip,
    });

    res.json({
      success: true,
      data: { insertados, actualizados, saltados, errores: errores.slice(0, 10) },
      message: `Importación completada: ${insertados} nuevos, ${actualizados} actualizados, ${saltados} omitidos${errores.length ? `, ${errores.length} con error` : ''}.`,
    });
  } catch (e) {
    console.error('Error importando activos generales:', e);
    res.status(500).json({ success: false, message: 'Error al importar el archivo' });
  }
};

exports.updateActivoGeneral = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      departamento, usuarioExcel, nombreEquipo, marca, modelo, numeroSerie,
      sistemaOperativo, ubicacion, estado, monitor1, monitor2,
      caracteristicas, accesorios, diademas, asignadoA,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    const existe = await pool.request().input('id', sql.Int, id)
      .query('SELECT AG_ASIGNADO_A FROM ACTIVOS_GENERALES WHERE AG_ID = @id');
    if (existe.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Activo no encontrado' });
    }

    const prevAsignado = existe.recordset[0].AG_ASIGNADO_A;
    const nuevoAsignado = asignadoA !== undefined ? (asignadoA || null) : prevAsignado;
    const cambioAsignacion = String(nuevoAsignado) !== String(prevAsignado);
    const fechaAsignacion = cambioAsignacion ? (nuevoAsignado ? new Date() : null) : undefined;

    const r = pool.request().input('id', sql.Int, id);

    r.input('departamento',    sql.NVarChar, departamento    ?? null);
    r.input('usuarioExcel',    sql.NVarChar, usuarioExcel    ?? null);
    r.input('nombreEquipo',    sql.NVarChar, nombreEquipo    ?? null);
    r.input('marca',           sql.NVarChar, marca           ?? null);
    r.input('modelo',          sql.NVarChar, modelo          ?? null);
    r.input('numeroSerie',     sql.NVarChar, numeroSerie     ?? null);
    r.input('sistemaOperativo',sql.NVarChar, sistemaOperativo?? null);
    r.input('ubicacion',       sql.NVarChar, ubicacion       ?? null);
    r.input('estado',          sql.NVarChar, estado          ?? null);
    r.input('monitor1',        sql.NVarChar, monitor1        ?? null);
    r.input('monitor2',        sql.NVarChar, monitor2        ?? null);
    r.input('caracteristicas', sql.NVarChar, caracteristicas ?? null);
    r.input('accesorios',      sql.NVarChar, accesorios      ?? null);
    r.input('diademas',        sql.NVarChar, diademas        ?? null);
    r.input('asignadoA',       sql.Int,      nuevoAsignado);

    if (fechaAsignacion !== undefined) {
      r.input('fechaAsignacion', sql.DateTime, fechaAsignacion);
    }

    await r.query(`
      UPDATE ACTIVOS_GENERALES SET
        AG_DEPARTAMENTO    = COALESCE(@departamento,    AG_DEPARTAMENTO),
        AG_USUARIO_EXCEL   = COALESCE(@usuarioExcel,   AG_USUARIO_EXCEL),
        AG_NOMBRE_EQUIPO   = COALESCE(@nombreEquipo,   AG_NOMBRE_EQUIPO),
        AG_MARCA           = COALESCE(@marca,           AG_MARCA),
        AG_MODELO          = COALESCE(@modelo,          AG_MODELO),
        AG_NUMERO_SERIE    = COALESCE(@numeroSerie,     AG_NUMERO_SERIE),
        AG_SO              = COALESCE(@sistemaOperativo,AG_SO),
        AG_UBICACION       = COALESCE(@ubicacion,       AG_UBICACION),
        AG_ESTADO          = COALESCE(@estado,          AG_ESTADO),
        AG_MONITOR1        = COALESCE(@monitor1,        AG_MONITOR1),
        AG_MONITOR2        = COALESCE(@monitor2,        AG_MONITOR2),
        AG_CARACTERISTICAS = COALESCE(@caracteristicas, AG_CARACTERISTICAS),
        AG_ACCESORIOS      = COALESCE(@accesorios,      AG_ACCESORIOS),
        AG_DIADEMAS        = COALESCE(@diademas,        AG_DIADEMAS),
        AG_ASIGNADO_A      = @asignadoA
        ${fechaAsignacion !== undefined ? ', AG_FECHA_ASIGNACION = @fechaAsignacion' : ''}
      WHERE AG_ID = @id
    `);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'activos', accion:'editar-general', entidadId: req.params.id, detalle:{ nombreEquipo, marca, modelo }, ip:req.ip });
    return res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando activo general:', e);
    return res.status(500).json({ success: false, message: 'Error al actualizar activo general' });
  }
};

// PATCH /api/activos/generales/:id/carta-doc — enlaza un DOC_ID del expediente como carta responsiva
exports.enlazarCartaDoc = async (req, res) => {
  try {
    const { id } = req.params;
    const { docId } = req.body; // null para desenlazar
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id',    sql.Int, Number(id))
      .input('docId', sql.Int, docId != null ? Number(docId) : null)
      .query('UPDATE ACTIVOS_GENERALES SET AG_CARTA_DOC_ID = @docId WHERE AG_ID = @id');
    return res.json({ success: true });
  } catch (e) {
    console.error('Error enlazando carta doc:', e);
    return res.status(500).json({ success: false, message: 'Error al enlazar carta' });
  }
};

// GET /api/activos/generales/usuario/:userId — activos generales asignados a un usuario
// Busca por AG_ASIGNADO_A (NEUS_ID) O por nombre en AG_USUARIO_EXCEL (match parcial)
exports.getActivosGeneralesPorUsuario = async (req, res) => {
  try {
    const { userId } = req.params;
    const neusId = req.user?.id;
    const isAdmin = ['AD', 'TI'].includes(req.user?.tipoUsuario?.toUpperCase() ?? '');
    if (!isAdmin && Number(userId) !== neusId) {
      return res.status(403).json({ success: false, message: 'Sin permiso' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    // Primero obtener el nombre completo del usuario para hacer match por texto
    const userR = await pool.request()
      .input('uid', sql.Int, Number(userId))
      .query('SELECT NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID = @uid');
    const nombreUsuario = userR.recordset[0]?.nombre ?? '';

    // Extraer primer nombre y primer apellido para match flexible
    // ej. "Ines Jessica Ramos Meneses" → buscar "Ines" y "Ramos" o "Jessica" y "Meneses"
    const partes = nombreUsuario.trim().split(/\s+/);
    // Usar el primer token como búsqueda principal
    const primerNombre = partes[0] ?? '';

    const result = await pool.request()
      .input('uid', sql.Int, Number(userId))
      .input('nombre', sql.NVarChar, `%${primerNombre}%`)
      .query(`
        SELECT ag.AG_ID as id, ag.AG_NOMBRE_EQUIPO as nombreEquipo,
               ag.AG_MARCA as marca, ag.AG_MODELO as modelo,
               ag.AG_NUMERO_SERIE as numeroSerie, ag.AG_SO as sistemaOperativo,
               ag.AG_UBICACION as ubicacion, ag.AG_ESTADO as estado,
               ag.AG_MONITOR1 as monitor1, ag.AG_MONITOR2 as monitor2,
               ag.AG_DIADEMAS as diademas, ag.AG_ACCESORIOS as accesorios,
               ag.AG_CARACTERISTICAS as caracteristicas,
               ag.AG_DEPARTAMENTO as departamento,
               ag.AG_FECHA_ASIGNACION as fechaAsignacion,
               ag.AG_USUARIO_EXCEL as usuarioExcel,
               ag.AG_CARTA_DOC_ID as cartaDocId
        FROM ACTIVOS_GENERALES ag
        WHERE ag.AG_ACTIVO = 1
          AND ISNULL(ag.AG_DEPARTAMENTO, '') NOT IN ('MONITOR', 'CPU', 'HP')
          AND (
            ag.AG_ASIGNADO_A = @uid
            OR (ag.AG_ASIGNADO_A IS NULL AND ag.AG_USUARIO_EXCEL LIKE @nombre)
          )
        ORDER BY ag.AG_ID ASC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando activos generales por usuario:', e);
    return res.status(500).json({ success: false, message: 'Error al listar activos' });
  }
};

// GET /api/activos/generales/:id/carta-responsiva — PDF carta responsiva de activo general
exports.getCartaResponsivaGeneral = async (req, res) => {
  const path = require('path');
  const fs   = require('fs');
  try {
    const { id } = req.params;
    const neusId  = req.user?.id;
    const isAdmin = ['AD', 'TI'].includes(req.user?.tipoUsuario?.toUpperCase() ?? '');
    const pool    = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ag.AG_ID as id, ag.AG_NOMBRE_EQUIPO as nombreEquipo,
               ag.AG_MARCA as marca, ag.AG_MODELO as modelo,
               ag.AG_NUMERO_SERIE as numeroSerie, ag.AG_SO as sistemaOperativo,
               ag.AG_UBICACION as ubicacion, ag.AG_ESTADO as estado,
               ag.AG_MONITOR1 as monitor1, ag.AG_MONITOR2 as monitor2,
               ag.AG_DIADEMAS as diademas, ag.AG_ACCESORIOS as accesorios,
               ag.AG_CARACTERISTICAS as caracteristicas,
               ag.AG_DEPARTAMENTO as departamento,
               ag.AG_FECHA_ASIGNACION as fechaAsignacion,
               ag.AG_ASIGNADO_A as asignadoA,
               ag.AG_USUARIO_EXCEL as usuarioExcel,
               nu.NEUS_NOMBRES as empleadoNombre,
               nu.NEUS_USUARIO as empleadoUsuario,
               nu.NEUS_TIPOUSUARIO as empleadoTipo
        FROM ACTIVOS_GENERALES ag
        LEFT JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = ag.AG_ASIGNADO_A
        WHERE ag.AG_ID = @id
      `);

    if (result.recordset.length === 0)
      return res.status(404).json({ success: false, message: 'Activo no encontrado' });

    const a = result.recordset[0];
    if (!isAdmin && a.asignadoA !== neusId)
      return res.status(403).json({ success: false, message: 'Sin permiso' });

    // Nombre del empleado: preferir NEUS_NOMBRES, si no está usar AG_USUARIO_EXCEL
    const nombreEmpleado = (a.empleadoNombre || a.usuarioExcel || 'Sin asignar').toUpperCase();
    const numEmpleado    = a.empleadoUsuario || '—';
    const tipoLabel = { AD: 'Administración', CC: 'Call Center', TI: 'Soporte Técnico' };
    const cargo     = tipoLabel[a.empleadoTipo?.toUpperCase()] ?? (a.empleadoTipo || 'Colaborador');
    const area      = a.departamento || cargo;

    // Fecha
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const hoyD  = new Date();
    const fechaTexto = `Tizayuca Hgo, ${hoyD.getDate()} de ${MESES[hoyD.getMonth()]} del año ${hoyD.getFullYear()}.`;
    const fechaAsig  = a.fechaAsignacion
      ? new Date(a.fechaAsignacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Sin fecha';

    // Logo
    const logoPath = path.join(__dirname, '../assets/LOGO.png');
    const hasLogo  = fs.existsSync(logoPath);

    const PAGE_W = 612, PAGE_H = 792;
    const M      = 54;   // margen lateral
    const doc    = new PDFDocument({ size: 'letter', margin: 0, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    await new Promise((resolve) => {
      doc.on('end', resolve);

      // ── Franja superior azul ──────────────────────────────────────
      doc.rect(0, 0, PAGE_W, 90).fill('#1B3A7A');

      // Logo (blanco, esquina derecha)
      if (hasLogo) {
        try { doc.image(logoPath, PAGE_W - M - 110, 18, { width: 110, opacity: 1 }); } catch (_) {}
      }

      // Título en la franja
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13)
         .text('ARDABYTEC', M, 22, { width: 300 });
      doc.font('Helvetica').fontSize(9).fillColor('#A8C4FF')
         .text('Soluciones en tecnología', M, 38);

      // ── Sub-franja celeste ────────────────────────────────────────
      doc.rect(0, 90, PAGE_W, 28).fill('#2563EB');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
         .text('RESPONSIVA DE EQUIPO DE CÓMPUTO Y ACCESORIOS', 0, 97, { align: 'center', width: PAGE_W });

      // ── Fecha ─────────────────────────────────────────────────────
      let y = 132;
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
         .text(fechaTexto, 0, y, { align: 'center', width: PAGE_W });

      // ── Sección empleado ──────────────────────────────────────────
      y = 165;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1B3A7A')
         .text('DATOS DEL EMPLEADO QUE RECIBE:', M, y);
      y += 16;

      // Tabla 4 filas × 2 col
      const empData = [
        ['Nombre completo', nombreEmpleado],
        ['Puesto',          cargo.toUpperCase()],
        ['No. De empleado', numEmpleado],
        ['Área / Departamento', area.toUpperCase()],
      ];
      const colW1 = 160, colW2 = PAGE_W - M * 2 - colW1, rowH = 22;
      empData.forEach(([lbl, val], i) => {
        const ry = y + i * rowH;
        // Fondo alternado
        doc.rect(M, ry, colW1 + colW2, rowH).fill(i % 2 === 0 ? '#EFF6FF' : '#FFFFFF');
        // Borde
        doc.rect(M, ry, colW1 + colW2, rowH).stroke('#CBD5E1');
        // Separador vertical
        doc.moveTo(M + colW1, ry).lineTo(M + colW1, ry + rowH).stroke('#CBD5E1');
        // Texto
        doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9)
           .text(lbl, M + 6, ry + 6, { width: colW1 - 10 });
        doc.font('Helvetica').fontSize(9)
           .text(val, M + colW1 + 6, ry + 6, { width: colW2 - 10 });
      });

      // ── Sección equipo ────────────────────────────────────────────
      y += empData.length * rowH + 14;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1B3A7A')
         .text('DETALLE DEL EQUIPO Y ACCESORIOS ENTREGADOS:', M, y);
      y += 14;

      doc.font('Helvetica').fontSize(10).fillColor('#374151')
         .text('Se me hace entrega de un equipo con características:', M, y, { width: PAGE_W - M * 2 });
      y += 20;

      const bullets = [
        a.nombreEquipo && `NUM DE EQUIPO: ${a.nombreEquipo}`,
        a.marca        && `MARCA: ${a.marca}`,
        a.modelo       && `MODELO: ${a.modelo}`,
        a.numeroSerie  && `NUM DE SERIE: ${a.numeroSerie}`,
        a.sistemaOperativo && `SISTEMA OPERATIVO: ${a.sistemaOperativo}`,
        a.caracteristicas  && `CARACTERISTICAS: ${a.caracteristicas}`,
        a.monitor1     && `MONITOR: ${a.monitor1}${a.monitor2 ? ' / ' + a.monitor2 : ''}`,
        a.diademas     && `DIADEMA: ${a.diademas}`,
        a.accesorios   && `ACCESORIOS: ${a.accesorios}`,
        a.ubicacion    && `UBICACION: ${a.ubicacion}`,
        a.fechaAsignacion && `FECHA DE ASIGNACIÓN: ${fechaAsig}`,
      ].filter(Boolean);

      bullets.forEach((line) => {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827')
           .text('• ', M + 10, y, { continued: true, width: 16 });
        const parts = line.split(': ');
        const key   = parts[0];
        const val2  = parts.slice(1).join(': ');
        doc.font('Helvetica-Bold').text(key + ': ', { continued: true });
        doc.font('Helvetica').text(val2, { width: PAGE_W - M * 2 - 26 });
        y = doc.y + 2;
      });

      // ── Compromisos ───────────────────────────────────────────────
      y += 10;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1B3A7A')
         .text('COMPROMISOS DEL COLABORADOR:', M, y);
      y += 14;

      const compromisos = [
        'Utilizar el equipo exclusivamente para actividades laborales relacionadas con mi puesto.',
        'Mantener el equipo en buen estado y reportar cualquier daño o desperfecto de inmediato al área de TI.',
        'No instalar software no autorizado ni modificar la configuración del equipo sin aprobación.',
        'Devolver el equipo y todos sus accesorios en las mismas condiciones al término de mi relación laboral.',
        'Asumir la responsabilidad económica por pérdida o daño causado por negligencia.',
      ];
      compromisos.forEach((c, i) => {
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
           .text(`${i + 1}. ${c}`, M + 10, y, { width: PAGE_W - M * 2 - 10 });
        y = doc.y + 3;
      });

      // ── Firmas ────────────────────────────────────────────────────
      y += 18;
      const fL = M + 20, fR = PAGE_W / 2 + 20, lineW = 180;
      doc.moveTo(fL, y).lineTo(fL + lineW, y).strokeColor('#9CA3AF').lineWidth(0.8).stroke();
      doc.moveTo(fR, y).lineTo(fR + lineW, y).stroke();

      y += 4;
      doc.font('Helvetica').fontSize(8).fillColor('#6B7280')
         .text('Firma del colaborador', fL, y, { width: lineW, align: 'center' });
      doc.text('Firma del responsable de TI', fR, y, { width: lineW, align: 'center' });

      y += 12;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151')
         .text(nombreEmpleado, fL, y, { width: lineW, align: 'center' });

      // Pie de página
      doc.font('Helvetica').fontSize(7).fillColor('#9CA3AF')
         .text('Documento generado por el sistema de intranet — Ardabytec', 0, PAGE_H - 24, { align: 'center', width: PAGE_W });

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const safeName  = nombreEmpleado.replace(/\s+/g, '_').substring(0, 30);
    const filename  = `${safeName}_RESPONSIVA_EQUIPO_DE_COMPUTO.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (e) {
    console.error('Error generando carta responsiva general:', e);
    return res.status(500).json({ success: false, message: 'Error al generar la carta responsiva' });
  }
};
