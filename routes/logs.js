// routes/logs.js
const express = require('express');
const { query } = require('express-validator');
const logService = require('../services/log-service');
const { validate } = require('../middleware/validation');
const { authenticateJWT } = require('../middleware/auth');

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