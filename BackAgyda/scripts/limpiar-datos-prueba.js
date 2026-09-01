/*
 * Limpieza puntual de DATOS DE PRUEBA en varios módulos (identificados manualmente,
 * confirmados por el usuario). NO toca ACTIVOS (son inventario real mal llenado).
 * Transaccional. Borra los hijos antes que el padre.
 *
 *   node scripts/limpiar-datos-prueba.js              (dry-run)
 *   node scripts/limpiar-datos-prueba.js --aplicar
 *   node scripts/limpiar-datos-prueba.js --empresa=demo --aplicar
 */
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : `${__dirname}/../.env.development` });
const databaseService = require('../services/databaseService');

const EMPRESA = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'agyda';
const APLICAR = process.argv.includes('--aplicar');

// ── IDs a eliminar por módulo ──
const QUEJAS = [17];
const PROYECTOS = [75];
const PROYECTO_TAREAS = [113, 122];          // tareas 'asd' (proyectos reales, solo la tarea)
const ENCUESTAS = [69, 70, 72];
const ENCUESTA_PREGUNTAS_SUELTAS = [106, 111]; // preguntas 'dsad...' de encuestas reales
const NOTICIAS = [110, 111];
const NOTICIAS_COMENTARIOS_SUELTOS = [141];    // comentario 'dsadadas' en noticia real
const QUEJAS_COMENTARIOS_SUELTOS = [1, 4];     // comentarios 'dsadada' en queja real (no la #17)
const KB = [2, 9, 11];
const MSJ_CANALES = [17];
const MSJ_MENSAJES_SUELTOS = [46, 61, 72, 73, 77, 84, 203]; // mensajes 'holi/test/xd' en canales reales
const CAP_CURSOS = [3];
const LIVECHAT_CONV = [6, 105];
const CRM_CONTACTOS = [1, 39, 40, 41, 43, 44, 45, 52, 53, 54];

const L = (a) => a.join(',');

