// This script can be run independently to verify database status and apply schema
import { ensureDatabase } from './ensure-database.js';

// Execute the check
(async () => {
  console.log('Running database check...');
  
  try {
    const success = await ensureDatabase();
    
    if (success) {
      console.log('✅ Database is properly configured and tables are ready.');
      console.log('✅ Your application will use persistent database storage.');
      process.exit(0);
    } else {
      console.log('⚠️ Database check completed with issues.');
      console.log('⚠️ Your application will use in-memory storage (data will be lost on restart).');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error during database check:', error);
    console.error('❌ Application will use in-memory storage.');
    process.exit(1);
  }
})();