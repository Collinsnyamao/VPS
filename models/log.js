// models/log.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    nodeId: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    level: {
        type: String,
        enum: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'],
        default: 'info',
        index: true
    },
    message: {
        type: String,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true,
    versionKey: false
});

// Create compound index for efficient queries
logSchema.index({ nodeId: 1, timestamp: -1 });
logSchema.index({ level: 1, timestamp: -1 });

const Log = mongoose.model('Log', logSchema);

module.exports = Log;