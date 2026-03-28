const { getDatabase } = require('../config/database');

class ParkingSpot {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.address = data.address;
    this.latitude = data.latitude;
    this.longitude = data.longitude;
    this.total_spots = data.total_spots;
    this.available_spots = data.available_spots;
    this.price_per_hour = data.price_per_hour;
    
    // Vehicle-specific spots and pricing
    this.car_spots = data.car_spots || 0;
    this.available_car_spots = data.available_car_spots || 0;
    this.bike_spots = data.bike_spots || 0;
    this.available_bike_spots = data.available_bike_spots || 0;
    this.truck_spots = data.truck_spots || 0;
    this.available_truck_spots = data.available_truck_spots || 0;
    this.car_price_per_hour = data.car_price_per_hour || data.price_per_hour;
    this.bike_price_per_hour = data.bike_price_per_hour || data.price_per_hour;
    this.truck_price_per_hour = data.truck_price_per_hour || data.price_per_hour;
    
    this.features = data.features;
    this.images = data.images;
    this.rating = data.rating || 4.0;
    this.is_active = data.is_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Get all parking spots
  static async getAll(filters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM parking_spots WHERE is_active = TRUE';
    let params = [];

    // Exclude expired spots for regular users (admin can see all)
    if (filters.excludeExpired) {
      query += ' AND (is_expired = FALSE OR is_expired IS NULL) AND (expires_at IS NULL OR expires_at > NOW())';
    }

    // Apply filters
    if (filters.minPrice) {
      query += ' AND price_per_hour >= ?';
      params.push(filters.minPrice);
    }

    if (filters.maxPrice) {
      query += ' AND price_per_hour <= ?';
      params.push(filters.maxPrice);
    }

    if (filters.availableOnly) {
      query += ' AND available_spots > 0';
    }

    if (filters.features && filters.features.length > 0) {
      const featureConditions = filters.features.map(() => 'JSON_CONTAINS(features, ?)').join(' AND ');
      query += ` AND ${featureConditions}`;
      filters.features.forEach(feature => {
        params.push(JSON.stringify(feature));
      });
    }

    // Location-based filtering (within radius)
    if (filters.latitude && filters.longitude && filters.radius) {
      query += ` AND (
        6371 * acos(
          cos(radians(?)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(latitude))
        )
      ) <= ?`;
      params.push(filters.latitude, filters.longitude, filters.latitude, filters.radius);
    }

    // Sorting
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'price_low':
          query += ' ORDER BY price_per_hour ASC';
          break;
        case 'price_high':
          query += ' ORDER BY price_per_hour DESC';
          break;
        case 'rating':
          query += ' ORDER BY rating DESC';
          break;
        case 'distance':
          if (filters.latitude && filters.longitude) {
            query += ` ORDER BY (
              6371 * acos(
                cos(radians(?)) * cos(radians(latitude)) * 
                cos(radians(longitude) - radians(?)) + 
                sin(radians(?)) * sin(radians(latitude))
              )
            ) ASC`;
            params.push(filters.latitude, filters.longitude, filters.latitude);
          }
          break;
        default:
          query += ' ORDER BY name ASC';
      }
    } else {
      query += ' ORDER BY name ASC';
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

    const [spots] = await db.execute(query, params);
    return spots.map(spot => new ParkingSpot(spot));
  }

  // Find parking spot by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(
      'SELECT * FROM parking_spots WHERE id = ? AND is_active = TRUE',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return new ParkingSpot(rows[0]);
  }

  // Create new parking spot
  static async create(spotData) {
    const db = getDatabase();
    const {
      name, address, latitude, longitude, total_spots,
      available_spots, price_per_hour, features, images
    } = spotData;

    const [result] = await db.execute(`
      INSERT INTO parking_spots 
      (name, address, latitude, longitude, total_spots, available_spots, price_per_hour, features, images)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, address, latitude, longitude, total_spots,
      available_spots || total_spots, price_per_hour,
      JSON.stringify(features || []), JSON.stringify(images || [])
    ]);

    return result.insertId;
  }

  // Update parking spot
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        if (key === 'features' || key === 'images') {
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
      `UPDATE parking_spots SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Refresh spot data
    const updatedSpot = await ParkingSpot.findById(this.id);
    Object.assign(this, updatedSpot);
  }

  // Update availability
  async updateAvailability(change) {
    const newAvailability = Math.max(0, Math.min(this.total_spots, this.available_spots + change));
    await this.update({ available_spots: newAvailability });
  }

  // Update availability by vehicle type
  async updateAvailabilityByVehicleType(vehicleType, change) {
    const db = getDatabase();
    let field;
    let maxSpots;
    
    switch (vehicleType) {
      case 'car':
        field = 'available_car_spots';
        maxSpots = this.car_spots;
        break;
      case 'bike':
        field = 'available_bike_spots';
        maxSpots = this.bike_spots;
        break;
      case 'truck':
        field = 'available_truck_spots';
        maxSpots = this.truck_spots;
        break;
      default:
        // Fallback to general availability
        return this.updateAvailability(change);
    }
    
    if (maxSpots > 0) {
      const currentAvailable = this[field] || 0;
      const newAvailability = Math.max(0, Math.min(maxSpots, currentAvailable + change));
      
      await db.execute(
        `UPDATE parking_spots SET ${field} = ? WHERE id = ?`,
        [newAvailability, this.id]
      );
      
      // Update the instance
      this[field] = newAvailability;
    }
  }

  // Get spot statistics
  async getStatistics() {
    const db = getDatabase();
    
    const [bookingStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        SUM(total_price) as total_revenue,
        AVG(duration) as avg_duration,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings
      FROM bookings 
      WHERE spot_id = ?
    `, [this.id]);

    const [reviewStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM reviews 
      WHERE spot_id = ?
    `, [this.id]);

    const [sensorStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_sensors,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_sensors,
        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_sensors,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_sensors
      FROM sensors 
      WHERE spot_id = ?
    `, [this.id]);

    return {
      booking_stats: bookingStats[0],
      review_stats: reviewStats[0],
      sensor_stats: sensorStats[0],
      utilization_rate: ((this.total_spots - this.available_spots) / this.total_spots * 100).toFixed(2)
    };
  }

  // Get recent bookings
  async getRecentBookings(limit = 10) {
    const db = getDatabase();
    
    const [bookings] = await db.execute(`
      SELECT b.*, u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.spot_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `, [this.id, limit]);

    return bookings;
  }

  // Get reviews
  async getReviews(limit = 10, offset = 0) {
    const db = getDatabase();
    
    const [reviews] = await db.execute(`
      SELECT r.*, u.name as user_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.spot_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [this.id, limit, offset]);

    return reviews;
  }

  // Get sensors
  async getSensors() {
    const db = getDatabase();
    
    const [sensors] = await db.execute(
      'SELECT * FROM sensors WHERE spot_id = ? ORDER BY sensor_type, created_at',
      [this.id]
    );

    return sensors;
  }

  // Search nearby spots
  static async findNearby(latitude, longitude, radius = 5, limit = 10) {
    const db = getDatabase();
    
    const [spots] = await db.execute(`
      SELECT *, (
        6371 * acos(
          cos(radians(?)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(latitude))
        )
      ) AS distance
      FROM parking_spots 
      WHERE is_active = TRUE
      HAVING distance <= ?
      ORDER BY distance ASC
      LIMIT ?
    `, [latitude, longitude, latitude, radius, limit]);

    return spots.map(spot => new ParkingSpot(spot));
  }

  // Get popular spots
  static async getPopular(limit = 10) {
    const db = getDatabase();
    
    const [spots] = await db.execute(`
      SELECT ps.*, COUNT(b.id) as booking_count
      FROM parking_spots ps
      LEFT JOIN bookings b ON ps.id = b.spot_id
      WHERE ps.is_active = TRUE
      GROUP BY ps.id
      ORDER BY booking_count DESC, ps.rating DESC
      LIMIT ?
    `, [limit]);

    return spots.map(spot => new ParkingSpot(spot));
  }

  // Get real-time slot availability
  async getRealTimeAvailability(date, vehicleType, timeSlot) {
    const db = getDatabase();
    
    // Get current availability for the spot
    const currentAvailability = {
      total_spots: this.total_spots,
      available_spots: this.available_spots,
      occupied_spots: this.total_spots - this.available_spots
    };

    // Get vehicle-specific breakdown
    const vehicleBreakdown = {
      car: {
        total: this.car_spots || 0,
        available: this.available_car_spots || 0,
        occupied: (this.car_spots || 0) - (this.available_car_spots || 0),
        price_per_hour: this.car_price_per_hour || this.price_per_hour
      },
      bike: {
        total: this.bike_spots || 0,
        available: this.available_bike_spots || 0,
        occupied: (this.bike_spots || 0) - (this.available_bike_spots || 0),
        price_per_hour: this.bike_price_per_hour || this.price_per_hour
      },
      truck: {
        total: this.truck_spots || 0,
        available: this.available_truck_spots || 0,
        occupied: (this.truck_spots || 0) - (this.available_truck_spots || 0),
        price_per_hour: this.truck_price_per_hour || this.price_per_hour
      }
    };

    // Get bookings for the specified date to calculate time slot availability
    let timeSlotAvailability = [];
    if (date) {
      const [bookings] = await db.execute(`
        SELECT 
          booking_time,
          end_time,
          vehicle_type,
          COUNT(*) as booked_count
        FROM bookings 
        WHERE spot_id = ? 
          AND booking_date = ? 
          AND status IN ('active', 'confirmed')
          ${vehicleType ? 'AND vehicle_type = ?' : ''}
        GROUP BY booking_time, end_time, vehicle_type
        ORDER BY booking_time
      `, vehicleType ? [this.id, date, vehicleType] : [this.id, date]);

      // Generate time slots from 6 AM to 11 PM
      const timeSlots = [];
      for (let hour = 6; hour <= 23; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        
        // Calculate how many spots are booked for this time slot
        const bookedForThisSlot = bookings.filter(booking => {
          const bookingStart = new Date(`2000-01-01T${booking.booking_time}`);
          const bookingEnd = new Date(`2000-01-01T${booking.end_time || booking.booking_time}`);
          const slotTime = new Date(`2000-01-01T${timeString}`);
          
          // Check if this time slot overlaps with any booking
          return slotTime >= bookingStart && slotTime < bookingEnd;
        }).reduce((total, booking) => total + booking.booked_count, 0);

        // Get available spots for this vehicle type
        let totalSlotsForVehicle = this.total_spots;
        if (vehicleType && vehicleBreakdown[vehicleType]) {
          totalSlotsForVehicle = vehicleBreakdown[vehicleType].total;
        }

        const availableForSlot = Math.max(0, totalSlotsForVehicle - bookedForThisSlot);
        
        timeSlots.push({
          time: timeString,
          time_label: `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`,
          available: availableForSlot > 0,
          available_count: availableForSlot,
          booked_count: bookedForThisSlot,
          total_count: totalSlotsForVehicle
        });
      }
      
      timeSlotAvailability = timeSlots;
    }

    // Get recent booking activity for trend analysis
    const [recentActivity] = await db.execute(`
      SELECT 
        DATE(created_at) as booking_date,
        COUNT(*) as bookings_count,
        AVG(duration) as avg_duration
      FROM bookings 
      WHERE spot_id = ? 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY booking_date DESC
    `, [this.id]);

    // Calculate occupancy trends
    const occupancyTrend = recentActivity.map(activity => ({
      date: activity.booking_date,
      bookings: activity.bookings_count,
      avg_duration: parseFloat(activity.avg_duration || 0),
      occupancy_rate: Math.min(100, (activity.bookings_count / this.total_spots) * 100)
    }));

    // Get current sensor data if available
    const [sensorData] = await db.execute(`
      SELECT 
        sensor_type,
        status,
        last_reading,
        updated_at
      FROM sensors 
      WHERE spot_id = ? 
        AND status = 'online'
      ORDER BY updated_at DESC
    `, [this.id]);

    return {
      spot_id: this.id,
      spot_name: this.name,
      total_spots: currentAvailability.total_spots,
      available_spots: currentAvailability.available_spots,
      occupied_spots: currentAvailability.occupied_spots,
      occupancy_rate: ((currentAvailability.occupied_spots / currentAvailability.total_spots) * 100).toFixed(1),
      vehicle_breakdown: vehicleBreakdown,
      time_slots: timeSlotAvailability,
      occupancy_trend: occupancyTrend,
      sensor_data: sensorData,
      last_updated: new Date().toISOString(),
      status: currentAvailability.available_spots > 0 ? 'available' : 'full'
    };
  }

  // Delete parking spot
  async delete() {
    const db = getDatabase();
    await this.update({ is_active: false }); // Soft delete
  }

  // Convert to JSON
  toJSON() {
    let parsedFeatures = [];
    let parsedImages = [];
    
    // Safely parse features
    if (this.features) {
      try {
        if (typeof this.features === 'string') {
          // Try to parse as JSON first
          try {
            parsedFeatures = JSON.parse(this.features);
          } catch (e) {
            // If JSON parsing fails, treat as comma-separated string
            parsedFeatures = this.features.split(',').map(f => f.trim()).filter(f => f);
          }
        } else if (Array.isArray(this.features)) {
          parsedFeatures = this.features;
        }
      } catch (error) {
        console.warn('Error parsing features for spot', this.id, ':', error.message);
        parsedFeatures = [];
      }
    }
    
    // Safely parse images
    if (this.images) {
      try {
        if (typeof this.images === 'string') {
          try {
            parsedImages = JSON.parse(this.images);
          } catch (e) {
            // If JSON parsing fails, treat as comma-separated string
            parsedImages = this.images.split(',').map(i => i.trim()).filter(i => i);
          }
        } else if (Array.isArray(this.images)) {
          parsedImages = this.images;
        }
      } catch (error) {
        console.warn('Error parsing images for spot', this.id, ':', error.message);
        parsedImages = [];
      }
    }
    
    return {
      ...this,
      features: parsedFeatures,
      images: parsedImages
    };
  }
}

module.exports = ParkingSpot;