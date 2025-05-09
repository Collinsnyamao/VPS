// routes/nodes.js
const express = require('express');
const { param, body, query } = require('express-validator');
const nodeManager = require('../services/node-manager');
const commandService = require('../services/command-service');
const { validate } = require('../middleware/validation');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/nodes
 * @desc    Get all nodes with optional filtering
 * @access  Private
 */
router.get('/',
    authenticateJWT,
    async (req, res) => {
        try {
            const filters = {
                status: req.query.status,
                tags: req.query.tags ? req.query.tags.split(',') : undefined
            };

            const nodes = await nodeManager.getNodes(filters);

            return res.json({
                success: true,
                count: nodes.length,
                nodes
            });
        } catch (error) {
            console.error(`Error getting nodes: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   GET /api/nodes/status
 * @desc    Get node status summary
 * @access  Private
 */
router.get('/status',
    authenticateJWT,
    async (req, res) => {
        try {
            const statusSummary = await nodeManager.getStatusSummary();

            return res.json({
                success: true,
                statusSummary
            });
        } catch (error) {
            console.error(`Error getting status summary: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   GET /api/nodes/:nodeId
 * @desc    Get a specific node by ID
 * @access  Private
 */
router.get('/:nodeId',
    authenticateJWT,
    validate([
        param('nodeId').notEmpty().withMessage('Node ID is required')
    ]),
    async (req, res) => {
        try {
            const node = await nodeManager.getNodeById(req.params.nodeId);

            if (!node) {
                return res.status(404).json({
                    success: false,
                    message: 'Node not found'
                });
            }

            return res.json({
                success: true,
                node
            });
        } catch (error) {
            console.error(`Error getting node ${req.params.nodeId}: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   PUT /api/nodes/:nodeId
 * @desc    Update node details
 * @access  Private/Admin, Operator
 */
router.put('/:nodeId',
    authenticateJWT,
    authorizeRoles(['admin', 'operator']),
    validate([
        param('nodeId').notEmpty().withMessage('Node ID is required')
    ]),
    async (req, res) => {
        try {
            const { name, tags, metadata } = req.body;

            const node = await nodeManager.updateNode(req.params.nodeId, {
                name,
                tags,
                metadata
            });

            return res.json({
                success: true,
                message: 'Node updated successfully',
                node
            });
        } catch (error) {
            console.error(`Error updating node ${req.params.nodeId}: ${error.message}`);

            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   POST /api/nodes/:nodeId/command
 * @desc    Send a command to a node
 * @access  Private/Admin, Operator
 */
router.post('/:nodeId/command',
    authenticateJWT,
    authorizeRoles(['admin', 'operator']),
    validate([
        param('nodeId').notEmpty().withMessage('Node ID is required'),
        body('type').notEmpty().withMessage('Command type is required'),
        body('parameters').optional()
    ]),
    async (req, res) => {
        try {
            const { nodeId } = req.params;
            const { type, parameters, waitForResponse = true, timeout } = req.body;

            console.log(`API Request: Sending command ${type} to node ${nodeId}`);

            const result = await commandService.sendCommand(
                nodeId,
                type,
                parameters || {},
                req.user.username,
                waitForResponse,
                timeout
            );

            return res.json({
                success: true,
                message: waitForResponse ? 'Command executed successfully' : 'Command sent successfully',
                result
            });
        } catch (error) {
            console.error(`Error sending command to ${req.params.nodeId}: ${error.message}`);

            if (error.message.includes('not connected')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('timed out')) {
                return res.status(408).json({
                    success: false,
                    message: error.message
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || 'Server error'
            });
        }
    }
);

/**
 * @route   POST /api/nodes/broadcast
 * @desc    Broadcast a command to all nodes
 * @access  Private/Admin
 */
router.post('/broadcast',
    authenticateJWT,
    authorizeRoles(['admin']),
    validate([
        body('type').notEmpty().withMessage('Command type is required'),
        body('parameters').optional()
    ]),
    async (req, res) => {
        try {
            const { type, parameters } = req.body;

            console.log(`API Request: Broadcasting command ${type} to all nodes`);

            const result = await commandService.broadcastCommand(
                type,
                parameters || {},
                req.user.username
            );

            return res.json({
                success: true,
                message: 'Command broadcast successfully',
                result
            });
        } catch (error) {
            console.error(`Error broadcasting command: ${error.message}`);

            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   GET /api/nodes/:nodeId/commands
 * @desc    Get command history for a node
 * @access  Private
 */
router.get('/:nodeId/commands',
    authenticateJWT,
    validate([
        param('nodeId').notEmpty().withMessage('Node ID is required')
    ]),
    async (req, res) => {
        try {
            const options = {
                status: req.query.status,
                type: req.query.type,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                limit: req.query.limit ? parseInt(req.query.limit) : 100,
                skip: req.query.skip ? parseInt(req.query.skip) : 0
            };

            const commands = await commandService.getCommandHistory(req.params.nodeId, options);

            return res.json({
                success: true,
                count: commands.length,
                commands
            });
        } catch (error) {
            console.error(`Error getting command history for ${req.params.nodeId}: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   POST /api/nodes/:nodeId/restart
 * @desc    Restart a node
 * @access  Private/Admin, Operator
 */
router.post('/:nodeId/restart',
    authenticateJWT,
    authorizeRoles(['admin', 'operator']),
    validate([
        param('nodeId').notEmpty().withMessage('Node ID is required')
    ]),
    async (req, res) => {
        try {
            const result = await nodeManager.restartNode(
                req.params.nodeId,
                req.user.username
            );

            return res.json({
                success: true,
                message: 'Node restart command sent successfully',
                result
            });
        } catch (error) {
            console.error(`Error restarting node ${req.params.nodeId}: ${error.message}`);

            if (error.message.includes('not connected')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || 'Server error'
            });
        }
    }
);

/**
 * @route   GET /api/nodes/:nodeId/metrics
 * @desc    Get current metrics for a node
 * @access  Private
 */
router.get('/:nodeId/metrics',
    authenticateJWT,
    validate([
        param('nodeId').notEmpty().withMessage('Node ID is required')
    ]),
    async (req, res) => {
        try {
            const metrics = await nodeManager.getNodeMetrics(req.params.nodeId);

            return res.json({
                success: true,
                metrics
            });
        } catch (error) {
            console.error(`Error getting node metrics for ${req.params.nodeId}: ${error.message}`);

            if (error.message.includes('not connected')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || 'Server error'
            });
        }
    }
);

module.exports = router;


/**
 * @swagger
 * components:
 *   schemas:
 *     Node:
 *       type: object
 *       properties:
 *         nodeId:
 *           type: string
 *         name:
 *           type: string
 *         ip:
 *           type: string
 *         status:
 *           type: string
 *           enum: [online, offline, warning]
 *         lastSeen:
 *           type: string
 *           format: date-time
 *         metrics:
 *           type: object
 *           properties:
 *             cpuUsage:
 *               type: number
 *             memoryUsage:
 *               type: number
 *             diskUsage:
 *               type: number
 *             uptime:
 *               type: number
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         connected:
 *           type: boolean
 */

/**
 * @swagger
 * /api/nodes:
 *   get:
 *     summary: Get all nodes with optional filtering
 *     tags: [Nodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [online, offline, warning]
 *         description: Filter by node status
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Filter by tags (comma-separated)
 *     responses:
 *       200:
 *         description: List of nodes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 nodes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Node'
 */

/**
 * @swagger
 * /api/nodes/{nodeId}/command:
 *   post:
 *     summary: Send a command to a node
 *     tags: [Nodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nodeId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the node
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 description: Command type
 *                 enum: [status, system, disk, exec, restart, ping]
 *               parameters:
 *                 type: object
 *                 description: Command parameters
 *               waitForResponse:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to wait for response
 *               timeout:
 *                 type: integer
 *                 description: Command timeout in milliseconds
 *     responses:
 *       200:
 *         description: Command executed successfully
 *       404:
 *         description: Node not found or not connected
 *       408:
 *         description: Command timed out
 */