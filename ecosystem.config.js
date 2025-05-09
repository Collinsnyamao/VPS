// ecosystem.config.js
module.exports = {
    apps: [
        {
            name: 'sentinel-vps',
            script: 'server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
                MONGODB_URI: 'mongodb://admin:a11Black$@13.219.98.175:27027/sentinelDB?authSource=admin',
                JWT_SECRET: 'YVcyFt+JcFVxnbGpfMdfhu0yGSodkjsAOKLHIcI5D5Y=',
                JWT_EXPIRES_IN: '1d',
                NODE_SECRET: 'tZHR/XM3wFQZ9NAYjXCgjLtznD16SQY+K1mY+BW37QI=',
                WS_HEARTBEAT_INTERVAL: 30000,
                WS_HEARTBEAT_TIMEOUT: 60000,
                RATE_LIMIT_WINDOW: 900000,
                RATE_LIMIT_MAX: 100
            },
            output: 'logs/out.log',  // Capture console.log output
            error: 'logs/error.log', // Capture console.error output
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        }
    ]
};