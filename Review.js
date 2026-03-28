const { getDatabase } = require('../config/database');

class Review {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.spot_id = data.spot_id;
    this.booking_id = data.booking_id;
    this.rating = data.rating;
    this.comment = data.comment;
    this.images = data.images;
    this.is_verified = data.is_verified;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create new review
  static async create(reviewData) {
    const db = getDatabase();
    const {
      user_id, spot_id, booking_id, rating, comment, images
    } = reviewData;

    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const [result] = await db.execute(`
      INSERT INTO reviews 
      (user_id, spot_id, booking_id, rating, comment, images)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      user_id, spot_id, booking_id, rating, comment,
      JSON.stringify(images || [])
    ]);

    // Update parking spot rating
    await Review.updateSpotRating(spot_id);

    return result.insertId;
  }

  // Find review by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT r.*, u.name as user_name, ps.name as spot_name, 
             b.booking_ref
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN parking_spots ps ON r.spot_id = ps.id
      LEFT JOIN bookings b ON r.booking_id = b.id
      WHERE r.id = ?
    `, [id]);

    if (rows.length === 0) {
      return null;
    }

    return new Review(rows[0]);
  }

  // Get reviews by spot
  static async getBySpotId(spot_id, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT r.*, u.name as user_name, b.booking_ref
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN bookings b ON r.booking_id = b.id
      WHERE r.spot_id = ?
    `;
    let params = [spot_id];

    // Apply filters
    if (filters.rating) {
      query += ' AND r.rating = ?';
      params.push(filters.rating);
    }

    if (filters.verified_only) {
      query += ' AND r.is_verified = TRUE';
    }

    if (filters.with_comments) {
      query += ' AND r.comment IS NOT NULL AND r.comment != ""';
    }

    if (filters.with_images) {
      query += ' AND JSON_LENGTH(r.images) > 0';
    }

    // Sorting
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'rating_high':
          query += ' ORDER BY r.rating DESC, r.created_at DESC';
          break;
        case 'rating_low':
          query += ' ORDER BY r.rating ASC, r.created_at DESC';
          break;
        case 'oldest':
          query += ' ORDER BY r.created_at ASC';
          break;
        default:
          query += ' ORDER BY r.created_at DESC';
      }
    } else {
      query += ' ORDER BY r.created_at DESC';
    }

    // Pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const [reviews] = await db.execute(query, params);
    return reviews.map(review => new Review(review));
  }

  // Get reviews by user
  static async getByUserId(user_id, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT r.*, ps.name as spot_name, ps.address as spot_address, 
             b.booking_ref
      FROM reviews r
      JOIN parking_spots ps ON r.spot_id = ps.id
      LEFT JOIN bookings b ON r.booking_id = b.id
      WHERE r.user_id = ?
    `;
    let params = [user_id];

    if (filters.rating) {
      query += ' AND r.rating = ?';
      params.push(filters.rating);
    }

    query += ' ORDER BY r.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const [reviews] = await db.execute(query, params);
    return reviews.map(review => new Review(review));
  }

  // Update review
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        if (key === 'images') {
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
      `UPDATE reviews SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Update spot rating if rating changed
    if (updateData.rating !== undefined) {
      await Review.updateSpotRating(this.spot_id);
    }

    // Refresh review data
    const updatedReview = await Review.findById(this.id);
    Object.assign(this, updatedReview);
  }

  // Verify review
  async verify() {
    await this.update({ is_verified: true });
  }

  // Delete review
  async delete() {
    const db = getDatabase();
    await db.execute('DELETE FROM reviews WHERE id = ?', [this.id]);
    
    // Update spot rating after deletion
    await Review.updateSpotRating(this.spot_id);
  }

  // Update parking spot rating
  static async updateSpotRating(spot_id) {
    const db = getDatabase();
    
    const [ratingData] = await db.execute(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
      FROM reviews 
      WHERE spot_id = ?
    `, [spot_id]);

    const avgRating = ratingData[0].avg_rating || 0;
    
