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


