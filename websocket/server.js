// websocket/server.js
const WebSocket = require('ws');
const url = require('url');
const config = require('../config/config');
const logger = require('../config/logger');
const handlers = require('./handlers');
const Node = require('../models/node');

// Map to store connected nodes
const connectedNodes = new Map();

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP/HTTPS server instance
 * @returns {WebSocket.Server} - WebSocket server instance
 */
exports.initialize = (server) => {
    const wss = new WebSocket.Server({
        noServer: true,
        path: config.websocket.path
    });

    // Handle connections
    wss.on('connection', (ws, req, nodeId) => {
        // Store connection
        connectedNodes.set(nodeId, { ws, lastSeen: Date.now() });

        logger.info(`Node connected: ${nodeId}`, {
            ip: req.socket.remoteAddress
        });

        // Update node status in database
        Node.findOneAndUpdate(
            { nodeId },
            { status: 'online', lastSeen: new Date() },
            { upsert: true, new: true }
        ).catch(err => {
            logger.error('Error updating node status on connection', {
                nodeId,
                error: err.message
            });
        });

        // Set up message handler
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                // Update last seen timestamp
                const node = connectedNodes.get(nodeId);
                if (node) {
                    node.lastSeen = Date.now();
                }

                // Handle message based on type
                if (handlers[data.type]) {
                    await handlers[data.type](nodeId, data, ws);
                } else {
                    logger.warn(`Unknown message type from node: ${data.type}`, { nodeId });
                }
            } catch (err) {
                logger.error('Error processing WebSocket message', {
                    nodeId,
                    error: err.message
                });
            }
        });

        // Handle disconnection
        ws.on('close', async () => {
            logger.info(`Node disconnected: ${nodeId}`);
            connectedNodes.delete(nodeId);

            // Update node status in database
            try {
                await Node.findOneAndUpdate(
                    { nodeId },
                    { status: 'offline', lastSeen: new Date() }
                );
            } catch (err) {
                logger.error('Error updating node status on disconnection', {
                    nodeId,
                    error: err.message
                });
            }
        });

        // Handle errors
        ws.on('error', (err) => {
            logger.error('WebSocket error', { nodeId, error: err.message });
        });

        // Send initial ping to verify connection
        ws.send(JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString()
        }));
    });

    // Handle upgrade requests
    server.on('upgrade', (request, socket, head) => {
        const pathname = url.parse(request.url).pathname;

        if (pathname.startsWith(config.websocket.path)) {
            // Extract nodeId from path
            const nodeId = pathname.replace(`${config.websocket.path}/`, '');

            if (!nodeId) {
                logger.warn('WebSocket connection attempt without nodeId', {
                    ip: request.socket.remoteAddress
                });
                socket.destroy();
                return;
            }

            // Verify authentication
            const nodeSecret = request.headers['x-node-secret'];
            if (!nodeSecret || nodeSecret !== config.security.nodeSecret) {
                logger.warn('WebSocket authentication failed', {
                    nodeId,
                    ip: request.socket.remoteAddress
                });
                socket.destroy();
                return;
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, nodeId);
            });
        } else {
            socket.destroy();
        }
    });

    // Set up heartbeat check interval
    setInterval(() => {
        const now = Date.now();

        connectedNodes.forEach((node, nodeId) => {
            // Check if node has sent a message recently
            if (now - node.lastSeen > config.websocket.heartbeatTimeout) {
                logger.warn(`Node ${nodeId} heartbeat timeout`, {
                    lastSeen: new Date(node.lastSeen).toISOString(),
                    timeout: `${config.websocket.heartbeatTimeout}ms`
                });

                // Close connection
                if (node.ws.readyState === WebSocket.OPEN) {
                    node.ws.close(1001, 'Heartbeat timeout');
                }

                connectedNodes.delete(nodeId);

                // Update node status in database
                Node.findOneAndUpdate(
                    { nodeId },
                    { status: 'offline', lastSeen: new Date(node.lastSeen) }
                ).catch(err => {
                    logger.error('Error updating node status on heartbeat timeout', {
                        nodeId,
                        error: err.message
                    });
                });
            }
        });
    }, config.websocket.heartbeatInterval);

    logger.info('WebSocket server initialized', {
        path: config.websocket.path,
        heartbeatInterval: `${config.websocket.heartbeatInterval}ms`,
        heartbeatTimeout: `${config.websocket.heartbeatTimeout}ms`
    });

    return wss;
};

/**
 * Send a message to a specific node
 * @param {string} nodeId - Target node ID
 * @param {Object} message - Message object to send
 * @returns {boolean} - Success status
 */
exports.sendToNode = (nodeId, message) => {
    const node = connectedNodes.get(nodeId);

    if (!node || node.ws.readyState !== WebSocket.OPEN) {
        logger.debug(`Cannot send message to node ${nodeId}: Not connected`);
        return false;
    }

    try {
        node.ws.send(JSON.stringify(message));
        return true;
    } catch (error) {
        logger.error(`Error sending message to node ${nodeId}`, { error: error.message });
        return false;
    }
};

/**
 * Send a message to all connected nodes
 * @param {Object} message - Message object to send
 * @returns {Object} - Results with success count and total count
 */
exports.broadcast = (message) => {
    let successCount = 0;
    const totalCount = connectedNodes.size;

    connectedNodes.forEach((node, nodeId) => {
        if (node.ws.readyState === WebSocket.OPEN) {
            try {
                node.ws.send(JSON.stringify(message));
                successCount++;
            } catch (error) {
                logger.error(`Error broadcasting to node ${nodeId}`, { error: error.message });
            }
        }
    });

    return { successCount, totalCount };
};

/**
 * Get information about connected nodes
 * @returns {Array} - Array of connected node information
 */
exports.getConnectedNodes = () => {
    const nodes = [];

    connectedNodes.forEach((node, nodeId) => {
        nodes.push({
            nodeId,
            lastSeen: new Date(node.lastSeen).toISOString(),
            connected: node.ws.readyState === WebSocket.OPEN
        });
    });

    return nodes;
};

/**
 * Check if a node is connected
 * @param {string} nodeId - Node ID to check
 * @returns {boolean} - Connection status
 */
exports.isNodeConnected = (nodeId) => {
    const node = connectedNodes.get(nodeId);
    return !!node && node.ws.readyState === WebSocket.OPEN;
};

// Export the connected nodes map for use in other modules
exports.connectedNodes = connectedNodes;