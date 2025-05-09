// middleware/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user');

/**
 * Middleware to authenticate API requests using JWT
 */
exports.authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        next();
    } catch (error) {
        console.warn(`JWT authentication failed: ${error.message}`, { ip: req.ip });
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token.'
        });
    }
};

/**
 * Middleware to verify user roles
 * @param {string[]} roles - Array of allowed roles
 */
exports.authorizeRoles = (roles) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Authentication required.'
            });
        }

        try {
            const user = await User.findById(req.user.id);

            if (!user || !user.active) {
                return res.status(403).json({
                    success: false,
                    message: 'User account is inactive or not found.'
                });
            }

            if (!roles.includes(user.role)) {
                console.warn(`Unauthorized access attempt by ${user.username} (${user.role})`, {
                    path: req.path,
                    requiredRoles: roles
                });

                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Insufficient permissions.'
                });
            }

            // Add full user info to request
            req.user = user;
            next();
        } catch (error) {
            console.error(`Error in role authorization: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Internal server error.'
            });
        }
    };
};

/**
 * Middleware to authenticate node connections using a shared secret
 */
exports.authenticateNode = (req, res, next) => {
    const nodeToken = req.headers['x-node-secret'];

    if (!nodeToken || nodeToken !== config.security.nodeSecret) {
        console.warn(`Node authentication failed from ${req.ip}`, {
            nodeId: req.headers['x-node-id'] || 'unknown'
        });

        return res.status(403).json({
            success: false,
            message: 'Invalid node authentication.'
        });
    }

    next();
};