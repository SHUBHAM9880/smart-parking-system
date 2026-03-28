const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();

// Import database and models
const { initializeDatabase } = require('./config/database');
const emailService = require('./services/emailService');
const socketManager = require('./services/socketManager');
const schedulerService = require('./services/schedulerService');

// Import routes
const authRoutes = require('./routes/authRoutes');
const parkingRoutes = require('./routes/parkingRoutes');
const parkingSlotsRoutes = require('./routes/parkingSlotsRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const locationRoutes = require('./routes/locationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const otpRoutes = require('./routes/otpRoutes');
const emailRoutes = require('./routes/emailRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentOtpRoutes = require('./routes/paymentOtpRoutes');
const userDataRoutes = require('./routes/userDataRoutes');

// Import middleware
const { sanitizeInput } = require('./middleware/validationMiddleware');
const { globalErrorHandler, handleNotFound, logError } = require('./middleware/errorMiddleware');
const { authenticateToken } = require('./middleware/authMiddleware');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Input sanitization
app.use(sanitizeInput);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/parking-spots', parkingRoutes);
app.use('/api/parking-slots', parkingSlotsRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-otp', paymentOtpRoutes);
app.use('/api/user', userDataRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  let emailStatus = { configured: false, error: 'Email service initializing...' };
  
  try {
    if (emailService && typeof emailService.getConfigurationStatus === 'function') {
      emailStatus = emailService.getConfigurationStatus();
    }
  } catch (error) {
    emailStatus = { configured: false, error: error.message };
  }
  
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'Connected',
      email: emailStatus.configured ? 'Configured' : 'Not configured',
      emailDetails: emailStatus,
      scheduler: `${schedulerService.jobs.length} jobs running`
    }
  });
});

// Email configuration status endpoint
app.get('/api/email/status', authenticateToken, async (req, res) => {
  try {
    const status = emailService.getConfigurationStatus ? emailService.getConfigurationStatus() : {
      configured: false,
      error: 'Email service initializing...',
      provider: 'Not set',
      user: 'Not configured'
    };
    
    const testResult = emailService.testEmailConfiguration ? await emailService.testEmailConfiguration() : {
      success: false,
      error: 'Email service initializing...'
    };
    
    res.json({
      success: true,
      email: {
        ...status,
        testResult: testResult
      }
    });
  } catch (error) {
    console.error('Email status error:', error);
    res.json({
      success: true,
      email: {
        configured: false,
        error: `Email service error: ${error.message}`,
        provider: 'Not set',
        user: 'Not configured',
        testResult: { success: false, error: 'Service unavailable' }
      }
    });
  }
});

