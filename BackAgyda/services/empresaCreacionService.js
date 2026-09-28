const sql = require('mssql');
const databaseService = require('./databaseService');
const { DEFAULT_TENANT, getTenantConfig, registerTenant } = require('../config/tenants');
const { empresaRequierePolitica } = require('../utils/passwordPolicy');
const logger = global.logger || require('../utils/logger');

// Alta de empresas (tenants) y de usuarios dentro de una empresa concreta.
// Lo usan Accesos > Empresas (alta rápida) y el asistente "Crear empresa".

const CODIGO_RE = /^[a-z][a-z0-9_]{1,29}$/;

// Estado de preparación del esquema de empresas recién creadas (en memoria):
// key -> { estado: 'preparando' | 'listo' | 'error', error?: string }.
// Si el proceso se reinicia a medias, la empresa ya está en el catálogo y
// getPool() vuelve a correr ensureAllSchemas la próxima vez que se use.
const preparacion = new Map();

function validarCodigo(codigo) {
  const key = String(codigo || '').trim().toLowerCase();
  if (!CODIGO_RE.test(key)) {
    throw Object.assign(new Error('Código inválido: solo minúsculas, números y guion bajo, debe empezar con letra (2-30 caracteres)'), { status: 400 });
  }
  try {
    getTenantConfig(key);
  } catch (_) {
    return key; // getTenantConfig lanza si no existe — es lo esperado
  }
  throw Object.assign(new Error('Ya existe una empresa con ese código'), { status: 400 });
}

// Crea la BD de la empresa, la registra en el catálogo (antes que el esquema,
// para que un fallo a medias no la deje huérfana tras un reinicio) y prepara
// su esquema. esperarEsquema=false: el esquema se prepara en segundo plano
// (tarda ~1 min) y se consulta con estadoPreparacion().
async function crearEmpresaBase({ codigo, nombre, creadoPor = null, estricto = false, asistente = null, esperarEsquema = true }) {
  const key = validarCodigo(codigo);
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) throw Object.assign(new Error('El nombre de la empresa es obligatorio'), { status: 400 });
  const database = `intranet_${key}`;

  // CREATE DATABASE no puede ir en una transacción ni en batch con USE de otra BD.
  const poolMaestro = await databaseService.getPool(DEFAULT_TENANT);
  try {
    await poolMaestro.request().batch(`
      IF DB_ID('${database}') IS NOT NULL
        THROW 50001, 'La base de datos ya existe', 1;
      CREATE DATABASE [${database}];
    `);
  } catch (dbErr) {
    throw Object.assign(new Error(`No se pudo crear la base de datos: ${dbErr.message}`), { status: 500 });
  }

  await poolMaestro.request()
    .input('key', sql.NVarChar, key)
    .input('nombre', sql.NVarChar, nombreLimpio)
    .input('database', sql.NVarChar, database)
    .input('creadoPor', sql.Int, creadoPor)
    .input('asistente', sql.NVarChar, asistente ? JSON.stringify(asistente) : null)
    .input('estricto', sql.Bit, estricto ? 1 : 0)
    .query(`
      INSERT INTO dbo.INTRANET_EMPRESAS (EMP_KEY, EMP_NOMBRE, EMP_DATABASE, EMP_CREADO_POR, EMP_ASISTENTE, EMP_MODULOS_ESTRICTO)
      VALUES (@key, @nombre, @database, @creadoPor, @asistente, @estricto)
    `);
  registerTenant(key, nombreLimpio, database);

  const preparar = async () => {
    preparacion.set(key, { estado: 'preparando' });
    try {
      await databaseService.initialize(key);
      preparacion.set(key, { estado: 'listo' });
    } catch (e) {
      logger.error(`❌ Falló el esquema de la empresa nueva ${key}:`, e);
      preparacion.set(key, { estado: 'error', error: e.message });
      throw e;
    }
  };

  if (esperarEsquema) {
    try {
      await preparar();
    } catch (schemaErr) {
      throw Object.assign(new Error(`Base de datos creada, pero falló el esquema: ${schemaErr.message}`), { status: 500 });
    }
  } else {
    preparar().catch(() => { /* queda en preparacion como 'error' */ });
  }

  return { key, nombre: nombreLimpio, database };
}

