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

// Static method to retrieve recent logs
logSchema.statics.getRecent = function (options = {}) {
    const query = {};

    if (options.nodeId) {
        query.nodeId = options.nodeId;
    }

    if (options.level) {
        query.level = options.level;
    }

    if (options.startDate || options.endDate) {
        query.timestamp = {};
        if (options.startDate) {
            query.timestamp.$gte = new Date(options.startDate);
        }
        if (options.endDate) {
            query.timestamp.$lte = new Date(options.endDate);
        }
    }

    const limit = options.limit || 100;

    return this.find(query)
        .sort({ timestamp: -1 })
        .limit(limit);
};

// Static method for log aggregation
logSchema.statics.countByLevel = function (nodeId, timeRange) {
    const match = {};

    if (nodeId) {
        match.nodeId = nodeId;
    }

    if (timeRange) {
        match.timestamp = { $gte: new Date(Date.now() - timeRange) };
    }

    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$level',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

const Log = mongoose.model('Log', logSchema);

module.exports = Log;