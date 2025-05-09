// websocket/server.js
const WebSocket = require('ws');
const url = require('url');
const config = require('../config/config');
const handlers = require('./handlers');
const Node = require('../models/node');

// Map to store connected nodes
const connectedNodes = new Map();

/**
 * Initialize WebSocket server
 */
exports.initialize = (server) => {
    const wss = new WebSocket.Server({
        noServer: true,
        path: config.websocket.path
    });

    // Handle upgrade requests
    server.on('upgrade', (request, socket, head) => {
        const pathname = url.parse(request.url).pathname;

        // Check if this is a node connection request
        if (pathname === config.websocket.path || pathname.startsWith(config.websocket.path + '/')) {
            // Extract nodeId from headers or URL
            let nodeId;

            // First try to get from headers (our worker implementation sends it in headers)
            if (request.headers['x-node-id']) {
                nodeId = request.headers['x-node-id'];
            }
            // Fallback to parsing from URL if not in headers
            else if (pathname.startsWith(config.websocket.path + '/')) {
                nodeId = pathname.replace(`${config.websocket.path}/`, '');
            }

            if (!nodeId) {
                console.warn(`WebSocket connection attempt without nodeId from ${request.socket.remoteAddress}`);
                socket.destroy();
                return;
            }

            // Verify authentication
            const nodeSecret = request.headers['x-node-secret'];
            if (!nodeSecret || nodeSecret !== config.security.nodeSecret) {
                console.warn(`WebSocket authentication failed for node ${nodeId} from ${request.socket.remoteAddress}`);
                socket.destroy();
                return;
            }

            // Handle upgrade if authentication succeeds
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, nodeId);
            });
        } else {
            socket.destroy();
        }
    });

    // Handle connections
    wss.on('connection', (ws, req, nodeId) => {
        // Store connection
        connectedNodes.set(nodeId, { ws, lastSeen: Date.now() });

        console.log(`Node connected: ${nodeId} from ${req.socket.remoteAddress}`);

        // Update node status in database
        Node.findOneAndUpdate(
            { nodeId },
            { status: 'online', lastSeen: new Date() },
            { upsert: true, new: true }
        ).catch(err => {
            console.error(`Error updating node status on connection for ${nodeId}: ${err.message}`);
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

                // Log message received (except heartbeats to reduce noise)
                if (data.type !== 'heartbeat') {
                    console.log(`Received ${data.type} message from ${nodeId}`);
                }

                // Handle message based on type
                if (handlers[data.type]) {
                    await handlers[data.type](nodeId, data, ws);
                } else {
                    console.warn(`Unknown message type from node ${nodeId}: ${data.type}`);
                }
            } catch (err) {
                console.error(`Error processing WebSocket message from ${nodeId}: ${err.message}`);
            }
        });

        // Handle disconnection
        ws.on('close', async () => {
            console.log(`Node disconnected: ${nodeId}`);
            connectedNodes.delete(nodeId);

            // Update node status in database
            try {
                await Node.findOneAndUpdate(
                    { nodeId },
                    { status: 'offline', lastSeen: new Date() }
                );
            } catch (err) {
                console.error(`Error updating node status on disconnection for ${nodeId}: ${err.message}`);
            }
        });

        // Handle errors
        ws.on('error', (err) => {
            console.error(`WebSocket error for node ${nodeId}: ${err.message}`);
        });

        // Send initial ping to verify connection
        ws.send(JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString()
        }));
    });

    // Set up heartbeat check interval
    setInterval(() => {
        const now = Date.now();

        connectedNodes.forEach((node, nodeId) => {
            // Check if node has sent a message recently
            if (now - node.lastSeen > config.websocket.heartbeatTimeout) {
                console.warn(`Node ${nodeId} heartbeat timeout. Last seen: ${new Date(node.lastSeen).toISOString()}`);

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
                    console.error(`Error updating node status on heartbeat timeout for ${nodeId}: ${err.message}`);
                });
            }
        });
    }, config.websocket.heartbeatInterval);

    console.log(`WebSocket server initialized at ${config.websocket.path}`);
    console.log(`Heartbeat interval: ${config.websocket.heartbeatInterval}ms`);
    console.log(`Heartbeat timeout: ${config.websocket.heartbeatTimeout}ms`);

    return wss;
};

/**
 * Send a message to a specific node
 */
exports.sendToNode = (nodeId, message) => {
    const node = connectedNodes.get(nodeId);

    if (!node || node.ws.readyState !== WebSocket.OPEN) {
        console.log(`Cannot send message to node ${nodeId}: Not connected`);
        return false;
    }

    try {
        // Log message type without flooding console with full message content
        console.log(`Sending ${message.type} message to node ${nodeId}`);

        node.ws.send(JSON.stringify(message));
        return true;
    } catch (error) {
        console.error(`Error sending message to node ${nodeId}: ${error.message}`);
        return false;
    }
};

/**
 * Send a message to all connected nodes
 */
exports.broadcast = (message) => {
    let successCount = 0;
    const totalCount = connectedNodes.size;

    console.log(`Broadcasting ${message.type} message to ${totalCount} nodes`);

    connectedNodes.forEach((node, nodeId) => {
        if (node.ws.readyState === WebSocket.OPEN) {
            try {
                node.ws.send(JSON.stringify(message));
                successCount++;
            } catch (error) {
                console.error(`Error broadcasting to node ${nodeId}: ${error.message}`);
            }
        }
    });

    console.log(`Broadcast complete: ${successCount}/${totalCount} nodes received the message`);
    return { successCount, totalCount };
};

/**
 * Get information about connected nodes
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
 */
exports.isNodeConnected = (nodeId) => {
    const node = connectedNodes.get(nodeId);
    return !!node && node.ws.readyState === WebSocket.OPEN;
};

// Export the connected nodes map for use in other modules
exports.connectedNodes = connectedNodes;