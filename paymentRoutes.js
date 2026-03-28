const express = require('express');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { authenticateToken } = require('../middleware/authMiddleware');
const emailService = require('../services/emailService');

const router = express.Router();

// Create new payment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { booking_id, amount, payment_method, currency } = req.body;

    // Validate required fields
    if (!booking_id || !amount || !payment_method) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID, amount, and payment method are required'
      });
    }

    // Verify booking exists and belongs to user
    const booking = await Booking.findById(booking_id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to booking'
      });
    }

    // Create payment record
    const paymentId = await Payment.create({
      booking_id,
      user_id: req.user.userId,
      amount,
      currency: currency || 'INR',
      payment_method,
      payment_gateway: getPaymentGateway(payment_method),
      status: 'pending'
    });

    const payment = await Payment.findById(paymentId);

    res.status(201).json({
      success: true,
      message: 'Payment initiated successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Manual payment confirmation with user payment ID
router.post('/:payment_id/manual-confirm', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { user_payment_id, payment_method } = req.body;

    if (!user_payment_id) {
      return res.status(400).json({
        success: false,
        error: 'User payment ID is required'
      });
    }

    const payment = await Payment.findByPaymentId(payment_id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (payment.user_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to payment'
      });
    }

    // Generate transaction ID based on user payment ID
    const transaction_id = `${payment_method.toUpperCase()}_${user_payment_id}_${Date.now()}`;
    
    const gateway_response = {
      status: 'success',
      method: payment_method,
      user_payment_id: user_payment_id,
      timestamp: new Date().toISOString(),
      gateway: getPaymentGateway(payment_method),
      manual_confirmation: true
    };

    // Complete the payment
    await payment.complete(transaction_id, gateway_response);

    // Update booking status
    const booking = await Booking.findById(payment.booking_id);
    if (booking) {
      await booking.update({ 
        status: 'confirmed',
        payment_status: 'completed'
      });

      // Get user and parking spot details for emails
      const User = require('../models/User');
      const ParkingSpot = require('../models/ParkingSpot');
      const user = await User.findById(payment.user_id);
      const parkingSpot = await ParkingSpot.findById(booking.spot_id);

      if (user && user.email) {
        // Send payment confirmation email to user
        try {
          console.log('📧 Attempting to send payment confirmation email to user:', user.email);
          await emailService.sendPaymentConfirmation(user.email, {
            user_name: user.name,
            booking_ref: booking.booking_ref,
            amount: payment.amount,
            payment_method: payment.payment_method,
            transaction_id: transaction_id,
            user_payment_id: user_payment_id,
            payment_date: new Date().toLocaleString()
          });
          console.log('✅ Payment confirmation email sent to user:', user.email);
        } catch (emailError) {
          console.log('⚠️ Payment confirmation email failed:', emailError.message);
          console.error('📧 User email error details:', emailError);
        }

        // Send admin notification with REAL user data
        try {
          const adminEmail = 'shubhamyamakar9880@gmail.com';
          
          const userData = {
            name: user.name || user.username || user.full_name,
            email: user.email,
            phone: user.phone || user.mobile || user.contact_number || booking.mobile_number,
            created_at: user.created_at
          };

          const bookingData = {
            booking_ref: booking.booking_ref,
            spot_name: parkingSpot?.name || 'Parking Spot',
            spot_address: parkingSpot?.address || 'Parking Location',
            vehicle_number: booking.vehicle_number,
            vehicle_color: booking.vehicle_color,
            vehicle_type: booking.vehicle_type,
            duration: booking.duration,
            start_time: booking.start_time,
            end_time: booking.end_time,
            booking_date: booking.created_at,
            mobile_number: booking.mobile_number
          };

          const paymentData = {
            amount: payment.amount,
            payment_method: getPaymentGateway(payment.payment_method),
            transaction_id: transaction_id,
            user_payment_id: user_payment_id,
            payment_date: new Date().toLocaleString()
          };

          await emailService.sendAdminBookingPaymentNotification(
            adminEmail,
            userData,
            bookingData,
            paymentData
          );

          console.log('✅ Admin notification sent with REAL user data:', {
            userName: userData.name,
            userEmail: userData.email,
            userPhone: userData.phone,
            bookingRef: bookingData.booking_ref,
            amount: paymentData.amount
          });

        } catch (adminEmailError) {
          console.log('⚠️ Admin notification email failed:', adminEmailError.message);
        }
      }
    }

    res.json({
      success: true,
      message: `Payment confirmed successfully with ${getPaymentGateway(payment_method)} ID: ${user_payment_id}`,
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Manual payment confirmation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Confirm payment
router.post('/:payment_id/confirm', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { transaction_id, gateway_response } = req.body;

    const payment = await Payment.findByPaymentId(payment_id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (payment.user_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to payment'
      });
    }

    // Complete the payment
    await payment.complete(transaction_id, gateway_response);

    // Update booking status
    const booking = await Booking.findById(payment.booking_id);
    if (booking) {
      await booking.update({ 
        status: 'confirmed',
        payment_status: 'completed'
      });

      // Get user and parking spot details for emails
      const User = require('../models/User');
      const ParkingSpot = require('../models/ParkingSpot');
      const user = await User.findById(payment.user_id);
      const parkingSpot = await ParkingSpot.findById(booking.spot_id);

      if (user && user.email) {
        // Send payment confirmation email to user
        try {
          console.log('📧 Attempting to send payment confirmation email to user:', user.email);
          await emailService.sendPaymentConfirmation(user.email, {
            user_name: user.name,
            booking_ref: booking.booking_ref,
            amount: payment.amount,
            payment_method: payment.payment_method,
            transaction_id: transaction_id,
            payment_date: new Date().toLocaleString()
          });
          console.log('✅ Payment confirmation email sent to user:', user.email);
        } catch (emailError) {
          console.log('⚠️ Payment confirmation email failed:', emailError.message);
          console.error('📧 User email error details:', emailError);
        }

        // Send admin notification with REAL user data
        try {
          const adminEmail = 'shubhamyamakar9880@gmail.com';
          
          const userData = {
            name: user.name || user.username || user.full_name,
            email: user.email,
            phone: user.phone || user.mobile || user.contact_number || booking.mobile_number,
            created_at: user.created_at
          };

          const bookingData = {
            booking_ref: booking.booking_ref,
            spot_name: parkingSpot?.name || 'Parking Spot',
            spot_address: parkingSpot?.address || 'Parking Location',
            vehicle_number: booking.vehicle_number,
            vehicle_color: booking.vehicle_color,
            vehicle_type: booking.vehicle_type,
            duration: booking.duration,
            start_time: booking.start_time,
            end_time: booking.end_time,
            booking_date: booking.created_at,
            mobile_number: booking.mobile_number
          };

          const paymentData = {
            amount: payment.amount,
            payment_method: getPaymentGateway(payment.payment_method),
            transaction_id: transaction_id,
            payment_date: new Date().toLocaleString()
          };

          await emailService.sendAdminBookingPaymentNotification(
            adminEmail,
            userData,
            bookingData,
            paymentData
          );

          console.log('✅ Admin notification sent with REAL user data:', {
            userName: userData.name,
            userEmail: userData.email,
            userPhone: userData.phone,
            bookingRef: bookingData.booking_ref,
            amount: paymentData.amount
          });

        } catch (adminEmailError) {
          console.log('⚠️ Admin notification email failed:', adminEmailError.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get payment by ID
router.get('/:payment_id', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    
    const payment = await Payment.findByPaymentId(payment_id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (payment.user_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to payment'
      });
    }

    res.json({
      success: true,
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user payments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, payment_method, limit = 20, offset = 0 } = req.query;
    
    const filters = {
      status,
      payment_method,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const payments = await Payment.getByUserId(req.user.userId, filters);

    res.json({
      success: true,
      payments: payments.map(payment => payment.toJSON()),
      count: payments.length
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Cancel payment
router.post('/:payment_id/cancel', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { reason } = req.body;

    const payment = await Payment.findByPaymentId(payment_id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (payment.user_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to payment'
      });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Only pending payments can be cancelled'
      });
    }

    await payment.cancel({
      reason: reason || 'Cancelled by user',
      cancelled_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Payment cancelled successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Payment cancellation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Refund payment (admin only)
router.post('/:payment_id/refund', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { refund_amount, reason } = req.body;

    // Check if user is admin
    const User = require('../models/User');
    const user = await User.findById(req.user.userId);
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const payment = await Payment.findByPaymentId(payment_id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Only completed payments can be refunded'
      });
    }

    await payment.refund(refund_amount, {
      reason: reason || 'Refund processed by admin',
      refunded_by: req.user.userId,
      refunded_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Payment refunded successfully',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Payment refund error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Send admin notification for booking and payment success
router.post('/admin-notification', authenticateToken, async (req, res) => {
  try {
    const { bookingData, paymentData } = req.body;

    // Get real user data from the authenticated user
    const User = require('../models/User');
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const adminEmail = 'shubhamyamakar9880@gmail.com';
    
    const userData = {
      name: user.name || user.username || user.full_name,
      email: user.email,
      phone: user.phone || user.mobile || user.contact_number || bookingData?.mobile_number,
      created_at: user.created_at
    };

    const enrichedBookingData = {
      booking_ref: bookingData?.booking_ref || 'BK_' + Date.now(),
      spot_name: bookingData?.spot_name || 'Selected Parking Spot',
      spot_address: bookingData?.spot_address || 'Parking Location',
      vehicle_number: bookingData?.vehicle_number || 'Vehicle Info',
      vehicle_color: bookingData?.vehicle_color || 'Vehicle Color',
      vehicle_type: bookingData?.vehicle_type || 'Vehicle Type',
      duration: bookingData?.duration || '1',
      start_time: bookingData?.start_time || new Date().toLocaleString(),
      end_time: bookingData?.end_time || new Date(Date.now() + 3600000).toLocaleString(),
      booking_date: bookingData?.booking_date || new Date().toLocaleDateString(),
      mobile_number: bookingData?.mobile_number || userData.phone
    };

    const enrichedPaymentData = {
      amount: paymentData?.amount || 0,
      payment_method: paymentData?.payment_method || 'Unknown',
      transaction_id: paymentData?.transaction_id || 'TXN_' + Date.now(),
      user_payment_id: paymentData?.user_payment_id,
      payment_date: paymentData?.payment_date || new Date().toLocaleString()
    };

    // Send admin notification with REAL user data
    const result = await emailService.sendAdminBookingPaymentNotification(
      adminEmail,
      userData,
      enrichedBookingData,
      enrichedPaymentData
    );

    console.log('✅ Admin notification API called with REAL user data:', {
      userName: userData.name,
      userEmail: userData.email,
      userPhone: userData.phone,
      bookingRef: enrichedBookingData.booking_ref,
      amount: enrichedPaymentData.amount
    });

    res.json({
      success: true,
      message: 'Admin notification sent successfully',
      result: result
    });

  } catch (error) {
    console.error('Admin notification API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send admin notification'
    });
  }
});

// Get payment statistics
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    const filters = {
      user_id: req.user.userId,
      from_date,
      to_date
    };

    const stats = await Payment.getStatistics(filters);

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error('Payment statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Simulate payment (for demo purposes)
router.post('/:payment_id/simulate', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { success_rate = 0.9 } = req.body;

    const payment = await Payment.simulatePayment(payment_id, success_rate);

    res.json({
      success: true,
      message: 'Payment simulation completed',
      payment: payment.toJSON()
    });
  } catch (error) {
    console.error('Payment simulation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Helper function to determine payment gateway
function getPaymentGateway(payment_method) {
  const gateways = {
    'phonepe': 'PhonePe',
    'googlepay': 'Google Pay',
    'paytm': 'Paytm',
    'upi': 'UPI',
    'card': 'Razorpay',
    'netbanking': 'Razorpay',
    'cash': 'Cash'
  };
  
  return gateways[payment_method] || 'Unknown';
}

module.exports = router;