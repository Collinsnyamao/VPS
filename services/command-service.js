// services/command-service.js
const { v4: uuidv4 } = require('uuid');
const Command = require('../models/command');
const wsServer = require('../websocket/server');
const logger = require('../config/logger');

// Store command callbacks for async operation
const commandCallbacks = new Map();

/**
 * Send a command to a specific node
 * @param {string} nodeId - Target node ID
 * @param {string} type - Command type
 * @param {Object} parameters - Command parameters
 * @param {string} initiatedBy - User ID or system identifier that initiated the command
 * @param {boolean} waitForResponse - Whether to wait for a response
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} - Command result or command object
 */
exports.sendCommand = async (nodeId, type, parameters = {}, initiatedBy = 'system', waitForResponse = true, timeout = 30000) => {
    // Check if node is connected
    if (!wsServer.isNodeConnected(nodeId)) {
        throw new Error(`Node ${nodeId} is not connected`);
    }

    // Generate command ID
    const commandId = uuidv4();

    // Create command record
    const command = new Command({
        commandId,
        nodeId,
        type,
        parameters,
        initiatedBy,
        status: 'pending'
    });

    await command.save();

    // Prepare command message
    const message = {
        type: 'command',
        commandId,
        command: type,
        parameters,
        timestamp: new Date().toISOString()
    };

    // Send command to node
    const sent = wsServer.sendToNode(nodeId, message);

    if (!sent) {
        // Update command status if sending failed
        command.status = 'failed';
        command.error = 'Failed to send command: Node disconnected';
        await command.save();

        throw new Error(`Failed to send command to ${nodeId}: Node disconnected`);
    }

    // Update command status
    command.status = 'sent';
    command.sent = new Date();
    await command.save();

    logger.info(`Command ${commandId} sent to ${nodeId}`, { type, parameters });

    // If not waiting for response, return command
    if (!waitForResponse) {
        return command;
    }

    // Wait for command completion
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            // Remove callback
            commandCallbacks.delete(commandId);

            // Update command status
            Command.findOneAndUpdate(
                { commandId },
                { status: 'timeout', error: `Command timed out after ${timeout}ms` }
            ).catch(err => {
                logger.error('Error updating command timeout status', {
                    commandId,
                    error: err.message
                });
            });

            reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);

        // Store callback
        commandCallbacks.set(commandId, (result) => {
            clearTimeout(timeoutId);

            if (result.success) {
                resolve(result.result);
            } else {
                reject(new Error(result.error || 'Command failed'));
            }
        });
    });
};

/**
 * Broadcast a command to all connected nodes
 * @param {string} type - Command type
 * @param {Object} parameters - Command parameters
 * @param {string} initiatedBy - User ID or system identifier that initiated the command
 * @returns {Promise<Object>} - Broadcast results
 */
exports.broadcastCommand = async (type, parameters = {}, initiatedBy = 'system') => {
    // Get connected nodes
    const connectedNodes = wsServer.getConnectedNodes();

    if (connectedNodes.length === 0) {
        return { sent: 0, total: 0 };
    }

    // Send command to each node
    const results = await Promise.allSettled(
        connectedNodes.map(node =>
            exports.sendCommand(node.nodeId, type, parameters, initiatedBy, false)
        )
    );

    // Count successes
    const sent = results.filter(result => result.status === 'fulfilled').length;

    return {
        sent,
        total: connectedNodes.length,
        failureCount: connectedNodes.length - sent
    };
};

/**
 * Notify completion of a command
 * @param {string} commandId - ID of the completed command
 * @param {Object} result - Command result
 */
exports.notifyCommandCompletion = (commandId, result) => {
    const callback = commandCallbacks.get(commandId);

    if (callback) {
        callback(result);
        commandCallbacks.delete(commandId);
    }
};

/**
 * Get command history for a node
 * @param {string} nodeId - Node ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Command history
 */
