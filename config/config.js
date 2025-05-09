// config/config.js
require('dotenv').config();

module.exports = {
    // Server configuration
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',

    // MongoDB configuration
    database: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sentinel',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    },

    // JWT configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'your_development_jwt_secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    },

    // WebSocket configuration
    websocket: {
        path: '/ws/node', // This must match what workers are connecting to
        heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000'),
        heartbeatTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT || '60000')
    },

    // Security configuration
    security: {
        nodeSecret: process.env.NODE_SECRET || 'your_development_node_secret',
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100') // 100 requests per window
    }
};