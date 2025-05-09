// setup.js - Run this to create the initial admin user
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const config = require('./config/config');

console.log("===========================================");
console.log(" Sentinel VPS - Initial Setup");
console.log("===========================================");

console.log("Connecting to MongoDB...");
mongoose.connect(config.database.uri, config.database.options)
    .then(() => {
        console.log("MongoDB connected successfully");
        createAdminUser();
    })
    .catch(err => {
        console.error(`MongoDB connection error: ${err.message}`);
        process.exit(1);
    });

// Create User model directly here to avoid circular dependencies
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    role: {
        type: String,
        enum: ['admin', 'operator', 'viewer'],
        default: 'viewer'
    },
    lastLogin: {
        type: Date
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    versionKey: false
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

const User = mongoose.model('User', userSchema);

async function createAdminUser() {
    try {
        // Check if admin already exists
        const existingAdmin = await User.findOne({ role: 'admin' });

        if (existingAdmin) {
            console.log("Admin user already exists.");
            console.log(`Username: ${existingAdmin.username}`);
            console.log(`Email: ${existingAdmin.email}`);
            mongoose.connection.close();
            return;
        }

        // Ask for admin credentials
        console.log("\nCreating admin user...");

        // In a real script you would prompt for these
        // For simplicity, we'll hardcode them here
        const adminUser = {
            username: 'admin',
            password: 'admin123',  // Will be hashed automatically
            email: 'admin@example.com',
            role: 'admin'
        };

        console.log(`Username: ${adminUser.username}`);
        console.log(`Email: ${adminUser.email}`);

        // Create the admin user
        const user = new User(adminUser);
        await user.save();

        console.log("\nAdmin user created successfully!");
        console.log("You can now log in to the system with these credentials.");

        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error(`Error creating admin user: ${error.message}`);
        mongoose.connection.close();
        process.exit(1);
    }
}