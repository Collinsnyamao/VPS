// routes/logs.js
const express = require('express');
const { param, query } = require('express-validator');
const logService = require('../services/log-service');
const logger = require('../config/logger');
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

            const result = await logService.getLogs(filters, pagination);

            return res.json({
                success: true,
                logs: result.logs,
                pagination: result.pagination
            });
        } catch (error) {
            logger.error('Error getting logs', { error: error.message });
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

            const stats = await logService.getLogStats(filters);

            return res.json({
                success: true,
                stats
            });
        } catch (error) {
            logger.error('Error getting log stats', { error: error.message });
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

module.exports = router;