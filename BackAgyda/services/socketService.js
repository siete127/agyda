const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const corsConfig = require('../config/cors');
const databaseService = require('./databaseService');
const sql = require('mssql');
const { DEFAULT_TENANT } = require('../config/tenants');
const pausaTiposService = require('./pausaTiposService');

let io;

// status_id del baño en ESTA empresa: el tipo de pausa con clave 'sanitario'
// (su id cambia entre empresas; ver pausaTiposService).
const SQL_BANIO = `(SELECT status_id FROM dbo.STATUS WHERE clave = 'sanitario')`;

// ── Baño ─────────────────────────────────────────────────────────────────
// Los baños son "espacios" configurables (Configuración → Tipos de pausa →
// Baño → Espacios, tabla STATUS_ESPACIOS): cada uno con género (o mixto),
// capacidad y las áreas que lo usan. Al entrar se asigna el primer espacio
// que le corresponde al usuario y tenga lugar. Si ningún espacio le
// corresponde (su área no tiene baño asignado), la pausa se registra igual
// pero sin semáforo.
//
// Por empresa — dos empresas nunca ven ni afectan el estado de la otra:
//   espacios  → configuración (caché; null = sin cargar)
//   ocupantes → Map(userId -> { userId, nombre, genero, area, espacioId, tiempoId, desde })
const banioByTenant = new Map();
const usuarioCacheByTenant = new Map(); // tenantKey -> Map(userId -> {genero, nombre, area, ts})
const USUARIO_CACHE_MS = 10 * 60 * 1000;

function getBanio(tenantKey) {
  if (!banioByTenant.has(tenantKey)) banioByTenant.set(tenantKey, { espacios: null, ocupantes: new Map() });
  return banioByTenant.get(tenantKey);
}

function getUsuarioCache(tenantKey) {
  if (!usuarioCacheByTenant.has(tenantKey)) usuarioCacheByTenant.set(tenantKey, new Map());
  return usuarioCacheByTenant.get(tenantKey);
}

// Sin tabla de espacios (BD que aún no corre el esquema) → los 2 de siempre.
function espaciosDeRespaldo() {
  return pausaTiposService.ESPACIOS_DEFAULT.map((e, i) => ({ ...e, id: -(i + 1), statusId: null, orden: i + 1 }));
}

async function cargarEspacios(tenantKey) {
  const b = getBanio(tenantKey);
  try {
    const pool = await databaseService.getPool(tenantKey);
    const r = await pool.request().query(`
      SELECT ESPACIO_ID, STATUS_ID, NOMBRE, GENERO, CAPACIDAD, AREAS, ORDEN
      FROM dbo.STATUS_ESPACIOS WHERE STATUS_ID IN ${SQL_BANIO}
      ORDER BY ORDEN, ESPACIO_ID`);
    b.espacios = r.recordset.length ? r.recordset.map(pausaTiposService.mapEspacio) : espaciosDeRespaldo();
  } catch (e) {
    console.warn(`[BAÑO][${tenantKey}] No se pudieron leer los espacios:`, e?.message);
    b.espacios = espaciosDeRespaldo();
  }
  return b;
}

async function asegurarEspacios(tenantKey) {
  const b = getBanio(tenantKey);
  return b.espacios ? b : cargarEspacios(tenantKey);
}

const ocupantesDe = (b, espacioId) => [...b.ocupantes.values()].filter((o) => o.espacioId === espacioId);

// Espacio para alguien que entra: el primero que le corresponde y tiene lugar.
//   { espacio }            → entra ahí
//   { espacio: null }      → le corresponden espacios pero todos están llenos
//   { sinControl: true }   → ningún espacio le corresponde: entra sin semáforo
// `forzar` (al reconstruir/reubicar a quien ya está adentro): si todos están
// llenos, lo deja en el primero que le corresponde aunque se pase del cupo.
function elegirEspacio(b, genero, area, forzar = false) {
  const aplican = b.espacios.filter((e) => pausaTiposService.aplicaEspacio(e, genero, area));
  if (!aplican.length) return { espacio: null, sinControl: true };
  const libre = aplican.find((e) => ocupantesDe(b, e.id).length < e.capacidad);
  return { espacio: libre || (forzar ? aplican[0] : null), sinControl: false };
}

// Estado que se manda a los clientes. `hombres`/`mujeres` es el formato
// anterior (un baño por género), por compatibilidad con clientes viejos.
function estadoPublico(b) {
  const espacios = b.espacios || [];
  const ids = new Set(espacios.map((e) => e.id));
  const pub = (o) => ({ userId: o.userId, nombre: o.nombre });
  const todos = [...b.ocupantes.values()];
  const legado = (g) => {
    const o = todos.find((x) => x.genero === g && x.espacioId !== null);
    return o
      ? { ocupado: true, porUsuario: o.userId, porNombre: o.nombre, genero: g, tiempoId: o.tiempoId }
      : { ocupado: false, porUsuario: null, porNombre: null, genero: g, tiempoId: null };
  };
  return {
    espacios: espacios.map((e) => ({
      id: e.id, nombre: e.nombre, genero: e.genero, capacidad: e.capacidad, areas: e.areas,
      ocupantes: ocupantesDe(b, e.id).map(pub),
    })),
    sinEspacio: todos.filter((o) => o.espacioId === null || !ids.has(o.espacioId)).map(pub),
    hombres: legado('M'),
    mujeres: legado('F'),
  };
}

