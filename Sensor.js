const { getDatabase } = require('../config/database');

class Sensor {
  constructor(data) {
    this.id = data.id;
    this.sensor_id = data.sensor_id;
    this.spot_id = data.spot_id;
    this.sensor_type = data.sensor_type;
    this.status = data.status;
    this.last_reading = data.last_reading;
    this.battery_level = data.battery_level;
    this.signal_strength = data.signal_strength;
    this.last_maintenance = data.last_maintenance;
    this.last_update = data.last_update;
    this.created_at = data.created_at;
  }

  // Create new sensor
  static async create(sensorData) {
    const db = getDatabase();
    const {
      sensor_id, spot_id, sensor_type, status, last_reading,
      battery_level, signal_strength
    } = sensorData;

    const [result] = await db.execute(`
      INSERT INTO sensors 
      (sensor_id, spot_id, sensor_type, status, last_reading, battery_level, signal_strength)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      sensor_id, spot_id, sensor_type, status || 'online',
      JSON.stringify(last_reading || {}), battery_level || 100, signal_strength || 100
    ]);

    return result.insertId;
  }

  // Find sensor by ID
  static async findById(id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT s.*, ps.name as spot_name, ps.address as spot_address
      FROM sensors s
      JOIN parking_spots ps ON s.spot_id = ps.id
      WHERE s.id = ?
    `, [id]);

    if (rows.length === 0) {
      return null;
    }

    return new Sensor(rows[0]);
  }

  // Find sensor by sensor_id
  static async findBySensorId(sensor_id) {
    const db = getDatabase();
    const [rows] = await db.execute(`
      SELECT s.*, ps.name as spot_name, ps.address as spot_address
      FROM sensors s
      JOIN parking_spots ps ON s.spot_id = ps.id
      WHERE s.sensor_id = ?
    `, [sensor_id]);

    if (rows.length === 0) {
      return null;
    }

    return new Sensor(rows[0]);
  }

  // Get sensors by spot
  static async getBySpotId(spot_id) {
    const db = getDatabase();
    const [sensors] = await db.execute(
      'SELECT * FROM sensors WHERE spot_id = ? ORDER BY sensor_type, created_at',
      [spot_id]
    );

    return sensors.map(sensor => new Sensor(sensor));
  }

  // Get all sensors with filters
  static async getAll(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT s.*, ps.name as spot_name, ps.address as spot_address
      FROM sensors s
      JOIN parking_spots ps ON s.spot_id = ps.id
      WHERE 1=1
    `;
    let params = [];

    // Apply filters
    if (filters.status) {
      query += ' AND s.status = ?';
      params.push(filters.status);
    }

    if (filters.sensor_type) {
      query += ' AND s.sensor_type = ?';
      params.push(filters.sensor_type);
    }

    if (filters.spot_id) {
      query += ' AND s.spot_id = ?';
      params.push(filters.spot_id);
    }

    if (filters.low_battery) {
      query += ' AND s.battery_level < ?';
      params.push(filters.low_battery || 20);
    }

    if (filters.weak_signal) {
      query += ' AND s.signal_strength < ?';
      params.push(filters.weak_signal || 30);
    }

    // Sorting
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'battery':
          query += ' ORDER BY s.battery_level ASC';
          break;
        case 'signal':
          query += ' ORDER BY s.signal_strength ASC';
          break;
        case 'last_update':
          query += ' ORDER BY s.last_update DESC';
          break;
        default:
          query += ' ORDER BY s.sensor_id ASC';
      }
    } else {
      query += ' ORDER BY s.sensor_id ASC';
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

    const [sensors] = await db.execute(query, params);
    return sensors.map(sensor => new Sensor(sensor));
  }

  // Update sensor
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        if (key === 'last_reading') {
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
      `UPDATE sensors SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Refresh sensor data
    const updatedSensor = await Sensor.findById(this.id);
    Object.assign(this, updatedSensor);
  }

  // Update sensor reading
  async updateReading(reading) {
    const updateData = {
      last_reading: reading,
      last_update: new Date()
    };

    // Update battery and signal if provided
    if (reading.battery_level !== undefined) {
      updateData.battery_level = reading.battery_level;
    }

    if (reading.signal_strength !== undefined) {
      updateData.signal_strength = reading.signal_strength;
    }

    await this.update(updateData);
  }

  // Set sensor status
  async setStatus(status) {
    await this.update({ status });
  }

  // Record maintenance
  async recordMaintenance() {
    await this.update({
      last_maintenance: new Date(),
      status: 'online',
      battery_level: 100
    });
  }

