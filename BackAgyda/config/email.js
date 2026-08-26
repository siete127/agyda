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

const EMAIL_FROM = process.env.SMTP_FROM || 'tecardaby@gmail.com';
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
  SMTP_DEBUG
};