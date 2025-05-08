// config/logger.js
const winston = require('winston');
const { createLogger, format, transports } = winston;
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Create logs directory if it doesn't exist
const logDir = config.logging.directory;
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
);

// Create file transports
const fileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'sentinel-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    level: config.logging.level
});

const errorFileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'sentinel-error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    level: 'error'
});

// Create console transport based on environment
const consoleTransport = new transports.Console({
    format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
    )
});

// Create logger
const logger = createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: { service: 'sentinel-vps' },
    transports: [
        fileTransport,
        errorFileTransport
    ]
});

// Add console transport if not in production
if (config.env !== 'production') {
    logger.add(consoleTransport);
}

// Stream for Morgan
logger.stream = {
    write: (message) => logger.http(message.trim())
};

module.exports = logger;