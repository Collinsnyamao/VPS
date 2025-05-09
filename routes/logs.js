// routes/logs.js
const express = require('express');
const { query } = require('express-validator');
const logService = require('../services/log-service');
const { validate } = require('../middleware/validation');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/logs
 * @desc    Get logs with optional filtering
 * @access  Private
 */
router.get('/',
    authenticateJWT,
    validate([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
    ]),
    async (req, res) => {
        try {
            const filters = {
                nodeId: req.query.nodeId,
                level: req.query.level,
                message: req.query.message,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const pagination = {
                page: req.query.page ? parseInt(req.query.page) : 1,
                limit: req.query.limit ? parseInt(req.query.limit) : 100
            };

            console.log(`Getting logs with filters`, filters);

            const result = await logService.getLogs(filters, pagination);

            return res.json({
                success: true,
                logs: result.logs,
                pagination: result.pagination
            });
        } catch (error) {
            console.error(`Error getting logs: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   GET /api/logs/stats
 * @desc    Get log statistics
 * @access  Private
 */
router.get('/stats',
    authenticateJWT,
    async (req, res) => {
        try {
            const filters = {
                nodeId: req.query.nodeId,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                timeRange: req.query.timeRange
            };

            console.log(`Getting log statistics with filters`, filters);

            const stats = await logService.getLogStats(filters);

            return res.json({
                success: true,
                stats
            });
        } catch (error) {
            console.error(`Error getting log stats: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   DELETE /api/logs/cleanup
 * @desc    Clean up old logs
 * @access  Private/Admin
 */
router.delete('/cleanup',
    authenticateJWT,
    authorizeRoles(['admin']),
    validate([
        query('days').optional().isInt({ min: 1 }).withMessage('Days must be a positive integer')
    ]),
    async (req, res) => {
        try {
            const days = req.query.days ? parseInt(req.query.days) : 30;

            console.log(`Cleaning up logs older than ${days} days`);

            const count = await logService.cleanupOldLogs(days);

            return res.json({
                success: true,
                message: `Successfully cleaned up ${count} old logs`,
                count
            });
        } catch (error) {
            console.error(`Error cleaning up logs: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

module.exports = router;

/**
 * @swagger
 * components:
 *   schemas:
 *     Log:
 *       type: object
 *       properties:
 *         nodeId:
 *           type: string
 *         timestamp:
 *           type: string
 *           format: date-time
 *         level:
 *           type: string
 *           enum: [error, warn, info, http, verbose, debug, silly]
 *         message:
 *           type: string
 *         metadata:
 *           type: object
 */

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: Get logs with optional filtering
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: nodeId
 *         schema:
 *           type: string
 *         description: Filter by node ID
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [error, warn, info, http, verbose, debug, silly]
 *         description: Filter by log level
 *       - in: query
 *         name: message
 *         schema:
 *           type: string
 *         description: Filter by message content
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Log'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */