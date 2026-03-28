const { getDatabase } = require('../config/database');

async function addEmailVerificationColumns() {
  const db = getDatabase();
  
  try {
    console.log('🔄 Adding email verification columns...');
    
    // Check if columns already exist
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'ezy_parking' 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME IN ('is_verified', 'email_verified_at', 'email_verification_token', 'email_verification_expires')
    `);
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    
    // Add is_verified column if it doesn't exist
    if (!existingColumns.includes('is_verified')) {
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN is_verified BOOLEAN DEFAULT FALSE AFTER is_active
      `);
      console.log('✅ Added is_verified column');
    } else {
      console.log('ℹ️ is_verified column already exists');
    }
    
    // Add email_verified_at column if it doesn't exist
    if (!existingColumns.includes('email_verified_at')) {
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN email_verified_at TIMESTAMP NULL AFTER is_verified
      `);
      console.log('✅ Added email_verified_at column');
    } else {
      console.log('ℹ️ email_verified_at column already exists');
    }
    
    // Add email_verification_token column if it doesn't exist
    if (!existingColumns.includes('email_verification_token')) {
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN email_verification_token VARCHAR(255) NULL AFTER email_verified_at
      `);
      console.log('✅ Added email_verification_token column');
    } else {
      console.log('ℹ️ email_verification_token column already exists');
    }
    
    // Add email_verification_expires column if it doesn't exist
    if (!existingColumns.includes('email_verification_expires')) {
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN email_verification_expires TIMESTAMP NULL AFTER email_verification_token
      `);
      console.log('✅ Added email_verification_expires column');
    } else {
      console.log('ℹ️ email_verification_expires column already exists');
    }
    
    console.log('✅ Email verification columns migration completed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

module.exports = { addEmailVerificationColumns };

// Run migration if called directly
if (require.main === module) {
  const { initializeDatabase } = require('../config/database');
  
  initializeDatabase().then(() => {
    return addEmailVerificationColumns();
  }).then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}