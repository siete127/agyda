const crypto = require('crypto');

// Mismo esquema (AES-256-GCM) y misma clave que ya usa expedienteController.js
// para documentos cifrados — se reutiliza aquí para no mantener dos sistemas de
// cifrado en paralelo. La clave vive en EXPEDIENTE_ENCRYPTION_KEY (32 bytes,
// base64 o hex) a pesar del nombre histórico, es la clave general del sistema.
function getEncryptionKey() {
  const raw = (process.env.EXPEDIENTE_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error('Falta EXPEDIENTE_ENCRYPTION_KEY (32 bytes en base64 o hex)');
  }

  let key;
  try {
    key = Buffer.from(raw, 'base64');
  } catch (e) {
    key = null;
  }
  if (!key || key.length !== 32) {
    try {
      key = Buffer.from(raw, 'hex');
    } catch (e) {
      key = null;
    }
  }

  if (!key || key.length !== 32) {
    throw new Error('EXPEDIENTE_ENCRYPTION_KEY debe ser 32 bytes (base64 o hex)');
  }
  return key;
}

// Cifra un texto plano y devuelve un string único (base64) con iv+tag+data
// concatenados — cómodo para guardar en una sola columna NVARCHAR(MAX).
function encryptText(plainText) {
  if (plainText === null || plainText === undefined) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString('base64');
}

function decryptText(encoded) {
  if (!encoded) return null;
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encryptText, decryptText };
