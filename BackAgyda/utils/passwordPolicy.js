const { DEFAULT_TENANT } = require('../config/tenants');

// Política de contraseña obligatoria para todas las empresas EXCEPTO la
// empresa maestra (agyda/Ardaby Tec) — a petición explícita: los usuarios de
// Ardaby Tec no se ven afectados por esta regla.
const MIN_LENGTH = 10;

function empresaRequierePolitica(empresaKey) {
  return String(empresaKey || DEFAULT_TENANT).toLowerCase() !== DEFAULT_TENANT;
}

// Detecta 3+ dígitos consecutivos ascendentes (123), descendentes (321) o
// repetidos (111) en cualquier parte de la contraseña.
function tieneDigitosConsecutivos(password) {
  const digitos = password.match(/\d/g);
  if (!digitos || digitos.length < 3) return false;

  for (let i = 0; i + 2 < password.length; i++) {
    const a = password[i], b = password[i + 1], c = password[i + 2];
    if (!/\d/.test(a) || !/\d/.test(b) || !/\d/.test(c)) continue;
    const na = Number(a), nb = Number(b), nc = Number(c);
    const ascendente = nb === na + 1 && nc === nb + 1;
    const descendente = nb === na - 1 && nc === nb - 1;
    const repetido = na === nb && nb === nc;
    if (ascendente || descendente || repetido) return true;
  }
  return false;
}

// Devuelve null si la contraseña cumple la política, o un mensaje de error
// describiendo el primer requisito que falla.
function validarPoliticaPassword(password) {
  const pass = String(password || '');
  if (pass.length < MIN_LENGTH) return `La contraseña debe tener al menos ${MIN_LENGTH} caracteres`;
  if (!/[A-Z]/.test(pass)) return 'La contraseña debe incluir al menos una letra mayúscula';
  if (!/[a-z]/.test(pass)) return 'La contraseña debe incluir al menos una letra minúscula';
  if (!/[^A-Za-z0-9]/.test(pass)) return 'La contraseña debe incluir al menos un carácter especial';
  if (tieneDigitosConsecutivos(pass)) return 'La contraseña no puede tener 3 o más números consecutivos o repetidos (ej. 123, 321, 111)';
  return null;
}

module.exports = { MIN_LENGTH, empresaRequierePolitica, validarPoliticaPassword };
