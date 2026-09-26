const dns = require('dns').promises;

// Validaciones de datos de clientes en México: RFC (estructura + dígito
// verificador del SAT), correo (formato + que su dominio reciba correo) y
// código postal (catálogo oficial SEPOMEX, con sus colonias).
// Que un RFC esté dado de alta en el SAT o que un buzón exista NO se puede
// comprobar sin servicios de paga; esto detecta errores de captura e inventados.

// ── RFC ────────────────────────────────────────────────────────────────────
// Genéricos del SAT: público en general y extranjeros.
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);
const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2})([A\d])$/;
// Valores del algoritmo del dígito verificador (índice = valor).
const DICC = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';

function digitoVerificador(rfcSinDigito) {
  // Persona moral (11 caracteres sin el dígito): se completa con un espacio al inicio.
  const base = rfcSinDigito.length === 11 ? ` ${rfcSinDigito}` : rfcSinDigito;
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += DICC.indexOf(base[i]) * (13 - i);
  const residuo = suma % 11;
  if (residuo === 0) return '0';
  const d = 11 - residuo;
  return d === 10 ? 'A' : String(d);
}

function validarRfc(valor) {
  const rfc = String(valor || '').toUpperCase().replace(/[\s-]/g, '');
  if (!rfc) return { valido: false, rfc, errores: ['Vacío'] };
  if (RFC_GENERICOS.has(rfc)) return { valido: true, rfc, tipo: 'generico', errores: [] };
  const m = rfc.match(RFC_RE);
  if (!m) {
    return {
      valido: false, rfc,
      errores: [rfc.length !== 12 && rfc.length !== 13
        ? `Debe tener 12 caracteres (empresa) o 13 (persona física); tiene ${rfc.length}`
        : 'La estructura no corresponde a un RFC (letras + fecha AAMMDD + homoclave)'],
    };
  }
  const [, letras, aa, mm, dd] = m;
  const tipo = letras.length === 3 ? 'moral' : 'fisica';
  const errores = [];
  // La fecha (constitución o nacimiento) debe existir en el calendario.
  const mes = Number(mm), dia = Number(dd);
  const anio = 2000 + Number(aa); // año bisiesto: 00 y 2000 coinciden en el ciclo de 4
  const fechaOk = mes >= 1 && mes <= 12 && dia >= 1 && dia <= new Date(anio, mes, 0).getDate();
  if (!fechaOk) errores.push(`La fecha ${aa}-${mm}-${dd} (AA-MM-DD) no existe`);
  const esperado = digitoVerificador(rfc.slice(0, -1));
  if (rfc.slice(-1) !== esperado) errores.push('El dígito verificador (último carácter) no coincide: revisa que esté bien escrito');
  return { valido: errores.length === 0, rfc, tipo, errores };
}

// ── Correo ─────────────────────────────────────────────────────────────────
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const cacheDominios = new Map(); // dominio → { ts, recibe }
const CACHE_MS = 6 * 60 * 60 * 1000;

// Primero el DNS del sistema; si no contesta (hay equipos donde Node apunta a
// un 127.0.0.1 sin servidor), DNS públicos.
const resolverPublico = new dns.Resolver({ timeout: 3000, tries: 1 });
resolverPublico.setServers(['1.1.1.1', '8.8.8.8']);
const conTiempo = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 4000))]);
const NO_EXISTE = new Set(['ENOTFOUND', 'ENODATA']);

async function consultar(tipo, dominio) {
  const fn = tipo === 'MX' ? 'resolveMx' : 'resolve4';
  try {
    return await conTiempo(dns[fn](dominio));
  } catch (e) {
    if (NO_EXISTE.has(e.code)) throw e;
    return conTiempo(resolverPublico[fn](dominio));
  }
}

async function dominioRecibeCorreo(dominio) {
  const hit = cacheDominios.get(dominio);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.recibe;
  let recibe;
  try {
    const mx = await consultar('MX', dominio);
    recibe = mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (e) {
    if (NO_EXISTE.has(e.code)) {
      // Sin MX, un dominio con registro A también puede recibir (RFC 5321).
      try { recibe = (await consultar('A', dominio)).length > 0; } catch (_) { recibe = false; }
    } else {
      return null; // DNS caído o lento: no se pudo comprobar
    }
  }
  cacheDominios.set(dominio, { ts: Date.now(), recibe });
  return recibe;
}

// Dominios más usados: si el capturado se parece a uno (1–2 letras de
// diferencia, p. ej. gmial.com o hotmail.con) se sugiere la corrección.
const DOMINIOS_COMUNES = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.mx', 'live.com', 'icloud.com', 'hotmail.es', 'prodigy.net.mx', 'outlook.es'];
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
function sugerirDominio(dominio) {
  if (DOMINIOS_COMUNES.includes(dominio)) return null;
  let mejor = null;
  for (const c of DOMINIOS_COMUNES) {
    const dist = distancia(dominio, c);
    if (dist > 0 && dist <= 2 && (!mejor || dist < mejor.dist)) mejor = { c, dist };
  }
  return mejor?.c ?? null;
}

async function validarCorreo(valor) {
  const correo = String(valor || '').trim().toLowerCase();
  if (!CORREO_RE.test(correo)) return { formato: false, dominioRecibe: null, correo };
  const [usuario, dominio] = correo.split('@');
  const sugerido = sugerirDominio(dominio);
  return {
    formato: true, dominioRecibe: await dominioRecibeCorreo(dominio), correo, dominio,
    sugerencia: sugerido ? `${usuario}@${sugerido}` : null,
  };
}

// Correo obligatorio (regla de negocio para clientes): devuelve el mensaje de
// error o null si se puede guardar. Bloquea vacío, formato inválido y dominios
// que no existen o no reciben correo. Si el DNS no responde (no se pudo
// comprobar) NO bloquea: una caída de DNS no debe frenar la operación.
async function errorCorreoObligatorio(valor) {
  if (!String(valor || '').trim()) return 'El correo es obligatorio';
  const r = await validarCorreo(valor);
  if (!r.formato) return 'El correo no tiene un formato válido (ej. nombre@empresa.com)';
  if (r.dominioRecibe === false) {
    return `El dominio ${r.dominio} no existe o no recibe correo${r.sugerencia ? `. ¿Quisiste decir ${r.sugerencia}?` : ''}`;
  }
  return null;
}

// ── Código postal (SEPOMEX) ────────────────────────────────────────────────
let mxCp = null;
async function buscarCp(valor) {
  const cp = String(valor || '').replace(/\D/g, '');
  if (cp.length !== 5) return { formato: false, existe: false, cp };
  mxCp = mxCp || await import('@webrek/mx-cp');
  const r = await mxCp.buscaCP(cp);
  if (!r) return { formato: true, existe: false, cp };
  return {
    formato: true, existe: true, cp,
    estado: r.estado, municipio: r.municipio, ciudad: r.ciudad, zona: r.zona,
    colonias: r.asentamientos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })),
  };
}

module.exports = { validarRfc, digitoVerificador, validarCorreo, errorCorreoObligatorio, buscarCp };
