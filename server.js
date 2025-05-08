const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const wsServer = require('./websocket/server');
const mongoose = require('mongoose')

// Create HTTP server
let server;

if (config.env === 'production') {
    try {
        // Check for SSL certificate files
        const sslPath = process.env.SSL_PATH || './ssl';
        const privateKey = fs.readFileSync(path.join(sslPath, 'privkey.pem'), 'utf8');
        const certificate = fs.readFileSync(path.join(sslPath, 'cert.pem'), 'utf8');
        const ca = fs.readFileSync(path.join(sslPath, 'chain.pem'), 'utf8');

        // Create HTTPS server
        server = https.createServer(
            {
                key: privateKey,
                cert: certificate,
                ca
            },
            app
        );

        logger.info('HTTPS server created');
    } catch (error) {
        logger.warn('SSL certificates not found, falling back to HTTP', { error: error.message });
        server = http.createServer(app);
    }
} else {
    server = http.createServer(app);
}

// Initialize WebSocket server
wsServer.initialize(server);

// Start server
server.listen(config.port, () => {
    logger.info(`Server running in ${config.env} mode on port ${config.port}`);
    const divider = '='.repeat(80);
    console.log(divider);
    console.log(`🚀 Server running in ${config.env} mode on port ${config.port}`);
    console.log(`🔗 WebSocket server available at /ws/node`);
    console.log(`🌐 ${config.env === 'production' ? 'HTTPS' : 'HTTP'} API available`);
    console.log(`📝 Logging to console and ${config.logging.directory}`);
    console.log(`💾 MongoDB connected at ${config.database.uri.split('@').pop()}`);
    console.log(divider);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Promise Rejection', { error: err.message, stack: err.stack });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    // Exit with failure
    process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
    logger.info('Shutting down server...');
    server.close(() => {
        logger.info('Server closed');
        mongoose.connection.close(false, () => {
            logger.info('MongoDB connection closed');
            process.exit(0);
        });
    });

    // Force close if graceful shutdown fails
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);