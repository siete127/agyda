const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const url = process.argv[2];

if (!url) {
  console.error('Uso: npm run qr -- <url> [nombre-salida]');
  console.error('Ejemplo: npm run qr -- https://www.ardabytec.com miQR');
  process.exit(1);
}

const nombreSalida = process.argv[3] || 'qr';
const carpetaSalida = path.join(__dirname, '..', 'assets', 'qr');

if (!fs.existsSync(carpetaSalida)) {
  fs.mkdirSync(carpetaSalida, { recursive: true });
}

const rutaPng = path.join(carpetaSalida, `${nombreSalida}.png`);
const rutaBase64 = path.join(carpetaSalida, `${nombreSalida}.base64.txt`);

async function generar() {
  await QRCode.toFile(rutaPng, url, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M'
  });

  const dataUrl = await QRCode.toDataURL(url, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M'
  });
  fs.writeFileSync(rutaBase64, dataUrl, 'utf8');

  console.log('QR generado correctamente para:', url);
  console.log('PNG:    ', rutaPng);
  console.log('Base64: ', rutaBase64);
}

generar().catch((err) => {
  console.error('Error generando el QR:', err.message);
  process.exit(1);
});
