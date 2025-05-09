// routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../config/config');
const User = require('../models/user');
const { validate } = require('../middleware/validation');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', validate([
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
]), async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if user is active
        if (!user.active) {
            console.warn(`Login attempt by inactive user: ${username}`, { ip: req.ip });
            return res.status(401).json({
                success: false,
                message: 'Account is inactive. Please contact an administrator.'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            console.warn(`Failed login attempt for user: ${username}`, { ip: req.ip });
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Create token payload
        const payload = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // Sign token
        const token = jwt.sign(payload, config.jwt.secret, {
            expiresIn: config.jwt.expiresIn
        });

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        console.log(`User logged in: ${username}`, { userId: user._id, ip: req.ip });

        return res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                email: user.email
            }
        });
    } catch (error) {
        console.error(`Login error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (admin only)
 * @access  Private/Admin
 */
router.post('/register',
    authenticateJWT,
    authorizeRoles(['admin']),
    validate([
        body('username').isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('email').isEmail().withMessage('Must be a valid email address'),
        body('role').isIn(['admin', 'operator', 'viewer']).withMessage('Invalid role')
    ]),
    async (req, res) => {
        try {
            const { username, password, email, role } = req.body;

            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [{ username }, { email }]
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'User with that username or email already exists'
                });
            }

            // Create new user
            const user = new User({
                username,
                password, // Will be hashed in pre-save hook
                email,
                role: role || 'viewer'
            });

            await user.save();

            console.log(`New user registered: ${username}`, {
                role,
                createdBy: req.user.username
            });

            return res.status(201).json({
                success: true,
                message: 'User registered successfully',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            console.error(`User registration error: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateJWT, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error(`Profile retrieval error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password',
    authenticateJWT,
    validate([
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    ]),
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            // Get user
            const user = await User.findById(req.user.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Verify current password
            const isMatch = await user.comparePassword(currentPassword);

            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Update password
            user.password = newPassword;
            await user.save();

            console.log(`User ${user.username} changed password`);

            return res.json({
                success: true,
                message: 'Password updated successfully'
            });
        } catch (error) {
            console.error(`Password change error: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }
);

module.exports = router;