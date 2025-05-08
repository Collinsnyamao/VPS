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
                NODE_ENV: 'development',
                PORT: 3000,
                MONGODB_URI: 'mongodb://localhost:27017/sentinel',
                JWT_SECRET: 'your_development_jwt_secret',
                NODE_SECRET: 'your_development_node_secret',
                LOG_LEVEL: 'debug'
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 443,
                MONGODB_URI: 'mongodb://localhost:27017/sentinel',
                JWT_SECRET: 'change_this_to_a_secure_random_string',
                NODE_SECRET: 'change_this_to_a_secure_random_string',
                LOG_LEVEL: 'info',
                SSL_PATH: '/etc/letsencrypt/live/your-domain.com'
            }
        }
    ]
};