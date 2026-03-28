-- Ezy-Parking Database Setup Script
-- Run this script in MySQL Workbench or MySQL Command Line

-- Create Database
CREATE DATABASE IF NOT EXISTS ezy_parking;
USE ezy_parking;

-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    role ENUM('user', 'admin', 'super_admin') DEFAULT 'user',
    current_latitude DECIMAL(10, 8) DEFAULT NULL,
    current_longitude DECIMAL(11, 8) DEFAULT NULL,
    location_updated_at TIMESTAMP NULL,
    location_permission BOOLEAN DEFAULT FALSE,
    location_permission_status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
    location_requested_at TIMESTAMP NULL,
    admin_approved_by INT DEFAULT NULL,
    admin_approved_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_location (current_latitude, current_longitude),
    INDEX idx_role (role),
    INDEX idx_location_permission (location_permission_status),
    FOREIGN KEY (admin_approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create Parking Spots Table
CREATE TABLE IF NOT EXISTS parking_spots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    total_spots INT NOT NULL DEFAULT 0,
    available_spots INT NOT NULL DEFAULT 0,
    price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    features JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_location (latitude, longitude),
    INDEX idx_availability (available_spots)
);

-- Create Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    spot_id INT NOT NULL,
    vehicle_number VARCHAR(20) NOT NULL,
    vehicle_color VARCHAR(20) NOT NULL,
    mobile_number VARCHAR(15) NOT NULL,
    duration INT NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NOT NULL,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
    INDEX idx_user_bookings (user_id),
    INDEX idx_spot_bookings (spot_id),
    INDEX idx_booking_status (status),
    INDEX idx_booking_time (booking_time)
);

-- Create Sensors Table
CREATE TABLE IF NOT EXISTS sensors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spot_id INT NOT NULL,
    sensor_type VARCHAR(50) NOT NULL DEFAULT 'occupancy',
    status ENUM('online', 'offline', 'maintenance') DEFAULT 'online',
    last_reading JSON,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
    INDEX idx_sensor_status (status),
    INDEX idx_sensor_update (last_update)
);

-- Insert Sample Parking Spots
INSERT INTO parking_spots (name, address, latitude, longitude, total_spots, available_spots, price_per_hour, features) VALUES
('Metro Mall Parking', 'Connaught Place, New Delhi', 28.6139, 77.2090, 150, 45, 50.00, '["CCTV", "Security", "EV Charging"]'),
('City Center Plaza', 'Karol Bagh, New Delhi', 28.6129, 77.2295, 200, 12, 40.00, '["24/7 Access", "Valet Service"]'),
('Green Park Complex', 'Green Park, New Delhi', 28.5594, 77.2069, 80, 0, 60.00, '["Premium Location", "Covered Parking"]'),
('Tech Hub Parking', 'Rajouri Garden, New Delhi', 28.6304, 77.2177, 120, 78, 35.00, '["Tech Park", "Cafeteria"]'),
('Mall Road Parking', 'Mall Road, Delhi', 28.6667, 77.2167, 100, 25, 45.00, '["Shopping Mall", "Food Court"]'),
('Airport Parking', 'IGI Airport, Delhi', 28.5562, 77.1000, 500, 150, 80.00, '["Airport", "Long Term", "Shuttle Service"]');

-- Insert Sample Sensors
INSERT INTO sensors (spot_id, sensor_type, status, last_reading) VALUES
(1, 'occupancy', 'online', '{"temperature": 25.5, "humidity": 45.2, "occupancy": 70}'),
(1, 'environment', 'online', '{"air_quality": 85, "noise_level": 45}'),
(2, 'occupancy', 'online', '{"temperature": 26.1, "humidity": 48.7, "occupancy": 94}'),
(2, 'security', 'online', '{"camera_status": "active", "motion_detected": false}'),
(3, 'occupancy', 'maintenance', '{"temperature": 24.8, "humidity": 42.1, "occupancy": 100}'),
(4, 'occupancy', 'online', '{"temperature": 25.9, "humidity": 46.3, "occupancy": 35}'),
(4, 'environment', 'online', '{"air_quality": 92, "noise_level": 38}'),
(5, 'occupancy', 'online', '{"temperature": 25.2, "humidity": 44.8, "occupancy": 75}'),
(6, 'occupancy', 'online', '{"temperature": 26.5, "humidity": 50.1, "occupancy": 30}'),
(6, 'security', 'offline', '{"camera_status": "inactive", "motion_detected": false}');