  // Get sensor statistics
  static async getStatistics() {
    const db = getDatabase();
    
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_sensors,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_sensors,
        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_sensors,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_sensors,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_sensors,
        COUNT(CASE WHEN battery_level < 20 THEN 1 END) as low_battery_sensors,
        COUNT(CASE WHEN signal_strength < 30 THEN 1 END) as weak_signal_sensors,
        AVG(battery_level) as avg_battery_level,
        AVG(signal_strength) as avg_signal_strength
      FROM sensors
    `);

    const [typeStats] = await db.execute(`
      SELECT 
        sensor_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_count
      FROM sensors
      GROUP BY sensor_type
    `);

    return {
      ...stats[0],
      by_type: typeStats
    };
  }

  // Get sensors needing attention
  static async getNeedingAttention() {
    const db = getDatabase();
    
    const [sensors] = await db.execute(`
      SELECT s.*, ps.name as spot_name, ps.address as spot_address
      FROM sensors s
      JOIN parking_spots ps ON s.spot_id = ps.id
      WHERE s.status IN ('offline', 'error', 'maintenance') 
         OR s.battery_level < 20 
         OR s.signal_strength < 30
         OR s.last_update < DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY 
        CASE s.status 
          WHEN 'error' THEN 1
          WHEN 'offline' THEN 2
          WHEN 'maintenance' THEN 3
          ELSE 4
        END,
        s.battery_level ASC,
        s.signal_strength ASC
    `);

    return sensors.map(sensor => new Sensor(sensor));
  }

  // Simulate sensor reading (for demo purposes)
  static generateMockReading(sensor_type) {
    const baseReading = {
      timestamp: new Date().toISOString(),
      battery_level: Math.floor(Math.random() * 40) + 60, // 60-100%
      signal_strength: Math.floor(Math.random() * 30) + 70 // 70-100%
    };

    switch (sensor_type) {
      case 'occupancy':
        return {
          ...baseReading,
          temperature: (Math.random() * 10 + 20).toFixed(1), // 20-30°C
          humidity: (Math.random() * 20 + 40).toFixed(1), // 40-60%
          occupancy: Math.floor(Math.random() * 101), // 0-100%
          vehicles_detected: Math.floor(Math.random() * 5)
        };

      case 'environment':
        return {
          ...baseReading,
          air_quality: Math.floor(Math.random() * 40) + 60, // 60-100
          noise_level: Math.floor(Math.random() * 30) + 30, // 30-60 dB
          light_level: Math.floor(Math.random() * 500) + 100, // 100-600 lux
          co2_level: Math.floor(Math.random() * 200) + 300 // 300-500 ppm
        };

      case 'security':
        return {
          ...baseReading,
          camera_status: Math.random() > 0.1 ? 'active' : 'inactive',
          motion_detected: Math.random() > 0.8,
          intrusion_alert: Math.random() > 0.95,
          last_motion: new Date(Date.now() - Math.random() * 3600000).toISOString()
        };

      case 'payment':
        return {
          ...baseReading,
          terminal_status: Math.random() > 0.05 ? 'online' : 'offline',
          cash_level: Math.floor(Math.random() * 80) + 20, // 20-100%
          card_reader_status: Math.random() > 0.02 ? 'working' : 'error',
          last_transaction: new Date(Date.now() - Math.random() * 7200000).toISOString()
        };

      default:
        return baseReading;
    }
  }

  // Bulk update sensor readings (for IoT integration)
  static async bulkUpdateReadings(readings) {
    const db = getDatabase();
    const promises = [];

    for (const reading of readings) {
      const { sensor_id, data } = reading;
      promises.push(
        db.execute(
          'UPDATE sensors SET last_reading = ?, last_update = NOW() WHERE sensor_id = ?',
          [JSON.stringify(data), sensor_id]
        )
      );
    }

    await Promise.all(promises);
  }

  // Delete sensor
  async delete() {
    const db = getDatabase();
    await db.execute('DELETE FROM sensors WHERE id = ?', [this.id]);
  }

  // Check if sensor needs maintenance
  needsMaintenance() {
    const lastMaintenance = this.last_maintenance ? new Date(this.last_maintenance) : null;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    return !lastMaintenance || lastMaintenance < thirtyDaysAgo || 
           this.battery_level < 20 || 
           this.signal_strength < 30 ||
           this.status === 'maintenance';
  }

  // Get health score (0-100)
  getHealthScore() {
    let score = 100;
    
    // Status penalties
    if (this.status === 'offline') score -= 50;
    else if (this.status === 'error') score -= 70;
    else if (this.status === 'maintenance') score -= 30;
    
    // Battery penalty
    if (this.battery_level < 20) score -= 20;
    else if (this.battery_level < 50) score -= 10;
    
    // Signal penalty
    if (this.signal_strength < 30) score -= 15;
    else if (this.signal_strength < 60) score -= 5;
    
    // Last update penalty
    const lastUpdate = new Date(this.last_update);
    const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    if (hoursAgo > 24) score -= 30;
    else if (hoursAgo > 6) score -= 15;
    else if (hoursAgo > 1) score -= 5;
    
    return Math.max(0, score);
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      last_reading: typeof this.last_reading === 'string' ? 
        JSON.parse(this.last_reading) : this.last_reading,
      needs_maintenance: this.needsMaintenance(),
      health_score: this.getHealthScore()
    };
  }
}

module.exports = Sensor;