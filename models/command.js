// models/command.js
const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
    commandId: {
        type: String,
        required: true,
        unique: true
    },
    nodeId: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        index: true
    },
    parameters: {
        type: mongoose.Schema.Types.Mixed
    },
    initiatedBy: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'successful', 'failed', 'timeout'],
        default: 'pending',
        index: true
    },
    sent: {
        type: Date
    },
    completed: {
        type: Date
    },
    result: {
        type: mongoose.Schema.Types.Mixed
    },
    error: {
        type: String
    }
}, {
    timestamps: true,
    versionKey: false
});

// Create compound indices for efficient queries
commandSchema.index({ nodeId: 1, status: 1 });
commandSchema.index({ nodeId: 1, createdAt: -1 });

const Command = mongoose.model('Command', commandSchema);

module.exports = Command;