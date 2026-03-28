const { getDatabase } = require('../config/database');

class Payment {
  constructor(data) {
    this.id = data.id;
    this.payment_id = data.payment_id;
    this.booking_id = data.booking_id;
    this.user_id = data.user_id;
    this.amount = data.amount;
    this.currency = data.currency;
    this.payment_method = data.payment_method;
    this.payment_gateway = data.payment_gateway;
    this.transaction_id = data.transaction_id;
    this.status = data.status;
    this.gateway_response = data.gateway_response;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Generate unique payment ID
  static generatePaymentId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 8);
    return `PAY${timestamp}${random}`.toUpperCase();
  }

  // Create new payment
  static async create(paymentData) {
    const db = getDatabase();
    const {
      booking_id, user_id, amount, currency, payment_method,
      payment_gateway, transaction_id, gateway_response
    } = paymentData;

    const payment_id = this.generatePaymentId();

    const [result] = await db.execute(`
      INSERT INTO payments 
      (payment_id, booking_id, user_id, amount, currency, payment_method, 
       payment_gateway, transaction_id, gateway_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      payment_id, booking_id, user_id, amount, currency || 'INR',
      payment_method, payment_gateway, transaction_id,
      JSON.stringify(gateway_response || {})
    ]);

    return result.insertId;
  }

  // Find payment by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT p.*, b.booking_ref, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `, [id]);

    if (rows.length === 0) {
      return null;
    }

    return new Payment(rows[0]);
  }

  // Find payment by payment_id
  static async findByPaymentId(payment_id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT p.*, b.booking_ref, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON p.user_id = u.id
      WHERE p.payment_id = ?
    `, [payment_id]);

    if (rows.length === 0) {
      return null;
    }

    return new Payment(rows[0]);
  }

  // Find payment by transaction ID
  static async findByTransactionId(transaction_id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT p.*, b.booking_ref, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON p.user_id = u.id
      WHERE p.transaction_id = ?
    `, [transaction_id]);

    if (rows.length === 0) {
      return null;
    }

    return new Payment(rows[0]);
  }

  // Get payments by user
  static async getByUserId(user_id, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT p.*, b.booking_ref
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.user_id = ?
    `;
    let params = [user_id];

    // Apply filters
    if (filters.status) {
      query += ' AND p.status = ?';
      params.push(filters.status);
    }

    if (filters.payment_method) {
      query += ' AND p.payment_method = ?';
      params.push(filters.payment_method);
    }

    if (filters.from_date) {
      query += ' AND p.created_at >= ?';
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      query += ' AND p.created_at <= ?';
      params.push(filters.to_date);
    }

    query += ' ORDER BY p.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const [payments] = await db.execute(query, params);
    return payments.map(payment => new Payment(payment));
  }

  // Get payments by booking
  static async getByBookingId(booking_id) {
    const db = getDatabase();
    const [payments] = await db.execute(`
      SELECT p.*, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.booking_id = ?
      ORDER BY p.created_at DESC
    `, [booking_id]);

    return payments.map(payment => new Payment(payment));
  }

  // Update payment
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        if (key === 'gateway_response') {
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
      `UPDATE payments SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Refresh payment data
    const updatedPayment = await Payment.findById(this.id);
    Object.assign(this, updatedPayment);
  }

  // Process payment
  async process(gateway_response = {}) {
    await this.update({
      status: 'processing',
      gateway_response
    });
  }

  // Complete payment
  async complete(transaction_id, gateway_response = {}) {
    await this.update({
      status: 'completed',
      transaction_id,
      gateway_response
    });
  }

  // Fail payment
  async fail(gateway_response = {}) {
    await this.update({
      status: 'failed',
      gateway_response
    });
  }

  // Cancel payment
  async cancel(gateway_response = {}) {
    await this.update({
      status: 'cancelled',
      gateway_response
    });
  }

  // Refund payment
  async refund(refund_amount = null, gateway_response = {}) {
    const amount = refund_amount || this.amount;
    await this.update({
      status: 'refunded',
      amount: -Math.abs(amount), // Negative amount for refund
      gateway_response
    });
  }

  // Get payment statistics
  static async getStatistics(filters = {}) {
    const db = getDatabase();
    let whereClause = 'WHERE 1=1';
    let params = [];

    if (filters.user_id) {
      whereClause += ' AND user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.from_date) {
      whereClause += ' AND created_at >= ?';
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      whereClause += ' AND created_at <= ?';
      params.push(filters.to_date);
    }

    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = 'refunded' THEN ABS(amount) ELSE 0 END) as total_refunds,
        AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END) as avg_payment_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments
      FROM payments ${whereClause}
    `, params);

    const [methodStats] = await db.execute(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as revenue
      FROM payments ${whereClause}
      GROUP BY payment_method
      ORDER BY revenue DESC
    `, params);

    const [dailyStats] = await db.execute(`
      SELECT 
        DATE(created_at) as payment_date,
        COUNT(*) as transaction_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as daily_revenue
      FROM payments ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY payment_date DESC
      LIMIT 30
    `, params);

    return {
      ...stats[0],
      by_method: methodStats,
      daily_stats: dailyStats
    };
  }

  // Get pending payments
  static async getPending() {
    const db = getDatabase();
    const [payments] = await db.execute(`
      SELECT p.*, b.booking_ref, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at ASC
    `);

    return payments.map(payment => new Payment(payment));
  }

  // Get failed payments
  static async getFailed() {
    const db = getDatabase();
    const [payments] = await db.execute(`
      SELECT p.*, b.booking_ref, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'failed'
      ORDER BY p.created_at DESC
    `);

    return payments.map(payment => new Payment(payment));
  }

  // Simulate payment processing (for demo)
  static async simulatePayment(payment_id, success_rate = 0.9) {
    const payment = await Payment.findByPaymentId(payment_id);
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const isSuccess = Math.random() < success_rate;
    const transaction_id = `TXN${Date.now()}${Math.random().toString(36).substr(2, 6)}`.toUpperCase();
    
    const gateway_response = {
      gateway: 'demo_gateway',
      transaction_id,
      timestamp: new Date().toISOString(),
      success: isSuccess,
      message: isSuccess ? 'Payment processed successfully' : 'Payment failed - insufficient funds'
    };

    if (isSuccess) {
      await payment.complete(transaction_id, gateway_response);
    } else {
      await payment.fail(gateway_response);
    }

    return payment;
  }

  // Calculate processing fee
  calculateProcessingFee() {
    const feeRates = {
      'credit_card': 0.029, // 2.9%
      'debit_card': 0.019,  // 1.9%
      'upi': 0.005,         // 0.5%
      'wallet': 0.015,      // 1.5%
      'net_banking': 0.012, // 1.2%
      'cash': 0             // 0%
    };

    const rate = feeRates[this.payment_method] || 0.025; // Default 2.5%
    return (this.amount * rate).toFixed(2);
  }

  // Check if payment is expired
  isExpired() {
    if (this.status !== 'pending') return false;
    const createdAt = new Date(this.created_at);
    const expiryTime = new Date(createdAt.getTime() + 15 * 60 * 1000); // 15 minutes
    return new Date() > expiryTime;
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      gateway_response: typeof this.gateway_response === 'string' ? 
        JSON.parse(this.gateway_response) : this.gateway_response,
      processing_fee: this.calculateProcessingFee(),
      is_expired: this.isExpired()
    };
  }
}

module.exports = Payment;