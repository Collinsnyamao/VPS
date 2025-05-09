// websocket/handlers.js
const Node = require('../models/node');
const Log = require('../models/log');
const Command = require('../models/command');
const commandService = require('../services/command-service');

/**
 * Handler for heartbeat messages from nodes
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

        // Don't log every heartbeat to avoid console spam
    } catch (error) {
        console.error(`Error processing heartbeat from ${nodeId}: ${error.message}`);
    }
};

/**
 * Handler for log messages from nodes
 */
exports.log = async (nodeId, data) => {
    try {
        // Validate log data
        if (!data.level || !data.message) {
            console.warn(`Invalid log data received from ${nodeId}`);
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

        // Forward critical logs to console
        if (data.level === 'error' || data.level === 'warn') {
            console[data.level](`[Node: ${nodeId}] ${data.message}`);
        }
    } catch (error) {
        console.error(`Error processing log message from ${nodeId}: ${error.message}`);
    }
};

/**
 * Handler for command responses from nodes
 */
exports.command_response = async (nodeId, data) => {
    try {
        // Validate response data
        if (!data.commandId) {
            console.warn(`Invalid command response received from ${nodeId}`);
            return;
        }

        // Find command in database
        const command = await Command.findOne({ commandId: data.commandId });

        if (!command) {
            console.warn(`Command response received for unknown command ${data.commandId} from ${nodeId}`);
            return;
        }

        // Update command status
        command.status = data.success ? 'successful' : 'failed';
        command.completed = new Date();
        command.result = data.result;
        command.error = data.error;

        await command.save();

        console.log(`Command ${data.commandId} completed with status: ${command.status}`);

        // Notify any waiting processes
        commandService.notifyCommandCompletion(data.commandId, {
            success: data.success,
            result: data.result,
            error: data.error
        });
    } catch (error) {
        console.error(`Error processing command response from ${nodeId}: ${error.message}`);
    }
};

/**
 * Handler for status updates from nodes
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

        console.log(`Status update from ${nodeId}: ${data.status}`);
    } catch (error) {
        console.error(`Error processing status update from ${nodeId}: ${error.message}`);
    }
};

/**
 * Handler for initial registration from nodes
 */
exports.register = async (nodeId, data) => {
    try {
        console.log(`Processing registration for node: ${nodeId}`);

        // Create or update node in database
        const node = await Node.findOneAndUpdate(
            { nodeId },
            {
                status: 'online',
                lastSeen: new Date(),
                ip: data.ip,
                name: data.name || nodeId,
                ...(data.tags && { tags: data.tags }),
                ...(data.metadata && { metadata: data.metadata }),
                firstSeen: { $exists: false } ? new Date() : undefined // Only set if not already exists
            },
            { upsert: true, new: true }
        );

        console.log(`Node registered: ${nodeId} (${data.ip})`);

        // Send confirmation back to node
        return { type: 'register_confirmation', success: true, timestamp: new Date().toISOString() };
    } catch (error) {
        console.error(`Error processing node registration for ${nodeId}: ${error.message}`);
        return { type: 'register_confirmation', success: false, error: error.message };
    }
};

/**
 * Handler for pong responses (heartbeat acknowledgements)
 */
exports.pong = async (nodeId, data) => {
    // Simple acknowledgement, minimal logging
    // console.log(`Received pong from ${nodeId}`);
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