-- Create Demo User (Password: Demo123!)
-- Note: In production, passwords should be hashed using bcrypt
INSERT INTO users (name, email, password, phone) VALUES
('Demo User', 'demo@ezyparking.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3QJgusgqHG', '+91 9876543210');

-- Create Views for Analytics
CREATE VIEW booking_analytics AS
SELECT 
    DATE(booking_time) as booking_date,
    COUNT(*) as total_bookings,
    SUM(total_price) as total_revenue,
    AVG(duration) as avg_duration,
    COUNT(DISTINCT user_id) as unique_users
FROM bookings 
GROUP BY DATE(booking_time)
ORDER BY booking_date DESC;

CREATE VIEW spot_utilization AS
SELECT 
    ps.id,
    ps.name,
    ps.total_spots,
    ps.available_spots,
    ROUND(((ps.total_spots - ps.available_spots) / ps.total_spots) * 100, 2) as utilization_percentage,
    COUNT(b.id) as total_bookings,
    SUM(b.total_price) as total_revenue
FROM parking_spots ps
LEFT JOIN bookings b ON ps.id = b.spot_id
GROUP BY ps.id, ps.name, ps.total_spots, ps.available_spots;

-- Create Indexes for Performance
CREATE INDEX idx_bookings_date ON bookings(DATE(booking_time));
CREATE INDEX idx_users_created ON users(created_at);
CREATE INDEX idx_spots_price ON parking_spots(price_per_hour);

-- Show Database Structure
SHOW TABLES;

-- Display Sample Data
SELECT 'Users Table:' as Info;
SELECT id, name, email, phone, created_at FROM users LIMIT 5;

-- Create Admin Activity Logs Table
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    action_type ENUM('location_permission', 'parking_spot_create', 'parking_spot_update', 'user_management', 'booking_management') NOT NULL,
    target_type ENUM('user', 'parking_spot', 'booking') NOT NULL,
    target_id INT NOT NULL,
    action_details JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_id (admin_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create Location Permission Requests Table
CREATE TABLE IF NOT EXISTS location_permission_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    request_reason TEXT,
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    device_info JSON,
    status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
    admin_id INT DEFAULT NULL,
    admin_notes TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_requested_at (requested_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create Real-time Parking Updates Table
CREATE TABLE IF NOT EXISTS parking_real_time_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spot_id INT NOT NULL,
    admin_id INT NOT NULL,
    update_type ENUM('availability', 'pricing', 'features', 'status') NOT NULL,
    old_value JSON,
    new_value JSON,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_spot_id (spot_id),
    INDEX idx_admin_id (admin_id),
    INDEX idx_update_type (update_type),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (spot_id) REFERENCES parking_spots(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create default admin user
INSERT IGNORE INTO users (name, email, password, phone, role) VALUES 
('Admin User', 'admin@ezyparking.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq9w5KS', '+91-9999999999', 'admin');

SELECT 'Parking Spots:' as Info;
SELECT id, name, address, total_spots, available_spots, price_per_hour FROM parking_spots;

SELECT 'Sensors Status:' as Info;
SELECT s.id, ps.name as spot_name, s.sensor_type, s.status, s.last_update 
FROM sensors s 
JOIN parking_spots ps ON s.spot_id = ps.id;

-- Success Message
SELECT 'Database setup completed successfully!' as Status;