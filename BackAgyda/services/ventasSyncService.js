/**
 * Histórico en la BD de Ventas (plata_prospectPRO).
 *
 * Cuando un formulario de Contact Center se guarda y la campaña del registro
 * pertenece a un grupo (CC_EQUIPOS) que tiene campaña de ventas asignada
 * (EQ_VENTAS_CAMPANA_ID: PlataCardADBA, Amex, Banamex…), el registro se copia
 * a la BD de Ventas igual que lo registra el sistema de Ventas:
 *   - Ventas        → la venta (cliente, teléfono, estatus = tipificación, agente, campaña)
 *   - CRMGestiones  → la gestión tipo 'tipificacion' ({ resultado, notas })
 * Así siguen funcionando el sistema de Ventas, las metas y sus reportes.
 *
 * Una venta por registro: CC_VENTAS_SYNC (en la BD de AGYDA) recuerda qué
 * venta generó cada interacción; si el registro se vuelve a guardar, se
 * actualiza esa venta (y solo se agrega otra gestión si cambió el estatus).
 *
 * Evidencia: pendiente de definir cómo se comparte con el servidor de Ventas.
 * Por ahora Ventas.evidencia queda vacía y la ruta del archivo de AGYDA va en
 * los datos de la gestión, para no perderla.
 */
const sql = require('mssql');
const dbVentas = require('../config/database_ventas');

let _poolVentas = null;
async function poolVentas() {
  if (_poolVentas && _poolVentas.connected) return _poolVentas;
  _poolVentas = await new sql.ConnectionPool(dbVentas).connect();
  return _poolVentas;
}

// Mismo criterio que ventasController: 10 dígitos, sin lada 52/521.
function normalizarTelefono(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('52')) return d.slice(2);
  if (d.length === 13 && d.startsWith('521')) return d.slice(3);
  return d;
}
const corta = (v, n) => (v == null ? null : String(v).trim().slice(0, n));

const conTabla = new WeakSet();
async function asegurarTabla(p) {
  if (conTabla.has(p)) return;
  await p.request().query(`
    IF OBJECT_ID('dbo.CC_VENTAS_SYNC', 'U') IS NULL
      CREATE TABLE dbo.CC_VENTAS_SYNC (
        VS_INTERACCION_ID     INT NOT NULL PRIMARY KEY,
        VS_VENTA_ID           INT NOT NULL,
        VS_CAMPANA_VENTAS_ID  INT NOT NULL,
        VS_ESTATUS            NVARCHAR(20) NULL,
        VS_FECHA              DATETIME NOT NULL DEFAULT GETDATE(),
        VS_ACTUALIZADO        DATETIME NULL
      );`);
  conTabla.add(p);
}

/**
 * Copia (o actualiza) en la BD de Ventas el registro de una interacción.
 * `p` = pool de la empresa (AGYDA). Devuelve { omitido } o { ventaId, nueva }.
 * `opts.pv` permite pasar la conexión a Ventas (pruebas con transacción).
 */
