// Prueba end-to-end del flujo de Soporte TI/Tickets (creación → comentario →
// resolución con KB → validación → encuesta/cierre → escalamiento con
// proveedor → filtros/paginación → config).
//
// Corre contra la base de datos real (usa .env del backend). No requiere
// backend/frontend levantados: invoca los controllers directamente.
// Crea tickets/artículo KB de prueba (prefijo __PRUEBA_E2E__) y los borra
// al final. Salida: exit code 0 si todo pasó, 1 si algo falló.
//
// Ejecutar desde BackAgyda/:   node _prueba-e2e-flujo-completo.js
require('dotenv').config();
const databaseService = require('./services/databaseService');
const schemaService = require('./services/schemaService');
const sql = require('mssql');
const ticketController = require('./controllers/ticketController');
const catalogosTiController = require('./controllers/catalogosTiController');

function fakeRes(label) {
  const res = {};
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res._label = label;
  return res;
}

function check(desc, cond) {
  const ok = !!cond;
  console.log(`${ok ? '✅' : '❌'} ${desc}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

(async () => {
  console.log('════════════════════════════════════════════════════════');
  console.log('PRUEBA END-TO-END — Flujo completo de Soporte TI (AGYDA)');
  console.log('Ejecutada contra la base de datos real de producción');
  console.log('════════════════════════════════════════════════════════\n');

  const pool = await databaseService.getPool('agyda');
  await schemaService.ensureAllSchemas(pool);

  const solicitanteId = 10; // Eliud Vladimir Mathus Evangelista — usuario real
  const idsCrear = [];

  // ── PASO 1: Crear ticket (Registro y validación completos) ──
  console.log('── PASO 1: Creación del ticket ──');
  const catRs = await pool.request().query(`SELECT TOP 1 CAT_ID, CAT_NOMBRE FROM TICKET_CATEGORIAS WHERE CAT_NOMBRE='Hardware'`);
  const categoriaHardware = catRs.recordset[0];

  const resultCrear = await ticketController.crearTicketInterno(pool, {
    solicitanteId, area: 'TI',
    titulo: '__PRUEBA_E2E__ Laptop no enciende',
    descripcion: 'La laptop no enciende desde esta mañana, ya se intentó cargar.',
    clasificacion: 'incidente',
    categoria: categoriaHardware?.CAT_NOMBRE || null,
    impacto: 'ALTO', urgencia: 'ALTA', // debe calcular P1
    tenantKey: 'agyda', esAD: false, canalOrigen: 'portal',
  });
  const ticketId = resultCrear.data?.id;
  idsCrear.push(ticketId);
  check('Ticket creado exitosamente', resultCrear.ok && ticketId);
  check('Prioridad calculada correctamente (Alto+Alta = P1)', resultCrear.data?.prioridad === 'P1');
  check('Canal de origen registrado', resultCrear.data?.canalOrigen === 'portal');
  console.log(`   → Ticket #${ticketId} creado con prioridad ${resultCrear.data?.prioridad}\n`);

  // ── PASO 2: Consultar el ticket recién creado (detalle completo) ──
  console.log('── PASO 2: Consulta de detalle ──');
  let res = fakeRes('detalle');
  await ticketController.getTicketById({ params: { id: ticketId }, user: { empresa: 'agyda' } }, res);
  check('Detalle del ticket accesible', res.statusCode !== 404 && res.body?.data);
  check('SLA calculado y presente', res.body?.data?.slaResolucion !== undefined);
  check('Campo encuestaAplica presente', typeof res.body?.data?.encuestaAplica === 'boolean');
  console.log(`   → Estado actual: ${res.body?.data?.ESTADO}, SLA resolución: ${res.body?.data?.slaResolucion}\n`);

  // ── PASO 3: Comentar en el ticket ──
  console.log('── PASO 3: Comentario en el ticket ──');
  res = fakeRes('comentario');
  await ticketController.addComentario({
    params: { id: ticketId },
    body: { comentario: 'Comentario de prueba automatizada', usuarioId: solicitanteId },
    headers: { usuarioid: String(solicitanteId) },
    user: { empresa: 'agyda' },
  }, res);
  check('Comentario agregado', res.statusCode !== 500);

  res = fakeRes('comentarios-lista');
  await ticketController.getComentarios({ params: { id: ticketId }, query: {}, user: { empresa: 'agyda' } }, res);
  check('Comentario visible en el listado', res.body?.data?.some((c) => c.contenido?.includes('prueba automatizada')));
  console.log('');

  // ── PASO 4: Resolver el ticket con evidencia + KB nueva ──
  console.log('── PASO 4: Resolución con diagnóstico + creación de artículo KB ──');
  res = fakeRes('resolver');
  await ticketController.resolverTicket({
    params: { id: ticketId },
    body: {
      diagnostico: 'Batería agotada y sin carga residual',
      accionesRealizadas: 'Se reemplazó el cargador y se confirmó carga completa',
      causaRaiz: 'Cargador defectuoso',
      nuevoArticuloKb: { titulo: '__PRUEBA_E2E__ Laptop no enciende - solución', contenido: 'Verificar cargador y batería.' },
    },
    headers: { 'x-user-tipo': 'TI', usuarioid: String(solicitanteId) },
    user: { empresa: 'agyda', id: solicitanteId, nombre: 'Test' },
  }, res);
  check('Ticket resuelto exitosamente', res.statusCode !== 500 && res.statusCode !== 400);

  const checkArt = await pool.request().input('tid', sql.Int, ticketId).query(`SELECT ARTICULO_KB_ID FROM TICKETS WHERE TICKET_ID=@tid`);
  const articuloId = checkArt.recordset[0]?.ARTICULO_KB_ID;
  check('Artículo de KB creado y vinculado', !!articuloId);
  console.log(`   → Artículo KB #${articuloId} creado y vinculado\n`);

  // ── PASO 5: Validar la resolución (usuario confirma) ──
  console.log('── PASO 5: Validación del usuario ──');
  res = fakeRes('validar');
  await ticketController.validarResolucion({
    params: { id: ticketId },
    body: { solicitanteId, confirma: true },
    user: { empresa: 'agyda' },
  }, res);
  check('Validación procesada', res.statusCode !== 500);

  const checkValidado = await pool.request().input('tid', sql.Int, ticketId).query(`SELECT VALIDADO_USUARIO, ESTADO FROM TICKETS WHERE TICKET_ID=@tid`);
  check('Ticket marcado como validado', checkValidado.recordset[0]?.VALIDADO_USUARIO === true);
  console.log(`   → Estado tras validar: ${checkValidado.recordset[0]?.ESTADO}\n`);

  // ── PASO 6: Encuesta de satisfacción (si aplica) + cierre ──
  console.log('── PASO 6: Cierre con encuesta y snapshot de SLA ──');
  res = fakeRes('encuesta');
  await ticketController.registrarSatisfaccion({
    params: { id: ticketId },
    body: { solicitanteId, rating: 5, comentario: 'Excelente atención' },
    user: { empresa: 'agyda' },
  }, res);
  check('Encuesta registrada y ticket cerrado', res.statusCode !== 500);

  const checkCierre = await pool.request().input('tid', sql.Int, ticketId).query(`
    SELECT ESTADO, CODIGO_CIERRE, SLA_RESOLUCION_CUMPLIDO, MINUTOS_TRABAJADOS, ASIGNADO_A
    FROM TICKETS WHERE TICKET_ID=@tid`);
  const cierre = checkCierre.recordset[0];
  check('Ticket en estado cerrado', cierre?.ESTADO === 'cerrado');
  check('Snapshot de tiempo trabajado guardado', cierre?.MINUTOS_TRABAJADOS !== null);
  console.log(`   → Estado final: ${cierre?.ESTADO}, minutos trabajados: ${cierre?.MINUTOS_TRABAJADOS}\n`);

  // ── PASO 7: Escalamiento con proveedor (ticket aparte, para no interferir con el cerrado) ──
  console.log('── PASO 7: Escalamiento N1→N2→N3 con proveedor ──');
  const resultEscalar = await ticketController.crearTicketInterno(pool, {
    solicitanteId, area: 'TI', titulo: '__PRUEBA_E2E__ Ticket para escalar', descripcion: 'x',
    clasificacion: 'problema', tenantKey: 'agyda', esAD: false, canalOrigen: 'portal',
  });
  const ticketEscalarId = resultEscalar.data.id;
  idsCrear.push(ticketEscalarId);

  res = fakeRes('escalar-n2');
  await ticketController.escalarTicket({
    params: { id: ticketEscalarId }, body: { nivelDestino: 2, motivo: 'Requiere análisis técnico' },
    headers: { 'x-user-tipo': 'TI', usuarioid: String(solicitanteId) }, user: { empresa: 'agyda' },
  }, res);
  check('Escalamiento a N2 exitoso', res.body?.nivelActual === 2);

  const provRs = await pool.request().query(`SELECT TOP 1 PROV_ID, PROV_NOMBRE FROM TI_PROVEEDORES WHERE PROV_ACTIVO=1`);
  let proveedor = provRs.recordset[0];
  if (!proveedor) {
    const ins = await pool.request().input('n', sql.NVarChar, '__PRUEBA_E2E__ Proveedor').query(`INSERT INTO TI_PROVEEDORES (PROV_NOMBRE) VALUES (@n); SELECT SCOPE_IDENTITY() as id;`);
    proveedor = { PROV_ID: Number(ins.recordset[0].id), PROV_NOMBRE: '__PRUEBA_E2E__ Proveedor' };
  }
  res = fakeRes('escalar-n3');
  await ticketController.escalarTicket({
    params: { id: ticketEscalarId }, body: { nivelDestino: 3, motivo: 'Requiere proveedor externo', proveedorId: proveedor.PROV_ID },
    headers: { 'x-user-tipo': 'TI', usuarioid: String(solicitanteId) }, user: { empresa: 'agyda' },
  }, res);
  check('Escalamiento a N3 con proveedor exitoso', res.body?.nivelActual === 3 && res.body?.proveedorId === proveedor.PROV_ID);
  console.log(`   → Ticket #${ticketEscalarId} escalado a N3, proveedor: ${res.body?.proveedorNombre}\n`);

  // ── PASO 8: Listado con filtros y paginación ──
  console.log('── PASO 8: Listado con filtros y paginación ──');
  res = fakeRes('listado-filtrado');
  await ticketController.getTickets({ query: { area: 'TI', limit: 5 }, headers: { 'x-user-tipo': 'AD' }, user: { empresa: 'agyda' } }, res);
  check('Listado con filtro de área funciona', res.body?.data?.length > 0 && res.body?.data?.length <= 5);
  check('Todos los resultados respetan el filtro de área', res.body?.data?.every((t) => (t.area ?? t.AREA) === 'TI'));
  console.log('');

  // ── PASO 9: Recordatorios (config) ──
  console.log('── PASO 9: Configuración de recordatorios ──');
  const ticketRecordatoriosCron = require('./controllers/ticketRecordatoriosCronController');
  res = fakeRes('recordatorios-config');
  await ticketRecordatoriosCron.getConfig({ user: { empresa: 'agyda' } }, res);
  check('Config de recordatorios accesible', res.body?.data?.diasSinActividad !== undefined);
  console.log('');

  // ── PASO 10: Config general (zona horaria informativa) ──
  console.log('── PASO 10: Configuración general ──');
  res = fakeRes('config-general');
  await catalogosTiController.getConfigGeneral({ user: { empresa: 'agyda' } }, res);
  check('Config general accesible', !!res.body?.data?.zonaHoraria);
  console.log('');

  // ── LIMPIEZA ──
  console.log('── Limpieza de datos de prueba ──');
  await pool.request().input('id', sql.Int, ticketEscalarId).query(`DELETE FROM TICKET_ESCALAMIENTOS WHERE TICKET_ID=@id`);
  for (const tid of idsCrear) {
    await pool.request().input('id', sql.Int, tid).query(`DELETE FROM TICKET_SATISFACCION WHERE TICKET_ID=@id`);
    await pool.request().input('id', sql.Int, tid).query(`DELETE FROM TICKET_COMENTARIOS WHERE TICKET_ID=@id`);
    await pool.request().input('id', sql.Int, tid).query(`DELETE FROM TICKET_HISTORIAL WHERE TICKET_ID=@id`);
    await pool.request().input('id', sql.Int, tid).query(`DELETE FROM TICKETS WHERE TICKET_ID=@id`);
  }
  if (articuloId) await pool.request().input('id', sql.Int, articuloId).query(`DELETE FROM KB_ARTICULOS WHERE ART_ID=@id`);
  if (proveedor.PROV_NOMBRE === '__PRUEBA_E2E__ Proveedor') {
    await pool.request().input('id', sql.Int, proveedor.PROV_ID).query(`DELETE FROM TI_PROVEEDORES WHERE PROV_ID=@id`);
  }
  console.log('Datos de prueba eliminados.\n');

  console.log('════════════════════════════════════════════════════════');
  if (process.exitCode === 1) {
    console.log('❌ PRUEBA FALLIDA — revisar los puntos marcados arriba');
  } else {
    console.log('✅ PRUEBA END-TO-END COMPLETA — TODO EL FLUJO FUNCIONA CORRECTAMENTE');
  }
  console.log('════════════════════════════════════════════════════════');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
