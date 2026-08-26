const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { PERMISOS_MAIL_TO } = require('../config/email');

// Módulos que notifican a un grupo configurable de usuarios por correo.
const MODULOS = [
  { key: 'permisos',      nombre: 'Nueva solicitud de permiso',    descripcion: 'Se notifica cuando un usuario solicita un permiso' },
  { key: 'vacaciones',    nombre: 'Nueva solicitud de vacaciones', descripcion: 'Se notifica cuando un usuario solicita vacaciones o permiso con goce' },
  { key: 'posible_baja',  nombre: 'Alerta de posible baja',        descripcion: 'Se notifica cuando un empleado acumula faltas consecutivas' },
];

let seeded = false;

async function ensureTabla(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='NOTIFICACIONES_CORREO_DESTINATARIOS')
    CREATE TABLE NOTIFICACIONES_CORREO_DESTINATARIOS (
      NCD_ID       INT IDENTITY PRIMARY KEY,
      NCD_MODULO   NVARCHAR(30) NOT NULL,
      NCD_USUARIO_ID INT NOT NULL,
      CONSTRAINT UQ_NOTIF_CORREO_MOD_USR UNIQUE (NCD_MODULO, NCD_USUARIO_ID)
    )
  `);
}

// Siembra inicial una sola vez: migra ASISTENCIA_BAJAS_DESTINATARIOS a
// 'posible_baja', y resuelve PERMISOS_MAIL_TO (correos del .env) a usuarios
// existentes por NEUS_CORREO para 'permisos' y 'vacaciones'. Si la tabla ya
// tiene filas para un módulo, no se vuelve a sembrar (el admin ya lo gestionó).
async function seedInicial(pool) {
  if (seeded) return;
  seeded = true;
  try {
    const countR = await pool.request().query('SELECT COUNT(*) c FROM NOTIFICACIONES_CORREO_DESTINATARIOS');
    if (countR.recordset[0].c > 0) return;

    const tieneBajas = await pool.request().query(
      "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ASISTENCIA_BAJAS_DESTINATARIOS'"
    );
    if (tieneBajas.recordset.length > 0) {
      const bajasR = await pool.request().query('SELECT NEUS_ID as id FROM ASISTENCIA_BAJAS_DESTINATARIOS');
      for (const r of bajasR.recordset) {
        await pool.request()
          .input('mod', sql.NVarChar, 'posible_baja')
          .input('uid', sql.Int, r.id)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid)
            INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID) VALUES (@mod, @uid)
          `);
      }
    }

    if (PERMISOS_MAIL_TO.length > 0) {
      const placeholders = PERMISOS_MAIL_TO.map((_, i) => `@c${i}`).join(',');
      const req = pool.request();
      PERMISOS_MAIL_TO.forEach((c, i) => req.input(`c${i}`, sql.NVarChar, c));
      const usuariosR = await req.query(
        `SELECT NEUS_ID as id FROM NEUS_USUARIOS WHERE NEUS_CORREO IN (${placeholders})`
      );
      for (const mod of ['permisos', 'vacaciones']) {
        for (const r of usuariosR.recordset) {
          await pool.request()
            .input('mod', sql.NVarChar, mod)
            .input('uid', sql.Int, r.id)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid)
              INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID) VALUES (@mod, @uid)
            `);
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ [notificacionesCorreo] Error en seed inicial:', e.message);
  }
}

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

// Estado completo para la pantalla de administración: por cada módulo, la
// lista de usuarios activos con su correo (o null si no tienen) y si están
// marcados como destinatarios de ese módulo.
exports.getConfiguracion = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTabla(pool);
    await seedInicial(pool);

    const usuariosR = await pool.request().query(`
      SELECT NEUS_ID as id, NEUS_NOMBRES as nombre, NEUS_TIPOUSUARIO as tipoUsuario, NEUS_CORREO as correo
      FROM NEUS_USUARIOS WHERE NEUS_ACTIVO = 1 ORDER BY NEUS_NOMBRES
    `);
    const destR = await pool.request().query('SELECT NCD_MODULO as modulo, NCD_USUARIO_ID as usuarioId FROM NOTIFICACIONES_CORREO_DESTINATARIOS');

    const porModulo = {};
    for (const m of MODULOS) porModulo[m.key] = new Set();
    for (const d of destR.recordset) {
      if (porModulo[d.modulo]) porModulo[d.modulo].add(d.usuarioId);
    }

    return res.json({
      success: true,
      data: {
        modulos: MODULOS,
        usuarios: usuariosR.recordset,
        destinatarios: Object.fromEntries(
          Object.entries(porModulo).map(([k, set]) => [k, [...set]])
        ),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Marca/desmarca un usuario como destinatario de un módulo.
exports.setDestinatario = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { modulo, usuarioId } = req.params;
    const { activo } = req.body || {};
    if (!MODULOS.some((m) => m.key === modulo)) return res.status(400).json({ success: false, message: 'Módulo inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureTabla(pool);

    if (activo) {
      await pool.request()
        .input('mod', sql.NVarChar, modulo)
        .input('uid', sql.Int, Number(usuarioId))
        .query(`
          IF NOT EXISTS (SELECT 1 FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid)
          INSERT INTO NOTIFICACIONES_CORREO_DESTINATARIOS (NCD_MODULO, NCD_USUARIO_ID) VALUES (@mod, @uid)
        `);
    } else {
      await pool.request()
        .input('mod', sql.NVarChar, modulo)
        .input('uid', sql.Int, Number(usuarioId))
        .query('DELETE FROM NOTIFICACIONES_CORREO_DESTINATARIOS WHERE NCD_MODULO=@mod AND NCD_USUARIO_ID=@uid');
    }
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Actualiza el correo de un usuario (para cuando falta o está mal capturado).
exports.setCorreoUsuario = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { usuarioId } = req.params;
    const { correo } = req.body || {};
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ success: false, message: 'Correo inválido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('uid', sql.Int, Number(usuarioId))
      .input('correo', sql.NVarChar, correo.trim())
      .query('UPDATE NEUS_USUARIOS SET NEUS_CORREO=@correo WHERE NEUS_ID=@uid');
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Resuelve destinatarios (correo) de un módulo — usado por emailService al
// disparar cada notificación. Solo incluye usuarios con correo capturado.
async function getDestinatariosCorreo(modulo, tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  await ensureTabla(pool);
  await seedInicial(pool);
  const r = await pool.request()
    .input('mod', sql.NVarChar, modulo)
    .query(`
      SELECT nu.NEUS_CORREO as correo
      FROM NOTIFICACIONES_CORREO_DESTINATARIOS d
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = d.NCD_USUARIO_ID
      WHERE d.NCD_MODULO = @mod AND nu.NEUS_ACTIVO = 1 AND nu.NEUS_CORREO IS NOT NULL AND nu.NEUS_CORREO <> ''
    `);
  return r.recordset.map((row) => row.correo);
}

// Igual que getDestinatariosCorreo, pero devuelve también el usuarioId — para
// módulos que además crean una notificación in-app por cada destinatario
// (p. ej. posible_baja), sin filtrar por si tienen correo o no.
async function getDestinatariosUsuarios(modulo, tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  await ensureTabla(pool);
  await seedInicial(pool);
  const r = await pool.request()
    .input('mod', sql.NVarChar, modulo)
    .query(`
      SELECT nu.NEUS_ID as id, nu.NEUS_CORREO as correo
      FROM NOTIFICACIONES_CORREO_DESTINATARIOS d
      INNER JOIN NEUS_USUARIOS nu ON nu.NEUS_ID = d.NCD_USUARIO_ID
      WHERE d.NCD_MODULO = @mod AND nu.NEUS_ACTIVO = 1
    `);
  return r.recordset;
}

module.exports.getDestinatariosCorreo = getDestinatariosCorreo;
module.exports.getDestinatariosUsuarios = getDestinatariosUsuarios;