function emitirBanio(tenantKey) {
  io?.to(`tenant:${tenantKey}`).emit('banio:status', estadoPublico(getBanio(tenantKey)));
}

// Después de cambiar la configuración: recarga los espacios y reubica a
// quien esté en un espacio que ya no existe o que ya no le corresponde.
async function recargarEspacios(tenantKey) {
  const b = await cargarEspacios(tenantKey);
  const reubicar = [];
  for (const o of b.ocupantes.values()) {
    const e = b.espacios.find((x) => x.id === o.espacioId);
    if (!e || !pausaTiposService.aplicaEspacio(e, o.genero, o.area)) { o.espacioId = null; reubicar.push(o); }
  }
  for (const o of reubicar.sort((x, y) => x.desde - y.desde)) {
    o.espacioId = elegirEspacio(b, o.genero, o.area, true).espacio?.id ?? null;
  }
  emitirBanio(tenantKey);
}

// Resuelve la empresa de un socket a partir del JWT enviado en el handshake
// (auth.token, igual que el cliente HTTP). Sin token válido, cae a la
// empresa por defecto para no romper clientes viejos sin este campo.
function resolveTenantFromSocket(socket) {
  try {
    const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (!token) return DEFAULT_TENANT;
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'AKOLATRONIC');
    return (payload?.empresa || DEFAULT_TENANT).toLowerCase();
  } catch (_) {
    return DEFAULT_TENANT;
  }
}

const NOMBRES_FEMENINOS = new Set([
  'ana','maria','lucia','laura','sofia','valentina','andrea','alejandra','monica',
  'gabriela','patricia','rosa','carmen','isabel','veronica','adriana','claudia',
  'diana','fernanda','jessica','karla','leticia','luz','martha','nancy','norma',
  'paola','rebeca','silvia','susana','teresa','vanessa','yolanda','brenda','celia',
  'daniela','elena','esperanza','fabiola','gloria','graciela','irene','janeth',
  'josefina','karina','liliana','lorena','magdalena','marisol','miriam','nadia',
  'olivia','perla','rocio','sandra','tania','wendy','xochitl','yarely','zulema',
  'alicia','amalia','aurora','beatriz','blanca','cecilia','consuelo','cristina',
  'dolores','edith','elsa','emma','esther','eugenia','eva','fatima','flor','griselda',
  'guadalupe','hilda','ingrid','ivonne','jacqueline','lourdes','luisa','margarita',
  'mariana','maricela','mariela','marina','marlene','marta','mercedes','natalia',
  'noemi','nora','ofelia','pilar','raquel','reyna','ruth','sarai','selena','sheila',
  'stefania','thalia','yatziri','ximena','ines','jazmin','america','danna','erika',
  'itzel','ivana','lizbeth','mayte','melanie','michelle','mirna','nallely','nayeli',
  'pamela','priscila','valeria','viviana','yesenia','bertha','abigail','dayana',
  'dafne','sarahi','angelica','cherry','cindy','marilyn','maricruz','midory','michel',
  'camila','alondra','araceli','ariana','ashley','astrid','bianca','celeste','citlali',
  'cynthia','dulce','esmeralda','fanny','genesis','giselle','ilse','imelda','iris',
  'isela','jimena','joanna','judith','karen','katerine','keila','kenia','lesly',
  'lilia','lina','lisette','lizeth','liz','lucero','lupita','mabel','marcela',
  'mayra','monserrat','montserrat','myrna','naomi','nathaly','nidia','nohemi',
  'odette','paulina','remedios','renata','rosario','ruby','samantha','sara','socorro',
  'soledad','sonia','soraya','tamara','tatiana','trinidad','violeta','virginia',
  'xitlali','yahaira','yazmin','yesica','yuridia','zaira','perla','haydeé','haydee',
]);

const NOMBRES_MASCULINOS = new Set([
  'jose','juan','luis','carlos','miguel','jorge','antonio','francisco','manuel',
  'alejandro','roberto','daniel','david','eduardo','fernando','hector','ivan',
  'javier','jesus','jonathan','mario','oscar','pablo','pedro','rafael','raul',
  'ricardo','sergio','victor','alberto','alfredo','andres','angel','armando',
  'arturo','benjamin','cesar','christian','cristian','edgar','enrique','ernesto','fabian',
  'felipe','gabriel','gerardo','gilberto','gonzalo','guillermo','gustavo','hugo',
  'ignacio','ismael','israel','jaime','joel','julian','leonel','marco','marcos',
  'martin','mauricio','moises','noe','omar','rodrigo','rogelio','ruben','salvador',
  'samuel','santiago','saul','sebastian','tomas','uriel','xavier','alan','alexis',
  'alonso','axel','brandon','bryan','christopher','diego','eder','emilio','erik',
  'ezequiel','giovanni','kevin','leonardo','lucas','mateo','nicolas','oliver',
  'patrick','rene','ulises','aldo','lalo','nacho','pepe','poncho','memo',
]);

