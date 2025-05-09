// services/log-service.js
const Log = require('../models/log');

/**
 * Get logs with filtering and pagination
 */
exports.getLogs = async (filters = {}, pagination = {}) => {
    const query = {};

    // Apply filters
    if (filters.nodeId) {
        query.nodeId = filters.nodeId;
    }

    if (filters.level) {
        query.level = filters.level;
    }

    if (filters.message) {
        query.message = { $regex: filters.message, $options: 'i' };
    }

    if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
            query.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            query.timestamp.$lte = new Date(filters.endDate);
        }
    }

    // Set pagination
    const limit = pagination.limit || 100;
    const page = pagination.page || 1;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await Log.countDocuments(query);

    // Get logs
    const logs = await Log.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

    return {
        logs,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * Get log statistics
 */
exports.getLogStats = async (filters = {}) => {
    const match = {};

    // Apply filters
    if (filters.nodeId) {
        match.nodeId = filters.nodeId;
    }

    if (filters.startDate || filters.endDate) {
        match.timestamp = {};
        if (filters.startDate) {
            match.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            match.timestamp.$lte = new Date(filters.endDate);
        }
    }

    // Get counts by level
    const levelStats = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$level',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    // Get counts by node
    const nodeStats = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$nodeId',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // Get counts by time period
    const timeRange = filters.timeRange || 'day';
    let timeFormat;

    switch (timeRange) {
        case 'hour':
            timeFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } };
            break;
        case 'day':
            timeFormat = { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
            break;
        case 'week':
            timeFormat = { $dateToString: { format: '%Y-%U', date: '$timestamp' } };
            break;
        case 'month':
            timeFormat = { $dateToString: { format: '%Y-%m', date: '$timestamp' } };
            break;
        default:
            timeFormat = { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
    }

    const timeStats = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: timeFormat,
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
    ]);

    return {
        byLevel: levelStats,
        byNode: nodeStats,
        byTime: timeStats
    };
};

/**
 * Clean up old logs
 */
exports.cleanupOldLogs = async (daysToKeep = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Log.deleteMany({
        timestamp: { $lt: cutoffDate }
    });

    console.log(`Cleaned up ${result.deletedCount} old logs (older than ${daysToKeep} days)`);

    return result.deletedCount;
};

/**
 * Add a system log
 */
exports.addSystemLog = async (level, message, metadata = {}) => {
    try {
        await new Log({
            nodeId: 'system',
            level,
            message,
            metadata
        }).save();

        // Also log to console
        console[level](`[System] ${message}`);
    } catch (error) {
        console.error(`Failed to add system log: ${error.message}`);
    }
};