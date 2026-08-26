const service = require('../services/checklistService');
const { getIO } = require('../services/socketService');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');

// Helper: derive user's role (from JWT payload)
function getUserRole(req) {
  const role =
    req.user?.tipoUsuario ||
    req.user?.role ||
    req.user?.tipousuario ||
    req.user?.ROL ||
    req.user?.rol;
  return (role ? String(role) : '').trim().toUpperCase();
}

// Helper: derive username (from JWT payload)
function getUsername(req) {
  const u =
    req.user?.ventasUsuario ||
    req.user?.username ||
    req.user?.user ||
    req.user?.usuario ||
    req.user?.USUARIO;
  return (u ? String(u) : '').trim().toUpperCase();
}

function normalizeArea(v) {
  const a = (v ? String(v) : '').trim().toUpperCase();
  // En checklist, usuarios tipo TI deben operar como ST (misma área en BD).
  if (a === 'TI') return 'ST';
  return a;
}

// Helper: resolve checklist AREA safely.
// - Para AD, se permite seleccionar explícitamente 'ST' o 'AD' via query/body.
// - Para otros roles, NO se confía en query/body (evita escalación de privilegios).
function resolveArea(req) {
  const role = getUserRole(req);
  const requested = normalizeArea(req.query.area || req.body.area);

  if (role === 'AD') {
    if (requested && ['ST', 'AD'].includes(requested)) return requested;
    return 'ST';
  }

  const fromRole = normalizeArea(role);
  return fromRole || 'ST';
}

function ensureCanManage(req, res) {
  const role = getUserRole(req);
  if (!['AD', 'ST'].includes(role)) {
    res.status(403).json({ error: 'Acción permitida solo para usuarios AD o ST' });
    return false;
  }
  return true;
}

function ensureCanToggle(req, res) {
  const role = getUserRole(req);
  const username = getUsername(req);
  // Permitir resolver checklist a AD/ST y a TI (y usuarios TI específicos por compatibilidad).
  const allowedUsers = new Set(['TI_0103', 'TI_1005']);
  if (!['AD', 'ST', 'TI'].includes(role) && !allowedUsers.has(username)) {
    res.status(403).json({ error: 'No tienes permisos para resolver la checklist' });
    return false;
  }
  return true;
}

