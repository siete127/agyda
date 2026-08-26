require('dotenv').config();
const emailService = require('./services/emailService');
emailService.initialize();

(async () => {
  try {
    await new Promise(r => setTimeout(r, 1500)); // dar tiempo al verify async de initialize()
    const result = await emailService.verify();
    console.log('SMTP verify result:', JSON.stringify(result));

    console.log('Enviando correo de prueba a edgar.montoya@ardabytec.com ...');
    const test = await emailService.sendTestEmail('edgar.montoya@ardabytec.com');
    console.log('Resultado sendTestEmail:', JSON.stringify(test));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
  }
  process.exit(0);
})();
