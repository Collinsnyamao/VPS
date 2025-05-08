// middleware/validation.js
const { validationResult } = require('express-validator');
const logger = require('../config/logger');

/**
 * Middleware to validate request data using express-validator
 */
exports.validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        logger.debug('Validation error in request', {
            path: req.path,
            errors: errors.array(),
            body: req.body
        });

        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    };
};