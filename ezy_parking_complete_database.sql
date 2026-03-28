-- ============================================================================
-- EZY-PARKING COMPLETE DATABASE SCHEMA
-- Database Name: ezy_parking
-- Version: 2.0 (LocalStorage to MySQL Migration)
-- ============================================================================

-- Create database
CREATE DATABASE IF NOT EXISTS ezy_parking;
USE ezy_parking;

-- ============================================================================
-- CORE APPLICATION TABLES
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  avatar VARCHAR(255),
  is_verified BOOLEAN DEFAULT FALSE,
  role ENUM('user', 'admin', 'super_admin') DEFAULT 'user',
  location_permission_status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_location_permission (location_permission_status),
  INDEX idx_created (created_at)
);

-- Parking spots table
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
);

-- Bookings table
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
  INDEX idx_booking_ref (booking_ref),
  INDEX idx_time_range (start_time, end_time)
);

-- Sensors table
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
);

-- Payments table
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
);

-- Reviews table
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
);

-- Notifications table
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
);

-- Admin logs table
CREATE TABLE IF NOT EXISTS admin_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_type ENUM('user', 'booking', 'parking_spot', 'system') NOT NULL,
  target_id INT,
  details JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_admin_logs (admin_id),
  INDEX idx_action_type (action),
  INDEX idx_target (target_type, target_id),
  INDEX idx_log_date (created_at)
);

-- Booking extensions table
CREATE TABLE IF NOT EXISTS booking_extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  user_id INT NOT NULL,
  original_end_time TIMESTAMP NOT NULL,
  new_end_time TIMESTAMP NOT NULL,
  extended_duration INT NOT NULL,
  additional_amount DECIMAL(10, 2) NOT NULL,
  payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
  payment_method VARCHAR(50),
  transaction_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_booking_extensions (booking_id),
  INDEX idx_user_extensions (user_id),
  INDEX idx_payment_status (payment_status)
);

-- System logs table
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
);

-- ============================================================================
-- LOCALSTORAGE TO MYSQL MIGRATION TABLES
-- ============================================================================

-- User sessions table (Replace localStorage auth tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  device_info JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_token (session_token),
  INDEX idx_user_sessions (user_id, is_active),
  INDEX idx_session_expiry (expires_at, is_active)
);

-- User preferences table (Replace localStorage settings)
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  preference_key VARCHAR(100) NOT NULL,
  preference_value JSON,
  category VARCHAR(50) DEFAULT 'general',
  is_encrypted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_preference (user_id, preference_key),
  INDEX idx_user_prefs (user_id, category)
);

-- Search history table (Replace localStorage search data)
CREATE TABLE IF NOT EXISTS search_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  search_query VARCHAR(255) NOT NULL,
  search_type ENUM('location', 'parking_spot', 'vehicle', 'general') DEFAULT 'general',
  search_filters JSON,
  results_count INT DEFAULT 0,
  selected_result_id INT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_search_user (user_id),
  INDEX idx_search_query (search_query),
  INDEX idx_search_type (search_type),
  INDEX idx_search_date (created_at)
);

-- User devices table (Replace localStorage device info)
CREATE TABLE IF NOT EXISTS user_devices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  device_type ENUM('mobile', 'tablet', 'desktop', 'unknown') DEFAULT 'unknown',
  browser_name VARCHAR(50),
  browser_version VARCHAR(20),
  os_name VARCHAR(50),
  os_version VARCHAR(20),
  screen_resolution VARCHAR(20),
  timezone VARCHAR(50),
  language VARCHAR(10),
  is_trusted BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP,
  login_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_device_user (user_id),
  INDEX idx_device_id (device_id),
  INDEX idx_device_trusted (is_trusted)
);

-- Booking cart table (Replace localStorage cart data)
CREATE TABLE IF NOT EXISTS booking_cart (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  session_id VARCHAR(255),
  spot_id INT NOT NULL,
  vehicle_type ENUM('car', 'bike', 'truck') DEFAULT 'car',
  duration DECIMAL(4,2) NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  preferences JSON,
  estimated_price DECIMAL(10,2),
  is_saved BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
  INDEX idx_cart_user (user_id),
  INDEX idx_cart_session (session_id),
  INDEX idx_cart_expiry (expires_at)
);

-- Location history table (Replace localStorage location data)
CREATE TABLE IF NOT EXISTS location_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  session_id VARCHAR(255),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  accuracy DECIMAL(8,2),
  location_type ENUM('current', 'search', 'booking', 'favorite') DEFAULT 'current',
  is_favorite BOOLEAN DEFAULT FALSE,
  nickname VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_location_user (user_id),
  INDEX idx_location_coords (latitude, longitude),
  INDEX idx_location_type (location_type),
  INDEX idx_location_favorites (user_id, is_favorite)
);

-- UI state table (Replace localStorage UI preferences)
CREATE TABLE IF NOT EXISTS ui_state (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  session_id VARCHAR(255),
  component_name VARCHAR(100) NOT NULL,
  state_data JSON NOT NULL,
  is_persistent BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_component (user_id, component_name),
  INDEX idx_ui_user (user_id),
  INDEX idx_ui_session (session_id),
  INDEX idx_ui_component (component_name)
);

