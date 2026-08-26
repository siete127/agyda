const { getPool } = require('./databaseService');

const DETERMINED_ST_ITEMS = [
  {
    titulo: 'Encender equipos operativos',
    descripcion: '',
  },
  {
    titulo: 'Ejecutar comando "reboot" en sesiones SSH (moba)',
    descripcion: 'Saldos, saldo2, call.ardabytec, gennex2, azul, http://194.195.208.107/',
  },
  {
    titulo: 'Verificar actualizaciones en equipos call center',
    descripcion: '',
  },
  {
    titulo: 'Comprobar estado de equipos, diademas y periféricos',
    descripcion: '',
  },
  {
    titulo: 'Realizar pruebas de audio y sonido',
    descripcion: '',
  },
  {
    titulo: 'Validar estado de software productivo (AGYDA, gestión de ventas)',
    descripcion: '',
  },
  {
    titulo: 'Ejecutar protocolo de inicio en marcadores',
    descripcion: 'Restart vicidial, asterisk, keep alive, rasterisk, core, sip dialplan reload',
  },
  {
    titulo: 'Eliminar cookies y caché y abrir AGYDA en equipos de call center',
    descripcion: '',
  },
  {
    titulo: 'Abrir pestaña AGYDA',
    descripcion: '',
  },
  {
    titulo: 'Atender solicitudes por correo, tickets y chats de WhatsApp',
    descripcion: '',
  },
];

async function getOrCreateDay(date, userId, area = 'ST', tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('FECHA', date);
  req.input('AREA', area);
  let result = await req.query(`SELECT TOP 1 * FROM dbo.TI_CHECKLIST_DIAS WHERE FECHA = @FECHA AND AREA = @AREA`);
  if (result.recordset.length) return result.recordset[0];
  const insertReq = pool.request();
  insertReq.input('FECHA', date);
  insertReq.input('CREADO_POR', userId);
  insertReq.input('AREA', area);
  const insert = await insertReq.query(`INSERT INTO dbo.TI_CHECKLIST_DIAS (FECHA, CREADO_POR, AREA) OUTPUT INSERTED.* VALUES (@FECHA, @CREADO_POR, @AREA)`);
  return insert.recordset[0];
}

async function listItems(dayId, tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('DIA_ID', dayId);
  const result = await req.query(`SELECT * FROM dbo.TI_CHECKLIST_ITEMS WHERE DIA_ID = @DIA_ID AND ACTIVO = 1 ORDER BY ORDEN ASC, ITEM_ID ASC`);
  return result.recordset;
}

async function seedDeterminedItems(dayId, tenantKey) {
  // Semilla idempotente: inserta solo los títulos que no existan aún.
  const existing = await listItems(dayId, tenantKey);
  const existingTitles = new Set(
    existing.map((r) => String(r.TITULO || '').trim().toLowerCase()).filter(Boolean)
  );

  let inserted = 0;
  for (let i = 0; i < DETERMINED_ST_ITEMS.length; i++) {
    const t = DETERMINED_ST_ITEMS[i];
    const titleNorm = String(t.titulo || '').trim().toLowerCase();
    if (!titleNorm || existingTitles.has(titleNorm)) continue;

    await addItem(dayId, {
      titulo: t.titulo,
      descripcion: t.descripcion,
      orden: i,
    }, tenantKey);
    inserted++;
  }
  return inserted;
}

async function isDayClosedByDiaId(diaId, tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('DIA_ID', diaId);
  const result = await req.query(`SELECT TOP 1 * FROM dbo.TI_CHECKLIST_DIAS WHERE DIA_ID = @DIA_ID`);
  if (!result.recordset.length) return false;
  const row = result.recordset[0];
  if (row.CERRADO !== undefined) return !!row.CERRADO;
  const notas = row.NOTAS || '';
  return notas.includes('[CERRADO]');
}

async function isDayClosedByItemId(itemId, tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('ITEM_ID', itemId);
  const result = await req.query(`SELECT TOP 1 DIA_ID FROM dbo.TI_CHECKLIST_ITEMS WHERE ITEM_ID = @ITEM_ID`);
  if (!result.recordset.length) return false;
  const diaId = result.recordset[0].DIA_ID;
  return isDayClosedByDiaId(diaId, tenantKey);
}