function detectarGeneroNombre(nombreCompleto) {
  const primer = (nombreCompleto || '').trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (NOMBRES_FEMENINOS.has(primer)) return 'F';
  if (NOMBRES_MASCULINOS.has(primer)) return 'M';
  if (primer.endsWith('o') || primer.endsWith('or') || primer.endsWith('on')) return 'M';
  return 'F'; // fallback femenino
}

// Género: NEUS_GENERO si está definido; si no, detección por nombre.
function generoDe(nombre, generoDb) {
  const g = (generoDb || '').trim().toUpperCase();
  return (g === 'M' || g === 'F') ? g : detectarGeneroNombre(nombre);
}
const nombreCorto = (nombre) => (nombre || '').trim().split(/\s+/).slice(0, 2).join(' ');

// Género, nombre y área (NEUS_TIPOUSUARIO) desde caché o BD. Autoritativo,
// nunca usa lo que manda el cliente. La caché vence para tomar cambios de área.
async function getInfoUsuario(userId, tenantKey) {
  const cache = getUsuarioCache(tenantKey);
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < USUARIO_CACHE_MS) return hit;
  try {
    const pool = await databaseService.getPool(tenantKey);
    const r = await pool.request()
      .input('neusId', sql.Int, parseInt(userId) || 0)
      .query('SELECT TOP 1 NEUS_NOMBRES as nombre, NEUS_GENERO as generoDb, NEUS_TIPOUSUARIO as area FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId');
    if (r.recordset.length > 0) {
      const u = r.recordset[0];
      const info = { genero: generoDe(u.nombre, u.generoDb), nombre: nombreCorto(u.nombre), area: String(u.area || '').trim().toUpperCase(), ts: Date.now() };
      cache.set(key, info);
      return info;
    }
  } catch (_) {}
  return hit || null;
}

// Al arrancar: quién está en el baño según las pausas abiertas. Las de hace
// más de 4 horas se consideran olvidadas (se cierran al volver a entrar).
async function reconstituirEstadoBanio(tenantKey) {
  try {
    const b = await cargarEspacios(tenantKey);
    const pool = await databaseService.getPool(tenantKey);
    const r = await pool.request().query(`
      SELECT t.neus_id, t.tiempo_id, t.fecha_inicio, u.NEUS_NOMBRES as nombre, u.NEUS_GENERO as generoDb, u.NEUS_TIPOUSUARIO as area
      FROM USUARIO_TIEMPOS t
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.neus_id
      WHERE t.status_id IN ${SQL_BANIO} AND t.fecha_fin IS NULL
        AND t.fecha_inicio >= DATEADD(HOUR, -4, GETDATE())
      ORDER BY t.fecha_inicio ASC
    `);
    b.ocupantes = new Map();
    for (const row of r.recordset) {
      const userId = String(row.neus_id);
      if (b.ocupantes.has(userId)) continue;
      const genero = generoDe(row.nombre, row.generoDb);
      const area = String(row.area || '').trim().toUpperCase();
      b.ocupantes.set(userId, {
        userId, nombre: nombreCorto(row.nombre), genero, area,
        espacioId: elegirEspacio(b, genero, area, true).espacio?.id ?? null,
        tiempoId: row.tiempo_id,
        desde: new Date(row.fecha_inicio).getTime() || Date.now(),
      });
    }
  } catch (e) {
    console.warn(`[BAÑO][${tenantKey}] No se pudo reconstituir estado desde BD:`, e?.message);
  }
}

// Cada minuto: saca de memoria a quien ya no tiene su pausa de baño abierta
// en la BD (la cerró otra pantalla, un cierre automático, etc.), para que no
// ocupe un lugar que ya está libre.
async function depurarOcupantes(tenantKey) {
  const b = getBanio(tenantKey);
  const candidatos = [...b.ocupantes.values()].filter((o) => o.tiempoId && Date.now() - o.desde > 15_000);
  if (!candidatos.length) return;
  try {
    const pool = await databaseService.getPool(tenantKey);
    const r = await pool.request().query(
      `SELECT DISTINCT neus_id FROM USUARIO_TIEMPOS WHERE status_id IN ${SQL_BANIO} AND fecha_fin IS NULL`);
    const abiertos = new Set(r.recordset.map((x) => String(x.neus_id)));
    let cambio = false;
    for (const o of candidatos) {
      if (!abiertos.has(o.userId) && b.ocupantes.get(o.userId) === o) { b.ocupantes.delete(o.userId); cambio = true; }
    }
    if (cambio) emitirBanio(tenantKey);
  } catch (_) { /* se reintenta en el siguiente minuto */ }
}