-- User analytics table (Replace localStorage analytics data)
CREATE TABLE IF NOT EXISTS user_analytics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  session_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  event_data JSON,
  page_url VARCHAR(500),
  referrer VARCHAR(500),
  user_agent TEXT,
  ip_address VARCHAR(45),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_analytics_user (user_id),
  INDEX idx_analytics_event (event_type),
  INDEX idx_analytics_timestamp (timestamp),
  INDEX idx_analytics_session (session_id)
);

-- Form backup table (Replace localStorage form data)
CREATE TABLE IF NOT EXISTS form_backup (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  session_id VARCHAR(255),
  form_name VARCHAR(100) NOT NULL,
  form_data JSON NOT NULL,
  step_number INT DEFAULT 1,
  is_completed BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_form (user_id, form_name),
  INDEX idx_form_user (user_id),
  INDEX idx_form_session (session_id),
  INDEX idx_form_expiry (expires_at)
);

-- User vehicles table (Replace localStorage vehicle data)
CREATE TABLE IF NOT EXISTS user_vehicles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL,
  vehicle_color VARCHAR(30),
  vehicle_type ENUM('car', 'bike', 'truck') DEFAULT 'car',
  vehicle_model VARCHAR(100),
  vehicle_brand VARCHAR(50),
  is_primary BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  insurance_expiry DATE,
  registration_expiry DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_vehicle_number (vehicle_number),
  INDEX idx_vehicle_user (user_id),
  INDEX idx_vehicle_primary (user_id, is_primary)
);

-- Migrations table
CREATE TABLE IF NOT EXISTS migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STORED PROCEDURES FOR DATABASE OPERATIONS
-- ============================================================================

-- Save user preference procedure
DROP PROCEDURE IF EXISTS SaveUserPreference;
DELIMITER //
CREATE PROCEDURE SaveUserPreference(
  IN p_user_id INT,
  IN p_key VARCHAR(100),
  IN p_value JSON,
  IN p_category VARCHAR(50)
)
BEGIN
  INSERT INTO user_preferences (user_id, preference_key, preference_value, category)
  VALUES (p_user_id, p_key, p_value, p_category)
  ON DUPLICATE KEY UPDATE
    preference_value = p_value,
    category = p_category,
    updated_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;

-- Get user preferences procedure
DROP PROCEDURE IF EXISTS GetUserPreferences;
DELIMITER //
CREATE PROCEDURE GetUserPreferences(IN p_user_id INT)
BEGIN
  SELECT preference_key, preference_value, category, updated_at
  FROM user_preferences
  WHERE user_id = p_user_id
  ORDER BY category, preference_key;
END //
DELIMITER ;

-- Save UI state procedure
DROP PROCEDURE IF EXISTS SaveUIState;
DELIMITER //
CREATE PROCEDURE SaveUIState(
  IN p_user_id INT,
  IN p_session_id VARCHAR(255),
  IN p_component VARCHAR(100),
  IN p_state JSON,
  IN p_persistent BOOLEAN
)
BEGIN
  INSERT INTO ui_state (user_id, session_id, component_name, state_data, is_persistent)
  VALUES (p_user_id, p_session_id, p_component, p_state, p_persistent)
  ON DUPLICATE KEY UPDATE
    state_data = p_state,
    session_id = p_session_id,
    is_persistent = p_persistent,
    updated_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active bookings view
CREATE OR REPLACE VIEW active_bookings AS
SELECT 
  b.id,
  b.booking_ref,
  b.user_id,
  u.name as user_name,
  u.email as user_email,
  b.spot_id,
  ps.name as spot_name,
  ps.address as spot_address,
  b.vehicle_number,
  b.vehicle_type,
  b.status,
  b.start_time,
  b.end_time,
  b.total_price,
  b.created_at
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN parking_spots ps ON b.spot_id = ps.id
WHERE b.status IN ('active', 'pending');

-- Parking spot availability view
CREATE OR REPLACE VIEW parking_availability AS
SELECT 
  ps.id,
  ps.name,
  ps.address,
  ps.latitude,
  ps.longitude,
  ps.total_spots,
  ps.available_spots,
  ps.car_spots,
  ps.available_car_spots,
  ps.bike_spots,
  ps.available_bike_spots,
  ps.truck_spots,
  ps.available_truck_spots,
  ps.price_per_hour,
  ps.car_price_per_hour,
  ps.bike_price_per_hour,
  ps.truck_price_per_hour,
  ps.rating,
  CASE 
    WHEN ps.available_spots = 0 THEN 'Full'
    WHEN ps.available_spots < (ps.total_spots * 0.2) THEN 'Almost Full'
    WHEN ps.available_spots < (ps.total_spots * 0.5) THEN 'Moderate'
    ELSE 'Available'
  END as availability_status
FROM parking_spots ps
WHERE ps.is_active = TRUE;