async function addItem(dayId, { titulo, descripcion = null, prioridad = 'media', orden = 0 }, tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('DIA_ID', dayId);
  req.input('TITULO', titulo);
  req.input('DESCRIPCION', descripcion);
  req.input('PRIORIDAD', prioridad);
  req.input('ORDEN', orden);
  const result = await req.query(`
    INSERT INTO dbo.TI_CHECKLIST_ITEMS (DIA_ID, TITULO, DESCRIPCION, PRIORIDAD, ORDEN)
    OUTPUT INSERTED.*
    VALUES (@DIA_ID, @TITULO, @DESCRIPCION, @PRIORIDAD, @ORDEN)
  `);
  return result.recordset[0];
}

async function updateItem(itemId, fields, tenantKey) {
  const pool = await getPool(tenantKey);
  const columns = [];
  const req = pool.request();
  req.input('ITEM_ID', itemId);
  if (fields.titulo !== undefined) { columns.push('TITULO = @TITULO'); req.input('TITULO', fields.titulo); }
  if (fields.descripcion !== undefined) { columns.push('DESCRIPCION = @DESCRIPCION'); req.input('DESCRIPCION', fields.descripcion); }
  if (fields.prioridad !== undefined) { columns.push('PRIORIDAD = @PRIORIDAD'); req.input('PRIORIDAD', fields.prioridad); }
  if (fields.orden !== undefined) { columns.push('ORDEN = @ORDEN'); req.input('ORDEN', fields.orden); }
  columns.push('UPDATED_AT = GETDATE()');
  const sql = `UPDATE dbo.TI_CHECKLIST_ITEMS SET ${columns.join(', ')} WHERE ITEM_ID = @ITEM_ID; SELECT * FROM dbo.TI_CHECKLIST_ITEMS WHERE ITEM_ID = @ITEM_ID;`;
  const result = await req.query(sql);
  return result.recordset[0];
}

async function deleteItem(itemId, tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('ITEM_ID', itemId);
  await req.query(`UPDATE dbo.TI_CHECKLIST_ITEMS SET ACTIVO = 0, UPDATED_AT = GETDATE() WHERE ITEM_ID = @ITEM_ID`);
  return { success: true };
}

async function markComplete(itemId, userId, completed = true, tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('ITEM_ID', itemId);
  req.input('COMPLETADO', completed ? 1 : 0);
  req.input('USER_ID', userId);
  const sql = `
    UPDATE dbo.TI_CHECKLIST_ITEMS
    SET COMPLETADO = @COMPLETADO,
        COMPLETADO_POR = CASE WHEN @COMPLETADO = 1 THEN @USER_ID ELSE NULL END,
        COMPLETADO_AT = CASE WHEN @COMPLETADO = 1 THEN GETDATE() ELSE NULL END,
        UPDATED_AT = GETDATE()
    WHERE ITEM_ID = @ITEM_ID;
    SELECT * FROM dbo.TI_CHECKLIST_ITEMS WHERE ITEM_ID = @ITEM_ID;
  `;
  const result = await req.query(sql);
  return result.recordset[0];
}

async function copyDay(sourceDate, targetDate, userId, area = 'ST', tenantKey) {
  const pool = await getPool(tenantKey);
  const srcReq = pool.request();
  srcReq.input('FECHA', sourceDate);
  srcReq.input('AREA', area);
  let srcDay = await srcReq.query(`SELECT TOP 1 * FROM dbo.TI_CHECKLIST_DIAS WHERE FECHA = @FECHA AND AREA = @AREA`);
  if (!srcDay.recordset.length) return { copied: 0 };
  const targetDay = await getOrCreateDay(targetDate, userId, area, tenantKey);
  const items = await listItems(srcDay.recordset[0].DIA_ID, tenantKey);
  let copied = 0;
  for (const item of items) {
    await addItem(targetDay.DIA_ID, {
      titulo: item.TITULO,
      descripcion: item.DESCRIPCION,
      prioridad: item.PRIORIDAD,
      orden: item.ORDEN
    }, tenantKey);
    copied++;
  }
  return { copied, targetDay };
}

