const { getDatabase } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
    this.password = data.password;
    this.phone = data.phone;
    this.avatar = data.avatar;
    this.role = data.role;
    this.is_active = data.is_active;
    this.current_latitude = data.current_latitude;
    this.current_longitude = data.current_longitude;
    this.location_updated_at = data.location_updated_at;
    this.location_permission = data.location_permission;
    this.location_permission_status = data.location_permission_status;
    this.location_requested_at = data.location_requested_at;
    this.admin_approved_by = data.admin_approved_by;
    this.admin_approved_at = data.admin_approved_at;
    this.is_verified = data.is_verified || false;
    this.email_verified_at = data.email_verified_at;
    this.email_verification_token = data.email_verification_token;
    this.email_verification_expires = data.email_verification_expires;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new user
  static async create(userData) {
    const db = getDatabase();
    const { name, email, password, phone, is_verified, email_verified_at } = userData;

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate email verification token (only if not already verified)
    let verificationToken = null;
    let verificationExpires = null;
    
    if (!is_verified) {
      const crypto = require('crypto');
      verificationToken = crypto.randomBytes(32).toString('hex');
      verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    const [result] = await db.execute(
      `INSERT INTO users (name, email, password, phone, is_verified, email_verified_at, email_verification_token, email_verification_expires) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        email, 
        hashedPassword, 
        phone, 
        is_verified || false,
        email_verified_at || null,
        verificationToken, 
        verificationExpires
      ]
    );

    return result.insertId;
  }

  // Find user by email
  static async findByEmail(email) {
    const db = getDatabase();
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return null;
    }

    return new User(rows[0]);
  }

  // Find user by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return new User(rows[0]);
  }

  // Verify password
  async verifyPassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  // Update user
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    // Build dynamic update query
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
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Refresh user data
    const updatedUser = await User.findById(this.id);
    Object.assign(this, updatedUser);
  }

  // Change password
  async changePassword(newPassword) {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    await this.update({ password: hashedPassword });
  }

  // Get user statistics
  async getStatistics() {
    const db = getDatabase();
    
    const [bookingStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        SUM(total_price) as total_spent,
        SUM(duration) as total_hours,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings
      FROM bookings 
      WHERE user_id = ?
    `, [this.id]);

    const [recentBookings] = await db.execute(`
      SELECT b.*, ps.name as spot_name, ps.address as spot_address
      FROM bookings b
      JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT 5
    `, [this.id]);

    return {
      ...bookingStats[0],
      recent_bookings: recentBookings
    };
  }

  // Get user notifications
  async getNotifications(limit = 10, offset = 0) {
    const db = getDatabase();
    
    const [notifications] = await db.execute(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [this.id, limit, offset]);

    return notifications;
  }

  // Mark notification as read
  async markNotificationRead(notificationId) {
    const db = getDatabase();
    
    await db.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [notificationId, this.id]
    );
  }

  // Get all users (admin function)
  static async getAll(limit = 50, offset = 0, search = '') {
    const db = getDatabase();
    let query = 'SELECT id, name, email, phone, is_verified, created_at FROM users';
    let params = [];

    if (search) {
      query += ' WHERE name LIKE ? OR email LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [users] = await db.execute(query, params);
    return users;
  }

  // Delete user
  async delete() {
    const db = getDatabase();
    await db.execute('DELETE FROM users WHERE id = ?', [this.id]);
  }

  // Update user location
  async updateLocation(latitude, longitude) {
    const db = getDatabase();
    
    await db.execute(
      'UPDATE users SET current_latitude = ?, current_longitude = ?, location_updated_at = NOW() WHERE id = ?',
      [latitude, longitude, this.id]
    );
    
    this.current_latitude = latitude;
    this.current_longitude = longitude;
    this.location_updated_at = new Date();
  }

  // Set location permission
  async setLocationPermission(permission) {
    const db = getDatabase();
    
    await db.execute(
      'UPDATE users SET location_permission = ? WHERE id = ?',
      [permission, this.id]
    );
    
    this.location_permission = permission;
  }

  // Get nearby parking spots
  async getNearbyParkingSpots(radiusKm = 5, limit = 10) {
    if (!this.current_latitude || !this.current_longitude) {
      throw new Error('User location not available');
    }

    const db = getDatabase();
    
    // Using Haversine formula to calculate distance
    const [spots] = await db.execute(`
      SELECT *,
        (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(latitude)))) AS distance
      FROM parking_spots
      HAVING distance < ?
      ORDER BY distance ASC
      LIMIT ?
    `, [this.current_latitude, this.current_longitude, this.current_latitude, radiusKm, limit]);

    return spots;
  }

  // Check if location is recent (within last 10 minutes)
  isLocationRecent() {
    if (!this.location_updated_at) return false;
    
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return new Date(this.location_updated_at) > tenMinutesAgo;
  }

  // Convert to JSON (exclude sensitive data)
  toJSON() {
    const { password, email_verification_token, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }

  // Generate new email verification token
  async generateEmailVerificationToken() {
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.update({
      email_verification_token: verificationToken,
      email_verification_expires: verificationExpires
    });

    return verificationToken;
  }

  // Verify email with token
  static async verifyEmail(token) {
    const db = getDatabase();
    const [rows] = await db.execute(
      `SELECT * FROM users WHERE email_verification_token = ? AND email_verification_expires > NOW()`,
      [token]
    );

    if (rows.length === 0) {
      return null;
    }

    const user = new User(rows[0]);
    
    // Mark user as verified and clear verification token
    await user.update({
      is_verified: true,
      email_verification_token: null,
      email_verification_expires: null
    });

    return user;
  }

  // Find user by verification token
  static async findByVerificationToken(token) {
    const db = getDatabase();
    const [rows] = await db.execute(
      `SELECT * FROM users WHERE email_verification_token = ? AND email_verification_expires > NOW()`,
      [token]
    );

    if (rows.length === 0) {
      return null;
    }

    return new User(rows[0]);
  }

  // Resend verification email
  async resendVerificationEmail() {
    if (this.is_verified) {
      throw new Error('Email is already verified');
    }

    const token = await this.generateEmailVerificationToken();
    return token;
  }
}

module.exports = User;