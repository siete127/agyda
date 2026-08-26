const sql = require('mssql');
const config = {
  server: 'WIN-NRURD70NF62', database: 'intranet', user: 'sa', password: 'Y!2={1kU@5rQ',
  port: 1433, options: { encrypt: false, trustServerCertificate: true },
};
(async () => {
  try {
    const pool = await sql.connect(config);

    const nombres = ['Pedro de Kératry', 'Katherine Chenieve Velazquez Lopez', 'Edgar Montoya', 'Elvin Rojas Aguilar Maria', 'Araceli Maldonado Gutierrez'];
    for (const n of nombres) {
      const r = await pool.request()
        .input('n', sql.NVarChar, `%${n}%`)
        .query(`SELECT NEUS_ID, NEUS_USUARIO, NEUS_NOMBRES, NEUS_TIPOUSUARIO, NEUS_ACTIVO FROM NEUS_USUARIOS WHERE NEUS_NOMBRES LIKE @n`);
      console.log(`--- ${n} ---`);
      console.log(JSON.stringify(r.recordset, null, 2));
    }

    await pool.close();
  } catch (e) { console.error('ERROR:', e.message); }
})();
