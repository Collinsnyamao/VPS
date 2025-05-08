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