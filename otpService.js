const crypto = require('crypto');
const emailService = require('./emailService');

class OTPService {
  constructor() {
    // Store OTPs in memory (in production, use Redis or database)
    this.otpStore = new Map();
    this.otpExpiry = 10 * 60 * 1000; // 10 minutes
  }

  // Generate 6-digit OTP
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate OTP token for tracking
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Send OTP for registration
  async sendRegistrationOTP(email, userData) {
    try {
      const otp = this.generateOTP();
      const token = this.generateToken();
      const expiresAt = Date.now() + this.otpExpiry;

      // Store OTP
      this.otpStore.set(token, {
        otp,
        email,
        type: 'registration',
        userData,
        expiresAt,
        attempts: 0
      });

      // Send OTP email
      const result = await this.sendOTPEmail(email, otp, 'registration', userData.name);
      
      return {
        success: true,
        token,
        message: 'OTP sent successfully',
        expiresIn: this.otpExpiry / 1000 / 60, // minutes
        ...result
      };
    } catch (error) {
      console.error('Failed to send registration OTP:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send OTP for login
  async sendLoginOTP(email, userData) {
    try {
      const otp = this.generateOTP();
      const token = this.generateToken();
      const expiresAt = Date.now() + this.otpExpiry;

      // Store OTP
      this.otpStore.set(token, {
        otp,
        email,
        type: 'login',
        userData,
        expiresAt,
        attempts: 0
      });

      // Send OTP email
      const result = await this.sendOTPEmail(email, otp, 'login', userData.name);
      
      return {
        success: true,
        token,
        message: 'OTP sent successfully',
        expiresIn: this.otpExpiry / 1000 / 60, // minutes
        ...result
      };
    } catch (error) {
      console.error('Failed to send login OTP:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify OTP
  async verifyOTP(token, otp) {
    try {
      const otpData = this.otpStore.get(token);

      if (!otpData) {
        return {
          success: false,
          error: 'Invalid or expired OTP token'
        };
      }

      // Check expiry
      if (Date.now() > otpData.expiresAt) {
        this.otpStore.delete(token);
        return {
          success: false,
          error: 'OTP has expired'
        };
      }

      // Check attempts
      if (otpData.attempts >= 3) {
        this.otpStore.delete(token);
        return {
          success: false,
          error: 'Too many failed attempts. Please request a new OTP.'
        };
      }

      // Verify OTP
      if (otpData.otp !== otp) {
        otpData.attempts++;
        return {
          success: false,
          error: `Invalid OTP. ${3 - otpData.attempts} attempts remaining.`
        };
      }

      // OTP verified successfully
      const result = {
        success: true,
        email: otpData.email,
        type: otpData.type,
        userData: otpData.userData
      };

      // Clean up
      this.otpStore.delete(token);

      return result;
    } catch (error) {
      console.error('OTP verification error:', error);
      return {
        success: false,
        error: 'OTP verification failed'
      };
    }
  }

  // Resend OTP
  async resendOTP(token) {
    try {
      const otpData = this.otpStore.get(token);

      if (!otpData) {
        return {
          success: false,
          error: 'Invalid token. Please start the process again.'
        };
      }

      // Generate new OTP
      const newOTP = this.generateOTP();
      const newToken = this.generateToken();
      const expiresAt = Date.now() + this.otpExpiry;

      // Update stored data
      this.otpStore.delete(token);
      this.otpStore.set(newToken, {
        ...otpData,
        otp: newOTP,
        expiresAt,
        attempts: 0
      });

      // Send new OTP
      const result = await this.sendOTPEmail(
        otpData.email, 
        newOTP, 
        otpData.type, 
        otpData.userData.name
      );

      return {
        success: true,
        token: newToken,
        message: 'New OTP sent successfully',
        expiresIn: this.otpExpiry / 1000 / 60,
        ...result
      };
    } catch (error) {
      console.error('Failed to resend OTP:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send OTP email
  async sendOTPEmail(email, otp, type, userName) {
    // Use the email service to send OTP
    return await emailService.sendOTPEmail(email, otp, type, userName);
  }

  // Clean up expired OTPs (run periodically)
  cleanupExpiredOTPs() {
    const now = Date.now();
    for (const [token, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        this.otpStore.delete(token);
      }
    }
  }

  // Get OTP statistics
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const [token, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      active,
      expired,
      total: this.otpStore.size
    };
  }
}

// Export singleton instance
module.exports = new OTPService();