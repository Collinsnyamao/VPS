// server.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const config = require('./config/config');
const wsServer = require('./websocket/server');
const mongoose = require('mongoose');

console.log("==========================================");
console.log(" Sentinel VPS - Starting Server");
console.log("==========================================");

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

        console.log('HTTPS server created');
    } catch (error) {
        console.warn(`SSL certificates not found, falling back to HTTP: ${error.message}`);
        server = http.createServer(app);
    }
} else {
    server = http.createServer(app);
}

// Initialize WebSocket server
wsServer.initialize(server);

// Connect to MongoDB
mongoose.connect(config.database.uri, config.database.options)
    .then(() => {
        console.log(`Connected to MongoDB at ${config.database.uri.split('@').pop()}`);

        // Start server after DB connection is established
        server.listen(config.port, () => {
            console.log(`Server running in ${config.env} mode on port ${config.port}`);
            console.log(`WebSocket server listening at ${config.websocket.path}`);
        });
    })
    .catch(err => {
        console.error(`MongoDB connection error: ${err.message}`);
        process.exit(1);
    });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Promise Rejection: ${err.message}`);
    console.error(err.stack);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception: ${err.message}`);
    console.error(err.stack);
    // Exit with failure
    process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });

    // Force close if graceful shutdown fails
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log("Server initialization complete");