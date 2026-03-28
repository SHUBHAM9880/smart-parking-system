const { getDatabase } = require('../config/database');

async function addUserLocationColumns() {
  const db = getDatabase();
  
  try {
    console.log('🔄 Adding location columns to users table...');
    
    // Add location columns to users table
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(10, 8) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(11, 8) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS location_permission BOOLEAN DEFAULT FALSE
    `);
    
    // Add index for location queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_location 
      ON users (current_latitude, current_longitude)
    `);
    
    console.log('✅ User location columns added successfully');
    
    return { success: true, message: 'User location columns added' };
  } catch (error) {
    console.error('❌ Failed to add user location columns:', error.message);
    throw error;
  }
}

module.exports = { addUserLocationColumns };

// Run migration if called directly
if (require.main === module) {
  addUserLocationColumns()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}