const { getDatabase } = require('../config/database');

async function addBookingExtensions() {
  const db = getDatabase();
  
  try {
    console.log('🔄 Adding booking extensions table...');
    
    // Create booking_extensions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS booking_extensions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        booking_id INT NOT NULL,
        user_id INT NOT NULL,
        extend_hours DECIMAL(3,1) NOT NULL,
        extension_cost DECIMAL(10,2) NOT NULL,
        old_end_time TIME NOT NULL,
        new_end_time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_booking_extensions_booking_id (booking_id),
        INDEX idx_booking_extensions_user_id (user_id),
        INDEX idx_booking_extensions_created_at (created_at)
      )
    `);
    
    console.log('✅ Booking extensions table created successfully');
    
    // Add end_time column to bookings table if it doesn't exist
    try {
      await db.execute(`
        ALTER TABLE bookings 
        ADD COLUMN end_time TIME NULL AFTER booking_time
      `);
      console.log('✅ Added end_time column to bookings table');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ end_time column already exists in bookings table');
      } else {
        console.error('⚠️ Error adding end_time column:', error.message);
      }
    }
    
    // Update existing bookings to have end_time calculated from booking_time + duration
    await db.execute(`
      UPDATE bookings 
      SET end_time = ADDTIME(booking_time, SEC_TO_TIME(duration * 3600))
      WHERE end_time IS NULL AND booking_time IS NOT NULL AND duration IS NOT NULL
    `);
    
    console.log('✅ Updated existing bookings with calculated end times');
    
    return true;
  } catch (error) {
    console.error('❌ Error in booking extensions migration:', error);
    throw error;
  }
}

module.exports = { addBookingExtensions };