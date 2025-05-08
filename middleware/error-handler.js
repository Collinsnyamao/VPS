// middleware/error-handler.js
const logger = require('../config/logger');

/**
 * Central error handler middleware
 */
exports.errorHandler = (err, req, res, next) => {
    // Log the error
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    // Set status code
    const statusCode = err.statusCode || 500;

    // Send error response
    res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? 'Internal server error' : err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

/**
 * 404 Not Found middleware
 */
exports.notFound = (req, res, next) => {
    logger.debug('Route not found', { path: req.path, method: req.method });

    res.status(404).json({
        success: false,
        message: `Route ${req.path} not found`
    });
};

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