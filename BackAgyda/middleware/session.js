const session = require('express-session');
const sessionConfig = require('../config/session');

module.exports = session(sessionConfig);