-- User dashboard stats view
CREATE OR REPLACE VIEW user_dashboard_stats AS
SELECT 
  u.id as user_id,
  u.name,
  u.email,
  COUNT(DISTINCT b.id) as total_bookings,
  COUNT(DISTINCT CASE WHEN b.status = 'active' THEN b.id END) as active_bookings,
  COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_bookings,
  COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.total_price END), 0) as total_spent,
  COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.duration END), 0) as total_hours,
  COUNT(DISTINCT v.id) as total_vehicles
FROM users u
LEFT JOIN bookings b ON u.id = b.user_id
LEFT JOIN user_vehicles v ON u.id = v.user_id
GROUP BY u.id, u.name, u.email;

-- ============================================================================
-- TRIGGERS FOR DATA INTEGRITY
-- ============================================================================

-- Update parking spot availability when booking is created
DROP TRIGGER IF EXISTS update_spot_availability_on_booking;
DELIMITER //
CREATE TRIGGER update_spot_availability_on_booking
AFTER INSERT ON bookings
FOR EACH ROW
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE parking_spots 
    SET 
      available_spots = available_spots - 1,
      available_car_spots = CASE 
        WHEN NEW.vehicle_type = 'car' THEN available_car_spots - 1 
        ELSE available_car_spots 
      END,
      available_bike_spots = CASE 
        WHEN NEW.vehicle_type = 'bike' THEN available_bike_spots - 1 
        ELSE available_bike_spots 
      END,
      available_truck_spots = CASE 
        WHEN NEW.vehicle_type = 'truck' THEN available_truck_spots - 1 
        ELSE available_truck_spots 
      END
    WHERE id = NEW.spot_id;
  END IF;
END //
DELIMITER ;

-- Update parking spot availability when booking status changes
DROP TRIGGER IF EXISTS update_spot_availability_on_booking_update;
DELIMITER //
CREATE TRIGGER update_spot_availability_on_booking_update
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  -- If booking becomes active, decrease availability
  IF OLD.status != 'active' AND NEW.status = 'active' THEN
    UPDATE parking_spots 
    SET 
      available_spots = available_spots - 1,
      available_car_spots = CASE 
        WHEN NEW.vehicle_type = 'car' THEN available_car_spots - 1 
        ELSE available_car_spots 
      END,
      available_bike_spots = CASE 
        WHEN NEW.vehicle_type = 'bike' THEN available_bike_spots - 1 
        ELSE available_bike_spots 
      END,
      available_truck_spots = CASE 
        WHEN NEW.vehicle_type = 'truck' THEN available_truck_spots - 1 
        ELSE available_truck_spots 
      END
    WHERE id = NEW.spot_id;
  END IF;
  
  -- If booking becomes inactive, increase availability
  IF OLD.status = 'active' AND NEW.status IN ('completed', 'cancelled') THEN
    UPDATE parking_spots 
    SET 
      available_spots = available_spots + 1,
      available_car_spots = CASE 
        WHEN NEW.vehicle_type = 'car' THEN available_car_spots + 1 
        ELSE available_car_spots 
      END,
      available_bike_spots = CASE 
        WHEN NEW.vehicle_type = 'bike' THEN available_bike_spots + 1 
        ELSE available_bike_spots 
      END,
      available_truck_spots = CASE 
        WHEN NEW.vehicle_type = 'truck' THEN available_truck_spots + 1 
        ELSE available_truck_spots 
      END
    WHERE id = NEW.spot_id;
  END IF;
END //
DELIMITER ;

-- ============================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Additional indexes for better query performance
CREATE INDEX idx_bookings_user_status ON bookings(user_id, status);
CREATE INDEX idx_bookings_spot_time ON bookings(spot_id, start_time, end_time);
CREATE INDEX idx_bookings_created_date ON bookings(DATE(created_at));
CREATE INDEX idx_payments_user_status ON payments(user_id, status);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_user_preferences_category ON user_preferences(category);
CREATE INDEX idx_search_history_user_type ON search_history(user_id, search_type);
CREATE INDEX idx_location_history_user_type ON location_history(user_id, location_type);

-- ============================================================================
-- DATABASE SETUP COMPLETE
-- ============================================================================

-- Insert initial migration record
INSERT IGNORE INTO migrations (name) VALUES ('001_initial_schema');
INSERT IGNORE INTO migrations (name) VALUES ('002_localstorage_migration_tables');
INSERT IGNORE INTO migrations (name) VALUES ('003_stored_procedures');
INSERT IGNORE INTO migrations (name) VALUES ('004_views_and_triggers');
INSERT IGNORE INTO migrations (name) VALUES ('005_performance_indexes');

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Database: ezy_parking
-- Tables Created: 20 (Core: 9, Migration: 10, System: 1)
-- Stored Procedures: 3
-- Views: 3
-- Triggers: 2
-- Indexes: Multiple for performance optimization
-- 
-- Features:
-- ✅ Complete parking management system
-- ✅ LocalStorage to MySQL migration support
-- ✅ User session management
-- ✅ Real-time booking tracking
-- ✅ Payment processing
-- ✅ Admin functionality
-- ✅ Analytics and reporting
-- ✅ Data integrity with triggers
-- ✅ Performance optimized with indexes
-- ============================================================================