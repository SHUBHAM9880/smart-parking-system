const express = require('express');
const router = express.Router();
const otpService = require('../services/otpService');
const { body, validationResult } = require('express-validator');

// Send OTP for registration
router.post('/send-registration-otp', [
  body('email').isEmail().normalizeEmail(),
  body('name').trim().isLength({ min: 2 }),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, name, phone } = req.body;

    const result = await otpService.sendRegistrationOTP(email, {
      name,
      email,
      phone
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'OTP sent successfully',
        token: result.token,
        expiresIn: result.expiresIn,
        testMode: result.testMode,
        otp: result.testMode ? result.otp : undefined // Only include OTP in test mode
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Send registration OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP'
    });
  }
});

// Send OTP for login
router.post('/send-login-otp', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email } = req.body;

    // Check if user exists (you might want to add this check)
    // For now, we'll send OTP regardless

    const result = await otpService.sendLoginOTP(email, {
      email
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'OTP sent successfully',
        token: result.token,
        expiresIn: result.expiresIn,
        testMode: result.testMode,
        otp: result.testMode ? result.otp : undefined // Only include OTP in test mode
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Send login OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP'
    });
  }
});

// Verify OTP
router.post('/verify-otp', [
  body('token').notEmpty(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { token, otp } = req.body;

    const result = await otpService.verifyOTP(token, otp);

    if (result.success) {
      res.json({
        success: true,
        message: 'OTP verified successfully',
        email: result.email,
        type: result.type,
        userData: result.userData
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'OTP verification failed'
    });
  }
});

// Resend OTP
router.post('/resend-otp', [
  body('token').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { token } = req.body;

    const result = await otpService.resendOTP(token);

    if (result.success) {
      res.json({
        success: true,
        message: 'New OTP sent successfully',
        token: result.token,
        expiresIn: result.expiresIn,
        testMode: result.testMode,
        otp: result.testMode ? result.otp : undefined // Only include OTP in test mode
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend OTP'
    });
  }
});

// Get OTP service statistics (for admin)
router.get('/stats', async (req, res) => {
  try {
    const stats = otpService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('OTP stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats'
    });
  }
});

module.exports = router;