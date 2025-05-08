// middleware/request-logger.js
const logger = require('../config/logger');

/**
 * Middleware to log detailed API request information
 */
exports.requestLogger = (req, res, next) => {
    // Skip logging for health checks to reduce noise
    if (req.path === '/health' || req.path === '/api/health') {
        return next();
    }

    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        const logLevel = res.statusCode >= 500 ? 'error' :
            res.statusCode >= 400 ? 'warn' :
                'http';

        logger.log(logLevel, `${req.method} ${req.path}`, {
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            userId: req.user ? req.user.id : undefined
        });
    });

    next();
};