(async () => {
  const pool = await databaseService.getPool(EMPRESA);

  // Resolver dependencias dinámicas
  const idsFrom = async (sql) => (await pool.request().query(sql)).recordset.map((r) => Object.values(r)[0]);

  const oppIds       = CRM_CONTACTOS.length ? await idsFrom(`SELECT OPO_ID FROM CRM_OPORTUNIDADES WHERE OPO_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`) : [];
  const cotIds       = oppIds.length ? await idsFrom(`SELECT COT_ID FROM CRM_COTIZACIONES WHERE COT_OPO_ID IN (${L(oppIds)})`) : [];
  const examIds      = CAP_CURSOS.length ? await idsFrom(`SELECT EXA_ID FROM CAP_EXAMENES WHERE EXA_CURSO_ID IN (${L(CAP_CURSOS)})`) : [];
  const examPregIds  = examIds.length ? await idsFrom(`SELECT EPR_ID FROM CAP_EXAMEN_PREGUNTAS WHERE EPR_EXAMEN_ID IN (${L(examIds)})`) : [];
  const examIntIds   = examIds.length ? await idsFrom(`SELECT INT_ID FROM CAP_EXAMEN_INTENTOS WHERE INT_EXAMEN_ID IN (${L(examIds)})`) : [];
  const examRpubIds  = examIds.length ? await idsFrom(`SELECT ERP_ID FROM CAP_EXAMEN_RESPONDIENTES_PUBLICOS WHERE ERP_EXAMEN_ID IN (${L(examIds)})`) : [];

  const resumen = {
    QUEJAS, PROYECTOS, PROYECTO_TAREAS, ENCUESTAS, ENCUESTA_PREGUNTAS_SUELTAS, NOTICIAS,
    NOTICIAS_COMENTARIOS_SUELTOS, QUEJAS_COMENTARIOS_SUELTOS, KB, MSJ_CANALES,
    MSJ_MENSAJES_SUELTOS, CAP_CURSOS, LIVECHAT_CONV, CRM_CONTACTOS,
    'CRM_OPORTUNIDADES (derivado)': oppIds, 'CRM_COTIZACIONES (derivado)': cotIds,
    'CAP_EXAMENES (derivado)': examIds,
  };
  console.log('\n== A eliminar ==');
  for (const [k, v] of Object.entries(resumen)) console.log(`  ${k}: [${v.join(', ')}]  (${v.length})`);

  if (!APLICAR) { console.log('\nDry-run. Ejecuta con --aplicar.\n'); process.exit(0); }

  const tx = pool.transaction();
  await tx.begin();
  const q = (sql) => tx.request().query(sql);
  try {
    // ── QUEJAS ──
    if (QUEJAS.length) {
      await q(`DELETE FROM QUEJAS_COMENTARIOS WHERE QUEJA_ID IN (${L(QUEJAS)})`);
      await q(`DELETE FROM QUEJAS_ACCION_CORRECTIVA WHERE QUEJA_ID IN (${L(QUEJAS)})`).catch(() => {});
      await q(`DELETE FROM QUEJAS WHERE QUEJA_ID IN (${L(QUEJAS)})`);
    }
    if (QUEJAS_COMENTARIOS_SUELTOS.length) await q(`DELETE FROM QUEJAS_COMENTARIOS WHERE COM_ID IN (${L(QUEJAS_COMENTARIOS_SUELTOS)})`);

    // ── PROYECTOS ──
    if (PROYECTO_TAREAS.length) await q(`DELETE FROM PROYECTO_TAREAS WHERE PTAR_ID IN (${L(PROYECTO_TAREAS)})`);
    if (PROYECTOS.length) {
      await q(`DELETE FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID IN (${L(PROYECTOS)})`);
      await q(`DELETE FROM PROYECTO_MIEMBROS WHERE PMEM_PROY_ID IN (${L(PROYECTOS)})`);
      await q(`DELETE FROM PROYECTOS WHERE PROY_ID IN (${L(PROYECTOS)})`);
    }

    // ── ENCUESTAS ──
    const encPregTodas = [...ENCUESTA_PREGUNTAS_SUELTAS];
    if (ENCUESTAS.length) {
      const pr = await q(`SELECT EPR_ID FROM ENCUESTA_PREGUNTAS WHERE EPR_ENC_ID IN (${L(ENCUESTAS)})`);
      encPregTodas.push(...pr.recordset.map((r) => r.EPR_ID));
    }
    if (encPregTodas.length) {
      await q(`DELETE FROM ENCUESTA_RESPUESTAS WHERE ERE_EPR_ID IN (${L(encPregTodas)})`);
      await q(`DELETE FROM ENCUESTA_OPCIONES WHERE EOP_EPR_ID IN (${L(encPregTodas)})`);
      await q(`DELETE FROM ENCUESTA_PREGUNTAS WHERE EPR_ID IN (${L(encPregTodas)})`);
    }
    if (ENCUESTAS.length) {
      await q(`DELETE FROM ENCUESTA_RESPUESTAS WHERE ERE_ENC_ID IN (${L(ENCUESTAS)})`);
      await q(`DELETE FROM ENCUESTA_ASIGNACION WHERE EAS_ENC_ID IN (${L(ENCUESTAS)})`);
      await q(`DELETE FROM ENCUESTA_RESPONDIENTES_PUBLICOS WHERE ERP_ENC_ID IN (${L(ENCUESTAS)})`);
      await q(`DELETE FROM ENCUESTAS WHERE ENC_ID IN (${L(ENCUESTAS)})`);
    }

    // ── NOTICIAS ──
    if (NOTICIAS_COMENTARIOS_SUELTOS.length) {
      await q(`DELETE FROM INTRANET_NOTICIAS_COMENTARIOS_REACCIONES WHERE CREAC_COM_ID IN (${L(NOTICIAS_COMENTARIOS_SUELTOS)})`);
      await q(`DELETE FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_ID IN (${L(NOTICIAS_COMENTARIOS_SUELTOS)})`);
    }
    if (NOTICIAS.length) {
      const cr = await q(`SELECT COM_ID FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_NOTI_ID IN (${L(NOTICIAS)})`);
      const comIds = cr.recordset.map((r) => r.COM_ID);
      if (comIds.length) await q(`DELETE FROM INTRANET_NOTICIAS_COMENTARIOS_REACCIONES WHERE CREAC_COM_ID IN (${L(comIds)})`);
      await q(`DELETE FROM INTRANET_NOTICIAS_COMENTARIOS WHERE COM_NOTI_ID IN (${L(NOTICIAS)})`);
      await q(`DELETE FROM INTRANET_NOTICIAS_REACCIONES WHERE REAC_NOTI_ID IN (${L(NOTICIAS)})`);
      await q(`DELETE FROM INTRANET_NOTICIAS WHERE NOTI_ID IN (${L(NOTICIAS)})`);
    }

    // ── KB ──
    if (KB.length) await q(`DELETE FROM KB_ARTICULOS WHERE ART_ID IN (${L(KB)})`);

    // ── MENSAJERÍA ──
    if (MSJ_MENSAJES_SUELTOS.length) {
      await q(`DELETE FROM MSJ_MENSAJE_REACCIONES WHERE MMR_MENSAJE_ID IN (${L(MSJ_MENSAJES_SUELTOS)})`);
      await q(`DELETE FROM MSJ_MENSAJES WHERE MM_ID IN (${L(MSJ_MENSAJES_SUELTOS)})`);
    }
    if (MSJ_CANALES.length) {
      const mm = await q(`SELECT MM_ID FROM MSJ_MENSAJES WHERE MM_CANAL_ID IN (${L(MSJ_CANALES)})`);
      const mmIds = mm.recordset.map((r) => r.MM_ID);
      if (mmIds.length) await q(`DELETE FROM MSJ_MENSAJE_REACCIONES WHERE MMR_MENSAJE_ID IN (${L(mmIds)})`);
      await q(`DELETE FROM MSJ_MENSAJES WHERE MM_CANAL_ID IN (${L(MSJ_CANALES)})`);
      await q(`DELETE FROM MSJ_CANAL_MIEMBROS WHERE MCM_CANAL_ID IN (${L(MSJ_CANALES)})`);
      await q(`DELETE FROM MSJ_CANALES WHERE MC_ID IN (${L(MSJ_CANALES)})`);
    }

    // ── CAPACITACIÓN ──
    if (examIntIds.length) await q(`DELETE FROM CAP_EXAMEN_RESPUESTAS WHERE ERE_INTENTO_ID IN (${L(examIntIds)})`);
    if (examPregIds.length) {
      await q(`DELETE FROM CAP_EXAMEN_RESPUESTAS WHERE ERE_PREGUNTA_ID IN (${L(examPregIds)})`).catch(() => {});
      await q(`DELETE FROM CAP_EXAMEN_OPCIONES WHERE EOP_PREGUNTA_ID IN (${L(examPregIds)})`);
      await q(`DELETE FROM CAP_EXAMEN_PREGUNTAS WHERE EPR_ID IN (${L(examPregIds)})`);
    }
    if (examIntIds.length) await q(`DELETE FROM CAP_EXAMEN_INTENTOS WHERE INT_ID IN (${L(examIntIds)})`);
    if (examRpubIds.length) await q(`DELETE FROM CAP_EXAMEN_RESPONDIENTES_PUBLICOS WHERE ERP_ID IN (${L(examRpubIds)})`);
    if (examIds.length) await q(`DELETE FROM CAP_EXAMENES WHERE EXA_ID IN (${L(examIds)})`);
    if (CAP_CURSOS.length) {
      await q(`DELETE FROM CAP_INSCRIPCIONES WHERE INSC_CURSO_ID IN (${L(CAP_CURSOS)})`);
      await q(`DELETE FROM CAP_MATERIALES WHERE MAT_CURSO_ID IN (${L(CAP_CURSOS)})`);
      await q(`DELETE FROM CAP_CURSOS WHERE CUR_ID IN (${L(CAP_CURSOS)})`);
    }

    // ── LIVECHAT ──
    if (LIVECHAT_CONV.length) {
      await q(`DELETE FROM LIVECHAT_MENSAJES WHERE LM_CONVERSACION_ID IN (${L(LIVECHAT_CONV)})`);
      await q(`DELETE FROM LIVECHAT_COLA WHERE LCO_CONVERSACION_ID IN (${L(LIVECHAT_CONV)})`);
      await q(`UPDATE CHATBOT_SESIONES SET SES_CONVERSACION_ID = NULL WHERE SES_CONVERSACION_ID IN (${L(LIVECHAT_CONV)})`).catch(() => {});
      await q(`DELETE FROM LIVECHAT_CONVERSACIONES WHERE LC_ID IN (${L(LIVECHAT_CONV)})`);
    }

    // ── CRM ──
    if (cotIds.length) {
      await q(`DELETE FROM CRM_COTIZACION_ITEMS WHERE COTI_COT_ID IN (${L(cotIds)})`);
      await q(`DELETE FROM CRM_COTIZACIONES WHERE COT_ID IN (${L(cotIds)})`);
    }
    if (oppIds.length) {
      await q(`DELETE FROM CRM_ACTIVIDADES WHERE ACT_OPO_ID IN (${L(oppIds)})`).catch(() => {});
      await q(`DELETE FROM CRM_EMAILS WHERE EMAIL_OPO_ID IN (${L(oppIds)})`).catch(() => {});
      await q(`DELETE FROM CRM_RECORDATORIOS_PAGO WHERE REC_OPO_ID IN (${L(oppIds)})`).catch(() => {});
      await q(`DELETE FROM CRM_COTIZACIONES WHERE COT_OPO_ID IN (${L(oppIds)})`).catch(() => {});
      await q(`DELETE FROM CRM_OPORTUNIDADES WHERE OPO_ID IN (${L(oppIds)})`);
    }
    if (CRM_CONTACTOS.length) {
      await q(`DELETE FROM CRM_DOCUMENTOS_CLIENTE WHERE DOC_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM CRM_ENCUESTAS_ENVIADAS WHERE CES_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM CRM_RECORDATORIOS_PAGO WHERE REC_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM CRM_EMAILS WHERE EMAIL_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM EMAIL_ENVIOS WHERE EEN_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM ACLARACIONES WHERE ACLARACION_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM CONSULTAS WHERE CONSULTA_CONTACTO_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM AC_RETENCION WHERE AR_CLIENTE_ID IN (${L(CRM_CONTACTOS)})`).catch(() => {});
      await q(`DELETE FROM CRM_CONTACTOS WHERE CONT_ID IN (${L(CRM_CONTACTOS)})`);
    }

    await tx.commit();
    console.log('\n✅ Limpieza aplicada correctamente.\n');
  } catch (e) {
    await tx.rollback();
    console.error('\n❌ Rollback:', e.message, '\n');
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
