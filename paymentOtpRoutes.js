const express = require('express');
const paymentOtpService = require('../services/paymentOtpService');
const { authenticateToken } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const emailService = require('../services/emailService');

const router = express.Router();

// Request payment OTP
router.post('/request-payment-otp', authenticateToken, async (req, res) => {
  try {
    const { amount, payment_method, booking_ref, booking_id } = req.body;

    if (!amount || !payment_method) {
      return res.status(400).json({
        success: false,
        error: 'Amount and payment method are required'
      });
    }

    // Get user details
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const paymentData = {
      amount: amount,
      payment_method: payment_method,
      booking_ref: booking_ref || 'BK_' + Date.now(),
      booking_id: booking_id,
      user_id: req.user.userId
    };

    // Generate OTP
    const { otpKey, otp } = paymentOtpService.generatePaymentOTP(req.user.userId, paymentData);

    // Send OTP email
    const emailResult = await paymentOtpService.sendPaymentOTP(
      user.email,
      user.name,
      otp,
      paymentData
    );

    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Payment OTP sent to your email',
        otpKey: otpKey,
        displayMessage: emailResult.displayMessage || 'Please check your email for the payment verification code',
        testMode: emailResult.testMode || false
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send payment OTP'
      });
    }

  } catch (error) {
    console.error('Payment OTP request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Verify payment OTP and complete payment
router.post('/verify-payment-otp', authenticateToken, async (req, res) => {
  try {
    const { otpKey, otp, user_payment_id, bookingData } = req.body;

    if (!otpKey || !otp) {
      return res.status(400).json({
        success: false,
        error: 'OTP key and OTP are required'
      });
    }

    // Verify OTP
    const verificationResult = paymentOtpService.verifyPaymentOTP(otpKey, otp);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        error: verificationResult.error
      });
    }

    const paymentData = verificationResult.paymentData;
    const userId = verificationResult.userId;

    // Ensure the user matches
    if (userId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access'
      });
    }

    try {
      // Simple booking creation - bypass complex storage service
      if (bookingData) {
        console.log('🎉 OTP Verified - Creating simple booking...');
        
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        
        // Generate booking reference
        const bookingRef = `EZY${Date.now()}`;
        const transactionId = `TXN_${Date.now()}`;
        
        // Create simple booking record with proper date/time handling
        const startDateTime = `${bookingData.booking_date} ${bookingData.from_time}:00`;
        const endDateTime = `${bookingData.booking_date} ${bookingData.to_time}:00`;
        
        const [bookingResult] = await db.execute(`
          INSERT INTO bookings (
            booking_ref, user_id, spot_id, vehicle_number, vehicle_color, 
            vehicle_type, mobile_number, duration, total_price, 
            booking_time, start_time, end_time, status, payment_status, payment_method, 
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'active', 'paid', ?, NOW(), NOW())
        `, [
          bookingRef,
          userId,
          bookingData.spot_id,
          bookingData.vehicle_number,
          bookingData.vehicle_color,
          bookingData.vehicle_type,
          bookingData.mobile_number,
          bookingData.duration,
          paymentData.amount,
          startDateTime,
          endDateTime,
          bookingData.payment_method
        ]);

        const bookingId = bookingResult.insertId;
        
        // Create payment record
        await db.execute(`
          INSERT INTO payments (
            payment_id, booking_id, user_id, amount, currency,
            payment_method, status, transaction_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'INR', ?, 'completed', ?, NOW(), NOW())
        `, [
          `PAY_${bookingRef}`,
          bookingId,
          userId,
          paymentData.amount,
          bookingData.payment_method,
          transactionId
        ]);

        // Create slot bookings if slots are selected
        if (bookingData.selected_slots && bookingData.selected_slots.length > 0) {
          console.log(`🎯 Processing ${bookingData.selected_slots.length} selected slots...`);
          
          const amountPerSlot = paymentData.amount / bookingData.selected_slots.length;
          
          for (const slot of bookingData.selected_slots) {
            console.log(`   📍 Processing slot: ${slot.slot_number} (ID: ${slot.id})`);
            
            // Insert slot booking record
            await db.execute(`
              INSERT INTO slot_bookings (
                booking_id, slot_id, user_id, spot_id, slot_number,
                booking_date, start_time, end_time, duration, amount,
                status, vehicle_number, vehicle_type, vehicle_color,
                mobile_number, payment_status, payment_method,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 'paid', ?, NOW(), NOW())
            `, [
              bookingId,
              slot.id,
              userId,
              bookingData.spot_id,
              slot.slot_number,
              bookingData.booking_date,
              bookingData.from_time,
              bookingData.to_time,
              bookingData.duration,
              amountPerSlot,
              bookingData.vehicle_number,
              bookingData.vehicle_type,
              bookingData.vehicle_color,
              bookingData.mobile_number,
              bookingData.payment_method
            ]);

            // Update slot status to booked
            await db.execute(
              'UPDATE parking_slots SET status = "booked", last_booking_id = ?, last_occupied_at = NOW() WHERE id = ?',
              [bookingId, slot.id]
            );
            
            console.log(`   ✅ Slot ${slot.slot_number} booked and updated`);
          }
        }

        // Create user notification
        const userMessage = `Your booking ${bookingRef} has been confirmed for ${bookingData.booking_date} from ${bookingData.from_time} to ${bookingData.to_time}. Vehicle: ${bookingData.vehicle_number}. Amount: ₹${paymentData.amount}`;
        
        await db.execute(
          'INSERT INTO notifications (user_id, title, message, type, is_read, created_at) VALUES (?, "Booking Confirmed", ?, "booking", 0, NOW())',
          [userId, userMessage]
        );

        // Create admin notifications
        const [adminUsers] = await db.execute(
          "SELECT id FROM users WHERE role IN ('admin', 'super_admin')"
        );

        for (const admin of adminUsers) {
          const adminMessage = `New booking ${bookingRef} created by user ID ${userId}. Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type}). Amount: ₹${paymentData.amount}. Date: ${bookingData.booking_date} ${bookingData.from_time}-${bookingData.to_time}`;
          
          await db.execute(
            'INSERT INTO notifications (user_id, title, message, type, is_read, created_at) VALUES (?, "New Booking Created", ?, "booking", 0, NOW())',
            [admin.id, adminMessage]
          );
        }

        console.log('✅ Simple booking created successfully');
        console.log(`   📋 Booking Ref: ${bookingRef}`);
        console.log(`   💳 Transaction ID: ${transactionId}`);
        
        // Remove OTP after successful verification
        paymentOtpService.removeOTP(otpKey);
        
        return res.json({
          success: true,
          message: 'Payment verified and booking created successfully',
          booking_ref: bookingRef,
          transaction_id: transactionId,
          amount: paymentData.amount
        });
      }

      // Legacy payment handling (if no booking data)
      const transaction_id = `${paymentData.payment_method.toUpperCase()}_${user_payment_id || Date.now()}_${Date.now()}`;
      
      // Remove OTP after successful verification
      paymentOtpService.removeOTP(otpKey);

      res.json({
        success: true,
        message: 'Payment verified successfully!',
        booking_ref: paymentData.booking_ref,
        transaction_id: transaction_id,
        amount: paymentData.amount
      });

    } catch (paymentError) {
      console.error('Payment processing error:', paymentError);
      res.status(500).json({
        success: false,
        error: 'Failed to process payment after OTP verification'
      });
    }

  } catch (error) {
    console.error('Payment OTP verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get payment data by OTP key (for display purposes)
router.get('/payment-data/:otpKey', authenticateToken, async (req, res) => {
  try {
    const { otpKey } = req.params;
    const paymentData = paymentOtpService.getPaymentData(otpKey);

    if (!paymentData) {
      return res.status(404).json({
        success: false,
        error: 'Payment data not found or expired'
      });
    }

    res.json({
      success: true,
      paymentData: {
        amount: paymentData.amount,
        payment_method: paymentData.payment_method,
        booking_ref: paymentData.booking_ref
      }
    });

  } catch (error) {
    console.error('Get payment data error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
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