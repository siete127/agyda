/**
 * Recalcula MINUTOS_RETARDO / ES_RETARDO / HORA_ESPERADA de ASISTENCIA_ENTRADAS
 * en un rango de fechas, aplicando el horario EFECTIVO de cada día (el
 * especial de ASISTENCIA_HORARIOS_ESP si existe para ese rol+día de semana,
 * si no el general de ASISTENCIA_HORARIOS) — mismo criterio que
 * getHorarioEfectivo en asistenciaController.js.
 *
 * Necesario porque el cálculo de retardo (marcarEntrada/uploadBiometrico/
 * syncBiotime) nunca consultaba el horario especial hasta este fix: los
 * registros ya guardados antes del fix quedaron calculados con el horario
 * general para TODOS los días, incluidos los que ahora tienen excepción
 * (ej. sábado 09:00-14:00 en vez de 10:00-18:00 para Call Center).
 *
 * No toca HORA_ENTRADA (la hora real ya marcada) ni la existencia de la
 * fila — solo recalcula contra qué hora se compara. Idempotente: correrlo
 * dos veces no cambia nada la segunda vez.
 *
 * Uso:  node scripts/recalcularRetardosHorarioEspecial.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

const DESDE = '2026-08-24';
const HASTA = new Date().toISOString().slice(0, 10);

function minutosRetardo(horaEntrada, horaEsperada) {
  const [eh, em, es = 0] = horaEntrada.split(':').map(Number);
  const [lh, lm] = horaEsperada.split(':').map(Number);
  const diffSeg = (eh * 3600 + em * 60 + es) - (lh * 3600 + lm * 60);
  return diffSeg > 0 ? Math.floor(diffSeg / 60) : 0;
}

function getHorarioEfectivo(horariosPorRol, espPorHorarioId, rol, fechaStr) {
  const general = horariosPorRol[rol];
  if (!general) return null;
  const diaSemana = new Date(`${fechaStr}T00:00:00Z`).getUTCDay(); // 0=domingo..6=sábado
  const especial = general.id != null ? espPorHorarioId[general.id]?.[diaSemana] : null;
  if (especial) return { entrada: especial.entrada, tolerancia: especial.tolerancia ?? general.tolerancia ?? 5 };
  return { entrada: general.entrada, tolerancia: general.tolerancia ?? 5 };
}

async function recalcularTenant(tenantKey) {
  let pool;
  try { pool = await databaseService.getPool(tenantKey); }
  catch (e) { console.log(`  [${tenantKey}] sin pool: ${e.message}`); return; }

  const hRs = await pool.request().query(
    `SELECT ID, ROL, HORA_ENTRADA, TOLERANCIA_MINUTOS FROM ASISTENCIA_HORARIOS WHERE ACTIVO = 1`
  ).catch(() => null);
  if (!hRs) { console.log(`  [${tenantKey}] sin tabla ASISTENCIA_HORARIOS, se omite`); return; }

  const horariosPorRol = {};
  for (const row of hRs.recordset) {
    horariosPorRol[row.ROL] = { id: row.ID, entrada: row.HORA_ENTRADA, tolerancia: row.TOLERANCIA_MINUTOS ?? 5 };
  }

  const espRs = await pool.request().query(
    `SELECT HORARIO_ID, DIA_SEMANA, HORA_ENTRADA, TOLERANCIA_MINUTOS FROM ASISTENCIA_HORARIOS_ESP WHERE ACTIVO = 1`
  );
  const espPorHorarioId = {};
  for (const row of espRs.recordset) {
    if (!espPorHorarioId[row.HORARIO_ID]) espPorHorarioId[row.HORARIO_ID] = {};
    espPorHorarioId[row.HORARIO_ID][row.DIA_SEMANA] = { entrada: row.HORA_ENTRADA, tolerancia: row.TOLERANCIA_MINUTOS };
  }

  if (espRs.recordset.length === 0) {
    console.log(`  [${tenantKey}] sin horarios especiales configurados, nada que recalcular`);
    return;
  }

  const entradasRs = await pool.request()
    .input('desde', sql.NVarChar, DESDE)
    .input('hasta', sql.NVarChar, HASTA)
    .query(`
      SELECT ID, NEUS_ID, ROL, CONVERT(varchar(10), FECHA, 23) AS FECHA_STR,
             FORMAT(HORA_ENTRADA, 'HH:mm:ss') AS HORA_ENTRADA_STR,
             MINUTOS_RETARDO AS MINUTOS_RETARDO_VIEJO, ES_RETARDO AS ES_RETARDO_VIEJO
      FROM ASISTENCIA_ENTRADAS
      WHERE FECHA >= @desde AND FECHA <= @hasta
    `);

  let tocados = 0;
  let cambiaronDeATiempoARetardo = 0;
  let cambiaronDeRetardoAATiempo = 0;
  let sinCambio = 0;

  for (const row of entradasRs.recordset) {
    const efectivo = getHorarioEfectivo(horariosPorRol, espPorHorarioId, row.ROL, row.FECHA_STR);
    if (!efectivo) continue; // rol sin horario configurado, no tocar

    const minRetNuevo = minutosRetardo(row.HORA_ENTRADA_STR, efectivo.entrada.slice(0, 8));
    const esRetardoNuevo = minRetNuevo > efectivo.tolerancia;
    const horaEsperadaStr = `${row.FECHA_STR} ${efectivo.entrada}`;

    const cambioEstatus = !!row.ES_RETARDO_VIEJO !== esRetardoNuevo;
    if (cambioEstatus) {
      if (esRetardoNuevo) cambiaronDeATiempoARetardo++;
      else cambiaronDeRetardoAATiempo++;
    } else if (minRetNuevo === row.MINUTOS_RETARDO_VIEJO) {
      sinCambio++;
      continue; // ya está igual, no hace falta el UPDATE
    }

    await pool.request()
      .input('id', sql.Int, row.ID)
      .input('horaEsperada', sql.NVarChar, horaEsperadaStr)
      .input('minutosRetardo', sql.Int, minRetNuevo)
      .input('esRetardo', sql.Bit, esRetardoNuevo ? 1 : 0)
      .query(`
        UPDATE ASISTENCIA_ENTRADAS
        SET HORA_ESPERADA = CONVERT(datetime, @horaEsperada, 120),
            MINUTOS_RETARDO = @minutosRetardo,
            ES_RETARDO = @esRetardo
        WHERE ID = @id
      `);
    tocados++;
  }

  console.log(`  [${tenantKey}] registros revisados: ${entradasRs.recordset.length} · actualizados: ${tocados} · sin cambio: ${sinCambio} · a_tiempo->retardo: ${cambiaronDeATiempoARetardo} · retardo->a_tiempo: ${cambiaronDeRetardoAATiempo}`);
}

(async () => {
  await databaseService.initialize();
  console.log(`Recalculando retardos con horario efectivo (${DESDE} a ${HASTA})\n`);
  for (const t of listTenants()) await recalcularTenant(t.key);
  console.log('\nListo.');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
