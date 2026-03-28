const { getDatabase } = require('../config/database');

class Booking {
  constructor(data) {
    this.id = data.id;
    this.booking_ref = data.booking_ref;
    this.user_id = data.user_id;
    this.spot_id = data.spot_id;
    this.vehicle_number = data.vehicle_number;
    this.vehicle_color = data.vehicle_color;
    this.vehicle_type = data.vehicle_type;
    this.mobile_number = data.mobile_number;
    this.duration = data.duration;
    this.total_price = data.total_price;
    this.booking_time = data.booking_time;
    this.start_time = data.start_time;
    this.end_time = data.end_time;
    this.actual_end_time = data.actual_end_time;
    this.status = data.status;
    this.payment_status = data.payment_status;
    this.payment_method = data.payment_method;
    this.notes = data.notes;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Generate unique booking reference
  static generateBookingRef() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `EZY${timestamp}${random}`.toUpperCase();
  }

  // Create new booking
  static async create(bookingData) {
    const db = getDatabase();
    const {
      user_id, spot_id, vehicle_number, vehicle_color, vehicle_type,
      mobile_number, duration, total_price, end_time, payment_method, notes
    } = bookingData;

    const booking_ref = this.generateBookingRef();

    const [result] = await db.execute(`
      INSERT INTO bookings 
      (booking_ref, user_id, spot_id, vehicle_number, vehicle_color, vehicle_type, 
       mobile_number, duration, total_price, end_time, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      booking_ref, user_id, spot_id, vehicle_number, vehicle_color, vehicle_type,
      mobile_number, duration, total_price, end_time, payment_method, notes
    ]);

    return result.insertId;
  }

  // Find booking by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT b.*, ps.name as spot_name, ps.address as spot_address, 
             u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN parking_spots ps ON b.spot_id = ps.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [id]);

    if (rows.length === 0) {
      return null;
    }

    return new Booking(rows[0]);
  }

  // Find booking by reference
  static async findByRef(booking_ref) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT b.*, ps.name as spot_name, ps.address as spot_address, 
             u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN parking_spots ps ON b.spot_id = ps.id
      JOIN users u ON b.user_id = u.id
      WHERE b.booking_ref = ?
    `, [booking_ref]);

    if (rows.length === 0) {
      return null;
    }

    return new Booking(rows[0]);
  }

  // Get user bookings
  static async getByUserId(user_id, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT b.*, ps.name as spot_name, ps.address as spot_address
      FROM bookings b
      JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE b.user_id = ?
    `;
    let params = [user_id];

    // Apply filters
    if (filters.status) {
      query += ' AND b.status = ?';
      params.push(filters.status);
    }

    if (filters.payment_status) {
      query += ' AND b.payment_status = ?';
      params.push(filters.payment_status);
    }

    if (filters.from_date) {
      query += ' AND b.booking_time >= ?';
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      query += ' AND b.booking_time <= ?';
      params.push(filters.to_date);
    }

    query += ' ORDER BY b.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const [bookings] = await db.execute(query, params);
    return bookings.map(booking => new Booking(booking));
  }

  // Get spot bookings
  static async getBySpotId(spot_id, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT b.*, u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.spot_id = ?
    `;
    let params = [spot_id];

    if (filters.status) {
      query += ' AND b.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY b.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const [bookings] = await db.execute(query, params);
    return bookings.map(booking => new Booking(booking));
  }

  // Update booking
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(this.id);

    await db.execute(
      `UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Refresh booking data
    const updatedBooking = await Booking.findById(this.id);
    Object.assign(this, updatedBooking);
  }

  // Start booking (check-in)
  async start() {
    await this.update({
      status: 'active',
      start_time: new Date()
    });
  }

  // Complete booking (check-out)
  async complete() {
    await this.update({
      status: 'completed',
      actual_end_time: new Date()
    });
  }

  // Cancel booking
  async cancel(reason = null) {
    await this.update({
      status: 'cancelled',
      notes: reason ? `${this.notes || ''}\nCancellation reason: ${reason}` : this.notes
    });
  }

  // Extend booking
  async extend(additionalHours, additionalPrice) {
    const newEndTime = new Date(this.end_time.getTime() + (additionalHours * 60 * 60 * 1000));
    const newTotalPrice = parseFloat(this.total_price) + parseFloat(additionalPrice);
    const newDuration = this.duration + additionalHours;

    await this.update({
      duration: newDuration,
      total_price: newTotalPrice,
      end_time: newEndTime
    });
  }

  // Get booking statistics
  static async getStatistics(filters = {}) {
    const db = getDatabase();
    let whereClause = '';
    let params = [];

    if (filters.user_id) {
      whereClause = 'WHERE user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.spot_id) {
      whereClause = whereClause ? `${whereClause} AND spot_id = ?` : 'WHERE spot_id = ?';
      params.push(filters.spot_id);
    }

    if (filters.from_date) {
      whereClause = whereClause ? `${whereClause} AND booking_time >= ?` : 'WHERE booking_time >= ?';
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      whereClause = whereClause ? `${whereClause} AND booking_time <= ?` : 'WHERE booking_time <= ?';
      params.push(filters.to_date);
    }

    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        SUM(total_price) as total_revenue,
        AVG(total_price) as avg_booking_value,
        SUM(duration) as total_hours,
        AVG(duration) as avg_duration,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_bookings,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payments
      FROM bookings ${whereClause}
    `, params);

    return stats[0];
  }

  // Get active bookings
  static async getActive() {
    const db = getDatabase();
    const [bookings] = await db.execute(`
      SELECT b.*, ps.name as spot_name, ps.address as spot_address, 
             u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN parking_spots ps ON b.spot_id = ps.id
      JOIN users u ON b.user_id = u.id
      WHERE b.status = 'active'
      ORDER BY b.end_time ASC
    `);

    return bookings.map(booking => new Booking(booking));
  }

  // Get expired bookings
  static async getExpired() {
    const db = getDatabase();
    const [bookings] = await db.execute(`
      SELECT b.*, ps.name as spot_name, ps.address as spot_address, 
             u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN parking_spots ps ON b.spot_id = ps.id
      JOIN users u ON b.user_id = u.id
      WHERE b.status = 'active' AND b.end_time < NOW()
      ORDER BY b.end_time ASC
    `);

    return bookings.map(booking => new Booking(booking));
  }

  // Check if booking is expired
  isExpired() {
    return this.status === 'active' && new Date() > new Date(this.end_time);
  }

  // Get remaining time
  getRemainingTime() {
    if (this.status !== 'active') return 0;
    const now = new Date();
    const endTime = new Date(this.end_time);
    return Math.max(0, Math.floor((endTime - now) / (1000 * 60))); // minutes
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      remaining_time: this.getRemainingTime(),
      is_expired: this.isExpired()
    };
  }
}

module.exports = Booking;