async function getHistory(fromDate, toDate, area = 'ST', tenantKey) {
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('FROM', fromDate);
  req.input('TO', toDate);
  req.input('AREA', area);
  const days = await req.query(`SELECT * FROM dbo.TI_CHECKLIST_DIAS WHERE FECHA BETWEEN @FROM AND @TO AND AREA = @AREA ORDER BY FECHA DESC`);
  const items = await req.query(`SELECT * FROM dbo.TI_CHECKLIST_ITEMS WHERE ACTIVO = 1 AND DIA_ID IN (SELECT DIA_ID FROM dbo.TI_CHECKLIST_DIAS WHERE FECHA BETWEEN @FROM AND @TO AND AREA = @AREA)`);
  return { days: days.recordset, items: items.recordset };
}

// Marca un día como cerrado. Si la tabla no tiene columnas CERRADO/CERRADO_POR/CERRADO_AT,
// se anotará en NOTAS y actualizará UPDATED_AT.
async function closeDay(date, userId, area = 'ST', tenantKey) {
  // Restringir la acción únicamente al área ST
  if (area !== 'ST') {
    throw new Error('Acción no permitida: solo el área ST puede cerrar el día');
  }
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('FECHA', date);
  req.input('AREA', area);
  req.input('USER_ID', userId);
  // Intentar actualizar columnas de cierre si existen; de lo contrario, usar NOTAS
  try {
    await req.query(`
      UPDATE dbo.TI_CHECKLIST_DIAS
      SET CERRADO = 1,
          CERRADO_POR = @USER_ID,
          CERRADO_AT = GETDATE(),
          UPDATED_AT = GETDATE()
      WHERE FECHA = @FECHA AND AREA = @AREA
    `);
    return { success: true };
  } catch (e) {
    // Fallback: añadir marca en NOTAS
    const alt = pool.request();
    alt.input('FECHA', date);
    alt.input('AREA', area);
    alt.input('USER_ID', userId);
    await alt.query(`
      UPDATE dbo.TI_CHECKLIST_DIAS
      SET NOTAS = CONCAT(ISNULL(NOTAS,''), CASE WHEN LEN(ISNULL(NOTAS,''))>0 THEN ' ' ELSE '' END, '[CERRADO]'),
          UPDATED_AT = GETDATE()
      WHERE FECHA = @FECHA AND AREA = @AREA
    `);
    return { success: true, noteOnly: true };
  }
}

// Reabre un día marcado como cerrado
async function openDay(date, userId, area = 'ST', tenantKey) {
  // Restringir la acción únicamente al área ST
  if (area !== 'ST') {
    throw new Error('Acción no permitida: solo el área ST puede abrir el día');
  }
  const pool = await getPool(tenantKey);
  const req = pool.request();
  req.input('FECHA', date);
  req.input('AREA', area);
  req.input('USER_ID', userId);
  try {
    await req.query(`
      UPDATE dbo.TI_CHECKLIST_DIAS
      SET CERRADO = 0,
          UPDATED_AT = GETDATE()
      WHERE FECHA = @FECHA AND AREA = @AREA
    `);
    return { success: true };
  } catch (e) {
    // Fallback: remover marca en NOTAS si existe
    const alt = pool.request();
    alt.input('FECHA', date);
    alt.input('AREA', area);
    await alt.query(`
      UPDATE dbo.TI_CHECKLIST_DIAS
      SET NOTAS = REPLACE(ISNULL(NOTAS,''), '[CERRADO]', ''),
          UPDATED_AT = GETDATE()
      WHERE FECHA = @FECHA AND AREA = @AREA
    `);
    return { success: true, noteOnly: true };
  }
}

module.exports = {
  getOrCreateDay,
  listItems,
  seedDeterminedItems,
  addItem,
  updateItem,
  deleteItem,
  markComplete,
  copyDay,
  getHistory,
  closeDay,
  openDay,
  isDayClosedByDiaId,
  isDayClosedByItemId
};
