const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '9880',
  database: process.env.DB_NAME || 'ezy_parking',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

// Initialize database connection
async function initializeDatabase() {
  try {
    console.log('🔄 Connecting to MySQL database...');
    
    // First connect without database to create it
    const tempConfig = { ...dbConfig };
    delete tempConfig.database;
    
    const tempConnection = await mysql.createConnection(tempConfig);
    
    // Create database if it doesn't exist
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await tempConnection.end();
    
    // Now create pool with database
    db = mysql.createPool(dbConfig);
    
    // Test connection
    const connection = await db.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    
    // Create tables
    await createTables();
    
    // Run migrations
    await runMigrations();
    
    console.log('✅ Database initialization completed');
    return db;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

// Create database tables
async function createTables() {
  try {
    console.log('📋 Creating database tables...');
    
    // Users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(15),
        avatar VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_created (created_at)
      )
    `);

    // Parking spots table
    await db.query(`
      CREATE TABLE IF NOT EXISTS parking_spots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        total_spots INT NOT NULL DEFAULT 0,
        available_spots INT NOT NULL DEFAULT 0,
        car_spots INT NOT NULL DEFAULT 0,
        available_car_spots INT NOT NULL DEFAULT 0,
        bike_spots INT NOT NULL DEFAULT 0,
        available_bike_spots INT NOT NULL DEFAULT 0,
        truck_spots INT NOT NULL DEFAULT 0,
        available_truck_spots INT NOT NULL DEFAULT 0,
        price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        car_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        bike_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        truck_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        features JSON,
        images JSON,
        rating DECIMAL(3, 2) DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_location (latitude, longitude),
        INDEX idx_availability (available_spots),
        INDEX idx_car_availability (available_car_spots),
        INDEX idx_bike_availability (available_bike_spots),
        INDEX idx_price (price_per_hour),
        INDEX idx_rating (rating)
      )
    `);

    // Bookings table
    await db.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_ref VARCHAR(20) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        spot_id INT NOT NULL,
        vehicle_number VARCHAR(20) NOT NULL,
        vehicle_color VARCHAR(20) NOT NULL,
        vehicle_type ENUM('car', 'bike', 'truck', 'other') DEFAULT 'car',
        mobile_number VARCHAR(15) NOT NULL,
        duration INT NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        start_time TIMESTAMP NULL,
        end_time TIMESTAMP NOT NULL,
        actual_end_time TIMESTAMP NULL,
        status ENUM('pending', 'active', 'completed', 'cancelled', 'expired') DEFAULT 'pending',
        payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
        payment_method VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
        INDEX idx_user_bookings (user_id),
        INDEX idx_spot_bookings (spot_id),
        INDEX idx_booking_status (status),
        INDEX idx_booking_time (booking_time),
        INDEX idx_booking_ref (booking_ref)
      )
    `);

    // Sensors table
    await db.query(`
      CREATE TABLE IF NOT EXISTS sensors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sensor_id VARCHAR(50) UNIQUE NOT NULL,
        spot_id INT NOT NULL,
        sensor_type ENUM('occupancy', 'environment', 'security', 'payment') DEFAULT 'occupancy',
        status ENUM('online', 'offline', 'maintenance', 'error') DEFAULT 'online',
        last_reading JSON,
        battery_level INT DEFAULT 100,
        signal_strength INT DEFAULT 100,
        last_maintenance TIMESTAMP NULL,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
        INDEX idx_sensor_status (status),
        INDEX idx_sensor_type (sensor_type),
        INDEX idx_sensor_update (last_update)
      )
    `);

    // Payments table
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id VARCHAR(100) UNIQUE NOT NULL,
        booking_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        payment_method VARCHAR(50) NOT NULL,
        payment_gateway VARCHAR(50),
        transaction_id VARCHAR(100),
        status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded') DEFAULT 'pending',
        gateway_response JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_payment_status (status),
        INDEX idx_payment_method (payment_method),
        INDEX idx_user_payments (user_id)
      )
    `);

    // Reviews table
    await db.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        spot_id INT NOT NULL,
        booking_id INT,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        images JSON,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        INDEX idx_spot_reviews (spot_id),
        INDEX idx_user_reviews (user_id),
        INDEX idx_rating (rating)
      )
    `);

    // Notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'success', 'warning', 'error', 'booking', 'payment', 'system') DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        action_url VARCHAR(500),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_notifications (user_id),
        INDEX idx_notification_type (type),
        INDEX idx_read_status (is_read)
      )
    `);

    // System logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        level ENUM('info', 'warning', 'error', 'debug') DEFAULT 'info',
        message TEXT NOT NULL,
        module VARCHAR(100),
        user_id INT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_log_level (level),
        INDEX idx_log_module (module),
        INDEX idx_log_time (created_at)
      )
    `);

    console.log('✅ All tables created successfully');
    
    // Insert sample data
    await insertSampleData();
    
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  }
}