exports.getDay = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Falta parámetro date' });

    const area = resolveArea(req);
    const role = getUserRole(req);
    const username = getUsername(req);

    const day = await service.getOrCreateDay(
      date,
      req.user?.id || req.user?.ID_USUARIO || 0,
      area,
      req.user?.empresa
    );

    let items = await service.listItems(day.DIA_ID, req.user?.empresa);

    // Si el checklist ST está vacío, sembrar tareas base para que TI/ST pueda marcar.
    // (Evita que el usuario vea la pantalla "en blanco".)
    const canSeed =
      ['AD', 'ST', 'TI'].includes(role) ||
      (username && username.startsWith('TI_'));
    if (area === 'ST' && items.length === 0 && canSeed) {
      const inserted = await service.seedDeterminedItems(day.DIA_ID, req.user?.empresa);
      if (inserted > 0) {
        items = await service.listItems(day.DIA_ID, req.user?.empresa);
      }
    }

    res.json({ day, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.addItem = async (req, res) => {
  try {
    if (!ensureCanManage(req, res)) return; // restrict who can add
    const { titulo, descripcion, prioridad, orden } = req.body;
    const dayId = req.body.dayId || req.body.diaId; // aceptar ambos nombres
    if (!dayId || !titulo) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const did = Number(dayId);
    const item = await service.addItem(did, { titulo, descripcion, prioridad, orden }, req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      io.emit('checklist:itemAdded', { dayId: did, item });
    } catch (e) {
      // no-op: socket not initialized
    }

    // Notificar a usuarios del área ST cuando se agrega una nueva tarea
    try {
      const pool = await databaseService.getPool(req.user?.empresa);
      // Obtener fecha del día para construir una ruta navegable
      let fechaStr = null;
      try {
        const rsDia = await pool.request()
          .input('DIA_ID', require('mssql').Int, did)
          .query(`SELECT TOP 1 FECHA, AREA FROM dbo.TI_CHECKLIST_DIAS WHERE DIA_ID = @DIA_ID`);
        if (rsDia.recordset.length) {
          const f = rsDia.recordset[0].FECHA;
          const d = new Date(f);
          const yyyy = String(d.getFullYear()).padStart(4,'0');
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          fechaStr = `${yyyy}-${mm}-${dd}`;
        }
      } catch (_) {}

      const rs = await pool.request().query(`
        SELECT NEUS_ID as id
        FROM NEUS_USUARIOS
        WHERE NEUS_TIPOUSUARIO = 'ST' AND ISNULL(NEUS_ACTIVO,1) = 1
      `);
      const usuariosST = rs.recordset.map(r => Number(r.id)).filter(Boolean);
      const mensaje = `Nueva tarea en checklist: ${titulo}`;
      for (const uid of usuariosST) {
        await notificationService.createNotification({
          usuarioId: uid,
          mensaje,
          tipo: 'checklist',
          // Incluir ruta para navegación directa desde la notificación
          dataExtra: {
            dayId: did,
            itemId: item.ITEM_ID || item.itemId || null,
            titulo,
            route: fechaStr ? `/checklist?date=${fechaStr}` : '/checklist'
          },
          tenantKey: req.user?.empresa,
        });
      }
    } catch (e) {
      console.warn('⚠️ Error notificando usuarios ST:', e?.message || e);
    }
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    if (!ensureCanManage(req, res)) return; // restrict who can update
    const { id } = req.params; 
    const updated = await service.updateItem(Number(id), req.body || {}, req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      io.emit('checklist:itemUpdated', { itemId: Number(id), item: updated });
    } catch (e) {}
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    if (!ensureCanManage(req, res)) return; // restrict who can delete
    const { id } = req.params;
    const result = await service.deleteItem(Number(id), req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      io.emit('checklist:itemDeleted', { itemId: Number(id) });
    } catch (e) {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.toggleComplete = async (req, res) => {
  try {
    if (!ensureCanToggle(req, res)) return; // restrict who can toggle
    const { id } = req.params;
    const { completed } = req.body;
    const item = await service.markComplete(Number(id), req.user?.id || req.user?.ID_USUARIO || 0, completed, req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      // Include dayId for client-side filtering
      const dayId = item?.DIA_ID || item?.diaId;
      io.emit('checklist:itemToggled', { itemId: Number(id), completed: !!completed, item, dayId });
    } catch (e) {}
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.copy = async (req, res) => {
  try {
    if (!ensureCanManage(req, res)) return; // restrict who can copy
    const { sourceDate, targetDate } = req.body;
    if (!sourceDate || !targetDate) return res.status(400).json({ error: 'Faltan fechas' });
    const area = resolveArea(req);
    const result = await service.copyDay(sourceDate, targetDate, req.user?.id || req.user?.ID_USUARIO || 0, area, req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      io.emit('checklist:dayCopied', { area, sourceDate, targetDate, copied: result.copied, targetDay: result.targetDay });
    } catch (e) {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.history = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Faltan parámetros from/to' });
    const area = resolveArea(req);
    const result = await service.getHistory(from, to, area, req.user?.empresa);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.closeDay = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Falta parámetro date' });
    if (!ensureCanManage(req, res)) return;
    const result = await service.closeDay(date, req.user?.id || req.user?.ID_USUARIO || 0, 'ST', req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      io.emit('checklist:dayClosed', { area: 'ST', date });
    } catch (e) {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.openDay = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Falta parámetro date' });
    if (!ensureCanManage(req, res)) return;
    const result = await service.openDay(date, req.user?.id || req.user?.ID_USUARIO || 0, 'ST', req.user?.empresa);
    try {
      const io = getIO(req.user?.empresa);
      io.emit('checklist:dayOpened', { area: 'ST', date });
    } catch (e) {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
