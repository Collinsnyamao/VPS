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


/**
 * @swagger
 * components:
 *   schemas:
 *     Node:
 *       type: object
 *       required:
 *         - nodeId
 *         - ip
 *       properties:
 *         nodeId:
 *           type: string
 *           description: Unique identifier for the node
 *         name:
 *           type: string
 *           description: Display name for the node
 *         ip:
 *           type: string
 *           description: IP address of the node
 *         status:
 *           type: string
 *           enum: [online, offline, warning]
 *           default: offline
 *           description: Current status of the node
 *         lastSeen:
 *           type: string
 *           format: date-time
 *           description: Last time the node was seen
 *         firstSeen:
 *           type: string
 *           format: date-time
 *           description: When the node was first registered
 *         metrics:
 *           type: object
 *           properties:
 *             cpuUsage:
 *               type: number
 *               description: CPU usage percentage
 *             memoryUsage:
 *               type: number
 *               description: Memory usage percentage
 *             diskUsage:
 *               type: number
 *               description: Disk usage percentage
 *             uptime:
 *               type: number
 *               description: System uptime in seconds
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Tags for categorizing nodes
 *         metadata:
 *           type: object
 *           description: Additional metadata
 */