async function sincronizarRegistro(p, interaccionId, opts = {}) {
  const it = (await p.request().input('id', sql.Int, interaccionId).query(`
    SELECT i.CI_ID id, i.CI_CAMPANIA_ID campaniaId, i.CI_CLIENTE_NOMBRE nombre, i.CI_CLIENTE_TELEFONO telefono,
           i.CI_AGENTE_ID agenteId, i.CI_AGENTE_NOMBRE agenteNombre, t.CT_NOMBRE tipificacion
    FROM dbo.CCO_INTERACCIONES i
    LEFT JOIN dbo.CCO_TIPIFICACIONES t ON t.CT_ID = i.CI_TIPIFICACION_ID
    WHERE i.CI_ID = @id`)).recordset[0];
  if (!it || !it.campaniaId) return { omitido: 'sin campaña' };

  // Grupos activos de esa campaña con campaña de ventas asignada. Si hay
  // varios, manda el grupo donde el agente es miembro.
  const grupos = (await p.request().input('c', sql.Int, it.campaniaId).input('a', sql.Int, it.agenteId || 0).query(`
    SELECT DISTINCT e.EQ_ID id, e.EQ_VENTAS_CAMPANA_ID ventasId,
           CASE WHEN EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_MIEMBROS m WHERE m.EQM_EQUIPO_ID = e.EQ_ID AND m.EQM_USUARIO_ID = @a) THEN 1 ELSE 0 END esDelAgente
    FROM dbo.CC_EQUIPOS e
    WHERE e.EQ_ACTIVO = 1 AND e.EQ_VENTAS_CAMPANA_ID IS NOT NULL
      AND (e.EQ_CAMPANIA_ID = @c OR EXISTS (SELECT 1 FROM dbo.CC_EQUIPO_CAMPANIAS ec WHERE ec.EQC_EQUIPO_ID = e.EQ_ID AND ec.EQC_CAMPANIA_ID = @c))
    ORDER BY esDelAgente DESC, e.EQ_ID`)).recordset;
  if (!grupos.length) return { omitido: 'la campaña no está en un grupo con campaña de ventas' };
  const campanaVentasId = grupos[0].ventasId;

  // Respuestas del formulario: la evidencia (imagen/archivo) y las notas, si las hay.
  const extra = (await p.request().input('id', sql.Int, interaccionId).query(`
    SELECT c.FC_TIPO tipo, c.FC_CODIGO codigo, c.FC_ETIQUETA etiqueta, r.FIR_VALOR_TEXTO texto
    FROM dbo.CCF_INTERACCION_FORM_RESPUESTAS r
    JOIN dbo.CCF_FORM_CAMPOS c ON c.FC_ID = r.FIR_CAMPO_ID
    WHERE r.FIR_INTERACCION_ID = @id`)).recordset;
  const evidencia = extra.find((x) => ['imagen', 'archivo'].includes(x.tipo) && /^\/uploads\//.test(String(x.texto || '')))?.texto || null;
  const notas = extra.find((x) => x.tipo === 'texto_largo' && /nota|observ|coment/i.test(`${x.codigo} ${x.etiqueta}`))?.texto || '';

  const pv = opts.pv || await poolVentas();
  // Agente: su usuario en Ventas por nombre (como el inicio de sesión); si no existe, 0.
  const agenteNombre = String(it.agenteNombre || '').trim();
  const u = agenteNombre
    ? (await pv.request().input('n', sql.NVarChar, agenteNombre)
      .query(`SELECT TOP 1 idUser, nombreAgente FROM Users WHERE LTRIM(RTRIM(nombreAgente)) = @n COLLATE SQL_Latin1_General_CP1_CI_AI ORDER BY Activo DESC, idUser DESC`)).recordset[0]
    : null;
  const idUser = u?.idUser ?? 0;
  const nombreAgente = corta(u?.nombreAgente || agenteNombre, 100) || '';
  const estatus = corta(it.tipificacion || 'Pendiente', 20);
  const telefono = corta(normalizarTelefono(it.telefono), 20) || '';
  const nombreCliente = corta(it.nombre, 100) || '';

  await asegurarTabla(p);
  const previo = (await p.request().input('id', sql.Int, interaccionId)
    .query('SELECT VS_VENTA_ID ventaId, VS_ESTATUS estatus FROM dbo.CC_VENTAS_SYNC WHERE VS_INTERACCION_ID = @id')).recordset[0];

  let ventaId = previo?.ventaId ?? null;
  let nueva = false;
  if (ventaId) {
    const up = await pv.request()
      .input('id', sql.Int, ventaId).input('idUser', sql.Int, idUser).input('agente', sql.NVarChar, nombreAgente)
      .input('cliente', sql.NVarChar, nombreCliente).input('tel', sql.NVarChar, telefono)
      .input('estatus', sql.NVarChar, estatus).input('camp', sql.Int, campanaVentasId)
      .query(`UPDATE Ventas SET idUser = @idUser, nombreAgente = @agente, nombreCliente = @cliente, telefonoCliente = @tel,
                estatus = @estatus, campaignId = @camp WHERE idVenta = @id`);
    if (!up.rowsAffected[0]) ventaId = null; // la borraron en Ventas: se vuelve a crear
  }
  if (!ventaId) {
    const ins = await pv.request()
      .input('idUser', sql.Int, idUser).input('agente', sql.NVarChar, nombreAgente)
      .input('cliente', sql.NVarChar, nombreCliente).input('tel', sql.NVarChar, telefono)
      .input('estatus', sql.NVarChar, estatus).input('camp', sql.Int, campanaVentasId)
      .query(`INSERT INTO Ventas (idUser, nombreAgente, nombreCliente, telefonoCliente, estatus, evidencia, campaignId, fecha)
              OUTPUT INSERTED.idVenta id
              VALUES (@idUser, @agente, @cliente, @tel, @estatus, NULL, @camp, GETDATE())`);
    ventaId = ins.recordset[0].id;
    nueva = true;
  }

  // Gestión de tipificación: al crear la venta y cada vez que cambie el estatus.
  if (nueva || previo?.estatus !== estatus) {
    const datos = { resultado: estatus, notas: String(notas || ''), origen: 'AGYDA', interaccionId, ventaId };
    if (evidencia) datos.evidenciaAgyda = evidencia;
    await pv.request()
      .input('tel', sql.NVarChar, telefono).input('camp', sql.Int, campanaVentasId).input('idUser', sql.Int, idUser)
      .input('agente', sql.NVarChar, nombreAgente || 'AGYDA').input('datos', sql.NVarChar, JSON.stringify(datos))
      .query(`INSERT INTO CRMGestiones (telefono, campaignId, idUser, nombreAgente, tipo, datos, fecha)
              VALUES (@tel, @camp, @idUser, @agente, 'tipificacion', @datos, GETDATE())`);
    if (telefono) {
      await pv.request().input('tel', sql.NVarChar, telefono)
        .query('UPDATE CRMInteracciones SET ultimaGestion = GETDATE() WHERE telefono = @tel');
    }
  }

  await p.request()
    .input('id', sql.Int, interaccionId).input('v', sql.Int, ventaId).input('c', sql.Int, campanaVentasId).input('e', sql.NVarChar(20), estatus)
    .query(`MERGE dbo.CC_VENTAS_SYNC AS t USING (SELECT @id i) s ON t.VS_INTERACCION_ID = s.i
            WHEN MATCHED THEN UPDATE SET VS_VENTA_ID = @v, VS_CAMPANA_VENTAS_ID = @c, VS_ESTATUS = @e, VS_ACTUALIZADO = GETDATE()
            WHEN NOT MATCHED THEN INSERT (VS_INTERACCION_ID, VS_VENTA_ID, VS_CAMPANA_VENTAS_ID, VS_ESTATUS) VALUES (@id, @v, @c, @e);`);

  return { ventaId, nueva, campanaVentasId, estatus, idUser };
}

module.exports = { sincronizarRegistro, normalizarTelefono };