// 'listo' si el pool ya está (o se puede) inicializar; si estaba en error o el
// proceso se reinició, reintenta en segundo plano.
function estadoPreparacion(key) {
  const k = String(key).toLowerCase();
  const actual = preparacion.get(k);
  if (actual?.estado === 'preparando') return actual;
  if (actual?.estado === 'listo') return actual;
  // Sin registro (reinicio) o con error: reintentar sin bloquear.
  preparacion.set(k, { estado: 'preparando' });
  databaseService.getPool(k)
    .then(() => preparacion.set(k, { estado: 'listo' }))
    .catch((e) => preparacion.set(k, { estado: 'error', error: e.message }));
  return actual?.estado === 'error' ? { estado: 'preparando', reintento: true, errorAnterior: actual.error } : { estado: 'preparando' };
}

// Alta de un usuario en la BD de una empresa concreta, con las mismas
// columnas que usuarioController.createUsuario. Si viene rolId, su ROL_BASE
// define NEUS_TIPOUSUARIO y sus permisos se copian al usuario.
async function crearUsuarioEnEmpresa(pool, empKey, d, grantedBy = null) {
  const nombres = String(d.nombres || '').trim();
  const usuario = String(d.usuario || '').trim();
  const contra = String(d.contra || '');
  if (!nombres || !usuario || !contra) throw Object.assign(new Error('Nombre, usuario y contraseña son obligatorios'), { status: 400 });

  let tipoUsuario = d.tipoUsuario ? String(d.tipoUsuario).toUpperCase() : null;
  if (d.rolId) {
    const rs = await pool.request().input('id', sql.Int, Number(d.rolId))
      .query(`SELECT ROL_BASE FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id AND ACTIVO = 1`);
    if (!rs.recordset.length) throw Object.assign(new Error('El rol elegido no existe'), { status: 400 });
    tipoUsuario = rs.recordset[0].ROL_BASE;
  }
  if (!tipoUsuario) throw Object.assign(new Error('Falta el rol del usuario'), { status: 400 });

  const dup = await pool.request().input('usuario', sql.NVarChar, usuario)
    .query('SELECT COUNT(*) AS n FROM NEUS_USUARIOS WHERE NEUS_USUARIO = @usuario');
  if (dup.recordset[0].n > 0) throw Object.assign(new Error(`El usuario "${usuario}" ya existe`), { status: 400 });

  const ins = await pool.request()
    .input('nombres', sql.NVarChar, nombres)
    .input('usuario', sql.NVarChar, usuario)
    .input('contra', sql.NVarChar, contra)
    .input('tipoUsuario', sql.NVarChar, tipoUsuario)
    .input('correo', sql.NVarChar, d.correo ? String(d.correo).trim() : null)
    .input('puesto', sql.NVarChar, d.puesto ? String(d.puesto).trim() : null)
    .input('departamento', sql.NVarChar, d.departamento ? String(d.departamento).trim() : null)
    .input('idHorario', sql.Int, d.idHorario ? Number(d.idHorario) : null)
    // Contraseña temporal: siempre se pide cambiarla en el primer ingreso.
    .input('debeCambiar', sql.Bit, d.debeCambiarPassword === false && !empresaRequierePolitica(empKey) ? 0 : 1)
    .query(`
      INSERT INTO NEUS_USUARIOS
      (NEUS_NOMBRES, NEUS_USUARIO, NEUS_CONTRA, NEUS_TIPOUSUARIO, NEUS_ACTIVO, NEUS_STATUS, NEUS_BASE, NEUS_FECHA_REGISTRO,
       username, [password], NEUS_CORREO, NEUS_PUESTO, NEUS_DEPARTAMENTO, id_horario, NEUS_DEBE_CAMBIAR_PASSWORD)
      VALUES (@nombres, @usuario, @contra, @tipoUsuario, 1, 1, '1', GETDATE(),
       @usuario, @contra, @correo, @puesto, @departamento, @idHorario, @debeCambiar);
      SELECT SCOPE_IDENTITY() AS NEUS_ID;
    `);
  const id = Number(ins.recordset[0]?.NEUS_ID);

  try {
    await pool.request().input('id', sql.Int, id).input('n', sql.NVarChar(255), nombres).query(`
      IF OBJECT_ID('dbo.EXPEDIENTE_CARPETAS', 'U') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.EXPEDIENTE_CARPETAS WHERE USUARIO_ID = @id)
        INSERT INTO dbo.EXPEDIENTE_CARPETAS (USUARIO_ID, NOMBRES, CREADA_EN) VALUES (@id, @n, GETDATE())
    `);
  } catch (_) { /* la carpeta de expediente es opcional */ }

  if (d.rolId) {
    const { aplicarRolAUsuario } = require('../controllers/rolController');
    await aplicarRolAUsuario(pool, Number(d.rolId), id, grantedBy);
  }
  return { id, usuario, tipoUsuario };
}

module.exports = { validarCodigo, crearEmpresaBase, estadoPreparacion, crearUsuarioEnEmpresa };
