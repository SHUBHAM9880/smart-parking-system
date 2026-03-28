const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const emailService = require('../services/emailService');
const { authenticateToken } = require('../middleware/authMiddleware');
const { validateRegistration, validateLogin } = require('../middleware/validationMiddleware');

const router = express.Router();

// Register new user (OTP-verified registration)
router.post('/register-verified', async (req, res) => {
  try {
    const { name, email, password, phone, emailVerified } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User already exists with this email' 
      });
    }

    // Create user with verified status if OTP was verified
    const userData = { name, email, password, phone };
    if (emailVerified) {
      userData.is_verified = true;
      userData.email_verified_at = new Date();
    }

    const userId = await User.create(userData);

    // Get user data (without password)
    const user = await User.findById(userId);

    // Generate JWT token for immediate login
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'ezy-parking-secret',
      { expiresIn: '24h' }
    );

    // Send admin notification for new user registration
    const adminEmail = 'shubhamyamakar9880@gmail.com';
    try {
      await emailService.sendAdminNewUserNotification(adminEmail, {
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_verified: user.is_verified
      });
    } catch (adminEmailError) {
      console.log('⚠️ Admin notification error:', adminEmailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Registration completed successfully! You are now logged in.',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Verified registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Register new user
router.post('/register', validateRegistration, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User already exists with this email' 
      });
    }

    // Create user
    const userId = await User.create({ name, email, password, phone });

    // Get user data (without password)
    const user = await User.findById(userId);

    // Send email verification
    if (user && user.email) {
      try {
        const emailResult = await emailService.sendEmailVerification(user.email, {
          name: user.name,
          email: user.email
        }, user.email_verification_token);
        
        if (emailResult.success) {
          console.log(`📧 Verification email sent to ${user.email}`);
        } else {
          console.log(`⚠️ Email service not configured - verification URL: ${emailResult.verificationUrl}`);
        }
      } catch (emailError) {
        console.log('⚠️ Email service error - verification email not sent');
      }
    }

    // Send admin notification for new user registration
    const adminEmail = 'shubhamyamakar9880@gmail.com';
    try {
      await emailService.sendAdminNewUserNotification(adminEmail, {
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_verified: user.is_verified
      });
    } catch (adminEmailError) {
      console.log('⚠️ Admin notification error:', adminEmailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      user: user.toJSON(),
      requires_verification: true
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Login user
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Verify password
    const isValidPassword = await user.verifyPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Check if email is verified
    if (!user.is_verified) {
      return res.status(403).json({ 
        success: false,
        error: 'Please verify your email address before logging in',
        requires_verification: true,
        email: user.email
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'ezy-parking-secret',
      { expiresIn: '24h' }
    );

    // Send admin notification for user login
    const adminEmail = 'shubhamyamakar9880@gmail.com';
    try {
      await emailService.sendAdminUserLoginNotification(adminEmail, {
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      }, {
        loginTime: new Date().toISOString(),
        totalLogins: 'N/A',
        lastLogin: null
      });
    } catch (adminEmailError) {
      console.log('⚠️ Admin login notification error:', adminEmailError.message);
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Verify token endpoint
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // Get user details
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get current user (alias for profile)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Me endpoint error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Verify email with token
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Verify the token and update user
    const user = await User.verifyEmail(token);
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }

    // Send verification success email
    try {
      await emailService.sendEmailVerificationSuccess(user.email, {
        name: user.name,
        email: user.email
      });
    } catch (emailError) {
      console.log('⚠️ Email service error - verification success email not sent');
    }

    res.json({
      success: true,
      message: 'Email verified successfully! You can now login to your account.',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if already verified
    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified'
      });
    }

    // Generate new verification token
    const verificationToken = await user.resendVerificationEmail();

    // Send verification email
    try {
      const emailResult = await emailService.sendEmailVerification(user.email, {
        name: user.name,
        email: user.email
      }, verificationToken);
      
      if (emailResult.success) {
        console.log(`📧 Verification email resent to ${user.email}`);
      } else {
        console.log(`⚠️ Email service not configured - verification URL: ${emailResult.verificationUrl}`);
      }
    } catch (emailError) {
      console.log('⚠️ Email service error - verification email not sent');
    }

    res.json({
      success: true,
      message: 'Verification email sent successfully. Please check your inbox.'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Update user data
    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (avatar) updateData.avatar = avatar;

    await user.update(updateData);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Current password and new password are required' 
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Verify current password
    const isValidPassword = await user.verifyPassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        error: 'Current password is incorrect' 
      });
    }

    // Change password
    await user.changePassword(newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get user statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const statistics = await user.getStatistics();

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Verify token (for frontend to check if token is valid)
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      valid: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Logout (client-side token removal, but we can log it)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;