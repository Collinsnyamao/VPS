// models/node.js
const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
    nodeId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        trim: true
    },
    ip: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'warning'],
        default: 'offline'
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    firstSeen: {
        type: Date,
        default: Date.now
    },
    metrics: {
        cpuUsage: {
            type: Number,
            min: 0,
            max: 100
        },
        memoryUsage: {
            type: Number,
            min: 0,
            max: 100
        },
        diskUsage: {
            type: Number,
            min: 0,
            max: 100
        },
        uptime: {
            type: Number
        }
    },
    tags: [{
        type: String,
        trim: true
    }],
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true,
    versionKey: false
});

// Index for efficient queries
nodeSchema.index({ status: 1 });
nodeSchema.index({ tags: 1 });
nodeSchema.index({ lastSeen: 1 });

// Virtual for time since last seen
nodeSchema.virtual('lastSeenAgo').get(function () {
    return Date.now() - this.lastSeen;
});

// Instance method to check if node is active
nodeSchema.methods.isActive = function (thresholdMs = 60000) { // Default 1 minute
    return this.status === 'online' && (Date.now() - this.lastSeen) < thresholdMs;
};

// Static method to find active nodes
nodeSchema.statics.findActive = function (thresholdMs = 60000) {
    const cutoffTime = new Date(Date.now() - thresholdMs);
    return this.find({
        status: 'online',
        lastSeen: { $gte: cutoffTime }
    });
};

const Node = mongoose.model('Node', nodeSchema);

module.exports = Node;