// Insert sample data
async function insertSampleData() {
  try {
    console.log('📊 Inserting sample data...');
    
    // Check if data already exists
    const [existingSpots] = await db.query('SELECT COUNT(*) as count FROM parking_spots');
    if (existingSpots[0].count > 0) {
      console.log('ℹ️ Sample data already exists, skipping insertion');
      return;
    }

    // Insert sample parking spots
    const sampleSpots = [
      {
        name: 'Metro Mall Parking',
        address: 'Connaught Place, New Delhi, 110001',
        latitude: 28.6139,
        longitude: 77.2090,
        total_spots: 150,
        available_spots: 45,
        car_spots: 100,
        available_car_spots: 30,
        bike_spots: 40,
        available_bike_spots: 12,
        truck_spots: 10,
        available_truck_spots: 3,
        price_per_hour: 50.00,
        car_price_per_hour: 50.00,
        bike_price_per_hour: 20.00,
        truck_price_per_hour: 100.00,
        features: JSON.stringify(['CCTV', 'Security', 'EV Charging', '24/7 Access']),
        images: JSON.stringify(['metro-mall-1.jpg', 'metro-mall-2.jpg']),
        rating: 4.5
      },
      {
        name: 'City Center Plaza',
        address: 'Karol Bagh, New Delhi, 110005',
        latitude: 28.6129,
        longitude: 77.2295,
        total_spots: 200,
        available_spots: 12,
        car_spots: 120,
        available_car_spots: 8,
        bike_spots: 60,
        available_bike_spots: 4,
        truck_spots: 20,
        available_truck_spots: 0,
        price_per_hour: 40.00,
        car_price_per_hour: 40.00,
        bike_price_per_hour: 15.00,
        truck_price_per_hour: 80.00,
        features: JSON.stringify(['24/7 Access', 'Valet Service', 'Car Wash']),
        images: JSON.stringify(['city-center-1.jpg', 'city-center-2.jpg']),
        rating: 4.2
      },
      {
        name: 'Green Park Complex',
        address: 'Green Park, New Delhi, 110016',
        latitude: 28.5594,
        longitude: 77.2069,
        total_spots: 80,
        available_spots: 0,
        car_spots: 60,
        available_car_spots: 0,
        bike_spots: 20,
        available_bike_spots: 0,
        truck_spots: 0,
        available_truck_spots: 0,
        price_per_hour: 60.00,
        car_price_per_hour: 60.00,
        bike_price_per_hour: 25.00,
        truck_price_per_hour: 0.00,
        features: JSON.stringify(['Premium Location', 'Covered Parking', 'Security']),
        images: JSON.stringify(['green-park-1.jpg']),
        rating: 4.8
      },
      {
        name: 'Tech Hub Parking',
        address: 'Rajouri Garden, New Delhi, 110027',
        latitude: 28.6304,
        longitude: 77.2177,
        total_spots: 120,
        available_spots: 78,
        car_spots: 80,
        available_car_spots: 50,
        bike_spots: 30,
        available_bike_spots: 20,
        truck_spots: 10,
        available_truck_spots: 8,
        price_per_hour: 35.00,
        car_price_per_hour: 35.00,
        bike_price_per_hour: 12.00,
        truck_price_per_hour: 70.00,
        features: JSON.stringify(['Tech Park', 'Cafeteria', 'WiFi', 'EV Charging']),
        images: JSON.stringify(['tech-hub-1.jpg', 'tech-hub-2.jpg']),
        rating: 4.3
      },
      {
        name: 'Airport Express Parking',
        address: 'IGI Airport, New Delhi, 110037',
        latitude: 28.5562,
        longitude: 77.1000,
        total_spots: 500,
        available_spots: 150,
        car_spots: 300,
        available_car_spots: 80,
        bike_spots: 100,
        available_bike_spots: 40,
        truck_spots: 100,
        available_truck_spots: 30,
        price_per_hour: 80.00,
        car_price_per_hour: 80.00,
        bike_price_per_hour: 30.00,
        truck_price_per_hour: 150.00,
        features: JSON.stringify(['Airport', 'Long Term', 'Shuttle Service', 'Premium']),
        images: JSON.stringify(['airport-1.jpg', 'airport-2.jpg', 'airport-3.jpg']),
        rating: 4.6
      },
      {
        name: 'Mall Road Shopping Center',
        address: 'Mall Road, Delhi, 110007',
        latitude: 28.6667,
        longitude: 77.2167,
        total_spots: 100,
        available_spots: 25,
        car_spots: 70,
        available_car_spots: 15,
        bike_spots: 25,
        available_bike_spots: 8,
        truck_spots: 5,
        available_truck_spots: 2,
        price_per_hour: 45.00,
        car_price_per_hour: 45.00,
        bike_price_per_hour: 18.00,
        truck_price_per_hour: 90.00,
        features: JSON.stringify(['Shopping Mall', 'Food Court', 'Cinema', 'CCTV']),
        images: JSON.stringify(['mall-road-1.jpg']),
        rating: 4.1
      }
    ];

    for (const spot of sampleSpots) {
      await db.query(`
        INSERT INTO parking_spots (name, address, latitude, longitude, total_spots, available_spots, 
          car_spots, available_car_spots, bike_spots, available_bike_spots, truck_spots, available_truck_spots,
          price_per_hour, car_price_per_hour, bike_price_per_hour, truck_price_per_hour, features, images, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [spot.name, spot.address, spot.latitude, spot.longitude, spot.total_spots, spot.available_spots,
          spot.car_spots, spot.available_car_spots, spot.bike_spots, spot.available_bike_spots, 
          spot.truck_spots, spot.available_truck_spots, spot.price_per_hour, spot.car_price_per_hour, 
          spot.bike_price_per_hour, spot.truck_price_per_hour, spot.features, spot.images, spot.rating]);
    }

    // Insert sample sensors
    const sampleSensors = [
      { sensor_id: 'SENS_001', spot_id: 1, sensor_type: 'occupancy', status: 'online', last_reading: JSON.stringify({temperature: 25.5, humidity: 45.2, occupancy: 70, timestamp: new Date()}) },
      { sensor_id: 'SENS_002', spot_id: 1, sensor_type: 'environment', status: 'online', last_reading: JSON.stringify({air_quality: 85, noise_level: 45, timestamp: new Date()}) },
      { sensor_id: 'SENS_003', spot_id: 2, sensor_type: 'occupancy', status: 'online', last_reading: JSON.stringify({temperature: 26.1, humidity: 48.7, occupancy: 94, timestamp: new Date()}) },
      { sensor_id: 'SENS_004', spot_id: 2, sensor_type: 'security', status: 'online', last_reading: JSON.stringify({camera_status: 'active', motion_detected: false, timestamp: new Date()}) },
      { sensor_id: 'SENS_005', spot_id: 3, sensor_type: 'occupancy', status: 'maintenance', last_reading: JSON.stringify({temperature: 24.8, humidity: 42.1, occupancy: 100, timestamp: new Date()}) },
      { sensor_id: 'SENS_006', spot_id: 4, sensor_type: 'occupancy', status: 'online', last_reading: JSON.stringify({temperature: 25.9, humidity: 46.3, occupancy: 35, timestamp: new Date()}) },
      { sensor_id: 'SENS_007', spot_id: 5, sensor_type: 'occupancy', status: 'online', last_reading: JSON.stringify({temperature: 26.5, humidity: 50.1, occupancy: 30, timestamp: new Date()}) },
      { sensor_id: 'SENS_008', spot_id: 6, sensor_type: 'occupancy', status: 'online', last_reading: JSON.stringify({temperature: 25.2, humidity: 44.8, occupancy: 75, timestamp: new Date()}) }
    ];

    for (const sensor of sampleSensors) {
      await db.query(`
        INSERT INTO sensors (sensor_id, spot_id, sensor_type, status, last_reading)
        VALUES (?, ?, ?, ?, ?)
      `, [sensor.sensor_id, sensor.spot_id, sensor.sensor_type, sensor.status, sensor.last_reading]);
    }

    console.log('✅ Sample data inserted successfully');
    
  } catch (error) {
    console.error('❌ Error inserting sample data:', error.message);
    // Don't throw error here, as sample data is not critical
  }
}

// Run database migrations
async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    
    // Check if migrations table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add vehicle-specific columns migration
    const [existingMigration] = await db.query(
      'SELECT * FROM migrations WHERE name = ?',
      ['001_add_vehicle_columns']
    );
    
    if (existingMigration.length === 0) {
      // Check if columns exist and add them one by one
      const columnsToAdd = [
        'car_spots INT NOT NULL DEFAULT 0',
        'available_car_spots INT NOT NULL DEFAULT 0',
        'bike_spots INT NOT NULL DEFAULT 0',
        'available_bike_spots INT NOT NULL DEFAULT 0',
        'truck_spots INT NOT NULL DEFAULT 0',
        'available_truck_spots INT NOT NULL DEFAULT 0',
        'car_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00',
        'bike_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00',
        'truck_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00'
      ];
      
      for (const column of columnsToAdd) {
        const columnName = column.split(' ')[0];
        try {
          // Check if column exists
          const [columns] = await db.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'parking_spots' AND COLUMN_NAME = ?
          `, [dbConfig.database, columnName]);
          
          if (columns.length === 0) {
            await db.query(`ALTER TABLE parking_spots ADD COLUMN ${column}`);
            console.log(`✅ Added column: ${columnName}`);
          }
        } catch (error) {
          console.log(`⚠️ Column ${columnName} might already exist or error: ${error.message}`);
        }
      }
      
      // Update existing data with sample vehicle-specific values
      await db.query(`
        UPDATE parking_spots SET 
          car_spots = CASE WHEN car_spots = 0 THEN FLOOR(total_spots * 0.6) ELSE car_spots END,
          available_car_spots = CASE WHEN available_car_spots = 0 THEN FLOOR(available_spots * 0.6) ELSE available_car_spots END,
          bike_spots = CASE WHEN bike_spots = 0 THEN FLOOR(total_spots * 0.3) ELSE bike_spots END,
          available_bike_spots = CASE WHEN available_bike_spots = 0 THEN FLOOR(available_spots * 0.3) ELSE available_bike_spots END,
          truck_spots = CASE WHEN truck_spots = 0 THEN FLOOR(total_spots * 0.1) ELSE truck_spots END,
          available_truck_spots = CASE WHEN available_truck_spots = 0 THEN FLOOR(available_spots * 0.1) ELSE available_truck_spots END,
          car_price_per_hour = CASE WHEN car_price_per_hour = 0 THEN price_per_hour ELSE car_price_per_hour END,
          bike_price_per_hour = CASE WHEN bike_price_per_hour = 0 THEN FLOOR(price_per_hour * 0.4) ELSE bike_price_per_hour END,
          truck_price_per_hour = CASE WHEN truck_price_per_hour = 0 THEN FLOOR(price_per_hour * 2) ELSE truck_price_per_hour END
      `);
      
      // Record migration
      await db.query(
        'INSERT INTO migrations (name) VALUES (?)',
        ['001_add_vehicle_columns']
      );
      
      console.log('✅ Migration completed: Vehicle-specific columns added');
    }
    
    console.log('✅ All migrations completed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    // Don't throw error here, as migrations are not critical for basic functionality
  }
}

// Get database connection
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

// Close database connection
async function closeDatabase() {
  if (db) {
    await db.end();
    console.log('🔌 Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase
};