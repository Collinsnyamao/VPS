// middleware/error-handler.js

/**
 * Central error handler middleware
 */
exports.errorHandler = (err, req, res, next) => {
    // Log the error
    console.error(`Unhandled error: ${err.message}`);
    console.error(err.stack);

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
    console.log(`Route not found: ${req.method} ${req.path}`);

    res.status(404).json({
        success: false,
        message: `Route ${req.path} not found`
    });
};

/**
 * Middleware to log request information
 */
exports.requestLogger = (req, res, next) => {
    // Skip logging for health checks to reduce noise
    if (req.path === '/health' || req.path === '/api/health') {
        return next();
    }

    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        // Format log based on status code
        if (res.statusCode >= 500) {
            console.error(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        } else if (res.statusCode >= 400) {
            console.warn(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        } else {
            console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        }
    });

    next();
};