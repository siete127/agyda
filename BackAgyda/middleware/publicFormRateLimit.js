const rateLimit = require('express-rate-limit');

// Protege los formularios públicos de marketing (sin auth, sin CORS
// restrictivo) contra scripts/bots que los golpean en loop — cada envío
// real siempre crea contacto + oportunidad (ver crmLeadMarketingController),
// así que sin este límite un solo script mal apuntado infla el pipeline con
// docenas de registros falsos (visto en producción: ~1 cada 30 min, 42+
// en un día). 5 envíos cada 15 min por IP es generoso para un visitante
// real — nadie llena el mismo formulario de contacto 5+ veces seguidas.
const leadFormRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

// Mismo criterio para el formulario público de postulación (Totis y
// cualquier otra campaña con registro abierto): sin límite, nada impedía que
// el mismo formulario se reenviara en loop y llenara CCO_CAMPANIA_POSTULANTES
// de filas duplicadas.
const postulanteFormRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

module.exports = { leadFormRateLimit, postulanteFormRateLimit };
