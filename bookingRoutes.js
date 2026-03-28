const express = require('express');
const Booking = require('../models/Booking');
const ParkingSpot = require('../models/ParkingSpot');
const User = require('../models/User');
const Notification = require('../models/Notification');
const emailService = require('../services/emailService');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Extend booking duration
router.post('/extend', authenticateToken, async (req, res) => {
  try {
    const { booking_id, extend_hours, extension_cost, new_end_time, new_total_amount } = req.body;

    if (!booking_id || !extend_hours || extend_hours <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID and valid extension hours are required'
      });
    }

    const { getDatabase } = require('../config/database');
    const db = getDatabase();

    // Get the booking details
    const [bookings] = await db.execute(`
      SELECT b.*, ps.name as spot_name, ps.car_price_per_hour, ps.bike_price_per_hour, ps.truck_price_per_hour
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE b.id = ? AND b.user_id = ?
    `, [booking_id, req.user.userId]);

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found or you do not have permission to extend it'
      });
    }

    const booking = bookings[0];

    // Check if booking can be extended (must be active)
    if (booking.status !== 'active' && booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        error: 'Only active bookings can be extended'
      });
    }

    // Calculate new end time
    const currentEndTime = new Date(`${booking.booking_date}T${booking.end_time || booking.booking_time}`);
    const newEndTime = new Date(currentEndTime.getTime() + (extend_hours * 60 * 60 * 1000));
    const newEndTimeString = newEndTime.toTimeString().slice(0, 5); // HH:MM format

    // Calculate extension cost
    const hourlyRate = booking.total_price / booking.duration;
    const calculatedExtensionCost = hourlyRate * extend_hours;
    const newTotalAmount = booking.total_price + calculatedExtensionCost;

    // Update the booking
    await db.execute(`
      UPDATE bookings 
      SET 
        duration = duration + ?,
        end_time = ?,
        total_price = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [extend_hours, newEndTimeString, newTotalAmount, booking_id]);

    // Create extension record for tracking
    await db.execute(`
      INSERT INTO booking_extensions 
      (booking_id, user_id, extend_hours, extension_cost, old_end_time, new_end_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [
      booking_id, 
      req.user.userId, 
      extend_hours, 
      calculatedExtensionCost, 
      booking.end_time || booking.booking_time, 
      newEndTimeString
    ]);

    // Get updated booking details
    const [updatedBookings] = await db.execute(`
      SELECT b.*, ps.name as spot_name
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE b.id = ?
    `, [booking_id]);

    const updatedBooking = updatedBookings[0];

    // Send email notification to user
    try {
      const emailService = require('../services/emailService');
      const User = require('../models/User');
      
      const user = await User.findById(req.user.userId);
      
      if (user && emailService) {
        await emailService.sendBookingExtensionConfirmation(user.email, {
          booking: updatedBooking,
          extension_hours: extend_hours,
          extension_cost: calculatedExtensionCost,
          new_end_time: newEndTimeString,
          new_total_amount: newTotalAmount
        });
      }
    } catch (emailError) {
      console.error('Failed to send extension confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    // Send admin notification
    try {
      const emailService = require('../services/emailService');
      
      if (emailService) {
        await emailService.sendAdminNotification('shubhamyamakar9880@gmail.com', {
          type: 'booking_extension',
          booking: updatedBooking,
          user: { name: req.user.name || 'User', email: req.user.email },
          extension_details: {
            hours: extend_hours,
            cost: calculatedExtensionCost,
            new_end_time: newEndTimeString
          }
        });
      }
    } catch (adminEmailError) {
      console.error('Failed to send admin notification:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    res.json({
      success: true,
      message: `Booking extended by ${extend_hours} hour(s) successfully`,
      booking: updatedBooking,
      extension_details: {
        extend_hours: extend_hours,
        extension_cost: calculatedExtensionCost,
        old_end_time: booking.end_time || booking.booking_time,
        new_end_time: newEndTimeString,
        new_total_amount: newTotalAmount
      }
    });

  } catch (error) {
    console.error('Extend booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Check slot availability for specific time period
router.get('/check-availability', async (req, res) => {
  try {
    const { spot_id, duration, start_time } = req.query;

    if (!spot_id || !duration) {
      return res.status(400).json({
        success: false,
        error: 'Spot ID and duration are required'
      });
    }

    const { getDatabase } = require('../config/database');
    const db = getDatabase();

    // Calculate booking time period
    const booking_start = start_time ? new Date(start_time) : new Date();
    const booking_end = new Date(booking_start.getTime() + (parseInt(duration) * 60 * 60 * 1000));

    // Check for conflicts
    const [conflictingBookings] = await db.execute(`
      SELECT b.*, 
             DATE_ADD(STR_TO_DATE(CONCAT(b.booking_date, ' ', b.booking_time), '%Y-%m-%d %H:%i:%s'), INTERVAL b.duration HOUR) as calculated_end_time,
             u.name as user_name
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.spot_id = ? 
        AND b.status IN ('active', 'confirmed', 'pending')
        AND (
          (? < DATE_ADD(STR_TO_DATE(CONCAT(b.booking_date, ' ', b.booking_time), '%Y-%m-%d %H:%i:%s'), INTERVAL b.duration HOUR))
          AND
          (? > STR_TO_DATE(CONCAT(b.booking_date, ' ', b.booking_time), '%Y-%m-%d %H:%i:%s'))
        )
      ORDER BY b.booking_time
    `, [spot_id, booking_start, booking_end]);

    if (conflictingBookings.length > 0) {
      // Slot is not available
      const conflicts = conflictingBookings.map(booking => ({
        booking_ref: booking.booking_ref,
        user_name: booking.user_name || 'Anonymous',
        vehicle_number: booking.vehicle_number,
        vehicle_type: booking.vehicle_type,
        start_time: booking.booking_time,
        end_time: new Date(booking.calculated_end_time).toLocaleString('en-IN'),
        duration: booking.duration
      }));

      // Find next available time
      const latestEndTime = Math.max(...conflictingBookings.map(b => new Date(b.calculated_end_time).getTime()));
      const nextAvailableTime = new Date(latestEndTime);

      res.json({
        success: true,
        available: false,
        conflicts: conflicts,
        next_available_time: nextAvailableTime.toLocaleString('en-IN'),
        message: `This slot is occupied until ${nextAvailableTime.toLocaleString('en-IN')}`
      });
    } else {
      // Slot is available
      res.json({
        success: true,
        available: true,
        message: 'Slot is available for the requested time period',
        booking_period: {
          start: booking_start.toLocaleString('en-IN'),
          end: booking_end.toLocaleString('en-IN'),
          duration: `${duration} hour(s)`
        }
      });
    }
  } catch (error) {
    console.error('Error checking slot availability:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get bookings by slot for visual grid
router.get('/by-slot', async (req, res) => {
  try {
    const { spot_id, date, time_slot, vehicle_type } = req.query;

    if (!spot_id || !date) {
      return res.status(400).json({
        success: false,
        error: 'Spot ID and date are required'
      });
    }

    let query = `
      SELECT 
        b.*,
        u.name as user_name,
        u.email as user_email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.spot_id = ? 
        AND b.booking_date = ?
        AND b.status IN ('active', 'confirmed')
    `;
    
    let params = [spot_id, date];

    if (time_slot) {
      query += ' AND b.booking_time = ?';
      params.push(time_slot);
    }

    if (vehicle_type) {
      query += ' AND b.vehicle_type = ?';
      params.push(vehicle_type);
    }

    query += ' ORDER BY b.booking_time, b.created_at';

    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    const [bookings] = await db.execute(query, params);

    // Generate slot numbers for bookings that don't have them
    const bookingsWithSlots = bookings.map((booking, index) => ({
      ...booking,
      slot_number: booking.slot_number || `${booking.vehicle_type.charAt(0).toUpperCase()}${(index + 1).toString().padStart(2, '0')}`
    }));

    res.json({
      success: true,
      bookings: bookingsWithSlots,
      count: bookingsWithSlots.length
    });
  } catch (error) {
    console.error('Error fetching bookings by slot:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create new booking with location verification
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      spot_id, vehicle_number, vehicle_color, vehicle_type,
      mobile_number, duration, payment_method, notes,
      user_latitude, user_longitude, confirm_booking
    } = req.body;

    // Validate required fields
    if (!spot_id || !vehicle_number || !vehicle_color || !mobile_number || !duration) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
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

    // Check location permission
    if (!user.location_permission) {
      return res.status(403).json({
        success: false,
        error: 'Location permission required for booking',
        requires_permission: true
      });
    }

    // Update user location if provided
    if (user_latitude && user_longitude) {
      await user.updateLocation(user_latitude, user_longitude);
    }

    // Verify user has recent location
    if (!user.current_latitude || !user.current_longitude || !user.isLocationRecent()) {
      return res.status(400).json({
        success: false,
        error: 'Current location required. Please enable location services and try again.',
        requires_location: true
      });
    }

    // Get parking spot details
    const spot = await ParkingSpot.findById(spot_id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    if (spot.available_spots <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No available spots' 
      });
    }

    // Calculate distance to parking spot
    const distance = calculateDistance(
      user.current_latitude, user.current_longitude,
      spot.latitude, spot.longitude
    );

    // If distance is more than 10km, require confirmation
    if (distance > 10 && !confirm_booking) {
      return res.status(400).json({
        success: false,
        error: `Parking spot is ${distance.toFixed(1)}km away from your current location. Please confirm if you want to proceed.`,
        requires_confirmation: true,
        distance_km: distance,
        spot_location: {
          name: spot.name,
          address: spot.address,
          latitude: spot.latitude,
          longitude: spot.longitude
        },
        user_location: {
          latitude: user.current_latitude,
          longitude: user.current_longitude
        }
      });
    }

    // Calculate pricing based on vehicle type
    let pricePerHour = spot.price_per_hour;
    if (vehicle_type === 'bike' && spot.bike_price_per_hour) {
      pricePerHour = spot.bike_price_per_hour;
    } else if (vehicle_type === 'truck' && spot.truck_price_per_hour) {
      pricePerHour = spot.truck_price_per_hour;
    } else if (vehicle_type === 'car' && spot.car_price_per_hour) {
      pricePerHour = spot.car_price_per_hour;
    }

    const total_price = pricePerHour * duration;
    
    // Calculate booking start and end times
    const booking_start = new Date();
    const booking_end = new Date(booking_start.getTime() + (duration * 60 * 60 * 1000));
    
    // Check for booking conflicts - prevent double booking of same slot during same time
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    const [conflictingBookings] = await db.execute(`
      SELECT b.*, 
             DATE_ADD(STR_TO_DATE(CONCAT(b.booking_date, ' ', b.booking_time), '%Y-%m-%d %H:%i:%s'), INTERVAL b.duration HOUR) as calculated_end_time
      FROM bookings b
      WHERE b.spot_id = ? 
        AND b.status IN ('active', 'confirmed', 'pending')
        AND (
          -- New booking starts before existing booking ends
          (? < DATE_ADD(STR_TO_DATE(CONCAT(b.booking_date, ' ', b.booking_time), '%Y-%m-%d %H:%i:%s'), INTERVAL b.duration HOUR))
          AND
          -- New booking ends after existing booking starts  
          (? > STR_TO_DATE(CONCAT(b.booking_date, ' ', b.booking_time), '%Y-%m-%d %H:%i:%s'))
        )
    `, [spot_id, booking_start, booking_end]);

    if (conflictingBookings.length > 0) {
      const conflictingBooking = conflictingBookings[0];
      const conflictEndTime = new Date(conflictingBooking.calculated_end_time);
      
      return res.status(409).json({
        success: false,
        error: 'This parking slot is already booked during the requested time period',
        conflict_details: {
          booking_ref: conflictingBooking.booking_ref,
          booked_until: conflictEndTime.toLocaleString('en-IN'),
          available_after: conflictEndTime.toLocaleString('en-IN'),
          current_booking_duration: conflictingBooking.duration,
          vehicle_in_slot: `${conflictingBooking.vehicle_number} (${conflictingBooking.vehicle_type})`
        },
        suggested_times: {
          earliest_available: conflictEndTime.toLocaleString('en-IN'),
          message: `This slot will be available after ${conflictEndTime.toLocaleString('en-IN')}`
        }
      });
    }

    const total_price_final = pricePerHour * duration;
    const end_time = new Date(Date.now() + (duration * 60 * 60 * 1000));

    // Create booking
    const bookingId = await Booking.create({
      user_id: req.user.userId,
      spot_id,
      vehicle_number,
      vehicle_color,
      vehicle_type: vehicle_type || 'car',
      mobile_number,
      duration,
      total_price: total_price_final,
      end_time,
      payment_method,
      notes
    });

    // Update available spots based on vehicle type
    await spot.updateAvailabilityByVehicleType(vehicle_type || 'car', -1);

    // Get booking details
    const booking = await Booking.findById(bookingId);

    // Send notification
    await Notification.sendBookingNotification(req.user.userId, {
      booking_id: bookingId,
      booking_ref: booking.booking_ref,
      spot_name: spot.name
    }, 'booking_created');

    // Send email confirmation
    if (user && user.email) {
      const bookingData = {
        ...booking.toJSON(),
        spot_name: spot.name,
        spot_address: spot.address,
        user_name: user.name,
        user_email: user.email,
        distance_km: distance.toFixed(1),
        user_location: {
          latitude: user.current_latitude,
          longitude: user.current_longitude
        }
      };
      
      const emailResult = await emailService.sendBookingConfirmation(user.email, bookingData);
      
      // Log email status
      if (emailResult.success) {
        console.log(`📧 Booking confirmation email sent to ${user.email}`);
      } else {
        console.log(`⚠️ Email not sent: ${emailResult.error}`);
      }

      // Send admin notification for new booking
      try {
        const adminEmail = 'shubhamyamakar9880@gmail.com';
        
        const userData = {
          name: user.name || user.username || user.full_name,
          email: user.email,
          phone: user.phone || user.mobile || user.contact_number || booking.mobile_number,
          created_at: user.created_at
        };

        const adminBookingData = {
          booking_ref: booking.booking_ref,
          spot_name: spot.name,
          spot_address: spot.address,
          vehicle_number: booking.vehicle_number,
          vehicle_color: booking.vehicle_color,
          vehicle_type: booking.vehicle_type,
          duration: booking.duration,
          start_time: booking.start_time,
          end_time: booking.end_time,
          booking_date: booking.created_at,
          mobile_number: booking.mobile_number
        };

        // For booking-only notification (no payment yet)
        const placeholderPaymentData = {
          amount: 0,
          payment_method: 'Pending',
          transaction_id: 'Pending',
          payment_date: 'Pending'
        };

        await emailService.sendAdminBookingPaymentNotification(
          adminEmail,
          userData,
          adminBookingData,
          placeholderPaymentData
        );

        console.log('✅ Admin booking notification sent with real user data');

      } catch (adminEmailError) {
        console.log('⚠️ Admin booking notification failed:', adminEmailError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: booking.toJSON(),
      distance_km: distance.toFixed(1),
      email_sent: user.email ? true : false
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get user bookings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      status, payment_status, from_date, to_date, limit, offset
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (payment_status) filters.payment_status = payment_status;
    if (from_date) filters.from_date = from_date;
    if (to_date) filters.to_date = to_date;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const bookings = await Booking.getByUserId(req.user.userId, filters);

    res.json({
      success: true,
      bookings: bookings.map(booking => booking.toJSON()),
      count: bookings.length
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get booking by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    // Check if user owns this booking
    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    res.json({
      success: true,
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get booking by reference
router.get('/ref/:booking_ref', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findByRef(req.params.booking_ref);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    // Check if user owns this booking
    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    res.json({
      success: true,
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Start booking (check-in)
router.patch('/:id/start', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ 
        success: false,
        error: 'Booking cannot be started' 
      });
    }

    await booking.start();

    // Send notification
    await Notification.sendBookingNotification(req.user.userId, {
      booking_id: booking.id,
      booking_ref: booking.booking_ref,
      spot_name: booking.spot_name
    }, 'booking_started');

    res.json({
      success: true,
      message: 'Booking started successfully',
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Error starting booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Complete booking (check-out)
router.patch('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({ 
        success: false,
        error: 'Booking cannot be completed' 
      });
    }

    await booking.complete();

    // Update spot availability
    const spot = await ParkingSpot.findById(booking.spot_id);
    if (spot) {
      await spot.updateAvailability(1);
    }

    // Send notification
    await Notification.sendBookingNotification(req.user.userId, {
      booking_id: booking.id,
      booking_ref: booking.booking_ref,
      spot_name: booking.spot_name
    }, 'booking_completed');

    res.json({
      success: true,
      message: 'Booking completed successfully',
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Error completing booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Cancel booking
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({ 
        success: false,
        error: 'Booking cannot be cancelled' 
      });
    }

    await booking.cancel(reason);

    // Update spot availability if booking was active
    if (booking.status === 'active') {
      const spot = await ParkingSpot.findById(booking.spot_id);
      if (spot) {
        await spot.updateAvailability(1);
      }
    }

    // Get user details for email
    const user = await User.findById(req.user.userId);

    // Send notification
    await Notification.sendBookingNotification(req.user.userId, {
      booking_id: booking.id,
      booking_ref: booking.booking_ref,
      spot_name: booking.spot_name
    }, 'booking_cancelled');

    // Send cancellation email
    if (user && user.email) {
      const bookingData = {
        ...booking.toJSON(),
        user_name: user.name,
        user_email: user.email
      };
      
      await emailService.sendBookingCancellation(user.email, bookingData);
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Extend booking
router.patch('/:id/extend', authenticateToken, async (req, res) => {
  try {
    const { additional_hours } = req.body;
    
    if (!additional_hours || additional_hours <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid additional hours required' 
      });
    }

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    if (booking.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({ 
        success: false,
        error: 'Only active bookings can be extended' 
      });
    }

    // Get spot to calculate additional price
    const spot = await ParkingSpot.findById(booking.spot_id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    const additional_price = spot.price_per_hour * additional_hours;
    await booking.extend(additional_hours, additional_price);

    res.json({
      success: true,
      message: 'Booking extended successfully',
      booking: booking.toJSON(),
      additional_price
    });
  } catch (error) {
    console.error('Error extending booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get booking statistics
router.get('/statistics/summary', authenticateToken, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    const filters = { user_id: req.user.userId };
    if (from_date) filters.from_date = from_date;
    if (to_date) filters.to_date = to_date;

    const statistics = await Booking.getStatistics(filters);

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error fetching booking statistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get active bookings (admin endpoint)
router.get('/admin/active', authenticateToken, async (req, res) => {
  try {
    // In a real app, check if user is admin
    const activeBookings = await Booking.getActive();

    res.json({
      success: true,
      bookings: activeBookings.map(booking => booking.toJSON()),
      count: activeBookings.length
    });
  } catch (error) {
    console.error('Error fetching active bookings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get expired bookings (admin endpoint)
router.get('/admin/expired', authenticateToken, async (req, res) => {
  try {
    // In a real app, check if user is admin
    const expiredBookings = await Booking.getExpired();

    res.json({
      success: true,
      bookings: expiredBookings.map(booking => booking.toJSON()),
      count: expiredBookings.length
    });
  } catch (error) {
    console.error('Error fetching expired bookings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;