// services/command-service.js
const { v4: uuidv4 } = require('uuid');
const Command = require('../models/command');
const wsServer = require('../websocket/server');

// Store command callbacks for async operation
const commandCallbacks = new Map();

/**
 * Send a command to a specific node
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

    // Prepare command message - format must match what worker expects
    const message = {
        type: 'command',
        commandId,
        command: type, // Worker expects 'command' field, not 'type'
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

    console.log(`Command ${commandId} sent to ${nodeId}: ${type}`);

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
                console.error(`Error updating command timeout status for ${commandId}: ${err.message}`);
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

    console.log(`Broadcast command ${type} to ${sent}/${connectedNodes.length} nodes`);

    return {
        sent,
        total: connectedNodes.length,
        failureCount: connectedNodes.length - sent
    };
};

/**
 * Notify completion of a command
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
 */
exports.cleanupOldCommands = async (daysToKeep = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Command.deleteMany({
        createdAt: { $lt: cutoffDate }
    });

    console.log(`Cleaned up ${result.deletedCount} old command records (older than ${daysToKeep} days)`);

    return result.deletedCount;
};