exports.getCommandHistory = async (nodeId, options = {}) => {
    const query = { nodeId };

    // Apply filters
    if (options.status) {
        query.status = options.status;
    }

    if (options.type) {
        query.type = options.type;
    }

    if (options.startDate || options.endDate) {
        query.createdAt = {};
        if (options.startDate) {
            query.createdAt.$gte = new Date(options.startDate);
        }
        if (options.endDate) {
            query.createdAt.$lte = new Date(options.endDate);
        }
    }

    // Set limits and sorting
    const limit = options.limit || 100;
    const skip = options.skip || 0;
    const sort = { createdAt: -1 };

    return Command.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);
};

/**
 * Clean up old command records
 * @param {number} daysToKeep - Number of days to keep command records
 * @returns {Promise<number>} - Number of deleted records
 */
exports.cleanupOldCommands = async (daysToKeep = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Command.deleteMany({
        createdAt: { $lt: cutoffDate }
    });

    logger.info(`Cleaned up ${result.deletedCount} old command records`, {
        daysToKeep,
        cutoffDate
    });

    return result.deletedCount;
};

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

// services/log-service.js
const Log = require('../models/log');
const logger = require('../config/logger');

/**
 * Get logs with filtering and pagination
 * @param {Object} filters - Filter criteria
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Logs and count
 */
exports.getLogs = async (filters = {}, pagination = {}) => {
    const query = {};

    // Apply filters
    if (filters.nodeId) {
        query.nodeId = filters.nodeId;
    }

    if (filters.level) {
        query.level = filters.level;
    }

    if (filters.message) {
        query.message = { $regex: filters.message, $options: 'i' };
    }

    if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
            query.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            query.timestamp.$lte = new Date(filters.endDate);
        }
    }

    // Set pagination
    const limit = pagination.limit || 100;
    const page = pagination.page || 1;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await Log.countDocuments(query);

    // Get logs
    const logs = await Log.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

    return {
        logs,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * Get log statistics
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} - Log statistics
 */
exports.getLogStats = async (filters = {}) => {
    const match = {};

    // Apply filters
    if (filters.nodeId) {
        match.nodeId = filters.nodeId;
    }

    if (filters.startDate || filters.endDate) {
        match.timestamp = {};
        if (filters.startDate) {
            match.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            match.timestamp.$lte = new Date(filters.endDate);
        }
    }

    // Get counts by level
    const levelStats = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$level',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    // Get counts by node
    const nodeStats = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$nodeId',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // Get counts by time period
    const timeRange = filters.timeRange || 'day';
    let timeFormat;

    switch (timeRange) {
        case 'hour':
            timeFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } };
            break;
        case 'day':
            timeFormat = { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
            break;
        case 'week':
            // This is a simplification - exact week calculations would require more complex logic
            timeFormat = { $dateToString: { format: '%Y-%U', date: '$timestamp' } };
            break;
        case 'month':
            timeFormat = { $dateToString: { format: '%Y-%m', date: '$timestamp' } };
            break;
        default:
            timeFormat = { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
    }

    const timeStats = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: timeFormat,
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
    ]);

    return {
        byLevel: levelStats,
        byNode: nodeStats,
        byTime: timeStats
    };
};

/**
 * Clean up old logs
 * @param {number} daysToKeep - Number of days to keep logs
 * @returns {Promise<number>} - Number of deleted logs
 */
exports.cleanupOldLogs = async (daysToKeep = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Log.deleteMany({
        timestamp: { $lt: cutoffDate }
    });

    logger.info(`Cleaned up ${result.deletedCount} old logs`, {
        daysToKeep,
        cutoffDate
    });

    return result.deletedCount;
};

/**
 * Add a system log
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
exports.addSystemLog = async (level, message, metadata = {}) => {
    try {
        await new Log({
            nodeId: 'system',
            level,
            message,
            metadata
        }).save();

        // Also log to application logger
        logger[level](message, metadata);
    } catch (error) {
        logger.error('Failed to add system log', { error: error.message });
    }
};