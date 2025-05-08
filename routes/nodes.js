// routes/nodes.js
const express = require('express');
const { param, body, query } = require('express-validator');
const nodeManager = require('../services/node-manager');
const commandService = require('../services/command-service');
const logger = require('../config/logger');
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
            logger.error('Error getting nodes', { error: error.message });
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
            logger.error('Error getting status summary', { error: error.message });
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
            logger.error('Error getting node', { nodeId: req.params.nodeId, error: error.message });
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
            logger.error('Error updating node', { nodeId: req.params.nodeId, error: error.message });

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
            logger.error('Error sending command', {
                nodeId: req.params.nodeId,
                command: req.body.type,
                error: error.message
            });

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
            logger.error('Error broadcasting command', {
                command: req.body.type,
                error: error.message
            });

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
            logger.error('Error getting command history', { nodeId: req.params.nodeId, error: error.message });
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
            logger.error('Error restarting node', { nodeId: req.params.nodeId, error: error.message });

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
            logger.error('Error getting node metrics', { nodeId: req.params.nodeId, error: error.message });

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