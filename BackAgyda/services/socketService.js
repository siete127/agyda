const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const corsConfig = require('../config/cors');
const databaseService = require('./databaseService');
const sql = require('mssql');
const { DEFAULT_TENANT } = require('../config/tenants');

let io;

function makeEmptyBanioState() {
  return {
    hombres: { ocupado: false, porUsuario: null, porNombre: null, genero: 'M', tiempoId: null },
    mujeres: { ocupado: false, porUsuario: null, porNombre: null, genero: 'F', tiempoId: null },
  };
}

// Estado del baño y caché de género, uno por empresa — dos empresas nunca
// deben ver o afectar el estado de la otra.
const banioStateByTenant = new Map(); // tenantKey -> banioState
const generoCacheByTenant = new Map(); // tenantKey -> Map(userId -> {genero, nombre})

function getBanioState(tenantKey) {
  if (!banioStateByTenant.has(tenantKey)) banioStateByTenant.set(tenantKey, makeEmptyBanioState());
  return banioStateByTenant.get(tenantKey);
}

function getGeneroCache(tenantKey) {
  if (!generoCacheByTenant.has(tenantKey)) generoCacheByTenant.set(tenantKey, new Map());
  return generoCacheByTenant.get(tenantKey);
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

// Obtiene género desde caché o BD (columna NEUS_GENERO). Autoritativo, nunca usa el cliente.
async function getGeneroUsuario(userId, tenantKey) {
  const cache = getGeneroCache(tenantKey);
  const key = String(userId);
  if (cache.has(key)) return cache.get(key);
  try {
    const pool = await databaseService.getPool(tenantKey);
    const r = await pool.request()
      .input('neusId', sql.Int, parseInt(userId) || 0)
      .query('SELECT TOP 1 NEUS_NOMBRES as nombre, NEUS_GENERO as generoDb FROM NEUS_USUARIOS WHERE NEUS_ID = @neusId');
    if (r.recordset.length > 0) {
      const nombre = r.recordset[0].nombre;
      const shortName = (nombre || '').trim().split(/\s+/).slice(0, 2).join(' ');
      // Usar NEUS_GENERO si está definido, sino fallback a detección por nombre
      const generoDb = (r.recordset[0].generoDb || '').trim().toUpperCase();
      const genero = (generoDb === 'M' || generoDb === 'F') ? generoDb : detectarGeneroNombre(nombre);
      cache.set(key, { genero, nombre: shortName });
      return { genero, nombre: shortName };
    }
  } catch (_) {}
  return null;
}

async function reconstituirEstadoBanio(tenantKey) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    const r = await pool.request().query(`
      SELECT TOP 2 t.neus_id, t.tiempo_id, u.NEUS_NOMBRES as nombre, u.NEUS_GENERO as generoDb
      FROM USUARIO_TIEMPOS t
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = t.neus_id
      WHERE t.status_id = 3 AND t.fecha_fin IS NULL
      ORDER BY t.fecha_inicio DESC
    `);
    const banioState = makeEmptyBanioState();
    banioStateByTenant.set(tenantKey, banioState);
    for (const row of r.recordset) {
      const generoDb = (row.generoDb || '').trim().toUpperCase();
      const genero = (generoDb === 'M' || generoDb === 'F') ? generoDb : detectarGeneroNombre(row.nombre);
      const slot = genero === 'F' ? 'mujeres' : 'hombres';
      if (!banioState[slot].ocupado) {
        banioState[slot] = {
          ocupado: true,
          porUsuario: String(row.neus_id),
          porNombre: (row.nombre || '').trim().split(/\s+/).slice(0, 2).join(' '),
          genero,
          tiempoId: row.tiempo_id,
        };
      }
    }
  } catch (e) {
    console.warn(`[BAÑO][${tenantKey}] No se pudo reconstituir estado desde BD:`, e?.message);
  }
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
      console.log(`[BAÑO][${key}] Estado reconstituido:`, JSON.stringify(getBanioState(key)));
    });
  });

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

        const banioState = getBanioState(tenantKey);
        const tenantRoom = `tenant:${tenantKey}`;

        // 1. Obtener género real desde caché/BD — SIEMPRE autoritativo, nunca del cliente
        const info = await getGeneroUsuario(userId, tenantKey);
        const generoReal = info?.genero ?? (payload?.genero === 'F' ? 'F' : 'M');
        const userName   = info?.nombre ?? (payload?.userName ?? 'Alguien');
        const slotKey    = generoReal === 'F' ? 'mujeres' : 'hombres';
        const slot       = banioState[slotKey];

        logger.info(`[BAÑO][${tenantKey}] toggle userId=${userId} nombre="${userName}" genero=${generoReal} slot.ocupado=${slot.ocupado} slot.porUsuario=${slot.porUsuario}`);

        // 2. Determinar acción: entrar o salir
        const yaEstaAdentro = slot.ocupado && slot.porUsuario === userId;

        if (yaEstaAdentro) {
          // ── SALIR ──────────────────────────────────────────────────────────
          const tiempoId = slot.tiempoId ?? null;
          banioState[slotKey] = { ocupado: false, porUsuario: null, porNombre: null, genero: generoReal, tiempoId: null };
          io.to(tenantRoom).emit('banio:status', banioState);
          logger.info(`[BAÑO][${tenantKey}] ${userName} salió del baño de ${slotKey}`);

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
                  .query(`UPDATE USUARIO_TIEMPOS SET fecha_fin = GETDATE() WHERE neus_id = @neusId AND status_id = 3 AND fecha_fin IS NULL`);
                logger.info(`[BAÑO][${tenantKey}] Cierre BD fallback neusId=${userId}`);
              }
            } catch (dbErr) { logger.warn(`[BAÑO][${tenantKey}] Error cerrando BD:`, dbErr?.message); }
          });

        } else if (!slot.ocupado) {
          // ── ENTRAR (slot libre) ────────────────────────────────────────────
          banioState[slotKey] = { ocupado: true, porUsuario: userId, porNombre: userName, genero: generoReal, tiempoId: null };
          io.to(tenantRoom).emit('banio:status', banioState);
          logger.info(`[BAÑO][${tenantKey}] ${userName} entró al baño de ${slotKey}`);

          setImmediate(async () => {
            try {
              const pool = await databaseService.getPool(tenantKey);
              const neusIdInt = parseInt(userId) || 0;
              // Cerrar cualquier registro previo abierto de este usuario (limpieza defensiva)
              await pool.request()
                .input('neusId', sql.Int, neusIdInt)
                .query(`UPDATE USUARIO_TIEMPOS SET fecha_fin = GETDATE() WHERE neus_id = @neusId AND status_id = 3 AND fecha_fin IS NULL`);
              // Abrir nuevo registro
              const r = await pool.request()
                .input('neusId', sql.Int, neusIdInt)
                .input('statusId', sql.Int, 3)
                .query(`
                  DECLARE @ids TABLE (id INT);
                  INSERT INTO USUARIO_TIEMPOS (neus_id, status_id, fecha_inicio, creado_en)
                  OUTPUT INSERTED.tiempo_id INTO @ids(id)
                  VALUES (@neusId, @statusId, GETDATE(), GETDATE());
                  SELECT id AS tiempoId FROM @ids;
                `);
              const tiempoId = r.recordset[0]?.tiempoId ?? null;
              logger.info(`[BAÑO][${tenantKey}] Inicio BD tiempoId=${tiempoId} userId=${userId}`);
              // Guardar tiempoId en memoria (solo si este usuario sigue en el slot)
              if (banioState[slotKey].ocupado && banioState[slotKey].porUsuario === userId) {
                banioState[slotKey].tiempoId = tiempoId;
              }
            } catch (dbErr) { logger.warn(`[BAÑO][${tenantKey}] Error abriendo BD:`, dbErr?.message); }
          });

        } else {
          // ── BAÑO OCUPADO POR OTRO — rechazar ──────────────────────────────
          logger.info(`[BAÑO][${tenantKey}] ${userName} intentó entrar pero está ocupado por ${slot.porNombre}`);
          // Re-emitir estado actual solo al solicitante para que su UI se sincronice
          socket.emit('banio:status', banioState);
        }
      } catch (e) {
        logger.warn('[BAÑO] Error en banio:toggle:', e?.message || e);
      }
    });

    socket.on('banio:get', () => {
      socket.emit('banio:status', getBanioState(tenantKey));
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
  getIO
};
