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

  // Get configuration status
  getConfigurationStatus() {
    return {
      configured: this.isConfigured,
      error: this.configurationError || (this.isConfigured ? null : 'Email service not configured'),
      provider: process.env.EMAIL_SERVICE || 'gmail',
      user: this.isConfigured ? process.env.EMAIL_USER : 'Not configured',
      mode: this.isConfigured ? 'production' : 'test'
    };
  }

  // Send admin notification for successful booking and payment
  async sendAdminBookingPaymentNotification(adminEmail, userData, bookingData, paymentData) {
    try {
      const subject = `🎉 New Booking & Payment Completed - ${bookingData.booking_ref}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #17a2b8; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .success-badge { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
              .revenue-badge { background: #d1ecf1; color: #0c5460; padding: 10px; border-radius: 5px; text-align: center; margin: 10px 0; }
              .user-info { background: #e2e3e5; padding: 10px; border-radius: 5px; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🎉 New Booking & Payment!</h1>
                  <p>A customer has successfully completed booking and payment</p>
              </div>
              
              <div class="content">
                  <p>Dear Admin,</p>
                  
                  <div class="success-badge">
                      <strong>✅ BOOKING CONFIRMED ✅ PAYMENT RECEIVED</strong>
                  </div>
                  
                  <div class="revenue-badge">
                      <strong>💰 Revenue Generated: ₹${paymentData.amount}</strong>
                  </div>
                  
                  <div class="info-section">
                      <h3>👤 Customer Details</h3>
                      <div class="user-info">
                          <p><strong>Name:</strong> ${userData.name}</p>
                          <p><strong>Email:</strong> ${userData.email}</p>
                          <p><strong>Phone:</strong> ${userData.phone || bookingData.mobile_number}</p>
                          <p><strong>Registration Date:</strong> ${userData.created_at || 'N/A'}</p>
                      </div>
                  </div>
                  
                  <div class="info-section">
                      <h3>📋 Booking Details</h3>
                      <p><strong>Booking Reference:</strong> ${bookingData.booking_ref}</p>
                      <p><strong>Parking Spot:</strong> ${bookingData.spot_name}</p>
                      <p><strong>Address:</strong> ${bookingData.spot_address}</p>
                      <p><strong>Vehicle:</strong> ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})</p>
                      <p><strong>Duration:</strong> ${bookingData.duration} hour(s)</p>
                      <p><strong>Start Time:</strong> ${bookingData.start_time}</p>
                      <p><strong>End Time:</strong> ${bookingData.end_time}</p>
                      <p><strong>Booking Date:</strong> ${bookingData.booking_date}</p>
                  </div>
                  
                  <div class="info-section">
                      <h3>💳 Payment Details</h3>
                      <p><strong>Amount Received:</strong> ₹${paymentData.amount}</p>
                      <p><strong>Payment Method:</strong> ${paymentData.payment_method}</p>
                      <p><strong>Transaction ID:</strong> ${paymentData.transaction_id}</p>
                      ${paymentData.user_payment_id ? `<p><strong>Customer Payment ID:</strong> ${paymentData.user_payment_id}</p>` : ''}
                      <p><strong>Payment Date:</strong> ${paymentData.payment_date}</p>
                      <p><strong>Payment Status:</strong> <span style="color: #28a745; font-weight: bold;">CONFIRMED</span></p>
                  </div>
                  
                  <div class="info-section">
                      <h3>📊 Business Summary</h3>
                      <p><strong>Revenue Generated:</strong> ₹${paymentData.amount}</p>
                      <p><strong>Parking Spot Utilization:</strong> ${bookingData.duration} hour(s)</p>
                      <p><strong>Customer Satisfaction:</strong> Successful completion</p>
                      <p><strong>Payment Processing:</strong> Smooth transaction</p>
                  </div>
                  
                  <div class="success-badge">
                      <strong>🚗 Parking spot successfully reserved and paid for! 🚗</strong>
                  </div>
                  
                  <p>This booking has been automatically processed and the customer has received their confirmation email.</p>
                  
                  <p>You can view more details in the admin dashboard.</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
ADMIN NOTIFICATION - NEW BOOKING & PAYMENT COMPLETED

Dear Admin,

🎉 A customer has successfully completed booking and payment!

CUSTOMER DETAILS:
- Name: ${userData.name}
- Email: ${userData.email}
- Phone: ${userData.phone || bookingData.mobile_number}

BOOKING DETAILS:
- Booking Reference: ${bookingData.booking_ref}
- Parking Spot: ${bookingData.spot_name}
- Address: ${bookingData.spot_address}
- Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})
- Duration: ${bookingData.duration} hour(s)
- Start Time: ${bookingData.start_time}
- End Time: ${bookingData.end_time}
- Booking Date: ${bookingData.booking_date}

PAYMENT DETAILS:
- Amount Received: ₹${paymentData.amount}
- Payment Method: ${paymentData.payment_method}
- Transaction ID: ${paymentData.transaction_id}
${paymentData.user_payment_id ? `- Customer Payment ID: ${paymentData.user_payment_id}` : ''}
- Payment Date: ${paymentData.payment_date}
- Payment Status: CONFIRMED

BUSINESS SUMMARY:
- Revenue Generated: ₹${paymentData.amount}
- Parking Spot Utilization: ${bookingData.duration} hour(s)
- Customer Satisfaction: Successful completion

🚗 Parking spot successfully reserved and paid for!

This booking has been automatically processed and the customer has received their confirmation email.

You can view more details in the admin dashboard.
      `;

      if (!this.isConfigured) {
        console.log('📧 ADMIN BOOKING & PAYMENT NOTIFICATION (Test Mode):');
        console.log(`   To: ${adminEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Customer: ${userData.name} (${userData.email})`);
        console.log(`   Booking: ${bookingData.booking_ref}`);
        console.log(`   Spot: ${bookingData.spot_name}`);
        console.log(`   Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})`);
        console.log(`   Duration: ${bookingData.duration} hour(s)`);
        console.log(`   Revenue: ₹${paymentData.amount}`);
        console.log(`   Payment Method: ${paymentData.payment_method}`);
        console.log(`   Transaction: ${paymentData.transaction_id}`);
        console.log('   ✅ Admin would receive booking & payment success notification');
        
        return { 
          success: true, 
          testMode: true,
          recipient: adminEmail,
          type: 'admin_booking_payment_notification',
          message: 'Admin booking & payment notification logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Admin booking & payment notification sent to ${adminEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send admin booking & payment notification to ${adminEmail}:`, error.message);
      return { success: false, error: error.message };
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

  // Send generic email
  async sendEmail(options) {
    try {
      if (!this.isConfigured) {
        console.log('📧 EMAIL (Test Mode):');
        console.log(`   To: ${options.to}`);
        console.log(`   Subject: ${options.subject}`);
        console.log(`   Content: ${options.text || 'HTML content provided'}`);
        console.log('   ✅ Email would be sent in production mode');
        
        return { 
          success: true, 
          testMode: true,
          recipient: options.to,
          type: 'generic_email',
          message: 'Email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Failed to send email:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send OTP email
  async sendOTPEmail(userEmail, otp, type, userName) {
    try {
      const subject = type === 'registration' ? 
        '🔐 Verify Your Registration - Ezy-Parking' : 
        '🔐 Login Verification - Ezy-Parking';

      const htmlContent = this.generateOTPEmailTemplate(userName, otp, type);
      const textContent = `Hello ${userName},\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nEzy-Parking Team`;

      if (!this.isConfigured) {
        console.log('📧 OTP EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   User: ${userName}`);
        console.log(`   🔐 OTP: ${otp}`);
        console.log(`   Type: ${type}`);
        console.log('   ✅ Use this OTP to verify in test mode');
        
        return {
          success: true,
          testMode: true,
          otp: otp,
          message: 'OTP logged to console (test mode)',
          displayMessage: `📧 Test Mode: Your OTP is ${otp}. In production, this would be sent to your email.`
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ OTP email sent successfully:', result.messageId);
      return { 
        success: true, 
        messageId: result.messageId,
        message: 'OTP sent to your email address'
      };
    } catch (error) {
      console.error('❌ Failed to send OTP email:', error.message);
      // Fall back to test mode so the app still works
      console.log('📧 OTP EMAIL (Fallback Test Mode):');
      console.log(`   To: ${userEmail}`);
      console.log(`   🔐 OTP: ${otp}`);
      console.log(`   Type: ${type}`);
      return {
        success: true,
        testMode: true,
        otp: otp,
        message: 'OTP logged to console (email unavailable)',
        displayMessage: `📧 Email unavailable: Your OTP is ${otp}. Check server console.`
      };
    }
  }

  // Generate OTP email template
  generateOTPEmailTemplate(userName, otp, type) {
    const title = type === 'registration' ? 'Welcome to Ezy-Parking!' : 'Login Verification';
    const message = type === 'registration' ? 
      'Thank you for registering with Ezy-Parking. Please verify your email address.' :
      'Please verify your login attempt.';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; padding: 30px; text-align: center; border-radius: 10px; margin: 20px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 20px 0; padding: 20px; background: #f0f4ff; border-radius: 8px; border: 2px dashed #667eea; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 ${title}</h1>
                <p>Hello ${userName}!</p>
            </div>
            
            <div class="content">
                <p>${message}</p>
                
                <div class="otp-box">
                    <h2>Your Verification Code</h2>
                    <div class="otp-code">${otp}</div>
                    <p>Enter this code to continue</p>
                </div>
                
                <div class="warning">
                    <h3>⚠️ Important:</h3>
                    <ul>
                        <li>This code will expire in <strong>10 minutes</strong></li>
                        <li>Don't share this code with anyone</li>
                        <li>If you didn't request this, please ignore this email</li>
                    </ul>
                </div>
                
                <p>If you have any questions, contact our support team.</p>
            </div>
            
            <div class="footer">
                <p>Thank you for choosing Ezy-Parking!</p>
                <p>For support, contact us at support@ezyparking.com</p>
                <p>&copy; 2024 Ezy-Parking. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Send location permission request email to admin
  async sendLocationPermissionRequestEmail(adminEmail, userData, locationData, requestId) {
    try {
      const subject = `🚨 Location Permission Request - ${userData.name}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .user-info { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .location-info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .btn { display: inline-block; padding: 12px 25px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
              .btn-approve { background: #28a745; }
              .btn-deny { background: #dc3545; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🚨 Location Permission Request</h1>
                  <p>Immediate Admin Action Required</p>
              </div>
              
              <div class="content">
                  <p>Dear Admin,</p>
                  
                  <p>A user has just requested location permission and is waiting for approval:</p>
                  
                  <div class="user-info">
                      <h3>👤 User Details</h3>
                      <p><strong>Name:</strong> ${userData.name}</p>
                      <p><strong>Email:</strong> ${userData.email}</p>
                      <p><strong>Phone:</strong> ${userData.phone || 'Not provided'}</p>
                      <p><strong>Request Time:</strong> ${new Date().toLocaleString()}</p>
                      <p><strong>Reason:</strong> ${locationData.reason}</p>
                  </div>
                  
                  ${locationData.latitude && locationData.longitude ? `
                  <div class="location-info">
                      <h3>📍 Current Location</h3>
                      <p><strong>Coordinates:</strong> ${parseFloat(locationData.latitude).toFixed(6)}, ${parseFloat(locationData.longitude).toFixed(6)}</p>
                      <p><strong>Google Maps:</strong> <a href="https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}" target="_blank">View on Map</a></p>
                  </div>
                  ` : ''}
                  
                  <div class="user-info">
                      <h3>🖥️ Device Information</h3>
                      <p><strong>Browser:</strong> ${locationData.deviceInfo?.browser || 'Unknown'}</p>
                      <p><strong>Platform:</strong> ${locationData.deviceInfo?.platform || 'Unknown'}</p>
                      <p><strong>IP Address:</strong> ${locationData.deviceInfo?.ip_address || 'Unknown'}</p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin" class="btn btn-approve">
                          ✅ Review & Approve
                      </a>
                      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin" class="btn btn-deny">
                          ❌ Review & Deny
                      </a>
                  </div>
                  
                  <p><strong>⚠️ Action Required:</strong> Please review this request promptly as the user is waiting for location access to use booking features.</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
LOCATION PERMISSION REQUEST - EZY-PARKING ADMIN ALERT

User: ${userData.name} (${userData.email})
Phone: ${userData.phone || 'Not provided'}
Request Time: ${new Date().toLocaleString()}
Location: ${locationData.latitude ? `${parseFloat(locationData.latitude).toFixed(6)}, ${parseFloat(locationData.longitude).toFixed(6)}` : 'Not available'}
Google Maps: ${locationData.latitude ? `https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}` : 'Not available'}
Reason: ${locationData.reason}

Please review this request in the admin panel: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin

Action required: User is waiting for location permission approval.
      `;

      if (!this.isConfigured) {
        console.log('📧 LOCATION PERMISSION REQUEST EMAIL (Test Mode):');
        console.log(`   To: ${adminEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   User: ${userData.name} (${userData.email})`);
        console.log(`   Phone: ${userData.phone || 'Not provided'}`);
        console.log(`   Location: ${locationData.latitude ? `${parseFloat(locationData.latitude).toFixed(6)}, ${parseFloat(locationData.longitude).toFixed(6)}` : 'Not available'}`);
        console.log(`   Google Maps: ${locationData.latitude ? `https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}` : 'Not available'}`);
        console.log(`   Reason: ${locationData.reason}`);
        console.log('   ✅ Admin would receive this location permission request email');
        
        return { 
          success: true, 
          testMode: true,
          recipient: adminEmail,
          type: 'location_permission_request',
          message: 'Location permission request email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Location permission request email sent to ${adminEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send location permission request email to ${adminEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Send booking confirmation email
  async sendBookingConfirmation(userEmail, bookingData) {
    try {
      const subject = `🎉 Booking Confirmed - ${bookingData.booking_ref}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .booking-info { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .success-badge { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; text-align: center; margin: 15px 0; }
              .important-info { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🎉 Booking Confirmed!</h1>
                  <p>Your parking spot has been successfully reserved</p>
              </div>
              
              <div class="content">
                  <p>Dear ${bookingData.user_name},</p>
                  
                  <div class="success-badge">
                      <strong>✅ Booking Successful</strong>
                  </div>
                  
                  <div class="booking-info">
                      <h3>📋 Booking Details</h3>
                      <p><strong>Booking Reference:</strong> ${bookingData.booking_ref}</p>
                      <p><strong>Parking Spot:</strong> ${bookingData.spot_name}</p>
                      <p><strong>Address:</strong> ${bookingData.spot_address}</p>
                      <p><strong>Vehicle:</strong> ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})</p>
                      <p><strong>Duration:</strong> ${bookingData.duration} hour(s)</p>
                      <p><strong>Start Time:</strong> ${bookingData.start_time}</p>
                      <p><strong>End Time:</strong> ${bookingData.end_time}</p>
                      <p><strong>Mobile Number:</strong> ${bookingData.mobile_number}</p>
                      <p><strong>Total Amount:</strong> ₹${bookingData.total_amount}</p>
                      <p><strong>Booking Date:</strong> ${bookingData.booking_date}</p>
                  </div>
                  
                  <div class="important-info">
                      <h3>⚠️ Important Instructions</h3>
                      <ul>
                          <li>Please arrive at the parking spot on time</li>
                          <li>Show this confirmation email to the parking attendant</li>
                          <li>Keep your vehicle number visible</li>
                          <li>Contact support if you need to modify your booking</li>
                      </ul>
                  </div>
                  
                  <p>Thank you for choosing Ezy-Parking! We hope you have a great parking experience.</p>
                  
                  <p>If you have any questions, please contact our support team.</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
BOOKING CONFIRMATION - EZY-PARKING

Dear ${bookingData.user_name},

Your parking spot has been successfully reserved!

Booking Details:
- Booking Reference: ${bookingData.booking_ref}
- Parking Spot: ${bookingData.spot_name}
- Address: ${bookingData.spot_address}
- Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})
- Duration: ${bookingData.duration} hour(s)
- Start Time: ${bookingData.start_time}
- End Time: ${bookingData.end_time}
- Mobile Number: ${bookingData.mobile_number}
- Total Amount: ₹${bookingData.total_amount}
- Booking Date: ${bookingData.booking_date}

Important Instructions:
- Please arrive at the parking spot on time
- Show this confirmation email to the parking attendant
- Keep your vehicle number visible
- Contact support if you need to modify your booking

Thank you for choosing Ezy-Parking!
      `;

      if (!this.isConfigured) {
        console.log('📧 BOOKING CONFIRMATION EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Booking: ${bookingData.booking_ref}`);
        console.log(`   Spot: ${bookingData.spot_name}`);
        console.log(`   Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})`);
        console.log(`   Duration: ${bookingData.duration} hour(s)`);
        console.log(`   Amount: ₹${bookingData.total_amount}`);
        console.log('   ✅ User would receive booking confirmation email');
        
        return { 
          success: true, 
          testMode: true,
          recipient: userEmail,
          type: 'booking_confirmation',
          message: 'Booking confirmation email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Booking confirmation email sent to ${userEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send booking confirmation email to ${userEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Send combined booking and payment success email
  async sendBookingAndPaymentSuccess(userEmail, bookingData, paymentData) {
    try {
      const subject = `🎉 Booking & Payment Confirmed - ${bookingData.booking_ref}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .success-badge { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; font-size: 18px; }
              .important-info { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .payment-badge { background: #d1ecf1; color: #0c5460; padding: 10px; border-radius: 5px; text-align: center; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🎉 Complete Success!</h1>
                  <p>Your booking and payment have been confirmed</p>
              </div>
              
              <div class="content">
                  <p>Dear ${bookingData.user_name},</p>
                  
                  <div class="success-badge">
                      <strong>✅ BOOKING CONFIRMED ✅ PAYMENT SUCCESSFUL</strong>
                  </div>
                  
                  <div class="info-section">
                      <h3>📋 Booking Details</h3>
                      <p><strong>Booking Reference:</strong> ${bookingData.booking_ref}</p>
                      <p><strong>Parking Spot:</strong> ${bookingData.spot_name}</p>
                      <p><strong>Address:</strong> ${bookingData.spot_address}</p>
                      <p><strong>Vehicle:</strong> ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})</p>
                      <p><strong>Duration:</strong> ${bookingData.duration} hour(s)</p>
                      <p><strong>Start Time:</strong> ${bookingData.start_time}</p>
                      <p><strong>End Time:</strong> ${bookingData.end_time}</p>
                      <p><strong>Mobile Number:</strong> ${bookingData.mobile_number}</p>
                  </div>
                  
                  <div class="info-section">
                      <h3>💳 Payment Details</h3>
                      <div class="payment-badge">
                          <strong>Payment Status: CONFIRMED</strong>
                      </div>
                      <p><strong>Amount Paid:</strong> ₹${paymentData.amount}</p>
                      <p><strong>Payment Method:</strong> ${paymentData.payment_method}</p>
                      <p><strong>Transaction ID:</strong> ${paymentData.transaction_id}</p>
                      ${paymentData.user_payment_id ? `<p><strong>Your Payment ID:</strong> ${paymentData.user_payment_id}</p>` : ''}
                      <p><strong>Payment Date:</strong> ${paymentData.payment_date}</p>
                  </div>
                  
                  <div class="important-info">
                      <h3>⚠️ Important Instructions</h3>
                      <ul>
                          <li><strong>Show this email</strong> to the parking attendant</li>
                          <li><strong>Arrive on time</strong> at your reserved spot</li>
                          <li><strong>Keep vehicle number visible</strong> for identification</li>
                          <li><strong>Save this email</strong> for your records</li>
                          <li><strong>Contact support</strong> if you need assistance</li>
                      </ul>
                  </div>
                  
                  <div class="success-badge">
                      <strong>🚗 Your parking spot is ready! 🚗</strong>
                  </div>
                  
                  <p>Thank you for choosing Ezy-Parking! We hope you have a great parking experience.</p>
                  
                  <p>If you have any questions or need to modify your booking, please contact our support team.</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
BOOKING & PAYMENT CONFIRMATION - EZY-PARKING

Dear ${bookingData.user_name},

🎉 COMPLETE SUCCESS! 🎉
Your booking and payment have been confirmed!

BOOKING DETAILS:
- Booking Reference: ${bookingData.booking_ref}
- Parking Spot: ${bookingData.spot_name}
- Address: ${bookingData.spot_address}
- Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})
- Duration: ${bookingData.duration} hour(s)
- Start Time: ${bookingData.start_time}
- End Time: ${bookingData.end_time}
- Mobile Number: ${bookingData.mobile_number}

PAYMENT DETAILS:
- Amount Paid: ₹${paymentData.amount}
- Payment Method: ${paymentData.payment_method}
- Transaction ID: ${paymentData.transaction_id}
${paymentData.user_payment_id ? `- Your Payment ID: ${paymentData.user_payment_id}` : ''}
- Payment Date: ${paymentData.payment_date}

IMPORTANT INSTRUCTIONS:
- Show this email to the parking attendant
- Arrive on time at your reserved spot
- Keep vehicle number visible for identification
- Save this email for your records
- Contact support if you need assistance

🚗 Your parking spot is ready! 🚗

Thank you for choosing Ezy-Parking!
      `;

      if (!this.isConfigured) {
        console.log('📧 BOOKING & PAYMENT SUCCESS EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Booking: ${bookingData.booking_ref}`);
        console.log(`   Spot: ${bookingData.spot_name}`);
        console.log(`   Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type})`);
        console.log(`   Duration: ${bookingData.duration} hour(s)`);
        console.log(`   Amount: ₹${paymentData.amount}`);
        console.log(`   Payment Method: ${paymentData.payment_method}`);
        console.log(`   Transaction: ${paymentData.transaction_id}`);
        console.log('   ✅ User would receive complete booking & payment success email');
        
        return { 
          success: true, 
          testMode: true,
          recipient: userEmail,
          type: 'booking_payment_success',
          message: 'Complete booking & payment success email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Booking & payment success email sent to ${userEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send booking & payment success email to ${userEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Send payment OTP email
  async sendPaymentOTPEmail(userEmail, userName, otp, paymentData) {
    try {
      const subject = `🔐 Payment Verification - Ezy-Parking`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
              .otp-box { background: white; padding: 30px; text-align: center; border-radius: 10px; margin: 20px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
              .otp-code { font-size: 36px; font-weight: bold; color: #28a745; letter-spacing: 8px; margin: 20px 0; padding: 20px; background: #f0fff4; border-radius: 8px; border: 2px dashed #28a745; }
              .payment-info { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #28a745; }
              .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🔐 Payment Verification</h1>
                  <p>Hello ${userName}!</p>
                  <p>Verify your payment to complete the booking</p>
              </div>
              
              <div class="content">
                  <p>You are about to make a payment for your parking booking. Please verify this transaction with the OTP below.</p>
                  
                  <div class="payment-info">
                      <h3>💳 Payment Details</h3>
                      <p><strong>Amount:</strong> ₹${paymentData.amount}</p>
                      <p><strong>Payment Method:</strong> ${paymentData.payment_method}</p>
                      <p><strong>Booking Reference:</strong> ${paymentData.booking_ref || 'Will be generated'}</p>
                  </div>
                  
                  <div class="otp-box">
                      <h2>Your Payment Verification Code</h2>
                      <div class="otp-code">${otp}</div>
                      <p>Enter this code to authorize the payment</p>
                  </div>
                  
                  <div class="warning">
                      <h3>⚠️ Important Security Notice:</h3>
                      <ul>
                          <li>This OTP will expire in <strong>10 minutes</strong></li>
                          <li>Only enter this OTP if you initiated this payment</li>
                          <li>Never share this OTP with anyone</li>
                          <li>If you didn't request this payment, ignore this email</li>
                      </ul>
                  </div>
                  
                  <p>After entering the OTP, your payment will be processed and booking confirmed.</p>
              </div>
              
              <div class="footer">
                  <p>Thank you for choosing Ezy-Parking!</p>
                  <p>For support, contact us at support@ezyparking.com</p>
                  <p>&copy; 2024 Ezy-Parking. All rights reserved.</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
PAYMENT VERIFICATION - EZY-PARKING

Hello ${userName},

You are about to make a payment for your parking booking. Please verify this transaction with the OTP below.

PAYMENT DETAILS:
- Amount: ₹${paymentData.amount}
- Payment Method: ${paymentData.payment_method}
- Booking Reference: ${paymentData.booking_ref || 'Will be generated'}

YOUR PAYMENT VERIFICATION CODE: ${otp}

IMPORTANT:
- This OTP will expire in 10 minutes
- Only enter this OTP if you initiated this payment
- Never share this OTP with anyone
- If you didn't request this payment, ignore this email

After entering the OTP, your payment will be processed and booking confirmed.

Thank you for choosing Ezy-Parking!
      `;

      if (!this.isConfigured) {
        console.log('📧 PAYMENT OTP EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   User: ${userName}`);
        console.log(`   🔐 Payment OTP: ${otp}`);
        console.log(`   💰 Amount: ₹${paymentData.amount}`);
        console.log(`   💳 Method: ${paymentData.payment_method}`);
        console.log('   ✅ Use this OTP to verify payment in test mode');
        
        return {
          success: true,
          testMode: true,
          otp: otp,
          message: 'Payment OTP logged to console (test mode)',
          displayMessage: `📧 Test Mode: Your Payment OTP is ${otp}. In production, this would be sent to your email.`
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Payment OTP email sent successfully:', result.messageId);
      return { 
        success: true, 
        messageId: result.messageId,
        message: 'Payment OTP sent to your email address'
      };
    } catch (error) {
      console.error('❌ Failed to send payment OTP email:', error.message);
      // Fall back to test mode so the app still works
      console.log('📧 PAYMENT OTP EMAIL (Fallback Test Mode):');
      console.log(`   To: ${userEmail}`);
      console.log(`   🔐 Payment OTP: ${otp}`);
      console.log(`   💰 Amount: ₹${paymentData.amount}`);
      return {
        success: true,
        testMode: true,
        otp: otp,
        message: 'Payment OTP logged to console (email unavailable)',
        displayMessage: `📧 Email unavailable: Your Payment OTP is ${otp}. Check server console.`
      };
    }
  }

  // Send payment confirmation email
  async sendPaymentConfirmation(userEmail, paymentData) {
    try {
      const subject = `💳 Payment Confirmed - Booking ${paymentData.booking_ref}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .payment-info { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .success-badge { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; text-align: center; margin: 15px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>💳 Payment Confirmed!</h1>
                  <p>Your parking booking payment has been processed successfully</p>
              </div>
              
              <div class="content">
                  <p>Dear ${paymentData.user_name},</p>
                  
                  <div class="success-badge">
                      <strong>✅ Payment Successful</strong>
                  </div>
                  
                  <div class="payment-info">
                      <h3>Payment Details</h3>
                      <p><strong>Booking Reference:</strong> ${paymentData.booking_ref}</p>
                      <p><strong>Amount Paid:</strong> ₹${paymentData.amount}</p>
                      <p><strong>Payment Method:</strong> ${paymentData.payment_method}</p>
                      <p><strong>Transaction ID:</strong> ${paymentData.transaction_id}</p>
                      ${paymentData.user_payment_id ? `<p><strong>Your Payment ID:</strong> ${paymentData.user_payment_id}</p>` : ''}
                      <p><strong>Payment Date:</strong> ${paymentData.payment_date}</p>
                  </div>
                  
                  <p>Your parking spot is now confirmed! Please arrive at the designated time and show this confirmation.</p>
                  
                  <p>If you have any questions, please contact our support team.</p>
                  
                  <p>Thank you for choosing Ezy-Parking!</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
PAYMENT CONFIRMATION - EZY-PARKING

Dear ${paymentData.user_name},

Your payment has been processed successfully!

Payment Details:
- Booking Reference: ${paymentData.booking_ref}
- Amount Paid: ₹${paymentData.amount}
- Payment Method: ${paymentData.payment_method}
- Transaction ID: ${paymentData.transaction_id}
- Payment Date: ${paymentData.payment_date}

Your parking spot is now confirmed!

Thank you for choosing Ezy-Parking!
      `;

      if (!this.isConfigured) {
        console.log('📧 PAYMENT CONFIRMATION EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Booking: ${paymentData.booking_ref}`);
        console.log(`   Amount: ₹${paymentData.amount}`);
        console.log(`   Method: ${paymentData.payment_method}`);
        console.log(`   Transaction: ${paymentData.transaction_id}`);
        console.log('   ✅ User would receive payment confirmation email');
        
        return { 
          success: true, 
          testMode: true,
          recipient: userEmail,
          type: 'payment_confirmation',
          message: 'Payment confirmation email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Payment confirmation email sent to ${userEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send payment confirmation email to ${userEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Send location permission approval notification to user
  async sendLocationPermissionApprovalNotification(userEmail, userData, approvalData) {
    try {
      const subject = `✅ Location Permission Approved - Ezy-Parking`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .success-badge { background: #d4edda; color: #155724; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0; font-size: 18px; font-weight: bold; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .features-list { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .parking-spot-info { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107; }
              .cta-button { display: inline-block; padding: 15px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; text-align: center; }
              .admin-notes { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #6c757d; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🎉 Location Permission Approved!</h1>
                  <p>Welcome to full Ezy-Parking access</p>
              </div>
              
              <div class="content">
                  <p>Dear ${userData.name},</p>
                  
                  <div class="success-badge">
                      ✅ Your location permission request has been APPROVED!
                  </div>
                  
                  <div class="info-section">
                      <h3>🚀 What's Now Available</h3>
                      <p>Congratulations! You now have access to all location-based features in Ezy-Parking:</p>
                  </div>
                  
                  <div class="features-list">
                      <h3>📍 New Features Unlocked:</h3>
                      <ul>
                          <li><strong>🔍 Nearby Parking Discovery:</strong> Find parking spots near your current location</li>
                          <li><strong>📏 Distance Calculations:</strong> See exact distances to parking spots</li>
                          <li><strong>🗺️ Interactive Maps:</strong> View parking spots on interactive maps</li>
                          <li><strong>🚗 Smart Booking:</strong> Book the closest available parking spots</li>
                          <li><strong>📱 Real-time Navigation:</strong> Get directions to your booked parking spot</li>
                          <li><strong>⏰ Time-based Recommendations:</strong> Get parking suggestions based on your location and time</li>
                      </ul>
                  </div>
                  
                  ${approvalData.parking_spot_created ? `
                  <div class="parking-spot-info">
                      <h3>🅿️ Bonus: New Parking Spot Created!</h3>
                      <p><strong>Great news!</strong> We've created a new parking spot at your location:</p>
                      <p><strong>📍 Location:</strong> ${approvalData.place_name}</p>
                      <p><strong>🚗 Capacity:</strong> 55 total spots (20 cars, 30 bikes, 5 trucks)</p>
                      <p><strong>💰 Pricing:</strong> Cars ₹20/hr, Bikes ₹10/hr, Trucks ₹50/hr</p>
                      <p><strong>✨ Features:</strong> 24/7 Access, Security Camera, Well Lit</p>
                      <p>You can now book parking at this new location!</p>
                  </div>
                  ` : ''}
                  
                  ${approvalData.admin_notes ? `
                  <div class="admin-notes">
                      <h3>📝 Admin Notes</h3>
                      <p>${approvalData.admin_notes}</p>
                  </div>
                  ` : ''}
                  
                  <div class="info-section">
                      <h3>🎯 Next Steps</h3>
                      <ol>
                          <li><strong>Open the Ezy-Parking app</strong> on your device</li>
                          <li><strong>Allow location access</strong> when prompted</li>
                          <li><strong>Explore nearby parking spots</strong> using the map feature</li>
                          <li><strong>Book your first parking spot</strong> with location-based features</li>
                      </ol>
                  </div>
                  
                  <div style="text-align: center;">
                      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/parking" class="cta-button">
                          🚗 Start Booking Now
                      </a>
                  </div>
                  
                  <div class="info-section">
                      <h3>💡 Pro Tips</h3>
                      <ul>
                          <li>Enable location services for the best experience</li>
                          <li>Use the "Find Nearby" feature to discover parking spots around you</li>
                          <li>Check real-time availability before heading to a parking spot</li>
                          <li>Save your favorite parking locations for quick access</li>
                      </ul>
                  </div>
                  
                  <p>Thank you for choosing Ezy-Parking! We're excited to provide you with the best parking experience.</p>
                  
                  <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                  
                  <p><strong>Happy Parking!</strong><br>
                  The Ezy-Parking Team</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
LOCATION PERMISSION APPROVED - EZY-PARKING

Dear ${userData.name},

🎉 CONGRATULATIONS! Your location permission request has been APPROVED!

WHAT'S NOW AVAILABLE:
You now have access to all location-based features in Ezy-Parking:

NEW FEATURES UNLOCKED:
- 🔍 Nearby Parking Discovery: Find parking spots near your current location
- 📏 Distance Calculations: See exact distances to parking spots  
- 🗺️ Interactive Maps: View parking spots on interactive maps
- 🚗 Smart Booking: Book the closest available parking spots
- 📱 Real-time Navigation: Get directions to your booked parking spot
- ⏰ Time-based Recommendations: Get parking suggestions based on your location and time

${approvalData.parking_spot_created ? `
🅿️ BONUS: NEW PARKING SPOT CREATED!
Great news! We've created a new parking spot at your location:
📍 Location: ${approvalData.place_name}
🚗 Capacity: 55 total spots (20 cars, 30 bikes, 5 trucks)
💰 Pricing: Cars ₹20/hr, Bikes ₹10/hr, Trucks ₹50/hr
✨ Features: 24/7 Access, Security Camera, Well Lit
You can now book parking at this new location!
` : ''}

${approvalData.admin_notes ? `
📝 ADMIN NOTES:
${approvalData.admin_notes}
` : ''}

🎯 NEXT STEPS:
1. Open the Ezy-Parking app on your device
2. Allow location access when prompted
3. Explore nearby parking spots using the map feature
4. Book your first parking spot with location-based features

💡 PRO TIPS:
- Enable location services for the best experience
- Use the "Find Nearby" feature to discover parking spots around you
- Check real-time availability before heading to a parking spot
- Save your favorite parking locations for quick access

Thank you for choosing Ezy-Parking! We're excited to provide you with the best parking experience.

If you have any questions or need assistance, please don't hesitate to contact our support team.

Happy Parking!
The Ezy-Parking Team

Start booking now: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/parking
      `;

      if (!this.isConfigured) {
        console.log('📧 LOCATION PERMISSION APPROVAL EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   User: ${userData.name}`);
        console.log(`   Parking Spot Created: ${approvalData.parking_spot_created ? 'Yes' : 'No'}`);
        if (approvalData.parking_spot_created) {
          console.log(`   New Spot: ${approvalData.place_name}`);
        }
        if (approvalData.admin_notes) {
          console.log(`   Admin Notes: ${approvalData.admin_notes}`);
        }
        console.log('   ✅ User would receive location permission approval notification');
        
        return { 
          success: true, 
          testMode: true,
          recipient: userEmail,
          type: 'location_permission_approval',
          message: 'Location permission approval email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Location permission approval email sent to ${userEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send location permission approval email to ${userEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Send location permission denial notification to user
  async sendLocationPermissionDenialNotification(userEmail, userData, denialData) {
    try {
      const subject = `❌ Location Permission Request Update - Ezy-Parking`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .denial-notice { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
              .alternative-features { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .admin-notes { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #6c757d; }
              .cta-button { display: inline-block; padding: 15px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; text-align: center; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>📋 Location Permission Update</h1>
                  <p>Your request has been reviewed</p>
              </div>
              
              <div class="content">
                  <p>Dear ${userData.name},</p>
                  
                  <div class="denial-notice">
                      Your location permission request has been reviewed and is currently not approved.
                  </div>
                  
                  ${denialData.admin_notes ? `
                  <div class="admin-notes">
                      <h3>📝 Admin Review Notes</h3>
                      <p>${denialData.admin_notes}</p>
                  </div>
                  ` : ''}
                  
                  <div class="info-section">
                      <h3>🔄 What This Means</h3>
                      <p>While location-based features are not currently available to you, you can still use many other features of Ezy-Parking:</p>
                  </div>
                  
                  <div class="alternative-features">
                      <h3>✅ Available Features</h3>
                      <ul>
                          <li><strong>🔍 Browse All Parking Spots:</strong> View all available parking locations</li>
                          <li><strong>📅 Make Reservations:</strong> Book parking spots in advance</li>
                          <li><strong>💳 Secure Payments:</strong> Complete transactions safely</li>
                          <li><strong>📱 Booking Management:</strong> View and manage your reservations</li>
                          <li><strong>⭐ Reviews & Ratings:</strong> Read and write parking spot reviews</li>
                          <li><strong>📞 Customer Support:</strong> Get help when you need it</li>
                      </ul>
                  </div>
                  
                  <div class="info-section">
                      <h3>🔄 Future Requests</h3>
                      <p>You may submit a new location permission request in the future. When doing so, please:</p>
                      <ul>
                          <li>Provide a clear reason for needing location access</li>
                          <li>Ensure your request complies with our privacy policy</li>
                          <li>Include any additional context that might be helpful</li>
                      </ul>
                  </div>
                  
                  <div style="text-align: center;">
                      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/parking" class="cta-button">
                          🚗 Continue Using Ezy-Parking
                      </a>
                  </div>
                  
                  <div class="info-section">
                      <h3>❓ Questions or Concerns?</h3>
                      <p>If you have questions about this decision or would like to discuss your location permission request, please contact our support team. We're here to help!</p>
                  </div>
                  
                  <p>Thank you for your understanding and for choosing Ezy-Parking.</p>
                  
                  <p><strong>Best regards,</strong><br>
                  The Ezy-Parking Team</p>
              </div>
          </div>
      </body>
      </html>
      `;
      
      const textContent = `
LOCATION PERMISSION REQUEST UPDATE - EZY-PARKING

Dear ${userData.name},

Your location permission request has been reviewed and is currently not approved.

${denialData.admin_notes ? `
📝 ADMIN REVIEW NOTES:
${denialData.admin_notes}
` : ''}

🔄 WHAT THIS MEANS:
While location-based features are not currently available to you, you can still use many other features of Ezy-Parking:

✅ AVAILABLE FEATURES:
- 🔍 Browse All Parking Spots: View all available parking locations
- 📅 Make Reservations: Book parking spots in advance  
- 💳 Secure Payments: Complete transactions safely
- 📱 Booking Management: View and manage your reservations
- ⭐ Reviews & Ratings: Read and write parking spot reviews
- 📞 Customer Support: Get help when you need it

🔄 FUTURE REQUESTS:
You may submit a new location permission request in the future. When doing so, please:
- Provide a clear reason for needing location access
- Ensure your request complies with our privacy policy
- Include any additional context that might be helpful

❓ QUESTIONS OR CONCERNS?
If you have questions about this decision or would like to discuss your location permission request, please contact our support team. We're here to help!

Thank you for your understanding and for choosing Ezy-Parking.

Best regards,
The Ezy-Parking Team

Continue using Ezy-Parking: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/parking
      `;

      if (!this.isConfigured) {
        console.log('📧 LOCATION PERMISSION DENIAL EMAIL (Test Mode):');
        console.log(`   To: ${userEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   User: ${userData.name}`);
        if (denialData.admin_notes) {
          console.log(`   Admin Notes: ${denialData.admin_notes}`);
        }
        console.log('   ✅ User would receive location permission denial notification');
        
        return { 
          success: true, 
          testMode: true,
          recipient: userEmail,
          type: 'location_permission_denial',
          message: 'Location permission denial email logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Location permission denial email sent to ${userEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send location permission denial email to ${userEmail}:`, error.message);
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

  // Send booking extension confirmation email
  async sendBookingExtensionConfirmation(userEmail, extensionData) {
    try {
      const subject = `⏰ Booking Extended - ${extensionData.booking.booking_ref}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #17a2b8 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .success-badge { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; font-size: 18px; }
              .extension-info { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .payment-info { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>⏰ Booking Extended!</h1>
                  <p>Your parking time has been successfully extended</p>
              </div>
              
              <div class="content">
                  <p>Dear Customer,</p>
                  
                  <div class="success-badge">
                      <strong>✅ EXTENSION CONFIRMED</strong>
                  </div>
                  
                  <div class="info-section">
                      <h3>📋 Updated Booking Details</h3>
                      <p><strong>Booking Reference:</strong> ${extensionData.booking.booking_ref}</p>
                      <p><strong>Parking Spot:</strong> ${extensionData.booking.spot_name}</p>
                      <p><strong>Vehicle:</strong> ${extensionData.booking.vehicle_number} (${extensionData.booking.vehicle_type})</p>
                      <p><strong>Original Duration:</strong> ${extensionData.booking.duration - extensionData.extension_hours} hour(s)</p>
                      <p><strong>Extended By:</strong> ${extensionData.extension_hours} hour(s)</p>
                      <p><strong>New Total Duration:</strong> ${extensionData.booking.duration} hour(s)</p>
                      <p><strong>New End Time:</strong> ${extensionData.new_end_time}</p>
                  </div>
                  
                  <div class="payment-info">
                      <h3>💳 Extension Payment</h3>
                      <p><strong>Extension Cost:</strong> ₹${extensionData.extension_cost}</p>
                      <p><strong>New Total Amount:</strong> ₹${extensionData.new_total_amount}</p>
                      <p><strong>Payment Status:</strong> ✅ Confirmed</p>
                  </div>
                  
                  <div class="extension-info">
                      <h3>⚠️ Important Information</h3>
                      <ul>
                          <li>Your parking time has been extended automatically</li>
                          <li>Please ensure your vehicle remains in the assigned spot</li>
                          <li>The new end time is now ${extensionData.new_end_time}</li>
                          <li>Additional charges have been processed</li>
                      </ul>
                  </div>
                  
                  <div class="info-section">
                      <p><strong>Need Help?</strong></p>
                      <p>Contact our support team if you have any questions about your extended booking.</p>
                  </div>
                  
                  <p>Thank you for using our parking service!</p>
                  <p><strong>Ezy Parking Team</strong></p>
              </div>
          </div>
      </body>
      </html>
      `;

      const textContent = `
      Booking Extended Successfully!
      
      Dear Customer,
      
      Your parking booking has been successfully extended.
      
      Updated Booking Details:
      - Booking Reference: ${extensionData.booking.booking_ref}
      - Parking Spot: ${extensionData.booking.spot_name}
      - Vehicle: ${extensionData.booking.vehicle_number} (${extensionData.booking.vehicle_type})
      - Extended By: ${extensionData.extension_hours} hour(s)
      - New End Time: ${extensionData.new_end_time}
      
      Extension Payment:
      - Extension Cost: ₹${extensionData.extension_cost}
      - New Total Amount: ₹${extensionData.new_total_amount}
      - Payment Status: Confirmed
      
      Important: Please ensure your vehicle remains in the assigned spot until the new end time.
      
      Thank you for using Ezy Parking!
      `;

      if (!this.isConfigured) {
        console.log('📧 [TEST MODE] Extension confirmation email would be sent to:', userEmail);
        console.log('📧 Subject:', subject);
        console.log('📧 Extension Details:', extensionData);
        return { success: true, message: 'Extension confirmation logged (test mode)' };
      }

      const mailOptions = {
        from: `"Ezy Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('📧 Extension confirmation email sent successfully to:', userEmail);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('❌ Failed to send extension confirmation email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send parking expiration notification to user
  async sendParkingExpirationNotification(userEmail, bookingData) {
    try {
      const subject = `⏰ Parking Time Expired - Please Collect Your ${bookingData.vehicle_type}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .warning-section { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .urgent-notice { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; font-weight: bold; }
              .vehicle-info { background: #e2e3e5; padding: 10px; border-radius: 5px; margin: 10px 0; }
              .action-required { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>⏰ Parking Time Expired</h1>
                  <p>Your parking session has ended</p>
              </div>
              
              <div class="content">
                  <p>Dear ${bookingData.user_name},</p>
                  
                  <div class="urgent-notice">
                      🚨 YOUR PARKING TIME HAS EXPIRED 🚨<br>
                      Please collect your vehicle immediately
                  </div>
                  
                  <div class="warning-section">
                      <strong>⚠️ IMPORTANT NOTICE:</strong><br>
                      Your parking time has ended. Please pick up your ${bookingData.vehicle_type} as soon as possible to avoid any inconvenience.
                  </div>

                  <div class="info-section">
                      <h3>📋 Booking Details</h3>
                      <p><strong>Booking Reference:</strong> ${bookingData.booking_ref}</p>
                      <p><strong>Parking Location:</strong> ${bookingData.spot_name}</p>
                      <p><strong>Address:</strong> ${bookingData.spot_address}</p>
                      <p><strong>Parking Duration:</strong> ${bookingData.duration} hours</p>
                      <p><strong>Total Amount Paid:</strong> ₹${bookingData.total_price}</p>
                  </div>

                  <div class="vehicle-info">
                      <h3>🚗 Vehicle Information</h3>
                      <p><strong>Vehicle Type:</strong> ${bookingData.vehicle_type.charAt(0).toUpperCase() + bookingData.vehicle_type.slice(1)}</p>
                      <p><strong>Vehicle Number:</strong> ${bookingData.vehicle_number}</p>
                  </div>

                  <div class="action-required">
                      <h3>🎯 Action Required</h3>
                      <p><strong>Please collect your ${bookingData.vehicle_type} immediately</strong></p>
                      <p>Your parking slot has been automatically released and is now available for other users.</p>
                  </div>

                  <div class="info-section">
                      <h3>📞 Need Help?</h3>
                      <p>If you have any questions or need assistance, please contact our support team:</p>
                      <p>📧 Email: support@ezyparking.com</p>
                      <p>📱 Phone: +91-9880-123456</p>
                  </div>

                  <p>Thank you for using Ezy-Parking!</p>
                  
                  <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                  <p style="font-size: 12px; color: #666;">
                      This is an automated message. Please do not reply to this email.<br>
                      © 2024 Ezy-Parking. All rights reserved.
                  </p>
              </div>
          </div>
      </body>
      </html>
      `;

      const textContent = `
      PARKING TIME EXPIRED - PLEASE COLLECT YOUR VEHICLE

      Dear ${bookingData.user_name},

      Your parking time has expired. Please collect your ${bookingData.vehicle_type} immediately.

      Booking Details:
      - Reference: ${bookingData.booking_ref}
      - Location: ${bookingData.spot_name}
      - Address: ${bookingData.spot_address}
      - Duration: ${bookingData.duration} hours
      - Amount Paid: ₹${bookingData.total_price}

      Vehicle Information:
      - Type: ${bookingData.vehicle_type.charAt(0).toUpperCase() + bookingData.vehicle_type.slice(1)}
      - Number: ${bookingData.vehicle_number}

      ACTION REQUIRED: Please pick up your vehicle as soon as possible.
      Your parking slot has been automatically released.

      Need help? Contact us at support@ezyparking.com or +91-9880-123456

      Thank you for using Ezy-Parking!
      `;

      if (!this.isConfigured) {
        console.log('📧 [TEST MODE] Parking expiration email would be sent to:', userEmail);
        console.log('📧 Subject:', subject);
        console.log('📧 Content:', textContent);
        return { success: true, mode: 'test', message: 'Email logged in test mode' };
      }

      const mailOptions = {
        from: `"Ezy-Parking" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Parking expiration email sent to ${userEmail}`);
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending parking expiration email:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send admin notification for expired booking
  async sendAdminBookingExpirationNotification(adminEmail, bookingData) {
    try {
      const subject = `⏰ Booking Expired - ${bookingData.booking_ref}`;
      
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #ffc107; color: #212529; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
              .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .expired-badge { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
              .slot-released { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; text-align: center; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>⏰ Booking Expired</h1>
                  <p>Parking slot automatically released</p>
              </div>
              
              <div class="content">
                  <p>Dear Admin,</p>
                  
                  <div class="expired-badge">
                      <strong>📋 BOOKING EXPIRED: ${bookingData.booking_ref}</strong>
                  </div>
                  
                  <div class="slot-released">
                      <strong>✅ PARKING SLOT AUTOMATICALLY RELEASED</strong>
                  </div>

                  <div class="info-section">
                      <h3>👤 User Information</h3>
                      <p><strong>Name:</strong> ${bookingData.user_name}</p>
                      <p><strong>Email:</strong> ${bookingData.user_email}</p>
                  </div>

                  <div class="info-section">
                      <h3>📋 Booking Information</h3>
                      <p><strong>Booking Reference:</strong> ${bookingData.booking_ref}</p>
                      <p><strong>Parking Location:</strong> ${bookingData.spot_name}</p>
                      <p><strong>Vehicle Type:</strong> ${bookingData.vehicle_type.charAt(0).toUpperCase() + bookingData.vehicle_type.slice(1)}</p>
                      <p><strong>Vehicle Number:</strong> ${bookingData.vehicle_number}</p>
                      <p><strong>Expired At:</strong> ${new Date(bookingData.expired_at).toLocaleString()}</p>
                  </div>

                  <div class="info-section">
                      <h3>🎯 Actions Taken</h3>
                      <p>✅ Booking status updated to 'expired'</p>
                      <p>✅ Parking slot released and made available</p>
                      <p>✅ User notified via email</p>
                      <p>✅ Dashboard notification sent to user</p>
                  </div>

                  <p>The system has automatically handled the booking expiration process.</p>
                  
                  <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                  <p style="font-size: 12px; color: #666;">
                      This is an automated admin notification from Ezy-Parking system.
                  </p>
              </div>
          </div>
      </body>
      </html>
      `;

      if (!this.isConfigured) {
        console.log('📧 [TEST MODE] Admin expiration notification would be sent to:', adminEmail);
        return { success: true, mode: 'test' };
      }

      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Admin expiration notification sent to ${adminEmail}`);
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending admin expiration notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send admin notification for various events
  async sendAdminNotification(adminEmail, notificationData) {
    try {
      const { type, booking, user, extension_details } = notificationData;
      
      let subject, htmlContent, textContent;
      
      if (type === 'booking_extension') {
        subject = `⏰ Booking Extended - ${booking.booking_ref}`;
        
        htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #17a2b8; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
                .info-section { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .extension-badge { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⏰ Booking Extension Alert</h1>
                    <p>A customer has extended their parking booking</p>
                </div>
                
                <div class="content">
                    <p>Dear Admin,</p>
                    
                    <div class="extension-badge">
                        <strong>✅ BOOKING EXTENDED SUCCESSFULLY</strong>
                    </div>
                    
                    <div class="info-section">
                        <h3>👤 Customer Details</h3>
                        <p><strong>Name:</strong> ${user.name}</p>
                        <p><strong>Email:</strong> ${user.email}</p>
                    </div>
                    
                    <div class="info-section">
                        <h3>📋 Booking Details</h3>
                        <p><strong>Booking Reference:</strong> ${booking.booking_ref}</p>
                        <p><strong>Parking Spot:</strong> ${booking.spot_name}</p>
                        <p><strong>Vehicle:</strong> ${booking.vehicle_number} (${booking.vehicle_type})</p>
                        <p><strong>Original Duration:</strong> ${booking.duration - extension_details.hours} hour(s)</p>
                        <p><strong>Extended By:</strong> ${extension_details.hours} hour(s)</p>
                        <p><strong>New Total Duration:</strong> ${booking.duration} hour(s)</p>
                        <p><strong>New End Time:</strong> ${extension_details.new_end_time}</p>
                    </div>
                    
                    <div class="info-section">
                        <h3>💰 Revenue Details</h3>
                        <p><strong>Extension Cost:</strong> ₹${extension_details.cost}</p>
                        <p><strong>Payment Status:</strong> ✅ Confirmed</p>
                    </div>
                    
                    <p>The customer has successfully extended their parking time and payment has been processed.</p>
                </div>
            </div>
        </body>
        </html>
        `;
        
        textContent = `
        ADMIN NOTIFICATION - BOOKING EXTENSION
        
        Customer: ${user.name} (${user.email})
        Booking Reference: ${booking.booking_ref}
        Parking Spot: ${booking.spot_name}
        Vehicle: ${booking.vehicle_number} (${booking.vehicle_type})
        Extended By: ${extension_details.hours} hour(s)
        Extension Cost: ₹${extension_details.cost}
        New End Time: ${extension_details.new_end_time}
        
        Payment Status: Confirmed
        `;
      }

      if (!this.isConfigured) {
        console.log('📧 ADMIN NOTIFICATION (Test Mode):');
        console.log(`   To: ${adminEmail}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Type: ${type}`);
        console.log('   ✅ Admin would receive this notification');
        
        return { 
          success: true, 
          testMode: true,
          recipient: adminEmail,
          type: type,
          message: 'Admin notification logged (test mode)'
        };
      }

      const mailOptions = {
        from: `"Ezy-Parking System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Admin notification sent to ${adminEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send admin notification to ${adminEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new EmailService();