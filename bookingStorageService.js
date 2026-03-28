const mysql = require('mysql2/promise');
const config = require('../config/database');

class BookingStorageService {
  constructor() {
    this.connection = null;
  }

  async getConnection() {
    if (!this.connection) {
      this.connection = await mysql.createConnection(config);
    }
    return this.connection;
  }

  // Generate unique booking reference
  generateBookingRef() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `EZY${year}${month}${day}${random}`;
  }

  // Create complete booking with all related records
  async createCompleteBooking(bookingData) {
    const connection = await this.getConnection();
    
    try {
      console.log('🔄 Starting booking creation transaction...');
      await connection.beginTransaction();

      // Generate unique booking reference
      const bookingRef = this.generateBookingRef();
      console.log(`📋 Generated booking reference: ${bookingRef}`);

      // 1. Insert main booking record
      const insertBookingQuery = `
        INSERT INTO bookings (
          booking_ref, user_id, spot_id, vehicle_number, vehicle_color, 
          vehicle_type, mobile_number, duration, total_price, 
          booking_time, start_time, end_time, status, payment_status, 
          payment_method, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'active', 'paid', ?, NOW(), NOW())
      `;

      const startDateTime = `${bookingData.booking_date} ${bookingData.from_time}`;
      const endDateTime = `${bookingData.booking_date} ${bookingData.to_time}`;

      console.log(`📅 Booking time range: ${startDateTime} to ${endDateTime}`);

      const [bookingResult] = await connection.execute(insertBookingQuery, [
        bookingRef,
        bookingData.user_id,
        bookingData.spot_id,
        bookingData.vehicle_number,
        bookingData.vehicle_color,
        bookingData.vehicle_type,
        bookingData.mobile_number,
        bookingData.duration,
        bookingData.amount,
        startDateTime,
        endDateTime,
        bookingData.payment_method
      ]);

      const bookingId = bookingResult.insertId;
      console.log(`✅ Main booking record created with ID: ${bookingId}`);

      // 2. Insert payment record
      const paymentId = `PAY_${bookingRef}`;
      const transactionId = `TXN_${Date.now()}`;
      
      const insertPaymentQuery = `
        INSERT INTO payments (
          payment_id, booking_id, user_id, amount, currency,
          payment_method, status, transaction_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'INR', ?, 'completed', ?, NOW(), NOW())
      `;

      await connection.execute(insertPaymentQuery, [
        paymentId,
        bookingId,
        bookingData.user_id,
        bookingData.amount,
        bookingData.payment_method,
        transactionId
      ]);

      console.log(`💳 Payment record created: ${paymentId}`);

      // 3. Insert slot bookings for each selected slot
      if (bookingData.selected_slots && bookingData.selected_slots.length > 0) {
        console.log(`🎯 Processing ${bookingData.selected_slots.length} selected slots...`);
        
        const insertSlotBookingQuery = `
          INSERT INTO slot_bookings (
            booking_id, slot_id, user_id, spot_id, slot_number,
            booking_date, start_time, end_time, duration, amount,
            status, vehicle_number, vehicle_type, vehicle_color,
            mobile_number, payment_status, payment_method,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, 'paid', ?, NOW(), NOW())
        `;

        const amountPerSlot = bookingData.amount / bookingData.selected_slots.length;

        for (const slot of bookingData.selected_slots) {
          console.log(`   📍 Processing slot: ${slot.slot_number} (ID: ${slot.id})`);
          
          await connection.execute(insertSlotBookingQuery, [
            bookingId,
            slot.id,
            bookingData.user_id,
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

          // Update slot status
          await connection.execute(
            'UPDATE parking_slots SET status = "booked", last_booking_id = ?, last_occupied_at = NOW() WHERE id = ?',
            [bookingId, slot.id]
          );
          
          console.log(`   ✅ Slot ${slot.slot_number} booked and updated`);
        }
      } else {
        console.log('⚠️ No selected slots provided in booking data');
      }

      // 4. Create user notification
      const userMessage = `Your booking ${bookingRef} has been confirmed for ${bookingData.booking_date} from ${bookingData.from_time} to ${bookingData.to_time}. Vehicle: ${bookingData.vehicle_number}. Amount: ₹${bookingData.amount}`;
      
      await connection.execute(
        'INSERT INTO notifications (user_id, title, message, type, is_read, created_at) VALUES (?, "Booking Confirmed", ?, "booking", 0, NOW())',
        [bookingData.user_id, userMessage]
      );

      console.log('📧 User notification created');

      // 5. Create admin notifications
      const [adminUsers] = await connection.execute(
        "SELECT id FROM users WHERE role IN ('admin', 'super_admin')"
      );

      for (const admin of adminUsers) {
        const adminMessage = `New booking ${bookingRef} created by user ID ${bookingData.user_id}. Vehicle: ${bookingData.vehicle_number} (${bookingData.vehicle_color} ${bookingData.vehicle_type}). Amount: ₹${bookingData.amount}. Date: ${bookingData.booking_date} ${bookingData.from_time}-${bookingData.to_time}`;
        
        await connection.execute(
          'INSERT INTO notifications (user_id, title, message, type, is_read, created_at) VALUES (?, "New Booking Created", ?, "booking", 0, NOW())',
          [admin.id, adminMessage]
        );
      }

      console.log(`📧 Admin notifications created for ${adminUsers.length} admin(s)`);

      await connection.commit();
      console.log('✅ Transaction committed successfully');

      return {
        success: true,
        booking_id: bookingId,
        booking_ref: bookingRef,
        payment_id: paymentId,
        transaction_id: transactionId,
        message: 'Booking created successfully'
      };

    } catch (error) {
      console.error('❌ Booking creation error:', error);
      await connection.rollback();
      console.log('🔄 Transaction rolled back');
      
      return {
        success: false,
        error: error.message || 'Database error during booking creation'
      };
    }
  }

  // Get user booking history
  async getUserBookings(userId) {
    const connection = await this.getConnection();
    
    const [bookings] = await connection.execute(`
      SELECT 
        b.id,
        b.booking_ref,
        b.vehicle_number,
        b.vehicle_color,
        b.vehicle_type,
        b.total_price,
        b.status,
        b.payment_status,
        b.start_time,
        b.end_time,
        b.duration,
        b.created_at,
        ps.name as spot_name,
        ps.address as spot_address,
        p.payment_id,
        p.transaction_id
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [userId]);

    return bookings;
  }

  // Get booking details by reference
  async getBookingByRef(bookingRef) {
    const connection = await this.getConnection();
    
    const [bookings] = await connection.execute(`
      SELECT 
        b.*,
        ps.name as spot_name,
        ps.address as spot_address,
        u.name as user_name,
        u.email as user_email,
        p.payment_id,
        p.transaction_id,
        p.status as payment_status_detail
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.booking_ref = ?
    `, [bookingRef]);

    if (bookings.length > 0) {
      // Get slot bookings for this booking
      const [slotBookings] = await connection.execute(`
        SELECT sb.*, ps.slot_number
        FROM slot_bookings sb
        LEFT JOIN parking_slots ps ON sb.slot_id = ps.id
        WHERE sb.booking_id = ?
      `, [bookings[0].id]);

      return {
        ...bookings[0],
        slot_bookings: slotBookings
      };
    }

    return null;
  }

  // Update booking status
  async updateBookingStatus(bookingId, status) {
    const connection = await this.getConnection();
    
    await connection.execute(
      'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, bookingId]
    );

    return { success: true, message: 'Booking status updated' };
  }

  // Get booking statistics
  async getBookingStats() {
    const connection = await this.getConnection();
    
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        SUM(total_price) as total_revenue,
        AVG(total_price) as avg_booking_value,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_bookings
      FROM bookings
    `);

    return stats[0];
  }

  // Close connection
  async close() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }
}

module.exports = new BookingStorageService();