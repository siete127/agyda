const crypto = require('crypto');
const path = require('path');

// Mismo esquema de cifrado que expedienteController.js (AES-256-GCM, misma
// env var EXPEDIENTE_ENCRYPTION_KEY) — extraído a util compartido para que
// tanto Expedientes como Seguimiento a Clientes (CRM) lo usen sin duplicar
// la lógica de cifrado. expedienteController.js NO se modifica.

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

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || 'documento').replace(/\\/g, '/'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encryptBuffer(plainBuffer) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { data, iv, tag, cipherName: 'aes-256-gcm' };
}

function decryptBuffer(cipherBuffer, iv, tag) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);
}

module.exports = { getEncryptionKey, sanitizeFilename, encryptBuffer, decryptBuffer };
