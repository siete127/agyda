const logger = global.logger || require('../utils/logger');

function loggingMiddleware(req, res, next) {
    try {
        const method = req.method;
        const url = req.originalUrl || req.url;
        // Interceptar la respuesta para loguear 400/500 con warn
        const orig = res.json.bind(res);
        res.json = function(body) {
            if (res.statusCode >= 400) {
                logger.warn(`[${res.statusCode}] ${method} ${url} → ${JSON.stringify(body)}`);
            }
            return orig(body);
        };
    } catch (e) {
        try { logger.error('loggingMiddleware error', e && e.message); } catch (_) {}
    }
    next();
}

module.exports = loggingMiddleware;