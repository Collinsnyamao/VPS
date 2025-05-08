// app.js
const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const logger = require('./config/logger');
const { errorHandler, notFound, requestLogger } = require('./middleware/error-handler');

// Import routes
const authRoutes = require('./routes/auth');
const nodeRoutes = require('./routes/nodes');
const logRoutes = require('./routes/logs');

// Create Express app
const app = express();

// Connect to MongoDB
mongoose
    .connect(config.database.uri, config.database.options)
    .then(() => {
        logger.info('MongoDB connected successfully');
    })
    .catch((err) => {
        logger.error('MongoDB connection error', { error: err.message });
        console.error('MongoDB connection error', { error: err.message });
        process.exit(1);
    });

// Apply middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Logging
app.use(
    morgan('combined', {
        stream: logger.stream,
        skip: (req) => req.url === '/health' || req.url === '/api/health'
    })
);
app.use(requestLogger);

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: config.security.rateLimitWindow,
    max: config.security.rateLimitMax,
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});
app.use('/api/', apiLimiter);

// Health check route (no auth required)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/logs', logRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;