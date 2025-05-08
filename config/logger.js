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
    format.splat()
);

// Create JSON format for file logging
const jsonFormat = format.combine(
    logFormat,
    format.json()
);

// Create human-readable format for console
const consoleFormat = format.combine(
    logFormat,
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
        // Simplify metadata for console output
        const metaString = Object.keys(meta).length
            ? Object.keys(meta).map(key => {
                if (key === 'service' || key === 'nodeId') return '';

                // Special handling for error objects
                if (key === 'error' && typeof meta[key] === 'object') {
                    return `${key}: ${meta[key].message || JSON.stringify(meta[key])}`;
                }

                // Handle nested objects
                if (typeof meta[key] === 'object') {
                    return `${key}: ${JSON.stringify(meta[key])}`;
                }

                return `${key}: ${meta[key]}`;
            }).filter(Boolean).join(', ')
            : '';

        const nodeId = meta.nodeId ? `[${meta.nodeId}] ` : '';
        return `${timestamp} ${level}: ${nodeId}${message} ${metaString}`;
    })
);

// Create file transports
const fileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'sentinel-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    level: config.logging.level,
    format: jsonFormat
});

const errorFileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'sentinel-error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    level: 'error',
    format: jsonFormat
});

// Create console transport
const consoleTransport = new transports.Console({
    level: config.logging.level,
    format: consoleFormat
});

// Create logger with all transports
const logger = createLogger({
    level: config.logging.level,
    defaultMeta: { service: 'sentinel-vps' },
    transports: [
        fileTransport,
        errorFileTransport,
        consoleTransport // Always include console transport
    ]
});

// Stream for Morgan
logger.stream = {
    write: (message) => logger.http(message.trim())
};

module.exports = logger;