function initialize(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["polling", "websocket"],
    allowEIO3: true                // 🔵 NECESARIO PARA FLUTTER WEB
  });

  const logger = global.logger || require('../utils/logger');

  // Reconstituir estado del baño desde BD al arrancar, por cada empresa
  require('../config/tenants').listTenants().forEach(({ key }) => {
    reconstituirEstadoBanio(key).then(() => {
      const b = getBanio(key);
      console.log(`[BAÑO][${key}] Estado reconstituido: ${b.espacios?.length ?? 0} espacio(s), ${b.ocupantes.size} adentro`);
    });
  });
  setInterval(() => {
    for (const [key, b] of banioByTenant) if (b.ocupantes.size) depurarOcupantes(key);
  }, 60_000).unref();

  io.on('connection', (socket) => {
    const tenantKey = resolveTenantFromSocket(socket);
    socket.tenantKey = tenantKey;
    socket.join(`tenant:${tenantKey}`);
    logger.info("🔵 Cliente conectado:", socket.id, 'empresa:', tenantKey);

    socket.on('joinTicket', (ticketId) => {
        try {
          socket.join(`tenant:${tenantKey}:ticket:${ticketId}`);
          logger.debug(`🔗 Socket ${socket.id} joined ticket:${ticketId} (empresa ${tenantKey})`);
        } catch (e) {
          console.warn('⚠️ Error joining ticket room:', e?.message || e);
        }
    });

    socket.on('leaveTicket', (ticketId) => {
      socket.leave(`tenant:${tenantKey}:ticket:${ticketId}`);
    });

    socket.on('joinUser', (userId) => {
        try {
          socket.join(`tenant:${tenantKey}:user:${userId}`);
          console.warn(`[SOCKET] joinUser: socket=${socket.id} → room=tenant:${tenantKey}:user:${userId}`);
        } catch (e) {
          console.warn('⚠️ Error joining user room:', e?.message || e);
        }
    });

    socket.on('leaveUser', (userId) => {
      socket.leave(`tenant:${tenantKey}:user:${userId}`);
    });

    socket.on('banio:toggle', async (payload) => {
      try {
        const userId = String(payload?.userId ?? '');
        if (!userId || userId === 'null' || userId === 'undefined') return;

        const b = await asegurarEspacios(tenantKey);

        // 1. Género y área reales desde caché/BD — SIEMPRE autoritativos, nunca del cliente
        const info = await getInfoUsuario(userId, tenantKey);
        const genero = info?.genero ?? (payload?.genero === 'F' ? 'F' : 'M');
        const userName = info?.nombre ?? (payload?.userName ?? 'Alguien');
        const area = info?.area ?? '';

        // Entrar requiere la acción reports:gestionar-pausas (mismo permiso que
        // /api/reports/pausa/*). Salir siempre se permite, para que nadie se
        // quede "adentro" si le quitan el permiso a media pausa.
        if (!b.ocupantes.has(userId)) {
          const { getEmpresaModulosBloqueados, getUserAllowedActions } = require('../middleware/moduleAccess');
          const bloqueados = await getEmpresaModulosBloqueados(tenantKey);
          const acciones = bloqueados.has('reports') ? new Set() : await getUserAllowedActions(userId, 'reports', tenantKey);
          if (!acciones.has('*') && !acciones.has('gestionar-pausas')) {
            logger.warn(`[BAÑO][${tenantKey}] userId=${userId} sin permiso reports:gestionar-pausas — toggle ignorado`);
            socket.emit('banio:status', estadoPublico(b));
            return;
          }
        }

        // 2. Entrar o salir. Desde aquí no hay awaits: revisar el cupo y
        //    ocupar el lugar pasa de una sola vez (sin carreras entre dos que
        //    entran al mismo tiempo).
        const adentro = b.ocupantes.get(userId);
        logger.info(`[BAÑO][${tenantKey}] toggle userId=${userId} nombre="${userName}" genero=${genero} area=${area} adentro=${!!adentro}`);

        if (adentro) {
          // ── SALIR ──────────────────────────────────────────────────────────
          const tiempoId = adentro.tiempoId ?? null;
          b.ocupantes.delete(userId);
          emitirBanio(tenantKey);
          logger.info(`[BAÑO][${tenantKey}] ${userName} salió (espacio ${adentro.espacioId ?? 'sin semáforo'})`);

          setImmediate(async () => {
            try {
              const pool = await databaseService.getPool(tenantKey);
              const neusIdInt = parseInt(userId) || 0;
              if (tiempoId) {
                await pool.request()
                  .input('tiempoId', sql.Int, tiempoId)
                  .query(`UPDATE USUARIO_TIEMPOS SET fecha_fin = GETDATE() WHERE tiempo_id = @tiempoId AND fecha_fin IS NULL`);
                logger.info(`[BAÑO][${tenantKey}] Cierre BD tiempoId=${tiempoId}`);
              } else {
                await pool.request()
                  .input('neusId', sql.Int, neusIdInt)
                  .query(`UPDATE USUARIO_TIEMPOS SET fecha_fin = GETDATE() WHERE neus_id = @neusId AND status_id IN ${SQL_BANIO} AND fecha_fin IS NULL`);
                logger.info(`[BAÑO][${tenantKey}] Cierre BD fallback neusId=${userId}`);
              }
            } catch (dbErr) { logger.warn(`[BAÑO][${tenantKey}] Error cerrando BD:`, dbErr?.message); }
          });
          return;
        }

        const { espacio, sinControl } = elegirEspacio(b, genero, area);
        if (!espacio && !sinControl) {
          // ── TODOS SUS BAÑOS LLENOS — rechazar ──────────────────────────────
          logger.info(`[BAÑO][${tenantKey}] ${userName} intentó entrar pero sus baños están llenos`);
          socket.emit('banio:status', estadoPublico(b));
          socket.emit('banio:rechazado', { message: 'Los baños que te corresponden están ocupados' });
          return;
        }

        // ── ENTRAR ───────────────────────────────────────────────────────────
        const ocupante = { userId, nombre: userName, genero, area, espacioId: espacio?.id ?? null, tiempoId: null, desde: Date.now() };
        b.ocupantes.set(userId, ocupante);
        emitirBanio(tenantKey);
        logger.info(`[BAÑO][${tenantKey}] ${userName} entró a ${espacio ? `"${espacio.nombre}"` : 'baño sin semáforo (su área no tiene espacio)'}`);

        setImmediate(async () => {
          try {
            const pool = await databaseService.getPool(tenantKey);
            const neusIdInt = parseInt(userId) || 0;
            // Cerrar cualquier registro previo abierto de este usuario (limpieza defensiva)
            await pool.request()
              .input('neusId', sql.Int, neusIdInt)
              .query(`UPDATE USUARIO_TIEMPOS SET fecha_fin = GETDATE() WHERE neus_id = @neusId AND status_id IN ${SQL_BANIO} AND fecha_fin IS NULL`);
            // Abrir nuevo registro
            const r = await pool.request()
              .input('neusId', sql.Int, neusIdInt)
              .query(`
                DECLARE @ids TABLE (id INT);
                -- Sin creado_en: no existe en todas las BD (donde existe, su DEFAULT lo llena),
                -- igual que reportController.iniciarPausa.
                INSERT INTO USUARIO_TIEMPOS (neus_id, status_id, fecha_inicio)
                OUTPUT INSERTED.tiempo_id INTO @ids(id)
                SELECT TOP 1 @neusId, s.status_id, GETDATE() FROM dbo.STATUS s WHERE s.status_id IN ${SQL_BANIO};
                SELECT id AS tiempoId FROM @ids;
              `);
            const tiempoId = r.recordset[0]?.tiempoId ?? null;
            logger.info(`[BAÑO][${tenantKey}] Inicio BD tiempoId=${tiempoId} userId=${userId}`);
            // Guardar tiempoId en memoria (solo si sigue adentro con esta misma entrada)
            if (b.ocupantes.get(userId) === ocupante) ocupante.tiempoId = tiempoId;
          } catch (dbErr) { logger.warn(`[BAÑO][${tenantKey}] Error abriendo BD:`, dbErr?.message); }
        });
      } catch (e) {
        logger.warn('[BAÑO] Error en banio:toggle:', e?.message || e);
      }
    });

    socket.on('banio:get', async () => {
      socket.emit('banio:status', estadoPublico(await asegurarEspacios(tenantKey)));
    });

    socket.on('disconnect', () => {
      logger.info("🔴 Cliente desconectado:", socket.id);
    });

    // Relay de eventos de collage enviados por clientes (compatibilidad)
    // Cuando algún cliente (p.ej., Flutter web) emite 'newsLayout:update',
    // reenviamos como 'noticia:layoutChanged' para que todos los clientes se enteren.
    socket.on('newsLayout:update', (data) => {
      try {
        // data puede contener { key, hash, order, ... }
        io.to(`tenant:${tenantKey}`).emit('noticia:layoutChanged', {
          ...data,
          timestamp: new Date().toISOString(),
        });
        logger.debug('📡 Relay noticia:layoutChanged desde newsLayout:update');
      } catch (e) {
        console.warn('⚠️ Error relaying newsLayout:update:', e?.message || e);
      }
    });

    // Manejar creación de comentario de ticket enviado por cliente via socket
    socket.on('ticket:comment:create', async (payload, callback) => {
      try {
        if (!payload) return;
        const ticketId = Number(payload.ticketId || payload.tid || payload.ticket_id);
        const autorId = Number(payload.autorId || payload.usuarioId || payload.userId || payload.autor_id);
        const contenido = payload.contenido || payload.texto || payload.mensaje || payload.message;
          logger.debug(`📨 Received ticket:comment:create from socket ${socket.id}: ticket=${ticketId} autor=${autorId}`);
        if (!ticketId || !autorId || !contenido) {
          if (callback) callback({ success: false, message: 'Invalid payload' });
          return;
        }

        const pool = await databaseService.getPool(tenantKey);

        // Insertar comentario (igual que en el controlador)
        const insertRs = await pool.request()
          .input('tid', sql.Int, ticketId)
          .input('uid', sql.Int, autorId)
          .input('txt', sql.NVarChar, contenido)
          .query(`
            DECLARE @newId TABLE (ID INT);
            INSERT INTO TICKET_COMENTARIOS (TICKET_ID, USER_ID, CONTENIDO)
            OUTPUT inserted.COM_ID INTO @newId(ID)
            VALUES (@tid, @uid, @txt);
            SELECT ID FROM @newId;
          `);

        // Insertar historial básico
        await pool.request().input('tid', sql.Int, ticketId).input('uid', sql.Int, autorId)
          .query(`INSERT INTO TICKET_HISTORIAL (TICKET_ID, TIPO, USER_ID) VALUES (@tid, 'comentario', @uid)`);

        // Obtener el comentario insertado con nombre de usuario
        const lastId = insertRs?.recordset?.[0]?.ID;
        if (lastId) {
          const rsOne = await pool.request()
            .input('tid', sql.Int, ticketId)
            .input('cid', sql.Int, lastId)
            .query(`
              SELECT c.COM_ID as id, c.USER_ID as userId, u.NEUS_NOMBRES as userNombre,
                     c.CONTENIDO as contenido, c.CREATED_AT as createdAt
              FROM TICKET_COMENTARIOS c
              LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.USER_ID
              WHERE c.TICKET_ID=@tid AND c.COM_ID=@cid
            `);

          const msg = rsOne.recordset[0];
          if (msg) {
            // Emitir al room del ticket
            io.to(`tenant:${tenantKey}:ticket:${ticketId}`).emit('ticket:comment', msg);
            logger.debug(`📣 Emitted ticket:comment to ticket:${ticketId} (from socket ${socket.id})`);

            // Además emitir a las salas de usuario implicadas para mayor fiabilidad
            try {
              const rsTicket = await pool.request().input('tid', sql.Int, ticketId)
                .query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
              if (rsTicket.recordset.length) {
                const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
                const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
                if (solicitanteId) {
                  io.to(`tenant:${tenantKey}:user:${solicitanteId}`).emit('ticket:comment', msg);
                }
                if (asignadoA) {
                  io.to(`tenant:${tenantKey}:user:${asignadoA}`).emit('ticket:comment', msg);
                }
                logger.debug(`📣 Also emitted ticket:comment to users user:${solicitanteId} and user:${asignadoA}`);
              }
            } catch (ee) {
              console.warn('⚠️ Error emitting ticket:comment to user rooms:', ee?.message || ee);
            }

            // Crear notificaciones simples: al solicitante o al asignado según corresponda
            try {
              const rsTicket = await pool.request().input('tid', sql.Int, ticketId)
                .query(`SELECT SOLICITANTE_ID, ASIGNADO_A FROM TICKETS WHERE TICKET_ID=@tid`);
              if (rsTicket.recordset.length) {
                const solicitanteId = rsTicket.recordset[0].SOLICITANTE_ID;
                const asignadoA = rsTicket.recordset[0].ASIGNADO_A;
                if (Number(autorId) !== Number(solicitanteId)) {
                  await pool.request()
                    .input('uid', sql.Int, solicitanteId)
                    .input('tid', sql.Int, ticketId)
                    .input('msg', sql.NVarChar, `Nuevo comentario en ticket #${ticketId}`)
                    .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_comentario', @tid, @msg)`);
                } else if (asignadoA && Number(asignadoA) !== Number(autorId)) {
                  await pool.request()
                    .input('uid', sql.Int, asignadoA)
                    .input('tid', sql.Int, ticketId)
                    .input('msg', sql.NVarChar, `Nuevo comentario del solicitante en ticket #${ticketId}`)
                    .query(`INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE) VALUES (@uid, 'ticket_comentario', @tid, @msg)`);
                }
              }
            } catch (ne) {
              logger.warn('⚠️ Error creando notificación desde socket:', ne?.message || ne);
            }
            // Acknowledge back to the emitter with the created message
            if (callback) {
              try {
                callback({ success: true, data: msg });
              } catch (ackErr) {
                // ignore ack errors
              }
            }
          }
        }
      } catch (e) {
         logger.warn('⚠️ Error procesando ticket:comment:create:', e?.message || e);
         if (typeof callback === 'function') {
           try { callback({ success: false, error: e?.message || e }); } catch (_) {}
         }
      }
    });

    // Algunos clientes emiten 'ticket:comment' directamente; aceptar ese caso también
    socket.on('ticket:comment', async (payload) => {
      try {
        // Si viene con la estructura de creación, reutilizar el handler anterior
        if (payload && (payload.ticketId || payload.tid)) {
          socket.emit('ticket:comment:create', payload);
        }
      } catch (e) {
        logger.warn('Error in ticket:comment passthrough handler:', e?.message || e);
      }
    });

    // Indicador de escritura en tiempo real (typing)
    socket.on('ticket:typing', (payload) => {
      try {
        if (!payload) return;
        const ticketId = Number(payload.ticketId || payload.tid);
        const userId = payload.userId || payload.usuarioId || payload.autorId;
        const typing = !!payload.typing;
        if (!ticketId) return;
        io.to(`tenant:${tenantKey}:ticket:${ticketId}`).emit('ticket:typing', { ticketId, userId, typing });
      } catch (e) {
        logger.warn('⚠️ Error procesando ticket:typing:', e?.message || e);
      }
    });

    // ── Chat en vivo (visitante web ↔ agente) ──────────────────────────────
    // El visitante (sin login) y el agente (logueado en intranet-react) se unen
    // a la misma sala `livechat:{conversacionId}` para intercambiar mensajes.
    // PENDIENTE multi-empresa: el widget público (C:\inetpub\wwwroot\chat) es un
    // build sin código fuente disponible en este servidor y no declara empresa
    // al conectar — se deja sin namespacing por tenant hasta poder editarlo.
    // Panel de Configuración > Contact Center > Canales: el admin se une a esta
    // sala mientras tiene abierta la vinculación por QR de un canal
    // 'whatsapp_baileys', para recibir 'cc:baileys_estado' (QR nuevo, conectado,
    // desconectado) sin tener que hacer polling — ver baileysManager.emitirEstado.
    // usuarioId opcional: presente solo cuando el canal está en modo
    // 'individual' (ver CCO_CANALES.CN_MODO_SESION) — cada agente se une a su
    // propia room 'cc:baileys:{canalId}:{usuarioId}' en vez de la genérica
    // del canal, para no recibir el QR/estado de sesiones de otros agentes.
    function roomBaileys(canalId, usuarioId) { return usuarioId ? `cc:baileys:${canalId}:${usuarioId}` : `cc:baileys:${canalId}`; }
    function roomFca(canalId, usuarioId) { return usuarioId ? `cc:fca:${canalId}:${usuarioId}` : `cc:fca:${canalId}`; }
    function roomIgp(canalId, usuarioId) { return usuarioId ? `cc:igp:${canalId}:${usuarioId}` : `cc:igp:${canalId}`; }

    socket.on('join_cc_baileys', (payload) => {
      try {
        const canalId = Number(payload?.canalId);
        if (!canalId) return;
        socket.join(roomBaileys(canalId, payload?.usuarioId ? Number(payload.usuarioId) : null));
      } catch (e) {
        logger.warn('⚠️ Error en join_cc_baileys:', e?.message || e);
      }
    });

    socket.on('leave_cc_baileys', (payload) => {
      try {
        const canalId = Number(payload?.canalId);
        if (!canalId) return;
        socket.leave(roomBaileys(canalId, payload?.usuarioId ? Number(payload.usuarioId) : null));
      } catch (e) {
        logger.warn('⚠️ Error en leave_cc_baileys:', e?.message || e);
      }
    });

    // Mismo propósito que join_cc_baileys, para el canal 'messenger_fca'
    // (recibe 'cc:fca_estado' mientras el admin tiene abierto el panel de
    // vinculación por appstate.json — ver fcaManager.emitirEstado).
    socket.on('join_cc_fca', (payload) => {
      try {
        const canalId = Number(payload?.canalId);
        if (!canalId) return;
        socket.join(roomFca(canalId, payload?.usuarioId ? Number(payload.usuarioId) : null));
      } catch (e) {
        logger.warn('⚠️ Error en join_cc_fca:', e?.message || e);
      }
    });

    socket.on('leave_cc_fca', (payload) => {
      try {
        const canalId = Number(payload?.canalId);
        if (!canalId) return;
        socket.leave(roomFca(canalId, payload?.usuarioId ? Number(payload.usuarioId) : null));
      } catch (e) {
        logger.warn('⚠️ Error en leave_cc_fca:', e?.message || e);
      }
    });

    // Mismo propósito, para el canal 'instagram_privado' — recibe
    // 'cc:igp_estado' mientras el admin tiene abierto el panel de vinculación
    // por usuario/password (ver igPrivateManager.emitirEstado).
    socket.on('join_cc_igp', (payload) => {
      try {
        const canalId = Number(payload?.canalId);
        if (!canalId) return;
        socket.join(roomIgp(canalId, payload?.usuarioId ? Number(payload.usuarioId) : null));
      } catch (e) {
        logger.warn('⚠️ Error en join_cc_igp:', e?.message || e);
      }
    });

    socket.on('leave_cc_igp', (payload) => {
      try {
        const canalId = Number(payload?.canalId);
        if (!canalId) return;
        socket.leave(roomIgp(canalId, payload?.usuarioId ? Number(payload.usuarioId) : null));
      } catch (e) {
        logger.warn('⚠️ Error en leave_cc_igp:', e?.message || e);
      }
    });

    // Contact Center omnicanal: sala por interacción, usada por
    // ccRoutingService.emitir/ccInteraccionesController vía getIO(tenantKey)
    // .to(`cc:interaccion:${id}`) — ese helper prefija `tenant:{tenantKey}:`,
    // así que el join debe usar el mismo prefijo o el evento no llega a
    // nadie (bug real encontrado 2026-09-12: esta sala nunca tuvo joins,
    // por eso 'cc:mensaje' y demás dependían 100% del polling del frontend).
    socket.on('join_interaccion', (payload) => {
      try {
        const interaccionId = Number(payload?.interaccionId);
        if (!interaccionId) return;
        socket.join(`tenant:${tenantKey}:cc:interaccion:${interaccionId}`);
      } catch (e) {
        logger.warn('⚠️ Error en join_interaccion:', e?.message || e);
      }
    });

    socket.on('leave_interaccion', (payload) => {
      try {
        const interaccionId = Number(payload?.interaccionId);
        if (!interaccionId) return;
        socket.leave(`tenant:${tenantKey}:cc:interaccion:${interaccionId}`);
      } catch (e) {
        logger.warn('⚠️ Error en leave_interaccion:', e?.message || e);
      }
    });

    socket.on('join_livechat_conversation', (payload) => {
      try {
        const conversacionId = Number(payload?.conversacionId);
        if (!conversacionId) return;
        socket.join(`livechat:${conversacionId}`);
        socket.to(`livechat:${conversacionId}`).emit('livechat:user_joined', { conversacionId });
      } catch (e) {
        logger.warn('⚠️ Error en join_livechat_conversation:', e?.message || e);
      }
    });

    socket.on('leave_livechat_conversation', (payload) => {
      try {
        const conversacionId = Number(payload?.conversacionId);
        if (!conversacionId) return;
        socket.leave(`livechat:${conversacionId}`);
      } catch (e) {
        logger.warn('⚠️ Error en leave_livechat_conversation:', e?.message || e);
      }
    });

    socket.on('livechat:typing', (payload) => {
      try {
        const conversacionId = Number(payload?.conversacionId);
        if (!conversacionId) return;
        socket.to(`livechat:${conversacionId}`).emit('livechat:typing', {
          conversacionId,
          emisor: payload?.emisor === 'agente' ? 'agente' : 'visitante',
          isTyping: !!payload?.isTyping,
        });
      } catch (e) {
        logger.warn('⚠️ Error en livechat:typing:', e?.message || e);
      }
    });

    // ── Mensajería interna (chat entre usuarios: DMs y grupos) ─────────────
    socket.on('mensajeria:join_canal', (payload) => {
      try {
        const canalId = Number(payload && payload.canalId);
        if (!canalId) return;
        socket.join(`tenant:${tenantKey}:mensajeria:canal:${canalId}`);
      } catch (e) {
        logger.warn('⚠️ Error en mensajeria:join_canal:', e?.message || e);
      }
    });

    socket.on('mensajeria:leave_canal', (payload) => {
      try {
        const canalId = Number(payload && payload.canalId);
        if (!canalId) return;
        socket.leave(`tenant:${tenantKey}:mensajeria:canal:${canalId}`);
      } catch (e) {
        logger.warn('⚠️ Error en mensajeria:leave_canal:', e?.message || e);
      }
    });

    socket.on('mensajeria:typing', (payload) => {
      try {
        const canalId = Number(payload && payload.canalId);
        if (!canalId) return;
        socket.to(`tenant:${tenantKey}:mensajeria:canal:${canalId}`).emit('mensajeria:typing', {
          canalId,
          usuarioId: payload && payload.usuarioId,
          usuarioNombre: payload && payload.usuarioNombre,
          isTyping: !!(payload && payload.isTyping),
        });
      } catch (e) {
        logger.warn('⚠️ Error en mensajeria:typing:', e?.message || e);
      }
    });
  });
  logger.info('✅ Socket.io inicializado correctamente con WebSocket + SSL');
  return io;
}

// Sin tenantKey: devuelve la instancia real de socket.io (uso interno, o
// llamadores que ya manejan el room con tenant explícito ellos mismos).
// Con tenantKey: devuelve un wrapper acotado a la empresa — .to(room) prefija
// `tenant:{tenantKey}:` al room (mismo esquema que usan los sockets al unirse
// en initialize()), y .emit(...) directo transmite solo a esa empresa en vez
// de a todos los conectados. Así los ~40 sitios que hacían broadcasts sin
// distinguir empresa quedan aislados solo con pasar la empresa del request.
function getIO(tenantKey) {
  if (!io) {
    throw new Error('Socket.io no inicializado');
  }
  if (!tenantKey) return io;
  const room = `tenant:${tenantKey}`;
  return {
    to: (target) => io.to(`${room}:${target}`),
    emit: (...args) => io.to(room).emit(...args),
  };
}

module.exports = {
  initialize,
  getIO,
  // Baño: tras editar sus espacios en Configuración (la empresa como en el socket).
  recargarEspacios: (tenantKey) => recargarEspacios(String(tenantKey || DEFAULT_TENANT).toLowerCase()),
  generoDe,
};
