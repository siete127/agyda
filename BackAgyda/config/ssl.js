const fs = require('fs');
const path = require('path');

const sslPath = 'C:/Sistemas/SSL_intranet';
const keyPath = path.join(sslPath, 'intranet.ardabytec.vip-key.pem');
const certPath = path.join(sslPath, 'intranet.ardabytec.vip-crt.pem');
const caPath = path.join(sslPath, 'intranet.ardabytec.vip-chain.pem');
const caOnlyPath = path.join(sslPath, 'intranet.ardabytec.vip-chain-only.pem');

const isAvailable = fs.existsSync(keyPath) && fs.existsSync(certPath);

const options = isAvailable ? {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
  ca: [
    fs.readFileSync(caPath),
    fs.readFileSync(caOnlyPath)
  ]
} : null;

module.exports = {
  isAvailable,
  options
};