const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');

// Get email service status
router.get('/status', async (req, res) => {
  try {
    const status = emailService.getConfigurationStatus();
    const testResult = await emailService.testEmailConfiguration();
    
    res.json({
      success: true,
      email: {
        ...status,
        testResult: testResult.success,
        testMessage: testResult.message || testResult.error
      }
    });
  } catch (error) {
    console.error('Email status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email status',
      email: {
        configured: false,
        error: error.message,
        provider: 'unknown',
        user: 'Not configured',
        mode: 'error'
      }
    });
  }
});

// Test email configuration
router.post('/test', async (req, res) => {
  try {
    const result = await emailService.testEmailConfiguration();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Email configuration is working correctly',
        details: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: 'Email configuration test failed'
      });
    }
  } catch (error) {
    console.error('Email test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Email test failed'
    });
  }
});

// Send test email (for debugging)
router.post('/send-test', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, message'
      });
    }

    const result = await emailService.sendEmail({
      to,
      subject,
      text: message,
      html: `<p>${message}</p>`
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        details: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: 'Failed to send test email'
      });
    }
  } catch (error) {
    console.error('Send test email failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Send test email failed'
    });
  }
});

module.exports = router;