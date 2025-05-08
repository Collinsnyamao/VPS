// websocket/handlers.js
const logger = require('../config/logger');
const Node = require('../models/node');
const Log = require('../models/log');
const Command = require('../models/command');
const commandService = require('../services/command-service');

/**
 * Handler for heartbeat messages from nodes
 * @param {string} nodeId - ID of the sending node
 * @param {Object} data - Message data
 */
exports.heartbeat = async (nodeId, data) => {
    try {
        // Extract metrics from heartbeat
        const metrics = {
            cpuUsage: data.cpuUsage,
            memoryUsage: data.memoryUsage,
            diskUsage: data.diskUsage,
            uptime: data.uptime
        };

        // Update node status and metrics in database
        await Node.findOneAndUpdate(
            { nodeId },
            {
                status: 'online',
                lastSeen: new Date(),
                ip: data.ip || undefined,
                metrics
            },
            { upsert: true, new: true }
        );

        // Log heartbeat at debug level (to avoid flooding logs)
        logger.debug(`Heartbeat received from ${nodeId}`, {
            metrics,
            timestamp: data.timestamp
        });
    } catch (error) {
        logger.error('Error processing heartbeat', { nodeId, error: error.message });
    }
};

/**
 * Handler for log messages from nodes
 * @param {string} nodeId - ID of the sending node
 * @param {Object} data - Message data
 */
exports.log = async (nodeId, data) => {
    try {
        // Validate log data
        if (!data.level || !data.message) {
            logger.warn('Invalid log data received', { nodeId, data });
            return;
        }

        // Create log entry in database
        await new Log({
            nodeId,
            level: data.level,
            message: data.message,
            timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
            metadata: data.metadata || {}
        }).save();

        // Forward critical logs to sentinel logger
        if (data.level === 'error' || data.level === 'warn') {
            logger[data.level](`[Node: ${nodeId}] ${data.message}`, data.metadata || {});
        }
    } catch (error) {
        logger.error('Error processing log message', { nodeId, error: error.message });
    }
};

/**
 * Handler for command responses from nodes
 * @param {string} nodeId - ID of the sending node
 * @param {Object} data - Message data
 */
exports.command_response = async (nodeId, data) => {
    try {
        // Validate response data
        if (!data.commandId) {
            logger.warn('Invalid command response received', { nodeId, data });
            return;
        }

        // Find command in database
        const command = await Command.findOne({ commandId: data.commandId });

        if (!command) {
            logger.warn('Command response received for unknown command', {
                nodeId,
                commandId: data.commandId
            });
            return;
        }

        // Update command status
        command.status = data.success ? 'successful' : 'failed';
        command.completed = new Date();
        command.result = data.result;
        command.error = data.error;

        await command.save();

        logger.info(`Command ${data.commandId} completed with status: ${command.status}`, {
            nodeId,
            type: command.type,
            duration: command.completed - command.sent
        });

        // Notify any waiting processes
        commandService.notifyCommandCompletion(data.commandId, {
            success: data.success,
            result: data.result,
            error: data.error
        });
    } catch (error) {
        logger.error('Error processing command response', {
            nodeId,
            commandId: data.commandId,
            error: error.message
        });
    }
};

/**
 * Handler for status updates from nodes
 * @param {string} nodeId - ID of the sending node
 * @param {Object} data - Message data
 */
exports.status = async (nodeId, data) => {
    try {
        // Update node status
        await Node.findOneAndUpdate(
            { nodeId },
            {
                status: data.status || 'online',
                lastSeen: new Date(),
                ...(data.metadata && { metadata: data.metadata })
            },
            { upsert: true }
        );

        logger.debug(`Status update from ${nodeId}: ${data.status}`, {
            metadata: data.metadata
        });
    } catch (error) {
        logger.error('Error processing status update', { nodeId, error: error.message });
    }
};

/**
 * Handler for initial registration from nodes
 * @param {string} nodeId - ID of the sending node
 * @param {Object} data - Message data
 */
exports.register = async (nodeId, data) => {
    try {
        // Create or update node in database
        const node = await Node.findOneAndUpdate(
            { nodeId },
            {
                status: 'online',
                lastSeen: new Date(),
                ip: data.ip,
                name: data.name || nodeId,
                ...(data.tags && { tags: data.tags }),
                ...(data.metadata && { metadata: data.metadata })
            },
            { upsert: true, new: true }
        );

        logger.info(`Node registered: ${nodeId}`, {
            ip: data.ip,
            name: data.name || nodeId
        });

        // Send confirmation back to node
        return { type: 'register_confirmation', success: true, timestamp: new Date().toISOString() };
    } catch (error) {
        logger.error('Error processing node registration', { nodeId, error: error.message });
        return { type: 'register_confirmation', success: false, error: error.message };
    }
};

/**
 * Handler for pong responses (heartbeat acknowledgements)
 * @param {string} nodeId - ID of the sending node
 * @param {Object} data - Message data
 */
exports.pong = async (nodeId, data) => {
    // Simple acknowledgement, just log at debug level
    logger.debug(`Received pong from ${nodeId}`, {
        latency: Date.now() - new Date(data.timestamp).getTime()
    });
};

// Map all handlers for export
module.exports = {
    heartbeat: exports.heartbeat,
    log: exports.log,
    command_response: exports.command_response,
    status: exports.status,
    register: exports.register,
    pong: exports.pong
};