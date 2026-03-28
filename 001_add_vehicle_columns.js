const { getDatabase } = require('../config/database');

async function migrateVehicleColumns() {
  const db = getDatabase();
  
  try {
    console.log('🔄 Running migration: Add vehicle-specific columns...');
    
    // Add new columns for vehicle-specific spots
    await db.query(`
      ALTER TABLE parking_spots 
      ADD COLUMN IF NOT EXISTS car_spots INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS available_car_spots INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bike_spots INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS available_bike_spots INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS truck_spots INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS available_truck_spots INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS car_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS bike_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS truck_price_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00
    `);
    
    // Update existing data with sample vehicle-specific values
    await db.query(`
      UPDATE parking_spots SET 
        car_spots = FLOOR(total_spots * 0.6),
        available_car_spots = FLOOR(available_spots * 0.6),
        bike_spots = FLOOR(total_spots * 0.3),
        available_bike_spots = FLOOR(available_spots * 0.3),
        truck_spots = FLOOR(total_spots * 0.1),
        available_truck_spots = FLOOR(available_spots * 0.1),
        car_price_per_hour = price_per_hour,
        bike_price_per_hour = FLOOR(price_per_hour * 0.4),
        truck_price_per_hour = FLOOR(price_per_hour * 2)
      WHERE car_spots = 0 AND bike_spots = 0 AND truck_spots = 0
    `);
    
    console.log('✅ Migration completed: Vehicle-specific columns added');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

module.exports = { migrateVehicleColumns };