const cors = require('cors');
const corsOptions = require('../config/cors');

const corsMiddleware = cors(corsOptions);

// Manejar preflight OPTIONS explícitamente
module.exports = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return corsMiddleware(req, res, next);
  }
  return corsMiddleware(req, res, next);
};