// Test email endpoint
app.post('/api/test/email', authenticateToken, async (req, res) => {
  try {
    const { type = 'welcome', email } = req.body;
    const user = await require('./models/User').findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const testEmail = email || user.email;
    let result;

    switch (type) {
      case 'welcome':
        // Use generic email for welcome since sendWelcomeEmail doesn't exist
        result = await emailService.sendEmail({
          to: testEmail,
          subject: '🎉 Welcome to Ezy-Parking!',
          html: `<h2>Welcome ${user.name}!</h2><p>Thank you for joining Ezy-Parking. We're excited to help you find the perfect parking spot!</p>`,
          text: `Welcome ${user.name}! Thank you for joining Ezy-Parking.`
        });
        break;
      
      case 'booking':
        const mockBooking = {
          booking_ref: 'TEST001',
          spot_name: 'Test Parking Spot',
          spot_address: 'Test Address, Test City',
          vehicle_number: 'TEST1234',
          vehicle_color: 'Blue',
          vehicle_type: 'car',
          duration: 2,
          total_price: 100,
          booking_time: new Date(),
          end_time: new Date(Date.now() + 2 * 60 * 60 * 1000)
        };
        result = await emailService.sendBookingConfirmation(testEmail, mockBooking);
        break;
      
      case 'payment':
        const mockPayment = {
          user_name: user.name,
          booking_ref: 'TEST_PAY_001',
          amount: 200,
          payment_method: 'PhonePe',
          transaction_id: 'TEST_TXN_' + Date.now(),
          user_payment_id: 'PHONEPE_TEST_' + Date.now(),
          payment_date: new Date().toLocaleString()
        };
        result = await emailService.sendPaymentConfirmation(testEmail, mockPayment);
        break;
      
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid email type. Use: welcome, booking, payment'
        });
    }

    res.json({
      success: result.success,
      message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
      details: result
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Dashboard stats endpoint (legacy support)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    // This endpoint provides basic stats for the dashboard
    // In a real app, you'd implement proper dashboard analytics
    res.json({
      success: true,
      stats: {
        totalBookings: 0,
        availableSpots: 0,
        totalRevenue: 0,
        sensorStats: {
          online: 247,
          offline: 1,
          maintenance: 3,
          error: 0
        }
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Real-time updates with Socket.IO
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join admin room if user is admin
  socket.on('join-admin', async (token) => {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ezy-parking-secret');
      const User = require('./models/User');
      const user = await User.findById(decoded.userId);
      
      if (user && (user.role === 'admin' || user.role === 'super_admin')) {
        socket.join('admin-room');
        socket.adminId = user.id;
        socket.adminName = user.name;
        console.log(`Admin ${user.name} joined admin room`);
      }
    } catch (error) {
      console.error('Failed to join admin room:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Simulate real-time sensor updates
  setInterval(() => {
    socket.emit('sensorUpdate', {
      temperature: (Math.random() * 10 + 20).toFixed(1),
      humidity: (Math.random() * 20 + 40).toFixed(1),
      timestamp: new Date().toISOString()
    });
  }, 5000);
});

// Register socket.io instance with socket manager
socketManager.setIO(io);

// Function to emit real-time admin notifications
function emitAdminNotification(notificationData) {
  socketManager.emitAdminNotification({
    type: 'location_permission_request',
    title: 'New Location Permission Request',
    message: `${notificationData.user_name} has requested location permission`,
    data: notificationData,
    timestamp: new Date().toISOString()
  });
}

// Make the function available globally
global.emitAdminNotification = emitAdminNotification;

// Error handling middleware
app.use(logError);
app.use(globalErrorHandler);

// 404 handler
app.use('*', handleNotFound);

const PORT = process.env.PORT || 5000;

// Initialize database and start server
initializeDatabase().then(async () => {
  // Test email configuration (if configured)
  let emailStatus = { configured: false, error: 'Email service initializing...' };
  
  try {
    if (emailService && typeof emailService.getConfigurationStatus === 'function') {
      emailStatus = emailService.getConfigurationStatus();
    }
  } catch (error) {
    console.log(`📧 Email service: Error - ${error.message}`);
    emailStatus = { configured: false, error: error.message };
  }
  if (emailStatus.configured) {
    const testResult = await emailService.testEmailConfiguration();
    console.log(`📧 Email service: ${testResult.success ? 'Ready and verified' : 'Configured but verification failed'}`);
    if (!testResult.success) {
      console.log(`   Error: ${testResult.error}`);
    }
  } else {
    console.log(`📧 Email service: ${emailStatus.error}`);
  }
  
  server.listen(PORT, () => {
    console.log(`� Servear running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`�  API Base URL: http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend URL: http://localhost:3000`);
    console.log(`📧 Email service: ${emailService && emailService.isConfigured !== undefined ? (emailService.isConfigured ? 'Ready' : 'Test mode - notifications logged') : 'Not configured'}`);
    console.log(`⏰ Scheduler: ${schedulerService.jobs.length} jobs running`);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Export socket.io instance for use in other modules
const getSocketIO = () => socketManager.getIO();

module.exports = { app, getSocketIO };