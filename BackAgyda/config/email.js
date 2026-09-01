const nodemailer = require('nodemailer');

const rawSmtpPass = process.env.SMTP_PASS || '';
const normalizedSmtpPass = rawSmtpPass.replace(/\s+/g, '');
const SMTP_DEBUG = (process.env.SMTP_DEBUG || 'false').toLowerCase() === 'true';

const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465,
  secure: (process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
  auth: process.env.SMTP_USER && normalizedSmtpPass
    ? { user: process.env.SMTP_USER, pass: normalizedSmtpPass }
    : undefined,
  logger: SMTP_DEBUG,
  debug: SMTP_DEBUG,
};

// Microsoft 365 / Exchange Online vía OAuth2 (client credentials) — reemplazo
// del envío por Gmail para que los correos salgan desde un dominio propio de
// ardabytec.com y no queden bloqueados por SPF/spam del dominio destino. Se
// activa SOLO si las 3 variables están presentes; si falta alguna, el sistema
// sigue usando el SMTP de Gmail configurado arriba sin ningún cambio de
// comportamiento — no rompe nada mientras no se termine de configurar.
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || '';
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const AZURE_SENDER_EMAIL = process.env.AZURE_SENDER_EMAIL || 'notifications@ardabytec.com';
const USE_OAUTH2 = Boolean(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);

const oauth2Config = {
  tenantId: AZURE_TENANT_ID,
  clientId: AZURE_CLIENT_ID,
  clientSecret: AZURE_CLIENT_SECRET,
  senderEmail: AZURE_SENDER_EMAIL,
};

// Resend (servicio transaccional externo) — reemplazo definitivo de M365
// OAuth2: Microsoft 365 Business Standard no incluye Azure AD Premium, y sin
// eso "Security Defaults" bloquea sin excepción el login de aplicación que
// SMTP AUTH con OAuth2 necesita (confirmado: el token trae el rol correcto,
// pero Exchange igual rechaza con 535 5.7.3). Desactivar Security Defaults
// bajaría la seguridad de todo el tenant solo para resolver esto, así que se
// optó por un proveedor externo. Se activa SOLO si hay API key; tiene
// prioridad sobre OAuth2 y Gmail si está presente.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL || 'notifications@ardabytec.com';
const USE_RESEND = Boolean(RESEND_API_KEY);

const EMAIL_FROM = USE_RESEND
  ? RESEND_SENDER_EMAIL
  : (USE_OAUTH2 ? AZURE_SENDER_EMAIL : (process.env.SMTP_FROM || 'tecardaby@gmail.com'));
const EMAIL_BASE_URL = process.env.EMAIL_BASE_URL || 'https://intranet.ardabytec.vip:8444';
const PERMISOS_MAIL_TO = (process.env.PERMISOS_MAIL_TO || 'edgar.montoya@ardabytec.com,jmiranda@ardabytec.com,RRHH@ardabytec.com,chetooortizz@gmail.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

module.exports = {
  smtpConfig,
  EMAIL_FROM,
  EMAIL_BASE_URL,
  PERMISOS_MAIL_TO,
  SMTP_DEBUG,
  USE_OAUTH2,
  oauth2Config,
  USE_RESEND,
  RESEND_API_KEY,
  RESEND_SENDER_EMAIL,
};