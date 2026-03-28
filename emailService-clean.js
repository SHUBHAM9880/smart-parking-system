const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.configurationError = null;
    this.initializeTransporter();
  }

  // Initialize email transporter
  initializeTransporter() {
    try {
      // Check if email is configured
      const emailUser = process.env.EMAIL_USER;
      const emailPassword = process.env.EMAIL_PASSWORD;
      
      if (!emailUser || !emailPassword || 
          emailUser === 'your-email@gmail.com' || 
          emailPassword === 'your-app-password' ||
          process.env.EMAIL_SERVICE === 'test') {
        this.isConfigured = false;
        this.configurationError = 'Email service running in test mode - verification URLs will be logged';
        console.log('⚠️  Email service: Running in test mode - no real emails sent');
        return;
      }

      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
          user: emailUser,
          pass: emailPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      this.isConfigured = true;
      console.log('✅ Email service initialized with real credentials');
    } catch (error) {
      this.isConfigured = false;
      this.configurationError = error.message;
      console.error('❌ Email service initialization failed:', error.message);
    }
  }

  // Send admin notification for new user registration
  async sendAdminNewUserNotification(adminEmail, userData) {
    try {
      if (!this.isConfigured) {
        console.log('📧 ADMIN NOTIFICATION (Test Mode):');
        console.log(`   To: ${adminEmail}`);
        console.log(`   Subject: New User Registration - ${userData.name}`);
        console.log(`   User: ${userData.name} (${userData.email})`);
        console.log('   ✅ Admin would be notified of new user registration');
        
        return { 
          success: true, 
          testMode: true,
          recipient: adminEmail,
          type: 'admin_new_user',
          message: 'Admin notification logged (test mode)'
        };
      }
      
      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: `🆕 New User Registration - ${userData.name}`,
        html: `<h2>New User Registration</h2><p>User: ${userData.name} (${userData.email})</p>`,
        text: `New User Registration: ${userData.name} (${userData.email})`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Admin new user notification sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Failed to send admin notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send admin notification for user login
  async sendAdminUserLoginNotification(adminEmail, userData, loginInfo) {
    try {
      if (!this.isConfigured) {
        console.log('📧 ADMIN LOGIN NOTIFICATION (Test Mode):');
        console.log(`   To: ${adminEmail}`);
        console.log(`   Subject: User Login Alert - ${userData.name}`);
        console.log(`   User: ${userData.name} (${userData.email})`);
        console.log(`   Login Time: ${loginInfo.loginTime}`);
        console.log('   ✅ Admin would be notified of user login');
        
        return { 
          success: true, 
          testMode: true,
          recipient: adminEmail,
          type: 'admin_user_login',
          message: 'Admin login notification logged (test mode)'
        };
      }
      
      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: `🔐 User Login Alert - ${userData.name}`,
        html: `<h2>User Login Alert</h2><p>User: ${userData.name} (${userData.email})</p><p>Login Time: ${loginInfo.loginTime}</p>`,
        text: `User Login Alert: ${userData.name} (${userData.email}) at ${loginInfo.loginTime}`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Admin login notification sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Failed to send admin login notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send email verification email
  async sendEmailVerification(userEmail, userData, verificationToken) {
    try {
      const verificationUrl = `http://localhost:3000/verify-email/${verificationToken}`;
      
      if (!this.isConfigured) {
        console.log('📧 EMAIL VERIFICATION (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   User: ${userData.name}`);
        console.log(`   Verification URL: ${verificationUrl}`);
        console.log('   ✅ Click the URL above to verify email in test mode');
        
        return { 
          success: true, 
          testMode: true,
          recipient: userEmail,
          type: 'email_verification',
          verificationUrl: verificationUrl,
          message: 'Email verification URL logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: '📧 Verify Your Email - Ezy-Parking',
        html: `<h2>Verify Your Email</h2><p>Hello ${userData.name},</p><p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
        text: `Hello ${userData.name}, verify your email: ${verificationUrl}`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email verification sent:', result.messageId);
      return { success: true, messageId: result.messageId, verificationUrl };
    } catch (error) {
      console.error('❌ Failed to send verification email:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Test email configuration
  async testEmailConfiguration() {
    try {
      if (!this.isConfigured) {
        return { 
          success: false, 
          error: this.configurationError || 'Email service not configured',
          configured: false
        };
      }

      const result = await this.transporter.verify();
      console.log('✅ Email configuration is valid');
      return { success: true, message: 'Email configuration is valid', configured: true };
    } catch (error) {
      console.error('❌ Email configuration test failed:', error.message);
      return { success: false, error: error.message, configured: false };
    }
  }
}

// Export singleton instance
module.exports = new EmailService();