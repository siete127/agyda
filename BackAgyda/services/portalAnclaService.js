const sql = require('mssql');

// "Cuenta principal" del Portal de Cliente: el login que se da desde Clientes
// (Acceso al sistema) o desde el CRM queda ligado al contacto por
// CRM_CONTACTOS.CONT_NEUS_ID, pero el portal resuelve a sus usuarios por
// PORTAL_USUARIOS. La migración migrar-portal-usuarios.js solo registró a los
// que existían entonces; los accesos dados después quedaban fuera y el portal
// les respondía "No hay un contacto vinculado a este usuario".
// Esto los registra como ancla (sub-rol Admin), igual que esa migración.

const SQL_ANCLAS_FALTANTES = `
  INSERT INTO dbo.PORTAL_USUARIOS (PU_NEUS_ID, PU_CONT_ID, PU_SUBROL_ID, PU_ES_ANCLA, PU_ACTIVO)
  SELECT c.CONT_NEUS_ID, c.CONT_ID, r.ROL_ID, 1, 1
  FROM dbo.CRM_CONTACTOS c
  JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = c.CONT_NEUS_ID AND UPPER(u.NEUS_TIPOUSUARIO) = 'CL'
  CROSS APPLY (SELECT TOP 1 ROL_ID FROM dbo.PORTAL_ROLES WHERE NOMBRE = 'Admin' AND ES_SISTEMA = 1 ORDER BY ROL_ID) r
  WHERE c.CONT_ES_CLIENTE = 1 AND c.CONT_NEUS_ID IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM dbo.PORTAL_USUARIOS pu WHERE pu.PU_NEUS_ID = c.CONT_NEUS_ID)`;

// Para un usuario (al entrar al portal) o un contacto (al avisarle algo).
async function asegurarAncla(pool, { neusId, contId } = {}) {
  const rq = pool.request();
  let filtro = '';
  if (neusId) { rq.input('n', sql.Int, neusId); filtro += ' AND c.CONT_NEUS_ID = @n'; }
  if (contId) { rq.input('c', sql.Int, contId); filtro += ' AND c.CONT_ID = @c'; }
  if (!filtro) return 0;
  const r = await rq.query(`${SQL_ANCLAS_FALTANTES}${filtro}`);
  return r.rowsAffected?.[0] ?? 0;
}

// Todos los faltantes de una empresa (al arrancar el servidor).
async function asegurarTodasLasAnclas(pool) {
  const r = await pool.request().query(SQL_ANCLAS_FALTANTES);
  return r.rowsAffected?.[0] ?? 0;
}

module.exports = { asegurarAncla, asegurarTodasLasAnclas };
