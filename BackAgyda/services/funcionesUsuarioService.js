const sql = require('mssql');

// Funciones de usuario (INTRANET_FUNCIONES): etiquetas asignables a cualquier
// usuario. El código usa las de sistema por su clave.
const FUNCIONES = {
  ASESOR_CLIENTES: 'asesor-clientes',
};

// Usuarios activos que tienen una función, con su correo (para avisos).
async function usuariosConFuncion(pool, clave) {
  const r = await pool.request().input('c', sql.NVarChar(60), clave).query(`
    SELECT u.NEUS_ID id, u.NEUS_NOMBRES nombre, u.NEUS_CORREO correo
    FROM dbo.INTRANET_USUARIO_FUNCIONES uf
    JOIN dbo.INTRANET_FUNCIONES f ON f.FUN_ID = uf.UF_FUNCION_ID AND f.FUN_ACTIVO = 1
    JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = uf.UF_USUARIO_ID AND u.NEUS_ACTIVO = 1
    WHERE f.FUN_CLAVE = @c`);
  return r.recordset;
}

module.exports = { FUNCIONES, usuariosConFuncion };
