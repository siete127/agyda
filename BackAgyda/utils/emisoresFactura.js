// Emisores con los que se puede facturar manejando el mismo catálogo de
// productos — SOLO para el tenant 'agyda' (ARDABY TEC), nunca para las
// demás empresas (edomex, santillana, etc.), cada una con su propia
// facturación. Mientras no haya CSD cargado para ninguno de los dos RFC
// (EMPRESA_FISCAL sigue vacía), esto solo deja constancia de cuál se
// eligió en la pre-factura; no cambia si se timbra de verdad o no (eso lo
// decide facturacionService.timbrar con el emisor de EMPRESA_FISCAL).
// Lista fija en el backend — nunca se confía en una razón social/RFC que
// mande el cliente sin validar contra esto. La usan Facturación y Clientes
// (con qué emisor se le factura a cada cliente).
const EMISORES = [
  { rfc: 'ATE210416757', nombre: 'ARDABY TEC' },
  { rfc: 'MOGE9003308X3', nombre: 'EDGAR MONTOYA' },
];

function emisoresDe(req) {
  return req.user?.empresa === 'agyda' ? EMISORES : [];
}

function emisorValido(req, rfc) {
  return emisoresDe(req).find((e) => e.rfc === String(rfc || '').toUpperCase().trim()) || null;
}

module.exports = { EMISORES, emisoresDe, emisorValido };