    await db.execute(
      'UPDATE parking_spots SET rating = ? WHERE id = ?',
      [parseFloat(avgRating).toFixed(2), spot_id]
    );
  }

  // Get review statistics for a spot
  static async getSpotStatistics(spot_id) {
    const db = getDatabase();
    
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star,
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END) as verified_reviews,
        COUNT(CASE WHEN comment IS NOT NULL AND comment != '' THEN 1 END) as reviews_with_comments,
        COUNT(CASE WHEN JSON_LENGTH(images) > 0 THEN 1 END) as reviews_with_images
      FROM reviews 
      WHERE spot_id = ?
    `, [spot_id]);

    const [recentReviews] = await db.execute(`
      SELECT r.*, u.name as user_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.spot_id = ?
      ORDER BY r.created_at DESC
      LIMIT 5
    `, [spot_id]);

    return {
      ...stats[0],
      recent_reviews: recentReviews
    };
  }

  // Get overall review statistics
  static async getOverallStatistics() {
    const db = getDatabase();
    
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        COUNT(DISTINCT user_id) as unique_reviewers,
        COUNT(DISTINCT spot_id) as reviewed_spots,
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END) as verified_reviews,
        COUNT(CASE WHEN comment IS NOT NULL AND comment != '' THEN 1 END) as reviews_with_comments
      FROM reviews
    `);

    const [ratingDistribution] = await db.execute(`
      SELECT 
        rating,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM reviews)), 2) as percentage
      FROM reviews
      GROUP BY rating
      ORDER BY rating DESC
    `);

    const [topReviewedSpots] = await db.execute(`
      SELECT 
        ps.id,
        ps.name,
        ps.address,
        COUNT(r.id) as review_count,
        AVG(r.rating) as avg_rating
      FROM parking_spots ps
      JOIN reviews r ON ps.id = r.spot_id
      GROUP BY ps.id, ps.name, ps.address
      ORDER BY review_count DESC, avg_rating DESC
      LIMIT 10
    `);

    return {
      ...stats[0],
      rating_distribution: ratingDistribution,
      top_reviewed_spots: topReviewedSpots
    };
  }

  // Check if user can review a spot
  static async canUserReview(user_id, spot_id, booking_id = null) {
    const db = getDatabase();
    
    // Check if user has completed booking at this spot
    let bookingQuery = `
      SELECT COUNT(*) as booking_count
      FROM bookings 
      WHERE user_id = ? AND spot_id = ? AND status = 'completed'
    `;
    let bookingParams = [user_id, spot_id];
    
    if (booking_id) {
      bookingQuery += ' AND id = ?';
      bookingParams.push(booking_id);
    }
    
    const [bookingResult] = await db.execute(bookingQuery, bookingParams);
    
    if (bookingResult[0].booking_count === 0) {
      return { canReview: false, reason: 'No completed booking found' };
    }

    // Check if user has already reviewed this booking
    if (booking_id) {
      const [existingReview] = await db.execute(
        'SELECT COUNT(*) as review_count FROM reviews WHERE user_id = ? AND booking_id = ?',
        [user_id, booking_id]
      );
      
      if (existingReview[0].review_count > 0) {
        return { canReview: false, reason: 'Already reviewed this booking' };
      }
    }

    return { canReview: true };
  }

  // Get trending reviews (high engagement)
  static async getTrending(limit = 10) {
    const db = getDatabase();
    
    const [reviews] = await db.execute(`
      SELECT r.*, u.name as user_name, ps.name as spot_name,
             ps.address as spot_address
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN parking_spots ps ON r.spot_id = ps.id
      WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND (r.rating = 5 OR r.rating = 1)
        AND r.comment IS NOT NULL
        AND r.comment != ''
      ORDER BY 
        CASE WHEN r.rating = 1 THEN 1 ELSE 2 END,
        CHAR_LENGTH(r.comment) DESC,
        r.created_at DESC
      LIMIT ?
    `, [limit]);

    return reviews.map(review => new Review(review));
  }

  // Get reviews needing moderation
  static async getNeedingModeration() {
    const db = getDatabase();
    
    const [reviews] = await db.execute(`
      SELECT r.*, u.name as user_name, ps.name as spot_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN parking_spots ps ON r.spot_id = ps.id
      WHERE r.is_verified = FALSE
        AND (r.rating <= 2 OR CHAR_LENGTH(r.comment) > 500)
      ORDER BY r.created_at ASC
    `);

    return reviews.map(review => new Review(review));
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      images: typeof this.images === 'string' ? 
        JSON.parse(this.images) : this.images
    };
  }
}

module.exports = Review;