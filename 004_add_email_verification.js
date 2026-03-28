const { getDatabase, initializeDatabase } = require('../config/database');

async function addEmailVerificationColumns() {
  // Initialize database first
  await initializeDatabase();
  
  const db = getDatabase();
  
  try {
    console.log('🔄 Adding email verification columns...');
    
    // Check if columns already exist
    const [columns] = await db.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME IN ('email_verification_token', 'email_verification_expires')
    `);
    
    if (columns.length === 0) {
      // Add email verification columns
      await db.execute(`
        ALTER TABLE users 
        ADD COLUMN email_verification_token VARCHAR(255) NULL,
        ADD COLUMN email_verification_expires DATETIME NULL,
        ADD COLUMN is_verified BOOLEAN DEFAULT FALSE
      `);
      
      console.log('✅ Email verification columns added successfully');
    } else {
      console.log('ℹ️ Email verification columns already exist');
    }
    
    console.log('✅ Email verification migration completed');
    
  } catch (error) {
    console.error('❌ Email verification migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addEmailVerificationColumns()
    .then(() => {
      console.log('✅ Email verification migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addEmailVerificationColumns };