const crypto = require('crypto');
const emailService = require('./emailService');

class PaymentOtpService {
  constructor() {
    // Store OTPs in memory (in production, use Redis or database)
    this.otpStore = new Map();
    this.otpExpiry = 10 * 60 * 1000; // 10 minutes
  }

  // Generate OTP for payment verification
  generatePaymentOTP(userId, paymentData) {
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpKey = `payment_${userId}_${Date.now()}`;
    
    const otpData = {
      otp: otp,
      userId: userId,
      paymentData: paymentData,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.otpExpiry,
      verified: false
    };
    
    this.otpStore.set(otpKey, otpData);
    
    // Clean up expired OTPs
    this.cleanupExpiredOTPs();
    
    return { otpKey, otp };
  }

  // Verify payment OTP
  verifyPaymentOTP(otpKey, providedOtp) {
    const otpData = this.otpStore.get(otpKey);
    
    if (!otpData) {
      return { success: false, error: 'Invalid or expired OTP' };
    }
    
    if (Date.now() > otpData.expiresAt) {
      this.otpStore.delete(otpKey);
      return { success: false, error: 'OTP has expired' };
    }
    
    if (otpData.otp !== providedOtp) {
      return { success: false, error: 'Invalid OTP' };
    }
    
    // Mark as verified
    otpData.verified = true;
    this.otpStore.set(otpKey, otpData);
    
    return { 
      success: true, 
      paymentData: otpData.paymentData,
      userId: otpData.userId
    };
  }

  // Get payment data by OTP key
  getPaymentData(otpKey) {
    const otpData = this.otpStore.get(otpKey);
    return otpData ? otpData.paymentData : null;
  }

  // Clean up expired OTPs
  cleanupExpiredOTPs() {
    const now = Date.now();
    for (const [key, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        this.otpStore.delete(key);
      }
    }
  }

  // Send payment OTP email
  async sendPaymentOTP(userEmail, userName, otp, paymentData) {
    try {
      const result = await emailService.sendPaymentOTPEmail(userEmail, userName, otp, paymentData);
      return result;
    } catch (error) {
      console.error('Failed to send payment OTP email:', error);
      return { success: false, error: error.message };
    }
  }

  // Remove OTP after successful verification
  removeOTP(otpKey) {
    this.otpStore.delete(otpKey);
  }
}

module.exports = new PaymentOtpService();