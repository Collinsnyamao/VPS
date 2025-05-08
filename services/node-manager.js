// services/node-manager.js
const Node = require('../models/node');
const Command = require('../models/command');
const wsServer = require('../websocket/server');
const commandService = require('./command-service');
const logger = require('../config/logger');

/**
 * Get all nodes with optional filtering
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} - Array of nodes
 */
exports.getNodes = async (filters = {}) => {
    const query = {};

    // Apply filters
    if (filters.status) {
        query.status = filters.status;
    }

    if (filters.tags && filters.tags.length) {
        query.tags = { $in: filters.tags };
    }

    // Add connection status from WebSocket server
    const nodes = await Node.find(query);

    return nodes.map(node => {
        const isConnected = wsServer.isNodeConnected(node.nodeId);
        return {
            ...node.toObject(),
            connected: isConnected
        };
    });
};

/**
 * Get a specific node by ID
 * @param {string} nodeId - Node ID
 * @returns {Promise<Object>} - Node object with connection status
 */
exports.getNodeById = async (nodeId) => {
    const node = await Node.findOne({ nodeId });

    if (!node) {
        return null;
    }

    const isConnected = wsServer.isNodeConnected(nodeId);

    return {
        ...node.toObject(),
        connected: isConnected
    };
};

/**
 * Update node details
 * @param {string} nodeId - Node ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated node
 */
exports.updateNode = async (nodeId, updates) => {
    // Validate updates
    const allowedUpdates = ['name', 'tags', 'metadata'];
    const updatesObj = {};

    Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
            updatesObj[key] = updates[key];
        }
    });

    if (Object.keys(updatesObj).length === 0) {
        throw new Error('No valid update fields provided');
    }

    // Update node
    const node = await Node.findOneAndUpdate(
        { nodeId },
        updatesObj,
        { new: true }
    );

    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
};

/**
 * Get node status summary (count by status)
 * @returns {Promise<Object>} - Status summary
 */
exports.getStatusSummary = async () => {
    const summary = await Node.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    // Convert to object
    const result = {
        total: 0,
        online: 0,
        offline: 0,
        warning: 0
    };

    summary.forEach(item => {
        result[item._id] = item.count;
        result.total += item.count;
    });

    // Add connected count from WebSocket server
    result.connected = wsServer.getConnectedNodes().length;

    return result;
};

/**
 * Restart a node
 * @param {string} nodeId - Node ID
 * @param {string} initiatedBy - User ID or system identifier
 * @returns {Promise<Object>} - Restart result
 */
exports.restartNode = async (nodeId, initiatedBy = 'system') => {
    try {
        const result = await commandService.sendCommand(
            nodeId,
            'restart',
            {},
            initiatedBy,
            true,
            60000 // Longer timeout for restart
        );

        return { success: true, result };
    } catch (error) {
        logger.error(`Failed to restart node ${nodeId}`, { error: error.message });
        throw error;
    }
};

/**
 * Get node performance metrics
 * @param {string} nodeId - Node ID
 * @returns {Promise<Object>} - Current metrics
 */
exports.getNodeMetrics = async (nodeId) => {
    try {
        return await commandService.sendCommand(
            nodeId,
            'status',
            {},
            'system'
        );
    } catch (error) {
        logger.error(`Failed to get metrics for node ${nodeId}`, { error: error.message });
        throw error;
    }
};

/**
 * Clean up inactive nodes
 * @param {number} daysInactive - Days of inactivity before removal
 * @returns {Promise<number>} - Number of nodes removed
 */
exports.cleanupInactiveNodes = async (daysInactive = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const result = await Node.deleteMany({
        status: 'offline',
        lastSeen: { $lt: cutoffDate }
    });

    logger.info(`Cleaned up ${result.deletedCount} inactive nodes`, {
        daysInactive,
        cutoffDate
    });

    return result.deletedCount;
};
