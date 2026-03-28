const { getDatabase } = require('../config/database');

class Notification {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.title = data.title;
    this.message = data.message;
    this.type = data.type;
    this.is_read = data.is_read;
    this.action_url = data.action_url;
    this.metadata = data.metadata;
    this.created_at = data.created_at;
  }

  // Create new notification
  static async create(notificationData) {
    const db = getDatabase();
    const {
      user_id, title, message, type, action_url, metadata
    } = notificationData;

    const [result] = await db.execute(`
      INSERT INTO notifications 
      (user_id, title, message, type, action_url, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      user_id, title, message, type || 'info', action_url,
      JSON.stringify(metadata || {})
    ]);

    return result.insertId;
  }

  // Find notification by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT n.*, u.name as user_name, u.email as user_email
      FROM notifications n
      JOIN users u ON n.user_id = u.id
      WHERE n.id = ?
    `, [id]);

    if (rows.length === 0) {
      return null;
    }

    return new Notification(rows[0]);
  }

  // Get notifications by user
  static async getByUserId(user_id, filters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    let params = [user_id];

    // Apply filters
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.unread_only) {
      query += ' AND is_read = FALSE';
    }

    if (filters.read_only) {
      query += ' AND is_read = TRUE';
    }

    query += ' ORDER BY created_at DESC';

    // Pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const [notifications] = await db.execute(query, params);
    return notifications.map(notification => new Notification(notification));
  }

  // Update notification
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        if (key === 'metadata') {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updateData[key]));
        } else {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(this.id);

    await db.execute(
      `UPDATE notifications SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Refresh notification data
    const updatedNotification = await Notification.findById(this.id);
    Object.assign(this, updatedNotification);
  }

  // Mark as read
  async markAsRead() {
    await this.update({ is_read: true });
  }

  // Mark as unread
  async markAsUnread() {
    await this.update({ is_read: false });
  }

  // Delete notification
  async delete() {
    const db = getDatabase();
    await db.execute('DELETE FROM notifications WHERE id = ?', [this.id]);
  }

  // Bulk create notifications
  static async bulkCreate(notifications) {
    const db = getDatabase();
    const values = [];
    const placeholders = [];

    notifications.forEach(notification => {
      placeholders.push('(?, ?, ?, ?, ?, ?)');
      values.push(
        notification.user_id,
        notification.title,
        notification.message,
        notification.type || 'info',
        notification.action_url || null,
        JSON.stringify(notification.metadata || {})
      );
    });

    if (placeholders.length === 0) return [];

    const query = `
      INSERT INTO notifications 
      (user_id, title, message, type, action_url, metadata)
      VALUES ${placeholders.join(', ')}
    `;

    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Mark all as read for user
  static async markAllAsRead(user_id) {
    const db = getDatabase();
    await db.execute(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [user_id]
    );
  }

  // Delete all read notifications for user
  static async deleteAllRead(user_id) {
    const db = getDatabase();
    const [result] = await db.execute(
      'DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE',
      [user_id]
    );
    return result.affectedRows;
  }

  // Get notification statistics for user
  static async getUserStatistics(user_id) {
    const db = getDatabase();
    
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread_count,
        COUNT(CASE WHEN is_read = TRUE THEN 1 END) as read_count,
        COUNT(CASE WHEN type = 'booking' THEN 1 END) as booking_notifications,
        COUNT(CASE WHEN type = 'payment' THEN 1 END) as payment_notifications,
        COUNT(CASE WHEN type = 'system' THEN 1 END) as system_notifications
      FROM notifications 
      WHERE user_id = ?
    `, [user_id]);

    return stats[0];
  }

  // Send booking notification
  static async sendBookingNotification(user_id, booking_data, type = 'booking_created') {
    const notifications = {
      booking_created: {
        title: 'Booking Confirmed',
        message: `Your parking booking at ${booking_data.spot_name} has been confirmed. Booking ID: ${booking_data.booking_ref}`,
        action_url: `/bookings/${booking_data.booking_id}`
      },
      booking_started: {
        title: 'Parking Started',
        message: `Your parking session at ${booking_data.spot_name} has started. Enjoy your stay!`,
        action_url: `/bookings/${booking_data.booking_id}`
      },
      booking_ending_soon: {
        title: 'Parking Ending Soon',
        message: `Your parking at ${booking_data.spot_name} will end in 15 minutes. Consider extending if needed.`,
        action_url: `/bookings/${booking_data.booking_id}/extend`
      },
      booking_expired: {
        title: 'Parking Expired',
        message: `Your parking session at ${booking_data.spot_name} has expired. Please move your vehicle to avoid penalties.`,
        action_url: `/bookings/${booking_data.booking_id}`
      },
      booking_completed: {
        title: 'Parking Completed',
        message: `Your parking session at ${booking_data.spot_name} has been completed. Thank you for using our service!`,
        action_url: `/bookings/${booking_data.booking_id}`
      },
      booking_cancelled: {
        title: 'Booking Cancelled',
        message: `Your parking booking at ${booking_data.spot_name} has been cancelled. Refund will be processed if applicable.`,
        action_url: `/bookings/${booking_data.booking_id}`
      }
    };

    const notification = notifications[type];
    if (!notification) {
      throw new Error(`Unknown booking notification type: ${type}`);
    }

    return await Notification.create({
      user_id,
      title: notification.title,
      message: notification.message,
      type: 'booking',
      action_url: notification.action_url,
      metadata: { booking_id: booking_data.booking_id, type }
    });
  }

  // Send payment notification
  static async sendPaymentNotification(user_id, payment_data, type = 'payment_completed') {
    const notifications = {
      payment_pending: {
        title: 'Payment Pending',
        message: `Your payment of ₹${payment_data.amount} is being processed. You will be notified once completed.`,
        action_url: `/payments/${payment_data.payment_id}`
      },
      payment_completed: {
        title: 'Payment Successful',
        message: `Your payment of ₹${payment_data.amount} has been processed successfully. Transaction ID: ${payment_data.transaction_id}`,
        action_url: `/payments/${payment_data.payment_id}`
      },
      payment_failed: {
        title: 'Payment Failed',
        message: `Your payment of ₹${payment_data.amount} could not be processed. Please try again or use a different payment method.`,
        action_url: `/payments/${payment_data.payment_id}/retry`
      },
      payment_refunded: {
        title: 'Refund Processed',
        message: `A refund of ₹${Math.abs(payment_data.amount)} has been processed to your account. It may take 3-5 business days to reflect.`,
        action_url: `/payments/${payment_data.payment_id}`
      }
    };

    const notification = notifications[type];
    if (!notification) {
      throw new Error(`Unknown payment notification type: ${type}`);
    }

    return await Notification.create({
      user_id,
      title: notification.title,
      message: notification.message,
      type: 'payment',
      action_url: notification.action_url,
      metadata: { payment_id: payment_data.payment_id, type }
    });
  }

  // Send system notification
  static async sendSystemNotification(user_id, title, message, metadata = {}) {
    return await Notification.create({
      user_id,
      title,
      message,
      type: 'system',
      metadata
    });
  }

  // Send promotional notification
  static async sendPromotionalNotification(user_id, title, message, action_url = null, metadata = {}) {
    return await Notification.create({
      user_id,
      title,
      message,
      type: 'info',
      action_url,
      metadata: { ...metadata, promotional: true }
    });
  }

  // Broadcast notification to all users
  static async broadcast(title, message, type = 'system', filters = {}) {
    const db = getDatabase();
    let userQuery = 'SELECT id FROM users WHERE 1=1';
    let params = [];

    // Apply user filters
    if (filters.verified_only) {
      userQuery += ' AND is_verified = TRUE';
    }

    if (filters.active_users_only) {
      userQuery += ' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    const [users] = await db.execute(userQuery, params);
    
    const notifications = users.map(user => ({
      user_id: user.id,
      title,
      message,
      type,
      metadata: { broadcast: true, ...filters }
    }));

    return await Notification.bulkCreate(notifications);
  }

  // Clean up old notifications
  static async cleanup(days = 30) {
    const db = getDatabase();
    
    // Delete read notifications older than specified days
    const [result] = await db.execute(`
      DELETE FROM notifications 
      WHERE is_read = TRUE 
        AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);

    return result.affectedRows;
  }

  // Get notification statistics
  static async getStatistics() {
    const db = getDatabase();
    
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread_notifications,
        COUNT(CASE WHEN type = 'booking' THEN 1 END) as booking_notifications,
        COUNT(CASE WHEN type = 'payment' THEN 1 END) as payment_notifications,
        COUNT(CASE WHEN type = 'system' THEN 1 END) as system_notifications,
        COUNT(CASE WHEN type = 'info' THEN 1 END) as info_notifications,
        COUNT(DISTINCT user_id) as users_with_notifications
      FROM notifications
    `);

    const [dailyStats] = await db.execute(`
      SELECT 
        DATE(created_at) as notification_date,
        COUNT(*) as count,
        type
      FROM notifications
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at), type
      ORDER BY notification_date DESC, type
    `);

    return {
      ...stats[0],
      daily_stats: dailyStats
    };
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      metadata: typeof this.metadata === 'string' ? 
        JSON.parse(this.metadata) : this.metadata
    };
  }
}

module.exports = Notification;