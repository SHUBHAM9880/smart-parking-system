const { getDatabase } = require('../config/database');
const bcrypt = require('bcryptjs');

async function addAdminFunctionality() {
  const db = getDatabase();
  
  try {
    console.log('🔄 Adding admin functionality...');
    
    // Add admin columns to users table
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role ENUM('user', 'admin', 'super_admin') DEFAULT 'user' AFTER phone,
      ADD COLUMN IF NOT EXISTS location_permission_status ENUM('pending', 'approved', 'denied') DEFAULT 'pending' AFTER location_permission,
      ADD COLUMN IF NOT EXISTS location_requested_at TIMESTAMP NULL AFTER location_permission_status,
      ADD COLUMN IF NOT EXISTS admin_approved_by INT DEFAULT NULL AFTER location_requested_at,
      ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMP NULL AFTER admin_approved_by,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER admin_approved_at
    `);
    
    // Add foreign key constraint
    await db.query(`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS fk_admin_approved_by 
      FOREIGN KEY (admin_approved_by) REFERENCES users(id) ON DELETE SET NULL
    `);
    
    // Add indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_role ON users (role)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_location_permission_status ON users (location_permission_status)
    `);
    
    // Create admin activity logs table
    await db.query(`
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
      )
    `);
    
    // Create location permission requests table
    await db.query(`
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
      )
    `);
    
    // Create real-time parking updates table
    await db.query(`
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
      )
    `);
    
    // Create default admin user if not exists
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await db.query(`
      INSERT IGNORE INTO users (name, email, password, phone, role) VALUES 
      ('Admin User', 'admin@ezyparking.com', ?, '+91-9999999999', 'admin')
    `, [hashedPassword]);
    
    // Update existing users with approved location permission
    await db.query(`
      UPDATE users 
      SET location_permission_status = 'approved' 
      WHERE location_permission = TRUE AND location_permission_status = 'pending'
    `);
    
    console.log('✅ Admin functionality added successfully');
    console.log('📧 Default admin user created:');
    console.log('   Email: admin@ezyparking.com');
    console.log('   Password: admin123');
    console.log('   ⚠️  Please change the default password after first login!');
    
    return { success: true, message: 'Admin functionality added' };
  } catch (error) {
    console.error('❌ Failed to add admin functionality:', error.message);
    throw error;
  }
}

module.exports = { addAdminFunctionality };

// Run migration if called directly
if (require.main === module) {
  addAdminFunctionality()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}